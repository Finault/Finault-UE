/**
 * Budget Management Handlers
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Handlers for budget operations:
 * - CRUD operations (Create, Read, Update, Delete)
 * - Budget checking (current usage vs limit)
 * - Forecasting (projected spend)
 * - Allocation rules
 * - Alerts and warnings
 */

import { jsonResponse, errorResponse } from '../utils.js';
import { getOrgIdFromAuth } from '../auth.js';

/**
 * Handle budget list and creation
 * GET: List all budgets for organization
 * POST: Create new budget
 */
const handleBudgetList = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);

    if (request.method === 'GET') {
      // List budgets
      const period = new URL(request.url).searchParams.get('period') || 'monthly';

      // In full implementation, query Supabase for budgets
      return jsonResponse({
        orgId,
        period,
        budgets: [
          // { id: '...', name: '...', limit: 10000, spent: 5000, ... }
        ]
      });
    }

    if (request.method === 'POST') {
      // Create budget
      const body = await request.json();

      // Validate required fields
      if (!body.name || !body.limit) {
        return errorResponse('INVALID_REQUEST', 'Missing required fields: name, limit');
      }

      // Create in Supabase
      const budget = {
        id: crypto.randomUUID(),
        orgId,
        name: body.name,
        limit: body.limit,
        period: body.period || 'monthly',
        alert_threshold: body.alert_threshold || 80,
        createdAt: new Date().toISOString(),
        spent: 0
      };

      return jsonResponse(budget, 201);
    }

    return errorResponse('METHOD_NOT_ALLOWED', `${request.method} not supported`);
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * Handle budget operations by ID
 * GET: Retrieve budget details
 * PUT: Update budget
 * DELETE: Remove budget
 */
const handleBudgetById = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const budgetId = request.params?.id;

    if (!budgetId) {
      return errorResponse('INVALID_REQUEST', 'Budget ID required');
    }

    if (request.method === 'GET') {
      // Get budget details
      return jsonResponse({
        id: budgetId,
        orgId,
        name: 'Monthly LLM Budget',
        limit: 10000,
        spent: 4500,
        period: 'monthly',
        alert_threshold: 80,
        status: 'active',
        details: {
          by_provider: [
            // { provider: 'OpenAI', spent: 2000 },
            // { provider: 'Anthropic', spent: 2500 }
          ],
          warning_level: false,
          threshold_warning: 'Budget at 45%'
        }
      });
    }

    if (request.method === 'PUT') {
      // Update budget
      const updates = await request.json();

      return jsonResponse({
        id: budgetId,
        orgId,
        ...updates,
        updatedAt: new Date().toISOString()
      });
    }

    if (request.method === 'DELETE') {
      // Delete budget
      return jsonResponse({
        deleted: true,
        id: budgetId,
        orgId
      });
    }

    return errorResponse('METHOD_NOT_ALLOWED', `${request.method} not supported`);
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * Check current spending against budget limits
 * POST: Check if new request would exceed budget
 * Used by proxy layer to enforce budget limits
 */
const handleBudgetCheck = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const budgetId = request.params?.id;
    const body = await request.json();

    // Calculate cost of proposed request
    const proposedCost = body.estimated_cost || 0;

    // In full implementation:
    // 1. Fetch current budget and spent amount
    // 2. Check if proposedCost would exceed limit
    // 3. Return allow/deny decision

    return jsonResponse({
      orgId,
      budgetId,
      allowed: true,
      proposedCost,
      currentSpent: 4500,
      budgetLimit: 10000,
      remainingBudget: 5500,
      percentageUsed: 45,
      message: 'Request would be within budget'
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * Forecast future spending based on current trends
 * GET: Return projected spend for upcoming periods
 */
const handleBudgetForecast = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const budgetId = request.params?.id;
    const days = parseInt(new URL(request.url).searchParams.get('days') || '30', 10);

    // In full implementation:
    // 1. Get historical spending data
    // 2. Apply trend analysis/ML
    // 3. Return forecast with confidence intervals

    const forecast = [];
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      forecast.push({
        date: date.toISOString().split('T')[0],
        projected: Math.floor(4500 * (i + 1) / 30), // Linear trend
        lower_bound: Math.floor(4500 * (i + 1) / 30 * 0.8),
        upper_bound: Math.floor(4500 * (i + 1) / 30 * 1.2)
      });
    }

    return jsonResponse({
      orgId,
      budgetId,
      days,
      forecast,
      monthEndProjection: 4500,
      confidence: 0.85
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * Get budget allocation rules
 * Allows fine-grained control over how budget is allocated
 * across teams, projects, cost centers, etc.
 */
const handleBudgetAllocation = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);

    if (request.method === 'GET') {
      return jsonResponse({
        orgId,
        allocations: [
          // { name: 'Team A', percentage: 30, amount: 3000 },
          // { name: 'Team B', percentage: 70, amount: 7000 }
        ]
      });
    }

    if (request.method === 'POST') {
      const allocation = await request.json();
      return jsonResponse({
        orgId,
        allocation,
        createdAt: new Date().toISOString()
      }, 201);
    }

    return errorResponse('METHOD_NOT_ALLOWED', `${request.method} not supported`);
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  handleBudgetList,
  handleBudgetById,
  handleBudgetCheck,
  handleBudgetForecast,
  handleBudgetAllocation
};

export default {
  handleBudgetList,
  handleBudgetById,
  handleBudgetCheck,
  handleBudgetForecast,
  handleBudgetAllocation
};
