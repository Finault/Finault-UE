-- Finault Platform - Database Functions
-- Custom functions for complex business logic
-- Last Updated: 2026-01-30

-- ============================================================================
-- SPENDING ANALYSIS FUNCTIONS
-- ============================================================================

-- Calculate total spending for a specific month and organization
CREATE OR REPLACE FUNCTION calculate_monthly_spend(
    p_organization_id UUID,
    p_year INTEGER,
    p_month INTEGER
)
RETURNS TABLE (
    total_spend DECIMAL,
    by_service JSONB,
    by_cost_center JSONB,
    by_provider JSONB,
    invoice_count INTEGER
) AS $$
-- FIX 1 (MEDIUM): Ensure proper initialization and validation
DECLARE
    v_period_start DATE;
    v_period_end DATE;
BEGIN
    v_period_start := make_date(p_year, p_month, 1);
    v_period_end := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

    RETURN QUERY
    SELECT
        COALESCE(SUM(a.allocated_amount), 0::DECIMAL),
        jsonb_object_agg(
            COALESCE(ili.service_name, 'Unknown'),
            SUM(a.allocated_amount)
        ) FILTER (WHERE ili.service_name IS NOT NULL),
        jsonb_object_agg(
            a.cost_center,
            SUM(a.allocated_amount)
        ),
        jsonb_object_agg(
            COALESCE(i.provider, 'Unknown'),
            SUM(a.allocated_amount)
        ),
        COUNT(DISTINCT i.id)::INTEGER
    FROM allocations a
    JOIN invoice_line_items ili ON a.invoice_line_item_id = ili.id
    JOIN invoices i ON ili.invoice_id = i.id
    WHERE a.organization_id = p_organization_id
        AND i.billing_period_start >= v_period_start
        AND i.billing_period_end <= v_period_end
        AND i.status != 'archived'::invoice_status;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add documentation comment for calculate_monthly_spend function
COMMENT ON FUNCTION calculate_monthly_spend(UUID, INTEGER, INTEGER) IS
'Calculates total spending for a specific month and organization with breakdowns by service, cost center, and provider.
Parameters: p_organization_id (UUID), p_year (YYYY), p_month (1-12). Returns aggregated spend data and invoice count.';

