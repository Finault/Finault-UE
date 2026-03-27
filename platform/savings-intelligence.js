/**
 * Finault Savings Intelligence and AI Spend Optimization Engine
 * Comprehensive module for analyzing, recommending, and tracking AI cost savings
 * Features: Model optimization, prompt analysis, caching, batching, provider arbitrage, benchmarking
 */

// ============================================================================
// PRICING DATA
// CANONICAL SOURCE: platform/model-registry.js LOCAL_FALLBACK_PRICING
// All values per 1K tokens. Last aligned: 2026-03-01
// ============================================================================

const MODEL_PRICING = {
  // OpenAI Models
  'gpt-4-turbo': {
    provider: 'OpenAI',
    family: 'GPT-4',
    inputCost: 0.01,       // per 1K tokens — $10/1M
    outputCost: 0.03,      // per 1K tokens — $30/1M
    qualityScore: 0.95,
    speedScore: 0.85,
    releaseDate: '2024-04-09',
    maxTokens: 128000,
    contextWindow: 128000,
    capabilities: ['text', 'vision', 'reasoning', 'code']
  },
  'gpt-4o': {
    provider: 'OpenAI',
    family: 'GPT-4',
    inputCost: 0.0025,    // per 1K tokens — $2.50/1M (post price cut)
    outputCost: 0.01,     // per 1K tokens — $10/1M
    qualityScore: 0.92,
    speedScore: 0.88,
    releaseDate: '2024-05-13',
    maxTokens: 128000,
    contextWindow: 128000,
    capabilities: ['text', 'vision', 'reasoning', 'code']
  },
  'gpt-4o-mini': {
    provider: 'OpenAI',
    family: 'GPT-4',
    inputCost: 0.00015,
    outputCost: 0.0006,
    qualityScore: 0.80,
    speedScore: 0.95,
    releaseDate: '2024-07-18',
    maxTokens: 128000,
    contextWindow: 128000,
    capabilities: ['text', 'vision', 'code']
  },
  'gpt-3.5-turbo': {
    provider: 'OpenAI',
    family: 'GPT-3.5',
    inputCost: 0.0005,
    outputCost: 0.0015,
    qualityScore: 0.75,
    speedScore: 0.98,
    releaseDate: '2023-03-15',
    maxTokens: 16385,
    contextWindow: 16385,
    capabilities: ['text', 'code']
  },

  // Anthropic Models
  'claude-opus-4.5': {
    provider: 'Anthropic',
    family: 'Claude',
    inputCost: 0.015,
    outputCost: 0.075,
    qualityScore: 0.98,
    speedScore: 0.80,
    releaseDate: '2025-11-01',
    maxTokens: 200000,
    contextWindow: 200000,
    capabilities: ['text', 'reasoning', 'analysis', 'code', 'vision']
  },
  'claude-3.5-sonnet': {
    provider: 'Anthropic',
    family: 'Claude',
    inputCost: 0.003,
    outputCost: 0.015,
    qualityScore: 0.92,
    speedScore: 0.88,
    releaseDate: '2024-10-22',
    maxTokens: 200000,
    contextWindow: 200000,
    capabilities: ['text', 'reasoning', 'analysis', 'code', 'vision']
  },
  'claude-3.5-haiku': {
    provider: 'Anthropic',
    family: 'Claude',
    inputCost: 0.00080,
    outputCost: 0.0040,
    qualityScore: 0.85,
    speedScore: 0.95,
    releaseDate: '2024-11-14',
    maxTokens: 200000,
    contextWindow: 200000,
    capabilities: ['text', 'analysis', 'code']
  },

  // Google Models
  'gemini-2.0-flash': {
    provider: 'Google',
    family: 'Gemini',
    inputCost: 0.001,
    outputCost: 0.004,
    qualityScore: 0.85,
    speedScore: 0.92,
    releaseDate: '2025-12-11',
    maxTokens: 1000000,
    contextWindow: 1000000,
    capabilities: ['text', 'vision', 'audio', 'code']
  },
  'gemini-1.5-pro': {
    provider: 'Google',
    family: 'Gemini',
    inputCost: 0.00125,
    outputCost: 0.005,
    qualityScore: 0.88,
    speedScore: 0.85,
    releaseDate: '2024-05-14',
    maxTokens: 2000000,
    contextWindow: 2000000,
    capabilities: ['text', 'vision', 'audio', 'code']
  },
  'gemini-1.5-flash': {
    provider: 'Google',
    family: 'Gemini',
    inputCost: 0.00005,
    outputCost: 0.0002,
    qualityScore: 0.78,
    speedScore: 0.97,
    releaseDate: '2024-05-14',
    maxTokens: 1000000,
    contextWindow: 1000000,
    capabilities: ['text', 'vision']
  },

  // Meta Models
  'llama-3.1-405b': {
    provider: 'Meta',
    family: 'Llama',
    inputCost: 0.0027,
    outputCost: 0.0081,
    qualityScore: 0.88,
    speedScore: 0.82,
    releaseDate: '2024-07-23',
    maxTokens: 128000,
    contextWindow: 128000,
    capabilities: ['text', 'reasoning', 'code']
  },
  'llama-3.1-70b': {
    provider: 'Meta',
    family: 'Llama',
    inputCost: 0.00045,
    outputCost: 0.0009,
    qualityScore: 0.80,
    speedScore: 0.90,
    releaseDate: '2024-07-23',
    maxTokens: 128000,
    contextWindow: 128000,
    capabilities: ['text', 'reasoning', 'code']
  },

  // Mistral Models
  'mistral-large': {
    provider: 'Mistral',
    family: 'Mistral',
    inputCost: 0.0024,
    outputCost: 0.0072,
    qualityScore: 0.82,
    speedScore: 0.87,
    releaseDate: '2024-02-08',
    maxTokens: 32000,
    contextWindow: 32000,
    capabilities: ['text', 'code']
  },
  'mistral-small': {
    provider: 'Mistral',
    family: 'Mistral',
    inputCost: 0.00014,
    outputCost: 0.00042,
    qualityScore: 0.70,
    speedScore: 0.96,
    releaseDate: '2024-02-08',
    maxTokens: 32000,
    contextWindow: 32000,
    capabilities: ['text']
  }
};

