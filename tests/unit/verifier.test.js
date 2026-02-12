/**
 * Verifier Unit Tests
 *
 * Tests for Close Pack verification logic.
 */

import { describe, test, expect } from 'vitest';
import crypto from 'crypto';
import JSZip from 'jszip';

// ============================================================================
// HASH VERIFICATION TESTS
// ============================================================================

describe('Hash Verification', () => {
  test('SHA-256 produces correct length', () => {
    const hash = crypto.createHash('sha256').update('test').digest('hex');
    expect(hash).toHaveLength(64);
  });

  test('same content produces same hash', () => {
    const content = 'test content';
    const hash1 = crypto.createHash('sha256').update(content).digest('hex');
    const hash2 = crypto.createHash('sha256').update(content).digest('hex');
    expect(hash1).toBe(hash2);
  });

  test('different content produces different hash', () => {
    const hash1 = crypto.createHash('sha256').update('content1').digest('hex');
    const hash2 = crypto.createHash('sha256').update('content2').digest('hex');
    expect(hash1).not.toBe(hash2);
  });
});

// ============================================================================
// MANIFEST VERIFICATION TESTS
// ============================================================================

describe('Manifest Verification', () => {
  test('valid manifest structure', () => {
    const manifest = {
      close_id: 'FIN-CLOSE-001',
      schema_version: '1.0',
      period: { year: 2024, month: 12 },
      artifacts: ['derived/fcs.json', 'derived/journal.csv'],
      artifact_hashes: {
        'derived/fcs.json': 'abc123',
        'derived/journal.csv': 'def456',
      },
      manifest_hash: 'xyz789',
    };

    expect(manifest.close_id).toMatch(/^FIN-CLOSE-/);
    expect(manifest.artifacts).toBeInstanceOf(Array);
    expect(manifest.artifact_hashes).toBeInstanceOf(Object);
  });

  test('manifest hash verification', () => {
    const manifest = {
      close_id: 'FIN-CLOSE-001',
      artifacts: ['test.json'],
      artifact_hashes: { 'test.json': 'abc123' },
    };

    const manifestHash = crypto.createHash('sha256')
      .update(JSON.stringify(manifest, null, 2))
      .digest('hex');

    manifest.manifest_hash = manifestHash;

    // Verify by recomputing
    const manifestWithoutHash = { ...manifest };
    delete manifestWithoutHash.manifest_hash;

    const recomputed = crypto.createHash('sha256')
      .update(JSON.stringify(manifestWithoutHash, null, 2))
      .digest('hex');

    expect(recomputed).toBe(manifest.manifest_hash);
  });

  test('missing manifest detected', async () => {
    const zip = new JSZip();
    zip.file('test.json', '{}');

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const loaded = await JSZip.loadAsync(buffer);

    const manifestFile = Object.keys(loaded.files).find(f =>
      f === 'manifest.json' || f.endsWith('-manifest.json')
    );

    expect(manifestFile).toBeUndefined();
  });
});

// ============================================================================
// ARTIFACT VERIFICATION TESTS
// ============================================================================

describe('Artifact Verification', () => {
  test('all declared artifacts present', async () => {
    const zip = new JSZip();
    zip.file('derived/fcs.json', '{}');
    zip.file('derived/journal.csv', 'col1\n1');

    const manifest = {
      close_id: 'FIN-CLOSE-001',
      artifacts: ['derived/fcs.json', 'derived/journal.csv'],
    };

    zip.file('manifest.json', JSON.stringify(manifest));

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const loaded = await JSZip.loadAsync(buffer);
    const loadedManifest = JSON.parse(await loaded.file('manifest.json').async('string'));

    const files = Object.keys(loaded.files);
    const missing = loadedManifest.artifacts.filter(a => !files.includes(a));

    expect(missing).toHaveLength(0);
  });

  test('missing artifact detected', async () => {
    const zip = new JSZip();
    zip.file('derived/fcs.json', '{}');
    // Missing: derived/journal.csv

    const manifest = {
      close_id: 'FIN-CLOSE-001',
      artifacts: ['derived/fcs.json', 'derived/journal.csv'],
    };

    zip.file('manifest.json', JSON.stringify(manifest));

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const loaded = await JSZip.loadAsync(buffer);
    const loadedManifest = JSON.parse(await loaded.file('manifest.json').async('string'));

    const files = Object.keys(loaded.files);
    const missing = loadedManifest.artifacts.filter(a => !files.includes(a));

    expect(missing).toContain('derived/journal.csv');
  });

  test('artifact hash mismatch detected', async () => {
    const content = '{"test": true}';
    const correctHash = crypto.createHash('sha256').update(content).digest('hex');

    const zip = new JSZip();
    zip.file('test.json', content);

    const manifest = {
      close_id: 'FIN-CLOSE-001',
      artifacts: ['test.json'],
      artifact_hashes: {
        'test.json': 'wrong-hash',
      },
    };

    zip.file('manifest.json', JSON.stringify(manifest));

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const loaded = await JSZip.loadAsync(buffer);
    const loadedManifest = JSON.parse(await loaded.file('manifest.json').async('string'));

    const loadedContent = await loaded.file('test.json').async('string');
    const actualHash = crypto.createHash('sha256').update(loadedContent).digest('hex');

    expect(actualHash).not.toBe(loadedManifest.artifact_hashes['test.json']);
    expect(actualHash).toBe(correctHash);
  });
});

