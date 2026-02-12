/**
 * BUDGET PATTERN TRACKER (W-014)
 * Correct action-string matching and real RPM measurement for budget enforcement
 *
 * PROBLEMS FIXED:
 * 1. budget-enforcer.js line 492: decision.action === 'hard_block' checks for a value
 *    that doesn't exist. Actual checkBudget() returns 'BLOCK', 'THROTTLE', 'ALERT', 'ALLOW'.
 *    Pattern memory for recurring overspend is dead code — never fires.
 *
 * 2. budget-enforcer.js line 399: current_rpm: 60 is hardcoded instead of measuring
 *    actual request rate. Teams see misleading RPM data in throttle actions.
 *
 * SOLUTION:
 * 1. Canonical action constants + mapping from all known variants to canonical form.
 *    Pattern storage triggered by canonical BLOCK action.
 * 2. Sliding-window RPM tracker that measures actual requests per minute per team/key.
 */

// ─── CANONICAL ACTION CONSTANTS ─────────────────────────────────────────────

export const BUDGET_ACTIONS = {
    BLOCK: 'BLOCK',
    THROTTLE: 'THROTTLE',
    ALERT: 'ALERT',
    ALLOW: 'ALLOW'
};

/**
 * Map from any known action string variant to canonical form.
 * This is the fix for the 'hard_block' !== 'BLOCK' bug.
 */
const ACTION_ALIASES = {
    // Canonical (uppercase)
    'BLOCK': BUDGET_ACTIONS.BLOCK,
    'THROTTLE': BUDGET_ACTIONS.THROTTLE,
    'ALERT': BUDGET_ACTIONS.ALERT,
    'ALLOW': BUDGET_ACTIONS.ALLOW,

    // Lowercase variants
    'block': BUDGET_ACTIONS.BLOCK,
    'throttle': BUDGET_ACTIONS.THROTTLE,
    'alert': BUDGET_ACTIONS.ALERT,
    'allow': BUDGET_ACTIONS.ALLOW,

    // Snake_case variants (the bug that caused W-014)
    'hard_block': BUDGET_ACTIONS.BLOCK,
    'hard_cap': BUDGET_ACTIONS.BLOCK,
    'soft_block': BUDGET_ACTIONS.THROTTLE,
    'rate_limit': BUDGET_ACTIONS.THROTTLE,
    'soft_cap': BUDGET_ACTIONS.ALERT,
    'warning': BUDGET_ACTIONS.ALERT,
    'pass': BUDGET_ACTIONS.ALLOW,
    'ok': BUDGET_ACTIONS.ALLOW,

    // Other possible variants
    'HARD_BLOCK': BUDGET_ACTIONS.BLOCK,
    'HARD_CAP': BUDGET_ACTIONS.BLOCK,
    'BLOCKED': BUDGET_ACTIONS.BLOCK,
    'DENIED': BUDGET_ACTIONS.BLOCK,
    'THROTTLED': BUDGET_ACTIONS.THROTTLE,
    'RATE_LIMITED': BUDGET_ACTIONS.THROTTLE,
    'WARNED': BUDGET_ACTIONS.ALERT,
    'ALLOWED': BUDGET_ACTIONS.ALLOW,
    'PASSED': BUDGET_ACTIONS.ALLOW
};

/**
 * Normalize any action string to canonical form
 */
export function normalizeAction(action) {
    if (!action) return null;
    return ACTION_ALIASES[action] || ACTION_ALIASES[action.toUpperCase()] || action.toUpperCase();
}

/**
 * Check if an action represents a block (budget exceeded, hard cap hit)
 */
export function isBlockAction(action) {
    return normalizeAction(action) === BUDGET_ACTIONS.BLOCK;
}

/**
 * Check if an action represents throttling
 */
export function isThrottleAction(action) {
    return normalizeAction(action) === BUDGET_ACTIONS.THROTTLE;
}

// ─── RPM TRACKER ────────────────────────────────────────────────────────────

export const RPM_CONFIG = {
    WINDOW_MS: 60_000,       // 1 minute sliding window
    BUCKET_MS: 5_000,        // 5-second buckets within window
    MAX_BUCKETS: 12,         // 60s / 5s = 12 buckets
    CLEANUP_INTERVAL: 30_000 // Cleanup stale entries every 30s
};

/**
 * Sliding-window RPM tracker.
 * Replaces hardcoded `current_rpm: 60` with actual measurement.
 *
 * Uses time-bucketed counters for O(1) increment, O(buckets) read.
 */
