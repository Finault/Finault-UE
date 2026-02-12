/**
 * STATS CORRECTION (W-023)
 * Correct standard deviation, z-score, and percentage calculations
 *
 * PROBLEMS FIXED:
 * 1. finault-tools.js ~line 129: Population SD instead of sample SD (Bessel's correction)
 * 2. finault-tools.js ~line 136: zscore = (value-mean)/std divides by zero when std=0
 * 3. finault-tools.js ~line 144: (value-mean)/mean*100 divides by zero when mean=0
 * 4. finault-tools.js ~line 128: mean = sum/length is NaN when values is empty
 *
 * SOLUTION:
 * 1. sampleSD() with Bessel's correction (n-1); returns 0 for n<2
 * 2. safeZScore() returns 0 when std=0 (all values identical = no anomaly)
 * 3. safeDeviationPercent() returns "0.0%" when mean=0
 * 4. safeMean() returns fallback on empty array
 */

/**
 * Calculate mean (average) with empty array guard
 * Returns fallback value if values array is empty or null
 *
 * @param {number[]} values - Array of numeric values
 * @param {number} fallback - Value to return if values is empty (default: 0)
 * @returns {number} Mean or fallback
 */
export function safeMean(values, fallback = 0) {
    if (!values || values.length === 0) {
        return fallback;
    }

    const sum = values.reduce((a, b) => a + b, 0);
    return sum / values.length;
}

/**
 * Calculate sample standard deviation with Bessel's correction
 * Uses (n-1) denominator instead of n (population SD)
 * Returns 0 for n<2 (insufficient data to estimate variance)
 *
 * @param {number[]} values - Array of numeric values
 * @param {number|null} mean - Pre-calculated mean (optional, computed if null)
 * @returns {number} Sample standard deviation or 0 if n<2
 */
export function sampleSD(values, mean = null) {
    if (!values || values.length < 2) {
        return 0;
    }

    const m = mean !== null ? mean : safeMean(values, 0);
    const sumSquaredDev = values.reduce((a, b) => a + Math.pow(b - m, 2), 0);

    // Bessel's correction: divide by (n-1) instead of n
    return Math.sqrt(sumSquaredDev / (values.length - 1));
}

/**
 * Calculate population standard deviation
 * Uses n denominator (for reference/documentation)
 *
 * @param {number[]} values - Array of numeric values
 * @param {number|null} mean - Pre-calculated mean (optional, computed if null)
 * @returns {number} Population standard deviation
 */
export function populationSD(values, mean = null) {
    if (!values || values.length === 0) {
        return 0;
    }

    const m = mean !== null ? mean : safeMean(values, 0);
    const sumSquaredDev = values.reduce((a, b) => a + Math.pow(b - m, 2), 0);

    return Math.sqrt(sumSquaredDev / values.length);
}

/**
 * Calculate z-score with division-by-zero guard
 * When std=0 (all values identical), returns 0 (no anomaly)
 *
 * @param {number} value - The value to calculate z-score for
 * @param {number} mean - The mean of the distribution
 * @param {number} std - The standard deviation
 * @param {number} fallback - Value to return when std=0 (default: 0)
 * @returns {number} Z-score or fallback when std=0
 */
export function safeZScore(value, mean, std, fallback = 0) {
    // When std is 0, all values are identical — no deviation possible
    if (std === 0 || std === null || std === undefined) {
        return fallback;
    }

    return (value - mean) / std;
}

/**
 * Calculate deviation percentage with division-by-zero guard
 * When mean=0, returns "0.0%" (cannot compute meaningful deviation)
 *
 * @param {number} value - The value to calculate deviation for
 * @param {number} mean - The mean/baseline
 * @param {number} decimals - Number of decimal places (default: 1)
 * @returns {string} Deviation percentage string (e.g., "15.2%") or "0.0%" when mean=0
 */
export function safeDeviationPercent(value, mean, decimals = 1) {
    // Cannot compute deviation percentage with zero mean
    if (mean === 0 || mean === null || mean === undefined) {
        return '0.0%';
    }

    const percent = ((value - mean) / mean) * 100;
    return percent.toFixed(decimals) + '%';
}

/**
 * Complete anomaly detection pipeline with all guards
 * Combines mean, sample SD, z-score, and deviation calculations safely
 *
 * @param {number[]} values - Array of numeric values for analysis
 * @param {number} threshold - Z-score threshold for anomaly (default: 2.5)
 * @returns {Object} Object with mean, std, and anomalies array
 *   Each anomaly: { value, mean, deviation, zscore, deviation_percent }
 */
export function safeAnomalyDetection(values, threshold = 2.5) {
    const mean = safeMean(values, 0);
    const std = sampleSD(values, mean);

    const anomalies = values
        .map((value) => ({
            value,
            mean,
            deviation: value - mean,
            zscore: safeZScore(value, mean, std, 0),
            deviation_percent: safeDeviationPercent(value, mean, 1)
        }))
        .filter((d) => Math.abs(d.zscore) > threshold);

    return {
        mean,
        std,
        anomalies
    };
}

/**
 * Configuration for stats correction module
 */
export const STATS_CONFIG = {
    // Default fallback for safeMean when array is empty
    mean_fallback: 0,

    // Default standard deviation fallback
    std_fallback: 0,

    // Default z-score fallback when std=0
    zscore_fallback: 0,

    // Default deviation percent when mean=0
    deviation_percent_fallback: '0.0%',

    // Default anomaly detection threshold (z-score)
    anomaly_threshold: 2.5,

    // Use sample SD (Bessel's correction) by default
    use_sample_sd: true,

    // Number of decimal places for percentage formatting
    percentage_decimals: 1
};

export default {
    safeMean,
    sampleSD,
    populationSD,
    safeZScore,
    safeDeviationPercent,
    safeAnomalyDetection,
    STATS_CONFIG
};
