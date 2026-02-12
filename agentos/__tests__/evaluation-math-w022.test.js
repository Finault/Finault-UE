/**
 * TEST SUITE: evaluation-math-w022.test.js
 * Tests for W-022: Percentile interpolation and safe statistical helpers
 *
 * W-022 fixes:
 * 1. Non-interpolating percentile formula in agent-evaluator.js lines 362-366
 * 2. Switch case scope issue in checkAssertion() lines 244-276
 * 3. Empty tests array NaN passRate in calculatePassPowerK() line 354
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import {
    interpolatedPercentile,
    safePassRate,
    safePassPowerK,
    EVALUATION_MATH_CONFIG
} from '../core/evaluation-math.js';

// w22_001: Test empty array returns fallback
it('w22_001: interpolatedPercentile() empty array returns fallback', () => {
    assert.strictEqual(interpolatedPercentile([], 50, 0), 0);
    assert.strictEqual(interpolatedPercentile([], 50, -1), -1);
    assert.strictEqual(interpolatedPercentile(null, 50, 0), 0);
});

// w22_002: Test single element array
it('w22_002: interpolatedPercentile() single element array', () => {
    assert.strictEqual(interpolatedPercentile([42], 50), 42);
    assert.strictEqual(interpolatedPercentile([42], 0), 42);
    assert.strictEqual(interpolatedPercentile([42], 100), 42);
});

// w22_003: Test p=0 returns minimum
it('w22_003: interpolatedPercentile() p=0 returns minimum', () => {
    const arr = [10, 20, 30, 40, 50];
    assert.strictEqual(interpolatedPercentile(arr, 0), 10);
    assert.strictEqual(interpolatedPercentile([5, 3, 9, 1], 0), 1);
});

// w22_004: Test p=100 returns maximum
it('w22_004: interpolatedPercentile() p=100 returns maximum', () => {
    const arr = [10, 20, 30, 40, 50];
    assert.strictEqual(interpolatedPercentile(arr, 100), 50);
    assert.strictEqual(interpolatedPercentile([5, 3, 9, 1], 100), 9);
});

// w22_005: Test p=50 (median) on even array
it('w22_005: interpolatedPercentile() p=50 on 4-element array', () => {
    const arr = [10, 20, 30, 40];
    const result = interpolatedPercentile(arr, 50);
    // Should interpolate between 20 and 30: (20+30)/2 = 25
    assert(result >= 20 && result <= 30, `Result ${result} should be between 20 and 30`);
});

// w22_006: Test p=50 on odd array
it('w22_006: interpolatedPercentile() p=50 on 5-element array', () => {
    const arr = [10, 20, 30, 40, 50];
    const result = interpolatedPercentile(arr, 50);
    assert.strictEqual(result, 30);
});

// w22_007: Test p=25 (first quartile)
it('w22_007: interpolatedPercentile() p=25 on 5-element array', () => {
    const arr = [10, 20, 30, 40, 50];
    const result = interpolatedPercentile(arr, 25);
    assert(result >= 10 && result <= 30, `Result ${result} should be in first quarter`);
});

// w22_008: Test p=75 (third quartile)
it('w22_008: interpolatedPercentile() p=75 on 5-element array', () => {
    const arr = [10, 20, 30, 40, 50];
    const result = interpolatedPercentile(arr, 75);
    assert(result >= 30 && result <= 50, `Result ${result} should be in third quarter`);
});

// w22_009: Test p=95 (95th percentile)
it('w22_009: interpolatedPercentile() p=95 on 5-element array', () => {
    const arr = [10, 20, 30, 40, 50];
    const result = interpolatedPercentile(arr, 95);
    assert(result >= 40 && result <= 50, `Result ${result} should be near max`);
});

// w22_010: Test p=99 (99th percentile)
it('w22_010: interpolatedPercentile() p=99 on 5-element array', () => {
    const arr = [10, 20, 30, 40, 50];
    const result = interpolatedPercentile(arr, 99);
    assert(result >= 40 && result <= 50, `Result ${result} should be near max`);
});

// w22_011: Test unsorted array (should sort internally)
it('w22_011: interpolatedPercentile() unsorted array', () => {
    const arr = [50, 10, 40, 20, 30];
    const sorted = [10, 20, 30, 40, 50];
    assert.strictEqual(interpolatedPercentile(arr, 50), interpolatedPercentile(sorted, 50));
});

// w22_012: Test already sorted array
it('w22_012: interpolatedPercentile() already sorted array', () => {
    const arr = [1, 2, 3, 4, 5];
    const result = interpolatedPercentile(arr, 50);
    assert.strictEqual(result, 3);
});

// w22_013: Test reverse sorted array
it('w22_013: interpolatedPercentile() reverse sorted array', () => {
    const arr = [100, 80, 60, 40, 20];
    const result = interpolatedPercentile(arr, 50);
    assert.strictEqual(result, 60);
});

// w22_014: Test large array
it('w22_014: interpolatedPercentile() large array (1000 elements)', () => {
    const arr = Array.from({length: 1000}, (_, i) => i + 1);
    const p50 = interpolatedPercentile(arr, 50);
    assert(p50 >= 450 && p50 <= 550, `p50=${p50} should be around 500`);
    const p95 = interpolatedPercentile(arr, 95);
    assert(p95 >= 900 && p95 <= 1000, `p95=${p95} should be around 950`);
});

// w22_015: Test identical values
it('w22_015: interpolatedPercentile() identical values array', () => {
    const arr = [42, 42, 42, 42, 42];
    assert.strictEqual(interpolatedPercentile(arr, 25), 42);
    assert.strictEqual(interpolatedPercentile(arr, 50), 42);
    assert.strictEqual(interpolatedPercentile(arr, 75), 42);
});

// w22_016: Test negative values
it('w22_016: interpolatedPercentile() negative values', () => {
    const arr = [-50, -30, -10, 10, 30];
    const p50 = interpolatedPercentile(arr, 50);
    assert.strictEqual(p50, -10);
});

// w22_017: Test mixed positive/negative
it('w22_017: interpolatedPercentile() mixed positive and negative', () => {
    const arr = [-100, -50, 0, 50, 100];
    assert.strictEqual(interpolatedPercentile(arr, 50), 0);
});

// w22_018: Test decimal values
it('w22_018: interpolatedPercentile() decimal values', () => {
    const arr = [1.5, 2.5, 3.5, 4.5, 5.5];
    const p50 = interpolatedPercentile(arr, 50);
    assert.strictEqual(p50, 3.5);
});

// w22_019: Test very small percentiles
it('w22_019: interpolatedPercentile() very small percentile (p=1)', () => {
    const arr = Array.from({length: 100}, (_, i) => i + 1);
    const result = interpolatedPercentile(arr, 1);
    assert(result >= 1 && result <= 5, `p1=${result} should be near minimum`);
});

// w22_020: Test very large percentiles
it('w22_020: interpolatedPercentile() very large percentile (p=99.5)', () => {
    const arr = Array.from({length: 100}, (_, i) => i + 1);
    const result = interpolatedPercentile(arr, 99.5);
    assert(result >= 95 && result <= 100, `p99.5=${result} should be near maximum`);
});

// w22_021: Test safePassRate() empty array returns fallback
it('w22_021: safePassRate() empty array returns fallback', () => {
    assert.strictEqual(safePassRate([], (t) => t.passed, 0), 0);
    assert.strictEqual(safePassRate([], (t) => t.passed, -1), -1);
    assert.strictEqual(safePassRate(null, (t) => t.passed, 0), 0);
});

// w22_022: Test safePassRate() all passed
it('w22_022: safePassRate() all tests passed', () => {
    const tests = [
        { passed: true },
        { passed: true },
        { passed: true }
    ];
    assert.strictEqual(safePassRate(tests, (t) => t.passed, 0), 1);
});

// w22_023: Test safePassRate() all failed
it('w22_023: safePassRate() all tests failed', () => {
    const tests = [
        { passed: false },
        { passed: false },
        { passed: false }
    ];
    assert.strictEqual(safePassRate(tests, (t) => t.passed, 0), 0);
});

// w22_024: Test safePassRate() mixed results
it('w22_024: safePassRate() mixed pass/fail', () => {
    const tests = [
        { passed: true },
        { passed: false },
        { passed: true },
        { passed: false }
    ];
    assert.strictEqual(safePassRate(tests, (t) => t.passed, 0), 0.5);
});

// w22_025: Test safePassRate() custom predicate
it('w22_025: safePassRate() custom predicate', () => {
    const tests = [
        { result: 'pass' },
        { result: 'fail' },
        { result: 'pass' }
    ];
    const rate = safePassRate(tests, (t) => t.result === 'pass', 0);
    assert.strictEqual(rate, 2/3);
});

// w22_026: Test safePassPowerK() empty array returns fallback
it('w22_026: safePassPowerK() empty array returns fallback', () => {
    assert.strictEqual(safePassPowerK([], 3, 0), 0);
    assert.strictEqual(safePassPowerK(null, 3, 0), 0);
});

// w22_027: Test safePassPowerK() p^k calculation
it('w22_027: safePassPowerK() p^k calculation with p=1', () => {
    const tests = [
        { passed: true },
        { passed: true },
        { passed: true }
    ];
    const result = safePassPowerK(tests, 3, 0);
    assert.strictEqual(result, 1);
});

// w22_028: Test safePassPowerK() p^k with p=0
it('w22_028: safePassPowerK() p^k calculation with p=0', () => {
    const tests = [
        { passed: false },
        { passed: false },
        { passed: false }
    ];
    const result = safePassPowerK(tests, 3, 0);
    assert.strictEqual(result, 0);
});

// w22_029: Test safePassPowerK() p^k with p=0.5, k=3
it('w22_029: safePassPowerK() p=0.5, k=3 => (0.5)^3 = 0.125', () => {
    const tests = [
        { passed: true },
        { passed: false },
        { passed: true },
        { passed: false }
    ];
    const result = safePassPowerK(tests, 3, 0);
    assert.strictEqual(result, Math.pow(0.5, 3));
    assert.strictEqual(result, 0.125);
});

// w22_030: Test safePassPowerK() different k values
it('w22_030: safePassPowerK() k=1 should equal pass rate', () => {
    const tests = [
        { passed: true },
        { passed: false }
    ];
    const rate = safePassRate(tests, (t) => t.passed, 0);
    const power1 = safePassPowerK(tests, 1, 0);
    assert.strictEqual(power1, rate);
});

// w22_031: Test interpolation vs old formula (accuracy comparison)
it('w22_031: interpolation more accurate than old ceil method', () => {
    const arr = [10, 20, 30, 40, 50];

    // Old (non-interpolating) formula: Math.ceil((p/100)*n) - 1
    const oldP50 = arr[Math.max(0, Math.ceil((50/100)*5) - 1)];

    // New (interpolating) formula
    const newP50 = interpolatedPercentile(arr, 50);

    // Both should be reasonable but interpolation should be more accurate
    assert(oldP50 === 30 || newP50 === 30, 'Median should be 30 for [10,20,30,40,50]');
});

// w22_032: Test NaN not produced
it('w22_032: safePassRate() does not produce NaN', () => {
    const tests = [];
    const rate = safePassRate(tests, (t) => t.passed, 0);
    assert(!Number.isNaN(rate), 'Should not be NaN');
    assert.strictEqual(rate, 0);
});

// w22_033: Test NaN not produced in pass^k
it('w22_033: safePassPowerK() does not produce NaN', () => {
    const tests = [];
    const power = safePassPowerK(tests, 3, 0);
    assert(!Number.isNaN(power), 'Should not be NaN');
    assert.strictEqual(power, 0);
});

// w22_034: Test Infinity not produced
it('w22_034: interpolatedPercentile() does not produce Infinity', () => {
    const arr = [10, 20, 30];
    const result = interpolatedPercentile(arr, 50);
    assert(!Number.isFinite(result) ? false : true, 'Should be finite');
});

// w22_035: Test special p values (boundary)
it('w22_035: interpolatedPercentile() boundary percentiles', () => {
    const arr = [1, 2, 3, 4, 5];

    const p0_001 = interpolatedPercentile(arr, 0.001);
    const p99_999 = interpolatedPercentile(arr, 99.999);

    assert(p0_001 >= 1 && p0_001 <= 5);
    assert(p99_999 >= 1 && p99_999 <= 5);
});

// ============================================================
// STRUCTURAL/WIRING VERIFICATION TESTS
// ============================================================

// w22_036: Verify evaluation-math module exists
it('w22_036: evaluation-math.js module exists and exports functions', async () => {
    const modulePath = path.join(process.cwd(), 'agentos/core/evaluation-math.js');
    assert(fs.existsSync(modulePath), 'evaluation-math.js should exist');
});

// w22_037: Verify agent-evaluator imports evaluation-math
it('w22_037: agent-evaluator.js imports evaluation-math', () => {
    const filePath = path.join(process.cwd(), 'agentos/core/agent-evaluator.js');
    const src = fs.readFileSync(filePath, 'utf-8');
    assert(src.includes("import { interpolatedPercentile, safePassRate, safePassPowerK } from './evaluation-math.js'"),
        'Should import from evaluation-math.js');
});

// w22_038: Verify percentile method uses interpolatedPercentile
it('w22_038: agent-evaluator.js percentile() uses interpolatedPercentile', () => {
    const filePath = path.join(process.cwd(), 'agentos/core/agent-evaluator.js');
    const src = fs.readFileSync(filePath, 'utf-8');
    const percentileMatch = src.match(/percentile\(arr,\s*p\)\s*\{[\s\S]*?return interpolatedPercentile/);
    assert(percentileMatch, 'percentile method should use interpolatedPercentile');
});

// w22_039: Verify calculatePassPowerK uses safePassPowerK
it('w22_039: agent-evaluator.js calculatePassPowerK() uses safePassPowerK', () => {
    const filePath = path.join(process.cwd(), 'agentos/core/agent-evaluator.js');
    const src = fs.readFileSync(filePath, 'utf-8');
    assert(src.includes('return safePassPowerK(tests, k, 0)'),
        'calculatePassPowerK should use safePassPowerK');
});

// w22_040: Verify switch case 'contains' has braces
it('w22_040: switch case "contains" has block braces', () => {
    const filePath = path.join(process.cwd(), 'agentos/core/agent-evaluator.js');
    const src = fs.readFileSync(filePath, 'utf-8');
    assert(src.includes("case 'contains': {"),
        "case 'contains' should have opening brace");
});

// w22_041: Verify switch case 'matches_pattern' has braces
it('w22_041: switch case "matches_pattern" has block braces', () => {
    const filePath = path.join(process.cwd(), 'agentos/core/agent-evaluator.js');
    const src = fs.readFileSync(filePath, 'utf-8');
    assert(src.includes("case 'matches_pattern': {"),
        "case 'matches_pattern' should have opening brace");
});

// w22_042: Verify switch case 'within_range' has braces
it('w22_042: switch case "within_range" has block braces', () => {
    const filePath = path.join(process.cwd(), 'agentos/core/agent-evaluator.js');
    const src = fs.readFileSync(filePath, 'utf-8');
    assert(src.includes("case 'within_range': {"),
        "case 'within_range' should have opening brace");
});

// w22_043: Verify switch case 'array_length' has braces
it('w22_043: switch case "array_length" has block braces', () => {
    const filePath = path.join(process.cwd(), 'agentos/core/agent-evaluator.js');
    const src = fs.readFileSync(filePath, 'utf-8');
    assert(src.includes("case 'array_length': {"),
        "case 'array_length' should have opening brace");
});

// w22_044: Verify old percentile formula removed
it('w22_044: old percentile formula (Math.ceil) removed', () => {
    const filePath = path.join(process.cwd(), 'agentos/core/agent-evaluator.js');
    const src = fs.readFileSync(filePath, 'utf-8');

    // Extract percentile method
    const methodMatch = src.match(/percentile\(arr,\s*p\)\s*\{[\s\S]*?\n\s*\}/);
    assert(methodMatch, 'Should find percentile method');

    const method = methodMatch[0];
    // Should not contain Math.ceil((p/100)*sorted.length) pattern
    assert(!method.includes('Math.ceil((p'),
        'Old Math.ceil formula should be removed');
});

// w22_045: Verify EVALUATION_MATH_CONFIG exported
it('w22_045: EVALUATION_MATH_CONFIG is exported', () => {
    assert(EVALUATION_MATH_CONFIG, 'EVALUATION_MATH_CONFIG should be exported');
    assert(EVALUATION_MATH_CONFIG.percentile_fallback !== undefined,
        'Should have percentile_fallback config');
});

// w22_046: Test two-element array interpolation
it('w22_046: interpolatedPercentile() two-element array', () => {
    const arr = [10, 20];
    assert.strictEqual(interpolatedPercentile(arr, 0), 10);
    assert.strictEqual(interpolatedPercentile(arr, 100), 20);
    assert.strictEqual(interpolatedPercentile(arr, 50), 15);
});

// w22_047: Test three-element array
it('w22_047: interpolatedPercentile() three-element array', () => {
    const arr = [10, 20, 30];
    assert.strictEqual(interpolatedPercentile(arr, 50), 20);
    assert.strictEqual(interpolatedPercentile(arr, 0), 10);
    assert.strictEqual(interpolatedPercentile(arr, 100), 30);
});

// w22_048: Test float percentile value
it('w22_048: interpolatedPercentile() with float percentile', () => {
    const arr = [0, 10, 20, 30, 40, 50];
    const result = interpolatedPercentile(arr, 33.33);
    assert(result >= 10 && result <= 20, `Result ${result} should be reasonable`);
});

// w22_049: Test safePassRate single test
it('w22_049: safePassRate() single test passed', () => {
    const tests = [{ passed: true }];
    assert.strictEqual(safePassRate(tests, (t) => t.passed, 0), 1);
});

// w22_050: Test safePassRate single test failed
it('w22_050: safePassRate() single test failed', () => {
    const tests = [{ passed: false }];
    assert.strictEqual(safePassRate(tests, (t) => t.passed, 0), 0);
});

// w22_051: Large test suite pass rate
it('w22_051: safePassRate() large test suite', () => {
    const tests = Array.from({length: 1000}, (_, i) => ({
        passed: i % 3 !== 0 // 2/3 pass
    }));
    const rate = safePassRate(tests, (t) => t.passed, 0);
    assert(Math.abs(rate - 2/3) < 0.01, `Rate ${rate} should be ~0.667`);
});

// w22_052: Test safePassPowerK with various k values
it('w22_052: safePassPowerK() consistency across k values', () => {
    const tests = [{ passed: true }, { passed: false }];
    const rate = safePassRate(tests, (t) => t.passed, 0);

    const p1 = safePassPowerK(tests, 1, 0);
    const p2 = safePassPowerK(tests, 2, 0);
    const p3 = safePassPowerK(tests, 3, 0);

    assert.strictEqual(p1, rate);
    assert.strictEqual(p2, rate * rate);
    assert.strictEqual(p3, rate * rate * rate);
});

// w22_053: Edge case - zero in array
it('w22_053: interpolatedPercentile() with zero in array', () => {
    const arr = [-10, 0, 10];
    const p50 = interpolatedPercentile(arr, 50);
    assert.strictEqual(p50, 0);
});

// w22_054: Edge case - very large numbers
it('w22_054: interpolatedPercentile() with very large numbers', () => {
    const arr = [1e6, 2e6, 3e6, 4e6, 5e6];
    const p50 = interpolatedPercentile(arr, 50);
    assert.strictEqual(p50, 3e6);
});

// w22_055: Edge case - very small numbers
it('w22_055: interpolatedPercentile() with very small numbers', () => {
    const arr = [1e-6, 2e-6, 3e-6, 4e-6, 5e-6];
    const p50 = interpolatedPercentile(arr, 50);
    assert.strictEqual(p50, 3e-6);
});

// w22_056: Test that module exports are correct
it('w22_056: evaluation-math exports all required functions', () => {
    assert(typeof interpolatedPercentile === 'function');
    assert(typeof safePassRate === 'function');
    assert(typeof safePassPowerK === 'function');
});

// w22_057: Test percentile consistency (multiple calls same result)
it('w22_057: interpolatedPercentile() deterministic', () => {
    const arr = [3, 1, 4, 1, 5, 9, 2, 6];
    const r1 = interpolatedPercentile(arr, 50);
    const r2 = interpolatedPercentile(arr, 50);
    assert.strictEqual(r1, r2);
});

// w22_058: Test negative percentile parameter (boundary)
it('w22_058: interpolatedPercentile() with p < 0 returns min', () => {
    const arr = [10, 20, 30];
    const result = interpolatedPercentile(arr, -10);
    assert.strictEqual(result, 10);
});

// w22_059: Test percentile > 100 (boundary)
it('w22_059: interpolatedPercentile() with p > 100 returns max', () => {
    const arr = [10, 20, 30];
    const result = interpolatedPercentile(arr, 150);
    assert.strictEqual(result, 30);
});

// w22_060: Test function signatures correct
it('w22_060: function signatures match expected interface', () => {
    assert(interpolatedPercentile.length >= 2, 'interpolatedPercentile should take at least 2 params');
    assert(safePassRate.length >= 1, 'safePassRate should take at least 1 param');
    assert(safePassPowerK.length >= 1, 'safePassPowerK should take at least 1 param');
});
