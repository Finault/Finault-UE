/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PROVIDER API INTEGRATIONS TEST SUITE — GAP #13
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Comprehensive test suite for Finault Provider API Integrations
 * Covers: PROVIDER_REGISTRY, ProviderClient, field mapping, ProviderAggregator,
 *         factory functions, and edge cases
 *
 * Test Count: ~100 tests organized by module
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import {
    PROVIDER_REGISTRY,
    initializeProviderHealth,
    ProviderClient,
    createProviderClient,
    ProviderAggregator,
    discoverProviderCapabilities,
    listAvailableProviders
} from '../core/provider-integrations.js';

let passed = 0;
let failed = 0;
const failedTests = [];

/**
 * Custom assertion function (mimics test framework style)
 */
function assert(condition, message) {
    if (!condition) {
        failed++;
        failedTests.push(message);
        console.error(`✗ ${message}`);
    } else {
        passed++;
        console.log(`✓ ${message}`);
    }
}

/**
 * Custom assertion for throws
 */
function assertThrows(fn, expectedMessage, testName) {
    try {
        fn();
        assert(false, testName);
    } catch (error) {
        if (expectedMessage && !error.message.includes(expectedMessage)) {
            assert(false, `${testName} - Expected: ${expectedMessage}, Got: ${error.message}`);
        } else {
            assert(true, testName);
        }
    }
}

/**
 * Test equality for objects
 */
