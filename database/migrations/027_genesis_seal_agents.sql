-- ============================================================
-- 027: Genesis Seal & Agents Table
-- AIEI v2.0.0 — Agent Birth Certificate System
-- ============================================================

-- Agents lookup table: fast genesis detection + career summary cache
CREATE TABLE IF NOT EXISTS agents (
  agent_id TEXT PRIMARY KEY,
  org_id TEXT,
  genesis_seal_id TEXT,
  creator TEXT,
  framework TEXT,
  source_template TEXT,
  permissions TEXT,
  parent_agent_id TEXT,
  authorizer TEXT,
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  total_seals INTEGER DEFAULT 1,
  total_cost NUMERIC DEFAULT 0,
  last_active TIMESTAMPTZ DEFAULT NOW()
);

-- Add v2 columns to seals table
ALTER TABLE seals ADD COLUMN IF NOT EXISTS action_type TEXT DEFAULT 'action';
ALTER TABLE seals ADD COLUMN IF NOT EXISTS action_intent TEXT;
ALTER TABLE seals ADD COLUMN IF NOT EXISTS agent_creator TEXT;
ALTER TABLE seals ADD COLUMN IF NOT EXISTS agent_framework TEXT;
ALTER TABLE seals ADD COLUMN IF NOT EXISTS agent_source TEXT;
ALTER TABLE seals ADD COLUMN IF NOT EXISTS agent_permissions TEXT;
ALTER TABLE seals ADD COLUMN IF NOT EXISTS agent_parent_id TEXT;
ALTER TABLE seals ADD COLUMN IF NOT EXISTS agent_authorizer TEXT;

-- Index for fast agent lookup
CREATE INDEX IF NOT EXISTS idx_agents_org ON agents(org_id);
CREATE INDEX IF NOT EXISTS idx_agents_last_active ON agents(last_active DESC);

-- Index for genesis seal lookup by agent
CREATE INDEX IF NOT EXISTS idx_seals_action_type ON seals(action_type) WHERE action_type = 'genesis';
CREATE INDEX IF NOT EXISTS idx_seals_agent_action ON seals(agent_id, action_type);

-- RPC function: atomically increment agent cost and seal count
CREATE OR REPLACE FUNCTION increment_agent_cost(p_agent_id TEXT, p_cost NUMERIC)
RETURNS VOID AS $$
BEGIN
  UPDATE agents
  SET total_cost = total_cost + p_cost,
      total_seals = total_seals + 1,
      last_active = NOW()
  WHERE agent_id = p_agent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Public read access for agents table (same pattern as seals)
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read agents" ON agents FOR SELECT USING (true);
CREATE POLICY "Service insert agents" ON agents FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update agents" ON agents FOR UPDATE USING (true);

-- Grant access
GRANT SELECT ON agents TO anon, authenticated;
GRANT INSERT, UPDATE ON agents TO service_role;
GRANT EXECUTE ON FUNCTION increment_agent_cost TO anon, authenticated, service_role;
