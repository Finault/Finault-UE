/**
 * Finault Phase 4: ERP Posting Service
 *
 * Handles idempotent posting of close pack journal entries to ERPs
 * with receipt pack generation and variance reconciliation.
 *
 * Key invariants:
 * - Idempotent: Same inputs always return same receipt (no duplicate ERP docs)
 * - Immutable: Close pack ZIP never modified, receipt pack is separate
 * - Fail-closed: Mapping errors or ERP failures abort (no partial posting)
 */

import crypto from 'crypto';
import JSZip from 'jszip';
import { storage } from '../agentos/core/storage-adapter.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const ERP_POSTING_CONFIG = {
  maxRetries: 3,
  retryDelayMs: 5000,
  timeoutMs: 60000,
  version: '1.0',
  sandboxDir: 'sandbox-receipts',
};

// Check for sandbox mode via environment variable
const ERP_SANDBOX = process.env.ERP_SANDBOX === 'true';

// ============================================================================
// ID GENERATION
// ============================================================================

function generateAttemptId(closeId, timestamp) {
  const input = `${closeId}|attempt|${timestamp}`;
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  return `FIN-ERP-ATT-${hash.substring(0, 12).toUpperCase()}`;
}

function generateReceiptId(closeId, erpDocId) {
  const input = `${closeId}|receipt|${erpDocId}`;
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  return `FIN-ERP-RCPT-${hash.substring(0, 12).toUpperCase()}`;
}

function generateVarianceId(closeId, dimension, timestamp) {
  const input = `${closeId}|variance|${dimension}|${timestamp}`;
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  return `FIN-ERP-VAR-${hash.substring(0, 12).toUpperCase()}`;
}

/**
 * Compute idempotency key
 * idempotency_key = sha256(close_id | zip_sha256 | journal_entry_sha256 | erp | entity | posting_policy_id)
 */
