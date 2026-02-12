/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINAULT 4-TIER PRICING MODEL
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Architecture Blueprint: 4-tier pricing — Starter, Growth, Professional, Enterprise
 *
 * Each tier defines:
 *   - Monthly price and billing model
 *   - AI spend tracking limits
 *   - Agent access (which of the 19 agents are available)
 *   - Feature gates (close pack, reconciliation depth, etc.)
 *   - API rate limits
 *   - Support SLA
 *   - Data retention
 *   - Compliance features
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────────────────────
// TIER DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

export const PRICING_TIERS = {
    starter: {
        id: 'starter',
        name: 'Starter',
        tagline: 'For teams getting started with AI cost visibility',
        monthlyPrice: 0,
        annualPrice: 0,
        billingModel: 'free',
        trialDays: 0,

        // Spend tracking
        maxMonthlyAISpendTracked: 10000,  // $10K/month AI spend tracked
        maxProviders: 2,
        maxCostCenters: 3,
        maxUsers: 5,

        // Agent access (7 of 19)
        agents: [
            'cost-intelligence',
            'finault-pal',
            'budget-enforcer',
            'forecasting-agent',
            'optimization-agent',
            'policy-agent',
            'magic-onboarding'
        ],

        // Feature gates
        features: {
            dashboard: true,
            basicAnomalyDetection: true,
            budgetAlerts: true,
            costBreakdown: true,
            invoiceReconciliation: false,
            closePack: false,
            chargeback: false,
            erpIntegration: false,
            autopilot: false,
            compoundLearning: false,
            carbonTracking: false,
            procurementAdvisor: false,
            disputeResolver: false,
            forecastEngine: false,
            regulatoryIntel: false,
            auditTracker: false,
            benchmarkPlatform: false,
            dataResidency: false,
            customPolicies: false,
            apiAccess: true,
            webhooks: false,
            ssoSaml: false,
            multiOrg: false,
        },

        // API limits
        api: {
            requestsPerMinute: 30,
            requestsPerDay: 1000,
            maxBatchSize: 100,
            streamingEnabled: false,
        },

        // Support
        support: {
            level: 'community',
            responseTimeSLA: null,
            dedicatedCSM: false,
            slackChannel: false,
            phoneSupport: false,
        },

        // Data
        data: {
            retentionDays: 30,
            exportFormats: ['csv'],
            historicalAnalysisDays: 30,
        },

        // Compliance
        compliance: {
            soc2: false,
            gdpr: false,
            hipaa: false,
            auditLog: false,
        }
    },

    growth: {
        id: 'growth',
        name: 'Growth',
        tagline: 'For scaling teams that need reconciliation and optimization',
        monthlyPrice: 499,
        annualPrice: 4990, // ~2 months free
        billingModel: 'subscription',
        trialDays: 14,

        // Spend tracking
        maxMonthlyAISpendTracked: 100000,  // $100K/month
        maxProviders: 5,
        maxCostCenters: 10,
        maxUsers: 25,

        // Agent access (13 of 19)
        agents: [
            'cost-intelligence',
            'finault-pal',
            'budget-enforcer',
            'forecasting-agent',
            'optimization-agent',
            'policy-agent',
            'magic-onboarding',
            'invoice-reconciliation',
            'close-pack-generator',
            'chargeback-agent',
            'compound-learning',
            'carbon-tracker',
            'forecast-engine',
        ],

        // Feature gates
        features: {
            dashboard: true,
            basicAnomalyDetection: true,
            budgetAlerts: true,
            costBreakdown: true,
            invoiceReconciliation: true,
            closePack: true,
            chargeback: true,
            erpIntegration: false,
            autopilot: false,
            compoundLearning: true,
            carbonTracking: true,
            procurementAdvisor: false,
            disputeResolver: false,
            forecastEngine: true,
            regulatoryIntel: false,
            auditTracker: false,
            benchmarkPlatform: true,
            dataResidency: false,
            customPolicies: true,
            apiAccess: true,
            webhooks: true,
            ssoSaml: false,
            multiOrg: false,
        },

        // API limits
        api: {
            requestsPerMinute: 120,
            requestsPerDay: 10000,
            maxBatchSize: 500,
            streamingEnabled: true,
        },

        // Support
        support: {
            level: 'email',
            responseTimeSLA: '24h',
            dedicatedCSM: false,
            slackChannel: false,
            phoneSupport: false,
        },

        // Data
        data: {
            retentionDays: 90,
            exportFormats: ['csv', 'json', 'xlsx'],
            historicalAnalysisDays: 90,
        },

        // Compliance
        compliance: {
            soc2: false,
            gdpr: true,
            hipaa: false,
            auditLog: true,
        }
    },

    professional: {
        id: 'professional',
        name: 'Professional',
        tagline: 'For finance teams that need CFO-ready reporting and dispute resolution',
        monthlyPrice: 1999,
        annualPrice: 19990, // ~2 months free
        billingModel: 'subscription',
        trialDays: 14,

        // Spend tracking
        maxMonthlyAISpendTracked: 1000000,  // $1M/month
        maxProviders: 10,
        maxCostCenters: 50,
        maxUsers: 100,

        // Agent access (17 of 19)
        agents: [
            'cost-intelligence',
            'finault-pal',
            'budget-enforcer',
            'forecasting-agent',
            'optimization-agent',
            'policy-agent',
            'magic-onboarding',
            'invoice-reconciliation',
            'close-pack-generator',
            'chargeback-agent',
            'compound-learning',
            'intelligence',
            'autopilot',
            'carbon-tracker',
            'procurement-advisor',
            'dispute-resolver',
            'forecast-engine',
        ],

        // Feature gates
        features: {
            dashboard: true,
            basicAnomalyDetection: true,
            budgetAlerts: true,
            costBreakdown: true,
            invoiceReconciliation: true,
            closePack: true,
            chargeback: true,
            erpIntegration: true,
            autopilot: true,
            compoundLearning: true,
            carbonTracking: true,
            procurementAdvisor: true,
            disputeResolver: true,
            forecastEngine: true,
            regulatoryIntel: false,
            auditTracker: false,
            benchmarkPlatform: true,
            dataResidency: false,
            customPolicies: true,
            apiAccess: true,
            webhooks: true,
            ssoSaml: true,
            multiOrg: false,
        },

        // API limits
        api: {
            requestsPerMinute: 600,
            requestsPerDay: 100000,
            maxBatchSize: 5000,
            streamingEnabled: true,
        },

        // Support
        support: {
            level: 'priority',
            responseTimeSLA: '4h',
            dedicatedCSM: true,
            slackChannel: true,
            phoneSupport: false,
        },

        // Data
        data: {
            retentionDays: 365,
            exportFormats: ['csv', 'json', 'xlsx', 'pdf'],
            historicalAnalysisDays: 365,
        },

        // Compliance
        compliance: {
            soc2: true,
            gdpr: true,
            hipaa: false,
            auditLog: true,
        }
    },

    enterprise: {
        id: 'enterprise',
        name: 'Enterprise',
        tagline: 'Unlimited AI cost governance with full compliance and dedicated support',
        monthlyPrice: null, // custom pricing
        annualPrice: null,
        billingModel: 'custom',
        trialDays: 30,

        // Spend tracking
        maxMonthlyAISpendTracked: Infinity,
        maxProviders: Infinity,
        maxCostCenters: Infinity,
        maxUsers: Infinity,

        // Agent access (all 19)
        agents: [
            'cost-intelligence',
            'finault-pal',
            'budget-enforcer',
            'forecasting-agent',
            'optimization-agent',
            'policy-agent',
            'magic-onboarding',
            'invoice-reconciliation',
            'close-pack-generator',
            'chargeback-agent',
            'compound-learning',
            'intelligence',
            'autopilot',
            'carbon-tracker',
            'procurement-advisor',
            'dispute-resolver',
            'forecast-engine',
            'regulatory-intel',
            'audit-tracker',
        ],

        // Feature gates
        features: {
            dashboard: true,
            basicAnomalyDetection: true,
            budgetAlerts: true,
            costBreakdown: true,
            invoiceReconciliation: true,
            closePack: true,
            chargeback: true,
            erpIntegration: true,
            autopilot: true,
            compoundLearning: true,
            carbonTracking: true,
            procurementAdvisor: true,
            disputeResolver: true,
            forecastEngine: true,
            regulatoryIntel: true,
            auditTracker: true,
            benchmarkPlatform: true,
            dataResidency: true,
            customPolicies: true,
            apiAccess: true,
            webhooks: true,
            ssoSaml: true,
            multiOrg: true,
        },

        // API limits
        api: {
            requestsPerMinute: Infinity,
            requestsPerDay: Infinity,
            maxBatchSize: 50000,
            streamingEnabled: true,
        },

        // Support
        support: {
            level: 'dedicated',
            responseTimeSLA: '1h',
            dedicatedCSM: true,
            slackChannel: true,
            phoneSupport: true,
        },

        // Data
        data: {
            retentionDays: Infinity, // unlimited
            exportFormats: ['csv', 'json', 'xlsx', 'pdf', 'xml', 'edi'],
            historicalAnalysisDays: Infinity,
        },

        // Compliance
        compliance: {
            soc2: true,
            gdpr: true,
            hipaa: true,
            auditLog: true,
        }
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// TIER GATING ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export class TierGatingEngine {
    constructor(organizationTier = 'starter') {
        const tier = PRICING_TIERS[organizationTier];
        if (!tier) {
            throw new Error(`Unknown pricing tier: ${organizationTier}. Valid tiers: ${Object.keys(PRICING_TIERS).join(', ')}`);
        }
        this.tier = tier;
        this.tierName = organizationTier;
    }

    /**
     * Check if a specific feature is enabled for this tier
     * @param {string} featureName - Feature key from tier.features
     * @returns {boolean}
     */
    isFeatureEnabled(featureName) {
        return this.tier.features[featureName] === true;
    }

    /**
     * Check if a specific agent is available for this tier
     * @param {string} agentName - Agent identifier
     * @returns {boolean}
     */
    isAgentAvailable(agentName) {
        return this.tier.agents.includes(agentName);
    }

    /**
     * Check if the organization is within its AI spend tracking limit
     * @param {number} currentMonthlySpend - Current tracked spend in USD
     * @returns {{ allowed: boolean, limit: number, current: number, utilization: number }}
     */
    checkSpendLimit(currentMonthlySpend) {
        const limit = this.tier.maxMonthlyAISpendTracked;
        return {
            allowed: currentMonthlySpend <= limit,
            limit,
            current: currentMonthlySpend,
            utilization: limit === Infinity ? 0 : Math.round((currentMonthlySpend / limit) * 100)
        };
    }

    /**
     * Check API rate limit
     * @param {number} requestsThisMinute - Requests in current minute
     * @returns {{ allowed: boolean, limit: number, remaining: number }}
     */
    checkRateLimit(requestsThisMinute) {
        const limit = this.tier.api.requestsPerMinute;
        return {
            allowed: requestsThisMinute < limit,
            limit,
            remaining: Math.max(0, limit - requestsThisMinute)
        };
    }

    /**
     * Check user count limit
     * @param {number} currentUsers - Current user count
     * @returns {{ allowed: boolean, limit: number }}
     */
    checkUserLimit(currentUsers) {
        return {
            allowed: currentUsers <= this.tier.maxUsers,
            limit: this.tier.maxUsers
        };
    }

    /**
     * Get the upgrade path from current tier
     * @returns {{ nextTier: object|null, additionalFeatures: string[], priceIncrease: number|null }}
     */
    getUpgradePath() {
        const tierOrder = ['starter', 'growth', 'professional', 'enterprise'];
        const currentIndex = tierOrder.indexOf(this.tierName);

        if (currentIndex >= tierOrder.length - 1) {
            return { nextTier: null, additionalFeatures: [], priceIncrease: null };
        }

        const nextTierName = tierOrder[currentIndex + 1];
        const nextTier = PRICING_TIERS[nextTierName];

        // Find features that would be unlocked
        const additionalFeatures = [];
        for (const [feature, enabled] of Object.entries(nextTier.features)) {
            if (enabled && !this.tier.features[feature]) {
                additionalFeatures.push(feature);
            }
        }

        // Find additional agents
        const additionalAgents = nextTier.agents.filter(a => !this.tier.agents.includes(a));

        return {
            nextTier: {
                id: nextTier.id,
                name: nextTier.name,
                monthlyPrice: nextTier.monthlyPrice,
                annualPrice: nextTier.annualPrice,
            },
            additionalFeatures,
            additionalAgents,
            priceIncrease: nextTier.monthlyPrice !== null && this.tier.monthlyPrice !== null
                ? nextTier.monthlyPrice - this.tier.monthlyPrice
                : null
        };
    }

    /**
     * Gate an API request — throws if not allowed
     * @param {string} agentName - Agent being called
     * @param {string} featureName - Feature being used
     * @param {Object} context - { currentSpend, requestsThisMinute, userCount }
     * @returns {{ allowed: true }} or throws TierGatingError
     */
    gateRequest(agentName, featureName, context = {}) {
        // Check agent access
        if (agentName && !this.isAgentAvailable(agentName)) {
            const upgrade = this.getUpgradePath();
            throw new TierGatingError(
                `Agent "${agentName}" is not available on the ${this.tier.name} plan. ` +
                (upgrade.nextTier ? `Upgrade to ${upgrade.nextTier.name} to unlock it.` : ''),
                { type: 'agent_gated', agent: agentName, tier: this.tierName, upgrade }
            );
        }

        // Check feature access
        if (featureName && !this.isFeatureEnabled(featureName)) {
            const upgrade = this.getUpgradePath();
            throw new TierGatingError(
                `Feature "${featureName}" is not available on the ${this.tier.name} plan. ` +
                (upgrade.nextTier ? `Upgrade to ${upgrade.nextTier.name} to unlock it.` : ''),
                { type: 'feature_gated', feature: featureName, tier: this.tierName, upgrade }
            );
        }

        // Check spend limit
        if (context.currentSpend !== undefined) {
            const spendCheck = this.checkSpendLimit(context.currentSpend);
            if (!spendCheck.allowed) {
                throw new TierGatingError(
                    `Monthly AI spend tracking limit of $${spendCheck.limit.toLocaleString()} reached (${spendCheck.utilization}% utilized). ` +
                    `Upgrade to track more spend.`,
                    { type: 'spend_limit', ...spendCheck, tier: this.tierName }
                );
            }
        }

        // Check rate limit
        if (context.requestsThisMinute !== undefined) {
            const rateCheck = this.checkRateLimit(context.requestsThisMinute);
            if (!rateCheck.allowed) {
                throw new TierGatingError(
                    `Rate limit of ${rateCheck.limit} requests/minute exceeded. Try again shortly or upgrade.`,
                    { type: 'rate_limited', ...rateCheck, tier: this.tierName }
                );
            }
        }

        return { allowed: true };
    }

    /**
     * Get full tier details
     */
    getTierDetails() {
        return { ...this.tier };
    }

    /**
     * Compare two tiers
     * @param {string} otherTierName - Tier to compare against
     * @returns {Object} Comparison result
     */
    compareTo(otherTierName) {
        const other = PRICING_TIERS[otherTierName];
        if (!other) throw new Error(`Unknown tier: ${otherTierName}`);

        return {
            current: { id: this.tier.id, name: this.tier.name, price: this.tier.monthlyPrice },
            compared: { id: other.id, name: other.name, price: other.monthlyPrice },
            featureDiff: Object.entries(other.features).reduce((diff, [key, val]) => {
                if (val !== this.tier.features[key]) {
                    diff[key] = { current: this.tier.features[key], compared: val };
                }
                return diff;
            }, {}),
            agentDiff: {
                gained: other.agents.filter(a => !this.tier.agents.includes(a)),
                lost: this.tier.agents.filter(a => !other.agents.includes(a)),
            },
            limitsDiff: {
                spendLimit: { current: this.tier.maxMonthlyAISpendTracked, compared: other.maxMonthlyAISpendTracked },
                users: { current: this.tier.maxUsers, compared: other.maxUsers },
                apiRate: { current: this.tier.api.requestsPerMinute, compared: other.api.requestsPerMinute },
            }
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ERROR TYPE
// ─────────────────────────────────────────────────────────────────────────────

export class TierGatingError extends Error {
    constructor(message, details) {
        super(message);
        this.name = 'TierGatingError';
        this.details = details;
        this.statusCode = details?.type === 'rate_limited' ? 429 : 403;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List all tier names in order
 */
export function listTiers() {
    return Object.keys(PRICING_TIERS);
}

/**
 * Get tier by name
 */
export function getTier(name) {
    return PRICING_TIERS[name] || null;
}

/**
 * Factory: create a gating engine for an organization
 */
export function createTierGating(organizationTier) {
    return new TierGatingEngine(organizationTier);
}

export default PRICING_TIERS;
