/**
 * Customer Budget Management Handlers
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Handlers for per-customer cost budgets tied to revenue:
 * - CRUD operations (Create, Read, Update, Delete)
 * - Budget checking (current usage vs limit)
 * - Budget enforcement (alerting, throttling, blocking)
 * - Revenue-based budget adjustment
 * - Real-time budget status
 *
 * SQL Schema:
 * ───────────────────────────────────────────────────────────────────────────────
 * CREATE TABLE IF NOT EXISTS customer_budgets (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   org_id UUID NOT NULL,
 *   cost_center TEXT NOT NULL,
 *   budget_type TEXT NOT NULL DEFAULT 'revenue_pct' CHECK (budget_type IN ('fixed', 'revenue_pct')),
 *   monthly_limit DECIMAL(15,4),
 *   revenue_pct_cap DECIMAL(5,2) DEFAULT 80.00,
 *   auto_adjust BOOLEAN DEFAULT true,
 *   action_on_exceed TEXT DEFAULT 'alert' CHECK (action_on_exceed IN ('alert', 'throttle', 'block')),
 *   alert_thresholds JSONB DEFAULT '[75, 90, 100]',
 *   status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
 *   current_period TEXT,
 *   current_spend DECIMAL(15,4) DEFAULT 0,
 *   last_refreshed_at TIMESTAMPTZ DEFAULT NOW(),
 *   created_at TIMESTAMPTZ DEFAULT NOW(),
 *   updated_at TIMESTAMPTZ DEFAULT NOW(),
 *   UNIQUE(org_id, cost_center)
 * );
 *
 * CREATE INDEX IF NOT EXISTS idx_customer_budgets_org ON customer_budgets(org_id);
 * CREATE INDEX IF NOT EXISTS idx_customer_budgets_lookup ON customer_budgets(org_id, cost_center, status);
 * ALTER TABLE customer_budgets ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY customer_budgets_all ON customer_budgets FOR ALL USING (true);
 */

import { jsonResponse, errorResponse } from '../utils.js';
import { getOrgIdFromAuth } from '../auth.js';

/**
 * Get Supabase authorization headers for database access
 * @param {Object} env - Cloudflare environment object
 * @returns {Object} Authorization headers
 */
const getSupabaseHeaders = (env) => {
  return {
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'apikey': env.SUPABASE_API_KEY,
    'Content-Type': 'application/json'
  };
};

/**
 * Get the current billing period (YYYY-MM format)
 * @returns {string} Current period
 */
const getCurrentPeriod = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Calculate days remaining in the current month
 * @returns {number} Days remaining
 */
const getDaysRemainingInMonth = () => {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return lastDay.getDate() - now.getDate();
};

/**
 * Calculate utilization percentage
 * @param {number} currentSpend - Current spending
 * @param {number} monthlyLimit - Monthly budget limit
 * @returns {number} Utilization percentage (0-100+)
 */
const calculateUtilization = (currentSpend, monthlyLimit) => {
  if (!monthlyLimit || monthlyLimit <= 0) return 0;
  return Math.round((currentSpend / monthlyLimit) * 100);
};

/**
 * List all customer-specific budgets for the organization
 * GET /v1/budgets/customers
 * Query params: ?status=active|exceeded|warning
 *
 * @param {Request} request - HTTP request object
 * @param {Object} env - Cloudflare environment
 * @returns {Promise<Response>} List of customer budgets
 */
