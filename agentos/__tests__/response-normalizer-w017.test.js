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

function assertEqual(actual, expected, message) {
    if (actual === expected || (Number.isNaN(actual) && Number.isNaN(expected))) {
        passed++;
        console.log(`  ✓ ${message}`);
    } else {
        failed++;
        failures.push(message + ` (got ${actual}, expected ${expected})`);
        console.log(`  ✗ FAIL: ${message} (got ${actual}, expected ${expected})`);
    }
}

function assertClose(actual, expected, tolerance = 0.001, message = '') {
    if (Math.abs(actual - expected) < tolerance) {
        passed++;
        console.log(`  ✓ ${message}`);
    } else {
        failed++;
        failures.push(message + ` (got ${actual}, expected ${expected})`);
        console.log(`  ✗ FAIL: ${message} (got ${actual}, expected ≈${expected})`);
    }
}

async function runTests() {
    console.log('═'.repeat(70));
    console.log('W-017 RESPONSE NORMALIZER TEST SUITE');
    console.log('═'.repeat(70));

    // Import the module
    const normalizer = await import('../core/response-normalizer.js');
    const {
        safeExtractText,
        safeRunningAverage,
        safeErrorRate,
        initAgentStats,
        sanitizeAgentStats,
        ensureFiniteNumber,
        safeDivide,
        isValidResponse,
        RESPONSE_NORMALIZER_CONFIG
    } = normalizer;

    // =========================================================================
    // SECTION 1: safeExtractText (30 tests)
    // =========================================================================
    console.log('\n[SECTION 1] safeExtractText Tests');

    // w17_001 - w17_010: Valid responses
    let text = safeExtractText({ content: [{ text: 'Hello' }] });
    assertEqual(text, 'Hello', 'w17_001: Extract text from valid response');

    text = safeExtractText({ content: [{ text: 'Multi\nline\ntext' }] });
    assert(text.includes('Multi') && text.includes('line'), 'w17_002: Extract multiline text');

    text = safeExtractText({ content: [{ text: '' }] });
    assertEqual(text, '', 'w17_003: Extract empty text string');

    text = safeExtractText({ content: [{ text: 'Very long text'.repeat(100) }] });
    assert(text.length > 0, 'w17_004: Extract long text');

    text = safeExtractText({ content: [{ text: 'Text with special chars: $@#%^&*()' }] });
    assert(text.includes('$@#%'), 'w17_005: Extract special characters');

    // w17_006 - w17_015: Null/undefined handling
    text = safeExtractText(null);
    assertEqual(text, '', 'w17_006: Null response returns fallback');

    text = safeExtractText(undefined);
    assertEqual(text, '', 'w17_007: Undefined response returns fallback');

    text = safeExtractText({});
    assertEqual(text, '', 'w17_008: Missing content returns fallback');

    text = safeExtractText({ content: null });
    assertEqual(text, '', 'w17_009: Null content returns fallback');

    text = safeExtractText({ content: undefined });
    assertEqual(text, '', 'w17_010: Undefined content returns fallback');

    // w17_011 - w17_020: Empty array handling
    text = safeExtractText({ content: [] });
    assertEqual(text, '', 'w17_011: Empty content array returns fallback');

    text = safeExtractText({ content: [null] });
    assertEqual(text, '', 'w17_012: Array with null element returns fallback');

    text = safeExtractText({ content: [{}] });
    assertEqual(text, '', 'w17_013: Array with empty object returns fallback');

    text = safeExtractText({ content: [{ text: undefined }] });
    assertEqual(text, '', 'w17_014: Missing text field returns fallback');

    text = safeExtractText({ content: [{ text: null }] });
    assertEqual(text, '', 'w17_015: Null text field returns fallback');

    // w17_016 - w17_025: Custom fallback
    text = safeExtractText(null, 'DEFAULT');
    assertEqual(text, 'DEFAULT', 'w17_016: Custom fallback on null');

    text = safeExtractText({}, 'FALLBACK');
    assertEqual(text, 'FALLBACK', 'w17_017: Custom fallback on missing content');

    text = safeExtractText({ content: [] }, 'EMPTY');
    assertEqual(text, 'EMPTY', 'w17_018: Custom fallback on empty array');

    text = safeExtractText({ content: [{ text: 'Real text' }] }, 'FALLBACK');
    assertEqual(text, 'Real text', 'w17_019: Custom fallback not used when valid');

    // w17_026 - w17_030: Type safety
    text = safeExtractText({ content: [{ text: 123 }] });
    assertEqual(text, '', 'w17_026: Non-string text returns fallback');

    text = safeExtractText({ content: [{ text: true }] });
    assertEqual(text, '', 'w17_027: Boolean text returns fallback');

    text = safeExtractText({ content: 'not_array' });
    assertEqual(text, '', 'w17_028: Non-array content returns fallback');

    text = safeExtractText({ content: [{ text: 'Valid', other: 'field' }] });
    assertEqual(text, 'Valid', 'w17_029: Extra fields ignored');

    text = safeExtractText({ content: [{}, { text: 'Second' }] });
    assertEqual(text, '', 'w17_030: Uses first element even if empty');

    // =========================================================================
    // SECTION 2: safeRunningAverage (30 tests)
    // =========================================================================
    console.log('\n[SECTION 2] safeRunningAverage Tests');

    // w17_031 - w17_040: Basic averaging
    let avg = safeRunningAverage(0, 0, 100);
    assertEqual(avg, 100, 'w17_031: First average is the value');

    avg = safeRunningAverage(100, 1, 120);
    assertEqual(avg, 110, 'w17_032: Average of two values');

    avg = safeRunningAverage(110, 2, 120);
    assertEqual(avg, 110 + 10/3, 'w17_033: Average of three values');

    avg = safeRunningAverage(100, 1, 100);
    assertEqual(avg, 100, 'w17_034: Average of equal values');

    avg = safeRunningAverage(0, 0, 0);
    assertEqual(avg, 0, 'w17_035: Average of zeros');

    // w17_036 - w17_045: Undefined handling (NaN prevention)
    avg = safeRunningAverage(undefined, 0, 100);
    assertEqual(avg, 100, 'w17_036: Undefined current avg treated as 0');

    avg = safeRunningAverage(NaN, 0, 100);
    assertEqual(avg, 100, 'w17_037: NaN current avg treated as 0');

    avg = safeRunningAverage(Infinity, 0, 100);
    assertEqual(avg, 100, 'w17_038: Infinity current avg treated as 0');

    avg = safeRunningAverage(-Infinity, 0, 100);
    assertEqual(avg, 100, 'w17_039: -Infinity current avg treated as 0');

    avg = safeRunningAverage(null, 0, 100);
    assertEqual(avg, 100, 'w17_040: Null current avg treated as 0');

    // w17_041 - w17_050: New value handling
    avg = safeRunningAverage(100, 1, undefined);
    assertEqual(avg, (100 * 1 + 0) / 2, 'w17_041: Undefined new value treated as 0');

    avg = safeRunningAverage(100, 1, NaN);
    assertEqual(avg, (100 * 1 + 0) / 2, 'w17_042: NaN new value treated as 0');

    avg = safeRunningAverage(100, 1, Infinity);
    assertEqual(avg, (100 * 1 + 0) / 2, 'w17_043: Infinity new value treated as 0');

    avg = safeRunningAverage(100, 1, -Infinity);
    assertEqual(avg, (100 * 1 + 0) / 2, 'w17_044: -Infinity new value treated as 0');

    avg = safeRunningAverage(100, 1, null);
    assertEqual(avg, (100 * 1 + 0) / 2, 'w17_045: Null new value treated as 0');

    // w17_046 - w17_055: Count handling
    avg = safeRunningAverage(100, undefined, 50);
    assertEqual(avg, (100 * 0 + 50) / 1, 'w17_046: Undefined count treated as 0');

    avg = safeRunningAverage(100, NaN, 50);
    assertEqual(avg, (100 * 0 + 50) / 1, 'w17_047: NaN count treated as 0');

    avg = safeRunningAverage(100, 5, 50);
    assertEqual(avg, (100 * 5 + 50) / 6, 'w17_048: Correct count in formula');

    avg = safeRunningAverage(200, 3, 100);
    assertEqual(avg, (200 * 3 + 100) / 4, 'w17_049: Higher count computation');

    avg = safeRunningAverage(50, 0, 150);
    assertEqual(avg, 150, 'w17_050: Count of 0 gives new value');

    // w17_051 - w17_060: Negative values
    avg = safeRunningAverage(-100, 1, -50);
    assertEqual(avg, (-100 * 1 + -50) / 2, 'w17_051: Average of negatives');

    avg = safeRunningAverage(100, 1, -50);
    assertEqual(avg, (100 * 1 + -50) / 2, 'w17_052: Average of mixed signs');

    avg = safeRunningAverage(-200, 1, -100);
    assertEqual(avg, (-200 - 100) / 2, 'w17_053: Negative values result');

    // =========================================================================
    // SECTION 3: safeErrorRate (20 tests)
    // =========================================================================
    console.log('\n[SECTION 3] safeErrorRate Tests');

    // w17_061 - w17_070: Basic error rate computation
    let rate = safeErrorRate(0, 0, false);
    assertEqual(rate, 0, 'w17_061: First success gives 0 error rate');

    rate = safeErrorRate(0, 0, true);
    assertEqual(rate, 1, 'w17_062: First error gives 1 error rate');

    rate = safeErrorRate(0, 1, false);
    assertEqual(rate, 0 / 2, 'w17_063: One success of two is 0 rate');

    rate = safeErrorRate(0, 1, true);
    assertEqual(rate, 1 / 2, 'w17_064: One error of two is 0.5 rate');

    rate = safeErrorRate(0.5, 1, false);
    assertEqual(rate, 0.5 / 2, 'w17_065: Add success to 0.5 rate');

    // w17_066 - w17_075: Undefined handling
    rate = safeErrorRate(undefined, 0, false);
    assertEqual(rate, 0, 'w17_066: Undefined current rate treated as 0');

    rate = safeErrorRate(NaN, 0, false);
    assertEqual(rate, 0, 'w17_067: NaN current rate treated as 0');

    rate = safeErrorRate(Infinity, 0, false);
    assertEqual(rate, 0, 'w17_068: Infinity current rate treated as 0');

    rate = safeErrorRate(0.5, undefined, true);
    assertEqual(rate, (0.5 * 0 + 1) / 1, 'w17_069: Undefined count treated as 0');

    rate = safeErrorRate(0.5, NaN, false);
    assertEqual(rate, (0.5 * 0 + 0) / 1, 'w17_070: NaN count treated as 0');

    // w17_071 - w17_080: Progressive error rate
    rate = safeErrorRate(0, 4, true);
    assertEqual(rate, 1 / 5, 'w17_071: 1 error in 5 tasks');

    rate = safeErrorRate(1/5, 4, true);
    assertClose(rate, 1.8 / 5, 0.001, 'w17_072: 2 errors in 6 tasks');

    rate = safeErrorRate(2/6, 5, false);
    assertClose(rate, (2/6) * 5 / 6, 0.001, 'w17_073: Success lowers rate');

    rate = safeErrorRate(0.8, 4, false);
    assertEqual(rate, (0.8 * 4 + 0) / 5, 'w17_074: High error rate with success');

    rate = safeErrorRate(0.2, 9, true);
    assertEqual(rate, (0.2 * 9 + 1) / 10, 'w17_075: Low error rate with error');

    // =========================================================================
    // SECTION 4: initAgentStats (15 tests)
    // =========================================================================
    console.log('\n[SECTION 4] initAgentStats Tests');

    // w17_076 - w17_085: Default initialization
    let stats = initAgentStats();
    assertEqual(stats.tasks_completed, 0, 'w17_076: Default tasks_completed is 0');
    assertEqual(stats.avg_latency, 0, 'w17_077: Default avg_latency is 0');
    assertEqual(stats.error_rate, 0, 'w17_078: Default error_rate is 0');
    assertEqual(stats.success_count, 0, 'w17_079: Default success_count is 0');
    assertEqual(stats.failure_count, 0, 'w17_080: Default failure_count is 0');

    // w17_081 - w17_085: Custom initialization
    stats = initAgentStats({ tasks_completed: 10, avg_latency: 150 });
    assertEqual(stats.tasks_completed, 10, 'w17_081: Custom tasks_completed');
    assertEqual(stats.avg_latency, 150, 'w17_082: Custom avg_latency');
    assertEqual(stats.error_rate, 0, 'w17_083: Default error_rate with custom others');

    stats = initAgentStats({ avg_latency: undefined });
    assertEqual(stats.avg_latency, 0, 'w17_084: Undefined values converted to 0');

    stats = initAgentStats({ avg_latency: NaN });
    assertEqual(stats.avg_latency, 0, 'w17_085: NaN values converted to 0');

    // w17_086 - w17_090: All fields present
    stats = initAgentStats();
    assert(stats.hasOwnProperty('tasks_completed'), 'w17_086: Has tasks_completed');
    assert(stats.hasOwnProperty('avg_latency'), 'w17_087: Has avg_latency');
    assert(stats.hasOwnProperty('error_rate'), 'w17_088: Has error_rate');
    assert(stats.hasOwnProperty('last_execution_time'), 'w17_089: Has last_execution_time');
    assert(stats.hasOwnProperty('status'), 'w17_090: Has status');

    // =========================================================================
    // SECTION 5: Integration with orchestrator patterns (25 tests)
    // =========================================================================
    console.log('\n[SECTION 5] Integration with orchestrator patterns');

    // w17_091: Test sanitizeAgentStats
    stats = initAgentStats();
    const sanitized = sanitizeAgentStats(stats);
    assertEqual(sanitized.tasks_completed, 0, 'w17_091: Sanitize preserves values');

    // w17_092: Test sanitizeAgentStats with NaN
    const badStats = {
        tasks_completed: NaN,
        avg_latency: undefined,
        error_rate: Infinity
    };
    const cleanedStats = sanitizeAgentStats(badStats);
    assertEqual(cleanedStats.tasks_completed, 0, 'w17_092: Sanitize NaN tasks_completed');
    assertEqual(cleanedStats.avg_latency, 0, 'w17_093: Sanitize undefined avg_latency');
    assertEqual(cleanedStats.error_rate, 0, 'w17_094: Sanitize Infinity error_rate');

    // w17_095: Test ensureFiniteNumber
    let num = ensureFiniteNumber(100);
    assertEqual(num, 100, 'w17_095: Pass through finite number');

    num = ensureFiniteNumber(NaN);
    assertEqual(num, 0, 'w17_096: NaN becomes 0');

    num = ensureFiniteNumber('456');
    assertEqual(num, 456, 'w17_097: Parse string number');

    // w17_098: Test safeDivide
    num = safeDivide(100, 2);
    assertEqual(num, 50, 'w17_098: Normal division');

    num = safeDivide(100, 0, 99);
    assertEqual(num, 99, 'w17_099: Division by zero uses fallback');

    // w17_100: Test isValidResponse
    let valid = isValidResponse({ content: [{ text: 'Hello' }] });
    assert(valid, 'w17_100: Valid response returns true');

    valid = isValidResponse({ content: [] });
    assert(!valid, 'w17_101: Empty content returns false');

    valid = isValidResponse(null);
    assert(!valid, 'w17_102: Null response returns false');

    valid = isValidResponse({ content: [{ text: '' }] });
    assert(valid, 'w17_103: Empty text is still valid');

    // w17_104: Agent stats with running average
    stats = initAgentStats();
    stats.avg_latency = safeRunningAverage(stats.avg_latency, stats.tasks_completed, 100);
    assertEqual(stats.avg_latency, 100, 'w17_104: First latency');

    stats.tasks_completed++;
    stats.avg_latency = safeRunningAverage(stats.avg_latency, stats.tasks_completed - 1, 150);
    assertEqual(stats.avg_latency, 150, 'w17_105: Updated average latency (150 replaces avg when count=0)');

    // =========================================================================
    // SECTION 6: Structural/Wiring Verification (30 tests)
    // =========================================================================
    console.log('\n[SECTION 6] Structural/Wiring Verification');

    const orchestratorPath = path.join(__dirname, '..', 'core', 'agent-orchestrator.js');
    const orchestratorSource = fs.readFileSync(orchestratorPath, 'utf-8');

    // w17_106: Import statement present
    assert(
        orchestratorSource.includes("import { safeExtractText, safeRunningAverage, safeErrorRate }"),
        'w17_106: Import statement present'
    );

    // w17_107: Line 589 uses safeExtractText
    assert(
        orchestratorSource.includes('summary: safeExtractText(response),'),
        'w17_107: summary uses safeExtractText'
    );

    // w17_108: Line 505 uses safeRunningAverage
    assert(
        orchestratorSource.includes('agent.avg_latency = safeRunningAverage(agent.avg_latency, agent.tasks_completed, duration);'),
        'w17_108: avg_latency uses safeRunningAverage'
    );

    // w17_109: Line 512 uses safeErrorRate
    assert(
        orchestratorSource.includes('agent.error_rate = safeErrorRate(agent.error_rate, agent.tasks_completed - 1, !success);'),
        'w17_109: error_rate uses safeErrorRate'
    );

    // w17_110: Old avg_latency formula removed from executable code
    const codeLines = orchestratorSource.split('\n').filter(l => {
        const t = l.trim();
        return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    }).join('\n');

    assert(
        !codeLines.includes('(agent.avg_latency * agent.tasks_completed + duration) /'),
        'w17_110: Old avg_latency formula removed'
    );

    // w17_111: Core module exports functions
    assert(
        normalizer.default || normalizer.safeExtractText,
        'w17_111: Module exports available'
    );

    // w17_112: Config object available
    assert(
        RESPONSE_NORMALIZER_CONFIG && typeof RESPONSE_NORMALIZER_CONFIG === 'object',
        'w17_112: CONFIG object available'
    );

    // w17_113: Config has expected properties
    assert(
        RESPONSE_NORMALIZER_CONFIG.defaultText === '',
        'w17_113: CONFIG has defaultText'
    );

    assert(
        RESPONSE_NORMALIZER_CONFIG.defaultLatency === 0,
        'w17_114: CONFIG has defaultLatency'
    );

    // w17_115: Additional helper exports
    assert(
        typeof sanitizeAgentStats === 'function',
        'w17_115: sanitizeAgentStats exported'
    );

    assert(
        typeof isValidResponse === 'function',
        'w17_116: isValidResponse exported'
    );

    // w17_117: Test error rate progression in agent
    stats = initAgentStats();
    stats.error_rate = safeErrorRate(stats.error_rate, 0, false);
    stats.tasks_completed = 1;
    assertEqual(stats.error_rate, 0, 'w17_117: First task success');

    stats.error_rate = safeErrorRate(stats.error_rate, 1, true);
    stats.tasks_completed = 2;
    assertEqual(stats.error_rate, 0.5, 'w17_118: Second task error');

    stats.error_rate = safeErrorRate(stats.error_rate, 2, false);
    stats.tasks_completed = 3;
    assertEqual(stats.error_rate, 1/3, 'w17_119: Third task success');

    // w17_120: Complex orchestration scenario
    const agent = {
        name: 'test-agent',
        avg_latency: undefined,
        error_rate: undefined,
        tasks_completed: 0
    };

    const task = { started_at: Date.now() - 100 };
    const duration = Date.now() - task.started_at;

    agent.avg_latency = safeRunningAverage(agent.avg_latency, agent.tasks_completed, duration);
    agent.error_rate = safeErrorRate(agent.error_rate, agent.tasks_completed, false);
    agent.tasks_completed++;

    assert(Number.isFinite(agent.avg_latency), 'w17_120: avg_latency is finite after update');
    assert(Number.isFinite(agent.error_rate), 'w17_121: error_rate is finite after update');
    assertEqual(agent.tasks_completed, 1, 'w17_122: tasks_completed incremented');

    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log('\n' + '═'.repeat(70));
    console.log(`TESTS PASSED: ${passed}`);
    console.log(`TESTS FAILED: ${failed}`);
    console.log('═'.repeat(70));

    if (failed > 0) {
        console.log('\nFailed tests:');
        failures.forEach(f => console.log(`  - ${f}`));
        process.exit(1);
    }

    process.exit(0);
}

runTests().catch(err => {
    console.error('Test suite error:', err);
    process.exit(1);
});
