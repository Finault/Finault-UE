/**
 * SealClient — Main developer interface for Finault Seal in TypeScript.
 *
 * Usage:
 *   import { SealClient } from '@finault/seal';
 *   const client = new SealClient();
 *   const seal = await client.seal({ agentId: 'bot', action: 'decide', outcome: { ok: true } });
 */

import { randomUUID } from 'crypto';
import { SealData, SealDataInput } from './data';
import { SealCrypto } from './crypto';
import { SealChain } from './chain';

function generateSealId(): string {
  return 'seal_' + randomUUID().replace(/-/g, '').slice(0, 12);
}

function utcNowISO(): string {
  return new Date().toISOString().replace(/(\.\d{3})\d*Z/, '$1Z');
}

export interface SealClientOptions {
  apiKey?: string;
  apiUrl?: string;
  orgId?: string;
  autoSync?: boolean;
  onSeal?: (seal: SealData) => void;
  mode?: 'local' | 'cloud';
}

export interface SealOptions {
  agentId: string;
  action: string;
  inputHash?: string;
  model?: string;
  modelVersion?: string;
  reasoning?: string;
  alternatives?: Array<Record<string, unknown>>;
  confidence?: number;
  protocol?: string;
  provider?: string;
  sessionId?: string;
  parentSealId?: string;
  outcome?: Record<string, unknown>;
  costUsd?: number;
  tokensUsed?: number;
  latencyMs?: number;
  tags?: string[];
  custom?: Record<string, unknown>;
  principalId?: string;
}

export class SealClient {
  private _apiKey: string;
  private _apiUrl: string;
  private _orgId: string;
  private _autoSync: boolean;
  private _onSeal?: (seal: SealData) => void;
  private _chain: SealChain;

  constructor(options: SealClientOptions = {}) {
    this._apiKey = options.apiKey ?? process.env.FINAULT_API_KEY ?? '';
    // mode: 'local' disables cloud sync
    const effectiveUrl = options.mode === 'local' ? '' : options.apiUrl;
    this._apiUrl = effectiveUrl ?? process.env.FINAULT_API_URL ?? 'https://api.finault.ai';
    this._orgId = options.orgId ?? process.env.FINAULT_ORG_ID ?? '';
    this._autoSync = options.autoSync ?? true;
    this._onSeal = options.onSeal;
    this._chain = new SealChain(this._orgId);
  }

  // ── Static helpers ──────────────────────────────────────────────

  /** SHA-256 hash of arbitrary content. */
  static hash(content: unknown): string {
    return SealCrypto.hashContent(content);
  }

  /** Hash an outcome dict per the Seal spec. */
  static hashOutcome(outcome: Record<string, unknown>): string {
    return SealCrypto.hashOutcome(outcome);
  }

  // ── Core: seal() ────────────────────────────────────────────────

  /** Create, sign, chain, and return a new Seal. */
  async seal(opts: SealOptions): Promise<SealData> {
    const outcome = opts.outcome ?? {};
    const outcomeHash = SealCrypto.hashOutcome(outcome);
    const inputHash = opts.inputHash || '0'.repeat(64);
    const sealId = generateSealId();
    const ts = utcNowISO();

    const sequence = this._chain.lastSequence + 1;
    const prevHash = this._chain.lastHash;

    // Build partial (without seal_hash and signature)
    const partial = new SealData({
      sealId,
      orgId: this._orgId,
      agentId: opts.agentId,
      principalId: opts.principalId ?? '',
      action: opts.action,
      inputHash,
      model: opts.model ?? '',
      modelVersion: opts.modelVersion ?? '',
      reasoning: opts.reasoning ?? '',
      alternatives: opts.alternatives ?? [],
      confidence: opts.confidence ?? -1,
      protocol: opts.protocol ?? 'REST',
      provider: opts.provider ?? '',
      sessionId: opts.sessionId ?? '',
      parentSealId: opts.parentSealId ?? '',
      outcome,
      outcomeHash,
      costUsd: opts.costUsd ?? -1,
      tokensUsed: opts.tokensUsed ?? -1,
      latencyMs: opts.latencyMs ?? -1,
      timestamp: ts,
      sequence,
      prevHash,
      sealHash: '',
      signature: '',
      sealVersion: '1.0.0',
      tags: opts.tags ?? [],
      custom: opts.custom ?? {},
    });

    // Compute seal_hash
    const sealHash = SealCrypto.computeSealHash(partial.hashableDict());

    // Sign
    const signature = this._apiKey ? SealCrypto.hmacSign(sealHash, this._apiKey) : '';

    // Create final frozen seal
    const final = new SealData({ ...partial, sealHash, signature } as SealDataInput);

    // Append to chain
    this._chain.append(final);

    // Async cloud sync (fire-and-forget)
    if (this._autoSync && this._apiUrl && this._apiKey) {
      this._syncSeal(final).catch(() => {});
    }

    // User hook
    if (this._onSeal) {
      try { this._onSeal(final); } catch {}
    }

    return final;
  }

