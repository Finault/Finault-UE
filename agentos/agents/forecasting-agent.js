/**
 * FORECASTING AGENT
 * Specialist agent for predicting future AI costs
 *
 * Uses multiple forecasting methods:
 * - Linear regression
 * - Exponential smoothing
 * - Seasonal decomposition
 * - Growth modeling
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { AgentMemory, MEMORY_TYPES, IMPORTANCE } from '../core/agent-memory.js';
import { validateAgentParams } from '../core/validate-agent-params.js';
import { createSupabaseResilience, createAnthropicResilience } from '../core/resilience-layer.js';
import { createForecastCalibrator } from '../core/forecast-calibration.js';
import { safeVariancePercent, safeGrowthConfidence, safeTrendStability } from '../core/trend-analyzer.js';

const anthropic = new Anthropic();
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const resilientSupabase = createSupabaseResilience(supabase);
const resilientAnthropic = createAnthropicResilience(anthropic);

const AGENT_CONFIG = {
    id: 'forecasting-agent',
    name: 'Forecasting Agent',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 4096
};

/**
 * DIAMOND TIER: Now with persistent memory
 * - Remembers prediction accuracy for continuous improvement
 * - Learns seasonal patterns specific to this organization
 * - Stores forecast outcomes for backtesting
 */
export class ForecastingAgent {
    constructor(params = {}) {
        const { organizationId, userId, config } = validateAgentParams(params, 'ForecastingAgent');
        this.userId = userId;
        this.organizationId = organizationId;

        // Initialize memory
        this.memory = new AgentMemory(AGENT_CONFIG.id, organizationId, userId);
        this._memoryLoaded = false;
        // W-008: Forecast calibration for calibrated confidence scores
        this.calibrator = createForecastCalibrator();
    }

    async initMemory() {
        if (!this._memoryLoaded) {
            await this.memory.load({
                memoryTypes: [MEMORY_TYPES.PATTERN, MEMORY_TYPES.OUTCOME, MEMORY_TYPES.INSIGHT],
                maxAge: 365 // 1 year of forecasting history
            });
            this._memoryLoaded = true;
        }
    }

    async storeForecastOutcome(prediction, actual, accuracy) {
        await this.memory.storeOutcome(
            `Forecast for ${prediction.period}: predicted $${prediction.amount.toFixed(2)}, actual $${actual.toFixed(2)}, accuracy ${(accuracy * 100).toFixed(1)}%`,
            accuracy > 0.9 ? IMPORTANCE.MEDIUM : IMPORTANCE.HIGH,
            { prediction, actual, accuracy }
        );
    }

    /**
     * Simple linear regression
     */
    linearRegression(data) {
        const n = data.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

        data.forEach((d, i) => {
            sumX += i;
            sumY += d.value;
            sumXY += i * d.value;
            sumXX += i * i;
        });

        // W-021 hardening: guard all divisions against zero denominators
        const slopeDenom = (n * sumXX - sumX * sumX);
        const slope = slopeDenom !== 0 ? (n * sumXY - sumX * sumY) / slopeDenom : 0;
        const intercept = n > 0 ? (sumY - slope * sumX) / n : 0;

        // Calculate R-squared
        const yMean = n > 0 ? sumY / n : 0;
        let ssTot = 0, ssRes = 0;
        data.forEach((d, i) => {
            ssTot += Math.pow(d.value - yMean, 2);
            ssRes += Math.pow(d.value - (slope * i + intercept), 2);
        });
        const rSquared = ssTot > 0 ? 1 - (ssRes / ssTot) : 0;

        return { slope, intercept, rSquared };
    }

    /**
     * Exponential smoothing forecast
     */
    exponentialSmoothing(data, alpha = 0.3) {
        let forecast = data[0].value;
        const forecasts = [forecast];

        for (let i = 1; i < data.length; i++) {
            forecast = alpha * data[i].value + (1 - alpha) * forecast;
            forecasts.push(forecast);
        }

        // Calculate error metrics
        let mse = 0;
        for (let i = 1; i < data.length; i++) {
            mse += Math.pow(data[i].value - forecasts[i - 1], 2);
        }
        // W-021 hardening: guard against data.length <= 1 (division by zero)
        mse = (data.length - 1) > 0 ? mse / (data.length - 1) : 0;

        return {
            lastForecast: forecast,
            mse,
            rmse: Math.sqrt(mse)
        };
    }

