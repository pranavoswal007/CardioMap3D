import React, { useState } from 'react';
import {
  Activity,
  Heart,
  BarChart2,
  FileText,
  ShieldAlert,
  Server,
  RefreshCw,
  Cpu,
  Layers
} from 'lucide-react';
import type { VesselId, VesselData } from './types/viewer';

// Lazy-load the heavy 3D viewer bundle for optimal page performance
const HeartViewer = React.lazy(() => import('./components/HeartViewer'));

function HeartViewerFallback() {
  return (
    <div className="w-full h-[520px] md:h-[580px] rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col items-center justify-center gap-3 text-slate-400">
      <div className="relative">
        <Heart className="w-10 h-10 text-rose-500/40 animate-pulse" />
      </div>
      <div className="text-xs font-medium text-slate-300">
        Initializing 3D Cardiac Anatomy Engine...
      </div>
      <div className="text-[11px] text-slate-500">
        Loading WebGL Shaders & Spline Geometries
      </div>
    </div>
  );
}

export function App() {
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [selectedVessel, setSelectedVessel] = useState<VesselId | null>(null);

  // Default unpredicted vessel state (Phase 4 will wire live API predictions)
  const [vessels] = useState<Record<VesselId, VesselData>>({
    lad: null,
    lcx: null,
    rca: null,
  });

  React.useEffect(() => {
    // Verify API health endpoint
    fetch('http://localhost:8000/health')
      .then((res) => {
        if (res.ok) setApiStatus('online');
        else setApiStatus('offline');
      })
      .catch(() => setApiStatus('offline'));
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-[#070b13] text-slate-100 font-sans">
      {/* 1. MANDATORY CLINICAL DISCLAIMER BANNER */}
      <div className="w-full bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-center gap-2 text-xs md:text-sm text-amber-300 z-50 sticky top-0 backdrop-blur-md">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="font-semibold tracking-wide uppercase text-amber-400">Clinical Decision Support Only:</span>
        <span>
          CardioMap 3D predictions are for decision support and research/educational purposes only and are <strong>not a substitute for formal diagnostic imaging or invasive coronary angiography</strong>.
        </span>
      </div>

      {/* 2. HEADER NAVIGATION */}
      <header className="border-b border-slate-800 bg-[#0a101d]/90 backdrop-blur-lg px-6 py-3 flex flex-wrap items-center justify-between gap-4 sticky top-[37px] z-40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-sky-500 to-rose-500 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Heart className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">CardioMap 3D</h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                Phase 3: 3D Heart Viewer
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                Track A: Multimodal AI 2026
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Interactive 3D Coronary Artery Risk Mapping & Multi-Vessel Stenosis Predictor
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-900 border border-slate-800">
            <Server className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">API Status:</span>
            {apiStatus === 'online' ? (
              <span className="flex items-center gap-1.5 font-medium text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400" /> Online
              </span>
            ) : apiStatus === 'offline' ? (
              <span className="flex items-center gap-1.5 font-medium text-rose-400">
                <span className="w-2 h-2 rounded-full bg-rose-400" /> Disconnected
              </span>
            ) : (
              <span className="flex items-center gap-1.5 font-medium text-amber-400">
                <RefreshCw className="w-3 h-3 animate-spin" /> Verifying...
              </span>
            )}
          </div>
          <div className="hidden md:flex items-center gap-2 text-slate-400">
            <Cpu className="w-3.5 h-3.5" />
            <span>Architecture: Monorepo / ML+API+Web</span>
          </div>
        </div>
      </header>

      {/* 3. MAIN WORKSPACE */}
      <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-[1800px] w-full mx-auto">
        {/* Left Column: 3D Visualization Canvas (7 cols) */}
        <section className="lg:col-span-7 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-400" />
              <h2 className="text-sm font-semibold tracking-wide uppercase text-slate-200">
                3D Anatomical Risk Projection
              </h2>
            </div>
            <span className="text-xs text-slate-400">
              Spatial projection of LAD / LCX / RCA vessel-level risk
            </span>
          </div>

          <div className="flex-1 min-h-[540px]">
            <React.Suspense fallback={<HeartViewerFallback />}>
              <HeartViewer
                vessels={vessels}
                selectedVessel={selectedVessel}
                onSelectVessel={setSelectedVessel}
              />
            </React.Suspense>
          </div>
        </section>

        {/* Right Column: Clinical Metrics & Prediction Panel (5 cols) */}
        <section className="lg:col-span-5 flex flex-col gap-5">
          {/* Overall CAD Assessment Box */}
          <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-rose-400" />
                <h3 className="font-semibold text-slate-100 text-sm">Patient Coronary Artery Assessment</h3>
              </div>
              <span className="px-2.5 py-0.5 rounded text-xs font-mono bg-slate-800 text-slate-400 border border-slate-700">
                Awaiting Assessment
              </span>
            </div>

            {/* Vessel Status Cards (Neutral empty state) */}
            <div className="grid grid-cols-3 gap-3 my-4">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80">
                <div className="text-[11px] text-slate-400 font-medium">LAD Vessel</div>
                <div className="text-xl font-bold font-mono text-slate-400 mt-1">&mdash;</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Awaiting prediction</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80">
                <div className="text-[11px] text-slate-400 font-medium">RCA Vessel</div>
                <div className="text-xl font-bold font-mono text-slate-400 mt-1">&mdash;</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Awaiting prediction</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80">
                <div className="text-[11px] text-slate-400 font-medium">LCX Vessel</div>
                <div className="text-xl font-bold font-mono text-slate-400 mt-1">&mdash;</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Awaiting prediction</div>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              Run a prediction to see results. Calibrated out-of-fold probability estimates from multi-target ensemble models will appear here after patient feature submission.
            </p>
          </div>

          {/* Clinical Interpretability Preview */}
          <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-xl flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <BarChart2 className="w-4 h-4 text-sky-400" />
                <h3 className="font-semibold text-slate-100 text-sm">SHAP Interpretability & Feature Attribution</h3>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                Local feature contributions to coronary stenosis predictions will be rendered using SHAP values.
              </p>

              {/* Neutral Empty State */}
              <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl bg-slate-950/60 border border-slate-800/80 my-2">
                <BarChart2 className="w-8 h-8 text-slate-600 mb-2.5" />
                <p className="text-sm font-medium text-slate-300">Run a prediction to see results</p>
                <p className="text-xs text-slate-500 max-w-xs mt-1">
                  Local SHAP values quantifying each clinical measurement's contribution will be computed once patient features are provided.
                </p>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-500" /> Model Card & Audit: Ready
              </span>
              <span className="text-sky-400 hover:underline cursor-pointer">
                View Documentation &rarr;
              </span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
