/**
 * Finault ROI Analytics Module
 * Connects AI spend to business outcomes
 * Part of Option A Gold Tier - Phase 3
 */

// ============================================================================
// INDUSTRY BENCHMARKS
// ============================================================================

const INDUSTRY_BENCHMARKS = {
  'customer_support': {
    ticketDeflectionRate: 0.35,      // 35% of tickets handled by AI
    avgTicketCost: 15.00,            // Human agent cost per ticket
    avgAITicketCost: 0.12,           // AI cost per ticket
    responseTimeReduction: 0.80,     // 80% faster with AI
    csatImpact: 0.05                 // +5% CSAT improvement
  },
  'content_generation': {
    timePerPiece: 4.0,               // Hours without AI
    timeWithAI: 0.5,                 // Hours with AI
    hourlyRate: 75.00,               // Writer cost per hour
    qualityParity: 0.85,             // 85% as good as human
    volumeIncrease: 5.0              // 5x more content
  },
  'code_assistance': {
    productivityGain: 0.30,          // 30% faster development
    bugReduction: 0.15,              // 15% fewer bugs
    avgDeveloperCost: 150000,        // Annual salary
    codeReviewTimeReduction: 0.50    // 50% faster reviews
  },
  'data_analysis': {
    timeToInsight: 0.10,             // 10% of manual time
    analystHourlyRate: 85.00,
    accuracyImprovement: 0.12,       // 12% more accurate
    decisionsAccelerated: 3.0        // 3x faster decisions
  },
  'sales_enablement': {
    leadScoringAccuracy: 0.25,       // 25% improvement
    proposalTimeReduction: 0.60,     // 60% faster proposals
    winRateImpact: 0.08,             // +8% win rate
    avgDealSize: 50000
  }
};

// ============================================================================
// VALUE METRICS DEFINITIONS
// ============================================================================

const VALUE_METRICS = {
  'tickets_deflected': {
    name: 'Support Tickets Deflected',
    unit: 'tickets',
    defaultValuePer: 15.00,          // $15 saved per ticket
    description: 'Customer inquiries resolved by AI without human intervention'
  },
  'time_saved_hours': {
    name: 'Time Saved',
    unit: 'hours',
    defaultValuePer: 75.00,          // $75/hour average
    description: 'Hours of human labor replaced by AI'
  },
  'revenue_influenced': {
    name: 'Revenue Influenced',
    unit: 'dollars',
    defaultValuePer: 1.00,           // 1:1
    description: 'Revenue directly attributable to AI assistance'
  },
  'content_pieces': {
    name: 'Content Generated',
    unit: 'pieces',
    defaultValuePer: 300.00,         // $300 per piece equivalent
    description: 'Marketing/sales content created with AI'
  },
  'code_commits': {
    name: 'AI-Assisted Commits',
    unit: 'commits',
    defaultValuePer: 50.00,          // $50 value per commit
    description: 'Code commits that used AI assistance'
  },
  'decisions_accelerated': {
    name: 'Decisions Accelerated',
    unit: 'decisions',
    defaultValuePer: 500.00,         // $500 value per faster decision
    description: 'Business decisions made faster with AI analysis'
  },
  'errors_prevented': {
    name: 'Errors Prevented',
    unit: 'errors',
    defaultValuePer: 1000.00,        // $1000 per error prevented
    description: 'Mistakes caught by AI before production'
  }
};

// ============================================================================
// ROI CALCULATOR
// ============================================================================

class ROICalculator {
  constructor(config = {}) {
    this.customValueRates = config.customValueRates || {};
    this.costData = config.costData || [];
    this.valueData = config.valueData || [];
    this.timeRange = config.timeRange || 'month';
  }

