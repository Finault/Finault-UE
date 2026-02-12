/**
 * PERIOD CALCULATOR (W-013)
 * Correct fiscal period calculation with integrity verification
 *
 * PROBLEMS FIXED:
 * 1. close-pack-generator.js line 166: Math.floor((now.getMonth() - 1) / 3) yields -1 in January
 *    producing Q0 with invalid date ranges that span negative months
 * 2. close-pack-generator.js lines 125-128: Integrity hash computed with hash=null then stored
 *    with the actual hash — re-verification always fails because the input changed
 *
 * SOLUTION:
 * 1. Correct quarter calculation: previous quarter = current quarter - 1, wrapping Q1→Q4 of prev year
 * 2. Hash-then-store pattern: hash computed over content WITHOUT the hash field, stored separately
 *    and verified by re-hashing the same content-only payload
 */

import crypto from 'crypto';

// ─── CONFIGURATION ──────────────────────────────────────────────────────────

export const PERIOD_CONFIG = {
    // Quarter boundaries (0-indexed months)
    QUARTERS: [
        { quarter: 1, startMonth: 0, endMonth: 2 },   // Q1: Jan-Mar
        { quarter: 2, startMonth: 3, endMonth: 5 },   // Q2: Apr-Jun
        { quarter: 3, startMonth: 6, endMonth: 8 },    // Q3: Jul-Sep
        { quarter: 4, startMonth: 9, endMonth: 11 }    // Q4: Oct-Dec
    ],
    // Fiscal year offset (0 = calendar year, 3 = fiscal year starts April)
    DEFAULT_FISCAL_OFFSET: 0,
    // Hash algorithm
    HASH_ALGORITHM: 'sha256',
    // Fields excluded from integrity hash (the hash itself must be excluded)
    HASH_EXCLUDED_FIELDS: ['hash', 'integrity_hash']
};

// ─── PERIOD CALCULATOR ──────────────────────────────────────────────────────

export class PeriodCalculator {
    constructor(options = {}) {
        this.fiscalOffset = options.fiscalOffset || PERIOD_CONFIG.DEFAULT_FISCAL_OFFSET;
    }

    /**
     * Get current quarter number (1-4) for a given date
     */
    getCurrentQuarter(date = new Date()) {
        const month = date.getMonth(); // 0-11
        return Math.floor(month / 3) + 1; // 1-4
    }

    /**
     * Get previous quarter info with proper year wrapping
     * This is the FIX for the January bug:
     * - January (month 0) → current Q1 → previous is Q4 of PREVIOUS YEAR
     * - April (month 3) → current Q2 → previous is Q1 of SAME YEAR
     */
    getPreviousQuarter(date = new Date()) {
        const currentQuarter = this.getCurrentQuarter(date);
        const currentYear = date.getFullYear();

        if (currentQuarter === 1) {
            // Wrap: Q1 → previous is Q4 of last year
            return { quarter: 4, year: currentYear - 1 };
        }
        return { quarter: currentQuarter - 1, year: currentYear };
    }

    /**
     * Get date range for a specific quarter and year
     */
    getQuarterDateRange(quarter, year) {
        if (quarter < 1 || quarter > 4) {
            throw new Error(`Invalid quarter: ${quarter}. Must be 1-4.`);
        }

        const qConfig = PERIOD_CONFIG.QUARTERS[quarter - 1];
        const adjustedStartMonth = (qConfig.startMonth + this.fiscalOffset) % 12;
        const adjustedYear = adjustedStartMonth < qConfig.startMonth ? year + 1 : year;

        const start = new Date(adjustedYear, adjustedStartMonth, 1);
        // End = first day of next month, minus 1 day (last day of end month)
        const endMonth = (qConfig.endMonth + this.fiscalOffset) % 12;
        const endYear = endMonth < qConfig.endMonth ? year + 1 : year;
        const end = new Date(endYear, endMonth + 1, 0); // Day 0 of next month = last day of this month

        return {
            start: start.toISOString().split('T')[0],
            end: end.toISOString().split('T')[0],
            startDate: start,
            endDate: end
        };
    }

    /**
     * Determine reporting period — the CORRECT replacement for close-pack-generator.determinePeriod
     */
    determinePeriod(options = {}, referenceDate = new Date()) {
        if (options.period === 'monthly' || !options.period) {
            return this.getMonthlyPeriod(referenceDate);
        }

        if (options.period === 'quarterly') {
            return this.getQuarterlyPeriod(referenceDate);
        }

        if (options.start_date && options.end_date) {
            return {
                type: 'custom',
                name: `${options.start_date} to ${options.end_date}`,
                start: options.start_date,
                end: options.end_date
            };
        }

        // Fallback: default to monthly
        return this.getMonthlyPeriod(referenceDate);
    }

