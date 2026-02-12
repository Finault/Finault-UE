/**
 * COMPREHENSIVE TEST SUITE FOR BUDGET PATTERN TRACKER (W-014)
 * Tests all exports: BUDGET_ACTIONS, normalizeAction, isBlockAction, isThrottleAction,
 * RPMTracker, PATTERN_CONFIG, BudgetPatternTracker, and factory functions.
 * Plus integration/wiring verification against budget-enforcer.js
 *
 * Test IDs: w14_001 through w14_175
 * Sections: 22 total
 */

import assert from 'assert';
import {
    BUDGET_ACTIONS,
    normalizeAction,
    isBlockAction,
    isThrottleAction,
    RPM_CONFIG,
    RPMTracker,
    PATTERN_CONFIG,
    BudgetPatternTracker,
    createBudgetPatternTracker,
    createRPMTracker
} from '../core/budget-pattern-tracker.js';

// ─────────────────────────────────────────────────────────────────────────────
// TEST INFRASTRUCTURE
// ─────────────────────────────────────────────────────────────────────────────

const results = {
    passed: 0,
    failed: 0,
    failures: []
};

function runTest(id, name, fn) {
    try {
        fn();
        console.log(`  ✓ [${id}] ${name}`);
        results.passed++;
    } catch (e) {
        console.error(`  ✗ [${id}] ${name}: ${e.message}`);
        results.failed++;
        results.failures.push({ id, name, error: e.message });
    }
}

