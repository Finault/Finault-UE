-- 045_white_label_config.sql
-- White-label configuration for Enterprise customers
-- Custom branding, domains, and report styling

CREATE TABLE IF NOT EXISTS white_label_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE,
  brand_name TEXT,
  brand_color TEXT DEFAULT '#7c3aed',
  logo_url TEXT,
  custom_domain TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_white_label_org ON white_label_config(org_id);
CREATE INDEX IF NOT EXISTS idx_white_label_domain ON white_label_config(custom_domain);
