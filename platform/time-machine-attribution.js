/**
 * Time Machine Attribution Engine
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Bridges AI usage data and Stripe customer revenue for the Time Machine.
 * Three attribution strategies:
 *   1. api_key   — Direct mapping: API key ID → Stripe customer
 *   2. project   — Direct mapping: provider project/workspace → Stripe customer
 *   3. proportional — Revenue-weighted distribution (fallback)
 *
 * Also provides auto-suggestion: given usage data + Stripe customers,
 * suggests plausible mappings for the user to confirm.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─── Attribution Mapping Manager ────────────────────────────────────────────

/**
 * Load attribution mappings for an organization from Supabase.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} orgId
 * @returns {Array} Array of mapping objects
 */
export async function loadAttributionMappings(supabase, orgId) {
    const { data, error } = await supabase
        .from('customer_attribution_mappings')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('[TimeMachineAttribution] Failed to load mappings:', error.message);
        return [];
    }

    return (data || []).map(row => ({
        id: row.id,
        stripe_customer_id: row.stripe_customer_id,
        customer_name: row.customer_name,
        strategy: row.strategy,
        match_value: row.match_value,
        weight: parseFloat(row.weight || 1.0),
    }));
}

/**
 * Save or update attribution mappings.
 *
 * @param {Object} supabase
 * @param {string} orgId
 * @param {Array} mappings - Array of { stripe_customer_id, customer_name, strategy, match_value, weight }
 * @returns {{ saved: number, errors: Array }}
 */
export async function saveAttributionMappings(supabase, orgId, mappings) {
    let saved = 0;
    const errors = [];

    for (const mapping of mappings) {
        const row = {
            org_id: orgId,
            stripe_customer_id: mapping.stripe_customer_id,
            customer_name: mapping.customer_name || null,
            strategy: mapping.strategy || 'proportional',
            match_value: mapping.match_value || null,
            weight: mapping.weight || 1.0,
            updated_at: new Date().toISOString(),
        };

        // Upsert on (org_id, stripe_customer_id, match_value)
        const { error } = await supabase
            .from('customer_attribution_mappings')
            .upsert(row, {
                onConflict: 'org_id,stripe_customer_id,match_value',
                ignoreDuplicates: false,
            });

        if (error) {
            errors.push({ customer: mapping.stripe_customer_id, error: error.message });
        } else {
            saved++;
        }
    }

    return { saved, errors };
}


// ─── Auto-Suggestion Engine ─────────────────────────────────────────────────

/**
 * Analyze usage records and Stripe customers to suggest attribution mappings.
 *
 * Heuristics:
 * 1. If there's exactly 1 customer and 1 project → direct match
 * 2. If customer name appears in project_id → name match
 * 3. If # of unique projects ≈ # of customers → attempt 1:1 by cost rank
 * 4. Otherwise → suggest proportional for all
 *
 * @param {Array} usageRecords - Historical usage records
 * @param {Object} customerData - Map of customer_id → { name, total_paid, ... }
 * @returns {Array} Suggested mappings with confidence scores
 */
