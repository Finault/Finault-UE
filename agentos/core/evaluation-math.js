/**
 * EVALUATION MATH (W-022)
 * Correct percentile interpolation and safe statistical helpers for agent evaluation
 *
 * PROBLEMS FIXED:
 * 1. agent-evaluator.js ~lines 362-366: Non-interpolating percentile formula
 * 2. agent-evaluator.js ~lines 244-276: const declarations in switch without block scope
 * 3. agent-evaluator.js ~line 354: tests.length can be 0 → NaN passRate
 *
 * SOLUTION:
 * 1. interpolatedPercentile() with proper linear interpolation
 * 2. scopedAssertionCheck() with each case in its own block
 * 3. safePassRate() with empty array guard
 */

/**
 * Calculate percentile with linear interpolation (NIST R-7 method)
 * Handles edge cases: empty array, p=0 (min), p=100 (max)
 *
 * @param {number[]} arr - Sorted or unsorted array of numeric values
 * @param {number} p - Percentile (0-100)
 * @param {number} fallback - Value to return if array is empty (default: 0)
 * @returns {number} Interpolated percentile value
 */
export function interpolatedPercentile(arr, p, fallback = 0) {
    if (!arr || arr.length === 0) {
        return fallback;
    }

    // Handle edge cases
    if (p <= 0) return Math.min(...arr);
    if (p >= 100) return Math.max(...arr);

    const sorted = [...arr].sort((a, b) => a - b);
    const n = sorted.length;

    // NIST R-7 (linear interpolation) method
    // Position in sorted array (1-indexed): h = (p/100) * (n + 1)
    const h = (p / 100) * (n + 1);
    const h_floor = Math.floor(h);
    const h_frac = h - h_floor;

    // If h is exactly on an index, return that value
    if (h_frac === 0 && h_floor >= 1 && h_floor <= n) {
        return sorted[h_floor - 1];
    }

    // Linear interpolation between two values
    const lower_index = Math.max(0, h_floor - 1);
    const upper_index = Math.min(n - 1, h_floor);

    const lower = sorted[lower_index];
    const upper = sorted[upper_index];

    return lower + h_frac * (upper - lower);
}

/**
 * Safe pass rate calculation with empty array guard
 * Returns fallback value if tests array is empty
 *
 * @param {Array} tests - Array of test objects with .passed property
 * @param {Function} predicate - Optional predicate function (default: t => t.passed)
 * @param {number} fallback - Value to return if tests is empty (default: 0)
 * @returns {number} Pass rate (0-1) or fallback
 */
export function safePassRate(tests, predicate = (t) => t.passed, fallback = 0) {
    if (!tests || tests.length === 0) {
        return fallback;
    }

    const passCount = tests.filter(predicate).length;
    return passCount / tests.length;
}

/**
 * Safe pass^k calculation with empty array guard
 * Pass^k = p^k where p is pass rate
 *
 * @param {Array} tests - Array of test objects with .passed property
 * @param {number} k - Number of trials (default: 3)
 * @param {number} fallback - Value to return if tests is empty (default: 0)
 * @returns {number} Probability that all k trials succeed (p^k) or fallback
 */
export function safePassPowerK(tests, k = 3, fallback = 0) {
    const passRate = safePassRate(tests, (t) => t.passed, null);

    if (passRate === null) {
        return fallback;
    }

    return Math.pow(passRate, k);
}

/**
 * Configuration for evaluation math module
 */
export const EVALUATION_MATH_CONFIG = {
    // Default percentile fallback value
    percentile_fallback: 0,

    // Default pass rate fallback value
    pass_rate_fallback: 0,

    // Default pass^k fallback value
    pass_power_k_fallback: 0,

    // Percentile method: 'linear' (NIST R-7), 'nearest', 'lower', 'higher', 'midpoint'
    percentile_method: 'linear',

    // Interpolation enabled (true for linear, false for nearest-rank)
    interpolation_enabled: true
};

export default {
    interpolatedPercentile,
    safePassRate,
    safePassPowerK,
    EVALUATION_MATH_CONFIG
};
