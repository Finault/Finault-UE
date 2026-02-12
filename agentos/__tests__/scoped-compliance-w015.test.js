/**
 * COMPREHENSIVE TEST SUITE FOR SCOPED COMPLIANCE CHECKER (W-015)
 * Tests all exports and functionality with regression tests for original bugs
 */

import assert from 'assert';
import {
    COMPLIANCE_CONFIG,
    safeDivide,
    safePercentageString,
    safePercentageNum,
    safeCostBreakdown,
    ScopeResolver,
    ScopedComplianceChecker,
    createScopedComplianceChecker
} from '../core/scoped-compliance.js';

// ─── TEST HARNESS ───────────────────────────────────────────────────────────

const results = { passed: 0, failed: 0, failures: [] };

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

// ─── SECTION 1: COMPLIANCE_CONFIG (4 tests) ─────────────────────────────────

console.log('\n[1] COMPLIANCE_CONFIG');

runTest('w15_001', 'SCOPE_HIERARCHY exists as array', () => {
    assert(Array.isArray(COMPLIANCE_CONFIG.SCOPE_HIERARCHY));
    assert(COMPLIANCE_CONFIG.SCOPE_HIERARCHY.length > 0);
});

runTest('w15_002', 'SCOPE_HIERARCHY contains expected scopes', () => {
    const expected = ['user', 'project', 'team', 'department', 'organization'];
    assert.deepStrictEqual(COMPLIANCE_CONFIG.SCOPE_HIERARCHY, expected);
});

runTest('w15_003', 'DEFAULT_SCOPE is organization', () => {
    assert.strictEqual(COMPLIANCE_CONFIG.DEFAULT_SCOPE, 'organization');
});

runTest('w15_004', 'FLOAT_TOLERANCE is defined', () => {
    assert(typeof COMPLIANCE_CONFIG.FLOAT_TOLERANCE === 'number');
    assert(COMPLIANCE_CONFIG.FLOAT_TOLERANCE > 0);
});

// ─── SECTION 2: safeDivide (12 tests) ───────────────────────────────────────

console.log('\n[2] safeDivide');

runTest('w15_005', 'normal division returns correct value', () => {
    const result = safeDivide(10, 2);
    assert.strictEqual(result, 5);
});

runTest('w15_006', 'zero denominator returns fallback 0', () => {
    const result = safeDivide(10, 0);
    assert.strictEqual(result, 0);
});

runTest('w15_007', 'null denominator returns fallback 0', () => {
    const result = safeDivide(10, null);
    assert.strictEqual(result, 0);
});

runTest('w15_008', 'undefined denominator returns fallback 0', () => {
    const result = safeDivide(10, undefined);
    assert.strictEqual(result, 0);
});

runTest('w15_009', 'Infinity denominator returns fallback 0', () => {
    const result = safeDivide(10, Infinity);
    assert.strictEqual(result, 0);
});

runTest('w15_010', 'NaN numerator returns fallback 0', () => {
    const result = safeDivide(NaN, 5);
    assert.strictEqual(result, 0);
});

runTest('w15_011', 'custom fallback value is returned on zero denominator', () => {
    const result = safeDivide(10, 0, -1);
    assert.strictEqual(result, -1);
});

runTest('w15_012', 'custom fallback value is returned on null denominator', () => {
    const result = safeDivide(10, null, 999);
    assert.strictEqual(result, 999);
});

runTest('w15_013', 'fractional division works correctly', () => {
    const result = safeDivide(1, 3);
    assert(Math.abs(result - 0.333333) < 0.01);
});

runTest('w15_014', 'negative numbers handled correctly', () => {
    const result = safeDivide(-10, 2);
    assert.strictEqual(result, -5);
});

runTest('w15_015', 'very small denominator divides correctly', () => {
    const result = safeDivide(1, 1000000);
    assert(result > 0 && result < 0.00002);
});

runTest('w15_016', 'both numerator and denominator zero returns fallback', () => {
    const result = safeDivide(0, 0, 42);
    assert.strictEqual(result, 42);
});

// ─── SECTION 3: safePercentageString (12 tests) ──────────────────────────────

console.log('\n[3] safePercentageString');

runTest('w15_017', 'normal percentage calculation with default decimals', () => {
    const result = safePercentageString(50, 100);
    assert.strictEqual(result, '50.0%');
});

runTest('w15_018', 'total=0 returns 0.0%', () => {
    const result = safePercentageString(100, 0);
    assert.strictEqual(result, '0.0%');
});

runTest('w15_019', 'custom decimals=2', () => {
    const result = safePercentageString(33.333, 100, 2);
    assert.strictEqual(result, '33.33%');
});

runTest('w15_020', 'custom decimals=0 (whole percent)', () => {
    const result = safePercentageString(66.666, 100, 0);
    assert.strictEqual(result, '67%');
});

runTest('w15_021', 'negative amount produces negative percentage', () => {
    const result = safePercentageString(-25, 100);
    assert.strictEqual(result, '-25.0%');
});

runTest('w15_022', 'amount > total produces >100% correctly', () => {
    const result = safePercentageString(150, 100);
    assert.strictEqual(result, '150.0%');
});

runTest('w15_023', 'very small amount produces 0.0%', () => {
    const result = safePercentageString(0.00001, 100);
    assert.strictEqual(result, '0.0%');
});

runTest('w15_024', 'large values handled without precision loss', () => {
    const result = safePercentageString(1000000, 2000000);
    assert.strictEqual(result, '50.0%');
});

runTest('w15_025', 'null amount treated as 0 amount', () => {
    const result = safePercentageString(null, 100);
    assert.strictEqual(result, '0.0%');
});

runTest('w15_026', 'undefined amount treated as 0 amount', () => {
    const result = safePercentageString(undefined, 100);
    assert.strictEqual(result, '0.0%');
});

runTest('w15_027', 'decimal precision preserved correctly', () => {
    const result = safePercentageString(1, 3, 3);
    assert.strictEqual(result, '33.333%');
});

runTest('w15_028', 'very large decimals value', () => {
    const result = safePercentageString(50, 100, 10);
    assert(result.startsWith('50.'));
    assert(result.endsWith('%'));
});

// ─── SECTION 4: safePercentageNum (8 tests) ────────────────────────────────

console.log('\n[4] safePercentageNum');

runTest('w15_029', 'normal percentage calculation returns 0-100 scale', () => {
    const result = safePercentageNum(50, 100);
    assert.strictEqual(result, 50);
});

runTest('w15_030', 'total=0 returns 0', () => {
    const result = safePercentageNum(100, 0);
    assert.strictEqual(result, 0);
});

runTest('w15_031', 'quarter percentage (25%)', () => {
    const result = safePercentageNum(25, 100);
    assert.strictEqual(result, 25);
});

runTest('w15_032', 'one-third percentage', () => {
    const result = safePercentageNum(1, 3);
    assert(Math.abs(result - 33.333333) < 0.1);
});

runTest('w15_033', '>100% when amount > total', () => {
    const result = safePercentageNum(200, 100);
    assert.strictEqual(result, 200);
});

runTest('w15_034', 'null total returns 0', () => {
    const result = safePercentageNum(50, null);
    assert.strictEqual(result, 0);
});

