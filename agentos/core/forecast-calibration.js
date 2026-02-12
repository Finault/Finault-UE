/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * W-008: FORECAST CALIBRATION SYSTEM
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Fixes massive confidence inflation from R²+0.3 heuristic.
 * Uses Platt scaling to calibrate raw R² → true probability via historical accuracy.
 *
 * Key features:
 * - Multi-factor raw confidence (R², dataPoints, variance, trendStability)
 * - Platt scaling with logistic function trained on backtests
 * - Bootstrap prediction intervals
 * - Data sufficiency checks (min 14 days, min 10 backtests for calibration)
 * - Confidence bounds [0.05, 0.95]
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─── Constants ───────────────────────────────────────────────────────────────

export const CALIBRATION_CONFIG = {
    minDataPointsForConfidence: 14,      // 2 weeks minimum data
    minBacktestForCalibration: 10,       // Need 10+ verified forecasts to train sigmoid
    bootstrapSamples: 1000,              // Default resamples for prediction intervals
    confidenceFloor: 0.05,               // Never show below 5%
    confidenceCeiling: 0.95,             // Never show above 95%
    plattScalingLearningRate: 0.01,      // Gradient descent step size
    plattScalingIterations: 100,         // Max optimization iterations
    accuracyThreshold: 0.15,             // Within 15% = accurate (for Platt targets)
    weights: {
        rSquared: 0.5,
        dataPoints: 0.2,
        variance: 0.15,
        trendStability: 0.15
    },
    dataPointsCap: 60                    // Cap data points contribution at 60 days
};

// ─── ForecastCalibrator Class ────────────────────────────────────────────────

export class ForecastCalibrator {

    /**
     * Compute raw confidence from multiple factors.
     *
     * Replaces forecasting-agent.js line 289:
     *   OLD: Math.min(0.9, linear.rSquared + 0.3)
     *   NEW: Multi-factor weighted average
     *
     * Formula:
     *   rSquaredScore   = clamp(R², 0, 1)
     *   dataPointsScore = min(1, dataPoints / 60)
     *   varianceScore   = 1 - min(1, variance)    (lower variance = higher confidence)
     *   trendScore      = clamp(trendStability, 0, 1)
     *   raw = 0.5*rSq + 0.2*dp + 0.15*var + 0.15*trend
     *
     * @param {number} rSquared - Linear regression R² (0-1)
     * @param {number} dataPoints - Number of data points used
     * @param {number} variance - Standard deviation of residuals (RMSE normalized)
     * @param {number} trendStability - How stable is trend direction (0-1)
     * @returns {number} - Raw confidence score before calibration (0-1)
     */
    rawConfidence(rSquared, dataPoints, variance, trendStability) {
        const w = CALIBRATION_CONFIG.weights;
        const cap = CALIBRATION_CONFIG.dataPointsCap;

        const rSqScore = Math.max(0, Math.min(1, rSquared || 0));
        const dpScore = Math.min(1, Math.max(0, (dataPoints || 0) / cap));
        const varScore = 1 - Math.min(1, Math.max(0, variance || 0));
        const trendScore = Math.max(0, Math.min(1, trendStability || 0));

        const raw = w.rSquared * rSqScore +
                    w.dataPoints * dpScore +
                    w.variance * varScore +
                    w.trendStability * trendScore;

        // Clamp to [floor, ceiling]
        return Math.max(
            CALIBRATION_CONFIG.confidenceFloor,
            Math.min(CALIBRATION_CONFIG.confidenceCeiling, raw)
        );
    }