// Caching pricing multipliers (if applicable)
const CACHING_SAVINGS = {
  prompt_caching_input: 0.9,    // 90% discount on cached input tokens
  prompt_caching_output: 1.0,   // No discount on output
  batch_processing: 0.5,        // 50% discount for batch API
  reserved_capacity: 0.7        // 30% discount with reserved capacity
};

// Industry benchmarks (tokens per $ spent)
const INDUSTRY_BENCHMARKS = {
  'saas-startup': {
    avgMonthlySpend: 5000,
    avgTokensPerMonth: 500000000,
    efficiency: 100000,
    qualityScore: 0.75
  },
  'saas-scale': {
    avgMonthlySpend: 50000,
    avgTokensPerMonth: 8000000000,
    efficiency: 160000,
    qualityScore: 0.82
  },
  'enterprise': {
    avgMonthlySpend: 500000,
    avgTokensPerMonth: 80000000000,
    efficiency: 160000,
    qualityScore: 0.88
  },
  'finance': {
    avgMonthlySpend: 150000,
    avgTokensPerMonth: 12000000000,
    efficiency: 80000,
    qualityScore: 0.95
  },
  'healthcare': {
    avgMonthlySpend: 100000,
    avgTokensPerMonth: 8000000000,
    efficiency: 80000,
    qualityScore: 0.93
  }
};

// ============================================================================
// TOKEN EFFICIENCY ANALYZER
// ============================================================================

class TokenEfficiencyAnalyzer {
  constructor() {
    this.patterns = {
      verbose: /^(please|kindly|could you|would you|i would like)/i,
      repetitive: /\b(\w+)\b(?:\s+\1)+/g,
      filler: /\b(very|really|actually|basically|essentially|literally)\b/gi,
      unnecessary_context: /^(background|context|note:|information:)/im,
      long_examples: /(example|sample|instance):.{500,}/i
    };
  }

  /**
   * Analyze prompt efficiency and identify optimization opportunities
   */
  analyzePromptEfficiency(prompts) {
    if (!Array.isArray(prompts)) {
      prompts = [prompts];
    }

    const analysis = {
      totalPrompts: prompts.length,
      scores: [],
      patterns: {},
      opportunities: [],
      estimatedSavings: 0
    };

    prompts.forEach((prompt, idx) => {
      const score = this.scoreEfficiency(prompt);
      analysis.scores.push(score);

      const suggestions = this.suggestOptimizations(prompt);
      analysis.opportunities.push(...suggestions);

      // Calculate token savings
      const tokensSaved = this.estimateTokenSavings(prompt, suggestions);
      analysis.estimatedSavings += tokensSaved;
    });

    // Aggregate patterns
    analysis.patterns = this.aggregatePatterns(prompts);
    analysis.avgEfficiencyScore = analysis.scores.reduce((a, b) => a + b, 0) / analysis.scores.length;

    return analysis;
  }

  /**
   * Score prompt efficiency (0-100)
   */
  scoreEfficiency(prompt) {
    let score = 100;
    const length = prompt.length;

    // Penalize overly long prompts
    if (length > 5000) score -= 20;
    else if (length > 2000) score -= 10;
    else if (length > 1000) score -= 5;

    // Check for verbose patterns
    if (this.patterns.verbose.test(prompt)) score -= 5;
    if (this.patterns.repetitive.test(prompt)) score -= 10;
    if ((prompt.match(this.patterns.filler) || []).length > 3) score -= 5;
    if (this.patterns.unnecessary_context.test(prompt)) score -= 10;
    if (this.patterns.long_examples.test(prompt)) score -= 15;

    // Bonus for structured format
    if (/```|###|---|\[.*\]:|".*":|---/.test(prompt)) score += 5;

    // Bonus for clear instructions
    if (/^(task:|goal:|objective:|steps:|format:)/im.test(prompt)) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Suggest specific optimizations for a prompt
   */
  suggestOptimizations(prompt) {
    const suggestions = [];
    const originalLength = prompt.length;

    // Verbose language
    if (this.patterns.verbose.test(prompt)) {
      suggestions.push({
        type: 'verbose_language',
        severity: 'medium',
        current: 'Using polite prefixes (please, could you, etc.)',
        suggestion: 'Remove unnecessary politeness markers',
        estimatedTokenReduction: Math.ceil(originalLength * 0.02)
      });
    }

    // Repetitive words
    const repetitions = prompt.match(this.patterns.repetitive);
    if (repetitions) {
      suggestions.push({
        type: 'repetitive_content',
        severity: 'low',
        current: `Repeated words found: ${repetitions.join(', ')}`,
        suggestion: 'Use pronouns or references instead of repeating words',
        estimatedTokenReduction: repetitions.length * 2
      });
    }

    // Filler words
    const fillers = prompt.match(this.patterns.filler) || [];
    if (fillers.length > 3) {
      suggestions.push({
        type: 'filler_words',
        severity: 'low',
        current: `Filler words used ${fillers.length} times`,
        suggestion: 'Remove: very, really, actually, basically, essentially, literally',
        estimatedTokenReduction: Math.ceil(fillers.length * 1)
      });
    }

    // Unnecessary context
    if (this.patterns.unnecessary_context.test(prompt)) {
      suggestions.push({
        type: 'unnecessary_context',
        severity: 'medium',
        current: 'Including unnecessary background/context sections',
        suggestion: 'Move non-critical context to system message or remove entirely',
        estimatedTokenReduction: Math.ceil(originalLength * 0.10)
      });
    }

    // Long examples
    if (this.patterns.long_examples.test(prompt)) {
      suggestions.push({
        type: 'verbose_examples',
        severity: 'high',
        current: 'Including multiple or very long examples',
        suggestion: 'Use 1-2 concise examples or move to few-shot context',
        estimatedTokenReduction: Math.ceil(originalLength * 0.20)
      });
    }

    // Unstructured formatting
    if (!/```|###|---|\[.*\]:|".*":|```/.test(prompt)) {
      suggestions.push({
        type: 'formatting',
        severity: 'low',
        current: 'Unstructured prompt format',
        suggestion: 'Use markdown formatting, JSON, or clear sections',
        estimatedTokenReduction: Math.ceil(originalLength * 0.05)
      });
    }

    return suggestions;
  }

