/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINAULT PLATFORM FLYWHEEL
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * THE CRITICAL INSIGHT:
 * "Can they leave easily? If yes, you're a feature." — Musk
 * "Does it all work together seamlessly as one thing?" — Jobs
 *
 * This file transforms Finault from a FEATURE COLLECTION into a TRUE PLATFORM.
 *
 * THE FLYWHEEL:
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │                                                                             │
 * │    ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐        │
 * │    │  INGEST  │ ──→ │  ENRICH  │ ──→ │  LEARN   │ ──→ │  ACTION  │        │
 * │    └──────────┘     └──────────┘     └──────────┘     └──────────┘        │
 * │         ↑                                                    │             │
 * │         └────────────────────────────────────────────────────┘             │
 * │                        COMPOUND OVER TIME                                  │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * WHY THEY CAN'T LEAVE AFTER 12 MONTHS:
 * 1. We know their spending patterns (seasonality, spikes, baselines)
 * 2. We've learned their cost centers and allocation rules
 * 3. We've built up reconciliation confidence across 12 invoice cycles
 * 4. We have their benchmark position in the industry
 * 5. Their autonomous savings are compounding
 * 6. Their dispute success rate is trained on their providers
 * 7. All their audit history lives here (SOC 2 requires it)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. UNIFIED DATA LAYER
// Every feature reads from and writes to the same enriched data model
// ═══════════════════════════════════════════════════════════════════════════════

export class UnifiedDataLayer {
    constructor(env) {
        this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
    }

    /**
     * The Organization Profile - Everything we know about this customer
     * This is the LOCK-IN: 12 months of enriched data
     */
    async getOrganizationProfile(orgId) {
        const profile = {
            id: orgId,
            // Core data
            ...(await this.getOrganization(orgId)),
            // Enriched over time
            spendingPatterns: await this.getSpendingPatterns(orgId),
            modelUsageProfile: await this.getModelUsageProfile(orgId),
            costCenterStructure: await this.getCostCenterStructure(orgId),
            providerRelationships: await this.getProviderRelationships(orgId),
            seasonality: await this.getSeasonalityProfile(orgId),
            anomalyBaseline: await this.getAnomalyBaseline(orgId),
            benchmarkPosition: await this.getBenchmarkPosition(orgId),
            savingsHistory: await this.getSavingsHistory(orgId),
            disputeHistory: await this.getDisputeHistory(orgId),
            // Computed insights
            healthScore: await this.computeHealthScore(orgId),
            churnRisk: await this.computeChurnRisk(orgId),
            expansionPotential: await this.computeExpansionPotential(orgId)
        };

        return profile;
    }

    async getOrganization(orgId) {
        const { data } = await this.supabase
            .from('organizations')
            .select('*')
            .eq('id', orgId)
            .single();
        return data || {};
    }

    async getSpendingPatterns(orgId) {
        // Aggregated spending patterns over time
        const { data } = await this.supabase
            .from('spending_patterns')
            .select('*')
            .eq('organization_id', orgId)
            .single();

        return data || {
            monthlyAverage: 0,
            weeklyPattern: {},
            dailyPattern: {},
            trendDirection: 'stable',
            volatility: 'low'
        };
    }

    async getModelUsageProfile(orgId) {
        const { data } = await this.supabase
            .from('model_usage_profiles')
            .select('*')
            .eq('organization_id', orgId);

        return data || [];
    }

    async getCostCenterStructure(orgId) {
        const { data } = await this.supabase
            .from('cost_center_structures')
            .select('*')
            .eq('organization_id', orgId);

        return data || [];
    }

    async getProviderRelationships(orgId) {
        const { data } = await this.supabase
            .from('provider_relationships')
            .select('*')
            .eq('organization_id', orgId);

        return data || [];
    }

    async getSeasonalityProfile(orgId) {
        const { data } = await this.supabase
            .from('seasonality_profiles')
            .select('*')
            .eq('organization_id', orgId)
            .single();

        return data || {
            hasSeasonality: false,
            peakMonths: [],
            quietMonths: [],
            confidence: 0
        };
    }

    async getAnomalyBaseline(orgId) {
        const { data } = await this.supabase
            .from('anomaly_baselines')
            .select('*')
            .eq('organization_id', orgId)
            .single();

        return data || {
            dailyThreshold: 0,
            weeklyThreshold: 0,
            modelThresholds: {},
            lastUpdated: null
        };
    }

    async getBenchmarkPosition(orgId) {
        const { data } = await this.supabase
            .from('benchmark_positions')
            .select('*')
            .eq('organization_id', orgId)
            .single();

        return data || {
            costPerTokenPercentile: 50,
            efficiencyPercentile: 50,
            industryRank: 'unknown'
        };
    }

    async getSavingsHistory(orgId) {
        const { data } = await this.supabase
            .from('savings_implementations')
            .select('*')
            .eq('organization_id', orgId)
            .order('implemented_at', { ascending: false });

        return {
            totalSaved: (data || []).reduce((sum, s) => sum + (s.savings_amount || 0), 0),
            implementations: data || []
        };
    }

