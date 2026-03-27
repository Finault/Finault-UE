-- 038_session_costs.sql
-- Track session-level cost attribution for AI API calls
-- Used for A/B testing cost analysis and per-session billing

CREATE TABLE IF NOT EXISTS session_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  session_id TEXT NOT NULL,
  user_id TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  total_cost NUMERIC(12,6) DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  call_count INTEGER DEFAULT 0,
  models_used JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_costs_org ON session_costs(org_id);
CREATE INDEX IF NOT EXISTS idx_session_costs_session ON session_costs(session_id);
CREATE INDEX IF NOT EXISTS idx_session_costs_user ON session_costs(user_id);
CREATE INDEX IF NOT EXISTS idx_session_costs_created ON session_costs(created_at);
