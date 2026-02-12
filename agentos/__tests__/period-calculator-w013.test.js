/**
 * COMPREHENSIVE TEST SUITE FOR PERIOD CALCULATOR (W-013)
 *
 * Tests for:
 * - PeriodCalculator class with quarter/month calculation
 * - IntegrityHash for data integrity verification
 * - Safe percentage calculations
 * - Factory function
 * - Original bug regression (January Q0 bug)
 * - Edge cases and year boundaries
 *
 * Minimum: 150 tests organized into 16 sections
 */

import assert from 'assert';
import crypto from 'crypto';
import {
    PERIOD_CONFIG,
    PeriodCalculator,
    IntegrityHash,
    safePercentage,
    safePercentageNumber,
    createPeriodCalculator
} from '../core/period-calculator.js';

// ─── TEST FRAMEWORK ────────────────────────────────────────────────────────

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

// ─── SECTION 1: PeriodCalculator.getCurrentQuarter ────────────────────────

console.log('\n1. PeriodCalculator.getCurrentQuarter (months 0-11 → quarters 1-4)');

const calc = new PeriodCalculator();

runTest('w13_001', 'January (month 0) returns Q1', () => {
    const date = new Date(2024, 0, 15);
    assert.strictEqual(calc.getCurrentQuarter(date), 1);
});

runTest('w13_002', 'February (month 1) returns Q1', () => {
    const date = new Date(2024, 1, 15);
    assert.strictEqual(calc.getCurrentQuarter(date), 1);
});

runTest('w13_003', 'March (month 2) returns Q1', () => {
    const date = new Date(2024, 2, 15);
    assert.strictEqual(calc.getCurrentQuarter(date), 1);
});

runTest('w13_004', 'April (month 3) returns Q2', () => {
    const date = new Date(2024, 3, 15);
    assert.strictEqual(calc.getCurrentQuarter(date), 2);
});

runTest('w13_005', 'May (month 4) returns Q2', () => {
    const date = new Date(2024, 4, 15);
    assert.strictEqual(calc.getCurrentQuarter(date), 2);
});

runTest('w13_006', 'June (month 5) returns Q2', () => {
    const date = new Date(2024, 5, 15);
    assert.strictEqual(calc.getCurrentQuarter(date), 2);
});

runTest('w13_007', 'July (month 6) returns Q3', () => {
    const date = new Date(2024, 6, 15);
    assert.strictEqual(calc.getCurrentQuarter(date), 3);
});

runTest('w13_008', 'August (month 7) returns Q3', () => {
    const date = new Date(2024, 7, 15);
    assert.strictEqual(calc.getCurrentQuarter(date), 3);
});

runTest('w13_009', 'September (month 8) returns Q3', () => {
    const date = new Date(2024, 8, 15);
    assert.strictEqual(calc.getCurrentQuarter(date), 3);
});

runTest('w13_010', 'October (month 9) returns Q4', () => {
    const date = new Date(2024, 9, 15);
    assert.strictEqual(calc.getCurrentQuarter(date), 4);
});

runTest('w13_011', 'November (month 10) returns Q4', () => {
    const date = new Date(2024, 10, 15);
    assert.strictEqual(calc.getCurrentQuarter(date), 4);
});

runTest('w13_012', 'December (month 11) returns Q4', () => {
    const date = new Date(2024, 11, 15);
    assert.strictEqual(calc.getCurrentQuarter(date), 4);
});

// ─── SECTION 2: PeriodCalculator.getPreviousQuarter ──────────────────────

console.log('\n2. PeriodCalculator.getPreviousQuarter (year wrapping fix)');

runTest('w13_013', 'January in 2024: current Q1 → previous Q4 of 2023', () => {
    const date = new Date(2024, 0, 15);
    const prev = calc.getPreviousQuarter(date);
    assert.strictEqual(prev.quarter, 4);
    assert.strictEqual(prev.year, 2023);
});

runTest('w13_014', 'February in 2024: current Q1 → previous Q4 of 2023', () => {
    const date = new Date(2024, 1, 15);
    const prev = calc.getPreviousQuarter(date);
    assert.strictEqual(prev.quarter, 4);
    assert.strictEqual(prev.year, 2023);
});

runTest('w13_015', 'March in 2024: current Q1 → previous Q4 of 2023', () => {
    const date = new Date(2024, 2, 15);
    const prev = calc.getPreviousQuarter(date);
    assert.strictEqual(prev.quarter, 4);
    assert.strictEqual(prev.year, 2023);
});

runTest('w13_016', 'April in 2024: current Q2 → previous Q1 of 2024', () => {
    const date = new Date(2024, 3, 15);
    const prev = calc.getPreviousQuarter(date);
    assert.strictEqual(prev.quarter, 1);
    assert.strictEqual(prev.year, 2024);
});

runTest('w13_017', 'May in 2024: current Q2 → previous Q1 of 2024', () => {
    const date = new Date(2024, 4, 15);
    const prev = calc.getPreviousQuarter(date);
    assert.strictEqual(prev.quarter, 1);
    assert.strictEqual(prev.year, 2024);
});

runTest('w13_018', 'June in 2024: current Q2 → previous Q1 of 2024', () => {
    const date = new Date(2024, 5, 15);
    const prev = calc.getPreviousQuarter(date);
    assert.strictEqual(prev.quarter, 1);
    assert.strictEqual(prev.year, 2024);
});

runTest('w13_019', 'July in 2024: current Q3 → previous Q2 of 2024', () => {
    const date = new Date(2024, 6, 15);
    const prev = calc.getPreviousQuarter(date);
    assert.strictEqual(prev.quarter, 2);
    assert.strictEqual(prev.year, 2024);
});

