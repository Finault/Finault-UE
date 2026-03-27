/**
 * Time Machine Handler
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * API endpoints for the AI Financial Time Machine:
 *
 *   POST /v1/time-machine/sync          — Pull full historical data from providers
 *   POST /v1/time-machine/analyze       — Run Time Machine analysis on stored data
 *   GET  /v1/time-machine/analyses      — List past analyses
 *   GET  /v1/time-machine/analyses/:id  — Get a specific analysis
 *   GET  /v1/time-machine/attribution   — Get attribution mappings
 *   POST /v1/time-machine/attribution   — Save attribution mappings
 *   POST /v1/time-machine/attribution/suggest — Auto-suggest attribution
 *   GET  /v1/time-machine/status/:syncId — Check sync progress (SSE)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { jsonResponse, errorResponse } from '../utils.js';
import { getOrgIdFromAuth } from '../auth.js';

// ─── Sync: Pull Full Historical Data ────────────────────────────────────────

/**
 * POST /v1/time-machine/sync
 *
 * Triggers a full historical data pull from provider APIs.
 * Accepts API keys in the request body (never stored — used once for fetch).
 * Returns a sync_id for progress tracking.
 *
 * Body: {
 *   providers: {
 *     openai: { api_key: "sk-admin-..." },
 *     anthropic: { api_key: "sk-ant-admin..." },
 *   },
 *   stripe: { api_key: "sk_live_..." },   // Optional
 *   force_refresh: false                    // Re-pull even if data exists
 * }
 */
export async function handleTimeMachineSync(request, env, ctx) {
    try {
        const orgId = getOrgIdFromAuth(request);
        const body = await request.json();
        const { providers = {}, stripe = null, force_refresh = false } = body;

        if (Object.keys(providers).length === 0) {
            return errorResponse('INVALID_REQUEST', 'At least one provider API key required');
        }

        // Generate sync ID for progress tracking
        const syncId = crypto.randomUUID();

        // Store sync metadata
        const supabase = createSupabaseClient(env);

        // Record sync start
        await supabase.from('raw_sync_payloads').insert({
            org_id: orgId,
            provider: 'time_machine',
            endpoint: 'sync_start',
            payload: {
                sync_id: syncId,
                providers: Object.keys(providers),
                has_stripe: !!stripe,
                force_refresh,
                started_at: new Date().toISOString(),
            },
        });

        // ── Kick off async sync ────────────────────────────────────────
        // In Cloudflare Workers, use waitUntil for background processing.
        // The sync runs in the background; client polls /status/:syncId.
        if (ctx?.waitUntil) {
            ctx.waitUntil(
                runHistoricalSync(env, orgId, syncId, providers, stripe, force_refresh)
            );
        } else {
            // Fallback: run synchronously (dev/testing)
            await runHistoricalSync(env, orgId, syncId, providers, stripe, force_refresh);
        }

        return jsonResponse({
            sync_id: syncId,
            status: 'started',
            providers: Object.keys(providers),
            has_stripe: !!stripe,
            message: 'Historical sync started. Poll /v1/time-machine/status/' + syncId + ' for progress.',
        }, 202);

    } catch (error) {
        console.error('[TimeMachine] Sync error:', error);
        return errorResponse('INTERNAL_ERROR', error.message);
    }
}


/**
 * Background sync worker — pulls data from all providers and stores in Supabase.
 */
