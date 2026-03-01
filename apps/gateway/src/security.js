/**
 * Security Utilities Module
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Security-focused utilities:
 * - CORS header management
 * - PII redaction (masks sensitive data in logs)
 * - Security event logging
 * - Circuit breaker pattern for upstream failures
 * - Request validation and sanitization
 *
 * This module centralizes security concerns to prevent information leakage
 * and provide consistent security practices across the gateway.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CORS HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:8000',
  'https://app.finault.ai',
  'https://dashboard.finault.ai',
  'https://finault.ai'
];

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'];
const ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Finault-API-Key',
  'X-Request-ID',
  'X-Org-ID'
];

/**
 * Get CORS headers for response
 * @param {string} origin - Request origin header
 * @param {Object} options - Additional CORS options
 * @returns {Object} Headers object with CORS headers
 */
const getCORSHeaders = (origin, options = {}) => {
  const {
    credentials = true,
    maxAge = 86400  // 24 hours
  } = options;

  // Validate origin
  const isAllowed = ALLOWED_ORIGINS.includes(origin);
  const allowOrigin = isAllowed ? origin : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': ALLOWED_METHODS.join(', '),
    'Access-Control-Allow-Headers': ALLOWED_HEADERS.join(', '),
    'Access-Control-Allow-Credentials': credentials ? 'true' : 'false',
    'Access-Control-Max-Age': String(maxAge),
    'Access-Control-Expose-Headers': [
      'Content-Type',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'X-Request-ID'
    ].join(', ')
  };
};

/**
 * Handle CORS preflight request
 * @param {Request} request - Incoming request
 * @returns {Response} 204 No Content response with CORS headers
 */
const handleCORS = (request) => {
  const origin = request.headers.get('Origin') || '';
  const corsHeaders = getCORSHeaders(origin);

  return new Response(null, {
    status: 204,
    headers: corsHeaders
  });
};

// ═══════════════════════════════════════════════════════════════════════════════
// PII REDACTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Patterns for identifying sensitive data
 */
