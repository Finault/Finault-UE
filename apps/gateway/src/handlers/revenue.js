/**
 * Revenue Management Handlers
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Handlers for revenue/pricing operations:
 * - CRUD operations for revenue entries
 * - Unit economics calculations (cost-to-serve + revenue = margin)
 * - Revenue aggregation and reporting
 *
 * Revenue data integrates with usage_logs to calculate:
 * - Unit margin (revenue - cost)
 * - Margin percentage (margin / revenue)
 * - Cost per request
 * - Profitability by cost center
 */

import { jsonResponse, errorResponse } from '../utils.js';
import { getOrgIdFromAuth } from '../auth.js';

/**
 * Validate revenue request body
 * @param {Object} body - Request body
 * @returns {Object} - {valid: boolean, error?: string}
 */
const validateRevenueEntry = (body) => {
  if (!body.revenue_amount) {
    return { valid: false, error: 'Missing required field: revenue_amount' };
  }

  if (typeof body.revenue_amount !== 'number' || body.revenue_amount < 0) {
    return { valid: false, error: 'revenue_amount must be a positive number' };
  }

  if (!body.period) {
    return { valid: false, error: 'Missing required field: period (YYYY-MM-DD)' };
  }

  // Validate period format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.period)) {
    return { valid: false, error: 'period must be in YYYY-MM-DD format' };
  }

  // Optional: validate cost_center format
  if (body.cost_center && typeof body.cost_center !== 'string') {
    return { valid: false, error: 'cost_center must be a string' };
  }

  // Validate currency if provided
  if (body.currency && !/^[A-Z]{3}$/.test(body.currency)) {
    return { valid: false, error: 'currency must be 3-letter ISO code (e.g., USD)' };
  }

  return { valid: true };
};

/**
 * Supabase client helper for revenue operations
 * @param {Object} env - Worker environment
 * @returns {Object} - Headers for Supabase API
 */
const getSupabaseHeaders = (env) => ({
  'Content-Type': 'application/json',
  'apikey': env.SUPABASE_KEY,
  'Authorization': `Bearer ${env.SUPABASE_KEY}`
});

/**
 * POST /v1/revenue - Create or upsert revenue entry
 * Supports upsert by period/cost_center (replace if exists)
 */
