/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINAULT OUTCOME ENGINE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The system that replaces the token economy with the outcome economy.
 *
 * Instead of: "Call GPT-4o, pay per token, manage quality yourself"
 * Now:        "Request an outcome, pay a fixed price, Finault handles everything"
 *
 * The OutcomeEngine:
 *   1. Looks up the outcome in the catalog (pricing, quality bar, orchestration)
 *   2. Quotes a price (fixed or dynamic based on input complexity)
 *   3. Orchestrates execution (model selection, retries, escalation)
 *   4. Verifies quality (meets the bar before charging)
 *   5. Records economics (cost, margin, quality signal for the flywheel)
 *
 * Orchestration Strategies:
 *   - single:   One model call. Cheapest. For simple, well-defined tasks.
 *   - escalate: Start with efficient model, escalate to flagship if quality
 *               doesn't meet the bar. Most common strategy.
 *   - chain:    Multiple models in sequence (e.g., extract → analyze → format).
 *   - parallel: Multiple models simultaneously, pick best result. Premium.
 *
 * The Margin Model:
 *   Finault charges a fixed price per outcome. The actual token cost varies.
 *   Over thousands of executions, the law of large numbers means the average
 *   cost converges to a stable number. Finault's margin = price - avg_cost.
 *   As the network learns better prompts and routing, avg_cost decreases,
 *   margin increases, and prices can drop — attracting more volume.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import EconomicRouter, { MODEL_PRICING } from './economic-router.js';


// ─── Outcome Catalog (in-memory, synced from Supabase) ──────────────────────

