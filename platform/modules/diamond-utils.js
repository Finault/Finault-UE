/**
 * Diamond Utilities Module
 *
 * Production-hardened shared infrastructure for all Diamond modules.
 * Cloudflare Workers compatible (no Node.js-specific APIs except crypto).
 *
 * Exports:
 * - DiamondLogger: Structured JSON logging with sensitivity scrubbing
 * - CircuitBreaker: Prevents cascading failures from downstream services
 * - resilientFetch: Timeout + retry + circuit breaker wrapper
 * - InputValidator: Parameter validation and sanitization
 * - SupabaseClient: Hardened Supabase REST client
 * - HealthCheck: Module health status generator
 * - RateLimiter: Request rate limiting with sliding window
 */

/**
 * Structured Logger - Outputs JSON with timestamp, level, module, message, metadata
 * Automatically scrubs sensitive fields like apiKey, token, password, secret, authorization
 */
export class DiamondLogger {
  constructor(module, options = {}) {
    this.module = module;
    this.level = options.level || 'info';
    this.levels = { error: 0, warn: 1, info: 2, debug: 3 };
  }

  _scrubSensitive(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const scrubbed = { ...obj };
    const sensitiveFields = ['apiKey', 'token', 'password', 'secret', 'authorization', 'apikey', 'key'];
    for (const field of sensitiveFields) {
      if (field in scrubbed) {
        scrubbed[field] = '***';
      }
    }
    return scrubbed;
  }

  _log(level, message, meta = {}) {
    if (this.levels[level] > this.levels[this.level]) return;

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      module: this.module,
      message,
      ...this._scrubSensitive(meta)
    };

    const output = JSON.stringify(entry);
    if (level === 'error') console.error(output);
    else if (level === 'warn') console.warn(output);
    else console.log(output);
  }

  error(message, meta) { this._log('error', message, meta); }
  warn(message, meta) { this._log('warn', message, meta); }
  info(message, meta) { this._log('info', message, meta); }
  debug(message, meta) { this._log('debug', message, meta); }
}

/**
 * Circuit Breaker - Prevents cascading failures when downstream services are down
 * States: CLOSED (healthy) -> OPEN (failing) -> HALF_OPEN (testing) -> CLOSED
 */
export class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 30000; // 30 seconds
    this.state = 'CLOSED'; // CLOSED (healthy), OPEN (failing), HALF_OPEN (testing)
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error(
          `Circuit breaker OPEN — service unavailable (${this.failureCount} consecutive failures)`
        );
      }
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure();
      throw error;
    }
  }

  _onSuccess() {
    this.failureCount = 0;
    this.successCount++;
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
    }
  }

  _onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      successCount: this.successCount
    };
  }

  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
  }
}

/**
 * Resilient Fetch Wrapper
 * Adds timeout, retry with exponential backoff, circuit breaker integration, and distributed tracing
 */