  /**
   * Estimate token savings from applying suggestions
   */
  estimateTokenSavings(prompt, suggestions) {
    return suggestions.reduce((total, suggestion) => {
      return total + (suggestion.estimatedTokenReduction || 0);
    }, 0);
  }

  /**
   * Aggregate patterns across multiple prompts
   */
  aggregatePatterns(prompts) {
    const patterns = {
      verbose: 0,
      repetitive: 0,
      filler: 0,
      unnecessary_context: 0,
      verbose_examples: 0
    };

    prompts.forEach(prompt => {
      if (this.patterns.verbose.test(prompt)) patterns.verbose++;
      if (this.patterns.repetitive.test(prompt)) patterns.repetitive++;
      const fillers = prompt.match(this.patterns.filler) || [];
      if (fillers.length > 3) patterns.filler++;
      if (this.patterns.unnecessary_context.test(prompt)) patterns.unnecessary_context++;
      if (this.patterns.long_examples.test(prompt)) patterns.verbose_examples++;
    });

    return patterns;
  }
}

// ============================================================================
// MODEL SELECTOR
// ============================================================================

class ModelSelector {
  constructor() {
    this.models = MODEL_PRICING;
  }

  /**
   * Recommend the best model for a task
   */
  recommendModel(taskType, qualityRequirements = 0.8, budget = null) {
    const candidates = Object.entries(this.models)
      .filter(([_, model]) => {
        // Filter by quality requirement
        if (model.qualityScore < qualityRequirements) return false;

        // Filter by budget if specified (monthly budget in dollars)
        if (budget) {
          const estimatedMonthlyCost = this.estimateMonthlyCost(_, 1000000); // 1M tokens baseline
          if (estimatedMonthlyCost > budget) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Score based on cost-efficiency and quality
        const scoreA = (a[1].qualityScore * 0.6) - (this.getAverageCost(a[0]) * 0.4);
        const scoreB = (b[1].qualityScore * 0.6) - (this.getAverageCost(b[0]) * 0.4);
        return scoreB - scoreA;
      });

    if (candidates.length === 0) {
      return { recommendation: 'gpt-4o', reason: 'No models match criteria, using balanced default' };
    }

    const [modelName, model] = candidates[0];
    return {
      recommended: modelName,
      model: model,
      costPerMillionTokens: this.getCostPerMillionTokens(modelName),
      qualityScore: model.qualityScore,
      speedScore: model.speedScore,
      alternatives: candidates.slice(1, 3).map(([name, m]) => ({
        name,
        costPerMillionTokens: this.getCostPerMillionTokens(name),
        qualityScore: m.qualityScore,
        savings: this.getCostPerMillionTokens(modelName) - this.getCostPerMillionTokens(name)
      }))
    };
  }

  /**
   * Compare multiple models with test cases
   */
  compareModels(modelNames, testCases = null) {
    const comparison = {
      models: [],
      bestOverall: null,
      bestValue: null,
      bestSpeed: null,
      savings: {}
    };

    // If no test cases provided, use defaults
    if (!testCases) {
      testCases = [
        { name: 'short', inputTokens: 100, outputTokens: 50 },
        { name: 'medium', inputTokens: 1000, outputTokens: 500 },
        { name: 'long', inputTokens: 10000, outputTokens: 2000 }
      ];
    }

    modelNames.forEach(modelName => {
      if (!this.models[modelName]) return;

      const model = this.models[modelName];
      const costComparison = {};
      let totalCost = 0;

      testCases.forEach(testCase => {
        const cost = (testCase.inputTokens * model.inputCost + testCase.outputTokens * model.outputCost) / 1000;
        costComparison[testCase.name] = cost;
        totalCost += cost;
      });

      comparison.models.push({
        name: modelName,
        provider: model.provider,
        qualityScore: model.qualityScore,
        speedScore: model.speedScore,
        costPerMillionTokens: this.getCostPerMillionTokens(modelName),
        testCases: costComparison,
        totalCostOnTests: totalCost,
        contextWindow: model.contextWindow,
        capabilities: model.capabilities
      });
    });

    // Determine best models
    comparison.bestOverall = comparison.models.reduce((best, current) => {
      const currentScore = current.qualityScore * 0.6 + current.speedScore * 0.4;
      const bestScore = best.qualityScore * 0.6 + best.speedScore * 0.4;
      return currentScore > bestScore ? current : best;
    });

    comparison.bestValue = comparison.models.reduce((best, current) => {
      const currentValue = current.qualityScore / current.costPerMillionTokens;
      const bestValue = best.qualityScore / best.costPerMillionTokens;
      return currentValue > bestValue ? current : best;
    });

    comparison.bestSpeed = comparison.models.reduce((best, current) => {
      return current.speedScore > best.speedScore ? current : best;
    });

    // Calculate savings
    const mostExpensive = comparison.models.reduce((max, current) =>
      current.costPerMillionTokens > max.costPerMillionTokens ? current : max
    );

    comparison.models.forEach(model => {
      const savings = mostExpensive.costPerMillionTokens - model.costPerMillionTokens;
      const savingsPercent = (savings / mostExpensive.costPerMillionTokens) * 100;
      comparison.savings[model.name] = {
        dollarSavings: savings,
        percentSavings: savingsPercent,
        vsExpensive: mostExpensive.name
      };
    });

    return comparison;
  }

  /**
   * Get average cost per token
   */
  getAverageCost(modelName) {
    const model = this.models[modelName];
    if (!model) return Infinity;
    return (model.inputCost + model.outputCost) / 2;
  }

  /**
   * Get cost per million tokens
   */
  getCostPerMillionTokens(modelName) {
    const model = this.models[modelName];
    if (!model) return 0;
    // Assume typical 1:1 input/output ratio
    return ((model.inputCost + model.outputCost) / 2) * 1000;
  }

  /**
   * Estimate monthly cost for a model
   */
  estimateMonthlyCost(modelName, monthlyTokens) {
    const model = this.models[modelName];
    if (!model) return 0;

    // Rough estimate: 70% input, 30% output
    const inputTokens = monthlyTokens * 0.7;
    const outputTokens = monthlyTokens * 0.3;

    return (inputTokens * model.inputCost + outputTokens * model.outputCost) / 1000;
  }
}

// ============================================================================
// SAVINGS INTELLIGENCE - MAIN CLASS
// ============================================================================

class SavingsIntelligence {
  constructor(config = {}) {
    this.config = {
      companyId: config.companyId || 'company-001',
      industry: config.industry || 'saas-startup',
      monthlyBudget: config.monthlyBudget || 10000,
      qualityThreshold: config.qualityThreshold || 0.8,
      ...config
    };

    this.tokenAnalyzer = new TokenEfficiencyAnalyzer();
    this.modelSelector = new ModelSelector();
    this.recommendations = new Map();
    this.implementations = new Map();
    this.actualSavings = new Map();
  }

