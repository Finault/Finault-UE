/**
 * Finault Enterprise Audit Logging System
 * Phase 4: Enterprise Features
 *
 * Compliance-grade audit logging with tamper-evident records
 * Supports SOX, EU AI Act, SOC 2, and NIST AI RMF requirements
 */

const crypto = require('crypto');

/**
 * Audit Event Types
 */
const AuditEventTypes = {
  // Authentication Events
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_LOGIN_FAILED: 'auth.login_failed',
  AUTH_MFA_CHALLENGE: 'auth.mfa_challenge',
  AUTH_SSO_LOGIN: 'auth.sso_login',
  AUTH_SESSION_REVOKED: 'auth.session_revoked',

  // User Management
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  USER_ROLE_ASSIGNED: 'user.role_assigned',
  USER_ROLE_REVOKED: 'user.role_revoked',

  // API Key Events
  KEY_CREATED: 'key.created',
  KEY_ROTATED: 'key.rotated',
  KEY_REVOKED: 'key.revoked',
  KEY_USED: 'key.used',

  // Budget Events
  BUDGET_CREATED: 'budget.created',
  BUDGET_UPDATED: 'budget.updated',
  BUDGET_THRESHOLD_REACHED: 'budget.threshold_reached',
  BUDGET_EXCEEDED: 'budget.exceeded',
  BUDGET_CIRCUIT_BREAKER: 'budget.circuit_breaker',

  // AI Request Events
  AI_REQUEST_INITIATED: 'ai.request_initiated',
  AI_REQUEST_COMPLETED: 'ai.request_completed',
  AI_REQUEST_FAILED: 'ai.request_failed',
  AI_REQUEST_BLOCKED: 'ai.request_blocked',

  // Cost Events
  COST_ATTRIBUTED: 'cost.attributed',
  COST_RECONCILED: 'cost.reconciled',
  COST_ANOMALY_DETECTED: 'cost.anomaly_detected',

  // Compliance Events
  COMPLIANCE_REPORT_GENERATED: 'compliance.report_generated',
  COMPLIANCE_EXPORT_CREATED: 'compliance.export_created',
  RETENTION_POLICY_APPLIED: 'retention.policy_applied',

  // Settings Events
  SETTINGS_UPDATED: 'settings.updated',
  INTEGRATION_CONNECTED: 'integration.connected',
  INTEGRATION_DISCONNECTED: 'integration.disconnected',

  // Data Events
  DATA_EXPORTED: 'data.exported',
  DATA_DELETED: 'data.deleted',
  DATA_ACCESSED: 'data.accessed'
};

/**
 * Audit Severity Levels
 */
const AuditSeverity = {
  DEBUG: 'debug',
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
};


/**
 * Main Audit Logger Class
 */
class AuditLogger {
  constructor(config = {}) {
    this.config = {
      orgId: config.orgId,
      enableChaining: config.enableChaining !== false, // Tamper-evident chain
      enableEncryption: config.enableEncryption || false,
      retentionDays: config.retentionDays || 2555, // 7 years default
      batchSize: config.batchSize || 100,
      flushInterval: config.flushInterval || 5000,
      ...config
    };

    this.logs = [];
    this.logIndex = new Map(); // For fast lookups
    this.lastHash = null;
    this.sequence = 0;
  }

  /**
   * Log an audit event
   */
  async log(eventType, data = {}) {
    const event = this.createEvent(eventType, data);

    // Add to chain
    if (this.config.enableChaining) {
      event.previousHash = this.lastHash;
      event.hash = this.computeHash(event);
      this.lastHash = event.hash;
    }

    // Store in memory
    this.logs.push(event);
    this.indexEvent(event);

    // ── GAP #24 FIX: Persist to audit_trail table in Supabase ──
    // Previously events were only in-memory and lost on worker restart.
    if (this.config.supabaseUrl && this.config.supabaseKey) {
      try {
        await this.persistToSupabase(event, eventType, data);
      } catch (persistErr) {
        // Non-fatal: in-memory log still works
        console.error('[AuditLogger] Supabase persist failed:', persistErr.message);
      }
    }

    // Emit for real-time streaming
    this.emit('audit', event);

    return event;
  }

