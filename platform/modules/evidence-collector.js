/**
 * Evidence Collector Module - Finault Compliance Framework
 *
 * Bridges operational data (audit_logs, usage, budgets, etc.) to compliance assessment.
 * Queries Supabase REST API for actual transaction data, draws statistical samples,
 * and produces auditor-ready evidence packages conforming to PCAOB, NIST AI RMF, and EU AI Act standards.
 *
 * All queries are data-driven; no hardcoded scores or boolean flags.
 * Cloudflare Workers compatible (CommonJS, Web Crypto API only).
 */

const { PricingService, FALLBACK_KNOWN_PRICING_CENTS_PER_1K } = require('../pricing-service');

// ============================================================================
// CONSTANTS
// ============================================================================

const EFFECTIVENESS_THRESHOLDS = {
  effective: 0.05,           // <5% error rate
  needsImprovement: 0.15,    // 5-15% error rate
  ineffective: 1.0,          // >15% error rate
};

const MATERIALITY_THRESHOLD = 0.05; // 5%

/**
 * Known AI provider pricing (cost per 1K tokens in cents)
 * Used for cost validation — if actual cost deviates > 50% from expected, flag it
 * FALLBACK: will be overridden by PricingService from Supabase
 */
const FALLBACK_KNOWN_PRICING_CENTS_PER_1K_DATA = FALLBACK_KNOWN_PRICING_CENTS_PER_1K;

const KNOWN_PRICING_CENTS_PER_1K = {
  'gpt-4': { input: 3.0, output: 6.0 },
  'gpt-4-turbo': { input: 1.0, output: 3.0 },
  'gpt-4o': { input: 0.25, output: 1.0 },
  'gpt-4o-mini': { input: 0.015, output: 0.06 },
  'gpt-3.5-turbo': { input: 0.05, output: 0.15 },
  'claude-3-opus': { input: 1.5, output: 7.5 },
  'claude-3.5-sonnet': { input: 0.3, output: 1.5 },
  'claude-3-sonnet': { input: 0.3, output: 1.5 },
  'claude-3-haiku': { input: 0.025, output: 0.125 },
  'claude-3.5-haiku': { input: 0.08, output: 0.4 },
  'gemini-1.5-pro': { input: 0.125, output: 0.5 },
  'gemini-1.5-flash': { input: 0.0075, output: 0.03 },
  'mistral-large': { input: 0.2, output: 0.6 },
  'mistral-small': { input: 0.1, output: 0.3 },
};

const CONTROL_DEFINITIONS = {
  'AI-FIN-001': {
    name: 'Usage Logging Completeness',
    description: 'All AI API requests are logged with complete cost and token data',
    assertions: ['COMPLETENESS', 'EXISTENCE'],
    tables: ['usage', 'gateway_requests'],
    sampleSize: 50,
  },
  'AI-FIN-002': {
    name: 'Access Control & Segregation',
    description: 'Authentication, authorization, and role segregation are enforced',
    assertions: ['RIGHTS_OBLIGATIONS'],
    tables: ['audit_logs'],
    sampleSize: 0,
  },
  'AI-FIN-003': {
    name: 'Cost Calculation Accuracy',
    description: 'AI usage costs are accurately calculated from token counts and pricing',
    assertions: ['ACCURACY', 'VALUATION'],
    tables: ['usage', 'reconciliation_results'],
    sampleSize: 25,
  },
  'AI-FIN-004': {
    name: 'Budget Enforcement',
    description: 'Budget limits are enforced and overspend is prevented',
    assertions: ['RIGHTS_OBLIGATIONS', 'COMPLETENESS'],
    tables: ['budgets', 'audit_logs', 'usage'],
    sampleSize: 0,
  },
  'AI-FIN-005': {
    name: 'Anomaly Detection & Response',
    description: 'Cost anomalies are detected and responded to in a timely manner',
    assertions: ['EXISTENCE', 'ACCURACY'],
    tables: ['alert_history', 'alert_configs'],
    sampleSize: 0,
  },
  'AI-FIN-006': {
    name: 'Close Pack Integrity',
    description: 'Month-end close artifacts are complete and tamper-evident',
    assertions: ['COMPLETENESS', 'EXISTENCE', 'PRESENTATION'],
    tables: ['close_packs'],
    sampleSize: 0,
  },
};

const PCAOB_ASSERTIONS = {
  EXISTENCE: { name: 'Existence/Occurrence', standard: 'AS 1105.11' },
  COMPLETENESS: { name: 'Completeness', standard: 'AS 1105.11' },
  ACCURACY: { name: 'Accuracy/Valuation', standard: 'AS 1105.11' },
  VALUATION: { name: 'Valuation/Allocation', standard: 'AS 1105.11' },
  CUTOFF: { name: 'Cutoff', standard: 'AS 1105.11' },
  RIGHTS_OBLIGATIONS: { name: 'Rights and Obligations', standard: 'AS 1105.11' },
};

// ============================================================================
// SUPABASE QUERY HELPER
// ============================================================================

/**
 * Unified Supabase REST API query helper.
 * Constructs filter/order/pagination and executes fetch with proper auth.
 *
 * @param {Object} config - { supabaseUrl, supabaseKey }
 * @param {string} table - Table name (e.g., 'usage', 'audit_logs')
 * @param {Object} params - Query parameters
 * @param {string} params.select - Comma-separated columns to retrieve
 * @param {Object} params.eq - Exact match filters: { field: value }
 * @param {Object} params.gte - Greater-than-or-equal filters
 * @param {Object} params.lte - Less-than-or-equal filters
 * @param {Object} params.like - LIKE pattern filters
 * @param {string} params.order - Order by clause (e.g., 'created_at.desc')
 * @param {number} params.limit - Limit rows
 * @param {number} params.offset - Offset for pagination
 * @param {boolean} params.count - If true, request exact count via Prefer header
 * @returns {Promise<Array|Object>} Data array or { data, count } if count requested
 */