export function suggestAttributionMappings(usageRecords, customerData) {
    if (!usageRecords?.length || !customerData || Object.keys(customerData).length === 0) {
        return [];
    }

    const customers = Object.entries(customerData).map(([id, data]) => ({
        id,
        name: (data.name || '').toLowerCase().trim(),
        revenue: data.total_paid || 0,
    }));

    // Extract unique projects and API keys with their total costs
    const projectCosts = {};
    const apiKeyCosts = {};

    for (const r of usageRecords) {
        const proj = r.project_id || 'default';
        const key = r.api_key_id || '';
        const cost = r.cost_usd || 0;

        projectCosts[proj] = (projectCosts[proj] || 0) + cost;
        if (key) {
            apiKeyCosts[key] = (apiKeyCosts[key] || 0) + cost;
        }
    }

    const projects = Object.entries(projectCosts)
        .map(([id, cost]) => ({ id, cost }))
        .sort((a, b) => b.cost - a.cost);

    const suggestions = [];

    // ── Strategy 1: Name matching ──────────────────────────────────────
    // Check if any customer name appears in a project ID
    const nameMatched = new Set();
    const projectMatched = new Set();

    for (const customer of customers) {
        if (!customer.name) continue;

        // Normalize customer name for matching
        const nameTokens = customer.name
            .replace(/[^a-z0-9\s]/g, '')
            .split(/\s+/)
            .filter(t => t.length > 2);

        for (const project of projects) {
            if (projectMatched.has(project.id)) continue;

            const projLower = project.id.toLowerCase();
            const matched = nameTokens.some(token => projLower.includes(token));

            if (matched) {
                suggestions.push({
                    stripe_customer_id: customer.id,
                    customer_name: customerData[customer.id].name,
                    strategy: 'project',
                    match_value: project.id,
                    weight: 1.0,
                    confidence: 0.75,
                    reason: `Project "${project.id}" contains customer name tokens`,
                    estimated_cost: project.cost,
                });
                nameMatched.add(customer.id);
                projectMatched.add(project.id);
                break;
            }
        }
    }

    // ── Strategy 2: 1:1 cost-rank matching ─────────────────────────────
    // If similar number of projects and customers, match by rank
    const unmatchedCustomers = customers.filter(c => !nameMatched.has(c.id))
        .sort((a, b) => b.revenue - a.revenue);
    const unmatchedProjects = projects.filter(p => !projectMatched.has(p.id));

    if (unmatchedProjects.length > 0 &&
        unmatchedCustomers.length > 0 &&
        Math.abs(unmatchedProjects.length - unmatchedCustomers.length) <= 2) {
        // Cost-rank heuristic: biggest spender = biggest customer
        const limit = Math.min(unmatchedCustomers.length, unmatchedProjects.length);
        for (let i = 0; i < limit; i++) {
            suggestions.push({
                stripe_customer_id: unmatchedCustomers[i].id,
                customer_name: customerData[unmatchedCustomers[i].id].name,
                strategy: 'project',
                match_value: unmatchedProjects[i].id,
                weight: 1.0,
                confidence: 0.40,
                reason: `Cost-rank match: #${i + 1} customer by revenue ↔ #${i + 1} project by cost`,
                estimated_cost: unmatchedProjects[i].cost,
            });
            nameMatched.add(unmatchedCustomers[i].id);
        }
    }

    // ── Strategy 3: Proportional fallback ──────────────────────────────
    // Any customer still unmatched gets proportional attribution
    const stillUnmatched = customers.filter(c => !nameMatched.has(c.id));
    const totalRevenue = customers.reduce((s, c) => s + c.revenue, 0);

    for (const customer of stillUnmatched) {
        const weight = totalRevenue > 0
            ? Math.round((customer.revenue / totalRevenue) * 10000) / 10000
            : 1 / customers.length;

        suggestions.push({
            stripe_customer_id: customer.id,
            customer_name: customerData[customer.id].name,
            strategy: 'proportional',
            match_value: null,
            weight,
            confidence: 0.25,
            reason: 'No direct match found — using revenue-weighted proportional distribution',
            estimated_cost: null,
        });
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence);
}


// ─── Attribution Resolver ───────────────────────────────────────────────────

/**
 * Given confirmed mappings and usage records, compute per-customer cost allocation.
 * This is the core attribution resolution used by the Time Machine engine.
 *
 * @param {Array} usageRecords
 * @param {Array} mappings - Confirmed attribution mappings
 * @param {Object} customerData - Stripe customer data
 * @returns {Object} Map of customer_id → { revenue, actual_cost, records_matched }
 */
