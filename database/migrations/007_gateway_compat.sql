-- ============================================================
-- Migration 007: Gateway Compatibility Layer
-- Adds tables/views that the gateway references but aren't in
-- the core migrations (name mismatches + missing tables)
-- ============================================================

-- The gateway references 'blockchain_anchors' but migration 003 creates 'anchors'
CREATE TABLE IF NOT EXISTS blockchain_anchors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  close_pack_id UUID REFERENCES close_packs(id),
  chain TEXT NOT NULL DEFAULT 'bitcoin',
  tx_hash TEXT,
  block_number BIGINT,
  merkle_root TEXT NOT NULL,
  data_hash TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  confirmations INT DEFAULT 0,
  anchor_time TIMESTAMPTZ DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- The gateway references 'crypto_proofs' but migration 003 creates 'merkle_proofs'
CREATE TABLE IF NOT EXISTS crypto_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  proof_type TEXT NOT NULL DEFAULT 'sha256-merkle',
  data_hash TEXT NOT NULL,
  merkle_root TEXT,
  merkle_path JSONB,
  blockchain_anchor_id UUID REFERENCES blockchain_anchors(id),
  verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  period_start DATE,
  period_end DATE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- The gateway references 'proof_registry' but migration 003 creates 'verification_records'
CREATE TABLE IF NOT EXISTS proof_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proof_id UUID REFERENCES crypto_proofs(id),
  org_id UUID REFERENCES organizations(id),
  close_pack_id UUID REFERENCES close_packs(id),
  proof_type TEXT DEFAULT 'close-pack',
  data_hash TEXT NOT NULL,
  blockchain_tx TEXT,
  verification_url TEXT,
  public_accessible BOOLEAN DEFAULT true,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- The gateway references 'budget_configs' (separate from 'budgets')
CREATE TABLE IF NOT EXISTS budget_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  name TEXT NOT NULL,
  budget_type TEXT DEFAULT 'monthly' CHECK (budget_type IN ('daily', 'weekly', 'monthly', 'quarterly', 'annual')),
  amount DECIMAL(15,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  alert_thresholds JSONB DEFAULT '[50, 75, 90, 100]',
  auto_actions JSONB DEFAULT '{}',
  cost_center TEXT,
  provider TEXT,
  model TEXT,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- The gateway references 'reconciliation_reports' but migration 005 creates 'reconciliation_certificates'
CREATE TABLE IF NOT EXISTS reconciliation_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'complete', 'certified')),
  invoice_count INT DEFAULT 0,
  total_invoiced DECIMAL(15,2) DEFAULT 0,
  total_usage DECIMAL(15,2) DEFAULT 0,
  variance DECIMAL(15,2) DEFAULT 0,
  variance_pct DECIMAL(5,2) DEFAULT 0,
  match_rate DECIMAL(5,2) DEFAULT 0,
  discrepancies JSONB DEFAULT '[]',
  report_data JSONB DEFAULT '{}',
  certified_by TEXT,
  certified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- The gateway references 'scheduled_actions' — not in any migration
CREATE TABLE IF NOT EXISTS scheduled_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  action_type TEXT NOT NULL,
  schedule TEXT NOT NULL, -- cron expression
  config JSONB DEFAULT '{}',
  last_run TIMESTAMPTZ,
  next_run TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disabled')),
  run_count INT DEFAULT 0,
  last_result JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE blockchain_anchors ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE proof_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_actions ENABLE ROW LEVEL SECURITY;

-- RLS Policies — org-scoped access
CREATE POLICY "org_access" ON blockchain_anchors FOR ALL USING (org_id = auth.uid());
CREATE POLICY "org_access" ON crypto_proofs FOR ALL USING (org_id = auth.uid());
CREATE POLICY "org_access" ON proof_registry FOR ALL USING (org_id = auth.uid());
CREATE POLICY "org_access" ON budget_configs FOR ALL USING (org_id = auth.uid());
CREATE POLICY "org_access" ON reconciliation_reports FOR ALL USING (org_id = auth.uid());
CREATE POLICY "org_access" ON scheduled_actions FOR ALL USING (org_id = auth.uid());

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_blockchain_anchors_org ON blockchain_anchors(org_id);
CREATE INDEX IF NOT EXISTS idx_blockchain_anchors_status ON blockchain_anchors(status);
CREATE INDEX IF NOT EXISTS idx_crypto_proofs_org ON crypto_proofs(org_id);
CREATE INDEX IF NOT EXISTS idx_crypto_proofs_period ON crypto_proofs(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_proof_registry_org ON proof_registry(org_id);
CREATE INDEX IF NOT EXISTS idx_budget_configs_org ON budget_configs(org_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_reports_org ON reconciliation_reports(org_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_reports_period ON reconciliation_reports(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_scheduled_actions_org ON scheduled_actions(org_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_actions_next ON scheduled_actions(next_run) WHERE status = 'active';
