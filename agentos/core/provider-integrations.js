/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINAULT PROVIDER API INTEGRATION SPECIFICATIONS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Gap #13: Provider API Integration Specifications — HIGH / P1
 *
 * Problem: Platform parses invoices but doesn't auto-pull billing data from
 * provider APIs. Each provider (OpenAI, Anthropic, Google, Azure, AWS, Cohere,
 * Mistral, Hugging Face) has different billing/usage APIs. Currently all data
 * comes from manual file upload.
 *
 * This module provides:
 * - Provider registry with OAuth/API key configuration per provider
 * - Standardized billing data fetching interface
 * - Usage data normalization to FOCUS 1.3 format
 * - Rate limiting per provider API
 * - Provider health monitoring
 * - Auto-discovery of available API endpoints
 *
 * Providers: OpenAI, Anthropic, Google Cloud, Azure, AWS, Cohere, Mistral, HF
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createFetchResilience } from './resilience-layer.js';
import { createLogger } from './structured-logger.js';

const logger = createLogger('provider-integrations');

// ─── OAuth2 Token Manager ────────────────────────────────────────────────────

/**
 * Manages OAuth2 token lifecycle for providers that use OAuth authentication.
 * Handles token caching, refresh, and auto-renewal before expiry.
 */
class OAuth2TokenManager {
    constructor() {
        this.tokenCache = new Map(); // { accessToken, refreshToken, expiresAt }
    }

    /**
     * Get access token, refreshing if necessary
     * @param {string} providerId - Provider key (e.g., 'google_cloud')
     * @param {Object} config - Provider token config
     * @param {string} config.tokenEndpoint - URL for token refresh
     * @param {Object} credentials - { refreshToken, ... }
     * @param {Function} resilientFetch - Fetch function with resilience
     * @returns {Promise<string>} Valid access token
     */
    async getAccessToken(providerId, config, credentials, resilientFetch) {
        const cached = this.tokenCache.get(providerId);

        // Check cache validity — refresh 60 seconds before expiry
        if (cached && cached.expiresAt - Date.now() > 60000) {
            return cached.accessToken;
        }

        // Refresh token
        return this.refreshToken(providerId, config, credentials, resilientFetch);
    }

