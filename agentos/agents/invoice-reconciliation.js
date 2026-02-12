/**
 * FINAULT INVOICE RECONCILIATION AGENT
 * The Finance Controller's Best Friend
 *
 * ELON'S INSIGHT: "The best part is no part."
 * Eliminate manual reconciliation entirely.
 *
 * JOBS' INSIGHT: "People don't know what they want until you show them."
 * Finance teams don't know they can close in hours, not days.
 *
 * THIS IS THE GOLDEN OPPORTUNITY:
 * - Nobody else auto-reconciles AI invoices
 * - Nobody else generates GL entries automatically
 * - Nobody else catches billing errors BEFORE payment
 *
 * The 3-Way Match That Actually Works:
 * 1. Usage Data (what you consumed)
 * 2. Rate Cards (what you should pay)
 * 3. Invoice (what they're charging)
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { AgentMemory, MEMORY_TYPES, IMPORTANCE } from '../core/agent-memory.js';
import { validateAgentParams } from '../core/validate-agent-params.js';
import { createSupabaseResilience, createAnthropicResilience } from '../core/resilience-layer.js';
// Gap #14: State machine for invoice lifecycle transitions
import { INVOICE_MACHINE, INVOICE_STATUS } from '../core/state-machines.js';
// Gap #9: Structured error handling
import { FinaultError, classifyError } from '../core/error-taxonomy.js';

const anthropic = new Anthropic();
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const resilientSupabase = createSupabaseResilience(supabase);
const resilientAnthropic = createAnthropicResilience(anthropic);

/**
 * Invoice Reconciliation Agent
 * Automates the most painful part of AI finance
 */
export class InvoiceReconciliationAgent {
    constructor(params = {}) {
        const { organizationId, userId, config } = validateAgentParams(params, 'InvoiceReconciliationAgent');
        this.organizationId = organizationId;
        this.userId = userId;
        this.tolerancePercent = 0.02; // 2% variance threshold
        this.reconciliationId = null;
        this.memory = new AgentMemory('invoice-reconciliation', organizationId, userId);
        this._memoryLoaded = false;
    }

    /**
     * Initialize memory
     */
    async initMemory() {
        if (!this._memoryLoaded) {
            await this.memory.load();
            this._memoryLoaded = true;
        }
    }

    /**
     * CORE: Reconcile an invoice against usage
     */
    async reconcile(invoice) {
        this.reconciliationId = crypto.randomUUID();
        const startTime = Date.now();

        console.log(`🧾 Starting reconciliation ${this.reconciliationId}`);

        // Step 1: Parse the invoice
        const parsedInvoice = await this.parseInvoice(invoice);

        // Step 2: Get usage data for the same period
        const usageData = await this.getUsageForPeriod(
            parsedInvoice.provider,
            parsedInvoice.period_start,
            parsedInvoice.period_end
        );

        // Step 3: Get rate cards
        const rateCards = await this.getRateCards(parsedInvoice.provider);

        // Step 4: Perform 3-way match
        const matchResult = await this.threeWayMatch(
            parsedInvoice,
            usageData,
            rateCards
        );

        // Step 5: Generate GL entries
        const glEntries = await this.generateGLEntries(
            parsedInvoice,
            matchResult
        );

        // Step 6: Create audit trail
        const auditRecord = await this.createAuditTrail({
            reconciliationId: this.reconciliationId,
            invoice: parsedInvoice,
            usage: usageData,
            matchResult,
            glEntries,
            duration_ms: Date.now() - startTime
        });

        return {
            success: true,
            reconciliation_id: this.reconciliationId,
            status: matchResult.status,
            summary: {
                invoice_total: parsedInvoice.total,
                calculated_total: matchResult.calculated_total,
                variance: matchResult.variance,
                variance_percent: matchResult.variance_percent,
                discrepancies: matchResult.discrepancies.length
            },
            discrepancies: matchResult.discrepancies,
            gl_entries: glEntries,
            recommendation: this.getRecommendation(matchResult),
            audit_hash: auditRecord.hash,
            processing_time_ms: Date.now() - startTime
        };
    }

