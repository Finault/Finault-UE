/**
 * KV-BACKED RATE LIMITER - Persistent, Distributed
 * ═══════════════════════════════════════════════════════════════
 *
 * GAP #7 FIX: Replaces in-memory rate limit counters with
 * Cloudflare KV-backed storage. Counters survive worker restarts,
 * deployments, and are shared across all edge instances globally.
 *
 * ARCHITECTURE:
 * - Fixed-window counters stored in KV_CACHE
 * - Key format: rate:{tier}:{identifier}:{window_id}
 * - Automatic TTL cleanup (window + 120s buffer)
 * - In-memory fast-path: check memory first, KV on miss
 * - Eventual consistency acceptable for rate limiting
 *   (slightly permissive under race is better than blocking)
 *
 * PERFORMANCE:
 * - KV read: ~10ms (cached at edge, often <5ms)
 * - KV write: ~10ms (async, non-blocking)
 * - In-memory hit: <1ms (same-isolate repeat requests)
 *
 * TIERS:
 * - default:  100 req/min (by IP, unauthenticated)
 * - authenticated: 1000 req/min (by org_id)
 * - proxy:    500 req/min (by org_id, LLM proxy endpoints)
 * - heavy:     10 req/min (by org_id, parse/bulk endpoints)
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * Rate limit tier configurations
 */
const RATE_TIERS = {
  default: {
    limit: 100,
    windowMs: 60000,
    keyPrefix: 'ip'
  },
  authenticated: {
    limit: 1000,
    windowMs: 60000,
    keyPrefix: 'org'
  },
  proxy: {
    limit: 500,
    windowMs: 60000,
    keyPrefix: 'org'
  },
  heavy: {
    limit: 10,
    windowMs: 60000,
    keyPrefix: 'org'
  },
  // GAP #20: Rate limits for public (unauthenticated) endpoints
  public: {
    limit: 60,
    windowMs: 60000,
    keyPrefix: 'ip'
  },
  public_db: {
    limit: 20,
    windowMs: 60000,
    keyPrefix: 'ip'
  }
};

/**
 * Heavy endpoints that get stricter limits
 */
const HEAVY_ENDPOINTS = [
  '/v1/parse',
  '/v1/reconcile',
  '/v1/close-pack/generate',
  '/v1/close-pack/email',
  '/v1/data-import',
  '/v1/bulk-upload'
];

/**
 * GAP #20: Public endpoints that hit the database (stricter limit)
 */
const PUBLIC_DB_ENDPOINTS = [
  '/v1/verify',
  '/v1/logs/',
  '/v1/registry/'
];

/**
 * Proxy endpoints (LLM proxying)
 */
const PROXY_ENDPOINTS = [
  '/v1/chat/completions',
  '/anthropic/',
  '/azure/',
  '/vertex/',
  '/bedrock/'
];

class KVRateLimiter {
  /**
   * @param {Object} env - Cloudflare Worker env (needs KV_CACHE)
   * @param {Object} options - Override defaults
   */
  constructor(env, options = {}) {
    this.kv = env.KV_CACHE;
    this.tiers = options.tiers || RATE_TIERS;
    // In-memory cache for same-isolate fast path
    this.localCache = new Map();
    this.localCacheTTL = 5000; // 5 seconds local cache
  }

  /**
   * Check and record a request against rate limits.
   * Returns { allowed, current, limit, remaining, tier, retryAfter }
   *
   * @param {string} identifier - IP address or org_id
   * @param {string} tierName - 'default', 'authenticated', 'proxy', 'heavy'
   */
  async checkAndRecord(identifier, tierName = 'default') {
    const tier = this.tiers[tierName] || this.tiers.default;
    const windowId = Math.floor(Date.now() / tier.windowMs);
    const kvKey = `rate:${tier.keyPrefix}:${identifier}:${windowId}`;

    let current = 0;

    try {
      // Fast path: check local cache first
      const cached = this.localCache.get(kvKey);
      if (cached && (Date.now() - cached.time) < this.localCacheTTL) {
        current = cached.count;
      } else {
        // Read from KV
        const stored = await this.kv.get(kvKey, 'text');
        current = stored ? parseInt(stored, 10) : 0;
      }
    } catch (err) {
      // KV read failed — fall back to permissive (allow request)
      console.warn('[KVRateLimiter] KV read failed, allowing request', {
        key: kvKey,
        error: err.message
      });
      return {
        allowed: true,
        current: 0,
        limit: tier.limit,
        remaining: tier.limit,
        tier: tierName,
        retryAfter: 0
      };
    }

    // Check limit BEFORE incrementing
    if (current >= tier.limit) {
      const windowEnd = (windowId + 1) * tier.windowMs;
      const retryAfter = Math.ceil((windowEnd - Date.now()) / 1000);

      return {
        allowed: false,
        current,
        limit: tier.limit,
        remaining: 0,
        tier: tierName,
        retryAfter: Math.max(1, retryAfter)
      };
    }

    // Increment counter
    const newCount = current + 1;
    const remaining = Math.max(0, tier.limit - newCount);

    // Update local cache immediately
    this.localCache.set(kvKey, { count: newCount, time: Date.now() });

    // Write to KV (non-blocking — eventual consistency is fine)
    try {
      const ttlSeconds = Math.ceil(tier.windowMs / 1000) + 120; // window + 2 min buffer
      await this.kv.put(kvKey, String(newCount), {
        expirationTtl: ttlSeconds
      });
    } catch (err) {
      console.warn('[KVRateLimiter] KV write failed', {
        key: kvKey,
        error: err.message
      });
      // Request still allowed — KV write failure is non-fatal
    }

    return {
      allowed: true,
      current: newCount,
      limit: tier.limit,
      remaining,
      tier: tierName,
      retryAfter: 0
    };
  }

