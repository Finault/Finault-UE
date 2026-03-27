-- ═══════════════════════════════════════════════════════════════════════════════
-- Merkle Tree & Seal System Tables
-- ═══════════════════════════════════════════════════════════════════════════════
-- RFC 6962 compliant Merkle tree implementation for cryptographic sealing
-- Supports inclusion proofs, consistency proofs, and verifiable tree heads

-- ═══════════════════════════════════════════════════════════════════════════════
-- MERKLE TREES TABLE (parent table for tree identity)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS merkle_trees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'default',
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_merkle_trees_org ON merkle_trees(org_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- MERKLE NODES TABLE
-- ═══════════════════════════════════════════════════════════════════════════════
-- Note: "index" is a reserved word in PostgreSQL, quoted as "index"

CREATE TABLE IF NOT EXISTS merkle_nodes (
  tree_id UUID NOT NULL,
  level INTEGER NOT NULL,
  "index" BIGINT NOT NULL,
  hash TEXT NOT NULL CHECK (hash ~ '^sha256:[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (tree_id, level, "index"),
  FOREIGN KEY (tree_id) REFERENCES merkle_trees(id) ON DELETE CASCADE
);

-- Index for fast sibling lookups during proof generation
CREATE INDEX IF NOT EXISTS idx_merkle_nodes_level_index
  ON merkle_nodes(tree_id, level, "index");

-- Index for right-edge updates during tree growth
CREATE INDEX IF NOT EXISTS idx_merkle_nodes_level_desc
  ON merkle_nodes(tree_id, level DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TREE HEADS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tree_heads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id UUID NOT NULL REFERENCES merkle_trees(id) ON DELETE CASCADE,
  tree_size BIGINT NOT NULL CHECK (tree_size >= 0),
  root_hash TEXT NOT NULL CHECK (root_hash ~ '^sha256:[a-f0-9]{64}$'),
  signature TEXT NOT NULL CHECK (signature ~ '^ed25519:[a-f0-9]{128}$'),
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT tree_head_consistency CHECK (timestamp <= created_at)
);

-- Index for efficient tree_size lookups (consistency proofs)
CREATE INDEX IF NOT EXISTS idx_tree_heads_tree_size
  ON tree_heads(tree_id, tree_size DESC);

-- Index for querying by timestamp
CREATE INDEX IF NOT EXISTS idx_tree_heads_timestamp
  ON tree_heads(tree_id, timestamp DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SEAL TREE INDEX TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS seal_tree_index (
  seal_id UUID NOT NULL,
  tree_id UUID NOT NULL REFERENCES merkle_trees(id) ON DELETE CASCADE,
  leaf_index BIGINT NOT NULL CHECK (leaf_index >= 0),
  leaf_hash TEXT NOT NULL CHECK (leaf_hash ~ '^sha256:[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (seal_id, tree_id)
);

-- Index for fast lookups by seal_id
CREATE INDEX IF NOT EXISTS idx_seal_tree_index_seal
  ON seal_tree_index(seal_id);

-- Index for fast lookups by tree_id (tree audits)
CREATE INDEX IF NOT EXISTS idx_seal_tree_index_tree
  ON seal_tree_index(tree_id, leaf_index);

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY LOG TABLE (Phase B: Cache Detector)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS query_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL ,
  customer_id UUID,
  query_hash TEXT NOT NULL,
  query_text TEXT,
  model TEXT NOT NULL,
  cost DECIMAL(10,6) NOT NULL CHECK (cost >= 0),
  tokens_in INTEGER NOT NULL CHECK (tokens_in >= 0),
  tokens_out INTEGER NOT NULL CHECK (tokens_out >= 0),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for cache analysis queries
CREATE INDEX IF NOT EXISTS idx_query_log_org_timestamp
  ON query_log(org_id, timestamp DESC);

-- Index for deduplication detection
CREATE INDEX IF NOT EXISTS idx_query_log_hash
  ON query_log(org_id, query_hash, timestamp DESC);

-- Index for customer-level analysis
CREATE INDEX IF NOT EXISTS idx_query_log_customer
  ON query_log(org_id, customer_id, timestamp DESC)
  WHERE customer_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- CACHE ANALYSIS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cache_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL ,
  customer_id UUID,
  query_hash TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL CHECK (occurrence_count > 0),
  first_seen TIMESTAMPTZ NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL,
  estimated_savings DECIMAL(10,6) NOT NULL CHECK (estimated_savings >= 0),
  avg_token_count INTEGER NOT NULL CHECK (avg_token_count >= 0),
  avg_cost DECIMAL(10,6) NOT NULL CHECK (avg_cost >= 0),
  analysis_timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_cache_analysis_org
  ON cache_analysis(org_id, analysis_timestamp DESC);

-- Index for customer analysis
CREATE INDEX IF NOT EXISTS idx_cache_analysis_customer
  ON cache_analysis(org_id, customer_id, estimated_savings DESC)
  WHERE customer_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROUTING RECOMMENDATIONS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS routing_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL ,
  customer_id UUID,
  api_call_count INTEGER NOT NULL CHECK (api_call_count > 0),
  current_model TEXT NOT NULL,
  recommended_model TEXT NOT NULL,
  complexity_score DECIMAL(8,2) NOT NULL CHECK (complexity_score >= 0),
  estimated_savings DECIMAL(10,6) NOT NULL CHECK (estimated_savings >= 0),
  margin_impact DECIMAL(8,4),
  recommendation_type TEXT NOT NULL CHECK (recommendation_type IN ('downgrade', 'consolidate', 'batch')),
  confidence DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  analysis_timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for routing analysis
CREATE INDEX IF NOT EXISTS idx_routing_recommendations_org
  ON routing_recommendations(org_id, analysis_timestamp DESC);

-- Index for customer recommendations
CREATE INDEX IF NOT EXISTS idx_routing_recommendations_customer
  ON routing_recommendations(org_id, customer_id, estimated_savings DESC)
  WHERE customer_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- MODEL PRICING TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS model_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  input_cost DECIMAL(12,8) NOT NULL CHECK (input_cost >= 0),
  output_cost DECIMAL(12,8) NOT NULL CHECK (output_cost >= 0),
  context_window INTEGER NOT NULL CHECK (context_window > 0),
  complexity_tier TEXT NOT NULL CHECK (complexity_tier IN ('basic', 'standard', 'advanced', 'expert')),
  last_synced TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for model lookups
CREATE INDEX IF NOT EXISTS idx_model_pricing_name
  ON model_pricing(model_name);

-- Index for provider queries
CREATE INDEX IF NOT EXISTS idx_model_pricing_provider
  ON model_pricing(provider);

-- ═══════════════════════════════════════════════════════════════════════════════
-- WEBHOOK CONFIGURATION TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS org_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL ,
  endpoint_url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  active BOOLEAN DEFAULT TRUE,
  retry_count INTEGER DEFAULT 3 CHECK (retry_count >= 0 AND retry_count <= 10),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (org_id, endpoint_url)
);

-- Index for webhook lookups
CREATE INDEX IF NOT EXISTS idx_org_webhooks_org
  ON org_webhooks(org_id, active);

-- ═══════════════════════════════════════════════════════════════════════════════
-- COST ANOMALY TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cost_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL ,
  customer_id UUID,
  anomaly_date DATE NOT NULL,
  daily_cost DECIMAL(12,2) NOT NULL CHECK (daily_cost >= 0),
  baseline_cost DECIMAL(12,2) NOT NULL CHECK (baseline_cost >= 0),
  deviation_percent DECIMAL(6,2) NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN ('spike', 'drift', 'cliff', 'normal')),
  sigma_deviation DECIMAL(8,4) NOT NULL,
  details JSONB DEFAULT '{}',
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for anomaly queries
CREATE INDEX IF NOT EXISTS idx_cost_anomalies_org
  ON cost_anomalies(org_id, anomaly_date DESC);

-- Index for customer anomalies
CREATE INDEX IF NOT EXISTS idx_cost_anomalies_customer
  ON cost_anomalies(org_id, customer_id, anomaly_date DESC)
  WHERE customer_id IS NOT NULL;

-- Index for severity (sigma deviation)
CREATE INDEX IF NOT EXISTS idx_cost_anomalies_severity
  ON cost_anomalies(org_id, sigma_deviation DESC, anomaly_date DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS) ENABLEMENT
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE merkle_trees ENABLE ROW LEVEL SECURITY;
ALTER TABLE merkle_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tree_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE seal_tree_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE cache_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE routing_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_anomalies ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS POLICIES (Simplified for Service Role)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Service role bypass: these policies allow the service role to access all data
-- In production, additional JWT-based policies would restrict per-user access

CREATE POLICY "merkle_trees_service_access" ON merkle_trees
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "merkle_nodes_service_access" ON merkle_nodes
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "tree_heads_service_access" ON tree_heads
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "seal_tree_index_service_access" ON seal_tree_index
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "query_log_service_access" ON query_log
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "cache_analysis_service_access" ON cache_analysis
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "routing_recommendations_service_access" ON routing_recommendations
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "model_pricing_service_access" ON model_pricing
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "org_webhooks_service_access" ON org_webhooks
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "cost_anomalies_service_access" ON cost_anomalies
  FOR ALL USING (TRUE) WITH CHECK (TRUE);
