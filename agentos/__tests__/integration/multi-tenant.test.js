/**
 * Finault Integration Test — Multi-Tenant RLS Isolation
 *
 * THE MOST IMPORTANT TEST FILE IN THE ENTIRE SUITE.
 *
 * Validates that PostgreSQL Row-Level Security actually isolates
 * tenant data at the database layer. Uses a real postgres:15 instance
 * (docker-compose) with the full Finault schema + RLS policies applied.
 *
 * Pattern:
 *   1. Setup: Load schema + RLS + test auth stubs as superuser
 *   2. Each test: BEGIN transaction → insert data as superuser → switch to
 *      restricted role (finault_app) → set tenant context → verify isolation → ROLLBACK
 *
 * Run: npx vitest run --config agentos/__tests__/integration/vitest.config.js multi-tenant
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestClient, isPostgresAvailable } from './setup/db-client.js';
import { setupTestDatabase } from './setup/migrations.js';
import { createOrg, createUser, createInvoice, createAuditEntry, createAnomaly, createClosePack } from './setup/fixtures.js';

let db;
let pgAvailable = false;

beforeAll(async () => {
  pgAvailable = await isPostgresAvailable();
  if (!pgAvailable) {
    console.warn('[multi-tenant] PostgreSQL not available — skipping integration tests');
    console.warn('[multi-tenant] Start postgres with: cd finault-monorepo && docker compose -f agentos/docker-compose.yml up -d postgres');
    return;
  }

  db = await createTestClient();
  await setupTestDatabase(db);
}, 120000);

beforeEach(({ skip }) => {
  if (!pgAvailable) skip();
});

afterAll(async () => {
  if (db) await db.close();
});

// ─── Section 1: Org Isolation ─────────────────────────────────────────────────

describe('Org Isolation — data visibility across tenants', () => {
  it('Org A user sees only Org A invoices', async () => {
    await db.withTransaction(async (tx) => {
      // Setup as superuser: create 2 orgs with invoices
      const orgA = await createOrg(tx, { name: 'Acme Corp A', slug: 'acme-a' });
      const orgB = await createOrg(tx, { name: 'Beta Inc B', slug: 'beta-b' });

      await createInvoice(tx, orgA.id, { invoice_number: 'INV-A-001', total_amount: 5000 });
      await createInvoice(tx, orgA.id, { invoice_number: 'INV-A-002', total_amount: 3000 });
      await createInvoice(tx, orgB.id, { invoice_number: 'INV-B-001', total_amount: 7000 });

      // Switch to restricted role with Org A context
      await tx.enforceRLS();
      await tx.setTenantContext(orgA.id, 'admin');

      const result = await tx.query('SELECT * FROM invoices');
      expect(result.rows.length).toBe(2);
      expect(result.rows.every(r => r.organization_id === orgA.id)).toBe(true);
    });
  });

  it('Org B user sees only Org B invoices', async () => {
    await db.withTransaction(async (tx) => {
      const orgA = await createOrg(tx, { name: 'Acme Corp C', slug: 'acme-c' });
      const orgB = await createOrg(tx, { name: 'Beta Inc D', slug: 'beta-d' });

      await createInvoice(tx, orgA.id, { invoice_number: 'INV-A-010', total_amount: 5000 });
      await createInvoice(tx, orgB.id, { invoice_number: 'INV-B-010', total_amount: 7000 });
      await createInvoice(tx, orgB.id, { invoice_number: 'INV-B-011', total_amount: 4000 });

      // Switch to Org B context
      await tx.enforceRLS();
      await tx.setTenantContext(orgB.id, 'admin');

      const result = await tx.query('SELECT * FROM invoices');
      expect(result.rows.length).toBe(2);
      expect(result.rows.every(r => r.organization_id === orgB.id)).toBe(true);
    });
  });

  it('No tenant context sees zero rows (deny-by-default)', async () => {
    await db.withTransaction(async (tx) => {
      const org = await createOrg(tx, { name: 'Ghost Org', slug: 'ghost-org' });
      await createInvoice(tx, org.id, { invoice_number: 'INV-GHOST', total_amount: 1000 });

      // Restricted role, no tenant context set
      await tx.enforceRLS();
      await tx.clearTenantContext();

      const result = await tx.query('SELECT * FROM invoices');
      expect(result.rows.length).toBe(0);
    });
  });

  it('Switching tenant context changes visible data', async () => {
    await db.withTransaction(async (tx) => {
      const orgA = await createOrg(tx, { name: 'Switch A', slug: 'switch-a' });
      const orgB = await createOrg(tx, { name: 'Switch B', slug: 'switch-b' });

      await createInvoice(tx, orgA.id, { invoice_number: 'INV-SW-A', total_amount: 1111 });
      await createInvoice(tx, orgB.id, { invoice_number: 'INV-SW-B', total_amount: 2222 });

      await tx.enforceRLS();

      // See Org A data
      await tx.setTenantContext(orgA.id);
      let result = await tx.query('SELECT total_amount FROM invoices');
      expect(result.rows.length).toBe(1);
      expect(parseFloat(result.rows[0].total_amount)).toBe(1111);

      // Switch to Org B — previous data disappears
      await tx.setTenantContext(orgB.id);
      result = await tx.query('SELECT total_amount FROM invoices');
      expect(result.rows.length).toBe(1);
      expect(parseFloat(result.rows[0].total_amount)).toBe(2222);
    });
  });

  it('Service role (superuser) can see all data across orgs', async () => {
    await db.withTransaction(async (tx) => {
      const orgA = await createOrg(tx, { name: 'Visible A', slug: 'visible-a' });
      const orgB = await createOrg(tx, { name: 'Visible B', slug: 'visible-b' });

      await createInvoice(tx, orgA.id, { invoice_number: 'INV-VIS-A', total_amount: 1000 });
      await createInvoice(tx, orgB.id, { invoice_number: 'INV-VIS-B', total_amount: 2000 });

      // Stay as superuser — should bypass RLS and see both orgs' invoices
      await tx.bypassRLS();
      const result = await tx.query(
        'SELECT * FROM invoices WHERE organization_id IN ($1, $2)',
        [orgA.id, orgB.id]
      );
      expect(result.rows.length).toBe(2);
    });
  });
});

// ─── Section 2: RLS Enforcement on Write Operations ───────────────────────────

describe('RLS Enforcement — write operations blocked across tenants', () => {
  it('Cannot UPDATE another org\'s invoices', async () => {
    await db.withTransaction(async (tx) => {
      const orgA = await createOrg(tx, { name: 'Write A', slug: 'write-a' });
      const orgB = await createOrg(tx, { name: 'Write B', slug: 'write-b' });
      const invoiceB = await createInvoice(tx, orgB.id, { invoice_number: 'INV-WR-B', total_amount: 5000 });

      // As Org A, try to update Org B's invoice
      await tx.enforceRLS();
      await tx.setTenantContext(orgA.id, 'admin');

      const result = await tx.query(
        'UPDATE invoices SET notes = $1 WHERE id = $2 RETURNING *',
        ['hacked', invoiceB.id]
      );

      // RLS should prevent the update — 0 rows affected
      expect(result.rows.length).toBe(0);
    });
  });

  it('Cannot DELETE another org\'s invoices', async () => {
    await db.withTransaction(async (tx) => {
      const orgA = await createOrg(tx, { name: 'Del A', slug: 'del-a' });
      const orgB = await createOrg(tx, { name: 'Del B', slug: 'del-b' });
      await createInvoice(tx, orgB.id, { invoice_number: 'INV-DEL-B', total_amount: 9000 });

      // As Org A, try to delete Org B's invoice
      await tx.enforceRLS();
      await tx.setTenantContext(orgA.id, 'admin');

      const result = await tx.query('DELETE FROM invoices RETURNING *');
      expect(result.rows.length).toBe(0); // No rows deleted
    });
  });

  it('Can UPDATE own org\'s invoices', async () => {
    await db.withTransaction(async (tx) => {
      const org = await createOrg(tx, { name: 'Own Org', slug: 'own-org' });
      const invoice = await createInvoice(tx, org.id, { invoice_number: 'INV-OWN', total_amount: 4000 });

      await tx.enforceRLS();
      await tx.setTenantContext(org.id, 'admin');

      const result = await tx.query(
        'UPDATE invoices SET notes = $1 WHERE id = $2 RETURNING *',
        ['legit update', invoice.id]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].notes).toBe('legit update');
    });
  });

  it('Audit trail entries are isolated by org', async () => {
    await db.withTransaction(async (tx) => {
      const orgA = await createOrg(tx, { name: 'Audit A', slug: 'audit-a' });
      const orgB = await createOrg(tx, { name: 'Audit B', slug: 'audit-b' });

      await createAuditEntry(tx, orgA.id, { action: 'create', entity_type: 'invoice' });
      await createAuditEntry(tx, orgA.id, { action: 'update', entity_type: 'invoice' });
      await createAuditEntry(tx, orgB.id, { action: 'create', entity_type: 'budget' });

      await tx.enforceRLS();
      await tx.setTenantContext(orgA.id, 'auditor');

      const result = await tx.query('SELECT * FROM audit_trail');
      expect(result.rows.length).toBe(2);
      expect(result.rows.every(r => r.organization_id === orgA.id)).toBe(true);
    });
  });

  it('Budgets are isolated by org', async () => {
    await db.withTransaction(async (tx) => {
      const orgA = await createOrg(tx, { name: 'Budget A', slug: 'budget-a' });
      const orgB = await createOrg(tx, { name: 'Budget B', slug: 'budget-b' });
      const userA = await createUser(tx, orgA.id, { role: 'admin' });
      const userB = await createUser(tx, orgB.id, { role: 'admin' });

      await tx.query(
        `INSERT INTO budgets (organization_id, created_by_id, name, cost_center, monthly_limit, fiscal_year, start_month, end_month)
         VALUES ($1, $2, 'Eng Budget', 'engineering', 10000, 2026, 1, 12)`,
        [orgA.id, userA.id]
      );
      await tx.query(
        `INSERT INTO budgets (organization_id, created_by_id, name, cost_center, monthly_limit, fiscal_year, start_month, end_month)
         VALUES ($1, $2, 'Mkt Budget', 'marketing', 5000, 2026, 1, 12)`,
        [orgB.id, userB.id]
      );

      await tx.enforceRLS();
      await tx.setTenantContext(orgA.id, 'admin');

      const result = await tx.query('SELECT * FROM budgets');
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].name).toBe('Eng Budget');
    });
  });

  it('Anomalies are isolated by org', async () => {
    await db.withTransaction(async (tx) => {
      const orgA = await createOrg(tx, { name: 'Anomaly A', slug: 'anomaly-a' });
      const orgB = await createOrg(tx, { name: 'Anomaly B', slug: 'anomaly-b' });

      await createAnomaly(tx, orgA.id, { root_cause_analysis: 'Spike in Org A' });
      await createAnomaly(tx, orgB.id, { root_cause_analysis: 'Spike in Org B' });

      await tx.enforceRLS();
      await tx.setTenantContext(orgA.id, 'admin');

      const result = await tx.query('SELECT * FROM anomalies');
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].root_cause_analysis).toBe('Spike in Org A');
    });
  });
});

// ─── Section 3: Role-Based Access ─────────────────────────────────────────────

describe('Role-Based Access — within same tenant', () => {
  it('Admin can update organization settings', async () => {
    await db.withTransaction(async (tx) => {
      const org = await createOrg(tx, { name: 'Role Test Org', slug: 'role-test' });

      await tx.enforceRLS();
      await tx.setTenantContext(org.id, 'admin');

      const result = await tx.query(
        'UPDATE organizations SET timezone = $1 WHERE id = $2 RETURNING *',
        ['US/Eastern', org.id]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].timezone).toBe('US/Eastern');
    });
  });

  it('Viewer cannot update organization settings', async () => {
    await db.withTransaction(async (tx) => {
      const org = await createOrg(tx, { name: 'Viewer Test Org', slug: 'viewer-test' });

      await tx.enforceRLS();
      await tx.setTenantContext(org.id, 'viewer');

      const result = await tx.query(
        'UPDATE organizations SET timezone = $1 WHERE id = $2 RETURNING *',
        ['US/Pacific', org.id]
      );

      // Viewer doesn't have admin role, so RLS UPDATE policy blocks this
      expect(result.rows.length).toBe(0);
    });
  });

  it('User can view their own organization', async () => {
    await db.withTransaction(async (tx) => {
      const org = await createOrg(tx, { name: 'View Test Org', slug: 'view-test' });

      await tx.enforceRLS();
      await tx.setTenantContext(org.id, 'viewer');

      const result = await tx.query('SELECT * FROM organizations');
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].id).toBe(org.id);
    });
  });

  it('User cannot view other organizations', async () => {
    await db.withTransaction(async (tx) => {
      const orgA = await createOrg(tx, { name: 'Vis Test A', slug: 'vis-a' });
      const orgB = await createOrg(tx, { name: 'Vis Test B', slug: 'vis-b' });

      await tx.enforceRLS();
      await tx.setTenantContext(orgA.id, 'admin');

      const result = await tx.query('SELECT * FROM organizations');
      // Should only see orgA, not orgB
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].id).toBe(orgA.id);
    });
  });
});

// ─── Section 4: Cross-Table Isolation ─────────────────────────────────────────

describe('Cross-Table Isolation — RLS applies to all tenant tables', () => {
  it('Close packs are isolated by org', async () => {
    await db.withTransaction(async (tx) => {
      const orgA = await createOrg(tx, { name: 'CP Org A', slug: 'cp-a' });
      const orgB = await createOrg(tx, { name: 'CP Org B', slug: 'cp-b' });
      const userA = await createUser(tx, orgA.id, { role: 'admin' });
      const userB = await createUser(tx, orgB.id, { role: 'admin' });

      await createClosePack(tx, orgA.id, userA.id, { total_allocated_amount: 15000 });
      await createClosePack(tx, orgB.id, userB.id, { total_allocated_amount: 25000 });

      await tx.enforceRLS();
      await tx.setTenantContext(orgA.id, 'admin');

      const result = await tx.query('SELECT * FROM close_packs');
      expect(result.rows.length).toBe(1);
      expect(parseFloat(result.rows[0].total_allocated_amount)).toBe(15000);
    });
  });

  it('Users table is isolated by org (members only)', async () => {
    await db.withTransaction(async (tx) => {
      const orgA = await createOrg(tx, { name: 'User Org A', slug: 'user-a' });
      const orgB = await createOrg(tx, { name: 'User Org B', slug: 'user-b' });

      await createUser(tx, orgA.id, { first_name: 'Alice', role: 'admin' });
      await createUser(tx, orgA.id, { first_name: 'Bob', role: 'viewer' });
      await createUser(tx, orgB.id, { first_name: 'Charlie', role: 'admin' });

      await tx.enforceRLS();
      await tx.setTenantContext(orgA.id, 'admin');

      const result = await tx.query('SELECT first_name FROM users ORDER BY first_name');
      expect(result.rows.length).toBe(2);
      expect(result.rows.map(r => r.first_name).sort()).toEqual(['Alice', 'Bob']);
    });
  });

  it('Savings recommendations are isolated by org', async () => {
    await db.withTransaction(async (tx) => {
      const orgA = await createOrg(tx, { name: 'Save Org A', slug: 'save-a' });
      const orgB = await createOrg(tx, { name: 'Save Org B', slug: 'save-b' });

      await tx.query(
        `INSERT INTO savings_recommendations (organization_id, title, description, estimated_monthly_savings, estimated_annual_savings, category, status)
         VALUES ($1, 'Switch to reserved instances', 'Move EC2 to RIs', 3000.00, 36000.00, 'reserved_instances', 'pending')`,
        [orgA.id]
      );
      await tx.query(
        `INSERT INTO savings_recommendations (organization_id, title, description, estimated_monthly_savings, estimated_annual_savings, category, status)
         VALUES ($1, 'Downsize GPU instances', 'Right-size GPU fleet', 5000.00, 60000.00, 'rightsizing', 'pending')`,
        [orgB.id]
      );

      await tx.enforceRLS();
      await tx.setTenantContext(orgA.id, 'admin');

      const result = await tx.query('SELECT * FROM savings_recommendations');
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].title).toBe('Switch to reserved instances');
    });
  });

  it('NULL org_id in context returns zero rows everywhere', async () => {
    await db.withTransaction(async (tx) => {
      const org = await createOrg(tx, { name: 'Null Test Org', slug: 'null-test' });
      await createInvoice(tx, org.id, { invoice_number: 'INV-NULL', total_amount: 9999 });
      await createAnomaly(tx, org.id);

      await tx.enforceRLS();
      await tx.clearTenantContext(); // Empty string → NULL after NULLIF

      const invoices = await tx.query('SELECT * FROM invoices');
      const anomalies = await tx.query('SELECT * FROM anomalies');
      const orgs = await tx.query('SELECT * FROM organizations');

      expect(invoices.rows.length).toBe(0);
      expect(anomalies.rows.length).toBe(0);
      expect(orgs.rows.length).toBe(0);
    });
  });
});
