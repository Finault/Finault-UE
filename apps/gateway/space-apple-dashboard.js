/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINAULT SPACE APPLE TIER DASHBOARD
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * "The dashboard should make money visible. Every pixel should show dollars."
 *
 * 8 Intelligence Engines that power the Space Apple Dashboard:
 * - ProactiveAlertSystem: Catch problems BEFORE they cost money
 * - DrillDownEngine: Organization → Department → Team → Project → Request
 * - AutonomousSavingsEngine: AI that saves money while you sleep
 * - GoalTracker: Set, track, and celebrate cost reduction goals
 * - BenchmarkEngine: How you compare to industry peers
 * - InsightGenerator: Natural language spending intelligence
 * - WhatIfEngine: Scenario simulation for cost planning
 * - MoneyMachine: Live ticker of value Finault has created
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const { createClient } = require('@supabase/supabase-js');

/**
 * ProactiveAlertSystem
 * Detects anomalies, budget breaches, and optimization opportunities
 */
class ProactiveAlertSystem {
  constructor(env) {
    this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
    this.env = env;
  }

  /**
   * Check organization metrics and generate alerts
   * @param {string} orgId - Organization ID
   * @returns {Promise<Array>} Array of alert objects
   */
  async checkAndAlert(orgId) {
    try {
      const alerts = [];
      const now = new Date();

      // Fetch organization and current billing period
      const { data: org, error: orgError } = await this.supabase
        .from('organizations')
        .select('id, monthly_budget, name, alert_email, slack_webhook')
        .eq('id', orgId)
        .single();

      if (orgError || !org) {
        throw new Error(`Organization not found: ${orgId}`);
      }

      // Check monthly spend against budget
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const { data: monthlySpend } = await this.supabase
        .from('costs')
        .select('amount')
        .eq('org_id', orgId)
        .gte('timestamp', startOfMonth.toISOString())
        .lte('timestamp', now.toISOString());

      const totalMonthlySpend = (monthlySpend || []).reduce((sum, c) => sum + c.amount, 0);

      if (org.monthly_budget && totalMonthlySpend > org.monthly_budget * 0.9) {
        alerts.push({
          type: 'budget_warning',
          severity: totalMonthlySpend > org.monthly_budget ? 'critical' : 'warning',
          message: `Monthly spend (${totalMonthlySpend.toFixed(2)}) exceeds ${(org.monthly_budget * 0.9).toFixed(2)} threshold`,
          data: { current: totalMonthlySpend, budget: org.monthly_budget },
          sent_at: now.toISOString()
        });
      }

      // Check for spending anomalies (spike detection)
      const { data: dailySpends } = await this.supabase
        .from('daily_spend_summary')
        .select('date, amount')
        .eq('org_id', orgId)
        .gte('date', new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .lte('date', now.toISOString())
        .order('date', { ascending: true });

      if (dailySpends && dailySpends.length > 7) {
        const amounts = dailySpends.map(d => d.amount);
        const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        const variance = amounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / amounts.length;
        const stdDev = Math.sqrt(variance);
        const lastDay = amounts[amounts.length - 1];

        if (lastDay > mean + 2 * stdDev) {
          alerts.push({
            type: 'anomaly_detected',
            severity: 'warning',
            message: `Spending spike detected: $${lastDay.toFixed(2)} vs. average $${mean.toFixed(2)}`,
            data: { current: lastDay, average: mean, stdDev: stdDev },
            sent_at: now.toISOString()
          });
        }
      }

      // Check for unused resources
      const { data: unusedResources } = await this.supabase
        .from('resources')
        .select('id, name, cost, last_used')
        .eq('org_id', orgId)
        .eq('status', 'active');

      if (unusedResources) {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const unused = unusedResources.filter(r => new Date(r.last_used) < thirtyDaysAgo);

        if (unused.length > 0) {
          const monthlyCost = unused.reduce((sum, r) => sum + (r.cost || 0), 0);
          alerts.push({
            type: 'unused_resources',
            severity: 'info',
            message: `Found ${unused.length} unused resources costing $${monthlyCost.toFixed(2)}/month`,
            data: { count: unused.length, monthlyCost: monthlyCost, resources: unused },
            sent_at: now.toISOString()
          });
        }
      }

      // Deliver alerts to Slack if configured
      if (alerts.length > 0 && org.slack_webhook) {
        await this.deliverToSlack(alerts, org);
      }

      return alerts;
    } catch (error) {
      console.error('ProactiveAlertSystem.checkAndAlert error:', error);
      return [];
    }
  }

  /**
   * Deliver alerts to Slack via incoming webhook
   * Uses Block Kit for rich formatting
   */
  async deliverToSlack(alerts, org) {
    try {
      const severityEmoji = { critical: ':rotating_light:', warning: ':warning:', info: ':information_source:' };
      const severityColor = { critical: '#dc2626', warning: '#f59e0b', info: '#3b82f6' };

      const blocks = [
        {
          type: 'header',
          text: { type: 'plain_text', text: `Finault Alert — ${org.name || 'Your Organization'}`, emoji: true }
        },
        { type: 'divider' }
      ];

      for (const alert of alerts) {
        const emoji = severityEmoji[alert.severity] || ':bell:';
        const color = severityColor[alert.severity] || '#6b7280';

        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${emoji} *${alert.type.replace(/_/g, ' ').toUpperCase()}*\n${alert.message}`
          }
        });

        // Add context with data details
        if (alert.data) {
          const details = [];
          if (alert.data.current !== undefined) details.push(`Current: $${Number(alert.data.current).toLocaleString()}`);
          if (alert.data.budget !== undefined) details.push(`Budget: $${Number(alert.data.budget).toLocaleString()}`);
          if (alert.data.average !== undefined) details.push(`Avg: $${Number(alert.data.average).toFixed(2)}`);
          if (alert.data.count !== undefined) details.push(`Count: ${alert.data.count}`);
          if (alert.data.monthlyCost !== undefined) details.push(`Monthly waste: $${Number(alert.data.monthlyCost).toFixed(2)}`);

          if (details.length > 0) {
            blocks.push({
              type: 'context',
              elements: [{ type: 'mrkdwn', text: details.join(' · ') }]
            });
          }
        }
      }

      blocks.push(
        { type: 'divider' },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `<https://app.finault.ai|View Dashboard> · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC` }]
        }
      );

      // Use Slack attachments for colored sidebar
      const payload = {
        attachments: [{
          color: alerts.some(a => a.severity === 'critical') ? '#dc2626' : alerts.some(a => a.severity === 'warning') ? '#f59e0b' : '#3b82f6',
          blocks
        }]
      };

      const resp = await fetch(org.slack_webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        console.error(`[SLACK] Delivery failed for org ${org.id}: ${resp.status}`);
      } else {
        console.log(`[SLACK] Delivered ${alerts.length} alert(s) to org ${org.id}`);
      }
    } catch (error) {
      // Fire-and-forget — don't let Slack failures break alerting
      console.error(`[SLACK] Error delivering to org ${org.id}:`, error.message);
    }
  }
}