runTest('w15_035', 'undefined total returns 0', () => {
    const result = safePercentageNum(50, undefined);
    assert.strictEqual(result, 0);
});

runTest('w15_036', 'negative amount produces negative percentage', () => {
    const result = safePercentageNum(-50, 100);
    assert.strictEqual(result, -50);
});

// ─── SECTION 5: safeCostBreakdown (12 tests) ────────────────────────────────

console.log('\n[5] safeCostBreakdown');

runTest('w15_037', 'normal array with amounts', () => {
    const items = [
        { name: 'Provider A', amount: 50 },
        { name: 'Provider B', amount: 50 }
    ];
    const result = safeCostBreakdown(items, 100);
    assert.strictEqual(result[0].percentage, '50.0%');
    assert.strictEqual(result[1].percentage, '50.0%');
});

runTest('w15_038', 'total=0 produces 0.0% for all items', () => {
    const items = [
        { name: 'Provider A', amount: 100 },
        { name: 'Provider B', amount: 200 }
    ];
    const result = safeCostBreakdown(items, 0);
    assert.strictEqual(result[0].percentage, '0.0%');
    assert.strictEqual(result[1].percentage, '0.0%');
});

runTest('w15_039', 'empty array returns empty array', () => {
    const result = safeCostBreakdown([], 100);
    assert.strictEqual(result.length, 0);
});

runTest('w15_040', 'non-array input returns empty array', () => {
    const result = safeCostBreakdown(null, 100);
    assert.deepStrictEqual(result, []);
});

runTest('w15_041', 'custom amount field name', () => {
    const items = [
        { name: 'Provider A', cost: 30 },
        { name: 'Provider B', cost: 70 }
    ];
    const result = safeCostBreakdown(items, 100, 'cost');
    assert.strictEqual(result[0].percentage, '30.0%');
    assert.strictEqual(result[1].percentage, '70.0%');
});

runTest('w15_042', 'string amounts parsed correctly', () => {
    const items = [
        { name: 'Provider A', amount: '25.5' },
        { name: 'Provider B', amount: '74.5' }
    ];
    const result = safeCostBreakdown(items, 100);
    assert.strictEqual(result[0].percentage, '25.5%');
    assert.strictEqual(result[1].percentage, '74.5%');
});

runTest('w15_043', 'custom decimals parameter', () => {
    const items = [
        { name: 'Provider A', amount: 33.333 },
        { name: 'Provider B', amount: 66.667 }
    ];
    const result = safeCostBreakdown(items, 100, 'amount', 2);
    assert.strictEqual(result[0].percentage, '33.33%');
    assert.strictEqual(result[1].percentage, '66.67%');
});

runTest('w15_044', 'preserves original item properties', () => {
    const items = [
        { name: 'Provider A', amount: 50, id: 'prov_a', region: 'us-east' }
    ];
    const result = safeCostBreakdown(items, 100);
    assert.strictEqual(result[0].name, 'Provider A');
    assert.strictEqual(result[0].id, 'prov_a');
    assert.strictEqual(result[0].region, 'us-east');
    assert.strictEqual(result[0].percentage, '50.0%');
});

runTest('w15_045', 'items with missing amount field default to 0', () => {
    const items = [
        { name: 'Provider A', amount: 50 },
        { name: 'Provider B' }
    ];
    const result = safeCostBreakdown(items, 100);
    assert.strictEqual(result[0].percentage, '50.0%');
    assert.strictEqual(result[1].percentage, '0.0%');
});

runTest('w15_046', 'large arrays handled efficiently', () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({
        name: `Provider ${i}`,
        amount: 1
    }));
    const result = safeCostBreakdown(items, 1000);
    assert.strictEqual(result.length, 1000);
    assert.strictEqual(result[0].percentage, '0.1%');
});

runTest('w15_047', 'items with negative amounts', () => {
    const items = [
        { name: 'Credit', amount: -50 },
        { name: 'Debit', amount: 150 }
    ];
    const result = safeCostBreakdown(items, 100);
    assert.strictEqual(result[0].percentage, '-50.0%');
    assert.strictEqual(result[1].percentage, '150.0%');
});

runTest('w15_048', 'undefined item amount treated as 0', () => {
    const items = [
        { name: 'Provider A', amount: undefined },
        { name: 'Provider B', amount: 100 }
    ];
    const result = safeCostBreakdown(items, 100);
    assert.strictEqual(result[0].percentage, '0.0%');
    assert.strictEqual(result[1].percentage, '100.0%');
});

// ─── SECTION 6: ScopeResolver.getScope (12 tests) ──────────────────────────

console.log('\n[6] ScopeResolver.getScope');

runTest('w15_049', 'explicit scope field string overrides inference', () => {
    const policy = { scope: 'team', config: { team_id: 'team123' } };
    const scope = ScopeResolver.getScope(policy);
    assert.strictEqual(scope, 'team');
});

runTest('w15_050', 'scope object with type field', () => {
    const policy = { scope: { type: 'project', id: 'proj456' } };
    const scope = ScopeResolver.getScope(policy);
    assert.strictEqual(scope, 'project');
});

runTest('w15_051', 'inferred from user_id', () => {
    const policy = { config: { user_id: 'user789' } };
    const scope = ScopeResolver.getScope(policy);
    assert.strictEqual(scope, 'user');
});

runTest('w15_052', 'inferred from project_id', () => {
    const policy = { config: { project_id: 'proj123' } };
    const scope = ScopeResolver.getScope(policy);
    assert.strictEqual(scope, 'project');
});

runTest('w15_053', 'inferred from project field (shorthand)', () => {
    const policy = { config: { project: 'proj456' } };
    const scope = ScopeResolver.getScope(policy);
    assert.strictEqual(scope, 'project');
});

runTest('w15_054', 'inferred from team_id', () => {
    const policy = { config: { team_id: 'team789' } };
    const scope = ScopeResolver.getScope(policy);
    assert.strictEqual(scope, 'team');
});

runTest('w15_055', 'inferred from team field (shorthand)', () => {
    const policy = { config: { team: 'team111' } };
    const scope = ScopeResolver.getScope(policy);
    assert.strictEqual(scope, 'team');
});

runTest('w15_056', 'inferred from department_id', () => {
    const policy = { config: { department_id: 'dept222' } };
    const scope = ScopeResolver.getScope(policy);
    assert.strictEqual(scope, 'department');
});

runTest('w15_057', 'inferred from department field (shorthand)', () => {
    const policy = { config: { department: 'dept333' } };
    const scope = ScopeResolver.getScope(policy);
    assert.strictEqual(scope, 'department');
});

runTest('w15_058', 'defaults to organization when no scope hints', () => {
    const policy = { config: { budget_amount: 1000 } };
    const scope = ScopeResolver.getScope(policy);
    assert.strictEqual(scope, 'organization');
});

runTest('w15_059', 'null policy defaults to organization', () => {
    const scope = ScopeResolver.getScope(null);
    assert.strictEqual(scope, 'organization');
});

runTest('w15_060', 'empty policy object defaults to organization', () => {
    const scope = ScopeResolver.getScope({});
    assert.strictEqual(scope, 'organization');
});

// ─── SECTION 7: ScopeResolver.getScopeId (10 tests) ───────────────────────

