/**
 * Finault Policy Engine
 * Enterprise cost allocation system with hierarchical support,
 * rule versioning, approval workflows, and comprehensive audit trails
 */

const crypto = require('crypto');

/**
 * AllocationRule - Base class for all rule types
 */
class AllocationRule {
  constructor(config) {
    this.id = config.id || this.generateId();
    this.type = config.type; // exact, prefix, suffix, regex, model-based, percentage, time-based, conditional
    this.name = config.name;
    this.description = config.description || '';
    this.costCenter = config.costCenter; // Target cost center
    this.priority = config.priority || 50; // 0-100, higher = processed first
    this.enabled = config.enabled !== false;
    this.parentRule = config.parentRule || null; // For hierarchy support
    this.conditions = config.conditions || []; // Pre-conditions to match
    this.actions = config.actions || []; // Post-allocation actions
    this.createdAt = config.createdAt || new Date();
    this.createdBy = config.createdBy;
    this.version = config.version || 1;
    this.versionHistory = config.versionHistory || [];
    this.status = config.status || 'draft'; // draft, pending-approval, approved, rejected, archived
    this.approvalChain = config.approvalChain || [];
    this.metadata = config.metadata || {};

    // Type-specific configurations
    this.pattern = config.pattern; // For prefix, suffix, regex
    this.exactMatch = config.exactMatch; // For exact match
    this.percentage = config.percentage; // For percentage rules
    this.timeRange = config.timeRange; // For time-based rules
    this.modelWeights = config.modelWeights; // For model-based rules
    this.conditionalLogic = config.conditionalLogic; // For conditional rules
  }

