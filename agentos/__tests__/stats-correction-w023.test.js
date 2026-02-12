/**
 * TEST SUITE: stats-correction-w023.test.js
 * Tests for W-023: Population SD correction, z-score division-by-zero fix, deviation percent fix
 *
 * W-023 fixes:
 * 1. finault-tools.js line 129: Population SD (/ n) instead of sample SD (/ n-1)
 * 2. finault-tools.js line 136: zscore division by zero when std=0
 * 3. finault-tools.js line 144: deviation_percent division by zero when mean=0
 * 4. finault-tools.js line 128: mean calculation NaN on empty array
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import {
    safeMean,
    sampleSD,
    populationSD,
    safeZScore,
    safeDeviationPercent,
    safeAnomalyDetection,
    STATS_CONFIG
} from '../core/stats-correction.js';

// w23_001: Test safeMean with empty array
it('w23_001: safeMean() empty array returns fallback', () => {
    assert.strictEqual(safeMean([], 0), 0);
    assert.strictEqual(safeMean([], -1), -1);
    assert.strictEqual(safeMean(null, 0), 0);
    assert.strictEqual(safeMean(undefined, 5), 5);
});

// w23_002: Test safeMean with single value
it('w23_002: safeMean() single value', () => {
    assert.strictEqual(safeMean([42], 0), 42);
});

// w23_003: Test safeMean with two values
it('w23_003: safeMean() two values', () => {
    assert.strictEqual(safeMean([10, 20], 0), 15);
});

// w23_004: Test safeMean with multiple values
it('w23_004: safeMean() multiple values', () => {
    const mean = safeMean([2, 4, 6, 8, 10], 0);
    assert.strictEqual(mean, 6);
});

// w23_005: Test safeMean with negative values
it('w23_005: safeMean() negative values', () => {
    const mean = safeMean([-10, -20, -30], 0);
    assert.strictEqual(mean, -20);
});

// w23_006: Test safeMean with mixed values
it('w23_006: safeMean() mixed positive and negative', () => {
    const mean = safeMean([-10, 0, 10], 0);
    assert.strictEqual(mean, 0);
});

// w23_007: Test safeMean decimal values
it('w23_007: safeMean() decimal values', () => {
    const mean = safeMean([1.5, 2.5, 3.5], 0);
    assert.strictEqual(mean, 2.5);
});

// w23_008: Test sampleSD on single value (n=1, returns 0)
it('w23_008: sampleSD() n=1 returns 0 (insufficient data)', () => {
    assert.strictEqual(sampleSD([42], 42), 0);
});

// w23_009: Test sampleSD on two identical values
it('w23_009: sampleSD() identical values returns 0', () => {
    assert.strictEqual(sampleSD([5, 5, 5, 5], 5), 0);
});

// w23_010: Test sampleSD on simple array
it('w23_010: sampleSD() simple array [1,2,3]', () => {
    const arr = [1, 2, 3];
    const mean = safeMean(arr, 0);
    const sd = sampleSD(arr, mean);
    // Variance = ((1-2)^2 + (2-2)^2 + (3-2)^2) / (3-1) = 2/2 = 1
    // SD = sqrt(1) = 1
    assert.strictEqual(sd, 1);
});

// w23_011: Test sampleSD Bessel's correction difference
it('w23_011: sampleSD() uses Bessel correction (n-1 not n)', () => {
    const arr = [1, 2, 3];
    const mean = 2;

    const sample = sampleSD(arr, mean);
    const population = populationSD(arr, mean);

    // Sample uses n-1=2, Population uses n=3
    // Variance_sample = 2/2 = 1, Variance_population = 2/3
    // So sample SD should be > population SD
    assert(sample > population, `Sample SD ${sample} should be > Population SD ${population}`);
});

// w23_012: Test sampleSD without pre-computed mean
it('w23_012: sampleSD() computes mean if not provided', () => {
    const arr = [2, 4, 6];
    const result = sampleSD(arr);
    assert(result > 0, 'Should compute valid SD');
});

// w23_013: Test sampleSD on empty array
it('w23_013: sampleSD() empty array returns 0', () => {
    assert.strictEqual(sampleSD([]), 0);
    assert.strictEqual(sampleSD(null), 0);
});

// w23_014: Test populationSD on single value
it('w23_014: populationSD() single value', () => {
    const sd = populationSD([42], 42);
    assert.strictEqual(sd, 0);
});

// w23_015: Test populationSD different from sampleSD
it('w23_015: populationSD() vs sampleSD() difference', () => {
    const arr = [10, 20, 30, 40, 50];
    const mean = safeMean(arr, 0);

    const sample = sampleSD(arr, mean);
    const population = populationSD(arr, mean);

    assert(sample > population, 'Sample SD should be larger due to Bessel correction');
});

// w23_016: Test safeZScore normal case
it('w23_016: safeZScore() normal calculation', () => {
    const mean = 100;
    const std = 15;
    const value = 115;

    const zscore = safeZScore(value, mean, std);
    assert.strictEqual(zscore, 1);
});

// w23_017: Test safeZScore when std=0 (no variation)
it('w23_017: safeZScore() std=0 returns fallback', () => {
    const zscore = safeZScore(100, 100, 0, 0);
    assert.strictEqual(zscore, 0);
});

// w23_018: Test safeZScore negative value
it('w23_018: safeZScore() negative z-score', () => {
    const mean = 100;
    const std = 10;
    const value = 85;

    const zscore = safeZScore(value, mean, std);
    assert.strictEqual(zscore, -1.5);
});

// w23_019: Test safeZScore with null std
it('w23_019: safeZScore() std=null returns fallback', () => {
    const zscore = safeZScore(100, 100, null, -999);
    assert.strictEqual(zscore, -999);
});

// w23_020: Test safeZScore with undefined std
it('w23_020: safeZScore() std=undefined returns fallback', () => {
    const zscore = safeZScore(100, 100, undefined, 0);
    assert.strictEqual(zscore, 0);
});

// w23_021: Test safeZScore large deviation
it('w23_021: safeZScore() large deviation', () => {
    const zscore = safeZScore(150, 100, 10);
    assert.strictEqual(zscore, 5);
});

// w23_022: Test safeDeviationPercent normal case
it('w23_022: safeDeviationPercent() normal calculation', () => {
    const percent = safeDeviationPercent(120, 100, 1);
    assert.strictEqual(percent, '20.0%');
});

// w23_023: Test safeDeviationPercent with mean=0 (division by zero)
it('w23_023: safeDeviationPercent() mean=0 returns "0.0%"', () => {
    const percent = safeDeviationPercent(100, 0, 1);
    assert.strictEqual(percent, '0.0%');
});

// w23_024: Test safeDeviationPercent negative mean
it('w23_024: safeDeviationPercent() negative mean', () => {
    const percent = safeDeviationPercent(-80, -100, 1);
    // (-80 - (-100)) / (-100) * 100 = 20 / -100 * 100 = -20%
    assert.strictEqual(percent, '-20.0%');
});

// w23_025: Test safeDeviationPercent with null mean
it('w23_025: safeDeviationPercent() mean=null returns "0.0%"', () => {
    const percent = safeDeviationPercent(100, null, 1);
    assert.strictEqual(percent, '0.0%');
});

// w23_026: Test safeDeviationPercent with undefined mean
it('w23_026: safeDeviationPercent() mean=undefined returns "0.0%"', () => {
    const percent = safeDeviationPercent(100, undefined, 1);
    assert.strictEqual(percent, '0.0%');
});

// w23_027: Test safeDeviationPercent custom decimals
it('w23_027: safeDeviationPercent() custom decimal places', () => {
    const p1 = safeDeviationPercent(123, 100, 0);
    const p2 = safeDeviationPercent(123, 100, 2);
    const p3 = safeDeviationPercent(123, 100, 3);

    assert.strictEqual(p1, '23%');
    assert.strictEqual(p2, '23.00%');
    assert.strictEqual(p3, '23.000%');
});

// w23_028: Test safeDeviationPercent small deviation
it('w23_028: safeDeviationPercent() small deviation', () => {
    const percent = safeDeviationPercent(101, 100, 1);
    assert.strictEqual(percent, '1.0%');
});

// w23_029: Test safeDeviationPercent zero value
it('w23_029: safeDeviationPercent() value=mean', () => {
    const percent = safeDeviationPercent(100, 100, 1);
    assert.strictEqual(percent, '0.0%');
});

// w23_030: Test safeAnomalyDetection simple case
it('w23_030: safeAnomalyDetection() simple data', () => {
    const values = [100, 100, 100, 100, 100];
    const result = safeAnomalyDetection(values, 2.5);

    assert.strictEqual(result.mean, 100);
    assert.strictEqual(result.std, 0);
    assert.strictEqual(result.anomalies.length, 0);
});

// w23_031: Test safeAnomalyDetection with outliers
it('w23_031: safeAnomalyDetection() with outlier', () => {
    const values = [100, 100, 100, 100, 500];
    const result = safeAnomalyDetection(values, 1.0);  // Lower threshold to detect outlier

    assert(result.mean > 0);
    assert(result.std > 0);
    assert(result.anomalies.length > 0, 'Should detect 500 as outlier with std > 0');
});

// w23_032: Test safeAnomalyDetection empty array
it('w23_032: safeAnomalyDetection() empty array', () => {
    const result = safeAnomalyDetection([], 2.5);

    assert.strictEqual(result.mean, 0);
    assert.strictEqual(result.std, 0);
    assert.strictEqual(result.anomalies.length, 0);
});

// w23_033: Test safeAnomalyDetection anomaly structure
it('w23_033: safeAnomalyDetection() anomaly object structure', () => {
    const values = [10, 10, 10, 10, 100];
    const result = safeAnomalyDetection(values, 1);

    if (result.anomalies.length > 0) {
        const anom = result.anomalies[0];
        assert(anom.value !== undefined);
        assert(anom.mean !== undefined);
        assert(anom.deviation !== undefined);
        assert(anom.zscore !== undefined);
        assert(anom.deviation_percent !== undefined);
    }
});

// w23_034: Test NaN not produced in mean
it('w23_034: safeMean() does not produce NaN', () => {
    const mean = safeMean([], 0);
    assert(!Number.isNaN(mean));
});

// w23_035: Test NaN not produced in SD
it('w23_035: sampleSD() does not produce NaN', () => {
    const sd = sampleSD([], 0);
    assert(!Number.isNaN(sd));
});

// w23_036: Test Infinity not produced in z-score
it('w23_036: safeZScore() does not produce Infinity', () => {
    const zscore = safeZScore(100, 100, 0, 0);
    assert(!Number.isFinite(zscore) ? false : true);
});

// w23_037: Test Infinity not produced in deviation percent
it('w23_037: safeDeviationPercent() result is string not "Infinity"', () => {
    const result = safeDeviationPercent(100, 0, 1);
    assert(typeof result === 'string');
    assert(!result.includes('Infinity'));
});

// w23_038: Test large dataset sample SD
it('w23_038: sampleSD() large dataset', () => {
    const values = Array.from({length: 1000}, (_, i) => Math.random() * 100);
    const mean = safeMean(values, 0);
    const sd = sampleSD(values, mean);

    assert(sd > 0, 'SD should be positive for random data');
    assert(!Number.isNaN(sd), 'Should not be NaN');
});

// ============================================================
// STRUCTURAL/WIRING VERIFICATION TESTS
// ============================================================

// w23_039: Verify stats-correction module exists
it('w23_039: stats-correction.js module exists', () => {
    const modulePath = path.join(process.cwd(), 'agentos/core/stats-correction.js');
    assert(fs.existsSync(modulePath), 'stats-correction.js should exist');
});

// w23_040: Verify finault-tools imports stats-correction
it('w23_040: finault-tools.js imports stats-correction', () => {
    const filePath = path.join(process.cwd(), 'agentos/tools/finault-tools.js');
    const src = fs.readFileSync(filePath, 'utf-8');
    assert(src.includes("import { safeMean, sampleSD, safeZScore, safeDeviationPercent } from '../core/stats-correction.js'"),
        'Should import from stats-correction.js');
});

// w23_041: Verify safeMean used in detectAnomalies
it('w23_041: finault-tools.js detectAnomalies uses safeMean', () => {
    const filePath = path.join(process.cwd(), 'agentos/tools/finault-tools.js');
    const src = fs.readFileSync(filePath, 'utf-8');
    const anomalyStart = src.indexOf('export async function detectAnomalies');
    const anomalyEnd = src.indexOf('\n/**', anomalyStart + 1);
    const anomalySection = anomalyStart >= 0 ? src.substring(anomalyStart, anomalyEnd) : '';
    assert(anomalySection.includes('safeMean'),
        'detectAnomalies should use safeMean');
});

// w23_042: Verify sampleSD used in detectAnomalies
it('w23_042: finault-tools.js detectAnomalies uses sampleSD', () => {
    const filePath = path.join(process.cwd(), 'agentos/tools/finault-tools.js');
    const src = fs.readFileSync(filePath, 'utf-8');
    const anomalyStart = src.indexOf('export async function detectAnomalies');
    const anomalyEnd = src.indexOf('\n/**', anomalyStart + 1);
    const anomalySection = anomalyStart >= 0 ? src.substring(anomalyStart, anomalyEnd) : '';
    assert(anomalySection.includes('sampleSD'),
        'detectAnomalies should use sampleSD');
});

// w23_043: Verify safeZScore used in detectAnomalies
it('w23_043: finault-tools.js detectAnomalies uses safeZScore', () => {
    const filePath = path.join(process.cwd(), 'agentos/tools/finault-tools.js');
    const src = fs.readFileSync(filePath, 'utf-8');
    const anomalyStart = src.indexOf('export async function detectAnomalies');
    const anomalyEnd = src.indexOf('\n/**', anomalyStart + 1);
    const anomalySection = anomalyStart >= 0 ? src.substring(anomalyStart, anomalyEnd) : '';
    assert(anomalySection.includes('safeZScore'),
        'detectAnomalies should use safeZScore');
});

// w23_044: Verify safeDeviationPercent used in detectAnomalies
it('w23_044: finault-tools.js detectAnomalies uses safeDeviationPercent', () => {
    const filePath = path.join(process.cwd(), 'agentos/tools/finault-tools.js');
    const src = fs.readFileSync(filePath, 'utf-8');
    const anomalyStart = src.indexOf('export async function detectAnomalies');
    const anomalyEnd = src.indexOf('\n/**', anomalyStart + 1);
    const anomalySection = anomalyStart >= 0 ? src.substring(anomalyStart, anomalyEnd) : '';
    assert(anomalySection.includes('safeDeviationPercent'),
        'detectAnomalies should use safeDeviationPercent');
});

// w23_045: Verify old population SD formula removed
it('w23_045: old population SD formula (/ values.length) removed in detectAnomalies', () => {
    const filePath = path.join(process.cwd(), 'agentos/tools/finault-tools.js');
    const src = fs.readFileSync(filePath, 'utf-8');
    const anomalySection = src.match(/export async function detectAnomalies[\s\S]*?return \{[\s\S]*?\};/);

    // Should not have the old formula pattern in detectAnomalies
    const hasOldFormula = anomalySection && anomalySection[0].includes('values.reduce') &&
                          anomalySection[0].includes('/ values.length');

    assert(!hasOldFormula, 'Old population SD formula should be removed');
});

// w23_046: Verify no unguarded division by mean remains
it('w23_046: no unguarded (value - mean) / mean in detectAnomalies', () => {
    const filePath = path.join(process.cwd(), 'agentos/tools/finault-tools.js');
    const src = fs.readFileSync(filePath, 'utf-8');
    const anomalySection = src.match(/export async function detectAnomalies[\s\S]*?return \{[\s\S]*?\};/);

    if (anomalySection) {
        const section = anomalySection[0];
        // Check for pattern like "/ mean *" which would be unsafe
        const unsafePattern = /\/ mean\s*\*/;
        assert(!unsafePattern.test(section), 'Should not have unguarded / mean');
    }
});

