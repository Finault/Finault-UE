/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * W-009: TOKEN ESTIMATION AND CALIBRATION
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Fixes naive `prompt.length / 4` token estimation that breaks budget enforcement.
 *
 * Features:
 * - Content-type-aware estimation (JSON, code, CJK, prose, mixed)
 * - Provider-specific tokenizer ratios (OpenAI ≈ 4 chars/token, Anthropic ≈ 3.5)
 * - Image token cost formulas per provider
 * - Post-flight tracking: estimate vs actual from API response
 * - Auto-calibrating ratio that adjusts based on historical accuracy
 * - 15% safety margin for budget decisions
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─── Constants ───────────────────────────────────────────────────────────────

export const TOKEN_ESTIMATOR_CONFIG = {
    provider: {
        openai: { baseRatio: 4.0, name: 'OpenAI cl100k_base' },
        anthropic: { baseRatio: 3.5, name: 'Anthropic Claude tokenizer' },
        default: { baseRatio: 3.8, name: 'Generic tokenizer' }
    },
    contentType: {
        json: { multiplier: 0.6, description: 'JSON structural chars inflate token count' },
        code: { multiplier: 0.7, description: 'Code has variable token density' },
        cjk: { multiplier: 0.35, description: 'CJK characters ≈ 2-3 tokens each' },
        prose_en: { multiplier: 1.0, description: 'English prose baseline' },
        mixed: { multiplier: 0.8, description: 'Mixed content weighted average' }
    },
    image: {
        openai: {
            low: 85,
            high: { base: 170, per_512px: 130 }
        },
        anthropic: {
            standard: { base: 1100, per_mib: 40 }
        },
        default: { standard: 500 }
    },
    safety: {
        margin: 1.15,       // 15% buffer for budget decisions
        minRatio: 2.5,      // Never let calibration go below this
        maxRatio: 6.0       // Never let calibration go above this
    },
    calibration: {
        minSamples: 5,      // Need 5+ samples before using calibrated ratio
        maxHistory: 100     // Keep last 100 records per model+contentType
    }
};

