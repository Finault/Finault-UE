/**
 * Finault CFO Dashboard & Analytics - Diamond Tier Enhancements
 * Enterprise-grade AI spend analytics, reporting, and benchmarking
 * Production CommonJS module
 */

import { DiamondLogger, CircuitBreaker, resilientFetch, InputValidator, HealthCheck } from './diamond-utils.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const UNIT_ECONOMICS_METRICS = {
  COST_PER_TOKEN: 'cost_per_token',
  COST_PER_INFERENCE: 'cost_per_inference',
  COST_PER_BUSINESS_ACTION: 'cost_per_business_action',
  COST_PER_TRANSACTION: 'cost_per_transaction',
  MODEL_EFFICIENCY_RATIO: 'model_efficiency_ratio',
  COMPUTE_UTILIZATION: 'compute_utilization',
  TOKEN_EFFICIENCY_SCORE: 'token_efficiency_score'
};

const FINOPS_MATURITY_DOMAINS = [
  {
    id: 'inform',
    name: 'Inform',
    description: 'Visibility and understanding of AI spend',
    subdomains: ['Cost Attribution', 'Cost Analysis', 'Chargeback Models']
  },
  {
    id: 'optimize',
    name: 'Optimize',
    description: 'Active cost optimization and efficiency',
    subdomains: ['Resource Right-Sizing', 'Model Selection', 'Compute Optimization']
  },
  {
    id: 'operate',
    name: 'Operate',
    description: 'Operational governance and automation',
    subdomains: ['Budget Controls', 'Usage Policies', 'Automated Remediation']
  }
];

const BOARD_REPORT_SECTIONS = [
  'executive_summary',
  'spend_overview',
  'departmental_breakdown',
  'model_performance',
  'roi_analysis',
  'risk_assessment',
  'optimization_opportunities',
  'market_comparison',
  'recommendations'
];

const BENCHMARK_INDUSTRIES = [
  'fintech',
  'enterprise_saas',
  'ecommerce',
  'media_entertainment',
  'healthcare',
  'manufacturing',
  'government',
  'education',
  'legal',
  'consulting'
];

const MOBILE_ENDPOINTS = [
  '/api/v1/mobile/dashboard-summary',
  '/api/v1/mobile/spend-today',
  '/api/v1/mobile/alerts',
  '/api/v1/mobile/approvals',
  '/api/v1/mobile/trends',
  '/api/v1/mobile/budget-status',
  '/api/v1/mobile/team-performance'
];

// ============================================================================
// CLASS: UnitEconomicsCalculator
// ============================================================================

class UnitEconomicsCalculator {
  constructor(env, options = {}) {
    this.env = env;
    this.supabaseUrl = options.supabaseUrl || env.SUPABASE_URL;
    this.supabaseKey = options.supabaseKey || env.SUPABASE_ANON_KEY;
    this.cacheExpiry = options.cacheExpiry || 3600000; // 1 hour
    this.logger = options.logger || new DiamondLogger('UnitEconomicsCalculator');
    this.circuitBreaker = options.circuitBreaker || new CircuitBreaker({
      failureThreshold: 10,
      resetTimeout: 60000
    });
    this.cache = new Map();
  }

  async fetch(endpoint, options = {}) {
    const url = `${this.supabaseUrl}/rest/v1${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation'
    };

    const response = await resilientFetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      timeout: 15000,
      maxRetries: 2,
      circuitBreaker: this.circuitBreaker
    });

    if (!response.ok) {
      throw new Error(`Supabase API error: ${response.statusText}`);
    }

    return response.json();
  }

  async calculateCostPerToken(modelId, period = '30d') {
    const cacheKey = `cost_per_token_${modelId}_${period}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const startDate = this._getPeriodStartDate(period);
    const results = await this.fetch(
      `/api_usage?model_id=eq.${encodeURIComponent(modelId)}&created_at=gte.${encodeURIComponent(startDate)}&select=total_tokens,total_cost`
    );

    const totalTokens = results.reduce((sum, r) => sum + (r.total_tokens || 0), 0);
    const totalCost = results.reduce((sum, r) => sum + (r.total_cost || 0), 0);

    const costPerToken = totalTokens > 0 ? totalCost / totalTokens : 0;

    const result = {
      modelId,
      period,
      costPerToken: parseFloat(costPerToken.toFixed(8)),
      totalTokens,
      totalCost: parseFloat(totalCost.toFixed(2)),
      timestamp: new Date().toISOString()
    };

    this.cache.set(cacheKey, result);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return result;
  }

  async calculateCostPerInference(modelId, period = '30d') {
    const cacheKey = `cost_per_inference_${modelId}_${period}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const startDate = this._getPeriodStartDate(period);
    const results = await this.fetch(
      `/api_usage?model_id=eq.${encodeURIComponent(modelId)}&created_at=gte.${encodeURIComponent(startDate)}&select=inference_count,total_cost,total_tokens`
    );

    const inferenceCount = results.reduce((sum, r) => sum + (r.inference_count || 0), 0);
    const totalCost = results.reduce((sum, r) => sum + (r.total_cost || 0), 0);
    const totalTokens = results.reduce((sum, r) => sum + (r.total_tokens || 0), 0);

    const costPerInference = inferenceCount > 0 ? totalCost / inferenceCount : 0;
    const avgTokensPerInference = inferenceCount > 0 ? totalTokens / inferenceCount : 0;

    const result = {
      modelId,
      period,
      costPerInference: parseFloat(costPerInference.toFixed(6)),
      inferenceCount,
      totalCost: parseFloat(totalCost.toFixed(2)),
      avgTokensPerInference: parseFloat(avgTokensPerInference.toFixed(2)),
      timestamp: new Date().toISOString()
    };

    this.cache.set(cacheKey, result);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return result;
  }

  async calculateCostPerBusinessAction(departmentId, actionType, period = '30d') {
    const cacheKey = `cost_per_action_${departmentId}_${actionType}_${period}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const startDate = this._getPeriodStartDate(period);
    const results = await this.fetch(
      `/business_actions?department_id=eq.${encodeURIComponent(departmentId)}&action_type=eq.${encodeURIComponent(actionType)}&created_at=gte.${encodeURIComponent(startDate)}&select=action_id,ai_cost,business_impact,revenue_attributed`
    );

    const totalActions = results.length;
    const totalCost = results.reduce((sum, r) => sum + (r.ai_cost || 0), 0);
    const totalRevenueAttributed = results.reduce((sum, r) => sum + (r.revenue_attributed || 0), 0);
    const avgBusinessImpact = results.length > 0
      ? results.reduce((sum, r) => sum + (r.business_impact || 0), 0) / results.length
      : 0;

    const costPerAction = totalActions > 0 ? totalCost / totalActions : 0;
    const roa = totalCost > 0 ? totalRevenueAttributed / totalCost : 0; // Return on AI spend

    const result = {
      departmentId,
      actionType,
      period,
      costPerAction: parseFloat(costPerAction.toFixed(2)),
      totalActions,
      totalCost: parseFloat(totalCost.toFixed(2)),
      totalRevenueAttributed: parseFloat(totalRevenueAttributed.toFixed(2)),
      returnOnAISpend: parseFloat(roa.toFixed(2)),
      avgBusinessImpact: parseFloat(avgBusinessImpact.toFixed(2)),
      timestamp: new Date().toISOString()
    };

    this.cache.set(cacheKey, result);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return result;
  }

  async modelEfficiencyComparison(period = '30d') {
    const cacheKey = `model_efficiency_${period}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const startDate = this._getPeriodStartDate(period);
    const results = await this.fetch(
      `/api_usage?created_at=gte.${encodeURIComponent(startDate)}&select=model_id,total_cost,total_tokens,inference_count,quality_score`
    );

    const modelMap = new Map();
    results.forEach(r => {
      if (!modelMap.has(r.model_id)) {
        modelMap.set(r.model_id, {
          totalCost: 0,
          totalTokens: 0,
          inferenceCount: 0,
          qualityScore: r.quality_score || 0
        });
      }
      const model = modelMap.get(r.model_id);
      model.totalCost += r.total_cost || 0;
      model.totalTokens += r.total_tokens || 0;
      model.inferenceCount += r.inference_count || 0;
    });

    const efficiencyMetrics = Array.from(modelMap.entries()).map(([modelId, data]) => {
      const costPerToken = data.totalTokens > 0 ? data.totalCost / data.totalTokens : 0;
      const costPerInference = data.inferenceCount > 0 ? data.totalCost / data.inferenceCount : 0;
      const efficiencyScore = data.qualityScore > 0
        ? (data.qualityScore / (costPerInference + 0.0001)) * 100
        : 0;

      return {
        modelId,
        costPerToken: parseFloat(costPerToken.toFixed(8)),
        costPerInference: parseFloat(costPerInference.toFixed(6)),
        totalCost: parseFloat(data.totalCost.toFixed(2)),
        inferenceCount: data.inferenceCount,
        qualityScore: parseFloat(data.qualityScore.toFixed(2)),
        efficiencyScore: parseFloat(efficiencyScore.toFixed(2))
      };
    });

    const result = {
      period,
      models: efficiencyMetrics.sort((a, b) => b.efficiencyScore - a.efficiencyScore),
      bestModel: efficiencyMetrics.length > 0 ? efficiencyMetrics[0].modelId : null,
      averageEfficiencyScore: parseFloat(
        (efficiencyMetrics.reduce((sum, m) => sum + m.efficiencyScore, 0) / efficiencyMetrics.length).toFixed(2)
      ),
      timestamp: new Date().toISOString()
    };

    this.cache.set(cacheKey, result);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return result;
  }

  async trendAnalysis(modelId, metric, period = '90d', granularity = 'daily') {
    const cacheKey = `trend_${modelId}_${metric}_${period}_${granularity}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const startDate = this._getPeriodStartDate(period);
    const results = await this.fetch(
      `/api_usage?model_id=eq.${encodeURIComponent(modelId)}&created_at=gte.${encodeURIComponent(startDate)}&select=created_at,total_cost,total_tokens,inference_count,quality_score&order=created_at.asc`
    );

    const buckets = this._bucketByGranularity(results, granularity);
    const trendPoints = buckets.map(bucket => {
      const totalCost = bucket.reduce((sum, r) => sum + (r.total_cost || 0), 0);
      const totalTokens = bucket.reduce((sum, r) => sum + (r.total_tokens || 0), 0);
      const inferenceCount = bucket.reduce((sum, r) => sum + (r.inference_count || 0), 0);

      let value = 0;
      switch (metric) {
        case UNIT_ECONOMICS_METRICS.COST_PER_TOKEN:
          value = totalTokens > 0 ? totalCost / totalTokens : 0;
          break;
        case UNIT_ECONOMICS_METRICS.COST_PER_INFERENCE:
          value = inferenceCount > 0 ? totalCost / inferenceCount : 0;
          break;
        case 'total_cost':
          value = totalCost;
          break;
        case 'inference_count':
          value = inferenceCount;
          break;
      }

      return {
        timestamp: bucket[0].created_at,
        value: parseFloat(value.toFixed(8))
      };
    });

    const values = trendPoints.map(p => p.value);
    const trend = this._calculateTrend(values);
    const forecast = this._forecastTrend(values);

    const result = {
      modelId,
      metric,
      period,
      granularity,
      trendPoints,
      trend,
      forecast,
      min: parseFloat(Math.min(...values).toFixed(8)),
      max: parseFloat(Math.max(...values).toFixed(8)),
      avg: parseFloat((values.reduce((a, b) => a + b, 0) / values.length).toFixed(8)),
      timestamp: new Date().toISOString()
    };

    this.cache.set(cacheKey, result);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return result;
  }

  _getPeriodStartDate(period) {
    const now = new Date();
    const days = parseInt(period) || 30;
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return startDate.toISOString().split('T')[0];
  }

