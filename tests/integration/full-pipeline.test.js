/**
 * Finault Phases 2, 3, 4 Integration Tests
 *
 * End-to-end tests for the complete close pack pipeline:
 * Phase 2: Comparative intelligence (normalized totals, variance, FCS)
 * Phase 3: Cryptographic finality (merkle tree, anchoring)
 * Phase 4: ERP authority (posting, receipts, reconciliation)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';

// Phase 2 imports
import {
  generateNormalizedTotals,
  generateHistoryFromData,
  generateVarianceAddendum,
  generateFCS,
  generateFCSFromAnalysis,
} from '../../modules/closepack/generators/index.js';

// Phase 3 imports
import {
  generateMerkleTree,
  verifyMerkleJson,
  computeAnchorPayload,
} from '../../modules/closepack/generators/merkleTree.js';
import { BlockchainAnchorService } from '../../modules/blockchain-anchor.js';

// Phase 4 imports
import {
  ERPPostingService,
  computeIdempotencyKey,
} from '../../modules/erp-posting-service.js';

// Core imports
import { DriftDetector } from '../../modules/drift-detector.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const createClose = (periodStart, periodEnd, totalSpend, providers) => ({
  period_start: periodStart,
  period_end: periodEnd,
  currency: 'USD',
  total_spend: totalSpend,
  providers,
  invoices: providers.map((provider, i) => ({
    provider,
    total: totalSpend / providers.length,
    line_items: [
      { model: `${provider}-model-1`, amount: (totalSpend / providers.length) * 0.6 },
      { model: `${provider}-model-2`, amount: (totalSpend / providers.length) * 0.4 },
    ],
  })),
  created_at: new Date().toISOString(),
});

// ============================================================================
// PHASE 2 INTEGRATION TESTS
// ============================================================================

describe('Phase 2 Integration: Comparative Intelligence', () => {
  const currentClose = createClose('2026-02-01', '2026-02-28', 50000, ['openai', 'anthropic']);
  const priorClose = createClose('2026-01-01', '2026-01-31', 45000, ['openai', 'anthropic']);

  it('generates normalized totals with deterministic output', () => {
    const result1 = generateNormalizedTotals(currentClose);
    const result2 = generateNormalizedTotals(currentClose);

    expect(result1.csv).toBe(result2.csv);
    expect(result1.rows.length).toBeGreaterThan(0);
  });

  it('generates history chain', () => {
    const history = generateHistoryFromData({
      closeId: 'FIN-CL-00000002',
      artifactType: 'invoice_close',
      period: { start: currentClose.period_start, end: currentClose.period_end },
      lineageData: [
        { close_id: 'FIN-CL-00000001', period_start: priorClose.period_start, period_end: priorClose.period_end },
      ],
    });

    expect(history.close_id).toBe('FIN-CL-00000002');
    expect(history.prior_close_id).toBe('FIN-CL-00000001');
    expect(history.history_depth).toBe(2);
  });

  it('computes variance between periods', () => {
    const currentTotals = generateNormalizedTotals(currentClose);
    const priorTotals = generateNormalizedTotals(priorClose);

    const variance = generateVarianceAddendum({
      currentCSV: currentTotals.csv,
      priorCSV: priorTotals.csv,
      currentCloseId: 'FIN-CL-00000002',
      priorCloseId: 'FIN-CL-00000001',
      mode: 'CONSERVATIVE',
    });

    expect(variance.unavailable).toBe(false);
    expect(variance.data.status).toBe('AVAILABLE');
    expect(variance.data.summary).toBeDefined();
    expect(parseFloat(variance.data.summary.delta_amount)).toBeCloseTo(5000, 0);
  });

  it('computes FCS from analysis', () => {
    const history = generateHistoryFromData({
      closeId: 'FIN-CL-00000002',
      artifactType: 'invoice_close',
      period: { start: currentClose.period_start, end: currentClose.period_end },
      lineageData: [
        { close_id: 'FIN-CL-00000001', period_start: priorClose.period_start, period_end: priorClose.period_end },
        { close_id: 'FIN-CL-00000000', period_start: '2025-12-01', period_end: '2025-12-31' },
        { close_id: 'FIN-CL-PREV', period_start: '2025-11-01', period_end: '2025-11-30' },
      ],
    });

    const fcs = generateFCSFromAnalysis({
      reconciliation: { all_reconciled: true, discrepancies: [], status: 'clean' },
      driftAnalysis: { summary: { overallDriftSeverity: 'NONE' }, driftEvents: [] },
      history,
      close: { ...currentClose, expected_providers: ['openai', 'anthropic'] },
    });

    expect(fcs.fcs_level).toBe('HIGH');
    expect(fcs.fcs_score).toBeGreaterThanOrEqual(85);
  });
});

// ============================================================================
// PHASE 3 INTEGRATION TESTS
// ============================================================================

describe('Phase 3 Integration: Cryptographic Finality', () => {
  const sampleArtifacts = {
    'artifacts/journal-entry.csv': crypto.createHash('sha256').update('journal content').digest('hex'),
    'artifacts/executive-summary.html': crypto.createHash('sha256').update('summary content').digest('hex'),
    'derived/normalized-totals.csv': crypto.createHash('sha256').update('totals content').digest('hex'),
    'derived/fcs.json': crypto.createHash('sha256').update('fcs content').digest('hex'),
  };

  it('generates merkle tree with deterministic root', () => {
    const tree1 = generateMerkleTree(sampleArtifacts);
    const tree2 = generateMerkleTree(sampleArtifacts);

    expect(tree1.root_sha256).toBe(tree2.root_sha256);
    expect(tree1.leaf_count).toBe(Object.keys(sampleArtifacts).length);
  });

  it('verifies merkle tree integrity', () => {
    const tree = generateMerkleTree(sampleArtifacts);
    const verification = verifyMerkleJson(tree, sampleArtifacts);

    expect(verification.valid).toBe(true);
    expect(verification.errors).toHaveLength(0);
  });

  it('detects artifact tampering via merkle', () => {
    const tree = generateMerkleTree(sampleArtifacts);

    // Tamper with one artifact
    const tamperedArtifacts = { ...sampleArtifacts };
    tamperedArtifacts['artifacts/journal-entry.csv'] = crypto.createHash('sha256').update('TAMPERED').digest('hex');

    const verification = verifyMerkleJson(tree, tamperedArtifacts);

    expect(verification.valid).toBe(false);
    expect(verification.errors.some(e => e.includes('Hash mismatch'))).toBe(true);
  });

  it('anchors merkle root to blockchain', async () => {
    const tree = generateMerkleTree(sampleArtifacts);
    const anchorService = new BlockchainAnchorService();

    const anchorPayload = computeAnchorPayload({
      closeId: 'FIN-CL-00000001',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      zipSha256: 'zip_hash_here',
      merkleRootSha256: tree.root_sha256,
    });

    const result = await anchorService.anchor({
      closeId: 'FIN-CL-00000001',
      anchorPayload,
      merkleRoot: tree.root_sha256,
      zipHash: 'zip_hash_here',
    });

    expect(result.success).toBe(true);
    expect(result.txHash).toMatch(/^0x/);
    expect(result.status).toBe('CONFIRMED');
  });
});

// ============================================================================
// PHASE 4 INTEGRATION TESTS
// ============================================================================

describe('Phase 4 Integration: ERP Authority', () => {
  let erpService;

  beforeEach(() => {
    erpService = new ERPPostingService();
  });

  it('computes idempotency key deterministically', () => {
    const params = {
      closeId: 'FIN-CL-00000001',
      zipSha256: 'zip_hash',
      journalEntrySha256: 'journal_hash',
      erp: 'netsuite',
      entity: 'ACME_US',
      postingPolicyId: 'FIN-PP-0001',
    };

    const key1 = computeIdempotencyKey(params);
    const key2 = computeIdempotencyKey(params);

    expect(key1).toBe(key2);
  });

  it('reconciles variance between Finault and ERP', async () => {
    const result = await erpService.reconcileVariance({
      closeId: 'FIN-CL-00000001',
      receiptId: 'FIN-ERP-RCPT-001',
      finaultTotals: { total: 50000.00, openai: 30000.00, anthropic: 20000.00 },
      erpTotals: { total: 50000.00, openai: 30000.00, anthropic: 20000.00 },
      toleranceAmount: 0,
      tolerancePct: 0,
    });

    expect(result.overallStatus).toBe('PASS');
    expect(result.varianceRecords.every(v => v.status === 'PASS')).toBe(true);
  });

  it('generates variance CSV', async () => {
    const result = await erpService.reconcileVariance({
      closeId: 'FIN-CL-00000001',
      receiptId: 'FIN-ERP-RCPT-001',
      finaultTotals: { total: 50000.00 },
      erpTotals: { total: 49000.00 },
    });

    const csv = erpService.generateVarianceCSV(result.varianceRecords);

    expect(csv).toContain('dimension_type');
    expect(csv).toContain('50000.00');
    expect(csv).toContain('49000.00');
  });
});

// ============================================================================
// DRIFT DETECTION INTEGRATION TESTS
// ============================================================================

describe('Drift Detection Integration', () => {
  let detector;

  beforeEach(() => {
    detector = new DriftDetector();
  });

  it('detects drift across closes', async () => {
    const metrics = [
      { provider: 'openai', modelOrSku: 'gpt-4', currency: 'USD', unitCost: 0.06, periodEnd: '2026-02-28' },
    ];

    const getPriorCloses = async () => [
      { closeId: 'FIN-CL-003', periodEnd: '2026-01-31', unitCost: 0.03 },
      { closeId: 'FIN-CL-002', periodEnd: '2025-12-31', unitCost: 0.03 },
      { closeId: 'FIN-CL-001', periodEnd: '2025-11-30', unitCost: 0.03 },
    ];

    const results = await detector.analyzeClose({
      closeId: 'FIN-CL-004',
      metrics,
      getPriorCloses,
    });

    expect(results.driftEvents.length).toBe(1);
    expect(results.driftEvents[0].severity).toBe('HIGH');  // 100% increase
    expect(results.summary.overallDriftSeverity).toBe('HIGH');
  });

  it('generates drift summary CSV', async () => {
    const analysisResults = {
      closeId: 'FIN-CL-004',
      analyzedAt: new Date().toISOString(),
      driftEvents: [
        {
          provider: 'openai',
          modelOrSku: 'gpt-4',
          currency: 'USD',
          priorBaselineValue: 0.03,
          currentValue: 0.06,
          driftPct: 100,
          severity: 'HIGH',
          baselineCloseIds: ['FIN-CL-003', 'FIN-CL-002', 'FIN-CL-001'],
        },
      ],
    };

    const csv = detector.generateDriftSummaryCSV(analysisResults);

    expect(csv).toContain('provider');
    expect(csv).toContain('openai');
    expect(csv).toContain('HIGH');
  });
});

// ============================================================================
// FULL PIPELINE TEST
// ============================================================================

describe('Full Pipeline Integration', () => {
  it('runs complete close → verify → reconcile pipeline', async () => {
    // Step 1: Create close with Phase 2 artifacts
    const close = createClose('2026-02-01', '2026-02-28', 50000, ['openai', 'anthropic']);
    const normalizedTotals = generateNormalizedTotals(close);
    const history = generateHistoryFromData({
      closeId: 'FIN-CL-PIPELINE-TEST',
      artifactType: 'invoice_close',
      period: { start: close.period_start, end: close.period_end },
      lineageData: [],
    });
    const fcs = generateFCS({
      coveragePct: 100,
      exceptionsCount: 0,
      reconciliationPassed: true,
      comparabilityAvailable: false,
      historyDepth: 1,
      driftSeverityMax: 'NONE',
    });

    expect(normalizedTotals.csv).toBeDefined();
    expect(history.history_depth).toBe(1);
    expect(fcs.fcs_level).toBeDefined();

    // Step 2: Generate Phase 3 cryptographic proofs
    const artifactHashes = {
      'normalized_totals.csv': crypto.createHash('sha256').update(normalizedTotals.csv).digest('hex'),
      'history.json': crypto.createHash('sha256').update(JSON.stringify(history)).digest('hex'),
      'fcs.json': crypto.createHash('sha256').update(JSON.stringify(fcs)).digest('hex'),
    };

    const merkleTree = generateMerkleTree(artifactHashes);
    const verification = verifyMerkleJson(merkleTree, artifactHashes);

    expect(verification.valid).toBe(true);

    // Step 3: Anchor to blockchain
    const anchorService = new BlockchainAnchorService();
    const anchorResult = await anchorService.anchor({
      closeId: 'FIN-CL-PIPELINE-TEST',
      anchorPayload: computeAnchorPayload({
        closeId: 'FIN-CL-PIPELINE-TEST',
        periodStart: close.period_start,
        periodEnd: close.period_end,
        zipSha256: 'test_zip_hash',
        merkleRootSha256: merkleTree.root_sha256,
      }),
      merkleRoot: merkleTree.root_sha256,
      zipHash: 'test_zip_hash',
    });

    expect(anchorResult.success).toBe(true);

    // Step 4: Simulate ERP reconciliation
    const erpService = new ERPPostingService();
    const erpReconciliation = await erpService.reconcileVariance({
      closeId: 'FIN-CL-PIPELINE-TEST',
      receiptId: 'FIN-ERP-RCPT-PIPELINE',
      finaultTotals: { total: 50000.00 },
      erpTotals: { total: 50000.00 },
    });

    expect(erpReconciliation.overallStatus).toBe('PASS');

    // Final assertion: All phases completed successfully
    expect({
      phase2: {
        normalizedTotals: !!normalizedTotals.csv,
        history: history.history_depth > 0,
        fcs: !!fcs.fcs_level,
      },
      phase3: {
        merkle: verification.valid,
        anchor: anchorResult.success,
      },
      phase4: {
        reconciliation: erpReconciliation.overallStatus === 'PASS',
      },
    }).toEqual({
      phase2: { normalizedTotals: true, history: true, fcs: true },
      phase3: { merkle: true, anchor: true },
      phase4: { reconciliation: true },
    });
  });
});
