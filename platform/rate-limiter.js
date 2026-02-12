/**
 * Finault Rate Limiter Middleware
 * Cloudflare Workers Compatible Sliding Window Rate Limiter
 *
 * Features:
 * - Sliding window algorithm for accurate rate limiting
 * - Per-IP and per-orgId rate limiting
 * - Configurable limits for different endpoint types
 * - TTL-based in-memory tracking
 * - 429 Too Many Requests responses with Retry-After headers
 * - Lightweight for edge computing
 */

/**
 * Rate Limit Configuration
 * Defines limits for different authentication and endpoint types
 */
const RATE_LIMIT_CONFIG = {
  // Default limits (unauthenticated requests)
  default: {
    rps: 100 / 60,        // 100 requests per minute
    windowMs: 60000,       // 1 minute window
    keyGenerator: 'ip'
  },

  // Authenticated requests (per organization)
  authenticated: {
    rps: 1000 / 60,        // 1000 requests per minute
    windowMs: 60000,
    keyGenerator: 'orgId'
  },

  // Heavy endpoints (parse, bulk upload, etc.)
  heavy: {
    rps: 10 / 60,          // 10 requests per minute
    windowMs: 60000,
    keyGenerator: 'orgId'
  },

  // Proxy endpoints
  proxy: {
    rps: 500 / 60,         // 500 requests per minute
    windowMs: 60000,
    keyGenerator: 'orgId'
  }
};

/**
 * Endpoint Category Mapping
 * Maps request paths to rate limit categories
 */
const ENDPOINT_CATEGORIES = {
  heavy: [
    '/api/v1/parse',
    '/api/v1/bulk-upload',
    '/api/v1/batch-process',
    '/api/v1/data-import'
  ],
  proxy: [
    '/api/v1/proxy',
    '/api/v1/forward',
    '/api/v1/external'
  ]
};

/**
 * RateLimitStore
 * In-memory store with TTL for tracking request windows
 * Optimized for Cloudflare Workers edge environment
 */
class RateLimitStore {
  constructor() {
    this.store = new Map();
    this.timers = new Map();
  }

  /**
   * Get request count and timestamps for a key within the window
   */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) {
      return { count: 0, timestamps: [] };
    }
    return entry;
  }

  /**
   * Record a new request timestamp
   */
  record(key, timestamp, windowMs) {
    const entry = this.store.get(key) || { count: 0, timestamps: [] };

    // Remove old timestamps outside the window
    const cutoff = timestamp - windowMs;
    entry.timestamps = entry.timestamps.filter(ts => ts > cutoff);

    // Add new timestamp
    entry.timestamps.push(timestamp);
    entry.count = entry.timestamps.length;

    // Update store
    this.store.set(key, entry);

    // Reset TTL timer
    this.resetTTL(key, windowMs);

    return entry;
  }

  /**
   * Get current count for a key (with window filtering)
   */
  getCount(key, windowMs) {
    const entry = this.store.get(key);
    if (!entry) {
      return 0;
    }

    const now = Date.now();
    const cutoff = now - windowMs;
    const validTimestamps = entry.timestamps.filter(ts => ts > cutoff);

    return validTimestamps.length;
  }

  /**
   * Reset TTL timer for automatic cleanup
   * Removes entry from store after window + 1 minute
   */
  resetTTL(key, windowMs) {
    // Clear existing timer
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }

    // Set new timer (window + 60 seconds for cleanup)
    const timer = setTimeout(() => {
      this.store.delete(key);
      this.timers.delete(key);
    }, windowMs + 60000);

    this.timers.set(key, timer);
  }

  /**
   * Clear all entries (useful for testing)
   */
  clear() {
    this.store.clear();
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
  }

  /**
   * Get store statistics
   */
  getStats() {
    return {
      keyCount: this.store.size,
      timerCount: this.timers.size,
      avgTimestampsPerKey: this.store.size > 0
        ? Array.from(this.store.values())
            .reduce((sum, entry) => sum + entry.timestamps.length, 0) / this.store.size
        : 0
    };
  }
}

/**
 * Global rate limit store instance
 * Shared across all requests in the Worker
 */
const globalStore = new RateLimitStore();

/**
 * Determine rate limit category for a request
 */