  _bucketByGranularity(results, granularity) {
    const buckets = [];
    let currentBucket = [];
    let currentTimestamp = null;

    results.forEach(result => {
      const resultDate = new Date(result.created_at);
      const bucketDate = new Date(resultDate);

      if (granularity === 'daily') {
        bucketDate.setHours(0, 0, 0, 0);
      } else if (granularity === 'weekly') {
        bucketDate.setDate(bucketDate.getDate() - bucketDate.getDay());
        bucketDate.setHours(0, 0, 0, 0);
      } else if (granularity === 'monthly') {
        bucketDate.setDate(1);
        bucketDate.setHours(0, 0, 0, 0);
      }

      const bucketTimestamp = bucketDate.toISOString();
      if (currentTimestamp !== bucketTimestamp && currentBucket.length > 0) {
        buckets.push(currentBucket);
        currentBucket = [];
      }

      currentTimestamp = bucketTimestamp;
      currentBucket.push(result);
    });

    if (currentBucket.length > 0) {
      buckets.push(currentBucket);
    }

    return buckets;
  }

  _calculateTrend(values) {
    if (values.length < 2) return 'stable';

    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const change = ((secondAvg - firstAvg) / firstAvg) * 100;

    if (change > 5) return 'increasing';
    if (change < -5) return 'decreasing';
    return 'stable';
  }

  _forecastTrend(values) {
    if (values.length < 3) return values[values.length - 1];

    const lastThree = values.slice(-3);
    const trend = (lastThree[2] - lastThree[0]) / 2;
    return parseFloat((values[values.length - 1] + trend).toFixed(8));
  }
}

// ============================================================================
// CLASS: ROIAnalyzer
// ============================================================================

class ROIAnalyzer {
  constructor(env, options = {}) {
    this.env = env;
    this.supabaseUrl = options.supabaseUrl || env.SUPABASE_URL;
    this.supabaseKey = options.supabaseKey || env.SUPABASE_ANON_KEY;
    this.cacheExpiry = options.cacheExpiry || 3600000;
    this.logger = options.logger || new DiamondLogger('ROIAnalyzer');
    this.circuitBreaker = options.circuitBreaker || new CircuitBreaker({
      failureThreshold: 10,
      resetTimeout: 60000
    });
    this.cache = new Map();
  }

  async fetch(endpoint, options = {}) {
    const url = `${this.supabaseUrl}/rest/v1${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation'
    };

    const response = await resilientFetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      timeout: 15000,
      maxRetries: 2,
      circuitBreaker: this.circuitBreaker
    });

    if (!response.ok) {
      throw new Error(`Supabase API error: ${response.statusText}`);
    }

    return response.json();
  }

  async perModelROI(period = '90d') {
    const cacheKey = `model_roi_${period}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const startDate = this._getPeriodStartDate(period);
    const results = await this.fetch(
      `/model_roi_metrics?created_at=gte.${encodeURIComponent(startDate)}&select=model_id,total_cost,revenue_attributed,cost_savings,user_efficiency_gain`
    );

    const modelROIs = results.map(r => {
      const totalBenefit = (r.revenue_attributed || 0) + (r.cost_savings || 0) + (r.user_efficiency_gain || 0);
      const roi = r.total_cost > 0 ? ((totalBenefit - r.total_cost) / r.total_cost) * 100 : 0;
      const paybackPeriodDays = r.revenue_attributed > 0
        ? Math.ceil((r.total_cost / r.revenue_attributed) * 30)
        : null;

      return {
        modelId: r.model_id,
        totalCost: parseFloat((r.total_cost || 0).toFixed(2)),
        revenueAttributed: parseFloat((r.revenue_attributed || 0).toFixed(2)),
        costSavings: parseFloat((r.cost_savings || 0).toFixed(2)),
        userEfficiencyGain: parseFloat((r.user_efficiency_gain || 0).toFixed(2)),
        totalBenefit: parseFloat(totalBenefit.toFixed(2)),
        roi: parseFloat(roi.toFixed(2)),
        paybackPeriodDays
      };
    });

    const result = {
      period,
      models: modelROIs.sort((a, b) => b.roi - a.roi),
      totalCost: parseFloat(modelROIs.reduce((sum, m) => sum + m.totalCost, 0).toFixed(2)),
      totalRevenue: parseFloat(modelROIs.reduce((sum, m) => sum + m.revenueAttributed, 0).toFixed(2)),
      portfolioROI: parseFloat(
        (modelROIs.reduce((sum, m) => sum + m.roi, 0) / (modelROIs.length || 1)).toFixed(2)
      ),
      timestamp: new Date().toISOString()
    };

    this.cache.set(cacheKey, result);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return result;
  }

  async businessOutcomeAttribution(departmentId, period = '90d') {
    const cacheKey = `outcome_attribution_${departmentId}_${period}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const startDate = this._getPeriodStartDate(period);
    const results = await this.fetch(
      `/business_outcomes?department_id=eq.${encodeURIComponent(departmentId)}&created_at=gte.${encodeURIComponent(startDate)}&select=outcome_id,outcome_type,ai_contribution_percent,monetary_value,time_saved_hours,quality_improvement`
    );

    const outcomes = results.map(r => ({
      outcomeId: r.outcome_id,
      outcomeType: r.outcome_type,
      aiContributionPercent: parseFloat((r.ai_contribution_percent || 0).toFixed(2)),
      monetaryValue: parseFloat((r.monetary_value || 0).toFixed(2)),
      timeSavedHours: parseFloat((r.time_saved_hours || 0).toFixed(2)),
      qualityImprovement: parseFloat((r.quality_improvement || 0).toFixed(2))
    }));

    const result = {
      departmentId,
      period,
      outcomes,
      totalMonetaryValue: parseFloat(outcomes.reduce((sum, o) => sum + o.monetaryValue, 0).toFixed(2)),
      totalTimeSavedHours: parseFloat(outcomes.reduce((sum, o) => sum + o.timeSavedHours, 0).toFixed(2)),
      avgAIContribution: parseFloat(
        (outcomes.reduce((sum, o) => sum + o.aiContributionPercent, 0) / (outcomes.length || 1)).toFixed(2)
      ),
      timestamp: new Date().toISOString()
    };

    this.cache.set(cacheKey, result);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return result;
  }

  async roiDashboardData(period = '90d') {
    const cacheKey = `roi_dashboard_${period}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const [modelROI, outcomes] = await Promise.all([
      this.perModelROI(period),
      this.fetch(`/roi_summary?created_at=gte.${encodeURIComponent(this._getPeriodStartDate(period))}&select=*`)
    ]);

    const chartData = {
      roiByModel: modelROI.models.map(m => ({
        name: m.modelId,
        roi: m.roi,
        cost: m.totalCost
      })),
      roiTrend: outcomes.map((o, i) => ({
        period: `Month ${i + 1}`,
        roi: parseFloat((o.monthly_roi || 0).toFixed(2))
      }))
    };

    const result = {
      period,
      portfolioMetrics: {
        totalROI: modelROI.portfolioROI,
        totalInvestment: modelROI.totalCost,
        totalReturn: modelROI.totalRevenue,
        paybackPeriodDays: Math.ceil(modelROI.totalCost / (modelROI.totalRevenue / 30))
      },
      chartData,
      topPerformingModel: modelROI.models[0] || null,
      timestamp: new Date().toISOString()
    };

    this.cache.set(cacheKey, result);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return result;
  }

  async investmentToReturnTracking(startDate, endDate) {
    const cacheKey = `investment_return_${startDate}_${endDate}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const results = await this.fetch(
      `/investment_tracking?created_at=gte.${encodeURIComponent(startDate)}&created_at=lte.${encodeURIComponent(endDate)}&select=investment_date,investment_amount,model_id,return_date,return_amount,return_type`
    );

    const investments = [];
    const investmentMap = new Map();

    results.forEach(r => {
      if (!investmentMap.has(r.model_id)) {
        investmentMap.set(r.model_id, {
          modelId: r.model_id,
          investments: [],
          returns: []
        });
      }

      const tracker = investmentMap.get(r.model_id);
      if (r.investment_date) {
        tracker.investments.push({
          date: r.investment_date,
          amount: r.investment_amount
        });
      }
      if (r.return_date) {
        tracker.returns.push({
          date: r.return_date,
          amount: r.return_amount,
          type: r.return_type
        });
      }
    });

    investmentMap.forEach((tracker, modelId) => {
      const totalInvested = tracker.investments.reduce((sum, i) => sum + i.amount, 0);
      const totalReturned = tracker.returns.reduce((sum, r) => sum + r.amount, 0);
      const roi = totalInvested > 0 ? ((totalReturned - totalInvested) / totalInvested) * 100 : 0;

      investments.push({
        modelId,
        totalInvested: parseFloat(totalInvested.toFixed(2)),
        totalReturned: parseFloat(totalReturned.toFixed(2)),
        roi: parseFloat(roi.toFixed(2)),
        investmentCount: tracker.investments.length,
        returnCount: tracker.returns.length,
        avgTimeToReturn: this._calculateAvgTimeToReturn(tracker.investments, tracker.returns)
      });
    });

    const result = {
      period: `${startDate} to ${endDate}`,
      investments: investments.sort((a, b) => b.roi - a.roi),
      totalPortfolioInvestment: parseFloat(investments.reduce((sum, i) => sum + i.totalInvested, 0).toFixed(2)),
      totalPortfolioReturn: parseFloat(investments.reduce((sum, i) => sum + i.totalReturned, 0).toFixed(2)),
      timestamp: new Date().toISOString()
    };

    this.cache.set(cacheKey, result);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return result;
  }

  async paybackPeriodAnalysis(modelId, period = '180d') {
    const cacheKey = `payback_period_${modelId}_${period}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const startDate = this._getPeriodStartDate(period);
    const results = await this.fetch(
      `/payback_tracking?model_id=eq.${encodeURIComponent(modelId)}&created_at=gte.${encodeURIComponent(startDate)}&select=created_at,cumulative_cost,cumulative_revenue&order=created_at.asc`
    );

    let paybackDate = null;
    let paybackDays = null;

    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1];
      const curr = results[i];

      if (prev.cumulative_cost > prev.cumulative_revenue && curr.cumulative_cost <= curr.cumulative_revenue) {
        paybackDate = curr.created_at;
        const startDateObj = new Date(results[0].created_at);
        const paybackDateObj = new Date(paybackDate);
        paybackDays = Math.ceil((paybackDateObj - startDateObj) / (1000 * 60 * 60 * 24));
        break;
      }
    }

    const result = {
      modelId,
      period,
      paybackDate,
      paybackDays,
      hasAchievedPayback: paybackDate !== null,
      trajectory: results.map(r => ({
        date: r.created_at,
        cumulativeCost: parseFloat((r.cumulative_cost || 0).toFixed(2)),
        cumulativeRevenue: parseFloat((r.cumulative_revenue || 0).toFixed(2)),
        netProfit: parseFloat(((r.cumulative_revenue || 0) - (r.cumulative_cost || 0)).toFixed(2))
      })),
      timestamp: new Date().toISOString()
    };

    this.cache.set(cacheKey, result);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return result;
  }

  _getPeriodStartDate(period) {
    const now = new Date();
    const days = parseInt(period) || 90;
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return startDate.toISOString().split('T')[0];
  }

  _calculateAvgTimeToReturn(investments, returns) {
    if (investments.length === 0 || returns.length === 0) return null;

    let totalDays = 0;
    let matchCount = 0;

    investments.forEach(inv => {
      const investDate = new Date(inv.date);
      const matchedReturns = returns.filter(ret => new Date(ret.date) > investDate);

      if (matchedReturns.length > 0) {
        const daysToReturn = (new Date(matchedReturns[0].date) - investDate) / (1000 * 60 * 60 * 24);
        totalDays += daysToReturn;
        matchCount++;
      }
    });

    return matchCount > 0 ? Math.ceil(totalDays / matchCount) : null;
  }
}

// ============================================================================
// CLASS: BoardReportGenerator
// ============================================================================

class BoardReportGenerator {
  constructor(env, options = {}) {
    this.env = env;
    this.supabaseUrl = options.supabaseUrl || env.SUPABASE_URL;
    this.supabaseKey = options.supabaseKey || env.SUPABASE_ANON_KEY;
    this.reportBrand = options.reportBrand || 'Finault';
    this.cacheExpiry = options.cacheExpiry || 3600000;
    this.logger = options.logger || new DiamondLogger('BoardReportGenerator');
    this.circuitBreaker = options.circuitBreaker || new CircuitBreaker({
      failureThreshold: 10,
      resetTimeout: 60000
    });
    this.cache = new Map();
  }

