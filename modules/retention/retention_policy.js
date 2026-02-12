/**
 * Finault Data Retention Policy Module
 *
 * Manages data lifecycle, retention periods, and automated cleanup
 * for compliance with GDPR, SOC2, and enterprise policies.
 */

import crypto from 'crypto';
import { storage } from '../../agentos/core/storage-adapter.js';

// ============================================================================
// RETENTION PERIODS (in days)
// ============================================================================

export const RetentionPeriod = {
  // Close Packs - 7 years (SOX compliance)
  CLOSE_PACKS: 2555,

  // Audit logs - 7 years
  AUDIT_LOGS: 2555,

  // Telemetry - 2 years
  TELEMETRY: 730,

  // ERP receipts - 7 years
  ERP_RECEIPTS: 2555,

  // Verification results - 1 year
  VERIFICATION_RESULTS: 365,

  // Session data - 30 days
  SESSION_DATA: 30,

  // Temp files - 7 days
  TEMP_FILES: 7,

  // Deleted items (soft delete) - 90 days
  SOFT_DELETE: 90,
};

// ============================================================================
// RETENTION POLICY MANAGER
// ============================================================================

export class RetentionPolicyManager {
  constructor(options = {}) {
    this.periods = { ...RetentionPeriod, ...options.periods };
    this.dryRun = options.dryRun || false;

    // Storage buckets/streams mapping
    this.storageBuckets = {
      closePacks: options.closePacksBucket || 'closepacks',
      auditLogs: options.auditLogsStream || 'audit-entries',
      telemetry: options.telemetryStream || 'telemetry-events',
      erpReceipts: options.erpReceiptsBucket || 'erp-receipts',
      tempFiles: options.tempBucket || 'temp-files',
    };

    // Audit trail for deletions
    this.deletionLog = [];
  }

  /**
   * Apply retention policy to all data types
   */
  async applyAll() {
    const results = {
      timestamp: new Date().toISOString(),
      dryRun: this.dryRun,
      results: {},
    };

    // CALLER-BUG 25 FIX: Wrap each retention step in independent try-catch.
    // Old code: if applyToClosePacks() throws, the remaining 4 steps (auditLogs,
    // telemetry, erpReceipts, tempFiles) never execute. In a compliance system,
    // one failed stream should not prevent other streams from being cleaned up.
    const steps = [
      { key: 'closePacks', fn: () => this.applyToClosePacks() },
      { key: 'auditLogs', fn: () => this.applyToAuditLogs() },
      { key: 'telemetry', fn: () => this.applyToTelemetry() },
      { key: 'erpReceipts', fn: () => this.applyToERPReceipts() },
      { key: 'tempFiles', fn: () => this.applyToTempFiles() },
    ];

    for (const step of steps) {
      try {
        results.results[step.key] = await step.fn();
      } catch (err) {
        results.results[step.key] = {
          dataType: step.key,
          status: 'error',
          deletedCount: 0,
          bytesFreed: 0,
          errors: [{ error: err.message }],
        };
      }
    }

    // Calculate totals
    results.totalDeleted = Object.values(results.results)
      .reduce((sum, r) => sum + (r.deletedCount || 0), 0);

    results.totalBytesFreed = Object.values(results.results)
      .reduce((sum, r) => sum + (r.bytesFreed || 0), 0);

    return results;
  }

  /**
   * Apply retention to Close Packs
   */
  async applyToClosePacks() {
    const cutoffDate = this._getCutoffDate(this.periods.CLOSE_PACKS);
    return this._processRetention(this.storageBuckets.closePacks, cutoffDate, 'closepack');
  }

  /**
   * Apply retention to audit logs
   */
  async applyToAuditLogs() {
    const cutoffDate = this._getCutoffDate(this.periods.AUDIT_LOGS);
    return this._processRetention(this.storageBuckets.auditLogs, cutoffDate, 'audit_log');
  }

  /**
   * Apply retention to telemetry
   */
  async applyToTelemetry() {
    const cutoffDate = this._getCutoffDate(this.periods.TELEMETRY);
    return this._processRetention(this.storageBuckets.telemetry, cutoffDate, 'telemetry');
  }

  /**
   * Apply retention to ERP receipts
   */
  async applyToERPReceipts() {
    const cutoffDate = this._getCutoffDate(this.periods.ERP_RECEIPTS);
    return this._processRetention(this.storageBuckets.erpReceipts, cutoffDate, 'erp_receipt');
  }

