/**
 * FOCUS 1.3 Schema Implementation for FinOps Cost Optimization
 * Implements full FinOps FOCUS 1.3 specification compliance
 * https://www.finops.org/framework/focus/
 */

export const FOCUS_VERSION = '1.3';

/**
 * Complete ordered array of all FOCUS 1.3 columns
 * Includes identity, service, resource, usage, pricing, and Finault extensions
 */
export const FOCUS_COLUMNS = [
    // Identity columns
    { name: 'BillingAccountId', type: 'string', required: true, description: 'Unique ID for billing account' },
    { name: 'BillingAccountName', type: 'string', required: false, description: 'Display name of billing account' },
    { name: 'BillingPeriodStart', type: 'datetime', required: true, description: 'Start of billing period (ISO 8601)' },
    { name: 'BillingPeriodEnd', type: 'datetime', required: true, description: 'End of billing period (ISO 8601)' },

    // Sub-account columns
    { name: 'SubAccountId', type: 'string', required: false, description: 'Unique ID for sub-account' },
    { name: 'SubAccountName', type: 'string', required: false, description: 'Display name of sub-account' },

    // Provider columns
    { name: 'ProviderName', type: 'string', required: true, description: 'Cloud service provider name' },
    { name: 'PublisherName', type: 'string', required: true, description: 'Entity that published the service' },

    // Service columns
    { name: 'ServiceCategory', type: 'string', required: true, description: 'Category: AI/ML, Compute, Storage, etc.' },
    { name: 'ServiceName', type: 'string', required: true, description: 'Name of the consumed service' },

    // Resource columns
    { name: 'ResourceId', type: 'string', required: false, description: 'Unique ID of the resource' },
    { name: 'ResourceName', type: 'string', required: false, description: 'Display name of the resource' },
    { name: 'ResourceType', type: 'string', required: false, description: 'Type classification of the resource' },

    // Region/location columns
    { name: 'Region', type: 'string', required: false, description: 'Provider region where resource is deployed' },
    { name: 'AvailabilityZone', type: 'string', required: false, description: 'Availability zone within region' },

    // Usage columns
    { name: 'UsageDateTime', type: 'datetime', required: true, description: 'Date/time of usage (ISO 8601)' },
    { name: 'UsageQuantity', type: 'number', required: true, description: 'Quantity of usage consumed' },
    { name: 'UsageUnit', type: 'string', required: true, description: 'Unit of measure (tokens, GB-hours, etc.)' },

    // Pricing columns
    { name: 'PricingCategory', type: 'string', required: true, description: 'On-Demand, Commitment, Spot, etc.' },
    { name: 'PricingQuantity', type: 'number', required: false, description: 'Pricing-basis quantity' },
    { name: 'PricingUnit', type: 'string', required: false, description: 'Unit for pricing quantity' },
    { name: 'EffectiveCost', type: 'number', required: true, description: 'Effective cost after discounts' },
    { name: 'ListCost', type: 'number', required: true, description: 'List price cost before discounts' },
    { name: 'ListUnitPrice', type: 'number', required: false, description: 'Per-unit list price' },
    { name: 'BillingCurrency', type: 'string', required: true, description: 'ISO 4217 currency code' },

    // FOCUS 1.3 Cost Allocation columns
    { name: 'AmortizedCost', type: 'number', required: false, description: 'Cost with commitment amortization spread' },
    { name: 'NetAmortizedCost', type: 'number', required: false, description: 'Amortized cost minus negotiated discounts' },
    { name: 'OnDemandCost', type: 'number', required: false, description: 'Cost at on-demand rates (no commitment)' },
    { name: 'NetUnblendedCost', type: 'number', required: false, description: 'Net cost before blending across accounts' },

    // FOCUS 1.3 Commitment Tracking columns
    { name: 'CommitmentDiscountId', type: 'string', required: false, description: 'ID of commitment (RI, savings plan)' },
    { name: 'CommitmentDiscountName', type: 'string', required: false, description: 'Name of commitment discount' },
    { name: 'CommitmentDiscountType', type: 'string', required: false, description: 'Type: ReservedInstance, SavingsPlan, CUD' },
    { name: 'CommitmentDiscountCategory', type: 'string', required: false, description: 'Usage or Fee' },
    { name: 'CommitmentDiscountStatus', type: 'string', required: false, description: 'Used or Unused' },

    // Tags column
    { name: 'Tags', type: 'json', required: false, description: 'Key-value tag pairs' },

    // Charge columns
    { name: 'ChargeType', type: 'string', required: true, description: 'Usage, Purchase, Tax, Credit, Adjustment' },
    { name: 'ChargeFrequency', type: 'string', required: true, description: 'One-Time, Recurring, Usage-Based' },
    { name: 'ChargeDescription', type: 'string', required: false, description: 'Human-readable description' },
    { name: 'InvoiceIssuerName', type: 'string', required: false, description: 'Entity that issued the invoice' },

    // Finault-specific extensions
    { name: 'x_finault_org_id', type: 'string', required: true, description: 'Finault tenant org ID' },
    { name: 'x_finault_confidence', type: 'number', required: false, description: 'Parsing confidence 0.0-1.0' },
    { name: 'x_finault_source_file', type: 'string', required: false, description: 'Source file that produced this record' },
];