  /**
   * Calculate ROI for a specific use case
   */
  calculateUseCaseROI(useCaseId, metrics) {
    const costs = this.getCostsForUseCase(useCaseId);
    const value = this.calculateValueForUseCase(useCaseId, metrics);

    const roi = costs > 0 ? ((value - costs) / costs) * 100 : 0;
    const netValue = value - costs;
    const paybackDays = costs > 0 ? Math.ceil((costs / value) * 30) : 0;

    return {
      useCaseId,
      period: this.timeRange,
      costs: {
        total: costs,
        breakdown: this.getCostBreakdown(useCaseId)
      },
      value: {
        total: value,
        breakdown: this.getValueBreakdown(useCaseId, metrics)
      },
      roi: {
        percentage: Math.round(roi * 100) / 100,
        netValue: Math.round(netValue * 100) / 100,
        paybackDays,
        status: this.getROIStatus(roi)
      },
      benchmark: this.compareToBenchmark(useCaseId, roi)
    };
  }

  /**
   * Calculate total portfolio ROI
   */
  calculatePortfolioROI(useCases) {
    let totalCosts = 0;
    let totalValue = 0;
    const useCaseResults = [];

    for (const useCase of useCases) {
      const result = this.calculateUseCaseROI(useCase.id, useCase.metrics);
      useCaseResults.push(result);
      totalCosts += result.costs.total;
      totalValue += result.value.total;
    }

    const portfolioROI = totalCosts > 0 ? ((totalValue - totalCosts) / totalCosts) * 100 : 0;

    // Sort by ROI to identify best/worst performers
    const sortedByROI = [...useCaseResults].sort((a, b) => b.roi.percentage - a.roi.percentage);

    return {
      period: this.timeRange,
      summary: {
        totalCosts: Math.round(totalCosts * 100) / 100,
        totalValue: Math.round(totalValue * 100) / 100,
        netValue: Math.round((totalValue - totalCosts) * 100) / 100,
        portfolioROI: Math.round(portfolioROI * 100) / 100,
        useCaseCount: useCases.length
      },
      useCases: useCaseResults,
      insights: {
        topPerformers: sortedByROI.slice(0, 3),
        underperformers: sortedByROI.filter(uc => uc.roi.percentage < 0),
        opportunities: this.identifyOpportunities(useCaseResults)
      }
    };
  }

  /**
   * Get costs for a specific use case
   */
  getCostsForUseCase(useCaseId) {
    return this.costData
      .filter(c => c.useCaseId === useCaseId || c.tags?.includes(useCaseId))
      .reduce((sum, c) => sum + (c.totalCost || 0), 0);
  }

  /**
   * Get cost breakdown by model/provider
   */
  getCostBreakdown(useCaseId) {
    const costs = this.costData.filter(c =>
      c.useCaseId === useCaseId || c.tags?.includes(useCaseId)
    );

    const byModel = {};
    const byProvider = {};

    for (const cost of costs) {
      const model = cost.model || 'unknown';
      const provider = cost.provider || 'unknown';

      byModel[model] = (byModel[model] || 0) + cost.totalCost;
      byProvider[provider] = (byProvider[provider] || 0) + cost.totalCost;
    }

    return { byModel, byProvider };
  }

  /**
   * Calculate value from metrics
   */
  calculateValueForUseCase(useCaseId, metrics) {
    let totalValue = 0;

    for (const [metricKey, quantity] of Object.entries(metrics)) {
      const metricDef = VALUE_METRICS[metricKey];
      if (metricDef) {
        const rate = this.customValueRates[metricKey] || metricDef.defaultValuePer;
        totalValue += quantity * rate;
      }
    }

    return totalValue;
  }

  /**
   * Get value breakdown by metric type
   */
  getValueBreakdown(useCaseId, metrics) {
    const breakdown = {};

    for (const [metricKey, quantity] of Object.entries(metrics)) {
      const metricDef = VALUE_METRICS[metricKey];
      if (metricDef) {
        const rate = this.customValueRates[metricKey] || metricDef.defaultValuePer;
        breakdown[metricKey] = {
          name: metricDef.name,
          quantity,
          rate,
          value: quantity * rate
        };
      }
    }

    return breakdown;
  }

  /**
   * Determine ROI status
   */
  getROIStatus(roi) {
    if (roi >= 500) return { label: 'Exceptional', color: 'green', tier: 5 };
    if (roi >= 200) return { label: 'Strong', color: 'green', tier: 4 };
    if (roi >= 100) return { label: 'Good', color: 'blue', tier: 3 };
    if (roi >= 0) return { label: 'Positive', color: 'yellow', tier: 2 };
    return { label: 'Negative', color: 'red', tier: 1 };
  }