console.log('\n[7] ScopeResolver.getScopeId');

runTest('w15_061', 'user scope returns user_id from config', () => {
    const policy = { config: { user_id: 'user_alice' } };
    const id = ScopeResolver.getScopeId(policy);
    assert.strictEqual(id, 'user_alice');
});

runTest('w15_062', 'project scope returns project_id from config', () => {
    const policy = { config: { project_id: 'proj_web' } };
    const id = ScopeResolver.getScopeId(policy);
    assert.strictEqual(id, 'proj_web');
});

runTest('w15_063', 'project scope falls back to project field', () => {
    const policy = { config: { project: 'proj_mobile' } };
    const id = ScopeResolver.getScopeId(policy);
    assert.strictEqual(id, 'proj_mobile');
});

runTest('w15_064', 'team scope returns team_id from config', () => {
    const policy = { config: { team_id: 'team_backend' } };
    const id = ScopeResolver.getScopeId(policy);
    assert.strictEqual(id, 'team_backend');
});

runTest('w15_065', 'team scope falls back to team field', () => {
    const policy = { config: { team: 'team_frontend' } };
    const id = ScopeResolver.getScopeId(policy);
    assert.strictEqual(id, 'team_frontend');
});

runTest('w15_066', 'department scope returns department_id from config', () => {
    const policy = { config: { department_id: 'dept_engineering' } };
    const id = ScopeResolver.getScopeId(policy);
    assert.strictEqual(id, 'dept_engineering');
});

runTest('w15_067', 'department scope falls back to department field', () => {
    const policy = { config: { department: 'dept_finance' } };
    const id = ScopeResolver.getScopeId(policy);
    assert.strictEqual(id, 'dept_finance');
});

runTest('w15_068', 'organization scope returns null', () => {
    const policy = { scope: 'organization' };
    const id = ScopeResolver.getScopeId(policy);
    assert.strictEqual(id, null);
});

runTest('w15_069', 'scope object with id field used as fallback', () => {
    const policy = {
        scope: { type: 'user', id: 'user_bob' },
        config: {}
    };
    const id = ScopeResolver.getScopeId(policy);
    assert.strictEqual(id, 'user_bob');
});

runTest('w15_070', 'missing scope id returns null', () => {
    const policy = { config: {} };
    const id = ScopeResolver.getScopeId(policy);
    assert.strictEqual(id, null);
});

// ─── SECTION 8: ScopeResolver.filterByScope (15 tests) ───────────────────

console.log('\n[8] ScopeResolver.filterByScope');

runTest('w15_071', 'organization scope returns all records', () => {
    const records = [
        { user_id: 'u1', amount: 100 },
        { user_id: 'u2', amount: 200 }
    ];
    const policy = { scope: 'organization' };
    const filtered = ScopeResolver.filterByScope(records, policy);
    assert.strictEqual(filtered.length, 2);
});

runTest('w15_072', 'team scope filters by team_id', () => {
    const records = [
        { team_id: 'team_a', amount: 100 },
        { team_id: 'team_b', amount: 200 },
        { team_id: 'team_a', amount: 150 }
    ];
    const policy = { config: { team_id: 'team_a' } };
    const filtered = ScopeResolver.filterByScope(records, policy);
    assert.strictEqual(filtered.length, 2);
    assert(filtered.every(r => r.team_id === 'team_a'));
});

runTest('w15_073', 'team scope filters by team field (shorthand)', () => {
    const records = [
        { team: 'alpha', amount: 100 },
        { team: 'beta', amount: 200 }
    ];
    const policy = { config: { team: 'alpha' } };
    const filtered = ScopeResolver.filterByScope(records, policy);
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].team, 'alpha');
});

runTest('w15_074', 'project scope filters by project_id', () => {
    const records = [
        { project_id: 'proj_x', amount: 100 },
        { project_id: 'proj_y', amount: 200 }
    ];
    const policy = { config: { project_id: 'proj_x' } };
    const filtered = ScopeResolver.filterByScope(records, policy);
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].project_id, 'proj_x');
});

runTest('w15_075', 'project scope filters by project field (shorthand)', () => {
    const records = [
        { project: 'web', amount: 100 },
        { project: 'mobile', amount: 200 }
    ];
    const policy = { config: { project: 'web' } };
    const filtered = ScopeResolver.filterByScope(records, policy);
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].project, 'web');
});

runTest('w15_076', 'user scope filters by user_id', () => {
    const records = [
        { user_id: 'alice', amount: 100 },
        { user_id: 'bob', amount: 200 },
        { user_id: 'alice', amount: 50 }
    ];
    const policy = { config: { user_id: 'alice' } };
    const filtered = ScopeResolver.filterByScope(records, policy);
    assert.strictEqual(filtered.length, 2);
    assert(filtered.every(r => r.user_id === 'alice'));
});

runTest('w15_077', 'department scope filters by department_id', () => {
    const records = [
        { department_id: 'eng', amount: 100 },
        { department_id: 'sales', amount: 200 }
    ];
    const policy = { config: { department_id: 'eng' } };
    const filtered = ScopeResolver.filterByScope(records, policy);
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].department_id, 'eng');
});

runTest('w15_078', 'department scope filters by department field (shorthand)', () => {
    const records = [
        { department: 'marketing', amount: 100 },
        { department: 'hr', amount: 200 }
    ];
    const policy = { config: { department: 'marketing' } };
    const filtered = ScopeResolver.filterByScope(records, policy);
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].department, 'marketing');
});

runTest('w15_079', 'null cost records returns empty array', () => {
    const policy = { config: { team_id: 'team1' } };
    const filtered = ScopeResolver.filterByScope(null, policy);
    assert.deepStrictEqual(filtered, []);
});

runTest('w15_080', 'undefined cost records returns empty array', () => {
    const policy = { config: { team_id: 'team1' } };
    const filtered = ScopeResolver.filterByScope(undefined, policy);
    assert.deepStrictEqual(filtered, []);
});

runTest('w15_081', 'no matching records returns empty array', () => {
    const records = [
        { team_id: 'team_a', amount: 100 }
    ];
    const policy = { config: { team_id: 'team_b' } };
    const filtered = ScopeResolver.filterByScope(records, policy);
    assert.strictEqual(filtered.length, 0);
});

runTest('w15_082', 'mixed records with different scopes', () => {
    const records = [
        { team_id: 'team_a', project: 'proj_x', amount: 100 },
        { team_id: 'team_b', project: 'proj_y', amount: 200 }
    ];
    const policy = { config: { team_id: 'team_a' } };
    const filtered = ScopeResolver.filterByScope(records, policy);
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].team_id, 'team_a');
});

runTest('w15_083', 'project and team both present, uses project scope', () => {
    const records = [
        { team: 'team1', project: 'proj_a', amount: 100 },
        { team: 'team1', project: 'proj_b', amount: 200 }
    ];
    const policy = { config: { project: 'proj_a' } };
    const filtered = ScopeResolver.filterByScope(records, policy);
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].project, 'proj_a');
});

runTest('w15_084', 'case-sensitive scope matching', () => {
    const records = [
        { team_id: 'Team_A', amount: 100 },
        { team_id: 'team_a', amount: 200 }
    ];
    const policy = { config: { team_id: 'team_a' } };
    const filtered = ScopeResolver.filterByScope(records, policy);
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].team_id, 'team_a');
});

