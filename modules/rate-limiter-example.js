/**
 * Rate Limiter Integration Examples
 * Complete working examples for integrating the rate limiter into Finault gateway
 */

// ============================================================================
// EXAMPLE 1: Basic Integration with worker.js
// ============================================================================

/**
 * This example shows how to integrate rate limiting into the main Cloudflare
 * Workers entry point with Hono framework.
 */

/*
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt';
import { rateLimitMiddleware } from './modules/rate-limiter';

const app = new Hono();

// Apply global rate limiting to all routes
app.use('*', cors());
app.use('*', rateLimitMiddleware());

// Your existing routes follow...
app.get('/', (c) => c.json({ status: 'ok' }));

export default app;
*/

// ============================================================================
// EXAMPLE 2: Selective Rate Limiting per Route
// ============================================================================

/**
 * Apply different rate limit strategies to different endpoint categories
 */

/*
import { Hono } from 'hono';
import { rateLimitMiddleware, RATE_LIMIT_CONFIG } from './modules/rate-limiter';

const app = new Hono();

// Global light middleware for health checks
app.get('/health', (c) => c.json({ status: 'healthy' }));

// Rate limit all other endpoints
const standardLimiter = rateLimitMiddleware();

// Heavy operations get stricter limits (enforced automatically)
app.post('/api/v1/parse', standardLimiter, async (c) => {
  // This automatically uses heavy endpoint limits (10 req/min)
  const data = await c.req.json();
  return c.json({ parsed: true });
});

app.post('/api/v1/bulk-upload', standardLimiter, async (c) => {
  // Also uses heavy endpoint limits
  return c.json({ uploaded: true });
});

// Standard authenticated endpoints
app.get('/api/v1/data', standardLimiter, (c) => {
  // Uses authenticated limits (1000 req/min) if auth header present
  return c.json({ data: [] });
});

// Proxy endpoints get medium limits
app.post('/api/v1/proxy', standardLimiter, (c) => {
  // Uses proxy limits (500 req/min)
  return c.json({ forwarded: true });
});

export default app;
*/

// ============================================================================
// EXAMPLE 3: Custom Configuration Per Route
// ============================================================================

/**
 * Override rate limits for specific routes
 */

/*
import { Hono } from 'hono';
import { rateLimitMiddleware, RATE_LIMIT_CONFIG } from './modules/rate-limiter';

const app = new Hono();

// Very strict limits for login attempts
const loginLimiter = rateLimitMiddleware({
  customConfig: {
    rps: 5 / 60,        // 5 requests per minute
    windowMs: 60000,
    keyGenerator: 'ip'
  }
});

app.post('/auth/login', loginLimiter, async (c) => {
  const credentials = await c.req.json();
  // Authentication logic
  return c.json({ token: 'jwt-token' });
});

// Premium/VIP rate limits
const vipLimiter = rateLimitMiddleware({
  customConfig: {
    rps: 5000 / 60,     // 5000 requests per minute
    windowMs: 60000,
    keyGenerator: 'orgId'
  },
  skipCondition: (request) => {
    // Check if VIP customer
    return request.headers.get('X-VIP-Token') === process.env.VIP_KEY;
  }
});

app.get('/api/v1/premium-data', vipLimiter, (c) => {
  return c.json({ data: 'premium content' });
});

export default app;
*/

// ============================================================================
// EXAMPLE 4: Monitoring and Logging Rate Limit Violations
// ============================================================================

/**
 * Log all rate limit violations for monitoring and abuse detection
 */

/*
import { Hono } from 'hono';
import { rateLimitMiddleware } from './modules/rate-limiter';
import { AuditLogger } from './modules/audit-logging';

const auditLogger = new AuditLogger();

const limiter = rateLimitMiddleware({
  onLimitExceeded: async ({ key, count, limit, request, config }) => {
    const pathname = new URL(request.url).pathname;

    console.warn('[RATE_LIMIT] Violation detected', {
      key,
      count: Math.floor(count),
      limit: Math.floor(limit),
      path: pathname,
      timestamp: new Date().toISOString()
    });

    // Log to audit system
    try {
      await auditLogger.logSecurityEvent({
        eventType: 'rate_limit_violation',
        severity: 'medium',
        subject: key,
        details: {
          endpoint: pathname,
          requestCount: Math.floor(count),
          limit: Math.floor(limit)
        }
      });
    } catch (e) {
      console.error('Failed to log rate limit violation:', e);
    }
  }
});

const app = new Hono();
app.use('*', limiter);

export default app;
*/

// ============================================================================
// EXAMPLE 5: Advanced Rate Limiter with Custom Storage
// ============================================================================

/**
 * Use AdvancedRateLimiter for more control and custom storage backends
 */

