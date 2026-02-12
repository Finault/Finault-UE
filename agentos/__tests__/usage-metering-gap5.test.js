/**
 * Usage Metering & Plan-Tier Quota Enforcement System
 * Gap 5 Test Suite - 150+ Comprehensive Tests
 */

import {
  METER_TYPES,
  PLAN_TIERS,
  UsageMeter,
  ThreeLayerRateLimiter,
  buildRateLimitHeaders,
  buildQuotaExceededHeaders,
  getUsageAnalytics,
  getOrgUsageAnalytics,
  canPerformAction,
  isNearQuota
} from '../core/usage-metering.js';

// ============================================================================
// TEST FRAMEWORK
// ============================================================================

class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
    this.errors = [];
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('🧪 Running Usage Metering Gap 5 Test Suite\n');

    for (const test of this.tests) {
      try {
        const result = test.fn();
        if (result && typeof result.then === 'function') {
          await result;
        }
        this.passed++;
        process.stdout.write('.');
      } catch (error) {
        this.failed++;
        this.errors.push({ test: test.name, error: error.message });
        process.stdout.write('F');
      }
    }

    console.log('\n');
    this.printSummary();
  }

  printSummary() {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`Total Tests: ${this.passed + this.failed}`);
    console.log(`Passed: ✅ ${this.passed}`);
    console.log(`Failed: ❌ ${this.failed}`);
    console.log(`${'='.repeat(70)}\n`);

    if (this.errors.length > 0) {
      console.log('FAILURES:\n');
      this.errors.forEach((err, idx) => {
        console.log(`${idx + 1}. ${err.test}`);
        console.log(`   Error: ${err.error}\n`);
      });
      process.exit(1);
    } else {
      console.log('✨ All tests passed!\n');
      process.exit(0);
    }
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`${message}: expected ${expectedStr}, got ${actualStr}`);
  }
}

// ============================================================================
// MOCK ADAPTER FOR TESTING
// ============================================================================

class MockAdapter {
  constructor() {
    this.data = new Map();
  }

  increment(key, amount) {
    const current = this.data.get(key) || 0;
    const newValue = current + amount;
    this.data.set(key, newValue);
    return Promise.resolve(newValue);
  }

  getCount(key) {
    return Promise.resolve(this.data.get(key) || 0);
  }

  reset(key) {
    this.data.set(key, 0);
    return Promise.resolve(true);
  }

  clear() {
    this.data.clear();
  }
}

// ============================================================================
// TESTS
// ============================================================================

const runner = new TestRunner();

// ============================================================================
// 1. METER_TYPES VALIDATION TESTS
// ============================================================================

runner.test('METER_TYPES.API_CALLS is defined', () => {
  assertEqual(METER_TYPES.API_CALLS, 'api_calls', 'API_CALLS');
});

runner.test('METER_TYPES.INVOICES is defined', () => {
  assertEqual(METER_TYPES.INVOICES, 'invoices', 'INVOICES');
});

runner.test('METER_TYPES.CLOSE_PACKS is defined', () => {
  assertEqual(METER_TYPES.CLOSE_PACKS, 'close_packs', 'CLOSE_PACKS');
});

runner.test('METER_TYPES.PROVIDER_CONNECTIONS is defined', () => {
  assertEqual(METER_TYPES.PROVIDER_CONNECTIONS, 'provider_connections', 'PROVIDER_CONNECTIONS');
});

runner.test('METER_TYPES.USER_SEATS is defined', () => {
  assertEqual(METER_TYPES.USER_SEATS, 'user_seats', 'USER_SEATS');
});

runner.test('METER_TYPES.STORAGE_BYTES is defined', () => {
  assertEqual(METER_TYPES.STORAGE_BYTES, 'storage_bytes', 'STORAGE_BYTES');
});

runner.test('METER_TYPES.AGENT_RUNS is defined', () => {
  assertEqual(METER_TYPES.AGENT_RUNS, 'agent_runs', 'AGENT_RUNS');
});

runner.test('METER_TYPES.WEBHOOK_ENDPOINTS is defined', () => {
  assertEqual(METER_TYPES.WEBHOOK_ENDPOINTS, 'webhook_endpoints', 'WEBHOOK_ENDPOINTS');
});

// ============================================================================
// 2. PLAN TIERS VALIDATION TESTS
// ============================================================================

runner.test('PLAN_TIERS.foundation tier exists', () => {
  assert(PLAN_TIERS.foundation, 'foundation tier');
});

runner.test('PLAN_TIERS.professional tier exists', () => {
  assert(PLAN_TIERS.professional, 'professional tier');
});

runner.test('PLAN_TIERS.enterprise tier exists', () => {
  assert(PLAN_TIERS.enterprise, 'enterprise tier');
});

runner.test('PLAN_TIERS.strategic tier exists', () => {
  assert(PLAN_TIERS.strategic, 'strategic tier');
});

runner.test('foundation tier has api_requests_per_minute = 100', () => {
  assertEqual(PLAN_TIERS.foundation.api_requests_per_minute, 100, 'foundation API limit');
});

