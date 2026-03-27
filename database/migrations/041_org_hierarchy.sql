-- 041_org_hierarchy.sql
-- Support hierarchical org structures with parent-child relationships
-- Enables cost allocation across departments, divisions, and teams

CREATE TABLE IF NOT EXISTS org_hierarchy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  parent_id UUID REFERENCES org_hierarchy(id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  name TEXT NOT NULL,
  budget NUMERIC(12,2),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_hierarchy_org ON org_hierarchy(org_id);
CREATE INDEX IF NOT EXISTS idx_org_hierarchy_parent ON org_hierarchy(parent_id);
CREATE INDEX IF NOT EXISTS idx_org_hierarchy_level ON org_hierarchy(level);
CREATE INDEX IF NOT EXISTS idx_org_hierarchy_name ON org_hierarchy(name);
