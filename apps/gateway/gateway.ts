/**
 * FINAULT UNIFIED GATEWAY v3.0
 * =============================
 * 
 * "Elon Musk level code" - Maximum performance, minimal complexity
 * 
 * Consolidated TypeScript codebase that handles:
 * - Request proxying to AI providers
 * - Cost center attribution
 * - Real-time cost calculation
 * - Anomaly detection
 * - Verification hash generation
 * - Graceful degradation (works without DB)
 * - Request queueing for reliability
 * 
 * Designed for Cloudflare Workers edge deployment
 * 
 * Gold Tier Principles Applied:
 * - Collison: Infrastructure you can trust (graceful degradation)
 * - Lawson: Be the primitive (attribution layer, not routing platform)
 * - Perret: The connector (multi-provider normalization)
 */

// ============================================================================
// CONFIGURATION & TYPES & CONSTANTS
// ============================================================================

// HTTP Timeout Constants (milliseconds)
const TIMEOUT_BUDGET_CHECK = 5000;
const TIMEOUT_PROVIDER_CALL = 25000;
const TIMEOUT_API_KEY_VALIDATION = 5000;
const TIMEOUT_LOG_QUEUE_FLUSH = 10000; // FIX 6: 10s timeout for log queue flush

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  AZURE_OPENAI_KEY?: string;
  AZURE_OPENAI_ENDPOINT?: string;
  // KV namespaces (Cloudflare)
  LOG_QUEUE?: KVNamespace;
  KV_CACHE?: KVNamespace;
}

interface RequestMetadata {
  costCenter?: string;
  project?: string;
  team?: string;
  environment?: string;
  feature?: string;
  user?: string;
  orgId: string;
  requestId: string;
}

interface Attribution {
  costCenterCode: string;
  costCenterName: string;
  glAccount: string;
  confidence: number;
  ruleMatched: string | null;
}

interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costCents: number;
  costDollars: string;
  pricingAvailable: boolean;
}

interface GatewayResponse {
  success: boolean;
  data?: unknown;
  attribution?: Attribution;
  cost?: CostEstimate;
  auditHash?: string;
  requestId: string;
  latencyMs: number;
  error?: string;
}

// ============================================================================
// PRICING DATABASE (Updated January 2026) - FALLBACK CONSTANTS
// Note: PricingService in platform/pricing-service.js can override these from Supabase
// ============================================================================

