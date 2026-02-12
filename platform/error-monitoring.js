/**
 * Finault Enterprise Error Monitoring & Observability
 * ═══════════════════════════════════════════════════════════════════
 * Production-grade error monitoring and observability service
 * Cloudflare Workers compatible with Sentry integration
 *
 * Features:
 * - Comprehensive error capture with stack traces and context
 * - Optional Sentry integration via HTTP envelope protocol
 * - Cloudflare Logpush compatible JSON logging
 * - Health monitoring with latency percentiles
 * - Circuit breaker pattern for downstream services
 * - Configurable alert thresholds
 * ═══════════════════════════════════════════════════════════════════
 */

/**
 * Error Severity Levels
 */
const ErrorSeverity = {
  FATAL: 'fatal',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
  DEBUG: 'debug',
};

/**
 * Alert Thresholds
 */
const ALERT_THRESHOLDS = {
  ERROR_RATE_CRITICAL: 0.05,        // > 5% error rate
  P99_LATENCY_WARNING: 5000,         // > 5000ms P99 latency
  CIRCUIT_BREAKER_THRESHOLD: 5,      // 5 consecutive failures
  CIRCUIT_BREAKER_TIMEOUT: 60000,    // 60 second recovery window
};

/**
 * Circuit Breaker for Downstream Services
 * Prevents cascading failures when services are unhealthy
 */