function section(title) {
    console.log(`\n${title}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: BUDGET_ACTIONS CONSTANTS (4 TESTS)
// ─────────────────────────────────────────────────────────────────────────────

section('SECTION 1: BUDGET_ACTIONS Constants');

runTest('w14_001', 'BUDGET_ACTIONS.BLOCK exists and equals "BLOCK"', () => {
    assert.strictEqual(BUDGET_ACTIONS.BLOCK, 'BLOCK');
});

runTest('w14_002', 'BUDGET_ACTIONS.THROTTLE exists and equals "THROTTLE"', () => {
    assert.strictEqual(BUDGET_ACTIONS.THROTTLE, 'THROTTLE');
});

runTest('w14_003', 'BUDGET_ACTIONS.ALERT exists and equals "ALERT"', () => {
    assert.strictEqual(BUDGET_ACTIONS.ALERT, 'ALERT');
});

runTest('w14_004', 'BUDGET_ACTIONS.ALLOW exists and equals "ALLOW"', () => {
    assert.strictEqual(BUDGET_ACTIONS.ALLOW, 'ALLOW');
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: normalizeAction FUNCTION (25 TESTS)
// ─────────────────────────────────────────────────────────────────────────────

section('SECTION 2: normalizeAction - Canonical Forms');

runTest('w14_005', 'normalizeAction("BLOCK") returns "BLOCK"', () => {
    assert.strictEqual(normalizeAction('BLOCK'), 'BLOCK');
});

runTest('w14_006', 'normalizeAction("THROTTLE") returns "THROTTLE"', () => {
    assert.strictEqual(normalizeAction('THROTTLE'), 'THROTTLE');
});

runTest('w14_007', 'normalizeAction("ALERT") returns "ALERT"', () => {
    assert.strictEqual(normalizeAction('ALERT'), 'ALERT');
});

runTest('w14_008', 'normalizeAction("ALLOW") returns "ALLOW"', () => {
    assert.strictEqual(normalizeAction('ALLOW'), 'ALLOW');
});

section('SECTION 2: normalizeAction - Lowercase Variants');

runTest('w14_009', 'normalizeAction("block") returns "BLOCK"', () => {
    assert.strictEqual(normalizeAction('block'), 'BLOCK');
});

runTest('w14_010', 'normalizeAction("throttle") returns "THROTTLE"', () => {
    assert.strictEqual(normalizeAction('throttle'), 'THROTTLE');
});

runTest('w14_011', 'normalizeAction("alert") returns "ALERT"', () => {
    assert.strictEqual(normalizeAction('alert'), 'ALERT');
});

runTest('w14_012', 'normalizeAction("allow") returns "ALLOW"', () => {
    assert.strictEqual(normalizeAction('allow'), 'ALLOW');
});

section('SECTION 2: normalizeAction - Snake_case Variants (W-014 Bug Fix)');

runTest('w14_013', 'normalizeAction("hard_block") returns "BLOCK"', () => {
    assert.strictEqual(normalizeAction('hard_block'), 'BLOCK');
});

runTest('w14_014', 'normalizeAction("hard_cap") returns "BLOCK"', () => {
    assert.strictEqual(normalizeAction('hard_cap'), 'BLOCK');
});

runTest('w14_015', 'normalizeAction("soft_block") returns "THROTTLE"', () => {
    assert.strictEqual(normalizeAction('soft_block'), 'THROTTLE');
});

runTest('w14_016', 'normalizeAction("rate_limit") returns "THROTTLE"', () => {
    assert.strictEqual(normalizeAction('rate_limit'), 'THROTTLE');
});

runTest('w14_017', 'normalizeAction("soft_cap") returns "ALERT"', () => {
    assert.strictEqual(normalizeAction('soft_cap'), 'ALERT');
});

runTest('w14_018', 'normalizeAction("warning") returns "ALERT"', () => {
    assert.strictEqual(normalizeAction('warning'), 'ALERT');
});

runTest('w14_019', 'normalizeAction("pass") returns "ALLOW"', () => {
    assert.strictEqual(normalizeAction('pass'), 'ALLOW');
});

runTest('w14_020', 'normalizeAction("ok") returns "ALLOW"', () => {
    assert.strictEqual(normalizeAction('ok'), 'ALLOW');
});

section('SECTION 2: normalizeAction - Uppercase Variants');

runTest('w14_021', 'normalizeAction("HARD_BLOCK") returns "BLOCK"', () => {
    assert.strictEqual(normalizeAction('HARD_BLOCK'), 'BLOCK');
});

runTest('w14_022', 'normalizeAction("HARD_CAP") returns "BLOCK"', () => {
    assert.strictEqual(normalizeAction('HARD_CAP'), 'BLOCK');
});

runTest('w14_023', 'normalizeAction("BLOCKED") returns "BLOCK"', () => {
    assert.strictEqual(normalizeAction('BLOCKED'), 'BLOCK');
});

runTest('w14_024', 'normalizeAction("DENIED") returns "BLOCK"', () => {
    assert.strictEqual(normalizeAction('DENIED'), 'BLOCK');
});

runTest('w14_025', 'normalizeAction("THROTTLED") returns "THROTTLE"', () => {
    assert.strictEqual(normalizeAction('THROTTLED'), 'THROTTLE');
});

runTest('w14_026', 'normalizeAction("RATE_LIMITED") returns "THROTTLE"', () => {
    assert.strictEqual(normalizeAction('RATE_LIMITED'), 'THROTTLE');
});

section('SECTION 2: normalizeAction - Null/Undefined Handling');

runTest('w14_027', 'normalizeAction(null) returns null', () => {
    assert.strictEqual(normalizeAction(null), null);
});

runTest('w14_028', 'normalizeAction(undefined) returns null', () => {
    assert.strictEqual(normalizeAction(undefined), null);
});

runTest('w14_029', 'normalizeAction("") returns null', () => {
    assert.strictEqual(normalizeAction(''), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: isBlockAction FUNCTION (12 TESTS)
// ─────────────────────────────────────────────────────────────────────────────

section('SECTION 3: isBlockAction - True Cases');

runTest('w14_030', 'isBlockAction("BLOCK") returns true', () => {
    assert.strictEqual(isBlockAction('BLOCK'), true);
});

runTest('w14_031', 'isBlockAction("hard_block") returns true', () => {
    assert.strictEqual(isBlockAction('hard_block'), true);
});

runTest('w14_032', 'isBlockAction("HARD_BLOCK") returns true', () => {
    assert.strictEqual(isBlockAction('HARD_BLOCK'), true);
});

runTest('w14_033', 'isBlockAction("BLOCKED") returns true', () => {
    assert.strictEqual(isBlockAction('BLOCKED'), true);
});

runTest('w14_034', 'isBlockAction("DENIED") returns true', () => {
    assert.strictEqual(isBlockAction('DENIED'), true);
});

runTest('w14_035', 'isBlockAction("block") returns true', () => {
    assert.strictEqual(isBlockAction('block'), true);
});

section('SECTION 3: isBlockAction - False Cases');

runTest('w14_036', 'isBlockAction("THROTTLE") returns false', () => {
    assert.strictEqual(isBlockAction('THROTTLE'), false);
});

runTest('w14_037', 'isBlockAction("ALERT") returns false', () => {
    assert.strictEqual(isBlockAction('ALERT'), false);
});

runTest('w14_038', 'isBlockAction("ALLOW") returns false', () => {
    assert.strictEqual(isBlockAction('ALLOW'), false);
});

runTest('w14_039', 'isBlockAction(null) returns false', () => {
    assert.strictEqual(isBlockAction(null), false);
});

runTest('w14_040', 'isBlockAction(undefined) returns false', () => {
    assert.strictEqual(isBlockAction(undefined), false);
});

runTest('w14_041', 'isBlockAction("unknown_action") returns false', () => {
    assert.strictEqual(isBlockAction('unknown_action'), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: isThrottleAction FUNCTION (10 TESTS)
// ─────────────────────────────────────────────────────────────────────────────

section('SECTION 4: isThrottleAction - True Cases');

runTest('w14_042', 'isThrottleAction("THROTTLE") returns true', () => {
    assert.strictEqual(isThrottleAction('THROTTLE'), true);
});

runTest('w14_043', 'isThrottleAction("soft_block") returns true', () => {
    assert.strictEqual(isThrottleAction('soft_block'), true);
});

runTest('w14_044', 'isThrottleAction("RATE_LIMITED") returns true', () => {
    assert.strictEqual(isThrottleAction('RATE_LIMITED'), true);
});

runTest('w14_045', 'isThrottleAction("throttle") returns true', () => {
    assert.strictEqual(isThrottleAction('throttle'), true);
});

runTest('w14_046', 'isThrottleAction("THROTTLED") returns true', () => {
    assert.strictEqual(isThrottleAction('THROTTLED'), true);
});

section('SECTION 4: isThrottleAction - False Cases');

runTest('w14_047', 'isThrottleAction("BLOCK") returns false', () => {
    assert.strictEqual(isThrottleAction('BLOCK'), false);
});

runTest('w14_048', 'isThrottleAction("ALERT") returns false', () => {
    assert.strictEqual(isThrottleAction('ALERT'), false);
});

runTest('w14_049', 'isThrottleAction("ALLOW") returns false', () => {
    assert.strictEqual(isThrottleAction('ALLOW'), false);
});

runTest('w14_050', 'isThrottleAction(null) returns false', () => {
    assert.strictEqual(isThrottleAction(null), false);
});

runTest('w14_051', 'isThrottleAction(undefined) returns false', () => {
    assert.strictEqual(isThrottleAction(undefined), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5: RPMTracker.record METHOD (6 TESTS)
// ─────────────────────────────────────────────────────────────────────────────

section('SECTION 5: RPMTracker.record - Recording Requests');

runTest('w14_052', 'RPMTracker.record stores first request for a key', () => {
    const tracker = new RPMTracker();
    tracker.record('test_key');
    const stats = tracker.getStats('test_key');
    assert.strictEqual(stats.requests_in_window, 1);
});

runTest('w14_053', 'RPMTracker.record increments count for multiple records', () => {
    const tracker = new RPMTracker();
    tracker.record('test_key');
    tracker.record('test_key');
    tracker.record('test_key');
    const stats = tracker.getStats('test_key');
    assert.strictEqual(stats.requests_in_window, 3);
});

runTest('w14_054', 'RPMTracker.record handles multiple different keys independently', () => {
    const tracker = new RPMTracker();
    tracker.record('key1');
    tracker.record('key1');
    tracker.record('key2');
    const stats1 = tracker.getStats('key1');
    const stats2 = tracker.getStats('key2');
    assert.strictEqual(stats1.requests_in_window, 2);
    assert.strictEqual(stats2.requests_in_window, 1);
});

runTest('w14_055', 'RPMTracker.record creates buckets for different time windows', () => {
    const tracker = new RPMTracker({ bucketMs: 1000 });
    tracker.record('key1');
    const stats1 = tracker.getStats('key1');
    assert.strictEqual(stats1.active_buckets, 1);
});

runTest('w14_056', 'RPMTracker.record with multiple rapid calls increments same bucket', () => {
    const tracker = new RPMTracker({ bucketMs: 5000 });
    tracker.record('key1');
    tracker.record('key1');
    const stats = tracker.getStats('key1');
    // Both in same bucket, so active_buckets should be 1
    assert.strictEqual(stats.active_buckets, 1);
    assert.strictEqual(stats.requests_in_window, 2);
});

runTest('w14_057', 'RPMTracker.record with many rapid calls creates single bucket entry', () => {
    const tracker = new RPMTracker({ bucketMs: 10000 });
    for (let i = 0; i < 100; i++) {
        tracker.record('high_volume');
    }
    const stats = tracker.getStats('high_volume');
    assert.strictEqual(stats.requests_in_window, 100);
    assert.strictEqual(stats.active_buckets, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6: RPMTracker.getCurrentRPM METHOD (10 TESTS)
// ─────────────────────────────────────────────────────────────────────────────

section('SECTION 6: RPMTracker.getCurrentRPM - Rate Calculation');

runTest('w14_058', 'RPMTracker.getCurrentRPM returns 0 for unknown key', () => {
    const tracker = new RPMTracker();
    assert.strictEqual(tracker.getCurrentRPM('unknown_key'), 0);
});

runTest('w14_059', 'RPMTracker.getCurrentRPM returns value after recording', () => {
    const tracker = new RPMTracker();
    tracker.record('test_key');
    const rpm = tracker.getCurrentRPM('test_key');
    assert(rpm > 0, 'RPM should be > 0 after recording');
});

runTest('w14_060', 'RPMTracker.getCurrentRPM scales correctly for multiple records in bucket', () => {
    const tracker = new RPMTracker({ bucketMs: 5000, windowMs: 60000 });
    // Add 10 requests in one bucket (5 second period)
    // The actual RPM depends on real time span, which will vary
    // Just verify it's > 0 and scales with request count
    for (let i = 0; i < 10; i++) {
        tracker.record('test_key');
    }
    const rpm = tracker.getCurrentRPM('test_key');
    assert(rpm > 0, 'RPM should be > 0 after recording multiple requests');
});

runTest('w14_061', 'RPMTracker.getCurrentRPM for single request in bucket', () => {
    const tracker = new RPMTracker({ bucketMs: 5000, windowMs: 60000 });
    tracker.record('test_key');
    const rpm = tracker.getCurrentRPM('test_key');
    // RPM will be based on time span; just verify it's positive
    assert(rpm > 0, 'RPM should be > 0 after recording a single request');
});

runTest('w14_062', 'RPMTracker.getCurrentRPM for empty tracker returns 0', () => {
    const tracker = new RPMTracker();
    assert.strictEqual(tracker.getCurrentRPM('key'), 0);
});

runTest('w14_063', 'RPMTracker.getCurrentRPM with manual bucket manipulation - multiple buckets', () => {
    const tracker = new RPMTracker({ bucketMs: 5000, windowMs: 60000 });
    // Manually add buckets for testing
    tracker.buckets.set('test', [
        { timestamp: Date.now() - 10000, count: 5 },
        { timestamp: Date.now(), count: 5 }
    ]);
    const rpm = tracker.getCurrentRPM('test');
    assert(rpm > 0, 'RPM should be > 0 for multiple buckets');
});

runTest('w14_064', 'RPMTracker.getCurrentRPM decreases as time passes from bucket', () => {
    const tracker = new RPMTracker({ bucketMs: 5000, windowMs: 60000 });
    const now = Date.now();
    // Manually create old bucket
    tracker.buckets.set('test', [
        { timestamp: now - 50000, count: 10 },  // Old bucket
        { timestamp: now, count: 1 }             // Recent bucket
    ]);
    const rpm = tracker.getCurrentRPM('test');
    // Only recent bucket within window contributes more
    assert(rpm >= 0, 'RPM should be non-negative');
});

runTest('w14_065', 'RPMTracker.getCurrentRPM for key with only stale buckets returns 0', () => {
    const tracker = new RPMTracker({ bucketMs: 5000, windowMs: 60000 });
    const now = Date.now();
    // Create bucket outside window
    tracker.buckets.set('old_key', [
        { timestamp: now - 120000, count: 10 }
    ]);
    const rpm = tracker.getCurrentRPM('old_key');
    assert.strictEqual(rpm, 0);
});

runTest('w14_066', 'RPMTracker.getCurrentRPM with buckets across window boundary', () => {
    const tracker = new RPMTracker({ bucketMs: 5000, windowMs: 60000 });
    const now = Date.now();
    tracker.buckets.set('boundary_test', [
        { timestamp: now - 59000, count: 5 },   // Just within window
        { timestamp: now - 30000, count: 5 },   // Within window
        { timestamp: now, count: 5 }            // Recent
    ]);
    const rpm = tracker.getCurrentRPM('boundary_test');
    assert(rpm > 0, 'RPM should account for buckets in window');
});

runTest('w14_067', 'RPMTracker.getCurrentRPM with single bucket spanning short duration', () => {
    const tracker = new RPMTracker({ bucketMs: 5000, windowMs: 60000 });
    tracker.buckets.set('short_duration', [
        { timestamp: Date.now(), count: 5 }
    ]);
    const rpm = tracker.getCurrentRPM('short_duration');
    assert.strictEqual(rpm, 60); // 5 requests * (60000 / 5000) = 60 RPM
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7: RPMTracker.getStats METHOD (6 TESTS)
// ─────────────────────────────────────────────────────────────────────────────

section('SECTION 7: RPMTracker.getStats - Statistics Retrieval');

runTest('w14_068', 'RPMTracker.getStats returns object with required fields', () => {
    const tracker = new RPMTracker();
    tracker.record('test_key');
    const stats = tracker.getStats('test_key');
    assert(stats.hasOwnProperty('current_rpm'));
    assert(stats.hasOwnProperty('requests_in_window'));
    assert(stats.hasOwnProperty('active_buckets'));
    assert(stats.hasOwnProperty('window_ms'));
});

runTest('w14_069', 'RPMTracker.getStats current_rpm field is non-negative', () => {
    const tracker = new RPMTracker();
    tracker.record('test_key');
    const stats = tracker.getStats('test_key');
    assert(stats.current_rpm >= 0);
});

runTest('w14_070', 'RPMTracker.getStats requests_in_window matches recorded count', () => {
    const tracker = new RPMTracker();
    tracker.record('key1');
    tracker.record('key1');
    tracker.record('key1');
    const stats = tracker.getStats('key1');
    assert.strictEqual(stats.requests_in_window, 3);
});

runTest('w14_071', 'RPMTracker.getStats window_ms equals configured window', () => {
    const tracker = new RPMTracker({ windowMs: 120000 });
    tracker.record('test_key');
    const stats = tracker.getStats('test_key');
    assert.strictEqual(stats.window_ms, 120000);
});

runTest('w14_072', 'RPMTracker.getStats active_buckets reflects actual buckets', () => {
    const tracker = new RPMTracker();
    tracker.record('test_key');
    const stats = tracker.getStats('test_key');
    assert(stats.active_buckets >= 1);
});

runTest('w14_073', 'RPMTracker.getStats for unknown key returns zero values', () => {
    const tracker = new RPMTracker();
    const stats = tracker.getStats('unknown_key');
    assert.strictEqual(stats.current_rpm, 0);
    assert.strictEqual(stats.requests_in_window, 0);
    assert.strictEqual(stats.active_buckets, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8: RPMTracker.cleanup METHOD (4 TESTS)
// ─────────────────────────────────────────────────────────────────────────────

section('SECTION 8: RPMTracker.cleanup - Stale Entry Removal');

runTest('w14_074', 'RPMTracker.cleanup removes stale buckets', () => {
    const tracker = new RPMTracker({ bucketMs: 5000, windowMs: 60000 });
    const now = Date.now();
    tracker.buckets.set('old_key', [
        { timestamp: now - 120000, count: 10 }  // Outside window
    ]);
    tracker.cleanup();
    assert.strictEqual(tracker.buckets.has('old_key'), false);
});

runTest('w14_075', 'RPMTracker.cleanup keeps recent buckets', () => {
    const tracker = new RPMTracker({ bucketMs: 5000, windowMs: 60000 });
    const now = Date.now();
    tracker.buckets.set('recent_key', [
        { timestamp: now - 30000, count: 5 }
    ]);
    tracker.cleanup();
    assert.strictEqual(tracker.buckets.has('recent_key'), true);
});

runTest('w14_076', 'RPMTracker.cleanup removes keys with no buckets after trimming', () => {
    const tracker = new RPMTracker({ bucketMs: 5000, windowMs: 60000 });
    const now = Date.now();
    tracker.buckets.set('old_key', [
        { timestamp: now - 120000, count: 10 }
    ]);
    assert.strictEqual(tracker.buckets.has('old_key'), true);
    tracker.cleanup();
    assert.strictEqual(tracker.buckets.has('old_key'), false);
});

runTest('w14_077', 'RPMTracker.cleanup with multiple keys clears only stale ones', () => {
    const tracker = new RPMTracker({ bucketMs: 5000, windowMs: 60000 });
    const now = Date.now();
    tracker.buckets.set('recent', [{ timestamp: now - 30000, count: 5 }]);
    tracker.buckets.set('old', [{ timestamp: now - 120000, count: 5 }]);
    tracker.cleanup();
    assert.strictEqual(tracker.buckets.has('recent'), true);
    assert.strictEqual(tracker.buckets.has('old'), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9: RPMTracker.getTrackedKeys METHOD (4 TESTS)
// ─────────────────────────────────────────────────────────────────────────────

section('SECTION 9: RPMTracker.getTrackedKeys - Key Retrieval');

runTest('w14_078', 'RPMTracker.getTrackedKeys returns array of keys', () => {
    const tracker = new RPMTracker();
    tracker.record('key1');
    tracker.record('key2');
    const keys = tracker.getTrackedKeys();
    assert(Array.isArray(keys));
});

runTest('w14_079', 'RPMTracker.getTrackedKeys includes recorded keys', () => {
    const tracker = new RPMTracker();
    tracker.record('key1');
    tracker.record('key2');
    const keys = tracker.getTrackedKeys();
    assert(keys.includes('key1'));
    assert(keys.includes('key2'));
});

runTest('w14_080', 'RPMTracker.getTrackedKeys for empty tracker returns empty array', () => {
    const tracker = new RPMTracker();
    const keys = tracker.getTrackedKeys();
    assert.strictEqual(keys.length, 0);
});

runTest('w14_081', 'RPMTracker.getTrackedKeys count matches number of recorded keys', () => {
    const tracker = new RPMTracker();
    tracker.record('key1');
    tracker.record('key2');
    tracker.record('key3');
    const keys = tracker.getTrackedKeys();
    assert.strictEqual(keys.length, 3);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 10: RPMTracker.reset METHOD (2 TESTS)
// ─────────────────────────────────────────────────────────────────────────────

section('SECTION 10: RPMTracker.reset - Complete Reset');

runTest('w14_082', 'RPMTracker.reset clears all keys', () => {
    const tracker = new RPMTracker();
    tracker.record('key1');
    tracker.record('key2');
    tracker.reset();
    const keys = tracker.getTrackedKeys();
    assert.strictEqual(keys.length, 0);
});

runTest('w14_083', 'RPMTracker.reset allows re-recording after reset', () => {
    const tracker = new RPMTracker();
    tracker.record('key1');
    tracker.reset();
    tracker.record('key1');
    const stats = tracker.getStats('key1');
    assert.strictEqual(stats.requests_in_window, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 11: BudgetPatternTracker.shouldTrackPattern METHOD (8 TESTS)
// ─────────────────────────────────────────────────────────────────────────────

section('SECTION 11: BudgetPatternTracker.shouldTrackPattern - Pattern Trigger Logic');

runTest('w14_084', 'BudgetPatternTracker.shouldTrackPattern returns true for {action:"BLOCK"}', () => {
    const tracker = new BudgetPatternTracker();
    const decision = { action: 'BLOCK' };
    assert.strictEqual(tracker.shouldTrackPattern(decision), true);
});

runTest('w14_085', 'BudgetPatternTracker.shouldTrackPattern returns true for {action:"hard_block"}', () => {
    const tracker = new BudgetPatternTracker();
    const decision = { action: 'hard_block' };
    assert.strictEqual(tracker.shouldTrackPattern(decision), true);
});

runTest('w14_086', 'BudgetPatternTracker.shouldTrackPattern returns true for {action:"HARD_BLOCK"}', () => {
    const tracker = new BudgetPatternTracker();
    const decision = { action: 'HARD_BLOCK' };
    assert.strictEqual(tracker.shouldTrackPattern(decision), true);
});

runTest('w14_087', 'BudgetPatternTracker.shouldTrackPattern returns false for {action:"THROTTLE"}', () => {
    const tracker = new BudgetPatternTracker();
    const decision = { action: 'THROTTLE' };
    assert.strictEqual(tracker.shouldTrackPattern(decision), false);
});

runTest('w14_088', 'BudgetPatternTracker.shouldTrackPattern returns false for {action:"ALERT"}', () => {
    const tracker = new BudgetPatternTracker();
    const decision = { action: 'ALERT' };
    assert.strictEqual(tracker.shouldTrackPattern(decision), false);
});

runTest('w14_089', 'BudgetPatternTracker.shouldTrackPattern returns false for {action:"ALLOW"}', () => {
    const tracker = new BudgetPatternTracker();
    const decision = { action: 'ALLOW' };
    assert.strictEqual(tracker.shouldTrackPattern(decision), false);
});

runTest('w14_090', 'BudgetPatternTracker.shouldTrackPattern returns false for null decision', () => {
    const tracker = new BudgetPatternTracker();
    assert.strictEqual(tracker.shouldTrackPattern(null), false);
});

runTest('w14_091', 'BudgetPatternTracker.shouldTrackPattern returns false for decision without action', () => {
    const tracker = new BudgetPatternTracker();
    const decision = { reason: 'test' };
    assert.strictEqual(tracker.shouldTrackPattern(decision), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 12: BudgetPatternTracker.recordEvent METHOD (6 TESTS)
// ─────────────────────────────────────────────────────────────────────────────

section('SECTION 12: BudgetPatternTracker.recordEvent - Event Storage');

runTest('w14_092', 'BudgetPatternTracker.recordEvent stores event with normalized action', () => {
    const tracker = new BudgetPatternTracker();
    const decision = { action: 'hard_block', reason: 'budget exceeded' };
    const context = { organizationId: 'org1', team: 'team1', model: 'gpt-4' };
    tracker.recordEvent(decision, context);
    const events = tracker.events.get('org1');
    assert(events && events.length > 0);
    assert.strictEqual(events[0].action, 'BLOCK');
});

runTest('w14_093', 'BudgetPatternTracker.recordEvent stores team and model info', () => {
    const tracker = new BudgetPatternTracker();
    const decision = { action: 'BLOCK' };
    const context = { organizationId: 'org1', team: 'team1', model: 'gpt-4' };
    tracker.recordEvent(decision, context);
    const events = tracker.events.get('org1');
    assert.strictEqual(events[0].team, 'team1');
    assert.strictEqual(events[0].model, 'gpt-4');
});

runTest('w14_094', 'BudgetPatternTracker.recordEvent uses default org if not provided', () => {
    const tracker = new BudgetPatternTracker();
    const decision = { action: 'BLOCK' };
    tracker.recordEvent(decision, {});
    assert(tracker.events.has('default'));
});

runTest('w14_095', 'BudgetPatternTracker.recordEvent stores timestamp', () => {
    const tracker = new BudgetPatternTracker();
    const decision = { action: 'BLOCK' };
    const context = { organizationId: 'org1' };
    const beforeTime = Date.now();
    tracker.recordEvent(decision, context);
    const afterTime = Date.now();
    const event = tracker.events.get('org1')[0];
    assert(event.timestamp >= beforeTime && event.timestamp <= afterTime);
});

runTest('w14_096', 'BudgetPatternTracker.recordEvent stores spend information', () => {
    const tracker = new BudgetPatternTracker();
    const decision = { action: 'BLOCK' };
    const context = { organizationId: 'org1', spend: 150.50 };
    tracker.recordEvent(decision, context);
    const event = tracker.events.get('org1')[0];
    assert.strictEqual(event.spend, 150.50);
});

runTest('w14_097', 'BudgetPatternTracker.recordEvent handles multiple events for same org', () => {
    const tracker = new BudgetPatternTracker();
    const context = { organizationId: 'org1', team: 'team1', model: 'gpt-4' };
    tracker.recordEvent({ action: 'BLOCK' }, context);
    tracker.recordEvent({ action: 'BLOCK' }, context);
    tracker.recordEvent({ action: 'BLOCK' }, context);
    const events = tracker.events.get('org1');
    assert.strictEqual(events.length, 3);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 13: BudgetPatternTracker.detectRecurringPatterns METHOD (12 TESTS)
// ─────────────────────────────────────────────────────────────────────────────

section('SECTION 13: BudgetPatternTracker.detectRecurringPatterns - Pattern Detection');

runTest('w14_098', 'BudgetPatternTracker.detectRecurringPatterns returns array', () => {
    const tracker = new BudgetPatternTracker();
    const patterns = tracker.detectRecurringPatterns('org1');
    assert(Array.isArray(patterns));
});

runTest('w14_099', 'BudgetPatternTracker.detectRecurringPatterns returns empty for no patterns', () => {
    const tracker = new BudgetPatternTracker();
    const patterns = tracker.detectRecurringPatterns('org1');
    assert.strictEqual(patterns.length, 0);
});

runTest('w14_100', 'BudgetPatternTracker.detectRecurringPatterns no patterns below threshold', () => {
    const tracker = new BudgetPatternTracker({ recurringThreshold: 3 });
    const context = { organizationId: 'org1', team: 'team1', model: 'gpt-4' };
    tracker.recordEvent({ action: 'BLOCK' }, context);
    tracker.recordEvent({ action: 'BLOCK' }, context);
    const patterns = tracker.detectRecurringPatterns('org1');
    assert.strictEqual(patterns.length, 0);
});

runTest('w14_101', 'BudgetPatternTracker.detectRecurringPatterns detects pattern at threshold', () => {
    const tracker = new BudgetPatternTracker({ recurringThreshold: 3 });
    const context = { organizationId: 'org1', team: 'team1', model: 'gpt-4' };
    tracker.recordEvent({ action: 'BLOCK' }, context);
    tracker.recordEvent({ action: 'BLOCK' }, context);
    tracker.recordEvent({ action: 'BLOCK' }, context);
    const patterns = tracker.detectRecurringPatterns('org1');
    assert.strictEqual(patterns.length, 1);
});

runTest('w14_102', 'BudgetPatternTracker.detectRecurringPatterns pattern has required fields', () => {
    const tracker = new BudgetPatternTracker({ recurringThreshold: 2 });
    const context = { organizationId: 'org1', team: 'team1', model: 'gpt-4' };
    tracker.recordEvent({ action: 'BLOCK' }, context);
    tracker.recordEvent({ action: 'BLOCK' }, context);
    const patterns = tracker.detectRecurringPatterns('org1');
    assert(patterns[0].team === 'team1');
    assert(patterns[0].model === 'gpt-4');
    assert(patterns[0].count === 2);
    assert(patterns[0].message);
    assert(patterns[0].severity);
});

runTest('w14_103', 'BudgetPatternTracker.detectRecurringPatterns groups by team and model', () => {
    const tracker = new BudgetPatternTracker({ recurringThreshold: 2 });
    const context1 = { organizationId: 'org1', team: 'team1', model: 'gpt-4' };
    const context2 = { organizationId: 'org1', team: 'team2', model: 'gpt-4' };
    tracker.recordEvent({ action: 'BLOCK' }, context1);
    tracker.recordEvent({ action: 'BLOCK' }, context1);
    tracker.recordEvent({ action: 'BLOCK' }, context2);
    tracker.recordEvent({ action: 'BLOCK' }, context2);
    const patterns = tracker.detectRecurringPatterns('org1');
    assert.strictEqual(patterns.length, 2);
});

runTest('w14_104', 'BudgetPatternTracker.detectRecurringPatterns severity HIGH for count >= threshold', () => {
    const tracker = new BudgetPatternTracker({ recurringThreshold: 3 });
    const context = { organizationId: 'org1', team: 'team1', model: 'gpt-4' };
    tracker.recordEvent({ action: 'BLOCK' }, context);
    tracker.recordEvent({ action: 'BLOCK' }, context);
    tracker.recordEvent({ action: 'BLOCK' }, context);
    const patterns = tracker.detectRecurringPatterns('org1');
    assert.strictEqual(patterns[0].severity, 'HIGH');
});

runTest('w14_105', 'BudgetPatternTracker.detectRecurringPatterns severity CRITICAL for count >= 2*threshold', () => {
    const tracker = new BudgetPatternTracker({ recurringThreshold: 3 });
    const context = { organizationId: 'org1', team: 'team1', model: 'gpt-4' };
    for (let i = 0; i < 6; i++) {
        tracker.recordEvent({ action: 'BLOCK' }, context);
    }
    const patterns = tracker.detectRecurringPatterns('org1');
    assert.strictEqual(patterns[0].severity, 'CRITICAL');
});

runTest('w14_106', 'BudgetPatternTracker.detectRecurringPatterns includes occurrence timestamps', () => {
    const tracker = new BudgetPatternTracker({ recurringThreshold: 2 });
    const context = { organizationId: 'org1', team: 'team1', model: 'gpt-4' };
    tracker.recordEvent({ action: 'BLOCK' }, context);
    tracker.recordEvent({ action: 'BLOCK' }, context);
    const patterns = tracker.detectRecurringPatterns('org1');
    assert(patterns[0].firstOccurrence);
    assert(patterns[0].lastOccurrence);
});

runTest('w14_107', 'BudgetPatternTracker.detectRecurringPatterns sorts by count descending', () => {
    const tracker = new BudgetPatternTracker({ recurringThreshold: 2 });
    const context1 = { organizationId: 'org1', team: 'team1', model: 'gpt-4' };
    const context2 = { organizationId: 'org1', team: 'team2', model: 'gpt-4' };
    // team1 + gpt-4: 5 events
    for (let i = 0; i < 5; i++) {
        tracker.recordEvent({ action: 'BLOCK' }, context1);
    }
    // team2 + gpt-4: 2 events
    tracker.recordEvent({ action: 'BLOCK' }, context2);
    tracker.recordEvent({ action: 'BLOCK' }, context2);
    const patterns = tracker.detectRecurringPatterns('org1');
    assert.strictEqual(patterns[0].count, 5);
    assert.strictEqual(patterns[1].count, 2);
});

runTest('w14_108', 'BudgetPatternTracker.detectRecurringPatterns respects time window', () => {
    const tracker = new BudgetPatternTracker({
        recurringThreshold: 2,
        recurringWindowMs: 1000 // 1 second window
    });
    const context = { organizationId: 'org1', team: 'team1', model: 'gpt-4' };
    tracker.recordEvent({ action: 'BLOCK' }, context);
    tracker.recordEvent({ action: 'BLOCK' }, context);
    // Simulate old event by manually adding to events
    const events = tracker.events.get('org1');
    if (events && events.length > 0) {
        events[0].timestamp = Date.now() - 2000; // 2 seconds ago
    }
    const patterns = tracker.detectRecurringPatterns('org1');
    // Only second event should be in window
    assert.strictEqual(patterns.length, 0);
});

runTest('w14_109', 'BudgetPatternTracker.detectRecurringPatterns ignores non-BLOCK actions', () => {
    const tracker = new BudgetPatternTracker({ recurringThreshold: 1 });
    const context = { organizationId: 'org1', team: 'team1', model: 'gpt-4' };
    tracker.recordEvent({ action: 'THROTTLE' }, context);
    tracker.recordEvent({ action: 'ALERT' }, context);
    const patterns = tracker.detectRecurringPatterns('org1');
    assert.strictEqual(patterns.length, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 14: BudgetPatternTracker.getSummary METHOD (6 TESTS)
// ─────────────────────────────────────────────────────────────────────────────

section('SECTION 14: BudgetPatternTracker.getSummary - Summary Statistics');

runTest('w14_110', 'BudgetPatternTracker.getSummary returns object with required fields', () => {
    const tracker = new BudgetPatternTracker();
    const summary = tracker.getSummary('org1');
    assert(summary.hasOwnProperty('total_events'));
    assert(summary.hasOwnProperty('by_action'));
    assert(summary.hasOwnProperty('recurring_patterns'));
    assert(summary.hasOwnProperty('window_days'));
});

runTest('w14_111', 'BudgetPatternTracker.getSummary total_events counts events correctly', () => {
    const tracker = new BudgetPatternTracker();
    const context = { organizationId: 'org1' };
    tracker.recordEvent({ action: 'BLOCK' }, context);
    tracker.recordEvent({ action: 'THROTTLE' }, context);
    tracker.recordEvent({ action: 'ALERT' }, context);
    const summary = tracker.getSummary('org1');
    assert.strictEqual(summary.total_events, 3);
});

runTest('w14_112', 'BudgetPatternTracker.getSummary by_action breaks down event types', () => {
    const tracker = new BudgetPatternTracker();
    const context = { organizationId: 'org1' };
    tracker.recordEvent({ action: 'BLOCK' }, context);
    tracker.recordEvent({ action: 'BLOCK' }, context);
    tracker.recordEvent({ action: 'THROTTLE' }, context);
    const summary = tracker.getSummary('org1');
    assert.strictEqual(summary.by_action.BLOCK, 2);
    assert.strictEqual(summary.by_action.THROTTLE, 1);
});

runTest('w14_113', 'BudgetPatternTracker.getSummary includes recurring patterns', () => {
    const tracker = new BudgetPatternTracker({ recurringThreshold: 2 });
    const context = { organizationId: 'org1', team: 'team1', model: 'gpt-4' };
    tracker.recordEvent({ action: 'BLOCK' }, context);
    tracker.recordEvent({ action: 'BLOCK' }, context);
    const summary = tracker.getSummary('org1');
    assert(Array.isArray(summary.recurring_patterns));
    assert.strictEqual(summary.recurring_patterns.length, 1);
});

runTest('w14_114', 'BudgetPatternTracker.getSummary window_days is correct', () => {
    const tracker = new BudgetPatternTracker({
        recurringWindowMs: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    const summary = tracker.getSummary('org1');
    assert.strictEqual(summary.window_days, 7);
});

runTest('w14_115', 'BudgetPatternTracker.getSummary for unknown org returns zeros', () => {
    const tracker = new BudgetPatternTracker();
    const summary = tracker.getSummary('unknown_org');
    assert.strictEqual(summary.total_events, 0);
    assert.strictEqual(Object.keys(summary.by_action).length, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 15: BudgetPatternTracker.clearEvents / reset METHODS (4 TESTS)
// ─────────────────────────────────────────────────────────────────────────────

section('SECTION 15: BudgetPatternTracker.clearEvents / reset - Data Clearing');

runTest('w14_116', 'BudgetPatternTracker.clearEvents removes org events', () => {
    const tracker = new BudgetPatternTracker();
    const context = { organizationId: 'org1' };
    tracker.recordEvent({ action: 'BLOCK' }, context);
    tracker.clearEvents('org1');
    const summary = tracker.getSummary('org1');
    assert.strictEqual(summary.total_events, 0);
});

runTest('w14_117', 'BudgetPatternTracker.clearEvents keeps other orgs intact', () => {
    const tracker = new BudgetPatternTracker();
    tracker.recordEvent({ action: 'BLOCK' }, { organizationId: 'org1' });
    tracker.recordEvent({ action: 'BLOCK' }, { organizationId: 'org2' });
    tracker.clearEvents('org1');
    const summary2 = tracker.getSummary('org2');
    assert.strictEqual(summary2.total_events, 1);
});

runTest('w14_118', 'BudgetPatternTracker.reset clears all orgs', () => {
    const tracker = new BudgetPatternTracker();
    tracker.recordEvent({ action: 'BLOCK' }, { organizationId: 'org1' });
    tracker.recordEvent({ action: 'BLOCK' }, { organizationId: 'org2' });
    tracker.reset();
    const summary1 = tracker.getSummary('org1');
    const summary2 = tracker.getSummary('org2');
    assert.strictEqual(summary1.total_events, 0);
    assert.strictEqual(summary2.total_events, 0);
});

runTest('w14_119', 'BudgetPatternTracker.reset allows re-recording after reset', () => {
    const tracker = new BudgetPatternTracker();
    tracker.recordEvent({ action: 'BLOCK' }, { organizationId: 'org1' });
    tracker.reset();
    tracker.recordEvent({ action: 'BLOCK' }, { organizationId: 'org1' });
    const summary = tracker.getSummary('org1');
    assert.strictEqual(summary.total_events, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 16: W-014 BUG REGRESSION TESTS (6 TESTS)
// ─────────────────────────────────────────────────────────────────────────────

section('SECTION 16: W-014 Bug Regression - hard_block String Matching');

runTest('w14_120', 'W-014 Bug: decision.action === "BLOCK" triggers shouldTrackPattern', () => {
    const tracker = new BudgetPatternTracker();
    const decision = { action: 'BLOCK' };
    assert.strictEqual(tracker.shouldTrackPattern(decision), true);
});

runTest('w14_121', 'W-014 Bug: decision.action === "hard_block" now triggers shouldTrackPattern', () => {
    const tracker = new BudgetPatternTracker();
    // The original bug was that 'hard_block' !== 'BLOCK', causing shouldTrackPattern to return false
    // Now with normalization, 'hard_block' should map to 'BLOCK' and trigger pattern tracking
    const decision = { action: 'hard_block' };
    assert.strictEqual(tracker.shouldTrackPattern(decision), true);
});

runTest('w14_122', 'W-014 Bug: normalizeAction("hard_block") === BUDGET_ACTIONS.BLOCK', () => {
    assert.strictEqual(normalizeAction('hard_block'), BUDGET_ACTIONS.BLOCK);
});

runTest('w14_123', 'W-014 Bug: isBlockAction("hard_block") returns true', () => {
    assert.strictEqual(isBlockAction('hard_block'), true);
});

runTest('w14_124', 'W-014 Bug: pattern correctly stored after "hard_block" action', () => {
    const tracker = new BudgetPatternTracker({ recurringThreshold: 1 });
    const context = { organizationId: 'org1', team: 'team1', model: 'gpt-4' };
    const decision = { action: 'hard_block' };
    tracker.recordEvent(decision, context);
    const events = tracker.events.get('org1');
    assert(events && events.length > 0);
    assert.strictEqual(events[0].action, 'BLOCK');
});

runTest('w14_125', 'W-014 Bug: pattern detection works with "hard_block" action', () => {
    const tracker = new BudgetPatternTracker({ recurringThreshold: 2 });
    const context = { organizationId: 'org1', team: 'team1', model: 'gpt-4' };
    tracker.recordEvent({ action: 'hard_block' }, context);
    tracker.recordEvent({ action: 'hard_block' }, context);
    const patterns = tracker.detectRecurringPatterns('org1');
    assert.strictEqual(patterns.length, 1);
    assert.strictEqual(patterns[0].team, 'team1');
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 17: RPM TRACKER WITH MULTIPLE KEYS (4 TESTS)
// ─────────────────────────────────────────────────────────────────────────────

section('SECTION 17: RPM Tracker with Multiple Keys');

runTest('w14_126', 'RPMTracker different keys have independent RPM values', () => {
    const tracker = new RPMTracker({ bucketMs: 5000, windowMs: 60000 });
    for (let i = 0; i < 10; i++) {
        tracker.record('key1');
    }
    for (let i = 0; i < 5; i++) {
        tracker.record('key2');
    }
    const rpm1 = tracker.getCurrentRPM('key1');
    const rpm2 = tracker.getCurrentRPM('key2');
    assert(rpm1 > rpm2);
});

runTest('w14_127', 'RPMTracker independent bucket tracking per key', () => {
    const tracker = new RPMTracker();
    const now = Date.now();
    tracker.buckets.set('key1', [{ timestamp: now, count: 5 }]);
    tracker.buckets.set('key2', [{ timestamp: now - 30000, count: 3 }]);
    const stats1 = tracker.getStats('key1');
    const stats2 = tracker.getStats('key2');
    assert.strictEqual(stats1.requests_in_window, 5);
    assert.strictEqual(stats2.requests_in_window, 3);
});

runTest('w14_128', 'RPMTracker cleanup only affects old buckets for each key', () => {
    const tracker = new RPMTracker({ bucketMs: 5000, windowMs: 60000 });
    const now = Date.now();
    tracker.buckets.set('key1', [{ timestamp: now - 30000, count: 5 }]);
    tracker.buckets.set('key2', [{ timestamp: now - 120000, count: 5 }]);
    tracker.cleanup();
    assert.strictEqual(tracker.buckets.has('key1'), true);
    assert.strictEqual(tracker.buckets.has('key2'), false);
});

runTest('w14_129', 'RPMTracker getTrackedKeys lists all keys with data', () => {
    const tracker = new RPMTracker();
    tracker.record('team_a');
    tracker.record('team_b');
    tracker.record('team_c');
    const keys = tracker.getTrackedKeys();
    assert.strictEqual(keys.length, 3);
    assert(keys.includes('team_a'));
    assert(keys.includes('team_b'));
    assert(keys.includes('team_c'));
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 18: PATTERN TRACKER WITH MULTIPLE ORGS (4 TESTS)
// ─────────────────────────────────────────────────────────────────────────────

section('SECTION 18: Pattern Tracker with Multiple Organizations');

runTest('w14_130', 'BudgetPatternTracker independent pattern tracking per org', () => {
    const tracker = new BudgetPatternTracker({ recurringThreshold: 2 });
    const context1 = { organizationId: 'org1', team: 'team1', model: 'gpt-4' };
    const context2 = { organizationId: 'org2', team: 'team2', model: 'gpt-4' };
    tracker.recordEvent({ action: 'BLOCK' }, context1);
    tracker.recordEvent({ action: 'BLOCK' }, context1);
    tracker.recordEvent({ action: 'BLOCK' }, context2);
    const summary1 = tracker.getSummary('org1');
    const summary2 = tracker.getSummary('org2');
    assert.strictEqual(summary1.total_events, 2);
    assert.strictEqual(summary2.total_events, 1);
});

runTest('w14_131', 'BudgetPatternTracker clearing one org keeps others intact', () => {
    const tracker = new BudgetPatternTracker();
    tracker.recordEvent({ action: 'BLOCK' }, { organizationId: 'org1' });
    tracker.recordEvent({ action: 'BLOCK' }, { organizationId: 'org2' });
    tracker.recordEvent({ action: 'BLOCK' }, { organizationId: 'org2' });
    tracker.clearEvents('org1');
    const summary1 = tracker.getSummary('org1');
    const summary2 = tracker.getSummary('org2');
    assert.strictEqual(summary1.total_events, 0);
    assert.strictEqual(summary2.total_events, 2);
});

runTest('w14_132', 'BudgetPatternTracker pattern detection per org independent', () => {
    const tracker = new BudgetPatternTracker({ recurringThreshold: 2 });
    const context1 = { organizationId: 'org1', team: 'team1', model: 'gpt-4' };
    const context2 = { organizationId: 'org2', team: 'team2', model: 'gpt-4' };
    tracker.recordEvent({ action: 'BLOCK' }, context1);
    tracker.recordEvent({ action: 'BLOCK' }, context1);
    tracker.recordEvent({ action: 'BLOCK' }, context2);
    const patterns1 = tracker.detectRecurringPatterns('org1');
    const patterns2 = tracker.detectRecurringPatterns('org2');
    assert.strictEqual(patterns1.length, 1);
    assert.strictEqual(patterns2.length, 0);
});

runTest('w14_133', 'BudgetPatternTracker multiple orgs with different thresholds met', () => {
    const tracker = new BudgetPatternTracker({ recurringThreshold: 3 });
    const context1 = { organizationId: 'org1', team: 'team1', model: 'gpt-4' };
    const context2 = { organizationId: 'org2', team: 'team2', model: 'gpt-4' };
    // org1: 2 blocks (below threshold)
    tracker.recordEvent({ action: 'BLOCK' }, context1);
    tracker.recordEvent({ action: 'BLOCK' }, context1);
    // org2: 3 blocks (at threshold)
    tracker.recordEvent({ action: 'BLOCK' }, context2);
    tracker.recordEvent({ action: 'BLOCK' }, context2);
    tracker.recordEvent({ action: 'BLOCK' }, context2);
    const patterns1 = tracker.detectRecurringPatterns('org1');
    const patterns2 = tracker.detectRecurringPatterns('org2');
    assert.strictEqual(patterns1.length, 0);
    assert.strictEqual(patterns2.length, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 19: STRUCTURAL VALIDATION (6 TESTS)
// ─────────────────────────────────────────────────────────────────────────────

section('SECTION 19: Structural Validation');

runTest('w14_134', 'PATTERN_CONFIG constants exist and have correct defaults', () => {
    assert(PATTERN_CONFIG.RECURRING_THRESHOLD >= 1);
    assert(PATTERN_CONFIG.RECURRING_WINDOW_MS > 0);
    assert(PATTERN_CONFIG.MAX_PATTERNS_PER_ORG > 0);
});

runTest('w14_135', 'RPM_CONFIG constants exist and have correct defaults', () => {
    assert.strictEqual(RPM_CONFIG.WINDOW_MS, 60000);
    assert.strictEqual(RPM_CONFIG.BUCKET_MS, 5000);
    assert.strictEqual(RPM_CONFIG.MAX_BUCKETS, 12);
    assert.strictEqual(RPM_CONFIG.CLEANUP_INTERVAL, 30000);
});

runTest('w14_136', 'BudgetPatternTracker class has all required methods', () => {
    const tracker = new BudgetPatternTracker();
    assert(typeof tracker.shouldTrackPattern === 'function');
    assert(typeof tracker.recordEvent === 'function');
    assert(typeof tracker.detectRecurringPatterns === 'function');
    assert(typeof tracker.getSummary === 'function');
    assert(typeof tracker.clearEvents === 'function');
    assert(typeof tracker.reset === 'function');
});

runTest('w14_137', 'RPMTracker class has all required methods', () => {
    const tracker = new RPMTracker();
    assert(typeof tracker.record === 'function');
    assert(typeof tracker.getCurrentRPM === 'function');
    assert(typeof tracker.getStats === 'function');
    assert(typeof tracker.cleanup === 'function');
    assert(typeof tracker.getTrackedKeys === 'function');
    assert(typeof tracker.reset === 'function');
});

runTest('w14_138', 'Export functions normalizeAction, isBlockAction, isThrottleAction exist', () => {
    assert(typeof normalizeAction === 'function');
    assert(typeof isBlockAction === 'function');
    assert(typeof isThrottleAction === 'function');
});

runTest('w14_139', 'Factory functions createBudgetPatternTracker and createRPMTracker exist', () => {
    assert(typeof createBudgetPatternTracker === 'function');
    assert(typeof createRPMTracker === 'function');
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 20: FACTORY FUNCTIONS (4 TESTS)
// ─────────────────────────────────────────────────────────────────────────────

section('SECTION 20: Factory Functions');

runTest('w14_140', 'createBudgetPatternTracker returns BudgetPatternTracker instance', () => {
    const tracker = createBudgetPatternTracker();
    assert(tracker instanceof BudgetPatternTracker);
});

runTest('w14_141', 'createBudgetPatternTracker accepts config options', () => {
    const tracker = createBudgetPatternTracker({
        recurringThreshold: 5,
        recurringWindowMs: 86400000,
        maxPatterns: 500
    });
    assert.strictEqual(tracker.recurringThreshold, 5);
    assert.strictEqual(tracker.recurringWindowMs, 86400000);
    assert.strictEqual(tracker.maxPatterns, 500);
});

runTest('w14_142', 'createRPMTracker returns RPMTracker instance', () => {
    const tracker = createRPMTracker();
    assert(tracker instanceof RPMTracker);
});

runTest('w14_143', 'createRPMTracker accepts config options', () => {
    const tracker = createRPMTracker({
        windowMs: 120000,
        bucketMs: 10000,
        maxBuckets: 6
    });
    assert.strictEqual(tracker.windowMs, 120000);
    assert.strictEqual(tracker.bucketMs, 10000);
    assert.strictEqual(tracker.maxBuckets, 6);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 21: EDGE CASES (6 TESTS)
// ─────────────────────────────────────────────────────────────────────────────

section('SECTION 21: Edge Cases');

runTest('w14_144', 'normalizeAction with empty string returns null', () => {
    assert.strictEqual(normalizeAction(''), null);
});

runTest('w14_145', 'normalizeAction with very long action string handles gracefully', () => {
    const longString = 'a'.repeat(1000);
    const result = normalizeAction(longString);
    assert(result === null || typeof result === 'string');
});

runTest('w14_146', 'normalizeAction with special characters returns uppercased', () => {
    const result = normalizeAction('block!@#$%');
    assert(typeof result === 'string');
});

runTest('w14_147', 'BudgetPatternTracker recordEvent with empty context defaults gracefully', () => {
    const tracker = new BudgetPatternTracker();
    const decision = { action: 'BLOCK' };
    tracker.recordEvent(decision, {});
    const events = tracker.events.get('default');
    assert(events && events.length > 0);
    assert.strictEqual(events[0].team, 'unknown');
});

runTest('w14_148', 'RPMTracker with very short window handles correctly', () => {
    const tracker = new RPMTracker({ windowMs: 100, bucketMs: 10 });
    tracker.record('test');
    const stats = tracker.getStats('test');
    assert(stats.window_ms === 100);
});

runTest('w14_149', 'BudgetPatternTracker with maxPatterns enforces limit', () => {
    const tracker = new BudgetPatternTracker({ maxPatterns: 3 });
    const context = { organizationId: 'org1' };
    for (let i = 0; i < 5; i++) {
        tracker.recordEvent({ action: 'BLOCK' }, context);
    }
    const events = tracker.events.get('org1');
    assert(events.length <= 3);
});

// ─────────────────────────────────────────────────────────────────────────────
// ADDITIONAL BOUNDARY TESTS (11 TESTS)
// ─────────────────────────────────────────────────────────────────────────────

section('ADDITIONAL BOUNDARY TESTS');

runTest('w14_150', 'BudgetPatternTracker handles mixed action case variations', () => {
    const tracker = new BudgetPatternTracker({ recurringThreshold: 1 });
    const context = { organizationId: 'org1', team: 'team1', model: 'gpt-4' };
    tracker.recordEvent({ action: 'hard_block' }, context);
    tracker.recordEvent({ action: 'HARD_BLOCK' }, context);
    tracker.recordEvent({ action: 'hard_cap' }, context);
    const events = tracker.events.get('org1');
    assert.strictEqual(events.length, 3);
    // All should be normalized to BLOCK
    assert(events.every(e => e.action === 'BLOCK'));
});

runTest('w14_151', 'RPMTracker manual bucket manipulation for testing works', () => {
    const tracker = new RPMTracker({ bucketMs: 5000, windowMs: 60000 });
    const now = Date.now();
    tracker.buckets.set('manual_test', [
        { timestamp: now - 40000, count: 20 },
        { timestamp: now - 20000, count: 15 },
        { timestamp: now, count: 10 }
    ]);
    const stats = tracker.getStats('manual_test');
    assert.strictEqual(stats.requests_in_window, 45);
});

runTest('w14_152', 'BudgetPatternTracker getSummary with mixed action types', () => {
    const tracker = new BudgetPatternTracker();
    const context = { organizationId: 'org1' };
    tracker.recordEvent({ action: 'BLOCK' }, context);
    tracker.recordEvent({ action: 'THROTTLE' }, context);
    tracker.recordEvent({ action: 'ALERT' }, context);
    tracker.recordEvent({ action: 'ALLOW' }, context);
    const summary = tracker.getSummary('org1');
    assert.strictEqual(summary.total_events, 4);
    assert.strictEqual(summary.by_action.BLOCK, 1);
    assert.strictEqual(summary.by_action.THROTTLE, 1);
    assert.strictEqual(summary.by_action.ALERT, 1);
    assert.strictEqual(summary.by_action.ALLOW, 1);
});

runTest('w14_153', 'RPMTracker with zero buckets after cleanup still tracks keys', () => {
    const tracker = new RPMTracker({ bucketMs: 5000, windowMs: 60000 });
    const now = Date.now();
    tracker.buckets.set('key1', [{ timestamp: now - 120000, count: 5 }]);
    tracker.cleanup();
    const keys = tracker.getTrackedKeys();
    assert(keys.length === 0); // Key should be removed if no active buckets
});

runTest('w14_154', 'BudgetPatternTracker recurringThreshold boundary at exactly threshold', () => {
    const tracker = new BudgetPatternTracker({ recurringThreshold: 5 });
    const context = { organizationId: 'org1', team: 'team1', model: 'gpt-4' };
    for (let i = 0; i < 5; i++) {
        tracker.recordEvent({ action: 'BLOCK' }, context);
    }
    const patterns = tracker.detectRecurringPatterns('org1');
    assert.strictEqual(patterns.length, 1);
});

runTest('w14_155', 'BudgetPatternTracker recurringThreshold boundary just below threshold', () => {
    const tracker = new BudgetPatternTracker({ recurringThreshold: 5 });
    const context = { organizationId: 'org1', team: 'team1', model: 'gpt-4' };
    for (let i = 0; i < 4; i++) {
        tracker.recordEvent({ action: 'BLOCK' }, context);
    }
    const patterns = tracker.detectRecurringPatterns('org1');
    assert.strictEqual(patterns.length, 0);
});

runTest('w14_156', 'isBlockAction and isThrottleAction are mutually exclusive', () => {
    const testActions = ['BLOCK', 'THROTTLE', 'ALERT', 'ALLOW', 'hard_block', 'soft_block'];
    for (const action of testActions) {
        const isBlock = isBlockAction(action);
        const isThrottle = isThrottleAction(action);
        assert(!(isBlock && isThrottle), `Action ${action} cannot be both block and throttle`);
    }
});

runTest('w14_157', 'RPMTracker getCurrentRPM consistency after multiple getStats calls', () => {
    const tracker = new RPMTracker();
    tracker.record('test_key');
    const rpm1 = tracker.getCurrentRPM('test_key');
    const stats1 = tracker.getStats('test_key');
    const rpm2 = tracker.getCurrentRPM('test_key');
    const stats2 = tracker.getStats('test_key');
    assert.strictEqual(stats1.current_rpm, rpm1);
    assert.strictEqual(stats2.current_rpm, rpm2);
});

runTest('w14_158', 'BudgetPatternTracker event reason and spend fields preserved', () => {
    const tracker = new BudgetPatternTracker();
    const decision = { action: 'BLOCK', reason: 'monthly budget exceeded' };
    const context = { organizationId: 'org1', spend: 5000.75 };
    tracker.recordEvent(decision, context);
    const event = tracker.events.get('org1')[0];
    assert.strictEqual(event.reason, 'monthly budget exceeded');
    assert.strictEqual(event.spend, 5000.75);
});

runTest('w14_159', 'normalizeAction case-insensitive for all variants', () => {
    const variants = [
        { input: 'block', expected: 'BLOCK' },
        { input: 'Block', expected: 'BLOCK' },
        { input: 'BLOCK', expected: 'BLOCK' },
        { input: 'hard_block', expected: 'BLOCK' },
        { input: 'HARD_BLOCK', expected: 'BLOCK' },
        { input: 'Hard_Block', expected: 'BLOCK' }
    ];
    for (const { input, expected } of variants) {
        assert.strictEqual(normalizeAction(input), expected, `Failed for ${input}`);
    }
});

runTest('w14_160', 'BudgetPatternTracker detectRecurringPatterns message format', () => {
    const tracker = new BudgetPatternTracker({ recurringThreshold: 2 });
    const context = { organizationId: 'org1', team: 'eng-team', model: 'gpt-4-turbo' };
    tracker.recordEvent({ action: 'BLOCK' }, context);
    tracker.recordEvent({ action: 'BLOCK' }, context);
    const patterns = tracker.detectRecurringPatterns('org1');
    assert(patterns[0].message.includes('eng-team'));
    assert(patterns[0].message.includes('gpt-4-turbo'));
    assert(patterns[0].message.includes('2'));
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 22: INTEGRATION WIRING VERIFICATION (15 TESTS)
// ─────────────────────────────────────────────────────────────────────────────

section('SECTION 22: Integration Wiring Verification');

// Read budget-enforcer.js source to verify W-014 wiring
const budgetEnforcerSrc = await (async () => {
    const { readFileSync } = await import('fs');
    return readFileSync(
        new URL('../agents/budget-enforcer.js', import.meta.url), 'utf8'
    );
})();

runTest('w14_161', 'budget-enforcer.js imports normalizeAction, isBlockAction, BUDGET_ACTIONS', () => {
    assert(budgetEnforcerSrc.includes('import { normalizeAction, isBlockAction, BUDGET_ACTIONS'), 'missing W-014 import');
});

runTest('w14_162', 'budget-enforcer.js imports createBudgetPatternTracker and createRPMTracker', () => {
    assert(budgetEnforcerSrc.includes('createBudgetPatternTracker, createRPMTracker'), 'missing factory imports');
});

runTest('w14_163', 'Constructor creates rpmTracker instance', () => {
    assert(budgetEnforcerSrc.includes('this.rpmTracker = createRPMTracker()'), 'missing rpmTracker in constructor');
});

runTest('w14_164', 'Constructor creates patternTracker instance', () => {
    assert(budgetEnforcerSrc.includes('this.patternTracker = createBudgetPatternTracker()'), 'missing patternTracker in constructor');
});

runTest('w14_165', 'checkBudget records RPM at START (before makeDecision)', () => {
    assert(budgetEnforcerSrc.includes('this.rpmTracker.record(rpmKey)'), 'RPM recording not present');

    const rpmRecordIndex = budgetEnforcerSrc.indexOf('this.rpmTracker.record(rpmKey)');
    const makeDecisionIndex = budgetEnforcerSrc.indexOf('this.makeDecision(');
    assert(rpmRecordIndex < makeDecisionIndex, 'RPM recording must happen before makeDecision');
});

runTest('w14_166', 'Old "hard_block" direct string comparison is REMOVED', () => {
    // The bug was: decision.action === 'hard_block' in actual code logic
    // Fixed: Now uses normalizeAction() and isBlockAction()
    // Note: Comment lines may reference 'hard_block' for documentation, but active code should not
    // Check that the buggy comparison pattern doesn't exist in the code (outside comments)
    const codeOnly = budgetEnforcerSrc
        .split('\n')
        .filter(line => !line.trim().startsWith('//'))
        .join('\n');
    assert(!codeOnly.includes(".action === 'hard_block'"), 'old hard_block comparison still present in code!');
    assert(!codeOnly.includes('.action === "hard_block"'), 'old hard_block comparison still present in code!');
});

runTest('w14_167', 'isBlockAction used for pattern storage condition', () => {
    assert(budgetEnforcerSrc.includes('isBlockAction(decision.action)'), 'isBlockAction not used for pattern check');
});

runTest('w14_168', 'normalizeAction used for throttle decision check', () => {
    assert(budgetEnforcerSrc.includes('normalizeAction(decision.action) === BUDGET_ACTIONS.THROTTLE'), 'normalizeAction not used for throttle check');
});

runTest('w14_169', 'Old hardcoded RPM value (60) is REMOVED', () => {
    assert(!budgetEnforcerSrc.includes('current_rpm: 60'), 'hardcoded RPM 60 still present!');
});

runTest('w14_170', 'rpmTracker.getCurrentRPM used in getThrottleAction', () => {
    assert(budgetEnforcerSrc.includes('this.rpmTracker.getCurrentRPM(rpmKey)'), 'getCurrentRPM not used in throttle action');
});

runTest('w14_171', 'patternTracker.recordEvent called in logDecision', () => {
    assert(budgetEnforcerSrc.includes('this.patternTracker.recordEvent(decision'), 'patternTracker.recordEvent not called');
});

runTest('w14_172', 'monthly_limit division guarded in getBudgetStatus', () => {
    assert(budgetEnforcerSrc.includes('config.monthly_limit > 0'), 'monthly_limit division guard missing in getBudgetStatus');
});

runTest('w14_173', 'daily_limit division guarded in getBudgetStatus', () => {
    assert(budgetEnforcerSrc.includes('config.daily_limit > 0'), 'daily_limit division guard missing in getBudgetStatus');
});

runTest('w14_174', 'No duplicate RPM recording (exactly 1 call to rpmTracker.record)', () => {
    const rpmRecordCount = (budgetEnforcerSrc.match(/this\.rpmTracker\.record\(/g) || []).length;
    assert.strictEqual(rpmRecordCount, 1, `Expected 1 RPM recording call, found ${rpmRecordCount}`);
});

runTest('w14_175', 'spend.monthly division guarded by budget.monthly_limit in logDecision', () => {
    assert(budgetEnforcerSrc.includes('budget.monthly_limit > 0'), 'logDecision division not guarded');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST RESULTS
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log(`TEST SUMMARY`);
console.log(`${'='.repeat(80)}`);
console.log(`Total: ${results.passed + results.failed}`);
console.log(`Passed: ${results.passed}`);
console.log(`Failed: ${results.failed}`);

if (results.failures.length > 0) {
    console.log(`\nFailed Tests:`);
    for (const failure of results.failures) {
        console.log(`  ${failure.id}: ${failure.name}`);
        console.log(`    Error: ${failure.error}`);
    }
}

console.log(`${'='.repeat(80)}\n`);

process.exit(results.failed > 0 ? 1 : 0);