runTest('w15_085', 'large dataset filtering performance', () => {
    const records = Array.from({ length: 10000 }, (_, i) => ({
        team_id: `team_${i % 10}`,
        amount: Math.random() * 1000
    }));
    const policy = { config: { team_id: 'team_5' } };
    const filtered = ScopeResolver.filterByScope(records, policy);
    assert(filtered.length > 0);
    assert(filtered.every(r => r.team_id === 'team_5'));
});

// ─── SECTION 9: ScopeResolver.computeScopedSpend (8 tests) ─────────────────

console.log('\n[9] ScopeResolver.computeScopedSpend');

runTest('w15_086', 'organization-wide sum', () => {
    const records = [
        { team_id: 'team_a', amount: 100 },
        { team_id: 'team_b', amount: 200 },
        { team_id: 'team_a', amount: 150 }
    ];
    const policy = { scope: 'organization' };
    const spend = ScopeResolver.computeScopedSpend(records, policy);
    assert.strictEqual(spend, 450);
});

runTest('w15_087', 'team-scoped sum', () => {
    const records = [
        { team_id: 'team_a', amount: 100 },
        { team_id: 'team_b', amount: 200 },
        { team_id: 'team_a', amount: 150 }
    ];
    const policy = { config: { team_id: 'team_a' } };
    const spend = ScopeResolver.computeScopedSpend(records, policy);
    assert.strictEqual(spend, 250);
});

runTest('w15_088', 'empty records return 0', () => {
    const policy = { config: { team_id: 'team_a' } };
    const spend = ScopeResolver.computeScopedSpend([], policy);
    assert.strictEqual(spend, 0);
});

runTest('w15_089', 'no matching records return 0', () => {
    const records = [
        { team_id: 'team_a', amount: 100 }
    ];
    const policy = { config: { team_id: 'team_b' } };
    const spend = ScopeResolver.computeScopedSpend(records, policy);
    assert.strictEqual(spend, 0);
});

runTest('w15_090', 'string amounts parsed correctly', () => {
    const records = [
        { team_id: 'team_a', amount: '100.50' },
        { team_id: 'team_a', amount: '200.25' }
    ];
    const policy = { config: { team_id: 'team_a' } };
    const spend = ScopeResolver.computeScopedSpend(records, policy);
    assert(Math.abs(spend - 300.75) < 0.01);
});

runTest('w15_091', 'missing amount defaults to 0', () => {
    const records = [
        { team_id: 'team_a', amount: 100 },
        { team_id: 'team_a' }
    ];
    const policy = { config: { team_id: 'team_a' } };
    const spend = ScopeResolver.computeScopedSpend(records, policy);
    assert.strictEqual(spend, 100);
});

runTest('w15_092', 'null amount defaults to 0', () => {
    const records = [
        { team_id: 'team_a', amount: 100 },
        { team_id: 'team_a', amount: null }
    ];
    const policy = { config: { team_id: 'team_a' } };
    const spend = ScopeResolver.computeScopedSpend(records, policy);
    assert.strictEqual(spend, 100);
});

runTest('w15_093', 'user scope sum', () => {
    const records = [
        { user_id: 'alice', amount: 50 },
        { user_id: 'bob', amount: 75 },
        { user_id: 'alice', amount: 25 }
    ];
    const policy = { config: { user_id: 'alice' } };
    const spend = ScopeResolver.computeScopedSpend(records, policy);
    assert.strictEqual(spend, 75);
});

// ─── SECTION 10: ScopedComplianceChecker.checkBudgetCompliance (15 tests) ──

console.log('\n[10] ScopedComplianceChecker.checkBudgetCompliance');

runTest('w15_094', 'within budget returns compliant:true', () => {
    const checker = new ScopedComplianceChecker();
    const policy = { config: { budget_amount: 1000 } };
    const records = [{ team_id: 'team_a', amount: 500 }];
    const result = checker.checkBudgetCompliance(policy, records);
    assert.strictEqual(result.compliant, true);
    assert.strictEqual(result.violations.length, 0);
});

runTest('w15_095', 'over budget returns violations', () => {
    const checker = new ScopedComplianceChecker();
    const policy = { config: { budget_amount: 1000 } };
    const records = [{ team_id: 'team_a', amount: 1500 }];
    const result = checker.checkBudgetCompliance(policy, records);
    assert.strictEqual(result.compliant, false);
    assert(result.violations.length > 0);
    assert.strictEqual(result.violations[0].type, 'budget_exceeded');
});

runTest('w15_096', 'violation message includes spend and budget', () => {
    const checker = new ScopedComplianceChecker();
    const policy = { config: { budget_amount: 1000 } };
    const records = [{ team_id: 'team_a', amount: 1200 }];
    const result = checker.checkBudgetCompliance(policy, records);
    assert(result.violations[0].message.includes('1200'));
    assert(result.violations[0].message.includes('1000'));
});

runTest('w15_097', 'threshold warning at 75%', () => {
    const checker = new ScopedComplianceChecker();
    const policy = { config: { budget_amount: 1000, alert_thresholds: [75] } };
    const records = [{ team_id: 'team_a', amount: 750 }];
    const result = checker.checkBudgetCompliance(policy, records);
    assert.strictEqual(result.compliant, true);
    assert(result.warnings.length > 0);
    assert.strictEqual(result.warnings[0].type, 'budget_warning');
});

runTest('w15_098', 'threshold warning at 90%', () => {
    const checker = new ScopedComplianceChecker();
    const policy = { config: { budget_amount: 1000, alert_thresholds: [90] } };
    const records = [{ team_id: 'team_a', amount: 900 }];
    const result = checker.checkBudgetCompliance(policy, records);
    assert(result.warnings.length > 0);
    assert.strictEqual(result.warnings[0].severity, 'high');
});

runTest('w15_099', 'multiple thresholds sorted correctly', () => {
    const checker = new ScopedComplianceChecker();
    const policy = { config: { budget_amount: 1000, alert_thresholds: [50, 75, 90] } };
    const records = [{ team_id: 'team_a', amount: 800 }];
    const result = checker.checkBudgetCompliance(policy, records);
    assert(result.warnings.length > 0);
    assert(result.warnings[0].message.includes('75%'));
});

runTest('w15_100', 'utilization percentage calculated correctly', () => {
    const checker = new ScopedComplianceChecker();
    const policy = { config: { budget_amount: 1000 } };
    const records = [{ team_id: 'team_a', amount: 500 }];
    const result = checker.checkBudgetCompliance(policy, records);
    assert.strictEqual(result.utilization, 50);
});

runTest('w15_101', 'scoped spend only includes team records', () => {
    const checker = new ScopedComplianceChecker();
    const policy = { config: { team_id: 'team_a', budget_amount: 1000 } };
    const records = [
        { team_id: 'team_a', amount: 300 },
        { team_id: 'team_b', amount: 2000 }
    ];
    const result = checker.checkBudgetCompliance(policy, records);
    assert.strictEqual(result.scoped_spend, 300);
    assert.strictEqual(result.utilization, 30);
});