  /**
   * Apply retention to temp files
   */
  async applyToTempFiles() {
    const cutoffDate = this._getCutoffDate(this.periods.TEMP_FILES);
    return this._processRetention(this.storageBuckets.tempFiles, cutoffDate, 'temp_file');
  }

  /**
   * Process retention for a storage stream/bucket and delete expired entries
   */
  async _processRetention(streamOrBucket, cutoffDate, dataType) {
    const result = {
      dataType,
      stream: streamOrBucket,
      cutoffDate: cutoffDate.toISOString(),
      scannedCount: 0,
      deletedCount: 0,
      bytesFreed: 0,
      errors: [],
    };

    try {
      // Query log entries older than cutoff date
      // CALLER-BUG 45 FIX: Guard against null/undefined return from queryLog.
      // If the storage adapter returns null (e.g., stream doesn't exist yet,
      // or Supabase returns null for an empty result), entries.length throws
      // "Cannot read properties of null". Default to empty array so the
      // retention step completes with scannedCount=0 instead of erroring.
      const rawEntries = await storage.queryLog(streamOrBucket, {
        endTime: cutoffDate.toISOString(),
        limit: 100000,
      });
      const entries = rawEntries || [];

      result.scannedCount = entries.length;

      if (entries.length > 0 && !this.dryRun) {
        // Delete log entries before cutoff date
        const deleteResult = await storage.deleteLogBefore(streamOrBucket, cutoffDate);
        result.deletedCount = deleteResult.deleted || 0;

        // CALLER-BUG 4 FIX: Only log deletions AFTER confirmed successful deletion,
        // and only log the actual count — not every scanned entry.
        // Old code logged ALL scanned entries to deletionLog regardless of how
        // many were actually deleted, corrupting the audit trail. If
        // deleteLogBefore reports 5 deletions but we scanned 100 entries,
        // the deletionLog would show 100 entries deleted — a compliance violation.
        if (result.deletedCount > 0) {
          this.deletionLog.push({
            timestamp: new Date().toISOString(),
            dataType,
            deletedCount: result.deletedCount,
            cutoffDate: cutoffDate.toISOString(),
            dryRun: false,
          });
        }
      }

      result.status = 'completed';
    } catch (err) {
      result.status = 'error';
      result.errors.push({ error: err.message });
    }

    return result;
  }

  /**
   * Calculate cutoff date
   */
  // CALLER-BUG 44 FIX: Use millisecond arithmetic for DST-safe date calculation.
  // Old code used date.setDate(date.getDate() - retentionDays), which manipulates
  // the day-of-month component. At DST boundaries, this can shift by ±1 hour,
  // producing a cutoff time that's either 23 or 25 hours from the previous day's
  // cutoff. For 7-year retention (2555 days), the accumulated error is negligible,
  // but for TEMP_FILES (7 days) crossing a DST boundary, a file could be deleted
  // 1 hour early or retained 1 hour late. Use getTime() - (ms) for precision.
  // Also validates retentionDays to prevent NaN/Infinity propagation.
  _getCutoffDate(retentionDays) {
    if (typeof retentionDays !== 'number' || !isFinite(retentionDays) || retentionDays < 0) {
      throw new Error(`[RetentionPolicyManager] _getCutoffDate: retentionDays must be a non-negative finite number, got ${retentionDays}`);
    }
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    return new Date(Date.now() - (retentionDays * MS_PER_DAY));
  }

  /**
   * Get deletion log
   */
  getDeletionLog(options = {}) {
    let log = [...this.deletionLog];

    if (options.dataType) {
      log = log.filter(l => l.dataType === options.dataType);
    }

    if (options.since) {
      const sinceDate = new Date(options.since);
      log = log.filter(l => new Date(l.timestamp) >= sinceDate);
    }

    if (options.limit) {
      log = log.slice(-options.limit);
    }

    return log;
  }

  /**
   * Generate retention report
   */
  // CALLER-BUG 48 FIX: Validate period values before generating report.
  // Old code passed this.periods values directly to _getCutoffDate(). Since
  // the constructor merges user-supplied options.periods with defaults via
  // spread, a caller can pass { periods: { CLOSE_PACKS: 'never' } }. The
  // string 'never' reaches _getCutoffDate → new Date(NaN) → invalid date →
  // toISOString() throws "Invalid time value". Catch per-period errors so
  // one bad period doesn't crash the entire report.
  generateReport() {
    const report = {
      generated_at: new Date().toISOString(),
      policies: {},
    };

    // Document policies
    for (const [key, days] of Object.entries(this.periods)) {
      try {
        const cutoff = this._getCutoffDate(days);
        report.policies[key] = {
          retention_days: days,
          retention_years: (days / 365).toFixed(1),
          cutoff_date: cutoff.toISOString(),
        };
      } catch (err) {
        report.policies[key] = {
          retention_days: days,
          error: err.message,
        };
      }
    }

    // Note: Storage analysis requires querying the storage adapter
    // and can be implemented as a separate async method if needed
    report.note = 'Storage analysis requires async queries to storage adapter and should be performed via applyAll() or a dedicated method';

    return report;
  }