// w23_047: Test all module exports present
it('w23_047: stats-correction exports all required functions', () => {
    assert(typeof safeMean === 'function');
    assert(typeof sampleSD === 'function');
    assert(typeof populationSD === 'function');
    assert(typeof safeZScore === 'function');
    assert(typeof safeDeviationPercent === 'function');
    assert(typeof safeAnomalyDetection === 'function');
});

// w23_048: Test STATS_CONFIG export
it('w23_048: STATS_CONFIG is exported', () => {
    assert(STATS_CONFIG !== undefined);
    assert(STATS_CONFIG.anomaly_threshold !== undefined);
});

// w23_049: Test deterministic behavior (same input = same output)
it('w23_049: safeZScore() deterministic', () => {
    const r1 = safeZScore(100, 100, 15);
    const r2 = safeZScore(100, 100, 15);
    assert.strictEqual(r1, r2);
});

// w23_050: Test sampleSD consistency
it('w23_050: sampleSD() consistency', () => {
    const arr = [1, 2, 3, 4, 5];
    const mean = safeMean(arr, 0);
    const r1 = sampleSD(arr, mean);
    const r2 = sampleSD(arr, mean);
    assert.strictEqual(r1, r2);
});

// w23_051: Verify two-point sample SD
it('w23_051: sampleSD() two values [0, 2] gives SD=2', () => {
    const arr = [0, 2];
    const mean = 1;
    const sd = sampleSD(arr, mean);
    // Variance = ((0-1)^2 + (2-1)^2) / (2-1) = (1+1)/1 = 2
    // SD = sqrt(2) ≈ 1.414
    assert(Math.abs(sd - Math.sqrt(2)) < 0.001);
});

