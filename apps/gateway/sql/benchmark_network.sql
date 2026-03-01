-- Finault: Anonymized Benchmark Network
-- The data flywheel — aggregated, anonymized cost/margin data across all orgs

CREATE TABLE IF NOT EXISTS anonymized_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period TEXT NOT NULL,
  vertical TEXT,
  company_size TEXT CHECK (company_size IN ('startup', 'growth', 'scale', 'enterprise')),
  metric_name TEXT NOT NULL,
  metric_value DECIMAL(15,4),
  sample_count INTEGER DEFAULT 0,
  percentile_25 DECIMAL(15,4),
  percentile_50 DECIMAL(15,4),
  percentile_75 DECIMAL(15,4),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(period, vertical, company_size, metric_name)
);

CREATE INDEX IF NOT EXISTS idx_benchmarks_period ON anonymized_benchmarks(period);
CREATE INDEX IF NOT EXISTS idx_benchmarks_vertical ON anonymized_benchmarks(vertical, period);

-- No RLS needed — this is anonymized aggregate data
-- But restrict write access
ALTER TABLE anonymized_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY benchmarks_select ON anonymized_benchmarks FOR SELECT USING (true);
CREATE POLICY benchmarks_insert ON anonymized_benchmarks FOR INSERT WITH CHECK (true);

-- Org profile for benchmark matching
CREATE TABLE IF NOT EXISTS org_benchmark_profiles (
  org_id UUID PRIMARY KEY,
  vertical TEXT,
  company_size TEXT,
  opt_in_benchmarks BOOLEAN DEFAULT true,
  badge_eligible BOOLEAN DEFAULT false,
  badge_tier TEXT CHECK (badge_tier IN ('shooting_star', 'rising', 'standard')),
  badge_earned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE org_benchmark_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_profiles_all ON org_benchmark_profiles FOR ALL USING (true);