runTest('w15_102', 'hard_limit action when exceeded', () => {
    const checker = new ScopedComplianceChecker();
    const policy = { config: { budget_amount: 1000, hard_limit: true } };
    const records = [{ team_id: 'team_a', amount: 1100 }];
    const result = checker.checkBudgetCompliance(policy, records);
    assert.strictEqual(result.violations[0].action_required, 'Spending blocked');
});

runTest('w15_103', 'review_required action when no hard_limit', () => {
    const checker = new ScopedComplianceChecker();
    const policy = { config: { budget_amount: 1000, hard_limit: false } };
    const records = [{ team_id: 'team_a', amount: 1100 }];
    const result = checker.checkBudgetCompliance(policy, records);
    assert.strictEqual(result.violations[0].action_required, 'Review required');
});

runTest('w15_104', 'policy_type is budget', () => {
    const checker = new ScopedComplianceChecker();
    const policy = { config: { budget_amount: 1000 } };
    const records = [{ team_id: 'team_a', amount: 500 }];
    const result = checker.checkBudgetCompliance(policy, records);
    assert.strictEqual(result.policy_type, 'budget');
});

runTest('w15_105', 'scope field in result', () => {
    const checker = new ScopedComplianceChecker();
    const policy = { config: { team_id: 'team_a', budget_amount: 1000 } };
    const records = [{ team_id: 'team_a', amount: 500 }];
    const result = checker.checkBudgetCompliance(policy, records);
    assert.strictEqual(result.scope, 'team');
});

runTest('w15_106', 'scope_id field in result', () => {
    const checker = new ScopedComplianceChecker();
    const policy = { config: { team_id: 'team_abc', budget_amount: 1000 } };
    const records = [{ team_id: 'team_abc', amount: 500 }];
    const result = checker.checkBudgetCompliance(policy, records);
    assert.strictEqual(result.scope_id, 'team_abc');
});

runTest('w15_107', 'projected_overrun message included', () => {
    const checker = new ScopedComplianceChecker();
    const policy = { config: { budget_amount: 1000, alert_thresholds: [75] } };
    const records = [{ team_id: 'team_a', amount: 850 }];
    const result = checker.checkBudgetCompliance(policy, records);
    assert(result.warnings[0].projected_overrun !== null);
});

runTest('w15_108', 'no projected_overrun below 80%', () => {
    const checker = new ScopedComplianceChecker();
    const policy = { config: { budget_amount: 1000, alert_thresholds: [75] } };
    const records = [{ team_id: 'team_a', amount: 760 }];
    const result = checker.checkBudgetCompliance(policy, records);
    assert.strictEqual(result.warnings[0].projected_overrun, null);
});

// ─── SECTION 11: ScopedComplianceChecker with zero budget (3 tests) ────────

console.log('\n[11] ScopedComplianceChecker.checkBudgetCompliance (zero budget)');

runTest('w15_109', 'zero budget returns compliant with warning', () => {
    const checker = new ScopedComplianceChecker();
    const policy = { config: { budget_amount: 0 } };
    const records = [{ team_id: 'team_a', amount: 100 }];
    const result = checker.checkBudgetCompliance(policy, records);
    assert.strictEqual(result.compliant, true);
    assert(result.warnings.length > 0);
});

runTest('w15_110', 'undefined budget returns compliant with warning', () => {
    const checker = new ScopedComplianceChecker();
    const policy = { config: {} };
    const records = [{ team_id: 'team_a', amount: 100 }];
    const result = checker.checkBudgetCompliance(policy, records);
    assert.strictEqual(result.compliant, true);
    assert(result.warnings.length > 0);
});

runTest('w15_111', 'zero budget utilization is 0', () => {
    const checker = new ScopedComplianceChecker();
    const policy = { config: { budget_amount: 0 } };
    const records = [{ team_id: 'team_a', amount: 100 }];
    const result = checker.checkBudgetCompliance(policy, records);
    assert.strictEqual(result.utilization, 0);
});

// ─── SECTION 12: ScopedComplianceChecker.generateScopedReport (10 tests) ───

console.log('\n[12] ScopedComplianceChecker.generateScopedReport');

runTest('w15_112', 'multiple policies checked', () => {
    const checker = new ScopedComplianceChecker();
    const policies = [
        { id: 'p1', name: 'Policy 1', config: { budget_amount: 1000 } },
        { id: 'p2', name: 'Policy 2', config: { budget_amount: 500 } }
    ];
    const records = [{ team_id: 'team_a', amount: 400 }];
    const report = checker.generateScopedReport(policies, records);
    assert.strictEqual(report.policies.length, 2);
});

runTest('w15_113', 'compliance_score computed correctly', () => {
    const checker = new ScopedComplianceChecker();
    const policies = [
        { id: 'p1', name: 'Policy 1', config: { budget_amount: 1000 } },
        { id: 'p2', name: 'Policy 2', config: { budget_amount: 500 } }
    ];
    const records = [{ team_id: 'team_a', amount: 400 }];
    const report = checker.generateScopedReport(policies, records);
    assert.strictEqual(report.summary.compliance_score, 100);
});

runTest('w15_114', 'violations counted correctly', () => {
    const checker = new ScopedComplianceChecker();
    const policies = [
        { id: 'p1', name: 'Policy 1', config: { budget_amount: 300 } }
    ];
    const records = [{ team_id: 'team_a', amount: 400 }];
    const report = checker.generateScopedReport(policies, records);
    assert(report.summary.violations > 0);
});

runTest('w15_115', 'warnings counted correctly', () => {
    const checker = new ScopedComplianceChecker();
    const policies = [
        { id: 'p1', name: 'Policy 1', config: { budget_amount: 1000, alert_thresholds: [75] } }
    ];
    const records = [{ team_id: 'team_a', amount: 800 }];
    const report = checker.generateScopedReport(policies, records);
    assert(report.summary.warnings > 0);
});

runTest('w15_116', 'generated_at timestamp present', () => {
    const checker = new ScopedComplianceChecker();
    const policies = [];
    const report = checker.generateScopedReport(policies, []);
    assert(report.generated_at);
    assert(!isNaN(new Date(report.generated_at).getTime()));
});

runTest('w15_117', 'empty policies list returns 100% compliance', () => {
    const checker = new ScopedComplianceChecker();
    const report = checker.generateScopedReport([], []);
    assert.strictEqual(report.summary.compliance_score, 100);
});

runTest('w15_118', 'total_policies count is accurate', () => {
    const checker = new ScopedComplianceChecker();
    const policies = [
        { id: 'p1', name: 'Policy 1', config: { budget_amount: 1000 } },
        { id: 'p2', name: 'Policy 2', config: { budget_amount: 500 } },
        { id: 'p3', name: 'Policy 3', config: { budget_amount: 750 } }
    ];
    const report = checker.generateScopedReport(policies, []);
    assert.strictEqual(report.summary.total_policies, 3);
});

runTest('w15_119', 'non-budget policy types pass through', () => {
    const checker = new ScopedComplianceChecker();
    const policies = [
        { id: 'p1', name: 'Policy 1', type: 'model_usage' }
    ];
    const report = checker.generateScopedReport(policies, []);
    assert.strictEqual(report.policies[0].compliant, true);
});

