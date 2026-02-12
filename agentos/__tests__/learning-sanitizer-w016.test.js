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

async function runTests() {
    console.log('═'.repeat(70));
    console.log('W-016 LEARNING SANITIZER TEST SUITE');
    console.log('═'.repeat(70));

    // Import the module
    const sanitizer = await import('../core/learning-sanitizer.js');
    const {
        parseFormattedNumber,
        ensureNumeric,
        safeReduceNumeric,
        safeAccuracyRate,
        safeRunningAverage,
        filterFiniteNumbers,
        safeDivide,
        LEARNING_SANITIZER_CONFIG
    } = sanitizer;

    // =========================================================================
    // SECTION 1: parseFormattedNumber (30 tests)
    // =========================================================================
    console.log('\n[SECTION 1] parseFormattedNumber Tests');

    // w16_001 - w16_010: Basic parsing
    assertEqual(parseFormattedNumber('123'), 123, 'w16_001: Parse basic number');
    assertEqual(parseFormattedNumber('123.45'), 123.45, 'w16_002: Parse decimal');
    assertEqual(parseFormattedNumber('$123'), 123, 'w16_003: Parse with dollar sign');
    assertEqual(parseFormattedNumber('$1,234.56'), 1234.56, 'w16_004: Parse currency with comma');
    assertEqual(parseFormattedNumber('50%'), 50, 'w16_005: Parse percentage');
    assertEqual(parseFormattedNumber('€1234'), 1234, 'w16_006: Parse euro symbol');
    assertEqual(parseFormattedNumber('1.5K'), 1500, 'w16_007: Parse K suffix');
    assertEqual(parseFormattedNumber('2.5M'), 2500000, 'w16_008: Parse M suffix');
    assertEqual(parseFormattedNumber('1.5B'), 1500000000, 'w16_009: Parse B suffix');
    assertEqual(parseFormattedNumber('  456  '), 456, 'w16_010: Parse with whitespace');

    // w16_011 - w16_020: Edge cases
    assertEqual(parseFormattedNumber(undefined), 0, 'w16_011: Parse undefined returns fallback');
    assertEqual(parseFormattedNumber(null), 0, 'w16_012: Parse null returns fallback');
    assertEqual(parseFormattedNumber(''), 0, 'w16_013: Parse empty string returns fallback');
    assertEqual(parseFormattedNumber('   '), 0, 'w16_014: Parse whitespace only returns fallback');
    assertEqual(parseFormattedNumber('abc'), 0, 'w16_015: Parse non-numeric string returns fallback');
    assertEqual(parseFormattedNumber(123), 123, 'w16_016: Parse actual number returns number');
    assertEqual(parseFormattedNumber(NaN), 0, 'w16_017: Parse NaN returns fallback');
    assertEqual(parseFormattedNumber(Infinity), 0, 'w16_018: Parse Infinity returns fallback');
    assertEqual(parseFormattedNumber(-Infinity), 0, 'w16_019: Parse -Infinity returns fallback');
    assertEqual(parseFormattedNumber('$1,234,567.89'), 1234567.89, 'w16_020: Parse complex currency');

    // w16_021 - w16_030: Custom fallback and special formats
    assertEqual(parseFormattedNumber('NaN', 42), 42, 'w16_021: Custom fallback for invalid');
    assertEqual(parseFormattedNumber('', 99), 99, 'w16_022: Custom fallback for empty');
    assertEqual(parseFormattedNumber('$-500'), -500, 'w16_023: Parse negative with currency');
    assertEqual(parseFormattedNumber('-$500'), -500, 'w16_024: Parse negative currency alternate');
    assertEqual(parseFormattedNumber('1 234'), 1234, 'w16_025: Parse space separator');
    assertEqual(parseFormattedNumber('12.34%'), 12.34, 'w16_026: Parse decimal percentage');
    assertEqual(parseFormattedNumber('0'), 0, 'w16_027: Parse zero');
    assertEqual(parseFormattedNumber('0.0'), 0, 'w16_028: Parse zero decimal');
    assertEqual(parseFormattedNumber('£100'), 100, 'w16_029: Parse pound sterling');
    assertEqual(parseFormattedNumber('¥1000'), 1000, 'w16_030: Parse yen symbol');

    // =========================================================================
    // SECTION 2: ensureNumeric (25 tests)
    // =========================================================================
    console.log('\n[SECTION 2] ensureNumeric Tests');

    // w16_031 - w16_040: Type handling
    assertEqual(ensureNumeric(123), 123, 'w16_031: Pass through number');
    assertEqual(ensureNumeric(123.45), 123.45, 'w16_032: Pass through decimal');
    assertEqual(ensureNumeric('456'), 456, 'w16_033: Convert string number');
    assertEqual(ensureNumeric('$789'), 789, 'w16_034: Convert formatted string');
    assertEqual(ensureNumeric(undefined), 0, 'w16_035: Convert undefined to 0');
    assertEqual(ensureNumeric(null), 0, 'w16_036: Convert null to 0');
    assertEqual(ensureNumeric(NaN), 0, 'w16_037: Convert NaN to 0');
    assertEqual(ensureNumeric(Infinity), 0, 'w16_038: Convert Infinity to 0');
    assertEqual(ensureNumeric(-Infinity), 0, 'w16_039: Convert -Infinity to 0');
    assertEqual(ensureNumeric(true), 1, 'w16_040: Convert boolean true to 1');

    // w16_041 - w16_050: Custom fallback
    assertEqual(ensureNumeric(undefined, 42), 42, 'w16_041: Custom fallback for undefined');
    assertEqual(ensureNumeric(NaN, 99), 99, 'w16_042: Custom fallback for NaN');
    assertEqual(ensureNumeric('', 77), 77, 'w16_043: Custom fallback for empty');
    assertEqual(ensureNumeric('invalid', 55), 55, 'w16_044: Custom fallback for non-numeric');
    assertEqual(ensureNumeric('$1,234', 0), 1234, 'w16_045: Parse formatted with fallback');
    assertEqual(ensureNumeric(null, 100), 100, 'w16_046: Custom fallback for null');
    assertEqual(ensureNumeric(Infinity, 999), 999, 'w16_047: Custom fallback for Infinity');
    assertEqual(ensureNumeric(-Infinity, -999), -999, 'w16_048: Custom fallback for -Infinity');
    assertEqual(ensureNumeric(0), 0, 'w16_049: Zero is valid');
    assertEqual(ensureNumeric(-123), -123, 'w16_050: Negative numbers work');

    // w16_051 - w16_055: Complex conversions
    assertEqual(ensureNumeric('50%', 0), 50, 'w16_051: Convert percentage');
    assertEqual(ensureNumeric('1.5K', 0), 1500, 'w16_052: Convert K suffix');
    assertEqual(ensureNumeric('  789  ', 0), 789, 'w16_053: Trim and convert');
    assertEqual(ensureNumeric('100.00'), 100, 'w16_054: Trailing zeros');
    assertEqual(ensureNumeric('0.001'), 0.001, 'w16_055: Very small decimal');

    // =========================================================================
    // SECTION 3: safeReduceNumeric (30 tests)
    // =========================================================================
    console.log('\n[SECTION 3] safeReduceNumeric Tests');

    // w16_056 - w16_065: Basic reduction
    let result = safeReduceNumeric([{ val: '100' }, { val: '200' }], v => v.val);
    assertEqual(result.sum, 300, 'w16_056: Sum of two numbers');
    assertEqual(result.count, 2, 'w16_057: Count is 2');
    assertEqual(result.avg, 150, 'w16_058: Average is correct');

    result = safeReduceNumeric([{ val: 10 }, { val: 20 }, { val: 30 }], v => v.val);
    assertEqual(result.sum, 60, 'w16_059: Sum of three numbers');
    assertEqual(result.avg, 20, 'w16_060: Average of three numbers');

    result = safeReduceNumeric([], v => v.val);
    assertEqual(result.sum, 0, 'w16_061: Empty array sum is 0');
    assertEqual(result.count, 0, 'w16_062: Empty array count is 0');
    assertEqual(result.avg, 0, 'w16_063: Empty array avg is 0');

    result = safeReduceNumeric(null, v => v.val);
    assertEqual(result.count, 0, 'w16_064: Null input count is 0');

    result = safeReduceNumeric(undefined, v => v.val);
    assertEqual(result.count, 0, 'w16_065: Undefined input count is 0');

    // w16_066 - w16_075: NaN filtering
    result = safeReduceNumeric([{ val: '100' }, { val: undefined }, { val: '200' }], v => v.val);
    assertEqual(result.sum, 300, 'w16_066: Skip NaN in sum');
    assertEqual(result.count, 2, 'w16_067: Count skips NaN');
    assertEqual(result.avg, 150, 'w16_068: Average skips NaN');

    result = safeReduceNumeric(
        [{ error_pct: '10.5%' }, { error: 'failed' }, { error_pct: '20.3%' }],
        v => parseFormattedNumber(v.error_pct, NaN)
    );
    assertEqual(result.count, 2, 'w16_069: Only valid error_pct counted');
    assert(result.avg > 15 && result.avg < 16, 'w16_070: Average error computed correctly');

    // w16_071 - w16_080: Formatted number handling
    result = safeReduceNumeric(
        [{ val: '$100' }, { val: '$200' }, { val: '$300' }],
        v => parseFormattedNumber(v.val, 0)
    );
    assertEqual(result.sum, 600, 'w16_071: Sum of formatted numbers');
    assertEqual(result.avg, 200, 'w16_072: Average of formatted numbers');

    result = safeReduceNumeric(
        [{ val: '100' }, { val: NaN }, { val: Infinity }, { val: '200' }],
        v => v.val
    );
    assertEqual(result.count, 2, 'w16_073: Skip NaN and Infinity');
    assertEqual(result.sum, 300, 'w16_074: Sum skips non-finite');
    assertEqual(result.avg, 150, 'w16_075: Average skips non-finite');

    // w16_076 - w16_085: Custom fallback
    result = safeReduceNumeric([], v => v.val, 99);
    assertEqual(result.avg, 99, 'w16_076: Empty array custom fallback');

    result = safeReduceNumeric([{ val: NaN }, { val: undefined }], v => v.val, 42);
    assertEqual(result.avg, 42, 'w16_077: All invalid custom fallback');

    result = safeReduceNumeric(
        [{ val: 50 }, { val: 50 }],
        v => v.val
    );
    assertEqual(result.sum, 100, 'w16_078: Sum of equal values');
    assertEqual(result.avg, 50, 'w16_079: Average of equal values');

    result = safeReduceNumeric(
        [{ val: '-100' }, { val: '-200' }],
        v => ensureNumeric(v.val, NaN)
    );
    assertEqual(result.sum, -300, 'w16_080: Sum of negative values');
    assertEqual(result.avg, -150, 'w16_081: Average of negative values');

    // =========================================================================
    // SECTION 4: safeAccuracyRate (20 tests)
    // =========================================================================
    console.log('\n[SECTION 4] safeAccuracyRate Tests');

    // w16_082 - w16_091: Basic accuracy computation
    let rate = safeAccuracyRate([{ accurate: true }, { accurate: true }], v => v.accurate);
    assertEqual(rate, 1, 'w16_082: All accurate = 1.0');

    rate = safeAccuracyRate([{ accurate: false }, { accurate: false }], v => v.accurate);
    assertEqual(rate, 0, 'w16_083: None accurate = 0.0');

    rate = safeAccuracyRate(
        [{ accurate: true }, { accurate: false }],
        v => v.accurate
    );
    assertEqual(rate, 0.5, 'w16_084: Half accurate = 0.5');

    rate = safeAccuracyRate(
        [{ accurate: true }, { accurate: true }, { accurate: false }],
        v => v.accurate
    );
    assert(rate > 0.66 && rate < 0.67, 'w16_085: 2/3 accurate computed correctly');

    rate = safeAccuracyRate([], v => v.accurate);
    assertEqual(rate, 0, 'w16_086: Empty array returns fallback');

    rate = safeAccuracyRate(null, v => v.accurate);
    assertEqual(rate, 0, 'w16_087: Null input returns fallback');

    rate = safeAccuracyRate(undefined, v => v.accurate);
    assertEqual(rate, 0, 'w16_088: Undefined input returns fallback');

    // w16_089 - w16_100: Custom fallback
    rate = safeAccuracyRate([], v => v.accurate, 0.5);
    assertEqual(rate, 0.5, 'w16_089: Custom fallback for empty');

    rate = safeAccuracyRate([{ accurate: true }, { accurate: true }, { accurate: true }], v => v.accurate);
    assertEqual(rate, 1, 'w16_090: All true items');

    rate = safeAccuracyRate(
        [{ result: 'pass' }, { result: 'fail' }, { result: 'pass' }],
        v => v.result === 'pass'
    );
    assert(rate > 0.66 && rate < 0.67, 'w16_091: Custom predicate works');

    // =========================================================================
    // SECTION 5: Integration with compound-learning patterns (20 tests)
    // =========================================================================
    console.log('\n[SECTION 5] Integration with compound-learning verification patterns');

    // w16_092 - w16_101: Verification object parsing
    const verifications = [
        { forecast_id: 1, predicted: 1000, actual: 950, error_pct: '5.3%', accurate: true },
        { forecast_id: 2, predicted: 2000, actual: 1900, error_pct: '5.0%', accurate: true },
        { forecast_id: 3, error: 'Network timeout', accurate: false }
    ];

    result = safeReduceNumeric(verifications, v => parseFormattedNumber(v.error_pct, 0));
    assertEqual(result.count, 3, 'w16_092: All items counted (undefined -> 0)');
    assert(result.avg > 3 && result.avg < 4, 'w16_093: Average error calculated with fallback');

    rate = safeAccuracyRate(verifications, v => v.accurate);
    assert(rate > 0.66 && rate < 0.67, 'w16_094: Accuracy rate includes failures');

    // w16_095: Forecast with string currency amounts
    const forecastData = { predicted_amount: '$1,234.56' };
    const forecastedSpend = ensureNumeric(forecastData.predicted_amount, 0);
    assertEqual(forecastedSpend, 1234.56, 'w16_095: Parse currency forecast amount');

    // w16_096: Multiple forecasts with mixed data
    const mixedVerifications = [
        { error_pct: '2.5%', accurate: true },
        { error: 'API error', accurate: false },
        { error_pct: '12.1%', accurate: true },
        { error: 'No data', accurate: false },
        { error_pct: '8.9%', accurate: true }
    ];

    result = safeReduceNumeric(mixedVerifications, v => parseFormattedNumber(v.error_pct, 0));
    assertEqual(result.count, 5, 'w16_096: Count all items (undefined -> 0)');
    assert(result.avg > 4 && result.avg < 5, 'w16_097: Average of mixed (2 items with 0)');

    rate = safeAccuracyRate(mixedVerifications, v => v.accurate);
    assertEqual(rate, 0.6, 'w16_098: 3/5 items accurate');

    // w16_099: All failures (no error_pct field)
    const allFailedVerifications = [
        { error: 'Network error', accurate: false },
        { error: 'Timeout', accurate: false }
    ];

    result = safeReduceNumeric(allFailedVerifications, v => parseFormattedNumber(v.error_pct, NaN));
    assertEqual(result.count, 0, 'w16_099: No valid error_pct in failures (use NaN fallback)');
    assertEqual(result.avg, 0, 'w16_100: Fallback avg when no valid errors');

    // =========================================================================
    // SECTION 6: Structural/Wiring Verification (25 tests)
    // =========================================================================
    console.log('\n[SECTION 6] Structural/Wiring Verification');

    const learningPath = path.join(__dirname, '..', 'agents', 'compound-learning.js');
    const learningSource = fs.readFileSync(learningPath, 'utf-8');

    // w16_101: Import statement present
    assert(
        learningSource.includes("import { parseFormattedNumber, ensureNumeric, safeReduceNumeric, safeAccuracyRate }"),
        'w16_101: Import statement present'
    );

    // w16_102: Line 396 uses ensureNumeric for forecastedSpend
    assert(
        learningSource.includes('const forecastedSpend = ensureNumeric(forecast.predicted_amount, 0);'),
        'w16_102: forecastedSpend uses ensureNumeric'
    );

    // w16_103: avgError uses safeReduceNumeric with verifications.length guard
    assert(
        learningSource.includes('safeReduceNumeric(verifications,') && learningSource.includes('verifications.length > 0'),
        'w16_103: avgError uses safeReduceNumeric with length guard'
    );

    // w16_104: accuracyRate uses safeAccuracyRate with verifications.length guard
    assert(
        learningSource.includes('safeAccuracyRate(verifications,') && learningSource.includes('verifications.length > 0'),
        'w16_104: accuracyRate uses safeAccuracyRate with length guard'
    );

    // w16_105: Old parseFloat(v.error_pct) pattern removed from executable code
    const codeLines = learningSource.split('\n').filter(l => {
        const t = l.trim();
        return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    }).join('\n');

    assert(
        !codeLines.includes('parseFloat(v.error_pct)'),
        'w16_105: Old parseFloat(v.error_pct) pattern removed'
    );

    // w16_106: Core module exports functions
    assert(
        sanitizer.default || sanitizer.parseFormattedNumber,
        'w16_106: Module exports available'
    );

    // w16_107: Config object available
    assert(
        LEARNING_SANITIZER_CONFIG && typeof LEARNING_SANITIZER_CONFIG === 'object',
        'w16_107: CONFIG object available'
    );

    // w16_108: Config has expected properties
    assert(
        LEARNING_SANITIZER_CONFIG.fallbackValue === 0,
        'w16_108: CONFIG has fallbackValue'
    );

    // w16_109: Additional helper exports
    assert(
        typeof filterFiniteNumbers === 'function',
        'w16_109: filterFiniteNumbers exported'
    );

    assert(
        typeof safeDivide === 'function',
        'w16_110: safeDivide exported'
    );

    // w16_111: Test filterFiniteNumbers
    const filtered = filterFiniteNumbers([1, NaN, 2, Infinity, 3, undefined, 4]);
    assertEqual(filtered.length, 4, 'w16_111: filterFiniteNumbers removes NaN/Infinity');

    // w16_112: Test safeDivide
    assertEqual(safeDivide(100, 2), 50, 'w16_112: safeDivide normal case');
    assertEqual(safeDivide(100, 0, 99), 99, 'w16_113: safeDivide by zero fallback');
    assertEqual(safeDivide(100, NaN, 77), 77, 'w16_114: safeDivide NaN divisor fallback');

    // w16_115: Test safeRunningAverage
    let avg = safeRunningAverage(undefined, 0, 100);
    assertEqual(avg, 100, 'w16_115: Running average from undefined');

    avg = safeRunningAverage(100, 1, 120);
    assertEqual(avg, 110, 'w16_116: Running average accumulation');

    avg = safeRunningAverage(NaN, 5, 50);
    assertEqual(avg, 50 / 6, 'w16_117: Running average from NaN');

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
