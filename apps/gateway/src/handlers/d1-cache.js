/**
 * D1 Cache Handler
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * D1 edge caching for hot-path reads:
 * - Model pricing (sub-ms edge read)
 * - Organization settings (org config at the edge)
 * - Attribution rules
 * - Sync D1 from Supabase source of truth
 */

import { jsonResponse, errorResponse } from '../utils.js';
import { getOrgIdFromAuth } from '../auth.js';

/**
 * Initialize D1 cache tables
 */
const initD1Cache = async (env) => {
  const db = env.DB;

  if (!db) {
    console.warn('D1 database not configured');
    return false;
  }

  try {
    // Create model_pricing table
    await db.exec(`
      CREATE TABLE IF NOT EXISTS model_pricing (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_name TEXT UNIQUE NOT NULL,
        provider TEXT NOT NULL,
        input_cost_per_1k REAL NOT NULL,
        output_cost_per_1k REAL NOT NULL,
        last_updated TEXT NOT NULL,
        source TEXT DEFAULT 'supabase'
      );
      CREATE INDEX IF NOT EXISTS idx_model_pricing_name ON model_pricing(model_name);
      CREATE INDEX IF NOT EXISTS idx_model_pricing_provider ON model_pricing(provider);
    `);

    // Create org_settings table
    await db.exec(`
      CREATE TABLE IF NOT EXISTS org_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        org_id TEXT UNIQUE NOT NULL,
        settings TEXT NOT NULL,
        last_updated TEXT NOT NULL,
        source TEXT DEFAULT 'supabase'
      );
      CREATE INDEX IF NOT EXISTS idx_org_settings_org_id ON org_settings(org_id);
    `);

    // Create attribution_rules table
    await db.exec(`
      CREATE TABLE IF NOT EXISTS attribution_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        org_id TEXT NOT NULL,
        rule_id TEXT UNIQUE NOT NULL,
        condition TEXT NOT NULL,
        attribution TEXT NOT NULL,
        priority INTEGER DEFAULT 100,
        last_updated TEXT NOT NULL,
        active BOOLEAN DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_attribution_rules_org_id ON attribution_rules(org_id);
      CREATE INDEX IF NOT EXISTS idx_attribution_rules_active ON attribution_rules(active);
    `);

    console.log('D1 cache tables initialized');
    return true;
  } catch (err) {
    console.error('Failed to initialize D1 cache:', err);
    return false;
  }
};

/**
 * Read model pricing from D1 (sub-ms edge read)
 */
const d1ReadModelPricing = async (env, model) => {
  if (!env.DB) {
    return null;
  }

  try {
    const startTime = Date.now();

    const result = await env.DB.prepare(`
      SELECT model_name, provider, input_cost_per_1k, output_cost_per_1k
      FROM model_pricing
      WHERE model_name = ?
      LIMIT 1
    `).bind(model).first();

    const latency = Date.now() - startTime;

    if (result) {
      console.log(`D1 model pricing read (${model}): ${latency}ms`);
      return {
        model: result.model_name,
        provider: result.provider,
        input_cost_per_1k_tokens: result.input_cost_per_1k,
        output_cost_per_1k_tokens: result.output_cost_per_1k,
        cached: true,
        latency_ms: latency
      };
    }

    return null;
  } catch (err) {
    console.error('D1 model pricing read failed:', err);
    return null;
  }
};

/**
 * Read org settings from D1 (org config at the edge)
 */
const d1ReadOrgSettings = async (env, orgId) => {
  if (!env.DB) {
    return null;
  }

  try {
    const startTime = Date.now();

    const result = await env.DB.prepare(`
      SELECT settings
      FROM org_settings
      WHERE org_id = ?
      LIMIT 1
    `).bind(orgId).first();

    const latency = Date.now() - startTime;

    if (result) {
      console.log(`D1 org settings read (${orgId}): ${latency}ms`);
      try {
        const settings = JSON.parse(result.settings);
        return {
          ...settings,
          cached: true,
          latency_ms: latency
        };
      } catch (e) {
        return null;
      }
    }

    return null;
  } catch (err) {
    console.error('D1 org settings read failed:', err);
    return null;
  }
};

/**
 * Read attribution rules from D1
 */
const d1ReadAttributionRules = async (env, orgId) => {
  if (!env.DB) {
    return [];
  }

  try {
    const results = await env.DB.prepare(`
      SELECT rule_id, condition, attribution, priority
      FROM attribution_rules
      WHERE org_id = ? AND active = 1
      ORDER BY priority DESC
    `).bind(orgId).all();

    return results.results || [];
  } catch (err) {
    console.error('D1 attribution rules read failed:', err);
    return [];
  }
};

/**
 * Sync D1 from Supabase (source of truth)
 */
