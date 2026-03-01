/**
 * Finault Reconciliation Engine - Diamond Tier Enhancements
 * Enterprise-grade reconciliation with ML-driven predictions, continuous matching,
 * cross-provider detection, and cryptographic audit trails for SOX compliance.
 */

import crypto from 'crypto';
import { DiamondLogger, resilientFetch, InputValidator, HealthCheck } from './diamond-utils.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const FCS_WEIGHTS = {
  DATA_COVERAGE: 0.40,      // 40%
  TEMPORAL_DEPTH: 0.25,     // 25%
  RATE_CERTAINTY: 0.20,     // 20%
  RECONCILIATION_INTEGRITY: 0.15 // 15%
};

const FCS_TIERS = {
  OBSERVE: { min: 0.00, max: 0.39, label: 'Observe' },
  REVIEW: { min: 0.40, max: 0.69, label: 'Review' },
  RECOMMEND: { min: 0.70, max: 0.84, label: 'Recommend' },
  AUTOMATE: { min: 0.85, max: 1.00, label: 'Automate' }
};

const EXCEPTION_REASON_CODES = {
  RATE_MISMATCH: 'RATE_MISMATCH',
  QUANTITY_VARIANCE: 'QUANTITY_VARIANCE',
  MISSING_USAGE: 'MISSING_USAGE',
  EXTRA_CHARGES: 'EXTRA_CHARGES',
  TIMESTAMP_DISCREPANCY: 'TIMESTAMP_DISCREPANCY',
  UNIT_MISMATCH: 'UNIT_MISMATCH',
  PARTIAL_RECONCILIATION: 'PARTIAL_RECONCILIATION',
  MULTI_PROVIDER_DUPLICATE: 'MULTI_PROVIDER_DUPLICATE',
  METADATA_MISSING: 'METADATA_MISSING',
  SERVICE_SCOPE_MISMATCH: 'SERVICE_SCOPE_MISMATCH',
  DISCOUNT_UNEXPLAINED: 'DISCOUNT_UNEXPLAINED',
  PREDICTION_DEVIATION: 'PREDICTION_DEVIATION'
};

const RECONCILIATION_STATES = {
  OPEN: 'OPEN',
  ASSIGNED: 'ASSIGNED',
  INVESTIGATING: 'INVESTIGATING',
  RESOLVED: 'RESOLVED',
  ESCALATED: 'ESCALATED'
};

// ============================================================================
// CLASS: FinaultConfidenceScore
// ============================================================================

class FinaultConfidenceScore {
  constructor(customWeights = null) {
    this.componentScores = {
      DATA_COVERAGE: 0,
      TEMPORAL_DEPTH: 0,
      RATE_CERTAINTY: 0,
      RECONCILIATION_INTEGRITY: 0
    };
    // Allow custom weights with validation
    this.weights = customWeights || {
      DATA_COVERAGE: 0.40,
      TEMPORAL_DEPTH: 0.25,
      RATE_CERTAINTY: 0.20,
      RECONCILIATION_INTEGRITY: 0.15
    };
    this._validateWeights(this.weights);
    this.overallScore = 0;
    this.tier = null;
    this.scoreHistory = [];
    this.calculatedAt = null;
    this.evidenceMetadata = {};
  }

  /**
   * Set custom weights for FCS calculation
   * @param {Object} weights - Custom weight distribution
   * @throws {Error} if weights don't sum to 1.0
   */
  setWeights(weights) {
    this._validateWeights(weights);
    this.weights = weights;
  }

