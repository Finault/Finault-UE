/**
 * FINAULT MULTI-PROVIDER INVOICE PARSERS v1.0
 * ═══════════════════════════════════════════════════════════════════
 * Auto-detect and parse invoices from any AI provider
 *
 * Supported Providers:
 * - OpenAI (CSV export)
 * - Anthropic (CSV export)
 * - Azure OpenAI (Cost export)
 * - Google Vertex AI (BigQuery export)
 * - AWS Bedrock (Cost and Usage Report)
 * - Cohere (CSV export)
 * - Together AI (CSV export)
 * ═══════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════
// NORMALIZED INVOICE FORMAT
// ═══════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} NormalizedInvoice
 * @property {string} provider - Provider name (openai, anthropic, etc.)
 * @property {string} invoiceId - Invoice reference number
 * @property {Date} periodStart - Billing period start
 * @property {Date} periodEnd - Billing period end
 * @property {number} totalAmount - Total invoice amount
 * @property {string} currency - Currency code (USD, EUR, etc.)
 * @property {NormalizedLineItem[]} lineItems - Individual line items
 * @property {ModelBreakdown} modelBreakdown - Usage by model
 * @property {Object} metadata - Additional provider-specific data
 */

/**
 * @typedef {Object} NormalizedLineItem
 * @property {Date} date - Transaction date
 * @property {string} model - Model name (normalized)
 * @property {number} inputTokens - Input/prompt tokens
 * @property {number} outputTokens - Output/completion tokens
 * @property {number} amount - Cost in billing currency
 * @property {string} costCenter - Cost center (if tagged)
 * @property {string} project - Project name (if tagged)
 */

// ═══════════════════════════════════════════════════════════════════
// MODEL NORMALIZATION MAP
// ═══════════════════════════════════════════════════════════════════

const MODEL_NORMALIZATION = {
    // OpenAI
    'gpt-4': 'gpt-4',
    'gpt-4-turbo': 'gpt-4-turbo',
    'gpt-4-turbo-preview': 'gpt-4-turbo',
    'gpt-4-0125-preview': 'gpt-4-turbo',
    'gpt-4-1106-preview': 'gpt-4-turbo',
    'gpt-4o': 'gpt-4o',
    'gpt-4o-2024-05-13': 'gpt-4o',
    'gpt-4o-2024-08-06': 'gpt-4o',
    'gpt-4o-mini': 'gpt-4o-mini',
    'gpt-4o-mini-2024-07-18': 'gpt-4o-mini',
    'gpt-3.5-turbo': 'gpt-3.5-turbo',
    'gpt-3.5-turbo-0125': 'gpt-3.5-turbo',
    'o1': 'o1',
    'o1-preview': 'o1',
    'o1-mini': 'o1-mini',

    // Anthropic
    'claude-3-opus-20240229': 'claude-3-opus',
    'claude-3-sonnet-20240229': 'claude-3-sonnet',
    'claude-3-haiku-20240307': 'claude-3-haiku',
    'claude-3-5-sonnet-20240620': 'claude-3.5-sonnet',
    'claude-3-5-sonnet-20241022': 'claude-3.5-sonnet',
    'claude-3-5-haiku-20241022': 'claude-3.5-haiku',
    'claude-2.1': 'claude-2.1',
    'claude-2.0': 'claude-2',
    'claude-instant-1.2': 'claude-instant',

    // Azure OpenAI (deployment names vary, but often include model)
    'gpt-4-deployment': 'gpt-4',
    'gpt-35-turbo': 'gpt-3.5-turbo',

    // Vertex AI
    'gemini-1.5-pro': 'gemini-1.5-pro',
    'gemini-1.5-flash': 'gemini-1.5-flash',
    'gemini-1.0-pro': 'gemini-1.0-pro',
    'gemini-pro': 'gemini-1.0-pro',

    // AWS Bedrock
    'anthropic.claude-3-opus': 'claude-3-opus',
    'anthropic.claude-3-sonnet': 'claude-3-sonnet',
    'anthropic.claude-3-haiku': 'claude-3-haiku',
    'amazon.titan-text-express': 'titan-text-express',
    'amazon.titan-text-lite': 'titan-text-lite',
    'meta.llama3-70b-instruct': 'llama-3-70b',
    'meta.llama3-8b-instruct': 'llama-3-8b',
    'mistral.mistral-large': 'mistral-large',
    'mistral.mixtral-8x7b': 'mixtral-8x7b',

    // Cohere
    'command': 'command',
    'command-light': 'command-light',
    'command-r': 'command-r',
    'command-r-plus': 'command-r-plus',

    // Together AI
    'mistralai/Mixtral-8x7B-Instruct-v0.1': 'mixtral-8x7b',
    'meta-llama/Llama-3-70b-chat-hf': 'llama-3-70b',
    'meta-llama/Llama-3-8b-chat-hf': 'llama-3-8b',
};

