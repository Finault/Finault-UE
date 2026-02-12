/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * W-010: ANOMALY PERSISTENCE SYSTEM
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Fixes: cost-intelligence.js detect_anomalies returns anomalies but NEVER
 * persists them to any database table. Detected anomalies vanish when the
 * response is consumed.
 *
 * This module provides:
 * - Persistent anomaly storage with fingerprint-based deduplication
 * - Anomaly lifecycle management (detected → acknowledged → investigating → resolved/dismissed)
 * - Feedback loop for false-positive tracking and learning
 * - Active anomaly querying and statistics
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─── Constants ───────────────────────────────────────────────────────────────

export const ANOMALY_STATUS = {
    DETECTED: 'detected',
    ACKNOWLEDGED: 'acknowledged',
    INVESTIGATING: 'investigating',
    RESOLVED: 'resolved',
    DISMISSED: 'dismissed'
};

export const ANOMALY_FEEDBACK = {
    TRUE_POSITIVE: 'true_positive',
    FALSE_POSITIVE: 'false_positive',
    INCONCLUSIVE: 'inconclusive'
};

// Valid status transitions
const VALID_TRANSITIONS = {
    detected: ['acknowledged', 'investigating', 'resolved', 'dismissed'],
    acknowledged: ['investigating', 'resolved', 'dismissed'],
    investigating: ['resolved', 'dismissed'],
    resolved: [],    // Terminal state
    dismissed: []    // Terminal state
};

export const PERSISTENCE_CONFIG = {
    deduplication: {
        windowMs: 3600000,         // 1 hour — anomalies within same hour with same fingerprint are dupes
        maxActivePerOrg: 500       // Cap active anomalies per org to prevent unbounded growth
    },
    retention: {
        resolvedDays: 90,          // Keep resolved anomalies for 90 days
        dismissedDays: 30          // Keep dismissed anomalies for 30 days
    }
};

// ─── AnomalyPersistence Class ────────────────────────────────────────────────

export class AnomalyPersistence {

    /**
     * @param {Object} supabase - Resilient Supabase client
     */
    constructor(supabase) {
        if (!supabase) {
            throw new Error('AnomalyPersistence requires a Supabase client');
        }
        this.supabase = supabase;
    }

    /**
     * Persist detected anomalies to the database with deduplication.
     *
     * For each anomaly:
     * 1. Compute fingerprint from method + index + severity + rounded value
     * 2. Check for existing anomaly with same fingerprint within dedup window
     * 3. If duplicate found: update occurrence_count and last_seen
     * 4. If new: INSERT with status='detected'
     *
     * @param {Array} anomalies - Array of anomaly objects from detectAnomalies()
     * @param {string} organizationId - Organization ID
     * @param {string} sourceAgent - Agent that detected the anomaly (e.g. 'cost-intelligence')
     * @param {Object} [context] - Additional context (interpretation, patterns, etc.)
     * @returns {Object} { persisted, deduplicated, errors, anomalyIds }
     */
    async persistAnomalies(anomalies, organizationId, sourceAgent, context = {}) {
        if (!anomalies || anomalies.length === 0) {
            return { persisted: 0, deduplicated: 0, errors: 0, anomalyIds: [] };
        }

        if (!organizationId) {
            return { persisted: 0, deduplicated: 0, errors: 0, anomalyIds: [], error: 'organizationId required' };
        }

        let persisted = 0;
        let deduplicated = 0;
        let errors = 0;
        const anomalyIds = [];

        for (const anomaly of anomalies) {
            try {
                const fingerprint = this.computeFingerprint(anomaly);
                const existing = await this._findDuplicate(fingerprint, organizationId);

                if (existing) {
                    // Update existing: increment occurrence_count and update last_seen
                    await this.supabase
                        .from('anomaly_records')
                        .update({
                            occurrence_count: (existing.occurrence_count || 1) + 1,
                            last_seen: new Date().toISOString(),
                            // Merge confidence upward (multiple detections = more confidence)
                            confidence: Math.min(0.99, Math.max(existing.confidence || 0, anomaly.confidence || 0.6))
                        })
                        .eq('id', existing.id);

                    anomalyIds.push(existing.id);
                    deduplicated++;
                } else {
                    // Insert new anomaly
                    const record = {
                        organization_id: organizationId,
                        fingerprint,
                        source_agent: sourceAgent,
                        status: ANOMALY_STATUS.DETECTED,
                        severity: anomaly.severity || 'warning',
                        confidence: anomaly.confidence || 0.6,
                        method: anomaly.method || (anomaly.methods ? anomaly.methods.join(',') : 'unknown'),
                        value: anomaly.value,
                        expected: anomaly.expected || null,
                        deviation: anomaly.deviation || anomaly.zscore || null,
                        timestamp: anomaly.timestamp || new Date().toISOString(),
                        detected_at: new Date().toISOString(),
                        last_seen: new Date().toISOString(),
                        occurrence_count: 1,
                        metadata: {
                            index: anomaly.index,
                            direction: anomaly.direction || null,
                            cusumValue: anomaly.cusumValue || null,
                            methods: anomaly.methods || null,
                            interpretation: context.interpretation || null
                        },
                        feedback: null,
                        resolved_at: null,
                        resolved_by: null,
                        resolution_notes: null
                    };

                    const { data, error } = await this.supabase
                        .from('anomaly_records')
                        .insert(record)
                        .select('id')
                        .single();

                    if (error) {
                        console.error('[AnomalyPersistence] Insert failed:', error.message);
                        errors++;
                    } else {
                        anomalyIds.push(data.id);
                        persisted++;
                    }
                }
            } catch (err) {
                console.error('[AnomalyPersistence] Error persisting anomaly:', err.message);
                errors++;
            }
        }

        return { persisted, deduplicated, errors, anomalyIds };
    }