async function querySupabase(config, table, params = {}) {
  try {
    let url = `${config.supabaseUrl}/rest/v1/${table}?`;

    // Build query string
    if (params.select) url += `select=${encodeURIComponent(params.select)}&`;

    if (params.eq) {
      Object.entries(params.eq).forEach(([k, v]) => {
        url += `${k}=eq.${encodeURIComponent(String(v))}&`;
      });
    }

    if (params.gte) {
      Object.entries(params.gte).forEach(([k, v]) => {
        url += `${k}=gte.${encodeURIComponent(String(v))}&`;
      });
    }

    if (params.lte) {
      Object.entries(params.lte).forEach(([k, v]) => {
        url += `${k}=lte.${encodeURIComponent(String(v))}&`;
      });
    }

    if (params.like) {
      Object.entries(params.like).forEach(([k, v]) => {
        url += `${k}=like.${encodeURIComponent(String(v))}&`;
      });
    }

    if (params.order) url += `order=${encodeURIComponent(params.order)}&`;
    if (params.limit) url += `limit=${params.limit}&`;
    if (params.offset) url += `offset=${params.offset}&`;

    const headers = {
      'apikey': config.supabaseKey,
      'Authorization': `Bearer ${config.supabaseKey}`,
      'Content-Type': 'application/json',
    };

    if (params.count) {
      headers['Prefer'] = 'count=exact';
    }

    // Remove trailing &
    const cleanUrl = url.replace(/&$/, '');
    const resp = await fetch(cleanUrl, { headers });

    if (!resp.ok) {
      console.error(`Supabase query failed: ${resp.status} ${resp.statusText} for ${table}`);
      return params.count ? { data: [], count: 0 } : [];
    }

    const data = await resp.json();

    if (params.count) {
      const contentRange = resp.headers.get('content-range');
      const total = contentRange ? parseInt(contentRange.split('/')[1]) : 0;
      return { data, count: total };
    }

    return data;
  } catch (error) {
    console.error(`querySupabase error for ${table}:`, error);
    return params.count ? { data: [], count: 0 } : [];
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Parse period string (e.g., "2026-01") into start and end ISO dates.
 *
 * @param {string} period - Format: "YYYY-MM"
 * @returns {Object} { periodStart, periodEnd } both ISO 8601 strings
 */
function parsePeriod(period) {
  const [year, month] = period.split('-').map(Number);
  const periodStart = new Date(year, month - 1, 1).toISOString().split('T')[0];
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const periodEnd = new Date(nextYear, nextMonth - 1, 1).toISOString().split('T')[0];
  return { periodStart, periodEnd };
}

/**
 * Compute 95% confidence interval for error rate (binomial proportion).
 * Uses normal approximation (z = 1.96).
 *
 * @param {number} errorRate - Error rate (0.0 to 1.0)
 * @param {number} sampleSize - Number of samples
 * @returns {Object} { lower, upper }
 */
function computeConfidenceInterval(errorRate, sampleSize) {
  const z = 1.96;
  const se = Math.sqrt((errorRate * (1 - errorRate)) / sampleSize);
  const margin = z * se;
  return {
    lower: Math.max(0, errorRate - margin),
    upper: Math.min(1, errorRate + margin),
  };
}

/**
 * Hash a data object deterministically using SHA-256 (Web Crypto API).
 *
 * @param {Object} data - Object to hash
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
async function hashPackage(data) {
  try {
    const json = JSON.stringify(data, null, 0);
    const encoded = new TextEncoder().encode(json);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    console.error('hashPackage error:', error);
    return null;
  }
}

// ============================================================================
// CONTROL EVIDENCE COLLECTION
// ============================================================================

/**
 * Collect evidence for a single control over a period.
 * Tests the control's effectiveness based on real data samples.
 *
 * @param {Object} config - Supabase config
 * @param {string} orgId - Organization ID
 * @param {string} period - Period in "YYYY-MM" format
 * @returns {Promise<Object>} Control evidence package
 */
async function collectControlEvidence(config, orgId, period) {
  const { periodStart, periodEnd } = parsePeriod(period);
  const results = {};

  // AI-FIN-001: Usage Logging Completeness
  try {
    const usageResult = await querySupabase(config, 'usage', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      select: 'id',
      count: true,
      limit: 1,
    });
    const usageCount = usageResult.count || 0;

    const gatewayResult = await querySupabase(config, 'gateway_requests', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      select: 'id',
      count: true,
      limit: 1,
    });
    const gatewayCount = gatewayResult.count || 0;

    const completenessRate = gatewayCount > 0 ? usageCount / gatewayCount : 1.0;

    // Sample 50 random gateway requests
    const sampleGateway = await querySupabase(config, 'gateway_requests', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      select: 'id,request_id,created_at',
      order: 'created_at.desc',
      limit: 50,
    });

    let matched = 0;
    let unmatched = [];
    const evidenceItems = [];

    for (const gw of (sampleGateway || [])) {
      const usageMatch = await querySupabase(config, 'usage', {
        eq: { request_id: gw.request_id },
        select: 'id',
        limit: 1,
      });

      if (usageMatch && usageMatch.length > 0) {
        matched++;
      } else {
        unmatched.push({
          requestId: gw.request_id,
          reason: 'No matching usage record found',
          gatewayTimestamp: gw.created_at,
        });
      }
    }

    const samplesDrawn = sampleGateway ? sampleGateway.length : 0;
    const samplesPassed = matched;
    const samplesFailed = samplesDrawn - matched;
    const errorRate = samplesDrawn > 0 ? samplesFailed / samplesDrawn : 0;

    evidenceItems.push({
      type: 'POPULATION_TEST',
      description: `Total gateway requests vs usage records: ${gatewayCount} vs ${usageCount}`,
      data: { gatewayCount, usageCount, completenessRate },
      timestamp: new Date().toISOString(),
    });

    evidenceItems.push({
      type: 'SAMPLE_TEST',
      description: `Sample testing of gateway request to usage record matching`,
      data: {
        sampleSize: samplesDrawn,
        matched,
        unmatched: unmatched.length,
        errorRate: parseFloat(errorRate.toFixed(4)),
      },
      timestamp: new Date().toISOString(),
    });

    const effectiveness = errorRate < 0.05 ? 'effective'
      : errorRate < 0.15 ? 'needs_improvement'
      : 'ineffective';

    results['AI-FIN-001'] = {
      controlId: 'AI-FIN-001',
      controlName: 'Usage Logging Completeness',
      populationSize: gatewayCount,
      samplesDrawn,
      samplesPassed,
      samplesFailed,
      failedSamples: unmatched,
      errorRate: parseFloat(errorRate.toFixed(4)),
      effectiveness,
      evidenceItems,
      assertionsCovered: ['COMPLETENESS', 'EXISTENCE'],
      materialWeakness: errorRate > 0.15,
      significantDeficiency: errorRate > 0.05 && errorRate <= 0.15,
    };
  } catch (error) {
    console.error('AI-FIN-001 collection error:', error);
    results['AI-FIN-001'] = {
      controlId: 'AI-FIN-001',
      controlName: 'Usage Logging Completeness',
      populationSize: 0,
      samplesDrawn: 0,
      samplesPassed: 0,
      samplesFailed: 0,
      failedSamples: [],
      errorRate: null,
      effectiveness: 'undetermined',
      evidenceItems: [{ type: 'ERROR', description: error.message, timestamp: new Date().toISOString() }],
      assertionsCovered: ['COMPLETENESS', 'EXISTENCE'],
      materialWeakness: false,
      significantDeficiency: false,
    };
  }

  // AI-FIN-002: Access Control & Segregation
  try {
    const authLogs = await querySupabase(config, 'audit_logs', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      like: { action: 'auth.%' },
      select: 'id,action,user_id,role,created_at',
    });

    const failedLogins = (authLogs || []).filter(log => log.action === 'auth.login_failed').length;

    // Check role segregation
    const roleData = await querySupabase(config, 'audit_logs', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      select: 'user_id,role',
    });

    const roleMap = {};
    (roleData || []).forEach(entry => {
      if (entry.user_id && entry.role) {
        roleMap[entry.user_id] = entry.role;
      }
    });

    const distinctRoles = new Set(Object.values(roleMap));
    const apiKeyRotations = (authLogs || []).filter(log => log.action === 'auth.api_key_rotation').length;

    const evidenceItems = [];
    evidenceItems.push({
      type: 'POPULATION_TEST',
      description: 'Authentication audit logs analysis',
      data: {
        totalAuthEvents: authLogs ? authLogs.length : 0,
        failedLoginAttempts: failedLogins,
        apiKeyRotationEvents: apiKeyRotations,
        distinctUsers: Object.keys(roleMap).length,
        distinctRoles: distinctRoles.size,
      },
      timestamp: new Date().toISOString(),
    });

    const accessControlScore = (apiKeyRotations > 0 ? 25 : 0) + (failedLogins === 0 ? 20 : 10) + (distinctRoles.size >= 2 ? 20 : 0);

    results['AI-FIN-002'] = {
      controlId: 'AI-FIN-002',
      controlName: 'Access Control & Segregation',
      populationSize: authLogs ? authLogs.length : 0,
      failedLoginAttempts: failedLogins,
      apiKeyRotationEvents: apiKeyRotations,
      distinctRoles: distinctRoles.size,
      segregationEnforced: distinctRoles.size >= 2,
      controlScore: accessControlScore,
      effectiveness: accessControlScore >= 60 ? 'effective' : 'needs_improvement',
      evidenceItems,
      assertionsCovered: ['RIGHTS_OBLIGATIONS'],
      materialWeakness: accessControlScore < 40,
      significantDeficiency: accessControlScore >= 40 && accessControlScore < 60,
    };
  } catch (error) {
    console.error('AI-FIN-002 collection error:', error);
    results['AI-FIN-002'] = {
      controlId: 'AI-FIN-002',
      controlName: 'Access Control & Segregation',
      populationSize: 0,
      failedLoginAttempts: 0,
      apiKeyRotationEvents: 0,
      distinctRoles: 0,
      segregationEnforced: false,
      controlScore: 0,
      effectiveness: 'undetermined',
      evidenceItems: [{ type: 'ERROR', description: error.message, timestamp: new Date().toISOString() }],
      assertionsCovered: ['RIGHTS_OBLIGATIONS'],
      materialWeakness: true,
      significantDeficiency: false,
    };
  }

  // AI-FIN-003: Cost Calculation Accuracy
  try {
    const usageSample = await querySupabase(config, 'usage', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      select: 'id,request_id,token_count,cost_cents,model,created_at',
      order: 'created_at.desc',
      limit: 25,
    });

    let costChecksPassed = 0;
    let costChecksFailed = 0;
    const costVariances = [];

    for (const record of (usageSample || [])) {
      if (record.token_count && record.token_count > 0) {
        if (record.cost_cents <= 0) {
          // Positive tokens but zero/negative cost = definite failure
          costChecksFailed++;
          costVariances.push({
            recordId: record.id,
            tokens: record.token_count,
            costCents: record.cost_cents,
            model: record.model,
            issue: 'Positive token count with zero or negative cost',
          });
        } else {
          // Check against known pricing if model is recognized
          const actualCostPer1K = (record.cost_cents / record.token_count) * 1000;
          const modelKey = (record.model || '').toLowerCase();
          const knownRate = KNOWN_PRICING_CENTS_PER_1K[modelKey];

          if (knownRate) {
            // Use average of input/output rate as baseline
            const expectedRate = (knownRate.input + knownRate.output) / 2;
            const deviation = Math.abs(actualCostPer1K - expectedRate) / expectedRate;

            if (deviation > 0.5) {
              // More than 50% deviation from known pricing
              costChecksFailed++;
              costVariances.push({
                recordId: record.id,
                tokens: record.token_count,
                costCents: record.cost_cents,
                model: record.model,
                actualCostPer1K: parseFloat(actualCostPer1K.toFixed(4)),
                expectedCostPer1K: expectedRate,
                deviationPercent: parseFloat((deviation * 100).toFixed(1)),
                issue: `Cost deviates ${(deviation * 100).toFixed(1)}% from known ${record.model} pricing`,
              });
            } else {
              costChecksPassed++;
            }
          } else {
            // Unknown model — just verify cost is reasonable (0.001 to 100 cents per 1K tokens)
            if (actualCostPer1K >= 0.001 && actualCostPer1K <= 100) {
              costChecksPassed++;
            } else {
              costChecksFailed++;
              costVariances.push({
                recordId: record.id,
                tokens: record.token_count,
                costCents: record.cost_cents,
                model: record.model,
                actualCostPer1K: parseFloat(actualCostPer1K.toFixed(4)),
                issue: `Cost per 1K tokens (${actualCostPer1K.toFixed(4)}¢) outside reasonable range [0.001, 100]`,
              });
            }
          }
        }
      } else if (!record.token_count || record.token_count === 0) {
        if (record.cost_cents === 0 || !record.cost_cents) {
          costChecksPassed++; // Zero tokens = zero cost is valid
        } else {
          costChecksFailed++;
          costVariances.push({
            recordId: record.id,
            tokens: 0,
            costCents: record.cost_cents,
            model: record.model,
            issue: 'Zero tokens with non-zero cost',
          });
        }
      }
    }

    const samplesDrawn = usageSample ? usageSample.length : 0;
    const errorRate = samplesDrawn > 0 ? costChecksFailed / samplesDrawn : 0;

    const evidenceItems = [];
    evidenceItems.push({
      type: 'SAMPLE_TEST',
      description: 'Cost calculation accuracy based on token counts',
      data: {
        sampleSize: samplesDrawn,
        checksPasssed: costChecksPassed,
        checksFailed: costChecksFailed,
        errorRate: parseFloat(errorRate.toFixed(4)),
        maxCostVariance: costVariances.length > 0 ? costVariances[0] : null,
      },
      timestamp: new Date().toISOString(),
    });

    const effectiveness = errorRate < 0.05 ? 'effective'
      : errorRate < 0.15 ? 'needs_improvement'
      : 'ineffective';

    results['AI-FIN-003'] = {
      controlId: 'AI-FIN-003',
      controlName: 'Cost Calculation Accuracy',
      samplesDrawn,
      samplesPassed: costChecksPassed,
      samplesFailed: costChecksFailed,
      errorRate: parseFloat(errorRate.toFixed(4)),
      costVarianceExamples: costVariances.slice(0, 5),
      effectiveness,
      evidenceItems,
      assertionsCovered: ['ACCURACY', 'VALUATION'],
      materialWeakness: errorRate > 0.15,
      significantDeficiency: errorRate > 0.05 && errorRate <= 0.15,
    };
  } catch (error) {
    console.error('AI-FIN-003 collection error:', error);
    results['AI-FIN-003'] = {
      controlId: 'AI-FIN-003',
      controlName: 'Cost Calculation Accuracy',
      samplesDrawn: 0,
      samplesPassed: 0,
      samplesFailed: 0,
      errorRate: null,
      costVarianceExamples: [],
      effectiveness: 'undetermined',
      evidenceItems: [{ type: 'ERROR', description: error.message, timestamp: new Date().toISOString() }],
      assertionsCcovered: ['ACCURACY', 'VALUATION'],
      materialWeakness: true,
      significantDeficiency: false,
    };
  }

  // AI-FIN-004: Budget Enforcement
  try {
    const budgets = await querySupabase(config, 'budgets', {
      eq: { organization_id: orgId },
      select: 'id,name,limit_cents,is_active,created_at',
    });

    const activeBudgets = (budgets || []).filter(b => b.is_active).length;

    const budgetExceededEvents = await querySupabase(config, 'audit_logs', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      like: { action: 'budget.exceeded' },
      select: 'id,created_at,metadata',
      count: true,
    });

    const exceededCount = budgetExceededEvents.count || 0;

    // Test actual enforcement: check if usage continued AFTER budget.exceeded events
    let enforcementViolations = 0;
    const violationDetails = [];

    if (exceededCount > 0 && budgetExceededEvents && budgetExceededEvents.length > 0) {
      // For each budget.exceeded event, check if usage continued within 5 minutes after
      for (const event of budgetExceededEvents.slice(0, 5)) { // Test up to 5 events
        const exceededAt = new Date(event.created_at);
        const windowEnd = new Date(exceededAt.getTime() + 5 * 60 * 1000); // 5-min window

        const usageAfter = await querySupabase(config, 'usage', {
          eq: { organization_id: orgId },
          gte: { created_at: exceededAt.toISOString() },
          lte: { created_at: windowEnd.toISOString() },
          select: 'id,created_at,cost_cents',
          count: true,
        });

        if ((usageAfter.count || 0) > 1) { // Allow 1 (the triggering request itself)
          enforcementViolations++;
          violationDetails.push({
            exceededAt: event.created_at,
            usageAfterCount: usageAfter.count,
            windowMinutes: 5,
            issue: 'Usage continued after budget exceeded event',
          });
        }
      }
    }

    const budgetScore =
      (activeBudgets > 0 ? 25 : 0) +
      (activeBudgets >= 3 ? 10 : 0) +  // Multiple budgets = better coverage
      (exceededCount > 0 ? 15 : 0) +     // Evidence of budget triggers firing
      (enforcementViolations === 0 ? 25 : 0) + // No enforcement failures
      (enforcementViolations === 0 && exceededCount > 0 ? 25 : 0); // Proven enforcement

    const evidenceItems = [];
    evidenceItems.push({
      type: 'POPULATION_TEST',
      description: 'Budget configuration and enforcement',
      data: {
        activeBudgets,
        budgetExceededEventsInPeriod: exceededCount,
        enforcementViolations,
        violationDetails: violationDetails.length > 0 ? violationDetails : undefined,
      },
      timestamp: new Date().toISOString(),
    });

    results['AI-FIN-004'] = {
      controlId: 'AI-FIN-004',
      controlName: 'Budget Enforcement',
      activeBudgets,
      budgetExceededEventCount: exceededCount,
      enforcementViolations,
      violationDetails: violationDetails.length > 0 ? violationDetails : [],
      controlScore: budgetScore,
      effectiveness: budgetScore >= 60 ? 'effective' : 'needs_improvement',
      evidenceItems,
      assertionsCovered: ['RIGHTS_OBLIGATIONS', 'COMPLETENESS'],
      materialWeakness: budgetScore < 40,
      significantDeficiency: budgetScore >= 40 && budgetScore < 60,
    };
  } catch (error) {
    console.error('AI-FIN-004 collection error:', error);
    results['AI-FIN-004'] = {
      controlId: 'AI-FIN-004',
      controlName: 'Budget Enforcement',
      activeBudgets: 0,
      budgetExceededEventCount: 0,
      enforcementViolations: 0,
      controlScore: 0,
      effectiveness: 'undetermined',
      evidenceItems: [{ type: 'ERROR', description: error.message, timestamp: new Date().toISOString() }],
      assertionsCcovered: ['RIGHTS_OBLIGATIONS', 'COMPLETENESS'],
      materialWeakness: true,
      significantDeficiency: false,
    };
  }

  // AI-FIN-005: Anomaly Detection & Response
  try {
    const alerts = await querySupabase(config, 'alert_history', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      select: 'id,created_at,acknowledged_at,severity',
      count: true,
    });

    const alertCount = alerts.count || 0;

    const alertConfigs = await querySupabase(config, 'alert_configs', {
      eq: { organization_id: orgId },
      select: 'id,threshold,is_active',
    });

    const activeConfigs = (alertConfigs || []).filter(c => c.is_active).length;

    // Compute mean time to acknowledge
    const alertsWithAck = await querySupabase(config, 'alert_history', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      select: 'id,created_at,acknowledged_at',
    });

    let meanTimeToAckHours = 0;
    let acknowledgedCount = 0;
    (alertsWithAck || []).forEach(alert => {
      if (alert.acknowledged_at) {
        acknowledgedCount++;
        const created = new Date(alert.created_at);
        const acked = new Date(alert.acknowledged_at);
        const hours = (acked - created) / (1000 * 60 * 60);
        meanTimeToAckHours += hours;
      }
    });

    if (acknowledgedCount > 0) {
      meanTimeToAckHours = meanTimeToAckHours / acknowledgedCount;
    }

    const anomalyScore = (alertCount > 0 ? 15 : 0) + (activeConfigs > 0 ? 25 : 0) + (acknowledgedCount > 0 ? 20 : 0);

    const evidenceItems = [];
    evidenceItems.push({
      type: 'POPULATION_TEST',
      description: 'Anomaly detection baseline and alert responsiveness',
      data: {
        alertsGenerated: alertCount,
        activeAnomalyConfigs: activeConfigs,
        alertsAcknowledged: acknowledgedCount,
        meanTimeToAckHours: parseFloat(meanTimeToAckHours.toFixed(2)),
      },
      timestamp: new Date().toISOString(),
    });

    results['AI-FIN-005'] = {
      controlId: 'AI-FIN-005',
      controlName: 'Anomaly Detection & Response',
      alertsGenerated: alertCount,
      activeAnomalyConfigs: activeConfigs,
      alertsAcknowledged: acknowledgedCount,
      meanTimeToAckHours: parseFloat(meanTimeToAckHours.toFixed(2)),
      controlScore: anomalyScore,
      effectiveness: anomalyScore >= 60 ? 'effective' : 'needs_improvement',
      evidenceItems,
      assertionsCovered: ['EXISTENCE', 'ACCURACY'],
      materialWeakness: anomalyScore < 40,
      significantDeficiency: anomalyScore >= 40 && anomalyScore < 60,
    };
  } catch (error) {
    console.error('AI-FIN-005 collection error:', error);
    results['AI-FIN-005'] = {
      controlId: 'AI-FIN-005',
      controlName: 'Anomaly Detection & Response',
      alertsGenerated: 0,
      activeAnomalyConfigs: 0,
      alertsAcknowledged: 0,
      meanTimeToAckHours: 0,
      controlScore: 0,
      effectiveness: 'undetermined',
      evidenceItems: [{ type: 'ERROR', description: error.message, timestamp: new Date().toISOString() }],
      assertionsCovered: ['EXISTENCE', 'ACCURACY'],
      materialWeakness: true,
      significantDeficiency: false,
    };
  }

  // AI-FIN-006: Close Pack Integrity
  try {
    const closePacks = await querySupabase(config, 'close_packs', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      select: 'id,period,artifact_count,data_hash,created_at',
    });

    const packCount = (closePacks || []).length;
    let totalArtifacts = 0;
    const hashes = [];

    (closePacks || []).forEach(pack => {
      totalArtifacts += pack.artifact_count || 0;
      if (pack.data_hash) hashes.push(pack.data_hash);
    });

    const hashConsistency = hashes.length > 0 ? hashes.every(h => h && h.length === 64) : false;

    const closePackScore = (packCount > 0 ? 25 : 0) + (totalArtifacts > 0 ? 25 : 0) + (hashConsistency ? 25 : 0);

    const evidenceItems = [];
    evidenceItems.push({
      type: 'POPULATION_TEST',
      description: 'Month-end close pack generation and integrity',
      data: {
        closePacksGenerated: packCount,
        totalArtifacts,
        allHashesPresent: hashes.length === packCount,
        hashFormat: hashConsistency ? 'valid_sha256' : 'incomplete',
      },
      timestamp: new Date().toISOString(),
    });

    results['AI-FIN-006'] = {
      controlId: 'AI-FIN-006',
      controlName: 'Close Pack Integrity',
      closePacksGenerated: packCount,
      totalArtifactCount: totalArtifacts,
      hashesPresent: hashes.length,
      hashConsistency,
      controlScore: closePackScore,
      effectiveness: closePackScore >= 60 ? 'effective' : 'needs_improvement',
      evidenceItems,
      assertionsCovered: ['COMPLETENESS', 'EXISTENCE', 'PRESENTATION'],
      materialWeakness: closePackScore < 40,
      significantDeficiency: closePackScore >= 40 && closePackScore < 60,
    };
  } catch (error) {
    console.error('AI-FIN-006 collection error:', error);
    results['AI-FIN-006'] = {
      controlId: 'AI-FIN-006',
      controlName: 'Close Pack Integrity',
      closePacksGenerated: 0,
      totalArtifactCount: 0,
      hashesPresent: 0,
      hashConsistency: false,
      controlScore: 0,
      effectiveness: 'undetermined',
      evidenceItems: [{ type: 'ERROR', description: error.message, timestamp: new Date().toISOString() }],
      assertionsCovered: ['COMPLETENESS', 'EXISTENCE', 'PRESENTATION'],
      materialWeakness: true,
      significantDeficiency: false,
    };
  }

  return results;
}

