/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINAULT AGENTOS — ENVIRONMENT VALIDATOR TEST SUITE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Comprehensive test suite for env-validator module
 * Test IDs: env_001 through env_060
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    validateEnvironment,
    getEnvSummary,
    validateSingleVar,
    ENV_SCHEMA
} from '../core/env-validator.js';

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function createTestEnv(overrides = {}) {
    return {
        NODE_ENV: 'development',
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_SERVICE_KEY: 'sb_service_key_' + 'a'.repeat(100),
        ...overrides
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: validateSingleVar
// ═══════════════════════════════════════════════════════════════════════════════

test('env_001: validateSingleVar returns valid for correct value', () => {
    const rule = { name: 'TEST', minLength: 5 };
    const result = validateSingleVar('TEST', 'validvalue', rule);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
});

test('env_002: validateSingleVar detects missing value (undefined)', () => {
    const rule = { name: 'TEST' };
    const result = validateSingleVar('TEST', undefined, rule);
    assert.equal(result.valid, false);
    assert(result.errors.includes('missing'));
});

test('env_003: validateSingleVar detects missing value (null)', () => {
    const rule = { name: 'TEST' };
    const result = validateSingleVar('TEST', null, rule);
    assert.equal(result.valid, false);
    assert(result.errors.includes('missing'));
});

test('env_004: validateSingleVar detects empty string', () => {
    const rule = { name: 'TEST' };
    const result = validateSingleVar('TEST', '', rule);
    assert.equal(result.valid, false);
    assert(result.errors.includes('missing'));
});

test('env_005: validateSingleVar detects whitespace-only string', () => {
    const rule = { name: 'TEST' };
    const result = validateSingleVar('TEST', '   ', rule);
    assert.equal(result.valid, false);
    assert(result.errors.includes('missing'));
});

test('env_006: validateSingleVar validates pattern (match)', () => {
    const rule = { pattern: /^test-.+$/ };
    const result = validateSingleVar('TEST', 'test-value', rule);
    assert.equal(result.valid, true);
});

test('env_007: validateSingleVar validates pattern (no match)', () => {
    const rule = { pattern: /^test-.+$/ };
    const result = validateSingleVar('TEST', 'invalid-value', rule);
    assert.equal(result.valid, false);
    assert(result.errors.some(e => e.includes('invalid format')));
});

test('env_008: validateSingleVar validates minLength (pass)', () => {
    const rule = { minLength: 10 };
    const result = validateSingleVar('TEST', '1234567890', rule);
    assert.equal(result.valid, true);
});

test('env_009: validateSingleVar validates minLength (fail)', () => {
    const rule = { minLength: 10 };
    const result = validateSingleVar('TEST', 'short', rule);
    assert.equal(result.valid, false);
    assert(result.errors.some(e => e.includes('too short')));
});

test('env_010: validateSingleVar validates allowedValues (match)', () => {
    const rule = { allowedValues: ['dev', 'prod', 'test'] };
    const result = validateSingleVar('TEST', 'dev', rule);
    assert.equal(result.valid, true);
});

test('env_011: validateSingleVar validates allowedValues (no match)', () => {
    const rule = { allowedValues: ['dev', 'prod', 'test'] };
    const result = validateSingleVar('TEST', 'staging', rule);
    assert.equal(result.valid, false);
    assert(result.errors.some(e => e.includes('invalid value')));
});

test('env_012: validateSingleVar collects multiple errors', () => {
    const rule = {
        minLength: 20,
        pattern: /^sk-/,
        allowedValues: ['sk-test-1', 'sk-test-2']
    };
    const result = validateSingleVar('TEST', 'short', rule);
    assert.equal(result.valid, false);
    assert(result.errors.length >= 2);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Required Variables
// ═══════════════════════════════════════════════════════════════════════════════

test('env_013: validateEnvironment passes with all required vars', () => {
    const env = createTestEnv();
    assert.doesNotThrow(() => validateEnvironment(env));
});

test('env_014: validateEnvironment throws on missing SUPABASE_URL', () => {
    const env = createTestEnv({ SUPABASE_URL: undefined });
    assert.throws(() => validateEnvironment(env), { code: 'ENV_VALIDATION_FAILED' });
});

test('env_015: validateEnvironment throws on missing SUPABASE_SERVICE_KEY', () => {
    const env = createTestEnv({ SUPABASE_SERVICE_KEY: undefined });
    assert.throws(() => validateEnvironment(env), { code: 'ENV_VALIDATION_FAILED' });
});

test('env_016: validateEnvironment throws on empty SUPABASE_URL', () => {
    const env = createTestEnv({ SUPABASE_URL: '' });
    assert.throws(() => validateEnvironment(env), { code: 'ENV_VALIDATION_FAILED' });
});

test('env_017: validateEnvironment throws on whitespace-only SUPABASE_URL', () => {
    const env = createTestEnv({ SUPABASE_URL: '   ' });
    assert.throws(() => validateEnvironment(env), { code: 'ENV_VALIDATION_FAILED' });
});

test('env_018: validateEnvironment validates SUPABASE_URL pattern (.co)', () => {
    const env = createTestEnv({ SUPABASE_URL: 'https://test.supabase.co' });
    assert.doesNotThrow(() => validateEnvironment(env));
});

test('env_019: validateEnvironment validates SUPABASE_URL pattern (.in)', () => {
    const env = createTestEnv({ SUPABASE_URL: 'https://test.supabase.in' });
    assert.doesNotThrow(() => validateEnvironment(env));
});

test('env_020: validateEnvironment rejects invalid SUPABASE_URL pattern', () => {
    const env = createTestEnv({ SUPABASE_URL: 'https://test.example.com' });
    assert.throws(() => validateEnvironment(env), { code: 'ENV_VALIDATION_FAILED' });
});

test('env_021: validateEnvironment rejects http SUPABASE_URL', () => {
    const env = createTestEnv({ SUPABASE_URL: 'http://test.supabase.co' });
    assert.throws(() => validateEnvironment(env), { code: 'ENV_VALIDATION_FAILED' });
});

test('env_022: validateEnvironment validates SUPABASE_SERVICE_KEY minLength', () => {
    const env = createTestEnv({
        SUPABASE_SERVICE_KEY: 'a'.repeat(100)
    });
    assert.doesNotThrow(() => validateEnvironment(env));
});

test('env_023: validateEnvironment rejects short SUPABASE_SERVICE_KEY', () => {
    const env = createTestEnv({ SUPABASE_SERVICE_KEY: 'tooshort' });
    assert.throws(() => validateEnvironment(env), { code: 'ENV_VALIDATION_FAILED' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Production Variables
// ═══════════════════════════════════════════════════════════════════════════════

test('env_024: validateEnvironment ignores JWT_SECRET in development', () => {
    const env = createTestEnv({ NODE_ENV: 'development' });
    assert.doesNotThrow(() => validateEnvironment(env));
});

test('env_025: validateEnvironment requires JWT_SECRET in production', () => {
    const env = createTestEnv({ NODE_ENV: 'production' });
    assert.throws(() => validateEnvironment(env), { code: 'ENV_VALIDATION_FAILED' });
});

test('env_026: validateEnvironment requires WEBHOOK_SECRET in production', () => {
    const env = createTestEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'a'.repeat(32)
    });
    assert.throws(() => validateEnvironment(env), { code: 'ENV_VALIDATION_FAILED' });
});

test('env_027: validateEnvironment passes with production secrets', () => {
    const env = createTestEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'a'.repeat(32),
        WEBHOOK_SECRET: 'b'.repeat(16)
    });
    assert.doesNotThrow(() => validateEnvironment(env));
});

test('env_028: validateEnvironment validates JWT_SECRET minLength', () => {
    const env = createTestEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'tooshort'
    });
    assert.throws(() => validateEnvironment(env), { code: 'ENV_VALIDATION_FAILED' });
});

test('env_029: validateEnvironment validates WEBHOOK_SECRET minLength', () => {
    const env = createTestEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'a'.repeat(32),
        WEBHOOK_SECRET: 'short'
    });
    assert.throws(() => validateEnvironment(env), { code: 'ENV_VALIDATION_FAILED' });
});