    /**
     * Apply Platt scaling to raw confidence using historical backtest data.
     *
     * If insufficient backtest history, returns raw score with insufficientData=true.
     * Otherwise, trains a sigmoid and maps raw → calibrated.
     *
     * Sigmoid: calibrated = 1 / (1 + exp(-(A * rawScore + B)))
     *
     * @param {number} rawScore - Output from rawConfidence()
     * @param {Array} backtestHistory - Array of { predicted, actual } pairs
     * @returns {Object} { calibratedConfidence, insufficientData, reason }
     */
    calibrate(rawScore, backtestHistory) {
        if (!backtestHistory || backtestHistory.length < CALIBRATION_CONFIG.minBacktestForCalibration) {
            return {
                calibratedConfidence: rawScore,
                insufficientData: true,
                reason: `Fewer than ${CALIBRATION_CONFIG.minBacktestForCalibration} verified forecasts; using raw score`
            };
        }

        // Train sigmoid parameters
        const curve = this.getCalibrationCurve(backtestHistory);

        // Apply sigmoid: 1 / (1 + exp(-(A * rawScore + B)))
        const exponent = -(curve.A * rawScore + curve.B);
        const calibrated = 1 / (1 + Math.exp(Math.max(-500, Math.min(500, exponent))));

        // Clamp to bounds
        const clamped = Math.max(
            CALIBRATION_CONFIG.confidenceFloor,
            Math.min(CALIBRATION_CONFIG.confidenceCeiling, calibrated)
        );

        return {
            calibratedConfidence: clamped,
            insufficientData: false,
            reason: `Calibrated via Platt scaling with ${backtestHistory.length} backtests`
        };
    }