const handleCreateRevenue = async (request, env) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    if (!orgId) {
      return errorResponse('UNAUTHORIZED', 'Organization context required');
    }

    const body = await request.json();
    const validation = validateRevenueEntry(body);
    if (!validation.valid) {
      return errorResponse('INVALID_REQUEST', validation.error, 400);
    }

    // Prepare record
    const record = {
      org_id: orgId,
      period: body.period,
      cost_center: body.cost_center || null,
      revenue_amount: body.revenue_amount,
      currency: body.currency || 'USD',
      notes: body.notes || null,
      created_at: new Date().toISOString()
    };

    // Use upsert pattern: try insert first, then update on conflict
    // Note: Supabase returns 409 on unique constraint violation
    let response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/revenue_entries`,
      {
        method: 'POST',
        headers: getSupabaseHeaders(env),
        body: JSON.stringify(record)
      }
    );

    // If conflict (409), perform update instead
    if (response.status === 409) {
      // Build filter for update: org_id + period + cost_center
      const costCenterFilter = body.cost_center ? `&cost_center=eq.${encodeURIComponent(body.cost_center)}` : '&cost_center=is.null';
      const updateUrl = `${env.SUPABASE_URL}/rest/v1/revenue_entries?org_id=eq.${orgId}&period=eq.${body.period}${costCenterFilter}`;

      const updatePayload = {
        revenue_amount: body.revenue_amount,
        currency: body.currency || 'USD',
        notes: body.notes || null,
        updated_at: new Date().toISOString()
      };

      response = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          ...getSupabaseHeaders(env),
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(updatePayload)
      });

      if (!response.ok) {
        const error = await response.text();
        return errorResponse('DATABASE_ERROR', `Failed to upsert revenue: ${error}`, 500);
      }

      const updated = await response.json();
      return jsonResponse(
        {
          success: true,
          operation: 'upserted',
          revenue: updated[0] || record
        },
        200
      );
    }

    if (!response.ok) {
      const error = await response.text();
      return errorResponse('DATABASE_ERROR', `Failed to create revenue: ${error}`, 500);
    }

    const created = await response.json();
    return jsonResponse(
      {
        success: true,
        operation: 'created',
        revenue: created[0] || record
      },
      201
    );
  } catch (error) {
    console.error('[REVENUE] Create error:', error);
    return errorResponse('INTERNAL_ERROR', error.message, 500);
  }
};

/**
 * GET /v1/revenue - List revenue entries
 * Query params:
 *   - period: YYYY-MM-DD or YYYY-MM (optional filter)
 *   - cost_center: filter by cost center (optional)
 *   - limit: default 100, max 1000
 *   - offset: pagination (default 0)
 */
const handleListRevenue = async (request, env) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    if (!orgId) {
      return errorResponse('UNAUTHORIZED', 'Organization context required');
    }

    const url = new URL(request.url);
    const period = url.searchParams.get('period');
    const costCenter = url.searchParams.get('cost_center');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 1000);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // Build query filters
    let query = `org_id=eq.${orgId}`;

    // Period filter: supports both YYYY-MM-DD and YYYY-MM (prefix match)
    if (period) {
      if (/^\d{4}-\d{2}$/.test(period)) {
        // Month prefix: use gte/lt for date range
        const [year, month] = period.split('-');
        const startDate = `${year}-${month}-01`;
        const nextMonth = parseInt(month) === 12
          ? `${parseInt(year) + 1}-01-01`
          : `${year}-${String(parseInt(month) + 1).padStart(2, '0')}-01`;
        query += `&period=gte.${startDate}&period=lt.${nextMonth}`;
      } else {
        query += `&period=eq.${period}`;
      }
    }

    // Cost center filter
    if (costCenter) {
      query += `&cost_center=eq.${encodeURIComponent(costCenter)}`;
    }

    // Ordering and pagination
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/revenue_entries?${query}&order=period.desc,cost_center.asc&limit=${limit}&offset=${offset}`,
      {
        headers: getSupabaseHeaders(env)
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return errorResponse('DATABASE_ERROR', `Failed to list revenue: ${error}`, 500);
    }

    const entries = await response.json();

    // Get total count for pagination
    const countResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/revenue_entries?${query}&select=id`,
      {
        headers: {
          ...getSupabaseHeaders(env),
          'Prefer': 'count=exact'
        }
      }
    );

    const totalCount = parseInt(countResponse.headers.get('content-range')?.split('/')[1] || '0');

    return jsonResponse({
      success: true,
      data: entries,
      pagination: {
        limit,
        offset,
        total: totalCount,
        hasMore: offset + limit < totalCount
      }
    });
  } catch (error) {
    console.error('[REVENUE] List error:', error);
    return errorResponse('INTERNAL_ERROR', error.message, 500);
  }
};

/**
 * PUT /v1/revenue/:id - Update revenue entry
 */
const handleUpdateRevenue = async (request, env) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    if (!orgId) {
      return errorResponse('UNAUTHORIZED', 'Organization context required');
    }

    const url = new URL(request.url);
    const id = url.pathname.split('/').pop();
    if (!id) {
      return errorResponse('INVALID_REQUEST', 'Revenue ID required', 400);
    }

    const body = await request.json();

    // Validate only provided fields
    if (body.revenue_amount !== undefined) {
      if (typeof body.revenue_amount !== 'number' || body.revenue_amount < 0) {
        return errorResponse('INVALID_REQUEST', 'revenue_amount must be a positive number', 400);
      }
    }

    if (body.currency !== undefined && !/^[A-Z]{3}$/.test(body.currency)) {
      return errorResponse('INVALID_REQUEST', 'currency must be 3-letter ISO code', 400);
    }

    // Prevent updates to org_id, period, cost_center (prevent data inconsistency)
    delete body.org_id;
    delete body.period;
    delete body.cost_center;
    delete body.created_at;

    body.updated_at = new Date().toISOString();

    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/revenue_entries?id=eq.${id}&org_id=eq.${orgId}`,
      {
        method: 'PATCH',
        headers: {
          ...getSupabaseHeaders(env),
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(body)
      }
    );

    if (!response.ok) {
      const error = await response.text();
      if (response.status === 404) {
        return errorResponse('NOT_FOUND', 'Revenue entry not found', 404);
      }
      return errorResponse('DATABASE_ERROR', `Failed to update: ${error}`, 500);
    }

    const updated = await response.json();
    if (!updated.length) {
      return errorResponse('NOT_FOUND', 'Revenue entry not found', 404);
    }

    return jsonResponse({
      success: true,
      revenue: updated[0]
    });
  } catch (error) {
    console.error('[REVENUE] Update error:', error);
    return errorResponse('INTERNAL_ERROR', error.message, 500);
  }
};