    /**
     * Parse invoice using AI
     * Handles PDFs, CSVs, JSON from any provider
     */
    async parseInvoice(invoice) {
        // If already structured, validate and return
        if (invoice.structured) {
            return this.normalizeInvoice(invoice);
        }

        // Use Claude to parse unstructured invoice
        const response = await resilientAnthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            system: `You are an expert AI invoice parser. Extract structured data from invoices.

Return JSON with this exact structure:
{
  "provider": "OpenAI|Anthropic|Azure|AWS|Google",
  "invoice_number": "string",
  "invoice_date": "YYYY-MM-DD",
  "period_start": "YYYY-MM-DD",
  "period_end": "YYYY-MM-DD",
  "currency": "USD",
  "line_items": [
    {
      "description": "string",
      "model": "gpt-4|claude-3-opus|etc",
      "quantity": number,
      "unit": "tokens|requests|minutes",
      "unit_price": number,
      "amount": number
    }
  ],
  "subtotal": number,
  "taxes": number,
  "total": number,
  "payment_terms": "string"
}`,
            messages: [{
                role: 'user',
                content: `Parse this invoice:\n\n${JSON.stringify(invoice.raw || invoice)}`
            }]
        });

        const parsed = JSON.parse(response.content[0].text);
        return this.normalizeInvoice(parsed);
    }

    /**
     * Normalize invoice data
     */
    normalizeInvoice(invoice) {
        return {
            provider: invoice.provider?.toUpperCase() || 'UNKNOWN',
            invoice_number: invoice.invoice_number || invoice.id,
            invoice_date: invoice.invoice_date,
            period_start: invoice.period_start || invoice.billing_period?.start,
            period_end: invoice.period_end || invoice.billing_period?.end,
            currency: invoice.currency || 'USD',
            line_items: (invoice.line_items || []).map(item => ({
                description: item.description,
                model: this.normalizeModel(item.model || item.description),
                quantity: parseFloat(item.quantity) || 0,
                unit: item.unit || 'tokens',
                unit_price: parseFloat(item.unit_price) || 0,
                amount: parseFloat(item.amount) || 0
            })),
            subtotal: parseFloat(invoice.subtotal) || 0,
            taxes: parseFloat(invoice.taxes) || 0,
            total: parseFloat(invoice.total) || 0
        };
    }

    /**
     * Normalize model names across providers
     */
    normalizeModel(model) {
        const modelMap = {
            'gpt-4': 'gpt-4',
            'gpt-4-turbo': 'gpt-4-turbo',
            'gpt-4-turbo-preview': 'gpt-4-turbo',
            'gpt-4o': 'gpt-4o',
            'gpt-4o-mini': 'gpt-4o-mini',
            'gpt-3.5-turbo': 'gpt-3.5-turbo',
            'claude-3-opus': 'claude-3-opus',
            'claude-3-sonnet': 'claude-3-sonnet',
            'claude-3-haiku': 'claude-3-haiku',
            'claude-3.5-sonnet': 'claude-3.5-sonnet',
            'claude-sonnet-4': 'claude-sonnet-4',
            'claude-opus-4': 'claude-opus-4'
        };

        const normalized = model?.toLowerCase().replace(/[^a-z0-9.-]/g, '-');
        return modelMap[normalized] || normalized || 'unknown';
    }

    /**
     * Get usage data for reconciliation period
     */
    async getUsageForPeriod(provider, startDate, endDate) {
        const { data, error } = await resilientSupabase
            .from('cost_records')
            .select('*')
            .eq('organization_id', this.organizationId)
            .eq('provider', provider)
            .gte('timestamp', startDate)
            .lte('timestamp', endDate);

        if (error) throw error;

        // Aggregate by model
        const byModel = {};
        data.forEach(record => {
            const model = this.normalizeModel(record.model);
            if (!byModel[model]) {
                byModel[model] = {
                    model,
                    total_tokens: 0,
                    input_tokens: 0,
                    output_tokens: 0,
                    requests: 0,
                    total_cost: 0
                };
            }
            byModel[model].total_tokens += record.tokens || 0;
            byModel[model].input_tokens += record.input_tokens || 0;
            byModel[model].output_tokens += record.output_tokens || 0;
            byModel[model].requests += 1;
            byModel[model].total_cost += parseFloat(record.amount) || 0;
        });

        return {
            provider,
            period: { start: startDate, end: endDate },
            records_count: data.length,
            by_model: Object.values(byModel),
            total_cost: Object.values(byModel).reduce((sum, m) => sum + m.total_cost, 0)
        };
    }

    /**
     * Get rate cards for provider
     */
    async getRateCards(provider) {
        // Current pricing as of 2025 (should be updated from provider APIs)
        const rateCards = {
            OPENAI: {
                'gpt-4': { input: 0.03, output: 0.06, unit: 'per_1k_tokens' },
                'gpt-4-turbo': { input: 0.01, output: 0.03, unit: 'per_1k_tokens' },
                'gpt-4o': { input: 0.005, output: 0.015, unit: 'per_1k_tokens' },
                'gpt-4o-mini': { input: 0.00015, output: 0.0006, unit: 'per_1k_tokens' },
                'gpt-3.5-turbo': { input: 0.0005, output: 0.0015, unit: 'per_1k_tokens' }
            },
            ANTHROPIC: {
                'claude-3-opus': { input: 0.015, output: 0.075, unit: 'per_1k_tokens' },
                'claude-3-sonnet': { input: 0.003, output: 0.015, unit: 'per_1k_tokens' },
                'claude-3-haiku': { input: 0.00025, output: 0.00125, unit: 'per_1k_tokens' },
                'claude-3.5-sonnet': { input: 0.003, output: 0.015, unit: 'per_1k_tokens' },
                'claude-sonnet-4': { input: 0.003, output: 0.015, unit: 'per_1k_tokens' },
                'claude-opus-4': { input: 0.015, output: 0.075, unit: 'per_1k_tokens' }
            },
            AZURE: {
                // Azure typically matches OpenAI pricing
                'gpt-4': { input: 0.03, output: 0.06, unit: 'per_1k_tokens' },
                'gpt-4-turbo': { input: 0.01, output: 0.03, unit: 'per_1k_tokens' }
            },
            AWS: {
                // Bedrock pricing
                'claude-3-sonnet': { input: 0.003, output: 0.015, unit: 'per_1k_tokens' },
                'claude-3-haiku': { input: 0.00025, output: 0.00125, unit: 'per_1k_tokens' }
            },
            GOOGLE: {
                'gemini-1.5-pro': { input: 0.00125, output: 0.005, unit: 'per_1k_tokens' },
                'gemini-1.5-flash': { input: 0.000075, output: 0.0003, unit: 'per_1k_tokens' }
            }
        };

        // Check for custom negotiated rates
        const { data: customRates } = await resilientSupabase
            .from('rate_cards')
            .select('*')
            .eq('organization_id', this.organizationId)
            .eq('provider', provider);

        const baseRates = rateCards[provider] || {};

        // Override with custom rates if they exist
        if (customRates?.length) {
            customRates.forEach(rate => {
                baseRates[rate.model] = {
                    input: rate.input_rate,
                    output: rate.output_rate,
                    unit: rate.unit
                };
            });
        }

        return baseRates;
    }

    /**
     * THE MAGIC: 3-Way Match
     * Invoice vs Usage vs Rate Cards
     */
    async threeWayMatch(invoice, usage, rateCards) {
        const discrepancies = [];
        let calculatedTotal = 0;

        // Match each invoice line item
        for (const lineItem of invoice.line_items) {
            const model = lineItem.model;
            const usageForModel = usage.by_model.find(u => u.model === model);
            const rateCard = rateCards[model];

            // Calculate expected cost from usage + rates
            let expectedCost = 0;
            if (usageForModel && rateCard) {
                if (rateCard.unit === 'per_1k_tokens') {
                    expectedCost =
                        (usageForModel.input_tokens / 1000 * rateCard.input) +
                        (usageForModel.output_tokens / 1000 * rateCard.output);
                } else if (rateCard.unit === 'per_request') {
                    expectedCost = usageForModel.requests * rateCard.rate;
                }
            }

            calculatedTotal += expectedCost;

            // Check for discrepancies
            const variance = lineItem.amount - expectedCost;
            const variancePercent = expectedCost > 0
                ? Math.abs(variance / expectedCost)
                : (lineItem.amount > 0 ? 1 : 0);

            if (Math.abs(variancePercent) > this.tolerancePercent) {
                discrepancies.push({
                    type: this.classifyDiscrepancy(variance, lineItem, usageForModel, rateCard),
                    model,
                    invoice_amount: lineItem.amount,
                    calculated_amount: expectedCost,
                    variance,
                    variance_percent: (variancePercent * 100).toFixed(2) + '%',
                    details: this.getDiscrepancyDetails(
                        lineItem,
                        usageForModel,
                        rateCard,
                        variance
                    )
                });
            }
        }

        const totalVariance = invoice.total - calculatedTotal;
        const totalVariancePercent = calculatedTotal > 0
            ? Math.abs(totalVariance / calculatedTotal)
            : 0;

        return {
            status: discrepancies.length === 0 ? 'MATCHED' :
                    discrepancies.some(d => d.type === 'OVERCHARGE') ? 'DISPUTE_RECOMMENDED' :
                    'REVIEW_REQUIRED',
            invoice_total: invoice.total,
            calculated_total: calculatedTotal,
            variance: totalVariance,
            variance_percent: (totalVariancePercent * 100).toFixed(2) + '%',
            discrepancies,
            line_item_matches: invoice.line_items.length - discrepancies.length,
            total_line_items: invoice.line_items.length
        };
    }

    /**
     * Classify the type of discrepancy
     */
    classifyDiscrepancy(variance, lineItem, usage, rateCard) {
        if (variance > 0) {
            if (!usage) return 'PHANTOM_CHARGE'; // Charged for usage we don't have
            if (!rateCard) return 'UNKNOWN_RATE';
            return 'OVERCHARGE';
        } else {
            return 'UNDERCHARGE'; // Rare but happens with credits
        }
    }

    /**
     * Get detailed discrepancy explanation
     */
    getDiscrepancyDetails(lineItem, usage, rateCard, variance) {
        const details = [];

        if (!usage) {
            details.push(`No usage records found for model ${lineItem.model}`);
            details.push(`Invoice claims: ${lineItem.quantity} ${lineItem.unit}`);
        } else if (!rateCard) {
            details.push(`No rate card found for model ${lineItem.model}`);
            details.push(`Using invoice unit price: $${lineItem.unit_price}`);
        } else {
            details.push(`Invoice: ${lineItem.quantity} ${lineItem.unit} @ $${lineItem.unit_price}`);
            details.push(`Usage: ${usage.total_tokens} tokens (${usage.input_tokens} in / ${usage.output_tokens} out)`);
            details.push(`Rate card: $${rateCard.input}/1K input, $${rateCard.output}/1K output`);
        }

        if (variance > 0) {
            details.push(`⚠️ You may be overcharged by $${variance.toFixed(2)}`);
        }

        return details;
    }

    /**
     * Generate GL Entries for the invoice
     * JOBS: Make the complex simple
     */
    async generateGLEntries(invoice, matchResult) {
        // Get GL account mapping
        const glMapping = await this.getGLMapping();

        const entries = [];
        const journalId = `JE-${this.reconciliationId.slice(0, 8)}`;
        const postingDate = new Date().toISOString().split('T')[0];

        // Main expense entry
        entries.push({
            journal_id: journalId,
            line: 1,
            posting_date: postingDate,
            account_code: glMapping.ai_expense,
            account_name: 'AI/ML Services Expense',
            debit: matchResult.calculated_total,
            credit: 0,
            description: `${invoice.provider} - ${invoice.invoice_number}`,
            period: invoice.period_end.slice(0, 7), // YYYY-MM
            department: 'Technology',
            cost_center: 'AI Infrastructure'
        });

        // If there's a variance, book it separately
        if (matchResult.variance !== 0) {
            if (matchResult.variance > 0) {
                // Disputed amount - goes to receivables or variance account
                entries.push({
                    journal_id: journalId,
                    line: 2,
                    posting_date: postingDate,
                    account_code: glMapping.variance,
                    account_name: 'AI Invoice Variance',
                    debit: matchResult.variance,
                    credit: 0,
                    description: `Disputed variance - ${invoice.invoice_number}`,
                    period: invoice.period_end.slice(0, 7),
                    department: 'Finance',
                    cost_center: 'Variance Analysis'
                });
            } else {
                // Credit variance - rare
                entries.push({
                    journal_id: journalId,
                    line: 2,
                    posting_date: postingDate,
                    account_code: glMapping.variance,
                    account_name: 'AI Invoice Variance',
                    debit: 0,
                    credit: Math.abs(matchResult.variance),
                    description: `Credit variance - ${invoice.invoice_number}`,
                    period: invoice.period_end.slice(0, 7),
                    department: 'Finance',
                    cost_center: 'Variance Analysis'
                });
            }
        }

        // Credit to AP
        entries.push({
            journal_id: journalId,
            line: entries.length + 1,
            posting_date: postingDate,
            account_code: glMapping.accounts_payable,
            account_name: 'Accounts Payable - AI Vendors',
            debit: 0,
            credit: invoice.total,
            description: `${invoice.provider} - ${invoice.invoice_number}`,
            period: invoice.period_end.slice(0, 7),
            vendor: invoice.provider,
            invoice_number: invoice.invoice_number
        });

        // Validate entries balance
        const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0);
        const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0);

        if (Math.abs(totalDebit - totalCredit) > 0.01) {
            throw new Error(`GL entries don't balance: Debit ${totalDebit} != Credit ${totalCredit}`);
        }

        return {
            journal_id: journalId,
            posting_date: postingDate,
            entries,
            total_debit: totalDebit,
            total_credit: totalCredit,
            balanced: true,
            ready_for_posting: matchResult.status === 'MATCHED'
        };
    }

    /**
     * Get GL account mapping
     */
    async getGLMapping() {
        // Check for custom mapping
        const { data: customMapping } = await resilientSupabase
            .from('gl_mappings')
            .select('*')
            .eq('organization_id', this.organizationId)
            .single();

        if (customMapping) {
            return customMapping;
        }

        // Default mapping (common chart of accounts)
        return {
            ai_expense: '6200-100',      // Operating Expenses > Technology > AI Services
            variance: '6200-199',         // Operating Expenses > Technology > Variance
            accounts_payable: '2000-100', // Current Liabilities > AP > Vendors
            prepaid: '1300-100'           // Current Assets > Prepaid Expenses
        };
    }

    /**
     * Create immutable audit trail
     */
    async createAuditTrail(data) {
        const record = {
            reconciliation_id: data.reconciliationId,
            organization_id: this.organizationId,
            timestamp: new Date().toISOString(),
            invoice_number: data.invoice.invoice_number,
            provider: data.invoice.provider,
            period_start: data.invoice.period_start,
            period_end: data.invoice.period_end,
            invoice_total: data.invoice.total,
            calculated_total: data.matchResult.calculated_total,
            variance: data.matchResult.variance,
            status: data.matchResult.status,
            discrepancies_count: data.matchResult.discrepancies.length,
            gl_journal_id: data.glEntries.journal_id,
            processing_time_ms: data.duration_ms
        };

        // Create SHA-256 hash for integrity
        const hash = crypto
            .createHash('sha256')
            .update(JSON.stringify(record))
            .digest('hex');

        record.hash = hash;

        // Store in audit log
        await resilientSupabase.from('reconciliation_audit_log').insert(record);

        // Also store full details for forensics
        await resilientSupabase.from('reconciliation_details').insert({
            reconciliation_id: data.reconciliationId,
            full_data: JSON.stringify(data),
            hash
        });

        return { hash, timestamp: record.timestamp };
    }

    /**
     * Generate recommendation based on match result
     */
    getRecommendation(matchResult) {
        switch (matchResult.status) {
            case 'MATCHED':
                return {
                    action: 'APPROVE_FOR_PAYMENT',
                    message: 'Invoice matches usage within tolerance. Safe to pay.',
                    urgency: 'normal'
                };

            case 'DISPUTE_RECOMMENDED':
                const overcharges = matchResult.discrepancies
                    .filter(d => d.type === 'OVERCHARGE')
                    .reduce((sum, d) => sum + d.variance, 0);
                return {
                    action: 'DISPUTE_WITH_VENDOR',
                    message: `Potential overcharge of $${overcharges.toFixed(2)} detected. Contact vendor.`,
                    urgency: 'high',
                    dispute_amount: overcharges,
                    talking_points: matchResult.discrepancies
                        .filter(d => d.type === 'OVERCHARGE')
                        .map(d => d.details)
                };

            case 'REVIEW_REQUIRED':
                return {
                    action: 'MANUAL_REVIEW',
                    message: 'Variances detected that require human review.',
                    urgency: 'medium',
                    review_items: matchResult.discrepancies
                };

            default:
                return {
                    action: 'ESCALATE',
                    message: 'Unable to determine recommendation.',
                    urgency: 'high'
                };
        }
    }

    /**
     * Batch reconcile multiple invoices
     */
    async batchReconcile(invoices) {
        const results = [];

        for (const invoice of invoices) {
            try {
                const result = await this.reconcile(invoice);
                results.push(result);
            } catch (error) {
                results.push({
                    success: false,
                    invoice: invoice.invoice_number || 'unknown',
                    error: error.message
                });
            }
        }

        return {
            total: invoices.length,
            matched: results.filter(r => r.status === 'MATCHED').length,
            disputes: results.filter(r => r.status === 'DISPUTE_RECOMMENDED').length,
            reviews: results.filter(r => r.status === 'REVIEW_REQUIRED').length,
            failed: results.filter(r => !r.success).length,
            total_variance: results
                .filter(r => r.success)
                .reduce((sum, r) => sum + (r.summary?.variance || 0), 0),
            results
        };
    }
}

export default InvoiceReconciliationAgent;