function normalizeModelName(model) {
    return MODEL_NORMALIZATION[model] || model.toLowerCase().replace(/[-_]/g, '-');
}

// ═══════════════════════════════════════════════════════════════════
// PROVIDER DETECTION
// ═══════════════════════════════════════════════════════════════════

function detectProvider(csvContent) {
    const headerLine = csvContent.split('\n')[0].toLowerCase();

    // OpenAI detection
    if (headerLine.includes('organization') && headerLine.includes('prompt_tokens') && headerLine.includes('completion_tokens')) {
        return 'openai';
    }

    // Anthropic detection
    if (headerLine.includes('model') && headerLine.includes('input_tokens') && headerLine.includes('output_tokens')) {
        return 'anthropic';
    }

    // Azure OpenAI detection
    if (headerLine.includes('resourcegroup') && (headerLine.includes('openai') || headerLine.includes('cognitiveservices'))) {
        return 'azure-openai';
    }

    // Google Vertex AI detection
    if (headerLine.includes('usage_date') && (headerLine.includes('vertex') || headerLine.includes('aiplatform'))) {
        return 'vertex-ai';
    }

    // AWS Bedrock detection
    if (headerLine.includes('lineitem/blendedcost') && headerLine.includes('bedrock')) {
        return 'aws-bedrock';
    }

    // Cohere detection
    if (headerLine.includes('api_key') && headerLine.includes('tokens_generated')) {
        return 'cohere';
    }

    // Together AI detection
    if (headerLine.includes('model_id') && headerLine.includes('total_price')) {
        return 'together-ai';
    }

    return 'unknown';
}

// ═══════════════════════════════════════════════════════════════════
// OPENAI PARSER
// ═══════════════════════════════════════════════════════════════════

function parseOpenAI(csvContent) {
    const lines = csvContent.trim().split('\n');
    const headers = parseCSVLine(lines[0]);

    const colIndex = {
        timestamp: headers.indexOf('timestamp') !== -1 ? headers.indexOf('timestamp') : headers.indexOf('date'),
        model: headers.indexOf('model'),
        inputTokens: headers.indexOf('prompt_tokens') !== -1 ? headers.indexOf('prompt_tokens') : headers.indexOf('input_tokens'),
        outputTokens: headers.indexOf('completion_tokens') !== -1 ? headers.indexOf('completion_tokens') : headers.indexOf('output_tokens'),
        cost: headers.indexOf('cost') !== -1 ? headers.indexOf('cost') : headers.indexOf('amount'),
        user: headers.indexOf('user'),
        organization: headers.indexOf('organization'),
    };

    const lineItems = [];
    let totalAmount = 0;
    const modelBreakdown = {};

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;

        const values = parseCSVLine(lines[i]);
        const model = normalizeModelName(values[colIndex.model] || 'unknown');
        const inputTokens = parseInt(values[colIndex.inputTokens]) || 0;
        const outputTokens = parseInt(values[colIndex.outputTokens]) || 0;
        const amount = parseFloat(values[colIndex.cost]) || 0;

        lineItems.push({
            date: new Date(values[colIndex.timestamp]),
            model,
            inputTokens,
            outputTokens,
            amount,
            costCenter: extractCostCenter(values[colIndex.user]),
            project: null,
        });

        totalAmount += amount;

        if (!modelBreakdown[model]) {
            modelBreakdown[model] = { inputTokens: 0, outputTokens: 0, amount: 0, requests: 0 };
        }
        modelBreakdown[model].inputTokens += inputTokens;
        modelBreakdown[model].outputTokens += outputTokens;
        modelBreakdown[model].amount += amount;
        modelBreakdown[model].requests++;
    }

    const dates = lineItems.map(li => li.date).filter(d => d && !isNaN(d));

    return {
        provider: 'openai',
        invoiceId: `OPENAI-${formatDateShort(new Date())}`,
        periodStart: dates.length > 0 ? new Date(Math.min(...dates)) : new Date(),
        periodEnd: dates.length > 0 ? new Date(Math.max(...dates)) : new Date(),
        totalAmount: Math.round(totalAmount * 100) / 100,
        currency: 'USD',
        lineItems,
        modelBreakdown,
        metadata: {
            rowCount: lineItems.length,
        }
    };
}