  /**
   * Comprehensive usage analysis
   */
  analyze(usageData, options = {}) {
    const analysis = {
      period: options.period || 'monthly',
      timestamp: new Date().toISOString(),
      summary: {},
      opportunities: [],
      benchmarking: {},
      detailed: {}
    };

    // Validate input
    if (!usageData || typeof usageData !== 'object') {
      throw new Error('Usage data must be a valid object');
    }

    // Basic metrics
    analysis.summary = this.calculateBasicMetrics(usageData);

    // Find all savings opportunities
    analysis.opportunities = this.findSavingsOpportunities(usageData);

    // Benchmarking
    analysis.benchmarking = this.compareToIndustry(usageData);

    // Detailed analysis
    analysis.detailed = {
      modelOptimizations: this.recommendModelOptimizations(usageData),
      promptOptimizations: this.recommendPromptOptimizations(usageData),
      cachingOpportunities: this.recommendCachingOpportunities(usageData),
      batchingOpportunities: this.recommendBatchingOpportunities(usageData),
      providerArbitrage: this.recommendProviderArbitrage(usageData)
    };

    // Calculate total potential savings
    analysis.totalPotentialSavings = analysis.opportunities.reduce((sum, opp) => {
      return sum + (opp.monthlySavings || 0);
    }, 0);

    return analysis;
  }

  /**
   * Calculate basic metrics from usage data
   */
  calculateBasicMetrics(usageData) {
    const metrics = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      requestCount: 0,
      modelBreakdown: {},
      costByModel: {},
      avgCostPerRequest: 0,
      avgInputTokens: 0,
      avgOutputTokens: 0
    };

    if (usageData.requests && Array.isArray(usageData.requests)) {
      usageData.requests.forEach(req => {
        metrics.totalInputTokens += req.inputTokens || 0;
        metrics.totalOutputTokens += req.outputTokens || 0;
        metrics.requestCount += 1;

        const model = req.model;
        if (model) {
          metrics.modelBreakdown[model] = (metrics.modelBreakdown[model] || 0) + 1;
          const modelPrice = this.modelSelector.models[model];
          if (modelPrice) {
            const reqCost = ((req.inputTokens || 0) * modelPrice.inputCost +
                            (req.outputTokens || 0) * modelPrice.outputCost) / 1000;
            metrics.costByModel[model] = (metrics.costByModel[model] || 0) + reqCost;
            metrics.totalCost += reqCost;
          }
        }
      });

      metrics.avgCostPerRequest = metrics.requestCount > 0 ? metrics.totalCost / metrics.requestCount : 0;
      metrics.avgInputTokens = metrics.requestCount > 0 ? metrics.totalInputTokens / metrics.requestCount : 0;
      metrics.avgOutputTokens = metrics.requestCount > 0 ? metrics.totalOutputTokens / metrics.requestCount : 0;
    } else if (usageData.totalCost !== undefined) {
      metrics.totalCost = usageData.totalCost;
      metrics.totalInputTokens = usageData.totalInputTokens || 0;
      metrics.totalOutputTokens = usageData.totalOutputTokens || 0;
      metrics.requestCount = usageData.requestCount || 0;
    }

