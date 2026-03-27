/**
 * LLM Proxy Handlers — The Magic Moment
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This is the core of Finault's value proposition:
 * 1. Developer changes base_url to gateway.finault.ai
 * 2. Gateway proxies to the real provider (OpenAI, Anthropic, etc.)
 * 3. Gateway calculates cost from token usage
 * 4. Gateway writes a usage row to Supabase
 * 5. Gateway returns the provider response WITH cost headers attached
 *
 * The developer sees X-Finault-Cost on every response. The dashboard lights up.
 * That's the magic moment.
 */

import { jsonResponse, errorResponse, calculateCost } from '../utils.js';
import { getOrgIdFromAuth } from '../auth.js';
import { proxyOpenAI, proxyAnthropic, proxyGoogle, proxyAzure, intelligentRoute } from '../proxy.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TOKEN EXTRACTION — normalize across providers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract token counts from provider response
 * Each provider formats usage differently — this normalizes them.
 */
const extractTokenUsage = (provider, responseBody) => {
  let inputTokens = 0;
  let outputTokens = 0;
  let model = 'unknown';

  if (provider === 'openai' || provider === 'azure') {
    // OpenAI format: { usage: { prompt_tokens, completion_tokens, total_tokens } }
    inputTokens = responseBody?.usage?.prompt_tokens || 0;
    outputTokens = responseBody?.usage?.completion_tokens || 0;
    model = responseBody?.model || 'unknown';
  } else if (provider === 'anthropic') {
    // Anthropic format: { usage: { input_tokens, output_tokens } }
    inputTokens = responseBody?.usage?.input_tokens || 0;
    outputTokens = responseBody?.usage?.output_tokens || 0;
    model = responseBody?.model || 'unknown';
  } else if (provider === 'google') {
    // Google format: { usageMetadata: { promptTokenCount, candidatesTokenCount } }
    inputTokens = responseBody?.usageMetadata?.promptTokenCount || 0;
    outputTokens = responseBody?.usageMetadata?.candidatesTokenCount || 0;
    model = responseBody?.modelVersion || 'unknown';
  }

  return { inputTokens, outputTokens, model };
};

// ═══════════════════════════════════════════════════════════════════════════════
// REQUEST ID GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

const generateRequestId = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = 'req_';
  for (let i = 0; i < 12; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
};

// ═══════════════════════════════════════════════════════════════════════════════
// SUPABASE USAGE WRITE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Write a usage row to Supabase. Fire-and-forget via ctx.waitUntil
 * so it doesn't block the response to the developer.
 */
const writeUsageToSupabase = async (env, usageRecord) => {
  const url = `${env.SUPABASE_URL}/rest/v1/usage`;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(usageRecord)
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error(`[LLM] Supabase usage write failed (${resp.status}): ${text}`);
    } else {
      console.log(`[LLM] Usage recorded: ${usageRecord.provider}/${usageRecord.model} $${(usageRecord.cost_cents / 100).toFixed(4)}`);
    }
  } catch (err) {
    console.error(`[LLM] Supabase usage write error: ${err.message}`);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// CORE PROXY HANDLER — used by chat, completions, and embeddings
// ═══════════════════════════════════════════════════════════════════════════════

const handleLLMProxy = async (request, env, ctx) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  // 1. Parse the request body
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return errorResponse('INVALID_REQUEST', 'Invalid JSON request body');
  }

  // 2. Get org context from JWT
  let orgId;
  try {
    orgId = getOrgIdFromAuth(request);
  } catch (e) {
    return errorResponse('AUTH_INVALID', e.message);
  }

  // 3. Determine provider from model name
  let provider;
  try {
    provider = intelligentRoute(payload, env);
  } catch (e) {
    return errorResponse('INVALID_REQUEST', e.message);
  }

  // 4. Extract optional cost_center and project from headers or payload
  const costCenter = request.headers.get('X-Finault-Cost-Center') || payload.cost_center || 'default';
  const project = request.headers.get('X-Finault-Project') || payload.project || null;
  const userId = request.headers.get('X-Finault-User-Id') || payload.user || null;

  // 5. Proxy to provider
  let responseBody;
  try {
    switch (provider) {
      case 'openai':
        responseBody = await proxyOpenAI(payload, env.OPENAI_API_KEY);
        break;
      case 'anthropic':
        responseBody = await proxyAnthropic(payload, env.ANTHROPIC_API_KEY);
        break;
      case 'google':
        responseBody = await proxyGoogle(payload, env.GOOGLE_API_KEY);
        break;
      case 'azure':
        responseBody = await proxyAzure(payload, env.AZURE_OPENAI_KEY, env.AZURE_OPENAI_ENDPOINT);
        break;
      default:
        return errorResponse('VALIDATION_ERROR', `Unsupported provider: ${provider}`);
    }
  } catch (e) {
    console.error(`[LLM] Proxy error (${provider}): ${e.message}`);
    return errorResponse('PROVIDER_ERROR', `Provider error: ${e.message}`);
  }

  const latencyMs = Date.now() - startTime;

  // 6. Extract token usage from provider response
  const { inputTokens, outputTokens, model } = extractTokenUsage(provider, responseBody);

  // 7. Calculate cost
  const costUsd = calculateCost(provider, model, inputTokens, outputTokens);
  const costCents = Math.round(costUsd * 10000) / 100; // cents with 2 decimal precision

  // 8. Write usage to Supabase (fire-and-forget, doesn't block response)
  const usageRecord = {
    organization_id: orgId,
    request_id: requestId,
    provider: provider,
    model: model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_cents: costCents,
    cost_center: costCenter,
    project: project,
    user_id: userId,
    latency_ms: latencyMs,
    status: 'success',
    environment: request.headers.get('X-Finault-Environment') || 'production',
    metadata: JSON.stringify({
      has_streaming: false,
      endpoint: new URL(request.url).pathname
    })
  };

  // Use ctx.waitUntil so the write happens after the response is sent
  if (ctx && ctx.waitUntil) {
    ctx.waitUntil(writeUsageToSupabase(env, usageRecord));
  } else {
    // Fallback: fire and forget
    writeUsageToSupabase(env, usageRecord).catch(() => {});
  }

  // 9. Return provider response with Finault cost headers
  const costHeaders = {
    'X-Finault-Cost': costUsd.toFixed(6),
    'X-Finault-Cost-Currency': 'USD',
    'X-Finault-Cost-Cents': costCents.toFixed(2),
    'X-Finault-Model': model,
    'X-Finault-Provider': provider,
    'X-Finault-Tokens-In': String(inputTokens),
    'X-Finault-Tokens-Out': String(outputTokens),
    'X-Finault-Latency-Ms': String(latencyMs),
    'X-Finault-Request-Id': requestId
  };

  return jsonResponse(responseBody, 200, costHeaders);
};

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /v1/llm/chat — Chat completions (OpenAI-compatible)
 */
const handleLLMChat = async (request, env, ctx) => {
  return handleLLMProxy(request, env, ctx);
};

/**
 * POST /v1/llm/completions — Text completions
 */
const handleLLMCompletions = async (request, env, ctx) => {
  return handleLLMProxy(request, env, ctx);
};

/**
 * POST /v1/llm/embeddings — Embedding generation
 */
const handleLLMEmbeddings = async (request, env, ctx) => {
  return handleLLMProxy(request, env, ctx);
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  handleLLMChat,
  handleLLMCompletions,
  handleLLMEmbeddings,
  handleLLMProxy,
  extractTokenUsage,
  writeUsageToSupabase
};
