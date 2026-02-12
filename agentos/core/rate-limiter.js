/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * W-012: RATE LIMITER WITH TOKEN BUCKET ALGORITHM
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Fixes: governance-agent.js rate_limits policy has severity 'medium', which
 * means violations are observed but NEVER block requests. checkAction() only
 * blocks for 'critical' severity. Also, getCurrentRate() counts governance
 * log entries instead of actual API calls — fundamentally wrong metric.
 *
 * This module provides:
 * - Token bucket rate limiter with proper sliding window
 * - Per-agent, per-metric rate limiting
 * - Atomic check-and-consume operations
 * - Retry-After header computation
 * - Configurable burst capacity
 * - Rate limit status introspection
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─── Constants ───────────────────────────────────────────────────────────────

export const RATE_LIMIT_CONFIG = {
    defaults: {
        api_calls_per_minute: {
            capacity: 100,         // Max tokens (burst capacity)
            refillRate: 100,       // Tokens added per window
            windowMs: 60000        // 1 minute window
        },
        tokens_per_hour: {
            capacity: 1000000,     // 1M tokens burst
            refillRate: 1000000,   // 1M per hour
            windowMs: 3600000      // 1 hour window
        },
        cost_per_hour: {
            capacity: 500,         // $500 burst
            refillRate: 500,       // $500/hour
            windowMs: 3600000      // 1 hour window
        }
    },
    enforcement: {
        mode: 'enforce',           // 'enforce' | 'observe' | 'disabled'
        blockOnExceed: true,       // Return allowed=false when limit exceeded
        logAllChecks: false        // Log every check (expensive, for debugging)
    }
};

export const RATE_LIMIT_RESULT = {
    ALLOWED: 'allowed',
    RATE_LIMITED: 'rate_limited',
    BUCKET_NOT_FOUND: 'bucket_not_found'
};

// ─── TokenBucket Class ───────────────────────────────────────────────────────

/**
 * Single token bucket for one agent+metric combination.
 * Implements the token bucket algorithm with continuous refill.
 */
class TokenBucket {
    /**
     * @param {number} capacity - Maximum tokens
     * @param {number} refillRate - Tokens added per window
     * @param {number} windowMs - Refill window in milliseconds
     */
    constructor(capacity, refillRate, windowMs) {
        this.capacity = capacity;
        this.refillRate = refillRate;
        this.windowMs = windowMs;
        this.tokens = capacity;        // Start full
        this.lastRefillTime = Date.now();
    }

    /**
     * Refill tokens based on elapsed time.
     * Uses continuous refill: tokens accumulate proportionally to elapsed time.
     */
    refill() {
        const now = Date.now();
        const elapsed = now - this.lastRefillTime;

        if (elapsed <= 0) return;

        // Tokens to add = refillRate * (elapsed / windowMs)
        const tokensToAdd = this.refillRate * (elapsed / this.windowMs);
        this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
        this.lastRefillTime = now;
    }

    /**
     * Check if `count` tokens are available WITHOUT consuming.
     * @param {number} count - Number of tokens to check
     * @returns {boolean} true if available
     */
    canConsume(count) {
        this.refill();
        return this.tokens >= count;
    }

    /**
     * Attempt to consume `count` tokens. Returns true if successful.
     * @param {number} count - Number of tokens to consume
     * @returns {boolean} true if consumed, false if insufficient
     */
    tryConsume(count) {
        this.refill();

        if (this.tokens >= count) {
            this.tokens -= count;
            return true;
        }

        return false;
    }

    /**
     * Compute how long until `count` tokens will be available.
     * @param {number} count - Number of tokens needed
     * @returns {number} Milliseconds until tokens available (0 if already available)
     */
    retryAfterMs(count) {
        this.refill();

        if (this.tokens >= count) return 0;

        const deficit = count - this.tokens;
        // Time to refill deficit = deficit / (refillRate / windowMs)
        return Math.ceil(deficit / (this.refillRate / this.windowMs));
    }