function computeIdempotencyKey({ closeId, zipSha256, journalEntrySha256, erp, entity, postingPolicyId }) {
  const input = `${closeId}|${zipSha256}|${journalEntrySha256}|${erp}|${entity}|${postingPolicyId}`;
  return crypto.createHash('sha256').update(input).digest('hex');
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// ============================================================================
// ERP POSTING SERVICE
// ============================================================================

export class ERPPostingService {
  constructor(options = {}) {
    this.config = { ...ERP_POSTING_CONFIG, ...options };
    this.erpIntegrations = options.erpIntegrations || null;
    this.sandbox = options.sandbox || ERP_SANDBOX || false;
    this.erp = options.erp || 'default';
  }

  /**
   * Post journal entry to ERP with idempotency
   *
   * @param {Object} params - Posting parameters
   * @param {string} params.closeId - Close ID
   * @param {Buffer} params.zipBuffer - Close pack ZIP bytes
   * @param {Object} params.manifest - Close pack manifest
   * @param {string} params.erp - Target ERP system
   * @param {string} params.entity - Target entity/subsidiary
   * @param {string} params.postingPolicyId - Posting policy ID
   * @param {Object} params.db - Database client for idempotency lookups
   * @param {boolean} params.dryRun - If true, don't actually post to ERP
   * @returns {Object} - Posting result
   */
  // CALLER-BUG 26 FIX: Validate required parameters before processing.
  // Old code: if zipBuffer is null, sha256(null) crashes with "The first argument
  // must be of type string or Buffer". If closeId is undefined, the idempotency
  // key contains 'undefined', breaking idempotency enforcement. Fail-fast with
  // clear error messages instead of cryptic downstream crashes.
  async post({ closeId, zipBuffer, manifest, erp, entity, postingPolicyId, db, dryRun = false }) {
    if (!closeId || typeof closeId !== 'string') {
      return { success: false, status: 'FAILED', error: 'closeId is required and must be a string', closeId };
    }
    if (!zipBuffer || !Buffer.isBuffer(zipBuffer) || zipBuffer.length === 0) {
      return { success: false, status: 'FAILED', error: 'zipBuffer is required and must be a non-empty Buffer', closeId };
    }
    if (!manifest || typeof manifest !== 'object') {
      return { success: false, status: 'FAILED', error: 'manifest is required and must be an object', closeId };
    }
    if (!erp || !entity || !postingPolicyId) {
      return { success: false, status: 'FAILED', error: 'erp, entity, and postingPolicyId are required', closeId };
    }

    const timestamp = new Date().toISOString();

    // Compute hashes
    const zipSha256 = sha256(zipBuffer);

    // Verify ZIP integrity
    if (manifest.artifact_hashes && manifest.manifest_hash) {
      const manifestForHash = { ...manifest, manifest_hash: undefined };
      const computedManifestHash = sha256(JSON.stringify(manifestForHash));
      if (computedManifestHash !== manifest.manifest_hash) {
        return {
          success: false,
          status: 'FAILED',
          error: 'ZIP integrity check failed: manifest hash mismatch',
          closeId,
        };
      }
    }

    // Extract journal entry from ZIP
    const zip = await JSZip.loadAsync(zipBuffer);
    const journalEntry = await this._extractJournalEntry(zip, closeId);

    if (!journalEntry) {
      return {
        success: false,
        status: 'FAILED',
        error: 'Journal entry not found in close pack',
        closeId,
      };
    }

    const journalEntrySha256 = sha256(journalEntry.csv);

    // Compute idempotency key
    const idempotencyKey = computeIdempotencyKey({
      closeId,
      zipSha256,
      journalEntrySha256,
      erp,
      entity,
      postingPolicyId,
    });

    // Check for existing receipt (idempotent return)
    if (db) {
      const existingReceipt = await this._checkExistingReceipt(db, idempotencyKey);
      if (existingReceipt) {
        return {
          success: true,
          status: 'ALREADY_POSTED',
          idempotent: true,
          receipt: existingReceipt,
          message: 'Journal entry already posted (idempotent return)',
          closeId,
        };
      }

      // Check for in-progress posting
      const inProgress = await this._checkInProgress(db, idempotencyKey);
      if (inProgress) {
        return {
          success: false,
          status: 'IN_PROGRESS',
          error: 'Posting already in progress for this close',
          closeId,
        };
      }
    }

    // Generate attempt ID
    const attemptId = generateAttemptId(closeId, timestamp);

    // Record attempt start
    const attempt = {
      attemptId,
      closeId,
      closepackZipSha256: zipSha256,
      journalEntrySha256,
      erp,
      entity,
      postingPolicyId,
      idempotencyKey,
      status: 'STARTED',
      createdAt: timestamp,
    };

    if (db) {
      await this._recordAttempt(db, attempt);
    }

    // Dry run - return what would be posted
    if (dryRun) {
      return {
        success: true,
        status: 'DRY_RUN',
        dryRun: true,
        attempt,
        journalEntry: journalEntry.rows,
        message: 'Dry run - no ERP call made',
        closeId,
      };
    }

    // Actually post to ERP
    try {
      const postingResult = await this._postToERP({
        erp,
        entity,
        postingPolicyId,
        journalEntry,
        closeId,
        timestamp,
      });

      if (!postingResult.success) {
        // Record failure
        if (db) {
          await this._recordFailure(db, attemptId, postingResult.error);
        }

        return {
          success: false,
          status: 'FAILED',
          attemptId,
          error: postingResult.error,
          closeId,
        };
      }

      // Generate receipt
      const receiptId = generateReceiptId(closeId, postingResult.erpDocumentId);
      const receipt = {
        receiptId,
        attemptId,
        closeId,
        erp,
        entity,
        erpDocumentId: postingResult.erpDocumentId,
        journalEntrySha256,
        linesPosted: journalEntry.rows.length,
        totalDebit: journalEntry.totalDebit,
        totalCredit: journalEntry.totalCredit,
        postedAt: timestamp,
      };

      // Generate receipt pack
      const receiptPack = await this._generateReceiptPack({
        receipt,
        closeId,
        manifest,
        journalEntry,
        erpResponse: postingResult.erpResponse,
      });

      const isSandbox = this.sandbox || postingResult.sandbox;
      receipt.receiptPackR2Key = isSandbox
        ? `${this.config.sandboxDir}/${closeId}.zip`
        : `erp-receipts/${closeId}.zip`;
      receipt.receiptPackZipSha256 = receiptPack.sha256;
      receipt.varianceStatus = 'PENDING';
      receipt.mode = isSandbox ? 'sandbox' : 'production';

      // Record receipt (sandbox mode still records for idempotency tracking)
      if (db) {
        await this._recordReceipt(db, receipt);
      }

      return {
        success: true,
        status: isSandbox ? 'SANDBOX_POSTED' : 'POSTED',
        sandbox: isSandbox,
        receipt,
        receiptPack,
        receiptPath: receipt.receiptPackR2Key,
        message: isSandbox
          ? 'Journal entry posted to sandbox (no production ERP touched)'
          : 'Journal entry posted successfully',
        closeId,
      };

    } catch (error) {
      // Record failure
      if (db) {
        await this._recordFailure(db, attemptId, error.message);
      }

      return {
        success: false,
        status: 'FAILED',
        attemptId,
        error: error.message,
        closeId,
      };
    }
  }

  /**
   * Extract journal entry from ZIP
   */
  async _extractJournalEntry(zip, closeId) {
    // Find journal entry file
    const journalFiles = Object.keys(zip.files).filter(f =>
      f.includes('journal-entry') && f.endsWith('.csv')
    );

    if (journalFiles.length === 0) {
      return null;
    }

    // CALLER-BUG 32 FIX: Guard against null file handle from zip.file().
    // zip.file() returns null for directory entries or if the path doesn't
    // match despite appearing in Object.keys(zip.files). Calling .async()
    // on null throws TypeError that surfaces as an opaque error.
    const journalFileHandle = zip.file(journalFiles[0]);
    if (!journalFileHandle) {
      return null;
    }
    const csv = await journalFileHandle.async('string');
    const rows = this._parseJournalCSV(csv);

    // Calculate totals
    let totalDebit = 0;
    let totalCredit = 0;

    for (const row of rows) {
      totalDebit += parseFloat(row.Debit) || 0;
      totalCredit += parseFloat(row.Credit) || 0;
    }

    return {
      path: journalFiles[0],
      csv,
      rows,
      totalDebit: Number(totalDebit.toFixed(2)),
      totalCredit: Number(totalCredit.toFixed(2)),
    };
  }

  /**
   * Parse journal entry CSV
   */
  // CALLER-BUG 40 FIX: Handle RFC 4180 quoted CSV fields.
  // Old code used naive split(',') which breaks when fields contain commas
  // inside quotes (e.g., "Smith, John" or "1,000.00"). This corrupts column
  // alignment: a 7-column row becomes 8+ columns, Debit/Credit values shift
  // to wrong columns, and financial totals become incorrect.
  _parseJournalCSV(csv) {
    const lines = csv.split('\n');
    if (lines.length < 2) return [];

    const parseCSVLine = (line) => {
      const values = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      return values;
    };

    const headers = parseCSVLine(lines[0]);
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const values = parseCSVLine(lines[i]);
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || '';
      });
      rows.push(row);
    }

    return rows;
  }

  /**
   * Post to ERP (with sandbox mode support)
   *
   * Sandbox Mode:
   * - Same CLI/API trigger as live ERP posting
   * - Idempotency key enforced
   * - Journal CSV posted to sandbox-receipts/ directory
   * - Receipt pack still generated with status: "sandbox_mode"
   */
  async _postToERP({ erp, entity, postingPolicyId, journalEntry, closeId, timestamp }) {
    // Sandbox mode - emulate posting without touching production ERP
    if (this.sandbox) {
      return this._postToSandbox({ erp, entity, postingPolicyId, journalEntry, closeId, timestamp });
    }

    // Production mode - call actual ERP API
    if (this.erpIntegrations) {
      const integration = this.erpIntegrations[erp];
      if (integration) {
        try {
          const result = await integration.postJournalEntry({
            entity,
            postingPolicyId,
            journalEntry: journalEntry.rows,
            closeId,
            timestamp,
          });
          return {
            success: result.success,
            erpDocumentId: result.documentId,
            erpResponse: result,
          };
        } catch (error) {
          return {
            success: false,
            error: error.message,
          };
        }
      }
    }

    // CALLER-BUG 27 FIX: Fail-closed when no ERP integration is configured.
    // Old code returned success:true with a fake ERP document ID, making the
    // system believe the posting succeeded when no actual ERP was touched.
    // In production, this causes journal entries to be marked as posted when
    // they never reached the ERP — a financial data integrity violation.
    // Only allow simulation in explicitly sandboxed environments.
    return {
      success: false,
      error: `ERP integration '${erp}' not configured. Set sandbox=true for development or provide erpIntegrations.`,
    };
  }

  /**
   * Sandbox mode posting - writes to local storage instead of ERP
   *
   * Behavior:
   * - Same idempotency key enforcement as production
   * - Journal CSV written to sandbox-receipts/ directory
   * - Full receipt pack generated with status: "sandbox_mode"
   * - Enables testing without touching production ERP
   */
  async _postToSandbox({ erp, entity, postingPolicyId, journalEntry, closeId, timestamp }) {
    const sandboxDir = this.config.sandboxDir || 'sandbox-receipts';

    // Generate sandbox document ID
    const erpDocumentId = `SANDBOX-JE-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const sandboxReceipt = {
      mode: 'sandbox',
      documentId: erpDocumentId,
      closeId,
      erp,
      entity,
      postingPolicyId,
      linesCount: journalEntry.rows.length,
      totalDebit: journalEntry.totalDebit,
      totalCredit: journalEntry.totalCredit,
      timestamp,
      sandboxDir,
      note: 'This is a sandbox emulation - no production ERP was touched',
    };

    // Write files to sandbox storage
    try {
      const sandboxBucket = 'sandbox-receipts';

      // Write journal CSV
      await storage.putDocument(sandboxBucket, `${closeId}-journal.csv`, journalEntry.csv);

      // Write receipt JSON
      await storage.putDocument(sandboxBucket, `${closeId}-receipt.json`, JSON.stringify(sandboxReceipt, null, 2));

      // Write reconciliation stub CSV
      const reconciliationCSV = [
        'dimension_type,dimension_value,currency,finault_amount,erp_amount,delta_amount,delta_pct,status,notes',
        `total,${closeId},USD,${journalEntry.totalDebit},${journalEntry.totalDebit},0,0,PASS,Sandbox reconciliation`,
      ].join('\n');
      await storage.putDocument(sandboxBucket, `${closeId}-reconciliation.csv`, reconciliationCSV);

      sandboxReceipt.filesWritten = [
        `${sandboxBucket}/${closeId}-journal.csv`,
        `${sandboxBucket}/${closeId}-receipt.json`,
        `${sandboxBucket}/${closeId}-reconciliation.csv`,
      ];
    } catch (error) {
      // CALLER-BUG 41 FIX: Fail-closed on sandbox storage errors.
      // Old code caught storage.putDocument errors, logged a warning, and
      // continued to return success:true. This means the caller (post()) thinks
      // the sandbox posting succeeded, records a receipt, and marks the close
      // as SANDBOX_POSTED — but the journal CSV, receipt JSON, and reconciliation
      // CSV were never actually written. Next call with the same idempotency key
      // returns ALREADY_POSTED with no backing files. Sandbox mode must be as
      // reliable as production mode for testing to be meaningful.
      return {
        success: false,
        error: `Sandbox storage write failed: ${error.message}`,
        sandbox: true,
      };
    }

    return {
      success: true,
      erpDocumentId,
      sandbox: true,
      sandboxDir,
      erpResponse: {
        ...sandboxReceipt,
        status: 'SANDBOX_POSTED',
        timestamp,
        linesCreated: journalEntry.rows.length,
      },
    };
  }

  /**
   * Generate receipt pack ZIP
   */
  async _generateReceiptPack({ receipt, closeId, manifest, journalEntry, erpResponse }) {
    const zip = new JSZip();
    const artifacts = [];
    const hashes = {};

    // Determine if this is a sandbox receipt
    const isSandbox = this.sandbox || erpResponse?.sandbox || erpResponse?.status === 'SANDBOX_POSTED';

    // ERP post receipt JSON
    const receiptJson = JSON.stringify({
      version: this.config.version,
      close_id: closeId,
      closepack_zip_sha256: manifest?.manifest_hash,
      journal_entry_sha256: receipt.journalEntrySha256,
      erp: receipt.erp,
      entity: receipt.entity,
      erp_document_id: receipt.erpDocumentId,
      lines_posted: receipt.linesPosted,
      total_debit: receipt.totalDebit,
      total_credit: receipt.totalCredit,
      posted_at: receipt.postedAt,
      idempotency_key: receipt.idempotencyKey,
      mode: isSandbox ? 'sandbox' : 'production',
      notes: isSandbox
        ? 'SANDBOX MODE: Receipt pack proves idempotency key computation, no production ERP was touched'
        : 'Receipt pack proves posting of exact closepack hash',
    }, null, 2);

    const receiptPath = `receipts/erp_post_receipt.json`;
    zip.file(receiptPath, receiptJson);
    hashes[receiptPath] = sha256(receiptJson);
    artifacts.push(receiptPath);

    // ERP raw response (sanitized)
    if (erpResponse) {
      const responseJson = JSON.stringify(erpResponse, null, 2);
      const responsePath = `receipts/erp_raw_response.json`;
      zip.file(responsePath, responseJson);
      hashes[responsePath] = sha256(responseJson);
      artifacts.push(responsePath);
    }

    // Copy of posted journal entry
    const journalPath = `receipts/posted_journal_entry.csv`;
    zip.file(journalPath, journalEntry.csv);
    hashes[journalPath] = sha256(journalEntry.csv);
    artifacts.push(journalPath);

    // Manifest
    const packManifest = {
      version: this.config.version,
      pack_type: 'erp_receipt_pack',
      close_id: closeId,
      receipt_id: receipt.receiptId,
      erp: receipt.erp,
      entity: receipt.entity,
      erp_document_id: receipt.erpDocumentId,
      posted_at: receipt.postedAt,
      artifacts: artifacts.sort(),
      artifact_hashes: hashes,
      created_at: new Date().toISOString(),
    };

    const manifestJson = JSON.stringify(packManifest, null, 2);
    zip.file('manifest.json', manifestJson);

    // Generate ZIP buffer
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    return {
      zip,
      buffer: zipBuffer,
      sha256: sha256(zipBuffer),
      manifest: packManifest,
    };
  }

  /**
   * Perform variance reconciliation between Finault and ERP
   */
  async reconcileVariance({ closeId, receiptId, finaultTotals, erpTotals, toleranceAmount = 0, tolerancePct = 0 }) {
    const timestamp = new Date().toISOString();
    const varianceRecords = [];
    let overallStatus = 'PASS';

    // Compare each dimension
    const allDimensions = new Set([
      ...Object.keys(finaultTotals),
      ...Object.keys(erpTotals),
    ]);

    for (const dimension of allDimensions) {
      const finaultAmount = finaultTotals[dimension] || 0;
      const erpAmount = erpTotals[dimension] || 0;
      const varianceAmount = finaultAmount - erpAmount;
      const variancePct = erpAmount !== 0
        ? (varianceAmount / Math.abs(erpAmount)) * 100
        : (finaultAmount === 0 ? 0 : 100);

      // Determine status based on tolerance
      let status = 'PASS';
      if (Math.abs(varianceAmount) > toleranceAmount || Math.abs(variancePct) > tolerancePct) {
        status = 'FAIL';
        overallStatus = 'FAIL';
      }

      varianceRecords.push({
        varianceId: generateVarianceId(closeId, dimension, timestamp),
        closeId,
        receiptId,
        dimensionType: 'total',
        dimensionValue: dimension,
        finaultAmount: Number(finaultAmount.toFixed(2)),
        erpAmount: Number(erpAmount.toFixed(2)),
        varianceAmount: Number(varianceAmount.toFixed(2)),
        variancePct: Number(variancePct.toFixed(4)),
        currency: 'USD',
        status,
        createdAt: timestamp,
      });
    }

    return {
      closeId,
      receiptId,
      overallStatus,
      varianceRecords,
      totalVarianceAmount: varianceRecords.reduce((sum, v) => sum + Math.abs(v.varianceAmount), 0),
      reconciledAt: timestamp,
    };
  }

  /**
   * Generate ERP variance reconciliation CSV
   */
  generateVarianceCSV(varianceRecords) {
    const headers = [
      'dimension_type',
      'dimension_value',
      'currency',
      'finault_amount',
      'erp_amount',
      'delta_amount',
      'delta_pct',
      'status',
      'notes',
    ];

    const lines = [headers.join(',')];

    for (const record of varianceRecords) {
      lines.push([
        record.dimensionType,
        record.dimensionValue,
        record.currency,
        record.finaultAmount.toFixed(2),
        record.erpAmount.toFixed(2),
        record.varianceAmount.toFixed(2),
        record.variancePct.toFixed(4),
        record.status,
        record.notes || '',
      ].join(','));
    }

    return lines.join('\n');
  }

  // Database interaction methods using Supabase

  /**
   * Check for existing receipt using idempotency key
   * Returns existing receipt if posting already succeeded
   * Query: SELECT r.* FROM erp_post_receipts r
   *        JOIN erp_post_attempts a ON r.attempt_id = a.attempt_id
   *        WHERE a.idempotency_key = $1 AND a.status = 'POSTED'
   */
  async _checkExistingReceipt(db, idempotencyKey) {
    try {
      const { data, error } = await db
        .rpc('get_receipt_by_idempotency_key', {
          p_idempotency_key: idempotencyKey,
        });

      if (error) {
        // CALLER-BUG 6 FIX: Throw on DB error instead of returning null.
        // Old code returned null, which means "no existing receipt", allowing
        // a duplicate ERP posting. In financial systems, if we can't verify
        // whether a receipt already exists, we must NOT proceed with a new
        // posting. Throw so the caller's error handling can safely abort.
        throw new Error(`Failed to check existing receipt: ${error.message}`);
      }

      // RPC returns array, get first element or null
      return data && data.length > 0 ? data[0] : null;
    } catch (err) {
      // Re-throw to caller — fail-closed for financial safety
      throw err;
    }
  }

  /**
   * Check if posting is already in progress for this idempotency key
   * Prevents duplicate concurrent postings
   * Query: SELECT EXISTS (SELECT 1 FROM erp_post_attempts
   *        WHERE idempotency_key = $1 AND status = 'STARTED'
   *        AND created_at > now() - INTERVAL '5 minutes')
   */
  async _checkInProgress(db, idempotencyKey) {
    try {
      const { data, error } = await db
        .rpc('is_posting_in_progress', {
          p_idempotency_key: idempotencyKey,
        });

      if (error) {
        // CALLER-BUG 5 FIX: Throw on DB error instead of returning false.
        // Old code returned false on DB error, which means "not in progress",
        // allowing a duplicate posting to proceed. In financial systems,
        // fail-closed is the only safe default — assume in-progress if we
        // can't verify otherwise. Throw so the caller can decide.
        throw new Error(`Failed to check in-progress status: ${error.message}`);
      }

      return data === true;
    } catch (err) {
      // Re-throw to caller — fail-closed for financial safety
      throw err;
    }
  }

  /**
   * Record a new ERP posting attempt
   * INSERT into erp_post_attempts table
   */
  // CALLER-BUG 29 FIX: Propagate DB errors instead of swallowing them.
  // Old code caught insert errors and only logged warnings. If _recordAttempt
  // fails, _checkInProgress won't see the attempt in the DB, so a concurrent
  // request with the same idempotency key will also proceed — creating a
  // duplicate ERP posting. For financial safety, attempt recording MUST succeed
  // or the posting must abort.
  async _recordAttempt(db, attempt) {
    const { error } = await db
      .from('erp_post_attempts')
      .insert({
        attempt_id: attempt.attemptId,
        close_id: attempt.closeId,
        closepack_zip_sha256: attempt.closepackZipSha256,
        journal_entry_sha256: attempt.journalEntrySha256,
        erp: attempt.erp,
        entity: attempt.entity,
        posting_policy_id: attempt.postingPolicyId,
        idempotency_key: attempt.idempotencyKey,
        status: attempt.status,
        created_at: attempt.createdAt,
      });

    if (error) {
      throw new Error(`Failed to record attempt: ${error.message}`);
    }
  }

  /**
   * Record a posting failure
   * Note: erp_post_attempts table is INSERT-only per doctrine constraints
   * We cannot update status in production. This logs the error for diagnostic purposes.
   * In the real system, failures would trigger a separate event record or status machine.
   */
  async _recordFailure(db, attemptId, errorMessage) {
    try {
      // For now, we log the failure but cannot update the attempt due to INSERT-only constraints
      // In a production system with proper event sourcing, we'd insert an event record
      console.error(`ERP Posting Failure - Attempt: ${attemptId}, Error: ${errorMessage}`);

      // Log to error tracking if available
      if (db) {
        try {
          await db
            .from('error_tracking')
            .insert({
              error_type: 'erp_posting_failure',
              reference_id: attemptId,
              error_message: errorMessage,
              created_at: new Date().toISOString(),
            });
        } catch (logErr) {
          console.warn(`Could not log to error_tracking: ${logErr.message}`);
        }
      }
    } catch (err) {
      console.warn(`Error recording failure: ${err.message}`);
    }
  }

  /**
   * Record successful receipt after posting to ERP
   * INSERT into erp_post_receipts table
   */
  // CALLER-BUG 28 FIX: Propagate DB errors instead of swallowing them.
  // Old code caught receipt insert errors and only logged warnings. If
  // _recordReceipt fails, _checkExistingReceipt won't find the receipt
  // in the DB. Next time the same inputs are posted, the idempotency check
  // returns null ("no existing receipt"), causing a DUPLICATE ERP posting —
  // a critical financial data integrity violation.
  async _recordReceipt(db, receipt) {
    const { error } = await db
      .from('erp_post_receipts')
      .insert({
        receipt_id: receipt.receiptId,
        attempt_id: receipt.attemptId,
        close_id: receipt.closeId,
        erp: receipt.erp,
        entity: receipt.entity,
        erp_document_id: receipt.erpDocumentId,
        receipt_pack_r2_key: receipt.receiptPackR2Key,
        receipt_pack_zip_sha256: receipt.receiptPackZipSha256,
        journal_entry_sha256: receipt.journalEntrySha256,
        lines_posted: receipt.linesPosted,
        total_debit: receipt.totalDebit,
        total_credit: receipt.totalCredit,
        variance_status: receipt.varianceStatus,
        posted_at: receipt.postedAt,
        created_at: new Date().toISOString(),
      });

    if (error) {
      throw new Error(`Failed to record receipt: ${error.message}`);
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default ERPPostingService;

export {
  ERP_POSTING_CONFIG,
  ERP_SANDBOX,
  computeIdempotencyKey,
  generateAttemptId,
  generateReceiptId,
  generateVarianceId,
};
