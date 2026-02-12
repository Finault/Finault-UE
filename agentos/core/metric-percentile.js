/**
 * METRIC PERCENTILE (W-018)
 * Safe percentile and aggregate metric computation
 *
 * PROBLEMS FIXED:
 * 1. observability.js ~line 306-308: percentile() returns undefined on empty array
 *    because sorted[0] is undefined when array is empty.
 * 2. observability.js ~line 294: avg = sum / values.length is NaN when values is empty.
 * 3. The non-interpolating percentile formula Math.ceil((p/100)*n)-1 gives inaccurate
 *    results for small arrays.
 *
 * SOLUTION:
 * 1. safePercentile() returns fallback on empty array
 * 2. safeAggregate() returns 0 for all stats when array is empty
 * 3. Proper linear interpolation for percentile computation
 */

/**
 * Configuration object for metric percentile settings
 */
export const METRIC_PERCENTILE_CONFIG = {
    defaultFallback: 0,
    emptyArrayBehavior: 'fallback', // 'fallback' or 'throw'
    percentileMethod: 'linear_interpolation', // 'linear_interpolation' or 'nearest_rank'
    nanReplacement: 0,
    infinityReplacement: 0
};

/**
 * Safe percentile calculation with linear interpolation
 *
 * @param {number[]} sorted - Array of numbers, already sorted in ascending order
 * @param {number} p - Percentile (0-100)
 * @param {number} fallback - Value to return if array is empty or invalid
 * @returns {number} The calculated percentile or fallback value
 */
export function safePercentile(sorted, p, fallback = METRIC_PERCENTILE_CONFIG.defaultFallback) {
    // Handle null, undefined, or non-array inputs
    if (!sorted || !Array.isArray(sorted)) {
        return fallback;
    }

    // Handle empty array
    if (sorted.length === 0) {
        return fallback;
    }

    // Handle invalid percentile values
    if (p < 0 || p > 100 || typeof p !== 'number') {
        return fallback;
    }

    // Single element
    if (sorted.length === 1) {
        const val = sorted[0];
        if (Number.isNaN(val) || !Number.isFinite(val)) {
            return fallback;
        }
        return val;
    }

    // Linear interpolation method (more accurate for small samples)
    // Position in the dataset (0-indexed)
    // For p=0, position should be 0 (first element)
    // For p=100, position should be length-1 (last element)
    const position = (p / 100) * (sorted.length - 1);
    const lowerIndex = Math.floor(position);
    const upperIndex = Math.ceil(position);
    const weight = position - lowerIndex;

    // Get the values at these indices
    let lowerValue = sorted[lowerIndex];
    let upperValue = sorted[upperIndex] !== undefined ? sorted[upperIndex] : lowerValue;

    // Handle NaN/Infinity in the data
    if (Number.isNaN(lowerValue) || !Number.isFinite(lowerValue)) {
        return fallback;
    }
    if (Number.isNaN(upperValue) || !Number.isFinite(upperValue)) {
        upperValue = lowerValue; // Use lower value if upper is invalid
    }

    // If same index (no interpolation needed)
    if (lowerIndex === upperIndex) {
        return lowerValue;
    }

    // Linear interpolation between two values
    const result = lowerValue + weight * (upperValue - lowerValue);
    return result;
}

/**
 * Safe average calculation
 *
 * @param {number[]} values - Array of numbers
 * @param {number} fallback - Value to return if array is empty
 * @returns {number} The average or fallback value
 */
export function safeAvg(values, fallback = METRIC_PERCENTILE_CONFIG.defaultFallback) {
    if (!values || !Array.isArray(values)) {
        return fallback;
    }

    if (values.length === 0) {
        return fallback;
    }

    // Filter out NaN and Infinity values
    const validValues = values.filter(v => Number.isFinite(v));

    if (validValues.length === 0) {
        return fallback;
    }

    const sum = validValues.reduce((a, b) => a + b, 0);
    const avg = sum / validValues.length;

    // Ensure result is not NaN or Infinity
    if (!Number.isFinite(avg)) {
        return fallback;
    }

    return avg;
}

/**
 * Safe aggregate metrics calculation
 *
 * @param {number[]} values - Array of numbers
 * @param {number} fallback - Value to return for stats if array is empty
 * @returns {Object} Object with count, sum, avg, min, max, p50, p95, p99
 */
export function safeAggregate(values, fallback = METRIC_PERCENTILE_CONFIG.defaultFallback) {
    // Handle null, undefined, or non-array inputs
    if (!values || !Array.isArray(values)) {
        return {
            count: 0,
            sum: fallback,
            avg: fallback,
            min: fallback,
            max: fallback,
            p50: fallback,
            p95: fallback,
            p99: fallback
        };
    }

    // Handle empty array
    if (values.length === 0) {
        return {
            count: 0,
            sum: fallback,
            avg: fallback,
            min: fallback,
            max: fallback,
            p50: fallback,
            p95: fallback,
            p99: fallback
        };
    }

    // Filter out non-numeric values but keep track of them
    const validValues = values.filter(v => Number.isFinite(v));

    // If all values are NaN or Infinity, return fallback
    if (validValues.length === 0) {
        return {
            count: values.length,
            sum: fallback,
            avg: fallback,
            min: fallback,
            max: fallback,
            p50: fallback,
            p95: fallback,
            p99: fallback
        };
    }

    // Calculate basic stats
    const sum = validValues.reduce((a, b) => a + b, 0);
    const avg = sum / validValues.length;
    const sorted = [...validValues].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];

    return {
        count: values.length,
        sum: sum,
        avg: Number.isFinite(avg) ? avg : fallback,
        min: min,
        max: max,
        p50: safePercentile(sorted, 50, fallback),
        p95: safePercentile(sorted, 95, fallback),
        p99: safePercentile(sorted, 99, fallback)
    };
}
