-- Migration 054: Add trace and quality columns to seals table
-- Adds support for trace linking and quality signal reporting

ALTER TABLE seals ADD COLUMN IF NOT EXISTS trace_id UUID;
ALTER TABLE seals ADD COLUMN IF NOT EXISTS parent_seal_id UUID;
ALTER TABLE seals ADD COLUMN IF NOT EXISTS quality_score FLOAT;
ALTER TABLE seals ADD COLUMN IF NOT EXISTS quality_method TEXT;

-- Create indexes for efficient trace queries
CREATE INDEX IF NOT EXISTS idx_seals_trace_id ON seals (trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_seals_parent_id ON seals (parent_seal_id) WHERE parent_seal_id IS NOT NULL;

-- Create composite index for common trace traversal patterns
CREATE INDEX IF NOT EXISTS idx_seals_trace_parent ON seals (trace_id, parent_seal_id) WHERE trace_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN seals.trace_id IS 'UUID linking all seals in a multi-call trace';
COMMENT ON COLUMN seals.parent_seal_id IS 'UUID of parent seal for hierarchical traces';
COMMENT ON COLUMN seals.quality_score IS 'Quality score (0-1) or categorical label (good/acceptable/bad)';
COMMENT ON COLUMN seals.quality_method IS 'Method used to derive quality: explicit_score, label, callback';
