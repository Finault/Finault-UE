/**
 * ERROR TRACKER - Zero-Cost Error Tracking Solution
 * ═══════════════════════════════════════════════════════════════════
 * Replaces all .catch(() => {}) with proper error handling
 *
 * Features:
 * - Structured logging to console (searchable in Cloudflare dashboard)
 * - KV storage for real-time monitoring (24hr expiration)
 * - Batch writes to Supabase error_logs table
 * - Email alerts for critical errors
 * - Zero additional costs
 * ═══════════════════════════════════════════════════════════════════
 */

/**
 * ErrorTracker class - Main error tracking utility
 */
class ErrorTracker {
  constructor(env, ctx) {
    this.env = env;
    this.ctx = ctx;
    this.errors = []; // Buffer for batch writes
    this.maxBufferSize = 5; // Flush after 5 errors
  }

  /**
   * Track an error with full context
   *
   * @param {Object} errorDetails - Error information
   * @param {string} errorDetails.type - Error type (e.g., 'database_write_failed')
   * @param {string} errorDetails.message - Error message
   * @param {string} errorDetails.code - Error code (optional)
   * @param {string} errorDetails.stack - Stack trace (optional)
   * @param {Object} errorDetails.context - Additional context (table, operation, data, etc.)
   * @param {string} errorDetails.level - Severity: 'critical', 'error', 'warning', 'info'
   * @param {boolean} errorDetails.alertOnError - Send email alert (default: false)
   * @param {string} errorDetails.userId - User ID (optional)
   * @param {string} errorDetails.orgId - Organization ID (optional)
   * @param {string} errorDetails.requestId - Request ID (optional)
   */
  async trackError(errorDetails) {
    const errorLog = {
      timestamp: new Date().toISOString(),
      level: errorDetails.level || 'error',
      service: 'gateway',
      error_type: errorDetails.type,
      error_code: errorDetails.code || null,
      error_message: errorDetails.message || 'Unknown error',
      stack_trace: errorDetails.stack || null,
      context: errorDetails.context || {},
      user_id: errorDetails.userId || null,
      org_id: errorDetails.orgId || null,
      request_id: errorDetails.requestId || null,
    };

    // 1. Log to console (searchable in Cloudflare dashboard)
    //    Format: [ERROR] {json} for easy filtering
    console.error('[ERROR]', JSON.stringify(errorLog));

    // 2. Store in KV for real-time monitoring (expires after 24 hours)
    try {
      const kvKey = `error:${Date.now()}:${Math.random().toString(36).slice(2, 11)}`;
      await this.env.KV_CACHE.put(kvKey, JSON.stringify(errorLog), {
        expirationTtl: 86400, // 24 hours
      });
    } catch (kvError) {
      console.error('[ERROR_TRACKER_KV_FAILED]', kvError.message);
    }

    // 3. Queue for database write (async, fire-and-forget)
    this.errors.push(errorLog);

    // Flush to database if buffer is full (non-blocking)
    if (this.errors.length >= this.maxBufferSize) {
      this.ctx.waitUntil(this.flushErrors());
    }

    // 4. Check if critical - send alert
    if (errorDetails.level === 'critical' || errorDetails.alertOnError) {
      this.ctx.waitUntil(this.sendAlert(errorLog));
    }
  }

