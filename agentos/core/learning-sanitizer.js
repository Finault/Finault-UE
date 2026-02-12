/**
 * LEARNING SANITIZER (W-016)
 * Safe number parsing for compound-learning verification pipeline
 *
 * PROBLEMS FIXED:
 * 1. compound-learning.js ~line 437: parseFloat(v.error_pct) where error_pct is undefined
 *    for failed verification entries (catch block has no error_pct). NaN corrupts avgError.
 * 2. compound-learning.js ~line 396: forecast.predicted_amount may be a formatted string
 *    ("$1,234.56") — arithmetic with strings produces NaN.
 *
 * SOLUTION:
 * 1. parseFormattedNumber() strips $, %, commas before parsing
 * 2. safeReduceNumeric() skips NaN entries instead of corrupting the accumulator
 * 3. ensureNumeric() converts any value to a finite number with fallback
 */

export const LEARNING_SANITIZER_CONFIG = {
    fallbackValue: 0,
    minFiniteValue: -Infinity,
    maxFiniteValue: Infinity,
    supportedCurrencies: ['$', '€', '£', '¥'],
    supportedSuffixes: ['%', 'K', 'M', 'B']
};

/**
 * Parse a formatted number string into a float
 * Handles currency symbols, percentages, commas, whitespace
 * @param {string|number|null|undefined} str - The value to parse
 * @param {number} fallback - Value to return if parsing fails
 * @returns {number} Parsed number or fallback
 */
export function parseFormattedNumber(str, fallback = 0) {
    if (str === null || str === undefined) {
        return fallback;
    }

    // If already a number, validate it
    if (typeof str === 'number') {
        return Number.isFinite(str) ? str : fallback;
    }

    // Convert to string if not already
    if (typeof str !== 'string') {
        str = String(str);
    }

    // Trim whitespace
    str = str.trim();

    if (str.length === 0) {
        return fallback;
    }

    // Remove currency symbols
    let cleaned = str;
    for (const currency of LEARNING_SANITIZER_CONFIG.supportedCurrencies) {
        cleaned = cleaned.replace(currency, '');
    }

    // Remove percentage sign (but keep the number)
    cleaned = cleaned.replace('%', '');

    // Remove commas and other thousands separators
    cleaned = cleaned.replace(/,/g, '');
    cleaned = cleaned.replace(/ /g, '');

    // Handle K, M, B suffixes (e.g., "1.5K" -> 1500)
    let multiplier = 1;
    if (cleaned.endsWith('K')) {
        cleaned = cleaned.slice(0, -1);
        multiplier = 1000;
    } else if (cleaned.endsWith('M')) {
        cleaned = cleaned.slice(0, -1);
        multiplier = 1000000;
    } else if (cleaned.endsWith('B')) {
        cleaned = cleaned.slice(0, -1);
        multiplier = 1000000000;
    }

    // Parse as float
    const parsed = parseFloat(cleaned);

    // Return parsed value if finite, else fallback
    if (Number.isFinite(parsed)) {
        return parsed * multiplier;
    }

    return fallback;
}

/**
 * Ensure a value is numeric and finite
 * @param {any} val - The value to convert
 * @param {number} fallback - Value to return if conversion fails
 * @returns {number} Numeric value or fallback
 */
export function ensureNumeric(val, fallback = 0) {
    if (typeof val === 'number') {
        return Number.isFinite(val) ? val : fallback;
    }

    if (typeof val === 'string') {
        return parseFormattedNumber(val, fallback);
    }

    if (val === null || val === undefined) {
        return fallback;
    }

    // Try to convert other types
    const converted = Number(val);
    return Number.isFinite(converted) ? converted : fallback;
}

/**
 * Safely reduce numeric values, skipping NaN entries
 * @param {Array} items - Array of items to reduce
 * @param {Function} accessor - Function to extract numeric value from each item
 * @param {number} fallback - Fallback value for empty results
 * @returns {Object} { sum, count, avg } with count > 0, or all zeros if empty
 */
export function safeReduceNumeric(items, accessor, fallback = 0) {
    if (!items || !Array.isArray(items) || items.length === 0) {
        return { sum: fallback, count: 0, avg: fallback };
    }

    let sum = 0;
    let count = 0;

    for (const item of items) {
        const value = accessor(item);
        const numericValue = ensureNumeric(value, null);

        // Only count finite values
        if (numericValue !== null && Number.isFinite(numericValue)) {
            sum += numericValue;
            count++;
        }
    }

    const avg = count > 0 ? sum / count : fallback;

    return { sum, count, avg };
}

/**
 * Safely compute accuracy rate from items matching a predicate
 * @param {Array} items - Array of items to evaluate
 * @param {Function} predicate - Function returning boolean for each item
 * @param {number} fallback - Value to return if items is empty
 * @returns {number} Rate between 0 and 1, or fallback if empty
 */
export function safeAccuracyRate(items, predicate, fallback = 0) {
    if (!items || !Array.isArray(items) || items.length === 0) {
        return fallback;
    }

    let matchCount = 0;
    for (const item of items) {
        try {
            if (predicate(item)) {
                matchCount++;
            }
        } catch (e) {
            // Skip items that cause predicate to throw
            continue;
        }
    }

    return matchCount / items.length;
}

/**
 * Safely compute running average with proper NaN handling
 * @param {number} currentAvg - Current average (may be NaN/undefined)
 * @param {number} count - Number of items already averaged
 * @param {number} newValue - New value to add
 * @returns {number} Updated average
 */
export function safeRunningAverage(currentAvg, count, newValue) {
    const numericCurrent = ensureNumeric(currentAvg, 0);
    const numericNew = ensureNumeric(newValue, 0);

    return (numericCurrent * count + numericNew) / (count + 1);
}

/**
 * Filter out NaN, undefined, null, and non-finite numbers from array
 * @param {Array} arr - Array to filter
 * @returns {Array} Filtered array with only finite numbers
 */
export function filterFiniteNumbers(arr) {
    if (!Array.isArray(arr)) {
        return [];
    }

    return arr.filter(val => {
        const num = ensureNumeric(val, null);
        return num !== null && Number.isFinite(num);
    });
}

/**
 * Safe division that avoids division by zero
 * @param {number} dividend - Numerator
 * @param {number} divisor - Denominator
 * @param {number} fallback - Value if divisor is 0 or non-finite
 * @returns {number} Result or fallback
 */
export function safeDivide(dividend, divisor, fallback = 0) {
    const numDividend = ensureNumeric(dividend, 0);
    const numDivisor = ensureNumeric(divisor, 0);

    if (numDivisor === 0 || !Number.isFinite(numDivisor)) {
        return fallback;
    }

    const result = numDividend / numDivisor;
    return Number.isFinite(result) ? result : fallback;
}

export default {
    parseFormattedNumber,
    ensureNumeric,
    safeReduceNumeric,
    safeAccuracyRate,
    safeRunningAverage,
    filterFiniteNumbers,
    safeDivide,
    LEARNING_SANITIZER_CONFIG
};
