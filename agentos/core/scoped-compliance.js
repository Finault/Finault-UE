/**
 * SCOPED COMPLIANCE CHECKER (W-015)
 * Scope-aware budget compliance and safe percentage computation
 *
 * PROBLEMS FIXED:
 * 1. close-pack-generator.js lines 387-399: (p.amount / total) * 100 divides by zero
 *    when total_spend is 0, producing NaN% across all cost breakdown categories.
 *
 * 2. policy-agent.js generateComplianceReport: fetches ALL cost records org-wide
 *    then checks against team-scoped budget policies. A team with $1000 budget
 *    gets compared to $50,000 org-wide spend — always shows violations.
 *
 * SOLUTION:
 * 1. SafeMath utilities for division-safe percentage calculations
 * 2. ScopedComplianceChecker that respects policy scope when filtering cost data
 */

// ─── CONFIGURATION ──────────────────────────────────────────────────────────

export const COMPLIANCE_CONFIG = {
    // Policy scope hierarchy (most specific to least)
    SCOPE_HIERARCHY: ['user', 'project', 'team', 'department', 'organization'],
    // Default scope if none specified
    DEFAULT_SCOPE: 'organization',
    // Tolerance for floating-point comparison
    FLOAT_TOLERANCE: 0.001
};

// ─── SAFE MATH ──────────────────────────────────────────────────────────────

/**
 * Division-safe percentage: returns 0 when divisor is 0 instead of NaN/Infinity.
 * Fixes close-pack-generator.js lines 387-399.
 */
export function safeDivide(numerator, denominator, fallback = 0) {
    if (denominator === 0 || denominator === null || denominator === undefined || !isFinite(denominator)) {
        return fallback;
    }
    if (numerator === null || numerator === undefined || !isFinite(numerator)) {
        return fallback;
    }
    return numerator / denominator;
}

/**
 * Safe percentage string: "XX.X%" or "0.0%" when total is 0
 */
export function safePercentageString(amount, total, decimals = 1) {
    const pct = safeDivide(amount, total, 0) * 100;
    return pct.toFixed(decimals) + '%';
}

/**
 * Safe percentage number: 0 - 100 scale
 */
export function safePercentageNum(amount, total) {
    return safeDivide(amount, total, 0) * 100;
}

/**
 * Safe cost breakdown: applies safePercentageString to each item in an array
 * This directly replaces the broken pattern in close-pack-generator:
 *   costData.by_provider.map(p => ({ ...p, percentage: ((p.amount / total) * 100).toFixed(1) + '%' }))
 */
export function safeCostBreakdown(items, total, amountField = 'amount', decimals = 1) {
    if (!Array.isArray(items)) return [];

    return items.map(item => ({
        ...item,
        percentage: safePercentageString(
            typeof item[amountField] === 'string' ? parseFloat(item[amountField]) : item[amountField],
            total,
            decimals
        )
    }));
}

// ─── SCOPE RESOLVER ─────────────────────────────────────────────────────────

/**
 * Resolves which cost records match a policy's scope.
 * Fixes the policy-agent.js bug where org-wide spend was checked against team budgets.
 */
export class ScopeResolver {
    /**
     * Determine the effective scope of a policy
     */
    static getScope(policy) {
        if (!policy) return COMPLIANCE_CONFIG.DEFAULT_SCOPE;

        // Check for explicit scope field
        if (policy.scope) {
            const scope = typeof policy.scope === 'string' ? policy.scope : policy.scope.type;
            if (COMPLIANCE_CONFIG.SCOPE_HIERARCHY.includes(scope)) {
                return scope;
            }
        }

        // Infer scope from policy config fields
        const config = policy.config || policy;
        if (config.user_id) return 'user';
        if (config.project_id || config.project) return 'project';
        if (config.team_id || config.team) return 'team';
        if (config.department_id || config.department) return 'department';

        return COMPLIANCE_CONFIG.DEFAULT_SCOPE;
    }

    /**
     * Get the scope identifier value from a policy
     */
    static getScopeId(policy) {
        const scope = ScopeResolver.getScope(policy);
        const config = policy.config || policy;
        const scopeData = typeof policy.scope === 'object' ? policy.scope : {};

        switch (scope) {
            case 'user':
                return config.user_id || scopeData.id || null;
            case 'project':
                return config.project_id || config.project || scopeData.id || null;
            case 'team':
                return config.team_id || config.team || scopeData.id || null;
            case 'department':
                return config.department_id || config.department || scopeData.id || null;
            case 'organization':
            default:
                return null; // org-level = no additional filter
        }
    }

