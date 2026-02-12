/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ANOMALY & INSIGHTS CSV GENERATOR - The 10th Close Pack Artifact
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The Close Pack generates 9 CFO-ready artifacts. The 10th is the Anomaly & Insights
 * CSV - a detailed, actionable breakdown of anomalies detected, insights discovered,
 * and recommendations with confidence-based gating.
 *
 * This component produces RFC 4180 compliant CSV with proper escaping.
 * Every insight is scored, categorized, and gated by the FCS confidence tier system:
 * - Observe: Low confidence, monitor only
 * - Review: Medium confidence, requires review
 * - Recommend: High confidence, auto-recommend
 * - Automate: Very high confidence, can auto-execute
 */

/**
 * AnomalyInsightsGenerator - Generates the 10th Close Pack artifact
 */
export class AnomalyInsightsGenerator {
    constructor(options = {}) {
        this.config = {
            org_id: options.organizationId || 'ORG_UNKNOWN',
            minConfidenceScore: options.minConfidenceScore || 0.3,
            confidenceTiers: {
                observe: { min: 0.0, max: 0.5 },
                review: { min: 0.5, max: 0.75 },
                recommend: { min: 0.75, max: 0.9 },
                automate: { min: 0.9, max: 1.0 }
            }
        };
    }

    /**
     * Main generation method
     * Input: orgId, period, reconResults (reconciliation data), anomalyData (from analytics)
     * Output: CSV string ready to write to file
     */
    generate(orgId, period, reconResults = [], anomalyData = {}) {
        const insights = [];

        // Categorize and score anomalies from reconciliation results
        if (Array.isArray(reconResults)) {
            reconResults.forEach(recon => {
                const insight = this._processReconciliationData(recon, period);
                if (insight) insights.push(insight);
            });
        }

        // Process aggregated anomaly data
        if (anomalyData.costAnomalies) {
            anomalyData.costAnomalies.forEach(anomaly => {
                const insight = this._processCostAnomaly(anomaly, period);
                if (insight) insights.push(insight);
            });
        }

        if (anomalyData.usageSpikes) {
            anomalyData.usageSpikes.forEach(spike => {
                const insight = this._processUsageSpike(spike, period);
                if (insight) insights.push(insight);
            });
        }

        if (anomalyData.rateChanges) {
            anomalyData.rateChanges.forEach(change => {
                const insight = this._processRateChange(change, period);
                if (insight) insights.push(insight);
            });
        }

        if (anomalyData.optimizationOpportunities) {
            anomalyData.optimizationOpportunities.forEach(opp => {
                const insight = this._processOptimizationOpportunity(opp, period);
                if (insight) insights.push(insight);
            });
        }

        if (anomalyData.budgetRisks) {
            anomalyData.budgetRisks.forEach(risk => {
                const insight = this._processBudgetRisk(risk, period);
                if (insight) insights.push(insight);
            });
        }

        if (anomalyData.modelDeprecations) {
            anomalyData.modelDeprecations.forEach(deprecation => {
                const insight = this._processModelDeprecation(deprecation, period);
                if (insight) insights.push(insight);
            });
        }

        if (anomalyData.seasonalPatterns) {
            anomalyData.seasonalPatterns.forEach(pattern => {
                const insight = this._processSeasonalPattern(pattern, period);
                if (insight) insights.push(insight);
            });
        }

        // Filter by minimum confidence score
        const filteredInsights = insights.filter(i => i.confidence_score >= this.config.minConfidenceScore);

        // Sort by confidence (highest first) then by date
        filteredInsights.sort((a, b) => {
            if (b.confidence_score !== a.confidence_score) {
                return b.confidence_score - a.confidence_score;
            }
            return new Date(b.date) - new Date(a.date);
        });

        // Generate CSV
        const csv = this.formatCSV(filteredInsights);

        return {
            csv,
            insights: filteredInsights,
            summary: this.generateSummaryRow(filteredInsights),
            count: filteredInsights.length
        };
    }

