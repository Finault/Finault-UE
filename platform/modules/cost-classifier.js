/**
 * ASU 2018-15 Cost Classifier Module
 *
 * Classifies AI service costs per FASB ASU 2018-15 (Subtopic 350-40):
 * Customer's Accounting for Implementation Costs Incurred in a Cloud Computing
 * Arrangement That Is a Service Contract
 *
 * @module cost-classifier
 * @requires CommonJS (Cloudflare Workers compatible)
 *
 * Accounting Treatment:
 * - Capitalize: Implementation costs (development stage - design through testing)
 * - Expense: Preliminary costs and post-implementation costs (usage/operations)
 * - Reference: ASC 350-40 (Internal-use software guidance applied to CCAs)
 */

/**
 * ASU 2018-15 Full Citation
 * FASB Accounting Standards Update 2018-15 (Topic 350 Intangibles - Goodwill and Other)
 * Subtopic 350-40: Internal Use Software
 * @constant {string}
 */
const ASU_REFERENCE = 'FASB ASU 2018-15 (Subtopic 350-40-25)';

/**
 * Project Stages per ASC 350-40
 * Maps the three project stages to accounting classification
 * Reference: ASC 350-40-25-1 (applicability), ASC 350-40-25-13 through 25-20 (stages)
 * @constant {Object}
 */
const PROJECT_STAGES = {
  preliminary: {
    name: 'Preliminary Project Stage',
    classification: 'expense',
    description: 'Planning, evaluation, vendor selection, benchmarking. Costs incurred before design/development begins.',
    asc_reference: 'ASC 350-40-25-13, ASC 720-15-25-1',
    ai_examples: [
      'AI provider evaluation and POC',
      'Model benchmarking against alternatives',
      'Feasibility studies for AI integration',
      'Vendor RFP and selection process'
    ]
  },
  application_development: {
    name: 'Application Development Stage',
    classification: 'capitalize',
    description: 'Design, configuration, custom coding, custom training/tuning, integration, and testing. Costs directly attributable to building the AI solution.',
    asc_reference: 'ASC 350-40-25-14, ASC 350-40-25-15, ASC 350-40-25-18',
    ai_examples: [
      'Custom model fine-tuning on proprietary data',
      'Production-grade prompt engineering',
      'RAG pipeline configuration and integration',
      'Custom evaluation and testing of trained models',
      'Integration with internal systems',
      'Data preparation and model validation'
    ]
  },
  post_implementation: {
    name: 'Post-Implementation Stage',
    classification: 'expense',
    description: 'Ongoing operations, maintenance, monitoring, data migration, training. Costs incurred after the module is ready for intended use.',
    asc_reference: 'ASC 350-40-25-19, ASC 350-40-25-20',
    ai_examples: [
      'Inference API calls (production usage)',
      'Operational monitoring and alerts',
      'Model monitoring and drift detection',
      'Data migration and deployment',
      'End-user training',
      'Ongoing vendor support'
    ]
  }
};

/**
 * Classification Rules with ASC Paragraph References
 *
 * These rules are evaluated in priority order:
 * 1. High confidence rules (direct ASU 2018-15 signals)
 * 2. Medium confidence rules (contextual indicators)
 * 3. Low confidence rules (default/fallback)
 *
 * The module applies the first matching rule to a cost record.
 *
 * Reference: ASC 350-40-25-18 (scope of capitalizable implementation costs)
 * @constant {Array<Object>}
 */