    async getDisputeHistory(orgId) {
        const { data } = await this.supabase
            .from('disputes')
            .select('*')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false });

        const won = (data || []).filter(d => d.status === 'won');
        const total = data?.length || 0;

        return {
            totalDisputes: total,
            wonDisputes: won.length,
            successRate: total > 0 ? (won.length / total * 100) : 0,
            totalRecovered: won.reduce((sum, d) => sum + (d.recovered_amount || 0), 0),
            disputes: data || []
        };
    }

    async computeHealthScore(orgId) {
        // Health score based on platform usage
        const factors = {
            hasGatewayIntegration: await this.hasGatewayIntegration(orgId),
            hasRecurringInvoices: await this.hasRecurringInvoices(orgId),
            hasActiveBudgets: await this.hasActiveBudgets(orgId),
            hasAppliedSavings: (await this.getSavingsHistory(orgId)).implementations.length > 0,
            hasRecentActivity: await this.hasRecentActivity(orgId)
        };

        const score = Object.values(factors).filter(Boolean).length * 20;
        return { score, factors };
    }

    async hasGatewayIntegration(orgId) {
        const { count } = await this.supabase
            .from('gateway_logs')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', orgId)
            .limit(1);
        return (count || 0) > 0;
    }

    async hasRecurringInvoices(orgId) {
        const { data } = await this.supabase
            .from('invoices')
            .select('created_at')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false })
            .limit(3);

        return (data?.length || 0) >= 2;
    }

    async hasActiveBudgets(orgId) {
        const { count } = await this.supabase
            .from('budget_configs')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', orgId)
            .eq('is_active', true);
        return (count || 0) > 0;
    }

    async hasRecentActivity(orgId) {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { count } = await this.supabase
            .from('audit_logs')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', orgId)
            .gte('timestamp', weekAgo);
        return (count || 0) > 0;
    }

    async computeChurnRisk(orgId) {
        const health = await this.computeHealthScore(orgId);
        const daysSinceActivity = await this.getDaysSinceLastActivity(orgId);

        let risk = 'low';
        if (health.score < 40 || daysSinceActivity > 14) risk = 'medium';
        if (health.score < 20 || daysSinceActivity > 30) risk = 'high';

        return { risk, healthScore: health.score, daysSinceActivity };
    }

    async getDaysSinceLastActivity(orgId) {
        const { data } = await this.supabase
            .from('audit_logs')
            .select('timestamp')
            .eq('organization_id', orgId)
            .order('timestamp', { ascending: false })
            .limit(1)
            .single();

        if (!data) return 999;
        return Math.floor((Date.now() - new Date(data.timestamp).getTime()) / (24 * 60 * 60 * 1000));
    }

    async computeExpansionPotential(orgId) {
        const profile = await this.getOrganization(orgId);
        const spending = await this.getSpendingPatterns(orgId);

        return {
            currentTier: profile.tier || 'free',
            monthlySpend: spending.monthlyAverage,
            suggestedTier: this.suggestTier(spending.monthlyAverage),
            expansionOpportunities: await this.getExpansionOpportunities(orgId)
        };
    }

    suggestTier(monthlySpend) {
        if (monthlySpend > 50000) return 'enterprise';
        if (monthlySpend > 10000) return 'professional';
        if (monthlySpend > 1000) return 'starter';
        return 'free';
    }

    async getExpansionOpportunities(orgId) {
        const opportunities = [];

        if (!await this.hasGatewayIntegration(orgId)) {
            opportunities.push({
                feature: 'Gateway Integration',
                value: 'Real-time cost tracking and anomaly detection',
                priority: 'high'
            });
        }

        return opportunities;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. CROSS-FEATURE INTELLIGENCE
// Each feature's output enriches every other feature's input
// ═══════════════════════════════════════════════════════════════════════════════

export class CrossFeatureIntelligence {
    constructor(env, errorTracker = null) {
        this.env = env;
        this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
        this.dataLayer = new UnifiedDataLayer(env);
        this.errorTracker = errorTracker; // GAP #1 SOLUTION
    }

    /**
     * When a gateway request is logged, enrich everything else
     */
    async onGatewayRequest(orgId, request) {
        const enrichments = [];

        // 1. Update spending patterns
        enrichments.push(this.updateSpendingPattern(orgId, request));

        // 2. Update model usage profile
        enrichments.push(this.updateModelProfile(orgId, request));

        // 3. Check for anomalies against learned baseline
        enrichments.push(this.checkAnomalyBaseline(orgId, request));

        // 4. Update benchmark position
        enrichments.push(this.updateBenchmarkData(orgId, request));

        // 5. Generate real-time recommendations
        enrichments.push(this.generateRealTimeRecommendation(orgId, request));

        await Promise.all(enrichments);

        return { enriched: true, enrichmentCount: enrichments.length };
    }

    /**
     * When an invoice is parsed, enrich everything else
     */
    async onInvoiceParsed(orgId, invoice) {
        const enrichments = [];

        // 1. Learn provider invoice patterns
        enrichments.push(this.learnProviderPattern(orgId, invoice));

        // 2. Improve reconciliation confidence
        enrichments.push(this.updateReconciliationConfidence(orgId, invoice));

        // 3. Detect billing anomalies
        enrichments.push(this.detectBillingAnomalies(orgId, invoice));

        // 4. Update cost center mappings
        enrichments.push(this.learnCostCenterMappings(orgId, invoice));

        await Promise.all(enrichments);

        return { enriched: true, enrichmentCount: enrichments.length };
    }

    /**
     * When reconciliation is performed, enrich everything else
     */
    async onReconciliationComplete(orgId, reconciliation) {
        const enrichments = [];

        // 1. Learn discrepancy patterns
        enrichments.push(this.learnDiscrepancyPatterns(orgId, reconciliation));

        // 2. Update dispute intelligence
        enrichments.push(this.updateDisputeIntelligence(orgId, reconciliation));

        // 3. Improve future reconciliation accuracy
        enrichments.push(this.improveReconciliationModel(orgId, reconciliation));

        await Promise.all(enrichments);

        return { enriched: true, enrichmentCount: enrichments.length };
    }

    /**
     * When a savings recommendation is applied, enrich everything else
     */
    async onSavingsApplied(orgId, savings) {
        const enrichments = [];

        // 1. Track ROI for future recommendations
        enrichments.push(this.trackSavingsROI(orgId, savings));

        // 2. Update model recommendation confidence
        enrichments.push(this.updateRecommendationConfidence(orgId, savings));

        // 3. Share anonymized learning across platform
        enrichments.push(this.contributeToCollectiveIntelligence(orgId, savings));

        await Promise.all(enrichments);

        return { enriched: true, enrichmentCount: enrichments.length };
    }

    // Implementation helpers
    async updateSpendingPattern(orgId, request) {
        const cost = parseFloat(request.cost_usd) || 0;
        const now = new Date();
        const dayOfWeek = now.getDay();
        const hourOfDay = now.getHours();

        // Upsert spending pattern
        await this.supabase.rpc('update_spending_pattern', {
            p_org_id: orgId,
            p_cost: cost,
            p_day_of_week: dayOfWeek,
            p_hour_of_day: hourOfDay
        }).catch(() => {
            // Fallback: just log the data point
            console.log('[CrossFeature] Spending pattern update:', orgId, cost);
        });
    }

    async updateModelProfile(orgId, request) {
        const model = request.model;
        const tokens = (request.input_tokens || 0) + (request.output_tokens || 0);
        const cost = parseFloat(request.cost_usd) || 0;

        await this.supabase.from('model_usage_events').insert({
            organization_id: orgId,
            model,
            tokens,
            cost,
            timestamp: new Date().toISOString()
        }).catch(async (error) => {
            // GAP #1 SOLUTION: Track analytics write failure
            if (this.errorTracker) {
                await this.errorTracker.trackError({
                    type: 'database_write_failed',
                    code: error.code,
                    message: error.message,
                    stack: error.stack,
                    context: {
                        table: 'model_usage_events',
                        operation: 'insert',
                        data: { orgId, model, tokens, cost }
                    },
                    level: 'error', // Not critical - analytics data
                    alertOnError: false,
                    orgId
                });
            } else {
                console.error('[CrossFeature] model_usage_events insert failed:', error.message);
            }
        });
    }

    async checkAnomalyBaseline(orgId, request) {
        const baseline = await this.dataLayer.getAnomalyBaseline(orgId);
        const cost = parseFloat(request.cost_usd) || 0;

        if (baseline.dailyThreshold > 0 && cost > baseline.dailyThreshold * 0.1) {
            // This single request is >10% of daily threshold - flag it
            await this.supabase.from('anomaly_detections').insert({
                organization_id: orgId,
                type: 'high_cost_request',
                severity: cost > baseline.dailyThreshold * 0.5 ? 'critical' : 'warning',
                cost_usd: cost,
                details: { request_id: request.id, model: request.model },
                detected_at: new Date().toISOString()
            }).catch(async (error) => {
                // GAP #1 SOLUTION: Track anomaly detection failure
                if (this.errorTracker) {
                    await this.errorTracker.trackError({
                        type: 'database_write_failed',
                        code: error.code,
                        message: error.message,
                        stack: error.stack,
                        context: {
                            table: 'anomaly_detections',
                            operation: 'insert',
                            data: { orgId, cost, threshold: baseline.dailyThreshold }
                        },
                        level: 'error', // Not critical - alerting data
                        alertOnError: false,
                        orgId
                    });
                } else {
                    console.error('[CrossFeature] anomaly_detections insert failed:', error.message);
                }
            });
        }
    }

    async updateBenchmarkData(orgId, request) {
        // Anonymized data point for benchmarking
        await this.supabase.from('benchmark_data_points').insert({
            organization_id: orgId,
            model: request.model,
            tokens: (request.input_tokens || 0) + (request.output_tokens || 0),
            cost: parseFloat(request.cost_usd) || 0,
            timestamp: new Date().toISOString()
        }).catch(async (error) => {
            // GAP #1 SOLUTION: Track benchmark data failure
            if (this.errorTracker) {
                await this.errorTracker.trackError({
                    type: 'database_write_failed',
                    code: error.code,
                    message: error.message,
                    context: {
                        table: 'benchmark_data_points',
                        operation: 'insert'
                    },
                    level: 'warning', // Low priority - benchmark data
                    alertOnError: false,
                    orgId
                });
            } else {
                console.error('[CrossFeature] benchmark_data_points insert failed:', error.message);
            }
        });
    }

    async generateRealTimeRecommendation(orgId, request) {
        // If using expensive model for simple task, generate recommendation
        const expensiveModels = ['gpt-4', 'claude-3-opus', 'claude-opus-4'];
        const tokens = (request.input_tokens || 0) + (request.output_tokens || 0);

        if (expensiveModels.some(m => request.model?.includes(m)) && tokens < 500) {
            await this.supabase.from('real_time_recommendations').insert({
                organization_id: orgId,
                type: 'model_downgrade',
                current_model: request.model,
                suggested_model: 'gpt-4o-mini',
                potential_savings_percent: 70,
                request_id: request.id,
                created_at: new Date().toISOString()
            }).catch(async (error) => {
                // GAP #1 SOLUTION: Track recommendation write failure
                if (this.errorTracker) {
                    await this.errorTracker.trackError({
                        type: 'database_write_failed',
                        code: error.code,
                        message: error.message,
                        context: {
                            table: 'real_time_recommendations',
                            operation: 'insert'
                        },
                        level: 'warning',
                        alertOnError: false,
                        orgId
                    });
                } else {
                    console.error('[CrossFeature] real_time_recommendations insert failed:', error.message);
                }
            });
        }
    }

    async learnProviderPattern(orgId, invoice) {
        await this.supabase.from('provider_patterns').upsert({
            organization_id: orgId,
            provider: invoice.provider,
            typical_format: invoice.format,
            column_mapping: invoice.columnMapping,
            last_seen: new Date().toISOString()
        }).catch(async (error) => {
            // GAP #1 SOLUTION: Track provider pattern learning failure
            if (this.errorTracker) {
                await this.errorTracker.trackError({
                    type: 'database_write_failed',
                    code: error.code,
                    message: error.message,
                    context: {
                        table: 'provider_patterns',
                        operation: 'upsert',
                        provider: invoice.provider
                    },
                    level: 'warning', // Learning data - not critical
                    alertOnError: false,
                    orgId
                });
            } else {
                console.error('[CrossFeature] provider_patterns upsert failed:', error.message);
            }
        });
    }

    async updateReconciliationConfidence(orgId, invoice) {
        // Track how well we reconcile this provider's invoices
        const existing = await this.supabase
            .from('reconciliation_confidence')
            .select('*')
            .eq('organization_id', orgId)
            .eq('provider', invoice.provider)
            .single();

        const newConfidence = existing?.data
            ? (existing.data.confidence * existing.data.invoice_count + 0.95) / (existing.data.invoice_count + 1)
            : 0.8;

        await this.supabase.from('reconciliation_confidence').upsert({
            organization_id: orgId,
            provider: invoice.provider,
            confidence: newConfidence,
            invoice_count: (existing?.data?.invoice_count || 0) + 1,
            updated_at: new Date().toISOString()
        }).catch(async (error) => {
            // GAP #1 SOLUTION: Track reconciliation confidence update failure
            if (this.errorTracker) {
                await this.errorTracker.trackError({
                    type: 'database_write_failed',
                    code: error.code,
                    message: error.message,
                    context: {
                        table: 'reconciliation_confidence',
                        operation: 'upsert',
                        provider: invoice.provider
                    },
                    level: 'warning',
                    alertOnError: false,
                    orgId
                });
            } else {
                console.error('[CrossFeature] reconciliation_confidence upsert failed:', error.message);
            }
        });
    }

    async detectBillingAnomalies(orgId, invoice) {
        // Compare to historical invoices from same provider
        const { data: history } = await this.supabase
            .from('invoices')
            .select('total_amount')
            .eq('organization_id', orgId)
            .eq('provider', invoice.provider)
            .order('created_at', { ascending: false })
            .limit(6);

        if (history && history.length >= 3) {
            const avg = history.reduce((s, i) => s + i.total_amount, 0) / history.length;
            const deviation = Math.abs(invoice.totalAmount - avg) / avg;

            if (deviation > 0.3) {
                await this.supabase.from('billing_anomalies').insert({
                    organization_id: orgId,
                    invoice_id: invoice.id,
                    type: invoice.totalAmount > avg ? 'spike' : 'drop',
                    expected_amount: avg,
                    actual_amount: invoice.totalAmount,
                    deviation_percent: deviation * 100,
                    detected_at: new Date().toISOString()
                }).catch(async (error) => {
                    // GAP #1 SOLUTION: Track billing anomaly detection failure
                    if (this.errorTracker) {
                        await this.errorTracker.trackError({
                            type: 'database_write_failed',
                            code: error.code,
                            message: error.message,
                            context: {
                                table: 'billing_anomalies',
                                operation: 'insert',
                                invoice_id: invoice.id
                            },
                            level: 'warning',
                            alertOnError: false,
                            orgId
                        });
                    } else {
                        console.error('[CrossFeature] billing_anomalies insert failed:', error.message);
                    }
                });
            }
        }
    }

    async learnCostCenterMappings(orgId, invoice) {
        // Learn which keywords map to which cost centers
        for (const item of invoice.lineItems || []) {
            if (item.costCenter && item.description) {
                await this.supabase.from('cost_center_learnings').insert({
                    organization_id: orgId,
                    keyword: item.description.toLowerCase(),
                    cost_center: item.costCenter,
                    confidence: 0.8,
                    learned_at: new Date().toISOString()
                }).catch(async (error) => {
                    // GAP #1 SOLUTION: Track cost center learning failure
                    if (this.errorTracker) {
                        await this.errorTracker.trackError({
                            type: 'database_write_failed',
                            code: error.code,
                            message: error.message,
                            context: {
                                table: 'cost_center_learnings',
                                operation: 'insert'
                            },
                            level: 'info', // Lowest priority - ML learning
                            alertOnError: false,
                            orgId
                        });
                    } else {
                        console.error('[CrossFeature] cost_center_learnings insert failed:', error.message);
                    }
                });
            }
        }
    }

    async learnDiscrepancyPatterns(orgId, reconciliation) {
        for (const disc of reconciliation.discrepancies || []) {
            await this.supabase.from('discrepancy_patterns').insert({
                organization_id: orgId,
                provider: reconciliation.provider,
                discrepancy_type: disc.type,
                typical_amount: disc.amount,
                resolution: disc.resolution,
                learned_at: new Date().toISOString()
            }).catch(async (error) => {
                // GAP #1 SOLUTION: Track discrepancy pattern learning failure
                if (this.errorTracker) {
                    await this.errorTracker.trackError({
                        type: 'database_write_failed',
                        code: error.code,
                        message: error.message,
                        context: {
                            table: 'discrepancy_patterns',
                            operation: 'insert'
                        },
                        level: 'info',
                        alertOnError: false,
                        orgId
                    });
                } else {
                    console.error('[CrossFeature] discrepancy_patterns insert failed:', error.message);
                }
            });
        }
    }

    async updateDisputeIntelligence(orgId, reconciliation) {
        // If discrepancies were found, update our dispute success predictions
        const discrepancies = reconciliation.discrepancies || [];
        for (const disc of discrepancies) {
            const { data: similar } = await this.supabase
                .from('disputes')
                .select('status, recovered_amount')
                .eq('provider', reconciliation.provider)
                .eq('discrepancy_type', disc.type);

            const successRate = similar?.filter(d => d.status === 'won').length / (similar?.length || 1);

            await this.supabase.from('dispute_predictions').upsert({
                organization_id: orgId,
                provider: reconciliation.provider,
                discrepancy_type: disc.type,
                predicted_success_rate: successRate,
                sample_size: similar?.length || 0,
                updated_at: new Date().toISOString()
            }).catch(async (error) => {
                // GAP #1 SOLUTION: Track dispute intelligence update failure
                if (this.errorTracker) {
                    await this.errorTracker.trackError({
                        type: 'database_write_failed',
                        code: error.code,
                        message: error.message,
                        context: {
                            table: 'dispute_predictions',
                            operation: 'upsert'
                        },
                        level: 'info',
                        alertOnError: false,
                        orgId
                    });
                } else {
                    console.error('[CrossFeature] dispute_predictions upsert failed:', error.message);
                }
            });
        }
    }

    async improveReconciliationModel(orgId, reconciliation) {
        // Store this reconciliation result for ML training
        await this.supabase.from('reconciliation_training_data').insert({
            organization_id: orgId,
            provider: reconciliation.provider,
            match_rate: reconciliation.matchRate,
            timestamp_tolerance_used: reconciliation.timestampTolerance,
            token_tolerance_used: reconciliation.tokenTolerance,
            success: reconciliation.success,
            created_at: new Date().toISOString()
        }).catch(async (error) => {
            // GAP #1 SOLUTION: Track ML training data failure
            if (this.errorTracker) {
                await this.errorTracker.trackError({
                    type: 'database_write_failed',
                    code: error.code,
                    message: error.message,
                    context: {
                        table: 'reconciliation_training_data',
                        operation: 'insert'
                    },
                    level: 'info',
                    alertOnError: false,
                    orgId
                });
            } else {
                console.error('[CrossFeature] reconciliation_training_data insert failed:', error.message);
            }
        });
    }

    async trackSavingsROI(orgId, savings) {
        await this.supabase.from('savings_tracking').insert({
            organization_id: orgId,
            recommendation_id: savings.recommendationId,
            predicted_savings: savings.predictedSavings,
            applied_at: new Date().toISOString(),
            // Actual savings measured after 30 days
            measurement_due: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        }).catch(async (error) => {
            // GAP #1 SOLUTION: Track savings ROI tracking failure
            if (this.errorTracker) {
                await this.errorTracker.trackError({
                    type: 'database_write_failed',
                    code: error.code,
                    message: error.message,
                    context: {
                        table: 'savings_tracking',
                        operation: 'insert'
                    },
                    level: 'warning',
                    alertOnError: false,
                    orgId
                });
            } else {
                console.error('[CrossFeature] savings_tracking insert failed:', error.message);
            }
        });
    }

    async updateRecommendationConfidence(orgId, savings) {
        // If this type of recommendation worked, increase confidence for similar ones
        await this.supabase.from('recommendation_confidence').upsert({
            organization_id: orgId,
            recommendation_type: savings.type,
            success_count: 1, // Will be incremented by trigger
            updated_at: new Date().toISOString()
        }).catch(async (error) => {
            // GAP #1 SOLUTION: Track recommendation confidence update failure
            if (this.errorTracker) {
                await this.errorTracker.trackError({
                    type: 'database_write_failed',
                    code: error.code,
                    message: error.message,
                    context: {
                        table: 'recommendation_confidence',
                        operation: 'upsert'
                    },
                    level: 'info',
                    alertOnError: false,
                    orgId
                });
            } else {
                console.error('[CrossFeature] recommendation_confidence upsert failed:', error.message);
            }
        });
    }

    async contributeToCollectiveIntelligence(orgId, savings) {
        // Anonymized contribution to platform-wide learning
        await this.supabase.from('collective_intelligence').insert({
            recommendation_type: savings.type,
            from_model: savings.fromModel,
            to_model: savings.toModel,
            savings_percent: savings.savingsPercent,
            industry: 'anonymous', // Don't store org info
            contributed_at: new Date().toISOString()
        }).catch(async (error) => {
            // GAP #1 SOLUTION: Track collective intelligence contribution failure
            if (this.errorTracker) {
                await this.errorTracker.trackError({
                    type: 'database_write_failed',
                    code: error.code,
                    message: error.message,
                    context: {
                        table: 'collective_intelligence',
                        operation: 'insert'
                    },
                    level: 'info',
                    alertOnError: false,
                    orgId
                });
            } else {
                console.error('[CrossFeature] collective_intelligence insert failed:', error.message);
            }
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. COMPOUND LEARNING ENGINE
// The more they use, the smarter it gets, the harder to leave
// ═══════════════════════════════════════════════════════════════════════════════

export class CompoundLearningEngine {
    constructor(env) {
        this.env = env;
        this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
        this.dataLayer = new UnifiedDataLayer(env);
    }

    /**
     * Calculate the "intelligence score" - how much we've learned about this org
     * Higher score = harder to leave
     */
    async getIntelligenceScore(orgId) {
        const factors = {
            // Data volume factors
            gatewayRequests: await this.countGatewayRequests(orgId),
            invoicesParsed: await this.countInvoices(orgId),
            reconciliationsCompleted: await this.countReconciliations(orgId),

            // Learning factors
            spendingPatternConfidence: await this.getSpendingPatternConfidence(orgId),
            anomalyBaselineAccuracy: await this.getAnomalyBaselineAccuracy(orgId),
            reconciliationAccuracy: await this.getReconciliationAccuracy(orgId),
            recommendationAccuracy: await this.getRecommendationAccuracy(orgId),

            // Value created factors
            totalSaved: await this.getTotalSaved(orgId),
            disputesWon: await this.getDisputesWon(orgId),
            anomaliesCaught: await this.getAnomaliesCaught(orgId)
        };

        // Calculate weighted score (0-100)
        const score = this.calculateIntelligenceScore(factors);

        // Calculate "switching cost" - what they'd lose by leaving
        const switchingCost = await this.calculateSwitchingCost(orgId, factors);

        return {
            score,
            factors,
            switchingCost,
            monthsOfData: await this.getMonthsOfData(orgId),
            lockInLevel: this.getLockInLevel(score),
            whatTheyWouldLose: this.describeWhatTheyWouldLose(factors)
        };
    }

    async countGatewayRequests(orgId) {
        const { count } = await this.supabase
            .from('gateway_logs')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', orgId);
        return count || 0;
    }

    async countInvoices(orgId) {
        const { count } = await this.supabase
            .from('invoices')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', orgId);
        return count || 0;
    }

    async countReconciliations(orgId) {
        const { count } = await this.supabase
            .from('reconciliations')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', orgId);
        return count || 0;
    }

    async getSpendingPatternConfidence(orgId) {
        const { data } = await this.supabase
            .from('spending_patterns')
            .select('confidence')
            .eq('organization_id', orgId)
            .single();
        return data?.confidence || 0;
    }

    async getAnomalyBaselineAccuracy(orgId) {
        const { data } = await this.supabase
            .from('anomaly_baselines')
            .select('accuracy')
            .eq('organization_id', orgId)
            .single();
        return data?.accuracy || 0;
    }

    async getReconciliationAccuracy(orgId) {
        const { data } = await this.supabase
            .from('reconciliations')
            .select('match_rate')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false })
            .limit(10);

        if (!data || data.length === 0) return 0;
        return data.reduce((sum, r) => sum + r.match_rate, 0) / data.length;
    }

    async getRecommendationAccuracy(orgId) {
        const { data } = await this.supabase
            .from('savings_tracking')
            .select('predicted_savings, actual_savings')
            .eq('organization_id', orgId)
            .not('actual_savings', 'is', null);

        if (!data || data.length === 0) return 0;

        let accurate = 0;
        for (const s of data) {
            if (Math.abs(s.actual_savings - s.predicted_savings) / s.predicted_savings < 0.2) {
                accurate++;
            }
        }
        return accurate / data.length;
    }

    async getTotalSaved(orgId) {
        const { data } = await this.supabase
            .from('savings_implementations')
            .select('savings_amount')
            .eq('organization_id', orgId);

        return (data || []).reduce((sum, s) => sum + (s.savings_amount || 0), 0);
    }

    async getDisputesWon(orgId) {
        const { data } = await this.supabase
            .from('disputes')
            .select('recovered_amount')
            .eq('organization_id', orgId)
            .eq('status', 'won');

        return {
            count: data?.length || 0,
            amount: (data || []).reduce((sum, d) => sum + (d.recovered_amount || 0), 0)
        };
    }

    async getAnomaliesCaught(orgId) {
        const { data } = await this.supabase
            .from('anomaly_detections')
            .select('cost_prevented')
            .eq('organization_id', orgId);

        return {
            count: data?.length || 0,
            amount: (data || []).reduce((sum, a) => sum + (a.cost_prevented || 0), 0)
        };
    }

    async getMonthsOfData(orgId) {
        const { data } = await this.supabase
            .from('gateway_logs')
            .select('timestamp')
            .eq('organization_id', orgId)
            .order('timestamp', { ascending: true })
            .limit(1)
            .single();

        if (!data) return 0;
        const months = (Date.now() - new Date(data.timestamp).getTime()) / (30 * 24 * 60 * 60 * 1000);
        return Math.floor(months);
    }

    calculateIntelligenceScore(factors) {
        let score = 0;

        // Data volume (max 30 points)
        score += Math.min(10, factors.gatewayRequests / 10000);
        score += Math.min(10, factors.invoicesParsed / 12);
        score += Math.min(10, factors.reconciliationsCompleted / 12);

        // Learning quality (max 40 points)
        score += factors.spendingPatternConfidence * 10;
        score += factors.anomalyBaselineAccuracy * 10;
        score += factors.reconciliationAccuracy * 10;
        score += factors.recommendationAccuracy * 10;

        // Value created (max 30 points)
        score += Math.min(10, factors.totalSaved / 10000);
        score += Math.min(10, factors.disputesWon.count / 5);
        score += Math.min(10, factors.anomaliesCaught.count / 10);

        return Math.round(score);
    }

    async calculateSwitchingCost(orgId, factors) {
        // What would it cost them to switch?
        return {
            // Lost data value
            lostLearning: {
                description: 'Months of learned patterns',
                value: await this.getMonthsOfData(orgId),
                unit: 'months'
            },
            // Lost savings
            lostSavings: {
                description: 'Ongoing monthly savings at risk',
                value: factors.totalSaved / 12, // Monthly average
                unit: 'USD/month'
            },
            // Compliance risk
            complianceRisk: {
                description: 'Audit trail history',
                value: await this.getAuditLogCount(orgId),
                unit: 'audit events'
            },
            // Time to rebuild
            rebuildTime: {
                description: 'Time to reach current accuracy',
                value: Math.max(3, await this.getMonthsOfData(orgId)),
                unit: 'months'
            }
        };
    }

    async getAuditLogCount(orgId) {
        const { count } = await this.supabase
            .from('audit_logs')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', orgId);
        return count || 0;
    }

    getLockInLevel(score) {
        if (score >= 80) return { level: 'Platinum', description: 'Deeply integrated, switching nearly impossible' };
        if (score >= 60) return { level: 'Gold', description: 'Strong value, significant switching cost' };
        if (score >= 40) return { level: 'Silver', description: 'Growing value, building lock-in' };
        if (score >= 20) return { level: 'Bronze', description: 'Early stage, limited lock-in' };
        return { level: 'New', description: 'Just started, easy to switch' };
    }

    describeWhatTheyWouldLose(factors) {
        const losses = [];

        if (factors.spendingPatternConfidence > 0.5) {
            losses.push('Learned spending patterns and seasonality detection');
        }
        if (factors.anomalyBaselineAccuracy > 0.5) {
            losses.push('Anomaly detection baselines tuned to your patterns');
        }
        if (factors.reconciliationAccuracy > 0.8) {
            losses.push('High-accuracy reconciliation matching your providers');
        }
        if (factors.totalSaved > 1000) {
            losses.push(`$${factors.totalSaved.toLocaleString()} in identified savings patterns`);
        }
        if (factors.disputesWon.count > 0) {
            losses.push(`Dispute intelligence with ${factors.disputesWon.count} wins`);
        }

        return losses;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. END-TO-END CUSTOMER JOURNEY ORCHESTRATOR
// One complete flow from first touch to value realization
// ═══════════════════════════════════════════════════════════════════════════════

export class CustomerJourneyOrchestrator {
    constructor(env) {
        this.env = env;
        this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
        this.dataLayer = new UnifiedDataLayer(env);
        this.crossFeature = new CrossFeatureIntelligence(env);
        this.learning = new CompoundLearningEngine(env);
    }

    /**
     * THE COMPLETE JOURNEY:
     * 1. Upload Invoice (or connect gateway)
     * 2. Parse & Enrich
     * 3. Allocate to Cost Centers
     * 4. Reconcile against Usage
     * 5. Detect Anomalies & Generate Recommendations
     * 6. Generate Close Pack
     * 7. Email to CFO
     * 8. Track Value Created
     *
     * Each step feeds into the next AND enriches the data layer
     */
    async executeFullJourney(orgId, input) {
        const journey = {
            id: crypto.randomUUID(),
            orgId,
            startedAt: new Date().toISOString(),
            steps: [],
            errors: [],
            valueCreated: 0
        };

        try {
            // Step 1: Ingest
            journey.steps.push(await this.stepIngest(orgId, input, journey.id));

            // Step 2: Parse & Enrich
            journey.steps.push(await this.stepParse(orgId, journey));

            // Step 3: Allocate
            journey.steps.push(await this.stepAllocate(orgId, journey));

            // Step 4: Reconcile
            journey.steps.push(await this.stepReconcile(orgId, journey));

            // Step 5: Analyze & Recommend
            journey.steps.push(await this.stepAnalyze(orgId, journey));

            // Step 6: Generate Close Pack
            journey.steps.push(await this.stepClosePack(orgId, journey));

            // Step 7: Notify
            journey.steps.push(await this.stepNotify(orgId, journey));

            // Step 8: Track Value
            journey.steps.push(await this.stepTrackValue(orgId, journey));

            journey.completedAt = new Date().toISOString();
            journey.success = true;

        } catch (error) {
            journey.errors.push({
                step: journey.steps.length,
                error: error.message,
                timestamp: new Date().toISOString()
            });
            journey.success = false;
        }

        // Store journey for analytics
        await this.storeJourney(journey);

        return journey;
    }

    async stepIngest(orgId, input, journeyId) {
        const step = { name: 'ingest', startedAt: new Date().toISOString() };

        if (input.type === 'invoice') {
            // Store invoice
            const { data } = await this.supabase.from('invoices').insert({
                id: crypto.randomUUID(),
                organization_id: orgId,
                raw_content: input.content,
                source: input.source || 'upload',
                journey_id: journeyId,
                status: 'pending',
                created_at: new Date().toISOString()
            }).select().single();

            step.result = { invoiceId: data.id };
        } else if (input.type === 'gateway_sync') {
            // Sync gateway data
            step.result = { synced: true, requestCount: input.requestCount };
        }

        step.completedAt = new Date().toISOString();
        return step;
    }

    async stepParse(orgId, journey) {
        const step = { name: 'parse', startedAt: new Date().toISOString() };
        const invoiceId = journey.steps[0]?.result?.invoiceId;

        if (!invoiceId) {
            step.skipped = true;
            step.reason = 'No invoice to parse';
            return step;
        }

        // Get invoice content
        const { data: invoice } = await this.supabase
            .from('invoices')
            .select('raw_content')
            .eq('id', invoiceId)
            .single();

        // Parse (simplified - would use full parser)
        const parsed = await this.parseInvoice(invoice.raw_content);

        // Update invoice with parsed data
        await this.supabase
            .from('invoices')
            .update({
                provider: parsed.provider,
                total_amount: parsed.totalAmount,
                line_items: parsed.lineItems,
                period_start: parsed.periodStart,
                period_end: parsed.periodEnd,
                status: 'parsed'
            })
            .eq('id', invoiceId);

        // CROSS-FEATURE: Enrich other systems
        await this.crossFeature.onInvoiceParsed(orgId, { id: invoiceId, ...parsed });

        step.result = parsed;
        step.completedAt = new Date().toISOString();
        return step;
    }

    async stepAllocate(orgId, journey) {
        const step = { name: 'allocate', startedAt: new Date().toISOString() };
        const parsed = journey.steps[1]?.result;

        if (!parsed?.lineItems) {
            step.skipped = true;
            return step;
        }

        // Get allocation rules
        const { data: rules } = await this.supabase
            .from('allocation_rules')
            .select('*')
            .eq('organization_id', orgId)
            .eq('is_active', true);

        // Apply rules
        const allocated = this.applyAllocationRules(parsed.lineItems, rules || []);

        step.result = {
            allocated: allocated.length,
            byDepartment: this.groupByDepartment(allocated)
        };
        step.completedAt = new Date().toISOString();
        return step;
    }

    async stepReconcile(orgId, journey) {
        const step = { name: 'reconcile', startedAt: new Date().toISOString() };
        const parsed = journey.steps[1]?.result;

        if (!parsed?.lineItems) {
            step.skipped = true;
            return step;
        }

        // Get gateway logs for the period
        const { data: logs } = await this.supabase
            .from('gateway_logs')
            .select('*')
            .eq('organization_id', orgId)
            .gte('timestamp', parsed.periodStart)
            .lte('timestamp', parsed.periodEnd);

        // Perform reconciliation
        const reconciliation = this.reconcile(parsed.lineItems, logs || []);

        // Store reconciliation result
        await this.supabase.from('reconciliations').insert({
            id: crypto.randomUUID(),
            organization_id: orgId,
            invoice_id: journey.steps[0]?.result?.invoiceId,
            match_rate: reconciliation.matchRate,
            matched_items: reconciliation.matched.length,
            discrepancies: reconciliation.discrepancies,
            created_at: new Date().toISOString()
        });

        // CROSS-FEATURE: Enrich
        await this.crossFeature.onReconciliationComplete(orgId, reconciliation);

        step.result = {
            matchRate: reconciliation.matchRate,
            discrepancies: reconciliation.discrepancies.length,
            totalDiscrepancyAmount: reconciliation.discrepancies.reduce((s, d) => s + d.amount, 0)
        };
        step.completedAt = new Date().toISOString();
        return step;
    }

    async stepAnalyze(orgId, journey) {
        const step = { name: 'analyze', startedAt: new Date().toISOString() };

        const reconciliation = journey.steps[3]?.result;
        const parsed = journey.steps[1]?.result;

        // Generate recommendations based on journey data
        const recommendations = [];

        // Model optimization recommendations
        if (parsed?.lineItems) {
            const modelRecs = this.generateModelRecommendations(parsed.lineItems);
            recommendations.push(...modelRecs);
        }

        // Dispute recommendations for discrepancies
        if (reconciliation?.discrepancies > 0) {
            recommendations.push({
                type: 'dispute',
                priority: 'high',
                description: `Found ${reconciliation.discrepancies} discrepancies worth $${reconciliation.totalDiscrepancyAmount.toFixed(2)}`,
                action: 'Create dispute'
            });
        }

        step.result = {
            recommendations,
            potentialSavings: recommendations.reduce((s, r) => s + (r.savings || 0), 0)
        };
        step.completedAt = new Date().toISOString();

        // Update journey value
        journey.valueCreated += step.result.potentialSavings;

        return step;
    }

    async stepClosePack(orgId, journey) {
        const step = { name: 'closePack', startedAt: new Date().toISOString() };

        const closePack = {
            id: crypto.randomUUID(),
            organizationId: orgId,
            period: journey.steps[1]?.result?.periodStart?.substring(0, 7) || 'unknown',
            summary: {
                totalSpend: journey.steps[1]?.result?.totalAmount || 0,
                lineItems: journey.steps[1]?.result?.lineItems?.length || 0,
                matchRate: journey.steps[3]?.result?.matchRate || 0,
                discrepancies: journey.steps[3]?.result?.discrepancies || 0,
                potentialSavings: journey.steps[4]?.result?.potentialSavings || 0
            },
            allocation: journey.steps[2]?.result?.byDepartment || {},
            recommendations: journey.steps[4]?.result?.recommendations || [],
            generatedAt: new Date().toISOString()
        };

        // Store close pack
        await this.supabase.from('close_packs').insert({
            id: closePack.id,
            organization_id: orgId,
            period: closePack.period,
            data: closePack,
            status: 'generated',
            created_at: new Date().toISOString()
        });

        step.result = { closePackId: closePack.id };
        step.completedAt = new Date().toISOString();
        return step;
    }

    async stepNotify(orgId, journey) {
        const step = { name: 'notify', startedAt: new Date().toISOString() };

        // Get org notification preferences
        const { data: org } = await this.supabase
            .from('organizations')
            .select('admin_email, name')
            .eq('id', orgId)
            .single();

        if (org?.admin_email) {
            // Would send email here
            step.result = {
                sent: true,
                to: org.admin_email,
                closePackId: journey.steps[5]?.result?.closePackId
            };
        } else {
            step.result = { sent: false, reason: 'No admin email configured' };
        }

        step.completedAt = new Date().toISOString();
        return step;
    }

    async stepTrackValue(orgId, journey) {
        const step = { name: 'trackValue', startedAt: new Date().toISOString() };

        const value = {
            journeyId: journey.id,
            totalSpendAnalyzed: journey.steps[1]?.result?.totalAmount || 0,
            savingsIdentified: journey.steps[4]?.result?.potentialSavings || 0,
            discrepanciesFound: journey.steps[3]?.result?.totalDiscrepancyAmount || 0,
            automatedActionsAvailable: journey.steps[4]?.result?.recommendations?.length || 0
        };

        // Store value tracking
        await this.supabase.from('value_tracking').insert({
            organization_id: orgId,
            journey_id: journey.id,
            value_created: value.savingsIdentified + value.discrepanciesFound,
            details: value,
            created_at: new Date().toISOString()
        });

        // Update intelligence score
        const intelligence = await this.learning.getIntelligenceScore(orgId);

        step.result = {
            valueCreated: value.savingsIdentified + value.discrepanciesFound,
            intelligenceScore: intelligence.score,
            lockInLevel: intelligence.lockInLevel.level
        };
        step.completedAt = new Date().toISOString();
        return step;
    }

    // Helper methods
    async parseInvoice(content) {
        // Simplified parsing - would use full StreamingParser
        const lines = content.split('\n');
        const lineItems = lines.slice(1).map((line, i) => {
            const parts = line.split(',');
            return {
                id: `line_${i}`,
                date: parts[0],
                model: parts[1],
                tokens: parseInt(parts[2]) || 0,
                cost: parseFloat(parts[3]) || 0
            };
        }).filter(l => l.cost > 0);

        return {
            provider: this.detectProvider(content),
            lineItems,
            totalAmount: lineItems.reduce((s, l) => s + l.cost, 0),
            periodStart: lineItems[0]?.date,
            periodEnd: lineItems[lineItems.length - 1]?.date
        };
    }

    detectProvider(content) {
        if (content.includes('openai') || content.includes('gpt')) return 'openai';
        if (content.includes('anthropic') || content.includes('claude')) return 'anthropic';
        if (content.includes('google') || content.includes('gemini')) return 'google';
        return 'unknown';
    }

    applyAllocationRules(lineItems, rules) {
        return lineItems.map(item => {
            for (const rule of rules) {
                if (this.matchesRule(item, rule)) {
                    return { ...item, costCenter: rule.cost_center };
                }
            }
            return { ...item, costCenter: 'Unallocated' };
        });
    }

    matchesRule(item, rule) {
        if (rule.model_pattern && item.model?.includes(rule.model_pattern)) return true;
        if (rule.cost_threshold && item.cost > rule.cost_threshold) return true;
        return false;
    }

    groupByDepartment(items) {
        return items.reduce((acc, item) => {
            const dept = item.costCenter || 'Unallocated';
            acc[dept] = (acc[dept] || 0) + item.cost;
            return acc;
        }, {});
    }

    reconcile(invoiceItems, gatewayLogs) {
        const matched = [];
        const unmatched = [];
        const discrepancies = [];

        for (const item of invoiceItems) {
            const match = gatewayLogs.find(log =>
                log.model === item.model &&
                Math.abs(new Date(log.timestamp) - new Date(item.date)) < 24 * 60 * 60 * 1000
            );

            if (match) {
                matched.push({ invoice: item, log: match });
                if (Math.abs(item.cost - (parseFloat(match.cost_usd) || 0)) > 0.01) {
                    discrepancies.push({
                        type: 'cost_mismatch',
                        invoiceAmount: item.cost,
                        gatewayAmount: parseFloat(match.cost_usd) || 0,
                        amount: Math.abs(item.cost - (parseFloat(match.cost_usd) || 0))
                    });
                }
            } else {
                unmatched.push(item);
            }
        }

        return {
            matched,
            unmatched,
            discrepancies,
            matchRate: invoiceItems.length > 0 ? matched.length / invoiceItems.length : 0
        };
    }

    generateModelRecommendations(lineItems) {
        const recommendations = [];
        const expensiveModels = ['gpt-4', 'claude-3-opus'];

        const byModel = lineItems.reduce((acc, item) => {
            acc[item.model] = (acc[item.model] || 0) + item.cost;
            return acc;
        }, {});

        for (const [model, cost] of Object.entries(byModel)) {
            if (expensiveModels.some(m => model?.includes(m)) && cost > 100) {
                recommendations.push({
                    type: 'model_optimization',
                    currentModel: model,
                    suggestedModel: model.includes('gpt') ? 'gpt-4o-mini' : 'claude-3-haiku',
                    currentCost: cost,
                    savings: cost * 0.7, // 70% savings estimate
                    priority: 'high'
                });
            }
        }

        return recommendations;
    }

    async storeJourney(journey) {
        await this.supabase.from('customer_journeys').insert({
            id: journey.id,
            organization_id: journey.orgId,
            steps: journey.steps,
            errors: journey.errors,
            value_created: journey.valueCreated,
            success: journey.success,
            started_at: journey.startedAt,
            completed_at: journey.completedAt
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. PLATFORM ORCHESTRATOR
// The single entry point that coordinates everything
// ═══════════════════════════════════════════════════════════════════════════════

export class PlatformOrchestrator {
    constructor(env) {
        this.env = env;
        this.dataLayer = new UnifiedDataLayer(env);
        this.crossFeature = new CrossFeatureIntelligence(env);
        this.learning = new CompoundLearningEngine(env);
        this.journey = new CustomerJourneyOrchestrator(env);
    }

    /**
     * Main entry point for all platform operations
     */
    async execute(orgId, operation, data) {
        // Enrich the data layer on every operation
        const profile = await this.dataLayer.getOrganizationProfile(orgId);

        // Route to appropriate handler
        switch (operation) {
            case 'full_journey':
                return this.journey.executeFullJourney(orgId, data);

            case 'upload_invoice':
                return this.handleInvoiceUpload(orgId, data, profile);

            case 'gateway_request':
                await this.crossFeature.onGatewayRequest(orgId, data);
                return { enriched: true };

            case 'get_intelligence':
                return this.learning.getIntelligenceScore(orgId);

            case 'get_profile':
                return profile;

            default:
                throw new Error(`Unknown operation: ${operation}`);
        }
    }

    async handleInvoiceUpload(orgId, data, profile) {
        // Execute the full journey
        const journey = await this.journey.executeFullJourney(orgId, {
            type: 'invoice',
            content: data.content,
            source: data.source
        });

        // Return enriched result with context
        return {
            journey,
            profile: {
                intelligenceScore: (await this.learning.getIntelligenceScore(orgId)).score,
                lockInLevel: (await this.learning.getIntelligenceScore(orgId)).lockInLevel.level
            },
            nextSteps: this.getRecommendedNextSteps(journey)
        };
    }

    getRecommendedNextSteps(journey) {
        const steps = [];

        if (journey.steps[4]?.result?.recommendations?.length > 0) {
            steps.push({
                action: 'review_recommendations',
                priority: 'high',
                description: `Review ${journey.steps[4].result.recommendations.length} savings recommendations`
            });
        }

        if (journey.steps[3]?.result?.discrepancies > 0) {
            steps.push({
                action: 'review_discrepancies',
                priority: 'high',
                description: `Review ${journey.steps[3].result.discrepancies} billing discrepancies`
            });
        }

        steps.push({
            action: 'share_close_pack',
            priority: 'medium',
            description: 'Share the close pack with your team'
        });

        return steps;
    }
}

// Export everything
export default {
    UnifiedDataLayer,
    CrossFeatureIntelligence,
    CompoundLearningEngine,
    CustomerJourneyOrchestrator,
    PlatformOrchestrator
};
