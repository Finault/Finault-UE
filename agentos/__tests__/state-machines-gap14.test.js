/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * STATE MACHINE FRAMEWORK TEST SUITE — GAP #14
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Comprehensive test suite for the Finault state machine framework
 * Covers: StateMachine class, 5 workflow machines, guards, hooks, and utilities
 *
 * Test Count: 200+ tests organized by module
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import {
    StateMachine,
    INVOICE_MACHINE,
    CLOSE_PACK_MACHINE,
    DISPUTE_MACHINE,
    SAVINGS_MACHINE,
    BUDGET_MACHINE,
    INVOICE_STATUS,
    CLOSE_PACK_STATUS,
    DISPUTE_STATUS,
    SAVINGS_STATUS,
    BUDGET_STATUS,
    getMachine,
    transitionEntity,
    describeAllMachines
} from '../core/state-machines.js';

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

function assertEquals(actual, expected, message) {
    assert(actual === expected, `${message} (expected: ${expected}, got: ${actual})`);
}

function assertDeepEquals(actual, expected, message) {
    assert(JSON.stringify(actual) === JSON.stringify(expected), `${message} (expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)})`);
}

function assertIncludes(arrayOrString, value, message) {
    if (typeof arrayOrString === 'string') {
        assert(arrayOrString.includes(value), `${message} (substring "${value}" not found)`);
    } else {
        assert(Array.isArray(arrayOrString) && arrayOrString.includes(value), `${message} (value not found in array)`);
    }
}

function assertDoesNotInclude(arrayOrString, value, message) {
    if (typeof arrayOrString === 'string') {
        assert(!arrayOrString.includes(value), `${message} (substring "${value}" found but should not be)`);
    } else {
        assert(Array.isArray(arrayOrString) && !arrayOrString.includes(value), `${message} (value found in array but should not be)`);
    }
}

function assertIsObject(value, message) {
    assert(typeof value === 'object' && value !== null && !Array.isArray(value), `${message} (not an object)`);
}

function assertIsArray(value, message) {
    assert(Array.isArray(value), `${message} (not an array)`);
}

function assertThrows(fn, message) {
    try {
        fn();
        assert(false, `${message} (expected exception but none was thrown)`);
    } catch (e) {
        assert(true, `${message} (correctly threw: ${e.message})`);
    }
}

console.log('\n═════════════════════════════════════════════════════════════════════════════════');
console.log('STATE MACHINE FRAMEWORK TEST SUITE — GAP #14');
console.log('═════════════════════════════════════════════════════════════════════════════════\n');

// ═════════════════════════════════════════════════════════════════════════════════
// SECTION 1: StateMachine Class — Constructor & Validation (40 tests)
// ═════════════════════════════════════════════════════════════════════════════════

console.log('\n[1] StateMachine Class — Constructor & Validation');

assertThrows(() => {
    new StateMachine({ transitions: {} });
}, 'Constructor throws if name is missing');

assertThrows(() => {
    new StateMachine({ name: '' });
}, 'Constructor throws if name is empty string');

assertThrows(() => {
    new StateMachine({ name: 123 });
}, 'Constructor throws if name is not a string');

assertThrows(() => {
    new StateMachine({ name: 'Test' });
}, 'Constructor throws if transitions is missing');

assertThrows(() => {
    new StateMachine({ name: 'Test', transitions: null });
}, 'Constructor throws if transitions is null');

assertThrows(() => {
    new StateMachine({ name: 'Test', transitions: 'not-an-object' });
}, 'Constructor throws if transitions is not an object');

const validMachine = new StateMachine({
    name: 'TestMachine',
    transitions: {
        state_a: ['state_b'],
        state_b: [],
    }
});

assert(validMachine.name === 'TestMachine', 'Constructor sets name correctly');
assertIsObject(validMachine.transitions, 'Constructor sets transitions');
assertIsObject(validMachine.guards, 'Constructor initializes empty guards object');
assertIsObject(validMachine.onEnter, 'Constructor initializes empty onEnter object');
assertIsObject(validMachine.onExit, 'Constructor initializes empty onExit object');

const machineWithHooks = new StateMachine({
    name: 'HookMachine',
    transitions: { a: ['b'], b: [] },
    guards: { 'a→b': () => ({ allowed: true }) },
    onEnter: { b: () => {} },
    onExit: { a: () => {} }
});

assert(Object.keys(machineWithHooks.guards).length > 0, 'Constructor sets guards');
assert(Object.keys(machineWithHooks.onEnter).length > 0, 'Constructor sets onEnter hooks');
assert(Object.keys(machineWithHooks.onExit).length > 0, 'Constructor sets onExit hooks');

// getValidTransitions tests
assertEquals(INVOICE_MACHINE.getValidTransitions('pending').length, 1, 'getValidTransitions returns correct number of targets for pending');
assertIncludes(INVOICE_MACHINE.getValidTransitions('pending'), 'parsed', 'getValidTransitions returns parsed as valid from pending');