  /**
   * Compare to industry benchmark
   */
  compareToBenchmark(useCaseId, roi) {
    // Map use case to benchmark category
    const categoryMap = {
      'support_bot': 'customer_support',
      'chatbot': 'customer_support',
      'ticket_triage': 'customer_support',
      'content_writer': 'content_generation',
      'blog_generator': 'content_generation',
      'copilot': 'code_assistance',
      'code_review': 'code_assistance',
      'analytics': 'data_analysis',
      'reporting': 'data_analysis',
      'sales_ai': 'sales_enablement',
      'proposal_generator': 'sales_enablement'
    };

    const category = categoryMap[useCaseId] || 'general';
    const benchmark = INDUSTRY_BENCHMARKS[category];

    if (!benchmark) {
      return {
        available: false,
        message: 'No benchmark data available for this use case'
      };
    }

    // Calculate typical ROI for this category
    const typicalROI = this.calculateTypicalROI(category, benchmark);

    return {
      available: true,
      category,
      typicalROI,
      yourROI: roi,
      percentile: this.calculatePercentile(roi, typicalROI),
      comparison: roi > typicalROI ? 'above' : roi < typicalROI ? 'below' : 'at',
      gap: roi - typicalROI
    };
  }

  /**
   * Calculate typical ROI for a category
   */
  calculateTypicalROI(category, benchmark) {
    switch (category) {
      case 'customer_support':
        // (ticket cost saved - AI cost) / AI cost
        const savings = benchmark.avgTicketCost - benchmark.avgAITicketCost;
        return (savings / benchmark.avgAITicketCost) * 100;

      case 'content_generation':
        const timeSaved = benchmark.timePerPiece - benchmark.timeWithAI;
        const laborSaved = timeSaved * benchmark.hourlyRate;
        const aiCost = 2.00; // Estimated AI cost per piece
        return ((laborSaved - aiCost) / aiCost) * 100;

      case 'code_assistance':
        // Productivity gain value vs tool cost
        const devValueGain = benchmark.avgDeveloperCost * benchmark.productivityGain;
        const annualToolCost = 2400; // ~$200/month
        return ((devValueGain - annualToolCost) / annualToolCost) * 100;

      default:
        return 200; // Default 200% ROI benchmark
    }
  }

  /**
   * Calculate percentile vs benchmark
   */
  calculatePercentile(roi, benchmarkROI) {
    const ratio = roi / benchmarkROI;
    if (ratio >= 2.0) return 95;
    if (ratio >= 1.5) return 85;
    if (ratio >= 1.2) return 75;
    if (ratio >= 1.0) return 50;
    if (ratio >= 0.8) return 35;
    if (ratio >= 0.5) return 20;
    return 10;
  }

  /**
   * Identify optimization opportunities
   */
  identifyOpportunities(useCaseResults) {
    const opportunities = [];

    for (const result of useCaseResults) {
      // Negative ROI - needs attention
      if (result.roi.percentage < 0) {
        opportunities.push({
          useCaseId: result.useCaseId,
          type: 'negative_roi',
          severity: 'high',
          recommendation: 'Review use case viability or optimize implementation',
          potentialImpact: Math.abs(result.roi.netValue)
        });
      }

      // Below benchmark
      if (result.benchmark.available && result.benchmark.comparison === 'below') {
        opportunities.push({
          useCaseId: result.useCaseId,
          type: 'below_benchmark',
          severity: 'medium',
          recommendation: `ROI is ${Math.abs(result.benchmark.gap).toFixed(0)}% below industry average`,
          potentialImpact: (result.benchmark.gap / 100) * result.costs.total
        });
      }

      // High cost concentration
      const breakdown = result.costs.breakdown.byModel;
      const models = Object.keys(breakdown);
      if (models.length === 1) {
        opportunities.push({
          useCaseId: result.useCaseId,
          type: 'single_model_dependency',
          severity: 'low',
          recommendation: 'Consider model diversification for resilience',
          potentialImpact: result.costs.total * 0.1
        });
      }
    }

    return opportunities.sort((a, b) => b.potentialImpact - a.potentialImpact);
  }
}