function getEndpointCategory(pathname) {
  // Check heavy endpoints
  for (const pattern of ENDPOINT_CATEGORIES.heavy) {
    if (pathname.startsWith(pattern)) {
      return 'heavy';
    }
  }

  // Check proxy endpoints
  for (const pattern of ENDPOINT_CATEGORIES.proxy) {
    if (pathname.startsWith(pattern)) {
      return 'proxy';
    }
  }

  return null;
}

/**
 * Get rate limit config for a request
 * Determines which limit applies based on auth and endpoint type
 */
function getRateLimitConfig(isAuthenticated, orgId, pathname) {
  const endpointCategory = getEndpointCategory(pathname);

  // Heavy endpoints always use heavy limits (stricter)
  if (endpointCategory === 'heavy') {
    return RATE_LIMIT_CONFIG.heavy;
  }

  // Proxy endpoints use proxy limits if authenticated
  if (endpointCategory === 'proxy' && isAuthenticated && orgId) {
    return RATE_LIMIT_CONFIG.proxy;
  }

  // Authenticated requests use higher limit
  if (isAuthenticated && orgId) {
    return RATE_LIMIT_CONFIG.authenticated;
  }

  // Default to strict limit
  return RATE_LIMIT_CONFIG.default;
}

/**
 * Generate rate limit key
 * Combines identifier type and value for uniqueness
 */
function generateRateLimitKey(request, isAuthenticated, orgId, config) {
  if (config.keyGenerator === 'orgId' && isAuthenticated && orgId) {
    return `org:${orgId}`;
  }

  // Extract IP address from request
  // Support multiple header formats for different proxy setups
  const ip = getClientIp(request);
  return `ip:${ip}`;
}

/**
 * Extract client IP address from request
 * Handles various proxy headers and CF-specific headers
 */
function getClientIp(request) {
  // Cloudflare provides CF-Connecting-IP header
  const cfIp = request.headers.get('CF-Connecting-IP');
  if (cfIp) {
    return cfIp;
  }

  // Fallback to X-Forwarded-For
  const xForwardedFor = request.headers.get('X-Forwarded-For');
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }

  // Fallback to X-Real-IP
  const xRealIp = request.headers.get('X-Real-IP');
  if (xRealIp) {
    return xRealIp;
  }

  // Last resort: use a generic identifier
  return 'unknown';
}

/**
 * Extract organization ID from request
 * Looks in headers, cookies, and JWT claims
 */
function getOrgId(request, context) {
  // Check context (populated by JWT middleware, etc.)
  if (context && context.orgId) {
    return context.orgId;
  }

  // Check custom header
  const orgIdHeader = request.headers.get('X-Org-ID');
  if (orgIdHeader) {
    return orgIdHeader;
  }

  // Check authorization header for JWT claims
  try {
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      // Simple JWT payload extraction (doesn't verify signature)
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        return payload.orgId || payload.org_id || null;
      }
    }
  } catch (e) {
    // Silently ignore JWT parsing errors
  }

  return null;
}

/**
 * Format Retry-After header value
 * Returns seconds until quota resets
 */
function getRetryAfterSeconds(config, currentCount) {
  // Calculate how much we're over the limit
  const limit = config.rps * config.windowMs / 1000;
  const excess = Math.max(0, currentCount - limit);

  // Simple strategy: retry after excess requests * average request duration
  // For now, return the window duration in seconds
  return Math.ceil(config.windowMs / 1000);
}

/**
 * Rate Limit Violation Response
 * Returns a properly formatted 429 Too Many Requests response
 */
