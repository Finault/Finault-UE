-- Minimal Gateway Tables Migration
-- Creates ONLY the tables needed for Finault Gateway REST API calls
-- Uses CREATE TABLE IF NOT EXISTS to avoid conflicts with existing tables
-- No foreign keys, no triggers, no functions, no custom types

-- Core operational tables

CREATE TABLE IF NOT EXISTS usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT,
  provider TEXT,
  model TEXT,
  input_tokens INT,
  output_tokens INT,
  cost_cents NUMERIC,
  cost_center TEXT,
  project TEXT,
  environment TEXT,
  user_id UUID,
  latency_ms INT,
  status TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  provider TEXT,
  total_amount NUMERIC,
  status TEXT,
  raw_data JSONB,
  line_item_count INT,
  period_start DATE,
  period_end DATE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS close_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  cert_id TEXT,
  period TEXT,
  total_invoices INT,
  total_amount NUMERIC,
  status TEXT,
  attestation_hash TEXT,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  type TEXT,
  severity TEXT,
  description TEXT,
  detected_at TIMESTAMPTZ,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  status TEXT,
  provider TEXT,
  amount NUMERIC,
  description TEXT,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  name TEXT,
  amount NUMERIC,
  cost_center TEXT,
  start_date DATE,
  end_date DATE,
  status TEXT,
  alert_threshold NUMERIC,
  description TEXT,
  notification_emails TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_by UUID,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS allocation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  allocation_data JSONB,
  rules_applied JSONB,
  total_amount NUMERIC,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- SHADOW TABLES CONSOLIDATION (Migration 015)
-- ============================================================
-- The following shadow tables have been consolidated into views
-- that point to core schema tables, or merged into core tables.
-- See database/migrations/015_consolidate_shadow_tables.sql
--
-- blockchain_anchors   -> VIEW (maps to anchors from migration 003)
-- crypto_proofs        -> VIEW (maps to merkle_proofs from migration 003)
-- proof_registry       -> VIEW (maps to verification_records from migration 003)
-- budget_configs       -> MERGED into budgets table (columns added in migration 015)
-- reconciliation_reports -> MERGED into reconciliation_certificates (columns added in migration 015)
-- ============================================================
--
-- CREATE TABLE IF NOT EXISTS blockchain_anchors (
--   Consolidated - now a view created in migration 015
-- );
--
-- CREATE TABLE IF NOT EXISTS crypto_proofs (
--   Consolidated - now a view created in migration 015
-- );
--
-- CREATE TABLE IF NOT EXISTS proof_registry (
--   Consolidated - now a view created in migration 015
-- );
--
-- CREATE TABLE IF NOT EXISTS budget_configs (
--   Consolidated - columns merged into budgets table in migration 015
-- );
--
-- CREATE TABLE IF NOT EXISTS reconciliation_reports (
--   Consolidated - columns merged into reconciliation_certificates table in migration 015
-- );

CREATE TABLE IF NOT EXISTS savings_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  status TEXT,
  estimated_savings NUMERIC,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS savings_implementations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  recommendation_id UUID,
  status TEXT,
  started_at TIMESTAMPTZ,
  actual_savings NUMERIC,
  completed_at TIMESTAMPTZ,
  config JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_by UUID
);

CREATE TABLE IF NOT EXISTS scheduled_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  action_type TEXT,
  data JSONB,
  scheduled_for TIMESTAMPTZ,
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alert_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  config JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alert_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  alert_type TEXT,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS autonomous_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  settings JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS anomaly_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  detected_at TIMESTAMPTZ,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Logging and audit tables

CREATE TABLE IF NOT EXISTS erp_posting_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  erp_system TEXT,
  posting_type TEXT,
  status TEXT,
  post_id TEXT,
  data JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  user_id UUID,
  action TEXT,
  resource_type TEXT,
  resource_id TEXT,
  details JSONB,
  ip_address TEXT,
  changes JSONB,
  previous_values JSONB,
  new_values JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gateway_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  level TEXT,
  message TEXT,
  endpoint TEXT,
  method TEXT,
  status_code INT,
  response_time_ms INT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Core tables (may exist, defined here for consistency)

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  email TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  key_hash TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