    /**
     * Process reconciliation data into insight
     */
    _processReconciliationData(recon, period) {
        // Reconciliation data typically indicates discrepancies
        if (!recon.variance || recon.variance === 0) return null;

        const absVariance = Math.abs(recon.variance);
        const confidenceScore = Math.min(0.95, absVariance > 100 ? 0.85 : absVariance > 10 ? 0.7 : 0.5);

        return {
            date: recon.reconciled_at || new Date().toISOString().split('T')[0],
            type: 'cost_anomaly',
            severity: absVariance > 100 ? 'high' : absVariance > 10 ? 'medium' : 'low',
            description: `Invoice variance detected: $${absVariance.toFixed(2)} (${recon.provider || 'Unknown'})`,
            model: recon.provider || 'N/A',
            provider: recon.provider || 'Unknown',
            team: recon.team || 'Finance',
            amount_impact: recon.variance,
            confidence_score: confidenceScore,
            recommendation: `Review ${recon.provider || 'invoice'} charges against usage records`,
            status: recon.status || 'open',
            fcs_gated: confidenceScore >= 0.75
        };
    }

    /**
     * Process cost anomaly
     */
    _processCostAnomaly(anomaly, period) {
        const confidenceScore = this._scoreConfidence({
            type: 'cost_anomaly',
            magnitude: anomaly.percent_change,
            dataPoints: anomaly.sample_size,
            consistency: anomaly.consistency_score
        });

        return {
            date: anomaly.detected_at || new Date().toISOString().split('T')[0],
            type: 'cost_anomaly',
            severity: this._severityFromMagnitude(anomaly.percent_change),
            description: `Cost spike detected: ${anomaly.percent_change.toFixed(1)}% above baseline for ${anomaly.provider}`,
            model: anomaly.model || 'N/A',
            provider: anomaly.provider,
            team: anomaly.team || 'Engineering',
            amount_impact: anomaly.dollar_impact || 0,
            confidence_score: confidenceScore,
            recommendation: `Investigate ${anomaly.provider} usage patterns; consider rate optimization`,
            status: 'open',
            fcs_gated: this.gateByConfidence({ confidence_score: confidenceScore }) !== 'observe'
        };
    }

    /**
     * Process usage spike
     */
    _processUsageSpike(spike, period) {
        const confidenceScore = this._scoreConfidence({
            type: 'usage_spike',
            magnitude: spike.percent_above_baseline,
            dataPoints: spike.consecutive_hours,
            pattern: spike.is_weekend ? 0.2 : 1.0 // Lower confidence on weekends
        });

        return {
            date: spike.detected_at || new Date().toISOString().split('T')[0],
            type: 'usage_spike',
            severity: this._severityFromMagnitude(spike.percent_above_baseline),
            description: `Usage spike: ${spike.percent_above_baseline.toFixed(1)}% above baseline for ${spike.duration_hours}h`,
            model: spike.model,
            provider: spike.provider,
            team: spike.team || 'Engineering',
            amount_impact: spike.estimated_cost_impact || 0,
            confidence_score: confidenceScore,
            recommendation: `Check for batch jobs or automated tests running during spike window`,
            status: 'open',
            fcs_gated: this.gateByConfidence({ confidence_score: confidenceScore }) !== 'observe'
        };
    }

    /**
     * Process rate change
     */
    _processRateChange(change, period) {
        const confidenceScore = this._scoreConfidence({
            type: 'rate_change',
            magnitude: Math.abs(change.percent_change),
            dataPoints: change.api_calls_since_change,
            consistency: change.is_consistent ? 0.9 : 0.6
        });

        return {
            date: change.detected_at || new Date().toISOString().split('T')[0],
            type: 'rate_change',
            severity: Math.abs(change.percent_change) > 20 ? 'high' : 'medium',
            description: `Rate change: ${change.model} pricing changed by ${change.percent_change.toFixed(1)}%`,
            model: change.model,
            provider: change.provider,
            team: 'Finance',
            amount_impact: change.annual_impact || 0,
            confidence_score: confidenceScore,
            recommendation: `Confirm pricing change with provider; update budget forecasts`,
            status: 'open',
            fcs_gated: true
        };
    }

    /**
     * Process optimization opportunity
     */
    _processOptimizationOpportunity(opp, period) {
        const confidenceScore = this._scoreConfidence({
            type: 'optimization_opportunity',
            magnitude: opp.potential_savings_percent,
            dataPoints: opp.sample_size,
            implementation_complexity: 1 - (opp.difficulty_score || 0.5)
        });

        return {
            date: opp.discovered_at || new Date().toISOString().split('T')[0],
            type: 'optimization_opportunity',
            severity: opp.potential_savings_percent > 30 ? 'high' : opp.potential_savings_percent > 10 ? 'medium' : 'low',
            description: `${opp.optimization_type}: Potential ${opp.potential_savings_percent.toFixed(1)}% savings (${opp.monthly_savings_estimate.toFixed(2)}/month)`,
            model: opp.primary_model || 'N/A',
            provider: opp.provider,
            team: opp.impacted_team || 'Engineering',
            amount_impact: opp.monthly_savings_estimate,
            confidence_score: confidenceScore,
            recommendation: opp.recommended_action || 'Implement caching or batching',
            status: 'open',
            fcs_gated: confidenceScore >= 0.75
        };
    }

