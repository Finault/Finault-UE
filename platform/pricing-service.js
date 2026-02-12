/**
 * Centralized PricingService for Finault
 * Manages model pricing, FX rates, benchmarks, AI domains, and known pricing
 * Loads from Supabase with 1-hour caching, falls back to hardcoded FALLBACK_* constants
 *
 * Usage:
 *   const service = new PricingService(supabaseClient, config);
 *   const pricing = await service.getModelPricing();
 *   const rates = await service.getFxRates();
 */

class PricingService {
  constructor(supabaseClient, config = {}) {
    this.supabase = supabaseClient;
    this.config = config;
    this.cache = new Map();
    this.cacheExpiry = new Map();
    this.cacheTTLMs = config.cacheTTLMs || 3600000; // 1 hour default
    this.isInitialized = false;
  }

  /**
   * Internal caching helper with TTL and fallback fetch function
   * @private
   */
  async _getCached(key, ttlMs, fetchFn) {
    const now = Date.now();
    const expiry = this.cacheExpiry.get(key);

    // Return cached value if still valid
    if (this.cache.has(key) && expiry && expiry > now) {
      return this.cache.get(key);
    }

    // Fetch fresh data
    try {
      const data = await fetchFn();
      this.cache.set(key, data);
      this.cacheExpiry.set(key, now + ttlMs);
      return data;
    } catch (error) {
      console.error(`Failed to fetch ${key}:`, error);
      // Return cached value if available, even if expired
      if (this.cache.has(key)) {
        return this.cache.get(key);
      }
      throw error;
    }
  }

  /**
   * Get model pricing from Supabase (cached) or fallback
   * @returns {Promise<Object>} Map of provider -> model -> {input, output} pricing per 1K tokens
   */
  async getModelPricing() {
    return this._getCached('model_pricing', this.cacheTTLMs, async () => {
      try {
        const { data, error } = await this.supabase
          .from('pricing_versions')
          .select('data')
          .eq('type', 'model_pricing')
          .order('version', { ascending: false })
          .limit(1)
          .single();

        if (error) throw error;
        return data?.data || FALLBACK_MODEL_PRICING;
      } catch {
        return FALLBACK_MODEL_PRICING;
      }
    });
  }

  /**
   * Get FX rates from Supabase (cached) or fallback
   * @returns {Promise<Object>} Map of currency -> rate (base: USD)
   */
  async getFxRates() {
    return this._getCached('fx_rates', this.cacheTTLMs, async () => {
      try {
        const { data, error } = await this.supabase
          .from('pricing_versions')
          .select('data')
          .eq('type', 'fx_rates')
          .order('version', { ascending: false })
          .limit(1)
          .single();

        if (error) throw error;
        return data?.data || FALLBACK_FX_RATES;
      } catch {
        return FALLBACK_FX_RATES;
      }
    });
  }

  /**
   * Get industry benchmarks from Supabase (cached) or fallback
   * @returns {Promise<Object>} Map of industry -> benchmark metrics
   */
  async getIndustryBenchmarks() {
    return this._getCached('benchmarks', this.cacheTTLMs, async () => {
      try {
        const { data, error } = await this.supabase
          .from('pricing_versions')
          .select('data')
          .eq('type', 'benchmarks')
          .order('version', { ascending: false })
          .limit(1)
          .single();

        if (error) throw error;
        return data?.data || FALLBACK_INDUSTRY_BENCHMARKS;
      } catch {
        return FALLBACK_INDUSTRY_BENCHMARKS;
      }
    });
  }

  /**
   * Get AI domains (40+ known AI services) from Supabase (cached) or fallback
   * @returns {Promise<Object>} Map of domain -> {name, vendor, category, riskScore, ...}
   */
  async getAiDomains() {
    return this._getCached('ai_domains', this.cacheTTLMs, async () => {
      try {
        const { data, error } = await this.supabase
          .from('pricing_versions')
          .select('data')
          .eq('type', 'ai_domains')
          .order('version', { ascending: false })
          .limit(1)
          .single();

        if (error) throw error;
        return data?.data || FALLBACK_AI_DOMAINS;
      } catch {
        return FALLBACK_AI_DOMAINS;
      }
    });
  }

