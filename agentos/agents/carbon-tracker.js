/**
 * CARBON TRACKER AGENT
 * Maps AI compute to carbon emissions for ESG reporting
 *
 * This agent provides:
 * - Carbon emission estimates per workload/team/model
 * - Sustainability scorecards for ESG reporting
 * - Carbon budget alerts and monitoring
 * - Green routing recommendations for lowest-carbon alternatives
 *
 * Autonomy Level: 3/5
 * - Autonomous tracking and alerting
 * - Human approval required for published ESG reports
 */

import { validateAgentParams } from '../core/validate-agent-params.js';

// ============================================================================
// CONSTANTS: Grid Carbon Intensity (gCO2/kWh) for Major Cloud Regions
// ============================================================================

const GRID_CARBON_INTENSITY = {
  // AWS Regions
  'us-east-1': 385,      // N. Virginia (mixed grid)
  'us-west-2': 156,      // Oregon (hydro-heavy)
  'eu-west-1': 368,      // Ireland (mixed)
  'eu-central-1': 420,   // Frankfurt (coal-heavy)
  'ap-southeast-1': 450, // Singapore (natural gas)
  'ap-northeast-1': 540, // Tokyo (mix with nuclear)

  // GCP Regions
  'us-central1': 380,    // Iowa (coal/wind mix)
  'us-west1': 160,       // Oregon (hydro)
  'europe-west1': 240,   // Belgium (nuclear-heavy)
  'asia-east1': 650,     // Taiwan (coal-heavy)

  // Azure Regions
  'eastus': 385,         // Virginia
  'westus2': 150,        // Washington (hydro)
  'northeurope': 50,     // Ireland (wind-heavy)
  'westeurope': 280,     // Netherlands (wind/gas)

  // Default for unknown regions
  'default': 400
};

// ============================================================================
// CONSTANTS: Energy Consumption Estimates (kWh per 1M tokens)
// ============================================================================

const ENERGY_CONSUMPTION_PER_1M_TOKENS = {
  // Anthropic models
  'claude-3-opus': 4.2,
  'claude-3-sonnet': 3.8,
  'claude-3-haiku': 2.1,
  'claude-opus-4-6': 4.5,
  'claude-sonnet-4': 3.8,

  // OpenAI models
  'gpt-4-turbo': 4.8,
  'gpt-4': 5.2,
  'gpt-3.5-turbo': 2.5,

  // Other models (estimates)
  'llama-2-70b': 3.9,
  'mistral-7b': 2.3,

  // Default estimate
  'default': 3.5
};

// ============================================================================
// CONSTANTS: Cloud Provider Energy Efficiency (PUE - Power Usage Effectiveness)
// ============================================================================

const PROVIDER_PUE = {
  'aws': 1.11,      // AWS achieves ~1.11 PUE (industry leading)
  'gcp': 1.10,      // GCP achieves ~1.10 PUE
  'azure': 1.125,   // Azure achieves ~1.125 PUE
  'default': 1.15   // Industry average
};

// ============================================================================
// CARBON TRACKER CLASS
// ============================================================================

export class CarbonTracker {
  constructor(params = {}) {
    const { organizationId, userId, config } = validateAgentParams(params, 'CarbonTracker');
    this.userId = userId;
    this.organizationId = organizationId;
    this.config = config || {};

    // Carbon budgets per organization (in tCO2e)
    this.carbonBudgets = new Map();

    // Emission tracking cache
    this.emissionCache = [];
  }

  /**
   * Get grid carbon intensity for a region
   * Returns gCO2/kWh for the specified region
   */
  getGridCarbonIntensity(region) {
    if (!region) {
      return GRID_CARBON_INTENSITY.default;
    }

    // Normalize region name (handle variations)
    const normalizedRegion = region.toLowerCase().trim();

    // Direct lookup
    if (GRID_CARBON_INTENSITY[normalizedRegion]) {
      return GRID_CARBON_INTENSITY[normalizedRegion];
    }

    // Partial match for region patterns
    for (const [key, value] of Object.entries(GRID_CARBON_INTENSITY)) {
      if (key !== 'default' && normalizedRegion.includes(key)) {
        return value;
      }
    }

    // Return default if no match
    return GRID_CARBON_INTENSITY.default;
  }