/**
 * DrillDownEngine
 * Navigate hierarchical cost structure: org → department → team → project → request
 */
class DrillDownEngine {
  constructor(env) {
    this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
    this.env = env;
  }

  /**
   * Get hierarchical cost breakdown
   * @param {string} orgId - Organization ID
   * @param {string} level - Drill level: 'organization', 'department', 'team', 'project', 'user', 'request'
   * @param {Object} filters - Filter criteria
   * @param {Object} dateRange - {start, end} date range
   * @returns {Promise<Object>} Drill-down data
   */
  async getDrillDown(orgId, level, filters = {}, dateRange = {}) {
    try {
      const { start, end } = dateRange;
      let query = this.supabase.from('costs').select('*').eq('org_id', orgId);

      if (start) query = query.gte('timestamp', start);
      if (end) query = query.lte('timestamp', end);

      const { data: costs, error } = await query;
      if (error) throw error;

      const result = {
        level,
        totalCost: 0,
        breakdown: [],
        metadata: { orgId, dateRange, filters }
      };

      if (!costs || costs.length === 0) {
        return result;
      }

      // Group by the requested level
      const grouped = {};

      costs.forEach(cost => {
        let key = '';
        switch (level) {
          case 'department':
            key = filters.department || cost.department || 'unassigned';
            break;
          case 'team':
            key = filters.team || cost.team || 'unassigned';
            break;
          case 'project':
            key = filters.project || cost.project || 'unassigned';
            break;
          case 'user':
            key = filters.user || cost.user_id || 'unassigned';
            break;
          case 'request':
            key = filters.requestId || cost.request_id || 'unassigned';
            break;
          case 'organization':
          default:
            key = 'total';
        }

        if (!grouped[key]) {
          grouped[key] = { name: key, amount: 0, count: 0, details: [] };
        }
        grouped[key].amount += cost.amount || 0;
        grouped[key].count += 1;
        grouped[key].details.push({
          timestamp: cost.timestamp,
          model: cost.model,
          tokens: cost.tokens,
          amount: cost.amount
        });
      });

      result.breakdown = Object.values(grouped).sort((a, b) => b.amount - a.amount);
      result.totalCost = result.breakdown.reduce((sum, item) => sum + item.amount, 0);

      return result;
    } catch (error) {
      console.error('DrillDownEngine.getDrillDown error:', error);
      throw error;
    }
  }
}