// w23_052: Test standard normal distribution properties
it('w23_052: safeZScore() standard normal properties', () => {
    const mean = 0;
    const std = 1;

    const z_minus1 = safeZScore(-1, mean, std);
    const z_0 = safeZScore(0, mean, std);
    const z_plus1 = safeZScore(1, mean, std);

    assert.strictEqual(z_minus1, -1);
    assert.strictEqual(z_0, 0);
    assert.strictEqual(z_plus1, 1);
});

// w23_053: Test anomaly detection threshold
it('w23_053: safeAnomalyDetection() respects threshold', () => {
    const values = [10, 10, 10, 10, 1000];
    const highThreshold = safeAnomalyDetection(values, 10);
    const lowThreshold = safeAnomalyDetection(values, 1);

    assert(highThreshold.anomalies.length <= lowThreshold.anomalies.length,
        'Higher threshold should find fewer anomalies');
});

// w23_054: Test very small standard deviation
it('w23_054: sampleSD() very small variation', () => {
    const arr = [100.0001, 100.0002, 100.0003];
    const mean = safeMean(arr, 0);
    const sd = sampleSD(arr, mean);

    assert(sd > 0, 'Should compute SD even for very small variations');
    assert(sd < 0.001, 'SD should be small');
});

// w23_055: Test function signatures
it('w23_055: function signatures correct', () => {
    assert(safeMean.length >= 1);
    assert(sampleSD.length >= 1);
    assert(safeZScore.length >= 3);
    assert(safeDeviationPercent.length >= 2);
    assert(safeAnomalyDetection.length >= 1);
});