  /**
   * Get energy consumption for a model
   * Returns kWh per 1M tokens
   */
  getModelEnergyConsumption(modelName) {
    if (!modelName) {
      return ENERGY_CONSUMPTION_PER_1M_TOKENS.default;
    }

    const normalized = modelName.toLowerCase().trim();

    // Direct lookup
    if (ENERGY_CONSUMPTION_PER_1M_TOKENS[normalized]) {
      return ENERGY_CONSUMPTION_PER_1M_TOKENS[normalized];
    }

    // Partial match for model names - sort by length (longest first) to avoid short matches
    const candidates = [];
    for (const [key, value] of Object.entries(ENERGY_CONSUMPTION_PER_1M_TOKENS)) {
      if (key !== 'default' && normalized.includes(key)) {
        candidates.push({ key, value, keyLen: key.length });
      }
    }

    if (candidates.length > 0) {
      // Return the longest matching key
      candidates.sort((a, b) => b.keyLen - a.keyLen);
      return candidates[0].value;
    }

    // Return default if no match
    return ENERGY_CONSUMPTION_PER_1M_TOKENS.default;
  }

  /**
   * Get provider PUE (Power Usage Effectiveness)
   * Lower is better (1.0 = perfect efficiency)
   */
  getProviderPUE(provider) {
    if (!provider) {
      return PROVIDER_PUE.default;
    }

    const normalized = provider.toLowerCase().trim();
    return PROVIDER_PUE[normalized] || PROVIDER_PUE.default;
  }

  /**
   * Estimate emissions from compute usage
   * Returns emissions in tCO2e (metric tons of CO2 equivalent)
   */
  estimateEmissions(usageData) {
    if (!usageData || typeof usageData !== 'object') {
      return {
        success: false,
        error: 'Invalid usage data',
        emissions_tco2e: 0
      };
    }

    const {
      tokens = 0,
      modelName = 'default',
      provider = 'aws',
      region = 'us-east-1',
      hours = 0
    } = usageData;

    // Validate inputs
    if (tokens < 0 || hours < 0 || isNaN(tokens) || isNaN(hours) || !isFinite(tokens) || !isFinite(hours)) {
      return {
        success: false,
        error: 'Invalid numeric inputs (tokens or hours)',
        emissions_tco2e: 0
      };
    }

    // If both tokens and hours are zero, return zero emissions
    if (tokens === 0 && hours === 0) {
      return {
        success: true,
        emissions_tco2e: 0,
        breakdown: {
          inference_emissions: 0,
          idle_emissions: 0,
          total: 0
        }
      };
    }

    // Calculate inference emissions from tokens
    const energyPerMTokens = this.getModelEnergyConsumption(modelName);
    const inferenceEnergyKWh = (tokens / 1000000) * energyPerMTokens;

    // Get grid carbon intensity
    const gridIntensity = this.getGridCarbonIntensity(region); // gCO2/kWh

    // Get provider PUE
    const pue = this.getProviderPUE(provider);

    // Apply PUE to energy consumption
    const totalEnergyKWh = inferenceEnergyKWh * pue;

    // Convert to emissions: kWh * gCO2/kWh / 1,000,000 = tCO2e
    const inferenceEmissions = (totalEnergyKWh * gridIntensity) / 1_000_000;

    // Idle emissions (if hours > 0, estimate 50W baseline per GPU)
    const idleEmissions = (hours * 0.05 * gridIntensity) / 1_000_000;

    const totalEmissions = inferenceEmissions + idleEmissions;

    return {
      success: true,
      emissions_tco2e: Math.max(0, totalEmissions),
      breakdown: {
        inference_emissions: Math.max(0, inferenceEmissions),
        idle_emissions: Math.max(0, idleEmissions),
        total: Math.max(0, totalEmissions)
      },
      factors: {
        tokens,
        modelName,
        provider,
        region,
        hours,
        gridIntensity,
        pue,
        energyPerMTokens
      }
    };
  }