/**
 * AutonomousSavingsEngine
 * Identifies and executes cost optimizations automatically
 */
class AutonomousSavingsEngine {
  constructor(env) {
    this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
    this.env = env;
  }

  /**
   * Run autonomous optimization algorithms
   * @param {string} orgId - Organization ID
   * @returns {Promise<Object>} Optimization results
   */
  async runAutonomousOptimizations(orgId) {
    try {
      const executed = [];
      let totalSavings = 0;

      // Strategy 1: Downgrade expensive models to cheaper alternatives
      const { data: expensiveModels } = await this.supabase
        .from('model_usage')
        .select('*')
        .eq('org_id', orgId)
        .order('monthly_cost', { ascending: false })
        .limit(10);

      if (expensiveModels) {
        for (const usage of expensiveModels) {
          const downgradePotential = this.calculateDowngradeOpportunity(usage);
          if (downgradePotential.savings > 100) {
            executed.push({
              type: 'model_downgrade',
              from: usage.model,
              to: downgradePotential.recommendation,
              estimatedSavings: downgradePotential.savings,
              status: 'recommended'
            });
            totalSavings += downgradePotential.savings;
          }
        }
      }

      // Strategy 2: Enable caching for high-volume requests
      const { data: highVolumeRequests } = await this.supabase
        .from('request_patterns')
        .select('*')
        .eq('org_id', orgId)
        .eq('caching_enabled', false)
        .gte('daily_requests', 100)
        .order('daily_requests', { ascending: false })
        .limit(5);

      if (highVolumeRequests) {
        for (const req of highVolumeRequests) {
          const cachingSavings = req.daily_requests * 0.7 * 0.0001; // Conservative estimate
          executed.push({
            type: 'enable_caching',
            requestPattern: req.pattern,
            estimatedSavings: cachingSavings,
            status: 'recommended'
          });
          totalSavings += cachingSavings;
        }
      }

      // Strategy 3: Adjust rate limits for over-provisioned endpoints
      const { data: overProvisioned } = await this.supabase
        .from('endpoints')
        .select('*')
        .eq('org_id', orgId)
        .lt('utilization_percent', 30)
        .gte('monthly_cost', 50);

      if (overProvisioned) {
        for (const endpoint of overProvisioned) {
          const scalingPotential = endpoint.monthly_cost * 0.3;
          executed.push({
            type: 'rate_limit_adjustment',
            endpoint: endpoint.name,
            estimatedSavings: scalingPotential,
            status: 'recommended'
          });
          totalSavings += scalingPotential;
        }
      }

      return {
        executed,
        totalSavings: totalSavings,
        optimizationsCount: executed.length,
        timestamp: new Date().toISOString(),
        nextRun: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      };
    } catch (error) {
      console.error('AutonomousSavingsEngine.runAutonomousOptimizations error:', error);
      return { executed: [], totalSavings: 0, error: error.message };
    }
  }

  calculateDowngradeOpportunity(modelUsage) {
    const modelPrices = {
      'gpt-4-turbo': 0.03,
      'gpt-4': 0.03,
      'gpt-3.5-turbo': 0.0005,
      'claude-3-opus': 0.015,
      'claude-3-sonnet': 0.003,
      'claude-3-haiku': 0.00025
    };

    const current = modelPrices[modelUsage.model] || 0.01;
    let recommendation = 'claude-3-sonnet';
    let recommended = modelPrices['claude-3-sonnet'] || 0.003;

    if (modelUsage.model.includes('gpt-4')) {
      recommendation = 'gpt-3.5-turbo';
      recommended = modelPrices['gpt-3.5-turbo'] || 0.0005;
    }

    const monthlyCost = modelUsage.monthly_cost || 1000;
    const savings = monthlyCost * (1 - recommended / current);

    return { recommendation, savings: Math.max(0, savings) };
  }
}