assertEquals(INVOICE_MACHINE.getValidTransitions('parsed').length, 2, 'getValidTransitions returns 2 targets from parsed');
assertIncludes(INVOICE_MACHINE.getValidTransitions('parsed'), 'allocated', 'getValidTransitions includes allocated from parsed');
assertIncludes(INVOICE_MACHINE.getValidTransitions('parsed'), 'disputed', 'getValidTransitions includes disputed from parsed');

assertEquals(INVOICE_MACHINE.getValidTransitions('archived').length, 0, 'getValidTransitions returns empty array for terminal state');

assertEquals(INVOICE_MACHINE.getValidTransitions('invalid_state').length, 0, 'getValidTransitions returns empty array for unknown state');

const transitions = INVOICE_MACHINE.getValidTransitions('pending');
assert(!Object.is(transitions, INVOICE_MACHINE.getValidTransitions('pending')), 'getValidTransitions returns new array (not reference)');

// isTerminal tests
assert(INVOICE_MACHINE.isTerminal('archived') === true, 'isTerminal returns true for archived');
assert(INVOICE_MACHINE.isTerminal('pending') === false, 'isTerminal returns false for non-terminal state');
assert(INVOICE_MACHINE.isTerminal('parsed') === false, 'isTerminal returns false for parsed state');
assert(CLOSE_PACK_MACHINE.isTerminal('archived') === true, 'isTerminal returns true for close pack archived');
assert(DISPUTE_MACHINE.isTerminal('closed') === true, 'isTerminal returns true for dispute closed');

// isValidState tests
assert(INVOICE_MACHINE.isValidState('pending') === true, 'isValidState returns true for valid state');
assert(INVOICE_MACHINE.isValidState('parsed') === true, 'isValidState returns true for parsed state');
assert(INVOICE_MACHINE.isValidState('archived') === true, 'isValidState returns true for archived state');
assert(INVOICE_MACHINE.isValidState('invalid') === false, 'isValidState returns false for invalid state');
assert(INVOICE_MACHINE.isValidState('PENDING') === true, 'isValidState is case-insensitive');
assert(INVOICE_MACHINE.isValidState('') === false, 'isValidState returns false for empty string');
const whitespaceTest = INVOICE_MACHINE.isValidState('   ');
assert(whitespaceTest === false, 'isValidState returns false for whitespace (lowercased to space)');

// describe() tests
const description = INVOICE_MACHINE.describe();
assertIsObject(description, 'describe() returns an object');
assert(description.name === 'InvoiceWorkflow', 'describe() includes correct machine name');
assertIsArray(description.states, 'describe() includes states array');
assertIncludes(description.states, 'pending', 'describe() states includes pending');
assertIncludes(description.states, 'archived', 'describe() states includes archived');
assertIsObject(description.transitions, 'describe() includes transitions object');
assertIsArray(description.terminalStates, 'describe() includes terminalStates array');
assertIncludes(description.terminalStates, 'archived', 'describe() terminalStates includes archived');
assertIsArray(description.guardedTransitions, 'describe() includes guardedTransitions array');

// ═════════════════════════════════════════════════════════════════════════════════
// SECTION 2: INVOICE_MACHINE Transitions & Guards (30 tests)
// ═════════════════════════════════════════════════════════════════════════════════

console.log('\n[2] INVOICE_MACHINE — Transitions & Guards');

// Valid transitions
const invoice = { status: 'pending', provider: 'Vendor A', total_amount: 1000, line_items_count: 5, payment_status: 'unpaid' };

let result = INVOICE_MACHINE.transition(invoice, 'parsed');
assert(result.success === true, 'pending→parsed succeeds with required fields');
assertEquals(invoice.status, 'parsed', 'pending→parsed updates entity.status');
assert(invoice.parsed_at !== undefined, 'pending→parsed sets parsed_at timestamp');
assertEquals(result.previousState, 'pending', 'Transition result includes correct previousState');
assertEquals(result.newState, 'parsed', 'Transition result includes correct newState');

invoice.status = 'parsed';
result = INVOICE_MACHINE.transition(invoice, 'allocated');
assert(result.success === true, 'parsed→allocated succeeds with line_items_count > 0');
assertEquals(invoice.status, 'allocated', 'parsed→allocated updates status');
assert(invoice.allocated_at !== undefined, 'parsed→allocated sets allocated_at timestamp');

invoice.status = 'parsed';
result = INVOICE_MACHINE.transition(invoice, 'disputed');
assert(result.success === true, 'parsed→disputed succeeds without additional guards');
assertEquals(invoice.status, 'disputed', 'parsed→disputed updates status');

invoice.status = 'allocated';
invoice.payment_status = 'paid';
result = INVOICE_MACHINE.transition(invoice, 'archived');
assert(result.success === true, 'allocated→archived succeeds when payment_status is paid');
assertEquals(invoice.status, 'archived', 'allocated→archived updates status');
assert(invoice.archived_at !== undefined, 'allocated→archived sets archived_at timestamp');

