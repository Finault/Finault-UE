/**
 * Usage Metering and Plan-Tier Quota Enforcement System
 * Finault Build Gap Analysis - Gap 5
 *
 * Provides:
 * 1. Usage Meters for tracking resource consumption
 * 2. Three-Layer Rate Limiting (global IP, per-API-key, per-tenant resource quotas)
 * 3. Plan-Tier Definitions with tiered limits
 * 4. HTTP Response Headers for rate limit/quota information
 * 5. Usage Analytics for capacity planning
 */

// ============================================================================
// 1. METER TYPES
// ============================================================================

export const METER_TYPES = {
  API_CALLS: 'api_calls',
  INVOICES: 'invoices',
  CLOSE_PACKS: 'close_packs',
  PROVIDER_CONNECTIONS: 'provider_connections',
  USER_SEATS: 'user_seats',
  STORAGE_BYTES: 'storage_bytes',
  AGENT_RUNS: 'agent_runs',
  WEBHOOK_ENDPOINTS: 'webhook_endpoints'
};

// ============================================================================
// 2. PLAN TIER DEFINITIONS
// ============================================================================

export const PLAN_TIERS = {
  foundation: {
    api_requests_per_minute: 100,
    invoices_per_month: 25,
    close_packs_per_month: 1,
    provider_connections: 3,
    user_seats: 3,
    storage_gb: 1,
    agent_runs_per_day: 50,
    webhook_endpoints: 2,
    data_retention_months: 12
  },
  professional: {
    api_requests_per_minute: 500,
    invoices_per_month: 100,
    close_packs_per_month: 2,
    provider_connections: 8,
    user_seats: 5,
    storage_gb: 10,
    agent_runs_per_day: 200,
    webhook_endpoints: 10,
    data_retention_months: 24
  },
  enterprise: {
    api_requests_per_minute: 2000,
    invoices_per_month: 500,
    close_packs_per_month: Infinity,
    provider_connections: Infinity,
    user_seats: 15,
    storage_gb: 100,
    agent_runs_per_day: 1000,
    webhook_endpoints: 50,
    data_retention_months: 84
  },
  strategic: {
    api_requests_per_minute: 10000,
    invoices_per_month: Infinity,
    close_packs_per_month: Infinity,
    provider_connections: Infinity,
    user_seats: Infinity,
    storage_gb: 1000,
    agent_runs_per_day: Infinity,
    webhook_endpoints: 200,
    data_retention_months: Infinity
  }
};

// Map METER_TYPES to plan tier fields
const METER_TO_TIER_FIELD = {
  [METER_TYPES.API_CALLS]: 'api_requests_per_minute',
  [METER_TYPES.INVOICES]: 'invoices_per_month',
  [METER_TYPES.CLOSE_PACKS]: 'close_packs_per_month',
  [METER_TYPES.PROVIDER_CONNECTIONS]: 'provider_connections',
  [METER_TYPES.USER_SEATS]: 'user_seats',
  [METER_TYPES.STORAGE_BYTES]: 'storage_gb',
  [METER_TYPES.AGENT_RUNS]: 'agent_runs_per_day',
  [METER_TYPES.WEBHOOK_ENDPOINTS]: 'webhook_endpoints'
};

// ============================================================================
// 3. USAGE METER CLASS
// ============================================================================

export class UsageMeter {
  constructor(adapter) {
    if (!adapter || typeof adapter !== 'object') {
      throw new Error('UsageMeter requires a valid adapter with increment, getCount, and reset methods');
    }
    this.adapter = adapter;
  }

  /**
   * Atomically increment a usage counter
   * @param {string} orgId - Organization ID
   * @param {string} meterType - Type of meter (from METER_TYPES)
   * @param {number} amount - Amount to increment (default 1)
   * @returns {Promise<number>} New count after increment
   */
  async increment(orgId, meterType, amount = 1) {
    if (!orgId) throw new Error('orgId is required');
    if (!meterType) throw new Error('meterType is required');
    if (typeof amount !== 'number' || amount <= 0) {
      throw new Error('amount must be a positive number');
    }

    const key = this._getKey(orgId, meterType);
    return this.adapter.increment(key, amount);
  }

  /**
   * Get current usage count for a specific meter in a period
   * @param {string} orgId - Organization ID
   * @param {string} meterType - Type of meter
   * @param {string} period - Period ('month', 'day', 'minute') - defaults to appropriate period for meter
   * @returns {Promise<number>} Current count
   */
  async getUsage(orgId, meterType, period = null) {
    if (!orgId) throw new Error('orgId is required');
    if (!meterType) throw new Error('meterType is required');

    const periodToUse = period || this._getDefaultPeriod(meterType);
    const key = this._getKey(orgId, meterType, periodToUse);
    return this.adapter.getCount(key);
  }

