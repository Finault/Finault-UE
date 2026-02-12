/**
 * FINAULT INTELLIGENCE
 * Network Learning Across All Customers
 *
 * "The iCloud of AI Cost Governance"
 *
 * Every customer makes every other customer smarter.
 * Anonymized, aggregated, privacy-preserving intelligence.
 *
 * Philosophy:
 * - Customer A discovers optimization → All customers benefit
 * - Patterns learned at scale → Better recommendations for everyone
 * - Benchmarks from real data → Know how you compare
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { AgentMemory, MEMORY_TYPES, IMPORTANCE } from '../core/agent-memory.js';
import { validateAgentParams } from '../core/validate-agent-params.js';
import { createSupabaseResilience } from '../core/resilience-layer.js';

const anthropic = new Anthropic();
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const resilientSupabase = createSupabaseResilience(supabase);

/**
 * Intelligence Categories
 */
const INTELLIGENCE_TYPES = {
    // Optimization patterns that work
    OPTIMIZATION_PATTERN: {
        name: 'Optimization Pattern',
        description: 'A proven way to reduce costs',
        requires_validation: true,
        min_confidence: 0.8
    },

    // Pricing intelligence
    PRICING_INSIGHT: {
        name: 'Pricing Insight',
        description: 'Information about provider pricing and changes',
        requires_validation: false,
        min_confidence: 0.9
    },

    // Industry benchmarks
    BENCHMARK: {
        name: 'Industry Benchmark',
        description: 'How companies compare on AI spending',
        requires_validation: true,
        min_confidence: 0.7
    },

    // Anomaly signatures
    ANOMALY_SIGNATURE: {
        name: 'Anomaly Signature',
        description: 'Pattern that indicates a cost anomaly',
        requires_validation: true,
        min_confidence: 0.85
    },

    // Best practices
    BEST_PRACTICE: {
        name: 'Best Practice',
        description: 'Recommended approach for cost management',
        requires_validation: false,
        min_confidence: 0.75
    }
};

export class FinaultIntelligence {
    constructor(params = {}) {
        // FinaultIntelligence can operate globally (cross-org) or per-org
        const { organizationId, userId, config } = validateAgentParams(params, 'FinaultIntelligence', { requireOrganizationId: false });
        this.organizationId = organizationId;
        this.userId = userId;
        this.localCache = new Map();
        this.memory = new AgentMemory('finault-intelligence', organizationId, userId);
        this._memoryLoaded = false;
    }

    /**
     * Initialize memory
     */
    async initMemory() {
        if (!this._memoryLoaded) {
            await this.memory.load();
            this._memoryLoaded = true;
        }
    }