export async function resilientFetch(url, options = {}) {
  const timeout = options.timeout || 30000;
  const maxRetries = options.maxRetries || 2;
  const baseDelay = options.baseDelay || 1000;
  const circuitBreaker = options.circuitBreaker || null;
  const tracer = options.tracer || null;
  const parentSpan = options.parentSpan || null;
  const method = (options.method || 'GET').toUpperCase();

  // Create a tracing span if tracer is available
  let span = null;
  if (tracer && parentSpan) {
    span = tracer.startChildSpan(`fetch.${method.toLowerCase()}`, {
      'http.method': method,
      'http.url': url
    }, parentSpan);
  }

  const attemptFetch = async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const fetchOptions = { ...options };
      delete fetchOptions.timeout;
      delete fetchOptions.maxRetries;
      delete fetchOptions.baseDelay;
      delete fetchOptions.circuitBreaker;
      delete fetchOptions.tracer;
      delete fetchOptions.parentSpan;

      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeout}ms: ${url}`);
      }
      throw error;
    }
  };

  const executeWithRetry = async () => {
    let lastError;
    let lastStatusCode = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await attemptFetch();
        lastStatusCode = response.status;
        if (span) {
          span.setAttribute('http.status_code', response.status);
          if (response.ok) {
            span.addEvent('http.response', { status: response.status });
          }
        }
        if (response.ok || response.status < 500) {
          return response;
        }
        // 5xx = retry
        const text = await response.text();
        lastError = new Error(`HTTP ${response.status}: ${text}`);
        lastError.statusCode = response.status;
      } catch (error) {
        lastError = error;
        if (span && attempt < maxRetries) {
          span.addEvent('http.retry', {
            attempt: attempt + 1,
            error: error.message
          });
        }
      }

      // Don't wait after last attempt
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Record final error in span
    if (span && lastError) {
      span.setAttribute('http.status_code', lastStatusCode || 0);
      span.setStatus('ERROR', lastError.message);
      span.addEvent('http.error', {
        'error.message': lastError.message,
        'error.type': lastError.name || 'Error'
      });
    }

    throw lastError;
  };

  let result;
  try {
    if (circuitBreaker) {
      result = await circuitBreaker.execute(executeWithRetry);
    } else {
      result = await executeWithRetry();
    }
    if (span) {
      span.end();
    }
    return result;
  } catch (error) {
    if (span) {
      span.end();
    }
    throw error;
  }
}

/**
 * Input Validator
 * Validates method parameters before execution with consistent error messages
 */
export class InputValidator {
  static requireString(value, fieldName) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`${fieldName} is required and must be a non-empty string`);
    }
    return value.trim();
  }

  static requireNumber(value, fieldName, constraints = {}) {
    const num = Number(value);
    if (isNaN(num)) {
      throw new Error(`${fieldName} must be a valid number`);
    }
    const { min, max } = constraints;
    if (min !== undefined && num < min) {
      throw new Error(`${fieldName} must be >= ${min}`);
    }
    if (max !== undefined && num > max) {
      throw new Error(`${fieldName} must be <= ${max}`);
    }
    return num;
  }

  static requireArray(value, fieldName) {
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error(`${fieldName} is required and must be a non-empty array`);
    }
    return value;
  }

  static requireObject(value, fieldName) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`${fieldName} is required and must be an object`);
    }
    return value;
  }

  static requireEnum(value, fieldName, validValues) {
    if (!validValues.includes(value)) {
      throw new Error(`${fieldName} must be one of: ${validValues.join(', ')}`);
    }
    return value;
  }

  static sanitizeForQuery(value) {
    // Encode for safe use in Supabase PostgREST query params
    return encodeURIComponent(String(value));
  }

  static sanitizeJSON(value) {
    // Remove null bytes and control characters
    const str = String(value);
    return str.replace(/[\x00-\x1F\x7F]/g, '');
  }
}

/**
 * Supabase Client Factory
 * Creates a hardened Supabase REST client with all protections built in:
 * - Circuit breaker for cascading failure prevention
 * - Timeout handling
 * - Exponential backoff retry
 * - Structured logging
 */
export class SupabaseClient {
  constructor(url, key, options = {}) {
    if (!url || !key) {
      throw new Error('Supabase URL and key are required');
    }
    this.url = url.replace(/\/$/, '');
    this.key = key;
    this.logger = options.logger || new DiamondLogger('supabase');
    this.circuitBreaker = options.circuitBreaker ||
      new CircuitBreaker({ failureThreshold: 10, resetTimeout: 60000 });
    this.defaultTimeout = options.timeout || 15000;
  }

  async request(endpoint, options = {}) {
    const url = `${this.url}/rest/v1${endpoint}`;
    const method = options.method || 'GET';

    const fetchOptions = {
      method,
      headers: {
        'Authorization': `Bearer ${this.key}`,
        'apikey': this.key,
        'Content-Type': 'application/json',
        'Prefer': options.prefer || (method === 'POST' ? 'return=representation' : '')
      },
      timeout: options.timeout || this.defaultTimeout,
      circuitBreaker: this.circuitBreaker,
      maxRetries: options.maxRetries ?? (method === 'GET' ? 2 : 0) // Don't retry mutations by default
    };

    if (options.body) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    try {
      const response = await resilientFetch(url, fetchOptions);
      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error('Supabase request failed', {
          endpoint,
          status: response.status,
          error: errorText
        });
        throw new Error(`Supabase ${response.status}: ${errorText}`);
      }

      // Handle empty responses (204 No Content)
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('json')) {
        return null;
      }
      return response.json();
    } catch (error) {
      this.logger.error('Supabase request error', {
        endpoint,
        error: error.message
      });
      throw error;
    }
  }

  // Convenience methods
  async select(table, query = '', options = {}) {
    const endpoint = `/${table}${query ? '?' + query : ''}`;
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  async insert(table, data, options = {}) {
    return this.request(`/${table}`, {
      ...options,
      method: 'POST',
      body: data
    });
  }

  async upsert(table, data, options = {}) {
    return this.request(`/${table}`, {
      ...options,
      method: 'POST',
      body: data,
      prefer: 'resolution=merge-duplicates,return=representation'
    });
  }

  async update(table, query, data, options = {}) {
    return this.request(`/${table}?${query}`, {
      ...options,
      method: 'PATCH',
      body: data
    });
  }

  async delete(table, query, options = {}) {
    return this.request(`/${table}?${query}`, {
      ...options,
      method: 'DELETE'
    });
  }

  getCircuitState() {
    return this.circuitBreaker.getState();
  }
}

/**
 * Health Check Generator
 * Provides standardized health check reporting for all Diamond modules
 */
export class HealthCheck {
  constructor(moduleName, options = {}) {
    this.moduleName = moduleName;
    this.checks = new Map();
    this.startTime = Date.now();
  }

  addCheck(name, checkFn) {
    if (typeof checkFn !== 'function') {
      throw new Error(`Check function for "${name}" must be a function`);
    }
    this.checks.set(name, checkFn);
  }

  async run() {
    const results = {
      module: this.moduleName,
      status: 'healthy',
      uptime: Date.now() - this.startTime,
      timestamp: new Date().toISOString(),
      checks: {}
    };

    for (const [name, checkFn] of this.checks) {
      const start = Date.now();
      try {
        const result = await checkFn();
        results.checks[name] = {
          status: 'pass',
          duration: Date.now() - start,
          ...(result && typeof result === 'object' ? result : {})
        };
      } catch (error) {
        results.checks[name] = {
          status: 'fail',
          duration: Date.now() - start,
          error: error.message
        };
        results.status = 'degraded';
      }
    }

    const failedChecks = Object.values(results.checks).filter(c => c.status === 'fail');
    if (failedChecks.length > 0 &&
        failedChecks.length === Object.keys(results.checks).length) {
      results.status = 'unhealthy';
    }

    return results;
  }
}

/**
 * Rate Limiter
 * Implements sliding window rate limiting for outbound API calls
 * Prevents hitting rate limits on external services
 */
export class RateLimiter {
  constructor(options = {}) {
    this.maxRequests = options.maxRequests || 100;
    this.windowMs = options.windowMs || 60000; // 1 minute
    this.requests = [];
  }

  async acquire() {
    const now = Date.now();
    // Remove expired entries outside the window
    this.requests = this.requests.filter(t => now - t < this.windowMs);

    if (this.requests.length >= this.maxRequests) {
      const oldestInWindow = this.requests[0];
      const waitTime = this.windowMs - (now - oldestInWindow);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.acquire(); // Retry after waiting
    }

    this.requests.push(now);
  }

  getUsage() {
    const now = Date.now();
    this.requests = this.requests.filter(t => now - t < this.windowMs);
    return {
      used: this.requests.length,
      limit: this.maxRequests,
      remaining: this.maxRequests - this.requests.length,
      resetsIn: this.requests.length > 0 ? this.windowMs - (now - this.requests[0]) : 0
    };
  }

  reset() {
    this.requests = [];
  }
}
