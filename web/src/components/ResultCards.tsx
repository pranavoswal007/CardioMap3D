import { AlertTriangle, HeartPulse, Activity } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { getDisplayRiskLabel } from '../utils/riskLabels';
import type { TargetPrediction } from '../api/types';

interface ProbabilityBarProps {
  probability: number;
  threshold: number;
  highThreshold: number;
}

export function ProbabilityBar({ probability, threshold, highThreshold }: ProbabilityBarProps) {
  const probPct = Math.min(Math.max(probability * 100, 1), 99).toFixed(1);
  const threshPct = Math.min(Math.max(threshold * 100, 0), 100).toFixed(1);
  const highThreshPct = Math.min(Math.max(highThreshold * 100, 0), 100).toFixed(1);

  const isAboveHigh = probability >= highThreshold;
  const isAboveThresh = probability >= threshold;

  const barColor = isAboveHigh
    ? 'bg-rose-500'
    : isAboveThresh
      ? 'bg-amber-500'
      : 'bg-emerald-500';

  return (
    <div className="space-y-1.5 pt-1">
      <div className="relative h-3 w-full bg-slate-800 rounded-full overflow-visible border border-slate-700">
        {/* Progress fill */}
        <div
          data-testid="probability-fill"
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${probPct}%` }}
        />

        {/* Operating Threshold Tick */}
        <div
          data-testid="threshold-tick"
          className="absolute top-[-3px] bottom-[-3px] w-0.5 bg-yellow-400 z-10 shadow-sm"
          style={{ left: `${threshPct}%` }}
          title={`Screening Cutoff: ${(threshold * 100).toFixed(1)}%`}
        />

        {/* High Threshold Tick */}
        <div
          data-testid="high-threshold-tick"
          className="absolute top-[-3px] bottom-[-3px] w-0.5 bg-rose-400 z-10 shadow-sm"
          style={{ left: `${highThreshPct}%` }}
          title={`High Cutoff: ${(highThreshold * 100).toFixed(1)}%`}
        />
      </div>

      <div className="flex justify-between text-[10px] text-slate-400">
        <span>0%</span>
        <span className="text-yellow-400 font-medium">Cutoff: {(threshold * 100).toFixed(1)}%</span>
        <span className="text-rose-400 font-medium">High: {(highThreshold * 100).toFixed(1)}%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

interface TargetCardProps {
  id: 'cad' | 'lad' | 'lcx' | 'rca';
  title: string;
  subtitle: string;
  prediction: TargetPrediction;
  isSelected: boolean;
  onSelect: () => void;
  isVessel?: boolean;
}

export function TargetCard({
  id,
  title,
  subtitle,
  prediction,
  isSelected,
  onSelect,
  isVessel = false,
}: TargetCardProps) {
  const displayLabel = getDisplayRiskLabel(prediction.risk_level);
  const isElevated = prediction.probability >= prediction.threshold;

  return (
    <div
      onClick={onSelect}
      className={`p-4 rounded-xl border cursor-pointer transition-all ${
        isSelected
          ? 'bg-slate-850 border-indigo-500 ring-2 ring-indigo-500/30 shadow-lg shadow-indigo-950/40'
          : 'bg-slate-900 border-slate-800 hover:border-slate-700 hover:bg-slate-850/50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            {isSelected && (
              <span className="px-1.5 py-0.2 bg-indigo-500/20 text-indigo-300 text-[10px] rounded border border-indigo-500/40">
                Selected
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400">{subtitle}</p>
        </div>

        <div className="text-right">
          <div className="text-lg font-bold text-white tracking-tight">
            {(prediction.probability * 100).toFixed(1)}%
          </div>
          <span
            className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${
              isElevated
                ? 'bg-amber-950/60 text-amber-300 border border-amber-800/60'
                : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60'
            }`}
          >
            {displayLabel}
          </span>
        </div>
      </div>

      <div className="mt-3">
        <ProbabilityBar
          probability={prediction.probability}
          threshold={prediction.threshold}
          highThreshold={prediction.high_threshold}
        />
      </div>

      <div className="mt-3 pt-2.5 border-t border-slate-800 grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <span className="text-slate-400">Relative Risk: </span>
          <span className="font-semibold text-slate-200">{prediction.relative_risk.toFixed(2)}x</span>
        </div>
        <div>
          <span className="text-slate-400">Cohort Prevalence: </span>
          <span className="font-semibold text-slate-200">
            {(prediction.cohort_prevalence * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Special context note for LCX and RCA per contract */}
      {(id === 'lcx' || id === 'rca') && isVessel && (
        <div className="mt-2.5 p-2 bg-slate-950/60 rounded text-[10px] text-slate-400 border border-slate-800/80 leading-relaxed">
          <span className="font-semibold text-slate-300">Cohort context: </span>
          A positive label here indicates passing the screening cutoff, not necessarily above-average cohort risk; see probability and relative risk.
        </div>
      )}
    </div>
  );
}

export function ResultCards() {
  const prediction = useAppStore((s) => s.prediction);
  const selectedTarget = useAppStore((s) => s.selectedTarget);
  const setSelectedTarget = useAppStore((s) => s.setSelectedTarget);

  if (!prediction) {
    return (
      <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-xl text-slate-400">
        <HeartPulse className="w-10 h-10 text-slate-600 mx-auto mb-2.5" />
        <p className="text-sm">Submit patient features to view calibrated risk probabilities and vessel mapping.</p>
      </div>
    );
  }

  const { cad, vessels, coherence, warnings } = prediction;
  const coh = coherence as { is_incoherent?: boolean; raw_cad_probability?: number; max_vessel_probability?: number } | undefined;
  const isIncoherent =
    coh &&
    (Boolean(coh.is_incoherent) ||
      (typeof coh.raw_cad_probability === 'number' &&
        typeof coh.max_vessel_probability === 'number' &&
        coh.raw_cad_probability < coh.max_vessel_probability));

  return (
    <div className="space-y-4">
      {/* Coherence & Consistency Banner */}
      {isIncoherent && (
        <div className="p-3.5 bg-amber-950/40 border border-amber-800/80 rounded-xl text-amber-200 text-xs flex items-start gap-2.5">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-amber-300">Model-Consistency Notice</div>
            <p className="text-slate-300 leading-relaxed">
              Anatomical coherence audit flagged that overall CAD probability is lower than one of the branch vessel probabilities.
              This is a statistical model characteristic and not a clinical diagnosis.
            </p>
          </div>
        </div>
      )}

      {/* API Clinical Warnings */}
      {warnings && warnings.length > 0 && (
        <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs space-y-1">
          <div className="font-semibold text-slate-300 flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-indigo-400" />
            Model Input Verification Notices:
          </div>
          <ul className="list-disc list-inside text-slate-400 space-y-0.5">
            {warnings.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Main CAD and 3-Vessel Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <TargetCard
          id="cad"
          title="Overall CAD Risk"
          subtitle="Calibrated probability of multi-vessel or obstructive CAD"
          prediction={cad}
          isSelected={selectedTarget === 'cad'}
          onSelect={() => setSelectedTarget('cad')}
        />

        {vessels.lad && (
          <TargetCard
            id="lad"
            title="LAD Artery"
            subtitle="Left Anterior Descending branch stenosis"
            prediction={vessels.lad}
            isSelected={selectedTarget === 'lad'}
            onSelect={() => setSelectedTarget('lad')}
            isVessel
          />
        )}

        {vessels.lcx && (
          <TargetCard
            id="lcx"
            title="LCX Artery"
            subtitle="Left Circumflex branch stenosis"
            prediction={vessels.lcx}
            isSelected={selectedTarget === 'lcx'}
            onSelect={() => setSelectedTarget('lcx')}
            isVessel
          />
        )}

        {vessels.rca && (
          <TargetCard
            id="rca"
            title="RCA Artery"
            subtitle="Right Coronary Artery stenosis"
            prediction={vessels.rca}
            isSelected={selectedTarget === 'rca'}
            onSelect={() => setSelectedTarget('rca')}
            isVessel
          />
        )}
      </div>
    </div>
  );
}
