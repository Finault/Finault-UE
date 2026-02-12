/**
 * Shadow AI Discovery Module for Finault Platform
 *
 * Detects unauthorized/ungoverned AI spend by comparing provider billing data
 * against Finault-metered usage. Integrates Shadow AI detection concepts from
 * the Vigilex platform (SSO-based detection, domain monitoring, risk scoring).
 *
 * Cloudflare Workers compatible using CommonJS (require/module.exports)
 *
 * @module shadow-discovery
 */

const { PricingService, FALLBACK_AI_DOMAINS, FALLBACK_MODEL_PRICING } = require('../pricing-service');

/**
 * Detection methods supported by the Shadow AI Discovery module
 * @typedef {Object} DetectionMethods
 */
const DETECTION_METHODS = {
  BILLING_RECONCILIATION: 'billing_reconciliation',
  SSO_WEBHOOK: 'sso_webhook',
  BROWSER_EXTENSION: 'browser_extension',
  SELF_REPORT: 'self_report',
  NETWORK_MONITOR: 'network_monitor'
};

/**
 * Map of 40+ known AI service domains with metadata
 * Ported from Vigilex platform
 * FALLBACK: will be overridden by PricingService from Supabase
 *
 * @typedef {Object.<string, {name: string, vendor: string, category: string, riskScore: number, apiDomains: string[]}>} AIDomains
 */
const FALLBACK_AI_DOMAINS_DATA = FALLBACK_AI_DOMAINS;

const AI_DOMAINS = {
  'chat.openai.com': {
    name: 'ChatGPT',
    vendor: 'OpenAI',
    category: 'text_generation',
    riskScore: 45,
    apiDomains: ['api.openai.com', 'platform.openai.com']
  },
  'api.openai.com': {
    name: 'OpenAI API',
    vendor: 'OpenAI',
    category: 'text_generation_api',
    riskScore: 40,
    apiDomains: ['api.openai.com']
  },
  'claude.ai': {
    name: 'Claude',
    vendor: 'Anthropic',
    category: 'text_generation',
    riskScore: 40,
    apiDomains: ['api.anthropic.com', 'console.anthropic.com']
  },
  'api.anthropic.com': {
    name: 'Anthropic API',
    vendor: 'Anthropic',
    category: 'text_generation_api',
    riskScore: 35,
    apiDomains: ['api.anthropic.com']
  },
  'console.anthropic.com': {
    name: 'Anthropic Console',
    vendor: 'Anthropic',
    category: 'text_generation_platform',
    riskScore: 38,
    apiDomains: ['api.anthropic.com']
  },
  'gemini.google.com': {
    name: 'Google Gemini',
    vendor: 'Google',
    category: 'text_generation',
    riskScore: 35,
    apiDomains: ['generativelanguage.googleapis.com', 'aiplatform.googleapis.com']
  },
  'generativelanguage.googleapis.com': {
    name: 'Google Generative Language API',
    vendor: 'Google',
    category: 'text_generation_api',
    riskScore: 30,
    apiDomains: ['generativelanguage.googleapis.com']
  },
  'copilot.microsoft.com': {
    name: 'Microsoft Copilot',
    vendor: 'Microsoft',
    category: 'text_generation',
    riskScore: 50,
    apiDomains: ['api.copilot.microsoft.com']
  },
  'github.com/copilot': {
    name: 'GitHub Copilot',
    vendor: 'Microsoft',
    category: 'code_generation',
    riskScore: 55,
    apiDomains: ['copilot-api.github.com', 'api.github.com']
  },
  'midjourney.com': {
    name: 'Midjourney',
    vendor: 'Midjourney',
    category: 'image_generation',
    riskScore: 60,
    apiDomains: ['api.midjourney.com', 'discord.com']
  },
  'cursor.com': {
    name: 'Cursor',
    vendor: 'Cursor',
    category: 'code_generation_ide',
    riskScore: 65,
    apiDomains: ['api.cursor.com']
  },
  'perplexity.ai': {
    name: 'Perplexity',
    vendor: 'Perplexity AI',
    category: 'search_generation',
    riskScore: 50,
    apiDomains: ['api.perplexity.ai']
  },
  'api.perplexity.ai': {
    name: 'Perplexity API',
    vendor: 'Perplexity AI',
    category: 'search_generation_api',
    riskScore: 48,
    apiDomains: ['api.perplexity.ai']
  },
  'elevenlabs.io': {
    name: 'ElevenLabs',
    vendor: 'ElevenLabs',
    category: 'speech_generation',
    riskScore: 40,
    apiDomains: ['api.elevenlabs.io']
  },
  'api.elevenlabs.io': {
    name: 'ElevenLabs API',
    vendor: 'ElevenLabs',
    category: 'speech_generation_api',
    riskScore: 38,
    apiDomains: ['api.elevenlabs.io']
  },
  'notion.ai': {
    name: 'Notion AI',
    vendor: 'Notion',
    category: 'productivity_ai',
    riskScore: 35,
    apiDomains: ['api.notion.com']
  },
  'app.grammarly.com': {
    name: 'Grammarly',
    vendor: 'Grammarly',
    category: 'text_enhancement',
    riskScore: 30,
    apiDomains: ['api.grammarly.com']
  },
  'app.jasper.ai': {
    name: 'Jasper',
    vendor: 'Jasper',
    category: 'content_generation',
    riskScore: 55,
    apiDomains: ['api.jasper.ai']
  },
  'otter.ai': {
    name: 'Otter.ai',
    vendor: 'Otter.ai',
    category: 'transcription',
    riskScore: 45,
    apiDomains: ['api.otter.ai']
  },
  'fireflies.ai': {
    name: 'Fireflies',
    vendor: 'Fireflies',
    category: 'meeting_intelligence',
    riskScore: 50,
    apiDomains: ['api.fireflies.ai']
  },
  'stability.ai': {
    name: 'Stable Diffusion',
    vendor: 'Stability AI',
    category: 'image_generation',
    riskScore: 55,
    apiDomains: ['api.stability.ai', 'platform.stability.ai']
  },
  'api.stability.ai': {
    name: 'Stable Diffusion API',
    vendor: 'Stability AI',
    category: 'image_generation_api',
    riskScore: 52,
    apiDomains: ['api.stability.ai']
  },
  'huggingface.co': {
    name: 'Hugging Face',
    vendor: 'Hugging Face',
    category: 'ml_platform',
    riskScore: 40,
    apiDomains: ['api-inference.huggingface.co', 'huggingface.co/api']
  },
  'replicate.com': {
    name: 'Replicate',
    vendor: 'Replicate',
    category: 'ml_platform',
    riskScore: 45,
    apiDomains: ['api.replicate.com']
  },
  'api.replicate.com': {
    name: 'Replicate API',
    vendor: 'Replicate',
    category: 'ml_platform_api',
    riskScore: 43,
    apiDomains: ['api.replicate.com']
  },
  'cohere.com': {
    name: 'Cohere',
    vendor: 'Cohere',
    category: 'text_generation',
    riskScore: 40,
    apiDomains: ['api.cohere.com', 'dashboard.cohere.com']
  },
  'api.cohere.com': {
    name: 'Cohere API',
    vendor: 'Cohere',
    category: 'text_generation_api',
    riskScore: 38,
    apiDomains: ['api.cohere.com']
  },
  'aleph-alpha.com': {
    name: 'Aleph Alpha',
    vendor: 'Aleph Alpha',
    category: 'text_generation',
    riskScore: 35,
    apiDomains: ['api.aleph-alpha.com']
  },
  'writesonic.com': {
    name: 'Writesonic',
    vendor: 'Writesonic',
    category: 'content_generation',
    riskScore: 50,
    apiDomains: ['api.writesonic.com']
  },
  'copy.ai': {
    name: 'Copy.ai',
    vendor: 'Copy.ai',
    category: 'content_generation',
    riskScore: 50,
    apiDomains: ['api.copy.ai']
  },
  'openrouter.ai': {
    name: 'OpenRouter',
    vendor: 'OpenRouter',
    category: 'model_router',
    riskScore: 55,
    apiDomains: ['openrouter.ai']
  },
  'together.ai': {
    name: 'Together AI',
    vendor: 'Together AI',
    category: 'model_inference',
    riskScore: 45,
    apiDomains: ['api.together.ai']
  },
  'textsynth.com': {
    name: 'TextSynth',
    vendor: 'TextSynth',
    category: 'text_generation_api',
    riskScore: 40,
    apiDomains: ['api.textsynth.com']
  },
  'lambda.xyz': {
    name: 'Lambda',
    vendor: 'Lambda',
    category: 'gpu_cloud',
    riskScore: 45,
    apiDomains: ['api.lambda.xyz']
  },
  'runwayml.com': {
    name: 'Runway',
    vendor: 'Runway',
    category: 'video_generation',
    riskScore: 60,
    apiDomains: ['api.runwayml.com']
  },
  'synthesia.io': {
    name: 'Synthesia',
    vendor: 'Synthesia',
    category: 'video_generation',
    riskScore: 55,
    apiDomains: ['api.synthesia.io']
  },
  'descript.com': {
    name: 'Descript',
    vendor: 'Descript',
    category: 'audio_video_editing',
    riskScore: 48,
    apiDomains: ['api.descript.com']
  },
  'beatoven.ai': {
    name: 'Beatoven.ai',
    vendor: 'Beatoven.ai',
    category: 'music_generation',
    riskScore: 50,
    apiDomains: ['api.beatoven.ai']
  },
  'murf.ai': {
    name: 'Murf AI',
    vendor: 'Murf AI',
    category: 'speech_synthesis',
    riskScore: 45,
    apiDomains: ['api.murf.ai']
  },
  'cleanup.pictures': {
    name: 'Cleanup.pictures',
    vendor: 'Cleanup.pictures',
    category: 'image_processing',
    riskScore: 40,
    apiDomains: ['api.cleanup.pictures']
  },
  'remove.bg': {
    name: 'Remove.bg',
    vendor: 'Remove.bg',
    category: 'image_processing',
    riskScore: 35,
    apiDomains: ['api.remove.bg']
  },
  'deepdream.ai': {
    name: 'DeepDream',
    vendor: 'DeepDream',
    category: 'image_generation',
    riskScore: 40,
    apiDomains: ['api.deepdream.ai']
  },
  'loom.com': {
    name: 'Loom',
    vendor: 'Loom',
    category: 'video_recording',
    riskScore: 25,
    apiDomains: ['api.loom.com']
  }
};

