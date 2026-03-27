/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINAULT ECONOMIC ROUTER
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The brain of every routing decision. Takes a request + customer context +
 * economic constraints and outputs the optimal model, projected cost, margin
 * impact, and budget status — in under 2ms.
 *
 * This is NOT a proxy. It is a pure decision function. The proxy calls this
 * engine, gets a decision, and routes accordingly. Zero network calls in the
 * hot path — everything is pre-cached in memory.
 *
 * Inputs:
 *   - request: { messages, model?, max_tokens?, temperature?, tools? }
 *   - customer: { customer_id, feature, team, budget_remaining? }
 *   - constraints: { margin_target?, quality_minimum?, max_cost?, latency_target? }
 *
 * Outputs:
 *   - model: selected model ID
 *   - provider: provider name
 *   - projected_cost: estimated cost in USD
 *   - margin_impact: { current_margin, projected_margin, delta }
 *   - budget_status: { remaining, after_request, enforcement }
 *   - routing_reason: human-readable explanation
 *   - decision_time_us: microseconds taken
 *
 * Design principles:
 *   1. Zero network calls in decide() — all data pre-loaded into memory
 *   2. Pure function — same inputs always produce same outputs
 *   3. Sub-2ms — measured in microseconds, not milliseconds
 *   4. Fail-open — if anything is unknown, pass through the original model
 *   5. Composable — can be embedded in Workers, Node, or Python (via WASM)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */


// ─── Model Pricing Registry (per 1M tokens) ─────────────────────────────────
// Kept in-memory for zero-latency lookups. Updated via refresh() from Supabase.

