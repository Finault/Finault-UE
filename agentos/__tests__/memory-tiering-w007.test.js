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
    console.log('W-007 MEMORY TIERING TEST SUITE');
    console.log('═'.repeat(70));

    const { MemoryTiering, SeasonalPatternStore, MEMORY_TIERS, TIER_CONFIG, createMemoryTiering, createSeasonalPatternStore } = await import(path.join(__dirname, '..', 'core', 'memory-tiering.js'));

    // =========================================================================
    // SECTION 1: MEMORY_TIERS & TIER_CONFIG Constants (~20 tests)
    // =========================================================================
    console.log('\n[SECTION 1] MEMORY_TIERS & TIER_CONFIG Constants');

    assert(typeof MEMORY_TIERS === 'object', 'w7_1: MEMORY_TIERS is an object');
    assert(MEMORY_TIERS.WORKING === 'working', 'w7_2: MEMORY_TIERS.WORKING === "working"');
    assert(MEMORY_TIERS.EPISODIC === 'episodic', 'w7_3: MEMORY_TIERS.EPISODIC === "episodic"');
    assert(MEMORY_TIERS.CRYSTALLIZED === 'crystallized', 'w7_4: MEMORY_TIERS.CRYSTALLIZED === "crystallized"');

    assert(typeof TIER_CONFIG === 'object', 'w7_5: TIER_CONFIG is an object');
    assert(TIER_CONFIG.working, 'w7_6: TIER_CONFIG.working exists');
    assert(TIER_CONFIG.episodic, 'w7_7: TIER_CONFIG.episodic exists');
    assert(TIER_CONFIG.crystallized, 'w7_8: TIER_CONFIG.crystallized exists');

    // WORKING tier config
    assert(TIER_CONFIG.working.decayRate === 0.95, 'w7_9: WORKING decayRate is 0.95 (5% daily)');
    assert(TIER_CONFIG.working.ttlDays === 30, 'w7_10: WORKING ttlDays is 30');
    assert(TIER_CONFIG.working.minImportance === 0.05, 'w7_11: WORKING minImportance is 0.05');
    assert(TIER_CONFIG.working.requiresReinforcement === false, 'w7_12: WORKING requiresReinforcement is false');

    // EPISODIC tier config
    assert(TIER_CONFIG.episodic.decayRate === 0.995, 'w7_13: EPISODIC decayRate is 0.995 (0.5% daily)');
    assert(TIER_CONFIG.episodic.ttlDays === null, 'w7_14: EPISODIC ttlDays is null');
    assert(TIER_CONFIG.episodic.minImportance === 0.15, 'w7_15: EPISODIC minImportance is 0.15');
    assert(TIER_CONFIG.episodic.requiresReinforcement === true, 'w7_16: EPISODIC requiresReinforcement is true');
    assert(TIER_CONFIG.episodic.reinforcementBoost === 0.1, 'w7_17: EPISODIC reinforcementBoost is 0.1');

    // CRYSTALLIZED tier config
    assert(TIER_CONFIG.crystallized.decayRate === 1.0, 'w7_18: CRYSTALLIZED decayRate is 1.0 (no decay)');
    assert(TIER_CONFIG.crystallized.ttlDays === null, 'w7_19: CRYSTALLIZED ttlDays is null');
    assert(TIER_CONFIG.crystallized.minImportance === 0.3, 'w7_20: CRYSTALLIZED minImportance is 0.3');

    // =========================================================================
    // SECTION 2: classifyTier() (~25 tests)
    // =========================================================================
    console.log('\n[SECTION 2] classifyTier() Method');

    const tiering = new MemoryTiering();

    // CRYSTALLIZED classification
    assert(tiering.classifyTier({
        importance: 0.9,
        memory_type: 'insight',
        validation_count: 3
    }) === 'crystallized', 'w7_21: insight with importance=0.9, validation_count=3 → CRYSTALLIZED');

    assert(tiering.classifyTier({
        importance: 0.95,
        memory_type: 'pattern',
        validation_count: 3
    }) === 'crystallized', 'w7_22: pattern with importance=0.95, validation_count=3 → CRYSTALLIZED');

    assert(tiering.classifyTier({
        importance: 0.9,
        memory_type: 'fact',
        validation_count: 5
    }) === 'crystallized', 'w7_23: fact with importance=0.9, validation_count=5 → CRYSTALLIZED');

    assert(tiering.classifyTier({
        importance: 0.9,
        memory_type: 'decision',
        validation_count: 3
    }) === 'crystallized', 'w7_24: decision with importance=0.9, validation_count=3 → CRYSTALLIZED');

    // CRYSTALLIZED boundary: exactly 0.9 importance
    assert(tiering.classifyTier({
        importance: 0.9,
        memory_type: 'insight',
        validation_count: 3
    }) === 'crystallized', 'w7_25: importance exactly 0.9 → CRYSTALLIZED (at boundary)');

    // CRYSTALLIZED fails if below 0.9
    assert(tiering.classifyTier({
        importance: 0.89,
        memory_type: 'insight',
        validation_count: 3
    }) === 'episodic', 'w7_26: importance 0.89 (below 0.9) → EPISODIC');

    // CRYSTALLIZED fails if validation_count < 3
    assert(tiering.classifyTier({
        importance: 0.9,
        memory_type: 'insight',
        validation_count: 2
    }) === 'episodic', 'w7_27: importance=0.9 but validation_count=2 → EPISODIC');

    // CRYSTALLIZED fails if type not in crystallizable list
    assert(tiering.classifyTier({
        importance: 0.9,
        memory_type: 'context',
        validation_count: 3
    }) === 'episodic', 'w7_28: importance=0.9 but type="context" (not crystallizable) → EPISODIC');

    // EPISODIC classification
    assert(tiering.classifyTier({
        importance: 0.6,
        memory_type: 'context'
    }) === 'episodic', 'w7_29: context with importance=0.6 → EPISODIC');

    assert(tiering.classifyTier({
        importance: 0.7,
        memory_type: 'outcome'
    }) === 'episodic', 'w7_30: outcome with importance=0.7 → EPISODIC');

    assert(tiering.classifyTier({
        importance: 0.8,
        memory_type: 'preference'
    }) === 'episodic', 'w7_31: preference with importance=0.8 → EPISODIC');

    // EPISODIC boundary: exactly 0.6
    assert(tiering.classifyTier({
        importance: 0.6,
        memory_type: 'context'
    }) === 'episodic', 'w7_32: importance exactly 0.6 → EPISODIC (at boundary)');

    // WORKING classification (below 0.6)
    assert(tiering.classifyTier({
        importance: 0.5,
        memory_type: 'context'
    }) === 'working', 'w7_33: importance 0.5 → WORKING');

    assert(tiering.classifyTier({
        importance: 0.1,
        memory_type: 'context'
    }) === 'working', 'w7_34: importance 0.1 → WORKING');

    // Null memory returns WORKING
    assert(tiering.classifyTier(null) === 'working', 'w7_35: null memory → WORKING');

    // Missing importance field
    assert(tiering.classifyTier({
        memory_type: 'context'
    }) === 'working', 'w7_36: missing importance field → WORKING (defaults to 0)');

    // Missing memory_type field
    assert(tiering.classifyTier({
        importance: 0.7
    }) === 'episodic', 'w7_37: missing memory_type field → EPISODIC (0 for validation)');

    // Missing validation_count
    assert(tiering.classifyTier({
        importance: 0.9,
        memory_type: 'insight'
    }) === 'episodic', 'w7_38: importance=0.9 but missing validation_count → EPISODIC');

    // Empty object
    assert(tiering.classifyTier({}) === 'working', 'w7_39: empty object {} → WORKING');

    // =========================================================================
    // SECTION 3: computeDecay() (~30 tests)
    // =========================================================================
    console.log('\n[SECTION 3] computeDecay() Method');

    // CRYSTALLIZED tier: no decay
    assert(tiering.computeDecay({
        importance: 0.8,
        created_at: new Date().toISOString()
    }, 'crystallized') === 0.8, 'w7_40: CRYSTALLIZED tier returns importance unchanged');

    // EPISODIC decay: 0.5% per day
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const episodicDecayed = tiering.computeDecay({
        importance: 1.0,
        created_at: fiveDaysAgo.toISOString()
    }, 'episodic');
    const expectedEpisodic = 1.0 * Math.pow(0.995, 5);
    assert(Math.abs(episodicDecayed - expectedEpisodic) < 0.001, 'w7_41: EPISODIC decay 0.995^5 is correct');

    // WORKING decay: 5% per day
    const workingDecayed = tiering.computeDecay({
        importance: 1.0,
        created_at: fiveDaysAgo.toISOString()
    }, 'working');
    const expectedWorking = 1.0 * Math.pow(0.95, 5);
    assert(Math.abs(workingDecayed - expectedWorking) < 0.001, 'w7_42: WORKING decay 0.95^5 is correct');

    // WORKING with large day count (365 days)
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const yearDecay = tiering.computeDecay({
        importance: 1.0,
        created_at: oneYearAgo.toISOString()
    }, 'working');
    assert(yearDecay > 0 && yearDecay <= 1.0, 'w7_43: WORKING 365-day decay is positive');

    // WORKING decay floors at minImportance
    const heavyDecay = tiering.computeDecay({
        importance: 0.1,
        created_at: oneYearAgo.toISOString()
    }, 'working');
    assert(heavyDecay >= TIER_CONFIG.working.minImportance, 'w7_44: WORKING decay floors at minImportance (0.05)');

    // EPISODIC decay floors at minImportance
    const episodicHeavy = tiering.computeDecay({
        importance: 0.15,
        created_at: oneYearAgo.toISOString()
    }, 'episodic');
    assert(episodicHeavy >= TIER_CONFIG.episodic.minImportance, 'w7_45: EPISODIC decay floors at minImportance (0.15)');

    // 0 days passed: returns original importance
    const now = new Date();
    const zeroDecay = tiering.computeDecay({
        importance: 0.7,
        created_at: now.toISOString()
    }, 'episodic');
    assert(zeroDecay === 0.7, 'w7_46: 0 days passed returns unchanged importance');

    // last_decay_date takes precedence over created_at
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const oneDay = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    const withDecayDate = tiering.computeDecay({
        importance: 1.0,
        created_at: twoDaysAgo.toISOString(),
        last_decay_date: oneDay.toISOString()
    }, 'episodic');
    const expectedOne = 1.0 * Math.pow(0.995, 1);
    assert(Math.abs(withDecayDate - expectedOne) < 0.001, 'w7_47: last_decay_date takes precedence over created_at');

    // Null memory returns 0
    assert(tiering.computeDecay(null, 'working') === 0, 'w7_48: null memory returns 0');

    // Missing importance returns 0
    assert(tiering.computeDecay({
        created_at: new Date().toISOString()
    }, 'working') === 0, 'w7_49: missing importance returns 0');

    // Invalid tier falls back to importance
    assert(tiering.computeDecay({
        importance: 0.7,
        created_at: new Date().toISOString()
    }, 'invalid_tier') === 0.7, 'w7_50: invalid tier returns original importance');

    // lastDecayDate parameter (Date object)
    const dateOverride = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const withDateParam = tiering.computeDecay({
        importance: 1.0,
        created_at: new Date().toISOString()
    }, 'episodic', dateOverride);
    const expectedThree = 1.0 * Math.pow(0.995, 3);
    assert(Math.abs(withDateParam - expectedThree) < 0.001, 'w7_51: lastDecayDate parameter (Date) overrides created_at');

    // lastDecayDate parameter (ISO string)
    const isoOverride = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
    const withIsoParam = tiering.computeDecay({
        importance: 1.0,
        created_at: new Date().toISOString()
    }, 'episodic', isoOverride);
    const expectedFour = 1.0 * Math.pow(0.995, 4);
    assert(Math.abs(withIsoParam - expectedFour) < 0.001, 'w7_52: lastDecayDate parameter (ISO string) overrides created_at');

    // Note: computeDecay doesn't modify importance > 1.0 since Math.min(1.0, decayed) only applies to decayed results
    // CRYSTALLIZED returns original importance unchanged when decayRate = 1.0
    const upDecay = tiering.computeDecay({
        importance: 1.5,
        created_at: new Date().toISOString()
    }, 'crystallized');
    assert(upDecay === 1.5, 'w7_53: CRYSTALLIZED returns original importance unchanged (1.5)');

    // =========================================================================
    // SECTION 4: shouldDelete() (~20 tests)
    // =========================================================================
    console.log('\n[SECTION 4] shouldDelete() Method');

    // CRYSTALLIZED: never delete
    assert(tiering.shouldDelete({
        importance: 0.01,
        created_at: oneYearAgo.toISOString()
    }, 'crystallized') === false, 'w7_54: CRYSTALLIZED never deletes (even low importance, old)');

    // WORKING: delete when importance < 0.05 AND age > 30
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    assert(tiering.shouldDelete({
        importance: 0.04,
        created_at: fortyDaysAgo.toISOString()
    }, 'working') === true, 'w7_55: WORKING deletes at importance=0.04, age=40 days');

    // WORKING: doesn't delete if importance >= minImportance
    assert(tiering.shouldDelete({
        importance: 0.05,
        created_at: fortyDaysAgo.toISOString()
    }, 'working') === false, 'w7_56: WORKING doesn\'t delete at importance=0.05 (at minImportance)');

    // WORKING: doesn't delete if age <= 30
    const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    assert(tiering.shouldDelete({
        importance: 0.01,
        created_at: twentyDaysAgo.toISOString()
    }, 'working') === false, 'w7_57: WORKING doesn\'t delete at importance=0.01, age=20 days (within TTL)');

    // WORKING: boundary test, importance exactly at minImportance
    assert(tiering.shouldDelete({
        importance: 0.05,
        created_at: fortyDaysAgo.toISOString()
    }, 'working') === false, 'w7_58: WORKING boundary: importance exactly 0.05 (not deleted)');

    // WORKING: boundary test, age exactly at TTL
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    assert(tiering.shouldDelete({
        importance: 0.01,
        created_at: thirtyDaysAgo.toISOString()
    }, 'working') === false, 'w7_59: WORKING boundary: age exactly 30 days (not deleted)');

    // EPISODIC: delete when importance < 0.15 AND age > 365
    const eightYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000);
    assert(tiering.shouldDelete({
        importance: 0.14,
        created_at: eightYearsAgo.toISOString()
    }, 'episodic') === true, 'w7_60: EPISODIC deletes at importance=0.14, age=730 days');

    // EPISODIC: doesn't delete if importance >= minImportance
    assert(tiering.shouldDelete({
        importance: 0.15,
        created_at: eightYearsAgo.toISOString()
    }, 'episodic') === false, 'w7_61: EPISODIC doesn\'t delete at importance=0.15 (at minImportance)');

    // EPISODIC: doesn't delete if age <= 365
    const halfYearAgo = new Date(Date.now() - 182 * 24 * 60 * 60 * 1000);
    assert(tiering.shouldDelete({
        importance: 0.01,
        created_at: halfYearAgo.toISOString()
    }, 'episodic') === false, 'w7_62: EPISODIC doesn\'t delete at importance=0.01, age=182 days (within TTL)');

    // EPISODIC: boundary test, age exactly 365 days
    const exactlyOneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    assert(tiering.shouldDelete({
        importance: 0.01,
        created_at: exactlyOneYearAgo.toISOString()
    }, 'episodic') === false, 'w7_63: EPISODIC boundary: age exactly 365 days (not deleted)');

    // Null memory returns false
    assert(tiering.shouldDelete(null, 'working') === false, 'w7_64: null memory returns false');

    // Invalid tier returns false
    assert(tiering.shouldDelete({
        importance: 0.01,
        created_at: fortyDaysAgo.toISOString()
    }, 'invalid_tier') === false, 'w7_65: invalid tier returns false');

    // Missing created_at uses current time (essentially age=0)
    assert(tiering.shouldDelete({
        importance: 0.01
    }, 'working') === false, 'w7_66: missing created_at defaults to now (age=0, not deleted)');

    // =========================================================================
    // SECTION 5: reinforceOnRecall() (~15 tests)
    // Pass 21 Note: reinforceOnRecall now only boosts EPISODIC tier (importance >= 0.6)
    // =========================================================================
    console.log('\n[SECTION 5] reinforceOnRecall() Method');

    // Basic boost: EPISODIC tier (importance 0.7 → ~0.8)
    assert(Math.abs(tiering.reinforceOnRecall({
        importance: 0.7,
        memory_type: 'context'
    }) - 0.8) < 0.0001, 'w7_67: EPISODIC tier (importance=0.7) boosts to ~0.8');

    const boost07 = tiering.reinforceOnRecall({
        importance: 0.7,
        memory_type: 'context'
    });
    assert(Math.abs(boost07 - 0.8) < 0.0001, 'w7_68: EPISODIC tier 0.7 → 0.8');

    // Capped at 1.0 (EPISODIC)
    assert(tiering.reinforceOnRecall({
        importance: 0.95,
        memory_type: 'context'
    }) === 1.0, 'w7_69: EPISODIC importance=0.95 boosts and caps at 1.0');

    assert(tiering.reinforceOnRecall({
        importance: 0.98,
        memory_type: 'context'
    }) === 1.0, 'w7_70: EPISODIC importance=0.98 caps at 1.0');

    // Already at max (EPISODIC)
    assert(tiering.reinforceOnRecall({
        importance: 1.0,
        memory_type: 'context'
    }) === 1.0, 'w7_71: EPISODIC at max 1.0 stays 1.0');

    // Null memory returns 0
    assert(tiering.reinforceOnRecall(null) === 0, 'w7_72: null memory returns 0');

    // Missing importance returns 0
    assert(tiering.reinforceOnRecall({}) === 0, 'w7_73: missing importance returns 0');

    // Low importance (WORKING tier) does NOT boost
    assert(tiering.reinforceOnRecall({
        importance: 0.1,
        memory_type: 'context'
    }) === 0.1, 'w7_74: WORKING tier (importance=0.1) NOT boosted, returns 0.1');

    // Multiple reinforcements (EPISODIC tier, simulate successive recalls)
    let memory = { importance: 0.6, memory_type: 'context' };
    memory.importance = tiering.reinforceOnRecall(memory);
    assert(memory.importance === 0.7, 'w7_75: first reinforcement EPISODIC 0.6 → 0.7');
    memory.importance = tiering.reinforceOnRecall(memory);
    assert(Math.abs(memory.importance - 0.8) < 0.0001, 'w7_76: second reinforcement EPISODIC 0.7 → ~0.8');
    memory.importance = tiering.reinforceOnRecall(memory);
    assert(Math.abs(memory.importance - 0.9) < 0.0001, 'w7_77: third reinforcement EPISODIC 0.8 → 0.9');
    memory.importance = tiering.reinforceOnRecall(memory);
    assert(Math.abs(memory.importance - 1.0) < 0.0001, 'w7_78: fourth reinforcement EPISODIC 0.9 → 1.0 (capped)');
    memory.importance = tiering.reinforceOnRecall(memory);
    assert(Math.abs(memory.importance - 1.0) < 0.0001, 'w7_79: fifth reinforcement EPISODIC 1.0 → 1.0 (stays at max)');
    memory.importance = tiering.reinforceOnRecall(memory);
    assert(memory.importance === 1.0, 'w7_80: sixth reinforcement EPISODIC 1.0 → 1.0 (stays at max)');

    // Non-numeric importance
    assert(tiering.reinforceOnRecall({
        importance: 'string'
    }) === 0, 'w7_81: non-numeric importance returns 0');

    // =========================================================================
    // SECTION 6: checkGraduation() (~20 tests)
    // =========================================================================
    console.log('\n[SECTION 6] checkGraduation() Method');

    // Must be EPISODIC tier to graduate
    assert(tiering.checkGraduation({
        importance: 0.5,
        memory_type: 'insight'
    }, 3) === false, 'w7_82: WORKING tier cannot graduate (below 0.6)');

    // EPISODIC with all conditions met
    assert(tiering.checkGraduation({
        importance: 0.8,
        memory_type: 'insight',
        validation_count: 3
    }, 3) === true, 'w7_83: EPISODIC with all conditions → graduate');

    // EPISODIC pattern with validation_count in parameter
    // Note: 0.9 importance + pattern + 3 validations = CRYSTALLIZED (already graduated!)
    // So we test with 0.8 importance to stay in EPISODIC tier
    const grad84 = tiering.checkGraduation({
        importance: 0.8,
        memory_type: 'pattern',
        validation_count: 3
    }, 3);
    assert(grad84 === true, 'w7_84: EPISODIC pattern with validation count 3 → graduate');

    // Importance must be >= 0.8 for graduation
    assert(tiering.checkGraduation({
        importance: 0.79,
        memory_type: 'insight',
        validation_count: 3
    }, 3) === false, 'w7_85: importance=0.79 (below 0.8) cannot graduate');

    assert(tiering.checkGraduation({
        importance: 0.8,
        memory_type: 'insight',
        validation_count: 3
    }, 3) === true, 'w7_86: importance=0.8 (at boundary) can graduate');

    // validation_count must be >= 3
    assert(tiering.checkGraduation({
        importance: 0.8,
        memory_type: 'insight',
        validation_count: 2
    }, 2) === false, 'w7_87: validation_count=2 (below 3) cannot graduate');

    assert(tiering.checkGraduation({
        importance: 0.8,
        memory_type: 'insight',
        validation_count: 3
    }, 3) === true, 'w7_88: validation_count=3 (at boundary) can graduate');

    // Only crystallizable types
    assert(tiering.checkGraduation({
        importance: 0.8,
        memory_type: 'context',
        validation_count: 3
    }, 3) === false, 'w7_89: context (non-crystallizable) cannot graduate');

    assert(tiering.checkGraduation({
        importance: 0.8,
        memory_type: 'preference',
        validation_count: 3
    }, 3) === false, 'w7_90: preference (non-crystallizable) cannot graduate');

    assert(tiering.checkGraduation({
        importance: 0.8,
        memory_type: 'fact',
        validation_count: 3
    }, 3) === true, 'w7_91: fact (crystallizable) can graduate');

    assert(tiering.checkGraduation({
        importance: 0.8,
        memory_type: 'decision',
        validation_count: 3
    }, 3) === true, 'w7_92: decision (crystallizable) can graduate');

    // Null memory returns false
    assert(tiering.checkGraduation(null, 3) === false, 'w7_93: null memory cannot graduate');

    // Missing memory_type
    assert(tiering.checkGraduation({
        importance: 0.8,
        validation_count: 3
    }, 3) === false, 'w7_94: missing memory_type cannot graduate');

    // Missing validation_count parameter (uses 0, which fails the 3 requirement)
    assert(tiering.checkGraduation({
        importance: 0.8,
        memory_type: 'insight',
        validation_count: 3
    }) === false, 'w7_95: missing validation_count param uses internal (memory.validation_count = 3 < 0 check)');

    // CRYSTALLIZED tier should not pass (it's already crystallized)
    assert(tiering.checkGraduation({
        importance: 0.95,
        memory_type: 'insight',
        validation_count: 5
    }, 5) === false, 'w7_96: CRYSTALLIZED tier cannot graduate further');

    // =========================================================================
    // SECTION 7: SeasonalPatternStore (~20 tests)
    // =========================================================================
    console.log('\n[SECTION 7] SeasonalPatternStore');

    assert(typeof SeasonalPatternStore === 'function', 'w7_97: SeasonalPatternStore is a class constructor');

    const store = new SeasonalPatternStore('test_metric');
    assert(store.metricName === 'test_metric', 'w7_98: metricName is set in constructor');
    assert(Array.isArray(store.observations), 'w7_99: observations is an array');
    assert(store.observations.length === 0, 'w7_100: observations starts empty');

    // recordObservation
    store.recordObservation(5, new Date());
    assert(store.observations.length === 1, 'w7_101: recordObservation adds to observations');
    assert(store.observations[0].value === 5, 'w7_102: observation value is preserved');

    store.recordObservation(10, new Date(), { tag: 'test' });
    assert(store.observations.length === 2, 'w7_103: second recordObservation adds event');
    assert(store.observations[1].metadata.tag === 'test', 'w7_104: metadata is preserved');

    // Invalid value is rejected
    store.recordObservation('not_a_number', new Date());
    assert(store.observations.length === 2, 'w7_105: non-numeric value is rejected');

    // Invalid timestamp is rejected
    store.recordObservation(5, 'invalid');
    assert(store.observations.length === 2, 'w7_106: invalid timestamp is rejected');

    // getPattern with day_of_week
    const weekStore = new SeasonalPatternStore('weekly');
    const sunday = new Date(2024, 0, 7); // Sunday
    const monday = new Date(2024, 0, 8); // Monday
    weekStore.recordObservation(10, sunday);
    weekStore.recordObservation(10, sunday);
    weekStore.recordObservation(20, monday);
    const weekPattern = weekStore.getPattern('day_of_week');
    assert(weekPattern.granularity === 'day_of_week', 'w7_107: pattern granularity is set');
    assert(Array.isArray(weekPattern.indices), 'w7_108: pattern indices is an array');
    assert(weekPattern.indices.length === 7, 'w7_109: day_of_week has 7 indices');
    assert(Array.isArray(weekPattern.labels), 'w7_110: pattern labels is an array');
    assert(weekPattern.labels.length === 7, 'w7_111: day_of_week has 7 labels');

    // detectSeasonality
    const detectStore = new SeasonalPatternStore('test');
    for (let i = 0; i < 30; i++) {
        const date = new Date(2024, 0, i + 1);
        detectStore.recordObservation(Math.sin(i * 0.2) * 5 + 10, date);
    }
    const seasonality = detectStore.detectSeasonality();
    assert(typeof seasonality.hasSeasonality === 'boolean', 'w7_112: hasSeasonality is boolean');
    assert(typeof seasonality.strongestGranularity === 'string' || seasonality.strongestGranularity === null, 'w7_113: strongestGranularity is string or null');
    assert(typeof seasonality.patterns === 'object', 'w7_114: patterns is an object');

    // size property
    const sizeStore = new SeasonalPatternStore('test');
    assert(sizeStore.size === 0, 'w7_115: size property returns 0 for empty store');
    sizeStore.recordObservation(5, new Date());
    assert(sizeStore.size === 1, 'w7_116: size property returns 1 after one observation');
    sizeStore.recordObservation(10, new Date());
    assert(sizeStore.size === 2, 'w7_117: size property returns 2 after two observations');

    // clear method
    sizeStore.clear();
    assert(sizeStore.size === 0, 'w7_118: clear() resets size to 0');
    assert(sizeStore.observations.length === 0, 'w7_119: clear() empties observations array');

    // =========================================================================
    // SECTION 8: getSeasonalPatterns() (~25 tests)
    // =========================================================================
    console.log('\n[SECTION 8] getSeasonalPatterns() Method');

    const tiering2 = new MemoryTiering();

    // Empty events array
    const emptyPattern = tiering2.getSeasonalPatterns([]);
    assert(emptyPattern.indices.length === 0, 'w7_120: empty events returns empty indices');
    assert(emptyPattern.confidence === 0, 'w7_121: empty events has confidence 0');
    assert(emptyPattern.significance === false, 'w7_122: empty events has significance false');

    // day_of_week granularity
    const weekEvents = [
        { timestamp: new Date(2024, 0, 7).toISOString(), value: 10 }, // Sun
        { timestamp: new Date(2024, 0, 8).toISOString(), value: 20 }, // Mon
        { timestamp: new Date(2024, 0, 14).toISOString(), value: 12 }, // Sun
        { timestamp: new Date(2024, 0, 15).toISOString(), value: 25 }  // Mon
    ];
    const dayPattern = tiering2.getSeasonalPatterns(weekEvents, 'day_of_week');
    assert(dayPattern.granularity === 'day_of_week', 'w7_123: granularity is set correctly');
    assert(dayPattern.indices.length === 7, 'w7_124: day_of_week has 7 indices');
    assert(dayPattern.labels.length === 7, 'w7_125: day_of_week has 7 labels');
    assert(dayPattern.labels.includes('Sun'), 'w7_126: day_of_week labels include Sun');
    assert(dayPattern.labels.includes('Mon'), 'w7_127: day_of_week labels include Mon');

    // month granularity
    const monthEvents = [
        { timestamp: new Date(2024, 0, 1).toISOString(), value: 10 }, // Jan
        { timestamp: new Date(2024, 1, 1).toISOString(), value: 20 }, // Feb
        { timestamp: new Date(2024, 0, 15).toISOString(), value: 12 }, // Jan
        { timestamp: new Date(2024, 1, 15).toISOString(), value: 25 }  // Feb
    ];
    const monthPattern = tiering2.getSeasonalPatterns(monthEvents, 'month');
    assert(monthPattern.granularity === 'month', 'w7_128: month granularity set');
    assert(monthPattern.indices.length === 12, 'w7_129: month has 12 indices');
    assert(monthPattern.labels.length === 12, 'w7_130: month has 12 labels');

    // quarter granularity
    const quarterPattern = tiering2.getSeasonalPatterns(monthEvents, 'quarter');
    assert(quarterPattern.granularity === 'quarter', 'w7_131: quarter granularity set');
    assert(quarterPattern.indices.length === 4, 'w7_132: quarter has 4 indices');

    // hour granularity
    const hourEvents = [
        { timestamp: new Date(2024, 0, 1, 6, 0).toISOString(), value: 5 },
        { timestamp: new Date(2024, 0, 1, 18, 0).toISOString(), value: 15 },
        { timestamp: new Date(2024, 0, 2, 6, 0).toISOString(), value: 6 },
        { timestamp: new Date(2024, 0, 2, 18, 0).toISOString(), value: 16 }
    ];
    const hourPattern = tiering2.getSeasonalPatterns(hourEvents, 'hour');
    assert(hourPattern.granularity === 'hour', 'w7_133: hour granularity set');
    assert(hourPattern.indices.length === 24, 'w7_134: hour has 24 indices');

    // Seasonal indices above/below 1.0
    assert(dayPattern.indices.some(i => typeof i === 'number'), 'w7_135: indices contain numbers');

    // Confidence based on sample size
    assert(typeof dayPattern.confidence === 'number', 'w7_136: confidence is a number');
    assert(dayPattern.confidence >= 0 && dayPattern.confidence <= 1, 'w7_137: confidence is between 0 and 1');

    // Significance when variance > 0.05
    assert(typeof dayPattern.significance === 'boolean', 'w7_138: significance is boolean');

    // High variance with adequate samples should show significance
    // Need at least ~2 avg samples per bucket (24 buckets for hour) = 48+ total
    const highVarianceEvents = [];
    for (let day = 0; day < 24; day++) {
        for (let hour = 0; hour < 24; hour++) {
            const value = hour < 12 ? 100 : 1; // High in morning, low at night
            highVarianceEvents.push({
                timestamp: new Date(2024, 0, day + 1, hour).toISOString(),
                value
            });
        }
    }
    const varPattern = tiering2.getSeasonalPatterns(highVarianceEvents, 'hour');
    assert(varPattern.significance === true, 'w7_139: high variance with sufficient samples shows significance');

    // Default granularity is day_of_week
    const defaultPattern = tiering2.getSeasonalPatterns(weekEvents);
    assert(defaultPattern.granularity === 'day_of_week', 'w7_140: default granularity is day_of_week');

    // =========================================================================
    // SECTION 9: Structural Tests — Wiring Verification (~25 tests)
    // =========================================================================
    console.log('\n[SECTION 9] Structural Tests — Wiring Verification');

    const agentMemorySrc = fs.readFileSync(path.join(__dirname, '..', 'core', 'agent-memory.js'), 'utf-8');
    const agentNoComments = agentMemorySrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

    // Import check
    assert(agentNoComments.includes('memory-tiering'), 'w7_141: agent-memory.js imports memory-tiering');

    // createMemoryTiering call
    assert(agentNoComments.includes('createMemoryTiering()'), 'w7_142: agent-memory.js calls createMemoryTiering()');

    // this.tiering in constructor
    assert(agentNoComments.includes('this.tiering'), 'w7_143: agent-memory.js has this.tiering in constructor');

    // decayMemories uses classifyTier
    assert(agentNoComments.includes('classifyTier'), 'w7_144: agent-memory.js decayMemories() uses classifyTier');

    // decayMemories uses computeDecay
    assert(agentNoComments.includes('computeDecay'), 'w7_145: agent-memory.js decayMemories() uses computeDecay');

    // decayMemories uses shouldDelete
    assert(agentNoComments.includes('shouldDelete'), 'w7_146: agent-memory.js decayMemories() uses shouldDelete');

    // recall() has reinforceOnRecall
    assert(agentNoComments.includes('reinforceOnRecall'), 'w7_147: agent-memory.js recall() uses reinforceOnRecall');

    // store() has memory_tier field
    assert(agentNoComments.includes('memory_tier'), 'w7_148: agent-memory.js store() has memory_tier field');

    // store() has last_decay_date field
    assert(agentNoComments.includes('last_decay_date'), 'w7_149: agent-memory.js store() has last_decay_date field');

    // Old 0.98 decay rate is NOT present
    assert(!agentNoComments.includes('0.98'), 'w7_150: agent-memory.js does NOT contain old 0.98 decay rate');

    // Old minImportance 0.05 hardcoded is NOT in decayMemories
    const decayIdx = agentNoComments.indexOf('decayMemories');
    const nextFunc = agentNoComments.indexOf('async ', decayIdx + 1);
    const decayFunc = agentNoComments.slice(decayIdx, nextFunc);
    assert(!decayFunc.includes('0.05') || decayFunc.includes('TIER_CONFIG'), 'w7_151: agent-memory.js decayMemories does not hardcode minImportance');

    // Old 90-day deletion is NOT present
    assert(!decayFunc.includes('90'), 'w7_152: agent-memory.js decayMemories does not hardcode 90-day TTL');

    // memory-tiering.js exports are present
    const tieringSrc = fs.readFileSync(path.join(__dirname, '..', 'core', 'memory-tiering.js'), 'utf-8');
    assert(tieringSrc.includes('export const MEMORY_TIERS'), 'w7_153: memory-tiering.js exports MEMORY_TIERS');
    assert(tieringSrc.includes('export const TIER_CONFIG'), 'w7_154: memory-tiering.js exports TIER_CONFIG');
    assert(tieringSrc.includes('export class MemoryTiering'), 'w7_155: memory-tiering.js exports MemoryTiering class');
    assert(tieringSrc.includes('export class SeasonalPatternStore'), 'w7_156: memory-tiering.js exports SeasonalPatternStore class');
    assert(tieringSrc.includes('export function createMemoryTiering'), 'w7_157: memory-tiering.js exports createMemoryTiering function');
    assert(tieringSrc.includes('export function createSeasonalPatternStore'), 'w7_158: memory-tiering.js exports createSeasonalPatternStore function');

    // W-007 header
    assert(tieringSrc.includes('W-007'), 'w7_159: memory-tiering.js has W-007 header');

    // CRYSTALLIZABLE_TYPES constant
    assert(tieringSrc.includes('CRYSTALLIZABLE_TYPES'), 'w7_160: memory-tiering.js has CRYSTALLIZABLE_TYPES constant');
    assert(tieringSrc.includes("'insight'"), 'w7_161: CRYSTALLIZABLE_TYPES includes insight');
    assert(tieringSrc.includes("'pattern'"), 'w7_162: CRYSTALLIZABLE_TYPES includes pattern');
    assert(tieringSrc.includes("'fact'"), 'w7_163: CRYSTALLIZABLE_TYPES includes fact');
    assert(tieringSrc.includes("'decision'"), 'w7_164: CRYSTALLIZABLE_TYPES includes decision');

    // =========================================================================
    // SECTION 10: Edge Cases & Factory Functions (~10 tests)
    // =========================================================================
    console.log('\n[SECTION 10] Edge Cases & Factory Functions');

    const factoryTiering = createMemoryTiering();
    assert(factoryTiering instanceof MemoryTiering, 'w7_165: createMemoryTiering() returns MemoryTiering instance');

    const factoryStore = createSeasonalPatternStore('custom_metric');
    assert(factoryStore instanceof SeasonalPatternStore, 'w7_166: createSeasonalPatternStore() returns SeasonalPatternStore instance');
    assert(factoryStore.metricName === 'custom_metric', 'w7_167: createSeasonalPatternStore() sets metricName correctly');

    // SeasonalPatternStore with timestamp types
    const tsStore = new SeasonalPatternStore('test');
    tsStore.recordObservation(5, new Date(2024, 0, 1)); // Date object
    assert(tsStore.size === 1, 'w7_168: recordObservation accepts Date object');
    tsStore.recordObservation(10, 1704067200000); // Timestamp number
    assert(tsStore.size === 2, 'w7_169: recordObservation accepts numeric timestamp');
    tsStore.recordObservation(15, new Date(2024, 0, 3).toISOString()); // ISO string
    assert(tsStore.size === 3, 'w7_170: recordObservation accepts ISO string timestamp');

    // Multiple SeasonalPatternStore instances are independent
    const store1 = new SeasonalPatternStore('store1');
    const store2 = new SeasonalPatternStore('store2');
    store1.recordObservation(5, new Date());
    assert(store1.size === 1, 'w7_171: store1 has 1 observation');
    assert(store2.size === 0, 'w7_172: store2 remains empty');

    // ═══════════════════════════════════════════════════════════════════════════════
    // SECTION 11: Pass 21 — reinforceOnRecall tier gating, maxReinforcementPerDay,
    //             auto-graduation in decayMemories, last_decay_date update
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('\n[SECTION 11] Pass 21 — Tier-Gated Reinforcement & Auto-Graduation');

    // ─── Bug 1: WORKING tier NOT boosted by reinforceOnRecall ───────────────────

    // WORKING tier memory with importance 0.5 should return unchanged
    const workingMem1 = { importance: 0.5, memory_type: 'context' };
    const boostedWorking1 = tiering.reinforceOnRecall(workingMem1);
    assert(boostedWorking1 === 0.5, 'w7_173: WORKING tier (importance=0.5) NOT boosted, returns 0.5');

    // WORKING tier memory with importance 0.4 should return unchanged
    const workingMem2 = { importance: 0.4, memory_type: 'outcome' };
    const boostedWorking2 = tiering.reinforceOnRecall(workingMem2);
    assert(boostedWorking2 === 0.4, 'w7_174: WORKING tier (importance=0.4) NOT boosted, returns 0.4');

    // WORKING tier memory at exactly 0.6 boundary (still episodic, not working)
    const boundaryMem = { importance: 0.6, memory_type: 'context' };
    const boostedBoundary = tiering.reinforceOnRecall(boundaryMem);
    assert(boostedBoundary === 0.7, 'w7_175: Boundary importance=0.6 IS boosted (episodic tier), returns 0.7');

    // ─── Bug 1: CRYSTALLIZED tier NOT boosted by reinforceOnRecall ─────────────────

    // CRYSTALLIZED tier memory with importance 0.95, validation_count 3+ should return unchanged
    const crystallizedMem1 = {
        importance: 0.95,
        memory_type: 'insight',
        validation_count: 3
    };
    const boostedCrystal1 = tiering.reinforceOnRecall(crystallizedMem1);
    assert(boostedCrystal1 === 0.95, 'w7_176: CRYSTALLIZED tier (importance=0.95) NOT boosted, returns 0.95');

    // CRYSTALLIZED tier memory with importance 0.9, validation_count 5 should return unchanged
    const crystallizedMem2 = {
        importance: 0.9,
        memory_type: 'pattern',
        validation_count: 5
    };
    const boostedCrystal2 = tiering.reinforceOnRecall(crystallizedMem2);
    assert(boostedCrystal2 === 0.9, 'w7_177: CRYSTALLIZED tier (importance=0.9) NOT boosted, returns 0.9');

    // CRYSTALLIZED tier memory even at high importance should not boost above 1.0
    const crystallizedMem3 = {
        importance: 1.0,
        memory_type: 'fact',
        validation_count: 3
    };
    const boostedCrystal3 = tiering.reinforceOnRecall(crystallizedMem3);
    assert(boostedCrystal3 === 1.0, 'w7_178: CRYSTALLIZED tier at 1.0 stays at 1.0 (no boost applied)');

    // ─── Bug 1: EPISODIC tier IS boosted by reinforceOnRecall (no reinf. count cap) ───

    // EPISODIC tier memory with importance 0.7 should be boosted to 0.8
    const episodicMem1 = {
        importance: 0.7,
        memory_type: 'outcome',
        _reinforcementCountToday: 0
    };
    const boostedEpisodic1 = tiering.reinforceOnRecall(episodicMem1);
    assert(Math.abs(boostedEpisodic1 - 0.8) < 0.0001, 'w7_179: EPISODIC tier (importance=0.7, count=0) boosted to ~0.8');

    // EPISODIC tier memory with importance 0.6 should be boosted to 0.7
    const episodicMem2 = {
        importance: 0.6,
        memory_type: 'context',
        _reinforcementCountToday: 1
    };
    const boostedEpisodic2 = tiering.reinforceOnRecall(episodicMem2);
    assert(boostedEpisodic2 === 0.7, 'w7_180: EPISODIC tier (importance=0.6, count=1) boosted to 0.7');

    // ─── Bug 3: maxReinforcementPerDay enforcement (count >= 3) ──────────────────────

    // Memory with _reinforcementCountToday = 3 should NOT be boosted (at cap)
    const capped1 = { importance: 0.7, memory_type: 'context', _reinforcementCountToday: 3 };
    const boostedCapped1 = tiering.reinforceOnRecall(capped1);
    assert(boostedCapped1 === 0.7, 'w7_181: maxReinforcementPerDay=3 prevents boost (count=3), returns 0.7');

    // Memory with _reinforcementCountToday = 4 should NOT be boosted (over cap)
    const capped2 = { importance: 0.7, memory_type: 'context', _reinforcementCountToday: 4 };
    const boostedCapped2 = tiering.reinforceOnRecall(capped2);
    assert(boostedCapped2 === 0.7, 'w7_182: maxReinforcementPerDay=3 prevents boost (count=4), returns 0.7');

    // Memory with _reinforcementCountToday = 2 should still be boosted
    const capped3 = { importance: 0.7, memory_type: 'context', _reinforcementCountToday: 2 };
    const boostedCapped3 = tiering.reinforceOnRecall(capped3);
    assert(Math.abs(boostedCapped3 - 0.8) < 0.0001, 'w7_183: maxReinforcementPerDay=3 allows boost (count=2), returns ~0.8');

    // Memory with _reinforcementCountToday = 0 should be boosted
    const capped4 = { importance: 0.7, memory_type: 'context', _reinforcementCountToday: 0 };
    const boostedCapped4 = tiering.reinforceOnRecall(capped4);
    assert(Math.abs(boostedCapped4 - 0.8) < 0.0001, 'w7_184: maxReinforcementPerDay=3 allows boost (count=0), returns ~0.8');

    // Memory with _reinforcementCountToday = 1 should be boosted
    const capped5 = { importance: 0.6, memory_type: 'context', _reinforcementCountToday: 1 };
    const boostedCapped5 = tiering.reinforceOnRecall(capped5);
    assert(boostedCapped5 === 0.7, 'w7_185: maxReinforcementPerDay=3 allows boost (count=1), returns 0.7');

    // ─── Bug 2: Structural test — recall() updates last_decay_date ─────────────────

    const agentMemorySrc2 = fs.readFileSync(path.join(__dirname, '..', 'core', 'agent-memory.js'), 'utf-8');
    const agentNoComments2 = agentMemorySrc2.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

    // Find recall() function and check it updates last_decay_date
    const recallIdx = agentNoComments2.indexOf('async recall(');
    const nextFuncAfterRecall = agentNoComments2.indexOf('async ', recallIdx + 1);
    const recallFunc = agentNoComments2.slice(recallIdx, nextFuncAfterRecall > 0 ? nextFuncAfterRecall : recallIdx + 2000);
    assert(recallFunc.includes('last_decay_date'), 'w7_186: agent-memory.js recall() updates last_decay_date on reinforcement');

    // Check that update call includes reinforcementBoost-related fields
    assert(recallFunc.includes('reinforcement_count_today') || recallFunc.includes('_reinforcementCountToday'),
        'w7_187: agent-memory.js recall() tracks reinforcement_count_today');

    // ─── Bug 4: Structural test — decayMemories calls checkGraduation ────────────

    const decayIdx2 = agentNoComments2.indexOf('decayMemories');
    const nextFuncAfterDecay = agentNoComments2.indexOf('async ', decayIdx2 + 1);
    const decayFunc2 = agentNoComments2.slice(decayIdx2, nextFuncAfterDecay > 0 ? nextFuncAfterDecay : decayIdx2 + 3000);
    assert(decayFunc2.includes('checkGraduation'), 'w7_188: agent-memory.js decayMemories() calls checkGraduation() for EPISODIC tier');

    // Verify decayMemories also checks tier === 'episodic' before calling graduation
    assert(decayFunc2.includes('episodic') || decayFunc2.includes('EPISODIC'),
        'w7_189: agent-memory.js decayMemories() specifically checks EPISODIC tier for graduation');

    // ─── minSamples fix: no hardcoded 0 via Math.min(...values, 0) ──────────────────

    const tieringSrc2 = fs.readFileSync(path.join(__dirname, '..', 'core', 'memory-tiering.js'), 'utf-8');
    const tierNoComments2 = tieringSrc2.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

    // Find getSeasonalPatterns and check minSamples calculation
    const getSeasonalIdx = tierNoComments2.indexOf('getSeasonalPatterns(');
    const endOfMethod = tierNoComments2.indexOf('}\n    ', getSeasonalIdx) + 50;
    const getSeasonalFunc = tierNoComments2.slice(getSeasonalIdx, endOfMethod);

    // Check that minSamples doesn't include trailing Math.min(...values, 0)
    // It should be Math.min(...values) without the hardcoded 0
    assert(!getSeasonalFunc.includes('Math.min(...Object.values(bucketCounts), 0)'),
        'w7_190: getSeasonalPatterns does NOT have hardcoded 0 in minSamples Math.min');

    // Verify correct pattern: minSamples calculation uses only bucketCounts
    assert(getSeasonalFunc.includes('Math.min(...Object.values(bucketCounts))'),
        'w7_191: getSeasonalPatterns computes minSamples correctly without hardcoded 0');

    // ─── Complex scenario: EPISODIC memory reaching graduation threshold ───────────

    // Memory that could graduate: importance >= 0.8, validation_count >= 3, crystallizable type
    const graduationCandidate = {
        importance: 0.8,
        memory_type: 'insight',
        validation_count: 3
    };

    // Should classify as EPISODIC (importance 0.8, not yet 0.9)
    const tierBeforeGrad = tiering.classifyTier(graduationCandidate);
    assert(tierBeforeGrad === 'episodic', 'w7_192: Memory with importance=0.8, validation=3 classifies as EPISODIC');

    // Should qualify for graduation
    const canGraduate = tiering.checkGraduation(graduationCandidate, 3);
    assert(canGraduate === true, 'w7_193: Memory with importance=0.8, validation=3, insight type CAN graduate');

    // After graduation threshold, memory would become CRYSTALLIZED
    const postGraduatedMem = { ...graduationCandidate, importance: 0.9 };
    const tierAfterGrad = tiering.classifyTier(postGraduatedMem);
    assert(tierAfterGrad === 'crystallized', 'w7_194: Memory with importance=0.9, validation=3 classifies as CRYSTALLIZED');

    // Reinforcement on CRYSTALLIZED (post-graduation) should NOT boost
    const postGradBoosted = tiering.reinforceOnRecall(postGraduatedMem);
    assert(postGradBoosted === 0.9, 'w7_195: Post-graduated CRYSTALLIZED memory NOT boosted, returns 0.9');

    // ─── Edge case: Memory at edge of EPISODIC/CRYSTALLIZED ─────────────────────

    // Memory just below crystallization threshold (importance 0.89)
    const subCrystal = {
        importance: 0.89,
        memory_type: 'pattern',
        validation_count: 3
    };
    const tierSubCrystal = tiering.classifyTier(subCrystal);
    assert(tierSubCrystal === 'episodic', 'w7_196: importance=0.89 (just below 0.9) stays in EPISODIC');

    // This memory SHOULD get boosted (still episodic)
    const boostedSubCrystal = tiering.reinforceOnRecall(subCrystal);
    assert(boostedSubCrystal === 0.99, 'w7_197: EPISODIC memory importance=0.89 boosted to 0.99');

    // ─── Reinforcement count boundary test ──────────────────────────────────────

    // Exactly at the boundary: count = 2 (one more allowed)
    const boundaryCount2 = {
        importance: 0.7,
        memory_type: 'context',
        _reinforcementCountToday: 2
    };
    const boostedBound2 = tiering.reinforceOnRecall(boundaryCount2);
    assert(Math.abs(boostedBound2 - 0.8) < 0.0001, 'w7_198: Reinforcement count=2 (below cap) is boosted');

    // Exactly at the boundary: count = 3 (no more allowed)
    const boundaryCount3 = {
        importance: 0.7,
        memory_type: 'context',
        _reinforcementCountToday: 3
    };
    const boostedBound3 = tiering.reinforceOnRecall(boundaryCount3);
    assert(boostedBound3 === 0.7, 'w7_199: Reinforcement count=3 (at cap) is NOT boosted');

    // ═══════════════════════════════════════════════════════════════════════════════
    // SECTION 12: Pass 22 — Graduation uses pre-decay importance
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('\n[SECTION 12] Pass 22 — Graduation Uses Pre-Decay Importance');

    // Structural: decayMemories checks graduation BEFORE computing decay
    const agentMemSrc22 = fs.readFileSync(path.join(__dirname, '..', 'core', 'agent-memory.js'), 'utf-8');
    const decayFnStart = agentMemSrc22.indexOf('async decayMemories()');
    const decayFnEnd = agentMemSrc22.indexOf('// Batch updates', decayFnStart);
    const decayFnBody = agentMemSrc22.substring(decayFnStart, decayFnEnd);

    // Graduation check should appear BEFORE computeDecay in the function body
    const gradCheckPos = decayFnBody.indexOf('checkGraduation');
    const computeDecayPos = decayFnBody.indexOf('computeDecay');
    assert(gradCheckPos > 0 && computeDecayPos > 0,
        'w7_200: decayMemories contains both checkGraduation and computeDecay');
    assert(gradCheckPos < computeDecayPos,
        'w7_201: checkGraduation is called BEFORE computeDecay in decayMemories (Pass 22 fix)');

    // Graduation uses original mem (not decayed candidate)
    assert(decayFnBody.includes('checkGraduation(mem,'),
        'w7_202: checkGraduation called with original mem (not decayed candidate)');

    // Graduated memory keeps original importance
    assert(decayFnBody.includes('importance: mem.importance'),
        'w7_203: Graduated memory keeps original importance (not decayed)');

    // After graduation continue skips decay
    const gradContinuePos = decayFnBody.indexOf('continue', gradCheckPos);
    assert(gradContinuePos > gradCheckPos && gradContinuePos < computeDecayPos,
        'w7_204: continue after graduation skips the computeDecay step');

    // Graduated tier set to crystallized
    assert(decayFnBody.includes("memory_tier: 'crystallized'"),
        'w7_205: Graduated memory tier set to crystallized');

    // Pass 22 comment present
    assert(decayFnBody.includes('Pass 22'),
        'w7_206: Pass 22 comment present in graduation code');

    // Behavioral: checkGraduation with importance exactly 0.8 passes (boundary)
    const boundaryGrad = {
        importance: 0.8,
        memory_type: 'insight',
        validation_count: 3
    };
    assert(tiering.checkGraduation(boundaryGrad, 3) === true,
        'w7_207: checkGraduation passes at exactly importance=0.8 (boundary)');

    // After episodic decay of 1 day: 0.8 * 0.995 = 0.796 → would fail
    const decayedBoundary = tiering.computeDecay(
        { importance: 0.8, created_at: new Date(Date.now() - 24*60*60*1000).toISOString() },
        'episodic'
    );
    assert(decayedBoundary < 0.8,
        `w7_208: Decayed importance (${decayedBoundary}) < 0.8 — proves pre-decay check is necessary`);

    // ═══════════════════════════════════════════════════════════════════════════════
    // SECTION 13: Pass 23 — Graduated CRYSTALLIZED memory respects stored tier
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('\n[SECTION 13] Pass 23 — Graduated Memory Stored Tier Respected');

    // Graduated memory: importance < 0.9 but memory_tier = 'crystallized'
    const graduatedMem = {
        importance: 0.85,
        memory_type: 'insight',
        validation_count: 3,
        memory_tier: 'crystallized'
    };

    // classifyTier would say EPISODIC (0.85 < 0.9), but stored tier says crystallized
    assert(tiering.classifyTier(graduatedMem) === 'episodic',
        'w7_209: classifyTier computes EPISODIC for importance=0.85 (threshold mismatch expected)');

    // reinforceOnRecall should NOT boost because stored memory_tier is crystallized
    const gradBoosted = tiering.reinforceOnRecall(graduatedMem);
    assert(gradBoosted === 0.85,
        'w7_210: Graduated CRYSTALLIZED memory (importance=0.85) NOT boosted — returns 0.85');

    // Memory without memory_tier field still uses classifyTier (backward compat)
    const noTierMem = {
        importance: 0.85,
        memory_type: 'insight',
        validation_count: 3
    };
    const noTierBoosted = tiering.reinforceOnRecall(noTierMem);
    assert(Math.abs(noTierBoosted - 0.95) < 0.0001,
        'w7_211: Memory WITHOUT memory_tier falls through to classifyTier → EPISODIC → boosted');

    // Stored tier 'working' still defers to classifyTier
    const storedWorkingMem = { importance: 0.3, memory_type: 'context', memory_tier: 'working' };
    assert(tiering.reinforceOnRecall(storedWorkingMem) === 0.3,
        'w7_212: Stored WORKING memory NOT boosted');

    // Stored tier 'episodic' allows boosting
    const storedEpisodicMem = { importance: 0.7, memory_type: 'context', memory_tier: 'episodic' };
    assert(Math.abs(tiering.reinforceOnRecall(storedEpisodicMem) - 0.8) < 0.0001,
        'w7_213: Stored EPISODIC memory IS boosted (0.7 → 0.8)');

    // Structural: reinforceOnRecall source checks memory.memory_tier
    const tieringSrc23 = fs.readFileSync(path.join(__dirname, '..', 'core', 'memory-tiering.js'), 'utf-8');
    const reinforceSection23 = tieringSrc23.substring(
        tieringSrc23.indexOf('reinforceOnRecall('),
        tieringSrc23.indexOf('checkGraduation(')
    );
    assert(reinforceSection23.includes('memory.memory_tier'),
        'w7_214: reinforceOnRecall checks memory.memory_tier (Pass 23)');
    assert(reinforceSection23.includes('MEMORY_TIERS.CRYSTALLIZED'),
        'w7_215: reinforceOnRecall compares against MEMORY_TIERS.CRYSTALLIZED');
    assert(reinforceSection23.includes('Pass 23'),
        'w7_216: Pass 23 comment present in reinforceOnRecall');

    // ═══════════════════════════════════════════════════════════════════════════════
    // RESULTS
    // ═════════════════════════════════════════════════════════════════════════════

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`W-007 RESULTS: ${passed} passed, ${failed} failed`);
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
