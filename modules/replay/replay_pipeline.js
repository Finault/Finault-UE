/**
 * Finault Replay Pipeline
 *
 * Reconstructs Close Packs from telemetry logs to verify
 * replay integrity and determinism.
 *
 * Key invariants:
 * - Same telemetry → Same Close Pack
 * - Lexicographic ordering
 * - 2dp precision for all amounts
 * - SHA-256 hashing
 */

import crypto from 'crypto';
import JSZip from 'jszip';
import { storage } from '../../agentos/core/storage-adapter.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const REPLAY_CONFIG = {
  sortAlgorithm: 'lexicographic',
  precision: 2,
  hashAlgorithm: 'sha256',
  toleranceMs: 0, // No tolerance - must be exact
};

// ============================================================================
// REPLAY PIPELINE
// ============================================================================

export class ReplayPipeline {
  constructor(options = {}) {
    this.config = { ...REPLAY_CONFIG, ...options };
    this.telemetryStream = options.telemetryStream || 'telemetry-events';
    this.closePackBucket = options.closePackBucket || 'closepacks';
  }

  /**
   * Replay telemetry to reconstruct Close Pack
   *
   * @param {string} closeId - Close ID to replay
   * @param {Object} options - Replay options
   * @returns {Promise<Object>} - Replay result with comparison
   */
  // CALLER-BUG 7 FIX: Wrap entire replay pipeline in try-catch.
  // Old code had NO error handling around _loadTelemetry (storage.queryLog),
  // _generateZip (JSZip.generateAsync), or _compare (storage.getBlob / JSZip.loadAsync).
  // Any storage or JSZip error became an unhandled promise rejection, crashing
  // the serverless invocation with no error context returned to the caller.
  async replay(closeId, options = {}) {
    const startTime = Date.now();

    try {
      // Load telemetry events for this close
      const telemetryEvents = await this._loadTelemetry(closeId);

      if (telemetryEvents.length === 0) {
        return {
          success: false,
          error: 'No telemetry events found for close ID',
          closeId,
        };
      }

      // Sort events deterministically
      const sortedEvents = this._sortEvents(telemetryEvents);

      // Reconstruct journal from events
      const journal = this._reconstructJournal(sortedEvents);

      // Reconstruct URS (Unified Record Set)
      const urs = this._reconstructURS(sortedEvents);

      // Compute FCS
      const fcs = this._computeFCS(sortedEvents, journal);

      // Detect drift
      const drift = this._computeDrift(sortedEvents);

      // Build Merkle tree
      const merkle = this._buildMerkleTree([journal, urs, fcs, drift]);

      // Generate replay manifest
      const manifest = this._generateManifest({
        closeId,
        journal,
        urs,
        fcs,
        drift,
        merkle,
        eventCount: sortedEvents.length,
      });

      // Generate ZIP
      const zip = await this._generateZip({
        manifest,
        journal,
        urs,
        fcs,
        drift,
        merkle,
      });

      const replayResult = {
        success: true,
        closeId,
        manifest,
        zipSha256: zip.sha256,
        zipSize: zip.size,
        eventCount: sortedEvents.length,
        replayedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
      };

      // If original ZIP provided, compare
      if (options.originalZipKey || options.originalZipBuffer) {
        const comparison = await this._compare(zip.buffer, options.originalZipKey || options.originalZipBuffer);
        replayResult.comparison = comparison;
        replayResult.match = comparison.match;
      }

      return replayResult;
    } catch (err) {
      return {
        success: false,
        error: `Replay pipeline failed: ${err.message}`,
        closeId,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Load telemetry events from storage
   */
  // CALLER-BUG 21 FIX: Guard against null/non-array return from queryLog.
  // If storage.queryLog returns null (storage error, data corruption),
  // the caller's [...events] spread throws TypeError: events is not iterable.
  async _loadTelemetry(closeId) {
    const result = await storage.queryLog(this.telemetryStream, {
      closeId,
      limit: 100000,
    });
    return Array.isArray(result) ? result : [];
  }

  /**
   * Sort events deterministically
   */
  // CALLER-BUG 22 FIX: Guard against null timestamps producing NaN comparisons.
  // If a.timestamp is null, new Date(null) returns epoch (1970-01-01), but if it's
  // undefined or malformed, new Date(undefined) returns Invalid Date, and
  // Invalid Date - Invalid Date = NaN. NaN comparisons are always false in
  // sort(), breaking deterministic ordering and corrupting the replay ZIP hash.
  _sortEvents(events) {
    return [...events].sort((a, b) => {
      // Primary: timestamp — treat null/invalid as -Infinity (sort to front)
      const aTime = a.timestamp ? new Date(a.timestamp).getTime() : -Infinity;
      const bTime = b.timestamp ? new Date(b.timestamp).getTime() : -Infinity;
      const aTimeSafe = Number.isFinite(aTime) ? aTime : -Infinity;
      const bTimeSafe = Number.isFinite(bTime) ? bTime : -Infinity;
      const timeCompare = aTimeSafe - bTimeSafe;
      if (timeCompare !== 0) return timeCompare;

      // Secondary: event_id (lexicographic)
      return (a.event_id || '').localeCompare(b.event_id || '');
    });
  }

  /**
   * Reconstruct journal CSV from events
   */
  _reconstructJournal(events) {
    const journalEvents = events.filter(e =>
      e.event_type === 'journal_line' || e.event_type === 'transaction'
    );

    const lines = [];
    const headers = ['AccountCode', 'Description', 'Debit', 'Credit', 'Entity', 'Currency', 'Reference'];

    // CALLER-BUG 23 FIX: Guard against NaN from parseFloat on non-numeric strings.
    // Old code passed data.debit directly to _formatAmount which calls parseFloat.
    // If data.debit is "abc", parseFloat returns NaN. _formatAmount coerces to
    // "0.00" but the raw NaN also infects totalDebit/totalCredit calculations,
    // producing NaN totals that corrupt FCS reconciliation scores and Merkle hashes.
    for (const event of journalEvents) {
      const data = event.data || event.payload || {};
      const rawDebit = parseFloat(data.debit || 0);
      const rawCredit = parseFloat(data.credit || 0);
      lines.push({
        AccountCode: data.account_code || data.accountCode || '',
        Description: data.description || '',
        Debit: this._formatAmount(Number.isFinite(rawDebit) ? rawDebit : 0),
        Credit: this._formatAmount(Number.isFinite(rawCredit) ? rawCredit : 0),
        Entity: data.entity || '',
        Currency: data.currency || 'USD',
        Reference: data.reference || event.event_id || '',
      });
    }

    // Sort lines lexicographically by account code
    lines.sort((a, b) => a.AccountCode.localeCompare(b.AccountCode));

    // Generate CSV
    const csvLines = [
      headers.join(','),
      ...lines.map(l => headers.map(h => l[h]).join(',')),
    ];

    const csv = csvLines.join('\n');
    const hash = crypto.createHash('sha256').update(csv).digest('hex');

    return {
      csv,
      hash,
      lineCount: lines.length,
      totalDebit: lines.reduce((sum, l) => sum + parseFloat(l.Debit), 0),
      totalCredit: lines.reduce((sum, l) => sum + parseFloat(l.Credit), 0),
    };
  }

  /**
   * Reconstruct URS from events
   */
  _reconstructURS(events) {
    const ursEvents = events.filter(e =>
      e.event_type === 'record' || e.event_type === 'data_point'
    );

    // Build URS JSON
    const records = ursEvents.map(e => ({
      record_id: e.event_id,
      timestamp: e.timestamp,
      source: e.source || 'unknown',
      data: e.data || e.payload || {},
    }));

    // Sort by record_id
    records.sort((a, b) => (a.record_id || '').localeCompare(b.record_id || ''));

    const json = JSON.stringify(records, null, 2);
    const hash = crypto.createHash('sha256').update(json).digest('hex');

    return {
      json,
      hash,
      recordCount: records.length,
    };
  }

  /**
   * Compute FCS from events
   */
  _computeFCS(events, journal) {
    // Calculate component scores
    const metrics = {
      coverage: this._calculateCoverage(events),
      exceptions: this._calculateExceptions(events),
      reconciliation: this._calculateReconciliation(events, journal),
      comparability: this._calculateComparability(events),
      drift: this._calculateDriftScore(events),
    };

    // Weighted sum
    const weights = {
      coverage: 0.30,
      exceptions: 0.25,
      reconciliation: 0.20,
      comparability: 0.15,
      drift: 0.10,
    };

    let score = 0;
    for (const [component, weight] of Object.entries(weights)) {
      score += metrics[component] * weight;
    }

    // Round to 2dp
    score = Number(score.toFixed(2));

    // Determine tier
    let tier;
    if (score >= 0.90) tier = 'GOLD';
    else if (score >= 0.80) tier = 'SILVER';
    else if (score >= 0.70) tier = 'BRONZE';
    else tier = 'FAILED';

    const fcsData = {
      fcs_score: score,
      fcs_tier: tier,
      components: metrics,
      weights,
      computed_at: new Date().toISOString(),
    };

    const json = JSON.stringify(fcsData, null, 2);
    const hash = crypto.createHash('sha256').update(json).digest('hex');

    return {
      json,
      hash,
      score,
      tier,
    };
  }

  _calculateCoverage(events) {
    const expectedSources = ['erp', 'bank', 'payroll', 'inventory'];
    const actualSources = new Set(events.map(e => e.source).filter(Boolean));
    const coverage = expectedSources.filter(s => actualSources.has(s)).length / expectedSources.length;
    return Math.min(1, coverage);
  }

  _calculateExceptions(events) {
    const exceptionEvents = events.filter(e => e.is_exception || e.event_type === 'exception');
    const exceptionRate = events.length > 0 ? exceptionEvents.length / events.length : 0;
    return Math.max(0, 1 - exceptionRate * 10); // Penalize exceptions heavily
  }

  _calculateReconciliation(events, journal) {
    // Check if debits = credits
    const delta = Math.abs(journal.totalDebit - journal.totalCredit);
    if (delta < 0.01) return 1.0;
    if (delta < 1.0) return 0.9;
    if (delta < 10.0) return 0.7;
    return 0.5;
  }

  _calculateComparability(events) {
    // Check for baseline/prior period data
    const hasPrior = events.some(e => e.prior_period || e.baseline);
    return hasPrior ? 0.95 : 0.80;
  }

  _calculateDriftScore(events) {
    const driftEvents = events.filter(e =>
      e.event_type === 'drift' || e.drift_detected
    );

    const highDrift = driftEvents.filter(e =>
      e.drift_severity === 'HIGH' || e.deviation_percent > 20
    ).length;

    if (highDrift > 0) return 0.5;
    if (driftEvents.length > 5) return 0.7;
    if (driftEvents.length > 0) return 0.85;
    return 1.0;
  }

  /**
   * Compute drift analysis
   */
  _computeDrift(events) {
    const driftEvents = events.filter(e =>
      e.event_type === 'drift' || e.drift_detected || e.deviation_percent
    );

    const analysis = {
      summary: {
        totalEvents: driftEvents.length,
        overallDriftSeverity: 'NONE',
      },
      driftEvents: driftEvents.map(e => ({
        metric_key: e.metric_key || e.metric || 'unknown',
        deviation_percent: e.deviation_percent || 0,
        severity: e.drift_severity || this._classifyDrift(e.deviation_percent || 0),
        timestamp: e.timestamp,
      })),
    };

    // Determine overall severity
    const severities = analysis.driftEvents.map(e => e.severity);
    if (severities.includes('HIGH')) analysis.summary.overallDriftSeverity = 'HIGH';
    else if (severities.includes('MEDIUM')) analysis.summary.overallDriftSeverity = 'MEDIUM';
    else if (severities.includes('LOW')) analysis.summary.overallDriftSeverity = 'LOW';

    const json = JSON.stringify(analysis, null, 2);
    const hash = crypto.createHash('sha256').update(json).digest('hex');

    return {
      json,
      hash,
      summary: analysis.summary,
    };
  }

  _classifyDrift(deviation) {
    if (Math.abs(deviation) > 20) return 'HIGH';
    if (Math.abs(deviation) > 10) return 'MEDIUM';
    if (Math.abs(deviation) > 5) return 'LOW';
    return 'NONE';
  }

  /**
   * Build Merkle tree from artifacts
   */
  _buildMerkleTree(artifacts) {
    const leaves = artifacts
      .filter(a => a && a.hash)
      .map(a => a.hash)
      .sort();

    if (leaves.length === 0) {
      return { root_sha256: null, leaves: [], leaf_count: 0 };
    }

    // Build tree
    let level = [...leaves];
    const tree = [level];

    while (level.length > 1) {
      const nextLevel = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = level[i + 1] || left;
        const combined = [left, right].sort().join('');
        nextLevel.push(crypto.createHash('sha256').update(combined).digest('hex'));
      }
      tree.push(nextLevel);
      level = nextLevel;
    }

    const merkleData = {
      root_sha256: level[0],
      leaves: leaves.map((hash, idx) => ({ index: idx, hash })),
      leaf_count: leaves.length,
      tree_depth: tree.length,
    };

    const json = JSON.stringify(merkleData, null, 2);

    return {
      json,
      hash: merkleData.root_sha256,
      root: merkleData.root_sha256,
      leafCount: leaves.length,
    };
  }

  /**
   * Generate manifest
   */
  _generateManifest({ closeId, journal, urs, fcs, drift, merkle, eventCount }) {
    const manifest = {
      close_id: closeId,
      schema_version: '2.0',
      generated_via: 'replay',
      artifacts: [
        'derived/journal-entry.csv',
        'derived/urs.json',
        'derived/fcs.json',
        'derived/drift.json',
        'certs/merkle.json',
      ],
      artifact_hashes: {
        'derived/journal-entry.csv': journal.hash,
        'derived/urs.json': urs.hash,
        'derived/fcs.json': fcs.hash,
        'derived/drift.json': drift.hash,
        'certs/merkle.json': merkle.hash,
      },
      metadata: {
        replay_source: 'telemetry',
        event_count: eventCount,
        replayed_at: new Date().toISOString(),
      },
    };

    // Compute manifest hash
    const manifestJson = JSON.stringify(manifest, null, 2);
    manifest.manifest_hash = crypto.createHash('sha256').update(manifestJson).digest('hex');

    return manifest;
  }

  /**
   * Generate ZIP file
   */
  async _generateZip({ manifest, journal, urs, fcs, drift, merkle }) {
    const zip = new JSZip();

    // Add artifacts in sorted order
    zip.file('derived/drift.json', drift.json);
    zip.file('derived/fcs.json', fcs.json);
    zip.file('derived/journal-entry.csv', journal.csv);
    zip.file('derived/urs.json', urs.json);
    zip.file('certs/merkle.json', merkle.json);
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    return {
      buffer,
      sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      size: buffer.length,
    };
  }

  /**
   * Compare replay ZIP with original
   */
  async _compare(replayBuffer, originalZipKey) {
    const replayHash = crypto.createHash('sha256').update(replayBuffer).digest('hex');

    let originalHash;
    let originalBuffer;

    try {
      // Accept either a Buffer directly or a storage key
      if (Buffer.isBuffer(originalZipKey)) {
        originalBuffer = originalZipKey;
      } else {
        originalBuffer = await storage.getBlob(this.closePackBucket, originalZipKey);
      }
      originalHash = crypto.createHash('sha256').update(originalBuffer).digest('hex');
    } catch (e) {
      return {
        match: false,
        error: `Could not read original ZIP: ${e.message}`,
      };
    }

    const match = replayHash === originalHash;

    if (match) {
      return { match: true, message: 'Replay produces identical Close Pack' };
    }

    // CALLER-BUG 24 FIX: Wrap JSZip.loadAsync in try-catch and guard null file handles.
    // Old code: if the ZIP buffer is corrupted, loadAsync rejects uncaught.
    // If zip.file(f) returns null (directory entry, corrupted path), .async()
    // throws TypeError that crashes the comparison loop.
    let replayZip, originalZip;
    try {
      replayZip = await JSZip.loadAsync(replayBuffer);
      originalZip = await JSZip.loadAsync(originalBuffer);
    } catch (e) {
      return {
        match: false,
        error: `Failed to parse ZIP for comparison: ${e.message}`,
      };
    }

    const differences = [];

    const replayFiles = Object.keys(replayZip.files).sort();
    const originalFiles = Object.keys(originalZip.files).sort();

    // Check for missing/extra files
    for (const f of replayFiles) {
      if (!originalFiles.includes(f)) {
        differences.push({ type: 'extra_file', file: f });
      }
    }

    for (const f of originalFiles) {
      if (!replayFiles.includes(f)) {
        differences.push({ type: 'missing_file', file: f });
      }
    }

    // Compare content of common files
    for (const f of replayFiles) {
      if (!originalFiles.includes(f)) continue;

      const replayFileHandle = replayZip.file(f);
      const originalFileHandle = originalZip.file(f);

      if (!replayFileHandle || !originalFileHandle) {
        differences.push({ type: 'file_handle_error', file: f });
        continue;
      }

      try {
        const replayContent = await replayFileHandle.async('string');
        const originalContent = await originalFileHandle.async('string');

        const replayContentHash = crypto.createHash('sha256').update(replayContent).digest('hex');
        const originalContentHash = crypto.createHash('sha256').update(originalContent).digest('hex');

        if (replayContentHash !== originalContentHash) {
          differences.push({
            type: 'content_mismatch',
            file: f,
            replay_hash: replayContentHash,
            original_hash: originalContentHash,
          });
        }
      } catch (e) {
        differences.push({ type: 'file_read_error', file: f, error: e.message });
      }
    }

    return {
      match: false,
      replay_sha256: replayHash,
      original_sha256: originalHash,
      differences,
    };
  }

  /**
   * Format amount with fixed precision
   */
  _formatAmount(value) {
    return Number(parseFloat(value) || 0).toFixed(this.config.precision);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default ReplayPipeline;
