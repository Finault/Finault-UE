/**
 * Finault Observability Module
 *
 * Prometheus metrics, StatsD integration, and structured logging
 * for enterprise monitoring and alerting.
 */

import { promisify } from 'util';

// ============================================================================
// PROMETHEUS METRICS
// ============================================================================

/**
 * Metric types for Prometheus export
 */
const MetricType = {
  COUNTER: 'counter',
  GAUGE: 'gauge',
  HISTOGRAM: 'histogram',
  SUMMARY: 'summary',
};

/**
 * In-memory metrics store for Prometheus scraping
 */
class MetricsRegistry {
  constructor() {
    this.metrics = new Map();
    this.prefix = 'finault_';
  }

  /**
   * Register a counter metric
   */
  counter(name, help, labels = []) {
    const fullName = this.prefix + name;
    if (!this.metrics.has(fullName)) {
      this.metrics.set(fullName, {
        type: MetricType.COUNTER,
        name: fullName,
        help,
        labels,
        values: new Map(),
      });
    }
    return {
      inc: (labelValues = {}, value = 1) => this._increment(fullName, labelValues, value),
      labels: (labelValues) => ({
        inc: (value = 1) => this._increment(fullName, labelValues, value),
      }),
    };
  }

  /**
   * Register a gauge metric
   */
  gauge(name, help, labels = []) {
    const fullName = this.prefix + name;
    if (!this.metrics.has(fullName)) {
      this.metrics.set(fullName, {
        type: MetricType.GAUGE,
        name: fullName,
        help,
        labels,
        values: new Map(),
      });
    }
    return {
      set: (labelValues, value) => this._set(fullName, labelValues, value),
      inc: (labelValues = {}, value = 1) => this._increment(fullName, labelValues, value),
      dec: (labelValues = {}, value = 1) => this._increment(fullName, labelValues, -value),
      labels: (labelValues) => ({
        set: (value) => this._set(fullName, labelValues, value),
        inc: (value = 1) => this._increment(fullName, labelValues, value),
        dec: (value = 1) => this._increment(fullName, labelValues, -value),
      }),
    };
  }

  /**
   * Register a histogram metric
   */
  histogram(name, help, labels = [], buckets = [0.1, 0.5, 1, 2, 5, 10, 30, 60]) {
    const fullName = this.prefix + name;
    if (!this.metrics.has(fullName)) {
      this.metrics.set(fullName, {
        type: MetricType.HISTOGRAM,
        name: fullName,
        help,
        labels,
        buckets,
        values: new Map(),
      });
    }
    return {
      observe: (labelValues, value) => this._observe(fullName, labelValues, value),
      labels: (labelValues) => ({
        observe: (value) => this._observe(fullName, labelValues, value),
      }),
      startTimer: (labelValues = {}) => {
        const start = process.hrtime.bigint();
        return () => {
          const end = process.hrtime.bigint();
          const duration = Number(end - start) / 1e9;
          this._observe(fullName, labelValues, duration);
          return duration;
        };
      },
    };
  }

  _getLabelKey(labelValues) {
    return JSON.stringify(Object.entries(labelValues).sort());
  }

  _increment(name, labelValues, value) {
    const metric = this.metrics.get(name);
    if (!metric) return;
    const key = this._getLabelKey(labelValues);
    const current = metric.values.get(key) || { count: 0, labelValues };
    current.count += value;
    metric.values.set(key, current);
  }

  _set(name, labelValues, value) {
    const metric = this.metrics.get(name);
    if (!metric) return;
    const key = this._getLabelKey(labelValues);
    metric.values.set(key, { value, labelValues });
  }

  _observe(name, labelValues, value) {
    const metric = this.metrics.get(name);
    if (!metric) return;
    const key = this._getLabelKey(labelValues);
    let data = metric.values.get(key);
    if (!data) {
      data = {
        labelValues,
        count: 0,
        sum: 0,
        buckets: metric.buckets.map(b => ({ le: b, count: 0 })),
      };
    }
    data.count++;
    data.sum += value;
    for (const bucket of data.buckets) {
      if (value <= bucket.le) {
        bucket.count++;
      }
    }
    metric.values.set(key, data);
  }

