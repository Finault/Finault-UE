-- Value Metrics configuration for Renewal Intelligence
-- Adds JSONB column to org_settings for per-action value definitions
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS value_metrics JSONB DEFAULT '[]'::jsonb;

-- Example value_metrics format:
-- [{"metric_name": "resolved_ticket", "value_usd": 50}, {"metric_name": "code_suggestion", "value_usd": 75}]
