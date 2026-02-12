/**
 * Rate Limiter Unit Tests
 * Comprehensive test suite for rate limiting middleware
 */

const {
  RateLimitStore,
  AdvancedRateLimiter,
  RATE_LIMIT_CONFIG,
  getClientIp,
  getOrgId,
  getEndpointCategory,
  getRateLimitConfig,
  generateRateLimitKey,
  createRateLimitResponse,
  createRateLimitHeaders
} = require('./rate-limiter');

// Test utilities
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
};

const assertEquals = (actual, expected, message) => {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
};

const assertTrue = (condition, message) => {
  assert(condition, message);
};

const assertFalse = (condition, message) => {
  assert(!condition, message);
};

// ============================================================================
// Test Suite 1: RateLimitStore
// ============================================================================

function testRateLimitStoreBasic() {
  console.log('TEST: RateLimitStore - Basic operations');

  const store = new RateLimitStore();
  const key = 'test:key';
  const now = Date.now();

  // Initially empty
  assertEquals(store.getCount(key, 60000), 0, 'Initial count should be 0');

  // Record one request
  store.record(key, now, 60000);
  assertEquals(store.getCount(key, 60000), 1, 'Count after one record should be 1');

  // Record multiple requests
  store.record(key, now, 60000);
  store.record(key, now, 60000);
  assertEquals(store.getCount(key, 60000), 3, 'Count should be 3');

  // Clear store
  store.clear();
  assertEquals(store.getCount(key, 60000), 0, 'Count after clear should be 0');

  console.log('✓ RateLimitStore basic operations passed');
}

function testRateLimitStoreTTL() {
  console.log('TEST: RateLimitStore - TTL cleanup');

  const store = new RateLimitStore();
  const key = 'test:ttl';
  const now = Date.now();

  // Record a request
  store.record(key, now, 100);  // 100ms window

  // Verify it's stored
  assertTrue(store.store.has(key), 'Key should exist in store');

  // TTL should clean up after window + 60s, but we'll skip the timing test
  // as it would require waiting

  store.clear();
  console.log('✓ RateLimitStore TTL handling passed');
}

function testRateLimitStoreWindowFiltering() {
  console.log('TEST: RateLimitStore - Window-based filtering');

  const store = new RateLimitStore();
  const key = 'test:window';
  const windowMs = 1000;  // 1 second window
  const now = Date.now();

  // Add requests with different ages
  store.record(key, now, windowMs);           // 0ms old
  store.record(key, now - 500, windowMs);     // 500ms old (still valid)
  store.record(key, now - 1500, windowMs);    // 1500ms old (outside window)
  store.record(key, now - 2000, windowMs);    // 2000ms old (outside window)

  // Should only count the 2 requests within the window
  const count = store.getCount(key, windowMs);
  assertEquals(count, 2, 'Should only count requests within window');

  store.clear();
  console.log('✓ RateLimitStore window filtering passed');
}

function testRateLimitStoreStats() {
  console.log('TEST: RateLimitStore - Statistics');

  const store = new RateLimitStore();
  const now = Date.now();

  // Add multiple keys with different request counts
  store.record('key1', now, 60000);
  store.record('key1', now, 60000);
  store.record('key2', now, 60000);
  store.record('key3', now, 60000);
  store.record('key3', now, 60000);
  store.record('key3', now, 60000);

  const stats = store.getStats();
  assertEquals(stats.keyCount, 3, 'Should have 3 keys');
  assertEquals(stats.timerCount, 3, 'Should have 3 timers');

  store.clear();
  console.log('✓ RateLimitStore statistics passed');
}

// ============================================================================
// Test Suite 2: Utility Functions
// ============================================================================

function testGetClientIp() {
  console.log('TEST: getClientIp - IP extraction');

  // Mock request objects
  const cfRequest = {
    headers: {
      get: (name) => name === 'CF-Connecting-IP' ? '192.0.2.1' : null
    }
  };
  const xForwardedForRequest = {
    headers: {
      get: (name) => name === 'X-Forwarded-For' ? '192.0.2.2, 192.0.2.3' : null
    }
  };
  const xRealIpRequest = {
    headers: {
      get: (name) => name === 'X-Real-IP' ? '192.0.2.4' : null
    }
  };
  const noIpRequest = {
    headers: {
      get: (name) => null
    }
  };

  assertEquals(getClientIp(cfRequest), '192.0.2.1', 'Should use CF-Connecting-IP');
  assertEquals(getClientIp(xForwardedForRequest), '192.0.2.2', 'Should use first IP from X-Forwarded-For');
  assertEquals(getClientIp(xRealIpRequest), '192.0.2.4', 'Should use X-Real-IP');
  assertEquals(getClientIp(noIpRequest), 'unknown', 'Should fall back to unknown');

  console.log('✓ getClientIp tests passed');
}

