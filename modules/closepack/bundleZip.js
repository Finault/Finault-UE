/**
 * Finault Close Pack Bundler
 *
 * Creates immutable ZIP archive containing all close artifacts.
 * Extended in Phase 2 to include comparative intelligence artifacts.
 *
 * Key invariants:
 * - All artifacts are hashed and listed in manifest
 * - ZIP bytes are immutable once sealed
 * - Artifact order is deterministic (lexicographic)
 */

import JSZip from 'jszip';
import crypto from 'crypto';
import { generateJournalEntry } from './generateJournalEntry.js';
import { generateCloseCertificate } from './generateCloseCertificate.js';
import { generateExecutiveSummary } from './generateExecutiveSummary.js';

// Phase 2 imports
import {
  generateNormalizedTotals,
  generateHistoryFromData,
  generateVarianceAddendum,
  generateFCSFromAnalysis,
} from './generators/index.js';

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Generate deterministic close ID based on content hash
 * Format: FIN-CL-XXXXXXXX (8 hex chars from SHA-256)
 */
function generateCloseId(close) {
  const input = JSON.stringify({
    period_start: close.period_start,
    period_end: close.period_end,
    total_spend: close.total_spend,
    providers: close.providers?.sort(),
    created_at: close.created_at,
  });
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  return `FIN-CL-${hash.substring(0, 8).toUpperCase()}`;
}

/**
 * Calculate SHA-256 hash of content
 */
function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Convert journal entry rows to CSV
 */
function journalEntryToCSV(rows) {
  const headers = ['Date', 'Account', 'Debit', 'Credit', 'Memo'];
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push([row.Date, row.Account, row.Debit, row.Credit, row.Memo].join(','));
  }
  return lines.join('\n');
}

// ============================================================================
// MAIN BUNDLER
// ============================================================================

/**
 * Bundle close pack with all artifacts
 *
 * @param {Object} close - Close object from buildClose()
 * @param {Object} options - Bundle options
 * @param {Object} options.lineageData - Prior closes for history chain
 * @param {string} options.priorNormalizedTotalsCSV - Prior period normalized_totals.csv
 * @param {Object} options.priorManifest - Prior period manifest
 * @param {Object} options.reconciliation - Reconciliation results
 * @param {Object} options.driftAnalysis - Drift detector analysis results
 * @param {boolean} options.includePhase2 - Include Phase 2 artifacts (default: true)
 * @param {string} options.varianceMode - 'STRICT' | 'CONSERVATIVE' (default: 'CONSERVATIVE')
 * @returns {Object} - { zip: JSZip, closeId: string, manifest: Object, hashes: Object }
 */