// ═══════════════════════════════════════════════════════════════════
// ANTHROPIC PARSER
// ═══════════════════════════════════════════════════════════════════

function parseAnthropic(csvContent) {
    const lines = csvContent.trim().split('\n');
    const headers = parseCSVLine(lines[0]);

    const colIndex = {
        date: findColumnIndex(headers, ['date', 'timestamp', 'time']),
        model: findColumnIndex(headers, ['model', 'model_id']),
        inputTokens: findColumnIndex(headers, ['input_tokens', 'prompt_tokens']),
        outputTokens: findColumnIndex(headers, ['output_tokens', 'completion_tokens']),
        cost: findColumnIndex(headers, ['cost', 'amount', 'total_cost']),
        workspace: findColumnIndex(headers, ['workspace', 'workspace_id']),
    };

    const lineItems = [];
    let totalAmount = 0;
    const modelBreakdown = {};

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;

        const values = parseCSVLine(lines[i]);
        const model = normalizeModelName(values[colIndex.model] || 'unknown');
        const inputTokens = parseInt(values[colIndex.inputTokens]) || 0;
        const outputTokens = parseInt(values[colIndex.outputTokens]) || 0;
        const amount = parseFloat(values[colIndex.cost]) || 0;

        lineItems.push({
            date: new Date(values[colIndex.date]),
            model,
            inputTokens,
            outputTokens,
            amount,
            costCenter: values[colIndex.workspace] || null,
            project: null,
        });

        totalAmount += amount;

        if (!modelBreakdown[model]) {
            modelBreakdown[model] = { inputTokens: 0, outputTokens: 0, amount: 0, requests: 0 };
        }
        modelBreakdown[model].inputTokens += inputTokens;
        modelBreakdown[model].outputTokens += outputTokens;
        modelBreakdown[model].amount += amount;
        modelBreakdown[model].requests++;
    }

    const dates = lineItems.map(li => li.date).filter(d => d && !isNaN(d));

    return {
        provider: 'anthropic',
        invoiceId: `ANTHROPIC-${formatDateShort(new Date())}`,
        periodStart: dates.length > 0 ? new Date(Math.min(...dates)) : new Date(),
        periodEnd: dates.length > 0 ? new Date(Math.max(...dates)) : new Date(),
        totalAmount: Math.round(totalAmount * 100) / 100,
        currency: 'USD',
        lineItems,
        modelBreakdown,
        metadata: {
            rowCount: lineItems.length,
        }
    };
}

// ═══════════════════════════════════════════════════════════════════
// AZURE OPENAI PARSER
// ═══════════════════════════════════════════════════════════════════

