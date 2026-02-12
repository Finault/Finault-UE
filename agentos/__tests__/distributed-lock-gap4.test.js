/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DISTRIBUTED LOCK & JOB ISOLATION TEST SUITE — GAP #4
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Comprehensive test suite for Gap #4 enhancements:
 * - Distributed Lock Manager (acquisition, release, renewal, withLock pattern)
 * - Per-tenant Job Isolation (concurrency limits, fair scheduling)
 * - Scheduled Job Runner (cron-based, lock-protected execution)
 * - Enhanced Dead Letter Queue API (filtering, retry, purge, metrics)
 *
 * Test Count: 80+ tests organized by functionality
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import {
    JobQueue,
    JOB_STATUS,
    JOB_PRIORITY,
    DistributedLockManager
} from '../core/job-queue.js';

let passed = 0;
let failed = 0;

// ─── Custom Assert Function ──────────────────────────────────────────────────

function assert(condition, message) {
    if (!condition) {
        console.error(`❌ FAILED: ${message}`);
        failed++;
    } else {
        console.log(`✓ ${message}`);
        passed++;
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 1: DISTRIBUTED LOCK MANAGER (23 tests)
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n▸ SECTION 1: DISTRIBUTED LOCK MANAGER\n');

const lockManager = new DistributedLockManager();

// Lock acquisition tests
const test1 = await lockManager.acquireLock('test_key_1', 60000);
assert(test1.acquired === true, 'Lock acquisition succeeds');
assert(test1.lockId !== undefined, 'Lock acquisition returns lockId');
assert(test1.expiresAt !== undefined, 'Lock acquisition returns expiresAt');

// Contention test — second acquisition should fail
const test2 = await lockManager.acquireLock('test_key_1', 60000);
assert(test2.acquired === false, 'Lock acquisition fails when already locked');

// Different key should succeed
const test3 = await lockManager.acquireLock('test_key_2', 60000);
assert(test3.acquired === true, 'Lock acquisition succeeds for different key');

// Lock release tests
const test4 = await lockManager.releaseLock('test_key_1', test1.lockId);
assert(test4.released === true, 'Lock release succeeds with correct lockId');

// Can re-acquire after release
const test5 = await lockManager.acquireLock('test_key_1', 60000);
assert(test5.acquired === true, 'Lock can be re-acquired after release');

// Release with wrong lockId should fail (CAS semantics)
const wrongLockId = 'wrong_lock_id';
const test6 = await lockManager.releaseLock('test_key_1', wrongLockId);
assert(test6.released === false, 'Lock release fails with incorrect lockId (CAS)');

// Lock still held after failed release
const test7 = await lockManager.acquireLock('test_key_1', 60000);
assert(test7.acquired === false, 'Lock still held after failed release attempt');

// Release with correct lockId succeeds
const test8 = await lockManager.releaseLock('test_key_1', test5.lockId);
assert(test8.released === true, 'Lock release succeeds with correct lockId');

// Lock renewal tests
const test9 = await lockManager.acquireLock('test_key_3', 1000);
assert(test9.acquired === true, 'Lock acquired for renewal test');

const test10 = await lockManager.renewLock('test_key_3', test9.lockId, 60000);
assert(test10.renewed === true, 'Lock renewal succeeds with correct lockId');
assert(test10.expiresAt !== undefined, 'Lock renewal returns new expiresAt');

// Renewal with wrong lockId fails
const test11 = await lockManager.renewLock('test_key_3', 'wrong_id', 60000);
assert(test11.renewed === false, 'Lock renewal fails with incorrect lockId');

// isLocked tests
const test12 = await lockManager.isLocked('test_key_3');
assert(test12.locked === true, 'isLocked returns true for locked key');
assert(test12.ownerLockId === test9.lockId, 'isLocked returns correct ownerLockId');

const test13 = await lockManager.isLocked('nonexistent_key');
assert(test13.locked === false, 'isLocked returns false for unlocked key');

// withLock pattern tests
let handlerCalled = false;
const test14 = await lockManager.withLock('test_key_4', async () => {
    handlerCalled = true;
    return 'success_result';
});
assert(handlerCalled === true, 'withLock executes handler function');
assert(test14 === 'success_result', 'withLock returns handler result');

// Lock released after withLock
const test15 = await lockManager.acquireLock('test_key_4', 60000);
assert(test15.acquired === true, 'Lock released after withLock completion');

// withLock with handler failure still releases lock
let errorThrown = false;
try {
    await lockManager.withLock('test_key_5', async () => {
        throw new Error('Test error');
    });
} catch (err) {
    errorThrown = true;
}
assert(errorThrown === true, 'withLock propagates handler errors');

const test16 = await lockManager.acquireLock('test_key_5', 60000);
assert(test16.acquired === true, 'Lock released even when handler throws');

// withLock with successful execution
const test17 = await lockManager.withLock(
    'test_key_6',
    async () => 'result',
    { retries: 0, retryDelayMs: 10 }
);
assert(test17 === 'result', 'withLock with options succeeds');

// Cleanup
await lockManager.releaseLock('test_key_2', test3.lockId);
await lockManager.releaseLock('test_key_3', test9.lockId);
await lockManager.releaseLock('test_key_4', test15.lockId);
await lockManager.releaseLock('test_key_5', test16.lockId);

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 2: PER-TENANT JOB ISOLATION (15 tests)
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n▸ SECTION 2: PER-TENANT JOB ISOLATION\n');

const tenantQueue = new JobQueue({
    maxRunningJobs: 100,
    tenantConcurrency: { default: 3 }
});

let tenantJobsRunning = 0;
tenantQueue.registerHandler('test_job', async (job) => {
    tenantJobsRunning++;
    await new Promise(r => setTimeout(r, 100));
    tenantJobsRunning--;
    return 'done';
});

// Enqueue jobs for multiple organizations
const org1Job1 = tenantQueue.enqueue({ type: 'test_job', orgId: 'org1' });
const org1Job2 = tenantQueue.enqueue({ type: 'test_job', orgId: 'org1' });
const org1Job3 = tenantQueue.enqueue({ type: 'test_job', orgId: 'org1' });

assert(org1Job1.orgId === 'org1', 'Job stores orgId');
assert(org1Job2.orgId === 'org1', 'Multiple jobs can have same orgId');

const org2Job1 = tenantQueue.enqueue({ type: 'test_job', orgId: 'org2' });

// Execute jobs async without awaiting
tenantQueue._executeJob(org1Job1);
assert(tenantQueue.running.size === 1, 'First job runs');
assert(tenantQueue.tenantConcurrency.get('org1') === 1, 'org1 concurrency = 1');

tenantQueue._executeJob(org1Job2);
assert(tenantQueue.running.size === 2, 'Second job runs');
assert(tenantQueue.tenantConcurrency.get('org1') === 2, 'org1 concurrency = 2');

tenantQueue._executeJob(org1Job3);
assert(tenantQueue.running.size === 3, 'Third job runs');
assert(tenantQueue.tenantConcurrency.get('org1') === 3, 'org1 concurrency = 3 (at limit)');

// org2 should still be able to run despite org1 at limit
tenantQueue._executeJob(org2Job1);
assert(tenantQueue.running.size === 4, 'org2 job runs independently');
assert(tenantQueue.tenantConcurrency.get('org2') === 1, 'org2 concurrency = 1');

// Test jobs without orgId
const noOrgJob = tenantQueue.enqueue({ type: 'test_job' });
assert(noOrgJob.orgId === null, 'Jobs without orgId are allowed');

// Verify isolation: org1 at 3, org2 at 1, other at 0
assert(tenantQueue.tenantConcurrency.get('org1') === 3, 'org1 still at 3');
assert(tenantQueue.tenantConcurrency.get('org2') === 1, 'org2 still at 1');

// Wait for jobs to complete
await new Promise(r => setTimeout(r, 150));
assert(tenantJobsRunning === 0, 'All tenant jobs completed');
assert(tenantQueue.tenantConcurrency.get('org1') === undefined,
    'org1 concurrency cleaned up after completion');

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 3: SCHEDULED JOB RUNNER (14 tests)
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n▸ SECTION 3: SCHEDULED JOB RUNNER\n');

const schedulerQueue = new JobQueue();
schedulerQueue.registerHandler('scheduled_test', async (job) => 'scheduled_done');

// Register scheduled job
const scheduleId = schedulerQueue.schedule(
    '0 * * * *',
    'scheduled_test',
    { test: 'payload' },
    JOB_PRIORITY.NORMAL,
    'scheduled_org'
);

assert(scheduleId, 'Schedule registration returns ID');
assert(schedulerQueue.scheduledJobs.has(scheduleId), 'Schedule stored');

const schedule = schedulerQueue.scheduledJobs.get(scheduleId);
assert(schedule.cronPattern === '0 * * * *', 'Schedule cron pattern stored');
assert(schedule.jobType === 'scheduled_test', 'Schedule job type stored');
assert(schedule.payload.test === 'payload', 'Schedule payload stored');
assert(schedule.orgId === 'scheduled_org', 'Schedule orgId stored');

// Test cron matching
const testDate = new Date(Date.UTC(2024, 0, 1, 14, 0, 0));
const matches = schedulerQueue._cronMatches('0 14 * * *', testDate);
assert(matches === true, 'Cron pattern "0 14 * * *" matches 2:00 PM');

const noMatches = schedulerQueue._cronMatches('0 15 * * *', testDate);
assert(noMatches === false, 'Cron pattern "0 15 * * *" does not match 2:00 PM');

// Test shouldRunSchedule
const now = new Date();
const schedule2 = {
    cronPattern: '* * * * *',
    lastRun: null
};
const shouldRun1 = schedulerQueue._shouldRunSchedule(schedule2, now);
assert(shouldRun1 === true, 'Schedule should run when lastRun is null');

schedule2.lastRun = new Date(now.getTime() - 10000).toISOString();
const shouldRun2 = schedulerQueue._shouldRunSchedule(schedule2, new Date(now.getTime() + 61000));
assert(shouldRun2 === true, 'Schedule should run after 60+ seconds');

const shouldRun3 = schedulerQueue._shouldRunSchedule(schedule2, new Date(now.getTime() + 10000));
assert(shouldRun3 === false, 'Schedule should not run within 60 seconds');

// Test scheduler start/stop
schedulerQueue.startScheduler(100);
assert(schedulerQueue.schedulerRunning === true, 'Scheduler starts');

schedulerQueue.stopScheduler();
assert(schedulerQueue.schedulerRunning === false, 'Scheduler stops');

// Test multiple registrations
const sched2 = schedulerQueue.schedule('* * * * *', 'scheduled_test');
assert(schedulerQueue.scheduledJobs.size === 2, 'Multiple schedules registered');

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 4: ENHANCED DEAD LETTER QUEUE API (18 tests)
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n▸ SECTION 4: ENHANCED DEAD LETTER QUEUE API\n');

const dlqQueue = new JobQueue();

// Manually create DLQ entries for testing (bypass retry logic)
const dlqJob1 = {
    id: 'dlq_job_1',
    type: 'test_type',
    orgId: 'org_a',
    status: JOB_STATUS.DEAD_LETTER,
    deadLetteredAt: new Date().toISOString(),
    error: 'Test error 1'
};
const dlqJob2 = {
    id: 'dlq_job_2',
    type: 'test_type',
    orgId: 'org_b',
    status: JOB_STATUS.DEAD_LETTER,
    deadLetteredAt: new Date().toISOString(),
    error: 'Test error 2'
};
const dlqJob3 = {
    id: 'dlq_job_3',
    type: 'other_type',
    orgId: 'org_a',
    status: JOB_STATUS.DEAD_LETTER,
    deadLetteredAt: new Date().toISOString(),
    error: 'Test error 3'
};

dlqQueue.deadLetter.push(dlqJob1, dlqJob2, dlqJob3);

// Test getDLQJobs
const allDLQ = await dlqQueue.getDLQJobs();
assert(allDLQ.jobs.length === 3, 'getDLQJobs returns all DLQ jobs');
assert(allDLQ.filtered === 3, 'getDLQJobs reports correct filtered count');

// Test filtering by organization
const orgADLQ = await dlqQueue.getDLQJobs({ orgId: 'org_a' });
assert(orgADLQ.filtered === 2, 'getDLQJobs filters by orgId');

// Test filtering by job type
const byTypeDLQ = await dlqQueue.getDLQJobs({ jobType: 'test_type' });
assert(byTypeDLQ.filtered === 2, 'getDLQJobs filters by job type');

// Test combined filtering
const combinedFilter = await dlqQueue.getDLQJobs({ orgId: 'org_a', jobType: 'other_type' });
assert(combinedFilter.filtered === 1, 'getDLQJobs supports multiple filters');

// Test pagination
const page1 = await dlqQueue.getDLQJobs({ limit: 2, offset: 0 });
assert(page1.jobs.length === 2, 'getDLQJobs respects limit');
assert(page1.limit === 2, 'getDLQJobs reports limit');
assert(page1.offset === 0, 'getDLQJobs reports offset');

// Test retryDLQJob
const retried = await dlqQueue.retryDLQJob(dlqJob1.id);
assert(retried !== null, 'retryDLQJob succeeds');
assert(retried.status === JOB_STATUS.PENDING, 'Retried job moves to pending');
assert(dlqQueue.deadLetter.length === 2, 'Retried job removed from DLQ');
assert(dlqQueue.queue.length === 1, 'Retried job added to queue');

// Test purgeDLQ
const purged = await dlqQueue.purgeDLQ({ jobType: 'test_type' });
assert(purged === 1, 'purgeDLQ removes specified jobs');
assert(dlqQueue.deadLetter.length === 1, 'DLQ size reduced after purge');

// Test getDLQMetrics
const metrics = dlqQueue.getDLQMetrics();
assert(metrics.count === 1, 'getDLQMetrics reports correct count');
assert(metrics.oldest !== null, 'getDLQMetrics has oldest job');
assert(metrics.newest !== null, 'getDLQMetrics has newest job');
assert(metrics.byType['other_type'] === 1, 'getDLQMetrics tracks type counts');
assert(metrics.byTenant['org_a'] === 1, 'getDLQMetrics tracks tenant counts');

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 5: INTEGRATION TESTS (8 tests)
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n▸ SECTION 5: INTEGRATION TESTS\n');

const integrationQueue = new JobQueue({
    tenantConcurrency: { default: 2 }
});

integrationQueue.registerHandler('integration_test', async (job) => {
    await new Promise(r => setTimeout(r, 20));
    return 'result';
});

// Verify lock manager is available
assert(integrationQueue.lockManager !== null, 'JobQueue has lockManager instance');
assert(integrationQueue.lockManager instanceof DistributedLockManager,
    'lockManager is DistributedLockManager');

// Verify scheduler is available and can start/stop
assert(integrationQueue.schedulerRunning === false, 'Scheduler starts stopped');
integrationQueue.startScheduler(5000); // Very long interval
assert(integrationQueue.schedulerRunning === true, 'Scheduler can start');
integrationQueue.stopScheduler();
assert(integrationQueue.schedulerRunning === false, 'Scheduler stops');

// Verify tenant concurrency tracking
const intJob1 = integrationQueue.enqueue({ type: 'integration_test', orgId: 'test_org' });
integrationQueue._executeJob(intJob1);
assert(integrationQueue.tenantConcurrency.get('test_org') === 1, 'Concurrency tracked on start');

await new Promise(r => setTimeout(r, 30));
assert(integrationQueue.tenantConcurrency.get('test_org') === undefined ||
       integrationQueue.tenantConcurrency.get('test_org') === 0,
    'Concurrency cleared on completion');

// Verify distributed lock works with job queue
const lockKey = 'integration_test_lock';
const lock1 = await integrationQueue.lockManager.acquireLock(lockKey);
assert(lock1.acquired === true, 'JobQueue lock manager acquires locks');

const lock2 = await integrationQueue.lockManager.acquireLock(lockKey);
assert(lock2.acquired === false, 'Lock contention works');

await integrationQueue.lockManager.releaseLock(lockKey, lock1.lockId);

console.log('\n▸ TEST SUMMARY\n');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}\n`);

// Force exit to ensure test completes (prevents hanging intervals)
process.exit(failed > 0 ? 1 : 0);
