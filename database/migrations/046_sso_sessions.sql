-- 046_sso_sessions.sql
-- SSO session tracking for SAML 2.0 and OIDC flows
-- State management and provider tracking for authentication

CREATE TABLE IF NOT EXISTS sso_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID,
  user_id UUID,
  email TEXT NOT NULL,
  sso_provider TEXT NOT NULL,
  state_token TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sso_sessions_state ON sso_sessions(state_token);
CREATE INDEX IF NOT EXISTS idx_sso_sessions_email ON sso_sessions(email);
CREATE INDEX IF NOT EXISTS idx_sso_sessions_provider ON sso_sessions(sso_provider);
CREATE INDEX IF NOT EXISTS idx_sso_sessions_org ON sso_sessions(org_id);
CREATE INDEX IF NOT EXISTS idx_sso_sessions_user ON sso_sessions(user_id);