-- Calculate spending for a cost center over a period
CREATE OR REPLACE FUNCTION calculate_cost_center_spend(
    p_organization_id UUID,
    p_cost_center TEXT,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS TABLE (
    cost_center TEXT,
    total_spend DECIMAL,
    allocated_amount DECIMAL,
    unallocated_amount DECIMAL,
    service_breakdown JSONB,
    monthly_breakdown JSONB
) AS $$
BEGIN
    RETURN QUERY
    WITH monthly_totals AS (
        SELECT
            DATE_TRUNC('month', i.billing_period_start)::DATE as month,
            COALESCE(SUM(a.allocated_amount), 0::DECIMAL) as monthly_total
        FROM allocations a
        JOIN invoice_line_items ili ON a.invoice_line_item_id = ili.id
        JOIN invoices i ON ili.invoice_id = i.id
        WHERE a.organization_id = p_organization_id
            AND a.cost_center = p_cost_center
            AND i.billing_period_start >= p_start_date
            AND i.billing_period_end <= p_end_date
            AND i.status != 'archived'::invoice_status
        GROUP BY DATE_TRUNC('month', i.billing_period_start)::DATE
    ),
    service_totals AS (
        SELECT
            jsonb_object_agg(
                COALESCE(ili.service_name, 'Unknown'),
                SUM(a.allocated_amount)
            ) as services
        FROM allocations a
        JOIN invoice_line_items ili ON a.invoice_line_item_id = ili.id
        JOIN invoices i ON ili.invoice_id = i.id
        WHERE a.organization_id = p_organization_id
            AND a.cost_center = p_cost_center
            AND i.billing_period_start >= p_start_date
            AND i.billing_period_end <= p_end_date
            AND i.status != 'archived'::invoice_status
    )
    SELECT
        p_cost_center,
        (SELECT COALESCE(SUM(monthly_total), 0::DECIMAL) FROM monthly_totals),
        (SELECT COALESCE(SUM(monthly_total), 0::DECIMAL) FROM monthly_totals),
        0::DECIMAL,
        st.services,
        jsonb_object_agg(
            TO_CHAR(mt.month, 'YYYY-MM'),
            mt.monthly_total
        )
    FROM monthly_totals mt
    CROSS JOIN service_totals st
    GROUP BY st.services;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add documentation comment for calculate_cost_center_spend function
COMMENT ON FUNCTION calculate_cost_center_spend(UUID, TEXT, DATE, DATE) IS
'Calculates spending for a specific cost center over a date range with monthly and service breakdowns.
Parameters: p_organization_id (UUID), p_cost_center (TEXT), p_start_date, p_end_date.
Returns total, allocated, unallocated amounts with service and monthly breakdowns.';

-- ============================================================================
-- BUDGET THRESHOLD DETECTION
-- ============================================================================

-- Check if any budgets are exceeding thresholds
CREATE OR REPLACE FUNCTION detect_budget_threshold(
    p_organization_id UUID,
    p_year INTEGER,
    p_month INTEGER
)
RETURNS TABLE (
    budget_id UUID,
    budget_name TEXT,
    cost_center TEXT,
    monthly_limit DECIMAL,
    actual_spend DECIMAL,
    spend_percentage DECIMAL,
    threshold_type TEXT, -- 'warning' or 'critical'
    alert_message TEXT
) AS $$
DECLARE
    v_period_start DATE;
    v_period_end DATE;
BEGIN
    v_period_start := make_date(p_year, p_month, 1);
    v_period_end := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

    RETURN QUERY
    WITH budget_spend AS (
        SELECT
            b.id,
            b.name,
            b.cost_center,
            b.monthly_limit,
            COALESCE(SUM(a.allocated_amount), 0::DECIMAL) as total_spend,
            ROUND(
                COALESCE(SUM(a.allocated_amount), 0::DECIMAL) / NULLIF(b.monthly_limit, 0) * 100,
                2
            ) as spend_pct
        FROM budgets b
        LEFT JOIN allocations a ON b.cost_center = a.cost_center
            AND a.organization_id = b.organization_id
        LEFT JOIN invoice_line_items ili ON a.invoice_line_item_id = ili.id
        LEFT JOIN invoices i ON ili.invoice_id = i.id
        WHERE b.organization_id = p_organization_id
            AND b.status = 'active'::budget_status
            AND b.monthly_limit > 0  -- Prevent division by zero (FIX 1: HIGH)
            AND (
                i.billing_period_start IS NULL
                OR (i.billing_period_start >= v_period_start
                    AND i.billing_period_end <= v_period_end)
            )
        GROUP BY b.id, b.name, b.cost_center, b.monthly_limit
    )
    SELECT
        bs.id,
        bs.name,
        bs.cost_center,
        bs.monthly_limit,
        bs.total_spend,
        bs.spend_pct,
        CASE
            WHEN bs.spend_pct >= 95 THEN 'critical'
            WHEN bs.spend_pct >= 80 THEN 'warning'
        END as threshold_type,
        CASE
            WHEN bs.spend_pct >= 95 THEN
                FORMAT('CRITICAL: %s budget at %.1f%% ($%.2f / $%.2f)',
                    bs.cost_center, bs.spend_pct, bs.total_spend, bs.monthly_limit)
            WHEN bs.spend_pct >= 80 THEN
                FORMAT('WARNING: %s budget at %.1f%% ($%.2f / $%.2f)',
                    bs.cost_center, bs.spend_pct, bs.total_spend, bs.monthly_limit)
        END
    FROM budget_spend bs
    WHERE bs.spend_pct >= 80
    ORDER BY bs.spend_pct DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add documentation comments for detect_budget_threshold function
COMMENT ON FUNCTION detect_budget_threshold(UUID, INTEGER, INTEGER) IS
'Detects budgets exceeding warning (80%) and critical (95%) thresholds for a given month.
Provides threshold type and formatted alert messages for monitoring.';

-- ============================================================================
-- ANOMALY DETECTION FUNCTIONS
-- ============================================================================

-- Detect service spikes (comparison with previous 3 months average)
CREATE OR REPLACE FUNCTION detect_service_spikes(
    p_organization_id UUID,
    p_current_month DATE,
    p_deviation_threshold DECIMAL DEFAULT 50.0 -- 50% threshold
)
RETURNS TABLE (
    service_name TEXT,
    current_month_spend DECIMAL,
    average_previous_spend DECIMAL,
    deviation_percentage DECIMAL,
    is_spike BOOLEAN
) AS $$
DECLARE
    v_month_start DATE;
    v_month_end DATE;
    v_prev_1_start DATE;
    v_prev_3_end DATE;
BEGIN
    v_month_start := DATE_TRUNC('month', p_current_month)::DATE;
    v_month_end := (v_month_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    v_prev_1_start := (v_month_start - INTERVAL '3 months')::DATE;
    v_prev_3_end := (v_month_start - INTERVAL '1 day')::DATE;

    RETURN QUERY
    WITH current_spend AS (
        SELECT
            COALESCE(ili.service_name, 'Unknown') as service,
            SUM(a.allocated_amount) as total
        FROM allocations a
        JOIN invoice_line_items ili ON a.invoice_line_item_id = ili.id
        JOIN invoices i ON ili.invoice_id = i.id
        WHERE a.organization_id = p_organization_id
            AND i.billing_period_start >= v_month_start
            AND i.billing_period_end <= v_month_end
        GROUP BY ili.service_name
    ),
    previous_spend AS (
        SELECT
            COALESCE(ili.service_name, 'Unknown') as service,
            AVG(COALESCE(a.allocated_amount, 0::DECIMAL)) as avg_total
        FROM allocations a
        JOIN invoice_line_items ili ON a.invoice_line_item_id = ili.id
        JOIN invoices i ON ili.invoice_id = i.id
        WHERE a.organization_id = p_organization_id
            AND i.billing_period_start >= v_prev_1_start
            AND i.billing_period_end <= v_prev_3_end
        GROUP BY ili.service_name
    )
    SELECT
        COALESCE(cs.service, ps.service) as service_name,
        COALESCE(cs.total, 0::DECIMAL),
        COALESCE(ps.avg_total, 0::DECIMAL),
        CASE
            WHEN ps.avg_total = 0 THEN 100::DECIMAL
            ELSE ROUND(((cs.total - ps.avg_total) / ps.avg_total * 100)::NUMERIC, 2)
        END as deviation,
        CASE
            WHEN COALESCE(ps.avg_total, 0) = 0 THEN true
            WHEN ROUND(((cs.total - ps.avg_total) / ps.avg_total * 100)::NUMERIC, 2) >= p_deviation_threshold THEN true
            ELSE false
        END as is_spike
    FROM current_spend cs
    FULL OUTER JOIN previous_spend ps ON cs.service = ps.service
    WHERE CASE
        WHEN COALESCE(ps.avg_total, 0) = 0 THEN true
        WHEN ROUND(((cs.total - ps.avg_total) / ps.avg_total * 100)::NUMERIC, 2) >= p_deviation_threshold THEN true
        ELSE false
    END
    ORDER BY deviation DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add documentation comment for detect_service_spikes function
COMMENT ON FUNCTION detect_service_spikes(UUID, DATE, DECIMAL) IS
'Detects service usage spikes by comparing current month spending against 3-month average.
Returns spike status and deviation percentage for anomaly detection and alerting.';

-- ============================================================================
-- ALLOCATION FUNCTIONS
-- ============================================================================

-- Apply allocation rules to unallocated line items
CREATE OR REPLACE FUNCTION apply_allocation_rules(
    p_organization_id UUID,
    p_invoice_id UUID
)
RETURNS TABLE (
    line_item_id UUID,
    allocated BOOLEAN,
    allocation_count INTEGER,
    total_allocated_amount DECIMAL
) AS $$
DECLARE
    v_rule RECORD;
    v_line_item RECORD;
    v_allocation_count INTEGER;
    v_total_amount DECIMAL;
BEGIN
    -- Process each unallocated line item
    FOR v_line_item IN
        SELECT id, service_name, total_price, tags
        FROM invoice_line_items
        WHERE invoice_id = p_invoice_id
            AND organization_id = p_organization_id
            AND id NOT IN (
                SELECT invoice_line_item_id FROM allocations
                WHERE organization_id = p_organization_id
            )
    LOOP
        v_allocation_count := 0;
        v_total_amount := 0::DECIMAL;

        -- Check each active rule for this organization
        FOR v_rule IN
            SELECT id, method, target_allocation, allocation_method
            FROM allocation_rules
            WHERE organization_id = p_organization_id
                AND is_active = true
            ORDER BY priority DESC
        LOOP
            -- Simplified rule matching logic
            -- In production, this would involve more sophisticated JSON matching
            IF (v_rule.method = 'direct'::allocation_method) THEN
                INSERT INTO allocations (
                    organization_id,
                    invoice_line_item_id,
                    allocation_rule_id,
                    cost_center,
                    allocated_amount,
                    original_amount,
                    allocation_percentage
                )
                SELECT
                    p_organization_id,
                    v_line_item.id,
                    v_rule.id,
                    (v_rule.target_allocation->>'cost_center')::TEXT,
                    v_line_item.total_price,
                    v_line_item.total_price,
                    100.0::DECIMAL
                WHERE NOT EXISTS (
                    SELECT 1 FROM allocations
                    WHERE invoice_line_item_id = v_line_item.id
                        AND organization_id = p_organization_id
                )
                RETURNING allocated_amount INTO v_total_amount;

                IF FOUND THEN
                    v_allocation_count := v_allocation_count + 1;
                END IF;
            END IF;
        END LOOP;

        RETURN QUERY
        SELECT
            v_line_item.id,
            v_allocation_count > 0,
            v_allocation_count,
            v_total_amount;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Add documentation comment for apply_allocation_rules function
COMMENT ON FUNCTION apply_allocation_rules(UUID, UUID) IS
'Applies active allocation rules to unallocated line items in an invoice.
Returns allocation status, count, and totals for each processed line item.';

-- Get aggregated spending by cost center for a period
CREATE OR REPLACE FUNCTION aggregate_by_cost_center(
    p_organization_id UUID,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS TABLE (
    cost_center TEXT,
    department TEXT,
    total_allocated DECIMAL,
    allocation_count INTEGER,
    service_count INTEGER,
    top_services JSONB
) AS $$
BEGIN
    RETURN QUERY
    WITH cc_spending AS (
        SELECT
            a.cost_center,
            a.department,
            SUM(a.allocated_amount) as total_amount,
            COUNT(*) as alloc_count,
            COUNT(DISTINCT ili.service_name) as svc_count,
            jsonb_object_agg(
                COALESCE(ili.service_name, 'Unknown'),
                SUM(a.allocated_amount)
                ORDER BY SUM(a.allocated_amount) DESC
            ) as services
        FROM allocations a
        JOIN invoice_line_items ili ON a.invoice_line_item_id = ili.id
        JOIN invoices i ON ili.invoice_id = i.id
        WHERE a.organization_id = p_organization_id
            AND i.billing_period_start >= p_start_date
            AND i.billing_period_end <= p_end_date
            AND i.status != 'archived'::invoice_status
        GROUP BY a.cost_center, a.department
    )
    SELECT
        cost_center,
        department,
        total_amount,
        alloc_count,
        svc_count,
        services
    FROM cc_spending
    ORDER BY total_amount DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add documentation comment for aggregate_by_cost_center function
COMMENT ON FUNCTION aggregate_by_cost_center(UUID, DATE, DATE) IS
'Aggregates spending by cost center for a date range, including service breakdowns
and allocation statistics for cost analysis and reporting.';

-- ============================================================================
-- ATTESTATION AND SECURITY FUNCTIONS
-- ============================================================================

-- Generate attestation hash for close pack
CREATE OR REPLACE FUNCTION generate_attestation_hash(
    p_close_pack_id UUID
)
RETURNS TEXT AS $$
DECLARE
    v_hash TEXT;
    v_data JSONB;
BEGIN
    -- FIX 3 (MEDIUM): Add null check for close pack existence
    IF NOT EXISTS (SELECT 1 FROM close_packs WHERE id = p_close_pack_id) THEN
        RAISE EXCEPTION 'Close pack not found: %', p_close_pack_id;
    END IF;

    -- Build comprehensive data for hashing
    SELECT jsonb_build_object(
        'close_pack_id', p_close_pack_id,
        'organization_id', cp.organization_id,
        'period_start', cp.period_start,
        'period_end', cp.period_end,
        'total_allocated', cp.total_allocated_amount,
        'total_unallocated', cp.total_unallocated_amount,
        'invoice_count', cp.total_invoices,
        'line_items', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', cpd.id,
                    'cost_center', cpd.cost_center,
                    'amount', cpd.allocated_amount
                )
            )
            FROM close_pack_details cpd
            WHERE cpd.close_pack_id = p_close_pack_id
        ),
        'generated_at', cp.generated_at
    ) INTO v_data
    FROM close_packs cp
    WHERE cp.id = p_close_pack_id;

    -- Generate SHA256 hash
    v_hash := encode(
        digest(v_data::TEXT, 'sha256'),
        'hex'
    );

    -- Update close pack with hash
    UPDATE close_packs
    SET attestation_hash = v_hash
    WHERE id = p_close_pack_id;

    RETURN v_hash;
