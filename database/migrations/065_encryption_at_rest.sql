-- Migration 032: Encryption at Rest
-- Add encrypted column for Stripe tokens, prepare for plaintext removal

ALTER TABLE stripe_connections ADD COLUMN IF NOT EXISTS access_token_encrypted_v2 TEXT;

-- Index for quick lookup by org
CREATE INDEX IF NOT EXISTS idx_stripe_connections_org ON stripe_connections(org_id);

-- After running the one-time migration worker to encrypt all existing tokens:
-- ALTER TABLE stripe_connections DROP COLUMN access_token;
-- ALTER TABLE stripe_connections RENAME COLUMN access_token_encrypted_v2 TO access_token_encrypted;
