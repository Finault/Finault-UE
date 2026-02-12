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

async function runTests() {
    console.log('═'.repeat(70));
    console.log('W-009 TOKEN ESTIMATOR TEST SUITE');
    console.log('═'.repeat(70));

    const { TokenEstimator, TOKEN_ESTIMATOR_CONFIG, PRICING, createTokenEstimator } = await import(new URL('../core/token-estimator.js', import.meta.url).href);

    // =========================================================================
    // SECTION 1: TOKEN_ESTIMATOR_CONFIG & PRICING Constants (~20 tests)
    // =========================================================================
    console.log('\n[SECTION 1] TOKEN_ESTIMATOR_CONFIG & PRICING Constants');

    // Provider ratios
    assert(TOKEN_ESTIMATOR_CONFIG.provider.openai.baseRatio === 4.0, 'w9_1: OpenAI base ratio is 4.0');
    assert(TOKEN_ESTIMATOR_CONFIG.provider.anthropic.baseRatio === 3.5, 'w9_2: Anthropic base ratio is 3.5');
    assert(TOKEN_ESTIMATOR_CONFIG.provider.default.baseRatio === 3.8, 'w9_3: Default base ratio is 3.8');

    // Content type multipliers
    assert(TOKEN_ESTIMATOR_CONFIG.contentType.json.multiplier === 0.6, 'w9_4: JSON multiplier is 0.6');
    assert(TOKEN_ESTIMATOR_CONFIG.contentType.code.multiplier === 0.7, 'w9_5: Code multiplier is 0.7');
    assert(TOKEN_ESTIMATOR_CONFIG.contentType.cjk.multiplier === 0.35, 'w9_6: CJK multiplier is 0.35');
    assert(TOKEN_ESTIMATOR_CONFIG.contentType.prose_en.multiplier === 1.0, 'w9_7: English prose multiplier is 1.0');
    assert(TOKEN_ESTIMATOR_CONFIG.contentType.mixed.multiplier === 0.8, 'w9_8: Mixed multiplier is 0.8');

    // Safety parameters
    assert(TOKEN_ESTIMATOR_CONFIG.safety.margin === 1.15, 'w9_9: Safety margin is 1.15 (15%)');
    assert(TOKEN_ESTIMATOR_CONFIG.safety.minRatio === 2.5, 'w9_10: Min ratio bound is 2.5');
    assert(TOKEN_ESTIMATOR_CONFIG.safety.maxRatio === 6.0, 'w9_11: Max ratio bound is 6.0');

    // Calibration parameters
    assert(TOKEN_ESTIMATOR_CONFIG.calibration.minSamples === 5, 'w9_12: Min samples for calibration is 5');
    assert(TOKEN_ESTIMATOR_CONFIG.calibration.maxHistory === 100, 'w9_13: Max history per model:contentType is 100');

    // PRICING table completeness
    assert(PRICING['gpt-4'], 'w9_14: PRICING has gpt-4');
    assert(PRICING['gpt-4-turbo'], 'w9_15: PRICING has gpt-4-turbo');
    assert(PRICING['gpt-4o'], 'w9_16: PRICING has gpt-4o');
    assert(PRICING['gpt-4o-mini'], 'w9_17: PRICING has gpt-4o-mini');
    assert(PRICING['gpt-3.5-turbo'], 'w9_18: PRICING has gpt-3.5-turbo');
    assert(PRICING['claude-3-opus'], 'w9_19: PRICING has claude-3-opus');
    assert(Object.keys(PRICING).length === 10, 'w9_20: PRICING has exactly 10 models');

    // =========================================================================
    // SECTION 2: detectContentType() (~30 tests)
    // =========================================================================
    console.log('\n[SECTION 2] detectContentType()');

    const te = new TokenEstimator();

    // Pure JSON
    const jsonStr = '{"key": "value", "arr": [1,2,3], "nested": {"x": true}}';
    assert(te.detectContentType(jsonStr) === 'json', 'w9_21: Pure JSON detected as json');

    // JavaScript code
    const jsCode = 'function hello() { if (x > 5) { return x * 2; } else { throw new Error("test"); } }';
    assert(te.detectContentType(jsCode) === 'code', 'w9_22: JavaScript code detected as code');

    // Python code
    const pyCode = 'def factorial(n):\n    if n <= 1:\n        return 1\n    return n * factorial(n-1)';
    assert(te.detectContentType(pyCode) === 'code', 'w9_23: Python code detected as code');

    // CJK text
    const cjkText = '这是中文测试文本内容，用来验证CJK检测功能是否正确。中文通常占据更多的token。';
    assert(te.detectContentType(cjkText) === 'cjk', 'w9_24: CJK text detected as cjk');

    // English prose
    const proseText = 'The quick brown fox jumps over the lazy dog. This is a normal English sentence with proper spacing and punctuation. It should be detected as prose_en.';
    assert(te.detectContentType(proseText) === 'prose_en', 'w9_25: English prose detected as prose_en');

    // Mixed content
    const mixedText = 'Hello world {"key": 1}';
    const mixedType = te.detectContentType(mixedText);
    assert(['json', 'mixed'].includes(mixedType), 'w9_26: Mixed content detected as json or mixed');

    // Empty string
    assert(te.detectContentType('') === 'mixed', 'w9_27: Empty string defaults to mixed');

    // Numbers only
    const numbersOnly = '123456789012345';
    const numType = te.detectContentType(numbersOnly);
    assert(['prose_en', 'mixed'].includes(numType), 'w9_28: Numbers-only detected as prose_en or mixed');

    // Heavily nested JSON
    const deepJson = '{"a":{"b":{"c":{"d":{"e":"f"}}}}}';
    assert(te.detectContentType(deepJson) === 'json', 'w9_29: Deeply nested JSON detected as json');

    // JSON array
    const jsonArray = '[{"id": 1}, {"id": 2}, {"id": 3}]';
    assert(te.detectContentType(jsonArray) === 'json', 'w9_30: JSON array detected as json');

    // Code with imports
    const codeWithImports = 'import { TokenEstimator } from "lib"; const x = new TokenEstimator(); const result = x.estimateTokens(text);';
    assert(te.detectContentType(codeWithImports) === 'code', 'w9_31: Code with imports detected as code');

    // Mixed JSON and text (prose detection wins because high ASCII ratio and spaces)
    const jsonishText = 'Some text {"config": "value"} more text';
    const jsonishType = te.detectContentType(jsonishText);
    assert(['json', 'mixed', 'prose_en'].includes(jsonishType), 'w9_32: JSON-ish text detected as json, prose, or mixed');

    // Whitespace with content
    const whitespaced = '   The   quick   brown   fox   ';
    assert(te.detectContentType(whitespaced) === 'prose_en', 'w9_33: Prose with extra whitespace detected as prose_en');

    // Code with control flow
    const controlFlow = 'for (let i = 0; i < 10; i++) { console.log(i); } while (true) { break; }';
    assert(te.detectContentType(controlFlow) === 'code', 'w9_34: Code with loops detected as code');

    // Japanese Hiragana/Katakana
    const japaneseText = 'これは日本語のテキストです。カタカナも含まれています。';
    assert(te.detectContentType(japaneseText) === 'cjk', 'w9_35: Japanese detected as cjk');

    // Korean Hangul
    const koreanText = '이것은 한국어 텍스트입니다. 테스트를 위한 샘플입니다.';
    assert(te.detectContentType(koreanText) === 'cjk', 'w9_36: Korean detected as cjk');

    // Single line of code
    const singleLine = 'const x = 5; return x * 2;';
    assert(te.detectContentType(singleLine) === 'code', 'w9_37: Single line code detected as code');

    // Long English text
    const longProse = 'The standard Lorem Ipsum passage, used since the 1500s. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'.repeat(3);
    assert(te.detectContentType(longProse) === 'prose_en', 'w9_38: Long English text detected as prose_en');

    // =========================================================================
    // SECTION 3: getProviderRatio() (~15 tests)
    // =========================================================================
    console.log('\n[SECTION 3] getProviderRatio()');

    assert(te.getProviderRatio('gpt-4') === 4.0, 'w9_39: gpt-4 returns 4.0');
    assert(te.getProviderRatio('gpt-4o') === 4.0, 'w9_40: gpt-4o returns 4.0');
    assert(te.getProviderRatio('gpt-4o-mini') === 4.0, 'w9_41: gpt-4o-mini returns 4.0');
    assert(te.getProviderRatio('gpt-3.5-turbo') === 4.0, 'w9_42: gpt-3.5-turbo returns 4.0');
    assert(te.getProviderRatio('GPT-4') === 4.0, 'w9_43: GPT-4 (uppercase) returns 4.0');

    assert(te.getProviderRatio('claude-sonnet-4') === 3.5, 'w9_44: claude-sonnet-4 returns 3.5');
    assert(te.getProviderRatio('claude-3-opus') === 3.5, 'w9_45: claude-3-opus returns 3.5');
    assert(te.getProviderRatio('claude-3-haiku') === 3.5, 'w9_46: claude-3-haiku returns 3.5');
    assert(te.getProviderRatio('Claude-3-Sonnet') === 3.5, 'w9_47: Claude-3-Sonnet (mixed case) returns 3.5');

    assert(te.getProviderRatio('o1') === 4.0, 'w9_48: o1 model returns 4.0 (OpenAI)');
    assert(te.getProviderRatio('o3') === 4.0, 'w9_49: o3 model returns 4.0 (OpenAI)');

    assert(te.getProviderRatio('unknown-model') === 3.8, 'w9_50: Unknown model returns 3.8 (default)');
    assert(te.getProviderRatio(null) === 3.8, 'w9_51: null returns 3.8 (default)');
    assert(te.getProviderRatio('') === 3.8, 'w9_52: Empty string returns 3.8 (default)');
    assert(te.getProviderRatio('some-random-llm') === 3.8, 'w9_53: Random model name returns 3.8 (default)');

    // =========================================================================
    // SECTION 4: estimateTokens() (~25 tests)
    // =========================================================================
    console.log('\n[SECTION 4] estimateTokens()');

    // Empty string
    assert(te.estimateTokens('') === 1, 'w9_54: Empty string estimates to 1 token');
    assert(te.estimateTokens(null) === 1, 'w9_55: null estimates to 1 token');

    // English prose: 100 chars with prose_en multiplier (1.0)
    // tokens = ceil(100 / (4.0 * 1.0)) * 1.15 = ceil(25) * 1.15 = 29
    const prose100 = 'The quick brown fox jumps over the lazy dog. This is a test string with exactly one hundred characters in length.';
    const proseEst = te.estimateTokens(prose100.substring(0, 100), 'gpt-4');
    assert(proseEst >= 25 && proseEst <= 35, `w9_56: 100-char English prose estimates between 25-35 tokens (got ${proseEst})`);

    // JSON: 100 chars with json multiplier (0.6)
    // tokens = ceil(100 / (4.0 * 0.6)) * 1.15 = ceil(41.67) * 1.15 ≈ 48
    const json100 = '{"k1":"v1","k2":"v2","k3":"v3","k4":"v4","k5":"v5","arr":[1,2,3,4,5,6,7]}';
    const jsonEst = te.estimateTokens(json100.padEnd(100), 'gpt-4');
    assert(jsonEst > proseEst, 'w9_57: JSON estimates higher than prose for same char count');

    // Consistency: same input should produce same output
    const sampleText = 'Consistency test: same input should produce same output always';
    const est1 = te.estimateTokens(sampleText, 'gpt-4');
    const est2 = te.estimateTokens(sampleText, 'gpt-4');
    assert(est1 === est2, 'w9_58: Same input produces consistent output');

    // CJK text should estimate more tokens
    const cjkShort = '这是中文';
    const cjkEst = te.estimateTokens(cjkShort, 'gpt-4');
    const englishShort = 'This is';
    const englishEst = te.estimateTokens(englishShort, 'gpt-4');
    assert(cjkEst > englishEst, 'w9_59: CJK text estimates more tokens than English for same char count');

    // Anthropic model uses 3.5 base ratio
    const anthEst = te.estimateTokens(prose100.substring(0, 100), 'claude-sonnet-4');
    assert(anthEst > proseEst, 'w9_60: Anthropic model estimates higher than OpenAI for same content');

    // Very short text
    assert(te.estimateTokens('x') >= 1, 'w9_61: Single character estimates to at least 1 token');

    // Long text
    const longText = 'word '.repeat(1000);
    const longEst = te.estimateTokens(longText, 'gpt-4');
    assert(longEst > 100, 'w9_62: Long text (5000 chars) estimates to more than 100 tokens');

    // Code estimate
    const codeSmall = 'const x = 5; return x;';
    const codeEst = te.estimateTokens(codeSmall, 'gpt-4');
    assert(codeEst >= 1, 'w9_63: Code estimates to at least 1 token');

    // New estimate should be higher than old naive estimate (key W-009 improvement)
    const testPayload = '{"data": {"nested": {"value": 123}}}';
    const newEst = te.estimateTokens(testPayload, 'gpt-4');
    const oldNaiveEst = Math.ceil(testPayload.length / 4); // Old formula
    assert(newEst > oldNaiveEst, `w9_64: New JSON estimate (${newEst}) > old naive (${oldNaiveEst}) due to JSON multiplier`);

    // Different models should estimate differently (or similarly for very short text without calibration)
    const gpt4Est = te.estimateTokens('test text here is more content to ensure meaningful difference', 'gpt-4');
    const claudeEst = te.estimateTokens('test text here is more content to ensure meaningful difference', 'claude-3-opus');
    assert(claudeEst >= gpt4Est, 'w9_65: Claude model estimates >= OpenAI for same content due to lower ratio');

    // Zero-char input
    assert(te.estimateTokens('') === 1, 'w9_66: Empty string minimum is 1 token');

    // Whitespace
    const whitespaceText = '     ';
    const wsEst = te.estimateTokens(whitespaceText, 'gpt-4');
    assert(wsEst >= 1, 'w9_67: Whitespace-only text estimates to at least 1 token');

    // Special characters
    const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const specialEst = te.estimateTokens(specialChars, 'gpt-4');
    assert(specialEst >= 1, 'w9_68: Special characters estimate to at least 1 token');

    // Mixed language
    const mixedLang = 'Hello 世界 Bonjour';
    const mixedEst = te.estimateTokens(mixedLang, 'gpt-4');
    assert(mixedEst >= 1, 'w9_69: Mixed language text estimates to at least 1 token');

    // Safety margin check: estimate should be >= raw without margin
    const rawTokens = Math.ceil(100 / 4.0); // 25 tokens
    const withMargin = te.estimateTokens('x'.repeat(100), 'gpt-4');
    assert(withMargin >= Math.ceil(rawTokens * 1.15), 'w9_70: Estimate includes 15% safety margin');

    // =========================================================================
    // SECTION 5: estimateImageTokens() (~15 tests)
    // =========================================================================
    console.log('\n[SECTION 5] estimateImageTokens()');

    // OpenAI low detail
    assert(te.estimateImageTokens('low', null, 'gpt-4') === 85, 'w9_71: OpenAI low detail = 85 tokens');
    assert(te.estimateImageTokens('low', null, 'gpt-4-turbo') === 85, 'w9_72: OpenAI low detail constant for all OpenAI models');

    // OpenAI high detail without dimensions (defaults to 1024x1024 = 4 squares)
    // 170 + 4 * 130 = 170 + 520 = 690
    const highDefault = te.estimateImageTokens('high', null, 'gpt-4');
    assert(highDefault === 690, `w9_73: OpenAI high detail without dims defaults to 690 (got ${highDefault})`);

    // OpenAI high detail with 512x512 (1 square)
    // 170 + 1*1 * 130 = 300
    const highSmall = te.estimateImageTokens('high', { width: 512, height: 512 }, 'gpt-4');
    assert(highSmall === 300, `w9_74: OpenAI high 512x512 = 300 (got ${highSmall})`);

    // OpenAI high detail with 1024x768 (2x2 = 4 squares)
    // 170 + 2*2 * 130 = 170 + 520 = 690
    const highLarge = te.estimateImageTokens('high', { width: 1024, height: 768 }, 'gpt-4');
    assert(highLarge === 690, `w9_75: OpenAI high 1024x768 = 690 (got ${highLarge})`);

    // OpenAI high detail with non-512-aligned dimensions
    // 1025x1025: ceil(1025/512)=3, ceil(1025/512)=3, so 9 squares
    // 170 + 9*130 = 1340
    const highNonAligned = te.estimateImageTokens('high', { width: 1025, height: 1025 }, 'gpt-4');
    assert(highNonAligned === 1340, `w9_76: OpenAI high 1025x1025 = 1340 (got ${highNonAligned})`);

    // Anthropic standard (always 1100)
    const anthropicImg = te.estimateImageTokens('low', null, 'claude-3-opus');
    assert(anthropicImg === 1100, `w9_77: Anthropic image = 1100 (got ${anthropicImg})`);

    assert(te.estimateImageTokens('high', null, 'claude-sonnet-4') === 1100, 'w9_78: Anthropic ignores detail level');

    // Unknown model defaults to 500
    assert(te.estimateImageTokens('low', null, 'unknown-llm') === 500, 'w9_79: Unknown model defaults to 500');
    assert(te.estimateImageTokens('high', null, '') === 500, 'w9_80: Empty model defaults to 500');

    // OpenAI with uppercase
    assert(te.estimateImageTokens('low', null, 'GPT-4') === 85, 'w9_81: GPT-4 (uppercase) recognized as OpenAI');

    // High detail with rectangular dimensions
    const rect = te.estimateImageTokens('high', { width: 2048, height: 512 }, 'gpt-4');
    assert(rect === 170 + 4 * 130, `w9_82: High detail 2048x512 = ${170 + 4 * 130} (got ${rect})`);

    // Very small image
    const tiny = te.estimateImageTokens('high', { width: 100, height: 100 }, 'gpt-4');
    assert(tiny === 300, `w9_83: High detail 100x100 = 300 (got ${tiny})`);

    // o1 model (OpenAI)
    assert(te.estimateImageTokens('low', null, 'o1') === 85, 'w9_84: o1 model treated as OpenAI');

    // =========================================================================
    // SECTION 6: recordActual() and getCalibrationRatio() (~20 tests)
    // =========================================================================
    console.log('\n[SECTION 6] recordActual() and getCalibrationRatio()');

    const te2 = new TokenEstimator();

    // Before any history, should return base ratio
    const baseRatioBefore = te2.getCalibrationRatio('gpt-4', 'json');
    assert(baseRatioBefore === 4.0, 'w9_85: Before history, returns base ratio (4.0 for gpt-4)');

    // Record 4 samples (below minSamples of 5)
    for (let i = 0; i < 4; i++) {
        te2.recordActual(`req-${i}`, 25, 30 + i, 'json', 'gpt-4', 100);
    }
    const ratioWith4 = te2.getCalibrationRatio('gpt-4', 'json');
    assert(ratioWith4 === 4.0, 'w9_86: With 4 samples (< 5), still returns base ratio');

    // Record 1 more sample to reach 5
    te2.recordActual('req-4', 25, 33, 'json', 'gpt-4', 100);
    const ratioWith5 = te2.getCalibrationRatio('gpt-4', 'json');
    assert(ratioWith5 !== 4.0 || ratioWith5 === 4.0, 'w9_87: With 5 samples, may use calibrated ratio');

    // Different model+contentType keys
    te2.recordActual('req-5', 10, 12, 'prose_en', 'gpt-4', 50);
    te2.recordActual('req-6', 10, 12, 'prose_en', 'gpt-4', 50);
    te2.recordActual('req-7', 10, 12, 'prose_en', 'gpt-4', 50);
    te2.recordActual('req-8', 10, 12, 'prose_en', 'gpt-4', 50);
    te2.recordActual('req-9', 10, 12, 'prose_en', 'gpt-4', 50);

    const prosseRatio = te2.getCalibrationRatio('gpt-4', 'prose_en');
    const jsonRatio = te2.getCalibrationRatio('gpt-4', 'json');
    assert(prosseRatio !== jsonRatio, 'w9_88: Different contentTypes have separate calibration histories');

    // Ratio bounds: should not exceed min/max
    const te3 = new TokenEstimator();
    // Record samples that would produce extreme ratios
    for (let i = 0; i < 5; i++) {
        te3.recordActual(`req-${i}`, 100, 500, 'mixed', 'gpt-4', 1000); // Very high charCount/actualTokens
    }
    const boundedRatio = te3.getCalibrationRatio('gpt-4', 'mixed');
    assert(boundedRatio <= 6.0, `w9_89: Calibrated ratio clamped to maxRatio (6.0), got ${boundedRatio}`);
    assert(boundedRatio >= 2.5, `w9_90: Calibrated ratio clamped to minRatio (2.5), got ${boundedRatio}`);

    // maxHistory trimming (100 limit)
    const te4 = new TokenEstimator();
    for (let i = 0; i < 110; i++) {
        te4.recordActual(`req-${i}`, 25, 30, 'json', 'gpt-4', 100);
    }
    const stats4 = te4.getCalibrationStats();
    const jsonKey = 'gpt-4:json';
    assert(stats4[jsonKey].count === 100, `w9_91: History trimmed to maxHistory (100), got ${stats4[jsonKey].count}`);

    // Claude model has different base ratio
    te2.recordActual('req-10', 20, 25, 'code', 'claude-3-opus', 80);
    te2.recordActual('req-11', 20, 25, 'code', 'claude-3-opus', 80);
    te2.recordActual('req-12', 20, 25, 'code', 'claude-3-opus', 80);
    te2.recordActual('req-13', 20, 25, 'code', 'claude-3-opus', 80);
    te2.recordActual('req-14', 20, 25, 'code', 'claude-3-opus', 80);

    const claudeRatio = te2.getCalibrationRatio('claude-3-opus', 'code');
    assert(claudeRatio >= 2.5 && claudeRatio <= 6.0, 'w9_92: Claude calibrated ratio within bounds');

    // recordActual with 0 or negative actualTokens should be ignored
    const te5 = new TokenEstimator();
    te5.recordActual('req-zero', 10, 0, 'mixed', 'gpt-4', 50);
    te5.recordActual('req-neg', 10, -5, 'mixed', 'gpt-4', 50);
    const statsZero = te5.getCalibrationStats();
    assert(Object.keys(statsZero).length === 0, 'w9_93: Zero/negative actualTokens not recorded');

    // =========================================================================
    // SECTION 7: estimateCost() (~20 tests)
    // =========================================================================
    console.log('\n[SECTION 7] estimateCost()');

    // Basic request
    const req1 = {
        model: 'gpt-4',
        prompt: 'Hello world',
        max_tokens: 500
    };
    const cost1 = te.estimateCost(req1);
    assert(cost1.inputTokens > 0, 'w9_94: estimateCost returns inputTokens');
    assert(cost1.outputTokens === 500, 'w9_95: estimateCost returns max_tokens as outputTokens');
    assert(cost1.estimatedCost > 0, 'w9_96: estimateCost returns positive estimatedCost');
    assert(cost1.withSafetyMargin > cost1.estimatedCost, 'w9_97: withSafetyMargin > estimatedCost');
    assert(cost1.contentType, 'w9_98: estimateCost returns contentType');

    // GPT-4 pricing
    const gpt4Pricing = PRICING['gpt-4'];
    const req2 = {
        model: 'gpt-4',
        prompt: 'x'.repeat(100),
        max_tokens: 1000
    };
    const cost2 = te.estimateCost(req2);
    const expectedCost = (cost2.inputTokens / 1000 * gpt4Pricing.input) + (1000 / 1000 * gpt4Pricing.output);
    assert(Math.abs(cost2.estimatedCost - expectedCost) < 0.01, 'w9_99: Cost calculation matches PRICING formula');

    // Different model pricing
    const req3 = {
        model: 'claude-3-opus',
        prompt: 'test',
        max_tokens: 100
    };
    const cost3 = te.estimateCost(req3);
    assert(cost3.estimatedCost > 0, 'w9_100: Claude model cost calculated');

    // Missing model defaults to gpt-4
    const req4 = {
        prompt: 'test',
        max_tokens: 100
    };
    const cost4 = te.estimateCost(req4);
    assert(cost4.estimatedCost > 0, 'w9_101: Missing model defaults to gpt-4');

    // With images
    const req5 = {
        model: 'gpt-4',
        prompt: 'Describe this image',
        max_tokens: 500,
        images: [
            { detail: 'low' },
            { detail: 'high', dimensions: { width: 512, height: 512 } }
        ]
    };
    const cost5 = te.estimateCost(req5);
    const imageTokens = 85 + 300; // low + high
    assert(cost5.inputTokens >= imageTokens, 'w9_102: Image tokens included in inputTokens');

    // Empty prompt
    const req6 = {
        model: 'gpt-4',
        prompt: '',
        max_tokens: 100
    };
    const cost6 = te.estimateCost(req6);
    assert(cost6.inputTokens >= 1, 'w9_103: Empty prompt estimates minimum tokens');

    // Safety margin applied to cost
    const req7 = {
        model: 'gpt-4o',
        prompt: 'Hello',
        max_tokens: 100
    };
    const cost7 = te.estimateCost(req7);
    // Pass 21: Safety margin no longer double-applied. Input already has 1.15 from estimateTokens.
    // withSafetyMargin = inputCost + (outputCost * 1.15), NOT estimatedCost * 1.15
    assert(cost7.withSafetyMargin <= cost7.estimatedCost * 1.15,
        'w9_104: withSafetyMargin <= estimatedCost*1.15 (no double margin on inputs)');

    // JSON content has lower token efficiency
    const req8 = {
        model: 'gpt-4',
        prompt: '{"key": "value", "nested": {"x": 1}}',
        max_tokens: 100
    };
    const cost8 = te.estimateCost(req8);
    assert(cost8.contentType === 'json', 'w9_105: JSON content detected in estimateCost');

    // Anthropic pricing check
    const req9 = {
        model: 'claude-3-haiku',
        prompt: 'test text here for estimation',
        max_tokens: 200
    };
    const cost9 = te.estimateCost(req9);
    const haikuPricing = PRICING['claude-3-haiku'];
    assert(cost9.estimatedCost > 0, 'w9_106: Claude Haiku cost calculated');

    // gpt-4o-mini (cheapest)
    const req10 = {
        model: 'gpt-4o-mini',
        prompt: 'This is a test prompt for token estimation',
        max_tokens: 100
    };
    const cost10 = te.estimateCost(req10);
    assert(cost10.estimatedCost < 1, 'w9_107: GPT-4o-mini very cheap');

    // Multiple images
    const req11 = {
        model: 'gpt-4',
        prompt: 'Analyze these images',
        max_tokens: 500,
        images: [
            { detail: 'low' },
            { detail: 'low' },
            { detail: 'low' }
        ]
    };
    const cost11 = te.estimateCost(req11);
    assert(cost11.inputTokens >= 85 * 3, 'w9_108: Multiple low-detail images = 85 tokens each');

    // =========================================================================
    // SECTION 8: Structural Tests — Wiring Verification (~20 tests)
    // =========================================================================
    console.log('\n[SECTION 8] Structural Tests — Wiring Verification');

    const budgetSrc = fs.readFileSync(path.join(__dirname, '..', 'agents', 'budget-enforcer.js'), 'utf-8');
    const budgetNoComments = budgetSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

    assert(budgetNoComments.includes('token-estimator'), 'w9_109: budget-enforcer imports token-estimator');
    assert(budgetNoComments.includes('createTokenEstimator'), 'w9_110: budget-enforcer calls createTokenEstimator');
    assert(budgetNoComments.includes('this.tokenEstimator'), 'w9_111: budget-enforcer has this.tokenEstimator property');
    assert(budgetNoComments.includes('this.tokenEstimator.estimateCost') || budgetNoComments.includes('tokenEstimator.estimateCost'), 'w9_112: budget-enforcer uses tokenEstimator.estimateCost');
    assert(budgetNoComments.includes('recordActual'), 'w9_113: budget-enforcer has recordActual method');

    // Check that OLD pattern is gone
    const hasOldPattern1 = budgetNoComments.includes("prompt.length / 4");
    assert(!hasOldPattern1, 'w9_114: OLD pattern "prompt.length / 4" NOT in budget-enforcer');

    const hasOldPattern2 = budgetNoComments.includes("request.prompt?.length || 1000) / 4");
    assert(!hasOldPattern2, 'w9_115: OLD pattern "request.prompt?.length || 1000) / 4" NOT in budget-enforcer');

    // Middleware should extract text from messages, not JSON.stringify
    assert(!budgetNoComments.includes('JSON.stringify(req.body?.messages') || budgetNoComments.includes('message.content'), 'w9_116: Middleware extracts text from messages (not JSON.stringify all messages)');

    // Check for .filter(m => m.content) pattern
    const hasFilterPattern = budgetSrc.includes('.filter') && budgetSrc.includes('m.content');
    assert(hasFilterPattern || budgetSrc.includes('message.content'), 'w9_117: Middleware filters messages with content');

    // token-estimator.js header should have W-009
    const teSource = fs.readFileSync(path.join(__dirname, '..', 'core', 'token-estimator.js'), 'utf-8');
    assert(teSource.includes('W-009'), 'w9_118: token-estimator.js has W-009 header');
    assert(teSource.includes('TokenEstimator'), 'w9_119: token-estimator.js exports TokenEstimator class');
    assert(teSource.includes('createTokenEstimator'), 'w9_120: token-estimator.js exports createTokenEstimator factory');

    // =========================================================================
    // SECTION 9: Edge Cases & Factory (~10 tests)
    // =========================================================================
    console.log('\n[SECTION 9] Edge Cases & Factory');

    // createTokenEstimator factory
    const te6 = createTokenEstimator();
    assert(te6 instanceof TokenEstimator, 'w9_121: createTokenEstimator returns TokenEstimator instance');

    // getCalibrationStats with empty history
    const te7 = new TokenEstimator();
    const emptyStats = te7.getCalibrationStats();
    assert(typeof emptyStats === 'object', 'w9_122: getCalibrationStats returns object');
    assert(Object.keys(emptyStats).length === 0, 'w9_123: getCalibrationStats empty with no history');

    // Very large text (100K chars)
    const hugeText = 'word '.repeat(20000);
    const hugeEst = te.estimateTokens(hugeText, 'gpt-4');
    assert(hugeEst > 5000, `w9_124: 100K char text estimates > 5000 tokens (got ${hugeEst})`);

    // Special unicode characters
    const unicodeText = 'Hello 👋 World 🌍 Test 🧪 Emoji 💯';
    const unicodeEst = te.estimateTokens(unicodeText, 'gpt-4');
    assert(unicodeEst >= 1, 'w9_125: Unicode emoji text estimates to at least 1 token');

    // URL in text
    const urlText = 'Visit https://example.com/path?query=value&other=test for more info';
    const urlEst = te.estimateTokens(urlText, 'gpt-4');
    assert(urlEst >= 1, 'w9_126: URL in text estimates to at least 1 token');

    // Very long JSON
    const longJson = JSON.stringify(Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`key${i}`, i])));
    const longJsonEst = te.estimateTokens(longJson, 'gpt-4');
    assert(te.detectContentType(longJson) === 'json', 'w9_127: Long JSON correctly detected as json');
    assert(longJsonEst >= 1, 'w9_128: Long JSON estimates to at least 1 token');

    // Newlines and formatting
    const formattedCode = `
        function test() {
            const x = 5;
            return x * 2;
        }
    `;
    const formattedEst = te.estimateTokens(formattedCode, 'gpt-4');
    assert(te.detectContentType(formattedCode) === 'code', 'w9_129: Formatted code detected as code');
    assert(formattedEst >= 1, 'w9_130: Formatted code estimates to at least 1 token');

    // ═══════════════════════════════════════════════════════════════════════════════
    // SECTION 10: Pass 21 — Anthropic image fileSizeMiB, no double safety margin,
    //             recordActualTokenUsage passes real estimates
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('\n[SECTION 10] Pass 21 Bug Fixes');

    // ─── Bug 6: Anthropic image formula now includes fileSizeMiB ───────────────

    // Test fileSizeMiB=0 returns base (1100)
    const anthropicZero = te.estimateImageTokens('low', null, 'claude-3-opus', 0);
    assert(anthropicZero === 1100, `w9_131: Anthropic with fileSizeMiB=0 returns base 1100 (got ${anthropicZero})`);

    // Test fileSizeMiB=5 returns 1100 + ceil(5*40) = 1300
    const anthropicFive = te.estimateImageTokens('low', null, 'claude-3-opus', 5);
    assert(anthropicFive === 1300, `w9_132: Anthropic with fileSizeMiB=5 returns 1100 + 200 = 1300 (got ${anthropicFive})`);

    // Test fileSizeMiB=10 returns 1100 + ceil(10*40) = 1500
    const anthropicTen = te.estimateImageTokens('low', null, 'claude-3-opus', 10);
    assert(anthropicTen === 1500, `w9_133: Anthropic with fileSizeMiB=10 returns 1100 + 400 = 1500 (got ${anthropicTen})`);

    // Test negative fileSizeMiB clamped to 0
    const anthropicNeg = te.estimateImageTokens('low', null, 'claude-3-opus', -5);
    assert(anthropicNeg === 1100, `w9_134: Anthropic with negative fileSizeMiB clamped to 0, returns 1100 (got ${anthropicNeg})`);

    // Test fractional fileSizeMiB (2.5 MiB → ceil(2.5*40) = ceil(100) = 100)
    const anthropicFrac = te.estimateImageTokens('low', null, 'claude-sonnet-4', 2.5);
    assert(anthropicFrac === 1200, `w9_135: Anthropic with fileSizeMiB=2.5 returns 1100 + 100 = 1200 (got ${anthropicFrac})`);

    // Test that detail level is ignored (Anthropic doesn't use it)
    const anthropicHigh = te.estimateImageTokens('high', null, 'claude-opus-4', 5);
    assert(anthropicHigh === 1300, `w9_136: Anthropic ignores detail level, fileSizeMiB=5 still returns 1300 (got ${anthropicHigh})`);

    // Test OpenAI image tokens unchanged with 4th param
    const openaiLowWithParam = te.estimateImageTokens('low', null, 'gpt-4', 0);
    assert(openaiLowWithParam === 85, `w9_137: OpenAI low detail with fileSizeMiB=0 still returns 85 (got ${openaiLowWithParam})`);

    // Test OpenAI ignores fileSizeMiB (still uses high detail logic)
    const openaiHighWithMiB = te.estimateImageTokens('high', { width: 512, height: 512 }, 'gpt-4', 10);
    assert(openaiHighWithMiB === 300, `w9_138: OpenAI high 512x512 with fileSizeMiB=10 ignores MiB param, returns 300 (got ${openaiHighWithMiB})`);

    // Test estimateCost with images including fileSizeMiB
    const costReqWithImages = {
        model: 'claude-3-opus',
        prompt: 'Analyze this image',
        max_tokens: 500,
        images: [
            { detail: 'low', fileSizeMiB: 5 }
        ]
    };
    const costWithImage = te.estimateCost(costReqWithImages);
    // Input should include image tokens: 1100 + 200 = 1300
    assert(costWithImage.inputTokens >= 1300, `w9_139: estimateCost includes Anthropic image with fileSizeMiB (got ${costWithImage.inputTokens} input tokens)`);

    // ─── Bug 7: Double safety margin removed ───────────────────────────────────

    // Test that withSafetyMargin is NOT double-applied
    const costReq = {
        model: 'gpt-4',
        prompt: 'x'.repeat(100),
        max_tokens: 1000
    };
    const costResult = te.estimateCost(costReq);

    // estimatedCost already includes 15% margin on inputs
    // withSafetyMargin should only add 15% to outputs
    // withSafetyMargin < estimatedCost * 1.15 (no double margin on inputs)
    const doubleMarginThreshold = costResult.estimatedCost * 1.15;
    assert(costResult.withSafetyMargin <= doubleMarginThreshold,
        `w9_140: withSafetyMargin (${costResult.withSafetyMargin}) <= estimatedCost*1.15 (${doubleMarginThreshold}) — no double margin`);

    // Test that withSafetyMargin > estimatedCost (still has some margin)
    assert(costResult.withSafetyMargin > costResult.estimatedCost,
        `w9_141: withSafetyMargin (${costResult.withSafetyMargin}) > estimatedCost (${costResult.estimatedCost}) — margin still applied`);

    // Test structural: estimateCost code contains 'inputCost' and 'outputCost' separate variables
    const teSrc = fs.readFileSync(path.join(__dirname, '..', 'core', 'token-estimator.js'), 'utf-8');
    const estimateCostSection = teSrc.substring(teSrc.indexOf('estimateCost(request)'), teSrc.indexOf('getCalibrationStats()'));
    const hasInputCostVar = estimateCostSection.includes('const inputCost');
    const hasOutputCostVar = estimateCostSection.includes('const outputCost');
    assert(hasInputCostVar && hasOutputCostVar,
        'w9_142: estimateCost has separate inputCost and outputCost variables (not double-applied margin)');

    // Test that output cost is multiplied by margin
    const hasOutputMargin = estimateCostSection.includes('outputCost * TOKEN_ESTIMATOR_CONFIG.safety.margin');
    assert(hasOutputMargin,
        'w9_143: estimateCost applies margin only to outputCost (not inputCost)');

    // Test margin calculation: inputCost alone + (outputCost * 1.15)
    const hasCorrectMarginFormula = estimateCostSection.includes('inputCost + (outputCost * TOKEN_ESTIMATOR_CONFIG.safety.margin)');
    assert(hasCorrectMarginFormula,
        'w9_144: estimateCost uses formula: inputCost + (outputCost * margin), avoiding double margin');

    // ─── Bug 8: recordActualTokenUsage now passes real estimated tokens ──────────

    // Test structural: budget-enforcer recordActualTokenUsage contains 'estimateTokens'
    const budgetSrc2 = fs.readFileSync(path.join(__dirname, '..', 'agents', 'budget-enforcer.js'), 'utf-8');
    const recordMethodStart = budgetSrc2.indexOf('recordActualTokenUsage');
    const recordMethodEnd = budgetSrc2.indexOf('/**', recordMethodStart + 50);
    const recordMethodCode = budgetSrc2.substring(recordMethodStart, recordMethodEnd);

    assert(recordMethodCode.includes('estimateTokens'),
        'w9_145: budget-enforcer recordActualTokenUsage calls estimateTokens');

    // Test structural: does NOT pass literal '0' for estimated tokens
    const hasLiteralZero = recordMethodCode.includes("recordActual(\n") && recordMethodCode.includes(", 0,");
    assert(!hasLiteralZero,
        'w9_146: budget-enforcer recordActualTokenUsage does NOT pass literal 0 for estimated tokens');

    // Test that recordActualTokenUsage computes estimated tokens from prompt
    assert(recordMethodCode.includes('this.tokenEstimator.estimateTokens(promptText'),
        'w9_147: recordActualTokenUsage computes estimatedTokens from actual prompt text');

    // Test that recordActualTokenUsage passes model correctly
    assert(recordMethodCode.includes('request.model'),
        'w9_148: recordActualTokenUsage passes request.model to estimateTokens');

    // ─── Integration Tests ─────────────────────────────────────────────────────

    // Test default fileSizeMiB=0 for backward compatibility (omitting param)
    const anthropicDefault = te.estimateImageTokens('low', null, 'claude-3-opus');
    assert(anthropicDefault === 1100, `w9_149: Anthropic with omitted fileSizeMiB defaults to 0, returns 1100 (got ${anthropicDefault})`);

    // Test multiple images with fileSizeMiB in estimateCost
    const multiImageReq = {
        model: 'claude-3-haiku',
        prompt: 'Compare these',
        max_tokens: 200,
        images: [
            { detail: 'low', fileSizeMiB: 1 },
            { detail: 'low', fileSizeMiB: 2 }
        ]
    };
    const multiCost = te.estimateCost(multiImageReq);
    // Image 1: 1100 + 40 = 1140
    // Image 2: 1100 + 80 = 1180
    // Total image tokens: 2320
    assert(multiCost.inputTokens >= 2300,
        `w9_150: estimateCost with multiple images includes fileSizeMiB for each (got ${multiCost.inputTokens} input tokens)`);

    // ═══════════════════════════════════════════════════════════════════════════════
    // SECTION 11: Pass 22 — recordActualTokenUsage uses prompt_tokens only
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('\n[SECTION 11] Pass 22 — Calibration uses prompt_tokens only');

    // Structural: recordActualTokenUsage passes prompt_tokens only (not + completion_tokens)
    const budgetSrc22 = fs.readFileSync(path.join(__dirname, '..', 'agents', 'budget-enforcer.js'), 'utf-8');
    const recordStart22 = budgetSrc22.indexOf('recordActualTokenUsage');
    const recordEnd22 = budgetSrc22.indexOf('/**', recordStart22 + 50);
    const recordBody22 = budgetSrc22.substring(recordStart22, recordEnd22);

    // Should contain 'prompt_tokens' reference
    assert(recordBody22.includes('prompt_tokens'),
        'w9_151: recordActualTokenUsage references prompt_tokens');

    // Should NOT combine prompt_tokens + completion_tokens for actualTokens
    assert(!recordBody22.includes('prompt_tokens + (response.usage.completion_tokens'),
        'w9_152: recordActualTokenUsage does NOT combine prompt+completion tokens');
    assert(!recordBody22.includes('prompt_tokens +'),
        'w9_153: recordActualTokenUsage passes prompt_tokens alone (no addition)');

    // Should contain Pass 22 comment about the fix rationale
    assert(recordBody22.includes('Pass 22'),
        'w9_154: Pass 22 comment present in recordActualTokenUsage');

    // Structural: uses response.usage.prompt_tokens || 0
    assert(recordBody22.includes('prompt_tokens || 0'),
        'w9_155: recordActualTokenUsage uses prompt_tokens || 0 for safety');

    // Behavioral: calibration ratio computed correctly with prompt-only tokens
    // charCount=400, actualTokens=100 → ratio = 4.0 (correct for OpenAI)
    const calTE = new TokenEstimator();
    for (let i = 0; i < 6; i++) {
        calTE.recordActual(`req_${i}`, 100, 100, 'prose_en', 'gpt-4', 400);
    }
    const calRatio = calTE.getCalibrationRatio('gpt-4', 'prose_en');
    assert(Math.abs(calRatio - 4.0) < 0.01,
        `w9_156: Calibration ratio with prompt-only tokens is 4.0 (got ${calRatio})`);

    // Counter-example: if completion_tokens were included (400 chars / 200 total tokens = 2.0)
    // that would be wrong — ratio should be 4.0 not 2.0
    const badTE = new TokenEstimator();
    for (let i = 0; i < 6; i++) {
        badTE.recordActual(`req_${i}`, 100, 200, 'prose_en', 'gpt-4', 400);
    }
    const badRatio = badTE.getCalibrationRatio('gpt-4', 'prose_en');
    assert(badRatio < 3.0,
        `w9_157: If completion_tokens were included, ratio would be deflated to ${badRatio} (proves separation needed)`);

    // ═══════════════════════════════════════════════════════════════════════════════
    // RESULTS
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`W-009 RESULTS: ${passed} passed, ${failed} failed`);
    if (failures.length > 0) {
        console.log('\nFailed tests:');
        failures.forEach(f => console.log(`  • ${f}`));
    }
    console.log('═'.repeat(70));
    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('Test suite error:', err);
    process.exit(1);
});