// Invalid transitions
invoice.status = 'pending';
result = INVOICE_MACHINE.transition(invoice, 'allocated');
assert(result.success === false, 'pending→allocated fails (not a valid transition)');
assertIncludes(result.error, 'Invalid transition', 'Error message indicates invalid transition');

invoice.status = 'archived';
result = INVOICE_MACHINE.transition(invoice, 'pending');
assert(result.success === false, 'archived→pending fails (terminal state)');
assertIncludes(result.error, 'Invalid transition', 'Terminal state prevents transitions');

invoice.status = 'archived';
result = INVOICE_MACHINE.transition(invoice, 'disputed');
assert(result.success === false, 'archived→disputed fails (terminal state)');

// Guard: pending→parsed requires provider and total_amount
const incompleteInvoice = { status: 'pending' };
result = INVOICE_MACHINE.transition(incompleteInvoice, 'parsed');
assert(result.success === false, 'pending→parsed fails without provider and total_amount');
assertIncludes(result.error, 'Guard rejected', 'Guard rejection is reported');
assertIncludes(result.error, 'provider and total_amount', 'Guard error message is specific');

const invoiceWithoutAmount = { status: 'pending', provider: 'Vendor' };
result = INVOICE_MACHINE.transition(invoiceWithoutAmount, 'parsed');
assert(result.success === false, 'pending→parsed fails without total_amount');

const invoiceWithoutProvider = { status: 'pending', total_amount: 500 };
result = INVOICE_MACHINE.transition(invoiceWithoutProvider, 'parsed');
assert(result.success === false, 'pending→parsed fails without provider');

// Guard: parsed→allocated requires line_items_count > 0
const parsedInvoiceNoItems = { status: 'parsed', line_items_count: 0 };
result = INVOICE_MACHINE.transition(parsedInvoiceNoItems, 'allocated');
assert(result.success === false, 'parsed→allocated fails with line_items_count = 0');
assertIncludes(result.error, 'at least one parsed line item', 'Guard message mentions line items');

const parsedInvoiceUndefined = { status: 'parsed' };
result = INVOICE_MACHINE.transition(parsedInvoiceUndefined, 'allocated');
assert(result.success === false, 'parsed→allocated fails with undefined line_items_count');

const parsedInvoiceValidItems = { status: 'parsed', line_items_count: 3 };
result = INVOICE_MACHINE.transition(parsedInvoiceValidItems, 'allocated');
assert(result.success === true, 'parsed→allocated succeeds with line_items_count > 0');

// Guard: allocated→archived requires payment_status === 'paid'
const allocatedUnpaid = { status: 'allocated', payment_status: 'unpaid' };
result = INVOICE_MACHINE.transition(allocatedUnpaid, 'archived');
assert(result.success === false, 'allocated→archived fails when payment_status is unpaid');
assertIncludes(result.error, 'marked as paid', 'Guard message mentions payment status');

const allocatedPartial = { status: 'allocated', payment_status: 'partial' };
result = INVOICE_MACHINE.transition(allocatedPartial, 'archived');
assert(result.success === false, 'allocated→archived fails when payment_status is partial');

const allocatedPaid = { status: 'allocated', payment_status: 'paid' };
result = INVOICE_MACHINE.transition(allocatedPaid, 'archived');
assert(result.success === true, 'allocated→archived succeeds when payment_status is paid');

// ═════════════════════════════════════════════════════════════════════════════════
// SECTION 3: CLOSE_PACK_MACHINE Transitions & Guards (30 tests)
// ═════════════════════════════════════════════════════════════════════════════════

console.log('\n[3] CLOSE_PACK_MACHINE — Transitions & Guards');

// Valid transitions
const closePack = { status: 'generated', attestation_hash: 'hash123', generated_by: 'user1', is_attested: true };

result = CLOSE_PACK_MACHINE.transition(closePack, 'reviewed');
assert(result.success === true, 'generated→reviewed succeeds with attestation_hash');
assertEquals(closePack.status, 'reviewed', 'generated→reviewed updates status');
assert(closePack.reviewed_at !== undefined, 'generated→reviewed sets reviewed_at timestamp');

closePack.status = 'reviewed';
result = CLOSE_PACK_MACHINE.transition(closePack, 'approved', { approved_by: 'user2' });
assert(result.success === true, 'reviewed→approved succeeds with different approved_by');
assertEquals(closePack.status, 'approved', 'reviewed→approved updates status');
assert(closePack.approved_at !== undefined, 'reviewed→approved sets approved_at timestamp');
assertEquals(closePack.approved_by, 'user2', 'reviewed→approved sets approved_by in context');

closePack.status = 'approved';
result = CLOSE_PACK_MACHINE.transition(closePack, 'archived');
assert(result.success === true, 'approved→archived succeeds when is_attested is true');
assertEquals(closePack.status, 'archived', 'approved→archived updates status');
assert(closePack.archived_at !== undefined, 'approved→archived sets archived_at timestamp');