  /**
   * Flush buffered errors to Supabase
   * Non-blocking, called via ctx.waitUntil()
   */
  async flushErrors() {
    if (this.errors.length === 0) return;

    const batch = [...this.errors];
    this.errors = []; // Clear buffer

    try {
      const response = await fetch(`${this.env.SUPABASE_URL}/rest/v1/error_logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.env.SUPABASE_KEY,
          'Authorization': `Bearer ${this.env.SERVICE_ROLE_KEY}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(batch)
      });

      if (!response.ok) {
        // Even error tracking can fail - log to console as fallback
        const errorText = await response.text();
        console.error('[ERROR_TRACKER_FAILED]', {
          status: response.status,
          error: errorText,
          batch_size: batch.length
        });
      }
    } catch (error) {
      console.error('[ERROR_TRACKER_EXCEPTION]', error.message);
    }
  }

  /**
   * Send alert for critical errors
   * Currently supports email via Resend
   */
  async sendAlert(errorLog) {
    // Option 1: Use Resend for email alerts
    if (this.env.RESEND_API_KEY) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'alerts@finault.ai',
            to: this.env.ALERT_EMAIL || 'bernard.cotter@finault.co',
            subject: `🚨 Critical Error: ${errorLog.error_type}`,
            html: `
              <h2>Critical Error Detected</h2>
              <table style="border-collapse: collapse; width: 100%;">
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd;"><strong>Type</strong></td>
                  <td style="padding: 8px; border: 1px solid #ddd;">${errorLog.error_type}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd;"><strong>Message</strong></td>
                  <td style="padding: 8px; border: 1px solid #ddd;">${errorLog.error_message}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd;"><strong>Time</strong></td>
                  <td style="padding: 8px; border: 1px solid #ddd;">${errorLog.timestamp}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd;"><strong>Request ID</strong></td>
                  <td style="padding: 8px; border: 1px solid #ddd;">${errorLog.request_id || 'N/A'}</td>
                </tr>
              </table>
              <h3>Context</h3>
              <pre style="background: #f5f5f5; padding: 16px; border-radius: 4px; overflow-x: auto;">${JSON.stringify(errorLog.context, null, 2)}</pre>
              ${errorLog.stack_trace ? `<h3>Stack Trace</h3><pre style="background: #f5f5f5; padding: 16px; border-radius: 4px; overflow-x: auto;">${errorLog.stack_trace}</pre>` : ''}
              <p style="margin-top: 20px; color: #666;">View all errors at <a href="https://app.finault.ai/errors">app.finault.ai/errors</a></p>
            `
          })
        });
      } catch (err) {
        console.error('[ALERT_FAILED]', err.message);
      }
    }

    // Option 2: Increment critical error counter in KV for dashboard badge
    try {
      const currentCount = parseInt(await this.env.KV_CACHE.get('critical_errors_last_hour') || '0');
      await this.env.KV_CACHE.put(
        'critical_errors_last_hour',
        (currentCount + 1).toString(),
        { expirationTtl: 3600 } // 1 hour
      );
    } catch (err) {
      console.error('[CRITICAL_COUNT_FAILED]', err.message);
    }
  }

  /**
   * Force flush all buffered errors
   * Call this in finally blocks to ensure errors are persisted
   */
  async forceFlush() {
    if (this.errors.length > 0) {
      await this.flushErrors();
    }
  }

  /**
   * Get recent errors from KV for observability dashboard
   * Reads error:* keys from KV_CACHE (stored by trackError with 24hr TTL)
   *
   * @param {number} limit - Maximum errors to return (default: 50)
   * @returns {Array} Recent errors sorted by timestamp descending
   */
  async getRecentErrors(limit = 50) {
    const errors = [];

    try {
      // List all error:* keys from KV
      const kvList = await this.env.KV_CACHE.list({ prefix: 'error:', limit: limit });

      if (!kvList || !kvList.keys || kvList.keys.length === 0) {
        return [];
      }

      // Fetch values for all keys in parallel (batched)
      const batchSize = 10;
      for (let i = 0; i < kvList.keys.length; i += batchSize) {
        const batch = kvList.keys.slice(i, i + batchSize);
        const values = await Promise.all(
          batch.map(async (key) => {
            try {
              const value = await this.env.KV_CACHE.get(key.name);
              return value ? JSON.parse(value) : null;
            } catch (e) {
              return null;
            }
          })
        );
        errors.push(...values.filter(v => v !== null));
      }

      // Sort by timestamp descending
      errors.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      return errors.slice(0, limit);
    } catch (e) {
      console.error('[ERROR_TRACKER] getRecentErrors failed:', e.message);
      return [];
    }
  }

  /**
   * Get error summary statistics from KV
   * @returns {Object} { total_last_24h, by_level, by_type }
   */
  async getErrorSummary() {
    try {
      const errors = await this.getRecentErrors(200);
      const now = Date.now();
      const oneHourAgo = now - 3600000;

      const summary = {
        total_last_24h: errors.length,
        last_hour: errors.filter(e => new Date(e.timestamp).getTime() > oneHourAgo).length,
        by_level: {},
        by_type: {},
        most_recent: errors[0] || null
      };

      for (const error of errors) {
        summary.by_level[error.level] = (summary.by_level[error.level] || 0) + 1;
        summary.by_type[error.error_type] = (summary.by_type[error.error_type] || 0) + 1;
      }

      return summary;
    } catch (e) {
      return { total_last_24h: 0, error: e.message };
    }
  }
}

/**
 * Retry utility with exponential backoff
 *
 * @param {Function} operation - Async operation to retry
 * @param {number} maxRetries - Maximum retry attempts (default: 3)
 * @param {ErrorTracker} errorTracker - Optional error tracker for logging
 * @returns {Promise} - Result of successful operation
 */
async function retryWithBackoff(operation, maxRetries = 3, errorTracker = null) {
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === maxRetries - 1;

      if (isLastAttempt) {
        // Final attempt failed - throw error
        throw error;
      }

      // Exponential backoff: 1s, 2s, 4s, 8s...
      const delayMs = Math.pow(2, attempt) * 1000;

      console.log(`[RETRY] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delayMs}ms`, {
        error: error.message
      });

      // Optional: Track retry attempts
      if (errorTracker) {
        await errorTracker.trackError({
          type: 'operation_retry',
          message: `Retry attempt ${attempt + 1}/${maxRetries}: ${error.message}`,
          level: 'warning',
          context: { attempt: attempt + 1, max_retries: maxRetries, delay_ms: delayMs }
        });
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

/**
 * Helper to wrap database operations with error tracking
 *
 * @param {Function} operation - Database operation to execute
 * @param {ErrorTracker} errorTracker - Error tracker instance
 * @param {Object} context - Context for error logging
 * @returns {Promise} - Result of operation or null on error
 */
async function safeDBOperation(operation, errorTracker, context) {
  try {
    return await retryWithBackoff(operation, 3, errorTracker);
  } catch (error) {
    await errorTracker.trackError({
      type: 'database_operation_failed',
      message: error.message,
      code: error.code,
      stack: error.stack,
      context: context,
      level: context.critical ? 'critical' : 'error',
      alertOnError: context.critical || false
    });

    // Return null to allow graceful degradation
    return null;
  }
}

module.exports = {
  ErrorTracker,
  retryWithBackoff,
  safeDBOperation
};
