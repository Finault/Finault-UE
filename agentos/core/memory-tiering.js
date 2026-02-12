/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * W-007: MEMORY TIERING SYSTEM
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Fixes flat 0.98 decay rate that destroys long-term intelligence.
 * Three-tier system:
 * - WORKING: 5% daily decay, 30-day TTL (transient data)
 * - EPISODIC: 0.5% daily decay, reinforced on recall, graduates to Crystallized
 * - CRYSTALLIZED: NO decay, validated patterns (permanent)
 *
 * Also provides SeasonalPatternStore for tracking patterns by time granularity.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─── Constants ───────────────────────────────────────────────────────────────

export const MEMORY_TIERS = {
    WORKING: 'working',
    EPISODIC: 'episodic',
    CRYSTALLIZED: 'crystallized'
};

export const TIER_CONFIG = {
    working: {
        decayRate: 0.95,            // 5% daily decay
        ttlDays: 30,               // Auto-delete after 30 days
        minImportance: 0.05,       // Floor importance
        requiresReinforcement: false
    },
    episodic: {
        decayRate: 0.995,          // 0.5% daily decay
        ttlDays: null,             // No auto-delete TTL
        minImportance: 0.15,       // Higher floor than working
        requiresReinforcement: true,
        reinforcementBoost: 0.1,   // +0.1 per recall
        maxReinforcementPerDay: 3  // Cap reinforcement frequency
    },
    crystallized: {
        decayRate: 1.0,            // NO decay
        ttlDays: null,             // Never auto-delete
        minImportance: 0.3,        // High floor
        requiresReinforcement: false
    }
};

// Memory types eligible for crystallization (validated permanent knowledge)
const CRYSTALLIZABLE_TYPES = ['insight', 'pattern', 'fact', 'decision'];

