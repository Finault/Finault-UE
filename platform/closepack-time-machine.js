/**
 * Close Pack — Time Machine Extension
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Extends the standard Close Pack with Time Machine analysis artifacts.
 * Adds 3 new documents to the pack:
 *   10. Time Machine Analysis Summary
 *   11. Alternate Timeline Report
 *   12. Customer Impact Assessment
 *
 * Also extends the hash chain to include Time Machine data blocks,
 * ensuring the retroactive analysis is cryptographically sealed.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import crypto from 'crypto';

// ─── Time Machine Close Pack Generator ──────────────────────────────────────

/**
 * Generate Time Machine documents for inclusion in a Close Pack.
 *
 * @param {Object} timeMachineReport - Output of TimeMachineEngine.analyze()
 * @param {Object} options
 * @param {string} options.company - Company name
 * @param {string} options.period - Analysis period label
 * @param {string} options.previousCloseId - Previous Close Pack ID for chain linkage
 * @returns {Object} Time Machine pack documents + hashes
 */
export function generateTimeMachineClosePack(timeMachineReport, options = {}) {
    const {
        company = 'Unknown Company',
        period = null,
        previousCloseId = null,
        previousChainHash = null,
    } = options;

    const closeId = `CLOSEPACK-TM-${company.replace(/[^A-Z0-9]/gi, '').slice(0, 12)}-${Date.now()}`;
    const generatedAt = new Date().toISOString();

    const periodLabel = period ||
        (timeMachineReport.analysis_period?.start && timeMachineReport.analysis_period?.end
            ? `${timeMachineReport.analysis_period.start} to ${timeMachineReport.analysis_period.end}`
            : 'Unknown period');

    // ── Generate 3 Time Machine documents ─────────────────────────

    const analysisSummary = generateAnalysisSummary(timeMachineReport, company, periodLabel, generatedAt);
    const timelineReport = generateTimelineReport(timeMachineReport, company, periodLabel, generatedAt);
    const customerAssessment = generateCustomerAssessment(timeMachineReport, company, periodLabel, generatedAt);

    // ── Build hash chain ──────────────────────────────────────────

    const chain = [];
    let prevHash = previousChainHash || sha256('FINAULT_TIME_MACHINE_GENESIS');

    // Block 1: Analysis summary
    const block1 = createChainBlock(0, prevHash, analysisSummary, generatedAt);
    chain.push(block1);
    prevHash = block1.hash;

    // Block 2: Timeline report
    const block2 = createChainBlock(1, prevHash, timelineReport, generatedAt);
    chain.push(block2);
    prevHash = block2.hash;

    // Block 3: Customer assessment
    const block3 = createChainBlock(2, prevHash, customerAssessment, generatedAt);
    chain.push(block3);
    prevHash = block3.hash;

    // Block 4: Finault Score seal
    const scoreBlock = createChainBlock(3, prevHash, {
        type: 'finault_score_seal',
        score: timeMachineReport.finault_score,
        sealed_at: generatedAt,
    }, generatedAt);
    chain.push(scoreBlock);

    // ── Create attestation ────────────────────────────────────────

    const attestation = {
        id: `ATTEST-TM-${Date.now()}`,
        close_id: closeId,
        prior_close_id: previousCloseId,
        timestamp: generatedAt,
        analysis_period: periodLabel,
        document_count: 3,
        hash_chain_length: chain.length,
        latest_block_hash: scoreBlock.hash,
        chain_hash: sha256(JSON.stringify(chain)),
        chain_integrity: verifyChain(chain),
        signature: hmacSign(JSON.stringify({ closeId, chain: scoreBlock.hash, timestamp: generatedAt })),
        signature_algorithm: 'HMAC-SHA256',
        status: 'ATTESTED',
    };

    return {
        close_id: closeId,
        prior_close_id: previousCloseId,
        company,
        period: periodLabel,
        generated_at: generatedAt,
        chain_depth: previousCloseId ? 'inherited' : 1,
        documents: {
            analysis_summary: analysisSummary,
            alternate_timeline: timelineReport,
            customer_impact: customerAssessment,
        },
        attestation,
        hash_chain: chain,
        chain_hash: attestation.chain_hash,
        status: 'SEALED',
    };
}


// ─── Document Generators ────────────────────────────────────────────────────