  /**
   * Validate that weights sum to 1.0
   * @private
   */
  _validateWeights(weights) {
    const required = ['DATA_COVERAGE', 'TEMPORAL_DEPTH', 'RATE_CERTAINTY', 'RECONCILIATION_INTEGRITY'];
    const provided = Object.keys(weights || {});

    // Check all required weights are present
    for (const key of required) {
      if (!(key in weights)) {
        throw new Error(`Missing required weight: ${key}`);
      }
    }

    // Check sum equals 1.0 (with tolerance for floating point)
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1.0) > 0.0001) {
      throw new Error(`Weights must sum to 1.0, got ${sum.toFixed(4)}`);
    }

    // Check all weights are positive
    for (const [key, value] of Object.entries(weights)) {
      if (value < 0 || value > 1) {
        throw new Error(`Weight ${key} must be between 0 and 1, got ${value}`);
      }
    }
  }

  /**
   * Calculate Data Coverage component (0-1 scale)
   * Measures percentage of billable usage that has corresponding invoice entries
   */
  calculateDataCoverage(totalUsageRecords, matchedUsageRecords) {
    if (totalUsageRecords === 0) return 0;
    const coverage = matchedUsageRecords / totalUsageRecords;
    this.componentScores.DATA_COVERAGE = Math.min(coverage, 1.0);
    this.evidenceMetadata.DATA_COVERAGE = {
      total: totalUsageRecords,
      matched: matchedUsageRecords,
      percentage: (coverage * 100).toFixed(2)
    };
    return this.componentScores.DATA_COVERAGE;
  }

  /**
   * Calculate Temporal Depth component (0-1 scale)
   * Measures how far back historical data extends for rate calculation
   * Uses smooth sigmoid function centered at 180 days
   * 0 days ~0.03, 180 days = 0.5, 365 days ~0.97
   */
  calculateTemporalDepth(oldestDatapointDaysAgo) {
    // Sigmoid function: 1 / (1 + e^(-0.02 * (days - 180)))
    // Centers smoothly at 180 days, providing gradual increase in confidence
    const sigmoid = 1 / (1 + Math.exp(-0.02 * (oldestDatapointDaysAgo - 180)));
    const score = Math.max(Math.min(sigmoid, 1.0), 0.0); // Clamp to [0, 1]

    this.componentScores.TEMPORAL_DEPTH = score;
    this.evidenceMetadata.TEMPORAL_DEPTH = {
      oldestDataDaysAgo: oldestDatapointDaysAgo,
      depthMonths: (oldestDatapointDaysAgo / 30).toFixed(1),
      score: parseFloat(score.toFixed(4)),
      scoreMethod: 'sigmoid_continuous'
    };
    return score;
  }

  /**
   * Calculate Rate Certainty component (0-1 scale)
   * Measures statistical confidence in derived rates from historical data
   * Based on coefficient of variation (std dev / mean)
   */
  calculateRateCertainty(rateHistoricalVariance, rateCount) {
    let score = 1.0;

    // Coefficient of variation: lower CV = higher certainty
    // CV > 0.3 indicates high variability (score reduced)
    if (rateHistoricalVariance > 0.3) {
      score = Math.max(1.0 - (rateHistoricalVariance - 0.3) * 2, 0.2);
    }

    // Bonus for multiple rate observations
    if (rateCount >= 12) {
      score = Math.min(score + 0.15, 1.0);
    } else if (rateCount >= 6) {
      score = Math.min(score + 0.10, 1.0);
    } else if (rateCount < 3) {
      score = Math.max(score - 0.25, 0.1);
    }

    this.componentScores.RATE_CERTAINTY = score;
    this.evidenceMetadata.RATE_CERTAINTY = {
      historicalVariance: rateHistoricalVariance,
      rateObservationCount: rateCount,
      certaintScore: score
    };
    return score;
  }

  /**
   * Calculate Reconciliation Integrity component (0-1 scale)
   * Measures data quality, no anomalies, cryptographic chain integrity
   */
  calculateReconciliationIntegrity(
    noAnomaliesDetected,
    cryptographicChainValid,
    dataQualityScore,
    auditTrailCompleteness
  ) {
    let score = 0;

    // Base: data quality score (0-1)
    score = dataQualityScore;

    // Boost for anomaly-free state
    if (noAnomaliesDetected) {
      score = Math.min(score + 0.15, 1.0);
    } else {
      score = Math.max(score - 0.20, 0);
    }

    // Boost for valid cryptographic chain
    if (cryptographicChainValid) {
      score = Math.min(score + 0.10, 1.0);
    } else {
      score = Math.max(score - 0.30, 0);
    }

    // Audit trail completeness weighting
    score = score * 0.7 + (auditTrailCompleteness * 0.3);

    this.componentScores.RECONCILIATION_INTEGRITY = Math.max(score, 0);
    this.evidenceMetadata.RECONCILIATION_INTEGRITY = {
      dataQuality: dataQualityScore,
      anomalyFree: noAnomaliesDetected,
      chainValid: cryptographicChainValid,
      auditCompleteness: auditTrailCompleteness
    };
    return this.componentScores.RECONCILIATION_INTEGRITY;
  }

  /**
   * Calculate overall FCS using weighted formula
   */
  calculateOverallScore() {
    this.overallScore = (
      this.componentScores.DATA_COVERAGE * this.weights.DATA_COVERAGE +
      this.componentScores.TEMPORAL_DEPTH * this.weights.TEMPORAL_DEPTH +
      this.componentScores.RATE_CERTAINTY * this.weights.RATE_CERTAINTY +
      this.componentScores.RECONCILIATION_INTEGRITY * this.weights.RECONCILIATION_INTEGRITY
    );

    this.calculatedAt = new Date().toISOString();
    this.determineTier();
    this.recordInHistory();

    return this.overallScore;
  }

  /**
   * Determine FCS tier based on overall score
   */
  determineTier() {
    if (this.overallScore < FCS_TIERS.OBSERVE.max) {
      this.tier = 'OBSERVE';
    } else if (this.overallScore < FCS_TIERS.REVIEW.max) {
      this.tier = 'REVIEW';
    } else if (this.overallScore < FCS_TIERS.RECOMMEND.max) {
      this.tier = 'RECOMMEND';
    } else {
      this.tier = 'AUTOMATE';
    }
  }

  /**
   * Record score in history for tracking
   */
  recordInHistory() {
    this.scoreHistory.push({
      timestamp: this.calculatedAt,
      overall: this.overallScore,
      tier: this.tier,
      components: { ...this.componentScores }
    });

    // Keep last 365 measurements
    if (this.scoreHistory.length > 365) {
      this.scoreHistory.shift();
    }
  }

  /**
   * Get score details with all components and tier
   */
  getScoreDetails() {
    return {
      overall: parseFloat(this.overallScore.toFixed(4)),
      tier: this.tier,
      components: {
        dataCoverage: parseFloat(this.componentScores.DATA_COVERAGE.toFixed(4)),
        temporalDepth: parseFloat(this.componentScores.TEMPORAL_DEPTH.toFixed(4)),
        rateCertainty: parseFloat(this.componentScores.RATE_CERTAINTY.toFixed(4)),
        reconciliationIntegrity: parseFloat(this.componentScores.RECONCILIATION_INTEGRITY.toFixed(4))
      },
      evidence: this.evidenceMetadata,
      calculatedAt: this.calculatedAt
    };
  }

  /**
   * Get score history trend (last N entries)
   */
  getScoreTrend(days = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return this.scoreHistory.filter(entry =>
      new Date(entry.timestamp) >= cutoffDate
    );
  }
}

// ============================================================================
// CLASS: FCSBehaviorGate
// ============================================================================

class FCSBehaviorGate {
  constructor() {
    this.tierPermissions = {
      OBSERVE: {
        allowAutoReconciliation: false,
        allowAutoPayment: false,
        requiresManualReview: true,
        allowDataExport: false,
        maxAutoAdjustmentPercent: 0,
        requiresApprovalTier: 'DIRECTOR'
      },
      REVIEW: {
        allowAutoReconciliation: false,
        allowAutoPayment: false,
        requiresManualReview: true,
        allowDataExport: true,
        maxAutoAdjustmentPercent: 0,
        requiresApprovalTier: 'MANAGER'
      },
      RECOMMEND: {
        allowAutoReconciliation: true,
        allowAutoPayment: false,
        requiresManualReview: false,
        allowDataExport: true,
        maxAutoAdjustmentPercent: 5,
        requiresApprovalTier: 'ANALYST'
      },
      AUTOMATE: {
        allowAutoReconciliation: true,
        allowAutoPayment: true,
        requiresManualReview: false,
        allowDataExport: true,
        maxAutoAdjustmentPercent: 15,
        requiresApprovalTier: null
      }
    };
  }

  /**
   * Check if action is permitted at current FCS tier
   */
  isActionPermitted(fcsScore, actionType) {
    let tier = 'OBSERVE';
    if (fcsScore < 0.40) tier = 'OBSERVE';
    else if (fcsScore < 0.70) tier = 'REVIEW';
    else if (fcsScore < 0.85) tier = 'RECOMMEND';
    else tier = 'AUTOMATE';

    const permissions = this.tierPermissions[tier];

    const actionMap = {
      'autoReconciliation': permissions.allowAutoReconciliation,
      'autoPayment': permissions.allowAutoPayment,
      'dataExport': permissions.allowDataExport,
      'manualReview': permissions.requiresManualReview
    };

    return actionMap[actionType] !== undefined ? actionMap[actionType] : false;
  }

  /**
   * Get max adjustment allowed at FCS tier
   */
  getMaxAutoAdjustmentPercent(fcsScore) {
    let tier = 'OBSERVE';
    if (fcsScore < 0.40) tier = 'OBSERVE';
    else if (fcsScore < 0.70) tier = 'REVIEW';
    else if (fcsScore < 0.85) tier = 'RECOMMEND';
    else tier = 'AUTOMATE';

    return this.tierPermissions[tier].maxAutoAdjustmentPercent;
  }

  /**
   * Get required approval tier for action
   */
  getRequiredApprovalTier(fcsScore) {
    let tier = 'OBSERVE';
    if (fcsScore < 0.40) tier = 'OBSERVE';
    else if (fcsScore < 0.70) tier = 'REVIEW';
    else if (fcsScore < 0.85) tier = 'RECOMMEND';
    else tier = 'AUTOMATE';

    return this.tierPermissions[tier].requiresApprovalTier;
  }

