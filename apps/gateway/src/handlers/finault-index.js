/**
 * Finault Index - Cross-Customer Benchmarks
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Anonymized benchmarks for cost, margin, model usage, and industry metrics.
 * Computes percentile rankings for the requesting organization.
 */

import { jsonResponse, errorResponse } from '../utils.js';
import { getOrgIdFromAuth } from '../auth.js';

async function supabaseQuery(env, table, query) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase error: ${res.status} ${text}`);
  }

  return res.json();
}

function calculatePercentile(value, sortedArray) {
  if (sortedArray.length === 0) return 0;
  const index = sortedArray.indexOf(value);
  if (index === -1) return 0;
  return Math.round((index / sortedArray.length) * 100);
}

async function handleFinaultIndex(request, env, ctx) {
  try {
    const orgId = getOrgIdFromAuth(request);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    // Fetch all organizations' usage for benchmarking
    const allUsageQuery = `timestamp=gte.${cutoff.toISOString()}&order=org_id.asc`;
    const allUsage = await supabaseQuery(env, 'usage', allUsageQuery);

    // Fetch organizations' metadata if available
    let orgsMetadata = [];
    try {
      orgsMetadata = await supabaseQuery(env, 'organizations', 'select=id,industry,size_employees&order=id.asc');
    } catch (e) {
      console.error('[FINAULT_INDEX] Could not fetch org metadata:', e);
    }

    // Group usage by organization
    const orgMetrics = {};
    for (const usage of allUsage) {
      const oid = usage.org_id;
      if (!orgMetrics[oid]) {
        orgMetrics[oid] = {
          org_id: oid,
          transactions: 0,
          total_cost: 0,
          total_revenue: 0,
          models: {},
          customers: new Set()
        };
      }
      orgMetrics[oid].transactions += 1;
      orgMetrics[oid].total_cost += parseFloat(usage.cost) || 0;
      if (usage.customer_id) {
        orgMetrics[oid].customers.add(usage.customer_id);
      }
      if (usage.model) {
        if (!orgMetrics[oid].models[usage.model]) {
          orgMetrics[oid].models[usage.model] = 0;
        }
        orgMetrics[oid].models[usage.model] += 1;
      }
    }

    // Fetch revenue data if available
    try {
      const allRevenueQuery = `period_start=gte.${cutoff.toISOString()}&order=org_id.asc`;
      const allRevenue = await supabaseQuery(env, 'revenue_records', allRevenueQuery);

      for (const revenue of allRevenue) {
        const oid = revenue.org_id;
        if (orgMetrics[oid]) {
          orgMetrics[oid].total_revenue += parseFloat(revenue.amount) || 0;
        }
      }
    } catch (e) {
      console.error('[FINAULT_INDEX] Could not fetch revenue data:', e);
    }

    // Calculate per-org metrics
    const costPerTx = [];
    const spendAsPercent = [];
    const margins = [];
    const sizes = [];

    for (const metrics of Object.values(orgMetrics)) {
      const cost = metrics.total_cost || 1;
      const txCount = metrics.transactions || 1;
      metrics.cost_per_transaction = cost / txCount;
      costPerTx.push(metrics.cost_per_transaction);

      const revenue = metrics.total_revenue || 0;
      if (revenue > 0) {
        metrics.ai_spend_percent = (cost / revenue) * 100;
        spendAsPercent.push(metrics.ai_spend_percent);
      }

      const margin = revenue - cost;
      metrics.net_margin = margin;
      if (revenue > 0) {
        metrics.margin_percent = (margin / revenue) * 100;
        margins.push(metrics.margin_percent);
      }

      metrics.customer_count = metrics.customers.size;
    }

    // Sort for percentile calculations
    const sortedCostPerTx = [...costPerTx].sort((a, b) => a - b);
    const sortedSpendPercent = [...spendAsPercent].sort((a, b) => a - b);
    const sortedMargins = [...margins].sort((a, b) => a - b);

    // Get requesting org metrics
    const requestingOrgMetrics = orgMetrics[orgId] || {
      cost_per_transaction: 0,
      ai_spend_percent: 0,
      margin_percent: 0
    };

    // Calculate median values
    const medianCostPerTx = sortedCostPerTx[Math.floor(sortedCostPerTx.length / 2)] || 0;
    const medianSpendPercent = sortedSpendPercent[Math.floor(sortedSpendPercent.length / 2)] || 0;
    const medianMargin = sortedMargins[Math.floor(sortedMargins.length / 2)] || 0;

    // Aggregate model usage across all orgs
    const modelUsage = {};
    for (const metrics of Object.values(orgMetrics)) {
      for (const [model, count] of Object.entries(metrics.models)) {
        if (!modelUsage[model]) {
          modelUsage[model] = 0;
        }
        modelUsage[model] += count;
      }
    }

    const totalModelUsage = Object.values(modelUsage).reduce((a, b) => a + b, 0);
    const modelDistribution = {};
    for (const [model, count] of Object.entries(modelUsage)) {
      modelDistribution[model] = parseFloat(((count / totalModelUsage) * 100).toFixed(2));
    }

    // Calculate industry/size breakdowns if metadata available
    const industryMetrics = {};
    const sizeMetrics = {};

    for (const org of orgsMetadata) {
      const metrics = orgMetrics[org.id];
      if (metrics) {
        if (org.industry) {
          if (!industryMetrics[org.industry]) {
            industryMetrics[org.industry] = [];
          }
          industryMetrics[org.industry].push(metrics.margin_percent || 0);
        }
        if (org.size_employees) {
          if (!sizeMetrics[org.size_employees]) {
            sizeMetrics[org.size_employees] = [];
          }
          sizeMetrics[org.size_employees].push(metrics.margin_percent || 0);
        }
      }
    }

    const industryBenchmarks = {};
    for (const [industry, margins] of Object.entries(industryMetrics)) {
      const sorted = [...margins].sort((a, b) => a - b);
      industryBenchmarks[industry] = {
        median_margin_percent: sorted[Math.floor(sorted.length / 2)],
        sample_size: margins.length
      };
    }

    const sizeBenchmarks = {};
    for (const [size, margins] of Object.entries(sizeMetrics)) {
      const sorted = [...margins].sort((a, b) => a - b);
      sizeBenchmarks[size] = {
        median_margin_percent: sorted[Math.floor(sorted.length / 2)],
        sample_size: margins.length
      };
    }

    return jsonResponse({
      index: {
        timestamp: new Date().toISOString(),
        period_days: 90,
        participating_orgs: Object.keys(orgMetrics).length
      },
      median_benchmarks: {
        cost_per_transaction: parseFloat(medianCostPerTx.toFixed(6)),
        ai_spend_as_percent_revenue: parseFloat(medianSpendPercent.toFixed(2)),
        net_margin_percent: parseFloat(medianMargin.toFixed(2))
      },
      your_org: {
        cost_per_transaction: parseFloat(requestingOrgMetrics.cost_per_transaction.toFixed(6)),
        cost_per_transaction_percentile: calculatePercentile(
          requestingOrgMetrics.cost_per_transaction,
          sortedCostPerTx
        ),
        ai_spend_as_percent_revenue: parseFloat(requestingOrgMetrics.ai_spend_percent.toFixed(2)),
        ai_spend_percentile: calculatePercentile(
          requestingOrgMetrics.ai_spend_percent,
          sortedSpendPercent
        ),
        net_margin_percent: parseFloat(requestingOrgMetrics.margin_percent.toFixed(2)),
        margin_percentile: calculatePercentile(
          requestingOrgMetrics.margin_percent,
          sortedMargins
        ),
        total_transactions: requestingOrgMetrics.transactions,
        total_cost: parseFloat(requestingOrgMetrics.total_cost.toFixed(2)),
        total_revenue: parseFloat(requestingOrgMetrics.total_revenue.toFixed(2)),
        customer_count: requestingOrgMetrics.customer_count
      },
      model_distribution: Object.entries(modelDistribution)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .reduce((acc, [model, pct]) => {
          acc[model] = pct;
          return acc;
        }, {}),
      industry_benchmarks: Object.keys(industryBenchmarks).length > 0 ? industryBenchmarks : null,
      size_benchmarks: Object.keys(sizeBenchmarks).length > 0 ? sizeBenchmarks : null,
      performance_assessment: (() => {
        const yourMargin = requestingOrgMetrics.margin_percent || 0;
        const medianMarginValue = medianMargin;

        if (yourMargin > medianMarginValue * 1.2) {
          return 'EXCELLENT - Above median margins';
        } else if (yourMargin > medianMarginValue) {
          return 'GOOD - Above median margins';
        } else if (yourMargin > medianMarginValue * 0.8) {
          return 'FAIR - Near median';
        } else {
          return 'NEEDS_IMPROVEMENT - Below median margins';
        }
      })()
    });
  } catch (error) {
    console.error('[FINAULT_INDEX]', error);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

export {
  handleFinaultIndex
};