const CLASSIFICATION_RULES = [
  // ========== HIGH CONFIDENCE: Development Stage Activities ==========
  // ASC 350-40-25-18: "Costs directly attributable to bringing the module to the point of intended use"
  {
    signal: 'endpoint_type',
    value: 'training',
    classification: 'capitalize',
    confidence: 'high',
    rationale: 'Custom model training is part of application development per ASC 350-40-25-14 (designing and configuring the application).',
    asc_paragraph: 'ASC 350-40-25-14, ASC 350-40-25-18'
  },
  {
    signal: 'endpoint_type',
    value: 'fine-tune',
    classification: 'capitalize',
    confidence: 'high',
    rationale: 'Fine-tuning on proprietary data is customization per ASC 350-40-25-14 (designing and configuring the application for use by the customer).',
    asc_paragraph: 'ASC 350-40-25-14, ASC 350-40-25-18'
  },
  {
    signal: 'model_type',
    value: 'fine-tuned',
    classification: 'capitalize',
    confidence: 'high',
    rationale: 'Fine-tuned models represent a custom application asset per ASC 350-40-25-15 (customization and configuration activities).',
    asc_paragraph: 'ASC 350-40-25-15, ASC 350-40-25-18'
  },
  {
    signal: 'model_type',
    value: 'custom',
    classification: 'capitalize',
    confidence: 'high',
    rationale: 'Custom models represent customization activities and are capitalizable per ASC 350-40-25-15.',
    asc_paragraph: 'ASC 350-40-25-15, ASC 350-40-25-18'
  },
  {
    signal: 'metadata.phase',
    value: 'development',
    classification: 'capitalize',
    confidence: 'high',
    rationale: 'Development phase activities fall within application development stage per ASC 350-40-25-14.',
    asc_paragraph: 'ASC 350-40-25-14'
  },
  {
    signal: 'metadata.phase',
    value: 'testing',
    classification: 'capitalize',
    confidence: 'high',
    rationale: 'Testing activities during development are capitalizable per ASC 350-40-25-14 (design and testing).',
    asc_paragraph: 'ASC 350-40-25-14, ASC 350-40-25-18'
  },
  {
    signal: 'metadata.purpose',
    value: 'training',
    classification: 'capitalize',
    confidence: 'high',
    rationale: 'Training activities are part of building the AI solution and are capitalizable per ASC 350-40-25-18.',
    asc_paragraph: 'ASC 350-40-25-18'
  },
  {
    signal: 'metadata.purpose',
    value: 'fine-tuning',
    classification: 'capitalize',
    confidence: 'high',
    rationale: 'Fine-tuning for production use is customization per ASC 350-40-25-15.',
    asc_paragraph: 'ASC 350-40-25-15, ASC 350-40-25-18'
  },
  {
    signal: 'metadata.purpose',
    value: 'evaluation',
    classification: 'capitalize',
    confidence: 'high',
    rationale: 'Evaluation of custom models during development stage is capitalizable per ASC 350-40-25-14.',
    asc_paragraph: 'ASC 350-40-25-14'
  },

  // ========== MEDIUM CONFIDENCE: Development Stage Context ==========
  {
    signal: 'request_pattern',
    value: 'one-time-setup',
    classification: 'capitalize',
    confidence: 'medium',
    rationale: 'One-time setup costs are typically development stage activities and are directly attributable to bringing the module to intended use per ASC 350-40-25-18.',
    asc_paragraph: 'ASC 350-40-25-18'
  },
  {
    signal: 'request_pattern',
    value: 'batch-config',
    classification: 'capitalize',
    confidence: 'medium',
    rationale: 'Batch configuration activities during development are capitalizable per ASC 350-40-25-14.',
    asc_paragraph: 'ASC 350-40-25-14, ASC 350-40-25-18'
  },
  {
    signal: 'metadata.phase',
    value: 'staging',
    classification: 'capitalize',
    confidence: 'medium',
    rationale: 'Staging phase is part of development stage before module is ready for intended use per ASC 350-40-25-14.',
    asc_paragraph: 'ASC 350-40-25-14'
  },

  // ========== HIGH CONFIDENCE: Post-Implementation/Operations ==========
  // ASC 350-40-25-20: Post-implementation activities are expensed
  {
    signal: 'endpoint_type',
    value: 'inference',
    classification: 'expense',
    confidence: 'high',
    rationale: 'Inference API calls are post-implementation usage and should be expensed per ASC 350-40-25-20 (post-implementation activities).',
    asc_paragraph: 'ASC 350-40-25-20'
  },
  {
    signal: 'endpoint_type',
    value: 'chat',
    classification: 'expense',
    confidence: 'high',
    rationale: 'Chat endpoints represent production usage which is post-implementation and expensed per ASC 350-40-25-20.',
    asc_paragraph: 'ASC 350-40-25-20'
  },
  {
    signal: 'endpoint_type',
    value: 'completion',
    classification: 'expense',
    confidence: 'high',
    rationale: 'Completion endpoints represent production usage which is post-implementation and expensed per ASC 350-40-25-20.',
    asc_paragraph: 'ASC 350-40-25-20'
  },
  {
    signal: 'endpoint_type',
    value: 'embedding',
    classification: 'expense',
    confidence: 'high',
    rationale: 'Embedding endpoints represent production usage which is post-implementation and expensed per ASC 350-40-25-20.',
    asc_paragraph: 'ASC 350-40-25-20'
  },
  {
    signal: 'model_type',
    value: 'base',
    classification: 'expense',
    confidence: 'high',
    rationale: 'Usage of base/pre-trained models without customization is post-implementation and expensed per ASC 350-40-25-20.',
    asc_paragraph: 'ASC 350-40-25-20'
  },
  {
    signal: 'request_pattern',
    value: 'recurring',
    classification: 'expense',
    confidence: 'high',
    rationale: 'Recurring usage patterns are post-implementation operations per ASC 350-40-25-20.',
    asc_paragraph: 'ASC 350-40-25-20'
  },
  {
    signal: 'request_pattern',
    value: 'on-demand',
    classification: 'expense',
    confidence: 'high',
    rationale: 'On-demand production usage is post-implementation and expensed per ASC 350-40-25-20.',
    asc_paragraph: 'ASC 350-40-25-20'
  },
  {
    signal: 'metadata.phase',
    value: 'production',
    classification: 'expense',
    confidence: 'high',
    rationale: 'Production phase is post-implementation per ASC 350-40-25-20; costs should be expensed.',
    asc_paragraph: 'ASC 350-40-25-20'
  },
  {
    signal: 'metadata.purpose',
    value: 'inference',
    classification: 'expense',
    confidence: 'high',
    rationale: 'Inference activities are post-implementation usage and expensed per ASC 350-40-25-20.',
    asc_paragraph: 'ASC 350-40-25-20'
  },
  {
    signal: 'metadata.purpose',
    value: 'serving',
    classification: 'expense',
    confidence: 'high',
    rationale: 'Serving endpoints represent post-implementation usage and are expensed per ASC 350-40-25-20.',
    asc_paragraph: 'ASC 350-40-25-20'
  }
];

