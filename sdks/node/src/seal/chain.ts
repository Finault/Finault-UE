/**
 * SealChain — Append-only chain of Finault Seals.
 *
 * Supports full verification, export, and offline audit.
 */

import { SealData } from './data';
import { SealCrypto } from './crypto';

export class ChainIntegrityError extends Error {
  readonly index: number;
  readonly sealId: string;

  constructor(index: number, sealId: string, detail: string) {
    super(`Chain broken at index ${index} (seal ${sealId}): ${detail}`);
    this.name = 'ChainIntegrityError';
    this.index = index;
    this.sealId = sealId;
  }
}

export interface ChainCheck {
  index: number;
  sealId: string;
  sequence: number;
  hashIntegrity: boolean;
  chainLinkValid: boolean;
  signatureValid: boolean | null;
  sequenceValid: boolean;
}

export class SealChain {
  readonly orgId: string;
  private _seals: SealData[] = [];

  constructor(orgId: string = '') {
    this.orgId = orgId;
  }

  get length(): number { return this._seals.length; }
  get lastHash(): string { return this._seals.length ? this._seals[this._seals.length - 1].sealHash : '0'.repeat(64); }
  get lastSequence(): number { return this._seals.length ? this._seals[this._seals.length - 1].sequence : 0; }
  get lastSeal(): SealData | null { return this._seals.length ? this._seals[this._seals.length - 1] : null; }

  /** Append an already-finalised seal. Validates prev_hash linkage. */
  append(seal: SealData): SealData {
    const expected = this.lastHash;
    if (seal.prevHash !== expected) {
      throw new ChainIntegrityError(
        this._seals.length, seal.sealId,
        `prev_hash ${seal.prevHash.slice(0, 16)}… != expected ${expected.slice(0, 16)}…`
      );
    }
    this._seals.push(seal);
    return seal;
  }

  get(index: number): SealData { return this._seals[index]; }

  find(sealId: string): SealData | null {
    return this._seals.find(s => s.sealId === sealId) ?? null;
  }

  slice(start = 0, end?: number): SealData[] {
    return this._seals.slice(start, end);
  }

  /** Walk entire chain and verify integrity. */
  verify(secret?: string): { valid: boolean; checks: ChainCheck[] } {
    const checks: ChainCheck[] = [];
    let prevHash = '0'.repeat(64);
    let valid = true;

    for (let i = 0; i < this._seals.length; i++) {
      const seal = this._seals[i];
      const check: ChainCheck = {
        index: i,
        sealId: seal.sealId,
        sequence: seal.sequence,
        hashIntegrity: false,
        chainLinkValid: false,
        signatureValid: null,
        sequenceValid: false,
      };

      // 1. Recompute seal_hash
      const recomputed = SealCrypto.computeSealHash(seal.hashableDict());
      check.hashIntegrity = recomputed === seal.sealHash;

      // 2. Chain link
      check.chainLinkValid = seal.prevHash === prevHash;

      // 3. Sequence
      if (i === 0) {
        check.sequenceValid = seal.sequence >= 1;
      } else {
        check.sequenceValid = seal.sequence === this._seals[i - 1].sequence + 1;
      }

      // 4. Signature
      if (secret && seal.signature) {
        check.signatureValid = SealCrypto.hmacVerify(seal.sealHash, secret, seal.signature);
      } else if (secret) {
        check.signatureValid = false;
      }

      if (!check.hashIntegrity || !check.chainLinkValid) valid = false;
      if (check.signatureValid === false && secret) valid = false;

      checks.push(check);
      prevHash = seal.sealHash;
    }

    return { valid, checks };
  }

  /** Export as JSON array (snake_case wire format). */
  exportJSON(indent = 2): string {
    return JSON.stringify(this._seals.map(s => s.toDict()), null, indent);
  }

  /** Export as CSV. */
  exportCSV(): string {
    const header = 'seal_id,sequence,timestamp,agent_id,action,model,cost_usd,tokens_used,latency_ms,seal_hash,prev_hash';
    const rows = this._seals.map(s =>
      `${s.sealId},${s.sequence},${s.timestamp},${s.agentId},${s.action},${s.model},${s.costUsd},${s.tokensUsed},${s.latencyMs},${s.sealHash},${s.prevHash}`
    );
    return [header, ...rows].join('\n');
  }

  /** Import chain from JSON array. */
  static fromJSON(raw: string, orgId = ''): SealChain {
    const data = JSON.parse(raw) as Array<Record<string, unknown>>;
    const chain = new SealChain(orgId);
    for (const item of data) {
      chain.append(SealData.fromDict(item));
    }
    return chain;
  }

  /** Compute Merkle root of seal_hashes in range. */
  merkleRoot(start = 0, end?: number): string {
    const seals = this._seals.slice(start, end);
    return SealCrypto.merkleRoot(seals.map(s => s.sealHash));
  }

  [Symbol.iterator](): Iterator<SealData> {
    let i = 0;
    const seals = this._seals;
    return {
      next: () => i < seals.length ? { value: seals[i++], done: false } : { value: undefined as any, done: true }
    };
  }
}