closePack.status = 'reviewed';
result = CLOSE_PACK_MACHINE.transition(closePack, 'generated');
assert(result.success === true, 'reviewed→generated succeeds (rejection workflow)');
assertEquals(closePack.status, 'generated', 'Can transition back to generated for rework');

// Invalid transitions
closePack.status = 'generated';
result = CLOSE_PACK_MACHINE.transition(closePack, 'approved');
assert(result.success === false, 'generated→approved fails (not valid)');

closePack.status = 'approved';
result = CLOSE_PACK_MACHINE.transition(closePack, 'reviewed');
assert(result.success === false, 'approved→reviewed fails (not valid)');

closePack.status = 'archived';
result = CLOSE_PACK_MACHINE.transition(closePack, 'approved');
assert(result.success === false, 'archived→approved fails (terminal state)');

// Guard: generated→reviewed requires attestation_hash
const closePackNoHash = { status: 'generated' };
result = CLOSE_PACK_MACHINE.transition(closePackNoHash, 'reviewed');
assert(result.success === false, 'generated→reviewed fails without attestation_hash');
assertIncludes(result.error, 'attestation hash', 'Guard message mentions attestation hash');

// Guard: reviewed→approved requires separation of duties
const closePackSameUser = { status: 'reviewed', generated_by: 'user1' };
result = CLOSE_PACK_MACHINE.transition(closePackSameUser, 'approved', { approved_by: 'user1' });
assert(result.success === false, 'reviewed→approved fails if approved_by equals generated_by');
assertIncludes(result.error, 'separation of duties', 'Guard message mentions separation of duties');

const closePackNoApprover = { status: 'reviewed', generated_by: 'user1' };
result = CLOSE_PACK_MACHINE.transition(closePackNoApprover, 'approved', {});
assert(result.success === false, 'reviewed→approved fails without approved_by in context');

const closePackDifferentUser = { status: 'reviewed', generated_by: 'user1' };
result = CLOSE_PACK_MACHINE.transition(closePackDifferentUser, 'approved', { approved_by: 'user2' });
assert(result.success === true, 'reviewed→approved succeeds with different approved_by');

// Guard: approved→archived requires is_attested
const closePackNotAttested = { status: 'approved', is_attested: false };
result = CLOSE_PACK_MACHINE.transition(closePackNotAttested, 'archived');
assert(result.success === false, 'approved→archived fails when is_attested is false');
assertIncludes(result.error, 'attested', 'Guard message mentions attestation');

const closePackUndefinedAttested = { status: 'approved' };
result = CLOSE_PACK_MACHINE.transition(closePackUndefinedAttested, 'archived');
assert(result.success === false, 'approved→archived fails when is_attested is undefined');

const closePackAttested = { status: 'approved', is_attested: true };
result = CLOSE_PACK_MACHINE.transition(closePackAttested, 'archived');
assert(result.success === true, 'approved→archived succeeds when is_attested is true');

// ═════════════════════════════════════════════════════════════════════════════════
// SECTION 4: DISPUTE_MACHINE Transitions & Guards (30 tests)
// ═════════════════════════════════════════════════════════════════════════════════

console.log('\n[4] DISPUTE_MACHINE — Transitions & Guards');

// Valid transitions through 8-state lifecycle
const dispute = { status: 'detected', evidence_packet: { doc1: 'data' }, approved_by: 'reviewer1', resolution_amount: 500 };

result = DISPUTE_MACHINE.transition(dispute, 'evidence_gathering');
assert(result.success === true, 'detected→evidence_gathering succeeds');
assertEquals(dispute.status, 'evidence_gathering', 'Status updated to evidence_gathering');
assert(dispute.evidence_started_at !== undefined, 'Timestamp set for evidence_gathering');

dispute.status = 'evidence_gathering';
result = DISPUTE_MACHINE.transition(dispute, 'draft_created');
assert(result.success === true, 'evidence_gathering→draft_created succeeds');
assertEquals(dispute.status, 'draft_created', 'Status updated to draft_created');

dispute.status = 'draft_created';
result = DISPUTE_MACHINE.transition(dispute, 'human_review');
assert(result.success === true, 'draft_created→human_review succeeds with evidence_packet');
assertEquals(dispute.status, 'human_review', 'Status updated to human_review');

dispute.status = 'human_review';
result = DISPUTE_MACHINE.transition(dispute, 'submitted', { approved_by: 'reviewer1' });
assert(result.success === true, 'human_review→submitted succeeds with approved_by');
assertEquals(dispute.status, 'submitted', 'Status updated to submitted');
assert(dispute.submitted_at !== undefined, 'Timestamp set for submitted');
assertEquals(dispute.submitted_by, 'reviewer1', 'submitted_by set from context');

dispute.status = 'submitted';
result = DISPUTE_MACHINE.transition(dispute, 'provider_acknowledged');
assert(result.success === true, 'submitted→provider_acknowledged succeeds');
assertEquals(dispute.status, 'provider_acknowledged', 'Status updated');