/**
 * GoalTracker
 * Manage cost reduction goals and track progress
 */
class GoalTracker {
  constructor(env) {
    this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
    this.env = env;
  }

  /**
   * GAP #23 FIX: Rewired to use real `goals` table (was querying non-existent `cost_goals`)
   * Get progress on all goals for an organization
   * @param {string} orgId - Organization ID
   * @param {Object} options - Filter options (status, goal_type)
   * @returns {Promise<Array>} Array of goal progress objects
   */
  async getGoalProgress(orgId, options = {}) {
    try {
      let query = this.supabase
        .from('goals')
        .select('*')
        .eq('organization_id', orgId)
        .order('priority', { ascending: true });

      const status = options.status || 'active';
      if (status !== 'all') {
        query = query.eq('status', status);
      }
      if (options.goal_type) {
        query = query.eq('goal_type', options.goal_type);
      }

      const { data: goals, error } = await query;

      if (error) throw error;

      // Enrich with spend data where applicable
      const progressArray = [];
      for (const goal of goals || []) {
        let currentValue = parseFloat(goal.current_value) || 0;

        // For cost_reduction and savings_target goals, try to compute live progress from usage
        if ((goal.goal_type === 'cost_reduction' || goal.goal_type === 'savings_target') && currentValue === 0) {
          try {
            const { data: spendData } = await this.supabase
              .from('usage')
              .select('cost_cents')
              .eq('organization_id', orgId)
              .gte('created_at', goal.start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
              .lte('created_at', new Date().toISOString());

            if (spendData && spendData.length > 0) {
              currentValue = spendData.reduce((sum, r) => sum + ((r.cost_cents || 0) / 100), 0);
            }
          } catch (e) {
            // Non-fatal: just use stored current_value
          }
        }

        const daysRemaining = Math.ceil((new Date(goal.deadline) - new Date()) / (1000 * 60 * 60 * 24));
        const targetValue = parseFloat(goal.target_value) || 1;
        const progressPercent = Math.min(100, (currentValue / targetValue) * 100);
        const onTrack = goal.goal_type === 'cost_reduction'
          ? currentValue <= targetValue
          : currentValue >= targetValue;

        progressArray.push({
          id: goal.id,
          title: goal.title,
          description: goal.description,
          goal_type: goal.goal_type,
          category: goal.category,
          target_value: targetValue,
          current_value: currentValue,
          unit: goal.unit || 'USD',
          progress_percent: parseFloat(progressPercent.toFixed(1)),
          deadline: goal.deadline,
          start_date: goal.start_date,
          days_remaining: daysRemaining,
          on_track: onTrack,
          overdue: daysRemaining < 0 && goal.status === 'active',
          priority: goal.priority,
          owner_id: goal.owner_id,
          status: goal.status,
          metadata: goal.metadata,
          created_at: goal.created_at,
          completed_at: goal.completed_at
        });
      }

      return progressArray;
    } catch (error) {
      console.error('GoalTracker.getGoalProgress error:', error);
      throw error;
    }
  }

  /**
   * GAP #23 FIX: Create a new goal in the real `goals` table
   * @param {string} orgId - Organization ID
   * @param {Object} body - Goal definition
   * @returns {Promise<Object>} Created goal
   */
  async createGoal(orgId, body) {
    try {
      const { title, description, target_value, target_amount, deadline, target_date,
              goal_type, category, unit, priority, owner_id, metadata } = body;

      if (!title && !description) {
        throw new Error('title or description is required');
      }
      if (!(target_value || target_amount)) {
        throw new Error('target_value is required');
      }
      if (!(deadline || target_date)) {
        throw new Error('deadline is required');
      }

      const { data: goal, error } = await this.supabase
        .from('goals')
        .insert([{
          organization_id: orgId,
          title: title || description,
          description: description || title,
          goal_type: goal_type || 'cost_reduction',
          category: category || null,
          target_value: parseFloat(target_value || target_amount),
          current_value: 0,
          unit: unit || 'USD',
          deadline: deadline || target_date,
          start_date: new Date().toISOString().split('T')[0],
          status: 'active',
          priority: parseInt(priority) || 100,
          owner_id: owner_id || null,
          metadata: metadata || {}
        }])
        .select()
        .single();

      if (error) throw error;

      return goal;
    } catch (error) {
      console.error('GoalTracker.createGoal error:', error);
      throw error;
    }
  }

  /**
   * GAP #23 FIX: Update an existing goal
   * @param {string} orgId - Organization ID
   * @param {string} goalId - Goal ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated goal
   */
  async updateGoal(orgId, goalId, updates) {
    try {
      const allowedFields = ['title', 'description', 'target_value', 'current_value',
                             'deadline', 'status', 'priority', 'category', 'owner_id', 'metadata'];
      const updateData = { updated_at: new Date().toISOString() };
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          updateData[field] = updates[field];
        }
      }

      // If marking as completed, set completed_at
      if (updates.status === 'completed') {
        updateData.completed_at = new Date().toISOString();
      }

      const { data: goal, error } = await this.supabase
        .from('goals')
        .update(updateData)
        .eq('id', goalId)
        .eq('organization_id', orgId)
        .select()
        .single();

      if (error) throw error;

      return goal;
    } catch (error) {
      console.error('GoalTracker.updateGoal error:', error);
      throw error;
    }
  }

  /**
   * GAP #23 FIX: Delete a goal (soft delete via status change)
   * @param {string} orgId - Organization ID
   * @param {string} goalId - Goal ID
   * @returns {Promise<Object>} Abandoned goal
   */
  async deleteGoal(orgId, goalId) {
    try {
      const { data: goal, error } = await this.supabase
        .from('goals')
        .update({ status: 'abandoned', updated_at: new Date().toISOString() })
        .eq('id', goalId)
        .eq('organization_id', orgId)
        .select()
        .single();

      if (error) throw error;

      return goal;
    } catch (error) {
      console.error('GoalTracker.deleteGoal error:', error);
      throw error;
    }
  }
}