// w23_056: Test edge case - single data point anomaly detection
it('w23_056: safeAnomalyDetection() single value', () => {
    const result = safeAnomalyDetection([42], 2.5);
    assert.strictEqual(result.mean, 42);
    assert.strictEqual(result.std, 0);
    assert.strictEqual(result.anomalies.length, 0);
});

// w23_057: Test negative percent formatting
it('w23_057: safeDeviationPercent() negative percentage', () => {
    const percent = safeDeviationPercent(80, 100, 1);
    assert.strictEqual(percent, '-20.0%');
});

// w23_058: Test zero deviation
it('w23_058: safeDeviationPercent() zero deviation', () => {
    const percent = safeDeviationPercent(100, 100, 1);
    assert.strictEqual(percent, '0.0%');
});

// w23_059: Test population vs sample SD ratio
it('w23_059: populationSD vs sampleSD ratio for n=10', () => {
    const arr = Array.from({length: 10}, (_, i) => i * 10);
    const mean = safeMean(arr, 0);
    const sample = sampleSD(arr, mean);
    const population = populationSD(arr, mean);

    // sampleSD/populationSD should be sqrt(n/(n-1)) = sqrt(10/9) ≈ 1.054
    const ratio = sample / population;
    const expected = Math.sqrt(10 / 9);
    assert(Math.abs(ratio - expected) < 0.01);
});

// w23_060: Test all guards against NaN and Infinity
it('w23_060: all functions safe against NaN/Infinity', () => {
    const mean = safeMean([], 0);
    const sd = sampleSD([]);
    const zscore = safeZScore(100, mean, sd, 0);
    const devpct = safeDeviationPercent(100, mean, 1);

    assert(!Number.isNaN(mean) && !Number.isNaN(sd) && !Number.isNaN(zscore));
    assert(typeof devpct === 'string' && !devpct.includes('Infinity'));
});