/**
 * Map of 50+ SSO app identifiers to AI tool names
 * Supports Okta, Azure AD, Google Workspace naming conventions
 * Ported from Vigilex platform
 *
 * @typedef {Object.<string, string>} SSOAppMappings
 */
const SSO_APP_MAPPINGS = {
  // OpenAI
  'chatgpt': 'ChatGPT',
  'openai': 'OpenAI',
  'openai_api': 'OpenAI API',
  'chat_openai': 'ChatGPT',
  '0oa1234567890': 'ChatGPT',

  // Anthropic
  'claude': 'Claude',
  'anthropic': 'Anthropic',
  'anthropic_api': 'Anthropic API',

  // Google
  'gemini': 'Google Gemini',
  'google_gemini': 'Google Gemini',
  'google_generative_language': 'Google Generative Language API',

  // Microsoft
  'copilot': 'Microsoft Copilot',
  'microsoft_copilot': 'Microsoft Copilot',
  'github_copilot': 'GitHub Copilot',
  'github-copilot': 'GitHub Copilot',
  'ms_copilot': 'Microsoft Copilot',

  // Midjourney
  'midjourney': 'Midjourney',
  'mj': 'Midjourney',

  // Cursor
  'cursor': 'Cursor',
  'cursor_ai': 'Cursor',

  // Perplexity
  'perplexity': 'Perplexity',
  'perplexity_ai': 'Perplexity',

  // ElevenLabs
  'elevenlabs': 'ElevenLabs',
  'eleven_labs': 'ElevenLabs',

  // Notion
  'notion': 'Notion',
  'notion_ai': 'Notion AI',

  // Grammarly
  'grammarly': 'Grammarly',

  // Jasper
  'jasper': 'Jasper',
  'jasper_ai': 'Jasper',

  // Otter.ai
  'otter': 'Otter.ai',
  'otter_ai': 'Otter.ai',

  // Fireflies
  'fireflies': 'Fireflies',
  'fireflies_ai': 'Fireflies',

  // Stability AI
  'stability': 'Stable Diffusion',
  'stability_ai': 'Stable Diffusion',
  'stable_diffusion': 'Stable Diffusion',

  // Hugging Face
  'huggingface': 'Hugging Face',
  'hf': 'Hugging Face',

  // Replicate
  'replicate': 'Replicate',

  // Cohere
  'cohere': 'Cohere',

  // Aleph Alpha
  'aleph_alpha': 'Aleph Alpha',

  // Writesonic
  'writesonic': 'Writesonic',

  // Copy.ai
  'copy_ai': 'Copy.ai',
  'copyai': 'Copy.ai',

  // OpenRouter
  'openrouter': 'OpenRouter',
  'open_router': 'OpenRouter',

  // Together AI
  'together': 'Together AI',
  'together_ai': 'Together AI',

  // Runway
  'runway': 'Runway',
  'runwayml': 'Runway',

  // Synthesia
  'synthesia': 'Synthesia',

  // Descript
  'descript': 'Descript',

  // Loom
  'loom': 'Loom',

  // Additional patterns
  'ai_model': 'AI Model',
  'llm': 'LLM',
  'gpt': 'GPT',
  'claude_api': 'Claude API'
};

/**
 * Known pricing for common AI services (for spend estimation)
 * Used when provider billing data is unavailable
 *
 * @type {Object.<string, {pricing: number, unit: string}>}
 */