  generateId() {
    return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if this rule matches a record
   */
  matches(record) {
    if (!this.enabled) return { matched: false, reason: 'Rule disabled' };

    // Check pre-conditions
    if (!this.checkConditions(record)) {
      return { matched: false, reason: 'Conditions not met' };
    }

    const matchResult = this.typeSpecificMatch(record);
    return matchResult;
  }

  /**
   * Check if all conditions are satisfied
   */
  checkConditions(record) {
    if (!this.conditions || this.conditions.length === 0) {
      return true;
    }

    return this.conditions.every(condition => {
      const recordValue = this.getNestedValue(record, condition.field);
      return this.evaluateCondition(recordValue, condition.operator, condition.value);
    });
  }

  /**
   * Evaluate a single condition
   */
  evaluateCondition(value, operator, conditionValue) {
    switch (operator) {
      case 'equals':
        return value === conditionValue;
      case 'contains':
        return String(value).includes(conditionValue);
      case 'startsWith':
        return String(value).startsWith(conditionValue);
      case 'endsWith':
        return String(value).endsWith(conditionValue);
      case 'gt':
        return Number(value) > Number(conditionValue);
      case 'lt':
        return Number(value) < Number(conditionValue);
      case 'gte':
        return Number(value) >= Number(conditionValue);
      case 'lte':
        return Number(value) <= Number(conditionValue);
      case 'in':
        return Array.isArray(conditionValue) && conditionValue.includes(value);
      case 'regex':
        return new RegExp(conditionValue).test(String(value));
      default:
        return true;
    }
  }

  /**
   * Get nested property from object using dot notation
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, prop) => current?.[prop], obj);
  }

  /**
   * Type-specific matching logic
   */
  typeSpecificMatch(record) {
    switch (this.type) {
      case 'exact':
        return this.matchExact(record);
      case 'prefix':
        return this.matchPrefix(record);
      case 'suffix':
        return this.matchSuffix(record);
      case 'regex':
        return this.matchRegex(record);
      case 'percentage':
        return { matched: true, confidence: 0.5, type: 'percentage' };
      case 'time-based':
        return this.matchTimeBased(record);
      case 'model-based':
        return { matched: true, confidence: 0.7, type: 'model-based' };
      case 'conditional':
        return this.matchConditional(record);
      default:
        return { matched: false, reason: 'Unknown rule type' };
    }
  }

  matchExact(record) {
    const recordValue = this.getNestedValue(record, this.exactMatch.field);
    const matched = recordValue === this.exactMatch.value;
    return {
      matched,
      confidence: matched ? 1.0 : 0,
      type: 'exact'
    };
  }

  matchPrefix(record) {
    const recordValue = this.getNestedValue(record, this.pattern.field);
    const matched = String(recordValue).startsWith(this.pattern.value);
    return {
      matched,
      confidence: matched ? 0.95 : 0,
      type: 'prefix'
    };
  }

  matchSuffix(record) {
    const recordValue = this.getNestedValue(record, this.pattern.field);
    const matched = String(recordValue).endsWith(this.pattern.value);
    return {
      matched,
      confidence: matched ? 0.95 : 0,
      type: 'suffix'
    };
  }

  matchRegex(record) {
    const recordValue = this.getNestedValue(record, this.pattern.field);
    try {
      const regex = new RegExp(this.pattern.value);
      const matched = regex.test(String(recordValue));
      return {
        matched,
        confidence: matched ? 0.85 : 0,
        type: 'regex'
      };
    } catch (e) {
      return { matched: false, reason: 'Invalid regex pattern' };
    }
  }

  matchTimeBased(record) {
    const recordDate = new Date(this.getNestedValue(record, this.timeRange.field));
    const startDate = new Date(this.timeRange.start);
    const endDate = new Date(this.timeRange.end);
    const matched = recordDate >= startDate && recordDate <= endDate;
    return {
      matched,
      confidence: matched ? 0.9 : 0,
      type: 'time-based'
    };
  }

  matchConditional(record) {
    const result = this.evaluateConditionalLogic(record, this.conditionalLogic);
    return {
      matched: result.satisfied,
      confidence: result.confidence || 0.75,
      type: 'conditional'
    };
  }

  evaluateConditionalLogic(record, logic) {
    if (!logic) return { satisfied: false, confidence: 0 };

    const { operator, conditions } = logic;
    let satisfied = operator === 'AND';
    let confidences = [];

    for (const condition of conditions) {
      if (condition.type === 'nested') {
        const nested = this.evaluateConditionalLogic(record, condition.logic);
        if (operator === 'AND') {
          satisfied = satisfied && nested.satisfied;
        } else {
          satisfied = satisfied || nested.satisfied;
        }
        if (nested.confidence) confidences.push(nested.confidence);
      } else {
        const value = this.getNestedValue(record, condition.field);
        const conditionSatisfied = this.evaluateCondition(value, condition.operator, condition.value);
        if (operator === 'AND') {
          satisfied = satisfied && conditionSatisfied;
        } else {
          satisfied = satisfied || conditionSatisfied;
        }
        confidences.push(conditionSatisfied ? 1.0 : 0);
      }
    }

    const avgConfidence = confidences.length > 0
      ? confidences.reduce((a, b) => a + b) / confidences.length
      : 0;

    return { satisfied, confidence: avgConfidence };
  }

  /**
   * Apply this rule to a record
   */
  apply(record) {
    return {
      costCenter: this.costCenter,
      ruleId: this.id,
      ruleName: this.name,
      ruleVersion: this.version,
      allocation: {
        percentage: this.percentage || 100,
        amount: this.calculateAmount(record)
      }
    };
  }

  calculateAmount(record) {
    if (this.percentage && record.amount) {
      return (record.amount * this.percentage) / 100;
    }
    return record.amount || 0;
  }

  /**
   * Create a new version of this rule
   */
  createVersion(updates, userId) {
    const previousVersion = {
      version: this.version,
      createdAt: this.createdAt,
      createdBy: this.createdBy,
      data: JSON.parse(JSON.stringify(this))
    };

    this.versionHistory.push(previousVersion);
    this.version += 1;
    this.createdAt = new Date();
    this.createdBy = userId;
    this.status = 'draft';
    this.approvalChain = [];

    Object.assign(this, updates);
    return this.version;
  }

  /**
   * Get version history
   */
  getVersionHistory() {
    return [
      ...this.versionHistory,
      {
        version: this.version,
        createdAt: this.createdAt,
        createdBy: this.createdBy,
        data: JSON.parse(JSON.stringify(this))
      }
    ];
  }
}

/**
 * PolicyEngine - Main engine for cost allocation
 */
class PolicyEngine {
  constructor(rules = [], config = {}) {
    this.rules = rules;
    this.hierarchy = new Map(); // For hierarchical cost centers
    this.approvalWorkflows = new Map(); // Rule ID -> workflow state
    this.auditLog = []; // Comprehensive audit trail
    this.allocationHistory = new Map(); // Record ID -> allocations
    this.conflictResolutionStrategy = config.conflictResolutionStrategy || 'highest-priority';
    this.enableAudit = config.enableAudit !== false;
    this.enableVersionControl = config.enableVersionControl !== false;
    this.defaultConfidenceThreshold = config.confidenceThreshold || 0.5;
  }

