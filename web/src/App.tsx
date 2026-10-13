import React, { useEffect, useState, useMemo } from 'react';
import {
  Heart,
  Server,
  RefreshCw,
  Layers,
  Activity,
  ShieldCheck,
  Info,
  AlertCircle,
} from 'lucide-react';
import type { VesselId, VesselData } from './types/viewer';
import { useAppStore } from './store/useAppStore';
import { api, ApiClientError } from './api/client';
import { PatientForm } from './components/PatientForm';
import { ResultCards } from './components/ResultCards';
import { DisclaimerBanner } from './components/DisclaimerBanner';

// Lazy-load the heavy components and 3D viewer for optimal bundle performance
const HeartViewer = React.lazy(() => import('./components/HeartViewer'));
const ExplanationPanel = React.lazy(() =>
  import('./components/ExplanationPanel').then((m) => ({ default: m.ExplanationPanel }))
);
const ValidationTab = React.lazy(() =>
  import('./components/ValidationTab').then((m) => ({ default: m.ValidationTab }))
);
const AboutTab = React.lazy(() =>
  import('./components/AboutTab').then((m) => ({ default: m.AboutTab }))
);

function HeartViewerFallback() {
  return (
    <div className="w-full h-[520px] rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col items-center justify-center gap-3 text-slate-400">
      <Heart className="w-10 h-10 text-rose-500/40 animate-pulse" />
      <div className="text-xs font-medium text-slate-300">
        Initializing 3D Cardiac Anatomy Engine...
      </div>
      <div className="text-[11px] text-slate-500">
        Loading WebGL Shaders & Anatomical Splines
      </div>
    </div>
  );
}

function ComponentFallback({ label }: { label: string }) {
  return (
    <div className="p-8 text-center text-xs text-slate-400 bg-slate-900 border border-slate-800 rounded-xl">
      Loading {label}...
    </div>
  );
}

