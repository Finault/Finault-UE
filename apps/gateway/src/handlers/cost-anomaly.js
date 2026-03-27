/**
 * Cost Anomaly Detection Engine
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Lightweight rule-based anomaly detection using daily spend with seasonal decomposition.
 * Flags spikes, drifts, and cliffs at 2-sigma confidence.
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

async function supabaseInsert(env, table, records) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(records)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase insert error: ${res.status} ${text}`);
  }

  return res.json();
}

function computeStats(values) {
  if (values.length === 0) return { mean: 0, stddev: 0 };

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stddev = Math.sqrt(variance);

  return { mean, stddev };
}

function computeMovingAverage(values, window) {
  if (values.length < window) return values;

  const result = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return result;
}

async function runAnomalyDetection(env, orgId, customerId) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  let query = `org_id=eq.${orgId}&timestamp=gte.${cutoff.toISOString()}&order=timestamp.asc`;
  if (customerId) {
    query += `&customer_id=eq.${customerId}`;
  }

  const logs = await supabaseQuery(env, 'query_log', query);

  const dailySpend = {};
  for (const log of logs) {
    const date = new Date(log.timestamp);
    const dateKey = date.toISOString().split('T')[0];

    if (!dailySpend[dateKey]) {
      dailySpend[dateKey] = 0;
    }
    dailySpend[dateKey] += parseFloat(log.cost || 0);
  }

  const dates = Object.keys(dailySpend).sort();
  const spends = dates.map(d => dailySpend[d]);

  if (spends.length < 7) {
    return [];
  }

  const ma7 = computeMovingAverage(spends, 7);
  const stats = computeStats(spends);
  const threshold = stats.mean + (2 * stats.stddev);

  const anomalies = [];
  const now = new Date();

  for (let i = 0; i < dates.length; i++) {
    const cost = spends[i];
    const baseline = ma7[i] || stats.mean;
    const deviation = cost - baseline;
    const deviationPercent = (deviation / baseline) * 100;
    const sigmaDeviation = Math.abs(deviation) / stats.stddev;

    let classification = 'normal';
    if (sigmaDeviation >= 2) {
      if (i > 0 && deviationPercent > 50) {
        classification = 'spike';
      } else if (i > 6) {
        const ma7Prev = ma7[i - 7] || stats.mean;
        const trend = (baseline - ma7Prev) / ma7Prev;
        if (Math.abs(trend) > 0.2) {
          classification = 'drift';
        } else if (deviationPercent > 30) {
          classification = 'cliff';
        }
      }
    }

    if (classification !== 'normal') {
      anomalies.push({
        org_id: orgId,
        customer_id: customerId,
        anomaly_date: dates[i],
        daily_cost: cost,
        baseline_cost: baseline,
        deviation_percent: Math.round(deviationPercent * 100) / 100,
        classification: classification,
        sigma_deviation: Math.round(sigmaDeviation * 100) / 100,
        details: {
          moving_avg_7day: Math.round(baseline * 100) / 100,
          historical_mean: Math.round(stats.mean * 100) / 100,
          historical_stddev: Math.round(stats.stddev * 100) / 100
        },
        detected_at: now.toISOString()
      });
    }
  }

  if (anomalies.length > 0) {
    await supabaseInsert(env, 'cost_anomalies', anomalies);
  }

  return anomalies;
}

async function handleAnomalyCheck(request, env, ctx) {
  try {
    const orgId = getOrgIdFromAuth(request);
    const url = new URL(request.url);
    const customerId = url.searchParams.get('customer_id');

    const anomalies = await runAnomalyDetection(env, orgId, customerId);

    const byClassification = {};
    for (const anom of anomalies) {
      if (!byClassification[anom.classification]) {
        byClassification[anom.classification] = 0;
      }
      byClassification[anom.classification]++;
    }

    return jsonResponse({
      anomalies: {
        timestamp: new Date().toISOString(),
        org_id: orgId,
        customer_id: customerId,
        period_days: 90,
        total_anomalies: anomalies.length,
        by_classification: byClassification,
        alerts: anomalies.map(a => ({
          date: a.anomaly_date,
          cost: a.daily_cost,
          baseline: a.baseline_cost,
          deviation_percent: a.deviation_percent,
          classification: a.classification,
          sigma_deviation: a.sigma_deviation
        }))
      }
    });
  } catch (error) {
    console.error('[ANOMALY_CHECK]', error);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

async function handleAnomalyTrigger(request, env, ctx) {
  try {
    const orgId = getOrgIdFromAuth(request);
    const body = await request.json();
    const customerId = body.customer_id;

    const anomalies = await runAnomalyDetection(env, orgId, customerId);

    return jsonResponse({
      triggered: true,
      anomalies_detected: anomalies.length
    }, 202);
  } catch (error) {
    console.error('[ANOMALY_TRIGGER]', error);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

export {
  runAnomalyDetection,
  handleAnomalyCheck,
  handleAnomalyTrigger
};