  /**
   * Get usage summary for all meters in an organization for a period
   * @param {string} orgId - Organization ID
   * @param {string} period - Period ('month', 'day', 'minute')
   * @returns {Promise<object>} Summary of all meter usage
   */
  async getUsageSummary(orgId, period = 'month') {
    if (!orgId) throw new Error('orgId is required');

    const summary = {};
    for (const meterType of Object.values(METER_TYPES)) {
      const key = this._getKey(orgId, meterType, period);
      summary[meterType] = await this.adapter.getCount(key);
    }
    return summary;
  }

  /**
   * Reset a counter (admin only)
   * @param {string} orgId - Organization ID
   * @param {string} meterType - Type of meter
   * @param {string} period - Period to reset
   * @returns {Promise<boolean>} Success indicator
   */
  async reset(orgId, meterType, period) {
    if (!orgId) throw new Error('orgId is required');
    if (!meterType) throw new Error('meterType is required');
    if (!period) throw new Error('period is required for reset');

    const key = this._getKey(orgId, meterType, period);
    return this.adapter.reset(key);
  }

  /**
   * Get current billing period in YYYY-MM format
   * @returns {string} Current period
   */
  getCurrentPeriod() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  /**
   * Get current day in YYYY-MM-DD format
   * @returns {string} Current day
   */
  getDailyPeriod() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Get current minute in YYYY-MM-DD-HH-mm format
   * @returns {string} Current minute
   */
  getCurrentMinute() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}-${hour}-${minute}`;
  }

  // Helper: Get default period for a meter type
  _getDefaultPeriod(meterType) {
    switch (meterType) {
      case METER_TYPES.API_CALLS:
        return 'minute';
      case METER_TYPES.AGENT_RUNS:
        return 'day';
      case METER_TYPES.INVOICES:
      case METER_TYPES.CLOSE_PACKS:
        return 'month';
      default:
        return 'month';
    }
  }

  // Helper: Build cache key
  _getKey(orgId, meterType, period = null) {
    const periodValue = period || this._getDefaultPeriod(meterType);
    return `usage:${orgId}:${meterType}:${periodValue}`;
  }
}

// ============================================================================
// 4. THREE-LAYER RATE LIMITER
// ============================================================================

export class ThreeLayerRateLimiter {
  constructor(config = {}) {
    this.config = {
      // Layer 1: Global limits
      globalRequestsPerSecond: config.globalRequestsPerSecond || 1000,

      // Layer 2: Sliding window for API keys (in-memory, can be replaced)
      apiKeyWindowMs: config.apiKeyWindowMs || 60000, // 1 minute

      // Layer 3: Uses plan tiers and usage meter
      ...config
    };

    // Layer 1: Global IP tracking
    this.globalLimiter = new Map(); // ip -> { count, resetTime }

    // Layer 2: Per-API-Key sliding window
    this.apiKeyLimiters = new Map(); // apiKey -> { windows: [], resetTime }
  }

  /**
   * Check global IP-based rate limit
   * @param {string} ip - Client IP address
   * @returns {object} { allowed: boolean, remaining: number, resetAfter: number }
   */
  checkGlobalLimit(ip) {
    const now = Date.now();
    const limit = this.config.globalRequestsPerSecond;

    if (!this.globalLimiter.has(ip)) {
      this.globalLimiter.set(ip, { count: 1, resetTime: now + 1000 });
      return {
        allowed: true,
        remaining: limit - 1,
        resetAfter: 1000
      };
    }

    const bucket = this.globalLimiter.get(ip);

    // Reset if window expired
    if (now >= bucket.resetTime) {
      bucket.count = 1;
      bucket.resetTime = now + 1000;
      return {
        allowed: true,
        remaining: limit - 1,
        resetAfter: 1000
      };
    }

    // Check limit
    if (bucket.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAfter: bucket.resetTime - now
      };
    }

    bucket.count++;
    return {
      allowed: true,
      remaining: limit - bucket.count,
      resetAfter: bucket.resetTime - now
    };
  }

  /**
   * Check per-API-Key sliding window rate limit
   * @param {string} apiKey - API key
   * @param {string} planTier - Plan tier (foundation, professional, enterprise, strategic)
   * @returns {object} { allowed: boolean, remaining: number, resetAfter: number }
   */
  checkApiKeyLimit(apiKey, planTier) {
    if (!PLAN_TIERS[planTier]) {
      throw new Error(`Invalid plan tier: ${planTier}`);
    }

    const limit = PLAN_TIERS[planTier].api_requests_per_minute;
    const now = Date.now();
    const windowMs = this.config.apiKeyWindowMs;

    if (!this.apiKeyLimiters.has(apiKey)) {
      this.apiKeyLimiters.set(apiKey, { windows: [now], resetTime: now + windowMs });
      return {
        allowed: true,
        remaining: limit - 1,
        resetAfter: windowMs
      };
    }

    const bucket = this.apiKeyLimiters.get(apiKey);

    // Remove expired windows
    bucket.windows = bucket.windows.filter(time => now - time < windowMs);

    // Check limit
    if (bucket.windows.length >= limit) {
      const oldestWindow = bucket.windows[0];
      const resetAfter = oldestWindow + windowMs - now;
      return {
        allowed: false,
        remaining: 0,
        resetAfter
      };
    }

    bucket.windows.push(now);
    bucket.resetTime = now + windowMs;

    return {
      allowed: true,
      remaining: limit - bucket.windows.length,
      resetAfter: windowMs
    };
  }

  /**
   * Check per-tenant resource quotas
   * @param {string} orgId - Organization ID
   * @param {string} meterType - Type of meter
   * @param {string} planTier - Plan tier
   * @param {number} currentUsage - Current usage for this period
   * @returns {object} { allowed: boolean, remaining: number, willExceed: boolean }
   */
  checkResourceQuota(orgId, meterType, planTier, currentUsage) {
    if (!orgId) throw new Error('orgId is required');
    if (!meterType) throw new Error('meterType is required');
    if (!PLAN_TIERS[planTier]) {
      throw new Error(`Invalid plan tier: ${planTier}`);
    }

    const tierField = METER_TO_TIER_FIELD[meterType];
    if (!tierField) {
      throw new Error(`Unknown meter type: ${meterType}`);
    }

    const limit = PLAN_TIERS[planTier][tierField];

    // Unlimited quotas always pass
    if (limit === Infinity) {
      return {
        allowed: true,
        remaining: Infinity,
        willExceed: false
      };
    }

    const remaining = Math.max(0, limit - currentUsage);
    const allowed = currentUsage < limit;

    return {
      allowed,
      remaining,
      willExceed: currentUsage >= limit
    };
  }

  /**
   * Combined check across all three layers
   * @param {object} request - { ip, apiKey, planTier, orgId, meterType, currentUsage }
   * @returns {object} { allowed, layer, remaining, retryAfter, upgradeUrl, reason }
   */
  async checkAllLayers(request) {
    const { ip, apiKey, planTier, orgId, meterType, currentUsage } = request;

    // Layer 1: Global IP check
    const globalCheck = this.checkGlobalLimit(ip);
    if (!globalCheck.allowed) {
      return {
        allowed: false,
        layer: 'GLOBAL_IP',
        remaining: 0,
        retryAfter: globalCheck.resetAfter,
        upgradeUrl: null,
        reason: 'Global rate limit exceeded'
      };
    }

    // Layer 2: API Key check
    if (apiKey) {
      const apiKeyCheck = this.checkApiKeyLimit(apiKey, planTier);
      if (!apiKeyCheck.allowed) {
        return {
          allowed: false,
          layer: 'API_KEY',
          remaining: 0,
          retryAfter: apiKeyCheck.resetAfter,
          upgradeUrl: '/billing/upgrade',
          reason: 'API key rate limit exceeded'
        };
      }
    }

    // Layer 3: Resource quota check
    if (orgId && meterType) {
      const quotaCheck = this.checkResourceQuota(orgId, meterType, planTier, currentUsage);
      if (!quotaCheck.allowed) {
        return {
          allowed: false,
          layer: 'RESOURCE_QUOTA',
          remaining: 0,
          retryAfter: null,
          upgradeUrl: '/billing/upgrade',
          reason: `${meterType} quota exceeded for ${planTier} plan`
        };
      }
    }

    return {
      allowed: true,
      layer: null,
      remaining: globalCheck.remaining,
      retryAfter: null,
      upgradeUrl: null,
      reason: null
    };
  }

  /**
   * Cleanup old entries (call periodically)
   */
  cleanup() {
    const now = Date.now();
    const gracePeriod = 5 * 60 * 1000; // 5 minutes

    // Clean global limiter
    for (const [ip, bucket] of this.globalLimiter) {
      if (now - bucket.resetTime > gracePeriod) {
        this.globalLimiter.delete(ip);
      }
    }

    // Clean API key limiters
    for (const [key, bucket] of this.apiKeyLimiters) {
      if (now - bucket.resetTime > gracePeriod) {
        this.apiKeyLimiters.delete(key);
      }
    }
  }
}

// ============================================================================
// 5. HTTP RESPONSE HEADER BUILDERS
// ============================================================================

/**
 * Build rate limit headers (429 Too Many Requests)
 */
export function buildRateLimitHeaders(limit, remaining, resetTime) {
  return {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(Math.max(0, remaining)),
    'X-RateLimit-Reset': String(Math.floor(resetTime / 1000)),
    'Retry-After': String(Math.ceil(resetTime / 1000))
  };
}

/**
 * Build quota exceeded headers (402 Payment Required)
 */
export function buildQuotaExceededHeaders(meterType, planTier, upgradeUrl) {
  return {
    'X-Finault-Quota-Exceeded': meterType,
    'X-Finault-Plan': planTier,
    'X-Finault-Upgrade-Url': upgradeUrl,
    'Content-Type': 'application/json'
  };
}

// ============================================================================
// 6. USAGE ANALYTICS
// ============================================================================

/**
 * Get usage analytics for a meter
 * @param {number} currentUsage - Current usage amount
 * @param {number} limit - Plan limit
 * @param {string} period - Period type ('minute', 'day', 'month')
 * @returns {object} Analytics including projections
 */
export function getUsageAnalytics(currentUsage, limit, period = 'month') {
  // Handle unlimited quotas
  if (limit === Infinity) {
    return {
      current: currentUsage,
      limit: Infinity,
      percentage: 0,
      daysRemaining: Infinity,
      projectedUsage: 0,
      willExceed: false,
      status: 'unlimited'
    };
  }

  const percentage = (currentUsage / limit) * 100;

  // Calculate days remaining in period
  const now = new Date();
  let daysRemaining = 0;

  if (period === 'month') {
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    daysRemaining = lastDay - now.getDate();
  } else if (period === 'day') {
    daysRemaining = now.getHours() < 23 ? 1 : 0;
  } else if (period === 'minute') {
    daysRemaining = 0;
  }

  // Project usage if period is month
  let projectedUsage = currentUsage;
  if (period === 'month' && daysRemaining > 0) {
    const daysElapsed = now.getDate() - 1;
    const dailyRate = currentUsage / Math.max(1, daysElapsed);
    projectedUsage = dailyRate * new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  }

  const willExceed = projectedUsage > limit;

  // Determine status
  let status = 'ok';
  if (percentage >= 90) status = 'warning';
  if (percentage >= 100) status = 'exceeded';

  return {
    current: currentUsage,
    limit,
    percentage: Math.round(percentage * 100) / 100,
    daysRemaining: Math.max(0, daysRemaining),
    projectedUsage: Math.round(projectedUsage),
    willExceed,
    status
  };
}

/**
 * Get organization usage analytics across all meters
 * @param {object} usageSummary - Summary from UsageMeter.getUsageSummary()
 * @param {string} planTier - Plan tier
 * @param {string} period - Period type
 * @returns {object} Analytics for all meters
 */
export function getOrgUsageAnalytics(usageSummary, planTier, period = 'month') {
  if (!PLAN_TIERS[planTier]) {
    throw new Error(`Invalid plan tier: ${planTier}`);
  }

  const tierConfig = PLAN_TIERS[planTier];
  const analytics = {};

  for (const [meterType, currentUsage] of Object.entries(usageSummary)) {
    const tierField = METER_TO_TIER_FIELD[meterType];
    if (!tierField) continue;

    const limit = tierConfig[tierField];
    analytics[meterType] = getUsageAnalytics(currentUsage, limit, period);
  }

  return analytics;
}

// ============================================================================
// 7. QUOTA CHECK HELPER
// ============================================================================

/**
 * Helper to check if an action should be allowed based on quotas
 * Useful for pre-flight checks before expensive operations
 */
export function canPerformAction(currentUsage, limit, actionSize = 1) {
  if (limit === Infinity) return true;
  return (currentUsage + actionSize) <= limit;
}

/**
 * Helper to determine if near quota threshold
 */
export function isNearQuota(currentUsage, limit, thresholdPercent = 80) {
  if (limit === Infinity) return false;
  const percentage = (currentUsage / limit) * 100;
  return percentage >= thresholdPercent;
}