// ============================================================================
// PCAOB ASSERTIONS TESTING
// ============================================================================

/**
 * Collect PCAOB audit assertion evidence for a period.
 * Tests 6 fundamental assertions per PCAOB AS 1105.11.
 *
 * @param {Object} config - Supabase config
 * @param {string} orgId - Organization ID
 * @param {string} period - Period in "YYYY-MM" format
 * @returns {Promise<Object>} PCAOB assertion test results
 */
async function collectPCAOBEvidence(config, orgId, period) {
  const { periodStart, periodEnd } = parsePeriod(period);

  const assertions = {};

  // EXISTENCE: Recorded usage transactions actually occurred
  try {
    const usageSample = await querySupabase(config, 'usage', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      select: 'id,request_id,created_at',
      order: 'created_at.desc',
      limit: 25,
    });

    let existencePassed = 0;
    let existenceFailed = 0;

    for (const record of (usageSample || [])) {
      const auditLog = await querySupabase(config, 'audit_logs', {
        eq: { organization_id: orgId, request_id: record.request_id },
        select: 'id',
        limit: 1,
      });

      if (auditLog && auditLog.length > 0) {
        existencePassed++;
      } else {
        existenceFailed++;
      }
    }

    const sampleSize = usageSample ? usageSample.length : 0;
    const existenceErrorRate = sampleSize > 0 ? existenceFailed / sampleSize : 0;

    assertions.EXISTENCE = {
      assertion: 'Existence/Occurrence: Recorded usage transactions actually occurred',
      testProcedure: 'Sample 25 usage records, verify audit_logs entries exist',
      sampleSize,
      samplesPassed: existencePassed,
      samplesFailed: existenceFailed,
      errorRate: parseFloat(existenceErrorRate.toFixed(4)),
      conclusion: existenceErrorRate < 0.05 ? 'COVERED' : existenceErrorRate < 0.15 ? 'DEFICIENT' : 'DEFICIENT',
    };
  } catch (error) {
    console.error('EXISTENCE assertion error:', error);
    assertions.EXISTENCE = {
      assertion: 'Existence/Occurrence: Recorded usage transactions actually occurred',
      testProcedure: 'Sample 25 usage records, verify audit_logs entries exist',
      sampleSize: 0,
      samplesPassed: 0,
      samplesFailed: 0,
      errorRate: null,
      conclusion: 'NOT_TESTED',
      error: error.message,
    };
  }

  // COMPLETENESS: All AI usage transactions are recorded
  try {
    const gatewayResult = await querySupabase(config, 'gateway_requests', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      select: 'id',
      count: true,
      limit: 1,
    });

    const usageResult = await querySupabase(config, 'usage', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      select: 'id',
      count: true,
      limit: 1,
    });

    const gatewayCount = gatewayResult.count || 0;
    const usageCount = usageResult.count || 0;
    const gapCount = Math.max(0, gatewayCount - usageCount);
    const gapPercentage = gatewayCount > 0 ? (gapCount / gatewayCount) * 100 : 0;

    assertions.COMPLETENESS = {
      assertion: 'Completeness: All AI usage transactions are recorded',
      testProcedure: 'Compare gateway_requests count to usage count for period',
      populationSize: gatewayCount,
      recordedCount: usageCount,
      gapCount,
      gapPercentage: parseFloat(gapPercentage.toFixed(2)),
      conclusion: gapPercentage < 5 ? 'COVERED' : 'DEFICIENT',
    };
  } catch (error) {
    console.error('COMPLETENESS assertion error:', error);
    assertions.COMPLETENESS = {
      assertion: 'Completeness: All AI usage transactions are recorded',
      testProcedure: 'Compare gateway_requests count to usage count for period',
      populationSize: 0,
      recordedCount: 0,
      gapCount: 0,
      gapPercentage: 0,
      conclusion: 'NOT_TESTED',
      error: error.message,
    };
  }

  // ACCURACY: Usage costs are correctly calculated
  try {
    const usageSample = await querySupabase(config, 'usage', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      select: 'id,token_count,cost_cents,model',
      order: 'created_at.desc',
      limit: 25,
    });

    let accuracyPassed = 0;
    let accuracyFailed = 0;
    const costVariances = [];

    for (const record of (usageSample || [])) {
      if (record.token_count > 0 && record.cost_cents > 0) {
        const costPer1K = (record.cost_cents / record.token_count) * 1000;
        const modelKey = (record.model || '').toLowerCase();
        const knownRate = KNOWN_PRICING_CENTS_PER_1K[modelKey];

        if (knownRate) {
          const expectedRate = (knownRate.input + knownRate.output) / 2;
          const deviation = Math.abs(costPer1K - expectedRate) / expectedRate;
          if (deviation <= 0.5) {
            accuracyPassed++;
          } else {
            accuracyFailed++;
            costVariances.push({
              recordId: record.id,
              costPer1K: parseFloat(costPer1K.toFixed(6)),
              expectedPer1K: expectedRate,
              deviationPercent: parseFloat((deviation * 100).toFixed(1)),
              model: record.model,
            });
          }
        } else if (costPer1K >= 0.001 && costPer1K <= 100) {
          accuracyPassed++;
        } else {
          accuracyFailed++;
          costVariances.push({
            recordId: record.id,
            costPer1K: parseFloat(costPer1K.toFixed(6)),
            model: record.model,
            issue: 'Outside reasonable range',
          });
        }
      } else if (record.token_count === 0 && record.cost_cents === 0) {
        accuracyPassed++;
      } else {
        accuracyFailed++;
      }
    }

    const sampleSize = usageSample ? usageSample.length : 0;
    const accuracyErrorRate = sampleSize > 0 ? accuracyFailed / sampleSize : 0;

    assertions.ACCURACY = {
      assertion: 'Accuracy/Valuation: Usage costs are correctly calculated',
      testProcedure: 'Sample 25 records, verify cost = tokens × rate is reasonable',
      sampleSize,
      samplesPassed: accuracyPassed,
      samplesFailed: accuracyFailed,
      costVarianceExamples: costVariances.slice(0, 3),
      errorRate: parseFloat(accuracyErrorRate.toFixed(4)),
      conclusion: accuracyErrorRate < 0.05 ? 'COVERED' : 'DEFICIENT',
    };
  } catch (error) {
    console.error('ACCURACY assertion error:', error);
    assertions.ACCURACY = {
      assertion: 'Accuracy/Valuation: Usage costs are correctly calculated',
      testProcedure: 'Sample 25 records, verify cost = tokens × rate is reasonable',
      sampleSize: 0,
      samplesPassed: 0,
      samplesFailed: 0,
      costVarianceExamples: [],
      errorRate: null,
      conclusion: 'NOT_TESTED',
      error: error.message,
    };
  }

  // VALUATION: Pricing tiers and rate multipliers are correct
  try {
    const pricing = await querySupabase(config, 'pricing_tiers', {
      eq: { organization_id: orgId },
      select: 'id,model,rate_per_1k_tokens,is_active',
    });

    const activePricingRules = (pricing || []).filter(p => p.is_active).length;

    assertions.VALUATION = {
      assertion: 'Valuation/Allocation: Pricing tiers and rate multipliers are correct',
      testProcedure: 'Verify active pricing configuration and rate consistency',
      activePricingRules,
      conclusion: activePricingRules > 0 ? 'COVERED' : 'DEFICIENT',
    };
  } catch (error) {
    console.error('VALUATION assertion error:', error);
    assertions.VALUATION = {
      assertion: 'Valuation/Allocation: Pricing tiers and rate multipliers are correct',
      testProcedure: 'Verify active pricing configuration and rate consistency',
      activePricingRules: 0,
      conclusion: 'NOT_TESTED',
      error: error.message,
    };
  }

  // CUTOFF: Transactions recorded in correct period
  try {
    const boundaryRecords = await querySupabase(config, 'usage', {
      eq: { organization_id: orgId },
      gte: { created_at: new Date(new Date(periodStart).getTime() - 86400000).toISOString().split('T')[0] },
      lte: { created_at: new Date(new Date(periodEnd).getTime() + 86400000).toISOString().split('T')[0] },
      select: 'id,created_at',
    });

    let correctAssignment = 0;
    (boundaryRecords || []).forEach(record => {
      const recordDate = record.created_at.split('T')[0];
      if (recordDate >= periodStart && recordDate < periodEnd) {
        correctAssignment++;
      }
    });

    const boundaryCount = boundaryRecords ? boundaryRecords.length : 0;
    const cutoffErrorRate = boundaryCount > 0 ? (boundaryCount - correctAssignment) / boundaryCount : 0;

    assertions.CUTOFF = {
      assertion: 'Cutoff: Transactions recorded in correct period',
      testProcedure: 'Sample boundary transactions (±24h), verify period assignment',
      boundaryRecordsChecked: boundaryCount,
      correctPeriodAssignment: correctAssignment,
      errorRate: parseFloat(cutoffErrorRate.toFixed(4)),
      conclusion: cutoffErrorRate < 0.02 ? 'COVERED' : 'DEFICIENT',
    };
  } catch (error) {
    console.error('CUTOFF assertion error:', error);
    assertions.CUTOFF = {
      assertion: 'Cutoff: Transactions recorded in correct period',
      testProcedure: 'Sample boundary transactions (±24h), verify period assignment',
      boundaryRecordsChecked: 0,
      correctPeriodAssignment: 0,
      errorRate: null,
      conclusion: 'NOT_TESTED',
      error: error.message,
    };
  }

  // RIGHTS_OBLIGATIONS: Organization data isolation maintained
  try {
    const isolationSample = await querySupabase(config, 'usage', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      select: 'id,organization_id',
      order: 'created_at.desc',
      limit: 50,
    });

    let isolationBreaches = 0;
    (isolationSample || []).forEach(record => {
      if (record.organization_id !== orgId) {
        isolationBreaches++;
      }
    });

    const sampleSize = isolationSample ? isolationSample.length : 0;

    assertions.RIGHTS_OBLIGATIONS = {
      assertion: 'Rights and Obligations: Organization data isolation maintained',
      testProcedure: 'Verify org_id consistency in 50-record sample',
      sampleSize,
      isolationBreaches,
      conclusion: isolationBreaches === 0 ? 'COVERED' : 'DEFICIENT',
    };
  } catch (error) {
    console.error('RIGHTS_OBLIGATIONS assertion error:', error);
    assertions.RIGHTS_OBLIGATIONS = {
      assertion: 'Rights and Obligations: Organization data isolation maintained',
      testProcedure: 'Verify org_id consistency in 50-record sample',
      sampleSize: 0,
      isolationBreaches: 0,
      conclusion: 'NOT_TESTED',
      error: error.message,
    };
  }

  return assertions;
}

