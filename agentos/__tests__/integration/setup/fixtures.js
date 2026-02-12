/**
 * Finault Integration Test — Fixtures
 *
 * Test data builders for creating realistic records in the database.
 * All functions insert real rows and return the full record.
 * Use with withTransaction() for automatic cleanup.
 */

import { randomUUID } from 'crypto';

// ─── Organization ─────────────────────────────────────────────────────────────

const ORG_DEFAULTS = {
  name: 'Test Organization',
  slug: 'test-org',
  plan_type: 'professional',
  billing_email: 'billing@test.com',
  currency: 'USD',
  timezone: 'UTC',
  language: 'en',
  is_active: true,
};

/**
 * Create an organization. Returns full record.
 * @param {object} client - Transaction client
 * @param {object} overrides - Field overrides
 * @returns {Promise<object>} Created organization record
 */
export async function createOrg(client, overrides = {}) {
  const suffix = randomUUID().slice(0, 8);
  const data = {
    ...ORG_DEFAULTS,
    name: `Test Org ${suffix}`,
    slug: `test-org-${suffix}`,
    billing_email: `billing-${suffix}@test.com`,
    ...overrides,
  };

  const result = await client.query(
    `INSERT INTO organizations (name, slug, plan_type, billing_email, currency, timezone, language, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [data.name, data.slug, data.plan_type, data.billing_email, data.currency, data.timezone, data.language, data.is_active]
  );

  return result.rows[0];
}

// ─── User ─────────────────────────────────────────────────────────────────────

const USER_DEFAULTS = {
  email: 'user@test.com',
  first_name: 'Test',
  last_name: 'User',
  role: 'admin',
  is_active: true,
  email_verified: true,
};

/**
 * Create a user in an organization.
 * Also creates a corresponding auth.users record for RLS compatibility.
 * @param {object} client - Transaction client
 * @param {string} orgId - Organization UUID
 * @param {object} overrides - Field overrides
 * @returns {Promise<object>} Created user record
 */
export async function createUser(client, orgId, overrides = {}) {
  const suffix = randomUUID().slice(0, 8);
  const data = {
    ...USER_DEFAULTS,
    email: `user-${suffix}@test.com`,
    ...overrides,
  };

  // Create auth.users record first (FK reference)
  const authResult = await client.query(
    `INSERT INTO auth.users (email) VALUES ($1) RETURNING id`,
    [data.email]
  );
  const authId = authResult.rows[0].id;

  const result = await client.query(
    `INSERT INTO users (auth_id, email, first_name, last_name, organization_id, role, is_active, email_verified)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [authId, data.email, data.first_name, data.last_name, orgId, data.role, data.is_active, data.email_verified]
  );

  return result.rows[0];
}

// ─── Invoice ──────────────────────────────────────────────────────────────────

const INVOICE_DEFAULTS = {
  provider: 'aws',
  total_amount: 5000.00,
  currency: 'USD',
  status: 'pending',
  tax_amount: 0,
};

/**
 * Create an invoice for an organization.
 * @param {object} client - Transaction client
 * @param {string} orgId - Organization UUID
 * @param {object} overrides - Field overrides
 * @returns {Promise<object>} Created invoice record
 */
export async function createInvoice(client, orgId, overrides = {}) {
  const suffix = randomUUID().slice(0, 8);
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const data = {
    ...INVOICE_DEFAULTS,
    invoice_number: `INV-${suffix}`,
    billing_period_start: firstOfMonth.toISOString().split('T')[0],
    billing_period_end: lastOfMonth.toISOString().split('T')[0],
    invoice_date: now.toISOString().split('T')[0],
    ...overrides,
  };

  const result = await client.query(
    `INSERT INTO invoices (organization_id, invoice_number, provider, billing_period_start, billing_period_end,
     invoice_date, total_amount, currency, tax_amount, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [orgId, data.invoice_number, data.provider, data.billing_period_start, data.billing_period_end,
     data.invoice_date, data.total_amount, data.currency, data.tax_amount, data.status]
  );

  return result.rows[0];
}

// ─── Invoice Line Items ───────────────────────────────────────────────────────

/**
 * Create invoice line items for an invoice.
 * @param {object} client - Transaction client
 * @param {string} invoiceId - Invoice UUID
 * @param {Array<object>} items - Array of { description, amount, service, quantity }
 * @returns {Promise<object[]>} Created line item records
 */
export async function createInvoiceLineItems(client, invoiceId, orgId, items = null) {
  const defaultItems = [
    { service_name: 'ec2', service_category: 'compute', quantity: 744, unit: 'hours', unit_price: 3.36, total_price: 2500.00 },
    { service_name: 's3', service_category: 'storage', quantity: 1500, unit: 'GB', unit_price: 1.00, total_price: 1500.00 },
    { service_name: 'rds', service_category: 'database', quantity: 744, unit: 'hours', unit_price: 1.34, total_price: 1000.00 },
  ];

  const lineItems = items || defaultItems;
  const results = [];

  for (const item of lineItems) {
    const result = await client.query(
      `INSERT INTO invoice_line_items (invoice_id, organization_id, service_name, service_category, quantity, unit, unit_price, total_price)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [invoiceId, orgId, item.service_name, item.service_category, item.quantity, item.unit, item.unit_price, item.total_price]
    );
    results.push(result.rows[0]);
  }

  return results;
}

// ─── Budget ───────────────────────────────────────────────────────────────────

