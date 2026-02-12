/**
 * DATABASE OBSERVABILITY MODULE - Gap #5 Solution
 * ═══════════════════════════════════════════════════════════════════
 * Observable wrapper around Supabase operations providing:
 * - Structured logging with timing for every database call
 * - Circuit breaker pattern (Hystrix-style) to prevent cascading failures
 * - KV-based metrics for error rates, latency, and operation counts
 * - Health check endpoint support (SELECT 1 ping)
 * - Integration with ErrorTracker for alerting on critical failures
 *
 * Architecture: Cloudflare Workers + KV + Supabase
 * Committee Standard: Slootman (consistent latency), Collison (predictable APIs),
 *   Plaid (bulletproof reliability), Jobs (elegant simplicity)
 * ═══════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────────
// CIRCUIT BREAKER STATE (module-level, shared across requests in same isolate)
// ─────────────────────────────────────────────────────────────────
let circuitState = 'CLOSED';       // CLOSED | OPEN | HALF_OPEN
let consecutiveFailures = 0;
let lastFailureTime = 0;
let lastStateChange = Date.now();
const FAILURE_THRESHOLD = 5;       // Open circuit after 5 consecutive failures
const RECOVERY_TIMEOUT_MS = 30000; // 30 seconds before half-open test
const HALF_OPEN_MAX_TESTS = 1;     // Allow 1 test request in half-open
let halfOpenTestCount = 0;

function getCircuitState() {
  if (circuitState === 'OPEN') {
    const elapsed = Date.now() - lastFailureTime;
    if (elapsed >= RECOVERY_TIMEOUT_MS) {
      circuitState = 'HALF_OPEN';
      halfOpenTestCount = 0;
      lastStateChange = Date.now();
      console.log('[CIRCUIT_BREAKER] Transitioning OPEN -> HALF_OPEN after recovery timeout');
    }
  }
  return circuitState;
}

function recordSuccess() {
  if (circuitState === 'HALF_OPEN') {
    circuitState = 'CLOSED';
    consecutiveFailures = 0;
    lastStateChange = Date.now();
    console.log('[CIRCUIT_BREAKER] Transitioning HALF_OPEN -> CLOSED (test succeeded)');
  } else if (circuitState === 'CLOSED') {
    consecutiveFailures = 0;
  }
}

function recordFailure() {
  consecutiveFailures++;
  lastFailureTime = Date.now();

  if (circuitState === 'HALF_OPEN') {
    circuitState = 'OPEN';
    lastStateChange = Date.now();
    console.error('[CIRCUIT_BREAKER] Transitioning HALF_OPEN -> OPEN (test failed)');
  } else if (circuitState === 'CLOSED' && consecutiveFailures >= FAILURE_THRESHOLD) {
    circuitState = 'OPEN';
    lastStateChange = Date.now();
    console.error(`[CIRCUIT_BREAKER] Transitioning CLOSED -> OPEN after ${consecutiveFailures} consecutive failures`);
  }
}

function isCircuitOpen() {
  const state = getCircuitState();
  if (state === 'OPEN') return true;
  if (state === 'HALF_OPEN') {
    if (halfOpenTestCount >= HALF_OPEN_MAX_TESTS) return true;
    halfOpenTestCount++;
    return false; // Allow test request
  }
  return false;
}


// ─────────────────────────────────────────────────────────────────
// OBSERVABLE DB CLASS
// ─────────────────────────────────────────────────────────────────

class ObservableDB {
  /**
   * @param {Object} env - Cloudflare Worker environment (SUPABASE_URL, SUPABASE_KEY, KV_CACHE)
   * @param {Object} ctx - Cloudflare Worker execution context (for ctx.waitUntil)
   * @param {Object} errorTracker - ErrorTracker instance from error-tracker.js
   */
  constructor(env, ctx, errorTracker = null) {
    this.env = env;
    this.ctx = ctx;
    this.errorTracker = errorTracker;
    this._client = null;
    this._metrics = []; // Buffer for batch metric writes
    this._requestId = null;
  }

  /**
   * Set request ID for correlation across all queries in this request
   */
  setRequestId(requestId) {
    this._requestId = requestId;
  }

  /**
   * Get or create Supabase client (lazy, one per request lifecycle)
   */
  getClient() {
    if (!this._client) {
      const { createClient } = require('@supabase/supabase-js');
      this._client = createClient(this.env.SUPABASE_URL, this.env.SUPABASE_KEY);
    }
    return this._client;
  }

  /**
   * Execute a database query with full observability
   *
   * @param {string} table - Table name (e.g., 'anchors', 'usage', 'organizations')
   * @param {string} operation - Operation type: 'select', 'insert', 'update', 'upsert', 'delete', 'rpc'
   * @param {Function} queryFn - Async function that receives supabase client and returns query result
   * @param {Object} context - Additional context for logging
   * @param {string} context.endpoint - API endpoint that triggered this query
   * @param {string} context.requestId - Request correlation ID
   * @param {string} context.orgId - Organization ID (optional)
   * @param {boolean} context.critical - Whether this is a critical operation (triggers alerts)
   * @returns {Object} { data, error, meta: { duration_ms, table, operation, circuit_state } }
   */
  async query(table, operation, queryFn, context = {}) {
    const startTime = Date.now();
    const requestId = context.requestId || this._requestId || 'unknown';
    const meta = {
      table,
      operation,
      duration_ms: 0,
      circuit_state: getCircuitState(),
      request_id: requestId
    };

    // ── Circuit Breaker Check ──────────────────────────────
    if (isCircuitOpen()) {
      const circuitError = {
        message: `Circuit breaker OPEN — database calls blocked for ${table}.${operation}`,
        code: 'CIRCUIT_OPEN',
        details: {
          consecutive_failures: consecutiveFailures,
          last_failure: new Date(lastFailureTime).toISOString(),
          recovery_in_ms: Math.max(0, RECOVERY_TIMEOUT_MS - (Date.now() - lastFailureTime))
        }
      };

      console.error('[DB_QUERY]', JSON.stringify({
        level: 'error',
        type: 'circuit_breaker_blocked',
        table,
        operation,
        request_id: requestId,
        circuit_state: 'OPEN',
        timestamp: new Date().toISOString()
      }));

      // Track circuit open errors
      if (this.errorTracker) {
        this.ctx.waitUntil(this.errorTracker.trackError({
          type: 'circuit_breaker_open',
          message: circuitError.message,
          level: 'warning',
          context: { table, operation, ...circuitError.details },
          requestId
        }));
      }

      this._recordMetric(table, operation, 0, false, 'circuit_open');
      return { data: null, error: circuitError, meta: { ...meta, circuit_state: 'OPEN' } };
    }

    // ── Execute Query ──────────────────────────────────────
    try {
      const supabase = this.getClient();
      const result = await queryFn(supabase);
      const duration = Date.now() - startTime;
      meta.duration_ms = duration;

      if (result.error) {
        // Supabase returned an error (query executed but failed)
        recordFailure();
        meta.circuit_state = getCircuitState();

        console.error('[DB_QUERY]', JSON.stringify({
          level: 'error',
          type: 'query_error',
          table,
          operation,
          duration_ms: duration,
          error_message: result.error.message,
          error_code: result.error.code || null,
          error_hint: result.error.hint || null,
          request_id: requestId,
          endpoint: context.endpoint || null,
          org_id: context.orgId || null,
          circuit_state: meta.circuit_state,
          timestamp: new Date().toISOString()
        }));

        // Track via ErrorTracker
        if (this.errorTracker) {
          this.ctx.waitUntil(this.errorTracker.trackError({
            type: 'database_query_error',
            message: result.error.message,
            code: result.error.code,
            level: context.critical ? 'critical' : 'error',
            alertOnError: context.critical || false,
            context: {
              table,
              operation,
              duration_ms: duration,
              endpoint: context.endpoint,
              error_hint: result.error.hint
            },
            requestId,
            orgId: context.orgId
          }));
        }

        this._recordMetric(table, operation, duration, false, result.error.code);
        return { data: null, error: result.error, meta };
      }

      // ── Success ────────────────────────────────────────
      recordSuccess();
      meta.circuit_state = getCircuitState();

      // Structured success log (debug level — only for slow queries or sampling)
      if (duration > 500) {
        console.warn('[DB_QUERY]', JSON.stringify({
          level: 'warn',
          type: 'slow_query',
          table,
          operation,
          duration_ms: duration,
          request_id: requestId,
          endpoint: context.endpoint || null,
          threshold_ms: 500,
          timestamp: new Date().toISOString()
        }));
      }

      this._recordMetric(table, operation, duration, true, null);
      return { data: result.data, error: null, meta };

    } catch (error) {
      // Network-level failure (Supabase unreachable, timeout, etc.)
      const duration = Date.now() - startTime;
      meta.duration_ms = duration;
      recordFailure();
      meta.circuit_state = getCircuitState();

      console.error('[DB_QUERY]', JSON.stringify({
        level: 'critical',
        type: 'connection_error',
        table,
        operation,
        duration_ms: duration,
        error_message: error.message,
        error_name: error.name,
        request_id: requestId,
        endpoint: context.endpoint || null,
        org_id: context.orgId || null,
        circuit_state: meta.circuit_state,
        consecutive_failures: consecutiveFailures,
        timestamp: new Date().toISOString()
      }));

      // Track via ErrorTracker — connection errors are always critical
      if (this.errorTracker) {
        this.ctx.waitUntil(this.errorTracker.trackError({
          type: 'database_connection_error',
          message: error.message,
          stack: error.stack,
          level: 'critical',
          alertOnError: true,
          context: {
            table,
            operation,
            duration_ms: duration,
            endpoint: context.endpoint,
            circuit_state: meta.circuit_state,
            consecutive_failures: consecutiveFailures
          },
          requestId,
          orgId: context.orgId
        }));
      }

      this._recordMetric(table, operation, duration, false, 'connection_error');
      return {
        data: null,
        error: { message: error.message, code: 'CONNECTION_ERROR' },
        meta
      };
    }
  }

  /**
   * Buffer a metric for batch write to KV
   */
  _recordMetric(table, operation, duration_ms, success, errorCode) {
    this._metrics.push({
      table,
      operation,
      duration_ms,
      success,
      error_code: errorCode,
      timestamp: Date.now()
    });
  }

  /**
   * Flush buffered metrics to KV — call via ctx.waitUntil() at end of request
   */
  async flushMetrics() {
    if (this._metrics.length === 0) return;

    const minuteKey = Math.floor(Date.now() / 60000); // Current minute bucket
    const metrics = [...this._metrics];
    this._metrics = [];

    try {
      const kv = this.env.KV_CACHE;
      if (!kv) return;

      // ── Aggregate metrics for this request ─────────────
      let totalOps = metrics.length;
      let totalErrors = metrics.filter(m => !m.success).length;
      let totalLatency = metrics.reduce((sum, m) => sum + m.duration_ms, 0);
      let maxLatency = Math.max(...metrics.map(m => m.duration_ms));

      // Error counts by table
      const errorsByTable = {};
      metrics.filter(m => !m.success).forEach(m => {
        errorsByTable[m.table] = (errorsByTable[m.table] || 0) + 1;
      });

      // ── Increment KV counters (atomic-ish via read-modify-write) ──
      // Operations count
      const opsKey = `db:ops:${minuteKey}`;
      const currentOps = parseInt(await kv.get(opsKey) || '0');
      await kv.put(opsKey, String(currentOps + totalOps), { expirationTtl: 3600 });

      // Error count
      const errKey = `db:errors:${minuteKey}`;
      const currentErrors = parseInt(await kv.get(errKey) || '0');
      await kv.put(errKey, String(currentErrors + totalErrors), { expirationTtl: 3600 });

      // Latency (running average approximation)
      const latKey = `db:latency:${minuteKey}`;
      const currentLat = JSON.parse(await kv.get(latKey) || '{"sum":0,"count":0,"max":0}');
      await kv.put(latKey, JSON.stringify({
        sum: currentLat.sum + totalLatency,
        count: currentLat.count + totalOps,
        max: Math.max(currentLat.max, maxLatency)
      }), { expirationTtl: 3600 });

      // Errors by table
      if (totalErrors > 0) {
        const tableErrKey = `db:errors_by_table:${minuteKey}`;
        const currentTableErrors = JSON.parse(await kv.get(tableErrKey) || '{}');
        for (const [table, count] of Object.entries(errorsByTable)) {
          currentTableErrors[table] = (currentTableErrors[table] || 0) + count;
        }
        await kv.put(tableErrKey, JSON.stringify(currentTableErrors), { expirationTtl: 3600 });
      }

      // Circuit breaker state
      await kv.put('db:circuit_state', JSON.stringify({
        state: getCircuitState(),
        consecutive_failures: consecutiveFailures,
        last_failure: lastFailureTime ? new Date(lastFailureTime).toISOString() : null,
        last_state_change: new Date(lastStateChange).toISOString()
      }), { expirationTtl: 300 });

      // Last success/error timestamps
      const lastSuccess = metrics.find(m => m.success);
      if (lastSuccess) {
        await kv.put('db:last_success', new Date(lastSuccess.timestamp).toISOString(), { expirationTtl: 86400 });
      }
      const lastError = metrics.filter(m => !m.success).pop();
      if (lastError) {
        await kv.put('db:last_error', JSON.stringify({
          timestamp: new Date(lastError.timestamp).toISOString(),
          table: lastError.table,
          operation: lastError.operation,
          error_code: lastError.error_code
        }), { expirationTtl: 86400 });
      }

    } catch (kvError) {
      console.error('[DB_OBSERVABILITY] Failed to write metrics to KV:', kvError.message);
    }
  }

  /**
   * Run database health check — pings Supabase with a lightweight query
   * @returns {Object} { healthy, latency_ms, circuit_state, last_error, details }
   */
  async getHealthStatus() {
    const startTime = Date.now();
    const healthResult = {
      healthy: false,
      latency_ms: 0,
      circuit_state: getCircuitState(),
      circuit_details: {
        consecutive_failures: consecutiveFailures,
        last_failure: lastFailureTime ? new Date(lastFailureTime).toISOString() : null,
        last_state_change: new Date(lastStateChange).toISOString()
      },
      last_error: null,
      checked_at: new Date().toISOString()
    };

    try {
      const supabase = this.getClient();

      // Lightweight ping: query a known table with LIMIT 1
      const { data, error } = await supabase
        .from('organizations')
        .select('id')
        .limit(1);

      const latency = Date.now() - startTime;
      healthResult.latency_ms = latency;

      if (error) {
        healthResult.healthy = false;
        healthResult.last_error = {
          message: error.message,
          code: error.code,
          timestamp: new Date().toISOString()
        };
      } else {
        healthResult.healthy = latency < 5000; // Unhealthy if > 5 seconds
        if (latency > 1000) {
          healthResult.degraded = true;
          healthResult.degradation_reason = `Latency ${latency}ms exceeds 1000ms threshold`;
        }
      }
    } catch (error) {
      healthResult.latency_ms = Date.now() - startTime;
      healthResult.healthy = false;
      healthResult.last_error = {
        message: error.message,
        type: 'connection_error',
        timestamp: new Date().toISOString()
      };
    }

    // Fetch last error from KV for additional context
    try {
      if (this.env.KV_CACHE) {
        const lastKvError = await this.env.KV_CACHE.get('db:last_error');
        if (lastKvError) {
          healthResult.last_recorded_error = JSON.parse(lastKvError);
        }
      }
    } catch (e) {
      // Non-critical, ignore
    }

    return healthResult;
  }

  /**
   * Get aggregated metrics for the last N minutes
   * @param {number} minutes - Number of minutes to look back (default: 60)
   * @returns {Object} Aggregated metrics
   */
  async getMetrics(minutes = 60) {
    const kv = this.env.KV_CACHE;
    if (!kv) return { error: 'KV namespace not available' };

    const now = Math.floor(Date.now() / 60000);
    let totalOps = 0;
    let totalErrors = 0;
    let totalLatencySum = 0;
    let totalLatencyCount = 0;
    let maxLatency = 0;
    const errorsByTable = {};
    const minuteData = [];

    for (let i = 0; i < minutes; i++) {
      const minuteKey = now - i;

      try {
        const [ops, errors, latency, tableErrors] = await Promise.all([
          kv.get(`db:ops:${minuteKey}`),
          kv.get(`db:errors:${minuteKey}`),
          kv.get(`db:latency:${minuteKey}`),
          kv.get(`db:errors_by_table:${minuteKey}`)
        ]);

        const opsCount = parseInt(ops || '0');
        const errCount = parseInt(errors || '0');
        const latData = latency ? JSON.parse(latency) : { sum: 0, count: 0, max: 0 };

        totalOps += opsCount;
        totalErrors += errCount;
        totalLatencySum += latData.sum;
        totalLatencyCount += latData.count;
        maxLatency = Math.max(maxLatency, latData.max);

        if (tableErrors) {
          const parsed = JSON.parse(tableErrors);
          for (const [table, count] of Object.entries(parsed)) {
            errorsByTable[table] = (errorsByTable[table] || 0) + count;
          }
        }

        // Per-minute data for charting (last 15 minutes only)
        if (i < 15) {
          minuteData.push({
            minute: new Date(minuteKey * 60000).toISOString(),
            operations: opsCount,
            errors: errCount,
            avg_latency_ms: latData.count > 0 ? Math.round(latData.sum / latData.count) : 0
          });
        }
      } catch (e) {
        // Skip failed minute reads
      }
    }

    // Get circuit state
    let circuitInfo = { state: getCircuitState() };
    try {
      const stored = await kv.get('db:circuit_state');
      if (stored) circuitInfo = JSON.parse(stored);
    } catch (e) { /* use in-memory */ }

    // Get last success/error
    let lastSuccess = null;
    let lastError = null;
    try {
      lastSuccess = await kv.get('db:last_success');
      const lastErrorStr = await kv.get('db:last_error');
      if (lastErrorStr) lastError = JSON.parse(lastErrorStr);
    } catch (e) { /* non-critical */ }

    return {
      period_minutes: minutes,
      total_operations: totalOps,
      total_errors: totalErrors,
      error_rate: totalOps > 0 ? (totalErrors / totalOps * 100).toFixed(2) + '%' : '0%',
      error_rate_raw: totalOps > 0 ? totalErrors / totalOps : 0,
      latency: {
        avg_ms: totalLatencyCount > 0 ? Math.round(totalLatencySum / totalLatencyCount) : 0,
        max_ms: maxLatency
      },
      circuit_breaker: circuitInfo,
      errors_by_table: errorsByTable,
      last_success: lastSuccess,
      last_error: lastError,
      timeline: minuteData.reverse(),
      collected_at: new Date().toISOString()
    };
  }

  /**
   * Create a health snapshot for persistent storage
   * Called by cron handler every 5 minutes
   */
  async createHealthSnapshot() {
    const health = await this.getHealthStatus();
    const metrics = await this.getMetrics(60);

    const snapshot = {
      healthy: health.healthy,
      latency_ms: health.latency_ms,
      error_count_last_hour: metrics.total_errors,
      operations_last_hour: metrics.total_operations,
      circuit_state: health.circuit_state,
      error_details: {
        error_rate: metrics.error_rate,
        errors_by_table: metrics.errors_by_table,
        last_error: metrics.last_error,
        circuit_details: health.circuit_details
      }
    };

    // Write to Supabase for persistent history
    try {
      const supabase = this.getClient();
      const { error } = await supabase
        .from('db_health_snapshots')
        .insert(snapshot);

      if (error) {
        console.error('[DB_OBSERVABILITY] Failed to store health snapshot:', error.message);
      } else {
        console.log('[DB_OBSERVABILITY] Health snapshot stored', {
          healthy: snapshot.healthy,
          latency_ms: snapshot.latency_ms,
          error_rate: snapshot.error_count_last_hour
        });
      }
    } catch (e) {
      console.error('[DB_OBSERVABILITY] Snapshot storage failed:', e.message);
    }

    // Alert if circuit breaker has been open too long
    if (health.circuit_state === 'OPEN') {
      const openDuration = Date.now() - lastStateChange;
      if (openDuration > 15 * 60 * 1000) { // > 15 minutes
        console.error('[DB_OBSERVABILITY] ALERT: Circuit breaker OPEN for over 15 minutes', {
          open_duration_minutes: Math.round(openDuration / 60000),
          consecutive_failures: consecutiveFailures
        });

        if (this.errorTracker) {
          await this.errorTracker.trackError({
            type: 'circuit_breaker_extended_open',
            message: `Database circuit breaker has been OPEN for ${Math.round(openDuration / 60000)} minutes`,
            level: 'critical',
            alertOnError: true,
            context: {
              open_duration_minutes: Math.round(openDuration / 60000),
              consecutive_failures: consecutiveFailures,
              last_failure: new Date(lastFailureTime).toISOString()
            }
          });
        }
      }
    }

    return snapshot;
  }

  /**
   * Clean up old health snapshots (> 30 days)
   * Called by cron handler periodically
   */
  async cleanupOldSnapshots() {
    try {
      const supabase = this.getClient();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase
        .from('db_health_snapshots')
        .delete()
        .lt('timestamp', thirtyDaysAgo);

      if (error) {
        console.error('[DB_OBSERVABILITY] Snapshot cleanup failed:', error.message);
      }
    } catch (e) {
      console.error('[DB_OBSERVABILITY] Snapshot cleanup error:', e.message);
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// UTILITY: Generate request ID (UUID v4-ish, fast)
// ─────────────────────────────────────────────────────────────────

function generateRequestId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ─────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────

module.exports = {
  ObservableDB,
  generateRequestId,
  getCircuitState
};