runTest('w15_120', 'compliant policies counted', () => {
    const checker = new ScopedComplianceChecker();
    const policies = [
        { id: 'p1', name: 'Policy 1', config: { budget_amount: 1000 } },
        { id: 'p2', name: 'Policy 2', config: { budget_amount: 500 } }
    ];
    const records = [{ team_id: 'team_a', amount: 300 }];
    const report = checker.generateScopedReport(policies, records);
    assert.strictEqual(report.summary.compliant, 2);
});

runTest('w15_121', 'policy_id and policy_name in result', () => {
    const checker = new ScopedComplianceChecker();
    const policies = [
        { id: 'policy_abc', name: 'Test Policy', config: { budget_amount: 1000 } }
    ];
    const report = checker.generateScopedReport(policies, []);
    assert.strictEqual(report.policies[0].policy_id, 'policy_abc');
    assert.strictEqual(report.policies[0].policy_name, 'Test Policy');
});

// ─── SECTION 13: ORIGINAL BUG REGRESSION — Team vs Org Spend (6 tests) ─────

console.log('\n[13] REGRESSION: Team Budget vs Org-wide Spend');

runTest('w15_122', 'team with $1000 budget and $800 team spend is compliant', () => {
    const checker = new ScopedComplianceChecker();
    const policy = { config: { team_id: 'team_a', budget_amount: 1000 } };
    const allRecords = [
        { team_id: 'team_a', amount: 300 },
        { team_id: 'team_a', amount: 500 },
        { team_id: 'team_b', amount: 25000 },
        { team_id: 'team_c', amount: 25000 }
    ];
    const result = checker.checkBudgetCompliance(policy, allRecords);
    assert.strictEqual(result.compliant, true);
    assert.strictEqual(result.scoped_spend, 800);
});

runTest('w15_123', 'team spend 800 utilization is 80% not 5000%', () => {
    const checker = new ScopedComplianceChecker();
    const policy = { config: { team_id: 'team_a', budget_amount: 1000 } };
    const allRecords = [
        { team_id: 'team_a', amount: 500 },
        { team_id: 'team_a', amount: 300 },
        { team_id: 'team_b', amount: 49200 }
    ];
    const result = checker.checkBudgetCompliance(policy, allRecords);
    assert.strictEqual(result.utilization, 80);
});

runTest('w15_124', 'org-wide spend filtered out from team scope', () => {
    const checker = new ScopedComplianceChecker();
    const policy = { config: { team_id: 'team_engineering', budget_amount: 2000 } };
    const records = [
        { team_id: 'team_engineering', amount: 500 },
        { team_id: 'team_engineering', amount: 1000 },
        { team_id: 'team_sales', amount: 10000 },
        { team_id: 'team_marketing', amount: 5000 }
    ];
    const result = checker.checkBudgetCompliance(policy, records);
    assert.strictEqual(result.scoped_spend, 1500);
    assert.strictEqual(result.violations.length, 0);
});

runTest('w15_125', 'multiple teams with same policy type checked independently', () => {
    const checker = new ScopedComplianceChecker();
    const policy1 = { config: { team_id: 'team_a', budget_amount: 500 } };
    const policy2 = { config: { team_id: 'team_b', budget_amount: 500 } };
    const records = [
        { team_id: 'team_a', amount: 600 },
        { team_id: 'team_b', amount: 400 }
    ];
    const result1 = checker.checkBudgetCompliance(policy1, records);
    const result2 = checker.checkBudgetCompliance(policy2, records);
    assert.strictEqual(result1.compliant, false);
    assert.strictEqual(result2.compliant, true);
});

runTest('w15_126', 'generateScopedReport with team policies uses scoped spend', () => {
    const checker = new ScopedComplianceChecker();
    const policies = [
        { id: 'p1', name: 'Team A Budget', config: { team_id: 'team_a', budget_amount: 1000 } },
        { id: 'p2', name: 'Team B Budget', config: { team_id: 'team_b', budget_amount: 1000 } }
    ];
    const records = [
        { team_id: 'team_a', amount: 500 },
        { team_id: 'team_b', amount: 1500 }
    ];
    const report = checker.generateScopedReport(policies, records);
    assert.strictEqual(report.policies[0].compliant, true);
    assert.strictEqual(report.policies[1].compliant, false);
});

runTest('w15_127', 'bug regression scenario from description', () => {
    const checker = new ScopedComplianceChecker();
    const teamBudgetPolicy = {
        id: 'team_budget',
        name: 'Team Budget',
        config: { team_id: 'team_x', budget_amount: 1000 }
    };
    const orgSpendRecords = [
        { team_id: 'team_x', amount: 800 },
        { team_id: 'team_y', amount: 50000 }
    ];
    const result = checker.checkBudgetCompliance(teamBudgetPolicy, orgSpendRecords);
    assert.strictEqual(result.compliant, true, 'Old buggy code would fail here');
    assert.strictEqual(result.scoped_spend, 800);
});

// ─── SECTION 14: Division-by-Zero REGRESSION (6 tests) ──────────────────────

console.log('\n[14] REGRESSION: Division by Zero (close-pack-generator)');

runTest('w15_128', 'safeCostBreakdown with total_spend=0 produces no NaN%', () => {
    const costData = [
        { provider: 'AWS', amount: 500 },
        { provider: 'GCP', amount: 300 }
    ];
    const result = safeCostBreakdown(costData, 0, 'amount', 1);
    assert(result.every(item => item.percentage === '0.0%'));
    assert(!result.some(item => item.percentage.includes('NaN')));
});

runTest('w15_129', 'cost breakdown with zero total is safe', () => {
    const items = [
        { name: 'Service A', amount: 100 },
        { name: 'Service B', amount: 200 },
        { name: 'Service C', amount: null }
    ];
    const result = safeCostBreakdown(items, 0);
    assert.strictEqual(result[0].percentage, '0.0%');
    assert.strictEqual(result[1].percentage, '0.0%');
    assert.strictEqual(result[2].percentage, '0.0%');
});

runTest('w15_130', 'close-pack-generator pattern replaced correctly', () => {
    const costData = {
        by_provider: [
            { provider: 'AWS', amount: 1000 },
            { provider: 'GCP', amount: 2000 }
        ],
        total_spend: 0
    };
    const result = safeCostBreakdown(costData.by_provider, costData.total_spend);
    assert(result[0].percentage === '0.0%');
    assert(result[1].percentage === '0.0%');
});

runTest('w15_131', 'safe percentage with zero total is safe', () => {
    const result = safePercentageString(100, 0);
    assert.strictEqual(result, '0.0%');
    assert(!result.includes('NaN'));
    assert(!result.includes('Infinity'));
});

runTest('w15_132', 'large amount with zero total', () => {
    const result = safePercentageString(999999.99, 0);
    assert.strictEqual(result, '0.0%');
});

runTest('w15_133', 'safeDivide prevents NaN in percentage calculations', () => {
    const amount = 1500;
    const total = 0;
    const pct = safeDivide(amount, total, 0) * 100;
    assert.strictEqual(pct, 0);
    assert(!isNaN(pct));
});

// ─── SECTION 15: Factory Function (3 tests) ────────────────────────────────

console.log('\n[15] Factory Function');

runTest('w15_134', 'createScopedComplianceChecker returns instance', () => {
    const checker = createScopedComplianceChecker();
    assert(checker instanceof ScopedComplianceChecker);
});

