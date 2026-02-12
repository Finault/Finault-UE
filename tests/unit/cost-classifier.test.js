/**
 * Unit tests for ASU 2018-15 Cost Classifier Module
 * Run: node tests/unit/cost-classifier.test.js
 */

const costClassifier = require('../../platform/modules/cost-classifier.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

console.log('Testing Cost Classifier Module (ASU 2018-15)\n');

// ============================================================================
// Test: Standard API inference classifies as expense
// ============================================================================
try {
  console.log('Cost classification rules:');

  // Test 1: Standard inference
  const standardInference = {
    endpoint_type: 'inference',
    model_type: 'standard',
    usage_pattern: 'production'
  };

  const standardResult = costClassifier.classifyCost(standardInference);

  assert(standardResult.classification === 'expense', 'Standard API inference classifies as expense');

} catch (err) {
  failed++;
  console.error(`  ✗ Standard inference classification threw error: ${err.message}`);
}

// ============================================================================
// Test: Fine-tuning classifies as capitalize
// ============================================================================
try {
  console.log('\nCapitalization rules:');

  const finetuningRecord = {
    endpoint_type: 'fine-tune',
    model_type: 'standard'
  };

  const result = costClassifier.classifyCost(finetuningRecord);

  assert(result.classification === 'capitalize', 'Fine-tuning classifies as capitalize');

} catch (err) {
  failed++;
  console.error(`  ✗ Fine-tuning classification threw error: ${err.message}`);
}

// ============================================================================
// Test: Training endpoint classifies as capitalize
// ============================================================================
try {
  console.log('');

  const trainingRecord = {
    endpoint_type: 'training',
    model_type: 'custom'
  };

  const result = costClassifier.classifyCost(trainingRecord);

  assert(result.classification === 'capitalize', 'Training endpoint classifies as capitalize');

} catch (err) {
  failed++;
  console.error(`  ✗ Training classification threw error: ${err.message}`);
}

// ============================================================================
// Test: classifyBatch handles array of records
// ============================================================================
try {
  console.log('\nBatch classification:');

  const records = [
    {
      id: 'cost-1',
      endpoint_type: 'inference',
      model_type: 'standard'
    },
    {
      id: 'cost-2',
      endpoint_type: 'fine-tune',
      model_type: 'standard'
    },
    {
      id: 'cost-3',
      endpoint_type: 'training',
      model_type: 'custom'
    }
  ];

  const result = costClassifier.classifyBatch(records);

  assert(typeof result === 'object' && 'classified' in result, 'Batch result is an object with classified field');
  assert(Array.isArray(result.classified), 'Classified records is an array');
  assert(result.classified.length === 3, 'Batch processes 3 records');
  assert(result.classified[0].classification.classification === 'expense', 'First record classified as expense');
  assert(result.classified[1].classification.classification === 'capitalize', 'Second record classified as capitalize');
  assert(result.classified[2].classification.classification === 'capitalize', 'Third record classified as capitalize');

} catch (err) {
  failed++;
  console.error(`  ✗ Batch classification threw error: ${err.message}`);
}

// ============================================================================
// Test: generateJournalEntryClassification produces debit/credit entries
// ============================================================================
try {
  console.log('\nJournal entry generation:');

  const records = [
    {
      id: 'cost-1',
      endpoint_type: 'fine-tune',
      cost: 5000,
      cost_center: 'DEPT-001'
    }
  ];

  const journalEntry = costClassifier.generateJournalEntryClassification(records);

  assert(Array.isArray(journalEntry), 'Journal entry is an array');
  assert(journalEntry.length > 0, 'Journal entry has line items');
  assert(journalEntry.some(line => 'glAccount' in line), 'Journal entry has GL account data');

} catch (err) {
  failed++;
  console.error(`  ✗ Journal entry generation threw error: ${err.message}`);
}

// ============================================================================
// Test: getClassificationSummary returns classified records summary
// ============================================================================
try {
  console.log('\nClassification summary:');

  const records = [
    { endpoint_type: 'inference', cost: 100 },
    { endpoint_type: 'fine-tune', cost: 200 }
  ];

  const result = costClassifier.classifyBatch(records);
  const summary = costClassifier.getClassificationSummary(result.classified);

  assert(typeof summary === 'object', 'Summary is an object');
  assert('totalExpenseAmount' in summary || 'totalCapitalizeAmount' in summary, 'Summary contains amount data');
  assert(summary !== null, 'Summary is not null');

} catch (err) {
  failed++;
  console.error(`  ✗ Summary generation threw error: ${err.message}`);
}

// ============================================================================
// Test: ASU_REFERENCE contains "2018-15"
// ============================================================================
try {
  console.log('\nASU reference validation:');

  const asuRef = costClassifier.ASU_REFERENCE;

  assert(typeof asuRef === 'string', 'ASU_REFERENCE is a string');
  assert(asuRef.includes('2018-15'), 'ASU_REFERENCE contains 2018-15');
  assert(asuRef.includes('350') || asuRef.includes('ASC'), 'ASU_REFERENCE contains accounting standard reference');

} catch (err) {
  failed++;
  console.error(`  ✗ ASU reference validation threw error: ${err.message}`);
}

// ============================================================================
// Test: Default classification is expense (conservative)
// ============================================================================
try {
  console.log('\nDefault classification behavior:');

  // Record with unknown/missing classification signals
  const unknownRecord = {
    endpoint_type: 'unknown',
    model_type: 'unknown',
    usage_pattern: 'unknown'
  };

  const result = costClassifier.classifyCost(unknownRecord);

  assert(result.classification === 'expense', 'Default classification is expense (conservative approach)');

} catch (err) {
  failed++;
  console.error(`  ✗ Default classification test threw error: ${err.message}`);
}

// ============================================================================
// Test: PROJECT_STAGES has expected structure
// ============================================================================
try {
  console.log('\nProject stages validation:');

  const stages = costClassifier.PROJECT_STAGES;

  assert(typeof stages === 'object', 'PROJECT_STAGES is an object');
  assert('preliminary' in stages, 'PROJECT_STAGES has preliminary stage');
  assert('application_development' in stages, 'PROJECT_STAGES has application_development stage');
  assert('post_implementation' in stages, 'PROJECT_STAGES has post_implementation stage');

  // Verify each stage has required fields
  for (const [stageName, stage] of Object.entries(stages)) {
    assert('name' in stage, `Stage ${stageName} has name`);
    assert('classification' in stage, `Stage ${stageName} has classification`);
    assert('description' in stage, `Stage ${stageName} has description`);
  }

} catch (err) {
  failed++;
  console.error(`  ✗ PROJECT_STAGES validation threw error: ${err.message}`);
}

// ============================================================================
// Test: Classification rules are prioritized correctly
// ============================================================================
try {
  console.log('\nClassification rule priority:');

  const rules = costClassifier.CLASSIFICATION_RULES;

  assert(Array.isArray(rules), 'CLASSIFICATION_RULES is an array');
  assert(rules.length > 0, 'CLASSIFICATION_RULES has entries');

  // Verify rule structure
  let validRules = true;
  for (const rule of rules) {
    if (!rule.signal || !rule.classification || !rule.confidence) {
      validRules = false;
      break;
    }
  }

  assert(validRules, 'All rules have signal, classification, and confidence fields');

} catch (err) {
  failed++;
  console.error(`  ✗ Classification rule priority test threw error: ${err.message}`);
}

// ============================================================================
// Test: Preliminary costs expense classification
// ============================================================================
try {
  console.log('\nStage-based classification:');

  const preliminaryRecord = {
    'metadata.phase': 'preliminary',
    endpoint_type: 'evaluation',
    model_type: 'standard'
  };

  const result = costClassifier.classifyCost(preliminaryRecord);

  assert(result.classification === 'expense', 'Preliminary stage costs are expensed');

} catch (err) {
  failed++;
  console.error(`  ✗ Preliminary stage classification threw error: ${err.message}`);
}

// ============================================================================
// Test: Record with high confidence signal is classified correctly
// ============================================================================
try {
  console.log('');

  const highConfidenceRecord = {
    endpoint_type: 'fine-tune',
    model_type: 'fine-tuned'
  };

  const result = costClassifier.classifyCost(highConfidenceRecord);

  assert(result.classification === 'capitalize', 'High-confidence fine-tuning signal classifies as capitalize');
  assert(result.confidence === 'high', 'Classification has high confidence level');

} catch (err) {
  failed++;
  console.error(`  ✗ High confidence classification threw error: ${err.message}`);
}

// ============================================================================
// Summary
// ============================================================================
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