/**
 * Enum values for FOCUS fields
 */
export const FOCUS_CHARGE_TYPES = ['Usage', 'Purchase', 'Tax', 'Credit', 'Adjustment'];
export const FOCUS_CHARGE_FREQUENCIES = ['One-Time', 'Recurring', 'Usage-Based'];
export const FOCUS_PRICING_CATEGORIES = ['On-Demand', 'Commitment-Based', 'Spot', 'Dynamic'];
export const FOCUS_SERVICE_CATEGORIES = ['AI/ML', 'Compute', 'Storage', 'Database', 'Networking', 'Analytics', 'Security', 'Management', 'Other'];
export const FOCUS_COMMITMENT_TYPES = ['ReservedInstance', 'SavingsPlan', 'CommittedUseDiscount', 'EnterpriseDiscount'];

/**
 * Provider-specific field mappings to FOCUS schema
 * Maps raw provider billing fields to standardized FOCUS columns
 */
export const PROVIDER_FOCUS_MAPPINGS = {
    openai: {
        BillingAccountId: 'organization_id',
        BillingAccountName: 'organization_name',
        ServiceName: () => 'OpenAI API',
        ServiceCategory: () => 'AI/ML',
        ProviderName: () => 'OpenAI',
        PublisherName: () => 'OpenAI',
        ResourceId: 'snapshot_id',
        ResourceName: 'model',
        UsageQuantity: (row) => (row.n_context_tokens_total || (row.n_input_tokens + row.n_output_tokens || 0)),
        UsageUnit: () => 'Tokens',
        EffectiveCost: (row) => row.cost_in_usd || (row.cost_in_cents / 100),
        ListCost: (row) => row.cost_in_usd || (row.cost_in_cents / 100),
        BillingCurrency: () => 'USD',
        ChargeType: () => 'Usage',
        ChargeFrequency: () => 'Usage-Based',
        UsageDateTime: 'timestamp',
        PricingCategory: () => 'On-Demand',
    },
    anthropic: {
        BillingAccountId: 'customer_id',
        BillingAccountName: 'customer_name',
        ServiceName: () => 'Claude API',
        ServiceCategory: () => 'AI/ML',
        ProviderName: () => 'Anthropic',
        PublisherName: () => 'Anthropic',
        ResourceId: 'request_id',
        ResourceName: (row) => row.model_id || 'claude',
        UsageQuantity: (row) => (row.input_tokens + row.output_tokens || 0),
        UsageUnit: () => 'Tokens',
        EffectiveCost: (row) => row.total_cost,
        ListCost: (row) => row.total_cost,
        BillingCurrency: () => 'USD',
        ChargeType: () => 'Usage',
        ChargeFrequency: () => 'Usage-Based',
        UsageDateTime: (row) => row.timestamp || row.request_date,
        PricingCategory: () => 'On-Demand',
    },
    aws: {
        BillingAccountId: 'LinkedAccountId',
        BillingAccountName: 'LinkedAccountName',
        BillingPeriodStart: 'BillingPeriodStartDate',
        BillingPeriodEnd: 'BillingPeriodEndDate',
        ServiceName: 'ProductName',
        ServiceCategory: (row) => categorizeAWSService(row.ProductName),
        ProviderName: () => 'AWS',
        PublisherName: () => 'Amazon Web Services',
        ResourceId: 'ResourceId',
        ResourceName: 'ResourceId',
        ResourceType: 'UsageType',
        Region: 'Region',
        AvailabilityZone: 'AvailabilityZone',
        UsageQuantity: 'UsageQuantity',
        UsageUnit: 'UsageType',
        UsageDateTime: 'UsageStartDate',
        EffectiveCost: 'NetUnblendedCost',
        ListCost: 'UnblendedCost',
        ListUnitPrice: 'UnblendedRate',
        OnDemandCost: 'OnDemandCost',
        AmortizedCost: 'AmortizedCost',
        NetAmortizedCost: 'NetAmortizedCost',
        NetUnblendedCost: 'NetUnblendedCost',
        BillingCurrency: 'CurrencyCode',
        CommitmentDiscountId: 'ReservationARN',
        CommitmentDiscountName: 'ReservationARN',
        CommitmentDiscountType: (row) => {
            if (row.SavingsPlanARN) return 'SavingsPlan';
            if (row.ReservationARN) return 'ReservedInstance';
            return null;
        },
        CommitmentDiscountStatus: (row) => row.LineItemType === 'RIFee' ? 'Used' : null,
        ChargeType: 'LineItemType',
        ChargeFrequency: (row) => row.LineItemType === 'RIFee' ? 'Recurring' : (row.LineItemType === 'Usage' ? 'Usage-Based' : 'One-Time'),
        PricingCategory: (row) => {
            if (row.SavingsPlanARN || row.ReservationARN) return 'Commitment-Based';
            return 'On-Demand';
        },
        Tags: 'resourceTags',
    },
    azure: {
        BillingAccountId: 'BillingAccountId',
        BillingAccountName: 'BillingAccountName',
        BillingPeriodStart: 'BillingPeriodStartDate',
        BillingPeriodEnd: 'BillingPeriodEndDate',
        SubAccountId: 'SubscriptionId',
        SubAccountName: 'SubscriptionName',
        ServiceName: 'ServiceName',
        ServiceCategory: (row) => categorizeAzureService(row.MeterCategory),
        ProviderName: () => 'Azure',
        PublisherName: () => 'Microsoft',
        ResourceId: 'ResourceId',
        ResourceName: 'ResourceName',
        ResourceType: 'ResourceType',
        Region: 'ResourceLocation',
        UsageQuantity: 'Quantity',
        UsageUnit: 'UnitOfMeasure',
        UsageDateTime: 'UsageDateTime',
        EffectiveCost: 'CostInBillingCurrency',
        ListCost: (row) => row.PreTaxCost || row.CostInBillingCurrency,
        BillingCurrency: 'BillingCurrencyCode',
        AmortizedCost: 'AmortizedCost',
        NetAmortizedCost: 'NetAmortizedCost',
        CommitmentDiscountId: 'ReservationId',
        CommitmentDiscountType: (row) => row.ReservationId ? 'ReservedInstance' : null,
        ChargeType: 'ChargeType',
        ChargeFrequency: () => 'Usage-Based',
        PricingCategory: (row) => row.ReservationId ? 'Commitment-Based' : 'On-Demand',
    },
    google_cloud: {
        BillingAccountId: 'billing_account_id',
        BillingAccountName: 'billing_account_name',
        BillingPeriodStart: 'billing_period_start_date',
        BillingPeriodEnd: 'billing_period_end_date',
        SubAccountId: 'project_id',
        SubAccountName: 'project_name',
        ServiceName: 'service.description',
        ServiceCategory: (row) => categorizeGCPService(row['service.description']),
        ProviderName: () => 'Google Cloud',
        PublisherName: () => 'Google Cloud',
        ResourceId: 'resource.name',
        ResourceName: 'resource.name',
        ResourceType: 'resource.type',
        Region: 'location.region',
        AvailabilityZone: 'location.zone',
        UsageQuantity: 'usage.amount',
        UsageUnit: 'usage.unit',
        UsageDateTime: 'usage_start_time',
        EffectiveCost: 'cost',
        ListCost: (row) => row.cost || row.list_cost,
        BillingCurrency: 'currency',
        CommitmentDiscountId: 'commitment_name',
        CommitmentDiscountType: (row) => row.commitment_plan ? 'CommittedUseDiscount' : null,
        ChargeType: 'invoice.month',
        ChargeFrequency: () => 'Usage-Based',
        PricingCategory: (row) => row.commitment_plan ? 'Commitment-Based' : 'On-Demand',
    },
    cohere: {
        BillingAccountId: 'account_id',
        BillingAccountName: 'account_name',
        ServiceName: () => 'Cohere API',
        ServiceCategory: () => 'AI/ML',
        ProviderName: () => 'Cohere',
        PublisherName: () => 'Cohere',
        ResourceId: 'request_id',
        ResourceName: (row) => row.model_id || 'cohere',
        UsageQuantity: (row) => row.tokens_used,
        UsageUnit: () => 'Tokens',
        UsageDateTime: 'timestamp',
        EffectiveCost: 'total_cost',
        ListCost: 'total_cost',
        BillingCurrency: () => 'USD',
        ChargeType: () => 'Usage',
        ChargeFrequency: () => 'Usage-Based',
        PricingCategory: () => 'On-Demand',
    },
    mistral: {
        BillingAccountId: 'account_id',
        BillingAccountName: 'account_name',
        ServiceName: () => 'Mistral API',
        ServiceCategory: () => 'AI/ML',
        ProviderName: () => 'Mistral',
        PublisherName: () => 'Mistral AI',
        ResourceId: 'request_id',
        ResourceName: (row) => row.model_id || 'mistral',
        UsageQuantity: (row) => row.input_tokens + row.output_tokens,
        UsageUnit: () => 'Tokens',
        UsageDateTime: 'timestamp',
        EffectiveCost: 'cost',
        ListCost: 'cost',
        BillingCurrency: () => 'USD',
        ChargeType: () => 'Usage',
        ChargeFrequency: () => 'Usage-Based',
        PricingCategory: () => 'On-Demand',
    },
    together_ai: {
        BillingAccountId: 'account_id',
        BillingAccountName: 'account_name',
        ServiceName: () => 'Together AI API',
        ServiceCategory: () => 'AI/ML',
        ProviderName: () => 'Together AI',
        PublisherName: () => 'Together AI',
        ResourceId: 'request_id',
        ResourceName: (row) => row.model_id || 'together',
        UsageQuantity: (row) => row.tokens_used,
        UsageUnit: () => 'Tokens',
        UsageDateTime: 'timestamp',
        EffectiveCost: 'cost',
        ListCost: 'cost',
        BillingCurrency: () => 'USD',
        ChargeType: () => 'Usage',
        ChargeFrequency: () => 'Usage-Based',
        PricingCategory: () => 'On-Demand',
    },
};

