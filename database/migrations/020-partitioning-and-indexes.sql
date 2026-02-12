-- ═══════════════════════════════════════════════════════════════════════════════
-- FINAULT DATABASE PARTITIONING & INDEX HARDENING
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Gap #12: Database Indexing and Query Performance — P0 (Before Any Customer)
--
-- Problem: gateway_logs and audit_trail grow unbounded with no partitioning.
-- At enterprise scale (1M+ requests/month), queries on these tables degrade
-- from single-digit ms to multi-second scans. The schema has a commented-out
-- partitioning call that was never executed.
--
-- This migration:
-- 1. Creates a generic monthly partition helper function
-- 2. Converts gateway_logs to range-partitioned by created_at
-- 3. Converts audit_trail to range-partitioned by created_at
-- 4. Creates initial partitions for 2025-01 through 2027-12 (36 months)
-- 5. Adds composite indexes optimized for common query patterns
-- 6. Adds a partition maintenance function for auto-creating future partitions
--
-- SAFETY: All operations are idempotent (IF NOT EXISTS) and non-destructive.
-- NOTE: Partitioned table column definitions match schema.sql exactly so that
--       SELECT * data migration works without column mismatch errors.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Monthly Partition Helper Function ────────────────────────────────────

CREATE OR REPLACE FUNCTION create_monthly_partitions(
    parent_table TEXT,
    start_date DATE,
    end_date DATE
) RETURNS INTEGER AS $$
DECLARE
    current_date_var DATE := start_date;
    partition_name TEXT;
    partitions_created INTEGER := 0;
BEGIN
    WHILE current_date_var < end_date LOOP
        partition_name := parent_table || '_y' || to_char(current_date_var, 'YYYY') || '_m' || to_char(current_date_var, 'MM');

        -- Check if partition already exists
        IF NOT EXISTS (
            SELECT 1 FROM pg_class WHERE relname = partition_name
        ) THEN
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
                partition_name,
                parent_table,
                current_date_var,
                current_date_var + INTERVAL '1 month'
            );
            partitions_created := partitions_created + 1;
        END IF;

        current_date_var := current_date_var + INTERVAL '1 month';
    END LOOP;

    RETURN partitions_created;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_monthly_partitions IS 'Creates monthly partitions for a given table between start and end dates';

-- ─── 2. Convert gateway_logs to Partitioned Table ────────────────────────────
-- NOTE: PostgreSQL cannot add partitioning to an existing table in-place.
-- Strategy: Rename old table, create new partitioned table, migrate data, drop old.