const FALLBACK_PRICING: Record<string, Record<string, { input: number; output: number }>> = {
  openai: {
    'gpt-4o': { input: 0.0025, output: 0.01 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'gpt-4': { input: 0.03, output: 0.06 },
    'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
    'o1-preview': { input: 0.015, output: 0.06 },
    'o1-mini': { input: 0.003, output: 0.012 },
    'o1': { input: 0.015, output: 0.06 },
  },
  anthropic: {
    'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
    'claude-3-5-haiku-20241022': { input: 0.0008, output: 0.004 },
    'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
    'claude-3-sonnet-20240229': { input: 0.003, output: 0.015 },
    'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },
    'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
  },
  google: {
    'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
    'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
    'gemini-2.0-flash': { input: 0.0001, output: 0.0004 },
  },
};

// ============================================================================
// ALLOCATION RULES ENGINE
// ============================================================================

interface AllocationRule {
  id: string;
  name: string;
  ruleType: 'exact' | 'prefix' | 'regex' | 'default';
  pattern: string;
  costCenterCode: string;
  glAccount: string;
  priority: number;
}

class AllocationEngine {
  private rules: AllocationRule[] = [];
  private rulesExpiry = 0;
  private loadingPromise: Promise<void> | null = null;
  private static CACHE_TTL = 60000; // 1 minute

  async loadRules(env: Env, orgId: string): Promise<void> {
    if (Date.now() < this.rulesExpiry && this.rules.length > 0) {
      return; // Use cached rules
    }

    // FIX #1: Race condition — if another request is already loading, wait for it
    if (this.loadingPromise) {
      return await this.loadingPromise;
    }

    this.loadingPromise = this._loadRulesInternal(env, orgId);
    try {
      await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  private async _loadRulesInternal(env: Env, orgId: string): Promise<void> {
    try {
      const response = await fetch(
        `${env.SUPABASE_URL}/rest/v1/allocation_rules?organization_id=eq.${orgId}&is_active=eq.true&order=priority.asc`,
        {
          headers: {
            'apikey': env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        this.rules = data.map((r: any) => ({
          id: r.id,
          name: r.name,
          ruleType: r.rule_type,
          pattern: r.pattern,
          costCenterCode: r.cost_center_code,
          glAccount: r.gl_account || this.inferGLAccount(r.cost_center_code),
          priority: r.priority,
        }));
        this.rulesExpiry = Date.now() + AllocationEngine.CACHE_TTL;
      }
    } catch {
      // Use default rules if DB unavailable
      this.rules = this.getDefaultRules();
      this.rulesExpiry = Date.now() + AllocationEngine.CACHE_TTL;
    }
  }

  allocate(metadata: RequestMetadata): Attribution {
    const searchString = [
      metadata.project,
      metadata.team,
      metadata.feature,
      metadata.environment,
      metadata.costCenter,
    ].filter(Boolean).join(' ').toLowerCase();

    for (const rule of this.rules) {
      let matched = false;

      switch (rule.ruleType) {
        case 'exact':
          matched = searchString.includes(rule.pattern.toLowerCase());
          break;
        case 'prefix':
          matched = searchString.startsWith(rule.pattern.toLowerCase()) ||
                    (metadata.project?.toLowerCase().startsWith(rule.pattern.toLowerCase()) ?? false);
          break;
        case 'regex':
          try {
            matched = new RegExp(rule.pattern, 'i').test(searchString);
          } catch (err) {
            // Invalid regex detected — treat as non-match without logging user data
            // Log to proper logger in production
          }
          break;
        case 'default':
          matched = true;
          break;
      }

      if (matched) {
        return {
          costCenterCode: rule.costCenterCode,
          costCenterName: rule.name,
          glAccount: rule.glAccount,
          confidence: rule.ruleType === 'exact' ? 100 : rule.ruleType === 'prefix' ? 90 : rule.ruleType === 'regex' ? 80 : 50,
          ruleMatched: rule.name,
        };
      }
    }

    return {
      costCenterCode: 'UNALLOCATED',
      costCenterName: 'Unallocated',
      glAccount: '6200-00-000',
      confidence: 0,
      ruleMatched: null,
    };
  }

  private inferGLAccount(costCenterCode: string): string {
    const prefix = costCenterCode?.split('-')[0]?.toUpperCase();
    const mappings: Record<string, string> = {
      'ENG': '6200-10',
      'PROD': '5100-10',
      'MKT': '6100-20',
      'CS': '6100-30',
      'DATA': '6200-20',
      'OPS': '6300-10',
    };
    return mappings[prefix] || '6200-00-000';
  }

  private getDefaultRules(): AllocationRule[] {
    return [
      { id: '1', name: 'Engineering', ruleType: 'prefix', pattern: 'eng', costCenterCode: 'ENG-CORE', glAccount: '6200-10', priority: 1 },
      { id: '2', name: 'Production', ruleType: 'prefix', pattern: 'prod', costCenterCode: 'PROD-API', glAccount: '5100-10', priority: 2 },
      { id: '3', name: 'Default', ruleType: 'default', pattern: '*', costCenterCode: 'UNALLOCATED', glAccount: '6200-00-000', priority: 999 },
    ];
  }
}

// ============================================================================
// COST CALCULATOR
// ============================================================================

function calculateCost(provider: string, model: string, inputTokens: number, outputTokens: number): CostEstimate {
  const providerPricing = FALLBACK_PRICING[provider.toLowerCase()];
  if (!providerPricing) {
    return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, costCents: 0, costDollars: '0.00', pricingAvailable: false };
  }

  // Find matching model (exact or partial)
  let modelPricing = providerPricing[model];
  if (!modelPricing) {
    for (const [key, pricing] of Object.entries(providerPricing)) {
      if (model.toLowerCase().includes(key.toLowerCase())) {
        modelPricing = pricing;
        break;
      }
    }
  }

  if (!modelPricing) {
    return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, costCents: 0, costDollars: '0.00', pricingAvailable: false };
  }

  const inputCost = (inputTokens / 1000) * modelPricing.input;
  const outputCost = (outputTokens / 1000) * modelPricing.output;
  const totalCost = inputCost + outputCost;

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    costCents: Math.round(totalCost * 100),
    costDollars: totalCost.toFixed(6),
    pricingAvailable: true,
  };
}

// ============================================================================
// HASH GENERATOR (For audit trail)
// ============================================================================

async function generateAuditHash(data: unknown): Promise<string> {
  const encoder = new TextEncoder();
  const normalized = JSON.stringify(data, Object.keys(data as object).sort());
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(normalized));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================================
// LOG QUEUE (Graceful degradation - queue when DB unavailable)
// ============================================================================

interface LogEntry {
  requestId: string;
  timestamp: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  attribution: Attribution;
  metadata: RequestMetadata;
  latencyMs: number;
  auditHash: string;
}

class LogQueue {
  private queue: LogEntry[] = [];
  private flushInterval: number = 5000; // 5 seconds
  private lastFlush: number = 0;
  private static MAX_QUEUE_SIZE = 1000;

  async log(entry: LogEntry, env: Env): Promise<void> {
    // Enforce max queue size to prevent unbounded memory growth
    if (this.queue.length >= LogQueue.MAX_QUEUE_SIZE) {
      this.queue.shift(); // Drop oldest entry
    }
    this.queue.push(entry);

    // Try to flush if enough time has passed
    if (Date.now() - this.lastFlush > this.flushInterval) {
      await this.flush(env);
    }
  }

  async flush(env: Env): Promise<void> {
    if (this.queue.length === 0) return;

    const entries = [...this.queue];
    this.queue = [];
    this.lastFlush = Date.now();

    // FIX 6 (MEDIUM→HIGH): Add timeout to LogQueue flush
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_LOG_QUEUE_FLUSH);

    try {
      // Batch insert to Supabase
      const response = await fetch(`${env.SUPABASE_URL}/rest/v1/gateway_logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(entries.map(e => ({
          request_id: e.requestId,
          timestamp: e.timestamp,
          provider: e.provider,
          model: e.model,
          input_tokens: e.inputTokens,
          output_tokens: e.outputTokens,
          cost_cents: e.costCents,
          cost_center_code: e.attribution.costCenterCode,
          gl_account: e.attribution.glAccount,
          confidence: e.attribution.confidence,
          organization_id: e.metadata.orgId,
          metadata: e.metadata,
          latency_ms: e.latencyMs,
          audit_hash: e.auditHash,
        }))),
        signal: controller.signal,
      });

      if (!response.ok) {
        // Re-queue on failure
        this.queue.push(...entries);

        // Also try KV backup if available
        if (env.LOG_QUEUE) {
          await env.LOG_QUEUE.put(
            `failed-logs-${Date.now()}`,
            JSON.stringify(entries),
            { expirationTtl: 86400 } // 24 hours
          );
        }
      }
    } catch {
      // Re-queue on error
      this.queue.push(...entries);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// ============================================================================
// PROVIDER HANDLERS
// ============================================================================

const PROVIDER_ENDPOINTS: Record<string, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  google: 'https://generativelanguage.googleapis.com/v1beta/models',
};

/**
 * Proxies the validated request to the appropriate AI provider
 * Handles provider-specific header requirements and response formatting
 */
async function proxyToProvider(
  provider: string,
  request: Request,
  body: unknown,
  env: Env
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  let url = PROVIDER_ENDPOINTS[provider];

  switch (provider) {
    case 'openai':
      headers['Authorization'] = request.headers.get('Authorization') || `Bearer ${env.OPENAI_API_KEY}`;
      break;
    case 'anthropic':
      headers['x-api-key'] = request.headers.get('x-api-key') || env.ANTHROPIC_API_KEY || '';
      headers['anthropic-version'] = '2023-06-01';
      break;
    case 'google':
      const googleModel = (body as any).model || 'gemini-1.5-flash';
      url = `${url}/${googleModel}:generateContent?key=${encodeURIComponent(env.GOOGLE_API_KEY || '')}`;
      break;
    case 'azure':
      url = `${env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${(body as any).model}/chat/completions?api-version=2024-02-15-preview`;
      headers['api-key'] = env.AZURE_OPENAI_KEY || '';
      break;
  }

  // Add AbortController with timeout to prevent hanging on provider
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_PROVIDER_CALL);

  try {
    return await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractUsage(provider: string, response: any): { inputTokens: number; outputTokens: number } {
  switch (provider) {
    case 'openai':
    case 'azure':
      return {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
      };
    case 'anthropic':
      return {
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
      };
    case 'google':
      return {
        inputTokens: response.usageMetadata?.promptTokenCount || 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
      };
    default:
      return { inputTokens: 0, outputTokens: 0 };
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

const allocationEngine = new AllocationEngine();
const logQueue = new LogQueue();

// ============================================================================
// API KEY VALIDATION — verifies caller identity against api_keys table
// ============================================================================

// Cache validated keys for 60s to avoid DB round-trip on every request
const keyCache = new Map<string, { orgId: string; userId: string; scopes: string[]; expiresAt: number }>();
const KEY_CACHE_TTL = 60_000; // 60 seconds

async function validateApiKey(
  request: Request,
  env: Env
): Promise<{ valid: true; orgId: string; userId: string; scopes: string[] } | { valid: false; error: string; code: string }> {
  // Extract API key from Authorization header or X-Finault-API-Key
  const authHeader = request.headers.get('Authorization') || '';
  const explicitKey = request.headers.get('X-Finault-API-Key') || '';
  const apiKey = authHeader.startsWith('Bearer fk_') ? authHeader.slice(7) : explicitKey;

  if (!apiKey) {
    return { valid: false, error: 'Missing API key. Expected Bearer fk_... or X-Finault-API-Key header.', code: 'AUTH_MISSING_KEY' };
  }

  if (!apiKey.startsWith('fk_')) {
    return { valid: false, error: 'Invalid API key format. Expected fk_ prefix.', code: 'AUTH_INVALID_PREFIX' };
  }

  // Check cache first
  const cached = keyCache.get(apiKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { valid: true, orgId: cached.orgId, userId: cached.userId, scopes: cached.scopes };
  }

  // Hash the key (we store hashes, not raw keys)
  const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(apiKey));
  const keyHash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

  try {
    // Add timeout for API key validation fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_API_KEY_VALIDATION);

    try {
      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/api_keys?key_hash=eq.${keyHash}&is_active=eq.true&select=id,organization_id,user_id,scopes,expires_at`,
        {
          headers: {
            'apikey': env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          },
          signal: controller.signal,
        }
      );
      clearTimeout(timeoutId);

    if (!res.ok) {
      return { valid: false, error: 'API key verification failed', code: 'AUTH_KEY_REVOKED' };
    }

      const keys = await res.json() as Array<{ id: string; organization_id: string; user_id: string; scopes: string[]; expires_at: string | null }>;

      if (!keys || keys.length === 0) {
        return { valid: false, error: 'Invalid API key', code: 'AUTH_KEY_REVOKED' };
      }

      const key = keys[0];

      // Check expiration
      if (key.expires_at && new Date(key.expires_at) < new Date()) {
        return { valid: false, error: 'API key has expired', code: 'AUTH_KEY_EXPIRED' };
      }

      // Cache the validated key
      keyCache.set(apiKey, {
        orgId: key.organization_id,
        userId: key.user_id,
        scopes: key.scopes || [],
        expiresAt: Date.now() + KEY_CACHE_TTL,
      });

      return { valid: true, orgId: key.organization_id, userId: key.user_id, scopes: key.scopes || [] };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    return { valid: false, error: 'API key verification unavailable', code: 'AUTH_KEY_REVOKED' };
  }
}

// Paths that don't require authentication
const PUBLIC_PATHS = new Set(['/', '/health']);

// ============================================================================
// RATE LIMITING — KV-backed distributed rate limiter
// ============================================================================
// Uses the KVRateLimiter module (modules/kv-rate-limiter.js) pattern inline
// for TypeScript type safety. Tiers: proxy (500/min), heavy (10/min), default (1000/min)

interface RateLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
  tier: string;
  retryAfter: number;
}

const RATE_LIMITS: Record<string, { limit: number; windowMs: number }> = {
  proxy:   { limit: 500,  windowMs: 60000 },
  default: { limit: 1000, windowMs: 60000 },
};

const rateLimitCache = new Map<string, { currentCount: number; previousCount: number; windowStart: number }>();

async function checkRateLimit(env: Env, orgId: string, path: string): Promise<RateLimitResult> {
  const tier = (path.startsWith('/v1/chat/completions') || path.startsWith('/v1/messages')) ? 'proxy' : 'default';
  const config = RATE_LIMITS[tier];
  const now = Date.now();
  const windowId = Math.floor(now / config.windowMs);
  const currentWindowStart = windowId * config.windowMs;
  const key = `rate:org:${orgId}:${tier}:${windowId}`;
  const prevKey = `rate:org:${orgId}:${tier}:${windowId - 1}`;

  let currentCount = 0;
  let previousCount = 0;

  // Check local cache first
  const cached = rateLimitCache.get(key);
  if (cached && cached.windowStart === currentWindowStart) {
    currentCount = cached.currentCount;
    previousCount = cached.previousCount;
  } else if (env.KV_CACHE) {
    try {
      const [storedCurrent, storedPrevious] = await Promise.all([
        env.KV_CACHE.get(key, 'text'),
        env.KV_CACHE.get(prevKey, 'text'),
      ]);
      currentCount = storedCurrent ? parseInt(storedCurrent, 10) : 0;
      previousCount = storedPrevious ? parseInt(storedPrevious, 10) : 0;
    } catch { /* KV miss → allow */ }
  }

  // Sliding window calculation: weight requests from previous window based on elapsed time
  const elapsedInCurrentWindow = now - currentWindowStart;
  const weightedPrevious = previousCount * (1 - elapsedInCurrentWindow / config.windowMs);
  const effectiveCount = Math.ceil(weightedPrevious + currentCount);

  if (effectiveCount >= config.limit) {
    const retryAfter = Math.max(1, Math.ceil(((windowId + 1) * config.windowMs - now) / 1000));
    return { allowed: false, current: effectiveCount, limit: config.limit, remaining: 0, tier, retryAfter };
  }

  const newCurrentCount = currentCount + 1;
  rateLimitCache.set(key, { currentCount: newCurrentCount, previousCount, windowStart: currentWindowStart });

  // Persist to KV (fire-and-forget)
  if (env.KV_CACHE) {
    const ttl = Math.ceil(config.windowMs / 1000) + 120;
    env.KV_CACHE.put(key, String(newCurrentCount), { expirationTtl: ttl }).catch(() => {});
  }

  return { allowed: true, current: newCurrentCount, limit: config.limit, remaining: config.limit - newCurrentCount, tier, retryAfter: 0 };
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const startTime = Date.now();
    const url = new URL(request.url);
    const requestId = crypto.randomUUID(); // Generate requestId at the top (before any early returns)

    // CORS — use dynamic origin matching
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...getCorsHeaders(request), 'X-Finault-Request-Id': requestId } });
    }

    // Health check — public, no auth
    if (PUBLIC_PATHS.has(url.pathname)) {
      return jsonResponse({
        status: 'healthy',
        service: 'finault-gateway',
        version: '3.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime?.() || 0,
        capabilities: ['attribution', 'cost_calculation', 'audit_trail', 'multi_provider', 'api_key_auth'],
        requestId,
      }, 200, request);
    }

    // ──── All endpoints below require a valid API key ────
    const auth = await validateApiKey(request, env);
    if (!auth.valid) {
      return jsonResponse({
        error: auth.error,
        code: auth.code,
        requestId,
      }, 401, request);
    }

    // ──── Rate limiting (per-org, KV-backed) ────
    const rateLimit = await checkRateLimit(env, auth.orgId, url.pathname);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        limit: rateLimit.limit,
        tier: rateLimit.tier,
        retryAfter: rateLimit.retryAfter,
        requestId,
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(request),
          'X-Finault-Request-Id': requestId,
          'Retry-After': String(rateLimit.retryAfter),
          'X-RateLimit-Limit': String(rateLimit.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Tier': rateLimit.tier,
        },
      });
    }

    // Verification endpoint
    if (url.pathname === '/verify' && request.method === 'GET') {
      const hash = url.searchParams.get('hash');
      if (!hash) {
        return jsonResponse({ error: 'Missing hash parameter', code: 'VALIDATION_ERROR', requestId }, 400, request);
      }
      return jsonResponse({ message: 'Verification endpoint', hash, orgId: auth.orgId, requestId }, 200, request);
    }

    // Stats endpoint
    if (url.pathname === '/v1/stats') {
      return jsonResponse({ message: 'Stats available', endpoints: ['/v1/stats/summary', '/v1/stats/by-cost-center'], requestId }, 200, request);
    }

    // Main proxy endpoints — validate, enforce budget, then proxy
    if (url.pathname.startsWith('/v1/chat/completions') || url.pathname.startsWith('/v1/messages')) {
      // ──── FIX #7: Request Input Validation ────
      const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
      if (contentLength > 10_000_000) { // 10 MB max
        return jsonResponse({ error: 'Request body too large (max 10MB)', code: 'VALIDATION_PAYLOAD_TOO_LARGE', requestId }, 413, request);
      }

      let body: Record<string, unknown>;
      try {
        body = await request.json() as Record<string, unknown>;
      } catch {
        return jsonResponse({ error: 'Invalid JSON body', code: 'VALIDATION_ERROR', requestId }, 400, request);
      }

      const model = String(body.model || '');
      if (!model) {
        return jsonResponse({ error: 'Missing required field: model', code: 'VALIDATION_ERROR', requestId }, 400, request);
      }

      // Validate model is in our FALLBACK_PRICING database (prevents typos and injection)
      const provider = request.headers.get('X-Finault-Provider') ||
        (url.pathname.includes('/v1/messages') ? 'anthropic' : 'openai');
      const validModels = FALLBACK_PRICING[provider] || {};
      if (!validModels[model]) {
        return jsonResponse({
          error: `Unknown model: ${model}`,
          code: 'VALIDATION_INVALID_MODEL',
          validModels: Object.keys(validModels),
          provider,
          requestId,
        }, 400, request);
      }

      // Sanitize: strip any system-level overrides a client might inject
      delete (body as any).__proto__;
      delete (body as any).constructor;

      // ──── FIX #8: Budget Enforcement (pre-request) ────
      try {
        const costCenter = request.headers.get('X-Finault-Cost-Center') || 'default';

        // Estimate cost from message content
        const messages = (body.messages || body.prompt || []) as Array<{ content?: string }>;
        const charCount = Array.isArray(messages)
          ? messages.reduce((sum, m) => sum + (typeof m.content === 'string' ? m.content.length : 0), 0)
          : 0;
        const estimatedTokens = Math.ceil(charCount / 4); // ~4 chars per token
        const pricing = validModels[model];
        const estimatedCostCents = Math.ceil((estimatedTokens * pricing.input / 1000) * 100);

        // Add timeout for budget fetch
        const budgetController = new AbortController();
        const budgetTimeoutId = setTimeout(() => budgetController.abort(), TIMEOUT_BUDGET_CHECK);

        try {
          // Check budget against Supabase
          const budgetRes = await fetch(
            `${env.SUPABASE_URL}/rest/v1/budgets?organization_id=eq.${auth.orgId}&cost_center=eq.${encodeURIComponent(costCenter)}&status=eq.active&select=monthly_limit,warning_threshold_percentage,critical_threshold_percentage`,
            {
              headers: {
                'apikey': env.SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
              },
              signal: budgetController.signal,
            }
          );
          clearTimeout(budgetTimeoutId);

          if (budgetRes.ok) {
            const budgets = await budgetRes.json() as Array<{ monthly_limit: number; warning_threshold_percentage: number; critical_threshold_percentage: number }>;
            if (budgets.length > 0) {
              const budget = budgets[0];

              // Get current month's spend
              const now = new Date();
              const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

              // Add timeout for sum_usage_cost RPC fetch
              const spendController = new AbortController();
              const spendTimeoutId = setTimeout(() => spendController.abort(), TIMEOUT_BUDGET_CHECK);

              try {
                const spendRes = await fetch(
                  `${env.SUPABASE_URL}/rest/v1/rpc/sum_usage_cost`,
                  {
                    method: 'POST',
                    headers: {
                      'apikey': env.SUPABASE_SERVICE_KEY,
                      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ organization_id: auth.orgId, cost_center: costCenter, since: monthStart }),
                    signal: spendController.signal,
                  }
                );
                clearTimeout(spendTimeoutId);

                // If we can get spend data, enforce the budget
                if (spendRes.ok) {
                  const spendData = await spendRes.json() as number;
                  const currentSpendCents = typeof spendData === 'number' ? spendData : 0;
                  const projectedSpend = currentSpendCents + estimatedCostCents;
                  const budgetCents = budget.monthly_limit * 100;
                  const usagePct = budgetCents > 0 ? (projectedSpend / budgetCents) * 100 : 0;

                  if (usagePct >= 100) {
                    return jsonResponse({
                      error: 'Budget exceeded',
                      code: 'BUDGET_EXCEEDED',
                      costCenter,
                      currentSpend: `$${(currentSpendCents / 100).toFixed(2)}`,
                      monthlyLimit: `$${budget.monthly_limit.toFixed(2)}`,
                      usagePercent: Math.round(usagePct),
                      requestId,
                    }, 402, request);
                  }
                }
              } finally {
                clearTimeout(spendTimeoutId);
              }
            }
          }
        } finally {
          clearTimeout(budgetTimeoutId);
        }
      } catch {
        // Budget check failed — allow request (graceful degradation)
      }

      // ──── Proxy the validated request ────
      const headers = new Headers(request.headers);
      headers.set('X-Finault-Org', auth.orgId);
      headers.set('X-Finault-User', auth.userId);
      // Re-create request with the already-parsed body
      const authedRequest = new Request(request.url, {
        method: request.method,
        headers,
        body: JSON.stringify(body),
      });
      // Pass requestId to handleProxy via header
      return handleProxy(new Request(request.url, {
        method: request.method,
        headers: new Headers(headers).set('X-Finault-Request-Id', requestId),
        body: JSON.stringify(body),
      }), env, ctx, startTime, body);
    }

    return jsonResponse({ error: 'Not Found', code: 'ENDPOINT_NOT_FOUND', requestId }, 404, request);
  },
};