  async fetch(endpoint, options = {}) {
    const url = `${this.supabaseUrl}/rest/v1${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation'
    };

    const response = await resilientFetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      timeout: 15000,
      maxRetries: 2,
      circuitBreaker: this.circuitBreaker
    });

    if (!response.ok) {
      throw new Error(`Supabase API error: ${response.statusText}`);
    }

    return response.json();
  }

  async generateBoardReport(period = '30d', department = null) {
    const cacheKey = `board_report_${period}_${department || 'all'}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const startDate = this._getPeriodStartDate(period);
    let query = `/board_metrics?created_at=gte.${encodeURIComponent(startDate)}&select=*`;
    if (department) {
      query += `&department_id=eq.${encodeURIComponent(department)}`;
    }

    const metrics = await this.fetch(query);

    const report = {
      title: `${this.reportBrand} AI Spend Board Report`,
      period,
      department,
      generatedAt: new Date().toISOString(),
      sections: {}
    };

    // Executive Summary
    const totalSpend = metrics.reduce((sum, m) => sum + (m.total_spend || 0), 0);
    const totalRevenue = metrics.reduce((sum, m) => sum + (m.attributed_revenue || 0), 0);
    const yoyGrowth = metrics.length > 0 ? metrics[0].yoy_growth || 0 : 0;

    report.sections.executive_summary = {
      title: 'Executive Summary',
      content: `AI spending for the period totaled $${parseFloat(totalSpend.toFixed(2)).toLocaleString()} with an attributed revenue impact of $${parseFloat(totalRevenue.toFixed(2)).toLocaleString()}. Year-over-year growth stands at ${parseFloat(yoyGrowth.toFixed(1))}%.`,
      keyMetrics: {
        totalSpend: parseFloat(totalSpend.toFixed(2)),
        attributedRevenue: parseFloat(totalRevenue.toFixed(2)),
        yoyGrowth: parseFloat(yoyGrowth.toFixed(2))
      }
    };

    // Spend Overview
    const spendByCategory = this._aggregateByCategory(metrics, 'category');
    report.sections.spend_overview = {
      title: 'AI Spend Overview',
      chartData: {
        type: 'pie',
        data: spendByCategory
      },
      totalSpend: parseFloat(totalSpend.toFixed(2)),
      spendByCategory
    };

    // Departmental Breakdown
    const spendByDept = this._aggregateByCategory(metrics, 'department_id');
    report.sections.departmental_breakdown = {
      title: 'Departmental AI Spend Breakdown',
      chartData: {
        type: 'bar',
        data: spendByDept
      },
      departments: spendByDept
    };

    // Model Performance
    const modelMetrics = this._aggregateByCategory(metrics, 'model_id');
    report.sections.model_performance = {
      title: 'Model Performance Analysis',
      models: modelMetrics.map(m => ({
        modelId: m.category,
        spend: m.value,
        roi: m.roi || 0,
        usageCount: m.usage_count || 0,
        quality: m.quality_score || 0
      }))
    };

    // ROI Analysis
    const portfolio_roi = metrics.length > 0
      ? metrics.reduce((sum, m) => sum + (m.model_roi || 0), 0) / metrics.length
      : 0;

    report.sections.roi_analysis = {
      title: 'Return on AI Investment',
      portfolioROI: parseFloat(portfolio_roi.toFixed(2)),
      bestPerformingModel: modelMetrics.length > 0 ? modelMetrics[0].category : 'N/A',
      topROIs: modelMetrics.slice(0, 5)
    };

    // Risk Assessment
    const risks = this._identifyRisks(metrics);
    report.sections.risk_assessment = {
      title: 'Risk Assessment',
      risks,
      overallRiskLevel: risks.length > 0 ? 'medium' : 'low'
    };

    // Optimization Opportunities
    const opportunities = this._identifyOpportunities(metrics);
    report.sections.optimization_opportunities = {
      title: 'Optimization Opportunities',
      opportunities,
      potentialSavings: opportunities.reduce((sum, o) => sum + (o.potentialSavings || 0), 0)
    };

    // Market Comparison
    report.sections.market_comparison = {
      title: 'Market Positioning',
      industryBenchmark: {
        spend_per_employee: parseFloat((totalSpend / 100).toFixed(2)), // Placeholder calculation
        industry_median: 150.00,
        percentile: 45
      }
    };

    // Recommendations
    report.sections.recommendations = {
      title: 'Strategic Recommendations',
      recommendations: [
        { priority: 'high', action: 'Consolidate on top-performing models', impact: 'Reduce costs by 15-20%' },
        { priority: 'medium', action: 'Implement usage governance policies', impact: 'Improve budget predictability' },
        { priority: 'medium', action: 'Expand ROI-positive use cases', impact: 'Increase business value capture' }
      ]
    };

    this.cache.set(cacheKey, report);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return report;
  }

  async pdfExportData(period = '30d') {
    const cacheKey = `pdf_export_${period}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const report = await this.generateBoardReport(period);

    const pdfData = {
      metadata: {
        title: report.title,
        author: this.reportBrand,
        createdDate: new Date().toISOString(),
        period: report.period
      },
      pages: [
        {
          pageNumber: 1,
          title: 'Cover Page',
          content: {
            heading: report.title,
            period: `Report Period: ${period}`,
            generatedDate: new Date().toLocaleDateString()
          }
        },
        {
          pageNumber: 2,
          title: 'Executive Summary',
          content: report.sections.executive_summary
        },
        {
          pageNumber: 3,
          title: 'Spend Overview',
          content: report.sections.spend_overview
        },
        {
          pageNumber: 4,
          title: 'Departmental Breakdown',
          content: report.sections.departmental_breakdown
        },
        {
          pageNumber: 5,
          title: 'Model Performance',
          content: report.sections.model_performance
        },
        {
          pageNumber: 6,
          title: 'ROI Analysis',
          content: report.sections.roi_analysis
        },
        {
          pageNumber: 7,
          title: 'Risk Assessment',
          content: report.sections.risk_assessment
        },
        {
          pageNumber: 8,
          title: 'Optimization Opportunities',
          content: report.sections.optimization_opportunities
        },
        {
          pageNumber: 9,
          title: 'Recommendations',
          content: report.sections.recommendations
        }
      ],
      documentSettings: {
        pageSize: 'A4',
        margins: { top: 1, right: 0.75, bottom: 1, left: 0.75 },
        fontFamily: 'Helvetica',
        colorScheme: 'professional'
      }
    };

    this.cache.set(cacheKey, pdfData);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return pdfData;
  }

  async periodComparison(currentPeriod = '30d', previousPeriod = '60d') {
    const cacheKey = `period_comparison_${currentPeriod}_${previousPeriod}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const [current, previous] = await Promise.all([
      this.generateBoardReport(currentPeriod),
      this.generateBoardReport(previousPeriod)
    ]);

    const currentSpend = current.sections.spend_overview.totalSpend;
    const previousSpend = previous.sections.spend_overview.totalSpend;
    const spendChange = ((currentSpend - previousSpend) / previousSpend) * 100;

    const comparison = {
      currentPeriod: {
        period: currentPeriod,
        totalSpend: currentSpend,
        roi: current.sections.roi_analysis.portfolioROI
      },
      previousPeriod: {
        period: previousPeriod,
        totalSpend: previousSpend,
        roi: previous.sections.roi_analysis.portfolioROI
      },
      changes: {
        spendChange: parseFloat(spendChange.toFixed(2)),
        roiChange: parseFloat((current.sections.roi_analysis.portfolioROI - previous.sections.roi_analysis.portfolioROI).toFixed(2)),
        trend: spendChange > 5 ? 'increasing' : spendChange < -5 ? 'decreasing' : 'stable'
      },
      timestamp: new Date().toISOString()
    };

    this.cache.set(cacheKey, comparison);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return comparison;
  }

  _getPeriodStartDate(period) {
    const now = new Date();
    const days = parseInt(period) || 30;
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return startDate.toISOString().split('T')[0];
  }

  _aggregateByCategory(metrics, categoryField) {
    const categoryMap = new Map();

    metrics.forEach(m => {
      const category = m[categoryField] || 'Unknown';
      if (!categoryMap.has(category)) {
        categoryMap.set(category, {
          category,
          value: 0,
          roi: 0,
          usage_count: 0,
          quality_score: 0
        });
      }

      const cat = categoryMap.get(category);
      cat.value += m.total_spend || 0;
      cat.roi = (cat.roi + (m.model_roi || 0)) / 2;
      cat.usage_count += m.usage_count || 0;
      cat.quality_score = (cat.quality_score + (m.quality_score || 0)) / 2;
    });

    return Array.from(categoryMap.values()).sort((a, b) => b.value - a.value);
  }

  _identifyRisks(metrics) {
    const risks = [];

    const avgSpend = metrics.reduce((sum, m) => sum + (m.total_spend || 0), 0) / (metrics.length || 1);
    const outliers = metrics.filter(m => (m.total_spend || 0) > avgSpend * 1.5);

    if (outliers.length > 0) {
      risks.push({
        level: 'medium',
        title: 'Spend Outliers Detected',
        description: `${outliers.length} departments have significantly above-average spend.`,
        affectedDepartments: outliers.slice(0, 3).map(o => o.department_id)
      });
    }

    const underutilized = metrics.filter(m => (m.usage_count || 0) < 10 && (m.total_spend || 0) > 100);
    if (underutilized.length > 0) {
      risks.push({
        level: 'low',
        title: 'Underutilized Models',
        description: 'Some models have low usage relative to cost.',
        affectedModels: underutilized.slice(0, 2).map(u => u.model_id)
      });
    }

    return risks;
  }

  _identifyOpportunities(metrics) {
    const opportunities = [];

    const highROIModels = metrics.filter(m => (m.model_roi || 0) > 200).slice(0, 3);
    if (highROIModels.length > 0) {
      opportunities.push({
        title: 'Expand High-ROI Models',
        description: 'Increase usage of top-performing models.',
        potentialSavings: highROIModels.reduce((sum, m) => sum + ((m.total_spend || 0) * 0.2), 0)
      });
    }

    const inefficientModels = metrics.filter(m => (m.model_roi || 0) < 50);
    if (inefficientModels.length > 0) {
      opportunities.push({
        title: 'Consolidate Low-ROI Models',
        description: 'Consider replacing with more efficient alternatives.',
        potentialSavings: inefficientModels.reduce((sum, m) => sum + ((m.total_spend || 0) * 0.3), 0)
      });
    }

    return opportunities;
  }
}

// ============================================================================
// CLASS: FinOpsMaturityAssessor
// ============================================================================

class FinOpsMaturityAssessor {
  constructor(env, options = {}) {
    this.env = env;
    this.supabaseUrl = options.supabaseUrl || env.SUPABASE_URL;
    this.supabaseKey = options.supabaseKey || env.SUPABASE_ANON_KEY;
    this.cacheExpiry = options.cacheExpiry || 3600000;
    this.logger = options.logger || new DiamondLogger('FinOpsMaturityAssessor');
    this.circuitBreaker = options.circuitBreaker || new CircuitBreaker({
      failureThreshold: 10,
      resetTimeout: 60000
    });
    this.cache = new Map();
  }

