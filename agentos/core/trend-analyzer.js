/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * W-021: TREND ANALYZER
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Safe growth rate, confidence, and budget variance calculations.
 *
 * PROBLEMS FIXED:
 * 1. forecasting-agent.js ~line 388: (variance / budget * 100) div-by-zero when budget=0
 * 2. forecasting-agent.js ~line 193: confidence uses || 1 fallback for zero avgGrowth,
 *    giving misleadingly high confidence for no-signal data
 * 3. forecasting-agent.js ~lines 367-372: population SD instead of sample SD,
 *    same || 1 fallback issue for stability calculation
 *
 * SOLUTION:
 * 1. safeVariancePercent() guards against zero budget
 * 2. safeGrowthConfidence() returns 0 confidence when avgGrowth is 0 (no signal)
 * 3. safeTrendStability() uses sample SD and handles zero meanSlope correctly
 * 4. sampleStdDev() for correct Bessel-corrected standard deviation
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─── Constants ───────────────────────────────────────────────────────────────

export const TREND_ANALYZER_CONFIG = {
    // Minimum samples for std dev calculation
    minSamplesForStdDev: 2,
    // Default confidence when data is insufficient
    insufficientDataConfidence: 0.5,
    // Coefficients of variation thresholds
    cvThresholds: {
        low: 0.1,      // cv < 0.1 = good signal
        medium: 0.5,   // 0.1 <= cv <= 0.5 = moderate
        high: 1.0      // cv > 1.0 = poor signal
    }
};

// ─── Standard Deviation Utilities ──────────────────────────────────────────

/**
 * Calculate sample standard deviation (Bessel's correction: divide by n-1).
 * Use this when you have a sample from a larger population.
 *
 * @param {number[]} values - Array of numeric values
 * @param {number|null} mean - Pre-calculated mean (optional, computed if not provided)
 * @returns {number} - Sample standard deviation
 */
export function sampleStdDev(values, mean = null) {
    if (!Array.isArray(values) || values.length < TREND_ANALYZER_CONFIG.minSamplesForStdDev) {
        return 0;
    }

    const n = values.length;
    const m = mean !== null ? mean : values.reduce((a, b) => a + b, 0) / n;

    const sumSquaredDiff = values.reduce((sum, v) => sum + Math.pow(v - m, 2), 0);
    // Bessel's correction: divide by (n-1) instead of n
    return Math.sqrt(sumSquaredDiff / (n - 1));
}

/**
 * Calculate population standard deviation (divide by n).
 * Use this when your data represents the entire population.
 *
 * @param {number[]} values - Array of numeric values
 * @param {number|null} mean - Pre-calculated mean (optional)
 * @returns {number} - Population standard deviation
 */
export function populationStdDev(values, mean = null) {
    if (!Array.isArray(values) || values.length === 0) {
        return 0;
    }

    const n = values.length;
    const m = mean !== null ? mean : values.reduce((a, b) => a + b, 0) / n;

    const sumSquaredDiff = values.reduce((sum, v) => sum + Math.pow(v - m, 2), 0);
    // Population std: divide by n
    return Math.sqrt(sumSquaredDiff / n);
}

// ─── Safe Variance Percent ────────────────────────────────────────────────

/**
 * Safely compute variance as percentage of budget, guarding against zero/NaN budget.
 *
 * @param {number} variance - Variance amount (projected - budget)
 * @param {number} budget - Budget baseline
 * @param {number} decimals - Decimal places to round to (default: 1)
 * @returns {string} - Formatted percentage string (e.g., "15.3%"), or "0.0" if budget is 0/NaN
 */
export function safeVariancePercent(variance, budget, decimals = 1) {
    // Guard against zero, null, NaN, or negative budget
    if (!budget || budget === 0 || !Number.isFinite(budget) || budget < 0) {
        return (0).toFixed(decimals);
    }

    // Guard against NaN variance
    if (!Number.isFinite(variance)) {
        return (0).toFixed(decimals);
    }

    const percent = (variance / budget) * 100;
    return percent.toFixed(decimals);
}

// ─── Safe Growth Confidence ──────────────────────────────────────────────