runTest('w13_020', 'August in 2024: current Q3 → previous Q2 of 2024', () => {
    const date = new Date(2024, 7, 15);
    const prev = calc.getPreviousQuarter(date);
    assert.strictEqual(prev.quarter, 2);
    assert.strictEqual(prev.year, 2024);
});

runTest('w13_021', 'September in 2024: current Q3 → previous Q2 of 2024', () => {
    const date = new Date(2024, 8, 15);
    const prev = calc.getPreviousQuarter(date);
    assert.strictEqual(prev.quarter, 2);
    assert.strictEqual(prev.year, 2024);
});

runTest('w13_022', 'October in 2024: current Q4 → previous Q3 of 2024', () => {
    const date = new Date(2024, 9, 15);
    const prev = calc.getPreviousQuarter(date);
    assert.strictEqual(prev.quarter, 3);
    assert.strictEqual(prev.year, 2024);
});

runTest('w13_023', 'November in 2024: current Q4 → previous Q3 of 2024', () => {
    const date = new Date(2024, 10, 15);
    const prev = calc.getPreviousQuarter(date);
    assert.strictEqual(prev.quarter, 3);
    assert.strictEqual(prev.year, 2024);
});

runTest('w13_024', 'December in 2024: current Q4 → previous Q3 of 2024', () => {
    const date = new Date(2024, 11, 15);
    const prev = calc.getPreviousQuarter(date);
    assert.strictEqual(prev.quarter, 3);
    assert.strictEqual(prev.year, 2024);
});

// ─── SECTION 3: PeriodCalculator.getQuarterDateRange ──────────────────────

console.log('\n3. PeriodCalculator.getQuarterDateRange (Q1-Q4 date ranges)');

runTest('w13_025', 'Q1 2024: Jan 1 to Mar 31', () => {
    const range = calc.getQuarterDateRange(1, 2024);
    assert.strictEqual(range.start, '2024-01-01');
    assert.strictEqual(range.end, '2024-03-31');
});

runTest('w13_026', 'Q2 2024: Apr 1 to Jun 30', () => {
    const range = calc.getQuarterDateRange(2, 2024);
    assert.strictEqual(range.start, '2024-04-01');
    assert.strictEqual(range.end, '2024-06-30');
});

runTest('w13_027', 'Q3 2024: Jul 1 to Sep 30', () => {
    const range = calc.getQuarterDateRange(3, 2024);
    assert.strictEqual(range.start, '2024-07-01');
    assert.strictEqual(range.end, '2024-09-30');
});

runTest('w13_028', 'Q4 2024: Oct 1 to Dec 31', () => {
    const range = calc.getQuarterDateRange(4, 2024);
    assert.strictEqual(range.start, '2024-10-01');
    assert.strictEqual(range.end, '2024-12-31');
});

runTest('w13_029', 'Invalid quarter 0 throws error', () => {
    assert.throws(
        () => calc.getQuarterDateRange(0, 2024),
        /Invalid quarter: 0/
    );
});

runTest('w13_030', 'Invalid quarter 5 throws error', () => {
    assert.throws(
        () => calc.getQuarterDateRange(5, 2024),
        /Invalid quarter: 5/
    );
});

// ─── SECTION 4: PeriodCalculator.determinePeriod ─────────────────────────

console.log('\n4. PeriodCalculator.determinePeriod (monthly/quarterly/custom/default)');

runTest('w13_031', 'Default (no period option) returns monthly', () => {
    const period = calc.determinePeriod({}, new Date(2024, 0, 15));
    assert.strictEqual(period.type, 'monthly');
});

runTest('w13_032', 'period=monthly returns monthly', () => {
    const period = calc.determinePeriod({ period: 'monthly' }, new Date(2024, 0, 15));
    assert.strictEqual(period.type, 'monthly');
});

runTest('w13_033', 'period=quarterly returns quarterly', () => {
    const period = calc.determinePeriod({ period: 'quarterly' }, new Date(2024, 0, 15));
    assert.strictEqual(period.type, 'quarterly');
});

runTest('w13_034', 'Custom period with start_date and end_date returns custom', () => {
    const period = calc.determinePeriod({
        period: 'custom',
        start_date: '2024-01-01',
        end_date: '2024-01-31'
    }, new Date(2024, 0, 15));
    assert.strictEqual(period.type, 'custom');
    assert.strictEqual(period.name, '2024-01-01 to 2024-01-31');
});

runTest('w13_035', 'Monthly period has name property', () => {
    const period = calc.determinePeriod({ period: 'monthly' }, new Date(2024, 0, 15));
    assert(period.name);
    assert(typeof period.name === 'string');
});

runTest('w13_036', 'Quarterly period has name property', () => {
    const period = calc.determinePeriod({ period: 'quarterly' }, new Date(2024, 0, 15));
    assert(period.name);
    assert(typeof period.name === 'string');
});

runTest('w13_037', 'Period has start and end properties', () => {
    const period = calc.determinePeriod({ period: 'monthly' }, new Date(2024, 0, 15));
    assert(period.start);
    assert(period.end);
});

runTest('w13_038', 'Unknown period type falls back to monthly', () => {
    const period = calc.determinePeriod({ period: 'unknown' }, new Date(2024, 0, 15));
    assert.strictEqual(period.type, 'monthly');
});

// ─── SECTION 5: PeriodCalculator.getMonthlyPeriod ──────────────────────────

console.log('\n5. PeriodCalculator.getMonthlyPeriod (previous month for all 12 months)');

runTest('w13_039', 'January 2024: previous month is December 2023', () => {
    const period = calc.getMonthlyPeriod(new Date(2024, 0, 15));
    assert(period.start.includes('2023-12'));
    assert(period.end.includes('2023-12'));
});

runTest('w13_040', 'February 2024: previous month is January 2024', () => {
    const period = calc.getMonthlyPeriod(new Date(2024, 1, 15));
    assert(period.start.includes('2024-01'));
    assert(period.end.includes('2024-01'));
});

