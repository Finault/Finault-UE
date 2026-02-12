/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * W-020: API RESPONSE GUARD
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Safe API response handling with JSON parsing protection.
 *
 * PROBLEMS FIXED:
 * 1. worker.js ~line 199: aiResponse.json() throws SyntaxError on non-JSON responses
 *    (HTML error pages, empty bodies, malformed JSON). No try-catch protection.
 * 2. worker.js: aiResponse.ok is never checked — 429/500 responses are used as valid data.
 * 3. No structured error handling for different failure modes (network, auth, rate limit, server).
 *
 * SOLUTION:
 * 1. safeJsonParse() wraps .json() in try-catch with structured error return
 * 2. guardedApiCall() checks response.ok and handles HTTP error codes
 * 3. Categorized error responses for different failure modes
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─── Constants ───────────────────────────────────────────────────────────────

export const API_RESPONSE_CONFIG = {
    // HTTP status code categorization
    categories: {
        'rate_limit': [429],
        'auth_error': [401, 403],
        'not_found': [404],
        'server_error': [500, 501, 502, 503, 504],
        'client_error': [400, 405, 406, 409, 410, 412, 413, 414, 415]
    },
    // Retry hints per category
    retryHints: {
        'rate_limit': 'Retry after 60 seconds',
        'auth_error': 'Check API credentials',
        'not_found': 'Endpoint or resource not found',
        'server_error': 'Service temporarily unavailable, retry later',
        'client_error': 'Invalid request parameters',
        'unknown': 'Unknown error'
    },
    // Default fallback content
    defaultFallbackContent: 'I apologize, the AI service is temporarily unavailable.',
    // Response shape for OpenAI-compatible APIs
    emptyOpenAIResponse: {
        choices: [{ message: { content: '' }, index: 0 }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    }
};

// ─── Safe JSON Parsing ───────────────────────────────────────────────────────

/**
 * Safely parse a Response object's JSON body.
 *
 * @param {Response} response - Fetch API Response object
 * @param {*} fallback - Value to return if parsing fails (default: null)
 * @returns {Promise<{ok: boolean, data: *, error: string|null, statusCode: number}>}
 *
 * Returns structure:
 * - ok: true if response.ok AND JSON parse succeeded
 * - data: Parsed JSON object, or fallback if parse failed
 * - error: Error message if something failed
 * - statusCode: HTTP status code from response
 */
export async function safeJsonParse(response, fallback = null) {
    // Guard against null/undefined response
    if (!response) {
        return {
            ok: false,
            data: fallback,
            error: 'Response object is null or undefined',
            statusCode: 0
        };
    }

    // Get status code
    const statusCode = response.status || 0;

    // Check response.ok (2xx status codes)
    if (!response.ok) {
        const errorCategory = categorizeHttpError(statusCode);
        const errorMsg = `HTTP ${statusCode} (${errorCategory})`;
        return {
            ok: false,
            data: fallback,
            error: errorMsg,
            statusCode
        };
    }

    // Try to parse JSON
    try {
        const data = await response.json();
        return {
            ok: true,
            data,
            error: null,
            statusCode
        };
    } catch (parseError) {
        // JSON parse failed (malformed JSON, empty body, HTML response, etc.)
        const errorMsg = parseError instanceof SyntaxError
            ? `JSON parse error: ${parseError.message}`
            : `Failed to parse response: ${parseError.message}`;

        return {
            ok: false,
            data: fallback,
            error: errorMsg,
            statusCode
        };
    }
}

// ─── HTTP Error Categorization ──────────────────────────────────────────────

/**
 * Categorize HTTP status code into error type.
 *
 * @param {number} status - HTTP status code
 * @returns {string} - Error category: 'rate_limit', 'auth_error', 'not_found',
 *                     'server_error', 'client_error', 'unknown'
 */
export function categorizeHttpError(status) {
    for (const [category, codes] of Object.entries(API_RESPONSE_CONFIG.categories)) {
        if (codes.includes(status)) {
            return category;
        }
    }
    return 'unknown';
}

/**
 * Get retry hint for an HTTP error category.
 *
 * @param {string} category - Error category from categorizeHttpError()
 * @returns {string} - Human-readable hint for handling the error
 */
export function getRetryHint(category) {
    return API_RESPONSE_CONFIG.retryHints[category] || API_RESPONSE_CONFIG.retryHints.unknown;
}

// ─── Fallback Response Generation ──────────────────────────────────────────

/**
 * Create a structured fallback response matching OpenAI API shape.
 * Used for graceful degradation when API calls fail.
 *
 * @param {string} error - Error message/description
 * @param {string} fallbackContent - Content to return (default: empty)
 * @returns {Object} - Response matching { choices: [...], usage: {...} }
 */
export function createFallbackResponse(error = '', fallbackContent = '') {
    const content = fallbackContent || API_RESPONSE_CONFIG.defaultFallbackContent;

    return {
        choices: [
            {
                message: {
                    content,
                    role: 'assistant'
                },
                index: 0,
                finish_reason: 'error'
            }
        ],
        usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0
        },
        error: error,
        _fallback: true
    };
}

/**
 * Create an empty OpenAI-compatible response.
 *
 * @returns {Object} - Empty response matching OpenAI API shape
 */
export function createEmptyResponse() {
    return {
        ...API_RESPONSE_CONFIG.emptyOpenAIResponse
    };
}

// ─── API Call Guard ────────────────────────────────────────────────────────

/**
 * Wrapper for fetch calls with automatic error categorization.
 * Uses the resilience layer's fetch wrapper instead of bare fetch()
 * to ensure circuit breaker, retry, and timeout protection.
 *
 * @param {string} url - API endpoint URL
 * @param {Object} options - Fetch options
 * @param {function} [fetchFn=null] - Optional pre-configured resilient fetch function
 * @returns {Promise<{ok: boolean, data: *, error: string|null, category: string}>}
 */
export async function guardedApiCall(url, options = {}, fetchFn = null) {
    try {
        // Use provided resilient fetch function, or dynamic import of resilience layer
        const doFetch = fetchFn || (await _getResilientFetch());
        const response = await doFetch(url, options);
        const { ok, data, error, statusCode } = await safeJsonParse(response);

        return {
            ok,
            data,
            error,
            category: categorizeHttpError(statusCode)
        };
    } catch (fetchError) {
        // Network errors, timeouts, etc.
        return {
            ok: false,
            data: null,
            error: `Network error: ${fetchError.message}`,
            category: 'network'
        };
    }
}

// Lazy-loaded resilient fetch to avoid circular dependency
let _cachedResilientFetch = null;
async function _getResilientFetch() {
    if (!_cachedResilientFetch) {
        try {
            const { createFetchResilience } = await import('./resilience-layer.js');
            _cachedResilientFetch = createFetchResilience('api-response-guard');
        } catch {
            // Fallback: if resilience layer unavailable, use native fetch with warning
            console.warn('[api-response-guard] Resilience layer unavailable, using native fetch');
            _cachedResilientFetch = globalThis.fetch;
        }
    }
    return _cachedResilientFetch;
}

export default {
    safeJsonParse,
    categorizeHttpError,
    getRetryHint,
    createFallbackResponse,
    createEmptyResponse,
    guardedApiCall,
    API_RESPONSE_CONFIG
};
