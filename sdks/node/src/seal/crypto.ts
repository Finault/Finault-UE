/**
 * SealCrypto — Pure cryptographic primitives for the Finault Seal.
 *
 * Zero external dependencies. Uses Node.js built-in `crypto` module.
 * All methods are static — no state, no side effects, fully deterministic.
 */

import { createHash, createHmac, timingSafeEqual } from 'crypto';

export class SealCrypto {
  // ── Hashing ─────────────────────────────────────────────────────

  /** SHA-256 of raw bytes or string → 64-char hex digest. */
  static sha256(data: string | Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }

  /** Hash arbitrary content — objects become canonical JSON. */
  static hashContent(content: unknown): string {
    if (typeof content === 'string') {
      return SealCrypto.sha256(content);
    }
    if (Buffer.isBuffer(content)) {
      return SealCrypto.sha256(content);
    }
    const canonical = JSON.stringify(content, Object.keys(content as object).sort());
    return SealCrypto.sha256(canonical);
  }

  /** Compute outcome_hash per spec: SHA-256 of canonical JSON. */
  static hashOutcome(outcome: Record<string, unknown>): string {
    const keys = Object.keys(outcome).sort();
    const canonical = JSON.stringify(outcome, keys);
    return SealCrypto.sha256(canonical);
  }

  /** Compute seal_hash from hashable dict (all fields minus seal_hash & signature). */
  static computeSealHash(hashableDict: Record<string, unknown>): string {
    const keys = Object.keys(hashableDict).sort();
    const canonical = JSON.stringify(hashableDict, keys);
    return SealCrypto.sha256(canonical);
  }

  // ── HMAC-SHA256 Signing ─────────────────────────────────────────

  /** HMAC-SHA256 signature of seal_hash using the API secret. */
  static hmacSign(sealHash: string, secret: string): string {
    return createHmac('sha256', secret).update(sealHash).digest('hex');
  }

  /** Constant-time verification of HMAC-SHA256 signature. */
  static hmacVerify(sealHash: string, secret: string, signature: string): boolean {
    const expected = SealCrypto.hmacSign(sealHash, secret);
    try {
      return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
    } catch {
      return false;
    }
  }

  // ── Merkle Tree ─────────────────────────────────────────────────

  /** Compute Merkle root of an array of hex hash strings. */
  static merkleRoot(hashes: string[]): string {
    if (hashes.length === 0) return '0'.repeat(64);
    let layer = [...hashes];
    while (layer.length > 1) {
      if (layer.length % 2 === 1) layer.push(layer[layer.length - 1]);
      const next: string[] = [];
      for (let i = 0; i < layer.length; i += 2) {
        const combined = layer[i] + layer[i + 1];
        next.push(createHash('sha256').update(combined).digest('hex'));
      }
      layer = next;
    }
    return layer[0];
  }

  /** Generate Merkle proof for element at index. */
  static merkleProof(hashes: string[], index: number): Array<{ hash: string; position: 'left' | 'right' }> {
    if (!hashes.length || index < 0 || index >= hashes.length) return [];
    let layer = [...hashes];
    let idx = index;
    const proof: Array<{ hash: string; position: 'left' | 'right' }> = [];
    while (layer.length > 1) {
      if (layer.length % 2 === 1) layer.push(layer[layer.length - 1]);
      if (idx % 2 === 0) {
        proof.push({ hash: layer[idx + 1], position: 'right' });
      } else {
        proof.push({ hash: layer[idx - 1], position: 'left' });
      }
      const next: string[] = [];
      for (let i = 0; i < layer.length; i += 2) {
        next.push(createHash('sha256').update(layer[i] + layer[i + 1]).digest('hex'));
      }
      layer = next;
      idx = Math.floor(idx / 2);
    }
    return proof;
  }

  /** Verify a Merkle proof against a known root. */
  static verifyMerkleProof(leafHash: string, proof: Array<{ hash: string; position: string }>, root: string): boolean {
    let current = leafHash;
    for (const step of proof) {
      const combined = step.position === 'left'
        ? step.hash + current
        : current + step.hash;
      current = createHash('sha256').update(combined).digest('hex');
    }
    return current === root;
  }
}
