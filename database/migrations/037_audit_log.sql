-- Immutable audit log for all Finault actions
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  actor_id TEXT NOT NULL,
  actor_type TEXT NOT NULL DEFAULT 'user', -- user, api_key, system, webhook
  action TEXT NOT NULL, -- e.g., 'close_pack.sealed', 'config.updated', 'alert.acknowledged'
  resource_type TEXT NOT NULL, -- e.g., 'close_pack', 'org_settings', 'margin_alert'
  resource_id TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_log_org ON audit_log(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);

-- This table is append-only. No UPDATE or DELETE policies.
-- RLS: org members can only read their own org's audit log.
