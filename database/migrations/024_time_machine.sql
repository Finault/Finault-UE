-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 024: Time Machine — Historical Usage & Analysis Tables
-- ═══════════════════════════════════════════════════════════════════════════════
-- Supports the Time Machine retroactive analysis engine.
-- Stores historical usage data pulled from provider APIs, Stripe revenue data,
-- Time Machine analysis results, and raw API payloads for audit.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Historical Usage ────────────────────────────────────────────────────────
-- Normalized records from all providers: OpenAI, Anthropic, Google, Azure, Bedrock.
-- One row per (org, date, provider, model, project). Daily granularity.
CREATE TABLE IF NOT EXISTS historical_usage (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id          UUID NOT NULL REFERENCES organizations(id),
    date            DATE NOT NULL,
    provider        TEXT NOT NULL,           -- 'openai', 'anthropic', 'google', 'azure', 'bedrock'
    model           TEXT NOT NULL,           -- e.g., 'gpt-4o', 'claude-3-opus'
    project_id      TEXT DEFAULT 'default',  -- Provider-specific project/workspace ID
    api_key_id      TEXT DEFAULT '',         -- Provider-specific API key ID
    input_tokens    BIGINT DEFAULT 0,
    output_tokens   BIGINT DEFAULT 0,
    num_requests    INTEGER DEFAULT 0,
    cost_usd        NUMERIC(12, 6) DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT now(),

    -- Prevent duplicate imports
    UNIQUE(org_id, date, provider, model, project_id, api_key_id)
);

CREATE INDEX IF NOT EXISTS idx_historical_usage_org_date
    ON historical_usage(org_id, date);
CREATE INDEX IF NOT EXISTS idx_historical_usage_org_model
    ON historical_usage(org_id, model);
CREATE INDEX IF NOT EXISTS idx_historical_usage_org_provider
    ON historical_usage(org_id, provider, date);

-- ─── Historical Costs (Dollar-denominated) ───────────────────────────────────
-- Separate from token counts because some providers give cost data with different
-- granularity than usage data. Used for reconciliation.
CREATE TABLE IF NOT EXISTS historical_costs (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id          UUID NOT NULL REFERENCES organizations(id),
    date            DATE NOT NULL,
    provider        TEXT NOT NULL,
    line_item       TEXT NOT NULL,           -- Provider-specific description
    project_id      TEXT DEFAULT 'default',
    cost_usd        NUMERIC(12, 6) NOT NULL,
    currency        TEXT DEFAULT 'USD',
    created_at      TIMESTAMPTZ DEFAULT now(),

    UNIQUE(org_id, date, provider, line_item, project_id)
);

CREATE INDEX IF NOT EXISTS idx_historical_costs_org_date
    ON historical_costs(org_id, date);

-- ─── Stripe Revenue History ──────────────────────────────────────────────────
-- Per-customer revenue data pulled from Stripe invoices.
CREATE TABLE IF NOT EXISTS stripe_revenue_history (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id          UUID NOT NULL REFERENCES organizations(id),
    stripe_customer_id TEXT NOT NULL,
    customer_name   TEXT,
    customer_email  TEXT,
    month           TEXT NOT NULL,           -- 'YYYY-MM' format
    revenue_usd     NUMERIC(12, 2) DEFAULT 0,
    invoice_count   INTEGER DEFAULT 0,
    mrr_usd         NUMERIC(12, 2) DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT now(),

    UNIQUE(org_id, stripe_customer_id, month)
);

CREATE INDEX IF NOT EXISTS idx_stripe_revenue_org_month
    ON stripe_revenue_history(org_id, month);

