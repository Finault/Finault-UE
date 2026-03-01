-- Finault Audit Benchmarks — anonymized aggregate data for moat (Section 7)
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/bejoptgsrhmklmllkobu/sql
-- ⚠️  This is the EXPANDED schema with pricing intelligence, provider concentration, and model adoption signals.

CREATE TABLE IF NOT EXISTS audit_benchmarks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- ── Core audit data ──
    provider TEXT,                        -- detected CSV provider (AWS Bedrock, Azure OpenAI, etc.)
    size_bucket TEXT,                     -- startup / smb / mid_market / enterprise
    total_spend_bucket TEXT,              -- under_10k / 10k_50k / 50k_100k / 100k_250k / 250k_500k / 500k_1m / over_1m
    model_count INTEGER,
    model_mix JSONB,                      -- [{model, spend_pct, avg_per_request, input_price, output_price, est_requests, est_input_tokens, est_output_tokens, billed_unit_price}]
    cost_center_count INTEGER,
    unallocated_pct NUMERIC(5,1),         -- shadow AI as % of total
    focus_score INTEGER,                  -- FOCUS 1.3 compliance 0-100
    focus_detected INTEGER,
    focus_total INTEGER DEFAULT 42,
    anomaly_count INTEGER,
    anomaly_types TEXT[],                 -- array of anomaly type strings
    mom_change_pct NUMERIC(6,1),          -- month-over-month % change
    line_items INTEGER,
    is_sample BOOLEAN DEFAULT FALSE,

    -- ── Pricing intelligence ──
    currency TEXT DEFAULT 'USD',          -- billing currency from CSV
    billed_prices JSONB DEFAULT '{}',     -- {model: median_unit_price} — actual billed rates from CSV
    top_model TEXT,                        -- highest-spend model name
    top_model_pct NUMERIC(5,1),           -- top model as % of total spend

    -- ── Provider concentration ──
    provider_count INTEGER,               -- number of distinct AI providers used
    provider_concentration JSONB,         -- {openai: 45.2, anthropic: 30.1, google: 24.7}
    model_hhi INTEGER,                    -- Herfindahl–Hirschman Index for model concentration (0-10000)

    -- ── Geographic & schema intelligence ──
    regions TEXT[],                        -- region names detected in CSV
    region_count INTEGER DEFAULT 0,
    column_count INTEGER DEFAULT 0,       -- total columns in uploaded CSV
    focus_columns_present TEXT[],          -- which FOCUS columns were found

    -- ── Model adoption signals ──
    has_frontier_models BOOLEAN,           -- uses GPT-4o, Claude Opus, o1, Gemini 2.5 Pro
    has_efficiency_models BOOLEAN,         -- uses mini, haiku, flash variants
    frontier_spend_pct NUMERIC(5,1),       -- % of spend on frontier models
    efficiency_spend_pct NUMERIC(5,1),     -- % of spend on efficiency models

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: allow anonymous inserts (from the audit tool), deny reads from anon
ALTER TABLE audit_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous inserts" ON audit_benchmarks
    FOR INSERT TO anon
    WITH CHECK (true);

-- Only authenticated/service role can read (for your internal dashboards & reports)
CREATE POLICY "Service role reads all" ON audit_benchmarks
    FOR SELECT TO authenticated
    USING (true);

-- ── Indexes for fast aggregation queries ──
CREATE INDEX idx_benchmarks_provider ON audit_benchmarks(provider);
CREATE INDEX idx_benchmarks_size ON audit_benchmarks(size_bucket);
CREATE INDEX idx_benchmarks_spend ON audit_benchmarks(total_spend_bucket);
CREATE INDEX idx_benchmarks_created ON audit_benchmarks(created_at DESC);
CREATE INDEX idx_benchmarks_sample ON audit_benchmarks(is_sample);
CREATE INDEX idx_benchmarks_frontier ON audit_benchmarks(has_frontier_models);
CREATE INDEX idx_benchmarks_hhi ON audit_benchmarks(model_hhi);

-- GIN index for JSONB queries on model_mix and provider_concentration
CREATE INDEX idx_benchmarks_model_mix ON audit_benchmarks USING GIN (model_mix);
CREATE INDEX idx_benchmarks_provider_conc ON audit_benchmarks USING GIN (provider_concentration);
CREATE INDEX idx_benchmarks_billed ON audit_benchmarks USING GIN (billed_prices);

COMMENT ON TABLE audit_benchmarks IS 'Anonymized aggregate data from free audit tool. No PII, no company names, no file names. Powers benchmarking, pricing intelligence, trend reports, and State of AI Spend publications.';

-- ══════════════════════════════════════════════════════════════
-- EXAMPLE QUERIES (for building reports later)
-- ══════════════════════════════════════════════════════════════

-- Average model count by company size
-- SELECT size_bucket, AVG(model_count) FROM audit_benchmarks WHERE NOT is_sample GROUP BY size_bucket;

-- Most popular model across all audits
-- SELECT elem->>'model' as model, COUNT(*) as appearances, AVG((elem->>'spend_pct')::numeric) as avg_spend_pct
-- FROM audit_benchmarks, jsonb_array_elements(model_mix) elem WHERE NOT is_sample GROUP BY elem->>'model' ORDER BY appearances DESC;

-- Average unallocated (shadow AI) spend by size
-- SELECT size_bucket, AVG(unallocated_pct) as avg_shadow_ai FROM audit_benchmarks WHERE NOT is_sample GROUP BY size_bucket;

-- Provider concentration distribution
-- SELECT provider_count, COUNT(*) as companies FROM audit_benchmarks WHERE NOT is_sample GROUP BY provider_count ORDER BY provider_count;

-- Frontier vs efficiency model adoption over time
-- SELECT date_trunc('week', created_at) as week, AVG(frontier_spend_pct) as frontier, AVG(efficiency_spend_pct) as efficiency
-- FROM audit_benchmarks WHERE NOT is_sample GROUP BY week ORDER BY week;

-- Actual billed prices vs list prices (pricing intelligence)
-- SELECT elem->>'model' as model, AVG((elem->>'billed_unit_price')::numeric) as avg_billed, AVG((elem->>'input_price')::numeric) as list_price
-- FROM audit_benchmarks, jsonb_array_elements(model_mix) elem WHERE NOT is_sample AND elem->>'billed_unit_price' IS NOT NULL GROUP BY elem->>'model';