    /**
     * Get current state for introspection.
     * @returns {Object} { tokens, capacity, utilizationPercent }
     */
    getStatus() {
        this.refill();
        return {
            tokens: Math.floor(this.tokens * 100) / 100,
            capacity: this.capacity,
            utilizationPercent: Math.round((1 - this.tokens / this.capacity) * 100)
        };
    }

    /**
     * Reset bucket to full capacity.
     */
    reset() {
        this.tokens = this.capacity;
        this.lastRefillTime = Date.now();
    }
}

// ─── RateLimiter Class ───────────────────────────────────────────────────────

export class RateLimiter {

    /**
     * @param {Object} [config] - Override default configuration
     */
    constructor(config = {}) {
        this.config = {
            ...RATE_LIMIT_CONFIG,
            ...config,
            defaults: { ...RATE_LIMIT_CONFIG.defaults, ...(config.defaults || {}) },
            enforcement: { ...RATE_LIMIT_CONFIG.enforcement, ...(config.enforcement || {}) }
        };

        // Buckets: Map<string, TokenBucket>
        // Key format: "agentId:metric"
        this.buckets = new Map();

        // Custom limits per agent (overrides defaults)
        // Map<string, Map<string, { capacity, refillRate, windowMs }>>
        this.customLimits = new Map();
    }

    /**
     * Check AND consume tokens for a rate-limited action.
     *
     * This is the primary method called by governance-agent.js.
     * It atomically checks and consumes in one step to prevent TOCTOU races.
     *
     * @param {string} agentId - Agent identifier
     * @param {string} metric - Metric name (e.g., 'api_calls_per_minute')
     * @param {number} [count=1] - Number of tokens to consume
     * @returns {Object} { allowed, remaining, retryAfterMs, metric, limit }
     */
    consume(agentId, metric, count = 1) {
        if (!agentId || !metric) {
            return {
                allowed: false,
                remaining: 0,
                retryAfterMs: 0,
                metric,
                limit: 0,
                error: 'agentId and metric are required'
            };
        }

        // Observation-only mode: always allow
        if (this.config.enforcement.mode === 'disabled') {
            return { allowed: true, remaining: Infinity, retryAfterMs: 0, metric, limit: Infinity };
        }

        const bucket = this._getOrCreateBucket(agentId, metric);
        if (!bucket) {
            // No configuration for this metric — allow by default
            return { allowed: true, remaining: Infinity, retryAfterMs: 0, metric, limit: 0 };
        }

        const consumed = bucket.tryConsume(count);
        const status = bucket.getStatus();

        const result = {
            allowed: consumed,
            remaining: Math.floor(status.tokens),
            retryAfterMs: consumed ? 0 : bucket.retryAfterMs(count),
            metric,
            limit: bucket.capacity
        };

        // In observe mode, allow even if would be rate-limited
        if (!consumed && this.config.enforcement.mode === 'observe') {
            result.allowed = true;
            result.wouldBlock = true;  // Flag that this WOULD have been blocked
        }

        return result;
    }

    /**
     * Check rate limit WITHOUT consuming tokens (read-only).
     *
     * Use this for pre-flight checks where you want to know if a request
     * would be allowed without committing to it.
     *
     * @param {string} agentId - Agent identifier
     * @param {string} metric - Metric name
     * @param {number} [count=1] - Number of tokens to check
     * @returns {Object} { allowed, remaining, retryAfterMs }
     */
    check(agentId, metric, count = 1) {
        if (!agentId || !metric) {
            return { allowed: false, remaining: 0, retryAfterMs: 0 };
        }

        const bucket = this._getOrCreateBucket(agentId, metric);
        if (!bucket) {
            return { allowed: true, remaining: Infinity, retryAfterMs: 0 };
        }

        const canDo = bucket.canConsume(count);
        const status = bucket.getStatus();

        return {
            allowed: canDo,
            remaining: Math.floor(status.tokens),
            retryAfterMs: canDo ? 0 : bucket.retryAfterMs(count)
        };
    }

