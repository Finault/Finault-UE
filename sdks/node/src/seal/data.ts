/**
 * SealData — Immutable representation of a Finault Seal.
 *
 * All fields are readonly after construction.
 */

export interface SealDataInput {
  // Identity — WHO
  sealId?: string;
  orgId?: string;
  agentId?: string;
  principalId?: string;

  // Decision — WHAT + WHY
  action?: string;
  inputHash?: string;
  model?: string;
  modelVersion?: string;
  reasoning?: string;
  alternatives?: Array<Record<string, unknown>>;
  confidence?: number;

  // Context — WHERE + HOW
  protocol?: string;
  provider?: string;
  sessionId?: string;
  parentSealId?: string;

  // Outcome — WHAT HAPPENED
  outcome?: Record<string, unknown>;
  outcomeHash?: string;
  costUsd?: number;
  tokensUsed?: number;
  latencyMs?: number;

  // Integrity — PROOF
  timestamp?: string;
  sequence?: number;
  prevHash?: string;
  sealHash?: string;
  signature?: string;
  blockchainAnchor?: string;

  // Metadata
  sealVersion?: string;
  tags?: string[];
  custom?: Record<string, unknown>;
}

export class SealData {
  readonly sealId: string;
  readonly orgId: string;
  readonly agentId: string;
  readonly principalId: string;

  readonly action: string;
  readonly inputHash: string;
  readonly model: string;
  readonly modelVersion: string;
  readonly reasoning: string;
  readonly alternatives: Array<Record<string, unknown>>;
  readonly confidence: number;

  readonly protocol: string;
  readonly provider: string;
  readonly sessionId: string;
  readonly parentSealId: string;

  readonly outcome: Record<string, unknown>;
  readonly outcomeHash: string;
  readonly costUsd: number;
  readonly tokensUsed: number;
  readonly latencyMs: number;

  readonly timestamp: string;
  readonly sequence: number;
  readonly prevHash: string;
  readonly sealHash: string;
  readonly signature: string;
  readonly blockchainAnchor: string;

  readonly sealVersion: string;
  readonly tags: string[];
  readonly custom: Record<string, unknown>;

  constructor(input: SealDataInput = {}) {
    this.sealId = input.sealId ?? '';
    this.orgId = input.orgId ?? '';
    this.agentId = input.agentId ?? '';
    this.principalId = input.principalId ?? '';

    this.action = input.action ?? '';
    this.inputHash = input.inputHash ?? '';
    this.model = input.model ?? '';
    this.modelVersion = input.modelVersion ?? '';
    this.reasoning = input.reasoning ?? '';
    this.alternatives = input.alternatives ? [...input.alternatives] : [];
    this.confidence = input.confidence ?? -1;

    this.protocol = input.protocol ?? 'REST';
    this.provider = input.provider ?? '';
    this.sessionId = input.sessionId ?? '';
    this.parentSealId = input.parentSealId ?? '';

    this.outcome = input.outcome ? { ...input.outcome } : {};
    this.outcomeHash = input.outcomeHash ?? '';
    this.costUsd = input.costUsd ?? -1;
    this.tokensUsed = input.tokensUsed ?? -1;
    this.latencyMs = input.latencyMs ?? -1;

    this.timestamp = input.timestamp ?? '';
    this.sequence = input.sequence ?? 0;
    this.prevHash = input.prevHash ?? '0'.repeat(64);
    this.sealHash = input.sealHash ?? '';
    this.signature = input.signature ?? '';
    this.blockchainAnchor = input.blockchainAnchor ?? '';

    this.sealVersion = input.sealVersion ?? '1.0.0';
    this.tags = input.tags ? [...input.tags] : [];
    this.custom = input.custom ? { ...input.custom } : {};

    Object.freeze(this);
  }

  /** Convert to plain object for JSON serialization (snake_case for wire format). */
  toDict(): Record<string, unknown> {
    return {
      seal_id: this.sealId,
      org_id: this.orgId,
      agent_id: this.agentId,
      principal_id: this.principalId,
      action: this.action,
      input_hash: this.inputHash,
      model: this.model,
      model_version: this.modelVersion,
      reasoning: this.reasoning,
      alternatives: this.alternatives,
      confidence: this.confidence,
      protocol: this.protocol,
      provider: this.provider,
      session_id: this.sessionId,
      parent_seal_id: this.parentSealId,
      outcome: this.outcome,
      outcome_hash: this.outcomeHash,
      cost_usd: this.costUsd,
      tokens_used: this.tokensUsed,
      latency_ms: this.latencyMs,
      timestamp: this.timestamp,
      sequence: this.sequence,
      prev_hash: this.prevHash,
      seal_hash: this.sealHash,
      signature: this.signature,
      blockchain_anchor: this.blockchainAnchor,
      seal_version: this.sealVersion,
      tags: this.tags,
      custom: this.custom,
    };
  }

  /** Hashable dict — excludes seal_hash and signature. */
  hashableDict(): Record<string, unknown> {
    const d = this.toDict();
    delete d.seal_hash;
    delete d.signature;
    return d;
  }

  /** Canonical JSON for hashing. */
  toJSON(): string {
    return JSON.stringify(this.toDict(), Object.keys(this.toDict()).sort());
  }

  /** Create from wire-format (snake_case) dict. */
  static fromDict(data: Record<string, unknown>): SealData {
    return new SealData({
      sealId: data.seal_id as string,
      orgId: data.org_id as string,
      agentId: data.agent_id as string,
      principalId: data.principal_id as string,
      action: data.action as string,
      inputHash: data.input_hash as string,
      model: data.model as string,
      modelVersion: data.model_version as string,
      reasoning: data.reasoning as string,
      alternatives: data.alternatives as Array<Record<string, unknown>>,
      confidence: data.confidence as number,
      protocol: data.protocol as string,
      provider: data.provider as string,
      sessionId: data.session_id as string,
      parentSealId: data.parent_seal_id as string,
      outcome: data.outcome as Record<string, unknown>,
      outcomeHash: data.outcome_hash as string,
      costUsd: data.cost_usd as number,
      tokensUsed: data.tokens_used as number,
      latencyMs: data.latency_ms as number,
      timestamp: data.timestamp as string,
      sequence: data.sequence as number,
      prevHash: data.prev_hash as string,
      sealHash: data.seal_hash as string,
      signature: data.signature as string,
      blockchainAnchor: data.blockchain_anchor as string,
      sealVersion: data.seal_version as string,
      tags: data.tags as string[],
      custom: data.custom as Record<string, unknown>,
    });
  }

  summary(): string {
    const cost = this.costUsd >= 0 ? `$${this.costUsd.toFixed(4)}` : 'n/a';
    return `[${this.sealId}] ${this.agentId}/${this.action} model=${this.model || 'none'} cost=${cost} seq=${this.sequence}`;
  }
}
