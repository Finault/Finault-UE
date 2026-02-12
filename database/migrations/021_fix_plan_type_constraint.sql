-- Fix plan_type constraint to include all valid tier names
-- Schema originally only allowed: starter, growth, professional, enterprise
-- App code (multi-tenant.js) defines tiers: foundation, professional, enterprise, strategic
-- This migration reconciles both naming conventions

ALTER TABLE organizations DROP CONSTRAINT IF EXISTS valid_plan_type;
ALTER TABLE organizations ADD CONSTRAINT valid_plan_type
  CHECK (plan_type IN ('starter', 'foundation', 'growth', 'professional', 'enterprise', 'strategic'));
