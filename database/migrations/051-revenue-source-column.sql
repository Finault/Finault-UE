-- ============================================================================
-- Migration 051: Add source, confidence_tier, and cost_method to revenue_events
-- ============================================================================
-- Purpose: Enhance revenue events table with:
-- 1. source: Track where revenue came from (stripe, chargebee, manual, csv)
-- 2. confidence_tier: Confidence level of the match/data (1=low, 2=medium, 3=high)
-- 3. cost_method: Whether cost was from independent billing or estimated

BEGIN;

-- Add source column if not exists (default: manual for backward compatibility)
ALTER TABLE revenue_events
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- Add confidence_tier column if not exists (1=low, 2=medium, 3=high)
-- Default to 3 (high confidence) for existing records
ALTER TABLE revenue_events
ADD COLUMN IF NOT EXISTS confidence_tier INTEGER DEFAULT 3;

-- Add cost_method column if not exists (independent vs estimated)
ALTER TABLE revenue_events
ADD COLUMN IF NOT EXISTS cost_method TEXT DEFAULT 'independent';

-- Create index on source for common queries
CREATE INDEX IF NOT EXISTS idx_revenue_events_source
ON revenue_events(org_id, source);

-- Create index on source + finault_customer_id for unmatched queries
CREATE INDEX IF NOT EXISTS idx_revenue_events_source_customer
ON revenue_events(org_id, source, finault_customer_id);

-- Create index on confidence_tier for filtering low-confidence data
CREATE INDEX IF NOT EXISTS idx_revenue_events_confidence
ON revenue_events(org_id, confidence_tier);

COMMIT;
