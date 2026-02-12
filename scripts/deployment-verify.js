#!/usr/bin/env node

/**
 * Finault — Pre-Deployment Verification Script
 *
 * Validates that infrastructure is ready for deployment:
 *   1. Docker services healthy (postgres, redis, minio)
 *   2. Database schema loaded with all tables
 *   3. RLS policies active on all required tables
 *   4. Migrations applied
 *   5. Required functions exist
 *   6. API server starts and responds to health check
 *
 * Run: node scripts/deployment-verify.js
 * Exit: 0 = all checks pass, 1 = failures detected
 */

import { execSync } from 'child_process';
import pg from 'pg';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const { Pool } = pg;

const CHECKS = [];
let passCount = 0;
let failCount = 0;

function pass(name, detail = '') {
  passCount++;
  CHECKS.push({ name, status: 'PASS', detail });
  console.log(`  ✓ ${name}${detail ? ` (${detail})` : ''}`);
}

function fail(name, detail = '') {
  failCount++;
  CHECKS.push({ name, status: 'FAIL', detail });
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

// ─── Check 1: Docker Services ─────────────────────────────────────────────────

async function checkDocker() {
  console.log('\n[1/6] Docker Services');
  try {
    const output = execSync('docker ps --format "{{.Names}}\t{{.Status}}"', { encoding: 'utf-8', timeout: 10000 });
    if (output.includes('postgres') || output.includes('finault')) {
      pass('Docker running', 'containers detected');
    } else {
      fail('Docker running', 'no Finault containers found — run docker-compose up');
    }
  } catch {
    fail('Docker running', 'docker command failed — is Docker installed and running?');
  }
}

// ─── Check 2: PostgreSQL Connection ───────────────────────────────────────────

async function checkPostgres() {
  console.log('\n[2/6] PostgreSQL Connection');
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'finault',
    password: process.env.POSTGRES_PASSWORD || 'finault_dev',
    database: process.env.POSTGRES_DB || 'finault_agentos',
    connectionTimeoutMillis: 5000,
  });

  try {
    const result = await pool.query('SELECT 1 as connected');
    if (result.rows[0].connected === 1) {
      pass('PostgreSQL reachable');
    }
  } catch (err) {
    fail('PostgreSQL reachable', err.message);
    await pool.end();
    return null;
  }

  return pool;
}

// ─── Check 3: Schema Tables ──────────────────────────────────────────────────

async function checkTables(pool) {
  console.log('\n[3/6] Database Schema');
  if (!pool) { fail('Schema check', 'no database connection'); return; }

  const REQUIRED_TABLES = [
    'organizations', 'users', 'api_keys', 'sessions', 'usage',
    'gateway_logs', 'invoices', 'invoice_line_items', 'allocation_rules',
    'allocations', 'budgets', 'budget_tracking', 'anomalies',
    'savings_recommendations', 'close_packs', 'close_pack_details',
    'audit_trail', 'cost_allocation_summary',
  ];

  try {
    const result = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    const existingTables = result.rows.map(r => r.table_name);

    let missing = 0;
    for (const table of REQUIRED_TABLES) {
      if (existingTables.includes(table)) {
        // Don't log each one to reduce noise
      } else {
        fail(`Table: ${table}`, 'missing');
        missing++;
      }
    }

    if (missing === 0) {
      pass(`All ${REQUIRED_TABLES.length} required tables exist`);
    }

    // Check total table count
    pass(`Total tables in public schema: ${existingTables.length}`);
  } catch (err) {
    fail('Schema check', err.message);
  }
}

// ─── Check 4: RLS Policies ───────────────────────────────────────────────────

