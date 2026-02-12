/**
 * FINAULT RECONCILIATION ENGINE v1.0
 * ═══════════════════════════════════════════════════════════════════
 * Automatically match provider invoices to internal usage records
 *
 * Features:
 * - Fuzzy matching for timestamps
 * - Model name normalization
 * - Cost variance detection
 * - Confidence scoring
 * - Discrepancy reporting
 * ═══════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} ReconciliationResult
 * @property {number} invoiceTotal - Total from provider invoice
 * @property {number} internalTotal - Total from internal records
 * @property {number} matchedTotal - Amount successfully matched
 * @property {number} unmatchedInvoice - Invoice amount not matched to internal
 * @property {number} unmatchedInternal - Internal amount not matched to invoice
 * @property {number} variance - Absolute difference
 * @property {number} variancePercentage - Variance as percentage of invoice
 * @property {Discrepancy[]} discrepancies - List of discrepancies found
 * @property {number} confidence - Overall confidence score (0-100)
 * @property {string} status - 'clean' | 'minor_variance' | 'review_required' | 'failed'
 * @property {MatchedRecord[]} matches - Successfully matched records
 */

/**
 * @typedef {Object} Discrepancy
 * @property {string} type - Type of discrepancy
 * @property {string} severity - 'low' | 'medium' | 'high'
 * @property {string} description - Human-readable description
 * @property {number} amount - Dollar amount of discrepancy
 * @property {Object} invoiceRecord - The invoice record
 * @property {Object} internalRecord - The internal record (if any)
 */

/**
 * @typedef {Object} MatchedRecord
 * @property {Object} invoice - Invoice line item
 * @property {Object} internal - Internal usage record
 * @property {number} confidence - Match confidence (0-100)
 * @property {number} costVariance - Cost difference
 */

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

const CONFIG = {
    // Time tolerance for matching (in milliseconds)
    TIME_TOLERANCE_MS: 24 * 60 * 60 * 1000, // 24 hours

    // Cost variance thresholds
    COST_VARIANCE_WARNING: 0.01, // 1%
    COST_VARIANCE_ERROR: 0.05,   // 5%

    // Token variance thresholds
    TOKEN_VARIANCE_WARNING: 0.05, // 5%
    TOKEN_VARIANCE_ERROR: 0.15,   // 15%

    // Confidence thresholds
    CONFIDENCE_HIGH: 95,
    CONFIDENCE_MEDIUM: 80,
    CONFIDENCE_LOW: 60,

    // Reconciliation status thresholds
    STATUS_CLEAN_VARIANCE: 0.005,       // 0.5%
    STATUS_MINOR_VARIANCE: 0.02,        // 2%
    STATUS_REVIEW_THRESHOLD: 0.10,      // 10%
};

// ═══════════════════════════════════════════════════════════════════
// MAIN RECONCILIATION ENGINE
// ═══════════════════════════════════════════════════════════════════

class ReconciliationEngine {
    constructor(options = {}) {
        this.config = { ...CONFIG, ...options };
    }