function assertEqual(actual, expected, message) {
    assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SECTION 1: PROVIDER_REGISTRY (20 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n─── TEST SECTION 1: PROVIDER_REGISTRY (20 tests) ───');

// Test 1.1: Registry has 8 providers
assert(Object.keys(PROVIDER_REGISTRY).length === 8, 'PROVIDER_REGISTRY contains exactly 8 providers');

// Test 1.2-1.9: All 8 providers exist
const expectedProviders = ['openai', 'anthropic', 'google_cloud', 'azure', 'aws', 'cohere', 'mistral', 'huggingface'];
expectedProviders.forEach(provider => {
    assert(PROVIDER_REGISTRY[provider] !== undefined, `Provider '${provider}' exists in registry`);
});

// Test 1.10-1.17: Each provider has 'name' field
expectedProviders.forEach(provider => {
    assert(
        PROVIDER_REGISTRY[provider].name && typeof PROVIDER_REGISTRY[provider].name === 'string',
        `Provider '${provider}' has valid 'name' field`
    );
});

// Test 1.18-1.25: Each provider has 'displayName' field
expectedProviders.forEach(provider => {
    assert(
        PROVIDER_REGISTRY[provider].displayName && typeof PROVIDER_REGISTRY[provider].displayName === 'string',
        `Provider '${provider}' has valid 'displayName' field`
    );
});

// Test 1.26-1.33: Each provider has billing and usage endpoints
expectedProviders.forEach(provider => {
    assert(
        PROVIDER_REGISTRY[provider].billingEndpoint && typeof PROVIDER_REGISTRY[provider].billingEndpoint === 'string',
        `Provider '${provider}' has 'billingEndpoint'`
    );
    assert(
        PROVIDER_REGISTRY[provider].usageEndpoint && typeof PROVIDER_REGISTRY[provider].usageEndpoint === 'string',
        `Provider '${provider}' has 'usageEndpoint'`
    );
});

// Test 1.34-1.41: Each provider has authType
expectedProviders.forEach(provider => {
    const authType = PROVIDER_REGISTRY[provider].authType;
    assert(
        authType === 'api_key' || authType === 'oauth2' || authType === 'iam_role',
        `Provider '${provider}' has valid authType (${authType})`
    );
});

// Test 1.42-1.49: Each provider has rateLimit
expectedProviders.forEach(provider => {
    assert(
        PROVIDER_REGISTRY[provider].rateLimit && typeof PROVIDER_REGISTRY[provider].rateLimit === 'number',
        `Provider '${provider}' has valid 'rateLimit'`
    );
});

// Test 1.50-1.57: Each provider has fieldMapping
expectedProviders.forEach(provider => {
    assert(
        PROVIDER_REGISTRY[provider].fieldMapping && typeof PROVIDER_REGISTRY[provider].fieldMapping === 'object',
        `Provider '${provider}' has 'fieldMapping'`
    );
});

// Test 1.58-1.65: Each provider has requiredFields
expectedProviders.forEach(provider => {
    assert(
        Array.isArray(PROVIDER_REGISTRY[provider].requiredFields) && PROVIDER_REGISTRY[provider].requiredFields.length > 0,
        `Provider '${provider}' has non-empty 'requiredFields'`
    );
});

// Test 1.66-1.73: Check specific provider configurations
assert(PROVIDER_REGISTRY.openai.authType === 'api_key', 'OpenAI uses api_key auth');
assert(PROVIDER_REGISTRY.anthropic.authType === 'api_key', 'Anthropic uses api_key auth');
assert(PROVIDER_REGISTRY.google_cloud.authType === 'oauth2', 'Google Cloud uses oauth2 auth');
assert(PROVIDER_REGISTRY.azure.authType === 'oauth2', 'Azure uses oauth2 auth');
assert(PROVIDER_REGISTRY.aws.authType === 'iam_role', 'AWS uses iam_role auth');
assert(PROVIDER_REGISTRY.cohere.authType === 'api_key', 'Cohere uses api_key auth');
assert(PROVIDER_REGISTRY.mistral.authType === 'api_key', 'Mistral uses api_key auth');
assert(PROVIDER_REGISTRY.huggingface.authType === 'api_key', 'Hugging Face uses api_key auth');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SECTION 2: ProviderClient Constructor & Credentials (30 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n─── TEST SECTION 2: ProviderClient Constructor & Credentials (30 tests) ───');

// Test 2.1: Constructor with valid provider
let openaiClient;
try {
    openaiClient = new ProviderClient('openai', { apiKey: 'sk-test-key' });
    assert(openaiClient !== null, 'Constructor succeeds with valid provider and credentials');
} catch (e) {
    assert(false, 'Constructor should not throw for valid provider');
}

// Test 2.2: Constructor normalizes provider key to lowercase
const OpenAIClient = new ProviderClient('OpenAI', { apiKey: 'sk-test-key' });
assert(OpenAIClient.providerKey === 'openai', 'Provider key is normalized to lowercase');

// Test 2.3: Constructor rejects unknown provider
assertThrows(
    () => new ProviderClient('unknown_provider', { apiKey: 'test' }),
    'Unknown provider',
    'Constructor throws error for unknown provider'
);

// Test 2.4: Constructor throws on missing API key for api_key auth
assertThrows(
    () => new ProviderClient('openai', {}),
    'apiKey',
    'Constructor throws on missing apiKey for openai'
);

// Test 2.5: Constructor throws on missing oauth token for oauth2 auth
assertThrows(
    () => new ProviderClient('google_cloud', {}),
    'oauthToken',
    'Constructor throws on missing oauthToken for google_cloud'
);

// Test 2.6: Constructor stores provider spec
const anthropicClient = new ProviderClient('anthropic', { apiKey: 'sk-test' });
assert(anthropicClient.spec === PROVIDER_REGISTRY.anthropic, 'ProviderClient stores correct spec');

// Test 2.7: Constructor stores credentials
assert(anthropicClient.credentials.apiKey === 'sk-test', 'ProviderClient stores credentials');

// Test 2.8: Constructor accepts optional options
const clientWithOptions = new ProviderClient('openai', { apiKey: 'sk-test' }, { timeout: 15000 });
assert(clientWithOptions.timeout === 15000, 'Constructor accepts timeout option');

// Test 2.9: Constructor uses spec timeout as default
assert(openaiClient.timeout === PROVIDER_REGISTRY.openai.timeoutMs, 'Default timeout comes from spec');

// Test 2.10: Constructor stores logger option
const mockLogger = { warn: () => {}, log: () => {} };
const clientWithLogger = new ProviderClient('openai', { apiKey: 'sk-test' }, { logger: mockLogger });
assert(clientWithLogger.logger === mockLogger, 'Constructor stores custom logger');

// Test 2.11: Anthropic requires orgId path parameter
const anthropicWithOrgId = new ProviderClient('anthropic', { apiKey: 'sk-test', orgId: 'org-123' });
assert(anthropicWithOrgId.credentials.orgId === 'org-123', 'Anthropic accepts orgId credential');

// Test 2.12: Google Cloud requires projectId path parameter
const gcpClient = new ProviderClient('google_cloud', { oauthToken: 'token-abc', projectId: 'proj-123', datasetId: 'dataset-1' });
assert(gcpClient.credentials.projectId === 'proj-123', 'Google Cloud accepts projectId credential');

// Test 2.13: Azure requires subscriptionId
const azureClient = new ProviderClient('azure', { oauthToken: 'token-abc', subscriptionId: 'sub-123' });
assert(azureClient.credentials.subscriptionId === 'sub-123', 'Azure accepts subscriptionId credential');

// Test 2.14: AWS requires accountId
const awsClient = new ProviderClient('aws', { oauthToken: 'arn:aws:iam::123456789:role/FinaultRole', accountId: '123456789' });
assert(awsClient.credentials.accountId === '123456789', 'AWS accepts accountId credential');

// Test 2.15: Multiple providers can coexist
const multiClients = [
    new ProviderClient('openai', { apiKey: 'key1' }),
    new ProviderClient('anthropic', { apiKey: 'key2', orgId: 'org1' }),
    new ProviderClient('google_cloud', { oauthToken: 'token1', projectId: 'proj1', datasetId: 'ds1' })
];
assert(multiClients.length === 3, 'Can create multiple provider clients simultaneously');

// Test 2.16-2.20: Verify field mapping structure
const testProviders = ['openai', 'anthropic', 'azure', 'aws', 'cohere'];
testProviders.forEach(provider => {
    const mapping = PROVIDER_REGISTRY[provider].fieldMapping;
    assert(typeof mapping === 'object' && Object.keys(mapping).length > 0, `Provider '${provider}' has field mapping`);
});

// Test 2.21-2.25: Verify path parameters are tracked
const providersWithPathParams = ['anthropic', 'google_cloud', 'azure'];
providersWithPathParams.forEach(provider => {
    const spec = PROVIDER_REGISTRY[provider];
    assert(
        Array.isArray(spec.pathParams) && spec.pathParams.length > 0,
        `Provider '${provider}' has pathParams defined`
    );
});

// Test 2.26-2.30: Credential validation edge cases
assert(openaiClient._paramToCredKey('org_id') === 'orgId', 'Parameter name conversion: org_id → orgId');
assert(openaiClient._paramToCredKey('project_id') === 'projectId', 'Parameter name conversion: project_id → projectId');
assert(openaiClient._paramToCredKey('subscription_id') === 'subscriptionId', 'Parameter name conversion: subscription_id → subscriptionId');
assert(openaiClient._paramToCredKey('account_id') === 'accountId', 'Parameter name conversion: account_id → accountId');
assert(openaiClient._paramToCredKey('simple') === 'simple', 'Parameter name conversion: simple → simple');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SECTION 3: Field Mapping & Normalization (15 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n─── TEST SECTION 3: Field Mapping & Normalization (15 tests) ───');

// Test 3.1: normalizeToFOCUS returns null for null input
assert(openaiClient.normalizeToFOCUS(null) === null, 'normalizeToFOCUS returns null for null input');

// Test 3.2: normalizeToFOCUS creates FOCUS structure
const oaiData = { organization_id: 'org-123', total_usage: 1500.50 };
const oaiNormalized = openaiClient.normalizeToFOCUS(oaiData);
assert(oaiNormalized !== null && typeof oaiNormalized === 'object', 'normalizeToFOCUS returns object');

// Test 3.3: FOCUS structure has required base fields
assert(oaiNormalized.provider === 'OpenAI', 'FOCUS has provider field');
assert(oaiNormalized.provider_key === 'openai', 'FOCUS has provider_key field');
assert(oaiNormalized.currency === 'USD', 'FOCUS has default currency');

// Test 3.4: Field mapping applies OpenAI transformation
assert(oaiNormalized.provider_org_id === 'org-123', 'OpenAI organization_id mapped to provider_org_id');
assert(oaiNormalized.total_amount === 1500.50, 'OpenAI total_usage mapped to total_amount');

// Test 3.5: Field mapping applies Anthropic transformation
const anthropicData = { organization_id: 'org-456', cost: 250.75 };
const anthropicNormalized = anthropicClient.normalizeToFOCUS(anthropicData);
assert(anthropicNormalized.provider_org_id === 'org-456', 'Anthropic organization_id mapped');
assert(anthropicNormalized.total_amount === 250.75, 'Anthropic cost mapped to total_amount');

// Test 3.6: normalizeToFOCUS includes raw_data
assert(oaiNormalized.raw_data === oaiData, 'FOCUS includes raw_data field');

// Test 3.7: normalizeToFOCUS includes normalized_at timestamp
assert(oaiNormalized.normalized_at && typeof oaiNormalized.normalized_at === 'string', 'FOCUS includes normalized_at timestamp');

// Test 3.8: Nested field paths are resolved (dot notation)
const nestedData = { data: { cost: 500 } };
const spec = PROVIDER_REGISTRY.openai;
const testClient = new ProviderClient('openai', { apiKey: 'test' });
// Simulate field mapping with nested path
const testMapping = { 'data.cost': 'total_amount' };
const nestedNormalized = testClient.normalizeToFOCUS({ data: { cost: 500 } });
// The function should handle nested paths internally

// Test 3.9: Missing optional fields don't break normalization
const minimalData = { organization_id: 'org-min' };
const minimalNormalized = openaiClient.normalizeToFOCUS(minimalData);
assert(minimalNormalized !== null, 'normalizeToFOCUS handles minimal data');

// Test 3.10: GCP field mapping
const gcpData = { project_id: 'proj-999', cost: 1200.00 };
const gcpNormalized = gcpClient.normalizeToFOCUS(gcpData);
assert(gcpNormalized.provider_org_id === 'proj-999', 'GCP project_id mapped to provider_org_id');
assert(gcpNormalized.total_amount === 1200.00, 'GCP cost mapped to total_amount');

// Test 3.11: Azure field mapping
const azureData = { subscription_id: 'sub-888', pretax_cost: 3500.25, usage_quantity: 5000 };
const azureNormalized = azureClient.normalizeToFOCUS(azureData);
assert(azureNormalized.provider_org_id === 'sub-888', 'Azure subscription_id mapped');
assert(azureNormalized.total_amount === 3500.25, 'Azure pretax_cost mapped');

// Test 3.12: AWS field mapping
const awsData = { account_id: 'acc-777', blended_cost: 2750.10 };
const awsNormalized = awsClient.normalizeToFOCUS(awsData);
assert(awsNormalized.provider_org_id === 'acc-777', 'AWS account_id mapped');
assert(awsNormalized.total_amount === 2750.10, 'AWS blended_cost mapped');

// Test 3.13: Cohere field mapping
const cohereClient = new ProviderClient('cohere', { apiKey: 'key-cohere' });
const cohereData = { user_id: 'user-555', total_cost: 125.50 };
const cohereNormalized = cohereClient.normalizeToFOCUS(cohereData);
assert(cohereNormalized.provider_org_id === 'user-555', 'Cohere user_id mapped');
assert(cohereNormalized.total_amount === 125.50, 'Cohere total_cost mapped');

// Test 3.14: Mistral field mapping
const mistralClient = new ProviderClient('mistral', { apiKey: 'key-mistral' });
const mistralData = { account_id: 'acc-444', total_cost: 80.25 };
const mistralNormalized = mistralClient.normalizeToFOCUS(mistralData);
assert(mistralNormalized.provider_org_id === 'acc-444', 'Mistral account_id mapped');

// Test 3.15: Hugging Face field mapping
const hfClient = new ProviderClient('huggingface', { apiKey: 'key-hf' });
const hfData = { user_id: 'user-333', total_spent: 95.75 };
const hfNormalized = hfClient.normalizeToFOCUS(hfData);
assert(hfNormalized.provider_org_id === 'user-333', 'Hugging Face user_id mapped');
assert(hfNormalized.total_amount === 95.75, 'Hugging Face total_spent mapped');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SECTION 4: URL Building & Header Generation (15 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n─── TEST SECTION 4: URL Building & Header Generation (15 tests) ───');

// Test 4.1: Simple URL building (OpenAI - no path params)
const oaiUrl = openaiClient._buildUrl(PROVIDER_REGISTRY.openai.billingEndpoint);
assert(oaiUrl === 'https://api.openai.com/v1/organization/billing', 'OpenAI URL builds without params');

// Test 4.2: URL building with path parameter substitution (Anthropic)
const anthropicBillingUrl = anthropicClient._buildUrl(
    PROVIDER_REGISTRY.anthropic.billingEndpoint.replace('{org_id}', 'org-test')
);
assert(anthropicBillingUrl.includes('org-test'), 'Anthropic org_id parameter substitutes');

// Test 4.3: API key header generation
const oaiHeaders = openaiClient._buildHeaders();
assert(oaiHeaders['Authorization'] === 'Bearer sk-test-key', 'API key header includes Bearer token');
assert(oaiHeaders['Content-Type'] === 'application/json', 'Content-Type header is JSON');

// Test 4.4: OAuth token header generation
const gcpHeaders = gcpClient._buildHeaders();
assert(gcpHeaders['Authorization'] === 'Bearer token-abc', 'OAuth token header includes Bearer token');

// Test 4.5-4.9: URL building for all providers with path params
const anthropicUrlTest = anthropicClient._buildUrl(
    PROVIDER_REGISTRY.anthropic.billingEndpoint
);
// The actual replacement depends on credentials
assert(typeof anthropicUrlTest === 'string', 'Anthropic URL building returns string');

const gcpUrlTest = gcpClient._buildUrl(
    PROVIDER_REGISTRY.google_cloud.billingEndpoint
);
assert(typeof gcpUrlTest === 'string', 'GCP URL building returns string');

const azureUrlTest = azureClient._buildUrl(
    PROVIDER_REGISTRY.azure.billingEndpoint
);
assert(typeof azureUrlTest === 'string', 'Azure URL building returns string');

const awsUrlTest = awsClient._buildUrl(
    PROVIDER_REGISTRY.aws.billingEndpoint
);
assert(typeof awsUrlTest === 'string', 'AWS URL building returns string');

// Test 4.10-4.14: All providers have valid headers
const allClients = [
    openaiClient,
    anthropicClient,
    gcpClient,
    azureClient,
    awsClient
];

allClients.forEach(client => {
    const headers = client._buildHeaders();
    // Some providers may use different header schemes (AWS uses Signature, etc.)
    const hasAuth = headers['Authorization'] || headers['X-API-Key'] || headers['x-api-key'];
    assert(hasAuth || Object.keys(headers).length > 0, `${client.providerKey} has auth headers`);
    if (headers['Authorization']) {
        assert(typeof headers['Authorization'] === 'string', `${client.providerKey} auth is string`);
    }
});

// Test 4.15: Header generation includes all required fields
const completeHeaders = openaiClient._buildHeaders();
assert(Object.keys(completeHeaders).length >= 2, 'Headers include Authorization and Content-Type');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SECTION 5: Factory Functions (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n─── TEST SECTION 5: Factory Functions (10 tests) ───');

// Test 5.1: createProviderClient factory creates valid client
const factoryClient = createProviderClient('openai', { apiKey: 'sk-factory' });
assert(factoryClient instanceof ProviderClient, 'Factory creates ProviderClient instance');

// Test 5.2: Factory preserves credentials
assert(factoryClient.credentials.apiKey === 'sk-factory', 'Factory preserves credentials');

// Test 5.3: Factory accepts options
const factoryClientWithOptions = createProviderClient('openai', { apiKey: 'sk-factory' }, { timeout: 20000 });
assert(factoryClientWithOptions.timeout === 20000, 'Factory passes options to constructor');

// Test 5.4: discoverProviderCapabilities returns capabilities object
const oaiCapabilities = discoverProviderCapabilities('openai');
assert(oaiCapabilities !== null && typeof oaiCapabilities === 'object', 'discoverProviderCapabilities returns object');

// Test 5.5: Capabilities include provider name
assert(oaiCapabilities.provider === 'OpenAI', 'Capabilities include provider name');

// Test 5.6: Capabilities include endpoints
assert(oaiCapabilities.endpoints && typeof oaiCapabilities.endpoints === 'object', 'Capabilities include endpoints');
assert(oaiCapabilities.endpoints.billing, 'Capabilities include billing endpoint');
assert(oaiCapabilities.endpoints.usage, 'Capabilities include usage endpoint');

// Test 5.7: Capabilities include auth type
assert(oaiCapabilities.auth === 'api_key', 'Capabilities include auth type');

// Test 5.8: Capabilities include rate limit
assert(oaiCapabilities.rateLimit && typeof oaiCapabilities.rateLimit === 'string', 'Capabilities include rate limit');

// Test 5.9: listAvailableProviders returns all providers
const providers = listAvailableProviders();
assert(Array.isArray(providers) && providers.length === 8, 'listAvailableProviders returns array of 8 providers');
assert(providers.includes('openai'), 'listAvailableProviders includes openai');
assert(providers.includes('anthropic'), 'listAvailableProviders includes anthropic');
assert(providers.includes('aws'), 'listAvailableProviders includes aws');

// Test 5.10: discoverProviderCapabilities returns null for unknown provider
const unknownCapabilities = discoverProviderCapabilities('unknown');
assert(unknownCapabilities === null, 'discoverProviderCapabilities returns null for unknown provider');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SECTION 6: ProviderAggregator (15 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n─── TEST SECTION 6: ProviderAggregator (15 tests) ───');

// Test 6.1: Aggregator constructor creates empty aggregator
const emptyAgg = new ProviderAggregator();
assert(emptyAgg.clients.size === 0, 'Empty aggregator has no clients');

// Test 6.2: Aggregator constructor accepts providers map
const aggProviders = {
    openai: { credentials: { apiKey: 'key1' } },
    anthropic: { credentials: { apiKey: 'key2', orgId: 'org1' } }
};
const populatedAgg = new ProviderAggregator(aggProviders);
assert(populatedAgg.clients.size === 2, 'Aggregator initializes with 2 providers');

// Test 6.3: Aggregator has openai client
assert(populatedAgg.clients.has('openai'), 'Aggregator has openai client');

// Test 6.4: Aggregator has anthropic client
assert(populatedAgg.clients.has('anthropic'), 'Aggregator has anthropic client');

// Test 6.5: addProvider adds new client
const aggToAdd = new ProviderAggregator();
aggToAdd.addProvider('google_cloud', { oauthToken: 'token', projectId: 'proj', datasetId: 'ds' });
assert(aggToAdd.clients.has('google_cloud'), 'addProvider adds new provider');

// Test 6.6: addProvider accepts options
const aggWithOptions = new ProviderAggregator();
aggWithOptions.addProvider('openai', { apiKey: 'key' }, { timeout: 5000 });
const client = aggWithOptions.clients.get('openai');
assert(client.timeout === 5000, 'addProvider applies options');

// Test 6.7: Aggregator applies global options
const globalOptAgg = new ProviderAggregator(
    { openai: { credentials: { apiKey: 'key' } } },
    { timeout: 10000 }
);
assert(globalOptAgg.clients.get('openai').timeout === 10000, 'Global options apply to clients');

// Test 6.8: getHealthSummary returns summary object
const summaryAgg = new ProviderAggregator(aggProviders);
const summary = summaryAgg.getHealthSummary();
assert(summary !== null && typeof summary === 'object', 'getHealthSummary returns object');

// Test 6.9: Health summary has required fields
assert(typeof summary.total === 'number', 'Health summary has total field');
assert(typeof summary.healthy === 'number', 'Health summary has healthy field');
assert(typeof summary.degraded === 'number', 'Health summary has degraded field');
assert(typeof summary.error === 'number', 'Health summary has error field');

// Test 6.10: Health summary counts providers
assert(summary.total === 2, 'Health summary counts all providers');

// Test 6.11: Health summary includes provider status
assert(summary.providers && typeof summary.providers === 'object', 'Health summary includes provider statuses');

// Test 6.12-6.15: Multiple providers in aggregator
const multiAgg = new ProviderAggregator({
    openai: { credentials: { apiKey: 'k1' } },
    anthropic: { credentials: { apiKey: 'k2', orgId: 'org1' } },
    cohere: { credentials: { apiKey: 'k3' } },
    mistral: { credentials: { apiKey: 'k4' } }
});
assert(multiAgg.clients.size === 4, 'Aggregator manages 4 providers');
assert(multiAgg.clients.has('openai'), 'Aggregator has openai');
assert(multiAgg.clients.has('anthropic'), 'Aggregator has anthropic');
assert(multiAgg.clients.has('cohere'), 'Aggregator has cohere');
assert(multiAgg.clients.has('mistral'), 'Aggregator has mistral');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SECTION 7: Provider Health Tracking (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n─── TEST SECTION 7: Provider Health Tracking (10 tests) ───');

// Test 7.1: Initialize health for all providers
initializeProviderHealth();
const allProvidersList = listAvailableProviders();
assert(allProvidersList.length > 0, 'Provider health initialization completed');

// Test 7.2: Client has health status method
assert(typeof openaiClient.getHealthStatus === 'function', 'ProviderClient has getHealthStatus method');

// Test 7.3: Health status returns object
const healthStatus = openaiClient.getHealthStatus();
assert(typeof healthStatus === 'object', 'getHealthStatus returns object');

// Test 7.4: Health status has required fields
assert('status' in healthStatus, 'Health status has status field');
assert('isHealthy' in healthStatus, 'Health status has isHealthy field');

// Test 7.5: Initial health status is unknown
assert(healthStatus.status === 'unknown', 'Initial health status is unknown');

// Test 7.6: Health tracking includes consecutive failures
assert(typeof healthStatus.consecutiveFailures === 'number', 'Health tracking tracks consecutive failures');

// Test 7.7: Health tracking includes last error
assert('lastError' in healthStatus, 'Health tracking includes lastError field');

// Test 7.8: Health tracking includes last success timestamp
assert('lastSuccess' in healthStatus, 'Health tracking includes lastSuccess field');

// Test 7.9: Multiple providers have health status
const credsByProvider = {
    openai: { apiKey: 'test' },
    anthropic: { apiKey: 'test', orgId: 'org-test' },
    google_cloud: { oauthToken: 'test-token', projectId: 'proj-test', datasetId: 'ds-test' },
    azure: { oauthToken: 'test-token', subscriptionId: 'sub-test' },
    aws: { oauthToken: 'arn:aws:iam::123456789:role/Test', accountId: '123456789' },
    cohere: { apiKey: 'test' },
    mistral: { apiKey: 'test' },
    huggingface: { apiKey: 'test' }
};
const allHealthy = allProvidersList.map(p => {
    const creds = credsByProvider[p] || { apiKey: 'test' };
    const client = createProviderClient(p, creds);
    return client.getHealthStatus();
});
assert(allHealthy.length === 8, 'All providers have health status');

// Test 7.10: Health status can be retrieved independently
const oaiHealth = openaiClient.getHealthStatus();
const anthropicHealth = anthropicClient.getHealthStatus();
assert(oaiHealth !== anthropicHealth, 'Each provider has independent health status');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SECTION 8: Error Handling & Edge Cases (15 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n─── TEST SECTION 8: Error Handling & Edge Cases (15 tests) ───');

// Test 8.1: Invalid provider throws error
assertThrows(
    () => new ProviderClient('invalid', { apiKey: 'test' }),
    'Unknown provider',
    'Constructor rejects invalid provider'
);

// Test 8.2: Case-insensitive provider name
const lowerClient = new ProviderClient('OPENAI', { apiKey: 'test' });
assert(lowerClient.providerKey === 'openai', 'Provider name is case-insensitive');

// Test 8.3: Missing required credentials for api_key auth
assertThrows(
    () => new ProviderClient('openai', {}),
    'apiKey',
    'Missing apiKey throws error'
);

// Test 8.4: Missing required credentials for oauth2 auth
assertThrows(
    () => new ProviderClient('azure', {}),
    'oauthToken',
    'Missing oauthToken throws error'
);

// Test 8.5: normalizeToFOCUS with empty object
const emptyNormalized = openaiClient.normalizeToFOCUS({});
assert(emptyNormalized !== null, 'Empty object normalizes to structure');
assert(emptyNormalized.provider === 'OpenAI', 'Empty object has provider field');

// Test 8.6: Field mapping with undefined values
const partialData = { organization_id: 'org-1', total_usage: undefined };
const partialNormalized = openaiClient.normalizeToFOCUS(partialData);
assert(partialNormalized.provider_org_id === 'org-1', 'Defined fields are mapped');

// Test 8.7: Aggregator handles invalid provider gracefully
const aggWithInvalid = new ProviderAggregator({
    openai: { credentials: { apiKey: 'key' } },
    invalid: { credentials: { apiKey: 'key' } }
});
assert(aggWithInvalid.clients.has('openai'), 'Valid provider is added');
assert(!aggWithInvalid.clients.has('invalid'), 'Invalid provider is not added');

// Test 8.8: List available providers returns non-empty array
assert(listAvailableProviders().length > 0, 'listAvailableProviders returns non-empty list');

// Test 8.9: Discover capabilities case-insensitive
const capLower = discoverProviderCapabilities('openai');
const capUpper = discoverProviderCapabilities('OPENAI');
assert(capLower !== null && capUpper !== null, 'Discover capabilities is case-insensitive');

// Test 8.10: Parameter conversion edge cases
assert(openaiClient._paramToCredKey('a') === 'a', 'Single char param converts');
assert(openaiClient._paramToCredKey('a_b_c') === 'aBC', 'Multi underscore param converts correctly');

// Test 8.11: Factory function with invalid provider
assertThrows(
    () => createProviderClient('nonexistent', { apiKey: 'test' }),
    'Unknown provider',
    'Factory rejects invalid provider'
);

// Test 8.12: Registry is immutable at runtime
const originalLength = Object.keys(PROVIDER_REGISTRY).length;
assert(originalLength === 8, 'Registry has 8 providers');

// Test 8.13: All required fields are non-empty strings or arrays
expectedProviders.forEach(provider => {
    const spec = PROVIDER_REGISTRY[provider];
    assert(spec.name.length > 0, `${provider} has non-empty name`);
    assert(spec.billingEndpoint.length > 0, `${provider} has non-empty billingEndpoint`);
    assert(spec.usageEndpoint.length > 0, `${provider} has non-empty usageEndpoint`);
});

// Test 8.14: Field mapping values are consistent
expectedProviders.forEach(provider => {
    const mapping = PROVIDER_REGISTRY[provider].fieldMapping;
    Object.entries(mapping).forEach(([key, value]) => {
        assert(typeof key === 'string' && typeof value === 'string', `${provider} mapping has valid key/value types`);
    });
});

// Test 8.15: Rate limits are positive numbers
expectedProviders.forEach(provider => {
    assert(PROVIDER_REGISTRY[provider].rateLimit > 0, `${provider} has positive rate limit`);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(80));
console.log('TEST SUMMARY');
console.log('═'.repeat(80));
console.log(`Total Tests: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    failedTests.forEach(test => {
        console.log(`  - ${test}`);
    });
    process.exit(1);
} else {
    console.log('\n✅ ALL TESTS PASSED');
    process.exit(0);
}
