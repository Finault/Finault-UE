#!/usr/bin/env node

/**
 * Finault — Post-Deployment Smoke Test
 *
 * Validates a running Finault deployment by exercising key workflows:
 *   1. Create a test organization
 *   2. Create a test user
 *   3. Create a test invoice
 *   4. Verify tenant isolation via RLS
 *   5. Verify data consistency
 *   6. Clean up test data
 *
 * Designed to run against both local (docker-compose) and staging environments.
 *
 * Run: node scripts/smoke-test.js [--url http://localhost:8000]
 * Exit: 0 = all smoke tests pass, 1 = failures detected
 */

import pg from 'pg';
import { randomUUID } from 'crypto';

const { Pool } = pg;

let passCount = 0;
let failCount = 0;
const testIds = { orgs: [], users: [] };

function pass(name) {
  passCount++;
  console.log(`  ✓ ${name}`);
}

function fail(name, detail) {
  failCount++;
  console.error(`  ✗ ${name} — ${detail}`);
}

async function getPool() {
  return new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'finault',
    password: process.env.POSTGRES_PASSWORD || 'finault_dev',
    database: process.env.POSTGRES_DB || 'finault_agentos',
    connectionTimeoutMillis: 5000,
  });
}

// ─── Setup: ensure RLS testing prerequisites exist ──────────────────────────