const AI_SERVICE_PRICING = {
  'ChatGPT': { pricing: 0.002, unit: 'per 1K tokens' },
  'OpenAI API': { pricing: 0.0005, unit: 'per token' },
  'Claude': { pricing: 0.003, unit: 'per 1K tokens' },
  'Anthropic API': { pricing: 0.0008, unit: 'per token' },
  'Google Gemini': { pricing: 0.000075, unit: 'per 1K tokens' },
  'Microsoft Copilot': { pricing: 20, unit: 'per month' },
  'GitHub Copilot': { pricing: 10, unit: 'per month' },
  'Midjourney': { pricing: 15, unit: 'per month (base)' },
  'Cursor': { pricing: 20, unit: 'per month' },
  'Perplexity': { pricing: 20, unit: 'per month' },
  'ElevenLabs': { pricing: 0.000003, unit: 'per character' },
  'Notion AI': { pricing: 8, unit: 'per month add-on' },
  'Grammarly': { pricing: 12, unit: 'per month' },
  'Jasper': { pricing: 39, unit: 'per month (base)' },
  'Otter.ai': { pricing: 8.33, unit: 'per month' },
  'Fireflies': { pricing: 10, unit: 'per month' },
  'Stable Diffusion': { pricing: 0.009, unit: 'per image' },
  'Replicate': { pricing: 0.000350, unit: 'per second' }
};

/**
 * ShadowDiscovery class
 * Main class for detecting and managing unauthorized/ungoverned AI spend
 *
 * @class
 */
class ShadowDiscovery {
  /**
   * Initialize ShadowDiscovery with environment configuration
   *
   * @param {Object} env - Environment object with configuration
   * @param {string} env.SUPABASE_URL - Supabase project URL
   * @param {string} env.SUPABASE_KEY - Supabase API key
   * @param {Object} options - Optional configuration
   * @param {PricingService} options.pricingService - Optional PricingService instance
   */
  constructor(env, options = {}) {
    this.env = env;
    this.supabaseUrl = env.SUPABASE_URL;
    this.supabaseKey = env.SUPABASE_KEY;
    this.pricingService = options.pricingService || null;

    if (!this.supabaseUrl || !this.supabaseKey) {
      throw new Error('SUPABASE_URL and SUPABASE_KEY are required');
    }
  }

  /**
   * Helper method to make Supabase REST API calls
   *
   * @private
   * @param {string} endpoint - API endpoint path
   * @param {Object} options - Fetch options
   * @returns {Promise<any>} Response data
   */
  async _supabaseRequest(endpoint, options = {}) {
    const url = `${this.supabaseUrl}/rest/v1${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Supabase request failed: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Import provider billing data into the system
   *
   * Accepts billing exports in CSV or JSON format and normalizes them
   * to a common format for processing.
   *
   * @async
   * @param {string} orgId - Organization ID
   * @param {string} provider - Billing provider name (e.g., 'openai', 'anthropic')
   * @param {string|Object} billingData - Raw billing data (CSV string or JSON object)
   * @param {Object} options - Optional processing options
   * @param {string} options.format - Explicit format specification
   * @returns {Promise<{importId: string, lineItems: number, totalAmount: number, provider: string, period: {start: string, end: string}}>}
   *
   * @example
   * const result = await discovery.importProviderBilling(
   *   'org_123',
   *   'openai',
   *   csvContent,
   *   { format: 'openai_usage' }
   * );
   */
  async importProviderBilling(orgId, provider, billingData, options = {}) {
    // Parse the billing data
    const format = options.format || this._detectBillingFormat(billingData, provider);
    const normalizedItems = parseProviderBilling(billingData, format, provider);

    if (!normalizedItems || normalizedItems.length === 0) {
      throw new Error('No valid billing line items found in provided data');
    }

    // Calculate aggregate metrics
    const totalAmount = normalizedItems.reduce((sum, item) => sum + (item.amount || 0), 0);
    const periods = normalizedItems
      .filter(item => item.period_start && item.period_end)
      .map(item => ({ start: item.period_start, end: item.period_end }));

    const periodStart = periods.length > 0 ? periods[0].start : new Date().toISOString().split('T')[0];
    const periodEnd = periods.length > 0 ? periods[periods.length - 1].end : new Date().toISOString().split('T')[0];

    // Store in billing_imports table
    const importId = `imp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const importRecord = {
      id: importId,
      org_id: orgId,
      provider,
      format,
      line_items: normalizedItems,
      total_amount: totalAmount,
      period_start: periodStart,
      period_end: periodEnd,
      imported_at: new Date().toISOString(),
      line_item_count: normalizedItems.length
    };

    try {
      await this._supabaseRequest('/billing_imports', {
        method: 'POST',
        body: JSON.stringify(importRecord)
      });
    } catch (error) {
      // Log error but continue - store in memory if needed
      console.error('Failed to store billing import:', error);
    }

    return {
      importId,
      lineItems: normalizedItems.length,
      totalAmount: Math.round(totalAmount * 100) / 100,
      provider,
      period: {
        start: periodStart,
        end: periodEnd
      }
    };
  }

  /**
   * Detect the format of billing data
   *
   * @private
   * @param {string|Object} billingData - Raw billing data
   * @param {string} provider - Provider name hint
   * @returns {string} Detected format
   */
  _detectBillingFormat(billingData, provider) {
    if (typeof billingData === 'object') {
      // JSON format - check for specific provider structures
      if (provider === 'openai' && billingData.data) return 'openai_usage';
      if (provider === 'anthropic' && billingData.usage) return 'anthropic_usage';
      return 'json';
    }

    // CSV format detection based on headers
    const headers = billingData.split('\n')[0].toLowerCase();
    if (headers.includes('cost and usage')) return 'aws_cur';
    if (headers.includes('billing_type') || headers.includes('amount_in_usd')) return 'openai_usage';
    if (headers.includes('input_tokens')) return 'anthropic_usage';
    if (headers.includes('serviceName')) return 'azure_cost';
    if (headers.includes('sku_id')) return 'gcp_billing';

    return 'csv';
  }