/**
 * GL Account Code Mapping
 * Maps classification to GL account codes for financial reporting
 *
 * Expense Accounts (6100 series - Operating Expenses)
 * Capitalize Accounts (1800 series - Intangible Assets)
 *
 * @constant {Object}
 */
const GL_ACCOUNT_MAPPING = {
  capitalize: {
    code: '1800',
    series: '1800-1899',
    name: 'Intangible Asset - AI Implementation Costs',
    category: 'Asset',
    subcategory: 'Internally Developed Intangible Asset',
    detail_accounts: {
      '1800': 'AI Implementation - Capitalized Costs (Control)',
      '1801': 'AI Implementation - Model Development',
      '1802': 'AI Implementation - Integration & Testing',
      '1803': 'AI Implementation - Configuration & Training',
      '1804': 'AI Implementation - RAG Pipelines'
    }
  },
  expense: {
    code: '6100',
    series: '6100-6199',
    name: 'AI Services Expense',
    category: 'Expense',
    subcategory: 'Direct Operating Expenses',
    detail_accounts: {
      '6100': 'AI Services Expense (Control)',
      '6101': 'AI API Usage - Inference',
      '6102': 'AI API Usage - Training',
      '6103': 'AI Model Operations & Maintenance',
      '6104': 'AI Data Processing & Migration'
    }
  }
};

/**
 * Amortization Guidance for Capitalized AI Implementation Costs
 *
 * Capitalized costs should be amortized over the service contract term.
 * Start amortization when the module is ready for intended use.
 *
 * Reference: ASC 350-40-35-6 (amortization period)
 * Reference: ASC 360-10-35-43 (when amortization begins - when module is ready for use)
 *
 * @constant {Object}
 */
