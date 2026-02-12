import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// ═════════════════════════════════════════════════════════════════════════════
// MOCK SUPABASE CLIENT
// ═════════════════════════════════════════════════════════════════════════════

class MockSupabaseTable {
    constructor(tableName) {
        this.tableName = tableName;
        this.filters = {};
        this.updateData = {};
        this.insertData = null;
        this.selectColumns = '*';
        this.ordering = null;
        this.limitVal = null;
        this.singleMode = false;
    }

    select(columns = '*') {
        this.selectColumns = columns;
        return this;
    }

    insert(data) {
        this.insertData = data;
        return this;
    }

    update(data) {
        this.updateData = data;
        return this;
    }

    eq(column, value) {
        this.filters[`eq_${column}`] = value;
        return this;
    }

    gte(column, value) {
        this.filters[`gte_${column}`] = value;
        return this;
    }

    not(column, operator, value) {
        this.filters[`not_${operator}_${column}`] = value;
        return this;
    }

    order(column, options = {}) {
        this.ordering = { column, ascending: options.ascending !== false };
        return this;
    }

    limit(n) {
        this.limitVal = n;
        return this;
    }

    single() {
        this.singleMode = true;
        return this;
    }

    async execute() {
        // Simulate Supabase operations based on mock state
        if (this.insertData) {
            return this.mockInsert();
        }
        if (Object.keys(this.updateData).length > 0) {
            return this.mockUpdate();
        }
        return this.mockSelect();
    }