/**
 * DELETE /v1/revenue/:id - Delete revenue entry
 */
const handleDeleteRevenue = async (request, env) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    if (!orgId) {
      return errorResponse('UNAUTHORIZED', 'Organization context required');
    }

    const url = new URL(request.url);
    const id = url.pathname.split('/').pop();
    if (!id) {
      return errorResponse('INVALID_REQUEST', 'Revenue ID required', 400);
    }

    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/revenue_entries?id=eq.${id}&org_id=eq.${orgId}`,
      {
        method: 'DELETE',
        headers: getSupabaseHeaders(env)
      }
    );

    if (!response.ok) {
      const error = await response.text();
      if (response.status === 404) {
        return errorResponse('NOT_FOUND', 'Revenue entry not found', 404);
      }
      return errorResponse('DATABASE_ERROR', `Failed to delete: ${error}`, 500);
    }

    return jsonResponse({
      success: true,
      deleted: true,
      id
    });
  } catch (error) {
    console.error('[REVENUE] Delete error:', error);
    return errorResponse('INTERNAL_ERROR', error.message, 500);
  }
};

/**
 * GET /v1/analytics/unit-economics
 *
 * Returns unit economics data: cost-to-serve (from usage_logs) joined with revenue
 * Calculates margin, margin %, and cost per request
 *
 * Query params:
 *   - period: YYYY-MM (required) - which month to analyze
 *   - group_by: 'customer' | 'feature' | 'product' (required) - how to group cost centers
 *   - cost_center: optional filter to specific cost center
 *   - limit: default 50, max 500
 *
 * Returns: Array sorted by margin ascending (unprofitable first)
 *
 * Example:
 *   GET /v1/analytics/unit-economics?period=2025-02&group_by=customer
 *   Returns:
 *   [
 *     {
 *       cost_center: "customer:acme-corp",
 *       revenue: 10000,
 *       total_cost: 12000,
 *       margin: -2000,
 *       margin_pct: -20,
 *       request_count: 5000,
 *       avg_cost_per_request: 2.40,
 *       days_active: 28,
 *       status: "unprofitable"
 *     }
 *   ]
 */
const handleUnitEconomics = async (request, env) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    if (!orgId) {
      return errorResponse('UNAUTHORIZED', 'Organization context required');
    }

    const url = new URL(request.url);
    const period = url.searchParams.get('period'); // YYYY-MM
    const groupBy = url.searchParams.get('group_by'); // customer|feature|product
    const costCenterFilter = url.searchParams.get('cost_center');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 500);

    // Validate required params
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return errorResponse('INVALID_REQUEST', 'period parameter required (YYYY-MM format)', 400);
    }

    if (!groupBy || !['customer', 'feature', 'product'].includes(groupBy)) {
      return errorResponse('INVALID_REQUEST', "group_by must be 'customer', 'feature', or 'product'", 400);
    }

    // Build SQL query using Supabase RPC or REST API
    // Since we need to join usage_logs with revenue_entries, we'll use RPC
    // For now, implement a two-step approach:

    // Step 1: Get revenue data for the period
    const [year, month] = period.split('-');
    const startDate = `${year}-${month}-01`;
    const nextMonth = parseInt(month) === 12
      ? `${parseInt(year) + 1}-01-01`
      : `${year}-${String(parseInt(month) + 1).padStart(2, '0')}-01`;

    let revenueQuery = `org_id=eq.${orgId}&period=gte.${startDate}&period=lt.${nextMonth}`;
    if (costCenterFilter) {
      revenueQuery += `&cost_center=eq.${encodeURIComponent(costCenterFilter)}`;
    }

    const revenueResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/revenue_entries?${revenueQuery}`,
      { headers: getSupabaseHeaders(env) }
    );

    if (!revenueResponse.ok) {
      const error = await revenueResponse.text();
      return errorResponse('DATABASE_ERROR', `Revenue query failed: ${error}`, 500);
    }

    const revenues = await revenueResponse.json();

    // Step 2: Get usage/cost data from usage_logs
    // Filter by org_id and created_at within the month, group by cost_center
    // This is a simplified version - in production you'd want to use an RPC for efficiency

    const usageQuery = `org_id=eq.${orgId}&created_at=gte.${startDate}T00:00:00Z&created_at=lt.${nextMonth}T00:00:00Z`;

    const usageResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/usage_logs?${usageQuery}&select=cost_center,total_cost,request_count,cost,created_at`,
      { headers: getSupabaseHeaders(env) }
    );

    if (!usageResponse.ok) {
      const error = await usageResponse.text();
      return errorResponse('DATABASE_ERROR', `Usage query failed: ${error}`, 500);
    }

    const usageLogs = await usageResponse.json();

    // Step 3: Aggregate usage by cost_center
    const costByCenter = {};
    const requestsByCenter = {};
    const daysActiveByCenter = {};

    usageLogs.forEach(log => {
      const costCenter = log.cost_center || 'unassigned';

      if (!costByCenter[costCenter]) {
        costByCenter[costCenter] = 0;
        requestsByCenter[costCenter] = 0;
        daysActiveByCenter[costCenter] = new Set();
      }

      costByCenter[costCenter] += log.cost || log.total_cost || 0;
      requestsByCenter[costCenter] += log.request_count || 1;

      // Track unique days active
      if (log.created_at) {
        const date = log.created_at.split('T')[0];
        daysActiveByCenter[costCenter].add(date);
      }
    });

    // Step 4: Build unit economics by grouping costs
    // Extract prefix from cost_center based on group_by
    const groupPrefix = groupBy === 'customer' ? 'customer:' : groupBy === 'feature' ? 'feature:' : 'product:';

    const economics = {};

    // Add cost data
    Object.entries(costByCenter).forEach(([costCenter, cost]) => {
      let groupKey = costCenter;

      // Extract group from cost_center if it has the right prefix
      if (costCenter.includes(':')) {
        const [prefix, ...rest] = costCenter.split(':');
        if (prefix === groupBy) {
          groupKey = costCenter;
        }
      }

      if (!economics[groupKey]) {
        economics[groupKey] = {
          cost_center: groupKey,
          revenue: 0,
          total_cost: 0,
          request_count: 0,
          days_active: 0
        };
      }

      economics[groupKey].total_cost += cost;
      economics[groupKey].request_count += requestsByCenter[costCenter] || 0;
      economics[groupKey].days_active = Math.max(
        economics[groupKey].days_active,
        daysActiveByCenter[costCenter]?.size || 0
      );
    });

    // Add revenue data
    revenues.forEach(rev => {
      const costCenter = rev.cost_center || 'unassigned';
      if (!economics[costCenter]) {
        economics[costCenter] = {
          cost_center: costCenter,
          revenue: 0,
          total_cost: 0,
          request_count: 0,
          days_active: 0
        };
      }
      economics[costCenter].revenue += rev.revenue_amount || 0;
    });

    // Step 5: Calculate margins and metrics
    const results = Object.values(economics)
      .map(item => {
        const margin = item.revenue - item.total_cost;
        const marginPct = item.revenue > 0 ? Math.round((margin / item.revenue) * 100) : (item.total_cost > 0 ? -100 : 0);
        const avgCostPerRequest = item.request_count > 0 ? (item.total_cost / item.request_count).toFixed(4) : '0.00';

        return {
          cost_center: item.cost_center,
          revenue: parseFloat(item.revenue.toFixed(2)),
          total_cost: parseFloat(item.total_cost.toFixed(2)),
          margin: parseFloat(margin.toFixed(2)),
          margin_pct: marginPct,
          request_count: item.request_count,
          avg_cost_per_request: parseFloat(avgCostPerRequest),
          days_active: item.days_active,
          status: marginPct < 0 ? 'unprofitable' : marginPct < 20 ? 'low_margin' : 'healthy'
        };
      })
      .sort((a, b) => a.margin - b.margin) // Sort by margin ascending (red first)
      .slice(0, limit);

    return jsonResponse({
      success: true,
      period,
      group_by: groupBy,
      total_items: results.length,
      summary: {
        total_revenue: results.reduce((sum, r) => sum + r.revenue, 0),
        total_cost: results.reduce((sum, r) => sum + r.total_cost, 0),
        total_margin: results.reduce((sum, r) => sum + r.margin, 0),
        total_requests: results.reduce((sum, r) => sum + r.request_count, 0),
        avg_margin_pct: results.length > 0
          ? Math.round(results.reduce((sum, r) => sum + r.margin_pct, 0) / results.length)
          : 0
      },
      data: results
    });
  } catch (error) {
    console.error('[UNIT_ECONOMICS] Error:', error);
    return errorResponse('INTERNAL_ERROR', error.message, 500);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  handleCreateRevenue,
  handleListRevenue,
  handleUpdateRevenue,
  handleDeleteRevenue,
  handleUnitEconomics
};

export default {
  handleCreateRevenue,
  handleListRevenue,
  handleUpdateRevenue,
  handleDeleteRevenue,
  handleUnitEconomics
};