const AMORTIZATION_GUIDANCE = {
  method: 'straight-line',
  period: 'service_contract_term',
  start: 'when_module_ready_for_intended_use',
  reference: 'ASC 350-40-35-6, ASC 360-10-35-43',
  description: 'Capitalize implementation costs and amortize straight-line over the service contract term, beginning when the module is ready for intended use (typically end of testing phase).',
  practical_guidance: 'For typical SaaS AI implementations, use contract term. If no fixed term, use estimated useful life (3-5 years for AI technology is common but entity-specific).'
};

/**
 * Helper: Get nested property value from object
 * @private
 * @param {Object} obj - Target object
 * @param {string} path - Dot-notation path (e.g., 'metadata.phase')
 * @returns {*} Property value or undefined
 */
function getNestedValue(obj, path) {
  const keys = path.split('.');
  let value = obj;
  for (const key of keys) {
    if (value === null || value === undefined) return undefined;
    value = value[key];
  }
  return value;
}

/**
 * Classifies a single cost record per ASU 2018-15
 *
 * Classification Priority:
 * 1. Allocation rule override (if present)
 * 2. CLASSIFICATION_RULES in order (first match wins)
 * 3. Default: expense (conservative treatment)
 *
 * @param {Object} usageRecord - A single usage/cost record
 * @param {string} [usageRecord.endpoint_type] - Type of endpoint ('training', 'fine-tune', 'inference', etc.)
 * @param {string} [usageRecord.model_type] - Type of model ('fine-tuned', 'custom', 'base')
 * @param {string} [usageRecord.request_pattern] - Pattern of requests ('one-time-setup', 'batch-config', 'recurring', 'on-demand')
 * @param {Object} [usageRecord.metadata] - Additional metadata object
 * @param {string} [usageRecord.metadata.phase] - Project phase ('development', 'testing', 'staging', 'production')
 * @param {string} [usageRecord.metadata.purpose] - Purpose of cost ('training', 'fine-tuning', 'evaluation', 'inference', 'serving')
 * @param {number} [usageRecord.cost] - Cost amount
 *
 * @param {Object} [allocationRule] - Optional allocation rule to override classification
 * @param {string} [allocationRule.cost_classification] - Override classification ('capitalize' or 'expense')
 * @param {string} [allocationRule.cost_classification_rationale] - Override rationale
 * @param {string} [allocationRule.cost_classification_reason] - Override reason
 *
 * @returns {Object} Classification result
 * @returns {string} result.classification - 'capitalize' or 'expense'
 * @returns {string} result.confidence - 'high', 'medium', or 'low'
 * @returns {string} result.rationale - Explanation of classification decision
 * @returns {string} result.asuReference - ASC paragraph reference
 * @returns {string} result.stage - Project stage name
 * @returns {string} result.glAccountCode - GL account code
 * @returns {string} result.glAccountName - GL account name
 * @returns {boolean} result.isOverride - Whether allocation rule was applied
 */
function classifyCost(usageRecord, allocationRule) {
  // Check for allocation rule override first
  if (allocationRule && allocationRule.cost_classification) {
    const glData = GL_ACCOUNT_MAPPING[allocationRule.cost_classification];
    const stage = allocationRule.cost_classification === 'capitalize'
      ? PROJECT_STAGES.application_development
      : PROJECT_STAGES.preliminary;

    return {
      classification: allocationRule.cost_classification,
      confidence: 'high',
      rationale: allocationRule.cost_classification_rationale || allocationRule.cost_classification_reason || 'Override by allocation rule',
      asuReference: ASU_REFERENCE,
      stage: stage.name,
      glAccountCode: glData.code,
      glAccountName: glData.name,
      isOverride: true
    };
  }

  // Apply classification rules in order
  for (const rule of CLASSIFICATION_RULES) {
    const value = getNestedValue(usageRecord, rule.signal);
    if (value === rule.value) {
      const glData = GL_ACCOUNT_MAPPING[rule.classification];
      const stage = rule.classification === 'capitalize'
        ? PROJECT_STAGES.application_development
        : PROJECT_STAGES.post_implementation;

      return {
        classification: rule.classification,
        confidence: rule.confidence,
        rationale: rule.rationale,
        asuReference: rule.asc_paragraph,
        stage: stage.name,
        glAccountCode: glData.code,
        glAccountName: glData.name,
        isOverride: false
      };
    }
  }

  // Default: expense (conservative treatment per ASC 350-40)
  const glData = GL_ACCOUNT_MAPPING.expense;
  return {
    classification: 'expense',
    confidence: 'low',
    rationale: 'No specific signals matched; default to expense treatment (conservative approach per ASU 2018-15).',
    asuReference: 'ASC 350-40-25-20',
    stage: PROJECT_STAGES.post_implementation.name,
    glAccountCode: glData.code,
    glAccountName: glData.name,
    isOverride: false
  };
}