    /**
     * Reconcile provider invoice against internal usage records
     * @param {NormalizedInvoice} providerInvoice - Parsed provider invoice
     * @param {UsageRecord[]} internalUsage - Internal usage tracking data
     * @returns {ReconciliationResult}
     */
    reconcile(providerInvoice, internalUsage) {
        const result = {
            invoiceTotal: providerInvoice.totalAmount,
            internalTotal: 0,
            matchedTotal: 0,
            unmatchedInvoice: 0,
            unmatchedInternal: 0,
            variance: 0,
            variancePercentage: 0,
            discrepancies: [],
            confidence: 100,
            status: 'clean',
            matches: [],
            period: {
                start: providerInvoice.periodStart,
                end: providerInvoice.periodEnd,
            },
            provider: providerInvoice.provider,
            timestamp: new Date().toISOString(),
        };

        // Calculate internal total
        result.internalTotal = internalUsage.reduce((sum, r) => sum + (r.cost || r.amount || 0), 0);
        result.internalTotal = Math.round(result.internalTotal * 100) / 100;

        // Track unmatched records
        const unmatchedInvoiceItems = [...providerInvoice.lineItems];
        const unmatchedInternalItems = [...internalUsage];

        // Perform matching
        for (let i = unmatchedInvoiceItems.length - 1; i >= 0; i--) {
            const invoiceItem = unmatchedInvoiceItems[i];
            const matchResult = this.findBestMatch(invoiceItem, unmatchedInternalItems);

            if (matchResult.match) {
                // Record successful match
                result.matches.push({
                    invoice: invoiceItem,
                    internal: matchResult.match,
                    confidence: matchResult.confidence,
                    costVariance: Math.abs(invoiceItem.amount - (matchResult.match.cost || matchResult.match.amount || 0)),
                });

                result.matchedTotal += invoiceItem.amount;

                // Remove matched items
                unmatchedInvoiceItems.splice(i, 1);
                const internalIdx = unmatchedInternalItems.indexOf(matchResult.match);
                if (internalIdx !== -1) {
                    unmatchedInternalItems.splice(internalIdx, 1);
                }

                // Check for cost variance within match
                if (matchResult.costVariance > this.config.COST_VARIANCE_WARNING) {
                    result.discrepancies.push({
                        type: 'cost_variance',
                        severity: matchResult.costVariance > this.config.COST_VARIANCE_ERROR ? 'high' : 'medium',
                        description: `Cost variance of ${(matchResult.costVariance * 100).toFixed(2)}% for ${invoiceItem.model}`,
                        amount: Math.abs(invoiceItem.amount - (matchResult.match.cost || matchResult.match.amount || 0)),
                        invoiceRecord: invoiceItem,
                        internalRecord: matchResult.match,
                    });
                }
            }
        }

        // Calculate unmatched totals
        result.unmatchedInvoice = unmatchedInvoiceItems.reduce((sum, r) => sum + (r.amount || 0), 0);
        result.unmatchedInternal = unmatchedInternalItems.reduce((sum, r) => sum + (r.cost || r.amount || 0), 0);

        // Round for display
        result.matchedTotal = Math.round(result.matchedTotal * 100) / 100;
        result.unmatchedInvoice = Math.round(result.unmatchedInvoice * 100) / 100;
        result.unmatchedInternal = Math.round(result.unmatchedInternal * 100) / 100;

        // Add discrepancies for unmatched items
        for (const item of unmatchedInvoiceItems) {
            result.discrepancies.push({
                type: 'unmatched_invoice',
                severity: item.amount > 100 ? 'high' : item.amount > 10 ? 'medium' : 'low',
                description: `Invoice charge not found in internal records: ${item.model} on ${formatDate(item.date)}`,
                amount: item.amount,
                invoiceRecord: item,
                internalRecord: null,
            });
        }

        for (const item of unmatchedInternalItems) {
            const amount = item.cost || item.amount || 0;
            result.discrepancies.push({
                type: 'unmatched_internal',
                severity: amount > 100 ? 'high' : amount > 10 ? 'medium' : 'low',
                description: `Internal record not found on invoice: ${item.model} on ${formatDate(item.date || item.timestamp)}`,
                amount,
                invoiceRecord: null,
                internalRecord: item,
            });
        }

        // Calculate overall variance
        result.variance = Math.abs(result.invoiceTotal - result.internalTotal);
        result.variancePercentage = result.invoiceTotal > 0
            ? result.variance / result.invoiceTotal
            : 0;

        // Calculate confidence score
        result.confidence = this.calculateConfidence(result);

        // Determine status
        result.status = this.determineStatus(result);

        return result;
    }

    /**
     * Find the best matching internal record for an invoice item
     */
    findBestMatch(invoiceItem, internalRecords) {
        let bestMatch = null;
        let bestConfidence = 0;
        let bestCostVariance = Infinity;

        for (const internal of internalRecords) {
            const score = this.calculateMatchScore(invoiceItem, internal);

            if (score.confidence > bestConfidence ||
                (score.confidence === bestConfidence && score.costVariance < bestCostVariance)) {
                bestMatch = internal;
                bestConfidence = score.confidence;
                bestCostVariance = score.costVariance;
            }
        }

        // Only return match if confidence exceeds threshold
        if (bestConfidence >= this.config.CONFIDENCE_LOW) {
            return { match: bestMatch, confidence: bestConfidence, costVariance: bestCostVariance };
        }

        return { match: null, confidence: 0, costVariance: 0 };
    }

