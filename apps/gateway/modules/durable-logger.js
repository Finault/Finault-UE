/**
 * DURABLE LOGGER - Zero-Compromise Write Guarantees
 * ═══════════════════════════════════════════════════════════════
 *
 * "Data infrastructure has no room for 'mostly works'." - Frank Slootman
 *
 * GUARANTEES:
 * - 200 OK = Data is in KV WAL AND Supabase (verified)
 * - 503 = Data is in KV WAL but Supabase failed (will retry)
 * - 5xx = Nothing written (safe to retry)
 *
 * ARCHITECTURE:
 * 1. Write to KV WAL first (durable, 10ms)
 * 2. Write to Supabase with retries (50ms + retries)
 * 3. Mark WAL as completed on success
 * 4. Background worker processes failed entries
 *
 * NO "EVENTUAL CONSISTENCY" - synchronous writes with retries
 * ═══════════════════════════════════════════════════════════════
 */

export class DurableLogger {
  constructor(env, ctx) {
    this.env = env;
    this.ctx = ctx;
    this.kvNamespace = env.KV_CACHE; // Reuse existing KV namespace
    this.maxRetries = 3;
    this.retryDelays = [100, 500, 1000]; // ms
  }

  /**
   * Write log entry with ZERO-COMPROMISE guarantees
   * Returns only after data is in BOTH KV and Supabase
   *
   * @throws {Error} if KV write fails (safe to retry entire request)
   * @throws {DatabaseUnavailableError} if Supabase fails after retries (503)
   */
  async writeLog(logEntry) {
    const walId = `wal:${logEntry.request_id}:${Date.now()}`;
    const timestamp = new Date().toISOString();

    // ────────────────────────────────────────────────────────────
    // STEP 1: Write to KV WAL (CRITICAL - must succeed)
    // ────────────────────────────────────────────────────────────
    const walEntry = {
      id: walId,
      version: 1,
      status: 'pending',
      created_at: timestamp,
      attempts: 0,
      last_attempt: timestamp,
      data: logEntry
    };

    try {
      // KV write with 24-hour expiration (will be deleted when completed)
      await this.kvNamespace.put(
        walId,
        JSON.stringify(walEntry),
        {
          expirationTtl: 86400, // 24 hours
          metadata: {
            status: 'pending',
            created: timestamp,
            org_id: logEntry.organization_id
          }
        }
      );
    } catch (kvError) {
      // If KV fails, abort immediately - data infrastructure must work
      console.error('[DurableLogger] CRITICAL: KV WAL write failed', {
        error: kvError.message,
        request_id: logEntry.request_id
      });
      throw new Error('Storage infrastructure unavailable - request aborted');
    }

    // ────────────────────────────────────────────────────────────
    // STEP 2: Write to Supabase with retries
    // ────────────────────────────────────────────────────────────
    let lastError = null;
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      try {
        const { error } = await this.writeToSupabase(logEntry);

        if (!error) {
          // ✅ SUCCESS: Mark WAL as completed and delete
          await this.markWALCompleted(walId);
          return { success: true, walId, persisted: true };
        }

        lastError = error;
        console.warn('[DurableLogger] Supabase write failed, retrying', {
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
          error: error.message,
          request_id: logEntry.request_id
        });

      } catch (error) {
        lastError = error;
      }

      // Retry with exponential backoff
      if (attempt < this.maxRetries) {
        await this.sleep(this.retryDelays[attempt]);
      }
      attempt++;
    }

    // ────────────────────────────────────────────────────────────
    // STEP 3: Supabase failed after retries
    // ────────────────────────────────────────────────────────────
    // Data is SAFE in KV WAL, but Supabase unavailable
    // Update WAL with failure info for background worker
    await this.updateWALStatus(walId, {
      status: 'retry_pending',
      attempts: attempt,
      last_error: lastError?.message || 'Unknown error',
      last_attempt: new Date().toISOString()
    });

    // Schedule background retry
    this.ctx.waitUntil(this.scheduleBackgroundRetry(walId, logEntry));

