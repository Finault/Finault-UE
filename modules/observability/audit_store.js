/**
 * Finault Audit Log Store
 *
 * Append-only audit log for compliance, provenance tracking,
 * and full pipeline auditing.
 *
 * Key features:
 * - INSERT-only pattern (no updates/deletes)
 * - NDJSON format for streaming
 * - R2/S3 compatible storage
 * - Cryptographic sealing with Merkle tree
 */

import crypto from 'crypto';
import { storage } from '../../agentos/core/storage-adapter.js';

// ============================================================================
// AUDIT EVENT TYPES
// ============================================================================

export const AuditEventType = {
  // Close Pack lifecycle
  CLOSEPACK_STARTED: 'closepack.started',
  CLOSEPACK_GENERATED: 'closepack.generated',
  CLOSEPACK_VERIFIED: 'closepack.verified',
  CLOSEPACK_FAILED: 'closepack.failed',

  // FCS events
  FCS_COMPUTED: 'fcs.computed',
  FCS_THRESHOLD_BREACH: 'fcs.threshold_breach',

  // Drift events
  DRIFT_DETECTED: 'drift.detected',
  DRIFT_ALERT: 'drift.alert',

  // ERP events
  ERP_POST_STARTED: 'erp.post_started',
  ERP_POST_COMPLETED: 'erp.post_completed',
  ERP_POST_FAILED: 'erp.post_failed',
  ERP_VARIANCE_DETECTED: 'erp.variance_detected',

  // Anchoring events
  ANCHOR_SUBMITTED: 'anchor.submitted',
  ANCHOR_CONFIRMED: 'anchor.confirmed',
  ANCHOR_FAILED: 'anchor.failed',

  // Verification events
  VERIFICATION_REQUESTED: 'verification.requested',
  VERIFICATION_COMPLETED: 'verification.completed',
  VERIFICATION_FAILED: 'verification.failed',

  // Replay events
  REPLAY_STARTED: 'replay.started',
  REPLAY_COMPLETED: 'replay.completed',
  REPLAY_MISMATCH: 'replay.mismatch',

  // API events
  API_REQUEST: 'api.request',
  API_ERROR: 'api.error',

  // Auth events
  AUTH_SUCCESS: 'auth.success',
  AUTH_FAILURE: 'auth.failure',
  AUTH_TOKEN_ISSUED: 'auth.token_issued',
  AUTH_TOKEN_REVOKED: 'auth.token_revoked',

  // Admin events
  CONFIG_CHANGED: 'config.changed',
  RETENTION_APPLIED: 'retention.applied',
};

// ============================================================================
// AUDIT LOG ENTRY
// ============================================================================

/**
 * Create a standardized audit log entry
 */