DO $$
BEGIN
    -- Only proceed if gateway_logs is NOT already partitioned
    IF NOT EXISTS (
        SELECT 1 FROM pg_partitioned_table pt
        JOIN pg_class c ON c.oid = pt.partrelid
        WHERE c.relname = 'gateway_logs'
    ) THEN
        -- Step 1: Rename existing table
        IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'gateway_logs') THEN
            ALTER TABLE gateway_logs RENAME TO gateway_logs_old;

            -- Drop old indexes (they reference the old table name)
            DROP INDEX IF EXISTS idx_gateway_logs_organization_id;
            DROP INDEX IF EXISTS idx_gateway_logs_user_id;
            DROP INDEX IF EXISTS idx_gateway_logs_request_id;
            DROP INDEX IF EXISTS idx_gateway_logs_status_code;
            DROP INDEX IF EXISTS idx_gateway_logs_created_at;
            DROP INDEX IF EXISTS idx_gateway_logs_endpoint;
            DROP INDEX IF EXISTS idx_gateway_logs_org_created;
        END IF;

        -- Step 2: Create new partitioned table (matches schema.sql columns exactly)
        CREATE TABLE gateway_logs (
            id BIGSERIAL,
            organization_id UUID NOT NULL,
            request_id TEXT NOT NULL,
            method TEXT NOT NULL,
            endpoint TEXT NOT NULL,
            user_id UUID,
            api_key_id UUID,
            status_code INTEGER NOT NULL,
            response_time_ms INTEGER,
            request_size_bytes INTEGER,
            response_size_bytes INTEGER,
            error_message TEXT,
            error_stack_trace TEXT,
            rate_limit_remaining INTEGER,
            rate_limit_reset_at TIMESTAMP WITH TIME ZONE,
            metadata JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            PRIMARY KEY (id, created_at),
            CONSTRAINT valid_status_code_part CHECK (status_code >= 100 AND status_code < 600),
            CONSTRAINT valid_response_time_part CHECK (response_time_ms >= 0)
        ) PARTITION BY RANGE (created_at);

        -- Step 3: Create partitions (Jan 2025 → Dec 2027)
        PERFORM create_monthly_partitions('gateway_logs', '2025-01-01'::date, '2028-01-01'::date);

        -- Step 4: Migrate data from old table (explicit column list for safety)
        IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'gateway_logs_old') THEN
            INSERT INTO gateway_logs (
                id, organization_id, request_id, method, endpoint, user_id,
                api_key_id, status_code, response_time_ms, request_size_bytes,
                response_size_bytes, error_message, error_stack_trace,
                rate_limit_remaining, rate_limit_reset_at, metadata, created_at
            )
            SELECT
                id, organization_id, request_id, method, endpoint, user_id,
                api_key_id, status_code, response_time_ms, request_size_bytes,
                response_size_bytes, error_message, error_stack_trace,
                rate_limit_remaining, rate_limit_reset_at, metadata, created_at
            FROM gateway_logs_old;
            DROP TABLE gateway_logs_old;
        END IF;

        -- Step 5: Re-create indexes on partitioned table
        CREATE INDEX idx_gateway_logs_org_created ON gateway_logs(organization_id, created_at DESC);
        CREATE INDEX idx_gateway_logs_user_created ON gateway_logs(user_id, created_at DESC);
        CREATE INDEX idx_gateway_logs_request_id ON gateway_logs(request_id);
        CREATE INDEX idx_gateway_logs_status_code ON gateway_logs(status_code) WHERE status_code >= 400;
        CREATE INDEX idx_gateway_logs_created_at ON gateway_logs(created_at DESC);
        CREATE INDEX idx_gateway_logs_endpoint ON gateway_logs(endpoint);

        -- Step 6: Re-enable RLS (policies will be re-applied by rls-policies.sql)
        ALTER TABLE gateway_logs ENABLE ROW LEVEL SECURITY;

        RAISE NOTICE 'gateway_logs converted to partitioned table (monthly by created_at)';
    ELSE
        RAISE NOTICE 'gateway_logs is already partitioned — skipping';
    END IF;
END $$;

-- ─── 3. Convert audit_trail to Partitioned Table ─────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_partitioned_table pt
        JOIN pg_class c ON c.oid = pt.partrelid
        WHERE c.relname = 'audit_trail'
    ) THEN
        IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'audit_trail') THEN
            ALTER TABLE audit_trail RENAME TO audit_trail_old;

            DROP INDEX IF EXISTS idx_audit_trail_organization_id;
            DROP INDEX IF EXISTS idx_audit_trail_user_id;
            DROP INDEX IF EXISTS idx_audit_trail_action;
            DROP INDEX IF EXISTS idx_audit_trail_resource_type;
            DROP INDEX IF EXISTS idx_audit_trail_created_at;
            DROP INDEX IF EXISTS idx_audit_trail_resource;
        END IF;

        -- Matches schema.sql column definitions exactly
        -- (resource_id is TEXT NOT NULL, not UUID; includes api_key_id, previous_values, etc.)
        CREATE TABLE audit_trail (
            id BIGSERIAL,
            organization_id UUID NOT NULL,
            user_id UUID,
            api_key_id UUID,
            action audit_action NOT NULL,
            resource_type TEXT NOT NULL,
            resource_id TEXT NOT NULL,
            changes JSONB,
            previous_values JSONB,
            new_values JSONB,
            ip_address INET,
            user_agent TEXT,
            request_id TEXT,
            metadata JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            PRIMARY KEY (id, created_at),
            CONSTRAINT valid_action_part CHECK (action IN ('create', 'update', 'delete', 'export', 'access'))
        ) PARTITION BY RANGE (created_at);

        PERFORM create_monthly_partitions('audit_trail', '2025-01-01'::date, '2028-01-01'::date);

        -- Migrate data with explicit column list
        IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'audit_trail_old') THEN
            INSERT INTO audit_trail (
                id, organization_id, user_id, api_key_id, action, resource_type,
                resource_id, changes, previous_values, new_values, ip_address,
                user_agent, request_id, metadata, created_at
            )
            SELECT
                id, organization_id, user_id, api_key_id, action, resource_type,
                resource_id, changes, previous_values, new_values, ip_address,
                user_agent, request_id, metadata, created_at
            FROM audit_trail_old;
            DROP TABLE audit_trail_old;
        END IF;

        CREATE INDEX idx_audit_trail_org_created ON audit_trail(organization_id, created_at DESC);
        CREATE INDEX idx_audit_trail_user_id ON audit_trail(user_id);
        CREATE INDEX idx_audit_trail_action ON audit_trail(action);
        CREATE INDEX idx_audit_trail_resource ON audit_trail(resource_type, resource_id);
        CREATE INDEX idx_audit_trail_created_at ON audit_trail(created_at DESC);
        -- Composite index for compliance queries: "show all changes to invoices in org X"
        CREATE INDEX idx_audit_trail_org_resource ON audit_trail(organization_id, resource_type, created_at DESC);

        -- Re-enable RLS (policies will be re-applied by rls-policies.sql)
        ALTER TABLE audit_trail ENABLE ROW LEVEL SECURITY;

        RAISE NOTICE 'audit_trail converted to partitioned table (monthly by created_at)';
    ELSE
        RAISE NOTICE 'audit_trail is already partitioned — skipping';
    END IF;
