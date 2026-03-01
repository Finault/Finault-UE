-- Diamond Tier Migration
-- Creates all Diamond Tier tables with RLS policies and indexes
-- Migration: 013_diamond_tier.sql

BEGIN;

-- ============================================================================
-- 1. SEMANTIC CACHE (Gateway caching)
-- ============================================================================
CREATE TABLE semantic_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    query_hash VARCHAR(64) NOT NULL,
    embedding_vector VECTOR(1536),
    cache_result JSONB NOT NULL,
    hit_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_semantic_cache_org_id ON semantic_cache(org_id);
CREATE INDEX idx_semantic_cache_provider_id ON semantic_cache(provider_id);
CREATE INDEX idx_semantic_cache_query_hash ON semantic_cache(query_hash);
CREATE INDEX idx_semantic_cache_expires_at ON semantic_cache(expires_at);

ALTER TABLE semantic_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY semantic_cache_org_policy ON semantic_cache
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 2. AB_EXPERIMENTS (A/B testing)
-- ============================================================================
CREATE TABLE ab_experiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    variant_a VARCHAR(100) NOT NULL,
    variant_b VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    allocation_percentage INT NOT NULL CHECK (allocation_percentage >= 0 AND allocation_percentage <= 100),
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    results JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ab_experiments_org_id ON ab_experiments(org_id);
CREATE INDEX idx_ab_experiments_status ON ab_experiments(status);
CREATE INDEX idx_ab_experiments_created_at ON ab_experiments(created_at);

ALTER TABLE ab_experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY ab_experiments_org_policy ON ab_experiments
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 3. SLA_METRICS (Provider SLA monitoring)
-- ============================================================================
CREATE TABLE sla_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    metric_type VARCHAR(100) NOT NULL,
    target_value DECIMAL(10, 4) NOT NULL,
    actual_value DECIMAL(10, 4),
    status VARCHAR(50) DEFAULT 'pending',
    measurement_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sla_metrics_org_id ON sla_metrics(org_id);
CREATE INDEX idx_sla_metrics_provider_id ON sla_metrics(provider_id);
CREATE INDEX idx_sla_metrics_measurement_date ON sla_metrics(measurement_date);
CREATE INDEX idx_sla_metrics_status ON sla_metrics(status);

ALTER TABLE sla_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY sla_metrics_org_policy ON sla_metrics
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 4. PROMPT_SHIELD_LOG (PII redaction audit trail)
-- ============================================================================
CREATE TABLE prompt_shield_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_prompt TEXT NOT NULL,
    redacted_prompt TEXT NOT NULL,
    pii_detected JSONB NOT NULL,
    action VARCHAR(50) NOT NULL,
    risk_score DECIMAL(3, 2),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_prompt_shield_log_org_id ON prompt_shield_log(org_id);
CREATE INDEX idx_prompt_shield_log_user_id ON prompt_shield_log(user_id);
CREATE INDEX idx_prompt_shield_log_created_at ON prompt_shield_log(created_at);
CREATE INDEX idx_prompt_shield_log_risk_score ON prompt_shield_log(risk_score);

ALTER TABLE prompt_shield_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY prompt_shield_log_org_policy ON prompt_shield_log
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 5. INVOICE_DEDUP_HASHES (SHA-256 deduplication)
-- ============================================================================
CREATE TABLE invoice_dedup_hashes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    content_hash VARCHAR(64) NOT NULL,
    duplicate_count INT DEFAULT 0,
    duplicate_invoice_ids UUID[] DEFAULT ARRAY[]::uuid[],
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_invoice_dedup_hashes_org_id ON invoice_dedup_hashes(org_id);
CREATE INDEX idx_invoice_dedup_hashes_content_hash ON invoice_dedup_hashes(content_hash);
CREATE INDEX idx_invoice_dedup_hashes_invoice_id ON invoice_dedup_hashes(invoice_id);

ALTER TABLE invoice_dedup_hashes ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoice_dedup_hashes_org_policy ON invoice_dedup_hashes
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 6. INVOICE_ANOMALIES (Pre-reconciliation anomalies)
-- ============================================================================
CREATE TABLE invoice_anomalies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    anomaly_type VARCHAR(100) NOT NULL,
    severity VARCHAR(50) NOT NULL,
    description TEXT,
    flags JSONB,
    reviewed BOOLEAN DEFAULT FALSE,
    resolved BOOLEAN DEFAULT FALSE,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_invoice_anomalies_org_id ON invoice_anomalies(org_id);
CREATE INDEX idx_invoice_anomalies_invoice_id ON invoice_anomalies(invoice_id);
CREATE INDEX idx_invoice_anomalies_severity ON invoice_anomalies(severity);
CREATE INDEX idx_invoice_anomalies_reviewed ON invoice_anomalies(reviewed);

ALTER TABLE invoice_anomalies ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoice_anomalies_org_policy ON invoice_anomalies
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 7. CONTRACT_TERMS (Contract rate storage)
-- ============================================================================
CREATE TABLE contract_terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    term_type VARCHAR(100) NOT NULL,
    rate_type VARCHAR(50),
    base_rate DECIMAL(15, 6),
    volume_threshold DECIMAL(15, 2),
    discount_percentage DECIMAL(5, 2),
    effective_date DATE NOT NULL,
    expiration_date DATE,
    term_data JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_contract_terms_org_id ON contract_terms(org_id);
CREATE INDEX idx_contract_terms_provider_id ON contract_terms(provider_id);
CREATE INDEX idx_contract_terms_contract_id ON contract_terms(contract_id);
CREATE INDEX idx_contract_terms_effective_date ON contract_terms(effective_date);

ALTER TABLE contract_terms ENABLE ROW LEVEL SECURITY;
CREATE POLICY contract_terms_org_policy ON contract_terms
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 8. ALLOCATION_SIMULATIONS (What-if scenarios)
-- ============================================================================
CREATE TABLE allocation_simulations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    scenario_type VARCHAR(100) NOT NULL,
    base_allocation JSONB NOT NULL,
    simulated_allocation JSONB NOT NULL,
    variance JSONB,
    impact_metrics JSONB,
    status VARCHAR(50) DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_allocation_simulations_org_id ON allocation_simulations(org_id);
CREATE INDEX idx_allocation_simulations_status ON allocation_simulations(status);
CREATE INDEX idx_allocation_simulations_created_at ON allocation_simulations(created_at);

