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

function assertClose(actual, expected, tolerance, message) {
    const diff = Math.abs(actual - expected);
    if (diff <= tolerance) {
        passed++;
        console.log(`  ✓ ${message}`);
    } else {
        failed++;
        failures.push(message);
        console.log(`  ✗ FAIL: ${message} (${actual} differs from ${expected} by ${diff})`);
    }
}

async function runTests() {
    console.log('═'.repeat(70));
    console.log('W-021 TREND ANALYZER TEST SUITE');
    console.log('═'.repeat(70));

    const {
        sampleStdDev,
        populationStdDev,
        safeVariancePercent,
        safeGrowthConfidence,
        safeTrendStability,
        coefficientOfVariation,
        TREND_ANALYZER_CONFIG
    } = await import(path.join(__dirname, '..', 'core', 'trend-analyzer.js'));

    // =========================================================================
    // SECTION 1: TREND_ANALYZER_CONFIG Constants (~5 tests)
    // =========================================================================
    console.log('\n[SECTION 1] TREND_ANALYZER_CONFIG Constants');

    // w21_001
    assert(typeof TREND_ANALYZER_CONFIG === 'object', 'w21_001: CONFIG is an object');

    // w21_002
    assert(TREND_ANALYZER_CONFIG.minSamplesForStdDev === 2, 'w21_002: minSamplesForStdDev = 2');

    // w21_003
    assert(TREND_ANALYZER_CONFIG.insufficientDataConfidence === 0.5, 'w21_003: insufficientDataConfidence = 0.5');

    // w21_004
    assert(typeof TREND_ANALYZER_CONFIG.cvThresholds === 'object', 'w21_004: cvThresholds is an object');

    // w21_005
    assert(TREND_ANALYZER_CONFIG.cvThresholds.low === 0.1, 'w21_005: cvThresholds.low = 0.1');

    // =========================================================================
    // SECTION 2: sampleStdDev (~25 tests)
    // =========================================================================
    console.log('\n[SECTION 2] sampleStdDev() - Bessel Corrected');

    // w21_006 - Single value: insufficient for sample std
    const stdDev1 = sampleStdDev([5]);
    assert(stdDev1 === 0, 'w21_006: single value → 0');

    // w21_007 - Empty array
    const stdDev2 = sampleStdDev([]);
    assert(stdDev2 === 0, 'w21_007: empty array → 0');

    // w21_008 - Null input
    const stdDev3 = sampleStdDev(null);
    assert(stdDev3 === 0, 'w21_008: null → 0');

    // w21_009 - Two identical values
    const stdDev4 = sampleStdDev([10, 10]);
    assertClose(stdDev4, 0, 0.001, 'w21_009: identical values → 0');

    // w21_010 - Two different values (manual: mean=7.5, (2.5^2 + 2.5^2) / 1 = 12.5, sqrt=3.536)
    const stdDev5 = sampleStdDev([5, 10]);
    assertClose(stdDev5, Math.sqrt(12.5), 0.01, 'w21_010: [5,10] sample std (Bessel)');

    // w21_011 - Verify Bessel correction: sample vs population
    const values = [1, 2, 3, 4, 5];
    const sampleStd = sampleStdDev(values);
    const popStd = populationStdDev(values);
    assert(sampleStd > popStd, 'w21_011: sample std > population std (Bessel effect)');

    // w21_012 - [0, 0, 0] → std = 0
    const stdDev6 = sampleStdDev([0, 0, 0]);
    assertClose(stdDev6, 0, 0.001, 'w21_012: all zeros → 0');

    // w21_013 - Negative values: [−5, −10]
    const stdDev7 = sampleStdDev([-5, -10]);
    assertClose(stdDev7, Math.sqrt(12.5), 0.01, 'w21_013: negative values handled');

    // w21_014 - Pre-computed mean provided
    const stdDev8 = sampleStdDev([5, 10, 15], 10);
    assertClose(stdDev8, sampleStdDev([5, 10, 15]), 0.01, 'w21_014: pre-computed mean used');

    // w21_015 - Large values
    const stdDev9 = sampleStdDev([1000, 2000, 3000]);
    assert(stdDev9 > 0, 'w21_015: large values computed');

    // w21_016 - [1, 2, 3, 4, 5] manual validation
    // mean = 3, diffs: -2,-1,0,1,2; sum_sq = 4+1+0+1+4=10; std = sqrt(10/4) = 1.5811
    const stdDev10 = sampleStdDev([1, 2, 3, 4, 5]);
    assertClose(stdDev10, Math.sqrt(10/4), 0.01, 'w21_016: [1,2,3,4,5] sample std');

    // w21_017 - NaN in values
    const stdDev11 = sampleStdDev([1, NaN, 3]);
    assert(!Number.isFinite(stdDev11), 'w21_017: NaN in values → NaN result');

    // w21_018 - Very small values
    const stdDev12 = sampleStdDev([0.001, 0.002, 0.003]);
    assert(stdDev12 > 0, 'w21_018: very small values computed');

    // =========================================================================
    // SECTION 3: populationStdDev (~10 tests)
    // =========================================================================
    console.log('\n[SECTION 3] populationStdDev()');

    // w21_019 - Two values
    const popStd1 = populationStdDev([5, 10]);
    // mean = 7.5, diff_sq: (5-7.5)^2 + (10-7.5)^2 = 6.25 + 6.25 = 12.5
    // pop_std = sqrt(12.5 / 2) = sqrt(6.25) = 2.5
    assertClose(popStd1, 2.5, 0.01, 'w21_019: [5,10] population std');

    // w21_020 - Single value
    const popStd2 = populationStdDev([5]);
    assertClose(popStd2, 0, 0.001, 'w21_020: single value → 0');

    // w21_021 - Empty array
    const popStd3 = populationStdDev([]);
    assert(popStd3 === 0, 'w21_021: empty array → 0');

    // w21_022 - Verify pop std < sample std
    const vals = [1, 2, 3, 4, 5];
    const samp = sampleStdDev(vals);
    const pop = populationStdDev(vals);
    assert(pop < samp, 'w21_022: population std < sample std');

    // =========================================================================
    // SECTION 4: safeVariancePercent (~25 tests)
    // =========================================================================
    console.log('\n[SECTION 4] safeVariancePercent()');

    // w21_023 - Normal case: variance=100, budget=1000 → 10.0%
    const vp1 = safeVariancePercent(100, 1000);
    assert(vp1 === '10.0', 'w21_023: 100/1000 → "10.0"');

    // w21_024 - Negative variance (under budget)
    const vp2 = safeVariancePercent(-50, 1000);
    assert(vp2 === '-5.0', 'w21_024: -50/1000 → "-5.0"');

    // w21_025 - Zero budget (W-021 Bug #1)
    const vp3 = safeVariancePercent(100, 0);
    assert(vp3 === '0.0', 'w21_025: zero budget → "0.0"');

    // w21_026 - Null budget
    const vp4 = safeVariancePercent(100, null);
    assert(vp4 === '0.0', 'w21_026: null budget → "0.0"');

    // w21_027 - Undefined budget
    const vp5 = safeVariancePercent(100, undefined);
    assert(vp5 === '0.0', 'w21_027: undefined budget → "0.0"');

    // w21_028 - NaN budget
    const vp6 = safeVariancePercent(100, NaN);
    assert(vp6 === '0.0', 'w21_028: NaN budget → "0.0"');

    // w21_029 - Infinity budget
    const vp7 = safeVariancePercent(100, Infinity);
    assert(vp7 === '0.0', 'w21_029: Infinity budget → "0.0"');

    // w21_030 - Negative budget
    const vp8 = safeVariancePercent(100, -1000);
    assert(vp8 === '0.0', 'w21_030: negative budget → "0.0"');

    // w21_031 - NaN variance
    const vp9 = safeVariancePercent(NaN, 1000);
    assert(vp9 === '0.0', 'w21_031: NaN variance → "0.0"');

    // w21_032 - Custom decimals
    const vp10 = safeVariancePercent(123.456, 1000, 2);
    assert(vp10 === '12.35', 'w21_032: 2 decimal places');

    // w21_033 - 0 decimals
    const vp11 = safeVariancePercent(456, 1000, 0);
    assert(vp11 === '46', 'w21_033: 0 decimal places');

    // w21_034 - Large variance
    const vp12 = safeVariancePercent(500000, 1000);
    assert(parseFloat(vp12) > 0, 'w21_034: large variance computed');

    // =========================================================================
    // SECTION 5: safeGrowthConfidence (~30 tests)
    // =========================================================================
    console.log('\n[SECTION 5] safeGrowthConfidence()');

    // w21_035 - Zero growth (W-021 Bug #2: the || 1 fallback issue)
    const gc1 = safeGrowthConfidence(0.1, 0);
    assert(gc1 === 0, 'w21_035: zero avgGrowth → confidence = 0 (no signal)');

    // w21_036 - Zero std, non-zero growth → high confidence
    const gc2 = safeGrowthConfidence(0, 0.1);
    assertClose(gc2, 1.0, 0.01, 'w21_036: zero std, nonzero growth → confidence ≈ 1.0');

    // w21_037 - Equal std and growth
    const gc3 = safeGrowthConfidence(0.1, 0.1);
    assertClose(gc3, 0, 0.01, 'w21_037: std=growth → CV=1 → confidence=0');

    // w21_038 - Large growth, small std → high confidence
    const gc4 = safeGrowthConfidence(0.01, 1.0);
    assertClose(gc4, 0.99, 0.01, 'w21_038: large growth, small std → high confidence');

    // w21_039 - Small growth, large std → low confidence
    const gc5 = safeGrowthConfidence(1.0, 0.01);
    assertClose(gc5, 0, 0.01, 'w21_039: small growth, large std → low confidence');

    // w21_040 - Negative growth
    const gc6 = safeGrowthConfidence(0.1, -0.2);
    assert(gc6 >= 0, 'w21_040: negative growth → non-negative confidence');

    // w21_041 - NaN std
    const gc7 = safeGrowthConfidence(NaN, 0.5);
    assert(gc7 >= 0 && gc7 <= 1, 'w21_041: NaN std → valid confidence');

    // w21_042 - NaN growth
    const gc8 = safeGrowthConfidence(0.5, NaN);
    assert(gc8 >= 0 && gc8 <= 1, 'w21_042: NaN growth → valid confidence');

    // w21_043 - Both zero
    const gc9 = safeGrowthConfidence(0, 0);
    assert(gc9 === 0, 'w21_043: both zero → confidence = 0');

    // w21_044 - Very small growth
    const gc10 = safeGrowthConfidence(0.05, 0.001);
    assert(gc10 < 0.01, 'w21_044: tiny growth, large std → very low confidence');

    // =========================================================================
    // SECTION 6: safeTrendStability (~30 tests)
    // =========================================================================
    console.log('\n[SECTION 6] safeTrendStability()');

    // w21_045 - Single slope: insufficient
    const ts1 = safeTrendStability([1.5]);
    assertClose(ts1, 0.5, 0.01, 'w21_045: single slope → 0.5 (insufficient)');

    // w21_046 - Empty slopes
    const ts2 = safeTrendStability([]);
    assertClose(ts2, 0.5, 0.01, 'w21_046: empty slopes → 0.5');

    // w21_047 - Null slopes
    const ts3 = safeTrendStability(null);
    assertClose(ts3, 0.5, 0.01, 'w21_047: null slopes → 0.5');

    // w21_048 - Identical slopes (high stability)
    const ts4 = safeTrendStability([1.0, 1.0, 1.0]);
    assertClose(ts4, 1.0, 0.01, 'w21_048: identical slopes → high stability');

    // w21_049 - Very different slopes (low stability)
    const ts5 = safeTrendStability([0.1, 10.0, 0.05]);
    assert(ts5 < 0.5, 'w21_049: very different slopes → low stability');

    // w21_050 - Zero mean slope (W-021 Bug #3: the || 1 fallback)
    // If slopes=[−1, 1], meanSlope=0, should return neutral (0.5) not high confidence
    const ts6 = safeTrendStability([-1, 1]);
    assertClose(ts6, 0.5, 0.01, 'w21_050: zero mean slope → neutral 0.5 (no trend)');

    // w21_051 - Slopes with zeros: [0, 0, 0]
    const ts7 = safeTrendStability([0, 0, 0]);
    assertClose(ts7, 0.5, 0.01, 'w21_051: all-zero slopes → 0.5');

    // w21_052 - NaN in slopes (filtered out)
    const ts8 = safeTrendStability([1, NaN, 2]);
    assert(Number.isFinite(ts8), 'w21_052: NaN filtered, result is finite');

    // w21_053 - Only NaN slopes
    const ts9 = safeTrendStability([NaN, NaN]);
    assertClose(ts9, 0.5, 0.01, 'w21_053: all NaN → 0.5');

    // w21_054 - Negative slopes
    const ts10 = safeTrendStability([-2, -3, -2.5]);
    assert(ts10 > 0.5, 'w21_054: stable negative slopes → high stability');

    // w21_055 - Very large slopes
    const ts11 = safeTrendStability([1000, 1100, 1050]);
    assert(ts11 > 0.5, 'w21_055: large stable slopes → high stability');

    // =========================================================================
    // SECTION 7: coefficientOfVariation (~10 tests)
    // =========================================================================
    console.log('\n[SECTION 7] coefficientOfVariation()');

    // w21_056 - Basic CV: [10, 20, 30] mean=20, std=10, cv=0.5
    const cv1 = coefficientOfVariation([10, 20, 30]);
    assertClose(cv1, 0.5, 0.05, 'w21_056: [10,20,30] CV ≈ 0.5');

    // w21_057 - Zero mean
    const cv2 = coefficientOfVariation([-5, 0, 5]);
    assert(cv2 === Infinity, 'w21_057: zero mean → Infinity');

    // w21_058 - Single value
    const cv3 = coefficientOfVariation([5]);
    assertClose(cv3, 0, 0.001, 'w21_058: single value → 0');

    // =========================================================================
    // SECTION 8: Integration Patterns (~15 tests)
    // =========================================================================
    console.log('\n[SECTION 8] Integration Patterns');

    // w21_059 - Budget analysis flow: forecast with zero budget
    const variance = 500;
    const budget = 0;
    const varPercent = safeVariancePercent(variance, budget);
    assert(varPercent === '0.0', 'w21_059: zero budget scenario → safe handling');

    // w21_060 - Growth rate with no growth signal
    const growthStd = 0.15;
    const avgGrowth = 0;
    const growthConf = safeGrowthConfidence(growthStd, avgGrowth);
    assert(growthConf === 0, 'w21_060: no growth → zero confidence');

    // w21_061 - Trend stability with inconsistent slopes
    const slopes = [1.5, -0.5, 2.0, -1.0];
    const stability = safeTrendStability(slopes);
    assert(stability >= 0 && stability <= 1, 'w21_061: slope stability in range [0,1]');

    // =========================================================================
    // SECTION 9: Structural/Wiring Verification (~20 tests)
    // =========================================================================
    console.log('\n[SECTION 9] Structural/Wiring Verification');

    // w21_062 - forecasting-agent.js imports trend-analyzer
    const agentPath = path.join(__dirname, '..', 'agents', 'forecasting-agent.js');
    const agentSrc = fs.readFileSync(agentPath, 'utf-8');
    assert(agentSrc.includes('trend-analyzer'), 'w21_062: forecasting-agent.js imports trend-analyzer');

    // w21_063 - Import has all three functions
    assert(agentSrc.includes('safeVariancePercent'), 'w21_063: safeVariancePercent imported');

    // w21_064
    assert(agentSrc.includes('safeGrowthConfidence'), 'w21_064: safeGrowthConfidence imported');

    // w21_065
    assert(agentSrc.includes('safeTrendStability'), 'w21_065: safeTrendStability imported');

    // w21_066 - Verify W-008 import still present (existing functionality)
    assert(agentSrc.includes('forecast-calibration'), 'w21_066: W-008 import (forecast-calibration) still present');

    // w21_067 - Filter out comments for pattern checking
    const agentLines = agentSrc.split('\n').filter(l => {
        const t = l.trim();
        return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    }).join('\n');

    // w21_068 - Old confidence pattern at line 193 removed
    const oldConfidencePattern = /Math\.max\(0,\s*1\s*-\s*growthStd\s*\/\s*Math\.abs\(\s*avgGrowth\s*\|\|\s*1\s*\)/;
    const hasOldConfidence = oldConfidencePattern.test(agentLines);
    assert(!hasOldConfidence, 'w21_068: old confidence formula removed');

    // w21_069 - safeGrowthConfidence used
    assert(agentSrc.includes('safeGrowthConfidence(growthStd, avgGrowth)'), 'w21_069: safeGrowthConfidence called');

    // w21_070 - Old trend stability pattern removed
    const oldTrendPattern = /Math\.max\(0,\s*Math\.min\(1,\s*1\s*-\s*\(\s*slopeStd\s*\/\s*\(\s*Math\.abs\(meanSlope\)\s*\|\|\s*1\s*\)\s*\)\)\)/;
    const hasOldTrend = oldTrendPattern.test(agentLines);
    assert(!hasOldTrend, 'w21_070: old trend stability formula removed');

    // w21_071 - safeTrendStability used
    assert(agentSrc.includes('safeTrendStability(slopes)'), 'w21_071: safeTrendStability called');

    // w21_072 - Old variance percent pattern removed
    const oldVariancePattern = /variance\s*\/\s*budget\s*\*\s*100/;
    const hasOldVariance = oldVariancePattern.test(agentLines);
    assert(!hasOldVariance, 'w21_072: old unguarded variance formula removed');

    // w21_073 - safeVariancePercent used
    assert(agentSrc.includes('safeVariancePercent(variance, budget)'), 'w21_073: safeVariancePercent called');

    // w21_074 - Verify both imports coexist
    const hasW008 = agentSrc.includes('createForecastCalibrator');
    const hasW021 = agentSrc.includes('safeVariancePercent');
    assert(hasW008 && hasW021, 'w21_074: both W-008 and W-021 fixes present');

    // =========================================================================
    // Summary
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
}

runTests().catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
});