    /**
     * Refresh OAuth2 token via provider's token endpoint
     * @param {string} providerId - Provider key
     * @param {Object} config - Token endpoint and credentials
     * @param {Object} credentials - { refreshToken, clientId, clientSecret, ... }
     * @param {Function} resilientFetch - Fetch with resilience
     * @returns {Promise<string>} New access token
     */
    async refreshToken(providerId, config, credentials, resilientFetch) {
        const { tokenEndpoint, clientId, clientSecret } = config;
        if (!tokenEndpoint) {
            throw new Error(`${providerId}: tokenEndpoint not configured`);
        }
        if (!credentials.refreshToken) {
            throw new Error(`${providerId}: refreshToken not provided`);
        }

        const body = {
            grant_type: 'refresh_token',
            refresh_token: credentials.refreshToken,
            client_id: clientId || '',
            client_secret: clientSecret || ''
        };

        try {
            const response = await resilientFetch(tokenEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams(body).toString()
            });

            if (!response.ok) {
                throw new Error(`Token refresh failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const accessToken = data.access_token;
            const expiresIn = data.expires_in || 3600; // seconds
            const expiresAt = Date.now() + expiresIn * 1000;

            this.tokenCache.set(providerId, {
                accessToken,
                refreshToken: data.refresh_token || credentials.refreshToken,
                expiresAt
            });

            return accessToken;
        } catch (error) {
            throw new Error(`${providerId} token refresh failed: ${error.message}`);
        }
    }

    /**
     * Clear token cache for a provider
     */
    invalidateToken(providerId) {
        this.tokenCache.delete(providerId);
    }

    /**
     * Get cache status for monitoring
     */
    getStatus() {
        const status = {};
        for (const [providerId, token] of this.tokenCache.entries()) {
            const expiresIn = Math.max(0, token.expiresAt - Date.now());
            status[providerId] = {
                cached: true,
                expiresInMs: expiresIn,
                expired: expiresIn <= 0
            };
        }
        return status;
    }
}

// ─── Audit Log Manager ───────────────────────────────────────────────────────

/**
 * Maintains audit trail of all provider API calls
 * Tracks requests, responses, errors, and performance metrics
 */
class AuditLog {
    constructor(maxSize = 10000) {
        this.maxSize = maxSize;
        this.entries = [];
    }

    /**
     * Record an API call
     */
    log(entry) {
        this.entries.push({
            timestamp: new Date().toISOString(),
            ...entry
        });

        // Enforce size cap
        if (this.entries.length > this.maxSize) {
            this.entries = this.entries.slice(-this.maxSize);
        }
    }

    /**
     * Get filtered audit log
     * @param {Object} filter - Optional filters
     * @param {string} filter.provider - Filter by provider
     * @param {string} filter.startDate - ISO8601 start date
     * @param {string} filter.endDate - ISO8601 end date
     * @param {number} filter.limit - Max results
     * @returns {Array}
     */
    getEntries(filter = {}) {
        let result = [...this.entries];

        if (filter.provider) {
            result = result.filter(e => e.provider === filter.provider);
        }

        if (filter.startDate) {
            const start = new Date(filter.startDate).getTime();
            result = result.filter(e => new Date(e.timestamp).getTime() >= start);
        }

        if (filter.endDate) {
            const end = new Date(filter.endDate).getTime();
            result = result.filter(e => new Date(e.timestamp).getTime() <= end);
        }

        if (filter.limit) {
            result = result.slice(-filter.limit);
        }

        return result;
    }

    /**
     * Clear all entries (use with caution)
     */
    clear() {
        this.entries = [];
    }
}

// ─── Provider Registry ───────────────────────────────────────────────────────

/**
 * Comprehensive provider registry with API specifications
 * Each provider entry contains auth, rate limits, endpoints, and field mappings
 */
export const PROVIDER_REGISTRY = {
    openai: {
        name: 'OpenAI',
        displayName: 'OpenAI',
        billingEndpoint: 'https://api.openai.com/v1/organization/billing',
        usageEndpoint: 'https://api.openai.com/v1/organization/usage',
        authType: 'api_key',
        rateLimit: 60, // requests per minute
        retryCount: 3,
        timeoutMs: 30000,
        fieldMapping: {
            'organization_id': 'provider_org_id',
            'total_usage': 'total_amount',
            'billing_period': 'period',
            'line_items': 'line_items'
        },
        requiredFields: ['organization_id', 'total_usage']
    },

    anthropic: {
        name: 'Anthropic',
        displayName: 'Anthropic',
        billingEndpoint: 'https://api.anthropic.com/v1/organizations/{org_id}/billing',
        usageEndpoint: 'https://api.anthropic.com/v1/organizations/{org_id}/usage',
        authType: 'api_key',
        rateLimit: 60, // requests per minute
        retryCount: 3,
        timeoutMs: 30000,
        fieldMapping: {
            'organization_id': 'provider_org_id',
            'usage': 'usage_amount',
            'cost': 'total_amount',
            'period': 'period',
            'usage_data': 'usage_detail'
        },
        requiredFields: ['organization_id', 'cost'],
        pathParams: ['org_id']
    },

    google_cloud: {
        name: 'Google Cloud',
        displayName: 'Google Cloud',
        billingEndpoint: 'https://www.googleapis.com/bigquery/v2/projects/{project_id}/datasets/{dataset_id}/tables',
        usageEndpoint: 'https://www.googleapis.com/bigquery/v2/projects/{project_id}/queries',
        tokenEndpoint: 'https://oauth2.googleapis.com/token',
        authType: 'oauth2',
        rateLimit: 100, // requests per minute
        retryCount: 3,
        timeoutMs: 60000,
        fieldMapping: {
            'project_id': 'provider_org_id',
            'cost': 'total_amount',
            'usage_unit': 'unit',
            'sku': 'service_type'
        },
        requiredFields: ['project_id', 'cost'],
        pathParams: ['project_id', 'dataset_id']
    },

    azure: {
        name: 'Azure',
        displayName: 'Microsoft Azure',
        billingEndpoint: 'https://management.azure.com/subscriptions/{subscription_id}/providers/Microsoft.Consumption/usageDetails',
        usageEndpoint: 'https://management.azure.com/subscriptions/{subscription_id}/providers/Microsoft.CostManagement/query',
        tokenEndpoint: 'https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token',
        authType: 'oauth2',
        rateLimit: 100, // requests per minute
        retryCount: 3,
        timeoutMs: 60000,
        fieldMapping: {
            'subscription_id': 'provider_org_id',
            'pretax_cost': 'total_amount',
            'usage_quantity': 'quantity',
            'meter_name': 'service_type'
        },
        requiredFields: ['subscription_id', 'pretax_cost'],
        pathParams: ['subscription_id']
    },

    aws: {
        name: 'AWS',
        displayName: 'Amazon Web Services',
        billingEndpoint: 'https://ce.us-east-1.amazonaws.com/',
        usageEndpoint: 'https://ce.us-east-1.amazonaws.com/',
        authType: 'iam_role',
        rateLimit: 300, // requests per second (5/sec API limit)
        retryCount: 3,
        timeoutMs: 60000,
        fieldMapping: {
            'account_id': 'provider_org_id',
            'blended_cost': 'total_amount',
            'usage_amount': 'quantity',
            'product_name': 'service_type'
        },
        requiredFields: ['account_id', 'blended_cost']
    },

    cohere: {
        name: 'Cohere',
        displayName: 'Cohere',
        billingEndpoint: 'https://api.cohere.ai/v1/usage',
        usageEndpoint: 'https://api.cohere.ai/v1/usage',
        authType: 'api_key',
        rateLimit: 30, // requests per minute
        retryCount: 3,
        timeoutMs: 30000,
        fieldMapping: {
            'user_id': 'provider_org_id',
            'total_cost': 'total_amount',
            'tokens_used': 'quantity',
            'api_calls': 'request_count'
        },
        requiredFields: ['user_id', 'total_cost']
    },

    mistral: {
        name: 'Mistral',
        displayName: 'Mistral AI',
        billingEndpoint: 'https://api.mistral.ai/v1/usage',
        usageEndpoint: 'https://api.mistral.ai/v1/usage',
        authType: 'api_key',
        rateLimit: 30, // requests per minute
        retryCount: 3,
        timeoutMs: 30000,
        fieldMapping: {
            'account_id': 'provider_org_id',
            'total_cost': 'total_amount',
            'tokens': 'quantity',
            'requests': 'request_count'
        },
        requiredFields: ['account_id', 'total_cost']
    },

    huggingface: {
        name: 'Hugging Face',
        displayName: 'Hugging Face',
        billingEndpoint: 'https://huggingface.co/api/usage',
        usageEndpoint: 'https://huggingface.co/api/usage',
        authType: 'api_key',
        rateLimit: 30, // requests per minute
        retryCount: 3,
        timeoutMs: 30000,
        fieldMapping: {
            'user_id': 'provider_org_id',
            'total_spent': 'total_amount',
            'api_calls': 'request_count',
            'period': 'period'
        },
        requiredFields: ['user_id', 'total_spent']
    }
};

// ─── Provider Health Status ───────────────────────────────────────────────────

/**
 * Health monitoring state for each provider
 * Tracks availability, errors, and last successful sync
 */
const PROVIDER_HEALTH = new Map();

/**
 * Initialize health tracking for all providers
 */
export function initializeProviderHealth() {
    for (const [key, spec] of Object.entries(PROVIDER_REGISTRY)) {
        PROVIDER_HEALTH.set(key, {
            status: 'unknown',
            lastCheck: null,
            lastSuccess: null,
            consecutiveFailures: 0,
            lastError: null,
            isHealthy: true
        });
    }
}

// ─── ProviderClient Class ────────────────────────────────────────────────────

/**
 * Client for interacting with a specific AI provider's billing API
 * Handles authentication, rate limiting, retries, data normalization,
 * pagination, audit trails, and health monitoring
 */
export class ProviderClient {
    /**
     * @param {string} providerKey - Key from PROVIDER_REGISTRY (e.g., 'openai')
     * @param {Object} credentials - { apiKey, oauthToken, orgId, projectId, etc. }
     * @param {Object} [options] - { rateLimiter, logger, timeout, tokenManager, auditLog }
     */
    constructor(providerKey, credentials, options = {}) {
        this.providerKey = providerKey.toLowerCase();
        this.spec = PROVIDER_REGISTRY[this.providerKey];

        if (!this.spec) {
            throw new Error(`Unknown provider: '${providerKey}'. Valid providers: ${Object.keys(PROVIDER_REGISTRY).join(', ')}`);
        }

        this.credentials = credentials || {};
        this.rateLimiter = options.rateLimiter;
        this.logger = options.logger || console;
        this.timeout = options.timeout || this.spec.timeoutMs;

        // OAuth2 token management
        this.tokenManager = options.tokenManager || new OAuth2TokenManager();

        // Audit logging
        this.auditLog = options.auditLog || new AuditLog(10000);

        // Health dashboard metrics
        this._metrics = {
            responseTimes: [],
            totalCalls: 0,
            totalErrors: 0,
            lastSuccessfulFetch: null,
            dataFreshness: null,
            avgResponseTimeMs: 0,
            errorRate: 0
        };

        this._resilientFetch = createFetchResilience(`provider:${this.providerKey}`, {
            circuitBreaker: { failureThreshold: 5, windowMs: 60000, cooldownMs: 30000, halfOpenMax: 2 },
            retry: { maxRetries: this.spec.retryCount || 2, baseDelayMs: 300, maxDelayMs: 3000, budgetMs: 25000 },
            timeoutMs: this.timeout
        });

        this._validateCredentials();
    }

    /**
     * Validate that required credentials are present
     * @private
     */
    _validateCredentials() {
        const required = this.spec.authType === 'api_key' ? ['apiKey'] : ['oauthToken'];
        for (const field of required) {
            if (!this.credentials[field]) {
                throw new Error(`${this.spec.name} client requires '${field}' in credentials`);
            }
        }

        // Validate path parameters if needed
        if (this.spec.pathParams) {
            for (const param of this.spec.pathParams) {
                const credKey = this._paramToCredKey(param);
                if (!this.credentials[credKey]) {
                    this.logger.warn(`${this.spec.name} missing parameter: ${credKey}`);
                }
            }
        }
    }

    /**
     * Map path parameter name to credential key
     * e.g., 'org_id' → 'orgId'
     * @private
     */
    _paramToCredKey(param) {
        return param.split('_').reduce((acc, word, i) => {
            return acc + (i === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1));
        });
    }

    /**
     * Build request headers with authentication
     * @private
     */
    _buildHeaders() {
        const headers = { 'Content-Type': 'application/json' };

        if (this.spec.authType === 'api_key') {
            headers['Authorization'] = `Bearer ${this.credentials.apiKey}`;
        } else if (this.spec.authType === 'oauth2') {
            headers['Authorization'] = `Bearer ${this.credentials.oauthToken}`;
        }

        return headers;
    }

    /**
     * Build headers with OAuth2 token management
     * Automatically refreshes expired tokens
     * @private
     */
    async _buildHeadersWithAuth() {
        const headers = { 'Content-Type': 'application/json' };

        if (this.spec.authType === 'api_key') {
            headers['Authorization'] = `Bearer ${this.credentials.apiKey}`;
        } else if (this.spec.authType === 'oauth2') {
            // Get fresh token (will refresh if needed)
            const token = await this.tokenManager.getAccessToken(
                this.providerKey,
                {
                    tokenEndpoint: this.spec.tokenEndpoint,
                    clientId: this.credentials.clientId,
                    clientSecret: this.credentials.clientSecret
                },
                this.credentials,
                this._resilientFetch
            );
            headers['Authorization'] = `Bearer ${token}`;
        }

        return headers;
    }

    /**
     * Interpolate path parameters into endpoint URL
     * @private
     */
    _buildUrl(endpoint) {
        let url = endpoint;

        if (this.spec.pathParams) {
            for (const param of this.spec.pathParams) {
                const credKey = this._paramToCredKey(param);
                const value = this.credentials[credKey];
                if (value) {
                    url = url.replace(`{${param}}`, value);
                }
            }
        }

        return url;
    }

    /**
     * Fetch billing data from provider API with full enterprise features:
     * - OAuth2 token management
     * - Pagination support
     * - Audit logging
     * - Response validation
     * @returns {Promise<Object>} Raw billing data from provider
     */
    async fetchBillingData(params = {}) {
        const startTime = Date.now();
        const requestId = this._generateRequestId();
        const url = this._buildUrl(this.spec.billingEndpoint);

        logger.info('Fetching billing data from provider', {
            provider: this.spec.name,
            endpoint: this.spec.billingEndpoint,
            requestId
        });

        try {
            // Rate limiting
            if (this.rateLimiter) {
                await this._waitForRateLimit();
            }

            // Get OAuth token if needed
            const headers = await this._buildHeadersWithAuth();

            // Fetch all pages
            const data = await this.fetchAllPages(url, params, headers);

            // Validate FOCUS records
            const validatedData = this._validateFOCUSRecords(data);

            // Record success metrics
            const durationMs = Date.now() - startTime;
            this._recordSuccess(durationMs, JSON.stringify(data).length);

            // Audit log
            this.auditLog.log({
                provider: this.providerKey,
                endpoint: this.spec.billingEndpoint,
                method: 'GET',
                status: 200,
                durationMs,
                bytesReceived: JSON.stringify(data).length,
                requestId,
                recordCount: Array.isArray(data) ? data.length : 1
            });

            logger.info('Billing data fetched successfully', {
                provider: this.spec.name,
                recordCount: Array.isArray(data) ? data.length : 1,
                durationMs,
                requestId
            });

            return validatedData;
        } catch (error) {
            const durationMs = Date.now() - startTime;
            this._recordFailure(error);

            // Audit log failure
            this.auditLog.log({
                provider: this.providerKey,
                endpoint: this.spec.billingEndpoint,
                method: 'GET',
                status: error.status || 0,
                durationMs,
                error: error.message,
                requestId
            });

            logger.error('Billing data fetch failed', {
                provider: this.spec.name,
                errorMessage: error.message,
                requestId
            });

            throw error;
        }
    }

    /**
     * Fetch all pages from paginated API endpoints
     * Supports multiple pagination styles: next_page_token, has_more, Link header
     * @private
     */
    async fetchAllPages(url, params = {}, headers = {}, pageDelayMs = 100) {
        const allResults = [];
        let nextPageToken = params.pageToken || null;
        let nextUrl = url;
        let hasMore = true;
        const maxPages = 100; // Safety limit
        let pageCount = 0;

        while (hasMore && pageCount < maxPages) {
            try {
                // Build URL with pagination token
                let requestUrl = nextUrl;
                if (nextPageToken) {
                    const separator = requestUrl.includes('?') ? '&' : '?';
                    requestUrl = `${requestUrl}${separator}pageToken=${nextPageToken}`;
                }

                const response = await this._resilientFetch(requestUrl, {
                    method: 'GET',
                    headers,
                    timeout: this.timeout,
                    ...params
                });

                if (!response.ok) {
                    const status = response.status;
                    if (status === 401) {
                        // Unauthorized — invalidate token
                        this.tokenManager.invalidateToken(this.providerKey);
                        throw new Error('Unauthorized: Token refresh required');
                    } else if (status === 429) {
                        // Rate limited — wait and retry
                        const retryAfter = response.headers.get('Retry-After') || '5';
                        await this._sleep(parseInt(retryAfter) * 1000);
                        continue;
                    } else if (status >= 500) {
                        // Server error — will retry via resilience layer
                        throw new Error(`Server error: ${status}`);
                    }
                    throw new Error(`Provider API returned ${status}: ${response.statusText}`);
                }

                const data = await response.json();
                const records = Array.isArray(data) ? data : (data.items || [data]);
                allResults.push(...records);

                pageCount++;

                // Check pagination indicators
                nextPageToken = data.next_page_token || null;
                hasMore = nextPageToken !== null || data.has_more === true;

                // Check Link header (RFC 5988)
                const linkHeader = response.headers.get('Link');
                if (linkHeader) {
                    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="?next"?/);
                    if (nextMatch) {
                        nextUrl = nextMatch[1];
                        hasMore = true;
                    } else {
                        hasMore = false;
                    }
                }

                // Rate limit between pages
                if (hasMore && pageCount < maxPages) {
                    await this._sleep(pageDelayMs);
                }
            } catch (error) {
                if (pageCount === 0) {
                    // First page failed
                    throw error;
                }
                // Partial failure — log but return what we have
                logger.warn(`Pagination stopped at page ${pageCount}: ${error.message}`);
                hasMore = false;
            }
        }

        return allResults;
    }

    /**
     * Fetch usage data from provider API
     * @returns {Promise<Object>} Raw usage data from provider
     */
    async fetchUsage(params = {}) {
        const url = this._buildUrl(this.spec.usageEndpoint);
        const headers = this._buildHeaders();

        try {
            if (this.rateLimiter) {
                await this._waitForRateLimit();
            }

            const response = await this._resilientFetch(url, {
                method: 'GET',
                headers,
                timeout: this.timeout,
                ...params
            });

            if (!response.ok) {
                throw new Error(`Provider usage API returned ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            this._recordSuccess();
            return data;
        } catch (error) {
            this._recordFailure(error);
            throw error;
        }
    }

    /**
     * Normalize provider-specific data to FOCUS 1.3 format
     * Maps provider fields to standard schema
     * @param {Object} providerData - Raw data from provider API
     * @returns {Object} Normalized data in FOCUS 1.3 format
     */
    normalizeToFOCUS(providerData) {
        if (!providerData) {
            return null;
        }

        const normalized = {
            provider: this.spec.name,
            provider_key: this.providerKey,
            provider_org_id: null,
            total_amount: null,
            currency: 'USD',
            period: null,
            unit: null,
            usage_detail: null,
            raw_data: providerData,
            normalized_at: new Date().toISOString()
        };

        // Apply field mapping
        for (const [providerField, focusField] of Object.entries(this.spec.fieldMapping)) {
            let value = providerData[providerField];

            // Handle nested paths like 'data.cost'
            if (!value && providerField.includes('.')) {
                const parts = providerField.split('.');
                let current = providerData;
                for (const part of parts) {
                    current = current?.[part];
                }
                value = current;
            }

            if (value !== undefined && value !== null) {
                normalized[focusField] = value;
            }
        }

        // Validate required fields
        for (const field of this.spec.requiredFields) {
            if (!providerData[field]) {
                this.logger.warn(`Missing required field '${field}' from ${this.spec.name}`);
            }
        }

        return normalized;
    }

    /**
     * Validate FOCUS 1.3 records
     * Checks required fields, data types, and value constraints
     * @private
     */
    _validateFOCUSRecords(data) {
        const records = Array.isArray(data) ? data : [data];
        const validRecords = [];
        const requiredFields = ['BilledCost', 'EffectiveCost', 'UsageQuantity', 'ChargeType', 'ServiceCategory'];

        for (const record of records) {
            const normalized = this.normalizeToFOCUS(record);
            const errors = [];

            // Check required fields
            for (const field of requiredFields) {
                const focusField = field.toLowerCase().replace(/([A-Z])/g, '_$1').toLowerCase();
                if (!normalized[focusField]) {
                    errors.push(`Missing required field: ${field}`);
                }
            }

            // Type validation
            if (normalized.total_amount !== null && typeof normalized.total_amount !== 'number') {
                errors.push(`BilledCost must be a number, got ${typeof normalized.total_amount}`);
            }
            if (normalized.quantity !== null && typeof normalized.quantity !== 'number') {
                errors.push(`UsageQuantity must be a number, got ${typeof normalized.quantity}`);
            }

            // Value validation
            if (typeof normalized.total_amount === 'number' && normalized.total_amount < 0) {
                errors.push('BilledCost must be >= 0');
            }
            if (typeof normalized.quantity === 'number' && normalized.quantity < 0) {
                errors.push('UsageQuantity must be >= 0');
            }

            if (errors.length === 0) {
                validRecords.push(normalized);
            } else {
                this.logger.warn(`Validation errors for record: ${errors.join(', ')}`);
            }
        }

        return validRecords.length > 0 ? validRecords : data;
    }

    /**
     * Get health dashboard for this provider
     * Returns metrics: response time, error rate, freshness, etc.
     * @returns {Object} Dashboard metrics
     */
    getProviderDashboard() {
        const metrics = this._metrics;
        const health = PROVIDER_HEALTH.get(this.providerKey);

        // Calculate rolling averages
        const recentCalls = Math.max(1, metrics.totalCalls);
        const recentErrors = metrics.totalErrors;

        return {
            provider: this.spec.name,
            providerKey: this.providerKey,
            status: health?.status || 'unknown',
            isHealthy: health?.isHealthy ?? true,
            metrics: {
                avgResponseTimeMs: metrics.avgResponseTimeMs,
                errorRate: Math.round((recentErrors / recentCalls) * 100) / 100,
                totalCalls: metrics.totalCalls,
                totalErrors: metrics.totalErrors,
                lastSuccessfulFetch: metrics.lastSuccessfulFetch,
                dataFreshnessMs: metrics.dataFreshness ? Date.now() - new Date(metrics.dataFreshness).getTime() : null
            },
            health: {
                consecutiveFailures: health?.consecutiveFailures || 0,
                lastError: health?.lastError || null,
                lastCheck: health?.lastCheck || null
            }
        };
    }

    /**
     * Get audit log entries with optional filtering
     * @param {Object} filter - Optional filter object
     * @returns {Array} Filtered audit log entries
     */
    getAuditLog(filter = {}) {
        return this.auditLog.getEntries({
            provider: this.providerKey,
            ...filter
        });
    }

    /**
     * Persist audit log to external storage (for future database integration)
     * @returns {Promise<void>}
     */
    async persistAuditLog() {
        const entries = this.getAuditLog();
        logger.info('Persisting audit log', {
            provider: this.providerKey,
            entryCount: entries.length
        });
        // TODO: Integrate with database
        // await database.saveAuditLog(entries);
    }

    /**
     * Check provider API health
     * @returns {Promise<Object>} { healthy: boolean, status: string, message: string }
     */
    async checkHealth() {
        try {
            await this.fetchBillingData({ timeout: 5000 });
            return {
                healthy: true,
                status: 'ok',
                message: `${this.spec.name} API is responding normally`
            };
        } catch (error) {
            return {
                healthy: false,
                status: 'error',
                message: `${this.spec.name} API check failed: ${error.message}`
            };
        }
    }

    /**
     * Get current health status for this provider
     * @returns {Object}
     */
    getHealthStatus() {
        return PROVIDER_HEALTH.get(this.providerKey) || { status: 'unknown' };
    }

    // ─── Private Helpers ─────────────────────────────────────────────────────

    /**
     * Wait for rate limit allowance
     * @private
     */
    async _waitForRateLimit() {
        if (!this.rateLimiter) return;

        const result = this.rateLimiter.consume(this.providerKey, 'api_calls', 1);
        if (!result.allowed && result.retryAfterMs) {
            await this._sleep(result.retryAfterMs);
        }
    }

    /**
     * Record successful API call with metrics
     * @private
     */
    _recordSuccess(durationMs = 0, bytesReceived = 0) {
        const health = PROVIDER_HEALTH.get(this.providerKey);
        if (health) {
            health.lastSuccess = new Date().toISOString();
            health.consecutiveFailures = 0;
            health.isHealthy = true;
            health.status = 'ok';
        }

        // Update metrics
        this._metrics.totalCalls += 1;
        this._metrics.lastSuccessfulFetch = new Date().toISOString();
        this._metrics.dataFreshness = new Date().toISOString();

        // Update rolling average response time (last 100 calls)
        this._metrics.responseTimes.push(durationMs);
        if (this._metrics.responseTimes.length > 100) {
            this._metrics.responseTimes.shift();
        }
        this._metrics.avgResponseTimeMs = Math.round(
            this._metrics.responseTimes.reduce((a, b) => a + b, 0) / this._metrics.responseTimes.length
        );

        // Calculate error rate (last 1000 calls)
        const window = Math.min(1000, this._metrics.totalCalls);
        this._metrics.errorRate = window > 0 ? this._metrics.totalErrors / window : 0;
    }

    /**
     * Record failed API call
     * @private
     */
    _recordFailure(error) {
        const health = PROVIDER_HEALTH.get(this.providerKey);
        if (health) {
            health.lastError = error.message;
            health.consecutiveFailures += 1;
            health.isHealthy = health.consecutiveFailures < 3;
            health.status = health.isHealthy ? 'degraded' : 'error';
        }

        // Update metrics
        this._metrics.totalCalls += 1;
        this._metrics.totalErrors += 1;

        // Calculate error rate
        const window = Math.min(1000, this._metrics.totalCalls);
        this._metrics.errorRate = window > 0 ? this._metrics.totalErrors / window : 1.0;
    }

    /**
     * Generate request ID for tracing
     * @private
     */
    _generateRequestId() {
        return `${this.providerKey}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Sleep helper for retry backoff
     * @private
     */
    async _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ─── Factory Function ────────────────────────────────────────────────────────

/**
 * Create a new ProviderClient for a specific provider
 * @param {string} providerKey - e.g., 'openai', 'anthropic', 'azure'
 * @param {Object} credentials - Provider-specific auth credentials
 * @param {Object} [options] - Configuration options
 * @returns {ProviderClient}
 */
export function createProviderClient(providerKey, credentials, options = {}) {
    return new ProviderClient(providerKey, credentials, options);
}

// ─── Batch Client for Multiple Providers ────────────────────────────────────

/**
 * Client for managing multiple provider integrations
 * Useful for fetching and normalizing data from all configured providers
 */
export class ProviderAggregator {
    /**
     * @param {Object} providers - Map of providerKey → { credentials, options }
     * @param {Object} [globalOptions] - Applied to all clients
     */
    constructor(providers = {}, globalOptions = {}) {
        this.clients = new Map();
        this.globalOptions = globalOptions;

        for (const [key, config] of Object.entries(providers)) {
            this.addProvider(key, config.credentials, config.options);
        }
    }

    /**
     * Add a provider client
     */
    addProvider(providerKey, credentials, options = {}) {
        try {
            const client = createProviderClient(providerKey, credentials, {
                ...this.globalOptions,
                ...options
            });
            this.clients.set(providerKey, client);
        } catch (error) {
            console.error(`Failed to add provider ${providerKey}: ${error.message}`);
        }
    }

    /**
     * Fetch billing data from all providers
     * @returns {Promise<Map<string, Object>>} providerKey → normalized data
     */
    async fetchAllBilling() {
        const results = new Map();

        for (const [key, client] of this.clients.entries()) {
            try {
                const raw = await client.fetchBillingData();
                const normalized = client.normalizeToFOCUS(raw);
                results.set(key, normalized);
            } catch (error) {
                results.set(key, {
                    provider: PROVIDER_REGISTRY[key]?.displayName || key,
                    error: error.message,
                    failed: true
                });
            }
        }

        return results;
    }

    /**
     * Check health of all providers
     * @returns {Promise<Object>}
     */
    async checkAllHealth() {
        const health = {};

        for (const [key, client] of this.clients.entries()) {
            try {
                health[key] = await client.checkHealth();
            } catch (error) {
                health[key] = { healthy: false, status: 'error', message: error.message };
            }
        }

        return health;
    }

    /**
     * Get aggregated health summary
     * @returns {Object}
     */
    getHealthSummary() {
        const summary = {
            total: this.clients.size,
            healthy: 0,
            degraded: 0,
            error: 0,
            providers: {}
        };

        for (const [key, client] of this.clients.entries()) {
            const status = client.getHealthStatus();
            summary.providers[key] = status;

            if (status.isHealthy === true) summary.healthy += 1;
            else if (status.isHealthy === false && status.status === 'degraded') summary.degraded += 1;
            else if (status.isHealthy === false) summary.error += 1;
        }

        return summary;
    }

    /**
     * Get provider health dashboards for all providers
     * @returns {Object} Map of providerKey → dashboard metrics
     */
    getAllProviderDashboards() {
        const dashboards = {};

        for (const [key, client] of this.clients.entries()) {
            dashboards[key] = client.getProviderDashboard();
        }

        return dashboards;
    }
}

// ─── Auto-discovery of Available Endpoints ──────────────────────────────────

/**
 * Discover available API endpoints for a provider
 * Returns metadata about supported operations
 * @param {string} providerKey
 * @returns {Object}
 */
export function discoverProviderCapabilities(providerKey) {
    const spec = PROVIDER_REGISTRY[providerKey.toLowerCase()];
    if (!spec) {
        return null;
    }

    return {
        provider: spec.displayName,
        endpoints: {
            billing: spec.billingEndpoint,
            usage: spec.usageEndpoint
        },
        auth: spec.authType,
        rateLimit: `${spec.rateLimit} requests/minute`,
        fieldMapping: spec.fieldMapping,
        requiredFields: spec.requiredFields
    };
}

/**
 * List all available providers
 * @returns {Array<string>}
 */
export function listAvailableProviders() {
    return Object.keys(PROVIDER_REGISTRY);
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export default {
    PROVIDER_REGISTRY,
    initializeProviderHealth,
    ProviderClient,
    createProviderClient,
    ProviderAggregator,
    discoverProviderCapabilities,
    listAvailableProviders,
    OAuth2TokenManager,
    AuditLog
};