    return metrics;
  }

  /**
   * Find all savings opportunities
   */
  findSavingsOpportunities(data) {
    const opportunities = [];

    // Model optimization opportunities
    const modelOpts = this.recommendModelOptimizations(data);
    opportunities.push(...modelOpts.map(opt => ({
      ...opt,
      category: 'model_optimization',
      priority: opt.monthlySavings / (data.totalCost || 1) > 0.15 ? 'high' : 'medium'
    })));

    // Prompt optimization opportunities
    const promptOpts = this.recommendPromptOptimizations(data);
    opportunities.push(...promptOpts.map(opt => ({
      ...opt,
      category: 'prompt_optimization',
      priority: opt.monthlySavings / (data.totalCost || 1) > 0.10 ? 'high' : 'medium'
    })));

    // Caching opportunities
    const cachingOpts = this.recommendCachingOpportunities(data);
    opportunities.push(...cachingOpts.map(opt => ({
      ...opt,
      category: 'caching',
      priority: 'high'
    })));

    // Batching opportunities
    const batchingOpts = this.recommendBatchingOpportunities(data);
    opportunities.push(...batchingOpts.map(opt => ({
      ...opt,
      category: 'batching',
      priority: 'medium'
    })));

    // Provider arbitrage
    const arbitrageOpts = this.recommendProviderArbitrage(data);
    opportunities.push(...arbitrageOpts.map(opt => ({
      ...opt,
      category: 'provider_arbitrage',
      priority: opt.monthlySavings / (data.totalCost || 1) > 0.20 ? 'high' : 'medium'
    })));

    // Sort by impact
    return opportunities.sort((a, b) => b.monthlySavings - a.monthlySavings);
  }

  /**
   * Recommend model optimizations
   */
  recommendModelOptimizations(data) {
    const recommendations = [];

    if (!data.modelBreakdown) {
      return recommendations;
    }

    // Analyze each model being used
    Object.entries(data.modelBreakdown).forEach(([currentModel, count]) => {
      const modelPrice = this.modelSelector.models[currentModel];
      if (!modelPrice) return;

      const currentCost = (data.costByModel && data.costByModel[currentModel]) || 0;

      // For each model, find cheaper alternatives
      Object.entries(this.modelSelector.models).forEach(([altModel, altPrice]) => {
        if (altModel === currentModel) return;

        // Check if alternative meets quality requirements
        if (altPrice.qualityScore < this.config.qualityThreshold) return;

        // Calculate cost difference
        const costDifference = modelPrice.inputCost - altPrice.inputCost;
        const outputDifference = modelPrice.outputCost - altPrice.outputCost;

        if (costDifference > 0 || outputDifference > 0) {
          // Estimate token distribution (70% input, 30% output)
          const estimatedInputTokens = (data.totalInputTokens || 0) * (count / (data.requestCount || 1));
          const estimatedOutputTokens = (data.totalOutputTokens || 0) * (count / (data.requestCount || 1));

          const potentialSavings = (estimatedInputTokens * costDifference +
                                   estimatedOutputTokens * outputDifference) / 1000;

          if (potentialSavings > 10) { // Only recommend if > $10/month savings
            recommendations.push({
              id: `model_opt_${currentModel}_to_${altModel}`,
              type: 'model_switch',
              currentModel,
              recommendedModel: altModel,
              currentQuality: modelPrice.qualityScore,
              newQuality: altPrice.qualityScore,
              currentCostPerMillion: this.modelSelector.getCostPerMillionTokens(currentModel),
              newCostPerMillion: this.modelSelector.getCostPerMillionTokens(altModel),
              monthlySavings: Math.round(potentialSavings),
              percentSavings: Math.round((potentialSavings / currentCost) * 100),
              effort: 'low',
              implementationTime: '< 1 hour',
              reason: `${altModel} offers ${Math.round((altPrice.qualityScore / modelPrice.qualityScore) * 100)}% of the quality at ${Math.round((this.modelSelector.getCostPerMillionTokens(altModel) / this.modelSelector.getCostPerMillionTokens(currentModel)) * 100)}% of the cost`
            });
          }
        }
      });
    });

    return recommendations.sort((a, b) => b.monthlySavings - a.monthlySavings).slice(0, 5);
  }

  /**
   * Recommend prompt optimizations
   */
  recommendPromptOptimizations(data) {
    const recommendations = [];

    if (!data.prompts || !Array.isArray(data.prompts) || data.prompts.length === 0) {
      return recommendations;
    }

    const efficiency = this.tokenAnalyzer.analyzePromptEfficiency(data.prompts);

    if (efficiency.avgEfficiencyScore < 80) {
      const estimatedTokensWasted = efficiency.estimatedSavings;
      const avgCostPerToken = (data.totalCost || 1) / (data.totalInputTokens + data.totalOutputTokens || 1);
      const potentialSavings = estimatedTokensWasted * avgCostPerToken;

      recommendations.push({
        id: 'prompt_opt_verbose',
        type: 'prompt_optimization',
        issue: 'Prompts are inefficiently written',
        currentEfficiencyScore: Math.round(efficiency.avgEfficiencyScore),
        targetEfficiencyScore: 90,
        verbosePatterns: efficiency.patterns,
        estimatedTokenReduction: Math.round(estimatedTokensWasted),
        monthlySavings: Math.round(potentialSavings),
        percentSavings: Math.round((potentialSavings / (data.totalCost || 1)) * 100),
        effort: 'medium',
        implementationTime: '2-4 hours',
        suggestions: efficiency.opportunities.slice(0, 5),
        reason: 'Restructuring prompts for clarity and conciseness'
      });
    }

    return recommendations;
  }

