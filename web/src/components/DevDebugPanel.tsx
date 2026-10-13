import { useState } from 'react';
import type { VesselId, VesselData, HeartTransformConfig } from '../types/viewer';
import { Sliders, ChevronDown, ChevronUp, Copy, Check, RotateCcw, Crosshair, Undo, AlertTriangle } from 'lucide-react';
import { coronaryConfig } from '../anatomy';

export interface DevDebugPanelProps {
  vessels: Record<VesselId, VesselData>;
  onChangeVesselData: (id: VesselId, data: VesselData) => void;
  // Trace Mode Controls
  tracingVessel: VesselId | null;
  onStartTracing: (vessel: VesselId) => void;
  onCancelTracing: () => void;
  onFinishTracing: () => void;
  onUndoLastPoint: () => void;
  tracePointsCount: number;
  allVesselPoints: Record<VesselId, [number, number, number][]>;
  normalOffset: number;
  onChangeNormalOffset: (val: number) => void;
  onSnapToSurface: () => void;
  heartTransform: HeartTransformConfig;
  onChangeHeartTransform: (transform: HeartTransformConfig) => void;
  onResetPoints: () => void;
}

export function DevDebugPanel({
  vessels,
  onChangeVesselData,
  tracingVessel,
  onStartTracing,
  onCancelTracing,
  onFinishTracing,
  onUndoLastPoint,
  tracePointsCount,
  allVesselPoints,
  normalOffset,
  onChangeNormalOffset,
  onSnapToSurface,
  heartTransform,
  onChangeHeartTransform,
  onResetPoints,
}: DevDebugPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [selectedTraceTarget, setSelectedTraceTarget] = useState<VesselId>('lad');
  const [copiedCoronary, setCopiedCoronary] = useState(false);
  const [copiedTransform, setCopiedTransform] = useState(false);

  // Acceptance Presets to test color mapping directly
  const applyPreset = (presetName: string) => {
    if (presetName === 'acceptance_all') {
      onChangeVesselData('lcx', { probability: 0.45, threshold: 0.3973, highMargin: 0.15 });
      onChangeVesselData('rca', { probability: 0.354, threshold: 0.3354, highMargin: 0.15 });
      onChangeVesselData('lad', { probability: 0.15, threshold: 0.5006, highMargin: 0.15 });
    } else if (presetName === 'lcx_red') {
      onChangeVesselData('lcx', { probability: 0.70, threshold: 0.3973, highMargin: 0.15 });
    } else if (presetName === 'lcx_yellow_orange') {
      onChangeVesselData('lcx', { probability: 0.45, threshold: 0.3973, highMargin: 0.15 });
    } else if (presetName === 'rca_yellow_orange') {
      onChangeVesselData('rca', { probability: 0.354, threshold: 0.3354, highMargin: 0.15 });
    } else if (presetName === 'null_all') {
      onChangeVesselData('lad', null);
      onChangeVesselData('lcx', null);
      onChangeVesselData('rca', null);
    }
  };

  const handleCopyCoronaryJson = () => {
    const updatedConfig = {
      ...coronaryConfig,
      vessels: coronaryConfig.vessels.map((v) => ({
        ...v,
        points: allVesselPoints[v.id as VesselId] || v.points,
      })),
    };
    navigator.clipboard.writeText(JSON.stringify(updatedConfig, null, 2));
    setCopiedCoronary(true);
    setTimeout(() => setCopiedCoronary(false), 2000);
  };

  const handleCopyTransformJson = () => {
    navigator.clipboard.writeText(JSON.stringify(heartTransform, null, 2));
    setCopiedTransform(true);
    setTimeout(() => setCopiedTransform(false), 2000);
  };

  const vesselIds: VesselId[] = ['lad', 'lcx', 'rca'];

  return (
    <div className="fixed bottom-4 right-4 z-50 w-88 max-w-[92vw] bg-slate-950/95 backdrop-blur-xl border border-sky-500/50 rounded-xl shadow-2xl text-xs overflow-hidden">
      {/* Header */}
      <div className="bg-slate-900/90 border-b border-sky-500/30 px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sky-400 font-semibold">
          <Sliders className="w-3.5 h-3.5" />
          <span>?debug 3D Anatomy & Trace Tool</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="text-slate-400 hover:text-white p-0.5 rounded"
            aria-label="Toggle panel"
          >
            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="p-3 space-y-4 max-h-[82vh] overflow-y-auto">
          {!coronaryConfig.traced && (
            <div
              data-testid="debug-untraced-warning"
              className="p-2.5 bg-amber-950/80 border border-amber-600 rounded-lg text-amber-200 text-[11px] flex items-center gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="font-medium">coronary.json is not traced to this mesh: use Trace mode</span>
            </div>
          )}

          {/* Section: Surface Tracing Tool */}
          <div className="bg-slate-900/80 p-2.5 rounded-lg border border-sky-500/30 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
                <Crosshair className="w-3 h-3 text-sky-400" />
                Epicardial Surface Tracer
              </span>
              {tracingVessel && (
                <span className="bg-amber-500/20 text-amber-300 text-[10px] px-1.5 py-0.5 rounded font-mono font-bold animate-pulse">
                  TRACING {tracingVessel.toUpperCase()} ({tracePointsCount} pts)
                </span>
              )}
            </div>

            {/* Tracing Controls */}
            {tracingVessel ? (
              <div className="space-y-2">
                <p className="text-[10px] text-amber-200/90 leading-relaxed bg-amber-950/40 p-2 rounded border border-amber-600/40">
                  Left-click on heart surface from ostium to distal end. Markers & spline preview appear live.
                  <br />
                  <strong className="text-white">Enter</strong> or <strong className="text-white">Double-click</strong> = finish &bull; <strong className="text-white">Esc</strong> = cancel &bull; <strong className="text-white">Backspace</strong> = undo
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={onUndoLastPoint}
                    className="flex items-center justify-center gap-1 px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-medium text-[11px]"
                  >
                    <Undo className="w-3 h-3" />
                    Undo
                  </button>
                  <button
                    onClick={onCancelTracing}
                    className="px-2 py-1.5 bg-rose-950/60 hover:bg-rose-900 text-rose-300 rounded font-medium text-[11px]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={onFinishTracing}
                    className="px-2 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium text-[11px]"
                  >
                    Finish
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 text-[11px]">Target:</span>
                  <div className="flex gap-1 flex-1">
                    {vesselIds.map((vid) => (
                      <button
                        key={vid}
                        onClick={() => setSelectedTraceTarget(vid)}
                        className={`flex-1 py-1 rounded text-[11px] font-bold uppercase transition ${
                          selectedTraceTarget === vid
                            ? 'bg-sky-600 text-white'
                            : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {vid}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => onStartTracing(selectedTraceTarget)}
                    className="px-2 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded font-semibold text-[11px] flex items-center justify-center gap-1 shadow"
                  >
                    <Crosshair className="w-3 h-3" />
                    Start Trace
                  </button>
                  <button
                    onClick={onSnapToSurface}
                    className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-300 rounded font-medium text-[11px] truncate"
                    title="Raycast control points toward model centroid and snap to outer surface"
                  >
                    Snap to Surface
                  </button>
                </div>

                {/* Normal Offset Slider */}
                <div>
                  <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                    <span>Normal Offset Epsilon:</span>
                    <span className="font-mono text-sky-300">{(normalOffset * 100).toFixed(1)}% ({normalOffset.toFixed(3)})</span>
                  </div>
                  <input
                    type="range"
                    min="0.005"
                    max="0.05"
                    step="0.002"
                    value={normalOffset}
                    onChange={(e) => onChangeNormalOffset(parseFloat(e.target.value))}
                    className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-sky-400"
                  />
                </div>

                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    onClick={handleCopyCoronaryJson}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-semibold text-[11px]"
                  >
                    {copiedCoronary ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedCoronary ? 'Copied!' : 'Copy coronary.json'}</span>
                  </button>
                  <button
                    onClick={onResetPoints}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded"
                    title="Reset to default coronary splines"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Section: Heart Model Transform Sliders */}
          <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Model Transform (heartTransform.json)
              </span>
              <button
                onClick={handleCopyTransformJson}
                className="flex items-center gap-1 px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-sky-400 rounded text-[10px] font-medium"
              >
                {copiedTransform ? <Check className="w-2.5 h-2.5 text-emerald-300" /> : <Copy className="w-2.5 h-2.5" />}
                <span>{copiedTransform ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>

            {/* Rotation Sliders */}
            <div className="space-y-1.5">
              {(['X', 'Y', 'Z'] as const).map((axis, idx) => (
                <div key={`rot-${axis}`}>
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Rotation {axis}:</span>
                    <span className="font-mono text-slate-200">{heartTransform.rotation[idx]}°</span>
                  </div>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                    value={heartTransform.rotation[idx]}
                    onChange={(e) => {
                      const newRot = [...heartTransform.rotation] as [number, number, number];
                      newRot[idx] = parseInt(e.target.value, 10);
                      onChangeHeartTransform({ ...heartTransform, rotation: newRot });
                    }}
                    className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-sky-400"
                  />
                </div>
              ))}
            </div>

            {/* Position Y Slider */}
            <div>
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>Position Y (elevation):</span>
                <span className="font-mono text-slate-200">{heartTransform.position[1].toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="-1"
                max="1"
                step="0.02"
                value={heartTransform.position[1]}
                onChange={(e) => {
                  const newPos = [...heartTransform.position] as [number, number, number];
                  newPos[1] = parseFloat(e.target.value);
                  onChangeHeartTransform({ ...heartTransform, position: newPos });
                }}
                className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-indigo-400"
              />
            </div>

            {/* Scale Slider */}
            <div>
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>Scale:</span>
                <span className="font-mono text-slate-200">{heartTransform.scale[0].toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.8"
                step="0.02"
                value={heartTransform.scale[0]}
                onChange={(e) => {
                  const s = parseFloat(e.target.value);
                  onChangeHeartTransform({ ...heartTransform, scale: [s, s, s] });
                }}
                className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-amber-400"
              />
            </div>
          </div>

          {/* Section: Color Acceptance Test Presets */}
          <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 space-y-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
              Color Acceptance Presets
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => applyPreset('lcx_yellow_orange')}
                className="px-2 py-1 bg-slate-850 border border-slate-700 hover:bg-slate-800 text-amber-300 rounded text-[11px] text-left truncate"
                title="LCX: 0.45, t=0.3973 -> Yellow-Orange"
              >
                LCX 0.45 (Yellow-Orange)
              </button>
              <button
                onClick={() => applyPreset('lcx_red')}
                className="px-2 py-1 bg-slate-850 border border-slate-700 hover:bg-slate-800 text-red-300 rounded text-[11px] text-left truncate"
                title="LCX: 0.70, t=0.3973 -> Red"
              >
                LCX 0.70 (Red)
              </button>
              <button
                onClick={() => applyPreset('rca_yellow_orange')}
                className="px-2 py-1 bg-slate-850 border border-slate-700 hover:bg-slate-800 text-amber-300 rounded text-[11px] text-left truncate"
                title="RCA: 0.354, t=0.3354 -> Yellow-Orange"
              >
                RCA 0.354 (Yellow-Orange)
              </button>
              <button
                onClick={() => applyPreset('null_all')}
                className="px-2 py-1 bg-slate-850 border border-slate-700 hover:bg-slate-800 text-slate-400 rounded text-[11px] text-left truncate"
                title="All null -> Gray"
              >
                Null Data (Gray)
              </button>
            </div>
            <button
              onClick={() => applyPreset('acceptance_all')}
              className="w-full px-2 py-1 bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 text-amber-300 rounded text-[11px] font-medium"
            >
              Apply Full Acceptance Spec
            </button>
          </div>

          {/* Section: Risk Probability & Threshold Sliders */}
          <div className="space-y-2 pt-1 border-t border-slate-800">
            {vesselIds.map((id) => {
              const data = vessels[id];
              const isNull = data === null;
              const prob = data?.probability ?? 0.5;
              const thresh = data?.threshold ?? 0.5;

              return (
                <div key={id} className="bg-slate-900/90 p-2 rounded-lg border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold uppercase text-slate-200">{id}</span>
                    <button
                      onClick={() => {
                        if (isNull) {
                          onChangeVesselData(id, { probability: 0.4, threshold: 0.45, highMargin: 0.15 });
                        } else {
                          onChangeVesselData(id, null);
                        }
                      }}
                      className={`text-[10px] px-1.5 py-0.5 rounded border ${
                        isNull
                          ? 'bg-slate-800 text-slate-400 border-slate-700'
                          : 'bg-emerald-950 text-emerald-400 border-emerald-800'
                      }`}
                    >
                      {isNull ? 'Set to Active' : 'Set to Null'}
                    </button>
                  </div>

                  {!isNull && (
                    <>
                      <div>
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span>Probability:</span>
                          <span className="font-mono text-slate-200">{(prob * 100).toFixed(1)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.005"
                          value={prob}
                          onChange={(e) => {
                            onChangeVesselData(id, {
                              ...data!,
                              probability: parseFloat(e.target.value),
                            });
                          }}
                          className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-sky-400"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span>Threshold:</span>
                          <span className="font-mono text-slate-200">{(thresh * 100).toFixed(1)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0.1"
                          max="0.9"
                          step="0.005"
                          value={thresh}
                          onChange={(e) => {
                            onChangeVesselData(id, {
                              ...data!,
                              threshold: parseFloat(e.target.value),
                            });
                          }}
                          className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-amber-400"
                        />
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