  /**
   * Get known AI provider pricing (per 1K tokens in cents) from Supabase or fallback
   * @returns {Promise<Object>} Map of model -> {input, output} pricing in cents per 1K tokens
   */
  async getKnownPricing() {
    return this._getCached('known_pricing', this.cacheTTLMs, async () => {
      try {
        const { data, error } = await this.supabase
          .from('pricing_versions')
          .select('data')
          .eq('type', 'known_pricing')
          .order('version', { ascending: false })
          .limit(1)
          .single();

        if (error) throw error;
        return data?.data || FALLBACK_KNOWN_PRICING_CENTS_PER_1K;
      } catch {
        return FALLBACK_KNOWN_PRICING_CENTS_PER_1K;
      }
    });
  }

  /**
   * Refresh cache for all pricing data (force reload from Supabase)
   * @returns {Promise<void>}
   */
  async refreshCache() {
    this.cache.clear();
    this.cacheExpiry.clear();
    // Pre-load all pricing data
    await Promise.all([
      this.getModelPricing(),
      this.getFxRates(),
      this.getIndustryBenchmarks(),
      this.getAiDomains(),
      this.getKnownPricing(),
    ]);
  }

  /**
   * Initialize service by pre-loading all pricing data
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) return;
    await this.refreshCache();
    this.isInitialized = true;
  }

  /**
   * Get current cache status (for debugging)
   * @returns {Object}
   */
  getCacheStatus() {
    const now = Date.now();
    const status = {};
    for (const [key, expiry] of this.cacheExpiry.entries()) {
      status[key] = {
        cached: this.cache.has(key),
        expiresIn: Math.max(0, expiry - now),
        isValid: expiry > now,
      };
    }
    return status;
  }
}

// ============================================================================
// FALLBACK CONSTANTS (hardcoded defaults)
// ============================================================================

const FALLBACK_FX_RATES = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 149.50,
  CAD: 1.36,
  AUD: 1.52,
  CHF: 0.88,
  CNY: 7.24,
  INR: 83.12,
  MXN: 17.05,
};

const FALLBACK_MODEL_PRICING = {
  'gpt-4-turbo': {
    provider: 'OpenAI',
    family: 'GPT-4',
    inputCost: 0.01,
    outputCost: 0.03,
    qualityScore: 0.95,
    speedScore: 0.85,
    releaseDate: '2024-04-09',
    maxTokens: 128000,
    contextWindow: 128000,
    capabilities: ['text', 'vision', 'reasoning', 'code'],
  },
  'gpt-4o': {
    provider: 'OpenAI',
    family: 'GPT-4',
    inputCost: 0.005,
    outputCost: 0.015,
    qualityScore: 0.92,
    speedScore: 0.88,
    releaseDate: '2024-05-13',
    maxTokens: 128000,
    contextWindow: 128000,
    capabilities: ['text', 'vision', 'reasoning', 'code'],
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
    capabilities: ['text', 'vision', 'code'],
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
    capabilities: ['text', 'code'],
  },
  'claude-opus-4.5': {
    provider: 'Anthropic',
    family: 'Claude',
    inputCost: 0.005,
    outputCost: 0.025,
    qualityScore: 0.98,
    speedScore: 0.80,
    releaseDate: '2025-11-01',
    maxTokens: 200000,
    contextWindow: 200000,
    capabilities: ['text', 'reasoning', 'analysis', 'code', 'vision'],
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
    capabilities: ['text', 'reasoning', 'analysis', 'code', 'vision'],
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
    capabilities: ['text', 'analysis', 'code'],
  },
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
    capabilities: ['text', 'vision', 'audio', 'code'],
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
    capabilities: ['text', 'vision', 'audio', 'code'],
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
    capabilities: ['text', 'vision'],
  },
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
    capabilities: ['text', 'reasoning', 'code'],
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
    capabilities: ['text', 'reasoning', 'code'],
  },
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
    capabilities: ['text', 'code'],
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
    capabilities: ['text'],
  },
};