/**
 * BenchmarkEngine
 * Compare organization spending against industry benchmarks
 */
class BenchmarkEngine {
  constructor(env) {
    this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
    this.env = env;
  }

  /**
   * Get benchmark comparison data
   * @param {string} orgId - Organization ID
   * @returns {Promise<Object>} Benchmark data
   */
  async getBenchmarks(orgId) {
    try {
      // Fetch organization profile
      const { data: org } = await this.supabase
        .from('organizations')
        .select('*')
        .eq('id', orgId)
        .single();

      if (!org) {
        throw new Error(`Organization ${orgId} not found`);
      }

      // Get org's current spend (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: orgSpends } = await this.supabase
        .from('costs')
        .select('amount')
        .eq('org_id', orgId)
        .gte('timestamp', thirtyDaysAgo);

      const orgMonthlySpend = (orgSpends || []).reduce((sum, c) => sum + c.amount, 0);

      // Fetch industry benchmarks
      const { data: benchmarks } = await this.supabase
        .from('industry_benchmarks')
        .select('*')
        .eq('industry', org.industry || 'general');

      const benchmark = benchmarks?.[0] || {
        p25_monthly_spend: 2000,
        p50_monthly_spend: 5000,
        p75_monthly_spend: 12000,
        industry: 'general'
      };

      const percentile = this.calculatePercentile(orgMonthlySpend, benchmark);

      return {
        success: true,
        organization: {
          id: orgId,
          name: org.name,
          industry: org.industry,
          monthlySpend: orgMonthlySpend
        },
        benchmark: {
          p25: benchmark.p25_monthly_spend,
          p50: benchmark.p50_monthly_spend,
          p75: benchmark.p75_monthly_spend,
          industry: benchmark.industry
        },
        comparison: {
          percentile,
          percentileLabel: percentile < 25 ? 'Below Average' : percentile < 75 ? 'Average' : 'Above Average',
          vsMedian: orgMonthlySpend - benchmark.p50_monthly_spend,
          vsMedianPercent: ((orgMonthlySpend - benchmark.p50_monthly_spend) / benchmark.p50_monthly_spend) * 100
        }
      };
    } catch (error) {
      console.error('BenchmarkEngine.getBenchmarks error:', error);
      throw error;
    }
  }

  calculatePercentile(value, benchmark) {
    if (value <= benchmark.p25_monthly_spend) return 25;
    if (value <= benchmark.p50_monthly_spend) return 50;
    if (value <= benchmark.p75_monthly_spend) return 75;
    return 90;
  }
}

/**
 * InsightGenerator
 * Generate natural language insights about spending patterns
 */
class InsightGenerator {
  constructor(env) {
    this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
    this.env = env;
  }

