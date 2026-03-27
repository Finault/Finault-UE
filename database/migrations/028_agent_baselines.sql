-- ============================================================
-- 028: Agent Behavioral Baselines + Sessions + Network Benchmarks
-- Intelligence Engine Sprints 2-5
-- NUCLEAR DEFENSIVE: every single statement wrapped
-- ============================================================

-- Step 1: Sessions table
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    agent_id TEXT,
    cost_center TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    call_count INTEGER NOT NULL DEFAULT 1,
    total_cost NUMERIC(12,6) NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    terminated_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'sessions table: %', SQLERRM;
END $$;

-- Step 1b: Add agent_id to sessions if missing (from partial prior run)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='agent_id') THEN
    ALTER TABLE sessions ADD COLUMN agent_id TEXT;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'sessions.agent_id add: %', SQLERRM;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='cost_center') THEN
    ALTER TABLE sessions ADD COLUMN cost_center TEXT;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'sessions.cost_center add: %', SQLERRM;
END $$;

-- Step 1c: Indexes (each wrapped)
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions (agent_id, started_at DESC);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'idx_sessions_agent: %', SQLERRM;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_sessions_cost_center ON sessions (cost_center, started_at DESC);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'idx_sessions_cost_center: %', SQLERRM;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions (status) WHERE status = 'active';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'idx_sessions_active: %', SQLERRM;
END $$;