  /**
   * Recommend caching opportunities
   */
  recommendCachingOpportunities(data) {
    const recommendations = [];

    if (!data.requests || !Array.isArray(data.requests)) {
      return recommendations;
    }

    // Analyze for cacheable patterns
    const requestGroups = this.groupRequestsByPromptSimilarity(data.requests);
    let totalCachingPotential = 0;

    Object.entries(requestGroups).forEach(([pattern, requests]) => {
      if (requests.length < 3) return; // Need at least 3 similar requests to cache

      const firstRequest = requests[0];
      const modelPrice = this.modelSelector.models[firstRequest.model];
      if (!modelPrice) return;

      // Calculate savings from caching
      const cachedInputTokens = firstRequest.inputTokens || 0;
      const totalRequestsWithCache = requests.length;
      const standardCost = (cachedInputTokens * modelPrice.inputCost) / 1000;
      const cachedCost = (cachedInputTokens * modelPrice.inputCost * CACHING_SAVINGS.prompt_caching_input) / 1000;
      const savingsPerRequest = standardCost - cachedCost;
      const monthlySavings = Math.round(savingsPerRequest * totalRequestsWithCache);

      if (monthlySavings > 5) {
        totalCachingPotential += monthlySavings;
        recommendations.push({
          id: `cache_${pattern}`,
          type: 'prompt_caching',
          patternDescription: pattern,
          similarRequests: totalRequestsWithCache,
          cachedTokens: cachedInputTokens,
          model: firstRequest.model,
          monthlySavings,
          percentSavings: Math.round((monthlySavings / (data.totalCost || 1)) * 100),
          effort: 'low',
          implementationTime: '< 30 minutes',
          reason: `Cache ${cachedInputTokens} context tokens for ${totalRequestsWithCache} similar requests/month`
        });
      }
    });

    if (totalCachingPotential > 0) {
      recommendations.unshift({
        id: 'cache_summary',
        type: 'caching_strategy',
        description: 'Implement prompt caching for repetitive requests',
        totalCacheableSimilarRequests: data.requests.length * 0.3, // Estimate
        monthlySavings: Math.round(totalCachingPotential),
        percentSavings: Math.round((totalCachingPotential / (data.totalCost || 1)) * 100),
        effort: 'medium',
        implementationTime: '4-8 hours',
        reason: 'Many requests share common context that can be cached'
      });
    }

    return recommendations;
  }

  /**
   * Recommend batching opportunities
   */
  recommendBatchingOpportunities(data) {
    const recommendations = [];

    if (!data.requests || !Array.isArray(data.requests)) {
      return recommendations;
    }

    // Count non-realtime requests
    const batchableRequests = data.requests.filter(req =>
      req.priority !== 'realtime' && req.priority !== 'urgent'
    );

    if (batchableRequests.length > 0) {
      const batchableTokens = batchableRequests.reduce((sum, req) => {
        return sum + (req.inputTokens || 0) + (req.outputTokens || 0);
      }, 0);

      const avgCostPerToken = (data.totalCost || 1) / (data.totalInputTokens + data.totalOutputTokens || 1);
      const standardCost = batchableTokens * avgCostPerToken;
      const batchCost = standardCost * CACHING_SAVINGS.batch_processing;
      const monthlySavings = Math.round(standardCost - batchCost);

      if (monthlySavings > 10) {
        recommendations.push({
          id: 'batch_api',
          type: 'batch_processing',
          description: 'Use batch API for non-realtime requests',
          batchableRequests: batchableRequests.length,
          batchableTokens,
          monthlySavings,
          percentSavings: Math.round((monthlySavings / (data.totalCost || 1)) * 100),
          discount: 50,
          effort: 'medium',
          implementationTime: '4-8 hours',
          reason: 'Batch API offers 50% discount for non-urgent requests'
        });
      }
    }

    return recommendations;
  }

  /**
   * Recommend provider arbitrage
   */
  recommendProviderArbitrage(data) {
    const recommendations = [];

    if (!data.modelBreakdown) {
      return recommendations;
    }

    // Group by provider
    const byProvider = {};
    Object.entries(data.modelBreakdown).forEach(([model, count]) => {
      const provider = this.modelSelector.models[model]?.provider || 'unknown';
      byProvider[provider] = (byProvider[provider] || 0) + count;
    });

    // Check if can switch providers
    if (Object.keys(byProvider).length > 1) {
      const providers = Object.keys(byProvider);
      const comparison = this.modelSelector.compareModels(
        Object.keys(this.modelSelector.models).filter(m => {
          const p = this.modelSelector.models[m].provider;
          return providers.includes(p);
        })
      );

      const currentTotalCost = data.totalCost || 1;
      const bestProvider = comparison.bestValue;

      if (bestProvider) {
        const potentialSavings = Math.round(currentTotalCost * 0.1); // Estimate 10% saving

        if (potentialSavings > 50) {
          recommendations.push({
            id: 'provider_switch',
            type: 'provider_arbitrage',
            description: 'Consider switching to more cost-efficient provider',
            currentProviders: providers,
            recommendedProvider: bestProvider.provider,
            recommendedModel: bestProvider.name,
            monthlySavings: potentialSavings,
            percentSavings: Math.round((potentialSavings / currentTotalCost) * 100),
            effort: 'high',
            implementationTime: '1-2 weeks',
            reason: `${bestProvider.provider} offers ${bestProvider.qualityScore} quality at lower cost`
          });
        }
      }
    }

    return recommendations;
  }

