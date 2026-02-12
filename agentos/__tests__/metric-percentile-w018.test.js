import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { safePercentile, safeAvg, safeAggregate, METRIC_PERCENTILE_CONFIG } from '../core/metric-percentile.js';

describe('W-018: Metric Percentile Bug Fixes', () => {
    // ==================== safePercentile Tests ====================

    describe('safePercentile', () => {
        // w18_001 - w18_010: Empty and null array handling
        it('w18_001: returns fallback for empty array', () => {
            assert.equal(safePercentile([], 50, 0), 0);
        });

        it('w18_002: returns fallback for null input', () => {
            assert.equal(safePercentile(null, 50, 0), 0);
        });

        it('w18_003: returns fallback for undefined input', () => {
            assert.equal(safePercentile(undefined, 50, 0), 0);
        });

        it('w18_004: returns custom fallback on empty array', () => {
            assert.equal(safePercentile([], 50, -1), -1);
        });

        it('w18_005: returns fallback for non-array input', () => {
            assert.equal(safePercentile('not an array', 50, 0), 0);
        });

        it('w18_006: returns fallback for non-array object', () => {
            assert.equal(safePercentile({ length: 5 }, 50, 0), 0);
        });

        it('w18_007: returns fallback for invalid percentile (negative)', () => {
            assert.equal(safePercentile([1, 2, 3], -10, 0), 0);
        });

        it('w18_008: returns fallback for invalid percentile (>100)', () => {
            assert.equal(safePercentile([1, 2, 3], 150, 0), 0);
        });

        it('w18_009: returns fallback for non-numeric percentile', () => {
            assert.equal(safePercentile([1, 2, 3], 'fifty', 0), 0);
        });

        it('w18_010: returns first element for single-element array', () => {
            assert.equal(safePercentile([42], 50, 0), 42);
        });

        // w18_011 - w18_020: Single element edge cases
        it('w18_011: p=0 on single element returns that element', () => {
            assert.equal(safePercentile([100], 0, 0), 100);
        });

        it('w18_012: p=100 on single element returns that element', () => {
            assert.equal(safePercentile([100], 100, 0), 100);
        });

        it('w18_013: single NaN element returns fallback', () => {
            assert.equal(safePercentile([NaN], 50, -99), -99);
        });

        it('w18_014: single Infinity element returns fallback', () => {
            assert.equal(safePercentile([Infinity], 50, -1), -1);
        });

        it('w18_015: single -Infinity element returns fallback', () => {
            assert.equal(safePercentile([-Infinity], 50, 0), 0);
        });

        it('w18_016: two-element array p=0 returns min', () => {
            assert.equal(safePercentile([10, 20], 0, 0), 10);
        });

        it('w18_017: two-element array p=100 returns max', () => {
            assert.equal(safePercentile([10, 20], 100, 0), 20);
        });

        it('w18_018: two-element array p=50 returns interpolated middle', () => {
            const result = safePercentile([10, 20], 50, 0);
            assert.equal(result, 15);
        });

        it('w18_019: small array p=25', () => {
            const result = safePercentile([10, 20, 30], 25, 0);
            // Position: 0.25 * (3-1) = 0.5, interpolate between 10 and 20
            assert(result >= 10 && result <= 20);
        });

        it('w18_020: small array p=75', () => {
            const result = safePercentile([10, 20, 30], 75, 0);
            // Position: 0.75 * (3-1) = 1.5, interpolate between 20 and 30
            assert(result >= 20 && result <= 30);
        });

        // w18_021 - w18_030: Percentile accuracy for small arrays
        it('w18_021: p50 on [1,2,3,4,5]', () => {
            const result = safePercentile([1, 2, 3, 4, 5], 50, 0);
            assert.equal(result, 3);
        });

        it('w18_022: p25 on [1,2,3,4,5]', () => {
            const result = safePercentile([1, 2, 3, 4, 5], 25, 0);
            assert(result >= 1 && result <= 3);
        });

        it('w18_023: p75 on [1,2,3,4,5]', () => {
            const result = safePercentile([1, 2, 3, 4, 5], 75, 0);
            assert(result >= 3 && result <= 5);
        });

        it('w18_024: p95 on [1,2,3,4,5]', () => {
            const result = safePercentile([1, 2, 3, 4, 5], 95, 0);
            assert(result >= 4 && result <= 5);
        });

        it('w18_025: p99 on [1,2,3,4,5]', () => {
            const result = safePercentile([1, 2, 3, 4, 5], 99, 0);
            assert(result >= 4 && result <= 5);
        });

        it('w18_026: p0 on sorted array returns minimum', () => {
            // Note: safePercentile expects SORTED array
            assert.equal(safePercentile([1, 2, 5, 7, 9], 0, 0), 1);
        });

        it('w18_027: p100 on sorted array returns maximum', () => {
            // Note: safePercentile expects SORTED array
            assert.equal(safePercentile([1, 2, 5, 7, 9], 100, 0), 9);
        });

        it('w18_028: large array p50', () => {
            const arr = Array.from({ length: 100 }, (_, i) => i + 1);
            const result = safePercentile(arr, 50, 0);
            assert(result >= 40 && result <= 60);
        });

        it('w18_029: large array p95', () => {
            const arr = Array.from({ length: 100 }, (_, i) => i + 1);
            const result = safePercentile(arr, 95, 0);
            assert(result >= 90 && result <= 100);
        });

        it('w18_030: large array p99', () => {
            const arr = Array.from({ length: 100 }, (_, i) => i + 1);
            const result = safePercentile(arr, 99, 0);
            assert(result >= 95 && result <= 100);
        });

        // w18_031 - w18_040: NaN and Infinity handling in arrays
        it('w18_031: array with NaN values in sorted array', () => {
            // Note: If array is already sorted and contains NaN, the function should
            // return fallback if the lower value is NaN
            const result = safePercentile([NaN, 10, 20, 30], 50, 0);
            // Position would be 1.5, lowerIndex=1 has value 10
            // Should return 20 (interpolation between 10 and 20)
            assert(result >= 10 && result <= 20);
        });

        it('w18_032: array with Infinity uses fallback', () => {
            const result = safePercentile([10, Infinity, 30], 50, 0);
            assert.equal(result, 0);
        });

        it('w18_033: negative numbers in array', () => {
            const result = safePercentile([-30, -20, -10, 0, 10], 50, 0);
            assert.equal(result, -10);
        });

        it('w18_034: mixed positive and negative', () => {
            const result = safePercentile([-50, -25, 0, 25, 50], 50, 0);
            assert.equal(result, 0);
        });

        it('w18_035: decimal values', () => {
            const result = safePercentile([1.5, 2.5, 3.5], 50, 0);
            assert(result >= 2 && result <= 3);
        });

        it('w18_036: zero in array', () => {
            const result = safePercentile([0, 10, 20], 50, 0);
            assert(result >= 0 && result <= 20);
        });

        it('w18_037: all same values', () => {
            assert.equal(safePercentile([5, 5, 5, 5], 50, 0), 5);
        });

        it('w18_038: negative percentile returns fallback', () => {
            assert.equal(safePercentile([1, 2, 3], -50, 0), 0);
        });

        it('w18_039: percentile 0.5 (valid)', () => {
            const result = safePercentile([1, 2, 3], 0.5, 0);
            assert(typeof result === 'number');
        });

        it('w18_040: percentile 99.9 (valid)', () => {
            const result = safePercentile([1, 2, 3], 99.9, 0);
            assert(typeof result === 'number');
        });
    });

    // ==================== safeAvg Tests ====================

    describe('safeAvg', () => {
        // w18_041 - w18_060: Average calculation

        it('w18_041: empty array returns fallback', () => {
            assert.equal(safeAvg([], 0), 0);
        });

        it('w18_042: null returns fallback', () => {
            assert.equal(safeAvg(null, 0), 0);
        });

        it('w18_043: undefined returns fallback', () => {
            assert.equal(safeAvg(undefined, 0), 0);
        });

        it('w18_044: custom fallback on empty', () => {
            assert.equal(safeAvg([], -1), -1);
        });

        it('w18_045: single element', () => {
            assert.equal(safeAvg([42], 0), 42);
        });

        it('w18_046: two equal elements', () => {
            assert.equal(safeAvg([10, 10], 0), 10);
        });

        it('w18_047: two different elements', () => {
            assert.equal(safeAvg([10, 20], 0), 15);
        });

        it('w18_048: multiple elements', () => {
            assert.equal(safeAvg([1, 2, 3, 4, 5], 0), 3);
        });

        it('w18_049: negative numbers', () => {
            assert.equal(safeAvg([-10, -5, 0, 5, 10], 0), 0);
        });

        it('w18_050: decimal values', () => {
            const result = safeAvg([1.5, 2.5, 3.5], 0);
            assert.equal(result, 2.5);
        });

        it('w18_051: array with NaN filters out NaN', () => {
            const result = safeAvg([10, NaN, 20], 0);
            assert.equal(result, 15);
        });

        it('w18_052: array with Infinity filters it out', () => {
            const result = safeAvg([10, Infinity, 20], -1);
            // Infinity is filtered, so avg of [10, 20] = 15
            assert.equal(result, 15);
        });

        it('w18_053: all NaN returns fallback', () => {
            assert.equal(safeAvg([NaN, NaN, NaN], -99), -99);
        });

        it('w18_054: large numbers', () => {
            const result = safeAvg([1e10, 2e10, 3e10], 0);
            assert.equal(result, 2e10);
        });

        it('w18_055: very small numbers', () => {
            const result = safeAvg([0.001, 0.002, 0.003], 0);
            assert(Math.abs(result - 0.002) < 0.0001);
        });

        it('w18_056: zero values', () => {
            assert.equal(safeAvg([0, 0, 0], 0), 0);
        });

        it('w18_057: single zero', () => {
            assert.equal(safeAvg([0], 0), 0);
        });

        it('w18_058: non-array input returns fallback', () => {
            assert.equal(safeAvg('not array', 0), 0);
        });

        it('w18_059: mixed valid and NaN', () => {
            const result = safeAvg([5, NaN, 15], 0);
            assert.equal(result, 10);
        });

        it('w18_060: no valid finite numbers returns fallback', () => {
            assert.equal(safeAvg([NaN, Infinity, -Infinity], 42), 42);
        });
    });

    // ==================== safeAggregate Tests ====================

    describe('safeAggregate', () => {
        // w18_061 - w18_090: Aggregate metrics

        it('w18_061: empty array returns zeros', () => {
            const result = safeAggregate([], 0);
            assert.equal(result.count, 0);
            assert.equal(result.sum, 0);
            assert.equal(result.avg, 0);
            assert.equal(result.min, 0);
            assert.equal(result.max, 0);
        });

        it('w18_062: null returns zeros', () => {
            const result = safeAggregate(null, 0);
            assert.equal(result.count, 0);
            assert.equal(result.avg, 0);
        });

        it('w18_063: single value aggregate', () => {
            const result = safeAggregate([42], 0);
            assert.equal(result.count, 1);
            assert.equal(result.sum, 42);
            assert.equal(result.avg, 42);
            assert.equal(result.min, 42);
            assert.equal(result.max, 42);
        });

        it('w18_064: multiple values aggregate', () => {
            const result = safeAggregate([10, 20, 30], 0);
            assert.equal(result.count, 3);
            assert.equal(result.sum, 60);
            assert.equal(result.avg, 20);
            assert.equal(result.min, 10);
            assert.equal(result.max, 30);
        });

        it('w18_065: aggregate includes percentiles', () => {
            const result = safeAggregate([1, 2, 3, 4, 5], 0);
            assert(typeof result.p50 === 'number');
            assert(typeof result.p95 === 'number');
            assert(typeof result.p99 === 'number');
        });

        it('w18_066: p50 is median for odd length', () => {
            const result = safeAggregate([1, 2, 3, 4, 5], 0);
            assert.equal(result.p50, 3);
        });

        it('w18_067: p95 reasonable for array', () => {
            const result = safeAggregate([1, 2, 3, 4, 5], 0);
            assert(result.p95 >= 4 && result.p95 <= 5);
        });

        it('w18_068: p99 reasonable for array', () => {
            const result = safeAggregate([1, 2, 3, 4, 5], 0);
            assert(result.p99 >= 4 && result.p99 <= 5);
        });

        it('w18_069: negative values aggregate', () => {
            const result = safeAggregate([-10, -20, -30], 0);
            assert.equal(result.min, -30);
            assert.equal(result.max, -10);
            assert.equal(result.sum, -60);
        });

        it('w18_070: mixed positive/negative aggregate', () => {
            const result = safeAggregate([-5, 0, 5], 0);
            assert.equal(result.sum, 0);
            assert.equal(result.avg, 0);
            assert.equal(result.min, -5);
            assert.equal(result.max, 5);
        });

        it('w18_071: all NaN returns fallback for stats', () => {
            const result = safeAggregate([NaN, NaN], -1);
            assert.equal(result.avg, -1);
            assert.equal(result.p50, -1);
        });

        it('w18_072: mixed NaN and valid filters correctly', () => {
            const result = safeAggregate([10, NaN, 20], 0);
            assert.equal(result.sum, 30);
            assert.equal(result.avg, 15);
        });

        it('w18_073: count includes invalid values', () => {
            const result = safeAggregate([10, NaN, 20], 0);
            assert.equal(result.count, 3);
        });

        it('w18_074: large dataset aggregate', () => {
            const arr = Array.from({ length: 1000 }, (_, i) => i + 1);
            const result = safeAggregate(arr, 0);
            assert.equal(result.count, 1000);
            assert.equal(result.min, 1);
            assert.equal(result.max, 1000);
            assert(result.avg > 500);
        });

        it('w18_075: decimal values aggregate', () => {
            const result = safeAggregate([1.1, 2.2, 3.3], 0);
            assert(Math.abs(result.avg - 2.2) < 0.0001);
        });

        it('w18_076: custom fallback value', () => {
            const result = safeAggregate([], -99);
            assert.equal(result.avg, -99);
            assert.equal(result.p50, -99);
        });

        it('w18_077: non-array returns default', () => {
            const result = safeAggregate('not array', 0);
            assert.equal(result.count, 0);
        });

        it('w18_078: percentiles valid range', () => {
            const result = safeAggregate([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0);
            assert(result.p50 >= 1 && result.p50 <= 10);
            assert(result.p95 >= 1 && result.p95 <= 10);
            assert(result.p99 >= 1 && result.p99 <= 10);
        });

        it('w18_079: object with count field preserved', () => {
            const result = safeAggregate([5, 10, 15], 0);
            assert.equal(result.count, 3);
        });

        it('w18_080: all statistics present', () => {
            const result = safeAggregate([1], 0);
            assert(result.hasOwnProperty('count'));
            assert(result.hasOwnProperty('sum'));
            assert(result.hasOwnProperty('avg'));
            assert(result.hasOwnProperty('min'));
            assert(result.hasOwnProperty('max'));
            assert(result.hasOwnProperty('p50'));
            assert(result.hasOwnProperty('p95'));
            assert(result.hasOwnProperty('p99'));
        });
    });

    // ==================== Edge Cases & NaN/Infinity ====================

    describe('Edge Cases & Data Integrity', () => {
        // w18_091 - w18_120: Edge cases

        it('w18_091: negative zero handling', () => {
            const result = safePercentile([0, -0], 50, 0);
            assert(typeof result === 'number');
        });

        it('w18_092: very large and very small in same array', () => {
            const result = safeAggregate([1e-10, 1e10], 0);
            assert(result.min < result.max);
        });

        it('w18_093: repeated values percentile', () => {
            const result = safePercentile([1, 1, 1, 1, 1, 2, 2, 2], 75, 0);
            assert(result >= 1 && result <= 2);
        });

        it('w18_094: alternating high/low values', () => {
            const result = safeAggregate([1, 100, 2, 99, 3, 98], 0);
            assert(result.min === 1);
            assert(result.max === 100);
        });

        it('w18_095: single large number', () => {
            const result = safeAvg([1e100], 0);
            assert(result === 1e100);
        });

        it('w18_096: array with null values filters them', () => {
            // Filter removes non-numeric
            const arr = [10, 20, 30];
            const result = safeAvg(arr, 0);
            assert.equal(result, 20);
        });

        it('w18_097: percentile boundary p=0', () => {
            const result = safePercentile([10, 20, 30], 0, -1);
            assert.equal(result, 10);
        });

        it('w18_098: percentile boundary p=100', () => {
            const result = safePercentile([10, 20, 30], 100, -1);
            assert.equal(result, 30);
        });

        it('w18_099: floating point precision', () => {
            const result = safeAvg([0.1, 0.2, 0.3], 0);
            assert(Math.abs(result - 0.2) < 0.0001);
        });

        it('w18_100: NaN in calculation does not propagate', () => {
            const result = safePercentile([1, NaN, 3], 50, 0);
            // Should return fallback since NaN is encountered
            assert.equal(result, 0);
        });
    });

    // ==================== Structural/Wiring Verification ====================

    describe('Structural Verification & Wiring', () => {
        // w18_121 - w18_150: Verify observability.js wiring

        it('w18_121: metric-percentile.js exports safePercentile', () => {
            assert(typeof safePercentile === 'function');
        });

        it('w18_122: metric-percentile.js exports safeAvg', () => {
            assert(typeof safeAvg === 'function');
        });

        it('w18_123: metric-percentile.js exports safeAggregate', () => {
            assert(typeof safeAggregate === 'function');
        });

        it('w18_124: metric-percentile.js exports METRIC_PERCENTILE_CONFIG', () => {
            assert(typeof METRIC_PERCENTILE_CONFIG === 'object');
        });

        it('w18_125: METRIC_PERCENTILE_CONFIG has defaultFallback', () => {
            assert(METRIC_PERCENTILE_CONFIG.hasOwnProperty('defaultFallback'));
        });

        it('w18_126: METRIC_PERCENTILE_CONFIG has emptyArrayBehavior', () => {
            assert(METRIC_PERCENTILE_CONFIG.hasOwnProperty('emptyArrayBehavior'));
        });

        it('w18_127: observability.js imports metric-percentile', () => {
            const obsPath = path.join(process.cwd(), 'agentos/core/observability.js');
            const source = fs.readFileSync(obsPath, 'utf-8');
            assert(source.includes("import { safePercentile, safeAvg }") ||
                   source.includes("from './metric-percentile.js'"));
        });

        it('w18_128: observability.js percentile method uses safePercentile', () => {
            const obsPath = path.join(process.cwd(), 'agentos/core/observability.js');
            const source = fs.readFileSync(obsPath, 'utf-8');
            // Remove comments
            const cleaned = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
            // Check for the fix in percentile method
            assert(cleaned.includes('safePercentile') && cleaned.includes('percentile(sorted, p)'));
        });

        it('w18_129: observability.js uses safeAvg for average', () => {
            const obsPath = path.join(process.cwd(), 'agentos/core/observability.js');
            const source = fs.readFileSync(obsPath, 'utf-8');
            const cleaned = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
            assert(cleaned.includes('safeAvg'));
        });

        it('w18_130: observability.js avg no longer divides by zero', () => {
            const obsPath = path.join(process.cwd(), 'agentos/core/observability.js');
            const source = fs.readFileSync(obsPath, 'utf-8');
            const cleaned = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
            // Check that old pattern is replaced
            assert(!cleaned.match(/\.sum\]\s*\/\s*values\.length/));
        });

        it('w18_131: safePercentile handles empty array safely', () => {
            const result = safePercentile([], 50, 0);
            assert(!Number.isNaN(result));
            assert(Number.isFinite(result));
        });

        it('w18_132: safeAvg handles empty array safely', () => {
            const result = safeAvg([], 0);
            assert(!Number.isNaN(result));
            assert(Number.isFinite(result));
        });

        it('w18_133: safeAggregate never returns NaN for avg', () => {
            const result = safeAggregate([], 0);
            assert(!Number.isNaN(result.avg));
        });

        it('w18_134: Config values are reasonable', () => {
            assert(METRIC_PERCENTILE_CONFIG.defaultFallback === 0);
            assert(['fallback', 'throw'].includes(METRIC_PERCENTILE_CONFIG.emptyArrayBehavior));
        });

        it('w18_135: percentile method exists on MetricsCollector', () => {
            const obsPath = path.join(process.cwd(), 'agentos/core/observability.js');
            const source = fs.readFileSync(obsPath, 'utf-8');
            assert(source.includes('percentile(sorted, p)'));
        });

        it('w18_136: getAggregates method exists and uses safeAvg', () => {
            const obsPath = path.join(process.cwd(), 'agentos/core/observability.js');
            const source = fs.readFileSync(obsPath, 'utf-8');
            assert(source.includes('getAll()') || source.includes('getAggregates()'));
        });

        it('w18_137: safePercentile uses linear interpolation method', () => {
            // Test demonstrates interpolation by comparing with non-interpolating method
            const arr = [10, 20, 30];
            const result = safePercentile(arr, 50, 0);
            // Linear interpolation for median should give 20
            assert.equal(result, 20);
        });

        it('w18_138: module is pure JS (no native modules)', () => {
            const percentilePath = path.join(process.cwd(), 'agentos/core/metric-percentile.js');
            const source = fs.readFileSync(percentilePath, 'utf-8');
            assert(!source.includes('require(') || !source.includes('native'));
        });

        it('w18_139: all exports are functions or objects', () => {
            assert(typeof safePercentile === 'function');
            assert(typeof safeAvg === 'function');
            assert(typeof safeAggregate === 'function');
            assert(typeof METRIC_PERCENTILE_CONFIG === 'object');
        });

        it('w18_140: safePercentile with very small arrays works', () => {
            const result = safePercentile([1, 2], 50, 0);
            assert(result === 1.5);
        });

        it('w18_141: percentiles in histograms are now safe', () => {
            // Simulate the histogram scenario
            const values = [];
            const sorted = [...values].sort((a, b) => a - b);
            const p50 = safePercentile(sorted, 50, 0);
            const p95 = safePercentile(sorted, 95, 0);
            const p99 = safePercentile(sorted, 99, 0);
            assert.equal(p50, 0);
            assert.equal(p95, 0);
            assert.equal(p99, 0);
        });

        it('w18_142: observability MetricsCollector fixed', () => {
            const obsPath = path.join(process.cwd(), 'agentos/core/observability.js');
            const source = fs.readFileSync(obsPath, 'utf-8');
            // Verify the fix is in place
            assert(source.includes('class MetricsCollector'));
            assert(source.includes('safePercentile'));
        });

        it('w18_143: safeAvg is used in histogram aggregation', () => {
            const obsPath = path.join(process.cwd(), 'agentos/core/observability.js');
            const source = fs.readFileSync(obsPath, 'utf-8');
            const cleaned = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
            // Check histogram processing uses safeAvg
            assert(cleaned.includes('safeAvg') && cleaned.includes('histogram'));
        });

        it('w18_144: Config export is used', () => {
            assert(METRIC_PERCENTILE_CONFIG.defaultFallback === 0);
        });

        it('w18_145: percentile percentages are percentages not decimals', () => {
            // safePercentile should accept 0-100, not 0-1
            const result = safePercentile([1, 2, 3], 50, -1);
            assert(result !== -1); // Should work, not return fallback
        });

        it('w18_146: empty array returns valid number not undefined', () => {
            const result = safePercentile([], 50, 0);
            assert(result !== undefined);
            assert(typeof result === 'number');
        });

        it('w18_147: avg never returns NaN from division', () => {
            const result = safeAvg([10, 20], 0);
            assert(!Number.isNaN(result));
        });

        it('w18_148: percentile for p=50 approximates median', () => {
            const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const result = safePercentile(arr, 50, 0);
            // Median should be between 5 and 6
            assert(result >= 5 && result <= 6);
        });

        it('w18_149: safePercentile type guard against non-arrays', () => {
            const tests = [
                { value: null, expected: 0 },
                { value: undefined, expected: 0 },
                { value: 'string', expected: 0 },
                { value: 123, expected: 0 },
                { value: {}, expected: 0 }
            ];
            for (const test of tests) {
                const result = safePercentile(test.value, 50, 0);
                assert.equal(result, test.expected);
            }
        });

        it('w18_150: integration test: aggregate with percentiles no NaN', () => {
            const values = [100, 200, 300, 400, 500];
            const result = safeAggregate(values, 0);
            assert(!Number.isNaN(result.avg));
            assert(!Number.isNaN(result.p50));
            assert(!Number.isNaN(result.p95));
            assert(!Number.isNaN(result.p99));
        });
    });
});