/**
 * Categorizes AWS ProductNames to FOCUS service categories
 */
export function categorizeAWSService(productName) {
    if (!productName) return 'Other';

    const name = productName.toLowerCase();

    if (name.includes('ec2') || name.includes('elastic compute')) return 'Compute';
    if (name.includes('s3') || name.includes('storage')) return 'Storage';
    if (name.includes('rds') || name.includes('dynamodb') || name.includes('database')) return 'Database';
    if (name.includes('lambda')) return 'Compute';
    if (name.includes('cloudfront') || name.includes('route53') || name.includes('elb') || name.includes('network')) return 'Networking';
    if (name.includes('glue') || name.includes('athena') || name.includes('redshift') || name.includes('analytics')) return 'Analytics';
    if (name.includes('sagemaker') || name.includes('bedrock') || name.includes('ml')) return 'AI/ML';
    if (name.includes('iam') || name.includes('kms') || name.includes('security')) return 'Security';
    if (name.includes('cloudwatch') || name.includes('monitor') || name.includes('management')) return 'Management';

    return 'Other';
}

/**
 * Categorizes Azure meter categories to FOCUS service categories
 */
export function categorizeAzureService(meterCategory) {
    if (!meterCategory) return 'Other';

    const cat = meterCategory.toLowerCase();

    if (cat.includes('virtual machines') || cat.includes('compute')) return 'Compute';
    if (cat.includes('storage')) return 'Storage';
    if (cat.includes('sql') || cat.includes('database') || cat.includes('cosmos')) return 'Database';
    if (cat.includes('bandwidth') || cat.includes('vpn') || cat.includes('network')) return 'Networking';
    if (cat.includes('analytics') || cat.includes('data warehouse')) return 'Analytics';
    if (cat.includes('cognitive') || cat.includes('ml') || cat.includes('ai')) return 'AI/ML';
    if (cat.includes('security') || cat.includes('vault')) return 'Security';
    if (cat.includes('monitor') || cat.includes('management')) return 'Management';

    return 'Other';
}

