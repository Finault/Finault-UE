/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINAULT ERROR TAXONOMY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Gap #9: Error Handling and Observability Standards — P0 (Before Any Customer)
 *
 * Problem: The gateway uses ad-hoc error codes (AUTH_MISSING_KEY, VALIDATION_ERROR,
 * PROVIDER_ERROR). The AgentOS API uses generic { success: false, error: message }.
 * No consistent taxonomy means customers can't programmatically handle errors,
 * support can't triage, and dashboards can't alert on categories.
 *
 * This module provides:
 * - 15 FINAULT-xxxx error codes covering every error category
 * - Consistent error response format across gateway and AgentOS API
 * - HTTP status code mapping
 * - Retry guidance per error type
 * - FinaultError class for programmatic error handling
 * - Structured logging helper with trace context
 * - Error classification for unknown/wrapped errors
 *
 * Error Code Ranges:
 * - FINAULT-1xxx: Client validation errors (400)
 * - FINAULT-2xxx: Authentication/authorization errors (401, 403)
 * - FINAULT-3xxx: Resource errors (404)
 * - FINAULT-4xxx: Conflict/integrity errors (409)
 * - FINAULT-5xxx: Rate/quota/budget errors (402, 429)
 * - FINAULT-6xxx: Provider/upstream errors (502, 504)
 * - FINAULT-7xxx: Internal/infrastructure errors (500, 503)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─── Error Code Registry ─────────────────────────────────────────────────────

export const FINAULT_ERRORS = {
    // ── 1xxx: Validation Errors ──
    VALIDATION_ERROR: {
        code: 'FINAULT-1001',
        httpStatus: 400,
        category: 'validation',
        message: 'Validation error',
        retryable: false,
        description: 'Invalid input format, missing required fields, or constraint violation'
    },
    PARSE_ERROR: {
        code: 'FINAULT-1002',
        httpStatus: 400,
        category: 'validation',
        message: 'Parse error',
        retryable: false,
        description: 'Cannot extract or parse data from uploaded file or input'
    },

    // ── 2xxx: Authentication/Authorization ──
    AUTHENTICATION_ERROR: {
        code: 'FINAULT-2001',
        httpStatus: 401,
        category: 'authentication',
        message: 'Authentication error',
        retryable: false,
        description: 'Invalid, expired, or missing API key or token'
    },
    AUTHORIZATION_ERROR: {
        code: 'FINAULT-2002',
        httpStatus: 403,
        category: 'authorization',
        message: 'Authorization error',
        retryable: false,
        description: 'Insufficient permissions for this operation'
    },
    TENANT_SUSPENDED: {
        code: 'FINAULT-2003',
        httpStatus: 403,
        category: 'authorization',
        message: 'Tenant suspended',
        retryable: false,
        description: 'Organization account is suspended or deactivated'
    },

    // ── 3xxx: Resource Errors ──
    RESOURCE_NOT_FOUND: {
        code: 'FINAULT-3001',
        httpStatus: 404,
        category: 'resource',
        message: 'Resource not found',
        retryable: false,
        description: 'Requested invoice, close pack, budget, or other resource does not exist'
    },

    // ── 4xxx: Conflict/Integrity ──
    CONFLICT: {
        code: 'FINAULT-4001',
        httpStatus: 409,
        category: 'conflict',
        message: 'Resource conflict',
        retryable: false,
        retryAfterResolution: true,
        description: 'Operation conflicts with current state (e.g., reconciliation already running)'
    },
    INTEGRITY_VIOLATION: {
        code: 'FINAULT-4002',
        httpStatus: 409,
        category: 'integrity',
        message: 'Integrity violation',
        retryable: false,
        description: 'Operation would violate data integrity (e.g., close pack already sealed)'
    },

    // ── 5xxx: Rate/Quota/Budget ──
    RATE_LIMITED: {
        code: 'FINAULT-5001',
        httpStatus: 429,
        category: 'rate_limit',
        message: 'Rate limit exceeded',
        retryable: true,
        retryStrategy: 'respect Retry-After header',
        description: 'API rate limit exceeded for this tier'
    },
    QUOTA_EXCEEDED: {
        code: 'FINAULT-5002',
        httpStatus: 402,
        category: 'quota',
        message: 'Quota exceeded',
        retryable: false,
        retryAfterResolution: true,
        description: 'Monthly invoice, API call, or storage quota exceeded for current plan'
    },
    BUDGET_EXCEEDED: {
        code: 'FINAULT-5003',
        httpStatus: 402,
        category: 'budget',
        message: 'Budget exceeded',
        retryable: false,
        retryAfterResolution: true,
        description: 'AI spend budget exceeded for this cost center or organization'
    },

    // ── 6xxx: Provider/Upstream ──
    PROVIDER_ERROR: {
        code: 'FINAULT-6001',
        httpStatus: 502,
        category: 'provider',
        message: 'Provider error',
        retryable: true,
        retryStrategy: 'exponential backoff (1s, 2s, 4s)',
        description: 'AI provider API returned an error response'
    },
    PROVIDER_TIMEOUT: {
        code: 'FINAULT-6002',
        httpStatus: 504,
        category: 'provider',
        message: 'Provider timeout',
        retryable: true,
        retryStrategy: 'exponential backoff (1s, 2s, 4s)',
        description: 'AI provider API did not respond within timeout window'
    },

    // ── 7xxx: Internal/Infrastructure ──
    INTERNAL_ERROR: {
        code: 'FINAULT-7001',
        httpStatus: 500,
        category: 'internal',
        message: 'Internal error',
        retryable: true,
        retryStrategy: 'retry once after 1s',
        description: 'Unexpected server error'
    },
    SERVICE_UNAVAILABLE: {
        code: 'FINAULT-7002',
        httpStatus: 503,
        category: 'infrastructure',
        message: 'Service unavailable',
        retryable: true,
        retryStrategy: 'respect Retry-After header',
        description: 'Agent or service temporarily unavailable for maintenance or scaling'
    }
};

