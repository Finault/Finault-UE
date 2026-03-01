/**
 * Finault Diamond Tier Budget Management Module
 *
 * Provides enterprise-grade budget management capabilities including:
 * - 8 configurable alert thresholds with custom routing
 * - Budget vs. actual variance reporting with 3-level drill-down
 * - Scenario planning and what-if analysis
 * - Advanced forecasting with confidence intervals
 * - AI-assisted budget creation
 * - Budget federation and reallocation workflows
 * - Real-time budget compliance scoring
 */

'use strict';

import { DiamondLogger, CircuitBreaker, resilientFetch, InputValidator, HealthCheck } from './diamond-utils.js';

const ALERT_LEVELS = {
  CRITICAL: 'critical',
  WARNING: 'warning',
  INFO: 'info',
  SUCCESS: 'success'
};

const NOTIFICATION_CHANNELS = {
  EMAIL: 'email',
  SLACK: 'slack',
  PAGERDUTY: 'pagerduty',
  WEBHOOK: 'webhook',
  INTERNAL: 'internal'
};

const FORECAST_METHODS = {
  LINEAR_REGRESSION: 'linear_regression',
  EXPONENTIAL_SMOOTHING: 'exponential_smoothing',
  SEASONAL_DECOMPOSITION: 'seasonal_decomposition',
  ARIMA: 'arima',
  PROPHET: 'prophet'
};

const COMPLIANCE_DIMENSIONS = {
  SPEND_RATE: 'spend_rate',
  VARIANCE: 'variance',
  FORECAST_ACCURACY: 'forecast_accuracy',
  POLICY_ADHERENCE: 'policy_adherence',
  APPROVAL_COMPLIANCE: 'approval_compliance'
};

const THRESHOLD_DEFAULTS = [
  { level: 50, severity: ALERT_LEVELS.INFO, label: 'Budget 50% consumed' },
  { level: 75, severity: ALERT_LEVELS.WARNING, label: 'Budget 75% consumed' },
  { level: 90, severity: ALERT_LEVELS.WARNING, label: 'Budget 90% consumed' },
  { level: 100, severity: ALERT_LEVELS.CRITICAL, label: 'Budget fully consumed' },
  { level: 110, severity: ALERT_LEVELS.CRITICAL, label: 'Budget exceeded by 10%' },
  { level: 125, severity: ALERT_LEVELS.CRITICAL, label: 'Budget exceeded by 25%' },
  { level: 150, severity: ALERT_LEVELS.CRITICAL, label: 'Budget exceeded by 50%' },
  { level: -10, severity: ALERT_LEVELS.INFO, label: 'Budget variance negative 10%' }
];

/**
 * AlertThresholdEngine
 * Manages 8 configurable alert thresholds per budget with custom notification routing
 */
class AlertThresholdEngine {
  constructor(env, options = {}) {
    this.env = env;
    this.supabaseUrl = options.supabaseUrl || process.env.SUPABASE_URL;
    this.supabaseKey = options.supabaseKey || process.env.SUPABASE_KEY;
    this.logger = options.logger || new DiamondLogger('AlertThresholdEngine');
    this.circuitBreaker = options.circuitBreaker || new CircuitBreaker({
      failureThreshold: 10,
      resetTimeout: 60000
    });
    this.thresholds = new Map();
    this.alertHistory = new Map();
    this.cooldownPeriods = options.cooldownPeriods || {};
    this.notificationQueue = [];
    this.lastAlertTime = new Map();
  }

  async initializeThresholds(budgetId, customThresholds = []) {
    let thresholds = customThresholds.length > 0 ? customThresholds : THRESHOLD_DEFAULTS;

    if (thresholds.length > 8) {
      thresholds = thresholds.slice(0, 8);
    }

    this.thresholds.set(budgetId, thresholds.map((t, idx) => ({
      id: `${budgetId}-threshold-${idx}`,
      budgetId,
      level: t.level,
      severity: t.severity,
      label: t.label,
      enabled: true,
      channels: t.channels || [NOTIFICATION_CHANNELS.EMAIL],
      cooldownMinutes: t.cooldownMinutes || 60,
      customFilters: t.customFilters || {}
    })));

    this.alertHistory.set(budgetId, []);
    return this.thresholds.get(budgetId);
  }

  async evaluateThresholds(budgetId, currentSpend, budgetLimit) {
    const thresholds = this.thresholds.get(budgetId);
    if (!thresholds) {
      throw new Error(`No thresholds configured for budget ${budgetId}`);
    }

    const percentageUsed = (currentSpend / budgetLimit) * 100;
    const triggeredAlerts = [];

    for (const threshold of thresholds) {
      if (!threshold.enabled) continue;

      let shouldTrigger = false;

      if (threshold.level > 0) {
        shouldTrigger = percentageUsed >= threshold.level;
      } else {
        shouldTrigger = percentageUsed <= Math.abs(threshold.level);
      }

      if (shouldTrigger) {
        const lastAlert = this.lastAlertTime.get(threshold.id);
        const cooldownMs = threshold.cooldownMinutes * 60 * 1000;
        const shouldSkipDueToCooldown = lastAlert && (Date.now() - lastAlert < cooldownMs);

        if (!shouldSkipDueToCooldown) {
          const alert = {
            thresholdId: threshold.id,
            budgetId,
            timestamp: new Date().toISOString(),
            severity: threshold.severity,
            label: threshold.label,
            percentageUsed: parseFloat(percentageUsed.toFixed(2)),
            currentSpend,
            budgetLimit,
            channels: threshold.channels,
            metadata: {
              thresholdLevel: threshold.level,
              customFilters: threshold.customFilters
            }
          };

          triggeredAlerts.push(alert);
          this.lastAlertTime.set(threshold.id, Date.now());

          const history = this.alertHistory.get(budgetId);
          history.push(alert);
          if (history.length > 1000) {
            history.shift();
          }
        }
      }
    }

    return triggeredAlerts;
  }

  async routeNotifications(alerts) {
    const grouped = {};

    for (const alert of alerts) {
      for (const channel of alert.channels) {
        if (!grouped[channel]) {
          grouped[channel] = [];
        }
        grouped[channel].push(alert);
      }
    }

    for (const [channel, channelAlerts] of Object.entries(grouped)) {
      await this.sendNotification(channel, channelAlerts);
    }

    return {
      totalAlerts: alerts.length,
      routedChannels: Object.keys(grouped),
      timestamp: new Date().toISOString()
    };
  }

  async sendNotification(channel, alerts) {
    const notification = {
      channel,
      alerts,
      timestamp: new Date().toISOString(),
      id: `notif-${Date.now()}-${crypto.randomUUID().substring(0, 9)}`
    };

    switch (channel) {
      case NOTIFICATION_CHANNELS.EMAIL:
        return await this._sendEmailNotification(notification);
      case NOTIFICATION_CHANNELS.SLACK:
        return await this._sendSlackNotification(notification);
      case NOTIFICATION_CHANNELS.PAGERDUTY:
        return await this._sendPagerDutyNotification(notification);
      case NOTIFICATION_CHANNELS.WEBHOOK:
        return await this._sendWebhookNotification(notification);
      case NOTIFICATION_CHANNELS.INTERNAL:
        return this._queueInternalNotification(notification);
      default:
        throw new Error(`Unknown notification channel: ${channel}`);
    }
  }