function parseAzureOpenAI(csvContent) {
    const lines = csvContent.trim().split('\n');
    const headers = parseCSVLine(lines[0]);

    const colIndex = {
        date: findColumnIndex(headers, ['usagedate', 'date', 'usagedatetime']),
        resourceName: findColumnIndex(headers, ['resourcename', 'resource']),
        meter: findColumnIndex(headers, ['metername', 'meter']),
        quantity: findColumnIndex(headers, ['quantity', 'usagequantity']),
        cost: findColumnIndex(headers, ['cost', 'pretaxcost', 'effectiveprice']),
        resourceGroup: findColumnIndex(headers, ['resourcegroup', 'resource_group']),
        tags: findColumnIndex(headers, ['tags', 'resourcetags']),
    };

    const lineItems = [];
    let totalAmount = 0;
    const modelBreakdown = {};

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;

        const values = parseCSVLine(lines[i]);

        // Extract model from meter name (e.g., "GPT-4 Input Tokens")
        const meterName = values[colIndex.meter] || '';
        const model = extractModelFromAzureMeter(meterName);

        // Determine if input or output tokens
        const isInput = meterName.toLowerCase().includes('input') || meterName.toLowerCase().includes('prompt');
        const quantity = parseFloat(values[colIndex.quantity]) || 0;
        const amount = parseFloat(values[colIndex.cost]) || 0;

        // Parse tags for cost center
        let costCenter = null;
        const tags = values[colIndex.tags];
        if (tags) {
            const costCenterMatch = tags.match(/cost[_-]?center['":\s]+([^'",}]+)/i);
            if (costCenterMatch) costCenter = costCenterMatch[1].trim();
        }

        lineItems.push({
            date: new Date(values[colIndex.date]),
            model,
            inputTokens: isInput ? Math.round(quantity * 1000) : 0, // Azure reports in K tokens
            outputTokens: !isInput ? Math.round(quantity * 1000) : 0,
            amount,
            costCenter: costCenter || values[colIndex.resourceGroup],
            project: values[colIndex.resourceName],
        });

        totalAmount += amount;

        if (!modelBreakdown[model]) {
            modelBreakdown[model] = { inputTokens: 0, outputTokens: 0, amount: 0, requests: 0 };
        }
        modelBreakdown[model].inputTokens += isInput ? Math.round(quantity * 1000) : 0;
        modelBreakdown[model].outputTokens += !isInput ? Math.round(quantity * 1000) : 0;
        modelBreakdown[model].amount += amount;
        modelBreakdown[model].requests++;
    }

    const dates = lineItems.map(li => li.date).filter(d => d && !isNaN(d));

    return {
        provider: 'azure-openai',
        invoiceId: `AZURE-${formatDateShort(new Date())}`,
        periodStart: dates.length > 0 ? new Date(Math.min(...dates)) : new Date(),
        periodEnd: dates.length > 0 ? new Date(Math.max(...dates)) : new Date(),
        totalAmount: Math.round(totalAmount * 100) / 100,
        currency: 'USD',
        lineItems,
        modelBreakdown,
        metadata: {
            rowCount: lineItems.length,
        }
    };
}

function extractModelFromAzureMeter(meterName) {
    const lower = meterName.toLowerCase();
    if (lower.includes('gpt-4o-mini')) return 'gpt-4o-mini';
    if (lower.includes('gpt-4o')) return 'gpt-4o';
    if (lower.includes('gpt-4-turbo') || lower.includes('gpt-4 turbo')) return 'gpt-4-turbo';
    if (lower.includes('gpt-4')) return 'gpt-4';
    if (lower.includes('gpt-35') || lower.includes('gpt-3.5')) return 'gpt-3.5-turbo';
    return 'azure-openai-unknown';
}

// ═══════════════════════════════════════════════════════════════════
// VERTEX AI PARSER
// ═══════════════════════════════════════════════════════════════════

function parseVertexAI(csvContent) {
    const lines = csvContent.trim().split('\n');
    const headers = parseCSVLine(lines[0]);

    const colIndex = {
        date: findColumnIndex(headers, ['usage_date', 'date', 'export_time']),
        sku: findColumnIndex(headers, ['sku_description', 'sku', 'service_description']),
        usage: findColumnIndex(headers, ['usage_amount', 'quantity']),
        cost: findColumnIndex(headers, ['cost', 'total_cost']),
        project: findColumnIndex(headers, ['project_id', 'project']),
        labels: findColumnIndex(headers, ['labels', 'tags']),
    };

    const lineItems = [];
    let totalAmount = 0;
    const modelBreakdown = {};

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;

        const values = parseCSVLine(lines[i]);
        const skuDesc = values[colIndex.sku] || '';
        const model = extractModelFromVertexSKU(skuDesc);
        const isInput = skuDesc.toLowerCase().includes('input') || skuDesc.toLowerCase().includes('prompt');
        const usage = parseFloat(values[colIndex.usage]) || 0;
        const amount = parseFloat(values[colIndex.cost]) || 0;

        // Parse labels for cost center
        let costCenter = null;
        const labels = values[colIndex.labels];
        if (labels) {
            const costCenterMatch = labels.match(/cost[_-]?center['":\s]+([^'",}]+)/i);
            if (costCenterMatch) costCenter = costCenterMatch[1].trim();
        }

        lineItems.push({
            date: new Date(values[colIndex.date]),
            model,
            inputTokens: isInput ? Math.round(usage * 1000) : 0, // Vertex reports in K chars
            outputTokens: !isInput ? Math.round(usage * 1000) : 0,
            amount,
            costCenter,
            project: values[colIndex.project],
        });

        totalAmount += amount;

        if (!modelBreakdown[model]) {
            modelBreakdown[model] = { inputTokens: 0, outputTokens: 0, amount: 0, requests: 0 };
        }
        modelBreakdown[model].inputTokens += isInput ? Math.round(usage * 1000) : 0;
        modelBreakdown[model].outputTokens += !isInput ? Math.round(usage * 1000) : 0;
        modelBreakdown[model].amount += amount;
        modelBreakdown[model].requests++;
    }

    const dates = lineItems.map(li => li.date).filter(d => d && !isNaN(d));

    return {
        provider: 'vertex-ai',
        invoiceId: `VERTEX-${formatDateShort(new Date())}`,
        periodStart: dates.length > 0 ? new Date(Math.min(...dates)) : new Date(),
        periodEnd: dates.length > 0 ? new Date(Math.max(...dates)) : new Date(),
        totalAmount: Math.round(totalAmount * 100) / 100,
        currency: 'USD',
        lineItems,
        modelBreakdown,
        metadata: {
            rowCount: lineItems.length,
        }
    };
}

function extractModelFromVertexSKU(skuDesc) {
    const lower = skuDesc.toLowerCase();
    if (lower.includes('gemini-1.5-pro') || lower.includes('gemini 1.5 pro')) return 'gemini-1.5-pro';
    if (lower.includes('gemini-1.5-flash') || lower.includes('gemini 1.5 flash')) return 'gemini-1.5-flash';
    if (lower.includes('gemini-pro') || lower.includes('gemini pro')) return 'gemini-1.0-pro';
    if (lower.includes('palm')) return 'palm-2';
    return 'vertex-ai-unknown';
}

// ═══════════════════════════════════════════════════════════════════
// AWS BEDROCK PARSER
// ═══════════════════════════════════════════════════════════════════

function parseAWSBedrock(csvContent) {
    const lines = csvContent.trim().split('\n');
    const headers = parseCSVLine(lines[0]);

    const colIndex = {
        date: findColumnIndex(headers, ['lineitem/usagestartdate', 'usagestartdate', 'date']),
        product: findColumnIndex(headers, ['product/productname', 'productname']),
        usage: findColumnIndex(headers, ['lineitem/usageamount', 'usageamount']),
        cost: findColumnIndex(headers, ['lineitem/blendedcost', 'blendedcost', 'cost']),
        resourceId: findColumnIndex(headers, ['lineitem/resourceid', 'resourceid']),
        tags: findColumnIndex(headers, ['resourcetags', 'tags']),
    };

    const lineItems = [];
    let totalAmount = 0;
    const modelBreakdown = {};

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;

        const values = parseCSVLine(lines[i]);
        const productName = values[colIndex.product] || '';
        const resourceId = values[colIndex.resourceId] || '';

        // Only process Bedrock items
        if (!productName.toLowerCase().includes('bedrock')) continue;

        const model = extractModelFromBedrockResource(resourceId);
        const usage = parseFloat(values[colIndex.usage]) || 0;
        const amount = parseFloat(values[colIndex.cost]) || 0;
        const isInput = resourceId.toLowerCase().includes('input');

        // Parse tags for cost center
        let costCenter = null;
        const tags = values[colIndex.tags];
        if (tags) {
            const costCenterMatch = tags.match(/cost[_-]?center['":\s]+([^'",}]+)/i);
            if (costCenterMatch) costCenter = costCenterMatch[1].trim();
        }

        lineItems.push({
            date: new Date(values[colIndex.date]),
            model,
            inputTokens: isInput ? Math.round(usage) : 0,
            outputTokens: !isInput ? Math.round(usage) : 0,
            amount,
            costCenter,
            project: null,
        });

        totalAmount += amount;

        if (!modelBreakdown[model]) {
            modelBreakdown[model] = { inputTokens: 0, outputTokens: 0, amount: 0, requests: 0 };
        }
        modelBreakdown[model].inputTokens += isInput ? Math.round(usage) : 0;
        modelBreakdown[model].outputTokens += !isInput ? Math.round(usage) : 0;
        modelBreakdown[model].amount += amount;
        modelBreakdown[model].requests++;
    }

    const dates = lineItems.map(li => li.date).filter(d => d && !isNaN(d));

    return {
        provider: 'aws-bedrock',
        invoiceId: `BEDROCK-${formatDateShort(new Date())}`,
        periodStart: dates.length > 0 ? new Date(Math.min(...dates)) : new Date(),
        periodEnd: dates.length > 0 ? new Date(Math.max(...dates)) : new Date(),
        totalAmount: Math.round(totalAmount * 100) / 100,
        currency: 'USD',
        lineItems,
        modelBreakdown,
        metadata: {
            rowCount: lineItems.length,
        }
    };
}

function extractModelFromBedrockResource(resourceId) {
    const lower = resourceId.toLowerCase();
    if (lower.includes('claude-3-opus')) return 'claude-3-opus';
    if (lower.includes('claude-3-sonnet')) return 'claude-3-sonnet';
    if (lower.includes('claude-3-haiku')) return 'claude-3-haiku';
    if (lower.includes('llama3-70b') || lower.includes('llama-3-70b')) return 'llama-3-70b';
    if (lower.includes('llama3-8b') || lower.includes('llama-3-8b')) return 'llama-3-8b';
    if (lower.includes('mistral-large')) return 'mistral-large';
    if (lower.includes('mixtral')) return 'mixtral-8x7b';
    if (lower.includes('titan')) return 'titan-text';
    return 'bedrock-unknown';
}

// ═══════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    values.push(current.trim());

    return values;
}

function findColumnIndex(headers, possibleNames) {
    for (const name of possibleNames) {
        const idx = headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
        if (idx !== -1) return idx;
    }
    return -1;
}

function extractCostCenter(value) {
    if (!value) return null;
    // Extract cost center from user field (e.g., "user-cc:ENG-001" or "ENG-001-user")
    const match = value.match(/(?:cc:|cost-center:)?([A-Z]{2,4}-\d{2,4})/i);
    return match ? match[1].toUpperCase() : null;
}

function formatDateShort(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN PARSER INTERFACE
// ═══════════════════════════════════════════════════════════════════

/**
 * Auto-detect provider and parse invoice
 * @param {string} csvContent - Raw CSV content
 * @returns {NormalizedInvoice} Normalized invoice data
 */
function parseInvoice(csvContent) {
    const provider = detectProvider(csvContent);

    switch (provider) {
        case 'openai':
            return parseOpenAI(csvContent);
        case 'anthropic':
            return parseAnthropic(csvContent);
        case 'azure-openai':
            return parseAzureOpenAI(csvContent);
        case 'vertex-ai':
            return parseVertexAI(csvContent);
        case 'aws-bedrock':
            return parseAWSBedrock(csvContent);
        default:
            // Try OpenAI parser as fallback (most common format)
            console.warn('Unknown provider, attempting OpenAI format');
            return parseOpenAI(csvContent);
    }
}

/**
 * Merge multiple invoices into a single normalized view
 * @param {NormalizedInvoice[]} invoices - Array of normalized invoices
 * @returns {Object} Merged invoice summary
 */
function mergeInvoices(invoices) {
    const merged = {
        providers: [],
        periodStart: null,
        periodEnd: null,
        totalAmount: 0,
        currency: 'USD',
        lineItems: [],
        modelBreakdown: {},
        providerBreakdown: {},
    };

    for (const invoice of invoices) {
        merged.providers.push(invoice.provider);
        merged.totalAmount += invoice.totalAmount;
        merged.lineItems.push(...invoice.lineItems);

        // Update period bounds
        if (!merged.periodStart || invoice.periodStart < merged.periodStart) {
            merged.periodStart = invoice.periodStart;
        }
        if (!merged.periodEnd || invoice.periodEnd > merged.periodEnd) {
            merged.periodEnd = invoice.periodEnd;
        }

        // Merge model breakdown
        for (const [model, data] of Object.entries(invoice.modelBreakdown)) {
            if (!merged.modelBreakdown[model]) {
                merged.modelBreakdown[model] = { inputTokens: 0, outputTokens: 0, amount: 0, requests: 0 };
            }
            merged.modelBreakdown[model].inputTokens += data.inputTokens;
            merged.modelBreakdown[model].outputTokens += data.outputTokens;
            merged.modelBreakdown[model].amount += data.amount;
            merged.modelBreakdown[model].requests += data.requests;
        }

        // Track provider breakdown
        if (!merged.providerBreakdown[invoice.provider]) {
            merged.providerBreakdown[invoice.provider] = 0;
        }
        merged.providerBreakdown[invoice.provider] += invoice.totalAmount;
    }

    merged.totalAmount = Math.round(merged.totalAmount * 100) / 100;

    return merged;
}

// Export for use in browser or Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        detectProvider,
        parseInvoice,
        parseOpenAI,
        parseAnthropic,
        parseAzureOpenAI,
        parseVertexAI,
        parseAWSBedrock,
        mergeInvoices,
        normalizeModelName,
    };
}

// Export for ES modules
if (typeof window !== 'undefined') {
    window.FinaultParsers = {
        detectProvider,
        parseInvoice,
        parseOpenAI,
        parseAnthropic,
        parseAzureOpenAI,
        parseVertexAI,
        parseAWSBedrock,
        mergeInvoices,
        normalizeModelName,
    };
}
