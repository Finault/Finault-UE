/**
 * Migration 056: D1 Schema for Edge Caching
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Cloudflare D1 schema for hot-path reads:
 * - Model pricing cache
 * - Organization settings cache
 * - Attribution rules cache
 */

-- Model pricing table: cached from Supabase
CREATE TABLE IF NOT EXISTS model_pricing (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_name TEXT UNIQUE NOT NULL,
  provider TEXT NOT NULL,
  input_cost_per_1k REAL NOT NULL,
  output_cost_per_1k REAL NOT NULL,
  last_updated TEXT NOT NULL,
  source TEXT DEFAULT 'supabase',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_model_pricing_name ON model_pricing(model_name);
CREATE INDEX IF NOT EXISTS idx_model_pricing_provider ON model_pricing(provider);
CREATE INDEX IF NOT EXISTS idx_model_pricing_updated ON model_pricing(last_updated);

-- Organization settings table: cached from Supabase
CREATE TABLE IF NOT EXISTS org_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT UNIQUE NOT NULL,
  settings TEXT NOT NULL,
  last_updated TEXT NOT NULL,
  source TEXT DEFAULT 'supabase',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_org_settings_org_id ON org_settings(org_id);
CREATE INDEX IF NOT EXISTS idx_org_settings_updated ON org_settings(last_updated);

-- Attribution rules table: cached from Supabase
CREATE TABLE IF NOT EXISTS attribution_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL,
  rule_id TEXT UNIQUE NOT NULL,
  condition TEXT NOT NULL,
  attribution TEXT NOT NULL,
  priority INTEGER DEFAULT 100,
  last_updated TEXT NOT NULL,
  active BOOLEAN DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_attribution_rules_org_id ON attribution_rules(org_id);
CREATE INDEX IF NOT EXISTS idx_attribution_rules_active ON attribution_rules(active);
CREATE INDEX IF NOT EXISTS idx_attribution_rules_priority ON attribution_rules(priority);
CREATE INDEX IF NOT EXISTS idx_attribution_rules_updated ON attribution_rules(last_updated);

-- Edge cache metadata: track sync status
CREATE TABLE IF NOT EXISTS d1_sync_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT UNIQUE NOT NULL,
  last_synced TEXT,
  sync_status TEXT DEFAULT 'pending',
  record_count INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sync_metadata_table ON d1_sync_metadata(table_name);
CREATE INDEX IF NOT EXISTS idx_sync_metadata_synced ON d1_sync_metadata(last_synced);

-- Insert initial sync records
INSERT OR IGNORE INTO d1_sync_metadata (table_name, sync_status)
VALUES
  ('model_pricing', 'pending'),
  ('org_settings', 'pending'),
  ('attribution_rules', 'pending');