export function resolveAttribution(usageRecords, mappings, customerData) {
    const totalCost = usageRecords.reduce((s, r) => s + (r.cost_usd || 0), 0);
    const totalRevenue = Object.values(customerData)
        .reduce((s, c) => s + (c.total_paid || 0), 0);

    const result = {};

    // Initialize all customers
    for (const [custId, cust] of Object.entries(customerData)) {
        result[custId] = {
            customer_id: custId,
            name: cust.name || custId,
            email: cust.email || '',
            revenue: cust.total_paid || 0,
            actual_cost: 0,
            records_matched: 0,
            attribution_strategy: 'unattributed',
        };
    }

    // Track which records have been directly attributed
    const attributedRecordIds = new Set();

    // Pass 1: Direct attribution (api_key and project strategies)
    const directMappings = mappings.filter(m => m.strategy === 'api_key' || m.strategy === 'project');

    for (const mapping of directMappings) {
        const custId = mapping.stripe_customer_id;
        if (!result[custId]) continue;

        const matchField = mapping.strategy === 'api_key' ? 'api_key_id' : 'project_id';
        const matched = usageRecords.filter((r, idx) => {
            if (r[matchField] === mapping.match_value && !attributedRecordIds.has(idx)) {
                attributedRecordIds.add(idx);
                return true;
            }
            return false;
        });

        const cost = matched.reduce((s, r) => s + (r.cost_usd || 0), 0);
        result[custId].actual_cost += cost;
        result[custId].records_matched += matched.length;
        result[custId].attribution_strategy = mapping.strategy;
    }

    // Pass 2: Proportional attribution for remaining costs
    const unattributedCost = usageRecords.reduce((sum, r, idx) => {
        if (attributedRecordIds.has(idx)) return sum;
        return sum + (r.cost_usd || 0);
    }, 0);

    const proportionalMappings = mappings.filter(m => m.strategy === 'proportional');
    const proportionalCustomers = proportionalMappings.length > 0
        ? proportionalMappings
        : Object.keys(customerData)
            .filter(id => result[id]?.attribution_strategy === 'unattributed')
            .map(id => ({
                stripe_customer_id: id,
                weight: totalRevenue > 0
                    ? (customerData[id].total_paid || 0) / totalRevenue
                    : 1 / Object.keys(customerData).length,
            }));

    if (unattributedCost > 0 && proportionalCustomers.length > 0) {
        const totalWeight = proportionalCustomers.reduce((s, m) => s + (m.weight || 0), 0);

        for (const mapping of proportionalCustomers) {
            const custId = mapping.stripe_customer_id;
            if (!result[custId]) continue;

            const share = totalWeight > 0 ? (mapping.weight || 0) / totalWeight : 0;
            result[custId].actual_cost += unattributedCost * share;
            if (result[custId].attribution_strategy === 'unattributed') {
                result[custId].attribution_strategy = 'proportional';
            }
        }
    }

    // Round costs
    for (const custId of Object.keys(result)) {
        result[custId].actual_cost = Math.round(result[custId].actual_cost * 100) / 100;
    }

    return result;
}


// ─── Margin Calculator ──────────────────────────────────────────────────────

/**
 * Compute per-customer margin metrics with before/after optimization comparison.
 *
 * @param {Object} attributedCosts - Output of resolveAttribution()
 * @param {number} totalSavings - Total optimized savings from Time Machine analysis
 * @param {number} totalActualCost - Total actual cost
 * @returns {Array} Per-customer margin analysis sorted by actual margin (worst first)
 */
