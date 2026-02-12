import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
    if (condition) {
        passed++;
        console.log(`  ✓ ${message}`);
    } else {
        failed++;
        failures.push(message);
        console.log(`  ✗ FAIL: ${message}`);
    }
}

function assertClose(actual, expected, tolerance, message) {
    const diff = Math.abs(actual - expected);
    if (diff <= tolerance) {
        passed++;
        console.log(`  ✓ ${message}`);
    } else {
        failed++;
        failures.push(message);
        console.log(`  ✗ FAIL: ${message} (${actual} vs ${expected}, diff: ${diff})`);
    }
}

async function runTests() {
    console.log('═'.repeat(70));
    console.log('FOCUS 1.3 SCHEMA COMPLIANCE TEST SUITE (gap6b)');
    console.log('═'.repeat(70));

    const {
        FOCUS_VERSION,
        FOCUS_COLUMNS,
        FOCUS_CHARGE_TYPES,
        FOCUS_CHARGE_FREQUENCIES,
        FOCUS_PRICING_CATEGORIES,
        FOCUS_SERVICE_CATEGORIES,
        FOCUS_COMMITMENT_TYPES,
        PROVIDER_FOCUS_MAPPINGS,
        FOCUSValidator,
        FOCUSNormalizer,
        FOCUSExporter,
        SharedCostAllocator,
        categorizeAWSService,
        categorizeAzureService,
        categorizeGCPService,
        createFOCUSValidator,
        createFOCUSNormalizer,
        createFOCUSExporter,
        createSharedCostAllocator,
    } = await import(path.join(__dirname, '..', 'core', 'focus-schema.js'));

    // =========================================================================
    // SECTION 1: Structural Tests (~10 tests)
    // =========================================================================
    console.log('\n[SECTION 1] Structural Tests');

    // gap6b_001
    assert(FOCUS_VERSION === '1.3', 'gap6b_001: FOCUS_VERSION is "1.3"');

    // gap6b_002
    assert(Array.isArray(FOCUS_COLUMNS), 'gap6b_002: FOCUS_COLUMNS is an array');

    // gap6b_003
    assert(FOCUS_COLUMNS.length >= 40, 'gap6b_003: FOCUS_COLUMNS has at least 40 columns');

    // gap6b_004
    const requiredCols = FOCUS_COLUMNS.filter(c => c.required).length;
    assert(requiredCols >= 10, 'gap6b_004: At least 10 required columns exist');

    // gap6b_005
    assert(typeof PROVIDER_FOCUS_MAPPINGS === 'object', 'gap6b_005: PROVIDER_FOCUS_MAPPINGS is an object');

    // gap6b_006
    const providers = Object.keys(PROVIDER_FOCUS_MAPPINGS);
    assert(providers.length >= 8, 'gap6b_006: At least 8 providers mapped');

    // gap6b_007
    assert(typeof FOCUSValidator === 'function', 'gap6b_007: FOCUSValidator is a class');

    // gap6b_008
    assert(typeof FOCUSNormalizer === 'function', 'gap6b_008: FOCUSNormalizer is a class');

    // gap6b_009
    assert(typeof FOCUSExporter === 'function', 'gap6b_009: FOCUSExporter is a class');

    // gap6b_010
    assert(typeof SharedCostAllocator === 'function', 'gap6b_010: SharedCostAllocator is a class');

    // =========================================================================
    // SECTION 2: Schema Completeness Tests (~15 tests)
    // =========================================================================
    console.log('\n[SECTION 2] Schema Completeness Tests');

    // gap6b_011
    const billingAccountIdCol = FOCUS_COLUMNS.find(c => c.name === 'BillingAccountId');
    assert(billingAccountIdCol && billingAccountIdCol.required, 'gap6b_011: BillingAccountId is required');

    // gap6b_012
    const serviceNameCol = FOCUS_COLUMNS.find(c => c.name === 'ServiceName');
    assert(serviceNameCol && serviceNameCol.required, 'gap6b_012: ServiceName is required');

    // gap6b_013
    const amortizedCostCol = FOCUS_COLUMNS.find(c => c.name === 'AmortizedCost');
    assert(amortizedCostCol, 'gap6b_013: AmortizedCost column exists (FOCUS 1.3)');

    // gap6b_014
    const commitmentDiscountIdCol = FOCUS_COLUMNS.find(c => c.name === 'CommitmentDiscountId');
    assert(commitmentDiscountIdCol, 'gap6b_014: CommitmentDiscountId column exists');

    // gap6b_015
    const finaultOrgIdCol = FOCUS_COLUMNS.find(c => c.name === 'x_finault_org_id');
    assert(finaultOrgIdCol && finaultOrgIdCol.required, 'gap6b_015: x_finault_org_id extension is required');

    // gap6b_016
    const allTypes = new Set(FOCUS_COLUMNS.map(c => c.type));
    assert(allTypes.has('string') && allTypes.has('number') && allTypes.has('datetime'), 'gap6b_016: Column types include string, number, datetime');

    // gap6b_017
    assert(FOCUS_COLUMNS.find(c => c.name === 'NetAmortizedCost'), 'gap6b_017: NetAmortizedCost column exists');

    // gap6b_018
    assert(FOCUS_COLUMNS.find(c => c.name === 'OnDemandCost'), 'gap6b_018: OnDemandCost column exists');

    // gap6b_019
    assert(FOCUS_COLUMNS.find(c => c.name === 'CommitmentDiscountType'), 'gap6b_019: CommitmentDiscountType column exists');

    // gap6b_020
    assert(FOCUS_COLUMNS.find(c => c.name === 'CommitmentDiscountStatus'), 'gap6b_020: CommitmentDiscountStatus column exists');

    // gap6b_021
    assert(FOCUS_COLUMNS.find(c => c.name === 'ChargeType'), 'gap6b_021: ChargeType column exists');

    // gap6b_022
    assert(FOCUS_COLUMNS.find(c => c.name === 'Tags' && c.type === 'json'), 'gap6b_022: Tags column exists with json type');

    // gap6b_023
    const extensionCols = FOCUS_COLUMNS.filter(c => c.name.startsWith('x_finault_'));
    assert(extensionCols.length >= 3, 'gap6b_023: At least 3 Finault extensions present');

    // gap6b_024
    const usageCols = FOCUS_COLUMNS.filter(c => c.name.includes('Usage'));
    assert(usageCols.length >= 3, 'gap6b_024: Usage-related columns present');

    // gap6b_025
    const pricingCols = FOCUS_COLUMNS.filter(c => c.name.includes('Price') || c.name.includes('Pricing') || c.name.includes('Cost'));
    assert(pricingCols.length >= 5, 'gap6b_025: Multiple pricing/cost columns present');

    // =========================================================================
    // SECTION 3: Validation Tests (~20 tests)
    // =========================================================================
    console.log('\n[SECTION 3] Validation Tests');

    const validator = createFOCUSValidator();

    const validRecord = {
        BillingAccountId: 'acct-123',
        BillingPeriodStart: '2024-01-01T00:00:00Z',
        BillingPeriodEnd: '2024-01-31T23:59:59Z',
        ProviderName: 'OpenAI',
        PublisherName: 'OpenAI',
        ServiceCategory: 'AI/ML',
        ServiceName: 'GPT-4',
        UsageDateTime: '2024-01-15T12:00:00Z',
        UsageQuantity: 1000,
        UsageUnit: 'Tokens',
        PricingCategory: 'On-Demand',
        EffectiveCost: 50.00,
        ListCost: 50.00,
        BillingCurrency: 'USD',
        ChargeType: 'Usage',
        ChargeFrequency: 'Usage-Based',
        x_finault_org_id: 'org-1'
    };

    // gap6b_026
    const validationResult = validator.validateRecord(validRecord);
    assert(validationResult.valid === true, 'gap6b_026: Valid record passes validation');

    // gap6b_027
    assert(validationResult.errors.length === 0, 'gap6b_027: Valid record has no errors');

    // gap6b_028
    const missingRequired = { ...validRecord };
    delete missingRequired.BillingAccountId;
    const missingResult = validator.validateRecord(missingRequired);
    assert(missingResult.valid === false, 'gap6b_028: Missing required field fails validation');

    // gap6b_029
    assert(missingResult.errors.length > 0, 'gap6b_029: Missing required field produces error message');

    // gap6b_030
    const wrongType = { ...validRecord, UsageQuantity: 'not-a-number' };
    const wrongTypeResult = validator.validateRecord(wrongType);
    assert(wrongTypeResult.valid === false, 'gap6b_030: Wrong type fails validation');

    // gap6b_031
    const invalidChargeType = { ...validRecord, ChargeType: 'InvalidType' };
    const chargeTypeResult = validator.validateRecord(invalidChargeType);
    assert(chargeTypeResult.valid === false, 'gap6b_031: Invalid ChargeType fails validation');

    // gap6b_032
    assert(chargeTypeResult.errors.some(e => e.includes('ChargeType')), 'gap6b_032: Invalid ChargeType error is specific');

    // gap6b_033
    const coerced = validator.coerceTypes({ ...validRecord, UsageQuantity: '2000' });
    assert(typeof coerced.UsageQuantity === 'number' && coerced.UsageQuantity === 2000, 'gap6b_033: String to number coercion works');

    // gap6b_034
    const batchResult = validator.validateBatch([validRecord, validRecord]);
    assert(batchResult.validCount === 2, 'gap6b_034: Batch validation counts valid records');

    // gap6b_035
    assert(batchResult.invalidCount === 0, 'gap6b_035: Batch validation counts invalid records');

    // gap6b_036
    const mixedBatch = [validRecord, missingRequired, validRecord];
    const mixedResult = validator.validateBatch(mixedBatch);
    assert(mixedResult.validCount === 2 && mixedResult.invalidCount === 1, 'gap6b_036: Batch validation handles mixed records');

    // gap6b_037
    assert(mixedResult.errors.length === 1, 'gap6b_037: Batch validation reports per-index errors');

    // gap6b_038
    const required = validator.getRequiredColumns();
    assert(Array.isArray(required) && required.length > 0, 'gap6b_038: getRequiredColumns returns array');

    // gap6b_039
    assert(required.includes('BillingAccountId'), 'gap6b_039: getRequiredColumns includes core fields');

    // gap6b_040
    const optional = validator.getOptionalColumns();
    assert(Array.isArray(optional) && optional.length > 0, 'gap6b_040: getOptionalColumns returns array');

    // gap6b_041
    assert(optional.includes('ResourceId'), 'gap6b_041: getOptionalColumns includes non-required fields');

    // gap6b_042
    const dateCoerced = validator.coerceTypes({ ...validRecord, UsageDateTime: '2024-01-15' });
    assert(typeof dateCoerced.UsageDateTime === 'string', 'gap6b_042: Date coercion works');

    // gap6b_043
    const invalidChargeFreq = { ...validRecord, ChargeFrequency: 'Monthly' };
    const freqResult = validator.validateRecord(invalidChargeFreq);
    assert(freqResult.valid === false, 'gap6b_043: Invalid ChargeFrequency fails validation');

    // gap6b_044
    const invalidServiceCat = { ...validRecord, ServiceCategory: 'InvalidCategory' };
    const serviceCatResult = validator.validateRecord(invalidServiceCat);
    assert(serviceCatResult.valid === false, 'gap6b_044: Invalid ServiceCategory fails validation');

    // gap6b_045
    const invalidPricingCat = { ...validRecord, PricingCategory: 'InvalidPricing' };
    const pricingCatResult = validator.validateRecord(invalidPricingCat);
    assert(pricingCatResult.valid === false, 'gap6b_045: Invalid PricingCategory fails validation');

    // =========================================================================
    // SECTION 4: Normalization Tests (~20 tests)
    // =========================================================================
    console.log('\n[SECTION 4] Normalization Tests');

    const normalizer = createFOCUSNormalizer();

    // gap6b_046
    const openaiRaw = {
        organization_id: 'org-456',
        organization_name: 'My Org',
        snapshot_id: 'snap-1',
        model: 'gpt-4',
        n_context_tokens_total: 5000,
        cost_in_usd: 25.50,
        timestamp: '2024-01-15T12:00:00Z'
    };
    const openaiNorm = normalizer.normalize(openaiRaw, 'openai', { orgId: 'org-1' });
    assert(openaiNorm.valid === true, 'gap6b_046: OpenAI normalization produces valid record');

    // gap6b_047
    assert(openaiNorm.record && openaiNorm.record.BillingAccountId === 'org-456', 'gap6b_047: OpenAI BillingAccountId maps correctly');

    // gap6b_048
    assert(openaiNorm.record && openaiNorm.record.ServiceName === 'OpenAI API', 'gap6b_048: OpenAI ServiceName is normalized');

    // gap6b_049
    assert(openaiNorm.record && openaiNorm.record.ServiceCategory === 'AI/ML', 'gap6b_049: OpenAI ServiceCategory is AI/ML');

    // gap6b_050
    assert(openaiNorm.record && openaiNorm.record.x_finault_org_id === 'org-1', 'gap6b_050: Finault org ID added during normalization');

    // gap6b_051
    const awsRaw = {
        LinkedAccountId: 'aws-123',
        LinkedAccountName: 'AWS Account',
        ProductName: 'Amazon Elastic Compute Cloud',
        Region: 'us-east-1',
        UsageQuantity: 100,
        UsageType: 'EC2 Instance Hours',
        UsageStartDate: '2024-01-15T00:00:00Z',
        UnblendedCost: 150.00,
        NetUnblendedCost: 135.00,
        CurrencyCode: 'USD'
    };
    const awsNorm = normalizer.normalize(awsRaw, 'aws', { orgId: 'org-1' });
    assert(awsNorm.valid === true, 'gap6b_051: AWS normalization produces valid record');

    // gap6b_052
    assert(awsNorm.record && awsNorm.record.ServiceCategory === 'Compute', 'gap6b_052: AWS EC2 categorized as Compute');

    // gap6b_053
    assert(awsNorm.record && awsNorm.record.Region === 'us-east-1', 'gap6b_053: AWS Region preserved');

    // gap6b_054
    const azureRaw = {
        BillingAccountId: 'az-123',
        BillingAccountName: 'Azure Account',
        SubscriptionId: 'sub-456',
        ServiceName: 'Virtual Machines',
        MeterCategory: 'Compute',
        Quantity: 50,
        UnitOfMeasure: 'Hours',
        UsageDateTime: '2024-01-15T12:00:00Z',
        CostInBillingCurrency: 75.00,
        BillingCurrencyCode: 'USD'
    };
    const azureNorm = normalizer.normalize(azureRaw, 'azure', { orgId: 'org-1' });
    assert(azureNorm.valid === true, 'gap6b_054: Azure normalization produces valid record');

    // gap6b_055
    assert(azureNorm.record && azureNorm.record.SubAccountId === 'sub-456', 'gap6b_055: Azure SubscriptionId maps to SubAccountId');

    // gap6b_056
    const unknownProvider = normalizer.normalize(openaiRaw, 'unknown_provider', { orgId: 'org-1' });
    assert(unknownProvider.valid === false, 'gap6b_056: Unknown provider normalization fails');

    // gap6b_057
    assert(unknownProvider.errors.length > 0, 'gap6b_057: Unknown provider produces error');

    // gap6b_058
    const batchRaw = [openaiRaw, openaiRaw];
    const batchNorm = normalizer.normalizeBatch(batchRaw, 'openai', { orgId: 'org-1' });
    assert(batchNorm.validCount === 2, 'gap6b_058: Batch normalization validates records');

    // gap6b_059
    assert(batchNorm.records.length === 2, 'gap6b_059: Batch normalization returns normalized records');

    // gap6b_060
    const anthropicRaw = {
        customer_id: 'cust-123',
        customer_name: 'My Customer',
        request_id: 'req-1',
        model_id: 'claude-3',
        input_tokens: 1000,
        output_tokens: 500,
        total_cost: 12.50,
        timestamp: '2024-01-15T12:00:00Z'
    };
    const anthropicNorm = normalizer.normalize(anthropicRaw, 'anthropic', { orgId: 'org-1' });
    assert(anthropicNorm.valid === true, 'gap6b_060: Anthropic normalization produces valid record');

    // gap6b_061
    assert(anthropicNorm.record && anthropicNorm.record.ServiceName === 'Claude API', 'gap6b_061: Anthropic ServiceName is Claude API');

    // gap6b_062
    const gcpRaw = {
        billing_account_id: 'gcp-123',
        billing_account_name: 'GCP Account',
        project_id: 'proj-456',
        'service.description': 'Google Compute Engine',
        'usage.amount': 200,
        'usage.unit': 'Hours',
        usage_start_time: '2024-01-15T00:00:00Z',
        cost: 100.00,
        currency: 'USD'
    };
    const gcpNorm = normalizer.normalize(gcpRaw, 'google_cloud', { orgId: 'org-1' });
    assert(gcpNorm.valid === true, 'gap6b_062: Google Cloud normalization produces valid record');

    // gap6b_063
    assert(gcpNorm.record && gcpNorm.record.ProviderName === 'Google Cloud', 'gap6b_063: GCP ProviderName is correct');

    // gap6b_064
    const sourceFile = normalizer.normalize(openaiRaw, 'openai', { orgId: 'org-1', sourceFile: 'test.csv' });
    assert(sourceFile.record && sourceFile.record.x_finault_source_file === 'test.csv', 'gap6b_064: Source file tracked');

    // gap6b_065
    const confidence = normalizer.normalize(openaiRaw, 'openai', { orgId: 'org-1', confidence: 0.95 });
    assert(confidence.record && confidence.record.x_finault_confidence === 0.95, 'gap6b_065: Confidence score tracked');

    // =========================================================================
    // SECTION 5: Cost Allocation Tests (~15 tests)
    // =========================================================================
    console.log('\n[SECTION 5] Cost Allocation Tests');

    const allocator = createSharedCostAllocator();

    const sharedCost = {
        BillingAccountId: 'acct-main',
        ProviderName: 'AWS',
        PublisherName: 'Amazon',
        ServiceName: 'Support',
        ServiceCategory: 'Management',
        UsageDateTime: '2024-01-15T00:00:00Z',
        UsageQuantity: 1,
        UsageUnit: 'Month',
        PricingCategory: 'On-Demand',
        EffectiveCost: 1000.00,
        ListCost: 1000.00,
        BillingCurrency: 'USD',
        ChargeType: 'Purchase',
        ChargeFrequency: 'Recurring',
        x_finault_org_id: 'org-1'
    };

    const usageRec1 = {
        ...validRecord,
        SubAccountId: 'sub-1',
        UsageQuantity: 300
    };

    const usageRec2 = {
        ...validRecord,
        SubAccountId: 'sub-2',
        UsageQuantity: 700
    };

    // gap6b_066
    const allocatedByUsage = allocator.allocateByUsage([sharedCost], [usageRec1, usageRec2]);
    assert(allocatedByUsage.length === 2, 'gap6b_066: allocateByUsage produces one record per tenant');

    // gap6b_067
    assert(allocatedByUsage[0].SubAccountId === 'sub-1' || allocatedByUsage[1].SubAccountId === 'sub-1', 'gap6b_067: Sub-account IDs preserved');

    // gap6b_068
    const allocRec1 = allocatedByUsage.find(r => r.SubAccountId === 'sub-1');
    const allocRec2 = allocatedByUsage.find(r => r.SubAccountId === 'sub-2');
    assertClose(allocRec1.EffectiveCost, 300, 1, 'gap6b_068: Cost allocated 30% to sub-1 (300/1000 usage)');

    // gap6b_069
    assertClose(allocRec2.EffectiveCost, 700, 1, 'gap6b_069: Cost allocated 70% to sub-2 (700/1000 usage)');

    // gap6b_070
    assert(allocRec1.x_finault_allocation_method === 'usage', 'gap6b_070: Allocation method tracked');

    // gap6b_071
    const allocatedByFixed = allocator.allocateByFixed([sharedCost], { 'sub-1': 40, 'sub-2': 60 });
    assert(allocatedByFixed.length === 2, 'gap6b_071: allocateByFixed produces correct count');

    // gap6b_072
    const fixedRec1 = allocatedByFixed.find(r => r.SubAccountId === 'sub-1');
    assertClose(fixedRec1.EffectiveCost, 400, 1, 'gap6b_072: Fixed percentage allocation works');

    // gap6b_073
    const allocatedByEven = allocator.allocateByEvenSplit([sharedCost], ['sub-1', 'sub-2']);
    assert(allocatedByEven.length === 2, 'gap6b_073: allocateByEvenSplit produces correct count');

    // gap6b_074
    const evenRec1 = allocatedByEven.find(r => r.SubAccountId === 'sub-1');
    assertClose(evenRec1.EffectiveCost, 500, 1, 'gap6b_074: Even split allocates 50% to each');

    // gap6b_075
    const report = allocator.generateAllocationReport(allocatedByUsage);
    assert(report.summary && typeof report.summary === 'object', 'gap6b_075: Allocation report generated');

    // gap6b_076
    assert(report.summary['sub-1'] !== undefined, 'gap6b_076: Report includes sub-account summaries');

    // gap6b_077
    assert(report.summary['sub-1'].totalEffectiveCost > 0, 'gap6b_077: Report includes total effective costs');

    // gap6b_078
    assert(report.details && Array.isArray(report.details), 'gap6b_078: Report includes detailed records');

    // gap6b_079
    assert(report.timestamp !== undefined, 'gap6b_079: Report includes timestamp');

    // gap6b_080
    assert(report.totalRecords === 2, 'gap6b_080: Report includes record count');

    // =========================================================================
    // SECTION 6: Export Tests (~15 tests)
    // =========================================================================
    console.log('\n[SECTION 6] Export Tests');

    const exporter = createFOCUSExporter();
    const recordsToExport = [validRecord, { ...validRecord, ServiceName: 'Claude' }];

    // gap6b_081
    const csvOutput = exporter.toCSV(recordsToExport);
    assert(typeof csvOutput === 'string', 'gap6b_081: toCSV returns string');

    // gap6b_082
    assert(csvOutput.includes('BillingAccountId'), 'gap6b_082: CSV includes header row');

    // gap6b_083
    assert(csvOutput.includes('acct-123'), 'gap6b_083: CSV includes record data');

    // gap6b_084
    const lines = csvOutput.split('\n');
    assert(lines.length === 3, 'gap6b_084: CSV has header + data rows');

    // gap6b_085
    const jsonOutput = exporter.toJSON(recordsToExport);
    assert(typeof jsonOutput === 'string', 'gap6b_085: toJSON returns string');

    // gap6b_086
    const jsonParsed = JSON.parse(jsonOutput);
    assert(Array.isArray(jsonParsed), 'gap6b_086: JSON output is valid');

    // gap6b_087
    assert(jsonParsed.length === 2, 'gap6b_087: JSON includes all records');

    // gap6b_088
    const parquetOutput = exporter.toParquet(recordsToExport);
    assert(parquetOutput.format === 'parquet', 'gap6b_088: Parquet format specified');

    // gap6b_089
    assert(parquetOutput.schema && typeof parquetOutput.schema === 'object', 'gap6b_089: Parquet includes schema');

    // gap6b_090
    assert(parquetOutput.data && Array.isArray(parquetOutput.data), 'gap6b_090: Parquet includes data');

    // gap6b_091
    const schema = exporter.generateSchema();
    assert(schema.$schema && schema.$schema.includes('json-schema'), 'gap6b_091: Schema is JSON Schema compatible');

    // gap6b_092
    assert(schema.properties && typeof schema.properties === 'object', 'gap6b_092: Schema has properties');

    // gap6b_093
    assert(schema.required && Array.isArray(schema.required), 'gap6b_093: Schema specifies required fields');

    // gap6b_094
    assert(schema.required.includes('BillingAccountId'), 'gap6b_094: BillingAccountId marked required in schema');

    // gap6b_095
    assert(Object.keys(schema.properties).length >= 40, 'gap6b_095: Schema has 40+ properties');

    // gap6b_096
    const emptyCSV = exporter.toCSV([]);
    assert(emptyCSV.includes('BillingAccountId'), 'gap6b_096: Empty export still has headers');

    // =========================================================================
    // SECTION 7: Provider Mappings Tests (~15 tests)
    // =========================================================================
    console.log('\n[SECTION 7] Provider Mappings Tests');

    // gap6b_097
    assert(PROVIDER_FOCUS_MAPPINGS.openai, 'gap6b_097: OpenAI provider mapped');

    // gap6b_098
    assert(PROVIDER_FOCUS_MAPPINGS.aws, 'gap6b_098: AWS provider mapped');

    // gap6b_099
    assert(PROVIDER_FOCUS_MAPPINGS.azure, 'gap6b_099: Azure provider mapped');

    // gap6b_100
    assert(PROVIDER_FOCUS_MAPPINGS.google_cloud, 'gap6b_100: Google Cloud provider mapped');

    // gap6b_101
    assert(PROVIDER_FOCUS_MAPPINGS.anthropic, 'gap6b_101: Anthropic provider mapped');

    // gap6b_102
    assert(PROVIDER_FOCUS_MAPPINGS.cohere, 'gap6b_102: Cohere provider mapped');

    // gap6b_103
    assert(PROVIDER_FOCUS_MAPPINGS.mistral, 'gap6b_103: Mistral provider mapped');

    // gap6b_104
    assert(PROVIDER_FOCUS_MAPPINGS.together_ai, 'gap6b_104: Together AI provider mapped');

    // gap6b_105
    assert(PROVIDER_FOCUS_MAPPINGS.openai.BillingAccountId === 'organization_id', 'gap6b_105: OpenAI BillingAccountId maps correctly');

    // gap6b_106
    assert(PROVIDER_FOCUS_MAPPINGS.aws.BillingAccountId === 'LinkedAccountId', 'gap6b_106: AWS BillingAccountId maps correctly');

    // gap6b_107
    assert(PROVIDER_FOCUS_MAPPINGS.azure.SubAccountId === 'SubscriptionId', 'gap6b_107: Azure SubAccountId maps correctly');

    // gap6b_108
    assert(PROVIDER_FOCUS_MAPPINGS.google_cloud.SubAccountId === 'project_id', 'gap6b_108: GCP SubAccountId maps correctly');

    // gap6b_109
    const awsMapping = PROVIDER_FOCUS_MAPPINGS.aws;
    assert(typeof awsMapping.ServiceCategory === 'function', 'gap6b_109: AWS ServiceCategory uses function mapper');

    // gap6b_110
    const commitmentTypeMapper = awsMapping.CommitmentDiscountType;
    assert(typeof commitmentTypeMapper === 'function', 'gap6b_110: AWS CommitmentDiscountType uses function mapper');

    // gap6b_111
    const testRowWithSP = { SavingsPlanARN: 'arn:...' };
    const spResult = commitmentTypeMapper(testRowWithSP);
    assert(spResult === 'SavingsPlan', 'gap6b_111: SavingsPlan correctly identified');

    // =========================================================================
    // SECTION 8: Enum Validation Tests (~10 tests)
    // =========================================================================
    console.log('\n[SECTION 8] Enum Validation Tests');

    // gap6b_112
    assert(FOCUS_CHARGE_TYPES.includes('Usage'), 'gap6b_112: Usage in FOCUS_CHARGE_TYPES');

    // gap6b_113
    assert(FOCUS_CHARGE_TYPES.includes('Purchase'), 'gap6b_113: Purchase in FOCUS_CHARGE_TYPES');

    // gap6b_114
    assert(FOCUS_CHARGE_TYPES.includes('Tax'), 'gap6b_114: Tax in FOCUS_CHARGE_TYPES');

    // gap6b_115
    assert(FOCUS_CHARGE_TYPES.includes('Credit'), 'gap6b_115: Credit in FOCUS_CHARGE_TYPES');

    // gap6b_116
    assert(FOCUS_CHARGE_TYPES.includes('Adjustment'), 'gap6b_116: Adjustment in FOCUS_CHARGE_TYPES');

    // gap6b_117
    assert(FOCUS_CHARGE_FREQUENCIES.includes('One-Time'), 'gap6b_117: One-Time in frequencies');

    // gap6b_118
    assert(FOCUS_CHARGE_FREQUENCIES.includes('Recurring'), 'gap6b_118: Recurring in frequencies');

    // gap6b_119
    assert(FOCUS_CHARGE_FREQUENCIES.includes('Usage-Based'), 'gap6b_119: Usage-Based in frequencies');

    // gap6b_120
    assert(FOCUS_SERVICE_CATEGORIES.includes('AI/ML'), 'gap6b_120: AI/ML in service categories');

    // gap6b_121
    assert(FOCUS_SERVICE_CATEGORIES.includes('Compute'), 'gap6b_121: Compute in service categories');

    // gap6b_122
    assert(FOCUS_PRICING_CATEGORIES.includes('On-Demand'), 'gap6b_122: On-Demand in pricing categories');

    // gap6b_123
    assert(FOCUS_PRICING_CATEGORIES.includes('Spot'), 'gap6b_123: Spot in pricing categories');

    // gap6b_124
    assert(FOCUS_COMMITMENT_TYPES.includes('ReservedInstance'), 'gap6b_124: ReservedInstance in commitment types');

    // gap6b_125
    assert(FOCUS_COMMITMENT_TYPES.includes('SavingsPlan'), 'gap6b_125: SavingsPlan in commitment types');

    // gap6b_126
    assert(FOCUS_COMMITMENT_TYPES.includes('CommittedUseDiscount'), 'gap6b_126: CommittedUseDiscount in commitment types');

    // gap6b_127
    assert(FOCUS_COMMITMENT_TYPES.length === 4, 'gap6b_127: Exactly 4 commitment types');

    // gap6b_128
    assert(FOCUS_CHARGE_TYPES.length === 5, 'gap6b_128: Exactly 5 charge types');

    // gap6b_129
    assert(FOCUS_SERVICE_CATEGORIES.length >= 9, 'gap6b_129: At least 9 service categories');

    // gap6b_130
    assert(FOCUS_PRICING_CATEGORIES.length === 4, 'gap6b_130: Exactly 4 pricing categories');

    // =========================================================================
    // SECTION 9: Advanced Integration Tests (~15 tests)
    // =========================================================================
    console.log('\n[SECTION 9] Advanced Integration Tests');

    // gap6b_131
    const normalizerWithValidator = new FOCUSNormalizer(validator);
    assert(normalizerWithValidator !== null, 'gap6b_131: Normalizer accepts custom validator');

    // gap6b_132
    const fullEndToEnd = normalizer.normalize(openaiRaw, 'openai', { orgId: 'org-final' });
    const csvFromNormalized = exporter.toCSV([fullEndToEnd.record]);
    assert(csvFromNormalized.includes('OpenAI'), 'gap6b_132: End-to-end normalization and export works');

    // gap6b_133
    assert(categorizeAWSService('Amazon S3') === 'Storage', 'gap6b_133: AWS service categorization works');

    // gap6b_134
    assert(categorizeAWSService('AWS Lambda') === 'Compute', 'gap6b_134: AWS Lambda categorized as Compute');

    // gap6b_135
    assert(categorizeAzureService('Virtual Machines') === 'Compute', 'gap6b_135: Azure VM categorization works');

    // gap6b_136
    assert(categorizeAzureService('Storage') === 'Storage', 'gap6b_136: Azure Storage categorized correctly');

    // gap6b_137
    assert(categorizeGCPService('Google Compute Engine') === 'Compute', 'gap6b_137: GCP Compute Engine categorized');

    // gap6b_138
    assert(categorizeGCPService('BigQuery') === 'Analytics', 'gap6b_138: GCP BigQuery categorized as Analytics');

    // gap6b_139
    const enrichedRecord = normalizer.enrichWithCommitmentData(validRecord, [
        {
            id: 'commit-1',
            name: 'Test Commitment',
            type: 'SavingsPlan',
            status: 'Used',
            category: 'Usage',
            matchCriteria: { service: 'GPT-4' }
        }
    ]);
    assert(enrichedRecord.CommitmentDiscountId === 'commit-1', 'gap6b_139: enrichWithCommitmentData adds commitment');

    // gap6b_140
    const factoryValidator = createFOCUSValidator();
    assert(factoryValidator instanceof FOCUSValidator, 'gap6b_140: Factory creates validator instance');

    // gap6b_141
    const factoryNormalizer = createFOCUSNormalizer();
    assert(factoryNormalizer instanceof FOCUSNormalizer, 'gap6b_141: Factory creates normalizer instance');

    // gap6b_142
    const factoryExporter = createFOCUSExporter();
    assert(factoryExporter instanceof FOCUSExporter, 'gap6b_142: Factory creates exporter instance');

    // gap6b_143
    const factoryAllocator = createSharedCostAllocator();
    assert(factoryAllocator instanceof SharedCostAllocator, 'gap6b_143: Factory creates allocator instance');

    // gap6b_144
    const amortizedTest = normalizer.calculateAmortizedCost(validRecord, {
        totalCost: 1000,
        daysRemaining: 365,
        dailySpread: true
    });
    assert(amortizedTest > validRecord.EffectiveCost, 'gap6b_144: Amortized cost calculation includes spread');

    // gap6b_145
    const nonMatchingCommitment = normalizer.enrichWithCommitmentData(validRecord, [
        {
            id: 'commit-2',
            name: 'Other Commitment',
            type: 'ReservedInstance',
            matchCriteria: { service: 'DifferentService' }
        }
    ]);
    assert(nonMatchingCommitment.CommitmentDiscountId === undefined, 'gap6b_145: Non-matching commitments not applied');

    // =========================================================================
    // FINAL SUMMARY
    // =========================================================================
    console.log('\n' + '═'.repeat(70));
    console.log(`TESTS COMPLETED: ${passed} passed, ${failed} failed`);
    console.log('═'.repeat(70));

    if (failed > 0) {
        console.log('\nFAILURES:');
        failures.forEach((f, i) => {
            console.log(`  ${i + 1}. ${f}`);
        });
        process.exit(1);
    } else {
        console.log('\n✓ ALL TESTS PASSED');
        process.exit(0);
    }
}

runTests().catch(err => {
    console.error('Test suite error:', err);
    process.exit(1);
});
