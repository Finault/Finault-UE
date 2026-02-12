/**
 * RESPONSE NORMALIZER (W-017)
 * Safe AI response content extraction and running average computation
 *
 * PROBLEMS FIXED:
 * 1. agent-orchestrator.js ~line 589: response.content[0].text throws TypeError
 *    when content is empty/null/undefined after API calls.
 * 2. agent-orchestrator.js ~lines 504-506: agent.avg_latency starts undefined,
 *    making (undefined * 0 + duration) = NaN. NaN propagates permanently.
 * 3. agent-orchestrator.js ~lines 511-513: agent.error_rate starts undefined,
 *    NaN propagates through error rate calculations.
 *
 * SOLUTION:
 * 1. safeExtractText() navigates response.content safely with fallback
 * 2. safeRunningAverage() treats NaN/undefined current average as 0
 * 3. safeErrorRate() safely computes incremental error rate
 * 4. initAgentStats() returns properly initialized stats
 */

export const RESPONSE_NORMALIZER_CONFIG = {
    defaultText: '',
    defaultLatency: 0,
    defaultErrorRate: 0,
    maxResponseLength: 100000
};

/**
 * Safely extract text from an AI response object
 * Handles null response, null content, empty content array, missing text field
 * @param {Object} response - The response object from Claude API
 * @param {string} fallback - Value to return if extraction fails
 * @returns {string} Extracted text or fallback
 */
export function safeExtractText(response, fallback = '') {
    if (!response) {
        return fallback;
    }

    if (!response.content) {
        return fallback;
    }

    if (!Array.isArray(response.content) || response.content.length === 0) {
        return fallback;
    }

    const firstContent = response.content[0];
    if (!firstContent) {
        return fallback;
    }

    const text = firstContent.text;
    if (typeof text === 'string') {
        // Optionally truncate if too long
        if (text.length > RESPONSE_NORMALIZER_CONFIG.maxResponseLength) {
            return text.substring(0, RESPONSE_NORMALIZER_CONFIG.maxResponseLength);
        }
        return text;
    }

    return fallback;
}

/**
 * Convert a value to a finite number safely
 * @param {any} val - The value to convert
 * @param {number} fallback - Fallback value
 * @returns {number} Finite number or fallback
 */
export function ensureFiniteNumber(val, fallback = 0) {
    if (typeof val === 'number') {
        return Number.isFinite(val) ? val : fallback;
    }

    if (typeof val === 'string') {
        const parsed = parseFloat(val);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    if (val === null || val === undefined) {
        return fallback;
    }

    const converted = Number(val);
    return Number.isFinite(converted) ? converted : fallback;
}

/**
 * Safely compute a running average
 * Treats undefined/NaN current average as 0 to avoid NaN propagation
 * @param {number} currentAvg - Current average (may be NaN/undefined)
 * @param {number} count - Number of items already averaged
 * @param {number} newValue - New value to add
 * @returns {number} Updated average
 */
export function safeRunningAverage(currentAvg, count, newValue) {
    // Convert all inputs to finite numbers
    const current = ensureFiniteNumber(currentAvg, 0);
    const c = ensureFiniteNumber(count, 0);
    const newVal = ensureFiniteNumber(newValue, 0);

    // Compute new average
    const newCount = c + 1;
    const newAverage = (current * c + newVal) / newCount;

    return ensureFiniteNumber(newAverage, 0);
}

/**
 * Safely compute incremental error rate
 * @param {number} currentRate - Current error rate (may be NaN/undefined)
 * @param {number} totalCount - Total number of items so far
 * @param {boolean} isError - Whether the new item is an error
 * @returns {number} Updated error rate
 */
export function safeErrorRate(currentRate, totalCount, isError) {
    const current = ensureFiniteNumber(currentRate, 0);
    const total = ensureFiniteNumber(totalCount, 0);

    // New count is total + 1
    const newCount = total + 1;

    // Current errors = current * total
    const currentErrors = current * total;

    // Add new error if applicable
    const newErrors = currentErrors + (isError ? 1 : 0);

    // New error rate
    const newRate = newErrors / newCount;

    return ensureFiniteNumber(newRate, 0);
}

/**
 * Initialize agent statistics object with proper numeric defaults
 * @param {Object} defaults - Optional default values to override
 * @returns {Object} Initialized stats object with all fields as finite numbers
 */
export function initAgentStats(defaults = {}) {
    return {
        tasks_completed: ensureFiniteNumber(defaults.tasks_completed, 0),
        avg_latency: ensureFiniteNumber(defaults.avg_latency, 0),
        error_rate: ensureFiniteNumber(defaults.error_rate, 0),
        success_count: ensureFiniteNumber(defaults.success_count, 0),
        failure_count: ensureFiniteNumber(defaults.failure_count, 0),
        total_duration_ms: ensureFiniteNumber(defaults.total_duration_ms, 0),
        min_latency: ensureFiniteNumber(defaults.min_latency, Infinity),
        max_latency: ensureFiniteNumber(defaults.max_latency, 0),
        last_execution_time: defaults.last_execution_time || null,
        status: defaults.status || 'idle'
    };
}

/**
 * Validate and sanitize agent stats before returning
 * @param {Object} stats - Stats object to validate
 * @returns {Object} Sanitized stats object
 */
export function sanitizeAgentStats(stats) {
    if (!stats || typeof stats !== 'object') {
        return initAgentStats();
    }

    return {
        tasks_completed: ensureFiniteNumber(stats.tasks_completed, 0),
        avg_latency: ensureFiniteNumber(stats.avg_latency, 0),
        error_rate: ensureFiniteNumber(stats.error_rate, 0),
        success_count: ensureFiniteNumber(stats.success_count, 0),
        failure_count: ensureFiniteNumber(stats.failure_count, 0),
        total_duration_ms: ensureFiniteNumber(stats.total_duration_ms, 0),
        min_latency: stats.min_latency === Infinity ? Infinity : ensureFiniteNumber(stats.min_latency, Infinity),
        max_latency: ensureFiniteNumber(stats.max_latency, 0),
        last_execution_time: stats.last_execution_time || null,
        status: typeof stats.status === 'string' ? stats.status : 'unknown'
    };
}

/**
 * Safe division that avoids division by zero
 * @param {number} dividend - Numerator
 * @param {number} divisor - Denominator
 * @param {number} fallback - Value if divisor is 0
 * @returns {number} Result or fallback
 */
export function safeDivide(dividend, divisor, fallback = 0) {
    const d = ensureFiniteNumber(divisor, 0);
    if (d === 0) {
        return fallback;
    }

    const num = ensureFiniteNumber(dividend, 0);
    const result = num / d;

    return ensureFiniteNumber(result, fallback);
}

/**
 * Safely validate that a response contains text content
 * @param {Object} response - Response object to validate
 * @returns {boolean} True if response has valid text content
 */
export function isValidResponse(response) {
    if (!response || typeof response !== 'object') {
        return false;
    }

    if (!response.content || !Array.isArray(response.content)) {
        return false;
    }

    if (response.content.length === 0) {
        return false;
    }

    const firstContent = response.content[0];
    if (!firstContent || typeof firstContent.text !== 'string') {
        return false;
    }

    return true;
}

export default {
    safeExtractText,
    safeRunningAverage,
    safeErrorRate,
    initAgentStats,
    sanitizeAgentStats,
    ensureFiniteNumber,
    safeDivide,
    isValidResponse,
    RESPONSE_NORMALIZER_CONFIG
};