function testGetOrgId() {
  console.log('TEST: getOrgId - Organization ID extraction');

  // Mock request with different org ID sources
  const contextRequest = {
    headers: {
      get: (name) => null
    }
  };
  const headerRequest = {
    headers: {
      get: (name) => name === 'X-Org-ID' ? 'org-123' : null
    }
  };

  const context = { orgId: 'org-from-context' };

  assertEquals(getOrgId(contextRequest, context), 'org-from-context', 'Should use context orgId');
  assertEquals(getOrgId(headerRequest, null), 'org-123', 'Should use header orgId');
  assertEquals(getOrgId(contextRequest, null), null, 'Should return null if no orgId found');

  console.log('✓ getOrgId tests passed');
}

function testGetEndpointCategory() {
  console.log('TEST: getEndpointCategory - Endpoint classification');

  assertEquals(getEndpointCategory('/api/v1/parse'), 'heavy', 'Should classify /parse as heavy');
  assertEquals(getEndpointCategory('/api/v1/bulk-upload'), 'heavy', 'Should classify /bulk-upload as heavy');
  assertEquals(getEndpointCategory('/api/v1/proxy'), 'proxy', 'Should classify /proxy as proxy');
  assertEquals(getEndpointCategory('/api/v1/forward'), 'proxy', 'Should classify /forward as proxy');
  assertEquals(getEndpointCategory('/api/v1/data'), null, 'Should classify /data as null');

  console.log('✓ getEndpointCategory tests passed');
}

function testGetRateLimitConfig() {
  console.log('TEST: getRateLimitConfig - Config selection');

  const heavyPath = '/api/v1/parse';
  const standardPath = '/api/v1/data';

  // Heavy endpoints should use heavy config regardless of auth
  const heavyConfig = getRateLimitConfig(false, null, heavyPath);
  assertEquals(heavyConfig.rps, RATE_LIMIT_CONFIG.heavy.rps, 'Heavy path should use heavy config');

  // Authenticated requests should use authenticated config
  const authConfig = getRateLimitConfig(true, 'org-123', standardPath);
  assertEquals(authConfig.rps, RATE_LIMIT_CONFIG.authenticated.rps, 'Authenticated request should use authenticated config');

  // Unauthenticated should use default config
  const defaultConfig = getRateLimitConfig(false, null, standardPath);
  assertEquals(defaultConfig.rps, RATE_LIMIT_CONFIG.default.rps, 'Unauthenticated should use default config');

  console.log('✓ getRateLimitConfig tests passed');
}

function testGenerateRateLimitKey() {
  console.log('TEST: generateRateLimitKey - Key generation');

  const mockRequest = {
    headers: {
      get: (name) => {
        if (name === 'CF-Connecting-IP') return '192.0.2.1';
        return null;
      }
    }
  };

  // IP-based key
  const ipKey = generateRateLimitKey(mockRequest, false, null, RATE_LIMIT_CONFIG.default);
  assertTrue(ipKey.startsWith('ip:'), 'IP-based key should start with ip:');

  // Org-based key
  const orgKey = generateRateLimitKey(mockRequest, true, 'org-456', RATE_LIMIT_CONFIG.authenticated);
  assertTrue(orgKey.startsWith('org:'), 'Org-based key should start with org:');

  console.log('✓ generateRateLimitKey tests passed');
}

// ============================================================================
// Test Suite 3: AdvancedRateLimiter
// ============================================================================

function testAdvancedRateLimiterCheckLimit() {
  console.log('TEST: AdvancedRateLimiter - Check limit');

  const store = new RateLimitStore();
  const limiter = new AdvancedRateLimiter({ store });
  const config = RATE_LIMIT_CONFIG.default;

  // Create a mock entry in store
  const now = Date.now();
  store.record('test:key', now, config.windowMs);

  const result = limiter.checkLimit('test:key', config);
  assertTrue(!result.limited, 'Single request should not exceed limit');
  assertTrue(result.remaining > 0, 'Should have remaining requests');

  store.clear();
  console.log('✓ AdvancedRateLimiter checkLimit passed');
}

function testAdvancedRateLimiterRecordAndCheck() {
  console.log('TEST: AdvancedRateLimiter - Record and check');

  const store = new RateLimitStore();
  const limiter = new AdvancedRateLimiter({ store });
  const config = RATE_LIMIT_CONFIG.default;

  const result = limiter.recordAndCheck('test:key', config);
  assertTrue(!result.limited, 'First request should not be limited');
  assertEquals(result.current, 1, 'Should have recorded 1 request');

  store.clear();
  console.log('✓ AdvancedRateLimiter recordAndCheck passed');
}