test('env_030: validateEnvironment passes with exactly 32 char JWT_SECRET', () => {
    const env = createTestEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'a'.repeat(32),
        WEBHOOK_SECRET: 'b'.repeat(16)
    });
    assert.doesNotThrow(() => validateEnvironment(env));
});

test('env_031: validateEnvironment passes with 33+ char JWT_SECRET', () => {
    const env = createTestEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'a'.repeat(33),
        WEBHOOK_SECRET: 'b'.repeat(16)
    });
    assert.doesNotThrow(() => validateEnvironment(env));
});

test('env_032: validateEnvironment passes in staging without production vars', () => {
    const env = createTestEnv({ NODE_ENV: 'staging' });
    assert.doesNotThrow(() => validateEnvironment(env));
});

test('env_033: validateEnvironment passes in test without production vars', () => {
    const env = createTestEnv({ NODE_ENV: 'test' });
    assert.doesNotThrow(() => validateEnvironment(env));
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Optional Variables
// ═══════════════════════════════════════════════════════════════════════════════

test('env_034: validateEnvironment passes without optional variables', () => {
    const env = createTestEnv();
    assert.doesNotThrow(() => validateEnvironment(env));
});

test('env_035: validateEnvironment validates ANTHROPIC_API_KEY pattern', () => {
    const env = createTestEnv({ ANTHROPIC_API_KEY: 'sk-ant-valid' });
    assert.doesNotThrow(() => validateEnvironment(env));
});

test('env_036: validateEnvironment allows missing optional ANTHROPIC_API_KEY', () => {
    const env = createTestEnv({ ANTHROPIC_API_KEY: undefined });
    assert.doesNotThrow(() => validateEnvironment(env));
});

test('env_037: validateEnvironment validates OPENAI_API_KEY pattern', () => {
    const env = createTestEnv({ OPENAI_API_KEY: 'sk-valid' });
    assert.doesNotThrow(() => validateEnvironment(env));
});

test('env_038: validateEnvironment allows missing optional OPENAI_API_KEY', () => {
    const env = createTestEnv({ OPENAI_API_KEY: undefined });
    assert.doesNotThrow(() => validateEnvironment(env));
});

test('env_039: validateEnvironment validates NODE_ENV allowedValues', () => {
    const env = createTestEnv({ NODE_ENV: 'development' });
    assert.doesNotThrow(() => validateEnvironment(env));
});

test('env_040: validateEnvironment allows missing NODE_ENV (defaults to development)', () => {
    const env = createTestEnv({ NODE_ENV: undefined });
    assert.doesNotThrow(() => validateEnvironment(env));
});

test('env_041: validateEnvironment validates PORT pattern', () => {
    const env = createTestEnv({ PORT: '3000' });
    assert.doesNotThrow(() => validateEnvironment(env));
});

test('env_042: validateEnvironment allows missing PORT (uses default)', () => {
    const env = createTestEnv({ PORT: undefined });
    assert.doesNotThrow(() => validateEnvironment(env));
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Error Messages and Details
// ═══════════════════════════════════════════════════════════════════════════════

test('env_043: error includes all missing required variables', () => {
    const env = createTestEnv({
        SUPABASE_URL: undefined,
        SUPABASE_SERVICE_KEY: undefined
    });
    try {
        validateEnvironment(env);
        assert.fail('Should have thrown');
    } catch (err) {
        assert(err.message.includes('SUPABASE_URL'));
        assert(err.message.includes('SUPABASE_SERVICE_KEY'));
        assert.equal(err.details.missingRequired.length, 2);
    }
});

test('env_044: error includes production vars in production mode', () => {
    const env = createTestEnv({ NODE_ENV: 'production' });
    try {
        validateEnvironment(env);
        assert.fail('Should have thrown');
    } catch (err) {
        assert(err.message.includes('JWT_SECRET'));
        assert(err.message.includes('Production-required'));
    }
});

test('env_045: error.details contains structured information', () => {
    const env = createTestEnv({ SUPABASE_URL: undefined });
    try {
        validateEnvironment(env);
        assert.fail('Should have thrown');
    } catch (err) {
        assert(Array.isArray(err.details.missingRequired));
        assert(Array.isArray(err.details.invalidRequired));
        assert(Array.isArray(err.details.missingProduction));
        assert(Array.isArray(err.details.invalidProduction));
        assert(Array.isArray(err.details.missingOptional));
    }
});

test('env_046: error message includes example for SUPABASE_URL', () => {
    const env = createTestEnv({ SUPABASE_URL: undefined });
    try {
        validateEnvironment(env);
        assert.fail('Should have thrown');
    } catch (err) {
        assert(err.message.includes('https://xxxx.supabase.co'));
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: getEnvSummary
// ═══════════════════════════════════════════════════════════════════════════════

test('env_047: getEnvSummary returns summary object', () => {
    const env = createTestEnv();
    const summary = getEnvSummary(env);
    assert(summary.environment);
    assert(summary.required);
    assert(summary.optional);
});

test('env_048: getEnvSummary shows set status for present vars', () => {
    const env = createTestEnv();
    const summary = getEnvSummary(env);
    assert.equal(summary.required.SUPABASE_URL.set, true);
});

test('env_049: getEnvSummary shows set status for missing vars', () => {
    const env = createTestEnv({ SUPABASE_URL: undefined });
    const summary = getEnvSummary(env);
    assert.equal(summary.required.SUPABASE_URL.set, false);
});

test('env_050: getEnvSummary masks sensitive values', () => {
    const env = createTestEnv({
        SUPABASE_SERVICE_KEY: 'secret_key_value'
    });
    const summary = getEnvSummary(env);
    assert.equal(summary.required.SUPABASE_SERVICE_KEY.value, '***');
    assert.equal(summary.required.SUPABASE_SERVICE_KEY.sensitive, true);
});

test('env_051: getEnvSummary shows actual value for non-sensitive vars', () => {
    const env = createTestEnv({ PORT: '3000' });
    const summary = getEnvSummary(env);
    assert.equal(summary.optional.PORT.value, '3000');
    assert.equal(summary.optional.PORT.sensitive, false);
});

test('env_052: getEnvSummary shows defaults for unset optional vars', () => {
    const env = createTestEnv({ NODE_ENV: 'development', PORT: undefined });
    const summary = getEnvSummary(env);
    assert.equal(summary.optional.PORT.value, '8000');
});

test('env_053: getEnvSummary includes production in production mode', () => {
    const env = createTestEnv({ NODE_ENV: 'production' });
    const summary = getEnvSummary(env);
    assert(summary.production);
    assert(summary.production.JWT_SECRET);
});

test('env_054: getEnvSummary includes production section in production', () => {
    const env = createTestEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'a'.repeat(32),
        WEBHOOK_SECRET: 'b'.repeat(16)
    });
    const summary = getEnvSummary(env);
    assert.equal(summary.production.JWT_SECRET.set, true);
    assert.equal(summary.production.WEBHOOK_SECRET.set, true);
});

test('env_055: getEnvSummary masks sensitive optional vars', () => {
    const env = createTestEnv({
        ANTHROPIC_API_KEY: 'sk-ant-real-key'
    });
    const summary = getEnvSummary(env);
    assert.equal(summary.optional.ANTHROPIC_API_KEY.value, '***');
    assert.equal(summary.optional.ANTHROPIC_API_KEY.sensitive, true);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: ENV_SCHEMA Validation
// ═══════════════════════════════════════════════════════════════════════════════

test('env_056: ENV_SCHEMA contains required section', () => {
    assert(Array.isArray(ENV_SCHEMA.required));
    assert(ENV_SCHEMA.required.length > 0);
});

test('env_057: ENV_SCHEMA contains production section', () => {
    assert(Array.isArray(ENV_SCHEMA.production));
    assert(ENV_SCHEMA.production.length > 0);
});

test('env_058: ENV_SCHEMA contains optional section', () => {
    assert(Array.isArray(ENV_SCHEMA.optional));
    assert(ENV_SCHEMA.optional.length > 0);
});

test('env_059: ENV_SCHEMA rules have required properties', () => {
    for (const rule of ENV_SCHEMA.required) {
        assert(rule.name);
        assert(rule.description);
    }
});

test('env_060: validateEnvironment collects all errors before throwing', () => {
    const env = {
        NODE_ENV: 'production',
        SUPABASE_URL: 'invalid',
        SUPABASE_SERVICE_KEY: 'short'
    };
    try {
        validateEnvironment(env);
        assert.fail('Should have thrown');
    } catch (err) {
        // Should have multiple errors
        const totalErrors = err.details.invalidRequired.length +
                           err.details.missingRequired.length +
                           err.details.missingProduction.length +
                           err.details.invalidProduction.length;
        assert(totalErrors >= 2);
    }
});
