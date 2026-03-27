/**
 * Budget Counter Durable Object
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Per-organization budget tracking and enforcement.
 *
 * Responsibilities:
 * - Maintain cumulative spend per customer per month
 * - Atomic increment on spend requests
 * - Budget checks (read-only)
 * - Persist to Supabase every 60s (backup)
 * - Graceful fallback if unreachable (assume budget OK)
 */

export class BudgetCounter {
  constructor(state, env) {
    this.state = state;
    this.env = env;

    // In-memory tracking
    this.monthlyBudget = {}; // orgId -> { budget: number, spent: number, month: string }
    this.alarmScheduled = false;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Initialization
  // ─────────────────────────────────────────────────────────────────────────────

  async initialize() {
    // Load from durable storage if exists
    const stored = await this.state.storage.get('budget-data');
    if (stored) {
      this.monthlyBudget = JSON.parse(stored);
    }

    // Schedule periodic persistence
    if (!this.alarmScheduled) {
      const alarmTime = Date.now() + 60000; // 60 seconds
      await this.state.storage.setAlarm(alarmTime);
      this.alarmScheduled = true;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Main interface
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Check if organization is within budget
   * @param {string} orgId
   * @param {number} monthlyBudget - Monthly budget limit in dollars
   * @returns {Promise<boolean>}
   */
  async checkBudget(orgId, monthlyBudget) {
    await this.initialize();

    const month = this._getCurrentMonth();
    const budget = this.monthlyBudget[orgId];

    // No budget tracked yet
    if (!budget) {
      return true; // Assume OK
    }

    // Wrong month — reset
    if (budget.month !== month) {
      this.monthlyBudget[orgId] = {
        budget: monthlyBudget,
        spent: 0,
        month,
      };
      return true;
    }

    // Check if within budget
    return budget.spent < budget.budget;
  }

  /**
   * Atomically increment spend for organization
   * @param {string} orgId
   * @param {number} amount - Cost to add
   * @param {number} monthlyBudget - Monthly budget limit
   * @returns {Promise<Object>} { success, new_spend, budget_exceeded }
   */
  async recordSpend(orgId, amount, monthlyBudget) {
    await this.initialize();

    const month = this._getCurrentMonth();

    // Initialize if needed
    if (!this.monthlyBudget[orgId]) {
      this.monthlyBudget[orgId] = {
        budget: monthlyBudget,
        spent: 0,
        month,
      };
    }

    const budget = this.monthlyBudget[orgId];

    // Reset if month changed
    if (budget.month !== month) {
      budget.month = month;
      budget.spent = 0;
      budget.budget = monthlyBudget;
    }

    // Atomic increment
    const newSpend = budget.spent + amount;
    budget.spent = newSpend;

    // Check if exceeded
    const exceeded = newSpend > budget.budget;

    return {
      success: true,
      new_spend: newSpend,
      budget_limit: budget.budget,
      budget_exceeded: exceeded,
    };
  }

  /**
   * Get current spend status
   * @param {string} orgId
   * @returns {Promise<Object>}
   */
  async getStatus(orgId) {
    await this.initialize();

    const budget = this.monthlyBudget[orgId];

    if (!budget) {
      return {
        organization_id: orgId,
        status: 'no_data',
        month: this._getCurrentMonth(),
      };
    }

    return {
      organization_id: orgId,
      status: budget.spent > budget.budget ? 'exceeded' : 'active',
      month: budget.month,
      spent: budget.spent,
      budget: budget.budget,
      remaining: Math.max(0, budget.budget - budget.spent),
      percent_used: Math.round((budget.spent / budget.budget) * 100),
    };
  }

  /**
   * Reset spend (monthly reset or admin action)
   * @param {string} orgId
   */
  async reset(orgId) {
    await this.initialize();

    if (this.monthlyBudget[orgId]) {
      this.monthlyBudget[orgId].spent = 0;
      this.monthlyBudget[orgId].month = this._getCurrentMonth();
    }

    return { success: true };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Scheduled persistence
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Called by alarm — persist budget data to Supabase backup every 60 seconds
   */
  async alarm() {
    try {
      // Persist to Supabase as backup
      const backupData = {
        timestamp: new Date().toISOString(),
        data: this.monthlyBudget,
      };

      // Fire-and-forget to Supabase
      this.env.SUPABASE_FUNCTION.fetch(
        `${this.env.SUPABASE_URL}/functions/v1/budget-backup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.env.SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify(backupData),
        }
      ).catch((err) => {
        console.warn(`[BUDGET-COUNTER] Backup failed: ${err.message}`);
        // Continue even if backup fails
      });

      // Save to durable storage
      await this.state.storage.put('budget-data', JSON.stringify(this.monthlyBudget));

      // Reschedule alarm
      const nextAlarm = Date.now() + 60000; // 60 seconds
      await this.state.storage.setAlarm(nextAlarm);
    } catch (err) {
      console.error(`[BUDGET-COUNTER] Alarm failed: ${err.message}`);
      // Reschedule to try again
      const nextAlarm = Date.now() + 60000;
      await this.state.storage.setAlarm(nextAlarm);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Request handling (Durable Object fetch interface)
  // ─────────────────────────────────────────────────────────────────────────────

  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    try {
      if (path === '/check' && method === 'POST') {
        const { org_id, monthly_budget } = await request.json();
        const result = await this.checkBudget(org_id, monthly_budget);
        return new Response(JSON.stringify({ ok: result }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (path === '/spend' && method === 'POST') {
        const { org_id, amount, monthly_budget } = await request.json();
        const result = await this.recordSpend(org_id, amount, monthly_budget);
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (path === '/status' && method === 'GET') {
        const orgId = url.searchParams.get('org_id');
        const result = await this.getStatus(orgId);
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (path === '/reset' && method === 'POST') {
        const { org_id } = await request.json();
        const result = await this.reset(org_id);
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response('Not found', { status: 404 });
    } catch (error) {
      console.error(`[BUDGET-COUNTER] Error: ${error.message}`);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  _getCurrentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}

export default BudgetCounter;