    /**
     * Process budget risk
     */
    _processBudgetRisk(risk, period) {
        const pctToLimit = (risk.current_spend / risk.monthly_budget * 100) || 0;
        const confidenceScore = Math.min(1.0, 0.5 + (pctToLimit / 100) * 0.5);

        return {
            date: risk.detected_at || new Date().toISOString().split('T')[0],
            type: 'budget_risk',
            severity: pctToLimit > 90 ? 'high' : pctToLimit > 70 ? 'medium' : 'low',
            description: `Budget risk: ${pctToLimit.toFixed(0)}% of monthly budget spent (${risk.days_remaining} days remaining)`,
            model: 'N/A',
            provider: risk.provider || 'All',
            team: risk.team || 'Finance',
            amount_impact: Math.max(0, risk.projected_overrun || 0),
            confidence_score: confidenceScore,
            recommendation: `Implement spending controls; reduce non-critical usage`,
            status: 'open',
            fcs_gated: pctToLimit > 70
        };
    }

    /**
     * Process model deprecation
     */
    _processModelDeprecation(deprecation, period) {
        const daysUntilSunset = Math.ceil(
            (new Date(deprecation.sunset_date) - new Date()) / (1000 * 60 * 60 * 24)
        );
        const urgencyFactor = Math.max(0.5, 1 - (daysUntilSunset / 365));
        const confidenceScore = Math.min(0.95, 0.6 + urgencyFactor * 0.35);

        return {
            date: deprecation.announced_date || new Date().toISOString().split('T')[0],
            type: 'model_deprecation',
            severity: daysUntilSunset < 30 ? 'high' : daysUntilSunset < 90 ? 'medium' : 'low',
            description: `Model deprecation: ${deprecation.model} sunsets on ${deprecation.sunset_date} (${daysUntilSunset} days)`,
            model: deprecation.model,
            provider: deprecation.provider,
            team: deprecation.using_team || 'Engineering',
            amount_impact: 0,
            confidence_score: confidenceScore,
            recommendation: `Migrate from ${deprecation.model} to ${deprecation.recommended_replacement || 'latest version'}`,
            status: 'open',
            fcs_gated: daysUntilSunset < 60
        };
    }

    /**
     * Process seasonal pattern
     */
    _processSeasonalPattern(pattern, period) {
        const confidenceScore = this._scoreConfidence({
            type: 'seasonal_pattern',
            magnitude: pattern.peak_to_trough_percent,
            dataPoints: pattern.years_of_data * 12, // months of historical data
            consistency: pattern.pattern_strength
        });

        return {
            date: pattern.detected_at || new Date().toISOString().split('T')[0],
            type: 'seasonal_pattern',
            severity: pattern.peak_to_trough_percent > 50 ? 'high' : 'medium',
            description: `Seasonal pattern detected: ${pattern.peak_month} peaks ${pattern.peak_to_trough_percent.toFixed(0)}% above ${pattern.trough_month}`,
            model: 'N/A',
            provider: pattern.provider || 'All',
            team: pattern.team || 'Finance',
            amount_impact: pattern.avg_peak_month_spend - pattern.avg_trough_month_spend,
            confidence_score: confidenceScore,
            recommendation: `Budget ${pattern.peak_month} with ${pattern.peak_to_trough_percent.toFixed(0)}% higher allocation`,
            status: 'open',
            fcs_gated: confidenceScore >= 0.7
        };
    }

    /**
     * Categorize raw data into insight types
     */
    categorizeInsight(dataPoint) {
        if (dataPoint.variance !== undefined) return 'cost_anomaly';
        if (dataPoint.percent_change !== undefined) return 'rate_change';
        if (dataPoint.percent_above_baseline !== undefined) return 'usage_spike';
        if (dataPoint.potential_savings_percent !== undefined) return 'optimization_opportunity';
        if (dataPoint.projected_overrun !== undefined) return 'budget_risk';
        if (dataPoint.sunset_date !== undefined) return 'model_deprecation';
        if (dataPoint.peak_to_trough_percent !== undefined) return 'seasonal_pattern';
        return 'unknown';
    }