// Graduation requirements
const GRADUATION_CONFIG = {
    minValidationCount: 3,     // Must be validated at least 3 times
    minImportance: 0.8,        // Must have high importance
    mustBeCrystallizableType: true
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ─── MemoryTiering Class ─────────────────────────────────────────────────────

export class MemoryTiering {

    /**
     * Determine which tier a memory belongs to.
     *
     * Classification logic:
     * - CRYSTALLIZED: importance >= 0.9 AND type in CRYSTALLIZABLE_TYPES AND validation_count >= 3
     * - EPISODIC: importance >= 0.6
     * - WORKING: everything else
     *
     * @param {Object} memory - Memory record from agent_memory table
     * @param {number} memory.importance - Current importance (0.0-1.0)
     * @param {string} memory.memory_type - One of MEMORY_TYPES values
     * @param {number} [memory.validation_count] - Times validated by compound-learning
     * @returns {string} - One of MEMORY_TIERS values
     */
    classifyTier(memory) {
        if (!memory) return MEMORY_TIERS.WORKING;

        const importance = memory.importance || 0;
        const memoryType = memory.memory_type || '';
        const validationCount = memory.validation_count || 0;

        // Check CRYSTALLIZED conditions
        if (
            importance >= 0.9 &&
            CRYSTALLIZABLE_TYPES.includes(memoryType) &&
            validationCount >= GRADUATION_CONFIG.minValidationCount
        ) {
            return MEMORY_TIERS.CRYSTALLIZED;
        }

        // Check EPISODIC threshold
        if (importance >= 0.6) {
            return MEMORY_TIERS.EPISODIC;
        }

        // Default: WORKING
        return MEMORY_TIERS.WORKING;
    }

    /**
     * Compute new importance after tier-specific decay.
     *
     * Uses date-based exponential decay:
     *   newImportance = importance * decayRate^daysSinceLastDecay
     *
     * CRYSTALLIZED tier returns importance unchanged (decayRate = 1.0).
     *
     * @param {Object} memory - Memory record
     * @param {number} memory.importance - Current importance
     * @param {string} memory.created_at - ISO timestamp
     * @param {string} [memory.last_decay_date] - ISO timestamp of last decay
     * @param {string} tier - Tier name from MEMORY_TIERS
     * @param {Date|string|null} [lastDecayDate] - Override for last decay computation
     * @returns {number} - New importance clamped to [tier.minImportance, 1.0]
     */
    computeDecay(memory, tier, lastDecayDate = null) {
        if (!memory || typeof memory.importance !== 'number') return 0;

        const tierConfig = TIER_CONFIG[tier];
        if (!tierConfig) return memory.importance;

        // Crystallized: no decay
        if (tierConfig.decayRate === 1.0) {
            return memory.importance;
        }

        // Determine reference date for decay
        let refDate;
        if (lastDecayDate) {
            refDate = lastDecayDate instanceof Date ? lastDecayDate : new Date(lastDecayDate);
        } else if (memory.last_decay_date) {
            refDate = new Date(memory.last_decay_date);
        } else if (memory.created_at) {
            refDate = new Date(memory.created_at);
        } else {
            return memory.importance;
        }

        const now = Date.now();
        const daysPassed = Math.max(0, Math.floor((now - refDate.getTime()) / MS_PER_DAY));

        if (daysPassed === 0) return memory.importance;

        // Apply exponential decay
        const decayed = memory.importance * Math.pow(tierConfig.decayRate, daysPassed);

        // Clamp to [minImportance, 1.0]
        return Math.max(tierConfig.minImportance, Math.min(1.0, decayed));
    }

    /**
     * Determine if a memory should be auto-deleted.
     *
     * Rules by tier:
     * - WORKING: importance < minImportance AND age > ttlDays (30)
     * - EPISODIC: importance < minImportance AND age > 365 days
     * - CRYSTALLIZED: NEVER auto-delete
     *
     * @param {Object} memory - Memory record
     * @param {string} tier - Tier name
     * @returns {boolean} - True if memory should be deleted
     */
    shouldDelete(memory, tier) {
        if (!memory) return false;

        const tierConfig = TIER_CONFIG[tier];
        if (!tierConfig) return false;

        // Crystallized: never delete
        if (tier === MEMORY_TIERS.CRYSTALLIZED) {
            return false;
        }

        const importance = memory.importance || 0;
        const createdAt = memory.created_at ? new Date(memory.created_at) : new Date();
        const ageDays = Math.floor((Date.now() - createdAt.getTime()) / MS_PER_DAY);

        if (tier === MEMORY_TIERS.WORKING) {
            return importance < tierConfig.minImportance && ageDays > tierConfig.ttlDays;
        }

        if (tier === MEMORY_TIERS.EPISODIC) {
            // Episodic: only delete if very low importance AND very old
            return importance < tierConfig.minImportance && ageDays > 365;
        }

        return false;
    }

    /**
     * Boost importance when memory is recalled (reinforcement learning).
     *
     * Only applies to EPISODIC tier memories (and promotes WORKING → EPISODIC indirectly).
     * Boost: +0.1 (configurable), capped at 1.0.
     *
     * @param {Object} memory - Memory record
     * @param {number} memory.importance - Current importance
     * @returns {number} - New importance after boost
     */
    reinforceOnRecall(memory) {
        if (!memory || typeof memory.importance !== 'number') return 0;

        // Pass 23: Respect stored tier from DB first. Graduated CRYSTALLIZED
        // memories may have importance < 0.9 (below classifyTier threshold)
        // but must NEVER be boosted. The DB tier is authoritative.
        if (memory.memory_tier === MEMORY_TIERS.CRYSTALLIZED) {
            return memory.importance;
        }

        // Bug fix (Pass 21): Only reinforce EPISODIC tier memories.
        // WORKING tier memories should NOT get boosted on recall.
        // CRYSTALLIZED memories already have max importance protection.
        const tier = this.classifyTier(memory);
        if (tier !== MEMORY_TIERS.EPISODIC) {
            return memory.importance; // Return unchanged for non-episodic
        }

        // Enforce maxReinforcementPerDay (Pass 21): prevent unlimited boosting
        if (memory._reinforcementCountToday >= TIER_CONFIG.episodic.maxReinforcementPerDay) {
            return memory.importance; // Already hit daily cap
        }

        const boost = TIER_CONFIG.episodic.reinforcementBoost;
        return Math.min(1.0, memory.importance + boost);
    }

    /**
     * Check if an EPISODIC memory should graduate to CRYSTALLIZED.
     *
     * Requirements:
     * 1. Current tier must be EPISODIC (or would classify as episodic)
     * 2. validation_count >= 3
     * 3. importance >= 0.8
     * 4. memory_type in CRYSTALLIZABLE_TYPES
     *
     * @param {Object} memory - Memory record
     * @param {number} [validationCount] - Number of times validated
     * @returns {boolean} - True if memory should graduate
     */
    checkGraduation(memory, validationCount = 0) {
        if (!memory) return false;

        const importance = memory.importance || 0;
        const memoryType = memory.memory_type || '';
        const currentTier = this.classifyTier(memory);

        // Must currently be EPISODIC
        if (currentTier !== MEMORY_TIERS.EPISODIC) {
            return false;
        }

        // Check all graduation conditions
        return (
            validationCount >= GRADUATION_CONFIG.minValidationCount &&
            importance >= GRADUATION_CONFIG.minImportance &&
            CRYSTALLIZABLE_TYPES.includes(memoryType)
        );
    }

    /**
     * Extract seasonal patterns from timestamped observations.
     *
     * Groups observations by time granularity and computes seasonal indices:
     * - index > 1.0 means above-average activity for that bucket
     * - index < 1.0 means below-average
     *
     * @param {Array} events - Array of { timestamp, value, [metadata] }
     * @param {string} [granularity='day_of_week'] - 'day_of_week', 'month', 'quarter', 'hour'
     * @returns {Object} { granularity, indices, labels, confidence, significance }
     */
    getSeasonalPatterns(events, granularity = 'day_of_week') {
        if (!events || events.length === 0) {
            return {
                granularity,
                indices: [],
                labels: [],
                confidence: 0,
                significance: false
            };
        }

        const buckets = this._groupByGranularity(events, granularity);
        const labels = this._getLabels(granularity);

        // Compute mean value per bucket
        const bucketMeans = {};
        const bucketCounts = {};
        let totalSum = 0;
        let totalCount = 0;

        for (const [bucket, values] of Object.entries(buckets)) {
            const sum = values.reduce((a, b) => a + b, 0);
            bucketMeans[bucket] = sum / values.length;
            bucketCounts[bucket] = values.length;
            totalSum += sum;
            totalCount += values.length;
        }

        const globalMean = totalCount > 0 ? totalSum / totalCount : 1;

        // Compute seasonal indices (ratio to global mean)
        const indices = labels.map((label, i) => {
            const mean = bucketMeans[i] || bucketMeans[label];
            if (mean === undefined || globalMean === 0) return 1.0;
            return mean / globalMean;
        });

        // Compute confidence based on sample size per bucket
        const minSamples = Object.values(bucketCounts).length > 0
            ? Math.min(...Object.values(bucketCounts))
            : 0;
        const avgSamples = totalCount / labels.length;
        const confidence = Math.min(1.0, avgSamples / 10); // Cap at 10 samples per bucket

        // Check significance: variance of indices > 0.05
        const indexVariance = this._variance(indices);
        const significance = indexVariance > 0.05 && avgSamples >= 2;

        return {
            granularity,
            indices,
            labels,
            confidence,
            significance
        };
    }

    // ─── Private Helpers ─────────────────────────────────────────────────────

    _groupByGranularity(events, granularity) {
        const buckets = {};

        for (const event of events) {
            const date = new Date(event.timestamp);
            if (isNaN(date.getTime())) continue;

            let bucket;
            switch (granularity) {
                case 'day_of_week':
                    bucket = date.getDay(); // 0=Sun, 6=Sat
                    break;
                case 'month':
                    bucket = date.getMonth(); // 0=Jan, 11=Dec
                    break;
                case 'quarter':
                    bucket = Math.floor(date.getMonth() / 3); // 0=Q1, 3=Q4
                    break;
                case 'hour':
                    bucket = date.getHours(); // 0-23
                    break;
                default:
                    bucket = 0;
            }

            if (!buckets[bucket]) buckets[bucket] = [];
            buckets[bucket].push(event.value || 0);
        }

        return buckets;
    }

    _getLabels(granularity) {
        switch (granularity) {
            case 'day_of_week':
                return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            case 'month':
                return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            case 'quarter':
                return ['Q1', 'Q2', 'Q3', 'Q4'];
            case 'hour':
                return Array.from({ length: 24 }, (_, i) => `${i}:00`);
            default:
                return [];
        }
    }

    _variance(arr) {
        if (arr.length === 0) return 0;
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        return arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
    }
}

// ─── SeasonalPatternStore ────────────────────────────────────────────────────

export class SeasonalPatternStore {
    /**
     * Track observations for seasonal pattern detection.
     *
     * @param {string} metricName - e.g., 'api_cost', 'request_volume'
     */
    constructor(metricName) {
        this.metricName = metricName;
        this.observations = [];
        this._tiering = new MemoryTiering();
    }

    /**
     * Record an observation for this metric.
     *
     * @param {number} value - Observed value
     * @param {Date|string|number} timestamp - When observed
     * @param {Object} [metadata] - Optional context
     */
    recordObservation(value, timestamp, metadata = {}) {
        if (typeof value !== 'number' || isNaN(value)) return;

        const ts = timestamp instanceof Date ? timestamp
                  : typeof timestamp === 'number' ? new Date(timestamp)
                  : new Date(timestamp);

        if (isNaN(ts.getTime())) return;

        this.observations.push({
            value,
            timestamp: ts,
            metadata,
            recorded_at: Date.now()
        });
    }

    /**
     * Get seasonal pattern for a specific granularity.
     *
     * @param {string} [granularity='day_of_week']
     * @returns {Object} Pattern with indices and confidence
     */
    getPattern(granularity = 'day_of_week') {
        return this._tiering.getSeasonalPatterns(this.observations, granularity);
    }

    /**
     * Auto-detect if metric exhibits seasonal behavior.
     *
     * Tests all granularities and returns the strongest.
     *
     * @returns {Object} { hasSeasonality, strongestGranularity, patterns }
     */
    detectSeasonality() {
        const granularities = ['day_of_week', 'month', 'quarter', 'hour'];
        const patterns = {};
        let strongest = null;
        let highestVariance = 0;

        for (const g of granularities) {
            const pattern = this.getPattern(g);
            patterns[g] = pattern;

            if (pattern.significance) {
                const variance = this._tiering._variance(pattern.indices);
                if (variance > highestVariance) {
                    highestVariance = variance;
                    strongest = g;
                }
            }
        }

        return {
            hasSeasonality: strongest !== null,
            strongestGranularity: strongest,
            patterns
        };
    }

    /**
     * Get the number of stored observations.
     * @returns {number}
     */
    get size() {
        return this.observations.length;
    }

    /**
     * Clear all stored observations.
     */
    clear() {
        this.observations = [];
    }
}

// ─── Factory Functions ───────────────────────────────────────────────────────

export function createMemoryTiering() {
    return new MemoryTiering();
}

export function createSeasonalPatternStore(metricName) {
    return new SeasonalPatternStore(metricName);
}