/**
 * Categorizes GCP services to FOCUS service categories
 */
export function categorizeGCPService(serviceDescription) {
    if (!serviceDescription) return 'Other';

    const desc = serviceDescription.toLowerCase();

    if (desc.includes('compute engine') || desc.includes('app engine') || desc.includes('cloud run')) return 'Compute';
    if (desc.includes('cloud storage')) return 'Storage';
    if (desc.includes('cloud sql') || desc.includes('datastore') || desc.includes('firestore') || desc.includes('bigtable')) return 'Database';
    if (desc.includes('cloud cdn') || desc.includes('cloud load balancing') || desc.includes('network')) return 'Networking';
    if (desc.includes('bigquery') || desc.includes('dataflow') || desc.includes('analytics')) return 'Analytics';
    if (desc.includes('vertex') || desc.includes('ai') || desc.includes('ml')) return 'AI/ML';
    if (desc.includes('security') || desc.includes('kms')) return 'Security';
    if (desc.includes('monitoring') || desc.includes('management')) return 'Management';

    return 'Other';
}

/**
 * FOCUSValidator: Validates FOCUS records against schema
 */
export class FOCUSValidator {
    constructor() {
        this.requiredColumns = FOCUS_COLUMNS.filter(c => c.required).map(c => c.name);
        this.optionalColumns = FOCUS_COLUMNS.filter(c => !c.required).map(c => c.name);
        this.columnMap = new Map(FOCUS_COLUMNS.map(c => [c.name, c]));
    }

