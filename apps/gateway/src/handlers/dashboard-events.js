/**
 * Real-Time Dashboard Events
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Stream events to dashboard with full AIEI context
 * Event types: seal.created, margin.updated, anomaly.detected, budget.alert, savings.accumulated, closepack.generated
 *
 * Integration with DashboardStream Durable Object for real-time WebSocket delivery
 */

const VALID_EVENT_TYPES = [
  'seal.created',
  'margin.updated',
  'anomaly.detected',
  'budget.alert',
  'savings.accumulated',
  'closepack.generated'
];

const jsonResponse = (data, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
};

const errorResponse = (message, status = 400) => {
  return jsonResponse({ error: message }, status);
};

/**
 * Create standardized event object
 * @param {string} type - Event type
 * @param {Object} payload - Event payload
 * @param {string} orgId - Organization ID
 * @returns {Object} Event object
 */
function createEvent(type, payload, orgId) {
  if (!VALID_EVENT_TYPES.includes(type)) {
    throw new Error(`Invalid event type: ${type}`);
  }

  return {
    id: crypto.randomUUID(),
    type,
    orgId,
    payload,
    timestamp: new Date().toISOString(),
    version: '1.0'
  };
}

/**
 * Emit event to dashboard via DashboardStream DO
 * @param {Object} env - Environment
 * @param {string} orgId - Organization ID
 * @param {Object} event - Event object
 */
export async function emitDashboardEvent(env, orgId, event) {
  try {
    if (!VALID_EVENT_TYPES.includes(event.type)) {
      throw new Error(`Invalid event type: ${event.type}`);
    }

    // Get DashboardStream DO stub
    const dashboardId = env.DASHBOARD_STREAM?.idFromName?.(orgId);
    if (!dashboardId) {
      console.warn('[DASHBOARD] DashboardStream not available, storing event locally');
      // Fallback: store in database
      await storeEventLocally(env, event);
      return;
    }

    const stub = env.DASHBOARD_STREAM?.get(dashboardId);
    if (!stub) {
      console.warn('[DASHBOARD] Failed to get DashboardStream stub');
      await storeEventLocally(env, event);
      return;
    }

    // Emit to DO - it handles WebSocket broadcast
    await stub.emitEvent(event);
  } catch (err) {
    console.error('[DASHBOARD] emitDashboardEvent error:', err);
    // Fallback: store event for later retrieval
    await storeEventLocally(env, event);
  }
}

/**
 * Store event locally in database for later retrieval
 * @param {Object} env - Environment
 * @param {Object} event - Event object
 */
async function storeEventLocally(env, event) {
  try {
    await env.DB.prepare(`
      INSERT INTO dashboard_events (
        event_id,
        org_id,
        event_type,
        payload,
        created_at
      ) VALUES (?, ?, ?, ?, datetime('now'))
    `).bind(
      event.id,
      event.orgId,
      event.type,
      JSON.stringify(event.payload)
    ).run();
  } catch (err) {
    console.error('[DASHBOARD] Failed to store event locally:', err);
  }
}

/**
 * GET /v1/dashboard/events/history
 * Return recent events for initial dashboard load
 */
