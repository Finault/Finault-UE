-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  MIGRATION 026 — FINAULT SEAL                                  ║
-- ║  Cryptographic receipt layer for every AI decision              ║
-- ║  Tables: seals, seal_chains, seal_anchors                      ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════
-- 1. SEALS — Core seal storage (one row per AI decision receipt)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS seals (
    -- Identity — WHO
    seal_id         TEXT PRIMARY KEY,
    org_id          TEXT NOT NULL DEFAULT '',
    agent_id        TEXT NOT NULL,
    principal_id    TEXT DEFAULT '',

    -- Decision — WHAT + WHY
    action          TEXT NOT NULL,
    input_hash      TEXT NOT NULL,
    model           TEXT DEFAULT '',
    model_version   TEXT DEFAULT '',
    reasoning       TEXT DEFAULT '',
    alternatives    JSONB DEFAULT '[]'::jsonb,
    confidence      REAL DEFAULT -1,

    -- Context — WHERE + HOW
    protocol        TEXT DEFAULT 'REST',
    provider        TEXT DEFAULT '',
    session_id      TEXT DEFAULT '',
    parent_seal_id  TEXT DEFAULT '',

    -- Outcome — WHAT HAPPENED
    outcome         JSONB DEFAULT '{}'::jsonb,
    outcome_hash    TEXT NOT NULL,
    cost_usd        REAL DEFAULT -1,
    tokens_used     INTEGER DEFAULT -1,
    latency_ms      REAL DEFAULT -1,

    -- Integrity — PROOF
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sequence        BIGINT NOT NULL,
    prev_hash       TEXT NOT NULL,
    seal_hash       TEXT NOT NULL,
    signature       TEXT NOT NULL,
    blockchain_anchor TEXT DEFAULT '',

    -- Metadata
    seal_version    TEXT DEFAULT '1.0.0',
    tags            TEXT[] DEFAULT '{}',
    custom          JSONB DEFAULT '{}'::jsonb,

    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_seals_org
    ON seals(org_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_seals_agent
    ON seals(org_id, agent_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_seals_action
    ON seals(org_id, action);

CREATE INDEX IF NOT EXISTS idx_seals_session
    ON seals(session_id) WHERE session_id != '';

CREATE INDEX IF NOT EXISTS idx_seals_parent
    ON seals(parent_seal_id) WHERE parent_seal_id != '';

CREATE INDEX IF NOT EXISTS idx_seals_tags
    ON seals USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_seals_chain
    ON seals(org_id, sequence);

CREATE INDEX IF NOT EXISTS idx_seals_hash
    ON seals(seal_hash);

CREATE INDEX IF NOT EXISTS idx_seals_provider
    ON seals(provider, timestamp DESC) WHERE provider != '';

CREATE INDEX IF NOT EXISTS idx_seals_model
    ON seals(model, timestamp DESC) WHERE model != '';


-- ═══════════════════════════════════════════════════════════════════
-- 2. SEAL_CHAINS — Chain integrity tracking per org
--    One row per organisation, tracks the chain head for fast appends.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS seal_chains (
    org_id              TEXT PRIMARY KEY,
    last_seal_id        TEXT NOT NULL,
    last_seal_hash      TEXT NOT NULL,
    last_sequence       BIGINT NOT NULL DEFAULT 0,
    total_seals         BIGINT NOT NULL DEFAULT 0,
    total_cost_usd      REAL NOT NULL DEFAULT 0,
    chain_created_at    TIMESTAMPTZ DEFAULT NOW(),
    chain_verified_at   TIMESTAMPTZ,
    chain_valid         BOOLEAN DEFAULT TRUE
);


-- ═══════════════════════════════════════════════════════════════════
-- 3. SEAL_ANCHORS — Blockchain anchor batches
--    Merkle roots of seal batches anchored to public blockchains.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS seal_anchors (
    anchor_id       TEXT PRIMARY KEY,
    org_id          TEXT NOT NULL DEFAULT '',
    merkle_root     TEXT NOT NULL,
    seal_count      INTEGER NOT NULL DEFAULT 0,
    seal_ids        TEXT[] NOT NULL DEFAULT '{}',
    first_sequence  BIGINT NOT NULL,
    last_sequence   BIGINT NOT NULL,
    blockchain      TEXT NOT NULL DEFAULT 'base',   -- base | ethereum | bitcoin | solana
    tx_hash         TEXT DEFAULT '',                 -- Filled when anchor tx confirms
    tx_status       TEXT DEFAULT 'pending',          -- pending | confirmed | failed
    anchored_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anchors_org
    ON seal_anchors(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_anchors_status
    ON seal_anchors(tx_status) WHERE tx_status = 'pending';


-- ═══════════════════════════════════════════════════════════════════
-- 4. ROW-LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE seals ENABLE ROW LEVEL SECURITY;
ALTER TABLE seal_chains ENABLE ROW LEVEL SECURITY;
ALTER TABLE seal_anchors ENABLE ROW LEVEL SECURITY;

-- Seals: users can read seals belonging to their org
CREATE POLICY seals_read_own ON seals
    FOR SELECT USING (
        org_id IN (
            SELECT org_id FROM user_organizations
            WHERE user_id = auth.uid()
        )
        OR org_id = ''  -- allow anonymous/unattached seals for public verify
    );

-- Seals: insert via service role or authenticated users
CREATE POLICY seals_insert ON seals
    FOR INSERT WITH CHECK (true);

-- Seal chains: read own org
CREATE POLICY chains_read_own ON seal_chains
    FOR SELECT USING (true);

-- Seal chains: update via service role
CREATE POLICY chains_upsert ON seal_chains
    FOR ALL USING (true) WITH CHECK (true);

-- Anchors: read all (public for verification)
CREATE POLICY anchors_read ON seal_anchors
    FOR SELECT USING (true);

CREATE POLICY anchors_insert ON seal_anchors
    FOR INSERT WITH CHECK (true);


-- ═══════════════════════════════════════════════════════════════════
-- 5. HELPER FUNCTION — Atomic seal append with chain update
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION append_seal(seal_data JSONB)
RETURNS JSONB AS $$
DECLARE
    v_org_id TEXT;
    v_seal_id TEXT;
    v_seal_hash TEXT;
    v_sequence BIGINT;
    v_cost REAL;
BEGIN
    v_org_id := seal_data->>'org_id';
    v_seal_id := seal_data->>'seal_id';
    v_seal_hash := seal_data->>'seal_hash';
    v_sequence := (seal_data->>'sequence')::BIGINT;
    v_cost := COALESCE((seal_data->>'cost_usd')::REAL, -1);

    -- Insert the seal
    INSERT INTO seals (
        seal_id, org_id, agent_id, principal_id,
        action, input_hash, model, model_version, reasoning, alternatives, confidence,
        protocol, provider, session_id, parent_seal_id,
        outcome, outcome_hash, cost_usd, tokens_used, latency_ms,
        timestamp, sequence, prev_hash, seal_hash, signature, blockchain_anchor,
        seal_version, tags, custom
    ) VALUES (
        v_seal_id,
        v_org_id,
        seal_data->>'agent_id',
        COALESCE(seal_data->>'principal_id', ''),
        seal_data->>'action',
        seal_data->>'input_hash',
        COALESCE(seal_data->>'model', ''),
        COALESCE(seal_data->>'model_version', ''),
        COALESCE(seal_data->>'reasoning', ''),
        COALESCE(seal_data->'alternatives', '[]'::jsonb),
        COALESCE((seal_data->>'confidence')::REAL, -1),
        COALESCE(seal_data->>'protocol', 'REST'),
        COALESCE(seal_data->>'provider', ''),
        COALESCE(seal_data->>'session_id', ''),
        COALESCE(seal_data->>'parent_seal_id', ''),
        COALESCE(seal_data->'outcome', '{}'::jsonb),
        seal_data->>'outcome_hash',
        v_cost,
        COALESCE((seal_data->>'tokens_used')::INTEGER, -1),
        COALESCE((seal_data->>'latency_ms')::REAL, -1),
        COALESCE((seal_data->>'timestamp')::TIMESTAMPTZ, NOW()),
        v_sequence,
        seal_data->>'prev_hash',
        v_seal_hash,
        seal_data->>'signature',
        COALESCE(seal_data->>'blockchain_anchor', ''),
        COALESCE(seal_data->>'seal_version', '1.0.0'),
        COALESCE(ARRAY(SELECT jsonb_array_elements_text(seal_data->'tags')), '{}'),
        COALESCE(seal_data->'custom', '{}'::jsonb)
    );

    -- Upsert the chain head
    INSERT INTO seal_chains (org_id, last_seal_id, last_seal_hash, last_sequence, total_seals, total_cost_usd)
    VALUES (v_org_id, v_seal_id, v_seal_hash, v_sequence, 1, GREATEST(v_cost, 0))
    ON CONFLICT (org_id) DO UPDATE SET
        last_seal_id = v_seal_id,
        last_seal_hash = v_seal_hash,
        last_sequence = v_sequence,
        total_seals = seal_chains.total_seals + 1,
        total_cost_usd = seal_chains.total_cost_usd + GREATEST(v_cost, 0);

    RETURN jsonb_build_object(
        'seal_id', v_seal_id,
        'sequence', v_sequence,
        'seal_hash', v_seal_hash
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