  /**
   * Get industry benchmarks
   */
  getBenchmarks(industry = this.config.industry, companySize = 'scale') {
    const benchmark = INDUSTRY_BENCHMARKS[industry] || INDUSTRY_BENCHMARKS['saas-scale'];

    return {
      industry,
      avgMonthlySpend: benchmark.avgMonthlySpend,
      avgTokensPerMonth: benchmark.avgTokensPerMonth,
      efficiency: benchmark.efficiency,
      qualityScore: benchmark.qualityScore,
      costPerMillionTokens: (benchmark.avgMonthlySpend / (benchmark.avgTokensPerMonth / 1000000))
    };
  }

  /**
   * Compare usage to industry benchmarks
   */
  compareToIndustry(usageData) {
    const benchmark = this.getBenchmarks();
    const metrics = this.calculateBasicMetrics(usageData);

    const tokensPerMonth = metrics.totalInputTokens + metrics.totalOutputTokens;
    const efficiency = metrics.totalCost > 0 ? tokensPerMonth / metrics.totalCost : 0;
    const benchmarkEfficiency = benchmark.avgTokensPerMonth / benchmark.avgMonthlySpend;

    return {
      company: {
        monthlySpend: Math.round(metrics.totalCost),
        tokensPerMonth: tokensPerMonth,
        efficiency: Math.round(efficiency),
        costPerMillionTokens: metrics.totalCost > 0 ? (metrics.totalCost / (tokensPerMonth / 1000000)) : 0
      },
      benchmark,
      comparison: {
        spendVsBenchmark: Math.round(((metrics.totalCost - benchmark.avgMonthlySpend) / benchmark.avgMonthlySpend) * 100),
        efficiencyVsBenchmark: Math.round(((efficiency - benchmarkEfficiency) / benchmarkEfficiency) * 100),
        costPerTokenVsBenchmark: Math.round(((metrics.totalCost / (tokensPerMonth || 1) - benchmark.costPerMillionTokens / 1000000) / (benchmark.costPerMillionTokens / 1000000)) * 100)
      },
      recommendation: this.benchmarkRecommendation(metrics, benchmark)
    };
  }

  /**
   * Generate benchmark recommendation
   */
  benchmarkRecommendation(metrics, benchmark) {
    const costRatio = (metrics.totalCost / benchmark.avgMonthlySpend);
    const efficiencyRatio = (metrics.totalInputTokens + metrics.totalOutputTokens) / benchmark.avgTokensPerMonth;

    if (costRatio > 1.5) {
      return {
        status: 'above_benchmark',
        message: 'Spending significantly above industry average',
        priority: 'high'
      };
    } else if (costRatio > 1.1) {
      return {
        status: 'slightly_above_benchmark',
        message: 'Spending slightly above industry average',
        priority: 'medium'
      };
    } else {
      return {
        status: 'at_or_below_benchmark',
        message: 'Spending is competitive',
        priority: 'low'
      };
    }
  }

  /**
   * Group requests by prompt similarity
   */
  groupRequestsByPromptSimilarity(requests) {
    const groups = {};

    requests.forEach((req, idx) => {
      if (!req.prompt) return;

      // Simple hash of first 50 chars of prompt
      const pattern = req.prompt.substring(0, 50);
      if (!groups[pattern]) {
        groups[pattern] = [];
      }
      groups[pattern].push(req);
    });

    return groups;
  }

  /**
   * Calculate potential savings for a recommendation
   */
  calculatePotentialSavings(recommendation) {
    if (!recommendation) {
      return { monthlySavings: 0, yearlySavings: 0 };
    }

    const monthlySavings = recommendation.monthlySavings || 0;
    const yearlySavings = monthlySavings * 12;

    return {
      monthlySavings: Math.round(monthlySavings),
      yearlySavings: Math.round(yearlySavings),
      recommendation
    };
  }

  /**
   * Calculate ROI for a recommendation
   */
  calculateROI(recommendation, implementationCost = 0) {
    if (!recommendation) {
      return { roi: 0, paybackMonths: Infinity };
    }

    const monthlySavings = recommendation.monthlySavings || 0;
    const yearlySavings = monthlySavings * 12;

    const paybackMonths = implementationCost > 0 ? implementationCost / monthlySavings : 0;
    const yearOneROI = ((yearlySavings - implementationCost) / implementationCost) * 100;

    return {
      monthlySavings: Math.round(monthlySavings),
      yearlySavings: Math.round(yearlySavings),
      implementationCost,
      paybackMonths: Math.round(paybackMonths * 10) / 10,
      yearOneROI: Math.round(yearOneROI),
      isProfitable: yearlySavings > implementationCost,
      recommendation
    };
  }

  /**
   * Track implementation of a recommendation
   */
  trackImplementation(recommendationId, implementationDetails = {}) {
    const tracked = {
      id: recommendationId,
      status: 'in_progress',
      startDate: new Date().toISOString(),
      expectedCompletionDate: implementationDetails.completionDate || null,
      owner: implementationDetails.owner || 'unassigned',
      details: implementationDetails,
      savingsTracked: false
    };

    this.implementations.set(recommendationId, tracked);
    return tracked;
  }