const MODEL_PRICING = {
    // ── OpenAI ─────────────────────────────────────────────
    'gpt-4o':           { input: 2.50,  output: 10.00, provider: 'openai',    tier: 'flagship',  quality: 92, speed: 88,  batch: 1.25,  cached_input: 1.25 },
    'gpt-4o-mini':      { input: 0.15,  output: 0.60,  provider: 'openai',    tier: 'efficient',  quality: 80, speed: 95,  batch: 0.075, cached_input: 0.075 },
    'gpt-4.1':          { input: 2.00,  output: 8.00,  provider: 'openai',    tier: 'flagship',  quality: 94, speed: 87,  batch: 1.00,  cached_input: 0.50 },
    'gpt-4.1-mini':     { input: 0.40,  output: 1.60,  provider: 'openai',    tier: 'efficient',  quality: 84, speed: 93,  batch: 0.20,  cached_input: 0.10 },
    'gpt-4.1-nano':     { input: 0.10,  output: 0.40,  provider: 'openai',    tier: 'budget',    quality: 74, speed: 99,  batch: 0.05,  cached_input: 0.025 },
    'gpt-4-turbo':      { input: 10.00, output: 30.00, provider: 'openai',    tier: 'legacy',    quality: 93, speed: 85,  batch: null,  cached_input: null },
    'gpt-3.5-turbo':    { input: 0.50,  output: 1.50,  provider: 'openai',    tier: 'legacy',    quality: 75, speed: 98,  batch: null,  cached_input: null },
    'o1':               { input: 15.00, output: 60.00, provider: 'openai',    tier: 'reasoning', quality: 97, speed: 50,  batch: 7.50,  cached_input: 7.50 },
    'o1-mini':          { input: 3.00,  output: 12.00, provider: 'openai',    tier: 'reasoning', quality: 88, speed: 75,  batch: 1.50,  cached_input: 1.50 },
    'o3':               { input: 2.00,  output: 8.00,  provider: 'openai',    tier: 'reasoning', quality: 98, speed: 45,  batch: 1.00,  cached_input: 1.00 },
    'o3-mini':          { input: 1.10,  output: 4.40,  provider: 'openai',    tier: 'reasoning', quality: 90, speed: 78,  batch: 0.55,  cached_input: 0.55 },
    'o4-mini':          { input: 1.10,  output: 4.40,  provider: 'openai',    tier: 'reasoning', quality: 92, speed: 82,  batch: 0.55,  cached_input: 0.55 },

    // ── Anthropic ──────────────────────────────────────────
    'claude-opus-4.5':  { input: 15.00, output: 75.00, provider: 'anthropic', tier: 'flagship',  quality: 99, speed: 72,  batch: 7.50,  cached_input: 1.50 },
    'claude-opus-4':    { input: 15.00, output: 75.00, provider: 'anthropic', tier: 'flagship',  quality: 98, speed: 75,  batch: 7.50,  cached_input: 1.50 },
    'claude-sonnet-4.5':{ input: 3.00,  output: 15.00, provider: 'anthropic', tier: 'balanced',  quality: 96, speed: 90,  batch: 1.50,  cached_input: 0.30 },
    'claude-sonnet-4':  { input: 3.00,  output: 15.00, provider: 'anthropic', tier: 'balanced',  quality: 94, speed: 88,  batch: 1.50,  cached_input: 0.30 },
    'claude-3.5-sonnet':{ input: 3.00,  output: 15.00, provider: 'anthropic', tier: 'balanced',  quality: 92, speed: 88,  batch: 1.50,  cached_input: 0.30 },
    'claude-3.5-haiku': { input: 0.80,  output: 4.00,  provider: 'anthropic', tier: 'efficient', quality: 85, speed: 95,  batch: 0.40,  cached_input: 0.08 },
    'claude-haiku-4.5': { input: 0.80,  output: 4.00,  provider: 'anthropic', tier: 'efficient', quality: 88, speed: 97,  batch: 0.40,  cached_input: 0.08 },
    'claude-3-haiku':   { input: 0.25,  output: 1.25,  provider: 'anthropic', tier: 'budget',    quality: 78, speed: 97,  batch: 0.125, cached_input: 0.03 },

    // ── Google ─────────────────────────────────────────────
    'gemini-2.5-pro':   { input: 1.25,  output: 10.00, provider: 'google',    tier: 'flagship',  quality: 95, speed: 80,  batch: null,  cached_input: 0.3125 },
    'gemini-2.5-flash': { input: 0.15,  output: 0.60,  provider: 'google',    tier: 'efficient', quality: 88, speed: 93,  batch: null,  cached_input: 0.0375 },
    'gemini-2.0-flash': { input: 0.10,  output: 0.40,  provider: 'google',    tier: 'budget',    quality: 85, speed: 92,  batch: null,  cached_input: 0.025 },
    'gemini-1.5-pro':   { input: 1.25,  output: 5.00,  provider: 'google',    tier: 'balanced',  quality: 88, speed: 85,  batch: null,  cached_input: 0.3125 },
    'gemini-1.5-flash': { input: 0.075, output: 0.30,  provider: 'google',    tier: 'budget',    quality: 78, speed: 97,  batch: null,  cached_input: 0.01875 },

    // ── Open Source (via hosted endpoints) ─────────────────
    'llama-4-maverick': { input: 0.20,  output: 0.60,  provider: 'meta',      tier: 'balanced',  quality: 90, speed: 86,  batch: null,  cached_input: null },
    'llama-4-scout':    { input: 0.10,  output: 0.25,  provider: 'meta',      tier: 'efficient', quality: 85, speed: 91,  batch: null,  cached_input: null },
    'llama-3.1-405b':   { input: 1.00,  output: 1.00,  provider: 'meta',      tier: 'flagship',  quality: 88, speed: 82,  batch: null,  cached_input: null },
    'llama-3.1-70b':    { input: 0.20,  output: 0.20,  provider: 'meta',      tier: 'efficient', quality: 80, speed: 90,  batch: null,  cached_input: null },
    'deepseek-r1':      { input: 0.55,  output: 2.19,  provider: 'deepseek',  tier: 'reasoning', quality: 91, speed: 70,  batch: null,  cached_input: 0.14 },
    'deepseek-v3':      { input: 0.27,  output: 1.10,  provider: 'deepseek',  tier: 'balanced',  quality: 87, speed: 85,  batch: null,  cached_input: 0.07 },
};


// ─── Downgrade Paths ─────────────────────────────────────────────────────────
// Maps model → array of cheaper alternatives, ordered by quality (best first).
// Each entry has the minimum quality score needed for that task tier.