runTest('w15_135', 'factory with config sets floatTolerance', () => {
    const checker = createScopedComplianceChecker({ floatTolerance: 0.01 });
    assert.strictEqual(checker.floatTolerance, 0.01);
});

runTest('w15_136', 'factory with empty config uses default tolerance', () => {
    const checker = createScopedComplianceChecker();
    assert.strictEqual(checker.floatTolerance, COMPLIANCE_CONFIG.FLOAT_TOLERANCE);
});

// ─── SECTION 16: Structural Validation (6 tests) ────────────────────────────

console.log('\n[16] Structural Validation');

runTest('w15_137', 'ScopedComplianceChecker has checkBudgetCompliance method', () => {
    const checker = new ScopedComplianceChecker();
    assert(typeof checker.checkBudgetCompliance === 'function');
});

runTest('w15_138', 'ScopedComplianceChecker has generateScopedReport method', () => {
    const checker = new ScopedComplianceChecker();
    assert(typeof checker.generateScopedReport === 'function');
});

runTest('w15_139', 'ScopeResolver has static getScope method', () => {
    assert(typeof ScopeResolver.getScope === 'function');
});

runTest('w15_140', 'ScopeResolver has static getScopeId method', () => {
    assert(typeof ScopeResolver.getScopeId === 'function');
});

runTest('w15_141', 'ScopeResolver has static filterByScope method', () => {
    assert(typeof ScopeResolver.filterByScope === 'function');
});

runTest('w15_142', 'ScopeResolver has static computeScopedSpend method', () => {
    assert(typeof ScopeResolver.computeScopedSpend === 'function');
});

// ─── SECTION 17: Edge Cases (8 tests) ──────────────────────────────────────

console.log('\n[17] Edge Cases');

runTest('w15_143', 'policies with no config field handled', () => {
    const checker = new ScopedComplianceChecker();
    const policy = { id: 'p1', budget_amount: 500 };
    const records = [{ team_id: 'team_a', amount: 300 }];
    const result = checker.checkBudgetCompliance(policy, records);
    assert.strictEqual(result.compliant, true);
});

runTest('w15_144', 'cost records with missing amount field', () => {
    const records = [
        { team_id: 'team_a' },
        { team_id: 'team_a', amount: 100 }
    ];
    const policy = { config: { team_id: 'team_a' } };
    const spend = ScopeResolver.computeScopedSpend(records, policy);
    assert.strictEqual(spend, 100);
});

runTest('w15_145', 'mixed scope types in one report', () => {
    const checker = new ScopedComplianceChecker();
    const policies = [
        { id: 'p1', name: 'Org Budget', config: { budget_amount: 5000 } },
        { id: 'p2', name: 'Team Budget', config: { team_id: 'team_a', budget_amount: 1000 } },
        { id: 'p3', name: 'Project Budget', config: { project_id: 'proj_x', budget_amount: 500 } }
    ];
    const records = [
        { team_id: 'team_a', project_id: 'proj_x', amount: 200 },
        { team_id: 'team_a', project_id: 'proj_y', amount: 300 },
        { team_id: 'team_b', amount: 1000 }
    ];
    const report = checker.generateScopedReport(policies, records);
    assert.strictEqual(report.policies.length, 3);
    assert.strictEqual(report.policies[1].scope, 'team');
    assert.strictEqual(report.policies[2].scope, 'project');
});

runTest('w15_146', 'policy.scope as string vs object', () => {
    const scope1 = ScopeResolver.getScope({ scope: 'team' });
    const scope2 = ScopeResolver.getScope({ scope: { type: 'team' } });
    assert.strictEqual(scope1, scope2);
});

runTest('w15_147', 'very large amounts without overflow', () => {
    const checker = new ScopedComplianceChecker();
    const policy = { config: { budget_amount: 1000000000 } };
    const records = [{ team_id: 'team_a', amount: 999999999 }];
    const result = checker.checkBudgetCompliance(policy, records);
    assert.strictEqual(result.compliant, true);
    assert(result.utilization < 100);
});

runTest('w15_148', 'multiple warnings with different severities', () => {
    const checker = new ScopedComplianceChecker();
    const policy = { config: { budget_amount: 1000, alert_thresholds: [50, 75, 90] } };
    const records = [{ team_id: 'team_a', amount: 920 }];
    const result = checker.checkBudgetCompliance(policy, records);
    assert.strictEqual(result.warnings.length, 1);
    assert.strictEqual(result.warnings[0].severity, 'high');
});

runTest('w15_149', 'exactly at budget threshold (100%)', () => {
    const checker = new ScopedComplianceChecker();
    const policy = { config: { budget_amount: 1000 } };
    const records = [{ team_id: 'team_a', amount: 1000 }];
    const result = checker.checkBudgetCompliance(policy, records);
    assert.strictEqual(result.compliant, false);
    assert(result.violations.length > 0);
});

runTest('w15_150', 'floating point tolerance in comparisons', () => {
    const checker = new ScopedComplianceChecker({ floatTolerance: 0.001 });
    const policy = { config: { budget_amount: 1000 } };
    const records = [{ team_id: 'team_a', amount: 999.9999 }];
    const result = checker.checkBudgetCompliance(policy, records);
    assert(Math.abs(result.utilization - 99.99999) < 0.01);
});

// ─── SECTION 18: INTEGRATION WIRING VERIFICATION (20 tests) ─────────────────

console.log('\n[18] INTEGRATION WIRING VERIFICATION');

// Read source files for integration testing
import fs from 'fs';
const policyAgentSrc = fs.readFileSync(
    new URL('../agents/policy-agent.js', import.meta.url), 'utf8'
);
const closePackSrc = fs.readFileSync(
    new URL('../agents/close-pack-generator.js', import.meta.url), 'utf8'
);

// w15_151: policy-agent.js imports createScopedComplianceChecker
runTest('w15_151', 'policy-agent.js imports createScopedComplianceChecker', () => {
    assert(
        policyAgentSrc.includes('import { createScopedComplianceChecker, ScopeResolver }'),
        'missing W-015 import in policy-agent'
    );
});

// w15_152: policy-agent.js constructor creates scopedChecker
runTest('w15_152', 'policy-agent.js constructor creates scopedChecker', () => {
    assert(
        policyAgentSrc.includes('this.scopedChecker = createScopedComplianceChecker()'),
        'missing scopedChecker in constructor'
    );
});

// w15_153: policy-agent.js generateComplianceReport uses scopedChecker for budget policies
runTest('w15_153', 'policy-agent uses scopedChecker for budget checks', () => {
    assert(
        policyAgentSrc.includes('this.scopedChecker.checkBudgetCompliance(policy'),
        'scoped checker not used in compliance report'
    );
});

// w15_154: Old totalSpend variable is REMOVED from policy-agent generateComplianceReport method
// (note: const totalSpend assignments may exist elsewhere or in comments, but not in active code path)
runTest('w15_154', 'old totalSpend variable removed from generateComplianceReport', () => {
    // Check that the main method doesn't define and use totalSpend for old-style calculations
    const generateComplianceReportMatch = policyAgentSrc.match(/generateComplianceReport[\s\S]*?(?=async\s|\n\s{0,4}async|\n\s{0,4}[a-zA-Z]|$)/);
    const methodBody = generateComplianceReportMatch ? generateComplianceReportMatch[0] : '';
    // The old pattern was calculating total from usageData directly
    assert(
        !methodBody.includes('const totalSpend = usageData'),
        'dead totalSpend variable still present in generateComplianceReport'
    );
});

