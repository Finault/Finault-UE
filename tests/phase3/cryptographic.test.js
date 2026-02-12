/**
 * Finault Phase 3: Cryptographic Finality Tests
 *
 * Test matrix:
 * - Merkle tree construction and verification
 * - Proof generation and verification
 * - Anchor payload computation
 * - Single-byte mutation detection
 * - Missing artifact detection
 */

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import {
  generateMerkleTree,
  verifyMerkleJson,
  computeAnchorPayload,
  sha256,
  hashPair,
  buildMerkleTree,
  generateProof,
  verifyProof,
  MERKLE_CONFIG,
} from '../../modules/closepack/generators/merkleTree.js';

import {
  BlockchainAnchorService,
  ANCHOR_CONFIG,
} from '../../modules/blockchain-anchor.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const sampleArtifacts = {
  'artifacts/journal-entry.csv': sha256('Date,Account,Debit,Credit,Memo\n2026-01-31,1000,5000.00,,AI Costs'),
  'artifacts/executive-summary.html': sha256('<html><body><h1>Executive Summary</h1></body></html>'),
  'artifacts/close-certificate.html': sha256('<html><body><h1>Close Certificate</h1></body></html>'),
  'derived/normalized-totals.csv': sha256('dimension_type,dimension_value,amount,currency\ntotal,grand_total,5000.00,USD'),
  'derived/fcs.json': sha256('{"fcs_level":"HIGH","fcs_score":92}'),
};

// ============================================================================
// MERKLE TREE TESTS
// ============================================================================

describe('Merkle Tree', () => {
  describe('sha256()', () => {
    it('computes correct hash', () => {
      const hash = sha256('hello');
      expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });

    it('is deterministic', () => {
      expect(sha256('test')).toBe(sha256('test'));
    });
  });

  describe('hashPair()', () => {
    it('concatenates and hashes two hex strings', () => {
      const left = 'aabb';
      const right = 'ccdd';
      const result = hashPair(left, right);
      expect(result).toBe(sha256(left + right));
    });
  });

  describe('buildMerkleTree()', () => {
    it('builds tree from single leaf', () => {
      const leaves = [{ path: 'a.txt', sha256: 'abc123' }];
      const tree = buildMerkleTree(leaves);
      expect(tree.root).toBe('abc123');
      expect(tree.levels.length).toBe(1);
    });

    it('builds tree from two leaves', () => {
      const leaves = [
        { path: 'a.txt', sha256: 'aaa' },
        { path: 'b.txt', sha256: 'bbb' },
      ];
      const tree = buildMerkleTree(leaves);
      expect(tree.root).toBe(hashPair('aaa', 'bbb'));
      expect(tree.levels.length).toBe(2);
    });

    it('handles odd number of leaves by duplicating last', () => {
      const leaves = [
        { path: 'a.txt', sha256: 'aaa' },
        { path: 'b.txt', sha256: 'bbb' },
        { path: 'c.txt', sha256: 'ccc' },
      ];
      const tree = buildMerkleTree(leaves);

      // Level 0: [aaa, bbb, ccc]
      // Level 1: [hash(aaa+bbb), hash(ccc+ccc)]
      // Level 2: [root]
      expect(tree.levels.length).toBe(3);
      expect(tree.levels[0]).toEqual(['aaa', 'bbb', 'ccc']);
    });

    it('sorts leaves lexicographically', () => {
      const leaves = [
        { path: 'c.txt', sha256: 'ccc' },
        { path: 'a.txt', sha256: 'aaa' },
        { path: 'b.txt', sha256: 'bbb' },
      ];
      const tree = buildMerkleTree(leaves);
      expect(tree.levels[0]).toEqual(['aaa', 'bbb', 'ccc']);
    });

    it('returns null root for empty leaves', () => {
      const tree = buildMerkleTree([]);
      expect(tree.root).toBeNull();
    });
  });

  describe('generateProof()', () => {
    it('generates valid proof for first leaf', () => {
      const leaves = [
        { path: 'a.txt', sha256: 'aaa' },
        { path: 'b.txt', sha256: 'bbb' },
        { path: 'c.txt', sha256: 'ccc' },
        { path: 'd.txt', sha256: 'ddd' },
      ];
      const proof = generateProof(leaves, 0);
      expect(proof).toBeDefined();
      expect(proof.length).toBeGreaterThan(0);
    });

    it('returns null for invalid index', () => {
      const leaves = [{ path: 'a.txt', sha256: 'aaa' }];
      const proof = generateProof(leaves, 5);
      expect(proof).toBeNull();
    });
  });

  describe('verifyProof()', () => {
    it('verifies valid proof', () => {
      const leaves = [
        { path: 'a.txt', sha256: 'aaa' },
        { path: 'b.txt', sha256: 'bbb' },
        { path: 'c.txt', sha256: 'ccc' },
        { path: 'd.txt', sha256: 'ddd' },
      ];

      const tree = buildMerkleTree(leaves);
      const proof = generateProof(leaves, 0);

      // Verify leaf 0 ('aaa' after sorting)
      const isValid = verifyProof('aaa', proof, tree.root);
      expect(isValid).toBe(true);
    });

    it('rejects invalid proof', () => {
      const leaves = [
        { path: 'a.txt', sha256: 'aaa' },
        { path: 'b.txt', sha256: 'bbb' },
      ];

      const tree = buildMerkleTree(leaves);
      const proof = generateProof(leaves, 0);

      // Try to verify wrong leaf
      const isValid = verifyProof('wrong', proof, tree.root);
      expect(isValid).toBe(false);
    });
  });
});

