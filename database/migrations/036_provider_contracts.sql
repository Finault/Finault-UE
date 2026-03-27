-- Provider contract commitment tracking
-- Used by Charriere #48 and Committee #48 endpoints
-- Stores provider contract commitments (OpenAI, Anthropic, Google, etc.)
-- Example: {"openai": {"committed_amount": 500000, "period_start": "2026-01-01", "period_end": "2026-12-31", "terms": "Annual enterprise agreement"}}

ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS provider_contracts JSONB DEFAULT '{}'::jsonb;

-- Index for faster lookups of organizations with contracts
CREATE INDEX IF NOT EXISTS idx_org_settings_provider_contracts ON org_settings USING gin(provider_contracts);

-- Add comment for documentation
COMMENT ON COLUMN org_settings.provider_contracts IS 'JSON object mapping provider names to contract details including committed_amount, period_start, period_end, and terms';