  // ── Verification ────────────────────────────────────────────────

  /** Verify a single seal's integrity. */
  verifySeal(seal: SealData): { valid: boolean; checks: Record<string, boolean | null> } {
    const checks: Record<string, boolean | null> = {
      hashIntegrity: false,
      signatureValid: null,
      schemaValid: false,
      timestampValid: false,
    };

    checks.schemaValid = !!(seal.sealId && seal.action && seal.sealHash && seal.timestamp && seal.sequence >= 1);

    const recomputed = SealCrypto.computeSealHash(seal.hashableDict());
    checks.hashIntegrity = recomputed === seal.sealHash;

    if (this._apiKey && seal.signature) {
      checks.signatureValid = SealCrypto.hmacVerify(seal.sealHash, this._apiKey, seal.signature);
    }

    try {
      const ts = new Date(seal.timestamp);
      checks.timestampValid = ts <= new Date();
    } catch {
      checks.timestampValid = false;
    }

    const valid = checks.hashIntegrity === true
      && checks.schemaValid === true
      && checks.timestampValid === true
      && checks.signatureValid !== false;

    return { valid, checks };
  }

  /** Verify the entire local chain. */
  verifyChain(): { valid: boolean; chainLength: number; checks: unknown[] } {
    const { valid, checks } = this._chain.verify(this._apiKey || undefined);
    return { valid, chainLength: this._chain.length, checks };
  }

  // ── Chain access ────────────────────────────────────────────────

  get chain(): SealChain { return this._chain; }
  get chainLength(): number { return this._chain.length; }

  getSeal(sealId: string): SealData | null { return this._chain.find(sealId); }

  recent(n = 10): SealData[] {
    const start = Math.max(0, this._chain.length - n);
    return this._chain.slice(start);
  }

  // ── Export ──────────────────────────────────────────────────────

  exportJSON(indent = 2): string { return this._chain.exportJSON(indent); }
  exportCSV(): string { return this._chain.exportCSV(); }
  merkleRoot(): string { return this._chain.merkleRoot(); }

  // ── Search ──────────────────────────────────────────────────────

  search(filters: {
    agentId?: string;
    action?: string;
    model?: string;
    after?: string;
    before?: string;
    tags?: string[];
    limit?: number;
  } = {}): SealData[] {
    const limit = filters.limit ?? 50;
    const results: SealData[] = [];
    const all = this._chain.slice();
    for (let i = all.length - 1; i >= 0 && results.length < limit; i--) {
      const s = all[i];
      if (filters.agentId && s.agentId !== filters.agentId) continue;
      if (filters.action && s.action !== filters.action) continue;
      if (filters.model && s.model !== filters.model) continue;
      if (filters.tags && !filters.tags.every(t => s.tags.includes(t))) continue;
      if (filters.after && s.timestamp < filters.after) continue;
      if (filters.before && s.timestamp > filters.before) continue;
      results.push(s);
    }
    return results;
  }

  // ── Stats ───────────────────────────────────────────────────────

  stats(): Record<string, unknown> {
    if (this._chain.length === 0) return { totalSeals: 0 };
    const agents = new Set<string>();
    const actions: Record<string, number> = {};
    let totalCost = 0;
    let totalTokens = 0;
    for (const seal of this._chain) {
      agents.add(seal.agentId);
      actions[seal.action] = (actions[seal.action] ?? 0) + 1;
      if (seal.costUsd >= 0) totalCost += seal.costUsd;
      if (seal.tokensUsed >= 0) totalTokens += seal.tokensUsed;
    }
    return {
      totalSeals: this._chain.length,
      uniqueAgents: agents.size,
      agents: [...agents].sort(),
      totalCostUsd: Math.round(totalCost * 1e6) / 1e6,
      totalTokens,
      avgCostPerSeal: totalCost > 0 ? Math.round((totalCost / this._chain.length) * 1e6) / 1e6 : 0,
      topActions: Object.entries(actions).sort((a, b) => b[1] - a[1]).slice(0, 10),
      merkleRoot: this._chain.merkleRoot(),
    };
  }

  // ── Private ─────────────────────────────────────────────────────

  private async _syncSeal(seal: SealData): Promise<void> {
    try {
      await fetch(`${this._apiUrl}/v1/seals`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this._apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(seal.toDict()),
        signal: AbortSignal.timeout(5000),
      });
    } catch {}
  }
}