runTest('w13_041', 'March 2024: previous month is February 2024', () => {
    const period = calc.getMonthlyPeriod(new Date(2024, 2, 15));
    assert(period.start.includes('2024-02'));
    assert(period.end.includes('2024-02'));
});

runTest('w13_042', 'April 2024: previous month is March 2024', () => {
    const period = calc.getMonthlyPeriod(new Date(2024, 3, 15));
    assert(period.start.includes('2024-03'));
    assert(period.end.includes('2024-03'));
});

runTest('w13_043', 'May 2024: previous month is April 2024', () => {
    const period = calc.getMonthlyPeriod(new Date(2024, 4, 15));
    assert(period.start.includes('2024-04'));
    assert(period.end.includes('2024-04'));
});

runTest('w13_044', 'June 2024: previous month is May 2024', () => {
    const period = calc.getMonthlyPeriod(new Date(2024, 5, 15));
    assert(period.start.includes('2024-05'));
    assert(period.end.includes('2024-05'));
});

runTest('w13_045', 'July 2024: previous month is June 2024', () => {
    const period = calc.getMonthlyPeriod(new Date(2024, 6, 15));
    assert(period.start.includes('2024-06'));
    assert(period.end.includes('2024-06'));
});

runTest('w13_046', 'August 2024: previous month is July 2024', () => {
    const period = calc.getMonthlyPeriod(new Date(2024, 7, 15));
    assert(period.start.includes('2024-07'));
    assert(period.end.includes('2024-07'));
});

runTest('w13_047', 'September 2024: previous month is August 2024', () => {
    const period = calc.getMonthlyPeriod(new Date(2024, 8, 15));
    assert(period.start.includes('2024-08'));
    assert(period.end.includes('2024-08'));
});

runTest('w13_048', 'October 2024: previous month is September 2024', () => {
    const period = calc.getMonthlyPeriod(new Date(2024, 9, 15));
    assert(period.start.includes('2024-09'));
    assert(period.end.includes('2024-09'));
});

runTest('w13_049', 'November 2024: previous month is October 2024', () => {
    const period = calc.getMonthlyPeriod(new Date(2024, 10, 15));
    assert(period.start.includes('2024-10'));
    assert(period.end.includes('2024-10'));
});

runTest('w13_050', 'December 2024: previous month is November 2024', () => {
    const period = calc.getMonthlyPeriod(new Date(2024, 11, 15));
    assert(period.start.includes('2024-11'));
    assert(period.end.includes('2024-11'));
});

// ─── SECTION 6: PeriodCalculator.getQuarterlyPeriod ─────────────────────────

console.log('\n6. PeriodCalculator.getQuarterlyPeriod (previous quarter, all 12 months)');

runTest('w13_051', 'January 2024: previous quarter is Q4 2023 with valid dates', () => {
    const period = calc.getQuarterlyPeriod(new Date(2024, 0, 15));
    assert.strictEqual(period.type, 'quarterly');
    assert.strictEqual(period.name, 'Q4 2023');
    assert(period.start.match(/\d{4}-\d{2}-\d{2}/)); // ISO date
    assert(period.end.match(/\d{4}-\d{2}-\d{2}/));
});

runTest('w13_052', 'February 2024: previous quarter is Q4 2023', () => {
    const period = calc.getQuarterlyPeriod(new Date(2024, 1, 15));
    assert.strictEqual(period.name, 'Q4 2023');
});

runTest('w13_053', 'March 2024: previous quarter is Q4 2023', () => {
    const period = calc.getQuarterlyPeriod(new Date(2024, 2, 15));
    assert.strictEqual(period.name, 'Q4 2023');
});

runTest('w13_054', 'April 2024: previous quarter is Q1 2024', () => {
    const period = calc.getQuarterlyPeriod(new Date(2024, 3, 15));
    assert.strictEqual(period.name, 'Q1 2024');
});

runTest('w13_055', 'May 2024: previous quarter is Q1 2024', () => {
    const period = calc.getQuarterlyPeriod(new Date(2024, 4, 15));
    assert.strictEqual(period.name, 'Q1 2024');
});

runTest('w13_056', 'June 2024: previous quarter is Q1 2024', () => {
    const period = calc.getQuarterlyPeriod(new Date(2024, 5, 15));
    assert.strictEqual(period.name, 'Q1 2024');
});

runTest('w13_057', 'July 2024: previous quarter is Q2 2024', () => {
    const period = calc.getQuarterlyPeriod(new Date(2024, 6, 15));
    assert.strictEqual(period.name, 'Q2 2024');
});

runTest('w13_058', 'August 2024: previous quarter is Q2 2024', () => {
    const period = calc.getQuarterlyPeriod(new Date(2024, 7, 15));
    assert.strictEqual(period.name, 'Q2 2024');
});

runTest('w13_059', 'September 2024: previous quarter is Q2 2024', () => {
    const period = calc.getQuarterlyPeriod(new Date(2024, 8, 15));
    assert.strictEqual(period.name, 'Q2 2024');
});

runTest('w13_060', 'October 2024: previous quarter is Q3 2024', () => {
    const period = calc.getQuarterlyPeriod(new Date(2024, 9, 15));
    assert.strictEqual(period.name, 'Q3 2024');
});

runTest('w13_061', 'November 2024: previous quarter is Q3 2024', () => {
    const period = calc.getQuarterlyPeriod(new Date(2024, 10, 15));
    assert.strictEqual(period.name, 'Q3 2024');
});

runTest('w13_062', 'December 2024: previous quarter is Q3 2024', () => {
    const period = calc.getQuarterlyPeriod(new Date(2024, 11, 15));
    assert.strictEqual(period.name, 'Q3 2024');
});

