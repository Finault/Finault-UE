/**
 * Finault Real-Time Cost Stream
 * Cloudflare Workers Durable Object + WebSocket implementation
 *
 * Provides real-time streaming of cost events to connected clients
 * Client connects via: wss://api.finault.ai/v1/stream?token=Bearer_xxx&org_id=xxx
 *
 * Event structure:
 * {
 *   type: "cost",
 *   org_id: "customer:acme",
 *   cost_center: "customer:acme",
 *   cost: 0.0032,
 *   cost_cents: 32,
 *   model: "gpt-4o",
 *   provider: "openai",
 *   request_id: "req_xyz",
 *   timestamp: "2026-02-26T14:30:45.123Z"
 * }
 */

// ============================================================
// DURABLE OBJECT: CostStreamDO
// ============================================================

export class CostStreamDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map(); // WebSocket -> { orgId, filters, connectedAt, eventCount }
  }

  /**
   * Main fetch handler for the Durable Object
   * Routes requests to appropriate handlers
   */
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    switch (pathname) {
      case '/connect':
        return this.handleWebSocket(request);

      case '/broadcast':
        return this.handleBroadcast(request);

      case '/status':
        return this.handleStatus();

      default:
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
    }
  }

  /**
   * WebSocket upgrade handler
   * Authenticates client, sets up session, accepts WebSocket connection
   */
  handleWebSocket(request) {
    const url = new URL(request.url);

    // Extract query parameters
    const orgId = url.searchParams.get('org_id');
    const token = url.searchParams.get('token') || request.headers.get('Authorization');

    // Basic validation
    if (!orgId) {
      return new Response(JSON.stringify({ error: 'Missing org_id parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing authentication token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Parse filter parameters
    const filters = {
      cost_center: url.searchParams.get('cost_center') || null,
      model: url.searchParams.get('model') || null,
      provider: url.searchParams.get('provider') || null,
      min_cost: parseFloat(url.searchParams.get('min_cost') || '0'),
    };

    // Create WebSocket pair
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept server-side WebSocket
    server.accept();

    // Store session metadata
    const session = {
      orgId,
      token,
      filters,
      connectedAt: new Date().toISOString(),
      eventCount: 0,
      lastActivity: Date.now(),
    };

    this.sessions.set(server, session);

    // Handle incoming messages from client
    server.addEventListener('message', (event) => {
      this.handleClientMessage(server, event);
    });

    // Handle WebSocket close
    server.addEventListener('close', () => {
      this.sessions.delete(server);
    });

    // Handle WebSocket error
    server.addEventListener('error', () => {
      this.sessions.delete(server);
    });

    // Send welcome message
    server.send(JSON.stringify({
      type: 'connected',
      message: 'Finault real-time cost stream connected',
      org_id: orgId,
      timestamp: new Date().toISOString(),
      session_id: this._generateSessionId()
    }));

    // Return upgraded connection to client
    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Handle messages from connected clients
   */
  handleClientMessage(ws, event) {
    try {
      const data = JSON.parse(event.data);
      const session = this.sessions.get(ws);

      if (!session) return;

      switch (data.type) {
        case 'ping':
          ws.send(JSON.stringify({
            type: 'pong',
            timestamp: new Date().toISOString()
          }));
          session.lastActivity = Date.now();
          break;

        case 'filter':
          // Update client-side filters
          if (data.filters) {
            session.filters = {
              ...session.filters,
              ...data.filters
            };
          }
          ws.send(JSON.stringify({
            type: 'filter_updated',
            filters: session.filters,
            timestamp: new Date().toISOString()
          }));
          break;

        case 'stats':
          // Client requests session statistics
          ws.send(JSON.stringify({
            type: 'stats',
            event_count: session.eventCount,
            connected_at: session.connectedAt,
            duration_seconds: Math.floor((Date.now() - new Date(session.connectedAt).getTime()) / 1000),
            timestamp: new Date().toISOString()
          }));
          break;

        default:
          // Unknown message type - ignore silently
          break;
      }
    } catch (error) {
      // Malformed JSON - ignore
    }
  }

  /**
   * Broadcast handler - receives cost events from gateway
   * Called internally by the gateway after proxying requests
   */
  async handleBroadcast(request) {
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const event = await request.json();
      this.broadcast(event);

      return new Response(JSON.stringify({
        success: true,
        broadcast_count: this.sessions.size,
        timestamp: new Date().toISOString()
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * Status handler - returns information about connected sessions
   */
  handleStatus() {
    const activeFilters = {};

    for (const [ws, session] of this.sessions) {
      if (!activeFilters[session.orgId]) {
        activeFilters[session.orgId] = [];
      }
      activeFilters[session.orgId].push({
        filters: session.filters,
        connected_at: session.connectedAt,
        event_count: session.eventCount
      });
    }

    return new Response(JSON.stringify({
      active_sessions: this.sessions.size,
      organizations: Object.keys(activeFilters).length,
      by_org: activeFilters,
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Broadcast cost event to all matching sessions
   * Applies client-specific filters before sending
   */
  broadcast(event) {
    const deadConnections = [];

    for (const [ws, session] of this.sessions) {
      // Organization-level filter
      if (event.org_id && event.org_id !== session.orgId) {
        continue;
      }

      // Cost center filter
      if (session.filters.cost_center && event.cost_center !== session.filters.cost_center) {
        continue;
      }

      // Model filter
      if (session.filters.model && event.model !== session.filters.model) {
        continue;
      }

      // Provider filter
      if (session.filters.provider && event.provider !== session.filters.provider) {
        continue;
      }

      // Minimum cost filter
      if (session.filters.min_cost > 0 && event.cost < session.filters.min_cost) {
        continue;
      }

      // Send to client
      try {
        ws.send(JSON.stringify(event));
        session.eventCount++;
        session.lastActivity = Date.now();
      } catch (error) {
        // Connection is dead, mark for cleanup
        deadConnections.push(ws);
      }
    }

    // Clean up dead connections
    for (const ws of deadConnections) {
      this.sessions.delete(ws);
    }
  }

  /**
   * Generate a random session ID for the connected client
   */
  _generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================================
// GATEWAY HANDLER FUNCTIONS
// ============================================================

/**
 * Handle WebSocket upgrade requests in the main gateway
 * Routes to the appropriate Durable Object instance
 *
 * @param {Request} request - HTTP request with WebSocket upgrade header
 * @param {Object} env - Cloudflare Workers environment variables
 * @returns {Response} - WebSocket upgrade response
 */
export async function handleWebSocketUpgrade(request, env) {
  const url = new URL(request.url);
  const orgId = url.searchParams.get('org_id');

  if (!orgId) {
    return new Response(JSON.stringify({ error: 'Missing org_id parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Get Durable Object stub using org_id as ID
  const id = env.COST_STREAM_DO.idFromString(orgId);
  const stub = env.COST_STREAM_DO.get(id);

  // Forward WebSocket upgrade to Durable Object
  return stub.fetch(new Request(new URL('/connect', request.url), request));
}

/**
 * Publish a cost event to all connected clients
 * Called after each proxied request that incurs costs
 *
 * @param {Object} env - Cloudflare Workers environment variables
 * @param {Object} event - Cost event object
 * @param {string} event.org_id - Organization ID
 * @param {string} event.cost_center - Cost center identifier
 * @param {number} event.cost - Cost in dollars (decimal)
 * @param {number} event.cost_cents - Cost in cents (integer)
 * @param {string} event.model - AI model name
 * @param {string} event.provider - Provider name (openai, anthropic, etc.)
 * @param {string} event.request_id - Request identifier
 * @param {string} event.timestamp - ISO timestamp
 * @returns {Promise<Object>} - Broadcast result
 */
export async function publishCostEvent(env, event) {
  if (!event.org_id) {
    throw new Error('Cost event must include org_id');
  }

  // Get Durable Object for the organization
  const id = env.COST_STREAM_DO.idFromString(event.org_id);
  const stub = env.COST_STREAM_DO.get(id);

  // Broadcast the event
  const response = await stub.fetch(new Request(
    new URL('/broadcast', 'https://internal.durable-object.local'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    }
  ));

  return response.json();
}

/**
 * Handle /v1/stream/status endpoint
 * Returns information about connected clients for monitoring
 *
 * @param {Request} request - HTTP GET request
 * @param {Object} env - Cloudflare Workers environment variables
 * @returns {Response} - JSON status response
 */
export async function handleStreamStatus(request, env) {
  // Get orgId from auth token
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return new Response(JSON.stringify({ error: 'Missing authorization' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // For simplicity, we'll get status for all organizations
  // In production, validate token and get associated org
  const url = new URL(request.url);
  const orgId = url.searchParams.get('org_id') || 'global';

  try {
    const id = env.COST_STREAM_DO.idFromString(orgId);
    const stub = env.COST_STREAM_DO.get(id);

    const response = await stub.fetch(new Request(
      new URL('/status', 'https://internal.durable-object.local')
    ));

    return response;
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to fetch status',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Helper: Check if request has valid WebSocket upgrade header
 *
 * @param {Request} request - HTTP request
 * @returns {boolean} - True if request is valid WebSocket upgrade
 */
export function isWebSocketUpgradeRequest(request) {
  return request.headers.get('Upgrade') === 'websocket';
}

/**
 * Helper: Create a cost event object from gateway context
 *
 * @param {Object} context - Gateway request context
 * @returns {Object} - Cost event object
 */
export function createCostEvent(context) {
  return {
    type: 'cost',
    org_id: context.orgId,
    cost_center: context.costCenter || context.orgId,
    cost: context.costDollars,
    cost_cents: Math.round(context.costDollars * 100),
    model: context.model,
    provider: context.provider,
    request_id: context.requestId,
    input_tokens: context.inputTokens || 0,
    output_tokens: context.outputTokens || 0,
    timestamp: new Date().toISOString()
  };
}