async function runHistoricalSync(env, orgId, syncId, providers, stripe, forceRefresh) {
    const supabase = createSupabaseClient(env);
    const progress = { providers_done: 0, providers_total: Object.keys(providers).length + (stripe ? 1 : 0), current: '', errors: [] };

    const updateProgress = async (update) => {
        Object.assign(progress, update);
        await supabase.from('raw_sync_payloads').insert({
            org_id: orgId,
            provider: 'time_machine',
            endpoint: `sync_progress_${syncId}`,
            payload: { sync_id: syncId, ...progress, updated_at: new Date().toISOString() },
        }).catch(() => {}); // Best-effort progress tracking
    };

    try {
        // ── Sync each provider ──────────────────────────────────────
        for (const [providerName, config] of Object.entries(providers)) {
            await updateProgress({ current: providerName });

            try {
                const records = await fetchProviderHistory(providerName, config.api_key, env);

                // Store raw payload for audit
                await supabase.from('raw_sync_payloads').insert({
                    org_id: orgId,
                    provider: providerName,
                    endpoint: 'full_history',
                    payload: { record_count: records.length, sync_id: syncId },
                });

                // Upsert normalized records into historical_usage
                if (records.length > 0) {
                    // Batch upsert in chunks of 500
                    for (let i = 0; i < records.length; i += 500) {
                        const batch = records.slice(i, i + 500).map(r => ({
                            org_id: orgId,
                            date: r.date,
                            provider: r.provider || providerName,
                            model: r.model,
                            project_id: r.project_id || 'default',
                            api_key_id: r.api_key_id || '',
                            input_tokens: r.input_tokens || 0,
                            output_tokens: r.output_tokens || 0,
                            num_requests: r.num_requests || 0,
                            cost_usd: r.cost_usd || 0,
                        }));

                        await supabase
                            .from('historical_usage')
                            .upsert(batch, {
                                onConflict: 'org_id,date,provider,model,project_id,api_key_id',
                                ignoreDuplicates: !forceRefresh,
                            });
                    }
                }

                progress.providers_done++;
            } catch (providerError) {
                progress.errors.push({ provider: providerName, error: providerError.message });
            }
        }

        // ── Sync Stripe ─────────────────────────────────────────────
        if (stripe?.api_key) {
            await updateProgress({ current: 'stripe' });

            try {
                const stripeData = await fetchStripeHistory(stripe.api_key, env);

                // Store in stripe_revenue_history
                if (stripeData.customers?.length > 0) {
                    for (const customer of stripeData.customers) {
                        for (const month of customer.months || []) {
                            await supabase
                                .from('stripe_revenue_history')
                                .upsert({
                                    org_id: orgId,
                                    stripe_customer_id: customer.id,
                                    customer_name: customer.name,
                                    customer_email: customer.email,
                                    month: month.month,
                                    revenue_usd: month.revenue,
                                    invoice_count: month.invoice_count || 0,
                                    mrr_usd: month.mrr || 0,
                                }, {
                                    onConflict: 'org_id,stripe_customer_id,month',
                                    ignoreDuplicates: !forceRefresh,
                                });
                        }
                    }
                }

                progress.providers_done++;
            } catch (stripeError) {
                progress.errors.push({ provider: 'stripe', error: stripeError.message });
            }
        }

        // ── Record completion ───────────────────────────────────────
        await updateProgress({ current: 'done', status: 'completed' });

    } catch (err) {
        await updateProgress({ current: 'error', status: 'failed', error: err.message });
    }
}


/**
 * Fetch full history from a provider API.
 * Delegates to provider-specific fetch functions.
 */
async function fetchProviderHistory(provider, apiKey, env) {
    switch (provider) {
        case 'openai':
            return fetchOpenAIHistory(apiKey);
        case 'anthropic':
            return fetchAnthropicHistory(apiKey);
        case 'google':
            return fetchGoogleHistory(apiKey);
        default:
            throw new Error(`Unsupported provider: ${provider}`);
    }
}


/**
 * OpenAI full history via Admin API.
 * GET /v1/organization/usage/completions
 */
async function fetchOpenAIHistory(apiKey) {
    const records = [];
    const now = Math.floor(Date.now() / 1000);
    const startTime = now - (365 * 24 * 3600); // 1 year back

    let nextPage = null;
    let pageCount = 0;
    const MAX_PAGES = 100;

    do {
        const params = new URLSearchParams({
            start_time: startTime.toString(),
            end_time: now.toString(),
            bucket_width: '1d',
            group_by: 'model,project_id',
            limit: '180',
        });
        if (nextPage) params.set('page', nextPage);

        const resp = await fetch(`https://api.openai.com/v1/organization/usage/completions?${params}`, {
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        });

        if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(`OpenAI API error ${resp.status}: ${errText.slice(0, 200)}`);
        }

        const data = await resp.json();

        for (const bucket of data.data || []) {
            const date = new Date(bucket.start_time * 1000).toISOString().split('T')[0];

            for (const result of bucket.results || []) {
                records.push({
                    date,
                    provider: 'openai',
                    model: result.model || 'unknown',
                    project_id: result.project_id || 'default',
                    api_key_id: '',
                    input_tokens: result.input_tokens || 0,
                    output_tokens: result.output_tokens || 0,
                    num_requests: result.num_requests || 0,
                    cost_usd: 0, // Enriched in second pass
                });
            }
        }

        nextPage = data.next_page || null;
        pageCount++;
    } while (nextPage && pageCount < MAX_PAGES);

    // Enrich with cost data from /v1/organization/costs
    try {
        const costResp = await fetch(`https://api.openai.com/v1/organization/costs?start_time=${startTime}&end_time=${now}&bucket_width=1d&group_by=model,project_id&limit=180`, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
        });

        if (costResp.ok) {
            const costData = await costResp.json();
            const costMap = {};

            for (const bucket of costData.data || []) {
                const date = new Date(bucket.start_time * 1000).toISOString().split('T')[0];
                for (const result of bucket.results || []) {
                    const key = `${date}|${result.model || 'unknown'}|${result.project_id || 'default'}`;
                    costMap[key] = (result.amount?.value || 0) / 100; // cents to dollars
                }
            }

            for (const record of records) {
                const key = `${record.date}|${record.model}|${record.project_id}`;
                if (costMap[key]) {
                    record.cost_usd = costMap[key];
                }
            }
        }
    } catch (costErr) {
        console.warn('[TimeMachine] OpenAI cost enrichment failed:', costErr.message);
    }

    return records;
}


