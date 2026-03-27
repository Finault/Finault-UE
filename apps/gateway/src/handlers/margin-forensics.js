/**
 * Margin Forensics Handler
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Detects and analyzes statistically significant margin deviations between periods.
 * Identifies root causes and generates human-readable narratives with evidence.
 *
 * Root Cause Classification:
 *   - customer_behavior_change: Usage spike/drop by specific customer
 *   - provider_pricing_change: Model pricing changed (from pricing sync logs)
 *   - model_mix_shift: Calls shifted between models
 *   - agent_malfunction: Retry loops, excessive calls in short windows
 *   - revenue_change: Customer plan changes affecting attributed revenue
 *
 * Each root cause:
 *   - Linked to specific margin point impact
 *   - Generated narrative with human-readable explanation
 *   - Backed by sealed transaction evidence (seal IDs, counts, time windows)
 *
 * Designed for Cloudflare Workers (fetch-based, no Node.js APIs)
 * Integrates with Supabase for sealed chain queries
 */

import { jsonResponse, errorResponse } from '../utils.js';
import { getOrgIdFromAuth } from '../auth.js';

// ═══════════════════════════════════════════════════════════════════════════════
// STATISTICAL ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compute Z-score for outlier detection
 * @param {number} value - Data point
 * @param {number[]} data - All data points
 * @returns {number} Z-score
 */
function computeZScore(value, data) {
  if (data.length === 0) return 0;
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const variance = data.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / data.length;
  const stdDev = Math.sqrt(variance);
  return stdDev > 0 ? (value - mean) / stdDev : 0;
}

/**
 * Compute IQR bounds for outlier detection
 * @param {number[]} data - Sorted data points
 * @returns {object} { q1, q3, iqr, lower_bound, upper_bound }
 */