export function computeCustomerMargins(attributedCosts, totalSavings, totalActualCost) {
    const savingsRatio = totalActualCost > 0 ? totalSavings / totalActualCost : 0;

    const margins = Object.values(attributedCosts).map(customer => {
        const optimizedCost = customer.actual_cost * (1 - savingsRatio);
        const revenue = customer.revenue;

        const actualMargin = revenue > 0
            ? ((revenue - customer.actual_cost) / revenue) * 100
            : (customer.actual_cost > 0 ? -100 : 0);

        const optimizedMargin = revenue > 0
            ? ((revenue - optimizedCost) / revenue) * 100
            : (optimizedCost > 0 ? -100 : 0);

        const costToServeRatio = revenue > 0 ? customer.actual_cost / revenue : Infinity;
        const isUnderwater = customer.actual_cost > revenue && revenue > 0;
        const wouldBeFixed = isUnderwater && optimizedCost <= revenue;

        return {
            customer_id: customer.customer_id,
            name: customer.name,
            email: customer.email,
            revenue: Math.round(revenue * 100) / 100,
            actual_cost: customer.actual_cost,
            optimized_cost: Math.round(optimizedCost * 100) / 100,
            actual_margin_percent: Math.round(actualMargin * 10) / 10,
            optimized_margin_percent: Math.round(optimizedMargin * 10) / 10,
            margin_improvement: Math.round((optimizedMargin - actualMargin) * 10) / 10,
            cost_to_serve_ratio: Math.round(costToServeRatio * 100) / 100,
            is_underwater: isUnderwater,
            would_be_fixed: wouldBeFixed,
            attribution_strategy: customer.attribution_strategy,
            records_matched: customer.records_matched,
        };
    });

    // Sort: underwater customers first (most shocking), then by margin ascending
    margins.sort((a, b) => {
        if (a.is_underwater !== b.is_underwater) return a.is_underwater ? -1 : 1;
        return a.actual_margin_percent - b.actual_margin_percent;
    });

    return margins;
}


// ─── Summary Statistics ─────────────────────────────────────────────────────

/**
 * Generate summary statistics for the customer impact section.
 *
 * @param {Array} margins - Output of computeCustomerMargins()
 * @returns {Object} Summary metrics
 */
export function computeAttributionSummary(margins) {
    if (!margins.length) {
        return {
            total_customers: 0,
            customers_underwater: 0,
            customers_fixable: 0,
            avg_margin_actual: 0,
            avg_margin_optimized: 0,
            worst_customer: null,
            best_customer: null,
            total_revenue: 0,
            total_cost_actual: 0,
            total_cost_optimized: 0,
            blended_margin_actual: 0,
            blended_margin_optimized: 0,
        };
    }

    const totalRevenue = margins.reduce((s, m) => s + m.revenue, 0);
    const totalCostActual = margins.reduce((s, m) => s + m.actual_cost, 0);
    const totalCostOptimized = margins.reduce((s, m) => s + m.optimized_cost, 0);

    const blendedActual = totalRevenue > 0
        ? ((totalRevenue - totalCostActual) / totalRevenue) * 100 : 0;
    const blendedOptimized = totalRevenue > 0
        ? ((totalRevenue - totalCostOptimized) / totalRevenue) * 100 : 0;

    const underwater = margins.filter(m => m.is_underwater);
    const fixable = margins.filter(m => m.would_be_fixed);

    // Worst customer by margin
    const worst = margins[0] || null;
    // Best customer by margin
    const best = margins[margins.length - 1] || null;

    return {
        total_customers: margins.length,
        customers_underwater: underwater.length,
        customers_fixable: fixable.length,
        avg_margin_actual: Math.round(
            (margins.reduce((s, m) => s + m.actual_margin_percent, 0) / margins.length) * 10
        ) / 10,
        avg_margin_optimized: Math.round(
            (margins.reduce((s, m) => s + m.optimized_margin_percent, 0) / margins.length) * 10
        ) / 10,
        worst_customer: worst ? { name: worst.name, margin: worst.actual_margin_percent } : null,
        best_customer: best ? { name: best.name, margin: best.actual_margin_percent } : null,
        total_revenue: Math.round(totalRevenue * 100) / 100,
        total_cost_actual: Math.round(totalCostActual * 100) / 100,
        total_cost_optimized: Math.round(totalCostOptimized * 100) / 100,
        blended_margin_actual: Math.round(blendedActual * 10) / 10,
        blended_margin_optimized: Math.round(blendedOptimized * 10) / 10,
    };
}


export default {
    loadAttributionMappings,
    saveAttributionMappings,
    suggestAttributionMappings,
    resolveAttribution,
    computeCustomerMargins,
    computeAttributionSummary,
};
