-- Finault: Revenue Connectors & Attribution Config
-- Automated revenue ingestion from external billing systems

CREATE TABLE IF NOT EXISTS revenue_connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  connector_type TEXT NOT NULL CHECK (connector_type IN ('stripe', 'metronome', 'orb', 'quickbooks', 'xero', 'csv_auto')),
  config JSONB NOT NULL DEFAULT '{}',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error', 'disconnected')),
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_error TEXT,
  sync_frequency TEXT DEFAULT 'daily' CHECK (sync_frequency IN ('hourly', 'daily', 'weekly', 'manual')),
  cost_center_mapping JSONB DEFAULT '{}',
  invoices_synced INTEGER DEFAULT 0,
  total_revenue_synced DECIMAL(15,4) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, connector_type)
);

CREATE INDEX IF NOT EXISTS idx_revenue_connectors_org ON revenue_connectors(org_id);
CREATE INDEX IF NOT EXISTS idx_revenue_connectors_sync ON revenue_connectors(status, last_sync_at);

ALTER TABLE revenue_connectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY revenue_connectors_all ON revenue_connectors FOR ALL USING (true);

-- Revenue Attribution Config (AI % of revenue)
CREATE TABLE IF NOT EXISTS revenue_attribution_config (
  org_id UUID PRIMARY KEY,
  global_ai_pct DECIMAL(5,2) DEFAULT 100.00,
  per_customer JSONB DEFAULT '{}',
  per_product JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE revenue_attribution_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY rev_attr_config_all ON revenue_attribution_config FOR ALL USING (true);