const DEFAULT_OUTCOMES = {
    'review_contract': {
        display_name: 'Contract Review',
        base_price: 2.50,
        quality_threshold: 0.90,
        max_retries: 3,
        timeout_ms: 120_000,
        orchestration: { strategy: 'escalate', start_tier: 'balanced' },
        preferred_models: ['claude-opus-4', 'gpt-4.1', 'gemini-2.5-pro'],
        fallback_models: ['claude-sonnet-4.5', 'gpt-4o'],
        system_prompt: 'You are a senior legal analyst. Review the following contract thoroughly. Identify key terms, obligations, risks, unusual clauses, and potential issues. Be specific and cite clause numbers.',
        complexity_multipliers: { short: 0.6, medium: 1.0, long: 1.5, very_long: 2.0 },
    },
    'debug_function': {
        display_name: 'Debug Code',
        base_price: 1.00,
        quality_threshold: 0.85,
        max_retries: 3,
        timeout_ms: 90_000,
        orchestration: { strategy: 'escalate', start_tier: 'efficient' },
        preferred_models: ['claude-sonnet-4.5', 'gpt-4.1', 'gpt-4o'],
        fallback_models: ['o4-mini', 'gpt-4.1-mini'],
        system_prompt: 'You are a senior software engineer. Debug the provided code. Identify the bug, explain why it occurs, and provide the corrected code with explanation.',
        complexity_multipliers: { short: 0.5, medium: 1.0, long: 1.8, very_long: 2.5 },
    },
    'generate_email': {
        display_name: 'Marketing Email',
        base_price: 0.50,
        quality_threshold: 0.80,
        max_retries: 2,
        timeout_ms: 60_000,
        orchestration: { strategy: 'single' },
        preferred_models: ['claude-sonnet-4', 'gpt-4o', 'gemini-2.5-flash'],
        fallback_models: ['gpt-4.1-mini', 'claude-3.5-haiku'],
        system_prompt: 'You are an expert email marketer. Write a compelling marketing email that drives engagement and conversions. Use proven copywriting techniques.',
    },
    'summarize_document': {
        display_name: 'Document Summary',
        base_price: 0.75,
        quality_threshold: 0.85,
        max_retries: 2,
        timeout_ms: 90_000,
        orchestration: { strategy: 'single' },
        preferred_models: ['gemini-2.5-pro', 'claude-sonnet-4.5', 'gpt-4.1'],
        fallback_models: ['gemini-2.5-flash', 'gpt-4.1-mini'],
        system_prompt: 'Produce a comprehensive, well-structured summary. Capture all key points, decisions, and action items. Be concise but thorough.',
        complexity_multipliers: { short: 0.5, medium: 1.0, long: 1.5, very_long: 2.0 },
    },
    'extract_data': {
        display_name: 'Data Extraction',
        base_price: 0.30,
        quality_threshold: 0.90,
        max_retries: 2,
        timeout_ms: 60_000,
        orchestration: { strategy: 'single' },
        preferred_models: ['gpt-4.1-mini', 'claude-haiku-4.5', 'gemini-2.5-flash'],
        fallback_models: ['gpt-4.1-nano', 'gemini-2.0-flash'],
        system_prompt: 'Extract the requested structured data from the input. Return valid JSON. Be precise and complete. If uncertain about a field, include it with a confidence score.',
    },
    'classify_text': {
        display_name: 'Text Classification',
        base_price: 0.10,
        quality_threshold: 0.92,
        max_retries: 2,
        timeout_ms: 30_000,
        orchestration: { strategy: 'single' },
        preferred_models: ['gpt-4.1-nano', 'gemini-2.0-flash', 'claude-3-haiku'],
        fallback_models: ['gpt-4.1-mini'],
        system_prompt: 'Classify the following text into the specified categories. Return the category and a confidence score between 0 and 1.',
    },
    'code_review': {
        display_name: 'Code Review',
        base_price: 1.50,
        quality_threshold: 0.85,
        max_retries: 3,
        timeout_ms: 120_000,
        orchestration: { strategy: 'escalate', start_tier: 'balanced' },
        preferred_models: ['claude-sonnet-4.5', 'gpt-4.1', 'o4-mini'],
        fallback_models: ['gpt-4o', 'claude-sonnet-4'],
        system_prompt: 'You are a senior code reviewer. Review the code for bugs, security vulnerabilities, performance issues, and maintainability. Provide specific, actionable feedback with severity levels.',
        complexity_multipliers: { short: 0.5, medium: 1.0, long: 1.8, very_long: 2.5 },
    },
    'translate_text': {
        display_name: 'Text Translation',
        base_price: 0.40,
        quality_threshold: 0.88,
        max_retries: 2,
        timeout_ms: 60_000,
        orchestration: { strategy: 'single' },
        preferred_models: ['gpt-4o', 'claude-sonnet-4', 'gemini-2.5-flash'],
        fallback_models: ['gpt-4.1-mini', 'claude-3.5-haiku'],
        system_prompt: 'Translate the text naturally and fluently. Preserve tone, style, and meaning. Use appropriate cultural context for the target language.',
    },
    'analyze_data': {
        display_name: 'Data Analysis',
        base_price: 2.00,
        quality_threshold: 0.85,
        max_retries: 3,
        timeout_ms: 180_000,
        orchestration: { strategy: 'escalate', start_tier: 'flagship' },
        preferred_models: ['claude-opus-4', 'o3', 'gemini-2.5-pro'],
        fallback_models: ['claude-sonnet-4.5', 'gpt-4.1'],
        system_prompt: 'You are a data analyst. Analyze the provided data thoroughly. Identify patterns, trends, anomalies, and actionable insights. Use statistical reasoning where appropriate.',
        complexity_multipliers: { short: 0.5, medium: 1.0, long: 2.0, very_long: 3.0 },
    },
    'generate_tests': {
        display_name: 'Test Generation',
        base_price: 1.00,
        quality_threshold: 0.88,
        max_retries: 3,
        timeout_ms: 120_000,
        orchestration: { strategy: 'escalate', start_tier: 'balanced' },
        preferred_models: ['claude-sonnet-4.5', 'gpt-4.1', 'o4-mini'],
        fallback_models: ['gpt-4o', 'claude-sonnet-4'],
        system_prompt: 'Generate comprehensive tests for the provided code. Include unit tests, edge cases, error scenarios, and integration tests where appropriate. Use the project\'s testing framework.',
        complexity_multipliers: { short: 0.5, medium: 1.0, long: 1.8, very_long: 2.5 },
    },
    'sentiment_analysis': {
        display_name: 'Sentiment Analysis',
        base_price: 0.08,
        quality_threshold: 0.90,
        max_retries: 1,
        timeout_ms: 15_000,
        orchestration: { strategy: 'single' },
        preferred_models: ['gpt-4.1-nano', 'gemini-2.0-flash', 'claude-3-haiku'],
        fallback_models: ['gpt-4.1-mini'],
        system_prompt: 'Analyze the sentiment and emotional tone. Return: overall_sentiment (positive/negative/neutral/mixed), confidence (0-1), and emotions detected with scores.',
    },
};