dispute.status = 'provider_acknowledged';
result = DISPUTE_MACHINE.transition(dispute, 'resolved');
assert(result.success === true, 'provider_acknowledged→resolved succeeds');
assertEquals(dispute.status, 'resolved', 'Status updated to resolved');
assert(dispute.resolved_at !== undefined, 'Timestamp set for resolved');

dispute.status = 'resolved';
result = DISPUTE_MACHINE.transition(dispute, 'closed');
assert(result.success === true, 'resolved→closed succeeds with resolution_amount');
assertEquals(dispute.status, 'closed', 'Status updated to closed');
assert(dispute.closed_at !== undefined, 'Timestamp set for closed');

// Alternative paths
const dispute2 = { status: 'detected' };
result = DISPUTE_MACHINE.transition(dispute2, 'closed');
assert(result.success === true, 'detected→closed succeeds (false positive)');
assertEquals(dispute2.status, 'closed', 'Can skip directly to closed');

const dispute3 = { status: 'evidence_gathering' };
result = DISPUTE_MACHINE.transition(dispute3, 'closed');
assert(result.success === true, 'evidence_gathering→closed succeeds (insufficient evidence)');

dispute3.status = 'human_review';
result = DISPUTE_MACHINE.transition(dispute3, 'draft_created');
assert(result.success === true, 'human_review→draft_created succeeds (reviewer requests revision)');

dispute3.status = 'submitted';
result = DISPUTE_MACHINE.transition(dispute3, 'resolved');
assert(result.success === true, 'submitted→resolved succeeds (provider resolved without ack)');

// Invalid transitions
dispute.status = 'detected';
result = DISPUTE_MACHINE.transition(dispute, 'submitted');
assert(result.success === false, 'detected→submitted fails (not valid)');

dispute.status = 'closed';
result = DISPUTE_MACHINE.transition(dispute, 'resolved');
assert(result.success === false, 'closed→resolved fails (terminal state)');

// Guard: draft_created→human_review requires evidence_packet
const disputeNoEvidence = { status: 'draft_created' };
result = DISPUTE_MACHINE.transition(disputeNoEvidence, 'human_review');
assert(result.success === false, 'draft_created→human_review fails without evidence_packet');
assertIncludes(result.error, 'evidence packet', 'Guard message mentions evidence_packet');

const disputeEmptyEvidence = { status: 'draft_created', evidence_packet: {} };
result = DISPUTE_MACHINE.transition(disputeEmptyEvidence, 'human_review');
assert(result.success === false, 'draft_created→human_review fails with empty evidence_packet');

// Guard: human_review→submitted requires approved_by
const disputeNoApproval = { status: 'human_review', evidence_packet: { doc: 'data' } };
result = DISPUTE_MACHINE.transition(disputeNoApproval, 'submitted', {});
assert(result.success === false, 'human_review→submitted fails without approved_by');
assertIncludes(result.error, 'human approval', 'Guard message mentions approval');

// Guard: resolved→closed requires resolution_amount
const disputeNoAmount = { status: 'resolved' };
result = DISPUTE_MACHINE.transition(disputeNoAmount, 'closed');
assert(result.success === false, 'resolved→closed fails without resolution_amount');
assertIncludes(result.error, 'resolution amount', 'Guard message mentions amount');

const disputeZeroAmount = { status: 'resolved', resolution_amount: 0 };
result = DISPUTE_MACHINE.transition(disputeZeroAmount, 'closed');
assert(result.success === true, 'resolved→closed succeeds with resolution_amount = 0');

// ═════════════════════════════════════════════════════════════════════════════════
// SECTION 5: SAVINGS_MACHINE Transitions & Guards (25 tests)
// ═════════════════════════════════════════════════════════════════════════════════

console.log('\n[5] SAVINGS_MACHINE — Transitions & Guards');

// Valid transitions
const savings = { status: 'pending', estimated_monthly_savings: 500, implementation_details: 'Use vendor X API' };

result = SAVINGS_MACHINE.transition(savings, 'approved', { approved_by: 'approver1' });
assert(result.success === true, 'pending→approved succeeds with approved_by and estimated_monthly_savings > 0');
assertEquals(savings.status, 'approved', 'Status updated to approved');
assert(savings.approved_at !== undefined, 'Timestamp set for approved');
assertEquals(savings.approved_by_id, 'approver1', 'approved_by_id set from context');

savings.status = 'approved';
result = SAVINGS_MACHINE.transition(savings, 'implemented');
assert(result.success === true, 'approved→implemented succeeds with implementation_details');
assertEquals(savings.status, 'implemented', 'Status updated to implemented');
assert(savings.implemented_at !== undefined, 'Timestamp set for implemented');

savings.status = 'pending';
result = SAVINGS_MACHINE.transition(savings, 'rejected', { reason: 'Budget constraints' });
assert(result.success === true, 'pending→rejected succeeds');
assertEquals(savings.status, 'rejected', 'Status updated to rejected');
assert(savings.rejected_at !== undefined, 'Timestamp set for rejected');
assertEquals(savings.rejection_reason, 'Budget constraints', 'rejection_reason set from context');