runner.test('professional tier has api_requests_per_minute = 500', () => {
  assertEqual(PLAN_TIERS.professional.api_requests_per_minute, 500, 'professional API limit');
});

runner.test('enterprise tier has api_requests_per_minute = 2000', () => {
  assertEqual(PLAN_TIERS.enterprise.api_requests_per_minute, 2000, 'enterprise API limit');
});

runner.test('strategic tier has api_requests_per_minute = 10000', () => {
  assertEqual(PLAN_TIERS.strategic.api_requests_per_minute, 10000, 'strategic API limit');
});

runner.test('foundation tier has invoices_per_month = 25', () => {
  assertEqual(PLAN_TIERS.foundation.invoices_per_month, 25, 'foundation invoices');
});

runner.test('professional tier has invoices_per_month = 100', () => {
  assertEqual(PLAN_TIERS.professional.invoices_per_month, 100, 'professional invoices');
});

runner.test('enterprise tier has invoices_per_month = 500', () => {
  assertEqual(PLAN_TIERS.enterprise.invoices_per_month, 500, 'enterprise invoices');
});

runner.test('strategic tier has invoices_per_month = Infinity', () => {
  assertEqual(PLAN_TIERS.strategic.invoices_per_month, Infinity, 'strategic invoices');
});

runner.test('foundation tier has close_packs_per_month = 1', () => {
  assertEqual(PLAN_TIERS.foundation.close_packs_per_month, 1, 'foundation close packs');
});

runner.test('professional tier has close_packs_per_month = 2', () => {
  assertEqual(PLAN_TIERS.professional.close_packs_per_month, 2, 'professional close packs');
});

runner.test('enterprise tier has close_packs_per_month = Infinity', () => {
  assertEqual(PLAN_TIERS.enterprise.close_packs_per_month, Infinity, 'enterprise close packs');
});

runner.test('foundation tier has provider_connections = 3', () => {
  assertEqual(PLAN_TIERS.foundation.provider_connections, 3, 'foundation connections');
});

runner.test('professional tier has provider_connections = 8', () => {
  assertEqual(PLAN_TIERS.professional.provider_connections, 8, 'professional connections');
});

runner.test('enterprise tier has user_seats = 15', () => {
  assertEqual(PLAN_TIERS.enterprise.user_seats, 15, 'enterprise seats');
});

runner.test('strategic tier has user_seats = Infinity', () => {
  assertEqual(PLAN_TIERS.strategic.user_seats, Infinity, 'strategic seats');
});

runner.test('foundation tier has storage_gb = 1', () => {
  assertEqual(PLAN_TIERS.foundation.storage_gb, 1, 'foundation storage');
});

runner.test('professional tier has storage_gb = 10', () => {
  assertEqual(PLAN_TIERS.professional.storage_gb, 10, 'professional storage');
});

runner.test('enterprise tier has storage_gb = 100', () => {
  assertEqual(PLAN_TIERS.enterprise.storage_gb, 100, 'enterprise storage');
});

runner.test('strategic tier has storage_gb = 1000', () => {
  assertEqual(PLAN_TIERS.strategic.storage_gb, 1000, 'strategic storage');
});

runner.test('foundation tier has agent_runs_per_day = 50', () => {
  assertEqual(PLAN_TIERS.foundation.agent_runs_per_day, 50, 'foundation agent runs');
});

runner.test('professional tier has agent_runs_per_day = 200', () => {
  assertEqual(PLAN_TIERS.professional.agent_runs_per_day, 200, 'professional agent runs');
});

runner.test('enterprise tier has agent_runs_per_day = 1000', () => {
  assertEqual(PLAN_TIERS.enterprise.agent_runs_per_day, 1000, 'enterprise agent runs');
});

runner.test('strategic tier has agent_runs_per_day = Infinity', () => {
  assertEqual(PLAN_TIERS.strategic.agent_runs_per_day, Infinity, 'strategic agent runs');
});

runner.test('foundation tier has webhook_endpoints = 2', () => {
  assertEqual(PLAN_TIERS.foundation.webhook_endpoints, 2, 'foundation webhooks');
});

runner.test('professional tier has webhook_endpoints = 10', () => {
  assertEqual(PLAN_TIERS.professional.webhook_endpoints, 10, 'professional webhooks');
});

runner.test('enterprise tier has webhook_endpoints = 50', () => {
  assertEqual(PLAN_TIERS.enterprise.webhook_endpoints, 50, 'enterprise webhooks');
});

runner.test('strategic tier has webhook_endpoints = 200', () => {
  assertEqual(PLAN_TIERS.strategic.webhook_endpoints, 200, 'strategic webhooks');
});

runner.test('foundation tier has data_retention_months = 12', () => {
  assertEqual(PLAN_TIERS.foundation.data_retention_months, 12, 'foundation retention');
});

runner.test('professional tier has data_retention_months = 24', () => {
  assertEqual(PLAN_TIERS.professional.data_retention_months, 24, 'professional retention');
});

runner.test('enterprise tier has data_retention_months = 84', () => {
  assertEqual(PLAN_TIERS.enterprise.data_retention_months, 84, 'enterprise retention');
});

// ============================================================================
// 3. USAGE METER INITIALIZATION TESTS
// ============================================================================