// ─── Model Tier Mapping ──────────────────────────────────────────────────────

const MODEL_TIERS = {
    budget:    ['gpt-4.1-nano', 'gemini-2.0-flash', 'gemini-1.5-flash', 'claude-3-haiku'],
    efficient: ['gpt-4o-mini', 'gpt-4.1-mini', 'claude-3.5-haiku', 'claude-haiku-4.5', 'gemini-2.5-flash'],
    balanced:  ['gpt-4o', 'claude-sonnet-4', 'claude-3.5-sonnet', 'gemini-1.5-pro', 'deepseek-v3'],
    flagship:  ['gpt-4.1', 'claude-sonnet-4.5', 'gemini-2.5-pro', 'claude-opus-4', 'o3'],
    reasoning: ['o1', 'o3', 'o4-mini', 'deepseek-r1'],
};

const ESCALATION_PATH = ['budget', 'efficient', 'balanced', 'flagship', 'reasoning'];


// ─── Complexity Assessment ───────────────────────────────────────────────────

function assessComplexity(input) {
    if (!input) return 'medium';
    const text = typeof input === 'string' ? input : JSON.stringify(input);
    const length = text.length;

    if (length < 500) return 'short';
    if (length < 5000) return 'medium';
    if (length < 50000) return 'long';
    return 'very_long';
}


// ─── Quality Assessment ──────────────────────────────────────────────────────
// Lightweight heuristic quality scoring. Not perfect, but fast.
// Over time, this gets replaced by learned quality models.