export function createAuditEntry({
  eventType,
  tenantId,
  userId,
  closeId = null,
  resourceType = null,
  resourceId = null,
  action = null,
  status = 'success',
  details = {},
  metadata = {},
}) {
  const entry = {
    // Identity
    audit_id: `AUD-${Date.now()}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
    timestamp: new Date().toISOString(),

    // Event classification
    event_type: eventType,
    action: action || eventType.split('.').pop(),
    status,

    // Context
    tenant_id: tenantId,
    user_id: userId,
    close_id: closeId,

    // Resource
    resource_type: resourceType,
    resource_id: resourceId,

    // Payload
    details,

    // CALLER-BUG 31 FIX: Guard against null/non-object metadata before spreading.
    // Old code: if metadata is null, the spread operator throws TypeError:
    // "Cannot read properties of null (reading 'Symbol(Symbol.iterator)')".
    // Since callers pass metadata={} as default, this only fires if they
    // explicitly pass null — but defensive coding prevents the crash.
    metadata: {
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
      schema_version: '1.0',
      source: (metadata && metadata.source) || 'finault-core',
    },
  };

  // Compute entry hash for integrity
  const entryForHash = { ...entry };
  delete entryForHash.entry_hash;
  entry.entry_hash = crypto.createHash('sha256')
    .update(JSON.stringify(entryForHash))
    .digest('hex');

  return entry;
}

// ============================================================================
// AUDIT LOG STORE
// ============================================================================

/**
 * Append-only audit log store
 */
export class AuditLogStore {
  constructor(options = {}) {
    this.retentionDays = options.retentionDays || 2555; // 7 years
    this.sealBatchSize = options.sealBatchSize || 1000;
    this.auditStream = options.auditStream || 'audit-entries';
    this.sealStream = options.sealStream || 'audit-seals';

    this._entryCount = 0;
    this._pendingSeals = [];
  }


  /**
   * Append an audit entry to the log
   */
  // CALLER-BUG 10 FIX: Update in-memory state AFTER storage.appendLog succeeds.
  // Old code incremented _entryCount and pushed to _pendingSeals BEFORE the
  // await. If appendLog throws, in-memory state becomes inconsistent: _pendingSeals
  // contains hashes for entries that were never persisted. When _sealBatch fires,
  // it computes a Merkle tree over phantom entries — auditors see seals covering
  // entries that don't exist in the database.
  async append(entry) {
    // Append entry to Supabase log stream — must succeed before state update
    const result = await storage.appendLog(this.auditStream, entry);

    // Only NOW update state after persistence confirmed
    this._entryCount++;
    this._pendingSeals.push(entry.entry_hash);

    // Seal batch if threshold reached
    if (this._pendingSeals.length >= this.sealBatchSize) {
      try {
        await this._sealBatch();
      } catch (sealErr) {
        // Hashes remain in _pendingSeals for retry on next flush()
        // Do NOT let seal failure prevent the append from returning success
        console.error('[AuditLogStore] Seal batch failed, will retry on next flush:', sealErr.message);
      }
    }

    return {
      audit_id: entry.audit_id,
      stream: this.auditStream,
      sealed: false,
    };
  }

  /**
   * Log a Close Pack event
   */
  async logClosePackEvent(eventType, {
    tenantId,
    userId,
    closeId,
    status = 'success',
    details = {},
    metadata = {},
  }) {
    const entry = createAuditEntry({
      eventType,
      tenantId,
      userId,
      closeId,
      resourceType: 'closepack',
      resourceId: closeId,
      status,
      details,
      metadata,
    });

    return this.append(entry);
  }

  /**
   * Log a verification event
   */
  async logVerification({
    tenantId,
    userId,
    closeId,
    zipSha256,
    status,
    failures = [],
    fcsScore = null,
    drift = null,
    latencyMs = null,
  }) {
    const eventType = status === 'verified'
      ? AuditEventType.VERIFICATION_COMPLETED
      : AuditEventType.VERIFICATION_FAILED;

    const entry = createAuditEntry({
      eventType,
      tenantId,
      userId,
      closeId,
      resourceType: 'verification',
      resourceId: zipSha256,
      status: status === 'verified' ? 'success' : 'failure',
      details: {
        zip_sha256: zipSha256,
        failures,
        fcs_score: fcsScore,
        drift,
        latency_ms: latencyMs,
      },
    });

    return this.append(entry);
  }

  /**
   * Log an ERP posting event
   */
  async logERPPost({
    tenantId,
    userId,
    closeId,
    erp,
    entity,
    status,
    erpDocumentId = null,
    receiptId = null,
    error = null,
  }) {
    const eventType = status === 'success'
      ? AuditEventType.ERP_POST_COMPLETED
      : AuditEventType.ERP_POST_FAILED;

    const entry = createAuditEntry({
      eventType,
      tenantId,
      userId,
      closeId,
      resourceType: 'erp_post',
      resourceId: erpDocumentId || receiptId,
      status: status === 'success' ? 'success' : 'failure',
      details: {
        erp,
        entity,
        erp_document_id: erpDocumentId,
        receipt_id: receiptId,
        error,
      },
    });

    return this.append(entry);
  }

  /**
   * Log an anchoring event
   */
  async logAnchoring({
    tenantId,
    userId,
    closeId,
    chain,
    txHash = null,
    status,
    merkleRoot = null,
    error = null,
  }) {
    let eventType;
    if (status === 'submitted') eventType = AuditEventType.ANCHOR_SUBMITTED;
    else if (status === 'confirmed') eventType = AuditEventType.ANCHOR_CONFIRMED;
    else eventType = AuditEventType.ANCHOR_FAILED;

    const entry = createAuditEntry({
      eventType,
      tenantId,
      userId,
      closeId,
      resourceType: 'anchor',
      resourceId: txHash,
      status: status === 'failed' ? 'failure' : 'success',
      details: {
        chain,
        tx_hash: txHash,
        merkle_root: merkleRoot,
        error,
      },
    });

    return this.append(entry);
  }

  /**
   * Query audit logs
   */
  // CALLER-BUG 19 FIX: Validate tenantId and wrap storage call in try-catch.
  // Old code: if storage.queryLog throws (Supabase down, network error), the
  // exception propagated uncaught. All audit queries and compliance exports
  // that call query() would fail. Additionally, missing tenantId produces
  // empty results that appear successful, hiding a caller bug.
  async query({
    tenantId,
    closeId = null,
    eventType = null,
    startTime = null,
    endTime = null,
    limit = 100,
  }) {
    if (!tenantId) {
      throw new Error('[AuditLogStore] query: tenantId is required');
    }

    const filters = {
      tenantId,
      closeId,
      eventType,
      startTime,
      endTime,
      limit,
    };

    try {
      const result = await storage.queryLog(this.auditStream, filters);
      return Array.isArray(result) ? result : [];
    } catch (err) {
      throw new Error(`[AuditLogStore] query failed: ${err.message}`);
    }
  }

  /**
   * Get audit trail for a specific Close ID
   */
  async getCloseAuditTrail(closeId, tenantId) {
    return this.query({
      tenantId,
      closeId,
      limit: 1000,
    });
  }

  /**
   * Seal pending entries with Merkle tree
   */
  async _sealBatch() {
    if (this._pendingSeals.length === 0) return;

    const hashes = [...this._pendingSeals];
    // CALLER-BUG 1 FIX: Clear hashes AFTER successful persistence.
    // Old code cleared this._pendingSeals = [] HERE (before appendLog),
    // which means if appendLog throws, the hashes are lost forever —
    // the Merkle seal is never written and the entry hashes can never
    // be recovered. Move the clear to after the await succeeds.

    // Build Merkle tree
    const root = this._computeMerkleRoot(hashes);

    // Create seal record
    const seal = {
      seal_id: `SEAL-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      timestamp: new Date().toISOString(),
      entry_count: hashes.length,
      merkle_root: root,
      first_entry_hash: hashes[0],
      last_entry_hash: hashes[hashes.length - 1],
    };

    // Append seal to Supabase seal stream
    await storage.appendLog(this.sealStream, seal);

    // Only clear after successful persistence
    this._pendingSeals = [];

    return seal;
  }

  /**
   * Compute Merkle root from hashes
   */
  // CALLER-BUG 20 FIX: Validate hash array contents before computing Merkle root.
  // Old code: if a hash was null, undefined, or non-string (from _pendingSeals
  // containing corrupted entry_hash values), the sort().join('') produced junk
  // strings like "null[object Object]". The resulting Merkle root was
  // cryptographically meaningless — auditors would see seals that cannot be verified.
  _computeMerkleRoot(hashes) {
    if (!hashes || !Array.isArray(hashes) || hashes.length === 0) return null;
    if (hashes.length === 1) {
      if (typeof hashes[0] !== 'string' || !/^[a-f0-9]{64}$/i.test(hashes[0])) {
        throw new Error(`[AuditLogStore] _computeMerkleRoot: invalid hash at index 0`);
      }
      return hashes[0];
    }

    // Validate all hashes are valid SHA-256 hex strings
    for (let i = 0; i < hashes.length; i++) {
      if (typeof hashes[i] !== 'string' || !/^[a-f0-9]{64}$/i.test(hashes[i])) {
        throw new Error(
          `[AuditLogStore] _computeMerkleRoot: invalid hash at index ${i} (${typeof hashes[i]})`
        );
      }
    }

    let level = [...hashes];

    while (level.length > 1) {
      const nextLevel = [];

      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = level[i + 1] || left;
        const combined = [left, right].sort().join('');
        nextLevel.push(crypto.createHash('sha256').update(combined).digest('hex'));
      }

      level = nextLevel;
    }

    return level[0];
  }

  /**
   * Flush any pending seals
   */
  async flush() {
    if (this._pendingSeals.length > 0) {
      await this._sealBatch();
    }
  }

  /**
   * Apply retention policy
   */
  // CALLER-BUG 11 FIX: Retry the audit log append after deletion for atomicity.
  // Old code: if deleteLogBefore succeeds but append() fails, entries are
  // permanently deleted with NO audit record — a compliance violation. The
  // audit trail has a gap with no evidence of what was deleted, when, or why.
  // Fix: retry the audit log entry up to 3 times; if all retries fail, throw
  // a critical error with full context so operators can manually reconcile.
  async applyRetention() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

    // Delete entries before cutoff date using storage adapter
    const result = await storage.deleteLogBefore(this.auditStream, cutoffDate);

    // Log retention event — MUST succeed or raise critical alert
    if (result.deleted > 0) {
      let retried = 0;
      while (retried < 3) {
        try {
          await this.append(createAuditEntry({
            eventType: AuditEventType.RETENTION_APPLIED,
            tenantId: 'system',
            userId: 'system',
            details: {
              entries_deleted: result.deleted,
              cutoff_date: cutoffDate.toISOString(),
            },
          }));
          break; // Success
        } catch (err) {
          retried++;
          if (retried >= 3) {
            throw new Error(
              `[AuditLogStore] CRITICAL: Retention audit log failed after 3 retries. ` +
              `${result.deleted} entries deleted before ${cutoffDate.toISOString()} ` +
              `but no audit record exists. Original error: ${err.message}`
            );
          }
          await new Promise(r => setTimeout(r, 100 * retried));
        }
      }
    }

    return { deletedEntries: result.deleted };
  }

  /**
   * Export audit logs for compliance
   */
  // CALLER-BUG 12 FIX: Guard against null entries, circular-ref JSON.stringify
  // crashes, and invalid CSV serialization of object values.
  // Old code: (1) if query() returned null/undefined, entries.map crashed.
  // (2) JSON.stringify on entries with circular refs (e.g., Error objects in
  // details) threw TypeError, failing the entire compliance export.
  // (3) CSV export called e[h] || '' which produces '[object Object]' for nested
  // objects, generating invalid CSV. (4) Unknown format silently returned raw
  // array instead of throwing.
  async export({
    tenantId,
    startTime,
    endTime,
    format = 'ndjson',
  }) {
    const entries = await this.query({
      tenantId,
      startTime,
      endTime,
      limit: 100000,
    });

    if (!entries || !Array.isArray(entries)) {
      throw new Error('[AuditLogStore] export: query returned invalid data');
    }

    if (format === 'ndjson') {
      const lines = [];
      for (const e of entries) {
        try {
          lines.push(JSON.stringify(e));
        } catch (err) {
          // Circular reference or non-serializable — include marker entry
          lines.push(JSON.stringify({
            audit_id: e?.audit_id || 'UNKNOWN',
            _export_error: `Failed to serialize: ${err.message}`,
            timestamp: e?.timestamp || new Date().toISOString(),
          }));
        }
      }
      return lines.join('\n');
    }

    if (format === 'csv') {
      const headers = ['audit_id', 'timestamp', 'event_type', 'tenant_id', 'user_id', 'close_id', 'status'];
      const rows = entries.map(e => headers.map(h => {
        const val = e[h];
        if (val === null || val === undefined) return '';
        if (typeof val === 'object') {
          try { return JSON.stringify(val); } catch { return '[unserializable]'; }
        }
        return String(val).replace(/,/g, ';');
      }).join(','));
      return [headers.join(','), ...rows].join('\n');
    }

    if (format === 'json') {
      return entries;
    }

    throw new Error(`[AuditLogStore] export: unsupported format '${format}'`);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default AuditLogStore;