    /**
     * Score confidence for an insight
     * Uses multiple factors: data points, consistency, magnitude, complexity
     */
    _scoreConfidence(factors) {
        let score = 0.5; // baseline

        // Data points factor
        if (factors.dataPoints !== undefined) {
            const pointsFactor = Math.min(1.0, factors.dataPoints / 100);
            score += 0.15 * pointsFactor;
        }

        // Consistency factor
        if (factors.consistency !== undefined) {
            score += 0.15 * factors.consistency;
        }

        // Magnitude factor - higher magnitudes increase confidence
        if (factors.magnitude !== undefined) {
            const magFactor = Math.min(1.0, Math.abs(factors.magnitude) / 100);
            score += 0.15 * magFactor;
        }

        // Pattern factor
        if (factors.pattern !== undefined) {
            score += 0.1 * factors.pattern;
        }

        // Implementation complexity (lower is better)
        if (factors.implementation_complexity !== undefined) {
            score += 0.15 * factors.implementation_complexity;
        }

        // Clamp to [0, 1]
        return Math.max(0, Math.min(1.0, score));
    }

    /**
     * Gate action by confidence tier
     * Returns: 'observe', 'review', 'recommend', or 'automate'
     */
    gateByConfidence(insight) {
        const score = insight.confidence_score;
        const { confidenceTiers } = this.config;

        if (score >= confidenceTiers.automate.min) return 'automate';
        if (score >= confidenceTiers.recommend.min) return 'recommend';
        if (score >= confidenceTiers.review.min) return 'review';
        return 'observe';
    }

    /**
     * Determine severity from magnitude
     */
    _severityFromMagnitude(percent) {
        if (Math.abs(percent) > 50) return 'high';
        if (Math.abs(percent) > 20) return 'medium';
        return 'low';
    }

    /**
     * Format insights as RFC 4180 compliant CSV
     */
    formatCSV(insights) {
        const headers = [
            'date',
            'type',
            'severity',
            'description',
            'model',
            'provider',
            'team',
            'amount_impact',
            'confidence_score',
            'recommendation',
            'status',
            'fcs_gated'
        ];

        const lines = [];

        // Add header row
        lines.push(this._escapeCSVRow(headers));

        // Add data rows
        insights.forEach(insight => {
            const row = [
                insight.date,
                insight.type,
                insight.severity,
                insight.description,
                insight.model,
                insight.provider,
                insight.team,
                insight.amount_impact.toFixed(2),
                insight.confidence_score.toFixed(4),
                insight.recommendation,
                insight.status,
                insight.fcs_gated ? 'true' : 'false'
            ];
            lines.push(this._escapeCSVRow(row));
        });

        // Add summary row
        const summary = this.generateSummaryRow(insights);
        if (summary) {
            lines.push(''); // blank line
            lines.push(this._escapeCSVRow(summary));
        }

        return lines.join('\n');
    }

    /**
     * Escape CSV row values
     * Per RFC 4180: fields with commas, quotes, or newlines must be quoted
     * Quotes inside quoted fields are doubled
     */
    _escapeCSVRow(values) {
        return values.map(val => {
            const str = String(val);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        }).join(',');
    }

    /**
     * Generate summary row with statistics
     */
    generateSummaryRow(insights) {
        if (!insights.length) return null;

        const totalAmount = insights.reduce((sum, i) => sum + i.amount_impact, 0);
        const avgConfidence = insights.reduce((sum, i) => sum + i.confidence_score, 0) / insights.length;
        const highSeverityCount = insights.filter(i => i.severity === 'high').length;
        const gatedCount = insights.filter(i => i.fcs_gated).length;

        return [
            'SUMMARY',
            '',
            '',
            `Total insights: ${insights.length}, High severity: ${highSeverityCount}, Gated actions: ${gatedCount}`,
            '',
            '',
            '',
            totalAmount.toFixed(2),
            avgConfidence.toFixed(4),
            `Average confidence: ${(avgConfidence * 100).toFixed(1)}%`,
            '',
            ''
        ];
    }
}

export default AnomalyInsightsGenerator;