function assessQuality(output, taskType, input) {
    if (!output || typeof output !== 'string' || output.trim().length === 0) {
        return { score: 0, reason: 'empty_output' };
    }

    let score = 0.70; // Base score for non-empty output
    const reasons = [];

    // Length appropriateness
    const inputLen = typeof input === 'string' ? input.length : 1000;
    const outputLen = output.length;
    const ratio = outputLen / Math.max(inputLen, 1);

    // Task-specific quality heuristics
    switch (taskType) {
        case 'extract_data':
        case 'classify_text':
        case 'sentiment_analysis':
            // These should return structured data
            try {
                JSON.parse(output);
                score += 0.15;
                reasons.push('valid_json');
            } catch {
                // Check for JSON-like patterns
                if (output.includes('{') && output.includes('}')) {
                    score += 0.05;
                    reasons.push('json_like');
                }
            }
            if (outputLen > 10) { score += 0.05; reasons.push('non_trivial'); }
            break;

        case 'debug_function':
        case 'code_review':
        case 'generate_tests':
            // Code tasks should contain code blocks
            if (output.includes('```') || output.includes('function ') || output.includes('def ') || output.includes('class ')) {
                score += 0.10;
                reasons.push('contains_code');
            }
            if (outputLen > 200) { score += 0.05; reasons.push('detailed'); }
            if (output.includes('bug') || output.includes('fix') || output.includes('issue') || output.includes('test')) {
                score += 0.05;
                reasons.push('task_relevant');
            }
            break;

        case 'review_contract':
        case 'analyze_data':
            // Analysis tasks should be substantial
            if (outputLen > 500) { score += 0.10; reasons.push('substantial'); }
            if (output.includes('risk') || output.includes('finding') || output.includes('insight') || output.includes('recommend')) {
                score += 0.05;
                reasons.push('analytical_language');
            }
            // Should have structure (bullet points, sections)
            if ((output.match(/\n-|\n\d\.|#{1,3}\s/g) || []).length >= 3) {
                score += 0.05;
                reasons.push('structured');
            }
            break;

        case 'generate_email':
        case 'translate_text':
            // Creative/translation should be proportional to input
            if (ratio > 0.3 && ratio < 5.0) { score += 0.10; reasons.push('proportional_length'); }
            if (outputLen > 100) { score += 0.05; reasons.push('non_trivial'); }
            break;

        case 'summarize_document':
            // Summary should be shorter than input but substantial
            if (ratio > 0.05 && ratio < 0.5) { score += 0.10; reasons.push('good_compression'); }
            if (outputLen > 200) { score += 0.05; reasons.push('substantial'); }
            break;

        default:
            // Generic quality
            if (outputLen > 100) { score += 0.10; reasons.push('non_trivial'); }
            if (outputLen > 500) { score += 0.05; reasons.push('detailed'); }
    }

    // Universal quality signals
    // Refusal detection (model refused to help)
    if (output.match(/I cannot|I'm unable|I apologize but|As an AI/i)) {
        score -= 0.30;
        reasons.push('possible_refusal');
    }

    // Repetition detection
    const sentences = output.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const uniqueSentences = new Set(sentences.map(s => s.trim().toLowerCase()));
    if (sentences.length > 3 && uniqueSentences.size / sentences.length < 0.5) {
        score -= 0.20;
        reasons.push('high_repetition');
    }

    return {
        score: Math.max(0, Math.min(1, Math.round(score * 1000) / 1000)),
        reasons,
        method: 'heuristic_v1',
    };
}


// ─── The Outcome Engine Class ────────────────────────────────────────────────

export class OutcomeEngine {
    constructor(options = {}) {
        // Outcome catalog (in-memory, synced from DB)
        this.catalog = new Map();

        // Load defaults
        for (const [taskType, config] of Object.entries(DEFAULT_OUTCOMES)) {
            this.catalog.set(taskType, { ...config, task_type: taskType });
        }

        // Custom outcomes from DB
        if (options.customOutcomes) {
            for (const outcome of options.customOutcomes) {
                this.catalog.set(outcome.task_type, outcome);
            }
        }

        // The economic router for per-request model decisions
        this.router = options.router || new EconomicRouter(options);

        // Available providers (which API keys are configured)
        this.availableProviders = new Set(options.providers || ['openai', 'anthropic', 'google']);

        // Execution function — injected by the gateway (makes actual API calls)
        this.executeFn = options.executeFn || null;

        // Stats
        this.stats = {
            total_outcomes: 0,
            total_revenue: 0,
            total_cost: 0,
            success_rate: 1.0,
            avg_margin: 0,
        };
    }


    // ── Quote: Get the price for an outcome before committing ────────

    /**
     * Get a price quote for an outcome.
     * @param {string} taskType - The outcome type (e.g., 'review_contract')
     * @param {Object} options
     * @param {string|Object} options.input - The input data
     * @param {number} [options.budget] - Max budget (for budget_capped pricing)
     * @param {string} [options.quality] - 'standard' | 'high' | 'premium'
     * @returns {Object} Quote with price, estimated tokens, and execution plan
     */
    quote(taskType, options = {}) {
        const outcome = this.catalog.get(taskType);
        if (!outcome) {
            return {
                available: false,
                error: `Unknown outcome type: ${taskType}`,
                available_types: [...this.catalog.keys()],
            };
        }

        const complexity = assessComplexity(options.input);
        const multiplier = (outcome.complexity_multipliers || {})[complexity] || 1.0;
        const qualityMultiplier = options.quality === 'premium' ? 1.5 : options.quality === 'high' ? 1.2 : 1.0;

        let price = outcome.base_price * multiplier * qualityMultiplier;

        // Dynamic pricing: if we have historical data, adjust based on actual costs
        if (outcome.avg_token_cost && outcome.executions_count > 100) {
            const historicalMargin = (price - outcome.avg_token_cost * multiplier) / price;
            // If margin is too thin (<20%), bump price
            if (historicalMargin < 0.20) {
                price = (outcome.avg_token_cost * multiplier) / 0.70; // Target 30% margin
            }
            // If margin is too fat (>70%), we could lower price to be competitive
            // But we don't auto-lower — that's a business decision
        }

        // Budget cap
        if (options.budget && price > options.budget) {
            // Can we deliver at budget? Check if cost estimate fits
            const estimatedCost = (outcome.avg_token_cost || price * 0.5) * multiplier;
            if (estimatedCost < options.budget * 0.7) {
                price = options.budget; // Accept at their budget
            } else {
                return {
                    available: true,
                    affordable: false,
                    quoted_price: Math.round(price * 100) / 100,
                    budget: options.budget,
                    message: `This outcome typically costs $${price.toFixed(2)} but your budget is $${options.budget.toFixed(2)}.`,
                };
            }
        }

        price = Math.round(price * 100) / 100;

        // Build execution plan
        const plan = this._buildExecutionPlan(outcome, complexity, options.quality);

        return {
            available: true,
            affordable: true,
            task_type: taskType,
            display_name: outcome.display_name,
            quoted_price: price,
            currency: 'USD',
            complexity,
            quality_threshold: outcome.quality_threshold,
            max_retries: outcome.max_retries,
            timeout_ms: outcome.timeout_ms,
            execution_plan: plan,
            estimated_models: plan.models,
            guaranteed: true, // Fixed price — cost overruns are Finault's problem
        };
    }


    // ── Execute: Deliver the outcome ─────────────────────────────────

    /**
     * Execute an outcome. This is the main entry point.
     * @param {string} taskType
     * @param {Object} options
     * @param {string|Object} options.input - The input data
     * @param {string} [options.customer_id]
     * @param {string} [options.feature]
     * @param {number} [options.budget] - Max budget
     * @param {string} [options.quality] - 'standard' | 'high' | 'premium'
     * @param {Object} [options.metadata]
     * @returns {Object} Outcome result
     */
    async execute(taskType, options = {}) {
        const startTime = performance.now();
        const executionId = crypto.randomUUID ? crypto.randomUUID() : `exec_${Date.now()}_${Math.random().toString(36).slice(2)}`;

        // ── Step 1: Quote ────────────────────────────────────────────
        const quoteResult = this.quote(taskType, options);
        if (!quoteResult.available) {
            return { success: false, error: quoteResult.error, available_types: quoteResult.available_types };
        }
        if (quoteResult.affordable === false) {
            return { success: false, error: 'budget_exceeded', quote: quoteResult };
        }

        const outcome = this.catalog.get(taskType);
        const price = quoteResult.quoted_price;
        const plan = quoteResult.execution_plan;

        if (!this.executeFn) {
            return {
                success: false,
                error: 'no_execute_function',
                message: 'OutcomeEngine requires an executeFn to make API calls. Inject via constructor options.',
            };
        }

        // ── Step 2: Orchestrate ──────────────────────────────────────
        const result = await this._orchestrate(outcome, plan, options, executionId);

        // ── Step 3: Calculate economics ──────────────────────────────
        const totalCost = result.attempts.reduce((sum, a) => sum + (a.cost || 0), 0);
        const totalTokens = result.attempts.reduce((sum, a) => sum + (a.input_tokens || 0) + (a.output_tokens || 0), 0);
        const margin = price - totalCost;
        const marginPct = price > 0 ? margin / price : 0;
        const durationMs = Math.round(performance.now() - startTime);

        // Update rolling stats
        this.stats.total_outcomes++;
        this.stats.total_revenue += price;
        this.stats.total_cost += totalCost;
        if (result.success) {
            this.stats.success_rate = (this.stats.success_rate * (this.stats.total_outcomes - 1) + 1) / this.stats.total_outcomes;
        } else {
            this.stats.success_rate = (this.stats.success_rate * (this.stats.total_outcomes - 1)) / this.stats.total_outcomes;
        }
        this.stats.avg_margin = this.stats.total_revenue > 0
            ? (this.stats.total_revenue - this.stats.total_cost) / this.stats.total_revenue
            : 0;

        // Update catalog with execution data (rolling averages)
        if (outcome.executions_count !== undefined) {
            const n = outcome.executions_count;
            outcome.avg_token_cost = ((outcome.avg_token_cost || 0) * n + totalCost) / (n + 1);
            outcome.avg_tokens_used = ((outcome.avg_tokens_used || 0) * n + totalTokens) / (n + 1);
            outcome.margin = marginPct;
            outcome.executions_count = n + 1;
            if (result.success) {
                outcome.success_rate = ((outcome.success_rate || 1) * n + 1) / (n + 1);
            } else {
                outcome.success_rate = ((outcome.success_rate || 1) * n) / (n + 1);
            }
        }

        return {
            success: result.success,
            execution_id: executionId,
            task_type: taskType,

            // The output
            content: result.content,
            result_summary: result.content ? result.content.substring(0, 200) + (result.content.length > 200 ? '...' : '') : null,

            // Economics (this is what makes Finault different)
            price,
            actual_cost: Math.round(totalCost * 1000000) / 1000000,
            margin: Math.round(margin * 1000000) / 1000000,
            margin_pct: Math.round(marginPct * 1000) / 1000,

            // Execution details
            attempts: result.attempts.length,
            models_used: result.attempts.map(a => a.model),
            total_tokens: totalTokens,
            duration_ms: durationMs,

            // Quality
            quality: result.quality,
            met_quality_bar: result.quality?.score >= outcome.quality_threshold,

            // The customer never sees tokens
            // They see: outcome, price, quality. That's it.
            // The rest is Finault's internal economics.
        };
    }


    // ── Orchestration ────────────────────────────────────────────────

    async _orchestrate(outcome, plan, options, executionId) {
        const strategy = plan.strategy;
        const attempts = [];
        let bestContent = null;
        let bestQuality = { score: 0 };

        switch (strategy) {
            case 'single':
                return await this._executeSingle(outcome, plan, options, attempts);

            case 'escalate':
                return await this._executeEscalate(outcome, plan, options, attempts);

            case 'chain':
                return await this._executeChain(outcome, plan, options, attempts);

            case 'parallel':
                return await this._executeParallel(outcome, plan, options, attempts);

            default:
                return await this._executeSingle(outcome, plan, options, attempts);
        }
    }

    async _executeSingle(outcome, plan, options, attempts) {
        for (const model of plan.models) {
            if (!this._isModelAvailable(model)) continue;

            const attempt = await this._callModel(model, outcome, options);
            attempts.push(attempt);

            if (attempt.success) {
                const quality = assessQuality(attempt.content, outcome.task_type, options.input);
                if (quality.score >= outcome.quality_threshold) {
                    return { success: true, content: attempt.content, quality, attempts };
                }
            }

            // If we've exhausted retries, return best attempt
            if (attempts.length >= outcome.max_retries) break;
        }

        // Return best attempt even if below quality bar
        const lastAttempt = attempts[attempts.length - 1];
        const quality = lastAttempt?.content
            ? assessQuality(lastAttempt.content, outcome.task_type, options.input)
            : { score: 0, reason: 'no_output' };

        return {
            success: quality.score >= outcome.quality_threshold * 0.8, // Accept within 80% of bar
            content: lastAttempt?.content || null,
            quality,
            attempts,
        };
    }

    async _executeEscalate(outcome, plan, options, attempts) {
        const startTier = plan.start_tier || 'efficient';
        const startIdx = ESCALATION_PATH.indexOf(startTier);
        const tiers = ESCALATION_PATH.slice(Math.max(0, startIdx));

        for (const tier of tiers) {
            const tierModels = MODEL_TIERS[tier] || [];

            // Filter to preferred + available models in this tier
            const preferred = (outcome.preferred_models || []).filter(m => {
                const pricing = MODEL_PRICING[m];
                return pricing && tierModels.includes(m) && this._isModelAvailable(m);
            });

            // Also include any available tier model not in preferred
            const others = tierModels.filter(m =>
                !preferred.includes(m) && this._isModelAvailable(m)
            );

            const modelsToTry = [...preferred, ...others].slice(0, 2); // Max 2 per tier

            for (const model of modelsToTry) {
                const attempt = await this._callModel(model, outcome, options);
                attempts.push(attempt);

                if (attempt.success) {
                    const quality = assessQuality(attempt.content, outcome.task_type, options.input);
                    if (quality.score >= outcome.quality_threshold) {
                        return { success: true, content: attempt.content, quality, attempts };
                    }
                    // Quality not met — escalate to next tier
                }

                if (attempts.length >= outcome.max_retries) {
                    // Return best so far
                    const best = this._pickBestAttempt(attempts, outcome.task_type, options.input);
                    return {
                        success: best.quality.score >= outcome.quality_threshold * 0.8,
                        content: best.content,
                        quality: best.quality,
                        attempts,
                    };
                }
            }
        }

        // Exhausted all tiers
        const best = this._pickBestAttempt(attempts, outcome.task_type, options.input);
        return {
            success: best.quality.score >= outcome.quality_threshold * 0.8,
            content: best.content,
            quality: best.quality,
            attempts,
        };
    }

    async _executeChain(outcome, plan, options, attempts) {
        // Chain: each step's output feeds into the next step's input
        const steps = plan.chain_steps || [{ role: 'execute' }];
        let currentInput = options.input;

        for (const step of steps) {
            const model = this._pickModelForStep(step, outcome);
            const stepOptions = { ...options, input: currentInput };
            const attempt = await this._callModel(model, outcome, stepOptions);
            attempts.push(attempt);

            if (!attempt.success) {
                return { success: false, content: null, quality: { score: 0, reason: 'chain_step_failed' }, attempts };
            }

            currentInput = attempt.content; // Feed output to next step
        }

        const finalContent = currentInput;
        const quality = assessQuality(finalContent, outcome.task_type, options.input);

        return { success: true, content: finalContent, quality, attempts };
    }

    async _executeParallel(outcome, plan, options, attempts) {
        // Run multiple models simultaneously, pick the best result
        const models = plan.models.filter(m => this._isModelAvailable(m)).slice(0, 3);

        const promises = models.map(model =>
            this._callModel(model, outcome, options).catch(e => ({
                success: false, model, error: e.message, content: null, cost: 0,
            }))
        );

        const results = await Promise.all(promises);
        attempts.push(...results);

        // Pick the best result by quality
        const best = this._pickBestAttempt(results.filter(r => r.success), outcome.task_type, options.input);

        return {
            success: best.quality.score >= outcome.quality_threshold * 0.8,
            content: best.content,
            quality: best.quality,
            attempts,
        };
    }


    // ── Model Calling ────────────────────────────────────────────────

    async _callModel(model, outcome, options) {
        const startTime = performance.now();
        const pricing = MODEL_PRICING[model];

        try {
            // Build the messages array
            const messages = [];
            if (outcome.system_prompt) {
                messages.push({ role: 'system', content: outcome.system_prompt });
            }

            const userContent = typeof options.input === 'string'
                ? options.input
                : JSON.stringify(options.input, null, 2);

            messages.push({ role: 'user', content: userContent });

            // Call the provider via the injected execute function
            const response = await this.executeFn({
                model,
                messages,
                provider: pricing?.provider || 'openai',
                max_tokens: 16384,
                temperature: options.temperature ?? 0.3,
            });

            const latencyMs = Math.round(performance.now() - startTime);
            const inputTokens = response.usage?.prompt_tokens || 0;
            const outputTokens = response.usage?.completion_tokens || 0;
            const cost = pricing
                ? (inputTokens / 1e6) * pricing.input + (outputTokens / 1e6) * pricing.output
                : 0;

            const content = response.choices?.[0]?.message?.content || '';

            return {
                success: true,
                model,
                provider: pricing?.provider,
                content,
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                cost,
                latency_ms: latencyMs,
            };
        } catch (error) {
            return {
                success: false,
                model,
                provider: pricing?.provider,
                content: null,
                error: error.message,
                cost: 0,
                latency_ms: Math.round(performance.now() - startTime),
            };
        }
    }


    // ── Helpers ───────────────────────────────────────────────────────

    _isModelAvailable(model) {
        const pricing = MODEL_PRICING[model];
        if (!pricing) return false;
        return this.availableProviders.has(pricing.provider);
    }

    _buildExecutionPlan(outcome, complexity, quality) {
        const strategy = outcome.orchestration?.strategy || 'single';
        const startTier = outcome.orchestration?.start_tier || 'balanced';

        // For escalate, start at the configured tier
        if (strategy === 'escalate') {
            const startIdx = ESCALATION_PATH.indexOf(startTier);
            const tiers = ESCALATION_PATH.slice(Math.max(0, startIdx));
            const models = [];
            for (const tier of tiers) {
                const tierModels = (outcome.preferred_models || []).filter(m => {
                    const p = MODEL_PRICING[m];
                    return p && (MODEL_TIERS[tier] || []).includes(m);
                });
                models.push(...tierModels);
            }
            // Fill with fallbacks
            models.push(...(outcome.fallback_models || []));

            return { strategy, start_tier: startTier, models: [...new Set(models)] };
        }

        // For single/parallel, use preferred models
        return {
            strategy,
            models: [
                ...(outcome.preferred_models || []),
                ...(outcome.fallback_models || []),
            ].filter(m => this._isModelAvailable(m)),
        };
    }

    _pickModelForStep(step, outcome) {
        const models = outcome.preferred_models || [];
        for (const m of models) {
            if (this._isModelAvailable(m)) return m;
        }
        // Fallback
        for (const m of (outcome.fallback_models || [])) {
            if (this._isModelAvailable(m)) return m;
        }
        return 'gpt-4o'; // Last resort
    }

    _pickBestAttempt(attempts, taskType, input) {
        if (!attempts || attempts.length === 0) {
            return { content: null, quality: { score: 0, reason: 'no_attempts' } };
        }

        let best = null;
        let bestScore = -1;

        for (const attempt of attempts) {
            if (!attempt.content) continue;
            const quality = assessQuality(attempt.content, taskType, input);
            if (quality.score > bestScore) {
                bestScore = quality.score;
                best = { content: attempt.content, quality };
            }
        }

        return best || { content: attempts[0]?.content, quality: { score: 0, reason: 'all_low_quality' } };
    }


    // ── Catalog Management ───────────────────────────────────────────

    /**
     * Register a custom outcome type.
     */
    registerOutcome(taskType, config) {
        this.catalog.set(taskType, {
            task_type: taskType,
            base_price: config.base_price || 1.00,
            quality_threshold: config.quality_threshold || 0.85,
            max_retries: config.max_retries || 3,
            timeout_ms: config.timeout_ms || 120_000,
            orchestration: config.orchestration || { strategy: 'escalate', start_tier: 'balanced' },
            preferred_models: config.preferred_models || ['gpt-4.1', 'claude-sonnet-4.5'],
            fallback_models: config.fallback_models || ['gpt-4o-mini'],
            system_prompt: config.system_prompt || '',
            display_name: config.display_name || taskType,
            description: config.description || '',
            complexity_multipliers: config.complexity_multipliers,
            executions_count: 0,
            success_rate: 1.0,
            ...config,
        });
    }

    /**
     * List all available outcome types.
     */
    listOutcomes() {
        return [...this.catalog.entries()].map(([taskType, config]) => ({
            task_type: taskType,
            display_name: config.display_name,
            base_price: config.base_price,
            quality_threshold: config.quality_threshold,
            executions_count: config.executions_count || 0,
            success_rate: config.success_rate || 1.0,
            avg_cost: config.avg_token_cost || null,
            margin: config.margin || null,
        }));
    }

    /**
     * Get engine statistics.
     */
    getStats() {
        return {
            ...this.stats,
            outcomes_registered: this.catalog.size,
            margin_pct: Math.round((this.stats.avg_margin || 0) * 1000) / 1000,
        };
    }
}


// ─── Singleton ───────────────────────────────────────────────────────────────

let _outcomeInstance = null;

export function getOutcomeEngine(options) {
    if (!_outcomeInstance) {
        _outcomeInstance = new OutcomeEngine(options);
    }
    return _outcomeInstance;
}

export default OutcomeEngine;

export {
    DEFAULT_OUTCOMES,
    MODEL_TIERS,
    ESCALATION_PATH,
    assessComplexity,
    assessQuality,
};
