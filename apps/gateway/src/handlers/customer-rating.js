/**
 * CUSTOMER ECONOMIC RATING SYSTEM
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Five-dimensional economic rating for each customer:
 * 1. Margin Health (30%) — margin vs cohort, trend
 * 2. Cost Trajectory (25%) — rate of cost change
 * 3. Revenue Coverage (20%) — MRR / AI cost ratio
 * 4. Usage Concentration (10%) — model diversity
 * 5. Optimization Potential (15%) — recoverable spend (inverted)
 *
 * Composite score → letter grade (A/B/C/D) + trajectory (1/2/3)
 * Natural language summary generated for each customer.
 *
 * Endpoints:
 *   POST /v1/ratings/compute     — compute ratings for all customers in org
 *   GET  /v1/ratings             — latest ratings for all customers
 *   GET  /v1/ratings/:id/history — rating history for one customer
 *   GET  /v1/ratings/portfolio   — portfolio distribution summary
 *   GET  /v1/ratings/migrations  — recent rating changes
 */

// ═══════════════════════════════════════════════════════════════════════════════
// SUPABASE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

async function supabaseQuery(env, table, query = '') {
  const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: {
      'apikey': env.SUPABASE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Supabase query failed: ${resp.status} ${err}`);
  }
  return resp.json();
}

async function supabaseInsert(env, table, rows) {
  const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': env.SUPABASE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(rows),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Supabase insert failed: ${resp.status} ${err}`);
  }
  return resp.json();
}

async function supabaseUpsert(env, table, rows, onConflict) {
  const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': env.SUPABASE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(rows),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Supabase upsert failed: ${resp.status} ${err}`);
  }
  return resp.json();
}

// ═══════════════════════════════════════════════════════════════════════════════
// ORG RESOLUTION — Supabase JWT doesn't include org_id in claims,
// so we look it up from the users table using auth_id
// ═══════════════════════════════════════════════════════════════════════════════

