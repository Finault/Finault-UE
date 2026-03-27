-- ═══════════════════════════════════════════════════════════════════
-- FINAULT SETTLEMENT LAYER — SUPABASE MIGRATION
-- Migration 024: Stripe connections, revenue entries, plan limits, billing events
-- Safe to run multiple times (IF NOT EXISTS + ADD COLUMN IF NOT EXISTS)
-- ═══════════════════════════════════════════════════════════════════

-- Stripe OAuth connections
CREATE TABLE IF NOT EXISTS stripe_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  stripe_account_id TEXT NOT NULL,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  scope TEXT DEFAULT 'read_only',
  status TEXT DEFAULT 'active',
  UNIQUE(org_id)
);

-- Revenue entries (universal — from Stripe, CSV, manual, or any billing system)
CREATE TABLE IF NOT EXISTS revenue_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  customer_name TEXT,
  customer_email TEXT,
  mrr_usd DECIMAL(10,2) DEFAULT 0,
  plan_name TEXT,
  plan_interval TEXT,
  subscription_status TEXT DEFAULT 'unknown',
  last_invoice_amount DECIMAL(10,2),
  last_invoice_date TIMESTAMPTZ,
  finault_customer_id TEXT,
  matched BOOLEAN DEFAULT FALSE,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, stripe_customer_id)
);

-- Add ALL possible missing columns to revenue_entries if table already existed
ALTER TABLE revenue_entries ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE revenue_entries ADD COLUMN IF NOT EXISTS matched BOOLEAN DEFAULT FALSE;
ALTER TABLE revenue_entries ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE revenue_entries ADD COLUMN IF NOT EXISTS finault_customer_id TEXT;
ALTER TABLE revenue_entries ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE revenue_entries ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE revenue_entries ADD COLUMN IF NOT EXISTS mrr_usd DECIMAL(10,2) DEFAULT 0;
ALTER TABLE revenue_entries ADD COLUMN IF NOT EXISTS plan_name TEXT;
ALTER TABLE revenue_entries ADD COLUMN IF NOT EXISTS plan_interval TEXT;
ALTER TABLE revenue_entries ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'unknown';
ALTER TABLE revenue_entries ADD COLUMN IF NOT EXISTS last_invoice_amount DECIMAL(10,2);
ALTER TABLE revenue_entries ADD COLUMN IF NOT EXISTS last_invoice_date TIMESTAMPTZ;
ALTER TABLE revenue_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE revenue_entries ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Indexes for hot-path lookups (wrapped in DO blocks for safety)
DO $$ BEGIN
  CREATE INDEX idx_revenue_org_finault_customer
    ON revenue_entries(org_id, finault_customer_id)
    WHERE matched = TRUE;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_revenue_org_stripe_customer
    ON revenue_entries(org_id, stripe_customer_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_revenue_org_unmatched
    ON revenue_entries(org_id)
    WHERE matched = FALSE;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- Plan limits (for overage billing)
CREATE TABLE IF NOT EXISTS plan_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  customer_id TEXT NOT NULL,
  included_calls INTEGER NOT NULL DEFAULT 1000,
  overage_rate_cents INTEGER NOT NULL DEFAULT 2,
  stripe_subscription_item_id TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, customer_id)
);

-- Billing events (sealed record of every overage charge)
CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  customer_id TEXT NOT NULL,
  month TEXT NOT NULL,
  actual_calls INTEGER,
  included_calls INTEGER,
  overage_calls INTEGER,
  overage_amount_usd DECIMAL(10,2),
  stripe_pushed BOOLEAN DEFAULT FALSE,
  pushed_at TIMESTAMPTZ,
  seal_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, customer_id, month)
);

CREATE INDEX IF NOT EXISTS idx_billing_events_org_month
  ON billing_events(org_id, month);

-- Customer margin cache (refreshed from real-time computation)
CREATE TABLE IF NOT EXISTS customer_margins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  customer_id TEXT NOT NULL,
  month TEXT NOT NULL,
  mrr_usd DECIMAL(10,2),
  cost_to_serve_usd DECIMAL(10,2),
  margin DECIMAL(5,4),
  underwater BOOLEAN DEFAULT FALSE,
  total_calls INTEGER DEFAULT 0,
  top_model TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, customer_id, month)
);

CREATE INDEX IF NOT EXISTS idx_customer_margins_org_month
  ON customer_margins(org_id, month);

CREATE INDEX IF NOT EXISTS idx_customer_margins_underwater
  ON customer_margins(org_id, month)
  WHERE underwater = TRUE;

-- Row Level Security
ALTER TABLE stripe_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_margins ENABLE ROW LEVEL SECURITY;

-- RLS policies (safe: CREATE POLICY will error if exists, so use DO block)
DO $$ BEGIN
  CREATE POLICY stripe_connections_policy ON stripe_connections FOR ALL USING (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY revenue_entries_policy ON revenue_entries FOR ALL USING (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY plan_limits_policy ON plan_limits FOR ALL USING (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY billing_events_policy ON billing_events FOR ALL USING (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY customer_margins_policy ON customer_margins FOR ALL USING (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════════════
-- Run after migration:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_name IN ('stripe_connections', 'revenue_entries', 'plan_limits', 'billing_events', 'customer_margins');
-- Should return 5 rows.
--
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'revenue_entries' ORDER BY ordinal_position;
-- Should include: matched, source, finault_customer_id