/*
import { Hono } from 'hono';
import { AdvancedRateLimiter, RATE_LIMIT_CONFIG, getClientIp, getOrgId } from './modules/rate-limiter';

// Create custom limiter instance
const limiter = new AdvancedRateLimiter({
  config: RATE_LIMIT_CONFIG,
  logger: console
});

const app = new Hono();

// Create middleware that uses advanced limiter
const advancedLimitMiddleware = async (c, next) => {
  const request = c.req;
  const ip = getClientIp(request);
  const orgId = getOrgId(request, c.env || {});

  // Determine key and config
  const key = orgId ? `org:${orgId}` : `ip:${ip}`;
  const pathname = new URL(request.url).pathname;
  const isAuthenticated = !!request.headers.get('Authorization');

  let config = RATE_LIMIT_CONFIG.default;
  if (pathname.includes('/parse')) {
    config = RATE_LIMIT_CONFIG.heavy;
  } else if (pathname.includes('/proxy')) {
    config = RATE_LIMIT_CONFIG.proxy;
  } else if (isAuthenticated && orgId) {
    config = RATE_LIMIT_CONFIG.authenticated;
  }

  // Check rate limit
  const result = limiter.recordAndCheck(key, config);

  if (result.limited) {
    return c.json({
      error: 'Rate limit exceeded',
      message: `Maximum ${result.limit} requests per minute`,
      resetIn: result.resetIn,
      retryAfter: result.resetIn
    }, 429);
  }

  // Add rate limit headers
  const response = await next();
  response.headers.set('X-RateLimit-Limit', String(result.limit));
  response.headers.set('X-RateLimit-Remaining', String(result.remaining));
  response.headers.set('X-RateLimit-Reset', String(Math.ceil((Date.now() + result.resetIn * 1000) / 1000)));

  return response;
};

app.use('*', advancedLimitMiddleware);

export default app;
*/

// ============================================================================
// EXAMPLE 6: Skip Rate Limiting for Internal/Admin Requests
// ============================================================================

/**
 * Bypass rate limiting for internal services and admin users
 */

/*
import { Hono } from 'hono';
import { rateLimitMiddleware } from './modules/rate-limiter';

const limiter = rateLimitMiddleware({
  skipCondition: (request) => {
    // Skip for health check endpoints
    const pathname = new URL(request.url).pathname;
    if (pathname === '/health' || pathname === '/metrics') {
      return true;
    }

    // Skip for admin requests with valid admin key
    const adminKey = request.headers.get('X-Admin-Key');
    if (adminKey === process.env.ADMIN_KEY) {
      console.log('[ADMIN] Request bypassed rate limiting');
      return true;
    }

    // Skip for internal service-to-service requests
    if (request.headers.get('X-Internal-Request') === 'true') {
      return true;
    }

    // Skip for requests from trusted IPs
    const trustedIPs = (process.env.TRUSTED_IPS || '').split(',');
    const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (trustedIPs.includes(clientIp)) {
      return true;
    }

    return false;
  }
});

const app = new Hono();
app.use('*', limiter);

export default app;
*/

// ============================================================================
// EXAMPLE 7: Dynamic Rate Limits Based on User Plan
// ============================================================================

/**
 * Adjust rate limits based on subscription tier or user plan
 */

/*
import { Hono } from 'hono';
import { rateLimitMiddleware, RATE_LIMIT_CONFIG } from './modules/rate-limiter';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Plan-based rate limit overrides
const PLAN_LIMITS = {
  free: {
    rps: 100 / 60,
    windowMs: 60000
  },
  pro: {
    rps: 1000 / 60,
    windowMs: 60000
  },
  enterprise: {
    rps: 10000 / 60,
    windowMs: 60000
  }
};

const app = new Hono();

// Middleware to lookup and apply plan-based limits
const planBasedLimiter = async (c, next) => {
  const request = c.req;
  const orgId = request.headers.get('X-Org-ID');

  if (!orgId) {
    // No org, use default limits
    return next();
  }

  try {
    // Lookup organization plan
    const { data, error } = await supabase
      .from('organizations')
      .select('plan')
      .eq('id', orgId)
      .single();

    if (error || !data) {
      console.warn('Could not lookup org plan:', orgId);
      return next();
    }

    const planLimit = PLAN_LIMITS[data.plan] || PLAN_LIMITS.free;
    const customConfig = {
      ...RATE_LIMIT_CONFIG.authenticated,
      ...planLimit,
      keyGenerator: 'orgId'
    };

    // Apply rate limiting with plan-based config
    const limiter = rateLimitMiddleware({ customConfig });
    return limiter(c, next);
  } catch (e) {
    console.error('Error in plan-based limiter:', e);
    return next();
  }
};

app.use('*', planBasedLimiter);

export default app;
*/

// ============================================================================
// EXAMPLE 8: Testing Rate Limiter
// ============================================================================