savings.status = 'approved';
result = SAVINGS_MACHINE.transition(savings, 'rejected', { reason: 'Timing issue' });
assert(result.success === true, 'approved→rejected succeeds (can reject after approval)');
assertEquals(savings.status, 'rejected', 'Can reject after approval');

savings.status = 'rejected';
result = SAVINGS_MACHINE.transition(savings, 'pending');
assert(result.success === true, 'rejected→pending succeeds (reopen for reconsideration)');
assertEquals(savings.status, 'pending', 'Can reopen rejected recommendation');

// Invalid transitions
savings.status = 'implemented';
result = SAVINGS_MACHINE.transition(savings, 'rejected');
assert(result.success === false, 'implemented→rejected fails (terminal state)');

savings.status = 'pending';
result = SAVINGS_MACHINE.transition(savings, 'implemented');
assert(result.success === false, 'pending→implemented fails (not valid)');

// Guard: pending→approved requires approved_by and positive estimated_monthly_savings
const savingsNoApprover = { status: 'pending', estimated_monthly_savings: 500 };
result = SAVINGS_MACHINE.transition(savingsNoApprover, 'approved', {});
assert(result.success === false, 'pending→approved fails without approved_by');
assertIncludes(result.error, 'approved_by', 'Guard message mentions approver');

const savingsZeroSavings = { status: 'pending', estimated_monthly_savings: 0 };
result = SAVINGS_MACHINE.transition(savingsZeroSavings, 'approved', { approved_by: 'approver1' });
assert(result.success === false, 'pending→approved fails with estimated_monthly_savings = 0');
assertIncludes(result.error, 'no estimated savings', 'Guard message mentions savings');

const savingsNegativeSavings = { status: 'pending', estimated_monthly_savings: -100 };
result = SAVINGS_MACHINE.transition(savingsNegativeSavings, 'approved', { approved_by: 'approver1' });
assert(result.success === false, 'pending→approved fails with negative estimated_monthly_savings');

const savingsUndefinedSavings = { status: 'pending' };
result = SAVINGS_MACHINE.transition(savingsUndefinedSavings, 'approved', { approved_by: 'approver1' });
assert(result.success === false, 'pending→approved fails with undefined estimated_monthly_savings');

// Guard: approved→implemented requires implementation_details
const savingsNoDetails = { status: 'approved' };
result = SAVINGS_MACHINE.transition(savingsNoDetails, 'implemented');
assert(result.success === false, 'approved→implemented fails without implementation_details');
assertIncludes(result.error, 'Implementation details', 'Guard message mentions details');

const savingsWithDetails = { status: 'approved', implementation_details: 'Enable feature X' };
result = SAVINGS_MACHINE.transition(savingsWithDetails, 'implemented');
assert(result.success === true, 'approved→implemented succeeds with implementation_details');

// Edge case: default rejection reason
const savingsDefaultReason = { status: 'pending' };
result = SAVINGS_MACHINE.transition(savingsDefaultReason, 'rejected', {});
assertEquals(savingsDefaultReason.rejection_reason, 'No reason provided', 'Default rejection reason is set');

// ═════════════════════════════════════════════════════════════════════════════════
// SECTION 6: BUDGET_MACHINE Transitions & Guards (20 tests)
// ═════════════════════════════════════════════════════════════════════════════════

console.log('\n[6] BUDGET_MACHINE — Transitions & Guards');

// Valid transitions
const budget = { status: 'active' };

result = BUDGET_MACHINE.transition(budget, 'paused', { reason: 'Reviewing expenses' });
assert(result.success === true, 'active→paused succeeds');
assertEquals(budget.status, 'paused', 'Status updated to paused');
assert(budget.paused_at !== undefined, 'Timestamp set for paused');
assertEquals(budget.pause_reason, 'Reviewing expenses', 'pause_reason set from context');

budget.status = 'active';
result = BUDGET_MACHINE.transition(budget, 'exceeded');
assert(result.success === true, 'active→exceeded succeeds');
assertEquals(budget.status, 'exceeded', 'Status updated to exceeded');
assert(budget.exceeded_at !== undefined, 'Timestamp set for exceeded');

budget.status = 'active';
result = BUDGET_MACHINE.transition(budget, 'completed');
assert(result.success === true, 'active→completed succeeds');
assertEquals(budget.status, 'completed', 'Status updated to completed');
assert(budget.completed_at !== undefined, 'Timestamp set for completed');

budget.status = 'paused';
result = BUDGET_MACHINE.transition(budget, 'active');
assert(result.success === true, 'paused→active succeeds (resume)');
assertEquals(budget.status, 'active', 'Can resume from paused');