function generateAnalysisSummary(report, company, period, timestamp) {
    return {
        type: 'time_machine_analysis_summary',
        version: '1.0',
        company,
        period,
        generated_at: timestamp,

        headline: {
            actual_spend: report.actual_total,
            optimized_spend: report.optimized_total,
            recoverable_amount: report.recoverable_spend,
            savings_percent: report.savings_percent,
        },

        savings_breakdown: report.savings_by_category || {},

        scope: {
            models_analyzed: report.models_analyzed?.length || 0,
            providers_analyzed: report.providers_analyzed?.length || 0,
            records_processed: report.record_count || 0,
            date_range: report.analysis_period || {},
        },

        finault_score: report.finault_score || {},

        methodology: {
            analyzers: [
                'ModelSubstitutionAnalyzer — Retroactive optimal model selection',
                'PriceMigrationAnalyzer — Timing analysis for model transitions',
                'BatchEligibilityAnalyzer — Batch API discount opportunities',
                'CacheOpportunityAnalyzer — Prompt caching savings estimation',
                'CrossProviderArbitrageAnalyzer — Multi-provider cost comparison',
            ],
            pricing_source: 'Finault Historical Model Pricing Database (model-price-history.json)',
            attribution_method: report.customer_impact?.length > 0 ? 'Customer-level attribution via Stripe' : 'Aggregate analysis only',
        },

        certification: {
            statement: `This Time Machine analysis was generated by Finault's automated analysis engine. ` +
                `All savings calculations use verified historical pricing data. ` +
                `Results are sealed in a cryptographic hash chain for audit integrity.`,
            certified_by: 'Finault Time Machine Engine v1.0',
            certified_at: timestamp,
        },
    };
}


function generateTimelineReport(report, company, period, timestamp) {
    const timeline = report.alternate_timeline || [];

    // Compute monthly aggregates from daily data
    const monthly = {};
    for (const day of timeline) {
        const month = day.date?.slice(0, 7); // YYYY-MM
        if (!month) continue;
        if (!monthly[month]) monthly[month] = { actual: 0, optimized: 0, days: 0 };
        monthly[month].actual += day.actual_spend || 0;
        monthly[month].optimized += day.optimized_spend || 0;
        monthly[month].days++;
    }

    const monthlyData = Object.entries(monthly).sort().map(([month, data]) => ({
        month,
        actual_spend: Math.round(data.actual * 100) / 100,
        optimized_spend: Math.round(data.optimized * 100) / 100,
        savings: Math.round((data.actual - data.optimized) * 100) / 100,
        savings_percent: data.actual > 0
            ? Math.round(((data.actual - data.optimized) / data.actual) * 1000) / 10
            : 0,
        days_analyzed: data.days,
    }));

    // Trend analysis
    let trend = 'stable';
    if (monthlyData.length >= 3) {
        const recentAvg = monthlyData.slice(-3).reduce((s, m) => s + m.actual_spend, 0) / 3;
        const earlyAvg = monthlyData.slice(0, 3).reduce((s, m) => s + m.actual_spend, 0) / 3;
        const growth = earlyAvg > 0 ? (recentAvg - earlyAvg) / earlyAvg : 0;
        if (growth > 0.2) trend = 'accelerating';
        else if (growth > 0.05) trend = 'growing';
        else if (growth < -0.05) trend = 'declining';
    }

    return {
        type: 'alternate_timeline_report',
        version: '1.0',
        company,
        period,
        generated_at: timestamp,

        summary: {
            total_days: timeline.length,
            total_months: monthlyData.length,
            cumulative_actual: timeline.length > 0 ? timeline[timeline.length - 1].cumulative_actual : 0,
            cumulative_optimized: timeline.length > 0 ? timeline[timeline.length - 1].cumulative_optimized : 0,
            cumulative_savings: report.recoverable_spend,
            trend,
        },

        monthly_breakdown: monthlyData,

        // Include daily data (for chart rendering in sealed pack viewer)
        daily_timeline: timeline.map(d => ({
            date: d.date,
            actual: d.actual_spend,
            optimized: d.optimized_spend,
            cum_actual: d.cumulative_actual,
            cum_optimized: d.cumulative_optimized,
        })),

        narrative: `Over the ${timeline.length}-day analysis period, ${company} spent ` +
            `$${formatUSD(report.actual_total)} on AI infrastructure. ` +
            `With optimal model selection, batch processing, and prompt caching, ` +
            `the same workloads could have been served for $${formatUSD(report.optimized_total)} — ` +
            `a savings of $${formatUSD(report.recoverable_spend)} (${report.savings_percent}%). ` +
            `Spending trend: ${trend}.`,
    };
}


