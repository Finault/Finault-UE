/**
 * Dashboard Stream Durable Object
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Per-organization WebSocket connection manager for real-time dashboard updates.
 *
 * Responsibilities:
 * - Manage WebSocket connections per organization
 * - Receive and broadcast seal events
 * - Handle clean disconnections
 * - Send heartbeat every 30s
 * - Queue messages if connections temporarily drop
 */

export class DashboardStream {
  constructor(state, env) {
    this.state = state;
    this.env = env;

    // Per-org state
    this.connections = new Set(); // Active WebSocket connections
    this.messageQueue = []; // Messages waiting to be sent
    this.lastHeartbeat = Date.now();
    this.heartbeatInterval = null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Connection management
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Register new WebSocket connection
   * @param {WebSocket} ws - WebSocket connection
   * @param {string} connectionId - Unique connection identifier
   */
  registerConnection(ws, connectionId) {
    this.connections.add({ ws, connectionId, connectedAt: Date.now() });

    // Start heartbeat if not running
    if (!this.heartbeatInterval) {
      this.startHeartbeat();
    }

    console.log(
      `[DASHBOARD-STREAM] Connection registered: ${connectionId} (total: ${this.connections.size})`
    );
  }

  /**
   * Unregister WebSocket connection
   * @param {string} connectionId
   */
  unregisterConnection(connectionId) {
    for (const conn of this.connections) {
      if (conn.connectionId === connectionId) {
        this.connections.delete(conn);
        console.log(`[DASHBOARD-STREAM] Connection closed: ${connectionId}`);
        break;
      }
    }

    // Stop heartbeat if no connections remain
    if (this.connections.size === 0 && this.heartbeatInterval) {
      this.stopHeartbeat();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Event broadcast
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Broadcast event to all connected dashboards
   * @param {Object} event - Event data { type, payload, timestamp }
   */
  async broadcast(event) {
    const message = {
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
    };

    // Broadcast to all active connections
    const failedConnections = [];

    for (const conn of this.connections) {
      try {
        conn.ws.send(JSON.stringify(message));
      } catch (error) {
        console.warn(`[DASHBOARD-STREAM] Failed to send to ${conn.connectionId}: ${error.message}`);
        failedConnections.push(conn.connectionId);
      }
    }

    // Clean up failed connections
    for (const connId of failedConnections) {
      this.unregisterConnection(connId);
    }

    // If all connections failed, queue for later
    if (this.connections.size === 0 && this.messageQueue.length < 1000) {
      this.messageQueue.push(message);
      console.log(`[DASHBOARD-STREAM] Message queued (queue size: ${this.messageQueue.length})`);
    }
  }

  /**
   * Handle seal event — broadcast with metadata
   * @param {Object} sealRecord - Seal data
   */
  async handleSealEvent(sealRecord) {
    const event = {
      type: 'seal_created',
      payload: {
        seal_hash: sealRecord.seal_hash,
        sequence: sealRecord.sequence,
        prev_hash: sealRecord.prev_hash,
        chain_depth: sealRecord.chain_depth,
        timestamp: sealRecord.timestamp,
      },
    };

    await this.broadcast(event);
  }

  /**
   * Handle cost update event
   * @param {Object} costData
   */
  async handleCostUpdate(costData) {
    const event = {
      type: 'cost_updated',
      payload: {
        cost: costData.cost,
        model: costData.model,
        provider: costData.provider,
        tokens: {
          input: costData.input_tokens,
          output: costData.output_tokens,
        },
      },
    };

    await this.broadcast(event);
  }

  /**
   * Handle usage metric event
   * @param {Object} usageData
   */
  async handleUsageMetric(usageData) {
    const event = {
      type: 'usage_metric',
      payload: {
        metric: usageData.metric,
        value: usageData.value,
        unit: usageData.unit || 'count',
      },
    };

    await this.broadcast(event);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Heartbeat
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Start heartbeat — send ping every 30 seconds
   */
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      const heartbeat = {
        type: 'heartbeat',
        timestamp: new Date().toISOString(),
        connections: this.connections.size,
        queue_size: this.messageQueue.length,
      };

      // Send to all connections
      for (const conn of this.connections) {
        try {
          conn.ws.send(JSON.stringify(heartbeat));
        } catch (error) {
          console.warn(`[DASHBOARD-STREAM] Heartbeat failed: ${error.message}`);
        }
      }

      this.lastHeartbeat = Date.now();
    }, 30000); // 30 seconds
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Message queue (resilience)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Flush queued messages to new connections
   */
  async flushQueue() {
    if (this.messageQueue.length === 0) {
      return;
    }

    console.log(`[DASHBOARD-STREAM] Flushing ${this.messageQueue.length} queued messages`);

    const toSend = this.messageQueue.splice(0); // Clear queue

    for (const message of toSend) {
      await this.broadcast(message);
    }
  }

  /**
   * Get queue status
   */
  getQueueStatus() {
    return {
      queue_size: this.messageQueue.length,
      max_queue_size: 1000,
      queue_percent: Math.round((this.messageQueue.length / 1000) * 100),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // WebSocket upgrade (Durable Object fetch interface)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Handle WebSocket upgrade request
   * Called by gateway to establish WebSocket connection
   */
  async fetch(request) {
    const url = new URL(request.url);

    // WebSocket upgrade
    if (request.headers.get('upgrade') === 'websocket') {
      const connectionId = this._generateConnectionId();

      try {
        const { 0: clientWs, 1: serverWs } = new WebSocketPair();

        // Register connection
        this.registerConnection(serverWs, connectionId);

        // Handle server-side WebSocket events
        serverWs.addEventListener('message', (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log(`[DASHBOARD-STREAM] Message from ${connectionId}:`, data.type);
            // Could relay client messages, but typically dashboard is receive-only
          } catch (err) {
            console.warn(`[DASHBOARD-STREAM] Failed to parse message: ${err.message}`);
          }
        });

        serverWs.addEventListener('close', () => {
          this.unregisterConnection(connectionId);
        });

        serverWs.addEventListener('error', (error) => {
          console.error(`[DASHBOARD-STREAM] WebSocket error: ${error.message}`);
          this.unregisterConnection(connectionId);
        });

        // Accept WebSocket
        serverWs.accept();

        // Flush any queued messages
        await this.flushQueue();

        return new Response(null, {
          status: 101,
          webSocket: clientWs,
        });
      } catch (error) {
        console.error(`[DASHBOARD-STREAM] WebSocket upgrade failed: ${error.message}`);
        return new Response('WebSocket upgrade failed', { status: 400 });
      }
    }

    // REST endpoints for management
    if (request.method === 'GET' && url.pathname === '/stats') {
      return new Response(
        JSON.stringify({
          connections: this.connections.size,
          queue_size: this.messageQueue.length,
          last_heartbeat: this.lastHeartbeat,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (request.method === 'POST' && url.pathname === '/broadcast') {
      const event = await request.json();
      await this.broadcast(event);

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'POST' && url.pathname === '/seal') {
      const sealRecord = await request.json();
      await this.handleSealEvent(sealRecord);

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'POST' && url.pathname === '/cost') {
      const costData = await request.json();
      await this.handleCostUpdate(costData);

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'GET' && url.pathname === '/queue') {
      const status = this.getQueueStatus();
      return new Response(JSON.stringify(status), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  _generateConnectionId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = 'conn_';
    for (let i = 0; i < 12; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  }
}

export default DashboardStream;