export async function handleEventHistory(request, env) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized', 401);
    }

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 1000);
    const type = url.searchParams.get('type'); // Optional filter

    let query = `
      SELECT
        event_id,
        event_type,
        payload,
        created_at
      FROM dashboard_events
      WHERE org_id = ?
    `;

    const params = [orgId];

    if (type && VALID_EVENT_TYPES.includes(type)) {
      query += ` AND event_type = ?`;
      params.push(type);
    }

    query += `
      ORDER BY created_at DESC
      LIMIT ?
    `;
    params.push(limit);

    const result = await env.DB.prepare(query).bind(...params).all();

    const events = (result.results || []).map(row => ({
      id: row.event_id,
      type: row.event_type,
      payload: JSON.parse(row.payload),
      timestamp: row.created_at
    }));

    return jsonResponse({
      events: events.reverse(), // Chronological order
      total: events.length
    });
  } catch (err) {
    console.error('[DASHBOARD] handleEventHistory error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * POST /v1/dashboard/events/seal-created
 * Emit seal.created event
 */
export async function handleSealCreatedEvent(request, env, sealId) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized', 401);
    }

    // Fetch seal details
    const seal = await env.DB.prepare(`
      SELECT
        id,
        seal_hash,
        org_id,
        stripe_customer_id,
        cost_usd,
        tokens_input,
        tokens_output,
        model,
        provider,
        margin_pct,
        created_at
      FROM seals WHERE id = ? AND org_id = ?
    `).bind(sealId, orgId).first();

    if (!seal) {
      return errorResponse('Seal not found', 404);
    }

    const event = createEvent('seal.created', {
      sealId: seal.id,
      sealHash: seal.seal_hash,
      customerId: seal.stripe_customer_id,
      cost: parseFloat(seal.cost_usd),
      tokens: {
        input: seal.tokens_input,
        output: seal.tokens_output
      },
      model: seal.model,
      provider: seal.provider,
      margin: parseFloat(seal.margin_pct)
    }, orgId);

    await emitDashboardEvent(env, orgId, event);

    return jsonResponse({
      success: true,
      eventId: event.id
    });
  } catch (err) {
    console.error('[DASHBOARD] handleSealCreatedEvent error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * POST /v1/dashboard/events/margin-updated
 * Emit margin.updated event
 */
export async function handleMarginUpdatedEvent(request, env) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();
    const { customerId, newMargin, previousMargin, reason } = body;

    if (newMargin === undefined) {
      return errorResponse('newMargin required', 400);
    }

    const event = createEvent('margin.updated', {
      customerId,
      newMargin: parseFloat(newMargin),
      previousMargin: previousMargin ? parseFloat(previousMargin) : null,
      change: previousMargin ? parseFloat(newMargin - previousMargin) : null,
      reason: reason || 'unknown'
    }, orgId);

    await emitDashboardEvent(env, orgId, event);

    return jsonResponse({
      success: true,
      eventId: event.id
    });
  } catch (err) {
    console.error('[DASHBOARD] handleMarginUpdatedEvent error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * POST /v1/dashboard/events/anomaly-detected
 * Emit anomaly.detected event
 */
export async function handleAnomalyDetectedEvent(request, env) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();
    const {
      anomalyId,
      type,
      severity,
      description,
      affectedResource,
      threshold,
      actual
    } = body;

    if (!type || !severity) {
      return errorResponse('type and severity required', 400);
    }

    const event = createEvent('anomaly.detected', {
      anomalyId: anomalyId || crypto.randomUUID(),
      type,
      severity,
      description: description || '',
      affectedResource,
      threshold,
      actual,
      detectedAt: new Date().toISOString()
    }, orgId);

    await emitDashboardEvent(env, orgId, event);

    return jsonResponse({
      success: true,
      eventId: event.id
    });
  } catch (err) {
    console.error('[DASHBOARD] handleAnomalyDetectedEvent error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * POST /v1/dashboard/events/budget-alert
 * Emit budget.alert event
 */
export async function handleBudgetAlertEvent(request, env) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();
    const { level, message, used, limit, period } = body;

    if (!level || !message) {
      return errorResponse('level and message required', 400);
    }

    const event = createEvent('budget.alert', {
      level,
      message,
      used: used ? parseFloat(used) : null,
      limit: limit ? parseFloat(limit) : null,
      percentUsed: used && limit ? (used / limit * 100) : null,
      period: period || 'month'
    }, orgId);

    await emitDashboardEvent(env, orgId, event);

    return jsonResponse({
      success: true,
      eventId: event.id
    });
  } catch (err) {
    console.error('[DASHBOARD] handleBudgetAlertEvent error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * POST /v1/dashboard/events/savings-accumulated
 * Emit savings.accumulated event
 */
export async function handleSavingsAccumulatedEvent(request, env) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();
    const { source, amount, reason } = body;

    if (!source || amount === undefined) {
      return errorResponse('source and amount required', 400);
    }

    const event = createEvent('savings.accumulated', {
      source,
      amount: parseFloat(amount),
      reason: reason || '',
      totalAccumulated: null // Would be fetched from DB
    }, orgId);

    await emitDashboardEvent(env, orgId, event);

    return jsonResponse({
      success: true,
      eventId: event.id
    });
  } catch (err) {
    console.error('[DASHBOARD] handleSavingsAccumulatedEvent error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * POST /v1/dashboard/events/closepack-generated
 * Emit closepack.generated event
 */
export async function handleClosepackGeneratedEvent(request, env, closepackId) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized', 401);
    }

    // Fetch closepack details
    const closepack = await env.DB.prepare(`
      SELECT
        id,
        org_id,
        period_start,
        period_end,
        total_seals,
        total_cost_usd,
        total_revenue_usd,
        aggregate_margin_pct,
        status,
        created_at
      FROM close_packs WHERE id = ? AND org_id = ?
    `).bind(closepackId, orgId).first();

    if (!closepack) {
      return errorResponse('Close pack not found', 404);
    }

    const event = createEvent('closepack.generated', {
      closepackId: closepack.id,
      period: {
        start: closepack.period_start,
        end: closepack.period_end
      },
      metrics: {
        seals: closepack.total_seals,
        cost: parseFloat(closepack.total_cost_usd),
        revenue: parseFloat(closepack.total_revenue_usd),
        margin: parseFloat(closepack.aggregate_margin_pct)
      },
      status: closepack.status
    }, orgId);

    await emitDashboardEvent(env, orgId, event);

    return jsonResponse({
      success: true,
      eventId: event.id
    });
  } catch (err) {
    console.error('[DASHBOARD] handleClosepackGeneratedEvent error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * WebSocket handler stub for DashboardStream
 * Would be implemented as a Durable Object:
 *
 * export class DashboardStream {
 *   constructor(state, env) {
 *     this.state = state;
 *     this.env = env;
 *     this.sessions = new Set();
 *   }
 *
 *   async emitEvent(event) {
 *     // Broadcast to all connected clients
 *     for (const session of this.sessions) {
 *       session.send(JSON.stringify(event));
 *     }
 *   }
 *
 *   async fetch(request) {
 *     // WebSocket upgrade
 *     const webSocket = new WebSocketPair();
 *     this.sessions.add(webSocket[1]);
 *     return new Response(null, { status: 101, webSocket: webSocket[0] });
 *   }
 * }
 */

export {
  createEvent,
  VALID_EVENT_TYPES,
  storeEventLocally
};