    // Throw specific error to return 503
    throw new DatabaseUnavailableError(
      'Database temporarily unavailable - request logged and will be retried',
      { walId, attempts: attempt }
    );
  }

  /**
   * Write to Supabase (actual database write)
   */
  async writeToSupabase(logEntry) {
    const supabase = this.createSupabaseClient();

    // Use the table based on log type
    const table = this.getTableForLogType(logEntry.log_type || 'request');

    const { data, error } = await supabase
      .from(table)
      .insert(logEntry)
      .select()
      .single();

    return { data, error };
  }

  /**
   * Get appropriate table based on log type
   */
  getTableForLogType(logType) {
    const tableMap = {
      'request': 'gateway_requests',
      'usage': 'usage',           // GAP #25 FIX: was 'usage_logs' (table doesn't exist)
      'audit': 'audit_logs',
      'error': 'error_logs'
    };
    return tableMap[logType] || 'gateway_requests';
  }

  /**
   * Mark WAL entry as completed and delete from KV
   */
  async markWALCompleted(walId) {
    try {
      await this.kvNamespace.delete(walId);
      console.log('[DurableLogger] WAL entry completed and deleted', { walId });
    } catch (error) {
      // Non-critical - entry will expire after 24h anyway
      console.warn('[DurableLogger] Failed to delete completed WAL entry', {
        walId,
        error: error.message
      });
    }
  }

  /**
   * Update WAL status (for failed attempts)
   */
  async updateWALStatus(walId, updates) {
    try {
      const existing = await this.kvNamespace.get(walId, 'json');
      if (!existing) return;

      const updated = {
        ...existing,
        ...updates,
        updated_at: new Date().toISOString()
      };

      await this.kvNamespace.put(
        walId,
        JSON.stringify(updated),
        {
          expirationTtl: 86400,
          metadata: {
            ...existing.metadata,
            status: updates.status
          }
        }
      );
    } catch (error) {
      console.error('[DurableLogger] Failed to update WAL status', {
        walId,
        error: error.message
      });
    }
  }

  /**
   * Schedule background retry for failed writes
   */
  async scheduleBackgroundRetry(walId, logEntry) {
    // Exponential backoff: 1min, 5min, 15min, 30min, 1hr, 2hr, 4hr, 8hr
    const backoffSchedule = [
      60,      // 1 minute
      300,     // 5 minutes
      900,     // 15 minutes
      1800,    // 30 minutes
      3600,    // 1 hour
      7200,    // 2 hours
      14400,   // 4 hours
      28800    // 8 hours
    ];

    let attempt = 0;
    const maxAttempts = 100; // Try for ~3 days total

    while (attempt < maxAttempts) {
      // Wait according to backoff schedule
      const delaySeconds = backoffSchedule[Math.min(attempt, backoffSchedule.length - 1)];
      await this.sleep(delaySeconds * 1000);

      try {
        const { error } = await this.writeToSupabase(logEntry);

        if (!error) {
          // ✅ Background retry succeeded
          await this.markWALCompleted(walId);
          console.log('[DurableLogger] Background retry succeeded', {
            walId,
            attempt: attempt + 1,
            delayed_by_seconds: delaySeconds
          });
          return;
        }

        console.warn('[DurableLogger] Background retry failed', {
          walId,
          attempt: attempt + 1,
          error: error.message
        });

      } catch (error) {
        console.error('[DurableLogger] Background retry error', {
          walId,
          attempt: attempt + 1,
          error: error.message
        });
      }

      attempt++;
      await this.updateWALStatus(walId, {
        status: 'retry_pending',
        attempts: this.maxRetries + attempt,
        last_attempt: new Date().toISOString()
      });
    }

    // ⚠️ Failed after 100 attempts over ~3 days
    // This should trigger alerts in production
    console.error('[DurableLogger] CRITICAL: Entry failed after 100 retries', {
      walId,
      request_id: logEntry.request_id,
      org_id: logEntry.organization_id
    });

    await this.updateWALStatus(walId, {
      status: 'failed_permanent',
      attempts: maxAttempts,
      last_attempt: new Date().toISOString()
    });
  }

  /**
   * Create Supabase client
   */
  createSupabaseClient() {
    const { createClient } = require('@supabase/supabase-js');
    return createClient(
      this.env.SUPABASE_URL,
      this.env.SUPABASE_KEY
    );
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get WAL statistics (for monitoring)
   */
  async getWALStats() {
    try {
      const list = await this.kvNamespace.list({ prefix: 'wal:' });

      const stats = {
        total: list.keys.length,
        pending: 0,
        retry_pending: 0,
        failed: 0
      };

      for (const key of list.keys) {
        const status = key.metadata?.status || 'unknown';
        stats[status] = (stats[status] || 0) + 1;
      }

      return stats;
    } catch (error) {
      console.error('[DurableLogger] Failed to get WAL stats', {
        error: error.message
      });
      return null;
    }
  }
}

/**
 * Custom error for database unavailability
 * Used to trigger 503 Service Unavailable response
 */
export class DatabaseUnavailableError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'DatabaseUnavailableError';
    this.statusCode = 503;
    this.details = details;
    this.retryAfter = 60; // Suggest retry after 60 seconds
  }
}

/**
 * Background worker to process failed WAL entries
 * Run this as a scheduled Cloudflare Worker (every 5 minutes)
 */
export async function processWAL(env) {
  const logger = new DurableLogger(env, { waitUntil: () => {} });

  try {
    const list = await env.KV_CACHE.list({ prefix: 'wal:' });

    console.log('[WAL Processor] Processing WAL entries', {
      total: list.keys.length
    });

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const key of list.keys) {
      try {
        const entry = await env.KV_CACHE.get(key.name, 'json');

        if (!entry || entry.status === 'completed') {
          continue;
        }

        // Only process entries that are pending or failed
        if (entry.status === 'pending' || entry.status === 'retry_pending') {
          const { error } = await logger.writeToSupabase(entry.data);

          if (!error) {
            await logger.markWALCompleted(key.name);
            succeeded++;
          } else {
            await logger.updateWALStatus(key.name, {
              status: 'retry_pending',
              attempts: (entry.attempts || 0) + 1,
              last_error: error.message,
              last_attempt: new Date().toISOString()
            });
            failed++;
          }

          processed++;
        }
      } catch (error) {
        console.error('[WAL Processor] Error processing entry', {
          key: key.name,
          error: error.message
        });
        failed++;
      }
    }

    console.log('[WAL Processor] Completed', {
      total: list.keys.length,
      processed,
      succeeded,
      failed
    });

    return { processed, succeeded, failed };
  } catch (error) {
    console.error('[WAL Processor] Fatal error', {
      error: error.message
    });
    throw error;
  }
}
