-- 039_ab_tests.sql
-- Track A/B test events for cost optimization and model recommendation experiments
-- Links variants to sessions and models for cost comparison

CREATE TABLE IF NOT EXISTS ab_test_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  test_name TEXT NOT NULL,
  variant TEXT NOT NULL,
  session_id TEXT,
  model TEXT,
  cost NUMERIC(12,6),
  success BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ab_test_org_name ON ab_test_events(org_id, test_name);
CREATE INDEX IF NOT EXISTS idx_ab_test_variant ON ab_test_events(variant);
CREATE INDEX IF NOT EXISTS idx_ab_test_session ON ab_test_events(session_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_created ON ab_test_events(created_at);