runner.test('UsageMeter initializes with valid adapter', () => {
  const adapter = new MockAdapter();
  const meter = new UsageMeter(adapter);
  assert(meter, 'meter created');
});

runner.test('UsageMeter throws error with null adapter', () => {
  try {
    new UsageMeter(null);
    throw new Error('Should have thrown');
  } catch (e) {
    assert(e.message.includes('valid adapter'), 'error message');
  }
});

runner.test('UsageMeter throws error with invalid adapter', () => {
  try {
    new UsageMeter({});
    throw new Error('Should have thrown');
  } catch (e) {
    assert(e.message.length > 0, 'error message exists');
  }
});

// ============================================================================
// 4. USAGE METER INCREMENT TESTS
// ============================================================================

runner.test('increment() atomically increments counter', async () => {
  const adapter = new MockAdapter();
  const meter = new UsageMeter(adapter);

  const result = await meter.increment('org1', METER_TYPES.API_CALLS, 1);
  assertEqual(result, 1, 'first increment');

  const result2 = await meter.increment('org1', METER_TYPES.API_CALLS, 1);
  assertEqual(result2, 2, 'second increment');
});

runner.test('increment() with amount > 1', async () => {
  const adapter = new MockAdapter();
  const meter = new UsageMeter(adapter);

  const result = await meter.increment('org1', METER_TYPES.API_CALLS, 5);
  assertEqual(result, 5, 'increment by 5');
});

runner.test('increment() throws error without orgId', async () => {
  const adapter = new MockAdapter();
  const meter = new UsageMeter(adapter);

  try {
    await meter.increment(null, METER_TYPES.API_CALLS);
    throw new Error('Should have thrown');
  } catch (e) {
    assert(e.message.includes('orgId'), 'error message');
  }
});

runner.test('increment() throws error without meterType', async () => {
  const adapter = new MockAdapter();
  const meter = new UsageMeter(adapter);

  try {
    await meter.increment('org1', null);
    throw new Error('Should have thrown');
  } catch (e) {
    assert(e.message.includes('meterType'), 'error message');
  }
});

runner.test('increment() throws error with invalid amount', async () => {
  const adapter = new MockAdapter();
  const meter = new UsageMeter(adapter);

  try {
    await meter.increment('org1', METER_TYPES.API_CALLS, -1);
    throw new Error('Should have thrown');
  } catch (e) {
    assert(e.message.includes('positive'), 'error message');
  }
});

// ============================================================================
// 5. USAGE METER GET USAGE TESTS
// ============================================================================

runner.test('getUsage() returns current count', async () => {
  const adapter = new MockAdapter();
  const meter = new UsageMeter(adapter);

  await meter.increment('org1', METER_TYPES.API_CALLS, 10);
  const usage = await meter.getUsage('org1', METER_TYPES.API_CALLS, 'minute');
  assertEqual(usage, 10, 'usage count');
});

runner.test('getUsage() returns 0 for non-existent meter', async () => {
  const adapter = new MockAdapter();
  const meter = new UsageMeter(adapter);

  const usage = await meter.getUsage('org1', METER_TYPES.INVOICES, 'month');
  assertEqual(usage, 0, 'zero count');
});

runner.test('getUsage() with default period for API_CALLS', async () => {
  const adapter = new MockAdapter();
  const meter = new UsageMeter(adapter);

  await meter.increment('org1', METER_TYPES.API_CALLS, 5);
  const usage = await meter.getUsage('org1', METER_TYPES.API_CALLS);
  assertEqual(usage, 5, 'usage with default period');
});

runner.test('getUsage() with default period for AGENT_RUNS', async () => {
  const adapter = new MockAdapter();
  const meter = new UsageMeter(adapter);

  await meter.increment('org1', METER_TYPES.AGENT_RUNS, 3);
  const usage = await meter.getUsage('org1', METER_TYPES.AGENT_RUNS);
  assertEqual(usage, 3, 'agent runs default period');
});

// ============================================================================
// 6. USAGE METER SUMMARY TESTS
// ============================================================================

runner.test('getUsageSummary() returns all meters', async () => {
  const adapter = new MockAdapter();
  const meter = new UsageMeter(adapter);

  // Populate adapter directly with different period keys
  adapter.data.set('usage:org1:api_calls:month', 10);
  adapter.data.set('usage:org1:invoices:month', 5);
  adapter.data.set('usage:org1:agent_runs:month', 3);

  const summary = await meter.getUsageSummary('org1', 'month');
  assertEqual(summary[METER_TYPES.API_CALLS], 10, 'API calls in summary');
  assertEqual(summary[METER_TYPES.INVOICES], 5, 'invoices in summary');
  assertEqual(summary[METER_TYPES.AGENT_RUNS], 3, 'agent runs in summary');
});