export class RPMTracker {
    constructor(config = {}) {
        this.windowMs = config.windowMs || RPM_CONFIG.WINDOW_MS;
        this.bucketMs = config.bucketMs || RPM_CONFIG.BUCKET_MS;
        this.maxBuckets = config.maxBuckets || RPM_CONFIG.MAX_BUCKETS;

        // Map<key, Array<{timestamp, count}>>
        this.buckets = new Map();
    }

    /**
     * Record a request for a given key (team, api_key, org)
     */
    record(key) {
        const now = Date.now();
        const bucketTimestamp = this._bucketize(now);

        if (!this.buckets.has(key)) {
            this.buckets.set(key, []);
        }

        const keyBuckets = this.buckets.get(key);
        const lastBucket = keyBuckets.length > 0 ? keyBuckets[keyBuckets.length - 1] : null;

        if (lastBucket && lastBucket.timestamp === bucketTimestamp) {
            lastBucket.count++;
        } else {
            keyBuckets.push({ timestamp: bucketTimestamp, count: 1 });
            // Trim old buckets
            this._trimBuckets(keyBuckets, now);
        }
    }

    /**
     * Get current RPM for a key
     * Returns actual measured requests-per-minute
     */
    getCurrentRPM(key) {
        const now = Date.now();
        const cutoff = now - this.windowMs;

        const keyBuckets = this.buckets.get(key);
        if (!keyBuckets || keyBuckets.length === 0) {
            return 0;
        }

        let totalRequests = 0;
        let oldestRelevant = now;

        for (const bucket of keyBuckets) {
            if (bucket.timestamp >= cutoff) {
                totalRequests += bucket.count;
                if (bucket.timestamp < oldestRelevant) {
                    oldestRelevant = bucket.timestamp;
                }
            }
        }

        if (totalRequests === 0) return 0;

        // Scale to per-minute rate
        const windowSpan = now - oldestRelevant;
        if (windowSpan <= 0) {
            // All requests in same bucket — extrapolate
            return totalRequests * (this.windowMs / this.bucketMs);
        }

        return Math.round((totalRequests / windowSpan) * this.windowMs);
    }

    /**
     * Get RPM stats for a key
     */
    getStats(key) {
        const rpm = this.getCurrentRPM(key);
        const keyBuckets = this.buckets.get(key) || [];
        const now = Date.now();
        const cutoff = now - this.windowMs;

        const activeBuckets = keyBuckets.filter(b => b.timestamp >= cutoff);
        const totalRequests = activeBuckets.reduce((sum, b) => sum + b.count, 0);

        return {
            current_rpm: rpm,
            requests_in_window: totalRequests,
            active_buckets: activeBuckets.length,
            window_ms: this.windowMs
        };
    }

    /**
     * Remove stale entries across all keys
     */
    cleanup() {
        const now = Date.now();
        const cutoff = now - this.windowMs;

        for (const [key, keyBuckets] of this.buckets.entries()) {
            this._trimBuckets(keyBuckets, now);
            if (keyBuckets.length === 0) {
                this.buckets.delete(key);
            }
        }
    }

    /**
     * Get all tracked keys
     */
    getTrackedKeys() {
        return Array.from(this.buckets.keys());
    }

    /**
     * Clear all data
     */
    reset() {
        this.buckets.clear();
    }

    // ─── PRIVATE ────────────────────────────────────────────────────────

    _bucketize(timestamp) {
        return Math.floor(timestamp / this.bucketMs) * this.bucketMs;
    }

    _trimBuckets(keyBuckets, now) {
        const cutoff = now - this.windowMs;
        while (keyBuckets.length > 0 && keyBuckets[0].timestamp < cutoff) {
            keyBuckets.shift();
        }
        // Also enforce max bucket count
        while (keyBuckets.length > this.maxBuckets) {
            keyBuckets.shift();
        }
    }
}

// ─── BUDGET PATTERN TRACKER ─────────────────────────────────────────────────

export const PATTERN_CONFIG = {
    // Minimum block events before flagging as recurring
    RECURRING_THRESHOLD: 3,
    // Time window to consider for recurring detection
    RECURRING_WINDOW_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
    // Maximum patterns to retain per org
    MAX_PATTERNS_PER_ORG: 1000
};