// ============================================================================
// MERKLE JSON GENERATOR TESTS
// ============================================================================

describe('generateMerkleTree()', () => {
  it('generates valid merkle.json structure', () => {
    const result = generateMerkleTree(sampleArtifacts);

    expect(result.version).toBe(MERKLE_CONFIG.version);
    expect(result.hash_algo).toBe('sha256');
    expect(result.leaf_count).toBe(Object.keys(sampleArtifacts).length);
    expect(result.root_sha256).toBeDefined();
    expect(result.leaves).toHaveLength(5);
    expect(result.proofs).toBeDefined();
  });

  it('sorts leaves lexicographically', () => {
    const result = generateMerkleTree(sampleArtifacts);
    const paths = result.leaves.map(l => l.path);
    const sortedPaths = [...paths].sort();
    expect(paths).toEqual(sortedPaths);
  });

  it('generates proofs for all leaves', () => {
    const result = generateMerkleTree(sampleArtifacts);
    for (const [path, _] of Object.entries(sampleArtifacts)) {
      expect(result.proofs[path]).toBeDefined();
      expect(result.proofs[path].proof_path).toBeDefined();
    }
  });

  it('is deterministic', () => {
    const result1 = generateMerkleTree(sampleArtifacts);
    const result2 = generateMerkleTree(sampleArtifacts);
    expect(result1.root_sha256).toBe(result2.root_sha256);
    expect(result1.leaves).toEqual(result2.leaves);
  });
});

// ============================================================================
// MERKLE VERIFICATION TESTS
// ============================================================================

describe('verifyMerkleJson()', () => {
  it('verifies valid merkle.json', () => {
    const merkle = generateMerkleTree(sampleArtifacts);
    const verification = verifyMerkleJson(merkle, sampleArtifacts);
    expect(verification.valid).toBe(true);
    expect(verification.errors).toHaveLength(0);
  });

  it('detects missing artifact', () => {
    const merkle = generateMerkleTree(sampleArtifacts);
    const modifiedArtifacts = { ...sampleArtifacts };
    modifiedArtifacts['new-artifact.txt'] = sha256('new content');

    const verification = verifyMerkleJson(merkle, modifiedArtifacts);
    expect(verification.valid).toBe(false);
    expect(verification.errors.some(e => e.includes('Missing leaf'))).toBe(true);
  });

  it('detects hash mismatch', () => {
    const merkle = generateMerkleTree(sampleArtifacts);
    const modifiedArtifacts = { ...sampleArtifacts };
    modifiedArtifacts['artifacts/journal-entry.csv'] = sha256('MODIFIED CONTENT');

    const verification = verifyMerkleJson(merkle, modifiedArtifacts);
    expect(verification.valid).toBe(false);
    expect(verification.errors.some(e => e.includes('Hash mismatch'))).toBe(true);
  });

  it('detects extra artifact in merkle', () => {
    const merkle = generateMerkleTree(sampleArtifacts);
    const reducedArtifacts = { ...sampleArtifacts };
    delete reducedArtifacts['derived/fcs.json'];

    const verification = verifyMerkleJson(merkle, reducedArtifacts);
    expect(verification.valid).toBe(false);
    expect(verification.errors.some(e => e.includes('Unexpected artifact'))).toBe(true);
  });

  it('detects root hash tampering', () => {
    const merkle = generateMerkleTree(sampleArtifacts);
    merkle.root_sha256 = 'tampered_root_hash';

    const verification = verifyMerkleJson(merkle, sampleArtifacts);
    expect(verification.valid).toBe(false);
    expect(verification.errors.some(e => e.includes('Root hash mismatch'))).toBe(true);
  });
});

// ============================================================================
// ANCHOR PAYLOAD TESTS
// ============================================================================

describe('computeAnchorPayload()', () => {
  it('computes deterministic payload', () => {
    const params = {
      closeId: 'FIN-CL-00000001',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      zipSha256: 'abc123',
      merkleRootSha256: 'def456',
    };

    const payload1 = computeAnchorPayload(params);
    const payload2 = computeAnchorPayload(params);

    expect(payload1).toBe(payload2);
  });

  it('produces different payloads for different inputs', () => {
    const params1 = {
      closeId: 'FIN-CL-00000001',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      zipSha256: 'abc123',
      merkleRootSha256: 'def456',
    };

    const params2 = {
      closeId: 'FIN-CL-00000002',  // Different close ID
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      zipSha256: 'abc123',
      merkleRootSha256: 'def456',
    };

    expect(computeAnchorPayload(params1)).not.toBe(computeAnchorPayload(params2));
  });

  it('uses correct format: sha256(close_id|period_start|period_end|zip_sha256|merkle_root)', () => {
    const params = {
      closeId: 'FIN-CL-TEST',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      zipSha256: 'zip',
      merkleRootSha256: 'merkle',
    };

    const expected = sha256('FIN-CL-TEST|2026-01-01|2026-01-31|zip|merkle');
    expect(computeAnchorPayload(params)).toBe(expected);
  });
});

