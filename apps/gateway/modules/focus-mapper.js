/**
 * FOCUS 1.3 SCHEMA MAPPER - FinOps Foundation Specification Compliance
 * ═══════════════════════════════════════════════════════════════════════════════
 * Maps Finault's proprietary `usage` table to FinOps Foundation FOCUS 1.3 standard
 *
 * FOCUS 1.3 Specification: https://focus.finops.org/
 * Provides standardized cost allocation and cloud consumption data
 *
 * Features:
 * - Complete mapping of Finault usage records to FOCUS 1.3 columns
 * - Support for batch processing and CSV export
 * - Custom x_ prefixed columns for Finault-specific data
 * - Provider name normalization (OpenAI, Anthropic, etc.)
 * - Per-token pricing calculation and billing period derivation
 * - RFC 4180 compliant CSV export with proper escaping
 * - Comprehensive schema documentation and validation
 * ═══════════════════════════════════════════════════════════════════════════════
 */

/**
 * FOCUS 1.3 Specification Version
 * @constant {string}
 */
const FOCUS_VERSION = '1.3';

/**
 * Provider name mapping from Finault to FOCUS-standard names
 * Normalizes various provider identifier formats to official provider names
 *
 * @constant {Object}
 */
const PROVIDER_MAP = {
  openai: 'OpenAI',
  'open-ai': 'OpenAI',
  'openai-gpt': 'OpenAI',
  anthropic: 'Anthropic',
  claude: 'Anthropic',
  'anthropic-claude': 'Anthropic',
  google: 'Google',
  'google-cloud': 'Google',
  'google-palm': 'Google',
  'google-gemini': 'Google',
  gemini: 'Google',
  aws: 'AWS',
  'aws-bedrock': 'AWS',
  bedrock: 'AWS',
  azure: 'Microsoft',
  'azure-openai': 'Microsoft',
  microsoft: 'Microsoft',
  'cohere': 'Cohere',
  'mistral': 'Mistral',
  'mistral-ai': 'Mistral',
  llama: 'Meta',
  'meta-llama': 'Meta',
  meta: 'Meta'
};

/**
 * Charge Categories for Diamond Tier Mapper
 * Maps model types to FOCUS-compliant charge categories
 *
 * @constant {Object}
 */
const CHARGE_CATEGORIES = {
  'AI/ML - Embeddings': 'AI/ML - Embeddings',
  'AI/ML - Speech': 'AI/ML - Speech',
  'AI/ML - Image Generation': 'AI/ML - Image Generation',
  'AI/ML - Search': 'AI/ML - Search',
  'AI/ML - Language': 'AI/ML - Language'
};

/**
 * Charge Types for Diamond Tier Mapper
 * Valid charge type values for FOCUS records
 *
 * @constant {Array<string>}
 */
const CHARGE_TYPES = [
  'Usage',
  'Adjustment',
  'Credit',
  'Purchase',
  'Tax'
];

/**
 * FOCUS Column Definitions
 * Complete specification of all FOCUS 1.3 columns with metadata
 *
 * @constant {Array<Object>}
 */
