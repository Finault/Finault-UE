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
        console.log(`  ✗ FAIL: ${message} (${actual} differs from ${expected} by ${diff})`);
    }
}

async function runTests() {
    console.log('═'.repeat(70));
    console.log('W-020 API RESPONSE GUARD TEST SUITE');
    console.log('═'.repeat(70));

    const {
        safeJsonParse,
        categorizeHttpError,
        getRetryHint,
        createFallbackResponse,
        createEmptyResponse,
        API_RESPONSE_CONFIG
    } = await import(path.join(__dirname, '..', 'core', 'api-response-guard.js'));

    // =========================================================================
    // SECTION 1: API_RESPONSE_CONFIG Constants (~10 tests)
    // =========================================================================
    console.log('\n[SECTION 1] API_RESPONSE_CONFIG Constants');

    // w20_001
    assert(typeof API_RESPONSE_CONFIG === 'object', 'w20_001: API_RESPONSE_CONFIG is an object');

    // w20_002
    assert(Array.isArray(API_RESPONSE_CONFIG.categories.rate_limit), 'w20_002: rate_limit category exists');

    // w20_003
    assert(API_RESPONSE_CONFIG.categories.rate_limit.includes(429), 'w20_003: 429 in rate_limit');

    // w20_004
    assert(API_RESPONSE_CONFIG.categories.auth_error.includes(401), 'w20_004: 401 in auth_error');

    // w20_005
    assert(API_RESPONSE_CONFIG.categories.auth_error.includes(403), 'w20_005: 403 in auth_error');

    // w20_006
    assert(API_RESPONSE_CONFIG.categories.not_found.includes(404), 'w20_006: 404 in not_found');

    // w20_007
    assert(API_RESPONSE_CONFIG.categories.server_error.includes(500), 'w20_007: 500 in server_error');

    // w20_008
    assert(API_RESPONSE_CONFIG.categories.server_error.includes(503), 'w20_008: 503 in server_error');

    // w20_009
    assert(typeof API_RESPONSE_CONFIG.defaultFallbackContent === 'string', 'w20_009: defaultFallbackContent is a string');

    // w20_010
    assert(API_RESPONSE_CONFIG.defaultFallbackContent.length > 0, 'w20_010: defaultFallbackContent is not empty');

    // =========================================================================
    // SECTION 2: categorizeHttpError (~20 tests)
    // =========================================================================
    console.log('\n[SECTION 2] categorizeHttpError()');

    // w20_011
    assert(categorizeHttpError(429) === 'rate_limit', 'w20_011: 429 → rate_limit');

    // w20_012
    assert(categorizeHttpError(401) === 'auth_error', 'w20_012: 401 → auth_error');

    // w20_013
    assert(categorizeHttpError(403) === 'auth_error', 'w20_013: 403 → auth_error');

    // w20_014
    assert(categorizeHttpError(404) === 'not_found', 'w20_014: 404 → not_found');

    // w20_015
    assert(categorizeHttpError(500) === 'server_error', 'w20_015: 500 → server_error');

    // w20_016
    assert(categorizeHttpError(502) === 'server_error', 'w20_016: 502 → server_error');

    // w20_017
    assert(categorizeHttpError(503) === 'server_error', 'w20_017: 503 → server_error');

    // w20_018
    assert(categorizeHttpError(504) === 'server_error', 'w20_018: 504 → server_error');

    // w20_019
    assert(categorizeHttpError(400) === 'client_error', 'w20_019: 400 → client_error');

    // w20_020
    assert(categorizeHttpError(999) === 'unknown', 'w20_020: 999 → unknown');

    // w20_021
    assert(categorizeHttpError(0) === 'unknown', 'w20_021: 0 → unknown');

    // w20_022
    assert(categorizeHttpError(-1) === 'unknown', 'w20_022: -1 → unknown');

    // w20_023
    assert(categorizeHttpError(null) === 'unknown', 'w20_023: null → unknown');

    // w20_024
    assert(categorizeHttpError(undefined) === 'unknown', 'w20_024: undefined → unknown');

    // w20_025
    assert(categorizeHttpError(405) === 'client_error', 'w20_025: 405 → client_error');

    // =========================================================================
    // SECTION 3: getRetryHint (~10 tests)
    // =========================================================================
    console.log('\n[SECTION 3] getRetryHint()');

    // w20_026
    assert(getRetryHint('rate_limit').includes('60'), 'w20_026: rate_limit hint mentions retry time');

    // w20_027
    assert(getRetryHint('auth_error').includes('credentials'), 'w20_027: auth_error hint mentions credentials');

    // w20_028
    assert(getRetryHint('server_error').length > 0, 'w20_028: server_error hint is not empty');

    // w20_029
    assert(getRetryHint('unknown').length > 0, 'w20_029: unknown category has a hint');

    // w20_030
    assert(typeof getRetryHint('any_category') === 'string', 'w20_030: returns string for any category');

    // =========================================================================
    // SECTION 4: safeJsonParse - Null/Invalid Response (~15 tests)
    // =========================================================================
    console.log('\n[SECTION 4] safeJsonParse() - Null/Invalid Responses');

    // w20_031
    const result1 = await safeJsonParse(null);
    assert(result1.ok === false, 'w20_031: null response → ok=false');

    // w20_032
    assert(result1.error !== null && result1.error.length > 0, 'w20_032: null response → error message present');

    // w20_033
    assert(result1.statusCode === 0, 'w20_033: null response → statusCode=0');

    // w20_034
    const result2 = await safeJsonParse(undefined);
    assert(result2.ok === false, 'w20_034: undefined response → ok=false');

    // w20_035
    const result3 = await safeJsonParse(false);
    assert(result3.ok === false, 'w20_035: false response → ok=false');

    // w20_036 - Mock a non-ok response
    const mockResponseNotOk = {
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal error' })
    };
    const result4 = await safeJsonParse(mockResponseNotOk);
    assert(result4.ok === false, 'w20_036: non-ok response (500) → ok=false');

    // w20_037
    assert(result4.statusCode === 500, 'w20_037: 500 response → statusCode=500');

    // w20_038
    assert(result4.error.includes('500'), 'w20_038: error message includes status code');

    // w20_039 - Mock a 429 rate limit response
    const mockRate429 = {
        ok: false,
        status: 429,
        json: async () => ({ error: 'Too many requests' })
    };
    const result5 = await safeJsonParse(mockRate429);
    assert(result5.ok === false, 'w20_039: 429 response → ok=false');

    // w20_040
    assert(result5.error.includes('rate_limit'), 'w20_040: 429 error includes "rate_limit" category');

    // =========================================================================
    // SECTION 5: safeJsonParse - Valid JSON Response (~15 tests)
    // =========================================================================
    console.log('\n[SECTION 5] safeJsonParse() - Valid JSON Responses');

    // w20_041 - Mock a successful response with valid JSON
    const mockResponseOk = {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'Hello' } }], usage: { total_tokens: 10 } })
    };
    const result6 = await safeJsonParse(mockResponseOk);
    assert(result6.ok === true, 'w20_041: 200 response with valid JSON → ok=true');

    // w20_042
    assert(result6.statusCode === 200, 'w20_042: 200 response → statusCode=200');

    // w20_043
    assert(result6.error === null, 'w20_043: valid JSON → error=null');

    // w20_044
    assert(result6.data.choices !== undefined, 'w20_044: parsed data has choices');

    // w20_045
    assert(result6.data.choices[0].message.content === 'Hello', 'w20_045: JSON content preserved');

    // w20_046 - Response with 201 (created)
    const mockResponse201 = {
        ok: true,
        status: 201,
        json: async () => ({ id: 'abc123' })
    };
    const result7 = await safeJsonParse(mockResponse201);
    assert(result7.ok === true, 'w20_046: 201 response → ok=true');

    // w20_047
    assert(result7.statusCode === 201, 'w20_047: statusCode=201');

    // =========================================================================
    // SECTION 6: safeJsonParse - Invalid JSON (~15 tests)
    // =========================================================================
    console.log('\n[SECTION 6] safeJsonParse() - Invalid JSON/Parse Errors');

    // w20_048 - Response with malformed JSON
    const mockResponseMalformed = {
        ok: true,
        status: 200,
        json: async () => { throw new SyntaxError('Unexpected token'); }
    };
    const result8 = await safeJsonParse(mockResponseMalformed);
    assert(result8.ok === false, 'w20_048: malformed JSON → ok=false');

    // w20_049
    assert(result8.error.includes('JSON'), 'w20_049: error mentions JSON');

    // w20_050
    assert(result8.statusCode === 200, 'w20_050: statusCode still captured (200)');

    // w20_051 - Response with empty body (500 HTML error page scenario)
    const mockResponseEmpty = {
        ok: true,
        status: 200,
        json: async () => { throw new SyntaxError('Unexpected end of JSON input'); }
    };
    const result9 = await safeJsonParse(mockResponseEmpty);
    assert(result9.ok === false, 'w20_051: empty/invalid body → ok=false');

    // w20_052 - HTML response disguised as JSON
    const mockResponseHTML = {
        ok: true,
        status: 200,
        json: async () => { throw new SyntaxError('<html>Error</html>'); }
    };
    const result10 = await safeJsonParse(mockResponseHTML);
    assert(result10.ok === false, 'w20_052: HTML as JSON → ok=false');

    // w20_053 - Partial/truncated JSON
    const mockResponsePartial = {
        ok: true,
        status: 200,
        json: async () => { throw new SyntaxError('Unexpected token }'); }
    };
    const result11 = await safeJsonParse(mockResponsePartial);
    assert(result11.ok === false, 'w20_053: partial JSON → ok=false');

    // =========================================================================
    // SECTION 7: safeJsonParse - Fallback Values (~8 tests)
    // =========================================================================
    console.log('\n[SECTION 7] safeJsonParse() - Fallback Handling');

    // w20_054 - Fallback on null response
    const fallback1 = { default: true };
    const result12 = await safeJsonParse(null, fallback1);
    assert(result12.data === fallback1, 'w20_054: fallback returned on null');

    // w20_055
    const result13 = await safeJsonParse(mockResponseMalformed, { fallback: 'data' });
    assert(result13.data.fallback === 'data', 'w20_055: fallback returned on parse error');

    // w20_056 - Default fallback (null) when not specified
    const result14 = await safeJsonParse(null);
    assert(result14.data === null, 'w20_056: default fallback is null');

    // =========================================================================
    // SECTION 8: createFallbackResponse (~15 tests)
    // =========================================================================
    console.log('\n[SECTION 8] createFallbackResponse()');

    // w20_057
    const fallback = createFallbackResponse('Network timeout');
    assert(fallback.choices !== undefined, 'w20_057: fallback has choices array');

    // w20_058
    assert(Array.isArray(fallback.choices), 'w20_058: choices is an array');

    // w20_059
    assert(fallback.choices.length > 0, 'w20_059: choices array has elements');

    // w20_060
    assert(fallback.choices[0].message !== undefined, 'w20_060: choice has message');

    // w20_061
    assert(typeof fallback.choices[0].message.content === 'string', 'w20_061: message.content is string');

    // w20_062 - Default content when not specified
    const fallback2 = createFallbackResponse('Error');
    assert(fallback2.choices[0].message.content === API_RESPONSE_CONFIG.defaultFallbackContent, 'w20_062: uses default content');

    // w20_063 - Custom content
    const fallback3 = createFallbackResponse('Error', 'Custom message');
    assert(fallback3.choices[0].message.content === 'Custom message', 'w20_063: custom content preserved');

    // w20_064
    assert(fallback3.usage !== undefined, 'w20_064: fallback has usage object');

    // w20_065
    assert(fallback3.usage.prompt_tokens === 0, 'w20_065: usage.prompt_tokens = 0');

    // w20_066
    assert(fallback3.usage.completion_tokens === 0, 'w20_066: usage.completion_tokens = 0');

    // w20_067
    assert(fallback3.usage.total_tokens === 0, 'w20_067: usage.total_tokens = 0');

    // w20_068
    assert(fallback3._fallback === true, 'w20_068: _fallback flag set to true');

    // w20_069
    assert(fallback3.error !== undefined, 'w20_069: error field populated');

    // =========================================================================
    // SECTION 9: createEmptyResponse (~5 tests)
    // =========================================================================
    console.log('\n[SECTION 9] createEmptyResponse()');

    // w20_070
    const empty = createEmptyResponse();
    assert(empty.choices !== undefined, 'w20_070: empty response has choices');

    // w20_071
    assert(empty.choices[0].message.content === '', 'w20_071: empty content string');

    // w20_072
    assert(empty.usage.total_tokens === 0, 'w20_072: empty usage');

    // =========================================================================
    // SECTION 10: Integration - Worker.js Usage Pattern (~15 tests)
    // =========================================================================
    console.log('\n[SECTION 10] Integration - Worker.js Usage Pattern');

    // w20_073 - Simulate worker.js usage: successful API call
    const mockAPISuccess = {
        ok: true,
        status: 200,
        json: async () => ({
            choices: [{
                message: { content: 'AI Response' },
                index: 0,
                finish_reason: 'stop'
            }],
            usage: { total_tokens: 100 }
        })
    };
    const { ok: ok1, data: data1, error: err1 } = await safeJsonParse(mockAPISuccess);
    assert(ok1 === true && data1.choices[0].message.content === 'AI Response', 'w20_073: successful parse flow');

    // w20_074 - Failed API call creates fallback
    const { ok: ok2, error: err2 } = await safeJsonParse(null);
    const fallbackRes = createFallbackResponse(err2);
    assert(fallbackRes.choices[0].message.content.length > 0, 'w20_074: fallback created on error');

    // w20_075 - Server error (500) detected
    const mockServer500 = {
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal server error' })
    };
    const { ok: ok3, statusCode: sc500 } = await safeJsonParse(mockServer500);
    assert(ok3 === false && sc500 === 500, 'w20_075: server error detected');

    // w20_076 - Rate limit (429) categorized
    const mockRate = {
        ok: false,
        status: 429,
        json: async () => ({ error: 'Rate limited' })
    };
    const { error: errRate } = await safeJsonParse(mockRate);
    assert(errRate.includes('rate_limit'), 'w20_076: rate limit categorized');

    // =========================================================================
    // SECTION 11: Edge Cases (~15 tests)
    // =========================================================================
    console.log('\n[SECTION 11] Edge Cases');

    // w20_077 - Response with ok=true but non-JSON body
    const mockResponseNoJson = {
        ok: true,
        status: 200,
        json: async () => { throw new Error('No content'); }
    };
    const result15 = await safeJsonParse(mockResponseNoJson);
    assert(result15.ok === false && result15.data === null, 'w20_077: non-JSON ok response handled');

    // w20_078 - Timeout scenario (null response from failed fetch)
    const resultTimeout = await safeJsonParse(null);
    assert(resultTimeout.ok === false, 'w20_078: timeout (null) handled');

    // w20_079 - Large status codes
    assert(categorizeHttpError(599) === 'unknown', 'w20_079: 599 categorized');

    // w20_080 - Status code NaN
    assert(categorizeHttpError(NaN) === 'unknown', 'w20_080: NaN status categorized');

    // =========================================================================
    // SECTION 12: Structural/Wiring Verification (~10 tests)
    // =========================================================================
    console.log('\n[SECTION 12] Structural/Wiring Verification');

    // w20_081 - Verify worker.js imports the guard
    const workerPath = path.join(__dirname, '..', 'worker.js');
    const workerSrc = fs.readFileSync(workerPath, 'utf-8');
    assert(workerSrc.includes('api-response-guard'), 'w20_081: worker.js imports api-response-guard');

    // w20_082
    assert(workerSrc.includes('safeJsonParse'), 'w20_082: worker.js imports safeJsonParse');

    // w20_083
    assert(workerSrc.includes('createFallbackResponse'), 'w20_083: worker.js imports createFallbackResponse');

    // w20_084 - Verify the old pattern (await aiResponse.json()) is removed
    const workerLines = workerSrc.split('\n').filter(l => {
        const t = l.trim();
        return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    }).join('\n');
    const hasOldPattern = /const\s+aiData\s*=\s*await\s+aiResponse\.json\(\)/.test(workerLines);
    assert(!hasOldPattern, 'w20_084: old unguarded .json() pattern removed');

    // w20_085 - Verify safeJsonParse is called
    assert(workerSrc.includes('await safeJsonParse(aiResponse)'), 'w20_085: safeJsonParse called with response');

    // w20_086 - Verify error handling added
    assert(workerSrc.includes('if (!parseOk)'), 'w20_086: error check added (if !parseOk)');

    // w20_087 - Verify fallback response created on error
    assert(workerSrc.includes('createFallbackResponse'), 'w20_087: fallback created on error');

    // =========================================================================
    // Summary
    // =========================================================================
    console.log('\n' + '═'.repeat(70));
    console.log(`TESTS PASSED: ${passed}`);
    console.log(`TESTS FAILED: ${failed}`);
    console.log('═'.repeat(70));

    if (failed > 0) {
        console.log('\nFailed tests:');
        failures.forEach(f => console.log(`  - ${f}`));
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
});