  /**
   * Detect shadow spend by comparing provider billing against Finault metered usage
   *
   * Cross-references billing line items with metered usage and categorizes each:
   * - governed: matched to Finault usage
   * - shadow: on provider bill but no Finault usage match
   * - tracking_gap: in Finault but not on provider bill
   *
   * @async
   * @param {string} orgId - Organization ID
   * @param {string} periodStart - Start date (ISO format)
   * @param {string} periodEnd - End date (ISO format)
   * @param {Object} options - Optional detection options
   * @param {number} options.tolerance - Amount tolerance percentage (default: 5)
   * @returns {Promise<{governed: {count: number, amount: number}, shadow: {count: number, amount: number, items: Array}, trackingGap: {count: number, amount: number}, shadowPercent: number, totalProviderBilling: number, totalFinaultMetered: number, variance: number}>}
   *
   * @example
   * const report = await discovery.detectShadowSpend(
   *   'org_123',
   *   '2024-01-01',
   *   '2024-01-31'
   * );
   */
  async detectShadowSpend(orgId, periodStart, periodEnd, options = {}) {
    const tolerance = options.tolerance || 5;

    // Query Finault usage data
    const finaultUsage = await this._queryFinaultUsage(orgId, periodStart, periodEnd);

    // Query provider billing imports
    const providerBilling = await this._queryProviderBilling(orgId, periodStart, periodEnd);

    // Track categorization
    const governed = { count: 0, amount: 0, items: [] };
    const shadow = { count: 0, amount: 0, items: [] };
    const matched = new Set();

    // Match billing items to Finault usage
    for (const billingItem of providerBilling) {
      let isMatched = false;

      for (const usageItem of finaultUsage) {
        if (this._isMatchingUsage(billingItem, usageItem, tolerance)) {
          governed.count++;
          governed.amount += billingItem.amount || 0;
          matched.add(usageItem.id);
          isMatched = true;
          break;
        }
      }

      if (!isMatched) {
        shadow.count++;
        shadow.amount += billingItem.amount || 0;
        shadow.items.push({
          provider: billingItem.provider || 'unknown',
          service: billingItem.service,
          model: billingItem.model,
          amount: billingItem.amount,
          tokens: billingItem.tokens,
          account: billingItem.account,
          period_start: billingItem.period_start,
          period_end: billingItem.period_end,
          tags: billingItem.tags || {}
        });
      }
    }

    // Find tracking gaps (in Finault but not in billing)
    const trackingGap = { count: 0, amount: 0 };
    for (const usageItem of finaultUsage) {
      if (!matched.has(usageItem.id)) {
        trackingGap.count++;
        trackingGap.amount += usageItem.cost || 0;
      }
    }

    // Calculate metrics
    const totalProviderBilling = governed.amount + shadow.amount;
    const totalFinaultMetered = finaultUsage.reduce((sum, item) => sum + (item.cost || 0), 0);
    const variance = totalProviderBilling > 0
      ? Math.round(((totalProviderBilling - totalFinaultMetered) / totalProviderBilling) * 10000) / 100
      : 0;
    const shadowPercent = totalProviderBilling > 0
      ? Math.round((shadow.amount / totalProviderBilling) * 10000) / 100
      : 0;

    return {
      governed: {
        count: governed.count,
        amount: Math.round(governed.amount * 100) / 100
      },
      shadow: {
        count: shadow.count,
        amount: Math.round(shadow.amount * 100) / 100,
        items: shadow.items
      },
      trackingGap: {
        count: trackingGap.count,
        amount: Math.round(trackingGap.amount * 100) / 100
      },
      shadowPercent,
      totalProviderBilling: Math.round(totalProviderBilling * 100) / 100,
      totalFinaultMetered: Math.round(totalFinaultMetered * 100) / 100,
      variance
    };
  }

  /**
   * Query Finault usage data for a period
   *
   * @private
   * @param {string} orgId - Organization ID
   * @param {string} periodStart - Start date
   * @param {string} periodEnd - End date
   * @returns {Promise<Array>} Usage records
   */
  async _queryFinaultUsage(orgId, periodStart, periodEnd) {
    try {
      const query = `/usage?org_id=eq.${orgId}&created_at=gte.${periodStart}&created_at=lte.${periodEnd}`;
      return await this._supabaseRequest(query);
    } catch (error) {
      console.error('Failed to query Finault usage:', error);
      return [];
    }
  }

  /**
   * Query provider billing data for a period
   *
   * @private
   * @param {string} orgId - Organization ID
   * @param {string} periodStart - Start date
   * @param {string} periodEnd - End date
   * @returns {Promise<Array>} Billing records
   */
  async _queryProviderBilling(orgId, periodStart, periodEnd) {
    try {
      const query = `/billing_imports?org_id=eq.${orgId}&period_start=gte.${periodStart}&period_end=lte.${periodEnd}`;
      const imports = await this._supabaseRequest(query);

      // Flatten line items from all imports
      const allItems = [];
      for (const importRecord of imports) {
        if (importRecord.line_items && Array.isArray(importRecord.line_items)) {
          allItems.push(...importRecord.line_items);
        }
      }
      return allItems;
    } catch (error) {
      console.error('Failed to query provider billing:', error);
      return [];
    }
  }

  /**
   * Check if billing and usage items match
   *
   * @private
   * @param {Object} billingItem - Billing line item
   * @param {Object} usageItem - Usage line item
   * @param {number} tolerance - Percentage tolerance (0-100)
   * @returns {boolean} Whether items match
   */
  _isMatchingUsage(billingItem, usageItem, tolerance = 5) {
    // Match provider and model
    if (billingItem.provider !== usageItem.provider) return false;
    if (billingItem.model && usageItem.model && billingItem.model !== usageItem.model) return false;

    // Check period overlap
    const billingStart = new Date(billingItem.period_start);
    const billingEnd = new Date(billingItem.period_end);
    const usageStart = new Date(usageItem.created_at);
    const usageEnd = usageItem.period_end ? new Date(usageItem.period_end) : usageStart;

    if (usageStart > billingEnd || usageEnd < billingStart) return false;

    // Check amount within tolerance
    if (billingItem.amount && usageItem.cost) {
      const diff = Math.abs(billingItem.amount - usageItem.cost) / billingItem.amount;
      if (diff > (tolerance / 100)) return false;
    }

    return true;
  }

