/**
 * Event Stream Architecture Handler
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * WebSocket-based real-time event streaming:
 * - DashboardStream Durable Object for per-org WebSocket management
 * - handleDashboardWebSocket upgrades connections
 * - emitSealEvent publishes events to queue and broadcasts via Durable Object
 * - Event types: seal.created, anomaly.detected, budget.exceeded, margin.alert
 */

import { jsonResponse, errorResponse } from '../utils.js';
import { getOrgIdFromAuth } from '../auth.js';

/**
 * DashboardStream Durable Object
 * Maintains WebSocket connections per organization
 * Broadcasts seal events to all connected clients
 */
export class DashboardStream {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.clients = new Set();
    this.orgId = state.id ? state.id.split(':')[0] : null;
  }

  /**
   * Handle incoming WebSocket connection
   * @param {WebSocket} ws - WebSocket connection
   */
  async onWebSocket(ws) {
    // Accept the WebSocket connection
    ws.accept();

    // Add to client set
    this.clients.add(ws);

    // Send initial connection message
    ws.send(JSON.stringify({
      type: 'connection.established',
      orgId: this.orgId,
      timestamp: new Date().toISOString(),
      clientCount: this.clients.size
    }));

    // Handle incoming messages from client
    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);

        // Handle client heartbeat
        if (data.type === 'heartbeat') {
          ws.send(JSON.stringify({
            type: 'heartbeat.ack',
            timestamp: new Date().toISOString()
          }));
        }

        // Handle client requesting event history
        if (data.type === 'get.recent') {
          const limit = data.limit || 10;
          this.sendRecentEvents(ws, limit);
        }
      } catch (err) {
        console.error('[dashboard] ws message error:', err.message);
      }
    };

    // Handle client disconnect
    ws.onclose = () => {
      this.clients.delete(ws);
    };

    // Handle errors
    ws.onerror = (err) => {
      console.error('[dashboard] ws error:', err);
      this.clients.delete(ws);
    };
  }

  /**
   * Broadcast event to all connected clients
   * @param {Object} event - Event to broadcast
   */
  broadcast(event) {
    const message = JSON.stringify(event);

    // Broadcast to all connected WebSocket clients
    for (const client of this.clients) {
      try {
        client.send(message);
      } catch (err) {
        console.error('[dashboard] broadcast error:', err.message);
        this.clients.delete(client);
      }
    }

    // Store event in state for late-joining clients
    this.storeEvent(event);
  }

  /**
   * Store event in Durable Object state (limited history)
   * @param {Object} event - Event to store
   */
  storeEvent(event) {
    // Keep last 100 events in memory
    const key = `events:${Date.now()}:${Math.random()}`;
    this.state.put(key, event, { expirationTtl: 3600 }); // 1 hour TTL
  }

  /**
   * Send recent events to a client
   * @param {WebSocket} ws - WebSocket client
   * @param {number} limit - Number of recent events to send
   */
  async sendRecentEvents(ws, limit) {
    try {
      const list = await this.state.list({ prefix: 'events:' });
      const events = Array.from(list.values())
        .slice(-limit)
        .reverse();

      ws.send(JSON.stringify({
        type: 'recent.events',
        events,
        count: events.length,
        timestamp: new Date().toISOString()
      }));
    } catch (err) {
      console.error('[dashboard] send recent events error:', err.message);
    }
  }

  /**
   * Get client count (for monitoring)
   * @returns {number} Number of connected clients
   */
  getClientCount() {
    return this.clients.size;
  }
}

/**
 * Handle WebSocket upgrade for dashboard streaming
 * GET /ws/dashboard/{orgId}
 * Upgrades HTTP connection to WebSocket
 *
 * @param {Object} request - HTTP request
 * @param {Object} env - Cloudflare env
 * @param {Object} ctx - Request context
 * @returns {Promise<Response>}
 */