-- Step 2: Agent baselines table
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS agent_baselines (
    agent_id TEXT PRIMARY KEY,
    baseline_period_start TIMESTAMPTZ,
    baseline_period_end TIMESTAMPTZ,
    avg_calls_per_day NUMERIC(10,2),
    avg_cost_per_call NUMERIC(10,6),
    avg_cost_per_day NUMERIC(12,2),
    avg_tokens_per_call INTEGER,
    avg_session_duration_seconds INTEGER,
    avg_session_cost NUMERIC(10,4),
    avg_error_rate NUMERIC(5,4),
    common_models JSONB,
    common_tools JSONB,
    typical_hour_distribution JSONB,
    stddev_cost_per_call NUMERIC(10,6),
    stddev_calls_per_day NUMERIC(10,2),
    confidence_level NUMERIC(5,4),
    data_points INTEGER,
    last_computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'learning',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'agent_baselines table: %', SQLERRM;
END $$;

-- Step 3: Network benchmarks table
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS network_benchmarks (
    id SERIAL PRIMARY KEY,
    period DATE NOT NULL,
    metric_name TEXT NOT NULL,
    segment TEXT DEFAULT 'all',
    p25 NUMERIC(12,6),
    p50 NUMERIC(12,6),
    p75 NUMERIC(12,6),
    p90 NUMERIC(12,6),
    sample_size INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(period, metric_name, segment)
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'network_benchmarks table: %', SQLERRM;
END $$;

-- Step 4: Finault ROI view (uses EXECUTE to defer column validation)
DO $$ BEGIN
  EXECUTE '
    CREATE OR REPLACE VIEW finault_roi AS
    SELECT
      seals.org_id,
      SUM(CASE WHEN seals.custom->>''enforcement_action'' = ''model_rerouted'' THEN COALESCE((seals.custom->>''estimated_savings'')::NUMERIC, 0) ELSE 0 END) as reroute_savings,
      SUM(CASE WHEN seals.custom->>''enforcement_action'' = ''retry_loop_terminated'' THEN COALESCE(seals.cost_usd, 0) ELSE 0 END) as loop_savings,
      SUM(CASE WHEN seals.custom->>''enforcement_action'' IN (''budget_block'', ''session_cost_limit'') THEN COALESCE(seals.cost_usd, 0) ELSE 0 END) as block_savings,
      COUNT(CASE WHEN seals.custom->>''enforcement_action'' IS NOT NULL THEN 1 END) as total_interventions
    FROM seals
    WHERE seals.custom->>''enforcement_action'' IS NOT NULL
    GROUP BY seals.org_id
  ';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'finault_roi view: %', SQLERRM;
END $$;

-- Step 5: Agent performance view (uses EXECUTE to defer column validation)
DO $$ BEGIN
  EXECUTE '
    CREATE OR REPLACE VIEW agent_performance AS
    SELECT
      agents.agent_id,
      agents.genesis_seal_id,
      agents.first_seen as imprint_date,
      agents.total_seals,
      agents.total_cost,
      CASE WHEN agents.total_seals > 0 THEN agents.total_cost / agents.total_seals ELSE 0 END as avg_cost_per_seal,
      agent_baselines.status as baseline_status,
      agent_baselines.confidence_level,
      agent_baselines.avg_cost_per_call,
      agent_baselines.stddev_cost_per_call,
      agent_baselines.avg_calls_per_day,
      agent_baselines.avg_error_rate,
      agent_baselines.data_points
    FROM agents
    LEFT JOIN agent_baselines ON agent_baselines.agent_id = agents.agent_id
  ';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'agent_performance view: %', SQLERRM;
END $$;

-- Step 6: Compute baselines function (uses EXECUTE for ALL queries to avoid compile-time validation)
DO $$ BEGIN
  DROP FUNCTION IF EXISTS compute_agent_baselines();
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  CREATE FUNCTION compute_agent_baselines()
  RETURNS INTEGER AS $fn$
  DECLARE
    updated_count INTEGER := 0;
    has_agent_id BOOLEAN := false;
  BEGIN
    -- Runtime check: does seals table have agent_id?
    SELECT EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'seals' AND column_name = 'agent_id'
    ) INTO has_agent_id;

    IF NOT has_agent_id THEN
      RAISE NOTICE 'seals table missing agent_id, skipping';
      RETURN 0;
    END IF;

    -- Use EXECUTE so column references are checked at runtime, not creation time
    EXECUTE '
      INSERT INTO agent_baselines (
        agent_id, baseline_period_start, baseline_period_end,
        avg_cost_per_call, stddev_cost_per_call, avg_calls_per_day,
        data_points, confidence_level, status, last_computed_at
      )
      SELECT
        seals.agent_id,
        MIN(seals.timestamp),
        MAX(seals.timestamp),
        AVG(CASE WHEN seals.cost_usd > 0 THEN seals.cost_usd ELSE NULL END),
        STDDEV(CASE WHEN seals.cost_usd > 0 THEN seals.cost_usd ELSE NULL END),
        COUNT(*) / GREATEST(EXTRACT(EPOCH FROM (MAX(seals.timestamp) - MIN(seals.timestamp))) / 86400, 1),
        COUNT(*),
        LEAST(COUNT(*) / 1000.0, 1.0),
        CASE WHEN COUNT(*) >= 100 THEN ''active'' ELSE ''learning'' END,
        NOW()
      FROM seals
      WHERE seals.agent_id IS NOT NULL
        AND seals.timestamp > NOW() - INTERVAL ''30 days''
      GROUP BY seals.agent_id
      HAVING COUNT(*) >= 10
      ON CONFLICT (agent_id) DO UPDATE SET
        baseline_period_start = EXCLUDED.baseline_period_start,
        baseline_period_end = EXCLUDED.baseline_period_end,
        avg_cost_per_call = EXCLUDED.avg_cost_per_call,
        stddev_cost_per_call = EXCLUDED.stddev_cost_per_call,
        avg_calls_per_day = EXCLUDED.avg_calls_per_day,
        data_points = EXCLUDED.data_points,
        confidence_level = EXCLUDED.confidence_level,
        status = EXCLUDED.status,
        last_computed_at = NOW()
    ';

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
  END;
  $fn$ LANGUAGE plpgsql SECURITY DEFINER;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'compute_agent_baselines function: %', SQLERRM;
END $$;

-- Step 7: Grants (each individually wrapped)
DO $$ BEGIN GRANT SELECT ON agent_baselines TO anon, authenticated; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT INSERT, UPDATE ON agent_baselines TO service_role; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON network_benchmarks TO anon, authenticated; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT INSERT, UPDATE ON network_benchmarks TO service_role; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON sessions TO anon, authenticated; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT INSERT, UPDATE ON sessions TO service_role; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION compute_agent_baselines TO service_role; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON finault_roi TO anon, authenticated; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON agent_performance TO anon, authenticated; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Done! All statements are individually fail-safe.
-- Check Supabase logs for any NOTICE messages about skipped steps.