  async fetch(endpoint, options = {}) {
    const url = `${this.supabaseUrl}/rest/v1${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation'
    };

    const response = await resilientFetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      timeout: 15000,
      maxRetries: 2,
      circuitBreaker: this.circuitBreaker
    });

    if (!response.ok) {
      throw new Error(`Supabase API error: ${response.statusText}`);
    }

    return response.json();
  }

  async assessMaturity(organizationId) {
    const cacheKey = `finops_maturity_${organizationId}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const results = await this.fetch(
      `/finops_assessment?organization_id=eq.${encodeURIComponent(organizationId)}&select=*`
    );

    const assessment = {
      organizationId,
      assessmentDate: new Date().toISOString(),
      domains: []
    };

    // Crawl level (basic)
    const crawlLevel = {
      name: 'Crawl',
      description: 'Foundation - Basic awareness and initial data collection',
      score: 1,
      subdomains: [
        {
          name: 'Cost Attribution',
          score: this._calculateScore(results, 'cost_attribution_crawl'),
          capabilities: ['Tag-based cost allocation', 'Monthly spend reporting', 'Basic departmental breakdown']
        },
        {
          name: 'Cost Analysis',
          score: this._calculateScore(results, 'cost_analysis_crawl'),
          capabilities: ['Current spend visibility', 'Simple trend analysis', 'Model cost comparison']
        },
        {
          name: 'Chargeback Models',
          score: this._calculateScore(results, 'chargeback_crawl'),
          capabilities: ['Manual cost allocation', 'Ad-hoc invoicing', 'Department-level tracking']
        }
      ]
    };

    // Walk level (intermediate)
    const walkLevel = {
      name: 'Walk',
      description: 'Intermediate - Consistent processes and optimization initiatives',
      score: 2,
      subdomains: [
        {
          name: 'Resource Right-Sizing',
          score: this._calculateScore(results, 'resource_rightsizing_walk'),
          capabilities: ['Model performance analysis', 'Usage patterns identification', 'Quarterly optimization reviews']
        },
        {
          name: 'Model Selection',
          score: this._calculateScore(results, 'model_selection_walk'),
          capabilities: ['Model comparison frameworks', 'Cost-benefit analysis', 'Procurement guidelines']
        },
        {
          name: 'Compute Optimization',
          score: this._calculateScore(results, 'compute_optimization_walk'),
          capabilities: ['Batch processing optimization', 'Token efficiency tracking', 'Load balancing awareness']
        }
      ]
    };

    // Run level (advanced)
    const runLevel = {
      name: 'Run',
      description: 'Advanced - Fully automated processes and continuous optimization',
      score: 3,
      subdomains: [
        {
          name: 'Budget Controls',
          score: this._calculateScore(results, 'budget_controls_run'),
          capabilities: ['Automated budget enforcement', 'Real-time alerts', 'Predictive spending']
        },
        {
          name: 'Usage Policies',
          score: this._calculateScore(results, 'usage_policies_run'),
          capabilities: ['Automated policy enforcement', 'Dynamic guardrails', 'Governance automation']
        },
        {
          name: 'Automated Remediation',
          score: this._calculateScore(results, 'automated_remediation_run'),
          capabilities: ['Auto-scaling', 'Anomaly detection and correction', 'Self-healing systems']
        }
      ]
    };

    const allSubdomains = [
      ...crawlLevel.subdomains,
      ...walkLevel.subdomains,
      ...runLevel.subdomains
    ];

    const overallScore = (crawlLevel.subdomains.reduce((sum, s) => sum + s.score, 0) +
                         walkLevel.subdomains.reduce((sum, s) => sum + s.score, 0) +
                         runLevel.subdomains.reduce((sum, s) => sum + s.score, 0)) / 9;

    assessment.domains = [crawlLevel, walkLevel, runLevel];
    assessment.overallMaturityScore = parseFloat(overallScore.toFixed(2));
    assessment.maturityLevel = this._determineMaturityLevel(overallScore);
    assessment.allSubdomains = allSubdomains;

    this.cache.set(cacheKey, assessment);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return assessment;
  }

  async improvementRoadmap(organizationId, targetLevel = 'Run') {
    const cacheKey = `improvement_roadmap_${organizationId}_${targetLevel}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const assessment = await this.assessMaturity(organizationId);
    const roadmap = {
      organizationId,
      currentLevel: assessment.maturityLevel,
      targetLevel,
      roadmapItems: [],
      estimatedTimelineMonths: 0
    };

    const gaps = assessment.domains.reduce((acc, domain) => {
      return acc.concat(domain.subdomains.filter(s => s.score < 3).map(s => ({
        domain: domain.name,
        subdomain: s.name,
        currentScore: s.score,
        targetScore: 3
      })));
    }, []);

    let totalMonths = 0;
    gaps.forEach((gap, index) => {
      const months = (gap.targetScore - gap.currentScore) * 3;
      const priority = index < 3 ? 'high' : index < 6 ? 'medium' : 'low';

      roadmap.roadmapItems.push({
        priority,
        domain: gap.domain,
        subdomain: gap.subdomain,
        currentScore: gap.currentScore,
        targetScore: gap.targetScore,
        estimatedMonths: months,
        q: Math.ceil((index + 1) / 3),
        actions: this._generateActions(gap.subdomain, gap.currentScore),
        successCriteria: this._generateSuccessCriteria(gap.subdomain, gap.targetScore)
      });

      totalMonths = Math.max(totalMonths, months);
    });

    roadmap.roadmapItems = roadmap.roadmapItems.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    roadmap.estimatedTimelineMonths = totalMonths;

    this.cache.set(cacheKey, roadmap);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return roadmap;
  }

  _calculateScore(results, field) {
    if (results.length === 0) return 0;
    const scores = results.map(r => r[field] || 0);
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }

  _determineMaturityLevel(score) {
    if (score < 1.5) return 'Crawl';
    if (score < 2.5) return 'Walk';
    return 'Run';
  }

  _generateActions(subdomain, currentScore) {
    const actionMap = {
      'Cost Attribution': [
        'Implement tagging strategy for all AI workloads',
        'Establish cost allocation rules by department',
        'Deploy cost tracking dashboards'
      ],
      'Cost Analysis': [
        'Build spend trend analysis capabilities',
        'Create model cost comparison tools',
        'Establish monthly review cadence'
      ],
      'Budget Controls': [
        'Implement budget alerts and notifications',
        'Set up spending limits by team/project',
        'Create approval workflows for large spends'
      ],
      'Usage Policies': [
        'Define AI usage guidelines',
        'Create model selection standards',
        'Establish governance reviews'
      ]
    };

    return actionMap[subdomain] || ['Assess current state', 'Define target processes', 'Implement automation'];
  }

  _generateSuccessCriteria(subdomain, targetScore) {
    if (targetScore >= 3) {
      return [
        'Automated cost tracking in real-time',
        'Self-healing systems with auto-remediation',
        '95%+ compliance with policies',
        'Zero unbudgeted spend incidents'
      ];
    }
    return [
      'All AI workloads have cost visibility',
      'Monthly spend reports are accurate',
      'Cost trends are clearly understood'
    ];
  }
}

// ============================================================================
// CLASS: BenchmarkEngine
// ============================================================================

class BenchmarkEngine {
  constructor(env, options = {}) {
    this.env = env;
    this.supabaseUrl = options.supabaseUrl || env.SUPABASE_URL;
    this.supabaseKey = options.supabaseKey || env.SUPABASE_ANON_KEY;
    this.cacheExpiry = options.cacheExpiry || 3600000;
    this.logger = options.logger || new DiamondLogger('BenchmarkEngine');
    this.circuitBreaker = options.circuitBreaker || new CircuitBreaker({
      failureThreshold: 10,
      resetTimeout: 60000
    });
    this.cache = new Map();
  }

  async fetch(endpoint, options = {}) {
    const url = `${this.supabaseUrl}/rest/v1${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation'
    };

    const response = await resilientFetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      timeout: 15000,
      maxRetries: 2,
      circuitBreaker: this.circuitBreaker
    });

    if (!response.ok) {
      throw new Error(`Supabase API error: ${response.statusText}`);
    }

    return response.json();
  }

  async aggregateAnonymizedData(period = '90d') {
    const cacheKey = `anonymized_benchmark_${period}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const startDate = this._getPeriodStartDate(period);
    const results = await this.fetch(
      `/benchmark_data?created_at=gte.${encodeURIComponent(startDate)}&select=organization_id,industry,company_size,spend,revenue,employee_count,model_usage`
    );

    const aggregated = {
      period,
      dataPoints: results.length,
      industryBenchmarks: {},
      companySizeBenchmarks: {},
      overallMetrics: {}
    };

    // Industry benchmarks
    BENCHMARK_INDUSTRIES.forEach(industry => {
      const industryData = results.filter(r => r.industry === industry);
      if (industryData.length > 0) {
        const spendPerEmployee = industryData.map(d => (d.spend || 0) / (d.employee_count || 1));
        const avgSpend = spendPerEmployee.reduce((a, b) => a + b, 0) / spendPerEmployee.length;

        aggregated.industryBenchmarks[industry] = {
          count: industryData.length,
          avgSpendPerEmployee: parseFloat(avgSpend.toFixed(2)),
          medianSpendPerEmployee: this._median(spendPerEmployee),
          p25: this._percentile(spendPerEmployee, 25),
          p75: this._percentile(spendPerEmployee, 75),
          totalSpend: parseFloat(industryData.reduce((sum, d) => sum + (d.spend || 0), 0).toFixed(2))
        };
      }
    });

    // Company size benchmarks
    const sizeCategories = ['startup', 'mid_market', 'enterprise'];
    sizeCategories.forEach(size => {
      const sizeData = results.filter(r => {
        const employeeCount = r.employee_count || 0;
        if (size === 'startup') return employeeCount < 100;
        if (size === 'mid_market') return employeeCount >= 100 && employeeCount < 1000;
        return employeeCount >= 1000;
      });

      if (sizeData.length > 0) {
        const spendMetrics = sizeData.map(d => d.spend || 0);
        aggregated.companySizeBenchmarks[size] = {
          count: sizeData.length,
          avgSpend: parseFloat((spendMetrics.reduce((a, b) => a + b, 0) / sizeData.length).toFixed(2)),
          medianSpend: this._median(spendMetrics),
          p25: this._percentile(spendMetrics, 25),
          p75: this._percentile(spendMetrics, 75)
        };
      }
    });

    // Overall metrics
    const allSpends = results.map(r => r.spend || 0);
    const allEmployeeCounts = results.map(r => r.employee_count || 1);
    const spendPerEmployees = allSpends.map((spend, i) => spend / allEmployeeCounts[i]);

    aggregated.overallMetrics = {
      avgSpendPerEmployee: parseFloat((spendPerEmployees.reduce((a, b) => a + b, 0) / spendPerEmployees.length).toFixed(2)),
      medianSpendPerEmployee: this._median(spendPerEmployees),
      avgTotalSpend: parseFloat((allSpends.reduce((a, b) => a + b, 0) / results.length).toFixed(2)),
      medianTotalSpend: this._median(allSpends)
    };

    this.cache.set(cacheKey, aggregated);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return aggregated;
  }

  async percentileRanking(organizationId, period = '90d') {
    const cacheKey = `percentile_ranking_${organizationId}_${period}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const [benchmarks, orgData] = await Promise.all([
      this.aggregateAnonymizedData(period),
      this.fetch(`/organizations?id=eq.${encodeURIComponent(organizationId)}&select=industry,company_size,employee_count,spend`)
    ]);

    if (orgData.length === 0) {
      throw new Error('Organization not found');
    }

    const org = orgData[0];
    const spendPerEmployee = org.spend / (org.employee_count || 1);

    const ranking = {
      organizationId,
      period,
      industry: org.industry,
      companySize: org.company_size,
      spend: org.spend,
      spendPerEmployee: parseFloat(spendPerEmployee.toFixed(2)),
      benchmarks: {},
      percentiles: {}
    };

    // Industry comparison
    if (benchmarks.industryBenchmarks[org.industry]) {
      const industryBench = benchmarks.industryBenchmarks[org.industry];
      ranking.benchmarks.industry = industryBench;
      ranking.percentiles.industry = this._calculatePercentile(
        spendPerEmployee,
        industryBench.p25,
        industryBench.medianSpendPerEmployee,
        industryBench.p75
      );
    }

    // Size comparison
    const sizeKey = this._determineSizeCategory(org.employee_count);
    if (benchmarks.companySizeBenchmarks[sizeKey]) {
      const sizeBench = benchmarks.companySizeBenchmarks[sizeKey];
      ranking.benchmarks.size = sizeBench;
      ranking.percentiles.size = this._calculatePercentile(
        org.spend,
        sizeBench.p25,
        sizeBench.medianSpend,
        sizeBench.p75
      );
    }

    // Overall ranking
    ranking.benchmarks.overall = benchmarks.overallMetrics;
    ranking.percentiles.overall = this._calculatePercentile(
      spendPerEmployee,
      benchmarks.overallMetrics.medianSpendPerEmployee * 0.5,
      benchmarks.overallMetrics.medianSpendPerEmployee,
      benchmarks.overallMetrics.medianSpendPerEmployee * 2
    );

    this.cache.set(cacheKey, ranking);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return ranking;
  }

  async industryVerticalComparison(industry, period = '90d') {
    const cacheKey = `vertical_comparison_${industry}_${period}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const benchmarks = await this.aggregateAnonymizedData(period);

    if (!benchmarks.industryBenchmarks[industry]) {
      throw new Error(`No benchmark data available for industry: ${industry}`);
    }

    const industryBench = benchmarks.industryBenchmarks[industry];

    const comparison = {
      industry,
      period,
      benchmarks: industryBench,
      metrics: {
        avgSpendPerEmployee: industryBench.avgSpendPerEmployee,
        medianSpendPerEmployee: industryBench.medianSpendPerEmployee,
        range: {
          min: industryBench.p25,
          max: industryBench.p75
        }
      },
      interpretation: this._interpretBenchmark(industryBench),
      timestamp: new Date().toISOString()
    };

    this.cache.set(cacheKey, comparison);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return comparison;
  }

  async peerGroupAnalysis(organizationId, period = '90d') {
    const cacheKey = `peer_analysis_${organizationId}_${period}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const startDate = this._getPeriodStartDate(period);
    const orgResult = await this.fetch(
      `/organizations?id=eq.${encodeURIComponent(organizationId)}&select=industry,employee_count,spend`
    );

    if (orgResult.length === 0) {
      throw new Error('Organization not found');
    }

    const org = orgResult[0];
    const sizeCategory = this._determineSizeCategory(org.employee_count);

    // Find peer organizations with similar size and industry
    const peerResults = await this.fetch(
      `/benchmark_data?created_at=gte.${encodeURIComponent(startDate)}&select=organization_id,industry,employee_count,spend,roi,model_efficiency`
    );

    const peers = peerResults.filter(p => {
      const peerSize = this._determineSizeCategory(p.employee_count);
      return p.industry === org.industry && peerSize === sizeCategory && p.organization_id !== organizationId;
    }).slice(0, 10);

    const analysis = {
      organizationId,
      period,
      peerCount: peers.length,
      peers: peers.map(p => ({
        organizationId: p.organization_id,
        spend: p.spend,
        spendPerEmployee: parseFloat((p.spend / (p.employee_count || 1)).toFixed(2)),
        roi: p.roi,
        modelEfficiency: p.model_efficiency
      })),
      competitivePosition: {},
      timestamp: new Date().toISOString()
    };

    if (peers.length > 0) {
      const peerSpends = peers.map(p => p.spend);
      const avgPeerSpend = peerSpends.reduce((a, b) => a + b, 0) / peers.length;
      analysis.competitivePosition = {
        yourSpend: org.spend,
        avgPeerSpend: parseFloat(avgPeerSpend.toFixed(2)),
        position: org.spend < avgPeerSpend * 0.8 ? 'Below Average' : org.spend > avgPeerSpend * 1.2 ? 'Above Average' : 'At Average'
      };
    }

    this.cache.set(cacheKey, analysis);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return analysis;
  }

  _getPeriodStartDate(period) {
    const now = new Date();
    const days = parseInt(period) || 90;
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return startDate.toISOString().split('T')[0];
  }

  _median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  _percentile(values, p) {
    const sorted = [...values].sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;

    if (lower === upper) {
      return sorted[lower];
    }

    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  _calculatePercentile(value, p25, median, p75) {
    if (value <= p25) return 25;
    if (value <= median) return 25 + (value - p25) / (median - p25) * 25;
    if (value <= p75) return 50 + (value - median) / (p75 - median) * 25;
    return Math.min(100, 75 + (value - p75) / (p75 * 0.5) * 25);
  }

  _determineSizeCategory(employeeCount) {
    const count = employeeCount || 0;
    if (count < 100) return 'startup';
    if (count < 1000) return 'mid_market';
    return 'enterprise';
  }

  _interpretBenchmark(bench) {
    const avg = bench.avgSpendPerEmployee;
    if (avg < 50) return 'Low AI adoption in this industry';
    if (avg < 150) return 'Moderate AI adoption';
    if (avg < 300) return 'High AI adoption';
    return 'Very high AI adoption - leading edge';
  }
}