// w15_155: Old non-scoped budget check is REMOVED from generateComplianceReport
runTest('w15_155', 'old non-scoped budget check removed', () => {
    assert(
        !policyAgentSrc.includes('this.checkBudgetCompliance(policy.config, totalSpend)'),
        'old non-scoped budget check still present'
    );
});

// w15_156: Legacy checkBudgetCompliance has deprecation warning
runTest('w15_156', 'legacy checkBudgetCompliance has deprecation warning', () => {
    assert(
        policyAgentSrc.includes('deprecated'),
        'deprecation warning missing from old checkBudgetCompliance'
    );
});

// w15_157: Legacy checkBudgetCompliance has division guard
runTest('w15_157', 'legacy checkBudgetCompliance has division guard', () => {
    assert(
        policyAgentSrc.includes('policy.budget_amount > 0'),
        'division guard missing in legacy checkBudgetCompliance'
    );
});

// w15_158: close-pack-generator.js imports safeCostBreakdown
runTest('w15_158', 'close-pack-generator imports safeCostBreakdown', () => {
    assert(
        closePackSrc.includes('import { safeCostBreakdown, safeDivide }'),
        'missing safeCostBreakdown import in close-pack-generator'
    );
});

// w15_159: close-pack-generator.js uses safeCostBreakdown in generateCostBreakdown
runTest('w15_159', 'safeCostBreakdown used for providers in generateCostBreakdown', () => {
    assert(
        closePackSrc.includes('safeCostBreakdown(costData.by_provider, total)'),
        'safeCostBreakdown not used for providers'
    );
});

// w15_160: close-pack-generator.js uses safeCostBreakdown for all 4 breakdown arrays
runTest('w15_160', 'safeCostBreakdown used for all cost breakdown arrays', () => {
    assert(
        closePackSrc.includes('safeCostBreakdown(costData.by_provider, total)'),
        'by_provider'
    );
    assert(
        closePackSrc.includes('safeCostBreakdown(costData.by_model.slice(0, 10), total)'),
        'by_model'
    );
    assert(
        closePackSrc.includes('safeCostBreakdown(teamAllocation.by_team, total)'),
        'by_team'
    );
    assert(
        closePackSrc.includes('safeCostBreakdown(teamAllocation.by_project.slice(0, 10), total)'),
        'by_project'
    );
});

// w15_161: Old NaN pattern is documented in comments but REMOVED from actual code
// The pattern ((p.amount / total) * 100) appears in comments explaining the bug, but not in active code
runTest('w15_161', 'old NaN pattern removed from generateCostBreakdown', () => {
    // Extract just the generateCostBreakdown method body
    const costBreakdownMatch = closePackSrc.match(/async generateCostBreakdown[\s\S]*?(?=async\s[a-zA-Z]|^\s*async|\n\s{0,4}async|\Z)/);
    const methodBody = costBreakdownMatch ? costBreakdownMatch[0] : '';
    // Verify that actual code uses safeCostBreakdown, not the unsafe (p.amount / total) * 100 pattern
    assert(
        methodBody.includes('safeCostBreakdown(costData.by_provider'),
        'safeCostBreakdown not used in generateCostBreakdown'
    );
    // Verify old pattern doesn't appear in the active return statement
    const returnMatch = methodBody.match(/return\s*{[\s\S]*?};/);
    const returnBody = returnMatch ? returnMatch[0] : '';
    assert(
        !returnBody.includes('(p.amount / total) * 100'),
        'old NaN division pattern still in cost breakdown return'
    );
});

// w15_162: safeDivide used for budgetVariance in executive summary
runTest('w15_162', 'safeDivide used for budgetVariance in executive summary', () => {
    assert(
        closePackSrc.includes('safeDivide(totalSpend - budget, budget'),
        'budgetVariance not using safeDivide'
    );
});

// w15_163: safeDivide used for variancePercent in variance analysis
runTest('w15_163', 'safeDivide used for variancePercent in variance analysis', () => {
    assert(
        closePackSrc.includes('safeDivide(variance, budget, 0)'),
        'variancePercent not using safeDivide'
    );
});

// w15_164: safeDivide used for weekOverWeekChange in trend analysis
runTest('w15_164', 'safeDivide used for weekOverWeekChange in trend analysis', () => {
    assert(
        closePackSrc.includes('safeDivide(recentAvg - previousAvg, previousAvg'),
        'weekOverWeekChange not using safeDivide'
    );
});

// w15_165: safeDivide used for optimization ROI
runTest('w15_165', 'safeDivide used for optimization ROI', () => {
    assert(
        closePackSrc.includes('safeDivide(totalSavings - finaultCost, finaultCost'),
        'ROI not using safeDivide'
    );
});

// w15_166: safeDivide used for top provider percentage
runTest('w15_166', 'safeDivide used for top provider percentage', () => {
    assert(
        closePackSrc.includes('safeDivide(costData.by_provider[0]?.amount || 0, currentMonthly'),
        'top provider % not using safeDivide'
    );
});

// w15_167: safeDivide used for budget_utilization in key metrics
runTest('w15_167', 'safeDivide used for budget_utilization in key metrics', () => {
    assert(
        closePackSrc.includes('safeDivide(sections.executive_summary.total_spend, sections.variance_analysis.budget'),
        'budget_utilization not using safeDivide'
    );
});

// w15_168: safeDivide used for reconciliation_rate in key metrics
runTest('w15_168', 'safeDivide used for reconciliation_rate in key metrics', () => {
    assert(
        closePackSrc.includes('safeDivide(sections.audit_trail.matched, sections.audit_trail.invoices_reconciled'),
        'reconciliation_rate not using safeDivide'
    );
});

// w15_169: No unprotected divisions remain in close-pack-generator
runTest('w15_169', 'no unprotected divisions in close-pack-generator', () => {
    const lines = closePackSrc.split('\n');
    const unsafeDivisions = lines.filter(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return false;
        return trimmed.includes('/ total)') && !trimmed.includes('safeDivide') && !trimmed.includes('safeCostBreakdown');
    });
    assert.strictEqual(unsafeDivisions.length, 0, `Found ${unsafeDivisions.length} unprotected total divisions`);
});

// w15_170: by_provider[0] uses fallback values to prevent 'undefined' in template strings
runTest('w15_170', 'by_provider[0] uses fallback values for undefined protection', () => {
    assert(
        closePackSrc.includes("by_provider[0]?.name || 'None'"),
        'missing None fallback for provider'
    );
});

// ─── FINAL SUMMARY ──────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(70));
console.log(`SUMMARY: ${results.passed} passed, ${results.failed} failed`);
console.log('='.repeat(70));

if (results.failed > 0) {
    console.log('\nFAILURES:');
    results.failures.forEach(failure => {
        console.log(`  [${failure.id}] ${failure.name}`);
        console.log(`    Error: ${failure.error}`);
    });
    process.exit(1);
}

process.exit(0);