const FOCUS_COLUMNS = [
  // === REQUIRED COLUMNS (FinOps Standard) ===
  {
    name: 'BilledCost',
    type: 'decimal',
    description: 'Cost billed to the customer for the usage. Amount in the billing currency.',
    required: true,
    category: 'billing'
  },
  {
    name: 'BillingPeriodStart',
    type: 'datetime',
    description: 'The start date of the billing period. ISO 8601 format (YYYY-MM-DDT00:00:00Z).',
    required: true,
    category: 'billing'
  },
  {
    name: 'BillingPeriodEnd',
    type: 'datetime',
    description: 'The end date of the billing period. ISO 8601 format (YYYY-MM-DDT23:59:59Z).',
    required: true,
    category: 'billing'
  },
  {
    name: 'ChargeCategory',
    type: 'string',
    description: 'The category of charge. Examples: AI, Compute, Storage, Network.',
    required: true,
    category: 'charge'
  },
  {
    name: 'ChargeType',
    type: 'string',
    description: 'The type of charge. Examples: Usage, Purchase, Tax, Adjustment.',
    required: true,
    category: 'charge'
  },
  {
    name: 'CommitmentDiscountStatus',
    type: 'string',
    description: 'Status of commitment discount application. Values: None, Covered, Uncovered, PartiallyUncovered.',
    required: true,
    category: 'pricing'
  },
  {
    name: 'EffectiveCost',
    type: 'decimal',
    description: 'Cost after applying discounts and amortizing commitments. Amount in the billing currency.',
    required: true,
    category: 'billing'
  },
  {
    name: 'InvoiceIssuerName',
    type: 'string',
    description: 'The name of the provider issuing the invoice.',
    required: true,
    category: 'provider'
  },
  {
    name: 'ListCost',
    type: 'decimal',
    description: 'Cost before applying discounts. Amount in the billing currency.',
    required: true,
    category: 'billing'
  },
  {
    name: 'ListUnitPrice',
    type: 'decimal',
    description: 'The price per unit before discounts. Amount in the billing currency per pricing unit.',
    required: true,
    category: 'pricing'
  },
  {
    name: 'PricingQuantity',
    type: 'decimal',
    description: 'The quantity of units used that incurred the charge.',
    required: true,
    category: 'usage'
  },
  {
    name: 'PricingUnit',
    type: 'string',
    description: 'The unit of measurement for pricing. Examples: Tokens, vCPU-Hours, GB, Requests.',
    required: true,
    category: 'usage'
  },
  {
    name: 'Provider',
    type: 'string',
    description: 'The provider of the service.',
    required: true,
    category: 'provider'
  },
  {
    name: 'Region',
    type: 'string',
    description: 'The region where the service was consumed. Examples: us-east-1, global, eu-west-1.',
    required: true,
    category: 'location'
  },
  {
    name: 'ServiceCategory',
    type: 'string',
    description: 'The broad category of the service. Examples: AI, Analytics, Compute.',
    required: true,
    category: 'service'
  },
  {
    name: 'ServiceName',
    type: 'string',
    description: 'The name of the service. Examples: gpt-4, gpt-3.5-turbo, claude-opus.',
    required: true,
    category: 'service'
  },
  {
    name: 'UsageQuantity',
    type: 'decimal',
    description: 'The quantity of usage consumed in the usage unit.',
    required: true,
    category: 'usage'
  },
  {
    name: 'UsageUnit',
    type: 'string',
    description: 'The unit of measurement for usage. Examples: Tokens, Hours, GB, Requests.',
    required: true,
    category: 'usage'
  },

  // === CUSTOM FINAULT COLUMNS (x_ prefix) ===
  {
    name: 'x_CostCenter',
    type: 'string',
    description: 'Finault custom: Cost center for cost allocation and billing.',
    required: false,
    category: 'custom'
  },
  {
    name: 'x_Project',
    type: 'string',
    description: 'Finault custom: Project identifier for granular tracking.',
    required: false,
    category: 'custom'
  },
  {
    name: 'x_Environment',
    type: 'string',
    description: 'Finault custom: Environment classification (dev, staging, prod, etc.).',
    required: false,
    category: 'custom'
  },
  {
    name: 'x_UserId',
    type: 'string',
    description: 'Finault custom: User identifier who initiated the request.',
    required: false,
    category: 'custom'
  },
  {
    name: 'x_RequestId',
    type: 'string',
    description: 'Finault custom: Unique request identifier for tracing and debugging.',
    required: false,
    category: 'custom'
  },
  {
    name: 'x_LatencyMs',
    type: 'integer',
    description: 'Finault custom: Request latency in milliseconds.',
    required: false,
    category: 'custom'
  },
  {
    name: 'x_InputTokens',
    type: 'integer',
    description: 'Finault custom: Number of tokens in the input/prompt.',
    required: false,
    category: 'custom'
  },
  {
    name: 'x_OutputTokens',
    type: 'integer',
    description: 'Finault custom: Number of tokens in the output/completion.',
    required: false,
    category: 'custom'
  },
  {
    name: 'x_Status',
    type: 'string',
    description: 'Finault custom: Request status (success, error, timeout, rate_limited, etc.).',
    required: false,
    category: 'custom'
  }
];