/**
 * Classifies a batch of cost records
 *
 * @param {Array<Object>} records - Array of usage records to classify
 * @param {Array<Object>} [rules] - Array of allocation rules (optional, indexed by some key)
 *
 * @returns {Object} Batch classification results
 * @returns {Array<Object>} result.classified - Array of classified records with original data + classification
 * @returns {Object} result.summary - Summary statistics
 * @returns {number} result.summary.totalRecords - Total records processed
 * @returns {number} result.summary.capitalizedCount - Count of capitalized records
 * @returns {number} result.summary.expensedCount - Count of expensed records
 * @returns {Object} result.summary.byConfidence - Count by confidence level
 */
function classifyBatch(records, rules) {
  rules = rules || {};
  const classified = [];
  const summary = {
    totalRecords: records.length,
    capitalizedCount: 0,
    expensedCount: 0,
    byConfidence: {
      high: 0,
      medium: 0,
      low: 0
    }
  };

  for (const record of records) {
    // Find matching rule if rules array is keyed
    let rule = null;
    if (rules && typeof rules === 'object' && !Array.isArray(rules)) {
      rule = rules[record.id] || rules[record.costId] || null;
    }

    const classification = classifyCost(record, rule);
    const classified_record = Object.assign({}, record, { classification });

    classified.push(classified_record);

    if (classification.classification === 'capitalize') {
      summary.capitalizedCount += 1;
    } else {
      summary.expensedCount += 1;
    }

    summary.byConfidence[classification.confidence] += 1;
  }

  return {
    classified,
    summary
  };
}

/**
 * Generates enhanced journal entry classification data
 *
 * Splits classified records into expense vs. capitalize buckets and produces
 * structured journal entry data with accounting details for close package documentation.
 *
 * @param {Array<Object>} records - Array of original usage records with cost data
 * @param {Array<Object>} [rules] - Array of allocation rules (optional)
 *
 * @returns {Array<Object>} Array of journal entry line items
 * @returns {string} line.description - Description of line
 * @returns {string} line.glAccount - GL account code
 * @returns {string} line.glAccountName - GL account name
 * @returns {number} line.amount - Amount to record
 * @returns {string} line.debitCredit - 'debit' or 'credit'
 * @returns {string} line.classification - 'capitalize' or 'expense'
 * @returns {string} line.asuReference - ASU reference
 * @returns {number} line.recordCount - Number of records in this line
 */
function generateJournalEntryClassification(records, rules) {
  const batchResult = classifyBatch(records, rules);
  const classified = batchResult.classified;

  // Aggregate by classification and GL account
  const capitalizeLines = {};
  const expenseLines = {};

  for (const record of classified) {
    const classification = record.classification.classification;
    const glCode = record.classification.glAccountCode;
    const glName = record.classification.glAccountName;
    const amount = record.cost || 0;

    const key = `${glCode}:${glName}`;
    const target = classification === 'capitalize' ? capitalizeLines : expenseLines;

    if (!target[key]) {
      target[key] = {
        description: `${glName}`,
        glAccount: glCode,
        glAccountName: glName,
        amount: 0,
        debitCredit: 'debit',
        classification: classification,
        asuReference: record.classification.asuReference,
        recordCount: 0
      };
    }

    target[key].amount += amount;
    target[key].recordCount += 1;
  }

  // Build journal entry lines
  const lines = [];

  // Capitalize lines
  for (const key of Object.keys(capitalizeLines).sort()) {
    lines.push(capitalizeLines[key]);
  }

  // Expense lines
  for (const key of Object.keys(expenseLines).sort()) {
    lines.push(expenseLines[key]);
  }

  // Add credit offset if there are amounts
  const totalCapitalized = Object.values(capitalizeLines).reduce((sum, l) => sum + l.amount, 0);
  const totalExpensed = Object.values(expenseLines).reduce((sum, l) => sum + l.amount, 0);
  const totalAmount = totalCapitalized + totalExpensed;

  if (totalAmount > 0) {
    lines.push({
      description: 'Accounts Payable / Accrual',
      glAccount: '2000',
      glAccountName: 'Accounts Payable',
      amount: totalAmount,
      debitCredit: 'credit',
      classification: 'liability_offset',
      asuReference: 'General ledger offsetting entry',
      recordCount: classified.length
    });
  }

  return lines;
}

