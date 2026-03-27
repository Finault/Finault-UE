/**
 * Monitoring and Health Check Handlers
 * Provides health status, metrics collection, and alerting capabilities
 */

const HEALTH_CHECK_VERSION = '1.0.0';

/**
 * Health check endpoint
 * Returns basic system status and version info
 */
export async function handleHealthCheck(env) {
  return {
    status: 'ok',
    version: HEALTH_CHECK_VERSION,
    timestamp: Date.now(),
    uptime: process.uptime ? process.uptime() : 0
  };
}

/**
 * Write metrics to Analytics Engine
 * Tracks operational metrics including latency, costs, and seal success
 */
export async function handleMetricsWrite(env, ctx, metrics) {
  if (!env.ANALYTICS) {
    console.warn('Analytics Engine not configured');
    return { success: false, error: 'Analytics not available' };
  }

  const {
    orgId,
    provider,
    model,
    sealResult,
    supabaseResult,
    finaultOverheadMs = 0,
    providerLatencyMs = 0,
    costUsd = 0
  } = metrics;

  try {
    // Write to Analytics Engine
    // This batches metrics and persists them for querying
    await env.ANALYTICS.writeDataPoint({
      blobs: [
        orgId || 'unknown',
        provider || 'unknown',
        model || 'unknown',
        sealResult ? 'success' : 'failure',
        supabaseResult ? 'success' : 'failure'
      ],
      doubles: [
        finaultOverheadMs,
        providerLatencyMs,
        costUsd
      ],
      indexes: [orgId || 'unknown']
    });

    return {
      success: true,
      dataPoint: {
        orgId,
        provider,
        model,
        sealResult,
        supabaseResult,
        finaultOverheadMs,
        providerLatencyMs,
        costUsd,
        timestamp: Date.now()
      }
    };
  } catch (error) {
    console.error('Failed to write metrics:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Alert conditions and thresholds
 */
const ALERT_CONDITIONS = {
  HIGH_OVERHEAD: {
    threshold: 50, // ms
    duration: 5 * 60 * 1000, // 5 minutes
    metric: 'finaultOverheadMs',
    severity: 'warning'
  },
  HIGH_SEAL_FAILURE: {
    threshold: 0.01, // 1%
    duration: 5 * 60 * 1000,
    metric: 'sealFailureRate',
    severity: 'critical'
  },
  HIGH_ENDPOINT_ERROR: {
    threshold: 10, // errors per minute
    duration: 1 * 60 * 1000,
    metric: 'endpoint500Count',
    severity: 'critical'
  },
  HEALTH_CHECK_FAILURE: {
    threshold: 3, // consecutive failures
    duration: 1 * 60 * 1000,
    metric: 'healthCheckFailures',
    severity: 'critical'
  }
};

/**
 * Send Slack webhook alert
 * Posts alerts to Slack for operator awareness
 */
export async function handleAlert(env, condition, details) {
  if (!env.SLACK_WEBHOOK_URL) {
    console.warn('Slack webhook not configured');
    return { success: false, error: 'Slack webhook not configured' };
  }

  const alertConfig = ALERT_CONDITIONS[condition];
  if (!alertConfig) {
    return { success: false, error: `Unknown condition: ${condition}` };
  }

  const colorMap = {
    warning: '#ffa500',
    critical: '#ff4444'
  };

  const slackPayload = {
    text: `Finault Alert: ${condition}`,
    attachments: [
      {
        color: colorMap[alertConfig.severity] || '#ffa500',
        title: condition,
        fields: [
          {
            title: 'Severity',
            value: alertConfig.severity,
            short: true
          },
          {
            title: 'Threshold',
            value: `${alertConfig.threshold}`,
            short: true
          },
          {
            title: 'Details',
            value: formatAlertDetails(details),
            short: false
          },
          {
            title: 'Timestamp',
            value: new Date().toISOString(),
            short: true
          }
        ],
        footer: 'Finault Monitoring',
        footer_icon: 'https://finault.ai/logo.png'
      }
    ]
  };

  try {
    const response = await fetch(env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackPayload)
    });

    if (response.ok) {
      return {
        success: true,
        condition,
        alert: 'Slack notification sent',
        timestamp: Date.now()
      };
    } else {
      const text = await response.text();
      throw new Error(`Slack API returned ${response.status}: ${text}`);
    }
  } catch (error) {
    console.error('Failed to send Slack alert:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Format alert details for Slack message
 */
function formatAlertDetails(details) {
  if (typeof details === 'string') {
    return details;
  }

  if (typeof details === 'object' && details !== null) {
    return Object.entries(details)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join('\n');
  }

  return JSON.stringify(details);
}

/**
 * Condition checker utility
 * Evaluates if an alert should be triggered
 */
export class ConditionChecker {
  constructor() {
    this.metrics = new Map();
    this.failureCounters = new Map();
  }

  recordMetric(name, value) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    const readings = this.metrics.get(name);
    readings.push({
      value,
      timestamp: Date.now()
    });

    // Keep only recent readings (last 10 minutes)
    const cutoff = Date.now() - 10 * 60 * 1000;
    this.metrics.set(name, readings.filter(r => r.timestamp > cutoff));
  }

  recordFailure(name) {
    this.failureCounters.set(name, (this.failureCounters.get(name) || 0) + 1);
    return this.failureCounters.get(name);
  }

  resetFailure(name) {
    this.failureCounters.delete(name);
  }

  checkCondition(condition, value) {
    const config = ALERT_CONDITIONS[condition];
    if (!config) return false;

    switch (condition) {
      case 'HIGH_OVERHEAD':
        return this.checkHighOverhead(value);
      case 'HIGH_SEAL_FAILURE':
        return this.checkHighSealFailure(value);
      case 'HIGH_ENDPOINT_ERROR':
        return this.checkHighEndpointError(value);
      case 'HEALTH_CHECK_FAILURE':
        return this.checkHealthCheckFailure(value);
      default:
        return false;
    }
  }

  checkHighOverhead(latency) {
    // Check if overhead is consistently above threshold for 5 minutes
    const readings = this.metrics.get('overhead') || [];
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;

    const recentReadings = readings.filter(r => r.timestamp > fiveMinutesAgo);
    if (recentReadings.length === 0) return false;

    const allHigh = recentReadings.every(r => r.value > 50);
    return allHigh && recentReadings.length >= 5; // At least 5 samples
  }

  checkHighSealFailure(failureRate) {
    // Check if failure rate exceeds 1%
    return failureRate > 0.01;
  }

  checkHighEndpointError(errorCount) {
    // Check if more than 10 errors per minute
    const readings = this.metrics.get('endpoint500') || [];
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;

    const recentErrors = readings.filter(r => r.timestamp > oneMinuteAgo);
    return recentErrors.length > 10;
  }

  checkHealthCheckFailure(failureCount) {
    // Check if 3 consecutive health checks failed
    return failureCount >= 3;
  }
}

export default {
  handleHealthCheck,
  handleMetricsWrite,
  handleAlert,
  ConditionChecker
};