// ─── Reverse lookup: FINAULT-xxxx → error definition ─────────────────────────

const CODE_LOOKUP = {};
for (const [key, def] of Object.entries(FINAULT_ERRORS)) {
    CODE_LOOKUP[def.code] = { ...def, key };
}

/**
 * Look up an error definition by its FINAULT-xxxx code
 * @param {string} code - e.g., 'FINAULT-1001'
 * @returns {Object|null}
 */
export function lookupByCode(code) {
    return CODE_LOOKUP[code] || null;
}

// ─── Legacy code mapping (gateway.ts → FINAULT codes) ────────────────────────

const LEGACY_CODE_MAP = {
    'AUTH_MISSING_KEY': FINAULT_ERRORS.AUTHENTICATION_ERROR,
    'AUTH_INVALID_PREFIX': FINAULT_ERRORS.AUTHENTICATION_ERROR,
    'AUTH_KEY_REVOKED': FINAULT_ERRORS.AUTHENTICATION_ERROR,
    'AUTH_KEY_EXPIRED': FINAULT_ERRORS.AUTHENTICATION_ERROR,
    'RATE_LIMIT_EXCEEDED': FINAULT_ERRORS.RATE_LIMITED,
    'VALIDATION_ERROR': FINAULT_ERRORS.VALIDATION_ERROR,
    'VALIDATION_PAYLOAD_TOO_LARGE': FINAULT_ERRORS.VALIDATION_ERROR,
    'VALIDATION_INVALID_MODEL': FINAULT_ERRORS.VALIDATION_ERROR,
    'BUDGET_EXCEEDED': FINAULT_ERRORS.BUDGET_EXCEEDED,
    'PROVIDER_ERROR': FINAULT_ERRORS.PROVIDER_ERROR,
    'PROVIDER_TIMEOUT': FINAULT_ERRORS.PROVIDER_TIMEOUT,
    'ENDPOINT_NOT_FOUND': FINAULT_ERRORS.RESOURCE_NOT_FOUND,
    'GATEWAY_ERROR': FINAULT_ERRORS.INTERNAL_ERROR
};

/**
 * Map a legacy error code to its FINAULT equivalent
 * @param {string} legacyCode
 * @returns {Object}
 */
export function mapLegacyCode(legacyCode) {
    return LEGACY_CODE_MAP[legacyCode] || FINAULT_ERRORS.INTERNAL_ERROR;
}

// ─── FinaultError Class ──────────────────────────────────────────────────────