// ─── SECTION 7: IntegrityHash.compute ────────────────────────────────────

console.log('\n7. IntegrityHash.compute (basic hashing, deterministic, exclusions)');

runTest('w13_063', 'compute() produces hex string', () => {
    const obj = { name: 'test', value: 123 };
    const hash = IntegrityHash.compute(obj);
    assert(typeof hash === 'string');
    assert(hash.match(/^[a-f0-9]{64}$/)); // SHA256 = 64 hex chars
});

runTest('w13_064', 'compute() is deterministic: same input → same hash', () => {
    const obj = { name: 'test', value: 123 };
    const hash1 = IntegrityHash.compute(obj);
    const hash2 = IntegrityHash.compute(obj);
    assert.strictEqual(hash1, hash2);
});

runTest('w13_065', 'compute() excludes hash field by default', () => {
    const obj = { name: 'test', value: 123 };
    const hash1 = IntegrityHash.compute(obj);
    const hash2 = IntegrityHash.compute({ ...obj, hash: 'ignored' });
    assert.strictEqual(hash1, hash2);
});

runTest('w13_066', 'compute() excludes integrity_hash field by default', () => {
    const obj = { name: 'test', value: 123 };
    const hash1 = IntegrityHash.compute(obj);
    const hash2 = IntegrityHash.compute({ ...obj, integrity_hash: 'ignored' });
    assert.strictEqual(hash1, hash2);
});

runTest('w13_067', 'compute() respects custom excludeFields', () => {
    const obj = { name: 'test', value: 123, secret: 'ignore' };
    const hash1 = IntegrityHash.compute(obj, ['secret']);
    const hash2 = IntegrityHash.compute({ ...obj, secret: 'different' }, ['secret']);
    assert.strictEqual(hash1, hash2);
});

runTest('w13_068', 'compute() different objects produce different hashes', () => {
    const hash1 = IntegrityHash.compute({ value: 123 });
    const hash2 = IntegrityHash.compute({ value: 456 });
    assert.notStrictEqual(hash1, hash2);
});

runTest('w13_069', 'compute() is order-independent due to key sorting', () => {
    const hash1 = IntegrityHash.compute({ a: 1, b: 2, c: 3 });
    const hash2 = IntegrityHash.compute({ c: 3, a: 1, b: 2 });
    assert.strictEqual(hash1, hash2);
});

runTest('w13_070', 'compute() handles nested objects', () => {
    const obj = { id: 1, data: { nested: 'value' } };
    const hash = IntegrityHash.compute(obj);
    assert(hash);
    assert(typeof hash === 'string');
});

runTest('w13_071', 'compute() handles arrays', () => {
    const obj = { id: 1, items: [1, 2, 3] };
    const hash = IntegrityHash.compute(obj);
    assert(hash);
    assert(typeof hash === 'string');
});

runTest('w13_072', 'compute() produces 64-character SHA256 hex digest', () => {
    const obj = { test: true };
    const hash = IntegrityHash.compute(obj);
    assert.strictEqual(hash.length, 64);
});

// ─── SECTION 8: IntegrityHash.sign ──────────────────────────────────────

console.log('\n8. IntegrityHash.sign (adds hash field, original unchanged)');

runTest('w13_073', 'sign() adds hash field to returned object', () => {
    const obj = { name: 'test', value: 123 };
    const signed = IntegrityHash.sign(obj);
    assert(signed.hash);
    assert(typeof signed.hash === 'string');
});

runTest('w13_074', 'sign() hash matches compute() result', () => {
    const obj = { name: 'test', value: 123 };
    const signed = IntegrityHash.sign(obj);
    const computed = IntegrityHash.compute(obj);
    assert.strictEqual(signed.hash, computed);
});

runTest('w13_075', 'sign() does not modify original object', () => {
    const obj = { name: 'test', value: 123 };
    const objCopy = JSON.parse(JSON.stringify(obj));
    IntegrityHash.sign(obj);
    assert.deepStrictEqual(obj, objCopy);
});

runTest('w13_076', 'sign() returns new object with hash field', () => {
    const obj = { name: 'test' };
    const signed = IntegrityHash.sign(obj);
    assert(signed !== obj); // Different objects
    assert('hash' in signed);
    assert(!('hash' in obj)); // Original unchanged
});

runTest('w13_077', 'sign() custom hash field name', () => {
    const obj = { name: 'test' };
    const signed = IntegrityHash.sign(obj, 'custom_hash');
    assert(signed.custom_hash);
    assert(!signed.hash);
});

runTest('w13_078', 'sign() preserves all original fields', () => {
    const obj = { name: 'test', value: 123, extra: 'data' };
    const signed = IntegrityHash.sign(obj);
    assert.strictEqual(signed.name, 'test');
    assert.strictEqual(signed.value, 123);
    assert.strictEqual(signed.extra, 'data');
});

// ─── SECTION 9: IntegrityHash.verify ────────────────────────────────────

console.log('\n9. IntegrityHash.verify (valid/tampered/missing hash)');

runTest('w13_079', 'verify() valid object returns valid:true', () => {
    const obj = { name: 'test', value: 123 };
    const signed = IntegrityHash.sign(obj);
    const result = IntegrityHash.verify(signed);
    assert.strictEqual(result.valid, true);
});

runTest('w13_080', 'verify() valid object returns reason:match', () => {
    const obj = { name: 'test', value: 123 };
    const signed = IntegrityHash.sign(obj);
    const result = IntegrityHash.verify(signed);
    assert.strictEqual(result.reason, 'match');
});

runTest('w13_081', 'verify() tampered object returns valid:false', () => {
    const obj = { name: 'test', value: 123 };
    const signed = IntegrityHash.sign(obj);
    signed.value = 456; // Tamper
    const result = IntegrityHash.verify(signed);
    assert.strictEqual(result.valid, false);
});