  /**
   * Track emissions for a specific model invocation
   */
  trackModelEmissions(modelName, tokens, provider = 'aws', region = 'us-east-1') {
    const result = this.estimateEmissions({
      tokens,
      modelName,
      provider,
      region,
      hours: 0
    });

    if (result.success) {
      // Cache the emission record
      this.emissionCache.push({
        timestamp: new Date().toISOString(),
        modelName,
        tokens,
        provider,
        region,
        emissions_tco2e: result.emissions_tco2e
      });
    }

    return result;
  }

  /**
   * Get carbon data from provider APIs (simulated)
   * In production, this would call AWS Customer Carbon Footprint,
   * Azure Emissions Dashboard, GCP Carbon Footprint APIs
   */
  getProviderCarbonData(provider, period = '30d') {
    if (!provider) {
      return {
        success: false,
        error: 'Provider required'
      };
    }

    const normalized = provider.toLowerCase().trim();

    // In production, these would call real APIs
    // For now, return simulated data structure
    const baseEmissions = {
      'aws': {
        currentMonth: 125.5,
        lastMonth: 118.2,
        ytd: 1205.8,
        trend: 'increasing'
      },
      'gcp': {
        currentMonth: 89.3,
        lastMonth: 91.2,
        ytd: 892.5,
        trend: 'decreasing'
      },
      'azure': {
        currentMonth: 102.7,
        lastMonth: 98.5,
        ytd: 1045.2,
        trend: 'stable'
      }
    };

    const data = baseEmissions[normalized];

    if (!data) {
      return {
        success: false,
        error: `Unknown provider: ${provider}`,
        emissions_tco2e: 0
      };
    }

    return {
      success: true,
      provider: normalized,
      period,
      emissions_tco2e: data.currentMonth,
      breakdown: {
        currentMonth: data.currentMonth,
        lastMonth: data.lastMonth,
        ytd: data.ytd,
        trend: data.trend
      }
    };
  }

  /**
   * Check carbon budget and generate alerts
   */
  checkCarbonBudget(orgId, monthlyBudgetTCO2e = 100) {
    if (!orgId) {
      return {
        success: false,
        error: 'Organization ID required'
      };
    }

    if (monthlyBudgetTCO2e <= 0 || isNaN(monthlyBudgetTCO2e)) {
      return {
        success: false,
        error: 'Invalid budget value'
      };
    }

    // Calculate total emissions from cache
    const totalEmissions = this.emissionCache.reduce((sum, record) => {
      return sum + record.emissions_tco2e;
    }, 0);

    const percentageUsed = (totalEmissions / monthlyBudgetTCO2e) * 100;
    const remaining = monthlyBudgetTCO2e - totalEmissions;

    let alertLevel = 'ok';
    let alertMessage = null;

    if (remaining < 0) {
      alertLevel = 'critical';
      alertMessage = `Over budget by ${Math.abs(remaining).toFixed(3)} tCO2e`;
    } else if (percentageUsed >= 90) {
      alertLevel = 'warning';
      alertMessage = `${percentageUsed.toFixed(1)}% of monthly carbon budget used`;
    } else if (percentageUsed >= 75) {
      alertLevel = 'caution';
      alertMessage = `${percentageUsed.toFixed(1)}% of monthly carbon budget used`;
    }

    return {
      success: true,
      orgId,
      monthlyBudget: monthlyBudgetTCO2e,
      currentUsage: totalEmissions,
      remaining,
      percentageUsed: percentageUsed.toFixed(1),
      alertLevel,
      alertMessage
    };
  }