    /**
     * Train logistic sigmoid function on backtest history.
     *
     * Algorithm (simplified Platt scaling):
     * 1. Convert each backtest to binary target: error < 15% → 1, else → 0
     * 2. Use raw confidence as the feature (mapped from error_pct inversely)
     * 3. Gradient descent to optimize sigmoid A, B parameters
     *
     * @param {Array} backtestHistory - Array of { predicted, actual }
     * @returns {Object} { A, B, convergence, numIterations }
     */
    getCalibrationCurve(backtestHistory) {
        if (!backtestHistory || backtestHistory.length === 0) {
            return { A: 1, B: 0, convergence: 0, numIterations: 0 };
        }

        const threshold = CALIBRATION_CONFIG.accuracyThreshold;
        const lr = CALIBRATION_CONFIG.plattScalingLearningRate;
        const maxIter = CALIBRATION_CONFIG.plattScalingIterations;

        // Convert to training data: features (raw score proxy) and binary targets
        const trainingData = backtestHistory.map(bt => {
            const predicted = bt.predicted || 0;
            const actual = bt.actual || 0;
            const error = actual !== 0
                ? Math.abs(actual - predicted) / Math.abs(actual)
                : (predicted !== 0 ? 1 : 0);

            // Target: 1 if accurate, 0 if not
            const target = error < threshold ? 1 : 0;

            // Feature: inverse error as proxy for confidence (0-1 range)
            const feature = Math.max(0, Math.min(1, 1 - error));

            return { feature, target };
        });

        // Initialize parameters
        let A = 1.0;
        let B = 0.0;
        let prevLoss = Infinity;
        let iterations = 0;

        // Gradient descent
        for (let iter = 0; iter < maxIter; iter++) {
            let gradA = 0;
            let gradB = 0;
            let loss = 0;

            for (const { feature, target } of trainingData) {
                const z = A * feature + B;
                const sigmoid = 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, z))));

                // Cross-entropy loss gradient
                const diff = sigmoid - target;
                gradA += diff * feature;
                gradB += diff;

                // Cross-entropy loss
                const clampedSig = Math.max(1e-10, Math.min(1 - 1e-10, sigmoid));
                loss += -(target * Math.log(clampedSig) + (1 - target) * Math.log(1 - clampedSig));
            }

            // Normalize gradients
            const n = trainingData.length;
            gradA /= n;
            gradB /= n;
            loss /= n;

            // Update parameters
            A -= lr * gradA;
            B -= lr * gradB;

            iterations = iter + 1;

            // Check convergence
            if (Math.abs(prevLoss - loss) < 1e-6) {
                break;
            }
            prevLoss = loss;
        }

        return {
            A,
            B,
            convergence: prevLoss,
            numIterations: iterations
        };
    }

    /**
     * Generate prediction intervals via bootstrap resampling.
     *
     * Resamples data with replacement, runs linear regression on each sample,
     * and collects predictions to compute percentile-based intervals.
     *
     * @param {Array} data - Array of { value } for time series (ordered)
     * @param {number} [percentile=95] - Confidence interval width (e.g., 95 for 95% CI)
     * @param {number} [nSamples] - Number of bootstrap samples (default from config)
     * @returns {Object} { lower, upper, median, interval }
     */
    bootstrapInterval(data, percentile = 95, nSamples = null) {
        const samples = nSamples || CALIBRATION_CONFIG.bootstrapSamples;

        if (!data || data.length < 3) {
            return { lower: 0, upper: 0, median: 0, interval: [0, 0] };
        }

        const values = data.map(d => (typeof d === 'number' ? d : d.value || 0));
        const predictions = [];

        // Simple seeded pseudo-random for reproducibility within a single call
        let seed = values.reduce((a, b) => a + b, 0) * 1000 + values.length;
        const rand = () => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            return seed / 0x7fffffff;
        };

        for (let s = 0; s < samples; s++) {
            // Resample with replacement
            const resampled = [];
            for (let i = 0; i < values.length; i++) {
                const idx = Math.floor(rand() * values.length);
                resampled.push({ day: i, value: values[idx] });
            }

            // Quick linear regression on resampled data
            const lr = this._quickLinearRegression(resampled);

            // Predict next period (next 30 days)
            let periodPrediction = 0;
            for (let d = 0; d < 30; d++) {
                periodPrediction += lr.slope * (values.length + d) + lr.intercept;
            }
            predictions.push(periodPrediction);
        }

        // Sort predictions for percentile calculation
        predictions.sort((a, b) => a - b);

        const lowerIdx = Math.floor(predictions.length * (1 - percentile / 100) / 2);
        const upperIdx = Math.floor(predictions.length * (1 - (1 - percentile / 100) / 2));
        const medianIdx = Math.floor(predictions.length * 0.5);

        return {
            lower: predictions[Math.max(0, lowerIdx)],
            upper: predictions[Math.min(predictions.length - 1, upperIdx)],
            median: predictions[Math.min(predictions.length - 1, medianIdx)],
            interval: [
                predictions[Math.max(0, lowerIdx)],
                predictions[Math.min(predictions.length - 1, upperIdx)]
            ]
        };
    }

    /**
     * Assess whether we have sufficient data for confident forecasting.
     *
     * @param {number} dataPoints - Number of historical data points
     * @param {number} [backtestCount=0] - Number of verified forecasts
     * @returns {Object} { sufficient, reason, minRequired, confidenceMode }
     */
    assessDataSufficiency(dataPoints, backtestCount = 0) {
        const minDP = CALIBRATION_CONFIG.minDataPointsForConfidence;
        const minBT = CALIBRATION_CONFIG.minBacktestForCalibration;

        if (dataPoints < minDP) {
            return {
                sufficient: false,
                reason: `Need at least ${minDP} days of historical data (have ${dataPoints})`,
                minRequired: minDP,
                confidenceMode: 'insufficient'
            };
        }

        if (backtestCount < minBT) {
            return {
                sufficient: true,
                reason: `Can forecast but confidence uses raw score (need ${minBT} backtests for calibration, have ${backtestCount})`,
                minRequired: minBT - backtestCount,
                confidenceMode: 'raw'
            };
        }

        return {
            sufficient: true,
            reason: 'Full calibration available',
            minRequired: 0,
            confidenceMode: 'calibrated'
        };
    }

    // ─── Private Helpers ─────────────────────────────────────────────────────

    _quickLinearRegression(data) {
        const n = data.length;
        if (n === 0) return { slope: 0, intercept: 0 };

        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        data.forEach(d => {
            sumX += d.day;
            sumY += d.value;
            sumXY += d.day * d.value;
            sumXX += d.day * d.day;
        });

        const denom = n * sumXX - sumX * sumX;
        if (denom === 0) return { slope: 0, intercept: sumY / n };

        const slope = (n * sumXY - sumX * sumY) / denom;
        const intercept = (sumY - slope * sumX) / n;

        return { slope, intercept };
    }
}

// ─── Factory Function ────────────────────────────────────────────────────────

export function createForecastCalibrator() {
    return new ForecastCalibrator();
}