    /**
     * Validates a single record
     * @param {Object} record - FOCUS record to validate
     * @returns {Object} { valid: boolean, errors: string[] }
     */
    validateRecord(record) {
        const errors = [];

        if (!record || typeof record !== 'object') {
            errors.push('Record must be a non-null object');
            return { valid: false, errors };
        }

        // Check required fields
        for (const field of this.requiredColumns) {
            if (!(field in record) || record[field] === null || record[field] === undefined) {
                errors.push(`Missing required field: ${field}`);
            }
        }

        // Check field types
        for (const [fieldName, value] of Object.entries(record)) {
            if (value === null || value === undefined) continue;

            const colDef = this.columnMap.get(fieldName);
            if (!colDef) continue;

            if (!this._isCorrectType(value, colDef.type)) {
                errors.push(`Field ${fieldName} has incorrect type: expected ${colDef.type}, got ${typeof value}`);
            }

            // Validate enums
            if (fieldName === 'ChargeType' && !FOCUS_CHARGE_TYPES.includes(value)) {
                errors.push(`Invalid ChargeType: ${value}. Must be one of: ${FOCUS_CHARGE_TYPES.join(', ')}`);
            }
            if (fieldName === 'ChargeFrequency' && !FOCUS_CHARGE_FREQUENCIES.includes(value)) {
                errors.push(`Invalid ChargeFrequency: ${value}. Must be one of: ${FOCUS_CHARGE_FREQUENCIES.join(', ')}`);
            }
            if (fieldName === 'PricingCategory' && !FOCUS_PRICING_CATEGORIES.includes(value)) {
                errors.push(`Invalid PricingCategory: ${value}. Must be one of: ${FOCUS_PRICING_CATEGORIES.join(', ')}`);
            }
            if (fieldName === 'ServiceCategory' && !FOCUS_SERVICE_CATEGORIES.includes(value)) {
                errors.push(`Invalid ServiceCategory: ${value}. Must be one of: ${FOCUS_SERVICE_CATEGORIES.join(', ')}`);
            }
            if (fieldName === 'CommitmentDiscountType' && value && !FOCUS_COMMITMENT_TYPES.includes(value)) {
                errors.push(`Invalid CommitmentDiscountType: ${value}. Must be one of: ${FOCUS_COMMITMENT_TYPES.join(', ')}`);
            }
        }

        return { valid: errors.length === 0, errors };
    }

    /**
     * Validates an array of records
     * @param {Array} records - Array of FOCUS records
     * @returns {Object} { valid: boolean, validCount: number, invalidCount: number, errors: Array }
     */
    validateBatch(records) {
        if (!Array.isArray(records)) {
            return {
                valid: false,
                validCount: 0,
                invalidCount: 0,
                errors: [{ index: -1, errors: ['Input must be an array'] }]
            };
        }

        let validCount = 0;
        let invalidCount = 0;
        const errors = [];

        for (let i = 0; i < records.length; i++) {
            const result = this.validateRecord(records[i]);
            if (result.valid) {
                validCount++;
            } else {
                invalidCount++;
                errors.push({ index: i, errors: result.errors });
            }
        }

        return {
            valid: invalidCount === 0,
            validCount,
            invalidCount,
            errors
        };
    }

    /**
     * Gets list of required columns
     */
    getRequiredColumns() {
        return [...this.requiredColumns];
    }

    /**
     * Gets list of optional columns
     */
    getOptionalColumns() {
        return [...this.optionalColumns];
    }

    /**
     * Coerces field types where possible
     * @param {Object} record - Record to coerce
     * @returns {Object} Coerced record
     */
    coerceTypes(record) {
        if (!record || typeof record !== 'object') return record;

        const coerced = { ...record };

        for (const [fieldName, value] of Object.entries(coerced)) {
            if (value === null || value === undefined) continue;

            const colDef = this.columnMap.get(fieldName);
            if (!colDef) continue;

            if (colDef.type === 'number' && typeof value === 'string') {
                const num = parseFloat(value);
                coerced[fieldName] = isNaN(num) ? value : num;
            } else if (colDef.type === 'datetime' && typeof value === 'string') {
                const date = new Date(value);
                coerced[fieldName] = isNaN(date.getTime()) ? value : date.toISOString();
            } else if (colDef.type === 'json' && typeof value === 'string') {
                try {
                    coerced[fieldName] = JSON.parse(value);
                } catch {
                    // Keep as string if not valid JSON
                }
            }
        }

        return coerced;
    }

    /**
     * Checks if value matches expected type
     */
    _isCorrectType(value, expectedType) {
        if (expectedType === 'string') return typeof value === 'string';
        if (expectedType === 'number') return typeof value === 'number' && !isNaN(value);
        if (expectedType === 'datetime') return value instanceof Date || typeof value === 'string';
        if (expectedType === 'json') return typeof value === 'object' || typeof value === 'string';
        return true;
    }
}

/**
 * FOCUSNormalizer: Normalizes provider-specific records to FOCUS format
 */
export class FOCUSNormalizer {
    constructor(validator = null) {
        this.validator = validator || new FOCUSValidator();
    }