  /**
   * Determine the appropriate tier for a request.
   *
   * @param {string} path - Request path
   * @param {boolean} isAuthenticated - Whether request is authenticated
   * @returns {string} Tier name
   */
  getTier(path, isAuthenticated) {
    // Heavy endpoints always get strict limits
    for (const prefix of HEAVY_ENDPOINTS) {
      if (path.startsWith(prefix)) {
        return isAuthenticated ? 'heavy' : 'default';
      }
    }

    // Proxy endpoints get proxy tier if authenticated
    for (const prefix of PROXY_ENDPOINTS) {
      if (path.startsWith(prefix)) {
        return isAuthenticated ? 'proxy' : 'default';
      }
    }

    // Everything else
    return isAuthenticated ? 'authenticated' : 'default';
  }

  /**
   * GAP #20: Determine rate limit tier for public endpoints.
   * DB-hitting public endpoints get stricter limits.
   *
   * @param {string} path - Request path
   * @returns {string} Tier name ('public' or 'public_db')
   */
  getPublicTier(path) {
    for (const prefix of PUBLIC_DB_ENDPOINTS) {
      if (path === prefix || path.startsWith(prefix)) {
        return 'public_db';
      }
    }
    return 'public';
  }

  /**
   * Full rate limit check for a request.
   * Determines tier, identifier, and checks/records in one call.
   *
   * @param {Request} request - The incoming request
   * @param {string} path - Request path
   * @param {boolean} isAuthenticated - Whether authenticated
   * @param {string|null} orgId - Organization ID (if authenticated)
   * @returns {Promise<Object>} Rate limit result
   */
  async checkRequest(request, path, isAuthenticated, orgId) {
    const tier = this.getTier(path, isAuthenticated);
    const tierConfig = this.tiers[tier] || this.tiers.default;

    // Determine identifier: org_id for authenticated, IP for anonymous
    let identifier;
    if (tierConfig.keyPrefix === 'org' && orgId) {
      identifier = orgId;
    } else {
      identifier = request.headers.get('CF-Connecting-IP') ||
                   request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
                   'unknown';
    }

    const result = await this.checkAndRecord(identifier, tier);
    result.identifier = identifier;
    return result;
  }

  /**
   * Generate standard rate limit response headers.
   *
   * @param {Object} result - Result from checkAndRecord()
   * @returns {Object} Headers object
   */
  static getHeaders(result) {
    const windowReset = Math.ceil(Date.now() / 1000) +
                        Math.ceil((RATE_TIERS[result.tier]?.windowMs || 60000) / 1000);
    return {
      'X-RateLimit-Limit': String(result.limit),
      'X-RateLimit-Remaining': String(result.remaining),
      'X-RateLimit-Reset': String(windowReset),
      'X-RateLimit-Tier': result.tier
    };
  }

  /**
   * Get rate limiter stats from KV (for observability endpoints).
   *
   * @returns {Promise<Object>} Stats summary
   */
  async getStats() {
    try {
      const list = await this.kv.list({ prefix: 'rate:' });
      const stats = {
        active_keys: list.keys.length,
        by_tier: {},
        by_prefix: {}
      };

      for (const key of list.keys) {
        // Parse key: rate:{prefix}:{identifier}:{windowId}
        const parts = key.name.split(':');
        const prefix = parts[1] || 'unknown';
        stats.by_prefix[prefix] = (stats.by_prefix[prefix] || 0) + 1;
      }

      return stats;
    } catch (err) {
      console.error('[KVRateLimiter] Failed to get stats', { error: err.message });
      return { error: err.message };
    }
  }
}

module.exports = {
  KVRateLimiter,
  RATE_TIERS,
  HEAVY_ENDPOINTS,
  PROXY_ENDPOINTS,
  PUBLIC_DB_ENDPOINTS
};