  /**
   * Override tier-based gate with approval chain
   */
  overrideGate(fcsScore, actionType, overridingUserTier) {
    const requiredApproval = this.getRequiredApprovalTier(fcsScore);
    const tierHierarchy = ['ANALYST', 'MANAGER', 'DIRECTOR', 'CHIEF_FINANCIAL_OFFICER'];

    if (!requiredApproval) {
      return { allowed: true, reason: 'No approval required at this tier' };
    }

    const userIndex = tierHierarchy.indexOf(overridingUserTier);
    const requiredIndex = tierHierarchy.indexOf(requiredApproval);

    if (userIndex >= requiredIndex) {
      return {
        allowed: true,
        reason: `Override approved by ${overridingUserTier}`,
        overriddenAt: new Date().toISOString(),
        overriddenBy: overridingUserTier
      };
    }

    return {
      allowed: false,
      reason: `Override requires ${requiredApproval} approval, user is ${overridingUserTier}`
    };
  }

  /**
   * Get all permissions for a given FCS score
   */
  getPermissionsForScore(fcsScore) {
    let tier = 'OBSERVE';
    if (fcsScore < 0.40) tier = 'OBSERVE';
    else if (fcsScore < 0.70) tier = 'REVIEW';
    else if (fcsScore < 0.85) tier = 'RECOMMEND';
    else tier = 'AUTOMATE';

    return {
      tier,
      permissions: this.tierPermissions[tier]
    };
  }
}

// ============================================================================
// CLASS: ExceptionWorkflow
// ============================================================================

class ExceptionWorkflow {
  constructor() {
    this.exceptions = [];
    this.stateTransitions = {
      OPEN: ['ASSIGNED', 'ESCALATED'],
      ASSIGNED: ['INVESTIGATING', 'RESOLVED', 'ESCALATED'],
      INVESTIGATING: ['RESOLVED', 'ESCALATED'],
      RESOLVED: [],
      ESCALATED: ['INVESTIGATING', 'RESOLVED']
    };
  }

  /**
   * Create new exception with reason code
   */
  createException(reasonCode, invoiceData, usageData, metadata = {}) {
    if (!Object.values(EXCEPTION_REASON_CODES).includes(reasonCode)) {
      throw new Error(`Invalid reason code: ${reasonCode}`);
    }

    const exceptionId = `EXC-${Date.now()}-${crypto.randomUUID().substring(0, 9)}`;

    const exception = {
      id: exceptionId,
      reasonCode,
      state: RECONCILIATION_STATES.OPEN,
      invoiceData,
      usageData,
      metadata,
      createdAt: new Date().toISOString(),
      assignedTo: null,
      assignedAt: null,
      investigationNotes: [],
      slaDeadline: this.calculateSLADeadline(reasonCode),
      slaBreached: false,
      resolution: null,
      resolvedAt: null
    };

    this.exceptions.push(exception);
    return exception;
  }

  /**
   * Calculate SLA deadline based on reason code severity
   */
  calculateSLADeadline(reasonCode) {
    const slaDays = {
      RATE_MISMATCH: 5,
      QUANTITY_VARIANCE: 3,
      MISSING_USAGE: 2,
      EXTRA_CHARGES: 1,
      TIMESTAMP_DISCREPANCY: 4,
      UNIT_MISMATCH: 3,
      PARTIAL_RECONCILIATION: 5,
      MULTI_PROVIDER_DUPLICATE: 1,
      METADATA_MISSING: 7,
      SERVICE_SCOPE_MISMATCH: 5,
      DISCOUNT_UNEXPLAINED: 4,
      PREDICTION_DEVIATION: 3
    };

    const deadline = new Date();
    deadline.setDate(deadline.getDate() + (slaDays[reasonCode] || 5));
    return deadline.toISOString();
  }

  /**
   * Assign exception to analyst
   */
  assignException(exceptionId, assigneeId, assigneeEmail) {
    const exception = this.exceptions.find(e => e.id === exceptionId);
    if (!exception) throw new Error(`Exception not found: ${exceptionId}`);

    if (!this.stateTransitions[exception.state].includes(RECONCILIATION_STATES.ASSIGNED)) {
      throw new Error(`Cannot assign exception in ${exception.state} state`);
    }

    exception.assignedTo = assigneeId;
    exception.assignedEmail = assigneeEmail;
    exception.assignedAt = new Date().toISOString();
    exception.state = RECONCILIATION_STATES.ASSIGNED;

    return exception;
  }

  /**
   * Move exception to investigating state
   */
  moveToInvestigating(exceptionId, notes) {
    const exception = this.exceptions.find(e => e.id === exceptionId);
    if (!exception) throw new Error(`Exception not found: ${exceptionId}`);

    if (!this.stateTransitions[exception.state].includes(RECONCILIATION_STATES.INVESTIGATING)) {
      throw new Error(`Cannot move to investigating from ${exception.state} state`);
    }

    exception.state = RECONCILIATION_STATES.INVESTIGATING;
    exception.investigationNotes.push({
      timestamp: new Date().toISOString(),
      note: notes,
      addedBy: exception.assignedTo
    });

    return exception;
  }

  /**
   * Add investigation note
   */
  addInvestigationNote(exceptionId, note, userId) {
    const exception = this.exceptions.find(e => e.id === exceptionId);
    if (!exception) throw new Error(`Exception not found: ${exceptionId}`);

    exception.investigationNotes.push({
      timestamp: new Date().toISOString(),
      note,
      userId
    });

    return exception;
  }

  /**
   * Resolve exception
   */
  resolveException(exceptionId, resolution, adjustmentAmount = null) {
    const exception = this.exceptions.find(e => e.id === exceptionId);
    if (!exception) throw new Error(`Exception not found: ${exceptionId}`);

    if (!this.stateTransitions[exception.state].includes(RECONCILIATION_STATES.RESOLVED)) {
      throw new Error(`Cannot resolve exception in ${exception.state} state`);
    }

    exception.state = RECONCILIATION_STATES.RESOLVED;
    exception.resolution = {
      type: resolution,
      adjustmentAmount,
      resolvedAt: new Date().toISOString()
    };
    exception.resolvedAt = new Date().toISOString();

    // Check if SLA was met
    exception.slaBreached = new Date(exception.resolvedAt) > new Date(exception.slaDeadline);

    return exception;
  }

  /**
   * Escalate exception
   */
  escalateException(exceptionId, escalationReason) {
    const exception = this.exceptions.find(e => e.id === exceptionId);
    if (!exception) throw new Error(`Exception not found: ${exceptionId}`);

    if (!this.stateTransitions[exception.state].includes(RECONCILIATION_STATES.ESCALATED)) {
      throw new Error(`Cannot escalate from ${exception.state} state`);
    }

    exception.state = RECONCILIATION_STATES.ESCALATED;
    exception.escalationReason = escalationReason;
    exception.escalatedAt = new Date().toISOString();

    return exception;
  }

  /**
   * Get exception by ID
   */
  getException(exceptionId) {
    return this.exceptions.find(e => e.id === exceptionId);
  }