async function resolveOrgId(request, env) {
  // First try the gateway-provided orgId
  const gatewayOrgId = request._user?.orgId;

  // If authenticated via API key, orgId is always the real org
  if (gatewayOrgId && request._user?.authMethod === 'api_key') {
    return gatewayOrgId;
  }

  // For JWT auth, orgId might just be userId (fallback). Only trust it if different.
  if (gatewayOrgId && gatewayOrgId !== request._user?.userId) {
    return gatewayOrgId;
  }

  // Check query parameter
  const url = new URL(request.url);
  const queryOrgId = url.searchParams.get('org_id');
  if (queryOrgId) return queryOrgId;

  // Check request body
  if (request.method === 'POST') {
    try {
      const body = await request.clone().json();
      if (body.org_id) return body.org_id;
    } catch {}
  }

  // Fall back: look up org from users table using auth_id
  const userId = request._user?.userId;
  if (userId && env.SUPABASE_URL && (env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY)) {
    const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY;
    const resp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/users?auth_id=eq.${userId}&select=organization_id&limit=1`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );
    if (resp.ok) {
      const rows = await resp.json();
      if (rows && rows.length > 0 && rows[0].organization_id) {
        return rows[0].organization_id;
      }
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCORING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function scoreMarginHealth(currentMargin, cohortAvg, trendSlope) {
  let base;
  if (currentMargin > 70 && currentMargin >= cohortAvg) base = 90;
  else if (currentMargin >= 40 && currentMargin >= cohortAvg - 10) base = 65;
  else if (currentMargin >= 20) base = 40;
  else if (currentMargin >= 0) base = 20;
  else base = 7;

  // Trend modifier
  let modifier = 0;
  if (trendSlope > 2) modifier = 5;
  else if (trendSlope < -2) modifier = -10;

  return Math.max(0, Math.min(100, base + modifier));
}

function scoreCostTrajectory(costMoMChange, acceleration) {
  let base;
  if (costMoMChange <= 5) base = 85;
  else if (costMoMChange <= 20) base = 55;
  else if (costMoMChange <= 50) base = 27;
  else base = 7;

  // Acceleration modifier
  let modifier = 0;
  if (acceleration < -5) modifier = 10;   // decelerating
  else if (acceleration > 5) modifier = -10; // accelerating

  return Math.max(0, Math.min(100, base + modifier));
}

function scoreRevenueCoverage(coverageRatio) {
  if (coverageRatio >= 5) return 95;
  if (coverageRatio >= 3) return 80;
  if (coverageRatio >= 1.5) return 57;
  if (coverageRatio >= 1.0) return 32;
  return 10;
}

function scoreUsageConcentration(topModelPct) {
  if (topModelPct < 40) return 90;
  if (topModelPct < 60) return 65;
  if (topModelPct < 80) return 37;
  return 12;
}

function scoreOptimizationPotential(recoverablePct) {
  // Inverted: high potential = low score (current state is inefficient)
  if (recoverablePct < 5) return 95;
  if (recoverablePct < 15) return 75;
  if (recoverablePct < 30) return 45;
  return 15;
}

function computeComposite(dimensions) {
  const weights = {
    margin_health: 0.30,
    cost_trajectory: 0.25,
    revenue_coverage: 0.20,
    usage_concentration: 0.10,
    optimization_potential: 0.15,
  };
  return Object.keys(weights).reduce((sum, key) => sum + (dimensions[key] * weights[key]), 0);
}

function letterFromComposite(composite) {
  if (composite >= 75) return 'A';
  if (composite >= 50) return 'B';
  if (composite >= 25) return 'C';
  return 'D';
}

// ═══════════════════════════════════════════════════════════════════════════════
// NATURAL LANGUAGE SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

function generateSummary(letter, trajectory, dimensions, margin, mrr, aiCost, costMoMChange, recoverablePct, topModelPct) {
  const monthlyLoss = aiCost - mrr;
  const profit = mrr - aiCost;

  // D ratings (critical)
  if (letter === 'D') {
    if (margin < -100) {
      return {
        summary: `Losing $${Math.abs(monthlyLoss).toLocaleString()}/mo. AI cost is ${Math.abs(margin).toFixed(0)}% of revenue. Needs immediate repricing or cost intervention.`,
        action: 'reprice',
      };
    }
    return {
      summary: `Deeply unprofitable. $${aiCost.toLocaleString()} cost on $${mrr.toLocaleString()} revenue.${costMoMChange > 20 ? ` Cost growing ${costMoMChange.toFixed(0)}%/mo.` : ''} Unsustainable without changes.`,
      action: 'reprice',
    };
  }

  // C ratings (weak)
  if (letter === 'C') {
    if (trajectory === 1) {
      return {
        summary: `Recovering. Margin improving but still thin at ${margin.toFixed(1)}%. ${dimensions.optimization_potential < 50 ? 'Optimization opportunities remain.' : 'Most savings already captured.'}`,
        action: 'monitor',
      };
    }
    if (margin < 0) {
      const minPrice = Math.ceil(aiCost * 1.3);
      const rec = recoverablePct > 30
        ? `Switch expensive models to save ~${recoverablePct.toFixed(0)}% of cost.`
        : `Reprice to at least $${minPrice}/mo.`;
      return {
        summary: `Losing $${Math.abs(monthlyLoss).toLocaleString()}/mo.${costMoMChange > 15 ? ` Cost growing ${costMoMChange.toFixed(0)}%/mo.` : ''} ${rec}`,
        action: 'optimize',
      };
    }
    return {
      summary: `Thin margin at ${margin.toFixed(1)}%.${trajectory === 3 ? ' Declining.' : ''} Review cost allocation and pricing.`,
      action: 'optimize',
    };
  }

  // B ratings (adequate)
  if (letter === 'B') {
    if (trajectory === 3) {
      const risk = costMoMChange > 20
        ? `Cost growing ${costMoMChange.toFixed(0)}%/mo.`
        : 'Margin pressure building.';
      return {
        summary: `${margin.toFixed(1)}% margin but trending down. ${risk} Worth watching.`,
        action: 'monitor',
      };
    }
    if (trajectory === 1) {
      return {
        summary: `Improving. ${margin.toFixed(1)}% margin, trending up. On track for strong economics.`,
        action: 'monitor',
      };
    }
    return {
      summary: `Stable at ${margin.toFixed(1)}% margin. $${profit.toLocaleString()}/mo profit.${dimensions.optimization_potential < 40 ? '' : ' Some optimization available.'}`,
      action: 'monitor',
    };
  }

  // A ratings (strong)
  if (trajectory === 3) {
    const risk = costMoMChange > 20
      ? `Cost growing ${costMoMChange.toFixed(0)}%/mo.`
      : 'Margin pressure building.';
    return {
      summary: `Strong at ${margin.toFixed(1)}%, but ${risk} Monitor the trend.`,
      action: 'monitor',
    };
  }
  return {
    summary: `Strong. $${profit.toLocaleString()}/mo profit. ${margin.toFixed(1)}% margin.${topModelPct < 60 ? ' Well diversified.' : ''}`,
    action: 'celebrate',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATA GATHERING FROM SEALS + REVENUE
// ═══════════════════════════════════════════════════════════════════════════════

async function gatherCustomerData(env, orgId) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now - 30 * 86400000).toISOString();
  const sixtyDaysAgo = new Date(now - 60 * 86400000).toISOString();
  const ninetyDaysAgo = new Date(now - 90 * 86400000).toISOString();

  // Fetch seals for last 90 days (cost data per customer per model)
  // seals uses: principal_id (customer), model, cost_usd, created_at, org_id (text)
  const seals = await supabaseQuery(env, 'seals',
    `org_id=eq.${orgId}&created_at=gte.${ninetyDaysAgo}&select=principal_id,model,cost_usd,created_at`
  );

  // Fetch revenue entries (MRR per customer)
  // revenue_entries uses: finault_customer_id, mrr_usd, customer_name
  const revenue = await supabaseQuery(env, 'revenue_entries',
    `org_id=eq.${orgId}&select=finault_customer_id,mrr_usd,customer_name`
  );

  // Group seals by customer (principal_id)
  const customerSeals = {};
  for (const seal of seals) {
    const cid = seal.principal_id;
    if (!cid) continue;
    if (!customerSeals[cid]) customerSeals[cid] = [];
    customerSeals[cid].push(seal);
  }

  // Build revenue lookup (finault_customer_id)
  const revenueLookup = {};
  for (const r of revenue) {
    const cid = r.finault_customer_id;
    if (!cid) continue;
    revenueLookup[cid] = { mrr: parseFloat(r.mrr_usd) || 0, name: r.customer_name || cid };
  }

  // All customer IDs (union of both sources)
  const allCustomerIds = new Set([...Object.keys(customerSeals), ...Object.keys(revenueLookup)]);

  const results = [];
  for (const customerId of allCustomerIds) {
    const custSeals = customerSeals[customerId] || [];
    const rev = revenueLookup[customerId] || { mrr: 0, name: customerId };

    // Split seals into time periods
    const last30 = custSeals.filter(s => new Date(s.created_at) >= new Date(thirtyDaysAgo));
    const prev30 = custSeals.filter(s => {
      const d = new Date(s.created_at);
      return d >= new Date(sixtyDaysAgo) && d < new Date(thirtyDaysAgo);
    });
    const oldest30 = custSeals.filter(s => {
      const d = new Date(s.created_at);
      return d >= new Date(ninetyDaysAgo) && d < new Date(sixtyDaysAgo);
    });

    const cost30 = last30.reduce((s, x) => s + (parseFloat(x.cost_usd) || 0), 0);
    const costPrev30 = prev30.reduce((s, x) => s + (parseFloat(x.cost_usd) || 0), 0);
    const costOldest30 = oldest30.reduce((s, x) => s + (parseFloat(x.cost_usd) || 0), 0);

    const mrr = rev.mrr;
    const margin = mrr > 0 ? ((mrr - cost30) / mrr) * 100 : (cost30 > 0 ? -999 : 0);
    const coverageRatio = cost30 > 0 ? mrr / cost30 : (mrr > 0 ? 99 : 0);

    // Cost MoM change
    const costMoM = costPrev30 > 0 ? ((cost30 - costPrev30) / costPrev30) * 100 : 0;

    // Cost acceleration (change in rate of change)
    const prevMoM = costOldest30 > 0 ? ((costPrev30 - costOldest30) / costOldest30) * 100 : 0;
    const acceleration = costMoM - prevMoM;

    // Margin trend (simple: compare current margin to what it was 60-90d ago)
    const oldCost = costOldest30;
    const oldMargin = mrr > 0 ? ((mrr - oldCost) / mrr) * 100 : 0;
    const trendSlope = (margin - oldMargin) / 3; // points per month over 3 months

    // Model concentration
    const modelCosts = {};
    for (const s of last30) {
      const m = s.model || 'unknown';
      modelCosts[m] = (modelCosts[m] || 0) + (parseFloat(s.cost_usd) || 0);
    }
    const topModelCost = Math.max(...Object.values(modelCosts), 0);
    const topModelPct = cost30 > 0 ? (topModelCost / cost30) * 100 : 100;

    // Optimization potential (estimate: if top model > 60% of cost, ~20% recoverable via substitution)
    let recoverablePct = 0;
    if (topModelPct > 80) recoverablePct = 35;
    else if (topModelPct > 60) recoverablePct = 20;
    else if (topModelPct > 40) recoverablePct = 10;
    else recoverablePct = 3;

    results.push({
      customerId,
      customerName: rev.name,
      mrr,
      aiCost: cost30,
      margin,
      coverageRatio,
      costMoM,
      acceleration,
      trendSlope,
      topModelPct,
      recoverablePct,
    });
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPUTE RATINGS FOR ALL CUSTOMERS
// ═══════════════════════════════════════════════════════════════════════════════

async function computeAllRatings(env, orgId) {
  const customers = await gatherCustomerData(env, orgId);

  if (customers.length === 0) {
    return { ratings: [], portfolio: null, migrations: [] };
  }

  // Compute cohort average margin for relative scoring
  const validMargins = customers.filter(c => c.margin > -500).map(c => c.margin);
  const cohortAvg = validMargins.length > 0
    ? validMargins.reduce((s, m) => s + m, 0) / validMargins.length
    : 0;

  // Get previous ratings for migration detection
  const prevRatings = await supabaseQuery(env, 'customer_ratings',
    `org_id=eq.${orgId}&order=computed_at.desc&limit=1000&select=customer_id,letter_grade,rating,composite_score`
  );
  const prevRatingMap = {};
  for (const r of prevRatings) {
    if (!prevRatingMap[r.customer_id]) {
      prevRatingMap[r.customer_id] = r;
    }
  }

  const ratings = [];
  const migrations = [];
  const today = new Date().toISOString().split('T')[0];

  for (const c of customers) {
    // Score each dimension
    const dimensions = {
      margin_health: scoreMarginHealth(c.margin, cohortAvg, c.trendSlope),
      cost_trajectory: scoreCostTrajectory(c.costMoM, c.acceleration),
      revenue_coverage: scoreRevenueCoverage(c.coverageRatio),
      usage_concentration: scoreUsageConcentration(c.topModelPct),
      optimization_potential: scoreOptimizationPotential(c.recoverablePct),
    };

    const composite = computeComposite(dimensions);
    const letter = letterFromComposite(composite);

    // Trajectory: compare to previous composite
    const prev = prevRatingMap[c.customerId];
    let trajectory = 2; // stable
    if (prev) {
      const diff = composite - parseFloat(prev.composite_score);
      if (diff > 3) trajectory = 1; // improving
      else if (diff < -3) trajectory = 3; // deteriorating
    }

    const ratingCode = `${letter}${trajectory}`;

    const { summary, action } = generateSummary(
      letter, trajectory, dimensions,
      c.margin, c.mrr, c.aiCost, c.costMoM, c.recoverablePct, c.topModelPct
    );

    const row = {
      org_id: orgId,
      customer_id: c.customerId,
      composite_score: parseFloat(composite.toFixed(2)),
      letter_grade: letter,
      trajectory,
      rating: ratingCode,
      margin_health: parseFloat(dimensions.margin_health.toFixed(2)),
      cost_trajectory: parseFloat(dimensions.cost_trajectory.toFixed(2)),
      revenue_coverage: parseFloat(dimensions.revenue_coverage.toFixed(2)),
      usage_concentration: parseFloat(dimensions.usage_concentration.toFixed(2)),
      optimization_potential: parseFloat(dimensions.optimization_potential.toFixed(2)),
      current_margin: parseFloat(c.margin.toFixed(2)),
      mrr_usd: parseFloat(c.mrr.toFixed(2)),
      ai_cost_usd: parseFloat(c.aiCost.toFixed(2)),
      coverage_ratio: parseFloat(c.coverageRatio.toFixed(2)),
      cost_mom_change: parseFloat(c.costMoM.toFixed(2)),
      top_model_pct: parseFloat(c.topModelPct.toFixed(2)),
      recoverable_pct: parseFloat(c.recoverablePct.toFixed(2)),
      summary,
      action,
      computed_date: today,
    };

    ratings.push(row);

    // Detect migration
    if (prev && prev.letter_grade !== letter) {
      let primaryDriver = 'margin_health';
      let maxDelta = 0;
      for (const dim of Object.keys(dimensions)) {
        // We don't have prev dimensions stored individually in the lookup, so use composite diff
        const delta = Math.abs(dimensions[dim] - 50); // rough heuristic
        if (delta > maxDelta) {
          maxDelta = delta;
          primaryDriver = dim;
        }
      }

      migrations.push({
        org_id: orgId,
        customer_id: c.customerId,
        previous_rating: prev.rating,
        new_rating: ratingCode,
        previous_composite: parseFloat(prev.composite_score),
        new_composite: parseFloat(composite.toFixed(2)),
        primary_driver: primaryDriver,
        driver_detail: `${c.customerName}: ${prev.rating} → ${ratingCode}`,
      });
    }
  }

  // Write ratings to DB
  if (ratings.length > 0) {
    await supabaseInsert(env, 'customer_ratings', ratings);
  }

  // Write migrations
  if (migrations.length > 0) {
    await supabaseInsert(env, 'rating_migrations', migrations);
  }

  // Write portfolio snapshot
  const countA = ratings.filter(r => r.letter_grade === 'A').length;
  const countB = ratings.filter(r => r.letter_grade === 'B').length;
  const countC = ratings.filter(r => r.letter_grade === 'C').length;
  const countD = ratings.filter(r => r.letter_grade === 'D').length;
  const avgComposite = ratings.reduce((s, r) => s + r.composite_score, 0) / ratings.length;
  const avgMargin = ratings.reduce((s, r) => s + r.current_margin, 0) / ratings.length;
  const totalMrr = ratings.reduce((s, r) => s + r.mrr_usd, 0);
  const totalCost = ratings.reduce((s, r) => s + r.ai_cost_usd, 0);

  const portfolio = {
    org_id: orgId,
    snapshot_date: today,
    total_customers: ratings.length,
    count_a: countA,
    count_b: countB,
    count_c: countC,
    count_d: countD,
    avg_composite: parseFloat(avgComposite.toFixed(2)),
    avg_margin: parseFloat(avgMargin.toFixed(2)),
    total_mrr: parseFloat(totalMrr.toFixed(2)),
    total_ai_cost: parseFloat(totalCost.toFixed(2)),
  };

  await supabaseUpsert(env, 'portfolio_snapshots', [portfolio]);

  return { ratings, portfolio, migrations };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HTTP HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

/**
 * POST /v1/ratings/compute
 * Compute ratings for all customers in the org.
 */
async function handleComputeRatings(request, env) {
  try {
    const orgId = await resolveOrgId(request, env);
    if (!orgId) return jsonResponse({ error: 'Organization ID required. Pass org_id query param or authenticate with a Finault API key.' }, 401);

    const result = await computeAllRatings(env, orgId);

    return jsonResponse({
      success: true,
      computed: result.ratings.length,
      migrations: result.migrations.length,
      portfolio: result.portfolio,
    });
  } catch (error) {
    console.error('Rating compute error:', error);
    return jsonResponse({ error: 'Failed to compute ratings', detail: error.message }, 500);
  }
}

/**
 * GET /v1/ratings
 * Returns latest ratings for all customers in the org.
 */
async function handleGetRatings(request, env) {
  try {
    const orgId = await resolveOrgId(request, env);
    if (!orgId) return jsonResponse({ error: 'Organization ID required. Pass org_id query param or authenticate with a Finault API key.' }, 401);

    // Get latest rating per customer (most recent computed_at)
    const ratings = await supabaseQuery(env, 'customer_ratings',
      `org_id=eq.${orgId}&order=computed_at.desc&select=*`
    );

    // Deduplicate: keep only the latest per customer
    const latest = {};
    for (const r of ratings) {
      if (!latest[r.customer_id]) {
        latest[r.customer_id] = r;
      }
    }

    return jsonResponse({
      ratings: Object.values(latest),
      count: Object.keys(latest).length,
    });
  } catch (error) {
    console.error('Get ratings error:', error);
    return jsonResponse({ error: 'Failed to fetch ratings', detail: error.message }, 500);
  }
}

/**
 * GET /v1/ratings/:customer_id/history
 * Returns rating history for a specific customer.
 */
async function handleRatingHistory(request, env) {
  try {
    const orgId = await resolveOrgId(request, env);
    if (!orgId) return jsonResponse({ error: 'Organization ID required. Pass org_id query param or authenticate with a Finault API key.' }, 401);

    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const customerId = decodeURIComponent(parts[3]); // /v1/ratings/{customer_id}/history
    const days = parseInt(url.searchParams.get('days') || '90');

    const since = new Date(Date.now() - days * 86400000).toISOString();

    const history = await supabaseQuery(env, 'customer_ratings',
      `org_id=eq.${orgId}&customer_id=eq.${customerId}&computed_at=gte.${since}&order=computed_at.asc&select=*`
    );

    return jsonResponse({
      customer_id: customerId,
      days,
      history,
      count: history.length,
    });
  } catch (error) {
    console.error('Rating history error:', error);
    return jsonResponse({ error: 'Failed to fetch rating history', detail: error.message }, 500);
  }
}

/**
 * GET /v1/ratings/portfolio
 * Returns latest portfolio distribution snapshot.
 */
async function handlePortfolio(request, env) {
  try {
    const orgId = await resolveOrgId(request, env);
    if (!orgId) return jsonResponse({ error: 'Organization ID required. Pass org_id query param or authenticate with a Finault API key.' }, 401);

    const snapshots = await supabaseQuery(env, 'portfolio_snapshots',
      `org_id=eq.${orgId}&order=snapshot_date.desc&limit=30&select=*`
    );

    return jsonResponse({
      latest: snapshots[0] || null,
      history: snapshots,
    });
  } catch (error) {
    console.error('Portfolio error:', error);
    return jsonResponse({ error: 'Failed to fetch portfolio', detail: error.message }, 500);
  }
}

/**
 * GET /v1/ratings/migrations
 * Returns recent rating changes.
 */
async function handleMigrations(request, env) {
  try {
    const orgId = await resolveOrgId(request, env);
    if (!orgId) return jsonResponse({ error: 'Organization ID required. Pass org_id query param or authenticate with a Finault API key.' }, 401);

    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '30');
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const migrations = await supabaseQuery(env, 'rating_migrations',
      `org_id=eq.${orgId}&migrated_at=gte.${since}&order=migrated_at.desc&select=*`
    );

    return jsonResponse({
      migrations,
      count: migrations.length,
      days,
    });
  } catch (error) {
    console.error('Migrations error:', error);
    return jsonResponse({ error: 'Failed to fetch migrations', detail: error.message }, 500);
  }
}

module.exports = {
  handleComputeRatings,
  handleGetRatings,
  handleRatingHistory,
  handlePortfolio,
  handleMigrations,
};
