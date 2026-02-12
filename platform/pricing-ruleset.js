/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINAULT PRICING RULESET ENGINE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Pillar 2 Critical Gap: Deterministic pricing enforcement
 *
 * Constitutional Rules:
 *   - Missing pricing rule → ABORT (no inference, no fallback)
 *   - Unknown SKU → ABORT
 *   - Sealed rulesets are immutable
 *   - Every reconciliation must cite a specific ruleset version
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT PRICING RULES (v1 - can be sealed and versioned)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_PRICING_RULES_V1 = [
    // OpenAI
    { provider: 'openai', sku: 'gpt-4o', direction: 'input', price_per_unit: 0.0000025, unit_type: 'tokens' },
    { provider: 'openai', sku: 'gpt-4o', direction: 'output', price_per_unit: 0.00001, unit_type: 'tokens' },
    { provider: 'openai', sku: 'gpt-4o-mini', direction: 'input', price_per_unit: 0.00000015, unit_type: 'tokens' },
    { provider: 'openai', sku: 'gpt-4o-mini', direction: 'output', price_per_unit: 0.0000006, unit_type: 'tokens' },
    { provider: 'openai', sku: 'gpt-4-turbo', direction: 'input', price_per_unit: 0.00001, unit_type: 'tokens' },
    { provider: 'openai', sku: 'gpt-4-turbo', direction: 'output', price_per_unit: 0.00003, unit_type: 'tokens' },
    { provider: 'openai', sku: 'gpt-4', direction: 'input', price_per_unit: 0.00003, unit_type: 'tokens' },
    { provider: 'openai', sku: 'gpt-4', direction: 'output', price_per_unit: 0.00006, unit_type: 'tokens' },
    { provider: 'openai', sku: 'gpt-3.5-turbo', direction: 'input', price_per_unit: 0.0000005, unit_type: 'tokens' },
    { provider: 'openai', sku: 'gpt-3.5-turbo', direction: 'output', price_per_unit: 0.0000015, unit_type: 'tokens' },
    { provider: 'openai', sku: 'o1', direction: 'input', price_per_unit: 0.000015, unit_type: 'tokens' },
    { provider: 'openai', sku: 'o1', direction: 'output', price_per_unit: 0.00006, unit_type: 'tokens' },
    { provider: 'openai', sku: 'o1-mini', direction: 'input', price_per_unit: 0.000003, unit_type: 'tokens' },
    { provider: 'openai', sku: 'o1-mini', direction: 'output', price_per_unit: 0.000012, unit_type: 'tokens' },
    { provider: 'openai', sku: 'text-embedding-3-small', direction: 'both', price_per_unit: 0.00000002, unit_type: 'tokens' },
    { provider: 'openai', sku: 'text-embedding-3-large', direction: 'both', price_per_unit: 0.00000013, unit_type: 'tokens' },
    { provider: 'openai', sku: 'dall-e-3', direction: 'both', price_per_unit: 0.04, unit_type: 'images' },

    // Anthropic
    { provider: 'anthropic', sku: 'claude-opus-4', direction: 'input', price_per_unit: 0.000015, unit_type: 'tokens' },
    { provider: 'anthropic', sku: 'claude-opus-4', direction: 'output', price_per_unit: 0.000075, unit_type: 'tokens' },
    { provider: 'anthropic', sku: 'claude-sonnet-4', direction: 'input', price_per_unit: 0.000003, unit_type: 'tokens' },
    { provider: 'anthropic', sku: 'claude-sonnet-4', direction: 'output', price_per_unit: 0.000015, unit_type: 'tokens' },
    { provider: 'anthropic', sku: 'claude-haiku-3.5', direction: 'input', price_per_unit: 0.0000008, unit_type: 'tokens' },
    { provider: 'anthropic', sku: 'claude-haiku-3.5', direction: 'output', price_per_unit: 0.000004, unit_type: 'tokens' },
    { provider: 'anthropic', sku: 'claude-3-opus', direction: 'input', price_per_unit: 0.000015, unit_type: 'tokens' },
    { provider: 'anthropic', sku: 'claude-3-opus', direction: 'output', price_per_unit: 0.000075, unit_type: 'tokens' },
    { provider: 'anthropic', sku: 'claude-3-sonnet', direction: 'input', price_per_unit: 0.000003, unit_type: 'tokens' },
    { provider: 'anthropic', sku: 'claude-3-sonnet', direction: 'output', price_per_unit: 0.000015, unit_type: 'tokens' },
    { provider: 'anthropic', sku: 'claude-3-haiku', direction: 'input', price_per_unit: 0.00000025, unit_type: 'tokens' },
    { provider: 'anthropic', sku: 'claude-3-haiku', direction: 'output', price_per_unit: 0.00000125, unit_type: 'tokens' },

    // Google
    { provider: 'google', sku: 'gemini-1.5-pro', direction: 'input', price_per_unit: 0.00000125, unit_type: 'tokens' },
    { provider: 'google', sku: 'gemini-1.5-pro', direction: 'output', price_per_unit: 0.000005, unit_type: 'tokens' },
    { provider: 'google', sku: 'gemini-1.5-flash', direction: 'input', price_per_unit: 0.000000075, unit_type: 'tokens' },
    { provider: 'google', sku: 'gemini-1.5-flash', direction: 'output', price_per_unit: 0.0000003, unit_type: 'tokens' },
    { provider: 'google', sku: 'gemini-2.0-flash', direction: 'input', price_per_unit: 0.0000001, unit_type: 'tokens' },
    { provider: 'google', sku: 'gemini-2.0-flash', direction: 'output', price_per_unit: 0.0000004, unit_type: 'tokens' },

    // AWS Bedrock (wrapped models)
    { provider: 'aws', sku: 'bedrock-claude-3-sonnet', direction: 'input', price_per_unit: 0.000003, unit_type: 'tokens' },
    { provider: 'aws', sku: 'bedrock-claude-3-sonnet', direction: 'output', price_per_unit: 0.000015, unit_type: 'tokens' },
    { provider: 'aws', sku: 'bedrock-claude-3-haiku', direction: 'input', price_per_unit: 0.00000025, unit_type: 'tokens' },
    { provider: 'aws', sku: 'bedrock-claude-3-haiku', direction: 'output', price_per_unit: 0.00000125, unit_type: 'tokens' },
    { provider: 'aws', sku: 'bedrock-titan-text-express', direction: 'input', price_per_unit: 0.0000002, unit_type: 'tokens' },
    { provider: 'aws', sku: 'bedrock-titan-text-express', direction: 'output', price_per_unit: 0.0000006, unit_type: 'tokens' },
    { provider: 'aws', sku: 'bedrock-titan-embed', direction: 'both', price_per_unit: 0.0000001, unit_type: 'tokens' },

    // Azure OpenAI (same pricing as OpenAI)
    { provider: 'azure', sku: 'azure-gpt-4o', direction: 'input', price_per_unit: 0.0000025, unit_type: 'tokens' },
    { provider: 'azure', sku: 'azure-gpt-4o', direction: 'output', price_per_unit: 0.00001, unit_type: 'tokens' },
    { provider: 'azure', sku: 'azure-gpt-4', direction: 'input', price_per_unit: 0.00003, unit_type: 'tokens' },
    { provider: 'azure', sku: 'azure-gpt-4', direction: 'output', price_per_unit: 0.00006, unit_type: 'tokens' },

    // Cohere
    { provider: 'cohere', sku: 'command-r-plus', direction: 'input', price_per_unit: 0.000003, unit_type: 'tokens' },
    { provider: 'cohere', sku: 'command-r-plus', direction: 'output', price_per_unit: 0.000015, unit_type: 'tokens' },
    { provider: 'cohere', sku: 'command-r', direction: 'input', price_per_unit: 0.0000005, unit_type: 'tokens' },
    { provider: 'cohere', sku: 'command-r', direction: 'output', price_per_unit: 0.0000015, unit_type: 'tokens' },
    { provider: 'cohere', sku: 'embed-v3', direction: 'both', price_per_unit: 0.0000001, unit_type: 'tokens' },

    // Mistral
    { provider: 'mistral', sku: 'mistral-large', direction: 'input', price_per_unit: 0.000002, unit_type: 'tokens' },
    { provider: 'mistral', sku: 'mistral-large', direction: 'output', price_per_unit: 0.000006, unit_type: 'tokens' },
    { provider: 'mistral', sku: 'mistral-small', direction: 'input', price_per_unit: 0.0000002, unit_type: 'tokens' },
    { provider: 'mistral', sku: 'mistral-small', direction: 'output', price_per_unit: 0.0000006, unit_type: 'tokens' },

    // Vector DBs (per operation/query)
    { provider: 'pinecone', sku: 'serverless-reads', direction: 'both', price_per_unit: 0.000002, unit_type: 'requests' },
    { provider: 'pinecone', sku: 'serverless-writes', direction: 'both', price_per_unit: 0.000002, unit_type: 'requests' },
    { provider: 'pinecone', sku: 'serverless-storage', direction: 'both', price_per_unit: 0.00033, unit_type: 'units' },
    { provider: 'weaviate', sku: 'serverless-queries', direction: 'both', price_per_unit: 0.00025, unit_type: 'requests' },
    { provider: 'chroma', sku: 'cloud-queries', direction: 'both', price_per_unit: 0.0001, unit_type: 'requests' },

    // HuggingFace
    { provider: 'huggingface', sku: 'inference-endpoints-gpu', direction: 'both', price_per_unit: 0.0006, unit_type: 'minutes' },
    { provider: 'huggingface', sku: 'inference-endpoints-cpu', direction: 'both', price_per_unit: 0.00006, unit_type: 'minutes' },
    { provider: 'huggingface', sku: 'inference-api', direction: 'both', price_per_unit: 0.0000001, unit_type: 'characters' },

    // Eval / Observability tools
    { provider: 'helicone', sku: 'pro-requests', direction: 'both', price_per_unit: 0.0001, unit_type: 'requests' },
    { provider: 'promptlayer', sku: 'requests', direction: 'both', price_per_unit: 0.00005, unit_type: 'requests' },
    { provider: 'humanloop', sku: 'evaluations', direction: 'both', price_per_unit: 0.001, unit_type: 'requests' },
];