    /**
     * Calculate match score between invoice item and internal record
     */
    calculateMatchScore(invoice, internal) {
        let score = 0;
        let maxScore = 0;

        // Model matching (40 points)
        maxScore += 40;
        const invoiceModel = normalizeModel(invoice.model);
        const internalModel = normalizeModel(internal.model);
        if (invoiceModel === internalModel) {
            score += 40;
        } else if (isSimilarModel(invoiceModel, internalModel)) {
            score += 20;
        }

        // Date matching (30 points)
        maxScore += 30;
        const invoiceDate = new Date(invoice.date).getTime();
        const internalDate = new Date(internal.date || internal.timestamp || internal.created_at).getTime();
        const timeDiff = Math.abs(invoiceDate - internalDate);

        if (timeDiff < this.config.TIME_TOLERANCE_MS / 24) { // Within 1 hour
            score += 30;
        } else if (timeDiff < this.config.TIME_TOLERANCE_MS) { // Within 24 hours
            score += 20;
        } else if (timeDiff < this.config.TIME_TOLERANCE_MS * 7) { // Within 7 days
            score += 10;
        }

        // Token matching (20 points)
        maxScore += 20;
        const invoiceTokens = (invoice.inputTokens || 0) + (invoice.outputTokens || 0);
        const internalTokens = (internal.input_tokens || internal.inputTokens || 0) +
                               (internal.output_tokens || internal.outputTokens || 0);

        if (invoiceTokens > 0 && internalTokens > 0) {
            const tokenDiff = Math.abs(invoiceTokens - internalTokens) / Math.max(invoiceTokens, internalTokens);
            if (tokenDiff < 0.01) { // Within 1%
                score += 20;
            } else if (tokenDiff < 0.05) { // Within 5%
                score += 15;
            } else if (tokenDiff < 0.15) { // Within 15%
                score += 10;
            }
        }

        // Cost matching (10 points)
        maxScore += 10;
        const invoiceCost = invoice.amount || 0;
        const internalCost = internal.cost || internal.amount || internal.cost_usd || 0;

        if (invoiceCost > 0 && internalCost > 0) {
            const costDiff = Math.abs(invoiceCost - internalCost) / Math.max(invoiceCost, internalCost);
            if (costDiff < 0.01) {
                score += 10;
            } else if (costDiff < 0.05) {
                score += 7;
            } else if (costDiff < 0.15) {
                score += 4;
            }
        }

        const confidence = Math.round((score / maxScore) * 100);
        const costVariance = Math.abs(invoiceCost - internalCost) / Math.max(invoiceCost, internalCost, 0.01);

        return { confidence, costVariance };
    }

    /**
     * Calculate overall confidence score for reconciliation
     */
    calculateConfidence(result) {
        let confidence = 100;

        // Deduct for variance
        if (result.variancePercentage > this.config.STATUS_CLEAN_VARIANCE) {
            confidence -= result.variancePercentage * 100;
        }

        // Deduct for unmatched items
        const matchRate = result.invoiceTotal > 0
            ? result.matchedTotal / result.invoiceTotal
            : 1;
        confidence -= (1 - matchRate) * 30;

        // Deduct for discrepancies
        confidence -= result.discrepancies.filter(d => d.severity === 'high').length * 5;
        confidence -= result.discrepancies.filter(d => d.severity === 'medium').length * 2;

        return Math.max(0, Math.min(100, Math.round(confidence)));
    }