  /**
   * Generate sustainability scorecard
   */
  generateSustainabilityScorecard(orgId, period = '30d') {
    if (!orgId) {
      return {
        success: false,
        error: 'Organization ID required'
      };
    }

    // Simulated data for comprehensive scorecard
    const totalEmissions = this.emissionCache.reduce((sum, record) => {
      return sum + record.emissions_tco2e;
    }, 0);

    // Calculate model efficiency (lower emissions per token = better)
    const modelStats = {};
    this.emissionCache.forEach(record => {
      if (!modelStats[record.modelName]) {
        modelStats[record.modelName] = {
          totalTokens: 0,
          totalEmissions: 0,
          count: 0
        };
      }
      modelStats[record.modelName].totalTokens += record.tokens;
      modelStats[record.modelName].totalEmissions += record.emissions_tco2e;
      modelStats[record.modelName].count += 1;
    });

    const modelEfficiency = Object.entries(modelStats).map(([model, stats]) => ({
      model,
      emissionsPerMTokens: stats.totalTokens > 0
        ? (stats.totalEmissions / (stats.totalTokens / 1000000))
        : 0,
      totalEmissions: stats.totalEmissions,
      tokenCount: stats.totalTokens
    })).sort((a, b) => a.emissionsPerMTokens - b.emissionsPerMTokens);

    // Region efficiency
    const regionStats = {};
    this.emissionCache.forEach(record => {
      if (!regionStats[record.region]) {
        regionStats[record.region] = {
          emissions: 0,
          count: 0,
          gridIntensity: this.getGridCarbonIntensity(record.region)
        };
      }
      regionStats[record.region].emissions += record.emissions_tco2e;
      regionStats[record.region].count += 1;
    });

    const regionEfficiency = Object.entries(regionStats).map(([region, stats]) => ({
      region,
      emissions: stats.emissions,
      gridIntensity: stats.gridIntensity,
      requestCount: stats.count
    })).sort((a, b) => a.gridIntensity - b.gridIntensity);

    // ESG Score (0-100)
    const avgEmissionPerToken = this.emissionCache.length > 0
      ? totalEmissions / Math.max(1, this.emissionCache.reduce((sum, r) => sum + r.tokens, 0))
      : 0;

    // Score inversely based on efficiency (lower is better)
    const esgScore = Math.max(0, Math.min(100, 100 - (avgEmissionPerToken * 10_000_000)));

    return {
      success: true,
      orgId,
      period,
      summary: {
        totalEmissions: totalEmissions.toFixed(4),
        emissionsTCO2e: totalEmissions,
        requestCount: this.emissionCache.length,
        esgScore: esgScore.toFixed(1)
      },
      modelEfficiency,
      regionEfficiency,
      recommendations: [
        modelEfficiency.length > 1
          ? `Consider using ${modelEfficiency[0].model} over ${modelEfficiency[modelEfficiency.length - 1].model} to reduce emissions by ~${((modelEfficiency[modelEfficiency.length - 1].emissionsPerMTokens / modelEfficiency[0].emissionsPerMTokens - 1) * 100).toFixed(0)}%`
          : null,
        regionEfficiency.length > 1
          ? `Region ${regionEfficiency[0].region} is ${((regionEfficiency[regionEfficiency.length - 1].gridIntensity / regionEfficiency[0].gridIntensity - 1) * 100).toFixed(0)}% cleaner than ${regionEfficiency[regionEfficiency.length - 1].region}`
          : null,
        esgScore < 50
          ? 'High carbon intensity detected. Consider optimizing model selection and routing to cleaner regions.'
          : 'Good ESG performance. Continue monitoring carbon efficiency.'
      ].filter(Boolean)
    };
  }