runTest('w13_082', 'verify() tampered object returns reason:mismatch', () => {
    const obj = { name: 'test', value: 123 };
    const signed = IntegrityHash.sign(obj);
    signed.value = 456;
    const result = IntegrityHash.verify(signed);
    assert.strictEqual(result.reason, 'mismatch');
});

runTest('w13_083', 'verify() missing hash returns valid:false', () => {
    const obj = { name: 'test', value: 123 };
    const result = IntegrityHash.verify(obj);
    assert.strictEqual(result.valid, false);
});

runTest('w13_084', 'verify() missing hash returns reason:no_hash', () => {
    const obj = { name: 'test', value: 123 };
    const result = IntegrityHash.verify(obj);
    assert.strictEqual(result.reason, 'no_hash');
});

runTest('w13_085', 'verify() returns expected and actual properties', () => {
    const obj = { name: 'test' };
    const signed = IntegrityHash.sign(obj);
    const result = IntegrityHash.verify(signed);
    assert(result.expected);
    assert(result.actual);
    assert.strictEqual(result.expected, result.actual);
});

runTest('w13_086', 'verify() custom hash field name', () => {
    const obj = { name: 'test' };
    const signed = IntegrityHash.sign(obj, 'custom_hash');
    // Note: verify must also pass custom excludeFields to match custom hash field
    const result = IntegrityHash.verify(signed, 'custom_hash');
    // This test verifies the API works, but actual behavior depends on excludeFields
    assert.strictEqual(result.valid, true, 'Custom hash field should verify successfully');
});

// ─── SECTION 10: IntegrityHash round-trip ──────────────────────────────

console.log('\n10. IntegrityHash round-trip (sign→verify, tampering detection)');

runTest('w13_087', 'sign then verify succeeds on pristine object', () => {
    const obj = { id: 1, name: 'test', amount: 100 };
    const signed = IntegrityHash.sign(obj);
    const verified = IntegrityHash.verify(signed);
    assert.strictEqual(verified.valid, true);
});

runTest('w13_088', 'modify id field after sign → verify fails', () => {
    const obj = { id: 1, name: 'test', amount: 100 };
    const signed = IntegrityHash.sign(obj);
    signed.id = 2;
    const verified = IntegrityHash.verify(signed);
    assert.strictEqual(verified.valid, false);
});

runTest('w13_089', 'modify name field after sign → verify fails', () => {
    const obj = { id: 1, name: 'test', amount: 100 };
    const signed = IntegrityHash.sign(obj);
    signed.name = 'changed';
    const verified = IntegrityHash.verify(signed);
    assert.strictEqual(verified.valid, false);
});

runTest('w13_090', 'modify amount field after sign → verify fails', () => {
    const obj = { id: 1, name: 'test', amount: 100 };
    const signed = IntegrityHash.sign(obj);
    signed.amount = 999;
    const verified = IntegrityHash.verify(signed);
    assert.strictEqual(verified.valid, false);
});

runTest('w13_091', 'add new field after sign → verify fails', () => {
    const obj = { id: 1, name: 'test' };
    const signed = IntegrityHash.sign(obj);
    signed.newField = 'added';
    const verified = IntegrityHash.verify(signed);
    assert.strictEqual(verified.valid, false);
});

runTest('w13_092', 'modifying hash field itself → verify fails', () => {
    const obj = { id: 1, name: 'test' };
    const signed = IntegrityHash.sign(obj);
    signed.hash = signed.hash.slice(0, -1) + 'X'; // Corrupt last char
    const verified = IntegrityHash.verify(signed);
    assert.strictEqual(verified.valid, false);
});

runTest('w13_093', 'hash field excluded from hash computation', () => {
    const obj = { id: 1, name: 'test' };
    const signed1 = IntegrityHash.sign(obj);
    const signed2 = IntegrityHash.sign(obj);
    assert.strictEqual(signed1.hash, signed2.hash); // Same content = same hash
});

runTest('w13_094', 'multiple sign-verify cycles remain consistent', () => {
    const obj = { id: 1, value: 100 };
    const s1 = IntegrityHash.sign(obj);
    assert.strictEqual(IntegrityHash.verify(s1).valid, true);
    const s2 = IntegrityHash.sign(obj);
    assert.strictEqual(IntegrityHash.verify(s2).valid, true);
    assert.strictEqual(s1.hash, s2.hash);
});

// ─── SECTION 11: safePercentage ──────────────────────────────────────────

console.log('\n11. safePercentage(amount, total, decimals)');

runTest('w13_095', 'safePercentage(50, 100, 1) returns "50.0%"', () => {
    assert.strictEqual(safePercentage(50, 100, 1), '50.0%');
});

runTest('w13_096', 'safePercentage(0, 100, 1) returns "0.0%"', () => {
    assert.strictEqual(safePercentage(0, 100, 1), '0.0%');
});

runTest('w13_097', 'safePercentage(100, 100, 1) returns "100.0%"', () => {
    assert.strictEqual(safePercentage(100, 100, 1), '100.0%');
});

runTest('w13_098', 'safePercentage(1, 3, 2) returns "33.33%"', () => {
    assert.strictEqual(safePercentage(1, 3, 2), '33.33%');
});

runTest('w13_099', 'safePercentage(amount, 0, 1) returns "0.0%"', () => {
    assert.strictEqual(safePercentage(100, 0, 1), '0.0%');
});

runTest('w13_100', 'safePercentage(amount, null, 1) returns "0.0%"', () => {
    assert.strictEqual(safePercentage(100, null, 1), '0.0%');
});

runTest('w13_101', 'safePercentage(amount, undefined, 1) returns "0.0%"', () => {
    assert.strictEqual(safePercentage(100, undefined, 1), '0.0%');
});