ALTER TABLE allocation_simulations ENABLE ROW LEVEL SECURITY;
CREATE POLICY allocation_simulations_org_policy ON allocation_simulations
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 9. CHARGEBACK_JOURNAL_ENTRIES (ERP journal entries)
-- ============================================================================
CREATE TABLE chargeback_journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    chargeback_id UUID NOT NULL REFERENCES chargebacks(id) ON DELETE CASCADE,
    journal_batch_id VARCHAR(100),
    account_number VARCHAR(20) NOT NULL,
    debit_amount DECIMAL(15, 2),
    credit_amount DECIMAL(15, 2),
    entry_description TEXT,
    posting_date DATE NOT NULL,
    posting_status VARCHAR(50) DEFAULT 'pending',
    gl_reference VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chargeback_journal_entries_org_id ON chargeback_journal_entries(org_id);
CREATE INDEX idx_chargeback_journal_entries_chargeback_id ON chargeback_journal_entries(chargeback_id);
CREATE INDEX idx_chargeback_journal_entries_posting_date ON chargeback_journal_entries(posting_date);
CREATE INDEX idx_chargeback_journal_entries_status ON chargeback_journal_entries(posting_status);

ALTER TABLE chargeback_journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY chargeback_journal_entries_org_policy ON chargeback_journal_entries
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 10. ML_ALLOCATION_PATTERNS (ML learned patterns)
-- ============================================================================
CREATE TABLE ml_allocation_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    pattern_name VARCHAR(255) NOT NULL,
    pattern_type VARCHAR(100) NOT NULL,
    model_version VARCHAR(50),
    feature_vector VECTOR(512),
    pattern_coefficients JSONB,
    confidence_score DECIMAL(5, 4),
    training_samples INT,
    last_training_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ml_allocation_patterns_org_id ON ml_allocation_patterns(org_id);
CREATE INDEX idx_ml_allocation_patterns_pattern_type ON ml_allocation_patterns(pattern_type);
CREATE INDEX idx_ml_allocation_patterns_confidence ON ml_allocation_patterns(confidence_score);

ALTER TABLE ml_allocation_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY ml_allocation_patterns_org_policy ON ml_allocation_patterns
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 11. CLOSE_PACK_SHARES (Auditor share links)
-- ============================================================================
CREATE TABLE close_pack_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    close_pack_id UUID NOT NULL REFERENCES close_packs(id) ON DELETE CASCADE,
    share_token VARCHAR(128) NOT NULL UNIQUE,
    auditor_email VARCHAR(255),
    share_type VARCHAR(50) NOT NULL,
    permissions JSONB,
    access_count INT DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_close_pack_shares_org_id ON close_pack_shares(org_id);
CREATE INDEX idx_close_pack_shares_close_pack_id ON close_pack_shares(close_pack_id);
CREATE INDEX idx_close_pack_shares_share_token ON close_pack_shares(share_token);
CREATE INDEX idx_close_pack_shares_expires_at ON close_pack_shares(expires_at);

ALTER TABLE close_pack_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY close_pack_shares_org_policy ON close_pack_shares
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 12. CLOSE_PACK_COMPARISONS (Period comparisons)
-- ============================================================================
CREATE TABLE close_pack_comparisons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    close_pack_id UUID NOT NULL REFERENCES close_packs(id) ON DELETE CASCADE,
    comparison_period VARCHAR(50) NOT NULL,
    metrics JSONB NOT NULL,
    variances JSONB,
    variance_explanation TEXT,
    reviewed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_close_pack_comparisons_org_id ON close_pack_comparisons(org_id);
CREATE INDEX idx_close_pack_comparisons_close_pack_id ON close_pack_comparisons(close_pack_id);
CREATE INDEX idx_close_pack_comparisons_comparison_period ON close_pack_comparisons(comparison_period);

ALTER TABLE close_pack_comparisons ENABLE ROW LEVEL SECURITY;
CREATE POLICY close_pack_comparisons_org_policy ON close_pack_comparisons
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 13. REGULATORY_CERTIFICATIONS (SOX/EU AI Act certs)
-- ============================================================================
CREATE TABLE regulatory_certifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    certification_type VARCHAR(100) NOT NULL,
    standard_name VARCHAR(255) NOT NULL,
    issuing_body VARCHAR(255),
    certification_date DATE,
    expiration_date DATE,
    compliance_level VARCHAR(50),
    certificate_document_url TEXT,
    audit_trail JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_regulatory_certifications_org_id ON regulatory_certifications(org_id);
CREATE INDEX idx_regulatory_certifications_certification_type ON regulatory_certifications(certification_type);
CREATE INDEX idx_regulatory_certifications_expiration_date ON regulatory_certifications(expiration_date);

ALTER TABLE regulatory_certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY regulatory_certifications_org_policy ON regulatory_certifications
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 14. FCS_SCORES (Confidence Score history)
-- ============================================================================
CREATE TABLE fcs_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    fcs_value DECIMAL(5, 4) NOT NULL,
    fcs_components JSONB NOT NULL,
    confidence_level VARCHAR(50),
    computation_method VARCHAR(100),
    is_final BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_fcs_scores_org_id ON fcs_scores(org_id);
CREATE INDEX idx_fcs_scores_invoice_id ON fcs_scores(invoice_id);
CREATE INDEX idx_fcs_scores_created_at ON fcs_scores(created_at);
CREATE INDEX idx_fcs_scores_is_final ON fcs_scores(is_final);

ALTER TABLE fcs_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY fcs_scores_org_policy ON fcs_scores
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 15. RECONCILIATION_EXCEPTIONS (Exception workflow)
-- ============================================================================
CREATE TABLE reconciliation_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    exception_type VARCHAR(100) NOT NULL,
    severity VARCHAR(50) NOT NULL,
    description TEXT,
    exception_data JSONB,
    workflow_status VARCHAR(50) DEFAULT 'open',
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    resolution_date TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_reconciliation_exceptions_org_id ON reconciliation_exceptions(org_id);
CREATE INDEX idx_reconciliation_exceptions_invoice_id ON reconciliation_exceptions(invoice_id);
CREATE INDEX idx_reconciliation_exceptions_workflow_status ON reconciliation_exceptions(workflow_status);
CREATE INDEX idx_reconciliation_exceptions_severity ON reconciliation_exceptions(severity);