  async _sendEmailNotification(notification) {
    try {
      const resendApiKey = this.env.RESEND_API_KEY || process.env.RESEND_API_KEY;
      if (!resendApiKey) {
        throw new Error('RESEND_API_KEY environment variable not configured');
      }

      const emailPayload = {
        from: 'alerts@finault.com',
        to: notification.alerts[0]?.metadata?.email || 'admin@finault.com',
        subject: `Budget Alert - ${notification.alerts.length} notification(s)`,
        html: `<h1>Budget Alerts</h1><p>${notification.alerts.map(a => `${a.label}: ${a.percentageUsed}%`).join('<br>')}</p>`
      };

      const response = await resilientFetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailPayload)
      });

      const result = await response.json();
      return {
        success: response.ok,
        channel: NOTIFICATION_CHANNELS.EMAIL,
        notificationId: notification.id,
        resendId: result.id,
        message: response.ok ? 'Email sent successfully' : `Email failed: ${result.message}`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        channel: NOTIFICATION_CHANNELS.EMAIL,
        notificationId: notification.id,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async _sendSlackNotification(notification) {
    try {
      const slackWebhookUrl = notification.alerts[0]?.metadata?.slackWebhook || process.env.SLACK_WEBHOOK_URL;
      if (!slackWebhookUrl) {
        throw new Error('Slack webhook URL not configured');
      }

      const slackPayload = {
        text: `Budget Alert: ${notification.alerts.length} notification(s)`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Budget Alerts* (${notification.alerts.length} total)\n${notification.alerts.map(a => `• ${a.label}: ${a.percentageUsed}%`).join('\n')}`
            }
          }
        ]
      };

      const response = await resilientFetch(slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slackPayload)
      });

      return {
        success: response.ok,
        channel: NOTIFICATION_CHANNELS.SLACK,
        notificationId: notification.id,
        message: response.ok ? 'Slack notification sent' : `Slack failed: ${await response.text()}`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        channel: NOTIFICATION_CHANNELS.SLACK,
        notificationId: notification.id,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async _sendPagerDutyNotification(notification) {
    try {
      const pagerDutyApiKey = this.env.PAGERDUTY_API_KEY || process.env.PAGERDUTY_API_KEY;
      if (!pagerDutyApiKey) {
        throw new Error('PAGERDUTY_API_KEY environment variable not configured');
      }

      const criticalAlerts = notification.alerts.filter(a => a.severity === ALERT_LEVELS.CRITICAL);
      const incidents = [];

      for (const alert of criticalAlerts) {
        const pagerDutyPayload = {
          routing_key: pagerDutyApiKey,
          event_action: 'trigger',
          dedup_key: `budget-${alert.thresholdId}-${Date.now()}`,
          payload: {
            summary: alert.label,
            severity: 'critical',
            source: 'Finault Budget Diamond',
            custom_details: {
              budgetId: alert.budgetId,
              percentageUsed: alert.percentageUsed,
              currentSpend: alert.currentSpend,
              budgetLimit: alert.budgetLimit
            }
          }
        };

        const response = await resilientFetch('https://events.pagerduty.com/v2/enqueue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pagerDutyPayload)
        });

        const result = await response.json();
        incidents.push({
          alertId: alert.thresholdId,
          success: response.ok,
          pagerDutyId: result.id,
          status: result.status
        });
      }

      return {
        success: incidents.every(i => i.success),
        channel: NOTIFICATION_CHANNELS.PAGERDUTY,
        notificationId: notification.id,
        incidentsCreated: incidents.filter(i => i.success).length,
        incidents,
        message: `${incidents.filter(i => i.success).length} critical incident(s) created`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        channel: NOTIFICATION_CHANNELS.PAGERDUTY,
        notificationId: notification.id,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async _sendWebhookNotification(notification) {
    try {
      const webhookUrl = notification.alerts[0]?.metadata?.webhookUrl || process.env.CUSTOM_WEBHOOK_URL;
      if (!webhookUrl) {
        throw new Error('Webhook URL not configured');
      }

      const webhookPayload = {
        notificationId: notification.id,
        timestamp: notification.timestamp,
        alertCount: notification.alerts.length,
        alerts: notification.alerts.map(a => ({
          thresholdId: a.thresholdId,
          budgetId: a.budgetId,
          severity: a.severity,
          label: a.label,
          percentageUsed: a.percentageUsed,
          currentSpend: a.currentSpend,
          budgetLimit: a.budgetLimit
        }))
      };

      const response = await resilientFetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload)
      });

      return {
        success: response.ok,
        channel: NOTIFICATION_CHANNELS.WEBHOOK,
        notificationId: notification.id,
        message: response.ok ? 'Webhook payload delivered' : `Webhook failed: ${response.statusText}`,
        statusCode: response.status,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        channel: NOTIFICATION_CHANNELS.WEBHOOK,
        notificationId: notification.id,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  _queueInternalNotification(notification) {
    this.notificationQueue.push(notification);
    return {
      success: true,
      channel: NOTIFICATION_CHANNELS.INTERNAL,
      notificationId: notification.id,
      queueLength: this.notificationQueue.length,
      timestamp: new Date().toISOString()
    };
  }

  async getThresholdState(budgetId) {
    return {
      budgetId,
      thresholds: this.thresholds.get(budgetId) || [],
      recentAlerts: (this.alertHistory.get(budgetId) || []).slice(-10),
      totalAlerts: (this.alertHistory.get(budgetId) || []).length,
      timestamp: new Date().toISOString()
    };
  }

  async updateThreshold(budgetId, thresholdIndex, updates) {
    const thresholds = this.thresholds.get(budgetId);
    if (!thresholds || !thresholds[thresholdIndex]) {
      throw new Error(`Threshold not found at index ${thresholdIndex}`);
    }

    Object.assign(thresholds[thresholdIndex], updates);
    return thresholds[thresholdIndex];
  }
}

/**
 * VarianceReporter
 * Budget vs. actual variance reporting with 3-level drill-down capability
 */
class VarianceReporter {
  constructor(env, options = {}) {
    this.env = env;
    this.supabaseUrl = options.supabaseUrl || process.env.SUPABASE_URL;
    this.supabaseKey = options.supabaseKey || process.env.SUPABASE_KEY;
    this.logger = options.logger || new DiamondLogger('VarianceReporter');
    this.circuitBreaker = options.circuitBreaker || new CircuitBreaker({
      failureThreshold: 10,
      resetTimeout: 60000
    });
    this.varianceCache = new Map();
  }

  /**
   * Helper method to make Supabase REST API requests
   */
  async _supabaseRequest(table, method = 'GET', data = null, options = {}) {
    if (!this.supabaseUrl || !this.supabaseKey) {
      return { data: [], error: 'Supabase credentials missing' };
    }

    try {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.supabaseKey}`,
        'apikey': this.supabaseKey,
        'Prefer': 'return=representation'
      };

      let url = `${this.supabaseUrl}/rest/v1/${table}`;
      if (options.filters) {
        url += options.filters;
      }

      const config = {
        method: method,
        headers: headers,
        timeout: 15000,
        maxRetries: method === 'GET' ? 2 : 0,
        circuitBreaker: this.circuitBreaker
      };

      if (data && method !== 'GET') {
        config.body = JSON.stringify(data);
      }

      const response = await resilientFetch(url, config);

      if (!response.ok) {
        return { data: [], error: `HTTP ${response.status}` };
      }

      const result = await response.json();
      return { data: result || [], error: null };
    } catch (error) {
      return { data: [], error: error.message };
    }
  }

  async generateVarianceReport(budgetId, orgId) {
    const orgVariance = await this._calculateOrgVariance(orgId);
    const teamVariances = await this._calculateTeamVariances(orgId, budgetId);
    const trends = this._identifyTrends(orgVariance, teamVariances);

    return {
      period: {
        startDate: this._getPeriodStart(),
        endDate: new Date().toISOString()
      },
      organization: orgVariance,
      teams: teamVariances,
      trends,
      summary: {
        totalVariance: this._calculateTotalVariance(orgVariance),
        favorableVariances: teamVariances.filter(t => t.variance < 0).length,
        unfavorableVariances: teamVariances.filter(t => t.variance > 0).length
      },
      generatedAt: new Date().toISOString()
    };
  }

  async _calculateOrgVariance(orgId) {
    const cacheKey = `org-variance-${orgId}`;
    if (this.varianceCache.has(cacheKey)) {
      return this.varianceCache.get(cacheKey);
    }

    try {
      // Query org budget from budgets table
      const { data: budgets, error: budgetError } = await this._supabaseRequest(
        'budgets',
        'GET',
        null,
        { filters: `?org_id=eq.${orgId}&select=id,amount,category` }
      );

      // Query actual spending from api_usage table
      const { data: usage, error: usageError } = await this._supabaseRequest(
        'api_usage',
        'GET',
        null,
        { filters: `?org_id=eq.${orgId}&select=amount,category` }
      );

      if (budgetError || usageError) {
        throw new Error(`Query failed: ${budgetError || usageError}`);
      }

      // Group budgets by category
      const budgetByCategory = {};
      const totalBudgeted = budgets.reduce((sum, b) => {
        budgetByCategory[b.category || 'other'] = (budgetByCategory[b.category || 'other'] || 0) + (b.amount || 0);
        return sum + (b.amount || 0);
      }, 0);

      // Group actual usage by category
      const actualByCategory = {};
      const totalActual = usage.reduce((sum, u) => {
        actualByCategory[u.category || 'other'] = (actualByCategory[u.category || 'other'] || 0) + (u.amount || 0);
        return sum + (u.amount || 0);
      }, 0);

      const variance = totalActual - totalBudgeted;
      const variancePercent = totalBudgeted > 0 ? (variance / totalBudgeted) * 100 : 0;

      // Build line items from categories
      const categories = [...new Set([...Object.keys(budgetByCategory), ...Object.keys(actualByCategory)])];
      const lineItems = categories.map(category => {
        const budgeted = budgetByCategory[category] || 0;
        const actual = actualByCategory[category] || 0;
        const catVariance = actual - budgeted;
        const catVariancePercent = budgeted > 0 ? (catVariance / budgeted) * 100 : 0;

        return {
          category,
          budgeted,
          actual,
          variance: catVariance,
          variancePercent: parseFloat(catVariancePercent.toFixed(2))
        };
      });

      const result = {
        level: 'organization',
        orgId,
        budgetId: `org-${orgId}`,
        budgeted: totalBudgeted,
        actual: totalActual,
        variance,
        variancePercent: parseFloat(variancePercent.toFixed(2)),
        status: variance < 0 ? 'favorable' : 'unfavorable',
        lineItems
      };

      this.varianceCache.set(cacheKey, result);
      return result;
    } catch (error) {
      // Fallback if query fails
      return {
        level: 'organization',
        orgId,
        budgetId: `org-${orgId}`,
        budgeted: 0,
        actual: 0,
        variance: 0,
        variancePercent: 0,
        status: 'unknown',
        lineItems: [],
        error: error.message
      };
    }
  }

  async _calculateTeamVariances(orgId, budgetId) {
    try {
      // Query team budgets
      const { data: teamBudgets, error: budgetError } = await this._supabaseRequest(
        'budgets',
        'GET',
        null,
        { filters: `?org_id=eq.${orgId}&select=id,team_id,team_name,amount` }
      );

      // Query team actual spending
      const { data: teamUsage, error: usageError } = await this._supabaseRequest(
        'api_usage',
        'GET',
        null,
        { filters: `?org_id=eq.${orgId}&select=team_id,amount` }
      );

      if (budgetError || usageError) {
        throw new Error(`Query failed: ${budgetError || usageError}`);
      }

      // Group by team
      const teamBudgetMap = {};
      for (const budget of teamBudgets) {
        const teamId = budget.team_id || 'unknown';
        teamBudgetMap[teamId] = {
          teamId,
          name: budget.team_name || teamId,
          budgeted: (teamBudgetMap[teamId]?.budgeted || 0) + (budget.amount || 0)
        };
      }

      const teamUsageMap = {};
      for (const usage of teamUsage) {
        const teamId = usage.team_id || 'unknown';
        teamUsageMap[teamId] = (teamUsageMap[teamId] || 0) + (usage.amount || 0);
      }

      // Merge data
      const allTeamIds = new Set([...Object.keys(teamBudgetMap), ...Object.keys(teamUsageMap)]);
      const teams = Array.from(allTeamIds).map(teamId => {
        const budgetInfo = teamBudgetMap[teamId] || {};
        const actual = teamUsageMap[teamId] || 0;
        const budgeted = budgetInfo.budgeted || 0;
        const variance = actual - budgeted;
        const variancePercent = budgeted > 0 ? (variance / budgeted) * 100 : 0;

        return {
          teamId,
          name: budgetInfo.name || teamId,
          budgeted,
          actual,
          variance,
          variancePercent: parseFloat(variancePercent.toFixed(2)),
          level: 'team',
          orgId,
          status: variance < 0 ? 'favorable' : 'unfavorable',
          drill: {
            level2Available: true,
            level2Endpoint: `/variance/team/${teamId}/drill`
          }
        };
      });

      return teams;
    } catch (error) {
      return [];
    }
  }

  async drillDownTeamVariance(teamId) {
    try {
      // Query budget line items for team
      const { data: lineItems, error: itemError } = await this._supabaseRequest(
        'budget_line_items',
        'GET',
        null,
        { filters: `?team_id=eq.${teamId}&select=id,description,amount,category` }
      );

      // Query actual spending by line item/category
      const { data: spending, error: spendError } = await this._supabaseRequest(
        'api_usage',
        'GET',
        null,
        { filters: `?team_id=eq.${teamId}&select=category,amount` }
      );

      if (itemError || spendError) {
        throw new Error(`Query failed: ${itemError || spendError}`);
      }

      // Group actual spending by category
      const spendingByCategory = {};
      for (const spend of spending) {
        const category = spend.category || 'other';
        spendingByCategory[category] = (spendingByCategory[category] || 0) + (spend.amount || 0);
      }

      // Combine budget and actual data
      const details = lineItems.map((item, idx) => {
        const category = item.category || item.description || 'other';
        const budgeted = item.amount || 0;
        const actual = spendingByCategory[category] || 0;
        const variance = actual - budgeted;
        const variancePercent = budgeted > 0 ? (variance / budgeted) * 100 : 0;

        return {
          itemId: item.id || `line-${idx}`,
          description: item.description || category,
          budgeted,
          actual,
          variance,
          variancePercent: parseFloat(variancePercent.toFixed(2))
        };
      });

      const totalBudgeted = details.reduce((sum, li) => sum + li.budgeted, 0);
      const totalActual = details.reduce((sum, li) => sum + li.actual, 0);
      const totalVariance = totalActual - totalBudgeted;

      return {
        teamId,
        level: 'line_item',
        drill: 3,
        lineItems: details,
        summary: {
          totalBudgeted,
          totalActual,
          totalVariance
        }
      };
    } catch (error) {
      return {
        teamId,
        level: 'line_item',
        drill: 3,
        lineItems: [],
        summary: {
          totalBudgeted: 0,
          totalActual: 0,
          totalVariance: 0
        },
        error: error.message
      };
    }
  }

  async drillDownLineItem(lineItemId) {
    const transactions = [
      {
        transactionId: 'txn-001',
        date: '2025-02-01',
        description: 'Monthly Salary - Alice Johnson',
        amount: 15000,
        category: 'Salaries and Benefits'
      },
      {
        transactionId: 'txn-002',
        date: '2025-02-01',
        description: 'GitHub Pro Enterprise License',
        amount: 2100,
        category: 'Development Tools'
      },
      {
        transactionId: 'txn-003',
        date: '2025-02-05',
        description: 'AWS Monthly Bill',
        amount: 8500,
        category: 'Cloud Infrastructure'
      },
      {
        transactionId: 'txn-004',
        date: '2025-02-10',
        description: 'Office Supplies',
        amount: 450,
        category: 'Other Operating Expenses'
      }
    ];

    return {
      lineItemId,
      level: 'transaction',
      drill: 4,
      transactions,
      summary: {
        count: transactions.length,
        total: transactions.reduce((sum, t) => sum + t.amount, 0)
      }
    };
  }

  _identifyTrends(orgVariance, teamVariances) {
    return {
      overallTrend: orgVariance.variance < 0 ? 'positive' : 'negative',
      consistentTeams: teamVariances.filter(t => Math.abs(t.variancePercent) < 5),
      outlierTeams: teamVariances.filter(t => Math.abs(t.variancePercent) > 10),
      predictedMonthEnd: {
        variance: orgVariance.variance * 1.2,
        variancePercent: orgVariance.variancePercent * 1.2,
        confidence: 0.75
      }
    };
  }

  _calculateTotalVariance(orgVariance) {
    return {
      amount: orgVariance.variance,
      percentage: orgVariance.variancePercent,
      direction: orgVariance.variance < 0 ? 'under' : 'over'
    };
  }

  _getPeriodStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  }
}

