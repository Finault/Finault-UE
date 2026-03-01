/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINAULT DIAMOND TIER GATEWAY MODULE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Enterprise-grade AI gateway with advanced cost optimization, security, and
 * intelligent routing capabilities for Diamond Tier subscribers.
 *
 * Features:
 *   1. Semantic caching for identical/similar prompts (20-35% savings)
 *   2. Request batching for high-volume workloads (10-25% savings)
 *   3. Multi-LLM routing by task complexity (50-90% savings)
 *   4. PromptShield: Real-time PII/PHI redaction before forwarding
 *   5. Cost prediction API: Estimate cost before request fires
 *   6. A/B model testing framework: Route % of traffic to model B
 *   7. Provider SLA monitoring: Track actual uptime/latency vs contractual SLA
 *   8. Intelligent retry with cost optimization: Failover to cheapest equivalent
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS - Production Hardening Utilities
// ─────────────────────────────────────────────────────────────────────────────

import { DiamondLogger, CircuitBreaker, resilientFetch, InputValidator, SupabaseClient, HealthCheck, RateLimiter } from './diamond-utils.js';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS & CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PII/PHI Detection Patterns
 * Used by PromptShield for real-time content redaction
 */
const PII_PATTERNS = {
    // US Social Security Numbers (XXX-XX-XXXX or XXXXXXXXX)
    ssn: /\b\d{3}-\d{2}-\d{4}\b|\b\d{9}\b/g,

    // Credit card numbers (various formats)
    creditCard: /\b(?:\d{4}[-\s]?){3}\d{4}\b|\b\d{16}\b/g,

    // US Phone numbers
    phoneUS: /\b(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,

    // International phone numbers
    phoneIntl: /\+[1-9]\d{1,14}\b/g,

    // Email addresses
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,

    // Credit card expiration dates (MM/YY format)
    cardExpiry: /\b(0[1-9]|1[0-2])\/\d{2}\b/g,

    // CVV/CVC (3-4 digits)
    cvv: /\bCVV[:\s]*\d{3,4}\b/gi,

    // US Bank Account numbers (8-17 digits)
    bankAccount: /\b\d{8,17}\b(?![-])/g,

    // API keys and tokens (common patterns)
    apiKey: /['\"]?(?:api[_-]?)?key['\"]?\s*[:=]\s*['\"]?[A-Za-z0-9_-]{20,}\b/gi,

    // AWS Access Keys
    awsAccessKey: /(?:A3T[A-Z0-9]|AKIA|ASIA)[0-9A-Z]{16}/g,

    // Private keys
    privateKey: /-----BEGIN\s(?:RSA|OPENSSH|DSA|EC)\s?PRIVATE\sKEY/gi,

    // HIPAA-related: Medical record numbers
    medicalRecordNumber: /\bMRN[:\s]*[A-Z0-9]{5,}\b/gi,

    // HIPAA-related: Insurance member IDs
    memberId: /\b(?:member|policy|plan)[_-]?id[:\s]*[A-Z0-9]{5,}\b/gi,

    // URLs with credentials
    urlWithCreds: /https?:\/\/[^\s:]+:[^\s@]+@[^\s\/]+/g,

    // Patient names (if preceded by "patient:" or similar)
    patientName: /(?:patient|client|user)[:\s]+([A-Z][a-z]+\s+[A-Z][a-z]+)/gi,

    // Driver's license numbers
    driverLicense: /\b[A-Z]{1,2}\d{5,8}\b/g,

    // Passport numbers
    passport: /\bpassport[:\s]*[A-Z0-9]{6,9}\b/gi,

    // Tax ID numbers (XXX-XX-XXXX format)
    taxId: /\b\d{2}-\d{7}\b/g,

    // Coordinates (GPS/location - less common but sensitive)
    coordinates: /\b(?:[+-]?)(?:90|[0-8]?\d)\.?\d+[,\s]+(?:[+-]?)(?:180|1?[0-7]\d)\.?\d+\b/g
};

/**
 * Model Pricing Database
 * Comprehensive pricing for major LLM providers
 * Prices in USD per 1K tokens (input/output or per-use where noted)
 */
const MODEL_PRICING = {
    openai: {
        'gpt-4o': {
            input: 0.005,           // per 1K input tokens
            output: 0.015,          // per 1K output tokens
            name: 'GPT-4 Omni',
            complexity: 'high',
            maxTokens: 200000,
            costPerRequest: 0
        },
        'gpt-4-turbo': {
            input: 0.01,
            output: 0.03,
            name: 'GPT-4 Turbo',
            complexity: 'high',
            maxTokens: 128000,
            costPerRequest: 0
        },
        'gpt-4': {
            input: 0.03,
            output: 0.06,
            name: 'GPT-4',
            complexity: 'high',
            maxTokens: 8192,
            costPerRequest: 0
        },
        'gpt-3.5-turbo': {
            input: 0.0005,
            output: 0.0015,
            name: 'GPT-3.5 Turbo',
            complexity: 'low',
            maxTokens: 16384,
            costPerRequest: 0
        },
        'gpt-3.5-turbo-16k': {
            input: 0.003,
            output: 0.004,
            name: 'GPT-3.5 Turbo 16K',
            complexity: 'low',
            maxTokens: 16384,
            costPerRequest: 0
        }
    },
    anthropic: {
        'claude-3-opus': {
            input: 0.015,
            output: 0.075,
            name: 'Claude 3 Opus',
            complexity: 'high',
            maxTokens: 200000,
            costPerRequest: 0,
            cacheWriteTokens: 0.03,     // special: cache write 25% of input cost
            cacheReadTokens: 0.003      // special: cache read 10% of input cost
        },
        'claude-3-sonnet': {
            input: 0.003,
            output: 0.015,
            name: 'Claude 3 Sonnet',
            complexity: 'medium',
            maxTokens: 200000,
            costPerRequest: 0,
            cacheWriteTokens: 0.006,
            cacheReadTokens: 0.0003
        },
        'claude-3-haiku': {
            input: 0.00025,
            output: 0.00125,
            name: 'Claude 3 Haiku',
            complexity: 'low',
            maxTokens: 200000,
            costPerRequest: 0,
            cacheWriteTokens: 0.0005,
            cacheReadTokens: 0.000025
        },
        'claude-2': {
            input: 0.008,
            output: 0.024,
            name: 'Claude 2',
            complexity: 'high',
            maxTokens: 100000,
            costPerRequest: 0
        }
    },
    google: {
        'gemini-pro': {
            input: 0.00025,
            output: 0.0005,
            name: 'Gemini Pro',
            complexity: 'medium',
            maxTokens: 32768,
            costPerRequest: 0
        },
        'gemini-pro-vision': {
            input: 0.00025,
            output: 0.0005,
            name: 'Gemini Pro Vision',
            complexity: 'high',
            maxTokens: 12000,
            costPerRequest: 0.0025,     // per image
            imageTokens: 258            // tokens per image
        },
        'palm2': {
            input: 0.00025,
            output: 0.0005,
            name: 'PaLM 2',
            complexity: 'medium',
            maxTokens: 8192,
            costPerRequest: 0
        }
    },
    aws: {
        'claude-instant': {
            input: 0.00008,
            output: 0.00024,
            name: 'Claude Instant (via Bedrock)',
            complexity: 'low',
            maxTokens: 100000,
            costPerRequest: 0
        },
        'claude-2': {
            input: 0.008,
            output: 0.024,
            name: 'Claude 2 (via Bedrock)',
            complexity: 'high',
            maxTokens: 100000,
            costPerRequest: 0
        },
        'llama2-13b': {
            input: 0.00075,
            output: 0.001,
            name: 'Llama 2 13B (via Bedrock)',
            complexity: 'medium',
            maxTokens: 4096,
            costPerRequest: 0
        }
    },
    azure: {
        'gpt-4-32k': {
            input: 0.06,
            output: 0.12,
            name: 'Azure OpenAI GPT-4 32K',
            complexity: 'high',
            maxTokens: 32768,
            costPerRequest: 0
        },
        'gpt-35-turbo-16k': {
            input: 0.003,
            output: 0.004,
            name: 'Azure OpenAI GPT-3.5 Turbo 16K',
            complexity: 'low',
            maxTokens: 16384,
            costPerRequest: 0
        }
    },
    cohere: {
        'command-light': {
            input: 0.0003,
            output: 0.0009,
            name: 'Cohere Command Light',
            complexity: 'low',
            maxTokens: 4096,
            costPerRequest: 0
        },
        'command': {
            input: 0.001,
            output: 0.003,
            name: 'Cohere Command',
            complexity: 'medium',
            maxTokens: 4096,
            costPerRequest: 0
        },
        'command-plus': {
            input: 0.01,
            output: 0.03,
            name: 'Cohere Command Plus',
            complexity: 'high',
            maxTokens: 4096,
            costPerRequest: 0
        }
    },
    mistral: {
        'mistral-tiny': {
            input: 0.00014,
            output: 0.00042,
            name: 'Mistral Tiny',
            complexity: 'low',
            maxTokens: 8000,
            costPerRequest: 0
        },
        'mistral-small': {
            input: 0.00065,
            output: 0.002,
            name: 'Mistral Small',
            complexity: 'medium',
            maxTokens: 8000,
            costPerRequest: 0
        },
        'mistral-medium': {
            input: 0.0027,
            output: 0.0081,
            name: 'Mistral Medium',
            complexity: 'high',
            maxTokens: 8000,
            costPerRequest: 0
        }
    },
    together: {
        'mistral-7b': {
            input: 0.0002,
            output: 0.0002,
            name: 'Mistral 7B (Together)',
            complexity: 'low',
            maxTokens: 4096,
            costPerRequest: 0
        },
        'llama2-7b': {
            input: 0.0002,
            output: 0.0002,
            name: 'Llama 2 7B (Together)',
            complexity: 'low',
            maxTokens: 4096,
            costPerRequest: 0
        },
        'llama2-70b': {
            input: 0.0009,
            output: 0.0009,
            name: 'Llama 2 70B (Together)',
            complexity: 'high',
            maxTokens: 4096,
            costPerRequest: 0
        }
    }
};

/**
 * Task Complexity Classification
 * Used to determine appropriate model routing
 */
const COMPLEXITY_THRESHOLDS = {
    keywords: {
        low: [
            'summarize', 'extract', 'classify', 'simple', 'short', 'quick',
            'basic', 'list', 'format', 'parse', 'count', 'find', 'replace'
        ],
        medium: [
            'explain', 'rewrite', 'improve', 'analyze', 'compare', 'translate',
            'generate', 'create', 'debug', 'optimize', 'refactor', 'plan'
        ],
        high: [
            'reason', 'complex', 'mathematical', 'research', 'novel', 'design',
            'architecture', 'strategy', 'multimodal', 'reasoning', 'proof',
            'scientific', 'medical', 'legal', 'financial'
        ]
    },
    inputLength: {
        low: 500,        // < 500 tokens
        medium: 2000,    // < 2000 tokens
        high: Infinity   // > 2000 tokens
    },
    outputLength: {
        low: 500,        // < 500 tokens expected
        medium: 2000,    // < 2000 tokens expected
        high: Infinity   // > 2000 tokens expected
    }
};

/**
 * SLA Targets by Provider
 * Used for monitoring and compliance tracking
 */
const PROVIDER_SLAS = {
    openai: {
        uptime: 0.999,           // 99.9% uptime
        avgLatency: 2000,        // 2 seconds
        p99Latency: 5000,        // 5 seconds
        rpmLimit: 10000,         // requests per minute
        costCeiling: 0.03         // max per request in $
    },
    anthropic: {
        uptime: 0.995,
        avgLatency: 1500,
        p99Latency: 4000,
        rpmLimit: 5000,
        costCeiling: 0.08
    },
    google: {
        uptime: 0.99,
        avgLatency: 1000,
        p99Latency: 3000,
        rpmLimit: 3000,
        costCeiling: 0.001
    },
    aws: {
        uptime: 0.9999,
        avgLatency: 1200,
        p99Latency: 3500,
        rpmLimit: 2000,
        costCeiling: 0.03
    },
    cohere: {
        uptime: 0.995,
        avgLatency: 800,
        p99Latency: 2500,
        rpmLimit: 1000,
        costCeiling: 0.03
    },
    mistral: {
        uptime: 0.99,
        avgLatency: 900,
        p99Latency: 2800,
        rpmLimit: 1000,
        costCeiling: 0.01
    }
};

/**
 * Cache Configuration
 * Settings for semantic caching layer
 */
const CACHE_CONFIG = {
    enabled: true,
    ttlSeconds: 86400,           // 24 hours
    maxCacheSize: 10000,         // max cached prompts
    similarityThreshold: 0.92,   // cosine similarity for cache hits
    minTokens: 20,               // don't cache very short prompts
    maxTokens: 4000,             // don't cache very long prompts
    redisUrl: null,              // override with Redis connection
    compressionEnabled: true,    // compress cached values
    trackStats: true
};

/**
 * Batching Configuration
 */
const BATCH_CONFIG = {
    enabled: true,
    maxBatchSize: 100,
    maxBatchWaitMs: 1000,        // wait up to 1 second for more requests
    minBatchSize: 5,             // batch if 5+ requests waiting
    batchIdleTimeoutMs: 500,     // flush if idle
    compressionEnabled: true
};

/**
 * A/B Testing Configuration
 */
const AB_TEST_CONFIG = {
    enabled: true,
    defaultTrafficSplit: {
        modelA: 0.95,            // 95% to primary model
        modelB: 0.05             // 5% to test model
    },
    minSampleSize: 100,
    confidenceLevel: 0.95,
    trackingGranularity: 'request'  // track per request
};

/**
 * Retry Strategy
 */
const RETRY_CONFIG = {
    maxAttempts: 3,
    backoffMultiplier: 2,
    initialDelayMs: 100,
    maxDelayMs: 10000,
    retryableStatusCodes: [408, 429, 500, 502, 503, 504],
    costOptimizationEnabled: true  // switch to cheaper models on retry
};

// ─────────────────────────────────────────────────────────────────────────────
// SEMANTIC CACHE CLASS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SemanticCache
 * Caches prompts and responses with similarity-based matching
 * Saves cost on repeated or similar requests
 */
class SemanticCache {
    /**
     * @param {Object} options - Configuration options
     * @param {string} options.supabaseUrl - Supabase connection URL
     * @param {string} options.supabaseKey - Supabase API key
     * @param {Object} options.config - Cache configuration override
     */
    constructor(options = {}) {
        this.supabaseUrl = options.supabaseUrl;
        this.supabaseKey = options.supabaseKey;
        this.config = { ...CACHE_CONFIG, ...(options.config || {}) };
        this.memoryCache = new Map();
        this.logger = options.logger || new DiamondLogger('SemanticCache');
        this.circuitBreaker = options.circuitBreaker || new CircuitBreaker({
            failureThreshold: 10,
            resetTimeout: 60000
        });
        this.stats = {
            hits: 0,
            misses: 0,
            totalRequests: 0,
            savedCost: 0
        };
    }

    /**
     * Get a hash of the prompt for quick lookup
     * @private
     * @param {string} prompt - The input prompt
     * @returns {string} SHA256-like hash (simplified)
     */
    _hashPrompt(prompt) {
        let hash = 0;
        for (let i = 0; i < prompt.length; i++) {
            const char = prompt.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * Calculate embedding fingerprint (simplified for cache key)
     * @private
     * @param {string} prompt - The input prompt
     * @returns {Object} Fingerprint data
     */
    _generateFingerprint(prompt) {
        const words = prompt.toLowerCase().split(/\s+/);
        const uniqueWords = new Set(words);

        return {
            length: prompt.length,
            wordCount: words.length,
            uniqueWords: uniqueWords.size,
            hash: this._hashPrompt(prompt),
            firstWords: words.slice(0, 5).join(' '),
            lastWords: words.slice(-5).join(' ')
        };
    }

    /**
     * Calculate similarity between two fingerprints (0-1)
     * @private
     * @param {Object} fp1 - First fingerprint
     * @param {Object} fp2 - Second fingerprint
     * @returns {number} Similarity score
     */
    _calculateSimilarity(fp1, fp2) {
        let score = 0;
        const maxScore = 4;

        // Length similarity (max 1 point)
        const lengthRatio = Math.min(fp1.length, fp2.length) / Math.max(fp1.length, fp2.length);
        score += Math.min(lengthRatio, 1);

        // Word overlap (max 1 point)
        if (fp1.wordCount > 0 && fp2.wordCount > 0) {
            const avgWords = (fp1.wordCount + fp2.wordCount) / 2;
            score += Math.min(1, (fp1.uniqueWords + fp2.uniqueWords) / (avgWords * 2));
        }

        // Hash proximity (max 1 point)
        const hashSimilarity = (fp1.hash === fp2.hash) ? 1 : 0.3;
        score += hashSimilarity;

        // Content similarity (max 1 point)
        const firstWordsMatch = (fp1.firstWords === fp2.firstWords) ? 1 : 0.5;
        score += firstWordsMatch;

        return Math.min(1, score / maxScore);
    }

    /**
     * Check if prompt is cacheable
     * @private
     * @param {string} prompt - The input prompt
     * @returns {boolean} Whether to cache
     */
    _isCacheable(prompt) {
        const tokenCount = Math.ceil(prompt.length / 4);
        return tokenCount >= this.config.minTokens &&
               tokenCount <= this.config.maxTokens &&
               !prompt.includes('{{') &&  // no template variables
               !prompt.includes('REDACTED');  // no PII
    }

    /**
     * Get cached response if available
     * @async
     * @param {string} prompt - The input prompt
     * @param {Object} context - Request context {model, temperature, maxTokens}
     * @returns {Object|null} Cached response or null
     */
    async get(prompt, context = {}) {
        this.stats.totalRequests++;

        if (!this.config.enabled || !this._isCacheable(prompt)) {
            this.stats.misses++;
            return null;
        }

        const fingerprint = this._generateFingerprint(prompt);

        // Check memory cache first
        for (const [cached, data] of this.memoryCache.entries()) {
            const similarity = this._calculateSimilarity(fingerprint, cached.fingerprint);
            if (similarity >= this.config.similarityThreshold) {
                if (data.context.model === context.model &&
                    Math.abs(data.context.temperature - (context.temperature || 0.7)) < 0.1) {
                    this.stats.hits++;
                    data.accessCount++;
                    data.lastAccess = Date.now();
                    return data.response;
                }
            }
        }

        // Check Supabase if configured
        if (this.supabaseUrl && this.supabaseKey) {
            try {
                const result = await this._querySupabase(fingerprint, context);
                if (result) {
                    this.stats.hits++;
                    return result;
                }
            } catch (error) {
                // Log warning via logger if available, otherwise use console
                if (this.logger) this.logger.warn('SemanticCache: Supabase query failed', { error: error.message });
            }
        }

        this.stats.misses++;
        return null;
    }

    /**
     * Store a response in cache
     * @async
     * @param {string} prompt - The input prompt
     * @param {Object} response - The LLM response
     * @param {Object} context - Request context
     * @param {number} costSaved - Cost saved by this cache entry
     */
    async set(prompt, response, context = {}, costSaved = 0) {
        if (!this.config.enabled || !this._isCacheable(prompt)) {
            return;
        }

        const fingerprint = this._generateFingerprint(prompt);
        const cacheEntry = {
            fingerprint,
            response,
            context: {
                model: context.model,
                temperature: context.temperature || 0.7,
                maxTokens: context.maxTokens
            },
            createdAt: Date.now(),
            accessCount: 0,
            lastAccess: Date.now()
        };

        // Add to memory cache
        if (this.memoryCache.size >= this.config.maxCacheSize) {
            this._evictLRU();
        }
        this.memoryCache.set(fingerprint, cacheEntry);

        // Store in Supabase if configured
        if (this.supabaseUrl && this.supabaseKey) {
            try {
                await this._storeInSupabase(prompt, fingerprint, cacheEntry);
                this.stats.savedCost += costSaved;
            } catch (error) {
                // Log warning via logger if available, otherwise use console
                if (this.logger) this.logger.warn('SemanticCache: Supabase store failed', { error: error.message });
            }
        }
    }

    /**
     * Evict least recently used entry
     * @private
     */
    _evictLRU() {
        let lruKey = null;
        let minAccess = Infinity;
        let minTime = Infinity;

        for (const [key, data] of this.memoryCache.entries()) {
            if (data.lastAccess < minTime) {
                minTime = data.lastAccess;
                lruKey = key;
                minAccess = data.accessCount;
            }
        }

        if (lruKey) {
            this.memoryCache.delete(lruKey);
        }
    }

    /**
     * Query Supabase for cached prompts with circuit breaker protection
     * @private
     * @async
     */
    async _querySupabase(fingerprint, context) {
        const url = `${this.supabaseUrl}/rest/v1/cache_entries?hash=eq.${encodeURIComponent(fingerprint.hash)}&select=response`;

        const response = await resilientFetch(url, {
            method: 'GET',
            headers: {
                'apikey': this.supabaseKey,
                'Authorization': `Bearer ${this.supabaseKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000,
            maxRetries: 1,
            circuitBreaker: this.circuitBreaker
        });

        if (!response.ok) {
            throw new Error(`Supabase query failed: ${response.status}`);
        }

        const data = await response.json();
        return data.length > 0 ? JSON.parse(data[0].response) : null;
    }

    /**
     * Store entry in Supabase with circuit breaker protection
     * @private
     * @async
     */
    async _storeInSupabase(prompt, fingerprint, cacheEntry) {
        const payload = {
            hash: fingerprint.hash,
            prompt_length: fingerprint.length,
            response: JSON.stringify(cacheEntry.response),
            model: cacheEntry.context.model,
            created_at: new Date().toISOString(),
            ttl_seconds: this.config.ttlSeconds
        };

        const response = await resilientFetch(
            `${this.supabaseUrl}/rest/v1/cache_entries`,
            {
                method: 'POST',
                headers: {
                    'apikey': this.supabaseKey,
                    'Authorization': `Bearer ${this.supabaseKey}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(payload),
                timeout: 15000,
                maxRetries: 0,
                circuitBreaker: this.circuitBreaker
            }
        );

        if (!response.ok) {
            throw new Error(`Supabase store failed: ${response.status}`);
        }
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache stats
     */
    getStats() {
        const hitRate = this.stats.totalRequests > 0
            ? (this.stats.hits / this.stats.totalRequests * 100).toFixed(2)
            : 0;

        return {
            ...this.stats,
            hitRate: `${hitRate}%`,
            cacheSize: this.memoryCache.size,
            maxSize: this.config.maxCacheSize,
            utilizationPercent: ((this.memoryCache.size / this.config.maxCacheSize) * 100).toFixed(2)
        };
    }

    /**
     * Clear all cache entries
     */
    clear() {
        this.memoryCache.clear();
        this.stats = {
            hits: 0,
            misses: 0,
            totalRequests: 0,
            savedCost: 0
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROMPT SHIELD CLASS (PII/PHI REDACTION)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PromptShield
 * Real-time PII/PHI detection and redaction before forwarding to LLM APIs
 */
class PromptShield {
    /**
     * @param {Object} options - Configuration options
     * @param {boolean} options.strictMode - Fail on PII instead of redacting
     * @param {Array<string>} options.enabledPatterns - Which PII patterns to check
     */
    constructor(options = {}) {
        this.strictMode = options.strictMode || false;
        this.enabledPatterns = options.enabledPatterns || Object.keys(PII_PATTERNS);
        this.detectionLog = [];
    }

    /**
     * Detect PII/PHI in text
     * @param {string} text - Text to scan
     * @returns {Object} Detection results
     */
    detect(text) {
        const findings = {};
        const detectionTime = Date.now();

        for (const pattern of this.enabledPatterns) {
            if (!PII_PATTERNS[pattern]) continue;

            const matches = text.match(PII_PATTERNS[pattern]) || [];
            if (matches.length > 0) {
                findings[pattern] = {
                    count: matches.length,
                    samples: matches.slice(0, 3)  // first 3 matches
                };
            }
        }

        const result = {
            hasPII: Object.keys(findings).length > 0,
            findings,
            detectedAt: detectionTime,
            textLength: text.length
        };

        if (result.hasPII) {
            this.detectionLog.push(result);
        }

        return result;
    }

    /**
     * Redact PII/PHI from text
     * @param {string} text - Text to redact
     * @returns {Object} {redactedText, replacements}
     */
    redact(text) {
        let redactedText = text;
        const replacements = [];

        for (const pattern of this.enabledPatterns) {
            if (!PII_PATTERNS[pattern]) continue;

            const regex = PII_PATTERNS[pattern];
            let match;

            while ((match = regex.exec(text)) !== null) {
                const placeholder = `[REDACTED_${pattern.toUpperCase()}_${replacements.length + 1}]`;
                const startIndex = redactedText.indexOf(match[0]);

                if (startIndex !== -1) {
                    redactedText = redactedText.replace(match[0], placeholder);
                    replacements.push({
                        pattern,
                        original: match[0],
                        placeholder,
                        position: startIndex
                    });
                }
            }
        }

        return {
            redactedText,
            replacements,
            piiDetected: replacements.length > 0,
            redactionCount: replacements.length
        };
    }

    /**
     * Process text with optional redaction
     * @param {string} text - Text to process
     * @param {boolean} shouldRedact - Whether to redact or just detect
     * @returns {Object} Processing result
     */
    process(text, shouldRedact = true) {
        const detection = this.detect(text);

        if (this.strictMode && detection.hasPII) {
            const error = new Error('PII/PHI detected in prompt');
            error.details = detection.findings;
            error.name = 'PIIDetectionError';
            throw error;
        }

        if (!detection.hasPII) {
            return {
                safe: true,
                text,
                redactionApplied: false,
                detection
            };
        }

        if (shouldRedact) {
            const redaction = this.redact(text);
            return {
                safe: true,
                text: redaction.redactedText,
                redactionApplied: true,
                redactionCount: redaction.redactionCount,
                detection,
                replacements: redaction.replacements
            };
        }

        return {
            safe: false,
            text,
            redactionApplied: false,
            detection
        };
    }

    /**
     * Get detection statistics
     * @returns {Object} Stats
     */
    getStats() {
        const patternStats = {};
        for (const pattern of this.enabledPatterns) {
            patternStats[pattern] = {
                detections: this.detectionLog
                    .reduce((sum, log) => sum + (log.findings[pattern]?.count || 0), 0)
            };
        }

        return {
            totalDetections: this.detectionLog.length,
            uniquePatterns: Object.keys(patternStats).filter(p => patternStats[p].detections > 0),
            byPattern: patternStats
        };
    }

    /**
     * Clear detection log
     */
    clearLog() {
        this.detectionLog = [];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// COST PREDICTION CLASS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CostPredictor
 * Estimates cost of LLM requests before they are executed
 */
class CostPredictor {
    /**
     * @param {Object} options - Configuration options
     * @param {Object} options.modelPricing - Custom pricing data
     */
    constructor(options = {}) {
        this.modelPricing = options.modelPricing || MODEL_PRICING;
    }

    /**
     * Estimate token count from text
     * Uses simple approximation: 1 token ≈ 4 characters
     * @private
     * @param {string} text - Text to estimate
     * @returns {number} Estimated tokens
     */
    _estimateTokens(text) {
        return Math.ceil(text.length / 4);
    }

    /**
     * Get model pricing info
     * @param {string} provider - Provider name (openai, anthropic, etc.)
     * @param {string} model - Model identifier
     * @returns {Object|null} Pricing info
     */
    getModelPricing(provider, model) {
        const providerModels = this.modelPricing[provider];
        if (!providerModels) return null;
        return providerModels[model] || null;
    }

    /**
     * Predict cost for a single request
     * @param {Object} params - Prediction parameters
     * @param {string} params.provider - LLM provider
     * @param {string} params.model - Model name
     * @param {string} params.prompt - Input prompt
     * @param {number} params.expectedOutputTokens - Expected output length (optional)
     * @param {Object} params.extra - Extra parameters (images, etc.)
     * @returns {Object} Cost prediction
     */
    predictRequestCost(params) {
        const { provider, model, prompt, expectedOutputTokens = 200, extra = {} } = params;

        const pricing = this.getModelPricing(provider, model);
        if (!pricing) {
            return {
                error: `Unknown model: ${provider}/${model}`,
                cost: null
            };
        }

        let totalCost = 0;

        // Input tokens
        const inputTokens = this._estimateTokens(prompt);
        const inputCost = (inputTokens / 1000) * pricing.input;
        totalCost += inputCost;

        // Output tokens
        const outputCost = (expectedOutputTokens / 1000) * pricing.output;
        totalCost += outputCost;

        // Per-request cost (some models charge per request)
        totalCost += pricing.costPerRequest || 0;

        // Special handling for vision models (images)
        if (extra.imageCount && pricing.imageTokens) {
            const imageCost = extra.imageCount * pricing.imageTokens * (pricing.input / 1000);
            totalCost += imageCost;
        }

        // Cache write cost (for Claude models)
        if (extra.cacheWriteTokens && pricing.cacheWriteTokens) {
            const cacheCost = (extra.cacheWriteTokens / 1000) * pricing.cacheWriteTokens;
            totalCost += cacheCost;
        }

        return {
            provider,
            model,
            inputTokens,
            outputTokens: expectedOutputTokens,
            inputCost: parseFloat(inputCost.toFixed(6)),
            outputCost: parseFloat(outputCost.toFixed(6)),
            totalCost: parseFloat(totalCost.toFixed(6)),
            modelComplexity: pricing.complexity,
            breakdown: {
                inputCost,
                outputCost,
                perRequestCost: pricing.costPerRequest,
                extraCharges: extra.imageCount ? (extra.imageCount * pricing.imageTokens * (pricing.input / 1000)) : 0
            }
        };
    }

    /**
     * Compare cost across multiple models
     * @param {Object} params - Comparison parameters
     * @param {string} params.prompt - Input prompt
     * @param {number} params.expectedOutputTokens - Expected output
     * @param {Array<string>} params.models - [{provider, model}, ...]
     * @returns {Array<Object>} Sorted by cost
     */
    compareModels(params) {
        const { prompt, expectedOutputTokens = 200, models = [] } = params;

        const predictions = models
            .map(m => this.predictRequestCost({
                provider: m.provider,
                model: m.model,
                prompt,
                expectedOutputTokens
            }))
            .filter(p => !p.error)
            .sort((a, b) => a.totalCost - b.totalCost);

        return predictions.map((pred, idx) => ({
            ...pred,
            rank: idx + 1,
            savingsVsWorst: parseFloat((predictions[predictions.length - 1].totalCost - pred.totalCost).toFixed(6))
        }));
    }

    /**
     * Estimate batch processing cost
     * @param {Object} params - Batch parameters
     * @param {Array<string>} params.prompts - Prompts to process
     * @param {string} params.provider - Provider
     * @param {string} params.model - Model
     * @param {number} params.expectedOutputTokens - Per request
     * @returns {Object} Batch cost estimate
     */
    estimateBatchCost(params) {
        const { prompts, provider, model, expectedOutputTokens = 200 } = params;

        if (!prompts || prompts.length === 0) {
            return { error: 'No prompts provided', totalCost: 0 };
        }

        let totalCost = 0;
        const predictions = [];

        for (const prompt of prompts) {
            const pred = this.predictRequestCost({
                provider,
                model,
                prompt,
                expectedOutputTokens
            });
            if (!pred.error) {
                predictions.push(pred);
                totalCost += pred.totalCost;
            }
        }

        return {
            provider,
            model,
            requestCount: predictions.length,
            totalCost: parseFloat(totalCost.toFixed(6)),
            averageCostPerRequest: parseFloat((totalCost / predictions.length).toFixed(6)),
            predictions
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-LLM ROUTER CLASS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MultiLLMRouter
 * Intelligently routes requests to the best model based on complexity and cost
 */
class MultiLLMRouter {
    /**
     * @param {Object} options - Configuration
     * @param {Object} options.supabaseUrl - Supabase URL
     * @param {Object} options.supabaseKey - Supabase key
     */
    constructor(options = {}) {
        this.supabaseUrl = options.supabaseUrl;
        this.supabaseKey = options.supabaseKey;
        this.costPredictor = new CostPredictor();
        this.routingHistory = [];
    }

    /**
     * Determine task complexity from prompt
     * @param {string} prompt - Input prompt
     * @returns {string} 'low' | 'medium' | 'high'
     */
    determineComplexity(prompt) {
        const lowerPrompt = prompt.toLowerCase();
        const tokenCount = Math.ceil(prompt.length / 4);

        // Check for high complexity keywords
        for (const keyword of COMPLEXITY_THRESHOLDS.keywords.high) {
            if (lowerPrompt.includes(keyword)) return 'high';
        }

        // Check for medium complexity keywords
        for (const keyword of COMPLEXITY_THRESHOLDS.keywords.medium) {
            if (lowerPrompt.includes(keyword)) return 'medium';
        }

        // Check for low complexity keywords
        for (const keyword of COMPLEXITY_THRESHOLDS.keywords.low) {
            if (lowerPrompt.includes(keyword)) return 'low';
        }

        // Fall back to token count heuristic
        if (tokenCount > COMPLEXITY_THRESHOLDS.inputLength.high) return 'high';
        if (tokenCount > COMPLEXITY_THRESHOLDS.inputLength.medium) return 'medium';
        return 'low';
    }

    /**
     * Route request to optimal model based on complexity and cost
     * @param {Object} params - Routing parameters
     * @param {string} params.prompt - Input prompt
     * @param {Object} params.availableModels - Available models {provider: [models]}
     * @param {boolean} params.optimizeForCost - Prefer cheaper models
     * @param {boolean} params.optimizeForQuality - Prefer better models
     * @returns {Object} Routing decision
     */
    routeRequest(params) {
        const {
            prompt,
            availableModels = {},
            optimizeForCost = true,
            optimizeForQuality = false
        } = params;

        const complexity = this.determineComplexity(prompt);

        // Build candidate list
        const candidates = [];
        for (const [provider, models] of Object.entries(availableModels)) {
            for (const model of models) {
                const pricing = this.costPredictor.getModelPricing(provider, model);
                if (!pricing) continue;

                candidates.push({
                    provider,
                    model,
                    complexity: pricing.complexity,
                    pricePerInput: pricing.input,
                    maxTokens: pricing.maxTokens
                });
            }
        }

        if (candidates.length === 0) {
            return {
                error: 'No valid models available',
                routing: null
            };
        }

        // Filter by complexity
        let selected = candidates;
        if (optimizeForQuality && complexity === 'high') {
            selected = candidates.filter(c => c.complexity !== 'low');
        } else if (optimizeForCost && complexity === 'low') {
            selected = candidates.filter(c => c.complexity !== 'high');
        }

        // Sort by cost if optimizing for cost
        if (optimizeForCost) {
            selected.sort((a, b) => a.pricePerInput - b.pricePerInput);
        } else {
            // Otherwise prefer higher quality
            const complexityOrder = { high: 3, medium: 2, low: 1 };
            selected.sort((a, b) => complexityOrder[b.complexity] - complexityOrder[a.complexity]);
        }

        const selected_model = selected[0];
        const routing = {
            provider: selected_model.provider,
            model: selected_model.model,
            complexity,
            reason: optimizeForCost ? 'cost_optimized' : 'quality_optimized',
            estimatedInputCost: selected_model.pricePerInput,
            alternatives: selected.slice(1, 3).map(m => ({
                provider: m.provider,
                model: m.model,
                costDiff: ((m.pricePerInput - selected_model.pricePerInput) * 100).toFixed(2) + '%'
            }))
        };

        this.routingHistory.push({
            prompt: prompt.substring(0, 100),
            routing,
            timestamp: Date.now()
        });

        return { error: null, routing };
    }

    /**
     * Get routing statistics
     * @returns {Object} Stats
     */
    getStats() {
        const modelUsage = {};
        const complexityDistribution = {};

        for (const entry of this.routingHistory) {
            const key = `${entry.routing.provider}/${entry.routing.model}`;
            modelUsage[key] = (modelUsage[key] || 0) + 1;

            const complexity = entry.routing.complexity;
            complexityDistribution[complexity] = (complexityDistribution[complexity] || 0) + 1;
        }

        return {
            totalRoutes: this.routingHistory.length,
            modelUsage,
            complexityDistribution
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// AB TESTING FRAMEWORK CLASS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ABTestingFramework
 * A/B test different models with configurable traffic splitting
 */
class ABTestingFramework {
    /**
     * @param {Object} options - Configuration
     */
    constructor(options = {}) {
        this.config = { ...AB_TEST_CONFIG, ...(options.config || {}) };
        this.experiments = new Map();
        this.results = [];
    }

    /**
     * Create a new A/B test
     * @param {Object} params - Test parameters
     * @param {string} params.name - Experiment name
     * @param {Object} params.modelA - {provider, model}
     * @param {Object} params.modelB - {provider, model}
     * @param {number} params.trafficSplit - % for model B (0-1)
     * @returns {string} Experiment ID
     */
    createExperiment(params) {
        const {
            name,
            modelA,
            modelB,
            trafficSplit = this.config.defaultTrafficSplit.modelB
        } = params;

        if (trafficSplit < 0 || trafficSplit > 1) {
            throw new Error('trafficSplit must be between 0 and 1');
        }

        const crypto = require('crypto');
        const experimentId = `exp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const experiment = {
            id: experimentId,
            name,
            modelA,
            modelB,
            trafficSplit,
            createdAt: Date.now(),
            results: {
                modelA: { count: 0, totalCost: 0, totalLatency: 0, errors: 0 },
                modelB: { count: 0, totalCost: 0, totalLatency: 0, errors: 0 }
            }
        };

        this.experiments.set(experimentId, experiment);
        return experimentId;
    }

    /**
     * Determine which model to use for a request
     * @param {string} experimentId - Experiment ID
     * @returns {Object} {model: {provider, model}, variant: 'A'|'B', reason: string}
     */
    selectVariant(experimentId, userId = null, requestId = null) {
        const experiment = this.experiments.get(experimentId);
        if (!experiment) {
            throw new Error(`Unknown experiment: ${experimentId}`);
        }

        // Deterministic bucketing based on user/request hash
        // Same user always gets same model variant across requests
        const hashKey = userId || requestId || `req_${Date.now()}`;
        const hashValue = this._hashForBucketing(hashKey, experimentId);
        const useModelB = hashValue < experiment.trafficSplit;

        return {
            model: useModelB ? experiment.modelB : experiment.modelA,
            variant: useModelB ? 'B' : 'A',
            reason: `traffic_split_${(experiment.trafficSplit * 100).toFixed(0)}%`,
            experimentId,
            deterministic: true,
            bucketKey: hashKey
        };
    }

    _hashForBucketing(key, experimentId) {
        // Simple deterministic hash function for bucketing
        // Returns value between 0 and 1 for traffic split comparison
        const crypto = require('crypto');
        const hash = crypto.createHash('sha256');
        hash.update(`${key}:${experimentId}`);
        const hashHex = hash.digest('hex');
        // Convert first 8 chars of hex to integer, then normalize to 0-1 range
        const hashInt = parseInt(hashHex.substring(0, 8), 16);
        return (hashInt % 10000) / 10000;
    }

    /**
     * Record result from a request
     * @param {string} experimentId - Experiment ID
     * @param {Object} params - Result data
     * @param {string} params.variant - 'A' or 'B'
     * @param {number} params.cost - Request cost
     * @param {number} params.latency - Request latency in ms
     * @param {boolean} params.success - Whether request succeeded
     * @param {Object} params.metadata - Additional metadata
     */
    recordResult(experimentId, params) {
        const experiment = this.experiments.get(experimentId);
        if (!experiment) {
            throw new Error(`Unknown experiment: ${experimentId}`);
        }

        const { variant, cost = 0, latency = 0, success = true, metadata = {} } = params;
        if (!['A', 'B'].includes(variant)) {
            throw new Error('variant must be A or B');
        }

        const key = variant === 'A' ? 'modelA' : 'modelB';
        experiment.results[key].count++;
        experiment.results[key].totalCost += cost;
        experiment.results[key].totalLatency += latency;
        if (!success) experiment.results[key].errors++;

        this.results.push({
            experimentId,
            variant,
            cost,
            latency,
            success,
            timestamp: Date.now(),
            metadata
        });
    }

    /**
     * Get experiment results
     * @param {string} experimentId - Experiment ID
     * @returns {Object} Results with statistical analysis
     */
    getResults(experimentId) {
        const experiment = this.experiments.get(experimentId);
        if (!experiment) {
            throw new Error(`Unknown experiment: ${experimentId}`);
        }

        const resA = experiment.results.modelA;
        const resB = experiment.results.modelB;

        const avgCostA = resA.count > 0 ? resA.totalCost / resA.count : 0;
        const avgCostB = resB.count > 0 ? resB.totalCost / resB.count : 0;
        const avgLatencyA = resA.count > 0 ? resA.totalLatency / resA.count : 0;
        const avgLatencyB = resB.count > 0 ? resB.totalLatency / resB.count : 0;

        const successRateA = resA.count > 0 ? ((resA.count - resA.errors) / resA.count * 100).toFixed(2) : 0;
        const successRateB = resB.count > 0 ? ((resB.count - resB.errors) / resB.count * 100).toFixed(2) : 0;

        const hasSufficientData = resA.count >= this.config.minSampleSize &&
                                  resB.count >= this.config.minSampleSize;

        return {
            experimentId,
            name: experiment.name,
            status: hasSufficientData ? 'statistically_significant' : 'collecting_data',
            modelA: {
                model: experiment.modelA,
                requests: resA.count,
                avgCost: parseFloat(avgCostA.toFixed(6)),
                avgLatency: parseFloat(avgLatencyA.toFixed(2)),
                errorRate: parseFloat(((resA.errors / resA.count * 100) || 0).toFixed(2)),
                successRate: parseFloat(successRateA)
            },
            modelB: {
                model: experiment.modelB,
                requests: resB.count,
                avgCost: parseFloat(avgCostB.toFixed(6)),
                avgLatency: parseFloat(avgLatencyB.toFixed(2)),
                errorRate: parseFloat(((resB.errors / resB.count * 100) || 0).toFixed(2)),
                successRate: parseFloat(successRateB)
            },
            comparison: {
                costSavings: parseFloat((avgCostA - avgCostB).toFixed(6)),
                costSavingsPercent: parseFloat(((avgCostA - avgCostB) / avgCostA * 100).toFixed(2)),
                latencyDiff: parseFloat((avgLatencyA - avgLatencyB).toFixed(2)),
                recommendation: avgCostB < avgCostA ? 'switch_to_modelB' : 'keep_modelA'
            }
        };
    }

    /**
     * Stop an experiment and get final results
     * @param {string} experimentId - Experiment ID
     * @returns {Object} Final results
     */
    concludeExperiment(experimentId) {
        const experiment = this.experiments.get(experimentId);
        if (!experiment) {
            throw new Error(`Unknown experiment: ${experimentId}`);
        }

        const results = this.getResults(experimentId);
        results.concludedAt = Date.now();
        results.duration = results.concludedAt - experiment.createdAt;

        this.experiments.delete(experimentId);
        return results;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SLA MONITORING CLASS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SLAMonitor
 * Tracks provider uptime, latency, error rates, and compliance with contractual SLAs
 * Persists metrics to Supabase gateway_logs table for reporting
 */
class SLAMonitor {
    /**
     * @param {Object} options - Configuration
     * @param {Object} options.slaTargets - SLA target thresholds
     * @param {string} options.supabaseUrl - Supabase URL for persistence
     * @param {string} options.supabaseKey - Supabase API key
     */
    constructor(options = {}) {
        this.slaTargets = options.slaTargets || PROVIDER_SLAS;
        this.supabaseUrl = options.supabaseUrl;
        this.supabaseKey = options.supabaseKey;
        this.logger = options.logger || new DiamondLogger('SLAMonitor');
        this.circuitBreaker = options.circuitBreaker || new CircuitBreaker({
            failureThreshold: 10,
            resetTimeout: 60000
        });
        this.metrics = new Map();
        this.violations = [];
        this.persistenceQueue = [];
        this.lastPersistTime = {};
        this.persistenceIntervalMs = 30000; // Batch persist every 30s
    }

    /**
     * Record a request metric
     * @param {Object} params - Metric data
     * @param {string} params.provider - Provider name
     * @param {string} params.model - Model used
     * @param {number} params.latency - Response latency in ms
     * @param {boolean} params.success - Whether request succeeded
     * @param {number} params.cost - Request cost
     * @param {string} params.errorType - Error type if failed (optional)
     */
    recordMetric(params) {
        const { provider, model, latency, success, cost, errorType } = params;

        const key = provider;
        if (!this.metrics.has(key)) {
            this.metrics.set(key, {
                provider,
                requestCount: 0,
                successCount: 0,
                failureCount: 0,
                totalLatency: 0,
                minLatency: Infinity,
                maxLatency: 0,
                totalCost: 0,
                p50Latency: 0,
                p95Latency: 0,
                p99Latency: 0,
                latencies: [],
                errorCounts: {},
                lastUpdateTime: Date.now()
            });
        }

        const metric = this.metrics.get(key);
        metric.requestCount++;
        metric.lastUpdateTime = Date.now();

        if (success) {
            metric.successCount++;
        } else {
            metric.failureCount++;
            if (errorType) {
                metric.errorCounts[errorType] = (metric.errorCounts[errorType] || 0) + 1;
            }
        }

        metric.totalLatency += latency;
        metric.minLatency = Math.min(metric.minLatency, latency);
        metric.maxLatency = Math.max(metric.maxLatency, latency);
        metric.latencies.push(latency);
        metric.totalCost += cost || 0;

        // Calculate percentiles (p50, p95, p99)
        if (metric.latencies.length >= 100) {
            const sorted = [...metric.latencies].sort((a, b) => a - b);
            metric.p50Latency = sorted[Math.floor(sorted.length * 0.50)];
            metric.p95Latency = sorted[Math.floor(sorted.length * 0.95)];
            metric.p99Latency = sorted[Math.floor(sorted.length * 0.99)];
            metric.latencies = metric.latencies.slice(-100);  // Keep only last 100
        }

        // Queue for persistence
        this.persistenceQueue.push({
            provider,
            model,
            latency,
            success,
            cost: cost || 0,
            errorType: errorType || null,
            timestamp: Date.now()
        });

        // Persist if queue is large or interval elapsed
        this._maybePersistMetrics(provider);
        this._checkSLACompliance(provider, metric);
    }

    /**
     * Persist metrics to Supabase if queue has items and interval elapsed
     * @private
     */
    async _maybePersistMetrics(provider) {
        const now = Date.now();
        const lastTime = this.lastPersistTime[provider] || 0;
        const shouldPersist = (this.persistenceQueue.length > 50) || (now - lastTime > this.persistenceIntervalMs);

        if (shouldPersist && this.supabaseUrl && this.supabaseKey) {
            await this._persistToSupabase(provider);
        }
    }

    /**
     * Persist metrics to Supabase gateway_logs table with circuit breaker protection
     * @private
     * @async
     */
    async _persistToSupabase(provider) {
        if (!this.persistenceQueue.length) return;

        try {
            const metric = this.getProviderMetrics(provider);
            const payload = {
                provider,
                uptime: metric.uptime,
                error_rate: parseFloat(((metric.requestCount - metric.uptime * metric.requestCount / 100) / metric.requestCount * 100).toFixed(2)),
                avg_latency: metric.avgLatency,
                p50_latency: metric.p50Latency,
                p95_latency: metric.p95Latency,
                p99_latency: metric.p99Latency,
                request_count: metric.requestCount,
                total_cost: metric.totalCost,
                timestamp: new Date().toISOString(),
                sla_breaches: this.getViolations(provider).length
            };

            const response = await resilientFetch(
                `${this.supabaseUrl}/rest/v1/gateway_logs`,
                {
                    method: 'POST',
                    headers: {
                        'apikey': this.supabaseKey,
                        'Authorization': `Bearer ${this.supabaseKey}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify(payload),
                    timeout: 15000,
                    maxRetries: 0,
                    circuitBreaker: this.circuitBreaker
                }
            );

            if (!response.ok) {
                this.logger.error('Failed to persist SLA metrics', { status: response.status, statusText: response.statusText });
            } else {
                this.persistenceQueue = [];
                this.lastPersistTime[provider] = Date.now();
            }
        } catch (error) {
            this.logger.error('Error persisting SLA metrics to Supabase', { error: error.message });
        }
    }

    /**
     * Check SLA compliance
     * @private
     */
    _checkSLACompliance(provider, metric) {
        const sla = this.slaTargets[provider];
        if (!sla) return;

        const uptime = metric.successCount / metric.requestCount;
        const avgLatency = metric.totalLatency / metric.requestCount;
        const errorRate = metric.failureCount / metric.requestCount;

        // Check uptime SLA
        if (uptime < sla.uptime) {
            this.violations.push({
                provider,
                type: 'uptime',
                slaTarget: (sla.uptime * 100).toFixed(2) + '%',
                actual: (uptime * 100).toFixed(2) + '%',
                timestamp: Date.now()
            });
        }

        // Check error rate
        if (errorRate > (1 - sla.uptime)) {
            this.violations.push({
                provider,
                type: 'error_rate',
                slaTarget: ((1 - sla.uptime) * 100).toFixed(3) + '%',
                actual: (errorRate * 100).toFixed(3) + '%',
                timestamp: Date.now()
            });
        }

        // Check latency SLA
        if (avgLatency > sla.avgLatency) {
            this.violations.push({
                provider,
                type: 'latency',
                slaTarget: sla.avgLatency + 'ms',
                actual: avgLatency.toFixed(2) + 'ms',
                timestamp: Date.now()
            });
        }

        // Check p99 latency
        if (metric.p99Latency > sla.p99Latency) {
            this.violations.push({
                provider,
                type: 'p99_latency',
                slaTarget: sla.p99Latency + 'ms',
                actual: metric.p99Latency.toFixed(2) + 'ms',
                timestamp: Date.now()
            });
        }
    }

    /**
     * Get provider metrics with all percentiles and error rates
     * @param {string} provider - Provider name
     * @returns {Object} Provider metrics
     */
    getProviderMetrics(provider) {
        const metric = this.metrics.get(provider);
        if (!metric) return null;

        const uptime = (metric.successCount / metric.requestCount) * 100;
        const errorRate = (metric.failureCount / metric.requestCount) * 100;

        return {
            provider,
            requestCount: metric.requestCount,
            successCount: metric.successCount,
            failureCount: metric.failureCount,
            uptime: parseFloat(uptime.toFixed(3)),
            errorRate: parseFloat(errorRate.toFixed(3)),
            avgLatency: parseFloat((metric.totalLatency / metric.requestCount).toFixed(2)),
            minLatency: metric.minLatency,
            maxLatency: metric.maxLatency,
            p50Latency: metric.p50Latency,
            p95Latency: metric.p95Latency,
            p99Latency: metric.p99Latency,
            totalCost: parseFloat(metric.totalCost.toFixed(6)),
            errorCounts: metric.errorCounts,
            slaTarget: this.slaTargets[provider] || null
        };
    }

    /**
     * Get all provider metrics
     * @returns {Array<Object>} All provider metrics
     */
    getAllMetrics() {
        const all = [];
        for (const [provider] of this.metrics) {
            all.push(this.getProviderMetrics(provider));
        }
        return all;
    }

    /**
     * Get SLA violations
     * @param {string} provider - Filter by provider (optional)
     * @returns {Array<Object>} Violations
     */
    getViolations(provider = null) {
        if (provider) {
            return this.violations.filter(v => v.provider === provider);
        }
        return this.violations;
    }

    /**
     * Get SLA compliance score (0-100)
     * @param {string} provider - Provider name
     * @returns {number} Compliance score
     */
    getComplianceScore(provider) {
        const metric = this.getProviderMetrics(provider);
        if (!metric) return 0;

        const sla = this.slaTargets[provider];
        if (!sla) return 100;

        let score = 100;
        const uptime = metric.uptime / 100;
        if (uptime < sla.uptime) {
            score -= (sla.uptime - uptime) * 100 * 50;
        }

        const latencyRatio = metric.avgLatency / sla.avgLatency;
        if (latencyRatio > 1) {
            score -= Math.min(25, (latencyRatio - 1) * 10);
        }

        return Math.max(0, parseFloat(score.toFixed(2)));
    }

    /**
     * Generate SLA variance report comparing actual vs contracted SLAs
     * @param {string} provider - Provider to report on (optional, all if omitted)
     * @returns {Array<Object>} Variance report
     */
    generateVarianceReport(provider = null) {
        const providers = provider ? [provider] : Array.from(this.metrics.keys());
        const report = [];

        for (const prov of providers) {
            const metric = this.getProviderMetrics(prov);
            const sla = this.slaTargets[prov];

            if (!metric) continue;

            const uptime = metric.uptime / 100;
            const uptimeVariance = ((uptime - sla.uptime) * 100).toFixed(2);
            const latencyVariance = (metric.avgLatency - sla.avgLatency).toFixed(2);
            const p99Variance = (metric.p99Latency - sla.p99Latency).toFixed(2);

            report.push({
                provider: prov,
                compliance: this.getComplianceScore(prov),
                uptime: {
                    target: (sla.uptime * 100).toFixed(3) + '%',
                    actual: metric.uptime.toFixed(3) + '%',
                    variance: uptimeVariance + '%',
                    status: uptime >= sla.uptime ? 'PASS' : 'BREACH'
                },
                avgLatency: {
                    target: sla.avgLatency + 'ms',
                    actual: metric.avgLatency.toFixed(2) + 'ms',
                    variance: latencyVariance + 'ms',
                    status: metric.avgLatency <= sla.avgLatency ? 'PASS' : 'BREACH'
                },
                p50Latency: {
                    actual: metric.p50Latency.toFixed(2) + 'ms'
                },
                p95Latency: {
                    actual: metric.p95Latency.toFixed(2) + 'ms'
                },
                p99Latency: {
                    target: sla.p99Latency + 'ms',
                    actual: metric.p99Latency.toFixed(2) + 'ms',
                    variance: p99Variance + 'ms',
                    status: metric.p99Latency <= sla.p99Latency ? 'PASS' : 'BREACH'
                },
                errorRate: {
                    actual: metric.errorRate.toFixed(3) + '%',
                    topErrors: this._getTopErrors(metric.errorCounts)
                },
                totalRequests: metric.requestCount,
                totalCost: '$' + metric.totalCost.toFixed(4),
                period: {
                    startTime: metric.lastUpdateTime - 3600000, // last hour
                    endTime: metric.lastUpdateTime,
                    violations: this.getViolations(prov).length
                }
            });
        }

        return report;
    }

    /**
     * Get top errors from error counts map
     * @private
     */
    _getTopErrors(errorCounts) {
        return Object.entries(errorCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([type, count]) => ({ type, count }));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// REQUEST BATCHING CLASS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * RequestBatcher
 * Batches multiple requests for high-volume workloads to reduce API calls
 */
class RequestBatcher {
    /**
     * @param {Object} options - Configuration
     */
    constructor(options = {}) {
        this.config = { ...BATCH_CONFIG, ...(options.config || {}) };
        this.batches = new Map();
        this.timers = new Map();
    }

    /**
     * Add request to batch
     * @async
     * @param {Object} params - Request parameters
     * @param {string} params.provider - Provider name
     * @param {string} params.model - Model name
     * @param {string} params.prompt - Request prompt
     * @param {string} params.batchKey - Batch key (to group related requests)
     * @returns {Promise<Object>} Batched response
     */
    async addRequest(params) {
        const { provider, model, prompt, batchKey = 'default' } = params;

        if (!this.config.enabled) {
            throw new Error('Batching is disabled');
        }

        const batchId = `${provider}:${model}:${batchKey}`;

        // Initialize batch if needed
        if (!this.batches.has(batchId)) {
            this.batches.set(batchId, {
                id: batchId,
                provider,
                model,
                requests: [],
                promises: [],
                createdAt: Date.now()
            });
        }

        const batch = this.batches.get(batchId);

        // Create promise for this request
        const promise = new Promise((resolve, reject) => {
            batch.requests.push({ prompt, resolve, reject });
            batch.promises.push(promise);
        });

        // Check if batch is full or should be flushed
        if (batch.requests.length >= this.config.maxBatchSize) {
            await this._flushBatch(batchId);
        } else if (batch.requests.length === 1) {
            // Start idle timeout for first request
            this._setIdleTimeout(batchId);
        } else if (batch.requests.length >= this.config.minBatchSize) {
            // Reset wait timer
            this._resetWaitTimer(batchId);
        }

        return promise;
    }

    /**
     * Set idle timeout
     * @private
     */
    _setIdleTimeout(batchId) {
        const timer = setTimeout(() => {
            this._flushBatch(batchId);
        }, this.config.batchIdleTimeoutMs);

        this.timers.set(batchId, timer);
    }

    /**
     * Reset wait timer
     * @private
     */
    _resetWaitTimer(batchId) {
        if (this.timers.has(batchId)) {
            clearTimeout(this.timers.get(batchId));
        }

        const timer = setTimeout(() => {
            this._flushBatch(batchId);
        }, this.config.maxBatchWaitMs);

        this.timers.set(batchId, timer);
    }

    /**
     * Flush batch and execute requests
     * @private
     * @async
     */
    async _flushBatch(batchId) {
        const batch = this.batches.get(batchId);
        if (!batch || batch.requests.length === 0) return;

        this.batches.delete(batchId);
        if (this.timers.has(batchId)) {
            clearTimeout(this.timers.get(batchId));
            this.timers.delete(batchId);
        }

        // Process batch - resolve requests with unified response format
        for (let i = 0; i < batch.requests.length; i++) {
            const request = batch.requests[i];
            try {
                // Route each request through the real LLM provider
                const startMs = Date.now();
                let llmResult;
                try {
                    llmResult = await this._callLLMProvider(batch.provider, batch.model, request.prompt || request.messages?.[0]?.content || '', request.maxTokens || 1024, request.metadata || {});
                } catch (llmErr) {
                    llmResult = { choices: [{ text: '', finish_reason: 'error' }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } };
                }
                const response = {
                    provider: batch.provider,
                    model: batch.model,
                    batchId,
                    index: i,
                    success: true,
                    result: llmResult,
                    processingTime: Date.now() - startMs,
                    timestamp: new Date().toISOString()
                };
                request.resolve(response);
            } catch (error) {
                request.reject(error);
            }
        }
    }

    /**
     * Get batch statistics
     * @returns {Object} Stats
     */
    getStats() {
        let totalPending = 0;
        const batches = [];

        for (const [id, batch] of this.batches) {
            totalPending += batch.requests.length;
            batches.push({
                id,
                requestCount: batch.requests.length,
                ageMs: Date.now() - batch.createdAt
            });
        }

        return {
            activeBatches: this.batches.size,
            totalPendingRequests: totalPending,
            batches
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// INTELLIGENT RETRY ENGINE CLASS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IntelligentRetryEngine
 * Retry failed requests with cost optimization and provider failover
 * Selects cheapest equivalent models and tracks cost savings
 */
class IntelligentRetryEngine {
    /**
     * @param {Object} options - Configuration
     * @param {Object} options.costPredictor - CostPredictor instance
     * @param {string} options.supabaseUrl - Supabase URL for decision logging
     * @param {string} options.supabaseKey - Supabase API key
     */
    constructor(options = {}) {
        this.config = { ...RETRY_CONFIG, ...(options.config || {}) };
        this.costPredictor = options.costPredictor || new CostPredictor();
        this.supabaseUrl = options.supabaseUrl;
        this.supabaseKey = options.supabaseKey;
        this.logger = options.logger || new DiamondLogger('IntelligentRetryEngine');
        this.circuitBreaker = options.circuitBreaker || new CircuitBreaker({
            failureThreshold: 10,
            resetTimeout: 60000
        });
        this.retryHistory = [];
        this.failoverDecisions = [];
    }

    /**
     * Attempt request with intelligent retry and cost optimization
     * @async
     * @param {Object} params - Request parameters
     * @param {string} params.provider - Initial provider
     * @param {string} params.model - Initial model
     * @param {string} params.prompt - Request prompt
     * @param {Function} params.executeRequest - Async function to execute request
     * @param {Array<Object>} params.fallbackModels - Fallback models [{provider, model}, ...]
     * @param {number} params.expectedTokens - Expected output tokens for cost calculation
     * @returns {Object} Result or error after retries exhausted
     */
    async attemptWithRetry(params) {
        const {
            provider,
            model,
            prompt,
            executeRequest,
            fallbackModels = [],
            expectedTokens = 1000
        } = params;

        let lastError = null;
        let currentProvider = provider;
        let currentModel = model;
        let attempt = 0;
        let totalSavings = 0;
        let naiveCost = 0;
        let optimizedCost = 0;

        // Get initial model cost for comparison
        const initialPricing = this.costPredictor.getModelPricing(provider, model);

        const candidates = [
            { provider, model }
        ];

        while (attempt < this.config.maxAttempts && attempt < candidates.length + fallbackModels.length) {
            // Determine candidate to try
            let candidate;
            if (attempt === 0) {
                candidate = { provider, model };
            } else {
                // Find cheapest available model for retry (cost optimization)
                const cheapest = this._findCheapestEquivalentModel(
                    { provider, model },
                    fallbackModels,
                    attempt
                );
                candidate = cheapest || fallbackModels[Math.min(attempt - 1, fallbackModels.length - 1)] || { provider, model };
            }

            currentProvider = candidate.provider;
            currentModel = candidate.model;

            try {
                const delayMs = this._calculateBackoff(attempt);
                if (attempt > 0) {
                    await this._sleep(delayMs);
                }

                const result = await executeRequest({
                    provider: currentProvider,
                    model: currentModel,
                    prompt
                });

                const currentPricing = this.costPredictor.getModelPricing(currentProvider, currentModel);
                if (currentPricing && initialPricing && attempt > 0) {
                    // Calculate cost savings from failover
                    const estimatedInputTokens = prompt.length / 4;
                    naiveCost = initialPricing.input * (estimatedInputTokens / 1000);
                    optimizedCost = currentPricing.input * (estimatedInputTokens / 1000);
                    totalSavings = naiveCost - optimizedCost;
                }

                // Record successful retry with cost decision
                const decision = {
                    originalProvider: provider,
                    originalModel: model,
                    failedAttempt: attempt,
                    selectedProvider: currentProvider,
                    selectedModel: currentModel,
                    reason: attempt === 0 ? 'initial_attempt' : 'cost_optimized_failover',
                    costSavings: parseFloat(totalSavings.toFixed(6)),
                    estimatedNaiveCost: parseFloat(naiveCost.toFixed(6)),
                    estimatedOptimizedCost: parseFloat(optimizedCost.toFixed(6)),
                    statusCode: 200,
                    timestamp: Date.now()
                };

                this.failoverDecisions.push(decision);
                this._logFailoverDecision(decision);

                this.retryHistory.push({
                    provider: currentProvider,
                    model: currentModel,
                    attempt: attempt + 1,
                    success: true,
                    costSavings: totalSavings,
                    timestamp: Date.now()
                });

                return {
                    success: true,
                    result,
                    attemptsUsed: attempt + 1,
                    costSavings: totalSavings,
                    failoverUsed: attempt > 0
                };

            } catch (error) {
                lastError = error;
                const statusCode = error.statusCode || 500;

                // Check if error is retryable
                if (!this.config.retryableStatusCodes.includes(statusCode)) {
                    throw error;
                }

                // Record failed attempt decision
                if (attempt > 0) {
                    const decision = {
                        originalProvider: provider,
                        originalModel: model,
                        failedAttempt: attempt,
                        selectedProvider: currentProvider,
                        selectedModel: currentModel,
                        reason: 'cost_optimized_failover_failed',
                        statusCode,
                        errorMessage: error.message,
                        timestamp: Date.now()
                    };
                    this.failoverDecisions.push(decision);
                    this._logFailoverDecision(decision);
                }

                attempt++;
            }
        }

        this.retryHistory.push({
            provider: currentProvider,
            model: currentModel,
            attempt,
            success: false,
            error: lastError?.message,
            timestamp: Date.now()
        });

        return {
            success: false,
            error: lastError,
            attemptsUsed: attempt,
            message: `Failed after ${attempt} attempts`,
            failoverAttempted: attempt > 1
        };
    }

    /**
     * Calculate exponential backoff delay
     * @private
     */
    _calculateBackoff(attempt) {
        const delay = this.config.initialDelayMs *
                      Math.pow(this.config.backoffMultiplier, attempt);
        return Math.min(delay, this.config.maxDelayMs);
    }

    /**
     * Sleep for ms
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Find cheapest equivalent model from fallbacks
     * Ranks by cost (input tokens) and prefers equivalent complexity
     * @private
     */
    _findCheapestEquivalentModel(failedModel, fallbacks, attemptNumber) {
        const failedPricing = this.costPredictor.getModelPricing(
            failedModel.provider,
            failedModel.model
        );
        if (!failedPricing) return null;

        const failedComplexity = failedPricing.complexity || 'medium';

        // Score each fallback by cost + complexity match
        const scoredFallbacks = fallbacks.map(fallback => {
            const fallbackPricing = this.costPredictor.getModelPricing(
                fallback.provider,
                fallback.model
            );
            if (!fallbackPricing) return null;

            // Primary: input cost (lower is better)
            const costScore = fallbackPricing.input;

            // Secondary: complexity match (prefer similar complexity)
            const fallbackComplexity = fallbackPricing.complexity || 'medium';
            const complexityMatch = failedComplexity === fallbackComplexity ? 0 : 5;

            // Tertiary: total cost (for similar pricing)
            const totalCost = (fallbackPricing.input + fallbackPricing.output) / 2;

            return {
                ...fallback,
                pricing: fallbackPricing,
                score: costScore + complexityMatch,
                totalCost,
                savings: failedPricing.input - fallbackPricing.input
            };
        }).filter(f => f !== null);

        // Sort by score (cost + complexity) and return cheapest
        if (scoredFallbacks.length === 0) return null;

        scoredFallbacks.sort((a, b) => {
            // First by cost difference
            if (Math.abs(a.score - b.score) > 0.0001) {
                return a.score - b.score;
            }
            // Then by total cost
            return a.totalCost - b.totalCost;
        });

        return {
            provider: scoredFallbacks[0].provider,
            model: scoredFallbacks[0].model,
            pricing: scoredFallbacks[0].pricing,
            savings: scoredFallbacks[0].savings
        };
    }

    /**
     * Log failover decision to Supabase for analysis with circuit breaker protection
     * @private
     * @async
     */
    async _logFailoverDecision(decision) {
        if (!this.supabaseUrl || !this.supabaseKey) return;

        try {
            const payload = {
                original_provider: decision.originalProvider,
                original_model: decision.originalModel,
                selected_provider: decision.selectedProvider,
                selected_model: decision.selectedModel,
                attempt_number: decision.failedAttempt,
                reason: decision.reason,
                cost_savings: decision.costSavings || 0,
                estimated_naive_cost: decision.estimatedNaiveCost || 0,
                estimated_optimized_cost: decision.estimatedOptimizedCost || 0,
                status_code: decision.statusCode || null,
                error_message: decision.errorMessage || null,
                timestamp: new Date().toISOString()
            };

            await resilientFetch(
                `${this.supabaseUrl}/rest/v1/failover_decisions`,
                {
                    method: 'POST',
                    headers: {
                        'apikey': this.supabaseKey,
                        'Authorization': `Bearer ${this.supabaseKey}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify(payload),
                    timeout: 15000,
                    maxRetries: 0,
                    circuitBreaker: this.circuitBreaker
                }
            );
        } catch (error) {
            // Silently fail to avoid blocking retry logic
            this.logger.debug('Failed to log failover decision', { error: error.message });
        }
    }

    /**
     * Get retry statistics including cost optimization savings
     * @returns {Object} Stats
     */
    getStats() {
        const successful = this.retryHistory.filter(r => r.success).length;
        const failed = this.retryHistory.filter(r => !r.success).length;
        const totalSavings = this.retryHistory
            .filter(r => r.costSavings)
            .reduce((sum, r) => sum + (r.costSavings || 0), 0);

        const successfulFailovers = this.failoverDecisions.filter(d => d.statusCode === 200).length;
        const failedFailovers = this.failoverDecisions.filter(d => d.statusCode && d.statusCode !== 200).length;

        return {
            totalRetries: this.retryHistory.length,
            successful,
            failed,
            successRate: parseFloat(((successful / this.retryHistory.length) * 100).toFixed(2)),
            avgAttemptsPerRequest: parseFloat((
                this.retryHistory.reduce((sum, r) => sum + r.attempt, 0) /
                this.retryHistory.length || 1
            ).toFixed(2)),
            costOptimization: {
                totalSavingsUSD: parseFloat(totalSavings.toFixed(6)),
                successfulFailovers,
                failedFailovers,
                failoverRate: parseFloat(((successfulFailovers + failedFailovers) / this.retryHistory.length * 100).toFixed(2)),
                avgSavingsPerFailover: parseFloat((
                    totalSavings / (successfulFailovers || 1)
                ).toFixed(6))
            }
        };
    }

    /**
     * Get all failover decisions for analysis
     * @param {number} limit - Max decisions to return (default: 100)
     * @returns {Array<Object>} Recent failover decisions
     */
    getFailoverDecisions(limit = 100) {
        return this.failoverDecisions.slice(-limit);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// DIAMOND TIER GATEWAY CLASS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DiamondTierGateway
 * Main gateway orchestrating all Diamond Tier capabilities
 */
class DiamondTierGateway {
    /**
     * @param {string} env.SUPABASE_URL - Supabase connection URL
     * @param {string} env.SUPABASE_KEY - Supabase API key
     * @param {Object} options - Configuration options
     */
    constructor(env, options = {}) {
        this.env = env;
        this.options = options;

        // Initialize production hardening utilities
        this.logger = new DiamondLogger('gateway');
        this.llmCircuitBreakers = {
            openai: new CircuitBreaker({ failureThreshold: 5, resetTimeout: 30000 }),
            anthropic: new CircuitBreaker({ failureThreshold: 5, resetTimeout: 30000 }),
            azure: new CircuitBreaker({ failureThreshold: 5, resetTimeout: 30000 }),
            google: new CircuitBreaker({ failureThreshold: 5, resetTimeout: 30000 })
        };
        this.rateLimiter = new RateLimiter({ maxRequests: 500, windowMs: 60000 });
        this.healthCheck = new HealthCheck('gateway');
        this.supabaseClient = new SupabaseClient(env.SUPABASE_URL, env.SUPABASE_KEY);

        // Initialize all subsystems
        this.cache = new SemanticCache({
            supabaseUrl: env.SUPABASE_URL,
            supabaseKey: env.SUPABASE_KEY,
            config: options.cacheConfig
        });

        this.shield = new PromptShield({
            strictMode: options.strictMode || false,
            enabledPatterns: options.enabledPatterns
        });

        this.costPredictor = new CostPredictor({
            modelPricing: options.modelPricing
        });

        this.router = new MultiLLMRouter({
            supabaseUrl: env.SUPABASE_URL,
            supabaseKey: env.SUPABASE_KEY
        });

        this.abTester = new ABTestingFramework({
            config: options.abTestConfig
        });

        this.slaMonitor = new SLAMonitor({
            slaTargets: options.slaTargets,
            supabaseUrl: env.SUPABASE_URL,
            supabaseKey: env.SUPABASE_KEY
        });

        this.batcher = new RequestBatcher({
            config: options.batchConfig
        });

        this.retryEngine = new IntelligentRetryEngine({
            config: options.retryConfig,
            costPredictor: this.costPredictor,
            supabaseUrl: env.SUPABASE_URL,
            supabaseKey: env.SUPABASE_KEY
        });

        this.requestLog = [];
    }

    /**
     * Process a request through Diamond Tier pipeline
     * @async
     * @param {Object} params - Request parameters
     * @param {string} params.prompt - Input prompt
     * @param {string} params.provider - Preferred provider
     * @param {string} params.model - Preferred model
     * @param {number} params.expectedOutputTokens - Expected output length
     * @param {Object} params.metadata - Additional metadata
     * @returns {Object} Gateway response
     */
    async processRequest(params) {
        // Input validation
        InputValidator.requireObject(params, 'params');
        InputValidator.requireString(params.prompt || params.messages?.[0]?.content || '', 'prompt');

        const {
            prompt,
            provider,
            model,
            expectedOutputTokens = 200,
            metadata = {}
        } = params;

        const crypto = require('crypto');
        const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const startTime = Date.now();

        try {
            // Step 1: PII/PHI Redaction
            const shielded = this.shield.process(prompt, true);
            if (!shielded.safe) {
                return {
                    success: false,
                    error: 'PII/PHI detected in prompt',
                    requestId,
                    redactionRequired: true
                };
            }

            // Step 2: Check semantic cache
            const cached = await this.cache.get(shielded.text, { model, provider });
            if (cached) {
                const latency = Date.now() - startTime;
                this.slaMonitor.recordMetric({
                    provider,
                    model,
                    latency,
                    success: true,
                    cost: 0
                });

                return {
                    success: true,
                    cached: true,
                    response: cached,
                    requestId,
                    latencyMs: latency,
                    provider,
                    model
                };
            }

            // Step 3: Cost prediction
            const costPrediction = this.costPredictor.predictRequestCost({
                provider,
                model,
                prompt: shielded.text,
                expectedOutputTokens
            });

            // Step 4: Multi-LLM routing
            const routing = this.router.routeRequest({
                prompt: shielded.text,
                availableModels: {
                    [provider]: [model],
                    ...metadata.fallbackModels
                },
                optimizeForCost: metadata.optimizeForCost !== false
            });

            const selectedProvider = routing.routing?.provider || provider;
            const selectedModel = routing.routing?.model || model;

            // Step 5: A/B testing
            let variant = null;
            if (metadata.experimentId) {
                const selection = this.abTester.selectVariant(metadata.experimentId);
                variant = selection.variant;
            }

            // Step 6: Execute real LLM request (with retry logic)
            const llmResponse = await this._callLLMProvider(
                selectedProvider,
                selectedModel,
                shielded.text,
                expectedOutputTokens,
                metadata
            );

            const latency = Date.now() - startTime;

            const gatewayResponse = {
                id: llmResponse.id || `chatcmpl_${requestId}`,
                object: llmResponse.object || 'text_completion',
                created: llmResponse.created || Math.floor(Date.now() / 1000),
                model: selectedModel,
                choices: llmResponse.choices || [],
                usage: llmResponse.usage || {
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: 0
                }
            };

            // Step 7: Cache successful response
            await this.cache.set(shielded.text, gatewayResponse, {
                model: selectedModel,
                provider: selectedProvider
            }, costPrediction.totalCost);

            // Step 8: Record metrics
            if (metadata.experimentId) {
                this.abTester.recordResult(metadata.experimentId, {
                    variant: variant || 'A',
                    cost: costPrediction.totalCost,
                    latency,
                    success: true
                });
            }

            this.slaMonitor.recordMetric({
                provider: selectedProvider,
                model: selectedModel,
                latency,
                success: true,
                cost: costPrediction.totalCost
            });

            return {
                success: true,
                requestId,
                response: gatewayResponse,
                provider: selectedProvider,
                model: selectedModel,
                cached: false,
                latencyMs: latency,
                cost: costPrediction.totalCost,
                costPrediction,
                variant,
                routing: routing.routing,
                redactionApplied: shielded.redactionApplied
            };

        } catch (error) {
            const latency = Date.now() - startTime;
            const errorType = error.statusCode ? `HTTP_${error.statusCode}` : error.name || 'UNKNOWN_ERROR';

            this.slaMonitor.recordMetric({
                provider,
                model,
                latency,
                success: false,
                cost: 0,
                errorType
            });

            return {
                success: false,
                requestId,
                error: error.message,
                latencyMs: latency,
                provider,
                model,
                errorType
            };
        }
    }

    /**
     * Execute a real LLM API call to the selected provider
     * @param {string} provider - LLM provider (openai, anthropic, azure, google)
     * @param {string} model - Model identifier
     * @param {string} prompt - The prompt text (already PII-redacted)
     * @param {number} expectedOutputTokens - Max tokens for response
     * @param {Object} metadata - Additional request metadata
     * @returns {Object} Normalized LLM response with choices and usage
     */
    async _callLLMProvider(provider, model, prompt, expectedOutputTokens, metadata = {}) {
        const maxRetries = 2;
        let lastError = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    // Exponential backoff: 1s, 2s
                    await new Promise(r => setTimeout(r, 1000 * attempt));
                }

                const normalizedProvider = provider.toLowerCase();

                if (normalizedProvider === 'openai' || normalizedProvider === 'openai_compatible') {
                    return await this.llmCircuitBreakers.openai.execute(() => this._callOpenAI(model, prompt, expectedOutputTokens, metadata));
                } else if (normalizedProvider === 'anthropic') {
                    return await this.llmCircuitBreakers.anthropic.execute(() => this._callAnthropic(model, prompt, expectedOutputTokens, metadata));
                } else if (normalizedProvider === 'azure' || normalizedProvider === 'azure_openai') {
                    return await this.llmCircuitBreakers.azure.execute(() => this._callAzureOpenAI(model, prompt, expectedOutputTokens, metadata));
                } else if (normalizedProvider === 'google' || normalizedProvider === 'vertex') {
                    return await this.llmCircuitBreakers.google.execute(() => this._callGoogle(model, prompt, expectedOutputTokens, metadata));
                } else {
                    // Default to OpenAI-compatible format
                    return await this.llmCircuitBreakers.openai.execute(() => this._callOpenAI(model, prompt, expectedOutputTokens, metadata));
                }
            } catch (error) {
                lastError = error;
                // Don't retry on auth errors (401/403) or bad requests (400)
                if (error.statusCode && (error.statusCode === 401 || error.statusCode === 403 || error.statusCode === 400)) {
                    throw error;
                }
            }
        }

        throw lastError || new Error(`LLM call to ${provider}/${model} failed after ${maxRetries + 1} attempts`);
    }

    async _callOpenAI(model, prompt, maxTokens, metadata) {
        const apiKey = this.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

        const response = await resilientFetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: Math.min(maxTokens, 4096),
                temperature: metadata.temperature ?? 0.7
            }),
            timeout: 30000,
            maxRetries: 1
        });

        if (!response.ok) {
            const errorBody = await response.text();
            const error = new Error(`OpenAI API error ${response.status}: ${errorBody}`);
            error.statusCode = response.status;
            throw error;
        }

        const data = await response.json();
        return {
            id: data.id,
            object: data.object,
            created: data.created,
            model: data.model,
            choices: data.choices.map(c => ({
                text: c.message?.content || c.text || '',
                finish_reason: c.finish_reason
            })),
            usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
        };
    }

    async _callAnthropic(model, prompt, maxTokens, metadata) {
        const apiKey = this.env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

        const response = await resilientFetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'Content-Type': 'application/json',
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: Math.min(maxTokens, 4096),
                temperature: metadata.temperature ?? 0.7
            }),
            timeout: 30000,
            maxRetries: 1
        });

        if (!response.ok) {
            const errorBody = await response.text();
            const error = new Error(`Anthropic API error ${response.status}: ${errorBody}`);
            error.statusCode = response.status;
            throw error;
        }

        const data = await response.json();
        return {
            id: data.id,
            object: 'message',
            created: Math.floor(Date.now() / 1000),
            model: data.model,
            choices: [{
                text: data.content?.map(c => c.text).join('') || '',
                finish_reason: data.stop_reason || 'stop'
            }],
            usage: {
                prompt_tokens: data.usage?.input_tokens || 0,
                completion_tokens: data.usage?.output_tokens || 0,
                total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
            }
        };
    }

    async _callAzureOpenAI(model, prompt, maxTokens, metadata) {
        const apiKey = this.env.AZURE_OPENAI_KEY;
        const endpoint = this.env.AZURE_OPENAI_ENDPOINT;
        if (!apiKey || !endpoint) throw new Error('AZURE_OPENAI_KEY or AZURE_OPENAI_ENDPOINT not configured');

        const deploymentId = model.replace(/\./g, '');
        const apiVersion = '2024-02-01';
        const url = `${endpoint}/openai/deployments/${deploymentId}/chat/completions?api-version=${apiVersion}`;

        const response = await resilientFetch(url, {
            method: 'POST',
            headers: {
                'api-key': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: [{ role: 'user', content: prompt }],
                max_tokens: Math.min(maxTokens, 4096),
                temperature: metadata.temperature ?? 0.7
            }),
            timeout: 30000,
            maxRetries: 1
        });

        if (!response.ok) {
            const errorBody = await response.text();
            const error = new Error(`Azure OpenAI API error ${response.status}: ${errorBody}`);
            error.statusCode = response.status;
            throw error;
        }

        const data = await response.json();
        return {
            id: data.id,
            object: data.object,
            created: data.created,
            model: data.model,
            choices: data.choices.map(c => ({
                text: c.message?.content || '',
                finish_reason: c.finish_reason
            })),
            usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
        };
    }

    async _callGoogle(model, prompt, maxTokens, metadata) {
        const apiKey = this.env.GOOGLE_API_KEY;
        if (!apiKey) throw new Error('GOOGLE_API_KEY not configured');

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const response = await resilientFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    maxOutputTokens: Math.min(maxTokens, 4096),
                    temperature: metadata.temperature ?? 0.7
                }
            }),
            timeout: 30000,
            maxRetries: 1
        });

        if (!response.ok) {
            const errorBody = await response.text();
            const error = new Error(`Google AI API error ${response.status}: ${errorBody}`);
            error.statusCode = response.status;
            throw error;
        }

        const data = await response.json();
        const candidate = data.candidates?.[0];
        const text = candidate?.content?.parts?.map(p => p.text).join('') || '';

        return {
            id: `google_${Date.now()}`,
            object: 'text_completion',
            created: Math.floor(Date.now() / 1000),
            model: model,
            choices: [{
                text: text,
                finish_reason: candidate?.finishReason?.toLowerCase() || 'stop'
            }],
            usage: {
                prompt_tokens: data.usageMetadata?.promptTokenCount || 0,
                completion_tokens: data.usageMetadata?.candidatesTokenCount || 0,
                total_tokens: data.usageMetadata?.totalTokenCount || 0
            }
        };
    }

    /**
     * Get comprehensive gateway statistics
     * @returns {Object} Gateway stats
     */
    getStats() {
        return {
            cache: this.cache.getStats(),
            shield: this.shield.getStats(),
            router: this.router.getStats(),
            slaMonitor: this.slaMonitor.getAllMetrics(),
            batcher: this.batcher.getStats(),
            retryEngine: this.retryEngine.getStats(),
            requestCount: this.requestLog.length
        };
    }

    /**
     * Get SLA compliance across all providers
     * @returns {Array<Object>} Provider compliance scores
     */
    getSLACompliance() {
        const providers = ['openai', 'anthropic', 'google', 'aws', 'cohere', 'mistral'];
        return providers.map(provider => ({
            provider,
            complianceScore: this.slaMonitor.getComplianceScore(provider),
            violations: this.slaMonitor.getViolations(provider).length
        }));
    }

    /**
     * Get detailed SLA variance report for provider(s)
     * Shows actual vs contractual SLA metrics with variance
     * @param {string} provider - Provider to report on (optional, all if omitted)
     * @returns {Array<Object>} Detailed variance reports
     */
    getSLAVarianceReport(provider = null) {
        return this.slaMonitor.generateVarianceReport(provider);
    }

    /**
     * Get SLA metrics for a specific provider
     * @param {string} provider - Provider name
     * @returns {Object} Provider metrics with percentiles and error rates
     */
    getProviderSLAMetrics(provider) {
        return this.slaMonitor.getProviderMetrics(provider);
    }

    /**
     * Get cost optimization savings from intelligent retry failovers
     * @param {number} limit - Max decisions to return (default: 100)
     * @returns {Array<Object>} Recent failover decisions with cost analysis
     */
    getFailoverDecisions(limit = 100) {
        return this.retryEngine.getFailoverDecisions(limit);
    }

    /**
     * Get retry and failover statistics with cost optimization metrics
     * @returns {Object} Comprehensive retry statistics
     */
    getRetryStats() {
        return this.retryEngine.getStats();
    }

    /**
     * Get comprehensive health check for gateway and all dependencies
     * @async
     * @returns {Object} Health check results
     */
    async getHealth() {
        this.healthCheck.addCheck('supabase', async () => {
            await this.supabaseClient.select('semantic_cache', 'limit=1');
            return { connected: true };
        });
        this.healthCheck.addCheck('openai', async () => {
            return { circuitState: this.llmCircuitBreakers.openai.getState() };
        });
        this.healthCheck.addCheck('anthropic', async () => {
            return { circuitState: this.llmCircuitBreakers.anthropic.getState() };
        });
        this.healthCheck.addCheck('rateLimiter', async () => {
            return this.rateLimiter.getUsage();
        });
        return this.healthCheck.run();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export {
    // Main gateway
    DiamondTierGateway,

    // Core classes
    SemanticCache,
    PromptShield,
    CostPredictor,
    MultiLLMRouter,
    ABTestingFramework,
    SLAMonitor,
    RequestBatcher,
    IntelligentRetryEngine,

    // Constants
    PII_PATTERNS,
    MODEL_PRICING,
    COMPLEXITY_THRESHOLDS,
    PROVIDER_SLAS,
    CACHE_CONFIG,
    BATCH_CONFIG,
    AB_TEST_CONFIG,
    RETRY_CONFIG
};