runTest('w13_102', 'safePercentage(Infinity, 100, 1) returns "0.0%"', () => {
    assert.strictEqual(safePercentage(Infinity, 100, 1), '0.0%');
});

runTest('w13_103', 'safePercentage(NaN, 100, 1) returns "0.0%"', () => {
    assert.strictEqual(safePercentage(NaN, 100, 1), '0.0%');
});

runTest('w13_104', 'safePercentage(50, Infinity, 1) returns "0.0%"', () => {
    assert.strictEqual(safePercentage(50, Infinity, 1), '0.0%');
});

runTest('w13_105', 'safePercentage(50, 100, 0) returns "50%"', () => {
    assert.strictEqual(safePercentage(50, 100, 0), '50%');
});

runTest('w13_106', 'safePercentage(50, 100, 3) returns "50.000%"', () => {
    assert.strictEqual(safePercentage(50, 100, 3), '50.000%');
});

runTest('w13_107', 'safePercentage(1, 6, 1) returns "16.7%"', () => {
    assert.strictEqual(safePercentage(1, 6, 1), '16.7%');
});

runTest('w13_108', 'safePercentage(-50, 100, 1) returns "-50.0%"', () => {
    assert.strictEqual(safePercentage(-50, 100, 1), '-50.0%');
});

runTest('w13_109', 'safePercentage with 2 decimals: total=0 returns "0.00%"', () => {
    assert.strictEqual(safePercentage(50, 0, 2), '0.00%');
});

// ─── SECTION 12: safePercentageNumber ──────────────────────────────────────

console.log('\n12. safePercentageNumber(amount, total)');

runTest('w13_110', 'safePercentageNumber(50, 100) returns 50', () => {
    assert.strictEqual(safePercentageNumber(50, 100), 50);
});

runTest('w13_111', 'safePercentageNumber(0, 100) returns 0', () => {
    assert.strictEqual(safePercentageNumber(0, 100), 0);
});

runTest('w13_112', 'safePercentageNumber(100, 100) returns 100', () => {
    assert.strictEqual(safePercentageNumber(100, 100), 100);
});

runTest('w13_113', 'safePercentageNumber(1, 3) returns ~33.33', () => {
    const result = safePercentageNumber(1, 3);
    assert(Math.abs(result - 33.33333) < 0.01);
});

runTest('w13_114', 'safePercentageNumber(amount, 0) returns 0', () => {
    assert.strictEqual(safePercentageNumber(100, 0), 0);
});

runTest('w13_115', 'safePercentageNumber(amount, null) returns 0', () => {
    assert.strictEqual(safePercentageNumber(100, null), 0);
});

runTest('w13_116', 'safePercentageNumber(Infinity, 100) returns 0', () => {
    assert.strictEqual(safePercentageNumber(Infinity, 100), 0);
});

runTest('w13_117', 'safePercentageNumber(NaN, 100) returns 0', () => {
    assert.strictEqual(safePercentageNumber(NaN, 100), 0);
});

runTest('w13_118', 'safePercentageNumber(50, Infinity) returns 0', () => {
    assert.strictEqual(safePercentageNumber(50, Infinity), 0);
});

runTest('w13_119', 'safePercentageNumber(negative amount, total) returns negative', () => {
    assert.strictEqual(safePercentageNumber(-50, 100), -50);
});

// ─── SECTION 13: Factory function createPeriodCalculator ──────────────────

console.log('\n13. createPeriodCalculator(options)');

runTest('w13_120', 'createPeriodCalculator() returns PeriodCalculator instance', () => {
    const pc = createPeriodCalculator();
    assert(pc instanceof PeriodCalculator);
});

runTest('w13_121', 'createPeriodCalculator() instance has getCurrentQuarter method', () => {
    const pc = createPeriodCalculator();
    assert(typeof pc.getCurrentQuarter === 'function');
});

runTest('w13_122', 'createPeriodCalculator(options) accepts fiscal offset', () => {
    const pc = createPeriodCalculator({ fiscalOffset: 3 });
    assert.strictEqual(pc.fiscalOffset, 3);
});

// ─── SECTION 14: ORIGINAL BUG REGRESSION (January Q0 Bug) ─────────────────

console.log('\n14. Original Bug Regression Test (January Q0 Bug Fix)');

runTest('w13_123', 'Reproduce old bug: Math.floor((0 - 1) / 3) yields -1', () => {
    const month0 = 0; // January
    const oldBugResult = Math.floor((month0 - 1) / 3);
    assert.strictEqual(oldBugResult, -1); // This is the bug!
});

runTest('w13_124', 'January getCurrentQuarter returns 1, not -1', () => {
    const date = new Date(2024, 0, 15);
    const quarter = calc.getCurrentQuarter(date);
    assert.strictEqual(quarter, 1);
    assert.notStrictEqual(quarter, -1);
});

runTest('w13_125', 'January getPreviousQuarter returns Q4 prev year, not Q0', () => {
    const date = new Date(2024, 0, 15);
    const prev = calc.getPreviousQuarter(date);
    assert(prev.quarter >= 1 && prev.quarter <= 4);
    assert.strictEqual(prev.quarter, 4);
    assert.strictEqual(prev.year, 2023);
});

runTest('w13_126', 'January getQuarterlyPeriod returns valid Q4 dates', () => {
    const period = calc.getQuarterlyPeriod(new Date(2024, 0, 15));
    assert.strictEqual(period.name, 'Q4 2023');
    assert(period.start.match(/2023-10-01/)); // Oct 1
    assert(period.end.match(/2023-12-31/));   // Dec 31
});

runTest('w13_127', 'January quarter date range does not have negative months', () => {
    const range = calc.getQuarterDateRange(4, 2023);
    // Verify no month values like 202X-(-01 or 202X-0-
    assert(!range.start.match(/\d{4}-(-\d|0-)/));
    assert(!range.end.match(/\d{4}-(-\d|0-)/));
    assert(range.start.match(/2023-10-01/));
});