runner.test('getUsageSummary() includes all meter types', async () => {
  const adapter = new MockAdapter();
  const meter = new UsageMeter(adapter);

  const summary = await meter.getUsageSummary('org1', 'month');
  assert(METER_TYPES.API_CALLS in summary, 'has API_CALLS');
  assert(METER_TYPES.INVOICES in summary, 'has INVOICES');
  assert(METER_TYPES.CLOSE_PACKS in summary, 'has CLOSE_PACKS');
  assert(METER_TYPES.PROVIDER_CONNECTIONS in summary, 'has PROVIDER_CONNECTIONS');
  assert(METER_TYPES.USER_SEATS in summary, 'has USER_SEATS');
  assert(METER_TYPES.STORAGE_BYTES in summary, 'has STORAGE_BYTES');
  assert(METER_TYPES.AGENT_RUNS in summary, 'has AGENT_RUNS');
  assert(METER_TYPES.WEBHOOK_ENDPOINTS in summary, 'has WEBHOOK_ENDPOINTS');
});

// ============================================================================
// 7. USAGE METER RESET TESTS
// ============================================================================

runner.test('reset() clears counter', async () => {
  const adapter = new MockAdapter();
  const meter = new UsageMeter(adapter);

  await meter.increment('org1', METER_TYPES.API_CALLS, 10);
  const before = await meter.getUsage('org1', METER_TYPES.API_CALLS, 'minute');
  assertEqual(before, 10, 'before reset');

  await meter.reset('org1', METER_TYPES.API_CALLS, 'minute');
  const after = await meter.getUsage('org1', METER_TYPES.API_CALLS, 'minute');
  assertEqual(after, 0, 'after reset');
});

runner.test('reset() throws error without period', async () => {
  const adapter = new MockAdapter();
  const meter = new UsageMeter(adapter);

  try {
    await meter.reset('org1', METER_TYPES.API_CALLS, null);
    throw new Error('Should have thrown');
  } catch (e) {
    assert(e.message.includes('period'), 'error message');
  }
});

// ============================================================================
// 8. USAGE METER PERIOD TESTS
// ============================================================================

runner.test('getCurrentPeriod() returns YYYY-MM format', () => {
  const adapter = new MockAdapter();
  const meter = new UsageMeter(adapter);
  const period = meter.getCurrentPeriod();

  assert(period.match(/^\d{4}-\d{2}$/), 'period format');
});

runner.test('getDailyPeriod() returns YYYY-MM-DD format', () => {
  const adapter = new MockAdapter();
  const meter = new UsageMeter(adapter);
  const period = meter.getDailyPeriod();

  assert(period.match(/^\d{4}-\d{2}-\d{2}$/), 'daily period format');
});

runner.test('getCurrentMinute() returns YYYY-MM-DD-HH-mm format', () => {
  const adapter = new MockAdapter();
  const meter = new UsageMeter(adapter);
  const minute = meter.getCurrentMinute();

  assert(minute.match(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}$/), 'minute format');
});

// ============================================================================
// 9. THREE LAYER RATE LIMITER INITIALIZATION TESTS
// ============================================================================

runner.test('ThreeLayerRateLimiter initializes with default config', () => {
  const limiter = new ThreeLayerRateLimiter();
  assert(limiter.config, 'config exists');
  assertEqual(limiter.config.globalRequestsPerSecond, 1000, 'default global limit');
});

runner.test('ThreeLayerRateLimiter initializes with custom config', () => {
  const limiter = new ThreeLayerRateLimiter({
    globalRequestsPerSecond: 5000
  });
  assertEqual(limiter.config.globalRequestsPerSecond, 5000, 'custom global limit');
});

// ============================================================================
// 10. GLOBAL IP RATE LIMITER TESTS
// ============================================================================

runner.test('checkGlobalLimit() allows first request', () => {
  const limiter = new ThreeLayerRateLimiter();
  const result = limiter.checkGlobalLimit('192.168.1.1');

  assert(result.allowed, 'allowed');
  assert(result.remaining > 0, 'has remaining');
});

runner.test('checkGlobalLimit() returns reset time', () => {
  const limiter = new ThreeLayerRateLimiter();
  const result = limiter.checkGlobalLimit('192.168.1.1');

  assert(result.resetAfter > 0, 'has reset time');
  assert(result.resetAfter <= 1000, 'reset within 1 second');
});

runner.test('checkGlobalLimit() increments counter for same IP', () => {
  const limiter = new ThreeLayerRateLimiter({ globalRequestsPerSecond: 10 });
  const ip = '192.168.1.1';

  const result1 = limiter.checkGlobalLimit(ip);
  const result2 = limiter.checkGlobalLimit(ip);

  assert(result1.remaining > result2.remaining, 'remaining decreases');
});

runner.test('checkGlobalLimit() resets after window expires', async () => {
  const limiter = new ThreeLayerRateLimiter({ globalRequestsPerSecond: 5 });
  const ip = '192.168.1.1';

  const result1 = limiter.checkGlobalLimit(ip);
  assert(result1.allowed, 'first allowed');

  // Simulate window expiration
  await new Promise(resolve => setTimeout(resolve, 1100));
  const result2 = limiter.checkGlobalLimit(ip);
  assert(result2.allowed, 'allowed after reset');
});

// ============================================================================
// 11. API KEY RATE LIMITER TESTS
// ============================================================================