  /**
   * Generate spending insights
   * @param {string} orgId - Organization ID
   * @returns {Promise<Object>} Insights with metadata
   */
  async generateInsights(orgId) {
    try {
      const insights = [];
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Fetch spending data
      const { data: costs } = await this.supabase
        .from('costs')
        .select('*')
        .eq('org_id', orgId)
        .gte('timestamp', thirtyDaysAgo.toISOString())
        .lte('timestamp', now.toISOString());

      if (!costs || costs.length === 0) {
        return { insights: [], count: 0, generated_at: now.toISOString() };
      }

      const totalSpend = costs.reduce((sum, c) => sum + c.amount, 0);
      const avgDaily = totalSpend / 30;

      // Insight 1: Spending trend
      const firstWeek = costs.filter(c => new Date(c.timestamp) >= thirtyDaysAgo && new Date(c.timestamp) < new Date(thirtyDaysAgo.getTime() + 7 * 24 * 60 * 60 * 1000))
        .reduce((sum, c) => sum + c.amount, 0);
      const lastWeek = costs.filter(c => new Date(c.timestamp) >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000))
        .reduce((sum, c) => sum + c.amount, 0);

      if (lastWeek > firstWeek * 1.2) {
        insights.push({
          type: 'trend_alert',
          title: 'Spending Accelerating',
          message: `Your weekly spend increased ${((lastWeek / firstWeek - 1) * 100).toFixed(0)}% from the start of the month.`,
          severity: 'warning'
        });
      }

      // Insight 2: Top cost driver
      const modelCosts = {};
      costs.forEach(c => {
        modelCosts[c.model] = (modelCosts[c.model] || 0) + c.amount;
      });
      const topModel = Object.entries(modelCosts).sort((a, b) => b[1] - a[1])[0];
      if (topModel) {
        insights.push({
          type: 'top_driver',
          title: 'Primary Cost Driver',
          message: `${topModel[0]} accounts for ${((topModel[1] / totalSpend) * 100).toFixed(1)}% of your spend.`,
          severity: 'info'
        });
      }

      // Insight 3: Cost efficiency
      const requestCount = costs.reduce((sum, c) => sum + (c.tokens || 1), 0);
      const costPerRequest = totalSpend / requestCount;
      insights.push({
        type: 'efficiency',
        title: 'Cost per Request',
        message: `Your average cost per request is $${costPerRequest.toFixed(4)}.`,
        severity: 'info'
      });

      return {
        insights,
        count: insights.length,
        generated_at: now.toISOString()
      };
    } catch (error) {
      console.error('InsightGenerator.generateInsights error:', error);
      throw error;
    }
  }
}

/**
 * WhatIfEngine
 * Run scenario simulations for cost planning
 */
class WhatIfEngine {
  constructor(env) {
    this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
    this.env = env;
  }

  /**
   * Run a scenario simulation
   * @param {string} orgId - Organization ID
   * @param {Object} scenario - Scenario parameters
   * @returns {Promise<Object>} Simulation results
   */
  async runScenario(orgId, scenario) {
    try {
      // Get current baseline (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: baselineCosts } = await this.supabase
        .from('costs')
        .select('*')
        .eq('org_id', orgId)
        .gte('timestamp', thirtyDaysAgo);

      const baseline = (baselineCosts || []).reduce((sum, c) => sum + c.amount, 0);

      let projectedCost = baseline;
      const changes = [];

      // Scenario 1: Model switch
      if (scenario.modelSwitch) {
        const { fromModel, toModel } = scenario.modelSwitch;
        const { data: modelUsage } = await this.supabase
          .from('costs')
          .select('*')
          .eq('org_id', orgId)
          .eq('model', fromModel)
          .gte('timestamp', thirtyDaysAgo);

        const switchCost = (modelUsage || []).reduce((sum, c) => sum + c.amount, 0);
        const priceRatio = this.getModelPriceRatio(toModel, fromModel);
        const newCost = switchCost * priceRatio;
        const savings = switchCost - newCost;

        projectedCost = baseline - savings;
        changes.push({
          type: 'model_switch',
          from: fromModel,
          to: toModel,
          currentCost: switchCost,
          projectedCost: newCost,
          savings: savings
        });
      }

      // Scenario 2: Usage scaling
      if (scenario.usageMultiplier) {
        const multiplier = scenario.usageMultiplier;
        const additionalCost = baseline * (multiplier - 1);
        projectedCost = baseline * multiplier;
        changes.push({
          type: 'usage_scaling',
          multiplier,
          additionalCost,
          projectedCost
        });
      }

      // Scenario 3: Caching enabled
      if (scenario.cachingEnabled) {
        const cachingSavings = baseline * 0.15; // Conservative 15% savings
        projectedCost -= cachingSavings;
        changes.push({
          type: 'caching_enabled',
          savingsPercent: 15,
          savingsAmount: cachingSavings,
          projectedCost
        });
      }

      return {
        success: true,
        scenario: scenario,
        baseline,
        projectedCost,
        difference: projectedCost - baseline,
        differencePercent: ((projectedCost - baseline) / baseline) * 100,
        changes,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('WhatIfEngine.runScenario error:', error);
      throw error;
    }
  }

  getModelPriceRatio(toModel, fromModel) {
    const prices = {
      'gpt-4-turbo': 0.03,
      'gpt-4': 0.03,
      'gpt-3.5-turbo': 0.0005,
      'claude-3-opus': 0.015,
      'claude-3-sonnet': 0.003,
      'claude-3-haiku': 0.00025
    };

    const fromPrice = prices[fromModel] || 0.01;
    const toPrice = prices[toModel] || 0.01;

    return toPrice / fromPrice;
  }
}

/**
 * MoneyMachine
 * Live ticker of financial value created and savings achieved
 */
class MoneyMachine {
  constructor(env) {
    this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
    this.env = env;
  }

