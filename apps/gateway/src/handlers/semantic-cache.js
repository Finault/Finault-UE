/**
 * Semantic Caching Handler
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Semantic caching for LLM responses:
 * - Hash prompts consistently (SHA-256)
 * - Store/retrieve cached responses with TTL
 * - Track cache hits, savings, metrics
 * - Configurable per organization
 */

import crypto from 'crypto';
import { jsonResponse, errorResponse } from '../utils.js';
import { getOrgIdFromAuth } from '../auth.js';

/**
 * Hash prompt + model into cache key
 * SHA-256 hash ensures consistent hashing across requests
 */
const hashPrompt = (model, messages) => {
  const promptString = JSON.stringify({
    model,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content
    }))
  });

  return crypto
    .createHash('sha256')
    .update(promptString)
    .digest('hex');
};

/**
 * Check if response is cached
 */
const checkCache = async (env, hash) => {
  if (!env.DB) {
    return null;
  }

  try {
    const result = await env.DB.prepare(`
      SELECT response, ttl_expires_at, cost_usd, tokens_out
      FROM semantic_cache
      WHERE cache_key = ?
      LIMIT 1
    `).bind(hash).first();

    if (!result) {
      return null;
    }

    // Check if expired
    const expiresAt = new Date(result.ttl_expires_at);
    if (expiresAt < new Date()) {
      // Cache expired, clean up
      env.DB.prepare(`DELETE FROM semantic_cache WHERE cache_key = ?`)
        .bind(hash)
        .run()
        .catch(err => console.error('Cache cleanup failed:', err));
      return null;
    }

    // Cache hit
    try {
      return {
        response: JSON.parse(result.response),
        cost_usd: result.cost_usd,
        tokens_out: result.tokens_out,
        cached: true
      };
    } catch (e) {
      return null;
    }
  } catch (err) {
    console.error('Cache check failed:', err);
    return null;
  }
};

/**
 * Store response in cache
 */
const storeCache = async (env, hash, orgId, response, ttlMinutes = 60) => {
  if (!env.DB) {
    return false;
  }

  try {
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

    await env.DB.prepare(`
      INSERT INTO semantic_cache
      (cache_key, org_id, response, cost_usd, tokens_out, ttl_expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      hash,
      orgId,
      JSON.stringify(response),
      response.cost_usd || 0,
      response.tokens_out || 0,
      expiresAt,
      new Date().toISOString()
    ).run();

    return true;
  } catch (err) {
    console.error('Cache storage failed:', err);
    return false;
  }
};

/**
 * Handle cache hit response
 */
const handleCacheHit = async (env, ctx, request, cachedResponse, orgId) => {
  try {
    // Record cache hit metrics
    ctx.waitUntil(
      env.DB.prepare(`
        INSERT INTO cache_metrics (org_id, hit, cost_saved_usd, created_at)
        VALUES (?, 1, ?, ?)
      `).bind(
        orgId,
        cachedResponse.cost_usd || 0,
        new Date().toISOString()
      ).run().catch(err => console.error('Metrics recording failed:', err))
    );

    // Return cached response with seal
    return jsonResponse({
      ...cachedResponse.response,
      cost_method: 'cached',
      cache_hit: true,
      cost_saved_usd: cachedResponse.cost_usd,
      original_cost_usd: cachedResponse.cost_usd,
      margin_applied: false,
      seal_timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Cache hit handler failed:', err);
    return null;
  }
};

/**
 * Get cache statistics for organization
 */
const handleCacheStats = async (request, env) => {
  try {
    const orgId = getOrgIdFromAuth(request);

    if (!env.DB) {
      return jsonResponse({
        org_id: orgId,
        total_cached_calls: 0,
        total_savings_usd: 0,
        hit_rate_percent: 0,
        message: 'Cache not configured'
      });
    }

    // Get cache hits
    const hits = await env.DB.prepare(`
      SELECT COUNT(*) as count, SUM(cost_saved_usd) as total_saved
      FROM cache_metrics
      WHERE org_id = ? AND hit = 1
    `).bind(orgId).first();

    // Get total calls (hits + misses)
    const total = await env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM cache_metrics
      WHERE org_id = ?
    `).bind(orgId).first();

    const hitCount = hits?.count || 0;
    const savedUsd = hits?.total_saved || 0;
    const totalCalls = total?.count || 0;
    const hitRate = totalCalls > 0 ? ((hitCount / totalCalls) * 100).toFixed(2) : 0;

    return jsonResponse({
      org_id: orgId,
      total_cached_calls: hitCount,
      total_savings_usd: parseFloat(savedUsd).toFixed(2),
      hit_rate_percent: parseFloat(hitRate),
      total_calls: totalCalls,
      potential_additional_savings_usd: (parseFloat(savedUsd) * 2).toFixed(2)
    });
  } catch (err) {
    console.error('Cache stats handler failed:', err);
    return errorResponse('Failed to retrieve cache stats', 500);
  }
};