  /**
   * GAP #24 FIX: Write audit event to the audit_trail Supabase table
   */
  async persistToSupabase(event, eventType, data) {
    // Map eventType to allowed audit_action enum: create, update, delete, export, access
    const actionMap = {
      'invoice_parsed': 'create', 'allocation_complete': 'create',
      'closepack_generated': 'create', 'erp_connected': 'create',
      'erp_push': 'create', 'budget_created': 'create',
      'rule_created': 'create', 'magic_onboarding': 'create',
      'recommendation_applied': 'create',
      'budget_updated': 'update', 'rule_updated': 'update',
      'budget_deleted': 'delete', 'rule_deleted': 'delete',
      'anomaly_acknowledged': 'update',
      'anomalies_detected': 'access', 'sso_login': 'access',
      'auth.login': 'access', 'auth.logout': 'access',
      'auth.login_failed': 'access', 'auth.mfa_challenge': 'access',
      'request_complete': 'access', 'error': 'access',
      'export': 'export', 'audit_export': 'export',
      'reconciliation_audit_pdf': 'export'
    };

    const action = actionMap[eventType] || 'access';

    const row = {
      organization_id: event.orgId || data.orgId || null,
      user_id: event.actor?.userId || data.userId || null,
      api_key_id: event.actor?.apiKeyId || data.apiKeyId || null,
      action: action,
      resource_type: event.target?.type || data.targetType || eventType.split('.')[0] || eventType,
      resource_id: event.target?.id || data.targetId || data.requestId || event.id,
      changes: event.changes || data.changes || null,
      previous_values: data.previousValues || null,
      new_values: data.newValues || data.details || null,
      ip_address: event.actor?.ipAddress || data.ipAddress || null,
      user_agent: event.actor?.userAgent || data.userAgent || null,
      request_id: event.context?.requestId || data.requestId || null,
      metadata: {
        eventType,
        severity: event.severity,
        hash: event.hash || null,
        sequence: event.sequence,
        source: event.metadata?.source || 'api'
      }
    };

    // Remove null org_id — the column has a NOT NULL constraint with FK
    if (!row.organization_id) {
      // Can't persist without org_id — skip silently
      return;
    }

    const resp = await fetch(`${this.config.supabaseUrl}/rest/v1/audit_trail`, {
      method: 'POST',
      headers: {
        'apikey': this.config.supabaseKey,
        'Authorization': `Bearer ${this.config.supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(row)
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[AuditLogger] audit_trail insert failed (${resp.status}):`, errText);
    }
  }

  /**
   * Create standardized audit event
   */
  createEvent(eventType, data) {
    this.sequence++;

    const event = {
      id: crypto.randomUUID(),
      sequence: this.sequence,
      timestamp: new Date().toISOString(),
      timestampMs: Date.now(),
      eventType,
      severity: this.getSeverity(eventType),
      orgId: this.config.orgId,

      // Actor (who performed the action)
      actor: {
        userId: data.userId || null,
        email: data.userEmail || null,
        ipAddress: data.ipAddress || null,
        userAgent: data.userAgent || null,
        sessionId: data.sessionId || null,
        apiKeyId: data.apiKeyId || null
      },

      // Target (what was affected)
      target: {
        type: data.targetType || null,
        id: data.targetId || null,
        name: data.targetName || null
      },

      // Context
      context: {
        teamId: data.teamId || null,
        projectId: data.projectId || null,
        costCenter: data.costCenter || null,
        environment: data.environment || 'production',
        requestId: data.requestId || null
      },

      // Event-specific data
      details: data.details || {},

      // Changes (for update events)
      changes: data.changes || null,

      // Result
      result: {
        success: data.success !== false,
        errorCode: data.errorCode || null,
        errorMessage: data.errorMessage || null
      },

      // Metadata
      metadata: {
        version: '1.0',
        source: data.source || 'api',
        correlationId: data.correlationId || null
      }
    };

    return event;
  }

  /**
   * Compute cryptographic hash for tamper evidence
   */
  computeHash(event) {
    const payload = JSON.stringify({
      id: event.id,
      sequence: event.sequence,
      timestamp: event.timestamp,
      eventType: event.eventType,
      actor: event.actor,
      target: event.target,
      context: event.context,
      details: event.details,
      previousHash: event.previousHash
    });

    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Verify chain integrity
   */
  verifyChain(startSequence = 1, endSequence = null) {
    const end = endSequence || this.sequence;
    const issues = [];
    let previousHash = null;

    for (let seq = startSequence; seq <= end; seq++) {
      const event = this.logs.find(e => e.sequence === seq);

      if (!event) {
        issues.push({
          sequence: seq,
          issue: 'missing_event',
          severity: 'critical'
        });
        continue;
      }

      // Verify previous hash link
      if (event.previousHash !== previousHash) {
        issues.push({
          sequence: seq,
          issue: 'broken_chain',
          expected: previousHash,
          actual: event.previousHash,
          severity: 'critical'
        });
      }

      // Recompute and verify hash
      const computedHash = this.computeHash(event);
      if (computedHash !== event.hash) {
        issues.push({
          sequence: seq,
          issue: 'tampered_event',
          expected: computedHash,
          actual: event.hash,
          severity: 'critical'
        });
      }

      previousHash = event.hash;
    }

    return {
      verified: issues.length === 0,
      startSequence,
      endSequence: end,
      eventsVerified: end - startSequence + 1,
      issues
    };
  }

  /**
   * Index event for fast lookups
   */
  indexEvent(event) {
    // By user
    if (event.actor.userId) {
      const key = `user:${event.actor.userId}`;
      if (!this.logIndex.has(key)) this.logIndex.set(key, []);
      this.logIndex.get(key).push(event.id);
    }

    // By target
    if (event.target.id) {
      const key = `target:${event.target.type}:${event.target.id}`;
      if (!this.logIndex.has(key)) this.logIndex.set(key, []);
      this.logIndex.get(key).push(event.id);
    }

    // By event type
    const typeKey = `type:${event.eventType}`;
    if (!this.logIndex.has(typeKey)) this.logIndex.set(typeKey, []);
    this.logIndex.get(typeKey).push(event.id);

    // By date
    const dateKey = `date:${event.timestamp.split('T')[0]}`;
    if (!this.logIndex.has(dateKey)) this.logIndex.set(dateKey, []);
    this.logIndex.get(dateKey).push(event.id);
  }

  /**
   * Query audit logs
   */
  query(filters = {}, options = {}) {
    let results = this.logs;

    // Filter by date range
    if (filters.startDate) {
      const start = new Date(filters.startDate).getTime();
      results = results.filter(e => e.timestampMs >= start);
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate).getTime();
      results = results.filter(e => e.timestampMs <= end);
    }

    // Filter by event type
    if (filters.eventType) {
      const types = Array.isArray(filters.eventType) ? filters.eventType : [filters.eventType];
      results = results.filter(e => types.includes(e.eventType));
    }

    // Filter by actor
    if (filters.userId) {
      results = results.filter(e => e.actor.userId === filters.userId);
    }
    if (filters.email) {
      results = results.filter(e => e.actor.email === filters.email);
    }

    // Filter by target
    if (filters.targetType) {
      results = results.filter(e => e.target.type === filters.targetType);
    }
    if (filters.targetId) {
      results = results.filter(e => e.target.id === filters.targetId);
    }

    // Filter by context
    if (filters.teamId) {
      results = results.filter(e => e.context.teamId === filters.teamId);
    }
    if (filters.costCenter) {
      results = results.filter(e => e.context.costCenter === filters.costCenter);
    }

    // Filter by severity
    if (filters.severity) {
      const severities = Array.isArray(filters.severity) ? filters.severity : [filters.severity];
      results = results.filter(e => severities.includes(e.severity));
    }

    // Filter by success/failure
    if (filters.success !== undefined) {
      results = results.filter(e => e.result.success === filters.success);
    }

    // Sort
    const sortField = options.sortBy || 'timestamp';
    const sortDir = options.sortDir === 'asc' ? 1 : -1;
    results.sort((a, b) => {
      if (a[sortField] < b[sortField]) return -1 * sortDir;
      if (a[sortField] > b[sortField]) return 1 * sortDir;
      return 0;
    });

    // Pagination
    const page = options.page || 1;
    const limit = options.limit || 100;
    const offset = (page - 1) * limit;
    const total = results.length;

    results = results.slice(offset, offset + limit);

    return {
      data: results,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get severity for event type
   */
  getSeverity(eventType) {
    const criticalEvents = [
      AuditEventTypes.AUTH_LOGIN_FAILED,
      AuditEventTypes.BUDGET_EXCEEDED,
      AuditEventTypes.BUDGET_CIRCUIT_BREAKER,
      AuditEventTypes.AI_REQUEST_BLOCKED,
      AuditEventTypes.COST_ANOMALY_DETECTED,
      AuditEventTypes.DATA_DELETED
    ];

    const warningEvents = [
      AuditEventTypes.BUDGET_THRESHOLD_REACHED,
      AuditEventTypes.KEY_REVOKED,
      AuditEventTypes.USER_DELETED
    ];

    if (criticalEvents.includes(eventType)) return AuditSeverity.CRITICAL;
    if (warningEvents.includes(eventType)) return AuditSeverity.WARNING;
    return AuditSeverity.INFO;
  }

  /**
   * Generate compliance report
   */
  generateComplianceReport(framework, dateRange) {
    const { startDate, endDate } = dateRange;
    const events = this.query({ startDate, endDate }).data;

    const report = {
      framework,
      generatedAt: new Date().toISOString(),
      period: { startDate, endDate },
      summary: {
        totalEvents: events.length,
        byType: {},
        bySeverity: {},
        byUser: {},
        byTeam: {}
      },
      chainIntegrity: this.verifyChain(),
      highlights: []
    };

    // Aggregate statistics
    for (const event of events) {
      // By type
      report.summary.byType[event.eventType] = (report.summary.byType[event.eventType] || 0) + 1;

      // By severity
      report.summary.bySeverity[event.severity] = (report.summary.bySeverity[event.severity] || 0) + 1;

      // By user
      if (event.actor.userId) {
        report.summary.byUser[event.actor.userId] = (report.summary.byUser[event.actor.userId] || 0) + 1;
      }

      // By team
      if (event.context.teamId) {
        report.summary.byTeam[event.context.teamId] = (report.summary.byTeam[event.context.teamId] || 0) + 1;
      }
    }

    // Framework-specific sections
    if (framework === 'SOX') {
      report.sections = this.generateSOXSections(events);
    } else if (framework === 'EU_AI_ACT') {
      report.sections = this.generateEUAIActSections(events);
    } else if (framework === 'SOC2') {
      report.sections = this.generateSOC2Sections(events);
    }

    return report;
  }

  generateSOXSections(events) {
    return {
      accessControls: {
        title: 'Access Control Events',
        description: 'Authentication and authorization events',
        events: events.filter(e =>
          e.eventType.startsWith('auth.') ||
          e.eventType.startsWith('user.')
        ).length,
        findings: []
      },
      changeManagement: {
        title: 'Change Management',
        description: 'Configuration and settings changes',
        events: events.filter(e =>
          e.eventType.startsWith('settings.') ||
          e.eventType.startsWith('key.')
        ).length,
        findings: []
      },
      financialControls: {
        title: 'Financial Controls',
        description: 'Budget and cost-related events',
        events: events.filter(e =>
          e.eventType.startsWith('budget.') ||
          e.eventType.startsWith('cost.')
        ).length,
        findings: []
      }
    };
  }

  generateEUAIActSections(events) {
    return {
      operationLogs: {
        title: 'Article 12 - Operation Logs',
        description: 'Automatic logging of AI system operations',
        events: events.filter(e => e.eventType.startsWith('ai.')).length,
        compliance: true
      },
      humanOversight: {
        title: 'Article 14 - Human Oversight',
        description: 'Evidence of human review and intervention capability',
        events: events.filter(e =>
          e.eventType === AuditEventTypes.AI_REQUEST_BLOCKED ||
          e.eventType === AuditEventTypes.BUDGET_CIRCUIT_BREAKER
        ).length,
        compliance: true
      },
      riskManagement: {
        title: 'Article 9 - Risk Management',
        description: 'Anomaly detection and risk mitigation events',
        events: events.filter(e => e.eventType === AuditEventTypes.COST_ANOMALY_DETECTED).length,
        compliance: true
      }
    };
  }

  generateSOC2Sections(events) {
    return {
      security: {
        title: 'CC6 - Logical and Physical Access Controls',
        events: events.filter(e => e.eventType.startsWith('auth.')).length
      },
      availability: {
        title: 'A1 - System Availability',
        events: events.filter(e => e.eventType.startsWith('ai.')).length
      },
      processingIntegrity: {
        title: 'PI1 - Processing Integrity',
        events: events.filter(e => e.eventType.startsWith('cost.')).length
      },
      confidentiality: {
        title: 'C1 - Confidentiality',
        events: events.filter(e => e.eventType.startsWith('data.')).length
      }
    };
  }

  /**
   * Export logs for compliance
   */
  async exportLogs(format, filters = {}, options = {}) {
    const { data } = this.query(filters, { limit: 10000 });

    // Log the export itself
    await this.log(AuditEventTypes.COMPLIANCE_EXPORT_CREATED, {
      details: {
        format,
        filters,
        recordCount: data.length
      }
    });

    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    }

    if (format === 'csv') {
      return this.toCSV(data);
    }

    if (format === 'siem') {
      // Common Event Format for SIEM integration
      return data.map(e => this.toCEF(e)).join('\n');
    }

    throw new Error(`Unsupported export format: ${format}`);
  }

  toCSV(events) {
    const headers = [
      'id', 'timestamp', 'eventType', 'severity',
      'actorUserId', 'actorEmail', 'actorIpAddress',
      'targetType', 'targetId',
      'teamId', 'costCenter',
      'success', 'hash'
    ];

    const rows = events.map(e => [
      e.id,
      e.timestamp,
      e.eventType,
      e.severity,
      e.actor.userId || '',
      e.actor.email || '',
      e.actor.ipAddress || '',
      e.target.type || '',
      e.target.id || '',
      e.context.teamId || '',
      e.context.costCenter || '',
      e.result.success,
      e.hash || ''
    ].map(v => `"${v}"`).join(','));

    return [headers.join(','), ...rows].join('\n');
  }

  toCEF(event) {
    // Common Event Format for SIEM systems
    const severity = {
      debug: 0,
      info: 3,
      warning: 6,
      error: 8,
      critical: 10
    }[event.severity] || 5;

    return `CEF:0|Finault|AIGovernance|1.0|${event.eventType}|${event.eventType}|${severity}|` +
      `rt=${event.timestampMs} ` +
      `suser=${event.actor.email || 'unknown'} ` +
      `src=${event.actor.ipAddress || 'unknown'} ` +
      `cs1=${event.context.teamId || ''} cs1Label=TeamID ` +
      `cs2=${event.context.costCenter || ''} cs2Label=CostCenter ` +
      `outcome=${event.result.success ? 'success' : 'failure'}`;
  }

  // Event emitter stub
  emit(event, data) {
    // In production, integrate with event bus
  }

  /**
   * GAP #24 FIX: Query persisted audit trail from Supabase
   * Falls back to in-memory logs if Supabase not configured or query fails.
   */
  async getLogs(env) {
    const supaUrl = this.config.supabaseUrl || (env && env.SUPABASE_URL);
    const supaKey = this.config.supabaseKey || (env && env.SUPABASE_KEY);

    if (supaUrl && supaKey) {
      try {
        const resp = await fetch(
          `${supaUrl}/rest/v1/audit_trail?order=created_at.desc&limit=200`,
          {
            headers: {
              'apikey': supaKey,
              'Authorization': `Bearer ${supaKey}`
            }
          }
        );
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data) && data.length > 0) {
            return data;
          }
        }
      } catch (e) {
        console.error('[AuditLogger] getLogs from Supabase failed:', e.message);
      }
    }