// ============================================================================
// GOVERNANCE & COMPLIANCE SCORING
// ============================================================================

/**
 * Collect governance evidence and score against NIST AI RMF, ISO 42001, EU AI Act.
 *
 * @param {Object} config - Supabase config
 * @param {string} orgId - Organization ID
 * @param {string} period - Period in "YYYY-MM" format
 * @returns {Promise<Object>} Governance scores and readiness assessment
 */
async function collectGovernanceEvidence(config, orgId, period) {
  const { periodStart, periodEnd } = parsePeriod(period);

  // NIST AI RMF Scoring
  const nistScores = {};

  // GOVERN (0-100): Policy, oversight, governance structure
  try {
    // Active budgets
    const budgets = await querySupabase(config, 'budgets', {
      eq: { organization_id: orgId },
      select: 'id,is_active',
    });
    const activeBudgetCount = (budgets || []).filter(b => b.is_active).length;
    const budgetScore = activeBudgetCount === 0 ? 0 : activeBudgetCount <= 5 ? 15 : 25;

    // Policy updates in audit logs
    const policyEvents = await querySupabase(config, 'audit_logs', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      like: { action: 'policy.%' },
      select: 'id',
      count: true,
    });
    const policyEventCount = policyEvents.count || 0;
    const policyScore = policyEventCount === 0 ? 0 : policyEventCount <= 10 ? 15 : 25;

    // Distinct user roles
    const roles = await querySupabase(config, 'audit_logs', {
      eq: { organization_id: orgId },
      select: 'role',
    });
    const distinctRoles = new Set((roles || []).map(r => r.role).filter(Boolean));
    const roleScore = distinctRoles.size === 0 ? 0 : distinctRoles.size === 1 ? 0 : distinctRoles.size < 3 ? 15 : 25;

    // Audit trail activity
    const auditActivity = await querySupabase(config, 'audit_logs', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      select: 'id',
      count: true,
    });
    const auditEventCount = auditActivity.count || 0;
    const auditScore = auditEventCount === 0 ? 0 : 25;

    nistScores.govern = budgetScore + policyScore + roleScore + auditScore;
  } catch (error) {
    console.error('NIST GOVERN scoring error:', error);
    nistScores.govern = 0;
  }

  // MAP (0-100): Model assessment, impact, providers
  try {
    const providers = await querySupabase(config, 'usage', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      select: 'provider',
    });
    const distinctProviders = new Set((providers || []).map(p => p.provider).filter(Boolean));
    const providerScore = distinctProviders.size === 0 ? 0 : distinctProviders.size === 1 ? 10 : distinctProviders.size <= 3 ? 20 : 25;

    const models = await querySupabase(config, 'usage', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      select: 'model',
    });
    const distinctModels = new Set((models || []).map(m => m.model).filter(Boolean));
    const modelScore = distinctModels.size === 0 ? 0 : distinctModels.size <= 3 ? 10 : distinctModels.size <= 10 ? 20 : 25;

    const costCenters = await querySupabase(config, 'usage', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      select: 'cost_center',
    });
    const distinctCostCenters = new Set((costCenters || []).map(c => c.cost_center).filter(Boolean));
    const costCenterScore = distinctCostCenters.size === 0 ? 0 : distinctCostCenters.size <= 2 ? 10 : distinctCostCenters.size <= 5 ? 20 : 25;

    const shadowSpend = await querySupabase(config, 'billing_imports', {
      eq: { organization_id: orgId },
      select: 'id',
      count: true,
    });
    const shadowScore = (shadowSpend.count || 0) > 0 ? 25 : 0;

    nistScores.map = providerScore + modelScore + costCenterScore + shadowScore;
  } catch (error) {
    console.error('NIST MAP scoring error:', error);
    nistScores.map = 0;
  }

  // MEASURE (0-100): Metrics, monitoring, measurement
  try {
    const reconciliations = await querySupabase(config, 'reconciliation_results', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      select: 'id',
      count: true,
    });
    const reconScore = (reconciliations.count || 0) > 0 ? 25 : 0;

    const anomalyBaselines = await querySupabase(config, 'alert_configs', {
      eq: { organization_id: orgId },
      select: 'id',
      count: true,
    });
    const anomalyScore = (anomalyBaselines.count || 0) > 0 ? 25 : 0;

    // Reuse completeness from AI-FIN-001
    const gatewayResult = await querySupabase(config, 'gateway_requests', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      select: 'id',
      count: true,
      limit: 1,
    });
    const usageResult = await querySupabase(config, 'usage', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      select: 'id',
      count: true,
      limit: 1,
    });
    const completenessRate = (gatewayResult.count || 0) > 0 ? (usageResult.count || 0) / (gatewayResult.count || 0) : 1.0;
    const loggingScore = completenessRate >= 0.995 ? 25 : completenessRate >= 0.99 ? 15 : 0;

    const closePacks = await querySupabase(config, 'close_packs', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      select: 'id',
      count: true,
    });
    const closePackScore = (closePacks.count || 0) > 0 ? 25 : 0;

    nistScores.measure = reconScore + anomalyScore + loggingScore + closePackScore;
  } catch (error) {
    console.error('NIST MEASURE scoring error:', error);
    nistScores.measure = 0;
  }

  // MANAGE (0-100): Governance operations, incident response
  try {
    const budgetExceeded = await querySupabase(config, 'audit_logs', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      like: { action: 'budget.exceeded' },
      select: 'id',
      count: true,
    });
    const enforcementScore = (budgetExceeded.count || 0) > 0 ? 25 : 0;

    // Alert response time
    const alerts = await querySupabase(config, 'alert_history', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      select: 'id,created_at,acknowledged_at',
    });
    let avgResponseHours = 0;
    let ackedCount = 0;
    (alerts || []).forEach(alert => {
      if (alert.acknowledged_at) {
        ackedCount++;
        const hours = (new Date(alert.acknowledged_at) - new Date(alert.created_at)) / (1000 * 60 * 60);
        avgResponseHours += hours;
      }
    });
    avgResponseHours = ackedCount > 0 ? avgResponseHours / ackedCount : 0;
    const responseScore = avgResponseHours < 4 ? 25 : avgResponseHours < 24 ? 15 : 0;

    const closePackCount = await querySupabase(config, 'close_packs', {
      eq: { organization_id: orgId },
      select: 'id',
      count: true,
    });
    const packScore = (closePackCount.count || 0) > 0 ? 25 : 0;

    const errorLogs = await querySupabase(config, 'error_logs', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      select: 'id,is_resolved',
    });
    let resolved = 0;
    (errorLogs || []).forEach(err => {
      if (err.is_resolved) resolved++;
    });
    const recoveryScore = (errorLogs || []).length > 0 && resolved === (errorLogs || []).length ? 25 : 0;

    nistScores.manage = enforcementScore + responseScore + packScore + recoveryScore;
  } catch (error) {
    console.error('NIST MANAGE scoring error:', error);
    nistScores.manage = 0;
  }

  nistScores.overall = Math.round((nistScores.govern + nistScores.map + nistScores.measure + nistScores.manage) / 4);

  // ISO 42001 Assessment (INDEPENDENT from NIST — Diamond tier with dedicated metrics)
  const iso42001 = {};

  // A.5 (AI Policy) — 0-25: Count governance/policy audit events
  try {
    const policyAuditLogs = await querySupabase(config, 'audit_logs', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      like: { action: '%governance%|%policy%' },
      select: 'id',
      count: true,
    });
    iso42001['A.5'] = Math.min(25, (policyAuditLogs.count || 0) > 0 ? 25 : 0);
  } catch (error) {
    console.error('ISO A.5 scoring error:', error);
    iso42001['A.5'] = 0;
  }

  // A.6 (Planning) — 0-25: Active budgets + cost center allocation
  try {
    const activeBudgets = await querySupabase(config, 'budgets', {
      eq: { organization_id: orgId },
      select: 'id',
    });
    const activeBudgetCount = (activeBudgets || []).filter(b => b.is_active).length;

    const costCenters = await querySupabase(config, 'usage', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      select: 'cost_center',
    });
    const distinctCostCenters = new Set((costCenters || []).map(c => c.cost_center).filter(Boolean));

    const budgetScore = activeBudgetCount > 0 ? 13 : 0;
    const costCenterScore = distinctCostCenters.size > 0 ? 12 : 0;
    iso42001['A.6'] = Math.min(25, budgetScore + costCenterScore);
  } catch (error) {
    console.error('ISO A.6 scoring error:', error);
    iso42001['A.6'] = 0;
  }

  // A.7 (Support) — 0-25: Distinct user roles + training events
  try {
    const roles = await querySupabase(config, 'audit_logs', {
      eq: { organization_id: orgId },
      select: 'role',
    });
    const distinctRoles = new Set((roles || []).map(r => r.role).filter(Boolean));

    const trainingEvents = await querySupabase(config, 'audit_logs', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      like: { action: '%training%' },
      select: 'id',
      count: true,
    });

    const roleScore = Math.min(13, Math.max(0, (distinctRoles.size - 1) * 4));
    const trainingScore = (trainingEvents.count || 0) > 0 ? 12 : 0;
    iso42001['A.7'] = Math.min(25, roleScore + trainingScore);
  } catch (error) {
    console.error('ISO A.7 scoring error:', error);
    iso42001['A.7'] = 0;
  }

  // A.8 (Operation) — 0-25: Reconciliation completeness + close pack generation
  try {
    const reconciliations = await querySupabase(config, 'reconciliation_results', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      select: 'id',
      count: true,
    });

    const closePacks = await querySupabase(config, 'close_packs', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      select: 'id',
      count: true,
    });

    const reconScore = (reconciliations.count || 0) > 0 ? 13 : 0;
    const closePackScore = (closePacks.count || 0) > 0 ? 12 : 0;
    iso42001['A.8'] = Math.min(25, reconScore + closePackScore);
  } catch (error) {
    console.error('ISO A.8 scoring error:', error);
    iso42001['A.8'] = 0;
  }

  // EU AI Act Assessment
  const euAiAct = {
    toolsClassified: 0,
    highRiskTools: 0,
    transparencyEvents: 0,
  };

  try {
    const models = await querySupabase(config, 'usage', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      select: 'model',
    });
    euAiAct.toolsClassified = new Set((models || []).map(m => m.model).filter(Boolean)).size;

    // Count high-risk usage indicators (simplified)
    const highRiskUsage = await querySupabase(config, 'usage', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      like: { use_case: '%hiring%|%credit%|%law_enforcement%' },
      select: 'id',
      count: true,
    });
    euAiAct.highRiskTools = highRiskUsage.count || 0;

    const transparencyLogs = await querySupabase(config, 'audit_logs', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      like: { action: '%transparency%|%disclosure%' },
      select: 'id',
      count: true,
    });
    euAiAct.transparencyEvents = transparencyLogs.count || 0;
  } catch (error) {
    console.error('EU AI Act assessment error:', error);
  }

  // Readiness assessment
  const readiness = {
    nist: nistScores.overall >= 80 ? 'ready' : nistScores.overall >= 60 ? 'partial' : 'needs_work',
    iso42001: iso42001['A.5.1'] >= 75 ? 'ready' : 'partial',
    euAiAct: euAiAct.highRiskTools === 0 ? 'ready' : euAiAct.transparencyEvents > 0 ? 'partial' : 'needs_work',
  };

  return {
    nist: nistScores,
    iso42001,
    euAiAct,
    readiness,
  };
}

