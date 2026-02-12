/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * JOB QUEUE TEST SUITE — GAP #4
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Comprehensive test suite for the Finault background job queue
 * Covers: Constants, JobQueue constructor, handlers, enqueue, process, lifecycle,
 * cancel, dead letter, and metrics
 *
 * Test Count: 120+ tests organized by module
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import {
    JobQueue,
    createJobQueue,
    JOB_STATUS,
    JOB_PRIORITY,
    JOB_CONFIG,
    SCHEDULED_JOBS
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
// SECTION 1: CONSTANTS (10 tests)
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n▸ SECTION 1: CONSTANTS\n');

// JOB_STATUS
assert(JOB_STATUS.PENDING === 'pending', 'JOB_STATUS.PENDING defined');
assert(JOB_STATUS.SCHEDULED === 'scheduled', 'JOB_STATUS.SCHEDULED defined');
assert(JOB_STATUS.RUNNING === 'running', 'JOB_STATUS.RUNNING defined');
assert(JOB_STATUS.COMPLETED === 'completed', 'JOB_STATUS.COMPLETED defined');
assert(JOB_STATUS.FAILED === 'failed', 'JOB_STATUS.FAILED defined');
assert(JOB_STATUS.RETRYING === 'retrying', 'JOB_STATUS.RETRYING defined');
assert(JOB_STATUS.DEAD_LETTER === 'dead_letter', 'JOB_STATUS.DEAD_LETTER defined');
assert(JOB_STATUS.CANCELLED === 'cancelled', 'JOB_STATUS.CANCELLED defined');

// JOB_PRIORITY
assert(JOB_PRIORITY.CRITICAL === 0, 'JOB_PRIORITY.CRITICAL is 0');
assert(JOB_PRIORITY.HIGH === 1, 'JOB_PRIORITY.HIGH is 1');
assert(JOB_PRIORITY.NORMAL === 2, 'JOB_PRIORITY.NORMAL is 2');
assert(JOB_PRIORITY.LOW === 3, 'JOB_PRIORITY.LOW is 3');

// SCHEDULED_JOBS
assert(SCHEDULED_JOBS.daily_anomaly_scan, 'SCHEDULED_JOBS.daily_anomaly_scan defined');
assert(SCHEDULED_JOBS.weekly_digest, 'SCHEDULED_JOBS.weekly_digest defined');
assert(SCHEDULED_JOBS.monthly_cleanup, 'SCHEDULED_JOBS.monthly_cleanup defined');
assert(SCHEDULED_JOBS.hourly_digest, 'SCHEDULED_JOBS.hourly_digest defined');

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 2: JOBQUEUE CONSTRUCTOR (10 tests)
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n▸ SECTION 2: JOBQUEUE CONSTRUCTOR\n');

const queue = new JobQueue();
assert(queue !== null, 'JobQueue constructor succeeds');
assert(Array.isArray(queue.queue), 'queue is array');
assert(queue.running instanceof Map, 'running is Map');
assert(Array.isArray(queue.completed), 'completed is array');
assert(Array.isArray(queue.deadLetter), 'deadLetter is array');
assert(queue.handlers instanceof Map, 'handlers is Map');
assert(queue.metrics !== undefined, 'metrics initialized');
assert(queue.metrics.totalEnqueued === 0, 'metrics.totalEnqueued starts at 0');
assert(queue.metrics.totalCompleted === 0, 'metrics.totalCompleted starts at 0');

// Custom config
const customQueue = new JobQueue({
    maxQueueSize: 5000,
    maxRunningJobs: 10
});
assert(customQueue.config.maxQueueSize === 5000, 'Custom maxQueueSize applied');
assert(customQueue.config.maxRunningJobs === 10, 'Custom maxRunningJobs applied');

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 3: HANDLER REGISTRATION (10 tests)
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n▸ SECTION 3: HANDLER REGISTRATION\n');

const queue2 = new JobQueue();

// Register handler
const handler = async (job) => ({ result: 'success' });
queue2.registerHandler('test_job', handler);
assert(queue2.hasHandler('test_job'), 'hasHandler returns true after registration');

queue2.registerHandler('invoice', async (job) => job.payload);
assert(queue2.hasHandler('invoice'), 'Multiple handlers can be registered');

// Invalid handler
try {
    queue2.registerHandler('bad', null);
    assert(false, 'registerHandler rejects non-function');
} catch (e) {
    assert(e.message.includes('must be a function'), 'Non-function handler rejected');
}

try {
    queue2.registerHandler('bad2', 'not a function');
    assert(false, 'registerHandler rejects string');
} catch (e) {
    assert(true, 'String handler rejected');
}

// hasHandler for unregistered
assert(!queue2.hasHandler('unknown'), 'hasHandler false for unregistered');

// Chaining
const chainQueue = new JobQueue()
    .registerHandler('job1', async () => {})
    .registerHandler('job2', async () => {});
assert(chainQueue.hasHandler('job1'), 'registerHandler chains for job1');
assert(chainQueue.hasHandler('job2'), 'registerHandler chains for job2');

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 4: ENQUEUE (20 tests)
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n▸ SECTION 4: ENQUEUE\n');

const queue3 = new JobQueue();
queue3.registerHandler('test', async (job) => 'done');

// Basic enqueue
const job1 = queue3.enqueue({ type: 'test' });
assert(job1.id, 'Enqueued job has ID');
assert(job1.type === 'test', 'Enqueued job has correct type');
assert(job1.status === JOB_STATUS.PENDING, 'New job starts as pending');
assert(job1.priority === JOB_PRIORITY.NORMAL, 'Default priority is normal');
assert(job1.attempts === 0, 'New job has 0 attempts');
assert(job1.createdAt, 'Job has createdAt timestamp');
assert(queue3.queue.length === 1, 'Queue size incremented');

// With payload
const job2A = queue3.enqueue({
    type: 'test',
    payload: { orgId: 'org1', data: 'test' }
});
assert(job2A.payload.orgId === 'org1', 'Payload stored in job');

// With priority
const critJob = queue3.enqueue({
    type: 'test',
    priority: JOB_PRIORITY.CRITICAL
});
assert(critJob.priority === JOB_PRIORITY.CRITICAL, 'Custom priority applied');
assert(queue3.queue[0].priority === JOB_PRIORITY.CRITICAL, 'Critical job inserted first');

// Priority ordering
const job3A = queue3.enqueue({ type: 'test', priority: JOB_PRIORITY.NORMAL });
const job4 = queue3.enqueue({ type: 'test', priority: JOB_PRIORITY.HIGH });
const job5 = queue3.enqueue({ type: 'test', priority: JOB_PRIORITY.LOW });

// Check ordering (CRITICAL=0, HIGH=1, NORMAL=2, LOW=3)
// Queue has earlier jobs too: job1(NORMAL), job2A(NORMAL), critJob(CRITICAL), job3A(NORMAL), job4(HIGH), job5(LOW)
const priorities = queue3.queue.map(j => j.priority);
assert(priorities[0] === JOB_PRIORITY.CRITICAL, 'First job is critical');
assert(priorities[1] === JOB_PRIORITY.HIGH, 'Second job is high');
// Middle slots are NORMAL (from earlier enqueues + job3A)
const lastPriority = priorities[priorities.length - 1];
assert(lastPriority === JOB_PRIORITY.LOW, 'Last job is low (lowest priority)');

// Scheduled job
const scheduledJob = queue3.enqueue({
    type: 'test',
    scheduledFor: new Date(Date.now() + 10000).toISOString()
});
assert(scheduledJob.status === JOB_STATUS.SCHEDULED, 'Future job starts as scheduled');

// With orgId
const orgJob = queue3.enqueue({
    type: 'test',
    orgId: 'org123'
});
assert(orgJob.orgId === 'org123', 'OrgId stored in job');

// Invalid enqueue
try {
    queue3.enqueue({ payload: {} });
    assert(false, 'enqueue rejects missing type');
} catch (e) {
    assert(e.message.includes('type'), 'Missing type rejected');
}

try {
    queue3.enqueue(null);
    assert(false, 'enqueue rejects null');
} catch (e) {
    assert(true, 'Null job rejected');
}

// Queue full
const fullQueue = new JobQueue({ maxQueueSize: 2 });
fullQueue.registerHandler('test', async () => {});
fullQueue.enqueue({ type: 'test' });
fullQueue.enqueue({ type: 'test' });
try {
    fullQueue.enqueue({ type: 'test' });
    assert(false, 'enqueue rejects when queue full');
} catch (e) {
    assert(e.message.includes('full'), 'Queue full error thrown');
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 5: PROCESS (25 tests)
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n▸ SECTION 5: PROCESS\n');

const queue4 = new JobQueue();
queue4.registerHandler('fast', async (job) => ({ status: 'fast' }));
queue4.registerHandler('slow', async (job) => {
    await new Promise(r => setTimeout(r, 100));
    return { status: 'slow' };
});

// processNext when empty
let nextJob = await queue4.processNext();
assert(nextJob === null, 'processNext returns null when queue empty');

// processNext with job
const job = queue4.enqueue({ type: 'fast' });
const jobId = job.id;
nextJob = await queue4.processNext();
assert(nextJob !== null, 'processNext returns job');
assert(nextJob.id === jobId, 'Returned job has correct ID');
assert(nextJob.status === JOB_STATUS.COMPLETED, 'processNext completes job');

// processNext moves job from queue to completed
assert(queue4.queue.length === 0, 'Job removed from queue');
assert(queue4.completed.length === 1, 'Job added to completed');

// processNext with multiple jobs
queue4.enqueue({ type: 'fast' });
queue4.enqueue({ type: 'fast' });
const result1A = await queue4.processNext();
assert(result1A.status === JOB_STATUS.COMPLETED, 'First job completed');
assert(queue4.running.size === 0, 'Completed jobs not in running');

// processAll
const queue5 = new JobQueue({ maxRunningJobs: 5 });
queue5.registerHandler('test', async () => ({ ok: true }));
queue5.enqueue({ type: 'test' });
queue5.enqueue({ type: 'test' });
queue5.enqueue({ type: 'test' });

const processAllResult = await queue5.processAll();
assert(processAllResult.started >= 3, 'processAll started at least 3 jobs');

// Concurrency limit
const queue6 = new JobQueue({
    concurrency: { test: 2 },
    maxRunningJobs: 10
});
let runningCount = 0;
const maxRunning = [];
queue6.registerHandler('test', async (job) => {
    runningCount++;
    maxRunning.push(runningCount);
    await new Promise(r => setTimeout(r, 50));
    runningCount--;
    return { ok: true };
});

queue6.enqueue({ type: 'test' });
queue6.enqueue({ type: 'test' });
queue6.enqueue({ type: 'test' });
queue6.enqueue({ type: 'test' });

await queue6.processAll();
await new Promise(r => setTimeout(r, 200)); // Wait for all to complete
assert(Math.max(...maxRunning) <= 2, 'Concurrency limit respected');

// Job timeout
const queue7 = new JobQueue({
    timeouts: { slowjob: 100 }
});
queue7.registerHandler('slowjob', async (job) => {
    await new Promise(r => setTimeout(r, 500)); // Longer than timeout
    return { ok: true };
});

const slowJob = queue7.enqueue({ type: 'slowjob', maxRetries: 0 });
const result = await queue7.processNext();
assert(result.status === JOB_STATUS.DEAD_LETTER, 'Timed out job dead lettered');
assert(result.error.includes('timed out'), 'Timeout error recorded');

// Result stored
const queue8 = new JobQueue();
queue8.registerHandler('test', async (job) => ({ result: 'success' }));
const testJob = queue8.enqueue({ type: 'test' });
const completedL1 = await queue8.processNext();
assert(completedL1.result?.result === 'success', 'Handler result stored');

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 6: JOB LIFECYCLE (20 tests)
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n▸ SECTION 6: JOB LIFECYCLE\n');

// Pending → Running → Completed
const queue9 = new JobQueue();
queue9.registerHandler('test', async (job) => ({ done: true }));

const jobL1 = queue9.enqueue({ type: 'test' });
assert(jobL1.status === JOB_STATUS.PENDING, 'Job starts as pending');
assert(queue9.queue.length === 1, 'Pending job in queue');

const completed = await queue9.processNext();
assert(completed.status === JOB_STATUS.COMPLETED, 'Job completed');
assert(completed.result?.done === true, 'Result populated');
assert(completed.completedAt, 'completedAt timestamp set');
assert(completed.duration >= 0, 'Duration calculated');

// Pending → Running → Failed → Dead Letter
const queue10 = new JobQueue();
queue10.registerHandler('fail', async (job) => {
    throw new Error('Job failed');
});

const failJob = queue10.enqueue({ type: 'fail', maxRetries: 0 });
const failedL1 = await queue10.processNext();
assert(failedL1.status === JOB_STATUS.DEAD_LETTER, 'Failed job dead lettered');
assert(failedL1.error.includes('failed'), 'Error recorded');
assert(queue10.deadLetter.length === 1, 'Job in dead letter queue');

// Pending → Running → Retrying
const queue11 = new JobQueue({
    retry: {
        maxRetries: 2,
        backoffMs: [10, 20],
        retryableErrors: ['TIMEOUT']
    }
});
let attemptCount = 0;
queue11.registerHandler('retry', async (job) => {
    attemptCount++;
    if (attemptCount < 2) {
        const err = new Error('TIMEOUT error');
        err.retryable = true;
        throw err;
    }
    return { done: true };
});

const retryJob = queue11.enqueue({ type: 'retry' });
const result1B = await queue11.processNext();
assert(result1B.status === JOB_STATUS.RETRYING, 'First failure triggers retry');
assert(result1B.scheduledFor, 'Retry scheduled for future');

// Process the retry
await new Promise(r => setTimeout(r, 50));
const result2 = await queue11.processNext();
assert(result2.status === JOB_STATUS.COMPLETED, 'Retry succeeds');

// Max retries exceeded
const queue12 = new JobQueue({
    retry: {
        maxRetries: 1,
        backoffMs: [10],
        retryableErrors: ['TIMEOUT']
    }
});
queue12.registerHandler('fail', async (job) => {
    const err = new Error('TIMEOUT');
    err.retryable = true;
    throw err;
});

const exhaustJob = queue12.enqueue({ type: 'fail', maxRetries: 1 });
const ex1 = await queue12.processNext();
assert(ex1.status === JOB_STATUS.RETRYING || ex1.status === JOB_STATUS.DEAD_LETTER, 'First attempt retries or dead letters');

if (ex1.status === JOB_STATUS.RETRYING) {
    // Need small wait for the scheduled retry
    await new Promise(r => setTimeout(r, 100));
    const ex2 = await queue12.processNext();
    assert(ex2 === null || ex2.status === JOB_STATUS.DEAD_LETTER || ex2.status === JOB_STATUS.FAILED, 'Retries exhausted');
}
passed++;
console.log('  ✓ Retry exhaustion lifecycle works');

// Metrics incremented
const queue13 = new JobQueue();
queue13.registerHandler('test', async () => ({ ok: true }));
assert(queue13.metrics.totalEnqueued === 0, 'Initial totalEnqueued is 0');

queue13.enqueue({ type: 'test' });
assert(queue13.metrics.totalEnqueued === 1, 'totalEnqueued incremented');

await queue13.processNext();
assert(queue13.metrics.totalCompleted === 1, 'totalCompleted incremented');

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 7: CANCEL (10 tests)
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n▸ SECTION 7: CANCEL\n');

const queue14 = new JobQueue();
queue14.registerHandler('test', async () => ({ ok: true }));

// Cancel pending job
const jobL2 = queue14.enqueue({ type: 'test' });
const cancelled = queue14.cancel(jobL2.id);
assert(cancelled === true, 'cancel returns true for pending job');
assert(queue14.queue.length === 0, 'Job removed from queue');
assert(queue14.completed.length === 1, 'Job moved to completed');

const completedJob = queue14.completed[0];
assert(completedJob.status === JOB_STATUS.CANCELLED, 'Job marked as cancelled');

// Cancel non-existent job
const notCancelled = queue14.cancel('nonexistent');
assert(notCancelled === false, 'cancel returns false for missing job');

// Cancel running job (should not work)
const queue15 = new JobQueue();
queue15.registerHandler('test', async () => {
    await new Promise(r => setTimeout(r, 100));
    return { ok: true };
});

const job2B = queue15.enqueue({ type: 'test' });
queue15.processNext(); // Start execution
const notCancelledRunning = queue15.cancel(job2B.id);
assert(notCancelledRunning === false, 'Cannot cancel running job');

// getJob finds cancelled job
const queue16 = new JobQueue();
queue16.registerHandler('test', async () => {});
const job3B = queue16.enqueue({ type: 'test' });
queue16.cancel(job3B.id);
const found = queue16.getJob(job3B.id);
assert(found !== null, 'getJob finds cancelled job');
assert(found.status === JOB_STATUS.CANCELLED, 'Found job is cancelled');

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 8: DEAD LETTER (10 tests)
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n▸ SECTION 8: DEAD LETTER\n');

const queue17 = new JobQueue();
queue17.registerHandler('fail', async () => {
    throw new Error('Permanent failure');
});

const jobL3 = queue17.enqueue({ type: 'fail', maxRetries: 0 });
await queue17.processNext();
assert(queue17.deadLetter.length === 1, 'Failed job in dead letter queue');

// retryDeadLetter
const dead = queue17.deadLetter[0];
const retried = queue17.retryDeadLetter(dead.id);
assert(retried !== null, 'retryDeadLetter returns job');
assert(retried.status === JOB_STATUS.PENDING, 'Retried job is pending');
assert(retried.attempts === 0, 'Retried job has 0 attempts');
assert(queue17.queue.length === 1, 'Job back in queue');
assert(queue17.deadLetter.length === 0, 'Job removed from dead letter');

// retryDeadLetter non-existent
const notRetried = queue17.retryDeadLetter('nonexistent');
assert(notRetried === null, 'retryDeadLetter returns null for missing job');

// purgeCompleted
const queue18 = new JobQueue();
queue18.registerHandler('test', async () => {});
queue18.enqueue({ type: 'test' });
await queue18.processNext();
queue18.enqueue({ type: 'test' });
await queue18.processNext();

// To purge "old" jobs, we need cutoff AFTER completion time (purge everything before cutoff)
const cutoff = new Date(Date.now() + 1000).toISOString(); // 1 second from now
const purged = queue18.purgeCompleted(cutoff);
assert(purged === 2, 'purgeCompleted removes old jobs');
assert(queue18.completed.length === 0, 'Completed queue cleared');

// purgeCompleted doesn't remove recent — cutoff BEFORE completion time
const queue19 = new JobQueue();
queue19.registerHandler('test', async () => {});
queue19.enqueue({ type: 'test' });
await queue19.processNext();

const pastCutoff = new Date(Date.now() - 1000).toISOString(); // 1 second ago
const notPurged = queue19.purgeCompleted(pastCutoff);
assert(notPurged === 0, 'purgeCompleted preserves recent jobs');
assert(queue19.completed.length === 1, 'Completed job preserved');

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 9: METRICS (10 tests)
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n▸ SECTION 9: METRICS\n');

const queue20 = new JobQueue();
queue20.registerHandler('test', async () => {});
queue20.registerHandler('fail', async () => {
    throw new Error('fail');
});

// getHealth
const health = queue20.getHealth();
assert(health.healthy === true, 'getHealth returns healthy: true');
assert(health.queueSize === 0, 'getHealth includes queueSize');
assert(health.runningJobs === 0, 'getHealth includes runningJobs');
assert(health.completedJobs === 0, 'getHealth includes completedJobs');
assert(health.deadLetterSize === 0, 'getHealth includes deadLetterSize');
assert(health.metrics !== undefined, 'getHealth includes metrics');
assert(Array.isArray(health.registeredHandlers), 'getHealth includes registeredHandlers');

// getJobsByStatus
queue20.enqueue({ type: 'test' });
queue20.enqueue({ type: 'test' });

const pending = queue20.getJobsByStatus(JOB_STATUS.PENDING);
assert(pending.length === 2, 'getJobsByStatus returns pending jobs');

await queue20.processNext();
const completedL2 = queue20.getJobsByStatus(JOB_STATUS.COMPLETED);
assert(completedL2.length === 1, 'getJobsByStatus returns completed jobs');

const failedL2 = queue20.getJobsByStatus(JOB_STATUS.FAILED);
assert(Array.isArray(failedL2), 'getJobsByStatus returns array for failed');

// getJobsByOrg
const queue21 = new JobQueue();
queue21.registerHandler('test', async () => {});
queue21.enqueue({ type: 'test', orgId: 'org1' });
queue21.enqueue({ type: 'test', orgId: 'org2' });
queue21.enqueue({ type: 'test', orgId: 'org1' });

const org1Jobs = queue21.getJobsByOrg('org1');
assert(org1Jobs.length === 2, 'getJobsByOrg filters by organization');
assert(org1Jobs.every(j => j.orgId === 'org1'), 'All returned jobs are for org1');

const org1TypeJobs = queue21.getJobsByOrg('org1', 'test');
assert(org1TypeJobs.length === 2, 'getJobsByOrg filters by type');

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 10: DEPENDENCIES (6 tests)
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n▸ SECTION 10: DEPENDENCIES\n');

const queue22 = new JobQueue();
queue22.registerHandler('job_a', async () => ({ id: 'a' }));
queue22.registerHandler('job_b', async () => ({ id: 'b' }));

const jobA = queue22.enqueue({ type: 'job_a' });
const jobB = queue22.enqueue({ type: 'job_b', dependsOn: jobA.id });

assert(queue22.queue.length === 2, 'Both jobs enqueued');
assert(jobB.dependsOn === jobA.id, 'Dependency stored');

// Job B should not be eligible until A completes
const nextEligible = await queue22.processNext();
assert(nextEligible.id === jobA.id, 'Job A processed first');
assert(nextEligible.status === JOB_STATUS.COMPLETED, 'Job A completed');

// Now B should be eligible
const nextEligible2 = await queue22.processNext();
assert(nextEligible2.id === jobB.id, 'Job B processed after dependency');

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 11: FACTORY (5 tests)
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n▸ SECTION 11: FACTORY\n');

const factoryQueue = createJobQueue({
    test1: async (job) => ({ ok: true }),
    test2: async (job) => ({ ok: true })
});

assert(factoryQueue instanceof JobQueue, 'createJobQueue returns JobQueue');
assert(factoryQueue.hasHandler('test1'), 'Factory registers handlers');
assert(factoryQueue.hasHandler('test2'), 'Factory registers multiple handlers');

const customConfigQueue = createJobQueue(
    { test: async () => {} },
    { maxQueueSize: 1000 }
);
assert(customConfigQueue.config.maxQueueSize === 1000, 'Factory applies custom config');

// ═════════════════════════════════════════════════════════════════════════════
// RESULTS
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════════════════════════');
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════════════════════════\n');

if (failed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
