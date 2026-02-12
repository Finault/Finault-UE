/**
 * Finault Confidence Score (FCS) Calculator
 *
 * Inputs and weights (from doctrine):
 * - Data Coverage (40%): invoices parsed, usage matched, missing providers
 * - Temporal Depth (25%): 1 period = 0.25, 2-3 = 0.5, 4+ = 1.0
 * - Rate Certainty (20%): known pricing vs contract rates vs ambiguous tiers
 * - Reconciliation Integrity (15%): duplicates, unmatched lines, overrides
 *
 * Confidence tiers:
 * - < 0.40: "Low" - Observed values only
 * - 0.40–0.69: "Medium" - Directional changes detected
 * - 0.70–0.84: "High" - Variance is meaningful
 * - ≥ 0.85: "Very High" - Automatable without review
 */

export interface ConfidenceInputs {
  coverage: number;      // 0-1: Data coverage score
  periods: number;       // Number of periods (1, 2, 3, 4+)
  rateCertainty: number; // 0-1: Rate/pricing certainty
  integrity: number;     // 0-1: Data integrity score
}

export function computeFCS(meta: ConfidenceInputs): number {
  // Normalize periods: 1 = 0.25, 2-3 = 0.5-0.75, 4+ = 1.0
  let periodScore: number;
  if (meta.periods >= 4) {
    periodScore = 1.0;
  } else if (meta.periods >= 2) {
    periodScore = 0.25 + (meta.periods - 1) * 0.25;
  } else {
    periodScore = 0.25;
  }

  // Weighted calculation
  const score =
    meta.coverage * 0.40 +
    periodScore * 0.25 +
    meta.rateCertainty * 0.20 +
    meta.integrity * 0.15;

  // Clamp to 0-1 range
  return Math.max(0, Math.min(1, score));
}

export function getConfidenceLabel(score: number): string {
  if (score >= 0.85) return "Very High";
  if (score >= 0.70) return "High";
  if (score >= 0.40) return "Medium";
  return "Low";
}

// Alias for backward compatibility
export const confidenceLabel = getConfidenceLabel;