budget.status = 'paused';
result = BUDGET_MACHINE.transition(budget, 'archived');
assert(result.success === true, 'paused→archived succeeds');
assertEquals(budget.status, 'archived', 'Status updated to archived');
assert(budget.archived_at !== undefined, 'Timestamp set for archived');

budget.status = 'exceeded';
result = BUDGET_MACHINE.transition(budget, 'active');
assert(result.success === true, 'exceeded→active succeeds (resume after increase)');

budget.status = 'exceeded';
result = BUDGET_MACHINE.transition(budget, 'archived');
assert(result.success === true, 'exceeded→archived succeeds');

budget.status = 'completed';
result = BUDGET_MACHINE.transition(budget, 'archived');
assert(result.success === true, 'completed→archived succeeds');

// Invalid transitions
budget.status = 'active';
result = BUDGET_MACHINE.transition(budget, 'archived');
assert(result.success === false, 'active→archived fails (not valid)');

budget.status = 'archived';
result = BUDGET_MACHINE.transition(budget, 'active');
assert(result.success === false, 'archived→active fails (terminal state)');

budget.status = 'completed';
result = BUDGET_MACHINE.transition(budget, 'paused');
assert(result.success === false, 'completed→paused fails (not valid)');

// Edge case: onEnter hook without context
const budgetNoContext = { status: 'active' };
result = BUDGET_MACHINE.transition(budgetNoContext, 'paused', {});
assertEquals(budgetNoContext.pause_reason, undefined, 'pause_reason is undefined when context.reason is missing');

// ═════════════════════════════════════════════════════════════════════════════════
// SECTION 7: Utility Functions (25 tests)
// ═════════════════════════════════════════════════════════════════════════════════

console.log('\n[7] Utility Functions — getMachine, transitionEntity, describeAllMachines');

// getMachine tests
const invoiceMachine = getMachine('invoice');
assert(invoiceMachine === INVOICE_MACHINE, 'getMachine("invoice") returns INVOICE_MACHINE');

const closePackMachine = getMachine('close_pack');
assert(closePackMachine === CLOSE_PACK_MACHINE, 'getMachine("close_pack") returns CLOSE_PACK_MACHINE');

const disputeMachine = getMachine('dispute');
assert(disputeMachine === DISPUTE_MACHINE, 'getMachine("dispute") returns DISPUTE_MACHINE');

const savingsMachine = getMachine('savings_recommendation');
assert(savingsMachine === SAVINGS_MACHINE, 'getMachine("savings_recommendation") returns SAVINGS_MACHINE');

const budgetMachine = getMachine('budget');
assert(budgetMachine === BUDGET_MACHINE, 'getMachine("budget") returns BUDGET_MACHINE');

const unknownMachine = getMachine('unknown_type');
assert(unknownMachine === null, 'getMachine("unknown_type") returns null');

const missingMachine = getMachine('nonexistent');
assert(missingMachine === null, 'getMachine("nonexistent") returns null');

// transitionEntity tests
const invoiceEntity = { status: 'pending', provider: 'Vendor', total_amount: 1000, line_items_count: 2 };
result = transitionEntity('invoice', invoiceEntity, 'parsed');
assert(result.success === true, 'transitionEntity("invoice", ...) succeeds');
assertEquals(invoiceEntity.status, 'parsed', 'transitionEntity updates entity status');

const disputeEntity = { status: 'detected', evidence_packet: { doc: 'data' }, approved_by: 'user' };
result = transitionEntity('dispute', disputeEntity, 'evidence_gathering');
assert(result.success === true, 'transitionEntity("dispute", ...) succeeds');

result = transitionEntity('unknown_type', invoiceEntity, 'parsed');
assert(result.success === false, 'transitionEntity with unknown entity type fails');
assertIncludes(result.error, 'No state machine registered', 'Error message mentions unregistered type');

result = transitionEntity('invoice', { status: 'pending' }, 'parsed');
assert(result.success === false, 'transitionEntity respects guard conditions');

// describeAllMachines tests
const allMachines = describeAllMachines();
assertIsObject(allMachines, 'describeAllMachines returns an object');

assert('invoice' in allMachines, 'describeAllMachines includes invoice');
assert('close_pack' in allMachines, 'describeAllMachines includes close_pack');
assert('dispute' in allMachines, 'describeAllMachines includes dispute');
assert('savings_recommendation' in allMachines, 'describeAllMachines includes savings_recommendation');
assert('budget' in allMachines, 'describeAllMachines includes budget');

assert(allMachines.invoice.name === 'InvoiceWorkflow', 'describeAllMachines includes correct machine names');
assertIsArray(allMachines.invoice.states, 'describeAllMachines includes states for each machine');
assertIsArray(allMachines.invoice.terminalStates, 'describeAllMachines includes terminalStates');
assertIsArray(allMachines.invoice.guardedTransitions, 'describeAllMachines includes guardedTransitions');

// ═════════════════════════════════════════════════════════════════════════════════
// SECTION 8: Edge Cases & Advanced Scenarios (20 tests)
// ═════════════════════════════════════════════════════════════════════════════════