END;
$$ LANGUAGE plpgsql;

-- Add documentation comment for generate_attestation_hash function
COMMENT ON FUNCTION generate_attestation_hash(UUID) IS
'Generates SHA256 attestation hash for a close pack combining all relevant data.
Updates the close pack record with the generated hash for integrity verification.';

-- ============================================================================
-- SAVINGS CALCULATION FUNCTIONS
-- ============================================================================

-- Calculate potential savings from a recommendation
CREATE OR REPLACE FUNCTION calculate_recommendation_impact(
    p_recommendation_id UUID
)
RETURNS TABLE (
    annual_savings DECIMAL,
    monthly_savings DECIMAL,
    payback_months INTEGER,
    roi_percentage DECIMAL
) AS $$
DECLARE
    v_annual DECIMAL;
    v_implementation_cost DECIMAL;
    v_monthly DECIMAL;
BEGIN
    SELECT
        estimated_annual_savings,
        implementation_cost,
        estimated_monthly_savings
    INTO v_annual, v_implementation_cost, v_monthly
    FROM savings_recommendations
    WHERE id = p_recommendation_id;

    IF v_annual IS NULL THEN
        RAISE EXCEPTION 'Recommendation not found';
    END IF;

    RETURN QUERY
    SELECT
        v_annual,
        v_monthly,
        CASE
            WHEN v_monthly = 0 THEN NULL::INTEGER
            ELSE CEIL((v_implementation_cost / v_monthly)::NUMERIC)::INTEGER
        END,
        CASE
            WHEN v_implementation_cost = 0 OR v_implementation_cost IS NULL THEN 100.0::DECIMAL
            ELSE ROUND((v_annual / v_implementation_cost * 100)::NUMERIC, 2)
        END;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add documentation comment for calculate_recommendation_impact function