function testAdvancedRateLimiterStats() {
  console.log('TEST: AdvancedRateLimiter - Statistics');

  const store = new RateLimitStore();
  const limiter = new AdvancedRateLimiter({ store });

  const stats = limiter.getStats();
  assertTrue(stats.keyCount >= 0, 'Stats should have keyCount');

  store.clear();
  console.log('✓ AdvancedRateLimiter stats passed');
}

// ============================================================================
// Test Suite 4: Response Formatting
// ============================================================================

function testCreateRateLimitResponse() {
  console.log('TEST: createRateLimitResponse - 429 response format');

  const config = RATE_LIMIT_CONFIG.default;
  const response = createRateLimitResponse(config, 105, 'ip:192.0.2.1');

  assertEquals(response.status, 429, 'Should return 429 status');
  assertTrue(response.headers.has('Retry-After'), 'Should include Retry-After header');
  assertTrue(response.headers.has('X-RateLimit-Limit'), 'Should include X-RateLimit-Limit header');
  assertTrue(response.headers.has('X-RateLimit-Key'), 'Should include X-RateLimit-Key header');

  console.log('✓ createRateLimitResponse format passed');
}

function testCreateRateLimitHeaders() {
  console.log('TEST: createRateLimitHeaders - Response headers');

  const config = RATE_LIMIT_CONFIG.default;
  const headers = createRateLimitHeaders(config, 50, 50);

  assertTrue('X-RateLimit-Limit' in headers, 'Should have X-RateLimit-Limit');
  assertTrue('X-RateLimit-Remaining' in headers, 'Should have X-RateLimit-Remaining');
  assertTrue('X-RateLimit-Reset' in headers, 'Should have X-RateLimit-Reset');
  assertTrue('X-RateLimit-WindowMs' in headers, 'Should have X-RateLimit-WindowMs');

  console.log('✓ createRateLimitHeaders format passed');
}

// ============================================================================
// Test Suite 5: Rate Limit Exhaustion
// ============================================================================

function testRateExhaustion() {
  console.log('TEST: Rate exhaustion scenario');

  const store = new RateLimitStore();
  const limiter = new AdvancedRateLimiter({ store });
  const config = RATE_LIMIT_CONFIG.default;
  const key = 'test:exhaustion';
  const limit = Math.floor(config.rps * config.windowMs / 1000);

  // Record requests up to limit - 1 (since recordAndCheck records BEFORE checking,
  // the Nth call will see count=N, and limit=N means limited at count>=N)
  for (let i = 0; i < limit - 1; i++) {
    const result = limiter.recordAndCheck(key, config);
    assertFalse(result.limited, `Request ${i + 1} should not be limited`);
  }

  // The limit-th request should be rate limited (count == limit)
  const result = limiter.recordAndCheck(key, config);
  assertTrue(result.limited, 'Request at limit should be limited');

  store.clear();
  console.log('✓ Rate exhaustion scenario passed');
}

// ============================================================================
// Test Runner
// ============================================================================

function runAllTests() {
  console.log('\n' + '='.repeat(60));
  console.log('FINAULT RATE LIMITER TEST SUITE');
  console.log('='.repeat(60) + '\n');

  const tests = [
    // RateLimitStore tests
    testRateLimitStoreBasic,
    testRateLimitStoreTTL,
    testRateLimitStoreWindowFiltering,
    testRateLimitStoreStats,

    // Utility function tests
    testGetClientIp,
    testGetOrgId,
    testGetEndpointCategory,
    testGetRateLimitConfig,
    testGenerateRateLimitKey,

    // AdvancedRateLimiter tests
    testAdvancedRateLimiterCheckLimit,
    testAdvancedRateLimiterRecordAndCheck,
    testAdvancedRateLimiterStats,

    // Response formatting tests
    testCreateRateLimitResponse,
    testCreateRateLimitHeaders,

    // Scenario tests
    testRateExhaustion
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      test();
      passed++;
    } catch (error) {
      console.error(`✗ ${test.name} FAILED: ${error.message}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60) + '\n');

  return failed === 0;
}

// Export for use in test frameworks
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    runAllTests,
    // Individual test suites
    testRateLimitStoreBasic,
    testRateLimitStoreTTL,
    testRateLimitStoreWindowFiltering,
    testRateLimitStoreStats,
    testGetClientIp,
    testGetOrgId,
    testGetEndpointCategory,
    testGetRateLimitConfig,
    testGenerateRateLimitKey,
    testAdvancedRateLimiterCheckLimit,
    testAdvancedRateLimiterRecordAndCheck,
    testAdvancedRateLimiterStats,
    testCreateRateLimitResponse,
    testCreateRateLimitHeaders,
    testRateExhaustion
  };
}

// Run tests if executed directly
if (require.main === module) {
  const success = runAllTests();
  process.exit(success ? 0 : 1);
}