  /**
   * Recommend green routing (lowest-carbon alternatives)
   */
  recommendGreenRouting(request) {
    if (!request || typeof request !== 'object') {
      return {
        success: false,
        error: 'Invalid request'
      };
    }

    const {
      modelName = 'default',
      currentProvider = 'aws',
      currentRegion = 'us-east-1',
      tokens = 1000000
    } = request;

    if (tokens <= 0 || isNaN(tokens)) {
      return {
        success: false,
        error: 'Invalid token count'
      };
    }

    // Generate emission estimates for different routing options
    const options = [];

    // Option 1: Current routing
    const current = this.estimateEmissions({
      tokens,
      modelName,
      provider: currentProvider,
      region: currentRegion
    });

    if (current.success) {
      options.push({
        ranking: 1,
        strategy: 'current',
        provider: currentProvider,
        region: currentRegion,
        model: modelName,
        emissions_tco2e: current.emissions_tco2e,
        gridIntensity: this.getGridCarbonIntensity(currentRegion)
      });
    }

    // Option 2: Best region for current provider
    const regions = Object.keys(GRID_CARBON_INTENSITY).filter(r => r !== 'default');
    const regionOptions = regions.map(region => ({
      region,
      emissions: this.estimateEmissions({
        tokens,
        modelName,
        provider: currentProvider,
        region
      }).emissions_tco2e,
      gridIntensity: this.getGridCarbonIntensity(region)
    })).sort((a, b) => a.emissions - b.emissions);

    if (regionOptions[0] && regionOptions[0].emissions < current.emissions_tco2e) {
      options.push({
        ranking: 2,
        strategy: 'green_region',
        provider: currentProvider,
        region: regionOptions[0].region,
        model: modelName,
        emissions_tco2e: regionOptions[0].emissions,
        gridIntensity: regionOptions[0].gridIntensity,
        savings_percent: (((current.emissions_tco2e - regionOptions[0].emissions) / current.emissions_tco2e) * 100).toFixed(1)
      });
    }

    // Option 3: Lighter model with same provider/region
    const lighterModels = ['claude-3-haiku', 'gpt-3.5-turbo', 'mistral-7b'];
    for (const lighter of lighterModels) {
      if (lighter !== modelName) {
        const lighter_est = this.estimateEmissions({
          tokens,
          modelName: lighter,
          provider: currentProvider,
          region: currentRegion
        });

        if (lighter_est.success && lighter_est.emissions_tco2e < current.emissions_tco2e) {
          options.push({
            ranking: 3,
            strategy: 'lighter_model',
            provider: currentProvider,
            region: currentRegion,
            model: lighter,
            emissions_tco2e: lighter_est.emissions_tco2e,
            gridIntensity: this.getGridCarbonIntensity(currentRegion),
            savings_percent: (((current.emissions_tco2e - lighter_est.emissions_tco2e) / current.emissions_tco2e) * 100).toFixed(1)
          });
          break; // Just show first lighter model
        }
      }
    }

    options.sort((a, b) => a.emissions_tco2e - b.emissions_tco2e);

    return {
      success: true,
      currentEmissions_tco2e: current.emissions_tco2e,
      options: options.slice(0, 3), // Top 3 recommendations
      bestOption: options[0],
      maxSavings_tco2e: (current.emissions_tco2e - options[0].emissions_tco2e).toFixed(6),
      maxSavings_percent: (((current.emissions_tco2e - options[0].emissions_tco2e) / current.emissions_tco2e) * 100).toFixed(1)
    };
  }

  /**
   * Main execute method for orchestrator compatibility
   */
  async execute(task, parameters = {}) {
    switch (task) {
      case 'estimate_emissions':
        return this.estimateEmissions(parameters);

      case 'get_provider_carbon_data':
        return this.getProviderCarbonData(parameters.provider, parameters.period);

      case 'check_carbon_budget':
        return this.checkCarbonBudget(parameters.orgId, parameters.monthlyBudget);

      case 'generate_scorecard':
        return this.generateSustainabilityScorecard(parameters.orgId, parameters.period);

      case 'recommend_green_routing':
        return this.recommendGreenRouting(parameters);

      case 'track_emissions':
        return this.trackModelEmissions(
          parameters.modelName,
          parameters.tokens,
          parameters.provider,
          parameters.region
        );

      default:
        return {
          success: false,
          error: `Unknown task: ${task}`
        };
    }
  }
}

/**
 * Factory function for creating CarbonTracker instances
 */
export function createCarbonTracker(params = {}) {
  return new CarbonTracker(params);
}

export default CarbonTracker;