export function App() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const setSchemaData = useAppStore((s) => s.setSchemaData);
  const setSamplePatients = useAppStore((s) => s.setSamplePatients);
  const prediction = useAppStore((s) => s.prediction);
  const patientInputs = useAppStore((s) => s.patientInputs);
  const selectedVessel = useAppStore((s) => s.selectedVessel);
  const setSelectedVessel = useAppStore((s) => s.setSelectedVessel);

  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'unreachable'>('checking');
  const [initError, setInitError] = useState<string | null>(null);

  const retryConnection = React.useCallback(async () => {
    setApiStatus('checking');
    setInitError(null);
    try {
      const [health, schema, samples] = await Promise.all([
        api.getHealth(),
        api.getSchema(),
        api.getSamplePatients(),
      ]);

      setApiStatus(health.status === 'ok' ? 'online' : 'unreachable');
      setSchemaData(schema);
      setSamplePatients(samples);
    } catch (err: unknown) {
      setApiStatus('unreachable');
      const msg =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Unable to connect to CardioMap 3D API';
      setInitError(msg);
    }
  }, [setSchemaData, setSamplePatients]);

  useEffect(() => {
    let ignore = false;
    async function init() {
      try {
        const [health, schema, samples] = await Promise.all([
          api.getHealth(),
          api.getSchema(),
          api.getSamplePatients(),
        ]);
        if (!ignore) {
          setApiStatus(health.status === 'ok' ? 'online' : 'unreachable');
          setSchemaData(schema);
          setSamplePatients(samples);
        }
      } catch (err: unknown) {
        if (!ignore) {
          setApiStatus('unreachable');
          const msg =
            err instanceof ApiClientError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Unable to connect to CardioMap 3D API';
          setInitError(msg);
        }
      }
    }
    void init();
    return () => {
      ignore = true;
    };
  }, [setSchemaData, setSamplePatients]);

  // Compute vessels prop for HeartViewer: null until predicted (viewer stays neutral gray)
  const vesselsProp = useMemo<Record<VesselId, VesselData>>(() => {
    if (!prediction) {
      return {
        lad: null,
        lcx: null,
        rca: null,
      };
    }

    return {
      lad: prediction.vessels.lad
        ? {
            probability: prediction.vessels.lad.probability,
            threshold: prediction.vessels.lad.threshold,
            highMargin: 0.15,
          }
        : null,
      lcx: prediction.vessels.lcx
        ? {
            probability: prediction.vessels.lcx.probability,
            threshold: prediction.vessels.lcx.threshold,
            highMargin: 0.15,
          }
        : null,
      rca: prediction.vessels.rca
        ? {
            probability: prediction.vessels.rca.probability,
            threshold: prediction.vessels.rca.threshold,
            highMargin: 0.15,
          }
        : null,
    };
  }, [prediction]);

  return (
    <div className="flex flex-col min-h-screen bg-[#070b13] text-slate-100 font-sans pb-12">
      {/* 1. HEADER NAVIGATION */}
      <header className="border-b border-slate-800 bg-[#0a101d]/90 backdrop-blur-lg px-6 py-3 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-sky-500 to-rose-500 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Heart className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">CardioMap 3D</h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                Decision Support
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Interactive 3D Coronary Artery Risk Mapping & Multi-Vessel Stenosis Predictor
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('patient')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition ${
              activeTab === 'patient'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            Patient Assessment
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('validation')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition ${
              activeTab === 'validation'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Model Validation
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('about')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition ${
              activeTab === 'about'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Info className="w-3.5 h-3.5" />
            About & Safety
          </button>
        </div>

        {/* API Health Status Indicator */}
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-900 border border-slate-800">
            <Server className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">API:</span>
            {apiStatus === 'online' ? (
              <span className="flex items-center gap-1.5 font-medium text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400" /> Online
              </span>
            ) : apiStatus === 'unreachable' ? (
              <button
                type="button"
                onClick={retryConnection}
                className="flex items-center gap-1.5 font-medium text-rose-400 hover:underline"
                title="Click to retry connecting to API"
              >
                <span className="w-2 h-2 rounded-full bg-rose-400" /> Unreachable (Retry)
              </button>
            ) : (
              <span className="flex items-center gap-1.5 font-medium text-amber-400">
                <RefreshCw className="w-3 h-3 animate-spin" /> Verifying...
              </span>
            )}
          </div>
        </div>
      </header>

      {/* API Unreachable Error Banner */}
      {apiStatus === 'unreachable' && (
        <div className="bg-rose-950/80 border-b border-rose-800 px-6 py-2.5 text-xs text-rose-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              <strong>API Unreachable: </strong>
              {initError || 'Unable to connect to backend server on port 8000. Ensure the FastAPI dev server is running.'}
            </span>
          </div>
          <button
            type="button"
            onClick={retryConnection}
            className="px-3 py-1 bg-rose-900 hover:bg-rose-800 rounded font-medium text-white transition text-xs shrink-0"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* 2. MAIN WORKSPACE BASED ON TAB */}
      <main className="flex-1 p-6 max-w-[1800px] w-full mx-auto">
        {activeTab === 'patient' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: 3D Visualization Canvas & Explanations (7 cols) */}
            <section className="lg:col-span-7 flex flex-col gap-6">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-sky-400" />
                    <h2 className="text-sm font-semibold tracking-wide uppercase text-slate-200">
                      3D Anatomical Risk Projection
                    </h2>
                  </div>
                  <span className="text-xs text-slate-400">
                    LAD / LCX / RCA vessel color mapping synchronized with prediction results
                  </span>
                </div>

                <div className="min-h-[520px]">
                  <React.Suspense fallback={<HeartViewerFallback />}>
                    <HeartViewer
                      vessels={vesselsProp}
                      selectedVessel={selectedVessel}
                      onSelectVessel={setSelectedVessel}
                      bpm={
                        typeof patientInputs['Pulse'] === 'number'
                          ? patientInputs['Pulse']
                          : typeof patientInputs['Heart Rate'] === 'number'
                          ? patientInputs['Heart Rate']
                          : undefined
                      }
                    />
                  </React.Suspense>
                </div>
              </div>

              {/* Explanations Panel */}
              <React.Suspense fallback={<ComponentFallback label="feature attributions" />}>
                <ExplanationPanel />
              </React.Suspense>
            </section>

            {/* Right Column: Prediction Cards & Patient Form (5 cols) */}
            <section className="lg:col-span-5 flex flex-col gap-6">
              <ResultCards />
              <PatientForm />
            </section>
          </div>
        )}

        {activeTab === 'validation' && (
          <React.Suspense fallback={<ComponentFallback label="validation report" />}>
            <ValidationTab />
          </React.Suspense>
        )}

        {activeTab === 'about' && (
          <React.Suspense fallback={<ComponentFallback label="about documentation" />}>
            <AboutTab />
          </React.Suspense>
        )}
      </main>

      {/* 3. MANDATORY CANONICAL DISCLAIMER BANNER (STICKY, NOT DISMISSIBLE) */}
      <DisclaimerBanner />
    </div>
  );
}

export default App;