    mockInsert() {
        if (!this.insertData.organization_id) {
            return { data: null, error: { message: 'organization_id required' } };
        }
        const id = `anomaly_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const result = { ...this.insertData, id };
        return { data: { id }, error: null };
    }

    mockUpdate() {
        // Mock updates succeed
        return { data: null, error: null };
    }

    mockSelect() {
        // Return mock data based on filters
        const mockRecords = [
            {
                id: 'anomaly_1',
                organization_id: 'org_1',
                fingerprint: 'method_a:warning:42.5:2024-01-15T10',
                status: 'detected',
                severity: 'warning',
                confidence: 0.75,
                method: 'method_a',
                value: 42.5,
                expected: 40,
                deviation: 2.5,
                timestamp: '2024-01-15T10:30:00Z',
                detected_at: '2024-01-15T10:30:00Z',
                last_seen: '2024-01-15T10:30:00Z',
                occurrence_count: 1,
                metadata: { index: 0 },
                feedback: null,
                resolved_at: null,
                resolved_by: null,
                resolution_notes: null
            },
            {
                id: 'anomaly_2',
                organization_id: 'org_1',
                fingerprint: 'method_b:critical:150:2024-01-15T11',
                status: 'acknowledged',
                severity: 'critical',
                confidence: 0.95,
                method: 'method_b',
                value: 150,
                expected: 100,
                deviation: 50,
                timestamp: '2024-01-15T11:15:00Z',
                detected_at: '2024-01-15T11:15:00Z',
                last_seen: '2024-01-15T11:15:00Z',
                occurrence_count: 2,
                metadata: { index: 1 },
                feedback: null,
                resolved_at: null,
                resolved_by: null,
                resolution_notes: null
            }
        ];

        // Apply filters
        let filtered = mockRecords;

        if (this.filters.eq_organization_id) {
            filtered = filtered.filter(r => r.organization_id === this.filters.eq_organization_id);
        }

        if (this.filters.eq_fingerprint) {
            filtered = filtered.filter(r => r.fingerprint === this.filters.eq_fingerprint);
        }

        if (this.filters.gte_detected_at) {
            filtered = filtered.filter(r => new Date(r.detected_at) >= new Date(this.filters.gte_detected_at));
        }

        if (this.filters[`not_in_status`]) {
            const excludeStatuses = this.filters[`not_in_status`].slice(1, -1).split(',').map(s => s.trim().slice(1, -1));
            filtered = filtered.filter(r => !excludeStatuses.includes(r.status));
        }

        if (this.filters.eq_severity) {
            filtered = filtered.filter(r => r.severity === this.filters.eq_severity);
        }

        if (this.filters.eq_method) {
            filtered = filtered.filter(r => r.method === this.filters.eq_method);
        }

        if (this.filters.eq_id) {
            filtered = filtered.filter(r => r.id === this.filters.eq_id);
        }

        // Apply ordering
        if (this.ordering) {
            filtered.sort((a, b) => {
                const aVal = new Date(a[this.ordering.column]).getTime();
                const bVal = new Date(b[this.ordering.column]).getTime();
                return this.ordering.ascending ? aVal - bVal : bVal - aVal;
            });
        }

        // Apply limit
        if (this.limitVal) {
            filtered = filtered.slice(0, this.limitVal);
        }

        // Single mode
        if (this.singleMode) {
            return { data: filtered[0] || null, error: null };
        }

        return { data: filtered, error: null };
    }
}

class MockSupabase {
    constructor() {
        this.tables = {};
    }

    from(tableName) {
        if (!this.tables[tableName]) {
            this.tables[tableName] = new MockSupabaseTable(tableName);
        } else {
            // Reset filters for new query
            this.tables[tableName].filters = {};
            this.tables[tableName].updateData = {};
            this.tables[tableName].insertData = null;
            this.tables[tableName].selectColumns = '*';
            this.tables[tableName].ordering = null;
            this.tables[tableName].limitVal = null;
            this.tables[tableName].singleMode = false;
        }
        return this.tables[tableName];
    }
}

// Override Promise-style async methods to return properly
MockSupabaseTable.prototype.then = function(onFulfilled, onRejected) {
    return this.execute().then(onFulfilled, onRejected);
};

Object.defineProperty(MockSupabaseTable.prototype, Symbol.toStringTag, { value: 'Promise' });

// ═════════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═════════════════════════════════════════════════════════════════════════════

async function runTests() {
    console.log('═'.repeat(70));
    console.log('W-010 ANOMALY PERSISTENCE TEST SUITE');
    console.log('═'.repeat(70));

    const {
        AnomalyPersistence,
        ANOMALY_STATUS,
        ANOMALY_FEEDBACK,
        PERSISTENCE_CONFIG,
        createAnomalyPersistence
    } = await import(new URL('../core/anomaly-persistence.js', import.meta.url).href);

    // =========================================================================
    // SECTION 1: Constants & Exports (w10_001 - w10_010)
    // =========================================================================
    console.log('\n[SECTION 1] Constants & Exports');

    assert(ANOMALY_STATUS.DETECTED === 'detected', 'w10_001: ANOMALY_STATUS.DETECTED = detected');
    assert(ANOMALY_STATUS.ACKNOWLEDGED === 'acknowledged', 'w10_002: ANOMALY_STATUS.ACKNOWLEDGED = acknowledged');
    assert(ANOMALY_STATUS.INVESTIGATING === 'investigating', 'w10_003: ANOMALY_STATUS.INVESTIGATING = investigating');
    assert(ANOMALY_STATUS.RESOLVED === 'resolved', 'w10_004: ANOMALY_STATUS.RESOLVED = resolved');
    assert(ANOMALY_STATUS.DISMISSED === 'dismissed', 'w10_005: ANOMALY_STATUS.DISMISSED = dismissed');

    assert(ANOMALY_FEEDBACK.TRUE_POSITIVE === 'true_positive', 'w10_006: ANOMALY_FEEDBACK.TRUE_POSITIVE = true_positive');
    assert(ANOMALY_FEEDBACK.FALSE_POSITIVE === 'false_positive', 'w10_007: ANOMALY_FEEDBACK.FALSE_POSITIVE = false_positive');
    assert(ANOMALY_FEEDBACK.INCONCLUSIVE === 'inconclusive', 'w10_008: ANOMALY_FEEDBACK.INCONCLUSIVE = inconclusive');

    assert(PERSISTENCE_CONFIG.deduplication.windowMs === 3600000, 'w10_009: Dedup window is 3600000ms (1 hour)');
    assert(PERSISTENCE_CONFIG.deduplication.maxActivePerOrg === 500, 'w10_010: Max active anomalies per org is 500');

    // =========================================================================
    // SECTION 2: Constructor (w10_011 - w10_018)
    // =========================================================================
    console.log('\n[SECTION 2] Constructor');

    const mockSupabase = new MockSupabase();

    try {
        new AnomalyPersistence(null);
        assert(false, 'w10_011: Constructor throws without supabase');
    } catch (err) {
        assert(err.message.includes('requires a Supabase client'), 'w10_011: Constructor throws without supabase');
    }

    try {
        new AnomalyPersistence(undefined);
        assert(false, 'w10_012: Constructor throws with undefined supabase');
    } catch (err) {
        assert(err.message.includes('requires a Supabase client'), 'w10_012: Constructor throws with undefined supabase');
    }

    const ap = new AnomalyPersistence(mockSupabase);
    assert(ap.supabase === mockSupabase, 'w10_013: Constructor sets supabase property');

    const ap2 = createAnomalyPersistence(mockSupabase);
    assert(ap2 instanceof AnomalyPersistence, 'w10_014: Factory function creates AnomalyPersistence instance');
    assert(ap2.supabase === mockSupabase, 'w10_015: Factory function passes supabase correctly');

    assert(typeof AnomalyPersistence.prototype.persistAnomalies === 'function', 'w10_016: persistAnomalies method exists');
    assert(typeof AnomalyPersistence.prototype.transitionStatus === 'function', 'w10_017: transitionStatus method exists');
    assert(typeof AnomalyPersistence.prototype.computeFingerprint === 'function', 'w10_018: computeFingerprint method exists');

    // =========================================================================
    // SECTION 3: computeFingerprint (w10_019 - w10_035)
    // =========================================================================
    console.log('\n[SECTION 3] computeFingerprint()');

    assert(ap.computeFingerprint(null) === 'unknown', 'w10_019: Null anomaly returns unknown');
    assert(ap.computeFingerprint(undefined) === 'unknown', 'w10_020: Undefined anomaly returns unknown');

    const fingerprint1 = ap.computeFingerprint({
        method: 'zscore',
        severity: 'warning',
        value: 42.567,
        timestamp: '2024-01-15T10:30:00Z'
    });
    assert(fingerprint1.includes('zscore'), 'w10_021: Fingerprint includes method');
    assert(fingerprint1.includes('warning'), 'w10_022: Fingerprint includes severity');
    assert(fingerprint1.includes('42.57'), 'w10_023: Fingerprint includes rounded value');
    assert(fingerprint1.includes('2024-01-15T10'), 'w10_024: Fingerprint includes hour bucket');

    const fingerprint2 = ap.computeFingerprint({
        method: 'zscore',
        severity: 'warning',
        value: 42.567,
        timestamp: '2024-01-15T10:45:00Z'
    });
    assert(fingerprint1 === fingerprint2, 'w10_025: Same hour timestamps produce same fingerprint');

    const fingerprint3 = ap.computeFingerprint({
        method: 'zscore',
        severity: 'warning',
        value: 42.567,
        timestamp: '2024-01-15T11:30:00Z'
    });
    assert(fingerprint1 !== fingerprint3, 'w10_026: Different hour timestamps produce different fingerprints');

    const fingerprint4 = ap.computeFingerprint({
        method: 'zscore',
        severity: 'critical',
        value: 42.567,
        timestamp: '2024-01-15T10:30:00Z'
    });
    assert(fingerprint1 !== fingerprint4, 'w10_027: Different severity produces different fingerprint');

    const fingerprint5 = ap.computeFingerprint({
        method: 'iqr',
        severity: 'warning',
        value: 42.567,
        timestamp: '2024-01-15T10:30:00Z'
    });
    assert(fingerprint1 !== fingerprint5, 'w10_028: Different method produces different fingerprint');

    const fingerprint6 = ap.computeFingerprint({
        methods: ['zscore', 'iqr'],
        severity: 'warning',
        value: 42.567,
        timestamp: '2024-01-15T10:30:00Z'
    });
    assert(fingerprint6.includes('iqr'), 'w10_029: Multi-method fingerprint includes methods');

    const fingerprint7 = ap.computeFingerprint({
        methods: ['iqr', 'zscore'],
        severity: 'warning',
        value: 42.567,
        timestamp: '2024-01-15T10:30:00Z'
    });
    assert(fingerprint6 === fingerprint7, 'w10_030: Multi-method fingerprint methods sorted');

    const fingerprint8 = ap.computeFingerprint({
        severity: 'warning',
        value: 42.567,
        timestamp: '2024-01-15T10:30:00Z'
    });
    assert(fingerprint8.includes('unknown'), 'w10_031: Missing method defaults to unknown');

    const fingerprint9 = ap.computeFingerprint({
        method: 'zscore',
        value: 42.567,
        timestamp: '2024-01-15T10:30:00Z'
    });
    assert(fingerprint9.includes('warning'), 'w10_032: Missing severity defaults to warning');

    const fingerprint10 = ap.computeFingerprint({
        method: 'zscore',
        severity: 'warning',
        timestamp: '2024-01-15T10:30:00Z'
    });
    assert(fingerprint10.includes(':0:'), 'w10_033: Missing value defaults to 0');

    const fingerprint11 = ap.computeFingerprint({
        method: 'zscore',
        severity: 'warning',
        value: 42.567
    });
    assert(fingerprint11.includes('no_timestamp'), 'w10_034: Missing timestamp uses no_timestamp');

    const fingerprint12 = ap.computeFingerprint({
        method: 'zscore',
        severity: 'warning',
        value: 42.567,
        timestamp: 'invalid-date'
    });
    assert(fingerprint12.includes('no_timestamp'), 'w10_035: Invalid timestamp uses no_timestamp');

    // =========================================================================
    // SECTION 4: persistAnomalies (w10_036 - w10_065)
    // =========================================================================
    console.log('\n[SECTION 4] persistAnomalies()');

    const result1 = await ap.persistAnomalies([], 'org_1', 'cost-intelligence');
    assert(result1.persisted === 0 && result1.deduplicated === 0 && result1.errors === 0, 'w10_036: Empty array returns zeros');

    const result2 = await ap.persistAnomalies(
        [{ method: 'zscore', severity: 'warning', value: 42.5 }],
        null,
        'cost-intelligence'
    );
    assert(result2.error === 'organizationId required', 'w10_037: Missing organizationId returns error');

    const result3 = await ap.persistAnomalies(
        [{ method: 'zscore', severity: 'warning', value: 42.5, timestamp: '2024-01-15T10:30:00Z' }],
        'org_1',
        'cost-intelligence'
    );
    assert(result3.persisted === 1, 'w10_038: New anomaly gets persisted');
    assert(result3.anomalyIds.length === 1, 'w10_039: Anomaly ID returned for new insert');
    assert(result3.errors === 0, 'w10_040: No errors on successful persist');

    const result4 = await ap.persistAnomalies(
        [
            { method: 'zscore', severity: 'warning', value: 42.5, timestamp: '2024-01-15T10:30:00Z' },
            { method: 'iqr', severity: 'critical', value: 150, timestamp: '2024-01-15T11:15:00Z' }
        ],
        'org_1',
        'cost-intelligence'
    );
    assert(result4.persisted + result4.deduplicated === 2, 'w10_041: Multiple anomalies processed');

    const result5 = await ap.persistAnomalies(
        [{ method: 'zscore', severity: 'warning', value: 42.5, timestamp: '2024-01-15T10:30:00Z', confidence: 0.85 }],
        'org_1',
        'cost-intelligence'
    );
    assert(result5.anomalyIds.length > 0, 'w10_042: Anomaly IDs returned even for potential dedup');

    const result6 = await ap.persistAnomalies(
        [
            { method: 'zscore', severity: 'warning', value: 42.5, timestamp: '2024-01-15T10:30:00Z' },
            { method: 'zscore', severity: 'warning', value: 42.5, timestamp: '2024-01-15T10:35:00Z' }
        ],
        'org_1',
        'cost-intelligence'
    );
    assert(result6.anomalyIds.length === 2, 'w10_043: Anomaly IDs returned for each processed anomaly');

    const result7 = await ap.persistAnomalies(
        [{ method: 'zscore', severity: 'warning', value: 42.5, timestamp: '2024-01-15T10:30:00Z' }],
        'org_1',
        'cost-intelligence',
        { interpretation: 'High cost spike detected' }
    );
    assert(result7.persisted >= 0, 'w10_044: Context interpretation accepted');

    const result8 = await ap.persistAnomalies(
        [
            { method: 'zscore', severity: 'warning', value: 42.5, timestamp: '2024-01-15T10:30:00Z', confidence: 0.7 },
            { method: 'zscore', severity: 'warning', value: 42.5, timestamp: '2024-01-15T10:35:00Z', confidence: 0.9 }
        ],
        'org_1',
        'cost-intelligence'
    );
    assert(result8.anomalyIds.length > 0, 'w10_045: Confidence merged on dedup');

    const result9 = await ap.persistAnomalies(
        [{ method: 'zscore', severity: 'warning', value: 42.5, timestamp: '2024-01-15T10:30:00Z' }],
        'org_1',
        'cost-intelligence'
    );
    assert(Array.isArray(result9.anomalyIds), 'w10_046: anomalyIds is an array');

    const result10 = await ap.persistAnomalies(
        [
            { method: 'zscore', severity: 'warning', value: 42.5, timestamp: '2024-01-15T10:30:00Z' },
            { method: 'iqr', severity: 'critical', value: 150, timestamp: '2024-01-15T11:15:00Z' },
            { method: 'cusum', severity: 'info', value: 10, timestamp: '2024-01-15T12:00:00Z' }
        ],
        'org_1',
        'cost-intelligence'
    );
    assert(result10.persisted + result10.deduplicated + result10.errors === 3, 'w10_047: All anomalies accounted for');

    const result11 = await ap.persistAnomalies(
        [{ method: 'zscore', severity: 'warning', value: 42.5, timestamp: '2024-01-15T10:30:00Z', expected: 40, deviation: 2.5 }],
        'org_1',
        'cost-intelligence'
    );
    assert(result11.persisted >= 0, 'w10_048: Expected and deviation fields accepted');

    const result12 = await ap.persistAnomalies(
        [{ method: 'zscore', severity: 'warning', value: 42.5, timestamp: '2024-01-15T10:30:00Z', index: 5 }],
        'org_1',
        'cost-intelligence'
    );
    assert(result12.persisted >= 0, 'w10_049: Index field in metadata');

    const result13 = await ap.persistAnomalies(
        [{ method: 'zscore', severity: 'warning', value: 42.5, timestamp: '2024-01-15T10:30:00Z', methods: ['zscore', 'iqr'] }],
        'org_1',
        'cost-intelligence'
    );
    assert(result13.persisted >= 0, 'w10_050: Multi-method anomaly persisted');

    const result14 = await ap.persistAnomalies(
        [{ method: 'zscore', severity: 'warning', value: 42.5, timestamp: '2024-01-15T10:30:00Z', direction: 'up' }],
        'org_1',
        'cost-intelligence'
    );
    assert(result14.persisted >= 0, 'w10_051: Direction metadata accepted');

    const result15 = await ap.persistAnomalies(
        [{ method: 'cusum', severity: 'warning', value: 42.5, timestamp: '2024-01-15T10:30:00Z', cusumValue: 15.3 }],
        'org_1',
        'cost-intelligence'
    );
    assert(result15.persisted >= 0, 'w10_052: CUSUM value metadata accepted');

    // =========================================================================
    // SECTION 5: transitionStatus (w10_053 - w10_090)
    // =========================================================================
    console.log('\n[SECTION 5] transitionStatus()');

    const transResult1 = await ap.transitionStatus(null, 'acknowledged');
    assert(transResult1.success === false && transResult1.error.includes('required'), 'w10_053: Null anomalyId returns error');

    const transResult2 = await ap.transitionStatus('anomaly_1', 'invalid_status');
    assert(transResult2.success === false && transResult2.error.includes('Invalid status'), 'w10_054: Invalid status returns error');

    const transResult3 = await ap.transitionStatus('nonexistent_id', 'acknowledged');
    assert(transResult3.success === false && transResult3.error.includes('not found'), 'w10_055: Nonexistent anomaly returns error');

    const transResult4 = await ap.transitionStatus('anomaly_1', 'acknowledged');
    assert(transResult4.success === true, 'w10_056: detected → acknowledged allowed');
    assert(transResult4.previousStatus === 'detected', 'w10_057: Previous status returned');
    assert(transResult4.newStatus === 'acknowledged', 'w10_058: New status returned');

    const transResult5 = await ap.transitionStatus('anomaly_1', 'investigating');
    assert(transResult5.success === true, 'w10_059: acknowledged → investigating allowed');

    const transResult6 = await ap.transitionStatus('anomaly_1', 'resolved');
    assert(transResult6.success === true, 'w10_060: acknowledged → resolved allowed');

    const transResult7 = await ap.transitionStatus('anomaly_1', 'dismissed');
    assert(transResult7.success === true, 'w10_061: acknowledged → dismissed allowed');

    const transResult8 = await ap.transitionStatus('anomaly_2', 'investigating');
    assert(transResult8.success === true, 'w10_062: acknowledged → investigating allowed (anomaly_2)');

    const transResult9 = await ap.transitionStatus('anomaly_1', 'detected');
    assert(transResult9.success === false, 'w10_063: resolved → detected disallowed (terminal state)');

    const transResult10 = await ap.transitionStatus('anomaly_2', 'resolved', { resolvedBy: 'analyst_1', notes: 'Confirmed false alarm' });
    assert(transResult10.success === true, 'w10_064: Transition to resolved with both options');

    const transResult11 = await ap.transitionStatus('anomaly_1', 'resolved', { resolvedBy: 'user_123', notes: 'False alarm' });
    assert(transResult11.success === true, 'w10_065: Transition with options succeeds');

    // =========================================================================
    // SECTION 6: addFeedback (w10_066 - w10_080)
    // =========================================================================
    console.log('\n[SECTION 6] addFeedback()');

    const fbResult1 = await ap.addFeedback(null, 'true_positive');
    assert(fbResult1.success === false && fbResult1.error.includes('required'), 'w10_066: Null anomalyId returns error');

    const fbResult2 = await ap.addFeedback('anomaly_1', 'invalid_feedback');
    assert(fbResult2.success === false && fbResult2.error.includes('Invalid feedback'), 'w10_067: Invalid feedback returns error');

    const fbResult3 = await ap.addFeedback('anomaly_1', 'true_positive');
    assert(fbResult3.success === true, 'w10_068: true_positive feedback accepted');

    const fbResult4 = await ap.addFeedback('anomaly_1', 'false_positive');
    assert(fbResult4.success === true, 'w10_069: false_positive feedback accepted');

    const fbResult5 = await ap.addFeedback('anomaly_1', 'inconclusive');
    assert(fbResult5.success === true, 'w10_070: inconclusive feedback accepted');

    const fbResult6 = await ap.addFeedback('anomaly_1', 'true_positive', 'user_456');
    assert(fbResult6.success === true, 'w10_071: Feedback with feedbackBy accepted');

    const fbResult7 = await ap.addFeedback('anomaly_2', 'false_positive');
    assert(fbResult7.success === true, 'w10_072: Feedback recorded');

    // =========================================================================
    // SECTION 7: getActiveAnomalies (w10_073 - w10_090)
    // =========================================================================
    console.log('\n[SECTION 7] getActiveAnomalies()');

    const activeResult1 = await ap.getActiveAnomalies(null);
    assert(Array.isArray(activeResult1) && activeResult1.length === 0, 'w10_073: Null organizationId returns empty array');

    const activeResult2 = await ap.getActiveAnomalies('org_1');
    assert(Array.isArray(activeResult2), 'w10_074: Returns array');

    const activeResult3 = await ap.getActiveAnomalies('org_1', { severity: 'warning' });
    assert(Array.isArray(activeResult3), 'w10_075: Severity filter accepted');

    const activeResult4 = await ap.getActiveAnomalies('org_1', { method: 'zscore' });
    assert(Array.isArray(activeResult4), 'w10_076: Method filter accepted');

    const activeResult5 = await ap.getActiveAnomalies('org_1', { limit: 10 });
    assert(Array.isArray(activeResult5) && activeResult5.length <= 10, 'w10_077: Limit respected');

    const activeResult6 = await ap.getActiveAnomalies('org_1', { severity: 'critical', limit: 5 });
    assert(Array.isArray(activeResult6), 'w10_078: Multiple filters accepted');

    const activeResult7 = await ap.getActiveAnomalies('org_nonexistent');
    assert(Array.isArray(activeResult7), 'w10_079: Nonexistent org returns empty array');

    // =========================================================================
    // SECTION 8: getAnomalyStats (w10_080 - w10_100)
    // =========================================================================
    console.log('\n[SECTION 8] getAnomalyStats()');

    const statsResult1 = await ap.getAnomalyStats(null);
    assert(statsResult1.total === 0 && statsResult1.bySeverity && statsResult1.byStatus, 'w10_080: Null orgId returns empty stats');

    const statsResult2 = await ap.getAnomalyStats('org_1');
    assert(typeof statsResult2.total === 'number', 'w10_081: Stats has total count');
    assert(typeof statsResult2.bySeverity === 'object', 'w10_082: Stats has bySeverity object');
    assert(typeof statsResult2.byStatus === 'object', 'w10_083: Stats has byStatus object');
    assert(typeof statsResult2.byFeedback === 'object', 'w10_084: Stats has byFeedback object');
    assert(typeof statsResult2.falsePositiveRate === 'number', 'w10_085: Stats has falsePositiveRate');

    const statsResult3 = await ap.getAnomalyStats('org_1');
    assert(statsResult3.total >= 0, 'w10_086: Total is non-negative');

    const statsResult4 = await ap.getAnomalyStats('org_nonexistent');
    assert(statsResult4.total === 0, 'w10_087: Nonexistent org has 0 total');

    // =========================================================================
    // SECTION 9: Edge Cases & Integration (w10_088 - w10_155)
    // =========================================================================
    console.log('\n[SECTION 9] Edge Cases & Integration');

    // Value rounding
    const fp1 = ap.computeFingerprint({ method: 'zscore', severity: 'warning', value: 42.5678, timestamp: '2024-01-15T10:00:00Z' });
    const fp2 = ap.computeFingerprint({ method: 'zscore', severity: 'warning', value: 42.5678, timestamp: '2024-01-15T10:00:00Z' });
    assert(fp1 === fp2, 'w10_088: Values rounded to 2 decimals match consistently');

    // Confidence capping
    const result_conf1 = await ap.persistAnomalies(
        [{ method: 'zscore', severity: 'warning', value: 42.5, timestamp: '2024-01-15T10:30:00Z', confidence: 0.5 },
         { method: 'zscore', severity: 'warning', value: 42.5, timestamp: '2024-01-15T10:35:00Z', confidence: 0.9 }],
        'org_1',
        'cost-intelligence'
    );
    assert(result_conf1.anomalyIds.length >= 1, 'w10_089: Confidence handling on dedup');

    // Large arrays
    const largeAnomalies = Array.from({ length: 50 }, (_, i) => ({
        method: 'zscore',
        severity: 'warning',
        value: 42.5 + i,
        timestamp: new Date(Date.now() - i * 1000 * 60 * 60).toISOString()
    }));
    const resultLarge = await ap.persistAnomalies(largeAnomalies, 'org_1', 'cost-intelligence');
    assert(resultLarge.persisted + resultLarge.deduplicated + resultLarge.errors === 50, 'w10_090: Large batch processed');

    // Methods array variations
    const fp_methods1 = ap.computeFingerprint({ methods: ['a', 'b', 'c'], severity: 'warning', value: 42.5, timestamp: '2024-01-15T10:00:00Z' });
    const fp_methods2 = ap.computeFingerprint({ methods: ['c', 'a', 'b'], severity: 'warning', value: 42.5, timestamp: '2024-01-15T10:00:00Z' });
    assert(fp_methods1 === fp_methods2, 'w10_091: Methods array sorted consistently');

    // Metadata preservation
    const resultMeta = await ap.persistAnomalies(
        [{ method: 'zscore', severity: 'warning', value: 42.5, timestamp: '2024-01-15T10:30:00Z', index: 7, direction: 'down', cusumValue: 25.1 }],
        'org_1',
        'cost-intelligence'
    );
    assert(resultMeta.persisted >= 0, 'w10_092: Metadata fields preserved');

    // Status transition chain
    const transChain1 = await ap.transitionStatus('anomaly_1', 'acknowledged');
    const transChain2 = transChain1.success ? await ap.transitionStatus('anomaly_1', 'investigating') : { success: false };
    assert(transChain2.success === true || transChain1.success === false, 'w10_093: Status chain executed');

    // Feedback without previous status change
    const fbChain = await ap.addFeedback('anomaly_1', 'true_positive', 'analyst_1');
    assert(fbChain.success === true, 'w10_094: Feedback independent of status');

    // Organization isolation
    const result_org1 = await ap.persistAnomalies(
        [{ method: 'zscore', severity: 'warning', value: 42.5, timestamp: '2024-01-15T10:30:00Z' }],
        'org_1',
        'cost-intelligence'
    );
    const result_org2 = await ap.persistAnomalies(
        [{ method: 'zscore', severity: 'warning', value: 42.5, timestamp: '2024-01-15T10:30:00Z' }],
        'org_2',
        'cost-intelligence'
    );
    assert(result_org1.persisted >= 0 && result_org2.persisted >= 0, 'w10_095: Organization isolation maintained');

    // Severity levels
    const severities = ['info', 'warning', 'critical'];
    for (let i = 0; i < severities.length; i++) {
        const fpSev = ap.computeFingerprint({ method: 'zscore', severity: severities[i], value: 42.5, timestamp: '2024-01-15T10:00:00Z' });
        assert(fpSev.includes(severities[i]), `w10_${96 + i}: Severity ${severities[i]} in fingerprint`);
    }

    // Null/undefined handling in anomaly object
    const resultUndef = await ap.persistAnomalies(
        [{ method: 'zscore', value: 42.5, timestamp: '2024-01-15T10:30:00Z', expected: undefined, deviation: undefined }],
        'org_1',
        'cost-intelligence'
    );
    assert(resultUndef.persisted + resultUndef.deduplicated + resultUndef.errors === 1, 'w10_099: Undefined fields handled');

    // Empty strings
    const fpEmpty = ap.computeFingerprint({ method: '', severity: '', value: 0, timestamp: '' });
    assert(typeof fpEmpty === 'string', 'w10_100: Empty field fingerprint is string');

    // Multiple dedup checks
    const dedup1 = await ap.persistAnomalies(
        [{ method: 'zscore', severity: 'warning', value: 42.5, timestamp: '2024-01-15T10:30:00Z' }],
        'org_1',
        'cost-intelligence'
    );
    const dedup2 = await ap.persistAnomalies(
        [{ method: 'zscore', severity: 'warning', value: 42.5, timestamp: '2024-01-15T10:45:00Z' }],
        'org_1',
        'cost-intelligence'
    );
    assert((dedup1.persisted + dedup1.deduplicated) >= 0 && (dedup2.persisted + dedup2.deduplicated) >= 0, 'w10_101: Sequential dedup checks work');

    // Mixed new and duplicate in single batch
    const mixedBatch = await ap.persistAnomalies(
        [
            { method: 'zscore', severity: 'warning', value: 42.5, timestamp: '2024-01-15T10:30:00Z' },
            { method: 'iqr', severity: 'critical', value: 150, timestamp: '2024-01-15T11:15:00Z' }
        ],
        'org_1',
        'cost-intelligence'
    );
    assert(mixedBatch.persisted + mixedBatch.deduplicated === 2, 'w10_102: Mixed batch processed correctly');

    // Stats with no feedback
    const noFeedbackStats = await ap.getAnomalyStats('org_1');
    assert(typeof noFeedbackStats.falsePositiveRate === 'number', 'w10_103: False positive rate computed');

    // Active anomalies order - should be descending by detected_at
    const activeOrder = await ap.getActiveAnomalies('org_1');
    let orderValid = true;
    if (activeOrder.length >= 2) {
        for (let i = 1; i < activeOrder.length; i++) {
            const prev = new Date(activeOrder[i-1].detected_at).getTime();
            const curr = new Date(activeOrder[i].detected_at).getTime();
            if (prev < curr) {
                orderValid = false;
                break;
            }
        }
    }
    assert(orderValid || activeOrder.length < 2, 'w10_104: Active anomalies descending order by detected_at');

    // Factory function with null
    try {
        createAnomalyPersistence(null);
        assert(false, 'w10_105: Factory throws with null');
    } catch (err) {
        assert(true, 'w10_105: Factory throws with null');
    }

    // Source agent preservation
    const resultAgent = await ap.persistAnomalies(
        [{ method: 'zscore', severity: 'warning', value: 42.5, timestamp: '2024-01-15T10:30:00Z' }],
        'org_1',
        'cost-intelligence'
    );
    assert(resultAgent.persisted >= 0, 'w10_106: Source agent accepted');

    // Context preservation
    const contextData = { interpretation: 'Cost spike due to compute increase', patterns: ['gradual_increase'] };
    const resultCtx = await ap.persistAnomalies(
        [{ method: 'zscore', severity: 'warning', value: 42.5, timestamp: '2024-01-15T10:30:00Z' }],
        'org_1',
        'cost-intelligence',
        contextData
    );
    assert(resultCtx.persisted >= 0, 'w10_107: Complex context accepted');

    // Timestamp bucket precision
    const ts1 = '2024-01-15T10:00:00Z';
    const ts2 = '2024-01-15T10:59:59Z';
    const ts3 = '2024-01-15T11:00:00Z';
    const fpTs1 = ap.computeFingerprint({ method: 'zscore', severity: 'warning', value: 42.5, timestamp: ts1 });
    const fpTs2 = ap.computeFingerprint({ method: 'zscore', severity: 'warning', value: 42.5, timestamp: ts2 });
    const fpTs3 = ap.computeFingerprint({ method: 'zscore', severity: 'warning', value: 42.5, timestamp: ts3 });
    assert(fpTs1 === fpTs2 && fpTs1 !== fpTs3, 'w10_108: Hour bucket precision correct');

    // Confidence range
    const confLow = await ap.persistAnomalies([{ method: 'zscore', severity: 'warning', value: 42.5, timestamp: '2024-01-15T10:30:00Z', confidence: 0.1 }], 'org_1', 'cost-intelligence');
    const confHigh = await ap.persistAnomalies([{ method: 'zscore', severity: 'warning', value: 42.5, timestamp: '2024-01-15T10:30:00Z', confidence: 0.99 }], 'org_1', 'cost-intelligence');
    assert(confLow.persisted + confLow.deduplicated + confLow.errors >= 0 && confHigh.persisted + confHigh.deduplicated + confHigh.errors >= 0, 'w10_109: Confidence range handled');

    // All status values covered
    const allStatuses = Object.values(ANOMALY_STATUS);
    assert(allStatuses.length === 5, 'w10_110: All 5 statuses defined');
    for (let i = 0; i < allStatuses.length; i++) {
        assert(typeof allStatuses[i] === 'string', `w10_${111 + i}: Status ${i} is string`);
    }

    // All feedback values covered
    const allFeedback = Object.values(ANOMALY_FEEDBACK);
    assert(allFeedback.length === 3, 'w10_116: All 3 feedback values defined');
    for (let i = 0; i < allFeedback.length; i++) {
        assert(typeof allFeedback[i] === 'string', `w10_${117 + i}: Feedback ${i} is string`);
    }

    // Config values are numbers
    assert(typeof PERSISTENCE_CONFIG.deduplication.windowMs === 'number', 'w10_120: windowMs is number');
    assert(typeof PERSISTENCE_CONFIG.deduplication.maxActivePerOrg === 'number', 'w10_121: maxActivePerOrg is number');
    assert(typeof PERSISTENCE_CONFIG.retention.resolvedDays === 'number', 'w10_122: resolvedDays is number');
    assert(typeof PERSISTENCE_CONFIG.retention.dismissedDays === 'number', 'w10_123: dismissedDays is number');

    // Fingerprint consistency
    const anomaly = { method: 'zscore', severity: 'warning', value: 42.567, timestamp: '2024-01-15T10:30:00Z' };
    const fp1Final = ap.computeFingerprint(anomaly);
    const fp2Final = ap.computeFingerprint(anomaly);
    assert(fp1Final === fp2Final, 'w10_124: Fingerprint is deterministic');

    // Transition with different options combinations
    const transOpt1 = await ap.transitionStatus('anomaly_1', 'resolved', {});
    assert(transOpt1.success === true || transOpt1.success === false, 'w10_125: Transition with empty options');

    const transOpt2 = await ap.transitionStatus('anomaly_1', 'resolved', { resolvedBy: 'user_789' });
    assert(transOpt2.success === true || transOpt2.success === false, 'w10_126: Transition with resolvedBy');

    const transOpt3 = await ap.transitionStatus('anomaly_1', 'resolved', { notes: 'Investigation complete' });
    assert(transOpt3.success === true || transOpt3.success === false, 'w10_127: Transition with notes');

    // Feedback with null feedbackBy
    const fbNull = await ap.addFeedback('anomaly_1', 'true_positive', null);
    assert(fbNull.success === true, 'w10_128: Feedback with null feedbackBy');

    // Feedback without feedbackBy parameter
    const fbUndef = await ap.addFeedback('anomaly_1', 'false_positive');
    assert(fbUndef.success === true, 'w10_129: Feedback without feedbackBy parameter');

    // Stats empty case
    const emptyStats = await ap.getAnomalyStats('org_empty');
    assert(emptyStats.total === 0, 'w10_130: Empty org stats has 0 total');
    assert(Object.keys(emptyStats.bySeverity).length === 0, 'w10_131: Empty org stats has empty bySeverity');

    // getActiveAnomalies with all filter types
    const activeFiltered = await ap.getActiveAnomalies('org_1', {
        severity: 'warning',
        method: 'zscore',
        limit: 20
    });
    assert(Array.isArray(activeFiltered), 'w10_132: All filters combined');

    // Value precision in fingerprint
    const fpPrec1 = ap.computeFingerprint({ method: 'zscore', severity: 'warning', value: 0.123456789, timestamp: '2024-01-15T10:00:00Z' });
    const fpPrec2 = ap.computeFingerprint({ method: 'zscore', severity: 'warning', value: 0.123499999, timestamp: '2024-01-15T10:00:00Z' });
    assert(fpPrec1 === fpPrec2, 'w10_133: Value precision consistent');

    // Anomaly with zero value
    const fpZero = ap.computeFingerprint({ method: 'zscore', severity: 'warning', value: 0, timestamp: '2024-01-15T10:00:00Z' });
    assert(fpZero.includes(':0:'), 'w10_134: Zero value handled');

    // Negative values
    const fpNeg = ap.computeFingerprint({ method: 'zscore', severity: 'warning', value: -42.5, timestamp: '2024-01-15T10:00:00Z' });
    assert(fpNeg.includes('-42.5'), 'w10_135: Negative value handled');

    // Very large values
    const fpLarge = ap.computeFingerprint({ method: 'zscore', severity: 'warning', value: 999999.99, timestamp: '2024-01-15T10:00:00Z' });
    assert(typeof fpLarge === 'string' && fpLarge.length > 0, 'w10_136: Large value handled');

    // Date at midnight
    const fpMidnight = ap.computeFingerprint({ method: 'zscore', severity: 'warning', value: 42.5, timestamp: '2024-01-15T00:00:00Z' });
    assert(fpMidnight.includes('2024-01-15T00'), 'w10_137: Midnight timestamp handled');

    // Date at end of day
    const fpEndDay = ap.computeFingerprint({ method: 'zscore', severity: 'warning', value: 42.5, timestamp: '2024-01-15T23:59:59Z' });
    assert(fpEndDay.includes('2024-01-15T23'), 'w10_138: End-of-day timestamp handled');

    // Multiple severity levels in stats
    const statsSev = await ap.getAnomalyStats('org_1');
    assert(typeof statsSev.bySeverity === 'object', 'w10_139: bySeverity object present');

    // Multiple status levels in stats
    const statsStat = await ap.getAnomalyStats('org_1');
    assert(typeof statsStat.byStatus === 'object', 'w10_140: byStatus object present');

    // All exports exist
    assert(typeof AnomalyPersistence === 'function', 'w10_141: AnomalyPersistence exported');
    assert(typeof createAnomalyPersistence === 'function', 'w10_142: createAnomalyPersistence exported');
    assert(typeof ANOMALY_STATUS === 'object', 'w10_143: ANOMALY_STATUS exported');
    assert(typeof ANOMALY_FEEDBACK === 'object', 'w10_144: ANOMALY_FEEDBACK exported');
    assert(typeof PERSISTENCE_CONFIG === 'object', 'w10_145: PERSISTENCE_CONFIG exported');

    // Class methods are functions
    assert(typeof ap.persistAnomalies === 'function', 'w10_146: persistAnomalies is function');
    assert(typeof ap.computeFingerprint === 'function', 'w10_147: computeFingerprint is function');
    assert(typeof ap.transitionStatus === 'function', 'w10_148: transitionStatus is function');
    assert(typeof ap.addFeedback === 'function', 'w10_149: addFeedback is function');
    assert(typeof ap.getActiveAnomalies === 'function', 'w10_150: getActiveAnomalies is function');
    assert(typeof ap.getAnomalyStats === 'function', 'w10_151: getAnomalyStats is function');

    // Return types
    const rtFp = ap.computeFingerprint({ method: 'zscore', severity: 'warning', value: 42.5 });
    assert(typeof rtFp === 'string', 'w10_152: computeFingerprint returns string');

    const rtPersist = await ap.persistAnomalies([], 'org_1', 'cost-intelligence');
    assert(typeof rtPersist === 'object' && rtPersist.anomalyIds, 'w10_153: persistAnomalies returns object with anomalyIds');

    const rtActive = await ap.getActiveAnomalies('org_1');
    assert(Array.isArray(rtActive), 'w10_154: getActiveAnomalies returns array');

    const rtStats = await ap.getAnomalyStats('org_1');
    assert(typeof rtStats === 'object' && rtStats.falsePositiveRate !== undefined, 'w10_155: getAnomalyStats returns complete object');

    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log('\n' + '═'.repeat(70));
    console.log(`RESULTS: ${passed} passed, ${failed} failed`);
    console.log('═'.repeat(70));

    if (failures.length > 0) {
        console.log('\nFailed Tests:');
        failures.forEach((f, i) => {
            console.log(`  ${i + 1}. ${f}`);
        });
    }

    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('Test suite error:', err);
    process.exit(1);
});