    /**
     * Compute a fingerprint for deduplication.
     *
     * Fingerprint = method + severity + rounded_value + timestamp_bucket
     * (timestamp bucketed to nearest hour)
     *
     * @param {Object} anomaly - Anomaly object
     * @returns {string} - Fingerprint string
     */
    computeFingerprint(anomaly) {
        if (!anomaly) return 'unknown';

        const method = anomaly.method || (anomaly.methods ? anomaly.methods.sort().join('+') : 'unknown');
        const severity = anomaly.severity || 'warning';
        const value = anomaly.value !== undefined ? Math.round(anomaly.value * 100) / 100 : 0;

        // Bucket timestamp to nearest hour for dedup
        let timeBucket = 'no_timestamp';
        if (anomaly.timestamp) {
            const ts = new Date(anomaly.timestamp);
            if (!isNaN(ts.getTime())) {
                timeBucket = ts.toISOString().slice(0, 13); // YYYY-MM-DDTHH
            }
        }

        return `${method}:${severity}:${value}:${timeBucket}`;
    }

    /**
     * Transition an anomaly to a new status.
     *
     * Validates the transition is legal (e.g., can't go from resolved → detected).
     *
     * @param {string} anomalyId - Anomaly record ID
     * @param {string} newStatus - Target status from ANOMALY_STATUS
     * @param {Object} [options] - { resolvedBy, notes }
     * @returns {Object} { success, previousStatus, newStatus, error }
     */
    async transitionStatus(anomalyId, newStatus, options = {}) {
        if (!anomalyId) {
            return { success: false, error: 'anomalyId required' };
        }

        if (!Object.values(ANOMALY_STATUS).includes(newStatus)) {
            return { success: false, error: `Invalid status: ${newStatus}` };
        }

        // Fetch current status
        const { data: record } = await this.supabase
            .from('anomaly_records')
            .select('id, status')
            .eq('id', anomalyId)
            .single();

        if (!record) {
            return { success: false, error: 'Anomaly not found' };
        }

        const currentStatus = record.status;
        const allowed = VALID_TRANSITIONS[currentStatus] || [];

        if (!allowed.includes(newStatus)) {
            return {
                success: false,
                error: `Cannot transition from '${currentStatus}' to '${newStatus}'`,
                previousStatus: currentStatus
            };
        }

        const update = { status: newStatus };

        if (newStatus === ANOMALY_STATUS.RESOLVED || newStatus === ANOMALY_STATUS.DISMISSED) {
            update.resolved_at = new Date().toISOString();
            if (options.resolvedBy) update.resolved_by = options.resolvedBy;
            if (options.notes) update.resolution_notes = options.notes;
        }

        await this.supabase
            .from('anomaly_records')
            .update(update)
            .eq('id', anomalyId);

        return {
            success: true,
            previousStatus: currentStatus,
            newStatus
        };
    }