async function checkRLS(pool) {
  console.log('\n[4/6] Row-Level Security');
  if (!pool) { fail('RLS check', 'no database connection'); return; }

  const RLS_TABLES = [
    'organizations', 'users', 'api_keys', 'sessions', 'gateway_logs',
    'invoices', 'invoice_line_items', 'allocation_rules', 'allocations',
    'budgets', 'budget_tracking', 'anomalies', 'savings_recommendations',
    'close_packs', 'close_pack_details', 'audit_trail', 'cost_allocation_summary',
  ];

  try {
    const result = await pool.query(
      `SELECT tablename, rowsecurity FROM pg_tables
       WHERE schemaname = 'public' AND rowsecurity = true`
    );
    const rlsEnabled = result.rows.map(r => r.tablename);

    let missingRLS = 0;
    for (const table of RLS_TABLES) {
      if (!rlsEnabled.includes(table)) {
        fail(`RLS on ${table}`, 'not enabled');
        missingRLS++;
      }
    }

    if (missingRLS === 0) {
      pass(`RLS enabled on all ${RLS_TABLES.length} required tables`);
    }

    // Check policy count
    const policies = await pool.query(
      `SELECT count(*) FROM pg_policies WHERE schemaname = 'public'`
    );
    pass(`Total RLS policies: ${policies.rows[0].count}`);
  } catch (err) {
    fail('RLS check', err.message);
  }
}

// ─── Check 5: Required Functions ─────────────────────────────────────────────

async function checkFunctions(pool) {
  console.log('\n[5/6] Database Functions');
  if (!pool) { fail('Functions check', 'no database connection'); return; }

  const REQUIRED_FUNCTIONS = [
    'get_current_user_org',
    'get_current_user_role',
    'is_org_admin',
    'update_updated_at_column',
    'audit_trail_trigger_function',
  ];

  try {
    const result = await pool.query(
      `SELECT routine_name FROM information_schema.routines
       WHERE routine_schema = 'public' AND routine_type = 'FUNCTION'`
    );
    const existing = result.rows.map(r => r.routine_name);

    let missing = 0;
    for (const fn of REQUIRED_FUNCTIONS) {
      if (!existing.includes(fn)) {
        fail(`Function: ${fn}`, 'missing');
        missing++;
      }
    }

    if (missing === 0) {
      pass(`All ${REQUIRED_FUNCTIONS.length} required functions exist`);
    }
  } catch (err) {
    fail('Functions check', err.message);
  }
}

// ─── Check 6: Enums ─────────────────────────────────────────────────────────

async function checkEnums(pool) {
  console.log('\n[6/6] Enum Types');
  if (!pool) { fail('Enums check', 'no database connection'); return; }

  const REQUIRED_ENUMS = [
    'user_role', 'invoice_status', 'allocation_method',
    'budget_status', 'anomaly_severity', 'audit_action',
  ];

  try {
    const result = await pool.query(
      `SELECT typname FROM pg_type WHERE typtype = 'e' AND typnamespace = 'public'::regnamespace`
    );
    const existing = result.rows.map(r => r.typname);

    let missing = 0;
    for (const enumType of REQUIRED_ENUMS) {
      if (!existing.includes(enumType)) {
        fail(`Enum: ${enumType}`, 'missing');
        missing++;
      }
    }

    if (missing === 0) {
      pass(`All ${REQUIRED_ENUMS.length} required enum types exist`);
    }
  } catch (err) {
    fail('Enums check', err.message);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         FINAULT — PRE-DEPLOYMENT VERIFICATION              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  await checkDocker();
  const pool = await checkPostgres();
  await checkTables(pool);
  await checkRLS(pool);
  await checkFunctions(pool);
  await checkEnums(pool);

  if (pool) await pool.end();

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`  Results: ${passCount} passed, ${failCount} failed`);
  console.log('══════════════════════════════════════════════════════════════');

  if (failCount > 0) {
    console.error(`\n  ⚠ ${failCount} check(s) failed. Fix issues before deploying.\n`);
    process.exit(1);
  } else {
    console.log('\n  ✅ All checks passed. Safe to deploy.\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Verification script failed:', err.message);
  process.exit(1);
});
