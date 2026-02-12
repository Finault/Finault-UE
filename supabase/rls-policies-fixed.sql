-- Finault Platform - Row-Level Security Policies
-- Comprehensive RLS for multi-tenant isolation and role-based access
-- Last Updated: 2026-01-30

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gateway_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE allocation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomalies ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE close_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE close_pack_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_trail ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_allocation_summary ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- HELPER FUNCTIONS FOR RLS
-- ============================================================================

-- Get current user's organization ID
CREATE OR REPLACE FUNCTION get_current_user_org()
RETURNS UUID AS $$
BEGIN
    RETURN (SELECT organization_id FROM users WHERE auth_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get current user's role
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS user_role AS $$
BEGIN
    RETURN (SELECT role FROM users WHERE auth_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user is organization admin
CREATE OR REPLACE FUNCTION is_org_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (SELECT role = 'admin' FROM users WHERE auth_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user is auditor
CREATE OR REPLACE FUNCTION is_auditor()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (SELECT role = 'auditor' FROM users WHERE auth_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- ORGANIZATIONS POLICIES
-- ============================================================================

-- Users can only see their own organization
CREATE POLICY "Users can view own organization"
    ON organizations FOR SELECT
    USING (
        id = get_current_user_org()
    );

-- Only admins can update organization settings
CREATE POLICY "Only admins can update organization"
    ON organizations FOR UPDATE
    USING (
        id = get_current_user_org()
        AND is_org_admin()
    );

-- Only service role can insert organizations (for signup)
CREATE POLICY "Only service role can create organizations"
    ON organizations FOR INSERT
    WITH CHECK (false);

-- ============================================================================
-- USERS POLICIES
-- ============================================================================

-- Users can view other users in their organization
CREATE POLICY "Users can view own organization members"
    ON users FOR SELECT
    USING (
        organization_id = get_current_user_org()
    );

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
    ON users FOR UPDATE
    USING (
        auth_id = auth.uid()
    );

-- Admins can manage users in their organization
CREATE POLICY "Admins can manage organization users"
    ON users FOR UPDATE
    USING (
        organization_id = get_current_user_org()
        AND is_org_admin()
    );

-- Admins can view user audit trail
CREATE POLICY "Admins can view user changes"
    ON users FOR SELECT
    USING (
        organization_id = get_current_user_org()
        AND (is_org_admin() OR get_current_user_role() = 'auditor')
    );

-- ============================================================================
-- API KEYS POLICIES
-- ============================================================================

-- Users can only view their own API keys
CREATE POLICY "Users can view own API keys"
    ON api_keys FOR SELECT
    USING (
        user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
        AND organization_id = get_current_user_org()
    );

-- Admins can view all API keys in their organization
CREATE POLICY "Admins can view all organization API keys"
    ON api_keys FOR SELECT
    USING (
        organization_id = get_current_user_org()
        AND is_org_admin()
    );

-- Users can create API keys for themselves
CREATE POLICY "Users can create own API keys"
    ON api_keys FOR INSERT
    WITH CHECK (
        user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
        AND organization_id = get_current_user_org()
    );

-- Users can revoke their own API keys
CREATE POLICY "Users can revoke own API keys"
    ON api_keys FOR UPDATE
    USING (
        user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
        AND organization_id = get_current_user_org()
    );

-- Admins can revoke any API key in their organization
CREATE POLICY "Admins can revoke any API key"
    ON api_keys FOR UPDATE
    USING (
        organization_id = get_current_user_org()
        AND is_org_admin()
    );

-- ============================================================================
-- SESSIONS POLICIES
-- ============================================================================

-- Users can only view their own sessions
CREATE POLICY "Users can view own sessions"
    ON sessions FOR SELECT
    USING (
        user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
        AND organization_id = get_current_user_org()
    );

-- Admins can view all sessions in their organization
CREATE POLICY "Admins can view all sessions"
    ON sessions FOR SELECT
    USING (
        organization_id = get_current_user_org()
        AND is_org_admin()
    );

-- ============================================================================
-- GATEWAY LOGS POLICIES
-- ============================================================================

-- Admins can view gateway logs
CREATE POLICY "Admins can view gateway logs"
    ON gateway_logs FOR SELECT
    USING (
        organization_id = get_current_user_org()
        AND is_org_admin()
    );

-- Auditors can view gateway logs
CREATE POLICY "Auditors can view gateway logs"
    ON gateway_logs FOR SELECT
    USING (
        organization_id = get_current_user_org()
        AND is_auditor()
    );

-- Service role can insert logs
CREATE POLICY "Service role can log gateway requests"
    ON gateway_logs FOR INSERT
    WITH CHECK (true);

-- ============================================================================
-- INVOICES POLICIES
-- ============================================================================

-- All authenticated users can view invoices in their organization
CREATE POLICY "Users can view organization invoices"
    ON invoices FOR SELECT
    USING (
        organization_id = get_current_user_org()
    );

-- Admins and finance leads can update invoices
CREATE POLICY "Finance roles can update invoices"
    ON invoices FOR UPDATE
    USING (
        organization_id = get_current_user_org()
        AND get_current_user_role() IN ('admin', 'finance_lead')
    );

-- Admins can create invoices
CREATE POLICY "Admins can create invoices"
    ON invoices FOR INSERT
    WITH CHECK (
        organization_id = get_current_user_org()
        AND is_org_admin()
    );

-- Only service role or admins can delete invoices
CREATE POLICY "Only service role can delete invoices"
    ON invoices FOR DELETE
    USING (false);

-- ============================================================================
-- INVOICE LINE ITEMS POLICIES
-- ============================================================================

-- All users can view line items in their organization
CREATE POLICY "Users can view organization invoice line items"
    ON invoice_line_items FOR SELECT
    USING (
        organization_id = get_current_user_org()
    );

-- Only admins can insert/update line items
CREATE POLICY "Admins can manage invoice line items"
    ON invoice_line_items FOR INSERT
    WITH CHECK (
        organization_id = get_current_user_org()
        AND is_org_admin()
    );

-- ============================================================================
-- ALLOCATION RULES POLICIES
-- ============================================================================

-- All users can view allocation rules in their organization
CREATE POLICY "Users can view allocation rules"
    ON allocation_rules FOR SELECT
    USING (
        organization_id = get_current_user_org()
    );

-- Finance leads and admins can create/update rules
CREATE POLICY "Finance roles can manage allocation rules"
    ON allocation_rules FOR INSERT
    WITH CHECK (
        organization_id = get_current_user_org()
        AND get_current_user_role() IN ('admin', 'finance_lead')
    );

CREATE POLICY "Finance roles can update allocation rules"
    ON allocation_rules FOR UPDATE
    USING (
        organization_id = get_current_user_org()
        AND get_current_user_role() IN ('admin', 'finance_lead')
    );

-- Only admins can delete rules
CREATE POLICY "Only admins can delete allocation rules"
    ON allocation_rules FOR DELETE
    USING (
        organization_id = get_current_user_org()
        AND is_org_admin()
    );

-- ============================================================================
-- ALLOCATIONS POLICIES
-- ============================================================================

-- All users can view allocations in their organization
CREATE POLICY "Users can view allocations"
    ON allocations FOR SELECT
    USING (
        organization_id = get_current_user_org()
    );

-- Finance roles can create allocations
CREATE POLICY "Finance roles can create allocations"
    ON allocations FOR INSERT
    WITH CHECK (
        organization_id = get_current_user_org()
        AND get_current_user_role() IN ('admin', 'finance_lead', 'cost_optimizer')
    );

-- Finance roles can update allocations
CREATE POLICY "Finance roles can update allocations"
    ON allocations FOR UPDATE
    USING (
        organization_id = get_current_user_org()
        AND get_current_user_role() IN ('admin', 'finance_lead', 'cost_optimizer')
    );

-- ============================================================================
-- BUDGETS POLICIES
-- ============================================================================

-- All users can view budgets
CREATE POLICY "Users can view budgets"
    ON budgets FOR SELECT
    USING (
        organization_id = get_current_user_org()
    );

-- Finance roles can create budgets
CREATE POLICY "Finance roles can create budgets"
    ON budgets FOR INSERT
    WITH CHECK (
        organization_id = get_current_user_org()
        AND get_current_user_role() IN ('admin', 'finance_lead')
    );

-- Finance roles can update budgets
CREATE POLICY "Finance roles can update budgets"
    ON budgets FOR UPDATE
    USING (
        organization_id = get_current_user_org()
        AND get_current_user_role() IN ('admin', 'finance_lead')
    );

-- ============================================================================
-- BUDGET TRACKING POLICIES
-- ============================================================================

-- All users can view budget tracking
CREATE POLICY "Users can view budget tracking"
    ON budget_tracking FOR SELECT
    USING (
        organization_id = get_current_user_org()
    );

-- Finance roles can update budget tracking
CREATE POLICY "Finance roles can update budget tracking"
    ON budget_tracking FOR UPDATE
    USING (
        organization_id = get_current_user_org()
        AND get_current_user_role() IN ('admin', 'finance_lead')
    );

-- ============================================================================
-- ANOMALIES POLICIES
-- ============================================================================

-- All users can view anomalies in their organization
CREATE POLICY "Users can view anomalies"
    ON anomalies FOR SELECT
    USING (
        organization_id = get_current_user_org()
    );

-- Finance roles can create and update anomalies
CREATE POLICY "Finance roles can manage anomalies"
    ON anomalies FOR INSERT
    WITH CHECK (
        organization_id = get_current_user_org()
        AND get_current_user_role() IN ('admin', 'finance_lead', 'cost_optimizer')
    );

CREATE POLICY "Finance roles can update anomalies"
    ON anomalies FOR UPDATE
    USING (
        organization_id = get_current_user_org()
        AND get_current_user_role() IN ('admin', 'finance_lead', 'cost_optimizer')
    );

-- ============================================================================
-- SAVINGS RECOMMENDATIONS POLICIES
-- ============================================================================

-- All users can view recommendations
CREATE POLICY "Users can view savings recommendations"
    ON savings_recommendations FOR SELECT
    USING (
        organization_id = get_current_user_org()
    );

-- Finance roles can manage recommendations
CREATE POLICY "Finance roles can create recommendations"
    ON savings_recommendations FOR INSERT
    WITH CHECK (
        organization_id = get_current_user_org()
        AND get_current_user_role() IN ('admin', 'finance_lead', 'cost_optimizer')
    );

CREATE POLICY "Finance roles can update recommendations"
    ON savings_recommendations FOR UPDATE
    USING (
        organization_id = get_current_user_org()
        AND get_current_user_role() IN ('admin', 'finance_lead', 'cost_optimizer')
    );

-- ============================================================================
-- CLOSE PACKS POLICIES
-- ============================================================================

-- All users can view close packs
CREATE POLICY "Users can view close packs"
    ON close_packs FOR SELECT
    USING (
        organization_id = get_current_user_org()
    );

-- Finance leads and admins can create close packs
CREATE POLICY "Finance roles can create close packs"
    ON close_packs FOR INSERT
    WITH CHECK (
        organization_id = get_current_user_org()
        AND get_current_user_role() IN ('admin', 'finance_lead')
    );

-- Finance leads and admins can update close packs
CREATE POLICY "Finance roles can update close packs"
    ON close_packs FOR UPDATE
    USING (
        organization_id = get_current_user_org()
        AND get_current_user_role() IN ('admin', 'finance_lead')
    );

-- ============================================================================
-- CLOSE PACK DETAILS POLICIES
-- ============================================================================

-- All users can view close pack details
CREATE POLICY "Users can view close pack details"
    ON close_pack_details FOR SELECT
    USING (
        organization_id = get_current_user_org()
    );

-- Finance roles can create/update close pack details
CREATE POLICY "Finance roles can manage close pack details"
    ON close_pack_details FOR INSERT
    WITH CHECK (
        organization_id = get_current_user_org()
        AND get_current_user_role() IN ('admin', 'finance_lead')
    );

-- ============================================================================
-- AUDIT TRAIL POLICIES
-- ============================================================================

-- Only admins and auditors can view audit trail
CREATE POLICY "Admins and auditors can view audit trail"
    ON audit_trail FOR SELECT
    USING (
        organization_id = get_current_user_org()
        AND (is_org_admin() OR is_auditor())
    );

-- Service role can create audit entries
CREATE POLICY "Service role can create audit entries"
    ON audit_trail FOR INSERT
    WITH CHECK (true);

-- Audit trail should never be updated or deleted
CREATE POLICY "Audit trail is immutable"
    ON audit_trail FOR UPDATE
    USING (false);

CREATE POLICY "Audit trail cannot be deleted"
    ON audit_trail FOR DELETE
    USING (false);

-- ============================================================================
-- COST ALLOCATION SUMMARY POLICIES
-- ============================================================================

-- All users can view cost allocation summary
CREATE POLICY "Users can view cost allocation summary"
    ON cost_allocation_summary FOR SELECT
    USING (
        organization_id = get_current_user_org()
    );

-- Only service role can update (for refresh)
CREATE POLICY "Service role can refresh cost allocation summary"
    ON cost_allocation_summary FOR UPDATE
    USING (false);

-- ============================================================================
-- GRANT PERMISSIONS FOR AUTHENTICATED USERS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON users TO authenticated;
GRANT SELECT, INSERT, UPDATE ON api_keys TO authenticated;
GRANT SELECT, INSERT, UPDATE ON sessions TO authenticated;
GRANT SELECT ON gateway_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON invoices TO authenticated;
GRANT SELECT, INSERT ON invoice_line_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON allocation_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE ON allocations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON budgets TO authenticated;
GRANT SELECT, UPDATE ON budget_tracking TO authenticated;
GRANT SELECT, INSERT, UPDATE ON anomalies TO authenticated;
GRANT SELECT, INSERT, UPDATE ON savings_recommendations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON close_packs TO authenticated;
GRANT SELECT, INSERT ON close_pack_details TO authenticated;
GRANT SELECT ON audit_trail TO authenticated;
GRANT SELECT ON cost_allocation_summary TO authenticated;

-- ============================================================================
-- GRANT PERMISSIONS FOR ANONYMOUS (API key based)
-- ============================================================================

GRANT SELECT, INSERT ON gateway_logs TO anon;

-- ============================================================================
-- GRANT PERMISSIONS FOR SERVICE ROLE (Internal operations)
-- ============================================================================

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;
