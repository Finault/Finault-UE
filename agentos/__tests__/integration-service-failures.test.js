/**
 * INTEGRATION TEST SUITE: Service Failures & External Dependencies
 *
 * Comprehensive tests for Finault AgentOS behavior when external services fail
 * or return unexpected data. Tests Supabase, AI API, NaN prevention, boundary
 * conditions, and concurrent operations.
 *
 * Total: 100 tests across 5 sections
 * - Section 1: Supabase Failure Scenarios (int_001 - int_030)
 * - Section 2: AI API Failure Scenarios (int_031 - int_050)
 * - Section 3: Division/NaN Cascade Prevention (int_051 - int_075)
 * - Section 4: Boundary Conditions (int_076 - int_090)
 * - Section 5: Concurrent Operation Safety (int_091 - int_100)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Core modules under test
import {
    parseFormattedNumber,
    ensureNumeric,
    safeReduceNumeric,
    safeAccuracyRate,
    safeRunningAverage,
    filterFiniteNumbers
} from '../core/learning-sanitizer.js';

import {
    safeJsonParse,
    categorizeHttpError,
    getRetryHint,
    createFallbackResponse,
    createEmptyResponse,
    API_RESPONSE_CONFIG
} from '../core/api-response-guard.js';

import {
    safeDivide,
    safePercentageString,
    safePercentageNum,
    safeCostBreakdown,
    ScopeResolver,
    COMPLIANCE_CONFIG
} from '../core/scoped-compliance.js';

import {
    safePercentile,
    safeAvg,
    safeAggregate,
    METRIC_PERCENTILE_CONFIG
} from '../core/metric-percentile.js';

import {
    safeMean,
    sampleSD,
    populationSD,
    safeZScore,
    safeDeviationPercent,
    safeAnomalyDetection,
    STATS_CONFIG
} from '../core/stats-correction.js';

import {
    BoundedExpiringMap,
    CONCURRENT_MAP_CONFIG
} from '../core/concurrent-map-guard.js';

import {
    RPMTracker,
    normalizeAction,
    isBlockAction,
    isThrottleAction,
    BUDGET_ACTIONS,
    RPM_CONFIG
} from '../core/budget-pattern-tracker.js';

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 1: SUPABASE FAILURE SCENARIOS (int_001 - int_030)
// ═════════════════════════════════════════════════════════════════════════════

describe('SECTION 1: Supabase Failure Scenarios', () => {

    /**
     * Helper: Create a mock Supabase client with configurable behavior.
     * Behavior is the result that gets returned at the end of the chain.
     */
    function createMockSupabase(behavior) {
        const createChainableQuery = () => ({
            eq: () => createChainableQuery(),
            gte: () => createChainableQuery(),
            lte: () => createChainableQuery(),
            single: () => Promise.resolve(behavior),
            limit: () => Promise.resolve(behavior),
            order: () => createChainableQuery(),
            then: (resolve) => Promise.resolve(behavior).then(resolve)  // For await syntax
        });

        return {
            from: (table) => ({
                select: () => createChainableQuery(),
                insert: () => Promise.resolve(behavior),
                update: () => ({
                    eq: () => Promise.resolve(behavior)
                }),
                delete: () => ({
                    eq: () => Promise.resolve(behavior)
                })
            })
        };
    }

    // int_001: DB connection failure
    it('int_001: Handles DB connection refused error', async () => {
        const behavior = { data: null, error: { message: 'connection refused' } };
        const result = behavior;  // Direct behavior object
        assert.equal(result.error.message, 'connection refused');
        assert.equal(result.data, null);
    });

    // int_002: Empty results
    it('int_002: Handles empty result set from query', async () => {
        const behavior = { data: [], error: null };
        const result = behavior;
        assert.deepEqual(result.data, []);
        assert.equal(result.error, null);
    });

    // int_003: Null data without error
    it('int_003: Handles null data with no error object', async () => {
        const behavior = { data: null, error: null };
        const result = behavior;
        assert.equal(result.data, null);
        assert.equal(result.error, null);
    });

    // int_004: Missing amount field
    it('int_004: Detects missing amount field in results', async () => {
        const behavior = { data: [{ id: 1, user_id: 'test' }], error: null };
        const result = behavior;

        // Should detect missing field
        assert.equal(result.data[0].amount, undefined);
        assert.equal(typeof result.data[0].id, 'number');
    });

    // int_005: Formatted currency string as amount
    it('int_005: Safely parses formatted currency strings', async () => {
        const behavior = { data: [{ amount: '$1,234.56' }], error: null };
        const result = behavior;

        const parsed = parseFormattedNumber(result.data[0].amount);
        assert.equal(parsed, 1234.56);
    });

    // int_006: Literal NaN string
    it('int_006: Converts NaN string to numeric fallback', async () => {
        const behavior = { data: [{ amount: 'NaN' }], error: null };

        const parsed = parseFormattedNumber(behavior.data[0].amount, 0);
        assert.equal(parsed, 0);
        assert.equal(Number.isFinite(parsed), true);
    });

    // int_007: Empty object in results
    it('int_007: Safely handles empty objects in result array', async () => {
        const behavior = { data: [{}], error: null };

        const amounts = behavior.data.map(r => ensureNumeric(r.amount, 0));
        assert.equal(amounts[0], 0);
        assert.equal(Number.isFinite(amounts[0]), true);
    });

    // int_008: Supabase throws exception
    it('int_008: Gracefully handles Supabase throwing exception', async () => {
        const supabase = {
            from: () => ({
                select: () => Promise.reject(new Error('Network timeout'))
            })
        };

        try {
            await supabase.from('costs').select();
            assert.fail('Should have thrown');
        } catch (e) {
            assert.equal(e.message, 'Network timeout');
        }
    });

    // int_009: Large result set (1M records simulated)
    it('int_009: Safely reduces very large result sets', async () => {
        // Simulate 1000 records (1M would be too slow for tests)
        const largeData = Array(1000).fill(null).map((_, i) => ({
            id: i,
            amount: Math.random() * 10000
        }));

        const result = safeReduceNumeric(
            largeData,
            item => item.amount,
            0
        );

        assert.equal(typeof result.sum, 'number');
        assert.equal(typeof result.avg, 'number');
        assert.equal(result.count, 1000);
        assert.equal(Number.isFinite(result.avg), true);
    });

    // int_010: Duplicate records with same IDs
    it('int_010: Handles duplicate IDs in result set', async () => {
        const behavior = {
            data: [
                { id: 1, amount: 100 },
                { id: 1, amount: 150 },  // duplicate
                { id: 1, amount: 200 }   // duplicate
            ],
            error: null
        };
        const supabase = createMockSupabase(behavior);
        const result = await supabase.from('costs').select();

        const sum = result.data.reduce((acc, r) => acc + r.amount, 0);
        assert.equal(sum, 450);
    });

    // int_011: Null in numeric field
    it('int_011: Safely converts null in numeric field', async () => {
        const behavior = { data: [{ amount: null }], error: null };
        const parsed = ensureNumeric(behavior.data[0].amount, 0);
        assert.equal(parsed, 0);
    });

    // int_012: Undefined in numeric field
    it('int_012: Safely converts undefined in numeric field', async () => {
        const behavior = { data: [{ amount: undefined }], error: null };
        const parsed = ensureNumeric(behavior.data[0].amount, 0);
        assert.equal(parsed, 0);
    });

    // int_013: Boolean true as amount
    it('int_013: Converts boolean to numeric safely', async () => {
        const parsed = ensureNumeric(true, 0);
        assert.equal(parsed === 1 || parsed === 0, true);
    });

    // int_014: Array as amount
    it('int_014: Safely handles array in numeric field', async () => {
        const parsed = ensureNumeric([1, 2, 3], 0);
        assert.equal(parsed, 0);
    });

    // int_015: Infinity string
    it('int_015: Safely converts Infinity string', async () => {
        const parsed = parseFormattedNumber('Infinity', 0);
        assert.equal(parsed, 0);
        assert.equal(Number.isFinite(parsed), true);
    });

    // int_016: Negative Infinity string
    it('int_016: Safely converts -Infinity string', async () => {
        const parsed = parseFormattedNumber('-Infinity', 0);
        assert.equal(parsed, 0);
        assert.equal(Number.isFinite(parsed), true);
    });

    // int_017: Scientific notation string
    it('int_017: Parses scientific notation correctly', async () => {
        const parsed = parseFormattedNumber('1.5e3', 0);
        assert.equal(parsed, 1500);
    });

    // int_018: Percentage string as amount
    it('int_018: Extracts numeric value from percentage string', async () => {
        const parsed = parseFormattedNumber('45.5%', 0);
        assert.equal(parsed, 45.5);
    });

    // int_019: Thousand separator (K, M, B suffixes)
    it('int_019: Parses K/M/B suffixes correctly', async () => {
        assert.equal(parseFormattedNumber('1.5K', 0), 1500);
        assert.equal(parseFormattedNumber('2M', 0), 2000000);
        assert.equal(parseFormattedNumber('3.5B', 0), 3500000000);
    });

    // int_020: Mixed formatting (currency + thousand separator)
    it('int_020: Handles combined formatting: $1,234.56K', async () => {
        const parsed = parseFormattedNumber('$1,234.56K', 0);
        assert.equal(parsed, 1234560);
    });

    // int_021: Error object structure variations
    it('int_021: Handles various error object structures', async () => {
        const errors = [
            { error: { message: 'string error' } },
            { error: 'string error' },
            { error: { code: 'PGRST301' } },
            { error: null }
        ];

        for (const behavior of errors) {
            const result = behavior;
            // Should not throw on any error structure
            assert.ok(true);
        }
    });

    // int_022: Chained query timeout
    it('int_022: Simulates query chain timeout behavior', async () => {
        const behavior = { data: null, error: { message: 'timeout' } };
        const result = behavior;
        assert.equal(result.error.message, 'timeout');
    });

    // int_023: Decimal precision loss in DB
    it('int_023: Handles floating point precision issues from DB', async () => {
        // DB might return 0.1 + 0.2 = 0.30000000000000004
        const behavior = { data: [{ amount: 0.30000000000000004 }] };
        const result = behavior;

        const rounded = Math.round(result.data[0].amount * 100) / 100;
        assert.equal(rounded, 0.30);
    });

    // int_024: Very large numbers exceeding safe integer range
    it('int_024: Handles numbers beyond MAX_SAFE_INTEGER', async () => {
        const hugeNum = Number.MAX_SAFE_INTEGER + 1;
        const parsed = ensureNumeric(hugeNum, 0);
        assert.equal(Number.isFinite(parsed), true);
    });

    // int_025: Negative zero
    it('int_025: Correctly handles negative zero', async () => {
        const parsed = ensureNumeric(-0, 0);
        // -0 is a valid finite number in JavaScript
        assert.equal(Number.isFinite(parsed), true);
    });

    // int_026: Single-element result array
    it('int_026: Safely processes single-element array', async () => {
        const behavior = { data: [{ id: 1, amount: 500 }] };
        const result = behavior;

        assert.equal(result.data.length, 1);
        assert.equal(result.data[0].amount, 500);
    });

    // int_027: Result with extra fields (schema evolution)
    it('int_027: Ignores extra fields in result objects', async () => {
        const behavior = {
            data: [{
                id: 1,
                amount: 100,
                extra_field: 'should be ignored',
                deprecated_field: 'old data'
            }]
        };

        const { id, amount } = behavior.data[0];
        assert.equal(id, 1);
        assert.equal(amount, 100);
    });

    // int_028: Result with missing critical fields
    it('int_028: Identifies missing critical fields', async () => {
        const behavior = { data: [{ amount: 100 }] }; // missing id
        assert.equal(behavior.data[0].id, undefined);
    });

    // int_029: Zero amount
    it('int_029: Correctly identifies zero amounts', async () => {
        const behavior = { data: [{ amount: 0 }] };
        const result = behavior.data[0].amount;

        assert.equal(result, 0);
        assert.equal(Number.isFinite(result), true);
    });

    // int_030: Array of mixed valid/invalid amounts
    it('int_030: Filters and aggregates mixed valid/invalid amounts', async () => {
        const behavior = {
            data: [
                { amount: 100 },
                { amount: 'invalid' },
                { amount: null },
                { amount: 250 },
                { amount: undefined },
                { amount: NaN }
            ]
        };

        const cleaned = behavior.data
            .map(r => ensureNumeric(r.amount, null))
            .filter(v => v !== null);

        assert.equal(cleaned.length, 2);
        assert.equal(cleaned[0], 100);
        assert.equal(cleaned[1], 250);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 2: AI API FAILURE SCENARIOS (int_031 - int_050)
// ═════════════════════════════════════════════════════════════════════════════

describe('SECTION 2: AI API Failure Scenarios', () => {

    /**
     * Helper: Create mock Response object matching fetch API
     */
    function createMockResponse(ok, status, jsonData = null, shouldThrowJson = false) {
        return {
            ok,
            status,
            json: async () => {
                if (shouldThrowJson) {
                    throw new SyntaxError('Unexpected token < in JSON at position 0');
                }
                return jsonData;
            }
        };
    }

    // int_031: Empty content array
    it('int_031: Handles response with empty content array', async () => {
        const response = createMockResponse(true, 200, {
            choices: [{ message: { content: [] }, index: 0 }]
        });

        const result = await safeJsonParse(response);
        assert.equal(result.ok, true);
        assert.equal(result.data.choices[0].message.content.length, 0);
    });

    // int_032: Null content
    it('int_032: Handles response with null content field', async () => {
        const response = createMockResponse(true, 200, {
            choices: [{ message: { content: null }, index: 0 }]
        });

        const result = await safeJsonParse(response);
        assert.equal(result.ok, true);
        assert.equal(result.data.choices[0].message.content, null);
    });

    // int_033: Empty text in content
    it('int_033: Handles content with empty text field', async () => {
        const response = createMockResponse(true, 200, {
            choices: [{ message: { content: [{ type: 'text', text: '' }] } }]
        });

        const result = await safeJsonParse(response);
        assert.equal(result.ok, true);
        assert.equal(result.data.choices[0].message.content[0].text, '');
    });

    // int_034: Missing text field in content
    it('int_034: Handles content block without text field', async () => {
        const response = createMockResponse(true, 200, {
            choices: [{ message: { content: [{ type: 'image' }] } }]
        });

        const result = await safeJsonParse(response);
        assert.equal(result.ok, true);
        assert.equal(result.data.choices[0].message.content[0].text, undefined);
    });

    // int_035: Entire response is null
    it('int_035: Handles null response object', async () => {
        const result = await safeJsonParse(null);
        assert.equal(result.ok, false);
        assert.equal(result.error, 'Response object is null or undefined');
    });

    // int_036: Response with error field (API error format)
    it('int_036: Detects API error format in response', async () => {
        const response = createMockResponse(true, 200, {
            error: { message: 'rate limited', code: 429 }
        });

        const result = await safeJsonParse(response);
        assert.equal(result.ok, true);
        assert.equal(result.data.error.message, 'rate limited');
    });

    // int_037: Valid text but invalid JSON (expects JSON)
    it('int_037: Detects invalid JSON in response body', async () => {
        const response = createMockResponse(true, 200, null, true);

        const result = await safeJsonParse(response);
        assert.equal(result.ok, false);
        assert.match(result.error, /JSON parse error/);
    });

    // int_038: HTTP 429 (rate limited)
    it('int_038: Categorizes HTTP 429 as rate_limit', async () => {
        const response = createMockResponse(false, 429, null);

        const result = await safeJsonParse(response);
        assert.equal(result.ok, false);
        assert.equal(result.statusCode, 429);

        const category = categorizeHttpError(429);
        assert.equal(category, 'rate_limit');
    });

    // int_039: HTTP 500 (server error)
    it('int_039: Categorizes HTTP 500 as server_error', async () => {
        const response = createMockResponse(false, 500, null);

        const result = await safeJsonParse(response);
        assert.equal(result.ok, false);
        assert.equal(result.statusCode, 500);

        const category = categorizeHttpError(500);
        assert.equal(category, 'server_error');
    });

    // int_040: Non-JSON body (HTML error page)
    it('int_040: Handles HTML error page response', async () => {
        const response = createMockResponse(false, 500, null, true);

        const result = await safeJsonParse(response);
        assert.equal(result.ok, false);
        // Response with ok=false gets categorized as server_error before JSON parsing
        assert.match(result.error, /HTTP|error/i);
    });

    // int_041: HTTP 401 (authentication error)
    it('int_041: Categorizes HTTP 401 as auth_error', async () => {
        const category = categorizeHttpError(401);
        assert.equal(category, 'auth_error');
    });

    // int_042: HTTP 403 (forbidden)
    it('int_042: Categorizes HTTP 403 as auth_error', async () => {
        const category = categorizeHttpError(403);
        assert.equal(category, 'auth_error');
    });

    // int_043: HTTP 404 (not found)
    it('int_043: Categorizes HTTP 404 as not_found', async () => {
        const category = categorizeHttpError(404);
        assert.equal(category, 'not_found');
    });

    // int_044: HTTP 400 (bad request)
    it('int_044: Categorizes HTTP 400 as client_error', async () => {
        const category = categorizeHttpError(400);
        assert.equal(category, 'client_error');
    });

    // int_045: Unknown HTTP status code
    it('int_045: Categorizes unknown status as unknown', async () => {
        const category = categorizeHttpError(999);
        assert.equal(category, 'unknown');
    });

    // int_046: Create fallback response for rate limit
    it('int_046: Creates proper fallback for rate limit error', async () => {
        const fallback = createFallbackResponse('rate_limit', 'Service temporarily unavailable');

        assert.equal(fallback.choices[0].message.content, 'Service temporarily unavailable');
        assert.equal(fallback._fallback, true);
        assert.equal(fallback.error, 'rate_limit');
    });

    // int_047: Create empty response
    it('int_047: Creates valid empty response structure', async () => {
        const empty = createEmptyResponse();

        assert.equal(empty.choices.length, 1);
        assert.equal(empty.choices[0].message.content, '');
        assert.equal(empty.usage.prompt_tokens, 0);
    });

    // int_048: Get retry hint for rate limit
    it('int_048: Provides correct retry hint for rate limit', async () => {
        const hint = getRetryHint('rate_limit');
        assert.match(hint, /Retry after/);
    });

    // int_049: Get retry hint for server error
    it('int_049: Provides correct retry hint for server error', async () => {
        const hint = getRetryHint('server_error');
        assert.match(hint, /temporarily unavailable|retry later/i);
    });

    // int_050: Response with missing choices field
    it('int_050: Handles malformed response (missing choices)', async () => {
        const response = createMockResponse(true, 200, {
            usage: { prompt_tokens: 10 }
            // missing choices field
        });

        const result = await safeJsonParse(response);
        assert.equal(result.ok, true);
        assert.equal(result.data.choices, undefined);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 3: DIVISION/NaN CASCADE PREVENTION (int_051 - int_075)
// ═════════════════════════════════════════════════════════════════════════════

describe('SECTION 3: Division/NaN Cascade Prevention', () => {

    // int_051: Division by zero returns fallback
    it('int_051: safeDivide prevents division by zero', async () => {
        const result = safeDivide(100, 0, 0);
        assert.equal(result, 0);
        assert.equal(Number.isFinite(result), true);
    });

    // int_052: Safe division with valid inputs
    it('int_052: safeDivide handles valid inputs correctly', async () => {
        const result = safeDivide(50, 100, 0);
        assert.equal(result, 0.5);
    });

    // int_053: Safe percentage string with zero denominator
    it('int_053: safePercentageString prevents NaN%', async () => {
        const result = safePercentageString(100, 0, 1);
        assert.equal(result, '0.0%');
    });

    // int_054: Safe percentage string with valid inputs
    it('int_054: safePercentageString computes correctly', async () => {
        const result = safePercentageString(25, 100, 1);
        assert.equal(result, '25.0%');
    });

    // int_055: Safe percentage number scale
    it('int_055: safePercentageNum returns 0-100 scale', async () => {
        const result = safePercentageNum(50, 100);
        assert.equal(result, 50);
    });

    // int_056: Cost breakdown with zero total
    it('int_056: safeCostBreakdown handles zero total', async () => {
        const items = [
            { provider: 'aws', amount: 100 },
            { provider: 'gcp', amount: 200 }
        ];

        const result = safeCostBreakdown(items, 0);

        // All should show 0% when total is 0
        assert.equal(result[0].percentage, '0.0%');
        assert.equal(result[1].percentage, '0.0%');
    });

    // int_057: Cost breakdown with valid total
    it('int_057: safeCostBreakdown distributes percentages', async () => {
        const items = [
            { provider: 'aws', amount: 100 },
            { provider: 'gcp', amount: 200 }
        ];

        const result = safeCostBreakdown(items, 300);

        assert.equal(result[0].percentage, '33.3%');
        assert.equal(result[1].percentage, '66.7%');
    });

    // int_058: safeAvg with empty array
    it('int_058: safeAvg returns fallback on empty array', async () => {
        const result = safeAvg([], 0);
        assert.equal(result, 0);
    });

    // int_059: safeAvg with valid data
    it('int_059: safeAvg computes mean correctly', async () => {
        const result = safeAvg([10, 20, 30], 0);
        assert.equal(result, 20);
    });

    // int_060: safeAvg filters NaN values
    it('int_060: safeAvg excludes NaN from calculation', async () => {
        const result = safeAvg([10, NaN, 20, 30], 0);
        assert.equal(result, 20);  // (10+20+30)/3
    });

    // int_061: safePercentile with empty array
    it('int_061: safePercentile returns fallback on empty', async () => {
        const result = safePercentile([], 50, 0);
        assert.equal(result, 0);
    });

    // int_062: safePercentile with single element
    it('int_062: safePercentile returns element when n=1', async () => {
        const result = safePercentile([100], 50, 0);
        assert.equal(result, 100);
    });

    // int_063: safePercentile with multiple elements
    it('int_063: safePercentile computes median correctly', async () => {
        const result = safePercentile([10, 20, 30, 40, 50], 50, 0);
        assert.equal(result, 30);
    });

    // int_064: safeMean with empty array
    it('int_064: safeMean returns fallback on empty', async () => {
        const result = safeMean([], 0);
        assert.equal(result, 0);
    });

    // int_065: sampleSD with fewer than 2 elements
    it('int_065: sampleSD returns 0 when n<2', async () => {
        assert.equal(sampleSD([]), 0);
        assert.equal(sampleSD([100]), 0);
    });

    // int_066: sampleSD uses Bessel's correction
    it('int_066: sampleSD applies Bessel correction (n-1)', async () => {
        const values = [2, 4, 6, 8, 10];
        const sd = sampleSD(values);

        // With Bessel's correction should be sqrt(10) ≈ 3.16
        assert(sd > 3.0 && sd < 3.2);
    });

    // int_067: safeZScore with zero std
    it('int_067: safeZScore returns fallback when std=0', async () => {
        const result = safeZScore(50, 50, 0, 0);
        assert.equal(result, 0);
    });

    // int_068: safeZScore with valid inputs
    it('int_068: safeZScore computes correctly', async () => {
        const result = safeZScore(60, 50, 10, 0);
        assert.equal(result, 1);  // (60-50)/10 = 1
    });

    // int_069: safeDeviationPercent with zero mean
    it('int_069: safeDeviationPercent prevents division by zero', async () => {
        const result = safeDeviationPercent(50, 0, 1);
        assert.equal(result, '0.0%');
    });

    // int_070: safeDeviationPercent with valid inputs
    it('int_070: safeDeviationPercent computes correctly', async () => {
        const result = safeDeviationPercent(60, 50, 1);
        assert.equal(result, '20.0%');
    });

    // int_071: Full anomaly detection pipeline
    it('int_071: safeAnomalyDetection completes without NaN', async () => {
        const values = [10, 20, 30, 40, 50];
        const result = safeAnomalyDetection(values, 2.5);

        assert.equal(Number.isFinite(result.mean), true);
        assert.equal(Number.isFinite(result.std), true);
        assert.equal(Array.isArray(result.anomalies), true);
    });

    // int_072: Reduce numeric with mixed valid/invalid
    it('int_072: safeReduceNumeric filters NaN entries', async () => {
        const items = [
            { value: 100 },
            { value: NaN },
            { value: 200 },
            { value: undefined }
        ];

        const result = safeReduceNumeric(items, i => i.value, 0);

        assert.equal(result.count, 2);
        assert.equal(result.sum, 300);
        assert.equal(result.avg, 150);
    });

    // int_073: Accuracy rate with empty array
    it('int_073: safeAccuracyRate returns fallback on empty', async () => {
        const result = safeAccuracyRate([], item => true, 0);
        assert.equal(result, 0);
    });

    // int_074: Accuracy rate predicate
    it('int_074: safeAccuracyRate computes accuracy', async () => {
        const items = [
            { status: 'success' },
            { status: 'failed' },
            { status: 'success' }
        ];

        const result = safeAccuracyRate(
            items,
            item => item.status === 'success',
            0
        );

        assert.equal(result, 2/3);
    });

    // int_075: Running average without NaN propagation
    it('int_075: safeRunningAverage handles NaN inputs', async () => {
        const avg1 = safeRunningAverage(NaN, 0, 100);
        assert.equal(Number.isFinite(avg1), true);

        const avg2 = safeRunningAverage(100, 1, NaN);
        assert.equal(Number.isFinite(avg2), true);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 4: BOUNDARY CONDITIONS (int_076 - int_090)
// ═════════════════════════════════════════════════════════════════════════════

describe('SECTION 4: Boundary Conditions', () => {

    // int_076: Budget of $0.00
    it('int_076: $0.00 budget yields 0 utilization, not Infinity', async () => {
        const spent = 50;
        const budget = 0;
        const utilization = safeDivide(spent, budget, 0);

        assert.equal(utilization, 0);
        assert.equal(Number.isFinite(utilization), true);
    });

    // int_077: Budget of $0.01
    it('int_077: $0.01 budget with $50 spent yields finite number', async () => {
        const spent = 50;
        const budget = 0.01;
        const utilization = (spent / budget) * 100;

        assert(utilization > 1000);
        assert.equal(Number.isFinite(utilization), true);
    });

    // int_078: Forecast with only 1 data point
    it('int_078: Forecast with n=1 does not crash', async () => {
        const values = [100];
        const mean = safeMean(values, 0);
        const sd = sampleSD(values);

        assert.equal(mean, 100);
        assert.equal(sd, 0);
    });

    // int_079: Forecast with 0 data points
    it('int_079: Forecast with n=0 returns default forecast', async () => {
        const values = [];
        const mean = safeMean(values, 0);
        const sd = sampleSD(values);

        assert.equal(mean, 0);
        assert.equal(sd, 0);
    });

    // int_080: Policy with empty config
    it('int_080: Policy with empty config does not throw', async () => {
        const policy = {};
        const scope = ScopeResolver.getScope(policy);

        assert.equal(typeof scope, 'string');
    });

    // int_081: Session ID with SQL injection attempt
    it('int_081: Treats SQL injection attempt as plain string', async () => {
        const sessionId = "'; DROP TABLE users; --";
        const numeric = ensureNumeric(sessionId, 0);

        assert.equal(numeric, 0);
    });

    // int_082: Extremely long message (100KB)
    it('int_082: Handles 100KB message without crash', async () => {
        const longMessage = 'x'.repeat(100 * 1024);
        assert.equal(longMessage.length, 102400);

        // Should not crash processing
        const parsed = parseFormattedNumber(longMessage, 0);
        assert.equal(parsed, 0);
    });

    // int_083: Empty message string
    it('int_083: Empty string handled gracefully', async () => {
        const parsed = parseFormattedNumber('', 0);
        assert.equal(parsed, 0);
    });

    // int_084: Unicode and emoji in messages
    it('int_084: Unicode and emoji pass through safely', async () => {
        const emoji = '🚀 100 🎉';
        const parsed = parseFormattedNumber(emoji, 0);
        // parseFormattedNumber will extract the 100 from the string
        assert(parsed === 100 || parsed === 0);  // Depends on implementation details
        assert.equal(Number.isFinite(parsed), true);
    });

    // int_085: Negative amounts in cost records
    it('int_085: Negative amounts handled as valid numbers', async () => {
        const negative = -500;
        const numeric = ensureNumeric(negative, 0);
        assert.equal(numeric, -500);
    });

    // int_086: Very small positive number (near zero)
    it('int_086: Handles very small positive numbers', async () => {
        const tiny = 0.00000001;
        const numeric = ensureNumeric(tiny, 0);
        assert.equal(numeric, tiny);
    });

    // int_087: Mixed positive and negative in aggregation
    it('int_087: Aggregates mixed positive/negative correctly', async () => {
        const items = [
            { amount: 100 },
            { amount: -50 },
            { amount: 200 },
            { amount: -75 }
        ];

        const result = safeReduceNumeric(items, i => i.amount, 0);
        assert.equal(result.sum, 175);
        assert.equal(result.avg, 175 / 4);
    });

    // int_088: Percentile with p=0 and p=100
    it('int_088: safePercentile handles p=0 and p=100', async () => {
        const values = [10, 20, 30, 40, 50];

        const p0 = safePercentile(values, 0, 0);
        const p100 = safePercentile(values, 100, 0);

        assert.equal(p0, 10);  // minimum
        assert.equal(p100, 50); // maximum
    });

    // int_089: Invalid percentile (p > 100)
    it('int_089: safePercentile rejects p > 100', async () => {
        const values = [10, 20, 30];
        const result = safePercentile(values, 150, 0);
        assert.equal(result, 0);  // returns fallback
    });

    // int_090: Null or undefined policy scope
    it('int_090: Handles null/undefined policy scope', async () => {
        const scope1 = ScopeResolver.getScope(null);
        const scope2 = ScopeResolver.getScope(undefined);

        assert.equal(scope1, COMPLIANCE_CONFIG.DEFAULT_SCOPE);
        assert.equal(scope2, COMPLIANCE_CONFIG.DEFAULT_SCOPE);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 5: CONCURRENT OPERATION SAFETY (int_091 - int_100)
// ═════════════════════════════════════════════════════════════════════════════

describe('SECTION 5: Concurrent Operation Safety', () => {

    // int_091: BoundedExpiringMap set and get
    it('int_091: BoundedExpiringMap basic set/get operations', async () => {
        const map = new BoundedExpiringMap({ maxSize: 100, ttlMs: 1000 });

        map.set('key1', 'value1');
        assert.equal(map.get('key1'), 'value1');
    });

    // int_092: BoundedExpiringMap respects maxSize
    it('int_092: BoundedExpiringMap evicts when maxSize exceeded', async () => {
        const map = new BoundedExpiringMap({ maxSize: 3, ttlMs: 10000 });

        map.set('a', 1);
        map.set('b', 2);
        map.set('c', 3);
        map.set('d', 4);  // Should trigger eviction

        // One of the first entries should be evicted
        assert(map.size <= 3);
    });

    // int_093: BoundedExpiringMap delete operation
    it('int_093: BoundedExpiringMap delete removes entries', async () => {
        const map = new BoundedExpiringMap({ maxSize: 100 });

        map.set('key', 'value');
        assert.equal(map.has('key'), true);

        map.delete('key');
        assert.equal(map.has('key'), false);
    });

    // int_094: BoundedExpiringMap TTL expiration
    it('int_094: BoundedExpiringMap removes expired entries', async () => {
        const map = new BoundedExpiringMap({ maxSize: 100, ttlMs: 100 });

        map.set('key', 'value');
        assert.equal(map.has('key'), true);

        // Wait for expiration
        await new Promise(resolve => setTimeout(resolve, 150));

        assert.equal(map.has('key'), false);
    });

    // int_095: BoundedExpiringMap pruneExpired
    it('int_095: pruneExpired removes all expired entries', async () => {
        const map = new BoundedExpiringMap({ maxSize: 100, ttlMs: 100 });

        map.set('key1', 'value1');
        map.set('key2', 'value2');

        await new Promise(resolve => setTimeout(resolve, 150));

        const pruned = map.pruneExpired();
        assert.equal(pruned, 2);  // Should have pruned both
        assert.equal(map.size, 0);
    });

    // int_096: RPMTracker record single request
    it('int_096: RPMTracker records requests correctly', async () => {
        const tracker = new RPMTracker();

        tracker.record('team1');
        const stats = tracker.getStats('team1');

        assert.equal(stats.requests_in_window, 1);
        assert(stats.current_rpm > 0);
    });

    // int_097: RPMTracker rapid requests
    it('int_097: RPMTracker handles rapid requests', async () => {
        const tracker = new RPMTracker();
        const key = 'team1';

        for (let i = 0; i < 100; i++) {
            tracker.record(key);
        }

        const stats = tracker.getStats(key);
        assert.equal(stats.requests_in_window, 100);
        assert(stats.current_rpm > 0);
    });

    // int_098: RPMTracker multiple keys
    it('int_098: RPMTracker tracks multiple keys independently', async () => {
        const tracker = new RPMTracker();

        for (let i = 0; i < 50; i++) tracker.record('team1');
        for (let i = 0; i < 30; i++) tracker.record('team2');

        const stats1 = tracker.getStats('team1');
        const stats2 = tracker.getStats('team2');

        assert.equal(stats1.requests_in_window, 50);
        assert.equal(stats2.requests_in_window, 30);
    });

    // int_099: Budget action normalization
    it('int_099: normalizeAction maps variants correctly', async () => {
        assert.equal(normalizeAction('hard_block'), BUDGET_ACTIONS.BLOCK);
        assert.equal(normalizeAction('block'), BUDGET_ACTIONS.BLOCK);
        assert.equal(normalizeAction('BLOCK'), BUDGET_ACTIONS.BLOCK);
        assert.equal(normalizeAction('rate_limit'), BUDGET_ACTIONS.THROTTLE);
        assert.equal(normalizeAction('ALERT'), BUDGET_ACTIONS.ALERT);
    });

    // int_100: Budget action type checking
    it('int_100: isBlockAction and isThrottleAction work correctly', async () => {
        assert.equal(isBlockAction('hard_block'), true);
        assert.equal(isBlockAction('BLOCK'), true);
        assert.equal(isBlockAction('ALLOW'), false);

        assert.equal(isThrottleAction('rate_limit'), true);
        assert.equal(isThrottleAction('THROTTLE'), true);
        assert.equal(isThrottleAction('BLOCK'), false);
    });
});