COMMENT ON FUNCTION calculate_recommendation_impact(UUID) IS
'Calculates annual/monthly savings and ROI metrics for a savings recommendation.
Handles null/zero implementation costs and validates recommendation existence.';

-- ============================================================================
-- REPORTING AND EXPORT FUNCTIONS
-- ============================================================================

-- Generate cost analysis report
CREATE OR REPLACE FUNCTION generate_cost_analysis_report(
    p_organization_id UUID,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS JSONB AS $$
DECLARE
    v_report JSONB;
BEGIN
    v_report := jsonb_build_object(
        'organization_id', p_organization_id,
        'period', jsonb_build_object(
            'start_date', p_start_date,
            'end_date', p_end_date
        ),
        'summary', (
            SELECT jsonb_build_object(
                'total_spend', SUM(allocated_amount),
                'invoice_count', COUNT(DISTINCT ili.invoice_id),
                'line_item_count', COUNT(*),
                'provider_breakdown', jsonb_object_agg(i.provider, SUM(a.allocated_amount))
            )
            FROM allocations a
            JOIN invoice_line_items ili ON a.invoice_line_item_id = ili.id
            JOIN invoices i ON ili.invoice_id = i.id
            WHERE a.organization_id = p_organization_id
                AND i.billing_period_start >= p_start_date
                AND i.billing_period_end <= p_end_date
        ),
        'by_cost_center', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'cost_center', cost_center,
                    'total_allocated', total_allocated,
                    'allocation_count', alloc_count
                )
                ORDER BY total_allocated DESC
            )
            FROM (
                SELECT
                    a.cost_center,
                    SUM(a.allocated_amount) as total_allocated,
                    COUNT(*) as alloc_count
                FROM allocations a
                JOIN invoice_line_items ili ON a.invoice_line_item_id = ili.id
                JOIN invoices i ON ili.invoice_id = i.id
                WHERE a.organization_id = p_organization_id
                    AND i.billing_period_start >= p_start_date
                    AND i.billing_period_end <= p_end_date
                GROUP BY a.cost_center
            ) cc_analysis
        ),
        'top_services', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'service', service_name,
                    'total_cost', total_cost
                )
                ORDER BY total_cost DESC
            )
            FROM (
                SELECT
                    ili.service_name,
                    SUM(a.allocated_amount) as total_cost
                FROM allocations a
                JOIN invoice_line_items ili ON a.invoice_line_item_id = ili.id
                JOIN invoices i ON ili.invoice_id = i.id
                WHERE a.organization_id = p_organization_id
                    AND i.billing_period_start >= p_start_date
                    AND i.billing_period_end <= p_end_date
                GROUP BY ili.service_name
                ORDER BY total_cost DESC
                LIMIT 10
            ) service_analysis
        ),
        'generated_at', NOW()
    );

    RETURN v_report;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add documentation comment for generate_cost_analysis_report function