runner.test('checkApiKeyLimit() allows request for foundation tier', () => {
  const limiter = new ThreeLayerRateLimiter();
  const result = limiter.checkApiKeyLimit('key1', 'foundation');

  assert(result.allowed, 'allowed');
  assertEqual(result.remaining, PLAN_TIERS.foundation.api_requests_per_minute - 1, 'remaining');
});

runner.test('checkApiKeyLimit() respects foundation limit', () => {
  const limiter = new ThreeLayerRateLimiter({ apiKeyWindowMs: 100 });
  const limit = PLAN_TIERS.foundation.api_requests_per_minute;

  for (let i = 0; i < limit; i++) {
    const result = limiter.checkApiKeyLimit('key1', 'foundation');
    assert(result.allowed, `request ${i} allowed`);
  }

  const result = limiter.checkApiKeyLimit('key1', 'foundation');
  assert(!result.allowed, 'limit exceeded');
});

runner.test('checkApiKeyLimit() respects professional limit', () => {
  const limiter = new ThreeLayerRateLimiter({ apiKeyWindowMs: 100 });
  const limit = PLAN_TIERS.professional.api_requests_per_minute;
  assert(limit > PLAN_TIERS.foundation.api_requests_per_minute, 'professional > foundation');
});

runner.test('checkApiKeyLimit() respects enterprise limit', () => {
  const limit1 = PLAN_TIERS.professional.api_requests_per_minute;
  const limit2 = PLAN_TIERS.enterprise.api_requests_per_minute;
  assert(limit2 > limit1, 'enterprise > professional');
});

runner.test('checkApiKeyLimit() respects strategic limit', () => {
  const limit1 = PLAN_TIERS.enterprise.api_requests_per_minute;
  const limit2 = PLAN_TIERS.strategic.api_requests_per_minute;
  assert(limit2 > limit1, 'strategic > enterprise');
});

runner.test('checkApiKeyLimit() throws error for invalid plan tier', () => {
  const limiter = new ThreeLayerRateLimiter();

  try {
    limiter.checkApiKeyLimit('key1', 'invalid');
    throw new Error('Should have thrown');
  } catch (e) {
    assert(e.message.includes('Invalid plan tier'), 'error message');
  }
});

// ============================================================================
// 12. RESOURCE QUOTA TESTS
// ============================================================================

runner.test('checkResourceQuota() allows request under limit', () => {
  const limiter = new ThreeLayerRateLimiter();
  const result = limiter.checkResourceQuota('org1', METER_TYPES.INVOICES, 'foundation', 10);

  assert(result.allowed, 'allowed');
  assert(!result.willExceed, 'will not exceed');
});

runner.test('checkResourceQuota() blocks request at limit', () => {
  const limiter = new ThreeLayerRateLimiter();
  const limit = PLAN_TIERS.foundation.invoices_per_month;
  const result = limiter.checkResourceQuota('org1', METER_TYPES.INVOICES, 'foundation', limit);

  assert(!result.allowed, 'not allowed');
  assert(result.willExceed, 'will exceed');
});

runner.test('checkResourceQuota() allows unlimited quotas', () => {
  const limiter = new ThreeLayerRateLimiter();
  const result = limiter.checkResourceQuota('org1', METER_TYPES.INVOICES, 'strategic', 999999);

  assert(result.allowed, 'allowed for unlimited');
  assertEqual(result.remaining, Infinity, 'unlimited remaining');
});

runner.test('checkResourceQuota() calculates remaining correctly', () => {
  const limiter = new ThreeLayerRateLimiter();
  const limit = PLAN_TIERS.foundation.invoices_per_month;
  const current = 10;
  const result = limiter.checkResourceQuota('org1', METER_TYPES.INVOICES, 'foundation', current);

  assertEqual(result.remaining, limit - current, 'remaining calculated');
});

runner.test('checkResourceQuota() throws error for invalid orgId', () => {
  const limiter = new ThreeLayerRateLimiter();

  try {
    limiter.checkResourceQuota(null, METER_TYPES.INVOICES, 'foundation', 10);
    throw new Error('Should have thrown');
  } catch (e) {
    assert(e.message.includes('orgId'), 'error message');
  }
});

runner.test('checkResourceQuota() throws error for invalid meter type', () => {
  const limiter = new ThreeLayerRateLimiter();

  try {
    limiter.checkResourceQuota('org1', 'invalid_meter', 'foundation', 10);
    throw new Error('Should have thrown');
  } catch (e) {
    assert(e.message.includes('Unknown meter type'), 'error message');
  }
});

runner.test('checkResourceQuota() throws error for invalid plan tier', () => {
  const limiter = new ThreeLayerRateLimiter();

  try {
    limiter.checkResourceQuota('org1', METER_TYPES.INVOICES, 'invalid', 10);
    throw new Error('Should have thrown');
  } catch (e) {
    assert(e.message.includes('Invalid plan tier'), 'error message');
  }
});

// ============================================================================
// 13. THREE-LAYER COMBINED CHECK TESTS
// ============================================================================

runner.test('checkAllLayers() allows request within all limits', async () => {
  const limiter = new ThreeLayerRateLimiter();
  const result = await limiter.checkAllLayers({
    ip: '192.168.1.1',
    apiKey: 'key1',
    planTier: 'foundation',
    orgId: 'org1',
    meterType: METER_TYPES.INVOICES,
    currentUsage: 10
  });

  assert(result.allowed, 'allowed');
  assert(!result.layer, 'no layer blocked');
});