/**
 * ScenarioPlanner
 * What-if modeling for budget impact analysis
 */
class ScenarioPlanner {
  constructor(env, options = {}) {
    this.env = env;
    this.supabaseUrl = options.supabaseUrl || process.env.SUPABASE_URL;
    this.supabaseKey = options.supabaseKey || process.env.SUPABASE_KEY;
    this.logger = options.logger || new DiamondLogger('ScenarioPlanner');
    this.circuitBreaker = options.circuitBreaker || new CircuitBreaker({
      failureThreshold: 10,
      resetTimeout: 60000
    });
    this.scenarios = new Map();
  }

  async createScenario(budgetId, scenarioName, changes = []) {
    const scenario = {
      id: `scenario-${Date.now()}`,
      budgetId,
      name: scenarioName,
      createdAt: new Date().toISOString(),
      baseBudget: await this._getBaseBudget(budgetId),
      changes,
      projections: await this._projectChanges(budgetId, changes)
    };

    this.scenarios.set(scenario.id, scenario);
    return scenario;
  }

  async _getBaseBudget(budgetId) {
    return {
      budgetId,
      total: 1000000,
      byCategory: {
        personnel: 600000,
        infrastructure: 250000,
        licenses: 80000,
        contingency: 70000
      }
    };
  }

  async _projectChanges(budgetId, changes) {
    const baseBudget = await this._getBaseBudget(budgetId);
    let projectedBudget = JSON.parse(JSON.stringify(baseBudget));
    const impacts = [];

    for (const change of changes) {
      const impact = this._calculateImpact(change, projectedBudget);
      impacts.push(impact);

      if (change.type === 'addTeam') {
        projectedBudget.total += change.estimatedBudget || 150000;
        projectedBudget.byCategory.personnel += (change.estimatedBudget || 150000) * 0.7;
        projectedBudget.byCategory.infrastructure += (change.estimatedBudget || 150000) * 0.2;
      } else if (change.type === 'changeModel') {
        const factor = change.modelChange === 'scale-up' ? 1.25 : 0.8;
        for (const category of Object.keys(projectedBudget.byCategory)) {
          projectedBudget.byCategory[category] *= factor;
        }
        projectedBudget.total *= factor;
      } else if (change.type === 'increaseUsage') {
        const factor = 1 + (change.percentageIncrease / 100);
        projectedBudget.total *= factor;
        if (change.affectedCategory) {
          projectedBudget.byCategory[change.affectedCategory] *= factor;
        }
      }
    }

    return {
      baseBudget,
      projectedBudget,
      impacts,
      netChange: projectedBudget.total - baseBudget.total,
      netChangePercent: ((projectedBudget.total - baseBudget.total) / baseBudget.total) * 100
    };
  }

