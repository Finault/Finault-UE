CREATE TABLE IF NOT EXISTS stripe_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  stripe_user_id TEXT NOT NULL,
  encrypted_access_token TEXT NOT NULL,
  encryption_version TEXT DEFAULT 'aes-gcm-v1',
  scope TEXT DEFAULT 'read_only',
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'pending', -- pending, syncing, synced, error
  sync_error TEXT,
  status TEXT DEFAULT 'active', -- active, disconnected, error
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id)
);

CREATE INDEX idx_stripe_connections_org ON stripe_connections(org_id);
CREATE INDEX idx_stripe_connections_status ON stripe_connections(status);