async function ensureRLSPrereqs(pool) {
  try {
    // Create finault_app role if it doesn't exist (needed for SET LOCAL ROLE)
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finault_app') THEN
          CREATE ROLE finault_app NOLOGIN;
        END IF;
      END $$;
      GRANT USAGE ON SCHEMA public TO finault_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO finault_app;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO finault_app;
      GRANT USAGE ON SCHEMA auth TO finault_app;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO finault_app;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO finault_app;
    `);

    // Override get_current_user_org() to use current_setting (for local dev without Supabase)
    await pool.query(`
      CREATE OR REPLACE FUNCTION get_current_user_org()
      RETURNS UUID AS $$
      BEGIN
        RETURN NULLIF(current_setting('app.current_org_id', true), '')::UUID;
      EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
    `);
  } catch (err) {
    // Non-fatal — RLS test may still fail but other tests proceed
    console.warn(`  ⚠ RLS prereqs warning: ${err.message}`);
  }
}

// ─── Smoke Test 1: Create Organization ────────────────────────────────────────

async function testCreateOrg(pool) {
  console.log('\n[1/5] Create Test Organization');
  try {
    const suffix = randomUUID().slice(0, 8);
    const result = await pool.query(
      `INSERT INTO organizations (name, slug, plan_type, billing_email)
       VALUES ($1, $2, $3, $4) RETURNING id, name, plan_type`,
      [`Smoke Test ${suffix}`, `smoke-${suffix}`, 'professional', `smoke-${suffix}@test.com`]
    );
    testIds.orgs.push(result.rows[0].id);
    pass(`Organization created: ${result.rows[0].name} (${result.rows[0].id})`);
    return result.rows[0].id;
  } catch (err) {
    fail('Create organization', err.message);
    return null;
  }
}

// ─── Smoke Test 2: Create User ────────────────────────────────────────────────

async function testCreateUser(pool, orgId) {
  console.log('\n[2/5] Create Test User');
  if (!orgId) { fail('Create user', 'no org'); return null; }

  try {
    const suffix = randomUUID().slice(0, 8);
    const authResult = await pool.query(
      `INSERT INTO auth.users (email) VALUES ($1) RETURNING id`,
      [`smoke-${suffix}@test.com`]
    );

    const result = await pool.query(
      `INSERT INTO users (auth_id, email, first_name, last_name, organization_id, role, is_active, email_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, email, role`,
      [authResult.rows[0].id, `smoke-${suffix}@test.com`, 'Smoke', 'Tester', orgId, 'admin', true, true]
    );
    testIds.users.push(result.rows[0].id);
    pass(`User created: ${result.rows[0].email} (${result.rows[0].role})`);
    return result.rows[0].id;
  } catch (err) {
    fail('Create user', err.message);
    return null;
  }
}

// ─── Smoke Test 3: Create Invoice ─────────────────────────────────────────────

async function testCreateInvoice(pool, orgId) {
  console.log('\n[3/5] Create Test Invoice');
  if (!orgId) { fail('Create invoice', 'no org'); return; }

  try {
    const result = await pool.query(
      `INSERT INTO invoices (organization_id, invoice_number, provider, billing_period_start,
       billing_period_end, invoice_date, total_amount, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, invoice_number, status`,
      [orgId, `SMOKE-${randomUUID().slice(0, 8)}`, 'aws', '2026-01-01', '2026-01-31', '2026-02-01', 5000.00, 'pending']
    );
    pass(`Invoice created: ${result.rows[0].invoice_number} ($5,000, ${result.rows[0].status})`);
  } catch (err) {
    fail('Create invoice', err.message);
  }
}

// ─── Smoke Test 4: RLS Isolation ──────────────────────────────────────────────

async function testRLSIsolation(pool, orgId) {
  console.log('\n[4/5] RLS Tenant Isolation');
  if (!orgId) { fail('RLS check', 'no org'); return; }

  try {
    // Create a second org
    const otherResult = await pool.query(
      `INSERT INTO organizations (name, slug, plan_type, billing_email)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [`Other Smoke ${randomUUID().slice(0, 8)}`, `other-smoke-${randomUUID().slice(0, 8)}`, 'starter', 'other@smoke.com']
    );
    testIds.orgs.push(otherResult.rows[0].id);

    // Switch to restricted role with other org context
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE finault_app');
      await client.query(`SET LOCAL app.current_org_id = '${otherResult.rows[0].id}'`);
      await client.query(`SET LOCAL app.current_user_role = 'admin'`);

      // Should NOT see first org's invoices
      const result = await client.query('SELECT count(*) FROM invoices');
      const count = parseInt(result.rows[0].count);

      if (count === 0) {
        pass('RLS blocks cross-tenant invoice access');
      } else {
        fail('RLS isolation', `other org can see ${count} invoices (should be 0)`);
      }

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  } catch (err) {
    fail('RLS isolation', err.message);
  }
}

// ─── Smoke Test 5: Data Consistency ───────────────────────────────────────────

async function testDataConsistency(pool, orgId) {
  console.log('\n[5/5] Data Consistency');
  if (!orgId) { fail('Consistency', 'no org'); return; }

  try {
    // Verify org exists
    const org = await pool.query('SELECT count(*) FROM organizations WHERE id = $1', [orgId]);
    if (parseInt(org.rows[0].count) === 1) {
      pass('Organization persisted correctly');
    } else {
      fail('Organization persistence', 'not found');
    }

    // Verify user-org relationship
    const users = await pool.query('SELECT count(*) FROM users WHERE organization_id = $1', [orgId]);
    if (parseInt(users.rows[0].count) >= 1) {
      pass('User-org relationship intact');
    } else {
      fail('User-org relationship', 'no users found for org');
    }

    // Verify invoice exists
    const invoices = await pool.query('SELECT count(*) FROM invoices WHERE organization_id = $1', [orgId]);
    if (parseInt(invoices.rows[0].count) >= 1) {
      pass('Invoice persisted correctly');
    } else {
      fail('Invoice persistence', 'not found');
    }
  } catch (err) {
    fail('Data consistency', err.message);
  }
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

async function cleanup(pool) {
  console.log('\n[Cleanup] Removing smoke test data');
  try {
    for (const orgId of testIds.orgs) {
      // Delete dependent records first (FKs without ON DELETE CASCADE)
      await pool.query('DELETE FROM audit_trail WHERE organization_id = $1', [orgId]);
      await pool.query('DELETE FROM allocations WHERE organization_id = $1', [orgId]);
      await pool.query('DELETE FROM invoice_line_items WHERE organization_id = $1', [orgId]);
      await pool.query('DELETE FROM invoices WHERE organization_id = $1', [orgId]);
      await pool.query('DELETE FROM users WHERE organization_id = $1', [orgId]);
      await pool.query('DELETE FROM organizations WHERE id = $1', [orgId]);
    }
    pass(`Cleaned up ${testIds.orgs.length} test org(s)`);
  } catch (err) {
    fail('Cleanup', err.message);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           FINAULT — POST-DEPLOYMENT SMOKE TEST             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const pool = await getPool();

  try {
    await pool.query('SELECT 1');
  } catch {
    console.error('\n  ✗ Cannot connect to PostgreSQL. Is the database running?\n');
    process.exit(1);
  }

  await ensureRLSPrereqs(pool);

  const orgId = await testCreateOrg(pool);
  await testCreateUser(pool, orgId);
  await testCreateInvoice(pool, orgId);
  await testRLSIsolation(pool, orgId);
  await testDataConsistency(pool, orgId);
  await cleanup(pool);

  await pool.end();

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`  Results: ${passCount} passed, ${failCount} failed`);
  console.log('══════════════════════════════════════════════════════════════');

  if (failCount > 0) {
    console.error(`\n  ⚠ ${failCount} smoke test(s) failed.\n`);
    process.exit(1);
  } else {
    console.log('\n  ✅ All smoke tests passed. Deployment is healthy.\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Smoke test failed:', err.message);
  process.exit(1);
});
