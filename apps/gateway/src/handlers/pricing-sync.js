/**
 * Model Pricing Sync Handler
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Syncs LiteLLM's model pricing data into Finault's pricing table.
 * - Fetches model_prices_and_context_window.json from GitHub raw
 * - Normalizes into Finault schema
 * - Persists to D1 (Cloudflare Workers database)
 * - Tracks unknown models in pricing_gaps table
 * - Designed to run as daily cron trigger
 */

import { jsonResponse, errorResponse } from '../utils.js';

// ═══════════════════════════════════════════════════════════════════════════════
// LITELLM PRICING SYNC
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Main pricing sync handler — fetches and normalizes LiteLLM pricing data
 *
 * @param {Object} env - Environment (D1, KV)
 * @returns {Promise<Response>}
 */
export async function handlePricingSync(env) {
  try {
    // Fetch LiteLLM pricing data from GitHub raw
    const pricingUrl = 'https://raw.githubusercontent.com/BerriAI/litellm/main/litellm/model_prices_and_context_window.json';

    console.log(`[PRICING-SYNC] Fetching LiteLLM pricing data from ${pricingUrl}`);

    const response = await fetch(pricingUrl, {
      cf: { cacheTtl: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch LiteLLM pricing: HTTP ${response.status}`);
    }

    const litellmData = await response.json();

    // Transform and normalize data
    const normalizedModels = await normalizeModelPricing(env, litellmData);

    console.log(`[PRICING-SYNC] Normalized ${normalizedModels.length} models`);

    // Write to D1
    const writeResult = await persistPricingToD1(env, normalizedModels);

    console.log(`[PRICING-SYNC] Persisted ${writeResult.inserted} models to D1`);

    // Log sync status
    await logPricingSync(env, {
      timestamp: new Date().toISOString(),
      model_count: normalizedModels.length,
      pricing_gaps: writeResult.gaps,
      success: true,
    });

    return jsonResponse({
      success: true,
      message: 'Pricing sync completed',
      model_count: normalizedModels.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[PRICING-SYNC] Error: ${error.message}`);

    await logPricingSync(env, {
      timestamp: new Date().toISOString(),
      error: error.message,
      success: false,
    });

    return errorResponse('PRICING_SYNC_FAILED', error.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODEL PRICING NORMALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Normalize LiteLLM pricing data into Finault schema
 *
 * LiteLLM format (example):
 * {
 *   "gpt-4": {
 *     "input_cost_per_token": 0.00003,
 *     "output_cost_per_token": 0.00006,
 *     "context_window": 8192
 *   }
 * }
 *
 * Finault schema:
 * {
 *   model: "gpt-4",
 *   provider: "openai",
 *   input_cost_per_token: 0.00003,
 *   output_cost_per_token: 0.00006,
 *   context_window: 8192,
 *   pricing_last_updated: "2026-03-22T..."
 * }
 *
 * @param {Object} env - Environment
 * @param {Object} litellmData - LiteLLM pricing data
 * @returns {Promise<Array>} Normalized models
 */
async function normalizeModelPricing(env, litellmData) {
  const normalized = [];
  const gaps = [];

  for (const [modelKey, pricing] of Object.entries(litellmData || {})) {
    // Extract provider from model key (e.g., "openai/gpt-4" or "gpt-4")
    const { provider, model } = extractProviderAndModel(modelKey);

    if (!provider) {
      gaps.push({
        model: modelKey,
        reason: 'Could not extract provider',
        detected_at: new Date().toISOString(),
      });
      continue;
    }

    // Validate pricing data
    const inputCost = pricing?.input_cost_per_token || 0;
    const outputCost = pricing?.output_cost_per_token || 0;
    const contextWindow = pricing?.context_window || 4096; // Default to 4K

    if (inputCost === undefined && outputCost === undefined) {
      gaps.push({
        model: modelKey,
        reason: 'Missing pricing data',
        detected_at: new Date().toISOString(),
      });
      continue;
    }

    normalized.push({
      model,
      provider,
      input_cost_per_token: inputCost,
      output_cost_per_token: outputCost,
      context_window: contextWindow,
      pricing_source: 'litellm',
      pricing_last_updated: new Date().toISOString(),
    });
  }

  // Store pricing gaps for monitoring dashboard
  if (gaps.length > 0) {
    try {
      const db = env.DB;
      for (const gap of gaps) {
        await db.prepare(
          `INSERT INTO pricing_gaps (model, reason, detected_at)
           VALUES (?, ?, ?)
           ON CONFLICT(model) DO UPDATE SET
           detected_at = excluded.detected_at,
           occurrence_count = occurrence_count + 1`
        ).bind(gap.model, gap.reason, gap.detected_at).run();
      }
      console.log(`[PRICING-SYNC] Logged ${gaps.length} pricing gaps`);
    } catch (err) {
      console.warn(`[PRICING-SYNC] Failed to log gaps: ${err.message}`);
    }
  }

  return normalized;
}

/**
 * Extract provider and model name from LiteLLM model key
 * Examples:
 *   "openai/gpt-4" → { provider: "openai", model: "gpt-4" }
 *   "gpt-4" → { provider: "openai", model: "gpt-4" }
 *   "claude-3-opus" → { provider: "anthropic", model: "claude-3-opus" }
 *
 * @param {string} modelKey
 * @returns {Object} { provider, model }
 */
function extractProviderAndModel(modelKey) {
  // If already has provider prefix
  if (modelKey.includes('/')) {
    const [provider, ...rest] = modelKey.split('/');
    return {
      provider: provider.toLowerCase(),
      model: rest.join('/'),
    };
  }

  // Infer provider from model name
  const inferredProvider = inferProviderFromModel(modelKey);
  return {
    provider: inferredProvider,
    model: modelKey,
  };
}

/**
 * Infer AI provider from model name
 * @param {string} model
 * @returns {string|null}
 */
function inferProviderFromModel(model) {
  const lowerModel = model.toLowerCase();

  if (lowerModel.startsWith('gpt-') || lowerModel.startsWith('gpt4')) {
    return 'openai';
  }
  if (lowerModel.startsWith('claude-')) {
    return 'anthropic';
  }
  if (lowerModel.startsWith('gemini-') || lowerModel.startsWith('text-bison')) {
    return 'google';
  }
  if (lowerModel.startsWith('llama-')) {
    return 'meta';
  }
  if (lowerModel.includes('bedrock')) {
    return 'aws';
  }
  if (lowerModel.startsWith('mistral-')) {
    return 'mistral';
  }
  if (lowerModel.startsWith('command-')) {
    return 'cohere';
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// D1 PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Persist normalized pricing to D1 database
 *
 * @param {Object} env - Environment with DB
 * @param {Array} models - Normalized model pricing data
 * @returns {Promise<Object>} Result with inserted count and gaps
 */
async function persistPricingToD1(env, models) {
  const db = env.DB;
  let inserted = 0;
  const gaps = [];

  try {
    for (const model of models) {
      try {
        const result = await db.prepare(
          `INSERT INTO model_pricing
           (model, provider, input_cost_per_token, output_cost_per_token, context_window, pricing_source, pricing_last_updated)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(model, provider) DO UPDATE SET
           input_cost_per_token = excluded.input_cost_per_token,
           output_cost_per_token = excluded.output_cost_per_token,
           context_window = excluded.context_window,
           pricing_last_updated = excluded.pricing_last_updated`
        ).bind(
          model.model,
          model.provider,
          model.input_cost_per_token,
          model.output_cost_per_token,
          model.context_window,
          model.pricing_source,
          model.pricing_last_updated
        ).run();

        inserted++;
      } catch (err) {
        console.warn(`[PRICING-SYNC] Failed to insert ${model.model}: ${err.message}`);
        gaps.push({
          model: model.model,
          error: err.message,
        });
      }
    }
  } catch (error) {
    throw new Error(`D1 persistence failed: ${error.message}`);
  }

  return { inserted, gaps };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRICING STATUS HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get pricing sync status and diagnostics
 * Returns: last sync time, model count, gaps
 *
 * @param {Object} env - Environment
 * @returns {Promise<Response>}
 */
export async function handlePricingStatus(env) {
  try {
    const db = env.DB;

    // Get last sync
    const lastSync = await db.prepare(
      `SELECT timestamp, model_count, pricing_gaps, success
       FROM pricing_sync_log
       ORDER BY timestamp DESC
       LIMIT 1`
    ).first();

    // Get model count
    const modelCountResult = await db.prepare(
      `SELECT COUNT(*) as count FROM model_pricing`
    ).first();

    // Get gaps
    const gaps = await db.prepare(
      `SELECT model, reason, occurrence_count, detected_at
       FROM pricing_gaps
       ORDER BY occurrence_count DESC
       LIMIT 10`
    ).all();

    return jsonResponse({
      last_sync: lastSync ? {
        timestamp: lastSync.timestamp,
        model_count: lastSync.model_count,
        gaps: lastSync.pricing_gaps,
        success: lastSync.success,
      } : null,
      current_model_count: modelCountResult?.count || 0,
      pricing_gaps: gaps?.results || [],
      status: 'healthy',
    });
  } catch (error) {
    console.error(`[PRICING-STATUS] Error: ${error.message}`);
    return errorResponse('PRICING_STATUS_FAILED', error.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Log pricing sync attempt to D1 for monitoring
 *
 * @param {Object} env
 * @param {Object} logData - Sync metadata
 */
async function logPricingSync(env, logData) {
  try {
    const db = env.DB;

    await db.prepare(
      `INSERT INTO pricing_sync_log
       (timestamp, model_count, pricing_gaps, error, success)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(
      logData.timestamp,
      logData.model_count || 0,
      logData.pricing_gaps ? JSON.stringify(logData.pricing_gaps) : null,
      logData.error || null,
      logData.success ? 1 : 0
    ).run();
  } catch (err) {
    console.warn(`[PRICING-SYNC] Could not log sync status: ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  handlePricingSync,
  handlePricingStatus,
  normalizeModelPricing,
  persistPricingToD1,
};
