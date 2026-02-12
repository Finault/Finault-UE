/**
 * Finault Drift Alert Module
 *
 * Real-time alerting for drift detection with configurable
 * thresholds, escalation paths, and notification channels.
 */

import crypto from 'crypto';

// ============================================================================
// ALERT SEVERITY LEVELS
// ============================================================================

export const AlertSeverity = {
  INFO: 'info',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

// ============================================================================
// DRIFT THRESHOLDS
// ============================================================================

export const DEFAULT_THRESHOLDS = {
  // Percentage deviation thresholds
  low: 5,      // 5% deviation
  medium: 10,  // 10% deviation
  high: 20,    // 20% deviation
  critical: 50, // 50% deviation

  // Absolute value thresholds (in base currency)
  absoluteLow: 1000,
  absoluteMedium: 10000,
  absoluteHigh: 100000,
  absoluteCritical: 1000000,

  // Event count thresholds (per close)
  eventCountLow: 3,
  eventCountMedium: 5,
  eventCountHigh: 10,
  eventCountCritical: 20,
};

// ============================================================================
// ALERT RULES
// ============================================================================

export const DEFAULT_ALERT_RULES = [
  {
    id: 'high-drift-percentage',
    name: 'High Drift Percentage',
    description: 'Alert when drift exceeds percentage threshold',
    condition: (drift, thresholds) => {
      const maxDeviation = Math.max(...(drift.driftEvents || []).map(e => Math.abs(e.deviation_percent || 0)));
      return maxDeviation > thresholds.high;
    },
    severity: AlertSeverity.HIGH,
    enabled: true,
  },
  {
    id: 'critical-drift-percentage',
    name: 'Critical Drift Percentage',
    description: 'Alert when drift exceeds critical threshold',
    condition: (drift, thresholds) => {
      const maxDeviation = Math.max(...(drift.driftEvents || []).map(e => Math.abs(e.deviation_percent || 0)));
      return maxDeviation > thresholds.critical;
    },
    severity: AlertSeverity.CRITICAL,
    enabled: true,
  },
  {
    id: 'multiple-drift-events',
    name: 'Multiple Drift Events',
    description: 'Alert when multiple drift events detected',
    condition: (drift, thresholds) => {
      return (drift.driftEvents || []).length >= thresholds.eventCountMedium;
    },
    severity: AlertSeverity.MEDIUM,
    enabled: true,
  },
  {
    id: 'high-absolute-drift',
    name: 'High Absolute Drift',
    description: 'Alert when absolute drift amount is high',
    condition: (drift, thresholds) => {
      const maxAbsolute = Math.max(...(drift.driftEvents || []).map(e => Math.abs(e.absolute_deviation || 0)));
      return maxAbsolute > thresholds.absoluteHigh;
    },
    severity: AlertSeverity.HIGH,
    enabled: true,
  },
  {
    id: 'revenue-drift',
    name: 'Revenue Drift',
    description: 'Alert on any revenue-related drift',
    condition: (drift) => {
      return (drift.driftEvents || []).some(e =>
        e.metric_key?.toLowerCase().includes('revenue') && Math.abs(e.deviation_percent || 0) > 5
      );
    },
    severity: AlertSeverity.HIGH,
    enabled: true,
  },
  {
    id: 'consistent-drift-pattern',
    name: 'Consistent Drift Pattern',
    description: 'Alert when drift consistently in same direction',
    condition: (drift) => {
      const events = drift.driftEvents || [];
      if (events.length < 3) return false;

      const positiveCount = events.filter(e => (e.deviation_percent || 0) > 0).length;
      const negativeCount = events.filter(e => (e.deviation_percent || 0) < 0).length;

      // If 80%+ drift in same direction
      return positiveCount / events.length > 0.8 || negativeCount / events.length > 0.8;
    },
    severity: AlertSeverity.MEDIUM,
    enabled: true,
  },
];

// ============================================================================
// DRIFT ALERT SERVICE
// ============================================================================

export class DriftAlertService {
  constructor(options = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };
    this.rules = options.rules || [...DEFAULT_ALERT_RULES];
    this.notificationChannels = options.notificationChannels || [];

    // Alert history
    this.alerts = [];

    // Escalation config
    this.escalationConfig = options.escalation || {
      [AlertSeverity.LOW]: { delay: 0, channels: ['log'] },
      [AlertSeverity.MEDIUM]: { delay: 0, channels: ['log', 'email'] },
      [AlertSeverity.HIGH]: { delay: 0, channels: ['log', 'email', 'slack'] },
      [AlertSeverity.CRITICAL]: { delay: 0, channels: ['log', 'email', 'slack', 'pagerduty'] },
    };
  }

  /**
   * Evaluate drift and generate alerts
   */
  evaluate(drift, context = {}) {
    const triggeredAlerts = [];

    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      try {
        const triggered = rule.condition(drift, this.thresholds);

        if (triggered) {
          const alert = this._createAlert(rule, drift, context);
          triggeredAlerts.push(alert);
          this.alerts.push(alert);
        }
      } catch (err) {
        console.error(`Error evaluating rule ${rule.id}:`, err);
      }
    }

    // Deduplicate (keep highest severity per metric)
    const deduped = this._deduplicate(triggeredAlerts);

    // Send notifications
    for (const alert of deduped) {
      this._notify(alert);
    }

    return deduped;
  }

  /**
   * Create alert object
   */
  _createAlert(rule, drift, context) {
    return {
      alert_id: `DRIFT-ALT-${crypto.randomBytes(8).toString('hex').toUpperCase()}`,
      rule_id: rule.id,
      rule_name: rule.name,
      severity: rule.severity,
      description: rule.description,
      triggered_at: new Date().toISOString(),
      context: {
        close_id: context.closeId,
        tenant_id: context.tenantId,
        period: context.period,
      },
      drift_summary: {
        overall_severity: drift.summary?.overallDriftSeverity,
        event_count: (drift.driftEvents || []).length,
        max_deviation: Math.max(...(drift.driftEvents || []).map(e => Math.abs(e.deviation_percent || 0)), 0),
        top_movers: (drift.driftEvents || [])
          .sort((a, b) => Math.abs(b.deviation_percent || 0) - Math.abs(a.deviation_percent || 0))
          .slice(0, 3)
          .map(e => ({
            metric: e.metric_key,
            deviation: e.deviation_percent,
          })),
      },
      status: 'active',
    };
  }

  /**
   * Deduplicate alerts (keep highest severity)
   */
  _deduplicate(alerts) {
    const severityOrder = {
      [AlertSeverity.INFO]: 0,
      [AlertSeverity.LOW]: 1,
      [AlertSeverity.MEDIUM]: 2,
      [AlertSeverity.HIGH]: 3,
      [AlertSeverity.CRITICAL]: 4,
    };

    const byCloseId = new Map();

    for (const alert of alerts) {
      const closeId = alert.context.close_id;
      const existing = byCloseId.get(closeId);

      if (!existing || severityOrder[alert.severity] > severityOrder[existing.severity]) {
        byCloseId.set(closeId, alert);
      }
    }

    return Array.from(byCloseId.values());
  }

  /**
   * Send notifications for alert
   */
  async _notify(alert) {
    const config = this.escalationConfig[alert.severity];
    if (!config) return;

    for (const channel of config.channels) {
      try {
        await this._sendToChannel(channel, alert);
      } catch (err) {
        console.error(`Failed to send alert to ${channel}:`, err);
      }
    }
  }

  /**
   * Send to notification channel
   */
  async _sendToChannel(channel, alert) {
    switch (channel) {
      case 'log':
        console.log(`[DRIFT ALERT] [${alert.severity.toUpperCase()}] ${alert.rule_name}:`, {
          alert_id: alert.alert_id,
          close_id: alert.context.close_id,
          max_deviation: alert.drift_summary.max_deviation,
        });
        break;

      case 'email':
        // Would send email via configured provider
        console.log(`[EMAIL] Drift alert: ${alert.alert_id}`);
        break;

      case 'slack':
        // Would send Slack message
        console.log(`[SLACK] Drift alert: ${alert.alert_id}`);
        break;

      case 'pagerduty':
        // Would create PagerDuty incident
        console.log(`[PAGERDUTY] Drift alert: ${alert.alert_id}`);
        break;

      default:
        // Custom channel handler
        const handler = this.notificationChannels.find(c => c.name === channel);
        if (handler?.send) {
          await handler.send(alert);
        }
    }
  }

  /**
   * Acknowledge alert
   */
  acknowledge(alertId, acknowledgedBy) {
    const alert = this.alerts.find(a => a.alert_id === alertId);
    if (!alert) return null;

    alert.status = 'acknowledged';
    alert.acknowledged_at = new Date().toISOString();
    alert.acknowledged_by = acknowledgedBy;

    return alert;
  }

  /**
   * Resolve alert
   */
  resolve(alertId, resolvedBy, resolution) {
    const alert = this.alerts.find(a => a.alert_id === alertId);
    if (!alert) return null;

    alert.status = 'resolved';
    alert.resolved_at = new Date().toISOString();
    alert.resolved_by = resolvedBy;
    alert.resolution = resolution;

    return alert;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(options = {}) {
    let alerts = this.alerts.filter(a => a.status === 'active');

    if (options.severity) {
      alerts = alerts.filter(a => a.severity === options.severity);
    }

    if (options.tenantId) {
      alerts = alerts.filter(a => a.context.tenant_id === options.tenantId);
    }

    if (options.closeId) {
      alerts = alerts.filter(a => a.context.close_id === options.closeId);
    }

    return alerts;
  }

  /**
   * Get alert history
   */
  getAlertHistory(options = {}) {
    let alerts = [...this.alerts];

    if (options.since) {
      const sinceDate = new Date(options.since);
      alerts = alerts.filter(a => new Date(a.triggered_at) >= sinceDate);
    }

    if (options.limit) {
      alerts = alerts.slice(-options.limit);
    }

    return alerts;
  }

  /**
   * Add custom alert rule
   */
  addRule(rule) {
    this.rules.push({
      ...rule,
      id: rule.id || `custom-${crypto.randomBytes(4).toString('hex')}`,
      enabled: rule.enabled !== false,
    });
  }

  /**
   * Update thresholds
   */
  updateThresholds(newThresholds) {
    this.thresholds = { ...this.thresholds, ...newThresholds };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default DriftAlertService;