  /**
   * Add a new rule
   */
  addRule(rule) {
    if (!(rule instanceof AllocationRule)) {
      rule = new AllocationRule(rule);
    }

    this.rules.push(rule);
    this.auditLog.push({
      timestamp: new Date(),
      action: 'RULE_ADDED',
      ruleId: rule.id,
      ruleName: rule.name,
      details: { version: rule.version, status: rule.status },
      hash: this.generateAuditHash({ action: 'RULE_ADDED', ruleId: rule.id })
    });

    return rule;
  }

  /**
   * Update an existing rule
   */
  updateRule(id, updates, userId) {
    const rule = this.findRule(id);
    if (!rule) {
      throw new Error(`Rule not found: ${id}`);
    }

    const oldVersion = rule.version;
    rule.createVersion(updates, userId);

    this.auditLog.push({
      timestamp: new Date(),
      action: 'RULE_UPDATED',
      ruleId: rule.id,
      ruleName: rule.name,
      details: { fromVersion: oldVersion, toVersion: rule.version, userId },
      hash: this.generateAuditHash({ action: 'RULE_UPDATED', ruleId: rule.id, version: rule.version })
    });

    return rule;
  }

  /**
   * Delete a rule (archive instead of hard delete)
   */
  deleteRule(id, userId, reason = '') {
    const rule = this.findRule(id);
    if (!rule) {
      throw new Error(`Rule not found: ${id}`);
    }

    rule.status = 'archived';
    rule.metadata.deletedAt = new Date();
    rule.metadata.deletedBy = userId;
    rule.metadata.deletionReason = reason;

    this.auditLog.push({
      timestamp: new Date(),
      action: 'RULE_ARCHIVED',
      ruleId: rule.id,
      ruleName: rule.name,
      details: { userId, reason },
      hash: this.generateAuditHash({ action: 'RULE_ARCHIVED', ruleId: rule.id, userId })
    });

    return rule;
  }

  /**
   * Find a rule by ID
   */
  findRule(id) {
    return this.rules.find(rule => rule.id === id);
  }

  /**
   * Build hierarchical structure for cost centers
   */
  buildHierarchy(costCenters) {
    this.hierarchy.clear();

    for (const cc of costCenters) {
      this.hierarchy.set(cc.id, {
        id: cc.id,
        name: cc.name,
        level: cc.level, // 0=Company, 1=BU, 2=Dept, 3=Team
        parent: cc.parent,
        children: []
      });
    }

    // Build parent-child relationships
    for (const cc of costCenters) {
      if (cc.parent) {
        const parent = this.hierarchy.get(cc.parent);
        if (parent) {
          parent.children.push(cc.id);
        }
      }
    }

    this.auditLog.push({
      timestamp: new Date(),
      action: 'HIERARCHY_BUILT',
      details: { costCenterCount: costCenters.length },
      hash: this.generateAuditHash({ action: 'HIERARCHY_BUILT', count: costCenters.length })
    });

    return this.hierarchy;
  }

  /**
   * Resolve cost center hierarchy to get full path
   */
  resolveHierarchy(costCenterId) {
    const path = [];
    let current = costCenterId;

    while (current) {
      const cc = this.hierarchy.get(current);
      if (!cc) break;
      path.unshift(cc);
      current = cc.parent;
    }

    return path;
  }

