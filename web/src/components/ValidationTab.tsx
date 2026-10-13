import { useEffect, useState } from 'react';
import { ShieldCheck, BarChart3, AlertCircle, ExternalLink } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { api, getApiBaseUrl } from '../api/client';
import { formatHonestyComparisonText } from '../utils/riskLabels';

const TARGET_LABELS: Record<string, string> = {
  y_cad: 'CAD (Overall Obstructive Coronary Disease)',
  y_lad: 'LAD (Left Anterior Descending Stenosis)',
  y_lcx: 'LCX (Left Circumflex Stenosis)',
  y_rca: 'RCA (Right Coronary Artery Stenosis)',
};

export function ValidationTab() {
  const metricsData = useAppStore((s) => s.metricsData);
  const setMetricsData = useAppStore((s) => s.setMetricsData);
  const [loading, setLoading] = useState(!metricsData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (metricsData) return;
    let isMounted = true;
    const controller = new AbortController();

    async function load() {
      try {
        setLoading(true);
        const data = await api.getMetrics(controller.signal);
        if (isMounted) {
          setMetricsData(data);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : 'Failed to fetch model metrics';
          setError(msg);
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [metricsData, setMetricsData]);

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400 bg-slate-900 border border-slate-800 rounded-xl">
        <BarChart3 className="w-8 h-8 mx-auto animate-pulse text-indigo-400 mb-2" />
        <p className="text-sm">Loading verified cross-validation metrics and clinical baselines from API...</p>
      </div>
    );
  }

  if (error || !metricsData) {
    return (
      <div className="p-6 bg-red-950/40 border border-red-800 text-red-200 rounded-xl text-xs flex items-center gap-2">
        <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
        <span>Failed to load validation report: {error || 'No metrics returned from API'}</span>
      </div>
    );
  }

  const deployed_models = metricsData.deployed_models as Record<string, import('../api/types').DeployedTargetModel | undefined>;
  const clinical_baseline_comparison = metricsData.clinical_baseline_comparison as Record<string, import('../api/types').ClinicalBaselineTarget | undefined>;
  const disclosures = metricsData.disclosures as Record<string, string>;

  const baseUrl = getApiBaseUrl();

  return (
    <div className="space-y-6 text-slate-100">
      {/* Overview Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-3">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-6 h-6 text-emerald-400" />
          <h2 className="text-lg font-semibold text-white">Clinical Model Validation & Statistical Honesty</h2>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          Evaluation protocol: 5-fold stratified cross-validation on the Z-Alizadeh Sani extension cohort (N=303).
          Operating decision thresholds were selected to maximize F1 score on out-of-fold calibrated probabilities.
        </p>

        {disclosures?.optimism_source && (
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg text-xs text-slate-300 space-y-1">
            <span className="font-semibold text-amber-300">Statistical Optimism Notice (from API): </span>
            <span>{disclosures.optimism_source}</span>
          </div>
        )}

        <div className="p-3 bg-indigo-950/30 border border-indigo-900/50 rounded-lg text-xs text-indigo-200 space-y-1">
          <span className="font-semibold text-indigo-300">Explanation Fidelity Benchmarking: </span>
          <span>
            Top-3 feature overlap about 2.4–2.5 of 3; Spearman rank correlation about 0.66–0.70 against reference background
            (stratified KernelExplainer N=150 approximation against high-precision reference).
          </span>
        </div>
      </div>

      {/* Target Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {['y_cad', 'y_lad', 'y_lcx', 'y_rca'].map((tKey) => {
          const deployed = deployed_models?.[tKey];
          const baseline = clinical_baseline_comparison?.[tKey];
          const pairedBootstrap = baseline?.paired_bootstrap;
          const honestyText = formatHonestyComparisonText(pairedBootstrap);
          const title = TARGET_LABELS[tKey] || tKey;

          if (!deployed) return null;

          const metrics = deployed.metrics;
          const rocAuc = metrics?.roc_auc?.point_estimate;
          const rocAucCi = metrics?.roc_auc?.ci_95;

          return (
            <div
              key={tKey}
              className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2">
                  <div>
                    <h3 className="text-sm font-semibold text-white">{title}</h3>
                    <p className="text-[11px] text-indigo-300 font-mono">
                      Algorithm: {deployed.selected_model}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-bold text-white">
                      {rocAuc !== undefined ? rocAuc.toFixed(4) : 'N/A'}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      ROC-AUC {rocAucCi ? `[${rocAucCi[0].toFixed(3)}, ${rocAucCi[1].toFixed(3)}]` : ''}
                    </div>
                  </div>
                </div>

                {/* Performance table at operating cutoff */}
                <div className="grid grid-cols-3 gap-2 text-[11px] bg-slate-950/50 p-2.5 rounded border border-slate-800/80">
                  <div>
                    <div className="text-slate-400 text-[10px]">Operating Cutoff</div>
                    <div className="font-semibold text-white">
                      {deployed.operating_threshold !== undefined
                        ? (deployed.operating_threshold * 100).toFixed(1) + '%'
                        : '50.0%'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 text-[10px]">Sensitivity (Recall)</div>
                    <div className="font-semibold text-white">
                      {metrics?.recall?.point_estimate !== undefined
                        ? (metrics.recall.point_estimate * 100).toFixed(1) + '%'
                        : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 text-[10px]">F1 Score</div>
                    <div className="font-semibold text-white">
                      {metrics?.f1?.point_estimate !== undefined
                        ? metrics.f1.point_estimate.toFixed(4)
                        : 'N/A'}
                    </div>
                  </div>
                </div>

                {/* Paired Bootstrap vs 6-Feature Clinical LR Baseline */}
                {baseline && (
                  <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-300 text-[11px]">
                        6-Feature Clinical LR Baseline
                      </span>
                      <span className="font-mono text-slate-400 text-[11px]">
                        AUC: {baseline.roc_auc?.toFixed(4) ?? 'N/A'}
                      </span>
                    </div>

                    {pairedBootstrap && (
                      <div className="text-[11px] space-y-1 pt-1 border-t border-slate-800/80">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Δ AUC (Deployed - Baseline):</span>
                          <span className="font-mono font-semibold text-white">
                            {(pairedBootstrap.delta_auc ?? 0) > 0 ? '+' : ''}
                            {pairedBootstrap.delta_auc !== undefined ? pairedBootstrap.delta_auc.toFixed(4) : 'N/A'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span>Bootstrap 95% CI (B=1000):</span>
                          <span>
                            [{pairedBootstrap.ci_95?.[0]?.toFixed(4)}, {pairedBootstrap.ci_95?.[1]?.toFixed(4)}]
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-400">Honest Evaluation:</span>
                          <span
                            className={`font-semibold ${
                              honestyText.includes('statistically better')
                                ? 'text-emerald-400'
                                : 'text-slate-300'
                            }`}
                          >
                            {honestyText}
                          </span>
                        </div>
                        {pairedBootstrap.clinical_features && (
                          <div className="text-[10px] text-slate-500 truncate pt-0.5">
                            Baseline features: {pairedBootstrap.clinical_features.join(', ')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Static Diagnostic Curves Plot from API */}
              <div className="pt-2 border-t border-slate-800">
                <div className="text-[10px] text-slate-400 mb-1 flex items-center justify-between">
                  <span>Diagnostic Curves (ROC & PR)</span>
                  <a
                    href={`${baseUrl}/static/plots/curves_${tKey}.png`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300"
                  >
                    <span>Enlarge</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="bg-slate-950 rounded border border-slate-800 overflow-hidden">
                  <img
                    src={`${baseUrl}/static/plots/curves_${tKey}.png`}
                    alt={`Calibration and ROC curves for ${title}`}
                    className="w-full h-auto object-contain max-h-48"
                    loading="lazy"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Disclosures Footer */}
      {disclosures && (
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-xs space-y-2">
          <h3 className="font-semibold text-slate-200">Formal Scientific Disclosures:</h3>
          <ul className="list-disc list-inside text-slate-400 space-y-1 leading-relaxed">
            {Object.entries(disclosures).map(([k, text]) => (
              <li key={k}>
                <span className="text-slate-300 font-medium capitalize">{k.replace(/_/g, ' ')}: </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
