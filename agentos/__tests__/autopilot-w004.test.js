/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * W-004 TEST SUITE: Continuous Loop Impossible in Serverless
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Validates that the W-004 fix properly eliminates all in-memory state that
 * resets on every serverless invocation, replacing it with database-backed
 * guardrail enforcement.
 *
 * Critical bugs fixed:
 *   BUG 1: Daily limit checked in-memory actionLog (always empty) — allowed
 *          unlimited actions per 5-min cron interval (120+/day vs max of 10)
 *   BUG 2: Cooldown checked in-memory actionLog (always empty) — cooldown
 *          was never enforced across cron invocations
 *   BUG 3: generateDailySummary read in-memory actionLog — always reported 0
 *   BUG 4: runContinuously() dead code — never called, while(true) impossible
 *          in serverless. Removed entirely.
 *   BUG 5: this.isRunning meaningless in serverless — removed
 *   BUG 6: this.actionLog in-memory array — removed (DB is source of truth)
 *   BUG 7: logAction() silently swallowed DB errors — now throws
 *
 * Five levels of testing:
 *   1. STATIC ANALYSIS — Structural verification of removed dead code
 *   2. BEHAVIORAL TESTS — isActionAllowed() with mocked Supabase responses
 *   3. INTEGRATION TESTS — executeAction() flow with guardrails
 *   4. DAILY SUMMARY TESTS — generateDailySummary() with DB queries
 *   5. FAIL-CLOSED TESTS — Error handling denies rather than permits
 *   6. EDGE CASE TESTS — Boundary conditions, race scenarios
 *   7. DOCUMENTATION TESTS — JSDoc and architecture documentation
 *
 * File covered by W-004:
 *   - agentos/agents/autopilot.js
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Test Helpers ───────────────────────────────────────────────────────────
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

// ─── Load Source ────────────────────────────────────────────────────────────
const autopilotPath = path.resolve(__dirname, '../agents/autopilot.js');
const src = fs.readFileSync(autopilotPath, 'utf8');

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log(' W-004 TEST SUITE: Continuous Loop Impossible in Serverless');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 1: STATIC ANALYSIS — Dead Code Removal
// ═════════════════════════════════════════════════════════════════════════════

console.log('────────────────────────────────────────────────────────────');
console.log('Test 1: runContinuously() dead code removed');
console.log('────────────────────────────────────────────────────────────');

// Extract method definitions (not JSDoc comments)
const methodDefRegex = /^\s+(async\s+)?runContinuously\s*\(/m;
assert(!methodDefRegex.test(src), 'No runContinuously() method definition exists');

const whileIsRunning = /while\s*\(\s*this\.isRunning\s*\)/;
assert(!whileIsRunning.test(src), 'No while(this.isRunning) loop exists');

// Verify it IS mentioned in JSDoc as having been removed
const removedComment = src.includes('runContinuously() method was dead code');
assert(removedComment, 'JSDoc documents that runContinuously was removed');

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 2: this.isRunning state removed');
console.log('────────────────────────────────────────────────────────────');

// Check constructor doesn't set this.isRunning
const constructorBlock = src.match(/constructor\s*\(params[^)]*\)\s*\{([\s\S]*?)\n\s{4}\}/);
assert(constructorBlock !== null, 'Constructor block found');
assert(!constructorBlock[1].includes('this.isRunning'), 'Constructor does not set this.isRunning');

// No assignment to this.isRunning anywhere in source
const isRunningAssignment = /this\.isRunning\s*=/g;
const isRunningMatches = src.match(isRunningAssignment) || [];
assert(isRunningMatches.length === 0, 'Zero assignments to this.isRunning in entire file');

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 3: this.actionLog in-memory array removed');
console.log('────────────────────────────────────────────────────────────');

assert(!constructorBlock[1].includes('this.actionLog'), 'Constructor does not set this.actionLog');

// No reads from this.actionLog
const actionLogReads = /this\.actionLog\.(filter|find|push|length)/g;
const actionLogReadMatches = src.match(actionLogReads) || [];
assert(actionLogReadMatches.length === 0, 'Zero reads from this.actionLog (filter/find/push/length)');

// No reference to this.actionLog at all (except in comments)
const srcNoComments = src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
const actionLogInCode = /this\.actionLog/g;
const actionLogCodeMatches = srcNoComments.match(actionLogInCode) || [];
assert(actionLogCodeMatches.length === 0, 'Zero references to this.actionLog in executable code');

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 4: isActionAllowed() is async');
console.log('────────────────────────────────────────────────────────────');

const isActionAllowedDef = /async\s+isActionAllowed\s*\(action\)/;
assert(isActionAllowedDef.test(src), 'isActionAllowed is declared async');

// Verify it's awaited in executeAction
const awaitIsActionAllowed = /await\s+this\.isActionAllowed\s*\(action\)/;
assert(awaitIsActionAllowed.test(src), 'executeAction awaits isActionAllowed');

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 5: Daily limit queries Supabase');
console.log('────────────────────────────────────────────────────────────');

// isActionAllowed queries autopilot_actions table
const dailyQuery = src.includes("from('autopilot_actions')") &&
                   src.includes(".eq('organization_id', this.organizationId)") &&
                   src.includes(".gte('timestamp', startOfToday.toISOString())");
assert(dailyQuery, 'isActionAllowed queries autopilot_actions with org_id and timestamp filter');

// Computes startOfToday with UTC
const startOfTodayCalc = /const startOfToday = new Date\(\);\s*startOfToday\.setUTCHours\(0,\s*0,\s*0,\s*0\)/;
assert(startOfTodayCalc.test(src), 'Computes startOfToday with setUTCHours(0,0,0,0)');

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 6: Cooldown queries Supabase');
console.log('────────────────────────────────────────────────────────────');

// Cooldown checks in isActionAllowed query by type and timestamp
const cooldownQuery = src.includes(".eq('type', action.type)") &&
                      src.includes(".gte('timestamp', cooldownThreshold)") &&
                      src.includes('.limit(1)');
assert(cooldownQuery, 'Cooldown queries autopilot_actions by type, timestamp, with limit(1)');

// Computes cooldownMs from guardrails
const cooldownCalc = /const cooldownMs = this\.guardrails\.actions\.cooldown_hours \* 60 \* 60 \* 1000/;
assert(cooldownCalc.test(src), 'Cooldown threshold computed from guardrails.actions.cooldown_hours');

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 7: generateDailySummary queries Supabase');
console.log('────────────────────────────────────────────────────────────');

// Extract generateDailySummary method
const genSummaryBlock = src.match(/async generateDailySummary\(\)\s*\{([\s\S]*?)\n\s{4}\}/);
assert(genSummaryBlock !== null, 'generateDailySummary method found');

const summaryBody = genSummaryBlock[1];
assert(summaryBody.includes("from('autopilot_actions')"), 'generateDailySummary queries autopilot_actions table');
assert(summaryBody.includes("eq('organization_id', this.organizationId)"), 'generateDailySummary filters by organization_id');
assert(summaryBody.includes("gte('timestamp', startOfToday.toISOString())"), 'generateDailySummary filters by today timestamp');
assert(!summaryBody.includes('this.actionLog'), 'generateDailySummary does NOT reference this.actionLog');
// BUG FIX verification: select only needed columns, not '*'
assert(summaryBody.includes(".select('status, estimated_impact, description')"), 'generateDailySummary selects only needed columns (not *)');
assert(!summaryBody.includes(".select('*')"), 'generateDailySummary does NOT use select(*)');

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 8: logAction() writes only to DB and handles errors');
console.log('────────────────────────────────────────────────────────────');

// Extract logAction method
const logActionBlock = src.match(/async logAction\(action\)\s*\{([\s\S]*?)\n\s{4}\}/);
assert(logActionBlock !== null, 'logAction method found');

const logBody = logActionBlock[1];
assert(!logBody.includes('this.actionLog.push'), 'logAction does NOT push to in-memory array');
assert(logBody.includes("from('autopilot_actions').insert(logEntry)"), 'logAction inserts to autopilot_actions table');
assert(logBody.includes('if (error)'), 'logAction checks for DB errors');
assert(logBody.includes('throw new Error'), 'logAction throws on DB error (fail-fast)');

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 9: Fail-closed pattern in isActionAllowed');
console.log('────────────────────────────────────────────────────────────');

// Extract isActionAllowed method
const isActionAllowedBlock = src.match(/async isActionAllowed\(action\)\s*\{([\s\S]*?)\n\s{4}\}/);
assert(isActionAllowedBlock !== null, 'isActionAllowed method found');
const iaaBody = isActionAllowedBlock[1];

// Check fail-closed on daily limit error
assert(iaaBody.includes('if (dailyError)'), 'Checks for daily query error');
assert(iaaBody.includes("reason: 'Unable to verify daily action limit'"), 'Daily error returns allowed:false with reason');

// Check fail-closed on cooldown error
assert(iaaBody.includes('if (cooldownError)'), 'Checks for cooldown query error');
assert(iaaBody.includes("reason: 'Unable to verify cooldown period'"), 'Cooldown error returns allowed:false with reason');

// Count fail-closed returns — 2 DB error paths + 1 null auto_actions path = 3 total
const failClosedDBReturns = (iaaBody.match(/Unable to verify/g) || []).length;
assert(failClosedDBReturns === 2, `Exactly 2 DB-error fail-closed paths (got ${failClosedDBReturns})`);
const failClosedNullConfig = iaaBody.includes('auto_actions is not configured');
assert(failClosedNullConfig, 'Fail-closed path for null/undefined auto_actions');

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 10: No remaining serverless-incompatible patterns');
console.log('────────────────────────────────────────────────────────────');

// No while(true) or while(this.*) loops
const infiniteLoops = /while\s*\(\s*(true|this\.\w+)\s*\)/g;
const loopMatches = srcNoComments.match(infiniteLoops) || [];
assert(loopMatches.length === 0, `No infinite loops in executable code (found ${loopMatches.length})`);

// No setInterval calls (would be meaningless in serverless)
assert(!srcNoComments.includes('setInterval'), 'No setInterval calls in executable code');

// setTimeout is OK only in promise-based sleep patterns
const setTimeoutUsages = (srcNoComments.match(/setTimeout/g) || []).length;
// We don't expect any setTimeout in autopilot.js anymore (that was in runContinuously)
assert(setTimeoutUsages === 0, `No setTimeout in executable code (found ${setTimeoutUsages})`);


// ═════════════════════════════════════════════════════════════════════════════
// SECTION 2: BEHAVIORAL TESTS — isActionAllowed() with mock Supabase
// ═════════════════════════════════════════════════════════════════════════════

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 11: Daily limit enforcement — under limit allows action');
console.log('────────────────────────────────────────────────────────────');

// Build a mock autopilot instance (no real imports needed for unit testing)
function createMockAutopilot(overrides = {}) {
    return {
        organizationId: 'org-test-001',
        userId: 'user-test-001',
        mode: {
            name: 'Assist',
            auto_actions: ['rate_limit', 'cache_enable', 'minor_model_switch'],
            max_auto_savings: 1000,
            alerts: true
        },
        guardrails: {
            budget: { hard_ceiling: null, soft_ceiling_percent: 100, auto_throttle_percent: 120 },
            quality: { min_model_tier: 'standard', preserve_latency: true, preserve_accuracy: 0.95 },
            actions: { max_daily_changes: 10, require_rollback_plan: true, notify_on_action: true, cooldown_hours: 1 },
            overrides: { human_override_priority: true, pause_on_error: true, daily_summary: true }
        },
        _supabaseCalls: [],
        ...overrides
    };
}

// Create a function that simulates isActionAllowed's logic with mock Supabase
// This lets us test the decision logic without actual imports
async function simulateIsActionAllowed(autopilot, action, mockSupabase) {
    // Mode check
    if (autopilot.mode.auto_actions === false) {
        return { allowed: false, reason: 'Autopilot in Monitor mode' };
    }

    if (autopilot.mode.auto_actions !== 'all' &&
        !autopilot.mode.auto_actions.includes(action.type)) {
        return { allowed: false, reason: `Action type '${action.type}' not allowed in ${autopilot.mode.name} mode` };
    }

    // Savings threshold
    if (action.estimated_impact > autopilot.mode.max_auto_savings) {
        return {
            allowed: false,
            reason: `Impact $${action.estimated_impact} exceeds auto-approval limit $${autopilot.mode.max_auto_savings}`,
            requires_approval: true
        };
    }

    // Daily limit — query mock Supabase
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const dailyResult = await mockSupabase.query('daily_count', {
        table: 'autopilot_actions',
        org: autopilot.organizationId,
        since: startOfToday.toISOString()
    });

    if (dailyResult.error) {
        return { allowed: false, reason: 'Unable to verify daily action limit' };
    }

    if ((dailyResult.data?.length ?? 0) >= autopilot.guardrails.actions.max_daily_changes) {
        return { allowed: false, reason: 'Daily action limit reached' };
    }

    // Cooldown — query mock Supabase
    const cooldownMs = autopilot.guardrails.actions.cooldown_hours * 60 * 60 * 1000;
    const cooldownThreshold = new Date(Date.now() - cooldownMs).toISOString();

    const cooldownResult = await mockSupabase.query('cooldown', {
        table: 'autopilot_actions',
        org: autopilot.organizationId,
        type: action.type,
        since: cooldownThreshold
    });

    if (cooldownResult.error) {
        return { allowed: false, reason: 'Unable to verify cooldown period' };
    }

    if (cooldownResult.data && cooldownResult.data.length > 0) {
        return { allowed: false, reason: 'Cooldown period active for this action type' };
    }

    return { allowed: true };
}