ALTER TABLE reconciliation_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY reconciliation_exceptions_org_policy ON reconciliation_exceptions
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 16. CONTINUOUS_RECON_STREAM (Streaming recon)
-- ============================================================================
CREATE TABLE continuous_recon_stream (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    stream_batch_id VARCHAR(100) NOT NULL,
    stream_type VARCHAR(50) NOT NULL,
    event_data JSONB NOT NULL,
    reconciliation_status VARCHAR(50) DEFAULT 'pending',
    processing_lag_ms INT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_continuous_recon_stream_org_id ON continuous_recon_stream(org_id);
CREATE INDEX idx_continuous_recon_stream_stream_batch_id ON continuous_recon_stream(stream_batch_id);
CREATE INDEX idx_continuous_recon_stream_created_at ON continuous_recon_stream(created_at);
CREATE INDEX idx_continuous_recon_stream_reconciliation_status ON continuous_recon_stream(reconciliation_status);

ALTER TABLE continuous_recon_stream ENABLE ROW LEVEL SECURITY;
CREATE POLICY continuous_recon_stream_org_policy ON continuous_recon_stream
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 17. ANOMALY_PATTERNS (Pattern library)
-- ============================================================================
CREATE TABLE anomaly_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    pattern_name VARCHAR(255) NOT NULL,
    pattern_category VARCHAR(100) NOT NULL,
    pattern_definition JSONB NOT NULL,
    detection_threshold DECIMAL(5, 4),
    severity_level VARCHAR(50),
    false_positive_rate DECIMAL(5, 4),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_anomaly_patterns_org_id ON anomaly_patterns(org_id);
CREATE INDEX idx_anomaly_patterns_category ON anomaly_patterns(pattern_category);
CREATE INDEX idx_anomaly_patterns_active ON anomaly_patterns(active);

ALTER TABLE anomaly_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY anomaly_patterns_org_policy ON anomaly_patterns
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 18. ANOMALY_PLAYBOOK_RUNS (Playbook execution log)
-- ============================================================================
CREATE TABLE anomaly_playbook_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    anomaly_id UUID REFERENCES invoice_anomalies(id) ON DELETE CASCADE,
    playbook_name VARCHAR(255) NOT NULL,
    playbook_version VARCHAR(50),
    execution_status VARCHAR(50) NOT NULL,
    actions_executed JSONB,
    results JSONB,
    execution_time_ms INT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_anomaly_playbook_runs_org_id ON anomaly_playbook_runs(org_id);
CREATE INDEX idx_anomaly_playbook_runs_anomaly_id ON anomaly_playbook_runs(anomaly_id);
CREATE INDEX idx_anomaly_playbook_runs_execution_status ON anomaly_playbook_runs(execution_status);
CREATE INDEX idx_anomaly_playbook_runs_created_at ON anomaly_playbook_runs(created_at);

ALTER TABLE anomaly_playbook_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY anomaly_playbook_runs_org_policy ON anomaly_playbook_runs
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 19. BUDGET_SCENARIOS (What-if scenarios)
-- ============================================================================
CREATE TABLE budget_scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    scenario_name VARCHAR(255) NOT NULL,
    scenario_type VARCHAR(100) NOT NULL,
    assumptions JSONB NOT NULL,
    projected_spend DECIMAL(15, 2),
    variance_from_budget DECIMAL(15, 2),
    confidence_level VARCHAR(50),
    status VARCHAR(50) DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_budget_scenarios_org_id ON budget_scenarios(org_id);
CREATE INDEX idx_budget_scenarios_budget_id ON budget_scenarios(budget_id);
CREATE INDEX idx_budget_scenarios_status ON budget_scenarios(status);

ALTER TABLE budget_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY budget_scenarios_org_policy ON budget_scenarios
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 20. BUDGET_REALLOCATIONS (Transfer tracking)
-- ============================================================================
CREATE TABLE budget_reallocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    source_allocation_id UUID,
    target_allocation_id UUID,
    amount DECIMAL(15, 2) NOT NULL,
    reallocation_reason TEXT,
    approval_status VARCHAR(50) DEFAULT 'pending',
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approval_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_budget_reallocations_org_id ON budget_reallocations(org_id);
CREATE INDEX idx_budget_reallocations_budget_id ON budget_reallocations(budget_id);
CREATE INDEX idx_budget_reallocations_approval_status ON budget_reallocations(approval_status);

ALTER TABLE budget_reallocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY budget_reallocations_org_policy ON budget_reallocations
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 21. BUDGET_COMPLIANCE_SCORES (Team scoring)
-- ============================================================================
CREATE TABLE budget_compliance_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    team_id UUID NOT NULL,
    compliance_period DATE NOT NULL,
    compliance_score DECIMAL(5, 2),
    variance_ratio DECIMAL(5, 4),
    policies_complied INT,
    policies_violated INT,
    remediation_status VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_budget_compliance_scores_org_id ON budget_compliance_scores(org_id);
CREATE INDEX idx_budget_compliance_scores_team_id ON budget_compliance_scores(team_id);
CREATE INDEX idx_budget_compliance_scores_compliance_period ON budget_compliance_scores(compliance_period);

ALTER TABLE budget_compliance_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY budget_compliance_scores_org_policy ON budget_compliance_scores
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 22. DISPUTE_EVIDENCE_PACKAGES (Evidence locker)
-- ============================================================================
CREATE TABLE dispute_evidence_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
    evidence_type VARCHAR(100) NOT NULL,
    evidence_file_path TEXT,
    evidence_content JSONB,
    checksum VARCHAR(64),
    chain_of_custody JSONB,
    evidence_status VARCHAR(50) DEFAULT 'collected',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dispute_evidence_packages_org_id ON dispute_evidence_packages(org_id);
CREATE INDEX idx_dispute_evidence_packages_dispute_id ON dispute_evidence_packages(dispute_id);
CREATE INDEX idx_dispute_evidence_packages_evidence_type ON dispute_evidence_packages(evidence_type);

ALTER TABLE dispute_evidence_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY dispute_evidence_packages_org_policy ON dispute_evidence_packages
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 23. DISPUTE_PREDICTIONS (ML predictions)
-- ============================================================================
CREATE TABLE dispute_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
    prediction_type VARCHAR(100) NOT NULL,
    win_probability DECIMAL(5, 4),
    loss_probability DECIMAL(5, 4),
    most_likely_outcome VARCHAR(100),
    prediction_confidence DECIMAL(5, 4),
    key_factors JSONB,
    recommended_action TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dispute_predictions_org_id ON dispute_predictions(org_id);
CREATE INDEX idx_dispute_predictions_dispute_id ON dispute_predictions(dispute_id);
CREATE INDEX idx_dispute_predictions_created_at ON dispute_predictions(created_at);

ALTER TABLE dispute_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY dispute_predictions_org_policy ON dispute_predictions
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 24. DISPUTE_ANALYTICS (Provider analytics)
-- ============================================================================
CREATE TABLE dispute_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    analytics_period DATE NOT NULL,
    total_disputes INT DEFAULT 0,
    resolved_disputes INT DEFAULT 0,
    pending_disputes INT DEFAULT 0,
    average_resolution_days DECIMAL(10, 2),
    win_rate DECIMAL(5, 4),
    total_amount_disputed DECIMAL(15, 2),
    total_amount_recovered DECIMAL(15, 2),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dispute_analytics_org_id ON dispute_analytics(org_id);
CREATE INDEX idx_dispute_analytics_provider_id ON dispute_analytics(provider_id);
CREATE INDEX idx_dispute_analytics_analytics_period ON dispute_analytics(analytics_period);

ALTER TABLE dispute_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY dispute_analytics_org_policy ON dispute_analytics
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 25. SHADOW_EXPENSE_FINDINGS (Expense report discoveries)
-- ============================================================================
CREATE TABLE shadow_expense_findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    finding_type VARCHAR(100) NOT NULL,
    expense_category VARCHAR(100),
    amount DECIMAL(15, 2),
    risk_level VARCHAR(50),
    description TEXT,
    evidence JSONB,
    status VARCHAR(50) DEFAULT 'open',
    resolution_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_shadow_expense_findings_org_id ON shadow_expense_findings(org_id);
CREATE INDEX idx_shadow_expense_findings_finding_type ON shadow_expense_findings(finding_type);
CREATE INDEX idx_shadow_expense_findings_risk_level ON shadow_expense_findings(risk_level);
CREATE INDEX idx_shadow_expense_findings_status ON shadow_expense_findings(status);

ALTER TABLE shadow_expense_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY shadow_expense_findings_org_policy ON shadow_expense_findings
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 26. SHADOW_NETWORK_FINDINGS (Network traffic discoveries)
-- ============================================================================
CREATE TABLE shadow_network_findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    finding_type VARCHAR(100) NOT NULL,
    network_service VARCHAR(255),
    traffic_volume_bytes BIGINT,
    risk_level VARCHAR(50),
    description TEXT,
    indicators JSONB,
    status VARCHAR(50) DEFAULT 'open',
    remediation_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_shadow_network_findings_org_id ON shadow_network_findings(org_id);
CREATE INDEX idx_shadow_network_findings_finding_type ON shadow_network_findings(finding_type);
CREATE INDEX idx_shadow_network_findings_risk_level ON shadow_network_findings(risk_level);

ALTER TABLE shadow_network_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY shadow_network_findings_org_policy ON shadow_network_findings
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 27. SHADOW_BOT_FINDINGS (Workspace bot discoveries)
-- ============================================================================
CREATE TABLE shadow_bot_findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    finding_type VARCHAR(100) NOT NULL,
    bot_name VARCHAR(255),
    bot_provider VARCHAR(100),
    usage_frequency INT,
    risk_level VARCHAR(50),
    capabilities TEXT,
    access_permissions JSONB,
    status VARCHAR(50) DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_shadow_bot_findings_org_id ON shadow_bot_findings(org_id);
CREATE INDEX idx_shadow_bot_findings_finding_type ON shadow_bot_findings(finding_type);
CREATE INDEX idx_shadow_bot_findings_risk_level ON shadow_bot_findings(risk_level);

ALTER TABLE shadow_bot_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY shadow_bot_findings_org_policy ON shadow_bot_findings
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 28. SHADOW_CODE_FINDINGS (Code assistant discoveries)
-- ============================================================================
CREATE TABLE shadow_code_findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    finding_type VARCHAR(100) NOT NULL,
    code_assistant VARCHAR(255),
    usage_count INT,
    risk_level VARCHAR(50),
    code_exposed_patterns TEXT,
    recommendations TEXT,
    status VARCHAR(50) DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_shadow_code_findings_org_id ON shadow_code_findings(org_id);
CREATE INDEX idx_shadow_code_findings_finding_type ON shadow_code_findings(finding_type);
CREATE INDEX idx_shadow_code_findings_risk_level ON shadow_code_findings(risk_level);

ALTER TABLE shadow_code_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY shadow_code_findings_org_policy ON shadow_code_findings
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 29. SHADOW_RISK_SCORES (Risk matrix scores)
-- ============================================================================
CREATE TABLE shadow_risk_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    assessment_date DATE NOT NULL,
    expense_risk_score DECIMAL(5, 2),
    network_risk_score DECIMAL(5, 2),
    bot_risk_score DECIMAL(5, 2),
    code_risk_score DECIMAL(5, 2),
    overall_risk_score DECIMAL(5, 2),
    risk_trends JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_shadow_risk_scores_org_id ON shadow_risk_scores(org_id);
CREATE INDEX idx_shadow_risk_scores_assessment_date ON shadow_risk_scores(assessment_date);

ALTER TABLE shadow_risk_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY shadow_risk_scores_org_policy ON shadow_risk_scores
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 30. SHADOW_MIGRATION_LOG (Migration tracking)
-- ============================================================================
CREATE TABLE shadow_migration_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    migration_type VARCHAR(100) NOT NULL,
    source_system VARCHAR(255),
    target_system VARCHAR(255),
    records_migrated INT,
    status VARCHAR(50) DEFAULT 'pending',
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    error_log TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_shadow_migration_log_org_id ON shadow_migration_log(org_id);
CREATE INDEX idx_shadow_migration_log_status ON shadow_migration_log(status);
CREATE INDEX idx_shadow_migration_log_created_at ON shadow_migration_log(created_at);

ALTER TABLE shadow_migration_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY shadow_migration_log_org_policy ON shadow_migration_log
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 31. COMPLIANCE_CONTROLS (230+ control definitions)
-- ============================================================================
CREATE TABLE compliance_controls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    control_id VARCHAR(50) NOT NULL UNIQUE,
    control_name VARCHAR(255) NOT NULL,
    control_category VARCHAR(100) NOT NULL,
    control_objective TEXT,
    framework VARCHAR(100),
    severity VARCHAR(50),
    frequency VARCHAR(50),
    description TEXT,
    implementation_guide TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_compliance_controls_org_id ON compliance_controls(org_id);
CREATE INDEX idx_compliance_controls_control_id ON compliance_controls(control_id);
CREATE INDEX idx_compliance_controls_category ON compliance_controls(control_category);
CREATE INDEX idx_compliance_controls_framework ON compliance_controls(framework);

ALTER TABLE compliance_controls ENABLE ROW LEVEL SECURITY;
CREATE POLICY compliance_controls_org_policy ON compliance_controls
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 32. COMPLIANCE_TEST_RESULTS (Continuous testing)
-- ============================================================================
CREATE TABLE compliance_test_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    control_id UUID NOT NULL REFERENCES compliance_controls(id) ON DELETE CASCADE,
    test_date DATE NOT NULL,
    test_status VARCHAR(50) NOT NULL,
    evidence JSONB,
    findings TEXT,
    remediation_required BOOLEAN DEFAULT FALSE,
    remediation_plan TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_compliance_test_results_org_id ON compliance_test_results(org_id);
CREATE INDEX idx_compliance_test_results_control_id ON compliance_test_results(control_id);
CREATE INDEX idx_compliance_test_results_test_date ON compliance_test_results(test_date);
CREATE INDEX idx_compliance_test_results_test_status ON compliance_test_results(test_status);

ALTER TABLE compliance_test_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY compliance_test_results_org_policy ON compliance_test_results
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 33. COMPLIANCE_POLICIES (YAML policy storage)
-- ============================================================================
CREATE TABLE compliance_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    policy_name VARCHAR(255) NOT NULL,
    policy_version VARCHAR(50),
    policy_content TEXT NOT NULL,
    framework VARCHAR(100),
    effective_date DATE,
    expiration_date DATE,
    approval_status VARCHAR(50) DEFAULT 'draft',
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_compliance_policies_org_id ON compliance_policies(org_id);
CREATE INDEX idx_compliance_policies_framework ON compliance_policies(framework);
CREATE INDEX idx_compliance_policies_approval_status ON compliance_policies(approval_status);

ALTER TABLE compliance_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY compliance_policies_org_policy ON compliance_policies
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 34. AUDITOR_SESSIONS (Auditor portal access)
-- ============================================================================
CREATE TABLE auditor_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    auditor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(256) NOT NULL UNIQUE,
    session_start TIMESTAMPTZ NOT NULL,
    session_end TIMESTAMPTZ,
    actions_logged JSONB,
    data_accessed JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_auditor_sessions_org_id ON auditor_sessions(org_id);
CREATE INDEX idx_auditor_sessions_auditor_id ON auditor_sessions(auditor_id);
CREATE INDEX idx_auditor_sessions_session_token ON auditor_sessions(session_token);
CREATE INDEX idx_auditor_sessions_session_start ON auditor_sessions(session_start);

ALTER TABLE auditor_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY auditor_sessions_org_policy ON auditor_sessions
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 35. REGULATORY_CHANGES (Regulation monitoring)
-- ============================================================================
CREATE TABLE regulatory_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    change_type VARCHAR(100) NOT NULL,
    regulation_name VARCHAR(255) NOT NULL,
    jurisdiction VARCHAR(100),
    change_summary TEXT NOT NULL,
    effective_date DATE NOT NULL,
    impact_assessment TEXT,
    required_actions TEXT,
    status VARCHAR(50) DEFAULT 'pending_review',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_regulatory_changes_org_id ON regulatory_changes(org_id);
CREATE INDEX idx_regulatory_changes_change_type ON regulatory_changes(change_type);
CREATE INDEX idx_regulatory_changes_effective_date ON regulatory_changes(effective_date);
CREATE INDEX idx_regulatory_changes_status ON regulatory_changes(status);

ALTER TABLE regulatory_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY regulatory_changes_org_policy ON regulatory_changes
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 36. ERP_POSTING_AUDIT (Journal posting log)
-- ============================================================================
CREATE TABLE erp_posting_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    posting_id VARCHAR(100) NOT NULL,
    posting_date DATE NOT NULL,
    gl_account VARCHAR(20) NOT NULL,
    posting_amount DECIMAL(15, 2) NOT NULL,
    posting_type VARCHAR(50),
    posting_status VARCHAR(50) DEFAULT 'pending',
    approval_chain JSONB,
    posting_result JSONB,
    error_log TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_erp_posting_audit_org_id ON erp_posting_audit(org_id);
CREATE INDEX idx_erp_posting_audit_posting_id ON erp_posting_audit(posting_id);
CREATE INDEX idx_erp_posting_audit_posting_date ON erp_posting_audit(posting_date);
CREATE INDEX idx_erp_posting_audit_posting_status ON erp_posting_audit(posting_status);

ALTER TABLE erp_posting_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY erp_posting_audit_org_policy ON erp_posting_audit
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 37. ERP_GL_PULLBACK (GL read-back cache)
-- ============================================================================
CREATE TABLE erp_gl_pullback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    gl_account VARCHAR(20) NOT NULL,
    gl_description VARCHAR(255),
    period_end_date DATE NOT NULL,
    beginning_balance DECIMAL(15, 2),
    period_debits DECIMAL(15, 2),
    period_credits DECIMAL(15, 2),
    ending_balance DECIMAL(15, 2),
    last_sync_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_erp_gl_pullback_org_id ON erp_gl_pullback(org_id);
CREATE INDEX idx_erp_gl_pullback_gl_account ON erp_gl_pullback(gl_account);
CREATE INDEX idx_erp_gl_pullback_period_end_date ON erp_gl_pullback(period_end_date);

ALTER TABLE erp_gl_pullback ENABLE ROW LEVEL SECURITY;
CREATE POLICY erp_gl_pullback_org_policy ON erp_gl_pullback
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 38. ERP_VARIANCES (Detected variances)
-- ============================================================================
CREATE TABLE erp_variances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    variance_type VARCHAR(100) NOT NULL,
    affected_gl_account VARCHAR(20),
    expected_amount DECIMAL(15, 2),
    actual_amount DECIMAL(15, 2),
    variance_amount DECIMAL(15, 2),
    variance_percentage DECIMAL(10, 4),
    variance_date DATE,
    investigation_status VARCHAR(50) DEFAULT 'open',
    investigation_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_erp_variances_org_id ON erp_variances(org_id);
CREATE INDEX idx_erp_variances_variance_type ON erp_variances(variance_type);
CREATE INDEX idx_erp_variances_investigation_status ON erp_variances(investigation_status);

ALTER TABLE erp_variances ENABLE ROW LEVEL SECURITY;
CREATE POLICY erp_variances_org_policy ON erp_variances
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 39. ERP_HEALTH_METRICS (ERP health monitoring)
-- ============================================================================
CREATE TABLE erp_health_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    metric_name VARCHAR(255) NOT NULL,
    metric_value DECIMAL(15, 4),
    metric_unit VARCHAR(50),
    health_status VARCHAR(50),
    threshold_warning DECIMAL(15, 4),
    threshold_critical DECIMAL(15, 4),
    measurement_time TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_erp_health_metrics_org_id ON erp_health_metrics(org_id);
CREATE INDEX idx_erp_health_metrics_metric_name ON erp_health_metrics(metric_name);
CREATE INDEX idx_erp_health_metrics_measurement_time ON erp_health_metrics(measurement_time);
CREATE INDEX idx_erp_health_metrics_health_status ON erp_health_metrics(health_status);

ALTER TABLE erp_health_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY erp_health_metrics_org_policy ON erp_health_metrics
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 40. ANALYTICS_BENCHMARKS (Cross-customer benchmarks)
-- ============================================================================
CREATE TABLE analytics_benchmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    benchmark_type VARCHAR(100) NOT NULL,
    benchmark_period DATE NOT NULL,
    metric_name VARCHAR(255),
    percentile_10 DECIMAL(15, 4),
    percentile_25 DECIMAL(15, 4),
    percentile_50 DECIMAL(15, 4),
    percentile_75 DECIMAL(15, 4),
    percentile_90 DECIMAL(15, 4),
    customer_sample_size INT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_analytics_benchmarks_org_id ON analytics_benchmarks(org_id);
CREATE INDEX idx_analytics_benchmarks_benchmark_type ON analytics_benchmarks(benchmark_type);
CREATE INDEX idx_analytics_benchmarks_benchmark_period ON analytics_benchmarks(benchmark_period);

ALTER TABLE analytics_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY analytics_benchmarks_org_policy ON analytics_benchmarks
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 41. BOARD_REPORTS (Generated reports)
-- ============================================================================
CREATE TABLE board_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    report_name VARCHAR(255) NOT NULL,
    report_type VARCHAR(100) NOT NULL,
    report_period DATE NOT NULL,
    report_content JSONB NOT NULL,
    executive_summary TEXT,
    key_findings TEXT,
    recommendations TEXT,
    report_status VARCHAR(50) DEFAULT 'draft',
    approval_chain JSONB,
    distribution_list TEXT[],
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_board_reports_org_id ON board_reports(org_id);
CREATE INDEX idx_board_reports_report_type ON board_reports(report_type);
CREATE INDEX idx_board_reports_report_period ON board_reports(report_period);
CREATE INDEX idx_board_reports_report_status ON board_reports(report_status);

ALTER TABLE board_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY board_reports_org_policy ON board_reports
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 42. NL_QUERY_LOG (Natural language analytics)
-- ============================================================================
CREATE TABLE nl_query_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    natural_language_query TEXT NOT NULL,
    parsed_query JSONB,
    query_result JSONB,
    execution_time_ms INT,
    result_accuracy_score DECIMAL(5, 4),
    feedback_score INT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_nl_query_log_org_id ON nl_query_log(org_id);
CREATE INDEX idx_nl_query_log_user_id ON nl_query_log(user_id);
CREATE INDEX idx_nl_query_log_created_at ON nl_query_log(created_at);

ALTER TABLE nl_query_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY nl_query_log_org_policy ON nl_query_log
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 43. MOBILE_PUSH_QUEUE (Mobile notifications)
-- ============================================================================
CREATE TABLE mobile_push_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_token VARCHAR(255) NOT NULL,
    message_title VARCHAR(255),
    message_body TEXT,
    message_data JSONB,
    notification_type VARCHAR(100),
    priority VARCHAR(50) DEFAULT 'normal',
    send_status VARCHAR(50) DEFAULT 'pending',
    sent_at TIMESTAMPTZ,
    delivery_result JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_mobile_push_queue_org_id ON mobile_push_queue(org_id);
CREATE INDEX idx_mobile_push_queue_user_id ON mobile_push_queue(user_id);
CREATE INDEX idx_mobile_push_queue_send_status ON mobile_push_queue(send_status);
CREATE INDEX idx_mobile_push_queue_created_at ON mobile_push_queue(created_at);

ALTER TABLE mobile_push_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY mobile_push_queue_org_policy ON mobile_push_queue
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 44. AGENT_PERFORMANCE (Leaderboard metrics)
-- ============================================================================
CREATE TABLE agent_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    performance_period DATE NOT NULL,
    tasks_completed INT DEFAULT 0,
    average_resolution_time_minutes INT,
    accuracy_score DECIMAL(5, 4),
    customer_satisfaction_score DECIMAL(5, 2),
    exceptions_handled INT DEFAULT 0,
    performance_tier VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agent_performance_org_id ON agent_performance(org_id);
CREATE INDEX idx_agent_performance_user_id ON agent_performance(user_id);
CREATE INDEX idx_agent_performance_performance_period ON agent_performance(performance_period);
CREATE INDEX idx_agent_performance_performance_tier ON agent_performance(performance_tier);

ALTER TABLE agent_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_performance_org_policy ON agent_performance
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 45. TENANT_RESOURCE_USAGE (Cost-to-serve tracking)
-- ============================================================================
CREATE TABLE tenant_resource_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    usage_period DATE NOT NULL,
    api_calls_count BIGINT DEFAULT 0,
    storage_bytes BIGINT DEFAULT 0,
    compute_minutes INT DEFAULT 0,
    database_queries BIGINT DEFAULT 0,
    estimated_cost DECIMAL(15, 2),
    cost_per_api_call DECIMAL(10, 6),
    cost_per_gb_storage DECIMAL(10, 6),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tenant_resource_usage_org_id ON tenant_resource_usage(org_id);
CREATE INDEX idx_tenant_resource_usage_usage_period ON tenant_resource_usage(usage_period);

ALTER TABLE tenant_resource_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_resource_usage_org_policy ON tenant_resource_usage
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 46. MCP_TOOL_EXECUTIONS (MCP usage tracking)
-- ============================================================================
CREATE TABLE mcp_tool_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tool_name VARCHAR(255) NOT NULL,
    tool_version VARCHAR(50),
    execution_input JSONB,
    execution_output JSONB,
    execution_status VARCHAR(50) NOT NULL,
    execution_time_ms INT,
    error_message TEXT,
    token_usage INT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_mcp_tool_executions_org_id ON mcp_tool_executions(org_id);
CREATE INDEX idx_mcp_tool_executions_user_id ON mcp_tool_executions(user_id);
CREATE INDEX idx_mcp_tool_executions_tool_name ON mcp_tool_executions(tool_name);
CREATE INDEX idx_mcp_tool_executions_created_at ON mcp_tool_executions(created_at);
CREATE INDEX idx_mcp_tool_executions_execution_status ON mcp_tool_executions(execution_status);

ALTER TABLE mcp_tool_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY mcp_tool_executions_org_policy ON mcp_tool_executions
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- 47. SDK_API_KEYS (SDK authentication)
-- ============================================================================
CREATE TABLE sdk_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    key_name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(64) NOT NULL UNIQUE,
    key_prefix VARCHAR(10),
    sdk_version VARCHAR(50),
    environment VARCHAR(50),
    permissions JSONB,
    rate_limit_per_minute INT DEFAULT 1000,
    last_used_at TIMESTAMPTZ,
    ip_whitelist TEXT[],
    active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sdk_api_keys_org_id ON sdk_api_keys(org_id);
CREATE INDEX idx_sdk_api_keys_key_hash ON sdk_api_keys(key_hash);
CREATE INDEX idx_sdk_api_keys_active ON sdk_api_keys(active);
CREATE INDEX idx_sdk_api_keys_expires_at ON sdk_api_keys(expires_at);

ALTER TABLE sdk_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY sdk_api_keys_org_policy ON sdk_api_keys
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- ============================================================================
-- Grant permissions to authenticated users
-- ============================================================================
GRANT SELECT, INSERT, UPDATE ON semantic_cache TO authenticated;
GRANT SELECT, INSERT, UPDATE ON ab_experiments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON sla_metrics TO authenticated;
GRANT SELECT, INSERT, UPDATE ON prompt_shield_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON invoice_dedup_hashes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON invoice_anomalies TO authenticated;
GRANT SELECT, INSERT, UPDATE ON contract_terms TO authenticated;
GRANT SELECT, INSERT, UPDATE ON allocation_simulations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON chargeback_journal_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE ON ml_allocation_patterns TO authenticated;
GRANT SELECT, INSERT, UPDATE ON close_pack_shares TO authenticated;
GRANT SELECT, INSERT, UPDATE ON close_pack_comparisons TO authenticated;
GRANT SELECT, INSERT, UPDATE ON regulatory_certifications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON fcs_scores TO authenticated;
GRANT SELECT, INSERT, UPDATE ON reconciliation_exceptions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON continuous_recon_stream TO authenticated;
GRANT SELECT, INSERT, UPDATE ON anomaly_patterns TO authenticated;
GRANT SELECT, INSERT, UPDATE ON anomaly_playbook_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON budget_scenarios TO authenticated;
GRANT SELECT, INSERT, UPDATE ON budget_reallocations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON budget_compliance_scores TO authenticated;
GRANT SELECT, INSERT, UPDATE ON dispute_evidence_packages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON dispute_predictions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON dispute_analytics TO authenticated;
GRANT SELECT, INSERT, UPDATE ON shadow_expense_findings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON shadow_network_findings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON shadow_bot_findings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON shadow_code_findings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON shadow_risk_scores TO authenticated;
GRANT SELECT, INSERT, UPDATE ON shadow_migration_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON compliance_controls TO authenticated;
GRANT SELECT, INSERT, UPDATE ON compliance_test_results TO authenticated;
GRANT SELECT, INSERT, UPDATE ON compliance_policies TO authenticated;
GRANT SELECT, INSERT, UPDATE ON auditor_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON regulatory_changes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON erp_posting_audit TO authenticated;
GRANT SELECT, INSERT, UPDATE ON erp_gl_pullback TO authenticated;
GRANT SELECT, INSERT, UPDATE ON erp_variances TO authenticated;
GRANT SELECT, INSERT, UPDATE ON erp_health_metrics TO authenticated;
GRANT SELECT, INSERT, UPDATE ON analytics_benchmarks TO authenticated;
GRANT SELECT, INSERT, UPDATE ON board_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE ON nl_query_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON mobile_push_queue TO authenticated;
GRANT SELECT, INSERT, UPDATE ON agent_performance TO authenticated;
GRANT SELECT, INSERT, UPDATE ON tenant_resource_usage TO authenticated;
GRANT SELECT, INSERT, UPDATE ON mcp_tool_executions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON sdk_api_keys TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- DIAMOND TIER GAP FIX: 11 MISSING TABLES
-- Modules reference these tables via Supabase REST API but they weren't in the
-- original migration. Added to close the schema/code gap.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ERP Module: posting receipt tracking
CREATE TABLE posting_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  journal_entry_id UUID REFERENCES chargeback_journal_entries(id),
  erp_system TEXT NOT NULL,
  posting_status TEXT NOT NULL DEFAULT 'pending',
  erp_confirmation_id TEXT,
  posted_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_posting_receipts_org ON posting_receipts(org_id);
CREATE INDEX idx_posting_receipts_status ON posting_receipts(posting_status);
ALTER TABLE posting_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY posting_receipts_org_isolation ON posting_receipts
  USING (org_id = auth.uid());

-- ERP Module: link ERP postings to GL accounts
CREATE TABLE reconciliation_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  posting_receipt_id UUID REFERENCES posting_receipts(id),
  gl_account TEXT NOT NULL,
  erp_system TEXT NOT NULL,
  finault_amount NUMERIC(15,4) NOT NULL,
  erp_amount NUMERIC(15,4),
  variance_amount NUMERIC(15,4),
  match_status TEXT NOT NULL DEFAULT 'pending',
  reconciled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_recon_links_org ON reconciliation_links(org_id);
CREATE INDEX idx_recon_links_gl ON reconciliation_links(gl_account);
ALTER TABLE reconciliation_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY recon_links_org_isolation ON reconciliation_links
  USING (org_id = auth.uid());

-- ERP Module: sandbox simulation results
CREATE TABLE sandbox_simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  erp_system TEXT NOT NULL,
  simulation_type TEXT NOT NULL,
  test_data JSONB NOT NULL,
  result JSONB,
  status TEXT NOT NULL DEFAULT 'running',
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX idx_sandbox_sims_org ON sandbox_simulations(org_id);
ALTER TABLE sandbox_simulations ENABLE ROW LEVEL SECURITY;
CREATE POLICY sandbox_sims_org_isolation ON sandbox_simulations
  USING (org_id = auth.uid());

-- ERP Module: Sage Intacct export tracking
CREATE TABLE sage_intacct_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  export_type TEXT NOT NULL,
  period TEXT NOT NULL,
  journal_entries JSONB NOT NULL DEFAULT '[]',
  export_status TEXT NOT NULL DEFAULT 'pending',
  intacct_batch_id TEXT,
  exported_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_sage_exports_org ON sage_intacct_exports(org_id);
ALTER TABLE sage_intacct_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY sage_exports_org_isolation ON sage_intacct_exports
  USING (org_id = auth.uid());

-- ERP Module: GL account balance cache
CREATE TABLE gl_pullback_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  erp_system TEXT NOT NULL,
  gl_account TEXT NOT NULL,
  period TEXT NOT NULL,
  balance NUMERIC(15,4) NOT NULL,
  currency TEXT DEFAULT 'USD',
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE(org_id, erp_system, gl_account, period)
);
CREATE INDEX idx_gl_cache_org ON gl_pullback_cache(org_id, erp_system);
ALTER TABLE gl_pullback_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY gl_cache_org_isolation ON gl_pullback_cache
  USING (org_id = auth.uid());

