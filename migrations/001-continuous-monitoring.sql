-- Finault Continuous Monitoring Tables
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- 1. Monitored Accounts: stores encrypted admin keys for continuous scanning
CREATE TABLE IF NOT EXISTS monitored_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id),
  provider text NOT NULL,              -- 'openai' | 'anthropic' | 'google'
  admin_key_encrypted text NOT NULL,   -- AES-GCM encrypted admin key
  status text DEFAULT 'active',        -- 'active' | 'paused' | 'error'
  last_scan_at timestamptz,
  last_scan_data jsonb,                -- cached last analyze result
  scan_frequency text DEFAULT 'daily', -- 'hourly' | 'daily' | 'weekly'
  created_at timestamptz DEFAULT now()
);

-- 2. Daily Snapshots: trend data for weekly digests
CREATE TABLE IF NOT EXISTS daily_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id),
  date date NOT NULL,
  total_cost numeric DEFAULT 0,
  total_calls integer DEFAULT 0,
  models jsonb,
  sealed_calls integer DEFAULT 0,
  dark_debt_pct numeric DEFAULT 0,
  score integer,
  created_at timestamptz DEFAULT now(),
  UNIQUE(org_id, date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_monitored_accounts_org ON monitored_accounts(org_id);
CREATE INDEX IF NOT EXISTS idx_monitored_accounts_status ON monitored_accounts(status);
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_org_date ON daily_snapshots(org_id, date DESC);

-- RLS policies (allow service role full access)
ALTER TABLE monitored_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on monitored_accounts" ON monitored_accounts
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on daily_snapshots" ON daily_snapshots
  FOR ALL USING (true) WITH CHECK (true);
