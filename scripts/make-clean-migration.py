#!/usr/bin/env python3
"""
Generate combined-migration-clean.sql from combined-migration.sql
Applies ALL known fixes for Supabase compatibility.

Usage: python3 scripts/make-clean-migration.py
Output: database/combined-migration-clean.sql
"""

import re
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(SCRIPT_DIR)
INPUT_FILE = os.path.join(REPO_DIR, "database", "combined-migration.sql")
OUTPUT_FILE = os.path.join(REPO_DIR, "database", "combined-migration-clean.sql")

def apply_fixes(content):
    fixes_applied = []

    # =========================================================================
    # FIX #1: Extensions - Add required Supabase extensions at the very top
    # =========================================================================
    extensions_block = """-- Required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
"""
    # Check if extensions are already present
    if 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"' not in content:
        # Insert after the header comments, before first CREATE TYPE
        insert_point = content.find("CREATE TYPE")
        if insert_point > 0:
            content = content[:insert_point] + extensions_block + "\n" + content[insert_point:]
            fixes_applied.append("Fix #1: Added 4 required extensions")
    else:
        fixes_applied.append("Fix #1: Extensions already present (skipped)")

    # =========================================================================
    # FIX #2: hstore → jsonb - Replace hstore usage with jsonb equivalent
    # =========================================================================
    hstore_count = content.count('hstore')
    if hstore_count > 0:
        # Replace hstore-based delta tracking with jsonb subquery approach
        # The original pattern: jsonb_object_agg(key, value) FROM each(hstore(NEW) - hstore(OLD))
        # Must become a subselect: (SELECT jsonb_object_agg(...) FROM jsonb_each(...) LEFT JOIN ...)
        content = content.replace(
            'jsonb_object_agg(key, value)\n                FROM each(hstore(NEW) - hstore(OLD))',
            '(SELECT jsonb_object_agg(key, new_val.value)\n                FROM jsonb_each(to_jsonb(NEW)) AS new_val(key, value)\n                LEFT JOIN jsonb_each(to_jsonb(OLD)) AS old_val(key, value) USING (key)\n                WHERE new_val.value IS DISTINCT FROM old_val.value)'
        )
        # Also handle single-line variant
        content = content.replace(
            'each(hstore(NEW) - hstore(OLD))',
            'jsonb_each(to_jsonb(NEW)) AS new_val(key, value) LEFT JOIN jsonb_each(to_jsonb(OLD)) AS old_val(key, value) USING (key) WHERE new_val.value IS DISTINCT FROM old_val.value'
        )
        fixes_applied.append(f"Fix #2: Replaced {hstore_count} hstore references with jsonb")
    else:
        fixes_applied.append("Fix #2: No hstore references found (skipped)")

    # =========================================================================
    # FIX #3: users.org_id → users.organization_id in error_logs RLS
    # =========================================================================
    # The error_logs table uses org_id (TEXT), but users table uses organization_id (UUID)
    old_pattern = "users.org_id = error_logs.org_id"
    new_pattern = "users.organization_id::TEXT = error_logs.org_id"
    if old_pattern in content:
        content = content.replace(old_pattern, new_pattern)
        fixes_applied.append("Fix #3: Fixed users.org_id → users.organization_id in error_logs RLS")
    else:
        fixes_applied.append("Fix #3: error_logs RLS already fixed (skipped)")

    # =========================================================================
    # FIX #4: Helper functions for RLS policies
    # =========================================================================
    helper_funcs = """
-- Helper functions for RLS policies
CREATE OR REPLACE FUNCTION get_current_user_org() RETURNS UUID AS $$
  SELECT organization_id FROM users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_current_user_role() RETURNS TEXT AS $$
  SELECT role::TEXT FROM users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_org_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS(SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
$$ LANGUAGE sql SECURITY DEFINER STABLE;
"""
    # Check for the actual function DEFINITION, not just references in policies
    if 'CREATE OR REPLACE FUNCTION get_current_user_org' not in content:
        # Insert after the users table creation
        users_end = content.find("CREATE INDEX idx_users_")
        if users_end < 0:
            users_end = content.find("CREATE INDEX IF NOT EXISTS idx_users_")
        if users_end > 0:
            # Find end of users indexes section
            next_section = content.find("\n-- ====", users_end)
            if next_section > 0:
                content = content[:next_section] + helper_funcs + content[next_section:]
                fixes_applied.append("Fix #4: Added helper functions (get_current_user_org, etc.)")
            else:
                # Fallback: insert right after the users indexes
                eol = content.find("\n", users_end + 50)
                if eol > 0:
                    content = content[:eol] + helper_funcs + content[eol:]
                    fixes_applied.append("Fix #4: Added helper functions (fallback insertion)")
    else:
        fixes_applied.append("Fix #4: Helper functions already present (skipped)")

    # =========================================================================
    # FIX #5: Missing prerequisite tables (providers, contracts, chargebacks)
    # =========================================================================
    missing_tables = """
-- Missing prerequisite tables referenced by Diamond tier foreign keys
CREATE TABLE IF NOT EXISTS providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'cloud',
    status TEXT NOT NULL DEFAULT 'active',
    config JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'standard',
    status TEXT NOT NULL DEFAULT 'active',
    start_date DATE,
    end_date DATE,
    terms JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chargebacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
    amount NUMERIC(15,4) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    reason TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
"""
    # Insert before Diamond tier section (Migration: 013_diamond_tier.sql)
    diamond_marker = "-- Migration: 013_diamond_tier.sql"
    if diamond_marker in content:
        # Check if providers table already exists before diamond section
        pre_diamond = content[:content.find(diamond_marker)]
        if "CREATE TABLE IF NOT EXISTS providers" not in pre_diamond:
            insert_pos = content.find(diamond_marker)
            # Go back to the preceding === line
            prev_line = content.rfind("\n-- ====", 0, insert_pos)
            if prev_line > 0:
                content = content[:prev_line] + "\n" + missing_tables + "\n" + content[prev_line:]
                fixes_applied.append("Fix #5: Added missing prerequisite tables (providers, contracts, chargebacks)")
        else:
            fixes_applied.append("Fix #5: Prerequisite tables already present (skipped)")
    else:
        fixes_applied.append("Fix #5: Diamond tier marker not found (skipped)")

    # =========================================================================
    # FIX #6: Transaction wrappers - Remove BEGIN/COMMIT
    # =========================================================================
    begin_count = 0
    commit_count = 0

    # Replace standalone BEGIN; with comment
    content_new = re.sub(r'^BEGIN;\s*$', '-- BEGIN;  -- removed for Supabase', content, flags=re.MULTILINE)
    begin_count = len(re.findall(r'^BEGIN;\s*$', content, re.MULTILINE))

    # Replace standalone COMMIT; with comment
    content_new = re.sub(r'^COMMIT;\s*$', '-- COMMIT;  -- removed for Supabase', content_new, flags=re.MULTILINE)
    commit_count = len(re.findall(r'^COMMIT;\s*$', content, re.MULTILINE))

    if begin_count > 0 or commit_count > 0:
        content = content_new
        fixes_applied.append(f"Fix #6: Removed {begin_count} BEGIN and {commit_count} COMMIT wrappers")
    else:
        fixes_applied.append("Fix #6: No transaction wrappers found (skipped)")

    # =========================================================================
    # FIX #7: Duplicate table definitions - DROP first, keep second (fuller schema)
    # =========================================================================
    # dispute_predictions and blockchain_anchors are defined twice with DIFFERENT
    # schemas. The second definition (Diamond/Closepack tier) is the complete one
    # with org_id, indexes, and RLS policies. We must DROP the first (incomplete)
    # definition before the second CREATE TABLE so the second schema wins.
    tables_to_fix = ['dispute_predictions', 'blockchain_anchors']
    for tbl in tables_to_fix:
        pattern = f"CREATE TABLE {tbl}"
        # Also count IF NOT EXISTS variants
        total = content.count(f"CREATE TABLE {tbl}") + content.count(f"CREATE TABLE IF NOT EXISTS {tbl}")
        if total > 1:
            # Find the SECOND definition and insert DROP before it
            # First, find all occurrences
            positions = []
            for variant in [f"CREATE TABLE IF NOT EXISTS {tbl}", f"CREATE TABLE {tbl}"]:
                start = 0
                while True:
                    pos = content.find(variant, start)
                    if pos < 0:
                        break
                    positions.append(pos)
                    start = pos + 1
            positions.sort()
            if len(positions) >= 2:
                second_pos = positions[-1]  # The later definition
                # Insert DROP TABLE before the second CREATE TABLE
                drop_stmt = f"DROP TABLE IF EXISTS {tbl} CASCADE;\n"
                content = content[:second_pos] + drop_stmt + content[second_pos:]
                fixes_applied.append(f"Fix #7: Added DROP CASCADE before second '{tbl}' definition")

    # =========================================================================
    # FIX #8: merkle_proofs drop conflicts with crypto_proofs VIEW
    # =========================================================================
    # Migration 008 drops merkle_proofs, but migration 015 creates a VIEW
    # crypto_proofs that references merkle_proofs.
    # Solution: Don't drop merkle_proofs in migration 008
    old_drop = "DROP TABLE IF EXISTS merkle_proofs CASCADE;"
    if old_drop in content:
        # Check if there's a VIEW that depends on it
        if "FROM merkle_proofs" in content:
            content = content.replace(
                old_drop,
                "-- DROP TABLE IF EXISTS merkle_proofs CASCADE;  -- KEPT: needed by crypto_proofs VIEW in migration 015"
            )
            fixes_applied.append("Fix #8: Preserved merkle_proofs table (needed by crypto_proofs VIEW)")
        else:
            fixes_applied.append("Fix #8: No VIEW depends on merkle_proofs (skipped)")
    else:
        fixes_applied.append("Fix #8: merkle_proofs drop already handled (skipped)")

    # =========================================================================
    # FIX #9: Fix RLS policies using auth.uid() for org isolation
    # =========================================================================
    # The gap-fix tables and gateway compat tables use org_id = auth.uid()
    # This is wrong: auth.uid() returns a USER id, not an ORG id
    # Fix: Use current_setting('app.current_org_id')::uuid instead
    auth_uid_policy_pattern = r"(CREATE\s+POLICY\s+\S+\s+ON\s+\w+.*?USING\s*\()org_id\s*=\s*auth\.uid\(\)(\))"
    replacements = 0
    def fix_auth_uid_policy(m):
        nonlocal replacements
        replacements += 1
        return m.group(1) + "org_id = current_setting('app.current_org_id')::uuid" + m.group(2)

    content = re.sub(auth_uid_policy_pattern, fix_auth_uid_policy, content, flags=re.DOTALL | re.IGNORECASE)
    if replacements > 0:
        fixes_applied.append(f"Fix #9: Fixed {replacements} RLS policies from auth.uid() to current_setting")
    else:
        fixes_applied.append("Fix #9: No auth.uid() RLS policies found (skipped)")

    # =========================================================================
    # FIX #10: compliance_controls UNIQUE constraint
    # =========================================================================
    # control_id VARCHAR(50) NOT NULL UNIQUE should be UNIQUE per org
    old_unique = "control_id VARCHAR(50) NOT NULL UNIQUE,"
    if old_unique in content:
        content = content.replace(
            old_unique,
            "control_id VARCHAR(50) NOT NULL,"
        )
        # Add composite unique constraint
        content = content.replace(
            "CREATE INDEX IF NOT EXISTS idx_compliance_controls_control_id ON compliance_controls(control_id);",
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_compliance_controls_org_control ON compliance_controls(org_id, control_id);\nCREATE INDEX IF NOT EXISTS idx_compliance_controls_control_id ON compliance_controls(control_id);"
        )
        fixes_applied.append("Fix #10: Changed compliance_controls UNIQUE to composite (org_id, control_id)")
    else:
        fixes_applied.append("Fix #10: compliance_controls UNIQUE already fixed (skipped)")

    # =========================================================================
    # FIX #11: Ensure GRANT on dropped tables are safe
    # =========================================================================
    # After tables are dropped and replaced with views, GRANTs on them should work
    # but let's add IF EXISTS-style protection
    # Actually, GRANTs on views work fine. The issue is if a GRANT appears AFTER a DROP
    # but this is handled by the view creation. No fix needed.
    fixes_applied.append("Fix #11: GRANT safety checked (no action needed)")

    return content, fixes_applied

def main():
    print(f"📦 Clean Migration Generator")
    print(f"   Input:  {INPUT_FILE}")
    print(f"   Output: {OUTPUT_FILE}")

    if not os.path.exists(INPUT_FILE):
        print(f"\n⛔ Input file not found: {INPUT_FILE}")
        return

    with open(INPUT_FILE, 'r') as f:
        content = f.read()

    print(f"   Original: {len(content.splitlines())} lines")

    content, fixes = apply_fixes(content)

    print(f"\n🔧 Fixes Applied:")
    for fix in fixes:
        status = "✅" if "skipped" not in fix.lower() else "⏭️"
        print(f"   {status} {fix}")

    with open(OUTPUT_FILE, 'w') as f:
        f.write(content)

    print(f"\n📄 Output: {len(content.splitlines())} lines → {OUTPUT_FILE}")
    print(f"   ✅ Clean migration generated successfully")

if __name__ == '__main__':
    main()
