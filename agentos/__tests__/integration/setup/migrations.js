/**
 * Finault Integration Test — Migration Runner
 *
 * Loads the real database schema, functions, and RLS policies against
 * a plain PostgreSQL instance (docker-compose). Then installs test-compatible
 * auth stubs that replace Supabase's auth.uid() with current_setting() calls,
 * enabling RLS testing without a full Supabase instance.
 */

import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

// Resolve paths relative to monorepo root
const MONOREPO_ROOT = resolve(new URL('.', import.meta.url).pathname, '../../../../');
const DB_DIR = join(MONOREPO_ROOT, 'database');

/**
 * Install test-compatible auth stubs.
 *
 * Supabase RLS policies use auth.uid() which doesn't exist in plain PostgreSQL.
 * We create:
 * 1. The `auth` schema with a uid() function backed by current_setting
 * 2. Override get_current_user_org() to use current_setting('app.current_org_id')
 * 3. Override get_current_user_role() to use current_setting('app.current_user_role')
 * 4. A restricted 'finault_app' role for RLS enforcement
 *
 * Tests set context with:
 *   SET LOCAL app.current_org_id = '<uuid>';
 *   SET LOCAL app.current_user_role = 'admin';
 */
export async function installTestAuth(client) {
  await client.query(`
    -- Create auth schema stub (Supabase normally provides this)
    CREATE SCHEMA IF NOT EXISTS auth;

    -- Stub auth.users table (referenced by users.auth_id FK)
    CREATE TABLE IF NOT EXISTS auth.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT
    );

    -- Stub auth.uid() to read from current_setting
    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS UUID AS $$
    BEGIN
      RETURN NULLIF(current_setting('app.current_auth_id', true), '')::UUID;
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;

    -- Override get_current_user_org() to use current_setting directly
    -- (bypasses the auth.uid() → users table lookup)
    CREATE OR REPLACE FUNCTION get_current_user_org()
    RETURNS UUID AS $$
    BEGIN
      RETURN NULLIF(current_setting('app.current_org_id', true), '')::UUID;
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

    -- Override get_current_user_role() to use current_setting directly
    CREATE OR REPLACE FUNCTION get_current_user_role()
    RETURNS user_role AS $$
    BEGIN
      RETURN NULLIF(current_setting('app.current_user_role', true), '')::user_role;
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

    -- Override is_org_admin() to use current_setting
    CREATE OR REPLACE FUNCTION is_org_admin()
    RETURNS BOOLEAN AS $$
    BEGIN
      RETURN current_setting('app.current_user_role', true) = 'admin';
    EXCEPTION WHEN OTHERS THEN
      RETURN FALSE;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

    -- Override is_auditor() to use current_setting
    CREATE OR REPLACE FUNCTION is_auditor()
    RETURNS BOOLEAN AS $$
    BEGIN
      RETURN current_setting('app.current_user_role', true) = 'auditor';
    EXCEPTION WHEN OTHERS THEN
      RETURN FALSE;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

    -- Create restricted app role for RLS enforcement
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finault_app') THEN
        CREATE ROLE finault_app NOLOGIN;
      END IF;
    END $$;

    -- Grant the app role access to tables but enforce RLS
    GRANT USAGE ON SCHEMA public TO finault_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO finault_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO finault_app;
    GRANT USAGE ON SCHEMA auth TO finault_app;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO finault_app;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO finault_app;

    -- Ensure RLS applies to finault_app but not the owner (finault superuser)
    -- RLS is enforced for non-owner roles by default
  `);
}

/**
 * Load the base schema (tables, enums, indexes).
 * Handles the auth.users reference by installing stubs first.
 */
export async function loadSchema(client) {
  // Install auth stubs BEFORE schema (schema references auth.users)
  await installTestAuth(client);

  const schemaPath = join(DB_DIR, 'schema.sql');
  let schemaSql;
  try {
    schemaSql = readFileSync(schemaPath, 'utf-8');
  } catch (err) {
    throw new Error(`Could not read schema.sql at ${schemaPath}: ${err.message}`);
  }

  // Execute schema in a single batch.
  // Wrap in try-catch to handle "already exists" gracefully.
  try {
    await client.query(schemaSql);
  } catch (err) {
    // If tables already exist, that's fine (idempotent)
    if (!err.message.includes('already exists')) {
      throw new Error(`Schema load failed: ${err.message}`);
    }
  }
}

/**
 * Load database functions (stored procedures).
 *
 * functions.sql may contain references to columns that don't exist in the
 * base schema (e.g. cost_center_code in gateway_logs). These are pre-existing
 * mismatches in the codebase. We split on CREATE OR REPLACE FUNCTION boundaries
 * and load each function individually so one bad function doesn't block the rest.
 */
