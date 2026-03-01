/**
 * Finault Tag Parser & Dimension Manager
 * Layer 1 Foundation — compound tag parsing, dimension CRUD, session tracking
 *
 * Parses: X-Finault-Cost-Center: customer:acme|feature:chat|product:enterprise
 * Into:   { customer: "acme", feature: "chat", product: "enterprise" }
 *
 * Also handles X-Finault-Session-Id for request chain grouping.
 */

// ============================================================
// TAG PARSING (called in gateway request pipeline)
// ============================================================

/**
 * Parse compound cost center header into structured tags.
 * Backward compatible — first segment becomes cost_center.
 *
 * @param {string} rawCostCenter - e.g. "customer:acme|feature:chat|product:enterprise"
 * @returns {{ costCenter: string, tags: Object, dimensions: Array }}
 */
export function parseCompoundTags(rawCostCenter) {
  if (!rawCostCenter || typeof rawCostCenter !== 'string') {
    return { costCenter: null, tags: {}, dimensions: [] };
  }

  const trimmed = rawCostCenter.trim();
  if (!trimmed) {
    return { costCenter: null, tags: {}, dimensions: [] };
  }

  // Split on pipe delimiter
  const segments = trimmed.split('|').map(s => s.trim()).filter(Boolean);

  const tags = {};
  const dimensions = [];
  let costCenter = trimmed; // Default: entire string is cost_center (backward compat)

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const colonIdx = segment.indexOf(':');

    if (colonIdx > 0) {
      const dimensionName = segment.substring(0, colonIdx).toLowerCase();
      const dimensionValue = segment.substring(colonIdx + 1);

      if (dimensionName && dimensionValue) {
        tags[dimensionName] = dimensionValue;
        dimensions.push({ name: dimensionName, value: dimensionValue });

        // First segment = backward-compatible cost_center
        if (i === 0) {
          costCenter = segment;
        }
      }
    } else {
      // No colon — treat as raw cost_center (backward compat)
      if (i === 0) {
        costCenter = segment;
      }
    }
  }

  return { costCenter, tags, dimensions };
}

/**
 * Extract session ID from request headers.
 * @param {Request} request
 * @returns {string|null}
 */
export function extractSessionId(request) {
  return request.headers.get('X-Finault-Session-Id') ||
         request.headers.get('x-finault-session-id') ||
         null;
}

/**
 * Build the enhanced usage record with tags and session.
 * Called in the gateway pipeline after proxying to provider.
 *
 * @param {Object} baseRecord - Existing usage record fields
 * @param {Request} request - Original request
 * @returns {Object} - Enhanced record with tags, session_id, attribution_method
 */
export function enhanceUsageRecord(baseRecord, request) {
  const rawCostCenter = request.headers.get('X-Finault-Cost-Center') ||
                        request.headers.get('x-finault-cost-center') || '';

  const { costCenter, tags, dimensions } = parseCompoundTags(rawCostCenter);
  const sessionId = extractSessionId(request);

  return {
    ...baseRecord,
    cost_center: costCenter || baseRecord.cost_center,
    tags: Object.keys(tags).length > 0 ? tags : (baseRecord.tags || {}),
    session_id: sessionId || baseRecord.session_id || null,
    attribution_method: Object.keys(tags).length > 0 ? 'explicit' :
                        (baseRecord.cost_center ? 'explicit' : 'unattributed'),
    attributed_cost: baseRecord.cost_cents ? baseRecord.cost_cents / 100.0 : null
  };
}

// ============================================================
// DIMENSION UPSERT (background, non-blocking)
// ============================================================

/**
 * Upsert tag dimensions into the tag_dimensions table.
 * Called asynchronously after each request — doesn't block the response.
 *
 * @param {string} orgId
 * @param {Array} dimensions - [{name, value}, ...]
 * @param {number} cost - Request cost in dollars
 * @param {Object} env - Cloudflare env with SUPABASE_URL, SUPABASE_KEY
 */