COMMENT ON FUNCTION generate_cost_analysis_report(UUID, DATE, DATE) IS
'Generates comprehensive cost analysis report as JSONB with summary, cost center breakdown,
and top services for a given organization and date range. Used for reporting and exports.';

-- ============================================================================
-- MAINTENANCE FUNCTIONS
-- ============================================================================

-- Archive old gateway logs (useful for performance)
CREATE OR REPLACE FUNCTION archive_old_gateway_logs(
    p_days_to_keep INTEGER DEFAULT 90
)
RETURNS TABLE (
    archived_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH deleted AS (
        DELETE FROM gateway_logs
        WHERE created_at < NOW() - MAKE_INTERVAL(days => p_days_to_keep)
        RETURNING 1
    )
    SELECT COUNT(*)::BIGINT FROM deleted;
END;
$$ LANGUAGE plpgsql;

-- Add documentation comment for archive_old_gateway_logs function
COMMENT ON FUNCTION archive_old_gateway_logs(INTEGER) IS
'Archives (deletes) gateway logs older than specified days for performance maintenance.
Default retention is 90 days. Returns count of archived records.';

-- Clean up resolved anomalies older than a certain date
CREATE OR REPLACE FUNCTION cleanup_old_anomalies(
    p_days_to_keep INTEGER DEFAULT 180
)
RETURNS TABLE (
    deleted_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH deleted AS (
        DELETE FROM anomalies
        WHERE is_resolved = true
            AND resolved_at < NOW() - MAKE_INTERVAL(days => p_days_to_keep)
        RETURNING 1
    )
    SELECT COUNT(*)::BIGINT FROM deleted;
END;
$$ LANGUAGE plpgsql;

-- Add documentation comment for cleanup_old_anomalies function
COMMENT ON FUNCTION cleanup_old_anomalies(INTEGER) IS
'Deletes resolved anomalies older than specified days for data retention management.
Default retention is 180 days. Returns count of deleted records.';

-- Refresh cost allocation summary materialized view
CREATE OR REPLACE FUNCTION refresh_cost_allocation_summary()
RETURNS void AS $$
BEGIN
    DELETE FROM cost_allocation_summary;

    INSERT INTO cost_allocation_summary (
        organization_id,
        year,
        month,
        cost_center,
        department,
        project_code,
        total_allocated_amount,
        service_count,
        resource_count,
        service_breakdown,
        region_breakdown
    )
    SELECT
        a.organization_id,
        EXTRACT(YEAR FROM i.billing_period_start)::INTEGER,
        EXTRACT(MONTH FROM i.billing_period_start)::INTEGER,
        a.cost_center,
        a.department,
        a.project_code,
        SUM(a.allocated_amount),
        COUNT(DISTINCT ili.service_name),
        COUNT(DISTINCT ili.resource_id),
        jsonb_object_agg(
            COALESCE(ili.service_name, 'Unknown'),
            SUM(a.allocated_amount)
        ),
        jsonb_object_agg(
            COALESCE(ili.region, 'Unknown'),
            SUM(a.allocated_amount)
        )
    FROM allocations a
    JOIN invoice_line_items ili ON a.invoice_line_item_id = ili.id
    JOIN invoices i ON ili.invoice_id = i.id
    WHERE i.status != 'archived'::invoice_status
    GROUP BY
        a.organization_id,
        EXTRACT(YEAR FROM i.billing_period_start),
        EXTRACT(MONTH FROM i.billing_period_start),
        a.cost_center,
        a.department,
        a.project_code;
END;
$$ LANGUAGE plpgsql;

-- Add documentation comment for refresh_cost_allocation_summary function
COMMENT ON FUNCTION refresh_cost_allocation_summary() IS
'Refreshes the cost_allocation_summary table with aggregated allocation data.
Rebuilds monthly breakdowns by service, region, and cost center for reporting.';

-- ============================================================================
-- GATEWAY BUDGET ENFORCEMENT: Sum usage cost for a cost center since a date
-- ============================================================================
-- Called by the gateway's budget enforcement logic via PostgREST RPC
-- Returns total cost in cents for the given org + cost center since the given date

CREATE OR REPLACE FUNCTION sum_usage_cost(
    org_id UUID,
    cc TEXT,
    since DATE
)
RETURNS NUMERIC AS $$
BEGIN
    -- FIX 8 (CRITICAL): Validate cost_center parameter to prevent SQL injection
    -- Ensure cc matches safe pattern (alphanumeric, hyphens, underscores only)
    IF cc !~ '^[a-zA-Z0-9_-]+$' THEN
        RAISE EXCEPTION 'Invalid cost_center format. Only alphanumeric characters, hyphens, and underscores are allowed.';
    END IF;

    RETURN COALESCE(
        (SELECT SUM(cost_cents)
         FROM usage
         WHERE organization_id = org_id
           AND cost_center = cc
           AND created_at >= since),
        0
    );
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp;
-- FIX 2 (LOW): Changed from STABLE to VOLATILE because function reads mutable gateway_logs table
-- FIX 6 (MEDIUM): Added search_path to SECURITY DEFINER function to prevent SQL injection
-- FIX 8 (CRITICAL): Added input validation for cost_center_code parameter

-- Add documentation comment for sum_usage_cost function
COMMENT ON FUNCTION sum_usage_cost(UUID, TEXT, DATE) IS
'Sums usage cost in cents for a given organization and cost center since a date.
Called by gateway budget enforcement logic. Returns total cost or 0 if no usage found.
Parameters: org_id (organization UUID), cc (cost_center TEXT), since (start DATE).';

-- ============================================================================
-- AUDIT TRAIL FUNCTIONS - Track password resets and role changes (MEDIUM)
-- ============================================================================

-- Track password reset events
CREATE OR REPLACE FUNCTION log_password_reset(
    p_user_id UUID,
    p_org_id UUID,
    p_method TEXT DEFAULT 'email'
)
RETURNS void AS $$
BEGIN
    INSERT INTO audit_trail (
        organization_id, user_id, action, resource_type, resource_id,
        changes, metadata
    ) VALUES (
        p_org_id, p_user_id, 'update'::audit_action, 'user', p_user_id::TEXT,
        jsonb_build_object('method', p_method, 'event', 'password_reset'),
        jsonb_build_object('severity', 'high', 'timestamp', NOW())
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Add documentation comment for log_password_reset function
COMMENT ON FUNCTION log_password_reset(UUID, UUID, TEXT) IS
'Logs password reset events to audit trail with method and timestamp.
Parameters: p_user_id (user UUID), p_org_id (org UUID), p_method (reset method, default: email).';

-- Track role changes
CREATE OR REPLACE FUNCTION log_role_change(
    p_user_id UUID,
    p_org_id UUID,
    p_old_role TEXT,
    p_new_role TEXT,
    p_changed_by UUID
)
RETURNS void AS $$
BEGIN
    -- FIX 9 (HIGH): Validate role values to prevent invalid role assignments
    IF p_new_role NOT IN ('owner', 'admin', 'member', 'viewer', 'auditor') THEN
        RAISE EXCEPTION 'Invalid role: %. Must be one of: owner, admin, member, viewer, auditor', p_new_role;
    END IF;

    INSERT INTO audit_trail (
        organization_id, user_id, action, resource_type, resource_id,
        changes, metadata
    ) VALUES (
        p_org_id, p_changed_by, 'update'::audit_action, 'user', p_user_id::TEXT,
        jsonb_build_object('old_role', p_old_role, 'new_role', p_new_role),
        jsonb_build_object('severity', 'critical', 'event', 'role_change')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Add documentation comment for log_role_change function
COMMENT ON FUNCTION log_role_change(UUID, UUID, TEXT, TEXT, UUID) IS
'Logs role change events to audit trail with before/after role values.
Parameters: p_user_id (user UUID), p_org_id (org UUID), p_old_role, p_new_role, p_changed_by (admin UUID).';

-- ============================================================================
-- SOFT DELETE HELPER - Safe user deactivation (LOW)
-- ============================================================================

CREATE OR REPLACE FUNCTION soft_delete_user(
    p_user_id UUID,
    p_org_id UUID,
    p_deleted_by UUID
)
RETURNS void AS $$
BEGIN
    -- Deactivate user
    UPDATE users SET is_active = false, updated_at = NOW()
    WHERE id = p_user_id AND organization_id = p_org_id;

    -- Revoke all active sessions
    UPDATE sessions SET revoked_at = NOW()
    WHERE user_id = p_user_id AND organization_id = p_org_id AND revoked_at IS NULL;

    -- Revoke all active API keys
    UPDATE api_keys SET is_active = false, revoked_at = NOW()
    WHERE user_id = p_user_id AND organization_id = p_org_id AND is_active = true;

    -- Log the action
    PERFORM log_role_change(p_user_id, p_org_id, 'active', 'deactivated', p_deleted_by);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Add documentation comment for soft_delete_user function
COMMENT ON FUNCTION soft_delete_user(UUID, UUID, UUID) IS
'Safely deactivates a user by disabling account, revoking sessions, and API keys.
Logs the action to audit trail. Parameters: p_user_id, p_org_id, p_deleted_by (admin UUID).';

-- ============================================================================
-- PERFORMANCE INDEXES - Frequently queried columns (MEDIUM)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_gateway_logs_org_created ON gateway_logs(organization_id, created_at DESC);
-- idx_gateway_logs_cost_center removed: cost_center_code column doesn't exist in base schema
CREATE INDEX IF NOT EXISTS idx_usage_org_created ON usage(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomalies_org_severity ON anomalies(organization_id, severity, is_resolved);
CREATE INDEX IF NOT EXISTS idx_sessions_user_org ON sessions(user_id, organization_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_budgets_org_active ON budgets(organization_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_audit_trail_org_action ON audit_trail(organization_id, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_org_period ON invoices(organization_id, billing_period_start DESC);
CREATE INDEX IF NOT EXISTS idx_close_packs_org ON close_packs(organization_id, created_at DESC);

-- Add comments documenting index purpose
COMMENT ON INDEX idx_gateway_logs_org_created IS 'Optimizes queries filtering by organization and creation date for audit logs';
COMMENT ON INDEX idx_usage_org_created IS 'Optimizes usage queries by organization and creation date';
COMMENT ON INDEX idx_anomalies_org_severity IS 'Optimizes anomaly filtering and resolution tracking';
COMMENT ON INDEX idx_sessions_user_org IS 'Optimizes active session lookup for user and org';
COMMENT ON INDEX idx_api_keys_hash IS 'Optimizes API key authentication by hash';
COMMENT ON INDEX idx_budgets_org_active IS 'Optimizes active budget queries by organization';
COMMENT ON INDEX idx_audit_trail_org_action IS 'Optimizes audit trail searches by organization, action, and time';
COMMENT ON INDEX idx_invoices_org_period IS 'Optimizes invoice queries by organization and billing period';
COMMENT ON INDEX idx_close_packs_org IS 'Optimizes close pack queries by organization and creation date';

-- ============================================================================
-- DATA INTEGRITY CONSTRAINTS - Check constraints (MEDIUM)
-- ============================================================================

ALTER TABLE budgets ADD CONSTRAINT chk_budget_positive CHECK (monthly_limit > 0) NOT VALID;
ALTER TABLE budgets ADD CONSTRAINT chk_budget_thresholds CHECK (warning_threshold_percentage BETWEEN 0 AND 100 AND critical_threshold_percentage BETWEEN 0 AND 100) NOT VALID;
-- chk_api_key_prefix removed: key_prefix column doesn't exist in api_keys table

-- Add comments documenting check constraints purpose
COMMENT ON CONSTRAINT chk_budget_positive ON budgets IS 'Ensures monthly budget limits are positive values (prevent zero/negative budgets)';
COMMENT ON CONSTRAINT chk_budget_thresholds ON budgets IS 'Ensures warning and critical threshold percentages are between 0-100';