  /**
   * Measure actual savings achieved
   */
  measureActualSavings(recommendationId, actualCost, previousCost) {
    const actualSavings = previousCost - actualCost;
    const actualSavingsPercent = (actualSavings / previousCost) * 100;

    const measurement = {
      recommendationId,
      previousCost: Math.round(previousCost),
      actualCost: Math.round(actualCost),
      actualSavings: Math.round(actualSavings),
      savingsPercent: Math.round(actualSavingsPercent),
      measurementDate: new Date().toISOString()
    };

    this.actualSavings.set(recommendationId, measurement);

    // Mark implementation as complete
    if (this.implementations.has(recommendationId)) {
      const impl = this.implementations.get(recommendationId);
      impl.status = 'completed';
      impl.savingsTracked = true;
      impl.completedDate = new Date().toISOString();
    }

    return measurement;
  }

  /**
   * Generate comprehensive savings report
   */
  generateSavingsReport(orgId, period = 'monthly') {
    const report = {
      organizationId: orgId,
      period,
      generatedAt: new Date().toISOString(),
      summary: {},
      recommendations: Array.from(this.recommendations.values()),
      implementations: Array.from(this.implementations.values()),
      actualSavings: Array.from(this.actualSavings.values()),
      projections: {}
    };

    // Calculate summary
    const totalPotentialSavings = Array.from(this.recommendations.values())
      .reduce((sum, rec) => sum + (rec.monthlySavings || 0), 0);

    const totalActualSavings = Array.from(this.actualSavings.values())
      .reduce((sum, saving) => sum + saving.actualSavings, 0);

    const implementedCount = Array.from(this.implementations.values())
      .filter(impl => impl.status === 'completed').length;

    report.summary = {
      totalRecommendations: this.recommendations.size,
      implementedRecommendations: implementedCount,
      totalPotentialMonthlySavings: Math.round(totalPotentialSavings),
      totalActualMonthlySavings: Math.round(totalActualSavings),
      totalPotentialYearlySavings: Math.round(totalPotentialSavings * 12),
      totalActualYearlySavings: Math.round(totalActualSavings * 12),
      implementationRate: implementedCount / Math.max(this.recommendations.size, 1)
    };

    // Projections
    if (report.summary.implementationRate > 0) {
      const avgMonthlyROI = totalActualSavings / implementedCount;
      report.projections = {
        projectedMonthlySavings: Math.round(avgMonthlyROI * this.recommendations.size),
        projectedYearlySavings: Math.round(avgMonthlyROI * this.recommendations.size * 12),
        savingsIfAllImplemented: Math.round(totalPotentialSavings),
        yearlySavingsIfAllImplemented: Math.round(totalPotentialSavings * 12)
      };
    }

    return report;
  }

  /**
   * Generate executive summary for CFO
   */
  generateExecutiveSummary(orgId) {
    const report = this.generateSavingsReport(orgId);

    return {
      executiveFrom: 'Finault Savings Intelligence',
      to: 'CFO',
      organizationId: orgId,
      date: new Date().toISOString(),
      keyMetrics: {
        currentMonthlyAiCost: report.summary.totalActualMonthlySavings || 0,
        potentialMonthlySavings: report.summary.totalPotentialMonthlySavings,
        potentialYearlySavings: report.summary.totalPotentialYearlySavings,
        savingsAsPercentOfBudget: report.summary.totalPotentialMonthlySavings > 0 ? 25 : 0
      },
      topOpportunities: Array.from(this.recommendations.values())
        .sort((a, b) => (b.monthlySavings || 0) - (a.monthlySavings || 0))
        .slice(0, 5),
      implementationStatus: {
        completed: report.summary.implementedRecommendations,
        pending: report.summary.totalRecommendations - report.summary.implementedRecommendations,
        completionRate: `${Math.round(report.summary.implementationRate * 100)}%`
      },
      nextSteps: this.generateNextSteps(report),
      estimatedROI: {
        oneMonth: `${Math.round((report.summary.totalPotentialMonthlySavings / 1000) * 100)}% of annual spend savings`,
        oneYear: `$${report.summary.totalPotentialYearlySavings}`
      }
    };
  }

  /**
   * Generate next steps recommendations
   */
  generateNextSteps(report) {
    return [
      {
        priority: 1,
        action: 'Implement highest-ROI model switching recommendations',
        expectedSavings: Math.round(report.summary.totalPotentialMonthlySavings * 0.3),
        timeframe: '1 week'
      },
      {
        priority: 2,
        action: 'Deploy prompt optimization templates across engineering team',
        expectedSavings: Math.round(report.summary.totalPotentialMonthlySavings * 0.2),
        timeframe: '2 weeks'
      },
      {
        priority: 3,
        action: 'Enable prompt caching for identified high-frequency patterns',
        expectedSavings: Math.round(report.summary.totalPotentialMonthlySavings * 0.2),
        timeframe: '1 week'
      },
      {
        priority: 4,
        action: 'Evaluate batch processing API for non-realtime workloads',
        expectedSavings: Math.round(report.summary.totalPotentialMonthlySavings * 0.15),
        timeframe: '2 weeks'
      }
    ];
  }

  /**
   * Add a recommendation to track
   */
  addRecommendation(recommendation) {
    const id = recommendation.id || `rec_${Date.now()}`;
    this.recommendations.set(id, { id, ...recommendation });
    return id;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

// For Node.js/CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SavingsIntelligence,
    TokenEfficiencyAnalyzer,
    ModelSelector,
    MODEL_PRICING,
    CACHING_SAVINGS,
    INDUSTRY_BENCHMARKS
  };
}

// For browser/ES6 modules
if (typeof window !== 'undefined') {
  window.SavingsIntelligence = SavingsIntelligence;
  window.TokenEfficiencyAnalyzer = TokenEfficiencyAnalyzer;
  window.ModelSelector = ModelSelector;
  window.MODEL_PRICING = MODEL_PRICING;
}