/**
 * BudgetPatternTracker — fixes the dead pattern-storage code in budget-enforcer.js
 *
 * The original code at line 492 checked `decision.action === 'hard_block'` but
 * checkBudget() only ever returns 'BLOCK'. This class:
 * 1. Uses normalizeAction() to accept any variant
 * 2. Tracks patterns for BLOCK events with team/model context
 * 3. Detects recurring overspend patterns
 */
export class BudgetPatternTracker {
    constructor(config = {}) {
        this.recurringThreshold = config.recurringThreshold || PATTERN_CONFIG.RECURRING_THRESHOLD;
        this.recurringWindowMs = config.recurringWindowMs || PATTERN_CONFIG.RECURRING_WINDOW_MS;
        this.maxPatterns = config.maxPatterns || PATTERN_CONFIG.MAX_PATTERNS_PER_ORG;

        // In-memory pattern store: Map<orgKey, Array<PatternEvent>>
        this.events = new Map();
    }

    /**
     * Should this decision trigger pattern storage?
     * Uses normalizeAction to fix the 'hard_block' !== 'BLOCK' bug.
     */
    shouldTrackPattern(decision) {
        if (!decision || !decision.action) return false;
        const canonical = normalizeAction(decision.action);
        return canonical === BUDGET_ACTIONS.BLOCK;
    }

    /**
     * Record a budget enforcement event
     */
    recordEvent(decision, context = {}) {
        const canonical = normalizeAction(decision.action);
        const orgKey = context.organizationId || 'default';

        if (!this.events.has(orgKey)) {
            this.events.set(orgKey, []);
        }

        const events = this.events.get(orgKey);
        events.push({
            action: canonical,
            team: context.team || 'unknown',
            model: context.model || 'unknown',
            timestamp: Date.now(),
            reason: decision.reason || null,
            spend: context.spend || null
        });

        // Trim to max
        while (events.length > this.maxPatterns) {
            events.shift();
        }
    }

    /**
     * Detect recurring overspend patterns for an org
     * Returns array of { team, model, count, message, severity }
     */
    detectRecurringPatterns(organizationId) {
        const events = this.events.get(organizationId) || [];
        const cutoff = Date.now() - this.recurringWindowMs;
        const recentBlocks = events.filter(
            e => e.action === BUDGET_ACTIONS.BLOCK && e.timestamp >= cutoff
        );

        // Group by team+model
        const groups = {};
        for (const event of recentBlocks) {
            const key = `${event.team}::${event.model}`;
            if (!groups[key]) {
                groups[key] = { team: event.team, model: event.model, count: 0, events: [] };
            }
            groups[key].count++;
            groups[key].events.push(event);
        }

        // Find recurring patterns (count >= threshold)
        const patterns = [];
        for (const group of Object.values(groups)) {
            if (group.count >= this.recurringThreshold) {
                patterns.push({
                    team: group.team,
                    model: group.model,
                    count: group.count,
                    severity: group.count >= this.recurringThreshold * 2 ? 'CRITICAL' : 'HIGH',
                    message: `Team ${group.team} hit hard cap using ${group.model} ${group.count} times in the last ${Math.round(this.recurringWindowMs / 86400000)} days. This is a recurring overspend pattern.`,
                    firstOccurrence: new Date(group.events[0].timestamp).toISOString(),
                    lastOccurrence: new Date(group.events[group.events.length - 1].timestamp).toISOString()
                });
            }
        }

        return patterns.sort((a, b) => b.count - a.count);
    }

    /**
     * Get summary stats for an org
     */
    getSummary(organizationId) {
        const events = this.events.get(organizationId) || [];
        const cutoff = Date.now() - this.recurringWindowMs;
        const recent = events.filter(e => e.timestamp >= cutoff);

        const byAction = {};
        for (const event of recent) {
            byAction[event.action] = (byAction[event.action] || 0) + 1;
        }

        return {
            total_events: recent.length,
            by_action: byAction,
            recurring_patterns: this.detectRecurringPatterns(organizationId),
            window_days: Math.round(this.recurringWindowMs / 86400000)
        };
    }

    /**
     * Clear events for an org
     */
    clearEvents(organizationId) {
        this.events.delete(organizationId);
    }

    /**
     * Clear all events
     */
    reset() {
        this.events.clear();
    }
}

// ─── FACTORY ────────────────────────────────────────────────────────────────

export function createBudgetPatternTracker(config = {}) {
    return new BudgetPatternTracker(config);
}

export function createRPMTracker(config = {}) {
    return new RPMTracker(config);
}

export default BudgetPatternTracker;
