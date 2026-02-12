/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINAULT AGENTOS — ENVIRONMENT CONFIGURATION VALIDATOR
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Validates that all required environment variables are set before the server
 * starts. Prevents cryptic runtime errors when config is missing.
 *
 * Usage:
 *   import { validateEnvironment } from './core/env-validator.js';
 *   validateEnvironment(); // throws on missing required vars
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const ENV_SCHEMA = {
    // Required in all environments
    required: [
        {
            name: 'SUPABASE_URL',
            description: 'Supabase project URL',
            pattern: /^https:\/\/.+\.supabase\.(co|in)/,
            example: 'https://xxxx.supabase.co'
        },
        {
            name: 'SUPABASE_SERVICE_KEY',
            description: 'Supabase service role key',
            minLength: 100,
            sensitive: true
        }
    ],

    // Required in production only
    production: [
        {
            name: 'JWT_SECRET',
            description: 'JWT signing secret',
            minLength: 32,
            sensitive: true,
            productionNote: 'Must be at least 32 characters. DO NOT use default dev-secret.'
        },
        {
            name: 'WEBHOOK_SECRET',
            description: 'Webhook signature verification secret',
            minLength: 16,
            sensitive: true
        }
    ],

    // Optional but recommended
    optional: [
        {
            name: 'ANTHROPIC_API_KEY',
            description: 'Anthropic API key for Claude',
            pattern: /^sk-ant-/,
            sensitive: true
        },
        {
            name: 'OPENAI_API_KEY',
            description: 'OpenAI API key',
            pattern: /^sk-/,
            sensitive: true
        },
        {
            name: 'NODE_ENV',
            description: 'Runtime environment',
            allowedValues: ['development', 'staging', 'production', 'test'],
            default: 'development'
        },
        {
            name: 'PORT',
            description: 'Server port',
            pattern: /^\d+$/,
            default: '8000'
        }
    ]
};

/**
 * Validates a single environment variable against a rule
 * @param {string} name - Variable name
 * @param {string} value - Variable value
 * @param {object} rule - Validation rule
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateSingleVar(name, value, rule) {
    const errors = [];

    // Check if value exists and is not empty/whitespace
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
        errors.push(`missing`);
        return { valid: false, errors };
    }

    // Check pattern
    if (rule.pattern && !rule.pattern.test(value)) {
        errors.push(`invalid format (expected pattern: ${rule.pattern})`);
    }

    // Check minLength
    if (rule.minLength && value.length < rule.minLength) {
        errors.push(`too short (minimum ${rule.minLength} characters, got ${value.length})`);
    }

    // Check allowedValues
    if (rule.allowedValues && !rule.allowedValues.includes(value)) {
        errors.push(`invalid value (allowed: ${rule.allowedValues.join(', ')})`);
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Validates all required environment variables
 * @param {object} env - Environment object (defaults to process.env)
 * @throws {Error} if validation fails
 */
