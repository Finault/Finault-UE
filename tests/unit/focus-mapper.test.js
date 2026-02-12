/**
 * Unit tests for FOCUS 1.3 Mapper Module
 * Run: node tests/unit/focus-mapper.test.js
 */

const focusMapper = require('../../apps/gateway/modules/focus-mapper.js');

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

function assertClose(actual, expected, tolerance, message) {
  const diff = Math.abs(parseFloat(actual) - expected);
  assert(diff <= tolerance, `${message} (got ${actual}, expected ~${expected})`);
}

console.log('Testing FOCUS 1.3 Mapper Module\n');

// ============================================================================
// Test: mapToFOCUS basic single record mapping
// ============================================================================
try {
  console.log('mapToFOCUS() - Single record mapping:');

  const record = {
    id: 1n,
    organization_id: 'org-123',
    request_id: 'req-456',
    provider: 'openai',
    model: 'gpt-4',
    input_tokens: 1000,
    output_tokens: 500,
    cost_cents: '5000',
    cost_center: 'DEPT-001',
    project: 'project-abc',
    environment: 'production',
    user_id: 'user-789',
    latency_ms: 250,
    status: 'success',
    metadata: { region: 'us-east-1' },
    created_at: '2024-01-15T10:30:00Z'
  };

  const focusRecord = focusMapper.mapToFOCUS(record);

  assert(focusRecord.Provider === 'OpenAI', 'Provider normalized to OpenAI');
  assert(focusRecord.ServiceName === 'gpt-4', 'ServiceName set correctly');
  assertClose(focusRecord.BilledCost, 50, 0.01, 'BilledCost converted from cents to dollars');
  assert(focusRecord.UsageQuantity === '1500', 'UsageQuantity is sum of tokens');
  assert(focusRecord.PricingUnit === 'Tokens', 'PricingUnit is Tokens');
  assert(focusRecord.x_CostCenter === 'DEPT-001', 'Custom x_CostCenter field set');
  assert(focusRecord.x_Environment === 'production', 'Custom x_Environment field set');
  assert(focusRecord.BillingPeriodStart.startsWith('2024-01-01'), 'BillingPeriodStart is first of month');
  assert(focusRecord.Region === 'us-east-1', 'Region extracted from metadata');
  assert(focusRecord.ChargeCategory === 'AI/ML - Language', 'ChargeCategory is AI/ML - Language (dynamic)');

} catch (err) {
  failed++;
  console.error(`  ✗ mapToFOCUS threw error: ${err.message}`);
}

// ============================================================================
// Test: mapBatchToFOCUS handles multiple records
// ============================================================================
try {
  console.log('\nmapBatchToFOCUS() - Batch processing:');

  const records = [
    {
      id: 1n,
      organization_id: 'org-123',
      request_id: 'req-1',
      provider: 'anthropic',
      model: 'claude-opus',
      input_tokens: 1000,
      output_tokens: 500,
      cost_cents: '3000',
      metadata: {},
      created_at: '2024-01-15T10:30:00Z'
    },
    {
      id: 2n,
      organization_id: 'org-123',
      request_id: 'req-2',
      provider: 'google',
      model: 'gemini-pro',
      input_tokens: 2000,
      output_tokens: 1000,
      cost_cents: '4500',
      metadata: {},
      created_at: '2024-01-20T14:45:00Z'
    }
  ];

  const result = focusMapper.mapBatchToFOCUS(records);

  assert(Array.isArray(result.records), 'Result contains records array');
  assert(result.records.length === 2, 'Batch maps 2 records correctly');
  assert(result.successCount === 2, 'Success count is 2');
  assert(result.errorCount === 0, 'Error count is 0');
  assert(result.records[0].Provider === 'Anthropic', 'First record provider normalized');
  assert(result.records[1].Provider === 'Google', 'Second record provider normalized');

} catch (err) {
  failed++;
  console.error(`  ✗ mapBatchToFOCUS threw error: ${err.message}`);
}

// ============================================================================
// Test: Provider normalization
// ============================================================================
try {
  console.log('\nProvider normalization:');

  const testCases = [
    ['openai', 'OpenAI'],
    ['anthropic', 'Anthropic'],
    ['azure', 'Microsoft'],
    ['google', 'Google'],
    ['bedrock', 'AWS'],
    ['claude', 'Anthropic'],
    ['gemini', 'Google'],
    ['OPENAI-GPT', 'OpenAI']
  ];

  for (const [input, expected] of testCases) {
    const normalized = focusMapper.normalizeProvider(input);
    assert(normalized === expected, `${input} → ${expected}`);
  }

} catch (err) {
  failed++;
  console.error(`  ✗ Provider normalization threw error: ${err.message}`);
}