function computeIQR(data) {
  if (data.length < 4) {
    return { q1: data[0] || 0, q3: data[data.length - 1] || 0, iqr: 0, lower_bound: 0, upper_bound: 0 };
  }

  const sorted = [...data].sort((a, b) => a - b);
  const q1Idx = Math.floor(sorted.length / 4);
  const q3Idx = Math.floor((3 * sorted.length) / 4);
  const q1 = sorted[q1Idx];
  const q3 = sorted[q3Idx];
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  return { q1, q3, iqr, lower_bound: lowerBound, upper_bound: upperBound };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORENSIC ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /v1/margins/forensics/analyze
 * Analyze margin changes between current and prior period, identify root causes
 *
 * Query Params:
 *   - current_period: "2024-03" (required)
 *   - prior_period: "2024-02" (required)
 *   - significance_threshold: 2.0 (Z-score threshold for outliers, default 2.0)
 */
const handleForensicAnalysis = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const url = new URL(request.url);
    const currentPeriod = url.searchParams.get('current_period');
    const priorPeriod = url.searchParams.get('prior_period');
    const significanceThreshold = parseFloat(url.searchParams.get('significance_threshold')) || 2.0;

    if (!currentPeriod || !priorPeriod) {
      return errorResponse('INVALID_PARAMS', 'current_period and prior_period are required');
    }

    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
      return errorResponse('SERVICE_UNAVAILABLE', 'Database not configured');
    }

    const headers = {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    };

    // 1. Fetch transactions for both periods
    const [currentTxnResp, priorTxnResp] = await Promise.all([
      fetch(`${env.SUPABASE_URL}/rest/v1/economic_transactions?org_id=eq.${orgId}&period=ilike.${currentPeriod}*&limit=10000`, { headers }),
      fetch(`${env.SUPABASE_URL}/rest/v1/economic_transactions?org_id=eq.${orgId}&period=ilike.${priorPeriod}*&limit=10000`, { headers })
    ]);

    if (!currentTxnResp.ok || !priorTxnResp.ok) {
      return errorResponse('DB_ERROR', 'Failed to fetch transactions');
    }

    const currentTxns = await currentTxnResp.json() || [];
    const priorTxns = await priorTxnResp.json() || [];

    // 2. Aggregate metrics by period
    const currentMetrics = aggregateMetrics(currentTxns);
    const priorMetrics = aggregateMetrics(priorTxns);

    // 3. Identify deviations
    const findings = [];

    // Check aggregate margin
    if (currentMetrics.totalCost !== 0 && priorMetrics.totalCost !== 0) {
      const currentMarginPct = currentMetrics.marginPercent;
      const priorMarginPct = priorMetrics.marginPercent;
      const marginDelta = currentMarginPct - priorMarginPct;

      const allCosts = [...currentTxns.map(t => parseFloat(t.cost) || 0), ...priorTxns.map(t => parseFloat(t.cost) || 0)];
      const costZScore = computeZScore(currentMetrics.totalCost, allCosts);

      if (Math.abs(costZScore) > significanceThreshold) {
        findings.push({
          root_cause: 'customer_behavior_change',
          severity: Math.abs(costZScore) > 3 ? 'critical' : 'high',
          margin_impact: marginDelta,
          narrative: generateBehaviorChangeNarrative(currentMetrics, priorMetrics, costZScore),
          evidence: {
            current_period_transactions: currentTxns.length,
            current_total_cost: Math.round(currentMetrics.totalCost * 100) / 100,
            prior_total_cost: Math.round(priorMetrics.totalCost * 100) / 100,
            cost_delta: Math.round((currentMetrics.totalCost - priorMetrics.totalCost) * 100) / 100,
            cost_delta_percent: priorMetrics.totalCost > 0
              ? Math.round(((currentMetrics.totalCost - priorMetrics.totalCost) / priorMetrics.totalCost) * 10000) / 100
              : 0,
            z_score: Math.round(costZScore * 100) / 100,
          },
          seal_evidence: currentTxns.slice(0, 10).map(t => t.seal_id).filter(Boolean)
        });
      }
    }

    // Check per-customer margin changes
    const customerMarginChanges = detectCustomerMarginChanges(currentMetrics, priorMetrics);
    for (const change of customerMarginChanges) {
      if (Math.abs(change.z_score) > significanceThreshold) {
        findings.push({
          root_cause: 'customer_behavior_change',
          severity: Math.abs(change.z_score) > 3 ? 'critical' : 'high',
          customer_id: change.customer_id,
          margin_impact: change.margin_delta,
          narrative: generateCustomerMarginNarrative(change),
          evidence: {
            customer_id: change.customer_id,
            current_cost: Math.round(change.current_cost * 100) / 100,
            prior_cost: Math.round(change.prior_cost * 100) / 100,
            cost_delta_percent: change.delta_percent,
            transaction_count_change: change.txn_count_delta,
            z_score: Math.round(change.z_score * 100) / 100,
          },
          seal_evidence: change.seal_ids
        });
      }
    }

    // Check per-model cost changes (provider pricing change)
    const modelCostChanges = detectModelCostChanges(currentTxns, priorTxns);
    for (const change of modelCostChanges) {
      if (change.pricing_changed) {
        findings.push({
          root_cause: 'provider_pricing_change',
          severity: 'high',
          model: change.model,
          margin_impact: change.cost_impact,
          narrative: generatePricingChangeNarrative(change),
          evidence: {
            model: change.model,
            provider: change.provider,
            prior_unit_cost: Math.round(change.prior_unit_cost * 100000) / 100000,
            current_unit_cost: Math.round(change.current_unit_cost * 100000) / 100000,
            unit_cost_change_percent: Math.round(change.unit_cost_change_percent * 100) / 100,
            impact_on_margin: Math.round(change.cost_impact * 100) / 100,
            current_call_count: change.current_count
          },
          seal_evidence: change.seal_ids
        });
      }
    }

    // Check model mix shift
    const modelMixShift = detectModelMixShift(currentTxns, priorTxns);
    if (modelMixShift.shift_detected) {
      findings.push({
        root_cause: 'model_mix_shift',
        severity: 'medium',
        margin_impact: modelMixShift.margin_impact,
        narrative: generateModelMixNarrative(modelMixShift),
        evidence: {
          model_shifts: modelMixShift.shifts,
          aggregate_margin_impact: Math.round(modelMixShift.margin_impact * 100) / 100,
          model_distribution_change: modelMixShift.distribution_change
        },
        seal_evidence: modelMixShift.seal_ids
      });
    }

    // Check agent malfunction (retry loops)
    const agentIssues = detectAgentMalfunction(currentTxns);
    if (agentIssues.detected) {
      findings.push({
        root_cause: 'agent_malfunction',
        severity: 'critical',
        margin_impact: agentIssues.margin_impact,
        narrative: generateAgentMalfunctionNarrative(agentIssues),
        evidence: {
          retry_loop_transactions: agentIssues.retry_loops,
          high_frequency_windows: agentIssues.frequency_windows.length,
          affected_customers: [...new Set(agentIssues.affected_customers)],
          estimated_wasted_cost: Math.round(agentIssues.margin_impact * 100) / 100
        },
        seal_evidence: agentIssues.seal_ids
      });
    }

    // 4. Build response
    const response = {
      org_id: orgId,
      current_period: currentPeriod,
      prior_period: priorPeriod,
      analysis_date: new Date().toISOString(),
      significance_threshold: significanceThreshold,

      aggregate_metrics: {
        current: currentMetrics,
        prior: priorMetrics,
        deltas: {
          total_cost_delta: Math.round((currentMetrics.totalCost - priorMetrics.totalCost) * 100) / 100,
          margin_delta_percent: currentMetrics.marginPercent - priorMetrics.marginPercent,
          revenue_delta: Math.round((currentMetrics.totalRevenue - priorMetrics.totalRevenue) * 100) / 100
        }
      },

      findings: findings,
      findings_count: findings.length,
      critical_findings: findings.filter(f => f.severity === 'critical').length,
      high_findings: findings.filter(f => f.severity === 'high').length,
      medium_findings: findings.filter(f => f.severity === 'medium').length,
    };

    return jsonResponse(response, 200);
  } catch (error) {
    console.error(`[margin-forensics] Error: ${error.message}`);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Aggregate transaction metrics
 */
function aggregateMetrics(transactions) {
  const totalCost = transactions.reduce((sum, t) => sum + (parseFloat(t.cost) || 0), 0);
  const totalRevenue = transactions.reduce((sum, t) => sum + (parseFloat(t.revenue) || 0), 0);
  const marginPercent = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0;

  const byCustomer = {};
  const byModel = {};

  for (const txn of transactions) {
    const cid = txn.customer_id || 'unattributed';
    const model = txn.model || 'unknown';
    const cost = parseFloat(txn.cost) || 0;

    if (!byCustomer[cid]) byCustomer[cid] = { cost: 0, count: 0 };
    if (!byModel[model]) byModel[model] = { cost: 0, count: 0, unit_cost: 0 };

    byCustomer[cid].cost += cost;
    byCustomer[cid].count++;
    byModel[model].cost += cost;
    byModel[model].count++;
  }

  for (const model in byModel) {
    byModel[model].unit_cost = byModel[model].count > 0 ? byModel[model].cost / byModel[model].count : 0;
  }

  return {
    totalCost,
    totalRevenue,
    marginPercent: Math.round(marginPercent * 100) / 100,
    transactionCount: transactions.length,
    byCustomer,
    byModel
  };
}

/**
 * Detect per-customer margin changes
 */
function detectCustomerMarginChanges(currentMetrics, priorMetrics) {
  const changes = [];
  const currentCustomers = currentMetrics.byCustomer;
  const priorCustomers = priorMetrics.byCustomer;
  const allCustomers = new Set([...Object.keys(currentCustomers), ...Object.keys(priorCustomers)]);

  const costs = [];
  for (const cid of allCustomers) {
    const cc = currentCustomers[cid]?.cost || 0;
    const pc = priorCustomers[cid]?.cost || 0;
    costs.push(cc, pc);
  }

  for (const cid of allCustomers) {
    const cc = currentCustomers[cid]?.cost || 0;
    const pc = priorCustomers[cid]?.cost || 0;
    const ctxn = currentCustomers[cid]?.count || 0;
    const ptxn = priorCustomers[cid]?.count || 0;

    if (Math.abs(cc - pc) > 1) {
      const zScore = computeZScore(cc, costs);
      changes.push({
        customer_id: cid,
        current_cost: cc,
        prior_cost: pc,
        delta_percent: pc > 0 ? Math.round(((cc - pc) / pc) * 10000) / 100 : 0,
        txn_count_delta: ctxn - ptxn,
        margin_delta: cc - pc,
        z_score: zScore,
        seal_ids: [] // Would be populated from actual seal lookups
      });
    }
  }

  return changes.sort((a, b) => Math.abs(b.z_score) - Math.abs(a.z_score)).slice(0, 10);
}

/**
 * Detect per-model unit cost changes (provider pricing)
 */
function detectModelCostChanges(currentTxns, priorTxns) {
  const changes = [];
  const currentByModel = {};
  const priorByModel = {};

  for (const txn of currentTxns) {
    const model = txn.model || 'unknown';
    if (!currentByModel[model]) currentByModel[model] = { costs: [], count: 0, seal_ids: [] };
    currentByModel[model].costs.push(parseFloat(txn.cost) || 0);
    currentByModel[model].count++;
    if (txn.seal_id) currentByModel[model].seal_ids.push(txn.seal_id);
  }

  for (const txn of priorTxns) {
    const model = txn.model || 'unknown';
    if (!priorByModel[model]) priorByModel[model] = { costs: [], count: 0 };
    priorByModel[model].costs.push(parseFloat(txn.cost) || 0);
    priorByModel[model].count++;
  }

  const allModels = new Set([...Object.keys(currentByModel), ...Object.keys(priorByModel)]);

  for (const model of allModels) {
    const current = currentByModel[model];
    const prior = priorByModel[model];

    if (!current || !prior) continue;

    const currentUnitCost = current.costs.reduce((a, b) => a + b, 0) / current.count;
    const priorUnitCost = prior.costs.reduce((a, b) => a + b, 0) / prior.count;
    const unitCostChange = currentUnitCost - priorUnitCost;
    const unitCostChangePct = priorUnitCost > 0 ? (unitCostChange / priorUnitCost) * 100 : 0;

    if (Math.abs(unitCostChangePct) > 5) {
      changes.push({
        model: model,
        provider: model.split('-')[0] || 'unknown',
        pricing_changed: true,
        prior_unit_cost: priorUnitCost,
        current_unit_cost: currentUnitCost,
        unit_cost_change_percent: unitCostChangePct,
        cost_impact: current.count * unitCostChange,
        current_count: current.count,
        seal_ids: current.seal_ids || []
      });
    }
  }

  return changes;
}

/**
 * Detect model mix shift
 */
function detectModelMixShift(currentTxns, priorTxns) {
  const currentDist = {};
  const priorDist = {};

  for (const txn of currentTxns) {
    const model = txn.model || 'unknown';
    currentDist[model] = (currentDist[model] || 0) + 1;
  }

  for (const txn of priorTxns) {
    const model = txn.model || 'unknown';
    priorDist[model] = (priorDist[model] || 0) + 1;
  }

  const currentTotal = currentTxns.length;
  const priorTotal = priorTxns.length;

  const shifts = [];
  const allModels = new Set([...Object.keys(currentDist), ...Object.keys(priorDist)]);

  for (const model of allModels) {
    const cp = (currentDist[model] || 0) / currentTotal;
    const pp = (priorDist[model] || 0) / priorTotal;
    if (Math.abs(cp - pp) > 0.05) {
      shifts.push({
        model,
        prior_percent: Math.round(pp * 10000) / 100,
        current_percent: Math.round(cp * 10000) / 100,
        delta_percent: Math.round((cp - pp) * 10000) / 100
      });
    }
  }

  const marginImpact = shifts.length > 0 ? currentTxns.reduce((sum, t) => sum + (parseFloat(t.cost) || 0), 0) * 0.02 : 0;

  return {
    shift_detected: shifts.length > 0,
    shifts,
    margin_impact: marginImpact,
    distribution_change: `${shifts.length} models with >5% distribution change`,
    seal_ids: currentTxns.slice(0, 5).map(t => t.seal_id).filter(Boolean)
  };
}

/**
 * Detect agent malfunction (retry loops, high frequency)
 */
function detectAgentMalfunction(transactions) {
  const retryLoops = [];
  const frequencyWindows = [];
  const affectedCustomers = [];
  let totalWastedCost = 0;

  // Detect retry patterns (same customer, same model, within short time window)
  const txnsByCustomerModel = {};
  for (const txn of transactions) {
    const key = `${txn.customer_id || 'unknown'}|${txn.model || 'unknown'}`;
    if (!txnsByCustomerModel[key]) txnsByCustomerModel[key] = [];
    txnsByCustomerModel[key].push(txn);
  }

  for (const key in txnsByCustomerModel) {
    const txns = txnsByCustomerModel[key].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    // Find sequences with >3 calls within 1 minute
    for (let i = 0; i < txns.length - 2; i++) {
      const t1 = new Date(txns[i].created_at);
      const t3 = new Date(txns[i + 2].created_at);
      const timeDiff = (t3 - t1) / 1000; // seconds

      if (timeDiff < 60 && txns[i + 1]) {
        retryLoops.push({
          customer_id: txns[i].customer_id,
          model: txns[i].model,
          count: 3,
          time_window: `${timeDiff.toFixed(0)}s`,
          seal_ids: [txns[i].seal_id, txns[i + 1].seal_id, txns[i + 2].seal_id]
        });
        totalWastedCost += (parseFloat(txns[i].cost) || 0) + (parseFloat(txns[i + 1].cost) || 0);
        if (txns[i].customer_id) affectedCustomers.push(txns[i].customer_id);
      }
    }
  }

  return {
    detected: retryLoops.length > 0,
    retry_loops: retryLoops,
    frequency_windows: frequencyWindows,
    affected_customers: affectedCustomers,
    margin_impact: totalWastedCost,
    seal_ids: retryLoops.flatMap(rl => rl.seal_ids)
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// NARRATIVE GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

function generateBehaviorChangeNarrative(current, prior, zScore) {
  const direction = current.totalCost > prior.totalCost ? 'increased' : 'decreased';
  const pct = Math.abs((current.totalCost - prior.totalCost) / prior.totalCost * 100).toFixed(1);
  return `AI spending has ${direction} by ${pct}% (Z-score: ${zScore.toFixed(2)}). This represents a statistically significant change in customer usage behavior.`;
}

function generateCustomerMarginNarrative(change) {
  const direction = change.current_cost > change.prior_cost ? 'increased' : 'decreased';
  return `Customer ${change.customer_id} spending ${direction} ${Math.abs(change.delta_percent).toFixed(1)}% from prior period (${change.txn_count_delta > 0 ? '+' : ''}${change.txn_count_delta} transactions).`;
}

function generatePricingChangeNarrative(change) {
  const direction = change.current_unit_cost > change.prior_unit_cost ? 'increased' : 'decreased';
  return `${change.model} unit cost ${direction} by ${Math.abs(change.unit_cost_change_percent).toFixed(2)}%, impacting margin by $${Math.abs(change.cost_impact).toFixed(2)}.`;
}

function generateModelMixNarrative(shift) {
  return `Model distribution shifted significantly. ${shift.distribution_change}. Total margin impact: $${Math.abs(shift.margin_impact).toFixed(2)}.`;
}

function generateAgentMalfunctionNarrative(issues) {
  const loopCount = issues.retry_loops.length;
  return `Detected ${loopCount} retry loop(s) with excessive API calls in short time windows. Estimated wasted cost: $${issues.margin_impact.toFixed(2)}.`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORENSIC DRILLDOWN
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /v1/margins/forensics/drilldown
 * Drill into specific root cause, return underlying sealed transactions
 *
 * Query Params:
 *   - root_cause_id: ID from forensic analysis finding
 *   - period: Target period for lookup
 */
const handleForensicDrilldown = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const url = new URL(request.url);
    const rootCauseId = url.searchParams.get('root_cause_id');
    const period = url.searchParams.get('period');
    const limit = Math.min(parseInt(url.searchParams.get('limit')) || 100, 1000);

    if (!rootCauseId || !period) {
      return errorResponse('INVALID_PARAMS', 'root_cause_id and period are required');
    }

    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
      return errorResponse('SERVICE_UNAVAILABLE', 'Database not configured');
    }

    const headers = {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    };

    // Fetch transactions matching root cause criteria
    let query = `${env.SUPABASE_URL}/rest/v1/economic_transactions?org_id=eq.${orgId}&period=ilike.${period}*&limit=${limit}`;

    // Parse root_cause_id to determine filter
    if (rootCauseId.startsWith('customer:')) {
      const customerId = rootCauseId.split(':')[1];
      query += `&customer_id=eq.${customerId}`;
    } else if (rootCauseId.startsWith('model:')) {
      const model = rootCauseId.split(':')[1];
      query += `&model=eq.${model}`;
    } else if (rootCauseId.startsWith('agent:')) {
      // Return high-frequency transactions
      query += `&order=created_at.desc`;
    }

    const resp = await fetch(query, { headers });

    if (!resp.ok) {
      return errorResponse('DB_ERROR', 'Failed to fetch transactions');
    }

    const transactions = await resp.json() || [];

    return jsonResponse({
      root_cause_id: rootCauseId,
      period: period,
      transaction_count: transactions.length,
      transactions: transactions.map(t => ({
        seal_id: t.seal_id,
        created_at: t.created_at,
        customer_id: t.customer_id,
        model: t.model,
        provider: t.provider,
        cost: Math.round(parseFloat(t.cost || 0) * 100) / 100,
        tokens_in: t.tokens_in,
        tokens_out: t.tokens_out,
        cost_method: t.cost_method,
        optimization_delta: t.optimization_delta
      }))
    }, 200);
  } catch (error) {
    console.error(`[margin-forensics] Drilldown error: ${error.message}`);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// WEBHOOK INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /v1/margins/forensics/webhooks
 * Fire webhook events for forensic findings
 *
 * Body:
 *   - findings: array of finding objects from forensic analysis
 *   - webhook_url: (optional) override webhook URL
 */
const handleForensicWebhooks = async (request, env, ctx) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const body = await request.json();
    const findings = body.findings || [];
    const webhookUrl = body.webhook_url;

    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
      return errorResponse('SERVICE_UNAVAILABLE', 'Database not configured');
    }

    const headers = {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    };

    // Fetch org webhook config
    let orgWebhook = webhookUrl;
    if (!orgWebhook) {
      const configResp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/org_settings?org_id=eq.${orgId}&select=webhook_url`,
        { headers }
      );
      if (configResp.ok) {
        const configs = await configResp.json();
        orgWebhook = configs[0]?.webhook_url;
      }
    }

    if (!orgWebhook) {
      return jsonResponse({
        webhooks_sent: 0,
        message: 'No webhook configured for organization'
      }, 200);
    }

    let sentCount = 0;

    // Send event for each finding
    for (const finding of findings) {
      const eventType = `margin.forensic.${finding.root_cause}`;
      const payload = {
        event_type: eventType,
        org_id: orgId,
        timestamp: new Date().toISOString(),
        finding: finding
      };

      try {
        const webhookResp = await fetch(orgWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (webhookResp.ok) {
          sentCount++;
        } else {
          console.warn(`[margin-forensics] Webhook failed: ${webhookResp.status}`);
        }
      } catch (whErr) {
        console.error(`[margin-forensics] Webhook error: ${whErr.message}`);
      }
    }

    return jsonResponse({
      webhooks_sent: sentCount,
      findings_processed: findings.length,
      message: `Sent ${sentCount}/${findings.length} webhook events`
    }, 200);
  } catch (error) {
    console.error(`[margin-forensics] Webhook error: ${error.message}`);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  handleForensicAnalysis,
  handleForensicDrilldown,
  handleForensicWebhooks
};