export class FinaultError extends Error {
    /**
     * @param {string} errorKey - Key from FINAULT_ERRORS (e.g., 'VALIDATION_ERROR')
     * @param {string} [detail] - Human-readable detail about this specific occurrence
     * @param {Object} [context] - Additional context for logging
     */
    constructor(errorKey, detail, context = {}) {
        const def = FINAULT_ERRORS[errorKey];
        if (!def) {
            throw new Error(`Unknown FINAULT error key: '${errorKey}'. Valid keys: ${Object.keys(FINAULT_ERRORS).join(', ')}`);
        }

        super(detail || def.message);
        this.name = 'FinaultError';
        this.code = def.code;
        this.httpStatus = def.httpStatus;
        this.category = def.category;
        this.retryable = def.retryable;
        this.retryStrategy = def.retryStrategy || null;
        this.detail = detail || def.description;
        this.context = context;
        this.timestamp = new Date().toISOString();
        // Auto-generate correlation ID if not provided in context
        this.correlationId = context.correlationId || context.requestId || context.trace_id || `err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    /**
     * Convert to API response body
     * @param {string} [requestId] - Request correlation ID
     * @returns {Object}
     */
    toResponse(requestId) {
        const response = {
            success: false,
            error: {
                code: this.code,
                message: this.detail,
                category: this.category,
                retryable: this.retryable,
                correlationId: this.correlationId
            }
        };

        if (requestId) {
            response.error.requestId = requestId;
        }

        if (this.retryable && this.retryStrategy) {
            response.error.retryStrategy = this.retryStrategy;
        }

        return response;
    }

    /**
     * Convert to structured log entry
     * @param {Object} [traceContext] - { trace_id, span_id, org_id, user_id }
     * @returns {Object}
     */
    toLogEntry(traceContext = {}) {
        return {
            timestamp: this.timestamp,
            level: this.httpStatus >= 500 ? 'error' : 'warn',
            service: this.context.service || 'unknown',
            trace_id: traceContext.trace_id || this.context.trace_id || null,
            span_id: traceContext.span_id || this.context.span_id || null,
            org_id: traceContext.org_id || this.context.org_id || null,
            user_id: traceContext.user_id || this.context.user_id || null,
            error_code: this.code,
            message: this.detail,
            context: this.context,
            stack: this.stack
        };
    }
}

// ─── Error Classification ────────────────────────────────────────────────────

/**
 * Classify an unknown error into a FINAULT error category.
 * Wraps native errors, HTTP errors, and provider errors into the taxonomy.
 *
 * @param {Error|Object} error - The raw error to classify
 * @param {Object} [context] - Additional context
 * @returns {FinaultError}
 */
export function classifyError(error, context = {}) {
    // Already a FinaultError
    if (error instanceof FinaultError) {
        return error;
    }

    const message = error?.message || String(error);
    const status = error?.status || error?.statusCode || error?.response?.status;
    let classifiedError;

    // HTTP status-based classification
    if (status) {
        if (status === 400) classifiedError = new FinaultError('VALIDATION_ERROR', message, context);
        else if (status === 401) classifiedError = new FinaultError('AUTHENTICATION_ERROR', message, context);
        else if (status === 403) classifiedError = new FinaultError('AUTHORIZATION_ERROR', message, context);
        else if (status === 404) classifiedError = new FinaultError('RESOURCE_NOT_FOUND', message, context);
        else if (status === 409) classifiedError = new FinaultError('CONFLICT', message, context);
        else if (status === 429) classifiedError = new FinaultError('RATE_LIMITED', message, context);
        else if (status === 502) classifiedError = new FinaultError('PROVIDER_ERROR', message, context);
        else if (status === 503) classifiedError = new FinaultError('SERVICE_UNAVAILABLE', message, context);
        else if (status === 504) classifiedError = new FinaultError('PROVIDER_TIMEOUT', message, context);
        else classifiedError = new FinaultError('INTERNAL_ERROR', message, context);

        if (classifiedError) {
            logger.info('Error classified from HTTP status', {
                originalStatus: status,
                classifiedCode: classifiedError.code,
                originalType: error.constructor?.name
            });
            return classifiedError;
        }
    }

    // Message-based classification
    const lowerMsg = message.toLowerCase();
    if (lowerMsg.includes('timeout') || lowerMsg.includes('timed out') || lowerMsg.includes('etimedout')) {
        classifiedError = new FinaultError('PROVIDER_TIMEOUT', message, context);
    } else if (lowerMsg.includes('rate limit') || lowerMsg.includes('too many requests')) {
        classifiedError = new FinaultError('RATE_LIMITED', message, context);
    } else if (lowerMsg.includes('unauthorized') || lowerMsg.includes('invalid.*key') || lowerMsg.includes('expired.*token')) {
        classifiedError = new FinaultError('AUTHENTICATION_ERROR', message, context);
    } else if (lowerMsg.includes('forbidden') || lowerMsg.includes('permission')) {
        classifiedError = new FinaultError('AUTHORIZATION_ERROR', message, context);
    } else if (lowerMsg.includes('not found')) {
        classifiedError = new FinaultError('RESOURCE_NOT_FOUND', message, context);
    } else if (lowerMsg.includes('validation') || lowerMsg.includes('invalid') || lowerMsg.includes('required')) {
        classifiedError = new FinaultError('VALIDATION_ERROR', message, context);
    } else if (lowerMsg.includes('budget') || lowerMsg.includes('spend limit')) {
        classifiedError = new FinaultError('BUDGET_EXCEEDED', message, context);
    } else if (lowerMsg.includes('quota') || lowerMsg.includes('limit reached')) {
        classifiedError = new FinaultError('QUOTA_EXCEEDED', message, context);
    } else if (lowerMsg.includes('conflict') || lowerMsg.includes('already exists') || lowerMsg.includes('duplicate')) {
        classifiedError = new FinaultError('CONFLICT', message, context);
    } else if (lowerMsg.includes('sealed') || lowerMsg.includes('integrity') || lowerMsg.includes('immutable')) {
        classifiedError = new FinaultError('INTEGRITY_VIOLATION', message, context);
    } else {
        // Default: internal error
        classifiedError = new FinaultError('INTERNAL_ERROR', message, context);
    }

    logger.info('Error classified from message pattern', {
        classifiedCode: classifiedError.code,
        originalType: error?.constructor?.name || typeof error,
        messagePattern: lowerMsg.substring(0, 50)
    });

    return classifiedError;
}

// ─── Structured Logger (used by error classification) ───────────────────────

import { createLogger } from './structured-logger.js';

const logger = createLogger('error-taxonomy');

// ─── Structured Logging Helper ───────────────────────────────────────────────

/**
 * Create a structured log entry following the Finault logging standard.
 *
 * @param {string} level - 'debug' | 'info' | 'warn' | 'error' | 'fatal'
 * @param {string} service - Service name (e.g., 'reconciliation', 'gateway', 'agentos')
 * @param {string} message - Human-readable message
 * @param {Object} [context] - Additional context fields
 * @param {Object} [traceContext] - { trace_id, span_id, org_id, user_id }
 * @returns {Object} Structured log entry
 */
export function createLogEntry(level, service, message, context = {}, traceContext = {}) {
    return {
        timestamp: new Date().toISOString(),
        level,
        service,
        trace_id: traceContext.trace_id || null,
        span_id: traceContext.span_id || null,
        org_id: traceContext.org_id || null,
        user_id: traceContext.user_id || null,
        message,
        context,
        duration_ms: context.duration_ms || null
    };
}

// ─── Hono Middleware Error Handler ───────────────────────────────────────────

/**
 * Create a Hono-compatible error response from any error.
 * Replaces the ad-hoc safeErrorResponse in server.js.
 *
 * @param {Object} c - Hono context
 * @param {Error} error - The error to handle
 * @param {Object} [context] - Additional context (service, org_id, etc.)
 * @returns {Response}
 */
export function handleApiError(c, error, context = {}) {
    const finaultError = classifyError(error, {
        ...context,
        service: context.service || 'agentos-api',
        org_id: context.org_id || c.get?.('jwtPayload')?.org,
        user_id: context.user_id || c.get?.('jwtPayload')?.sub
    });

    const requestId = c.get?.('requestId') || crypto.randomUUID?.() || `req_${Date.now()}`;

    // Structured log
    const logEntry = finaultError.toLogEntry({
        org_id: context.org_id || c.get?.('jwtPayload')?.org,
        user_id: context.user_id || c.get?.('jwtPayload')?.sub
    });

    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
        delete logEntry.stack;
    }
    console.error(JSON.stringify(logEntry));

    return c.json(finaultError.toResponse(requestId), finaultError.httpStatus);
}

// ─── Gateway Error Response Builder ──────────────────────────────────────────

/**
 * Build a FINAULT-coded error response for the gateway (non-Hono).
 * Maps legacy codes to FINAULT taxonomy.
 *
 * @param {string} legacyCode - Legacy gateway error code
 * @param {string} message - Error detail
 * @param {string} requestId - Request correlation ID
 * @param {Object} [headers] - Additional response headers (e.g., Retry-After)
 * @returns {{ body: Object, status: number, headers: Object }}
 */
export function buildGatewayError(legacyCode, message, requestId, headers = {}) {
    const def = mapLegacyCode(legacyCode);
    const responseHeaders = { ...headers };

    if (def.code === 'FINAULT-5001' && !responseHeaders['Retry-After']) {
        responseHeaders['Retry-After'] = '60';
    }

    return {
        body: {
            success: false,
            error: {
                code: def.code,
                legacyCode,
                message,
                category: def.category,
                retryable: def.retryable,
                requestId
            }
        },
        status: def.httpStatus,
        headers: responseHeaders
    };
}

export default {
    FINAULT_ERRORS,
    FinaultError,
    classifyError,
    handleApiError,
    buildGatewayError,
    lookupByCode,
    mapLegacyCode,
    createLogEntry
};