    /**
     * Normalizes a single raw record to FOCUS format
     * @param {Object} rawRecord - Provider-specific raw record
     * @param {string} provider - Provider name (openai, aws, azure, etc.)
     * @param {Object} options - Additional options
     * @returns {Object} { record: Object|null, valid: boolean, errors: string[] }
     */
    normalize(rawRecord, provider, options = {}) {
        if (!rawRecord || typeof rawRecord !== 'object') {
            return {
                record: null,
                valid: false,
                errors: ['Input must be a non-null object']
            };
        }

        const mapping = PROVIDER_FOCUS_MAPPINGS[provider];
        if (!mapping) {
            return {
                record: null,
                valid: false,
                errors: [`Unknown provider: ${provider}`]
            };
        }

        const focusRecord = {};
        const now = new Date().toISOString();

        // Apply mapping
        for (const [focusField, mapperOrField] of Object.entries(mapping)) {
            let value;

            if (typeof mapperOrField === 'function') {
                // If mapper is a function, call it with the raw record
                try {
                    value = mapperOrField(rawRecord);
                } catch (e) {
                    value = undefined;
                }
            } else if (typeof mapperOrField === 'string') {
                // If mapper is a string, look up the field in raw record
                value = rawRecord[mapperOrField];
            } else {
                value = undefined;
            }

            if (value !== undefined && value !== null) {
                focusRecord[focusField] = value;
            }
        }

        // Set defaults for missing required fields
        if (!focusRecord.BillingPeriodStart) {
            focusRecord.BillingPeriodStart = options.billingPeriodStart || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
        }
        if (!focusRecord.BillingPeriodEnd) {
            focusRecord.BillingPeriodEnd = options.billingPeriodEnd || now;
        }
        if (!focusRecord.UsageDateTime) {
            focusRecord.UsageDateTime = options.usageDateTime || now;
        }
        if (!focusRecord.ChargeType) {
            focusRecord.ChargeType = options.chargeType || 'Usage';
        }
        if (!focusRecord.ChargeFrequency) {
            focusRecord.ChargeFrequency = options.chargeFrequency || 'Usage-Based';
        }
        if (!focusRecord.PricingCategory) {
            focusRecord.PricingCategory = options.pricingCategory || 'On-Demand';
        }

        // Add required Finault extension
        focusRecord.x_finault_org_id = options.orgId || 'unknown';
        if (options.sourceFile) {
            focusRecord.x_finault_source_file = options.sourceFile;
        }
        if (options.confidence !== undefined) {
            focusRecord.x_finault_confidence = options.confidence;
        }

        // Validate the normalized record
        const validation = this.validator.validateRecord(focusRecord);

        return {
            record: validation.valid ? focusRecord : focusRecord, // Return record even if invalid for inspection
            valid: validation.valid,
            errors: validation.errors
        };
    }

    /**
     * Normalizes a batch of raw records
     * @param {Array} rawRecords - Array of provider-specific raw records
     * @param {string} provider - Provider name
     * @param {Object} options - Additional options
     * @returns {Object} { records: Array, validCount: number, invalidCount: number, errors: Array }
     */
    normalizeBatch(rawRecords, provider, options = {}) {
        if (!Array.isArray(rawRecords)) {
            return {
                records: [],
                validCount: 0,
                invalidCount: 0,
                errors: [{ index: -1, errors: ['Input must be an array'] }]
            };
        }

        const records = [];
        let validCount = 0;
        let invalidCount = 0;
        const errors = [];

        for (let i = 0; i < rawRecords.length; i++) {
            const result = this.normalize(rawRecords[i], provider, options);
            if (result.valid && result.record) {
                records.push(result.record);
                validCount++;
            } else {
                invalidCount++;
                errors.push({ index: i, errors: result.errors });
            }
        }

        return {
            records,
            validCount,
            invalidCount,
            errors
        };
    }

    /**
     * Calculates amortized cost with commitment spreading
     * @param {Object} record - FOCUS record
     * @param {Object} commitment - Commitment details { totalCost, daysRemaining, dailySpread }
     * @returns {number} Amortized cost
     */
    calculateAmortizedCost(record, commitment) {
        if (!commitment) return record.EffectiveCost;

        const { totalCost, daysRemaining, dailySpread } = commitment;

        if (!daysRemaining || daysRemaining <= 0) return record.EffectiveCost;

        const dailyCost = totalCost / daysRemaining;
        return record.EffectiveCost + dailyCost;
    }

    /**
     * Calculates shared cost allocation across sub-accounts
     * @param {Array} records - Array of FOCUS records
     * @param {Object} allocationRules - Rules for allocation { method, percentages, usageKey }
     * @returns {Array} Records with allocated costs
     */
    calculateSharedCostAllocation(records, allocationRules = {}) {
        if (!Array.isArray(records) || records.length === 0) return records;

        const method = allocationRules.method || 'usage'; // 'usage', 'fixed', 'even'
        const allocatedRecords = [];

        // Find shared cost records (e.g., support, management charges)
        const sharedCosts = records.filter(r =>
            r.ChargeType === 'Purchase' || r.ChargeDescription?.includes('support')
        );

        const usageRecords = records.filter(r => r.ChargeType === 'Usage');

        if (sharedCosts.length === 0) return records;

        // Group usage by SubAccountId or BillingAccountId
        const accountUsage = {};
        let totalUsage = 0;

        for (const record of usageRecords) {
            const accountId = record.SubAccountId || record.BillingAccountId;
            const usage = record.UsageQuantity || 1;
            accountUsage[accountId] = (accountUsage[accountId] || 0) + usage;
            totalUsage += usage;
        }

        // Allocate shared costs
        for (const sharedRecord of sharedCosts) {
            if (method === 'usage' && totalUsage > 0) {
                for (const [accountId, usage] of Object.entries(accountUsage)) {
                    const ratio = usage / totalUsage;
                    const allocatedRecord = {
                        ...sharedRecord,
                        SubAccountId: accountId,
                        EffectiveCost: sharedRecord.EffectiveCost * ratio,
                        ListCost: sharedRecord.ListCost * ratio,
                        x_finault_allocation_method: 'usage'
                    };
                    allocatedRecords.push(allocatedRecord);
                }
            } else if (method === 'fixed' && allocationRules.percentages) {
                for (const [accountId, percentage] of Object.entries(allocationRules.percentages)) {
                    const ratio = percentage / 100;
                    const allocatedRecord = {
                        ...sharedRecord,
                        SubAccountId: accountId,
                        EffectiveCost: sharedRecord.EffectiveCost * ratio,
                        ListCost: sharedRecord.ListCost * ratio,
                        x_finault_allocation_method: 'fixed'
                    };
                    allocatedRecords.push(allocatedRecord);
                }
            } else if (method === 'even' && Object.keys(accountUsage).length > 0) {
                const split = 1 / Object.keys(accountUsage).length;
                for (const accountId of Object.keys(accountUsage)) {
                    const allocatedRecord = {
                        ...sharedRecord,
                        SubAccountId: accountId,
                        EffectiveCost: sharedRecord.EffectiveCost * split,
                        ListCost: sharedRecord.ListCost * split,
                        x_finault_allocation_method: 'even'
                    };
                    allocatedRecords.push(allocatedRecord);
                }
            }
        }

        return [...usageRecords, ...allocatedRecords];
    }