  /**
   * Process an SSO login event to detect AI tool usage
   *
   * Parses SSO events from Okta, Azure AD, or Google and identifies
   * if the accessed app is a known AI tool.
   *
   * @async
   * @param {string} orgId - Organization ID
   * @param {Object} ssoEvent - SSO event object
   * @param {string} ssoEvent.provider - SSO provider ('okta', 'azure', 'google')
   * @param {string} ssoEvent.app_id - Application identifier
   * @param {string} ssoEvent.app_name - Application name
   * @param {string} ssoEvent.user_id - User identifier
   * @param {string} ssoEvent.user_email - User email
   * @param {string} ssoEvent.timestamp - Event timestamp
   * @returns {Promise<{detected: boolean, toolName: string|null, vendor: string|null, riskScore: number, status: 'new'|'known'|'blocked'}>}
   *
   * @example
   * const result = await discovery.processSSOEvent(
   *   'org_123',
   *   {
   *     provider: 'okta',
   *     app_id: 'chatgpt',
   *     app_name: 'ChatGPT',
   *     user_id: 'user_456',
   *     user_email: 'user@company.com',
   *     timestamp: new Date().toISOString()
   *   }
   * );
   */
  async processSSOEvent(orgId, ssoEvent) {
    // Normalize app identifier
    const appId = (ssoEvent.app_id || ssoEvent.app_name || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');

    // Look up in SSO app mappings
    const toolName = SSO_APP_MAPPINGS[appId] || ssoEvent.app_name;

    if (!toolName) {
      return {
        detected: false,
        toolName: null,
        vendor: null,
        riskScore: 0,
        status: 'unknown'
      };
    }

    // Find matching AI domain to get metadata
    let riskScore = 50;
    let vendor = 'Unknown';

    for (const [domain, metadata] of Object.entries(AI_DOMAINS)) {
      if (metadata.name === toolName) {
        riskScore = metadata.riskScore;
        vendor = metadata.vendor;
        break;
      }
    }

    // Record detection event
    const detectionEvent = {
      id: `det_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      org_id: orgId,
      method: DETECTION_METHODS.SSO_WEBHOOK,
      tool_name: toolName,
      vendor,
      risk_score: riskScore,
      user_id: ssoEvent.user_id,
      user_email: ssoEvent.user_email,
      detected_at: ssoEvent.timestamp || new Date().toISOString(),
      metadata: {
        sso_provider: ssoEvent.provider,
        app_id: ssoEvent.app_id
      }
    };

    try {
      await this._supabaseRequest('/discovery_events', {
        method: 'POST',
        body: JSON.stringify(detectionEvent)
      });
    } catch (error) {
      console.error('Failed to record SSO detection event:', error);
    }

    // Determine status
    let status = 'new';
    try {
      const existing = await this._supabaseRequest(
        `/shadow_tools?org_id=eq.${orgId}&tool_name=eq.${toolName}`
      );
      if (existing && existing.length > 0) {
        status = existing[0].status || 'known';
      }
    } catch (error) {
      // Tool not found, status remains 'new'
    }

    return {
      detected: true,
      toolName,
      vendor,
      riskScore,
      status
    };
  }

  /**
   * Process a browser extension detection event
   *
   * Records browser-based detection of AI tool access through domain
   * matching and metadata extraction.
   *
   * @async
   * @param {string} orgId - Organization ID
   * @param {Object} event - Browser event object
   * @param {string} event.domain - Accessed domain
   * @param {string} event.userId - User identifier
   * @param {string} event.userEmail - User email
   * @param {string} event.timestamp - Event timestamp (ISO format)
   * @param {number} event.duration - Duration in seconds
   * @param {boolean} event.dataShared - Whether data was shared with domain
   * @returns {Promise<{detected: boolean, toolName: string|null, riskScore: number}>}
   *
   * @example
   * const result = await discovery.processBrowserEvent(
   *   'org_123',
   *   {
   *     domain: 'chat.openai.com',
   *     userId: 'user_456',
   *     userEmail: 'user@company.com',
   *     timestamp: new Date().toISOString(),
   *     duration: 1800,
   *     dataShared: true
   *   }
   * );
   */
  async processBrowserEvent(orgId, event) {
    // Normalize domain
    const domain = (event.domain || '').toLowerCase().trim();

    // Match against AI_DOMAINS
    const metadata = AI_DOMAINS[domain] || this._findDomainMatch(domain);

    if (!metadata) {
      return {
        detected: false,
        toolName: null,
        riskScore: 0
      };
    }

    // Record detection event
    const detectionEvent = {
      id: `det_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      org_id: orgId,
      method: DETECTION_METHODS.BROWSER_EXTENSION,
      tool_name: metadata.name,
      vendor: metadata.vendor,
      risk_score: metadata.riskScore,
      user_id: event.userId,
      user_email: event.userEmail,
      detected_at: event.timestamp || new Date().toISOString(),
      metadata: {
        domain: event.domain,
        duration_seconds: event.duration,
        data_shared: event.dataShared
      }
    };

    try {
      await this._supabaseRequest('/discovery_events', {
        method: 'POST',
        body: JSON.stringify(detectionEvent)
      });
    } catch (error) {
      console.error('Failed to record browser detection event:', error);
    }

    return {
      detected: true,
      toolName: metadata.name,
      riskScore: metadata.riskScore
    };
  }

  /**
   * Find a domain match in AI_DOMAINS using fuzzy matching
   *
   * @private
   * @param {string} domain - Domain to match
   * @returns {Object|null} Matching metadata or null
   */
  _findDomainMatch(domain) {
    // Direct match
    if (AI_DOMAINS[domain]) {
      return AI_DOMAINS[domain];
    }

    // Check if domain is a subdomain of any known domain
    for (const [aiDomain, metadata] of Object.entries(AI_DOMAINS)) {
      if (domain.endsWith(aiDomain)) {
        return metadata;
      }
    }

    return null;
  }

  /**
   * Get a comprehensive discovery report
   *
   * Aggregates all detection sources (billing, SSO, browser) into a
   * comprehensive report with summary metrics, tool details, and recommendations.
   *
   * @async
   * @param {string} orgId - Organization ID
   * @param {Object} options - Report options
   * @param {number} options.daysBack - Number of days back to report (default: 30)
   * @param {string} options.status - Filter by status ('unreviewed', 'approved', 'blocked', 'monitoring')
   * @returns {Promise<{summary: {totalTools: number, shadowTools: number, governedTools: number, blockedTools: number, totalUsers: number, totalEvents: number, shadowSpendEstimate: number}, tools: Array, trends: {monthOverMonth: number}, recommendations: Array}>}
   *
   * @example
   * const report = await discovery.getDiscoveryReport('org_123', { daysBack: 30 });
   */
  async getDiscoveryReport(orgId, options = {}) {
    const daysBack = options.daysBack || 30;
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - daysBack);
    const periodStartStr = periodStart.toISOString().split('T')[0];
    const periodEndStr = new Date().toISOString().split('T')[0];

    // Query all detection events
    let events = [];
    try {
      const query = `/discovery_events?org_id=eq.${orgId}&detected_at=gte.${periodStartStr}`;
      events = await this._supabaseRequest(query);
    } catch (error) {
      console.error('Failed to query detection events:', error);
    }

    // Query shadow tools and their status
    let shadowTools = [];
    try {
      const query = `/shadow_tools?org_id=eq.${orgId}`;
      shadowTools = await this._supabaseRequest(query);
    } catch (error) {
      console.error('Failed to query shadow tools:', error);
    }

    // Aggregate by tool
    const toolMap = {};
    for (const event of events) {
      const toolKey = event.tool_name;
      if (!toolMap[toolKey]) {
        toolMap[toolKey] = {
          name: event.tool_name,
          vendor: event.vendor,
          riskScore: event.risk_score,
          detectionMethods: new Set(),
          users: new Set(),
          eventCount: 0,
          firstDetected: event.detected_at,
          lastActivity: event.detected_at,
          estimatedMonthlySpend: 0,
          status: 'unreviewed'
        };
      }

      const tool = toolMap[toolKey];
      tool.detectionMethods.add(event.method);
      tool.users.add(event.user_email);
      tool.eventCount++;
      tool.lastActivity = event.detected_at;

      // Find matching shadow tool status
      const shadowTool = shadowTools.find(st => st.tool_name === toolKey);
      if (shadowTool) {
        tool.status = shadowTool.status;
        tool.estimatedMonthlySpend = shadowTool.estimated_monthly_spend || 0;
      }
    }

    // Convert tool data to array format
    const tools = Object.values(toolMap).map(tool => ({
      name: tool.name,
      vendor: tool.vendor,
      category: this._getToolCategory(tool.name),
      riskScore: tool.riskScore,
      detectionMethod: Array.from(tool.detectionMethods),
      userCount: tool.users.size,
      eventCount: tool.eventCount,
      firstDetected: tool.firstDetected,
      lastActivity: tool.lastActivity,
      status: tool.status,
      estimatedMonthlySpend: Math.round(tool.estimatedMonthlySpend * 100) / 100
    }));

    // Calculate summary metrics
    const blockedTools = tools.filter(t => t.status === 'blocked').length;
    const governedTools = shadowTools.filter(st => st.status === 'approved').length;
    const shadowSpendEstimate = tools.reduce((sum, tool) => sum + tool.estimatedMonthlySpend, 0);
    const allUsers = new Set();
    for (const tool of tools) {
      // This is approximate - would need to query events for exact count
    }

    // Generate recommendations
    const recommendations = this._generateRecommendations(tools, events.length);

    return {
      summary: {
        totalTools: tools.length,
        shadowTools: tools.filter(t => t.status === 'unreviewed').length,
        governedTools,
        blockedTools,
        totalUsers: new Set(events.map(e => e.user_email)).size,
        totalEvents: events.length,
        shadowSpendEstimate: Math.round(shadowSpendEstimate * 100) / 100
      },
      tools: tools.sort((a, b) => b.eventCount - a.eventCount),
      trends: {
        monthOverMonth: this._calculateTrend(events, daysBack)
      },
      recommendations
    };
  }