    /**
     * Record feedback on an anomaly (true positive, false positive, inconclusive).
     *
     * This drives the learning loop: future anomaly detection can adjust
     * confidence thresholds based on historical feedback rates.
     *
     * @param {string} anomalyId - Anomaly record ID
     * @param {string} feedback - One of ANOMALY_FEEDBACK values
     * @param {string} [feedbackBy] - User who provided feedback
     * @returns {Object} { success, error }
     */
    async addFeedback(anomalyId, feedback, feedbackBy = null) {
        if (!anomalyId) {
            return { success: false, error: 'anomalyId required' };
        }

        if (!Object.values(ANOMALY_FEEDBACK).includes(feedback)) {
            return { success: false, error: `Invalid feedback: ${feedback}. Must be one of: ${Object.values(ANOMALY_FEEDBACK).join(', ')}` };
        }

        const update = {
            feedback,
            feedback_by: feedbackBy,
            feedback_at: new Date().toISOString()
        };

        const { error } = await this.supabase
            .from('anomaly_records')
            .update(update)
            .eq('id', anomalyId);

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    }

    /**
     * Get all active (non-terminal) anomalies for an organization.
     *
     * Active = status NOT in [resolved, dismissed]
     *
     * @param {string} organizationId - Organization ID
     * @param {Object} [filters] - { severity, method, limit }
     * @returns {Array} Active anomaly records
     */
    async getActiveAnomalies(organizationId, filters = {}) {
        if (!organizationId) return [];

        let query = this.supabase
            .from('anomaly_records')
            .select('*')
            .eq('organization_id', organizationId)
            .not('status', 'in', '("resolved","dismissed")')
            .order('detected_at', { ascending: false });

        if (filters.severity) {
            query = query.eq('severity', filters.severity);
        }

        if (filters.method) {
            query = query.eq('method', filters.method);
        }

        if (filters.limit) {
            query = query.limit(filters.limit);
        }

        const { data } = await query;
        return data || [];
    }

    /**
     * Get anomaly statistics for an organization.
     *
     * @param {string} organizationId - Organization ID
     * @returns {Object} { total, bySeverity, byStatus, byFeedback, falsePositiveRate }
     */
    async getAnomalyStats(organizationId) {
        if (!organizationId) {
            return { total: 0, bySeverity: {}, byStatus: {}, byFeedback: {}, falsePositiveRate: 0 };
        }

        const { data } = await this.supabase
            .from('anomaly_records')
            .select('severity, status, feedback')
            .eq('organization_id', organizationId);

        const records = data || [];

        const bySeverity = {};
        const byStatus = {};
        const byFeedback = {};
        let fpCount = 0;
        let feedbackCount = 0;

        for (const r of records) {
            bySeverity[r.severity] = (bySeverity[r.severity] || 0) + 1;
            byStatus[r.status] = (byStatus[r.status] || 0) + 1;
            if (r.feedback) {
                byFeedback[r.feedback] = (byFeedback[r.feedback] || 0) + 1;
                feedbackCount++;
                if (r.feedback === ANOMALY_FEEDBACK.FALSE_POSITIVE) fpCount++;
            }
        }

        return {
            total: records.length,
            bySeverity,
            byStatus,
            byFeedback,
            falsePositiveRate: feedbackCount > 0 ? fpCount / feedbackCount : 0
        };
    }

    // ─── Private Helpers ─────────────────────────────────────────────────────

    /**
     * Find existing anomaly with same fingerprint within dedup window.
     * @private
     */
    async _findDuplicate(fingerprint, organizationId) {
        const windowStart = new Date(Date.now() - PERSISTENCE_CONFIG.deduplication.windowMs).toISOString();

        const { data } = await this.supabase
            .from('anomaly_records')
            .select('id, occurrence_count, confidence')
            .eq('organization_id', organizationId)
            .eq('fingerprint', fingerprint)
            .gte('detected_at', windowStart)
            .not('status', 'in', '("resolved","dismissed")')
            .order('detected_at', { ascending: false })
            .limit(1)
            .single();

        return data || null;
    }
}

// ─── Factory Function ───────────────────────────────────────────────────────

export function createAnomalyPersistence(supabase) {
    return new AnomalyPersistence(supabase);
}