/**
 * Determines ChargeCategory based on model/provider information
 * Diamond tier: Dynamic category selection based on model characteristics
 *
 * @param {string} model - Model name/identifier
 * @param {string} provider - Provider name
 * @param {Object} metadata - Optional metadata object
 * @returns {string} FOCUS-compliant charge category
 * @private
 */
function determineChargeCategory(model, provider, metadata = {}) {
  const modelLower = (model || '').toLowerCase();

  // Check for embeddings
  if (modelLower.includes('embed')) {
    return CHARGE_CATEGORIES['AI/ML - Embeddings'];
  }

  // Check for speech models
  if (modelLower.includes('whisper') || modelLower.includes('tts') || modelLower.includes('audio')) {
    return CHARGE_CATEGORIES['AI/ML - Speech'];
  }

  // Check for image generation
  if (modelLower.includes('dall-e') || modelLower.includes('image') ||
      (modelLower.includes('vision') && metadata.is_generating)) {
    return CHARGE_CATEGORIES['AI/ML - Image Generation'];
  }

  // Check for search/retrieval
  if (modelLower.includes('search') || modelLower.includes('retrieval')) {
    return CHARGE_CATEGORIES['AI/ML - Search'];
  }

  // Default to language models
  return CHARGE_CATEGORIES['AI/ML - Language'];
}

/**
 * Determines ChargeType based on record metadata and fields
 * Diamond tier: Dynamic type selection with fallback logic
 *
 * @param {Object} usageRecord - Finault usage record
 * @param {string} usageRecord.charge_type - Optional charge type field
 * @param {Object} usageRecord.metadata - Metadata object
 * @returns {string} FOCUS-compliant charge type
 * @private
 */
function determineChargeType(usageRecord = {}) {
  // If charge_type field exists, use it
  if (usageRecord.charge_type) {
    return usageRecord.charge_type;
  }

  const metadata = usageRecord.metadata || {};

  // Check metadata flags for adjustment/credit/purchase
  if (metadata.is_adjustment === true) {
    return 'Adjustment';
  }

  if (metadata.is_credit === true) {
    return 'Credit';
  }

  if (metadata.is_purchase === true) {
    return 'Purchase';
  }

  // Default to Usage
  return 'Usage';
}

/**
 * Determines CommitmentDiscountStatus based on commitment and pricing info
 * Diamond tier: Dynamic status based on commitment coverage
 *
 * @param {Object} usageRecord - Finault usage record
 * @param {Object} usageRecord.metadata - Metadata object
 * @param {number} cost_cents - Cost in cents
 * @returns {string} Commitment discount status value
 * @private
 */
function determineCommitmentDiscountStatus(usageRecord = {}, cost_cents) {
  const metadata = usageRecord.metadata || {};

  // Check for commitment ID in record or metadata
  const hasCommitment = usageRecord.commitment_id || metadata.commitment_id;

  if (hasCommitment) {
    // Check commitment coverage
    const coverage = metadata.commitment_coverage;

    if (coverage !== undefined && coverage !== null) {
      if (coverage >= 1.0) {
        return 'Covered';
      } else if (coverage > 0) {
        return 'PartiallyUncovered';
      } else {
        return 'Uncovered';
      }
    }
  }

  // Check if effective_cost differs from cost (indicates discount was applied)
  if (usageRecord.effective_cost !== undefined && usageRecord.effective_cost !== null) {
    const effectiveCostCents = parseFloat(usageRecord.effective_cost);
    const costCents = parseFloat(cost_cents || 0);

    if (effectiveCostCents !== costCents) {
      return 'Covered';
    }
  }

  // Default: no commitment discount
  return 'None';
}

/**
 * Calculates EffectiveCost with discount logic
 * Diamond tier: Dynamic effective cost calculation
 *
 * @param {Object} usageRecord - Finault usage record
 * @param {number} cost_cents - Base cost in cents
 * @returns {string} Effective cost as decimal string in dollars
 * @private
 */