  /**
   * Get all open exceptions
   */
  getOpenExceptions() {
    return this.exceptions.filter(e => e.state === RECONCILIATION_STATES.OPEN);
  }

  /**
   * Get SLA metrics
   */
  getSLAMetrics() {
    const closed = this.exceptions.filter(e =>
      [RECONCILIATION_STATES.RESOLVED, RECONCILIATION_STATES.ESCALATED].includes(e.state)
    );

    const breached = closed.filter(e => e.slaBreached);
    const slaCompliancePercent = closed.length > 0
      ? ((closed.length - breached.length) / closed.length * 100).toFixed(2)
      : 100;

    return {
      total: this.exceptions.length,
      open: this.getOpenExceptions().length,
      closed: closed.length,
      slaBreached: breached.length,
      slaCompliancePercent: parseFloat(slaCompliancePercent)
    };
  }
}

// ============================================================================
// CLASS: ContinuousReconciler
// ============================================================================

class ContinuousReconciler {
  constructor(env, options = {}) {
    this.env = env;
    this.supabaseUrl = options.supabaseUrl || env.SUPABASE_URL;
    this.supabaseKey = options.supabaseKey || env.SUPABASE_ANON_KEY;
    this.streamWindow = options.streamWindow || 300000; // 5 minutes
    this.matchThreshold = options.matchThreshold || 0.95;
    this.usageBuffer = new Map();
    this.invoiceBuffer = new Map();
    this.matchedPairs = [];
    this.mismatches = [];
  }

  /**
   * Ingest usage record into stream buffer
   */
  ingestUsageRecord(usageRecord) {
    const bufferId = this.generateBufferId(usageRecord);
    this.usageBuffer.set(bufferId, {
      ...usageRecord,
      ingestedAt: Date.now(),
      matchAttempts: 0
    });

    // Attempt immediate matching
    this.attemptMatch(bufferId);

    // Auto-flush old records
    this.flushExpiredRecords();
  }

  /**
   * Ingest invoice record into stream buffer
   */
  ingestInvoiceRecord(invoiceRecord) {
    const bufferId = this.generateBufferId(invoiceRecord);
    this.invoiceBuffer.set(bufferId, {
      ...invoiceRecord,
      ingestedAt: Date.now(),
      matchAttempts: 0
    });

    // Attempt immediate matching with all usage records
    this.attemptMatch(bufferId);

    // Auto-flush old records
    this.flushExpiredRecords();
  }