  /**
   * Export metrics in Prometheus text format
   */
  export() {
    const lines = [];

    for (const metric of this.metrics.values()) {
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} ${metric.type}`);

      for (const [key, data] of metric.values) {
        const labelStr = this._formatLabels(data.labelValues);

        if (metric.type === MetricType.COUNTER) {
          lines.push(`${metric.name}${labelStr} ${data.count}`);
        } else if (metric.type === MetricType.GAUGE) {
          lines.push(`${metric.name}${labelStr} ${data.value}`);
        } else if (metric.type === MetricType.HISTOGRAM) {
          for (const bucket of data.buckets) {
            const bucketLabels = { ...data.labelValues, le: bucket.le };
            lines.push(`${metric.name}_bucket${this._formatLabels(bucketLabels)} ${bucket.count}`);
          }
          lines.push(`${metric.name}_bucket${this._formatLabels({ ...data.labelValues, le: '+Inf' })} ${data.count}`);
          lines.push(`${metric.name}_sum${labelStr} ${data.sum}`);
          lines.push(`${metric.name}_count${labelStr} ${data.count}`);
        }
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  _formatLabels(labelValues) {
    const entries = Object.entries(labelValues);
    if (entries.length === 0) return '';
    const pairs = entries.map(([k, v]) => `${k}="${v}"`);
    return `{${pairs.join(',')}}`;
  }

  /**
   * Reset all metrics (for testing)
   */
  reset() {
    for (const metric of this.metrics.values()) {
      metric.values.clear();
    }
  }
}

// ============================================================================
// FINAULT METRICS
// ============================================================================

const registry = new MetricsRegistry();

// Close Pack metrics
export const closePackGenerated = registry.counter(
  'closepack_generated_total',
  'Total Close Packs generated',
  ['tenant_id', 'status']
);

export const closePackVerified = registry.counter(
  'closepack_verified_total',
  'Total Close Pack verifications',
  ['tenant_id', 'status']
);

export const closePackSize = registry.histogram(
  'closepack_size_bytes',
  'Close Pack ZIP size in bytes',
  ['tenant_id'],
  [10000, 50000, 100000, 500000, 1000000, 5000000, 10000000]
);

export const closePackLatency = registry.histogram(
  'closepack_generation_seconds',
  'Time to generate Close Pack',
  ['tenant_id'],
  [0.1, 0.5, 1, 2, 5, 10, 30]
);

// FCS metrics
export const fcsScore = registry.histogram(
  'fcs_score',
  'FCS score distribution',
  ['tenant_id', 'tier'],
  [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0]
);

export const fcsComputed = registry.counter(
  'fcs_computed_total',
  'Total FCS computations',
  ['tenant_id', 'tier']
);

// Drift metrics
export const driftEvents = registry.counter(
  'drift_events_total',
  'Total drift events detected',
  ['tenant_id', 'severity']
);

export const driftScore = registry.histogram(
  'drift_deviation_percent',
  'Drift deviation percentage',
  ['tenant_id', 'metric_key'],
  [1, 5, 10, 20, 50, 100]
);

// ERP posting metrics
export const erpPostAttempts = registry.counter(
  'erp_post_attempts_total',
  'Total ERP posting attempts',
  ['tenant_id', 'erp', 'status']
);

export const erpPostLatency = registry.histogram(
  'erp_post_seconds',
  'ERP posting latency',
  ['tenant_id', 'erp'],
  [0.1, 0.5, 1, 2, 5, 10, 30, 60]
);

// Telemetry metrics
export const telemetryIngested = registry.counter(
  'telemetry_ingested_total',
  'Total telemetry events ingested',
  ['tenant_id', 'event_type']
);

export const telemetryBatchSize = registry.histogram(
  'telemetry_batch_size',
  'Telemetry batch size',
  ['tenant_id'],
  [10, 50, 100, 500, 1000, 5000]
);

// API metrics
export const apiRequests = registry.counter(
  'api_requests_total',
  'Total API requests',
  ['method', 'path', 'status']
);

export const apiLatency = registry.histogram(
  'api_request_seconds',
  'API request latency',
  ['method', 'path'],
  [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
);

// System metrics
export const activeConnections = registry.gauge(
  'active_connections',
  'Number of active connections',
  ['type']
);

// ============================================================================
// STRUCTURED LOGGING
// ============================================================================

const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4,
};

class StructuredLogger {
  constructor(options = {}) {
    this.service = options.service || 'finault';
    this.environment = options.environment || process.env.NODE_ENV || 'development';
    this.minLevel = LogLevel[options.level?.toUpperCase()] ?? LogLevel.INFO;
    this.outputs = options.outputs || [this._consoleOutput.bind(this)];
  }

  _log(level, message, data = {}) {
    if (LogLevel[level] < this.minLevel) return;

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      environment: this.environment,
      message,
      ...data,
    };

    // Add trace ID if available
    if (data.traceId || global.__finaultTraceId) {
      entry.trace_id = data.traceId || global.__finaultTraceId;
    }

    for (const output of this.outputs) {
      output(entry);
    }
  }

  _consoleOutput(entry) {
    const colorCodes = {
      DEBUG: '\x1b[36m',
      INFO: '\x1b[32m',
      WARN: '\x1b[33m',
      ERROR: '\x1b[31m',
      FATAL: '\x1b[35m',
    };
    const reset = '\x1b[0m';
    const color = colorCodes[entry.level] || '';

    if (this.environment === 'production') {
      // JSON output for production
      console.log(JSON.stringify(entry));
    } else {
      // Pretty output for development
      const { timestamp, level, message, ...rest } = entry;
      const extra = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : '';
      console.log(`${color}[${timestamp}] ${level}${reset}: ${message}${extra}`);
    }
  }

  debug(message, data) { this._log('DEBUG', message, data); }
  info(message, data) { this._log('INFO', message, data); }
  warn(message, data) { this._log('WARN', message, data); }
  error(message, data) { this._log('ERROR', message, data); }
  fatal(message, data) { this._log('FATAL', message, data); }

  child(bindings) {
    const childLogger = new StructuredLogger({
      service: this.service,
      environment: this.environment,
      level: Object.keys(LogLevel).find(k => LogLevel[k] === this.minLevel),
      outputs: this.outputs,
    });

    const originalLog = childLogger._log.bind(childLogger);
    childLogger._log = (level, message, data = {}) => {
      originalLog(level, message, { ...bindings, ...data });
    };

    return childLogger;
  }
}

// ============================================================================
// ALERT DEFINITIONS
// ============================================================================

/**
 * Alert rules for monitoring
 */
export const alertRules = [
  {
    name: 'HighFCSFailureRate',
    query: 'rate(finault_fcs_computed_total{tier="FAILED"}[5m]) / rate(finault_fcs_computed_total[5m]) > 0.1',
    severity: 'warning',
    description: 'More than 10% of FCS computations are failing',
  },
  {
    name: 'HighDriftRate',
    query: 'rate(finault_drift_events_total{severity="HIGH"}[5m]) > 5',
    severity: 'critical',
    description: 'High drift events exceeding 5 per 5 minutes',
  },
  {
    name: 'ERPPostingFailures',
    query: 'rate(finault_erp_post_attempts_total{status="failed"}[5m]) > 0',
    severity: 'critical',
    description: 'ERP posting failures detected',
  },
  {
    name: 'HighAPILatency',
    query: 'histogram_quantile(0.95, rate(finault_api_request_seconds_bucket[5m])) > 5',
    severity: 'warning',
    description: 'API p95 latency exceeds 5 seconds',
  },
  {
    name: 'LowFCSScores',
    query: 'histogram_quantile(0.5, rate(finault_fcs_score_bucket[1h])) < 0.75',
    severity: 'warning',
    description: 'Median FCS score below 0.75 threshold',
  },
];

// ============================================================================
// EXPORTS
// ============================================================================

export const metrics = registry;
export const logger = new StructuredLogger();

export default {
  registry,
  metrics,
  logger,
  alertRules,
  closePackGenerated,
  closePackVerified,
  closePackSize,
  closePackLatency,
  fcsScore,
  fcsComputed,
  driftEvents,
  driftScore,
  erpPostAttempts,
  erpPostLatency,
  telemetryIngested,
  telemetryBatchSize,
  apiRequests,
  apiLatency,
  activeConnections,
};