  /**
   * Get inherited rules for a cost center (from parents)
   */
  getInheritedRules(costCenterId) {
    const hierarchy = this.resolveHierarchy(costCenterId);
    const ccIds = hierarchy.map(cc => cc.id);

    return this.rules.filter(rule => {
      if (rule.status !== 'approved') return false;
      if (!rule.enabled) return false;
      return ccIds.includes(rule.costCenter);
    });
  }

  /**
   * Allocate a single record
   */
  allocate(record) {
    const recordId = record.id || `${Date.now()}_${Math.random()}`;
    const matches = [];

    // Find all matching rules
    for (const rule of this.rules) {
      if (rule.status !== 'approved' || !rule.enabled) continue;

      const matchResult = rule.matches(record);
      if (matchResult.matched) {
        matches.push({
          rule,
          matchResult,
          confidence: matchResult.confidence || 0.5,
          priority: rule.priority
        });
      }
    }

    // Sort by priority (descending) and confidence (descending)
    matches.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return b.confidence - a.confidence;
    });

    // Resolve conflicts
    const allocation = this.resolveConflicts(matches, record);

    // Store allocation history
    if (!this.allocationHistory.has(recordId)) {
      this.allocationHistory.set(recordId, []);
    }
    this.allocationHistory.get(recordId).push(allocation);

    // Audit trail
    if (this.enableAudit) {
      this.auditLog.push({
        timestamp: new Date(),
        action: 'ALLOCATION_CREATED',
        recordId,
        details: {
          matchedRules: matches.length,
          selectedRule: allocation.ruleId,
          confidence: allocation.confidence
        },
        hash: this.generateAuditHash(allocation)
      });
    }