    /**
     * Contribute an insight (anonymized)
     */
    async contribute(organizationId, insight) {
        // Anonymize the insight
        const anonymized = this.anonymize(insight);

        // Validate the insight
        if (!this.validateInsight(anonymized)) {
            return { success: false, error: 'Insight failed validation' };
        }

        // Check for duplicates
        const isDuplicate = await this.checkDuplicate(anonymized);
        if (isDuplicate) {
            // Increment confidence of existing insight
            await this.reinforceInsight(isDuplicate.id);
            return { success: true, action: 'reinforced', insight_id: isDuplicate.id };
        }

        // Store new insight
        const { data, error } = await resilientSupabase
            .from('global_intelligence')
            .insert({
                type: anonymized.type,
                category: anonymized.category,
                insight: anonymized.insight,
                confidence: anonymized.confidence,
                validation_count: 1,
                first_seen: new Date().toISOString(),
                last_seen: new Date().toISOString(),
                metadata: anonymized.metadata
            })
            .select()
            .single();

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true, action: 'created', insight_id: data.id };
    }

    /**
     * Anonymize an insight to remove customer-identifiable information
     */
    anonymize(insight) {
        const anonymized = { ...insight };

        // Remove direct identifiers
        delete anonymized.organization_id;
        delete anonymized.user_id;
        delete anonymized.api_keys;
        delete anonymized.project_names;

        // Normalize values to ranges
        if (anonymized.spend_amount) {
            anonymized.spend_range = this.toSpendRange(anonymized.spend_amount);
            delete anonymized.spend_amount;
        }

        if (anonymized.savings_amount) {
            anonymized.savings_range = this.toSavingsRange(anonymized.savings_amount);
            delete anonymized.savings_amount;
        }

        // Hash any remaining strings that could be identifying
        if (anonymized.custom_labels) {
            anonymized.custom_labels = anonymized.custom_labels.map(l =>
                this.hashLabel(l)
            );
        }

        return anonymized;
    }

    /**
     * Convert spend to anonymized range
     */
    toSpendRange(amount) {
        const ranges = [
            { max: 1000, label: '<$1K' },
            { max: 10000, label: '$1K-$10K' },
            { max: 50000, label: '$10K-$50K' },
            { max: 100000, label: '$50K-$100K' },
            { max: 500000, label: '$100K-$500K' },
            { max: 1000000, label: '$500K-$1M' },
            { max: Infinity, label: '>$1M' }
        ];

        return ranges.find(r => amount < r.max)?.label || 'Unknown';
    }

    /**
     * Convert savings to anonymized range
     */
    toSavingsRange(amount) {
        const ranges = [
            { max: 100, label: '<$100' },
            { max: 1000, label: '$100-$1K' },
            { max: 10000, label: '$1K-$10K' },
            { max: 50000, label: '$10K-$50K' },
            { max: Infinity, label: '>$50K' }
        ];

        return ranges.find(r => amount < r.max)?.label || 'Unknown';
    }

    /**
     * Hash a label to anonymize it
     */
    hashLabel(label) {
        // Simple hash for demo - use proper hashing in production
        let hash = 0;
        for (let i = 0; i < label.length; i++) {
            hash = ((hash << 5) - hash) + label.charCodeAt(i);
            hash = hash & hash;
        }
        return `label_${Math.abs(hash).toString(16)}`;
    }

    /**
     * Validate an insight before accepting it
     */
    validateInsight(insight) {
        const type = INTELLIGENCE_TYPES[insight.type];
        if (!type) return false;

        // Check minimum confidence
        if (insight.confidence < type.min_confidence) {
            return false;
        }

        // Check required fields
        if (!insight.insight || !insight.category) {
            return false;
        }

        return true;
    }

    /**
     * Check for duplicate insights
     */
    async checkDuplicate(insight) {
        const { data } = await resilientSupabase
            .from('global_intelligence')
            .select('*')
            .eq('type', insight.type)
            .eq('category', insight.category)
            .textSearch('insight', insight.insight.split(' ').slice(0, 5).join(' & '))
            .limit(1)
            .single();

        return data;
    }

    /**
     * Reinforce an existing insight (increase confidence)
     */
    async reinforceInsight(insightId) {
        await resilientSupabase.rpc('reinforce_insight', { insight_id: insightId });
    }

    /**
     * Query intelligence for recommendations
     */
    async query(organizationId, context) {
        const { industry, spend_range, use_cases, current_providers } = context;

        // Build query based on context
        let query = resilientSupabase
            .from('global_intelligence')
            .select('*')
            .gte('confidence', 0.7)
            .order('confidence', { ascending: false });

        // Filter by relevant categories
        if (use_cases && use_cases.length > 0) {
            query = query.in('category', use_cases);
        }

        // Get relevant insights
        const { data: insights } = await query.limit(50);

        // Score and rank insights for this organization
        const scored = insights?.map(insight => ({
            ...insight,
            relevance_score: this.calculateRelevance(insight, context)
        })).sort((a, b) => b.relevance_score - a.relevance_score);

        // Filter to top relevant insights
        const relevant = scored?.filter(i => i.relevance_score > 0.5).slice(0, 10);

        return {
            success: true,
            insights: relevant,
            count: relevant?.length || 0
        };
    }

    /**
     * Calculate relevance score for an insight
     */
    calculateRelevance(insight, context) {
        let score = 0;

        // Base score from confidence
        score += insight.confidence * 0.3;

        // Recency bonus
        const daysSinceSeen = (Date.now() - new Date(insight.last_seen).getTime()) / (1000 * 60 * 60 * 24);
        score += Math.max(0, (30 - daysSinceSeen) / 30) * 0.2;

        // Validation count bonus
        score += Math.min(insight.validation_count / 100, 0.2);

        // Category match bonus
        if (context.use_cases?.includes(insight.category)) {
            score += 0.3;
        }

        return Math.min(score, 1);
    }

    /**
     * Get industry benchmarks
     */
    async getBenchmarks(industry, company_size) {
        // Get aggregated benchmarks
        const { data } = await resilientSupabase
            .from('industry_benchmarks')
            .select('*')
            .eq('industry', industry)
            .eq('company_size', company_size);

        if (!data || data.length === 0) {
            // Return general benchmarks
            return this.getGeneralBenchmarks();
        }

        return {
            success: true,
            benchmarks: data,
            industry,
            company_size
        };
    }

    /**
     * Get general benchmarks when specific ones aren't available
     */
    getGeneralBenchmarks() {
        return {
            success: true,
            benchmarks: [
                {
                    metric: 'AI spend as % of IT budget',
                    median: '5-8%',
                    top_quartile: '<3%',
                    bottom_quartile: '>12%'
                },
                {
                    metric: 'Cost per 1M tokens (avg)',
                    median: '$15-25',
                    top_quartile: '<$10',
                    bottom_quartile: '>$40'
                },
                {
                    metric: 'Optimization savings achieved',
                    median: '15-20%',
                    top_quartile: '>30%',
                    bottom_quartile: '<5%'
                },
                {
                    metric: 'Time to first optimization',
                    median: '2-4 weeks',
                    top_quartile: '<1 week',
                    bottom_quartile: '>2 months'
                }
            ],
            note: 'General benchmarks - connect more data for industry-specific insights'
        };
    }

    /**
     * Learn from a completed optimization
     */
    async learnFromOptimization(optimization) {
        const insight = {
            type: 'OPTIMIZATION_PATTERN',
            category: optimization.type,
            insight: optimization.description,
            confidence: optimization.success ? 0.8 : 0.4,
            metadata: {
                savings_range: this.toSavingsRange(optimization.actual_savings || optimization.estimated_savings),
                provider: optimization.provider,
                model_from: optimization.from_model,
                model_to: optimization.to_model,
                implementation_time: optimization.implementation_time,
                risk_level: optimization.risk
            }
        };

        return await this.contribute(null, insight);
    }

    /**
     * Learn from a validated anomaly
     */
    async learnFromAnomaly(anomaly) {
        const insight = {
            type: 'ANOMALY_SIGNATURE',
            category: anomaly.type,
            insight: `${anomaly.severity} anomaly: ${anomaly.pattern_description}`,
            confidence: anomaly.was_real_anomaly ? 0.9 : 0.3,
            metadata: {
                detection_method: anomaly.detection_method,
                zscore_range: this.toZscoreRange(anomaly.zscore),
                provider: anomaly.provider,
                time_pattern: anomaly.time_pattern
            }
        };

        return await this.contribute(null, insight);
    }

    /**
     * Convert zscore to range
     */
    toZscoreRange(zscore) {
        if (zscore < 2) return '<2σ';
        if (zscore < 3) return '2-3σ';
        if (zscore < 4) return '3-4σ';
        return '>4σ';
    }

    /**
     * Generate network statistics
     */
    async getNetworkStats() {
        const { data: stats } = await resilientSupabase
            .from('global_intelligence')
            .select('type, category')
            .gte('confidence', 0.7);

        const byType = {};
        const byCategory = {};

        stats?.forEach(s => {
            byType[s.type] = (byType[s.type] || 0) + 1;
            byCategory[s.category] = (byCategory[s.category] || 0) + 1;
        });

        return {
            total_insights: stats?.length || 0,
            by_type: byType,
            by_category: byCategory,
            network_effect: `Every insight benefits all ${process.env.CUSTOMER_COUNT || 'N'} customers`
        };
    }

    /**
     * Suggest optimizations based on network intelligence
     */
    async suggestFromNetwork(organizationId, context) {
        // Get organization's current state
        const { data: currentSpending } = await resilientSupabase
            .from('cost_records')
            .select('provider, model, amount')
            .eq('organization_id', organizationId)
            .gte('timestamp', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

        // Aggregate current spending
        const byModel = {};
        currentSpending?.forEach(r => {
            const key = `${r.provider}:${r.model}`;
            byModel[key] = (byModel[key] || 0) + parseFloat(r.amount);
        });

        // Query network for relevant optimizations
        const { data: networkInsights } = await resilientSupabase
            .from('global_intelligence')
            .select('*')
            .eq('type', 'OPTIMIZATION_PATTERN')
            .gte('confidence', 0.8)
            .order('validation_count', { ascending: false })
            .limit(20);

        // Match insights to organization's spending
        const suggestions = [];

        for (const insight of networkInsights || []) {
            const meta = insight.metadata;

            // Check if organization uses the relevant model
            const relevantSpending = byModel[`${meta.provider}:${meta.model_from}`];

            if (relevantSpending) {
                suggestions.push({
                    insight_id: insight.id,
                    description: insight.insight,
                    confidence: insight.confidence,
                    validation_count: insight.validation_count,
                    estimated_savings: relevantSpending * 0.3, // Conservative estimate
                    network_validated: insight.validation_count > 10,
                    source: 'network_intelligence'
                });
            }
        }

        return {
            success: true,
            suggestions: suggestions.sort((a, b) => b.estimated_savings - a.estimated_savings).slice(0, 5),
            network_insights_checked: networkInsights?.length || 0
        };
    }
}

// Singleton for global intelligence — Fix W-002: requireOrganizationId=false for global singleton
export const finaultIntelligence = new FinaultIntelligence({});
export default FinaultIntelligence;