-- ERP Module: GL historical data tracking
CREATE TABLE gl_pullback_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  erp_system TEXT NOT NULL,
  gl_account TEXT NOT NULL,
  period TEXT NOT NULL,
  balance NUMERIC(15,4) NOT NULL,
  previous_balance NUMERIC(15,4),
  change_amount NUMERIC(15,4),
  pulled_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_gl_history_org ON gl_pullback_history(org_id, erp_system, period);
ALTER TABLE gl_pullback_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY gl_history_org_isolation ON gl_pullback_history
  USING (org_id = auth.uid());

-- ERP Module: GL period comparisons
CREATE TABLE gl_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  erp_system TEXT NOT NULL,
  period_a TEXT NOT NULL,
  period_b TEXT NOT NULL,
  comparison_data JSONB NOT NULL,
  total_variance NUMERIC(15,4),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_gl_comparisons_org ON gl_comparisons(org_id);
ALTER TABLE gl_comparisons ENABLE ROW LEVEL SECURITY;
CREATE POLICY gl_comparisons_org_isolation ON gl_comparisons
  USING (org_id = auth.uid());

-- Closepack Module: blockchain anchor proofs for audit immutability
CREATE TABLE blockchain_anchors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  close_id TEXT NOT NULL,
  merkle_root TEXT NOT NULL,
  anchor_hash TEXT NOT NULL,
  anchor_timestamp TIMESTAMPTZ NOT NULL,
  chain_type TEXT NOT NULL DEFAULT 'internal',
  block_number BIGINT,
  transaction_hash TEXT,
  artifact_count INTEGER NOT NULL,
  verification_status TEXT DEFAULT 'pending',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_blockchain_anchors_org ON blockchain_anchors(org_id);