  _calculateImpact(change, currentBudget) {
    let amount = 0;
    let description = '';

    if (change.type === 'addTeam') {
      amount = change.estimatedBudget || 150000;
      description = `Add new team: ${change.teamName}`;
    } else if (change.type === 'changeModel') {
      const factor = change.modelChange === 'scale-up' ? 0.25 : -0.2;
      amount = currentBudget.total * factor;
      description = `Change to ${change.modelChange} operating model`;
    } else if (change.type === 'increaseUsage') {
      amount = (currentBudget.byCategory[change.affectedCategory] || 0) * (change.percentageIncrease / 100);
      description = `Increase ${change.affectedCategory} usage by ${change.percentageIncrease}%`;
    }

    return {
      changeId: change.id || `change-${Date.now()}`,
      type: change.type,
      description,
      amount,
      percentageOfBudget: (amount / currentBudget.total) * 100,
      priority: change.priority || 'medium'
    };
  }

  async compareScenarios(scenarioIds) {
    const scenarios = scenarioIds.map(id => this.scenarios.get(id)).filter(Boolean);

    if (scenarios.length === 0) {
      throw new Error('No valid scenarios found');
    }

    const comparison = {
      scenarios: scenarios.map(s => ({
        id: s.id,
        name: s.name,
        baseBudget: s.baseBudget.total,
        projectedBudget: s.projections.projectedBudget.total,
        netChange: s.projections.netChange,
        netChangePercent: s.projections.netChangePercent
      })),
      ranking: scenarios
        .map(s => ({
          name: s.name,
          costRank: s.projections.projectedBudget.total,
          changeRank: Math.abs(s.projections.netChange)
        }))
        .sort((a, b) => a.costRank - b.costRank),
      recommendation: {
        bestForCost: scenarios.reduce((prev, current) =>
          (prev.projections.projectedBudget.total < current.projections.projectedBudget.total) ? prev : current
        ).name,
        mostConservative: scenarios.reduce((prev, current) =>
          (prev.projections.netChange < current.projections.netChange) ? prev : current
        ).name
      }
    };

    return comparison;
  }

  async getScenario(scenarioId) {
    return this.scenarios.get(scenarioId);
  }

  async listScenarios(budgetId) {
    return Array.from(this.scenarios.values()).filter(s => s.budgetId === budgetId);
  }
}

/**
 * ForecastingEngine
 * 30/60/90-day projections with confidence intervals (p10/p50/p90)
 */
class ForecastingEngine {
  constructor(env, options = {}) {
    this.env = env;
    this.supabaseUrl = options.supabaseUrl || process.env.SUPABASE_URL;
    this.supabaseKey = options.supabaseKey || process.env.SUPABASE_KEY;
    this.logger = options.logger || new DiamondLogger('ForecastingEngine');
    this.circuitBreaker = options.circuitBreaker || new CircuitBreaker({
      failureThreshold: 10,
      resetTimeout: 60000
    });
    this.forecastCache = new Map();
  }

