-- Migration 030: User Scans table for persisting experience page results
-- Run this in Supabase SQL Editor before deploying the static site update

CREATE TABLE IF NOT EXISTS user_scans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scan_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE user_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own scans" ON user_scans
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own scans" ON user_scans
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own scans" ON user_scans
  FOR UPDATE USING (auth.uid() = user_id);

-- Allow upsert (insert + on conflict update)
COMMENT ON TABLE user_scans IS 'Stores the latest scan results for each user. One row per user, upserted on each scan.';
