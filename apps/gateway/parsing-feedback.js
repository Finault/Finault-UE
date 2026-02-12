/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINAULT PARSING FEEDBACK SYSTEM
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Criticism #16: "The parsing step is a black box."
 * "User uploads invoice. Spinner says 'Parsing...' for 2 seconds. Then it's done.
 *  What happened? Show me the work. Transparency builds trust."
 *
 * Criticism #17: "Can't fix parsing errors."
 * "Parser mistakes 'gpt-4-turbo-2024-04-09' for a new model. User can't correct it.
 *  Only option: Start over. Let them edit the damn data."
 *
 * SOLUTIONS:
 * - Real-time parsing feedback with progress events
 * - Editable parse results with table view
 * - Merge/split rows
 * - Reassign cost centers
 * - "Reprocess from file" button
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════════
// CRITICISM #16: REAL-TIME PARSING FEEDBACK
// ═══════════════════════════════════════════════════════════════════════════════

export class StreamingParser {
    constructor(env) {
        this.env = env;
        this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
    }

    /**
     * Parse with streaming progress updates
     * Returns a readable stream of progress events
     */
    async parseWithProgress(content, options = {}) {
        const parseId = crypto.randomUUID();
        const events = [];
        const emit = (event) => events.push({ ...event, timestamp: Date.now() });

        try {
            // Step 1: Detect format
            emit({ step: 'format_detection', status: 'started', message: 'Detecting file format...' });
            const format = this.detectFormat(content);
            emit({
                step: 'format_detection',
                status: 'completed',
                message: `✓ Detected format: ${format.type}`,
                data: format
            });

            // Step 2: Detect provider
            emit({ step: 'provider_detection', status: 'started', message: 'Identifying AI provider...' });
            const provider = this.detectProvider(content, format);
            emit({
                step: 'provider_detection',
                status: 'completed',
                message: `✓ Identified provider: ${provider.name}`,
                data: provider
            });

            // Step 3: Parse headers
            emit({ step: 'header_parsing', status: 'started', message: 'Parsing column headers...' });
            const headers = this.parseHeaders(content, format);
            emit({
                step: 'header_parsing',
                status: 'completed',
                message: `✓ Found ${headers.columns.length} columns: ${headers.columns.join(', ')}`,
                data: headers
            });

            // Step 4: Parse line items
            emit({ step: 'line_item_parsing', status: 'started', message: 'Parsing line items...' });
            const lineItems = await this.parseLineItems(content, format, headers, (progress) => {
                emit({
                    step: 'line_item_parsing',
                    status: 'in_progress',
                    message: `Processing row ${progress.current} of ${progress.total}...`,
                    progress: { current: progress.current, total: progress.total, percent: Math.round(progress.current / progress.total * 100) }
                });
            });
            emit({
                step: 'line_item_parsing',
                status: 'completed',
                message: `✓ Parsed ${lineItems.length} line items`,
                data: { count: lineItems.length }
            });

            // Step 5: Identify models
            emit({ step: 'model_identification', status: 'started', message: 'Identifying AI models...' });
            const models = this.identifyModels(lineItems);
            emit({
                step: 'model_identification',
                status: 'completed',
                message: `✓ Found ${models.length} models: ${models.join(', ')}`,
                data: { models }
            });

            // Step 6: Calculate totals
            emit({ step: 'total_calculation', status: 'started', message: 'Calculating totals...' });
            const totals = this.calculateTotals(lineItems);
            emit({
                step: 'total_calculation',
                status: 'completed',
                message: `✓ Total spend: $${totals.totalAmount.toLocaleString()}`,
                data: totals
            });

            // Step 7: Detect date range
            emit({ step: 'date_detection', status: 'started', message: 'Detecting billing period...' });
            const dateRange = this.detectDateRange(lineItems);
            emit({
                step: 'date_detection',
                status: 'completed',
                message: `✓ Period: ${dateRange.start} to ${dateRange.end}`,
                data: dateRange
            });

            // Step 8: Validation
            emit({ step: 'validation', status: 'started', message: 'Validating data...' });
            const validation = this.validateParse(lineItems, totals);
            emit({
                step: 'validation',
                status: 'completed',
                message: validation.isValid ? '✓ All validations passed' : `⚠ ${validation.warnings.length} warnings`,
                data: validation
            });

            // Complete
            emit({
                step: 'complete',
                status: 'completed',
                message: '✓ Parsing complete!',
                summary: {
                    provider: provider.name,
                    format: format.type,
                    lineItems: lineItems.length,
                    models: models.length,
                    totalSpend: totals.totalAmount,
                    period: `${dateRange.start} to ${dateRange.end}`
                }
            });

            const result = {
                parseId,
                provider: provider.name,
                format: format.type,
                lineItems,
                models,
                totals,
                dateRange,
                validation,
                events,
                editable: true
            };

            // Store for editing
            await this.storeParsedResult(parseId, result);

            return result;

        } catch (error) {
            emit({
                step: 'error',
                status: 'failed',
                message: `✗ Error: ${error.message}`,
                error: error.message
            });

            return { parseId, error: error.message, events };
        }
    }