function createRateLimitResponse(config, currentCount, key) {
  const retryAfter = getRetryAfterSeconds(config, currentCount);
  const limit = Math.floor(config.rps * config.windowMs / 1000);

  const response = new Response(
    JSON.stringify({
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Maximum ${limit} requests per minute.`,
      retryAfter,
      rateLimit: {
        limit,
        window: Math.floor(config.windowMs / 1000),
        current: currentCount,
        resetIn: retryAfter
      },
      timestamp: new Date().toISOString()
    }),
    {
      status: 429,
      statusText: 'Too Many Requests',
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil((Date.now() + retryAfter * 1000) / 1000)),
        'X-RateLimit-Key': key
      }
    }
  );

  return response;
}

/**
 * Create response headers with rate limit information
 */
function createRateLimitHeaders(config, currentCount, remaining) {
  const limit = Math.floor(config.rps * config.windowMs / 1000);

  return {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(Math.max(0, remaining)),
    'X-RateLimit-Reset': String(Math.ceil((Date.now() + config.windowMs) / 1000)),
    'X-RateLimit-WindowMs': String(config.windowMs)
  };
}

/**
 * Hono Middleware: Rate Limiter
 *
 * Usage in Hono app:
 * app.use('*', rateLimitMiddleware());
 *
 * Or for specific routes:
 * app.post('/api/v1/parse', rateLimitMiddleware(), handler);
 */
function rateLimitMiddleware(options = {}) {
  const {
    store = globalStore,
    skipCondition = null,
    onLimitExceeded = null,
    customConfig = null
  } = options;

  return async (context, next) => {
    // Skip rate limiting if condition met
    if (skipCondition && skipCondition(context.req)) {
      return next();
    }

    const request = context.req;
    const pathname = new URL(request.url).pathname;

    // Extract authentication info
    const authHeader = request.headers.get('Authorization');
    const isAuthenticated = !!authHeader;
    const orgId = getOrgId(request, context.env || {});

    // Determine applicable rate limit config
    const config = customConfig || getRateLimitConfig(
      isAuthenticated,
      orgId,
      pathname
    );

    // Generate rate limit key
    const key = generateRateLimitKey(request, isAuthenticated, orgId, config);

    // Check current count
    const now = Date.now();
    const currentCount = store.getCount(key, config.windowMs);
    const limit = config.rps * config.windowMs / 1000;

    // Check if limit exceeded
    if (currentCount >= limit) {
      const response = createRateLimitResponse(config, currentCount, key);

      // Call custom handler if provided
      if (onLimitExceeded) {
        onLimitExceeded({
          key,
          count: currentCount,
          limit,
          request,
          config
        });
      }

      return response;
    }

    // Record this request
    store.record(key, now, config.windowMs);

    // Continue to next handler
    const response = await next();

    // Add rate limit headers to response
    const headers = createRateLimitHeaders(config, currentCount, limit - currentCount - 1);
    Object.entries(headers).forEach(([name, value]) => {
      response.headers.set(name, value);
    });

    return response;
  };
}

/**
 * Advanced rate limiter with custom storage backend
 * For use with Cloudflare Durable Objects or external stores
 */
class AdvancedRateLimiter {
  constructor(options = {}) {
    this.store = options.store || globalStore;
    this.config = options.config || RATE_LIMIT_CONFIG;
    this.customKeyGenerator = options.keyGenerator || null;
    this.logger = options.logger || null;
  }

  /**
   * Check if request is rate limited
   * Returns { limited: boolean, remaining: number, resetIn: number }
   */
  checkLimit(key, config) {
    const currentCount = this.store.getCount(key, config.windowMs);
    const limit = config.rps * config.windowMs / 1000;
    const remaining = Math.max(0, limit - currentCount);

    return {
      limited: currentCount >= limit,
      current: currentCount,
      limit: Math.floor(limit),
      remaining: Math.floor(remaining),
      resetIn: Math.ceil(config.windowMs / 1000)
    };
  }

  /**
   * Record a request and check limit in one call
   */
  recordAndCheck(key, config) {
    const now = Date.now();
    this.store.record(key, now, config.windowMs);

    return this.checkLimit(key, config);
  }

  /**
   * Reset rate limit for a specific key
   */
  reset(key) {
    // Implement via store if supported
    if (this.store.reset) {
      this.store.reset(key);
      return true;
    }
    return false;
  }

  /**
   * Get store statistics
   */
  getStats() {
    return this.store.getStats?.() || { error: 'Stats not available' };
  }

  /**
   * Clear all limits
   */
  clearAll() {
    return this.store.clear?.();
  }
}

/**
 * Express-style middleware factory (for compatibility)
 * Creates middleware function compatible with Express-like frameworks
 */
function createRateLimitMiddleware(options = {}) {
  return rateLimitMiddleware(options);
}

// Export public API
module.exports = {
  // Main middleware
  rateLimitMiddleware,
  createRateLimitMiddleware,

  // Advanced API
  AdvancedRateLimiter,

  // Stores
  RateLimitStore,
  globalStore,

  // Configuration
  RATE_LIMIT_CONFIG,
  ENDPOINT_CATEGORIES,

  // Utilities
  getClientIp,
  getOrgId,
  getEndpointCategory,
  getRateLimitConfig,
  generateRateLimitKey,

  // Helpers
  createRateLimitResponse,
  createRateLimitHeaders
};