const BUDGET_DEFAULTS = {
  name: 'Engineering Budget',
  monthly_limit: 10000.00,
  status: 'active',
  currency: 'USD',
};

/**
 * Create a budget for an organization.
 * @param {object} client - Transaction client
 * @param {string} orgId - Organization UUID
 * @param {object} overrides - Field overrides
 * @returns {Promise<object>} Created budget record
 */
export async function createBudget(client, orgId, userId, overrides = {}) {
  const data = { ...BUDGET_DEFAULTS, cost_center: 'engineering', fiscal_year: 2026, start_month: 1, end_month: 12, ...overrides };

  const result = await client.query(
    `INSERT INTO budgets (organization_id, created_by_id, name, cost_center, monthly_limit, fiscal_year, start_month, end_month, status, currency)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [orgId, userId, data.name, data.cost_center, data.monthly_limit, data.fiscal_year, data.start_month, data.end_month, data.status, data.currency]
  );

  return result.rows[0];
}

// ─── Allocation Rules ─────────────────────────────────────────────────────────

/**
 * Create an allocation rule for an organization.
 * @param {object} client - Transaction client
 * @param {string} orgId - Organization UUID
 * @param {object} overrides - Field overrides
 * @returns {Promise<object>} Created allocation rule record
 */
export async function createAllocationRule(client, orgId, userId, overrides = {}) {
  const suffix = randomUUID().slice(0, 8);
  const data = {
    name: `Allocation Rule ${suffix}`,
    method: 'percentage',
    match_criteria: JSON.stringify({ provider: 'aws' }),
    target_allocation: JSON.stringify([
      { cost_center: 'engineering', percentage: 60 },
      { cost_center: 'marketing', percentage: 40 },
    ]),
    is_active: true,
    ...overrides,
  };

  const result = await client.query(
    `INSERT INTO allocation_rules (organization_id, created_by_id, name, method, match_criteria, target_allocation, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [orgId, userId, data.name, data.method, data.match_criteria, data.target_allocation, data.is_active]
  );

  return result.rows[0];
}

// ─── Audit Trail ──────────────────────────────────────────────────────────────

/**
 * Create an audit trail entry.
 * @param {object} client - Transaction client
 * @param {string} orgId - Organization UUID
 * @param {object} overrides - Field overrides
 * @returns {Promise<object>} Created audit trail record
 */
export async function createAuditEntry(client, orgId, overrides = {}) {
  const data = {
    action: 'create',
    resource_type: 'invoice',
    resource_id: randomUUID(),
    changes: JSON.stringify({ source: 'integration_test' }),
    ...overrides,
  };

  const result = await client.query(
    `INSERT INTO audit_trail (organization_id, action, resource_type, resource_id, changes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [orgId, data.action, data.resource_type, data.resource_id, data.changes]
  );

  return result.rows[0];
}

// ─── Close Pack ───────────────────────────────────────────────────────────────

/**
 * Create a close pack record.
 * @param {object} client - Transaction client
 * @param {string} orgId - Organization UUID
 * @param {object} overrides - Field overrides
 * @returns {Promise<object>} Created close pack record
 */
export async function createClosePack(client, orgId, userId, overrides = {}) {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const data = {
    period_start: firstOfMonth.toISOString().split('T')[0],
    period_end: lastOfMonth.toISOString().split('T')[0],
    status: 'generated',
    total_allocated_amount: 15000.00,
    ...overrides,
  };

  const result = await client.query(
    `INSERT INTO close_packs (organization_id, generated_by_id, period_start, period_end, status, total_allocated_amount)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [orgId, userId, data.period_start, data.period_end, data.status, data.total_allocated_amount]
  );

  return result.rows[0];
}

// ─── Anomaly ──────────────────────────────────────────────────────────────────

/**
 * Create an anomaly record.
 * @param {object} client - Transaction client
 * @param {string} orgId - Organization UUID
 * @param {object} overrides - Field overrides
 * @returns {Promise<object>} Created anomaly record
 */
export async function createAnomaly(client, orgId, overrides = {}) {
  const data = {
    severity: 'high',
    type: 'spike',
    service_name: 'ec2',
    actual_value: 7500.00,
    expected_value: 2500.00,
    deviation_percentage: 200.00,
    root_cause_analysis: 'Unexpected 300% increase in EC2 spend',
    ...overrides,
  };

  const result = await client.query(
    `INSERT INTO anomalies (organization_id, severity, type, service_name, actual_value, expected_value, deviation_percentage, root_cause_analysis)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [orgId, data.severity, data.type, data.service_name, data.actual_value, data.expected_value, data.deviation_percentage, data.root_cause_analysis]
  );

  return result.rows[0];
}

// ─── Tenant Context Helper ────────────────────────────────────────────────────

/**
 * Set tenant context for RLS policy evaluation.
 * Call this before any queries that should be filtered by RLS.
 *
 * @param {object} client - Transaction client
 * @param {string} orgId - Organization UUID
 * @param {string} role - User role (admin, finance_lead, cost_optimizer, auditor, viewer)
 */
export async function setTenantContext(client, orgId, role = 'admin') {
  await client.query(`SET LOCAL app.current_org_id = '${orgId}'`);
  await client.query(`SET LOCAL app.current_user_role = '${role}'`);
}

/**
 * Clear tenant context (simulate unauthenticated/no-org request).
 */
export async function clearTenantContext(client) {
  await client.query(`SET LOCAL app.current_org_id = ''`);
  await client.query(`SET LOCAL app.current_user_role = ''`);
}