  /**
   * Schedule retention job (returns cron expression)
   */
  static getSchedule(frequency = 'daily') {
    switch (frequency) {
      case 'hourly':
        return '0 * * * *';
      case 'daily':
        return '0 2 * * *'; // 2 AM daily
      case 'weekly':
        return '0 2 * * 0'; // 2 AM Sunday
      case 'monthly':
        return '0 2 1 * *'; // 2 AM first of month
      default:
        return '0 2 * * *';
    }
  }
}

// ============================================================================
// LEGAL HOLD MANAGER
// ============================================================================

export class LegalHoldManager {
  constructor() {
    this.holds = new Map(); // closeId -> hold info
  }

  /**
   * Place legal hold on data (prevents deletion)
   */
  // CALLER-BUG 30 FIX: Validate inputs for compliance-critical hold parameters.
  // Old code accepted null/undefined reason and requestedBy, creating holds
  // with incomplete audit information. Every legal hold must be fully documented
  // with a reason and responsible party for compliance.
  placeHold(closeId, {
    reason,
    requestedBy,
    expiresAt = null,
  }) {
    if (!closeId || typeof closeId !== 'string') {
      throw new Error('[LegalHoldManager] placeHold: closeId is required and must be a string');
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      throw new Error('[LegalHoldManager] placeHold: reason is required and must be a non-empty string');
    }
    if (!requestedBy || typeof requestedBy !== 'string') {
      throw new Error('[LegalHoldManager] placeHold: requestedBy is required and must be a string');
    }

    const hold = {
      hold_id: `HOLD-${crypto.randomBytes(8).toString('hex').toUpperCase()}`,
      close_id: closeId,
      reason,
      requested_by: requestedBy,
      placed_at: new Date().toISOString(),
      expires_at: expiresAt,
      status: 'active',
    };

    this.holds.set(closeId, hold);
    return hold;
  }

  /**
   * Release legal hold
   */
  // CALLER-BUG 46 FIX: Validate releasedBy parameter.
  // Old code accepted null/undefined releasedBy, creating holds with
  // released_by: undefined — a compliance violation. Every hold release
  // must record who authorized the release for audit trail purposes.
  // Also prevent releasing an already-released hold (idempotency).
  releaseHold(closeId, releasedBy) {
    if (!releasedBy || typeof releasedBy !== 'string') {
      throw new Error('[LegalHoldManager] releaseHold: releasedBy is required and must be a string');
    }

    const hold = this.holds.get(closeId);
    if (!hold) return null;

    // Idempotent: if already released, return current state
    if (hold.status === 'released') return hold;

    hold.status = 'released';
    hold.released_at = new Date().toISOString();
    hold.released_by = releasedBy;

    return hold;
  }

  /**
   * Check if data is under legal hold
   */
  // CALLER-BUG 34 FIX: Don't mutate hold state during a read operation.
  // Old code set hold.status = 'expired' inside isUnderHold(), which is a
  // read/query method. In multi-process environments, another process may
  // still see the hold as 'active' from its own in-memory Map, creating
  // inconsistent results. Read operations should be side-effect free.
  isUnderHold(closeId) {
    const hold = this.holds.get(closeId);
    if (!hold) return false;
    if (hold.status !== 'active') return false;

    // Check expiration WITHOUT mutating — read operations must be pure
    if (hold.expires_at && new Date(hold.expires_at) < new Date()) {
      return false;
    }

    return true;
  }

  /**
   * Get all active holds
   */
  // CALLER-BUG 47 FIX: Check expiration in getActiveHolds().
  // Old code only checked hold.status === 'active' but ignored expires_at.
  // A hold with status 'active' but past its expiration date would still
  // appear in the active holds list — misleading for compliance dashboards.
  // This matches the expiration check in isUnderHold() for consistency.
  getActiveHolds() {
    const active = [];
    const now = new Date();
    for (const hold of this.holds.values()) {
      if (hold.status === 'active') {
        // Skip expired holds (consistent with isUnderHold)
        if (hold.expires_at && new Date(hold.expires_at) < now) {
          continue;
        }
        active.push(hold);
      }
    }
    return active;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default RetentionPolicyManager;