    /**
     * Configure custom rate limits for a specific agent.
     *
     * @param {string} agentId - Agent identifier
     * @param {string} metric - Metric name
     * @param {Object} config - { capacity, refillRate, windowMs }
     */
    configure(agentId, metric, config) {
        if (!agentId || !metric || !config) return;

        if (!this.customLimits.has(agentId)) {
            this.customLimits.set(agentId, new Map());
        }

        this.customLimits.get(agentId).set(metric, {
            capacity: config.capacity || 100,
            refillRate: config.refillRate || 100,
            windowMs: config.windowMs || 60000
        });

        // Reset existing bucket to pick up new config
        const bucketKey = `${agentId}:${metric}`;
        this.buckets.delete(bucketKey);
    }

    /**
     * Get rate limit status for an agent across all metrics.
     *
     * @param {string} agentId - Agent identifier
     * @returns {Object} Map of metric → { tokens, capacity, utilizationPercent }
     */
    getStatus(agentId) {
        if (!agentId) return {};

        const status = {};

        for (const [key, bucket] of this.buckets.entries()) {
            if (key.startsWith(`${agentId}:`)) {
                const metric = key.split(':').slice(1).join(':');
                status[metric] = bucket.getStatus();
            }
        }

        return status;
    }

    /**
     * Reset all rate limits for an agent.
     * @param {string} agentId - Agent identifier
     */
    resetAgent(agentId) {
        for (const [key, bucket] of this.buckets.entries()) {
            if (key.startsWith(`${agentId}:`)) {
                bucket.reset();
            }
        }
    }

    /**
     * Reset a specific metric for an agent.
     * @param {string} agentId - Agent identifier
     * @param {string} metric - Metric name
     */
    resetMetric(agentId, metric) {
        const key = `${agentId}:${metric}`;
        const bucket = this.buckets.get(key);
        if (bucket) bucket.reset();
    }

    /**
     * Get all active bucket keys (for diagnostics).
     * @returns {Array<string>}
     */
    getActiveBuckets() {
        return Array.from(this.buckets.keys());
    }

    // ─── Private Helpers ─────────────────────────────────────────────────────

    /**
     * Get or create a token bucket for an agent+metric.
     * @private
     */
    _getOrCreateBucket(agentId, metric) {
        const key = `${agentId}:${metric}`;

        if (this.buckets.has(key)) {
            return this.buckets.get(key);
        }

        // Check for custom limits first
        const customConfig = this.customLimits.get(agentId)?.get(metric);
        const config = customConfig || this.config.defaults[metric];

        if (!config) {
            return null; // No configuration for this metric
        }

        const bucket = new TokenBucket(config.capacity, config.refillRate, config.windowMs);
        this.buckets.set(key, bucket);
        return bucket;
    }
}

// ─── Middleware Helper ───────────────────────────────────────────────────────

/**
 * Create HTTP middleware that enforces rate limits.
 * Adds Retry-After header when rate limited.
 *
 * @param {RateLimiter} rateLimiter - RateLimiter instance
 * @returns {Function} Express-compatible middleware
 */
export function rateLimitMiddleware(rateLimiter) {
    return (req, res, next) => {
        const agentId = req.headers['x-agent-name'] || 'api';
        const metric = 'api_calls_per_minute';

        const result = rateLimiter.consume(agentId, metric, 1);

        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', result.limit);
        res.setHeader('X-RateLimit-Remaining', result.remaining);

        if (!result.allowed) {
            const retryAfterSeconds = Math.ceil(result.retryAfterMs / 1000);
            res.setHeader('Retry-After', retryAfterSeconds);
            res.status(429).json({
                error: 'Rate limit exceeded',
                metric: result.metric,
                retryAfterSeconds,
                remaining: result.remaining
            });
            return;
        }

        next();
    };
}

// ─── Factory Function ───────────────────────────────────────────────────────

export function createRateLimiter(config) {
    return new RateLimiter(config);
}