// ============================================================================
// EXECUTIVE REPORT GENERATOR
// ============================================================================

class ExecutiveReportGenerator {
  constructor(roiCalculator) {
    this.calculator = roiCalculator;
  }

  /**
   * Generate executive summary report
   */
  generateExecutiveSummary(portfolioResult) {
    const { summary, insights } = portfolioResult;

    return {
      generatedAt: new Date().toISOString(),
      period: portfolioResult.period,

      headline: this.generateHeadline(summary),

      keyMetrics: {
        totalAIInvestment: {
          value: summary.totalCosts,
          formatted: this.formatCurrency(summary.totalCosts),
          trend: null // Would compare to previous period
        },
        totalValueGenerated: {
          value: summary.totalValue,
          formatted: this.formatCurrency(summary.totalValue),
          trend: null
        },
        netROI: {
          value: summary.portfolioROI,
          formatted: `${summary.portfolioROI.toFixed(1)}%`,
          status: this.getROIStatusLabel(summary.portfolioROI)
        },
        valueMultiple: {
          value: summary.totalCosts > 0 ? summary.totalValue / summary.totalCosts : 0,
          formatted: `${(summary.totalValue / summary.totalCosts).toFixed(1)}x`
        }
      },

      topPerformers: insights.topPerformers.map(uc => ({
        name: uc.useCaseId,
        roi: `${uc.roi.percentage.toFixed(0)}%`,
        value: this.formatCurrency(uc.value.total)
      })),

      attentionNeeded: insights.underperformers.map(uc => ({
        name: uc.useCaseId,
        roi: `${uc.roi.percentage.toFixed(0)}%`,
        loss: this.formatCurrency(Math.abs(uc.roi.netValue))
      })),

      recommendations: this.generateRecommendations(portfolioResult),

      benchmarkComparison: this.generateBenchmarkSummary(portfolioResult)
    };
  }

  /**
   * Generate C-suite friendly headline
   */
  generateHeadline(summary) {
    if (summary.portfolioROI >= 300) {
      return `AI investments delivering exceptional ${summary.portfolioROI.toFixed(0)}% ROI`;
    } else if (summary.portfolioROI >= 100) {
      return `Strong AI ROI: Every $1 invested returns $${(summary.totalValue / summary.totalCosts).toFixed(2)}`;
    } else if (summary.portfolioROI >= 0) {
      return `AI investments are profitable with ${summary.portfolioROI.toFixed(0)}% ROI`;
    } else {
      return `AI portfolio needs optimization - currently ${summary.portfolioROI.toFixed(0)}% ROI`;
    }
  }