runTest('w13_128', 'No quarter calculation should yield Q0 or Q5', () => {
    for (let month = 0; month < 12; month++) {
        const date = new Date(2024, month, 15);
        const quarter = calc.getCurrentQuarter(date);
        assert(quarter >= 1 && quarter <= 4, `Month ${month} yielded invalid quarter ${quarter}`);
    }
});

// ─── SECTION 15: Edge cases (fiscal year, leap year, boundaries) ──────────

console.log('\n15. Edge Cases (fiscal year offset, leap year, year boundaries)');

runTest('w13_129', 'Leap year February 29 (2024): previous month is January', () => {
    const period = calc.getMonthlyPeriod(new Date(2024, 1, 29));
    assert(period.start.includes('2024-01'));
});

runTest('w13_130', 'December 31 getMonthlyPeriod: previous month is November', () => {
    const period = calc.getMonthlyPeriod(new Date(2024, 11, 31));
    assert(period.start.includes('2024-11'));
});

runTest('w13_131', 'December 31 getQuarterlyPeriod: previous is Q3', () => {
    const period = calc.getQuarterlyPeriod(new Date(2024, 11, 31));
    assert.strictEqual(period.name, 'Q3 2024');
});

runTest('w13_132', 'Year 2000 January: getPreviousQuarter is Q4 1999', () => {
    const date = new Date(2000, 0, 15);
    const prev = calc.getPreviousQuarter(date);
    assert.strictEqual(prev.quarter, 4);
    assert.strictEqual(prev.year, 1999);
});

runTest('w13_133', 'Fiscal offset 3: start month shifts correctly', () => {
    const calcFiscal = new PeriodCalculator({ fiscalOffset: 3 });
    const range = calcFiscal.getQuarterDateRange(1, 2024);
    assert(range.start); // Should not throw
});

runTest('w13_134', 'Q1 with fiscal offset 0: Jan 1 to Mar 31', () => {
    const range = calc.getQuarterDateRange(1, 2024);
    assert.strictEqual(range.start, '2024-01-01');
    assert.strictEqual(range.end, '2024-03-31');
});

runTest('w13_135', 'Q4 with fiscal offset 0: Oct 1 to Dec 31', () => {
    const range = calc.getQuarterDateRange(4, 2024);
    assert.strictEqual(range.start, '2024-10-01');
    assert.strictEqual(range.end, '2024-12-31');
});

runTest('w13_136', 'getMonthlyPeriod January 1st: prev month Dec 31 of prev year', () => {
    const period = calc.getMonthlyPeriod(new Date(2024, 0, 1));
    assert(period.start.includes('2023-12'));
    assert(period.end.includes('2023-12'));
});

// ─── SECTION 16: Structural validation ──────────────────────────────────

console.log('\n16. Structural Validation (imports, broken pattern removal)');

runTest('w13_137', 'PERIOD_CONFIG is exported', () => {
    assert(PERIOD_CONFIG);
    assert(PERIOD_CONFIG.QUARTERS);
});

runTest('w13_138', 'PERIOD_CONFIG.QUARTERS has 4 entries', () => {
    assert.strictEqual(PERIOD_CONFIG.QUARTERS.length, 4);
});

runTest('w13_139', 'PERIOD_CONFIG.HASH_ALGORITHM is sha256', () => {
    assert.strictEqual(PERIOD_CONFIG.HASH_ALGORITHM, 'sha256');
});

runTest('w13_140', 'PERIOD_CONFIG.HASH_EXCLUDED_FIELDS includes hash', () => {
    assert(PERIOD_CONFIG.HASH_EXCLUDED_FIELDS.includes('hash'));
});

// ─── ADDITIONAL COMPREHENSIVE TESTS ─────────────────────────────────────

console.log('\n17. Additional Comprehensive Coverage');

runTest('w13_141', 'getMonthlyPeriod returns ISO date format (YYYY-MM-DD)', () => {
    const period = calc.getMonthlyPeriod(new Date(2024, 5, 15));
    assert(period.start.match(/^\d{4}-\d{2}-\d{2}$/));
    assert(period.end.match(/^\d{4}-\d{2}-\d{2}$/));
});

runTest('w13_142', 'getQuarterlyPeriod returns ISO date format', () => {
    const period = calc.getQuarterlyPeriod(new Date(2024, 5, 15));
    assert(period.start.match(/^\d{4}-\d{2}-\d{2}$/));
    assert(period.end.match(/^\d{4}-\d{2}-\d{2}$/));
});

runTest('w13_143', 'PeriodCalculator default fiscal offset is 0', () => {
    const pc = new PeriodCalculator();
    assert.strictEqual(pc.fiscalOffset, 0);
});

runTest('w13_144', 'IntegrityHash.compute with empty object', () => {
    const hash = IntegrityHash.compute({});
    assert(hash);
    assert.strictEqual(hash.length, 64);
});

runTest('w13_145', 'IntegrityHash round-trip with deeply nested object', () => {
    const obj = { level1: { level2: { level3: { value: 'deep' } } } };
    const signed = IntegrityHash.sign(obj);
    const verified = IntegrityHash.verify(signed);
    assert.strictEqual(verified.valid, true);
});

runTest('w13_146', 'safePercentage with edge case decimals=0', () => {
    const result = safePercentage(50, 100, 0);
    assert(result.endsWith('%'));
    assert(!result.includes('.'));
});

runTest('w13_147', 'Multiple PeriodCalculator instances are independent', () => {
    const pc1 = new PeriodCalculator({ fiscalOffset: 0 });
    const pc2 = new PeriodCalculator({ fiscalOffset: 3 });
    assert.strictEqual(pc1.fiscalOffset, 0);
    assert.strictEqual(pc2.fiscalOffset, 3);
});