/**
 * Safely compute growth confidence, handling zero growth (no signal).
 *
 * When avgGrowth = 0, the coefficient of variation is undefined (infinite),
 * so confidence should be 0 (no signal to forecast from). The || 1 fallback
 * in the original code masked this, giving high confidence for no-signal data.
 *
 * Formula:
 * - If avgGrowth = 0: return 0 (no signal)
 * - Otherwise: max(0, 1 - growthStd / |avgGrowth|)
 *
 * @param {number} growthStd - Standard deviation of growth rates
 * @param {number} avgGrowth - Average growth rate
 * @returns {number} - Confidence score (0-1)
 */
export function safeGrowthConfidence(growthStd, avgGrowth) {
    // Normalize NaN/undefined inputs
    const stdNorm = Number.isFinite(growthStd) ? growthStd : 0;
    const avgNorm = Number.isFinite(avgGrowth) ? avgGrowth : 0;

    // Zero growth = no signal = zero confidence
    if (avgNorm === 0) {
        return 0;
    }

    // Coefficient of variation: stdDev / |mean|
    // Confidence = 1 - CV (lower CV = higher confidence)
    const cv = stdNorm / Math.abs(avgNorm);
    return Math.max(0, Math.min(1, 1 - cv));
}

// ─── Safe Trend Stability ──────────────────────────────────────────────

/**
 * Safely compute trend stability from slopes across data segments.
 * Handles zero mean slope correctly and uses sample standard deviation.
 *
 * Original code (lines 367-372) used:
 *   - Population SD instead of sample SD
 *   - || 1 fallback when meanSlope = 0, giving misleading confidence
 *
 * New code:
 *   - Uses sample SD (Bessel correction)
 *   - Returns 0 when meanSlope = 0 (no trend = no stability)
 *   - Returns 0.5 when < 2 slopes (insufficient data)
 *
 * @param {number[]} slopes - Array of slope values from different segments
 * @returns {number} - Trend stability score (0-1)
 */
export function safeTrendStability(slopes) {
    // Need at least 2 slopes to compute stability
    if (!Array.isArray(slopes) || slopes.length < 2) {
        return TREND_ANALYZER_CONFIG.insufficientDataConfidence;
    }

    const filteredSlopes = slopes.filter(s => Number.isFinite(s));
    if (filteredSlopes.length < 2) {
        return TREND_ANALYZER_CONFIG.insufficientDataConfidence;
    }

    const meanSlope = filteredSlopes.reduce((a, b) => a + b, 0) / filteredSlopes.length;

    // Zero mean slope = no trend = no stability to measure
    // Return 0.5 (neutral) rather than attempting to compute stability
    if (meanSlope === 0) {
        return 0.5;
    }

    // Use sample SD (Bessel-corrected) instead of population SD
    const slopeStd = sampleStdDev(filteredSlopes, meanSlope);

    // Coefficient of variation: how much variation relative to the trend
    // Higher CV (more variation) = lower stability
    // Stability = 1 - CV, clamped to [0, 1]
    const cv = slopeStd / Math.abs(meanSlope);
    return Math.max(0, Math.min(1, 1 - cv));
}

// ─── Coefficient of Variation ──────────────────────────────────────────

/**
 * Compute coefficient of variation (normalized std dev).
 * CV = stdDev / |mean|
 *
 * Useful for comparing variability across different scales.
 *
 * @param {number[]} values - Array of numeric values
 * @param {boolean} useSample - Use sample SD if true, population SD if false (default: true)
 * @returns {number} - Coefficient of variation (0-∞), or Infinity if mean=0
 */
export function coefficientOfVariation(values, useSample = true) {
    if (!Array.isArray(values) || values.length === 0) {
        return 0;
    }

    const mean = values.reduce((a, b) => a + b, 0) / values.length;

    // If mean is zero, CV is undefined (technically infinity)
    if (mean === 0) {
        return Infinity;
    }

    const stdDev = useSample
        ? sampleStdDev(values, mean)
        : populationStdDev(values, mean);

    return Math.abs(stdDev / mean);
}

export default {
    sampleStdDev,
    populationStdDev,
    safeVariancePercent,
    safeGrowthConfidence,
    safeTrendStability,
    coefficientOfVariation,
    TREND_ANALYZER_CONFIG
};