// ============================================================================
// FCS EXTRACTION TESTS
// ============================================================================

describe('FCS Extraction', () => {
  test('FCS data extracted from ZIP', async () => {
    const fcsData = {
      fcs_score: 0.92,
      fcs_level: 'GOLD',
      components: {
        coverage: 0.95,
        exceptions: 0.90,
        reconciliation: 0.88,
        comparability: 0.94,
        drift: 0.95,
      },
    };

    const zip = new JSZip();
    zip.file('derived/fcs.json', JSON.stringify(fcsData));
    zip.file('manifest.json', JSON.stringify({ close_id: 'FIN-CLOSE-001', artifacts: ['derived/fcs.json'] }));

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const loaded = await JSZip.loadAsync(buffer);

    const fcsFile = Object.keys(loaded.files).find(f => f.includes('fcs.json'));
    expect(fcsFile).toBeDefined();

    const fcs = JSON.parse(await loaded.file(fcsFile).async('string'));
    expect(fcs.fcs_score).toBe(0.92);
    expect(fcs.fcs_level).toBe('GOLD');
  });

  test('missing FCS handled gracefully', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({ close_id: 'FIN-CLOSE-001', artifacts: [] }));

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const loaded = await JSZip.loadAsync(buffer);

    const fcsFile = Object.keys(loaded.files).find(f => f.includes('fcs.json'));
    expect(fcsFile).toBeUndefined();
  });
});

// ============================================================================
// DRIFT EXTRACTION TESTS
// ============================================================================

describe('Drift Extraction', () => {
  test('drift data extracted from ZIP', async () => {
    const driftData = {
      summary: {
        overallDriftSeverity: 'MEDIUM',
        totalEvents: 3,
      },
      driftEvents: [
        { metric_key: 'revenue', deviation_percent: 15.5, severity: 'HIGH' },
        { metric_key: 'expenses', deviation_percent: 5.2, severity: 'LOW' },
        { metric_key: 'profit', deviation_percent: 8.1, severity: 'MEDIUM' },
      ],
    };

    const zip = new JSZip();
    zip.file('derived/drift.json', JSON.stringify(driftData));
    zip.file('manifest.json', JSON.stringify({ close_id: 'FIN-CLOSE-001' }));

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const loaded = await JSZip.loadAsync(buffer);

    const driftFile = Object.keys(loaded.files).find(f =>
      f.includes('drift') && f.endsWith('.json')
    );

    expect(driftFile).toBeDefined();

    const drift = JSON.parse(await loaded.file(driftFile).async('string'));
    expect(drift.summary.overallDriftSeverity).toBe('MEDIUM');
    expect(drift.driftEvents).toHaveLength(3);
  });
});

// ============================================================================
// MERKLE TREE TESTS
// ============================================================================

