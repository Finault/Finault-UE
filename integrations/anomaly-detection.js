/**
 * Finault Anomaly Detection System
 * PhD-level statistical engine for detecting anomalies in cost, usage, and billing data
 *
 * Implements: Z-score, IQR, EWMA, CUSUM, ML-based pattern learning, seasonality detection
 * Provides explainability, user feedback loop, and persistent baselines
 */

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

class MathUtils {
  static mean(values) {
    if (!values || values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  static median(values) {
    if (!values || values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  static stdDev(values) {
    if (!values || values.length < 2) return 0;
    const avg = this.mean(values);
    const squareDiffs = values.map(val => Math.pow(val - avg, 2));
    return Math.sqrt(this.mean(squareDiffs));
  }

  static variance(values) {
    if (!values || values.length < 2) return 0;
    const avg = this.mean(values);
    const squareDiffs = values.map(val => Math.pow(val - avg, 2));
    return squareDiffs.reduce((a, b) => a + b, 0) / (values.length - 1);
  }

  static percentile(values, p) {
    if (!values || values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = p / 100 * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;

    if (lower === upper) return sorted[lower];
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  static q1(values) {
    return this.percentile(values, 25);
  }

  static q3(values) {
    return this.percentile(values, 75);
  }

  static iqr(values) {
    return this.q3(values) - this.q1(values);
  }

  static autocorrelation(values, lag) {
    if (values.length <= lag) return 0;
    const mean = this.mean(values);
    let numerator = 0;
    let denominator = 0;

    for (let i = lag; i < values.length; i++) {
      numerator += (values[i] - mean) * (values[i - lag] - mean);
    }

    for (let i = 0; i < values.length; i++) {
      denominator += Math.pow(values[i] - mean, 2);
    }

    return denominator === 0 ? 0 : numerator / denominator;
  }

  static movingAverage(values, window) {
    if (!values || values.length === 0) return [];
    const result = [];
    for (let i = 0; i < values.length; i++) {
      const start = Math.max(0, i - window + 1);
      const subset = values.slice(start, i + 1);
      result.push(this.mean(subset));
    }
    return result;
  }

  static exponentialWeightedMovingAverage(values, span) {
    if (!values || values.length === 0) return [];
    const alpha = 2 / (span + 1);
    const result = [values[0]];

    for (let i = 1; i < values.length; i++) {
      result.push(alpha * values[i] + (1 - alpha) * result[i - 1]);
    }
    return result;
  }

  static norm(x, mu = 0, sigma = 1) {
    // Standard normal PDF
    return (1 / (sigma * Math.sqrt(2 * Math.PI))) *
           Math.exp(-0.5 * Math.pow((x - mu) / sigma, 2));
  }

  static normcdf(x) {
    // Approximation of standard normal CDF
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * x);
    const t2 = t * t;
    const t3 = t2 * t;
    const t4 = t3 * t;
    const t5 = t4 * t;

    const y = 1.0 - (((((a5 * t5 + a4 * t4) + a3 * t3) + a2 * t2) + a1 * t) * t *
              Math.exp(-x * x));

    return 0.5 * (1.0 + sign * y);
  }
}

// ============================================================================
// BASELINE MANAGEMENT
// ============================================================================

class Baseline {
  constructor(data, config = {}) {
    this.config = {
      minDataPoints: 30,
      seasonalityWindow: 90,
      ewmaSpan: 30,
      ...config
    };

    this.data = data || [];
    this.timestamps = [];
    this.values = [];
    this.seasonal = {};
    this.trend = [];
    this.ewma = [];
    this.thresholds = {};
    this.metadata = {
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1
    };

    if (this.data.length > 0) {
      this.initialize();
    }
  }

  initialize() {
    this.extractTimeseries();
    this.computeEWMA();
    this.detectSeasonality();
    this.computeThresholds();
  }

  extractTimeseries() {
    this.timestamps = this.data.map(d => new Date(d.timestamp));
    this.values = this.data.map(d => parseFloat(d.value) || 0);
  }

  computeEWMA() {
    this.ewma = MathUtils.exponentialWeightedMovingAverage(
      this.values,
      this.config.ewmaSpan
    );
  }

  detectSeasonality() {
    const window = Math.min(this.config.seasonalityWindow, this.values.length);
    if (this.values.length < window) return;

    // Daily seasonality detection
    const dailyBuckets = {};
    for (let i = 0; i < this.data.length; i++) {
      const hour = new Date(this.data[i].timestamp).getHours();
      if (!dailyBuckets[hour]) dailyBuckets[hour] = [];
      dailyBuckets[hour].push(this.values[i]);
    }

    this.seasonal.daily = {};
    for (const hour in dailyBuckets) {
      this.seasonal.daily[hour] = {
        mean: MathUtils.mean(dailyBuckets[hour]),
        stdDev: MathUtils.stdDev(dailyBuckets[hour])
      };
    }

    // Weekly seasonality detection
    const weeklyBuckets = {};
    for (let i = 0; i < this.data.length; i++) {
      const dayOfWeek = new Date(this.data[i].timestamp).getDay();
      if (!weeklyBuckets[dayOfWeek]) weeklyBuckets[dayOfWeek] = [];
      weeklyBuckets[dayOfWeek].push(this.values[i]);
    }

    this.seasonal.weekly = {};
    for (const day in weeklyBuckets) {
      this.seasonal.weekly[day] = {
        mean: MathUtils.mean(weeklyBuckets[day]),
        stdDev: MathUtils.stdDev(weeklyBuckets[day])
      };
    }

    // Monthly seasonality detection
    const monthlyBuckets = {};
    for (let i = 0; i < this.data.length; i++) {
      const month = new Date(this.data[i].timestamp).getMonth();
      if (!monthlyBuckets[month]) monthlyBuckets[month] = [];
      monthlyBuckets[month].push(this.values[i]);
    }

    this.seasonal.monthly = {};
    for (const month in monthlyBuckets) {
      this.seasonal.monthly[month] = {
        mean: MathUtils.mean(monthlyBuckets[month]),
        stdDev: MathUtils.stdDev(monthlyBuckets[month])
      };
    }
  }

  computeThresholds() {
    if (this.values.length < 2) {
      this.thresholds = {
        zscore: 3,
        iqrMultiplier: 1.5,
        ewmaDeviation: 2,
        cusumThreshold: 5
      };
      return;
    }

    const mean = MathUtils.mean(this.values);
    const stdDev = MathUtils.stdDev(this.values);
    const q1 = MathUtils.q1(this.values);
    const q3 = MathUtils.q3(this.values);
    const iqr = q3 - q1;

    this.thresholds = {
      mean,
      stdDev,
      q1,
      q3,
      iqr,
      zscore: 3, // 3-sigma rule
      iqrMultiplier: 1.5,
      ewmaDeviation: 2,
      cusumThreshold: 5 * stdDev,
      lowerBound: Math.max(0, mean - 3 * stdDev),
      upperBound: mean + 3 * stdDev,
      iqrLower: Math.max(0, q1 - 1.5 * iqr),
      iqrUpper: q3 + 1.5 * iqr
    };
  }

  update(newData) {
    if (!Array.isArray(newData)) newData = [newData];

    this.data.push(...newData);
    // Keep only last 365 days for performance
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 365);
    this.data = this.data.filter(d => new Date(d.timestamp) >= cutoff);

    this.metadata.updatedAt = new Date();
    this.metadata.version++;
    this.initialize();
  }

  getExpectedValue(timestamp) {
    if (this.values.length === 0) return 0;

    const date = new Date(timestamp);
    const hour = date.getHours();
    const dayOfWeek = date.getDay();
    const month = date.getMonth();

    let expected = MathUtils.mean(this.values);

    // Apply monthly seasonality
    if (this.seasonal.monthly && this.seasonal.monthly[month]) {
      expected = this.seasonal.monthly[month].mean;
    }

    // Apply weekly seasonality
    if (this.seasonal.weekly && this.seasonal.weekly[dayOfWeek]) {
      const weeklyMean = this.seasonal.weekly[dayOfWeek].mean;
      expected = expected * 0.7 + weeklyMean * 0.3; // Weighted blend
    }

    // Apply daily seasonality
    if (this.seasonal.daily && this.seasonal.daily[hour]) {
      const dailyMean = this.seasonal.daily[hour].mean;
      expected = expected * 0.6 + dailyMean * 0.4; // Weighted blend
    }

    return Math.max(0, expected);
  }

  getThresholds(timestamp) {
    const expected = this.getExpectedValue(timestamp);
    const date = new Date(timestamp);
    const stdDev = this.thresholds.stdDev || 1;

    return {
      mean: expected,
      stdDev: stdDev,
      upper: expected + 3 * stdDev,
      lower: Math.max(0, expected - 3 * stdDev),
      iqrUpper: this.thresholds.iqrUpper || expected + 1.5 * this.thresholds.iqr,
      iqrLower: Math.max(0, this.thresholds.iqrLower || expected - 1.5 * this.thresholds.iqr)
    };
  }

  toJSON() {
    return {
      data: this.data,
      seasonal: this.seasonal,
      thresholds: this.thresholds,
      metadata: this.metadata
    };
  }

  static fromJSON(json) {
    const baseline = new Baseline(json.data);
    baseline.seasonal = json.seasonal;
    baseline.thresholds = json.thresholds;
    baseline.metadata = json.metadata;
    return baseline;
  }
}

// ============================================================================
// ANOMALY DETECTOR
// ============================================================================

class AnomalyDetector {
  constructor(config = {}) {
    this.config = {
      minDataPoints: 30,
      seasonalityWindow: 90,
      ewmaSpan: 30,
      zscoreThreshold: 3,
      iqrMultiplier: 1.5,
      cusumThreshold: 5,
      cusumDrift: 0.5,
      confidenceLevel: 0.95,
      feedbackWeight: 0.3,
      ...config
    };

    this.baselines = new Map(); // metricName -> Baseline
    this.anomalyHistory = []; // Track detected anomalies
    this.feedbackLog = []; // User feedback
    this.thresholdAdjustments = {}; // Adjusted thresholds based on feedback
    this.eventCorrelations = []; // Correlated events
  }

  /**
   * Main analysis entry point
   */
  analyze(usageData, options = {}) {
    if (!usageData || usageData.length === 0) {
      return {
        anomalies: [],
        summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
        baseline: null,
        insights: []
      };
    }

    const metricName = options.metricName || 'default';
    const anomalies = this.detectAnomalies(usageData, metricName);

    return {
      anomalies,
      summary: this.summarizeAnomalies(anomalies),
      baseline: this.baselines.get(metricName),
      insights: this.generateInsights(anomalies, usageData),
      forecast: options.includeForecast ? this.forecast(usageData, 7) : null
    };
  }

  /**
   * Core anomaly detection pipeline
   */
  detectAnomalies(data, metricName = 'default') {
    // Ensure baseline exists
    if (!this.baselines.has(metricName)) {
      this.learnBaseline(data, metricName);
    }

    const baseline = this.baselines.get(metricName);
    const values = data.map(d => parseFloat(d.value) || 0);
    const anomalies = [];

    // Run all statistical tests
    const zscores = this.zScoreAnalysis(values);
    const iqrResults = this.iqrAnalysis(values);
    const ewmaResults = this.ewmaAnalysis(values, this.config.ewmaSpan);
    const cusumResults = this.cusumAnalysis(values, this.config.cusumThreshold);

    // Combine results with voting mechanism
    for (let i = 0; i < data.length; i++) {
      const dataPoint = data[i];
      const value = values[i];
      const timestamp = new Date(dataPoint.timestamp);

      const detections = {
        zscore: Math.abs(zscores[i]) > this.config.zscoreThreshold,
        iqr: iqrResults.outliers[i],
        ewma: ewmaResults.outliers[i],
        cusum: cusumResults.signals[i],
        seasonal: this.checkSeasonalDeviation(value, timestamp, baseline)
      };

      const voteCount = Object.values(detections).filter(v => v).length;

      // Anomaly detected if at least 2 methods flag it
      if (voteCount >= 2) {
        const anomaly = {
          id: `${metricName}-${timestamp.getTime()}-${Math.random()}`,
          timestamp: dataPoint.timestamp,
          value: value,
          type: this.classifyAnomaly(value, baseline, dataPoint),
          severity: this.calculateSeverity(value, dataPoint, baseline),
          detectionMethods: detections,
          voteCount: voteCount,
          zscore: zscores[i],
          iqrDeviation: iqrResults.deviations[i],
          ewmaDeviation: ewmaResults.deviations[i],
          cusumScore: cusumResults.scores[i],
          expectedValue: baseline.getExpectedValue(timestamp),
          confidence: this.calculateConfidence(detections, voteCount),
          explanation: null,
          metadata: {
            metricName,
            detectedAt: new Date()
          }
        };

        // Add explanation
        anomaly.explanation = this.explainAnomaly(anomaly, { baseline, dataPoint });

        anomalies.push(anomaly);
      }
    }

    // Filter by confidence and apply feedback adjustments
    return this.filterAndRankAnomalies(anomalies, metricName);
  }

  /**
   * Z-Score Analysis
   * Flags values more than k standard deviations from mean
   */
  zScoreAnalysis(values) {
    if (values.length < 2) return values.map(() => 0);

    const mean = MathUtils.mean(values);
    const stdDev = MathUtils.stdDev(values);

    if (stdDev === 0) return values.map(() => 0);

    return values.map(val => (val - mean) / stdDev);
  }

  /**
   * IQR (Interquartile Range) Analysis
   * Flags values beyond Q1 - 1.5*IQR or Q3 + 1.5*IQR
   */
  iqrAnalysis(values) {
    if (values.length < 4) {
      return { outliers: values.map(() => false), deviations: values.map(() => 0) };
    }

    const q1 = MathUtils.q1(values);
    const q3 = MathUtils.q3(values);
    const iqr = q3 - q1;
    const lowerBound = q1 - this.config.iqrMultiplier * iqr;
    const upperBound = q3 + this.config.iqrMultiplier * iqr;

    const outliers = values.map(val => val < lowerBound || val > upperBound);
    const deviations = values.map(val => {
      if (val < lowerBound) return lowerBound - val;
      if (val > upperBound) return val - upperBound;
      return 0;
    });

    return { outliers, deviations };
  }

  /**
   * EWMA (Exponentially Weighted Moving Average) Analysis
   * Detects sustained deviations from trend
   */
  ewmaAnalysis(values, span) {
    if (values.length < 2) {
      return { outliers: values.map(() => false), deviations: values.map(() => 0) };
    }

    const ewma = MathUtils.exponentialWeightedMovingAverage(values, span);
    const deviations = values.map((val, i) => Math.abs(val - ewma[i]));

    const meanDeviation = MathUtils.mean(deviations);
    const stdDeviation = MathUtils.stdDev(deviations);
    const threshold = meanDeviation + 2 * stdDeviation;

    const outliers = deviations.map(dev => dev > threshold);

    return { outliers, deviations };
  }

  /**
   * CUSUM (Cumulative Sum Control Chart) Analysis
   * Detects shifts in process mean
   */
  cusumAnalysis(values, threshold) {
    if (values.length < 2) {
      return { scores: values.map(() => 0), signals: values.map(() => false) };
    }

    const mean = MathUtils.mean(values);
    const stdDev = MathUtils.stdDev(values);
    const drift = this.config.cusumDrift * stdDev;

    let cusumPos = 0;
    let cusumNeg = 0;
    const scores = [];
    const signals = [];

    for (const val of values) {
      const normalized = (val - mean) / stdDev;
      cusumPos = Math.max(0, cusumPos + normalized - drift);
      cusumNeg = Math.max(0, cusumNeg - normalized - drift);

      const score = Math.max(Math.abs(cusumPos), Math.abs(cusumNeg));
      scores.push(score);
      signals.push(score > threshold);
    }

    return { scores, signals };
  }

  /**
   * Seasonality-aware deviation check
   */
  checkSeasonalDeviation(value, timestamp, baseline) {
    const thresholds = baseline.getThresholds(timestamp);
    const zscore = Math.abs((value - thresholds.mean) / Math.max(1, thresholds.stdDev));
    return zscore > this.config.zscoreThreshold;
  }

  /**
   * Learn baseline from historical data
   */
  learnBaseline(historicalData, metricName = 'default') {
    if (!historicalData || historicalData.length < this.config.minDataPoints) {
      console.warn(`Insufficient data for baseline: ${historicalData?.length || 0} points`);
    }

    const baseline = new Baseline(historicalData, {
      seasonalityWindow: this.config.seasonalityWindow,
      ewmaSpan: this.config.ewmaSpan,
      minDataPoints: this.config.minDataPoints
    });

    this.baselines.set(metricName, baseline);
    return baseline;
  }

  /**
   * Update baseline with new data
   */
  updateBaseline(newData, metricName = 'default') {
    if (!this.baselines.has(metricName)) {
      this.learnBaseline(newData, metricName);
    } else {
      this.baselines.get(metricName).update(newData);
    }
  }

  /**
   * Detect seasonality patterns
   */
  detectSeasonality(data) {
    if (!data || data.length === 0) return null;

    const baseline = new Baseline(data, this.config);
    baseline.detectSeasonality();

    return {
      daily: baseline.seasonal.daily,
      weekly: baseline.seasonal.weekly,
      monthly: baseline.seasonal.monthly,
      strength: this.calculateSeasonalityStrength(baseline)
    };
  }

  calculateSeasonalityStrength(baseline) {
    let strengths = [];

    // Daily strength
    if (baseline.seasonal.daily && Object.keys(baseline.seasonal.daily).length > 0) {
      const dailyMeans = Object.values(baseline.seasonal.daily).map(s => s.mean);
      const overallMean = MathUtils.mean(baseline.values);
      const dailyVar = MathUtils.variance(dailyMeans);
      strengths.push(dailyVar / (this.variance(baseline.values) + 1));
    }

    // Weekly strength
    if (baseline.seasonal.weekly && Object.keys(baseline.seasonal.weekly).length > 0) {
      const weeklyMeans = Object.values(baseline.seasonal.weekly).map(s => s.mean);
      const weeklyVar = MathUtils.variance(weeklyMeans);
      strengths.push(weeklyVar / (MathUtils.variance(baseline.values) + 1));
    }

    return strengths.length > 0 ? MathUtils.mean(strengths) : 0;
  }

  /**
   * Classify anomaly type
   */
  classifyAnomaly(value, baseline, dataPoint) {
    const expected = baseline.getExpectedValue(dataPoint.timestamp);
    const deviation = value - expected;
    const percentChange = expected !== 0 ? (deviation / expected) * 100 : 0;

    // Determine anomaly type based on characteristics
    if (Math.abs(percentChange) > 50) {
      return deviation > 0 ? 'cost_spike' : 'cost_drop';
    }

    // Check for off-hours
    const hour = new Date(dataPoint.timestamp).getHours();
    if ((hour < 6 || hour > 22) && value > expected * 1.3) {
      return 'off_hours';
    }

    // Check for rate anomaly
    if (dataPoint.unitPrice && Math.abs(dataPoint.unitPrice - baseline.thresholds.mean) > 2 * baseline.thresholds.stdDev) {
      return 'rate_anomaly';
    }

    // Check for unusual model
    if (dataPoint.model && this.isUnusualModel(dataPoint.model, baseline.data)) {
      return 'unusual_model';
    }

    // Check for budget threshold
    if (dataPoint.budgetLimit && value > dataPoint.budgetLimit * 0.9) {
      return 'budget_threshold';
    }

    // Default to spike or drop
    return deviation > 0 ? 'volume_spike' : 'cost_drop';
  }

  isUnusualModel(model, historicalData) {
    const modelFreq = {};
    for (const d of historicalData) {
      if (d.model) {
        modelFreq[d.model] = (modelFreq[d.model] || 0) + 1;
      }
    }

    const totalModels = Object.values(modelFreq).reduce((a, b) => a + b, 0);
    const modelFrequency = (modelFreq[model] || 0) / totalModels;

    return modelFrequency < 0.05; // Model used in less than 5% of samples
  }

  /**
   * Calculate severity level
   */
  calculateSeverity(value, dataPoint, baseline) {
    const expected = baseline.getExpectedValue(dataPoint.timestamp);
    const thresholds = baseline.getThresholds(dataPoint.timestamp);
    const zscore = Math.abs((value - thresholds.mean) / Math.max(1, thresholds.stdDev));
    const percentChange = expected !== 0 ? Math.abs((value - expected) / expected) * 100 : 0;

    if (zscore > 4 || percentChange > 100) return 'critical';
    if (zscore > 3 || percentChange > 75) return 'high';
    if (zscore > 2 || percentChange > 50) return 'medium';
    return 'low';
  }

  /**
   * Calculate detection confidence
   */
  calculateConfidence(detections, voteCount) {
    const baseConfidence = (voteCount / Object.keys(detections).length) * 100;

    // Boost confidence if multiple statistical methods agree
    const methodAgreement = {
      zscore: detections.zscore,
      iqr: detections.iqr,
      ewma: detections.ewma,
      cusum: detections.cusum
    };

    const statisticalVotes = Object.values(methodAgreement).filter(v => v).length;
    if (statisticalVotes >= 3) return Math.min(99, baseConfidence + 20);

    return baseConfidence;
  }

  /**
   * Explain anomaly with detailed reasoning
   */
  explainAnomaly(anomaly, context = {}) {
    const { baseline, dataPoint } = context;
    const parts = [];

    if (!baseline) {
      return {
        summary: 'Anomaly detected by multiple statistical methods',
        details: [],
        methodology: Object.keys(anomaly.detectionMethods).filter(
          k => anomaly.detectionMethods[k]
        )
      };
    }

    const expected = baseline.getExpectedValue(anomaly.timestamp);
    const deviation = anomaly.value - expected;
    const percentChange = expected !== 0 ? (deviation / expected) * 100 : 0;

    // Z-score explanation
    if (anomaly.detectionMethods.zscore) {
      parts.push(`Value deviates ${Math.abs(anomaly.zscore).toFixed(2)} standard deviations from mean`);
    }

    // IQR explanation
    if (anomaly.detectionMethods.iqr) {
      parts.push(`Value is ${Math.abs(anomaly.iqrDeviation).toFixed(2)} units beyond IQR bounds`);
    }

    // EWMA explanation
    if (anomaly.detectionMethods.ewma) {
      parts.push(`Sustained deviation of ${Math.abs(anomaly.ewmaDeviation).toFixed(2)} from trend`);
    }

    // CUSUM explanation
    if (anomaly.detectionMethods.cusum) {
      parts.push(`CUSUM score of ${anomaly.cusumScore.toFixed(2)} indicates process shift`);
    }

    // Seasonal explanation
    if (anomaly.detectionMethods.seasonal) {
      const date = new Date(anomaly.timestamp);
      parts.push(`Unusual pattern for ${date.toLocaleDateString()} at ${date.getHours()}:00`);
    }

    // Impact summary
    if (Math.abs(percentChange) > 0) {
      parts.push(`${Math.abs(percentChange).toFixed(1)}% ${percentChange > 0 ? 'increase' : 'decrease'} from expected ${expected.toFixed(2)}`);
    }

    return {
      summary: `${anomaly.type}: ${Math.abs(percentChange).toFixed(1)}% deviation from baseline`,
      details: parts,
      methodology: Object.keys(anomaly.detectionMethods).filter(k => anomaly.detectionMethods[k]),
      expectedValue: expected,
      actualValue: anomaly.value,
      deviation: deviation
    };
  }

  /**
   * Correlate anomalies with external events
   */
  correlateWithEvents(anomaly, events = []) {
    if (!events || events.length === 0) return [];

    const anomalyTime = new Date(anomaly.timestamp).getTime();
    const correlatedEvents = [];

    for (const event of events) {
      const eventTime = new Date(event.timestamp).getTime();
      const timeDiffHours = Math.abs(anomalyTime - eventTime) / (1000 * 60 * 60);

      // Events within 24 hours are considered correlated
      if (timeDiffHours <= 24) {
        const correlation = {
          event: event.description,
          timeDiff: timeDiffHours,
          likelihood: this.calculateEventCorrelationLikelihood(anomaly, event),
          causality: this.inferCausality(anomaly, event)
        };
        correlatedEvents.push(correlation);
      }
    }

    return correlatedEvents.sort((a, b) => b.likelihood - a.likelihood);
  }

  calculateEventCorrelationLikelihood(anomaly, event) {
    // Higher likelihood if anomaly type matches event type
    const typeMatch = anomaly.type.includes(event.type) ? 0.3 : 0;

    // Higher likelihood if event occurred before anomaly
    const timingBonus = new Date(event.timestamp) < new Date(anomaly.timestamp) ? 0.2 : 0;

    // Severity match
    const severityMatch = event.severity === anomaly.severity ? 0.2 : 0.1;

    return Math.min(1, typeMatch + timingBonus + severityMatch);
  }

  inferCausality(anomaly, event) {
    if (event.timestamp > anomaly.timestamp) return 'potential_effect';
    const timeDiff = new Date(anomaly.timestamp) - new Date(event.timestamp);
    const hoursApart = timeDiff / (1000 * 60 * 60);

    if (hoursApart < 1) return 'likely_cause';
    if (hoursApart < 6) return 'probable_cause';
    if (hoursApart < 24) return 'possible_cause';
    return 'unlikely_cause';
  }

  /**
   * User feedback loop - mark false positive
   */
  markFalsePositive(anomalyId) {
    this.feedbackLog.push({
      anomalyId,
      feedback: 'false_positive',
      timestamp: new Date(),
      weight: 1
    });

    this.adjustThresholds('false_positive');
  }

  /**
   * User feedback loop - confirm anomaly
   */
  markConfirmed(anomalyId) {
    this.feedbackLog.push({
      anomalyId,
      feedback: 'confirmed',
      timestamp: new Date(),
      weight: 1
    });
  }

  /**
   * Adjust thresholds based on feedback
   */
  adjustThresholds(feedbackType) {
    const recentFeedback = this.feedbackLog.slice(-100); // Last 100 feedbacks
    const falsePositiveRate = recentFeedback.filter(f => f.feedback === 'false_positive').length /
                              recentFeedback.length;
    const confirmedRate = recentFeedback.filter(f => f.feedback === 'confirmed').length /
                          recentFeedback.length;

    if (falsePositiveRate > 0.3) {
      // Too many false positives - increase thresholds
      this.config.zscoreThreshold = Math.min(4, this.config.zscoreThreshold + 0.1);
      this.config.iqrMultiplier = Math.min(2.5, this.config.iqrMultiplier + 0.05);
    }

    if (confirmedRate > 0.7) {
      // Most anomalies confirmed - decrease thresholds
      this.config.zscoreThreshold = Math.max(2, this.config.zscoreThreshold - 0.1);
      this.config.iqrMultiplier = Math.max(1.2, this.config.iqrMultiplier - 0.05);
    }
  }

  /**
   * Filter and rank anomalies
   */
  filterAndRankAnomalies(anomalies, metricName) {
    // Remove duplicates (same timestamp, type)
    const uniqueAnomalies = [];
    const seen = new Set();

    for (const anomaly of anomalies) {
      const key = `${anomaly.timestamp}-${anomaly.type}`;
      if (!seen.has(key) && anomaly.confidence > 40) {
        uniqueAnomalies.push(anomaly);
        seen.add(key);
      }
    }

    // Apply feedback adjustments
    const adjustedAnomalies = uniqueAnomalies.map(a => {
      const feedback = this.feedbackLog.find(f => f.anomalyId === a.id);
      if (feedback && feedback.feedback === 'false_positive') {
        a.confidence *= (1 - this.config.feedbackWeight);
      }
      return a;
    });

    // Store in history
    this.anomalyHistory.push(...adjustedAnomalies);
    this.anomalyHistory = this.anomalyHistory.slice(-1000); // Keep last 1000

    // Sort by severity and confidence
    return adjustedAnomalies.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return (severityOrder[b.severity] - severityOrder[a.severity]) ||
             (b.confidence - a.confidence);
    });
  }

  /**
   * Summarize anomalies by severity
   */
  summarizeAnomalies(anomalies) {
    return {
      total: anomalies.length,
      critical: anomalies.filter(a => a.severity === 'critical').length,
      high: anomalies.filter(a => a.severity === 'high').length,
      medium: anomalies.filter(a => a.severity === 'medium').length,
      low: anomalies.filter(a => a.severity === 'low').length,
      byType: this.groupByType(anomalies)
    };
  }

  groupByType(anomalies) {
    const groups = {};
    for (const anomaly of anomalies) {
      groups[anomaly.type] = (groups[anomaly.type] || 0) + 1;
    }
    return groups;
  }

  /**
   * Generate insights from anomalies
   */
  generateInsights(anomalies, usageData) {
    const insights = [];

    if (anomalies.length === 0) {
      insights.push({
        type: 'normal',
        message: 'No significant anomalies detected. Usage patterns are within normal ranges.',
        confidence: 0.95
      });
      return insights;
    }

    // Trend analysis
    const recentAnomalies = anomalies.filter(a => {
      const daysAgo = (new Date() - new Date(a.timestamp)) / (1000 * 60 * 60 * 24);
      return daysAgo <= 7;
    });

    if (recentAnomalies.length > 3) {
      insights.push({
        type: 'trend',
        message: `${recentAnomalies.length} anomalies detected in the past week. Investigate systematic issues.`,
        confidence: 0.8,
        count: recentAnomalies.length
      });
    }

    // Spike pattern
    const spikes = anomalies.filter(a => a.type.includes('spike'));
    if (spikes.length > 0) {
      const avgMagnitude = MathUtils.mean(spikes.map(s =>
        Math.abs(s.value - s.expectedValue) / s.expectedValue
      ));
      insights.push({
        type: 'spike_pattern',
        message: `Pattern of cost spikes detected (avg ${(avgMagnitude * 100).toFixed(1)}% increase)`,
        confidence: Math.min(0.95, 0.5 + spikes.length * 0.1),
        magnitude: avgMagnitude
      });
    }

    // Off-hours activity
    const offHoursAnomalies = anomalies.filter(a => a.type === 'off_hours');
    if (offHoursAnomalies.length > 0) {
      insights.push({
        type: 'off_hours_activity',
        message: `${offHoursAnomalies.length} off-hours anomalies detected. Review access controls.`,
        confidence: 0.85,
        count: offHoursAnomalies.length
      });
    }

    return insights;
  }

  /**
   * Time series forecasting
   */
  forecast(data, periods = 7) {
    if (!data || data.length < 2) return null;

    const values = data.map(d => parseFloat(d.value) || 0);
    const timestamps = data.map(d => new Date(d.timestamp));

    // Use exponential smoothing with trend and seasonality (Holt-Winters)
    const forecast = this.holtWintersForecast(values, periods);

    return {
      forecast: forecast.map((val, i) => ({
        period: i + 1,
        value: val,
        timestamp: this.getNextTimestamp(timestamps[timestamps.length - 1], i + 1),
        interval: {
          lower: Math.max(0, val * 0.85),
          upper: val * 1.15
        }
      })),
      confidence: 0.85,
      method: 'Exponential Smoothing with Trend'
    };
  }

  holtWintersForecast(values, periods) {
    if (values.length < 4) {
      // Fallback to simple exponential smoothing
      return this.simpleExponentialSmoothing(values, periods);
    }

    const alpha = 0.3; // Level smoothing
    const beta = 0.1;  // Trend smoothing
    const gamma = 0.1; // Seasonality smoothing
    const season = 7;  // Weekly seasonality

    let level = values[0];
    let trend = (values[1] - values[0]);
    const seasonalIndices = [];

    // Initialize seasonal indices
    for (let i = 0; i < Math.min(season, values.length); i++) {
      seasonalIndices.push(values[i] / level);
    }

    // Fit model
    for (let i = 1; i < values.length; i++) {
      const prevLevel = level;
      const seasonal = seasonalIndices[i % season] || 1;

      level = alpha * (values[i] / seasonal) + (1 - alpha) * (level + trend);
      trend = beta * (level - prevLevel) + (1 - beta) * trend;

      if (i < values.length - 1) {
        seasonalIndices[i % season] = gamma * (values[i] / level) +
                                      (1 - gamma) * seasonalIndices[i % season];
      }
    }

    // Generate forecast
    const forecast = [];
    for (let i = 1; i <= periods; i++) {
      const seasonal = seasonalIndices[(values.length + i) % season] || 1;
      forecast.push((level + i * trend) * seasonal);
    }

    return forecast.map(f => Math.max(0, f));
  }

  simpleExponentialSmoothing(values, periods) {
    const alpha = 0.3;
    let smoothed = values[0];
    const forecast = [];

    for (let i = 1; i < values.length; i++) {
      smoothed = alpha * values[i] + (1 - alpha) * smoothed;
    }

    for (let i = 0; i < periods; i++) {
      forecast.push(smoothed);
    }

    return forecast;
  }

  getNextTimestamp(lastTimestamp, periodOffset) {
    const next = new Date(lastTimestamp);
    next.setDate(next.getDate() + periodOffset);
    return next.toISOString();
  }

  /**
   * Scenario analysis
   */
  scenarioAnalysis(data, assumptions = {}) {
    if (!data || data.length === 0) return null;

    const values = data.map(d => parseFloat(d.value) || 0);
    const baseline = MathUtils.mean(values);

    const scenarios = {
      pessimistic: {
        name: 'Pessimistic',
        multiplier: assumptions.pessimistic || 1.3,
        description: '30% increase from baseline'
      },
      optimistic: {
        name: 'Optimistic',
        multiplier: assumptions.optimistic || 0.7,
        description: '30% decrease from baseline'
      },
      normal: {
        name: 'Normal',
        multiplier: 1.0,
        description: 'Continuation of current trend'
      }
    };

    const results = {};
    for (const [key, scenario] of Object.entries(scenarios)) {
      const forecast = this.forecast(data, 7);
      results[key] = {
        ...scenario,
        values: forecast.forecast.map(f => ({
          ...f,
          value: f.value * scenario.multiplier
        })),
        impact: (scenario.multiplier - 1) * 100
      };
    }

    return results;
  }

  /**
   * Export baseline for persistence
   */
  exportBaseline(metricName = 'default') {
    const baseline = this.baselines.get(metricName);
    if (!baseline) return null;
    return baseline.toJSON();
  }

  /**
   * Import baseline from persistence
   */
  importBaseline(json, metricName = 'default') {
    const baseline = Baseline.fromJSON(json);
    this.baselines.set(metricName, baseline);
    return baseline;
  }

  /**
   * Get anomaly history
   */
  getAnomalyHistory(metricName = null, days = 30) {
    let history = this.anomalyHistory;

    if (metricName) {
      history = history.filter(a => a.metadata.metricName === metricName);
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return history.filter(a => new Date(a.timestamp) >= cutoff);
  }

  /**
   * Get feedback stats
   */
  getFeedbackStats() {
    if (this.feedbackLog.length === 0) return null;

    const total = this.feedbackLog.length;
    const falsePositives = this.feedbackLog.filter(f => f.feedback === 'false_positive').length;
    const confirmed = this.feedbackLog.filter(f => f.feedback === 'confirmed').length;

    return {
      total,
      falsePositiveRate: falsePositives / total,
      confirmedRate: confirmed / total,
      recentTrend: this.calculateFeedbackTrend()
    };
  }

  calculateFeedbackTrend() {
    const recent = this.feedbackLog.slice(-50);
    if (recent.length === 0) return 'stable';

    const falsePositives = recent.filter(f => f.feedback === 'false_positive').length;
    const fpRate = falsePositives / recent.length;

    if (fpRate > 0.4) return 'worsening';
    if (fpRate < 0.2) return 'improving';
    return 'stable';
  }
}

// ============================================================================
// EXPORT
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AnomalyDetector,
    Baseline,
    MathUtils
  };
}
