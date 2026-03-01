-- ═══════════════════════════════════════════════════════════════════════════════
-- Revenue Management Table
-- ═══════════════════════════════════════════════════════════════════════════════
-- Stores revenue/pricing data for unit economics calculations
-- Integrates with usage_logs (cost-to-serve) for margin analysis

CREATE TABLE IF NOT EXISTS revenue_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period DATE NOT NULL,
  cost_center TEXT,
  revenue_amount DECIMAL(12,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one revenue entry per org/period/cost_center combination
  UNIQUE(org_id, period, cost_center)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Indexes for common queries
-- ═══════════════════════════════════════════════════════════════════════════════

-- Fast lookup by org and period (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_revenue_entries_org_period
  ON revenue_entries(org_id, period);

-- For cost_center filtering in unit economics
CREATE INDEX IF NOT EXISTS idx_revenue_entries_cost_center
  ON revenue_entries(org_id, cost_center);

-- For time-range queries (e.g., last 12 months)
CREATE INDEX IF NOT EXISTS idx_revenue_entries_created_at
  ON revenue_entries(org_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS Policies (Row Level Security)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE revenue_entries ENABLE ROW LEVEL SECURITY;

-- Organizations can only see their own revenue entries
CREATE POLICY "Users can view their org's revenue entries" ON revenue_entries
  FOR SELECT USING (
    org_id IN (
      SELECT organization_id FROM memberships
      WHERE user_id = auth.uid()
    )
  );

-- Organizations can insert their own revenue entries
CREATE POLICY "Users can insert revenue entries for their org" ON revenue_entries
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT organization_id FROM memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'owner')
    )
  );

-- Organizations can update their own revenue entries
CREATE POLICY "Users can update revenue entries for their org" ON revenue_entries
  FOR UPDATE USING (
    org_id IN (
      SELECT organization_id FROM memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'owner')
    )
  );

-- Organizations can delete their own revenue entries
CREATE POLICY "Users can delete revenue entries for their org" ON revenue_entries
  FOR DELETE USING (
    org_id IN (
      SELECT organization_id FROM memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'owner')
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- Update trigger: automatically set updated_at timestamp
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_revenue_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER revenue_entries_update_timestamp
  BEFORE UPDATE ON revenue_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_revenue_entries_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════
-- Helper view: Monthly revenue summary aggregated by org and cost center
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW revenue_summary AS
SELECT
  org_id,
  DATE_TRUNC('month', period)::DATE as month,
  cost_center,
  SUM(revenue_amount) as total_revenue,
  COUNT(*) as entry_count,
  AVG(revenue_amount) as avg_revenue,
  MIN(created_at) as first_entry,
  MAX(updated_at) as last_updated
FROM revenue_entries
GROUP BY org_id, DATE_TRUNC('month', period), cost_center;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Grant permissions to service role
-- ═══════════════════════════════════════════════════════════════════════════════

GRANT ALL ON revenue_entries TO authenticated;
GRANT ALL ON revenue_entries TO service_role;
GRANT SELECT ON revenue_summary TO authenticated;
GRANT SELECT ON revenue_summary TO service_role;
