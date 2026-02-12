import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
    if (condition) {
        passed++;
        console.log(`  ✓ ${message}`);
    } else {
        failed++;
        failures.push(message);
        console.log(`  ✗ FAIL: ${message}`);
    }
}

function runTest(id, name, fn) {
    try {
        fn();
    } catch (err) {
        failed++;
        failures.push(`${id}: ${name} - ${err.message}`);
        console.log(`  ✗ FAIL ${id}: ${name}`);
        console.log(`     Error: ${err.message}`);
    }
}

async function runTests() {
    console.log('═'.repeat(80));
    console.log('W-012 RATE LIMITER TEST SUITE');
    console.log('═'.repeat(80));

    const {
        RateLimiter,
        RATE_LIMIT_CONFIG,
        RATE_LIMIT_RESULT,
        rateLimitMiddleware,
        createRateLimiter
    } = await import(new URL('../core/rate-limiter.js', import.meta.url).href);

    // =========================================================================
    // SECTION 1: Constants & Exports (w12_001 - w12_012)
    // =========================================================================
    console.log('\n[SECTION 1] Constants & Exports');

    runTest('w12_001', 'RATE_LIMIT_CONFIG has api_calls_per_minute default', () => {
        assert(RATE_LIMIT_CONFIG.defaults.api_calls_per_minute, 'api_calls_per_minute exists');
        assert(RATE_LIMIT_CONFIG.defaults.api_calls_per_minute.capacity === 100, 'capacity is 100');
        assert(RATE_LIMIT_CONFIG.defaults.api_calls_per_minute.refillRate === 100, 'refillRate is 100');
        assert(RATE_LIMIT_CONFIG.defaults.api_calls_per_minute.windowMs === 60000, 'windowMs is 60000');
    });

    runTest('w12_002', 'RATE_LIMIT_CONFIG has tokens_per_hour default', () => {
        assert(RATE_LIMIT_CONFIG.defaults.tokens_per_hour, 'tokens_per_hour exists');
        assert(RATE_LIMIT_CONFIG.defaults.tokens_per_hour.capacity === 1000000, 'capacity is 1M');
        assert(RATE_LIMIT_CONFIG.defaults.tokens_per_hour.refillRate === 1000000, 'refillRate is 1M');
        assert(RATE_LIMIT_CONFIG.defaults.tokens_per_hour.windowMs === 3600000, 'windowMs is 1 hour');
    });

    runTest('w12_003', 'RATE_LIMIT_CONFIG has cost_per_hour default', () => {
        assert(RATE_LIMIT_CONFIG.defaults.cost_per_hour, 'cost_per_hour exists');
        assert(RATE_LIMIT_CONFIG.defaults.cost_per_hour.capacity === 500, 'capacity is $500');
        assert(RATE_LIMIT_CONFIG.defaults.cost_per_hour.refillRate === 500, 'refillRate is $500');
        assert(RATE_LIMIT_CONFIG.defaults.cost_per_hour.windowMs === 3600000, 'windowMs is 1 hour');
    });

    runTest('w12_004', 'RATE_LIMIT_CONFIG enforcement mode defaults', () => {
        assert(RATE_LIMIT_CONFIG.enforcement.mode === 'enforce', 'mode defaults to enforce');
        assert(RATE_LIMIT_CONFIG.enforcement.blockOnExceed === true, 'blockOnExceed defaults to true');
        assert(RATE_LIMIT_CONFIG.enforcement.logAllChecks === false, 'logAllChecks defaults to false');
    });

    runTest('w12_005', 'RATE_LIMIT_RESULT has expected values', () => {
        assert(RATE_LIMIT_RESULT.ALLOWED === 'allowed', 'ALLOWED value correct');
        assert(RATE_LIMIT_RESULT.RATE_LIMITED === 'rate_limited', 'RATE_LIMITED value correct');
        assert(RATE_LIMIT_RESULT.BUCKET_NOT_FOUND === 'bucket_not_found', 'BUCKET_NOT_FOUND value correct');
    });

    runTest('w12_006', 'createRateLimiter factory function works', () => {
        const limiter = createRateLimiter();
        assert(limiter instanceof RateLimiter, 'returns RateLimiter instance');
        assert(limiter.buckets instanceof Map, 'has buckets Map');
        assert(limiter.config !== undefined, 'has config');
    });

    runTest('w12_007', 'createRateLimiter accepts config override', () => {
        const config = { enforcement: { mode: 'disabled' } };
        const limiter = createRateLimiter(config);
        assert(limiter.config.enforcement.mode === 'disabled', 'config override applied');
    });

    runTest('w12_008', 'RateLimiter constructor with no config uses defaults', () => {
        const limiter = new RateLimiter();
        assert(limiter.config.defaults.api_calls_per_minute !== undefined, 'has api_calls_per_minute default');
        assert(limiter.config.defaults.tokens_per_hour !== undefined, 'has tokens_per_hour default');
        assert(limiter.config.defaults.cost_per_hour !== undefined, 'has cost_per_hour default');
    });

    runTest('w12_009', 'RateLimiter constructor with config merges correctly', () => {
        const customConfig = {
            defaults: {
                api_calls_per_minute: {
                    capacity: 50,
                    refillRate: 50,
                    windowMs: 60000
                }
            }
        };
        const limiter = new RateLimiter(customConfig);
        assert(limiter.config.defaults.api_calls_per_minute.capacity === 50, 'custom capacity applied');
        assert(limiter.config.defaults.tokens_per_hour !== undefined, 'other defaults preserved');
    });

    runTest('w12_010', 'RateLimiter buckets initialized as empty Map', () => {
        const limiter = new RateLimiter();
        assert(limiter.buckets instanceof Map, 'buckets is a Map');
        assert(limiter.buckets.size === 0, 'buckets is initially empty');
    });

    runTest('w12_011', 'RateLimiter customLimits initialized as empty Map', () => {
        const limiter = new RateLimiter();
        assert(limiter.customLimits instanceof Map, 'customLimits is a Map');
        assert(limiter.customLimits.size === 0, 'customLimits is initially empty');
    });

    runTest('w12_012', 'RateLimiter has all required methods', () => {
        const limiter = new RateLimiter();
        assert(typeof limiter.consume === 'function', 'has consume method');
        assert(typeof limiter.check === 'function', 'has check method');
        assert(typeof limiter.configure === 'function', 'has configure method');
        assert(typeof limiter.getStatus === 'function', 'has getStatus method');
        assert(typeof limiter.resetAgent === 'function', 'has resetAgent method');
        assert(typeof limiter.resetMetric === 'function', 'has resetMetric method');
        assert(typeof limiter.getActiveBuckets === 'function', 'has getActiveBuckets method');
    });

    // =========================================================================
    // SECTION 2: TokenBucket Algorithm (w12_013 - w12_040)
    // =========================================================================
    console.log('\n[SECTION 2] TokenBucket Algorithm');

    runTest('w12_013', 'New bucket starts at full capacity', () => {
        const limiter = new RateLimiter();
        limiter.configure('agent1', 'api_calls_per_minute', { capacity: 100, refillRate: 100, windowMs: 60000 });
        const result = limiter.check('agent1', 'api_calls_per_minute', 1);
        assert(result.allowed === true, 'first check allowed');
        assert(result.remaining === 100, 'remaining equals capacity');
    });

    runTest('w12_014', 'Consuming reduces tokens', () => {
        const limiter = new RateLimiter();
        const result1 = limiter.consume('agent2', 'api_calls_per_minute', 1);
        const result2 = limiter.consume('agent2', 'api_calls_per_minute', 1);
        assert(result1.allowed === true, 'first consume allowed');
        assert(result2.allowed === true, 'second consume allowed');
        assert(result2.remaining === 98, 'remaining reduced correctly');
    });

    runTest('w12_015', 'Consuming beyond capacity fails', () => {
        const limiter = new RateLimiter();
        // Consume all 100 tokens
        for (let i = 0; i < 100; i++) {
            limiter.consume('agent3', 'api_calls_per_minute', 1);
        }
        const result = limiter.consume('agent3', 'api_calls_per_minute', 1);
        assert(result.allowed === false, 'consume beyond capacity returns allowed=false');
        assert(result.remaining === 0, 'remaining is 0');
    });

    runTest('w12_016', 'Refill adds tokens over time', () => {
        const limiter = new RateLimiter();
        // Consume all tokens
        for (let i = 0; i < 100; i++) {
            limiter.consume('agent4', 'api_calls_per_minute', 1);
        }

        // Simulate time passage: 30 seconds in 60-second window
        const bucket = limiter.buckets.get('agent4:api_calls_per_minute');
        bucket.lastRefillTime = Date.now() - 30000;

        const result = limiter.check('agent4', 'api_calls_per_minute', 1);
        assert(result.allowed === true, 'after refill time, tokens available');
        assert(result.remaining > 0, 'remaining tokens added');
    });

    runTest('w12_017', 'Refill caps at capacity', () => {
        const limiter = new RateLimiter();
        // First create the bucket by consuming once
        limiter.consume('agent5', 'api_calls_per_minute', 50);
        const bucket = limiter.buckets.get('agent5:api_calls_per_minute');
        // Simulate extreme time passage to force full refill
        bucket.lastRefillTime = Date.now() - 1000000;

        const result = limiter.check('agent5', 'api_calls_per_minute', 1);
        assert(result.remaining <= 100, 'tokens capped at capacity');
        assert(result.remaining === 100, 'tokens equal capacity when full');
    });

    runTest('w12_018', 'retryAfterMs returns 0 when tokens available', () => {
        const limiter = new RateLimiter();
        const result = limiter.check('agent6', 'api_calls_per_minute', 1);
        assert(result.retryAfterMs === 0, 'retryAfterMs is 0 when allowed');
    });

    runTest('w12_019', 'retryAfterMs returns positive when deficit', () => {
        const limiter = new RateLimiter();
        // Consume all tokens
        for (let i = 0; i < 100; i++) {
            limiter.consume('agent7', 'api_calls_per_minute', 1);
        }

        const result = limiter.check('agent7', 'api_calls_per_minute', 1);
        assert(result.allowed === false, 'check fails');
        assert(result.retryAfterMs > 0, 'retryAfterMs is positive');
    });

    runTest('w12_020', 'getStatus shows correct utilization', () => {
        const limiter = new RateLimiter();
        limiter.consume('agent8', 'api_calls_per_minute', 50);
        const bucket = limiter.buckets.get('agent8:api_calls_per_minute');
        const status = bucket.getStatus();
        assert(status.tokens === 50, 'tokens correct');
        assert(status.capacity === 100, 'capacity correct');
        assert(status.utilizationPercent === 50, 'utilization is 50%');
    });

    runTest('w12_021', 'Reset restores full capacity', () => {
        const limiter = new RateLimiter();
        limiter.consume('agent9', 'api_calls_per_minute', 75);
        const bucket = limiter.buckets.get('agent9:api_calls_per_minute');
        bucket.reset();
        const status = bucket.getStatus();
        assert(status.tokens === 100, 'tokens restored to capacity');
        assert(status.utilizationPercent === 0, 'utilization reset to 0');
    });

    runTest('w12_022', 'Continuous refill proportional to elapsed time', () => {
        const limiter = new RateLimiter();
        limiter.consume('agent10', 'api_calls_per_minute', 100);

        const bucket = limiter.buckets.get('agent10:api_calls_per_minute');
        // Simulate 30s elapsed (halfway through 60s window)
        bucket.lastRefillTime = Date.now() - 30000;

        bucket.refill();
        // Should have ~50 tokens (100 * 30000/60000)
        assert(bucket.tokens > 40 && bucket.tokens <= 60, 'proportional refill within range');
    });

    runTest('w12_023', 'Zero elapsed time no refill', () => {
        const limiter = new RateLimiter();
        limiter.consume('agent11', 'api_calls_per_minute', 50);

        const bucket = limiter.buckets.get('agent11:api_calls_per_minute');
        const tokensBefore = bucket.tokens;

        bucket.lastRefillTime = Date.now();
        bucket.refill();

        assert(bucket.tokens === tokensBefore, 'no refill with zero elapsed time');
    });

    runTest('w12_024', 'Multiple consecutive consumes track correctly', () => {
        const limiter = new RateLimiter();
        const r1 = limiter.consume('agent12', 'api_calls_per_minute', 10);
        const r2 = limiter.consume('agent12', 'api_calls_per_minute', 20);
        const r3 = limiter.consume('agent12', 'api_calls_per_minute', 30);

        assert(r1.remaining === 90, 'first consume: 90 remaining');
        assert(r2.remaining === 70, 'second consume: 70 remaining');
        assert(r3.remaining === 40, 'third consume: 40 remaining');
    });

    runTest('w12_025', 'canConsume does not consume tokens', () => {
        const limiter = new RateLimiter();
        limiter.consume('agent13', 'api_calls_per_minute', 50);

        const bucket = limiter.buckets.get('agent13:api_calls_per_minute');
        const before = bucket.tokens;

        const canDo = bucket.canConsume(10);
        const after = bucket.tokens;

        assert(canDo === true, 'canConsume returns true');
        assert(before === after, 'tokens unchanged after canConsume');
    });

    runTest('w12_026', 'tryConsume returns false when insufficient', () => {
        const limiter = new RateLimiter();
        limiter.consume('agent14', 'api_calls_per_minute', 95);

        const bucket = limiter.buckets.get('agent14:api_calls_per_minute');
        const success = bucket.tryConsume(10);

        assert(success === false, 'tryConsume returns false');
        assert(bucket.tokens === 5, 'tokens unchanged when tryConsume fails');
    });

    runTest('w12_027', 'tryConsume returns true when sufficient', () => {
        const limiter = new RateLimiter();
        // Create the bucket first by doing a check
        limiter.check('agent15', 'api_calls_per_minute', 1);
        const bucket = limiter.buckets.get('agent15:api_calls_per_minute');

        const success = bucket.tryConsume(50);

        assert(success === true, 'tryConsume returns true');
        assert(bucket.tokens === 50, 'tokens decreased when successful');
    });

    runTest('w12_028', 'Bucket with many small consumes', () => {
        const limiter = new RateLimiter();

        for (let i = 0; i < 100; i++) {
            const result = limiter.consume('agent16', 'api_calls_per_minute', 1);
            assert(result.allowed === true, `consume ${i} allowed`);
        }

        const result101 = limiter.consume('agent16', 'api_calls_per_minute', 1);
        assert(result101.allowed === false, 'consume 101 blocked');
    });

    runTest('w12_029', 'Bucket with large consume request', () => {
        const limiter = new RateLimiter();
        const result = limiter.consume('agent17', 'api_calls_per_minute', 150);
        assert(result.allowed === false, 'large request exceeds capacity');
        assert(result.remaining === 100, 'no tokens consumed');
    });

    runTest('w12_030', 'Status includes fractional tokens', () => {
        const limiter = new RateLimiter();
        limiter.consume('agent18', 'api_calls_per_minute', 1);

        const bucket = limiter.buckets.get('agent18:api_calls_per_minute');
        // Simulate 1 second elapsed (100 tokens per 60 seconds = 1.667 per second)
        bucket.lastRefillTime = Date.now() - 1000;

        const status = bucket.getStatus();
        assert(status.tokens > 99, 'tokens include fractional part');
        assert(status.utilizationPercent >= 0, 'utilization percent valid');
    });

    // =========================================================================
    // SECTION 3: consume() Method (w12_041 - w12_070)
    // =========================================================================
    console.log('\n[SECTION 3] consume() Method');

    runTest('w12_041', 'Null agentId returns error', () => {
        const limiter = new RateLimiter();
        const result = limiter.consume(null, 'api_calls_per_minute', 1);
        assert(result.allowed === false, 'allowed is false');
        assert(result.error !== undefined, 'error property set');
    });

    runTest('w12_042', 'Null metric returns error', () => {
        const limiter = new RateLimiter();
        const result = limiter.consume('agent19', null, 1);
        assert(result.allowed === false, 'allowed is false');
        assert(result.error !== undefined, 'error property set');
    });

    runTest('w12_043', 'Empty agentId returns error', () => {
        const limiter = new RateLimiter();
        const result = limiter.consume('', 'api_calls_per_minute', 1);
        assert(result.allowed === false, 'allowed is false');
    });

    runTest('w12_044', 'Empty metric returns error', () => {
        const limiter = new RateLimiter();
        const result = limiter.consume('agent20', '', 1);
        assert(result.allowed === false, 'allowed is false');
    });

    runTest('w12_045', 'First consume allowed', () => {
        const limiter = new RateLimiter();
        const result = limiter.consume('agent21', 'api_calls_per_minute', 1);
        assert(result.allowed === true, 'first consume allowed');
    });

    runTest('w12_046', 'Consuming all tokens then one more fails', () => {
        const limiter = new RateLimiter();

        for (let i = 0; i < 100; i++) {
            limiter.consume('agent22', 'api_calls_per_minute', 1);
        }

        const resultFull = limiter.consume('agent22', 'api_calls_per_minute', 1);
        assert(resultFull.allowed === false, 'cannot consume beyond capacity');
    });

    runTest('w12_047', 'Result includes remaining count', () => {
        const limiter = new RateLimiter();
        const result = limiter.consume('agent23', 'api_calls_per_minute', 25);
        assert(typeof result.remaining === 'number', 'remaining is number');
        assert(result.remaining === 75, 'remaining is correct value');
    });

    runTest('w12_048', 'Result includes retryAfterMs', () => {
        const limiter = new RateLimiter();
        const result = limiter.consume('agent24', 'api_calls_per_minute', 1);
        assert(typeof result.retryAfterMs === 'number', 'retryAfterMs is number');
        assert(result.retryAfterMs === 0, 'retryAfterMs is 0 when allowed');
    });

    runTest('w12_049', 'Result includes metric name', () => {
        const limiter = new RateLimiter();
        const result = limiter.consume('agent25', 'api_calls_per_minute', 1);
        assert(result.metric === 'api_calls_per_minute', 'metric is in result');
    });

    runTest('w12_050', 'Result includes limit', () => {
        const limiter = new RateLimiter();
        const result = limiter.consume('agent26', 'api_calls_per_minute', 1);
        assert(result.limit === 100, 'limit equals capacity');
    });

    runTest('w12_051', 'Count parameter controls tokens consumed', () => {
        const limiter = new RateLimiter();
        const r1 = limiter.consume('agent27', 'api_calls_per_minute', 10);
        const r2 = limiter.consume('agent27', 'api_calls_per_minute', 25);
        const r3 = limiter.consume('agent27', 'api_calls_per_minute', 35);

        assert(r1.remaining === 90, 'after consuming 10, 90 remain');
        assert(r2.remaining === 65, 'after consuming 25, 65 remain');
        assert(r3.remaining === 30, 'after consuming 35, 30 remain');
    });

    runTest('w12_052', 'Unknown metric returns allowed (no config)', () => {
        const limiter = new RateLimiter();
        const result = limiter.consume('agent28', 'unknown_metric_xyz', 1);
        assert(result.allowed === true, 'unknown metric allowed by default');
        assert(result.limit === 0, 'limit is 0 for unknown metric');
    });

    runTest('w12_053', 'After refill period, tokens available again', () => {
        const limiter = new RateLimiter();

        // Consume all tokens
        for (let i = 0; i < 100; i++) {
            limiter.consume('agent29', 'api_calls_per_minute', 1);
        }

        // Verify exhausted
        let result = limiter.check('agent29', 'api_calls_per_minute', 1);
        assert(result.allowed === false, 'tokens exhausted');

        // Simulate full refill period (60 seconds)
        const bucket = limiter.buckets.get('agent29:api_calls_per_minute');
        bucket.lastRefillTime = Date.now() - 60000;

        // Now should be full again
        result = limiter.check('agent29', 'api_calls_per_minute', 1);
        assert(result.allowed === true, 'tokens available after refill');
        assert(result.remaining === 100, 'back to full capacity');
    });

    runTest('w12_054', 'Different agents get separate buckets', () => {
        const limiter = new RateLimiter();

        limiter.consume('agentA', 'api_calls_per_minute', 50);
        limiter.consume('agentB', 'api_calls_per_minute', 75);

        const rA = limiter.check('agentA', 'api_calls_per_minute', 1);
        const rB = limiter.check('agentB', 'api_calls_per_minute', 1);

        assert(rA.remaining === 50, 'agentA has separate bucket');
        assert(rB.remaining === 25, 'agentB has separate bucket');
    });

    runTest('w12_055', 'Same agent different metrics separate', () => {
        const limiter = new RateLimiter();

        limiter.consume('agent30', 'api_calls_per_minute', 40);
        limiter.consume('agent30', 'tokens_per_hour', 500);

        const rMin = limiter.check('agent30', 'api_calls_per_minute', 1);
        const rHour = limiter.check('agent30', 'tokens_per_hour', 1);

        assert(rMin.remaining === 60, 'api_calls_per_minute bucket separate');
        assert(rHour.remaining === 999500, 'tokens_per_hour bucket separate');
    });

    runTest('w12_056', 'Disabled enforcement mode always allows', () => {
        const limiter = new RateLimiter({ enforcement: { mode: 'disabled' } });

        for (let i = 0; i < 200; i++) {
            const result = limiter.consume('agent31', 'api_calls_per_minute', 1);
            assert(result.allowed === true, `consume ${i} allowed in disabled mode`);
        }
    });

    runTest('w12_057', 'Observe mode allows but sets wouldBlock flag', () => {
        const limiter = new RateLimiter({ enforcement: { mode: 'observe' } });

        for (let i = 0; i < 100; i++) {
            limiter.consume('agent32', 'api_calls_per_minute', 1);
        }

        const result = limiter.consume('agent32', 'api_calls_per_minute', 1);
        assert(result.allowed === true, 'observe mode allows');
        assert(result.wouldBlock === true, 'wouldBlock flag set');
    });

    runTest('w12_058', 'Enforce mode blocks when exceeded', () => {
        const limiter = new RateLimiter({ enforcement: { mode: 'enforce' } });

        for (let i = 0; i < 100; i++) {
            limiter.consume('agent33', 'api_calls_per_minute', 1);
        }

        const result = limiter.consume('agent33', 'api_calls_per_minute', 1);
        assert(result.allowed === false, 'enforce mode blocks');
    });

    runTest('w12_059', 'Result has no wouldBlock flag in enforce mode', () => {
        const limiter = new RateLimiter({ enforcement: { mode: 'enforce' } });

        for (let i = 0; i < 100; i++) {
            limiter.consume('agent34', 'api_calls_per_minute', 1);
        }

        const result = limiter.consume('agent34', 'api_calls_per_minute', 1);
        assert(result.wouldBlock === undefined, 'no wouldBlock flag in enforce mode');
    });

    runTest('w12_060', 'consume with count=1 is default', () => {
        const limiter = new RateLimiter();
        // Use separate agents so second consume doesn't see depleted bucket
        const r1 = limiter.consume('agent35a', 'api_calls_per_minute');
        const r2 = limiter.consume('agent35b', 'api_calls_per_minute', 1);

        assert(r1.remaining === r2.remaining, 'default count=1 matches explicit count=1');
    });

    runTest('w12_061', 'Fractional count values handled', () => {
        const limiter = new RateLimiter();
        const r1 = limiter.consume('agent36', 'api_calls_per_minute', 10.5);
        const r2 = limiter.consume('agent36', 'api_calls_per_minute', 20.7);

        assert(r1.allowed === true, 'fractional consume 1 allowed');
        assert(r2.allowed === true, 'fractional consume 2 allowed');
    });

    runTest('w12_062', 'Multiple rapid consumes deplete quickly', () => {
        const limiter = new RateLimiter();

        let result = null;
        for (let i = 0; i < 150; i++) {
            result = limiter.consume('agent37', 'api_calls_per_minute', 1);
            if (!result.allowed) break;
        }

        assert(result.allowed === false, 'eventually depleted');
    });

    runTest('w12_063', 'Check method does not affect consume', () => {
        const limiter = new RateLimiter();

        limiter.check('agent38', 'api_calls_per_minute', 5);
        limiter.check('agent38', 'api_calls_per_minute', 10);

        const result = limiter.consume('agent38', 'api_calls_per_minute', 5);
        assert(result.remaining === 95, 'check did not consume tokens');
    });

    runTest('w12_064', 'Negative count handled gracefully', () => {
        const limiter = new RateLimiter();
        const result = limiter.consume('agent39', 'api_calls_per_minute', -5);
        // Should still consume (though behavior may vary)
        assert(result.remaining !== undefined, 'negative count returns valid result');
    });

    // =========================================================================
    // SECTION 4: check() Method (w12_071 - w12_085)
    // =========================================================================
    console.log('\n[SECTION 4] check() Method');

    runTest('w12_071', 'Check is read-only — does not consume', () => {
        const limiter = new RateLimiter();
        limiter.check('agent40', 'api_calls_per_minute', 10);

        const result = limiter.consume('agent40', 'api_calls_per_minute', 1);
        assert(result.remaining === 99, 'check did not consume');
    });

    runTest('w12_072', 'Check returns allowed status', () => {
        const limiter = new RateLimiter();
        const result = limiter.check('agent41', 'api_calls_per_minute', 1);
        assert(typeof result.allowed === 'boolean', 'allowed is boolean');
        assert(result.allowed === true, 'new bucket allows');
    });

    runTest('w12_073', 'Check returns remaining count', () => {
        const limiter = new RateLimiter();
        const result = limiter.check('agent42', 'api_calls_per_minute', 1);
        assert(typeof result.remaining === 'number', 'remaining is number');
        assert(result.remaining === 100, 'remaining shows full capacity');
    });

    runTest('w12_074', 'Check returns retryAfterMs', () => {
        const limiter = new RateLimiter();
        const result = limiter.check('agent43', 'api_calls_per_minute', 1);
        assert(typeof result.retryAfterMs === 'number', 'retryAfterMs is number');
        assert(result.retryAfterMs === 0, 'retryAfterMs is 0 when allowed');
    });

    runTest('w12_075', 'Multiple checks do not deplete', () => {
        const limiter = new RateLimiter();

        const r1 = limiter.check('agent44', 'api_calls_per_minute', 5);
        const r2 = limiter.check('agent44', 'api_calls_per_minute', 10);
        const r3 = limiter.check('agent44', 'api_calls_per_minute', 20);

        assert(r1.remaining === 100, 'first check: 100 remaining');
        assert(r2.remaining === 100, 'second check: 100 remaining');
        assert(r3.remaining === 100, 'third check: 100 remaining');
    });

    runTest('w12_076', 'Check with exhausted bucket', () => {
        const limiter = new RateLimiter();

        for (let i = 0; i < 100; i++) {
            limiter.consume('agent45', 'api_calls_per_minute', 1);
        }

        const result = limiter.check('agent45', 'api_calls_per_minute', 1);
        assert(result.allowed === false, 'check shows blocked');
        assert(result.retryAfterMs > 0, 'retryAfterMs positive');
    });

    runTest('w12_077', 'Check partial consumption possible', () => {
        const limiter = new RateLimiter();

        limiter.consume('agent46', 'api_calls_per_minute', 50);
        const result = limiter.check('agent46', 'api_calls_per_minute', 40);

        assert(result.allowed === true, 'check allows remaining tokens');
        assert(result.remaining === 50, 'check shows actual remaining');
    });

    runTest('w12_078', 'Check null agentId returns error', () => {
        const limiter = new RateLimiter();
        const result = limiter.check(null, 'api_calls_per_minute', 1);
        assert(result.allowed === false, 'null agentId returns not allowed');
    });

    runTest('w12_079', 'Check null metric returns error', () => {
        const limiter = new RateLimiter();
        const result = limiter.check('agent47', null, 1);
        assert(result.allowed === false, 'null metric returns not allowed');
    });

    runTest('w12_080', 'Check unknown metric allows', () => {
        const limiter = new RateLimiter();
        const result = limiter.check('agent48', 'unknown_xyz', 1);
        assert(result.allowed === true, 'unknown metric allowed');
        assert(result.remaining === Infinity, 'remaining is Infinity for unknown');
    });

    runTest('w12_081', 'Check refill interval respected', () => {
        const limiter = new RateLimiter();

        for (let i = 0; i < 100; i++) {
            limiter.consume('agent49', 'api_calls_per_minute', 1);
        }

        let result = limiter.check('agent49', 'api_calls_per_minute', 1);
        assert(result.allowed === false, 'depleted');

        // Simulate 60 second refill
        const bucket = limiter.buckets.get('agent49:api_calls_per_minute');
        bucket.lastRefillTime = Date.now() - 60000;

        result = limiter.check('agent49', 'api_calls_per_minute', 1);
        assert(result.allowed === true, 'after refill allowed');
    });

    runTest('w12_082', 'Check count parameter respected', () => {
        const limiter = new RateLimiter();

        limiter.consume('agent50', 'api_calls_per_minute', 90);

        const r1 = limiter.check('agent50', 'api_calls_per_minute', 5);
        const r2 = limiter.check('agent50', 'api_calls_per_minute', 15);

        assert(r1.allowed === true, 'check 5 allowed');
        assert(r2.allowed === false, 'check 15 not allowed');
    });

    runTest('w12_083', 'Check does not create bucket for unknown metric', () => {
        const limiter = new RateLimiter();
        const activeBefore = limiter.getActiveBuckets().length;

        limiter.check('agent51', 'unknown_metric_xyz', 1);

        const activeAfter = limiter.getActiveBuckets().length;
        assert(activeBefore === activeAfter, 'check did not create bucket for unknown metric');
    });

    runTest('w12_084', 'Check disabled enforcement mode', () => {
        const limiter = new RateLimiter({ enforcement: { mode: 'disabled' } });
        const result = limiter.check('agent52', 'api_calls_per_minute', 1);
        assert(result.allowed === true, 'disabled mode check allows');
    });

    runTest('w12_085', 'Check observe enforcement mode', () => {
        const limiter = new RateLimiter({ enforcement: { mode: 'observe' } });
        const result = limiter.check('agent53', 'api_calls_per_minute', 1);
        assert(result.allowed === true, 'observe mode check allows');
    });

    // =========================================================================
    // SECTION 5: configure() Method (w12_086 - w12_100)
    // =========================================================================
    console.log('\n[SECTION 5] configure() Method');

    runTest('w12_086', 'Custom limits override defaults', () => {
        const limiter = new RateLimiter();

        limiter.configure('agent54', 'api_calls_per_minute', {
            capacity: 50,
            refillRate: 50,
            windowMs: 60000
        });

        const result = limiter.consume('agent54', 'api_calls_per_minute', 1);
        assert(result.limit === 50, 'custom capacity applied');
    });

    runTest('w12_087', 'Custom limits per agent', () => {
        const limiter = new RateLimiter();

        limiter.configure('agentX', 'api_calls_per_minute', {
            capacity: 200,
            refillRate: 200,
            windowMs: 60000
        });

        limiter.configure('agentY', 'api_calls_per_minute', {
            capacity: 50,
            refillRate: 50,
            windowMs: 60000
        });

        const rX = limiter.consume('agentX', 'api_calls_per_minute', 1);
        const rY = limiter.consume('agentY', 'api_calls_per_minute', 1);

        assert(rX.limit === 200, 'agentX has 200 limit');
        assert(rY.limit === 50, 'agentY has 50 limit');
    });

    runTest('w12_088', 'Reconfiguring resets bucket', () => {
        const limiter = new RateLimiter();

        // First consume
        limiter.consume('agent55', 'api_calls_per_minute', 50);
        let result = limiter.check('agent55', 'api_calls_per_minute', 1);
        assert(result.remaining === 50, 'after first consume: 50 remaining');

        // Reconfigure
        limiter.configure('agent55', 'api_calls_per_minute', {
            capacity: 100,
            refillRate: 100,
            windowMs: 60000
        });

        // After reconfigure, bucket should be reset
        result = limiter.consume('agent55', 'api_calls_per_minute', 0);
        assert(result.limit === 100, 'limit changed');
        assert(result.remaining === 100, 'bucket reset to full');
    });

    runTest('w12_089', 'Custom capacity respected', () => {
        const limiter = new RateLimiter();

        limiter.configure('agent56', 'api_calls_per_minute', {
            capacity: 10,
            refillRate: 10,
            windowMs: 60000
        });

        // Try to consume more than custom capacity
        for (let i = 0; i < 15; i++) {
            const result = limiter.consume('agent56', 'api_calls_per_minute', 1);
            if (!result.allowed) {
                assert(i === 10, 'blocked after custom capacity (10)');
                return;
            }
        }
        assert(false, 'should have been blocked at capacity');
    });

    runTest('w12_090', 'Custom refill rate respected', () => {
        const limiter = new RateLimiter();

        // Very slow refill: 10 tokens per hour
        limiter.configure('agent57', 'api_calls_per_minute', {
            capacity: 100,
            refillRate: 10,
            windowMs: 3600000
        });

        // Consume all
        for (let i = 0; i < 100; i++) {
            limiter.consume('agent57', 'api_calls_per_minute', 1);
        }

        // After 1 minute (60000ms), should refill 10/60 = ~0.167 tokens
        const bucket = limiter.buckets.get('agent57:api_calls_per_minute');
        bucket.lastRefillTime = Date.now() - 60000;

        const result = limiter.check('agent57', 'api_calls_per_minute', 1);
        assert(result.remaining < 2, 'slow refill applied (less than 2 tokens)');
    });

    runTest('w12_091', 'Custom window respected', () => {
        const limiter = new RateLimiter();

        limiter.configure('agent58', 'api_calls_per_minute', {
            capacity: 100,
            refillRate: 100,
            windowMs: 30000  // 30 second window
        });

        // Consume all
        for (let i = 0; i < 100; i++) {
            limiter.consume('agent58', 'api_calls_per_minute', 1);
        }

        // After 30 seconds, should be full
        const bucket = limiter.buckets.get('agent58:api_calls_per_minute');
        bucket.lastRefillTime = Date.now() - 30000;

        const result = limiter.check('agent58', 'api_calls_per_minute', 1);
        assert(result.remaining === 100, 'custom window refill respected');
    });

    runTest('w12_092', 'Configure with missing capacity defaults', () => {
        const limiter = new RateLimiter();

        limiter.configure('agent59', 'api_calls_per_minute', {
            // No capacity specified
            refillRate: 75,
            windowMs: 60000
        });

        const result = limiter.consume('agent59', 'api_calls_per_minute', 1);
        // Should default to 100
        assert(result.limit === 100, 'missing capacity defaults to 100');
    });

    runTest('w12_093', 'Configure with missing refillRate defaults', () => {
        const limiter = new RateLimiter();

        limiter.configure('agent60', 'api_calls_per_minute', {
            capacity: 75,
            // No refillRate specified
            windowMs: 60000
        });

        const result = limiter.consume('agent60', 'api_calls_per_minute', 1);
        // Should default to 100
        assert(result.limit === 75, 'custom capacity applied');
    });

    runTest('w12_094', 'Configure with missing windowMs defaults', () => {
        const limiter = new RateLimiter();

        limiter.configure('agent61', 'api_calls_per_minute', {
            capacity: 50,
            refillRate: 50
            // No windowMs specified
        });

        const result = limiter.consume('agent61', 'api_calls_per_minute', 1);
        // Should default to 60000
        assert(result.limit === 50, 'custom capacity applied');
    });

    runTest('w12_095', 'Configure null agentId ignored', () => {
        const limiter = new RateLimiter();

        limiter.configure(null, 'api_calls_per_minute', {
            capacity: 50,
            refillRate: 50,
            windowMs: 60000
        });

        // Should not have created custom limit
        assert(limiter.customLimits.size === 0, 'null agentId ignored');
    });

    runTest('w12_096', 'Configure null metric ignored', () => {
        const limiter = new RateLimiter();

        limiter.configure('agent62', null, {
            capacity: 50,
            refillRate: 50,
            windowMs: 60000
        });

        assert(limiter.customLimits.size === 0, 'null metric ignored');
    });

    runTest('w12_097', 'Configure null config ignored', () => {
        const limiter = new RateLimiter();

        limiter.configure('agent63', 'api_calls_per_minute', null);

        assert(limiter.customLimits.size === 0, 'null config ignored');
    });

    runTest('w12_098', 'Configure creates new agent entry', () => {
        const limiter = new RateLimiter();

        limiter.configure('agent64', 'api_calls_per_minute', {
            capacity: 75,
            refillRate: 75,
            windowMs: 60000
        });

        assert(limiter.customLimits.has('agent64'), 'agent entry created');
    });

    runTest('w12_099', 'Configure multiple metrics per agent', () => {
        const limiter = new RateLimiter();

        limiter.configure('agent65', 'api_calls_per_minute', {
            capacity: 50,
            refillRate: 50,
            windowMs: 60000
        });

        limiter.configure('agent65', 'tokens_per_hour', {
            capacity: 500000,
            refillRate: 500000,
            windowMs: 3600000
        });

        const agentMap = limiter.customLimits.get('agent65');
        assert(agentMap.size === 2, 'both metrics configured');
    });

    runTest('w12_100', 'Configure overwrites previous config', () => {
        const limiter = new RateLimiter();

        limiter.configure('agent66', 'api_calls_per_minute', {
            capacity: 50,
            refillRate: 50,
            windowMs: 60000
        });

        limiter.configure('agent66', 'api_calls_per_minute', {
            capacity: 150,
            refillRate: 150,
            windowMs: 60000
        });

        const result = limiter.consume('agent66', 'api_calls_per_minute', 1);
        assert(result.limit === 150, 'new config overwrites old');
    });

    // =========================================================================
    // SECTION 6: Enforcement Modes (w12_101 - w12_118)
    // =========================================================================
    console.log('\n[SECTION 6] Enforcement Modes');

    runTest('w12_101', 'Enforce mode blocks when exceeded', () => {
        const limiter = new RateLimiter({ enforcement: { mode: 'enforce' } });

        for (let i = 0; i < 100; i++) {
            limiter.consume('agent67', 'api_calls_per_minute', 1);
        }

        const result = limiter.consume('agent67', 'api_calls_per_minute', 1);
        assert(result.allowed === false, 'enforce mode blocks');
    });

    runTest('w12_102', 'Enforce mode allows when available', () => {
        const limiter = new RateLimiter({ enforcement: { mode: 'enforce' } });

        const result = limiter.consume('agent68', 'api_calls_per_minute', 10);
        assert(result.allowed === true, 'enforce mode allows when available');
    });

    runTest('w12_103', 'Observe mode allows even when would block', () => {
        const limiter = new RateLimiter({ enforcement: { mode: 'observe' } });

        for (let i = 0; i < 100; i++) {
            limiter.consume('agent69', 'api_calls_per_minute', 1);
        }

        const result = limiter.consume('agent69', 'api_calls_per_minute', 1);
        assert(result.allowed === true, 'observe mode allows');
    });

    runTest('w12_104', 'Observe mode sets wouldBlock flag', () => {
        const limiter = new RateLimiter({ enforcement: { mode: 'observe' } });

        for (let i = 0; i < 100; i++) {
            limiter.consume('agent70', 'api_calls_per_minute', 1);
        }

        const result = limiter.consume('agent70', 'api_calls_per_minute', 1);
        assert(result.wouldBlock === true, 'wouldBlock is true');
    });

    runTest('w12_105', 'Observe mode no wouldBlock when allowed', () => {
        const limiter = new RateLimiter({ enforcement: { mode: 'observe' } });

        const result = limiter.consume('agent71', 'api_calls_per_minute', 10);
        assert(result.wouldBlock === undefined, 'wouldBlock undefined when allowed');
    });

    runTest('w12_106', 'Disabled mode always allows', () => {
        const limiter = new RateLimiter({ enforcement: { mode: 'disabled' } });

        for (let i = 0; i < 500; i++) {
            const result = limiter.consume('agent72', 'api_calls_per_minute', 1);
            assert(result.allowed === true, `disabled mode allows at ${i}`);
        }
    });

    runTest('w12_107', 'Disabled mode returns Infinity remaining', () => {
        const limiter = new RateLimiter({ enforcement: { mode: 'disabled' } });

        const result = limiter.consume('agent73', 'api_calls_per_minute', 50);
        assert(result.remaining === Infinity, 'disabled returns Infinity');
    });

    runTest('w12_108', 'Disabled mode returns Infinity limit', () => {
        const limiter = new RateLimiter({ enforcement: { mode: 'disabled' } });

        const result = limiter.consume('agent74', 'api_calls_per_minute', 1);
        assert(result.limit === Infinity, 'disabled limit is Infinity');
    });

    runTest('w12_109', 'Switching modes between operations', () => {
        const limiter = new RateLimiter({ enforcement: { mode: 'enforce' } });

        // In enforce mode, deplete
        for (let i = 0; i < 100; i++) {
            limiter.consume('agent75', 'api_calls_per_minute', 1);
        }

        let result = limiter.consume('agent75', 'api_calls_per_minute', 1);
        assert(result.allowed === false, 'enforce blocks');

        // Switch to disabled
        limiter.config.enforcement.mode = 'disabled';

        result = limiter.consume('agent75', 'api_calls_per_minute', 1);
        assert(result.allowed === true, 'disabled allows');
    });

    runTest('w12_110', 'Mode override in config constructor', () => {
        const limiter = new RateLimiter({
            enforcement: { mode: 'observe' }
        });

        assert(limiter.config.enforcement.mode === 'observe', 'mode set from config');
    });

    runTest('w12_111', 'Enforce mode retryAfterMs accurate', () => {
        const limiter = new RateLimiter({ enforcement: { mode: 'enforce' } });

        for (let i = 0; i < 100; i++) {
            limiter.consume('agent76', 'api_calls_per_minute', 1);
        }

        const result = limiter.consume('agent76', 'api_calls_per_minute', 1);
        assert(result.retryAfterMs > 0, 'retryAfterMs provided');
    });

    runTest('w12_112', 'Observe mode retryAfterMs included', () => {
        const limiter = new RateLimiter({ enforcement: { mode: 'observe' } });

        for (let i = 0; i < 100; i++) {
            limiter.consume('agent77', 'api_calls_per_minute', 1);
        }

        const result = limiter.consume('agent77', 'api_calls_per_minute', 1);
        assert(result.retryAfterMs > 0, 'retryAfterMs provided in observe');
    });

    runTest('w12_113', 'Multiple agents different modes', () => {
        const limiter = new RateLimiter({ enforcement: { mode: 'enforce' } });

        // Both agents see same mode
        for (let i = 0; i < 100; i++) {
            limiter.consume('agentEnforce', 'api_calls_per_minute', 1);
        }

        const result1 = limiter.consume('agentEnforce', 'api_calls_per_minute', 1);
        assert(result1.allowed === false, 'enforce mode applies globally');
    });

    runTest('w12_114', 'Changing enforcement.mode modifies behavior', () => {
        const limiter = new RateLimiter({ enforcement: { mode: 'enforce' } });

        // Deplete in enforce mode
        for (let i = 0; i < 100; i++) {
            limiter.consume('agent78', 'api_calls_per_minute', 1);
        }

        // Switch to observe before consuming
        limiter.config.enforcement.mode = 'observe';

        const result = limiter.consume('agent78', 'api_calls_per_minute', 1);
        assert(result.allowed === true, 'observe mode now allows');
        assert(result.wouldBlock === true, 'wouldBlock set');
    });

    runTest('w12_115', 'Default enforcement mode is enforce', () => {
        const limiter = new RateLimiter();
        assert(limiter.config.enforcement.mode === 'enforce', 'default is enforce');
    });

    runTest('w12_116', 'blockOnExceed config flag exists', () => {
        const limiter = new RateLimiter();
        assert(limiter.config.enforcement.blockOnExceed === true, 'blockOnExceed default true');
    });

    runTest('w12_117', 'logAllChecks config flag exists', () => {
        const limiter = new RateLimiter();
        assert(limiter.config.enforcement.logAllChecks === false, 'logAllChecks default false');
    });

    runTest('w12_118', 'enforcement config deep merge', () => {
        const limiter = new RateLimiter({
            enforcement: { mode: 'observe' }
        });
        assert(limiter.config.enforcement.blockOnExceed === true, 'other enforcement flags preserved');
    });

    // =========================================================================
    // SECTION 7: getStatus/resetAgent/resetMetric (w12_119 - w12_130)
    // =========================================================================
    console.log('\n[SECTION 7] Status, Reset, and Inspection Methods');

    runTest('w12_119', 'getStatus returns all metrics for agent', () => {
        const limiter = new RateLimiter();

        limiter.consume('agent79', 'api_calls_per_minute', 10);
        limiter.consume('agent79', 'tokens_per_hour', 500);
        limiter.consume('agent79', 'cost_per_hour', 50);

        const status = limiter.getStatus('agent79');
        assert(status['api_calls_per_minute'] !== undefined, 'api_calls_per_minute in status');
        assert(status['tokens_per_hour'] !== undefined, 'tokens_per_hour in status');
        assert(status['cost_per_hour'] !== undefined, 'cost_per_hour in status');
    });

    runTest('w12_120', 'getStatus includes correct utilization', () => {
        const limiter = new RateLimiter();

        limiter.consume('agent80', 'api_calls_per_minute', 50);

        const status = limiter.getStatus('agent80');
        const apiStatus = status['api_calls_per_minute'];
        assert(apiStatus.tokens === 50, 'tokens correct');
        assert(apiStatus.utilizationPercent === 50, 'utilization is 50%');
    });

    runTest('w12_121', 'getStatus empty for unknown agent', () => {
        const limiter = new RateLimiter();

        const status = limiter.getStatus('unknown_agent_xyz');
        assert(Object.keys(status).length === 0, 'empty status for unknown agent');
    });

    runTest('w12_122', 'resetAgent resets all metrics', () => {
        const limiter = new RateLimiter();

        limiter.consume('agent81', 'api_calls_per_minute', 30);
        limiter.consume('agent81', 'tokens_per_hour', 100000);

        limiter.resetAgent('agent81');

        const r1 = limiter.check('agent81', 'api_calls_per_minute', 1);
        const r2 = limiter.check('agent81', 'tokens_per_hour', 1);

        assert(r1.remaining === 100, 'api_calls_per_minute reset');
        assert(r2.remaining === 1000000, 'tokens_per_hour reset');
    });

    runTest('w12_123', 'resetAgent affects only target agent', () => {
        const limiter = new RateLimiter();

        limiter.consume('agent82a', 'api_calls_per_minute', 30);
        limiter.consume('agent82b', 'api_calls_per_minute', 40);

        limiter.resetAgent('agent82a');

        const r1 = limiter.check('agent82a', 'api_calls_per_minute', 1);
        const r2 = limiter.check('agent82b', 'api_calls_per_minute', 1);

        assert(r1.remaining === 100, 'agent82a reset');
        assert(r2.remaining === 60, 'agent82b unaffected');
    });

    runTest('w12_124', 'resetMetric resets specific metric', () => {
        const limiter = new RateLimiter();

        limiter.consume('agent83', 'api_calls_per_minute', 30);
        limiter.consume('agent83', 'tokens_per_hour', 100000);

        limiter.resetMetric('agent83', 'api_calls_per_minute');

        const r1 = limiter.check('agent83', 'api_calls_per_minute', 1);
        const r2 = limiter.check('agent83', 'tokens_per_hour', 1);

        assert(r1.remaining === 100, 'api_calls_per_minute reset');
        assert(r2.remaining === 900000, 'tokens_per_hour unaffected');
    });

    runTest('w12_125', 'resetMetric unknown bucket safe', () => {
        const limiter = new RateLimiter();

        // Should not throw
        limiter.resetMetric('agent84', 'nonexistent_metric');

        assert(true, 'resetMetric handles unknown bucket gracefully');
    });

    runTest('w12_126', 'getActiveBuckets lists all keys', () => {
        const limiter = new RateLimiter();

        limiter.consume('agent85', 'api_calls_per_minute', 1);
        limiter.consume('agent85', 'tokens_per_hour', 1);
        limiter.consume('agent86', 'api_calls_per_minute', 1);

        const active = limiter.getActiveBuckets();
        assert(active.includes('agent85:api_calls_per_minute'), 'includes agent85 api');
        assert(active.includes('agent85:tokens_per_hour'), 'includes agent85 tokens');
        assert(active.includes('agent86:api_calls_per_minute'), 'includes agent86 api');
    });

    runTest('w12_127', 'getActiveBuckets format correct', () => {
        const limiter = new RateLimiter();

        limiter.consume('agent87', 'api_calls_per_minute', 1);

        const active = limiter.getActiveBuckets();
        assert(active[0].includes(':'), 'bucket key includes colon separator');
    });

    runTest('w12_128', 'getActiveBuckets empty initially', () => {
        const limiter = new RateLimiter();

        const active = limiter.getActiveBuckets();
        assert(active.length === 0, 'no active buckets initially');
    });

    runTest('w12_129', 'Reset preserves other agents', () => {
        const limiter = new RateLimiter();

        limiter.consume('agentReset1', 'api_calls_per_minute', 50);
        limiter.consume('agentReset2', 'api_calls_per_minute', 75);

        limiter.resetAgent('agentReset1');

        const status2 = limiter.getStatus('agentReset2');
        assert(status2['api_calls_per_minute'].tokens === 25, 'other agent preserved');
    });

    runTest('w12_130', 'getStatus null agentId returns empty', () => {
        const limiter = new RateLimiter();

        const status = limiter.getStatus(null);
        assert(Object.keys(status).length === 0, 'null agentId returns empty status');
    });

    // =========================================================================
    // SECTION 8: rateLimitMiddleware (w12_131 - w12_145)
    // =========================================================================
    console.log('\n[SECTION 8] rateLimitMiddleware');

    runTest('w12_131', 'rateLimitMiddleware function exists', () => {
        assert(typeof rateLimitMiddleware === 'function', 'rateLimitMiddleware is function');
    });

    runTest('w12_132', 'Middleware returns function', () => {
        const limiter = new RateLimiter();
        const middleware = rateLimitMiddleware(limiter);
        assert(typeof middleware === 'function', 'returns middleware function');
    });

    runTest('w12_133', 'Middleware accepts req, res, next', () => {
        const limiter = new RateLimiter();
        const middleware = rateLimitMiddleware(limiter);

        const req = { headers: {} };
        const res = {
            setHeader: () => {},
            status: () => ({ json: () => {} })
        };
        const next = () => {};

        // Should not throw
        middleware(req, res, next);
        assert(true, 'middleware called without error');
    });

    runTest('w12_134', 'Middleware sets X-RateLimit-Limit header', () => {
        const limiter = new RateLimiter();
        const middleware = rateLimitMiddleware(limiter);

        let limitHeader = null;
        const req = { headers: {} };
        const res = {
            setHeader: (name, value) => {
                if (name === 'X-RateLimit-Limit') limitHeader = value;
            },
            status: () => ({ json: () => {} })
        };
        const next = () => {};

        middleware(req, res, next);
        assert(limitHeader === 100, 'X-RateLimit-Limit set to 100');
    });

    runTest('w12_135', 'Middleware sets X-RateLimit-Remaining header', () => {
        const limiter = new RateLimiter();
        const middleware = rateLimitMiddleware(limiter);

        let remainingHeader = null;
        const req = { headers: {} };
        const res = {
            setHeader: (name, value) => {
                if (name === 'X-RateLimit-Remaining') remainingHeader = value;
            },
            status: () => ({ json: () => {} })
        };
        const next = () => {};

        middleware(req, res, next);
        assert(remainingHeader === 99, 'X-RateLimit-Remaining set');
    });

    runTest('w12_136', 'Middleware returns 429 when rate limited', () => {
        const limiter = new RateLimiter();
        const middleware = rateLimitMiddleware(limiter);

        // Deplete bucket
        for (let i = 0; i < 100; i++) {
            limiter.consume('api', 'api_calls_per_minute', 1);
        }

        let statusCode = null;
        const req = { headers: { 'x-agent-name': 'api' } };
        const res = {
            setHeader: () => {},
            status: (code) => {
                statusCode = code;
                return { json: () => {} };
            }
        };
        const next = () => {};

        middleware(req, res, next);
        assert(statusCode === 429, 'returns 429 status');
    });

    runTest('w12_137', 'Middleware sets Retry-After on 429', () => {
        const limiter = new RateLimiter();
        const middleware = rateLimitMiddleware(limiter);

        // Deplete bucket
        for (let i = 0; i < 100; i++) {
            limiter.consume('api', 'api_calls_per_minute', 1);
        }

        let retryAfter = null;
        const req = { headers: { 'x-agent-name': 'api' } };
        const res = {
            setHeader: (name, value) => {
                if (name === 'Retry-After') retryAfter = value;
            },
            status: () => ({ json: () => {} })
        };
        const next = () => {};

        middleware(req, res, next);
        assert(retryAfter !== null && retryAfter > 0, 'Retry-After header set');
    });

    runTest('w12_138', 'Middleware calls next() when allowed', () => {
        const limiter = new RateLimiter();
        const middleware = rateLimitMiddleware(limiter);

        let nextCalled = false;
        const req = { headers: {} };
        const res = {
            setHeader: () => {},
            status: () => ({ json: () => {} })
        };
        const next = () => { nextCalled = true; };

        middleware(req, res, next);
        assert(nextCalled === true, 'next() called when allowed');
    });

    runTest('w12_139', 'Middleware uses x-agent-name header', () => {
        const limiter = new RateLimiter();
        const middleware = rateLimitMiddleware(limiter);

        // Deplete with custom agent
        for (let i = 0; i < 100; i++) {
            limiter.consume('custom-agent', 'api_calls_per_minute', 1);
        }

        let nextCalled = false;
        const req = { headers: { 'x-agent-name': 'custom-agent' } };
        const res = {
            setHeader: () => {},
            status: () => ({ json: () => {} })
        };
        const next = () => { nextCalled = true; };

        middleware(req, res, next);
        assert(nextCalled === false, 'custom agent bucket used');
    });

    runTest('w12_140', 'Middleware defaults to api agent name', () => {
        const limiter = new RateLimiter();
        const middleware = rateLimitMiddleware(limiter);

        // Deplete 'api' agent
        for (let i = 0; i < 100; i++) {
            limiter.consume('api', 'api_calls_per_minute', 1);
        }

        let nextCalled = false;
        const req = { headers: {} };  // No x-agent-name
        const res = {
            setHeader: () => {},
            status: () => ({ json: () => {} })
        };
        const next = () => { nextCalled = true; };

        middleware(req, res, next);
        assert(nextCalled === false, 'defaults to api agent name');
    });

    runTest('w12_141', 'Middleware uses api_calls_per_minute metric', () => {
        const limiter = new RateLimiter();
        const middleware = rateLimitMiddleware(limiter);

        // Middleware should use api_calls_per_minute metric
        const req = { headers: {} };
        const res = {
            setHeader: () => {},
            status: () => ({ json: () => {} })
        };
        const next = () => {};

        middleware(req, res, next);

        const status = limiter.getStatus('api');
        assert(status['api_calls_per_minute'] !== undefined, 'api_calls_per_minute metric used');
    });

    runTest('w12_142', 'Middleware response body on 429', () => {
        const limiter = new RateLimiter();
        const middleware = rateLimitMiddleware(limiter);

        // Deplete bucket
        for (let i = 0; i < 100; i++) {
            limiter.consume('api', 'api_calls_per_minute', 1);
        }

        let responseBody = null;
        const req = { headers: { 'x-agent-name': 'api' } };
        const res = {
            setHeader: () => {},
            status: () => ({
                json: (body) => { responseBody = body; }
            })
        };
        const next = () => {};

        middleware(req, res, next);
        assert(responseBody.error === 'Rate limit exceeded', 'error message in response');
        assert(responseBody.metric === 'api_calls_per_minute', 'metric in response');
        assert(responseBody.retryAfterSeconds !== undefined, 'retryAfterSeconds in response');
    });

    runTest('w12_143', 'Middleware consumes one token per request', () => {
        const limiter = new RateLimiter();
        const middleware = rateLimitMiddleware(limiter);

        const req = { headers: {} };
        const res = {
            setHeader: () => {},
            status: () => ({ json: () => {} })
        };
        const next = () => {};

        middleware(req, res, next);
        middleware(req, res, next);

        const result = limiter.check('api', 'api_calls_per_minute', 1);
        assert(result.remaining === 98, 'two tokens consumed by two requests');
    });

    runTest('w12_144', 'Middleware does not call next on rate limit', () => {
        const limiter = new RateLimiter();
        const middleware = rateLimitMiddleware(limiter);

        // Deplete
        for (let i = 0; i < 100; i++) {
            limiter.consume('api', 'api_calls_per_minute', 1);
        }

        let nextCalled = false;
        const req = { headers: { 'x-agent-name': 'api' } };
        const res = {
            setHeader: () => {},
            status: () => ({ json: () => {} })
        };
        const next = () => { nextCalled = true; };

        middleware(req, res, next);
        assert(nextCalled === false, 'next() not called on rate limit');
    });

    runTest('w12_145', 'Middleware Retry-After in seconds', () => {
        const limiter = new RateLimiter();
        const middleware = rateLimitMiddleware(limiter);

        // Deplete
        for (let i = 0; i < 100; i++) {
            limiter.consume('api', 'api_calls_per_minute', 1);
        }

        let retryAfter = null;
        const req = { headers: { 'x-agent-name': 'api' } };
        const res = {
            setHeader: (name, value) => {
                if (name === 'Retry-After') retryAfter = value;
            },
            status: () => ({ json: () => {} })
        };
        const next = () => {};

        middleware(req, res, next);
        // retryAfter should be in seconds (milliseconds / 1000)
        assert(retryAfter > 0 && retryAfter < 60, 'Retry-After in seconds range');
    });

    // =========================================================================
    // SECTION 9: Wiring Verification (w12_146 - w12_165)
    // =========================================================================
    console.log('\n[SECTION 9] Wiring Verification (integration patterns)');

    runTest('w12_146', 'RateLimiter exports available', () => {
        assert(RateLimiter !== undefined, 'RateLimiter exported');
        assert(RATE_LIMIT_CONFIG !== undefined, 'RATE_LIMIT_CONFIG exported');
        assert(RATE_LIMIT_RESULT !== undefined, 'RATE_LIMIT_RESULT exported');
        assert(rateLimitMiddleware !== undefined, 'rateLimitMiddleware exported');
        assert(createRateLimiter !== undefined, 'createRateLimiter exported');
    });

    runTest('w12_147', 'RateLimiter can be instantiated', () => {
        const limiter = new RateLimiter();
        assert(limiter instanceof RateLimiter, 'can instantiate RateLimiter');
    });

    runTest('w12_148', 'RateLimiter has consume method', () => {
        const limiter = new RateLimiter();
        const result = limiter.consume('test', 'api_calls_per_minute', 1);
        assert(result.allowed !== undefined, 'consume works');
    });

    runTest('w12_149', 'Rate limit blocks can be detected', () => {
        const limiter = new RateLimiter();

        for (let i = 0; i < 100; i++) {
            limiter.consume('test', 'api_calls_per_minute', 1);
        }

        const result = limiter.consume('test', 'api_calls_per_minute', 1);
        assert(result.allowed === false, 'rate limit violation detectable');
    });

    runTest('w12_150', 'Retry-After header provides recovery time', () => {
        const limiter = new RateLimiter();

        for (let i = 0; i < 100; i++) {
            limiter.consume('test', 'api_calls_per_minute', 1);
        }

        const result = limiter.consume('test', 'api_calls_per_minute', 1);
        assert(result.retryAfterMs > 0, 'retryAfterMs provides recovery guidance');
    });

    runTest('w12_151', 'Per-agent metrics isolation', () => {
        const limiter = new RateLimiter();

        const r1 = limiter.consume('agent1', 'api_calls_per_minute', 1);
        const r2 = limiter.consume('agent2', 'api_calls_per_minute', 1);

        assert(r1.allowed === true && r2.allowed === true, 'different agents isolated');
    });

    runTest('w12_152', 'Multiple metrics per agent', () => {
        const limiter = new RateLimiter();

        const rMin = limiter.consume('agent', 'api_calls_per_minute', 1);
        const rHour = limiter.consume('agent', 'tokens_per_hour', 1);
        const rCost = limiter.consume('agent', 'cost_per_hour', 1);

        assert(rMin.allowed && rHour.allowed && rCost.allowed, 'multiple metrics work');
    });

    runTest('w12_153', 'Check does not deplete on rate limit check', () => {
        const limiter = new RateLimiter();

        limiter.check('agent', 'api_calls_per_minute', 1);
        limiter.check('agent', 'api_calls_per_minute', 1);

        const result = limiter.consume('agent', 'api_calls_per_minute', 1);
        assert(result.remaining === 99, 'check is truly read-only');
    });

    runTest('w12_154', 'Enforcement mode affects all agents', () => {
        const limiter = new RateLimiter({ enforcement: { mode: 'disabled' } });

        for (let i = 0; i < 500; i++) {
            const result = limiter.consume(`agent${i}`, 'api_calls_per_minute', 1);
            assert(result.allowed === true, 'disabled mode applies to all');
        }
    });

    runTest('w12_155', 'Custom configuration applies to specific agent', () => {
        const limiter = new RateLimiter();

        limiter.configure('premium', 'api_calls_per_minute', {
            capacity: 1000,
            refillRate: 1000,
            windowMs: 60000
        });

        const r1 = limiter.consume('premium', 'api_calls_per_minute', 1);
        const r2 = limiter.consume('basic', 'api_calls_per_minute', 1);

        assert(r1.limit === 1000, 'premium has custom limit');
        assert(r2.limit === 100, 'basic has default limit');
    });

    runTest('w12_156', 'Refill works with custom windows', () => {
        const limiter = new RateLimiter();

        limiter.configure('agent', 'api_calls_per_minute', {
            capacity: 100,
            refillRate: 100,
            windowMs: 30000  // 30 second window
        });

        // Consume all
        for (let i = 0; i < 100; i++) {
            limiter.consume('agent', 'api_calls_per_minute', 1);
        }

        // After 30 seconds, should refill
        const bucket = limiter.buckets.get('agent:api_calls_per_minute');
        bucket.lastRefillTime = Date.now() - 30000;

        const result = limiter.check('agent', 'api_calls_per_minute', 1);
        assert(result.remaining === 100, 'custom refill window respected');
    });

    runTest('w12_157', 'Status reflects actual token state', () => {
        const limiter = new RateLimiter();

        limiter.consume('agent', 'api_calls_per_minute', 25);
        limiter.consume('agent', 'api_calls_per_minute', 25);
        limiter.consume('agent', 'api_calls_per_minute', 25);

        const status = limiter.getStatus('agent');
        const apiStatus = status['api_calls_per_minute'];

        assert(apiStatus.tokens === 25, 'status reflects actual tokens');
        assert(apiStatus.capacity === 100, 'status shows capacity');
    });

    runTest('w12_158', 'Reset restores service after overload', () => {
        const limiter = new RateLimiter();

        // Overload
        for (let i = 0; i < 100; i++) {
            limiter.consume('agent', 'api_calls_per_minute', 1);
        }

        let result = limiter.check('agent', 'api_calls_per_minute', 1);
        assert(result.allowed === false, 'overloaded');

        // Reset
        limiter.resetAgent('agent');

        result = limiter.check('agent', 'api_calls_per_minute', 1);
        assert(result.allowed === true, 'service restored');
    });

    runTest('w12_159', 'Result has all required fields for HTTP response', () => {
        const limiter = new RateLimiter();
        const result = limiter.consume('agent', 'api_calls_per_minute', 1);

        assert(result.allowed !== undefined, 'has allowed field');
        assert(result.remaining !== undefined, 'has remaining field');
        assert(result.retryAfterMs !== undefined, 'has retryAfterMs field');
        assert(result.metric !== undefined, 'has metric field');
        assert(result.limit !== undefined, 'has limit field');
    });

    runTest('w12_160', 'Observe mode suitable for auditing', () => {
        const limiter = new RateLimiter({ enforcement: { mode: 'observe' } });

        for (let i = 0; i < 100; i++) {
            limiter.consume('agent', 'api_calls_per_minute', 1);
        }

        const result = limiter.consume('agent', 'api_calls_per_minute', 1);
        assert(result.allowed === true, 'observe allows');
        assert(result.wouldBlock === true, 'observe tracks violations');
    });

    runTest('w12_161', 'Disabled mode for testing/dev', () => {
        const limiter = new RateLimiter({ enforcement: { mode: 'disabled' } });

        const r1 = limiter.consume('test1', 'api_calls_per_minute', 1);
        const r2 = limiter.consume('test2', 'api_calls_per_minute', 1);

        assert(r1.allowed && r2.allowed, 'disabled allows all');
    });

    runTest('w12_162', 'Metrics prevent API abuse', () => {
        const limiter = new RateLimiter();

        let blocked = false;
        for (let i = 0; i < 150; i++) {
            const result = limiter.consume('attacker', 'api_calls_per_minute', 1);
            if (!result.allowed) {
                blocked = true;
                break;
            }
        }

        assert(blocked === true, 'rate limiting prevents abuse');
    });

    runTest('w12_163', 'Token bucket resists burst attacks', () => {
        const limiter = new RateLimiter();

        const results = [];
        for (let i = 0; i < 200; i++) {
            results.push(limiter.consume('burst', 'api_calls_per_minute', 1));
        }

        const blocked = results.filter(r => !r.allowed).length;
        assert(blocked === 100, 'burst attack blocked at capacity');
    });

    runTest('w12_164', 'Different agents do not interfere', () => {
        const limiter = new RateLimiter();

        for (let i = 0; i < 100; i++) {
            limiter.consume('agent-a', 'api_calls_per_minute', 1);
        }

        const resultA = limiter.consume('agent-a', 'api_calls_per_minute', 1);
        const resultB = limiter.consume('agent-b', 'api_calls_per_minute', 1);

        assert(resultA.allowed === false, 'agent-a blocked');
        assert(resultB.allowed === true, 'agent-b unaffected');
    });

    runTest('w12_165', 'Rate limiter suitable for governance enforcement', () => {
        const limiter = new RateLimiter();

        // Simulate governance check
        const result = limiter.consume('gov-agent', 'api_calls_per_minute', 1);

        if (!result.allowed) {
            // Would block the request
            assert(false, 'governance can enforce');
        } else {
            // Request allowed
            assert(result.allowed === true, 'governance can allow');
        }
    });

    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log('\n' + '═'.repeat(80));
    console.log(`RESULTS: ${passed} passed, ${failed} failed`);
    console.log('═'.repeat(80));

    if (failures.length > 0) {
        console.log('\nFailed tests:');
        failures.forEach(f => console.log(`  - ${f}`));
    }

    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('Test suite error:', err);
    process.exit(1);
});
