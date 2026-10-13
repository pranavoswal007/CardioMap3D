/**
 * Utility functions for user-facing risk classification and statistical honesty.
 */

export interface PairedBootstrapData {
  deployed_roc_auc?: number;
  baseline_roc_auc?: number;
  delta_auc?: number;
  ci_95?: [number, number];
  fraction_deployed_superior?: number;
  excludes_zero?: boolean;
}

/**
 * Single canonical utility for clinical risk display labels.
 * Low tier -> "below screening cutoff"
 * Positive tiers -> "above screening cutoff" (highest tier -> "well above screening cutoff")
 *
 * Guarantees that neither raw API intermediate tier text nor the forbidden phrase
 * ever reaches the UI.
 */
export function getDisplayRiskLabel(riskLevel?: string | null): string {
  if (!riskLevel) {
    return 'below screening cutoff';
  }
  const norm = riskLevel.toLowerCase().trim();
  if (norm === 'low') {
    return 'below screening cutoff';
  }
  if (norm === 'high') {
    return 'well above screening cutoff';
  }
  // Any intermediate positive classification:
  return 'above screening cutoff';
}

/**
 * Honest comparison evaluator per Phase 4 contract:
 * - CI excludes 0 and delta > 0 -> "statistically better"
 * - CI includes 0 -> "not significantly different"
 * - baseline AUC >= deployed AUC -> also adds " (baseline matched or exceeded)"
 * - Never outputs "outperforms" for targets whose CI includes 0.
 */
export function formatHonestyComparisonText(pb?: PairedBootstrapData | null): string {
  if (!pb || !pb.ci_95) {
    return 'Comparison data unavailable';
  }
  const [lower, upper] = pb.ci_95;
  const delta = pb.delta_auc ?? 0;
  const depAuc = pb.deployed_roc_auc ?? 0;
  const baseAuc = pb.baseline_roc_auc ?? 0;

  const excludesZero = lower > 0 || upper < 0 || pb.excludes_zero === true;

  if (excludesZero && delta > 0) {
    return 'statistically better';
  }

  let text = 'not significantly different';
  if (baseAuc >= depAuc) {
    text += ' (baseline matched or exceeded)';
  }
  return text;
}