class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.threshold = options.threshold || ALERT_THRESHOLDS.CIRCUIT_BREAKER_THRESHOLD;
    this.timeout = options.timeout || ALERT_THRESHOLDS.CIRCUIT_BREAKER_TIMEOUT;
    this.successThreshold = options.successThreshold || 2;
  }

  /**
   * Record a successful call
   */
  recordSuccess() {
    this.failureCount = 0;

    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = 'CLOSED';
        this.successCount = 0;
      }
    }
  }

  /**
   * Record a failed call
   */
  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.threshold && this.state === 'CLOSED') {
      this.state = 'OPEN';
    }
  }

  /**
   * Check if requests are allowed
   */
  isAllowed() {
    if (this.state === 'CLOSED') return true;

    if (this.state === 'OPEN') {
      // Check if recovery timeout has passed
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
        this.failureCount = 0;
        this.successCount = 0;
        return true;
      }
      return false;
    }

    // HALF_OPEN: allow requests
    return true;
  }

  /**
   * Get circuit breaker status
   */
  getStatus() {
    return {
      service: this.name,
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

/**
 * Error Monitor Class
 * Handles error capture, logging, and integration with monitoring services
 */
class ErrorMonitor {
  constructor(config = {}) {
    this.config = {
      environment: config.environment || 'production',
      sentryDsn: config.sentryDsn || process.env.SENTRY_DSN,
      serviceName: config.serviceName || 'finault-gateway',
      releaseVersion: config.releaseVersion || '1.0.0',
      ...config,
    };

    // Initialize metrics tracking
    this.metrics = {
      totalRequests: 0,
      totalErrors: 0,
      errorsByType: {},
      errorsByRoute: {},
      latencies: [],
      lastHourErrors: [],
    };

    // Breadcrumb trail for error context
    this.breadcrumbs = [];
    this.maxBreadcrumbs = 20;

    // Transaction tracking
    this.transactions = new Map();

    // Circuit breakers for downstream services
    this.circuitBreakers = {
      supabase: new CircuitBreaker('supabase'),
      erp: new CircuitBreaker('erp'),
      blockchain: new CircuitBreaker('blockchain'),
    };
  }

  /**
   * Generate unique error ID
   */
  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Capture an error with full context
   */
  captureError(error, context = {}) {
    const errorId = this.generateErrorId();
    const timestamp = new Date().toISOString();

    // Parse error information
    const errorData = {
      id: errorId,
      timestamp,
      type: error.name || 'Error',
      message: error.message || 'Unknown error',
      stack: error.stack || '',
      severity: context.severity || ErrorSeverity.ERROR,
      environment: this.config.environment,
      service: this.config.serviceName,
      release: this.config.releaseVersion,
    };

    // Add request context
    if (context.request) {
      errorData.request = {
        url: context.request.url,
        method: context.request.method,
        headers: this._sanitizeHeaders(context.request.headers),
        userId: context.request.userId,
      };
    }

    // Add breadcrumbs
    if (this.breadcrumbs.length > 0) {
      errorData.breadcrumbs = [...this.breadcrumbs];
    }

    // Add custom context
    if (context.extra) {
      errorData.extra = context.extra;
    }

    // Add transaction if available
    if (context.transactionId) {
      const transaction = this.transactions.get(context.transactionId);
      if (transaction) {
        errorData.transaction = {
          id: context.transactionId,
          name: transaction.name,
          duration: Date.now() - transaction.startTime,
        };
      }
    }

    // Update metrics
    this._updateMetrics(errorData, context);

    // Log to Cloudflare Logpush format
    this._logToCloudflare(errorData);

    // Send to Sentry if configured
    if (this.config.sentryDsn) {
      this._sendToSentry(errorData).catch(err => {
        console.error('Failed to send error to Sentry:', err);
      });
    }

    // Log locally
    console.error(`[${errorData.severity.toUpperCase()}] ${errorData.id}:`, errorData);

    return errorId;
  }

  /**
   * Capture a message (non-error)
   */
  captureMessage(message, level = 'info', context = {}) {
    const timestamp = new Date().toISOString();

    const messageData = {
      id: this.generateErrorId(),
      timestamp,
      type: 'Message',
      message,
      severity: level,
      environment: this.config.environment,
      service: this.config.serviceName,
      extra: context.extra,
    };

    if (context.request) {
      messageData.request = {
        url: context.request.url,
        method: context.request.method,
        userId: context.request.userId,
      };
    }

    this._logToCloudflare(messageData);
    console.log(`[${level.toUpperCase()}] ${message}`);

    return messageData.id;
  }

  /**
   * Start a transaction to track request flow
   */
  startTransaction(name, context = {}) {
    const transactionId = this.generateErrorId();

    this.transactions.set(transactionId, {
      id: transactionId,
      name,
      startTime: Date.now(),
      breadcrumbs: [],
      context,
    });

    return {
      id: transactionId,
      name,
      context,
      finish: () => this._finishTransaction(transactionId),
      addBreadcrumb: (crumb) => this._addTransactionBreadcrumb(transactionId, crumb),
    };
  }

  /**
   * Finish transaction and record metrics
   */
  _finishTransaction(transactionId) {
    const transaction = this.transactions.get(transactionId);

    if (!transaction) return;

    const duration = Date.now() - transaction.startTime;
    this.metrics.latencies.push(duration);

    // Keep only last 1000 latency samples
    if (this.metrics.latencies.length > 1000) {
      this.metrics.latencies.shift();
    }

    // Log transaction completion
    console.log(`[TRANSACTION] ${transaction.name} completed in ${duration}ms`);

    this.transactions.delete(transactionId);
  }

  /**
   * Add breadcrumb to global trail
   */
  addBreadcrumb(message, category = 'default', level = 'info', data = {}) {
    const breadcrumb = {
      timestamp: Date.now(),
      message,
      category,
      level,
      data,
    };

    this.breadcrumbs.push(breadcrumb);

    // Keep only last N breadcrumbs
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs.shift();
    }
  }

  /**
   * Add breadcrumb to specific transaction
   */
  _addTransactionBreadcrumb(transactionId, breadcrumb) {
    const transaction = this.transactions.get(transactionId);
    if (transaction) {
      transaction.breadcrumbs.push(breadcrumb);
    }
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    const latencies = this.metrics.latencies.sort((a, b) => a - b);
    const length = latencies.length;

    const percentile = (p) => {
      const idx = Math.ceil(length * (p / 100)) - 1;
      return latencies[Math.max(0, idx)];
    };

    const errorRate = this.metrics.totalRequests > 0
      ? this.metrics.totalErrors / this.metrics.totalRequests
      : 0;

    return {
      timestamp: new Date().toISOString(),
      service: this.config.serviceName,
      requests: {
        total: this.metrics.totalRequests,
        errors: this.metrics.totalErrors,
        errorRate: (errorRate * 100).toFixed(2) + '%',
      },
      latency: {
        samples: length,
        p50: percentile(50),
        p95: percentile(95),
        p99: percentile(99),
        max: latencies[length - 1] || 0,
      },
      errors: {
        byType: this.metrics.errorsByType,
        byRoute: this.metrics.errorsByRoute,
      },
      circuitBreakers: Object.values(this.circuitBreakers).map(cb => cb.getStatus()),
      alerts: this._generateAlerts(errorRate, percentile(99)),
    };
  }

  /**
   * Check health status
   */
  checkHealth() {
    const metrics = this.getMetrics();
    const alerts = metrics.alerts;

    const health = {
      status: alerts.length === 0 ? 'healthy' : 'degraded',
      timestamp: metrics.timestamp,
      checks: {
        errorRate: {
          status: alerts.some(a => a.type === 'error_rate') ? 'critical' : 'ok',
          value: metrics.requests.errorRate,
        },
        latency: {
          status: alerts.some(a => a.type === 'latency') ? 'warning' : 'ok',
          p99: metrics.latency.p99,
        },
        circuitBreakers: {
          status: this.circuitBreakers.supabase.state !== 'CLOSED' ||
                  this.circuitBreakers.erp.state !== 'CLOSED' ||
                  this.circuitBreakers.blockchain.state !== 'CLOSED' ? 'warning' : 'ok',
          details: Object.values(this.circuitBreakers).map(cb => cb.getStatus()),
        },
      },
      alerts,
    };

    return health;
  }

  /**
   * Generate alerts based on thresholds
   */
  _generateAlerts(errorRate, p99Latency) {
    const alerts = [];

    if (errorRate > ALERT_THRESHOLDS.ERROR_RATE_CRITICAL) {
      alerts.push({
        type: 'error_rate',
        severity: 'critical',
        message: `Error rate ${(errorRate * 100).toFixed(2)}% exceeds threshold`,
        threshold: `${(ALERT_THRESHOLDS.ERROR_RATE_CRITICAL * 100)}%`,
      });
    }

    if (p99Latency > ALERT_THRESHOLDS.P99_LATENCY_WARNING) {
      alerts.push({
        type: 'latency',
        severity: 'warning',
        message: `P99 latency ${p99Latency}ms exceeds threshold`,
        threshold: `${ALERT_THRESHOLDS.P99_LATENCY_WARNING}ms`,
      });
    }

    // Check circuit breakers
    Object.values(this.circuitBreakers).forEach(cb => {
      if (cb.state === 'OPEN') {
        alerts.push({
          type: 'circuit_breaker',
          severity: 'error',
          message: `Circuit breaker OPEN for ${cb.name}`,
          service: cb.name,
        });
      }
    });

    return alerts;
  }

  /**
   * Update metrics based on captured error
   */
  _updateMetrics(errorData, context) {
    this.metrics.totalErrors++;
    this.metrics.lastHourErrors.push(errorData.timestamp);

    // Track errors by type
    const errorType = errorData.type;
    this.metrics.errorsByType[errorType] = (this.metrics.errorsByType[errorType] || 0) + 1;

    // Track errors by route
    if (context.route) {
      this.metrics.errorsByRoute[context.route] =
        (this.metrics.errorsByRoute[context.route] || 0) + 1;
    }

    // Cleanup old entries (older than 1 hour)
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    this.metrics.lastHourErrors = this.metrics.lastHourErrors.filter(ts => {
      const errorTime = new Date(ts).getTime();
      return errorTime > oneHourAgo;
    });
  }

  /**
   * Sanitize headers to remove sensitive data
   */
  _sanitizeHeaders(headers) {
    if (!headers) return {};

    const sanitized = {};
    const sensitiveKeys = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];

    for (const [key, value] of Object.entries(headers)) {
      if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Log to Cloudflare Logpush format
   */
  _logToCloudflare(errorData) {
    const logEntry = {
      timestamp: new Date(errorData.timestamp).getTime() / 1000,
      level: errorData.severity,
      message: errorData.message,
      context: {
        errorId: errorData.id,
        errorType: errorData.type,
        service: errorData.service,
        environment: errorData.environment,
        trace_id: errorData.id,
      },
      request: errorData.request || {},
      extra: errorData.extra || {},
    };

    // In a real Cloudflare Workers environment, this would be sent to Logpush
    // For now, we log it to the console in structured format
    console.log(JSON.stringify(logEntry));
  }

  /**
   * Send error to Sentry via HTTP envelope protocol
   */
  async _sendToSentry(errorData) {
    if (!this.config.sentryDsn) return;

    // Parse DSN: https://<key>@<host>/project/<projectId>
    const dsnMatch = this.config.sentryDsn.match(
      /https?:\/\/([^@]+)@([^/]+)\/(\d+)/
    );

    if (!dsnMatch) {
      console.error('Invalid Sentry DSN format');
      return;
    }

    const [, authKey, host, projectId] = dsnMatch;
    const endpoint = `https://${host}/api/${projectId}/envelope/`;

    // Build Sentry event
    const sentryEvent = {
      event_id: errorData.id.replace('err_', ''),
      timestamp: errorData.timestamp,
      level: this._mapSeverityToSentryLevel(errorData.severity),
      message: errorData.message,
      exception: errorData.stack ? {
        values: [{
          type: errorData.type,
          value: errorData.message,
          stacktrace: this._parseStackTrace(errorData.stack),
        }],
      } : undefined,
      request: errorData.request,
      tags: {
        environment: errorData.environment,
        service: errorData.service,
      },
      extra: errorData.extra || {},
      breadcrumbs: errorData.breadcrumbs,
    };

    // Build envelope header
    const envelopeHeader = {
      event_id: sentryEvent.event_id,
      dsn: this.config.sentryDsn,
    };

    // Build item header
    const itemHeader = {
      type: 'event',
      length: JSON.stringify(sentryEvent).length,
    };

    // Format as Sentry envelope
    const envelope =
      JSON.stringify(envelopeHeader) + '\n' +
      JSON.stringify(itemHeader) + '\n' +
      JSON.stringify(sentryEvent);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-sentry-envelope',
          'X-Sentry-Auth': `Sentry sentry_key=${authKey}`,
        },
        body: envelope,
      });

      if (!response.ok) {
        console.error(`Sentry error: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to send to Sentry:', error);
    }
  }

  /**
   * Map error severity to Sentry level
   */
  _mapSeverityToSentryLevel(severity) {
    const levelMap = {
      fatal: 'fatal',
      error: 'error',
      warning: 'warning',
      info: 'info',
      debug: 'debug',
    };

    return levelMap[severity] || 'error';
  }

  /**
   * Parse stack trace into frames
   */
  _parseStackTrace(stack) {
    if (!stack) return { frames: [] };

    const frames = stack
      .split('\n')
      .slice(1)
      .map(line => {
        // Simple stack frame parsing
        const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
        if (match) {
          return {
            function: match[1],
            filename: match[2],
            lineno: parseInt(match[3]),
            colno: parseInt(match[4]),
          };
        }
        return null;
      })
      .filter(Boolean);

    return { frames };
  }
}

/**
 * Middleware wrapper for Cloudflare Workers fetch handler
 * Wraps a fetch handler with error monitoring and observability
 */
function withErrorMonitoring(handler, options = {}) {
  return async (request, env, ctx) => {
    const monitor = new ErrorMonitor({
      environment: env.ENVIRONMENT || 'production',
      sentryDsn: env.SENTRY_DSN,
      ...options,
    });

    // Extract request info
    const url = new URL(request.url);
    const requestContext = {
      url: request.url,
      method: request.method,
      headers: request.headers,
      userId: request.headers.get('X-User-Id'),
    };

    // Track request latency
    const transaction = monitor.startTransaction(
      `${request.method} ${url.pathname}`,
      { route: url.pathname }
    );

    // Add breadcrumb for request start
    monitor.addBreadcrumb(
      `${request.method} ${url.pathname}`,
      'http',
      'info'
    );

    try {
      // Call the handler
      let response = await handler(request, env, ctx);

      // Track metrics
      monitor.metrics.totalRequests++;

      // Add breadcrumb for response
      monitor.addBreadcrumb(
        `Response ${response.status}`,
        'http',
        response.ok ? 'info' : 'warning'
      );

      // Finish transaction
      transaction.finish();

      return response;
    } catch (error) {
      // Capture error
      monitor.captureError(error, {
        severity: ErrorSeverity.FATAL,
        request: requestContext,
        route: url.pathname,
        transactionId: transaction.id,
      });

      // Update metrics
      monitor.metrics.totalRequests++;
      monitor.metrics.totalErrors++;

      // Return error response
      return new Response(
        JSON.stringify({
          error: 'Internal Server Error',
          errorId: error.id,
          message: error.message,
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  };
}

// Export classes and functions
export { ErrorMonitor, CircuitBreaker, withErrorMonitoring, ErrorSeverity, ALERT_THRESHOLDS };