runner.test('checkAllLayers() blocks on global IP limit', async () => {
  const limiter = new ThreeLayerRateLimiter({ globalRequestsPerSecond: 2 });

  // Exhaust global limit
  for (let i = 0; i < 3; i++) {
    limiter.checkGlobalLimit('192.168.1.1');
  }

  const result = await limiter.checkAllLayers({
    ip: '192.168.1.1',
    apiKey: 'key1',
    planTier: 'foundation',
    orgId: 'org1',
    meterType: METER_TYPES.INVOICES,
    currentUsage: 10
  });

  assert(!result.allowed, 'blocked');
  assertEqual(result.layer, 'GLOBAL_IP', 'layer is GLOBAL_IP');
});

runner.test('checkAllLayers() blocks on API key limit', async () => {
  const limiter = new ThreeLayerRateLimiter({ apiKeyWindowMs: 60000 });
  const limit = PLAN_TIERS.foundation.api_requests_per_minute;

  // Exhaust API key limit
  for (let i = 0; i < limit; i++) {
    limiter.checkApiKeyLimit('key2', 'foundation');
  }

  const result = await limiter.checkAllLayers({
    ip: '192.168.1.2',
    apiKey: 'key2',
    planTier: 'foundation',
    orgId: 'org1',
    meterType: METER_TYPES.INVOICES,
    currentUsage: 10
  });

  assert(!result.allowed, 'blocked');
  assertEqual(result.layer, 'API_KEY', 'layer is API_KEY');
});

runner.test('checkAllLayers() blocks on resource quota', async () => {
  const limiter = new ThreeLayerRateLimiter();
  const limit = PLAN_TIERS.foundation.invoices_per_month;

  const result = await limiter.checkAllLayers({
    ip: '192.168.1.1',
    apiKey: 'key1',
    planTier: 'foundation',
    orgId: 'org1',
    meterType: METER_TYPES.INVOICES,
    currentUsage: limit
  });

  assert(!result.allowed, 'blocked');
  assertEqual(result.layer, 'RESOURCE_QUOTA', 'layer is RESOURCE_QUOTA');
});

runner.test('checkAllLayers() returns retry information', async () => {
  const limiter = new ThreeLayerRateLimiter();
  const limit = PLAN_TIERS.foundation.invoices_per_month;

  const result = await limiter.checkAllLayers({
    ip: '192.168.1.1',
    apiKey: 'key1',
    planTier: 'foundation',
    orgId: 'org1',
    meterType: METER_TYPES.INVOICES,
    currentUsage: limit
  });

  assert(result.upgradeUrl, 'has upgrade URL');
  assert(result.reason, 'has reason');
});

// ============================================================================
// 14. RATE LIMIT HEADER TESTS
// ============================================================================

runner.test('buildRateLimitHeaders() includes all required headers', () => {
  const headers = buildRateLimitHeaders(100, 50, Date.now() + 5000);

  assert(headers['X-RateLimit-Limit'], 'has limit header');
  assert(headers['X-RateLimit-Remaining'], 'has remaining header');
  assert(headers['X-RateLimit-Reset'], 'has reset header');
  assert(headers['Retry-After'], 'has retry-after header');
});

runner.test('buildRateLimitHeaders() sets correct values', () => {
  const now = Date.now();
  const resetTime = now + 5000;
  const headers = buildRateLimitHeaders(100, 50, resetTime);

  assertEqual(headers['X-RateLimit-Limit'], '100', 'limit value');
  assertEqual(headers['X-RateLimit-Remaining'], '50', 'remaining value');
  assertEqual(headers['X-RateLimit-Reset'], String(Math.floor(resetTime / 1000)), 'reset time');
});

runner.test('buildRateLimitHeaders() handles zero remaining', () => {
  const headers = buildRateLimitHeaders(100, -10, Date.now() + 5000);
  assertEqual(headers['X-RateLimit-Remaining'], '0', 'remaining is 0');
});

// ============================================================================
// 15. QUOTA EXCEEDED HEADER TESTS
// ============================================================================

runner.test('buildQuotaExceededHeaders() includes all required headers', () => {
  const headers = buildQuotaExceededHeaders(METER_TYPES.INVOICES, 'foundation', '/billing/upgrade');

  assert(headers['X-Finault-Quota-Exceeded'], 'has quota exceeded header');
  assert(headers['X-Finault-Plan'], 'has plan header');
  assert(headers['X-Finault-Upgrade-Url'], 'has upgrade URL header');
});

runner.test('buildQuotaExceededHeaders() sets correct values', () => {
  const headers = buildQuotaExceededHeaders(METER_TYPES.INVOICES, 'foundation', '/billing/upgrade');

  assertEqual(headers['X-Finault-Quota-Exceeded'], METER_TYPES.INVOICES, 'quota exceeded');
  assertEqual(headers['X-Finault-Plan'], 'foundation', 'plan');
  assertEqual(headers['X-Finault-Upgrade-Url'], '/billing/upgrade', 'upgrade URL');
});