END $$;

-- ─── 4. Additional Performance Indexes ───────────────────────────────────────

-- Invoices: Composite for common dashboard query (org + status + date)
CREATE INDEX IF NOT EXISTS idx_invoices_org_status_date
    ON invoices(organization_id, status, created_at DESC);

-- Invoices: Pending payment lookup
CREATE INDEX IF NOT EXISTS idx_invoices_payment_pending
    ON invoices(organization_id, payment_status)
    WHERE payment_status != 'paid';

-- Anomalies: Active (unresolved) anomalies per org
CREATE INDEX IF NOT EXISTS idx_anomalies_active
    ON anomalies(organization_id, severity DESC, created_at DESC)
    WHERE is_resolved = false;

-- Budgets: Active budgets per org
CREATE INDEX IF NOT EXISTS idx_budgets_org_active
    ON budgets(organization_id, fiscal_year)
    WHERE status = 'active';

-- Close packs: Audit-ready packs
CREATE INDEX IF NOT EXISTS idx_close_packs_audit_ready
    ON close_packs(organization_id, status, period_start DESC);

-- Savings recommendations: Pending review
CREATE INDEX IF NOT EXISTS idx_savings_pending
    ON savings_recommendations(organization_id, created_at DESC)
    WHERE status = 'pending';

-- ─── 5. Auto-Partition Maintenance Function ──────────────────────────────────
-- Run monthly via pg_cron to ensure partitions exist 3 months ahead

CREATE OR REPLACE FUNCTION maintain_partitions() RETURNS void AS $$
DECLARE
    target_date DATE := (CURRENT_DATE + INTERVAL '3 months')::date;
    tables TEXT[] := ARRAY['gateway_logs', 'audit_trail'];
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        PERFORM create_monthly_partitions(tbl, date_trunc('month', CURRENT_DATE)::date, target_date);
    END LOOP;

    RAISE NOTICE 'Partition maintenance complete — partitions exist through %', target_date;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION maintain_partitions IS 'Creates partitions 3 months ahead for all partitioned tables. Run monthly via pg_cron.';

-- Schedule: SELECT cron.schedule('maintain_partitions', '0 2 1 * *', 'SELECT maintain_partitions()');

-- ─── 6. Partition Statistics View ────────────────────────────────────────────

CREATE OR REPLACE VIEW partition_stats AS
SELECT
    nmsp_parent.nspname AS parent_schema,
    parent.relname AS parent_table,
    child.relname AS partition_name,
    pg_size_pretty(pg_relation_size(child.oid)) AS partition_size,
    pg_stat_get_live_tuples(child.oid) AS live_rows,
    pg_stat_get_dead_tuples(child.oid) AS dead_rows
FROM pg_inherits
JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
JOIN pg_class child ON pg_inherits.inhrelid = child.oid
JOIN pg_namespace nmsp_parent ON parent.relnamespace = nmsp_parent.oid
WHERE nmsp_parent.nspname = 'public'
ORDER BY parent.relname, child.relname;

COMMENT ON VIEW partition_stats IS 'Shows size and row counts for all partitioned tables';