const handleListCustomerBudgets = async (request, env) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get('status');

    // Query customer budgets from Supabase
    const query = new URL(`${env.SUPABASE_URL}/rest/v1/customer_budgets`, env.SUPABASE_URL);
    query.searchParams.set('org_id', `eq.${orgId}`);
    query.searchParams.set('status', `eq.active`);
    query.searchParams.set('select', '*');

    const response = await fetch(query.toString(), {
      headers: getSupabaseHeaders(env)
    });

    if (!response.ok) {
      console.error(`[CUSTOMER_BUDGETS] Supabase query failed: ${response.status}`);
      return errorResponse('DB_ERROR', 'Failed to retrieve customer budgets', response.status);
    }

    const budgets = await response.json();

    // Process and enrich budget data
    const enrichedBudgets = budgets.map(budget => {
      const utilization = calculateUtilization(budget.current_spend, budget.monthly_limit);
      const status = utilization >= 100 ? 'exceeded' : utilization >= 75 ? 'warning' : 'active';

      return {
        cost_center: budget.cost_center,
        budget_type: budget.budget_type,
        monthly_limit: parseFloat(budget.monthly_limit),
        revenue_pct_cap: budget.revenue_pct_cap ? parseFloat(budget.revenue_pct_cap) : null,
        auto_adjust: budget.auto_adjust,
        current_spend: parseFloat(budget.current_spend),
        remaining: Math.max(0, parseFloat(budget.monthly_limit) - parseFloat(budget.current_spend)),
        utilization_pct: utilization,
        status: status,
        action_on_exceed: budget.action_on_exceed,
        alert_thresholds: budget.alert_thresholds || [75, 90, 100],
        last_refreshed_at: budget.last_refreshed_at,
        created_at: budget.created_at,
        updated_at: budget.updated_at
      };
    });

    // Apply status filter if specified
    const filtered = statusFilter
      ? enrichedBudgets.filter(b => b.status === statusFilter)
      : enrichedBudgets;

    return jsonResponse({
      orgId,
      total: filtered.length,
      budgets: filtered
    });
  } catch (error) {
    console.error(`[CUSTOMER_BUDGETS] List error: ${error.message}`);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * Create a new customer-specific budget
 * POST /v1/budgets/customers
 *
 * Request body:
 * {
 *   cost_center: string (required) - e.g., "customer:acme"
 *   budget_type: 'fixed' | 'revenue_pct' (default: 'revenue_pct')
 *   monthly_limit: number - fixed dollar amount (for fixed type)
 *   revenue_pct_cap: number - percentage of revenue (default: 80)
 *   auto_adjust: boolean (default: true)
 *   action_on_exceed: 'alert' | 'throttle' | 'block' (default: 'alert')
 *   alert_thresholds: number[] (default: [75, 90, 100])
 * }
 *
 * @param {Request} request - HTTP request object
 * @param {Object} env - Cloudflare environment
 * @returns {Promise<Response>} Created budget details
 */
const handleCreateCustomerBudget = async (request, env) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const body = await request.json();

    // Validate required fields
    if (!body.cost_center || typeof body.cost_center !== 'string') {
      return errorResponse('INVALID_REQUEST', 'Missing or invalid required field: cost_center');
    }

    // Validate budget type
    const budgetType = body.budget_type || 'revenue_pct';
    if (!['fixed', 'revenue_pct'].includes(budgetType)) {
      return errorResponse('INVALID_REQUEST', 'budget_type must be "fixed" or "revenue_pct"');
    }

    // Validate action_on_exceed
    const actionOnExceed = body.action_on_exceed || 'alert';
    if (!['alert', 'throttle', 'block'].includes(actionOnExceed)) {
      return errorResponse('INVALID_REQUEST', 'action_on_exceed must be "alert", "throttle", or "block"');
    }

    // Determine monthly limit
    let monthlyLimit = body.monthly_limit;

    if (budgetType === 'revenue_pct') {
      // Look up customer revenue from revenue_entries table
      const revQuery = new URL(`${env.SUPABASE_URL}/rest/v1/revenue_entries`, env.SUPABASE_URL);
      revQuery.searchParams.set('cost_center', `eq.${body.cost_center}`);
      revQuery.searchParams.set('period', `eq.${getCurrentPeriod()}`);
      revQuery.searchParams.set('select', 'amount');
      revQuery.searchParams.set('limit', '1');

      const revResponse = await fetch(revQuery.toString(), {
        headers: getSupabaseHeaders(env)
      });

      if (revResponse.ok) {
        const revData = await revResponse.json();
        if (revData.length > 0) {
          const revenue = parseFloat(revData[0].amount);
          const revenuePctCap = body.revenue_pct_cap || 80;
          monthlyLimit = (revenue * revenuePctCap) / 100;
        } else {
          // No revenue data yet, use provided limit or default
          monthlyLimit = body.monthly_limit || 1000;
        }
      } else {
        monthlyLimit = body.monthly_limit || 1000;
      }
    } else if (!monthlyLimit || typeof monthlyLimit !== 'number') {
      return errorResponse('INVALID_REQUEST', 'monthly_limit required for fixed budget type');
    }

    // Create new budget record
    const budgetId = crypto.randomUUID();
    const now = new Date().toISOString();
    const currentPeriod = getCurrentPeriod();

    const newBudget = {
      id: budgetId,
      org_id: orgId,
      cost_center: body.cost_center,
      budget_type: budgetType,
      monthly_limit: monthlyLimit,
      revenue_pct_cap: body.revenue_pct_cap || 80,
      auto_adjust: body.auto_adjust !== false,
      action_on_exceed: actionOnExceed,
      alert_thresholds: body.alert_thresholds || [75, 90, 100],
      status: 'active',
      current_period: currentPeriod,
      current_spend: 0,
      last_refreshed_at: now,
      created_at: now,
      updated_at: now
    };

    // Insert into Supabase
    const insertResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/customer_budgets`,
      {
        method: 'POST',
        headers: getSupabaseHeaders(env),
        body: JSON.stringify(newBudget)
      }
    );

    if (!insertResponse.ok) {
      const errorData = await insertResponse.text();
      console.error(`[CUSTOMER_BUDGETS] Insert failed: ${insertResponse.status} - ${errorData}`);
      return errorResponse('DB_ERROR', 'Failed to create customer budget', insertResponse.status);
    }

    return jsonResponse(newBudget, 201);
  } catch (error) {
    console.error(`[CUSTOMER_BUDGETS] Create error: ${error.message}`);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * Update an existing customer budget
 * PUT /v1/budgets/customers/:costCenter
 *
 * @param {Request} request - HTTP request object
 * @param {Object} env - Cloudflare environment
 * @param {string} costCenter - Cost center identifier (URL parameter)
 * @returns {Promise<Response>} Updated budget details
 */
const handleUpdateCustomerBudget = async (request, env, costCenter) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const body = await request.json();

    // Validate cost center
    if (!costCenter || typeof costCenter !== 'string') {
      return errorResponse('INVALID_REQUEST', 'Valid cost_center required in URL');
    }

    // Get existing budget
    const getQuery = new URL(`${env.SUPABASE_URL}/rest/v1/customer_budgets`, env.SUPABASE_URL);
    getQuery.searchParams.set('org_id', `eq.${orgId}`);
    getQuery.searchParams.set('cost_center', `eq.${costCenter}`);
    getQuery.searchParams.set('select', '*');

    const getResponse = await fetch(getQuery.toString(), {
      headers: getSupabaseHeaders(env)
    });

    if (!getResponse.ok) {
      return errorResponse('DB_ERROR', 'Failed to fetch budget', getResponse.status);
    }

    const budgets = await getResponse.json();
    if (budgets.length === 0) {
      return errorResponse('NOT_FOUND', `Budget not found for cost_center: ${costCenter}`, 404);
    }

    const existingBudget = budgets[0];

    // Prepare updates
    const updates = {
      ...existingBudget
    };

    if (body.budget_type) {
      if (!['fixed', 'revenue_pct'].includes(body.budget_type)) {
        return errorResponse('INVALID_REQUEST', 'budget_type must be "fixed" or "revenue_pct"');
      }
      updates.budget_type = body.budget_type;
    }

    if (body.monthly_limit !== undefined) {
      updates.monthly_limit = body.monthly_limit;
    }

    if (body.revenue_pct_cap !== undefined) {
      updates.revenue_pct_cap = body.revenue_pct_cap;
    }

    if (body.auto_adjust !== undefined) {
      updates.auto_adjust = body.auto_adjust;
    }

    if (body.action_on_exceed) {
      if (!['alert', 'throttle', 'block'].includes(body.action_on_exceed)) {
        return errorResponse('INVALID_REQUEST', 'action_on_exceed must be "alert", "throttle", or "block"');
      }
      updates.action_on_exceed = body.action_on_exceed;
    }

    if (body.alert_thresholds) {
      updates.alert_thresholds = body.alert_thresholds;
    }

    updates.updated_at = new Date().toISOString();

    // Update in Supabase
    const updateResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/customer_budgets?org_id=eq.${orgId}&cost_center=eq.${costCenter}`,
      {
        method: 'PATCH',
        headers: getSupabaseHeaders(env),
        body: JSON.stringify(updates)
      }
    );

    if (!updateResponse.ok) {
      const errorData = await updateResponse.text();
      console.error(`[CUSTOMER_BUDGETS] Update failed: ${updateResponse.status} - ${errorData}`);
      return errorResponse('DB_ERROR', 'Failed to update customer budget', updateResponse.status);
    }

    return jsonResponse(updates);
  } catch (error) {
    console.error(`[CUSTOMER_BUDGETS] Update error: ${error.message}`);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * Soft delete a customer budget (sets status to inactive)
 * DELETE /v1/budgets/customers/:costCenter
 *
 * @param {Request} request - HTTP request object
 * @param {Object} env - Cloudflare environment
 * @param {string} costCenter - Cost center identifier (URL parameter)
 * @returns {Promise<Response>} Deletion confirmation
 */
const handleDeleteCustomerBudget = async (request, env, costCenter) => {
  try {
    const orgId = getOrgIdFromAuth(request);

    // Validate cost center
    if (!costCenter || typeof costCenter !== 'string') {
      return errorResponse('INVALID_REQUEST', 'Valid cost_center required in URL');
    }

    // Soft delete by setting status to inactive
    const updateResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/customer_budgets?org_id=eq.${orgId}&cost_center=eq.${costCenter}`,
      {
        method: 'PATCH',
        headers: getSupabaseHeaders(env),
        body: JSON.stringify({
          status: 'inactive',
          updated_at: new Date().toISOString()
        })
      }
    );

    if (!updateResponse.ok) {
      const errorData = await updateResponse.text();
      console.error(`[CUSTOMER_BUDGETS] Delete failed: ${updateResponse.status} - ${errorData}`);
      return errorResponse('DB_ERROR', 'Failed to delete customer budget', updateResponse.status);
    }

    return jsonResponse({
      deleted: true,
      cost_center: costCenter,
      orgId
    });
  } catch (error) {
    console.error(`[CUSTOMER_BUDGETS] Delete error: ${error.message}`);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * Get real-time budget status for a specific customer
 * GET /v1/budgets/customers/:costCenter/status
 *
 * @param {Request} request - HTTP request object
 * @param {Object} env - Cloudflare environment
 * @param {string} costCenter - Cost center identifier (URL parameter)
 * @returns {Promise<Response>} Detailed budget status
 */
const handleCheckCustomerBudget = async (request, env, costCenter) => {
  try {
    const orgId = getOrgIdFromAuth(request);

    // Validate cost center
    if (!costCenter || typeof costCenter !== 'string') {
      return errorResponse('INVALID_REQUEST', 'Valid cost_center required in URL');
    }

    // Fetch budget
    const getQuery = new URL(`${env.SUPABASE_URL}/rest/v1/customer_budgets`, env.SUPABASE_URL);
    getQuery.searchParams.set('org_id', `eq.${orgId}`);
    getQuery.searchParams.set('cost_center', `eq.${costCenter}`);
    getQuery.searchParams.set('status', `eq.active`);
    getQuery.searchParams.set('select', '*');

    const getResponse = await fetch(getQuery.toString(), {
      headers: getSupabaseHeaders(env)
    });

    if (!getResponse.ok) {
      return errorResponse('DB_ERROR', 'Failed to fetch budget status', getResponse.status);
    }

    const budgets = await getResponse.json();
    if (budgets.length === 0) {
      return errorResponse('NOT_FOUND', `Budget not found for cost_center: ${costCenter}`, 404);
    }

    const budget = budgets[0];
    const currentSpend = parseFloat(budget.current_spend);
    const monthlyLimit = parseFloat(budget.monthly_limit);
    const utilization = calculateUtilization(currentSpend, monthlyLimit);
    const daysRemaining = getDaysRemainingInMonth();
    const dailyBudget = monthlyLimit / 30;
    const projectedMonthEnd = currentSpend + (dailyBudget * daysRemaining);

    return jsonResponse({
      cost_center: budget.cost_center,
      budget_type: budget.budget_type,
      monthly_limit: monthlyLimit,
      current_spend: currentSpend,
      remaining: Math.max(0, monthlyLimit - currentSpend),
      utilization_pct: utilization,
      days_remaining_in_period: daysRemaining,
      projected_end_of_month_spend: Math.round(projectedMonthEnd * 100) / 100,
      will_exceed: projectedMonthEnd > monthlyLimit,
      projected_exceed_date: projectedMonthEnd > monthlyLimit
        ? new Date(new Date().getTime() + (daysRemaining * 24 * 60 * 60 * 1000)).toISOString().split('T')[0]
        : null,
      action_on_exceed: budget.action_on_exceed,
      alert_thresholds: budget.alert_thresholds,
      status: utilization >= 100 ? 'exceeded' : utilization >= 75 ? 'warning' : 'active',
      last_refreshed_at: budget.last_refreshed_at,
      updated_at: budget.updated_at
    });
  } catch (error) {
    console.error(`[CUSTOMER_BUDGETS] Check error: ${error.message}`);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * Check if a request would exceed customer budget
 * Called internally in request pipeline before proxying
 *
 * @param {string} orgId - Organization ID
 * @param {string} costCenter - Cost center identifier
 * @param {number} requestCost - Estimated cost of this request
 * @param {Object} env - Cloudflare environment
 * @returns {Promise<Object>} Budget check result
 *   {
 *     allowed: boolean,
 *     action: 'allow' | 'alert' | 'throttle' | 'block',
 *     utilization_pct: number,
 *     message: string
 *   }
 */
const checkCustomerBudget = async (orgId, costCenter, requestCost, env) => {
  try {
    // Fetch budget
    const getQuery = new URL(`${env.SUPABASE_URL}/rest/v1/customer_budgets`, env.SUPABASE_URL);
    getQuery.searchParams.set('org_id', `eq.${orgId}`);
    getQuery.searchParams.set('cost_center', `eq.${costCenter}`);
    getQuery.searchParams.set('status', `eq.active`);
    getQuery.searchParams.set('select', '*');

    const getResponse = await fetch(getQuery.toString(), {
      headers: getSupabaseHeaders(env)
    });

    if (!getResponse.ok || getResponse.status === 404) {
      // No budget configured, allow request
      return {
        allowed: true,
        action: 'allow',
        utilization_pct: 0,
        message: 'No budget configured for this customer'
      };
    }

    const budgets = await getResponse.json();
    if (budgets.length === 0) {
      return {
        allowed: true,
        action: 'allow',
        utilization_pct: 0,
        message: 'No active budget found'
      };
    }

    const budget = budgets[0];
    const currentSpend = parseFloat(budget.current_spend);
    const monthlyLimit = parseFloat(budget.monthly_limit);
    const projectedSpend = currentSpend + requestCost;
    const utilization = calculateUtilization(projectedSpend, monthlyLimit);
    const actionOnExceed = budget.action_on_exceed || 'alert';
    const alertThresholds = budget.alert_thresholds || [75, 90, 100];

    // Check if this request would exceed budget
    const wouldExceed = projectedSpend > monthlyLimit;
    const currentUtilization = calculateUtilization(currentSpend, monthlyLimit);

    // Determine action based on utilization and policy
    let action = 'allow';
    let message = `Request within budget (${utilization}% utilized)`;

    if (wouldExceed && actionOnExceed === 'block') {
      action = 'block';
      message = `Request would exceed budget limit. Current: $${currentSpend.toFixed(2)}, Request: $${requestCost.toFixed(2)}, Limit: $${monthlyLimit.toFixed(2)}`;
      return {
        allowed: false,
        action,
        utilization_pct: utilization,
        message
      };
    } else if (wouldExceed && actionOnExceed === 'throttle') {
      action = 'throttle';
      message = `Request would exceed budget. Applying throttle (2s delay)`;
      return {
        allowed: true,
        action,
        utilization_pct: utilization,
        message
      };
    } else if (currentUtilization >= 90) {
      action = 'alert';
      message = `Budget utilization critical: ${currentUtilization}%`;
      return {
        allowed: true,
        action,
        utilization_pct: utilization,
        message
      };
    } else if (alertThresholds.some(t => currentUtilization >= t && currentUtilization < (t + 5))) {
      action = 'alert';
      message = `Budget utilization warning: ${currentUtilization}%`;
      return {
        allowed: true,
        action,
        utilization_pct: utilization,
        message
      };
    }

    return {
      allowed: true,
      action,
      utilization_pct: utilization,
      message
    };
  } catch (error) {
    console.error(`[CUSTOMER_BUDGETS] Check error: ${error.message}`);
    // On error, allow the request but log the issue
    return {
      allowed: true,
      action: 'allow',
      utilization_pct: 0,
      message: 'Budget check unavailable (allowing request)'
    };
  }
};

/**
 * Refresh revenue-based budgets with current revenue data
 * POST /v1/budgets/customers/refresh
 * Recalculates monthly_limit for all revenue_pct budgets
 *
 * @param {Request} request - HTTP request object
 * @param {Object} env - Cloudflare environment
 * @returns {Promise<Response>} Refresh operation result
 */
const handleRefreshRevenueBudgets = async (request, env) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const currentPeriod = getCurrentPeriod();

    // Fetch all revenue_pct budgets for this org
    const getQuery = new URL(`${env.SUPABASE_URL}/rest/v1/customer_budgets`, env.SUPABASE_URL);
    getQuery.searchParams.set('org_id', `eq.${orgId}`);
    getQuery.searchParams.set('budget_type', `eq.revenue_pct`);
    getQuery.searchParams.set('status', `eq.active`);
    getQuery.searchParams.set('select', '*');

    const getResponse = await fetch(getQuery.toString(), {
      headers: getSupabaseHeaders(env)
    });

    if (!getResponse.ok) {
      return errorResponse('DB_ERROR', 'Failed to fetch budgets for refresh', getResponse.status);
    }

    const budgets = await getResponse.json();
    const refreshed = [];
    const failed = [];

    // Process each budget
    for (const budget of budgets) {
      try {
        // Fetch current revenue for this cost center
        const revQuery = new URL(`${env.SUPABASE_URL}/rest/v1/revenue_entries`, env.SUPABASE_URL);
        revQuery.searchParams.set('cost_center', `eq.${budget.cost_center}`);
        revQuery.searchParams.set('period', `eq.${currentPeriod}`);
        revQuery.searchParams.set('select', 'amount');
        revQuery.searchParams.set('limit', '1');

        const revResponse = await fetch(revQuery.toString(), {
          headers: getSupabaseHeaders(env)
        });

        let newMonthlyLimit = parseFloat(budget.monthly_limit);

        if (revResponse.ok) {
          const revData = await revResponse.json();
          if (revData.length > 0) {
            const revenue = parseFloat(revData[0].amount);
            const revenuePctCap = parseFloat(budget.revenue_pct_cap) || 80;
            newMonthlyLimit = (revenue * revenuePctCap) / 100;
          }
        }

        // Update budget with new monthly limit
        const updateResponse = await fetch(
          `${env.SUPABASE_URL}/rest/v1/customer_budgets?org_id=eq.${orgId}&cost_center=eq.${budget.cost_center}`,
          {
            method: 'PATCH',
            headers: getSupabaseHeaders(env),
            body: JSON.stringify({
              monthly_limit: newMonthlyLimit,
              last_refreshed_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
          }
        );

        if (updateResponse.ok) {
          refreshed.push({
            cost_center: budget.cost_center,
            previous_limit: parseFloat(budget.monthly_limit),
            new_limit: newMonthlyLimit
          });
        } else {
          failed.push({
            cost_center: budget.cost_center,
            reason: `Update failed: ${updateResponse.status}`
          });
        }
      } catch (budgetError) {
        failed.push({
          cost_center: budget.cost_center,
          reason: budgetError.message
        });
      }
    }

    return jsonResponse({
      orgId,
      period: currentPeriod,
      refreshed_count: refreshed.length,
      failed_count: failed.length,
      refreshed,
      failed
    });
  } catch (error) {
    console.error(`[CUSTOMER_BUDGETS] Refresh error: ${error.message}`);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  handleListCustomerBudgets,
  handleCreateCustomerBudget,
  handleUpdateCustomerBudget,
  handleDeleteCustomerBudget,
  handleCheckCustomerBudget,
  handleRefreshRevenueBudgets,
  checkCustomerBudget,
  getSupabaseHeaders,
  getCurrentPeriod,
  getDaysRemainingInMonth,
  calculateUtilization
};

export default {
  handleListCustomerBudgets,
  handleCreateCustomerBudget,
  handleUpdateCustomerBudget,
  handleDeleteCustomerBudget,
  handleCheckCustomerBudget,
  handleRefreshRevenueBudgets,
  checkCustomerBudget,
  getSupabaseHeaders,
  getCurrentPeriod,
  getDaysRemainingInMonth,
  calculateUtilization
};