    /**
     * Determine reconciliation status
     */
    determineStatus(result) {
        if (result.variancePercentage <= this.config.STATUS_CLEAN_VARIANCE &&
            result.discrepancies.filter(d => d.severity === 'high').length === 0) {
            return 'clean';
        }

        if (result.variancePercentage <= this.config.STATUS_MINOR_VARIANCE &&
            result.discrepancies.filter(d => d.severity === 'high').length <= 1) {
            return 'minor_variance';
        }

        if (result.variancePercentage <= this.config.STATUS_REVIEW_THRESHOLD) {
            return 'review_required';
        }

        return 'failed';
    }

    /**
     * Generate reconciliation report
     */
    generateReport(result) {
        const statusEmoji = {
            clean: '✅',
            minor_variance: '⚠️',
            review_required: '🔍',
            failed: '❌',
        };

        const statusText = {
            clean: 'Clean - Ready to Book',
            minor_variance: 'Minor Variance - Review Recommended',
            review_required: 'Review Required',
            failed: 'Failed - Significant Discrepancies',
        };

        let report = `
═══════════════════════════════════════════════════════════════════
FINAULT RECONCILIATION REPORT
═══════════════════════════════════════════════════════════════════

Provider: ${result.provider.toUpperCase()}
Period: ${formatDate(result.period.start)} - ${formatDate(result.period.end)}
Generated: ${formatDate(new Date(result.timestamp))}

STATUS: ${statusEmoji[result.status]} ${statusText[result.status]}
Confidence Score: ${result.confidence}%

───────────────────────────────────────────────────────────────────
SUMMARY
───────────────────────────────────────────────────────────────────

Invoice Total:     $${result.invoiceTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
Internal Total:    $${result.internalTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
Matched:           $${result.matchedTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
Variance:          $${result.variance.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${(result.variancePercentage * 100).toFixed(2)}%)

Unmatched Invoice: $${result.unmatchedInvoice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
Unmatched Internal: $${result.unmatchedInternal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
`;

        if (result.discrepancies.length > 0) {
            report += `
───────────────────────────────────────────────────────────────────
DISCREPANCIES (${result.discrepancies.length})
───────────────────────────────────────────────────────────────────
`;

            const sortedDiscrepancies = result.discrepancies
                .sort((a, b) => b.amount - a.amount)
                .slice(0, 10); // Top 10

            for (const d of sortedDiscrepancies) {
                const severityIcon = d.severity === 'high' ? '🔴' : d.severity === 'medium' ? '🟡' : '🟢';
                report += `
${severityIcon} [${d.type.toUpperCase()}] $${d.amount.toFixed(2)}
   ${d.description}
`;
            }

            if (result.discrepancies.length > 10) {
                report += `\n   ... and ${result.discrepancies.length - 10} more discrepancies\n`;
            }
        }

        report += `
───────────────────────────────────────────────────────────────────
MATCHED RECORDS (${result.matches.length})
───────────────────────────────────────────────────────────────────

Records matched with high confidence (>95%): ${result.matches.filter(m => m.confidence >= 95).length}
Records matched with medium confidence (80-95%): ${result.matches.filter(m => m.confidence >= 80 && m.confidence < 95).length}
Records matched with low confidence (<80%): ${result.matches.filter(m => m.confidence < 80).length}

═══════════════════════════════════════════════════════════════════
`;

        return report;
    }
}

// ═══════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

function normalizeModel(model) {
    if (!model) return 'unknown';
    return model.toLowerCase()
        .replace(/-20\d{6}/g, '') // Remove date suffixes
        .replace(/_/g, '-')
        .replace(/\s+/g, '-')
        .trim();
}

function isSimilarModel(model1, model2) {
    // Check if models are from same family
    const families = [
        ['gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini'],
        ['gpt-3.5', 'gpt-3.5-turbo', 'gpt-35-turbo'],
        ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
        ['claude-3.5-sonnet', 'claude-3.5-haiku'],
        ['gemini-1.5-pro', 'gemini-1.5-flash'],
    ];

    for (const family of families) {
        if (family.some(m => model1.includes(m)) && family.some(m => model2.includes(m))) {
            return true;
        }
    }

    return false;
}

function formatDate(date) {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toISOString().split('T')[0];
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ReconciliationEngine };
}

if (typeof window !== 'undefined') {
    window.ReconciliationEngine = ReconciliationEngine;
}
