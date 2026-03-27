-- Webhook delivery log for retry tracking and debugging
CREATE TABLE IF NOT EXISTS webhook_delivery_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  success BOOLEAN NOT NULL DEFAULT false,
  status_code INTEGER,
  attempts INTEGER NOT NULL DEFAULT 1,
  error TEXT,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_delivery_org ON webhook_delivery_log(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_delivery_event ON webhook_delivery_log(event_id);

-- Add webhook_signing_secret to org_settings
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS webhook_signing_secret TEXT;
