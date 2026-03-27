-- ═══════════════════════════════════════════════════════════
-- Finault Time Machine — Required Supabase Tables
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- 1. raw_sync_payloads — stores sync progress and metadata
CREATE TABLE IF NOT EXISTS public.raw_sync_payloads (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id text NOT NULL DEFAULT '',
  provider text NOT NULL DEFAULT '',
  endpoint text NOT NULL DEFAULT '',
  payload jsonb DEFAULT '{}'::jsonb,
  fetched_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_raw_sync_endpoint ON public.raw_sync_payloads (endpoint);
CREATE INDEX IF NOT EXISTS idx_raw_sync_org ON public.raw_sync_payloads (org_id);
ALTER TABLE public.raw_sync_payloads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.raw_sync_payloads FOR ALL USING (true) WITH CHECK (true);

-- 2. historical_usage — provider usage data pulled via API
CREATE TABLE IF NOT EXISTS public.historical_usage (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id text NOT NULL,
  date text NOT NULL,
  provider text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  project_id text NOT NULL DEFAULT 'default',
  api_key_id text DEFAULT '',
  input_tokens bigint DEFAULT 0,
  output_tokens bigint DEFAULT 0,
  num_requests integer DEFAULT 0,
  cost_usd double precision DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(org_id, date, provider, model, project_id, api_key_id)
);
CREATE INDEX IF NOT EXISTS idx_hist_usage_org ON public.historical_usage (org_id);
CREATE INDEX IF NOT EXISTS idx_hist_usage_date ON public.historical_usage (date);
CREATE INDEX IF NOT EXISTS idx_hist_usage_org_date ON public.historical_usage (org_id, date);
ALTER TABLE public.historical_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.historical_usage FOR ALL USING (true) WITH CHECK (true);

-- 3. time_machine_analyses — saved analysis reports
CREATE TABLE IF NOT EXISTS public.time_machine_analyses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id text NOT NULL,
  analysis_period_start text,
  analysis_period_end text,
  actual_total_usd double precision DEFAULT 0,
  optimized_total_usd double precision DEFAULT 0,
  recoverable_usd double precision DEFAULT 0,
  savings_percent double precision DEFAULT 0,
  savings_by_category jsonb DEFAULT '{}'::jsonb,
  alternate_timeline jsonb DEFAULT '[]'::jsonb,
  customer_impact jsonb DEFAULT '[]'::jsonb,
  finault_score jsonb DEFAULT '{}'::jsonb,
  models_analyzed text[] DEFAULT '{}',
  providers_analyzed text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tm_analyses_org ON public.time_machine_analyses (org_id);
CREATE INDEX IF NOT EXISTS idx_tm_analyses_created ON public.time_machine_analyses (created_at DESC);
ALTER TABLE public.time_machine_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.time_machine_analyses FOR ALL USING (true) WITH CHECK (true);

-- 4. stripe_revenue_history — Stripe revenue data
CREATE TABLE IF NOT EXISTS public.stripe_revenue_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id text NOT NULL,
  stripe_customer_id text NOT NULL DEFAULT '',
  customer_name text DEFAULT '',
  customer_email text DEFAULT '',
  month text NOT NULL DEFAULT '',
  revenue_usd double precision DEFAULT 0,
  invoice_count integer DEFAULT 0,
  mrr_usd double precision DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(org_id, stripe_customer_id, month)
);
CREATE INDEX IF NOT EXISTS idx_stripe_rev_org ON public.stripe_revenue_history (org_id);
ALTER TABLE public.stripe_revenue_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.stripe_revenue_history FOR ALL USING (true) WITH CHECK (true);

-- 5. customer_attribution_mappings — maps cost to customers
CREATE TABLE IF NOT EXISTS public.customer_attribution_mappings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id text NOT NULL,
  stripe_customer_id text DEFAULT '',
  customer_name text DEFAULT '',
  strategy text DEFAULT 'project_match',
  match_value text DEFAULT '',
  weight double precision DEFAULT 1.0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(org_id, stripe_customer_id, strategy, match_value)
);
CREATE INDEX IF NOT EXISTS idx_attr_org ON public.customer_attribution_mappings (org_id);
ALTER TABLE public.customer_attribution_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.customer_attribution_mappings FOR ALL USING (true) WITH CHECK (true);