export async function bundleClosePack(close, options = {}) {
  const {
    lineageData = [],
    priorNormalizedTotalsCSV = null,
    priorManifest = null,
    reconciliation = null,
    driftAnalysis = null,
    includePhase2 = true,
    varianceMode = 'CONSERVATIVE',
  } = options;

  const zip = new JSZip();
  const closeId = generateCloseId(close);
  const artifacts = [];
  const hashes = {};

  // =========================================================================
  // PHASE 1 ARTIFACTS (Core)
  // =========================================================================

  // Journal Entry CSV
  const journalRows = generateJournalEntry(close);
  const journalCSV = journalEntryToCSV(journalRows);
  const journalPath = `artifacts/${closeId}-journal-entry.csv`;
  zip.file(journalPath, journalCSV);
  hashes[journalPath] = sha256(journalCSV);
  artifacts.push(journalPath);

  // Close Certificate HTML
  const certificate = generateCloseCertificate(close);
  const certPath = `artifacts/${closeId}-close-certificate.html`;
  zip.file(certPath, certificate);
  hashes[certPath] = sha256(certificate);
  artifacts.push(certPath);

  // Executive Summary HTML
  const summary = generateExecutiveSummary(close);
  const summaryPath = `artifacts/${closeId}-executive-summary.html`;
  zip.file(summaryPath, summary);
  hashes[summaryPath] = sha256(summary);
  artifacts.push(summaryPath);

  // =========================================================================
  // PHASE 2 ARTIFACTS (Comparative Intelligence)
  // =========================================================================

  let normalizedTotalsResult = null;
  let historyResult = null;
  let varianceResult = null;
  let fcsResult = null;

  if (includePhase2) {
    // Normalized Totals CSV (canonical comparison schema)
    normalizedTotalsResult = generateNormalizedTotals(close, {
      artifactType: 'invoice_close',
      includeModels: true,
      includeCostCenters: true,
    });
    const normalizedPath = `derived/${closeId}-normalized-totals.csv`;
    zip.file(normalizedPath, normalizedTotalsResult.csv);
    hashes[normalizedPath] = sha256(normalizedTotalsResult.csv);
    artifacts.push(normalizedPath);

    // History JSON (close lineage chain)
    historyResult = generateHistoryFromData({
      closeId,
      artifactType: 'invoice_close',
      period: { start: close.period_start, end: close.period_end },
      lineageData,
    });
    const historyJSON = JSON.stringify(historyResult, null, 2);
    const historyPath = `derived/${closeId}-history.json`;
    zip.file(historyPath, historyJSON);
    hashes[historyPath] = sha256(historyJSON);
    artifacts.push(historyPath);

    // Variance Addendum (if prior close available)
    const priorCloseId = lineageData.length > 0 ? lineageData[0].close_id : null;
    varianceResult = generateVarianceAddendum({
      currentCSV: normalizedTotalsResult.csv,
      priorCSV: priorNormalizedTotalsCSV,
      currentManifest: { period: { start: close.period_start, end: close.period_end }, providers: close.providers },
      priorManifest,
      currentCloseId: closeId,
      priorCloseId,
      mode: varianceMode,
    });

    const variancePath = `derived/${closeId}-variance-addendum.csv`;
    zip.file(variancePath, varianceResult.csv);
    hashes[variancePath] = sha256(varianceResult.csv);
    artifacts.push(variancePath);

    // Variance data JSON (for PDF generation and analysis)
    const varianceDataJSON = JSON.stringify(varianceResult.data, null, 2);
    const varianceDataPath = `derived/${closeId}-variance-data.json`;
    zip.file(varianceDataPath, varianceDataJSON);
    hashes[varianceDataPath] = sha256(varianceDataJSON);
    artifacts.push(varianceDataPath);

    // FCS (Finault Confidence Score)
    fcsResult = generateFCSFromAnalysis({
      reconciliation: reconciliation || {
        all_reconciled: true,
        discrepancies: [],
        status: 'clean',
      },
      driftAnalysis: driftAnalysis || {
        summary: { overallDriftSeverity: 'NONE' },
        driftEvents: [],
      },
      history: historyResult,
      close,
    });
    const fcsJSON = JSON.stringify(fcsResult, null, 2);
    const fcsPath = `derived/${closeId}-fcs.json`;
    zip.file(fcsPath, fcsJSON);
    hashes[fcsPath] = sha256(fcsJSON);
    artifacts.push(fcsPath);

    // Drift Summary CSV (if drift analysis provided)
    if (driftAnalysis && driftAnalysis.driftEvents?.length > 0) {
      const { DriftDetector } = await import('../../platform/drift-detector.js');
      const detector = new DriftDetector();
      const driftCSV = detector.generateDriftSummaryCSV(driftAnalysis);
      const driftPath = `derived/${closeId}-drift-summary.csv`;
      zip.file(driftPath, driftCSV);
      hashes[driftPath] = sha256(driftCSV);
      artifacts.push(driftPath);

      // Baseline Summary JSON
      const baselineJSON = JSON.stringify(detector.generateBaselineSummaryJSON(driftAnalysis), null, 2);
      const baselinePath = `derived/${closeId}-baseline-summary.json`;
      zip.file(baselinePath, baselineJSON);
      hashes[baselinePath] = sha256(baselineJSON);
      artifacts.push(baselinePath);
    }
  }

  // =========================================================================
  // MANIFEST (with hashes)
  // =========================================================================

  const manifest = {
    schema_version: '2.0',  // Phase 2 schema
    close_id: closeId,
    artifact_type: 'invoice_close',
    period: {
      start: close.period_start,
      end: close.period_end,
    },
    currency: close.currency,
    providers: close.providers,
    total_spend: close.total_spend,
    invoice_count: close.invoices?.length || 0,
    created_at: close.created_at,

    // Phase 2 additions
    prior_close_id: historyResult?.prior_close_id || null,
    history_depth: historyResult?.history_depth || 1,
    fcs_level: fcsResult?.fcs_level || null,
    fcs_score: fcsResult?.fcs_score || null,
    variance_status: varianceResult?.unavailable ? 'UNAVAILABLE' : 'AVAILABLE',

    // Artifact list with hashes
    artifacts: artifacts.sort(),  // Deterministic order
    artifact_hashes: hashes,

    // Manifest hash (computed after all artifacts)
    manifest_hash: null,  // Will be set below
  };

  // Compute manifest hash (excluding manifest_hash field)
  const manifestForHash = { ...manifest, manifest_hash: undefined };
  manifest.manifest_hash = sha256(JSON.stringify(manifestForHash));

  const manifestJSON = JSON.stringify(manifest, null, 2);
  const manifestPath = `${closeId}-manifest.json`;
  zip.file(manifestPath, manifestJSON);

  return {
    zip,
    closeId,
    manifest,
    hashes,
    phase2: includePhase2 ? {
      normalizedTotals: normalizedTotalsResult,
      history: historyResult,
      variance: varianceResult,
      fcs: fcsResult,
    } : null,
  };
}

/**
 * Legacy bundler for backward compatibility
 * (Original Phase 1 behavior)
 */
export async function bundleClosePackLegacy(close) {
  const zip = new JSZip();
  const closeId = 'FIN-CL-' + Math.random().toString(36).substring(2, 8).toUpperCase();

  // Generate artifacts
  const journalRows = generateJournalEntry(close);
  const journalCSV = journalEntryToCSV(journalRows);
  const certificate = generateCloseCertificate(close);
  const summary = generateExecutiveSummary(close);

  // Add to ZIP
  zip.file(`${closeId}-journal-entry.csv`, journalCSV);
  zip.file(`${closeId}-close-certificate.html`, certificate);
  zip.file(`${closeId}-executive-summary.html`, summary);
  zip.file(`${closeId}-manifest.json`, JSON.stringify({
    close_id: closeId,
    period: { start: close.period_start, end: close.period_end },
    currency: close.currency,
    providers: close.providers,
    total_spend: close.total_spend,
    invoice_count: close.invoices.length,
    created_at: close.created_at,
    artifacts: [
      `${closeId}-journal-entry.csv`,
      `${closeId}-close-certificate.html`,
      `${closeId}-executive-summary.html`
    ]
  }, null, 2));

  return { zip, closeId };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default bundleClosePack;

export {
  generateCloseId,
  sha256,
  journalEntryToCSV,
};