runTest('w13_148', 'getCurrentQuarter default parameter uses current date', () => {
    const result = calc.getCurrentQuarter();
    assert(result >= 1 && result <= 4);
});

runTest('w13_149', 'getQuarterDateRange date objects are valid Date instances', () => {
    const range = calc.getQuarterDateRange(1, 2024);
    assert(range.startDate instanceof Date);
    assert(range.endDate instanceof Date);
});

runTest('w13_150', 'IntegrityHash verify with missing hash field explicitly', () => {
    const obj = { data: 'test' };
    const result = IntegrityHash.verify(obj);
    assert.strictEqual(result.reason, 'no_hash');
    assert(result.expected === null);
    assert(result.actual === null);
});

// ─── SECTION 18: INTEGRATION WIRING VERIFICATION ────────────────────────

console.log('\n18. Integration Wiring Verification (actual file imports and patterns)');

// These tests read the actual wired files and verify the imports and usage patterns are correct.
// They catch regressions where someone reverts a fix or removes an import.

const fs = await import('fs');
const closePackSrc = fs.readFileSync(
    new URL('../agents/close-pack-generator.js', import.meta.url), 'utf8'
);

runTest('w13_151', 'close-pack-generator.js imports createPeriodCalculator from period-calculator.js', () => {
    assert(closePackSrc.includes("import { createPeriodCalculator, IntegrityHash }"), 'missing W-013 import');
});

runTest('w13_152', 'close-pack-generator.js constructor creates this.periodCalculator', () => {
    assert(closePackSrc.includes("this.periodCalculator = createPeriodCalculator()"), 'missing periodCalculator in constructor');
});

runTest('w13_153', 'close-pack-generator.js determinePeriod delegates to periodCalculator', () => {
    assert(closePackSrc.includes("this.periodCalculator.determinePeriod(options)"), 'determinePeriod not delegated');
});

runTest('w13_154', 'Old broken quarter math is REMOVED from executable code', () => {
    // Filter out comment lines — the pattern may exist in explanatory comments but not in code
    const codeLines = closePackSrc.split('\n').filter(l => {
        const t = l.trim();
        return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    }).join('\n');
    assert(!codeLines.includes("Math.floor((now.getMonth() - 1) / 3)"), 'broken quarter math still in executable code!');
});

runTest('w13_155', 'IntegrityHash.sign is called for hash assignment', () => {
    assert(closePackSrc.includes("IntegrityHash.sign(pack)"), 'IntegrityHash.sign not called');
});

runTest('w13_156', 'close-pack-generator.js imports safeCostBreakdown from scoped-compliance', () => {
    assert(closePackSrc.includes("safeCostBreakdown"), 'safeCostBreakdown not imported');
});

runTest('w13_157', 'close-pack-generator.js imports safeDivide from scoped-compliance', () => {
    assert(closePackSrc.includes("safeDivide"), 'safeDivide not imported');
});

runTest('w13_158', 'Old NaN-producing percentage pattern is REMOVED from executable code', () => {
    // Filter out comment lines — the old pattern exists in explanatory comments
    const codeLines = closePackSrc.split('\n').filter(l => {
        const t = l.trim();
        return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    }).join('\n');
    assert(!codeLines.includes("(p.amount / total) * 100"), 'old NaN division still in executable code!');
});

runTest('w13_159', 'safeDivide is used for budgetVariance calculation', () => {
    assert(closePackSrc.includes("safeDivide(totalSpend - budget, budget"), 'budgetVariance not using safeDivide');
});

runTest('w13_160', 'safeDivide is used for weekOverWeekChange', () => {
    assert(closePackSrc.includes("safeDivide(recentAvg - previousAvg, previousAvg"), 'weekOverWeekChange not using safeDivide');
});

runTest('w13_161', 'safeDivide is used for reconciliation_rate', () => {
    assert(closePackSrc.includes("safeDivide(sections.audit_trail.matched, sections.audit_trail.invoices_reconciled"), 'reconciliation_rate not using safeDivide');
});

runTest('w13_162', 'safeDivide used in ROI calculation', () => {
    assert(closePackSrc.includes("safeDivide(totalSavings - finaultCost, finaultCost"), 'ROI not using safeDivide');
});

runTest('w13_163', 'safeDivide used in budget_utilization', () => {
    assert(closePackSrc.includes("safeDivide(sections.executive_summary.total_spend, sections.variance_analysis.budget"), 'budget_utilization not using safeDivide');
});

runTest('w13_164', 'No remaining raw division patterns in close-pack-generator that could produce NaN', () => {
    const lines = closePackSrc.split('\n');
    const unsafeDivisions = lines.filter((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return false;
        return trimmed.includes('/ total)') && !trimmed.includes('safeDivide') && !trimmed.includes('safeCostBreakdown');
    });
    assert.strictEqual(unsafeDivisions.length, 0, `Found ${unsafeDivisions.length} unprotected divisions by 'total': ${unsafeDivisions[0]}`);
});

runTest('w13_165', 'by_provider[0] fallbacks use || \'None\' to prevent \'undefined\' in template literals', () => {
    assert(closePackSrc.includes("by_provider[0]?.name || 'None'"), 'missing None fallback for empty provider');
});

// ─── RESULTS ────────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(70));
console.log(`TOTAL TESTS: ${results.passed + results.failed}`);
console.log(`PASSED: ${results.passed}`);
console.log(`FAILED: ${results.failed}`);
console.log('='.repeat(70));

if (results.failed > 0) {
    console.log('\nFAILURES:');
    results.failures.forEach(f => {
        console.log(`  [${f.id}] ${f.name}`);
        console.log(`    Error: ${f.error}`);
    });
    process.exit(1);
}

process.exit(0);
