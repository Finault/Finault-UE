/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TENANT ONBOARDING AUTOMATION — Gap 7
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Comprehensive tenant onboarding automation system for AgentOS platform
 * Manages 8-state onboarding flow, provider OAuth/API connections, invoice processing,
 * reconciliation, and close pack generation with metrics tracking.
 *
 * Key Features:
 * - State machine with 8 onboarding states
 * - OAuth 2.0 and API key provider authentication
 * - Invoice upload and parsing
 * - Reconciliation tracking
 * - Close pack generation with metrics
 * - Complete audit history
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS: ONBOARDING STATES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 8-state onboarding flow for new tenants
 */
export const ONBOARDING_STATES = {
    account_created: 'account_created',
    provider_connecting: 'provider_connecting',
    provider_connected: 'provider_connected',
    first_invoice_uploading: 'first_invoice_uploading',
    first_invoice_parsed: 'first_invoice_parsed',
    first_recon_running: 'first_recon_running',
    first_close_pack_generated: 'first_close_pack_generated',
    onboarding_complete: 'onboarding_complete',
    onboarding_failed: 'onboarding_failed'
};

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS: STATE TRANSITION RULES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maps each state to valid next states
 * Defines the state machine transitions
 */
export const VALID_TRANSITIONS = new Map([
    [ONBOARDING_STATES.account_created, [
        ONBOARDING_STATES.provider_connecting,
        ONBOARDING_STATES.onboarding_failed
    ]],
    [ONBOARDING_STATES.provider_connecting, [
        ONBOARDING_STATES.provider_connected,
        ONBOARDING_STATES.onboarding_failed
    ]],
    [ONBOARDING_STATES.provider_connected, [
        ONBOARDING_STATES.first_invoice_uploading,
        ONBOARDING_STATES.onboarding_failed
    ]],
    [ONBOARDING_STATES.first_invoice_uploading, [
        ONBOARDING_STATES.first_invoice_parsed,
        ONBOARDING_STATES.onboarding_failed
    ]],
    [ONBOARDING_STATES.first_invoice_parsed, [
        ONBOARDING_STATES.first_recon_running,
        ONBOARDING_STATES.onboarding_failed
    ]],
    [ONBOARDING_STATES.first_recon_running, [
        ONBOARDING_STATES.first_close_pack_generated,
        ONBOARDING_STATES.onboarding_failed
    ]],
    [ONBOARDING_STATES.first_close_pack_generated, [
        ONBOARDING_STATES.onboarding_complete,
        ONBOARDING_STATES.onboarding_failed
    ]],
    [ONBOARDING_STATES.onboarding_complete, []],
    [ONBOARDING_STATES.onboarding_failed, [
        // retry handled separately via retryFromFailure()
    ]]
]);

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS: PROVIDER OAUTH CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * OAuth and API key configurations for 8 provider platforms
 */
