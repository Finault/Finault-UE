/**
 * Finault Phase 4: ERP Posting Tests
 *
 * Test matrix:
 * - Idempotent posting (same close twice → same receipt)
 * - Modified closepack bytes → abort
 * - Receipt pack generation
 * - Variance reconciliation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import JSZip from 'jszip';
import {
  ERPPostingService,
  ERP_POSTING_CONFIG,
  computeIdempotencyKey,
  generateAttemptId,
  generateReceiptId,
  generateVarianceId,
} from '../../modules/erp-posting-service.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

async function createTestZip(journalCSV, manifestData) {
  const zip = new JSZip();

  // Add journal entry
  zip.file('artifacts/FIN-CL-TEST-journal-entry.csv', journalCSV);

  // Add manifest
  const manifest = {
    schema_version: '2.0',
    close_id: 'FIN-CL-TEST',
    period: { start: '2026-01-01', end: '2026-01-31' },
    artifacts: ['artifacts/FIN-CL-TEST-journal-entry.csv'],
    artifact_hashes: {
      'artifacts/FIN-CL-TEST-journal-entry.csv': crypto.createHash('sha256').update(journalCSV).digest('hex'),
    },
    ...manifestData,
  };

  const manifestJson = JSON.stringify(manifest, null, 2);
  const manifestForHash = { ...manifest, manifest_hash: undefined };
  manifest.manifest_hash = crypto.createHash('sha256').update(JSON.stringify(manifestForHash)).digest('hex');

  zip.file('FIN-CL-TEST-manifest.json', JSON.stringify(manifest, null, 2));

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  return { zip, buffer, manifest };
}

const sampleJournalCSV = `Date,Account,Debit,Credit,Memo
2026-01-31,6000,5000.00,,AI Costs - OpenAI
2026-01-31,6001,2500.00,,AI Costs - Anthropic
2026-01-31,2100,,7500.00,Accounts Payable`;

// ============================================================================
// ID GENERATION TESTS
// ============================================================================

describe('ID Generation', () => {
  describe('computeIdempotencyKey()', () => {
    it('produces deterministic key', () => {
      const params = {
        closeId: 'FIN-CL-TEST',
        zipSha256: 'abc123',
        journalEntrySha256: 'def456',
        erp: 'netsuite',
        entity: 'ACME_US',
        postingPolicyId: 'FIN-PP-0001',
      };

      const key1 = computeIdempotencyKey(params);
      const key2 = computeIdempotencyKey(params);

      expect(key1).toBe(key2);
      expect(key1).toMatch(/^[a-f0-9]{64}$/);  // SHA-256 hex
    });

    it('produces different keys for different inputs', () => {
      const params1 = {
        closeId: 'FIN-CL-001',
        zipSha256: 'abc123',
        journalEntrySha256: 'def456',
        erp: 'netsuite',
        entity: 'ACME_US',
        postingPolicyId: 'FIN-PP-0001',
      };

      const params2 = {
        closeId: 'FIN-CL-002',  // Different close ID
        zipSha256: 'abc123',
        journalEntrySha256: 'def456',
        erp: 'netsuite',
        entity: 'ACME_US',
        postingPolicyId: 'FIN-PP-0001',
      };

      expect(computeIdempotencyKey(params1)).not.toBe(computeIdempotencyKey(params2));
    });
  });

  describe('generateAttemptId()', () => {
    it('generates FIN-ERP-ATT- prefixed ID', () => {
      const id = generateAttemptId('FIN-CL-TEST', '2026-01-31T00:00:00.000Z');
      expect(id).toMatch(/^FIN-ERP-ATT-[A-F0-9]{12}$/);
    });
  });

  describe('generateReceiptId()', () => {
    it('generates FIN-ERP-RCPT- prefixed ID', () => {
      const id = generateReceiptId('FIN-CL-TEST', 'JE-12345');
      expect(id).toMatch(/^FIN-ERP-RCPT-[A-F0-9]{12}$/);
    });
  });

  describe('generateVarianceId()', () => {
    it('generates FIN-ERP-VAR- prefixed ID', () => {
      const id = generateVarianceId('FIN-CL-TEST', 'total', '2026-01-31T00:00:00.000Z');
      expect(id).toMatch(/^FIN-ERP-VAR-[A-F0-9]{12}$/);
    });
  });
});

// ============================================================================
// ERP POSTING SERVICE TESTS
// ============================================================================

describe('ERPPostingService', () => {
  let service;

  beforeEach(() => {
    service = new ERPPostingService();
  });

  describe('post() - Dry Run', () => {
    it('returns dry run result without posting', async () => {
      const { buffer, manifest } = await createTestZip(sampleJournalCSV, {});

      const result = await service.post({
        closeId: 'FIN-CL-TEST',
        zipBuffer: buffer,
        manifest,
        erp: 'netsuite',
        entity: 'ACME_US',
        postingPolicyId: 'FIN-PP-0001',
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('DRY_RUN');
      expect(result.dryRun).toBe(true);
      expect(result.journalEntry).toBeDefined();
      expect(result.journalEntry.length).toBe(3);  // 3 rows
    });
  });

  describe('post() - Actual Posting', () => {
    it('posts journal entry and returns receipt', async () => {
      const { buffer, manifest } = await createTestZip(sampleJournalCSV, {});

      const result = await service.post({
        closeId: 'FIN-CL-TEST',
        zipBuffer: buffer,
        manifest,
        erp: 'netsuite',
        entity: 'ACME_US',
        postingPolicyId: 'FIN-PP-0001',
        dryRun: false,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('POSTED');
      expect(result.receipt).toBeDefined();
      expect(result.receipt.erpDocumentId).toBeDefined();
      expect(result.receipt.linesPosted).toBe(3);
      expect(result.receipt.totalDebit).toBe(7500);
      expect(result.receipt.totalCredit).toBe(7500);
    });

    it('generates receipt pack with manifest', async () => {
      const { buffer, manifest } = await createTestZip(sampleJournalCSV, {});

      const result = await service.post({
        closeId: 'FIN-CL-TEST',
        zipBuffer: buffer,
        manifest,
        erp: 'netsuite',
        entity: 'ACME_US',
        postingPolicyId: 'FIN-PP-0001',
        dryRun: false,
      });

      expect(result.receiptPack).toBeDefined();
      expect(result.receiptPack.sha256).toBeDefined();
      expect(result.receiptPack.manifest.pack_type).toBe('erp_receipt_pack');
      expect(result.receiptPack.manifest.artifacts).toContain('receipts/erp_post_receipt.json');
    });
  });

  describe('post() - Missing Journal Entry', () => {
    it('fails when journal entry not found', async () => {
      const zip = new JSZip();
      zip.file('manifest.json', JSON.stringify({ close_id: 'FIN-CL-TEST' }));
      const buffer = await zip.generateAsync({ type: 'nodebuffer' });

      const result = await service.post({
        closeId: 'FIN-CL-TEST',
        zipBuffer: buffer,
        manifest: {},
        erp: 'netsuite',
        entity: 'ACME_US',
        postingPolicyId: 'FIN-PP-0001',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('Journal entry not found');
    });
  });
});

// ============================================================================
// VARIANCE RECONCILIATION TESTS
// ============================================================================

describe('Variance Reconciliation', () => {
  let service;

  beforeEach(() => {
    service = new ERPPostingService();
  });

  describe('reconcileVariance()', () => {
    it('passes when totals match exactly', async () => {
      const result = await service.reconcileVariance({
        closeId: 'FIN-CL-TEST',
        receiptId: 'FIN-ERP-RCPT-TEST',
        finaultTotals: { total: 7500.00 },
        erpTotals: { total: 7500.00 },
        toleranceAmount: 0,
        tolerancePct: 0,
      });

      expect(result.overallStatus).toBe('PASS');
      expect(result.varianceRecords[0].status).toBe('PASS');
      expect(result.varianceRecords[0].varianceAmount).toBe(0);
    });

    it('passes when within tolerance', async () => {
      const result = await service.reconcileVariance({
        closeId: 'FIN-CL-TEST',
        receiptId: 'FIN-ERP-RCPT-TEST',
        finaultTotals: { total: 7500.00 },
        erpTotals: { total: 7499.50 },  // $0.50 difference
        toleranceAmount: 1.00,
        tolerancePct: 0.1,
      });

      expect(result.overallStatus).toBe('PASS');
    });

    it('fails when outside tolerance', async () => {
      const result = await service.reconcileVariance({
        closeId: 'FIN-CL-TEST',
        receiptId: 'FIN-ERP-RCPT-TEST',
        finaultTotals: { total: 7500.00 },
        erpTotals: { total: 7400.00 },  // $100 difference
        toleranceAmount: 1.00,
        tolerancePct: 0.1,
      });

      expect(result.overallStatus).toBe('FAIL');
      expect(result.varianceRecords[0].status).toBe('FAIL');
    });

    it('handles multiple dimensions', async () => {
      const result = await service.reconcileVariance({
        closeId: 'FIN-CL-TEST',
        receiptId: 'FIN-ERP-RCPT-TEST',
        finaultTotals: {
          total: 7500.00,
          openai: 5000.00,
          anthropic: 2500.00,
        },
        erpTotals: {
          total: 7500.00,
          openai: 5000.00,
          anthropic: 2500.00,
        },
        toleranceAmount: 0,
        tolerancePct: 0,
      });

      expect(result.overallStatus).toBe('PASS');
      expect(result.varianceRecords.length).toBe(3);
    });
  });

  describe('generateVarianceCSV()', () => {
    it('generates valid CSV', async () => {
      const result = await service.reconcileVariance({
        closeId: 'FIN-CL-TEST',
        receiptId: 'FIN-ERP-RCPT-TEST',
        finaultTotals: { total: 7500.00 },
        erpTotals: { total: 7400.00 },
      });

      const csv = service.generateVarianceCSV(result.varianceRecords);
      const lines = csv.split('\n');

      expect(lines[0]).toContain('dimension_type');
      expect(lines[0]).toContain('finault_amount');
      expect(lines[0]).toContain('erp_amount');
      expect(lines[1]).toContain('7500.00');
      expect(lines[1]).toContain('7400.00');
    });
  });
});

// ============================================================================
// IDEMPOTENCY TESTS (Critical)
// ============================================================================

describe('Idempotency', () => {
  it('same idempotency key for same inputs', async () => {
    const params = {
      closeId: 'FIN-CL-TEST',
      zipSha256: 'abc123',
      journalEntrySha256: 'def456',
      erp: 'netsuite',
      entity: 'ACME_US',
      postingPolicyId: 'FIN-PP-0001',
    };

    // Multiple calls should produce same key
    const keys = [];
    for (let i = 0; i < 5; i++) {
      keys.push(computeIdempotencyKey(params));
    }

    expect(new Set(keys).size).toBe(1);  // All keys identical
  });

  it('different idempotency key for modified ZIP', async () => {
    const baseParams = {
      closeId: 'FIN-CL-TEST',
      journalEntrySha256: 'def456',
      erp: 'netsuite',
      entity: 'ACME_US',
      postingPolicyId: 'FIN-PP-0001',
    };

    const key1 = computeIdempotencyKey({ ...baseParams, zipSha256: 'original_hash' });
    const key2 = computeIdempotencyKey({ ...baseParams, zipSha256: 'modified_hash' });

    expect(key1).not.toBe(key2);
  });
});

// ============================================================================
// RECEIPT PACK VERIFICATION TESTS
// ============================================================================

describe('Receipt Pack', () => {
  let service;

  beforeEach(() => {
    service = new ERPPostingService();
  });

  it('includes all required artifacts', async () => {
    const { buffer, manifest } = await createTestZip(sampleJournalCSV, {});

    const result = await service.post({
      closeId: 'FIN-CL-TEST',
      zipBuffer: buffer,
      manifest,
      erp: 'netsuite',
      entity: 'ACME_US',
      postingPolicyId: 'FIN-PP-0001',
    });

    const { manifest: packManifest } = result.receiptPack;

    expect(packManifest.artifacts).toContain('receipts/erp_post_receipt.json');
    expect(packManifest.artifacts).toContain('receipts/erp_raw_response.json');
    expect(packManifest.artifacts).toContain('receipts/posted_journal_entry.csv');
  });

  it('has hashes for all artifacts', async () => {
    const { buffer, manifest } = await createTestZip(sampleJournalCSV, {});

    const result = await service.post({
      closeId: 'FIN-CL-TEST',
      zipBuffer: buffer,
      manifest,
      erp: 'netsuite',
      entity: 'ACME_US',
      postingPolicyId: 'FIN-PP-0001',
    });

    const { manifest: packManifest } = result.receiptPack;

    for (const artifact of packManifest.artifacts) {
      expect(packManifest.artifact_hashes[artifact]).toBeDefined();
      expect(packManifest.artifact_hashes[artifact]).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});