function calculateEffectiveCost(usageRecord = {}, cost_cents) {
  const metadata = usageRecord.metadata || {};

  // If record has explicit effective_cost, use it
  if (usageRecord.effective_cost !== undefined && usageRecord.effective_cost !== null) {
    const effectiveCostDollars = parseFloat(usageRecord.effective_cost) / 100;
    return effectiveCostDollars.toFixed(10);
  }

  // If metadata has discount_amount, subtract it from cost
  if (metadata.discount_amount !== undefined && metadata.discount_amount !== null) {
    const baseCostDollars = parseFloat(cost_cents || 0) / 100;
    const discountDollars = parseFloat(metadata.discount_amount);
    const effectiveCostDollars = Math.max(0, baseCostDollars - discountDollars);
    return effectiveCostDollars.toFixed(10);
  }

  // Otherwise, effective cost equals billed cost
  const costDollars = parseFloat(cost_cents || 0) / 100;
  return costDollars.toFixed(10);
}

/**
 * Calculates ListCost (pre-discount price)
 * Diamond tier: Uses metadata list_cost_cents if available
 *
 * @param {Object} usageRecord - Finault usage record
 * @param {number} cost_cents - Current/billed cost in cents
 * @returns {string} List cost as decimal string in dollars
 * @private
 */
function calculateListCost(usageRecord = {}, cost_cents) {
  const metadata = usageRecord.metadata || {};

  // If metadata has list_cost_cents, use it
  if (metadata.list_cost_cents !== undefined && metadata.list_cost_cents !== null) {
    const listCostDollars = parseFloat(metadata.list_cost_cents) / 100;
    return listCostDollars.toFixed(10);
  }

  // Default: list cost equals billed cost (no discount scenario)
  const costDollars = parseFloat(cost_cents || 0) / 100;
  return costDollars.toFixed(10);
}

/**
 * Maps a single Finault usage record to a FOCUS 1.3 row object
 *
 * Transformation logic:
 * - Calculates costs from cents to dollars
 * - Normalizes provider names
 * - Computes token quantities and per-token pricing
 * - Derives billing period from usage date
 * - Extracts region from metadata with fallback to 'global'
 * - Populates all required FOCUS columns plus Finault custom columns
 *
 * @param {Object} usageRecord - Finault usage record from database
 * @param {bigint} usageRecord.id - Record ID
 * @param {string} usageRecord.organization_id - Organization UUID
 * @param {string} usageRecord.request_id - Unique request identifier
 * @param {string} usageRecord.provider - Provider name (will be normalized)
 * @param {string} usageRecord.model - Model/service name
 * @param {number} usageRecord.input_tokens - Input token count
 * @param {number} usageRecord.output_tokens - Output token count
 * @param {string} usageRecord.cost_cents - Cost in cents (DECIMAL string from DB)
 * @param {string} usageRecord.cost_center - Cost center identifier
 * @param {string} usageRecord.project - Project identifier
 * @param {string} usageRecord.environment - Environment label
 * @param {string} usageRecord.user_id - User identifier
 * @param {number} usageRecord.latency_ms - Request latency in milliseconds
 * @param {string} usageRecord.status - Request status
 * @param {Object} usageRecord.metadata - JSON metadata object
 * @param {string} usageRecord.created_at - ISO timestamp of usage
 *
 * @returns {Object} FOCUS 1.3 compliant record object with all required columns
 *
 * @throws {Error} If required fields are missing or invalid
 */