const FALLBACK_INDUSTRY_BENCHMARKS = {
  'saas-startup': {
    avgMonthlySpend: 5000,
    avgTokensPerMonth: 500000000,
    efficiency: 100000,
    qualityScore: 0.75,
  },
  'saas-scale': {
    avgMonthlySpend: 50000,
    avgTokensPerMonth: 8000000000,
    efficiency: 160000,
    qualityScore: 0.82,
  },
  'enterprise': {
    avgMonthlySpend: 500000,
    avgTokensPerMonth: 80000000000,
    efficiency: 160000,
    qualityScore: 0.88,
  },
  'finance': {
    avgMonthlySpend: 150000,
    avgTokensPerMonth: 12000000000,
    efficiency: 80000,
    qualityScore: 0.95,
  },
  'healthcare': {
    avgMonthlySpend: 100000,
    avgTokensPerMonth: 8000000000,
    efficiency: 80000,
    qualityScore: 0.93,
  },
};

const FALLBACK_AI_DOMAINS = {
  'chat.openai.com': {
    name: 'ChatGPT',
    vendor: 'OpenAI',
    category: 'text_generation',
    riskScore: 45,
    apiDomains: ['api.openai.com', 'platform.openai.com'],
  },
  'api.openai.com': {
    name: 'OpenAI API',
    vendor: 'OpenAI',
    category: 'text_generation_api',
    riskScore: 40,
    apiDomains: ['api.openai.com'],
  },
  'claude.ai': {
    name: 'Claude',
    vendor: 'Anthropic',
    category: 'text_generation',
    riskScore: 40,
    apiDomains: ['api.anthropic.com', 'console.anthropic.com'],
  },
  'api.anthropic.com': {
    name: 'Anthropic API',
    vendor: 'Anthropic',
    category: 'text_generation_api',
    riskScore: 35,
    apiDomains: ['api.anthropic.com'],
  },
  'gemini.google.com': {
    name: 'Google Gemini',
    vendor: 'Google',
    category: 'text_generation',
    riskScore: 35,
    apiDomains: ['generativelanguage.googleapis.com', 'aiplatform.googleapis.com'],
  },
  'copilot.microsoft.com': {
    name: 'Microsoft Copilot',
    vendor: 'Microsoft',
    category: 'text_generation',
    riskScore: 50,
    apiDomains: ['api.copilot.microsoft.com'],
  },
  'github.com/copilot': {
    name: 'GitHub Copilot',
    vendor: 'Microsoft',
    category: 'code_generation',
    riskScore: 55,
    apiDomains: ['copilot-api.github.com', 'api.github.com'],
  },
  'midjourney.com': {
    name: 'Midjourney',
    vendor: 'Midjourney',
    category: 'image_generation',
    riskScore: 60,
    apiDomains: ['api.midjourney.com', 'discord.com'],
  },
  'cursor.com': {
    name: 'Cursor',
    vendor: 'Cursor',
    category: 'code_generation_ide',
    riskScore: 65,
    apiDomains: ['api.cursor.com'],
  },
  'perplexity.ai': {
    name: 'Perplexity',
    vendor: 'Perplexity AI',
    category: 'search_generation',
    riskScore: 50,
    apiDomains: ['api.perplexity.ai'],
  },
};

const FALLBACK_KNOWN_PRICING_CENTS_PER_1K = {
  'gpt-4': { input: 3.0, output: 6.0 },
  'gpt-4-turbo': { input: 1.0, output: 3.0 },
  'gpt-4o': { input: 0.25, output: 1.0 },
  'gpt-4o-mini': { input: 0.015, output: 0.06 },
  'gpt-3.5-turbo': { input: 0.05, output: 0.15 },
  'claude-3-opus': { input: 1.5, output: 7.5 },
  'claude-3.5-sonnet': { input: 0.3, output: 1.5 },
  'claude-3-sonnet': { input: 0.3, output: 1.5 },
  'claude-3-haiku': { input: 0.025, output: 0.125 },
  'claude-3.5-haiku': { input: 0.08, output: 0.4 },
  'gemini-1.5-pro': { input: 0.125, output: 0.5 },
  'gemini-1.5-flash': { input: 0.0075, output: 0.03 },
  'mistral-large': { input: 0.2, output: 0.6 },
  'mistral-small': { input: 0.1, output: 0.3 },
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  PricingService,
  FALLBACK_FX_RATES,
  FALLBACK_MODEL_PRICING,
  FALLBACK_INDUSTRY_BENCHMARKS,
  FALLBACK_AI_DOMAINS,
  FALLBACK_KNOWN_PRICING_CENTS_PER_1K,
};