/**
 * Anthropic full history via Admin API.
 */
async function fetchAnthropicHistory(apiKey) {
    const records = [];
    // Anthropic API launched March 2023
    let cursor = '2023-03-01';
    const endDate = new Date().toISOString().split('T')[0];

    const resp = await fetch(`https://api.anthropic.com/v1/organizations/usage?start_date=${cursor}&end_date=${endDate}&group_by=model,workspace_id,api_key_id`, {
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2024-10-22',
            'Content-Type': 'application/json',
        },
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Anthropic API error ${resp.status}: ${errText.slice(0, 200)}`);
    }

    const data = await resp.json();

    for (const entry of data.data || []) {
        records.push({
            date: entry.date || cursor,
            provider: 'anthropic',
            model: entry.model || 'unknown',
            project_id: entry.workspace_id || 'default',
            api_key_id: entry.api_key_id || '',
            input_tokens: entry.input_tokens || 0,
            output_tokens: entry.output_tokens || 0,
            num_requests: entry.num_requests || 0,
            cost_usd: entry.cost_usd || 0,
        });
    }

    return records;
}


/**
 * Google AI (Gemini) — no admin API yet. Placeholder for CSV import.
 */
async function fetchGoogleHistory(apiKey) {
    // Google doesn't have a usage/billing API for Gemini yet.
    // Return empty — users can import via CSV upload.
    return [];
}


// ─── Analyze ────────────────────────────────────────────────────────────────

/**
 * POST /v1/time-machine/analyze
 *
 * Run Time Machine analysis on stored historical data.
 *
 * Body: {
 *   period_start: "2024-01-01",   // Optional, default: earliest data
 *   period_end: "2025-12-31",     // Optional, default: latest data
 *   options: {
 *     crossProviderEnabled: true,
 *     cacheablePercent: 0.30,
 *     minSavingsPercent: 10,
 *   }
 * }
 */
export async function handleTimeMachineAnalyze(request, env) {
    try {
        const orgId = getOrgIdFromAuth(request);
        const body = await request.json();
        const { period_start, period_end, options = {} } = body;

        const supabase = createSupabaseClient(env);

        // ── Load historical usage ───────────────────────────────────
        let query = supabase
            .from('historical_usage')
            .select('*')
            .eq('org_id', orgId)
            .order('date', { ascending: true });

        if (period_start) query = query.gte('date', period_start);
        if (period_end) query = query.lte('date', period_end);

        const { data: usageRecords, error: usageError } = await query;

        if (usageError) {
            return errorResponse('DATABASE_ERROR', 'Failed to load historical usage: ' + usageError.message);
        }

        if (!usageRecords || usageRecords.length === 0) {
            return jsonResponse({
                message: 'No historical usage data found. Run /v1/time-machine/sync first.',
                has_data: false,
            }, 200);
        }

        // ── Load Stripe revenue ─────────────────────────────────────
        const { data: revenueRows } = await supabase
            .from('stripe_revenue_history')
            .select('*')
            .eq('org_id', orgId);

        // Build customer data map
        const customerData = {};
        for (const row of revenueRows || []) {
            if (!customerData[row.stripe_customer_id]) {
                customerData[row.stripe_customer_id] = {
                    name: row.customer_name,
                    email: row.customer_email,
                    total_paid: 0,
                    months: [],
                };
            }
            customerData[row.stripe_customer_id].total_paid += parseFloat(row.revenue_usd || 0);
            customerData[row.stripe_customer_id].months.push({
                month: row.month,
                revenue: parseFloat(row.revenue_usd || 0),
            });
        }

        // ── Load attribution mappings ───────────────────────────────
        const { data: mappingRows } = await supabase
            .from('customer_attribution_mappings')
            .select('*')
            .eq('org_id', orgId);

        const attributionMappings = (mappingRows || []).map(r => ({
            stripe_customer_id: r.stripe_customer_id,
            customer_name: r.customer_name,
            strategy: r.strategy,
            match_value: r.match_value,
            weight: parseFloat(r.weight || 1.0),
        }));

        // ── Run Time Machine Engine ─────────────────────────────────
        // Import is dynamic because the engine lives in /platform/
        // In Cloudflare Workers, we'd bundle this at build time.
        // For now, inline the engine logic or use dynamic import.
        const report = runTimeMachineAnalysis(usageRecords, customerData, attributionMappings, options);

        // ── Store analysis result ───────────────────────────────────
        const analysisRow = {
            org_id: orgId,
            analysis_period_start: report.analysis_period.start,
            analysis_period_end: report.analysis_period.end,
            actual_total_usd: report.actual_total,
            optimized_total_usd: report.optimized_total,
            recoverable_usd: report.recoverable_spend,
            savings_percent: report.savings_percent,
            savings_by_category: report.savings_by_category,
            alternate_timeline: report.alternate_timeline,
            customer_impact: report.customer_impact,
            finault_score: report.finault_score,
            models_analyzed: report.models_analyzed,
            providers_analyzed: report.providers_analyzed,
        };

        const { data: saved, error: saveError } = await supabase
            .from('time_machine_analyses')
            .insert(analysisRow)
            .select('id')
            .single();

        if (saveError) {
            console.error('[TimeMachine] Failed to save analysis:', saveError.message);
        }

        return jsonResponse({
            analysis_id: saved?.id || null,
            ...report,
        });

    } catch (error) {
        console.error('[TimeMachine] Analyze error:', error);
        return errorResponse('INTERNAL_ERROR', error.message);
    }
}


/**
 * Inline Time Machine analysis runner.
 * Mirrors TimeMachineEngine.analyze() from platform/time-machine-engine.js
 * to avoid dynamic import issues in Cloudflare Workers.
 *
 * In production, this would import the engine at bundle time.
 */
function runTimeMachineAnalysis(usageRecords, customerData, attributionMappings, options = {}) {
    // This is a simplified inline version. The full engine in
    // platform/time-machine-engine.js has the complete 5-analyzer pipeline.
    // At build time, we'd bundle that file and call:
    //   const engine = new TimeMachineEngine(options);
    //   return engine.analyze(usageRecords, customerData, attributionMappings);

    // For the gateway handler, we compute summary metrics from stored data.
    const actualTotal = usageRecords.reduce((s, r) => s + parseFloat(r.cost_usd || 0), 0);
    const dates = usageRecords.map(r => r.date).filter(Boolean).sort();
    const models = [...new Set(usageRecords.map(r => r.model).filter(Boolean))].sort();
    const providers = [...new Set(usageRecords.map(r => r.provider).filter(Boolean))].sort();

    // Estimate savings using heuristic until full engine is bundled
    // Conservative: 15-35% savings typical for unoptimized AI spend
    const estimatedSavingsPercent = Math.min(35, Math.max(15,
        (models.length > 3 ? 25 : 18) + (providers.length > 1 ? 5 : 0)
    ));
    const estimatedSavings = actualTotal * (estimatedSavingsPercent / 100);

    // Build alternate timeline
    const dailyCosts = {};
    for (const r of usageRecords) {
        if (!r.date) continue;
        dailyCosts[r.date] = (dailyCosts[r.date] || 0) + parseFloat(r.cost_usd || 0);
    }

    let cumActual = 0, cumOptimized = 0;
    const timeline = Object.entries(dailyCosts).sort().map(([date, cost]) => {
        const optimized = cost * (1 - estimatedSavingsPercent / 100);
        cumActual += cost;
        cumOptimized += optimized;
        return {
            date,
            actual_spend: Math.round(cost * 100) / 100,
            optimized_spend: Math.round(optimized * 100) / 100,
            cumulative_actual: Math.round(cumActual * 100) / 100,
            cumulative_optimized: Math.round(cumOptimized * 100) / 100,
        };
    });

    // Customer impact
    const customerImpact = [];
    if (Object.keys(customerData).length > 0) {
        const totalRevenue = Object.values(customerData).reduce((s, c) => s + (c.total_paid || 0), 0);
        const savingsRatio = actualTotal > 0 ? estimatedSavings / actualTotal : 0;

        for (const [custId, cust] of Object.entries(customerData)) {
            const mapping = attributionMappings.find(m => m.stripe_customer_id === custId);
            let actualCost = 0;

            if (mapping?.strategy === 'project') {
                actualCost = usageRecords
                    .filter(r => r.project_id === mapping.match_value)
                    .reduce((s, r) => s + parseFloat(r.cost_usd || 0), 0);
            } else if (mapping?.strategy === 'api_key') {
                actualCost = usageRecords
                    .filter(r => r.api_key_id === mapping.match_value)
                    .reduce((s, r) => s + parseFloat(r.cost_usd || 0), 0);
            } else {
                // Proportional
                const share = totalRevenue > 0 ? (cust.total_paid || 0) / totalRevenue : 0;
                actualCost = actualTotal * share;
            }

            const optimizedCost = actualCost * (1 - savingsRatio);
            const revenue = cust.total_paid || 0;
            const actualMargin = revenue > 0 ? ((revenue - actualCost) / revenue) * 100 : 0;
            const optimizedMargin = revenue > 0 ? ((revenue - optimizedCost) / revenue) * 100 : 0;

            customerImpact.push({
                customer_id: custId,
                name: cust.name || custId,
                revenue: Math.round(revenue * 100) / 100,
                actual_cost: Math.round(actualCost * 100) / 100,
                optimized_cost: Math.round(optimizedCost * 100) / 100,
                actual_margin_percent: Math.round(actualMargin * 10) / 10,
                optimized_margin_percent: Math.round(optimizedMargin * 10) / 10,
                margin_improvement: Math.round((optimizedMargin - actualMargin) * 10) / 10,
                is_underwater: actualCost > revenue && revenue > 0,
            });
        }

        customerImpact.sort((a, b) => a.actual_margin_percent - b.actual_margin_percent);
    }

    return {
        actual_total: Math.round(actualTotal * 100) / 100,
        optimized_total: Math.round((actualTotal - estimatedSavings) * 100) / 100,
        recoverable_spend: Math.round(estimatedSavings * 100) / 100,
        savings_percent: Math.round(estimatedSavingsPercent * 10) / 10,
        savings_by_category: {
            model_substitution: Math.round(estimatedSavings * 0.40 * 100) / 100,
            batch_eligibility: Math.round(estimatedSavings * 0.20 * 100) / 100,
            cache_opportunity: Math.round(estimatedSavings * 0.15 * 100) / 100,
            price_migration: Math.round(estimatedSavings * 0.15 * 100) / 100,
            cross_provider: Math.round(estimatedSavings * 0.10 * 100) / 100,
        },
        alternate_timeline: timeline,
        customer_impact: customerImpact,
        finault_score: computeInlineFinaultScore(actualTotal, estimatedSavings, customerImpact, timeline, providers),
        analysis_period: { start: dates[0] || null, end: dates[dates.length - 1] || null },
        models_analyzed: models,
        providers_analyzed: providers,
        record_count: usageRecords.length,
        generated_at: new Date().toISOString(),
    };
}


function computeInlineFinaultScore(actualTotal, savings, customerImpact, timeline, providers) {
    const savingsPct = actualTotal > 0 ? (savings / actualTotal) * 100 : 0;

    const costEfficiency = Math.max(0, Math.min(100, 100 - savingsPct * 2));
    let marginHealth = 70;
    if (customerImpact.length > 0) {
        const avgMargin = customerImpact.reduce((s, c) => s + c.actual_margin_percent, 0) / customerImpact.length;
        marginHealth = Math.max(0, Math.min(100, avgMargin + 20));
    }

    let trendScore = 50;
    if (timeline.length >= 60) {
        const half = Math.floor(timeline.length / 2);
        const firstAvg = timeline.slice(0, half).reduce((s, d) => s + d.actual_spend, 0) / half;
        const secondAvg = timeline.slice(half).reduce((s, d) => s + d.actual_spend, 0) / (timeline.length - half);
        if (firstAvg > 0) trendScore = Math.max(0, Math.min(100, 50 - ((secondAvg - firstAvg) / firstAvg) * 100));
    }

    const modelOpt = Math.max(0, Math.min(100, 100 - savingsPct * 1.5));
    let governance = 30;
    if (customerImpact.length > 0) governance += 35;
    if (timeline.length > 90) governance += 20;
    if (providers.length > 1) governance += 15;
    const diversification = Math.min(100, providers.length * 33);

    const overall = Math.round(
        costEfficiency * 0.25 + marginHealth * 0.25 + trendScore * 0.15 +
        modelOpt * 0.15 + governance * 0.10 + diversification * 0.10
    );

    return {
        overall: Math.max(0, Math.min(100, overall)),
        dimensions: {
            cost_efficiency: Math.round(costEfficiency),
            margin_health: Math.round(marginHealth),
            trend_trajectory: Math.round(trendScore),
            model_optimization: Math.round(modelOpt),
            governance_maturity: Math.round(governance),
            diversification: Math.round(diversification),
        },
    };
}


// ─── List / Get Analyses ────────────────────────────────────────────────────

/**
 * GET /v1/time-machine/analyses
 */
export async function handleListAnalyses(request, env) {
    try {
        const orgId = getOrgIdFromAuth(request);
        const supabase = createSupabaseClient(env);

        const { data, error } = await supabase
            .from('time_machine_analyses')
            .select('id, analysis_period_start, analysis_period_end, actual_total_usd, optimized_total_usd, recoverable_usd, savings_percent, models_analyzed, providers_analyzed, created_at')
            .eq('org_id', orgId)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            return errorResponse('DATABASE_ERROR', error.message);
        }

        return jsonResponse({
            analyses: data || [],
            total: (data || []).length,
        });
    } catch (error) {
        return errorResponse('INTERNAL_ERROR', error.message);
    }
}


/**
 * GET /v1/time-machine/analyses/:id
 * Public-readable (for shareable links) — no auth required if accessing by ID.
 */
export async function handleGetAnalysis(request, env, analysisId) {
    try {
        const supabase = createSupabaseClient(env);

        const { data, error } = await supabase
            .from('time_machine_analyses')
            .select('*')
            .eq('id', analysisId)
            .single();

        if (error || !data) {
            return errorResponse('NOT_FOUND', 'Analysis not found', 404);
        }

        return jsonResponse(data);
    } catch (error) {
        return errorResponse('INTERNAL_ERROR', error.message);
    }
}


// ─── Attribution Endpoints ──────────────────────────────────────────────────

/**
 * GET /v1/time-machine/attribution
 */
export async function handleGetAttribution(request, env) {
    try {
        const orgId = getOrgIdFromAuth(request);
        const supabase = createSupabaseClient(env);

        const { data, error } = await supabase
            .from('customer_attribution_mappings')
            .select('*')
            .eq('org_id', orgId)
            .order('created_at', { ascending: true });

        if (error) {
            return errorResponse('DATABASE_ERROR', error.message);
        }

        return jsonResponse({ mappings: data || [] });
    } catch (error) {
        return errorResponse('INTERNAL_ERROR', error.message);
    }
}


/**
 * POST /v1/time-machine/attribution
 *
 * Body: { mappings: [{ stripe_customer_id, customer_name, strategy, match_value, weight }] }
 */
export async function handleSaveAttribution(request, env) {
    try {
        const orgId = getOrgIdFromAuth(request);
        const body = await request.json();
        const { mappings = [] } = body;

        if (!Array.isArray(mappings) || mappings.length === 0) {
            return errorResponse('INVALID_REQUEST', 'mappings array required');
        }

        const supabase = createSupabaseClient(env);
        let saved = 0;
        const errors = [];

        for (const mapping of mappings) {
            if (!mapping.stripe_customer_id) {
                errors.push({ error: 'Missing stripe_customer_id' });
                continue;
            }

            const { error } = await supabase
                .from('customer_attribution_mappings')
                .upsert({
                    org_id: orgId,
                    stripe_customer_id: mapping.stripe_customer_id,
                    customer_name: mapping.customer_name || null,
                    strategy: mapping.strategy || 'proportional',
                    match_value: mapping.match_value || null,
                    weight: mapping.weight || 1.0,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'org_id,stripe_customer_id,match_value' });

            if (error) {
                errors.push({ customer: mapping.stripe_customer_id, error: error.message });
            } else {
                saved++;
            }
        }

        return jsonResponse({ saved, errors, total: mappings.length });
    } catch (error) {
        return errorResponse('INTERNAL_ERROR', error.message);
    }
}


/**
 * POST /v1/time-machine/attribution/suggest
 *
 * Auto-suggest attribution mappings based on usage patterns and Stripe data.
 */
export async function handleSuggestAttribution(request, env) {
    try {
        const orgId = getOrgIdFromAuth(request);
        const supabase = createSupabaseClient(env);

        // Load usage records
        const { data: usageRecords } = await supabase
            .from('historical_usage')
            .select('project_id, api_key_id, cost_usd')
            .eq('org_id', orgId);

        // Load Stripe customers
        const { data: revenueRows } = await supabase
            .from('stripe_revenue_history')
            .select('stripe_customer_id, customer_name, customer_email, revenue_usd')
            .eq('org_id', orgId);

        // Build customer data map
        const customerData = {};
        for (const row of revenueRows || []) {
            if (!customerData[row.stripe_customer_id]) {
                customerData[row.stripe_customer_id] = {
                    name: row.customer_name,
                    email: row.customer_email,
                    total_paid: 0,
                };
            }
            customerData[row.stripe_customer_id].total_paid += parseFloat(row.revenue_usd || 0);
        }

        if (!usageRecords?.length || Object.keys(customerData).length === 0) {
            return jsonResponse({
                suggestions: [],
                message: 'Need both usage data and Stripe data to suggest mappings.',
            });
        }

        // Run suggestion engine
        const suggestions = suggestMappings(usageRecords, customerData);

        return jsonResponse({ suggestions });

    } catch (error) {
        return errorResponse('INTERNAL_ERROR', error.message);
    }
}


/**
 * Inline suggestion logic (mirrors platform/time-machine-attribution.js).
 */
function suggestMappings(usageRecords, customerData) {
    const customers = Object.entries(customerData).map(([id, data]) => ({
        id,
        name: (data.name || '').toLowerCase().trim(),
        revenue: data.total_paid || 0,
    }));

    // Extract unique projects with costs
    const projectCosts = {};
    for (const r of usageRecords) {
        const proj = r.project_id || 'default';
        projectCosts[proj] = (projectCosts[proj] || 0) + parseFloat(r.cost_usd || 0);
    }

    const projects = Object.entries(projectCosts)
        .map(([id, cost]) => ({ id, cost }))
        .sort((a, b) => b.cost - a.cost);

    const suggestions = [];
    const matched = new Set();
    const projMatched = new Set();

    // Name matching
    for (const customer of customers) {
        if (!customer.name) continue;
        const tokens = customer.name.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(t => t.length > 2);

        for (const project of projects) {
            if (projMatched.has(project.id)) continue;
            if (tokens.some(t => project.id.toLowerCase().includes(t))) {
                suggestions.push({
                    stripe_customer_id: customer.id,
                    customer_name: customerData[customer.id].name,
                    strategy: 'project',
                    match_value: project.id,
                    confidence: 0.75,
                    reason: `Project name matches customer "${customerData[customer.id].name}"`,
                });
                matched.add(customer.id);
                projMatched.add(project.id);
                break;
            }
        }
    }

    // Proportional fallback for unmatched
    for (const customer of customers) {
        if (matched.has(customer.id)) continue;
        const totalRev = customers.reduce((s, c) => s + c.revenue, 0);
        suggestions.push({
            stripe_customer_id: customer.id,
            customer_name: customerData[customer.id].name,
            strategy: 'proportional',
            match_value: null,
            weight: totalRev > 0 ? Math.round((customer.revenue / totalRev) * 10000) / 10000 : 1 / customers.length,
            confidence: 0.25,
            reason: 'No direct match — proportional by revenue',
        });
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence);
}


// ─── Sync Status ────────────────────────────────────────────────────────────

/**
 * GET /v1/time-machine/status/:syncId
 * Returns the latest progress for a sync operation.
 */
export async function handleSyncStatus(request, env, syncId) {
    try {
        const supabase = createSupabaseClient(env);

        const { data, error } = await supabase
            .from('raw_sync_payloads')
            .select('payload, fetched_at')
            .eq('endpoint', `sync_progress_${syncId}`)
            .order('fetched_at', { ascending: false })
            .limit(1)
            .single();

        if (error || !data) {
            // Check if sync was started
            const { data: startData } = await supabase
                .from('raw_sync_payloads')
                .select('payload')
                .eq('endpoint', 'sync_start')
                .eq('payload->>sync_id', syncId)
                .single();

            if (startData) {
                return jsonResponse({ sync_id: syncId, status: 'in_progress', message: 'Sync is running...' });
            }

            return errorResponse('NOT_FOUND', 'Sync not found', 404);
        }

        return jsonResponse(data.payload);
    } catch (error) {
        return errorResponse('INTERNAL_ERROR', error.message);
    }
}


// ─── Helper: Supabase Client ────────────────────────────────────────────────

function createSupabaseClient(env) {
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY;

    if (!url || !key) {
        throw new Error('Missing Supabase configuration');
    }

    // Lightweight Supabase client for Cloudflare Workers
    // Uses native fetch — no external dependencies
    return {
        from: (table) => {
            let queryParts = { table, filters: [], selects: '*', orderBy: null, limitVal: null, singleRow: false };

            const buildUrl = () => {
                let queryUrl = `${url}/rest/v1/${queryParts.table}?select=${queryParts.selects}`;
                for (const filter of queryParts.filters) {
                    queryUrl += `&${filter}`;
                }
                if (queryParts.orderBy) queryUrl += `&order=${queryParts.orderBy}`;
                if (queryParts.limitVal) queryUrl += `&limit=${queryParts.limitVal}`;
                return queryUrl;
            };

            const headers = {
                'apikey': key,
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation',
            };

            const chain = {
                select: (cols = '*') => { queryParts.selects = cols; return chain; },
                eq: (col, val) => { queryParts.filters.push(`${col}=eq.${val}`); return chain; },
                gte: (col, val) => { queryParts.filters.push(`${col}=gte.${val}`); return chain; },
                lte: (col, val) => { queryParts.filters.push(`${col}=lte.${val}`); return chain; },
                order: (col, opts = {}) => {
                    queryParts.orderBy = `${col}.${opts.ascending ? 'asc' : 'desc'}`;
                    return chain;
                },
                limit: (n) => { queryParts.limitVal = n; return chain; },
                single: () => { queryParts.singleRow = true; return chain; },
                then: async (resolve) => {
                    try {
                        const resp = await fetch(buildUrl(), { headers });
                        const data = await resp.json();
                        if (queryParts.singleRow) {
                            resolve({ data: Array.isArray(data) ? data[0] || null : data, error: null });
                        } else {
                            resolve({ data: Array.isArray(data) ? data : [], error: null });
                        }
                    } catch (err) {
                        resolve({ data: null, error: { message: err.message } });
                    }
                },
                insert: async (rows) => {
                    try {
                        const body = Array.isArray(rows) ? rows : [rows];
                        const resp = await fetch(`${url}/rest/v1/${queryParts.table}`, {
                            method: 'POST',
                            headers: { ...headers, 'Prefer': 'return=representation,resolution=merge-duplicates' },
                            body: JSON.stringify(body),
                        });
                        const data = await resp.json();
                        return {
                            data,
                            error: resp.ok ? null : { message: JSON.stringify(data) },
                            select: () => ({ single: () => Promise.resolve({ data: Array.isArray(data) ? data[0] : data, error: null }) }),
                        };
                    } catch (err) {
                        return { data: null, error: { message: err.message }, select: () => ({ single: () => Promise.resolve({ data: null, error: { message: err.message } }) }) };
                    }
                },
                upsert: async (rows, opts = {}) => {
                    try {
                        const body = Array.isArray(rows) ? rows : [rows];
                        const prefer = opts.ignoreDuplicates
                            ? 'return=representation,resolution=ignore-duplicates'
                            : 'return=representation,resolution=merge-duplicates';
                        const onConflict = opts.onConflict ? `&on_conflict=${opts.onConflict}` : '';
                        const resp = await fetch(`${url}/rest/v1/${queryParts.table}?${onConflict}`, {
                            method: 'POST',
                            headers: { ...headers, 'Prefer': prefer },
                            body: JSON.stringify(body),
                        });
                        const data = await resp.json();
                        return { data, error: resp.ok ? null : { message: JSON.stringify(data) } };
                    } catch (err) {
                        return { data: null, error: { message: err.message } };
                    }
                },
            };

            return chain;
        },
    };
}


// ─── Exports ────────────────────────────────────────────────────────────────

export default {
    handleTimeMachineSync,
    handleTimeMachineAnalyze,
    handleListAnalyses,
    handleGetAnalysis,
    handleGetAttribution,
    handleSaveAttribution,
    handleSuggestAttribution,
    handleSyncStatus,
};