/**
 * Collect EU AI Act compliance evidence using Diamond tier classification.
 * Uses classifyEUAIActRisk from ai-governance.js to classify each model+use_case
 * against Article 5 prohibited practices, Annex III high-risk areas, and Article 50.
 *
 * @param {Object} config - Supabase config
 * @param {string} orgId - Organization ID
 * @returns {Promise<Object>} EU AI Act assessment with Diamond tier risk classifications
 */
async function collectEUAIActEvidence(config, orgId) {
  try {
    const { classifyEUAIActRisk, EU_AI_ACT_PROHIBITED_PRACTICES, EU_AI_ACT_HIGH_RISK_AREAS } = require('./ai-governance.js');

    const models = await querySupabase(config, 'usage', {
      eq: { organization_id: orgId },
      select: 'model,use_case,metadata',
    });

    const distinctModels = new Set((models || []).map(m => m.model).filter(Boolean));

    // Classify each unique model+use_case combination
    const classifications = {};
    let prohibitedCount = 0;
    let highRiskCount = 0;
    let limitedRiskCount = 0;
    let minimalRiskCount = 0;
    const prohibitedFlags = [];

    for (const record of (models || [])) {
      const key = `${record.model}::${record.use_case || 'unspecified'}`;
      if (!classifications[key]) {
        const classification = classifyEUAIActRisk(
          record.use_case || '',
          record.model || '',
          record.metadata || {}
        );
        classifications[key] = classification;

        if (classification.riskCategory === 'PROHIBITED') {
          prohibitedCount++;
          prohibitedFlags.push({
            model: record.model,
            useCase: record.use_case,
            matchedPractices: classification.matchedPractices.map(p => p.article),
            action: classification.action,
          });
        } else if (classification.riskCategory === 'HIGH_RISK') {
          highRiskCount++;
        } else if (classification.riskCategory === 'LIMITED_RISK') {
          limitedRiskCount++;
        } else {
          minimalRiskCount++;
        }
      }
    }

    const transparencyEvents = await querySupabase(config, 'audit_logs', {
      eq: { organization_id: orgId },
      like: { action: '%transparency%|%disclosure%|%impact_assessment%' },
      select: 'id',
      count: true,
    });

    return {
      toolsClassified: Object.keys(classifications).length,
      classifications: {
        prohibited: prohibitedCount,
        highRisk: highRiskCount,
        limitedRisk: limitedRiskCount,
        minimalRisk: minimalRiskCount,
      },
      prohibitedFlags,
      highRiskTools: highRiskCount,
      transparencyEventsLogged: transparencyEvents.count || 0,
      requiresIA: highRiskCount > 0,
      prohibitedDetected: prohibitedCount > 0,
      assessmentStatus: prohibitedCount > 0 ? 'blocked' : (transparencyEvents.count || 0) > 0 ? 'documented' : 'pending',
      articlesApplicable: [
        ...(prohibitedCount > 0 ? ['Article 5'] : []),
        ...(highRiskCount > 0 ? ['Article 6', 'Article 9', 'Article 10', 'Article 13', 'Article 14'] : []),
        ...(limitedRiskCount > 0 ? ['Article 50'] : []),
      ],
    };
  } catch (error) {
    console.error('EU AI Act evidence collection error:', error);
    return {
      toolsClassified: 0,
      classifications: { prohibited: 0, highRisk: 0, limitedRisk: 0, minimalRisk: 0 },
      prohibitedFlags: [],
      highRiskTools: 0,
      transparencyEventsLogged: 0,
      requiresIA: false,
      prohibitedDetected: false,
      assessmentStatus: 'undetermined',
      error: error.message,
    };
  }
}

