-- Migration 034: D1 Edge Database Schema
-- Supports Build 9: D1 Hot-Path Reads

CREATE TABLE IF NOT EXISTS org_settings (
  org_id TEXT PRIMARY KEY,
  api_key_hash TEXT NOT NULL,
  budget_limit REAL,
  revenue_per_query REAL,
  min_quality_tier INTEGER DEFAULT 0,
  margin_routing_enabled INTEGER DEFAULT 0,
  dark_debt_scanning INTEGER DEFAULT 1,
  webhook_url TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS model_pricing (
  model TEXT PRIMARY KEY,
  input_price REAL NOT NULL,
  output_price REAL NOT NULL,
  cached_input_price REAL,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_org_api_key ON org_settings(api_key_hash);