function generateCustomerAssessment(report, company, period, timestamp) {
    const customers = report.customer_impact || [];

    const underwater = customers.filter(c => c.is_underwater);
    const wouldBeFixed = customers.filter(c => c.is_underwater && c.optimized_margin_percent >= 0);
    const totalRevenue = customers.reduce((s, c) => s + (c.revenue || 0), 0);
    const totalActualCost = customers.reduce((s, c) => s + (c.actual_cost || 0), 0);
    const totalOptimizedCost = customers.reduce((s, c) => s + (c.optimized_cost || 0), 0);

    const blendedActual = totalRevenue > 0 ? ((totalRevenue - totalActualCost) / totalRevenue) * 100 : 0;
    const blendedOptimized = totalRevenue > 0 ? ((totalRevenue - totalOptimizedCost) / totalRevenue) * 100 : 0;

    return {
        type: 'customer_impact_assessment',
        version: '1.0',
        company,
        period,
        generated_at: timestamp,

        summary: {
            total_customers: customers.length,
            customers_underwater: underwater.length,
            customers_fixable: wouldBeFixed.length,
            total_revenue: Math.round(totalRevenue * 100) / 100,
            total_cost_actual: Math.round(totalActualCost * 100) / 100,
            total_cost_optimized: Math.round(totalOptimizedCost * 100) / 100,
            blended_margin_actual: Math.round(blendedActual * 10) / 10,
            blended_margin_optimized: Math.round(blendedOptimized * 10) / 10,
            margin_improvement: Math.round((blendedOptimized - blendedActual) * 10) / 10,
        },

        customers: customers.map(c => ({
            name: c.name,
            revenue: c.revenue,
            actual_cost: c.actual_cost,
            optimized_cost: c.optimized_cost,
            actual_margin: c.actual_margin_percent,
            optimized_margin: c.optimized_margin_percent,
            improvement: c.margin_improvement,
            is_underwater: c.is_underwater,
            risk_level: c.actual_margin_percent < -20 ? 'critical'
                : c.actual_margin_percent < 0 ? 'high'
                : c.actual_margin_percent < 30 ? 'medium' : 'low',
        })),

        narrative: customers.length > 0
            ? `Of ${customers.length} customers analyzed, ${underwater.length} are currently underwater ` +
              `(AI costs exceed revenue). With optimized AI spend, ${wouldBeFixed.length} of these could become ` +
              `profitable. Blended gross margin would improve from ${blendedActual.toFixed(1)}% to ` +
              `${blendedOptimized.toFixed(1)}%, a ${(blendedOptimized - blendedActual).toFixed(1)} percentage point improvement.`
            : 'No customer revenue data available. Connect Stripe to unlock per-customer margin analysis.',

        recommendations: generateCustomerRecommendations(customers),
    };
}


function generateCustomerRecommendations(customers) {
    const recs = [];

    const critical = customers.filter(c => c.actual_margin_percent < -20);
    if (critical.length > 0) {
        recs.push({
            priority: 'CRITICAL',
            action: 'Immediate margin review required',
            detail: `${critical.length} customer(s) have margins worse than -20%: ${critical.map(c => c.name).join(', ')}. ` +
                `Consider model downgrades, usage caps, or pricing adjustments.`,
        });
    }

    const fixable = customers.filter(c => c.is_underwater && c.optimized_margin_percent >= 0);
    if (fixable.length > 0) {
        recs.push({
            priority: 'HIGH',
            action: 'Quick wins: customers recoverable with optimization',
            detail: `${fixable.length} underwater customer(s) would become profitable with model optimization alone: ` +
                `${fixable.map(c => c.name).join(', ')}.`,
        });
    }

    const lowMargin = customers.filter(c => c.actual_margin_percent >= 0 && c.actual_margin_percent < 30);
    if (lowMargin.length > 0) {
        recs.push({
            priority: 'MEDIUM',
            action: 'Optimize low-margin customers',
            detail: `${lowMargin.length} customer(s) have margins below 30% and could benefit from targeted optimization.`,
        });
    }

    return recs;
}


// ─── Hash Chain Utilities ───────────────────────────────────────────────────

function sha256(data) {
    return crypto.createHash('sha256').update(typeof data === 'string' ? data : JSON.stringify(data)).digest('hex');
}

function hmacSign(data) {
    // In production, use proper key management. For now, deterministic key.
    const key = 'finault-time-machine-seal-key-v1';
    return crypto.createHmac('sha256', key).update(data).digest('hex');
}

function createChainBlock(index, previousHash, data, timestamp) {
    const blockData = JSON.stringify({ index, previousHash, data, timestamp });
    const hash = sha256(blockData);
    return { index, hash, previousHash, data_hash: sha256(JSON.stringify(data)), timestamp };
}

function verifyChain(chain) {
    for (let i = 1; i < chain.length; i++) {
        if (chain[i].previousHash !== chain[i - 1].hash) return false;
    }
    return true;
}


// ─── Formatting ─────────────────────────────────────────────────────────────

function formatUSD(amount) {
    if (amount >= 1000000) return (amount / 1000000).toFixed(1) + 'M';
    if (amount >= 1000) return (amount / 1000).toFixed(1) + 'K';
    return amount.toFixed(2);
}


// ─── Exports ────────────────────────────────────────────────────────────────

export default {
    generateTimeMachineClosePack,
};

export {
    generateTimeMachineClosePack,
    verifyChain,
    sha256,
};
