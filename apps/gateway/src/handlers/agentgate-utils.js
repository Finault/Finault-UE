/**
 * AgentGate Shared Utilities
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Common helpers for AgentGate handlers:
 * - Supabase helpers
 * - SHA-256 hashing (Web Crypto API)
 * - Ed25519 keypair generation
 * - AIEI credential and receipt generation
 * - Trust score calculation
 * - API key authentication middleware
 * - KV cache helpers
 */

import { jsonResponse, errorResponse } from '../utils.js';

// ═══════════════════════════════════════════════════════════════════════════════
// SUPABASE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

export function supabaseHeaders(env) {
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY;
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
}

export async function supabaseQuery(env, table, queryParams = {}) {
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(queryParams)) {
    url.searchParams.set(k, v);
  }
  const resp = await fetch(url.toString(), { headers: supabaseHeaders(env) });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Supabase ${table} query failed (${resp.status}): ${text}`);
  }
  return resp.json();
}

export async function supabaseInsert(env, table, data) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: supabaseHeaders(env),
    body: JSON.stringify(data)
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Supabase ${table} insert failed (${resp.status}): ${text}`);
  }
  return resp.json();
}

export async function supabaseUpdate(env, table, matchParams, data) {
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(matchParams)) {
    url.searchParams.set(k, v);
  }
  const resp = await fetch(url.toString(), {
    method: 'PATCH',
    headers: supabaseHeaders(env),
    body: JSON.stringify(data)
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Supabase ${table} update failed (${resp.status}): ${text}`);
  }
  return resp.json();
}

// ═══════════════════════════════════════════════════════════════════════════════
// CRYPTOGRAPHIC HELPERS (Web Crypto API — native in Cloudflare Workers)
// ═══════════════════════════════════════════════════════════════════════════════

export async function sha256(data) {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function generateKeypair() {
  const keypair = await crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify']
  );
  const publicKey = await crypto.subtle.exportKey('raw', keypair.publicKey);
  const privateKey = await crypto.subtle.exportKey('pkcs8', keypair.privateKey);
  return {
    publicKey: btoa(String.fromCharCode(...new Uint8Array(publicKey))),
    privateKey: btoa(String.fromCharCode(...new Uint8Array(privateKey)))
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AIEI CREDENTIAL GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

export async function generateCredential(agent) {
  const credential = {
    aiei_version: '1.0',
    who: {
      agent_id: agent.id,
      owner_id: agent.owner_id,
      name: agent.name,
      framework: agent.framework,
      model: agent.model,
      registered_at: agent.created_at
    },
    rules: {
      spending_limit_per_tx: agent.spending_limit_per_tx,
      spending_limit_daily: agent.spending_limit_daily,
      spending_limit_monthly: agent.spending_limit_monthly,
      permitted_categories: agent.permitted_categories,
      permitted_domains: agent.permitted_domains,
      delegation_depth: agent.delegation_depth,
      geo_restrictions: agent.geo_restrictions
    },
    issued_by: 'finault.ai',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
  };

  const canonical = JSON.stringify(credential, Object.keys(credential).sort());
  const hash = await sha256(canonical);
  credential.credential_hash = `sha256:${hash}`;

  return credential;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RECEIPT CHAIN
// ═══════════════════════════════════════════════════════════════════════════════

export async function generateReceipt(transaction, previousHash) {
  const envelope = {
    who: transaction.aiei_who,
    what: transaction.aiei_what,
    worth: transaction.aiei_worth,
    rules: transaction.aiei_rules,
    previous_hash: previousHash || 'genesis',
    timestamp: new Date().toISOString()
  };

  const canonical = JSON.stringify(envelope, Object.keys(envelope).sort());
  const proof = await sha256(canonical);

  return {
    ...envelope,
    aiei_proof: `sha256:${proof}`
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRUST SCORE CALCULATION
// ═══════════════════════════════════════════════════════════════════════════════

export function calculateTrustScore(stats) {
  const txVolume = Math.min(100, Math.round(
    Math.log10(Math.max(1, stats.total_transactions)) * 25
  ));

  const completionRate = stats.total_transactions > 0
    ? Math.round((stats.successful_transactions / stats.total_transactions) * 100)
    : 100;

  const disputeRate = stats.total_transactions > 0
    ? Math.max(0, 100 - Math.round((stats.disputed_transactions / stats.total_transactions) * 100 * 10))
    : 100;

  const authCompliance = stats.total_transactions > 0
    ? Math.max(0, 100 - Math.round((stats.auth_violations / stats.total_transactions) * 100 * 5))
    : 100;

  const economicImpact = Math.min(100, Math.max(0,
    50 + Math.round((stats.net_margin_impact || 0) / 10000)
  ));

  return {
    tx_volume_score: txVolume,
    completion_rate_score: completionRate,
    dispute_rate_score: disputeRate,
    auth_compliance_score: authCompliance,
    economic_impact_score: economicImpact
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// API KEY GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

export function generateApiKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `fg_live_${hex}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENTGATE AUTH MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Authenticate an AgentGate API request via Bearer token.
 * Returns { owner_id, tier, api_key_id, agent_limit, monthly_verification_limit,
 *           monthly_verifications_used } or throws.
 */
export async function authenticateAgentGateRequest(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw { status: 401, code: 'MISSING_API_KEY', message: 'Authorization header with Bearer token required' };
  }

  const rawKey = authHeader.slice(7);
  if (!rawKey.startsWith('fg_live_')) {
    throw { status: 401, code: 'INVALID_API_KEY', message: 'API key must start with fg_live_' };
  }

  const keyHash = await sha256(rawKey);

  // Check KV cache first
  let keyRecord = null;
  if (env.AGENTGATE_CACHE) {
    const cached = await env.AGENTGATE_CACHE.get(`api_key:${keyHash}`, 'json');
    if (cached) keyRecord = cached;
  }

  if (!keyRecord) {
    const rows = await supabaseQuery(env, 'agentgate_api_keys', {
      'key_hash': `eq.${keyHash}`,
      'select': '*'
    });
    if (!rows || rows.length === 0) {
      throw { status: 401, code: 'INVALID_API_KEY', message: 'Invalid API key' };
    }
    keyRecord = rows[0];

    // Cache for 30s
    if (env.AGENTGATE_CACHE) {
      await env.AGENTGATE_CACHE.put(
        `api_key:${keyHash}`,
        JSON.stringify(keyRecord),
        { expirationTtl: 30 }
      );
    }
  }

  if (!keyRecord.active) {
    throw { status: 403, code: 'API_KEY_INACTIVE', message: 'API key is inactive' };
  }

  return {
    owner_id: keyRecord.owner_id,
    tier: keyRecord.tier,
    api_key_id: keyRecord.id,
    agent_limit: keyRecord.agent_limit,
    monthly_verification_limit: keyRecord.monthly_verification_limit,
    monthly_verifications_used: keyRecord.monthly_verifications_used
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// KV CACHE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

export async function cacheGet(env, key) {
  if (!env.AGENTGATE_CACHE) return null;
  return env.AGENTGATE_CACHE.get(key, 'json');
}

export async function cachePut(env, key, data, ttlSeconds = 60) {
  if (!env.AGENTGATE_CACHE) return;
  await env.AGENTGATE_CACHE.put(key, JSON.stringify(data), { expirationTtl: ttlSeconds });
}

export async function cacheDelete(env, key) {
  if (!env.AGENTGATE_CACHE) return;
  await env.AGENTGATE_CACHE.delete(key);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLUG GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTHORIZATION CHECK HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check a proposed action against an agent's rules.
 * Returns { authorized, reasons[] } where each reason has { rule, status, detail }.
 */
export function checkAuthorization(agent, { action, amount, merchant, category } = {}) {
  const reasons = [];
  let authorized = true;

  if (amount != null && agent.spending_limit_per_tx != null) {
    const ok = Number(amount) <= Number(agent.spending_limit_per_tx);
    reasons.push({
      rule: 'spending_limit_per_tx',
      status: ok ? 'ok' : 'denied',
      detail: ok ? null : `Amount ${amount} exceeds per-tx limit ${agent.spending_limit_per_tx}`
    });
    if (!ok) authorized = false;
  }

  if (category && agent.permitted_categories && agent.permitted_categories.length > 0) {
    const ok = agent.permitted_categories.includes(category);
    reasons.push({
      rule: 'permitted_categories',
      status: ok ? 'ok' : 'denied',
      detail: ok ? null : `${category} not in permitted list`
    });
    if (!ok) authorized = false;
  }

  if (merchant && agent.permitted_domains && agent.permitted_domains.length > 0) {
    const ok = agent.permitted_domains.includes(merchant);
    reasons.push({
      rule: 'permitted_domains',
      status: ok ? 'ok' : 'denied',
      detail: ok ? null : `${merchant} not in permitted list`
    });
    if (!ok) authorized = false;
  }

  return { authorized, reasons };
}