// Centralized pricing table (extracted from budget-enforcer.js)
export const PRICING = {
    'gpt-4': { input: 0.03, output: 0.06 },
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'gpt-4o': { input: 0.005, output: 0.015 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
    'claude-3-opus': { input: 0.015, output: 0.075 },
    'claude-3-sonnet': { input: 0.003, output: 0.015 },
    'claude-3-haiku': { input: 0.00025, output: 0.00125 },
    'claude-sonnet-4': { input: 0.003, output: 0.015 },
    'claude-opus-4': { input: 0.015, output: 0.075 }
};

// Content type detection thresholds
const DETECTION_THRESHOLDS = {
    json: 0.15,       // 15%+ structural JSON chars
    code: 0.12,       // 12%+ code-specific chars/keywords
    cjk: 0.10,        // 10%+ CJK characters
    prose_en: 0.80    // 80%+ ASCII with prose patterns
};

// ─── TokenEstimator Class ────────────────────────────────────────────────────

export class TokenEstimator {

    constructor() {
        // Calibration history: Map<string, Array<{estimated, actual}>>
        // Key format: "model:contentType" e.g. "claude-sonnet-4:json"
        this.calibrationHistory = new Map();
    }

    /**
     * Estimate tokens for a text with content-type awareness.
     *
     * Algorithm:
     * 1. Detect content type
     * 2. Get provider-specific base ratio
     * 3. Check for calibrated ratio from history
     * 4. Apply content type multiplier
     * 5. Calculate: tokens = text.length / (ratio * multiplier)
     * 6. Apply safety margin
     *
     * @param {string} text - Input text to estimate
     * @param {string} [model='gpt-4'] - Model identifier
     * @returns {number} - Estimated token count (with safety margin)
     */
    estimateTokens(text, model = 'gpt-4') {
        if (!text || text.length === 0) return 1; // Minimum 1 token

        const contentType = this.detectContentType(text);
        const ratio = this.getCalibrationRatio(model, contentType);
        const multiplier = TOKEN_ESTIMATOR_CONFIG.contentType[contentType]?.multiplier || 1.0;

        // Effective chars per token = ratio * multiplier
        // Lower multiplier = MORE tokens per char (e.g., JSON at 0.6 → more tokens)
        const effectiveRatio = ratio * multiplier;
        const rawTokens = Math.ceil(text.length / effectiveRatio);

        // Apply safety margin
        return Math.ceil(rawTokens * TOKEN_ESTIMATOR_CONFIG.safety.margin);
    }

    /**
     * Classify text into a content type category.
     *
     * Detection rules (checked in priority order):
     * 1. JSON: high ratio of structural chars ({, }, [, ], :, ")
     * 2. Code: high ratio of code-specific chars/patterns
     * 3. CJK: significant CJK character presence
     * 4. English prose: high ASCII with natural language patterns
     * 5. Mixed: fallback
     *
     * @param {string} text - Text to classify
     * @returns {string} - 'json' | 'code' | 'cjk' | 'prose_en' | 'mixed'
     */
    detectContentType(text) {
        if (!text || text.length === 0) return 'mixed';

        const len = text.length;

        // Count JSON structural characters: {, }, [, ], :, "
        const jsonChars = (text.match(/[{}\[\]:,"]/g) || []).length;
        const jsonRatio = jsonChars / len;

        if (jsonRatio >= DETECTION_THRESHOLDS.json) {
            // Additional check: try to detect if it looks like actual JSON
            const trimmed = text.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[') || jsonRatio >= 0.20) {
                return 'json';
            }
        }

        // Count code-specific patterns: ;, =>, ==, !=, {}, (), function/if/for/while/return/const/let/var
        const codePatterns = (text.match(/[;=><!&|]{1,3}|function\s|if\s*\(|for\s*\(|while\s*\(|return\s|const\s|let\s|var\s|import\s|export\s|class\s/g) || []).length;
        const codeRatio = codePatterns / (len / 10); // Normalize to patterns per 10 chars

        if (codeRatio >= DETECTION_THRESHOLDS.code) {
            return 'code';
        }

        // Count CJK characters (Unicode ranges for CJK Unified Ideographs + common extensions)
        const cjkChars = (text.match(/[\u4E00-\u9FFF\u3400-\u4DBF\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/g) || []).length;
        const cjkRatio = cjkChars / len;

        if (cjkRatio >= DETECTION_THRESHOLDS.cjk) {
            return 'cjk';
        }

        // Check for English prose: high ASCII ratio with spaces and sentences
        const asciiChars = (text.match(/[\x20-\x7E]/g) || []).length;
        const asciiRatio = asciiChars / len;
        const hasSpaces = (text.match(/\s/g) || []).length / len > 0.10;

        if (asciiRatio >= DETECTION_THRESHOLDS.prose_en && hasSpaces) {
            return 'prose_en';
        }

        return 'mixed';
    }

    /**
     * Get chars-per-token ratio for a model's provider.
     *
     * @param {string} model - Model identifier (e.g., 'claude-sonnet-4', 'gpt-4o')
     * @returns {number} - Base ratio for the provider
     */
    getProviderRatio(model) {
        if (!model) return TOKEN_ESTIMATOR_CONFIG.provider.default.baseRatio;

        const normalized = model.toLowerCase();

        if (normalized.startsWith('gpt-') || normalized.startsWith('o1') || normalized.startsWith('o3')) {
            return TOKEN_ESTIMATOR_CONFIG.provider.openai.baseRatio;
        }

        if (normalized.startsWith('claude')) {
            return TOKEN_ESTIMATOR_CONFIG.provider.anthropic.baseRatio;
        }

        return TOKEN_ESTIMATOR_CONFIG.provider.default.baseRatio;
    }

    /**
     * Get calibrated ratio based on historical accuracy.
     *
     * Uses recordActual() history to compute average chars-per-token for
     * a specific model+contentType combination.
     *
     * @param {string} model - Model identifier
     * @param {string} contentType - Content type from detectContentType()
     * @returns {number} - Calibrated ratio (or base ratio if insufficient history)
     */
    getCalibrationRatio(model, contentType) {
        const baseRatio = this.getProviderRatio(model);
        const key = `${(model || 'default').toLowerCase()}:${contentType || 'mixed'}`;
        const history = this.calibrationHistory.get(key);

        if (!history || history.length < TOKEN_ESTIMATOR_CONFIG.calibration.minSamples) {
            return baseRatio;
        }

        // Compute average ratio from history
        // ratio = sum(charCount / actualTokens) / count
        const avgRatio = history.reduce((sum, h) => {
            if (h.actualTokens > 0) {
                return sum + (h.charCount / h.actualTokens);
            }
            return sum + baseRatio;
        }, 0) / history.length;

        // Clamp to safety bounds
        return Math.max(
            TOKEN_ESTIMATOR_CONFIG.safety.minRatio,
            Math.min(TOKEN_ESTIMATOR_CONFIG.safety.maxRatio, avgRatio)
        );
    }

    /**
     * Estimate token cost for images.
     *
     * OpenAI formulas:
     *   low detail: 85 tokens
     *   high detail: 170 base + ceil(width/512) * ceil(height/512) * 130
     *
     * Anthropic:
     *   standard: 1100 + (fileSizeMiB * 40)
     *
     * @param {string} [imageDetail='low'] - 'low' or 'high'
     * @param {Object} [dimensions] - { width, height } in pixels
     * @param {string} [model=''] - Model identifier for provider detection
     * @returns {number} - Estimated tokens for the image
     */
    estimateImageTokens(imageDetail = 'low', dimensions = null, model = '', fileSizeMiB = 0) {
        const normalized = (model || '').toLowerCase();

        // OpenAI
        if (normalized.startsWith('gpt-') || normalized.startsWith('o1') || normalized.startsWith('o3')) {
            if (imageDetail === 'low') {
                return TOKEN_ESTIMATOR_CONFIG.image.openai.low;
            }
            // High detail
            if (dimensions && dimensions.width && dimensions.height) {
                const squares = Math.ceil(dimensions.width / 512) * Math.ceil(dimensions.height / 512);
                return TOKEN_ESTIMATOR_CONFIG.image.openai.high.base +
                       squares * TOKEN_ESTIMATOR_CONFIG.image.openai.high.per_512px;
            }
            // Default high detail without dimensions (assume 1024x1024)
            return TOKEN_ESTIMATOR_CONFIG.image.openai.high.base +
                   4 * TOKEN_ESTIMATOR_CONFIG.image.openai.high.per_512px;
        }

        // Anthropic — Pass 21: Include file size component (base + fileSizeMiB * per_mib)
        if (normalized.startsWith('claude')) {
            const base = TOKEN_ESTIMATOR_CONFIG.image.anthropic.standard.base;
            const perMiB = TOKEN_ESTIMATOR_CONFIG.image.anthropic.standard.per_mib;
            const fileSize = Math.max(0, fileSizeMiB || 0);
            return base + Math.ceil(fileSize * perMiB);
        }

        // Default
        return TOKEN_ESTIMATOR_CONFIG.image.default.standard;
    }

    /**
     * Record actual token usage after API call for calibration.
     *
     * @param {string} requestId - Unique request identifier
     * @param {number} estimatedTokens - What we estimated
     * @param {number} actualTokens - What API reported
     * @param {string} contentType - Content type detected
     * @param {string} model - Model used
     * @param {number} [charCount] - Character count of prompt
     */
    recordActual(requestId, estimatedTokens, actualTokens, contentType, model, charCount = 0) {
        if (!actualTokens || actualTokens <= 0) return;

        const key = `${(model || 'default').toLowerCase()}:${contentType || 'mixed'}`;

        if (!this.calibrationHistory.has(key)) {
            this.calibrationHistory.set(key, []);
        }

        const history = this.calibrationHistory.get(key);
        history.push({
            requestId,
            estimatedTokens,
            actualTokens,
            charCount: charCount || 0,
            timestamp: Date.now()
        });

        // Trim to maxHistory
        const maxH = TOKEN_ESTIMATOR_CONFIG.calibration.maxHistory;
        if (history.length > maxH) {
            history.splice(0, history.length - maxH);
        }
    }

    /**
     * Estimate full cost for a request (replaces budget-enforcer.js estimateRequestCost).
     *
     * @param {Object} request - { prompt, max_tokens, model, [images] }
     * @returns {Object} { inputTokens, outputTokens, estimatedCost, withSafetyMargin, contentType }
     */
    estimateCost(request) {
        const model = (request.model || 'gpt-4').toLowerCase();
        const promptText = request.prompt || '';
        const maxTokens = request.max_tokens || 1000;

        // Estimate input tokens
        const inputTokens = this.estimateTokens(promptText, model);
        const contentType = this.detectContentType(promptText);

        // Add image tokens if present
        let imageTokens = 0;
        if (request.images && Array.isArray(request.images)) {
            for (const img of request.images) {
                imageTokens += this.estimateImageTokens(
                    img.detail || 'low',
                    img.dimensions || null,
                    model,
                    img.fileSizeMiB || 0
                );
            }
        }

        const totalInputTokens = inputTokens + imageTokens;

        // Output tokens: use max_tokens as upper bound
        const outputTokens = maxTokens;

        // Get pricing
        const modelPricing = PRICING[model] || PRICING['gpt-4'];

        // Calculate cost
        // Pass 21: Safety margin is already applied to inputTokens via estimateTokens().
        // Only apply margin to output-side cost to avoid double-margining inputs.
        const inputCost = totalInputTokens / 1000 * modelPricing.input;
        const outputCost = outputTokens / 1000 * modelPricing.output;
        const estimatedCost = inputCost + outputCost;

        // Input already has 15% margin from estimateTokens(); add 15% to output only
        const withSafetyMargin = inputCost + (outputCost * TOKEN_ESTIMATOR_CONFIG.safety.margin);

        return {
            inputTokens: totalInputTokens,
            outputTokens,
            estimatedCost,
            withSafetyMargin,
            contentType
        };
    }

    /**
     * Get calibration statistics for diagnostics.
     *
     * @returns {Object} Map of model:contentType → { count, avgRatio, accuracy }
     */
    getCalibrationStats() {
        const stats = {};
        for (const [key, history] of this.calibrationHistory.entries()) {
            const withActuals = history.filter(h => h.actualTokens > 0 && h.charCount > 0);
            if (withActuals.length === 0) continue;

            const avgRatio = withActuals.reduce((sum, h) => sum + h.charCount / h.actualTokens, 0) / withActuals.length;
            const avgAccuracy = withActuals.reduce((sum, h) => {
                if (h.estimatedTokens === 0) return sum;
                return sum + Math.min(h.estimatedTokens, h.actualTokens) / Math.max(h.estimatedTokens, h.actualTokens);
            }, 0) / withActuals.length;

            stats[key] = {
                count: history.length,
                avgRatio: Math.round(avgRatio * 100) / 100,
                accuracy: Math.round(avgAccuracy * 100) / 100
            };
        }
        return stats;
    }
}

// ─── Factory Function ────────────────────────────────────────────────────────

export function createTokenEstimator() {
    return new TokenEstimator();
}