// ============================================================================
// CLASS: NaturalLanguageAnalytics
// ============================================================================

class NaturalLanguageAnalytics {
  constructor(env, options = {}) {
    this.env = env;
    this.supabaseUrl = options.supabaseUrl || env.SUPABASE_URL;
    this.supabaseKey = options.supabaseKey || env.SUPABASE_ANON_KEY;
    this.cacheExpiry = options.cacheExpiry || 1800000; // 30 minutes for freshness
    this.logger = options.logger || new DiamondLogger('NaturalLanguageAnalytics');
    this.circuitBreaker = options.circuitBreaker || new CircuitBreaker({
      failureThreshold: 10,
      resetTimeout: 60000
    });
    this.cache = new Map();
  }

  async fetch(endpoint, options = {}) {
    const url = `${this.supabaseUrl}/rest/v1${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation'
    };

    const response = await resilientFetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      timeout: 15000,
      maxRetries: 2,
      circuitBreaker: this.circuitBreaker
    });

    if (!response.ok) {
      throw new Error(`Supabase API error: ${response.statusText}`);
    }

    return response.json();
  }

  async processQuery(query, organizationId) {
    const cacheKey = `nla_query_${query}_${organizationId}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Parse the natural language query
    const parsed = this._parseQuery(query);

    // Retrieve data based on parsed intent
    const data = await this._retrieveData(parsed, organizationId);

    // Select appropriate chart type
    const chartType = this._selectChartType(parsed.dimensions, data);

    // Generate result with both chart and table
    const result = {
      originalQuery: query,
      parsedIntent: parsed.intent,
      timePeriod: parsed.timePeriod,
      metrics: parsed.metrics,
      dimensions: parsed.dimensions,
      data,
      chartData: this._generateChartData(data, chartType),
      chartType,
      tableData: this._generateTableData(data),
      summary: this._generateSummary(data, parsed),
      followUpSuggestions: this._generateFollowUpQuestions(parsed),
      timestamp: new Date().toISOString()
    };

    this.cache.set(cacheKey, result);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return result;
  }

  _parseQuery(query) {
    const lowerQuery = query.toLowerCase();

    // Detect time period
    let timePeriod = '30d';
    if (lowerQuery.includes('quarter') || lowerQuery.includes('q1') || lowerQuery.includes('q2')) {
      timePeriod = '90d';
    } else if (lowerQuery.includes('year') || lowerQuery.includes('annual')) {
      timePeriod = '365d';
    } else if (lowerQuery.includes('week')) {
      timePeriod = '7d';
    } else if (lowerQuery.includes('month')) {
      timePeriod = '30d';
    }

    // Detect metrics
    let metrics = [];
    if (lowerQuery.includes('spend') || lowerQuery.includes('cost')) metrics.push('spend');
    if (lowerQuery.includes('roi') || lowerQuery.includes('return')) metrics.push('roi');
    if (lowerQuery.includes('usage')) metrics.push('usage');
    if (lowerQuery.includes('performance')) metrics.push('performance');

    // Detect dimensions
    let dimensions = [];
    if (lowerQuery.includes('department')) dimensions.push('department');
    if (lowerQuery.includes('model')) dimensions.push('model');
    if (lowerQuery.includes('team')) dimensions.push('team');
    if (lowerQuery.includes('project')) dimensions.push('project');

    // Default to spend if not specified
    if (metrics.length === 0) metrics.push('spend');

    return {
      intent: 'analytics_query',
      timePeriod,
      metrics,
      dimensions: dimensions.length > 0 ? dimensions : ['department']
    };
  }

  async _retrieveData(parsed, organizationId) {
    const startDate = this._getPeriodStartDate(parsed.timePeriod);
    const results = await this.fetch(
      `/analytics_data?organization_id=eq.${encodeURIComponent(organizationId)}&created_at=gte.${encodeURIComponent(startDate)}&select=*`
    );

    return results.map(r => ({
      date: r.created_at,
      department: r.department_id,
      model: r.model_id,
      spend: r.total_spend || 0,
      roi: r.model_roi || 0,
      usage: r.usage_count || 0,
      performance: r.quality_score || 0
    }));
  }

  _selectChartType(dimensions, data) {
    if (dimensions.includes('department') && data.length > 1) {
      return 'bar';
    }
    if (dimensions.includes('model') && data.length > 1) {
      return 'pie';
    }
    return 'line';
  }

  _generateChartData(data, chartType) {
    const aggregated = this._aggregateData(data);

    if (chartType === 'bar') {
      return {
        labels: aggregated.map(d => d.label),
        datasets: [{
          label: 'Spend ($)',
          data: aggregated.map(d => d.value)
        }]
      };
    } else if (chartType === 'pie') {
      return {
        labels: aggregated.map(d => d.label),
        datasets: [{
          data: aggregated.map(d => d.value)
        }]
      };
    }

    return {
      labels: data.map(d => d.date),
      datasets: [{
        label: 'Spend Trend',
        data: data.map(d => d.spend)
      }]
    };
  }

  _generateTableData(data) {
    const aggregated = this._aggregateData(data);
    return aggregated.map((d, i) => ({
      rank: i + 1,
      category: d.label,
      spend: parseFloat(d.value.toFixed(2)),
      percentage: parseFloat(((d.value / aggregated.reduce((sum, a) => sum + a.value, 0)) * 100).toFixed(1))
    }));
  }

  _generateSummary(data, parsed) {
    const totalSpend = data.reduce((sum, d) => sum + (d.spend || 0), 0);
    const avgSpend = totalSpend / (data.length || 1);

    return {
      totalSpend: parseFloat(totalSpend.toFixed(2)),
      avgSpend: parseFloat(avgSpend.toFixed(2)),
      dataPoints: data.length,
      timeframe: parsed.timePeriod
    };
  }

  _generateFollowUpQuestions(parsed) {
    return [
      `Compare ${parsed.dimensions[0]} spend between periods`,
      `Show ROI breakdown by ${parsed.dimensions[0]}`,
      `Which ${parsed.dimensions[0]} has the highest growth?`,
      `What are the top spending ${parsed.dimensions[0]}s?`
    ];
  }

  _aggregateData(data) {
    const map = new Map();
    data.forEach(d => {
      const key = d.department || d.model || 'Unknown';
      if (!map.has(key)) {
        map.set(key, { label: key, value: 0 });
      }
      map.get(key).value += d.spend || 0;
    });

    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }

  _getPeriodStartDate(period) {
    const now = new Date();
    const days = parseInt(period) || 30;
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return startDate.toISOString().split('T')[0];
  }
}

// ============================================================================
// CLASS: BoardDeckGenerator
// ============================================================================

class BoardDeckGenerator {
  constructor(env, options = {}) {
    this.env = env;
    this.supabaseUrl = options.supabaseUrl || env.SUPABASE_URL;
    this.supabaseKey = options.supabaseKey || env.SUPABASE_ANON_KEY;
    this.cacheExpiry = options.cacheExpiry || 3600000;
    this.logger = options.logger || new DiamondLogger('BoardDeckGenerator');
    this.circuitBreaker = options.circuitBreaker || new CircuitBreaker({
      failureThreshold: 10,
      resetTimeout: 60000
    });
    this.cache = new Map();
  }

  async fetch(endpoint, options = {}) {
    const url = `${this.supabaseUrl}/rest/v1${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation'
    };

    const response = await resilientFetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      timeout: 15000,
      maxRetries: 2,
      circuitBreaker: this.circuitBreaker
    });

    if (!response.ok) {
      throw new Error(`Supabase API error: ${response.statusText}`);
    }

    return response.json();
  }

  async generateMonthlySlideData(year, month) {
    const cacheKey = `monthly_slides_${year}_${month}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    const currentData = await this.fetch(
      `/monthly_metrics?month_start=gte.${encodeURIComponent(monthStart)}&month_start=lt.${encodeURIComponent(monthEnd)}&select=*`
    );

    const previousMonthStart = month === 1
      ? `${year - 1}-12-01`
      : `${year}-${String(month - 1).padStart(2, '0')}-01`;

    const previousData = await this.fetch(
      `/monthly_metrics?month_start=gte.${encodeURIComponent(previousMonthStart)}&month_start=lt.${encodeURIComponent(monthStart)}&select=*`
    );

    const slides = [
      this._generateTitleSlide(year, month),
      this._generateKeyMetricsSlide(currentData, previousData),
      this._generateSpendTrendSlide(currentData, previousData),
      this._generateROISlide(currentData),
      this._generateRiskFlagsSlide(currentData),
      this._generateRecommendationsSlide(currentData),
      this._generateSummarySlide(currentData)
    ];

    const result = {
      year,
      month,
      slideCount: slides.length,
      slides,
      generatedAt: new Date().toISOString()
    };

    this.cache.set(cacheKey, result);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return result;
  }