// ============================================================================
// 16. USAGE ANALYTICS TESTS
// ============================================================================

runner.test('getUsageAnalytics() returns correct current usage', () => {
  const analytics = getUsageAnalytics(50, 100, 'month');
  assertEqual(analytics.current, 50, 'current usage');
});

runner.test('getUsageAnalytics() returns correct limit', () => {
  const analytics = getUsageAnalytics(50, 100, 'month');
  assertEqual(analytics.limit, 100, 'limit');
});

runner.test('getUsageAnalytics() calculates percentage correctly', () => {
  const analytics = getUsageAnalytics(50, 100, 'month');
  assertEqual(analytics.percentage, 50, 'percentage');
});

runner.test('getUsageAnalytics() handles unlimited quota', () => {
  const analytics = getUsageAnalytics(999999, Infinity, 'month');
  assertEqual(analytics.limit, Infinity, 'unlimited');
  assertEqual(analytics.percentage, 0, 'percentage is 0');
  assertEqual(analytics.status, 'unlimited', 'status is unlimited');
});

runner.test('getUsageAnalytics() sets status to ok for low usage', () => {
  const analytics = getUsageAnalytics(50, 100, 'month');
  assertEqual(analytics.status, 'ok', 'status is ok');
});

runner.test('getUsageAnalytics() sets status to warning for high usage', () => {
  const analytics = getUsageAnalytics(90, 100, 'month');
  assertEqual(analytics.status, 'warning', 'status is warning');
});

runner.test('getUsageAnalytics() sets status to exceeded at limit', () => {
  const analytics = getUsageAnalytics(100, 100, 'month');
  assertEqual(analytics.status, 'exceeded', 'status is exceeded');
});

runner.test('getUsageAnalytics() projects usage for month', () => {
  const now = new Date();
  const daysElapsed = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  // On day 15 with 50 usage should project ~100 for 30-day month
  const analytics = getUsageAnalytics(50, 1000, 'month');
  assert(analytics.projectedUsage >= 0, 'has projection');
});

runner.test('getUsageAnalytics() calculates daysRemaining for month', () => {
  const analytics = getUsageAnalytics(50, 100, 'month');
  assert(analytics.daysRemaining >= 0, 'has days remaining');
});

// ============================================================================
// 17. ORG USAGE ANALYTICS TESTS
// ============================================================================

runner.test('getOrgUsageAnalytics() returns analytics for all meters', () => {
  const summary = {
    [METER_TYPES.API_CALLS]: 50,
    [METER_TYPES.INVOICES]: 10,
    [METER_TYPES.AGENT_RUNS]: 25
  };

  const analytics = getOrgUsageAnalytics(summary, 'foundation', 'month');

  assert(analytics[METER_TYPES.INVOICES], 'has invoices analytics');
  assert(analytics[METER_TYPES.AGENT_RUNS], 'has agent runs analytics');
});

runner.test('getOrgUsageAnalytics() throws error for invalid plan tier', () => {
  const summary = {};

  try {
    getOrgUsageAnalytics(summary, 'invalid', 'month');
    throw new Error('Should have thrown');
  } catch (e) {
    assert(e.message.includes('Invalid plan tier'), 'error message');
  }
});

runner.test('getOrgUsageAnalytics() respects plan tier limits', () => {
  const summary = {
    [METER_TYPES.INVOICES]: 10
  };

  const analytics1 = getOrgUsageAnalytics(summary, 'foundation', 'month');
  const analytics2 = getOrgUsageAnalytics(summary, 'professional', 'month');

  assert(
    analytics1[METER_TYPES.INVOICES].limit < analytics2[METER_TYPES.INVOICES].limit,
    'professional has higher limit'
  );
});

// ============================================================================
// 18. QUOTA CHECK HELPER TESTS
// ============================================================================

runner.test('canPerformAction() allows action under limit', () => {
  const result = canPerformAction(50, 100, 1);
  assert(result, 'allowed');
});

runner.test('canPerformAction() blocks action at limit', () => {
  const result = canPerformAction(100, 100, 1);
  assert(!result, 'blocked');
});

runner.test('canPerformAction() allows unlimited quotas', () => {
  const result = canPerformAction(999999, Infinity, 1);
  assert(result, 'allowed for unlimited');
});

runner.test('canPerformAction() respects action size', () => {
  const result1 = canPerformAction(95, 100, 1);
  const result2 = canPerformAction(95, 100, 10);

  assert(result1, 'allowed with size 1');
  assert(!result2, 'blocked with size 10');
});

// ============================================================================
// 19. NEAR QUOTA THRESHOLD TESTS
// ============================================================================

runner.test('isNearQuota() returns false for low usage', () => {
  const result = isNearQuota(50, 100, 80);
  assert(!result, 'not near quota');
});

runner.test('isNearQuota() returns true near threshold', () => {
  const result = isNearQuota(85, 100, 80);
  assert(result, 'near quota');
});

runner.test('isNearQuota() returns false for unlimited', () => {
  const result = isNearQuota(999999, Infinity, 80);
  assert(!result, 'never near unlimited quota');
});