// ============================================================================
// Test: toFOCUSCSV produces valid CSV with headers
// ============================================================================
try {
  console.log('\ntoFOCUSCSV() - CSV export:');

  const records = [
    {
      BilledCost: '50.00',
      BillingPeriodStart: '2024-01-01T00:00:00Z',
      BillingPeriodEnd: '2024-01-31T23:59:59Z',
      ChargeCategory: 'AI',
      ChargeType: 'Usage',
      CommitmentDiscountStatus: 'None',
      EffectiveCost: '50.00',
      InvoiceIssuerName: 'OpenAI',
      ListCost: '50.00',
      ListUnitPrice: '0.0333',
      PricingQuantity: '1500',
      PricingUnit: 'Tokens',
      Provider: 'OpenAI',
      Region: 'us-east-1',
      ServiceCategory: 'AI',
      ServiceName: 'gpt-4',
      UsageQuantity: '1500',
      UsageUnit: 'Tokens',
      x_CostCenter: null,
      x_Project: null,
      x_Environment: null,
      x_UserId: null,
      x_RequestId: null,
      x_LatencyMs: null,
      x_InputTokens: null,
      x_OutputTokens: null,
      x_Status: null
    }
  ];

  const csv = focusMapper.toFOCUSCSV(records);

  assert(typeof csv === 'string', 'CSV output is a string');
  assert(csv.includes('BilledCost'), 'CSV includes BilledCost header');
  assert(csv.includes('Provider'), 'CSV includes Provider header');
  assert(csv.includes('OpenAI'), 'CSV includes data row with OpenAI');
  assert(csv.includes('gpt-4'), 'CSV includes model name');
  const lines = csv.split('\n');
  assert(lines.length > 1, 'CSV has header and data rows');

} catch (err) {
  failed++;
  console.error(`  ✗ toFOCUSCSV threw error: ${err.message}`);
}

// ============================================================================
// Test: getFOCUSSchema returns correct structure
// ============================================================================
try {
  console.log('\ngetFOCUSSchema() - Schema validation:');

  const schema = focusMapper.getFOCUSSchema();

  assert(schema.version === '1.3', 'Schema version is 1.3');
  assert(Array.isArray(schema.columns), 'Schema has columns array');
  assert(schema.required.length > 10, 'Schema has required columns');
  assert(schema.custom.length > 5, 'Schema has custom columns');
  assert(schema.totalColumns > 20, 'Schema has total columns > 20');
  assert(schema.columnsByCategory.billing, 'Schema has billing category');
  assert(schema.columnsByCategory.custom, 'Schema has custom category');

} catch (err) {
  failed++;
  console.error(`  ✗ getFOCUSSchema threw error: ${err.message}`);
}

// ============================================================================
// Test: Handles missing/null fields gracefully
// ============================================================================
try {
  console.log('\nHandling missing/null fields:');

  const record = {
    id: 1n,
    organization_id: 'org-123',
    request_id: 'req-456',
    provider: 'openai',
    model: 'gpt-4',
    input_tokens: null,
    output_tokens: null,
    cost_cents: null,
    cost_center: null,
    project: null,
    environment: null,
    user_id: null,
    latency_ms: null,
    status: null,
    metadata: {},
    created_at: '2024-01-15T10:30:00Z'
  };

  const focusRecord = focusMapper.mapToFOCUS(record);

  assert(focusRecord.BilledCost === '0.0000000000', 'Null cost becomes 0');
  assert(focusRecord.UsageQuantity === '0', 'Null tokens become 0');
  assert(focusRecord.x_CostCenter === null, 'Null fields remain null');
  assert(focusRecord.Region === 'global', 'Missing region defaults to global');

} catch (err) {
  failed++;
  console.error(`  ✗ Null field handling threw error: ${err.message}`);
}

// ============================================================================
// Test: FOCUS_VERSION constant
// ============================================================================
try {
  console.log('\nConstants validation:');

  assert(focusMapper.FOCUS_VERSION === '1.3', 'FOCUS_VERSION is 1.3');
  assert(focusMapper.PROVIDER_MAP, 'PROVIDER_MAP is exported');
  assert(focusMapper.FOCUS_COLUMNS, 'FOCUS_COLUMNS is exported');

} catch (err) {
  failed++;
  console.error(`  ✗ Constants validation threw error: ${err.message}`);
}

// ============================================================================
// Summary
// ============================================================================
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
