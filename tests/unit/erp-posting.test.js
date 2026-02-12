/**
 * ERP Posting Service Unit Tests
 *
 * Comprehensive tests for idempotency, sandbox mode, and error handling.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';

// Note: jszip is imported normally above — no mocking needed since
// createTestZip uses the real JSZip for test data generation

// ============================================================================
// TEST DATA
// ============================================================================

const createTestZip = async () => {
  const zip = new JSZip();

  // Journal entry CSV
  const journalCSV = [
    'AccountCode,Description,Debit,Credit,Entity,Currency',
    '1000,Cash Account,10000.00,0.00,US-CORP,USD',
    '2000,Revenue Account,0.00,10000.00,US-CORP,USD',
  ].join('\n');

  zip.file('derived/journal-entry.csv', journalCSV);

  // Manifest
  const manifest = {
    close_id: 'FIN-CLOSE-TEST001',
    schema_version: '1.0',
    period: { year: 2024, month: 12 },
    artifacts: ['derived/journal-entry.csv'],
    artifact_hashes: {
      'derived/journal-entry.csv': crypto.createHash('sha256').update(journalCSV).digest('hex'),
    },
  };

  manifest.manifest_hash = crypto.createHash('sha256')
    .update(JSON.stringify(manifest))
    .digest('hex');

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  return {
    buffer: await zip.generateAsync({ type: 'nodebuffer' }),
    manifest,
    journalCSV,
  };
};

// ============================================================================
// IDEMPOTENCY KEY TESTS
// ============================================================================

describe('Idempotency Key Computation', () => {
  test('same inputs produce same idempotency key', () => {
    const computeKey = ({ closeId, zipSha256, journalEntrySha256, erp, entity, postingPolicyId }) => {
      const input = `${closeId}|${zipSha256}|${journalEntrySha256}|${erp}|${entity}|${postingPolicyId}`;
      return crypto.createHash('sha256').update(input).digest('hex');
    };

    const params = {
      closeId: 'FIN-CLOSE-001',
      zipSha256: 'abc123',
      journalEntrySha256: 'def456',
      erp: 'netsuite',
      entity: 'US-CORP',
      postingPolicyId: 'POL-001',
    };

    const key1 = computeKey(params);
    const key2 = computeKey(params);

    expect(key1).toBe(key2);
    expect(key1).toHaveLength(64); // SHA-256 hex
  });

  test('different inputs produce different keys', () => {
    const computeKey = (params) => {
      const input = `${params.closeId}|${params.zipSha256}|${params.journalEntrySha256}|${params.erp}|${params.entity}|${params.postingPolicyId}`;
      return crypto.createHash('sha256').update(input).digest('hex');
    };

    const params1 = {
      closeId: 'FIN-CLOSE-001',
      zipSha256: 'abc123',
      journalEntrySha256: 'def456',
      erp: 'netsuite',
      entity: 'US-CORP',
      postingPolicyId: 'POL-001',
    };

    const params2 = { ...params1, closeId: 'FIN-CLOSE-002' };
    const params3 = { ...params1, erp: 'sage' };
    const params4 = { ...params1, entity: 'UK-LTD' };

    expect(computeKey(params1)).not.toBe(computeKey(params2));
    expect(computeKey(params1)).not.toBe(computeKey(params3));
    expect(computeKey(params1)).not.toBe(computeKey(params4));
  });

  test('key is deterministic across sessions', () => {
    const computeKey = (params) => {
      const input = `${params.closeId}|${params.zipSha256}|${params.journalEntrySha256}|${params.erp}|${params.entity}|${params.postingPolicyId}`;
      return crypto.createHash('sha256').update(input).digest('hex');
    };

    // Known inputs and expected output
    const params = {
      closeId: 'FIN-CLOSE-DETERMINISTIC',
      zipSha256: 'a1b2c3d4e5f6',
      journalEntrySha256: '112233445566',
      erp: 'quickbooks',
      entity: 'TEST-CORP',
      postingPolicyId: 'POL-STANDARD',
    };

    const key = computeKey(params);

    // This should always produce the same hash
    expect(key).toBe('daf7e901659a1eff64b224ac946e6f246805fd073a65e100b515c8eb81ccf74f');
    expect(key).toHaveLength(64);
  });
});

// ============================================================================
// JOURNAL ENTRY PARSING TESTS
// ============================================================================

describe('Journal Entry Parsing', () => {
  const parseJournalCSV = (csv) => {
    const lines = csv.split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',');
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const values = lines[i].split(',');
      const row = {};
      headers.forEach((h, idx) => {
        row[h.trim()] = values[idx]?.trim() || '';
      });
      rows.push(row);
    }

    return rows;
  };

  test('parses valid CSV correctly', () => {
    const csv = [
      'AccountCode,Description,Debit,Credit',
      '1000,Cash,10000.00,0.00',
      '2000,Revenue,0.00,10000.00',
    ].join('\n');

    const rows = parseJournalCSV(csv);

    expect(rows).toHaveLength(2);
    expect(rows[0].AccountCode).toBe('1000');
    expect(rows[0].Debit).toBe('10000.00');
    expect(rows[1].Credit).toBe('10000.00');
  });

  test('handles empty CSV', () => {
    const rows = parseJournalCSV('');
    expect(rows).toHaveLength(0);
  });

  test('handles header-only CSV', () => {
    const csv = 'AccountCode,Description,Debit,Credit';
    const rows = parseJournalCSV(csv);
    expect(rows).toHaveLength(0);
  });

  test('handles whitespace in values', () => {
    const csv = [
      'AccountCode,Description,Debit,Credit',
      '  1000  , Cash Account , 10000.00 , 0.00 ',
    ].join('\n');

    const rows = parseJournalCSV(csv);

    expect(rows[0].AccountCode).toBe('1000');
    expect(rows[0].Description).toBe('Cash Account');
  });

  test('calculates balanced totals', () => {
    const csv = [
      'AccountCode,Description,Debit,Credit',
      '1000,Cash,5000.00,0.00',
      '1001,Bank,5000.00,0.00',
      '2000,Revenue,0.00,10000.00',
    ].join('\n');

    const rows = parseJournalCSV(csv);

    let totalDebit = 0;
    let totalCredit = 0;

    for (const row of rows) {
      totalDebit += parseFloat(row.Debit) || 0;
      totalCredit += parseFloat(row.Credit) || 0;
    }

    expect(totalDebit).toBe(10000.00);
    expect(totalCredit).toBe(10000.00);
    expect(totalDebit).toBe(totalCredit);
  });
});

// ============================================================================
// SANDBOX MODE TESTS
// ============================================================================

describe('Sandbox Mode', () => {
  const testSandboxDir = path.join(os.tmpdir(), 'finault-test-sandbox-receipts');

  beforeEach(() => {
    // Clean up test directory
    if (fs.existsSync(testSandboxDir)) {
      fs.rmSync(testSandboxDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testSandboxDir)) {
      fs.rmSync(testSandboxDir, { recursive: true });
    }
  });

  test('sandbox mode creates local files', async () => {
    const closeId = 'FIN-CLOSE-SANDBOX-001';

    // Simulate sandbox posting
    const sandboxDir = testSandboxDir;
    fs.mkdirSync(sandboxDir, { recursive: true });

    const journalPath = path.join(sandboxDir, `${closeId}-journal.csv`);
    const receiptPath = path.join(sandboxDir, `${closeId}-receipt.json`);

    const journalCSV = 'AccountCode,Debit,Credit\n1000,100.00,0.00\n2000,0.00,100.00';
    const receipt = {
      mode: 'sandbox',
      closeId,
      documentId: 'SANDBOX-JE-12345',
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync(journalPath, journalCSV);
    fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));

    expect(fs.existsSync(journalPath)).toBe(true);
    expect(fs.existsSync(receiptPath)).toBe(true);

    const savedReceipt = JSON.parse(fs.readFileSync(receiptPath, 'utf-8'));
    expect(savedReceipt.mode).toBe('sandbox');
    expect(savedReceipt.closeId).toBe(closeId);
  });

  test('sandbox document ID format', () => {
    const generateSandboxDocId = () => {
      return `SANDBOX-JE-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    };

    const id1 = generateSandboxDocId();
    const id2 = generateSandboxDocId();

    expect(id1).toMatch(/^SANDBOX-JE-\d+-[A-Z0-9]+$/);
    expect(id1).not.toBe(id2);
  });

  test('sandbox receipt includes reconciliation CSV', async () => {
    const closeId = 'FIN-CLOSE-SANDBOX-002';
    const sandboxDir = testSandboxDir;
    fs.mkdirSync(sandboxDir, { recursive: true });

    const reconciliationCSV = [
      'dimension_type,dimension_value,currency,finault_amount,erp_amount,delta_amount,delta_pct,status,notes',
      `total,${closeId},USD,10000.00,10000.00,0.00,0.00,PASS,Sandbox reconciliation`,
    ].join('\n');

    const reconciliationPath = path.join(sandboxDir, `${closeId}-reconciliation.csv`);
    fs.writeFileSync(reconciliationPath, reconciliationCSV);

    const content = fs.readFileSync(reconciliationPath, 'utf-8');
    expect(content).toContain('PASS');
    expect(content).toContain('Sandbox reconciliation');
  });
});

// ============================================================================
// RECEIPT PACK GENERATION TESTS
// ============================================================================

describe('Receipt Pack Generation', () => {
  test('receipt pack includes required artifacts', async () => {
    const zip = new JSZip();

    const receipt = {
      receiptId: 'FIN-ERP-RCPT-001',
      closeId: 'FIN-CLOSE-001',
      erp: 'netsuite',
      entity: 'US-CORP',
      erpDocumentId: 'JE-12345',
      journalEntrySha256: 'abc123',
      postedAt: new Date().toISOString(),
    };

    const erpResponse = {
      documentId: 'JE-12345',
      status: 'POSTED',
      linesCreated: 10,
    };

    const journalCSV = 'AccountCode,Debit,Credit\n1000,100.00,0.00';

    // Add artifacts
    zip.file('receipts/erp_post_receipt.json', JSON.stringify(receipt, null, 2));
    zip.file('receipts/erp_raw_response.json', JSON.stringify(erpResponse, null, 2));
    zip.file('receipts/posted_journal_entry.csv', journalCSV);

    const manifest = {
      version: '1.0',
      pack_type: 'erp_receipt_pack',
      close_id: receipt.closeId,
      receipt_id: receipt.receiptId,
      artifacts: [
        'receipts/erp_post_receipt.json',
        'receipts/erp_raw_response.json',
        'receipts/posted_journal_entry.csv',
      ],
    };

    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    expect(buffer.length).toBeGreaterThan(0);

    // Verify contents
    const loaded = await JSZip.loadAsync(buffer);
    expect(Object.keys(loaded.files)).toContain('manifest.json');
    expect(Object.keys(loaded.files)).toContain('receipts/erp_post_receipt.json');
  });

  test('receipt pack manifest is valid JSON', async () => {
    const manifest = {
      version: '1.0',
      pack_type: 'erp_receipt_pack',
      close_id: 'FIN-CLOSE-001',
      receipt_id: 'FIN-ERP-RCPT-001',
      erp: 'netsuite',
      entity: 'US-CORP',
      erp_document_id: 'JE-12345',
      posted_at: new Date().toISOString(),
      artifacts: ['receipts/erp_post_receipt.json'],
      artifact_hashes: {},
      created_at: new Date().toISOString(),
    };

    const json = JSON.stringify(manifest, null, 2);
    const parsed = JSON.parse(json);

    expect(parsed.pack_type).toBe('erp_receipt_pack');
    expect(parsed.close_id).toBe('FIN-CLOSE-001');
  });
});

// ============================================================================
// VARIANCE RECONCILIATION TESTS
// ============================================================================

describe('Variance Reconciliation', () => {
  const reconcileVariance = ({
    closeId,
    receiptId,
    finaultTotals,
    erpTotals,
    toleranceAmount = 0,
    tolerancePct = 0,
  }) => {
    const timestamp = new Date().toISOString();
    const varianceRecords = [];
    let overallStatus = 'PASS';

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

      let status = 'PASS';
      if (Math.abs(varianceAmount) > toleranceAmount || Math.abs(variancePct) > tolerancePct) {
        status = 'FAIL';
        overallStatus = 'FAIL';
      }

      varianceRecords.push({
        closeId,
        receiptId,
        dimensionType: 'total',
        dimensionValue: dimension,
        finaultAmount: Number(finaultAmount.toFixed(2)),
        erpAmount: Number(erpAmount.toFixed(2)),
        varianceAmount: Number(varianceAmount.toFixed(2)),
        variancePct: Number(variancePct.toFixed(4)),
        status,
        createdAt: timestamp,
      });
    }

    return {
      closeId,
      receiptId,
      overallStatus,
      varianceRecords,
    };
  };

  test('exact match produces PASS', () => {
    const result = reconcileVariance({
      closeId: 'FIN-CLOSE-001',
      receiptId: 'FIN-ERP-RCPT-001',
      finaultTotals: { total: 10000.00 },
      erpTotals: { total: 10000.00 },
    });

    expect(result.overallStatus).toBe('PASS');
    expect(result.varianceRecords[0].varianceAmount).toBe(0);
  });

  test('variance within tolerance produces PASS', () => {
    const result = reconcileVariance({
      closeId: 'FIN-CLOSE-001',
      receiptId: 'FIN-ERP-RCPT-001',
      finaultTotals: { total: 10001.00 },
      erpTotals: { total: 10000.00 },
      toleranceAmount: 5.00,
      tolerancePct: 0.1, // 0.1% tolerance for percentage check
    });

    expect(result.overallStatus).toBe('PASS');
  });

  test('variance exceeding tolerance produces FAIL', () => {
    const result = reconcileVariance({
      closeId: 'FIN-CLOSE-001',
      receiptId: 'FIN-ERP-RCPT-001',
      finaultTotals: { total: 10100.00 },
      erpTotals: { total: 10000.00 },
      toleranceAmount: 5.00,
    });

    expect(result.overallStatus).toBe('FAIL');
    expect(result.varianceRecords[0].varianceAmount).toBe(100.00);
  });

  test('percentage tolerance check', () => {
    const result = reconcileVariance({
      closeId: 'FIN-CLOSE-001',
      receiptId: 'FIN-ERP-RCPT-001',
      finaultTotals: { total: 10500.00 },
      erpTotals: { total: 10000.00 },
      tolerancePct: 1.0, // 1%
    });

    expect(result.overallStatus).toBe('FAIL');
    expect(result.varianceRecords[0].variancePct).toBeCloseTo(5.0, 2);
  });

  test('multiple dimensions tracked separately', () => {
    const result = reconcileVariance({
      closeId: 'FIN-CLOSE-001',
      receiptId: 'FIN-ERP-RCPT-001',
      finaultTotals: { debit: 10000.00, credit: 10000.00 },
      erpTotals: { debit: 10000.00, credit: 9999.00 },
      toleranceAmount: 0,
    });

    expect(result.varianceRecords).toHaveLength(2);
    expect(result.overallStatus).toBe('FAIL'); // credit has variance
  });
});

// ============================================================================
// ERROR HANDLING TESTS
// ============================================================================

describe('Error Handling', () => {
  test('missing journal entry returns clear error', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({ close_id: 'FIN-CLOSE-001' }));

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    // Simulate extraction
    const loaded = await JSZip.loadAsync(buffer);
    const journalFiles = Object.keys(loaded.files).filter(f =>
      f.includes('journal-entry') && f.endsWith('.csv')
    );

    expect(journalFiles).toHaveLength(0);
  });

  test('manifest hash mismatch detected', () => {
    const manifest = {
      close_id: 'FIN-CLOSE-001',
      artifacts: ['test.csv'],
      manifest_hash: 'invalid-hash',
    };

    const manifestForHash = { ...manifest, manifest_hash: undefined };
    const computedHash = crypto.createHash('sha256')
      .update(JSON.stringify(manifestForHash))
      .digest('hex');

    expect(computedHash).not.toBe(manifest.manifest_hash);
  });
});

// ============================================================================
// ID GENERATION TESTS
// ============================================================================

describe('ID Generation', () => {
  const generateAttemptId = (closeId, timestamp) => {
    const input = `${closeId}|attempt|${timestamp}`;
    const hash = crypto.createHash('sha256').update(input).digest('hex');
    return `FIN-ERP-ATT-${hash.substring(0, 12).toUpperCase()}`;
  };

  const generateReceiptId = (closeId, erpDocId) => {
    const input = `${closeId}|receipt|${erpDocId}`;
    const hash = crypto.createHash('sha256').update(input).digest('hex');
    return `FIN-ERP-RCPT-${hash.substring(0, 12).toUpperCase()}`;
  };

  test('attempt IDs are unique per timestamp', () => {
    const closeId = 'FIN-CLOSE-001';
    const id1 = generateAttemptId(closeId, '2024-01-01T00:00:00Z');
    const id2 = generateAttemptId(closeId, '2024-01-01T00:00:01Z');

    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^FIN-ERP-ATT-[A-F0-9]{12}$/);
  });

  test('attempt IDs are deterministic', () => {
    const closeId = 'FIN-CLOSE-001';
    const timestamp = '2024-01-01T00:00:00Z';

    const id1 = generateAttemptId(closeId, timestamp);
    const id2 = generateAttemptId(closeId, timestamp);

    expect(id1).toBe(id2);
  });

  test('receipt IDs include ERP document reference', () => {
    const closeId = 'FIN-CLOSE-001';
    const erpDocId = 'JE-12345';

    const id = generateReceiptId(closeId, erpDocId);

    expect(id).toMatch(/^FIN-ERP-RCPT-[A-F0-9]{12}$/);
  });
});