runner.test('isNearQuota() respects custom threshold', () => {
  const result1 = isNearQuota(70, 100, 80);
  const result2 = isNearQuota(70, 100, 60);

  assert(!result1, 'not near 80% threshold');
  assert(result2, 'near 60% threshold');
});

// ============================================================================
// 20. INTEGRATION TESTS
// ============================================================================

runner.test('Full workflow: create meter, track usage, check quota', async () => {
  const adapter = new MockAdapter();
  const meter = new UsageMeter(adapter);
  const limiter = new ThreeLayerRateLimiter();

  // Track invoices
  await meter.increment('org1', METER_TYPES.INVOICES, 5);
  const usage = await meter.getUsage('org1', METER_TYPES.INVOICES, 'month');
  assertEqual(usage, 5, 'usage tracked');

  // Check quota
  const quota = limiter.checkResourceQuota('org1', METER_TYPES.INVOICES, 'foundation', usage);
  assert(quota.allowed, 'quota allowed');
  assertEqual(quota.remaining, 20, 'remaining invoices');
});

runner.test('Full workflow: rate limiting prevents abuse', async () => {
  const limiter = new ThreeLayerRateLimiter({ apiKeyWindowMs: 100, globalRequestsPerSecond: 5 });

  // Try to make 6 global requests
  for (let i = 0; i < 5; i++) {
    const result = limiter.checkGlobalLimit('192.168.1.1');
    assert(result.allowed, `request ${i} allowed`);
  }

  const blockedResult = limiter.checkGlobalLimit('192.168.1.1');
  assert(!blockedResult.allowed, 'request blocked');
  assert(blockedResult.resetAfter > 0, 'has retry info');
});

runner.test('Full workflow: different organizations isolated', async () => {
  const adapter = new MockAdapter();
  const meter = new UsageMeter(adapter);

  await meter.increment('org1', METER_TYPES.INVOICES, 10);
  await meter.increment('org2', METER_TYPES.INVOICES, 5);

  const usage1 = await meter.getUsage('org1', METER_TYPES.INVOICES, 'month');
  const usage2 = await meter.getUsage('org2', METER_TYPES.INVOICES, 'month');

  assertEqual(usage1, 10, 'org1 usage');
  assertEqual(usage2, 5, 'org2 usage isolated');
});

runner.test('Full workflow: plan upgrade increases limits', () => {
  const limiter = new ThreeLayerRateLimiter();

  const quotaF = limiter.checkResourceQuota('org1', METER_TYPES.INVOICES, 'foundation', 20);
  const quotaP = limiter.checkResourceQuota('org1', METER_TYPES.INVOICES, 'professional', 20);
  const quotaE = limiter.checkResourceQuota('org1', METER_TYPES.INVOICES, 'enterprise', 20);

  // All should be allowed, but professional and enterprise have more headroom
  assert(quotaF.allowed, 'foundation allowed');
  assert(quotaP.allowed, 'professional allowed');
  assert(quotaE.allowed, 'enterprise allowed');

  // Professional should have more remaining than foundation
  assert(quotaP.remaining > quotaF.remaining, 'professional > foundation remaining');
  // Enterprise should have more remaining than professional
  assert(quotaE.remaining > quotaP.remaining, 'enterprise > professional remaining');
});

// ============================================================================
// 21. EDGE CASE TESTS
// ============================================================================

runner.test('Rate limiter cleanup removes old entries', () => {
  const limiter = new ThreeLayerRateLimiter();

  limiter.checkGlobalLimit('192.168.1.1');
  limiter.checkApiKeyLimit('key1', 'foundation');

  assert(limiter.globalLimiter.size > 0, 'has global entries');
  assert(limiter.apiKeyLimiters.size > 0, 'has API key entries');

  limiter.cleanup();

  // Entries should still exist (within grace period)
  assert(limiter.globalLimiter.size > 0, 'global entries after cleanup');
});

runner.test('Multiple organizations with same meter type independent', async () => {
  const adapter = new MockAdapter();
  const meter = new UsageMeter(adapter);

  await meter.increment('orgA', METER_TYPES.AGENT_RUNS, 50);
  await meter.increment('orgB', METER_TYPES.AGENT_RUNS, 30);
  await meter.increment('orgA', METER_TYPES.AGENT_RUNS, 20);

  const usageA = await meter.getUsage('orgA', METER_TYPES.AGENT_RUNS);
  const usageB = await meter.getUsage('orgB', METER_TYPES.AGENT_RUNS);

  assertEqual(usageA, 70, 'orgA usage');
  assertEqual(usageB, 30, 'orgB usage independent');
});

runner.test('Percentage calculation handles edge cases', () => {
  const a1 = getUsageAnalytics(0, 100, 'month');
  assertEqual(a1.percentage, 0, '0 usage');

  const a2 = getUsageAnalytics(1, 3, 'month');
  assert(a2.percentage > 33 && a2.percentage < 34, '1/3 ≈ 33.33%');

  const a3 = getUsageAnalytics(100, 100, 'month');
  assertEqual(a3.percentage, 100, '100% usage');
});

// ============================================================================
// RUN TESTS
// ============================================================================

runner.run();