CREATE INDEX idx_blockchain_anchors_close ON blockchain_anchors(close_id);
ALTER TABLE blockchain_anchors ENABLE ROW LEVEL SECURITY;
CREATE POLICY blockchain_anchors_org_isolation ON blockchain_anchors
  USING (org_id = auth.uid());

-- Closepack Module: audit trail artifacts (invoices, allocations, reconciliation reports)
CREATE TABLE close_pack_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  close_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  artifact_name TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  file_size BIGINT,
  storage_path TEXT,
  watermark_applied BOOLEAN DEFAULT FALSE,
  watermark_hash TEXT,
  retention_until TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_close_artifacts_org ON close_pack_artifacts(org_id);
CREATE INDEX idx_close_artifacts_close ON close_pack_artifacts(close_id);
ALTER TABLE close_pack_artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY close_artifacts_org_isolation ON close_pack_artifacts
  USING (org_id = auth.uid());

-- Closepack Module: auditor access sharing
CREATE TABLE auditor_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  close_id TEXT NOT NULL,
  auditor_email TEXT NOT NULL,
  access_token TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '["read"]',
  expires_at TIMESTAMPTZ NOT NULL,
  accessed_at TIMESTAMPTZ,
  access_count INTEGER DEFAULT 0,
  revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_auditor_shares_org ON auditor_shares(org_id);