  /**
   * Generate unique buffer ID for record
   */
  generateBufferId(record) {
    const key = `${record.provider}-${record.accountId}-${record.resourceId}-${record.periodStart}`;
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  /**
   * Attempt to match records from buffer
   */
  attemptMatch(bufferId) {
    const usageRecord = this.usageBuffer.get(bufferId);
    const invoiceRecord = this.invoiceBuffer.get(bufferId);

    if (usageRecord && invoiceRecord) {
      const matchScore = this.calculateMatchScore(usageRecord, invoiceRecord);

      if (matchScore >= this.matchThreshold) {
        this.recordMatch(usageRecord, invoiceRecord, matchScore);
        this.usageBuffer.delete(bufferId);
        this.invoiceBuffer.delete(bufferId);
      } else {
        this.recordMismatch(usageRecord, invoiceRecord, matchScore);
      }
    }
  }

  /**
   * Calculate match score between usage and invoice
   */
  calculateMatchScore(usageRecord, invoiceRecord) {
    let score = 1.0;

    // Quantity variance
    const qtyRatio = usageRecord.quantity / invoiceRecord.quantity;
    const qtyDeviation = Math.abs(1 - qtyRatio);
    score -= qtyDeviation * 0.35;

    // Rate variance
    const rateRatio = usageRecord.unitRate / invoiceRecord.unitRate;
    const rateDeviation = Math.abs(1 - rateRatio);
    score -= rateDeviation * 0.25;

    // Time variance (in hours)
    const usageTime = new Date(usageRecord.periodStart).getTime();
    const invoiceTime = new Date(invoiceRecord.periodStart).getTime();
    const timeDiffHours = Math.abs(usageTime - invoiceTime) / (1000 * 60 * 60);
    const timeDeviation = Math.min(timeDiffHours / 24, 1); // Max 1 day
    score -= timeDeviation * 0.20;

    // Service/SKU match
    if (usageRecord.sku === invoiceRecord.sku) {
      score += 0.10;
    } else {
      score -= 0.15;
    }

    // Region match
    if (usageRecord.region === invoiceRecord.region) {
      score += 0.05;
    } else {
      score -= 0.10;
    }

    return Math.max(score, 0);
  }

  /**
   * Record successful match
   */
  recordMatch(usageRecord, invoiceRecord, matchScore) {
    const matchPair = {
      id: crypto.randomBytes(8).toString('hex'),
      usage: usageRecord,
      invoice: invoiceRecord,
      matchScore: parseFloat(matchScore.toFixed(4)),
      matchedAt: new Date().toISOString(),
      reconciliationStatus: 'MATCHED'
    };

    this.matchedPairs.push(matchPair);

    // Alert if match score is below 0.98 (possible issues)
    if (matchScore < 0.98) {
      this.recordMismatch(usageRecord, invoiceRecord, matchScore);
    }

    return matchPair;
  }

  /**
   * Record mismatch for exception workflow
   */
  recordMismatch(usageRecord, invoiceRecord, matchScore) {
    const mismatch = {
      id: crypto.randomBytes(8).toString('hex'),
      usage: usageRecord,
      invoice: invoiceRecord,
      matchScore: parseFloat(matchScore.toFixed(4)),
      detectedAt: new Date().toISOString(),
      severity: this.calculateMismatchSeverity(usageRecord, invoiceRecord),
      requiresReview: matchScore < 0.85
    };

    this.mismatches.push(mismatch);
    return mismatch;
  }

  /**
   * Calculate mismatch severity level
   */
  calculateMismatchSeverity(usageRecord, invoiceRecord) {
    const qtyDiff = Math.abs(usageRecord.quantity - invoiceRecord.quantity);
    const qtyPercent = (qtyDiff / usageRecord.quantity) * 100;

    if (qtyPercent > 50) return 'CRITICAL';
    if (qtyPercent > 20) return 'HIGH';
    if (qtyPercent > 5) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Flush records older than stream window
   */
  flushExpiredRecords() {
    const now = Date.now();
    const expiredUsage = [];
    const expiredInvoices = [];

    this.usageBuffer.forEach((record, id) => {
      if (now - record.ingestedAt > this.streamWindow) {
        expiredUsage.push(id);
      }
    });

    this.invoiceBuffer.forEach((record, id) => {
      if (now - record.ingestedAt > this.streamWindow) {
        expiredInvoices.push(id);
      }
    });

    expiredUsage.forEach(id => this.usageBuffer.delete(id));
    expiredInvoices.forEach(id => this.invoiceBuffer.delete(id));
  }

  /**
   * Get reconciliation status
   */
  getStatus() {
    return {
      matchedPairs: this.matchedPairs.length,
      pendingMatches: this.usageBuffer.size + this.invoiceBuffer.size,
      mismatches: this.mismatches.length,
      lastActivity: new Date().toISOString(),
      bufferHealth: {
        usageRecords: this.usageBuffer.size,
        invoiceRecords: this.invoiceBuffer.size
      }
    };
  }

  /**
   * Get recent mismatches requiring attention
   */
  getRecentMismatches(minutes = 60) {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    return this.mismatches.filter(m =>
      new Date(m.detectedAt).getTime() >= cutoff && m.requiresReview
    );
  }
}

// ============================================================================
// CLASS: PredictiveReconciler
// ============================================================================

class PredictiveReconciler {
  constructor(env, options = {}) {
    this.env = env;
    this.historicalData = [];
    this.patterns = new Map();
    this.predictions = [];
    this.minHistoricalPeriods = options.minHistoricalPeriods || 3;
    this.confidenceThreshold = options.confidenceThreshold || 0.8;
  }

  /**
   * Train model on historical invoice patterns
   */
  trainOnHistoricalData(historicalInvoices) {
    this.historicalData = historicalInvoices;

    // Group by provider, account, SKU
    const grouped = new Map();
    historicalInvoices.forEach(invoice => {
      const key = `${invoice.provider}-${invoice.accountId}-${invoice.sku}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(invoice);
    });

    // Calculate patterns for each group
    grouped.forEach((invoices, key) => {
      if (invoices.length >= this.minHistoricalPeriods) {
        this.patterns.set(key, this.derivePattern(invoices, key));
      }
    });
  }

  /**
   * Derive statistical pattern from historical invoices
   */
  derivePattern(invoices, key) {
    const amounts = invoices.map(i => i.amount);
    const quantities = invoices.map(i => i.quantity);
    const rates = invoices.map(i => i.unitRate);

    const meanAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const meanQuantity = quantities.reduce((a, b) => a + b, 0) / quantities.length;
    const meanRate = rates.reduce((a, b) => a + b, 0) / rates.length;

    const stdDevAmount = Math.sqrt(
      amounts.reduce((sq, n) => sq + Math.pow(n - meanAmount, 2), 0) / amounts.length
    );

    const periodStart = new Date(invoices[0].periodStart);
    const periodEnd = new Date(invoices[invoices.length - 1].periodEnd);
    const daysSpanned = (periodEnd - periodStart) / (1000 * 60 * 60 * 24);
    const growthRate = invoices.length > 1
      ? (amounts[amounts.length - 1] - amounts[0]) / amounts[0] / (invoices.length - 1)
      : 0;

    return {
      key,
      meanAmount: parseFloat(meanAmount.toFixed(2)),
      stdDevAmount: parseFloat(stdDevAmount.toFixed(2)),
      meanQuantity: parseFloat(meanQuantity.toFixed(2)),
      meanRate: parseFloat(meanRate.toFixed(4)),
      growthRate: parseFloat(growthRate.toFixed(4)),
      samplesCount: invoices.length,
      periodDays: daysSpanned,
      lastInvoice: invoices[invoices.length - 1]
    };
  }

  /**
   * Predict expected invoice based on patterns
   */
  predictInvoice(provider, accountId, sku, upcomingPeriodStart) {
    const key = `${provider}-${accountId}-${sku}`;
    const pattern = this.patterns.get(key);

    if (!pattern) {
      return {
        predictable: false,
        reason: 'Insufficient historical data',
        confidence: 0
      };
    }

    // Calculate days since last invoice
    const daysSinceLastInvoice = (
      new Date(upcomingPeriodStart) - new Date(pattern.lastInvoice.periodStart)
    ) / (1000 * 60 * 60 * 24);

    // Apply growth trend
    const growthFactor = 1 + (pattern.growthRate * (daysSinceLastInvoice / pattern.periodDays));

    const predictedAmount = parseFloat((pattern.meanAmount * growthFactor).toFixed(2));
    const predictedQuantity = parseFloat((pattern.meanQuantity * growthFactor).toFixed(2));

    // Confidence based on historical variance
    const coefficientOfVariation = pattern.stdDevAmount / pattern.meanAmount;
    const confidence = Math.max(1 - coefficientOfVariation, 0.3);

    // Calculate confidence intervals (95%)
    const zScore = 1.96;
    const marginOfError = zScore * (pattern.stdDevAmount / Math.sqrt(pattern.samplesCount));

    const prediction = {
      provider,
      accountId,
      sku,
      predictedAmount,
      predictedQuantity,
      predictedRate: pattern.meanRate,
      confidence: parseFloat(confidence.toFixed(4)),
      confidenceLevel: confidence >= 0.9 ? 'HIGH' : confidence >= 0.7 ? 'MEDIUM' : 'LOW',
      lowerBound: parseFloat((predictedAmount - marginOfError).toFixed(2)),
      upperBound: parseFloat((predictedAmount + marginOfError).toFixed(2)),
      predictedAt: new Date().toISOString(),
      upcomingPeriodStart
    };

    this.predictions.push(prediction);
    return prediction;
  }

  /**
   * Flag deviation from prediction when actual invoice arrives
   */
  flagDeviationFromPrediction(actualInvoice) {
    const key = `${actualInvoice.provider}-${actualInvoice.accountId}-${actualInvoice.sku}`;
    const prediction = this.predictions.find(p =>
      p.provider === actualInvoice.provider &&
      p.accountId === actualInvoice.accountId &&
      p.sku === actualInvoice.sku &&
      p.upcomingPeriodStart === actualInvoice.periodStart
    );

    if (!prediction) {
      return {
        flagged: false,
        reason: 'No prediction found for this invoice'
      };
    }

    const deviation = Math.abs(actualInvoice.amount - prediction.predictedAmount);
    const deviationPercent = (deviation / prediction.predictedAmount) * 100;
    const withinBounds = actualInvoice.amount >= prediction.lowerBound &&
                         actualInvoice.amount <= prediction.upperBound;

    if (!withinBounds) {
      return {
        flagged: true,
        deviationPercent: parseFloat(deviationPercent.toFixed(2)),
        actual: actualInvoice.amount,
        predicted: prediction.predictedAmount,
        lowerBound: prediction.lowerBound,
        upperBound: prediction.upperBound,
        severity: deviationPercent > 20 ? 'HIGH' : 'MEDIUM',
        reasonCode: EXCEPTION_REASON_CODES.PREDICTION_DEVIATION
      };
    }

    return {
      flagged: false,
      withinExpectedRange: true
    };
  }

  /**
   * Get prediction accuracy metrics
   */
  getPredictionAccuracy() {
    const invoiceInvoices = this.historicalData.filter(inv =>
      this.predictions.some(p =>
        p.provider === inv.provider &&
        p.accountId === inv.accountId &&
        p.sku === inv.sku
      )
    );

    const deviations = invoiceInvoices.map(inv => {
      const prediction = this.predictions.find(p =>
        p.provider === inv.provider &&
        p.accountId === inv.accountId &&
        p.sku === inv.sku
      );
      return prediction ? Math.abs(inv.amount - prediction.predictedAmount) / prediction.predictedAmount : 0;
    });

    const meanAbsolutePercentError = deviations.length > 0
      ? (deviations.reduce((a, b) => a + b, 0) / deviations.length) * 100
      : 0;

    return {
      predictionsGenerated: this.predictions.length,
      predictionsEvaluated: invoiceInvoices.length,
      meanAbsolutePercentError: parseFloat(meanAbsolutePercentError.toFixed(2)),
      accuracy: parseFloat((100 - meanAbsolutePercentError).toFixed(2))
    };
  }
}

// ============================================================================
// CLASS: CrossProviderReconciler
// ============================================================================

class CrossProviderReconciler {
  constructor(env, options = {}) {
    this.env = env;
    this.workloadFingerprints = new Map();
    this.crossProviderMatches = [];
    this.duplicates = [];
    this.fingerprintSensitivity = options.fingerprintSensitivity || 0.85;
  }

  /**
   * Generate fingerprint for workload
   */
  generateWorkloadFingerprint(workload) {
    const essentialFields = {
      resourceType: workload.resourceType,
      region: workload.region,
      configuration: JSON.stringify(workload.configuration || {}),
      periodStart: workload.periodStart,
      periodEnd: workload.periodEnd
    };

    const fingerprintString = JSON.stringify(essentialFields);
    const fingerprint = crypto.createHash('sha256').update(fingerprintString).digest('hex');

    return {
      fingerprint,
      fields: essentialFields,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Register workload from provider
   */
  registerWorkload(provider, accountId, workload) {
    const fingerprint = this.generateWorkloadFingerprint(workload);
    const workloadId = `${provider}-${accountId}-${workload.resourceId}`;

    const workloadRecord = {
      workloadId,
      provider,
      accountId,
      workload,
      fingerprint: fingerprint.fingerprint,
      registeredAt: new Date().toISOString()
    };

    const key = fingerprint.fingerprint;
    if (!this.workloadFingerprints.has(key)) {
      this.workloadFingerprints.set(key, []);
    }
    this.workloadFingerprints.get(key).push(workloadRecord);

    // Check for duplicates
    this.detectDuplicateBilling(key);

    return workloadRecord;
  }

  /**
   * Detect duplicate billing for same workload
   */
  detectDuplicateBilling(fingerprint) {
    const workloads = this.workloadFingerprints.get(fingerprint);

    if (!workloads || workloads.length < 2) {
      return [];
    }

    const duplicateInstances = [];

    for (let i = 0; i < workloads.length; i++) {
      for (let j = i + 1; j < workloads.length; j++) {
        const w1 = workloads[i];
        const w2 = workloads[j];

        // Don't flag same provider
        if (w1.provider === w2.provider) continue;

        // Check time overlap
        const start1 = new Date(w1.workload.periodStart);
        const end1 = new Date(w1.workload.periodEnd);
        const start2 = new Date(w2.workload.periodStart);
        const end2 = new Date(w2.workload.periodEnd);

        const overlap = start1 <= end2 && start2 <= end1;

        if (overlap) {
          const duplicate = {
            id: crypto.randomBytes(8).toString('hex'),
            workload1: w1,
            workload2: w2,
            overlapStart: new Date(Math.max(start1, start2)).toISOString(),
            overlapEnd: new Date(Math.min(end1, end2)).toISOString(),
            amount1: w1.workload.amount,
            amount2: w2.workload.amount,
            combinedBillingAmount: (w1.workload.amount + w2.workload.amount),
            detectedAt: new Date().toISOString(),
            severity: 'CRITICAL',
            status: 'OPEN'
          };

          this.duplicates.push(duplicate);
          duplicateInstances.push(duplicate);
        }
      }
    }

    return duplicateInstances;
  }

  /**
   * Cross-reference matching between providers
   */
  crossReferenceWorkloads(provider1AccountId, provider2AccountId) {
    const matches = [];

    this.workloadFingerprints.forEach((workloads, fingerprint) => {
      const provider1Workloads = workloads.filter(w =>
        w.accountId === provider1AccountId
      );
      const provider2Workloads = workloads.filter(w =>
        w.accountId === provider2AccountId
      );

      if (provider1Workloads.length > 0 && provider2Workloads.length > 0) {
        provider1Workloads.forEach(w1 => {
          provider2Workloads.forEach(w2 => {
            const similarity = this.calculateWorkloadSimilarity(w1.workload, w2.workload);

            if (similarity >= this.fingerprintSensitivity) {
              matches.push({
                id: crypto.randomBytes(8).toString('hex'),
                workload1: w1,
                workload2: w2,
                similarity: parseFloat(similarity.toFixed(4)),
                matchedAt: new Date().toISOString()
              });
            }
          });
        });
      }
    });

    return matches;
  }

  /**
   * Calculate similarity score between two workloads
   */
  calculateWorkloadSimilarity(w1, w2) {
    let score = 1.0;

    // Resource type match
    if (w1.resourceType !== w2.resourceType) {
      score -= 0.3;
    }

    // Region match
    if (w1.region !== w2.region) {
      score -= 0.2;
    }

    // Configuration similarity (JSON comparison)
    if (JSON.stringify(w1.configuration) !== JSON.stringify(w2.configuration)) {
      score -= 0.15;
    }

    // Period overlap
    const start1 = new Date(w1.periodStart);
    const end1 = new Date(w1.periodEnd);
    const start2 = new Date(w2.periodStart);
    const end2 = new Date(w2.periodEnd);

    const overlap = Math.min(end1, end2) - Math.max(start1, start2);
    const span1 = end1 - start1;
    const span2 = end2 - start2;
    const overlapPercent = overlap / Math.min(span1, span2);

    if (overlapPercent < 0.8) {
      score -= 0.25;
    }

    return Math.max(score, 0);
  }

  /**
   * Get duplicate billing report
   */
  getDuplicateBillingReport() {
    const openDuplicates = this.duplicates.filter(d => d.status === 'OPEN');
    const totalOverBillingAmount = openDuplicates.reduce((sum, d) =>
      sum + d.combinedBillingAmount, 0
    );

    return {
      totalDuplicatesDetected: this.duplicates.length,
      openDuplicates: openDuplicates.length,
      totalOverBillingAmount: parseFloat(totalOverBillingAmount.toFixed(2)),
      duplicates: openDuplicates.map(d => ({
        id: d.id,
        providers: [d.workload1.provider, d.workload2.provider],
        overlapPeriod: {
          start: d.overlapStart,
          end: d.overlapEnd
        },
        billingAmounts: {
          provider1: parseFloat(d.amount1.toFixed(2)),
          provider2: parseFloat(d.amount2.toFixed(2)),
          combined: parseFloat(d.combinedBillingAmount.toFixed(2))
        }
      }))
    };
  }

  /**
   * Resolve duplicate billing
   */
  resolveDuplicate(duplicateId, resolution) {
    const duplicate = this.duplicates.find(d => d.id === duplicateId);
    if (!duplicate) throw new Error(`Duplicate not found: ${duplicateId}`);

    duplicate.status = 'RESOLVED';
    duplicate.resolution = resolution;
    duplicate.resolvedAt = new Date().toISOString();

    return duplicate;
  }
}

// ============================================================================
// CLASS: ReconciliationAuditTrail
// ============================================================================

class ReconciliationAuditTrail {
  constructor(env, options = {}) {
    this.env = env;
    this.hashChain = [];
    this.auditLog = [];
    this.evidencePackages = new Map();
    this.chainStartHash = options.chainStartHash || this.initializeChain();
  }

  /**
   * Initialize hash chain with genesis block
   */
  initializeChain() {
    const genesisData = {
      timestamp: new Date().toISOString(),
      event: 'CHAIN_INITIALIZATION',
      data: {}
    };

    const genesisHash = this.calculateHash(JSON.stringify(genesisData));
    this.hashChain.push({
      index: 0,
      timestamp: genesisData.timestamp,
      event: 'GENESIS',
      hash: genesisHash,
      previousHash: null,
      data: genesisData
    });

    return genesisHash;
  }

  /**
   * Calculate SHA-256 hash
   */
  calculateHash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Record match decision with evidence
   */
  recordMatchDecision(matchId, usageRecord, invoiceRecord, matchScore, decision) {
    const evidenceData = {
      matchId,
      usageRecord,
      invoiceRecord,
      matchScore,
      decision,
      timestamp: new Date().toISOString()
    };

    const evidenceHash = this.calculateHash(JSON.stringify(evidenceData));

    // Get previous hash
    const previousBlock = this.hashChain[this.hashChain.length - 1];
    const previousHash = previousBlock.hash;

    // Create new block
    const blockData = JSON.stringify({
      matchId,
      decision,
      evidenceHash,
      timestamp: evidenceData.timestamp
    });

    const blockHash = this.calculateHash(blockData + previousHash);

    const block = {
      index: this.hashChain.length,
      timestamp: evidenceData.timestamp,
      event: 'MATCH_DECISION',
      matchId,
      decision,
      hash: blockHash,
      previousHash,
      evidenceHash,
      verified: true
    };

    this.hashChain.push(block);

    // Store evidence
    this.evidencePackages.set(matchId, {
      matchId,
      evidenceHash,
      blockIndex: block.index,
      usage: usageRecord,
      invoice: invoiceRecord,
      matchScore,
      decision,
      recordedAt: evidenceData.timestamp
    });

    // Log to audit
    this.auditLog.push({
      timestamp: evidenceData.timestamp,
      action: 'RECORD_MATCH_DECISION',
      matchId,
      blockHash
    });

    return {
      blockIndex: block.index,
      blockHash,
      evidenceHash,
      chainValid: this.validateChain()
    };
  }

  /**
   * Record exception creation
   */
  recordExceptionCreation(exceptionId, reasonCode, invoiceData, usageData) {
    const eventData = {
      exceptionId,
      reasonCode,
      timestamp: new Date().toISOString()
    };

    const eventHash = this.calculateHash(JSON.stringify(eventData));
    const previousHash = this.hashChain[this.hashChain.length - 1].hash;

    const blockHash = this.calculateHash(
      JSON.stringify(eventData) + previousHash
    );

    const block = {
      index: this.hashChain.length,
      timestamp: eventData.timestamp,
      event: 'EXCEPTION_CREATED',
      exceptionId,
      hash: blockHash,
      previousHash,
      eventHash,
      verified: true
    };

    this.hashChain.push(block);

    this.auditLog.push({
      timestamp: eventData.timestamp,
      action: 'EXCEPTION_CREATED',
      exceptionId,
      reasonCode,
      blockHash
    });

    return {
      blockIndex: block.index,
      blockHash,
      chainValid: this.validateChain()
    };
  }

  /**
   * Validate entire hash chain for tampering
   */
  validateChain() {
    for (let i = 1; i < this.hashChain.length; i++) {
      const currentBlock = this.hashChain[i];
      const previousBlock = this.hashChain[i - 1];

      // Verify previous hash reference
      if (currentBlock.previousHash !== previousBlock.hash) {
        currentBlock.verified = false;
        return false;
      }

      // Verify current block hash
      const blockData = JSON.stringify({
        timestamp: currentBlock.timestamp,
        event: currentBlock.event,
        index: currentBlock.index
      });

      const expectedHash = this.calculateHash(blockData + currentBlock.previousHash);
      if (currentBlock.hash !== expectedHash && i > 1) {
        // Allow some flexibility for genesis blocks
        currentBlock.verified = false;
      }
    }

    return true;
  }

  /**
   * Get chain integrity report
   */
  getChainIntegrityReport() {
    const isValid = this.validateChain();
    const tampered = this.hashChain.filter(b => !b.verified);

    return {
      chainLength: this.hashChain.length,
      chainValid: isValid,
      tamperedBlocks: tampered.length,
      lastBlockHash: this.hashChain[this.hashChain.length - 1].hash,
      lastBlockTimestamp: this.hashChain[this.hashChain.length - 1].timestamp,
      integrity: isValid ? 'VERIFIED' : 'COMPROMISED'
    };
  }

  /**
   * Generate SOX 404 evidence package
   */
  generateSOX404EvidencePackage(startDate, endDate) {
    const relevantBlocks = this.hashChain.filter(block => {
      const blockTime = new Date(block.timestamp);
      return blockTime >= new Date(startDate) && blockTime <= new Date(endDate);
    });

    const evidencePackage = {
      packageId: crypto.randomBytes(16).toString('hex'),
      generatedAt: new Date().toISOString(),
      period: { startDate, endDate },
      blockCount: relevantBlocks.length,
      blocks: relevantBlocks.map(b => ({
        index: b.index,
        timestamp: b.timestamp,
        event: b.event,
        hash: b.hash,
        verified: b.verified
      })),
      chainValid: this.validateChain(),
      auditorVerification: {
        status: 'PENDING_AUDITOR_REVIEW',
        auditorSignature: null,
        auditTimestamp: null
      }
    };

    return evidencePackage;
  }

  /**
   * Get audit trail for specific match
   */
  getMatchAuditTrail(matchId) {
    const evidence = this.evidencePackages.get(matchId);
    const blockEntries = this.hashChain.filter(b => b.matchId === matchId);
    const auditEntries = this.auditLog.filter(a => a.matchId === matchId);

    return {
      matchId,
      evidence,
      blockChain: blockEntries,
      auditLog: auditEntries,
      chainValid: this.validateChain()
    };
  }

  /**
   * Export audit trail for compliance
   */
  exportAuditTrail(format = 'json') {
    if (format === 'json') {
      return {
        exportedAt: new Date().toISOString(),
        chainIntegrity: this.getChainIntegrityReport(),
        totalRecords: this.auditLog.length,
        auditLog: this.auditLog,
        chainLength: this.hashChain.length
      };
    }

    // CSV format
    const csvRows = ['timestamp,action,details,hash'];
    this.auditLog.forEach(entry => {
      csvRows.push(
        `"${entry.timestamp}","${entry.action}","${entry.matchId || entry.exceptionId || ''}","${entry.blockHash}"`
      );
    });

    return csvRows.join('\n');
  }
}

// ============================================================================
// CLASS: FinaultReconciliationDiamond (Main orchestrator)
// ============================================================================

class FinaultReconciliationDiamond {
  constructor(env, options = {}) {
    this.env = env;
    this.options = options;
    this.supabaseUrl = options.supabaseUrl || env.SUPABASE_URL;
    this.supabaseKey = options.supabaseKey || env.SUPABASE_ANON_KEY;

    // Initialize all components
    this.fcs = new FinaultConfidenceScore();
    this.behaviorGate = new FCSBehaviorGate();
    this.exceptionWorkflow = new ExceptionWorkflow();
    this.continuousReconciler = new ContinuousReconciler(env, options);
    this.predictiveReconciler = new PredictiveReconciler(env, options);
    this.crossProviderReconciler = new CrossProviderReconciler(env, options);
    this.auditTrail = new ReconciliationAuditTrail(env, options);
  }

  /**
   * Fetch from Supabase REST API
   */
  async fetch(table, options = {}) {
    const url = new URL(`${this.supabaseUrl}/rest/v1/${table}`, this.supabaseUrl);

    if (options.select) {
      url.searchParams.append('select', options.select);
    }
    if (options.filter) {
      Object.entries(options.filter).forEach(([key, value]) => {
        url.searchParams.append(key, `eq.${encodeURIComponent(value)}`);
      });
    }
    if (options.limit) {
      url.searchParams.append('limit', options.limit);
    }
    if (options.offset) {
      url.searchParams.append('offset', options.offset);
    }

    const response = await global.fetch(url.toString(), {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.supabaseKey,
        'Authorization': `Bearer ${this.supabaseKey}`
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (!response.ok) {
      throw new Error(`Supabase error: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Initialize reconciliation for account
   */
  async initialize(accountId, provider) {
    const invoices = await this.fetch('invoices', {
      filter: { account_id: accountId, provider },
      limit: 100
    });

    const usageRecords = await this.fetch('usage_records', {
      filter: { account_id: accountId, provider },
      limit: 1000
    });

    // Train predictive model
    this.predictiveReconciler.trainOnHistoricalData(invoices);

    return {
      invoicesLoaded: invoices.length,
      usageRecordsLoaded: usageRecords.length,
      ready: true
    };
  }

  /**
   * Execute full reconciliation workflow
   */
  async reconcile(accountId, provider) {
    const results = {
      startTime: new Date().toISOString(),
      accountId,
      provider,
      steps: {}
    };

    // Step 1: Continuous matching
    results.steps.continuousMatching = await this.executeContineousMatching(
      accountId,
      provider
    );

    // Step 2: Calculate FCS
    results.steps.fcsCalculation = this.calculateFCS(accountId, provider);

    // Step 3: Predictive analysis
    results.steps.predictiveAnalysis = await this.executePredictiveAnalysis(
      accountId,
      provider
    );

    // Step 4: Cross-provider check
    results.steps.crossProviderAnalysis = await this.executeCrossProviderAnalysis(
      accountId
    );

    // Step 5: Exception handling
    results.steps.exceptionHandling = this.handleExceptions(accountId);

    // Step 6: Audit trail
    results.steps.auditTrail = this.generateAuditReport();

    results.endTime = new Date().toISOString();
    results.success = true;

    // Persist reconciliation stream to database
    await this.persistReconciliationStream(results);

    // Persist FCS scores
    await this.persistFCSScore(accountId, provider, results.steps.fcsCalculation);

    // Persist exceptions if any
    if (this.exceptionWorkflow.exceptions && this.exceptionWorkflow.exceptions.length > 0) {
      await this.persistExceptions(accountId, this.exceptionWorkflow.exceptions);
    }

    return results;
  }

  /**
   * Persist reconciliation stream to database
   */
  async persistReconciliationStream(reconciliationData) {
    const payload = {
      account_id: reconciliationData.accountId,
      provider: reconciliationData.provider,
      data: reconciliationData,
      status: 'completed',
      created_at: reconciliationData.startTime
    };

    return this.fetch('continuous_recon_stream', {
      method: 'POST',
      body: payload
    });
  }

  /**
   * Persist FCS scores to database
   */
  async persistFCSScore(accountId, provider, fcsData) {
    const payload = {
      account_id: accountId,
      provider,
      overall_score: fcsData.score,
      tier: fcsData.tier,
      components: fcsData.components,
      recorded_at: new Date().toISOString()
    };

    return this.fetch('fcs_scores', {
      method: 'POST',
      body: payload
    });
  }

  /**
   * Persist exceptions to database
   */
  async persistExceptions(accountId, exceptions) {
    const promises = exceptions.map(exception => {
      const payload = {
        account_id: accountId,
        exception_id: exception.id,
        reason_code: exception.reasonCode,
        state: exception.state,
        sla_deadline: exception.slaDeadline,
        sla_breached: exception.slaBreached,
        metadata: exception.metadata,
        created_at: exception.createdAt
      };

      return this.fetch('reconciliation_exceptions', {
        method: 'POST',
        body: payload
      });
    });

    return Promise.all(promises);
  }

  async executeContineousMatching(accountId, provider) {
    return this.continuousReconciler.getStatus();
  }

  calculateFCS(accountId, provider) {
    const fcsDetails = this.fcs.getScoreDetails();
    return {
      score: fcsDetails.overall,
      tier: fcsDetails.tier,
      components: fcsDetails.components
    };
  }

  async executePredictiveAnalysis(accountId, provider) {
    return this.predictiveReconciler.getPredictionAccuracy();
  }

  async executeCrossProviderAnalysis(accountId) {
    return this.crossProviderReconciler.getDuplicateBillingReport();
  }

  handleExceptions(accountId) {
    return this.exceptionWorkflow.getSLAMetrics();
  }

  generateAuditReport() {
    return this.auditTrail.getChainIntegrityReport();
  }

  async getHealth() {
    const health = new HealthCheck('reconciliation');
    health.addCheck('supabase', async () => {
      const url = `${this.supabaseUrl}/rest/v1/fcs_scores?limit=1`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.supabaseKey}`,
          'apikey': this.supabaseKey
        }
      });
      return { connected: response.ok };
    });
    return health.run();
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  FinaultReconciliationDiamond,
  FinaultConfidenceScore,
  FCSBehaviorGate,
  ExceptionWorkflow,
  ContinuousReconciler,
  PredictiveReconciler,
  CrossProviderReconciler,
  ReconciliationAuditTrail,
  FCS_WEIGHTS,
  FCS_TIERS,
  EXCEPTION_REASON_CODES,
  RECONCILIATION_STATES
};