  /**
   * Get tool category from tool name
   *
   * @private
   * @param {string} toolName - Tool name
   * @returns {string} Category
   */
  _getToolCategory(toolName) {
    for (const [domain, metadata] of Object.entries(AI_DOMAINS)) {
      if (metadata.name === toolName) {
        return metadata.category;
      }
    }
    return 'unknown';
  }

  /**
   * Calculate month-over-month trend
   *
   * @private
   * @param {Array} events - Detection events
   * @param {number} daysBack - Period covered
   * @returns {number} Percentage change
   */
  _calculateTrend(events, daysBack) {
    const midpoint = Math.floor(daysBack / 2);
    const now = new Date();

    const firstPeriodCount = events.filter(e => {
      const eventDate = new Date(e.detected_at);
      const daysOld = Math.floor((now - eventDate) / (1000 * 60 * 60 * 24));
      return daysOld >= midpoint && daysOld <= daysBack;
    }).length;

    const secondPeriodCount = events.filter(e => {
      const eventDate = new Date(e.detected_at);
      const daysOld = Math.floor((now - eventDate) / (1000 * 60 * 60 * 24));
      return daysOld < midpoint;
    }).length;

    if (firstPeriodCount === 0) return 0;
    return Math.round(((secondPeriodCount - firstPeriodCount) / firstPeriodCount) * 10000) / 100;
  }

  /**
   * Generate recommendations based on detected tools and events
   *
   * @private
   * @param {Array} tools - Tool list
   * @param {number} eventCount - Total events
   * @returns {Array} Recommendations
   */
  _generateRecommendations(tools, eventCount) {
    const recommendations = [];

    // High risk tools
    const highRiskTools = tools.filter(t => t.riskScore >= 60);
    if (highRiskTools.length > 0) {
      recommendations.push({
        priority: 'high',
        title: 'Address High-Risk AI Tools',
        description: `${highRiskTools.length} high-risk AI tools detected. Review and establish policy.`,
        tools: highRiskTools.map(t => t.name)
      });
    }

    // Widely used shadow tools
    const widelyUsed = tools.filter(t => t.userCount >= 5);
    if (widelyUsed.length > 0) {
      recommendations.push({
        priority: 'high',
        title: 'Evaluate Popular Shadow Tools',
        description: `${widelyUsed.length} tools used by 5+ employees. Consider formal approval or blocking.`,
        tools: widelyUsed.map(t => t.name)
      });
    }

    // High-spend tools
    const highSpend = tools.filter(t => t.estimatedMonthlySpend > 100);
    if (highSpend.length > 0) {
      recommendations.push({
        priority: 'high',
        title: 'Optimize AI Spend',
        description: `${highSpend.length} tools with estimated spend >$100/month. Consolidate or negotiate.`,
        tools: highSpend.map(t => `${t.name} (~$${t.estimatedMonthlySpend}/mo)`)
      });
    }

    // Enable monitoring
    if (eventCount > 100) {
      recommendations.push({
        priority: 'medium',
        title: 'Increase Monitoring Coverage',
        description: 'High detection volume. Expand browser extension or SSO webhook coverage.',
        tools: []
      });
    }

    // Establish approval workflow
    if (tools.filter(t => t.status === 'unreviewed').length > 0) {
      recommendations.push({
        priority: 'medium',
        title: 'Establish Tool Approval Workflow',
        description: 'Create formal process for reviewing and approving/blocking detected tools.',
        tools: []
      });
    }

    return recommendations;
  }