console.log('\n[8] Edge Cases & Advanced Scenarios');

// Case sensitivity
const caseEntity = { status: 'PENDING', provider: 'Vendor', total_amount: 500 };
result = INVOICE_MACHINE.transition(caseEntity, 'PARSED');
assert(result.success === true, 'Transition is case-insensitive (uppercase)');

const caseEntity2 = { status: 'Pending', provider: 'Vendor', total_amount: 500 };
result = INVOICE_MACHINE.transition(caseEntity2, 'Parsed');
assert(result.success === true, 'Transition is case-insensitive (mixed case)');

// Entity with 'state' property instead of 'status'
const stateEntity = { state: 'pending' };
const machineWithState = new StateMachine({
    name: 'TestState',
    transitions: { pending: ['active'], active: [] }
});

// Manually set context to test state property
const testStateEntity = { state: 'pending' };
// Note: StateMachine.transition checks for status first, then state
// Let's test canTransition with state property
const canTransitionResult = machineWithState.canTransition({ state: 'pending' }, 'active');
assert(canTransitionResult.valid === true, 'canTransition works with state property');

// Unknown current state
const unknownStateEntity = { status: 'unknown_state' };
result = INVOICE_MACHINE.transition(unknownStateEntity, 'parsed');
assert(result.success === false, 'Transition fails with unknown current state');
assertIncludes(result.error, 'Unknown current state', 'Error reports unknown state');

// Unknown target state
const unknownTargetEntity = { status: 'pending', provider: 'X', total_amount: 100 };
result = INVOICE_MACHINE.transition(unknownTargetEntity, 'unknown_target');
assert(result.success === false, 'Transition fails with unknown target state');
assertIncludes(result.error, 'Unknown target state', 'Error reports unknown target');

// Empty string state
const emptyStateEntity = { status: '' };
result = INVOICE_MACHINE.transition(emptyStateEntity, 'pending');
assert(result.success === false, 'Transition fails with empty string state');

// Null/undefined status
const nullEntity = { status: null };
result = INVOICE_MACHINE.transition(nullEntity, 'pending');
assert(result.success === false, 'Transition fails with null status');

const undefinedEntity = { status: undefined };
result = INVOICE_MACHINE.transition(undefinedEntity, 'pending');
assert(result.success === false, 'Transition fails with undefined status');

// Context propagation through hooks
let contextCaptured = null;
const contextMachine = new StateMachine({
    name: 'ContextTest',
    transitions: { a: ['b'], b: [] },
    onEnter: {
        b: (entity, context) => {
            contextCaptured = context;
        }
    }
});

const contextEntity = { status: 'a' };
contextMachine.transition(contextEntity, 'b', { user_id: 'user123', action: 'test' });
assert(contextCaptured !== null && contextCaptured.user_id === 'user123', 'Context is passed to onEnter hook');

// canTransition dry run (no side effects)
const dryRunEntity = { status: 'pending', provider: 'Vendor', total_amount: 100 };
const canTransition = INVOICE_MACHINE.canTransition(dryRunEntity, 'parsed');
assert(canTransition.valid === true, 'canTransition returns valid: true for valid transition');

const neverModified = dryRunEntity.parsed_at;
assert(neverModified === undefined, 'canTransition does not execute hooks (dry run)');

const invalidDryRun = INVOICE_MACHINE.canTransition({ status: 'archived' }, 'pending');
assert(invalidDryRun.valid === false, 'canTransition returns valid: false for invalid transition');
assert(invalidDryRun.error !== undefined, 'canTransition includes error message');

// Multiple transitions in sequence
const sequenceEntity = { status: 'pending', provider: 'V', total_amount: 100, line_items_count: 1, payment_status: 'paid' };
result = INVOICE_MACHINE.transition(sequenceEntity, 'parsed');
assert(result.success === true, 'First transition succeeds');

result = INVOICE_MACHINE.transition(sequenceEntity, 'allocated');
assert(result.success === true, 'Second transition succeeds');

result = INVOICE_MACHINE.transition(sequenceEntity, 'archived');
assert(result.success === true, 'Third transition to terminal state succeeds');

result = INVOICE_MACHINE.transition(sequenceEntity, 'disputed');
assert(result.success === false, 'Transition from terminal state fails');

// ═════════════════════════════════════════════════════════════════════════════════
// TEST SUMMARY
// ═════════════════════════════════════════════════════════════════════════════════

console.log('\n═════════════════════════════════════════════════════════════════════════════════');
console.log('TEST SUMMARY');
console.log('═════════════════════════════════════════════════════════════════════════════════');
console.log(`Total Tests: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Success Rate: ${((passed / (passed + failed)) * 100).toFixed(2)}%`);

if (failed > 0) {
    console.log('\nFailed Tests:');
    failures.forEach((msg, idx) => {
        console.log(`  ${idx + 1}. ${msg}`);
    });
    process.exit(1);
} else {
    console.log('\n✓ All tests passed!');
    process.exit(0);
}
