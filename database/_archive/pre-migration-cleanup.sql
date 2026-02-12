-- ============================================================================
-- FINAULT PRE-MIGRATION CLEANUP
-- ============================================================================
-- Run this BEFORE safe-full-migration.sql
-- Drops incomplete tables from previous migration attempts
-- PRESERVES: closes, usage_reconciliations, profiles (your live data)
-- ============================================================================

-- Drop tables in reverse dependency order (children first, then parents)
-- Phase 7: Gateway compat
DROP TABLE IF EXISTS scheduled_actions CASCADE;
DROP TABLE IF EXISTS reconciliation_reports CASCADE;
DROP TABLE IF EXISTS budget_configs CASCADE;
DROP TABLE IF EXISTS proof_registry CASCADE;
DROP TABLE IF EXISTS crypto_proofs CASCADE;
DROP TABLE IF EXISTS blockchain_anchors CASCADE;

-- Phase 6: Auth & RBAC
DROP TABLE IF EXISTS goals CASCADE;
DROP TABLE IF EXISTS autonomous_settings CASCADE;
DROP TABLE IF EXISTS alert_history CASCADE;
DROP TABLE IF EXISTS alert_configs CASCADE;
DROP TABLE IF EXISTS magic_sessions CASCADE;

-- Phase 5: Platform flywheel
DROP TABLE IF EXISTS value_tracking CASCADE;
DROP TABLE IF EXISTS customer_journeys CASCADE;
DROP TABLE IF EXISTS reconciliations CASCADE;
DROP TABLE IF EXISTS collective_intelligence CASCADE;
DROP TABLE IF EXISTS recommendation_confidence CASCADE;
DROP TABLE IF EXISTS savings_tracking CASCADE;
DROP TABLE IF EXISTS reconciliation_training_data CASCADE;
DROP TABLE IF EXISTS dispute_predictions CASCADE;
DROP TABLE IF EXISTS discrepancy_patterns CASCADE;
DROP TABLE IF EXISTS cost_center_learnings CASCADE;
DROP TABLE IF EXISTS billing_anomalies CASCADE;
DROP TABLE IF EXISTS reconciliation_confidence CASCADE;
DROP TABLE IF EXISTS provider_patterns CASCADE;
DROP TABLE IF EXISTS real_time_recommendations CASCADE;
DROP TABLE IF EXISTS anomaly_detections CASCADE;
DROP TABLE IF EXISTS disputes CASCADE;
DROP TABLE IF EXISTS savings_implementations CASCADE;
DROP TABLE IF EXISTS benchmark_data_points CASCADE;
DROP TABLE IF EXISTS benchmark_positions CASCADE;
DROP TABLE IF EXISTS anomaly_baselines CASCADE;
DROP TABLE IF EXISTS seasonality_profiles CASCADE;
DROP TABLE IF EXISTS provider_relationships CASCADE;
DROP TABLE IF EXISTS cost_center_structures CASCADE;
DROP TABLE IF EXISTS model_usage_events CASCADE;
DROP TABLE IF EXISTS model_usage_profiles CASCADE;
DROP TABLE IF EXISTS spending_patterns CASCADE;
DROP TABLE IF EXISTS pack_type_registry CASCADE;
DROP TABLE IF EXISTS reconciliation_certificates CASCADE;
DROP TABLE IF EXISTS ingestion_log CASCADE;
DROP TABLE IF EXISTS source_registry CASCADE;
DROP TABLE IF EXISTS pricing_rules CASCADE;
DROP TABLE IF EXISTS pricing_rulesets CASCADE;

-- Phase 4: ERP
DROP TABLE IF EXISTS erp_variance_records CASCADE;
DROP TABLE IF EXISTS erp_posting_policies CASCADE;
DROP TABLE IF EXISTS erp_post_receipts CASCADE;
DROP TABLE IF EXISTS erp_post_attempts CASCADE;

-- Phase 3: Anchors
DROP TABLE IF EXISTS verification_records CASCADE;
DROP TABLE IF EXISTS merkle_proofs CASCADE;
DROP TABLE IF EXISTS anchors CASCADE;

-- Phase 2: Lineage
DROP TABLE IF EXISTS fcs_snapshots CASCADE;
DROP TABLE IF EXISTS drift_events CASCADE;
DROP TABLE IF EXISTS baselines CASCADE;
DROP TABLE IF EXISTS close_lineage CASCADE;

-- Phase 1: Core (child tables first)
DROP TABLE IF EXISTS cost_allocation_summary CASCADE;
DROP TABLE IF EXISTS audit_trail CASCADE;
DROP TABLE IF EXISTS close_pack_details CASCADE;
DROP TABLE IF EXISTS close_packs CASCADE;
DROP TABLE IF EXISTS savings_recommendations CASCADE;
DROP TABLE IF EXISTS anomalies CASCADE;
DROP TABLE IF EXISTS budget_tracking CASCADE;
DROP TABLE IF EXISTS budgets CASCADE;
DROP TABLE IF EXISTS allocations CASCADE;
DROP TABLE IF EXISTS allocation_rules CASCADE;
DROP TABLE IF EXISTS invoice_line_items CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS gateway_logs CASCADE;
DROP TABLE IF EXISTS usage CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS api_keys CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;

-- Drop enums (so they can be recreated cleanly)
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS invoice_status CASCADE;
DROP TYPE IF EXISTS allocation_method CASCADE;
DROP TYPE IF EXISTS budget_status CASCADE;
DROP TYPE IF EXISTS anomaly_severity CASCADE;
DROP TYPE IF EXISTS audit_action CASCADE;

-- Drop any leftover functions from previous attempts
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS prevent_mutation() CASCADE;
DROP FUNCTION IF EXISTS log_audit_trail() CASCADE;

-- ============================================================================
-- DONE - Now run safe-full-migration.sql
-- ============================================================================