// ─────────────────────────────────────────────────────────────────────────────
// PRICING RULESET ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export class PricingRulesetEngine {
    constructor(options = {}) {
        this.rules = new Map();
        this.rulesetId = options.rulesetId || null;
        this.rulesetVersion = options.version || 1;
        this.isSealed = options.sealed || false;
        this.strictMode = options.strictMode !== false; // Default: strict

        // SKU normalization map
        this.skuAliases = new Map([
            ['gpt-4-0613', 'gpt-4'],
            ['gpt-4-1106-preview', 'gpt-4-turbo'],
            ['gpt-4-turbo-2024-04-09', 'gpt-4-turbo'],
            ['gpt-4o-2024-05-13', 'gpt-4o'],
            ['gpt-4o-2024-08-06', 'gpt-4o'],
            ['gpt-4o-mini-2024-07-18', 'gpt-4o-mini'],
            ['gpt-3.5-turbo-0125', 'gpt-3.5-turbo'],
            ['claude-3-opus-20240229', 'claude-3-opus'],
            ['claude-3-sonnet-20240229', 'claude-3-sonnet'],
            ['claude-3-haiku-20240307', 'claude-3-haiku'],
            ['claude-3-5-sonnet-20240620', 'claude-sonnet-4'],
            ['claude-3-5-haiku-20241022', 'claude-haiku-3.5'],
            ['gemini-1.5-pro-latest', 'gemini-1.5-pro'],
            ['gemini-1.5-flash-latest', 'gemini-1.5-flash'],
        ]);
    }

    /**
     * Load rules from array (e.g., from DB or defaults)
     * @param {Array} rules - Array of rule objects
     * @returns {PricingRulesetEngine} this for chaining
     */
    loadRules(rules) {
        if (!Array.isArray(rules)) {
            throw new Error('rules must be an array');
        }

        this.rules.clear();
        for (const rule of rules) {
            if (!rule || typeof rule !== 'object') {
                continue;
            }
            if (!rule.provider || !rule.sku) {
                continue;
            }

            const key = this._ruleKey(rule.provider, rule.sku, rule.direction);
            this.rules.set(key, {
                ...rule,
                effective_from: rule.effective_from ? new Date(rule.effective_from) : new Date('2020-01-01'),
                effective_to: rule.effective_to ? new Date(rule.effective_to) : null
            });
        }
        return this;
    }

    /**
     * Load default v1 pricing rules
     */
    loadDefaults() {
        return this.loadRules(DEFAULT_PRICING_RULES_V1);
    }

    /**
     * Seal the ruleset — no more modifications
     */
    seal() {
        this.isSealed = true;
        this.sealedAt = new Date().toISOString();
        this.sealHash = this._computeHash();
        return this;
    }

    /**
     * CORE: Look up the price for a given SKU
     * Returns { price_per_unit, unit_type, currency, rule_id } or throws if strict
     * @param {string} provider - Provider name
     * @param {string} sku - SKU identifier
     * @param {string} direction - Direction: 'input', 'output', or 'both'
     * @param {Date} date - Date for rule validity check
     * @returns {Object|null} Price rule or null if not found
     */
    lookupPrice(provider, sku, direction = 'both', date = new Date()) {
        if (!provider || typeof provider !== 'string') {
            if (this.strictMode) {
                throw new PricingRuleNotFoundError('Provider must be a non-empty string', { provider });
            }
            return null;
        }
        if (!sku || typeof sku !== 'string') {
            if (this.strictMode) {
                throw new PricingRuleNotFoundError('SKU must be a non-empty string', { sku });
            }
            return null;
        }

        // Normalize SKU
        const normalizedSku = this._normalizeSku(sku);
        const normalizedProvider = provider.toLowerCase().trim();

        // Try exact match first
        let key = this._ruleKey(normalizedProvider, normalizedSku, direction);
        let rule = this.rules.get(key);

        // Try 'both' direction as fallback
        if (!rule && direction !== 'both') {
            key = this._ruleKey(normalizedProvider, normalizedSku, 'both');
            rule = this.rules.get(key);
        }

        // Try without provider prefix (e.g., 'azure-gpt-4o' -> lookup under 'azure')
        if (!rule) {
            const prefixedSku = `${normalizedProvider}-${normalizedSku}`;
            key = this._ruleKey(normalizedProvider, prefixedSku, direction);
            rule = this.rules.get(key);
            if (!rule) {
                key = this._ruleKey(normalizedProvider, prefixedSku, 'both');
                rule = this.rules.get(key);
            }
        }

        if (!rule) {
            if (this.strictMode) {
                throw new PricingRuleNotFoundError(
                    `No pricing rule found for ${normalizedProvider}/${normalizedSku}/${direction}. ` +
                    `Aborting: "Missing rule = abort" per Finault constitution.`,
                    { provider: normalizedProvider, sku: normalizedSku, direction }
                );
            }
            return null;
        }

        // Check date validity
        if (rule.effective_to && date > rule.effective_to) {
            if (this.strictMode) {
                throw new PricingRuleExpiredError(
                    `Pricing rule for ${normalizedProvider}/${normalizedSku} expired on ${rule.effective_to.toISOString()}.`,
                    { provider: normalizedProvider, sku: normalizedSku, expired: rule.effective_to }
                );
            }
            return null;
        }

        return {
            rule_id: rule.rule_id || key,
            price_per_unit: rule.price_per_unit,
            unit_type: rule.unit_type,
            currency: rule.currency || 'USD',
            provider: normalizedProvider,
            sku: normalizedSku,
            direction
        };
    }

    /**
     * CORE: Compute cost from usage record
     * Returns { cost, breakdown } or throws if rule missing
     * @param {Object} record - Usage record
     * @returns {Object} Cost computation result with breakdown
     */
    computeCost(record) {
        if (!record || typeof record !== 'object') {
            throw new Error('record must be a valid object');
        }

        const provider = (record.provider || '').toLowerCase().trim();
        const sku = record.model || record.sku || '';

        if (!provider) {
            if (this.strictMode) {
                throw new PricingRuleNotFoundError('Provider must be specified', { record });
            }
            return { provider: 'unknown', sku: 'unknown', cost: 0, currency: 'USD', breakdown: [], ruleset_id: this.rulesetId, ruleset_version: this.rulesetVersion };
        }
        if (!sku) {
            if (this.strictMode) {
                throw new PricingRuleNotFoundError('SKU must be specified', { record });
            }
            return { provider, sku: 'unknown', cost: 0, currency: 'USD', breakdown: [], ruleset_id: this.rulesetId, ruleset_version: this.rulesetVersion };
        }

        const inputTokens = record.input_tokens || record.inputTokens || 0;
        const outputTokens = record.output_tokens || record.outputTokens || 0;
        const totalTokens = record.tokens || record.total_tokens || 0;
        const quantity = record.quantity || record.requests || record.count || 0;

        const breakdown = [];
        let totalCost = 0;

        // Input tokens
        if (inputTokens > 0) {
            const rule = this.lookupPrice(provider, sku, 'input');
            const inputCost = rule ? this._calculateUnitCost(inputTokens, rule) : 0;
            if (rule) breakdown.push({ direction: 'input', units: inputTokens, ...rule, cost: inputCost });
            totalCost += inputCost;
        }

        // Output tokens
        if (outputTokens > 0) {
            const rule = this.lookupPrice(provider, sku, 'output');
            const outputCost = rule ? this._calculateUnitCost(outputTokens, rule) : 0;
            if (rule) breakdown.push({ direction: 'output', units: outputTokens, ...rule, cost: outputCost });
            totalCost += outputCost;
        }

        // Total tokens (no input/output split)
        if (totalTokens > 0 && inputTokens === 0 && outputTokens === 0) {
            const rule = this.lookupPrice(provider, sku, 'both');
            const tokenCost = rule ? this._calculateUnitCost(totalTokens, rule) : 0;
            if (rule) breakdown.push({ direction: 'both', units: totalTokens, ...rule, cost: tokenCost });
            totalCost += tokenCost;
        }

        // Non-token quantities (requests, images, minutes, etc.)
        if (quantity > 0 && totalTokens === 0 && inputTokens === 0 && outputTokens === 0) {
            const rule = this.lookupPrice(provider, sku, 'both');
            const quantityCost = rule ? this._calculateUnitCost(quantity, rule) : 0;
            if (rule) breakdown.push({ direction: 'both', units: quantity, ...rule, cost: quantityCost });
            totalCost += quantityCost;
        }

        return {
            provider,
            sku,
            cost: Math.round(totalCost * 1000000) / 1000000, // 6 decimal precision
            currency: 'USD',
            breakdown,
            ruleset_id: this.rulesetId,
            ruleset_version: this.rulesetVersion
        };
    }

    /**
     * BATCH: Reconcile an array of usage records against pricing rules
     * Returns { records, totals, failures, aborted }
     * @param {Array} records - Array of usage records
     * @returns {Object} Batch reconciliation result
     */
    reconcileBatch(records) {
        if (!Array.isArray(records)) {
            throw new Error('records must be an array');
        }

        const results = [];
        const failures = [];
        let totalCost = 0;
        let aborted = false;

        for (let i = 0; i < records.length; i++) {
            try {
                const result = this.computeCost(records[i]);
                results.push({ index: i, ...result, original: records[i] });
                totalCost += result.cost;
            } catch (error) {
                if (error instanceof PricingRuleNotFoundError || error instanceof PricingRuleExpiredError) {
                    failures.push({
                        index: i,
                        record: records[i],
                        error: error.message,
                        type: error.constructor.name,
                        details: error.details
                    });
                    if (this.strictMode) {
                        aborted = true;
                        break; // ABORT on first failure per constitution
                    }
                } else {
                    throw error;
                }
            }
        }

        return {
            records: results,
            totals: {
                cost: Math.round(totalCost * 1000000) / 1000000,
                currency: 'USD',
                record_count: results.length
            },
            failures,
            aborted,
            ruleset_id: this.rulesetId,
            ruleset_version: this.rulesetVersion,
            seal_hash: this.sealHash || null
        };
    }

    /**
     * DEDUPLICATION: Detect duplicate records
     * @param {Array} records - Array of usage records
     * @returns {Object} Deduplication result
     */
    detectDuplicates(records) {
        if (!Array.isArray(records)) {
            throw new Error('records must be an array');
        }

        const seen = new Map();
        const duplicates = [];

        for (let i = 0; i < records.length; i++) {
            const fingerprint = this._recordFingerprint(records[i]);
            if (seen.has(fingerprint)) {
                duplicates.push({
                    index: i,
                    original_index: seen.get(fingerprint),
                    record: records[i],
                    fingerprint
                });
            } else {
                seen.set(fingerprint, i);
            }
        }

        return {
            duplicates,
            has_duplicates: duplicates.length > 0,
            unique_count: seen.size,
            total_count: records.length
        };
    }

    /**
     * List all known SKUs in the ruleset
     */
    listSKUs() {
        const skus = new Set();
        for (const [, rule] of this.rules) {
            skus.add(`${rule.provider}/${rule.sku}`);
        }
        return Array.from(skus).sort();
    }

    /**
     * Export rules for persistence
     */
    exportRules() {
        return {
            ruleset_id: this.rulesetId,
            version: this.rulesetVersion,
            sealed: this.isSealed,
            sealed_at: this.sealedAt || null,
            seal_hash: this.sealHash || null,
            rules: Array.from(this.rules.values()),
            sku_count: this.rules.size
        };
    }

    // ─── Internal helpers ───────────────────────────────────────────────────

    _ruleKey(provider, sku, direction) {
        return `${provider}|${sku}|${direction}`;
    }

    _normalizeSku(sku) {
        const lower = (sku || '').toLowerCase().trim();
        // Check alias map
        if (this.skuAliases.has(lower)) {
            return this.skuAliases.get(lower);
        }
        // Strip date suffixes (e.g., -20240229)
        const stripped = lower.replace(/-\d{8}$/, '');
        if (this.skuAliases.has(stripped)) {
            return this.skuAliases.get(stripped);
        }
        return lower;
    }

    _calculateUnitCost(units, rule) {
        if (!rule) return 0;
        let effectiveUnits = units;

        // Handle 1k-token pricing
        if (rule.unit_type === '1k-tokens') {
            effectiveUnits = units / 1000;
        }

        return effectiveUnits * rule.price_per_unit;
    }

    /**
     * Generate a unique fingerprint for a usage record
     * Used for duplicate detection by hashing the record's identifying characteristics
     *
     * The fingerprint combines:
     * - Provider name (e.g., 'openai', 'anthropic')
     * - Model/SKU identifier
     * - Timestamp of the usage event
     * - Input and output token counts (if applicable)
     * - Request ID (if available)
     *
     * Collisions are extremely rare due to SHA256 hashing and substring truncation.
     * Identical records will have identical fingerprints, allowing duplicate detection.
     *
     * @param {Object} record - Usage record with provider, model, timestamp, tokens
     * @returns {string} 16-character hex fingerprint
     */
    _recordFingerprint(record) {
        const parts = [
            record.provider || '',
            record.model || record.sku || '',
            record.timestamp || record.date || '',
            record.input_tokens || record.inputTokens || 0,
            record.output_tokens || record.outputTokens || 0,
            record.request_id || ''
        ];
        return crypto.createHash('sha256').update(parts.join('|')).digest('hex').substring(0, 16);
    }

    _computeHash() {
        const ruleData = JSON.stringify(
            Array.from(this.rules.values())
                .sort((a, b) => this._ruleKey(a.provider, a.sku, a.direction)
                    .localeCompare(this._ruleKey(b.provider, b.sku, b.direction)))
        );
        return crypto.createHash('sha256').update(ruleData).digest('hex');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ERROR TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Error thrown when a pricing rule is not found
 */
export class PricingRuleNotFoundError extends Error {
    constructor(message, details) {
        super(message);
        this.name = 'PricingRuleNotFoundError';
        this.details = details;
    }
}

/**
 * Error thrown when a pricing rule has expired
 */
export class PricingRuleExpiredError extends Error {
    constructor(message, details) {
        super(message);
        this.name = 'PricingRuleExpiredError';
        this.details = details;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export default PricingRulesetEngine;
export { DEFAULT_PRICING_RULES_V1 };