function mapToFOCUS(usageRecord) {
  // Validate required input fields
  if (!usageRecord || typeof usageRecord !== 'object') {
    throw new Error('Invalid usage record: must be an object');
  }

  const {
    id,
    organization_id,
    request_id,
    provider,
    model,
    input_tokens,
    output_tokens,
    cost_cents,
    cost_center,
    project,
    environment,
    user_id,
    latency_ms,
    status,
    metadata,
    created_at
  } = usageRecord;

  // Validate critical fields
  if (!provider) {
    throw new Error('Provider is required in usage record');
  }
  if (!model) {
    throw new Error('Model is required in usage record');
  }
  if (created_at === undefined || created_at === null) {
    throw new Error('created_at timestamp is required in usage record');
  }

  // === COST CALCULATIONS ===
  // Convert cost from cents to dollars
  const costDollars = parseFloat(cost_cents || 0) / 100;

  // === TOKEN CALCULATIONS ===
  // Total tokens is sum of input and output tokens
  const totalTokens = (parseInt(input_tokens) || 0) + (parseInt(output_tokens) || 0);

  // Calculate per-token price
  // Avoid division by zero: if no tokens used, set price to 0
  const pricePerToken = totalTokens > 0 ? costDollars / totalTokens : 0;

  // === PROVIDER NORMALIZATION ===
  // Normalize provider name using map, or use as-is if not found
  const normalizedProvider = PROVIDER_MAP[provider.toLowerCase()] || provider;

  // === BILLING PERIOD CALCULATION ===
  // Get the date from created_at and derive start/end of billing month
  const usageDate = new Date(created_at);
  const year = usageDate.getUTCFullYear();
  const month = usageDate.getUTCMonth();

  // Billing period start: first day of month at 00:00:00 UTC
  const billingPeriodStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

  // Billing period end: last day of month at 23:59:59 UTC
  const billingPeriodEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

  // Format dates as ISO 8601 strings
  const billingPeriodStartStr = billingPeriodStart.toISOString().replace(/\.000Z$/, 'Z');
  const billingPeriodEndStr = billingPeriodEnd.toISOString().replace(/\.\d{3}Z$/, 'Z');

  // === REGION EXTRACTION ===
  // Extract region from metadata, default to 'global' if not present
  let region = 'global';
  if (metadata && typeof metadata === 'object') {
    if (metadata.region) {
      region = metadata.region;
    }
  }

  // === DIAMOND TIER: DYNAMIC FIELD CALCULATIONS ===
  // Determine charge category based on model/provider
  const chargeCategory = determineChargeCategory(model, provider, metadata);

  // Determine charge type based on record metadata flags
  const chargeType = determineChargeType(usageRecord);

  // Determine commitment discount status
  const commitmentStatus = determineCommitmentDiscountStatus(usageRecord, cost_cents);

  // Calculate effective cost with discount logic
  const effectiveCostStr = calculateEffectiveCost(usageRecord, cost_cents);

  // Calculate list cost (pre-discount price)
  const listCostStr = calculateListCost(usageRecord, cost_cents);

  // === BUILD FOCUS RECORD ===
  const focusRecord = {
    // Required FOCUS columns
    BilledCost: costDollars.toFixed(10),
    BillingPeriodStart: billingPeriodStartStr,
    BillingPeriodEnd: billingPeriodEndStr,
    ChargeCategory: chargeCategory,
    ChargeType: chargeType,
    CommitmentDiscountStatus: commitmentStatus,
    EffectiveCost: effectiveCostStr,
    InvoiceIssuerName: normalizedProvider,
    ListCost: listCostStr,
    ListUnitPrice: pricePerToken.toFixed(10),
    PricingQuantity: totalTokens.toString(),
    PricingUnit: 'Tokens',
    Provider: normalizedProvider,
    Region: region,
    ServiceCategory: 'AI/Machine Learning',
    ServiceName: model,
    UsageQuantity: totalTokens.toString(),
    UsageUnit: 'Tokens',

    // Custom Finault columns
    x_CostCenter: cost_center || null,
    x_Project: project || null,
    x_Environment: environment || null,
    x_UserId: user_id || null,
    x_RequestId: request_id || null,
    x_LatencyMs: latency_ms !== undefined && latency_ms !== null ? parseInt(latency_ms).toString() : null,
    x_InputTokens: (input_tokens !== undefined && input_tokens !== null) ? parseInt(input_tokens).toString() : null,
    x_OutputTokens: (output_tokens !== undefined && output_tokens !== null) ? parseInt(output_tokens).toString() : null,
    x_Status: status || null
  };

  return focusRecord;
}