  /**
   * Update the status of a detected tool
   *
   * Changes the status of a tool to reflect organizational decision:
   * - 'unreviewed': Default, needs review
   * - 'approved': Approved for use, add to governed AI list
   * - 'blocked': Not permitted, should be enforced
   * - 'monitoring': Approved but under enhanced monitoring
   *
   * @async
   * @param {string} orgId - Organization ID
   * @param {string} toolName - Tool name
   * @param {string} status - New status
   * @param {Object} options - Optional metadata
   * @returns {Promise<Object>} Updated tool record
   *
   * @example
   * const updated = await discovery.updateToolStatus(
   *   'org_123',
   *   'ChatGPT',
   *   'approved'
   * );
   */
  async updateToolStatus(orgId, toolName, status, options = {}) {
    if (!['unreviewed', 'approved', 'blocked', 'monitoring'].includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    // Find or create shadow tool record
    let shadowTool;
    try {
      const existing = await this._supabaseRequest(
        `/shadow_tools?org_id=eq.${orgId}&tool_name=eq.${toolName}`
      );
      shadowTool = existing && existing.length > 0 ? existing[0] : null;
    } catch (error) {
      shadowTool = null;
    }

    const toolRecord = {
      org_id: orgId,
      tool_name: toolName,
      status,
      updated_at: new Date().toISOString(),
      metadata: options.metadata || {},
      notes: options.notes || ''
    };

    // Get tool metadata for enrichment
    for (const [domain, metadata] of Object.entries(AI_DOMAINS)) {
      if (metadata.name === toolName) {
        toolRecord.vendor = metadata.vendor;
        toolRecord.category = metadata.category;
        toolRecord.risk_score = metadata.riskScore;
        break;
      }
    }

    try {
      if (shadowTool) {
        // Update existing
        await this._supabaseRequest(`/shadow_tools?id=eq.${shadowTool.id}`, {
          method: 'PATCH',
          body: JSON.stringify(toolRecord)
        });
      } else {
        // Create new
        toolRecord.id = `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await this._supabaseRequest('/shadow_tools', {
          method: 'POST',
          body: JSON.stringify(toolRecord)
        });
      }
    } catch (error) {
      console.error('Failed to update tool status:', error);
      throw error;
    }

    return toolRecord;
  }
}

/**
 * Parse provider billing data into normalized format
 *
 * Supports multiple provider formats:
 * - aws_cur: AWS Cost & Usage Report CSV
 * - openai_usage: OpenAI usage export JSON
 * - anthropic_usage: Anthropic usage export
 * - azure_cost: Azure Cost Management export
 * - gcp_billing: Google Cloud billing export
 * - csv: Generic CSV format
 * - json: Generic JSON format
 *
 * @param {string|Object} rawData - Raw billing data
 * @param {string} format - Expected format type
 * @param {string} provider - Provider name
 * @returns {Array<{service: string, model: string, amount: number, tokens: number, period_start: string, period_end: string, account: string, tags: Object}>} Normalized line items
 *
 * @example
 * const items = parseProviderBilling(csvContent, 'openai_usage', 'openai');
 */
function parseProviderBilling(rawData, format, provider) {
  const items = [];

  if (format === 'openai_usage' || format === 'json' && provider === 'openai') {
    return _parseOpenAIUsage(rawData);
  } else if (format === 'anthropic_usage' || format === 'json' && provider === 'anthropic') {
    return _parseAnthropicUsage(rawData);
  } else if (format === 'aws_cur') {
    return _parseAWSCUR(rawData);
  } else if (format === 'azure_cost') {
    return _parseAzureCost(rawData);
  } else if (format === 'gcp_billing') {
    return _parseGCPBilling(rawData);
  } else if (format === 'csv') {
    return _parseGenericCSV(rawData);
  } else if (format === 'json' || typeof rawData === 'object') {
    return _parseGenericJSON(rawData);
  }

  return items;
}

/**
 * Parse OpenAI usage export (JSON format)
 *
 * @private
 * @param {string|Object} data - Raw data
 * @returns {Array} Normalized items
 */
function _parseOpenAIUsage(data) {
  const items = [];

  try {
    const json = typeof data === 'string' ? JSON.parse(data) : data;
    const records = json.data || json.usage || [];

    for (const record of records) {
      items.push({
        service: 'ChatGPT' || record.service || 'OpenAI',
        model: record.model || 'gpt-3.5-turbo',
        amount: parseFloat(record.amount_in_usd || record.cost || 0),
        tokens: parseInt(record.total_tokens || 0),
        prompt_tokens: parseInt(record.prompt_tokens || 0),
        completion_tokens: parseInt(record.completion_tokens || 0),
        period_start: record.date || record.period_start || new Date().toISOString().split('T')[0],
        period_end: record.date || record.period_end || new Date().toISOString().split('T')[0],
        account: record.account || record.organization || 'default',
        tags: {
          api_key_id: record.api_key_id,
          user_country: record.user_country
        }
      });
    }
  } catch (error) {
    console.error('Failed to parse OpenAI usage:', error);
  }

  return items;
}

/**
 * Parse Anthropic usage export (JSON format)
 *
 * @private
 * @param {string|Object} data - Raw data
 * @returns {Array} Normalized items
 */
function _parseAnthropicUsage(data) {
  const items = [];

  try {
    const json = typeof data === 'string' ? JSON.parse(data) : data;
    const records = json.data || json.usage || [];

    for (const record of records) {
      items.push({
        service: 'Claude' || record.service || 'Anthropic',
        model: record.model || 'claude-2',
        amount: parseFloat(record.amount || record.cost || 0),
        tokens: parseInt(record.input_tokens || 0) + parseInt(record.output_tokens || 0),
        input_tokens: parseInt(record.input_tokens || 0),
        output_tokens: parseInt(record.output_tokens || 0),
        period_start: record.date || record.period_start || new Date().toISOString().split('T')[0],
        period_end: record.date || record.period_end || new Date().toISOString().split('T')[0],
        account: record.account || 'default',
        tags: {
          request_count: record.request_count,
          batch_size: record.batch_size
        }
      });
    }
  } catch (error) {
    console.error('Failed to parse Anthropic usage:', error);
  }

  return items;
}

/**
 * Parse AWS Cost & Usage Report (CSV format)
 *
 * @private
 * @param {string} csvData - CSV data
 * @returns {Array} Normalized items
 */
function _parseAWSCUR(csvData) {
  const items = [];
  const lines = csvData.split('\n').filter(line => line.trim());

  if (lines.length < 2) return items;

  const headers = lines[0].split(',').map(h => h.trim());
  const serviceIdx = headers.findIndex(h => h.toLowerCase().includes('service'));
  const usageTypeIdx = headers.findIndex(h => h.toLowerCase().includes('usage'));
  const costIdx = headers.findIndex(h => h.toLowerCase().includes('cost') || h.toLowerCase().includes('amount'));
  const dateIdx = headers.findIndex(h => h.toLowerCase().includes('date') || h.toLowerCase().includes('time'));

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',').map(p => p.trim());

    // Only process AI-related services
    const service = parts[serviceIdx] || '';
    if (!_isAIService(service)) continue;

    items.push({
      service: service,
      model: parts[usageTypeIdx] || 'unknown',
      amount: parseFloat(parts[costIdx] || 0),
      tokens: 0,
      period_start: parts[dateIdx] || new Date().toISOString().split('T')[0],
      period_end: parts[dateIdx] || new Date().toISOString().split('T')[0],
      account: 'aws',
      tags: {
        usage_type: parts[usageTypeIdx]
      }
    });
  }

  return items;
}

/**
 * Parse Azure Cost Management export (CSV format)
 *
 * @private
 * @param {string} csvData - CSV data
 * @returns {Array} Normalized items
 */
function _parseAzureCost(csvData) {
  const items = [];
  const lines = csvData.split('\n').filter(line => line.trim());

  if (lines.length < 2) return items;

  const headers = lines[0].split(',').map(h => h.trim());
  const serviceNameIdx = headers.findIndex(h => h.toLowerCase().includes('servicename'));
  const resourceTypeIdx = headers.findIndex(h => h.toLowerCase().includes('resourcetype'));
  const costIdx = headers.findIndex(h => h.toLowerCase().includes('cost') || h.toLowerCase().includes('pretaxcost'));
  const dateIdx = headers.findIndex(h => h.toLowerCase().includes('date'));

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',').map(p => p.trim());

    const serviceName = parts[serviceNameIdx] || '';
    if (!_isAIService(serviceName)) continue;

    items.push({
      service: serviceName,
      model: parts[resourceTypeIdx] || 'unknown',
      amount: parseFloat(parts[costIdx] || 0),
      tokens: 0,
      period_start: parts[dateIdx] || new Date().toISOString().split('T')[0],
      period_end: parts[dateIdx] || new Date().toISOString().split('T')[0],
      account: 'azure',
      tags: {
        resource_type: parts[resourceTypeIdx]
      }
    });
  }

  return items;
}

/**
 * Parse Google Cloud billing export (CSV format)
 *
 * @private
 * @param {string} csvData - CSV data
 * @returns {Array} Normalized items
 */
function _parseGCPBilling(csvData) {
  const items = [];
  const lines = csvData.split('\n').filter(line => line.trim());

  if (lines.length < 2) return items;

  const headers = lines[0].split(',').map(h => h.trim());
  const serviceIdx = headers.findIndex(h => h.toLowerCase().includes('service'));
  const skuIdx = headers.findIndex(h => h.toLowerCase().includes('sku'));
  const costIdx = headers.findIndex(h => h.toLowerCase().includes('cost') || h.toLowerCase().includes('amount'));
  const dateIdx = headers.findIndex(h => h.toLowerCase().includes('date'));

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',').map(p => p.trim());

    const service = parts[serviceIdx] || '';
    if (!_isAIService(service)) continue;

    items.push({
      service: service,
      model: parts[skuIdx] || 'unknown',
      amount: parseFloat(parts[costIdx] || 0),
      tokens: 0,
      period_start: parts[dateIdx] || new Date().toISOString().split('T')[0],
      period_end: parts[dateIdx] || new Date().toISOString().split('T')[0],
      account: 'gcp',
      tags: {
        sku: parts[skuIdx]
      }
    });
  }

  return items;
}

/**
 * Parse generic CSV format
 *
 * @private
 * @param {string} csvData - CSV data
 * @returns {Array} Normalized items
 */
function _parseGenericCSV(csvData) {
  const items = [];
  const lines = csvData.split('\n').filter(line => line.trim());

  if (lines.length < 2) return items;

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

  // Find likely column positions
  const serviceIdx = headers.findIndex(h => h.includes('service') || h.includes('name'));
  const modelIdx = headers.findIndex(h => h.includes('model'));
  const costIdx = headers.findIndex(h => h.includes('cost') || h.includes('amount') || h.includes('price'));
  const dateIdx = headers.findIndex(h => h.includes('date') || h.includes('time'));

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',').map(p => p.trim());

    items.push({
      service: serviceIdx >= 0 ? parts[serviceIdx] : 'unknown',
      model: modelIdx >= 0 ? parts[modelIdx] : 'unknown',
      amount: costIdx >= 0 ? parseFloat(parts[costIdx] || 0) : 0,
      tokens: 0,
      period_start: dateIdx >= 0 ? parts[dateIdx] : new Date().toISOString().split('T')[0],
      period_end: dateIdx >= 0 ? parts[dateIdx] : new Date().toISOString().split('T')[0],
      account: 'default',
      tags: {}
    });
  }

  return items;
}

/**
 * Parse generic JSON format
 *
 * @private
 * @param {Object} jsonData - JSON data
 * @returns {Array} Normalized items
 */
function _parseGenericJSON(jsonData) {
  const items = [];

  // Handle array of items
  if (Array.isArray(jsonData)) {
    for (const record of jsonData) {
      items.push(_normalizeJSONRecord(record));
    }
  }
  // Handle object with data array
  else if (jsonData.data && Array.isArray(jsonData.data)) {
    for (const record of jsonData.data) {
      items.push(_normalizeJSONRecord(record));
    }
  }
  // Handle object with items array
  else if (jsonData.items && Array.isArray(jsonData.items)) {
    for (const record of jsonData.items) {
      items.push(_normalizeJSONRecord(record));
    }
  }
  // Single record
  else {
    items.push(_normalizeJSONRecord(jsonData));
  }

  return items;
}

/**
 * Normalize a JSON record to standard format
 *
 * @private
 * @param {Object} record - Record object
 * @returns {Object} Normalized record
 */
function _normalizeJSONRecord(record) {
  return {
    service: record.service || record.name || record.provider || 'unknown',
    model: record.model || record.type || 'unknown',
    amount: parseFloat(record.amount || record.cost || 0),
    tokens: parseInt(record.tokens || 0),
    period_start: record.period_start || record.date || new Date().toISOString().split('T')[0],
    period_end: record.period_end || record.date || new Date().toISOString().split('T')[0],
    account: record.account || record.org || 'default',
    tags: record.tags || {}
  };
}

/**
 * Check if a service name is AI-related
 *
 * @private
 * @param {string} service - Service name
 * @returns {boolean} Whether service is AI-related
 */
function _isAIService(service) {
  const aiKeywords = ['ai', 'ml', 'llm', 'bedrock', 'sagemaker', 'vertex', 'copilot', 'gpt', 'claude', 'gemini', 'anthropic', 'openai'];
  const serviceLower = service.toLowerCase();
  return aiKeywords.some(keyword => serviceLower.includes(keyword));
}

/**
 * Estimate monthly spend for a shadow tool based on usage patterns
 *
 * Estimates cost based on:
 * - Event count (login frequency = usage frequency)
 * - Average session duration
 * - Known pricing for the tool
 * - Risk score (higher risk tools often have higher spend)
 *
 * @param {string} toolName - Name of the tool
 * @param {number} eventCount - Number of detection events in period
 * @param {number} avgDuration - Average session duration in seconds
 * @param {Object} options - Optional estimation parameters
 * @param {number} options.assumption - Usage assumption multiplier (default: 1.5)
 * @returns {number} Estimated monthly spend in USD
 *
 * @example
 * const estimate = estimateShadowSpend('ChatGPT', 45, 1800);
 * // Returns: estimated monthly cost
 */
function estimateShadowSpend(toolName, eventCount, avgDuration, options = {}) {
  const assumption = options.assumption || 1.5;

  // Get pricing for the tool
  const toolPricing = AI_SERVICE_PRICING[toolName];

  if (!toolPricing) {
    // Fallback: estimate based on event patterns
    // Average: $20/month per employee + $10 per 10 hours of usage
    const hoursOfUsage = (eventCount * avgDuration) / 3600;
    return 20 + (hoursOfUsage / 10) * 10;
  }

  // Token/session-based pricing
  if (toolPricing.unit.includes('token')) {
    // Estimate tokens per session
    const avgTokensPerSession = 1000 * (avgDuration / 600); // ~1000 tokens per 10 min
    const totalTokens = eventCount * avgTokensPerSession * assumption;
    const tokensInThousands = totalTokens / 1000;
    return tokensInThousands * toolPricing.pricing;
  }

  // Character-based pricing
  if (toolPricing.unit.includes('character')) {
    const charsPerSecond = 50; // Typical rate
    const totalChars = eventCount * avgDuration * charsPerSecond * assumption;
    return (totalChars / 1000000) * toolPricing.pricing * 1000000;
  }

  // Monthly subscription
  if (toolPricing.unit.includes('month')) {
    // Check if it's actually being used (proxy: if more than 5 events)
    if (eventCount > 5) {
      return toolPricing.pricing;
    }
    // Pro-rated for low usage
    return (eventCount / 20) * toolPricing.pricing;
  }

  // Per-second GPU/compute pricing
  if (toolPricing.unit.includes('second')) {
    const totalSeconds = eventCount * avgDuration * assumption;
    return totalSeconds * toolPricing.pricing;
  }

  // Per-image pricing
  if (toolPricing.unit.includes('image')) {
    const imagesPerSession = Math.max(1, Math.floor(avgDuration / 120)); // 1 image per 2 min
    const totalImages = eventCount * imagesPerSession;
    return totalImages * toolPricing.pricing;
  }

  // Default fallback
  return eventCount * (avgDuration / 3600) * 10; // $10/hour assumption
}

// Export CommonJS module
module.exports = {
  DETECTION_METHODS,
  AI_DOMAINS,
  SSO_APP_MAPPINGS,
  ShadowDiscovery,
  parseProviderBilling,
  estimateShadowSpend
};