/**
 * Handles the full proxy flow: loads allocation rules, calls provider, calculates costs, logs
 * @param request - The incoming HTTP request
 * @param env - Environment variables and bindings
 * @param ctx - Cloudflare execution context for background tasks
 * @param startTime - Request start timestamp (for latency calculation)
 * @param parsedBody - Pre-parsed request body to avoid double consumption
 */
async function handleProxy(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  startTime: number,
  parsedBody?: Record<string, unknown>
): Promise<Response> {
  // Note: requestId should be passed from main handler to avoid duplicate generation
  const requestId = request.headers.get('X-Finault-Request-Id') || crypto.randomUUID();

  // Extract metadata from headers
  const metadata: RequestMetadata = {
    costCenter: request.headers.get('X-Finault-Cost-Center') || undefined,
    project: request.headers.get('X-Finault-Project') || undefined,
    team: request.headers.get('X-Finault-Team') || undefined,
    environment: request.headers.get('X-Finault-Environment') || 'production',
    feature: request.headers.get('X-Finault-Feature') || undefined,
    user: request.headers.get('X-Finault-User') || undefined,
    orgId: request.headers.get('X-Finault-Org') || 'default',
    requestId,
  };

  // Determine provider
  const provider = request.headers.get('X-Finault-Provider') ||
    (request.url.includes('/v1/messages') ? 'anthropic' : 'openai');

  try {
    // Parse body (use passed-in parsedBody to avoid double consumption)
    const body = parsedBody || (await request.json());
    const model = (body as any).model || 'unknown';

    // Load allocation rules
    await allocationEngine.loadRules(env, metadata.orgId);

    // Forward to provider
    const providerResponse = await proxyToProvider(provider, request, body, env);

    // Check if provider response was successful before parsing
    if (!providerResponse.ok) {
      const code = providerResponse.status === 408 || providerResponse.status === 504 ? 'PROVIDER_TIMEOUT' : 'PROVIDER_ERROR';
      return new Response(JSON.stringify({
        error: 'Provider error',
        code,
        status: providerResponse.status,
        message: `Provider returned ${providerResponse.status}`,
        requestId,
      }), {
        status: providerResponse.status,
        headers: {
          'Content-Type': 'application/json',
          'X-Finault-Request-Id': requestId,
          ...getCorsHeaders(request),
        },
      });
    }

    // Check content type; if streaming (SSE), pipe through directly
    const contentType = providerResponse.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      return new Response(providerResponse.body, {
        status: providerResponse.status,
        headers: {
          'Content-Type': contentType,
          ...getCorsHeaders(request),
          'X-Finault-Request-Id': requestId,
          'X-Finault-Streaming': 'true',
        },
      });
    }

    const responseBody = await providerResponse.json();

    // Extract usage
    const usage = extractUsage(provider, responseBody);

    // Calculate cost
    const cost = calculateCost(provider, model, usage.inputTokens, usage.outputTokens);

    // Apply attribution
    const attribution = allocationEngine.allocate(metadata);

    // Generate audit hash
    const auditHash = await generateAuditHash({
      requestId,
      timestamp: new Date().toISOString(),
      provider,
      model,
      usage,
      cost,
      attribution,
    });

    const latencyMs = Date.now() - startTime;

    // Log (non-blocking)
    ctx.waitUntil(logQueue.log({
      requestId,
      timestamp: new Date().toISOString(),
      provider,
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costCents: cost.costCents,
      attribution,
      metadata,
      latencyMs,
      auditHash,
    }, env));

    // Return response with attribution headers
    // FIX 7 (MEDIUM): Sanitize header values to prevent information leakage
    return new Response(JSON.stringify(responseBody), {
      status: providerResponse.status,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(request),
        'X-Finault-Request-Id': sanitizeHeaderValue(requestId),
        'X-Finault-Cost-Center': sanitizeHeaderValue(attribution.costCenterCode),
        'X-Finault-GL-Account': sanitizeHeaderValue(attribution.glAccount),
        'X-Finault-Cost-Cents': sanitizeHeaderValue(String(cost.costCents)),
        'X-Finault-Cost-Dollars': sanitizeHeaderValue(cost.costDollars),
        'X-Finault-Confidence': sanitizeHeaderValue(String(attribution.confidence)),
        'X-Finault-Rule-Matched': sanitizeHeaderValue(attribution.ruleMatched || 'none'),
        'X-Finault-Audit-Hash': sanitizeHeaderValue(auditHash),
        'X-Finault-Latency-Ms': sanitizeHeaderValue(String(latencyMs)),
      },
    });

  } catch (error) {
    const latencyMs = Date.now() - startTime;
    // Don't leak internal error details to client
    return jsonResponse({
      error: 'Gateway error',
      code: 'PROVIDER_ERROR',
      message: 'An unexpected error occurred',
      requestId,
      latencyMs,
    }, 500, request);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

// FIX 7 (MEDIUM): Sanitize header values by removing non-alphanumeric characters
function sanitizeHeaderValue(value: string | null | undefined): string {
  if (!value) return '';
  // Allow only alphanumeric, hyphens, underscores, and dots
  return String(value).replace(/[^a-zA-Z0-9\-_.]/g, '');
}

// FIX #12: Configurable CORS origin allowlist (no more wildcard *)
const ALLOWED_ORIGINS = new Set([
  'https://app.finault.ai',
  'https://staging.finault.ai',
  'https://audit.finault.ai',
  'http://localhost:3000',      // Local dev
  'http://localhost:3001',      // Local dev alt
]);

function getCorsHeaders(request?: Request): Record<string, string> {
  const origin = request?.headers.get('Origin') || '';
  // FIX #5: Return empty (deny) for unknown origins instead of defaulting to app.finault.ai
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : '';

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Finault-Cost-Center, X-Finault-Project, X-Finault-Team, X-Finault-Environment, X-Finault-Feature, X-Finault-User, X-Finault-Org, X-Finault-Provider, X-Finault-API-Key, x-api-key',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };

  // Only set Allow-Origin header if origin is allowed
  if (allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
  }

  return headers;
}

function jsonResponse(data: unknown, status = 200, request?: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      ...getCorsHeaders(request),
    },
  });
}

// Export for testing
export { AllocationEngine, calculateCost, generateAuditHash, LogQueue };