const SENSITIVE_PATTERNS = {
  email: /[\w\.-]+@[\w\.-]+\.\w+/g,
  apiKey: /(?:api[_-]?key|key|token)["\']?\s*[=:]\s*["\']?([a-zA-Z0-9_\-]+)["\']?/gi,
  ssn: /\d{3}-\d{2}-\d{4}/g,
  creditCard: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  jwt: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g
};

/**
 * Redact PII from string data
 * @param {string} data - Data to redact
 * @param {Array<string>} patterns - Which patterns to redact (default: all)
 * @returns {string} Redacted data
 */
const redactPII = (data, patterns = ['email', 'apiKey', 'ssn', 'creditCard', 'jwt']) => {
  if (typeof data !== 'string') {
    return data;
  }

  let redacted = data;

  if (patterns.includes('email')) {
    redacted = redacted.replace(SENSITIVE_PATTERNS.email, '[EMAIL_REDACTED]');
  }

  if (patterns.includes('apiKey')) {
    redacted = redacted.replace(SENSITIVE_PATTERNS.apiKey, 'KEY_[REDACTED]');
  }

  if (patterns.includes('ssn')) {
    redacted = redacted.replace(SENSITIVE_PATTERNS.ssn, 'XXX-XX-XXXX');
  }

  if (patterns.includes('creditCard')) {
    redacted = redacted.replace(SENSITIVE_PATTERNS.creditCard, 'XXXX-XXXX-XXXX-XXXX');
  }

  if (patterns.includes('jwt')) {
    redacted = redacted.replace(SENSITIVE_PATTERNS.jwt, '[TOKEN_REDACTED]');
  }

  return redacted;
};

/**
 * Redact PII from JSON object
 * @param {Object} obj - Object to redact
 * @param {Array<string>} piiFields - Field names that contain PII
 * @returns {Object} New object with redacted values
 */
const redactPIIFromObject = (obj, piiFields = ['password', 'token', 'apiKey', 'secret']) => {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  const redacted = {};

  for (const [key, value] of Object.entries(obj)) {
    if (piiFields.includes(key)) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object') {
      redacted[key] = redactPIIFromObject(value, piiFields);
    } else if (typeof value === 'string') {
      redacted[key] = redactPII(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY EVENT LOGGING
// ═══════════════════════════════════════════════════════════════════════════════

const SECURITY_EVENT_TYPES = {
  AUTH_ATTEMPT: 'auth_attempt',
  AUTH_SUCCESS: 'auth_success',
  AUTH_FAILURE: 'auth_failure',
  RBAC_DENIED: 'rbac_denied',
  RATE_LIMIT: 'rate_limit',
  SUSPICIOUS_PATTERN: 'suspicious_pattern',
  INJECTION_ATTEMPT: 'injection_attempt',
  ANOMALY_DETECTED: 'anomaly_detected'
};

/**
 * Log security event with redacted data
 * @param {string} eventType - Type of security event
 * @param {Object} details - Event details
 * @param {string} severity - 'low', 'medium', 'high', 'critical'
 */
const logSecurityEvent = (eventType, details = {}, severity = 'low') => {
  const event = {
    timestamp: new Date().toISOString(),
    type: eventType,
    severity,
    details: redactPIIFromObject(details)
  };

  console.log(
    `[SECURITY] ${severity.toUpperCase()} | ${eventType} | ${JSON.stringify(event.details)}`
  );

  // In production, send to security logging service
  // await sendToSecurityLog(event);
};

// ═══════════════════════════════════════════════════════════════════════════════
// CIRCUIT BREAKER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Circuit breaker state machine for upstream dependencies
 * Prevents cascading failures by failing fast when upstream is down
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.state = 'CLOSED';  // CLOSED (normal), OPEN (failing), HALF_OPEN (testing)
    this.failureCount = 0;
    this.successCount = 0;
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 60000;  // ms
    this.lastFailureTime = null;
    this.name = options.name || 'CircuitBreaker';
  }

  /**
   * Record a successful call
   */
  recordSuccess() {
    this.failureCount = 0;

    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = 'CLOSED';
        this.successCount = 0;
        console.log(`[CB] ${this.name}: HALF_OPEN → CLOSED (recovered)`);
      }
    }
  }

  /**
   * Record a failed call
   */
  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'CLOSED' && this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      console.log(`[CB] ${this.name}: CLOSED → OPEN (threshold exceeded)`);
    }

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.successCount = 0;
      console.log(`[CB] ${this.name}: HALF_OPEN → OPEN (failure during recovery)`);
    }
  }

  /**
   * Check if circuit is open (failing fast)
   * Automatically transitions OPEN → HALF_OPEN after timeout
   */
  canAttempt() {
    if (this.state === 'CLOSED') {
      return true;
    }

    if (this.state === 'OPEN') {
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      if (timeSinceFailure > this.timeout) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        console.log(`[CB] ${this.name}: OPEN → HALF_OPEN (testing recovery)`);
        return true;
      }
      return false;
    }

    // HALF_OPEN - allow attempt
    return true;
  }

  /**
   * Get circuit state
   */
  getState() {
    return {
      state: this.state,
      failures: this.failureCount,
      successes: this.successCount,
      canAttempt: this.canAttempt()
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY HEADERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get security headers for all responses
 * @returns {Object} Headers object with security headers
 */
const getSecurityHeaders = () => ({
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  getCORSHeaders,
  handleCORS,
  redactPII,
  redactPIIFromObject,
  logSecurityEvent,
  SECURITY_EVENT_TYPES,
  CircuitBreaker,
  getSecurityHeaders
};

export default {
  getCORSHeaders,
  handleCORS,
  redactPII,
  redactPIIFromObject,
  logSecurityEvent,
  SECURITY_EVENT_TYPES,
  CircuitBreaker,
  getSecurityHeaders
};