export async function upsertTagDimensions(orgId, dimensions, cost, env) {
  if (!dimensions || dimensions.length === 0) return;

  const headers = {
    'Content-Type': 'application/json',
    'apikey': env.SUPABASE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_KEY}`,
    'Prefer': 'resolution=merge-duplicates'
  };

  // Batch upsert all dimensions
  const records = dimensions.map(d => ({
    org_id: orgId,
    dimension_name: d.name,
    dimension_value: d.value,
    request_count: 1,
    total_cost: cost || 0,
    last_seen_at: new Date().toISOString()
  }));

  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/tag_dimensions`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(records)
    });
  } catch (err) {
    console.error('[TAG-PARSER] Dimension upsert failed:', err.message);
  }
}

// ============================================================
// API HANDLERS — Tag Dimension CRUD
// ============================================================

const getSupabaseHeaders = (env) => ({
  'Content-Type': 'application/json',
  'apikey': env.SUPABASE_KEY,
  'Authorization': `Bearer ${env.SUPABASE_KEY}`
});

const jsonResponse = (data, status = 200) => new Response(
  JSON.stringify(data),
  { status, headers: { 'Content-Type': 'application/json' } }
);

const errorResponse = (code, message, status = 400) => new Response(
  JSON.stringify({ error: { code, message } }),
  { status, headers: { 'Content-Type': 'application/json' } }
);

const getOrgIdFromAuth = (request) => {
  if (!request._user || !request._user.orgId) {
    throw new Error('Authentication required');
  }
  return request._user.orgId;
};

/**
 * GET /v1/tags — List all tag dimensions for org
 * Query params: ?dimension=customer (filter by dimension name)
 */
export async function handleListTags(request, env) {
  try {
    const orgId = getOrgIdFromAuth(request);
    const url = new URL(request.url);
    const dimension = url.searchParams.get('dimension');

    let endpoint = `${env.SUPABASE_URL}/rest/v1/tag_dimensions?org_id=eq.${orgId}&order=last_seen_at.desc`;

    if (dimension) {
      endpoint += `&dimension_name=eq.${encodeURIComponent(dimension)}`;
    }

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: getSupabaseHeaders(env)
    });

    const data = await response.json();

    // Group by dimension_name for structured response
    const grouped = {};
    for (const row of data) {
      if (!grouped[row.dimension_name]) {
        grouped[row.dimension_name] = [];
      }
      grouped[row.dimension_name].push({
        value: row.dimension_value,
        display_name: row.display_name,
        request_count: row.request_count,
        total_cost: parseFloat(row.total_cost || 0),
        last_seen: row.last_seen_at
      });
    }

    return jsonResponse({
      dimensions: grouped,
      total_dimensions: Object.keys(grouped).length,
      total_values: data.length
    });
  } catch (err) {
    if (err.message === 'Authentication required') {
      return errorResponse('UNAUTHORIZED', err.message, 401);
    }
    return errorResponse('INTERNAL_ERROR', err.message, 500);
  }
}

/**
 * GET /v1/tags/:dimension — List values for a specific dimension
 */
export async function handleGetDimension(request, env, dimensionName) {
  try {
    const orgId = getOrgIdFromAuth(request);

    const endpoint = `${env.SUPABASE_URL}/rest/v1/tag_dimensions?org_id=eq.${orgId}&dimension_name=eq.${encodeURIComponent(dimensionName)}&order=total_cost.desc`;

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: getSupabaseHeaders(env)
    });

    const data = await response.json();

    return jsonResponse({
      dimension: dimensionName,
      values: data.map(row => ({
        value: row.dimension_value,
        display_name: row.display_name,
        owner: row.owner,
        request_count: row.request_count,
        total_cost: parseFloat(row.total_cost || 0),
        first_seen: row.first_seen_at,
        last_seen: row.last_seen_at,
        metadata: row.metadata
      })),
      count: data.length
    });
  } catch (err) {
    if (err.message === 'Authentication required') {
      return errorResponse('UNAUTHORIZED', err.message, 401);
    }
    return errorResponse('INTERNAL_ERROR', err.message, 500);
  }
}

/**
 * PUT /v1/tags/:dimension/:value — Update dimension metadata
 */