// ============================================================================
// BLOCKCHAIN ANCHOR SERVICE TESTS
// ============================================================================

describe('BlockchainAnchorService', () => {
  let service;

  beforeEach(() => {
    service = new BlockchainAnchorService();
  });

  describe('anchor()', () => {
    it('returns successful anchor result', async () => {
      const result = await service.anchor({
        closeId: 'FIN-CL-00000001',
        anchorPayload: 'abc123',
        merkleRoot: 'def456',
        zipHash: 'ghi789',
      });

      expect(result.success).toBe(true);
      expect(result.anchorId).toMatch(/^FIN-AN-/);
      expect(result.txHash).toMatch(/^0x/);
      expect(result.network).toBe(ANCHOR_CONFIG.defaultNetwork);
      expect(result.status).toBe('CONFIRMED');
    });

    it('includes explorer URL', async () => {
      const result = await service.anchor({
        closeId: 'FIN-CL-00000001',
        anchorPayload: 'abc123',
        merkleRoot: 'def456',
        zipHash: 'ghi789',
        network: 'ethereum-sepolia',
      });

      expect(result.explorerUrl).toContain('sepolia.etherscan.io/tx/');
    });
  });

  describe('generateAnchorReceipt()', () => {
    it('generates valid receipt structure', async () => {
      const anchorResult = await service.anchor({
        closeId: 'FIN-CL-00000001',
        anchorPayload: 'abc123',
        merkleRoot: 'def456',
        zipHash: 'ghi789',
      });

      const receipt = service.generateAnchorReceipt(anchorResult);

      expect(receipt.version).toBe('1.0');
      expect(receipt.close_id).toBe('FIN-CL-00000001');
      expect(receipt.tx_hash).toBe(anchorResult.txHash);
      expect(receipt.merkle_root_sha256).toBe('def456');
      expect(receipt.verification_notes).toBeDefined();
    });
  });

  describe('generateAnchorRecord()', () => {
    it('generates database record', async () => {
      const anchorResult = await service.anchor({
        closeId: 'FIN-CL-00000001',
        anchorPayload: 'abc123',
        merkleRoot: 'def456',
        zipHash: 'ghi789',
      });

      const record = service.generateAnchorRecord(anchorResult);

      expect(record.anchor_id).toBeDefined();
      expect(record.close_id).toBe('FIN-CL-00000001');
      expect(record.pack_type).toBe('closepack');
      expect(record.status).toBe('CONFIRMED');
    });
  });
});

// ============================================================================
// TAMPER DETECTION TESTS (Critical for Phase 3)
// ============================================================================

describe('Tamper Detection', () => {
  it('detects single-byte mutation in artifact', () => {
    const original = 'Original content';
    const mutated = 'Original contenu';  // Single byte change

    const originalHash = sha256(original);
    const mutatedHash = sha256(mutated);

    expect(originalHash).not.toBe(mutatedHash);

    // Verify merkle tree would detect this
    const artifacts1 = { 'file.txt': originalHash };
    const artifacts2 = { 'file.txt': mutatedHash };

    const merkle1 = generateMerkleTree(artifacts1);
    const merkle2 = generateMerkleTree(artifacts2);

    expect(merkle1.root_sha256).not.toBe(merkle2.root_sha256);
  });

  it('detects artifact swap', () => {
    const artifactsOriginal = {
      'file1.txt': sha256('content1'),
      'file2.txt': sha256('content2'),
    };

    const artifactsSwapped = {
      'file1.txt': sha256('content2'),  // Swapped content
      'file2.txt': sha256('content1'),  // Swapped content
    };

    const merkle1 = generateMerkleTree(artifactsOriginal);
    const merkle2 = generateMerkleTree(artifactsSwapped);

    expect(merkle1.root_sha256).not.toBe(merkle2.root_sha256);
  });

  it('detects missing artifact', () => {
    const artifactsFull = {
      'file1.txt': sha256('content1'),
      'file2.txt': sha256('content2'),
      'file3.txt': sha256('content3'),
    };

    const artifactsPartial = {
      'file1.txt': sha256('content1'),
      'file2.txt': sha256('content2'),
    };

    const merkleFull = generateMerkleTree(artifactsFull);
    const merklePartial = generateMerkleTree(artifactsPartial);

    expect(merkleFull.root_sha256).not.toBe(merklePartial.root_sha256);
    expect(merkleFull.leaf_count).not.toBe(merklePartial.leaf_count);
  });
});
