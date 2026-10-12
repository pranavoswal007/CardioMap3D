import { useState } from 'react';
import type { VesselId, VesselData } from '../types/viewer';
import { Sliders, ChevronDown, ChevronUp } from 'lucide-react';

interface DevDebugPanelProps {
  vessels: Record<VesselId, VesselData>;
  onChangeVesselData: (id: VesselId, data: VesselData) => void;
}

export function DevDebugPanel({ vessels, onChangeVesselData }: DevDebugPanelProps) {
  const [isOpen, setIsOpen] = useState(true);

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

  const vesselIds: VesselId[] = ['lad', 'lcx', 'rca'];

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-slate-950/95 backdrop-blur-xl border border-amber-500/50 rounded-xl shadow-2xl text-xs overflow-hidden">
      {/* Header */}
      <div className="bg-amber-950/40 border-b border-amber-500/30 px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
          <Sliders className="w-3.5 h-3.5" />
          <span>?debug Dev Color Testing Panel</span>
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
        <div className="p-3 space-y-3 max-h-[80vh] overflow-y-auto">
          {/* Quick Presets */}
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
              Acceptance Test Presets
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => applyPreset('lcx_yellow_orange')}
                className="px-2 py-1 bg-slate-900 border border-slate-700 hover:bg-slate-800 text-amber-300 rounded text-[11px] text-left truncate"
                title="LCX: 0.45, t=0.3973 -> Yellow-Orange"
              >
                LCX 0.45 (Yellow-Orange)
              </button>
              <button
                onClick={() => applyPreset('lcx_red')}
                className="px-2 py-1 bg-slate-900 border border-slate-700 hover:bg-slate-800 text-red-300 rounded text-[11px] text-left truncate"
                title="LCX: 0.70, t=0.3973 -> Red"
              >
                LCX 0.70 (Red)
              </button>
              <button
                onClick={() => applyPreset('rca_yellow_orange')}
                className="px-2 py-1 bg-slate-900 border border-slate-700 hover:bg-slate-800 text-amber-300 rounded text-[11px] text-left truncate"
                title="RCA: 0.354, t=0.3354 -> Yellow-Orange"
              >
                RCA 0.354 (Yellow-Orange)
              </button>
              <button
                onClick={() => applyPreset('null_all')}
                className="px-2 py-1 bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-400 rounded text-[11px] text-left truncate"
                title="All null -> Gray"
              >
                Null Data (Gray)
              </button>
            </div>
            <button
              onClick={() => applyPreset('acceptance_all')}
              className="w-full mt-1.5 px-2 py-1 bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 text-amber-300 rounded text-[11px] font-medium"
            >
              Apply Full Acceptance Spec
            </button>
          </div>

          {/* Sliders for each vessel */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            {vesselIds.map((id) => {
              const data = vessels[id];
              const isNull = data === null;
              const prob = data?.probability ?? 0.5;
              const thresh = data?.threshold ?? 0.5;

              return (
                <div key={id} className="bg-slate-900/90 p-2 rounded-lg border border-slate-800 space-y-1.5">
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
                        <div className="flex justify-between text-[11px] text-slate-400">
                          <span>Probability (p):</span>
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
                          className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] text-slate-400">
                          <span>Threshold (t):</span>
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
                          className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
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