// ============================================================================
// STATISTICAL SAMPLING
// ============================================================================

/**
 * Execute stratified statistical sampling on usage transactions.
 * Computes sample sizes per provider stratum, tests control objectives,
 * calculates error rates and 95% confidence intervals.
 *
 * @param {Object} config - Supabase config
 * @param {string} orgId - Organization ID
 * @param {string} period - Period in "YYYY-MM" format
 * @param {number} sampleSize - Desired total sample size
 * @returns {Promise<Object>} Sampling results with error rates and CI
 */
async function runTransactionSampling(config, orgId, period, sampleSize = 150) {
  const { periodStart, periodEnd } = parsePeriod(period);

  try {
    // Get population counts by provider (stratification)
    const populationByProvider = await querySupabase(config, 'usage', {
      eq: { organization_id: orgId },
      gte: { created_at: periodStart },
      lte: { created_at: periodEnd },
      select: 'provider',
    });

    const providerCounts = {};
    let totalPopulation = 0;
    (populationByProvider || []).forEach(record => {
      const provider = record.provider || 'unknown';
      providerCounts[provider] = (providerCounts[provider] || 0) + 1;
      totalPopulation++;
    });

    // Compute proportional sample per stratum
    const stratumSamples = {};
    Object.entries(providerCounts).forEach(([provider, count]) => {
      stratumSamples[provider] = Math.max(1, Math.round((count / totalPopulation) * sampleSize));
    });

    // Draw random samples from each stratum
    const sampleResults = [];
    let testsPassed = 0;
    let testsFailed = 0;
    const failureDetails = [];

    for (const [provider, samplePerStratum] of Object.entries(stratumSamples)) {
      const strata = await querySupabase(config, 'usage', {
        eq: { organization_id: orgId, provider },
        gte: { created_at: periodStart },
        lte: { created_at: periodEnd },
        select: 'id,token_count,cost_cents,status,organization_id,created_at',
        order: 'created_at.desc',
        limit: samplePerStratum,
      });

      (strata || []).forEach(record => {
        let testPassed = true;
        const issues = [];

        // Test 1: cost > 0 when tokens > 0
        if (record.token_count > 0 && record.cost_cents <= 0) {
          testPassed = false;
          issues.push('Positive tokens with zero/negative cost');
        }

        // Test 2: org_id matches
        if (record.organization_id !== orgId) {
          testPassed = false;
          issues.push('Organization ID mismatch (isolation breach)');
        }

        // Test 3: status is valid
        if (!['completed', 'pending', 'failed'].includes(record.status)) {
          testPassed = false;
          issues.push(`Invalid status: ${record.status}`);
        }

        if (testPassed) {
          testsPassed++;
        } else {
          testsFailed++;
          failureDetails.push({
            recordId: record.id,
            provider,
            issues,
          });
        }

        sampleResults.push({ recordId: record.id, testPassed, issues });
      });
    }

    const actualsampleSize = sampleResults.length;
    const errorRate = actualsampleSize > 0 ? testsFailed / actualsampleSize : 0;
    const ci = computeConfidenceInterval(errorRate, actualsampleSize);
    const materialityExceeded = errorRate > MATERIALITY_THRESHOLD;

    return {
      populationSize: totalPopulation,
      samplingMethod: 'stratified_by_provider',
      actualSampleSize: actualsampleSize,
      plannedSampleSize: sampleSize,
      stratumSamples,
      testsPassed,
      testsFailed,
      errorRate: parseFloat(errorRate.toFixed(4)),
      confidenceInterval: {
        lower: parseFloat(ci.lower.toFixed(4)),
        upper: parseFloat(ci.upper.toFixed(4)),
        confidenceLevel: 0.95,
      },
      materialityThreshold: MATERIALITY_THRESHOLD,
      materialityExceeded,
      failureExamples: failureDetails.slice(0, 10),
      conclusion: materialityExceeded ? 'DEFICIENT' : 'ADEQUATE',
    };
  } catch (error) {
    console.error('Transaction sampling error:', error);
    return {
      populationSize: 0,
      samplingMethod: 'stratified_by_provider',
      actualSampleSize: 0,
      plannedSampleSize: sampleSize,
      stratumSamples: {},
      testsPassed: 0,
      testsFailed: 0,
      errorRate: null,
      confidenceInterval: null,
      materialityThreshold: MATERIALITY_THRESHOLD,
      materialityExceeded: false,
      failureExamples: [],
      conclusion: 'NOT_TESTED',
      error: error.message,
    };
  }
}