    // Fallback to in-memory
    return this.logs.slice(-200).reverse();
  }

  /**
   * GAP #24 FIX: Export audit trail from Supabase with date filters
   */
  async export(startDate, endDate, env) {
    const supaUrl = this.config.supabaseUrl || (env && env.SUPABASE_URL);
    const supaKey = this.config.supabaseKey || (env && env.SUPABASE_KEY);

    if (supaUrl && supaKey) {
      try {
        let query = `${supaUrl}/rest/v1/audit_trail?order=created_at.desc&limit=5000`;
        if (startDate) query += `&created_at=gte.${startDate}`;
        if (endDate) query += `&created_at=lte.${endDate}`;

        const resp = await fetch(query, {
          headers: {
            'apikey': supaKey,
            'Authorization': `Bearer ${supaKey}`
          }
        });
        if (resp.ok) {
          return await resp.json();
        }
      } catch (e) {
        console.error('[AuditLogger] export from Supabase failed:', e.message);
      }
    }

    // Fallback to in-memory export
    return this.query(
      { startDate, endDate },
      { limit: 5000 }
    );
  }
}


/**
 * Pre-configured audit helpers
 */
class AuditHelpers {
  constructor(logger) {
    this.logger = logger;
  }

  async logLogin(user, context = {}) {
    return this.logger.log(AuditEventTypes.AUTH_LOGIN, {
      userId: user.id,
      userEmail: user.email,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      details: {
        method: context.method || 'password',
        mfaUsed: context.mfaUsed || false
      }
    });
  }