-- ─── Time Machine Analysis Results ───────────────────────────────────────────
-- Stores the output of a complete Time Machine analysis run.
-- One row per analysis. References the Close Pack if one was generated.
CREATE TABLE IF NOT EXISTS time_machine_analyses (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id              UUID NOT NULL REFERENCES organizations(id),
    analysis_period_start DATE NOT NULL,
    analysis_period_end   DATE NOT NULL,
    actual_total_usd    NUMERIC(12, 2) NOT NULL,
    optimized_total_usd NUMERIC(12, 2) NOT NULL,
    recoverable_usd     NUMERIC(12, 2) NOT NULL,
    savings_percent     NUMERIC(5, 2) NOT NULL,
    savings_by_category JSONB DEFAULT '{}',   -- {model_substitution: $, batch: $, cache: $, migration: $, cross_provider: $}
    alternate_timeline  JSONB DEFAULT '[]',   -- [{date, actual, optimized, cumulative_actual, cumulative_optimized}]
    customer_impact     JSONB DEFAULT '[]',   -- [{customer_id, name, revenue, actual_cost, optimized_cost, actual_margin, optimized_margin}]
    finault_score       JSONB DEFAULT '{}',   -- {overall: N, dimensions: {margin_health: N, ...}}
    models_analyzed     TEXT[] DEFAULT '{}',
    providers_analyzed  TEXT[] DEFAULT '{}',
    close_pack_id       UUID,                 -- References close_packs(id) if sealed
    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_machine_org
    ON time_machine_analyses(org_id, created_at DESC);

-- ─── Raw Sync Payloads (Audit Trail) ─────────────────────────────────────────
-- Stores raw JSON responses from provider APIs for audit and replay.
-- Compressed via JSONB. Retained for 12 months per compliance policy.
CREATE TABLE IF NOT EXISTS raw_sync_payloads (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id          UUID NOT NULL REFERENCES organizations(id),
    provider        TEXT NOT NULL,
    endpoint        TEXT NOT NULL,           -- e.g., 'usage/completions', 'cost_report'
    payload         JSONB NOT NULL,
    fetched_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_raw_payloads_org
    ON raw_sync_payloads(org_id, fetched_at DESC);

-- ─── Customer Attribution Mappings ───────────────────────────────────────────
-- User-configured mappings between AI projects/keys and Stripe customers.
-- Persisted so attribution works consistently across analyses.
CREATE TABLE IF NOT EXISTS customer_attribution_mappings (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id          UUID NOT NULL REFERENCES organizations(id),
    stripe_customer_id TEXT NOT NULL,
    customer_name   TEXT,
    strategy        TEXT NOT NULL DEFAULT 'proportional',  -- 'api_key', 'project', 'proportional'
    match_value     TEXT,                    -- API key ID or project ID being mapped
    weight          NUMERIC(5, 4) DEFAULT 1.0, -- For proportional: revenue-based weight
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),

    UNIQUE(org_id, stripe_customer_id, match_value)
);

-- ─── RLS Policies ────────────────────────────────────────────────────────────
-- Standard org-scoped access control matching existing pattern.
ALTER TABLE historical_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE historical_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_revenue_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_machine_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_sync_payloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_attribution_mappings ENABLE ROW LEVEL SECURITY;

-- Org-scoped read/write for authenticated users
CREATE POLICY "org_access" ON historical_usage
    FOR ALL USING (org_id IN (
        SELECT org_id FROM users WHERE auth_id = auth.uid()
    ));

CREATE POLICY "org_access" ON historical_costs
    FOR ALL USING (org_id IN (
        SELECT org_id FROM users WHERE auth_id = auth.uid()
    ));

CREATE POLICY "org_access" ON stripe_revenue_history
    FOR ALL USING (org_id IN (
        SELECT org_id FROM users WHERE auth_id = auth.uid()
    ));

CREATE POLICY "org_access" ON time_machine_analyses
    FOR ALL USING (org_id IN (
        SELECT org_id FROM users WHERE auth_id = auth.uid()
    ));

CREATE POLICY "org_access" ON raw_sync_payloads
    FOR ALL USING (org_id IN (
        SELECT org_id FROM users WHERE auth_id = auth.uid()
    ));

CREATE POLICY "org_access" ON customer_attribution_mappings
    FOR ALL USING (org_id IN (
        SELECT org_id FROM users WHERE auth_id = auth.uid()
    ));

-- Public read for Time Machine analyses via shareable link (same pattern as close_packs in migration 023)
CREATE POLICY "public_read_by_id" ON time_machine_analyses
    FOR SELECT USING (true);

-- ─── Comments ────────────────────────────────────────────────────────────────
COMMENT ON TABLE historical_usage IS 'Time Machine: normalized provider usage data with daily granularity';
COMMENT ON TABLE historical_costs IS 'Time Machine: dollar-denominated cost data from provider billing APIs';
COMMENT ON TABLE stripe_revenue_history IS 'Time Machine: per-customer monthly revenue from Stripe invoices';
COMMENT ON TABLE time_machine_analyses IS 'Time Machine: complete analysis results with alternate timeline';
COMMENT ON TABLE raw_sync_payloads IS 'Time Machine: raw API responses for audit trail (12-month retention)';
COMMENT ON TABLE customer_attribution_mappings IS 'Time Machine: user-configured customer-to-cost-center mappings';