export const PROVIDER_OAUTH_CONFIGS = {
    openai: {
        authType: 'api_key',
        keyHeader: 'Authorization',
        keyPrefix: 'Bearer ',
        validateEndpoint: 'https://api.openai.com/v1/models',
        usageEndpoint: 'https://api.openai.com/v1/organization/usage/completions'
    },
    anthropic: {
        authType: 'api_key',
        keyHeader: 'X-API-Key',
        validateEndpoint: 'https://api.anthropic.com/v1/messages',
        usageEndpoint: null
    },
    aws: {
        authType: 'oauth2',
        tokenEndpoint: 'https://signin.aws.amazon.com/oauth/token',
        scopes: ['ce:GetCostAndUsage', 'ce:GetCostForecast'],
        validateEndpoint: 'https://ce.us-east-1.amazonaws.com'
    },
    azure: {
        authType: 'oauth2',
        tokenEndpoint: 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token',
        scopes: ['https://management.azure.com/.default'],
        validateEndpoint: 'https://management.azure.com/subscriptions'
    },
    google_cloud: {
        authType: 'oauth2',
        tokenEndpoint: 'https://oauth2.googleapis.com/token',
        scopes: ['https://www.googleapis.com/auth/cloud-billing.readonly'],
        validateEndpoint: 'https://cloudbilling.googleapis.com/v1/billingAccounts'
    },
    cohere: {
        authType: 'api_key',
        keyHeader: 'Authorization',
        keyPrefix: 'Bearer ',
        validateEndpoint: 'https://api.cohere.ai/v1/models'
    },
    mistral: {
        authType: 'api_key',
        keyHeader: 'Authorization',
        keyPrefix: 'Bearer ',
        validateEndpoint: 'https://api.mistral.ai/v1/models'
    },
    together_ai: {
        authType: 'api_key',
        keyHeader: 'Authorization',
        keyPrefix: 'Bearer ',
        validateEndpoint: 'https://api.together.xyz/v1/models'
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// CLASS: TenantOnboardingManager
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Manages the complete onboarding lifecycle for tenants
 * Tracks state transitions, provider connections, and onboarding metrics
 */
export class TenantOnboardingManager {
    constructor(options = {}) {
        this.tenants = new Map(); // orgId -> { orgId, state, providerConnections, createdAt, history, metrics }
        this.providerConfigs = options.providerConfigs || PROVIDER_OAUTH_CONFIGS;
    }

    /**
     * Start onboarding for a new tenant
     * @param {string} orgId - Organization ID
     * @param {string} plan - Subscription plan
     * @returns {object} Onboarding record with nextSteps
     */
    startOnboarding(orgId, plan) {
        if (this.tenants.has(orgId)) {
            throw new Error(`Tenant ${orgId} onboarding already started`);
        }

        const now = new Date();
        const tenantRecord = {
            orgId,
            plan,
            state: ONBOARDING_STATES.account_created,
            providerConnections: new Map(),
            createdAt: now,
            history: [
                {
                    state: ONBOARDING_STATES.account_created,
                    timestamp: now,
                    metadata: { plan }
                }
            ],
            metrics: {},
            lastFailureReason: null,
            lastSuccessfulState: ONBOARDING_STATES.account_created
        };

        this.tenants.set(orgId, tenantRecord);

        return {
            orgId,
            state: ONBOARDING_STATES.account_created,
            nextSteps: ['Connect a provider', 'Upload first invoice']
        };
    }

    /**
     * Get current onboarding state and history
     * @param {string} orgId - Organization ID
     * @returns {object} Current state, history, and progress
     */
    getState(orgId) {
        if (!this.tenants.has(orgId)) {
            throw new Error(`Tenant ${orgId} not found`);
        }

        const tenant = this.tenants.get(orgId);
        const stateIndex = Object.values(ONBOARDING_STATES).indexOf(tenant.state);
        const totalStates = Object.keys(ONBOARDING_STATES).length - 1; // exclude failed state

        return {
            orgId: tenant.orgId,
            state: tenant.state,
            history: tenant.history,
            providerCount: tenant.providerConnections.size,
            createdAt: tenant.createdAt,
            progress: Math.round((stateIndex / totalStates) * 100)
        };
    }

    /**
     * Transition to a new state
     * @param {string} orgId - Organization ID
     * @param {string} targetState - Target state
     * @param {object} metadata - Optional transition metadata
     * @throws {Error} if transition is invalid
     */
    transition(orgId, targetState, metadata = {}) {
        if (!this.tenants.has(orgId)) {
            throw new Error(`Tenant ${orgId} not found`);
        }

        if (!Object.values(ONBOARDING_STATES).includes(targetState)) {
            throw new Error(`Invalid state: ${targetState}`);
        }

        const tenant = this.tenants.get(orgId);
        const validNextStates = VALID_TRANSITIONS.get(tenant.state) || [];

        if (!validNextStates.includes(targetState)) {
            throw new Error(
                `Cannot transition from ${tenant.state} to ${targetState}`
            );
        }

        const now = new Date();
        tenant.state = targetState;

        // Only update lastSuccessfulState if not transitioning to failed state
        if (targetState !== ONBOARDING_STATES.onboarding_failed) {
            tenant.lastSuccessfulState = targetState;
        }

        tenant.history.push({
            state: targetState,
            timestamp: now,
            metadata
        });
    }

    /**
     * Connect a provider to the tenant
     * @param {string} orgId - Organization ID
     * @param {string} providerId - Provider ID
     * @param {object} credentials - Provider credentials (apiKey or oauth tokens)
     * @returns {object} Connection confirmation with capabilities
     */
    connectProvider(orgId, providerId, credentials) {
        if (!this.tenants.has(orgId)) {
            throw new Error(`Tenant ${orgId} not found`);
        }

        if (!this.providerConfigs[providerId]) {
            throw new Error(`Unknown provider: ${providerId}`);
        }

        if (!credentials || Object.keys(credentials).length === 0) {
            throw new Error('Credentials cannot be empty');
        }

        const tenant = this.tenants.get(orgId);

        // Validate credentials
        const validation = this.validateProviderCredentials(providerId, credentials);

        if (!validation.valid) {
            throw new Error(`Provider validation failed: ${providerId}`);
        }

        // Store credentials
        tenant.providerConnections.set(providerId, {
            providerId,
            credentials,
            connected: true,
            validatedAt: new Date(),
            capabilities: validation.capabilities
        });

        // Transition to provider_connecting if not already connected
        if (tenant.state === ONBOARDING_STATES.account_created) {
            this.transition(orgId, ONBOARDING_STATES.provider_connecting, {
                providerId
            });
        }

        // Transition to provider_connected
        if (tenant.state === ONBOARDING_STATES.provider_connecting) {
            this.transition(orgId, ONBOARDING_STATES.provider_connected, {
                providerId
            });
        }

        return {
            connected: true,
            provider: providerId,
            validatedAt: validation.validatedAt,
            capabilities: validation.capabilities
        };
    }

    /**
     * Validate provider credentials
     * @param {string} providerId - Provider ID
     * @param {object} credentials - Credentials to validate
     * @returns {object} Validation result with capabilities
     */
    validateProviderCredentials(providerId, credentials) {
        const config = this.providerConfigs[providerId];

        if (!config) {
            throw new Error(`Provider config not found: ${providerId}`);
        }

        if (config.authType === 'api_key') {
            if (!credentials.apiKey) {
                return { valid: false, provider: providerId };
            }

            // Simulate API call validation (real impl would call validateEndpoint)
            return {
                valid: true,
                provider: providerId,
                capabilities: ['read', 'usage_tracking'],
                validatedAt: new Date()
            };
        } else if (config.authType === 'oauth2') {
            if (!credentials.accessToken) {
                return { valid: false, provider: providerId };
            }

            return {
                valid: true,
                provider: providerId,
                capabilities: ['read', 'cost_analysis'],
                validatedAt: new Date()
            };
        }

        return { valid: false, provider: providerId };
    }

    /**
     * Disconnect a provider
     * @param {string} orgId - Organization ID
     * @param {string} providerId - Provider ID
     */
    disconnectProvider(orgId, providerId) {
        if (!this.tenants.has(orgId)) {
            throw new Error(`Tenant ${orgId} not found`);
        }

        const tenant = this.tenants.get(orgId);
        tenant.providerConnections.delete(providerId);
    }

    /**
     * Get all provider connections for a tenant
     * @param {string} orgId - Organization ID
     * @returns {array} Array of connected providers
     */
    getProviderConnections(orgId) {
        if (!this.tenants.has(orgId)) {
            throw new Error(`Tenant ${orgId} not found`);
        }

        const tenant = this.tenants.get(orgId);
        return Array.from(tenant.providerConnections.values());
    }

    /**
     * Upload and process first invoice
     * @param {string} orgId - Organization ID
     * @param {object} invoiceData - Invoice data
     * @returns {object} Parsed invoice with confidence
     */
    uploadFirstInvoice(orgId, invoiceData) {
        if (!this.tenants.has(orgId)) {
            throw new Error(`Tenant ${orgId} not found`);
        }

        const tenant = this.tenants.get(orgId);

        // Transition to uploading
        this.transition(orgId, ONBOARDING_STATES.first_invoice_uploading, {
            invoiceDate: invoiceData.date
        });

        // Simulate invoice parsing
        const lineItems = invoiceData.lineItems || [
            { description: 'API usage', amount: 100, quantity: 1000 }
        ];

        const metrics = this.tenants.get(orgId).metrics;
        metrics.time_to_first_invoice = new Date() - tenant.createdAt;

        // Transition to parsed
        this.transition(orgId, ONBOARDING_STATES.first_invoice_parsed, {
            lineItemCount: lineItems.length
        });

        return {
            parsed: true,
            lineItems,
            confidence: 0.95,
            totalAmount: lineItems.reduce((sum, item) => sum + item.amount, 0)
        };
    }

    /**
     * Run first reconciliation
     * @param {string} orgId - Organization ID
     * @returns {object} Reconciliation results
     */
    runFirstReconciliation(orgId) {
        if (!this.tenants.has(orgId)) {
            throw new Error(`Tenant ${orgId} not found`);
        }

        const tenant = this.tenants.get(orgId);

        if (tenant.state !== ONBOARDING_STATES.first_invoice_parsed) {
            throw new Error('Must upload invoice before reconciliation');
        }

        // Transition to running
        this.transition(orgId, ONBOARDING_STATES.first_recon_running, {});

        // Simulate reconciliation
        const matchRate = 0.98;
        const discrepancies = 2;

        // Transition to completed
        this.transition(orgId, ONBOARDING_STATES.first_close_pack_generated, {
            matchRate,
            discrepancies
        });

        return {
            reconciled: true,
            matchRate,
            discrepancies,
            timestamp: new Date()
        };
    }

    /**
     * Generate first close pack
     * @param {string} orgId - Organization ID
     * @returns {object} Close pack details
     */
    generateFirstClosePack(orgId) {
        if (!this.tenants.has(orgId)) {
            throw new Error(`Tenant ${orgId} not found`);
        }

        const tenant = this.tenants.get(orgId);

        if (tenant.state !== ONBOARDING_STATES.first_close_pack_generated) {
            throw new Error('Must complete reconciliation before close pack');
        }

        // Record time_to_first_close_pack metric
        const metrics = tenant.metrics;
        metrics.time_to_first_close_pack = new Date() - tenant.createdAt;

        const closePackId = `pack-${orgId}-${Date.now()}`;

        return {
            closePackId,
            generatedAt: new Date(),
            status: 'ready'
        };
    }

    /**
     * Complete onboarding
     * @param {string} orgId - Organization ID
     * @returns {object} Completion confirmation
     */
    completeOnboarding(orgId) {
        if (!this.tenants.has(orgId)) {
            throw new Error(`Tenant ${orgId} not found`);
        }

        const tenant = this.tenants.get(orgId);

        if (tenant.state !== ONBOARDING_STATES.first_close_pack_generated) {
            throw new Error('Cannot complete: not at close pack stage');
        }

        // Transition to complete
        this.transition(orgId, ONBOARDING_STATES.onboarding_complete, {});

        // Calculate total duration
        const metrics = tenant.metrics;
        metrics.onboardingDurationMs = new Date() - tenant.createdAt;
        metrics.completionPercentage = 100;

        return {
            orgId,
            completedAt: new Date(),
            onboardingDurationMs: metrics.onboardingDurationMs
        };
    }

    /**
     * Mark onboarding as failed
     * @param {string} orgId - Organization ID
     * @param {string} reason - Failure reason
     */
    failOnboarding(orgId, reason) {
        if (!this.tenants.has(orgId)) {
            throw new Error(`Tenant ${orgId} not found`);
        }

        const tenant = this.tenants.get(orgId);
        tenant.lastFailureReason = reason;

        this.transition(orgId, ONBOARDING_STATES.onboarding_failed, {
            reason
        });
    }

    /**
     * Retry onboarding from last successful state
     * @param {string} orgId - Organization ID
     */
    retryFromFailure(orgId) {
        if (!this.tenants.has(orgId)) {
            throw new Error(`Tenant ${orgId} not found`);
        }

        const tenant = this.tenants.get(orgId);

        if (tenant.state !== ONBOARDING_STATES.onboarding_failed) {
            throw new Error('Can only retry from failed state');
        }

        // Reset to last successful state
        const retryState = tenant.lastSuccessfulState;
        tenant.state = retryState;
        tenant.lastFailureReason = null;

        const now = new Date();
        tenant.history.push({
            state: retryState,
            timestamp: now,
            metadata: { action: 'retry_from_failure' }
        });
    }

    /**
     * Get onboarding metrics
     * @param {string} orgId - Organization ID
     * @returns {object} Metrics for this tenant
     */
    getMetrics(orgId) {
        if (!this.tenants.has(orgId)) {
            throw new Error(`Tenant ${orgId} not found`);
        }

        const tenant = this.tenants.get(orgId);
        const stateList = Object.values(ONBOARDING_STATES).filter(
            s => s !== ONBOARDING_STATES.onboarding_failed
        );
        const stateIndex = stateList.indexOf(tenant.state);
        const totalStates = stateList.length;
        const completionPercentage = stateIndex === totalStates - 1 ? 100 : Math.round((stateIndex / (totalStates - 1)) * 100);

        return {
            time_to_first_invoice: tenant.metrics.time_to_first_invoice || null,
            time_to_first_close_pack: tenant.metrics.time_to_first_close_pack || null,
            onboardingDurationMs: tenant.metrics.onboardingDurationMs || null,
            providerCount: tenant.providerConnections.size,
            completionPercentage
        };
    }

    /**
     * Get detailed onboarding progress
     * @param {string} orgId - Organization ID
     * @returns {object} Progress details
     */
    getOnboardingProgress(orgId) {
        if (!this.tenants.has(orgId)) {
            throw new Error(`Tenant ${orgId} not found`);
        }

        const tenant = this.tenants.get(orgId);
        const stateList = Object.values(ONBOARDING_STATES).filter(
            s => s !== ONBOARDING_STATES.onboarding_failed
        );
        const stateIndex = stateList.indexOf(tenant.state);
        const totalStates = stateList.length;

        // Calculate percentage: 100% at last state, proportional for others
        let percentage = Math.round(((stateIndex + 1) / totalStates) * 100);
        if (tenant.state === ONBOARDING_STATES.onboarding_complete) {
            percentage = 100;
        }

        return {
            currentState: tenant.state,
            stateIndex,
            totalStates,
            percentage,
            completedSteps: stateIndex,
            remainingSteps: Math.max(0, totalStates - stateIndex - 1)
        };
    }

    /**
     * List all onboarding records with pagination
     * @param {object} options - Pagination and filter options
     * @returns {object} Paginated onboarding records
     */
    listAllOnboardings(options = {}) {
        const page = options.page || 1;
        const pageSize = options.pageSize || 20;
        const filterState = options.filterState || null;

        let records = Array.from(this.tenants.values());

        if (filterState) {
            records = records.filter(r => r.state === filterState);
        }

        const total = records.length;
        const startIdx = (page - 1) * pageSize;
        const endIdx = startIdx + pageSize;
        const paginated = records.slice(startIdx, endIdx);

        return {
            records: paginated.map(r => ({
                orgId: r.orgId,
                state: r.state,
                plan: r.plan,
                createdAt: r.createdAt,
                providerCount: r.providerConnections.size
            })),
            pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize)
            }
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLASS: ProviderOAuthFlow
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Manages OAuth 2.0 flows for provider authentication
 */
export class ProviderOAuthFlow {
    constructor(providerConfigs) {
        this.providerConfigs = providerConfigs || PROVIDER_OAUTH_CONFIGS;
        this.activeStates = new Map(); // state -> { providerId, redirectUri, createdAt }
    }

    /**
     * Initiate OAuth flow for a provider
     * @param {string} providerId - Provider ID
     * @param {string} redirectUri - OAuth redirect URI
     * @returns {object} Authorization URL and state parameter
     */
    initiateOAuth(providerId, redirectUri) {
        const config = this.providerConfigs[providerId];

        if (!config) {
            throw new Error(`Unknown provider: ${providerId}`);
        }

        if (config.authType !== 'oauth2') {
            throw new Error(`Provider ${providerId} does not support OAuth`);
        }

        // Generate unique state parameter
        const state = `state_${Date.now()}_${Math.random()
            .toString(36)
            .substring(7)}`;

        // Store state for verification
        this.activeStates.set(state, {
            providerId,
            redirectUri,
            createdAt: new Date()
        });

        // Build authorization URL
        const authUrl = new URL(config.tokenEndpoint.replace(/\/token.*/, '/authorize'));
        authUrl.searchParams.set('client_id', 'client_id_placeholder');
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('scope', config.scopes.join(' '));

        return {
            authorizationUrl: authUrl.toString(),
            state,
            provider: providerId
        };
    }

    /**
     * Handle OAuth callback
     * @param {string} providerId - Provider ID
     * @param {string} code - Authorization code
     * @param {string} state - State parameter for verification
     * @returns {object} Access token and refresh token
     */
    handleCallback(providerId, code, state) {
        if (!this.activeStates.has(state)) {
            throw new Error('Invalid or expired state parameter');
        }

        const stateData = this.activeStates.get(state);

        if (stateData.providerId !== providerId) {
            throw new Error('State provider mismatch');
        }

        // Clean up state
        this.activeStates.delete(state);

        // Simulate token exchange (real impl would call tokenEndpoint)
        const accessToken = `access_${providerId}_${Date.now()}`;
        const refreshToken = `refresh_${providerId}_${Date.now()}`;
        const expiresAt = new Date(Date.now() + 3600000); // 1 hour

        return {
            accessToken,
            refreshToken,
            expiresAt,
            provider: providerId
        };
    }

    /**
     * Refresh an OAuth access token
     * @param {string} providerId - Provider ID
     * @param {string} refreshToken - Refresh token
     * @returns {object} New access token
     */
    refreshAccessToken(providerId, refreshToken) {
        const config = this.providerConfigs[providerId];

        if (!config) {
            throw new Error(`Unknown provider: ${providerId}`);
        }

        if (config.authType !== 'oauth2') {
            throw new Error(`Provider ${providerId} does not support OAuth`);
        }

        // Simulate token refresh (real impl would call tokenEndpoint)
        const newAccessToken = `access_${providerId}_refresh_${Date.now()}`;
        const expiresAt = new Date(Date.now() + 3600000);

        return {
            accessToken: newAccessToken,
            expiresAt,
            provider: providerId
        };
    }

    /**
     * Revoke OAuth access
     * @param {string} providerId - Provider ID
     * @param {string} accessToken - Access token to revoke
     * @returns {object} Revocation confirmation
     */
    revokeAccess(providerId, accessToken) {
        const config = this.providerConfigs[providerId];

        if (!config) {
            throw new Error(`Unknown provider: ${providerId}`);
        }

        if (config.authType !== 'oauth2') {
            throw new Error(`Provider ${providerId} does not support OAuth`);
        }

        return {
            revoked: true,
            provider: providerId,
            timestamp: new Date()
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Factory function to create a TenantOnboardingManager instance
 * @param {object} options - Configuration options
 * @returns {TenantOnboardingManager} New manager instance
 */
export function createTenantOnboarding(options = {}) {
    return new TenantOnboardingManager(options);
}

/**
 * Factory function to create a ProviderOAuthFlow instance
 * @param {object} providerConfigs - Provider configurations
 * @returns {ProviderOAuthFlow} New flow instance
 */
export function createProviderOAuthFlow(providerConfigs = PROVIDER_OAUTH_CONFIGS) {
    return new ProviderOAuthFlow(providerConfigs);
}