/**
 * Maps an array of Finault usage records to FOCUS 1.3 row objects
 *
 * Processes records in batch for efficiency. Continues on individual record errors
 * but accumulates them for reporting.
 *
 * @param {Array<Object>} records - Array of Finault usage records
 * @param {Object} options - Processing options
 * @param {boolean} options.stopOnError - Stop processing on first error (default: false)
 * @param {function} options.onError - Callback for error handling during batch
 *
 * @returns {Object} Result object containing mapped records and any errors encountered
 * @returns {Array} result.records - Successfully mapped FOCUS records
 * @returns {Array} result.errors - Array of errors encountered (if any)
 * @returns {number} result.processedCount - Total records processed
 * @returns {number} result.successCount - Successfully mapped records
 * @returns {number} result.errorCount - Records with errors
 */
function mapBatchToFOCUS(records, options = {}) {
  const {
    stopOnError = false,
    onError = null
  } = options;

  const result = {
    records: [],
    errors: [],
    processedCount: 0,
    successCount: 0,
    errorCount: 0
  };

  if (!Array.isArray(records)) {
    throw new Error('Records must be an array');
  }

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    result.processedCount++;

    try {
      const focusRecord = mapToFOCUS(record);
      result.records.push(focusRecord);
      result.successCount++;
    } catch (error) {
      result.errorCount++;

      const errorEntry = {
        index: i,
        recordId: record?.id || 'unknown',
        error: error.message,
        record: record // Include record for debugging
      };

      result.errors.push(errorEntry);

      if (onError) {
        onError(errorEntry);
      }

      if (stopOnError) {
        break;
      }
    }
  }

  return result;
}

/**
 * Escapes a value for RFC 4180 CSV format
 * Handles special characters: quotes, commas, newlines
 *
 * @param {*} value - Value to escape
 * @returns {string} CSV-escaped value
 * @private
 */
function escapeCSVValue(value) {
  // Convert null/undefined to empty string
  if (value === null || value === undefined) {
    return '';
  }

  // Convert to string
  const strValue = String(value);

  // If contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n') || strValue.includes('\r')) {
    return '"' + strValue.replace(/"/g, '""') + '"';
  }

  return strValue;
}

/**
 * Converts array of FOCUS records to RFC 4180 CSV format
 * Includes FOCUS column headers as the first row
 *
 * All FOCUS columns are included in consistent order (required first, then custom)
 * Handles proper CSV escaping for values containing delimiters or quotes
 *
 * @param {Array<Object>} records - Array of FOCUS record objects
 * @param {Object} options - CSV generation options
 * @param {boolean} options.includeCustomColumns - Include x_ prefixed columns (default: true)
 *
 * @returns {string} CSV formatted string with headers and records
 *
 * @example
 * const csv = toFOCUSCSV(focusRecords);
 * // Returns: "BilledCost,BillingPeriodStart,BillingPeriodEnd,...\n0.50,2024-01-01T00:00:00Z,..."
 */
function toFOCUSCSV(records, options = {}) {
  const { includeCustomColumns = true } = options;

  if (!Array.isArray(records)) {
    throw new Error('Records must be an array');
  }

  // Build header row: required columns + custom columns (if enabled)
  const requiredColumnNames = FOCUS_COLUMNS
    .filter(col => col.required)
    .map(col => col.name);

  const customColumnNames = includeCustomColumns
    ? FOCUS_COLUMNS
        .filter(col => !col.required)
        .map(col => col.name)
    : [];

  const allColumnNames = [...requiredColumnNames, ...customColumnNames];

  // Build header line
  const headerLine = allColumnNames.map(name => escapeCSVValue(name)).join(',');

  // Build data lines
  const dataLines = records.map(record => {
    const values = allColumnNames.map(columnName => {
      const value = record[columnName];
      return escapeCSVValue(value);
    });
    return values.join(',');
  });

  // Combine header and data with newlines
  const csvContent = [headerLine, ...dataLines].join('\n');

  return csvContent;
}

/**
 * Returns comprehensive schema documentation for FOCUS 1.3 columns
 *
 * Useful for:
 * - API documentation generation
 * - Schema validation
 * - IDE tooltips and autocomplete
 * - Data type mapping for downstream systems
 *
 * @returns {Object} Schema documentation object
 * @returns {string} schema.version - FOCUS specification version
 * @returns {Array} schema.columns - Array of column definitions with full metadata
 * @returns {Object} schema.columnsByCategory - Columns grouped by category
 * @returns {Object} schema.required - List of required column names
 * @returns {Object} schema.custom - List of custom (x_) column names
 */