/**
 * Generates a classification summary for financial statement close package
 *
 * Provides high-level summary of expense vs. capitalize split with
 * amortization notes and audit-friendly documentation.
 *
 * @param {Array<Object>} classifiedRecords - Array of records with classification results
 *
 * @returns {Object} Summary object
 * @returns {number} result.totalExpenseAmount - Total amount expensed
 * @returns {number} result.totalCapitalizeAmount - Total amount capitalized
 * @returns {number} result.totalAmount - Grand total
 * @returns {number} result.expensePercentage - Percentage expensed
 * @returns {number} result.capitalizePercentage - Percentage capitalized
 * @returns {number} result.expenseRecordCount - Count of expensed records
 * @returns {number} result.capitalizeRecordCount - Count of capitalized records
 * @returns {string} result.amortizationNote - Guidance on amortizing capitalized costs
 * @returns {string} result.conservativeTreatmentStatement - Statement of conservative treatment
 * @returns {string} result.asuCitation - Full ASU citation
 */
function getClassificationSummary(classifiedRecords) {
  let totalExpense = 0;
  let totalCapitalize = 0;
  let expenseCount = 0;
  let capitalizeCount = 0;

  for (const record of classifiedRecords) {
    const amount = record.cost || 0;
    if (record.classification.classification === 'capitalize') {
      totalCapitalize += amount;
      capitalizeCount += 1;
    } else {
      totalExpense += amount;
      expenseCount += 1;
    }
  }

  const totalAmount = totalExpense + totalCapitalize;
  const expensePercentage = totalAmount > 0 ? (totalExpense / totalAmount) * 100 : 0;
  const capitalizePercentage = totalAmount > 0 ? (totalCapitalize / totalAmount) * 100 : 0;

  return {
    totalExpenseAmount: totalExpense,
    totalCapitalizeAmount: totalCapitalize,
    totalAmount: totalAmount,
    expensePercentage: Math.round(expensePercentage * 100) / 100,
    capitalizePercentage: Math.round(capitalizePercentage * 100) / 100,
    expenseRecordCount: expenseCount,
    capitalizeRecordCount: capitalizeCount,
    amortizationNote: `Capitalized costs totaling $${totalCapitalize.toFixed(2)} should be amortized straight-line over the service contract term, beginning when the AI implementation module is ready for intended use. Reference: ${AMORTIZATION_GUIDANCE.reference}`,
    conservativeTreatmentStatement: 'This classification reflects a conservative treatment of AI implementation costs per FASB ASU 2018-15 (Subtopic 350-40). All costs that do not clearly meet the definition of capitalizable development stage costs are expensed. Costs with low confidence classification signals default to expense treatment.',
    asuCitation: ASU_REFERENCE,
    projectStagesReference: 'Classification follows three-stage model: (1) Preliminary - expense; (2) Application Development - capitalize; (3) Post-Implementation - expense. See PROJECT_STAGES for detailed guidance.'
  };
}

// ============================================================================
// MODULE EXPORTS (CommonJS)
// ============================================================================

module.exports = {
  // Core constants and references
  ASU_REFERENCE,
  PROJECT_STAGES,
  CLASSIFICATION_RULES,
  GL_ACCOUNT_MAPPING,
  AMORTIZATION_GUIDANCE,

  // Classification functions
  classifyCost,
  classifyBatch,
  generateJournalEntryClassification,
  getClassificationSummary
};