    return allocation;
  }

  /**
   * Allocate multiple records in batch
   */
  allocateBatch(records) {
    const results = {
      total: records.length,
      successful: 0,
      failed: 0,
      allocations: [],
      errors: []
    };

    for (const record of records) {
      try {
        const allocation = this.allocate(record);
        results.allocations.push(allocation);
        results.successful++;
      } catch (error) {
        results.errors.push({
          recordId: record.id,
          error: error.message
        });
        results.failed++;
      }
    }

    this.auditLog.push({
      timestamp: new Date(),
      action: 'BATCH_ALLOCATION',
      details: {
        total: results.total,
        successful: results.successful,
        failed: results.failed
      },
      hash: this.generateAuditHash(results)
    });

    return results;
  }

  /**
   * Resolve conflicts when multiple rules match
   */
  resolveConflicts(matches, record) {
    if (matches.length === 0) {
      return {
        recordId: record.id,
        allocated: false,
        reason: 'No matching rules',
        timestamp: new Date()
      };
    }

    let selected;

    switch (this.conflictResolutionStrategy) {
      case 'highest-priority':
        selected = matches[0];
        break;
      case 'highest-confidence':
        selected = matches.reduce((a, b) => a.confidence > b.confidence ? a : b);
        break;
      case 'sum-proportional':
        return this.resolveSumProportional(matches, record);
      case 'weighted-average':
        return this.resolveWeightedAverage(matches, record);
      default:
        selected = matches[0];
    }

    const allocation = selected.rule.apply(record);
    return {
      recordId: record.id,
      allocated: true,
      ...allocation,
      confidence: selected.confidence,
      matchCount: matches.length,
      allMatches: matches.map(m => ({
        ruleId: m.rule.id,
        ruleName: m.rule.name,
        confidence: m.confidence,
        priority: m.priority
      })),
      timestamp: new Date()
    };
  }

  /**
   * Resolve conflicts using sum proportional strategy
   */
  resolveSumProportional(matches, record) {
    const totalConfidence = matches.reduce((sum, m) => sum + m.confidence, 0);
    const allocations = matches.map(m => {
      const proportion = m.confidence / totalConfidence;
      return {
        costCenter: m.rule.costCenter,
        ruleId: m.rule.id,
        ruleName: m.rule.name,
        percentage: proportion * 100,
        amount: (record.amount || 0) * proportion,
        confidence: m.confidence
      };
    });

    return {
      recordId: record.id,
      allocated: true,
      allocations,
      strategy: 'sum-proportional',
      matchCount: matches.length,
      timestamp: new Date()
    };
  }

  /**
   * Resolve conflicts using weighted average strategy
   */
  resolveWeightedAverage(matches, record) {
    const totalWeight = matches.reduce((sum, m) => sum + m.priority, 0);
    const weightedConfidence = matches.reduce(
      (sum, m) => sum + (m.confidence * (m.priority / totalWeight)),
      0
    );

    const selected = matches[0];
    return {
      recordId: record.id,
      allocated: true,
      costCenter: selected.rule.costCenter,
      ruleId: selected.rule.id,
      ruleName: selected.rule.name,
      confidence: weightedConfidence,
      strategy: 'weighted-average',
      matchCount: matches.length,
      timestamp: new Date()
    };
  }

  /**
   * Calculate confidence score for a record with a specific rule
   */
  calculateConfidence(record, rule) {
    const matchResult = rule.matches(record);
    if (!matchResult.matched) return 0;

    let confidence = matchResult.confidence || 0.5;

    // Adjust confidence based on rule type
    const adjustments = {
      'exact': 0.95,
      'prefix': 0.85,
      'suffix': 0.85,
      'regex': 0.80,
      'time-based': 0.75,
      'percentage': 0.50,
      'conditional': 0.70,
      'model-based': 0.65
    };

    confidence *= (adjustments[rule.type] || 1.0);

    // Adjust for rule priority
    confidence *= (1 + (rule.priority - 50) / 200);

    return Math.min(1.0, Math.max(0, confidence));
  }

  /**
   * Simulate allocation with proposed rules (dry-run)
   */
  simulate(records, proposedRules = []) {
    const previousRules = this.rules;
    const previousApprovals = new Map(this.approvalWorkflows);

    // Temporarily add proposed rules
    const tempRules = proposedRules.map(r => {
      if (!(r instanceof AllocationRule)) {
        const rule = new AllocationRule(r);
        rule.status = 'approved'; // Treat as approved for simulation
        return rule;
      }
      r.status = 'approved';
      return r;
    });

    this.rules.push(...tempRules);

    // Run allocation simulation
    const results = this.allocateBatch(records);

    // Restore original state
    this.rules = previousRules;
    this.approvalWorkflows = previousApprovals;

    return {
      simulationId: `sim_${Date.now()}`,
      timestamp: new Date(),
      records: records.length,
      proposedRulesCount: proposedRules.length,
      results,
      summary: {
        successful: results.successful,
        failed: results.failed,
        confidenceMetrics: this.calculateConfidenceMetrics(results.allocations)
      }
    };
  }

  /**
   * Calculate confidence metrics for allocations
   */
  calculateConfidenceMetrics(allocations) {
    if (allocations.length === 0) {
      return { avg: 0, min: 0, max: 0, distribution: {} };
    }

    const confidences = allocations
      .filter(a => a.confidence !== undefined)
      .map(a => a.confidence);

    if (confidences.length === 0) {
      return { avg: 0, min: 0, max: 0, distribution: {} };
    }

    const avg = confidences.reduce((a, b) => a + b) / confidences.length;
    const min = Math.min(...confidences);
    const max = Math.max(...confidences);

    const distribution = {
      'below-50': confidences.filter(c => c < 0.5).length,
      '50-70': confidences.filter(c => c >= 0.5 && c < 0.7).length,
      '70-85': confidences.filter(c => c >= 0.7 && c < 0.85).length,
      '85-95': confidences.filter(c => c >= 0.85 && c < 0.95).length,
      'above-95': confidences.filter(c => c >= 0.95).length
    };

    return { avg, min, max, distribution };
  }

  /**
   * Submit a rule for approval
   */
  submitForApproval(ruleId, submittedBy) {
    const rule = this.findRule(ruleId);
    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    if (rule.status !== 'draft') {
      throw new Error(`Rule must be in draft status to submit for approval: ${rule.status}`);
    }

    rule.status = 'pending-approval';
    rule.approvalChain = [{
      step: 1,
      submitted: new Date(),
      submittedBy,
      status: 'pending',
      approvers: [],
      approvedAt: null,
      approvedBy: null,
      rejectionReason: null
    }];

    const workflow = {
      ruleId,
      ruleName: rule.name,
      status: 'pending',
      createdAt: new Date(),
      submittedBy,
      approvalSteps: rule.approvalChain,
      history: []
    };

    this.approvalWorkflows.set(ruleId, workflow);

    this.auditLog.push({
      timestamp: new Date(),
      action: 'APPROVAL_SUBMITTED',
      ruleId,
      details: { submittedBy, status: 'pending' },
      hash: this.generateAuditHash({ action: 'APPROVAL_SUBMITTED', ruleId, submittedBy })
    });

    return workflow;
  }

  /**
   * Approve a rule
   */
  approve(ruleId, approverId, comment = '') {
    const rule = this.findRule(ruleId);
    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    const workflow = this.approvalWorkflows.get(ruleId);
    if (!workflow) {
      throw new Error(`No approval workflow found for rule: ${ruleId}`);
    }

    if (rule.status !== 'pending-approval') {
      throw new Error(`Rule is not pending approval: ${rule.status}`);
    }

    const currentStep = rule.approvalChain[rule.approvalChain.length - 1];
    currentStep.status = 'approved';
    currentStep.approvedAt = new Date();
    currentStep.approvedBy = approverId;
    currentStep.comment = comment;

    rule.status = 'approved';
    workflow.status = 'approved';

    this.auditLog.push({
      timestamp: new Date(),
      action: 'RULE_APPROVED',
      ruleId,
      details: { approverId, comment },
      hash: this.generateAuditHash({ action: 'RULE_APPROVED', ruleId, approverId })
    });

    return {
      ruleId,
      status: 'approved',
      approvedAt: new Date(),
      approvedBy: approverId,
      comment
    };
  }

  /**
   * Reject a rule
   */
  reject(ruleId, approverId, reason = '') {
    const rule = this.findRule(ruleId);
    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    const workflow = this.approvalWorkflows.get(ruleId);
    if (!workflow) {
      throw new Error(`No approval workflow found for rule: ${ruleId}`);
    }

    if (rule.status !== 'pending-approval') {
      throw new Error(`Rule is not pending approval: ${rule.status}`);
    }

    const currentStep = rule.approvalChain[rule.approvalChain.length - 1];
    currentStep.status = 'rejected';
    currentStep.rejectedAt = new Date();
    currentStep.rejectedBy = approverId;
    currentStep.rejectionReason = reason;

    rule.status = 'rejected';
    workflow.status = 'rejected';

    this.auditLog.push({
      timestamp: new Date(),
      action: 'RULE_REJECTED',
      ruleId,
      details: { approverId, reason },
      hash: this.generateAuditHash({ action: 'RULE_REJECTED', ruleId, approverId, reason })
    });

    return {
      ruleId,
      status: 'rejected',
      rejectedAt: new Date(),
      rejectedBy: approverId,
      reason
    };
  }

  /**
   * Get approval workflow status
   */
  getApprovalStatus(ruleId) {
    return this.approvalWorkflows.get(ruleId) || null;
  }

  /**
   * Get audit trail for a rule
   */
  getAuditTrail(ruleId) {
    return this.auditLog.filter(entry => entry.ruleId === ruleId);
  }

  /**
   * Get all audit logs with optional filtering
   */
  getAllAuditLogs(filters = {}) {
    let logs = this.auditLog;

    if (filters.action) {
      logs = logs.filter(log => log.action === filters.action);
    }

    if (filters.startDate) {
      const start = new Date(filters.startDate);
      logs = logs.filter(log => log.timestamp >= start);
    }

    if (filters.endDate) {
      const end = new Date(filters.endDate);
      logs = logs.filter(log => log.timestamp <= end);
    }

    if (filters.limit) {
      logs = logs.slice(-filters.limit);
    }

    return logs;
  }

  /**
   * Generate cryptographic hash for audit entry
   */
  generateAuditHash(data) {
    const dataString = JSON.stringify(data);
    return crypto.createHash('sha256').update(dataString).digest('hex');
  }

  /**
   * Verify audit trail integrity
   */
  verifyAuditIntegrity(auditEntry) {
    const computedHash = this.generateAuditHash({
      timestamp: auditEntry.timestamp,
      action: auditEntry.action,
      ruleId: auditEntry.ruleId,
      details: auditEntry.details
    });

    return computedHash === auditEntry.hash;
  }

  /**
   * Get allocation history for a record
   */
  getAllocationHistory(recordId) {
    return this.allocationHistory.get(recordId) || [];
  }

  /**
   * Export rules with version history
   */
  exportRules(options = {}) {
    const activeOnly = options.activeOnly !== false;
    const includeHistory = options.includeHistory || false;

    const rulesToExport = activeOnly
      ? this.rules.filter(r => r.status !== 'archived')
      : this.rules;

    return rulesToExport.map(rule => ({
      id: rule.id,
      type: rule.type,
      name: rule.name,
      description: rule.description,
      costCenter: rule.costCenter,
      priority: rule.priority,
      enabled: rule.enabled,
      version: rule.version,
      status: rule.status,
      createdAt: rule.createdAt,
      createdBy: rule.createdBy,
      ...(includeHistory && { versionHistory: rule.getVersionHistory() })
    }));
  }

  /**
   * Import rules
   */
  importRules(rules, options = {}) {
    const imported = [];
    const errors = [];

    for (const ruleData of rules) {
      try {
        const rule = new AllocationRule(ruleData);
        this.addRule(rule);
        imported.push(rule.id);
      } catch (error) {
        errors.push({
          ruleName: ruleData.name,
          error: error.message
        });
      }
    }

    this.auditLog.push({
      timestamp: new Date(),
      action: 'RULES_IMPORTED',
      details: { imported: imported.length, failed: errors.length },
      hash: this.generateAuditHash({ action: 'RULES_IMPORTED', count: imported.length })
    });

    return { imported, errors };
  }

  /**
   * Get engine statistics
   */
  getStatistics() {
    const rulesCount = this.rules.length;
    const activeRules = this.rules.filter(r => r.status === 'approved' && r.enabled).length;
    const pendingApprovals = this.rules.filter(r => r.status === 'pending-approval').length;
    const archivedRules = this.rules.filter(r => r.status === 'archived').length;

    const allocationCount = Array.from(this.allocationHistory.values())
      .reduce((sum, history) => sum + history.length, 0);

    const auditLogSize = this.auditLog.length;

    return {
      rules: {
        total: rulesCount,
        active: activeRules,
        pendingApproval: pendingApprovals,
        archived: archivedRules
      },
      allocations: {
        total: allocationCount,
        recordsProcessed: this.allocationHistory.size
      },
      audit: {
        logEntries: auditLogSize
      },
      hierarchy: {
        costCenters: this.hierarchy.size
      }
    };
  }

  /**
   * Validate rule configuration
   */
  validateRule(ruleConfig) {
    const errors = [];

    if (!ruleConfig.type) {
      errors.push('Rule type is required');
    }

    if (!ruleConfig.name) {
      errors.push('Rule name is required');
    }

    if (!ruleConfig.costCenter) {
      errors.push('Cost center is required');
    }

    const validTypes = ['exact', 'prefix', 'suffix', 'regex', 'model-based', 'percentage', 'time-based', 'conditional'];
    if (!validTypes.includes(ruleConfig.type)) {
      errors.push(`Invalid rule type: ${ruleConfig.type}`);
    }

    if (ruleConfig.priority && (ruleConfig.priority < 0 || ruleConfig.priority > 100)) {
      errors.push('Priority must be between 0 and 100');
    }

    if (ruleConfig.percentage && (ruleConfig.percentage < 0 || ruleConfig.percentage > 100)) {
      errors.push('Percentage must be between 0 and 100');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Export for Node.js and browser environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PolicyEngine, AllocationRule };
}
