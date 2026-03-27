-- Model Pricing Tables for D1
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Stores normalized LiteLLM model pricing data and tracks pricing sync status.
-- Designed to be synced daily via cron trigger.
--
-- Tables:
--   1. model_pricing — The canonical pricing table (upserted from LiteLLM)
--   2. pricing_gaps — Tracks models that failed to normalize
--   3. pricing_sync_log — Audit trail of sync operations
--

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: model_pricing
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_pricing (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Model identifiers
  model TEXT NOT NULL,                    -- e.g., "gpt-4", "claude-3-opus"
  provider TEXT NOT NULL,                 -- e.g., "openai", "anthropic"

  -- Pricing (per token)
  input_cost_per_token REAL NOT NULL DEFAULT 0.0,
  output_cost_per_token REAL NOT NULL DEFAULT 0.0,

  -- Context window (tokens)
  context_window INTEGER DEFAULT 4096,

  -- Metadata
  pricing_source TEXT DEFAULT 'litellm',  -- Source of pricing data
  pricing_last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Composite unique constraint — one entry per model per provider
  UNIQUE(model, provider)
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_model_pricing_provider ON model_pricing(provider);
CREATE INDEX IF NOT EXISTS idx_model_pricing_updated ON model_pricing(pricing_last_updated DESC);
CREATE INDEX IF NOT EXISTS idx_model_pricing_model ON model_pricing(model);

-- Trigger to update updated_at on changes (SQLite doesn't have native auto-update)
CREATE TRIGGER IF NOT EXISTS update_model_pricing_timestamp
AFTER UPDATE ON model_pricing
FOR EACH ROW
BEGIN
  UPDATE model_pricing SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: pricing_gaps
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Tracks models that failed to normalize during sync.
-- Helps identify missing pricing data and monitor data quality.

CREATE TABLE IF NOT EXISTS pricing_gaps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Failed model
  model TEXT NOT NULL UNIQUE,

  -- Failure reason
  reason TEXT,                            -- "Missing pricing data", "Could not extract provider", etc.

  -- Occurrence tracking
  occurrence_count INTEGER DEFAULT 1,     -- How many times we've seen this gap

  -- Timestamps
  first_detected TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(model)
);

CREATE INDEX IF NOT EXISTS idx_pricing_gaps_detected ON pricing_gaps(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_pricing_gaps_count ON pricing_gaps(occurrence_count DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: pricing_sync_log
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Audit trail of pricing sync operations.
-- Use this to monitor sync health, latency, and error rates.

CREATE TABLE IF NOT EXISTS pricing_sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Sync metadata
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  model_count INTEGER DEFAULT 0,          -- How many models were synced
  pricing_gaps INTEGER DEFAULT 0,         -- How many gaps were found
  error TEXT,                             -- Error message if sync failed
  success BOOLEAN DEFAULT 1,              -- Sync success flag

  -- Duration (for performance monitoring)
  duration_ms INTEGER,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pricing_sync_log_timestamp ON pricing_sync_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_pricing_sync_log_success ON pricing_sync_log(success);

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED DATA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Pre-populate with common model pricing (these will be overwritten by sync)

INSERT OR IGNORE INTO model_pricing
(model, provider, input_cost_per_token, output_cost_per_token, context_window, pricing_source)
VALUES
  -- OpenAI
  ('gpt-4', 'openai', 0.00003, 0.00006, 8192, 'litellm'),
  ('gpt-4-turbo', 'openai', 0.00001, 0.00003, 128000, 'litellm'),
  ('gpt-4o', 'openai', 0.000005, 0.000015, 128000, 'litellm'),
  ('gpt-3.5-turbo', 'openai', 0.0000005, 0.0000015, 4096, 'litellm'),

  -- Anthropic
  ('claude-3-opus', 'anthropic', 0.000015, 0.000075, 200000, 'litellm'),
  ('claude-3-sonnet', 'anthropic', 0.000003, 0.000015, 200000, 'litellm'),
  ('claude-3-haiku', 'anthropic', 0.00000025, 0.00000125, 200000, 'litellm'),

  -- Google
  ('gemini-2.0-flash', 'google', 0.000000375, 0.0000015, 1000000, 'litellm'),
  ('gemini-1.5-pro', 'google', 0.0000035, 0.000014, 1000000, 'litellm'),

  -- Meta (Llama)
  ('llama-2-7b', 'meta', 0.0000001, 0.0000001, 4096, 'litellm'),
  ('llama-2-70b', 'meta', 0.0000010, 0.0000015, 4096, 'litellm');
