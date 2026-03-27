-- ══════════════════════════════════════════════════════════════════════════════
-- AGENTGATE TABLES — Migration 062
-- Economic Identity & Trust Layer for AI Agents
-- ══════════════════════════════════════════════════════════════════════════════

-- Agent Registry: core identity table
CREATE TABLE IF NOT EXISTS public.agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL,

    -- Identity
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,

    -- Framework metadata
    framework TEXT,
    model TEXT,
    version TEXT DEFAULT '1.0.0',

    -- Authorization rules (the "RULES" field of AIEI)
    spending_limit_per_tx NUMERIC,
    spending_limit_daily NUMERIC,
    spending_limit_monthly NUMERIC,
    permitted_categories TEXT[],
    permitted_domains TEXT[],
    delegation_depth INT DEFAULT 0,
    geo_restrictions TEXT[],

    -- Credential
    credential_hash TEXT,
    public_key TEXT,
    private_key_encrypted TEXT,

    -- Status
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked', 'pending')),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    last_verified_at TIMESTAMPTZ,
    last_transaction_at TIMESTAMPTZ
);

-- Agent Trust Scores: 5-dimension scoring
CREATE TABLE IF NOT EXISTS public.agent_trust_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,

    -- 5 dimensions (each 0-100)
    tx_volume_score INT DEFAULT 0,
    completion_rate_score INT DEFAULT 100,
    dispute_rate_score INT DEFAULT 100,
    auth_compliance_score INT DEFAULT 100,
    economic_impact_score INT DEFAULT 50,

    -- Composite
    composite_score INT GENERATED ALWAYS AS (
        (tx_volume_score + completion_rate_score + dispute_rate_score +
         auth_compliance_score + economic_impact_score) / 5
    ) STORED,

    -- Stats
    total_transactions INT DEFAULT 0,
    total_volume_cents BIGINT DEFAULT 0,
    successful_transactions INT DEFAULT 0,
    failed_transactions INT DEFAULT 0,
    disputed_transactions INT DEFAULT 0,
    auth_violations INT DEFAULT 0,

    -- Timestamps
    calculated_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE(agent_id)
);

-- Agent Transactions: sealed receipt log
CREATE TABLE IF NOT EXISTS public.agent_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES public.agents(id),

    -- AIEI envelope fields
    aiei_who JSONB NOT NULL,
    aiei_what TEXT NOT NULL,
    aiei_worth JSONB NOT NULL,
    aiei_rules JSONB NOT NULL,
    aiei_proof TEXT NOT NULL,

    -- Transaction details
    merchant_id TEXT,
    merchant_name TEXT,
    merchant_category TEXT,

    -- Chain
    previous_hash TEXT,
    receipt_hash TEXT NOT NULL,

    -- Status
    status TEXT DEFAULT 'completed' CHECK (status IN ('initiated', 'completed', 'failed', 'disputed', 'reversed')),

    -- Verification
    verified_by TEXT,
    verification_latency_ms INT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Agent Close Packs: monthly sealed summaries
CREATE TABLE IF NOT EXISTS public.agent_close_packs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES public.agents(id),

    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    -- Aggregates
    transaction_count INT DEFAULT 0,
    total_volume_cents BIGINT DEFAULT 0,
    successful_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,

    -- Chain
    first_tx_hash TEXT,
    last_tx_hash TEXT,
    pack_hash TEXT NOT NULL,
    previous_pack_hash TEXT,

    -- Storage
    r2_key TEXT,

    created_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE(agent_id, period_start)
);

-- API Keys for developers
CREATE TABLE IF NOT EXISTS public.agentgate_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL,

    key_hash TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    name TEXT DEFAULT 'Default',

    -- Tier
    tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'builder', 'scale', 'enterprise')),

    -- Rate limits
    monthly_verification_limit INT DEFAULT 1000,
    monthly_verifications_used INT DEFAULT 0,
    agent_limit INT DEFAULT 10,

    -- Status
    active BOOLEAN DEFAULT true,

    created_at TIMESTAMPTZ DEFAULT now(),
    last_used_at TIMESTAMPTZ
);

-- ══════════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ══════════════════════════════════════════════════════════════════════════════

CREATE INDEX idx_agents_owner ON public.agents(owner_id);
CREATE INDEX idx_agents_slug ON public.agents(slug);
CREATE INDEX idx_agents_status ON public.agents(status);
CREATE INDEX idx_agent_tx_agent ON public.agent_transactions(agent_id);
CREATE INDEX idx_agent_tx_created ON public.agent_transactions(created_at);
CREATE INDEX idx_agent_tx_merchant ON public.agent_transactions(merchant_id);
CREATE INDEX idx_agent_close_packs_agent ON public.agent_close_packs(agent_id);
CREATE INDEX idx_api_keys_hash ON public.agentgate_api_keys(key_hash);
CREATE INDEX idx_api_keys_owner ON public.agentgate_api_keys(owner_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_trust_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_close_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agentgate_api_keys ENABLE ROW LEVEL SECURITY;

-- Owners can read/write their own agents
CREATE POLICY agents_owner ON public.agents FOR ALL USING (owner_id = auth.uid());
CREATE POLICY trust_scores_owner ON public.agent_trust_scores FOR ALL
    USING (agent_id IN (SELECT id FROM public.agents WHERE owner_id = auth.uid()));
CREATE POLICY tx_owner ON public.agent_transactions FOR ALL
    USING (agent_id IN (SELECT id FROM public.agents WHERE owner_id = auth.uid()));
CREATE POLICY close_packs_owner ON public.agent_close_packs FOR ALL
    USING (agent_id IN (SELECT id FROM public.agents WHERE owner_id = auth.uid()));
CREATE POLICY api_keys_owner ON public.agentgate_api_keys FOR ALL USING (owner_id = auth.uid());

-- Public read for verification (agents table only — limited columns)
-- Handled at the API layer, not via RLS, to control which fields are exposed