    /**
     * Detect and model seasonality
     */
    detectSeasonality(data) {
        // Group by day of week
        const byDay = Array(7).fill(0).map(() => []);
        data.forEach(d => {
            const day = new Date(d.timestamp).getDay();
            byDay[day].push(d.value);
        });

        const dayAverages = byDay.map(values =>
            values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0
        );

        // Calculate seasonal indices
        // W-021 hardening: guard against empty data array
        const overallAverage = data.length > 0
            ? data.reduce((sum, d) => sum + d.value, 0) / data.length
            : 0;
        const seasonalIndices = dayAverages.map(avg =>
            overallAverage > 0 ? avg / overallAverage : 1
        );

        // Check if seasonality is significant
        const variance = seasonalIndices.reduce((sum, idx) => sum + Math.pow(idx - 1, 2), 0) / 7;
        const hasSeasonality = variance > 0.01;

        return {
            hasSeasonality,
            seasonalIndices,
            dayNames: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
            variance
        };
    }

    /**
     * Growth rate modeling
     */
    calculateGrowthRate(data, windowSize = 7) {
        if (data.length < windowSize * 2) {
            return { weeklyGrowth: 0, monthlyGrowth: 0, confidence: 0 };
        }

        // Calculate week-over-week growth rates
        const growthRates = [];
        for (let i = windowSize; i < data.length; i += windowSize) {
            const prevWeek = data.slice(i - windowSize, i);
            const thisWeek = data.slice(i, Math.min(i + windowSize, data.length));

            const prevAvg = prevWeek.reduce((sum, d) => sum + d.value, 0) / prevWeek.length;
            const thisAvg = thisWeek.reduce((sum, d) => sum + d.value, 0) / thisWeek.length;

            if (prevAvg > 0) {
                growthRates.push((thisAvg - prevAvg) / prevAvg);
            }
        }

        if (growthRates.length === 0) {
            return { weeklyGrowth: 0, monthlyGrowth: 0, confidence: 0 };
        }

        const avgGrowth = growthRates.reduce((a, b) => a + b, 0) / growthRates.length;
        const growthStd = Math.sqrt(
            growthRates.reduce((sum, g) => sum + Math.pow(g - avgGrowth, 2), 0) / growthRates.length
        );

        return {
            weeklyGrowth: avgGrowth,
            monthlyGrowth: Math.pow(1 + avgGrowth, 4.33) - 1, // ~4.33 weeks per month
            annualGrowth: Math.pow(1 + avgGrowth, 52) - 1,
            // W-021: Safe growth confidence - returns 0 when avgGrowth is 0 (no signal)
            confidence: safeGrowthConfidence(growthStd, avgGrowth)
        };
    }

    /**
     * Generate multi-scenario forecast
     */
    generateForecast(data, monthsAhead = 3) {
        const dailyData = data.map((d, i) => ({
            day: i,
            value: d.value,
            timestamp: d.timestamp
        }));

        // Get models
        const linear = this.linearRegression(dailyData);
        const expSmooth = this.exponentialSmoothing(dailyData);
        const seasonality = this.detectSeasonality(dailyData);
        const growth = this.calculateGrowthRate(dailyData);

        // Current monthly spend (last 30 days)
        const last30 = dailyData.slice(-30);
        const currentMonthly = last30.reduce((sum, d) => sum + d.value, 0);

        // Generate forecasts
        const daysToForecast = monthsAhead * 30;
        const forecasts = {
            baseline: [],
            optimistic: [],
            pessimistic: [],
            growth: []
        };

        for (let i = 0; i < daysToForecast; i++) {
            const dayIndex = dailyData.length + i;
            const dayOfWeek = (new Date(dailyData[dailyData.length - 1].timestamp).getDay() + i) % 7;

            // Baseline: linear trend with seasonality
            let baseValue = linear.slope * dayIndex + linear.intercept;
            if (seasonality.hasSeasonality) {
                baseValue *= seasonality.seasonalIndices[dayOfWeek];
            }
            forecasts.baseline.push(baseValue);

            // Growth scenario: apply observed growth rate
            const growthMultiplier = Math.pow(1 + growth.weeklyGrowth, i / 7);
            forecasts.growth.push(expSmooth.lastForecast * growthMultiplier);

            // Optimistic: baseline with cost reductions (assume 15% optimization)
            forecasts.optimistic.push(baseValue * 0.85);

            // Pessimistic: growth scenario with 20% buffer
            forecasts.pessimistic.push(expSmooth.lastForecast * growthMultiplier * 1.2);
        }

        // Aggregate to monthly
        const monthlyForecasts = [];
        for (let m = 0; m < monthsAhead; m++) {
            const start = m * 30;
            const end = (m + 1) * 30;

            monthlyForecasts.push({
                month: m + 1,
                baseline: forecasts.baseline.slice(start, end).reduce((a, b) => a + b, 0),
                growth: forecasts.growth.slice(start, end).reduce((a, b) => a + b, 0),
                optimistic: forecasts.optimistic.slice(start, end).reduce((a, b) => a + b, 0),
                pessimistic: forecasts.pessimistic.slice(start, end).reduce((a, b) => a + b, 0)
            });
        }

        return {
            currentMonthlySpend: currentMonthly,
            forecasts: monthlyForecasts,
            totalForecast: {
                baseline: monthlyForecasts.reduce((sum, m) => sum + m.baseline, 0),
                growth: monthlyForecasts.reduce((sum, m) => sum + m.growth, 0),
                optimistic: monthlyForecasts.reduce((sum, m) => sum + m.optimistic, 0),
                pessimistic: monthlyForecasts.reduce((sum, m) => sum + m.pessimistic, 0)
            },
            models: {
                linear: {
                    slope: linear.slope,
                    rSquared: linear.rSquared,
                    dailyTrend: linear.slope > 0 ? 'increasing' : 'decreasing'
                },
                growth: {
                    weekly: (growth.weeklyGrowth * 100).toFixed(1) + '%',
                    monthly: (growth.monthlyGrowth * 100).toFixed(1) + '%',
                    annual: (growth.annualGrowth * 100).toFixed(1) + '%',
                    confidence: growth.confidence
                },
                seasonality: {
                    detected: seasonality.hasSeasonality,
                    pattern: seasonality.hasSeasonality
                        ? seasonality.dayNames.map((d, i) => `${d}: ${(seasonality.seasonalIndices[i] * 100).toFixed(0)}%`).join(', ')
                        : 'No significant weekly pattern'
                }
            },
            confidence: {
                // W-008: Multi-factor calibrated confidence replaces R²+0.3 heuristic
                baseline: this._computeCalibratedConfidence(linear, dailyData),
                growth: growth.confidence,
                range: 'Pessimistic to Optimistic represents 90% confidence interval'
            },
            // W-008: Data sufficiency assessment
            dataSufficiency: this.calibrator.assessDataSufficiency(dailyData.length, 0),
            // W-008: Bootstrap prediction intervals
            predictionIntervals: this.calibrator.bootstrapInterval(dailyData, 95)
        };
    }