CREATE INDEX idx_auditor_shares_token ON auditor_shares(access_token);
ALTER TABLE auditor_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY auditor_shares_org_isolation ON auditor_shares
  USING (org_id = auth.uid());

-- Dispute Module: recovery tracking for successful dispute resolutions
CREATE TABLE recovery_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  dispute_id UUID,
  provider TEXT NOT NULL,
  original_charge_amount NUMERIC(15,4) NOT NULL,
  recovered_amount NUMERIC(15,4),
  recovery_status TEXT NOT NULL DEFAULT 'pending',
  recovery_method TEXT,
  credit_applied_at TIMESTAMPTZ,
  evidence_package_id UUID REFERENCES dispute_evidence_packages(id),
  resolution_notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_recovery_tracking_org ON recovery_tracking(org_id);
CREATE INDEX idx_recovery_tracking_status ON recovery_tracking(recovery_status);
ALTER TABLE recovery_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY recovery_tracking_org_isolation ON recovery_tracking
  USING (org_id = auth.uid());

-- Grant permissions for new tables
GRANT SELECT, INSERT, UPDATE ON posting_receipts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON reconciliation_links TO authenticated;
GRANT SELECT, INSERT, UPDATE ON sandbox_simulations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON sage_intacct_exports TO authenticated;
GRANT SELECT, INSERT, UPDATE ON gl_pullback_cache TO authenticated;
GRANT SELECT, INSERT, UPDATE ON gl_pullback_history TO authenticated;
GRANT SELECT, INSERT, UPDATE ON gl_comparisons TO authenticated;
GRANT SELECT, INSERT, UPDATE ON blockchain_anchors TO authenticated;
GRANT SELECT, INSERT, UPDATE ON close_pack_artifacts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON auditor_shares TO authenticated;
GRANT SELECT, INSERT, UPDATE ON recovery_tracking TO authenticated;

COMMIT;