  _generateTitleSlide(year, month) {
    return {
      slideNumber: 1,
      type: 'title',
      title: 'AI Spend Board Report',
      subtitle: `${this._getMonthName(month)} ${year}`,
      metadata: {
        date: new Date().toLocaleDateString(),
        confidential: true
      }
    };
  }

  _generateKeyMetricsSlide(currentData, previousData) {
    const currentSpend = currentData.reduce((sum, d) => sum + (d.spend || 0), 0);
    const previousSpend = previousData.reduce((sum, d) => sum + (d.spend || 0), 0);
    const momChange = ((currentSpend - previousSpend) / previousSpend) * 100;

    return {
      slideNumber: 2,
      type: 'metrics',
      title: 'Key Metrics Overview',
      metrics: [
        {
          label: 'Total AI Spend',
          value: `$${parseFloat(currentSpend.toFixed(2)).toLocaleString()}`,
          change: `${parseFloat(momChange.toFixed(1))}% MoM`,
          trend: momChange > 5 ? 'up' : momChange < -5 ? 'down' : 'stable'
        },
        {
          label: 'Active Models',
          value: `${new Set(currentData.map(d => d.model_id)).size}`,
          change: 'stable',
          trend: 'stable'
        },
        {
          label: 'Avg Model ROI',
          value: `${parseFloat((currentData.reduce((sum, d) => sum + (d.roi || 0), 0) / currentData.length).toFixed(1))}%`,
          change: 'positive',
          trend: 'up'
        }
      ]
    };
  }

  _generateSpendTrendSlide(currentData, previousData) {
    const currentSpend = currentData.reduce((sum, d) => sum + (d.spend || 0), 0);
    const previousSpend = previousData.reduce((sum, d) => sum + (d.spend || 0), 0);

    return {
      slideNumber: 3,
      type: 'trend',
      title: 'Month-over-Month Spend Trend',
      chartData: {
        type: 'bar',
        periods: [
          {
            label: 'Previous Month',
            value: parseFloat(previousSpend.toFixed(2))
          },
          {
            label: 'Current Month',
            value: parseFloat(currentSpend.toFixed(2))
          }
        ]
      },
      narrative: `Spend trend shows a ${((currentSpend - previousSpend) / previousSpend * 100).toFixed(1)}% change from the previous month.`
    };
  }

  _generateROISlide(currentData) {
    const models = this._aggregateByModel(currentData);
    const topModels = models.sort((a, b) => b.roi - a.roi).slice(0, 5);

    return {
      slideNumber: 4,
      type: 'roi',
      title: 'Model ROI Performance',
      topPerformers: topModels.map((m, i) => ({
        rank: i + 1,
        modelId: m.modelId,
        roi: `${parseFloat(m.roi.toFixed(1))}%`,
        spend: `$${parseFloat(m.spend.toFixed(2))}`
      }))
    };
  }

  _generateRiskFlagsSlide(currentData) {
    const risks = [];

    const avgSpend = currentData.reduce((sum, d) => sum + (d.spend || 0), 0) / currentData.length;
    const outliers = currentData.filter(d => (d.spend || 0) > avgSpend * 1.5);

    if (outliers.length > 0) {
      risks.push({
        level: 'medium',
        flag: 'Spend Outliers Detected',
        details: `${outliers.length} items exceed spending threshold`
      });
    }

    const lowROI = currentData.filter(d => (d.roi || 0) < 50);
    if (lowROI.length > 0) {
      risks.push({
        level: 'low',
        flag: 'Low ROI Items Identified',
        details: `${lowROI.length} items have ROI below 50%`
      });
    }

    return {
      slideNumber: 5,
      type: 'risks',
      title: 'Risk Flags & Alerts',
      risks: risks.length > 0 ? risks : [{ level: 'low', flag: 'No Major Risks', details: 'Portfolio health is good' }]
    };
  }

  _generateRecommendationsSlide(currentData) {
    return {
      slideNumber: 6,
      type: 'recommendations',
      title: 'Strategic Recommendations',
      recommendations: [
        {
          priority: 'high',
          action: 'Consolidate low-performing models',
          expectedBenefit: 'Reduce costs by 10-15%',
          timeframe: '30 days'
        },
        {
          priority: 'medium',
          action: 'Expand top-ROI models usage',
          expectedBenefit: 'Increase revenue capture',
          timeframe: '45 days'
        },
        {
          priority: 'medium',
          action: 'Implement spending guardrails',
          expectedBenefit: 'Improve cost predictability',
          timeframe: '60 days'
        }
      ]
    };
  }

  _generateSummarySlide(currentData) {
    return {
      slideNumber: 7,
      type: 'summary',
      title: 'Summary & Next Steps',
      keyTakeaways: [
        'AI spend is within planned budget',
        'ROI metrics are positive across portfolio',
        'Top 3 models driving majority of value',
        'No critical risks identified'
      ],
      nextSteps: [
        'Continue monitoring spend vs. budget',
        'Review model selection quarterly',
        'Expand governance policies'
      ]
    };
  }

  _getMonthName(month) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December'];
    return months[month - 1];
  }

  _aggregateByModel(data) {
    const models = new Map();
    data.forEach(d => {
      if (!models.has(d.model_id)) {
        models.set(d.model_id, { modelId: d.model_id, spend: 0, roi: 0, count: 0 });
      }
      const model = models.get(d.model_id);
      model.spend += d.spend || 0;
      model.roi += d.roi || 0;
      model.count++;
    });

    return Array.from(models.values()).map(m => ({
      ...m,
      roi: m.count > 0 ? m.roi / m.count : 0
    }));
  }
}

// ============================================================================
// CLASS: MobileAPIEngine
// ============================================================================

class MobileAPIEngine {
  constructor(env, options = {}) {
    this.env = env;
    this.supabaseUrl = options.supabaseUrl || env.SUPABASE_URL;
    this.supabaseKey = options.supabaseKey || env.SUPABASE_ANON_KEY;
    this.cacheExpiry = options.cacheExpiry || 600000; // 10 minutes for mobile freshness
    this.logger = options.logger || new DiamondLogger('MobileAPIEngine');
    this.circuitBreaker = options.circuitBreaker || new CircuitBreaker({
      failureThreshold: 10,
      resetTimeout: 60000
    });
    this.cache = new Map();
  }

  async fetch(endpoint, options = {}) {
    const url = `${this.supabaseUrl}/rest/v1${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation'
    };

    const response = await resilientFetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      timeout: 15000,
      maxRetries: 2,
      circuitBreaker: this.circuitBreaker
    });

    if (!response.ok) {
      throw new Error(`Supabase API error: ${response.statusText}`);
    }

    return response.json();
  }

  async dashboardSummary(organizationId) {
    const cacheKey = `mobile_dashboard_${organizationId}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const dateStr = startDate.toISOString().split('T')[0];

    const results = await this.fetch(
      `/analytics_data?organization_id=eq.${encodeURIComponent(organizationId)}&created_at=gte.${encodeURIComponent(dateStr)}&select=*`
    );

    // Get today's actual spend from api_usage table
    const today = new Date().toISOString().split('T')[0];
    const todayResults = await this.fetch(
      `/api_usage?organization_id=eq.${encodeURIComponent(organizationId)}&created_at=gte.${encodeURIComponent(today)}&select=total_spend`
    );
    const todaySpend = todayResults.reduce((sum, r) => sum + (r.total_spend || 0), 0);

    const totalSpend = results.reduce((sum, r) => sum + (r.total_spend || 0), 0);
    const avgDailySpend = totalSpend / 30;

    const summary = {
      timestamp: new Date().toISOString(),
      cards: [
        {
          id: 'spend_today',
          title: 'Today\'s Spend',
          value: `$${parseFloat(todaySpend.toFixed(2))}`,
          trend: 'stable'
        },
        {
          id: 'month_total',
          title: 'Month to Date',
          value: `$${parseFloat(totalSpend.toFixed(2))}`,
          trend: results.length > 0 ? 'positive' : 'stable'
        },
        {
          id: 'budget_remaining',
          title: 'Budget Remaining',
          value: `$${parseFloat(((results[0]?.monthly_budget || 10000) - totalSpend).toFixed(2))}`,
          trend: totalSpend > (results[0]?.monthly_budget || 10000) * 0.8 ? 'warning' : 'positive'
        }
      ],
      recentActivity: results.slice(-5).reverse().map(r => ({
        id: r.id,
        action: `${r.department_id} used ${r.model_id}`,
        cost: parseFloat((r.total_spend || 0).toFixed(2)),
        timestamp: r.created_at
      }))
    };

    this.cache.set(cacheKey, summary);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return summary;
  }

  async spendToday(organizationId) {
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `mobile_spend_today_${organizationId}_${today}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const results = await this.fetch(
      `/analytics_data?organization_id=eq.${encodeURIComponent(organizationId)}&created_at=gte.${encodeURIComponent(today)}&select=*`
    );

    const totalSpend = results.reduce((sum, r) => sum + (r.total_spend || 0), 0);
    const byDepartment = new Map();

    results.forEach(r => {
      const dept = r.department_id || 'Other';
      if (!byDepartment.has(dept)) {
        byDepartment.set(dept, 0);
      }
      byDepartment.set(dept, byDepartment.get(dept) + (r.total_spend || 0));
    });

    const spendData = {
      timestamp: new Date().toISOString(),
      date: today,
      totalSpend: parseFloat(totalSpend.toFixed(2)),
      byDepartment: Array.from(byDepartment.entries()).map(([dept, spend]) => ({
        department: dept,
        spend: parseFloat(spend.toFixed(2))
      })),
      dailyBudget: 333.33,
      budgetUsed: parseFloat(((totalSpend / 333.33) * 100).toFixed(1))
    };

    this.cache.set(cacheKey, spendData);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return spendData;
  }

  async alerts(organizationId) {
    const cacheKey = `mobile_alerts_${organizationId}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const results = await this.fetch(
      `/alerts?organization_id=eq.${encodeURIComponent(organizationId)}&select=*&order=created_at.desc&limit=10`
    );

    const alerts = results.map(a => ({
      id: a.id,
      type: a.alert_type,
      title: a.title,
      message: a.message,
      severity: a.severity,
      timestamp: a.created_at,
      actionRequired: a.severity === 'critical'
    }));

    const result = {
      timestamp: new Date().toISOString(),
      alertCount: alerts.length,
      criticalCount: alerts.filter(a => a.severity === 'critical').length,
      alerts
    };

    this.cache.set(cacheKey, result);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return result;
  }

  async approvalQueue(organizationId) {
    const cacheKey = `mobile_approvals_${organizationId}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const results = await this.fetch(
      `/approval_requests?organization_id=eq.${encodeURIComponent(organizationId)}&status=eq.pending&select=*&order=created_at.asc`
    );

    const approvals = results.map(a => ({
      id: a.id,
      requestType: a.request_type,
      description: a.description,
      requiredAmount: parseFloat((a.required_amount || 0).toFixed(2)),
      requestedBy: a.requested_by,
      createdAt: a.created_at,
      dueDate: this._addDays(a.created_at, 3)
    }));

    const result = {
      timestamp: new Date().toISOString(),
      pendingCount: approvals.length,
      approvals,
      actions: ['Approve', 'Reject', 'Request Info']
    };

    this.cache.set(cacheKey, result);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return result;
  }

  async trends(organizationId) {
    const cacheKey = `mobile_trends_${organizationId}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);
    const dateStr = startDate.toISOString().split('T')[0];

    const results = await this.fetch(
      `/analytics_data?organization_id=eq.${encodeURIComponent(organizationId)}&created_at=gte.${encodeURIComponent(dateStr)}&select=created_at,total_spend&order=created_at.asc`
    );