    /**
     * Enriches record with commitment discount data
     * @param {Object} record - FOCUS record
     * @param {Array} commitments - Array of active commitments
     * @returns {Object} Enriched record
     */
    enrichWithCommitmentData(record, commitments) {
        if (!commitments || !Array.isArray(commitments)) return record;

        for (const commitment of commitments) {
            // Match commitment to record based on service/resource
            if (this._matchesCommitment(record, commitment)) {
                return {
                    ...record,
                    CommitmentDiscountId: commitment.id,
                    CommitmentDiscountName: commitment.name,
                    CommitmentDiscountType: commitment.type,
                    CommitmentDiscountStatus: commitment.status,
                    CommitmentDiscountCategory: commitment.category || 'Usage'
                };
            }
        }

        return record;
    }

    /**
     * Checks if record matches a commitment
     */
    _matchesCommitment(record, commitment) {
        if (!commitment.matchCriteria) return false;

        const { service, resource, provider } = commitment.matchCriteria;

        if (service && record.ServiceName !== service) return false;
        if (resource && record.ResourceId !== resource) return false;
        if (provider && record.ProviderName !== provider) return false;

        return true;
    }
}

/**
 * FOCUSExporter: Exports FOCUS records to various formats
 */
export class FOCUSExporter {
    /**
     * Exports records to CSV format
     * @param {Array} records - Array of FOCUS records
     * @returns {string} CSV content
     */
    toCSV(records) {
        if (!Array.isArray(records) || records.length === 0) {
            return this._csvHeader();
        }

        const headers = FOCUS_COLUMNS.map(c => c.name);
        const headerRow = headers.map(h => `"${h}"`).join(',');

        const rows = records
            .filter(record => record !== null && record !== undefined) // Filter out null/undefined records
            .map(record => {
                return headers.map(header => {
                    const value = record[header];
                    if (value === null || value === undefined) return '';
                    if (typeof value === 'object') return `"${JSON.stringify(value)}"`;
                    if (typeof value === 'string') return `"${value.replace(/"/g, '""')}"`;
                    return value;
                }).join(',');
            });

        return [headerRow, ...rows].join('\n');
    }

    /**
     * Exports records to JSON format
     * @param {Array} records - Array of FOCUS records
     * @returns {string} JSON content
     */
    toJSON(records) {
        if (!Array.isArray(records)) return '[]';
        return JSON.stringify(records, null, 2);
    }

    /**
     * Exports records to Parquet format (schema definition)
     * @param {Array} records - Array of FOCUS records
     * @returns {Object} Parquet metadata
     */
    toParquet(records) {
        const schema = this.generateSchema();
        return {
            format: 'parquet',
            schema: schema,
            data: records,
            metadata: {
                version: FOCUS_VERSION,
                rowCount: records.length,
                generatedAt: new Date().toISOString()
            }
        };
    }

    /**
     * Generates JSON Schema for FOCUS 1.3
     * @returns {Object} JSON Schema
     */
    generateSchema() {
        const properties = {};
        const required = [];

        for (const column of FOCUS_COLUMNS) {
            const prop = {
                description: column.description,
            };

            if (column.type === 'string') {
                prop.type = 'string';
            } else if (column.type === 'number') {
                prop.type = 'number';
            } else if (column.type === 'datetime') {
                prop.type = 'string';
                prop.format = 'date-time';
            } else if (column.type === 'json') {
                prop.type = 'object';
            }

            properties[column.name] = prop;
            if (column.required) required.push(column.name);
        }

        return {
            $schema: 'http://json-schema.org/draft-07/schema#',
            title: 'FinOps FOCUS 1.3 Schema',
            type: 'object',
            properties,
            required,
            additionalProperties: false
        };
    }

