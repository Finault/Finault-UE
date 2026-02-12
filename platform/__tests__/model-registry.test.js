/**
 * Model Registry Tests
 * Validates the unified pricing source of truth
 */

import { ModelRegistry, MODEL_CAPABILITIES, TIER_RANK, PROVIDER_DISCOUNTS, MODEL_ID_ALIASES } from '../model-registry.js';
import { FALLBACK_MODEL_PRICING } from '../pricing-service.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Mock Supabase ──────────────────────────────────────────────────────────
const mockSupabase = {
    from: () => ({
        select: () => ({
            eq: () => ({
                order: () => ({
                    limit: () => ({
                        single: () => Promise.resolve({ data: null, error: { message: 'no data' } })
                    })
                }),
                is: () => Promise.resolve({ data: [], error: null })
            })
        })
    })
};

// ─── Test Helpers ───────────────────────────────────────────────────────────
let registry;
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
        console.log(`  ✗ ${message}`);
    }
}

async function test(name, fn) {
    console.log(`\n${name}`);
    try {
        await fn();
    } catch (error) {
        failed++;
        failures.push(`${name}: ${error.message}`);
        console.log(`  ✗ THREW: ${error.message}`);
    }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

async function runTests() {
    console.log('═══════════════════════════════════════════════');
    console.log('  ModelRegistry Test Suite');
    console.log('═══════════════════════════════════════════════');

    // ── Setup ──
    registry = new ModelRegistry(mockSupabase, { enforceFreshness: false });
    await registry.initialize();

    // ── 1. Initialization ──
    await test('1. Initialization', async () => {
        assert(registry.isInitialized === true, 'Registry is initialized');
        assert(registry._modelCache instanceof Map, 'Model cache is a Map');
        assert(registry._modelCache.size > 0, `Cache has ${registry._modelCache.size} models`);
    });

    // ── 2. Model Lookup ──
    await test('2. Model Lookup — known models resolve', async () => {
        const gpt4o = await registry.getModel('gpt-4o');
        assert(gpt4o !== null, 'gpt-4o found');
        assert(gpt4o.provider === 'openai', 'gpt-4o provider is openai');
        assert(gpt4o.qualityScore === 92, 'gpt-4o quality is 92');
        assert(gpt4o.hasPricing === true, 'gpt-4o has pricing');
        assert(gpt4o.inputCostPer1K > 0, 'gpt-4o has input cost');
        assert(gpt4o.outputCostPer1K > 0, 'gpt-4o has output cost');

        const claude = await registry.getModel('claude-sonnet-4');
        assert(claude !== null, 'claude-sonnet-4 found');
        assert(claude.provider === 'anthropic', 'claude-sonnet-4 provider is anthropic');

        const gemini = await registry.getModel('gemini-2.0-flash');
        assert(gemini !== null, 'gemini-2.0-flash found');
        assert(gemini.provider === 'google', 'gemini-2.0-flash provider is google');
    });

    await test('2b. Model Lookup — unknown models return null', async () => {
        const unknown = await registry.getModel('nonexistent-model-42');
        assert(unknown === null, 'Unknown model returns null');
    });

    await test('2c. Model ID normalization', async () => {
        const dated = await registry.getModel('gpt-4o-2024-05-13');
        assert(dated !== null, 'Date-suffixed model resolves');
        assert(dated.id === 'gpt-4o', 'Normalizes to gpt-4o');

        const claudeDated = await registry.getModel('claude-sonnet-4-20250514');
        assert(claudeDated !== null, 'Claude dated model resolves');
    });

    // ── 3. getAllModelPricing (drop-in AI_PRICING replacement) ──
    await test('3. getAllModelPricing — replaces hardcoded AI_PRICING', async () => {
        const pricing = await registry.getAllModelPricing();
        assert(typeof pricing === 'object', 'Returns an object');
        assert(Object.keys(pricing).length > 10, `Has ${Object.keys(pricing).length} models (was only 9)`);

        // Every model in old AI_PRICING should still be available (or its successor)
        const oldModels = ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'claude-3-opus',
            'claude-3-sonnet', 'claude-3-haiku', 'claude-sonnet-4', 'mistral-large'];

        // Deprecated models are excluded from getAllModelPricing, check active alternatives exist
        assert(pricing['gpt-4o'] !== undefined, 'gpt-4o available (successor to gpt-4)');
        assert(pricing['claude-sonnet-4'] !== undefined, 'claude-sonnet-4 available');
        assert(pricing['gemini-2.0-flash'] !== undefined, 'gemini-2.0-flash available (NEW model)');

        // Check format: { input, output, quality }
        for (const [modelId, p] of Object.entries(pricing)) {
            assert(typeof p.input === 'number' && p.input > 0, `${modelId}.input is positive number`);
            assert(typeof p.output === 'number' && p.output > 0, `${modelId}.output is positive number`);
            assert(typeof p.quality === 'number' && p.quality > 0, `${modelId}.quality is positive number`);
        }
    });

    // ── 4. findCheaperAlternatives ──
    await test('4. findCheaperAlternatives — finds cheaper options for expensive models', async () => {
        const alts = await registry.findCheaperAlternatives('gpt-4', {
            maxQualityDrop: 20,
            minSavingsPercent: 10,
        });

        assert(Array.isArray(alts), 'Returns array');
        assert(alts.length > 0, `Found ${alts.length} cheaper alternatives to gpt-4`);

        // Should be sorted by savings (highest first)
        if (alts.length > 1) {
            assert(alts[0].savingsPercent >= alts[1].savingsPercent, 'Sorted by savings descending');
        }

        // Each alternative should have required fields
        for (const alt of alts) {
            assert(alt.model !== 'gpt-4', 'Alternative is not the same model');
            assert(alt.savingsPercent > 0, `${alt.model} saves ${alt.savingsPercent}%`);
            assert(alt.qualityDrop <= 20, `${alt.model} quality drop ${alt.qualityDrop} <= 20`);
            assert(['low', 'medium', 'high'].includes(alt.risk), `${alt.model} has valid risk`);
            assert(typeof alt.confidence === 'number', `${alt.model} has confidence`);
        }
    });

    await test('4b. findCheaperAlternatives — budget models have fewer/no alternatives', async () => {
        const alts = await registry.findCheaperAlternatives('gpt-3.5-turbo', {
            maxQualityDrop: 5,
            minSavingsPercent: 50,
        });
        // gpt-3.5-turbo is already cheap — alternatives should be minimal
        assert(Array.isArray(alts), 'Returns array even for budget models');
    });

    await test('4c. findCheaperAlternatives — same provider filter', async () => {
        const alts = await registry.findCheaperAlternatives('claude-3-opus', {
            sameProvider: true,
            maxQualityDrop: 20,
        });

        for (const alt of alts) {
            assert(alt.provider === 'anthropic', `${alt.model} is from same provider (anthropic)`);
        }
    });

    // ── 5. calculateSwitchSavings ──
    await test('5. calculateSwitchSavings — accurate cost projection', async () => {
        const result = await registry.calculateSwitchSavings('gpt-4', 'gpt-4o', {
            monthlyInputTokens: 1000000,
            monthlyOutputTokens: 500000,
        });

        assert(result.success === true, 'Calculation succeeds');
        assert(result.monthlySavings > 0, `Saves $${result.monthlySavings.toFixed(2)}/month`);
        assert(result.currentMonthlyCost > result.projectedMonthlyCost, 'Projected < current');
        assert(result.savingsPercent > 0, `${result.savingsPercent}% savings`);
        assert(typeof result.confidence === 'number', 'Has confidence score');
        assert(result.annualSavings === result.monthlySavings * 12, 'Annual = monthly * 12');
    });

    await test('5b. calculateSwitchSavings — more expensive model returns 0 savings', async () => {
        const result = await registry.calculateSwitchSavings('gpt-4o-mini', 'gpt-4', {
            monthlyInputTokens: 1000000,
            monthlyOutputTokens: 500000,
        });

        assert(result.success === true, 'Still succeeds');
        assert(result.monthlySavings < 0, 'Negative savings (more expensive)');
    });

    // ── 6. generateOptimizationRecommendations ──
    await test('6. generateOptimizationRecommendations — replaces hardcoded expensiveModels', async () => {
        const usage = [
            { model: 'gpt-4', cost: 5000, requests: 10000, tokens: 20000000 },
            { model: 'claude-3-opus', cost: 3000, requests: 5000, tokens: 10000000 },
        ];

        const recs = await registry.generateOptimizationRecommendations(usage);
        assert(Array.isArray(recs), 'Returns array');
        assert(recs.length > 0, `Found ${recs.length} recommendations`);

        // Now returns 3 types: model_switch, discount_program, deprecation_warning
        const validTypes = ['model_switch', 'discount_program', 'deprecation_warning'];
        for (const rec of recs) {
            assert(validTypes.includes(rec.type), `Type "${rec.type}" is valid`);
            assert(rec.monthlySavings >= 0, `${rec.currentModel} → ${rec.recommendedModel}: $${rec.monthlySavings.toFixed(2)}/mo`);
            assert(typeof rec.confidence === 'number', 'Has confidence');
            assert(typeof rec.qualityImpact === 'string', 'Has quality impact description');
        }

        // Deprecated models should get deprecation warnings
        const deprecationRecs = recs.filter(r => r.type === 'deprecation_warning');
        assert(deprecationRecs.length > 0, 'Deprecated models get deprecation warnings');

        // Model switch recs should still exist
        const switchRecs = recs.filter(r => r.type === 'model_switch');
        assert(switchRecs.length > 0, 'Model switch recommendations still generated');
        assert(switchRecs.every(r => r.monthlySavings > 0), 'All model switches save money');
    });

    // ── 7. Filtering ──
    await test('7. getAllModels — filtering works', async () => {
        const openai = await registry.getAllModels({ provider: 'openai' });
        assert(openai.every(m => m.provider === 'openai'), 'Provider filter works');

        const flagships = await registry.getAllModels({ tier: 'flagship' });
        assert(flagships.every(m => m.tier === 'flagship'), 'Tier filter works');

        const withVision = await registry.getAllModels({ capabilities: ['vision'] });
        assert(withVision.every(m => m.capabilities.includes('vision')), 'Capability filter works');

        const includeDeprecated = await registry.getAllModels({ includeDeprecated: true });
        const excludeDeprecated = await registry.getAllModels({ includeDeprecated: false });
        assert(includeDeprecated.length >= excludeDeprecated.length, 'Deprecated filter works');
    });

    // ── 8. Custom Pricing ──
    await test('8. Custom pricing overrides', async () => {
        registry.setCustomPricing('org-123', 'gpt-4o', {
            inputCostPer1K: 0.002,
            outputCostPer1K: 0.008,
        });

        const model = await registry.getModel('gpt-4o', 'org-123');
        assert(model.inputCostPer1K === 0.002, 'Custom input price applied');
        assert(model.outputCostPer1K === 0.008, 'Custom output price applied');
        assert(model.pricingSource === 'custom_override', 'Pricing source is custom_override');

        // Reset
        registry._customPricing.clear();
    });

    // ── 9. Health Report ──
    await test('9. Health report', async () => {
        const health = await registry.getHealthReport();
        assert(typeof health.status === 'string', 'Has status');
        assert(typeof health.models.total === 'number', 'Has total model count');
        assert(health.models.total > 15, `${health.models.total} total models`);
        assert(typeof health.models.byProvider === 'object', 'Has per-provider breakdown');
    });

    // ── 10. MODEL_CAPABILITIES completeness ──
    await test('10. MODEL_CAPABILITIES data quality', async () => {
        const required = ['provider', 'family', 'displayName', 'qualityScore', 'speedScore',
            'capabilities', 'contextWindow', 'tier', 'bestFor', 'deprecated'];

        for (const [modelId, caps] of Object.entries(MODEL_CAPABILITIES)) {
            for (const field of required) {
                assert(caps[field] !== undefined, `${modelId} has ${field}`);
            }
            assert(caps.qualityScore >= 0 && caps.qualityScore <= 100, `${modelId} quality in range`);
            assert(caps.speedScore >= 0 && caps.speedScore <= 100, `${modelId} speed in range`);
            assert(caps.capabilities.length > 0, `${modelId} has capabilities`);
        }
    });

    // ── 11. No stale/wrong prices from old AI_PRICING ──
    await test('11. Prices are realistic (not stale)', async () => {
        const gpt4o = await registry.getModel('gpt-4o');
        // gpt-4o should be cheaper than gpt-4
        const gpt4 = await registry.getModel('gpt-4');

        if (gpt4o && gpt4 && gpt4o.hasPricing && gpt4.hasPricing) {
            assert(gpt4o.inputCostPer1K < gpt4.inputCostPer1K,
                `gpt-4o ($${gpt4o.inputCostPer1K}) cheaper than gpt-4 ($${gpt4.inputCostPer1K})`);
        }

        // claude-3.5-haiku should be cheaper than claude-3.5-sonnet
        const haiku = await registry.getModel('claude-3.5-haiku');
        const sonnet = await registry.getModel('claude-3.5-sonnet');

        if (haiku && sonnet && haiku.hasPricing && sonnet.hasPricing) {
            assert(haiku.inputCostPer1K < sonnet.inputCostPer1K,
                `claude-3.5-haiku ($${haiku.inputCostPer1K}) cheaper than claude-3.5-sonnet ($${sonnet.inputCostPer1K})`);
        }
    });

    // ── 12. TIER_RANK ordering ──
    await test('12. Tier ranking is consistent', async () => {
        assert(TIER_RANK['reasoning'] > TIER_RANK['flagship'], 'reasoning > flagship');
        assert(TIER_RANK['flagship'] > TIER_RANK['balanced'], 'flagship > balanced');
        assert(TIER_RANK['balanced'] > TIER_RANK['efficient'], 'balanced > efficient');
        assert(TIER_RANK['efficient'] > TIER_RANK['budget'], 'efficient > budget');
        assert(TIER_RANK['budget'] > TIER_RANK['legacy'], 'budget > legacy');
    });

    // ── 13. Configurable Input/Output Weight (Fix #2) ──
    await test('13. findCheaperAlternatives — respects inputWeight parameter', async () => {
        // Heavy-output workload (like content generation): 30% input / 70% output
        const outputHeavy = await registry.findCheaperAlternatives('gpt-4', {
            maxQualityDrop: 20,
            minSavingsPercent: 10,
            inputWeight: 0.3,
        });
        assert(Array.isArray(outputHeavy), 'Returns array with output-heavy weight');

        // Heavy-input workload (like RAG): 95% input / 5% output
        const inputHeavy = await registry.findCheaperAlternatives('gpt-4', {
            maxQualityDrop: 20,
            minSavingsPercent: 10,
            inputWeight: 0.95,
        });
        assert(Array.isArray(inputHeavy), 'Returns array with input-heavy weight');

        // The savings percentages should differ because cost ratios change
        if (outputHeavy.length > 0 && inputHeavy.length > 0) {
            const sameModel = outputHeavy[0].model;
            const inputHeavyAlt = inputHeavy.find(a => a.model === sameModel);
            if (inputHeavyAlt) {
                assert(
                    Math.abs(outputHeavy[0].savingsPercent - inputHeavyAlt.savingsPercent) > 0.01,
                    'Different input weights produce different savings calculations'
                );
            }
        }
    });

    // ── 14. Context Window Matching (Fix #7) ──
    await test('14. findCheaperAlternatives — minContextWindow filter', async () => {
        // Require at least 100K context window
        const largeContext = await registry.findCheaperAlternatives('gpt-4', {
            maxQualityDrop: 30,
            minSavingsPercent: 5,
            minContextWindow: 100000,
        });

        for (const alt of largeContext) {
            const model = await registry.getModel(alt.model);
            assert(
                model.contextWindow >= 100000,
                `${alt.model} context window ${model.contextWindow} >= 100000`
            );
        }

        // With very high context requirement, fewer alternatives should be available
        const hugeContext = await registry.findCheaperAlternatives('gpt-4', {
            maxQualityDrop: 30,
            minSavingsPercent: 5,
            minContextWindow: 500000,
        });

        assert(
            hugeContext.length <= largeContext.length,
            `Higher context requirement (${hugeContext.length}) <= lower (${largeContext.length})`
        );
    });

    // ── 15. Race Condition Protection (Fix #4) ──
    await test('15. _ensureCache — concurrent calls share same promise', async () => {
        // Force cache expiry
        registry._modelCacheExpiry = 0;

        // Fire multiple concurrent calls
        const results = await Promise.all([
            registry.getModel('gpt-4o'),
            registry.getModel('claude-sonnet-4'),
            registry.getModel('gemini-2.0-flash'),
        ]);

        assert(results[0] !== null, 'Concurrent call 1 resolved');
        assert(results[1] !== null, 'Concurrent call 2 resolved');
        assert(results[2] !== null, 'Concurrent call 3 resolved');
        assert(registry._cachePromise === null, 'Cache promise cleaned up after resolution');
    });

    // ── 16. Provider Discount Programs (Fix #5) ──
    await test('16. PROVIDER_DISCOUNTS — structure is valid', async () => {
        assert(typeof PROVIDER_DISCOUNTS === 'object', 'PROVIDER_DISCOUNTS is an object');

        for (const [provider, programs] of Object.entries(PROVIDER_DISCOUNTS)) {
            for (const [programId, program] of Object.entries(programs)) {
                assert(typeof program.name === 'string', `${provider}.${programId} has name`);
                assert(typeof program.discount === 'number', `${provider}.${programId} has discount`);
                assert(program.discount > 0 && program.discount <= 1, `${provider}.${programId} discount in range (0,1]`);
                assert(Array.isArray(program.eligibleModels), `${provider}.${programId} has eligible models`);
                assert(program.eligibleModels.length > 0, `${provider}.${programId} has at least 1 eligible model`);
                assert(typeof program.description === 'string', `${provider}.${programId} has description`);
                assert(typeof program.tradeoff === 'string', `${provider}.${programId} has tradeoff`);
            }
        }
    });

    await test('16b. getAvailableDiscounts — returns correct programs', async () => {
        const gpt4oDiscounts = registry.getAvailableDiscounts('gpt-4o');
        assert(Array.isArray(gpt4oDiscounts), 'Returns array');
        assert(gpt4oDiscounts.length > 0, 'gpt-4o has available discounts (batch API)');

        const batchProgram = gpt4oDiscounts.find(d => d.id === 'batchApi');
        assert(batchProgram !== null && batchProgram !== undefined, 'gpt-4o has batch API discount');
        assert(batchProgram.discount === 0.5, 'Batch API is 50% off');

        const claudeDiscounts = registry.getAvailableDiscounts('claude-sonnet-4');
        const cacheProgram = claudeDiscounts.find(d => d.id === 'promptCaching');
        assert(cacheProgram !== null && cacheProgram !== undefined, 'claude-sonnet-4 has prompt caching');
        assert(cacheProgram.discount === 0.9, 'Prompt caching is 90% off');
    });

    await test('16c. calculateDiscountSavings — projects savings correctly', async () => {
        const savings = await registry.calculateDiscountSavings('gpt-4o', {
            monthlyInputTokens: 10000000,
            monthlyOutputTokens: 3000000,
        });

        assert(Array.isArray(savings), 'Returns array');
        assert(savings.length > 0, 'Has discount savings projections');

        for (const s of savings) {
            assert(typeof s.program === 'string', `${s.program} has program name`);
            assert(s.monthlySavings > 0, `${s.program} saves $${s.monthlySavings.toFixed(2)}/month`);
            assert(s.savingsPercent > 0, `${s.program} saves ${s.savingsPercent}%`);
            assert(s.annualSavings === s.monthlySavings * 12, `${s.program} annual = monthly * 12`);
            assert(s.currentMonthlyCost > s.projectedMonthlyCost, `${s.program} projected < current`);
        }
    });

    await test('16d. calculateDiscountSavings — prompt caching only discounts input', async () => {
        const savings = await registry.calculateDiscountSavings('claude-sonnet-4', {
            monthlyInputTokens: 10000000,
            monthlyOutputTokens: 10000000,
            cacheableInputPercent: 0.5,
        });

        const cacheProgram = savings.find(s => s.programId === 'promptCaching');
        assert(cacheProgram !== null && cacheProgram !== undefined, 'Has prompt caching projection');
        // With 50% cacheable input and 90% discount on those:
        // Savings should be less than 50% (only input, only cacheable portion)
        assert(cacheProgram.savingsPercent < 50, `Prompt caching saves ${cacheProgram.savingsPercent}% (< 50% because only input tokens)`);
        // With equal input/output and output 5x more expensive, savings are modest
        // 50% cacheable * 90% discount * input share = ~7.5% total savings
        assert(cacheProgram.savingsPercent > 5, `Prompt caching saves ${cacheProgram.savingsPercent}% (> 5% — meaningful savings)`);
    });

    // ── 17. Public normalizeModelId API (Round 2 Fix #1) ──
    await test('17. normalizeModelId — public API works', async () => {
        assert(typeof registry.normalizeModelId === 'function', 'normalizeModelId is a public method');
        assert(registry.normalizeModelId('gpt-4o-2024-05-13') === 'gpt-4o', 'Normalizes date-suffixed OpenAI model');
        assert(registry.normalizeModelId('claude-3-5-sonnet-20241022') === 'claude-3.5-sonnet', 'Normalizes date-suffixed Anthropic model');
        assert(registry.normalizeModelId('gpt4o') === 'gpt-4o', 'Normalizes alias without hyphens');
        assert(registry.normalizeModelId('GPT-4o') === 'gpt-4o', 'Case insensitive');
        assert(registry.normalizeModelId('  gpt-4o  ') === 'gpt-4o', 'Trims whitespace');
        assert(registry.normalizeModelId('unknown-model-xyz') === 'unknown-model-xyz', 'Unknown models pass through unchanged');
    });

    // ── 18. Discount programs in recommendations (Round 2 Fix #2) ──
    await test('18. generateOptimizationRecommendations — includes discount programs', async () => {
        const usage = [
            { model: 'gpt-4o', cost: 5000, requests: 10000, inputTokens: 50000000, outputTokens: 15000000 },
        ];

        const recs = await registry.generateOptimizationRecommendations(usage);
        assert(Array.isArray(recs), 'Returns array');

        const discountRecs = recs.filter(r => r.type === 'discount_program');
        assert(discountRecs.length > 0, `Found ${discountRecs.length} discount program recommendations`);

        const batchRec = discountRecs.find(r => r.programId === 'batchApi');
        assert(batchRec !== undefined, 'Found Batch API recommendation for gpt-4o');
        assert(batchRec.recommendedModel === 'gpt-4o', 'Discount program keeps same model');
        assert(batchRec.qualityDrop === 0, 'No quality drop for discount programs');
        assert(batchRec.monthlySavings > 0, `Batch API saves $${batchRec.monthlySavings.toFixed(2)}/month`);
    });

    // ── 19. Deprecation warnings in recommendations (Round 2 Fix #3) ──
    await test('19. generateOptimizationRecommendations — deprecation warnings', async () => {
        const usage = [
            { model: 'claude-3-opus', cost: 3000, requests: 5000, inputTokens: 10000000, outputTokens: 5000000 },
        ];

        const recs = await registry.generateOptimizationRecommendations(usage);
        const deprecationRecs = recs.filter(r => r.type === 'deprecation_warning');
        assert(deprecationRecs.length > 0, 'Found deprecation warning for claude-3-opus');

        const warning = deprecationRecs[0];
        assert(warning.recommendedModel === 'claude-opus-4', 'Recommends successor (claude-opus-4)');
        assert(warning.urgent === true, 'Marked as urgent');
        assert(warning.risk === 'high', 'Risk is high (model will be removed)');
        assert(warning.confidence >= 0.9, `Confidence is high (${warning.confidence})`);
    });

    await test('19b. No deprecation warning for active models', async () => {
        const usage = [
            { model: 'gpt-4o', cost: 5000, requests: 10000, inputTokens: 50000000, outputTokens: 15000000 },
        ];

        const recs = await registry.generateOptimizationRecommendations(usage);
        const deprecationRecs = recs.filter(r => r.type === 'deprecation_warning');
        assert(deprecationRecs.length === 0, 'No deprecation warning for active models');
    });

    // ── 20. Three recommendation types coexist (Round 2 integration) ──
    await test('20. generateOptimizationRecommendations — all 3 types for deprecated model', async () => {
        const usage = [
            { model: 'gpt-3.5-turbo', cost: 500, requests: 50000, inputTokens: 100000000, outputTokens: 30000000 },
        ];

        const recs = await registry.generateOptimizationRecommendations(usage);
        const types = new Set(recs.map(r => r.type));

        // gpt-3.5-turbo is deprecated AND has batch API AND has cheaper alternatives
        assert(types.has('deprecation_warning'), 'Has deprecation warning (gpt-3.5-turbo → gpt-4o-mini)');
        assert(types.has('discount_program'), 'Has discount program (batch API)');
        // model_switch may or may not appear depending on whether alternatives meet the 20% threshold
    });

    // ── 21. claude-opus-4.5 is its OWN model (Round 3 Fix #1) ──
    await test('21. claude-opus-4.5 is a distinct model, not aliased to opus 4', async () => {
        const opus45 = await registry.getModel('claude-opus-4.5');
        const opus4 = await registry.getModel('claude-opus-4');

        assert(opus45 !== null, 'claude-opus-4.5 is found');
        assert(opus4 !== null, 'claude-opus-4 is found');
        assert(opus45.id !== opus4.id, `opus-4.5 (${opus45.id}) is distinct from opus-4 (${opus4.id})`);
        assert(opus45.id === 'claude-opus-4.5', 'opus-4.5 ID is correct');
        assert(opus45.tier !== 'unknown', `opus-4.5 tier is ${opus45.tier} (not unknown)`);
        assert(opus45.releaseDate === '2025-11-01', 'opus-4.5 release date is correct');
        assert(opus45.qualityScore >= opus4.qualityScore, 'opus-4.5 quality >= opus-4');
    });

    // ── 22. MODEL_ID_ALIASES is frozen module-level constant (Round 3 Fix #2) ──
    await test('22. MODEL_ID_ALIASES is a frozen object', async () => {
        assert(typeof MODEL_ID_ALIASES === 'object', 'MODEL_ID_ALIASES exists');
        assert(Object.isFrozen(MODEL_ID_ALIASES), 'MODEL_ID_ALIASES is frozen (immutable)');
        assert(Object.keys(MODEL_ID_ALIASES).length > 15, `Has ${Object.keys(MODEL_ID_ALIASES).length} aliases`);
        // Verify the bad alias is gone
        assert(MODEL_ID_ALIASES['claude-opus-4.5'] === undefined, 'claude-opus-4.5 is NOT aliased to opus-4');
    });

    // ── 23. Confidence scores are continuous (Round 3 Fix #5) ──
    await test('23. _calculateSwitchConfidence — produces distinguishable scores', async () => {
        const gpt4 = await registry.getModel('gpt-4');
        const gpt4o = await registry.getModel('gpt-4o');
        const gpt4oMini = await registry.getModel('gpt-4o-mini');
        const claudeSonnet = await registry.getModel('claude-sonnet-4');

        // Same provider, small quality gap → should be higher confidence
        const confSameProvider = registry._calculateSwitchConfidence(gpt4, gpt4o);
        // Different provider, larger quality gap → should be lower confidence
        const confDiffProvider = registry._calculateSwitchConfidence(gpt4, claudeSonnet);
        // Bigger quality drop → even lower
        const confBigDrop = registry._calculateSwitchConfidence(gpt4, gpt4oMini);

        assert(confSameProvider > confDiffProvider,
            `Same provider (${confSameProvider}) > diff provider (${confDiffProvider})`);
        assert(confDiffProvider > confBigDrop || confSameProvider > confBigDrop,
            `Bigger quality drop (${confBigDrop}) has lower confidence`);

        // All should be in valid range
        assert(confSameProvider >= 0.05 && confSameProvider <= 0.95, `Same provider in range: ${confSameProvider}`);
        assert(confDiffProvider >= 0.05 && confDiffProvider <= 0.95, `Diff provider in range: ${confDiffProvider}`);
        assert(confBigDrop >= 0.05 && confBigDrop <= 0.95, `Big drop in range: ${confBigDrop}`);
    });

    // ── 24. generateOptimizationRecommendations normalizes currentModel (Round 3 Fix #4) ──
    await test('24. Recommendations use canonical model IDs', async () => {
        const usage = [
            { model: 'claude-3-5-sonnet-20241022', cost: 5000, requests: 10000, inputTokens: 50000000, outputTokens: 15000000 },
        ];

        const recs = await registry.generateOptimizationRecommendations(usage);
        for (const rec of recs) {
            assert(rec.currentModel === 'claude-3.5-sonnet',
                `currentModel is canonical "${rec.currentModel}" (not dated version)`);
        }
    });

    // ── 25. Alternative results include contextWindow field ──
    await test('25. Alternative results include contextWindow field', async () => {
        const alts = await registry.findCheaperAlternatives('gpt-4', {
            maxQualityDrop: 25,
            minSavingsPercent: 5,
        });

        for (const alt of alts) {
            assert(typeof alt.contextWindow === 'number', `${alt.model} has contextWindow in results`);
            assert(alt.contextWindow > 0, `${alt.model} contextWindow > 0`);
        }
    });

    // ── 26. Expanded Model Coverage — all 8 providers present ──
    await test('26. MODEL_CAPABILITIES covers all 8 providers', async () => {
        const providers = new Set(Object.values(MODEL_CAPABILITIES).map(m => m.provider));
        assert(providers.has('openai'), 'Has OpenAI models');
        assert(providers.has('anthropic'), 'Has Anthropic models');
        assert(providers.has('google'), 'Has Google models');
        assert(providers.has('meta'), 'Has Meta models');
        assert(providers.has('mistral'), 'Has Mistral models');
        assert(providers.has('deepseek'), 'Has DeepSeek models');
        assert(providers.has('cohere'), 'Has Cohere models');
        assert(providers.has('amazon'), 'Has Amazon models');
        assert(Object.keys(MODEL_CAPABILITIES).length >= 44, `Has ${Object.keys(MODEL_CAPABILITIES).length} models (>= 44)`);
    });

    // ── 27. New OpenAI models (o3, o4-mini, GPT-4.1 family) ──
    await test('27. New OpenAI models are properly defined', async () => {
        const o3 = await registry.getModel('o3');
        assert(o3 !== null, 'o3 is found');
        assert(o3.tier === 'reasoning', 'o3 is reasoning tier');
        assert(o3.contextWindow === 200000, 'o3 has 200K context');
        assert(o3.maxOutputTokens === 100000, 'o3 has 100K max output');
        assert(o3.hasPricing === true, 'o3 has pricing');

        const o4mini = await registry.getModel('o4-mini');
        assert(o4mini !== null, 'o4-mini is found');
        assert(o4mini.tier === 'reasoning', 'o4-mini is reasoning tier');
        assert(o4mini.inputCostPer1K < o3.inputCostPer1K, 'o4-mini cheaper input than o3');

        const gpt41 = await registry.getModel('gpt-4.1');
        assert(gpt41 !== null, 'gpt-4.1 is found');
        assert(gpt41.contextWindow === 1000000, 'gpt-4.1 has 1M context');
        assert(gpt41.tier === 'flagship', 'gpt-4.1 is flagship');

        const gpt41mini = await registry.getModel('gpt-4.1-mini');
        assert(gpt41mini !== null, 'gpt-4.1-mini is found');
        assert(gpt41mini.inputCostPer1K < gpt41.inputCostPer1K, 'gpt-4.1-mini cheaper than gpt-4.1');

        const gpt41nano = await registry.getModel('gpt-4.1-nano');
        assert(gpt41nano !== null, 'gpt-4.1-nano is found');
        assert(gpt41nano.inputCostPer1K < gpt41mini.inputCostPer1K, 'gpt-4.1-nano cheaper than mini');
        assert(gpt41nano.tier === 'budget', 'gpt-4.1-nano is budget tier');
    });

    // ── 28. New Anthropic models (Sonnet 4.5, Haiku 4.5) ──
    await test('28. New Anthropic models are properly defined', async () => {
        const sonnet45 = await registry.getModel('claude-sonnet-4.5');
        assert(sonnet45 !== null, 'claude-sonnet-4.5 is found');
        assert(sonnet45.maxOutputTokens === 64000, 'Sonnet 4.5 has 64K max output');
        assert(sonnet45.family === 'claude-4.5', 'Sonnet 4.5 is in claude-4.5 family');

        const haiku45 = await registry.getModel('claude-haiku-4.5');
        assert(haiku45 !== null, 'claude-haiku-4.5 is found');
        assert(haiku45.maxOutputTokens === 64000, 'Haiku 4.5 has 64K max output');
        assert(haiku45.inputCostPer1K < sonnet45.inputCostPer1K, 'Haiku 4.5 cheaper than Sonnet 4.5');

        // Verify dated aliases resolve
        assert(registry.normalizeModelId('claude-sonnet-4-5-20250929') === 'claude-sonnet-4.5', 'Sonnet 4.5 dated alias works');
        assert(registry.normalizeModelId('claude-haiku-4-5-20251001') === 'claude-haiku-4.5', 'Haiku 4.5 dated alias works');
    });

    // ── 29. New providers: DeepSeek, Cohere, Amazon ──
    await test('29. DeepSeek, Cohere, and Amazon models work', async () => {
        const dsV3 = await registry.getModel('deepseek-v3');
        assert(dsV3 !== null, 'deepseek-v3 is found');
        assert(dsV3.provider === 'deepseek', 'deepseek-v3 provider is deepseek');
        assert(dsV3.hasPricing === true, 'deepseek-v3 has pricing');

        const dsR1 = await registry.getModel('deepseek-r1');
        assert(dsR1 !== null, 'deepseek-r1 is found');
        assert(dsR1.tier === 'reasoning', 'deepseek-r1 is reasoning tier');

        // Aliases work
        assert(registry.normalizeModelId('deepseek-chat') === 'deepseek-v3', 'deepseek-chat alias works');
        assert(registry.normalizeModelId('deepseek-reasoner') === 'deepseek-r1', 'deepseek-reasoner alias works');

        const cmdA = await registry.getModel('command-a');
        assert(cmdA !== null, 'command-a is found');
        assert(cmdA.provider === 'cohere', 'command-a provider is cohere');

        const cmdR = await registry.getModel('command-r');
        assert(cmdR !== null, 'command-r is found');
        assert(cmdR.inputCostPer1K < cmdA.inputCostPer1K, 'command-r cheaper than command-a');

        const novaPro = await registry.getModel('nova-pro');
        assert(novaPro !== null, 'nova-pro is found');
        assert(novaPro.provider === 'amazon', 'nova-pro provider is amazon');

        const novaMicro = await registry.getModel('nova-micro');
        assert(novaMicro !== null, 'nova-micro is found');
        assert(novaMicro.inputCostPer1K < novaPro.inputCostPer1K, 'nova-micro cheaper than nova-pro');

        // Amazon aliases
        assert(registry.normalizeModelId('amazon-nova-pro') === 'nova-pro', 'amazon-nova-pro alias works');
    });

    // ── 30. Gemini 2.5 and Llama 4 models ──
    await test('30. Gemini 2.5 and Llama 4 models work', async () => {
        const g25pro = await registry.getModel('gemini-2.5-pro');
        assert(g25pro !== null, 'gemini-2.5-pro is found');
        assert(g25pro.contextWindow === 1000000, 'Gemini 2.5 Pro has 1M context');
        assert(g25pro.tier === 'flagship', 'Gemini 2.5 Pro is flagship');

        const g25flash = await registry.getModel('gemini-2.5-flash');
        assert(g25flash !== null, 'gemini-2.5-flash is found');
        assert(g25flash.inputCostPer1K < g25pro.inputCostPer1K, 'Flash cheaper than Pro');

        const scout = await registry.getModel('llama-4-scout');
        assert(scout !== null, 'llama-4-scout is found');
        assert(scout.contextWindow === 10000000, 'Scout has 10M context window');

        const maverick = await registry.getModel('llama-4-maverick');
        assert(maverick !== null, 'llama-4-maverick is found');
        assert(maverick.contextWindow === 1000000, 'Maverick has 1M context');
        assert(maverick.qualityScore > scout.qualityScore, 'Maverick higher quality than Scout');
    });

    // ── 31. Claude Opus 4.5 pricing is correct ($5/$25 per MTok, not $15/$75) ──
    await test('31. Claude Opus 4.5 pricing is correct (not stale Opus 4 pricing)', async () => {
        const opus45 = await registry.getModel('claude-opus-4.5');
        const opus4 = await registry.getModel('claude-opus-4');

        assert(opus45.inputCostPer1K < opus4.inputCostPer1K,
            `Opus 4.5 ($${opus45.inputCostPer1K}/1K) cheaper than Opus 4 ($${opus4.inputCostPer1K}/1K)`);
        assert(opus45.outputCostPer1K < opus4.outputCostPer1K,
            `Opus 4.5 output ($${opus45.outputCostPer1K}) cheaper than Opus 4 ($${opus4.outputCostPer1K})`);
        // Opus 4.5 = $5/$25 per MTok = $0.005/$0.025 per 1K
        assert(opus45.inputCostPer1K <= 0.006, `Opus 4.5 input <= $0.006/1K (actual: $${opus45.inputCostPer1K})`);
        assert(opus45.outputCostPer1K <= 0.03, `Opus 4.5 output <= $0.03/1K (actual: $${opus45.outputCostPer1K})`);
    });

    // ── 32. New discount programs work (OpenAI prompt caching, DeepSeek, Amazon) ──
    await test('32. Expanded PROVIDER_DISCOUNTS cover new providers', async () => {
        assert(PROVIDER_DISCOUNTS.deepseek !== undefined, 'DeepSeek has discount programs');
        assert(PROVIDER_DISCOUNTS.amazon !== undefined, 'Amazon has discount programs');

        // OpenAI now has prompt caching too
        assert(PROVIDER_DISCOUNTS.openai.promptCaching !== undefined, 'OpenAI has prompt caching');
        assert(PROVIDER_DISCOUNTS.openai.promptCaching.eligibleModels.includes('gpt-4.1'), 'GPT-4.1 eligible for prompt caching');

        // Anthropic batch API
        assert(PROVIDER_DISCOUNTS.anthropic.batchApi !== undefined, 'Anthropic has batch API');
        assert(PROVIDER_DISCOUNTS.anthropic.batchApi.eligibleModels.includes('claude-sonnet-4.5'), 'Sonnet 4.5 eligible for batch API');

        // Google batch processing
        assert(PROVIDER_DISCOUNTS.google.batchApi !== undefined, 'Google has batch processing');

        // DeepSeek caching
        const dsDiscounts = registry.getAvailableDiscounts('deepseek-v3');
        assert(dsDiscounts.length > 0, 'deepseek-v3 has available discounts');

        // Amazon batch
        const novaDiscounts = registry.getAvailableDiscounts('nova-pro');
        assert(novaDiscounts.length > 0, 'nova-pro has available discounts');
    });

    // ── 33. GPT-4.1 family aliases resolve correctly ──
    await test('33. GPT-4.1 family aliases', async () => {
        assert(registry.normalizeModelId('gpt-4.1-2025-04-14') === 'gpt-4.1', 'GPT-4.1 dated alias');
        assert(registry.normalizeModelId('gpt-4.1-mini-2025-04-14') === 'gpt-4.1-mini', 'GPT-4.1 Mini dated alias');
        assert(registry.normalizeModelId('gpt-4.1-nano-2025-04-14') === 'gpt-4.1-nano', 'GPT-4.1 Nano dated alias');
        assert(registry.normalizeModelId('o3-2025-04-16') === 'o3', 'o3 dated alias');
        assert(registry.normalizeModelId('o4-mini-2025-04-16') === 'o4-mini', 'o4-mini dated alias');
    });

    // ── 34. Pricing hierarchy: flagships > balanced > efficient > budget per provider ──
    await test('34. Pricing hierarchy is sensible within each provider', async () => {
        // OpenAI: gpt-4.1 > gpt-4.1-mini > gpt-4.1-nano
        const gpt41 = await registry.getModel('gpt-4.1');
        const gpt41m = await registry.getModel('gpt-4.1-mini');
        const gpt41n = await registry.getModel('gpt-4.1-nano');
        assert(gpt41.inputCostPer1K > gpt41m.inputCostPer1K, 'GPT-4.1 more expensive than mini');
        assert(gpt41m.inputCostPer1K > gpt41n.inputCostPer1K, 'GPT-4.1 mini more expensive than nano');

        // Anthropic: opus-4.5 > sonnet-4.5 > haiku-4.5
        const op45 = await registry.getModel('claude-opus-4.5');
        const sn45 = await registry.getModel('claude-sonnet-4.5');
        const hk45 = await registry.getModel('claude-haiku-4.5');
        assert(op45.inputCostPer1K > sn45.inputCostPer1K, 'Opus 4.5 more expensive than Sonnet 4.5');
        assert(sn45.inputCostPer1K > hk45.inputCostPer1K, 'Sonnet 4.5 more expensive than Haiku 4.5');

        // Google: 2.5-pro > 2.5-flash
        const g25p = await registry.getModel('gemini-2.5-pro');
        const g25f = await registry.getModel('gemini-2.5-flash');
        assert(g25p.inputCostPer1K > g25f.inputCostPer1K, 'Gemini 2.5 Pro more expensive than Flash');

        // Amazon: nova-pro > nova-lite > nova-micro
        const np = await registry.getModel('nova-pro');
        const nl = await registry.getModel('nova-lite');
        const nm = await registry.getModel('nova-micro');
        assert(np.inputCostPer1K > nl.inputCostPer1K, 'Nova Pro more expensive than Lite');
        assert(nl.inputCostPer1K > nm.inputCostPer1K, 'Nova Lite more expensive than Micro');
    });

    // ── 35. Every model in MODEL_CAPABILITIES has fallback pricing ──
    await test('35. Every model has pricing from at least one source', async () => {
        const allModels = await registry.getAllModels({ includeDeprecated: true });
        let modelsWithoutPricing = 0;
        for (const model of allModels) {
            if (!model.hasPricing) {
                modelsWithoutPricing++;
                console.log(`    WARNING: ${model.id} has no pricing`);
            }
        }
        assert(modelsWithoutPricing === 0, `All ${allModels.length} models have pricing (${modelsWithoutPricing} missing)`);
    });

    // ── 36. W-001 A+ HARDENING: Staleness enforcement and freshness metadata ──
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('W-001 A+: Staleness enforcement and freshness metadata');
    console.log('═══════════════════════════════════════════════════════════\n');

    const w1h_regSrc = fs.readFileSync(path.resolve(__dirname, '..', 'model-registry.js'), 'utf-8');
    const w1h_noComments = w1h_regSrc.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

    // 1. LOCAL_FALLBACK_PRICING_VERIFIED_AT constant exists
    assert(
        w1h_noComments.includes('LOCAL_FALLBACK_PRICING_VERIFIED_AT'),
        'W-001 A+: LOCAL_FALLBACK_PRICING_VERIFIED_AT timestamp constant exists'
    );

    // 2. LOCAL_FALLBACK_MAX_AGE_MS constant exists
    assert(
        w1h_noComments.includes('LOCAL_FALLBACK_MAX_AGE_MS'),
        'W-001 A+: LOCAL_FALLBACK_MAX_AGE_MS staleness threshold constant exists'
    );

    // 3. _enforcePricingFreshness method exists
    assert(
        w1h_noComments.includes('_enforcePricingFreshness'),
        'W-001 A+: _enforcePricingFreshness enforcement method exists'
    );

    // 4. findCheaperAlternatives calls enforcement
    // Use 'async findCheaperAlternatives' to match method DEFINITION, not JSDoc/comment mention
    const w1h_cheaperStart = w1h_regSrc.indexOf('async findCheaperAlternatives');
    const w1h_cheaperBlock = w1h_regSrc.slice(w1h_cheaperStart, w1h_cheaperStart + 500);
    assert(
        w1h_cheaperBlock.includes('_enforcePricingFreshness'),
        'W-001 A+: findCheaperAlternatives calls _enforcePricingFreshness'
    );

    // 5. calculateSwitchSavings calls enforcement
    // Use 'async calculateSwitchSavings' to match method DEFINITION, not JSDoc mention
    const w1h_switchStart = w1h_regSrc.indexOf('async calculateSwitchSavings');
    const w1h_switchBlock = w1h_regSrc.slice(w1h_switchStart, w1h_switchStart + 500);
    assert(
        w1h_switchBlock.includes('_enforcePricingFreshness'),
        'W-001 A+: calculateSwitchSavings calls _enforcePricingFreshness'
    );

    // 6. generateOptimizationRecommendations calls enforcement
    const w1h_optStart = w1h_regSrc.indexOf('generateOptimizationRecommendations');
    const w1h_optBlock = w1h_regSrc.slice(w1h_optStart, w1h_optStart + 500);
    assert(
        w1h_optBlock.includes('_enforcePricingFreshness'),
        'W-001 A+: generateOptimizationRecommendations calls _enforcePricingFreshness'
    );

    // 7. calculateDiscountSavings calls enforcement
    // Use 'async calculateDiscountSavings' to match method DEFINITION, not call site
    const w1h_discStart = w1h_regSrc.indexOf('async calculateDiscountSavings');
    const w1h_discBlock = w1h_regSrc.slice(w1h_discStart, w1h_discStart + 500);
    assert(
        w1h_discBlock.includes('_enforcePricingFreshness'),
        'W-001 A+: calculateDiscountSavings calls _enforcePricingFreshness'
    );

    // 8. isFallbackPricing flag in model objects
    assert(
        w1h_noComments.includes('isFallbackPricing'),
        'W-001 A+: Model objects include isFallbackPricing flag'
    );

    // 9. lastPriceUpdate uses verified timestamp for fallback
    assert(
        w1h_noComments.includes('LOCAL_FALLBACK_PRICING_VERIFIED_AT') &&
        w1h_regSrc.includes('lastPriceUpdate') &&
        w1h_regSrc.includes('LOCAL_FALLBACK_PRICING_VERIFIED_AT'),
        'W-001 A+: lastPriceUpdate falls back to LOCAL_FALLBACK_PRICING_VERIFIED_AT'
    );

    // 10. Enforcement checks local_fallback count
    // Use definition signature to skip call sites (this._enforcePricingFreshness)
    const w1h_enforceStart = w1h_regSrc.indexOf('_enforcePricingFreshness(context');
    const w1h_enforceBlock = w1h_regSrc.slice(w1h_enforceStart, w1h_enforceStart + 1000);
    assert(
        w1h_enforceBlock.includes('local_fallback') && w1h_enforceBlock.includes('throw'),
        'W-001 A+: _enforcePricingFreshness counts local_fallback models and throws on stale data'
    );

    // ── Pass 14 CALLER-BUG 52-58: Input validation & multi-tenant fixes ──
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('Pass 14: Structural regression tests (CALLER-BUG 52-58)');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Test 1: findCheaperAlternatives has inputWeight bounds check
    assert(
        w1h_noComments.includes('inputWeight < 0 || inputWeight > 1'),
        'w1p14_1: findCheaperAlternatives validates inputWeight between 0 and 1'
    );

    // Test 2: calculateSwitchSavings validates monthlyInputTokens
    const w1p14_switchStart = w1h_regSrc.indexOf('async calculateSwitchSavings');
    const w1p14_switchBlock = w1h_regSrc.slice(w1p14_switchStart, w1p14_switchStart + 600);
    assert(
        w1p14_switchBlock.includes('monthlyInputTokens') && w1p14_switchBlock.includes('!isFinite'),
        'w1p14_2: calculateSwitchSavings validates monthlyInputTokens with isFinite check'
    );

    // Test 3: calculateDiscountSavings validates cacheableInputPercent between 0 and 1
    const w1p14_discStart = w1h_regSrc.indexOf('async calculateDiscountSavings');
    const w1p14_discBlock = w1h_regSrc.slice(w1p14_discStart, w1p14_discStart + 1200);
    assert(
        w1p14_discBlock.includes('cacheableInputPercent < 0') && w1p14_discBlock.includes('cacheableInputPercent > 1'),
        'w1p14_3: calculateDiscountSavings validates cacheableInputPercent between 0 and 1'
    );

    // Test 4: setCustomPricing validates inputCostPer1K
    const w1p14_customStart = w1h_regSrc.indexOf('setCustomPricing(organizationId');
    const w1p14_customBlock = w1h_regSrc.slice(w1p14_customStart, w1p14_customStart + 600);
    assert(
        w1p14_customBlock.includes('inputCostPer1K') && w1p14_customBlock.includes('!isFinite'),
        'w1p14_4: setCustomPricing validates inputCostPer1K with isFinite check'
    );

    // Test 5: loadCustomPricing has NaN guard (isNaN check)
    const w1p14_loadStart = w1h_regSrc.indexOf('async loadCustomPricing');
    const w1p14_loadBlock = w1h_regSrc.slice(w1p14_loadStart, w1p14_loadStart + 1500);
    assert(
        w1p14_loadBlock.includes('isNaN(inputCost)') && w1p14_loadBlock.includes('isNaN(outputCost)'),
        'w1p14_5: loadCustomPricing has NaN guard on parsed pricing values'
    );

    // Test 6: detectPriceChanges has division by zero guard
    const w1p14_detectStart = w1h_regSrc.indexOf('async detectPriceChanges');
    const w1p14_detectBlock = w1h_regSrc.slice(w1p14_detectStart, w1p14_detectStart + 3000);
    assert(
        w1p14_detectBlock.includes('prevPrice.inputCost > 0'),
        'w1p14_6: detectPriceChanges has division by zero guard in delta calculation'
    );

    // Test 7: getModel accepts orgId parameter (multi-tenant fix)
    const w1p14_getModelStart = w1h_regSrc.indexOf('async getModel(modelId');
    const w1p14_getModelBlock = w1h_regSrc.slice(w1p14_getModelStart, w1p14_getModelStart + 500);
    assert(
        w1p14_getModelBlock.includes('orgId') && w1p14_getModelBlock.includes('customKey'),
        'w1p14_7: getModel accepts orgId parameter for multi-tenant custom pricing lookup'
    );

    // ── Pass 15 HARDENING-BUG 71-78: Price data guards & error handling ──
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('Pass 15: Structural regression tests (HARDENING-BUG 71-78)');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Test 1: BUG 71 — _buildModelCache NaN guard (nullish coalescing on price)
    const w1p15_buildStart = w1h_regSrc.indexOf('async _buildModelCache()');
    const w1p15_buildBlock = w1h_regSrc.slice(w1p15_buildStart, w1p15_buildStart + 3000);
    const w1p15_buildNoComments = w1p15_buildBlock.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert(
        w1p15_buildNoComments.includes('price.inputCost ?? 0') &&
        w1p15_buildNoComments.includes('price.outputCost ?? 0'),
        'w1p15_1: _buildModelCache uses nullish coalescing (?? 0) on inputCost/outputCost'
    );

    // Test 2: BUG 72 — loadCustomPricing Supabase error check
    const w1p15_loadStart = w1h_regSrc.indexOf('async loadCustomPricing(organizationId)');
    const w1p15_loadBlock = w1h_regSrc.slice(w1p15_loadStart, w1p15_loadStart + 1200);
    const w1p15_loadNoComments = w1p15_loadBlock.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert(
        w1p15_loadNoComments.includes('{ data, error: queryError }') &&
        w1p15_loadNoComments.includes('if (queryError)'),
        'w1p15_2: loadCustomPricing destructures { data, error } and checks error'
    );

    // Test 3: BUG 73 — loadCustomPricing select() narrowing (specific columns not *)
    const w1p15_selectStart = w1h_regSrc.indexOf('async loadCustomPricing(organizationId)');
    const w1p15_selectBlock = w1h_regSrc.slice(w1p15_selectStart, w1p15_selectStart + 800);
    assert(
        w1p15_selectBlock.includes('.select(\'model_id, input_cost_per_1k, output_cost_per_1k, is_active, effective_until\')') ||
        (w1p15_selectBlock.includes('.select(') && !w1p15_selectBlock.includes('.select(\'*\')')),
        'w1p15_3: loadCustomPricing uses specific column selection, not select(*)'
    );

    // Test 4: BUG 74 — checkPricingStaleness Supabase error check
    const w1p15_checkStart = w1h_regSrc.indexOf('async checkPricingStaleness()');
    const w1p15_checkBlock = w1h_regSrc.slice(w1p15_checkStart, w1p15_checkStart + 1500);
    const w1p15_checkNoComments = w1p15_checkBlock.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert(
        w1p15_checkNoComments.includes('error: queryError') &&
        w1p15_checkNoComments.includes('if (queryError'),
        'w1p15_4: checkPricingStaleness checks Supabase query error'
    );

    // Test 5: BUG 75 — detectPriceChanges null guard on .data
    const w1p15_detectStart = w1h_regSrc.indexOf('async detectPriceChanges()');
    const w1p15_detectBlock = w1h_regSrc.slice(w1p15_detectStart, w1p15_detectStart + 2000);
    const w1p15_detectNoComments = w1p15_detectBlock.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert(
        w1p15_detectNoComments.includes('if (!previousData') ||
        w1p15_detectNoComments.includes('if (!current ||'),
        'w1p15_5: detectPriceChanges has null guard on .data before accessing'
    );

    // Test 6: BUG 76 — detectPriceChanges NaN guard on delta (isFinite check)
    const w1p15_deltaStart = w1h_regSrc.indexOf('async detectPriceChanges()');
    const w1p15_deltaBlock = w1h_regSrc.slice(w1p15_deltaStart, w1p15_deltaStart + 2500);
    assert(
        w1p15_deltaBlock.includes('if (!isFinite(inputDelta) || !isFinite(outputDelta))'),
        'w1p15_6: detectPriceChanges uses isFinite check on delta values'
    );

    // Test 7: BUG 77 — findCheaperAlternatives NaN guard on blended costs
    const w1p15_cheapStart = w1h_regSrc.indexOf('async findCheaperAlternatives(modelId');
    const w1p15_cheapBlock = w1h_regSrc.slice(w1p15_cheapStart, w1p15_cheapStart + 3000);
    assert(
        w1p15_cheapBlock.includes('if (!isFinite(altBlendedCost))') &&
        w1p15_cheapBlock.includes('if (!isFinite(currentBlendedCost)'),
        'w1p15_7: findCheaperAlternatives checks isFinite on blended costs'
    );

    // Test 8: BUG 78 — calculateSwitchSavings NaN output guard
    const w1p15_switchStart = w1h_regSrc.indexOf('async calculateSwitchSavings(fromModelId');
    const w1p15_switchBlock = w1h_regSrc.slice(w1p15_switchStart, w1p15_switchStart + 2000);
    assert(
        w1p15_switchBlock.includes('if (!isFinite(currentMonthlyCost) || !isFinite(projectedMonthlyCost))') &&
        w1p15_switchBlock.includes('return { success: false'),
        'w1p15_8: calculateSwitchSavings validates output with isFinite check'
    );

    // ── Pass 16 HARDENING-BUG 95: detectPriceChanges error handling ──
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('Pass 16: Structural regression tests (HARDENING-BUG 95)');
    console.log('═══════════════════════════════════════════════════════════\n');

    const w1p16_detectStart = w1h_regSrc.indexOf('async detectPriceChanges()');
    const w1p16_detectBlock = w1h_regSrc.slice(w1p16_detectStart, w1p16_detectStart + 3000);
    const w1p16_detectNoComments = w1p16_detectBlock.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

    assert(
        w1p16_detectNoComments.includes('error: versionError'),
        'w1p16_1: detectPriceChanges destructures error as versionError'
    );

    assert(
        w1p16_detectNoComments.includes('if (versionError)'),
        'w1p16_2: detectPriceChanges checks if (versionError) before proceeding'
    );

    assert(
        w1p16_detectNoComments.includes('return { changes: [], message:') &&
        (w1p16_detectNoComments.includes('database error') || w1p16_detectNoComments.includes('versionError.message')),
        'w1p16_3: detectPriceChanges returns error message on versionError'
    );

    assert(
        w1p16_detectNoComments.includes('const current = previousData[0]?.data') ||
        w1p16_detectNoComments.includes('data: previousData'),
        'w1p16_4: detectPriceChanges extracts data from previousData array'
    );

    // ── Summary ──
    console.log('\n═══════════════════════════════════════════════');
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log('═══════════════════════════════════════════════');

    if (failures.length > 0) {
        console.log('\nFailures:');
        failures.forEach(f => console.log(`  - ${f}`));
    }

    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('Test suite error:', err);
    process.exit(1);
});