/**
 * Test harness for validating rate limiter behavior
 */

/*
import { RateLimitStore, RATE_LIMIT_CONFIG, generateRateLimitKey } from './modules/rate-limiter';

async function testRateLimiter() {
  const store = new RateLimitStore();
  const config = RATE_LIMIT_CONFIG.default;
  const key = 'test:key';

  console.log('Testing rate limiter...');
  console.log(`Config: ${config.rps} req/sec, ${config.windowMs}ms window`);

  const limit = Math.floor(config.rps * config.windowMs / 1000);
  console.log(`Effective limit: ${limit} requests per minute`);

  // Record requests up to the limit
  let count = 0;
  const startTime = Date.now();

  for (let i = 0; i < limit + 5; i++) {
    store.record(key, Date.now(), config.windowMs);
    count = store.getCount(key, config.windowMs);

    if (i === limit - 1) {
      console.log(`✓ Request ${i + 1}: OK (count: ${count})`);
    } else if (i === limit) {
      console.log(`✗ Request ${i + 1}: RATE LIMITED (count: ${count})`);
    } else if (i > limit) {
      console.log(`✗ Request ${i + 1}: RATE LIMITED (count: ${count})`);
    }
  }

  const duration = Date.now() - startTime;
  console.log(`\nTest completed in ${duration}ms`);
  console.log(`Store stats:`, store.getStats());

  // Test TTL cleanup
  console.log('\nTesting TTL cleanup...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  console.log(`Store stats after 2s:`, store.getStats());

  // Clean up
  store.clear();
  console.log('Store cleared');
}

// Run test
testRateLimiter().catch(console.error);
*/

// ============================================================================
// EXAMPLE 9: Rate Limit Statistics Dashboard
// ============================================================================

/**
 * Expose rate limiting statistics for monitoring dashboards
 */

/*
import { Hono } from 'hono';
import { rateLimitMiddleware, globalStore } from './modules/rate-limiter';

const app = new Hono();

// Rate limit all endpoints
app.use('*', rateLimitMiddleware());

// Admin endpoint to view rate limit statistics
app.get('/admin/rate-limit-stats', (c) => {
  const adminKey = c.req.headers.get('X-Admin-Key');

  // Verify admin access
  if (adminKey !== process.env.ADMIN_KEY) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const stats = globalStore.getStats();

  return c.json({
    timestamp: new Date().toISOString(),
    rateLimiter: {
      activeKeys: stats.keyCount,
      activeTimers: stats.timerCount,
      avgRequestsPerKey: stats.avgTimestampsPerKey,
      memoryUsageEstimate: `${(stats.keyCount * 200 / 1024).toFixed(2)} KB`
    },
    config: {
      defaultLimit: '100 req/min per IP',
      authenticatedLimit: '1000 req/min per org',
      heavyEndpointsLimit: '10 req/min per org',
      proxyEndpointsLimit: '500 req/min per org'
    }
  });
});

export default app;
*/

// ============================================================================
// EXAMPLE 10: Rate Limiter with Circuit Breaker Pattern
// ============================================================================

/**
 * Combine rate limiting with circuit breaker for enhanced protection
 */

/*
import { Hono } from 'hono';
import { rateLimitMiddleware } from './modules/rate-limiter';

class CircuitBreaker {
  constructor(failureThreshold = 10, resetTimeout = 60000) {
    this.failureThreshold = failureThreshold;
    this.resetTimeout = resetTimeout;
    this.failures = new Map();
  }

  recordFailure(key) {
    const count = (this.failures.get(key) || 0) + 1;
    this.failures.set(key, count);
    return count >= this.failureThreshold;
  }

  reset(key) {
    this.failures.delete(key);
  }
}

const breaker = new CircuitBreaker();

const app = new Hono();

// Rate limit + circuit breaker protection
const protectedLimiter = async (c, next) => {
  const request = c.req;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const key = `ip:${ip}`;

  // Check circuit breaker
  if (breaker.failures.has(key) && breaker.failures.get(key) >= breaker.failureThreshold) {
    return c.json({
      error: 'Service temporarily unavailable',
      message: 'Too many errors from your IP address'
    }, 503);
  }

  try {
    const response = await next();

    // Reset failures on success
    if (response.status < 500) {
      breaker.reset(key);
    }

    return response;
  } catch (error) {
    // Record failure
    const isBroken = breaker.recordFailure(key);
    if (isBroken) {
      return c.json({
        error: 'Service temporarily unavailable',
        message: 'Too many errors from your IP address'
      }, 503);
    }
    throw error;
  }
};

app.use('*', rateLimitMiddleware());
app.use('*', protectedLimiter);

export default app;
*/

// This file is for documentation and examples only.
// To use in production, copy the relevant example sections into your actual
// worker.js or route handler files.
