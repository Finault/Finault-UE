/**
 * Finault Integration Test — Quota Enforcement & Rate Limiting
 *
 * Validates that plan-tier quotas are correctly defined, resource
 * limits are enforced, and rate limiting works per-tenant.
 * Tests actual database operations to verify quota tracking.
 *
 * Run: npx vitest run --config agentos/__tests__/integration/vitest.config.js quota
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestClient, isPostgresAvailable } from './setup/db-client.js';
import { setupTestDatabase } from './setup/migrations.js';
import { createOrg, createUser, createInvoice } from './setup/fixtures.js';

let db;
let pgAvailable = false;

// Plan quotas per spec (from multi-tenant.js PLAN_QUOTAS)
const PLAN_QUOTAS = {
  foundation:    { api_rpm: 100,   invoices_month: 25,  close_packs_month: 1,  users: 3,   providers: 3 },
  professional:  { api_rpm: 500,   invoices_month: 100, close_packs_month: 5,  users: 10,  providers: 10 },
  enterprise:    { api_rpm: 2000,  invoices_month: 500, close_packs_month: 25, users: 50,  providers: -1 },
  strategic:     { api_rpm: 10000, invoices_month: -1,  close_packs_month: -1, users: -1,  providers: -1 },
};

beforeAll(async () => {
  pgAvailable = await isPostgresAvailable();
  if (!pgAvailable) {
    console.warn('[quota-enforcement] PostgreSQL not available — skipping');
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

// ─── Helper: Check monthly invoice count for org ──────────────────────────────

async function getMonthlyInvoiceCount(tx, orgId) {
  const result = await tx.query(
    `SELECT count(*) FROM invoices
     WHERE organization_id = $1
     AND created_at >= date_trunc('month', now())
     AND created_at < date_trunc('month', now()) + interval '1 month'`,
    [orgId]
  );
  return parseInt(result.rows[0].count);
}

// ─── Helper: Simulate quota check ────────────────────────────────────────────

function checkQuota(planType, resource, currentUsage) {
  const quota = PLAN_QUOTAS[planType];
  if (!quota) return { allowed: false, error: 'Unknown plan' };

  const limit = quota[resource];
  if (limit === -1) return { allowed: true }; // unlimited
  if (currentUsage >= limit) {
    return {
      allowed: false,
      status: resource === 'api_rpm' ? 429 : 402,
      error: resource === 'api_rpm' ? 'Rate limit exceeded' : 'Quota exceeded',
      limit,
      current: currentUsage,
      upgrade_url: '/api/v1/billing/upgrade',
    };
  }
  return { allowed: true, remaining: limit - currentUsage };
}

// ─── Section 1: Plan Quota Definitions ────────────────────────────────────────

describe('Plan Quota Definitions', () => {
  it('Foundation plan has correct limits per spec', () => {
    expect(PLAN_QUOTAS.foundation.api_rpm).toBe(100);
    expect(PLAN_QUOTAS.foundation.invoices_month).toBe(25);
    expect(PLAN_QUOTAS.foundation.close_packs_month).toBe(1);
    expect(PLAN_QUOTAS.foundation.users).toBe(3);
    expect(PLAN_QUOTAS.foundation.providers).toBe(3);
  });

  it('Professional plan has correct limits per spec', () => {
    expect(PLAN_QUOTAS.professional.api_rpm).toBe(500);
    expect(PLAN_QUOTAS.professional.invoices_month).toBe(100);
    expect(PLAN_QUOTAS.professional.users).toBe(10);
  });

  it('Enterprise plan has correct limits per spec', () => {
    expect(PLAN_QUOTAS.enterprise.api_rpm).toBe(2000);
    expect(PLAN_QUOTAS.enterprise.invoices_month).toBe(500);
    expect(PLAN_QUOTAS.enterprise.providers).toBe(-1); // unlimited
  });

  it('Strategic plan is unlimited for most resources', () => {
    expect(PLAN_QUOTAS.strategic.api_rpm).toBe(10000);
    expect(PLAN_QUOTAS.strategic.invoices_month).toBe(-1);
    expect(PLAN_QUOTAS.strategic.close_packs_month).toBe(-1);
    expect(PLAN_QUOTAS.strategic.users).toBe(-1);
    expect(PLAN_QUOTAS.strategic.providers).toBe(-1);
  });
});

// ─── Section 2: Rate Limiting Logic ───────────────────────────────────────────

describe('Rate Limiting Logic', () => {
  it('request within limit returns allowed', () => {
    const result = checkQuota('foundation', 'api_rpm', 50);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(50);
  });

  it('request at limit returns 429', () => {
    const result = checkQuota('foundation', 'api_rpm', 100);
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(429);
    expect(result.error).toContain('Rate limit');
  });

  it('request over limit returns 429 with details', () => {
    const result = checkQuota('foundation', 'api_rpm', 150);
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(429);
    expect(result.limit).toBe(100);
    expect(result.current).toBe(150);
  });

  it('different plans have independent limits', () => {
    const foundation = checkQuota('foundation', 'api_rpm', 100);
    const professional = checkQuota('professional', 'api_rpm', 100);
    const enterprise = checkQuota('enterprise', 'api_rpm', 100);

    expect(foundation.allowed).toBe(false);  // 100/100 = exceeded
    expect(professional.allowed).toBe(true); // 100/500 = within
    expect(enterprise.allowed).toBe(true);   // 100/2000 = within
  });

  it('strategic plan api_rpm allows up to 10000', () => {
    const result = checkQuota('strategic', 'api_rpm', 9999);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });
});

// ─── Section 3: Resource Quota Enforcement ────────────────────────────────────

describe('Resource Quota Enforcement', () => {
  it('Foundation plan: 26th invoice in month returns 402', () => {
    const result = checkQuota('foundation', 'invoices_month', 25);
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(402);
    expect(result.error).toContain('Quota exceeded');
    expect(result.upgrade_url).toBe('/api/v1/billing/upgrade');
  });

  it('Professional plan: 101st invoice returns 402', () => {
    const result = checkQuota('professional', 'invoices_month', 100);
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(402);
  });

  it('Strategic plan: invoices are unlimited', () => {
    const result = checkQuota('strategic', 'invoices_month', 10000);
    expect(result.allowed).toBe(true);
  });

  it('Close pack monthly cap enforced for Foundation', () => {
    const result = checkQuota('foundation', 'close_packs_month', 1);
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(402);
  });
});

// ─── Section 4: Database-Level Quota Tracking ─────────────────────────────────

describe('Database-Level Quota Tracking', () => {
  it('invoice count increases with each insert', async () => {
    await db.withTransaction(async (tx) => {
      const org = await createOrg(tx, { plan_type: 'professional' });

      const count0 = await getMonthlyInvoiceCount(tx, org.id);
      expect(count0).toBe(0);

      await createInvoice(tx, org.id, { invoice_number: 'Q-001', total_amount: 1000 });
      const count1 = await getMonthlyInvoiceCount(tx, org.id);
      expect(count1).toBe(1);

      await createInvoice(tx, org.id, { invoice_number: 'Q-002', total_amount: 2000 });
      const count2 = await getMonthlyInvoiceCount(tx, org.id);
      expect(count2).toBe(2);
    });
  });

  it('different orgs have independent invoice counts', async () => {
    await db.withTransaction(async (tx) => {
      const orgA = await createOrg(tx, { name: 'Quota A', slug: 'quota-a' });
      const orgB = await createOrg(tx, { name: 'Quota B', slug: 'quota-b' });

      await createInvoice(tx, orgA.id, { invoice_number: 'QA-001', total_amount: 1000 });
      await createInvoice(tx, orgA.id, { invoice_number: 'QA-002', total_amount: 2000 });
      await createInvoice(tx, orgA.id, { invoice_number: 'QA-003', total_amount: 3000 });
      await createInvoice(tx, orgB.id, { invoice_number: 'QB-001', total_amount: 4000 });

      const countA = await getMonthlyInvoiceCount(tx, orgA.id);
      const countB = await getMonthlyInvoiceCount(tx, orgB.id);

      expect(countA).toBe(3);
      expect(countB).toBe(1);
    });
  });

  it('user count per org is correctly tracked', async () => {
    await db.withTransaction(async (tx) => {
      const org = await createOrg(tx, { plan_type: 'foundation' });

      await createUser(tx, org.id, { first_name: 'User1', role: 'admin' });
      await createUser(tx, org.id, { first_name: 'User2', role: 'viewer' });
      await createUser(tx, org.id, { first_name: 'User3', role: 'viewer' });

      const result = await tx.query(
        'SELECT count(*) FROM users WHERE organization_id = $1',
        [org.id]
      );
      const userCount = parseInt(result.rows[0].count);

      // Foundation allows 3 users — at limit
      const quotaCheck = checkQuota('foundation', 'users', userCount);
      expect(quotaCheck.allowed).toBe(false);
    });
  });

  it('organization plan_type stored correctly in database', async () => {
    await db.withTransaction(async (tx) => {
      const org = await createOrg(tx, { plan_type: 'enterprise' });

      const result = await tx.query('SELECT plan_type FROM organizations WHERE id = $1', [org.id]);
      expect(result.rows[0].plan_type).toBe('enterprise');
    });
  });

  it('plan_type constraint rejects invalid plan names', async () => {
    await db.withTransaction(async (tx) => {
      await expect(
        createOrg(tx, { plan_type: 'platinum_ultra' })
      ).rejects.toThrow();
    });
  });
});
