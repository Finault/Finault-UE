/**
 * AgentGate Resource — AI Agent Economic Identity & Trust Layer
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Manages AI agent identities, trust scores, and sealed transaction receipts
 * via the Finault AIEI protocol.
 */

interface AgentRules {
  spending_limit_per_tx?: number;
  spending_limit_daily?: number;
  spending_limit_monthly?: number;
  permitted_categories?: string[];
  permitted_domains?: string[];
  delegation_depth?: number;
  geo_restrictions?: string[];
}

interface RegisterAgentOptions {
  name: string;
  rules: AgentRules;
  slug?: string;
  description?: string;
  framework?: string;
  model?: string;
  version?: string;
}

interface VerifyOptions {
  action?: string;
  amount?: number;
  merchant?: string;
  category?: string;
}

interface ReceiptWorth {
  value_cents: number;
  currency?: string;
  margin_impact_cents?: number;
}

interface SubmitReceiptOptions {
  verification_id: string;
  action: string;
  merchant_id: string;
  worth: ReceiptWorth;
  status?: 'completed' | 'failed' | 'disputed';
  merchant_name?: string;
  merchant_category?: string;
  metadata?: Record<string, unknown>;
}

interface AuthorizeOptions {
  action: string;
  amount_cents: number;
  merchant_domain?: string;
  category?: string;
}

interface AgentRegistration {
  agent_id: string;
  credential: {
    aiei_version: string;
    who: Record<string, unknown>;
    rules: AgentRules;
    credential_hash: string;
    public_key: string;
    issued_by: string;
    issued_at: string;
    expires_at: string;
  };
  api_key_info: {
    agents_used: number;
    agents_limit: number;
    tier: string;
  };
}

interface VerificationResult {
  verified: boolean;
  reason?: string;
  agent: {
    id: string;
    name: string;
    framework: string;
    status: string;
    registered_at: string;
  };
  trust_score: {
    composite: number;
    dimensions: Record<string, number>;
    total_transactions: number;
    member_since: string;
  };
  authorization?: Record<string, unknown>;
  credential_hash: string;
  verification_id: string;
  verified_at: string;
  latency_ms: number;
}

interface ReceiptResult {
  receipt: {
    id: string;
    aiei_proof: string;
    previous_hash: string;
    chain_position: number;
    trust_score_updated: boolean;
    new_composite_score: number;
  };
}

interface ScoreResult {
  agent_id: string;
  trust_score: {
    composite: number;
    dimensions: Record<string, number>;
    percentile: number;
    trend: string;
    history: Array<{ date: string; composite: number }>;
  };
  stats: {
    total_transactions: number;
    total_volume_usd: number;
    success_rate: number;
    avg_transaction_usd: number;
    active_days: number;
    member_since: string;
  };
}

interface AuthorizationResult {
  authorized: boolean;
  reasons: Array<{
    rule: string;
    status: 'ok' | 'denied';
    detail: string | null;
  }>;
}

interface CredentialResult {
  agent_id: string;
  name: string;
  credential_hash: string;
  public_key: string;
  issued_by: string;
  issued_at: string;
  expires_at: string;
  status: string;
  trust_score_composite: number;
}

export class AgentGate {
  private client: any;

  constructor(client: any) {
    this.client = client;
  }

  /**
   * Register a new AI agent and receive an AIEI credential.
   */
  async registerAgent(opts: RegisterAgentOptions): Promise<AgentRegistration> {
    const body: Record<string, unknown> = {
      name: opts.name,
      rules: opts.rules,
      version: opts.version || '1.0.0',
    };
    if (opts.slug) body.slug = opts.slug;
    if (opts.description) body.description = opts.description;
    if (opts.framework) body.framework = opts.framework;
    if (opts.model) body.model = opts.model;

    return this.client.request<AgentRegistration>('POST', '/v1/agents/register', body);
  }

  /**
   * Verify an agent's identity, trust score, and authorization.
   */
  async verifyAgent(agentId: string, params: VerifyOptions = {}): Promise<VerificationResult> {
    return this.client.request<VerificationResult>('GET', `/v1/agents/${agentId}/verify`, undefined, { params });
  }

  /**
   * Submit a sealed transaction receipt for an agent.
   */
  async submitReceipt(agentId: string, receipt: SubmitReceiptOptions): Promise<ReceiptResult> {
    return this.client.request<ReceiptResult>('POST', `/v1/agents/${agentId}/receipt`, receipt);
  }

  /**
   * Retrieve an agent's trust score and transaction stats.
   */
  async getAgentScore(agentId: string): Promise<ScoreResult> {
    return this.client.request<ScoreResult>('GET', `/v1/agents/${agentId}/score`);
  }

  /**
   * Pre-flight authorization check for an agent action.
   */
  async authorizeAction(agentId: string, opts: AuthorizeOptions): Promise<AuthorizationResult> {
    return this.client.request<AuthorizationResult>('POST', `/v1/agents/${agentId}/authorize`, opts);
  }

  /**
   * Retrieve an agent's public credential (no auth required).
   */
  async getCredential(agentId: string): Promise<CredentialResult> {
    // This endpoint is public, but we still route through the client for consistency
    return this.client.request<CredentialResult>('GET', `/v1/agents/${agentId}/credential`);
  }
}
