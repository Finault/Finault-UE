/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * AUDIT TRACKER AGENT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Immutable audit trail with cryptographic integrity for every system event.
 * - Append-only hash-chained log (SHA-256)
 * - Merkle trees per period for integrity verification
 * - Compliance evidence bundles (SOX/SOC 2)
 * - 7-year retention with tiered storage
 * - Full autonomy: listens to all event bus topics and logs automatically
 *
 * Architecture:
 *   AuditTrackerAgent → AuditLog (hash-chained) → MerkleTreeBuilder → RetentionPolicy → ComplianceBundle
 *
 * Events logged:
 *   - All agent actions from event bus
 *   - User actions and API calls
 *   - Policy evaluations and changes
 *   - System state changes
 *   - Security events
 *
 * Cryptographic integrity:
 *   Each log entry contains SHA-256 hash of (previousHash + eventData).
 *   Verification: recompute chain from start to end. Any tampering breaks hash chain.
 *
 * Retention tiers:
 *   - HOT: 90 days, full disk storage, low latency
 *   - WARM: 2 years, compressed archive storage, medium latency
 *   - COLD: 7 years, deep archive, high latency
 *
 * Autonomy: 5/5
 *   - Subscribed to event bus automatically
 *   - No coordination needed (writes are append-only, never conflicting)
 *   - Write-only, never reads other agents' state
 *   - No dependencies on other agents
 */

import crypto from 'crypto';
import { validateAgentParams } from '../core/validate-agent-params.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants & Configuration
// ─────────────────────────────────────────────────────────────────────────────

const AGENT_CONFIG = {
    id: 'audit-tracker',
    name: 'Audit Tracker Agent',
    autonomy: 5,
    description: 'Immutable audit trail with cryptographic integrity'
};

const RETENTION_TIERS = {
    HOT: {
        name: 'hot',
        maxAge: 90 * 24 * 60 * 60 * 1000,           // 90 days
        storage: 'disk',
        compression: false,
        maxSize: 10 * 1024 * 1024 * 1024             // 10 GB
    },
    WARM: {
        name: 'warm',
        maxAge: 2 * 365 * 24 * 60 * 60 * 1000,      // 2 years
        storage: 'archive',
        compression: true,
        maxSize: 100 * 1024 * 1024 * 1024            // 100 GB
    },
    COLD: {
        name: 'cold',
        maxAge: 7 * 365 * 24 * 60 * 60 * 1000,      // 7 years
        storage: 'deep-archive',
        compression: true,
        maxSize: 1024 * 1024 * 1024 * 1024           // 1 TB
    }
};

const EVENT_TYPES = {
    AGENT_ACTION: 'agent:action',
    USER_ACTION: 'user:action',
    POLICY_CHANGE: 'policy:change',
    POLICY_EVALUATION: 'policy:evaluation',
    SYSTEM_STATE_CHANGE: 'system:state_change',
    SECURITY_EVENT: 'security:event',
    COMPLIANCE_CHECK: 'compliance:check',
    DATA_ACCESS: 'data:access',
    CONFIGURATION_CHANGE: 'config:change',
    ERROR_EVENT: 'error:event'
};

// ─────────────────────────────────────────────────────────────────────────────
// AuditLog — Hash-chained append-only log
// ─────────────────────────────────────────────────────────────────────────────

class AuditLog {
    constructor() {
        this.entries = [];
        this.lastHash = '0'.repeat(64);  // Initial state: 64 zeros (SHA-256 hex)
        this.totalSize = 0;
    }