    /**
     * Filter cost records to match a policy's scope.
     * This is the core fix: instead of using ALL org records, filter by scope.
     */
    static filterByScope(costRecords, policy) {
        if (!Array.isArray(costRecords)) return [];

        const scope = ScopeResolver.getScope(policy);
        const scopeId = ScopeResolver.getScopeId(policy);

        // Organization scope: no additional filtering needed
        if (scope === 'organization' || !scopeId) {
            return costRecords;
        }

        // Filter records by scope field
        return costRecords.filter(record => {
            switch (scope) {
                case 'user':
                    return record.user_id === scopeId;
                case 'project':
                    return record.project === scopeId || record.project_id === scopeId;
                case 'team':
                    return record.team === scopeId || record.team_id === scopeId;
                case 'department':
                    return record.department === scopeId || record.department_id === scopeId;
                default:
                    return true;
            }
        });
    }

    /**
     * Compute scoped spend total
     */
    static computeScopedSpend(costRecords, policy) {
        const scopedRecords = ScopeResolver.filterByScope(costRecords, policy);
        return scopedRecords.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    }
}

// ─── SCOPED COMPLIANCE CHECKER ──────────────────────────────────────────────

/**
 * ScopedComplianceChecker — wraps the policy-agent compliance logic with proper scope filtering.
 */
export class ScopedComplianceChecker {
    constructor(config = {}) {
        this.floatTolerance = config.floatTolerance || COMPLIANCE_CONFIG.FLOAT_TOLERANCE;
    }

    /**
     * Check budget compliance with scope-aware spend calculation.
     * Replaces the policy-agent's org-wide totalSpend with scoped spend.
     */
    checkBudgetCompliance(policy, allCostRecords) {
        const violations = [];
        const warnings = [];

        const policyConfig = policy.config || policy;
        const budgetAmount = policyConfig.budget_amount;

        if (!budgetAmount || budgetAmount <= 0) {
            return {
                policy_type: 'budget',
                compliant: true,
                utilization: 0,
                violations: [],
                warnings: [{ type: 'invalid_budget', severity: 'low', message: 'Budget amount is 0 or not set' }],
                scope: ScopeResolver.getScope(policy),
                scoped_spend: 0
            };
        }

        // THE FIX: Use scoped spend instead of org-wide spend
        const scopedSpend = ScopeResolver.computeScopedSpend(allCostRecords, policy);
        const utilizationPercent = safePercentageNum(scopedSpend, budgetAmount);

        if (utilizationPercent >= 100) {
            violations.push({
                type: 'budget_exceeded',
                severity: 'critical',
                message: `Budget exceeded: $${scopedSpend.toFixed(2)} / $${budgetAmount} (${utilizationPercent.toFixed(1)}%)`,
                action_required: policyConfig.hard_limit ? 'Spending blocked' : 'Review required'
            });
        } else if (policyConfig.alert_thresholds) {
            const sortedThresholds = [...policyConfig.alert_thresholds].sort((a, b) => b - a);
            for (const threshold of sortedThresholds) {
                if (utilizationPercent >= threshold) {
                    warnings.push({
                        type: 'budget_warning',
                        severity: threshold >= 90 ? 'high' : threshold >= 75 ? 'medium' : 'low',
                        message: `Budget ${threshold}% threshold reached: $${scopedSpend.toFixed(2)} / $${budgetAmount}`,
                        projected_overrun: utilizationPercent > 80
                            ? `Projected to exceed budget by ${(utilizationPercent - 100).toFixed(1)}% at current rate`
                            : null
                    });
                    break;
                }
            }
        }

        return {
            policy_type: 'budget',
            compliant: violations.length === 0,
            utilization: utilizationPercent,
            violations,
            warnings,
            scope: ScopeResolver.getScope(policy),
            scope_id: ScopeResolver.getScopeId(policy),
            scoped_spend: scopedSpend,
            budget_amount: budgetAmount
        };
    }

    /**
     * Generate a scoped compliance report across multiple policies.
     * Each policy is checked against ONLY the cost records matching its scope.
     */
    generateScopedReport(policies, allCostRecords) {
        const report = {
            generated_at: new Date().toISOString(),
            summary: {
                total_policies: policies.length,
                compliant: 0,
                violations: 0,
                warnings: 0
            },
            policies: []
        };

        for (const policy of policies) {
            const policyConfig = policy.config || policy;
            let result;

            if (policy.type === 'budget' || policyConfig.budget_amount) {
                result = this.checkBudgetCompliance(policy, allCostRecords);
            } else {
                // Non-budget policies pass through (model_usage, rate_limit handled elsewhere)
                result = { compliant: true, violations: [], warnings: [] };
            }

            report.policies.push({
                policy_id: policy.id,
                policy_name: policy.name,
                ...result
            });

            if (result.compliant) {
                report.summary.compliant++;
            }
            report.summary.violations += result.violations.length;
            report.summary.warnings += result.warnings.length;
        }

        report.summary.compliance_score = policies.length > 0
            ? Math.round((report.summary.compliant / policies.length) * 100)
            : 100;

        return report;
    }
}

// ─── FACTORY ────────────────────────────────────────────────────────────────

export function createScopedComplianceChecker(config = {}) {
    return new ScopedComplianceChecker(config);
}

export default ScopedComplianceChecker;