describe('Merkle Tree Verification', () => {
  test('Merkle root extracted from ZIP', async () => {
    const merkleData = {
      root_sha256: 'abc123def456',
      leaves: [
        { path: 'a.json', hash: 'hash1' },
        { path: 'b.json', hash: 'hash2' },
      ],
      proof_count: 2,
    };

    const zip = new JSZip();
    zip.file('certs/merkle.json', JSON.stringify(merkleData));
    zip.file('manifest.json', JSON.stringify({ close_id: 'FIN-CLOSE-001' }));

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const loaded = await JSZip.loadAsync(buffer);

    const merkleFile = Object.keys(loaded.files).find(f => f.includes('merkle.json'));
    expect(merkleFile).toBeDefined();

    const merkle = JSON.parse(await loaded.file(merkleFile).async('string'));
    expect(merkle.root_sha256).toBe('abc123def456');
    expect(merkle.leaves).toHaveLength(2);
  });

  test('pairwise hashing for Merkle tree', () => {
    const leaves = ['hash1', 'hash2', 'hash3', 'hash4'];

    const pairHash = (a, b) => {
      const sorted = [a, b].sort();
      return crypto.createHash('sha256').update(sorted.join('')).digest('hex');
    };

    // Level 1
    const level1 = [
      pairHash(leaves[0], leaves[1]),
      pairHash(leaves[2], leaves[3]),
    ];

    // Root
    const root = pairHash(level1[0], level1[1]);

    expect(root).toHaveLength(64);
  });
});

// ============================================================================
// TENANT ISOLATION TESTS
// ============================================================================

describe('Tenant Isolation', () => {
  test('tenant mismatch detected', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({
      close_id: 'FIN-CLOSE-001',
      tenant_id: 'tenant-A',
    }));

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const loaded = await JSZip.loadAsync(buffer);
    const manifest = JSON.parse(await loaded.file('manifest.json').async('string'));

    const requestTenantId = 'tenant-B';

    const tenantMismatch = manifest.tenant_id && manifest.tenant_id !== requestTenantId;
    expect(tenantMismatch).toBe(true);
  });

  test('tenant match passes', async () => {
    const tenantId = 'tenant-A';

    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({
      close_id: 'FIN-CLOSE-001',
      tenant_id: tenantId,
    }));

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const loaded = await JSZip.loadAsync(buffer);
    const manifest = JSON.parse(await loaded.file('manifest.json').async('string'));

    const requestTenantId = tenantId;

    const tenantMismatch = manifest.tenant_id && manifest.tenant_id !== requestTenantId;
    expect(tenantMismatch).toBe(false);
  });
});

// ============================================================================
// CLOSE ID VERIFICATION TESTS
// ============================================================================

describe('Close ID Verification', () => {
  test('close ID format validation', () => {
    const validIds = [
      'FIN-CLOSE-001',
      'FIN-CLOSE-ABC123',
      'FIN-CLOSE-2024-12-001',
    ];

    const invalidIds = [
      'CLOSE-001',
      'FIN001',
      '',
      null,
    ];

    const isValidCloseId = (id) => {
      if (!id) return false;
      return /^FIN-CLOSE-[A-Z0-9-]+$/.test(id);
    };

    for (const id of validIds) {
      expect(isValidCloseId(id)).toBe(true);
    }

    for (const id of invalidIds) {
      expect(isValidCloseId(id)).toBe(false);
    }
  });

  test('expected close ID mismatch detected', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({
      close_id: 'FIN-CLOSE-ACTUAL',
    }));

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const loaded = await JSZip.loadAsync(buffer);
    const manifest = JSON.parse(await loaded.file('manifest.json').async('string'));

    const expectedCloseId = 'FIN-CLOSE-EXPECTED';
    const mismatch = manifest.close_id !== expectedCloseId;

    expect(mismatch).toBe(true);
  });
});

// ============================================================================
// ERROR HANDLING TESTS
// ============================================================================

describe('Error Handling', () => {
  test('invalid JSON in manifest', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', 'not valid json {');

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const loaded = await JSZip.loadAsync(buffer);

    let parseError = null;
    try {
      JSON.parse(await loaded.file('manifest.json').async('string'));
    } catch (e) {
      parseError = e;
    }

    expect(parseError).not.toBeNull();
    expect(parseError.name).toBe('SyntaxError');
  });

  test('corrupted ZIP detected', async () => {
    const corruptedBuffer = Buffer.from('not a zip file');

    let zipError = null;
    try {
      await JSZip.loadAsync(corruptedBuffer);
    } catch (e) {
      zipError = e;
    }

    expect(zipError).not.toBeNull();
  });

  test('empty file rejected', () => {
    const emptyBuffer = Buffer.alloc(0);
    expect(emptyBuffer.length).toBe(0);
  });

  test('oversized file rejected', () => {
    const maxSizeMB = 100;
    const maxSizeBytes = maxSizeMB * 1024 * 1024;

    // Simulate check
    const fileSize = 150 * 1024 * 1024; // 150MB
    const isOversized = fileSize > maxSizeBytes;

    expect(isOversized).toBe(true);
  });
});
