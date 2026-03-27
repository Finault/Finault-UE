-- Migration 031: Revenue fields + Dark Debt Scanner columns
-- Adds revenue tracking, margin calculation, and dark debt scoring to seals table

-- Revenue fields (Build 3)
ALTER TABLE seals ADD COLUMN IF NOT EXISTS revenue_usd NUMERIC(12,6);
ALTER TABLE seals ADD COLUMN IF NOT EXISTS margin_usd NUMERIC(12,6);
ALTER TABLE seals ADD COLUMN IF NOT EXISTS margin_pct NUMERIC(8,4);
ALTER TABLE seals ADD COLUMN IF NOT EXISTS customer_id TEXT;

-- Dark Debt Scanner fields (Build 7)
ALTER TABLE seals ADD COLUMN IF NOT EXISTS dark_debt_score INTEGER DEFAULT 0;
ALTER TABLE seals ADD COLUMN IF NOT EXISTS dark_debt_risks JSONB;

-- Indexes for revenue queries
CREATE INDEX IF NOT EXISTS idx_seals_customer_id ON seals(customer_id);
CREATE INDEX IF NOT EXISTS idx_seals_margin_pct ON seals(margin_pct);
CREATE INDEX IF NOT EXISTS idx_seals_revenue_usd ON seals(revenue_usd) WHERE revenue_usd IS NOT NULL;

-- Index for dark debt queries
CREATE INDEX IF NOT EXISTS idx_seals_dark_debt ON seals(dark_debt_score) WHERE dark_debt_score > 0;