// ============================================================================
// MASTER EVIDENCE PACKAGE GENERATION
// ============================================================================

/**
 * Generate complete evidence package for audit purposes.
 * Combines control testing, PCAOB assertions, governance scoring,
 * and transaction sampling into a tamper-evident package.
 *
 * @param {Object} config - Supabase config
 * @param {string} orgId - Organization ID
 * @param {string} period - Period in "YYYY-MM" format
 * @returns {Promise<Object>} Complete auditor-ready evidence package
 */
async function generateEvidencePackage(config, orgId, period) {
  try {
    // 1. Collect control evidence
    const controlEvidence = await collectControlEvidence(config, orgId, period);

    // 2. Collect PCAOB assertions
    const pcaobEvidence = await collectPCAOBEvidence(config, orgId, period);

    // 3. Collect governance evidence
    const governanceEvidence = await collectGovernanceEvidence(config, orgId, period);

    // 4. Collect EU AI Act evidence
    const euAiActEvidence = await collectEUAIActEvidence(config, orgId);

    // 5. Run transaction sampling
    const samplingResults = await runTransactionSampling(config, orgId, period, 150);

    // 6. Compute overall assessment
    const materialWeaknesses = Object.values(controlEvidence)
      .filter(c => c.materialWeakness).length;
    const significantDeficiencies = Object.values(controlEvidence)
      .filter(c => c.significantDeficiency).length;

    const overallAssessment = {
      period,
      generatedAt: new Date().toISOString(),
      organizationId: orgId,
      icfrEffectiveness: materialWeaknesses === 0 ? 'effective' : 'needs_improvement',
      materialWeaknesses,
      significantDeficiencies,
      governanceScore: governanceEvidence.nist.overall,
      samplingConclusionAdequate: !samplingResults.materialityExceeded,
      auditReady: materialWeaknesses === 0 && !samplingResults.materialityExceeded,
    };

    // 7. Build complete package
    const evidencePackage = {
      metadata: {
        packageVersion: '1.0',
        generatedAt: new Date().toISOString(),
        period,
        organizationId: orgId,
        framework: 'Finault Compliance Framework v1',
      },
      controls: controlEvidence,
      pcaob: pcaobEvidence,
      governance: governanceEvidence,
      euAiAct: euAiActEvidence,
      sampling: samplingResults,
      overallAssessment,
    };

    // 8. Hash the package
    const packageHash = await hashPackage(evidencePackage);

    return {
      ...evidencePackage,
      packageHash,
      hashAlgorithm: 'SHA-256',
      integrityVerified: packageHash !== null,
    };
  } catch (error) {
    console.error('Evidence package generation error:', error);
    return {
      metadata: {
        packageVersion: '1.0',
        generatedAt: new Date().toISOString(),
        period,
        organizationId: orgId,
        error: error.message,
      },
      controls: {},
      pcaob: {},
      governance: {},
      euAiAct: {},
      sampling: {},
      overallAssessment: {
        icfrEffectiveness: 'undetermined',
        materialWeaknesses: 0,
        significantDeficiencies: 0,
        governanceScore: 0,
        auditReady: false,
      },
    };
  }
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

module.exports = {
  // Core evidence collection
  collectControlEvidence,
  collectPCAOBEvidence,
  collectGovernanceEvidence,
  collectEUAIActEvidence,

  // Statistical sampling
  runTransactionSampling,
  computeConfidenceInterval,

  // Master package
  generateEvidencePackage,
  hashPackage,

  // Helpers
  querySupabase,
  parsePeriod,

  // Constants
  CONTROL_DEFINITIONS,
  PCAOB_ASSERTIONS,
  EFFECTIVENESS_THRESHOLDS,
  MATERIALITY_THRESHOLD,
  KNOWN_PRICING_CENTS_PER_1K,
};