    /**
     * Get previous month period
     */
    getMonthlyPeriod(referenceDate = new Date()) {
        const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1);
        const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 0);

        return {
            type: 'monthly',
            name: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
            start: start.toISOString().split('T')[0],
            end: end.toISOString().split('T')[0]
        };
    }

    /**
     * Get previous quarter period — THE FIX
     * Old code: Math.floor((now.getMonth() - 1) / 3) → -1 in January
     * New code: proper wrapping via getPreviousQuarter()
     */
    getQuarterlyPeriod(referenceDate = new Date()) {
        const { quarter, year } = this.getPreviousQuarter(referenceDate);
        const dateRange = this.getQuarterDateRange(quarter, year);

        return {
            type: 'quarterly',
            name: `Q${quarter} ${year}`,
            start: dateRange.start,
            end: dateRange.end
        };
    }
}

// ─── INTEGRITY HASH ─────────────────────────────────────────────────────────

export class IntegrityHash {
    /**
     * Compute integrity hash over an object, EXCLUDING the hash field itself.
     * This fixes the close-pack-generator bug where hash was computed with hash=null
     * then stored with hash=<actual>, making re-verification impossible.
     *
     * Pattern: hash = SHA256(objectWithoutHashField)
     * Verify: recompute SHA256(objectWithoutHashField) === storedHash
     */
    static compute(obj, excludeFields = PERIOD_CONFIG.HASH_EXCLUDED_FIELDS) {
        // Create a copy without excluded fields
        const hashInput = {};
        for (const [key, value] of Object.entries(obj)) {
            if (!excludeFields.includes(key)) {
                hashInput[key] = value;
            }
        }

        // Deterministic JSON: sort keys to ensure same order
        const serialized = JSON.stringify(hashInput, Object.keys(hashInput).sort());

        return crypto
            .createHash(PERIOD_CONFIG.HASH_ALGORITHM)
            .update(serialized)
            .digest('hex');
    }

    /**
     * Compute hash and attach it to the object
     * Returns the object with hash field set
     */
    static sign(obj, hashField = 'hash') {
        // FIX: Exclude the custom hash field name from computation
        const excludeFields = [...new Set([...PERIOD_CONFIG.HASH_EXCLUDED_FIELDS, hashField])];
        const hash = IntegrityHash.compute(obj, excludeFields);
        return { ...obj, [hashField]: hash };
    }

    /**
     * Verify the integrity of an object against its stored hash
     * Returns { valid: boolean, expected: string, actual: string }
     */
    static verify(obj, hashField = 'hash') {
        const storedHash = obj[hashField];
        if (!storedHash) {
            return { valid: false, reason: 'no_hash', expected: null, actual: null };
        }

        // FIX: Exclude the custom hash field name from computation
        const excludeFields = [...new Set([...PERIOD_CONFIG.HASH_EXCLUDED_FIELDS, hashField])];
        const computedHash = IntegrityHash.compute(obj, excludeFields);

        return {
            valid: computedHash === storedHash,
            expected: storedHash,
            actual: computedHash,
            reason: computedHash === storedHash ? 'match' : 'mismatch'
        };
    }
}

// ─── SAFE PERCENTAGE ────────────────────────────────────────────────────────

/**
 * Compute percentage safely, returning '0.0%' when total is 0 instead of NaN%.
 * This fixes close-pack-generator lines 387-399 where (amount / 0) produces NaN.
 */
export function safePercentage(amount, total, decimals = 1) {
    if (!total || total === 0 || !isFinite(total)) {
        return `0.${'0'.repeat(decimals)}%`;
    }
    if (!isFinite(amount)) {
        return `0.${'0'.repeat(decimals)}%`;
    }
    return ((amount / total) * 100).toFixed(decimals) + '%';
}

/**
 * Compute percentage as a number safely
 */
export function safePercentageNumber(amount, total) {
    if (!total || total === 0 || !isFinite(total) || !isFinite(amount)) {
        return 0;
    }
    return (amount / total) * 100;
}

// ─── FACTORY ────────────────────────────────────────────────────────────────

export function createPeriodCalculator(options = {}) {
    return new PeriodCalculator(options);
}

export default PeriodCalculator;
