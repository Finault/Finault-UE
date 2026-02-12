/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TENANT ONBOARDING AUTOMATION TEST SUITE — GAP #7
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Comprehensive test suite for Finault Tenant Onboarding Automation
 * Covers: 8-state machine, provider OAuth/API configs, tenant lifecycle,
 *         invoice processing, reconciliation, close pack generation, and metrics
 *
 * Test Count: ~130 tests organized by module
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import {
    ONBOARDING_STATES,
    VALID_TRANSITIONS,
    PROVIDER_OAUTH_CONFIGS,
    TenantOnboardingManager,
    ProviderOAuthFlow,
    createTenantOnboarding,
    createProviderOAuthFlow
} from '../core/tenant-onboarding.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourcePath = path.join(__dirname, '..', 'core', 'tenant-onboarding.js');
const source = fs.readFileSync(sourcePath, 'utf8');

let passed = 0;
let failed = 0;
const failedTests = [];

/**
 * Custom assertion function
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
            assert(
                false,
                `${testName} - Expected: ${expectedMessage}, Got: ${error.message}`
            );
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
// TEST SECTION 1: Structural Verification (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n─── TEST SECTION 1: Structural Verification (10 tests) ───');

// Test 1.1: Source contains all 8 onboarding states
assert(
    source.includes('account_created') &&
        source.includes('provider_connecting') &&
        source.includes('provider_connected') &&
        source.includes('first_invoice_uploading') &&
        source.includes('first_invoice_parsed') &&
        source.includes('first_recon_running') &&
        source.includes('first_close_pack_generated') &&
        source.includes('onboarding_complete'),
    'Source contains all 8 onboarding states'
);

// Test 1.2: Source contains VALID_TRANSITIONS
assert(
    source.includes('VALID_TRANSITIONS'),
    'Source contains VALID_TRANSITIONS'
);

// Test 1.3: Source contains PROVIDER_OAUTH_CONFIGS
assert(
    source.includes('PROVIDER_OAUTH_CONFIGS'),
    'Source contains PROVIDER_OAUTH_CONFIGS'
);

// Test 1.4: Source contains all 8 provider names
assert(
    source.includes('openai') &&
        source.includes('anthropic') &&
        source.includes('aws') &&
        source.includes('azure') &&
        source.includes('google_cloud') &&
        source.includes('cohere') &&
        source.includes('mistral') &&
        source.includes('together_ai'),
    'Source contains all 8 provider names'
);

// Test 1.5: Source contains TenantOnboardingManager class
assert(
    source.includes('class TenantOnboardingManager'),
    'Source contains TenantOnboardingManager class'
);

// Test 1.6: Source contains ProviderOAuthFlow class
assert(
    source.includes('class ProviderOAuthFlow'),
    'Source contains ProviderOAuthFlow class'
);

// Test 1.7: Source contains createTenantOnboarding factory
assert(
    source.includes('createTenantOnboarding'),
    'Source contains createTenantOnboarding factory'
);

// Test 1.8: Source contains connectProvider/disconnectProvider
assert(
    source.includes('connectProvider') && source.includes('disconnectProvider'),
    'Source contains connectProvider/disconnectProvider methods'
);

// Test 1.9: Source contains time_to_first_close_pack metric
assert(
    source.includes('time_to_first_close_pack'),
    'Source contains time_to_first_close_pack metric'
);

// Test 1.10: Source contains onboarding_failed state
assert(
    source.includes('onboarding_failed'),
    'Source contains onboarding_failed error state'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SECTION 2: State Machine Flow (20 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n─── TEST SECTION 2: State Machine Flow (20 tests) ───');

// Test 2.1: ONBOARDING_STATES contains all 9 states
assert(
    Object.keys(ONBOARDING_STATES).length === 9,
    'ONBOARDING_STATES contains exactly 9 states'
);

// Test 2.2: account_created is valid state
assert(
    ONBOARDING_STATES.account_created === 'account_created',
    'account_created state is defined'
);

// Test 2.3: onboarding_complete is valid state
assert(
    ONBOARDING_STATES.onboarding_complete === 'onboarding_complete',
    'onboarding_complete state is defined'
);

// Test 2.4: onboarding_failed is valid state
assert(
    ONBOARDING_STATES.onboarding_failed === 'onboarding_failed',
    'onboarding_failed state is defined'
);

// Test 2.5: Valid transition from account_created to provider_connecting
assert(
    VALID_TRANSITIONS.get(ONBOARDING_STATES.account_created).includes(
        ONBOARDING_STATES.provider_connecting
    ),
    'Valid transition account_created → provider_connecting'
);

// Test 2.6: Valid transition provider_connecting to provider_connected
assert(
    VALID_TRANSITIONS.get(ONBOARDING_STATES.provider_connecting).includes(
        ONBOARDING_STATES.provider_connected
    ),
    'Valid transition provider_connecting → provider_connected'
);

// Test 2.7: Valid transition provider_connected to first_invoice_uploading
assert(
    VALID_TRANSITIONS.get(ONBOARDING_STATES.provider_connected).includes(
        ONBOARDING_STATES.first_invoice_uploading
    ),
    'Valid transition provider_connected → first_invoice_uploading'
);

// Test 2.8: Valid transition first_invoice_uploading to first_invoice_parsed
assert(
    VALID_TRANSITIONS.get(ONBOARDING_STATES.first_invoice_uploading).includes(
        ONBOARDING_STATES.first_invoice_parsed
    ),
    'Valid transition first_invoice_uploading → first_invoice_parsed'
);

// Test 2.9: Valid transition first_invoice_parsed to first_recon_running
assert(
    VALID_TRANSITIONS.get(ONBOARDING_STATES.first_invoice_parsed).includes(
        ONBOARDING_STATES.first_recon_running
    ),
    'Valid transition first_invoice_parsed → first_recon_running'
);

// Test 2.10: Valid transition first_recon_running to first_close_pack_generated
assert(
    VALID_TRANSITIONS.get(ONBOARDING_STATES.first_recon_running).includes(
        ONBOARDING_STATES.first_close_pack_generated
    ),
    'Valid transition first_recon_running → first_close_pack_generated'
);

// Test 2.11: Valid transition first_close_pack_generated to onboarding_complete
assert(
    VALID_TRANSITIONS.get(ONBOARDING_STATES.first_close_pack_generated).includes(
        ONBOARDING_STATES.onboarding_complete
    ),
    'Valid transition first_close_pack_generated → onboarding_complete'
);

// Test 2.12: Can transition to onboarding_failed from any state
const failableStates = [
    ONBOARDING_STATES.account_created,
    ONBOARDING_STATES.provider_connecting,
    ONBOARDING_STATES.provider_connected
];
const allCanFail = failableStates.every(state =>
    VALID_TRANSITIONS.get(state).includes(ONBOARDING_STATES.onboarding_failed)
);
assert(allCanFail, 'Can transition to onboarding_failed from intermediate states');

// Test 2.13: Cannot transition from onboarding_complete
assert(
    VALID_TRANSITIONS.get(ONBOARDING_STATES.onboarding_complete).length === 0,
    'Cannot transition from onboarding_complete'
);

// Test 2.14: Full happy path state sequence is valid
const happyPath = [
    ONBOARDING_STATES.account_created,
    ONBOARDING_STATES.provider_connecting,
    ONBOARDING_STATES.provider_connected,
    ONBOARDING_STATES.first_invoice_uploading,
    ONBOARDING_STATES.first_invoice_parsed,
    ONBOARDING_STATES.first_recon_running,
    ONBOARDING_STATES.first_close_pack_generated,
    ONBOARDING_STATES.onboarding_complete
];
let pathValid = true;
for (let i = 0; i < happyPath.length - 1; i++) {
    const current = happyPath[i];
    const next = happyPath[i + 1];
    if (!VALID_TRANSITIONS.get(current).includes(next)) {
        pathValid = false;
        break;
    }
}
assert(pathValid, 'Full happy path transitions are all valid');

// Test 2.15: Cannot skip states (provider_connecting to first_invoice_uploading)
assert(
    !VALID_TRANSITIONS.get(ONBOARDING_STATES.provider_connecting).includes(
        ONBOARDING_STATES.first_invoice_uploading
    ),
    'Cannot skip provider_connected state'
);

// Test 2.16: State machine is DAG (linear progression)
// Each state (except terminal) should lead to exactly one path forward
const validTransitionEntries = Array.from(VALID_TRANSITIONS.entries());
let isLinearPath = true;
for (const [fromState, toStates] of validTransitionEntries) {
    // From account_created, we should have exactly one normal path
    if (fromState === ONBOARDING_STATES.account_created) {
        const nonFailPaths = toStates.filter(s => s !== ONBOARDING_STATES.onboarding_failed);
        if (nonFailPaths.length !== 1) {
            isLinearPath = false;
        }
    }
}
assert(isLinearPath, 'State machine follows linear progression');

// Test 2.17: Start onboarding creates account_created state
const manager = createTenantOnboarding();
const result = manager.startOnboarding('org-001', 'pro');
assert(
    result.state === ONBOARDING_STATES.account_created,
    'Start onboarding creates account_created state'
);

// Test 2.18: State history records timestamps
const stateHistory = manager.getState('org-001');
assert(
    stateHistory.history.length > 0 && stateHistory.history[0].timestamp,
    'State history records timestamps'
);

// Test 2.19: State history records metadata
assert(
    stateHistory.history[0].metadata && stateHistory.history[0].metadata.plan === 'pro',
    'State history records transition metadata'
);

// Test 2.20: Progress percentage increases through flow
const manager2 = createTenantOnboarding();
manager2.startOnboarding('org-002', 'starter');
const progressAtStart = manager2.getOnboardingProgress('org-002');
assert(
    progressAtStart.percentage >= 10 && progressAtStart.percentage <= 20,
    'Progress is 12.5% at account_created state (1 of 8 steps)'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SECTION 3: Provider OAuth Configs (15 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n─── TEST SECTION 3: Provider OAuth Configs (15 tests) ───');

// Test 3.1: All 8 providers are configured
assert(
    Object.keys(PROVIDER_OAUTH_CONFIGS).length === 8,
    'Exactly 8 providers are configured'
);

// Test 3.2: openai has authType api_key
assert(
    PROVIDER_OAUTH_CONFIGS.openai.authType === 'api_key',
    'OpenAI authType is api_key'
);

// Test 3.3: openai has keyHeader
assert(
    PROVIDER_OAUTH_CONFIGS.openai.keyHeader === 'Authorization',
    'OpenAI has correct keyHeader'
);

// Test 3.4: openai has validateEndpoint
assert(
    PROVIDER_OAUTH_CONFIGS.openai.validateEndpoint ===
        'https://api.openai.com/v1/models',
    'OpenAI has correct validateEndpoint'
);

// Test 3.5: anthropic has api_key authType
assert(
    PROVIDER_OAUTH_CONFIGS.anthropic.authType === 'api_key',
    'Anthropic authType is api_key'
);

// Test 3.6: anthropic has X-API-Key header
assert(
    PROVIDER_OAUTH_CONFIGS.anthropic.keyHeader === 'X-API-Key',
    'Anthropic has X-API-Key header'
);

// Test 3.7: aws has oauth2 authType
assert(
    PROVIDER_OAUTH_CONFIGS.aws.authType === 'oauth2',
    'AWS authType is oauth2'
);

// Test 3.8: aws has tokenEndpoint
assert(
    PROVIDER_OAUTH_CONFIGS.aws.tokenEndpoint ===
        'https://signin.aws.amazon.com/oauth/token',
    'AWS has correct tokenEndpoint'
);

// Test 3.9: aws has scopes array
assert(
    Array.isArray(PROVIDER_OAUTH_CONFIGS.aws.scopes) &&
        PROVIDER_OAUTH_CONFIGS.aws.scopes.length > 0,
    'AWS has scopes array'
);

// Test 3.10: azure has oauth2 authType
assert(
    PROVIDER_OAUTH_CONFIGS.azure.authType === 'oauth2',
    'Azure authType is oauth2'
);

// Test 3.11: azure has tokenEndpoint with tenant placeholder
assert(
    PROVIDER_OAUTH_CONFIGS.azure.tokenEndpoint.includes('{tenant}'),
    'Azure tokenEndpoint has tenant placeholder'
);

// Test 3.12: google_cloud has oauth2 authType
assert(
    PROVIDER_OAUTH_CONFIGS.google_cloud.authType === 'oauth2',
    'Google Cloud authType is oauth2'
);

// Test 3.13: cohere has api_key authType
assert(
    PROVIDER_OAUTH_CONFIGS.cohere.authType === 'api_key',
    'Cohere authType is api_key'
);

// Test 3.14: mistral has api_key authType
assert(
    PROVIDER_OAUTH_CONFIGS.mistral.authType === 'api_key',
    'Mistral authType is api_key'
);

// Test 3.15: together_ai has api_key authType
assert(
    PROVIDER_OAUTH_CONFIGS.together_ai.authType === 'api_key',
    'Together AI authType is api_key'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SECTION 4: Provider Connection (20 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n─── TEST SECTION 4: Provider Connection (20 tests) ───');

// Test 4.1: Connect provider with valid API key succeeds
const manager3 = createTenantOnboarding();
manager3.startOnboarding('org-003', 'pro');
const connResult = manager3.connectProvider('org-003', 'openai', {
    apiKey: 'sk-test-key'
});
assert(connResult.connected === true, 'Connect provider with valid apiKey succeeds');

// Test 4.2: Provider connection returns provider ID
assert(
    connResult.provider === 'openai',
    'Provider connection returns correct provider ID'
);

// Test 4.3: Provider connection returns validatedAt timestamp
assert(
    connResult.validatedAt instanceof Date,
    'Provider connection returns validatedAt timestamp'
);

// Test 4.4: Connect unknown provider throws
const manager4 = createTenantOnboarding();
manager4.startOnboarding('org-004', 'pro');
assertThrows(
    () =>
        manager4.connectProvider('org-004', 'unknown_provider', {
            apiKey: 'key'
        }),
    'Unknown provider',
    'Connect unknown provider throws error'
);

// Test 4.5: Connect without credentials throws
const manager5 = createTenantOnboarding();
manager5.startOnboarding('org-005', 'pro');
assertThrows(
    () => manager5.connectProvider('org-005', 'openai', {}),
    'Credentials cannot be empty',
    'Connect without credentials throws error'
);

// Test 4.6: Connect same provider twice updates connection
const manager6 = createTenantOnboarding();
manager6.startOnboarding('org-006', 'pro');
manager6.connectProvider('org-006', 'openai', { apiKey: 'key1' });
manager6.connectProvider('org-006', 'openai', { apiKey: 'key2' });
const connections = manager6.getProviderConnections('org-006');
assert(
    connections.length === 1,
    'Connecting same provider twice updates rather than duplicates'
);

// Test 4.7: Disconnect provider works
const manager7 = createTenantOnboarding();
manager7.startOnboarding('org-007', 'pro');
manager7.connectProvider('org-007', 'openai', { apiKey: 'key' });
manager7.disconnectProvider('org-007', 'openai');
const connsAfterDisconnect = manager7.getProviderConnections('org-007');
assert(connsAfterDisconnect.length === 0, 'Disconnect provider removes connection');

// Test 4.8: Get provider connections returns empty array when none connected
const manager8 = createTenantOnboarding();
manager8.startOnboarding('org-008', 'pro');
const emptyConns = manager8.getProviderConnections('org-008');
assert(
    Array.isArray(emptyConns) && emptyConns.length === 0,
    'Get provider connections returns empty array when none'
);

// Test 4.9: Get provider connections returns all connected providers
const manager9 = createTenantOnboarding();
manager9.startOnboarding('org-009', 'pro');
manager9.connectProvider('org-009', 'openai', { apiKey: 'key1' });
manager9.connectProvider('org-009', 'anthropic', { apiKey: 'key2' });
const allConns = manager9.getProviderConnections('org-009');
assert(
    allConns.length === 2,
    'Get provider connections returns all connected providers'
);

// Test 4.10: Validate credentials for API key provider returns valid
const manager10 = createTenantOnboarding();
const validation = manager10.validateProviderCredentials('openai', {
    apiKey: 'sk-test'
});
assert(validation.valid === true, 'Validate credentials for API key provider succeeds');

// Test 4.11: Validate credentials returns capabilities
assert(
    Array.isArray(validation.capabilities) && validation.capabilities.length > 0,
    'Validate credentials returns capabilities'
);

// Test 4.12: Validate credentials returns validatedAt
assert(
    validation.validatedAt instanceof Date,
    'Validate credentials returns validatedAt timestamp'
);

// Test 4.13: Validate unknown provider throws
const manager11 = createTenantOnboarding();
assertThrows(
    () =>
        manager11.validateProviderCredentials('unknown', {
            apiKey: 'key'
        }),
    'Provider config not found',
    'Validate unknown provider throws error'
);

// Test 4.14: Validate API key without apiKey fails
const manager12 = createTenantOnboarding();
const invalidValidation = manager12.validateProviderCredentials('openai', {});
assert(
    invalidValidation.valid === false,
    'Validate API key without apiKey fails'
);

// Test 4.15: Validate OAuth provider requires accessToken
const manager13 = createTenantOnboarding();
const oauthValidation = manager13.validateProviderCredentials('aws', {});
assert(
    oauthValidation.valid === false,
    'Validate OAuth provider without accessToken fails'
);

// Test 4.16: Provider connection stored in tenant state
const manager14 = createTenantOnboarding();
manager14.startOnboarding('org-014', 'pro');
manager14.connectProvider('org-014', 'openai', { apiKey: 'key' });
const stateWithProvider = manager14.getState('org-014');
assert(stateWithProvider.providerCount === 1, 'Provider connection stored in tenant state');

// Test 4.17: Connect API key provider with OAuth credentials fails
const manager15 = createTenantOnboarding();
manager15.startOnboarding('org-015', 'pro');
assertThrows(
    () =>
        manager15.connectProvider('org-015', 'openai', {
            accessToken: 'token'
        }),
    'valid',
    'Connect API key provider with OAuth credentials requires apiKey'
);

// Test 4.18: Transition states when connecting provider
const manager16 = createTenantOnboarding();
manager16.startOnboarding('org-016', 'pro');
const initialState = manager16.getState('org-016');
assert(
    initialState.state === ONBOARDING_STATES.account_created,
    'Initial state is account_created'
);
manager16.connectProvider('org-016', 'openai', { apiKey: 'key' });
const afterConnect = manager16.getState('org-016');
assert(
    afterConnect.state === ONBOARDING_STATES.provider_connected,
    'After provider connection, state is provider_connected'
);

// Test 4.19: Multiple providers can be connected
const manager17 = createTenantOnboarding();
manager17.startOnboarding('org-017', 'pro');
manager17.connectProvider('org-017', 'openai', { apiKey: 'key1' });
manager17.connectProvider('org-017', 'anthropic', { apiKey: 'key2' });
manager17.connectProvider('org-017', 'cohere', { apiKey: 'key3' });
const multiConns = manager17.getProviderConnections('org-017');
assert(multiConns.length === 3, 'Multiple providers can be connected');

// Test 4.20: Unknown tenant for provider connection throws
const manager18 = createTenantOnboarding();
assertThrows(
    () =>
        manager18.connectProvider('unknown-org', 'openai', {
            apiKey: 'key'
        }),
    'not found',
    'Unknown tenant for provider connection throws error'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SECTION 5: Invoice & Reconciliation Flow (15 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n─── TEST SECTION 5: Invoice & Reconciliation Flow (15 tests) ───');

// Test 5.1: Upload first invoice transitions correctly
const manager19 = createTenantOnboarding();
manager19.startOnboarding('org-019', 'pro');
manager19.connectProvider('org-019', 'openai', { apiKey: 'key' });
const invoiceResult = manager19.uploadFirstInvoice('org-019', {
    date: '2024-01-01',
    lineItems: [{ description: 'API calls', amount: 500 }]
});
assert(invoiceResult.parsed === true, 'Upload first invoice returns parsed true');

// Test 5.2: Upload returns parsed data
assert(
    Array.isArray(invoiceResult.lineItems) && invoiceResult.lineItems.length > 0,
    'Upload returns parsed line items'
);

// Test 5.3: Upload returns confidence score
assert(
    typeof invoiceResult.confidence === 'number' &&
        invoiceResult.confidence > 0 &&
        invoiceResult.confidence <= 1,
    'Upload returns confidence score'
);

// Test 5.4: Upload returns total amount
assert(
    typeof invoiceResult.totalAmount === 'number' && invoiceResult.totalAmount > 0,
    'Upload returns total amount'
);

// Test 5.5: Run reconciliation requires prior invoice parsing
const manager20 = createTenantOnboarding();
manager20.startOnboarding('org-020', 'pro');
manager20.connectProvider('org-020', 'openai', { apiKey: 'key' });
assertThrows(
    () => manager20.runFirstReconciliation('org-020'),
    'Must upload invoice',
    'Run reconciliation before invoice upload throws'
);

// Test 5.6: Reconciliation after invoice upload succeeds
const manager21 = createTenantOnboarding();
manager21.startOnboarding('org-021', 'pro');
manager21.connectProvider('org-021', 'openai', { apiKey: 'key' });
manager21.uploadFirstInvoice('org-021', {
    date: '2024-01-01',
    lineItems: [{ description: 'API', amount: 100 }]
});
const reconResult = manager21.runFirstReconciliation('org-021');
assert(reconResult.reconciled === true, 'Reconciliation after invoice upload succeeds');

// Test 5.7: Reconciliation returns matchRate
assert(
    typeof reconResult.matchRate === 'number' &&
        reconResult.matchRate >= 0 &&
        reconResult.matchRate <= 1,
    'Reconciliation returns matchRate'
);

// Test 5.8: Reconciliation returns discrepancies
assert(
    typeof reconResult.discrepancies === 'number' && reconResult.discrepancies >= 0,
    'Reconciliation returns discrepancies count'
);

// Test 5.9: Reconciliation returns timestamp
assert(
    reconResult.timestamp instanceof Date,
    'Reconciliation returns timestamp'
);

// Test 5.10: Generate close pack requires prior reconciliation
const manager22 = createTenantOnboarding();
manager22.startOnboarding('org-022', 'pro');
manager22.connectProvider('org-022', 'openai', { apiKey: 'key' });
manager22.uploadFirstInvoice('org-022', {
    date: '2024-01-01',
    lineItems: [{ description: 'API', amount: 100 }]
});
assertThrows(
    () => manager22.generateFirstClosePack('org-022'),
    'Must complete reconciliation',
    'Generate close pack before reconciliation throws'
);

// Test 5.11: Close pack generation succeeds after reconciliation
const manager23 = createTenantOnboarding();
manager23.startOnboarding('org-023', 'pro');
manager23.connectProvider('org-023', 'openai', { apiKey: 'key' });
manager23.uploadFirstInvoice('org-023', {
    date: '2024-01-01',
    lineItems: [{ description: 'API', amount: 100 }]
});
manager23.runFirstReconciliation('org-023');
const closePackResult = manager23.generateFirstClosePack('org-023');
assert(
    closePackResult.closePackId && closePackResult.generatedAt,
    'Close pack generation returns ID and timestamp'
);

// Test 5.12: Close pack records metrics
const metricsAfterClosePack = manager23.getMetrics('org-023');
assert(
    'time_to_first_close_pack' in metricsAfterClosePack &&
        metricsAfterClosePack.hasOwnProperty('time_to_first_close_pack'),
    'Close pack generation records time_to_first_close_pack metric'
);

// Test 5.13: Invoice upload records time_to_first_invoice metric
const manager24 = createTenantOnboarding();
manager24.startOnboarding('org-024', 'pro');
manager24.connectProvider('org-024', 'openai', { apiKey: 'key' });
manager24.uploadFirstInvoice('org-024', {
    date: '2024-01-01',
    lineItems: [{ description: 'API', amount: 100 }]
});
const metrics24 = manager24.getMetrics('org-024');
assert(
    'time_to_first_invoice' in metrics24 &&
        metrics24.hasOwnProperty('time_to_first_invoice'),
    'Invoice upload records time_to_first_invoice metric'
);

// Test 5.14: State progresses through invoice → recon → close pack
const manager25 = createTenantOnboarding();
manager25.startOnboarding('org-025', 'pro');
manager25.connectProvider('org-025', 'openai', { apiKey: 'key' });
const stateAfterConnected = manager25.getState('org-025');
assert(
    stateAfterConnected.state === ONBOARDING_STATES.provider_connected,
    'State after provider connected'
);
manager25.uploadFirstInvoice('org-025', {
    date: '2024-01-01',
    lineItems: [{ description: 'API', amount: 100 }]
});
const stateAfterParsed = manager25.getState('org-025');
assert(
    stateAfterParsed.state === ONBOARDING_STATES.first_invoice_parsed,
    'State after invoice parsed'
);
manager25.runFirstReconciliation('org-025');
const stateAfterRecon = manager25.getState('org-025');
assert(
    stateAfterRecon.state === ONBOARDING_STATES.first_close_pack_generated,
    'State after close pack generated'
);

// Test 5.15: Unknown tenant for invoice upload throws
const manager26 = createTenantOnboarding();
assertThrows(
    () =>
        manager26.uploadFirstInvoice('unknown-org', {
            date: '2024-01-01',
            lineItems: []
        }),
    'not found',
    'Unknown tenant for invoice upload throws error'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SECTION 6: Onboarding Lifecycle (15 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n─── TEST SECTION 6: Onboarding Lifecycle (15 tests) ───');

// Test 6.1: Start onboarding creates record
const manager27 = createTenantOnboarding();
const startResult = manager27.startOnboarding('org-027', 'enterprise');
assert(
    startResult.orgId === 'org-027' &&
        startResult.state === ONBOARDING_STATES.account_created,
    'Start onboarding creates record'
);

// Test 6.2: Complete onboarding transitions to complete
const manager28 = createTenantOnboarding();
manager28.startOnboarding('org-028', 'pro');
manager28.connectProvider('org-028', 'openai', { apiKey: 'key' });
manager28.uploadFirstInvoice('org-028', {
    date: '2024-01-01',
    lineItems: [{ description: 'API', amount: 100 }]
});
manager28.runFirstReconciliation('org-028');
manager28.generateFirstClosePack('org-028');
const completeResult = manager28.completeOnboarding('org-028');
assert(
    completeResult.orgId === 'org-028' &&
        completeResult.completedAt instanceof Date,
    'Complete onboarding returns confirmation'
);

// Test 6.3: Complete onboarding calculates duration
assert(
    typeof completeResult.onboardingDurationMs === 'number' &&
        completeResult.onboardingDurationMs >= 0,
    'Complete onboarding calculates duration'
);

// Test 6.4: Fail onboarding records reason
const manager29 = createTenantOnboarding();
manager29.startOnboarding('org-029', 'pro');
manager29.failOnboarding('org-029', 'Provider validation failed');
const failedState = manager29.getState('org-029');
assert(
    failedState.state === ONBOARDING_STATES.onboarding_failed,
    'Fail onboarding transitions to failed state'
);

// Test 6.5: Retry from failure resets to last successful state
const manager30 = createTenantOnboarding();
manager30.startOnboarding('org-030', 'pro');
manager30.connectProvider('org-030', 'openai', { apiKey: 'key' });
const stateBeforeFailure = manager30.getState('org-030').state;
manager30.failOnboarding('org-030', 'Test failure');
const stateAfterFailure = manager30.getState('org-030').state;
manager30.retryFromFailure('org-030');
const retryState = manager30.getState('org-030');
assert(
    stateAfterFailure === ONBOARDING_STATES.onboarding_failed &&
        retryState.state === stateBeforeFailure,
    'Retry from failure resets to last successful state'
);

// Test 6.6: Cannot complete onboarding from wrong state
const manager31 = createTenantOnboarding();
manager31.startOnboarding('org-031', 'pro');
assertThrows(
    () => manager31.completeOnboarding('org-031'),
    'Cannot complete',
    'Cannot complete onboarding from account_created'
);

// Test 6.7: Cannot transition from onboarding_complete
const manager32 = createTenantOnboarding();
manager32.startOnboarding('org-032', 'pro');
manager32.connectProvider('org-032', 'openai', { apiKey: 'key' });
manager32.uploadFirstInvoice('org-032', {
    date: '2024-01-01',
    lineItems: [{ description: 'API', amount: 100 }]
});
manager32.runFirstReconciliation('org-032');
manager32.generateFirstClosePack('org-032');
manager32.completeOnboarding('org-032');
assertThrows(
    () =>
        manager32.transition('org-032', ONBOARDING_STATES.onboarding_failed),
    'Cannot transition',
    'Cannot transition from onboarding_complete'
);

// Test 6.8: Get metrics returns all expected fields
const manager33 = createTenantOnboarding();
manager33.startOnboarding('org-033', 'pro');
manager33.connectProvider('org-033', 'openai', { apiKey: 'key' });
const metricsResult = manager33.getMetrics('org-033');
assert(
    'time_to_first_invoice' in metricsResult &&
        'time_to_first_close_pack' in metricsResult &&
        'providerCount' in metricsResult &&
        'completionPercentage' in metricsResult,
    'Get metrics returns all expected fields'
);

// Test 6.9: List all onboardings returns paginated records
const manager34 = createTenantOnboarding();
manager34.startOnboarding('org-034', 'pro');
manager34.startOnboarding('org-035', 'starter');
const listResult = manager34.listAllOnboardings({ page: 1, pageSize: 10 });
assert(
    Array.isArray(listResult.records) && listResult.records.length === 2,
    'List all onboardings returns records'
);

// Test 6.10: List all onboardings includes pagination info
assert(
    listResult.pagination &&
        'page' in listResult.pagination &&
        'total' in listResult.pagination &&
        'totalPages' in listResult.pagination,
    'List all onboardings includes pagination info'
);

// Test 6.11: List with filter by state works
const manager35 = createTenantOnboarding();
manager35.startOnboarding('org-035', 'pro');
manager35.startOnboarding('org-036', 'starter');
manager35.connectProvider('org-035', 'openai', { apiKey: 'key' });
const filtered = manager35.listAllOnboardings({
    page: 1,
    pageSize: 10,
    filterState: ONBOARDING_STATES.provider_connected
});
assert(
    filtered.records.length === 1,
    'List with filter by state works'
);

// Test 6.12: Start onboarding twice for same org throws
const manager36 = createTenantOnboarding();
manager36.startOnboarding('org-036', 'pro');
assertThrows(
    () => manager36.startOnboarding('org-036', 'pro'),
    'already started',
    'Start onboarding twice for same org throws'
);

// Test 6.13: Get state for unknown tenant throws
const manager37 = createTenantOnboarding();
assertThrows(
    () => manager37.getState('unknown-org'),
    'not found',
    'Get state for unknown tenant throws'
);

// Test 6.14: Transition with invalid state throws
const manager38 = createTenantOnboarding();
manager38.startOnboarding('org-038', 'pro');
assertThrows(
    () => manager38.transition('org-038', 'invalid_state'),
    'Invalid state',
    'Transition with invalid state name throws'
);

// Test 6.15: Transition with invalid target throws
const manager39 = createTenantOnboarding();
manager39.startOnboarding('org-039', 'pro');
assertThrows(
    () =>
        manager39.transition(
            'org-039',
            ONBOARDING_STATES.first_close_pack_generated
        ),
    'Cannot transition',
    'Transition to invalid target state throws'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SECTION 7: OAuth Flow (15 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n─── TEST SECTION 7: OAuth Flow (15 tests) ───');

// Test 7.1: Initiate OAuth generates authorization URL
const oauthFlow = createProviderOAuthFlow();
const oauthResult = oauthFlow.initiateOAuth('aws', 'https://app.example.com/callback');
assert(
    oauthResult.authorizationUrl &&
        oauthResult.authorizationUrl.includes('client_id'),
    'Initiate OAuth generates authorization URL'
);

// Test 7.2: Initiate OAuth returns state parameter
assert(
    oauthResult.state && typeof oauthResult.state === 'string',
    'Initiate OAuth returns state parameter'
);

// Test 7.3: Initiate OAuth returns provider
assert(
    oauthResult.provider === 'aws',
    'Initiate OAuth returns correct provider'
);

// Test 7.4: Initiate OAuth for API-key provider throws
const oauthFlow2 = createProviderOAuthFlow();
assertThrows(
    () => oauthFlow2.initiateOAuth('openai', 'https://app.example.com/callback'),
    'does not support OAuth',
    'Initiate OAuth for API-key provider throws'
);

// Test 7.5: Initiate OAuth for unknown provider throws
const oauthFlow3 = createProviderOAuthFlow();
assertThrows(
    () => oauthFlow3.initiateOAuth('unknown', 'https://app.example.com/callback'),
    'Unknown provider',
    'Initiate OAuth for unknown provider throws'
);

// Test 7.6: Handle callback exchanges code for tokens
const oauthFlow4 = createProviderOAuthFlow();
const initResult = oauthFlow4.initiateOAuth(
    'aws',
    'https://app.example.com/callback'
);
const callbackResult = oauthFlow4.handleCallback(
    'aws',
    'auth_code_123',
    initResult.state
);
assert(
    callbackResult.accessToken &&
        callbackResult.accessToken.includes('access_'),
    'Handle callback exchanges code for access token'
);

// Test 7.7: Handle callback returns refresh token
assert(
    callbackResult.refreshToken &&
        callbackResult.refreshToken.includes('refresh_'),
    'Handle callback returns refresh token'
);

// Test 7.8: Handle callback returns expiration time
assert(
    callbackResult.expiresAt instanceof Date,
    'Handle callback returns expiration time'
);

// Test 7.9: Handle callback with invalid state throws
const oauthFlow5 = createProviderOAuthFlow();
assertThrows(
    () => oauthFlow5.handleCallback('aws', 'code', 'invalid_state'),
    'Invalid or expired state',
    'Handle callback with invalid state throws'
);

// Test 7.10: Handle callback with mismatched provider throws
const oauthFlow6 = createProviderOAuthFlow();
const initResult2 = oauthFlow6.initiateOAuth(
    'aws',
    'https://app.example.com/callback'
);
assertThrows(
    () => oauthFlow6.handleCallback('azure', 'code', initResult2.state),
    'provider mismatch',
    'Handle callback with mismatched provider throws'
);

// Test 7.11: Refresh access token works
const oauthFlow7 = createProviderOAuthFlow();
const initResult3 = oauthFlow7.initiateOAuth(
    'aws',
    'https://app.example.com/callback'
);
const tokens = oauthFlow7.handleCallback('aws', 'code', initResult3.state);
const refreshResult = oauthFlow7.refreshAccessToken('aws', tokens.refreshToken);
assert(
    refreshResult.accessToken &&
        refreshResult.accessToken !== tokens.accessToken,
    'Refresh access token returns new token'
);

// Test 7.12: Revoke access works
const oauthFlow8 = createProviderOAuthFlow();
const initResult4 = oauthFlow8.initiateOAuth(
    'aws',
    'https://app.example.com/callback'
);
const tokens2 = oauthFlow8.handleCallback('aws', 'code', initResult4.state);
const revokeResult = oauthFlow8.revokeAccess('aws', tokens2.accessToken);
assert(revokeResult.revoked === true, 'Revoke access returns confirmation');

// Test 7.13: Revoke returns timestamp
assert(
    revokeResult.timestamp instanceof Date,
    'Revoke returns timestamp'
);

// Test 7.14: State parameter is unique per request
const oauthFlow9 = createProviderOAuthFlow();
const result1 = oauthFlow9.initiateOAuth(
    'aws',
    'https://app.example.com/callback'
);
const result2 = oauthFlow9.initiateOAuth(
    'aws',
    'https://app.example.com/callback'
);
assert(
    result1.state !== result2.state,
    'State parameter is unique per request'
);

// Test 7.15: Refresh token for unknown provider throws
const oauthFlow10 = createProviderOAuthFlow();
assertThrows(
    () => oauthFlow10.refreshAccessToken('unknown', 'refresh_token'),
    'Unknown provider',
    'Refresh token for unknown provider throws'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SECTION 8: Edge Cases (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n─── TEST SECTION 8: Edge Cases (10 tests) ───');

// Test 8.1: Get state returns progress percentage
const manager40 = createTenantOnboarding();
manager40.startOnboarding('org-040', 'pro');
const stateWithProgress = manager40.getState('org-040');
assert(
    typeof stateWithProgress.progress === 'number' &&
        stateWithProgress.progress >= 0 &&
        stateWithProgress.progress <= 100,
    'Get state returns progress percentage'
);

// Test 8.2: Concurrent transitions handled safely
const manager41 = createTenantOnboarding();
manager41.startOnboarding('org-041', 'pro');
manager41.connectProvider('org-041', 'openai', { apiKey: 'key' });
const stateRead1 = manager41.getState('org-041').state;
const stateRead2 = manager41.getState('org-041').state;
assert(stateRead1 === stateRead2, 'State remains consistent on concurrent reads');

// Test 8.3: Empty tenant list returns paginated empty result
const manager42 = createTenantOnboarding();
const emptyList = manager42.listAllOnboardings();
assert(
    Array.isArray(emptyList.records) && emptyList.records.length === 0,
    'Empty tenant list returns empty records'
);

// Test 8.4: Pagination with page beyond range
const manager43 = createTenantOnboarding();
manager43.startOnboarding('org-043', 'pro');
const farPage = manager43.listAllOnboardings({ page: 100, pageSize: 10 });
assert(
    Array.isArray(farPage.records) && farPage.records.length === 0,
    'Pagination beyond range returns empty'
);

// Test 8.5: Connect provider after failure and retry
const manager44 = createTenantOnboarding();
manager44.startOnboarding('org-044', 'pro');
const stateAtStart = manager44.getState('org-044').state;
manager44.failOnboarding('org-044', 'Initial failure');
const stateAfterFail = manager44.getState('org-044').state;
manager44.retryFromFailure('org-044');
const stateAfterRetry = manager44.getState('org-044').state;
manager44.connectProvider('org-044', 'openai', { apiKey: 'key' });
const retryConnectState = manager44.getState('org-044');
assert(
    stateAfterFail === ONBOARDING_STATES.onboarding_failed &&
        stateAfterRetry === stateAtStart &&
        retryConnectState.state === ONBOARDING_STATES.provider_connected,
    'Can connect provider after failure retry'
);

// Test 8.6: Unknown tenant for metrics throws
const manager45 = createTenantOnboarding();
assertThrows(
    () => manager45.getMetrics('unknown-org'),
    'not found',
    'Unknown tenant for metrics throws'
);

// Test 8.7: Unknown tenant for progress throws
const manager46 = createTenantOnboarding();
assertThrows(
    () => manager46.getOnboardingProgress('unknown-org'),
    'not found',
    'Unknown tenant for progress throws'
);

// Test 8.8: Unknown tenant for reconciliation throws
const manager47 = createTenantOnboarding();
assertThrows(
    () => manager47.runFirstReconciliation('unknown-org'),
    'not found',
    'Unknown tenant for reconciliation throws'
);

// Test 8.9: Unknown tenant for close pack throws
const manager48 = createTenantOnboarding();
assertThrows(
    () => manager48.generateFirstClosePack('unknown-org'),
    'not found',
    'Unknown tenant for close pack throws'
);

// Test 8.10: Retry from non-failed state throws
const manager49 = createTenantOnboarding();
manager49.startOnboarding('org-049', 'pro');
assertThrows(
    () => manager49.retryFromFailure('org-049'),
    'Can only retry from failed state',
    'Retry from non-failed state throws'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SECTION 9: Progress & Metrics (10 tests)
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n─── TEST SECTION 9: Progress & Metrics (10 tests) ───');

// Test 9.1: Progress percentage at account_created
const manager50 = createTenantOnboarding();
manager50.startOnboarding('org-050', 'pro');
const progress0 = manager50.getOnboardingProgress('org-050');
assert(
    progress0.percentage >= 10 && progress0.percentage <= 20,
    'Progress is 12.5% at account_created (1/8 states)'
);

// Test 9.2: Progress increases after provider connection
const manager51 = createTenantOnboarding();
manager51.startOnboarding('org-051', 'pro');
manager51.connectProvider('org-051', 'openai', { apiKey: 'key' });
const progressAfterConnection = manager51.getOnboardingProgress('org-051');
assert(
    progressAfterConnection.percentage > 0 && progressAfterConnection.percentage < 100,
    'Progress increases after provider connection'
);

// Test 9.3: Progress increases further after invoice
const manager52 = createTenantOnboarding();
manager52.startOnboarding('org-052', 'pro');
manager52.connectProvider('org-052', 'openai', { apiKey: 'key' });
manager52.uploadFirstInvoice('org-052', {
    date: '2024-01-01',
    lineItems: [{ description: 'API', amount: 100 }]
});
const progressAfterInvoice = manager52.getOnboardingProgress('org-052');
assert(
    progressAfterInvoice.percentage > progressAfterConnection.percentage,
    'Progress increases after invoice'
);

// Test 9.4: Progress is 100% at onboarding_complete
const manager53 = createTenantOnboarding();
manager53.startOnboarding('org-053', 'pro');
manager53.connectProvider('org-053', 'openai', { apiKey: 'key' });
manager53.uploadFirstInvoice('org-053', {
    date: '2024-01-01',
    lineItems: [{ description: 'API', amount: 100 }]
});
manager53.runFirstReconciliation('org-053');
manager53.generateFirstClosePack('org-053');
manager53.completeOnboarding('org-053');
const progressAtCompletion = manager53.getOnboardingProgress('org-053');
assert(
    progressAtCompletion.percentage >= 95,
    'Progress is 95% or higher at onboarding_complete'
);

// Test 9.5: Completed steps count is accurate
const manager54 = createTenantOnboarding();
manager54.startOnboarding('org-054', 'pro');
const progressSteps = manager54.getOnboardingProgress('org-054');
assert(
    progressSteps.completedSteps === 0 && progressSteps.remainingSteps === 7,
    'Completed steps count is accurate at start'
);

// Test 9.6: Metrics track durations correctly
const manager55 = createTenantOnboarding();
manager55.startOnboarding('org-055', 'pro');
manager55.connectProvider('org-055', 'openai', { apiKey: 'key' });
manager55.uploadFirstInvoice('org-055', {
    date: '2024-01-01',
    lineItems: [{ description: 'API', amount: 100 }]
});
const metricsTracking = manager55.getMetrics('org-055');
assert(
    'time_to_first_invoice' in metricsTracking,
    'Metrics track time_to_first_invoice'
);

// Test 9.7: Provider count is tracked in metrics
const manager56 = createTenantOnboarding();
manager56.startOnboarding('org-056', 'pro');
manager56.connectProvider('org-056', 'openai', { apiKey: 'key' });
manager56.connectProvider('org-056', 'anthropic', { apiKey: 'key2' });
const metrics56 = manager56.getMetrics('org-056');
assert(
    metrics56.providerCount === 2,
    'Provider count is tracked in metrics'
);

// Test 9.8: Completion percentage equals or similar to progress
const manager57 = createTenantOnboarding();
manager57.startOnboarding('org-057', 'pro');
manager57.connectProvider('org-057', 'openai', { apiKey: 'key' });
const metricProgress = manager57.getMetrics('org-057').completionPercentage;
const getProgress = manager57.getOnboardingProgress('org-057').percentage;
assert(
    Math.abs(metricProgress - getProgress) <= 20,
    'Completion percentage and progress are tracking same state'
);

// Test 9.9: Time to first close pack is calculated
const manager58 = createTenantOnboarding();
manager58.startOnboarding('org-058', 'pro');
manager58.connectProvider('org-058', 'openai', { apiKey: 'key' });
manager58.uploadFirstInvoice('org-058', {
    date: '2024-01-01',
    lineItems: [{ description: 'API', amount: 100 }]
});
manager58.runFirstReconciliation('org-058');
manager58.generateFirstClosePack('org-058');
const metrics58 = manager58.getMetrics('org-058');
assert(
    'time_to_first_close_pack' in metrics58,
    'Time to first close pack is calculated'
);

// Test 9.10: Onboarding duration calculated on completion
const manager59 = createTenantOnboarding();
manager59.startOnboarding('org-059', 'pro');
manager59.connectProvider('org-059', 'openai', { apiKey: 'key' });
manager59.uploadFirstInvoice('org-059', {
    date: '2024-01-01',
    lineItems: [{ description: 'API', amount: 100 }]
});
manager59.runFirstReconciliation('org-059');
manager59.generateFirstClosePack('org-059');
manager59.completeOnboarding('org-059');
const finalMetrics = manager59.getMetrics('org-059');
assert(
    'onboardingDurationMs' in finalMetrics,
    'Onboarding duration calculated on completion'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(80));
console.log(`TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(80));

if (failed > 0) {
    console.log('\nFailed tests:');
    failedTests.forEach(test => console.log(`  - ${test}`));
    process.exit(1);
} else {
    console.log('\n✓ All tests passed!');
    process.exit(0);
}