  async logAPIRequest(request, response, context = {}) {
    return this.logger.log(AuditEventTypes.AI_REQUEST_COMPLETED, {
      userId: context.userId,
      apiKeyId: context.apiKeyId,
      teamId: context.teamId,
      costCenter: context.costCenter,
      details: {
        provider: request.provider,
        model: request.model,
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
        cost: response.cost,
        latencyMs: response.latencyMs
      },
      success: true
    });
  }

  async logBudgetAlert(budget, percentUsed, context = {}) {
    const eventType = percentUsed >= 100
      ? AuditEventTypes.BUDGET_EXCEEDED
      : AuditEventTypes.BUDGET_THRESHOLD_REACHED;

    return this.logger.log(eventType, {
      targetType: 'budget',
      targetId: budget.id,
      targetName: budget.name,
      teamId: budget.teamId,
      costCenter: budget.costCenter,
      details: {
        limit: budget.limit,
        used: budget.used,
        percentUsed,
        threshold: budget.alertThreshold
      }
    });
  }

  async logKeyRotation(oldKeyId, newKeyId, context = {}) {
    return this.logger.log(AuditEventTypes.KEY_ROTATED, {
      userId: context.userId,
      targetType: 'api_key',
      targetId: newKeyId,
      details: {
        previousKeyId: oldKeyId,
        reason: context.reason || 'manual_rotation'
      }
    });
  }
}


module.exports = {
  AuditLogger,
  AuditHelpers,
  AuditEventTypes,
  AuditSeverity
};