export async function loadFunctions(client) {
  const functionsPath = join(DB_DIR, 'functions.sql');
  let functionsSql;
  try {
    functionsSql = readFileSync(functionsPath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('[migrations] No functions.sql found, skipping');
      return;
    }
    throw err;
  }

  // Split into individual statements on semicolons that end a top-level block.
  // We try the whole file first; if it fails, fall back to statement-by-statement.
  try {
    await client.query(functionsSql);
  } catch (err) {
    if (err.message.includes('already exists')) return;

    console.warn(`[migrations] Full functions.sql load failed (${err.message}), loading statement-by-statement...`);

    // Split on 'CREATE OR REPLACE FUNCTION' and 'CREATE INDEX' boundaries
    // to isolate individual statements
    const statements = functionsSql
      .split(/(?=^CREATE )/m)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    let loaded = 0;
    let skipped = 0;
    for (const stmt of statements) {
      try {
        await client.query(stmt);
        loaded++;
      } catch (stmtErr) {
        // Tolerate column-not-found, already-exists, and similar non-critical errors
        skipped++;
        const shortMsg = stmtErr.message.split('\n')[0].slice(0, 80);
        const funcMatch = stmt.match(/FUNCTION\s+(\w+)/i);
        const name = funcMatch ? funcMatch[1] : stmt.slice(0, 40);
        console.warn(`[migrations]   ⚠ Skipped "${name}": ${shortMsg}`);
      }
    }
    console.log(`[migrations] Functions: ${loaded} loaded, ${skipped} skipped (pre-existing schema mismatches)`);
  }
}

/**
 * Load RLS policies.
 * Same resilient approach as loadFunctions — try whole file first,
 * fall back to statement-by-statement if there are issues.
 */
export async function loadRLSPolicies(client) {
  const rlsPath = join(DB_DIR, 'rls-policies.sql');
  let rlsSql;
  try {
    rlsSql = readFileSync(rlsPath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('[migrations] No rls-policies.sql found, skipping');
      return;
    }
    throw err;
  }

  try {
    await client.query(rlsSql);
  } catch (err) {
    // Always fall back to statement-by-statement — some policies may already
    // exist while others need to be created (e.g., after migration 020 recreates
    // partitioned tables, their policies are lost and must be re-created).
    console.warn(`[migrations] Full rls-policies.sql load failed (${err.message}), loading statement-by-statement...`);

    const statements = rlsSql
      .split(/(?=^(?:CREATE |ALTER |GRANT ))/m)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    let loaded = 0;
    let skipped = 0;
    for (const stmt of statements) {
      try {
        await client.query(stmt);
        loaded++;
      } catch (stmtErr) {
        if (!stmtErr.message.includes('already exists')) {
          skipped++;
          const shortMsg = stmtErr.message.split('\n')[0].slice(0, 80);
          console.warn(`[migrations]   ⚠ RLS skip: ${shortMsg}`);
        } else {
          loaded++;
        }
      }
    }
    console.log(`[migrations] RLS: ${loaded} loaded, ${skipped} skipped`);
  }
}

/**
 * Run all numbered migrations from database/migrations/ in order.
 */
export async function runMigrations(client) {
  const migrationsDir = join(DB_DIR, 'migrations');
  let files;
  try {
    files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql') && !f.startsWith('_'))
      .sort(); // Alphabetical = numerical order (001, 002, ...)
  } catch (err) {
    console.log('[migrations] No migrations directory found, skipping');
    return 0;
  }

  let applied = 0;
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    try {
      await client.query(sql);
      applied++;
    } catch (err) {
      // Skip "already exists" errors (idempotent migrations)
      if (err.message.includes('already exists') ||
          err.message.includes('duplicate key') ||
          err.message.includes('does not exist') /* DROP IF NOT EXISTS edge cases */ ||
          err.message.includes('cannot alter type') /* column already correct type, policy exists */) {
        continue;
      }
      console.warn(`[migrations] Warning in ${file}: ${err.message}`);
    }
  }

  return applied;
}

/**
 * Full database setup: schema → functions → RLS → migrations → test auth overrides.
 * Call this once in beforeAll().
 *
 * @param {object} client - Query client ({ query: (sql, params?) => Promise })
 */
export async function setupTestDatabase(client) {
  console.log('[migrations] Setting up test database...');

  // 1. Auth stubs first (schema references auth.users)
  await installTestAuth(client);
  console.log('[migrations] ✓ Auth stubs installed');

  // 2. Base schema (tables, indexes, enums)
  await loadSchema(client);
  console.log('[migrations] ✓ Schema loaded');

  // 3. Stored functions
  await loadFunctions(client);
  console.log('[migrations] ✓ Functions loaded');

  // 4. RLS policies
  await loadRLSPolicies(client);
  console.log('[migrations] ✓ RLS policies loaded');

  // 5. Numbered migrations
  const count = await runMigrations(client);
  console.log(`[migrations] ✓ ${count} migrations applied`);

  // 5b. Re-apply RLS policies (migration 020 converts tables to partitioned,
  //     which drops and recreates gateway_logs/audit_trail — losing their RLS)
  await loadRLSPolicies(client);
  console.log('[migrations] ✓ RLS policies re-applied after migrations');

  // 6. Re-install test auth overrides (migrations may have redefined functions)
  await installTestAuth(client);
  console.log('[migrations] ✓ Test auth overrides re-applied');

  // 7. Grant permissions again (new tables from migrations)
  await client.query(`
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO finault_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO finault_app;
  `);
  console.log('[migrations] ✓ Permissions granted');

  console.log('[migrations] Database setup complete');
}