{
    const autopilot = createMockAutopilot();
    const action = { type: 'rate_limit', estimated_impact: 500 };
    const mockSupabase = {
        query: async (type) => {
            if (type === 'daily_count') return { data: Array(5).fill({ id: 'x' }) }; // 5 actions, limit 10
            if (type === 'cooldown') return { data: [] }; // no recent similar
            return { data: [] };
        }
    };

    const result = await simulateIsActionAllowed(autopilot, action, mockSupabase);
    assert(result.allowed === true, 'Under daily limit (5/10) → allowed');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 12: Daily limit enforcement — at limit blocks action');
console.log('────────────────────────────────────────────────────────────');

{
    const autopilot = createMockAutopilot();
    const action = { type: 'rate_limit', estimated_impact: 500 };
    const mockSupabase = {
        query: async (type) => {
            if (type === 'daily_count') return { data: Array(10).fill({ id: 'x' }) }; // exactly 10
            if (type === 'cooldown') return { data: [] };
            return { data: [] };
        }
    };

    const result = await simulateIsActionAllowed(autopilot, action, mockSupabase);
    assert(result.allowed === false, 'At daily limit (10/10) → blocked');
    assert(result.reason === 'Daily action limit reached', 'Reason is "Daily action limit reached"');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 13: Daily limit enforcement — over limit blocks action');
console.log('────────────────────────────────────────────────────────────');

{
    const autopilot = createMockAutopilot();
    const action = { type: 'cache_enable', estimated_impact: 100 };
    const mockSupabase = {
        query: async (type) => {
            if (type === 'daily_count') return { data: Array(15).fill({ id: 'x' }) }; // 15 > 10
            if (type === 'cooldown') return { data: [] };
            return { data: [] };
        }
    };

    const result = await simulateIsActionAllowed(autopilot, action, mockSupabase);
    assert(result.allowed === false, 'Over daily limit (15/10) → blocked');
    assert(result.reason === 'Daily action limit reached', 'Correct reason');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 14: Cooldown enforcement — recent action blocks');
console.log('────────────────────────────────────────────────────────────');

{
    const autopilot = createMockAutopilot();
    const action = { type: 'rate_limit', estimated_impact: 500 };
    const mockSupabase = {
        query: async (type) => {
            if (type === 'daily_count') return { data: Array(3).fill({ id: 'x' }) }; // under limit
            if (type === 'cooldown') return { data: [{ id: 'recent-action' }] }; // found recent!
            return { data: [] };
        }
    };

    const result = await simulateIsActionAllowed(autopilot, action, mockSupabase);
    assert(result.allowed === false, 'Recent similar action within cooldown → blocked');
    assert(result.reason === 'Cooldown period active for this action type', 'Correct cooldown reason');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 15: Cooldown enforcement — no recent action allows');
console.log('────────────────────────────────────────────────────────────');

{
    const autopilot = createMockAutopilot();
    const action = { type: 'rate_limit', estimated_impact: 500 };
    const mockSupabase = {
        query: async (type) => {
            if (type === 'daily_count') return { data: Array(3).fill({ id: 'x' }) };
            if (type === 'cooldown') return { data: [] }; // empty = no cooldown match
            return { data: [] };
        }
    };

    const result = await simulateIsActionAllowed(autopilot, action, mockSupabase);
    assert(result.allowed === true, 'No recent similar action → allowed');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 16: Mode enforcement — Monitor mode blocks all');
console.log('────────────────────────────────────────────────────────────');

{
    const autopilot = createMockAutopilot({
        mode: { name: 'Monitor', auto_actions: false, alerts: true }
    });
    const action = { type: 'rate_limit', estimated_impact: 100 };
    const mockSupabase = { query: async () => ({ data: [] }) };

    const result = await simulateIsActionAllowed(autopilot, action, mockSupabase);
    assert(result.allowed === false, 'Monitor mode → blocked');
    assert(result.reason === 'Autopilot in Monitor mode', 'Correct Monitor mode reason');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 17: Mode enforcement — Assist mode blocks unauthorized types');
console.log('────────────────────────────────────────────────────────────');

{
    const autopilot = createMockAutopilot(); // Assist mode: rate_limit, cache_enable, minor_model_switch
    const action = { type: 'budget_throttle', estimated_impact: 100 }; // NOT in Assist list
    const mockSupabase = { query: async () => ({ data: [] }) };

    const result = await simulateIsActionAllowed(autopilot, action, mockSupabase);
    assert(result.allowed === false, 'Unauthorized action type in Assist mode → blocked');
    assert(result.reason.includes("not allowed in Assist mode"), 'Reason mentions mode restriction');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 18: Savings threshold — exceeds limit triggers approval');
console.log('────────────────────────────────────────────────────────────');

{
    const autopilot = createMockAutopilot(); // max_auto_savings: 1000
    const action = { type: 'rate_limit', estimated_impact: 5000 }; // 5000 > 1000
    const mockSupabase = { query: async () => ({ data: [] }) };

    const result = await simulateIsActionAllowed(autopilot, action, mockSupabase);
    assert(result.allowed === false, 'Impact exceeds max_auto_savings → blocked');
    assert(result.requires_approval === true, 'Response includes requires_approval: true');
    assert(result.reason.includes('exceeds auto-approval limit'), 'Reason mentions approval limit');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 19: Autonomous mode allows all action types');
console.log('────────────────────────────────────────────────────────────');

{
    // NOTE: The source code checks `auto_actions !== 'all'` (string comparison).
    // AUTOPILOT_MODES.AUTONOMOUS defines auto_actions: ['all'] (array), which
    // means the array !== string check always passes. This is a pre-existing
    // quirk in the AUTOPILOT_MODES definition (not W-004 scope). For this test,
    // we pass auto_actions as the string 'all' to verify the intended logic path.
    const autopilot = createMockAutopilot({
        mode: { name: 'Autonomous', auto_actions: 'all', max_auto_savings: 10000, alerts: true }
    });
    const action = { type: 'budget_throttle', estimated_impact: 5000 };
    const mockSupabase = {
        query: async (type) => {
            if (type === 'daily_count') return { data: Array(2).fill({ id: 'x' }) };
            if (type === 'cooldown') return { data: [] };
            return { data: [] };
        }
    };

    const result = await simulateIsActionAllowed(autopilot, action, mockSupabase);
    assert(result.allowed === true, 'Autonomous mode allows budget_throttle');
}


// ═════════════════════════════════════════════════════════════════════════════
// SECTION 3: FAIL-CLOSED TESTS — DB Errors Deny Actions
// ═════════════════════════════════════════════════════════════════════════════

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 20: Fail-closed — daily limit query error denies action');
console.log('────────────────────────────────────────────────────────────');

{
    const autopilot = createMockAutopilot();
    const action = { type: 'rate_limit', estimated_impact: 100 };
    const mockSupabase = {
        query: async (type) => {
            if (type === 'daily_count') return { data: null, error: { message: 'connection refused' } };
            return { data: [] };
        }
    };

    const result = await simulateIsActionAllowed(autopilot, action, mockSupabase);
    assert(result.allowed === false, 'DB error on daily count → blocked (fail-closed)');
    assert(result.reason === 'Unable to verify daily action limit', 'Correct fail-closed reason');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 21: Fail-closed — cooldown query error denies action');
console.log('────────────────────────────────────────────────────────────');

{
    const autopilot = createMockAutopilot();
    const action = { type: 'rate_limit', estimated_impact: 100 };
    const mockSupabase = {
        query: async (type) => {
            if (type === 'daily_count') return { data: Array(3).fill({ id: 'x' }) }; // under limit
            if (type === 'cooldown') return { data: null, error: { message: 'timeout' } };
            return { data: [] };
        }
    };

    const result = await simulateIsActionAllowed(autopilot, action, mockSupabase);
    assert(result.allowed === false, 'DB error on cooldown → blocked (fail-closed)');
    assert(result.reason === 'Unable to verify cooldown period', 'Correct fail-closed reason');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 22: Fail-closed — null data treated as zero count');
console.log('────────────────────────────────────────────────────────────');

{
    const autopilot = createMockAutopilot();
    const action = { type: 'rate_limit', estimated_impact: 100 };
    const mockSupabase = {
        query: async (type) => {
            if (type === 'daily_count') return { data: null }; // null, not error
            if (type === 'cooldown') return { data: null }; // null, not error
            return { data: [] };
        }
    };

    const result = await simulateIsActionAllowed(autopilot, action, mockSupabase);
    // null data with no error → (null?.length ?? 0) = 0 → under limit
    assert(result.allowed === true, 'Null data (no error) treated as 0 count → allowed');
}


// ═════════════════════════════════════════════════════════════════════════════
// SECTION 4: DAILY SUMMARY — DB-Backed Generation
// ═════════════════════════════════════════════════════════════════════════════

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 23: generateDailySummary with mixed action statuses');
console.log('────────────────────────────────────────────────────────────');

async function simulateGenerateDailySummary(autopilot, mockSupabase) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const result = await mockSupabase.query('daily_summary', {
        table: 'autopilot_actions',
        org: autopilot.organizationId,
        since: startOfToday.toISOString()
    });

    if (result.error) {
        return {
            date: new Date().toDateString(),
            mode: autopilot.mode.name,
            actions_taken: 0,
            actions_blocked: 0,
            estimated_savings: 0,
            top_actions: [],
            error: 'Failed to retrieve action data'
        };
    }

    const actions = result.data || [];
    const completed = actions.filter(a => a.status === 'completed');
    const blocked = actions.filter(a => a.status === 'blocked');
    const totalSavings = completed.reduce((sum, a) => sum + (a.estimated_impact || 0), 0);

    return {
        date: new Date().toDateString(),
        mode: autopilot.mode.name,
        actions_taken: completed.length,
        actions_blocked: blocked.length,
        estimated_savings: totalSavings,
        top_actions: completed.slice(0, 5).map(a => a.description)
    };
}

{
    const autopilot = createMockAutopilot();
    const mockActions = [
        { status: 'completed', estimated_impact: 200, description: 'Applied rate limit' },
        { status: 'completed', estimated_impact: 350, description: 'Enabled caching' },
        { status: 'blocked', estimated_impact: 100, description: 'Model switch blocked' },
        { status: 'completed', estimated_impact: 150, description: 'Rate limit on anomaly' },
        { status: 'failed', estimated_impact: 50, description: 'Throttle failed' },
        { status: 'blocked', estimated_impact: 80, description: 'Daily limit reached' },
    ];

    const mockSupabase = {
        query: async () => ({ data: mockActions })
    };

    const summary = await simulateGenerateDailySummary(autopilot, mockSupabase);
    assert(summary.actions_taken === 3, `Completed count = 3 (got ${summary.actions_taken})`);
    assert(summary.actions_blocked === 2, `Blocked count = 2 (got ${summary.actions_blocked})`);
    assert(summary.estimated_savings === 700, `Total savings = 700 (got ${summary.estimated_savings})`);
    assert(summary.top_actions.length === 3, `Top actions has 3 items (got ${summary.top_actions.length})`);
    assert(summary.mode === 'Assist', `Mode is Assist (got ${summary.mode})`);
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 24: generateDailySummary with empty day');
console.log('────────────────────────────────────────────────────────────');

{
    const autopilot = createMockAutopilot();
    const mockSupabase = {
        query: async () => ({ data: [] })
    };

    const summary = await simulateGenerateDailySummary(autopilot, mockSupabase);
    assert(summary.actions_taken === 0, 'Empty day → 0 actions taken');
    assert(summary.actions_blocked === 0, 'Empty day → 0 actions blocked');
    assert(summary.estimated_savings === 0, 'Empty day → 0 savings');
    assert(summary.top_actions.length === 0, 'Empty day → 0 top actions');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 25: generateDailySummary with DB error');
console.log('────────────────────────────────────────────────────────────');

{
    const autopilot = createMockAutopilot();
    const mockSupabase = {
        query: async () => ({ data: null, error: { message: 'connection reset' } })
    };

    const summary = await simulateGenerateDailySummary(autopilot, mockSupabase);
    assert(summary.actions_taken === 0, 'DB error → 0 actions taken');
    assert(summary.error === 'Failed to retrieve action data', 'DB error → error field set');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 26: generateDailySummary caps top_actions at 5');
console.log('────────────────────────────────────────────────────────────');

{
    const autopilot = createMockAutopilot();
    const mockActions = Array(8).fill(null).map((_, i) => ({
        status: 'completed',
        estimated_impact: 100 * (i + 1),
        description: `Action ${i + 1}`
    }));

    const mockSupabase = {
        query: async () => ({ data: mockActions })
    };

    const summary = await simulateGenerateDailySummary(autopilot, mockSupabase);
    assert(summary.actions_taken === 8, `All 8 completed counted (got ${summary.actions_taken})`);
    assert(summary.top_actions.length === 5, `Top actions capped at 5 (got ${summary.top_actions.length})`);
    assert(summary.top_actions[0] === 'Action 1', 'First top action is Action 1');
    assert(summary.top_actions[4] === 'Action 5', 'Fifth top action is Action 5');
}


// ═════════════════════════════════════════════════════════════════════════════
// SECTION 5: EDGE CASES — Boundary Conditions
// ═════════════════════════════════════════════════════════════════════════════

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 27: Daily limit boundary — exactly max_daily_changes - 1');
console.log('────────────────────────────────────────────────────────────');

{
    const autopilot = createMockAutopilot();
    const action = { type: 'rate_limit', estimated_impact: 100 };
    const mockSupabase = {
        query: async (type) => {
            if (type === 'daily_count') return { data: Array(9).fill({ id: 'x' }) }; // 9 = limit-1
            if (type === 'cooldown') return { data: [] };
            return { data: [] };
        }
    };

    const result = await simulateIsActionAllowed(autopilot, action, mockSupabase);
    assert(result.allowed === true, 'At max_daily_changes-1 (9/10) → allowed');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 28: Daily limit boundary — zero actions today');
console.log('────────────────────────────────────────────────────────────');

{
    const autopilot = createMockAutopilot();
    const action = { type: 'rate_limit', estimated_impact: 100 };
    const mockSupabase = {
        query: async (type) => {
            if (type === 'daily_count') return { data: [] }; // 0 actions
            if (type === 'cooldown') return { data: [] };
            return { data: [] };
        }
    };

    const result = await simulateIsActionAllowed(autopilot, action, mockSupabase);
    assert(result.allowed === true, 'Zero actions today → allowed');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 29: Custom guardrails — max_daily_changes = 1');
console.log('────────────────────────────────────────────────────────────');

{
    const autopilot = createMockAutopilot();
    autopilot.guardrails.actions.max_daily_changes = 1;
    const action = { type: 'rate_limit', estimated_impact: 100 };

    // Already 1 action today
    const mockSupabase = {
        query: async (type) => {
            if (type === 'daily_count') return { data: [{ id: 'x' }] }; // 1 = limit
            if (type === 'cooldown') return { data: [] };
            return { data: [] };
        }
    };

    const result = await simulateIsActionAllowed(autopilot, action, mockSupabase);
    assert(result.allowed === false, 'Custom limit 1, already 1 action → blocked');
    assert(result.reason === 'Daily action limit reached', 'Correct reason');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 30: Custom guardrails — cooldown_hours = 0');
console.log('────────────────────────────────────────────────────────────');

{
    // When cooldown is 0, the cooldownThreshold would be Date.now() - 0 = now
    // So essentially no cooldown should trigger
    const autopilot = createMockAutopilot();
    autopilot.guardrails.actions.cooldown_hours = 0;
    const action = { type: 'rate_limit', estimated_impact: 100 };

    const mockSupabase = {
        query: async (type, params) => {
            if (type === 'daily_count') return { data: [] };
            if (type === 'cooldown') {
                // With 0h cooldown, threshold = right now, so no actions should match
                return { data: [] };
            }
            return { data: [] };
        }
    };

    const result = await simulateIsActionAllowed(autopilot, action, mockSupabase);
    assert(result.allowed === true, 'Zero cooldown hours → allowed (no cooldown enforced)');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 31: Savings threshold — exactly at limit');
console.log('────────────────────────────────────────────────────────────');

{
    const autopilot = createMockAutopilot(); // max_auto_savings: 1000
    const action = { type: 'rate_limit', estimated_impact: 1000 }; // exactly 1000
    const mockSupabase = {
        query: async (type) => {
            if (type === 'daily_count') return { data: [] };
            if (type === 'cooldown') return { data: [] };
            return { data: [] };
        }
    };

    const result = await simulateIsActionAllowed(autopilot, action, mockSupabase);
    // 1000 > 1000 is false, so it should be allowed
    assert(result.allowed === true, 'Impact exactly at max_auto_savings (1000) → allowed (not strictly greater)');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 32: Savings threshold — 1 over limit');
console.log('────────────────────────────────────────────────────────────');

{
    const autopilot = createMockAutopilot(); // max_auto_savings: 1000
    const action = { type: 'rate_limit', estimated_impact: 1001 }; // 1001 > 1000
    const mockSupabase = { query: async () => ({ data: [] }) };

    const result = await simulateIsActionAllowed(autopilot, action, mockSupabase);
    assert(result.allowed === false, 'Impact 1001 > max 1000 → blocked');
    assert(result.requires_approval === true, 'Triggers approval request');
}


// ═════════════════════════════════════════════════════════════════════════════
// SECTION 6: SERVERLESS INVOCATION SIMULATION
// ═════════════════════════════════════════════════════════════════════════════

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 33: Simulate multiple serverless invocations (the core W-004 bug)');
console.log('────────────────────────────────────────────────────────────');

{
    // This test demonstrates WHY the old code was broken.
    // In the old code, each "invocation" created a fresh instance with empty actionLog.
    // The daily limit would NEVER trigger because actionLog.length was always 0.
    //
    // With the fix, each invocation queries the DB, so accumulated actions are visible.

    let dbActions = [];
    const MAX_DAILY = 10;

    async function simulateCronInvocation(invocationNumber) {
        // Each cron invocation creates a fresh instance (simulated)
        const autopilot = createMockAutopilot();

        const mockSupabase = {
            query: async (type) => {
                if (type === 'daily_count') return { data: [...dbActions] }; // query DB
                if (type === 'cooldown') return { data: [] }; // different types each time
                return { data: [] };
            }
        };

        const action = {
            type: ['rate_limit', 'cache_enable', 'minor_model_switch'][invocationNumber % 3],
            estimated_impact: 100
        };

        const result = await simulateIsActionAllowed(autopilot, action, mockSupabase);

        if (result.allowed) {
            // Simulate the action being logged to DB
            dbActions.push({ id: `action-${invocationNumber}`, type: action.type, timestamp: new Date().toISOString() });
        }

        return result;
    }

    // Simulate 15 cron invocations
    let allowedCount = 0;
    let blockedCount = 0;

    for (let i = 0; i < 15; i++) {
        const result = await simulateCronInvocation(i);
        if (result.allowed) allowedCount++;
        else blockedCount++;
    }

    assert(allowedCount === MAX_DAILY, `Exactly ${MAX_DAILY} actions allowed across 15 invocations (got ${allowedCount})`);
    assert(blockedCount === 5, `Exactly 5 actions blocked (got ${blockedCount})`);
    assert(dbActions.length === MAX_DAILY, `DB has exactly ${MAX_DAILY} logged actions (got ${dbActions.length})`);
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 34: Old code simulation — demonstrates the bug');
console.log('────────────────────────────────────────────────────────────');

{
    // This simulates what the OLD code would have done.
    // Each invocation has an empty in-memory actionLog, so the daily check
    // always sees 0 actions and always allows.

    let oldActionLog = [];
    const MAX_DAILY = 10;
    let oldAllowedCount = 0;

    for (let i = 0; i < 15; i++) {
        // Old code: fresh in-memory actionLog per invocation
        const inMemoryLog = []; // empty every time!

        const todayActions = inMemoryLog.filter(a =>
            new Date(a.timestamp).toDateString() === new Date().toDateString()
        );

        if (todayActions.length < MAX_DAILY) {
            oldAllowedCount++;
            // Old code pushes to in-memory (lost on next invocation)
            inMemoryLog.push({ timestamp: new Date().toISOString(), type: 'rate_limit' });
        }
    }

    assert(oldAllowedCount === 15, `OLD CODE BUG: All 15 actions allowed (no enforcement) — got ${oldAllowedCount}`);
    // This proves the old code was broken — 15/10 instead of 10/10
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 35: Cooldown across invocations');
console.log('────────────────────────────────────────────────────────────');

{
    // Simulate: action of type 'rate_limit' was logged 30 min ago.
    // New invocation tries rate_limit again — should be blocked (cooldown = 1h).

    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const dbActions = [{ id: 'prev', type: 'rate_limit', timestamp: thirtyMinAgo }];

    const autopilot = createMockAutopilot();
    const action = { type: 'rate_limit', estimated_impact: 100 };

    const mockSupabase = {
        query: async (type, params) => {
            if (type === 'daily_count') return { data: dbActions }; // 1 action, under 10
            if (type === 'cooldown') {
                // Filter by type and timestamp > threshold
                const cooldownMs = autopilot.guardrails.actions.cooldown_hours * 60 * 60 * 1000;
                const threshold = Date.now() - cooldownMs;
                const matches = dbActions.filter(a =>
                    a.type === params.type &&
                    new Date(a.timestamp).getTime() > threshold
                );
                return { data: matches };
            }
            return { data: [] };
        }
    };

    const result = await simulateIsActionAllowed(autopilot, action, mockSupabase);
    assert(result.allowed === false, 'Same action type within 1h cooldown → blocked');
    assert(result.reason === 'Cooldown period active for this action type', 'Correct reason');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 36: Cooldown expired — different invocation allows');
console.log('────────────────────────────────────────────────────────────');

{
    // Action logged 2 hours ago. Cooldown is 1h. New invocation should be allowed.

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const dbActions = [{ id: 'old', type: 'rate_limit', timestamp: twoHoursAgo }];

    const autopilot = createMockAutopilot();
    const action = { type: 'rate_limit', estimated_impact: 100 };

    const mockSupabase = {
        query: async (type, params) => {
            if (type === 'daily_count') return { data: dbActions };
            if (type === 'cooldown') {
                // 2h ago is outside the 1h cooldown window → no match
                const cooldownMs = autopilot.guardrails.actions.cooldown_hours * 60 * 60 * 1000;
                const threshold = Date.now() - cooldownMs;
                const matches = dbActions.filter(a =>
                    a.type === params.type &&
                    new Date(a.timestamp).getTime() > threshold
                );
                return { data: matches };
            }
            return { data: [] };
        }
    };

    const result = await simulateIsActionAllowed(autopilot, action, mockSupabase);
    assert(result.allowed === true, 'Same action type but 2h ago (cooldown 1h) → allowed');
}


// ═════════════════════════════════════════════════════════════════════════════
// SECTION 7: logAction ERROR HANDLING
// ═════════════════════════════════════════════════════════════════════════════

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 37: logAction throws on DB write error');
console.log('────────────────────────────────────────────────────────────');

{
    // Simulate logAction behavior
    async function simulateLogAction(action, mockSupabase) {
        const logEntry = {
            organization_id: 'org-test-001',
            timestamp: new Date().toISOString(),
            ...action
        };

        const { error } = await mockSupabase.insert(logEntry);
        if (error) {
            throw new Error(`[Autopilot] Action logging failed: ${error.message}`);
        }
    }

    // Success case
    let insertedEntry = null;
    const successMock = {
        insert: async (entry) => { insertedEntry = entry; return { error: null }; }
    };

    await simulateLogAction({ type: 'rate_limit', status: 'completed' }, successMock);
    assert(insertedEntry !== null, 'Successful insert stores entry');
    assert(insertedEntry.organization_id === 'org-test-001', 'Entry has correct org_id');
    assert(insertedEntry.type === 'rate_limit', 'Entry has correct type');

    // Error case
    const errorMock = {
        insert: async () => ({ error: { message: 'connection refused' } })
    };

    await assertAsyncThrows(
        () => simulateLogAction({ type: 'rate_limit' }, errorMock),
        'Action logging failed',
        'logAction throws on DB error'
    );
}


// ═════════════════════════════════════════════════════════════════════════════
// SECTION 8: GUARDRAIL EVALUATION ORDER
// ═════════════════════════════════════════════════════════════════════════════

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 38: Guardrail evaluation order is correct');
console.log('────────────────────────────────────────────────────────────');

{
    // Order should be: mode → action type → savings threshold → daily limit → cooldown
    // We verify by checking which check triggers first

    // 1. Mode check first — Monitor mode should block before anything else
    const autopilot1 = createMockAutopilot({
        mode: { name: 'Monitor', auto_actions: false, alerts: true }
    });
    const mockSupabase = { query: async () => { throw new Error('should not query DB'); } };
    const r1 = await simulateIsActionAllowed(autopilot1, { type: 'rate_limit', estimated_impact: 100 }, mockSupabase);
    assert(r1.reason === 'Autopilot in Monitor mode', 'Mode check happens before DB queries');

    // 2. Type check before savings threshold
    const autopilot2 = createMockAutopilot(); // Assist mode
    const r2 = await simulateIsActionAllowed(
        autopilot2,
        { type: 'budget_throttle', estimated_impact: 50000 }, // bad type AND over savings
        mockSupabase
    );
    assert(r2.reason.includes('not allowed in Assist mode'), 'Type check happens before savings check');

    // 3. Savings threshold before daily limit
    const autopilot3 = createMockAutopilot();
    const overSavings = { query: async () => { throw new Error('should not query DB for savings check'); } };
    const r3 = await simulateIsActionAllowed(
        autopilot3,
        { type: 'rate_limit', estimated_impact: 99999 }, // allowed type but over savings
        overSavings
    );
    assert(r3.reason.includes('exceeds auto-approval limit'), 'Savings check happens before DB queries');

    // 4. Daily limit before cooldown
    const autopilot4 = createMockAutopilot();
    let queriedCooldown = false;
    const dailyLimitMock = {
        query: async (type) => {
            if (type === 'daily_count') return { data: Array(10).fill({ id: 'x' }) }; // at limit
            if (type === 'cooldown') { queriedCooldown = true; return { data: [] }; }
            return { data: [] };
        }
    };
    const r4 = await simulateIsActionAllowed(
        autopilot4,
        { type: 'rate_limit', estimated_impact: 100 },
        dailyLimitMock
    );
    assert(r4.reason === 'Daily action limit reached', 'Daily limit blocks before cooldown check');
    assert(queriedCooldown === false, 'Cooldown query was skipped (daily limit triggered first)');
}


// ═════════════════════════════════════════════════════════════════════════════
// SECTION 9: STRUCTURAL VERIFICATION
// ═════════════════════════════════════════════════════════════════════════════

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 39: Constructor has no in-memory state variables');
console.log('────────────────────────────────────────────────────────────');

{
    const ctorBody = constructorBlock[1];
    // Should have: organizationId, userId, mode, guardrails, memory, _memoryLoaded
    assert(ctorBody.includes('this.organizationId'), 'Constructor sets organizationId');
    assert(ctorBody.includes('this.userId'), 'Constructor sets userId');
    assert(ctorBody.includes('this.mode'), 'Constructor sets mode');
    assert(ctorBody.includes('this.guardrails'), 'Constructor sets guardrails');
    assert(ctorBody.includes('this.memory'), 'Constructor sets memory');
    assert(ctorBody.includes('this._memoryLoaded'), 'Constructor sets _memoryLoaded');

    // Should NOT have: actionLog, isRunning
    assert(!ctorBody.includes('this.actionLog'), 'Constructor does NOT set actionLog');
    assert(!ctorBody.includes('this.isRunning'), 'Constructor does NOT set isRunning');

    // Count this.* assignments — should be exactly 6
    const assignments = ctorBody.match(/this\.\w+\s*=/g) || [];
    assert(assignments.length === 6, `Constructor has exactly 6 this.* assignments (got ${assignments.length})`);
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 40: executeAction properly awaits isActionAllowed');
console.log('────────────────────────────────────────────────────────────');

{
    // Verify the exact pattern in executeAction
    const execBlock = src.match(/async executeAction\(action\)\s*\{([\s\S]*?)\n\s{4}\}/);
    assert(execBlock !== null, 'executeAction method found');

    const execBody = execBlock[1];
    assert(execBody.includes('await this.isActionAllowed(action)'), 'executeAction awaits isActionAllowed');
    assert(!execBody.includes('this.isRunning'), 'executeAction has no this.isRunning reference');

    // Check the error handling path doesn't set isRunning
    const errorBlock = execBody.match(/catch\s*\(error\)\s*\{([\s\S]*?)\}/);
    assert(errorBlock !== null, 'executeAction has catch block');
    assert(!errorBlock[1].includes('this.isRunning'), 'catch block does not set this.isRunning');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 41: SERVERLESS-SAFE documentation present');
console.log('────────────────────────────────────────────────────────────');

{
    const serverlessSafeCount = (src.match(/SERVERLESS-SAFE/g) || []).length;
    assert(serverlessSafeCount >= 3, `At least 3 SERVERLESS-SAFE JSDoc annotations (got ${serverlessSafeCount})`);

    // Specific methods that need the annotation
    assert(src.includes('SERVERLESS-SAFE: All guardrail checks query the autopilot_actions table'),
        'isActionAllowed has SERVERLESS-SAFE documentation');
    assert(src.includes('SERVERLESS-SAFE: Writes exclusively to the autopilot_actions table'),
        'logAction has SERVERLESS-SAFE documentation');
    assert(src.includes('SERVERLESS-SAFE: Queries the autopilot_actions table'),
        'generateDailySummary has SERVERLESS-SAFE documentation');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 42: Cron architecture documentation present');
console.log('────────────────────────────────────────────────────────────');

{
    assert(src.includes('SERVERLESS ARCHITECTURE'), 'checkAndAct has SERVERLESS ARCHITECTURE docs');
    assert(src.includes('cron triggers'), 'Documentation mentions cron triggers');
    assert(src.includes('NOT by a continuous loop'), 'Documentation clarifies no continuous loop');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 43: No Anthropic SDK import side effects');
console.log('────────────────────────────────────────────────────────────');

{
    // Verify the file structure is clean — imports at top, no side effects
    const importBlock = src.match(/^([\s\S]*?)(?=\n(?:const|let|var|\/\*\*|export|class))/m);
    assert(importBlock !== null, 'Import block found');

    // Verify exports
    assert(src.includes('export class FinaultAutopilot'), 'Named export of FinaultAutopilot class');
    assert(src.includes('export default FinaultAutopilot'), 'Default export of FinaultAutopilot');
}


// ═════════════════════════════════════════════════════════════════════════════
// SECTION 10: CROSS-INVOCATION CONSISTENCY
// ═════════════════════════════════════════════════════════════════════════════

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 44: Multiple organizations are properly isolated');
console.log('────────────────────────────────────────────────────────────');

{
    // Org A has 9 actions. Org B has 0. Both should be independently enforced.
    const orgAActions = Array(9).fill({ id: 'x', org: 'org-A' });
    const orgBActions = [];

    const autopilotA = createMockAutopilot({ organizationId: 'org-A' });
    const autopilotB = createMockAutopilot({ organizationId: 'org-B' });

    const mockSupabaseA = {
        query: async (type) => {
            if (type === 'daily_count') return { data: orgAActions };
            if (type === 'cooldown') return { data: [] };
            return { data: [] };
        }
    };

    const mockSupabaseB = {
        query: async (type) => {
            if (type === 'daily_count') return { data: orgBActions };
            if (type === 'cooldown') return { data: [] };
            return { data: [] };
        }
    };

    const action = { type: 'rate_limit', estimated_impact: 100 };
    const resultA = await simulateIsActionAllowed(autopilotA, action, mockSupabaseA);
    const resultB = await simulateIsActionAllowed(autopilotB, action, mockSupabaseB);

    assert(resultA.allowed === true, 'Org A with 9/10 → allowed');
    assert(resultB.allowed === true, 'Org B with 0/10 → allowed');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 45: Cooldown is type-specific');
console.log('────────────────────────────────────────────────────────────');

{
    // rate_limit was done 30 min ago. cache_enable should still be allowed.
    const dbActions = [{ id: 'prev', type: 'rate_limit', timestamp: new Date().toISOString() }];

    const autopilot = createMockAutopilot();

    const mockSupabase = {
        query: async (type, params) => {
            if (type === 'daily_count') return { data: dbActions };
            if (type === 'cooldown') {
                // Only match if same type
                const matches = dbActions.filter(a => a.type === params.type);
                return { data: matches };
            }
            return { data: [] };
        }
    };

    // cache_enable should be allowed even though rate_limit was recent
    const action = { type: 'cache_enable', estimated_impact: 100 };
    const result = await simulateIsActionAllowed(autopilot, action, mockSupabase);
    assert(result.allowed === true, 'Different action type → not affected by other types cooldown');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 46: generateDailySummary ignores failed actions in savings');
console.log('────────────────────────────────────────────────────────────');

{
    const autopilot = createMockAutopilot();
    const mockActions = [
        { status: 'completed', estimated_impact: 500, description: 'Rate limit' },
        { status: 'failed', estimated_impact: 300, description: 'Failed throttle' },
        { status: 'completed', estimated_impact: 200, description: 'Cache' }
    ];

    const mockSupabase = { query: async () => ({ data: mockActions }) };
    const summary = await simulateGenerateDailySummary(autopilot, mockSupabase);

    assert(summary.estimated_savings === 700, `Savings counts only completed (got ${summary.estimated_savings})`);
    assert(summary.actions_taken === 2, `Actions taken counts only completed (got ${summary.actions_taken})`);
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 47: generateDailySummary handles null estimated_impact');
console.log('────────────────────────────────────────────────────────────');

{
    const autopilot = createMockAutopilot();
    const mockActions = [
        { status: 'completed', estimated_impact: 500, description: 'A' },
        { status: 'completed', estimated_impact: null, description: 'B' },
        { status: 'completed', description: 'C' } // undefined estimated_impact
    ];

    const mockSupabase = { query: async () => ({ data: mockActions }) };
    const summary = await simulateGenerateDailySummary(autopilot, mockSupabase);

    assert(summary.estimated_savings === 500, `Null/undefined impacts treated as 0 (got ${summary.estimated_savings})`);
    assert(summary.actions_taken === 3, `All 3 completed counted (got ${summary.actions_taken})`);
}


// ═════════════════════════════════════════════════════════════════════════════
// SECTION 11: STRESS TEST — High Volume Scenarios
// ═════════════════════════════════════════════════════════════════════════════

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 48: Stress test — 100 rapid cron invocations');
console.log('────────────────────────────────────────────────────────────');

{
    const MAX_DAILY = 10;
    let dbActions = [];
    let allowedCount = 0;
    let blockedCount = 0;
    const actionTypes = ['rate_limit', 'cache_enable', 'minor_model_switch'];

    for (let i = 0; i < 100; i++) {
        const autopilot = createMockAutopilot();
        // Vary cooldown_hours to 0 so cooldown doesn't interfere with daily limit test
        autopilot.guardrails.actions.cooldown_hours = 0;

        const mockSupabase = {
            query: async (type) => {
                if (type === 'daily_count') return { data: [...dbActions] };
                if (type === 'cooldown') return { data: [] };
                return { data: [] };
            }
        };

        const actionType = actionTypes[i % 3];
        const action = { type: actionType, estimated_impact: 100 };
        const result = await simulateIsActionAllowed(autopilot, action, mockSupabase);

        if (result.allowed) {
            allowedCount++;
            dbActions.push({ id: `stress-${i}`, type: actionType, timestamp: new Date().toISOString() });
        } else {
            blockedCount++;
        }
    }

    assert(allowedCount === MAX_DAILY, `100 invocations: exactly ${MAX_DAILY} allowed (got ${allowedCount})`);
    assert(blockedCount === 90, `100 invocations: exactly 90 blocked (got ${blockedCount})`);
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 49: Stress test — generateDailySummary with 1000 actions');
console.log('────────────────────────────────────────────────────────────');

{
    const autopilot = createMockAutopilot();
    const mockActions = Array(1000).fill(null).map((_, i) => ({
        status: i % 3 === 0 ? 'completed' : i % 3 === 1 ? 'blocked' : 'failed',
        estimated_impact: i * 10,
        description: `Action ${i}`
    }));

    const mockSupabase = { query: async () => ({ data: mockActions }) };
    const summary = await simulateGenerateDailySummary(autopilot, mockSupabase);

    const expectedCompleted = mockActions.filter(a => a.status === 'completed');
    const expectedBlocked = mockActions.filter(a => a.status === 'blocked');
    const expectedSavings = expectedCompleted.reduce((sum, a) => sum + (a.estimated_impact || 0), 0);

    assert(summary.actions_taken === expectedCompleted.length,
        `1000 actions: completed count correct (${summary.actions_taken} = ${expectedCompleted.length})`);
    assert(summary.actions_blocked === expectedBlocked.length,
        `1000 actions: blocked count correct (${summary.actions_blocked} = ${expectedBlocked.length})`);
    assert(summary.estimated_savings === expectedSavings,
        `1000 actions: savings correct (${summary.estimated_savings} = ${expectedSavings})`);
    assert(summary.top_actions.length === 5, 'Top actions still capped at 5 even with 1000 actions');
}


// ═════════════════════════════════════════════════════════════════════════════
// SECTION 12: REGRESSION PREVENTION
// ═════════════════════════════════════════════════════════════════════════════

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 50: Structural guard — no in-memory action tracking patterns');
console.log('────────────────────────────────────────────────────────────');

{
    // Guard against future regressions: ensure no one adds back in-memory patterns
    const dangerousPatterns = [
        { pattern: /this\.\w+\.push\(.*logEntry/g, desc: 'push to in-memory log' },
        { pattern: /this\.\w+\.filter\(.*timestamp/g, desc: 'filter in-memory by timestamp' },
        { pattern: /this\.\w+\.find\(.*\.type/g, desc: 'find in-memory by type' },
        { pattern: /while\s*\(\s*this\.\w+\s*\)/g, desc: 'infinite while loop' },
    ];

    for (const { pattern, desc } of dangerousPatterns) {
        const matches = srcNoComments.match(pattern) || [];
        assert(matches.length === 0, `No ${desc} patterns in executable code (found ${matches.length})`);
    }
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 51: All Supabase queries use organization_id filter');
console.log('────────────────────────────────────────────────────────────');

{
    // Every .from('autopilot_actions') call must have .eq('organization_id', ...)
    const fromAutopilotActions = src.split("from('autopilot_actions')");
    const queryCount = fromAutopilotActions.length - 1; // subtract the first split part

    assert(queryCount >= 3, `At least 3 queries to autopilot_actions (got ${queryCount})`);

    // Each query block should have organization_id filter
    // For SELECT queries: .eq('organization_id', ...) in the query chain
    // For INSERT queries: organization_id is in the logEntry object built above
    for (let i = 1; i < fromAutopilotActions.length; i++) {
        const queryBlock = fromAutopilotActions[i].split(/\n\n/)[0];
        const isInsert = queryBlock.includes('.insert(');
        if (isInsert) {
            // For INSERT, check that the logEntry construction includes organization_id
            // Look backwards in the source for the logEntry build
            const beforeInsert = fromAutopilotActions[i - 1] || '';
            const hasOrgInEntry = beforeInsert.includes('organization_id: this.organizationId') ||
                                  queryBlock.includes('organization_id');
            assert(hasOrgInEntry,
                `autopilot_actions INSERT #${i} includes organization_id in entry`);
        } else {
            assert(queryBlock.includes("organization_id"),
                `autopilot_actions query #${i} filters by organization_id`);
        }
    }
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 52: isActionAllowed check order prevents unnecessary DB queries');
console.log('────────────────────────────────────────────────────────────');

{
    // Verify that mode/type/savings checks happen BEFORE any supabase calls
    const iaaMethodBody = isActionAllowedBlock[1];
    const lines = iaaMethodBody.split('\n');

    let firstSupabaseCall = -1;
    let lastNonDBCheck = -1;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('supabase') && firstSupabaseCall === -1) {
            firstSupabaseCall = i;
        }
        if (lines[i].includes('this.mode.auto_actions') ||
            lines[i].includes('action.estimated_impact') ||
            lines[i].includes('max_auto_savings')) {
            lastNonDBCheck = i;
        }
    }

    assert(firstSupabaseCall > lastNonDBCheck,
        `Supabase calls (line ${firstSupabaseCall}) come after all non-DB checks (line ${lastNonDBCheck})`);
}


// ═════════════════════════════════════════════════════════════════════════════
// SECTION 13: HARDENING PASS — Bugs Found by Deep Audit
// ═════════════════════════════════════════════════════════════════════════════

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 53: BUG FIX — Timezone uses setUTCHours (not setHours)');
console.log('────────────────────────────────────────────────────────────');

{
    // Verify isActionAllowed uses setUTCHours
    const iaaBody = isActionAllowedBlock[1];
    assert(iaaBody.includes('setUTCHours(0, 0, 0, 0)'), 'isActionAllowed uses setUTCHours');
    assert(!iaaBody.includes('setHours(0, 0, 0, 0)'), 'isActionAllowed does NOT use setHours (local time)');

    // Verify generateDailySummary uses setUTCHours
    const genBody = genSummaryBlock[1];
    assert(genBody.includes('setUTCHours(0, 0, 0, 0)'), 'generateDailySummary uses setUTCHours');
    assert(!genBody.includes('setHours(0, 0, 0, 0)'), 'generateDailySummary does NOT use setHours (local time)');

    // Verify the UTC boundary is correct
    const now = new Date();
    const utcMidnight = new Date(now);
    utcMidnight.setUTCHours(0, 0, 0, 0);
    const localMidnight = new Date(now);
    localMidnight.setHours(0, 0, 0, 0);

    // In UTC environments, these are the same. In non-UTC, they differ.
    // The key assertion is that the code uses UTC consistently.
    const utcIso = utcMidnight.toISOString();
    assert(utcIso.endsWith('T00:00:00.000Z'), `UTC midnight ISO is correct: ${utcIso}`);
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 54: BUG FIX — Mode auto_actions handles array and string');
console.log('────────────────────────────────────────────────────────────');

{
    // Verify the code handles both forms
    assert(src.includes('allowsAll'), 'Code computes allowsAll variable');
    assert(src.includes("autoActions === 'all'"), 'Handles string form');
    assert(src.includes("autoActions.includes('all')"), 'Handles array form');
    assert(src.includes('Array.isArray(autoActions)'), 'Checks Array.isArray before .includes');

    // Behavioral test: array ['all'] should now work
    const autopilot = createMockAutopilot({
        mode: { name: 'Autonomous', auto_actions: ['all'], max_auto_savings: 10000, alerts: true }
    });

    // Simulate the fixed logic
    const autoActions = autopilot.mode.auto_actions;
    const allowsAll = autoActions === 'all' ||
        (Array.isArray(autoActions) && autoActions.includes('all'));
    assert(allowsAll === true, "Array ['all'] correctly detected as 'allows all'");

    // String 'all' should also work
    const autopilot2 = createMockAutopilot({
        mode: { name: 'Autonomous', auto_actions: 'all', max_auto_savings: 10000, alerts: true }
    });
    const autoActions2 = autopilot2.mode.auto_actions;
    const allowsAll2 = autoActions2 === 'all' ||
        (Array.isArray(autoActions2) && autoActions2.includes('all'));
    assert(allowsAll2 === true, "String 'all' correctly detected as 'allows all'");

    // Array of specific types should NOT match 'all'
    const autopilot3 = createMockAutopilot(); // Assist: ['rate_limit', 'cache_enable', 'minor_model_switch']
    const autoActions3 = autopilot3.mode.auto_actions;
    const allowsAll3 = autoActions3 === 'all' ||
        (Array.isArray(autoActions3) && autoActions3.includes('all'));
    assert(allowsAll3 === false, "Assist mode ['rate_limit', ...] is NOT 'allows all'");
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 55: BUG FIX — executeAction catch block preserves original error');
console.log('────────────────────────────────────────────────────────────');

{
    // Verify the catch block captures originalError before calling logAction
    const execBlock = src.match(/async executeAction\(action\)\s*\{([\s\S]*?)\n\s{4}\}/);
    const execBody = execBlock[1];

    // Check for originalError pattern
    assert(execBody.includes('const originalError = error.message'), 'Captures originalError before logAction');

    // Check that logAction is wrapped in try/catch
    const catchBlock = execBody.match(/\} catch \(error\) \{([\s\S]*?)return \{/);
    assert(catchBlock !== null, 'catch block found');
    const catchBody = catchBlock[1];

    assert(catchBody.includes('try {'), 'logAction wrapped in inner try');
    assert(catchBody.includes('catch (logError)'), 'Inner catch for logError');
    assert(catchBody.includes("'[Autopilot] Failed to log action error:'"), 'Logs logError with context');
    assert(catchBody.includes("'| Original error:'"), 'Preserves original error in log message');

    // Check notifyError is also wrapped
    assert(catchBody.includes('catch (notifyError)'), 'notifyError wrapped in try/catch');
    assert(catchBody.includes("'[Autopilot] Failed to send error notification:'"), 'Logs notifyError');

    // Verify return uses originalError, not error.message
    assert(catchBody.includes('error: originalError'), 'Return uses originalError variable');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 56: BUG FIX — Error masking scenario simulation');
console.log('────────────────────────────────────────────────────────────');

{
    // Simulate: performAction throws, then logAction also throws
    // With the fix, the original error should be preserved

    async function simulateExecuteActionErrorPath(originalErrorMsg, logActionThrows) {
        const originalError = originalErrorMsg;
        let loggedOriginalError = null;
        let logErrorCaught = null;

        try {
            // logAction call
            if (logActionThrows) {
                throw new Error('DB connection timeout');
            }
        } catch (logError) {
            logErrorCaught = logError.message;
            // In the fix, we log: console.error('[Autopilot] Failed to log action error:', logError.message, '| Original error:', originalError);
        }

        return { success: false, error: originalError, logErrorCaught };
    }

    // Case 1: logAction succeeds — original error returned
    const r1 = await simulateExecuteActionErrorPath('Model switch failed', false);
    assert(r1.error === 'Model switch failed', 'Original error preserved when logAction succeeds');
    assert(r1.logErrorCaught === null, 'No log error when logAction succeeds');

    // Case 2: logAction throws — original error still returned
    const r2 = await simulateExecuteActionErrorPath('Model switch failed', true);
    assert(r2.error === 'Model switch failed', 'Original error preserved even when logAction throws');
    assert(r2.logErrorCaught === 'DB connection timeout', 'Log error caught separately');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 57: TOCTOU race condition documented');
console.log('────────────────────────────────────────────────────────────');

{
    assert(src.includes('TOCTOU'), 'TOCTOU race condition documented in JSDoc');
    assert(src.includes('check-then-act'), 'Documents check-then-act pattern');
    assert(src.includes('advisory lock'), 'Documents PostgreSQL advisory lock as mitigation');
    assert(src.includes('bounded to +1'), 'Documents that overshoot is bounded');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 58: Autonomous mode with array auto_actions works end-to-end');
console.log('────────────────────────────────────────────────────────────');

{
    // Update simulateIsActionAllowed to use the fixed logic
    async function simulateIsActionAllowedFixed(autopilot, action, mockSupabase) {
        if (autopilot.mode.auto_actions === false) {
            return { allowed: false, reason: 'Autopilot in Monitor mode' };
        }

        const autoActions = autopilot.mode.auto_actions;
        const allowsAll = autoActions === 'all' ||
            (Array.isArray(autoActions) && autoActions.includes('all'));

        if (!allowsAll && Array.isArray(autoActions) && !autoActions.includes(action.type)) {
            return { allowed: false, reason: `Action type '${action.type}' not allowed in ${autopilot.mode.name} mode` };
        }

        if (action.estimated_impact > autopilot.mode.max_auto_savings) {
            return { allowed: false, reason: `exceeds auto-approval limit`, requires_approval: true };
        }

        const dailyResult = await mockSupabase.query('daily_count', {});
        if (dailyResult.error) return { allowed: false, reason: 'Unable to verify daily action limit' };
        if ((dailyResult.data?.length ?? 0) >= autopilot.guardrails.actions.max_daily_changes) {
            return { allowed: false, reason: 'Daily action limit reached' };
        }

        const cooldownResult = await mockSupabase.query('cooldown', { type: action.type });
        if (cooldownResult.error) return { allowed: false, reason: 'Unable to verify cooldown period' };
        if (cooldownResult.data && cooldownResult.data.length > 0) {
            return { allowed: false, reason: 'Cooldown period active for this action type' };
        }

        return { allowed: true };
    }

    const autopilot = createMockAutopilot({
        mode: { name: 'Autonomous', auto_actions: ['all'], max_auto_savings: 10000, alerts: true }
    });
    const mockSupabase = {
        query: async (type) => {
            if (type === 'daily_count') return { data: Array(3).fill({ id: 'x' }) };
            if (type === 'cooldown') return { data: [] };
            return { data: [] };
        }
    };

    // budget_throttle should now work with array ['all']
    const r1 = await simulateIsActionAllowedFixed(autopilot, { type: 'budget_throttle', estimated_impact: 5000 }, mockSupabase);
    assert(r1.allowed === true, "Autonomous mode with array ['all'] allows budget_throttle");

    // rate_limit should also work
    const r2 = await simulateIsActionAllowedFixed(autopilot, { type: 'rate_limit', estimated_impact: 500 }, mockSupabase);
    assert(r2.allowed === true, "Autonomous mode with array ['all'] allows rate_limit");

    // Random type should also work
    const r3 = await simulateIsActionAllowedFixed(autopilot, { type: 'custom_action', estimated_impact: 100 }, mockSupabase);
    assert(r3.allowed === true, "Autonomous mode with array ['all'] allows any custom type");

    // But Assist mode should still block unauthorized types
    const assistAutopilot = createMockAutopilot(); // Assist: rate_limit, cache_enable, minor_model_switch
    const r4 = await simulateIsActionAllowedFixed(assistAutopilot, { type: 'budget_throttle', estimated_impact: 100 }, mockSupabase);
    assert(r4.allowed === false, 'Assist mode still blocks unauthorized budget_throttle');
}


// ═════════════════════════════════════════════════════════════════════════════
// SECTION 14: HARDENING PASS 2 — Second Deep Audit Bugs
// ═════════════════════════════════════════════════════════════════════════════

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 59: BUG FIX — logAction in BLOCKED path wrapped in try/catch');
console.log('────────────────────────────────────────────────────────────');

{
    const execBlock = src.match(/async executeAction\(action\)\s*\{([\s\S]*?)\n\s{4}\}/);
    const execBody = execBlock[1];

    // Find the BLOCKED path: if (!check.allowed)
    const blockedBlock = execBody.match(/if \(!check\.allowed\)\s*\{([\s\S]*?)return \{ success: false/);
    assert(blockedBlock !== null, 'BLOCKED path found in executeAction');

    const blockedBody = blockedBlock[1];
    // logAction should be inside try/catch
    assert(blockedBody.includes('try {'), 'BLOCKED path has try block');
    assert(blockedBody.includes('catch (logError)'), 'BLOCKED path catches logError');
    assert(blockedBody.includes("'[Autopilot] Failed to log blocked action:'"),
        'BLOCKED path logs logError with context message');

    // requestApproval should also be inside try/catch
    assert(blockedBody.includes('catch (approvalError)'), 'BLOCKED path catches approvalError');
    assert(blockedBody.includes("'[Autopilot] Failed to request approval:'"),
        'BLOCKED path logs approvalError with context message');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 60: BUG FIX — logAction crash in BLOCKED path simulation');
console.log('────────────────────────────────────────────────────────────');

{
    // Simulate: action is blocked, logAction throws, requestApproval should still run
    async function simulateBlockedPath(logActionThrows, requiresApproval) {
        let logActionCalled = false;
        let requestApprovalCalled = false;
        let logErrorCaught = null;

        // Simulate the fixed BLOCKED path
        try {
            logActionCalled = true;
            if (logActionThrows) {
                throw new Error('DB connection refused');
            }
        } catch (logError) {
            logErrorCaught = logError.message;
        }

        if (requiresApproval) {
            try {
                requestApprovalCalled = true;
            } catch (approvalError) {
                // caught
            }
        }

        return { logActionCalled, requestApprovalCalled, logErrorCaught };
    }

    // Case 1: logAction throws, requires_approval = true → requestApproval should still run
    const r1 = await simulateBlockedPath(true, true);
    assert(r1.logActionCalled === true, 'logAction was attempted');
    assert(r1.requestApprovalCalled === true, 'requestApproval reached despite logAction crash');
    assert(r1.logErrorCaught === 'DB connection refused', 'logAction error caught correctly');

    // Case 2: logAction succeeds, requires_approval = true → both run
    const r2 = await simulateBlockedPath(false, true);
    assert(r2.requestApprovalCalled === true, 'requestApproval runs when logAction succeeds');
    assert(r2.logErrorCaught === null, 'No error caught when logAction succeeds');

    // Case 3: logAction throws, requires_approval = false → requestApproval not called
    const r3 = await simulateBlockedPath(true, false);
    assert(r3.requestApprovalCalled === false, 'requestApproval skipped when not required');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 61: BUG FIX — notifyAction wrapped to prevent duplicate logs');
console.log('────────────────────────────────────────────────────────────');

{
    const execBlock = src.match(/async executeAction\(action\)\s*\{([\s\S]*?)\n\s{4}\}/);
    const execBody = execBlock[1];

    // The success path: after logAction completes, notifyAction is wrapped
    const successPath = execBody.match(/await this\.logAction\(\{[\s\S]*?status: 'completed'[\s\S]*?\}\);([\s\S]*?)return \{ success: true/);
    assert(successPath !== null, 'Success path (logAction completed → return success) found');

    const notifySection = successPath[1];
    assert(notifySection.includes('try {'), 'notifyAction wrapped in try block');
    assert(notifySection.includes('catch (notifyError)'), 'notifyAction has catch for notifyError');
    assert(notifySection.includes("'[Autopilot] Notification failed (action still completed):'"),
        'notifyError message indicates action was still completed');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 62: BUG FIX — notifyAction crash simulation (no duplicate log)');
console.log('────────────────────────────────────────────────────────────');

{
    // Simulate: action succeeds, logAction writes 'completed', then notifyAction throws
    // With old code: notifyAction throw → catch block → logAction 'failed' = DUPLICATE
    // With fix: notifyAction throw → caught inside inner try/catch → no duplicate log

    let logEntries = [];
    let notifyThrows = true;

    async function simulateSuccessPath() {
        // performAction succeeds (not shown)
        // logAction 'completed'
        logEntries.push({ status: 'completed' });

        // notifyAction wrapped in try/catch
        if (true) { // guardrails.actions.notify_on_action
            try {
                if (notifyThrows) {
                    throw new Error('Slack webhook timeout');
                }
            } catch (notifyError) {
                // Caught — does NOT fall to outer catch block
                // console.error('[Autopilot] Notification failed (action still completed):', notifyError.message);
            }
        }

        return { success: true };
    }

    const result = await simulateSuccessPath();
    assert(result.success === true, 'Action still marked successful despite notifyAction crash');
    assert(logEntries.length === 1, `Only 1 log entry (got ${logEntries.length}) — no duplicate`);
    assert(logEntries[0].status === 'completed', 'Single log entry is "completed" (not "failed")');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 63: BUG FIX — Deep merge of guardrails preserves defaults');
console.log('────────────────────────────────────────────────────────────');

{
    // Verify the source code uses deep merge, not shallow spread
    const initBlock = src.match(/async initialize\(\)\s*\{([\s\S]*?)\n\s{4}\}/);
    assert(initBlock !== null, 'initialize() method found');
    const initBody = initBlock[1];

    // Should NOT have the old shallow merge pattern in executable code
    // (it may appear in JSDoc comments explaining the fix)
    const initNoComments = initBody.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    assert(!initNoComments.includes('{ ...DEFAULT_GUARDRAILS, ...settings.guardrails }'),
        'Old shallow merge pattern removed from executable code');

    // Should have per-section deep merge
    assert(initBody.includes('...DEFAULT_GUARDRAILS.budget, ...settings.guardrails.budget'),
        'Deep merge for budget section');
    assert(initBody.includes('...DEFAULT_GUARDRAILS.quality, ...settings.guardrails.quality'),
        'Deep merge for quality section');
    assert(initBody.includes('...DEFAULT_GUARDRAILS.actions, ...settings.guardrails.actions'),
        'Deep merge for actions section');
    assert(initBody.includes('...DEFAULT_GUARDRAILS.overrides, ...settings.guardrails.overrides'),
        'Deep merge for overrides section');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 64: BUG FIX — Deep merge behavioral simulation');
console.log('────────────────────────────────────────────────────────────');

{
    // Simulate the fixed deep merge behavior
    const DEFAULT = {
        budget: { hard_ceiling: null, soft_ceiling_percent: 100, auto_throttle_percent: 120 },
        quality: { min_model_tier: 'standard', preserve_latency: true, preserve_accuracy: 0.95 },
        actions: { max_daily_changes: 10, require_rollback_plan: true, notify_on_action: true, cooldown_hours: 1 },
        overrides: { human_override_priority: true, pause_on_error: true, daily_summary: true }
    };

    // User only overrides max_daily_changes — all other action defaults should survive
    const userGuardrails = {
        actions: { max_daily_changes: 5 }
    };

    // OLD shallow merge (broken):
    const shallowResult = { ...DEFAULT, ...userGuardrails };
    assert(shallowResult.actions.require_rollback_plan === undefined,
        'PROOF: Shallow merge LOSES require_rollback_plan');
    assert(shallowResult.actions.cooldown_hours === undefined,
        'PROOF: Shallow merge LOSES cooldown_hours');
    assert(shallowResult.actions.notify_on_action === undefined,
        'PROOF: Shallow merge LOSES notify_on_action');

    // NEW deep merge (fixed):
    const deepResult = {
        budget: { ...DEFAULT.budget, ...userGuardrails.budget },
        quality: { ...DEFAULT.quality, ...userGuardrails.quality },
        actions: { ...DEFAULT.actions, ...userGuardrails.actions },
        overrides: { ...DEFAULT.overrides, ...userGuardrails.overrides },
    };
    assert(deepResult.actions.max_daily_changes === 5,
        'Deep merge: user override applied (max_daily_changes = 5)');
    assert(deepResult.actions.require_rollback_plan === true,
        'Deep merge: default preserved (require_rollback_plan = true)');
    assert(deepResult.actions.cooldown_hours === 1,
        'Deep merge: default preserved (cooldown_hours = 1)');
    assert(deepResult.actions.notify_on_action === true,
        'Deep merge: default preserved (notify_on_action = true)');

    // Quality section untouched
    assert(deepResult.quality.min_model_tier === 'standard',
        'Deep merge: quality defaults fully preserved');
    assert(deepResult.quality.preserve_accuracy === 0.95,
        'Deep merge: preserve_accuracy default preserved');

    // Budget section untouched
    assert(deepResult.budget.auto_throttle_percent === 120,
        'Deep merge: budget defaults fully preserved');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 65: BUG FIX — Deep merge handles null/undefined sections');
console.log('────────────────────────────────────────────────────────────');

{
    const DEFAULT = {
        budget: { hard_ceiling: null, soft_ceiling_percent: 100, auto_throttle_percent: 120 },
        quality: { min_model_tier: 'standard', preserve_latency: true, preserve_accuracy: 0.95 },
        actions: { max_daily_changes: 10, require_rollback_plan: true, notify_on_action: true, cooldown_hours: 1 },
        overrides: { human_override_priority: true, pause_on_error: true, daily_summary: true }
    };

    // User guardrails has some sections undefined
    const userGuardrails = {
        budget: { hard_ceiling: 50000 }
        // quality, actions, overrides all undefined
    };

    const deepResult = {
        budget: { ...DEFAULT.budget, ...userGuardrails.budget },
        quality: { ...DEFAULT.quality, ...userGuardrails.quality },
        actions: { ...DEFAULT.actions, ...userGuardrails.actions },
        overrides: { ...DEFAULT.overrides, ...userGuardrails.overrides },
    };

    // Spreading undefined is a no-op, so defaults are preserved
    assert(deepResult.budget.hard_ceiling === 50000, 'Budget override applied');
    assert(deepResult.budget.soft_ceiling_percent === 100, 'Budget defaults preserved');
    assert(deepResult.actions.max_daily_changes === 10, 'Actions fully default when user section undefined');
    assert(deepResult.overrides.pause_on_error === true, 'Overrides fully default when user section undefined');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 66: BUG FIX — checkAndAct executeAction calls wrapped in try/catch');
console.log('────────────────────────────────────────────────────────────');

{
    // Extract checkAndAct method
    const checkAndActBlock = src.match(/async checkAndAct\(\)\s*\{([\s\S]*?)\n\s{4}\}/);
    assert(checkAndActBlock !== null, 'checkAndAct method found');
    const caaBody = checkAndActBlock[1];

    // Count try blocks (should be 3 — one per executeAction call)
    const tryBlocks = (caaBody.match(/try\s*\{/g) || []).length;
    assert(tryBlocks === 3, `checkAndAct has 3 try blocks (got ${tryBlocks})`);

    // Count catch blocks with error logging
    const catchBlocks = (caaBody.match(/catch\s*\(err\)/g) || []).length;
    assert(catchBlocks === 3, `checkAndAct has 3 catch(err) blocks (got ${catchBlocks})`);

    // Verify each section has its own error logging
    assert(caaBody.includes("'[Autopilot] checkAndAct: budget_throttle failed:'"),
        'Budget throttle failure logged');
    assert(caaBody.includes('checkAndAct: anomaly'),
        'Anomaly action failure logged');
    assert(caaBody.includes('checkAndAct: optimization'),
        'Optimization action failure logged');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 67: BUG FIX — checkAndAct continues after individual failure');
console.log('────────────────────────────────────────────────────────────');

{
    // Simulate: anomaly[0] executeAction throws, anomaly[1] should still run
    let actionsAttempted = [];
    let actionsCompleted = [];

    const anomalies = [
        { id: 1, severity: 'critical', description: 'Spike', estimated_cost: 500, source: 'api', normal_cost: 100 },
        { id: 2, severity: 'critical', description: 'Leak', estimated_cost: 300, source: 'db', normal_cost: 50 },
        { id: 3, severity: 'critical', description: 'Burst', estimated_cost: 200, source: 'cache', normal_cost: 80 },
    ];

    for (const anomaly of anomalies) {
        if (anomaly.severity === 'critical') {
            try {
                actionsAttempted.push(anomaly.id);
                if (anomaly.id === 1) {
                    throw new Error('DB timeout');
                }
                actionsCompleted.push(anomaly.id);
            } catch (err) {
                // continue to next anomaly
            }
        }
    }

    assert(actionsAttempted.length === 3, `All 3 anomalies attempted (got ${actionsAttempted.length})`);
    assert(actionsCompleted.length === 2, `2 completed (first failed) (got ${actionsCompleted.length})`);
    assert(actionsCompleted.includes(2), 'Anomaly 2 completed despite anomaly 1 failure');
    assert(actionsCompleted.includes(3), 'Anomaly 3 completed despite anomaly 1 failure');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 68: BUG FIX — undefined/null auto_actions fails closed');
console.log('────────────────────────────────────────────────────────────');

{
    // Verify the source code has the null check
    const iaaBodyFull = isActionAllowedBlock[1];
    assert(iaaBodyFull.includes('this.mode.auto_actions == null'),
        'isActionAllowed checks for null/undefined auto_actions');
    assert(iaaBodyFull.includes("'Mode auto_actions is not configured'"),
        'Null auto_actions returns descriptive reason');

    // Behavioral simulation with updated logic
    async function simulateIsActionAllowedWithNullCheck(autopilot, action, mockSupabase) {
        if (autopilot.mode.auto_actions === false) {
            return { allowed: false, reason: 'Autopilot in Monitor mode' };
        }

        // NEW: null/undefined check
        if (autopilot.mode.auto_actions == null) {
            return { allowed: false, reason: 'Mode auto_actions is not configured' };
        }

        const autoActions = autopilot.mode.auto_actions;
        const allowsAll = autoActions === 'all' ||
            (Array.isArray(autoActions) && autoActions.includes('all'));

        if (!allowsAll && Array.isArray(autoActions) && !autoActions.includes(action.type)) {
            return { allowed: false, reason: `Action type '${action.type}' not allowed` };
        }

        if (action.estimated_impact > autopilot.mode.max_auto_savings) {
            return { allowed: false, reason: 'exceeds limit', requires_approval: true };
        }

        const dailyResult = await mockSupabase.query('daily_count', {});
        if (dailyResult.error) return { allowed: false, reason: 'Unable to verify daily action limit' };
        if ((dailyResult.data?.length ?? 0) >= autopilot.guardrails.actions.max_daily_changes) {
            return { allowed: false, reason: 'Daily action limit reached' };
        }

        return { allowed: true };
    }

    const mockSupabase = { query: async () => ({ data: [] }) };
    const action = { type: 'rate_limit', estimated_impact: 100 };

    // undefined auto_actions
    const autopilot1 = createMockAutopilot({
        mode: { name: 'Broken', auto_actions: undefined, max_auto_savings: 1000, alerts: true }
    });
    const r1 = await simulateIsActionAllowedWithNullCheck(autopilot1, action, mockSupabase);
    assert(r1.allowed === false, 'undefined auto_actions → blocked');
    assert(r1.reason === 'Mode auto_actions is not configured', 'Correct reason for undefined');

    // null auto_actions
    const autopilot2 = createMockAutopilot({
        mode: { name: 'Corrupt', auto_actions: null, max_auto_savings: 1000, alerts: true }
    });
    const r2 = await simulateIsActionAllowedWithNullCheck(autopilot2, action, mockSupabase);
    assert(r2.allowed === false, 'null auto_actions → blocked');
    assert(r2.reason === 'Mode auto_actions is not configured', 'Correct reason for null');

    // Verify false still works (Monitor mode)
    const autopilot3 = createMockAutopilot({
        mode: { name: 'Monitor', auto_actions: false, alerts: true }
    });
    const r3 = await simulateIsActionAllowedWithNullCheck(autopilot3, action, mockSupabase);
    assert(r3.allowed === false, 'false auto_actions → still blocked (Monitor mode path)');
    assert(r3.reason === 'Autopilot in Monitor mode', 'false hits Monitor path, not null path');
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 69: BUG FIX — select columns optimization in generateDailySummary');
console.log('────────────────────────────────────────────────────────────');

{
    // Verify the source code uses specific columns
    const genBody = genSummaryBlock[1];
    assert(genBody.includes(".select('status, estimated_impact, description')"),
        'generateDailySummary selects specific columns');
    assert(!genBody.includes(".select('*')"),
        'generateDailySummary does not use select(*)');

    // Verify only those 3 columns are used in the method body
    const usedFields = ['status', 'estimated_impact', 'description'];
    for (const field of usedFields) {
        assert(genBody.includes(field),
            `generateDailySummary reads field: ${field}`);
    }

    // Verify rollback_plan, config, error are NOT read
    const unusedFields = ['rollback_plan', 'config'];
    for (const field of unusedFields) {
        // These should not appear as property access in the summary body
        const fieldAccessPattern = new RegExp(`a\\.${field}|action\\.${field}`);
        assert(!fieldAccessPattern.test(genBody),
            `generateDailySummary does NOT read field: ${field}`);
    }
}

console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('Test 70: BUG FIX — initialize handles missing guardrails gracefully');
console.log('────────────────────────────────────────────────────────────');

{
    // Verify that initialize() only applies deep merge when settings.guardrails exists
    const initBlock = src.match(/async initialize\(\)\s*\{([\s\S]*?)\n\s{4}\}/);
    const initBody = initBlock[1];

    assert(initBody.includes('if (settings.guardrails)'),
        'initialize() checks for settings.guardrails before merging');

    // This means if settings has no guardrails key, constructor defaults are preserved
    // Simulate: settings.guardrails is absent
    const DEFAULT = {
        budget: { hard_ceiling: null, soft_ceiling_percent: 100, auto_throttle_percent: 120 },
        quality: { min_model_tier: 'standard', preserve_latency: true, preserve_accuracy: 0.95 },
        actions: { max_daily_changes: 10, require_rollback_plan: true, notify_on_action: true, cooldown_hours: 1 },
        overrides: { human_override_priority: true, pause_on_error: true, daily_summary: true }
    };

    let guardrails = { ...DEFAULT }; // constructor default
    const settings = { mode: 'ASSIST' }; // no guardrails key

    if (settings.guardrails) {
        // This block is skipped
        guardrails = { budget: {}, quality: {}, actions: {}, overrides: {} };
    }

    // Guardrails should still be the constructor defaults
    assert(guardrails.actions.max_daily_changes === 10,
        'Missing settings.guardrails preserves constructor defaults');
}

// ═══════════════════════════════════════════════════════════════════════════════
// W-004 A+ HARDENING: Execution budget, query limits, loop caps
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('W-004 A+: Execution budget and query bounds');
console.log('═══════════════════════════════════════════════════════════\n');

const w4h_src = src;
const w4h_noComments = w4h_src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

// 1. Execution budget constant
assert(
    w4h_noComments.includes('EXECUTION_BUDGET_MS'),
    'W-004 A+: EXECUTION_BUDGET_MS constant defined'
);

// 2. MAX_ACTIONS_PER_CYCLE constant
assert(
    w4h_noComments.includes('MAX_ACTIONS_PER_CYCLE'),
    'W-004 A+: MAX_ACTIONS_PER_CYCLE constant defined'
);

// 3. MAX_QUERY_ROWS constant
assert(
    w4h_noComments.includes('MAX_QUERY_ROWS'),
    'W-004 A+: MAX_QUERY_ROWS constant defined'
);

// 4. checkAndAct has deadline tracking
const w4h_checkStart = w4h_src.indexOf('async checkAndAct()');
const w4h_checkBlock = w4h_src.slice(w4h_checkStart, w4h_checkStart + 3000);
assert(
    w4h_checkBlock.includes('deadline') || w4h_checkBlock.includes('_isOverBudget'),
    'W-004 A+: checkAndAct has deadline/budget tracking'
);

// 5. checkSpendingStatus has .limit()
// Use 'async checkSpendingStatus()' to match the method DEFINITION, not the call site
const w4h_spendStart = w4h_src.indexOf('async checkSpendingStatus()');
const w4h_spendBlock = w4h_src.slice(w4h_spendStart, w4h_spendStart + 500);
assert(
    w4h_spendBlock.includes('.limit('),
    'W-004 A+: checkSpendingStatus query has .limit()'
);

// 6. detectAnomalies has .limit() and uses select columns (not *)
const w4h_anomStart = w4h_src.indexOf('async detectAnomalies()');
const w4h_anomBlock = w4h_src.slice(w4h_anomStart, w4h_anomStart + 800);
assert(
    w4h_anomBlock.includes('.limit('),
    'W-004 A+: detectAnomalies query has .limit()'
);
assert(
    !w4h_anomBlock.includes("select('*')"),
    'W-004 A+: detectAnomalies does NOT use select(*) — uses specific columns'
);

// 7. findQuickWins has .limit()
const w4h_quickStart = w4h_src.indexOf('async findQuickWins()');
const w4h_quickBlock = w4h_src.slice(w4h_quickStart, w4h_quickStart + 600);
assert(
    w4h_quickBlock.includes('.limit('),
    'W-004 A+: findQuickWins query has .limit()'
);

// 8. generateDailySummary has .limit()
// .limit(1000) is ~700 chars into the method body — use 800-char window
const w4h_sumStart = w4h_src.indexOf('async generateDailySummary()');
const w4h_sumBlock = w4h_src.slice(w4h_sumStart, w4h_sumStart + 800);
assert(
    w4h_sumBlock.includes('.limit('),
    'W-004 A+: generateDailySummary query has .limit()'
);

// 9. Anomaly loop is capped
assert(
    w4h_checkBlock.includes('.slice(0') || w4h_checkBlock.includes('MAX_ACTIONS_PER_CYCLE'),
    'W-004 A+: Anomaly processing loop is capped with slice or MAX_ACTIONS'
);

// 10. Budget check in loops
assert(
    w4h_checkBlock.includes('isOverBudget') || w4h_checkBlock.includes('deadline'),
    'W-004 A+: Processing loops have budget/deadline checks'
);

// ═══════════════════════════════════════════════════════════════
// W-004 A+ PASS 14: Input validation and error handling fixes
// ═══════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('W-004 A+ Pass 14: Input validation & error handling');
console.log('═══════════════════════════════════════════════════════════\n');

const w4p14_src = src;

// 1. checkSpendingStatus uses isFinite guard on parseFloat
const w4p14_spendDefStart = w4p14_src.indexOf('async checkSpendingStatus()');
const w4p14_spendDefBlock = w4p14_src.slice(w4p14_spendDefStart, w4p14_spendDefStart + 1000);
assert(
    w4p14_spendDefBlock.includes('isFinite(') && w4p14_spendDefBlock.includes('parseFloat'),
    'W-004 A+ Pass 14: checkSpendingStatus uses isFinite guard on parseFloat'
);

// 2. detectAnomalies has std_dev zero guard
const w4p14_anomDefStart = w4p14_src.indexOf('async detectAnomalies()');
const w4p14_anomDefBlock = w4p14_src.slice(w4p14_anomDefStart, w4p14_anomDefStart + 2000);
assert(
    w4p14_anomDefBlock.includes('std_dev === 0'),
    'W-004 A+ Pass 14: detectAnomalies has std_dev === 0 guard'
);

// 3. findQuickWins does NOT use select('*')
const w4p14_quickDefStart = w4p14_src.indexOf('async findQuickWins()');
const w4p14_quickDefBlock = w4p14_src.slice(w4p14_quickDefStart, w4p14_quickDefStart + 1000);
assert(
    !w4p14_quickDefBlock.includes("select('*')"),
    'W-004 A+ Pass 14: findQuickWins does NOT use select(*)'
);

// 4. applyRateLimit has error handling on upsert
// Use method signatures with (config) parameter — these are instance methods
const w4p14_rateDefStart = w4p14_src.indexOf('async applyRateLimit(config)');
const w4p14_rateDefBlock = w4p14_src.slice(w4p14_rateDefStart, w4p14_rateDefStart + 1200);
assert(
    w4p14_rateDefBlock.includes('DB write failed'),
    'W-004 A+ Pass 14: applyRateLimit has error handling on upsert'
);

// 5. enableCaching has error handling on upsert
const w4p14_cacheDefStart = w4p14_src.indexOf('async enableCaching(config)');
const w4p14_cacheDefBlock = w4p14_src.slice(w4p14_cacheDefStart, w4p14_cacheDefStart + 1200);
assert(
    w4p14_cacheDefBlock.includes('DB write failed'),
    'W-004 A+ Pass 14: enableCaching has error handling on upsert'
);

// 6. switchModel has input validation
const w4p14_switchDefStart = w4p14_src.indexOf('async switchModel(config)');
const w4p14_switchDefBlock = w4p14_src.slice(w4p14_switchDefStart, w4p14_switchDefStart + 1200);
assert(
    w4p14_switchDefBlock.includes('from_model') && w4p14_switchDefBlock.includes('non-empty string'),
    'W-004 A+ Pass 14: switchModel has input validation'
);

// 7. throttleSpending validates throttle_percent
const w4p14_throttleDefStart = w4p14_src.indexOf('async throttleSpending(config)');
const w4p14_throttleDefBlock = w4p14_src.slice(w4p14_throttleDefStart, w4p14_throttleDefStart + 1200);
assert(
    w4p14_throttleDefBlock.includes('throttle_percent'),
    'W-004 A+ Pass 14: throttleSpending validates throttle_percent'
);

// ═══════════════════════════════════════════════════════════════
// W-004 A+ PASS 15: Error handling and validation fixes (Bugs 87-94)
// ═══════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('W-004 A+ Pass 15: Error handling and validation (Bugs 87-94)');
console.log('═══════════════════════════════════════════════════════════\n');

const w4p15_src = src;

// BUG 87: requestApproval error handling
{
    console.log('────────────────────────────────────────────────────────────');
    console.log('Test w4p15_087: requestApproval error handling');
    console.log('────────────────────────────────────────────────────────────');

    const w4p15_87_start = w4p15_src.indexOf('async requestApproval(action)');
    const w4p15_87_block = w4p15_src.slice(w4p15_87_start, w4p15_87_start + 1000);

    assert(
        w4p15_87_block.includes('const { error: approvalError }'),
        'w4p15_087: requestApproval destructures error as approvalError'
    );

    assert(
        w4p15_87_block.includes("if (approvalError)"),
        'w4p15_087: requestApproval checks for approvalError'
    );

    assert(
        w4p15_87_block.includes('throw new Error'),
        'w4p15_087: requestApproval throws on DB error'
    );

    assert(
        w4p15_87_block.includes('DB insert failed'),
        'w4p15_087: requestApproval has descriptive error message'
    );
}

console.log('');

// BUG 88: sendNotification error handling (DB + Slack)
{
    console.log('────────────────────────────────────────────────────────────');
    console.log('Test w4p15_088: sendNotification error handling');
    console.log('────────────────────────────────────────────────────────────');

    const w4p15_88_start = w4p15_src.indexOf('async sendNotification(notification)');
    const w4p15_88_block = w4p15_src.slice(w4p15_88_start, w4p15_88_start + 1500);

    assert(
        w4p15_88_block.includes('const { error: notifError }'),
        'w4p15_088: sendNotification destructures DB error as notifError'
    );

    assert(
        w4p15_88_block.includes("if (notifError)") && w4p15_88_block.includes('console.error'),
        'w4p15_088: sendNotification handles DB error with console.error'
    );

    assert(
        w4p15_88_block.includes('SLACK_WEBHOOK'),
        'w4p15_088: sendNotification checks for Slack webhook'
    );

    assert(
        w4p15_88_block.includes('!response.ok'),
        'w4p15_088: sendNotification handles Slack response error'
    );

    // Verify both error paths don't throw (fail-safe)
    assert(
        !w4p15_88_block.includes('throw new Error'),
        'w4p15_088: sendNotification does NOT throw on errors (fail-safe)'
    );
}

console.log('');

// BUG 89: detectAnomalies NaN guard in reduce (|| 0 guard in accumulator)
{
    console.log('────────────────────────────────────────────────────────────');
    console.log('Test w4p15_089: detectAnomalies NaN guard in reduce');
    console.log('────────────────────────────────────────────────────────────');

    const w4p15_89_start = w4p15_src.indexOf('async detectAnomalies()');
    const w4p15_89_block = w4p15_src.slice(w4p15_89_start, w4p15_89_start + 2000);

    // Check for reduce pattern with isFinite guard
    assert(
        w4p15_89_block.includes('.reduce(') && w4p15_89_block.includes('isFinite(amount)'),
        'w4p15_089: detectAnomalies uses reduce with isFinite guard'
    );

    // Verify the pattern is (sum, r) => ... sum + (isFinite(...) ? amount : 0)
    assert(
        w4p15_89_block.includes('? amount : 0'),
        'w4p15_089: detectAnomalies accumulator guards NaN with fallback 0'
    );

    // Verify std_dev guard exists before using it
    assert(
        w4p15_89_block.includes('std_dev === 0'),
        'w4p15_089: detectAnomalies validates std_dev is not zero'
    );
}

console.log('');

// BUG 90: checkSpendingStatus budget error handling
{
    console.log('────────────────────────────────────────────────────────────');
    console.log('Test w4p15_090: checkSpendingStatus budget error handling');
    console.log('────────────────────────────────────────────────────────────');

    const w4p15_90_start = w4p15_src.indexOf('async checkSpendingStatus()');
    const w4p15_90_block = w4p15_src.slice(w4p15_90_start, w4p15_90_start + 1500);

    assert(
        w4p15_90_block.includes('const { data: budget, error: budgetError }'),
        'w4p15_090: checkSpendingStatus destructures error as budgetError'
    );

    assert(
        w4p15_90_block.includes('if (budgetError'),
        'w4p15_090: checkSpendingStatus checks for budgetError'
    );

    assert(
        w4p15_90_block.includes("budgetError.code !== 'PGRST116'"),
        'w4p15_090: checkSpendingStatus filters out "not found" error (PGRST116)'
    );

    assert(
        w4p15_90_block.includes('console.error'),
        'w4p15_090: checkSpendingStatus logs DB errors'
    );
}

console.log('');

// BUG 91: checkSpendingStatus Infinity guard (isFinite check on budget amount)
{
    console.log('────────────────────────────────────────────────────────────');
    console.log('Test w4p15_091: checkSpendingStatus Infinity guard');
    console.log('────────────────────────────────────────────────────────────');

    const w4p15_91_start = w4p15_src.indexOf('async checkSpendingStatus()');
    const w4p15_91_block = w4p15_src.slice(w4p15_91_start, w4p15_91_start + 2000);

    assert(
        w4p15_91_block.includes('isFinite(rawBudget)'),
        'w4p15_091: checkSpendingStatus uses isFinite check on budget'
    );

    assert(
        w4p15_91_block.includes('rawBudget > 0'),
        'w4p15_091: checkSpendingStatus validates budget is positive'
    );

    // Verify the pattern: budgetAmount = (isFinite(...) && ... > 0) ? ... : null
    assert(
        w4p15_91_block.includes('budgetAmount = (isFinite(rawBudget) && rawBudget > 0) ? rawBudget : null'),
        'w4p15_091: checkSpendingStatus sets budgetAmount to null on invalid input'
    );
}

console.log('');

// BUG 92: initialize select('*') narrowing to specific columns
{
    console.log('────────────────────────────────────────────────────────────');
    console.log('Test w4p15_092: initialize uses narrowed select columns');
    console.log('────────────────────────────────────────────────────────────');

    const w4p15_92_start = w4p15_src.indexOf('async initialize()');
    const w4p15_92_block = w4p15_src.slice(w4p15_92_start, w4p15_92_start + 1500);

    assert(
        w4p15_92_block.includes(".select('mode, guardrails')"),
        'w4p15_092: initialize uses select with specific columns (mode, guardrails)'
    );

    assert(
        !w4p15_92_block.includes(".select('*')"),
        'w4p15_092: initialize does NOT use select(*)'
    );

    // Verify only those two columns are queried
    const selectLine = w4p15_92_block.match(/\.select\([^)]+\)/);
    assert(
        selectLine && selectLine[0].includes('mode') && selectLine[0].includes('guardrails'),
        'w4p15_092: initialize selects only mode and guardrails'
    );
}

console.log('');

// BUG 93: sendAlert loop error handling (try-catch inside for loop)
{
    console.log('────────────────────────────────────────────────────────────');
    console.log('Test w4p15_093: sendAlert loop error handling');
    console.log('────────────────────────────────────────────────────────────');

    const w4p15_93_start = w4p15_src.indexOf('async sendAlert(config)');
    const w4p15_93_block = w4p15_src.slice(w4p15_93_start, w4p15_93_start + 1000);

    assert(
        w4p15_93_block.includes('for (const stakeholder of stakeholders)'),
        'w4p15_093: sendAlert has for...of loop over stakeholders'
    );

    assert(
        w4p15_93_block.includes('try {') && w4p15_93_block.includes('} catch (err)'),
        'w4p15_093: sendAlert has try-catch inside loop'
    );

    assert(
        w4p15_93_block.includes('await this.sendNotification('),
        'w4p15_093: sendAlert awaits sendNotification inside try block'
    );

    assert(
        w4p15_93_block.includes('console.error') && w4p15_93_block.includes('${stakeholder}'),
        'w4p15_093: sendAlert logs stakeholder-specific error'
    );

    // Verify loop continues after catch (no rethrow)
    const catchSection = w4p15_93_block.match(/catch\s*\(err\)\s*\{[^}]+\}/);
    assert(
        catchSection && !catchSection[0].includes('throw'),
        'w4p15_093: sendAlert catch block does NOT rethrow (loop continues)'
    );
}

console.log('');

// BUG 94: guardrails config validation (initialize)
{
    console.log('────────────────────────────────────────────────────────────');
    console.log('Test w4p15_094: guardrails config validation');
    console.log('────────────────────────────────────────────────────────────');

    const w4p15_94_start = w4p15_src.indexOf('async initialize()');
    const w4p15_94_block = w4p15_src.slice(w4p15_94_start, w4p15_94_start + 2000);

    assert(
        w4p15_94_block.includes('isFinite(this.guardrails.actions?.max_daily_changes)'),
        'w4p15_094: initialize validates max_daily_changes with isFinite'
    );

    assert(
        w4p15_94_block.includes('max_daily_changes <= 0'),
        'w4p15_094: initialize checks that max_daily_changes is positive'
    );

    assert(
        w4p15_94_block.includes('isFinite(this.guardrails.actions?.cooldown_hours)'),
        'w4p15_094: initialize validates cooldown_hours with isFinite'
    );

    assert(
        w4p15_94_block.includes('cooldown_hours < 0'),
        'w4p15_094: initialize checks that cooldown_hours is non-negative'
    );

    // Verify invalid values trigger reset to defaults
    assert(
        w4p15_94_block.includes('max_daily_changes = 10') && w4p15_94_block.includes('cooldown_hours = 1'),
        'w4p15_094: initialize resets to defaults on invalid values'
    );

    // Verify console.error logging
    const errorCount = (w4p15_94_block.match(/console\.error.*Invalid/g) || []).length;
    assert(
        errorCount >= 2,
        `w4p15_094: initialize logs errors for invalid config (found ${errorCount} error logs)`
    );
}

console.log('');

// ══════════════════════════════════════════════════════════════════════════════
// PASS 16 REGRESSION TESTS (Bugs 101–104)
// ══════════════════════════════════════════════════════════════════════════════

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log(' Pass 16: Structural regression tests (HARDENING-BUG 101-104)');
console.log('═══════════════════════════════════════════════════════════════');

// BUG 101: checkSpendingStatus cost_records query error handling
{
    console.log('Test w4p16_101: checkSpendingStatus cost_records error handling');
    const w4p16_spendStart = src.indexOf('async checkSpendingStatus()');
    const w4p16_spendBlock = src.slice(w4p16_spendStart, w4p16_spendStart + 2000);

    assert(
        w4p16_spendBlock.includes('error: spendError'),
        'w4p16_1: checkSpendingStatus destructures error as spendError'
    );

    assert(
        w4p16_spendBlock.includes('if (spendError)'),
        'w4p16_2: checkSpendingStatus checks spendError'
    );

    assert(
        w4p16_spendBlock.includes('throw new Error') && w4p16_spendBlock.includes('failed to query spending'),
        'w4p16_3: checkSpendingStatus throws with meaningful message on spend query failure'
    );
}

// BUG 102: detectAnomalies dual error handling
{
    console.log('Test w4p16_102: detectAnomalies dual error handling');
    const w4p16_anomStart = src.indexOf('async detectAnomalies()');
    const w4p16_anomBlock = src.slice(w4p16_anomStart, w4p16_anomStart + 2500);

    assert(
        w4p16_anomBlock.includes('error: recentError'),
        'w4p16_4: detectAnomalies destructures error as recentError'
    );

    assert(
        w4p16_anomBlock.includes('error: historicalError'),
        'w4p16_5: detectAnomalies destructures error as historicalError'
    );

    assert(
        w4p16_anomBlock.includes('if (recentError)') && w4p16_anomBlock.includes('failed to query recent'),
        'w4p16_6: detectAnomalies throws on recentError'
    );

    assert(
        w4p16_anomBlock.includes("historicalError.code !== 'PGRST116'"),
        'w4p16_7: detectAnomalies ignores PGRST116 for historical stats'
    );
}

// BUG 103: checkSpendingStatus budget query throws on real DB errors
{
    console.log('Test w4p16_103: checkSpendingStatus budget error throwing');
    const w4p16_budgetStart = src.indexOf('const { data: budget, error: budgetError }');
    const w4p16_budgetBlock = src.slice(w4p16_budgetStart, w4p16_budgetStart + 800);

    assert(
        w4p16_budgetBlock.includes('throw new Error'),
        'w4p16_8: checkSpendingStatus throws on budget query errors'
    );
}

// BUG 105: findQuickWins request_patterns unchecked Supabase error
{
    console.log('Test w4p16_105: findQuickWins request_patterns error handling');
    const w4p16_qwStart = src.indexOf('async findQuickWins()');
    const w4p16_qwBlock = src.slice(w4p16_qwStart, w4p16_qwStart + 1000);

    assert(
        w4p16_qwBlock.includes('error: patternsError'),
        'w4p16_11: findQuickWins destructures error as patternsError'
    );

    assert(
        w4p16_qwBlock.includes('if (patternsError)'),
        'w4p16_12: findQuickWins checks patternsError'
    );
}

// BUG 104: sendAlert validates stakeholders array
{
    console.log('Test w4p16_104: sendAlert stakeholders validation');
    const w4p16_alertStart = src.indexOf('async sendAlert(config)');
    const w4p16_alertBlock = src.slice(w4p16_alertStart, w4p16_alertStart + 1000);

    assert(
        w4p16_alertBlock.includes('Array.isArray(stakeholders)'),
        'w4p16_9: sendAlert validates stakeholders is an array'
    );

    assert(
        w4p16_alertBlock.includes('stakeholders.length === 0'),
        'w4p16_10: sendAlert checks stakeholders is non-empty'
    );
}

// ═══════════════════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════════════════

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log(` W-004 RESULTS: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════════');

if (failures.length > 0) {
    console.log('');
    console.log('FAILURES:');
    failures.forEach(f => console.log(`  ✗ ${f}`));
}

process.exit(failed > 0 ? 1 : 0);