export async function handleUpdateDimension(request, env, dimensionName, dimensionValue) {
  try {
    const orgId = getOrgIdFromAuth(request);
    const body = await request.json();

    const updates = {};
    if (body.display_name !== undefined) updates.display_name = body.display_name;
    if (body.owner !== undefined) updates.owner = body.owner;
    if (body.metadata !== undefined) updates.metadata = body.metadata;

    if (Object.keys(updates).length === 0) {
      return errorResponse('INVALID_REQUEST', 'No valid fields to update', 400);
    }

    const endpoint = `${env.SUPABASE_URL}/rest/v1/tag_dimensions?org_id=eq.${orgId}&dimension_name=eq.${encodeURIComponent(dimensionName)}&dimension_value=eq.${encodeURIComponent(dimensionValue)}`;

    const response = await fetch(endpoint, {
      method: 'PATCH',
      headers: { ...getSupabaseHeaders(env), 'Prefer': 'return=representation' },
      body: JSON.stringify(updates)
    });

    const data = await response.json();

    return jsonResponse({
      success: true,
      updated: data[0] || null
    });
  } catch (err) {
    if (err.message === 'Authentication required') {
      return errorResponse('UNAUTHORIZED', err.message, 401);
    }
    return errorResponse('INTERNAL_ERROR', err.message, 500);
  }
}

/**
 * GET /v1/analytics/sessions — Session-level cost breakdown
 * Query params: ?cost_center=customer:acme&period=7d
 */
export async function handleGetSessions(request, env) {
  try {
    const orgId = getOrgIdFromAuth(request);
    const url = new URL(request.url);
    const costCenter = url.searchParams.get('cost_center');
    const limit = parseInt(url.searchParams.get('limit') || '50');

    let query = `${env.SUPABASE_URL}/rest/v1/session_costs?organization_id=eq.${orgId}&order=session_start.desc&limit=${limit}`;

    if (costCenter) {
      query += `&cost_center=eq.${encodeURIComponent(costCenter)}`;
    }

    const response = await fetch(query, {
      method: 'GET',
      headers: getSupabaseHeaders(env)
    });

    const sessions = await response.json();

    return jsonResponse({
      sessions: sessions.map(s => ({
        session_id: s.session_id,
        cost_center: s.cost_center,
        tags: s.tags,
        request_count: s.request_count,
        total_cost: parseFloat(s.total_cost || 0),
        models_used: s.models_used,
        session_start: s.session_start,
        session_end: s.session_end,
        duration_ms: parseFloat(s.duration_ms || 0)
      })),
      count: sessions.length
    });
  } catch (err) {
    if (err.message === 'Authentication required') {
      return errorResponse('UNAUTHORIZED', err.message, 401);
    }
    return errorResponse('INTERNAL_ERROR', err.message, 500);
  }
}

/**
 * GET /v1/analytics?dimension=customer — Slice analytics by any tag dimension
 * Extends existing analytics endpoint with dimension support
 */
export async function handleDimensionAnalytics(request, env) {
  try {
    const orgId = getOrgIdFromAuth(request);
    const url = new URL(request.url);
    const dimension = url.searchParams.get('dimension');

    if (!dimension) {
      return errorResponse('INVALID_REQUEST', 'dimension parameter required', 400);
    }

    const query = `${env.SUPABASE_URL}/rest/v1/dimension_costs?organization_id=eq.${orgId}&dimension_name=eq.${encodeURIComponent(dimension)}&order=total_cost.desc`;

    const response = await fetch(query, {
      method: 'GET',
      headers: getSupabaseHeaders(env)
    });

    const data = await response.json();

    return jsonResponse({
      dimension,
      breakdown: data.map(row => ({
        value: row.dimension_value,
        request_count: row.request_count,
        total_cost: parseFloat(row.total_cost || 0),
        avg_cost: parseFloat(row.avg_cost || 0),
        model_count: row.model_count,
        first_request: row.first_request,
        last_request: row.last_request
      })),
      total_cost: data.reduce((sum, r) => sum + parseFloat(r.total_cost || 0), 0),
      total_requests: data.reduce((sum, r) => sum + r.request_count, 0)
    });
  } catch (err) {
    if (err.message === 'Authentication required') {
      return errorResponse('UNAUTHORIZED', err.message, 401);
    }
    return errorResponse('INTERNAL_ERROR', err.message, 500);
  }
}
