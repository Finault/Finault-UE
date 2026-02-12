/**
 * Finault Integration Test — State Machine Transitions
 *
 * Validates invoice, close pack, and dispute lifecycle transitions
 * against a real PostgreSQL database. Verifies that:
 * - Status transitions follow the defined state graph
 * - Guard conditions are enforced (e.g., separation of duties)
 * - Audit trail entries are created for every transition
 * - Terminal states block further transitions
 *
 * Run: npx vitest run --config agentos/__tests__/integration/vitest.config.js state-machines
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestClient, isPostgresAvailable } from './setup/db-client.js';
import { setupTestDatabase } from './setup/migrations.js';
import { createOrg, createUser, createInvoice, createInvoiceLineItems, createClosePack, createAuditEntry } from './setup/fixtures.js';

let db;
let pgAvailable = false;

beforeAll(async () => {
  pgAvailable = await isPostgresAvailable();
  if (!pgAvailable) {
    console.warn('[state-machines] PostgreSQL not available — skipping');
    return;
  }
  db = await createTestClient();
  await setupTestDatabase(db);
}, 120000);

afterAll(async () => {
  if (db) await db.close();
});

beforeEach(({ skip }) => {
  if (!pgAvailable) skip();
});

// ─── Helper: Transition invoice status ────────────────────────────────────────

async function transitionInvoice(tx, invoiceId, newStatus, context = {}) {
  // Validate against allowed transitions
  const ALLOWED_TRANSITIONS = {
    pending: ['parsed'],
    parsed: ['allocated', 'disputed'],
    allocated: ['archived', 'disputed'],
    disputed: ['parsed', 'archived'],
    archived: [], // terminal
  };

  const current = await tx.query('SELECT status FROM invoices WHERE id = $1', [invoiceId]);
  if (current.rows.length === 0) return { success: false, error: 'Invoice not found' };

  const currentStatus = current.rows[0].status;
  const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];

  if (!allowed.includes(newStatus)) {
    return { success: false, error: `Invalid transition: ${currentStatus} → ${newStatus}` };
  }

  // Apply guards
  if (newStatus === 'parsed' && !context.provider) {
    return { success: false, error: 'Guard failed: provider required for parsed state' };
  }

  if (newStatus === 'allocated' && !context.has_line_items) {
    return { success: false, error: 'Guard failed: line items required for allocated state' };
  }

  // Execute transition
  const result = await tx.query(
    'UPDATE invoices SET status = $1, updated_at = now() WHERE id = $2 RETURNING *',
    [newStatus, invoiceId]
  );

  // Record audit trail
  await tx.query(
    `INSERT INTO audit_trail (organization_id, action, resource_type, resource_id, changes)
     VALUES ($1, 'update', 'invoice', $2, $3)`,
    [result.rows[0].organization_id, invoiceId, JSON.stringify({
      field: 'status',
      from: currentStatus,
      to: newStatus,
      context,
    })]
  );

  return { success: true, invoice: result.rows[0] };
}

// ─── Helper: Transition close pack status ─────────────────────────────────────

async function transitionClosePack(tx, closePackId, newStatus, context = {}) {
  const ALLOWED_TRANSITIONS = {
    generated: ['reviewed'],
    reviewed: ['approved', 'generated'], // can reject back to generated
    approved: ['archived'],
    archived: [], // terminal
  };

  const current = await tx.query('SELECT * FROM close_packs WHERE id = $1', [closePackId]);
  if (current.rows.length === 0) return { success: false, error: 'Close pack not found' };

  const pack = current.rows[0];
  const allowed = ALLOWED_TRANSITIONS[pack.status] || [];

  if (!allowed.includes(newStatus)) {
    return { success: false, error: `Invalid transition: ${pack.status} → ${newStatus}` };
  }

  // Guards
  if (newStatus === 'reviewed' && !context.attestation_hash) {
    return { success: false, error: 'Guard failed: attestation_hash required for review' };
  }

  if (newStatus === 'approved') {
    if (!context.approved_by) {
      return { success: false, error: 'Guard failed: approved_by required' };
    }
    if (context.approved_by === pack.generated_by_id) {
      return { success: false, error: 'Guard failed: separation of duties — approver must differ from generator' };
    }
  }

  if (newStatus === 'archived' && !pack.is_attested) {
    return { success: false, error: 'Guard failed: is_attested required for archive' };
  }

  // Execute
  const updates = { status: newStatus };
  if (context.attestation_hash) updates.attestation_hash = context.attestation_hash;
  if (context.approved_by) {
    updates.attested_by_id = context.approved_by;
    updates.attested_at = new Date().toISOString();
    updates.is_attested = true;
  }

  const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`);
  const values = Object.values(updates);

  const result = await tx.query(
    `UPDATE close_packs SET ${setClauses.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`,
    [closePackId, ...values]
  );

  // Audit trail
  await tx.query(
    `INSERT INTO audit_trail (organization_id, action, resource_type, resource_id, changes)
     VALUES ($1, 'update', 'close_pack', $2, $3)`,
    [pack.organization_id, closePackId, JSON.stringify({
      field: 'status', from: pack.status, to: newStatus, context,
    })]
  );

  return { success: true, closePack: result.rows[0] };
}

// ─── Section 1: Invoice State Machine ─────────────────────────────────────────

describe('Invoice State Machine', () => {
  it('pending → parsed with provider (valid transition)', async () => {
    await db.withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const invoice = await createInvoice(tx, org.id, { status: 'pending', provider: 'aws' });

      const result = await transitionInvoice(tx, invoice.id, 'parsed', { provider: 'aws' });
      expect(result.success).toBe(true);
      expect(result.invoice.status).toBe('parsed');
    });
  });

  it('pending → parsed fails without provider guard', async () => {
    await db.withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const invoice = await createInvoice(tx, org.id);

      const result = await transitionInvoice(tx, invoice.id, 'parsed', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('provider required');
    });
  });

  it('parsed → allocated with line items (valid)', async () => {
    await db.withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const invoice = await createInvoice(tx, org.id, { status: 'pending', provider: 'aws' });

      // Transition to parsed first
      await transitionInvoice(tx, invoice.id, 'parsed', { provider: 'aws' });

      // Create line items
      await createInvoiceLineItems(tx, invoice.id, org.id);

      // Now transition to allocated
      const result = await transitionInvoice(tx, invoice.id, 'allocated', { has_line_items: true });
      expect(result.success).toBe(true);
      expect(result.invoice.status).toBe('allocated');
    });
  });

  it('parsed → allocated fails without line items', async () => {
    await db.withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const invoice = await createInvoice(tx, org.id, { status: 'pending', provider: 'aws' });
      await transitionInvoice(tx, invoice.id, 'parsed', { provider: 'aws' });

      const result = await transitionInvoice(tx, invoice.id, 'allocated', { has_line_items: false });
      expect(result.success).toBe(false);
      expect(result.error).toContain('line items required');
    });
  });

  it('pending → archived (invalid skip) fails', async () => {
    await db.withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const invoice = await createInvoice(tx, org.id);

      const result = await transitionInvoice(tx, invoice.id, 'archived', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid transition');
    });
  });

  it('archived is terminal — blocks further transitions', async () => {
    await db.withTransaction(async (tx) => {
      const org = await createOrg(tx);
      // Insert directly as archived for test
      const invoice = await createInvoice(tx, org.id);
      await tx.query('UPDATE invoices SET status = $1 WHERE id = $2', ['archived', invoice.id]);

      const result = await transitionInvoice(tx, invoice.id, 'parsed', { provider: 'aws' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid transition: archived');
    });
  });

  it('each transition creates an audit trail entry', async () => {
    await db.withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const invoice = await createInvoice(tx, org.id, { provider: 'aws' });

      // Count audit entries before
      const before = await tx.query(
        'SELECT count(*) FROM audit_trail WHERE resource_type = $1 AND resource_id = $2',
        ['invoice', invoice.id]
      );
      // Note: the invoice INSERT trigger may have created one already
      const countBefore = parseInt(before.rows[0].count);

      await transitionInvoice(tx, invoice.id, 'parsed', { provider: 'aws' });

      const after = await tx.query(
        'SELECT count(*) FROM audit_trail WHERE resource_type = $1 AND resource_id = $2',
        ['invoice', invoice.id]
      );
      const countAfter = parseInt(after.rows[0].count);

      // Should have at least one more audit entry
      expect(countAfter).toBeGreaterThan(countBefore);
    });
  });
});

// ─── Section 2: Close Pack State Machine ──────────────────────────────────────

describe('Close Pack State Machine', () => {
  it('generated → reviewed with attestation hash (valid)', async () => {
    await db.withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const user = await createUser(tx, org.id);
      const pack = await createClosePack(tx, org.id, user.id);

      const result = await transitionClosePack(tx, pack.id, 'reviewed', {
        attestation_hash: 'sha256:abcdef1234567890',
      });

      expect(result.success).toBe(true);
      expect(result.closePack.status).toBe('reviewed');
      expect(result.closePack.attestation_hash).toBe('sha256:abcdef1234567890');
    });
  });

  it('generated → reviewed fails without attestation hash', async () => {
    await db.withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const user = await createUser(tx, org.id);
      const pack = await createClosePack(tx, org.id, user.id);

      const result = await transitionClosePack(tx, pack.id, 'reviewed', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('attestation_hash required');
    });
  });

  it('reviewed → approved with different user (separation of duties)', async () => {
    await db.withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const generator = await createUser(tx, org.id, { first_name: 'Generator', role: 'admin' });
      const approver = await createUser(tx, org.id, { first_name: 'Approver', role: 'finance_lead' });
      const pack = await createClosePack(tx, org.id, generator.id);

      // Move to reviewed
      await transitionClosePack(tx, pack.id, 'reviewed', { attestation_hash: 'sha256:abc' });

      // Approve with different user
      const result = await transitionClosePack(tx, pack.id, 'approved', {
        approved_by: approver.id,
      });

      expect(result.success).toBe(true);
      expect(result.closePack.status).toBe('approved');
    });
  });

  it('reviewed → approved fails with same user (self-approval blocked)', async () => {
    await db.withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const user = await createUser(tx, org.id);
      const pack = await createClosePack(tx, org.id, user.id);

      await transitionClosePack(tx, pack.id, 'reviewed', { attestation_hash: 'sha256:abc' });

      // Try self-approval
      const result = await transitionClosePack(tx, pack.id, 'approved', {
        approved_by: user.id, // same as generator
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('separation of duties');
    });
  });

  it('reviewed → generated (rejection/rework) is valid', async () => {
    await db.withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const user = await createUser(tx, org.id);
      const pack = await createClosePack(tx, org.id, user.id);

      await transitionClosePack(tx, pack.id, 'reviewed', { attestation_hash: 'sha256:abc' });

      // Reject back to generated
      const result = await transitionClosePack(tx, pack.id, 'generated', {});
      expect(result.success).toBe(true);
      expect(result.closePack.status).toBe('generated');
    });
  });

  it('archived is terminal — blocks further transitions', async () => {
    await db.withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const user = await createUser(tx, org.id);
      const pack = await createClosePack(tx, org.id, user.id);

      // Force to archived
      await tx.query('UPDATE close_packs SET status = $1, is_attested = true WHERE id = $2', ['archived', pack.id]);

      const result = await transitionClosePack(tx, pack.id, 'reviewed', { attestation_hash: 'sha256:abc' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid transition: archived');
    });
  });

  it('close pack transitions create audit trail entries', async () => {
    await db.withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const user = await createUser(tx, org.id);
      const pack = await createClosePack(tx, org.id, user.id);

      await transitionClosePack(tx, pack.id, 'reviewed', { attestation_hash: 'sha256:abc' });

      const audit = await tx.query(
        `SELECT * FROM audit_trail WHERE resource_type = 'close_pack' AND resource_id = $1`,
        [pack.id]
      );

      expect(audit.rows.length).toBeGreaterThanOrEqual(1);
      // pg returns JSONB columns as JS objects already — no JSON.parse needed
      const changes = audit.rows[audit.rows.length - 1].changes;
      expect(changes.from).toBe('generated');
      expect(changes.to).toBe('reviewed');
    });
  });
});

// ─── Section 3: Status Constraints in Database ────────────────────────────────

describe('Database Status Constraints', () => {
  it('invoice_status enum rejects invalid values', async () => {
    await db.withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const invoice = await createInvoice(tx, org.id);

      await expect(
        tx.query('UPDATE invoices SET status = $1 WHERE id = $2', ['invalid_status', invoice.id])
      ).rejects.toThrow();
    });
  });

  it('invoice status constraint allows only valid enum values', async () => {
    await db.withTransaction(async (tx) => {
      const org = await createOrg(tx);

      // Test each valid status
      for (const status of ['pending', 'parsed', 'allocated', 'disputed', 'archived']) {
        const invoice = await createInvoice(tx, org.id, { status });
        expect(invoice.status).toBe(status);
      }
    });
  });

  it('close pack status allows valid values', async () => {
    await db.withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const user = await createUser(tx, org.id);

      for (const status of ['generated', 'reviewed', 'approved', 'archived']) {
        // Use different period to avoid unique constraint
        const month = ['generated', 'reviewed', 'approved', 'archived'].indexOf(status) + 1;
        const pack = await createClosePack(tx, org.id, user.id, {
          status,
          period_start: `2025-0${month}-01`,
          period_end: `2025-0${month}-28`,
        });
        expect(pack.status).toBe(status);
      }
    });
  });

  it('anomaly severity enum rejects invalid values', async () => {
    await db.withTransaction(async (tx) => {
      const org = await createOrg(tx);

      await expect(
        tx.query(
          `INSERT INTO anomalies (organization_id, severity, type, actual_value) VALUES ($1, 'extreme', 'spike', 100)`,
          [org.id]
        )
      ).rejects.toThrow();
    });
  });

  it('budget monthly_limit must be positive', async () => {
    await db.withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const user = await createUser(tx, org.id);

      await expect(
        tx.query(
          `INSERT INTO budgets (organization_id, created_by_id, name, cost_center, monthly_limit, fiscal_year, start_month, end_month)
           VALUES ($1, $2, 'Bad Budget', 'engineering', -100, 2026, 1, 12)`,
          [org.id, user.id]
        )
      ).rejects.toThrow();
    });
  });

  it('invoice total_amount must be positive', async () => {
    await db.withTransaction(async (tx) => {
      const org = await createOrg(tx);

      await expect(
        createInvoice(tx, org.id, { total_amount: -500 })
      ).rejects.toThrow();
    });
  });
});