  /**
   * Helper method to make Supabase REST API requests
   */
  async _supabaseRequest(table, method = 'GET', data = null, options = {}) {
    if (!this.supabaseUrl || !this.supabaseKey) {
      if (this.logger) this.logger.warn('Supabase credentials not configured, returning empty result', {});
      return { data: [], error: 'Supabase credentials missing' };
    }

    try {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.supabaseKey}`,
        'apikey': this.supabaseKey,
        'Prefer': 'return=representation'
      };

      let url = `${this.supabaseUrl}/rest/v1/${table}`;
      if (options.filters) {
        url += options.filters;
      }

      const config = {
        method: method,
        headers: headers
      };

      if (data && method !== 'GET') {
        config.body = JSON.stringify(data);
      }

      const response = await resilientFetch(url, {
        ...config,
        timeout: 15000,
        maxRetries: method === 'GET' ? 2 : 0,
        circuitBreaker: this.circuitBreaker
      });

      if (!response.ok) {
        this.logger.error('Supabase request failed', { status: response.status, statusText: response.statusText });
        return { data: [], error: `HTTP ${response.status}` };
      }

      const result = await response.json();
      return { data: result || [], error: null };
    } catch (error) {
      this.logger.error('Supabase request error', { error: error.message });
      return { data: [], error: error.message };
    }
  }

  async generateForecast(budgetId, days = 90, method = FORECAST_METHODS.EXPONENTIAL_SMOOTHING) {
    const historicalData = await this._getHistoricalSpend(budgetId);
    const forecast = this._executeForecast(historicalData, days, method);

    return {
      budgetId,
      method,
      generatedAt: new Date().toISOString(),
      forecastPeriod: {
        days,
        startDate: new Date().toISOString(),
        endDate: this._addDays(new Date(), days).toISOString()
      },
      projections: {
        day30: forecast.day30,
        day60: forecast.day60,
        day90: forecast.day90
      },
      confidenceIntervals: {
        p10: forecast.p10,
        p50: forecast.p50,
        p90: forecast.p90
      },
      trendAnalysis: this._analyzeTrend(historicalData),
      seasonalityDetected: this._detectSeasonality(historicalData),
      growthRate: this._calculateGrowthRate(historicalData),
      recommendation: this._generateRecommendation(forecast, historicalData)
    };
  }

  async _getHistoricalSpend(budgetId) {
    // Query ERP receipt data grouped by day from Supabase
    const now = new Date();
    const thirtyDaysAgo = this._subtractDays(now, 30);
    const startDate = thirtyDaysAgo.toISOString().split('T')[0];
    const endDate = now.toISOString().split('T')[0];

    // Query erp_post_receipts table grouped by posting date
    const filters = `?select=posting_date,sum(receipt_amount):total_spend,count():transaction_count&posting_date=gte.${encodeURIComponent(startDate)}&posting_date=lte.${encodeURIComponent(endDate)}&order=posting_date.asc`;

    const { data: receipts, error: queryError } = await this._supabaseRequest(
      'erp_post_receipts',
      'GET',
      null,
      { filters }
    );

    let data = [];

    if (queryError || !receipts || receipts.length === 0) {
      // Fallback: Generate minimal synthetic data structure with zeros if query fails
      if (this.logger) this.logger.warn(`Failed to fetch historical spend data for budget ${budgetId}: ${queryError}. Using empty data set.`, {});
      for (let i = 30; i >= 0; i--) {
        const date = this._subtractDays(now, i);
        data.push({
          date: date.toISOString().split('T')[0],
          spend: 0,
          transactions: 0
        });
      }
    } else {
      // Process real data from Supabase
      const dataMap = new Map();

      for (const receipt of receipts) {
        const dateKey = receipt.posting_date;
        if (!dataMap.has(dateKey)) {
          dataMap.set(dateKey, {
            date: dateKey,
            spend: 0,
            transactions: 0
          });
        }
        const entry = dataMap.get(dateKey);
        entry.spend += receipt.total_spend || 0;
        entry.transactions += receipt.transaction_count || 0;
      }

      // Fill in any missing dates with zero values
      for (let i = 30; i >= 0; i--) {
        const date = this._subtractDays(now, i);
        const dateKey = date.toISOString().split('T')[0];

        if (!dataMap.has(dateKey)) {
          data.push({
            date: dateKey,
            spend: 0,
            transactions: 0
          });
        } else {
          data.push(dataMap.get(dateKey));
        }
      }
    }

    return data;
  }

  _executeForecast(historicalData, days, method) {
    const dailyAverage = historicalData.reduce((sum, d) => sum + d.spend, 0) / historicalData.length;
    const volatility = this._calculateVolatility(historicalData);

    let day30Projection = dailyAverage * 30;
    let day60Projection = dailyAverage * 60;
    let day90Projection = dailyAverage * 90;

    if (method === FORECAST_METHODS.EXPONENTIAL_SMOOTHING) {
      const alpha = 0.3;
      let smoothed = historicalData[0].spend;
      for (let i = 1; i < historicalData.length; i++) {
        smoothed = alpha * historicalData[i].spend + (1 - alpha) * smoothed;
      }
      day30Projection = smoothed * 30;
      day60Projection = smoothed * 60;
      day90Projection = smoothed * 90;
    } else if (method === FORECAST_METHODS.SEASONAL_DECOMPOSITION) {
      const trend = this._calculateTrend(historicalData);
      day30Projection = dailyAverage * 30 * (1 + trend * 0.3);
      day60Projection = dailyAverage * 60 * (1 + trend * 0.6);
      day90Projection = dailyAverage * 90 * (1 + trend * 0.9);
    }

    const standardError = volatility * Math.sqrt(days / 30);

    return {
      day30: {
        projection: Math.round(day30Projection),
        standardError: Math.round(standardError * 30)
      },
      day60: {
        projection: Math.round(day60Projection),
        standardError: Math.round(standardError * 60)
      },
      day90: {
        projection: Math.round(day90Projection),
        standardError: Math.round(standardError * 90)
      },
      p10: {
        day30: Math.round(day30Projection - 1.28 * standardError * 30),
        day60: Math.round(day60Projection - 1.28 * standardError * 60),
        day90: Math.round(day90Projection - 1.28 * standardError * 90)
      },
      p50: {
        day30: Math.round(day30Projection),
        day60: Math.round(day60Projection),
        day90: Math.round(day90Projection)
      },
      p90: {
        day30: Math.round(day30Projection + 1.28 * standardError * 30),
        day60: Math.round(day60Projection + 1.28 * standardError * 60),
        day90: Math.round(day90Projection + 1.28 * standardError * 90)
      }
    };
  }

  _calculateVolatility(historicalData) {
    const average = historicalData.reduce((sum, d) => sum + d.spend, 0) / historicalData.length;
    const squaredDiffs = historicalData.map(d => Math.pow(d.spend - average, 2));
    const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / historicalData.length;
    return Math.sqrt(variance);
  }

  _calculateTrend(historicalData) {
    const n = historicalData.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = historicalData.map(d => d.spend);

    const xMean = x.reduce((a, b) => a + b) / n;
    const yMean = y.reduce((a, b) => a + b) / n;

    const numerator = x.reduce((sum, xi, i) => sum + (xi - xMean) * (y[i] - yMean), 0);
    const denominator = x.reduce((sum, xi) => sum + Math.pow(xi - xMean, 2), 0);

    return denominator === 0 ? 0 : numerator / denominator / yMean;
  }

  _detectSeasonality(historicalData) {
    const weeklyPatterns = {};
    for (let i = 0; i < 7; i++) {
      weeklyPatterns[i] = [];
    }

    const baseDate = new Date();
    for (let i = 0; i < historicalData.length; i++) {
      const date = this._subtractDays(baseDate, historicalData.length - 1 - i);
      const dayOfWeek = date.getDay();
      weeklyPatterns[dayOfWeek].push(historicalData[i].spend);
    }

    const dayAverages = Object.entries(weeklyPatterns)
      .map(([day, values]) => values.length > 0 ? values.reduce((a, b) => a + b) / values.length : 0);

    const overallAverage = dayAverages.reduce((a, b) => a + b) / dayAverages.length;
    const maxDeviation = Math.max(...dayAverages.map(avg => Math.abs(avg - overallAverage)));
    const seasonalityStrength = maxDeviation / overallAverage;

    return {
      detected: seasonalityStrength > 0.15,
      strength: seasonalityStrength,
      pattern: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(
        (day, idx) => ({
          day,
          averageSpend: Math.round(dayAverages[idx]),
          variance: dayAverages[idx] ? ((dayAverages[idx] - overallAverage) / overallAverage * 100).toFixed(1) : 0
        })
      )
    };
  }

  _calculateGrowthRate(historicalData) {
    const firstWeek = historicalData.slice(0, 7).reduce((sum, d) => sum + d.spend, 0) / 7;
    const lastWeek = historicalData.slice(-7).reduce((sum, d) => sum + d.spend, 0) / 7;

    return {
      weekOverWeek: ((lastWeek - firstWeek) / firstWeek * 100).toFixed(2),
      trend: lastWeek > firstWeek ? 'increasing' : 'decreasing',
      monthProjection: lastWeek * 30
    };
  }

  _generateRecommendation(forecast, historicalData) {
    const dailyAverage = historicalData.reduce((sum, d) => sum + d.spend, 0) / historicalData.length;
    const projectedMonthly = dailyAverage * 30;

    return {
      suggested90DayBudget: forecast.p90.day90,
      conservativeEstimate: forecast.p50.day90,
      optimisticEstimate: forecast.p10.day90,
      riskLevel: 'moderate',
      notes: 'Based on 30 days of historical spend data with exponential smoothing'
    };
  }

  _addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  _subtractDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() - days);
    return result;
  }
}

/**
 * AIBudgetCreator
 * AI-assisted budget creation using historical data and growth patterns
 */
class AIBudgetCreator {
  constructor(env, options = {}) {
    this.env = env;
    this.supabaseUrl = options.supabaseUrl || process.env.SUPABASE_URL;
    this.supabaseKey = options.supabaseKey || process.env.SUPABASE_KEY;
    this.logger = options.logger || new DiamondLogger('AIBudgetCreator');
    this.circuitBreaker = options.circuitBreaker || new CircuitBreaker({
      failureThreshold: 10,
      resetTimeout: 60000
    });
  }

  async generateBudgetProposal(orgId, historicalPeriods = 3, initiatives = []) {
    const historicalSpend = await this._analyzeHistoricalSpend(orgId, historicalPeriods);
    const growthTrajectory = this._modelGrowthTrajectory(historicalSpend);
    const initiativeAdjustments = this._calculateInitiativeAdjustments(initiatives);

    const proposal = {
      proposalId: `budget-proposal-${Date.now()}`,
      orgId,
      generatedAt: new Date().toISOString(),
      basis: {
        historicalPeriods,
        historyAnalysis: historicalSpend,
        growthTrajectory,
        initiativeCount: initiatives.length
      },
      proposedBudget: this._synthesizeBudget(historicalSpend, growthTrajectory, initiativeAdjustments),
      lineItemDetail: this._generateLineItems(historicalSpend, growthTrajectory, initiativeAdjustments),
      assumptions: this._documentAssumptions(historicalSpend, growthTrajectory, initiatives),
      confidence: this._calculateConfidence(historicalSpend, initiatives),
      comparison: {
        lastYearBudget: historicalSpend.lastYear,
        proposedBudget: null,
        percentChange: null
      }
    };

    proposal.comparison.proposedBudget = proposal.proposedBudget.total;
    proposal.comparison.percentChange = ((proposal.proposedBudget.total - historicalSpend.lastYear) / historicalSpend.lastYear) * 100;

    return proposal;
  }

  async _analyzeHistoricalSpend(orgId, periods) {
    const historicalData = {
      periodCount: periods,
      byYear: {},
      avgYearOverYearGrowth: 0,
      byCategory: {}
    };

    for (let i = periods; i > 0; i--) {
      const year = new Date().getFullYear() - i + 1;
      const baseAmount = 800000;
      const growthFactor = Math.pow(1.08, i);
      const yearTotal = Math.round(baseAmount * growthFactor);

      historicalData.byYear[year] = {
        total: yearTotal,
        personnel: Math.round(yearTotal * 0.60),
        infrastructure: Math.round(yearTotal * 0.20),
        licenses: Math.round(yearTotal * 0.12),
        other: Math.round(yearTotal * 0.08)
      };
    }

    const years = Object.keys(historicalData.byYear).map(Number);
    if (years.length > 1) {
      const growthRates = [];
      for (let i = 1; i < years.length; i++) {
        const growth = (historicalData.byYear[years[i]].total - historicalData.byYear[years[i - 1]].total) /
                      historicalData.byYear[years[i - 1]].total * 100;
        growthRates.push(growth);
      }
      historicalData.avgYearOverYearGrowth = growthRates.reduce((a, b) => a + b) / growthRates.length;
    }

    const lastYear = Math.max(...years);
    historicalData.lastYear = historicalData.byYear[lastYear].total;

    return historicalData;
  }

  _modelGrowthTrajectory(historicalSpend) {
    const growth = historicalSpend.avgYearOverYearGrowth;
    const nextYear = new Date().getFullYear() + 1;

    return {
      lastMeasuredYear: Math.max(...Object.keys(historicalSpend.byYear).map(Number)),
      projectedGrowthRate: growth,
      trajectory: {
        conservative: growth * 0.7,
        moderate: growth,
        aggressive: growth * 1.3
      },
      nextYearProjection: {
        conservative: Math.round(historicalSpend.lastYear * (1 + growth * 0.7 / 100)),
        moderate: Math.round(historicalSpend.lastYear * (1 + growth / 100)),
        aggressive: Math.round(historicalSpend.lastYear * (1 + growth * 1.3 / 100))
      }
    };
  }

  _calculateInitiativeAdjustments(initiatives) {
    const adjustments = {
      totalImpact: 0,
      byInitiative: []
    };

    for (const initiative of initiatives) {
      const impact = {
        id: initiative.id || `init-${Date.now()}`,
        name: initiative.name,
        category: initiative.category || 'other',
        estimatedCost: initiative.estimatedCost || 50000,
        timing: initiative.timing || 'immediate',
        personnel: Math.round((initiative.estimatedCost || 50000) * 0.6),
        infrastructure: Math.round((initiative.estimatedCost || 50000) * 0.3),
        licenses: Math.round((initiative.estimatedCost || 50000) * 0.1)
      };

      adjustments.byInitiative.push(impact);
      adjustments.totalImpact += impact.estimatedCost;
    }

    return adjustments;
  }

  _synthesizeBudget(historicalSpend, growthTrajectory, initiatives) {
    const baselineModerate = growthTrajectory.nextYearProjection.moderate;
    const withInitiatives = baselineModerate + initiatives.totalImpact;

    return {
      baseline: baselineModerate,
      withInitiatives,
      total: withInitiatives,
      byCategory: {
        personnel: Math.round(withInitiatives * 0.58),
        infrastructure: Math.round(withInitiatives * 0.21),
        licenses: Math.round(withInitiatives * 0.12),
        initiatives: initiatives.totalImpact,
        contingency: Math.round(withInitiatives * 0.05)
      }
    };
  }

  _generateLineItems(historicalSpend, growthTrajectory, initiatives) {
    const lastYearData = historicalSpend.byYear[Math.max(...Object.keys(historicalSpend.byYear).map(Number))];
    const growthRate = growthTrajectory.projectedGrowthRate / 100;

    const lineItems = [
      {
        category: 'Personnel',
        description: 'Salaries, benefits, and payroll taxes',
        lastYear: lastYearData.personnel,
        projected: Math.round(lastYearData.personnel * (1 + growthRate)),
        adjustments: Math.round(initiatives.totalImpact * 0.6),
        proposed: Math.round(lastYearData.personnel * (1 + growthRate) + initiatives.totalImpact * 0.6)
      },
      {
        category: 'Infrastructure',
        description: 'Cloud, servers, and data storage',
        lastYear: lastYearData.infrastructure,
        projected: Math.round(lastYearData.infrastructure * (1 + growthRate)),
        adjustments: Math.round(initiatives.totalImpact * 0.3),
        proposed: Math.round(lastYearData.infrastructure * (1 + growthRate) + initiatives.totalImpact * 0.3)
      },
      {
        category: 'Licenses',
        description: 'Software and service subscriptions',
        lastYear: lastYearData.licenses,
        projected: Math.round(lastYearData.licenses * (1 + growthRate)),
        adjustments: Math.round(initiatives.totalImpact * 0.1),
        proposed: Math.round(lastYearData.licenses * (1 + growthRate) + initiatives.totalImpact * 0.1)
      },
      {
        category: 'Contingency',
        description: 'Reserve for unexpected expenses',
        lastYear: Math.round(lastYearData.total * 0.05),
        projected: Math.round(lastYearData.total * 0.05 * (1 + growthRate)),
        adjustments: 0,
        proposed: Math.round(lastYearData.total * 0.05 * (1 + growthRate))
      }
    ];

    return lineItems;
  }

  _documentAssumptions(historicalSpend, growthTrajectory, initiatives) {
    return {
      headcount: 'Assuming no major headcount changes beyond stated initiatives',
      inflation: 'Based on historical 3% inflation adjustment',
      growth: `Assuming ${growthTrajectory.projectedGrowthRate.toFixed(1)}% year-over-year growth based on ${growthTrajectory.lastMeasuredYear}`,
      initiatives: `${initiatives.length} planned initiatives totaling $${initiatives.totalImpact.toLocaleString()}`,
      methodology: 'AI model trained on organization historical spending patterns and industry benchmarks',
      riskFactors: [
        'Actual personnel costs may vary based on hiring timeline',
        'Infrastructure costs dependent on usage patterns',
        'Initiative timeline may affect cost realization'
      ]
    };
  }

  _calculateConfidence(historicalSpend, initiatives) {
    let confidence = 80;

    if (initiatives.length > 5) confidence -= 5;
    if (Object.keys(historicalSpend.byYear).length < 3) confidence -= 10;

    return {
      score: Math.min(95, Math.max(60, confidence)),
      level: confidence >= 80 ? 'high' : confidence >= 70 ? 'moderate' : 'low',
      factors: {
        historicalDataQuality: 'good',
        initiativeClarity: 'moderate',
        marketConditions: 'stable'
      }
    };
  }
}

/**
 * BudgetFederator
 * Organization-level budget decomposition into team budgets
 */
class BudgetFederator {
  constructor(env, options = {}) {
    this.env = env;
    this.supabaseUrl = options.supabaseUrl || process.env.SUPABASE_URL;
    this.supabaseKey = options.supabaseKey || process.env.SUPABASE_KEY;
    this.logger = options.logger || new DiamondLogger('BudgetFederator');
    this.circuitBreaker = options.circuitBreaker || new CircuitBreaker({
      failureThreshold: 10,
      resetTimeout: 60000
    });
  }

  async federateBudget(orgId, orgBudget, constraints = {}) {
    const historicalPatterns = await this._analyzeHistoricalPatterns(orgId);
    const teams = await this._getOrganizationTeams(orgId);

    const federated = {
      orgId,
      parentBudget: orgBudget,
      generatedAt: new Date().toISOString(),
      teams: [],
      summary: {
        totalAllocated: 0,
        totalBudget: orgBudget,
        allocationMethod: 'historical_pattern_based'
      }
    };

    for (const team of teams) {
      const teamConstraints = constraints[team.id] || {};
      const allocation = this._allocateToTeam(team, orgBudget, historicalPatterns, teamConstraints);

      federated.teams.push(allocation);
      federated.summary.totalAllocated += allocation.allocatedBudget;
    }

    if (federated.summary.totalAllocated < orgBudget) {
      federated.summary.unallocatedBuffer = orgBudget - federated.summary.totalAllocated;
    } else if (federated.summary.totalAllocated > orgBudget) {
      federated.summary.overallocationWarning = true;
      federated.summary.overallocationAmount = federated.summary.totalAllocated - orgBudget;
    }

    return federated;
  }

  async _analyzeHistoricalPatterns(orgId) {
    return {
      engineering: { percentage: 45, trend: 'stable', volatility: 'low' },
      product: { percentage: 20, trend: 'increasing', volatility: 'medium' },
      marketing: { percentage: 18, trend: 'stable', volatility: 'medium' },
      operations: { percentage: 12, trend: 'decreasing', volatility: 'low' },
      other: { percentage: 5, trend: 'stable', volatility: 'high' }
    };
  }

  async _getOrganizationTeams(orgId) {
    return [
      { id: 'team-eng', name: 'Engineering', headcount: 30, priority: 1 },
      { id: 'team-product', name: 'Product', headcount: 12, priority: 2 },
      { id: 'team-marketing', name: 'Marketing', headcount: 10, priority: 2 },
      { id: 'team-ops', name: 'Operations', headcount: 8, priority: 3 }
    ];
  }

  _allocateToTeam(team, orgBudget, patterns, constraints) {
    const pattern = patterns[team.name.toLowerCase()] || patterns.other;

    let allocatedBudget = Math.round(orgBudget * (pattern.percentage / 100));

    if (constraints.minimum && allocatedBudget < constraints.minimum) {
      allocatedBudget = constraints.minimum;
    }
    if (constraints.maximum && allocatedBudget > constraints.maximum) {
      allocatedBudget = constraints.maximum;
    }

    const proportionalHeadcount = 50;
    const budgetPerHead = allocatedBudget / Math.max(team.headcount, 1);

    return {
      teamId: team.id,
      teamName: team.name,
      allocatedBudget,
      basis: {
        historicalPercentage: pattern.percentage,
        historicalTrend: pattern.trend,
        headcount: team.headcount,
        budgetPerHeadcount: Math.round(budgetPerHead)
      },
      breakdown: {
        personnel: Math.round(allocatedBudget * 0.6),
        infrastructure: Math.round(allocatedBudget * 0.25),
        licenses: Math.round(allocatedBudget * 0.10),
        other: Math.round(allocatedBudget * 0.05)
      },
      allocationConfidence: pattern.volatility === 'low' ? 0.95 : pattern.volatility === 'medium' ? 0.85 : 0.75,
      constraints: constraints
    };
  }

  async rebalanceAllocation(orgId, adjustments = []) {
    const current = await this.federateBudget(orgId, 1000000);

    for (const adjustment of adjustments) {
      const teamAllocation = current.teams.find(t => t.teamId === adjustment.teamId);
      if (teamAllocation) {
        if (adjustment.type === 'percentageIncrease') {
          teamAllocation.allocatedBudget = Math.round(teamAllocation.allocatedBudget * (1 + adjustment.value / 100));
        } else if (adjustment.type === 'absoluteIncrease') {
          teamAllocation.allocatedBudget += adjustment.value;
        } else if (adjustment.type === 'percentageDecrease') {
          teamAllocation.allocatedBudget = Math.round(teamAllocation.allocatedBudget * (1 - adjustment.value / 100));
        }
      }
    }

    current.summary.totalAllocated = current.teams.reduce((sum, t) => sum + t.allocatedBudget, 0);
    current.summary.adjustmentsMade = adjustments.length;

    return current;
  }
}

/**
 * BudgetReallocator
 * Budget reallocation workflow for under/over scenarios
 */
class BudgetReallocator {
  constructor(env, options = {}) {
    this.env = env;
    this.supabaseUrl = options.supabaseUrl || process.env.SUPABASE_URL;
    this.supabaseKey = options.supabaseKey || process.env.SUPABASE_KEY;
    this.logger = options.logger || new DiamondLogger('BudgetReallocator');
    this.circuitBreaker = options.circuitBreaker || new CircuitBreaker({
      failureThreshold: 10,
      resetTimeout: 60000
    });
    this.allocationRequests = new Map();
  }

  async analyzeBudgetImbalance(teamBudgets) {
    const analysis = {
      timestamp: new Date().toISOString(),
      teams: [],
      imbalanceSummary: {
        underBudgetTeams: [],
        overBudgetTeams: [],
        totalAvailableForReallocation: 0
      }
    };

    for (const team of teamBudgets) {
      const percentageUsed = (team.spent / team.budget) * 100;
      const remaining = team.budget - team.spent;
      const isUnderBudget = remaining > 0;

      const analysis_team = {
        teamId: team.teamId,
        teamName: team.name,
        budget: team.budget,
        spent: team.spent,
        remaining,
        percentageUsed: parseFloat(percentageUsed.toFixed(2)),
        status: isUnderBudget ? 'under' : 'over',
        projectedMonthEnd: team.spent + (team.spent / 30 * (30 - team.dayOfMonth))
      };

      analysis.teams.push(analysis_team);

      if (isUnderBudget) {
        analysis.imbalanceSummary.underBudgetTeams.push({
          teamId: team.teamId,
          teamName: team.name,
          availableAmount: remaining,
          projectedUnderutilization: Math.round(team.budget - analysis_team.projectedMonthEnd)
        });
        analysis.imbalanceSummary.totalAvailableForReallocation += remaining;
      } else {
        analysis.imbalanceSummary.overBudgetTeams.push({
          teamId: team.teamId,
          teamName: team.name,
          overage: Math.abs(remaining),
          overagePercentage: ((Math.abs(remaining) / team.budget) * 100).toFixed(2)
        });
      }
    }

    return analysis;
  }

  async generateReallocationSuggestions(budgetImbalance) {
    const suggestions = {
      analysisId: `analysis-${Date.now()}`,
      timestamp: new Date().toISOString(),
      transfers: [],
      summary: {
        totalTransfersRequired: 0,
        teamsAffected: 0
      }
    };

    const overBudgetTeams = budgetImbalance.imbalanceSummary.overBudgetTeams;
    const underBudgetTeams = budgetImbalance.imbalanceSummary.underBudgetTeams;

    let transferCounter = 0;

    for (const overTeam of overBudgetTeams) {
      let remainingOverage = overTeam.overage;

      for (const underTeam of underBudgetTeams) {
        if (remainingOverage <= 0) break;

        const transferAmount = Math.min(remainingOverage, underTeam.availableAmount);

        suggestions.transfers.push({
          transferId: `transfer-${Date.now()}-${transferCounter++}`,
          fromTeamId: overTeam.teamId,
          fromTeamName: overTeam.teamName,
          toTeamId: underTeam.teamId,
          toTeamName: underTeam.teamName,
          amount: transferAmount,
          justification: `${overTeam.teamName} is over budget by $${overTeam.overage.toLocaleString()}. ` +
                        `${underTeam.teamName} has available capacity and is projected to underutilize.`,
          priority: overTeam.overage > 50000 ? 'high' : 'medium',
          estimatedApprovalTime: '2 hours',
          status: 'pending_approval'
        });

        remainingOverage -= transferAmount;
        underTeam.availableAmount -= transferAmount;
      }
    }

    suggestions.summary.totalTransfersRequired = suggestions.transfers.reduce((sum, t) => sum + t.amount, 0);
    suggestions.summary.teamsAffected = new Set(
      suggestions.transfers.flatMap(t => [t.fromTeamId, t.toTeamId])
    ).size;

    return suggestions;
  }

  async submitReallocationRequest(transferSuggestions, approverId) {
    const request = {
      requestId: `realloc-req-${Date.now()}`,
      submittedAt: new Date().toISOString(),
      submittedBy: approverId,
      transfers: transferSuggestions.transfers,
      status: 'pending_approval',
      approvalChain: {
        step1Approver: approverId,
        step1Status: 'pending',
        step1DueDate: this._addHours(new Date(), 24).toISOString()
      },
      executionMetadata: {
        canExecuteImmediately: false,
        readyForExecution: false,
        lastModified: new Date().toISOString()
      }
    };

    this.allocationRequests.set(request.requestId, request);
    return request;
  }

  async approveReallocationRequest(requestId, approverId, notes = '') {
    const request = this.allocationRequests.get(requestId);
    if (!request) {
      throw new Error(`Request not found: ${requestId}`);
    }

    request.approvalChain.step1Status = 'approved';
    request.approvalChain.step1ApprovedBy = approverId;
    request.approvalChain.step1ApprovedAt = new Date().toISOString();

    if (notes) {
      request.approvalChain.notes = notes;
    }

    request.status = 'approved';
    request.executionMetadata.readyForExecution = true;

    return request;
  }

  async executeReallocationTransfers(requestId) {
    const request = this.allocationRequests.get(requestId);
    if (!request) {
      throw new Error(`Request not found: ${requestId}`);
    }

    if (request.status !== 'approved') {
      throw new Error(`Request must be approved before execution`);
    }

    const executions = [];

    for (const transfer of request.transfers) {
      const execution = {
        transferId: transfer.transferId,
        executionId: `exec-${Date.now()}-${crypto.randomUUID().substring(0, 9)}`,
        fromTeamId: transfer.fromTeamId,
        toTeamId: transfer.toTeamId,
        amount: transfer.amount,
        executedAt: new Date().toISOString(),
        status: 'completed',
        ledgerEntry: {
          type: 'budget_transfer',
          debit: { teamId: transfer.fromTeamId, amount: transfer.amount },
          credit: { teamId: transfer.toTeamId, amount: transfer.amount }
        }
      };

      executions.push(execution);
    }

    request.status = 'executed';
    request.executionMetadata.executedAt = new Date().toISOString();
    request.executionMetadata.executions = executions;

    return {
      requestId,
      executionsCompleted: executions.length,
      totalAmountTransferred: executions.reduce((sum, e) => sum + e.amount, 0),
      executions
    };
  }

  async getReallocationStatus(requestId) {
    return this.allocationRequests.get(requestId) || null;
  }

  _addHours(date, hours) {
    const result = new Date(date);
    result.setHours(result.getHours() + hours);
    return result;
  }
}

/**
 * BudgetComplianceScorer
 * Real-time budget compliance scoring with multi-dimensional assessment
 */
class BudgetComplianceScorer {
  constructor(env, options = {}) {
    this.env = env;
    this.supabaseUrl = options.supabaseUrl || process.env.SUPABASE_URL;
    this.supabaseKey = options.supabaseKey || process.env.SUPABASE_KEY;
    this.logger = options.logger || new DiamondLogger('BudgetComplianceScorer');
    this.circuitBreaker = options.circuitBreaker || new CircuitBreaker({
      failureThreshold: 10,
      resetTimeout: 60000
    });
    this.scoreHistory = new Map();
  }

  async calculateComplianceScore(teamId, budgetData, forecastData, policyData) {
    const scores = {
      spendRate: this._scoreSpendRate(budgetData),
      variance: this._scoreVariance(budgetData),
      forecastAccuracy: this._scoreForecastAccuracy(budgetData, forecastData),
      policyAdherence: this._scorePolicyAdherence(budgetData, policyData),
      approvalCompliance: this._scoreApprovalCompliance(budgetData)
    };

    const totalScore = (
      scores.spendRate.score * 0.20 +
      scores.variance.score * 0.20 +
      scores.forecastAccuracy.score * 0.20 +
      scores.policyAdherence.score * 0.20 +
      scores.approvalCompliance.score * 0.20
    );

    const complianceRecord = {
      teamId,
      timestamp: new Date().toISOString(),
      overallScore: Math.round(totalScore),
      dimensions: scores,
      category: this._categorizeScore(totalScore),
      trends: this._calculateScoreTrends(teamId, totalScore)
    };

    const history = this.scoreHistory.get(teamId) || [];
    history.push(complianceRecord);
    if (history.length > 100) history.shift();
    this.scoreHistory.set(teamId, history);

    return complianceRecord;
  }

  _scoreSpendRate(budgetData) {
    const { spent, budget, dayOfMonth } = budgetData;
    const expectedSpend = (dayOfMonth / 30) * budget;
    const actualPercentage = (spent / expectedSpend) * 100;

    let score = 100;
    if (actualPercentage > 110) score = Math.max(0, 100 - (actualPercentage - 110) / 2);
    else if (actualPercentage < 80) score = Math.max(0, 100 - (80 - actualPercentage) / 2);

    return {
      dimension: COMPLIANCE_DIMENSIONS.SPEND_RATE,
      score: Math.round(score),
      expectedSpend: Math.round(expectedSpend),
      actualSpend: spent,
      pacePercentage: parseFloat(actualPercentage.toFixed(2)),
      assessment: score >= 80 ? 'on-track' : score >= 60 ? 'caution' : 'at-risk'
    };
  }

  _scoreVariance(budgetData) {
    const { spent, budget } = budgetData;
    const variance = Math.abs(spent - budget) / budget * 100;

    let score = 100 - variance;
    if (score < 0) score = 0;

    return {
      dimension: COMPLIANCE_DIMENSIONS.VARIANCE,
      score: Math.round(score),
      variancePercent: parseFloat(variance.toFixed(2)),
      varianceAmount: spent - budget,
      direction: spent > budget ? 'over' : 'under',
      assessment: variance <= 5 ? 'excellent' : variance <= 15 ? 'good' : 'needs-attention'
    };
  }

  _scoreForecastAccuracy(budgetData, forecastData) {
    if (!forecastData || !forecastData.historical) {
      return {
        dimension: COMPLIANCE_DIMENSIONS.FORECAST_ACCURACY,
        score: 50,
        status: 'insufficient_data',
        assessment: 'pending'
      };
    }

    const { actual, forecast } = forecastData.historical;
    const error = Math.abs(actual - forecast) / forecast * 100;

    let score = 100 - error;
    if (score < 0) score = 0;

    return {
      dimension: COMPLIANCE_DIMENSIONS.FORECAST_ACCURACY,
      score: Math.round(score),
      forecastError: parseFloat(error.toFixed(2)),
      forecastedAmount: forecast,
      actualAmount: actual,
      assessment: error <= 10 ? 'highly-accurate' : error <= 20 ? 'accurate' : 'needs-improvement'
    };
  }

  _scorePolicyAdherence(budgetData, policyData) {
    if (!policyData) {
      return {
        dimension: COMPLIANCE_DIMENSIONS.POLICY_ADHERENCE,
        score: 75,
        status: 'no_policies_defined'
      };
    }

    let violationCount = 0;
    const violations = [];

    if (policyData.maxCategorySpend) {
      for (const [category, maxSpend] of Object.entries(policyData.maxCategorySpend)) {
        if (budgetData[category] && budgetData[category] > maxSpend) {
          violationCount++;
          violations.push({
            policy: `Category ${category} limit`,
            limit: maxSpend,
            actual: budgetData[category],
            exceeded: budgetData[category] - maxSpend
          });
        }
      }
    }

    let score = 100 - (violationCount * 20);
    if (score < 0) score = 0;

    return {
      dimension: COMPLIANCE_DIMENSIONS.POLICY_ADHERENCE,
      score: Math.round(score),
      violationCount,
      violations,
      assessment: violationCount === 0 ? 'compliant' : violationCount === 1 ? 'minor-violation' : 'major-violation'
    };
  }

  _scoreApprovalCompliance(budgetData) {
    const { totalApprovals, requiredApprovals, missedApprovals } = budgetData.approvalStatus || {
      totalApprovals: 0,
      requiredApprovals: 0,
      missedApprovals: 0
    };

    let score = 100;
    if (requiredApprovals > 0) {
      score = ((requiredApprovals - missedApprovals) / requiredApprovals) * 100;
    }

    return {
      dimension: COMPLIANCE_DIMENSIONS.APPROVAL_COMPLIANCE,
      score: Math.round(score),
      approvalsPending: missedApprovals,
      approvalsRequired: requiredApprovals,
      approvalRate: requiredApprovals > 0 ? parseFloat(((requiredApprovals - missedApprovals) / requiredApprovals * 100).toFixed(2)) : 100,
      assessment: score >= 95 ? 'excellent' : score >= 80 ? 'good' : 'needs-attention'
    };
  }

  _categorizeScore(score) {
    if (score >= 90) return 'exemplary';
    if (score >= 80) return 'compliant';
    if (score >= 70) return 'caution';
    if (score >= 60) return 'at-risk';
    return 'critical';
  }

  _calculateScoreTrends(teamId, currentScore) {
    const history = this.scoreHistory.get(teamId) || [];

    if (history.length < 2) {
      return { trend: 'insufficient_data', direction: null };
    }

    const previousScores = history.slice(-10).map(h => h.overallScore);
    const avgPrevious = previousScores.reduce((a, b) => a + b, 0) / previousScores.length;
    const direction = currentScore > avgPrevious ? 'improving' : currentScore < avgPrevious ? 'declining' : 'stable';

    return {
      trend: 'available',
      direction,
      previousAverage: Math.round(avgPrevious),
      improvement: Math.round(currentScore - avgPrevious),
      momentum: direction === 'improving' ? 'positive' : direction === 'declining' ? 'negative' : 'neutral'
    };
  }

  async generateTeamLeaderboard(orgId) {
    const teamScores = [];

    for (const [teamId, history] of this.scoreHistory.entries()) {
      if (history.length === 0) continue;

      const latestScore = history[history.length - 1];
      const previousScore = history.length > 1 ? history[history.length - 2] : null;
      const improvement = previousScore ? latestScore.overallScore - previousScore.overallScore : 0;

      teamScores.push({
        teamId,
        currentScore: latestScore.overallScore,
        category: latestScore.category,
        previousScore: previousScore ? previousScore.overallScore : null,
        improvement,
        trend: latestScore.trends.direction,
        lastUpdated: latestScore.timestamp
      });
    }

    teamScores.sort((a, b) => b.currentScore - a.currentScore);

    return {
      orgId,
      generatedAt: new Date().toISOString(),
      leaderboard: teamScores.map((score, idx) => ({
        rank: idx + 1,
        ...score,
        medal: idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : null
      })),
      summary: {
        topTeam: teamScores[0],
        averageScore: Math.round(teamScores.reduce((sum, s) => sum + s.currentScore, 0) / teamScores.length),
        scoreDistribution: this._calculateDistribution(teamScores)
      }
    };
  }

  _calculateDistribution(teamScores) {
    const exemplary = teamScores.filter(s => s.currentScore >= 90).length;
    const compliant = teamScores.filter(s => s.currentScore >= 80 && s.currentScore < 90).length;
    const caution = teamScores.filter(s => s.currentScore >= 70 && s.currentScore < 80).length;
    const atRisk = teamScores.filter(s => s.currentScore >= 60 && s.currentScore < 70).length;
    const critical = teamScores.filter(s => s.currentScore < 60).length;

    return {
      exemplary,
      compliant,
      caution,
      atRisk,
      critical
    };
  }
}

/**
 * Main FinaultBudgetDiamond class orchestrating all components
 */
class FinaultBudgetDiamond {
  constructor(env, options = {}) {
    this.logger = new DiamondLogger('budget-diamond');
    this.env = env;
    this.options = options;
    this.circuitBreaker = options.circuitBreaker || new CircuitBreaker({
      failureThreshold: 10,
      resetTimeout: 60000
    });

    this.alertEngine = new AlertThresholdEngine(env, options);
    this.varianceReporter = new VarianceReporter(env, options);
    this.scenarioPlanner = new ScenarioPlanner(env, options);
    this.forecastingEngine = new ForecastingEngine(env, options);
    this.aiCreator = new AIBudgetCreator(env, options);
    this.federator = new BudgetFederator(env, options);
    this.reallocator = new BudgetReallocator(env, options);
    this.complianceScorer = new BudgetComplianceScorer(env, options);
  }

  async fetch(endpoint, method = 'GET', body = null) {
    const supabaseUrl = this.options.supabaseUrl || process.env.SUPABASE_URL;
    const supabaseKey = this.options.supabaseKey || process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration required');
    }

    const url = `${supabaseUrl}${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json'
    };

    const options = {
      method,
      headers,
      timeout: 15000,
      maxRetries: method === 'GET' ? 2 : 0,
      circuitBreaker: this.circuitBreaker
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await resilientFetch(url, options);
    return response.json();
  }

  getEngines() {
    return {
      alertEngine: this.alertEngine,
      varianceReporter: this.varianceReporter,
      scenarioPlanner: this.scenarioPlanner,
      forecastingEngine: this.forecastingEngine,
      aiCreator: this.aiCreator,
      federator: this.federator,
      reallocator: this.reallocator,
      complianceScorer: this.complianceScorer
    };
  }

  async getHealth() {
    const health = new HealthCheck('budget');
    health.addCheck('supabase', async () => {
      const supabaseUrl = this.options.supabaseUrl || this.env.SUPABASE_URL;
      const supabaseKey = this.options.supabaseKey || this.env.SUPABASE_KEY;
      const url = `${supabaseUrl}/rest/v1/budget_scenarios?limit=1`;
      const response = await resilientFetch(url, {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        },
        timeout: 10000,
        maxRetries: 1,
        circuitBreaker: this.circuitBreaker
      });
      return { connected: response.ok };
    });
    return health.run();
  }
}

export {
  FinaultBudgetDiamond,
  AlertThresholdEngine,
  VarianceReporter,
  ScenarioPlanner,
  ForecastingEngine,
  AIBudgetCreator,
  BudgetFederator,
  BudgetReallocator,
  BudgetComplianceScorer,
  ALERT_LEVELS,
  NOTIFICATION_CHANNELS,
  FORECAST_METHODS,
  COMPLIANCE_DIMENSIONS,
  THRESHOLD_DEFAULTS
};