    /**
     * Returns CSV header row
     */
    _csvHeader() {
        return FOCUS_COLUMNS.map(c => `"${c.name}"`).join(',');
    }
}

/**
 * SharedCostAllocator: Allocates shared costs across tenants/accounts
 */
export class SharedCostAllocator {
    /**
     * Allocates shared costs proportionally by usage
     * @param {Array} sharedCosts - Shared cost records
     * @param {Array} usageRecords - Usage records for proportion calculation
     * @returns {Array} Allocated records
     */
    allocateByUsage(sharedCosts, usageRecords) {
        if (!Array.isArray(usageRecords) || usageRecords.length === 0) return sharedCosts;

        // Sum usage by account
        const accountUsage = {};
        let totalUsage = 0;

        for (const record of usageRecords) {
            const accountId = record.SubAccountId || record.BillingAccountId;
            const usage = record.UsageQuantity || 1;
            accountUsage[accountId] = (accountUsage[accountId] || 0) + usage;
            totalUsage += usage;
        }

        // Allocate each shared cost
        const allocated = [];
        for (const sharedCost of sharedCosts) {
            for (const [accountId, usage] of Object.entries(accountUsage)) {
                const ratio = usage / totalUsage;
                allocated.push({
                    ...sharedCost,
                    SubAccountId: accountId,
                    EffectiveCost: sharedCost.EffectiveCost * ratio,
                    ListCost: sharedCost.ListCost * ratio,
                    x_finault_allocation_method: 'usage',
                    x_finault_allocation_ratio: ratio
                });
            }
        }

        return allocated;
    }

    /**
     * Allocates shared costs by fixed percentages
     * @param {Array} sharedCosts - Shared cost records
     * @param {Object} percentages - Map of accountId to percentage (0-100)
     * @returns {Array} Allocated records
     */
    allocateByFixed(sharedCosts, percentages) {
        if (typeof percentages !== 'object') return sharedCosts;

        const allocated = [];
        for (const sharedCost of sharedCosts) {
            for (const [accountId, percentage] of Object.entries(percentages)) {
                const ratio = percentage / 100;
                allocated.push({
                    ...sharedCost,
                    SubAccountId: accountId,
                    EffectiveCost: sharedCost.EffectiveCost * ratio,
                    ListCost: sharedCost.ListCost * ratio,
                    x_finault_allocation_method: 'fixed',
                    x_finault_allocation_percentage: percentage
                });
            }
        }

        return allocated;
    }

    /**
     * Allocates shared costs equally
     * @param {Array} sharedCosts - Shared cost records
     * @param {Array} tenantIds - Array of tenant/account IDs
     * @returns {Array} Allocated records
     */
    allocateByEvenSplit(sharedCosts, tenantIds) {
        if (!Array.isArray(tenantIds) || tenantIds.length === 0) return sharedCosts;

        const split = 1 / tenantIds.length;
        const allocated = [];

        for (const sharedCost of sharedCosts) {
            for (const tenantId of tenantIds) {
                allocated.push({
                    ...sharedCost,
                    SubAccountId: tenantId,
                    EffectiveCost: sharedCost.EffectiveCost * split,
                    ListCost: sharedCost.ListCost * split,
                    x_finault_allocation_method: 'even',
                    x_finault_allocation_ratio: split
                });
            }
        }

        return allocated;
    }

    /**
     * Generates allocation report
     * @param {Array} allocations - Allocated cost records
     * @returns {Object} Allocation summary report
     */
    generateAllocationReport(allocations) {
        if (!Array.isArray(allocations)) return {};

        const summary = {};
        const details = [];

        for (const record of allocations) {
            const accountId = record.SubAccountId || record.BillingAccountId;

            if (!summary[accountId]) {
                summary[accountId] = {
                    accountId,
                    totalEffectiveCost: 0,
                    totalListCost: 0,
                    recordCount: 0,
                    allocationMethods: new Set()
                };
            }

            summary[accountId].totalEffectiveCost += record.EffectiveCost || 0;
            summary[accountId].totalListCost += record.ListCost || 0;
            summary[accountId].recordCount++;
            if (record.x_finault_allocation_method) {
                summary[accountId].allocationMethods.add(record.x_finault_allocation_method);
            }

            details.push({
                accountId,
                chargeType: record.ChargeType,
                chargeDescription: record.ChargeDescription,
                effectiveCost: record.EffectiveCost,
                allocationMethod: record.x_finault_allocation_method
            });
        }

        // Convert Sets to Arrays
        for (const account of Object.values(summary)) {
            account.allocationMethods = Array.from(account.allocationMethods);
        }

        return {
            timestamp: new Date().toISOString(),
            totalRecords: allocations.length,
            summary,
            details
        };
    }
}

/**
 * Factory functions for creating instances
 */
export function createFOCUSValidator() {
    return new FOCUSValidator();
}

export function createFOCUSNormalizer() {
    return new FOCUSNormalizer();
}

export function createFOCUSExporter() {
    return new FOCUSExporter();
}

export function createSharedCostAllocator() {
    return new SharedCostAllocator();
}