async function handleDashboardWebSocket(request, env, ctx) {
  try {
    // Check WebSocket upgrade header
    if (request.headers.get('Upgrade') !== 'websocket') {
      return errorResponse('INVALID_REQUEST', 'WebSocket upgrade required');
    }

    const orgId = getOrgIdFromAuth(request);
    if (!orgId) {
      return errorResponse('UNAUTHORIZED', 'Organization ID required');
    }

    // Get Durable Object for this org
    const durableObjectId = env.DASHBOARD_STREAM.idFromName(`org:${orgId}`);
    const durableObject = env.DASHBOARD_STREAM.get(durableObjectId);

    // Get WebSocket pair
    const { 0: client, 1: server } = new WebSocketPair();

    // Send server side to Durable Object
    await durableObject.onWebSocket(server);

    // Return client side to browser
    return new Response(null, {
      status: 101,
      webSocket: client
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

/**
 * Emit seal event
 * Publishes event to queue and broadcasts via Durable Object
 * Called when a new seal is created or updated
 *
 * @param {Object} env - Cloudflare env
 * @param {Object} ctx - Request context
 * @param {Object} event - Event object
 * @returns {Promise<void>}
 */
async function emitSealEvent(env, ctx, event) {
  try {
    const {
      type = 'seal.created',
      orgId,
      sealId,
      customerId,
      cost,
      margin,
      model,
      timestamp = new Date().toISOString()
    } = event;

    // Validate required fields
    if (!orgId || !sealId) {
      console.error('[event-stream] missing required fields');
      return;
    }

    // Build event payload
    const eventPayload = {
      type,
      orgId,
      sealId,
      customerId,
      cost,
      margin,
      model,
      timestamp,
      id: `evt_${sealId}_${Date.now()}`
    };

    // 1. Publish to event queue (for async processing)
    if (env.EVENT_QUEUE) {
      await env.EVENT_QUEUE.send(eventPayload);
    }

    // 2. Broadcast via Durable Object (for real-time WebSocket)
    const durableObjectId = env.DASHBOARD_STREAM?.idFromName(`org:${orgId}`);
    if (durableObjectId) {
      const durableObject = env.DASHBOARD_STREAM.get(durableObjectId);
      await durableObject.broadcast(eventPayload);
    }
  } catch (error) {
    console.error('[event-stream] emit error:', error.message);
    // Don't throw - events are fire-and-forget
  }
}

/**
 * Handle event stream subscription
 * POST /orgs/{orgId}/events/subscribe
 * Client requests to subscribe to specific event types
 *
 * @param {Object} request - HTTP request
 * @param {Object} env - Cloudflare env
 * @param {Object} ctx - Request context
 * @returns {Promise<Response>}
 */
async function handleEventSubscribe(request, env, ctx) {
  try {
    const orgId = getOrgIdFromAuth(request);

    if (request.method !== 'POST') {
      return errorResponse('METHOD_NOT_ALLOWED', 'POST required');
    }

    const body = await request.json();
    const { event_types = [], filters = {} } = body;

    // Validate event types
    const validTypes = ['seal.created', 'anomaly.detected', 'budget.exceeded', 'margin.alert'];
    const subscribedTypes = event_types.filter(t => validTypes.includes(t));

    if (subscribedTypes.length === 0) {
      return errorResponse('INVALID_REQUEST', 'At least one valid event type required');
    }

    // In full implementation: store subscription in database
    const subscription = {
      id: crypto.randomUUID(),
      orgId,
      event_types: subscribedTypes,
      filters,
      created_at: new Date().toISOString(),
      status: 'active'
    };

    return jsonResponse(subscription, 201);
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

/**
 * Get event stream status
 * GET /orgs/{orgId}/events/status
 * Returns current connection status and event statistics
 *
 * @param {Object} request - HTTP request
 * @param {Object} env - Cloudflare env
 * @param {Object} ctx - Request context
 * @returns {Promise<Response>}
 */
async function handleEventStatus(request, env, ctx) {
  try {
    const orgId = getOrgIdFromAuth(request);

    if (request.method !== 'GET') {
      return errorResponse('METHOD_NOT_ALLOWED', 'GET required');
    }

    // Get Durable Object for this org
    const durableObjectId = env.DASHBOARD_STREAM?.idFromName(`org:${orgId}`);
    let clientCount = 0;

    if (durableObjectId) {
      try {
        const durableObject = env.DASHBOARD_STREAM.get(durableObjectId);
        clientCount = await durableObject.getClientCount();
      } catch (err) {
        // Durable Object might not be initialized yet
      }
    }

    return jsonResponse({
      orgId,
      status: 'active',
      ws_endpoint: `/ws/dashboard/${orgId}`,
      connected_clients: clientCount,
      supported_events: [
        'seal.created',
        'anomaly.detected',
        'budget.exceeded',
        'margin.alert'
      ],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  handleDashboardWebSocket,
  emitSealEvent,
  handleEventSubscribe,
  handleEventStatus,
  DashboardStream
};

export default {
  handleDashboardWebSocket,
  emitSealEvent,
  handleEventSubscribe,
  handleEventStatus,
  DashboardStream
};