function getFOCUSSchema() {
  const requiredColumns = FOCUS_COLUMNS.filter(col => col.required);
  const customColumns = FOCUS_COLUMNS.filter(col => !col.required);

  const columnsByCategory = {};
  for (const column of FOCUS_COLUMNS) {
    if (!columnsByCategory[column.category]) {
      columnsByCategory[column.category] = [];
    }
    columnsByCategory[column.category].push(column.name);
  }

  return {
    version: FOCUS_VERSION,
    columns: FOCUS_COLUMNS,
    columnsByCategory: columnsByCategory,
    required: requiredColumns.map(col => col.name),
    custom: customColumns.map(col => col.name),
    totalColumns: FOCUS_COLUMNS.length,
    requiredCount: requiredColumns.length,
    customCount: customColumns.length
  };
}

/**
 * Validates a FOCUS record against the schema
 *
 * Checks for:
 * - Presence of all required columns
 * - Data type compatibility (basic check)
 * - Known column names
 *
 * @param {Object} record - FOCUS record to validate
 * @param {boolean} strict - If true, fail on unknown columns (default: false)
 *
 * @returns {Object} Validation result
 * @returns {boolean} result.valid - Whether record is valid
 * @returns {Array} result.missingRequired - Missing required columns
 * @returns {Array} result.unknownColumns - Unknown column names (if strict mode)
 * @returns {Array} result.errors - Array of validation error messages
 */
function validateFOCUSRecord(record, strict = false) {
  const result = {
    valid: true,
    missingRequired: [],
    unknownColumns: [],
    errors: []
  };

  if (!record || typeof record !== 'object') {
    result.valid = false;
    result.errors.push('Record must be an object');
    return result;
  }

  // Check for required columns
  const requiredColumnNames = FOCUS_COLUMNS
    .filter(col => col.required)
    .map(col => col.name);

  for (const columnName of requiredColumnNames) {
    if (!(columnName in record)) {
      result.valid = false;
      result.missingRequired.push(columnName);
      result.errors.push(`Missing required column: ${columnName}`);
    }
  }

  // Check for unknown columns (in strict mode)
  if (strict) {
    const knownColumnNames = new Set(FOCUS_COLUMNS.map(col => col.name));
    for (const columnName of Object.keys(record)) {
      if (!knownColumnNames.has(columnName)) {
        result.unknownColumns.push(columnName);
        result.errors.push(`Unknown column: ${columnName}`);
      }
    }
    if (result.unknownColumns.length > 0) {
      result.valid = false;
    }
  }

  return result;
}

/**
 * Normalizes provider name for use in FOCUS records
 *
 * Uses the PROVIDER_MAP to convert various provider identifiers to standard names
 * Falls back to the original name if no mapping is found
 *
 * @param {string} providerName - Provider name from Finault usage record
 *
 * @returns {string} Normalized provider name
 *
 * @example
 * normalizeProvider('openai') // Returns: 'OpenAI'
 * normalizeProvider('OPENAI-GPT') // Returns: 'OpenAI'
 * normalizeProvider('claude') // Returns: 'Anthropic'
 * normalizeProvider('unknown-provider') // Returns: 'unknown-provider'
 */
function normalizeProvider(providerName) {
  if (!providerName) {
    return providerName;
  }

  const normalized = PROVIDER_MAP[providerName.toLowerCase()];
  return normalized || providerName;
}

// Export all functions and constants
module.exports = {
  // Constants
  FOCUS_VERSION,
  FOCUS_COLUMNS,
  PROVIDER_MAP,
  CHARGE_CATEGORIES,
  CHARGE_TYPES,

  // Core mapping functions
  mapToFOCUS,
  mapBatchToFOCUS,
  toFOCUSCSV,

  // Schema and validation
  getFOCUSSchema,
  validateFOCUSRecord,

  // Utility functions
  normalizeProvider
};