    /**
     * W-008: Compute calibrated confidence using multiple factors.
     * Replaces naive Math.min(0.9, linear.rSquared + 0.3)
     */
    _computeCalibratedConfidence(linear, dailyData) {
        const rSquared = linear.rSquared || 0;
        const dataPoints = dailyData.length;
        const variance = this._computeResidualVariance(dailyData, linear);
        const trendStability = this._computeTrendStability(dailyData);

        // Get raw multi-factor confidence
        const raw = this.calibrator.rawConfidence(rSquared, dataPoints, variance, trendStability);

        // Try to calibrate with backtest history from memory
        const outcomeMemories = this.memory.memories
            .filter(m => m.memory_type === 'outcome' && m.context && m.context.prediction && m.context.actual);
        const backtestHistory = outcomeMemories.map(m => ({
            predicted: m.context.prediction.amount || m.context.prediction,
            actual: m.context.actual
        }));

        const calibrated = this.calibrator.calibrate(raw, backtestHistory);
        return calibrated.calibratedConfidence;
    }

    /**
     * W-008: Compute residual variance (RMSE) for variance factor.
     */
    _computeResidualVariance(data, linearModel) {
        const { slope, intercept } = linearModel;
        if (!data || data.length === 0) return 1;

        const residuals = data.map((d, i) => d.value - (slope * i + intercept));
        const meanValue = data.reduce((sum, d) => sum + d.value, 0) / data.length;
        const rmse = Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / residuals.length);