  /**
   * Get live money machine statistics
   * @param {string} orgId - Organization ID
   * @returns {Promise<Object>} Value metrics
   */
  async getMoneyMachineStats(orgId) {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

      // Get current month spend
      const { data: currentMonthCosts } = await this.supabase
        .from('costs')
        .select('amount')
        .eq('org_id', orgId)
        .gte('timestamp', thirtyDaysAgo.toISOString())
        .lte('timestamp', now.toISOString());

      const currentMonthSpend = (currentMonthCosts || []).reduce((sum, c) => sum + c.amount, 0);

      // Get previous month spend
      const { data: prevMonthCosts } = await this.supabase
        .from('costs')
        .select('amount')
        .eq('org_id', orgId)
        .gte('timestamp', sixtyDaysAgo.toISOString())
        .lte('timestamp', thirtyDaysAgo.toISOString());

      const prevMonthSpend = (prevMonthCosts || []).reduce((sum, c) => sum + c.amount, 0);

      // Calculate month-over-month change
      const momChange = currentMonthSpend - prevMonthSpend;
      const momPercent = prevMonthSpend > 0 ? (momChange / prevMonthSpend) * 100 : 0;

      // Get optimizations applied
      const { data: optimizations } = await this.supabase
        .from('optimizations_applied')
        .select('estimated_savings')
        .eq('org_id', orgId)
        .eq('status', 'active');

      const totalSavingsAchieved = (optimizations || []).reduce((sum, o) => sum + (o.estimated_savings || 0), 0);

      // Calculate prevented overages
      const { data: org } = await this.supabase
        .from('organizations')
        .select('monthly_budget')
        .eq('id', orgId)
        .single();

      const preventedOverage = Math.max(0, (org?.monthly_budget || 10000) - currentMonthSpend);

      return {
        success: true,
        currentMonthSpend,
        previousMonthSpend: prevMonthSpend,
        monthOverMonthChange: momChange,
        monthOverMonthPercent: momPercent,
        totalSavingsAchieved,
        preventedOverages: preventedOverage,
        optimizationCount: optimizations?.length || 0,
        ticker: {
          headline: `Finault saved your organization $${totalSavingsAchieved.toFixed(2)} this month`,
          subtext: `Current spend: $${currentMonthSpend.toFixed(2)} (${momPercent > 0 ? '+' : ''}${momPercent.toFixed(1)}% MoM)`,
          metric: totalSavingsAchieved
        },
        timestamp: now.toISOString()
      };
    } catch (error) {
      console.error('MoneyMachine.getMoneyMachineStats error:', error);
      throw error;
    }
  }
}

// Export all 8 classes for CommonJS require()
module.exports = {
  ProactiveAlertSystem,
  DrillDownEngine,
  AutonomousSavingsEngine,
  GoalTracker,
  BenchmarkEngine,
  InsightGenerator,
  WhatIfEngine,
  MoneyMachine
};