  /**
   * Generate actionable recommendations
   */
  generateRecommendations(portfolioResult) {
    const recommendations = [];
    const { summary, insights, useCases } = portfolioResult;

    // Portfolio-level recommendations
    if (summary.portfolioROI < 100) {
      recommendations.push({
        priority: 'high',
        category: 'Optimization',
        action: 'Review and optimize underperforming AI use cases',
        impact: `Could improve ROI by ${Math.min(100, 100 - summary.portfolioROI).toFixed(0)}%+`
      });
    }

    // Use case specific recommendations
    for (const opportunity of insights.opportunities.slice(0, 3)) {
      recommendations.push({
        priority: opportunity.severity,
        category: opportunity.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        action: opportunity.recommendation,
        impact: this.formatCurrency(opportunity.potentialImpact) + ' potential savings'
      });
    }

    // Scaling recommendations
    const highROIUseCases = useCases.filter(uc => uc.roi.percentage > 200);
    if (highROIUseCases.length > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'Growth',
        action: `Scale high-performing use cases: ${highROIUseCases.map(uc => uc.useCaseId).join(', ')}`,
        impact: 'Multiply returns on proven implementations'
      });
    }

    return recommendations;
  }

  /**
   * Generate benchmark comparison summary
   */
  generateBenchmarkSummary(portfolioResult) {
    const benchmarked = portfolioResult.useCases.filter(uc => uc.benchmark.available);

    if (benchmarked.length === 0) {
      return { available: false };
    }

    const aboveBenchmark = benchmarked.filter(uc => uc.benchmark.comparison === 'above');
    const belowBenchmark = benchmarked.filter(uc => uc.benchmark.comparison === 'below');

    return {
      available: true,
      totalBenchmarked: benchmarked.length,
      aboveAverage: aboveBenchmark.length,
      belowAverage: belowBenchmark.length,
      averagePercentile: Math.round(
        benchmarked.reduce((sum, uc) => sum + uc.benchmark.percentile, 0) / benchmarked.length
      ),
      insight: aboveBenchmark.length > belowBenchmark.length
        ? 'Your AI implementations outperform industry averages'
        : 'There\'s opportunity to improve vs industry benchmarks'
    };
  }

  /**
   * Format currency
   */
  formatCurrency(amount) {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(1)}K`;
    }
    return `$${amount.toFixed(2)}`;
  }

  /**
   * Get ROI status label
   */
  getROIStatusLabel(roi) {
    if (roi >= 300) return '🚀 Exceptional';
    if (roi >= 100) return '✅ Strong';
    if (roi >= 0) return '📊 Positive';
    return '⚠️ Needs Attention';
  }
}

// ============================================================================
// COST-PER-TRANSACTION ANALYZER
// ============================================================================

class CostPerTransactionAnalyzer {
  constructor(costData, transactionData) {
    this.costData = costData;
    this.transactionData = transactionData;
  }

  /**
   * Calculate cost per transaction type
   */
  analyze() {
    const results = {};

    // Group costs by transaction type
    for (const transaction of this.transactionData) {
      const type = transaction.type || 'unknown';

      if (!results[type]) {
        results[type] = {
          type,
          totalCost: 0,
          transactionCount: 0,
          totalTokens: 0,
          totalLatencyMs: 0,
          models: new Set()
        };
      }

      results[type].totalCost += transaction.cost || 0;
      results[type].transactionCount += 1;
      results[type].totalTokens += (transaction.inputTokens || 0) + (transaction.outputTokens || 0);
      results[type].totalLatencyMs += transaction.latencyMs || 0;
      if (transaction.model) results[type].models.add(transaction.model);
    }

    // Calculate per-transaction metrics
    return Object.values(results).map(r => ({
      transactionType: r.type,
      metrics: {
        costPerTransaction: r.transactionCount > 0 ? r.totalCost / r.transactionCount : 0,
        avgTokensPerTransaction: r.transactionCount > 0 ? r.totalTokens / r.transactionCount : 0,
        avgLatencyMs: r.transactionCount > 0 ? r.totalLatencyMs / r.transactionCount : 0,
        totalTransactions: r.transactionCount,
        totalCost: r.totalCost,
        modelsUsed: Array.from(r.models)
      },
      efficiency: this.calculateEfficiencyScore(r)
    }));
  }

  /**
   * Calculate efficiency score (0-100)
   */
  calculateEfficiencyScore(result) {
    // Lower cost per transaction = better
    // Lower latency = better
    // Higher throughput = better

    const costScore = Math.max(0, 100 - (result.totalCost / result.transactionCount) * 100);
    const latencyScore = Math.max(0, 100 - (result.totalLatencyMs / result.transactionCount) / 50);

    return Math.round((costScore + latencyScore) / 2);
  }

  /**
   * Find cost optimization opportunities
   */
  findOptimizations() {
    const analysis = this.analyze();
    const optimizations = [];

    for (const result of analysis) {
      const metrics = result.metrics;

      // High cost per transaction
      if (metrics.costPerTransaction > 0.10) {
        optimizations.push({
          transactionType: result.transactionType,
          issue: 'High cost per transaction',
          current: `$${metrics.costPerTransaction.toFixed(4)}`,
          target: '$0.05',
          recommendation: 'Consider model downgrade or prompt optimization'
        });
      }

      // High latency
      if (metrics.avgLatencyMs > 3000) {
        optimizations.push({
          transactionType: result.transactionType,
          issue: 'High latency',
          current: `${metrics.avgLatencyMs.toFixed(0)}ms`,
          target: '<2000ms',
          recommendation: 'Consider faster models or streaming responses'
        });
      }

      // Low efficiency score
      if (result.efficiency < 50) {
        optimizations.push({
          transactionType: result.transactionType,
          issue: 'Low efficiency score',
          current: result.efficiency,
          target: 70,
          recommendation: 'Review and optimize this transaction type'
        });
      }
    }

    return optimizations;
  }
}

// ============================================================================
// TREND ANALYZER
// ============================================================================

class ROITrendAnalyzer {
  constructor(historicalData) {
    this.data = historicalData; // Array of { period, costs, value }
  }

  /**
   * Analyze ROI trends over time
   */
  analyzeTrends() {
    if (this.data.length < 2) {
      return { available: false, message: 'Insufficient data for trend analysis' };
    }

    const roiSeries = this.data.map(d => ({
      period: d.period,
      roi: d.costs > 0 ? ((d.value - d.costs) / d.costs) * 100 : 0,
      costs: d.costs,
      value: d.value
    }));

    const latest = roiSeries[roiSeries.length - 1];
    const previous = roiSeries[roiSeries.length - 2];
    const oldest = roiSeries[0];

    return {
      available: true,
      current: {
        period: latest.period,
        roi: latest.roi,
        costs: latest.costs,
        value: latest.value
      },
      trends: {
        roiChange: {
          vsLastPeriod: latest.roi - previous.roi,
          vsFirstPeriod: latest.roi - oldest.roi,
          direction: latest.roi > previous.roi ? 'improving' : 'declining'
        },
        costTrend: {
          vsLastPeriod: ((latest.costs - previous.costs) / previous.costs) * 100,
          direction: latest.costs > previous.costs ? 'increasing' : 'decreasing'
        },
        valueTrend: {
          vsLastPeriod: ((latest.value - previous.value) / previous.value) * 100,
          direction: latest.value > previous.value ? 'increasing' : 'decreasing'
        }
      },
      forecast: this.forecastNextPeriod(roiSeries),
      series: roiSeries
    };
  }

  /**
   * Simple linear forecast for next period
   */
  forecastNextPeriod(series) {
    if (series.length < 3) {
      return { available: false };
    }

    // Simple moving average of last 3 periods' ROI changes
    const changes = [];
    for (let i = 1; i < series.length; i++) {
      changes.push(series[i].roi - series[i - 1].roi);
    }

    const avgChange = changes.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, changes.length);
    const forecastROI = series[series.length - 1].roi + avgChange;

    return {
      available: true,
      forecastedROI: Math.round(forecastROI * 100) / 100,
      confidence: this.calculateForecastConfidence(changes),
      methodology: 'Moving average of recent ROI changes'
    };
  }

  /**
   * Calculate forecast confidence based on volatility
   */
  calculateForecastConfidence(changes) {
    if (changes.length < 2) return 'low';

    const avg = changes.reduce((a, b) => a + b, 0) / changes.length;
    const variance = changes.reduce((sum, c) => sum + Math.pow(c - avg, 2), 0) / changes.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev < 10) return 'high';
    if (stdDev < 30) return 'medium';
    return 'low';
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export {
  ROICalculator,
  ExecutiveReportGenerator,
  CostPerTransactionAnalyzer,
  ROITrendAnalyzer,
  VALUE_METRICS,
  INDUSTRY_BENCHMARKS
};

// Usage Example:
/*
const calculator = new ROICalculator({
  costData: [
    { useCaseId: 'support_bot', model: 'gpt-4o-mini', totalCost: 450 },
    { useCaseId: 'support_bot', model: 'claude-3-haiku', totalCost: 280 }
  ],
  timeRange: 'month'
});

const useCases = [
  {
    id: 'support_bot',
    metrics: {
      tickets_deflected: 3200,
      time_saved_hours: 120
    }
  },
  {
    id: 'content_writer',
    metrics: {
      content_pieces: 85,
      time_saved_hours: 200
    }
  }
];

const portfolio = calculator.calculatePortfolioROI(useCases);
const reporter = new ExecutiveReportGenerator(calculator);
const executiveSummary = reporter.generateExecutiveSummary(portfolio);
console.log(executiveSummary);
*/