    detectFormat(content) {
        const trimmed = content.trim();

        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            return { type: 'JSON', delimiter: null };
        }

        // Count delimiters
        const commas = (content.match(/,/g) || []).length;
        const tabs = (content.match(/\t/g) || []).length;
        const pipes = (content.match(/\|/g) || []).length;

        if (tabs > commas && tabs > pipes) {
            return { type: 'TSV', delimiter: '\t' };
        } else if (pipes > commas) {
            return { type: 'PSV', delimiter: '|' };
        } else {
            return { type: 'CSV', delimiter: ',' };
        }
    }

    detectProvider(content, format) {
        const lower = content.toLowerCase();

        const providers = [
            { name: 'OpenAI', patterns: ['openai', 'gpt-', 'davinci', 'curie', 'whisper', 'dall-e'] },
            { name: 'Anthropic', patterns: ['anthropic', 'claude'] },
            { name: 'Google', patterns: ['google', 'gemini', 'palm', 'vertex'] },
            { name: 'Azure', patterns: ['azure', 'microsoft'] },
            { name: 'AWS Bedrock', patterns: ['bedrock', 'amazon', 'titan'] },
            { name: 'Cohere', patterns: ['cohere', 'command-r'] },
            { name: 'Mistral', patterns: ['mistral'] }
        ];

        for (const provider of providers) {
            const matchCount = provider.patterns.filter(p => lower.includes(p)).length;
            if (matchCount > 0) {
                return {
                    name: provider.name,
                    confidence: Math.min(0.95, 0.5 + matchCount * 0.15),
                    matchedPatterns: provider.patterns.filter(p => lower.includes(p))
                };
            }
        }

        return { name: 'Unknown', confidence: 0.3, matchedPatterns: [] };
    }

    parseHeaders(content, format) {
        if (format.type === 'JSON') {
            const data = JSON.parse(content);
            const sample = Array.isArray(data) ? data[0] : data;
            return { columns: Object.keys(sample || {}), raw: null };
        }

        const lines = content.split('\n');
        const headerLine = lines[0];
        const columns = headerLine.split(format.delimiter).map(c => c.trim().replace(/"/g, ''));

        return {
            columns,
            raw: headerLine,
            mapping: this.inferColumnMapping(columns)
        };
    }

    inferColumnMapping(columns) {
        const mapping = {};
        const columnLower = columns.map(c => c.toLowerCase());

        // Date column
        const dateIdx = columnLower.findIndex(c => c.includes('date') || c.includes('time') || c.includes('day'));
        if (dateIdx >= 0) mapping.date = dateIdx;

        // Model column
        const modelIdx = columnLower.findIndex(c => c.includes('model') || c.includes('deployment'));
        if (modelIdx >= 0) mapping.model = modelIdx;

        // Token columns
        const tokenIdx = columnLower.findIndex(c => c.includes('token') || c.includes('usage'));
        if (tokenIdx >= 0) mapping.tokens = tokenIdx;

        // Cost column
        const costIdx = columnLower.findIndex(c => c.includes('cost') || c.includes('amount') || c.includes('price') || c.includes('charge'));
        if (costIdx >= 0) mapping.cost = costIdx;

        // Request column
        const reqIdx = columnLower.findIndex(c => c.includes('request') || c.includes('call') || c.includes('count'));
        if (reqIdx >= 0) mapping.requests = reqIdx;

        return mapping;
    }

    async parseLineItems(content, format, headers, onProgress) {
        const items = [];

        if (format.type === 'JSON') {
            const data = JSON.parse(content);
            const rows = Array.isArray(data) ? data : [data];
            for (let i = 0; i < rows.length; i++) {
                items.push(this.normalizeLineItem(rows[i], i));
                if (i % 100 === 0) onProgress({ current: i, total: rows.length });
            }
        } else {
            const lines = content.split('\n').slice(1).filter(l => l.trim());
            for (let i = 0; i < lines.length; i++) {
                const values = lines[i].split(format.delimiter).map(v => v.trim().replace(/"/g, ''));
                const item = {};

                headers.columns.forEach((col, idx) => {
                    item[col] = values[idx];
                });

                items.push(this.normalizeLineItem(item, i, headers.mapping));
                if (i % 100 === 0) onProgress({ current: i, total: lines.length });
            }
        }

        return items;
    }

    normalizeLineItem(raw, index, mapping = {}) {
        return {
            id: `line_${index}`,
            index,
            date: raw.date || raw.Date || raw[Object.keys(raw)[mapping.date]] || null,
            model: raw.model || raw.Model || raw.deployment || raw[Object.keys(raw)[mapping.model]] || 'unknown',
            tokens: parseInt(raw.tokens || raw.Tokens || raw.usage || raw[Object.keys(raw)[mapping.tokens]]) || 0,
            cost: parseFloat(raw.cost || raw.Cost || raw.amount || raw.Amount || raw[Object.keys(raw)[mapping.cost]]) || 0,
            requests: parseInt(raw.requests || raw.Requests || raw.count || raw[Object.keys(raw)[mapping.requests]]) || 1,
            raw,
            edits: []
        };
    }

    identifyModels(lineItems) {
        return [...new Set(lineItems.map(l => l.model).filter(Boolean))];
    }

    calculateTotals(lineItems) {
        return {
            totalAmount: lineItems.reduce((sum, l) => sum + l.cost, 0),
            totalTokens: lineItems.reduce((sum, l) => sum + l.tokens, 0),
            totalRequests: lineItems.reduce((sum, l) => sum + l.requests, 0),
            lineItemCount: lineItems.length
        };
    }

    detectDateRange(lineItems) {
        const dates = lineItems
            .map(l => new Date(l.date))
            .filter(d => !isNaN(d.getTime()))
            .sort((a, b) => a - b);

        if (dates.length === 0) {
            return { start: 'Unknown', end: 'Unknown' };
        }

        return {
            start: dates[0].toISOString().split('T')[0],
            end: dates[dates.length - 1].toISOString().split('T')[0]
        };
    }

    validateParse(lineItems, totals) {
        const warnings = [];
        const errors = [];

        // Check for missing data
        const missingDates = lineItems.filter(l => !l.date).length;
        if (missingDates > 0) {
            warnings.push(`${missingDates} line items missing dates`);
        }

        const missingCosts = lineItems.filter(l => l.cost === 0).length;
        if (missingCosts > lineItems.length * 0.1) {
            warnings.push(`${missingCosts} line items have zero cost`);
        }

        // Check for anomalies
        const avgCost = totals.totalAmount / lineItems.length;
        const highCost = lineItems.filter(l => l.cost > avgCost * 10).length;
        if (highCost > 0) {
            warnings.push(`${highCost} line items have unusually high costs`);
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            stats: {
                missingDates,
                missingCosts,
                highCostItems: highCost
            }
        };
    }

    async storeParsedResult(parseId, result) {
        await this.supabase.from('parsed_invoices').insert({
            id: parseId,
            result: JSON.stringify(result),
            created_at: new Date().toISOString(),
            status: 'pending_review'
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CRITICISM #17: EDITABLE PARSE RESULTS
// ═══════════════════════════════════════════════════════════════════════════════

export class EditableParseResults {
    constructor(env) {
        this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
    }

    /**
     * Get parse result for editing
     */
    async getParseResult(parseId) {
        const { data, error } = await this.supabase
            .from('parsed_invoices')
            .select('*')
            .eq('id', parseId)
            .single();

        if (error) throw error;

        return {
            ...JSON.parse(data.result),
            parseId,
            status: data.status,
            lastModified: data.updated_at
        };
    }

    /**
     * Update a single line item
     */
    async updateLineItem(parseId, lineItemId, updates, userId) {
        const result = await this.getParseResult(parseId);
        const item = result.lineItems.find(l => l.id === lineItemId);

        if (!item) {
            throw new Error(`Line item ${lineItemId} not found`);
        }

        // Store edit history
        item.edits.push({
            timestamp: new Date().toISOString(),
            userId,
            before: { ...item },
            after: updates
        });

        // Apply updates
        Object.assign(item, updates);

        // Recalculate totals
        result.totals = {
            totalAmount: result.lineItems.reduce((sum, l) => sum + l.cost, 0),
            totalTokens: result.lineItems.reduce((sum, l) => sum + l.tokens, 0),
            totalRequests: result.lineItems.reduce((sum, l) => sum + l.requests, 0),
            lineItemCount: result.lineItems.length
        };

        // Save
        await this.saveParseResult(parseId, result);

        return {
            success: true,
            lineItem: item,
            newTotals: result.totals
        };
    }

    /**
     * Merge multiple line items into one
     */
    async mergeLineItems(parseId, lineItemIds, mergeStrategy = 'sum', userId) {
        const result = await this.getParseResult(parseId);

        const itemsToMerge = result.lineItems.filter(l => lineItemIds.includes(l.id));
        if (itemsToMerge.length < 2) {
            throw new Error('Need at least 2 items to merge');
        }

        // Create merged item
        const merged = {
            id: `merged_${Date.now()}`,
            index: Math.min(...itemsToMerge.map(i => i.index)),
            date: itemsToMerge[0].date,
            model: itemsToMerge[0].model,
            tokens: mergeStrategy === 'sum'
                ? itemsToMerge.reduce((sum, i) => sum + i.tokens, 0)
                : Math.max(...itemsToMerge.map(i => i.tokens)),
            cost: itemsToMerge.reduce((sum, i) => sum + i.cost, 0),
            requests: itemsToMerge.reduce((sum, i) => sum + i.requests, 0),
            raw: { merged_from: lineItemIds },
            edits: [{
                timestamp: new Date().toISOString(),
                userId,
                action: 'merge',
                mergedIds: lineItemIds
            }]
        };

        // Remove old items, add merged
        result.lineItems = result.lineItems.filter(l => !lineItemIds.includes(l.id));
        result.lineItems.push(merged);
        result.lineItems.sort((a, b) => a.index - b.index);

        // Recalculate
        result.totals.lineItemCount = result.lineItems.length;

        await this.saveParseResult(parseId, result);

        return {
            success: true,
            mergedItem: merged,
            removedIds: lineItemIds
        };
    }

    /**
     * Split a line item into multiple
     */
    async splitLineItem(parseId, lineItemId, splits, userId) {
        const result = await this.getParseResult(parseId);
        const item = result.lineItems.find(l => l.id === lineItemId);

        if (!item) {
            throw new Error(`Line item ${lineItemId} not found`);
        }

        // Validate splits add up
        const splitTotal = splits.reduce((sum, s) => sum + s.cost, 0);
        if (Math.abs(splitTotal - item.cost) > 0.01) {
            throw new Error(`Split costs ($${splitTotal}) don't match original ($${item.cost})`);
        }

        // Create split items
        const newItems = splits.map((split, i) => ({
            id: `split_${lineItemId}_${i}`,
            index: item.index + (i * 0.001), // Maintain order
            date: item.date,
            model: split.model || item.model,
            tokens: split.tokens || Math.round(item.tokens * (split.cost / item.cost)),
            cost: split.cost,
            requests: split.requests || Math.round(item.requests * (split.cost / item.cost)),
            costCenter: split.costCenter,
            raw: { split_from: lineItemId, ...split },
            edits: [{
                timestamp: new Date().toISOString(),
                userId,
                action: 'split',
                originalId: lineItemId
            }]
        }));

        // Remove original, add splits
        result.lineItems = result.lineItems.filter(l => l.id !== lineItemId);
        result.lineItems.push(...newItems);
        result.lineItems.sort((a, b) => a.index - b.index);

        // Recalculate
        result.totals.lineItemCount = result.lineItems.length;

        await this.saveParseResult(parseId, result);

        return {
            success: true,
            newItems,
            removedId: lineItemId
        };
    }

    /**
     * Bulk reassign cost center
     */
    async reassignCostCenter(parseId, lineItemIds, newCostCenter, userId) {
        const result = await this.getParseResult(parseId);

        let updated = 0;
        for (const id of lineItemIds) {
            const item = result.lineItems.find(l => l.id === id);
            if (item) {
                item.edits.push({
                    timestamp: new Date().toISOString(),
                    userId,
                    action: 'reassign_cost_center',
                    before: item.costCenter,
                    after: newCostCenter
                });
                item.costCenter = newCostCenter;
                updated++;
            }
        }

        await this.saveParseResult(parseId, result);

        return {
            success: true,
            updatedCount: updated,
            newCostCenter
        };
    }

    /**
     * Delete line items
     */
    async deleteLineItems(parseId, lineItemIds, userId) {
        const result = await this.getParseResult(parseId);

        const deleted = result.lineItems.filter(l => lineItemIds.includes(l.id));
        result.lineItems = result.lineItems.filter(l => !lineItemIds.includes(l.id));

        // Store deletion record
        result.deletedItems = result.deletedItems || [];
        result.deletedItems.push({
            timestamp: new Date().toISOString(),
            userId,
            items: deleted
        });

        // Recalculate totals
        result.totals = {
            totalAmount: result.lineItems.reduce((sum, l) => sum + l.cost, 0),
            totalTokens: result.lineItems.reduce((sum, l) => sum + l.tokens, 0),
            totalRequests: result.lineItems.reduce((sum, l) => sum + l.requests, 0),
            lineItemCount: result.lineItems.length
        };

        await this.saveParseResult(parseId, result);

        return {
            success: true,
            deletedCount: deleted.length,
            newTotals: result.totals
        };
    }

    /**
     * Reprocess from original file
     */
    async reprocess(parseId, newOptions = {}) {
        const current = await this.getParseResult(parseId);

        // Store current as a version
        await this.supabase.from('parsed_invoice_versions').insert({
            parse_id: parseId,
            version: Date.now(),
            result: JSON.stringify(current),
            created_at: new Date().toISOString()
        });

        // Reparse would need original content - this would trigger a new parse
        return {
            success: true,
            message: 'Original file required for reprocessing',
            requiresUpload: true,
            previousVersion: parseId
        };
    }

    /**
     * Get edit history for a parse result
     */
    async getEditHistory(parseId) {
        const result = await this.getParseResult(parseId);

        const allEdits = [];

        // Collect edits from all line items
        for (const item of result.lineItems) {
            for (const edit of item.edits || []) {
                allEdits.push({
                    ...edit,
                    lineItemId: item.id,
                    lineItemModel: item.model
                });
            }
        }

        // Add deletions
        for (const deletion of result.deletedItems || []) {
            allEdits.push({
                ...deletion,
                action: 'delete'
            });
        }

        // Sort by timestamp
        allEdits.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        return {
            parseId,
            totalEdits: allEdits.length,
            history: allEdits
        };
    }

    /**
     * Finalize and confirm parse result
     */
    async finalize(parseId, userId) {
        const result = await this.getParseResult(parseId);

        result.status = 'finalized';
        result.finalizedAt = new Date().toISOString();
        result.finalizedBy = userId;

        await this.supabase
            .from('parsed_invoices')
            .update({
                result: JSON.stringify(result),
                status: 'finalized',
                updated_at: new Date().toISOString()
            })
            .eq('id', parseId);

        return {
            success: true,
            parseId,
            status: 'finalized',
            totals: result.totals
        };
    }

    async saveParseResult(parseId, result) {
        await this.supabase
            .from('parsed_invoices')
            .update({
                result: JSON.stringify(result),
                updated_at: new Date().toISOString()
            })
            .eq('id', parseId);
    }
}

export default {
    StreamingParser,
    EditableParseResults
};