    /**
     * Compute SHA-256 hash of data (Web Crypto compatible).
     *
     * @param {string} data - Data to hash
     * @returns {string} - Hex-encoded SHA-256 hash
     */
    async _sha256(data) {
        const encoder = new TextEncoder();
        const buffer = encoder.encode(data);
        const hashBuffer = await crypto.webcrypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Append an event to the log with cryptographic chaining.
     * Hash: SHA-256(previousHash + JSON(eventData))
     *
     * @param {Object} event - Event to log
     * @returns {Promise<Object>} - { entryId, hash, index, timestamp }
     */
    async append(event) {
        const timestamp = Date.now();
        const entryId = crypto.randomUUID();

        // Serialize event data
        const eventData = JSON.stringify(event);

        // Chain: SHA-256(previousHash + eventData)
        const chainInput = this.lastHash + eventData;
        const currentHash = await this._sha256(chainInput);

        // Create log entry
        const entry = {
            entryId,
            timestamp,
            hash: currentHash,
            previousHash: this.lastHash,
            event: {
                ...event,
                agentId: event.agentId || event.agent || 'unknown',
                eventType: event.eventType || EVENT_TYPES.AGENT_ACTION,
                orgId: event.orgId || null
            },
            dataSize: Buffer.byteLength(eventData, 'utf8')
        };

        // Append to log
        this.entries.push(entry);
        this.lastHash = currentHash;
        this.totalSize += entry.dataSize;

        return {
            entryId,
            hash: currentHash,
            index: this.entries.length - 1,
            timestamp
        };
    }

    /**
     * Get an entry by index.
     *
     * @param {number} index - Entry index
     * @returns {Object|null} - Log entry or null
     */
    getEntry(index) {
        if (index < 0 || index >= this.entries.length) return null;
        return this.entries[index];
    }

    /**
     * Get all entries in a time range.
     *
     * @param {number} startTime - Start timestamp (ms)
     * @param {number} endTime - End timestamp (ms)
     * @returns {Array} - Entries in range
     */
    getEntriesByTimeRange(startTime, endTime) {
        return this.entries.filter(e =>
            e.timestamp >= startTime && e.timestamp <= endTime
        );
    }

    /**
     * Get entry count.
     *
     * @returns {number} - Total entries
     */
    getEntryCount() {
        return this.entries.length;
    }

    /**
     * Get total size in bytes.
     *
     * @returns {number} - Total size
     */
    getTotalSize() {
        return this.totalSize;
    }

    /**
     * Get the last hash in the chain.
     *
     * @returns {string} - Last hash
     */
    getLastHash() {
        return this.lastHash;
    }

    /**
     * Get all entries (test/admin only).
     * @internal
     *
     * @returns {Array} - All entries
     */
    getAllEntries() {
        return [...this.entries];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MerkleTreeBuilder — Build Merkle tree from events
// ─────────────────────────────────────────────────────────────────────────────

class MerkleTreeBuilder {
    /**
     * Compute SHA-256 hash.
     *
     * @param {string} data - Data to hash
     * @returns {Promise<string>} - Hex-encoded hash
     */
    async _sha256(data) {
        const encoder = new TextEncoder();
        const buffer = encoder.encode(data);
        const hashBuffer = await crypto.webcrypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Build a Merkle tree from a list of hashes.
     * Returns tree with root, levels, and leaf count.
     *
     * @param {Array<string>} hashes - List of leaf hashes
     * @returns {Promise<Object>} - { root, levels, leafCount, height }
     */
    async build(hashes) {
        if (!hashes || hashes.length === 0) {
            return { root: null, levels: [], leafCount: 0, height: 0 };
        }

        // Start with leaves
        const leaves = [...hashes];
        const levels = [leaves];

        let currentLevel = leaves;

        while (currentLevel.length > 1) {
            const nextLevel = [];

            // If odd number of nodes, duplicate the last
            if (currentLevel.length % 2 !== 0) {
                currentLevel.push(currentLevel[currentLevel.length - 1]);
            }

            // Pair up and hash
            for (let i = 0; i < currentLevel.length; i += 2) {
                const left = currentLevel[i];
                const right = currentLevel[i + 1];
                const combined = await this._sha256(left + right);
                nextLevel.push(combined);
            }

            levels.push(nextLevel);
            currentLevel = nextLevel;
        }

        return {
            root: currentLevel[0] || null,
            levels,
            leafCount: hashes.length,
            height: levels.length
        };
    }

    /**
     * Verify a Merkle proof (leaf is in tree).
     * Given a leaf, a proof path, and the root, reconstruct the root.
     *
     * @param {string} leaf - Leaf hash
     * @param {Array<{hash, side}>} proof - Proof path [ {hash, side: 'left'|'right'}, ... ]
     * @param {string} root - Expected root
     * @returns {Promise<boolean>} - True if proof is valid
     */
    async verify(leaf, proof, root) {
        let current = leaf;

        for (const step of proof) {
            const { hash, side } = step;
            current = side === 'left'
                ? await this._sha256(hash + current)
                : await this._sha256(current + hash);
        }

        return current === root;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ComplianceBundleGenerator — SOX/SOC 2 evidence packages
// ─────────────────────────────────────────────────────────────────────────────

class ComplianceBundleGenerator {
    /**
     * Generate evidence bundle for a compliance framework.
     *
     * @param {string} orgId - Organization ID
     * @param {string} framework - 'SOX', 'SOC2', 'GDPR', 'HIPAA'
     * @param {number} startTime - Period start (ms)
     * @param {number} endTime - Period end (ms)
     * @param {Array} logEntries - Log entries in period
     * @returns {Object} - Compliance bundle with evidence
     */
    generate(orgId, framework, startTime, endTime, logEntries) {
        const framework_upper = framework.toUpperCase();
        const bundleId = crypto.randomUUID();
        const generatedAt = new Date().toISOString();

        // Framework-specific evidence requirements
        const evidenceRequirements = this._getRequirements(framework_upper);

        // Collect evidence from log entries
        const evidence = this._collectEvidence(logEntries, evidenceRequirements, framework_upper);

        return {
            bundleId,
            orgId,
            framework: framework_upper,
            period: {
                start: new Date(startTime).toISOString(),
                end: new Date(endTime).toISOString(),
                durationDays: Math.ceil((endTime - startTime) / (24 * 60 * 60 * 1000))
            },
            generatedAt,
            summary: {
                totalEvents: logEntries.length,
                evidenceCategories: Object.keys(evidence).length,
                complianceStatus: this._assessCompliance(evidence, evidenceRequirements)
            },
            evidence,
            requirements: evidenceRequirements,
            certificationReady: evidence.audit_trail && evidence.access_controls && evidence.change_log
        };
    }

    /**
     * Get compliance requirements for a framework.
     *
     * @param {string} framework - Framework name
     * @returns {Object} - Required evidence categories
     */
    _getRequirements(framework) {
        const requirements = {
            SOX: {
                audit_trail: 'Complete immutable audit log of all financial transactions',
                change_log: 'All changes to financial systems and controls',
                access_controls: 'User access and privileged actions',
                segregation_of_duties: 'No single user can execute conflicting duties',
                user_management: 'User lifecycle management (add/modify/remove)'
            },
            SOC2: {
                audit_trail: 'Comprehensive audit trail of all system activities',
                access_controls: 'Access control evidence for confidentiality and security',
                change_log: 'Change management procedures and logs',
                incident_response: 'Security incident detection and response',
                data_protection: 'Encryption and data protection measures'
            },
            GDPR: {
                data_access_log: 'All personal data access and processing',
                consent_records: 'User consent for data processing',
                deletion_log: 'Records of data deletion (right to be forgotten)',
                data_breach: 'Data breach notifications and remediation',
                dpia_evidence: 'Data Protection Impact Assessment records'
            },
            HIPAA: {
                phi_access_log: 'All access to Protected Health Information',
                user_authentication: 'User identity and authentication evidence',
                encryption_evidence: 'Data encryption (at rest and in transit)',
                audit_controls: 'Audit log maintenance and integrity',
                access_revocation: 'Timely revocation of access'
            }
        };

        return requirements[framework] || {};
    }

    /**
     * Collect evidence from log entries.
     *
     * @param {Array} logEntries - Log entries
     * @param {Object} requirements - Required evidence categories
     * @param {string} framework - Framework name
     * @returns {Object} - Collected evidence
     */
    _collectEvidence(logEntries, requirements, framework) {
        const evidence = {};

        for (const category of Object.keys(requirements)) {
            const matching = logEntries.filter(e => {
                const eventType = e.event.eventType || '';
                return this._matchesCategory(eventType, category, framework);
            });

            evidence[category] = {
                requirement: requirements[category],
                evidenceCount: matching.length,
                timeRange: matching.length > 0 ? {
                    first: matching[0].timestamp,
                    last: matching[matching.length - 1].timestamp
                } : null,
                sampleEvents: matching.slice(0, 3).map(e => ({
                    timestamp: new Date(e.timestamp).toISOString(),
                    eventType: e.event.eventType,
                    actor: e.event.actor || 'system'
                }))
            };
        }

        return evidence;
    }

    /**
     * Match event type to evidence category.
     *
     * @param {string} eventType - Event type
     * @param {string} category - Category
     * @param {string} framework - Framework
     * @returns {boolean} - Match
     */
    _matchesCategory(eventType, category, framework) {
        const categoryMaps = {
            SOX: {
                audit_trail: ['agent:action', 'user:action', 'system:state_change'],
                change_log: ['config:change', 'policy:change'],
                access_controls: ['data:access', 'user:action'],
                user_management: ['user:action'],
                segregation_of_duties: ['agent:action']
            },
            SOC2: {
                audit_trail: ['agent:action', 'user:action', 'system:state_change'],
                access_controls: ['data:access', 'user:action'],
                change_log: ['config:change', 'policy:change'],
                incident_response: ['error:event', 'security:event'],
                data_protection: ['system:state_change']
            },
            GDPR: {
                data_access_log: ['data:access', 'user:action'],
                consent_records: ['policy:change', 'user:action'],
                deletion_log: ['system:state_change'],
                data_breach: ['error:event', 'security:event'],
                dpia_evidence: ['policy:evaluation', 'compliance:check']
            },
            HIPAA: {
                phi_access_log: ['data:access', 'user:action'],
                user_authentication: ['user:action'],
                encryption_evidence: ['system:state_change', 'config:change'],
                audit_controls: ['agent:action', 'system:state_change'],
                access_revocation: ['user:action', 'config:change']
            }
        };

        const map = categoryMaps[framework] || {};
        const categoryEventTypes = map[category] || [];
        return categoryEventTypes.includes(eventType);
    }

    /**
     * Assess compliance status.
     *
     * @param {Object} evidence - Collected evidence
     * @param {Object} requirements - Requirements
     * @returns {string} - 'compliant', 'partial', 'non-compliant'
     */
    _assessCompliance(evidence, requirements) {
        const requiredCategories = Object.keys(requirements);
        const foundCategories = Object.keys(evidence).filter(cat => evidence[cat].evidenceCount > 0);

        const coverage = foundCategories.length / requiredCategories.length;

        if (coverage === 1.0) return 'compliant';
        if (coverage >= 0.7) return 'partial';
        return 'non-compliant';
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// RetentionPolicyManager — Manage lifecycle of log entries
// ─────────────────────────────────────────────────────────────────────────────

class RetentionPolicyManager {
    /**
     * Get retention tier for an event type.
     *
     * @param {string} eventType - Event type (e.g., 'security:event')
     * @returns {Object} - Retention tier config
     */
    getRetentionPolicy(eventType) {
        // Security and compliance events stay longer
        if (eventType.includes('security') || eventType.includes('compliance')) {
            return RETENTION_TIERS.COLD;
        }

        // Audit trail and changes stay medium-long
        if (eventType.includes('audit') || eventType.includes('change')) {
            return RETENTION_TIERS.WARM;
        }

        // General events follow default hot → warm → cold
        return RETENTION_TIERS.HOT;
    }

    /**
     * Determine which tier an entry should be in based on age.
     *
     * @param {number} entryTimestamp - Entry creation time (ms)
     * @param {number} now - Current time (ms), default Date.now()
     * @returns {Object} - Target tier config
     */
    getTierForAge(entryTimestamp, now = Date.now()) {
        const age = now - entryTimestamp;

        if (age <= RETENTION_TIERS.HOT.maxAge) {
            return RETENTION_TIERS.HOT;
        } else if (age <= RETENTION_TIERS.WARM.maxAge) {
            return RETENTION_TIERS.WARM;
        } else if (age <= RETENTION_TIERS.COLD.maxAge) {
            return RETENTION_TIERS.COLD;
        }

        // Beyond retention — should be purged
        return null;
    }

    /**
     * Get all entries eligible for pruning (beyond cold tier).
     *
     * @param {Array} entries - Log entries
     * @param {number} now - Current time (ms)
     * @returns {Array} - Entries to purge
     */
    getExpiredEntries(entries, now = Date.now()) {
        return entries.filter(e => this.getTierForAge(e.timestamp, now) === null);
    }

    /**
     * Get entries in a specific tier.
     *
     * @param {Array} entries - Log entries
     * @param {string} tierName - Tier name ('hot', 'warm', 'cold')
     * @param {number} now - Current time (ms)
     * @returns {Array} - Entries in tier
     */
    getEntriesInTier(entries, tierName, now = Date.now()) {
        const tier = Object.values(RETENTION_TIERS).find(t => t.name === tierName);
        if (!tier) return [];

        return entries.filter(e => this.getTierForAge(e.timestamp, now) === tier);
    }

    /**
     * Get summary of entries by retention tier.
     *
     * @param {Array} entries - Log entries
     * @param {number} now - Current time (ms)
     * @returns {Object} - { hot: count, warm: count, cold: count, expired: count }
     */
    getTierSummary(entries, now = Date.now()) {
        return {
            hot: this.getEntriesInTier(entries, 'hot', now).length,
            warm: this.getEntriesInTier(entries, 'warm', now).length,
            cold: this.getEntriesInTier(entries, 'cold', now).length,
            expired: this.getExpiredEntries(entries, now).length,
            total: entries.length
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// AuditTrackerAgent — Main agent
// ─────────────────────────────────────────────────────────────────────────────

class AuditTrackerAgent {
    constructor(params = {}) {
        // AuditTracker is a system-level agent (5/5 autonomy) that monitors ALL orgs,
        // so organizationId/userId are optional — it operates globally.
        params = { organizationId: 'system', userId: 'system', ...params };
        validateAgentParams(params, 'AuditTrackerAgent');
        const eventBus = params.eventBus || null;
        this.config = AGENT_CONFIG;
        this.log = new AuditLog();
        this.merkleBuilder = new MerkleTreeBuilder();
        this.bundleGenerator = new ComplianceBundleGenerator();
        this.retentionPolicy = new RetentionPolicyManager();
        this.eventBus = eventBus;
        this.subscriptionId = null;
        this.periodMerkleCache = new Map();  // Cache: period → merkle tree
    }

    /**
     * Log an event to the immutable audit trail.
     *
     * @param {Object} event - Event to log
     * @returns {Promise<Object>} - { entryId, hash, index, timestamp }
     */
    async logEvent(event) {
        return await this.log.append(event);
    }

    /**
     * Build a Merkle tree for all events in a time period.
     *
     * @param {Object} period - { startTime, endTime, orgId? }
     * @returns {Promise<Object>} - Merkle tree { root, levels, leafCount, height }
     */
    async buildMerkleTree(period) {
        const { startTime, endTime, orgId } = period;

        // Get entries in period
        let entries = this.log.getEntriesByTimeRange(startTime, endTime);

        // Filter by orgId if provided
        if (orgId) {
            entries = entries.filter(e => e.event.orgId === orgId);
        }

        // Extract hashes
        const hashes = entries.map(e => e.hash);

        // Build tree
        const tree = await this.merkleBuilder.build(hashes);

        // Cache for compliance evidence
        const periodKey = `${startTime}:${endTime}:${orgId || 'all'}`;
        this.periodMerkleCache.set(periodKey, tree);

        return tree;
    }

    /**
     * Generate compliance evidence bundle.
     *
     * @param {string} orgId - Organization ID
     * @param {string} framework - 'SOX', 'SOC2', 'GDPR', 'HIPAA'
     * @param {Object} period - { startTime, endTime }
     * @returns {Object} - Compliance bundle
     */
    generateEvidenceBundle(orgId, framework, period) {
        const { startTime, endTime } = period;

        // Get entries in period for this org
        let entries = this.log.getEntriesByTimeRange(startTime, endTime);
        entries = entries.filter(e => e.event.orgId === orgId);

        // Generate bundle
        return this.bundleGenerator.generate(orgId, framework, startTime, endTime, entries);
    }

    /**
     * Verify chain integrity between two events.
     * Reconstructs the hash chain and verifies unbroken continuity.
     *
     * @param {number} startIndex - Start entry index
     * @param {number} endIndex - End entry index
     * @returns {Promise<Object>} - { valid, details, brokenAt? }
     */
    async verifyChainIntegrity(startIndex, endIndex) {
        if (startIndex < 0 || endIndex >= this.log.getEntryCount() || startIndex > endIndex) {
            return {
                valid: false,
                details: 'Invalid index range',
                startIndex,
                endIndex
            };
        }

        const entries = this.log.getAllEntries();
        let expectedPrevHash = startIndex === 0
            ? '0'.repeat(64)
            : entries[startIndex - 1].hash;

        for (let i = startIndex; i <= endIndex; i++) {
            const entry = entries[i];

            // Verify previousHash points to last entry
            if (entry.previousHash !== expectedPrevHash) {
                return {
                    valid: false,
                    details: 'Hash chain broken',
                    brokenAt: i,
                    expected: expectedPrevHash,
                    actual: entry.previousHash
                };
            }

            // Verify hash was computed correctly
            const chainInput = entry.previousHash + JSON.stringify(entry.event);
            const computedHash = await this.log._sha256(chainInput);

            if (computedHash !== entry.hash) {
                return {
                    valid: false,
                    details: 'Hash mismatch (tampering detected)',
                    brokenAt: i,
                    expected: entry.hash,
                    computed: computedHash
                };
            }

            expectedPrevHash = entry.hash;
        }

        return {
            valid: true,
            details: 'Chain integrity verified',
            entriesVerified: endIndex - startIndex + 1
        };
    }

    /**
     * Get retention policy for an event type.
     *
     * @param {string} eventType - Event type
     * @returns {Object} - Retention tier config
     */
    getRetentionPolicy(eventType) {
        return this.retentionPolicy.getRetentionPolicy(eventType);
    }

    /**
     * Prune expired events beyond cold tier retention.
     *
     * @param {number} now - Current time (ms), default Date.now()
     * @returns {Object} - { prunedCount, totalRemaining }
     */
    pruneExpiredEvents(now = Date.now()) {
        const allEntries = this.log.getAllEntries();
        const expiredEntries = this.retentionPolicy.getExpiredEntries(allEntries, now);
        const prunedCount = expiredEntries.length;

        if (prunedCount > 0) {
            // Remove expired entries
            const expiredIds = new Set(expiredEntries.map(e => e.entryId));
            this.log.entries = this.log.entries.filter(e => !expiredIds.has(e.entryId));

            // Recalculate total size
            this.log.totalSize = this.log.entries.reduce((sum, e) => sum + e.dataSize, 0);
        }

        return {
            prunedCount,
            totalRemaining: this.log.getEntryCount()
        };
    }

    /**
     * Subscribe to event bus and log all events automatically.
     * This makes the agent fully autonomous — it needs no explicit calls.
     *
     * @param {Object} eventBus - AgentEventBus instance
     * @returns {number} - Subscription ID
     */
    subscribeToEventBus(eventBus) {
        this.eventBus = eventBus;

        // Subscribe to all topics (wildcard)
        this.subscriptionId = eventBus.subscribe({}, async (event) => {
            // Automatically log every event from the bus
            try {
                await this.logEvent({
                    agent: 'audit-tracker',
                    eventType: EVENT_TYPES.AGENT_ACTION,
                    ...event,
                    timestamp: event.timestamp || Date.now()
                });
            } catch (error) {
                console.error('[AuditTrackerAgent] Log error:', error.message);
            }
        });

        return this.subscriptionId;
    }

    /**
     * Unsubscribe from event bus.
     */
    unsubscribeFromEventBus() {
        if (this.eventBus && this.subscriptionId !== null) {
            this.eventBus.unsubscribe(this.subscriptionId);
            this.subscriptionId = null;
        }
    }

    /**
     * Get audit log statistics.
     *
     * @returns {Object} - Log stats
     */
    getStats() {
        const allEntries = this.log.getAllEntries();
        const tierSummary = this.retentionPolicy.getTierSummary(allEntries);

        return {
            agent: this.config.id,
            totalEntries: this.log.getEntryCount(),
            totalSize: this.log.getTotalSize(),
            lastHash: this.log.getLastHash(),
            tiers: tierSummary,
            oldestEntry: allEntries.length > 0 ? new Date(allEntries[0].timestamp).toISOString() : null,
            newestEntry: allEntries.length > 0 ? new Date(allEntries[allEntries.length - 1].timestamp).toISOString() : null
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

export {
    AuditTrackerAgent,
    AuditLog,
    MerkleTreeBuilder,
    ComplianceBundleGenerator,
    RetentionPolicyManager,
    EVENT_TYPES,
    RETENTION_TIERS,
    AGENT_CONFIG
};