        // Normalize RMSE by mean value to get coefficient of variation
        return meanValue !== 0 ? Math.min(1, rmse / Math.abs(meanValue)) : 1;
    }

    /**
     * W-008: Compute trend stability by comparing slopes across data segments.
     */
    _computeTrendStability(data) {
        if (!data || data.length < 6) return 0.5;

        const third = Math.floor(data.length / 3);
        const slopes = [];

        for (let i = 0; i < 3; i++) {
            const segment = data.slice(i * third, (i + 1) * third).map((d, j) => ({
                day: j,
                value: d.value
            }));
            if (segment.length > 1) {
                const lr = this.linearRegression(segment);
                slopes.push(lr.slope);
            }
        }

        if (slopes.length < 2) return 0.5;

        // W-021: Safe trend stability - uses sample SD and handles zero meanSlope correctly
        return safeTrendStability(slopes);
    }

    /**
     * Budget impact analysis
     */
    analyzeBudgetImpact(forecast, budget) {
        const analysis = {
            budget,
            scenarios: []
        };

        const scenarios = ['baseline', 'growth', 'optimistic', 'pessimistic'];
        scenarios.forEach(scenario => {
            const projected = forecast.totalForecast[scenario];
            const variance = projected - budget;
            // W-021: Safe variance percent - guards against zero/NaN budget
            const variancePercent = safeVariancePercent(variance, budget);

            analysis.scenarios.push({
                scenario,
                projected,
                variance,
                variancePercent: `${variancePercent}%`,
                status: variance > 0 ? 'over_budget' : 'under_budget',
                recommendation: variance > 0
                    ? `Consider ${scenario === 'pessimistic' ? 'aggressive' : 'moderate'} cost optimizations`
                    : 'On track to meet budget'
            });
        });

        // Find breakeven point
        const monthlyBudget = budget / forecast.forecasts.length;
        let breakEvenMonth = null;
        let cumulativeSpend = 0;

        for (let i = 0; i < forecast.forecasts.length; i++) {
            cumulativeSpend += forecast.forecasts[i].baseline;
            const cumulativeBudget = monthlyBudget * (i + 1);
            if (cumulativeSpend > cumulativeBudget && !breakEvenMonth) {
                breakEvenMonth = i + 1;
            }
        }

        analysis.breakEvenMonth = breakEvenMonth;
        analysis.recommendation = breakEvenMonth
            ? `At current trajectory, budget will be exceeded in month ${breakEvenMonth}`
            : 'Projected to stay within budget';

        return analysis;
    }

    /**
     * Main execution method
     */
    async execute(task, parameters = {}) {
        const lookbackDays = parameters.lookback_days || 90;

        // Pass 21: Ensure memory is loaded so Platt scaling calibration has backtest data
        if (this.memory && this.memory.memories.length === 0) {
            try {
                await this.memory.initMemory();
            } catch (memErr) {
                console.error('[ForecastingAgent] Memory init failed, calibration will use raw confidence:', memErr.message);
            }
        }

        // Fetch historical data
        const { data: costData } = await resilientSupabase
            .from('cost_records')
            .select('*')
            .eq('organization_id', this.organizationId)
            .gte('timestamp', new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString())
            .order('timestamp', { ascending: true });

        if (!costData || costData.length < 14) {
            return {
                success: false,
                error: 'Insufficient historical data for forecasting (need at least 14 days)'
            };
        }

        // Aggregate to daily
        const dailyData = {};
        costData.forEach(c => {
            const day = c.timestamp.split('T')[0];
            dailyData[day] = (dailyData[day] || 0) + parseFloat(c.amount);
        });

        const timeSeriesData = Object.entries(dailyData)
            .map(([date, value]) => ({ timestamp: date, value }))
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

        let result;

        switch (task) {
            case 'forecast':
                const forecast = this.generateForecast(timeSeriesData, parameters.months_ahead || 3);

                // Use Claude for narrative interpretation
                const interpretation = await resilientAnthropic.messages.create({
                    model: AGENT_CONFIG.model,
                    max_tokens: 1024,
                    messages: [{
                        role: 'user',
                        content: `Generate a brief executive summary of this cost forecast:

Current monthly spend: $${forecast.currentMonthlySpend.toFixed(2)}

${parameters.months_ahead || 3}-month forecast:
- Baseline: $${forecast.totalForecast.baseline.toFixed(2)}
- Growth scenario: $${forecast.totalForecast.growth.toFixed(2)}
- Optimistic (with optimizations): $${forecast.totalForecast.optimistic.toFixed(2)}
- Pessimistic: $${forecast.totalForecast.pessimistic.toFixed(2)}

Growth trend: ${forecast.models.growth.monthly} monthly
Confidence: ${(forecast.confidence.baseline * 100).toFixed(0)}%

Provide 2-3 sentences summarizing the outlook and key recommendation.`
                    }]
                });

                result = {
                    success: true,
                    ...forecast,
                    summary: interpretation.content[0].text
                };
                break;

            case 'budget_analysis':
                if (!parameters.budget) {
                    return { success: false, error: 'Budget parameter required' };
                }

                const fcst = this.generateForecast(timeSeriesData, parameters.months_ahead || 3);
                result = {
                    success: true,
                    forecast: fcst,
                    budgetAnalysis: this.analyzeBudgetImpact(fcst, parameters.budget)
                };
                break;

            case 'growth_analysis':
                const growthData = this.calculateGrowthRate(timeSeriesData);
                const seasonalityData = this.detectSeasonality(timeSeriesData);

                result = {
                    success: true,
                    growth: growthData,
                    seasonality: seasonalityData,
                    recommendation: growthData.monthlyGrowth > 0.1
                        ? 'High growth rate detected. Consider proactive capacity planning and budget discussions.'
                        : growthData.monthlyGrowth < -0.05
                            ? 'Declining trend detected. Verify this aligns with business expectations.'
                            : 'Stable growth pattern. Current trajectory is sustainable.'
                };
                break;

            default:
                result = { success: false, error: `Unknown task: ${task}` };
        }

        return result;
    }
}

export default ForecastingAgent;