function validateEnvironment(env = process.env) {
    const allErrors = [];
    const missingRequired = [];
    const invalidRequired = [];
    const missingProduction = [];
    const invalidProduction = [];
    const missingOptional = [];

    const nodeEnv = env.NODE_ENV || 'development';

    // Validate required variables
    for (const rule of ENV_SCHEMA.required) {
        const value = env[rule.name];
        const validation = validateSingleVar(rule.name, value, rule);

        if (!validation.valid) {
            const errorMsg = validation.errors.join(', ');
            if (validation.errors.includes('missing')) {
                missingRequired.push({
                    name: rule.name,
                    description: rule.description,
                    example: rule.example
                });
            } else {
                invalidRequired.push({
                    name: rule.name,
                    description: rule.description,
                    errors: errorMsg,
                    note: rule.productionNote
                });
            }
        }
    }

    // Validate production variables (only in production)
    if (nodeEnv === 'production') {
        for (const rule of ENV_SCHEMA.production) {
            const value = env[rule.name];
            const validation = validateSingleVar(rule.name, value, rule);

            if (!validation.valid) {
                const errorMsg = validation.errors.join(', ');
                if (validation.errors.includes('missing')) {
                    missingProduction.push({
                        name: rule.name,
                        description: rule.description,
                        note: rule.productionNote
                    });
                } else {
                    invalidProduction.push({
                        name: rule.name,
                        description: rule.description,
                        errors: errorMsg,
                        note: rule.productionNote
                    });
                }
            }
        }
    }

    // Check optional variables (warnings only)
    for (const rule of ENV_SCHEMA.optional) {
        const value = env[rule.name];
        if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
            missingOptional.push({
                name: rule.name,
                description: rule.description
            });
        }
    }

    // If there are any errors, format and throw
    if (
        missingRequired.length > 0 ||
        invalidRequired.length > 0 ||
        missingProduction.length > 0 ||
        invalidProduction.length > 0
    ) {
        let message = '\nFATAL: Finault AgentOS environment validation failed!\n';

        if (missingRequired.length > 0) {
            message += '\nMissing required variables:\n';
            for (const item of missingRequired) {
                message += `  ✗ ${item.name} — ${item.description}`;
                if (item.example) {
                    message += ` (example: ${item.example})`;
                }
                message += '\n';
            }
        }

        if (invalidRequired.length > 0) {
            message += '\nInvalid required variables:\n';
            for (const item of invalidRequired) {
                message += `  ✗ ${item.name} — ${item.description}\n`;
                message += `    Error: ${item.errors}`;
                if (item.note) {
                    message += ` (${item.note})`;
                }
                message += '\n';
            }
        }

        if (nodeEnv === 'production' && (missingProduction.length > 0 || invalidProduction.length > 0)) {
            message += `\nProduction-required variables (NODE_ENV=${nodeEnv}):\n`;

            for (const item of missingProduction) {
                message += `  ✗ ${item.name} — ${item.description}\n`;
                if (item.note) {
                    message += `    ${item.note}\n`;
                }
            }

            for (const item of invalidProduction) {
                message += `  ✗ ${item.name} — ${item.description}\n`;
                message += `    Error: ${item.errors}`;
                if (item.note) {
                    message += ` (${item.note})`;
                }
                message += '\n';
            }
        }

        if (missingOptional.length > 0) {
            message += '\nOptional (warnings):\n';
            for (const item of missingOptional) {
                message += `  ⚠ ${item.name} — ${item.description} (not set)\n`;
            }
        }

        const error = new Error(message);
        error.code = 'ENV_VALIDATION_FAILED';
        error.details = {
            missingRequired,
            invalidRequired,
            missingProduction,
            invalidProduction,
            missingOptional
        };
        throw error;
    }

    // Log warnings for missing optional variables
    if (missingOptional.length > 0) {
        console.warn('\nWarning: Missing optional environment variables:');
        for (const item of missingOptional) {
            console.warn(`  ⚠ ${item.name} — ${item.description}`);
        }
        console.warn('');
    }

    return true;
}

/**
 * Returns a safe summary of environment variables (masks sensitive values)
 * @param {object} env - Environment object (defaults to process.env)
 * @returns {object} summary with status of each variable
 */
function getEnvSummary(env = process.env) {
    const summary = {
        environment: env.NODE_ENV || 'development',
        required: {},
        production: {},
        optional: {}
    };

    // Check required
    for (const rule of ENV_SCHEMA.required) {
        const value = env[rule.name];
        summary.required[rule.name] = {
            set: value !== undefined && value !== null && value !== '',
            sensitive: rule.sensitive || false,
            value: rule.sensitive ? (value ? '***' : 'NOT_SET') : value || 'NOT_SET'
        };
    }

    // Check production (only relevant in production)
    if (env.NODE_ENV === 'production') {
        for (const rule of ENV_SCHEMA.production) {
            const value = env[rule.name];
            summary.production[rule.name] = {
                set: value !== undefined && value !== null && value !== '',
                sensitive: rule.sensitive || false,
                value: rule.sensitive ? (value ? '***' : 'NOT_SET') : value || 'NOT_SET'
            };
        }
    }

    // Check optional
    for (const rule of ENV_SCHEMA.optional) {
        const value = env[rule.name];
        summary.optional[rule.name] = {
            set: value !== undefined && value !== null && value !== '',
            sensitive: rule.sensitive || false,
            value: rule.sensitive ? (value ? '***' : 'NOT_SET') : value || rule.default || 'NOT_SET'
        };
    }

    return summary;
}

export {
    validateEnvironment,
    getEnvSummary,
    validateSingleVar,
    ENV_SCHEMA
};
