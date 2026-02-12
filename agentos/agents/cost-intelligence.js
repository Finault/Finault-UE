/**
 * COST INTELLIGENCE AGENT
 * Specialist agent for anomaly detection and pattern learning
 *
 * This agent runs continuously (or on-demand) to:
 * - Detect spending anomalies using statistical methods
 * - Learn patterns in cost data
 * - Identify cost drivers
 * - Correlate usage with spending
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { AgentMemory, MEMORY_TYPES, IMPORTANCE } from '../core/agent-memory.js';
import { validateAgentParams } from '../core/validate-agent-params.js';
import { createSupabaseResilience, createAnthropicResilience } from '../core/resilience-layer.js';
import { createAnomalyPersistence } from '../core/anomaly-persistence.js';

const anthropic = new Anthropic();
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const resilientSupabase = createSupabaseResilience(supabase);
const resilientAnthropic = createAnthropicResilience(anthropic);

const AGENT_CONFIG = {
    id: 'cost-intelligence',
    name: 'Cost Intelligence Agent',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 4096
};

const SYSTEM_PROMPT = `You are the Cost Intelligence Agent for Finault.

Your specialty is detecting anomalies and learning patterns in AI cost data.

## Your Capabilities
1. **Anomaly Detection** - Use multiple statistical methods:
   - Z-score: Identify values outside normal distribution
   - IQR (Interquartile Range): Robust outlier detection
   - EWMA (Exponentially Weighted Moving Average): Trend-aware detection
   - CUSUM (Cumulative Sum): Sequential change detection

2. **Pattern Learning** - Identify recurring patterns:
   - Daily/weekly/monthly cycles
   - Usage spikes correlated with events
   - Cost drivers (which factors influence spending most)
   - Team/project spending behaviors

3. **Root Cause Analysis** - When anomalies occur:
   - Drill down to specific providers, models, projects
   - Identify the exact timeframe and magnitude
   - Suggest likely causes based on patterns

## Output Format
Always structure your findings clearly:
- Severity: Critical / Warning / Info
- Confidence: 0-100%
- Impact: Estimated dollar amount
- Root Cause: Best hypothesis
- Recommendation: Specific action to take

Be precise with numbers. Never round excessively.`;

export class CostIntelligenceAgent {
    constructor(params = {}) {
        const { organizationId, userId, config } = validateAgentParams(params, 'CostIntelligenceAgent');
        this.userId = userId;
        this.organizationId = organizationId;
        this.memory = new AgentMemory(AGENT_CONFIG.id || 'cost-intelligence', organizationId, userId);
        this._memoryLoaded = false;

        // W-010: Anomaly persistence for detected anomalies
        this.anomalyPersistence = createAnomalyPersistence(resilientSupabase);
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
     * Statistical anomaly detection methods
     */
    detectAnomalies(data, method = 'ensemble') {
        const values = data.map(d => d.value);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const std = Math.sqrt(values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length);

        const anomalies = [];

        // Z-score method
        if (method === 'zscore' || method === 'ensemble') {
            data.forEach((d, i) => {
                const zscore = (d.value - mean) / std;
                if (Math.abs(zscore) > 2.5) {
                    anomalies.push({
                        method: 'zscore',
                        index: i,
                        value: d.value,
                        zscore,
                        severity: Math.abs(zscore) > 3.5 ? 'critical' : 'warning',
                        timestamp: d.timestamp
                    });
                }
            });
        }

        // IQR method
        if (method === 'iqr' || method === 'ensemble') {
            const sorted = [...values].sort((a, b) => a - b);
            const q1 = sorted[Math.floor(sorted.length * 0.25)];
            const q3 = sorted[Math.floor(sorted.length * 0.75)];
            const iqr = q3 - q1;
            const lowerBound = q1 - 1.5 * iqr;
            const upperBound = q3 + 1.5 * iqr;

            data.forEach((d, i) => {
                if (d.value < lowerBound || d.value > upperBound) {
                    const existing = anomalies.find(a => a.index === i);
                    if (existing) {
                        existing.methods = [...(existing.methods || [existing.method]), 'iqr'];
                    } else {
                        anomalies.push({
                            method: 'iqr',
                            index: i,
                            value: d.value,
                            deviation: d.value > upperBound ? d.value - upperBound : lowerBound - d.value,
                            severity: 'warning',
                            timestamp: d.timestamp
                        });
                    }
                }
            });
        }

        // EWMA method (exponentially weighted moving average)
        if (method === 'ewma' || method === 'ensemble') {
            const lambda = 0.3; // smoothing factor
            let ewma = values[0];
            const ewmaValues = [ewma];

            for (let i = 1; i < values.length; i++) {
                ewma = lambda * values[i] + (1 - lambda) * ewma;
                ewmaValues.push(ewma);
            }

            // Calculate EWMA standard deviation
            let ewmaStd = 0;
            for (let i = 1; i < values.length; i++) {
                ewmaStd += Math.pow(values[i] - ewmaValues[i - 1], 2);
            }
            ewmaStd = Math.sqrt(ewmaStd / (values.length - 1));

            data.forEach((d, i) => {
                if (i > 0) {
                    const deviation = Math.abs(d.value - ewmaValues[i - 1]);
                    if (deviation > 2.5 * ewmaStd) {
                        const existing = anomalies.find(a => a.index === i);
                        if (existing) {
                            existing.methods = [...(existing.methods || [existing.method]), 'ewma'];
                            existing.confidence = (existing.confidence || 0.6) + 0.2;
                        } else {
                            anomalies.push({
                                method: 'ewma',
                                index: i,
                                value: d.value,
                                expected: ewmaValues[i - 1],
                                deviation,
                                severity: deviation > 3.5 * ewmaStd ? 'critical' : 'warning',
                                timestamp: d.timestamp
                            });
                        }
                    }
                }
            });
        }

        // CUSUM method (cumulative sum for change detection)
        if (method === 'cusum' || method === 'ensemble') {
            const target = mean;
            const k = 0.5 * std; // allowance
            const h = 4 * std; // threshold

            let cusumHigh = 0;
            let cusumLow = 0;

            data.forEach((d, i) => {
                cusumHigh = Math.max(0, cusumHigh + d.value - target - k);
                cusumLow = Math.min(0, cusumLow + d.value - target + k);

                if (cusumHigh > h || cusumLow < -h) {
                    const existing = anomalies.find(a => a.index === i);
                    if (existing) {
                        existing.methods = [...(existing.methods || [existing.method]), 'cusum'];
                        existing.confidence = Math.min(1, (existing.confidence || 0.6) + 0.15);
                    } else {
                        anomalies.push({
                            method: 'cusum',
                            index: i,
                            value: d.value,
                            cusumValue: cusumHigh > h ? cusumHigh : cusumLow,
                            direction: cusumHigh > h ? 'increase' : 'decrease',
                            severity: 'warning',
                            timestamp: d.timestamp
                        });
                    }
                }
            });
        }

        // Calculate ensemble confidence
        anomalies.forEach(a => {
            if (a.methods) {
                a.confidence = Math.min(0.95, 0.5 + a.methods.length * 0.15);
                a.severity = a.methods.length >= 3 ? 'critical' : a.severity;
            } else {
                a.confidence = a.confidence || 0.6;
            }
        });

        return anomalies.sort((a, b) => b.confidence - a.confidence);
    }

    /**
     * Detect patterns in time series data
     */
    detectPatterns(data) {
        const patterns = [];

        // Daily pattern detection
        const byHour = {};
        data.forEach(d => {
            const hour = new Date(d.timestamp).getHours();
            byHour[hour] = byHour[hour] || [];
            byHour[hour].push(d.value);
        });

        const hourlyAverages = Object.entries(byHour).map(([hour, values]) => ({
            hour: parseInt(hour),
            avg: values.reduce((a, b) => a + b, 0) / values.length
        }));

        const peakHour = hourlyAverages.reduce((max, h) => h.avg > max.avg ? h : max);
        const lowHour = hourlyAverages.reduce((min, h) => h.avg < min.avg ? h : min);

        if (peakHour.avg > lowHour.avg * 2) {
            patterns.push({
                type: 'daily_cycle',
                description: `Peak usage at ${peakHour.hour}:00 (${(peakHour.avg / lowHour.avg).toFixed(1)}x higher than low at ${lowHour.hour}:00)`,
                peak_hour: peakHour.hour,
                low_hour: lowHour.hour,
                ratio: peakHour.avg / lowHour.avg
            });
        }

        // Weekly pattern detection
        const byDay = {};
        data.forEach(d => {
            const day = new Date(d.timestamp).getDay();
            byDay[day] = byDay[day] || [];
            byDay[day].push(d.value);
        });

        const dailyAverages = Object.entries(byDay).map(([day, values]) => ({
            day: parseInt(day),
            dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][parseInt(day)],
            avg: values.reduce((a, b) => a + b, 0) / values.length
        }));

        const weekdayAvg = dailyAverages.filter(d => d.day >= 1 && d.day <= 5)
            .reduce((sum, d) => sum + d.avg, 0) / 5;
        const weekendAvg = dailyAverages.filter(d => d.day === 0 || d.day === 6)
            .reduce((sum, d) => sum + d.avg, 0) / 2;

        if (Math.abs(weekdayAvg - weekendAvg) / weekdayAvg > 0.3) {
            patterns.push({
                type: 'weekly_cycle',
                description: weekdayAvg > weekendAvg
                    ? `Weekday spending ${((weekdayAvg / weekendAvg - 1) * 100).toFixed(0)}% higher than weekends`
                    : `Weekend spending ${((weekendAvg / weekdayAvg - 1) * 100).toFixed(0)}% higher than weekdays`,
                weekday_avg: weekdayAvg,
                weekend_avg: weekendAvg
            });
        }

        // Growth trend detection
        const firstHalf = data.slice(0, Math.floor(data.length / 2));
        const secondHalf = data.slice(Math.floor(data.length / 2));

        const firstAvg = firstHalf.reduce((sum, d) => sum + d.value, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, d) => sum + d.value, 0) / secondHalf.length;

        const growthRate = (secondAvg - firstAvg) / firstAvg;
        if (Math.abs(growthRate) > 0.1) {
            patterns.push({
                type: 'trend',
                description: growthRate > 0
                    ? `Spending trending up ${(growthRate * 100).toFixed(1)}% over period`
                    : `Spending trending down ${(Math.abs(growthRate) * 100).toFixed(1)}% over period`,
                growth_rate: growthRate,
                direction: growthRate > 0 ? 'increasing' : 'decreasing'
            });
        }

        return patterns;
    }

    /**
     * Main execution method
     */
    async execute(task, parameters = {}) {
        // Fetch cost data
        const { data: costData } = await supabase
            .from('cost_records')
            .select('*')
            .eq('organization_id', this.organizationId)
            .gte('timestamp', new Date(Date.now() - (parameters.lookback_days || 30) * 24 * 60 * 60 * 1000).toISOString())
            .order('timestamp', { ascending: true });

        if (!costData || costData.length === 0) {
            return {
                success: false,
                error: 'No cost data available for analysis'
            };
        }

        // Transform for analysis
        const timeSeriesData = costData.map(c => ({
            timestamp: c.timestamp,
            value: parseFloat(c.amount),
            provider: c.provider,
            model: c.model,
            project: c.project
        }));

        // Run analysis based on task
        let result;

        switch (task) {
            case 'detect_anomalies':
                const anomalies = this.detectAnomalies(timeSeriesData, parameters.method || 'ensemble');
                const patterns = this.detectPatterns(timeSeriesData);

                // Use Claude for interpretation
                const interpretation = await resilientAnthropic.messages.create({
                    model: AGENT_CONFIG.model,
                    max_tokens: 1024,
                    system: SYSTEM_PROMPT,
                    messages: [{
                        role: 'user',
                        content: `Analyze these anomalies and patterns found in cost data:

Anomalies: ${JSON.stringify(anomalies, null, 2)}

Patterns: ${JSON.stringify(patterns, null, 2)}

Total spend in period: $${timeSeriesData.reduce((sum, d) => sum + d.value, 0).toFixed(2)}

Provide a concise summary with:
1. Key findings (most important anomalies)
2. Root cause hypotheses
3. Recommended actions`
                    }]
                });

                // W-010: Persist detected anomalies to database
                let persistResult = { persisted: 0, deduplicated: 0, errors: 0, anomalyIds: [] };
                if (anomalies.length > 0) {
                    try {
                        persistResult = await this.anomalyPersistence.persistAnomalies(
                            anomalies,
                            this.organizationId,
                            AGENT_CONFIG.id,
                            { interpretation: interpretation.content[0].text }
                        );
                    } catch (persistErr) {
                        console.error('[CostIntelligence] Anomaly persistence failed:', persistErr.message);
                    }
                }

                result = {
                    success: true,
                    anomalies,
                    patterns,
                    total_analyzed: timeSeriesData.length,
                    anomaly_count: anomalies.length,
                    interpretation: interpretation.content[0].text,
                    persistence: persistResult
                };
                break;

            case 'learn_patterns':
                const learnedPatterns = this.detectPatterns(timeSeriesData);

                // Store learned patterns
                for (const pattern of learnedPatterns) {
                    await resilientSupabase.from('learned_patterns').upsert({
                        organization_id: this.organizationId,
                        pattern_type: pattern.type === 'trend' ? 'spending_trend' : 'seasonal_pattern',
                        pattern_name: pattern.type,
                        pattern_definition: pattern,
                        confidence: 0.7,
                        last_observed: new Date().toISOString()
                    }, {
                        onConflict: 'organization_id,pattern_name'
                    });
                }

                result = {
                    success: true,
                    patterns_learned: learnedPatterns.length,
                    patterns: learnedPatterns
                };
                break;

            case 'analyze_drivers':
                // Group by different dimensions to find cost drivers
                const byProvider = {};
                const byModel = {};
                const byProject = {};

                timeSeriesData.forEach(d => {
                    byProvider[d.provider] = (byProvider[d.provider] || 0) + d.value;
                    byModel[d.model] = (byModel[d.model] || 0) + d.value;
                    if (d.project) {
                        byProject[d.project] = (byProject[d.project] || 0) + d.value;
                    }
                });

                const total = timeSeriesData.reduce((sum, d) => sum + d.value, 0);

                result = {
                    success: true,
                    total_spend: total,
                    by_provider: Object.entries(byProvider)
                        .map(([name, value]) => ({ name, value, percentage: (value / total * 100).toFixed(1) }))
                        .sort((a, b) => b.value - a.value),
                    by_model: Object.entries(byModel)
                        .map(([name, value]) => ({ name, value, percentage: (value / total * 100).toFixed(1) }))
                        .sort((a, b) => b.value - a.value),
                    by_project: Object.entries(byProject)
                        .map(([name, value]) => ({ name, value, percentage: (value / total * 100).toFixed(1) }))
                        .sort((a, b) => b.value - a.value)
                };
                break;

            default:
                result = { success: false, error: `Unknown task: ${task}` };
        }

        // Update metrics
        await resilientSupabase.rpc('update_agent_metrics', {
            p_agent_id: AGENT_CONFIG.id,
            p_messages: 1,
            p_anomalies: result.anomaly_count || 0
        });

        return result;
    }
}

export default CostIntelligenceAgent;