    // Aggregate by week
    const weeklyData = new Map();
    results.forEach(r => {
      const date = new Date(r.created_at);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];

      if (!weeklyData.has(weekKey)) {
        weeklyData.set(weekKey, 0);
      }
      weeklyData.set(weekKey, weeklyData.get(weekKey) + (r.total_spend || 0));
    });

    const trendPoints = Array.from(weeklyData.entries())
      .map(([week, spend]) => ({
        week,
        spend: parseFloat(spend.toFixed(2))
      }))
      .sort((a, b) => a.week.localeCompare(b.week));

    const result = {
      timestamp: new Date().toISOString(),
      period: '90d',
      trendPoints,
      chart: {
        type: 'line',
        data: trendPoints
      }
    };

    this.cache.set(cacheKey, result);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return result;
  }

  async registerPushNotifications(organizationId, deviceToken, preferences = {}) {
    const cacheKey = `push_registration_${organizationId}_${deviceToken}`;

    const registration = {
      id: `push_${Date.now()}`,
      organizationId,
      deviceToken,
      platform: preferences.platform || 'ios', // ios, android, web
      preferences: {
        budgetAlerts: preferences.budgetAlerts !== false,
        spendNotifications: preferences.spendNotifications !== false,
        weeklyDigest: preferences.weeklyDigest !== false,
        criticalAlerts: preferences.criticalAlerts !== false,
        thresholds: {
          dailySpend: preferences.dailyThreshold || 1000,
          weeklySpend: preferences.weeklyThreshold || 5000,
          budgetUtilization: preferences.budgetUtilization || 80
        }
      },
      registeredAt: new Date().toISOString(),
      status: 'active'
    };

    // Store registration in Supabase
    try {
      await this.fetch('/push_registrations', {
        method: 'POST',
        body: {
          organization_id: organizationId,
          device_token: deviceToken,
          platform: registration.platform,
          preferences: JSON.stringify(registration.preferences),
          status: 'active'
        }
      });
    } catch (error) {
      if (this.logger) this.logger.error('Failed to register push notifications', { error: error.message });
    }

    this.cache.set(cacheKey, registration);
    return registration;
  }

  async sendPushNotification(organizationId, title, message, data = {}) {
    // Get registered devices for organization
    const deviceTokens = await this.fetch(
      `/push_registrations?organization_id=eq.${encodeURIComponent(organizationId)}&status=eq.active&select=device_token,platform`
    );

    const pushService = {
      timestamp: new Date().toISOString(),
      organizationId,
      notification: {
        title,
        message,
        data,
        priority: data.priority || 'normal'
      },
      targets: deviceTokens.length,
      results: []
    };

    // Send to each registered device
    for (const device of deviceTokens) {
      try {
        const result = {
          deviceToken: device.device_token.substring(0, 20) + '...',
          platform: device.platform,
          status: 'queued',
          sentAt: new Date().toISOString()
        };
        pushService.results.push(result);
      } catch (error) {
        pushService.results.push({
          platform: device.platform,
          status: 'failed',
          error: error.message
        });
      }
    }

    return pushService;
  }

  async budgetStatus(organizationId) {
    const cacheKey = `mobile_budget_status_${organizationId}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const today = new Date().toISOString().split('T')[0];
    const monthStart = new Date();
    monthStart.setDate(1);
    const monthStartStr = monthStart.toISOString().split('T')[0];

    const monthData = await this.fetch(
      `/analytics_data?organization_id=eq.${encodeURIComponent(organizationId)}&created_at=gte.${encodeURIComponent(monthStartStr)}&select=total_spend`
    );

    const monthlySpend = monthData.reduce((sum, d) => sum + (d.total_spend || 0), 0);
    const monthlyBudget = 10000; // Default or fetch from config
    const budgetRemaining = monthlyBudget - monthlySpend;
    const budgetUtilization = Math.round((monthlySpend / monthlyBudget) * 100);

    const result = {
      timestamp: new Date().toISOString(),
      period: 'current_month',
      budget: {
        total: monthlyBudget,
        spent: parseFloat(monthlySpend.toFixed(2)),
        remaining: parseFloat(budgetRemaining.toFixed(2)),
        utilization: budgetUtilization,
        status: budgetUtilization > 90 ? 'critical' : budgetUtilization > 70 ? 'warning' : 'healthy'
      },
      projections: {
        projectedMonthlySpend: parseFloat((monthlySpend * (30 / new Date().getDate())).toFixed(2)),
        willExceedBudget: (monthlySpend * (30 / new Date().getDate())) > monthlyBudget
      }
    };

    this.cache.set(cacheKey, result);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return result;
  }

  async teamPerformance(organizationId) {
    const cacheKey = `mobile_team_performance_${organizationId}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const dateStr = startDate.toISOString().split('T')[0];

    const results = await this.fetch(
      `/analytics_data?organization_id=eq.${encodeURIComponent(organizationId)}&created_at=gte.${encodeURIComponent(dateStr)}&select=department_id,total_spend&order=total_spend.desc&limit=10`
    );

    const teamMetrics = results.map((r, i) => ({
      rank: i + 1,
      department: r.department_id || 'Unknown',
      spend: parseFloat((r.total_spend || 0).toFixed(2)),
      trend: i < 3 ? 'up' : 'stable'
    }));

    const result = {
      timestamp: new Date().toISOString(),
      period: '30d',
      topTeams: teamMetrics.slice(0, 5),
      totalTeams: results.length,
      metrics: teamMetrics
    };

    this.cache.set(cacheKey, result);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return result;
  }

  _addDays(dateStr, days) {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + days);
    return date.toISOString();
  }
}

// ============================================================================
// CLASS: EmbeddedAnalytics
// ============================================================================

class EmbeddedAnalytics {
  constructor(env, options = {}) {
    this.env = env;
    this.supabaseUrl = options.supabaseUrl || env.SUPABASE_URL;
    this.supabaseKey = options.supabaseKey || env.SUPABASE_ANON_KEY;
    this.cacheExpiry = options.cacheExpiry || 3600000;
    this.logger = options.logger || new DiamondLogger('EmbeddedAnalytics');
    this.circuitBreaker = options.circuitBreaker || new CircuitBreaker({
      failureThreshold: 10,
      resetTimeout: 60000
    });
    this.cache = new Map();
  }

  async fetch(endpoint, options = {}) {
    const url = `${this.supabaseUrl}/rest/v1${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation'
    };

    const response = await resilientFetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      timeout: 15000,
      maxRetries: 2,
      circuitBreaker: this.circuitBreaker
    });

    if (!response.ok) {
      throw new Error(`Supabase API error: ${response.statusText}`);
    }

    return response.json();
  }

  async generateEmbedToken(organizationId, customerId, options = {}) {
    const cacheKey = `embed_token_${organizationId}_${customerId}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const token = {
      id: `token_${Date.now()}_${crypto.randomUUID().substring(0, 9)}`,
      organizationId,
      customerId,
      scopes: options.scopes || ['read:analytics', 'read:spend'],
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      theme: options.theme || 'light',
      features: options.features || ['dashboard', 'trends', 'breakdown'],
      restrictions: {
        dataRange: options.dataRange || '90d',
        departments: options.departments || []
      }
    };

    this.cache.set(cacheKey, token);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return token;
  }

  async whitelabelDashboardData(organizationId, customerId, theme = 'light') {
    const cacheKey = `whitelabel_dashboard_${organizationId}_${customerId}_${theme}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const results = await this.fetch(
      `/analytics_data?organization_id=eq.${encodeURIComponent(organizationId)}&select=*&limit=100`
    );

    const themedColors = {
      light: {
        primary: '#1f2937',
        secondary: '#6366f1',
        accent: '#06b6d4'
      },
      dark: {
        primary: '#f3f4f6',
        secondary: '#818cf8',
        accent: '#22d3ee'
      }
    };

    const dashboard = {
      customerId,
      theme,
      colors: themedColors[theme],
      components: {
        header: {
          title: 'AI Spend Analytics',
          subtitle: 'Your custom financial dashboard',
          logo: options.logoUrl || null
        },
        metrics: this._generateMetricsCards(results),
        charts: this._generateChartComponents(results),
        tables: this._generateTableComponents(results)
      },
      branding: {
        primaryColor: themedColors[theme].primary,
        accentColor: themedColors[theme].accent,
        fontFamily: 'Inter, sans-serif'
      }
    };

    this.cache.set(cacheKey, dashboard);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return dashboard;
  }

  async getComponentLibrary() {
    const cacheKey = 'component_library';
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const library = {
      version: '1.0.0',
      components: [
        {
          id: 'spend-card',
          name: 'Spend Summary Card',
          props: ['value', 'period', 'trend'],
          category: 'metrics'
        },
        {
          id: 'spend-chart',
          name: 'Spend Trend Chart',
          props: ['data', 'period', 'chartType'],
          category: 'charts'
        },
        {
          id: 'department-breakdown',
          name: 'Department Breakdown Table',
          props: ['data', 'sortBy'],
          category: 'tables'
        },
        {
          id: 'model-performance',
          name: 'Model Performance Comparison',
          props: ['models', 'metrics'],
          category: 'tables'
        },
        {
          id: 'roi-gauge',
          name: 'ROI Gauge Chart',
          props: ['value', 'target'],
          category: 'charts'
        },
        {
          id: 'budget-progress',
          name: 'Budget Progress Bar',
          props: ['spent', 'budget', 'period'],
          category: 'metrics'
        }
      ],
      themes: ['light', 'dark', 'custom']
    };

    this.cache.set(cacheKey, library);
    return library;
  }

  async iframeEmbedConfig(organizationId, componentId) {
    const cacheKey = `iframe_config_${organizationId}_${componentId}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const config = {
      iframeUrl: `/embed/${componentId}?token=${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`,
      width: '100%',
      height: '400px',
      borderRadius: '8px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      allowFullscreen: false,
      sandbox: ['allow-scripts', 'allow-same-origin'],
      dataRefreshInterval: 300000 // 5 minutes
    };

    this.cache.set(cacheKey, config);
    return config;
  }