const d1SyncFromSupabase = async (env) => {
  if (!env.DB || !env.SUPABASE_URL || !env.SUPABASE_KEY) {
    console.warn('D1 sync skipped: incomplete configuration');
    return { synced: 0 };
  }

  const syncReport = {
    synced: 0,
    failed: 0,
    timestamp: new Date().toISOString()
  };

  try {
    // Sync model pricing
    const pricingResp = await fetch(`${env.SUPABASE_URL}/rest/v1/model_pricing`, {
      headers: {
        'apikey': env.SUPABASE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_KEY}`
      }
    });

    if (pricingResp.ok) {
      const pricingData = await pricingResp.json();

      for (const pricing of pricingData) {
        try {
          await env.DB.prepare(`
            INSERT OR REPLACE INTO model_pricing
            (model_name, provider, input_cost_per_1k, output_cost_per_1k, last_updated)
            VALUES (?, ?, ?, ?, ?)
          `).bind(
            pricing.model_name,
            pricing.provider,
            pricing.input_cost_per_1k,
            pricing.output_cost_per_1k,
            new Date().toISOString()
          ).run();

          syncReport.synced++;
        } catch (err) {
          console.error(`Failed to sync pricing for ${pricing.model_name}:`, err);
          syncReport.failed++;
        }
      }

      console.log(`Synced ${syncReport.synced} model pricing records`);
    }

    // Sync org settings
    const settingsResp = await fetch(`${env.SUPABASE_URL}/rest/v1/org_settings`, {
      headers: {
        'apikey': env.SUPABASE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_KEY}`
      }
    });

    if (settingsResp.ok) {
      const settingsData = await settingsResp.json();

      for (const settings of settingsData) {
        try {
          await env.DB.prepare(`
            INSERT OR REPLACE INTO org_settings
            (org_id, settings, last_updated)
            VALUES (?, ?, ?)
          `).bind(
            settings.org_id,
            JSON.stringify(settings.config),
            new Date().toISOString()
          ).run();

          syncReport.synced++;
        } catch (err) {
          console.error(`Failed to sync settings for ${settings.org_id}:`, err);
          syncReport.failed++;
        }
      }

      console.log(`Synced ${syncReport.synced} org settings records`);
    }

    return syncReport;
  } catch (err) {
    console.error('D1 sync from Supabase failed:', err);
    syncReport.failed++;
    return syncReport;
  }
};

/**
 * Handler: Get model pricing
 */
const handleGetModelPricing = async (request, env, ctx) => {
  try {
    const url = new URL(request.url);
    const model = url.searchParams.get('model');

    if (!model) {
      return errorResponse('Missing model parameter', 400);
    }

    // Try D1 cache first (edge)
    const cached = await d1ReadModelPricing(env, model);
    if (cached) {
      return jsonResponse({
        pricing: cached,
        source: 'edge_cache'
      });
    }

    // Fallback to Supabase if not in cache
    if (env.SUPABASE_URL && env.SUPABASE_KEY) {
      const resp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/model_pricing?model_name=eq.${model}`,
        {
          headers: {
            'apikey': env.SUPABASE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_KEY}`
          }
        }
      );

      if (resp.ok) {
        const data = await resp.json();
        if (data.length > 0) {
          const pricing = data[0];

          // Cache in D1 for future reads
          ctx.waitUntil(
            env.DB.prepare(`
              INSERT OR REPLACE INTO model_pricing
              (model_name, provider, input_cost_per_1k, output_cost_per_1k, last_updated)
              VALUES (?, ?, ?, ?, ?)
            `).bind(
              pricing.model_name,
              pricing.provider,
              pricing.input_cost_per_1k,
              pricing.output_cost_per_1k,
              new Date().toISOString()
            ).run()
          );

          return jsonResponse({
            pricing: {
              model: pricing.model_name,
              provider: pricing.provider,
              input_cost_per_1k_tokens: pricing.input_cost_per_1k,
              output_cost_per_1k_tokens: pricing.output_cost_per_1k,
              cached: false,
              source: 'supabase'
            }
          });
        }
      }
    }

    return errorResponse(`Model not found: ${model}`, 404);
  } catch (err) {
    console.error('Get model pricing failed:', err);
    return errorResponse('Internal server error', 500);
  }
};

/**
 * Handler: Get org settings
 */
const handleGetOrgSettings = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);

    // Try D1 cache first
    const cached = await d1ReadOrgSettings(env, orgId);
    if (cached) {
      return jsonResponse({
        settings: cached,
        source: 'edge_cache'
      });
    }

    // Fallback to Supabase
    if (env.SUPABASE_URL && env.SUPABASE_KEY) {
      const resp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/org_settings?org_id=eq.${orgId}`,
        {
          headers: {
            'apikey': env.SUPABASE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_KEY}`
          }
        }
      );

      if (resp.ok) {
        const data = await resp.json();
        if (data.length > 0) {
          const settings = data[0];

          // Cache in D1
          ctx.waitUntil(
            env.DB.prepare(`
              INSERT OR REPLACE INTO org_settings
              (org_id, settings, last_updated)
              VALUES (?, ?, ?)
            `).bind(
              orgId,
              JSON.stringify(settings.config),
              new Date().toISOString()
            ).run()
          );

          return jsonResponse({
            settings: {
              ...settings.config,
              source: 'supabase'
            }
          });
        }
      }
    }

    // Return empty settings
    return jsonResponse({
      settings: {
        source: 'default'
      }
    });
  } catch (err) {
    console.error('Get org settings failed:', err);
    return errorResponse('Internal server error', 500);
  }
};

/**
 * Handler: Trigger D1 sync
 */
const handleD1Sync = async (request, env, ctx) => {
  try {
    // Trigger async sync
    ctx.waitUntil(d1SyncFromSupabase(env));

    return jsonResponse({
      message: 'D1 sync initiated',
      status: 'syncing'
    });
  } catch (err) {
    console.error('D1 sync handler failed:', err);
    return errorResponse('Sync failed', 500);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  initD1Cache,
  d1ReadModelPricing,
  d1ReadOrgSettings,
  d1ReadAttributionRules,
  d1SyncFromSupabase,
  handleGetModelPricing,
  handleGetOrgSettings,
  handleD1Sync
};

export default {
  initD1Cache,
  d1ReadModelPricing,
  d1ReadOrgSettings,
  d1ReadAttributionRules,
  d1SyncFromSupabase,
  handleGetModelPricing,
  handleGetOrgSettings,
  handleD1Sync
};
