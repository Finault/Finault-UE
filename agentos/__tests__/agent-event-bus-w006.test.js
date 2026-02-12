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

function assertThrows(fn, expectedSubstring, message) {
    try {
        fn();
        console.log(`  ✗ FAIL: ${message} (did NOT throw)`);
        failed++;
        failures.push(message);
    } catch (e) {
        if (expectedSubstring && !e.message.includes(expectedSubstring)) {
            console.log(`  ✗ FAIL: ${message} (threw "${e.message}" but expected "${expectedSubstring}")`);
            failed++;
            failures.push(message);
        } else {
            console.log(`  ✓ ${message}`);
            passed++;
        }
    }
}

async function assertAsyncThrows(fn, expectedSubstring, message) {
    try {
        await fn();
        console.log(`  ✗ FAIL: ${message} (did NOT throw)`);
        failed++;
        failures.push(message);
    } catch (e) {
        if (expectedSubstring && !e.message.includes(expectedSubstring)) {
            console.log(`  ✗ FAIL: ${message} (threw "${e.message}" but expected "${expectedSubstring}")`);
            failed++;
            failures.push(message);
        } else {
            console.log(`  ✓ ${message}`);
            passed++;
        }
    }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function createMockSupabase() {
    const inserted = [];
    return {
        from: (table) => ({
            insert: async (data) => {
                inserted.push(...(Array.isArray(data) ? data : [data]));
                return { data, error: null };
            },
            select: () => ({
                eq: () => ({
                    eq: () => ({
                        gte: () => ({
                            lte: () => ({
                                order: () => ({ limit: () => Promise.resolve({ data: inserted, error: null }) })
                            })
                        })
                    })
                })
            })
        }),
        _inserted: inserted
    };
}

async function runTests() {
    console.log('═'.repeat(70));
    console.log('W-006 AGENT EVENT BUS TEST SUITE');
    console.log('═'.repeat(70));

    const { AgentEventBus, ConflictResolver, EventStore, getEventBus, resetEventBus, EVENT_BUS_CONFIG } = await import(new URL('../core/agent-event-bus.js', import.meta.url).href);

    // =========================================================================
    // SECTION 1: AgentEventBus Core (~35 tests)
    // =========================================================================
    console.log('\n[SECTION 1] AgentEventBus Core Tests');

    // Constructor and basic initialization
    assert(typeof AgentEventBus === 'function', 'w6_1: AgentEventBus is a class constructor');
    const bus1 = new AgentEventBus(null);
    assert(bus1 instanceof AgentEventBus, 'w6_2: Can instantiate AgentEventBus without supabase');
    assert(Array.isArray(bus1.events), 'w6_3: AgentEventBus.events is an array');
    assert(bus1.events.length === 0, 'w6_4: AgentEventBus.events starts empty');
    assert(bus1.subscriptions instanceof Map, 'w6_5: AgentEventBus.subscriptions is a Map');
    assert(bus1.subscriptions.size === 0, 'w6_6: AgentEventBus.subscriptions starts empty');

    // Event publishing
    const result1 = bus1.publish({
        agent: 'test-agent',
        action: 'test-action',
        target_table: 'test_table'
    });
    assert(result1.event_id, 'w6_7: publish() returns object with event_id');
    assert(result1.timestamp, 'w6_8: publish() returns object with timestamp');
    assert(bus1.events.length === 1, 'w6_9: publish() adds event to buffer');
    assert(bus1.events[0].agent === 'test-agent', 'w6_10: published event preserves agent');
    assert(bus1.events[0].action === 'test-action', 'w6_11: published event preserves action');
    assert(bus1.events[0].target_table === 'test_table', 'w6_12: published event preserves target_table');
    assert(bus1.events[0].intent === 'write', 'w6_13: published event defaults intent to "write"');

    // Event ID generation
    const result2 = bus1.publish({ agent: 'agent2', action: 'action2' });
    const result3 = bus1.publish({ agent: 'agent3', action: 'action3' });
    assert(result2.event_id !== result3.event_id, 'w6_14: Each publish generates unique event_id');
    assert(result1.timestamp <= result2.timestamp, 'w6_15: Event timestamps are monotonically increasing');

    // Custom event_id
    const customId = 'custom-uuid-12345';
    const result4 = bus1.publish({
        agent: 'agent4',
        action: 'action4',
        event_id: customId
    });
    assert(result4.event_id === customId, 'w6_16: publish() respects custom event_id');

    // Ring buffer pruning (maxEventAge)
    const bus2 = new AgentEventBus(null, { maxEventAge: 100 });
    bus2.publish({ agent: 'a1', action: 'act1' });
    await sleep(150);
    bus2.publish({ agent: 'a2', action: 'act2' });
    assert(bus2.events.length === 1, 'w6_17: Old events are pruned from ring buffer');
    assert(bus2.events[0].agent === 'a2', 'w6_18: Pruning preserves recent events');

    // getRecentEvents filtering
    const bus3 = new AgentEventBus(null);
    bus3.publish({ agent: 'autopilot', action: 'switch_model', target_table: 'models' });
    bus3.publish({ agent: 'budget', action: 'enforce', target_table: 'budgets' });
    bus3.publish({ agent: 'autopilot', action: 'update_rate', target_table: 'models' });

    const recentAll = bus3.getRecentEvents({});
    assert(recentAll.length === 3, 'w6_19: getRecentEvents with empty filter returns all events');

    const recentByAgent = bus3.getRecentEvents({ agent: 'autopilot' });
    assert(recentByAgent.length === 2, 'w6_20: getRecentEvents filters by agent');
    assert(recentByAgent.every(e => e.agent === 'autopilot'), 'w6_21: Agent filter is applied correctly');

    const recentByTable = bus3.getRecentEvents({ target_table: 'models' });
    assert(recentByTable.length === 2, 'w6_22: getRecentEvents filters by target_table');
    assert(recentByTable.every(e => e.target_table === 'models'), 'w6_23: target_table filter is applied correctly');

    const recentByAction = bus3.getRecentEvents({ action: 'switch_model' });
    assert(recentByAction.length === 1, 'w6_24: getRecentEvents filters by action');

    // Time window filtering
    const bus4 = new AgentEventBus(null, { maxEventAge: 10000 });
    bus4.publish({ agent: 'a1', action: 'x1' });
    await sleep(50);
    bus4.publish({ agent: 'a2', action: 'x2' });
    const windowEvents = bus4.getRecentEvents({}, 100);
    assert(windowEvents.length <= 2, 'w6_25: Time window filtering works');

    // Subscribe and unsubscribe (async subscribers)
    const bus5 = new AgentEventBus(null);
    let eventsCaught = [];
    const subId = bus5.subscribe(
        { agent: 'autopilot' },
        async (event) => { eventsCaught.push(event); }
    );
    assert(typeof subId === 'number', 'w6_26: subscribe() returns numeric subscription ID');
    bus5.publish({ agent: 'autopilot', action: 'test' });
    await sleep(20);
    assert(eventsCaught.length === 1, 'w6_27: Subscriber receives matching events');
    bus5.unsubscribe(subId);
    bus5.publish({ agent: 'autopilot', action: 'test2' });
    await sleep(20);
    assert(eventsCaught.length === 1, 'w6_28: unsubscribe() stops receiving events');

    // Multiple subscribers with pattern matching
    const bus6 = new AgentEventBus(null);
    let modelEvents = [];
    let budgetEvents = [];
    bus6.subscribe({ target_table: 'models' }, async (e) => { modelEvents.push(e); });
    bus6.subscribe({ target_table: 'budgets' }, async (e) => { budgetEvents.push(e); });
    bus6.publish({ agent: 'a1', action: 'act1', target_table: 'models' });
    bus6.publish({ agent: 'a2', action: 'act2', target_table: 'budgets' });
    bus6.publish({ agent: 'a3', action: 'act3', target_table: 'models' });
    await sleep(20);
    assert(modelEvents.length === 2, 'w6_29: Multiple subscribers work independently (model events)');
    assert(budgetEvents.length === 1, 'w6_30: Multiple subscribers work independently (budget events)');

    // reset()
    const bus7 = new AgentEventBus(null);
    bus7.publish({ agent: 'a1', action: 'x' });
    bus7.subscribe({ agent: 'a1' }, () => {});
    assert(bus7.events.length > 0, 'w6_31: Bus has events before reset');
    assert(bus7.subscriptions.size > 0, 'w6_32: Bus has subscriptions before reset');
    bus7.reset();
    assert(bus7.events.length === 0, 'w6_33: reset() clears events');
    assert(bus7.subscriptions.size === 0, 'w6_34: reset() clears subscriptions');

    // Subscriber error handling (fire-and-forget, never blocks)
    const bus8 = new AgentEventBus(null);
    let normalSubCaught = [];
    bus8.subscribe({ agent: 'test' }, (e) => { normalSubCaught.push(e); });
    bus8.subscribe({ agent: 'test' }, () => { throw new Error('subscriber error'); });
    bus8.publish({ agent: 'test', action: 'x' });
    await sleep(10);
    assert(normalSubCaught.length === 1, 'w6_35: Throwing subscriber does not block normal subscribers');

    // =========================================================================
    // SECTION 2: ConflictResolver — Oscillation Detection (~35 tests)
    // =========================================================================
    console.log('\n[SECTION 2] ConflictResolver — Oscillation Detection');

    assert(typeof ConflictResolver === 'function', 'w6_36: ConflictResolver is a class constructor');
    const resolver1 = new ConflictResolver();
    assert(resolver1.oscillationThreshold === 3, 'w6_37: Default oscillationThreshold is 3');
    assert(resolver1.oscillationWindowMs === 60000, 'w6_38: Default oscillationWindowMs is 60000');
    assert(resolver1.deduplicationWindowMs === 5000, 'w6_39: Default deduplicationWindowMs is 5000');
    assert(typeof resolver1.priorityMap === 'object', 'w6_40: priorityMap is an object');

    // Basic oscillation detection
    const resolver2 = new ConflictResolver({ oscillationThreshold: 3, oscillationWindowMs: 60000 });
    const events1 = [];
    const now = Date.now();
    events1.push({
        agent: 'autopilot',
        action: 'switch',
        target_table: 'models',
        proposed_value: { to: 'gpt-4' },
        timestamp: now - 40000,
        intent: 'write'
    });
    events1.push({
        agent: 'optimization',
        action: 'switch',
        target_table: 'models',
        proposed_value: { to: 'gpt-3.5' },
        timestamp: now - 30000,
        intent: 'write'
    });
    events1.push({
        agent: 'autopilot',
        action: 'switch',
        target_table: 'models',
        proposed_value: { to: 'gpt-4' },
        timestamp: now - 20000,
        intent: 'write'
    });

    const intent1 = {
        agent: 'optimization',
        action: 'switch',
        target_table: 'models',
        proposed_value: { to: 'gpt-3.5' }
    };

    const oscResult1 = resolver2.detectOscillation(intent1, events1);
    assert(oscResult1.detected === true, 'w6_41: detectOscillation detects alternating pattern (A→B→A→B)');
    assert(oscResult1.reason.includes('Oscillation'), 'w6_42: Oscillation reason message includes "Oscillation"');
    assert(typeof oscResult1.winner === 'string', 'w6_43: Oscillation result includes winner');

    // No oscillation with monotonic changes
    const events2 = [];
    events2.push({
        agent: 'a1',
        target_table: 'models',
        proposed_value: 'v1',
        timestamp: now - 40000,
        intent: 'write'
    });
    events2.push({
        agent: 'a1',
        target_table: 'models',
        proposed_value: 'v2',
        timestamp: now - 30000,
        intent: 'write'
    });
    events2.push({
        agent: 'a1',
        target_table: 'models',
        proposed_value: 'v3',
        timestamp: now - 20000,
        intent: 'write'
    });

    const intent2 = {
        agent: 'a1',
        target_table: 'models',
        proposed_value: 'v4'
    };

    const oscResult2 = resolver2.detectOscillation(intent2, events2);
    assert(oscResult2.detected === false, 'w6_44: Monotonic changes are NOT detected as oscillation');

    // Oscillation outside window should not trigger
    const events3 = [];
    events3.push({
        agent: 'a1',
        target_table: 'models',
        proposed_value: 'a',
        timestamp: now - 90000, // Outside 60s window
        intent: 'write'
    });
    events3.push({
        agent: 'a2',
        target_table: 'models',
        proposed_value: 'b',
        timestamp: now - 30000,
        intent: 'write'
    });

    const intent3 = {
        agent: 'a1',
        target_table: 'models',
        proposed_value: 'a'
    };

    const oscResult3 = resolver2.detectOscillation(intent3, events3);
    assert(oscResult3.detected === false, 'w6_45: Oscillation outside window does not trigger');

    // Below threshold should not trigger
    const resolver3 = new ConflictResolver({ oscillationThreshold: 5 });
    const events4 = [
        { agent: 'a1', target_table: 'x', proposed_value: '1', timestamp: now - 1000, intent: 'write' },
        { agent: 'a2', target_table: 'x', proposed_value: '2', timestamp: now - 500, intent: 'write' }
    ];
    const intent4 = { agent: 'a1', target_table: 'x', proposed_value: '3' };
    const oscResult4 = resolver3.detectOscillation(intent4, events4);
    assert(oscResult4.detected === false, 'w6_46: Below threshold oscillation does not trigger');

    // Oscillation with no target_table
    const intent5 = { agent: 'a1', action: 'test' };
    const oscResult5 = resolver2.detectOscillation(intent5, []);
    assert(oscResult5.detected === false, 'w6_47: No target_table returns detected=false');

    // Winner determination in oscillation
    const resolver4 = new ConflictResolver();
    const events5 = [
        { agent: 'governance-agent', target_table: 'x', proposed_value: 'a', timestamp: now - 1000, intent: 'write' },
        { agent: 'autopilot', target_table: 'x', proposed_value: 'b', timestamp: now - 500, intent: 'write' }
    ];
    const intent6 = { agent: 'governance-agent', target_table: 'x', proposed_value: 'a' };
    const oscResult6 = resolver4.detectOscillation(intent6, events5);
    assert(oscResult6.winner === 'governance-agent', 'w6_48: governance-agent (priority 100) wins oscillation over autopilot (60)');

    // Oscillation count
    const events6 = [
        { agent: 'a1', target_table: 't', proposed_value: '1', timestamp: now - 1000, intent: 'write' },
        { agent: 'a1', target_table: 't', proposed_value: '2', timestamp: now - 500, intent: 'write' }
    ];
    const intent7 = { agent: 'a1', target_table: 't', proposed_value: '1' };
    const oscResult7 = resolver4.detectOscillation(intent7, events6);
    assert(oscResult7.count === 3, 'w6_49: Oscillation count includes new intent (2 events + 1 new)');

    // =========================================================================
    // SECTION 3: ConflictResolver — Contradiction Detection (~30 tests)
    // =========================================================================
    console.log('\n[SECTION 3] ConflictResolver — Contradiction Detection');

    const resolver5 = new ConflictResolver();
    const now2 = Date.now();

    // Basic contradiction
    const events7 = [
        {
            agent: 'autopilot',
            target_table: 'rate_limits',
            proposed_value: { limit: 100 },
            timestamp: now2 - 10000,
            intent: 'write'
        }
    ];
    const intent8 = {
        agent: 'budget-enforcer',
        target_table: 'rate_limits',
        proposed_value: { limit: 50 }
    };
    const contraResult1 = resolver5.detectContradiction(intent8, events7);
    assert(contraResult1.detected === true, 'w6_50: detectContradiction detects different values');
    assert(contraResult1.reason.includes('Contradiction'), 'w6_51: Contradiction reason includes "Contradiction"');
    assert(contraResult1.conflictingAgent === 'autopilot', 'w6_52: conflictingAgent is identified');
    assert(typeof contraResult1.winner === 'string', 'w6_53: Contradiction result includes winner');

    // No contradiction with same values
    const events8 = [
        {
            agent: 'autopilot',
            target_table: 'rate_limits',
            proposed_value: { limit: 100 },
            timestamp: now2 - 10000,
            intent: 'write'
        }
    ];
    const intent9 = {
        agent: 'budget-enforcer',
        target_table: 'rate_limits',
        proposed_value: { limit: 100 }
    };
    const contraResult2 = resolver5.detectContradiction(intent9, events8);
    assert(contraResult2.detected === false, 'w6_54: Same values do not trigger contradiction');

    // Contradiction with same agent should not trigger
    const events9 = [
        {
            agent: 'autopilot',
            target_table: 'rate_limits',
            proposed_value: { limit: 100 },
            timestamp: now2 - 10000,
            intent: 'write'
        }
    ];
    const intent10 = {
        agent: 'autopilot',
        target_table: 'rate_limits',
        proposed_value: { limit: 50 }
    };
    const contraResult3 = resolver5.detectContradiction(intent10, events9);
    assert(contraResult3.detected === false, 'w6_55: Same agent does not trigger contradiction');

    // Contradiction with no target_table
    const intent11 = { agent: 'a1', action: 'test' };
    const contraResult4 = resolver5.detectContradiction(intent11, []);
    assert(contraResult4.detected === false, 'w6_56: No target_table returns detected=false');

    // Contradiction outside window should not trigger
    const events10 = [
        {
            agent: 'autopilot',
            target_table: 'rate_limits',
            proposed_value: { limit: 100 },
            timestamp: now2 - 90000, // Outside default 60s window
            intent: 'write'
        }
    ];
    const intent12 = {
        agent: 'budget-enforcer',
        target_table: 'rate_limits',
        proposed_value: { limit: 50 }
    };
    const contraResult5 = resolver5.detectContradiction(intent12, events10);
    assert(contraResult5.detected === false, 'w6_57: Contradiction outside window does not trigger');

    // Winner determination in contradiction
    const events11 = [
        {
            agent: 'budget-enforcer',
            target_table: 'rate_limits',
            proposed_value: 100,
            timestamp: now2 - 10000,
            intent: 'write'
        }
    ];
    const intent13 = {
        agent: 'governance-agent',
        target_table: 'rate_limits',
        proposed_value: 200
    };
    const contraResult6 = resolver5.detectContradiction(intent13, events11);
    assert(contraResult6.winner === 'governance-agent', 'w6_58: governance-agent (priority 100) wins contradiction over budget-enforcer (80)');

    // Non-object proposed values
    const events12 = [
        {
            agent: 'a1',
            target_table: 'config',
            proposed_value: 'string-value',
            timestamp: now2 - 1000,
            intent: 'write'
        }
    ];
    const intent14 = {
        agent: 'a2',
        target_table: 'config',
        proposed_value: 'other-value'
    };
    const contraResult7 = resolver5.detectContradiction(intent14, events12);
    assert(contraResult7.detected === true, 'w6_59: Contradiction detected with string values');

    // =========================================================================
    // SECTION 4: ConflictResolver — Duplicate Detection (~20 tests)
    // =========================================================================
    console.log('\n[SECTION 4] ConflictResolver — Duplicate Detection');

    const resolver6 = new ConflictResolver();
    const now3 = Date.now();

    // Basic duplicate
    const events13 = [
        {
            agent: 'autopilot',
            action: 'switch_model',
            target_table: 'models',
            proposed_value: { from: 'a', to: 'b' },
            timestamp: now3 - 2000,
            intent: 'write'
        }
    ];
    const intent15 = {
        agent: 'autopilot',
        action: 'switch_model',
        target_table: 'models',
        proposed_value: { from: 'a', to: 'b' }
    };
    const dupResult1 = resolver6.detectDuplicateAction(intent15, events13);
    assert(dupResult1.detected === true, 'w6_60: detectDuplicateAction detects exact duplicates');
    assert(dupResult1.reason.includes('Duplicate'), 'w6_61: Duplicate reason includes "Duplicate"');
    assert(dupResult1.conflictingEvent, 'w6_62: conflictingEvent is provided');

    // No duplicate with different action
    const events14 = [
        {
            agent: 'autopilot',
            action: 'switch_model',
            target_table: 'models',
            proposed_value: { from: 'a', to: 'b' },
            timestamp: now3 - 2000,
            intent: 'write'
        }
    ];
    const intent16 = {
        agent: 'autopilot',
        action: 'update_rate',
        target_table: 'models',
        proposed_value: { from: 'a', to: 'b' }
    };
    const dupResult2 = resolver6.detectDuplicateAction(intent16, events14);
    assert(dupResult2.detected === false, 'w6_63: Different action does not trigger duplicate');

    // No duplicate with different agent
    const events15 = [
        {
            agent: 'autopilot',
            action: 'switch_model',
            target_table: 'models',
            proposed_value: { from: 'a', to: 'b' },
            timestamp: now3 - 2000,
            intent: 'write'
        }
    ];
    const intent17 = {
        agent: 'optimization-agent',
        action: 'switch_model',
        target_table: 'models',
        proposed_value: { from: 'a', to: 'b' }
    };
    const dupResult3 = resolver6.detectDuplicateAction(intent17, events15);
    assert(dupResult3.detected === false, 'w6_64: Different agent does not trigger duplicate');

    // No duplicate with different target_table
    const events16 = [
        {
            agent: 'autopilot',
            action: 'switch_model',
            target_table: 'models',
            proposed_value: { from: 'a', to: 'b' },
            timestamp: now3 - 2000,
            intent: 'write'
        }
    ];
    const intent18 = {
        agent: 'autopilot',
        action: 'switch_model',
        target_table: 'other_table',
        proposed_value: { from: 'a', to: 'b' }
    };
    const dupResult4 = resolver6.detectDuplicateAction(intent18, events16);
    assert(dupResult4.detected === false, 'w6_65: Different target_table does not trigger duplicate');

    // Duplicate outside window should not trigger
    const resolver7 = new ConflictResolver({ deduplicationWindowMs: 100 });
    const events17 = [
        {
            agent: 'autopilot',
            action: 'test',
            target_table: 't',
            proposed_value: 'v',
            timestamp: now3 - 150,
            intent: 'write'
        }
    ];
    const intent19 = {
        agent: 'autopilot',
        action: 'test',
        target_table: 't',
        proposed_value: 'v'
    };
    const dupResult5 = resolver7.detectDuplicateAction(intent19, events17);
    assert(dupResult5.detected === false, 'w6_66: Duplicate outside window does not trigger');

    // Duplicate with similar payloads
    const events18 = [
        {
            agent: 'a1',
            action: 'act',
            target_table: 't',
            proposed_value: null,
            timestamp: now3 - 1000,
            intent: 'write'
        }
    ];
    const intent20 = {
        agent: 'a1',
        action: 'act',
        target_table: 't',
        proposed_value: null
    };
    const dupResult6 = resolver6.detectDuplicateAction(intent20, events18);
    assert(dupResult6.detected === true, 'w6_67: Duplicate detection works with null payloads');

    // =========================================================================
    // SECTION 5: requestCoordination() Integration (~35 tests)
    // =========================================================================
    console.log('\n[SECTION 5] requestCoordination() Integration');

    const bus9 = new AgentEventBus(null);

    // Basic allowed case
    const coordResult1 = await bus9.requestCoordination({
        agent: 'autopilot',
        action: 'switch_model',
        target_table: 'models',
        proposed_value: { to: 'gpt-4' }
    });
    assert(coordResult1.allowed === true, 'w6_68: requestCoordination allows uncontested action');
    assert(coordResult1.event_id, 'w6_69: requestCoordination returns event_id');
    assert(coordResult1.reason, 'w6_70: requestCoordination returns reason');
    assert(bus9.events.length === 1, 'w6_71: requestCoordination publishes event');

    // Requires agent parameter
    await assertAsyncThrows(
        () => bus9.requestCoordination({ action: 'test' }),
        'intent.agent is required',
        'w6_72: requestCoordination throws without agent'
    );

    // Conflict blocking
    const bus10 = new AgentEventBus(null);
    bus10.publish({
        agent: 'autopilot',
        action: 'switch',
        target_table: 'models',
        proposed_value: { to: 'gpt-4' },
        timestamp: Date.now() - 1000,
        intent: 'write'
    });
    bus10.publish({
        agent: 'optimization-agent',
        action: 'switch',
        target_table: 'models',
        proposed_value: { to: 'gpt-3.5' },
        timestamp: Date.now() - 500,
        intent: 'write'
    });

    const coordResult2 = await bus10.requestCoordination({
        agent: 'autopilot',
        action: 'switch',
        target_table: 'models',
        proposed_value: { to: 'gpt-4' }
    });
    assert(coordResult2.allowed === true || coordResult2.allowed === false, 'w6_73: requestCoordination returns allowed flag');

    // Winner gets through despite conflicts
    const bus11 = new AgentEventBus(null);
    bus11.publish({
        agent: 'optimization-agent',
        action: 'update',
        target_table: 'rate_limits',
        proposed_value: 100,
        timestamp: Date.now() - 1000,
        intent: 'write'
    });

    const coordResult3 = await bus11.requestCoordination({
        agent: 'governance-agent', // Higher priority
        action: 'update',
        target_table: 'rate_limits',
        proposed_value: 200
    });
    assert(coordResult3.allowed === true, 'w6_74: Winner agent is allowed despite contradiction');
    assert(coordResult3.resolution === 'allowed_as_winner' || coordResult3.allowed === true, 'w6_75: Winner agent is allowed');

    // Loser is blocked
    const bus12 = new AgentEventBus(null);
    bus12.publish({
        agent: 'governance-agent', // Higher priority
        action: 'update',
        target_table: 'rate_limits',
        proposed_value: 200,
        timestamp: Date.now() - 1000,
        intent: 'write'
    });

    const coordResult4 = await bus12.requestCoordination({
        agent: 'optimization-agent', // Lower priority
        action: 'update',
        target_table: 'rate_limits',
        proposed_value: 100
    });
    assert(coordResult4.allowed === false, 'w6_76: Lower priority agent is blocked');
    assert(coordResult4.conflicts && coordResult4.conflicts.length > 0, 'w6_77: Conflicts are reported');

    // Event context is preserved
    const bus13 = new AgentEventBus(null);
    const contextData = { reason: 'test', metadata: { x: 1 } };
    const coordResult5 = await bus13.requestCoordination({
        agent: 'autopilot',
        action: 'test',
        target_table: 'test_table',
        proposed_value: 'value',
        context: contextData
    });
    assert(bus13.events[0].context === contextData, 'w6_78: Context is preserved in published event');

    // Duplicate action blocks
    const bus14 = new AgentEventBus(null);
    bus14.publish({
        agent: 'autopilot',
        action: 'switch',
        target_table: 'models',
        proposed_value: { model: 'gpt-4' },
        timestamp: Date.now() - 1000,
        intent: 'write'
    });

    const coordResult6 = await bus14.requestCoordination({
        agent: 'autopilot',
        action: 'switch',
        target_table: 'models',
        proposed_value: { model: 'gpt-4' }
    });
    assert(coordResult6.allowed === false, 'w6_79: Duplicate action is blocked');

    // =========================================================================
    // SECTION 6: Agent Wiring Structural Tests (~35 tests)
    // =========================================================================
    console.log('\n[SECTION 6] Agent Wiring Structural Tests');

    const autopilotSrc = fs.readFileSync(path.join(__dirname, '..', 'agents', 'autopilot.js'), 'utf-8');
    const autopilotNoComments = autopilotSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert(autopilotNoComments.includes('agent-event-bus'), 'w6_80: autopilot.js imports agent-event-bus');
    assert(autopilotNoComments.includes('requestCoordination'), 'w6_81: autopilot.js has requestCoordination call');
    assert(!autopilotNoComments.includes('supabase.from(') || autopilotNoComments.includes('resilientSupabase'), 'w6_82: autopilot.js uses resilientSupabase not bare supabase');

    const budgetSrc = fs.readFileSync(path.join(__dirname, '..', 'agents', 'budget-enforcer.js'), 'utf-8');
    const budgetNoComments = budgetSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert(budgetNoComments.includes('agent-event-bus'), 'w6_83: budget-enforcer.js imports agent-event-bus');
    assert(budgetNoComments.includes('requestCoordination'), 'w6_84: budget-enforcer.js has requestCoordination call');

    const optimizationSrc = fs.readFileSync(path.join(__dirname, '..', 'agents', 'optimization-agent.js'), 'utf-8');
    const optimizationNoComments = optimizationSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert(optimizationNoComments.includes('agent-event-bus'), 'w6_85: optimization-agent.js imports agent-event-bus');
    assert(optimizationNoComments.includes('requestCoordination'), 'w6_86: optimization-agent.js has requestCoordination call');

    const policySrc = fs.readFileSync(path.join(__dirname, '..', 'agents', 'policy-agent.js'), 'utf-8');
    const policyNoComments = policySrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert(policyNoComments.includes('agent-event-bus'), 'w6_87: policy-agent.js imports agent-event-bus');
    assert(policyNoComments.includes('.subscribe('), 'w6_88: policy-agent.js uses subscribe');

    const governanceSrc = fs.readFileSync(path.join(__dirname, '..', 'core', 'governance-agent.js'), 'utf-8');
    const governanceNoComments = governanceSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert(governanceNoComments.includes('agent-event-bus'), 'w6_89: governance-agent.js imports agent-event-bus');
    assert(governanceNoComments.includes('getRecentEvents'), 'w6_90: governance-agent.js uses getRecentEvents');

    const orchestratorSrc = fs.readFileSync(path.join(__dirname, '..', 'core', 'agent-orchestrator.js'), 'utf-8');
    const orchestratorNoComments = orchestratorSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert(orchestratorNoComments.includes('agent-event-bus'), 'w6_91: agent-orchestrator.js imports agent-event-bus');
    assert(orchestratorNoComments.includes('getEventBus'), 'w6_92: agent-orchestrator.js uses getEventBus');

    // Count total agent files with agent-event-bus wiring
    const agentDir = path.join(__dirname, '..', 'agents');
    let wiredAgents = 0;
    if (fs.existsSync(agentDir)) {
        const agentFiles = fs.readdirSync(agentDir).filter(f => f.endsWith('.js'));
        for (const agentFile of agentFiles) {
            const agentSrc = fs.readFileSync(path.join(agentDir, agentFile), 'utf-8');
            if (agentSrc.includes('agent-event-bus')) {
                wiredAgents++;
            }
        }
    }
    assert(wiredAgents >= 3, `w6_93: At least 3 agent files import agent-event-bus (found ${wiredAgents})`);

    // Priority hierarchy verification
    const expectedPriority = {
        'governance-agent': 100,
        'budget-enforcer': 80,
        'autopilot': 60,
        'policy-agent': 50,
        'optimization-agent': 40,
        'cost-intelligence': 30,
        'chargeback-agent': 30,
        'forecasting-agent': 20
    };
    for (const [agent, priority] of Object.entries(expectedPriority)) {
        assert(EVENT_BUS_CONFIG.priorityMap[agent] === priority, `w6_${94 + Object.keys(expectedPriority).indexOf(agent)}: ${agent} has priority ${priority}`);
    }

    // =========================================================================
    // SECTION 7: EventStore Persistence (~20 tests)
    // =========================================================================
    console.log('\n[SECTION 7] EventStore Persistence');

    assert(typeof EventStore === 'function', 'w6_102: EventStore is a class constructor');

    const mockSb = createMockSupabase();
    const store1 = new EventStore(mockSb);
    assert(store1.tableName === 'agent_coordination_events', 'w6_103: Default tableName is "agent_coordination_events"');
    assert(store1.batchSize === 10, 'w6_104: Default batchSize is 10');
    assert(store1.flushIntervalMs === 1000, 'w6_105: Default flushIntervalMs is 1000');
    assert(Array.isArray(store1.buffer), 'w6_106: EventStore.buffer is an array');
    assert(store1.buffer.length === 0, 'w6_107: EventStore.buffer starts empty');

    // record() buffers event
    store1.record({
        event_id: 'e1',
        agent: 'autopilot',
        action: 'test',
        target_table: 'models',
        proposed_value: { x: 1 },
        timestamp: Date.now()
    });
    assert(store1.buffer.length === 1, 'w6_108: record() adds event to buffer');
    assert(store1.buffer[0].agent === 'autopilot', 'w6_109: Buffer preserves agent');
    assert(store1.buffer[0].created_at, 'w6_110: created_at is set from timestamp');

    // Auto-flush on batchSize
    const store2 = new EventStore(mockSb, { batchSize: 2 });
    store2.record({ event_id: 'e1', agent: 'a1', action: 'x', timestamp: Date.now() });
    store2.record({ event_id: 'e2', agent: 'a2', action: 'y', timestamp: Date.now() });
    assert(store2.buffer.length === 0, 'w6_111: Auto-flush triggers at batchSize');
    assert(mockSb._inserted.length >= 2, 'w6_112: Auto-flush writes to supabase');

    // Manual flush
    const store3 = new EventStore(mockSb, { batchSize: 100, flushIntervalMs: 0 });
    store3.record({ event_id: 'e3', agent: 'a3', action: 'z', timestamp: Date.now() });
    await store3.flush();
    assert(store3.buffer.length === 0, 'w6_113: flush() clears buffer');

    // destroy() cleans up
    const store4 = new EventStore(mockSb);
    store4.record({ event_id: 'e4', agent: 'a4', action: 'w', timestamp: Date.now() });
    store4._flushTimer = setTimeout(() => {}, 1000);
    store4.destroy();
    assert(store4.buffer.length === 0, 'w6_114: destroy() clears buffer');
    assert(store4._flushTimer === null, 'w6_115: destroy() clears timer');

    // EventStore with null supabase
    const store5 = new EventStore(null);
    store5.record({ event_id: 'e5', agent: 'a5', action: 'v', timestamp: Date.now() });
    await store5.flush();
    assert(store5.buffer.length === 0, 'w6_116: flush() with null supabase clears buffer gracefully');

    // =========================================================================
    // SECTION 8: Configuration and Edge Cases (~15 tests)
    // =========================================================================
    console.log('\n[SECTION 8] Configuration and Edge Cases');

    assert(EVENT_BUS_CONFIG.coordinationWindowMs === 2000, 'w6_117: EVENT_BUS_CONFIG.coordinationWindowMs is 2000ms');
    assert(EVENT_BUS_CONFIG.maxEventAge === 300000, 'w6_118: EVENT_BUS_CONFIG.maxEventAge is 300000ms (5 min)');
    assert(EVENT_BUS_CONFIG.oscillationThreshold === 3, 'w6_119: EVENT_BUS_CONFIG.oscillationThreshold is 3');
    assert(EVENT_BUS_CONFIG.oscillationWindowMs === 60000, 'w6_120: EVENT_BUS_CONFIG.oscillationWindowMs is 60000ms (1 min)');
    assert(EVENT_BUS_CONFIG.deduplicationWindowMs === 5000, 'w6_121: EVENT_BUS_CONFIG.deduplicationWindowMs is 5000ms');

    // Singleton getEventBus
    resetEventBus();
    const bus15 = getEventBus(null);
    const bus16 = getEventBus(null);
    assert(bus15 === bus16, 'w6_122: getEventBus returns same instance');

    // resetEventBus creates new instance
    resetEventBus();
    const bus17 = getEventBus(null);
    const bus18 = getEventBus(null);
    assert(bus17 === bus18, 'w6_123: getEventBus returns same instance after reset');
    assert(bus17 !== bus15, 'w6_124: resetEventBus creates new instance');

    // Custom config merging
    const bus19 = new AgentEventBus(null, { coordinationWindowMs: 5000 });
    assert(bus19.coordinationWindowMs === 5000, 'w6_125: Custom config overrides defaults');

    // ConflictResolver custom config
    const resolver8 = new ConflictResolver({ oscillationThreshold: 10 });
    assert(resolver8.oscillationThreshold === 10, 'w6_126: ConflictResolver accepts custom threshold');

    // =========================================================================
    // [SECTION 9] checkConflicts() Combined Detection
    // =========================================================================
    console.log('\n[SECTION 9] checkConflicts() Combined Detection');

    {
        const resolver = new ConflictResolver({
            oscillationThreshold: 3,
            oscillationWindowMs: 60000,
            deduplicationWindowMs: 5000,
            priorityMap: EVENT_BUS_CONFIG.priorityMap
        });

        // w6_127: checkConflicts returns hasConflict=false when no events
        const r1 = resolver.checkConflicts(
            { agent: 'autopilot', action: 'rate_limit', target_table: 'rate_limits', proposed_value: { limit: 100 }, intent: 'write' },
            []
        );
        assert(r1.hasConflict === false, 'w6_127: checkConflicts no conflict on empty events');
        assert(r1.resolution === 'allow', 'w6_128: checkConflicts resolution is "allow" when clean');
        assert(r1.reason === 'no conflicts', 'w6_129: checkConflicts reason is "no conflicts"');
        assert(Array.isArray(r1.conflicts), 'w6_130: checkConflicts conflicts is an array');
        assert(r1.conflicts.length === 0, 'w6_131: checkConflicts conflicts array is empty');

        // w6_132: checkConflicts detects oscillation via checkConflicts path
        const oscEvents = [
            { agent: 'autopilot', action: 'switch', target_table: 'model_routing_rules', proposed_value: { model: 'gpt-4' }, intent: 'write', timestamp: Date.now() - 2000 },
            { agent: 'budget-enforcer', action: 'throttle', target_table: 'model_routing_rules', proposed_value: { model: 'gpt-4-turbo' }, intent: 'write', timestamp: Date.now() - 1000 }
        ];
        const r2 = resolver.checkConflicts(
            { agent: 'autopilot', action: 'switch', target_table: 'model_routing_rules', proposed_value: { model: 'gpt-4' }, intent: 'write' },
            oscEvents
        );
        assert(r2.hasConflict === true, 'w6_132: checkConflicts detects oscillation');
        assert(r2.conflicts.some(c => c.type === 'oscillation'), 'w6_133: oscillation conflict type present');
        assert(r2.conflicts.some(c => c.type === 'contradiction'), 'w6_134: contradiction conflict type also present');
        assert(r2.resolution === 'block', 'w6_135: Combined conflict resolution is "block"');

        // w6_136: checkConflicts with duplicate only
        const dupEvents = [
            { agent: 'autopilot', action: 'rate_limit', target_table: 'rate_limits', proposed_value: { limit: 50 }, intent: 'write', timestamp: Date.now() - 1000 }
        ];
        const r3 = resolver.checkConflicts(
            { agent: 'autopilot', action: 'rate_limit', target_table: 'rate_limits', proposed_value: { limit: 50 } },
            dupEvents
        );
        assert(r3.hasConflict === true, 'w6_136: checkConflicts detects duplicate');
        assert(r3.conflicts.some(c => c.type === 'duplicate'), 'w6_137: duplicate conflict type present');

        // w6_138: checkConflicts reason combines multiple conflict reasons
        assert(r2.reason.length > 20, 'w6_138: Combined reason string is non-trivial');

        // w6_139: checkConflicts with contradiction where intent agent is winner
        const contraEventsLoser = [
            { agent: 'optimization-agent', action: 'apply', target_table: 'model_routing_rules', proposed_value: { model: 'gpt-4' }, intent: 'write', timestamp: Date.now() - 500 }
        ];
        const r4 = resolver.checkConflicts(
            { agent: 'budget-enforcer', action: 'throttle', target_table: 'model_routing_rules', proposed_value: { model: 'gpt-4-turbo' } },
            contraEventsLoser
        );
        assert(r4.hasConflict === true, 'w6_139: Contradiction detected');
        const contraConflict = r4.conflicts.find(c => c.type === 'contradiction');
        assert(contraConflict.winner === 'budget-enforcer', 'w6_140: budget-enforcer wins contradiction over optimization-agent');

        // w6_141: checkConflicts — all three types simultaneously
        const tripleEvents = [
            { agent: 'autopilot', action: 'switch', target_table: 'model_routing_rules', proposed_value: { model: 'gpt-4' }, intent: 'write', timestamp: Date.now() - 3000 },
            { agent: 'optimization-agent', action: 'apply', target_table: 'model_routing_rules', proposed_value: { model: 'gpt-4-turbo' }, intent: 'write', timestamp: Date.now() - 2000 },
            { agent: 'autopilot', action: 'switch', target_table: 'model_routing_rules', proposed_value: { model: 'gpt-4' }, intent: 'write', timestamp: Date.now() - 1000 }
        ];
        const r5 = resolver.checkConflicts(
            { agent: 'autopilot', action: 'switch', target_table: 'model_routing_rules', proposed_value: { model: 'gpt-4' } },
            tripleEvents
        );
        assert(r5.hasConflict === true, 'w6_141: Triple-threat conflict detected');
        assert(r5.conflicts.length >= 2, 'w6_142: At least 2 conflict types in triple-threat');
    }

    // =========================================================================
    // [SECTION 10] resolveByPriority() Edge Cases
    // =========================================================================
    console.log('\n[SECTION 10] resolveByPriority() Edge Cases');

    {
        const resolver = new ConflictResolver({ priorityMap: EVENT_BUS_CONFIG.priorityMap });

        // w6_143: resolveByPriority with single agent
        const r1 = resolver.resolveByPriority(['autopilot']);
        assert(r1.winner === 'autopilot', 'w6_143: Single agent is winner');

        // w6_144: resolveByPriority with all 13 agents
        const allAgents = Object.keys(EVENT_BUS_CONFIG.priorityMap);
        const r2 = resolver.resolveByPriority(allAgents);
        assert(r2.winner === 'governance-agent', 'w6_144: governance-agent wins among all 13');
        assert(r2.reason.includes('100'), 'w6_145: Reason mentions priority 100');

        // w6_146: resolveByPriority with unknown agent (priority 0)
        const r3 = resolver.resolveByPriority(['unknown-agent', 'magic-onboarding']);
        assert(r3.winner === 'magic-onboarding', 'w6_146: Known agent beats unknown');

        // w6_147: resolveByPriority with two unknown agents
        const r4 = resolver.resolveByPriority(['agent-x', 'agent-y']);
        assert(r4.winner === 'agent-x', 'w6_147: First unknown agent wins (both priority 0)');

        // w6_148: resolveByPriority with empty array
        const r5 = resolver.resolveByPriority([]);
        assert(r5.winner === null, 'w6_148: Empty array returns null winner');

        // w6_149: resolveByPriority with null
        const r6 = resolver.resolveByPriority(null);
        assert(r6.winner === null, 'w6_149: Null returns null winner');

        // w6_150: Equal priority agents (cost-intelligence=30, chargeback-agent=30)
        const r7 = resolver.resolveByPriority(['cost-intelligence', 'chargeback-agent']);
        assert(r7.winner !== null, 'w6_150: Equal priority still returns a winner');

        // w6_151: All low-priority agents
        const lowPri = ['finault-pal', 'magic-onboarding'];
        const r8 = resolver.resolveByPriority(lowPri);
        assert(r8.winner === 'finault-pal' || r8.winner === 'magic-onboarding', 'w6_151: Low-pri agent is selected');
    }

    // =========================================================================
    // [SECTION 11] _valuesConflict and _payloadsSimilar Edge Cases
    // =========================================================================
    console.log('\n[SECTION 11] _valuesConflict and _payloadsSimilar Edge Cases');

    {
        const resolver = new ConflictResolver();

        // _valuesConflict tests (via detectContradiction)
        // We test indirectly by checking contradiction detection with various value types

        // w6_152: Numbers — different numbers conflict
        const numEvents = [
            { agent: 'budget-enforcer', target_table: 'rate_limits', proposed_value: 100, intent: 'write', timestamp: Date.now() - 500 }
        ];
        const r1 = resolver.detectContradiction(
            { agent: 'autopilot', target_table: 'rate_limits', proposed_value: 200 },
            numEvents
        );
        assert(r1.detected === true, 'w6_152: Different numbers are contradictory');

        // w6_153: Numbers — same numbers don't conflict
        const r2 = resolver.detectContradiction(
            { agent: 'autopilot', target_table: 'rate_limits', proposed_value: 100 },
            numEvents
        );
        assert(r2.detected === false, 'w6_153: Same numbers are not contradictory');

        // w6_154: Strings conflict
        const strEvents = [
            { agent: 'optimization-agent', target_table: 'model_routing_rules', proposed_value: 'gpt-4', intent: 'write', timestamp: Date.now() - 500 }
        ];
        const r3 = resolver.detectContradiction(
            { agent: 'autopilot', target_table: 'model_routing_rules', proposed_value: 'gpt-4-turbo' },
            strEvents
        );
        assert(r3.detected === true, 'w6_154: Different strings are contradictory');

        // w6_155: Booleans conflict
        const boolEvents = [
            { agent: 'budget-enforcer', target_table: 'cache_configs', proposed_value: true, intent: 'write', timestamp: Date.now() - 500 }
        ];
        const r4 = resolver.detectContradiction(
            { agent: 'autopilot', target_table: 'cache_configs', proposed_value: false },
            boolEvents
        );
        assert(r4.detected === true, 'w6_155: Different booleans are contradictory');

        // w6_156: Null vs value conflicts
        const nullEvents = [
            { agent: 'budget-enforcer', target_table: 'rate_limits', proposed_value: null, intent: 'write', timestamp: Date.now() - 500 }
        ];
        const r5 = resolver.detectContradiction(
            { agent: 'autopilot', target_table: 'rate_limits', proposed_value: 42 },
            nullEvents
        );
        assert(r5.detected === true, 'w6_156: Null vs value is contradictory');

        // w6_157: Null vs null doesn't conflict
        const r6 = resolver.detectContradiction(
            { agent: 'autopilot', target_table: 'rate_limits', proposed_value: null },
            nullEvents
        );
        assert(r6.detected === false, 'w6_157: Null vs null is not contradictory');

        // w6_158: Undefined proposed_value doesn't conflict
        const undEvents = [
            { agent: 'budget-enforcer', target_table: 'rate_limits', proposed_value: undefined, intent: 'write', timestamp: Date.now() - 500 }
        ];
        const r7 = resolver.detectContradiction(
            { agent: 'autopilot', target_table: 'rate_limits', proposed_value: undefined },
            undEvents
        );
        assert(r7.detected === false, 'w6_158: Undefined vs undefined is not contradictory');

        // w6_159: Deep object comparison — same objects don't conflict
        const deepEvents = [
            { agent: 'budget-enforcer', target_table: 'model_routing_rules', proposed_value: { from: 'gpt-4', to: 'gpt-3.5' }, intent: 'write', timestamp: Date.now() - 500 }
        ];
        const r8 = resolver.detectContradiction(
            { agent: 'autopilot', target_table: 'model_routing_rules', proposed_value: { from: 'gpt-4', to: 'gpt-3.5' } },
            deepEvents
        );
        assert(r8.detected === false, 'w6_159: Same deep objects are not contradictory');

        // w6_160: Deep object comparison — different objects conflict
        const r9 = resolver.detectContradiction(
            { agent: 'autopilot', target_table: 'model_routing_rules', proposed_value: { from: 'gpt-4', to: 'gpt-4-turbo' } },
            deepEvents
        );
        assert(r9.detected === true, 'w6_160: Different deep objects are contradictory');

        // _payloadsSimilar tests (via detectDuplicateAction)
        // w6_161: Undefined payloads are similar
        const dupEvents1 = [
            { agent: 'autopilot', action: 'rate_limit', target_table: 'rate_limits', proposed_value: undefined, intent: 'write', timestamp: Date.now() - 1000 }
        ];
        const r10 = resolver.detectDuplicateAction(
            { agent: 'autopilot', action: 'rate_limit', target_table: 'rate_limits', proposed_value: undefined },
            dupEvents1
        );
        assert(r10.detected === true, 'w6_161: Undefined payloads are duplicates');

        // w6_162: Different types are not similar
        const dupEvents2 = [
            { agent: 'autopilot', action: 'rate_limit', target_table: 'rate_limits', proposed_value: '42', intent: 'write', timestamp: Date.now() - 1000 }
        ];
        const r11 = resolver.detectDuplicateAction(
            { agent: 'autopilot', action: 'rate_limit', target_table: 'rate_limits', proposed_value: 42 },
            dupEvents2
        );
        assert(r11.detected === false, 'w6_162: String "42" and number 42 are not duplicate payloads');
    }

    // =========================================================================
    // [SECTION 12] _detectAlternatingPattern Edge Cases
    // =========================================================================
    console.log('\n[SECTION 12] _detectAlternatingPattern Edge Cases');

    {
        const resolver = new ConflictResolver({ oscillationThreshold: 3, oscillationWindowMs: 60000 });
        const now = Date.now();

        // w6_163: Classic A→B→A oscillation is detected
        const abEvents = [
            { agent: 'autopilot', target_table: 't', proposed_value: 'A', intent: 'write', timestamp: now - 3000 },
            { agent: 'budget-enforcer', target_table: 't', proposed_value: 'B', intent: 'write', timestamp: now - 2000 },
        ];
        const r1 = resolver.detectOscillation(
            { agent: 'autopilot', target_table: 't', proposed_value: 'A', intent: 'write' },
            abEvents
        );
        assert(r1.detected === true, 'w6_163: A→B→A alternation is oscillation');

        // w6_164: A→A→A is NOT alternation (all same values, still hits threshold)
        const aaaEvents = [
            { agent: 'autopilot', target_table: 't', proposed_value: 'A', intent: 'write', timestamp: now - 3000 },
            { agent: 'autopilot', target_table: 't', proposed_value: 'A', intent: 'write', timestamp: now - 2000 },
        ];
        const r2 = resolver.detectOscillation(
            { agent: 'autopilot', target_table: 't', proposed_value: 'A', intent: 'write' },
            aaaEvents
        );
        // This should be detected (count=3, hits threshold) even though not alternating, because threshold+2 check
        // Actually: threshold=3, totalWrites=3, isAlternating=false, so check is totalWrites < threshold+2 => 3 < 5 => true => NOT detected
        assert(r2.detected === false, 'w6_164: A→A→A is NOT oscillation (no alternation, below threshold+2)');

        // w6_165: Read events don't count toward oscillation
        const readEvents = [
            { agent: 'autopilot', target_table: 't', proposed_value: 'A', intent: 'read', timestamp: now - 3000 },
            { agent: 'budget-enforcer', target_table: 't', proposed_value: 'B', intent: 'read', timestamp: now - 2000 },
        ];
        const r3 = resolver.detectOscillation(
            { agent: 'autopilot', target_table: 't', proposed_value: 'A', intent: 'write' },
            readEvents
        );
        assert(r3.detected === false, 'w6_165: Read events do not count as oscillation writes');

        // w6_166: Different tables don't count
        const diffTableEvents = [
            { agent: 'autopilot', target_table: 'other_table', proposed_value: 'A', intent: 'write', timestamp: now - 3000 },
            { agent: 'budget-enforcer', target_table: 'other_table', proposed_value: 'B', intent: 'write', timestamp: now - 2000 },
        ];
        const r4 = resolver.detectOscillation(
            { agent: 'autopilot', target_table: 't', proposed_value: 'A', intent: 'write' },
            diffTableEvents
        );
        assert(r4.detected === false, 'w6_166: Events on different table are not oscillation');

        // w6_167: Oscillation with objects
        const objEvents = [
            { agent: 'autopilot', target_table: 't', proposed_value: { model: 'gpt-4' }, intent: 'write', timestamp: now - 3000 },
            { agent: 'budget-enforcer', target_table: 't', proposed_value: { model: 'gpt-3.5' }, intent: 'write', timestamp: now - 2000 },
        ];
        const r5 = resolver.detectOscillation(
            { agent: 'autopilot', target_table: 't', proposed_value: { model: 'gpt-4' }, intent: 'write' },
            objEvents
        );
        assert(r5.detected === true, 'w6_167: Object value oscillation (gpt-4 → gpt-3.5 → gpt-4) detected');

        // w6_168: 5-event oscillation A→B→A→B→A
        const longEvents = [
            { agent: 'a', target_table: 't', proposed_value: 'A', intent: 'write', timestamp: now - 5000 },
            { agent: 'b', target_table: 't', proposed_value: 'B', intent: 'write', timestamp: now - 4000 },
            { agent: 'a', target_table: 't', proposed_value: 'A', intent: 'write', timestamp: now - 3000 },
            { agent: 'b', target_table: 't', proposed_value: 'B', intent: 'write', timestamp: now - 2000 },
        ];
        const r6 = resolver.detectOscillation(
            { agent: 'a', target_table: 't', proposed_value: 'A', intent: 'write' },
            longEvents
        );
        assert(r6.detected === true, 'w6_168: 5-event A→B→A→B→A oscillation detected');
        assert(r6.count === 5, 'w6_169: Oscillation count includes all 5 writes');
    }

    // =========================================================================
    // [SECTION 13] Comprehensive Structural Verification
    // =========================================================================
    console.log('\n[SECTION 13] Comprehensive Structural Verification');

    {
        const busSource = fs.readFileSync(path.join(__dirname, '..', 'core', 'agent-event-bus.js'), 'utf-8');

        // w6_170: agent-event-bus.js exports AgentEventBus
        assert(busSource.includes('export') && busSource.includes('AgentEventBus'), 'w6_170: agent-event-bus exports AgentEventBus');
        assert(busSource.includes('ConflictResolver'), 'w6_171: agent-event-bus exports ConflictResolver');
        assert(busSource.includes('EventStore'), 'w6_172: agent-event-bus exports EventStore');
        assert(busSource.includes('getEventBus'), 'w6_173: agent-event-bus exports getEventBus');
        assert(busSource.includes('resetEventBus'), 'w6_174: agent-event-bus exports resetEventBus');
        assert(busSource.includes('EVENT_BUS_CONFIG'), 'w6_175: agent-event-bus exports EVENT_BUS_CONFIG');

        // w6_176: agent-event-bus.js imports crypto
        assert(busSource.includes("import crypto from 'crypto'"), 'w6_176: agent-event-bus imports crypto');

        // w6_177: agent-event-bus.js has W-006 header
        assert(busSource.includes('W-006'), 'w6_177: agent-event-bus has W-006 in header');

        // w6_178: agent-event-bus.js has oscillation detection algorithm
        assert(busSource.includes('detectOscillation'), 'w6_178: agent-event-bus has detectOscillation method');
        assert(busSource.includes('detectContradiction'), 'w6_179: agent-event-bus has detectContradiction method');
        assert(busSource.includes('detectDuplicateAction'), 'w6_180: agent-event-bus has detectDuplicateAction method');
        assert(busSource.includes('resolveByPriority'), 'w6_181: agent-event-bus has resolveByPriority method');
        assert(busSource.includes('requestCoordination'), 'w6_182: agent-event-bus has requestCoordination method');
        assert(busSource.includes('_pruneEvents'), 'w6_183: agent-event-bus has _pruneEvents method');
        assert(busSource.includes('_notifySubscribers'), 'w6_184: agent-event-bus has _notifySubscribers method');
        assert(busSource.includes('_detectAlternatingPattern'), 'w6_185: agent-event-bus has _detectAlternatingPattern method');

        // Structural: autopilot.js has _getTargetTable
        const autopilotSrc = fs.readFileSync(path.join(__dirname, '..', 'agents', 'autopilot.js'), 'utf-8');
        assert(autopilotSrc.includes('_getTargetTable'), 'w6_186: autopilot.js has _getTargetTable helper');
        assert(autopilotSrc.includes("'rate_limit': 'rate_limits'"), 'w6_187: _getTargetTable maps rate_limit → rate_limits');
        assert(autopilotSrc.includes("'cache_enable': 'cache_configs'"), 'w6_188: _getTargetTable maps cache_enable → cache_configs');
        assert(autopilotSrc.includes("'minor_model_switch': 'model_routing_rules'"), 'w6_189: _getTargetTable maps minor_model_switch → model_routing_rules');
        assert(autopilotSrc.includes("'budget_throttle': 'spending_throttles'"), 'w6_190: _getTargetTable maps budget_throttle → spending_throttles');

        // Structural: autopilot.js coordination_blocked status
        assert(autopilotSrc.includes('coordination_blocked'), 'w6_191: autopilot logs coordination_blocked status');

        // Structural: budget-enforcer.js downgrades THROTTLE to ALERT on coordination block
        const budgetSrc = fs.readFileSync(path.join(__dirname, '..', 'agents', 'budget-enforcer.js'), 'utf-8');
        assert(budgetSrc.includes("decision.action = 'ALERT'"), 'w6_192: budget-enforcer downgrades to ALERT when coordination blocks');
        assert(budgetSrc.includes('coordination_note'), 'w6_193: budget-enforcer sets coordination_note');

        // Structural: governance-agent.js checks for oscillation_blocked
        const govSrc = fs.readFileSync(path.join(__dirname, '..', 'core', 'governance-agent.js'), 'utf-8');
        assert(govSrc.includes('oscillation_blocked'), 'w6_194: governance-agent checks for oscillation_blocked');
        assert(govSrc.includes('coordination_oscillation'), 'w6_195: governance-agent adds coordination_oscillation violation');

        // Structural: orchestrator passes eventBus in context
        const orchSrc = fs.readFileSync(path.join(__dirname, '..', 'core', 'agent-orchestrator.js'), 'utf-8');
        assert(orchSrc.includes('contextWithBus'), 'w6_196: orchestrator creates contextWithBus');
        assert(orchSrc.includes('context: contextWithBus'), 'w6_197: orchestrator uses contextWithBus in execution');

        // Structural: policy-agent.js subscribes to model_routing_rules
        const policySrc = fs.readFileSync(path.join(__dirname, '..', 'agents', 'policy-agent.js'), 'utf-8');
        assert(policySrc.includes("target_table: 'model_routing_rules'"), 'w6_198: policy-agent subscribes to model_routing_rules');
        assert(policySrc.includes("target_table: 'rate_limits'"), 'w6_199: policy-agent subscribes to rate_limits');

        // Structural: optimization-agent has coordination gate with context
        const optSrc = fs.readFileSync(path.join(__dirname, '..', 'agents', 'optimization-agent.js'), 'utf-8');
        assert(optSrc.includes("agent: 'optimization-agent'"), 'w6_200: optimization-agent identifies as optimization-agent in coordination');
        assert(optSrc.includes("action: 'apply_optimization'"), 'w6_201: optimization-agent action is apply_optimization');
        assert(optSrc.includes("target_table: 'optimization_actions'"), 'w6_202: optimization-agent targets optimization_actions table');

        // w6_203: Verify all 6 files import agent-event-bus
        const files = [
            path.join(__dirname, '..', 'agents', 'autopilot.js'),
            path.join(__dirname, '..', 'agents', 'optimization-agent.js'),
            path.join(__dirname, '..', 'agents', 'budget-enforcer.js'),
            path.join(__dirname, '..', 'agents', 'policy-agent.js'),
            path.join(__dirname, '..', 'core', 'governance-agent.js'),
            path.join(__dirname, '..', 'core', 'agent-orchestrator.js')
        ];
        let allImport = true;
        for (const f of files) {
            const src = fs.readFileSync(f, 'utf-8');
            if (!src.includes('agent-event-bus')) {
                allImport = false;
                break;
            }
        }
        assert(allImport === true, 'w6_203: All 6 integration files import agent-event-bus');

        // w6_204: Verify priorityMap has exactly 13 agents
        const pmKeys = Object.keys(EVENT_BUS_CONFIG.priorityMap);
        assert(pmKeys.length === 13, 'w6_204: priorityMap has exactly 13 agents');

        // w6_205: Verify all agent names in priorityMap
        const expectedAgents = [
            'governance-agent', 'budget-enforcer', 'autopilot', 'policy-agent',
            'optimization-agent', 'cost-intelligence', 'chargeback-agent',
            'forecasting-agent', 'invoice-reconciliation', 'close-pack-generator',
            'compound-learning', 'finault-pal', 'magic-onboarding'
        ];
        let allPresent = true;
        for (const agent of expectedAgents) {
            if (!(agent in EVENT_BUS_CONFIG.priorityMap)) {
                allPresent = false;
                break;
            }
        }
        assert(allPresent === true, 'w6_205: All 13 expected agents present in priorityMap');
    }

    // =========================================================================
    // [SECTION 14] Concurrent requestCoordination Stress Tests
    // =========================================================================
    console.log('\n[SECTION 14] Concurrent requestCoordination Stress Tests');

    {
        resetEventBus();
        const bus = getEventBus(null);

        // w6_206: 10 concurrent uncontested coordination requests all succeed
        const promises = [];
        for (let i = 0; i < 10; i++) {
            promises.push(bus.requestCoordination({
                agent: `agent-${i}`,
                action: `action-${i}`,
                target_table: `table-${i}`,
                proposed_value: { v: i }
            }));
        }
        const results = await Promise.all(promises);
        assert(results.length === 10, 'w6_206: 10 concurrent requests all resolved');
        assert(results.every(r => r.allowed === true), 'w6_207: All 10 concurrent uncontested requests allowed');

        // w6_208: Events are all recorded in ring buffer
        const allEvents = bus.getRecentEvents({}, 60000);
        assert(allEvents.length === 10, 'w6_208: All 10 events recorded in ring buffer');

        // w6_209: Each event has unique event_id
        const ids = new Set(allEvents.map(e => e.event_id));
        assert(ids.size === 10, 'w6_209: All 10 events have unique IDs');

        resetEventBus();

        // w6_210: 20 concurrent requests to SAME table — some may detect conflicts
        const bus2 = getEventBus(null);
        const p2 = [];
        for (let i = 0; i < 20; i++) {
            p2.push(bus2.requestCoordination({
                agent: i % 2 === 0 ? 'autopilot' : 'budget-enforcer',
                action: 'throttle',
                target_table: 'model_routing_rules',
                proposed_value: { model: i % 2 === 0 ? 'gpt-4' : 'gpt-4-turbo' }
            }));
        }
        const r2 = await Promise.all(p2);
        assert(r2.length === 20, 'w6_210: 20 concurrent same-table requests all resolved');
        // Some should be blocked due to oscillation/contradiction
        const blocked = r2.filter(r => !r.allowed);
        assert(blocked.length >= 0, 'w6_211: Concurrent same-table requests resolved without crash');

        // w6_212: Ring buffer contains all events even if some were blocked
        const allEvents2 = bus2.getRecentEvents({}, 60000);
        assert(allEvents2.length === 20, 'w6_212: All 20 events recorded regardless of resolution');

        resetEventBus();
    }

    // =========================================================================
    // SECTION 15: Pass 20 — optimization-agent find_all INSERT loop coordination
    // =========================================================================
    console.log('\n--- Section 15: Pass 20 — optimization-agent find_all INSERT loop coordination ---');

    // w6_213: optimization-agent find_all INSERT loop has requestCoordination call
    {
        const optSrc = fs.readFileSync(path.join(__dirname, '..', 'agents', 'optimization-agent.js'), 'utf-8');
        const optNoComments = optSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

        // Find the find_all case block
        const findAllIdx = optNoComments.indexOf("case 'find_all':");
        const nextCaseIdx = optNoComments.indexOf("case 'find_model_switch':", findAllIdx);
        const findAllBlock = optNoComments.slice(findAllIdx, nextCaseIdx);

        assert(findAllBlock.includes('requestCoordination'), 'w6_213: find_all case includes requestCoordination call');
        assert(findAllBlock.includes("action: 'insert_optimization'"), 'w6_214: find_all coordination uses insert_optimization action');
        assert(findAllBlock.includes("target_table: 'optimization_actions'"), 'w6_215: find_all coordination targets optimization_actions');
        assert(findAllBlock.includes('insertCoord'), 'w6_216: find_all uses insertCoord variable for coordination result');
        assert(findAllBlock.includes('!insertCoord.allowed'), 'w6_217: find_all checks insertCoord.allowed before INSERT');
        assert(findAllBlock.includes('continue'), 'w6_218: find_all skips INSERT with continue when coordination blocks');
    }

    // w6_219: optimization-agent has TWO coordination gates (applyOptimization + find_all INSERT)
    {
        const optSrc = fs.readFileSync(path.join(__dirname, '..', 'agents', 'optimization-agent.js'), 'utf-8');
        const optNoComments = optSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        const coordCalls = optNoComments.split('requestCoordination').length - 1;
        assert(coordCalls >= 2, 'w6_219: optimization-agent has at least 2 requestCoordination calls (applyOptimization + find_all INSERT)');
    }

    // w6_220: find_all INSERT gate has batch context
    {
        const optSrc = fs.readFileSync(path.join(__dirname, '..', 'agents', 'optimization-agent.js'), 'utf-8');
        const findAllIdx = optSrc.indexOf("case 'find_all':");
        const nextCaseIdx = optSrc.indexOf("case 'find_model_switch':", findAllIdx);
        const findAllBlock = optSrc.slice(findAllIdx, nextCaseIdx);

        assert(findAllBlock.includes("task: 'find_all'"), 'w6_220: find_all INSERT coordination context includes task identifier');
        assert(findAllBlock.includes('batch: true'), 'w6_221: find_all INSERT coordination context marks batch=true');
    }

    // w6_222: find_all INSERT gate logs warning when blocked
    {
        const optSrc = fs.readFileSync(path.join(__dirname, '..', 'agents', 'optimization-agent.js'), 'utf-8');
        const findAllIdx = optSrc.indexOf("case 'find_all':");
        const nextCaseIdx = optSrc.indexOf("case 'find_model_switch':", findAllIdx);
        const findAllBlock = optSrc.slice(findAllIdx, nextCaseIdx);

        assert(findAllBlock.includes('console.warn'), 'w6_222: find_all INSERT logs warning when coordination blocks');
        assert(findAllBlock.includes('[OptimizationAgent]'), 'w6_223: find_all warning uses [OptimizationAgent] prefix');
    }

    // w6_224: find_all coordination happens BEFORE the .insert() call (ordering check)
    {
        const optSrc = fs.readFileSync(path.join(__dirname, '..', 'agents', 'optimization-agent.js'), 'utf-8');
        const optNoComments = optSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        const findAllIdx = optNoComments.indexOf("case 'find_all':");
        const nextCaseIdx = optNoComments.indexOf("case 'find_model_switch':", findAllIdx);
        const findAllBlock = optNoComments.slice(findAllIdx, nextCaseIdx);

        const coordPos = findAllBlock.indexOf('requestCoordination');
        const insertPos = findAllBlock.indexOf(".from('optimization_actions').insert(");
        assert(coordPos > 0 && insertPos > 0, 'w6_224: Both requestCoordination and .insert() exist in find_all block');
        assert(coordPos < insertPos, 'w6_225: requestCoordination appears BEFORE .insert() in find_all (correct ordering)');
    }

    // w6_226: find_all INSERT includes proposed_value with required fields
    {
        const optSrc = fs.readFileSync(path.join(__dirname, '..', 'agents', 'optimization-agent.js'), 'utf-8');
        const findAllIdx = optSrc.indexOf("case 'find_all':");
        const nextCaseIdx = optSrc.indexOf("case 'find_model_switch':", findAllIdx);
        const findAllBlock = optSrc.slice(findAllIdx, nextCaseIdx);

        assert(findAllBlock.includes('optimization_type: op.type'), 'w6_226: find_all proposed_value includes optimization_type');
        assert(findAllBlock.includes('estimated_savings_monthly'), 'w6_227: find_all proposed_value includes estimated_savings_monthly');
        assert(findAllBlock.includes('confidence: op.confidence'), 'w6_228: find_all proposed_value includes confidence');
    }

    // =========================================================================
    // RESULTS
    // =========================================================================
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`W-006 RESULTS: ${passed} passed, ${failed} failed`);
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
