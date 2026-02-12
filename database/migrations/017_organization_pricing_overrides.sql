-- Migration: 017_organization_pricing_overrides
-- Description: Create organization-specific pricing override table for enterprise custom rates
-- Required by: platform/model-registry.js → loadCustomPricing()
-- Dependencies: 001_core_schema (organizations table), 016_pricing_versions
-- Backward compatible: Yes (non-destructive)

-- ═══════════════════════════════════════════════════════════════════════════════
-- Organization Pricing Overrides
-- Stores enterprise-negotiated or custom pricing rates per model per org
-- The ModelRegistry checks this table before falling back to standard pricing
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS organization_pricing_overrides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,                          -- e.g., 'gpt-4o', 'claude-sonnet-4'
  input_cost_per_1k NUMERIC(12, 8) NOT NULL,       -- Input cost per 1K tokens in USD
  output_cost_per_1k NUMERIC(12, 8) NOT NULL,      -- Output cost per 1K tokens in USD
  discount_type TEXT NOT NULL DEFAULT 'negotiated', -- 'negotiated', 'volume', 'promotional', 'batch_api'
  discount_percent NUMERIC(5, 2),                   -- Optional: percentage off list price
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_until TIMESTAMPTZ,                      -- NULL = no expiry
  notes TEXT,                                       -- Internal notes about the deal
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active override per model per org (partial unique index — can't use inline CONSTRAINT for WHERE clause)
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_org_model
  ON organization_pricing_overrides(organization_id, model_id)
  WHERE (is_active = true);

-- ─── Indexes ────────────────────────────────────────────────────────────────

-- Primary lookup: active overrides for an org
CREATE INDEX IF NOT EXISTS idx_org_pricing_active
  ON organization_pricing_overrides(organization_id)
  WHERE is_active = true;

-- Audit: find all overrides for a specific model across orgs
CREATE INDEX IF NOT EXISTS idx_org_pricing_by_model
  ON organization_pricing_overrides(model_id, is_active);

-- Expiry detection: find overrides that have expired
CREATE INDEX IF NOT EXISTS idx_org_pricing_expiry
  ON organization_pricing_overrides(effective_until)
  WHERE effective_until IS NOT NULL AND is_active = true;

-- ─── Row-Level Security ─────────────────────────────────────────────────────

ALTER TABLE organization_pricing_overrides ENABLE ROW LEVEL SECURITY;

-- Org members can read their own org's overrides
CREATE POLICY org_pricing_read
  ON organization_pricing_overrides
  FOR SELECT
  USING (organization_id = get_current_user_org());

-- Only admins can create or modify overrides
CREATE POLICY org_pricing_admin_write
  ON organization_pricing_overrides
  FOR INSERT
  WITH CHECK (
    organization_id = get_current_user_org()
    AND get_current_user_role() = 'admin'
  );

CREATE POLICY org_pricing_admin_update
  ON organization_pricing_overrides
  FOR UPDATE
  USING (
    organization_id = get_current_user_org()
    AND get_current_user_role() = 'admin'
  );

-- ─── Auto-update updated_at ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_org_pricing_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_org_pricing_updated
  BEFORE UPDATE ON organization_pricing_overrides
  FOR EACH ROW
  EXECUTE FUNCTION update_org_pricing_timestamp();

-- ─── Helper Function: Expire stale overrides ────────────────────────────────

CREATE OR REPLACE FUNCTION expire_stale_pricing_overrides()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE organization_pricing_overrides
  SET is_active = false
  WHERE is_active = true
    AND effective_until IS NOT NULL
    AND effective_until < now();

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;
