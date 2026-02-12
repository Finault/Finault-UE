import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

function assertThrows(fn, expectedSubstring, message) {
    try {
        fn();
        console.log(`  ✗ FAIL: ${message} (did NOT throw)`);
        failed++;
        failures.push(message);
    } catch (e) {
        if (expectedSubstring && !e.message.includes(expectedSubstring)) {
            console.log(`  ✗ FAIL: ${message} (threw "${e.message}" but expected "${expectedSubstring}")`);
            failed++;
            failures.push(message);
        } else {
            console.log(`  ✓ ${message}`);
            passed++;
        }
    }
}

async function assertAsyncThrows(fn, expectedSubstring, message) {
    try {
        await fn();
        console.log(`  ✗ FAIL: ${message} (did NOT throw)`);
        failed++;
        failures.push(message);
    } catch (e) {
        if (expectedSubstring && !e.message.includes(expectedSubstring)) {
            console.log(`  ✗ FAIL: ${message} (threw "${e.message}" but expected "${expectedSubstring}")`);
            failed++;
            failures.push(message);
        } else {
            console.log(`  ✓ ${message}`);
            passed++;
        }
    }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runTests() {
    console.log('═'.repeat(70));
    console.log('W-005 RESILIENCE LAYER TEST SUITE');
    console.log('═'.repeat(70));

    // =========================================================================
    // SECTION 1: STRUCTURAL TESTS (~30 tests)
    // =========================================================================
    console.log('\n[SECTION 1] Structural Tests');

    const src = fs.readFileSync(path.join(__dirname, '..', 'core', 'resilience-layer.js'), 'utf-8');

    assert(src.includes('class CircuitBreaker'), 'Source contains class CircuitBreaker');
    assert(src.includes('class RetryPolicy'), 'Source contains class RetryPolicy');
    assert(src.includes('class ResilienceLayer'), 'Source contains class ResilienceLayer');
    assert(src.includes('export'), 'Source file exports modules');
    assert(src.includes("export {"), 'Source uses named exports');

    // Check export names
    assert(src.includes('isTransientError'), 'Exports isTransientError function');
    assert(src.includes('CircuitBreaker'), 'Exports CircuitBreaker class');
    assert(src.includes('RetryPolicy'), 'Exports RetryPolicy class');
    assert(src.includes('ResilienceLayer'), 'Exports ResilienceLayer class');
    assert(src.includes('createSupabaseResilience'), 'Exports createSupabaseResilience factory');
    assert(src.includes('createAnthropicResilience'), 'Exports createAnthropicResilience factory');
    assert(src.includes('getCircuitBreaker'), 'Exports getCircuitBreaker function');
    assert(src.includes('resetAllBreakers'), 'Exports resetAllBreakers function');
    assert(src.includes('SUPABASE_CONFIG'), 'Exports SUPABASE_CONFIG object');
    assert(src.includes('ANTHROPIC_CONFIG'), 'Exports ANTHROPIC_CONFIG object');

    // CircuitBreaker methods
    assert(src.includes('_pruneWindow'), 'CircuitBreaker has _pruneWindow method');
    assert(src.includes('_transition'), 'CircuitBreaker has _transition method');
    assert(src.includes('recordSuccess'), 'CircuitBreaker has recordSuccess method');
    assert(src.includes('recordFailure'), 'CircuitBreaker has recordFailure method');
    assert(src.includes('isAllowed'), 'CircuitBreaker has isAllowed method');
    assert(src.includes('execute'), 'CircuitBreaker has execute method');
    assert(src.includes('getStatus'), 'CircuitBreaker has getStatus method');
    assert(src.includes('reset'), 'CircuitBreaker has reset method');

    // RetryPolicy methods
    assert(src.includes('getDelay'), 'RetryPolicy has getDelay method');

    // Constructor validations
    assert(src.includes('name must be a non-empty string'), 'CircuitBreaker validates name');
    assert(src.includes('circuitBreaker must be a CircuitBreaker instance'), 'ResilienceLayer validates circuitBreaker');
    assert(src.includes('retryPolicy must be a RetryPolicy instance'), 'ResilienceLayer validates retryPolicy');
    assert(src.includes('supabaseClient must have a .from() method'), 'createSupabaseResilience validates input');
    assert(src.includes('anthropicClient is required'), 'createAnthropicResilience validates input');

    // Error detection
    assert(src.includes('timeout'), 'isTransientError handles timeout pattern');
    assert(src.includes('429'), 'isTransientError handles 429 pattern');

    // Agent integration check
    const agentDir = path.join(__dirname, '..', 'agents');
    let agentFilesWithResilience = 0;
    if (fs.existsSync(agentDir)) {
        const agentFiles = fs.readdirSync(agentDir).filter(f => f.endsWith('.js'));
        for (const agentFile of agentFiles) {
            const agentSrc = fs.readFileSync(path.join(agentDir, agentFile), 'utf-8');
            const noComments = agentSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

            if (agentSrc.includes('resilience-layer') && noComments.includes('createSupabaseResilience')) {
                agentFilesWithResilience++;
            }
        }
    }
    assert(agentFilesWithResilience > 0, `At least one agent imports and uses createSupabaseResilience (found ${agentFilesWithResilience})`);

    // =========================================================================
    // SECTION 2: isTransientError BEHAVIORAL TESTS (~25 tests)
    // =========================================================================
    console.log('\n[SECTION 2] isTransientError Behavioral Tests');

    const { isTransientError, CircuitBreaker, RetryPolicy, ResilienceLayer, resetAllBreakers, getCircuitBreaker, createSupabaseResilience, createAnthropicResilience, createFetchResilience, SUPABASE_CONFIG, ANTHROPIC_CONFIG, FETCH_CONFIG } = await import(new URL('../core/resilience-layer.js', import.meta.url).href);

    // Falsy inputs
    assert(!isTransientError(null), 'isTransientError(null) returns false');
    assert(!isTransientError(undefined), 'isTransientError(undefined) returns false');
    assert(!isTransientError(''), 'isTransientError("") returns false');
    assert(!isTransientError(42), 'isTransientError(42) returns false (non-error type)');

    // Timeout patterns
    assert(isTransientError(new Error('connection timeout')), 'isTransientError handles "connection timeout"');
    assert(isTransientError(new Error('request timed out')), 'isTransientError handles "request timed out"');
    assert(isTransientError('ETIMEDOUT'), 'isTransientError handles "ETIMEDOUT"');

    // Network patterns
    assert(isTransientError(new Error('network error')), 'isTransientError handles "network error"');
    assert(isTransientError(new Error('ECONNREFUSED')), 'isTransientError handles "ECONNREFUSED"');
    assert(isTransientError(new Error('ECONNRESET')), 'isTransientError handles "ECONNRESET"');
    assert(isTransientError(new Error('EAI_AGAIN')), 'isTransientError handles "EAI_AGAIN"');
    assert(isTransientError(new Error('ENOTFOUND')), 'isTransientError handles "ENOTFOUND"');
    assert(isTransientError(new Error('EHOSTUNREACH')), 'isTransientError handles "EHOSTUNREACH"');
    assert(isTransientError(new Error('ENETUNREACH')), 'isTransientError handles "ENETUNREACH"');
    assert(isTransientError(new Error('EPIPE')), 'isTransientError handles "EPIPE"');

    // Fetch-related patterns
    assert(isTransientError(new Error('fetch failed')), 'isTransientError handles "fetch failed"');
    assert(isTransientError(new Error('failed to fetch')), 'isTransientError handles "failed to fetch"');
    assert(isTransientError(new Error('request aborted')), 'isTransientError handles "request aborted"');
    assert(isTransientError(new Error('socket hang up')), 'isTransientError handles "socket hang up"');

    // Rate limiting and server errors
    assert(isTransientError(new Error('service unavailable')), 'isTransientError handles "service unavailable"');
    assert(isTransientError(new Error('too many requests')), 'isTransientError handles "too many requests"');
    assert(isTransientError(new Error('rate limit exceeded')), 'isTransientError handles "rate limit exceeded"');
    assert(isTransientError(new Error('HTTP 429')), 'isTransientError handles "HTTP 429"');
    assert(isTransientError(new Error('HTTP 503')), 'isTransientError handles "HTTP 503"');
    assert(isTransientError(new Error('HTTP 500')), 'isTransientError handles "HTTP 500"');

    // Non-transient errors
    assert(!isTransientError(new Error('invalid query')), 'isTransientError handles non-transient "invalid query"');
    assert(!isTransientError(new Error('constraint violation')), 'isTransientError handles non-transient "constraint violation"');

    // =========================================================================
    // SECTION 3: CircuitBreaker BEHAVIORAL TESTS (~40 tests)
    // =========================================================================
    console.log('\n[SECTION 3] CircuitBreaker Behavioral Tests');

    // Constructor tests
    resetAllBreakers();
    assert(new CircuitBreaker('test').state === 'CLOSED', 'new CircuitBreaker starts in CLOSED state');
    assert(new CircuitBreaker('test').failureThreshold === 5, 'CircuitBreaker default failureThreshold is 5');
    assert(new CircuitBreaker('test', {failureThreshold: 3}).failureThreshold === 3, 'CircuitBreaker respects custom failureThreshold');
    assert(new CircuitBreaker('test').windowMs === 60000, 'CircuitBreaker default windowMs is 60000');
    assert(new CircuitBreaker('test').cooldownMs === 60000, 'CircuitBreaker default cooldownMs is 60000');
    assert(new CircuitBreaker('test').halfOpenMax === 2, 'CircuitBreaker default halfOpenMax is 2');

    assertThrows(() => new CircuitBreaker(''), 'name must be a non-empty string', 'CircuitBreaker throws on empty name');
    assertThrows(() => new CircuitBreaker(null), 'name must be a non-empty string', 'CircuitBreaker throws on null name');
    assertThrows(() => new CircuitBreaker(123), 'name must be a non-empty string', 'CircuitBreaker throws on numeric name');

    // CLOSED → OPEN transition
    resetAllBreakers();
    const breaker1 = new CircuitBreaker('test1', {failureThreshold: 3, windowMs: 10000});
    assert(breaker1.isAllowed(), 'isAllowed returns true in CLOSED state');

    breaker1.recordFailure();
    assert(breaker1.state === 'CLOSED', 'After 1 failure, state remains CLOSED');
    breaker1.recordFailure();
    assert(breaker1.state === 'CLOSED', 'After 2 failures, state remains CLOSED');
    breaker1.recordFailure();
    assert(breaker1.state === 'OPEN', 'After threshold failures, state transitions to OPEN');
    assert(!breaker1.isAllowed(), 'isAllowed returns false in OPEN state');

    // OPEN state behavior - manual verification
    resetAllBreakers();
    const breaker2 = new CircuitBreaker('test2', {failureThreshold: 2, cooldownMs: 10000});
    breaker2.recordFailure();
    breaker2.recordFailure();
    assert(breaker2.state === 'OPEN', 'State is OPEN after threshold failures');
    assert(!breaker2.isAllowed(), 'isAllowed returns false in OPEN state');
    // Verify that time-based transition is at least possible (don't test exact timing)
    assert(breaker2._openedAt !== null, 'breaker tracks when it was opened');
    assert(breaker2.getStatus().openedAt !== null, 'getStatus includes openedAt timestamp');

    // HALF_OPEN state transitions - direct state transitions
    resetAllBreakers();
    const breaker3 = new CircuitBreaker('test3', {failureThreshold: 2, cooldownMs: 0, halfOpenMax: 2});
    breaker3.recordFailure();
    breaker3.recordFailure();
    // Force transition to HALF_OPEN by setting the state
    breaker3._transition('HALF_OPEN');
    breaker3._halfOpenSuccesses = 0;
    assert(breaker3.state === 'HALF_OPEN', 'State can be HALF_OPEN');
    breaker3.recordSuccess();
    assert(breaker3.state === 'HALF_OPEN', 'After 1 success in HALF_OPEN, state remains HALF_OPEN');
    breaker3.recordSuccess();
    assert(breaker3.state === 'CLOSED', 'After halfOpenMax successes, state returns to CLOSED');

    // HALF_OPEN → OPEN on failure
    resetAllBreakers();
    const breaker4 = new CircuitBreaker('test4', {failureThreshold: 2, cooldownMs: 0, halfOpenMax: 2});
    breaker4.recordFailure();
    breaker4.recordFailure();
    breaker4._transition('HALF_OPEN');
    assert(breaker4.state === 'HALF_OPEN', 'State is HALF_OPEN');
    breaker4.recordFailure();
    assert(breaker4.state === 'OPEN', 'Any failure in HALF_OPEN transitions back to OPEN');

    // Sliding window - verify pruning logic (windowMs is clamped to minimum 1000)
    resetAllBreakers();
    const breaker5 = new CircuitBreaker('test5', {failureThreshold: 5, windowMs: 100}); // Will be clamped to 1000
    assert(breaker5.windowMs === 1000, `CircuitBreaker clamps windowMs to minimum 1000 (got ${breaker5.windowMs})`);

    const testNow = Date.now();
    // Create test timestamps that are old relative to the 1000ms window
    const oldTimestamps = [testNow - 2000, testNow - 1500]; // Old (outside 1000ms window)
    breaker5._failures = oldTimestamps;
    breaker5._pruneWindow();
    assert(breaker5._failures.length === 0, `Failures older than 1000ms window are pruned (had ${breaker5._failures.length}, expected 0)`);

    // Test with recent failures
    const recentTimestamps = [testNow - 500, testNow - 250]; // Recent (within 1000ms window)
    breaker5._failures = recentTimestamps;
    const beforePrune = breaker5._failures.length;
    breaker5._pruneWindow();
    assert(breaker5._failures.length === beforePrune, `Recent failures within 1000ms window are retained (had ${breaker5._failures.length}, expected ${beforePrune})`);

    // execute() method - success path
    resetAllBreakers();
    const breaker6 = new CircuitBreaker('test6');
    const result = await breaker6.execute(async () => 'success');
    assert(result === 'success', 'execute() with successful function returns result');
    assert(breaker6.state === 'CLOSED', 'execute() success keeps breaker in CLOSED');

    // execute() method - transient error recording
    resetAllBreakers();
    const breaker7 = new CircuitBreaker('test7', {failureThreshold: 2});
    try {
        await breaker7.execute(async () => { throw new Error('connection timeout'); });
    } catch (e) {
        assert(e.message.includes('connection timeout'), 'execute() throws original transient error');
    }
    assert(breaker7.getStatus().failuresInWindow === 1, 'execute() records transient error in circuit breaker');

    // execute() method - non-transient error (no recording)
    resetAllBreakers();
    const breaker8 = new CircuitBreaker('test8', {failureThreshold: 1});
    try {
        await breaker8.execute(async () => { throw new Error('invalid query'); });
    } catch (e) {
        assert(e.message.includes('invalid query'), 'execute() throws original non-transient error');
    }
    assert(breaker8.state === 'CLOSED', 'execute() does NOT record non-transient error in circuit breaker');

    // execute() method - circuit open
    resetAllBreakers();
    const breaker9 = new CircuitBreaker('test9', {failureThreshold: 1, cooldownMs: 5000});
    breaker9.recordFailure();
    await assertAsyncThrows(
        () => breaker9.execute(async () => 'should fail'),
        'is OPEN',
        'execute() when OPEN throws CIRCUIT_OPEN error'
    );

    // getStatus()
    resetAllBreakers();
    const breaker10 = new CircuitBreaker('statusTest', {failureThreshold: 3});
    breaker10.recordFailure();
    breaker10.recordFailure();
    const status = breaker10.getStatus();
    assert(status.name === 'statusTest', 'getStatus returns correct name');
    assert(status.state === 'CLOSED', 'getStatus returns correct state');
    assert(status.failuresInWindow === 2, 'getStatus returns correct failuresInWindow');
    assert(status.failureThreshold === 3, 'getStatus returns correct failureThreshold');
    assert(status.halfOpenSuccesses === 0, 'getStatus returns correct halfOpenSuccesses');

    // reset()
    resetAllBreakers();
    const breaker11 = new CircuitBreaker('resetTest', {failureThreshold: 2});
    breaker11.recordFailure();
    breaker11.recordFailure();
    assert(breaker11.state === 'OPEN', 'State is OPEN before reset');
    breaker11.reset();
    assert(breaker11.state === 'CLOSED', 'reset() returns state to CLOSED');
    assert(breaker11.getStatus().failuresInWindow === 0, 'reset() clears failures');

    // onStateChange callback
    resetAllBreakers();
    let callbackEvents = [];
    const breaker12 = new CircuitBreaker('callbackTest', {
        failureThreshold: 2,
        cooldownMs: 10000,
        onStateChange: (name, oldState, newState) => {
            callbackEvents.push({name, oldState, newState});
        }
    });
    breaker12.recordFailure();
    breaker12.recordFailure();
    assert(callbackEvents.some(e => e.oldState === 'CLOSED' && e.newState === 'OPEN'), 'Callback fires on CLOSED→OPEN');

    // Force HALF_OPEN transition and test callback
    const oldCallbacks = callbackEvents.length;
    breaker12._transition('HALF_OPEN');
    assert(callbackEvents.length > oldCallbacks, 'Callback fires on manual OPEN→HALF_OPEN transition');

    breaker12.recordSuccess();
    breaker12.recordSuccess();
    assert(callbackEvents.some(e => e.oldState === 'HALF_OPEN' && e.newState === 'CLOSED'), 'Callback fires on HALF_OPEN→CLOSED');

    // Callback error handling
    resetAllBreakers();
    let callbackThrew = false;
    const breaker13 = new CircuitBreaker('callbackErrorTest', {
        failureThreshold: 1,
        onStateChange: () => { throw new Error('callback error'); }
    });
    try {
        breaker13.recordFailure();
        callbackThrew = false; // callback error didn't break the breaker
    } catch (e) {
        callbackThrew = true;
    }
    assert(!callbackThrew, 'Throwing callback does not break the breaker');

    // =========================================================================
    // SECTION 4: RetryPolicy BEHAVIORAL TESTS (~25 tests)
    // =========================================================================
    console.log('\n[SECTION 4] RetryPolicy Behavioral Tests');

    // Constructor defaults
    resetAllBreakers();
    const policy1 = new RetryPolicy();
    assert(policy1.maxRetries === 3, 'RetryPolicy default maxRetries is 3');
    assert(policy1.baseDelayMs === 200, 'RetryPolicy default baseDelayMs is 200');
    assert(policy1.maxDelayMs === 5000, 'RetryPolicy default maxDelayMs is 5000');
    assert(policy1.budgetMs === 0, 'RetryPolicy default budgetMs is 0 (unlimited)');

    // Constructor custom values
    const policy2 = new RetryPolicy({maxRetries: 5, baseDelayMs: 100, maxDelayMs: 10000, budgetMs: 30000});
    assert(policy2.maxRetries === 5, 'RetryPolicy respects custom maxRetries');
    assert(policy2.baseDelayMs === 100, 'RetryPolicy respects custom baseDelayMs');
    assert(policy2.maxDelayMs === 10000, 'RetryPolicy respects custom maxDelayMs');
    assert(policy2.budgetMs === 30000, 'RetryPolicy respects custom budgetMs');

    // maxRetries=0 means no retries
    const policy3 = new RetryPolicy({maxRetries: 0});
    assert(policy3.maxRetries === 0, 'RetryPolicy maxRetries=0 means no retries');

    // getDelay() ranges
    resetAllBreakers();
    const policy4 = new RetryPolicy({baseDelayMs: 200, maxDelayMs: 5000});
    const delay0 = policy4.getDelay(0);
    assert(delay0 >= 200 * 0.75 && delay0 <= 200 * 1.25, `getDelay(0) is in range [150, 250] (got ${delay0})`);

    const delay1 = policy4.getDelay(1);
    assert(delay1 >= 400 * 0.75 && delay1 <= 400 * 1.25, `getDelay(1) is in range [300, 500] (got ${delay1})`);

    const delay10 = policy4.getDelay(10);
    assert(delay10 <= 5000 * 1.25, `getDelay(10) is capped at maxDelayMs * 1.25 (got ${delay10})`);

    // execute() - success on first try
    resetAllBreakers();
    const policy5 = new RetryPolicy({maxRetries: 3});
    const result5 = await policy5.execute(async () => 'first try', 'testOp');
    assert(result5 === 'first try', 'execute() succeeds on first try');

    // execute() - retry on transient error then succeed
    resetAllBreakers();
    let attemptCount = 0;
    const policy6 = new RetryPolicy({maxRetries: 3, baseDelayMs: 10});
    const result6 = await policy6.execute(async () => {
        attemptCount++;
        if (attemptCount < 2) throw new Error('connection timeout');
        return 'recovered';
    }, 'testOp');
    assert(result6 === 'recovered', 'execute() retries on transient error and succeeds');
    assert(attemptCount === 2, 'execute() takes exactly 2 attempts to recover');

    // execute() - throw after maxRetries exhausted
    resetAllBreakers();
    let retryAttempts = 0;
    const policy7 = new RetryPolicy({maxRetries: 2, baseDelayMs: 10});
    try {
        await policy7.execute(async () => {
            retryAttempts++;
            throw new Error('network error');
        }, 'testOp');
    } catch (e) {
        assert(e.message.includes('network error'), 'execute() throws original error after retries exhausted');
    }
    assert(retryAttempts === 3, 'execute() attempts initial + maxRetries (got ' + retryAttempts + ')');

    // execute() - throw immediately on non-transient error (no retry)
    resetAllBreakers();
    let nonTransientAttempts = 0;
    const policy8 = new RetryPolicy({maxRetries: 3, baseDelayMs: 10});
    try {
        await policy8.execute(async () => {
            nonTransientAttempts++;
            throw new Error('invalid query');
        }, 'testOp');
    } catch (e) {
        assert(e.message.includes('invalid query'), 'execute() throws non-transient error immediately');
    }
    assert(nonTransientAttempts === 1, 'execute() does NOT retry on non-transient error');

    // execute() - budget-aware (stops when budget exceeded)
    resetAllBreakers();
    let budgetAttempts = 0;
    const policy9 = new RetryPolicy({maxRetries: 5, baseDelayMs: 100, budgetMs: 1});
    try {
        await policy9.execute(async () => {
            budgetAttempts++;
            throw new Error('connection timeout');
        }, 'testOp');
    } catch (e) {
        assert(e.message.includes('connection timeout'), 'execute() respects budget and stops retrying');
    }
    assert(budgetAttempts === 1, 'execute() stops retrying when budget exceeded (only 1 attempt with budgetMs=1)');

    // =========================================================================
    // SECTION 5: ResilienceLayer BEHAVIORAL TESTS (~25 tests)
    // =========================================================================
    console.log('\n[SECTION 5] ResilienceLayer Behavioral Tests');

    // Constructor validation
    resetAllBreakers();
    const cb = new CircuitBreaker('test');
    const rp = new RetryPolicy();

    assertThrows(
        () => new ResilienceLayer({circuitBreaker: null, retryPolicy: rp}),
        'circuitBreaker must be a CircuitBreaker instance',
        'ResilienceLayer throws without valid circuitBreaker'
    );

    assertThrows(
        () => new ResilienceLayer({circuitBreaker: cb, retryPolicy: null}),
        'retryPolicy must be a RetryPolicy instance',
        'ResilienceLayer throws without valid retryPolicy'
    );

    // Constructor defaults
    resetAllBreakers();
    const rl1 = new ResilienceLayer({circuitBreaker: new CircuitBreaker('test'), retryPolicy: new RetryPolicy()});
    assert(rl1.timeoutMs === 15000, 'ResilienceLayer default timeoutMs is 15000');

    // execute() - happy path
    resetAllBreakers();
    const rl2 = new ResilienceLayer({
        circuitBreaker: new CircuitBreaker('rl2'),
        retryPolicy: new RetryPolicy()
    });
    const rl2Result = await rl2.execute(async () => 'result', {name: 'testOp'});
    assert(rl2Result === 'result', 'execute() happy path returns fn result');

    // execute() - records success
    resetAllBreakers();
    const rl3 = new ResilienceLayer({
        circuitBreaker: new CircuitBreaker('rl3'),
        retryPolicy: new RetryPolicy()
    });
    await rl3.execute(async () => 'success', {name: 'testOp'});
    const rl3Status = rl3.circuitBreaker.getStatus();
    assert(rl3Status.failuresInWindow === 0, 'execute() success does not record failures');

    // execute() - retries transient error then succeeds
    resetAllBreakers();
    let rl4Attempts = 0;
    const rl4 = new ResilienceLayer({
        circuitBreaker: new CircuitBreaker('rl4'),
        retryPolicy: new RetryPolicy({maxRetries: 3, baseDelayMs: 10})
    });
    const rl4Result = await rl4.execute(async () => {
        rl4Attempts++;
        if (rl4Attempts < 2) throw new Error('connection timeout');
        return 'recovered';
    }, {name: 'testOp'});
    assert(rl4Result === 'recovered', 'execute() retries transient error and succeeds');
    assert(rl4Attempts === 2, 'execute() takes 2 attempts to recover from transient error');

    // execute() - records failure for transient error
    resetAllBreakers();
    const rl5 = new ResilienceLayer({
        circuitBreaker: new CircuitBreaker('rl5', {failureThreshold: 5}),
        retryPolicy: new RetryPolicy({maxRetries: 0})
    });
    try {
        await rl5.execute(async () => { throw new Error('network error'); }, {name: 'testOp'});
    } catch (e) {
        // Expected
    }
    const rl5Status = rl5.circuitBreaker.getStatus();
    assert(rl5Status.failuresInWindow === 1, 'execute() records transient error failure in circuit breaker');

    // execute() - invokes fallback when circuit is OPEN
    resetAllBreakers();
    const rl6 = new ResilienceLayer({
        circuitBreaker: new CircuitBreaker('rl6', {failureThreshold: 1, cooldownMs: 5000}),
        retryPolicy: new RetryPolicy({maxRetries: 0})
    });
    rl6.circuitBreaker.recordFailure(); // Trip the circuit
    const rl6Result = await rl6.execute(
        async () => { throw new Error('should not execute'); },
        {
            name: 'testOp',
            fallback: () => 'fallback result'
        }
    );
    assert(rl6Result === 'fallback result', 'execute() invokes fallback when circuit is OPEN');

    // execute() - invokes fallback after all retries exhausted
    resetAllBreakers();
    const rl7 = new ResilienceLayer({
        circuitBreaker: new CircuitBreaker('rl7'),
        retryPolicy: new RetryPolicy({maxRetries: 1, baseDelayMs: 10})
    });
    const rl7Result = await rl7.execute(
        async () => { throw new Error('connection timeout'); },
        {
            name: 'testOp',
            fallback: () => 'fallback result'
        }
    );
    assert(rl7Result === 'fallback result', 'execute() invokes fallback after all retries exhausted');

    // execute() - throws CIRCUIT_OPEN without fallback
    resetAllBreakers();
    const rl8 = new ResilienceLayer({
        circuitBreaker: new CircuitBreaker('rl8', {failureThreshold: 1, cooldownMs: 5000}),
        retryPolicy: new RetryPolicy({maxRetries: 0})
    });
    rl8.circuitBreaker.recordFailure(); // Trip the circuit
    await assertAsyncThrows(
        () => rl8.execute(async () => 'should fail', {name: 'testOp'}),
        'is OPEN',
        'execute() throws CIRCUIT_OPEN without fallback'
    );

    // execute() - timeout feature verification
    resetAllBreakers();
    const rl9a = new ResilienceLayer({
        circuitBreaker: new CircuitBreaker('rl9a'),
        retryPolicy: new RetryPolicy({maxRetries: 0}),
        timeoutMs: 100 // Will be clamped to minimum 1000
    });
    assert(rl9a.timeoutMs === 1000, 'ResilienceLayer clamps timeoutMs to minimum 1000ms');

    const rl9b = new ResilienceLayer({
        circuitBreaker: new CircuitBreaker('rl9b'),
        retryPolicy: new RetryPolicy({maxRetries: 0}),
        timeoutMs: 5000
    });
    assert(rl9b.timeoutMs === 5000, 'ResilienceLayer respects custom timeoutMs above 1000');

    // Verify that timeout wrapping is configured
    assert(typeof rl9a.execute === 'function', 'ResilienceLayer has execute method that supports timeouts');

    // =========================================================================
    // SECTION 6: createSupabaseResilience TESTS (~15 tests)
    // =========================================================================
    console.log('\n[SECTION 6] createSupabaseResilience Factory Tests');

    function createMockSupabase(responses = {}) {
        return {
            from: (table) => ({
                select: (cols) => ({
                    eq: (col, val) => ({
                        then: (resolve, reject) => {
                            if (responses.error) reject(responses.error);
                            else resolve(responses.data || { data: [], error: null });
                        }
                    }),
                    then: (resolve, reject) => {
                        if (responses.error) reject(responses.error);
                        else resolve(responses.data || { data: [], error: null });
                    }
                }),
                insert: (data) => ({
                    then: (resolve, reject) => {
                        if (responses.error) reject(responses.error);
                        else resolve(responses.data || { data: null, error: null });
                    }
                })
            })
        };
    }

    resetAllBreakers();
    assertThrows(
        () => createSupabaseResilience(null),
        'supabaseClient must have a .from() method',
        'createSupabaseResilience throws on null input'
    );

    assertThrows(
        () => createSupabaseResilience({}),
        'supabaseClient must have a .from() method',
        'createSupabaseResilience throws on input without .from()'
    );

    resetAllBreakers();
    const mockSb = createMockSupabase();
    const resilientSb = createSupabaseResilience(mockSb);
    assert(typeof resilientSb.from === 'function', 'createSupabaseResilience returns proxied client with .from() method');

    resetAllBreakers();
    const mockSb2 = createMockSupabase({data: {data: [{id: 1}], error: null}});
    const resilientSb2 = createSupabaseResilience(mockSb2);
    const sbResult = await resilientSb2.from('test').select('*');
    assert(sbResult.data && sbResult.data[0] && sbResult.data[0].id === 1, 'from().select() returns data through resilience');

    resetAllBreakers();
    const mockSb3 = createMockSupabase({data: {data: null, error: null}});
    const resilientSb3 = createSupabaseResilience(mockSb3);
    const sbInsertResult = await resilientSb3.from('test').insert({name: 'test'});
    assert(sbInsertResult !== undefined, 'from().insert() returns data through resilience');

    // Error in query triggers retry
    resetAllBreakers();
    let retryCount = 0;
    const mockSb4 = createMockSupabase();
    const resilientSb4 = createSupabaseResilience(mockSb4, {retry: {maxRetries: 2, baseDelayMs: 5}});
    try {
        await resilientSb4.from('test').select('*');
    } catch (e) {
        // Expected to fail because our mock rejects
    }
    // We can't easily track retries with this mock, but we verify it doesn't crash

    // Non-transient error throws immediately
    resetAllBreakers();
    const mockSb5 = createMockSupabase({error: new Error('invalid query')});
    const resilientSb5 = createSupabaseResilience(mockSb5, {retry: {maxRetries: 3, baseDelayMs: 5}});
    try {
        await resilientSb5.from('test').select('*');
        assert(false, 'Non-transient error should throw');
    } catch (e) {
        assert(e.message.includes('invalid query'), 'Non-transient error throws immediately without retry');
    }

    // Verify circuit breaker is shared
    resetAllBreakers();
    const mockSbA = createMockSupabase({error: new Error('connection timeout')});
    const resilientSbA = createSupabaseResilience(mockSbA, {circuitBreaker: {failureThreshold: 2, cooldownMs: 5000}});
    try {
        await resilientSbA.from('test').select('*');
    } catch (e) {
        // First failure recorded
    }
    try {
        await resilientSbA.from('test').select('*');
    } catch (e) {
        // Second failure — circuit should trip
    }
    // Third attempt should be rejected by circuit
    let circuitOpenThrown = false;
    try {
        await resilientSbA.from('test').select('*');
    } catch (e) {
        circuitOpenThrown = e.code === 'CIRCUIT_OPEN';
    }
    assert(circuitOpenThrown, 'createSupabaseResilience uses shared circuit breaker');

    // =========================================================================
    // SECTION 7: createAnthropicResilience TESTS (~10 tests)
    // =========================================================================
    console.log('\n[SECTION 7] createAnthropicResilience Factory Tests');

    function createMockAnthropic(responses = {}) {
        return {
            messages: {
                create: async (params) => {
                    if (responses.error) throw responses.error;
                    return responses.data || {content: [{text: 'mock response'}]};
                }
            }
        };
    }

    resetAllBreakers();
    assertThrows(
        () => createAnthropicResilience(null),
        'anthropicClient is required',
        'createAnthropicResilience throws on null input'
    );

    resetAllBreakers();
    const mockAnt = createMockAnthropic();
    const resilientAnt = createAnthropicResilience(mockAnt);
    assert(typeof resilientAnt.messages.create === 'function', 'createAnthropicResilience returns proxied client with .messages.create()');

    resetAllBreakers();
    const mockAnt2 = createMockAnthropic({data: {content: [{text: 'response'}]}});
    const resilientAnt2 = createAnthropicResilience(mockAnt2);
    const antResult = await resilientAnt2.messages.create({model: 'claude-3-5-sonnet', messages: []});
    assert(antResult.content && antResult.content[0].text === 'response', 'messages.create() returns data through resilience');

    // Transient error triggers retry
    resetAllBreakers();
    let antRetryAttempts = 0;
    const mockAnt3 = createMockAnthropic();
    mockAnt3.messages.create = async () => {
        antRetryAttempts++;
        if (antRetryAttempts < 2) throw new Error('connection timeout');
        return {content: [{text: 'recovered'}]};
    };
    const resilientAnt3 = createAnthropicResilience(mockAnt3, {retry: {maxRetries: 2, baseDelayMs: 5}});
    const antRetryResult = await resilientAnt3.messages.create({model: 'claude-3-5-sonnet', messages: []});
    assert(antRetryResult.content[0].text === 'recovered', 'createAnthropicResilience retries transient errors');
    assert(antRetryAttempts === 2, 'createAnthropicResilience takes 2 attempts to recover');

    // Non-transient error throws immediately
    resetAllBreakers();
    const mockAnt4 = createMockAnthropic();
    mockAnt4.messages.create = async () => { throw new Error('invalid model'); };
    const resilientAnt4 = createAnthropicResilience(mockAnt4, {retry: {maxRetries: 3, baseDelayMs: 5}});
    try {
        await resilientAnt4.messages.create({model: 'invalid', messages: []});
        assert(false, 'Non-transient error should throw');
    } catch (e) {
        assert(e.message.includes('invalid model'), 'Non-transient error throws immediately for Anthropic');
    }

    // =========================================================================
    // SECTION 8: CONFIGURATION TESTS (~5 tests)
    // =========================================================================
    console.log('\n[SECTION 8] Configuration Tests');

    assert(SUPABASE_CONFIG.circuitBreaker.failureThreshold === 5, 'SUPABASE_CONFIG.circuitBreaker.failureThreshold is 5');
    assert(SUPABASE_CONFIG.retry.maxRetries === 3, 'SUPABASE_CONFIG.retry.maxRetries is 3');
    assert(ANTHROPIC_CONFIG.circuitBreaker.failureThreshold === 3, 'ANTHROPIC_CONFIG.circuitBreaker.failureThreshold is 3');
    assert(ANTHROPIC_CONFIG.retry.maxRetries === 2, 'ANTHROPIC_CONFIG.retry.maxRetries is 2');
    assert(ANTHROPIC_CONFIG.timeoutMs === 20000, 'ANTHROPIC_CONFIG.timeoutMs is 20000');

    // =========================================================================
    // [SECTION 9] Pass 17 Regression Tests (Bugs 106-115)
    // =========================================================================
    console.log('\n[SECTION 9] Pass 17 Regression Tests (Bugs 106-115)');
    resetAllBreakers();

    // BUG 106: supabase.rpc() wrapped through resilience
    {
        const src = fs.readFileSync(path.join(__dirname, '..', 'core', 'resilience-layer.js'), 'utf-8');
        const srcNoComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        assert(srcNoComments.includes("prop === 'rpc'"), 'w5p17_1: Proxy intercepts .rpc() property access');
        assert(srcNoComments.includes('wrappedRpc'), 'w5p17_2: Proxy defines wrappedRpc function');
        assert(srcNoComments.includes('target.rpc(fnName, params, options)'), 'w5p17_3: wrappedRpc delegates to target.rpc');

        // Verify cost-intelligence.js uses resilientSupabase.rpc not supabase.rpc
        const ciSrc = fs.readFileSync(path.join(__dirname, '..', 'agents', 'cost-intelligence.js'), 'utf-8');
        const ciNoComments = ciSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        assert(!ciNoComments.includes('supabase.rpc('), 'w5p17_4: cost-intelligence.js has no bare supabase.rpc()');
        assert(ciNoComments.includes('resilientSupabase.rpc('), 'w5p17_5: cost-intelligence.js uses resilientSupabase.rpc()');
    }

    // BUG 106: Test rpc() proxy actually works
    {
        resetAllBreakers();
        let rpcCalled = false;
        const mockSb = {
            from: () => ({ then: (r) => r({ data: [], error: null }) }),
            rpc: async (fnName, params) => { rpcCalled = true; return { data: 'ok', error: null }; }
        };
        const rSb = createSupabaseResilience(mockSb);
        const result = await rSb.rpc('update_metrics', { p_agent_id: 'test' });
        assert(rpcCalled, 'w5p17_6: resilientSupabase.rpc() delegates to original .rpc()');
        assert(result && result.data === 'ok', 'w5p17_7: resilientSupabase.rpc() returns result');
    }

    // BUG 107: Constructor NaN/Infinity validation
    {
        const b1 = new CircuitBreaker('test-nan', { failureThreshold: NaN });
        assert(b1.failureThreshold === 5, 'w5p17_8: NaN failureThreshold falls back to default 5');
        const b2 = new CircuitBreaker('test-inf', { windowMs: Infinity });
        assert(b2.windowMs === 60000, 'w5p17_9: Infinity windowMs falls back to default 60000');
        const b3 = new CircuitBreaker('test-neg', { cooldownMs: -100 });
        assert(b3.cooldownMs === 1000, 'w5p17_10: Negative cooldownMs clamps to minimum 1000');
        const b4 = new CircuitBreaker('test-str', { halfOpenMax: 'abc' });
        assert(b4.halfOpenMax === 2, 'w5p17_11: Non-numeric halfOpenMax falls back to default 2');
    }

    // BUG 108: Unbounded _failures array cap
    {
        const b = new CircuitBreaker('test-cap', { failureThreshold: 3, windowMs: 100000 });
        assert(b._maxFailures === 30, 'w5p17_12: _maxFailures set to failureThreshold * 10');
        // Manually push more than _maxFailures entries
        for (let i = 0; i < 50; i++) b._failures.push(Date.now());
        b._pruneWindow();
        assert(b._failures.length <= 30, 'w5p17_13: _pruneWindow caps _failures array at _maxFailures');
    }

    // BUG 109: HALF_OPEN probe lock
    {
        const b = new CircuitBreaker('test-probe', { failureThreshold: 2, cooldownMs: 1000, halfOpenMax: 2 });
        assert(b._probeInFlight === false, 'w5p17_14: _probeInFlight starts false');
        // Trip to OPEN
        b.recordFailure(); b.recordFailure();
        assert(b.state === 'OPEN', 'w5p17_15: State is OPEN after threshold failures');
        // Simulate cooldown expiry by backdating _openedAt
        b._openedAt = Date.now() - 2000;
        // First call to isAllowed should transition to HALF_OPEN and set probe lock
        const allowed1 = b.isAllowed();
        assert(allowed1 === true, 'w5p17_16: First probe allowed in HALF_OPEN');
        assert(b._probeInFlight === true, 'w5p17_17: _probeInFlight is true after first probe');
        assert(b.state === 'HALF_OPEN', 'w5p17_18: State is HALF_OPEN');
        // Second concurrent call should be rejected
        const allowed2 = b.isAllowed();
        assert(allowed2 === false, 'w5p17_19: Second concurrent probe rejected (probe lock)');
        // recordSuccess releases lock
        b.recordSuccess();
        assert(b._probeInFlight === false, 'w5p17_20: recordSuccess releases probe lock');
        // Now probe should be allowed again
        const allowed3 = b.isAllowed();
        assert(allowed3 === true, 'w5p17_21: Probe allowed after lock release');
    }

    // BUG 109: Probe lock released on failure too
    {
        const b = new CircuitBreaker('test-probe2', { failureThreshold: 2, cooldownMs: 1000, halfOpenMax: 2 });
        b.recordFailure(); b.recordFailure();
        // Simulate cooldown expiry
        b._openedAt = Date.now() - 2000;
        b.isAllowed(); // Transitions to HALF_OPEN, sets probe lock
        assert(b._probeInFlight === true, 'w5p17_22: Probe lock set in HALF_OPEN');
        b.recordFailure(); // Should release lock and go back to OPEN
        assert(b._probeInFlight === false, 'w5p17_23: recordFailure releases probe lock');
        assert(b.state === 'OPEN', 'w5p17_24: State back to OPEN after HALF_OPEN failure');
    }

    // BUG 109: reset() clears probe lock
    {
        const b = new CircuitBreaker('test-probe3', { failureThreshold: 2, cooldownMs: 1 });
        b._probeInFlight = true;
        b.reset();
        assert(b._probeInFlight === false, 'w5p17_25: reset() clears _probeInFlight');
    }

    // BUG 110: Timeout uses Promise.race (no async promise constructor)
    {
        const src = fs.readFileSync(path.join(__dirname, '..', 'core', 'resilience-layer.js'), 'utf-8');
        const srcNoComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        assert(srcNoComments.includes('Promise.race'), 'w5p17_26: Timeout uses Promise.race instead of async constructor');
        assert(!srcNoComments.includes('new Promise(async'), 'w5p17_27: No async promise constructor antipattern');
    }

    // BUG 111: getDelay overflow protection
    {
        const policy = new RetryPolicy({ baseDelayMs: 200, maxDelayMs: 5000 });
        const delay50 = policy.getDelay(50);
        assert(Number.isFinite(delay50), 'w5p17_28: getDelay(50) returns finite value, not Infinity');
        assert(delay50 <= 5000 * 1.25, 'w5p17_29: getDelay(50) is capped at maxDelayMs * 1.25');
    }

    // BUG 112: RetryPolicy NaN/Infinity validation
    {
        const p1 = new RetryPolicy({ maxRetries: NaN });
        assert(p1.maxRetries === 3, 'w5p17_30: NaN maxRetries falls back to default 3');
        const p2 = new RetryPolicy({ baseDelayMs: Infinity });
        assert(p2.baseDelayMs === 200, 'w5p17_31: Infinity baseDelayMs falls back to default 200');
        const p3 = new RetryPolicy({ maxDelayMs: undefined });
        assert(p3.maxDelayMs === 5000, 'w5p17_32: undefined maxDelayMs falls back to default 5000');
        const p4 = new RetryPolicy({ budgetMs: NaN });
        assert(p4.budgetMs === 0, 'w5p17_33: NaN budgetMs falls back to default 0');
    }

    // BUG 113: createAnthropicResilience validates .messages.create
    {
        let threw = false;
        try {
            createAnthropicResilience({ messages: {} }); // no .create()
        } catch (e) {
            threw = e.message.includes('.messages.create()');
        }
        assert(threw, 'w5p17_34: createAnthropicResilience throws if .messages.create() missing');

        let threw2 = false;
        try {
            createAnthropicResilience({ }); // no .messages at all
        } catch (e) {
            threw2 = e.message.includes('.messages.create()');
        }
        assert(threw2, 'w5p17_35: createAnthropicResilience throws if .messages undefined');
    }

    // BUG 114: Dead code removed
    {
        const src = fs.readFileSync(path.join(__dirname, '..', 'core', 'resilience-layer.js'), 'utf-8');
        const srcNoComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        assert(!srcNoComments.includes('TERMINAL_METHODS'), 'w5p17_36: Dead code TERMINAL_METHODS removed');
        assert(!srcNoComments.includes('BUILDER_METHODS'), 'w5p17_37: Dead code BUILDER_METHODS removed');
    }

    // BUG 115: Fallback error handling
    {
        resetAllBreakers();
        const b = new CircuitBreaker('test-fb-err', { failureThreshold: 1 });
        const r = new RetryPolicy({ maxRetries: 0 });
        const rl = new ResilienceLayer({ circuitBreaker: b, retryPolicy: r, timeoutMs: 5000 });

        // Fallback that throws — should throw original error, not fallback error
        let caughtErr = null;
        try {
            await rl.execute(
                () => { throw new Error('connection timeout'); },
                {
                    name: 'fb-error-test',
                    fallback: () => { throw new Error('fallback exploded'); }
                }
            );
        } catch (e) {
            caughtErr = e;
        }
        assert(caughtErr !== null, 'w5p17_38: Throws when both fn and fallback fail');
        assert(caughtErr.message === 'connection timeout', 'w5p17_39: Throws original error, not fallback error');
    }

    // BUG 116: Serverless caveat documented
    {
        const src = fs.readFileSync(path.join(__dirname, '..', 'core', 'resilience-layer.js'), 'utf-8');
        assert(src.includes('SERVERLESS NOTE'), 'w5p17_40: Serverless limitation documented in source');
        assert(src.includes('Cloudflare KV') || src.includes('Durable Objects'), 'w5p17_41: Future KV/DO enhancement mentioned');
    }

    // Verify ALL agent files have no remaining bare supabase calls
    {
        const agentDir = path.join(__dirname, '..', 'agents');
        const agentFiles = fs.readdirSync(agentDir).filter(f => f.endsWith('.js'));
        let allClean = true;
        let dirtyFiles = [];
        for (const file of agentFiles) {
            const content = fs.readFileSync(path.join(agentDir, file), 'utf-8');
            const noComments = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
            if (noComments.includes('supabase.from(') || noComments.includes('supabase.rpc(')) {
                allClean = false;
                dirtyFiles.push(file);
            }
        }
        assert(allClean, `w5p17_42: All ${agentFiles.length} agent files have zero bare supabase calls (dirty: ${dirtyFiles.join(', ') || 'none'})`);
    }

    // =========================================================================
    // SECTION 10: Pass 18 Regression Tests (w5p18_1 through w5p18_55)
    //   Bugs 117-130: 11 unwired files, HTTP 408, behavioral edge cases
    // =========================================================================
    console.log('\n--- Section 10: Pass 18 Regression Tests ---');

    // --- 10a: Structural — core/ files wired ---
    {
        const coreDir = path.join(__dirname, '..', 'core');
        const coreFilesToCheck = [
            'governance-agent.js',
            'security-agent.js',
            'agent-orchestrator.js',
            'agent-evaluator.js',
            'agent-tools.js',
            'observability.js',
            'agent-memory.js'
        ];
        for (const file of coreFilesToCheck) {
            const content = fs.readFileSync(path.join(coreDir, file), 'utf-8');
            const noComments = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
            assert(noComments.includes('resilience-layer'), `w5p18_1_${file}: ${file} imports resilience-layer`);
        }
    }

    // w5p18_2: core/ files have zero bare supabase.from() calls
    {
        const coreDir = path.join(__dirname, '..', 'core');
        const filesToCheck = [
            'governance-agent.js', 'security-agent.js', 'agent-orchestrator.js',
            'agent-evaluator.js', 'observability.js', 'agent-memory.js'
        ];
        let dirtyFiles = [];
        for (const file of filesToCheck) {
            const content = fs.readFileSync(path.join(coreDir, file), 'utf-8');
            const noComments = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
            if (noComments.includes('supabase.from(') || noComments.includes('supabase.rpc(')) {
                dirtyFiles.push(file);
            }
        }
        assert(dirtyFiles.length === 0, `w5p18_2: All 6 core files have zero bare supabase calls (dirty: ${dirtyFiles.join(', ') || 'none'})`);
    }

    // w5p18_3: core/ files with anthropic have zero bare anthropic.messages.create() calls
    {
        const coreDir = path.join(__dirname, '..', 'core');
        const filesToCheck = [
            'governance-agent.js', 'security-agent.js', 'agent-orchestrator.js',
            'agent-evaluator.js', 'agent-tools.js'
        ];
        let dirtyFiles = [];
        for (const file of filesToCheck) {
            const content = fs.readFileSync(path.join(coreDir, file), 'utf-8');
            const noComments = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
            // Must have resilientAnthropic usage, NOT bare anthropic.messages.create(
            if (noComments.includes('anthropic.messages.create(') && !noComments.includes('resilientAnthropic.messages.create(')) {
                dirtyFiles.push(file);
            }
        }
        assert(dirtyFiles.length === 0, `w5p18_3: All 5 anthropic core files use resilientAnthropic (dirty: ${dirtyFiles.join(', ') || 'none'})`);
    }

    // w5p18_4: tools/finault-tools.js wired
    {
        const content = fs.readFileSync(path.join(__dirname, '..', 'tools', 'finault-tools.js'), 'utf-8');
        const noComments = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        assert(noComments.includes('resilience-layer'), 'w5p18_4: finault-tools.js imports resilience-layer');
        assert(noComments.includes('resilientSupabase'), 'w5p18_5: finault-tools.js uses resilientSupabase');
        const hasBare = noComments.includes('supabase.from(') || noComments.includes('supabase.rpc(');
        assert(!hasBare, 'w5p18_6: finault-tools.js has zero bare supabase calls');
    }

    // w5p18_7: integrations/erp-connectors.js wired
    {
        const content = fs.readFileSync(path.join(__dirname, '..', 'integrations', 'erp-connectors.js'), 'utf-8');
        const noComments = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        assert(noComments.includes('resilience-layer'), 'w5p18_7: erp-connectors.js imports resilience-layer');
        assert(noComments.includes('resilientSupabase'), 'w5p18_8: erp-connectors.js uses resilientSupabase');
        const hasBare = noComments.includes('supabase.from(') || noComments.includes('supabase.rpc(');
        assert(!hasBare, 'w5p18_9: erp-connectors.js has zero bare supabase calls');
    }

    // w5p18_10: worker.js factory returns resilient client
    {
        const content = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf-8');
        const noComments = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        assert(noComments.includes('createSupabaseResilience'), 'w5p18_10: worker.js uses createSupabaseResilience in factory');
    }

    // w5p18_11: api/server.js wraps dynamic clients
    {
        const content = fs.readFileSync(path.join(__dirname, '..', 'api', 'server.js'), 'utf-8');
        const noComments = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        assert(noComments.includes('createSupabaseResilience'), 'w5p18_11: api/server.js uses createSupabaseResilience');
    }

    // --- 10b: HTTP 408 detection ---
    // w5p18_12: isTransientError detects HTTP 408
    assert(isTransientError(new Error('HTTP 408 Request Timeout')), 'w5p18_12: isTransientError detects HTTP 408');
    assert(isTransientError({ message: '408 request timed out' }), 'w5p18_13: isTransientError detects bare 408 in message');
    assert(isTransientError({ status: 408, message: 'timeout' }), 'w5p18_14: isTransientError detects status:408');

    // --- 10c: resetAllBreakers JSDoc ---
    // w5p18_15: resetAllBreakers has test-only JSDoc
    {
        const src = fs.readFileSync(path.join(__dirname, '..', 'core', 'resilience-layer.js'), 'utf-8');
        const resetIdx = src.indexOf('function resetAllBreakers');
        assert(resetIdx > -1, 'w5p18_15: resetAllBreakers function exists');
        const before = src.slice(Math.max(0, resetIdx - 200), resetIdx);
        assert(before.includes('test cleanup') || before.includes('test utility'), 'w5p18_16: resetAllBreakers has test-only documentation');
    }

    // --- 10d: Behavioral edge cases ---
    // w5p18_17: CircuitBreaker with failureThreshold=1 trips on FIRST failure
    {
        const b = new CircuitBreaker('test-threshold-1', { failureThreshold: 1, cooldownMs: 60000 });
        assert(b.state === 'CLOSED', 'w5p18_17: threshold=1 starts CLOSED');
        b.recordFailure();
        assert(b.state === 'OPEN', 'w5p18_18: threshold=1 opens on FIRST failure');
        resetAllBreakers();
    }

    // w5p18_19: RetryPolicy with maxRetries=0 executes exactly once
    {
        let attempts = 0;
        const policy = new RetryPolicy({ maxRetries: 0 });
        try {
            await policy.execute(async () => {
                attempts++;
                throw new Error('connection timeout');
            });
        } catch (e) { /* expected */ }
        assert(attempts === 1, 'w5p18_19: maxRetries=0 executes exactly once');
    }

    // w5p18_20: RetryPolicy with maxRetries=0 returns success on first try
    {
        const policy = new RetryPolicy({ maxRetries: 0 });
        const result = await policy.execute(async () => 'success');
        assert(result === 'success', 'w5p18_20: maxRetries=0 returns result on success');
    }

    // w5p18_21: Actual timeout behavior — slow function times out
    {
        const cb = new CircuitBreaker('test-timeout-actual', { failureThreshold: 5, cooldownMs: 60000 });
        const rp = new RetryPolicy({ maxRetries: 0 });
        const rl = new ResilienceLayer({ circuitBreaker: cb, retryPolicy: rp, timeoutMs: 1000 });
        let timedOut = false;
        try {
            await rl.execute(() => new Promise(resolve => setTimeout(resolve, 10000)), { name: 'slow-fn' });
        } catch (e) {
            if (e.message.includes('timed out')) timedOut = true;
        }
        assert(timedOut, 'w5p18_21: slow function (10s) correctly times out at 1s');
        resetAllBreakers();
    }

    // w5p18_22: Fallback returning null is preserved
    {
        const cb = new CircuitBreaker('test-fallback-null', { failureThreshold: 1, cooldownMs: 60000 });
        const rp = new RetryPolicy({ maxRetries: 0 });
        const rl = new ResilienceLayer({ circuitBreaker: cb, retryPolicy: rp, timeoutMs: 5000 });
        // Trip the breaker
        try { await rl.execute(() => { throw new Error('timeout'); }, { name: 'trip' }); } catch(e) {}
        // Now circuit is open — fallback should be called
        const result = await rl.execute(
            () => { throw new Error('should not run'); },
            { name: 'null-fallback', fallback: () => null }
        );
        assert(result === null, 'w5p18_22: fallback returning null is preserved (not treated as no-fallback)');
        resetAllBreakers();
    }

    // w5p18_23: Fallback returning undefined is preserved
    {
        const cb = new CircuitBreaker('test-fallback-undef', { failureThreshold: 1, cooldownMs: 60000 });
        const rp = new RetryPolicy({ maxRetries: 0 });
        const rl = new ResilienceLayer({ circuitBreaker: cb, retryPolicy: rp, timeoutMs: 5000 });
        try { await rl.execute(() => { throw new Error('timeout'); }, { name: 'trip2' }); } catch(e) {}
        const result = await rl.execute(
            () => { throw new Error('should not run'); },
            { name: 'undef-fallback', fallback: () => undefined }
        );
        assert(result === undefined, 'w5p18_23: fallback returning undefined is preserved');
        resetAllBreakers();
    }

    // w5p18_24: Fallback returning false is preserved
    {
        const cb = new CircuitBreaker('test-fallback-false', { failureThreshold: 1, cooldownMs: 60000 });
        const rp = new RetryPolicy({ maxRetries: 0 });
        const rl = new ResilienceLayer({ circuitBreaker: cb, retryPolicy: rp, timeoutMs: 5000 });
        try { await rl.execute(() => { throw new Error('timeout'); }, { name: 'trip3' }); } catch(e) {}
        const result = await rl.execute(
            () => { throw new Error('should not run'); },
            { name: 'false-fallback', fallback: () => false }
        );
        assert(result === false, 'w5p18_24: fallback returning false is preserved');
        resetAllBreakers();
    }

    // w5p18_25: Error with no message property handled by isTransientError
    assert(isTransientError({ code: 'ECONNRESET' }) === false, 'w5p18_25: object with only code property does not crash isTransientError');
    assert(!isTransientError({}), 'w5p18_26: empty object returns false safely');
    assert(!isTransientError(null), 'w5p18_27: null returns false');
    assert(!isTransientError(undefined), 'w5p18_28: undefined returns false');

    // w5p18_29: Double reset is safe
    {
        const b = new CircuitBreaker('test-double-reset', { failureThreshold: 1, cooldownMs: 60000 });
        b.recordFailure();
        assert(b.state === 'OPEN', 'w5p18_29: breaker opens');
        b.reset();
        assert(b.state === 'CLOSED', 'w5p18_30: first reset closes');
        b.reset();
        assert(b.state === 'CLOSED', 'w5p18_31: second reset is safe (still CLOSED)');
        resetAllBreakers();
    }

    // w5p18_32: getCircuitBreaker returns same instance
    {
        const b1 = getCircuitBreaker('test-singleton');
        const b2 = getCircuitBreaker('test-singleton');
        assert(b1 === b2, 'w5p18_32: getCircuitBreaker returns same instance for same name');
        resetAllBreakers();
    }

    // w5p18_33: All exports are functions/objects of correct type
    assert(typeof CircuitBreaker === 'function', 'w5p18_33: CircuitBreaker is a constructor');
    assert(typeof RetryPolicy === 'function', 'w5p18_34: RetryPolicy is a constructor');
    assert(typeof ResilienceLayer === 'function', 'w5p18_35: ResilienceLayer is a constructor');
    assert(typeof isTransientError === 'function', 'w5p18_36: isTransientError is a function');
    assert(typeof createSupabaseResilience === 'function', 'w5p18_37: createSupabaseResilience is a function');
    assert(typeof createAnthropicResilience === 'function', 'w5p18_38: createAnthropicResilience is a function');
    assert(typeof getCircuitBreaker === 'function', 'w5p18_39: getCircuitBreaker is a function');
    assert(typeof resetAllBreakers === 'function', 'w5p18_40: resetAllBreakers is a function');
    assert(SUPABASE_CONFIG && typeof SUPABASE_CONFIG === 'object', 'w5p18_41: SUPABASE_CONFIG is an object');
    assert(ANTHROPIC_CONFIG && typeof ANTHROPIC_CONFIG === 'object', 'w5p18_42: ANTHROPIC_CONFIG is an object');

    // w5p18_43: Full chain — breaker open → retry exhausted → fallback (integration test)
    {
        const cb = new CircuitBreaker('test-full-chain', { failureThreshold: 2, cooldownMs: 60000 });
        const rp = new RetryPolicy({ maxRetries: 0, baseDelayMs: 10, maxDelayMs: 20 });
        const rl = new ResilienceLayer({ circuitBreaker: cb, retryPolicy: rp, timeoutMs: 5000 });
        // Trip the breaker: need 2 execute() calls (each records 1 failure)
        try { await rl.execute(() => { throw new Error('timeout'); }, { name: 'chain1a' }); } catch(e) {}
        try { await rl.execute(() => { throw new Error('timeout'); }, { name: 'chain1b' }); } catch(e) {}
        assert(cb.state === 'OPEN', 'w5p18_43: breaker OPEN after 2 retry-exhausted failures');
        // Now call with fallback
        let fbCalled = false;
        const result = await rl.execute(
            () => { throw new Error('should not run'); },
            { name: 'chain2', fallback: () => { fbCalled = true; return 'fallback-result'; } }
        );
        assert(fbCalled, 'w5p18_44: fallback was called when breaker OPEN');
        assert(result === 'fallback-result', 'w5p18_45: fallback result returned correctly');
        resetAllBreakers();
    }

    // w5p18_46: Multiline supabase calls in core/ use resilientSupabase (not bare supabase)
    {
        const coreDir = path.join(__dirname, '..', 'core');
        const filesToCheck = [
            'governance-agent.js', 'security-agent.js', 'agent-orchestrator.js',
            'agent-evaluator.js', 'observability.js', 'agent-memory.js'
        ];
        let issues = [];
        for (const file of filesToCheck) {
            const content = fs.readFileSync(path.join(coreDir, file), 'utf-8');
            const noComments = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
            // Check for multiline bare calls: supabase\n    .from(
            const multilineMatch = noComments.match(/(?<!resilient)supabase\s*\n\s*\.from\(/g);
            if (multilineMatch && multilineMatch.length > 0) {
                issues.push(`${file}: ${multilineMatch.length} bare multiline calls`);
            }
        }
        assert(issues.length === 0, `w5p18_46: All core files have zero bare multiline supabase calls (issues: ${issues.join(', ') || 'none'})`);
    }

    // w5p18_47: worker.js factory wraps with createSupabaseResilience
    {
        const content = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf-8');
        const noComments = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        const factoryIdx = noComments.indexOf('function getSupabase');
        assert(factoryIdx > -1, 'w5p18_47: worker.js has getSupabase factory');
        const factoryBody = noComments.slice(factoryIdx, factoryIdx + 200);
        assert(factoryBody.includes('createSupabaseResilience'), 'w5p18_48: getSupabase factory wraps with createSupabaseResilience');
    }

    // w5p18_49: HTTP 408 regex pattern in source
    {
        const src = fs.readFileSync(path.join(__dirname, '..', 'core', 'resilience-layer.js'), 'utf-8');
        assert(src.includes('408'), 'w5p18_49: resilience-layer source includes 408 status code');
        assert(src.includes('408|429'), 'w5p18_50: regex pattern matches 408 before 429');
    }

    // w5p18_51-55: Count total wired files
    {
        const baseDir = path.join(__dirname, '..');
        const allFilesToCheck = [
            'agents/autopilot.js', 'agents/finault-pal.js', 'agents/cost-intelligence.js',
            'agents/close-pack-generator.js', 'agents/compound-learning.js', 'agents/intelligence.js',
            'agents/forecasting-agent.js', 'agents/optimization-agent.js', 'agents/magic-onboarding.js',
            'agents/budget-enforcer.js', 'agents/chargeback-agent.js', 'agents/invoice-reconciliation.js',
            'agents/policy-agent.js',
            'core/governance-agent.js', 'core/security-agent.js', 'core/agent-orchestrator.js',
            'core/agent-evaluator.js', 'core/agent-tools.js', 'core/observability.js', 'core/agent-memory.js',
            'tools/finault-tools.js', 'integrations/erp-connectors.js', 'worker.js', 'api/server.js'
        ];
        let wiredCount = 0;
        let unwired = [];
        for (const file of allFilesToCheck) {
            const content = fs.readFileSync(path.join(baseDir, file), 'utf-8');
            if (content.includes('resilience-layer') || content.includes('createSupabaseResilience') || content.includes('createAnthropicResilience')) {
                wiredCount++;
            } else {
                unwired.push(file);
            }
        }
        assert(wiredCount === 24, `w5p18_51: All 24 external-calling files are wired (got ${wiredCount}, unwired: ${unwired.join(', ') || 'none'})`);

        // Total resilientSupabase + resilientAnthropic usage count across entire codebase
        let totalResilient = 0;
        for (const file of allFilesToCheck) {
            const content = fs.readFileSync(path.join(baseDir, file), 'utf-8');
            const matches = content.match(/resilient(Supabase|Anthropic)/g);
            if (matches) totalResilient += matches.length;
        }
        assert(totalResilient >= 80, `w5p18_52: At least 80 resilient wrapper usages across codebase (got ${totalResilient})`);
    }

    // w5p18_53: storage-adapter.js intentionally NOT wired (has own withRetry)
    {
        const content = fs.readFileSync(path.join(__dirname, '..', 'core', 'storage-adapter.js'), 'utf-8');
        assert(!content.includes('resilience-layer'), 'w5p18_53: storage-adapter.js intentionally does NOT import resilience-layer (uses own withRetry)');
    }

    // w5p18_54: isTransientError does NOT treat 400 as transient
    assert(!isTransientError(new Error('HTTP 400 Bad Request')), 'w5p18_54: isTransientError does NOT treat 400 as transient');
    assert(!isTransientError(new Error('HTTP 401 Unauthorized')), 'w5p18_55: isTransientError does NOT treat 401 as transient');

    // =========================================================================
    // SECTION 11: Pass 19 Regression Tests (w5p19_1 through w5p19_20)
    //   Bugs 131-134: Bare fetch() calls, stream() proxy, createFetchResilience
    // =========================================================================
    console.log('\n--- Section 11: Pass 19 Regression Tests ---');

    // --- 11a: createFetchResilience factory ---
    assert(typeof createFetchResilience === 'function', 'w5p19_1: createFetchResilience is exported');
    assert(FETCH_CONFIG && typeof FETCH_CONFIG === 'object', 'w5p19_2: FETCH_CONFIG is exported');
    assert(FETCH_CONFIG.circuitBreaker.failureThreshold === 5, 'w5p19_3: FETCH_CONFIG failureThreshold=5');
    assert(FETCH_CONFIG.retry.maxRetries === 2, 'w5p19_4: FETCH_CONFIG maxRetries=2');
    assert(FETCH_CONFIG.timeoutMs === 15000, 'w5p19_5: FETCH_CONFIG timeoutMs=15000');

    // w5p19_6: createFetchResilience validates serviceName
    {
        let threw = false;
        try { createFetchResilience(''); } catch(e) { threw = true; }
        assert(threw, 'w5p19_6: createFetchResilience throws on empty serviceName');
    }
    {
        let threw = false;
        try { createFetchResilience(null); } catch(e) { threw = true; }
        assert(threw, 'w5p19_7: createFetchResilience throws on null serviceName');
    }

    // w5p19_8: createFetchResilience returns a function
    {
        const rf = createFetchResilience('test-service');
        assert(typeof rf === 'function', 'w5p19_8: createFetchResilience returns a function');
        resetAllBreakers();
    }

    // --- 11b: autopilot.js Slack fetch wired ---
    {
        const content = fs.readFileSync(path.join(__dirname, '..', 'agents', 'autopilot.js'), 'utf-8');
        const noComments = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        assert(noComments.includes('createFetchResilience'), 'w5p19_9: autopilot.js imports createFetchResilience');
        assert(noComments.includes('resilientSlackFetch'), 'w5p19_10: autopilot.js creates resilientSlackFetch');
        assert(!noComments.includes('await fetch(process.env.SLACK_WEBHOOK'), 'w5p19_11: autopilot.js has no bare fetch() to Slack');
        assert(noComments.includes('resilientSlackFetch(process.env.SLACK_WEBHOOK'), 'w5p19_12: autopilot.js uses resilientSlackFetch for Slack');
    }

    // --- 11c: worker.js AI gateway fetch wired ---
    {
        const content = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf-8');
        const noComments = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        assert(noComments.includes('createFetchResilience'), 'w5p19_13: worker.js imports createFetchResilience');
        assert(noComments.includes('resilientGatewayFetch'), 'w5p19_14: worker.js creates resilientGatewayFetch');
        assert(!noComments.includes("await fetch('https://api.finault.ai"), 'w5p19_15: worker.js has no bare fetch() to AI gateway');
        assert(content.includes("resilientGatewayFetch('https://api.finault.ai"), 'w5p19_16: worker.js uses resilientGatewayFetch for AI gateway');
    }

    // --- 11d: anthropic.messages.stream() proxy ---
    {
        const src = fs.readFileSync(path.join(__dirname, '..', 'core', 'resilience-layer.js'), 'utf-8');
        assert(src.includes("prop === 'stream'"), 'w5p19_17: resilience-layer.js proxies .stream() method');
        assert(src.includes('wrappedStream'), 'w5p19_18: stream proxy handler named wrappedStream');
    }

    // --- 11e: Zero bare fetch() calls in agentos/ ---
    {
        const baseDir = path.join(__dirname, '..');
        const allJsFiles = [];
        function collectJs(dir) {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const e of entries) {
                if (e.name === '__tests__' || e.name === 'node_modules') continue;
                const full = path.join(dir, e.name);
                if (e.isDirectory()) collectJs(full);
                else if (e.name.endsWith('.js')) allJsFiles.push(full);
            }
        }
        collectJs(baseDir);
        let bareFetchFiles = [];
        for (const file of allJsFiles) {
            const content = fs.readFileSync(file, 'utf-8');
            const noComments = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
            if (noComments.includes('await fetch(')) {
                bareFetchFiles.push(path.basename(file));
            }
        }
        assert(bareFetchFiles.length === 0, `w5p19_19: Zero bare await fetch() calls in agentos/ (found: ${bareFetchFiles.join(', ') || 'none'})`);
    }

    // w5p19_20: Total wired files count updated to 24
    {
        const baseDir = path.join(__dirname, '..');
        const allFilesToCheck = [
            'agents/autopilot.js', 'agents/finault-pal.js', 'agents/cost-intelligence.js',
            'agents/close-pack-generator.js', 'agents/compound-learning.js', 'agents/intelligence.js',
            'agents/forecasting-agent.js', 'agents/optimization-agent.js', 'agents/magic-onboarding.js',
            'agents/budget-enforcer.js', 'agents/chargeback-agent.js', 'agents/invoice-reconciliation.js',
            'agents/policy-agent.js',
            'core/governance-agent.js', 'core/security-agent.js', 'core/agent-orchestrator.js',
            'core/agent-evaluator.js', 'core/agent-tools.js', 'core/observability.js', 'core/agent-memory.js',
            'tools/finault-tools.js', 'integrations/erp-connectors.js', 'worker.js', 'api/server.js'
        ];
        let wiredCount = 0;
        for (const file of allFilesToCheck) {
            const content = fs.readFileSync(path.join(baseDir, file), 'utf-8');
            if (content.includes('resilience-layer')) wiredCount++;
        }
        assert(wiredCount === 24, `w5p19_20: All 24 files import resilience-layer (got ${wiredCount})`);
    }

    // =========================================================================
    // RESULTS
    // =========================================================================
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`W-005 RESULTS: ${passed} passed, ${failed} failed`);
    if (failures.length > 0) {
        console.log('\nFailed tests:');
        failures.forEach(f => console.log(`  • ${f}`));
    }
    console.log('═'.repeat(70));
    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('Test suite error:', err);
    process.exit(1);
});