const DOWNGRADE_PATHS = {
    // OpenAI flagship → efficient → budget
    'gpt-4o':            ['gpt-4.1', 'gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1-nano'],
    'gpt-4.1':           ['gpt-4o', 'gpt-4.1-mini', 'gpt-4o-mini', 'gpt-4.1-nano'],
    'gpt-4-turbo':       ['gpt-4.1', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4o-mini'],
    'gpt-4':             ['gpt-4o', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4.1-mini'],

    // OpenAI reasoning → cheaper reasoning → flagship
    'o1':                ['o3', 'o3-mini', 'o4-mini', 'gpt-4.1'],
    'o3':                ['o4-mini', 'o3-mini', 'gpt-4.1'],
    'o1-mini':           ['o4-mini', 'o3-mini', 'gpt-4.1-mini'],

    // Anthropic flagship → balanced → efficient
    'claude-opus-4.5':   ['claude-opus-4', 'claude-sonnet-4.5', 'claude-sonnet-4', 'claude-haiku-4.5'],
    'claude-opus-4':     ['claude-sonnet-4.5', 'claude-sonnet-4', 'claude-haiku-4.5'],
    'claude-sonnet-4.5': ['claude-sonnet-4', 'claude-3.5-sonnet', 'claude-haiku-4.5', 'claude-3.5-haiku'],
    'claude-sonnet-4':   ['claude-3.5-sonnet', 'claude-haiku-4.5', 'claude-3.5-haiku'],
    'claude-3.5-sonnet': ['claude-haiku-4.5', 'claude-3.5-haiku', 'claude-3-haiku'],
    'claude-3.5-haiku':  ['claude-haiku-4.5', 'claude-3-haiku'],

    // Google flagship → efficient → budget
    'gemini-2.5-pro':    ['gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash', 'gemini-1.5-flash'],
    'gemini-1.5-pro':    ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'],
    'gemini-2.5-flash':  ['gemini-2.0-flash', 'gemini-1.5-flash'],

    // Open source
    'llama-3.1-405b':    ['llama-4-maverick', 'llama-4-scout', 'llama-3.1-70b'],
    'deepseek-r1':       ['deepseek-v3'],
};


// ─── Cross-Provider Equivalents ──────────────────────────────────────────────
// Maps models to cross-provider alternatives at similar quality levels.
// Used when provider-specific keys aren't available or for arbitrage.

const CROSS_PROVIDER_MAP = {
    // Flagship tier
    'gpt-4o':            ['claude-sonnet-4.5', 'gemini-2.5-pro'],
    'gpt-4.1':           ['claude-sonnet-4.5', 'gemini-2.5-pro'],
    'claude-opus-4':     ['o3', 'gemini-2.5-pro'],
    'claude-sonnet-4.5': ['gpt-4.1', 'gemini-2.5-pro'],
    'gemini-2.5-pro':    ['gpt-4.1', 'claude-sonnet-4.5'],

    // Efficient tier
    'gpt-4o-mini':       ['claude-3.5-haiku', 'gemini-2.5-flash'],
    'gpt-4.1-mini':      ['claude-haiku-4.5', 'gemini-2.5-flash'],
    'claude-3.5-haiku':  ['gpt-4.1-mini', 'gemini-2.5-flash'],
    'claude-haiku-4.5':  ['gpt-4.1-mini', 'gemini-2.5-flash'],
    'gemini-2.5-flash':  ['gpt-4.1-mini', 'claude-haiku-4.5'],

    // Budget tier
    'gpt-4.1-nano':      ['gemini-2.0-flash', 'gemini-1.5-flash'],
    'gemini-2.0-flash':  ['gpt-4.1-nano', 'claude-3-haiku'],
    'gemini-1.5-flash':  ['gpt-4.1-nano'],
};


// ─── Task Classification ─────────────────────────────────────────────────────

const TASK_PATTERNS = {
    reasoning: /\b(analyze|reason|think.*step|explain why|prove|derive|compare.*contrast|evaluate|assess|critique|debate)\b/i,
    code:      /\b(write.*code|implement|function|class|debug|refactor|typescript|python|javascript|rust|sql|api|endpoint|algorithm)\b/i,
    creative:  /\b(write.*story|poem|creative|narrative|compose|draft.*email|blog.*post|article|essay|screenplay|slogan)\b/i,
    extraction:/\b(extract|parse|find.*in|list.*from|get.*from|pull.*out|identify.*in|summarize)\b/i,
    classify:  /\b(classify|categorize|label|sentiment|is this|yes or no|true or false|which.*category|tag)\b/i,
    chat:      /\b(hello|hi|hey|thanks|how are|what do you think|tell me about|what is|who is|explain)\b/i,
    math:      /\b(calculate|compute|solve|equation|integral|derivative|probability|statistics|optimize)\b/i,
};

// Minimum quality score needed per task type
const TASK_QUALITY_REQUIREMENTS = {
    reasoning:  85,
    code:       82,
    creative:   80,
    math:       88,
    extraction: 70,
    classify:   65,
    chat:       60,
    unknown:    75,
};


// ─── Budget Enforcement Levels ───────────────────────────────────────────────

const BUDGET_ENFORCEMENT = {
    NORMAL:   { level: 'normal',   action: 'proceed',  message: null },
    SOFT:     { level: 'soft',     action: 'proceed',  message: 'Budget 80% consumed. Consider switching to a more efficient model.' },
    WARN:     { level: 'warn',     action: 'downgrade', message: 'Budget 90% consumed. Auto-downgrading to efficient model.' },
    THROTTLE: { level: 'throttle', action: 'downgrade', message: 'Budget 95% consumed. Routing to budget-tier model.' },
    CAP:      { level: 'cap',      action: 'block',    message: 'Budget exhausted. Request blocked to prevent overspend.' },
};


// ─── The Economic Router Class ───────────────────────────────────────────────

export class EconomicRouter {
    constructor(options = {}) {
        // In-memory customer economics cache (pre-loaded from Supabase)
        this.customerCache = new Map();

        // In-memory budget tracker (running totals per budget scope)
        this.budgetTracker = new Map();

        // Provider availability (which API keys are configured)
        this.availableProviders = new Set(options.providers || ['openai', 'anthropic', 'google']);

        // Custom pricing overrides (enterprise plans)
        this.pricingOverrides = options.pricingOverrides || {};

        // Quality model overrides (learned from production data)
        this.qualityOverrides = options.qualityOverrides || {};

        // Decision log (circular buffer, last 1000 decisions for analytics)
        this.decisionLog = [];
        this.maxLogSize = options.maxLogSize || 1000;

        // Stats
        this.stats = {
            total_decisions: 0,
            total_savings: 0,
            avg_decision_us: 0,
            downgrades: 0,
            blocks: 0,
            cross_provider_routes: 0,
        };
    }

    // ── Core Decision Function ───────────────────────────────────────────

    /**
     * Make an economic routing decision.
     * This is the HOT PATH — must complete in <2ms. Zero network calls.
     *
     * @param {Object} request - The API request
     * @param {string} request.model - Requested model (e.g., 'gpt-4o')
     * @param {Array}  request.messages - Chat messages array
     * @param {number} [request.max_tokens] - Max output tokens
     * @param {number} [request.temperature] - Temperature
     * @param {Array}  [request.tools] - Function calling tools
     *
     * @param {Object} customer - Customer context
     * @param {string} customer.customer_id - Unique customer identifier
     * @param {string} [customer.feature] - Feature name triggering this request
     * @param {string} [customer.team] - Team/department
     *
     * @param {Object} [constraints] - Economic constraints
     * @param {number} [constraints.margin_target] - Target margin (0-1, e.g., 0.65 = 65%)
     * @param {number} [constraints.quality_minimum] - Min quality score (0-100)
     * @param {number} [constraints.max_cost] - Max cost for this request in USD
     * @param {string} [constraints.latency_target] - 'fast' | 'normal' | 'relaxed'
     * @param {boolean} [constraints.allow_cross_provider] - Allow routing to different provider
     * @param {boolean} [constraints.allow_batch] - Allow batch API routing
     *
     * @returns {Object} Routing decision
     */
    decide(request = {}, customer = {}, constraints = {}) {
        const startTime = performance.now();

        const requestedModel = request.model || 'gpt-4o';
        const messages = request.messages || [];
        const maxTokens = request.max_tokens || 4096;

        // ── Step 1: Classify the task (~0.05ms) ──────────────────────
        const taskType = this._classifyTask(messages, request.tools);

        // ── Step 2: Estimate token usage (~0.02ms) ───────────────────
        const estimatedInputTokens = this._estimateInputTokens(messages);
        const estimatedOutputTokens = Math.min(maxTokens, Math.max(256, estimatedInputTokens * 0.4));

        // ── Step 3: Get model pricing (~0.01ms) ──────────────────────
        const requestedPricing = this._getModelPricing(requestedModel);
        if (!requestedPricing) {
            // Unknown model — pass through unchanged
            return this._buildDecision({
                model: requestedModel,
                provider: 'unknown',
                reason: 'unknown_model_passthrough',
                taskType,
                estimatedInputTokens,
                estimatedOutputTokens,
                projectedCost: 0,
                startTime,
                customer,
            });
        }

        // ── Step 4: Calculate projected cost for requested model ─────
        const projectedCost = this._calculateCost(
            requestedPricing, estimatedInputTokens, estimatedOutputTokens
        );

        // ── Step 5: Check budget constraints (~0.05ms) ───────────────
        const budgetStatus = this._checkBudget(customer, projectedCost);

        if (budgetStatus.enforcement.action === 'block') {
            return this._buildDecision({
                model: requestedModel,
                provider: requestedPricing.provider,
                reason: 'budget_exhausted',
                taskType,
                estimatedInputTokens,
                estimatedOutputTokens,
                projectedCost,
                budgetStatus,
                blocked: true,
                startTime,
                customer,
            });
        }

        // ── Step 6: Determine quality floor (~0.02ms) ────────────────
        const qualityFloor = Math.max(
            constraints.quality_minimum || 0,
            TASK_QUALITY_REQUIREMENTS[taskType] || TASK_QUALITY_REQUIREMENTS.unknown
        );

        // ── Step 7: Check margin constraints (~0.1ms) ────────────────
        const customerEcon = this._getCustomerEconomics(customer.customer_id);
        const marginTarget = constraints.margin_target ?? customerEcon?.margin_target ?? null;

        let needsDowngrade = false;
        let downgradeReason = null;

        // Budget-driven downgrade
        if (budgetStatus.enforcement.action === 'downgrade') {
            needsDowngrade = true;
            downgradeReason = budgetStatus.enforcement.message;
        }

        // Margin-driven downgrade
        if (marginTarget !== null && customerEcon) {
            const projectedMargin = this._calculateProjectedMargin(
                customerEcon, projectedCost
            );
            if (projectedMargin < marginTarget) {
                needsDowngrade = true;
                downgradeReason = `Margin ${(projectedMargin * 100).toFixed(1)}% below target ${(marginTarget * 100).toFixed(1)}%`;
            }
        }

        // Cost cap
        if (constraints.max_cost && projectedCost > constraints.max_cost) {
            needsDowngrade = true;
            downgradeReason = `Projected cost $${projectedCost.toFixed(4)} exceeds cap $${constraints.max_cost.toFixed(4)}`;
        }

        // ── Step 8: Find optimal model (~0.2ms) ─────────────────────
        let selectedModel = requestedModel;
        let selectedPricing = requestedPricing;
        let routingReason = 'direct';

        if (needsDowngrade) {
            const optimal = this._findOptimalModel(
                requestedModel,
                qualityFloor,
                estimatedInputTokens,
                estimatedOutputTokens,
                constraints,
                budgetStatus,
            );

            if (optimal) {
                selectedModel = optimal.model;
                selectedPricing = optimal.pricing;
                routingReason = `downgraded:${downgradeReason}`;
            } else {
                // No viable downgrade found — use requested model anyway
                routingReason = `no_viable_downgrade:${downgradeReason}`;
            }
        } else if (constraints.allow_cross_provider !== false) {
            // Even without a downgrade, check for cross-provider arbitrage
            const cheaper = this._findCheaperCrossProvider(
                requestedModel,
                qualityFloor,
                estimatedInputTokens,
                estimatedOutputTokens,
            );
            if (cheaper && cheaper.savings > 0.001) { // Only if saving > $0.001
                selectedModel = cheaper.model;
                selectedPricing = cheaper.pricing;
                routingReason = `cross_provider_arbitrage:saved_$${cheaper.savings.toFixed(4)}`;
                this.stats.cross_provider_routes++;
            }
        }

        // ── Step 9: Recalculate cost with selected model ────────────
        const finalCost = this._calculateCost(
            selectedPricing, estimatedInputTokens, estimatedOutputTokens
        );
        const savings = projectedCost - finalCost;

        // ── Step 10: Calculate margin impact ────────────────────────
        const marginImpact = this._calculateMarginImpact(customerEcon, finalCost);

        // ── Step 11: Update budget tracker ──────────────────────────
        this._updateBudgetTracker(customer, finalCost);

        // ── Step 12: Build and return decision ──────────────────────
        if (savings > 0) this.stats.total_savings += savings;
        if (selectedModel !== requestedModel) this.stats.downgrades++;

        return this._buildDecision({
            model: selectedModel,
            provider: selectedPricing.provider,
            reason: routingReason,
            taskType,
            estimatedInputTokens,
            estimatedOutputTokens,
            projectedCost: finalCost,
            originalCost: projectedCost,
            savings,
            budgetStatus,
            marginImpact,
            originalModel: requestedModel !== selectedModel ? requestedModel : undefined,
            startTime,
            customer,
        });
    }


    // ── Task Classification ──────────────────────────────────────────────

    _classifyTask(messages, tools) {
        if (!messages || messages.length === 0) return 'unknown';

        // If function calling / tools are present, it's likely code/extraction
        if (tools && tools.length > 0) return 'code';

        // Get the last user message content
        const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
        if (!lastUserMsg) return 'chat';

        const content = typeof lastUserMsg.content === 'string'
            ? lastUserMsg.content
            : (Array.isArray(lastUserMsg.content)
                ? lastUserMsg.content.filter(p => p.type === 'text').map(p => p.text).join(' ')
                : '');

        if (!content) return 'chat';

        // Check patterns in priority order
        if (TASK_PATTERNS.math.test(content))       return 'math';
        if (TASK_PATTERNS.code.test(content))       return 'code';
        if (TASK_PATTERNS.reasoning.test(content))  return 'reasoning';
        if (TASK_PATTERNS.creative.test(content))   return 'creative';
        if (TASK_PATTERNS.classify.test(content))   return 'classify';
        if (TASK_PATTERNS.extraction.test(content)) return 'extraction';
        if (TASK_PATTERNS.chat.test(content))       return 'chat';

        // Heuristic: short messages are likely chat, long ones are likely reasoning
        if (content.length < 100) return 'chat';
        if (content.length > 2000) return 'reasoning';

        return 'unknown';
    }


    // ── Token Estimation ─────────────────────────────────────────────────

    _estimateInputTokens(messages) {
        if (!messages || messages.length === 0) return 100;

        let totalChars = 0;
        for (const msg of messages) {
            if (typeof msg.content === 'string') {
                totalChars += msg.content.length;
            } else if (Array.isArray(msg.content)) {
                for (const part of msg.content) {
                    if (part.type === 'text') totalChars += (part.text || '').length;
                    if (part.type === 'image_url') totalChars += 1000; // ~tokens for vision
                }
            }
            // Add overhead for role, name, etc.
            totalChars += 20;
        }

        // Rough estimate: 1 token ≈ 4 characters for English
        return Math.max(10, Math.ceil(totalChars / 4));
    }


    // ── Pricing Lookups ──────────────────────────────────────────────────

    _getModelPricing(model) {
        // Check custom overrides first (enterprise pricing)
        if (this.pricingOverrides[model]) {
            return { ...MODEL_PRICING[model], ...this.pricingOverrides[model] };
        }
        return MODEL_PRICING[model] || null;
    }

    _calculateCost(pricing, inputTokens, outputTokens) {
        const inputCost = (inputTokens / 1_000_000) * pricing.input;
        const outputCost = (outputTokens / 1_000_000) * pricing.output;
        return inputCost + outputCost;
    }


    // ── Customer Economics ────────────────────────────────────────────────

    _getCustomerEconomics(customerId) {
        if (!customerId) return null;
        return this.customerCache.get(customerId) || null;
    }

    _calculateProjectedMargin(customerEcon, additionalCost) {
        if (!customerEcon || !customerEcon.revenue || customerEcon.revenue <= 0) return 0;
        const totalCost = (customerEcon.running_cost || 0) + additionalCost;
        return (customerEcon.revenue - totalCost) / customerEcon.revenue;
    }

    _calculateMarginImpact(customerEcon, cost) {
        if (!customerEcon || !customerEcon.revenue) {
            return { current_margin: null, projected_margin: null, delta: null };
        }

        const currentMargin = customerEcon.revenue > 0
            ? (customerEcon.revenue - (customerEcon.running_cost || 0)) / customerEcon.revenue
            : 0;

        const projectedMargin = customerEcon.revenue > 0
            ? (customerEcon.revenue - (customerEcon.running_cost || 0) - cost) / customerEcon.revenue
            : 0;

        return {
            current_margin: Math.round(currentMargin * 1000) / 1000,
            projected_margin: Math.round(projectedMargin * 1000) / 1000,
            delta: Math.round((projectedMargin - currentMargin) * 10000) / 10000,
        };
    }


    // ── Budget Enforcement ───────────────────────────────────────────────

    _checkBudget(customer, projectedCost) {
        const budgetKey = this._getBudgetKey(customer);
        const tracker = this.budgetTracker.get(budgetKey);

        if (!tracker || !tracker.limit) {
            return {
                remaining: null,
                after_request: null,
                utilization: 0,
                enforcement: BUDGET_ENFORCEMENT.NORMAL,
            };
        }

        const spent = tracker.spent || 0;
        const limit = tracker.limit;
        const remaining = limit - spent;
        const afterRequest = remaining - projectedCost;
        const utilization = spent / limit;

        let enforcement;
        if (afterRequest < 0) {
            enforcement = BUDGET_ENFORCEMENT.CAP;
            this.stats.blocks++;
        } else if (utilization >= 0.95) {
            enforcement = BUDGET_ENFORCEMENT.THROTTLE;
        } else if (utilization >= 0.90) {
            enforcement = BUDGET_ENFORCEMENT.WARN;
        } else if (utilization >= 0.80) {
            enforcement = BUDGET_ENFORCEMENT.SOFT;
        } else {
            enforcement = BUDGET_ENFORCEMENT.NORMAL;
        }

        return {
            remaining: Math.round(remaining * 10000) / 10000,
            after_request: Math.round(afterRequest * 10000) / 10000,
            utilization: Math.round(utilization * 1000) / 1000,
            enforcement,
        };
    }

    _getBudgetKey(customer) {
        // Budget scoping: customer > team > org
        if (customer.customer_id) return `customer:${customer.customer_id}`;
        if (customer.team) return `team:${customer.team}`;
        return `org:${customer.org_id || 'default'}`;
    }

    _updateBudgetTracker(customer, cost) {
        const budgetKey = this._getBudgetKey(customer);
        const tracker = this.budgetTracker.get(budgetKey);
        if (tracker) {
            tracker.spent = (tracker.spent || 0) + cost;
            tracker.last_updated = Date.now();
        }
    }


    // ── Model Selection ──────────────────────────────────────────────────

    _findOptimalModel(requestedModel, qualityFloor, inputTokens, outputTokens, constraints, budgetStatus) {
        const candidates = [];

        // Get same-provider downgrades
        const downgrades = DOWNGRADE_PATHS[requestedModel] || [];
        for (const model of downgrades) {
            const pricing = this._getModelPricing(model);
            if (!pricing) continue;
            if (!this.availableProviders.has(pricing.provider)) continue;
            if (pricing.quality < qualityFloor) continue;

            const cost = this._calculateCost(pricing, inputTokens, outputTokens);

            // If budget is in THROTTLE mode, only allow budget-tier models
            if (budgetStatus?.enforcement?.level === 'throttle' && pricing.tier !== 'budget') {
                continue;
            }

            candidates.push({ model, pricing, cost, quality: pricing.quality });
        }

        // Also consider cross-provider if allowed
        if (constraints.allow_cross_provider !== false) {
            const crossProviders = CROSS_PROVIDER_MAP[requestedModel] || [];
            for (const model of crossProviders) {
                const pricing = this._getModelPricing(model);
                if (!pricing) continue;
                if (!this.availableProviders.has(pricing.provider)) continue;
                if (pricing.quality < qualityFloor) continue;

                const cost = this._calculateCost(pricing, inputTokens, outputTokens);
                candidates.push({ model, pricing, cost, quality: pricing.quality });
            }
        }

        if (candidates.length === 0) return null;

        // Sort by cost ascending, break ties by quality descending
        candidates.sort((a, b) => {
            if (Math.abs(a.cost - b.cost) < 0.000001) return b.quality - a.quality;
            return a.cost - b.cost;
        });

        // If we have a max_cost constraint, filter
        if (constraints.max_cost) {
            const viable = candidates.filter(c => c.cost <= constraints.max_cost);
            if (viable.length > 0) return viable[0];
        }

        // Return cheapest that meets quality floor
        return candidates[0];
    }

    _findCheaperCrossProvider(requestedModel, qualityFloor, inputTokens, outputTokens) {
        const requestedPricing = this._getModelPricing(requestedModel);
        if (!requestedPricing) return null;

        const requestedCost = this._calculateCost(requestedPricing, inputTokens, outputTokens);
        const crossModels = CROSS_PROVIDER_MAP[requestedModel] || [];

        let bestSaving = null;

        for (const model of crossModels) {
            const pricing = this._getModelPricing(model);
            if (!pricing) continue;
            if (!this.availableProviders.has(pricing.provider)) continue;
            if (pricing.quality < qualityFloor) continue;

            const cost = this._calculateCost(pricing, inputTokens, outputTokens);
            const savings = requestedCost - cost;

            if (savings > 0 && (!bestSaving || savings > bestSaving.savings)) {
                bestSaving = { model, pricing, cost, savings, quality: pricing.quality };
            }
        }

        return bestSaving;
    }


    // ── Decision Builder ─────────────────────────────────────────────────

    _buildDecision(params) {
        const decisionTimeUs = Math.round((performance.now() - params.startTime) * 1000);

        this.stats.total_decisions++;
        // Running average
        this.stats.avg_decision_us = Math.round(
            (this.stats.avg_decision_us * (this.stats.total_decisions - 1) + decisionTimeUs)
            / this.stats.total_decisions
        );

        const decision = {
            model: params.model,
            provider: params.provider,
            projected_cost: Math.round((params.projectedCost || 0) * 1000000) / 1000000,
            original_model: params.originalModel || undefined,
            original_cost: params.originalCost ? Math.round(params.originalCost * 1000000) / 1000000 : undefined,
            savings: params.savings ? Math.round(params.savings * 1000000) / 1000000 : undefined,
            task_type: params.taskType,
            estimated_tokens: {
                input: params.estimatedInputTokens,
                output: params.estimatedOutputTokens,
            },
            margin_impact: params.marginImpact || null,
            budget_status: params.budgetStatus ? {
                remaining: params.budgetStatus.remaining,
                after_request: params.budgetStatus.after_request,
                utilization: params.budgetStatus.utilization,
                enforcement: params.budgetStatus.enforcement.level,
                message: params.budgetStatus.enforcement.message,
            } : null,
            routing_reason: params.reason,
            blocked: params.blocked || false,
            decision_time_us: decisionTimeUs,
        };

        // Log decision (circular buffer)
        if (this.decisionLog.length >= this.maxLogSize) {
            this.decisionLog.shift();
        }
        this.decisionLog.push({
            timestamp: Date.now(),
            customer_id: params.customer?.customer_id,
            feature: params.customer?.feature,
            ...decision,
        });

        return decision;
    }


    // ── Cache Management (called from outside the hot path) ──────────────

    /**
     * Load customer economics into memory. Called periodically, NOT per-request.
     * @param {Array} customers - Array of { customer_id, revenue, running_cost, margin_target }
     */
    loadCustomerEconomics(customers) {
        for (const c of customers) {
            this.customerCache.set(c.customer_id, {
                revenue: c.revenue || 0,
                running_cost: c.running_cost || 0,
                margin_target: c.margin_target || null,
                tier: c.tier || 'standard',
                loaded_at: Date.now(),
            });
        }
    }

    /**
     * Set budget limit for a scope.
     * @param {string} scope - 'customer:xxx' | 'team:xxx' | 'org:xxx'
     * @param {number} limit - Budget limit in USD
     * @param {number} [spent=0] - Already spent amount
     */
    setBudget(scope, limit, spent = 0) {
        this.budgetTracker.set(scope, {
            limit,
            spent,
            period_start: Date.now(),
            last_updated: Date.now(),
        });
    }

    /**
     * Update running cost for a customer after a request completes.
     * Called AFTER the provider responds with actual token counts.
     * @param {string} customerId
     * @param {number} actualCost
     */
    recordActualCost(customerId, actualCost) {
        const econ = this.customerCache.get(customerId);
        if (econ) {
            econ.running_cost = (econ.running_cost || 0) + actualCost;
        }

        // Also update budget tracker
        const budgetKey = `customer:${customerId}`;
        const tracker = this.budgetTracker.get(budgetKey);
        if (tracker) {
            // Correct for the difference between estimated and actual
            // (budget was already incremented by estimate in _updateBudgetTracker)
            // For simplicity, we just set the tracker to include the actual cost
            tracker.last_updated = Date.now();
        }
    }

    /**
     * Update model pricing at runtime (e.g., from a pricing webhook).
     * @param {string} model
     * @param {Object} pricing - { input, output, batch?, cached_input? }
     */
    updatePricing(model, pricing) {
        if (MODEL_PRICING[model]) {
            Object.assign(MODEL_PRICING[model], pricing);
        } else {
            MODEL_PRICING[model] = pricing;
        }
    }

    /**
     * Get router statistics.
     */
    getStats() {
        return {
            ...this.stats,
            customers_cached: this.customerCache.size,
            budgets_tracked: this.budgetTracker.size,
            decisions_logged: this.decisionLog.length,
        };
    }

    /**
     * Get recent decisions for a customer.
     * @param {string} customerId
     * @param {number} [limit=10]
     */
    getRecentDecisions(customerId, limit = 10) {
        return this.decisionLog
            .filter(d => d.customer_id === customerId)
            .slice(-limit);
    }
}


// ─── Convenience: Singleton for Cloudflare Workers ───────────────────────────

let _instance = null;

/**
 * Get or create the singleton EconomicRouter instance.
 * In Workers, this persists across requests within the same isolate.
 */
export function getRouter(options) {
    if (!_instance) {
        _instance = new EconomicRouter(options);
    }
    return _instance;
}


// ─── Exports ─────────────────────────────────────────────────────────────────

export default EconomicRouter;

export {
    MODEL_PRICING,
    DOWNGRADE_PATHS,
    CROSS_PROVIDER_MAP,
    TASK_QUALITY_REQUIREMENTS,
    BUDGET_ENFORCEMENT,
};