  async generateEmbedCode(dashboardType, config) {
    const cacheKey = `embed_code_${dashboardType}_${JSON.stringify(config).substring(0, 50)}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const apiKey = config.apiKey || 'YOUR_API_KEY';
    const theme = config.theme || 'light';
    const width = config.width || '100%';
    const height = config.height || '600px';

    // Generate iframe-based embed code
    const iframeCode = `<iframe
  src="https://analytics.finault.com/embed/${dashboardType}?apiKey=${encodeURIComponent(apiKey)}&theme=${theme}"
  width="${width}"
  height="${height}"
  frameborder="0"
  scrolling="auto"
  style="border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
</iframe>`;

    // Generate script-based embed code with real-time updates
    const scriptCode = `<script>
  (function() {
    const container = document.getElementById('finault-embed-${dashboardType}');
    const config = {
      type: '${dashboardType}',
      apiKey: '${apiKey}',
      theme: '${theme}',
      refreshInterval: ${config.refreshInterval || 300000},
      features: ${JSON.stringify(config.features || ['dashboard', 'trends'])}
    };

    // Load Finault embed script
    const script = document.createElement('script');
    script.src = 'https://cdn.finault.com/embed-v1.js';
    script.onload = () => {
      if (window.FinaultEmbed) {
        window.FinaultEmbed.init(container, config);
      }
    };
    document.head.appendChild(script);
  })();
</script>
<div id="finault-embed-${dashboardType}" style="width: 100%; height: 600px;"></div>`;

    // Generate React component code
    const reactCode = `import React, { useEffect, useState } from 'react';
import { FinaultDashboard } from '@finault/react-embed';

export function EmbeddedAnalytics() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <FinaultDashboard
      type="${dashboardType}"
      apiKey="${apiKey}"
      theme="${theme}"
      features={${JSON.stringify(config.features || ['dashboard', 'trends'])}}
      onDataUpdate={(data) => { if (this.logger) this.logger.info('Data updated', { data }); }}
      style={{ width: '100%', height: '600px' }}
    />
  );
}`;

    const embedCode = {
      dashboardType,
      format: 'multi',
      iframe: {
        code: iframeCode,
        description: 'Lightweight iframe embed for simple integration'
      },
      script: {
        code: scriptCode,
        description: 'Script-based embed with real-time updates'
      },
      react: {
        code: reactCode,
        description: 'React component for modern applications',
        package: '@finault/react-embed'
      },
      config,
      documentation: {
        apiReference: 'https://docs.finault.com/embed-api',
        examples: 'https://github.com/finault/embed-examples',
        support: 'support@finault.com'
      }
    };

    this.cache.set(cacheKey, embedCode);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return embedCode;
  }

  _generateMetricsCards(results) {
    const totalSpend = results.reduce((sum, r) => sum + (r.total_spend || 0), 0);
    return [
      {
        id: 'total-spend',
        title: 'Total Spend',
        value: parseFloat(totalSpend.toFixed(2)),
        unit: 'USD'
      },
      {
        id: 'active-models',
        title: 'Active Models',
        value: new Set(results.map(r => r.model_id)).size,
        unit: 'count'
      }
    ];
  }

  _generateChartComponents(results) {
    return [
      {
        id: 'spend-trend',
        type: 'line',
        title: 'Spend Trend',
        data: results.map((r, i) => ({ x: i, y: r.total_spend }))
      }
    ];
  }

  _generateTableComponents(results) {
    return [
      {
        id: 'department-table',
        type: 'table',
        title: 'Spending by Department',
        columns: ['Department', 'Spend', 'ROI'],
        data: []
      }
    ];
  }
}

// ============================================================================
// CLASS: SpendBenchmarker
// ============================================================================

class SpendBenchmarker {
  constructor(env, options = {}) {
    this.env = env;
    this.supabaseUrl = options.supabaseUrl || env.SUPABASE_URL;
    this.supabaseKey = options.supabaseKey || env.SUPABASE_ANON_KEY;
    this.cacheExpiry = options.cacheExpiry || 3600000;
    this.logger = options.logger || new DiamondLogger('SpendBenchmarker');
    this.circuitBreaker = options.circuitBreaker || new CircuitBreaker({
      failureThreshold: 10,
      resetTimeout: 60000
    });
    this.cache = new Map();
  }

  async fetch(endpoint, options = {}) {
    const url = `${this.supabaseUrl}/rest/v1${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation'
    };

    const response = await resilientFetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      timeout: 15000,
      maxRetries: 2,
      circuitBreaker: this.circuitBreaker
    });

    if (!response.ok) {
      throw new Error(`Supabase API error: ${response.statusText}`);
    }

    return response.json();
  }

  async perEmployeeAISpend(organizationId, period = '30d') {
    const cacheKey = `per_employee_spend_${organizationId}_${period}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const orgData = await this.fetch(
      `/organizations?id=eq.${encodeURIComponent(organizationId)}&select=employee_count,industry`
    );

    if (orgData.length === 0) {
      throw new Error('Organization not found');
    }

    const org = orgData[0];
    const startDate = this._getPeriodStartDate(period);

    const spendData = await this.fetch(
      `/analytics_data?organization_id=eq.${encodeURIComponent(organizationId)}&created_at=gte.${encodeURIComponent(startDate)}&select=total_spend`
    );

    const totalSpend = spendData.reduce((sum, s) => sum + (s.total_spend || 0), 0);
    const spendPerEmployee = org.employee_count > 0
      ? totalSpend / org.employee_count
      : 0;

    const result = {
      organizationId,
      period,
      employeeCount: org.employee_count,
      totalSpend: parseFloat(totalSpend.toFixed(2)),
      spendPerEmployee: parseFloat(spendPerEmployee.toFixed(2)),
      industry: org.industry,
      timestamp: new Date().toISOString()
    };

    this.cache.set(cacheKey, result);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return result;
  }

  async benchmarkComparison(organizationId, period = '30d') {
    const cacheKey = `benchmark_comp_${organizationId}_${period}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const yourSpend = await this.perEmployeeAISpend(organizationId, period);
    const startDate = this._getPeriodStartDate(period);

    const benchmarkData = await this.fetch(
      `/benchmark_data?created_at=gte.${encodeURIComponent(startDate)}&select=organization_id,employee_count,spend,industry`
    );

    const industryData = benchmarkData.filter(b => b.industry === yourSpend.industry);
    const spendPerEmployees = industryData.map(d => (d.spend || 0) / (d.employee_count || 1));

    const median = this._median(spendPerEmployees);
    const p75 = this._percentile(spendPerEmployees, 75);
    const p25 = this._percentile(spendPerEmployees, 25);

    const comparison = {
      organizationId,
      period,
      yourSpendPerEmployee: yourSpend.spendPerEmployee,
      industryMedian: parseFloat(median.toFixed(2)),
      industryP25: parseFloat(p25.toFixed(2)),
      industryP75: parseFloat(p75.toFixed(2)),
      comparison: {
        vs_median: parseFloat(((yourSpend.spendPerEmployee / median) * 100).toFixed(1)),
        position: yourSpend.spendPerEmployee < median * 0.8
          ? 'Below Median'
          : yourSpend.spendPerEmployee > median * 1.2
          ? 'Above Median'
          : 'At Median',
        benchmark_count: industryData.length
      },
      recommendations: this._generateRecommendations(yourSpend.spendPerEmployee, median),
      timestamp: new Date().toISOString()
    };

    this.cache.set(cacheKey, comparison);
    setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

    return comparison;
  }

  _getPeriodStartDate(period) {
    const now = new Date();
    const days = parseInt(period) || 30;
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return startDate.toISOString().split('T')[0];
  }

  _median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  _percentile(values, p) {
    const sorted = [...values].sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;

    if (lower === upper) return sorted[lower];
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  async generateBenchmarkReport(tenantId) {
    const cacheKey = `benchmark_report_${tenantId}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      // Query api_usage table for real tenant data
      const tenantData = await this.fetch(
        `/api_usage?tenant_id=eq.${encodeURIComponent(tenantId)}&select=created_at,total_cost,inference_count&order=created_at.desc&limit=90`
      );

      // Get tenant metadata
      const tenantInfo = await this.fetch(
        `/organizations?id=eq.${encodeURIComponent(tenantId)}&select=industry,employee_count,company_size`
      );

      if (tenantInfo.length === 0) {
        throw new Error(`Tenant ${tenantId} not found`);
      }

      const tenant = tenantInfo[0];
      const totalSpend = tenantData.reduce((sum, d) => sum + (d.total_cost || 0), 0);
      const spendPerDay = tenantData.length > 0 ? totalSpend / tenantData.length : 0;

      // Anonymize and aggregate benchmark data
      const benchmarkData = await this.fetch(
        `/benchmark_data?industry=eq.${encodeURIComponent(tenant.industry)}&select=spend,employee_count,roi&order=created_at.desc&limit=100`
      );

      // Calculate percentiles and rankings
      const spends = benchmarkData.map(b => b.spend || 0);
      const percentiles = {
        p10: this._percentile(spends, 10),
        p25: this._percentile(spends, 25),
        p50: this._percentile(spends, 50),
        p75: this._percentile(spends, 75),
        p90: this._percentile(spends, 90)
      };

      // Determine percentile ranking for this tenant
      let percentileRank = 50;
      if (totalSpend <= percentiles.p25) percentileRank = 25;
      else if (totalSpend <= percentiles.p50) percentileRank = 50;
      else if (totalSpend <= percentiles.p75) percentileRank = 75;
      else if (totalSpend <= percentiles.p90) percentileRank = 90;
      else percentileRank = 95;

      const report = {
        tenantId,
        reportDate: new Date().toISOString(),
        period: '90d',
        performance: {
          totalSpend: parseFloat(totalSpend.toFixed(2)),
          dailyAverage: parseFloat(spendPerDay.toFixed(2)),
          totalInferences: tenantData.reduce((sum, d) => sum + (d.inference_count || 0), 0),
          avgCostPerInference: tenantData.reduce((sum, d) => sum + (d.total_cost || 0), 0) /
                              Math.max(1, tenantData.reduce((sum, d) => sum + (d.inference_count || 0), 0))
        },
        benchmarking: {
          industry: tenant.industry,
          companySize: tenant.company_size,
          percentileRank,
          percentiles,
          position: percentileRank <= 25 ? 'Below Average' :
                   percentileRank <= 75 ? 'Average' : 'Above Average',
          competitiveLandscape: {
            tenantCount: benchmarkData.length,
            medianSpend: this._median(spends),
            avgSpend: spends.reduce((a, b) => a + b, 0) / spends.length
          }
        },
        insights: {
          strengths: this._identifyStrengths(percentileRank),
          opportunities: this._identifyOpportunities(percentileRank),
          recommendations: this._generateDetailedRecommendations(percentileRank)
        },
        anonymization: {
          method: 'percentile_based',
          dataPoints: benchmarkData.length,
          confidence: 'high'
        }
      };

      this.cache.set(cacheKey, report);
      setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

      return report;
    } catch (error) {
      if (this.logger) this.logger.error(`Failed to generate benchmark report for ${tenantId}`, { error: error.message });
      throw error;
    }
  }

  _identifyStrengths(percentileRank) {
    if (percentileRank <= 25) {
      return ['Efficient AI spending', 'Cost-conscious approach', 'Strong budget discipline'];
    }
    if (percentileRank >= 75) {
      return ['High AI adoption', 'Aggressive AI investment', 'Advanced AI capabilities'];
    }
    return ['Balanced AI investment', 'Aligned with industry norms', 'Moderate AI maturity'];
  }

  _identifyOpportunities(percentileRank) {
    if (percentileRank <= 25) {
      return ['Expand AI use cases', 'Increase AI adoption', 'Invest in AI capability building'];
    }
    if (percentileRank >= 75) {
      return ['Optimize ROI', 'Consolidate tools', 'Improve cost efficiency'];
    }
    return ['Selective expansion', 'Targeted optimization', 'Knowledge sharing with peers'];
  }

  _generateDetailedRecommendations(percentileRank) {
    const base = [
      'Monitor spending quarterly',
      'Compare with peer benchmarks regularly'
    ];

    if (percentileRank <= 25) {
      return [
        ...base,
        'Evaluate ROI on new AI initiatives before scaling',
        'Consider expanding in high-impact use cases',
        'Implement governance framework for AI investments'
      ];
    }

    if (percentileRank >= 75) {
      return [
        ...base,
        'Review model portfolio for redundancy',
        'Implement stricter cost controls',
        'Focus on high-value AI initiatives',
        'Establish clear ROI targets for new investments'
      ];
    }

    return [
      ...base,
      'Maintain current spending trajectory',
      'Evaluate peer spending patterns',
      'Focus on ROI optimization within current levels'
    ];
  }

  _generateRecommendations(yourSpend, median) {
    if (yourSpend > median * 1.5) {
      return [
        'Your AI spending is significantly above industry median',
        'Review model selection and usage patterns',
        'Implement budget controls to optimize spending',
        'Consider consolidating to fewer, higher-ROI models'
      ];
    }

    if (yourSpend < median * 0.5) {
      return [
        'Your AI spending is below industry median',
        'Consider expanding AI adoption to drive business value',
        'Evaluate high-ROI use cases for expansion',
        'Invest in capability building where competitors lead'
      ];
    }

    return [
      'Your AI spending is aligned with industry benchmarks',
      'Continue current spending trajectory',
      'Monitor peer spending patterns quarterly',
      'Focus on optimizing ROI within current spend levels'
    ];
  }

  async getHealth() {
    const health = new HealthCheck('analytics');
    health.addCheck('supabase', async () => {
      const url = `${this.supabaseUrl}/rest/v1/api_usage?limit=1`;
      const response = await resilientFetch(url, {
        headers: {
          'Authorization': `Bearer ${this.supabaseKey}`,
          'apikey': this.supabaseKey
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

// ============================================================================
// MAIN EXPORT
// ============================================================================

export {
  UnitEconomicsCalculator,
  ROIAnalyzer,
  BoardReportGenerator,
  FinOpsMaturityAssessor,
  BenchmarkEngine,
  NaturalLanguageAnalytics,
  BoardDeckGenerator,
  MobileAPIEngine,
  EmbeddedAnalytics,
  SpendBenchmarker,
  UNIT_ECONOMICS_METRICS,
  FINOPS_MATURITY_DOMAINS,
  BOARD_REPORT_SECTIONS,
  BENCHMARK_INDUSTRIES,
  MOBILE_ENDPOINTS
};