/**
 * Configure cache settings per organization
 */
const handleCacheConfig = async (request, env) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const body = await request.json();

    const {
      enabled = true,
      ttl_minutes = 60,
      exclude_patterns = [],
      max_cache_size_mb = 100
    } = body;

    if (!env.DB) {
      return errorResponse('Database not configured', 500);
    }

    // Update or insert cache config
    await env.DB.prepare(`
      INSERT INTO cache_config
      (org_id, enabled, ttl_minutes, exclude_patterns, max_cache_size_mb, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(org_id) DO UPDATE SET
        enabled = excluded.enabled,
        ttl_minutes = excluded.ttl_minutes,
        exclude_patterns = excluded.exclude_patterns,
        max_cache_size_mb = excluded.max_cache_size_mb,
        updated_at = excluded.updated_at
    `).bind(
      orgId,
      enabled ? 1 : 0,
      ttl_minutes,
      JSON.stringify(exclude_patterns),
      max_cache_size_mb,
      new Date().toISOString()
    ).run();

    return jsonResponse({
      org_id: orgId,
      config: {
        enabled,
        ttl_minutes,
        exclude_patterns,
        max_cache_size_mb
      },
      message: 'Cache configuration updated'
    });
  } catch (err) {
    console.error('Cache config handler failed:', err);
    return errorResponse('Failed to update cache config', 500);
  }
};

/**
 * Get cache configuration
 */
const handleGetCacheConfig = async (request, env) => {
  try {
    const orgId = getOrgIdFromAuth(request);

    if (!env.DB) {
      return jsonResponse({
        org_id: orgId,
        config: {
          enabled: false,
          message: 'Cache not configured'
        }
      });
    }

    const result = await env.DB.prepare(`
      SELECT enabled, ttl_minutes, exclude_patterns, max_cache_size_mb
      FROM cache_config
      WHERE org_id = ?
      LIMIT 1
    `).bind(orgId).first();

    if (!result) {
      // Return default config
      return jsonResponse({
        org_id: orgId,
        config: {
          enabled: true,
          ttl_minutes: 60,
          exclude_patterns: [],
          max_cache_size_mb: 100
        },
        is_default: true
      });
    }

    return jsonResponse({
      org_id: orgId,
      config: {
        enabled: result.enabled === 1,
        ttl_minutes: result.ttl_minutes,
        exclude_patterns: JSON.parse(result.exclude_patterns || '[]'),
        max_cache_size_mb: result.max_cache_size_mb
      }
    });
  } catch (err) {
    console.error('Get cache config failed:', err);
    return errorResponse('Failed to retrieve cache config', 500);
  }
};

/**
 * Check if request should be cached (based on patterns)
 */
const shouldCache = (config, model, messages) => {
  if (!config?.enabled) {
    return false;
  }

  const excludePatterns = config.exclude_patterns || [];

  // Check model against exclude patterns
  for (const pattern of excludePatterns) {
    if (new RegExp(pattern).test(model)) {
      return false;
    }
  }

  // Check message content for exclusion keywords
  const messageContent = JSON.stringify(messages).toLowerCase();
  const excludeKeywords = ['no-cache', 'nocache', 'do-not-cache'];

  for (const keyword of excludeKeywords) {
    if (messageContent.includes(keyword)) {
      return false;
    }
  }

  return true;
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  hashPrompt,
  checkCache,
  storeCache,
  handleCacheHit,
  handleCacheStats,
  handleCacheConfig,
  handleGetCacheConfig,
  shouldCache
};

export default {
  hashPrompt,
  checkCache,
  storeCache,
  handleCacheHit,
  handleCacheStats,
  handleCacheConfig,
  handleGetCacheConfig,
  shouldCache
};
