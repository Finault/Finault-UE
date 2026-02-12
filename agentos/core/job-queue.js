/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINAULT BACKGROUND JOB INFRASTRUCTURE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Gap #4: Background Job Infrastructure — HIGH / P1
 *
 * Problem: No production job queue. Invoice reconciliation, close pack generation,
 * anomaly detection — all run synchronously in request handlers. At enterprise
 * scale, these operations time out on Cloudflare Workers (30s limit) and block
 * the API. The webhook endpoint has a "TODO: implement queue" comment.
 *
 * This module provides:
 * - Priority-based job queue (critical > high > normal > low)
 * - Job lifecycle management (pending → running → completed/failed/retrying)
 * - Configurable retry with exponential backoff
 * - Dead letter queue for permanently failed jobs
 * - Job scheduling (cron-like) for recurring tasks
 * - Concurrency control (max simultaneous jobs per type)
 * - Job timeout enforcement
 * - Job dependency chains (job B waits for job A)
 * - Metrics and health monitoring
 *
 * Job Types:
 * - invoice_reconciliation: 3-way match for a billing period
 * - close_pack_generation: Monthly close pack assembly
 * - anomaly_detection: Scheduled anomaly scans
 * - report_generation: Async report builds
 * - data_import: Bulk data ingestion
 * - notification_digest: Digest email batching
 * - cleanup: Data retention and cleanup
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createLogger } from './structured-logger.js';
import DistributedLockManager from './distributed-lock.js';
import crypto from 'crypto';

const logger = createLogger('job-queue');

// ─── Job Status ──────────────────────────────────────────────────────────────

export const JOB_STATUS = {
    PENDING: 'pending',
    SCHEDULED: 'scheduled',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    RETRYING: 'retrying',
    DEAD_LETTER: 'dead_letter',
    CANCELLED: 'cancelled'
};

// ─── Job Priority ────────────────────────────────────────────────────────────

export const JOB_PRIORITY = {
    CRITICAL: 0,  // Process immediately (budget breach alerts)
    HIGH: 1,      // Process within minutes (reconciliation)
    NORMAL: 2,    // Process within the hour (close packs)
    LOW: 3        // Process when available (reports, cleanup)
};

// ─── Default Configuration ───────────────────────────────────────────────────

export const JOB_CONFIG = {
    // Concurrency limits by job type
    concurrency: {
        invoice_reconciliation: 3,
        close_pack_generation: 2,
        anomaly_detection: 5,
        report_generation: 3,
        data_import: 2,
        notification_digest: 1,
        cleanup: 1,
        default: 5
    },

    // Default retry configuration
    retry: {
        maxRetries: 3,
        backoffMs: [5000, 30000, 120000],  // 5s, 30s, 2min
        retryableErrors: ['ETIMEDOUT', 'ECONNRESET', 'PROVIDER_ERROR', 'SERVICE_UNAVAILABLE']
    },

    // Timeout per job type (ms)
    timeouts: {
        invoice_reconciliation: 300000,   // 5 minutes
        close_pack_generation: 600000,    // 10 minutes
        anomaly_detection: 120000,        // 2 minutes
        report_generation: 300000,        // 5 minutes
        data_import: 900000,              // 15 minutes
        notification_digest: 60000,       // 1 minute
        cleanup: 300000,                  // 5 minutes
        default: 120000                   // 2 minutes
    },

    // Dead letter queue
    deadLetter: {
        maxSize: 1000,
        retentionDays: 30
    },

    // Per-tenant job isolation (max concurrent jobs per organization)
    tenantConcurrency: {
        default: 5  // Default: 5 jobs per org at once
    },

    // Queue limits
    maxQueueSize: 10000,
    maxRunningJobs: 20
};

// ─── Scheduled Job Definitions ───────────────────────────────────────────────

export const SCHEDULED_JOBS = {
    daily_anomaly_scan: {
        type: 'anomaly_detection',
        schedule: '0 2 * * *',    // 2 AM UTC daily
        priority: JOB_PRIORITY.NORMAL,
        description: 'Daily anomaly detection scan across all organizations'
    },
    weekly_digest: {
        type: 'notification_digest',
        schedule: '0 9 * * 1',    // 9 AM UTC Monday
        priority: JOB_PRIORITY.LOW,
        description: 'Weekly notification digest email'
    },
    monthly_cleanup: {
        type: 'cleanup',
        schedule: '0 3 1 * *',    // 3 AM UTC, 1st of month
        priority: JOB_PRIORITY.LOW,
        description: 'Monthly data retention cleanup'
    },
    hourly_digest: {
        type: 'notification_digest',
        schedule: '0 * * * *',    // Top of every hour
        priority: JOB_PRIORITY.LOW,
        description: 'Hourly notification digest for high-frequency alerts'
    }
};

// ─── Job Queue Persistence Layer ────────────────────────────────────────────

/**
 * JobQueuePersistence wraps a persistence adapter to handle database operations.
 * Falls back to in-memory if adapter unavailable.
 */
export class JobQueuePersistence {
    constructor(adapter = null) {
        this.adapter = adapter;
    }

    /**
     * Save a job to persistence
     * @param {Object} job - Job object
     * @returns {Promise<Object>} Saved job
     */
    async saveJob(job) {
        if (!this.adapter) return job;

        try {
            if (typeof this.adapter.saveJob === 'function') {
                return await this.adapter.saveJob(job);
            }
        } catch (err) {
            console.log('[JobQueue] Persistence save failed, continuing in-memory', { error: err.message });
        }
        return job;
    }

    /**
     * Load all pending jobs from persistence
     * @returns {Promise<Object[]>} Array of jobs
     */
    async loadPendingJobs() {
        if (!this.adapter) return [];

        try {
            if (typeof this.adapter.loadPendingJobs === 'function') {
                return await this.adapter.loadPendingJobs();
            }
        } catch (err) {
            console.log('[JobQueue] Persistence load failed, continuing with empty queue', { error: err.message });
        }
        return [];
    }

    /**
     * Update job status in persistence
     * @param {string} jobId - Job ID
     * @param {string} status - New status
     * @param {Object} metadata - Additional metadata
     * @returns {Promise<Object>} Updated job
     */
    async updateJobStatus(jobId, status, metadata = {}) {
        if (!this.adapter) return { jobId, status, ...metadata };

        try {
            if (typeof this.adapter.updateJobStatus === 'function') {
                return await this.adapter.updateJobStatus(jobId, status, metadata);
            }
        } catch (err) {
            console.log('[JobQueue] Persistence update failed, continuing in-memory', { error: err.message });
        }
        return { jobId, status, ...metadata };
    }

    /**
     * Load dead letter jobs with pagination
     * @param {number} limit - Limit
     * @param {number} offset - Offset
     * @returns {Promise<Object[]>} Array of dead letter jobs
     */
    async loadDeadLetterJobs(limit = 50, offset = 0) {
        if (!this.adapter) return [];

        try {
            if (typeof this.adapter.loadDeadLetterJobs === 'function') {
                return await this.adapter.loadDeadLetterJobs(limit, offset);
            }
        } catch (err) {
            console.log('[JobQueue] Persistence load dead letter failed', { error: err.message });
        }
        return [];
    }

    /**
     * Get a job by ID from persistence
     * @param {string} jobId - Job ID
     * @returns {Promise<Object|null>} Job or null
     */
    async getJobById(jobId) {
        if (!this.adapter) return null;

        try {
            if (typeof this.adapter.getJobById === 'function') {
                return await this.adapter.getJobById(jobId);
            }
        } catch (err) {
            console.log('[JobQueue] Persistence get failed', { error: err.message });
        }
        return null;
    }

    /**
     * Get job queue statistics from persistence
     * @returns {Promise<Object>} Statistics
     */
    async getJobStats() {
        if (!this.adapter) return { pending: 0, running: 0, completed: 0, failed: 0, deadLetter: 0 };

        try {
            if (typeof this.adapter.getJobStats === 'function') {
                return await this.adapter.getJobStats();
            }
        } catch (err) {
            console.log('[JobQueue] Persistence stats failed', { error: err.message });
        }
        return { pending: 0, running: 0, completed: 0, failed: 0, deadLetter: 0 };
    }
}

// ─── Job Queue Class ─────────────────────────────────────────────────────────

/**
 * Error classification for retry decisions.
 * Transient: worth retrying (network, timeout, rate limit)
 * Permanent: never retry (auth, validation, missing resource)
 */
export const ERROR_CLASS = {
    TRANSIENT: 'transient',
    PERMANENT: 'permanent',
    UNKNOWN: 'unknown'
};

const TRANSIENT_PATTERNS = [
    'TIMEOUT', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND',
    'EAI_AGAIN', 'EPIPE', 'socket hang up', 'network', 'rate limit',
    '429', '502', '503', '504', 'temporarily unavailable', 'retry after'
];
const PERMANENT_PATTERNS = [
    '401', '403', 'unauthorized', 'forbidden', 'invalid api key',
    'invalid token', 'schema validation', 'not found', '404',
    'invalid argument', 'malformed', 'parse error'
];

/**
 * Classify an error as transient (retryable) or permanent (dead-letter immediately)
 * @param {Error} error
 * @returns {{ errorClass: string, retryable: boolean }}
 */
export function classifyJobError(error) {
    const msg = (error.message || '').toLowerCase();
    const code = String(error.code || error.statusCode || '').toLowerCase();
    const combined = `${msg} ${code}`;

    if (error.retryable === true) return { errorClass: ERROR_CLASS.TRANSIENT, retryable: true };
    if (error.retryable === false) return { errorClass: ERROR_CLASS.PERMANENT, retryable: false };

    for (const p of PERMANENT_PATTERNS) {
        if (combined.includes(p.toLowerCase())) return { errorClass: ERROR_CLASS.PERMANENT, retryable: false };
    }
    for (const p of TRANSIENT_PATTERNS) {
        if (combined.includes(p.toLowerCase())) return { errorClass: ERROR_CLASS.TRANSIENT, retryable: true };
    }
    return { errorClass: ERROR_CLASS.UNKNOWN, retryable: true }; // Default: retry unknowns
}

export class JobQueue {
    /**
     * @param {Object} [config] - Override default configuration
     */
    constructor(config = {}) {
        this.config = { ...JOB_CONFIG, ...config };
        this.queue = [];              // Pending jobs (priority-sorted)
        this.running = new Map();     // jobId → job
        this.completed = [];          // Completed jobs (capped)
        this.deadLetter = [];         // Dead letter queue
        this.handlers = new Map();    // jobType → handler function
        this.runningByType = {};      // jobType → count
        this.tenantConcurrency = new Map();  // orgId → count of running jobs
        this.persistenceAdapter = config.persistenceAdapter || null;
        this.persistence = new JobQueuePersistence(this.persistenceAdapter);
        this.workerId = config.workerId || `worker_${crypto.randomBytes(6).toString('hex')}`;
        this.lockManager = new DistributedLockManager(config.lockAdapter || null);
        this.metrics = {
            totalEnqueued: 0,
            totalCompleted: 0,
            totalFailed: 0,
            totalRetries: 0,
            totalDeadLettered: 0,
            totalCancelled: 0,
            avgProcessingTimeMs: 0,
            throughputPerMinute: 0,
            lastMetricsUpdate: Date.now(),
            processingTimes: [] // Track last 100 processing times for avg
        };
        this.isProcessing = false;
        this.maxCompletedSize = 5000;
        this.workerRunning = false;
        this.workerInterval = null;
        this.schedulerRunning = false;
        this.schedulerInterval = null;
        this.scheduledJobs = new Map(); // cron pattern → { type, payload, lastRun }
    }

    // ── Worker Loop ──

    /**
     * Start background worker loop that processes jobs at regular intervals
     * @param {number} [intervalMs=1000] - Polling interval in milliseconds
     */
    startWorker(intervalMs = 1000) {
        if (this.workerRunning) {
            console.log('[JobQueue] Worker already running');
            return;
        }

        this.workerRunning = true;
        console.log('[JobQueue] Worker started', { workerId: this.workerId, intervalMs });

        this.workerInterval = setInterval(async () => {
            try {
                // Check and process scheduled jobs
                this._checkScheduledJobs();

                // Process next eligible job (if not at capacity)
                if (this.running.size < this.config.maxRunningJobs) {
                    await this.processNext();
                }
            } catch (err) {
                console.log('[JobQueue] Worker error', { error: err.message });
            }
        }, intervalMs);
    }

    /**
     * Stop the background worker loop
     */
    stopWorker() {
        if (!this.workerRunning) {
            console.log('[JobQueue] Worker not running');
            return;
        }

        if (this.workerInterval) {
            clearInterval(this.workerInterval);
            this.workerInterval = null;
        }

        this.workerRunning = false;
        console.log('[JobQueue] Worker stopped');
    }

    /**
     * Start the scheduled job runner that checks for due scheduled jobs
     * Uses distributed locks to prevent duplicate execution across workers
     * @param {number} [intervalMs=60000] - Check interval in milliseconds (default: 1 minute)
     */
    startScheduler(intervalMs = 60000) {
        if (this.schedulerRunning) {
            console.log('[JobQueue] Scheduler already running');
            return;
        }

        this.schedulerRunning = true;
        console.log('[JobQueue] Scheduler started', { intervalMs });

        this.schedulerInterval = setInterval(async () => {
            try {
                await this._processScheduledJobs();
            } catch (err) {
                console.log('[JobQueue] Scheduler error', { error: err.message });
            }
        }, intervalMs);
    }

    /**
     * Stop the scheduled job runner
     */
    stopScheduler() {
        if (!this.schedulerRunning) {
            console.log('[JobQueue] Scheduler not running');
            return;
        }

        if (this.schedulerInterval) {
            clearInterval(this.schedulerInterval);
            this.schedulerInterval = null;
        }

        this.schedulerRunning = false;
        console.log('[JobQueue] Scheduler stopped');
    }

    /**
     * Process all scheduled jobs that are due
     * Uses distributed locks to ensure only one worker enqueues each job
     * @private
     */
    async _processScheduledJobs() {
        const now = new Date();

        for (const [scheduleId, schedule] of this.scheduledJobs.entries()) {
            if (!this._shouldRunSchedule(schedule, now)) {
                continue;
            }

            // Use distributed lock to ensure only one worker enqueues this scheduled job
            const lockKey = `scheduled:${scheduleId}`;
            const lockResult = await this.lockManager.acquireLock(lockKey, 30000); // 30s lock

            if (!lockResult.acquired) {
                // Another worker already handling this scheduled job
                continue;
            }

            try {
                // Double-check timing (another worker might have just run it)
                if (!this._shouldRunSchedule(schedule, now)) {
                    continue;
                }

                // Enqueue the scheduled job
                const jobPayload = {
                    ...schedule.payload,
                    scheduledId: scheduleId,
                    scheduledAt: now.toISOString()
                };

                this.enqueue({
                    type: schedule.jobType,
                    payload: jobPayload,
                    priority: schedule.priority,
                    orgId: schedule.orgId || null
                });

                schedule.lastRun = now.toISOString();
                console.log('[JobQueue] Scheduled job triggered', {
                    scheduleId,
                    jobType: schedule.jobType,
                    workerId: this.workerId
                });
            } catch (err) {
                console.log('[JobQueue] Failed to enqueue scheduled job', {
                    scheduleId,
                    error: err.message
                });
            } finally {
                // Release the distributed lock
                await this.lockManager.releaseLock(lockKey, lockResult.lockId);
            }
        }
    }

    // ── Persistence ──

    /**
     * Save current queue state as a checkpoint for crash recovery.
     * If a persistenceAdapter is configured, persists to it; otherwise returns the snapshot.
     * @returns {Promise<Object>} checkpoint snapshot
     */
    async saveCheckpoint() {
        const snapshot = {
            timestamp: new Date().toISOString(),
            queue: [...this.queue],
            deadLetter: [...this.deadLetter],
            completed: this.completed.slice(-500), // Keep last 500 completed
            metrics: { ...this.metrics }
        };

        if (this.persistenceAdapter && typeof this.persistenceAdapter.save === 'function') {
            await this.persistenceAdapter.save('job_queue_checkpoint', snapshot);
        }
        return snapshot;
    }

    /**
     * Restore queue state from a checkpoint after restart.
     * Re-queues any jobs that were running (crashed mid-execution).
     * @param {Object} [snapshot] - Optional snapshot; if null, loads from adapter
     * @returns {Object} { restored: number, requeued: number }
     */
    async restoreCheckpoint(snapshot = null) {
        if (!snapshot && this.persistenceAdapter && typeof this.persistenceAdapter.load === 'function') {
            snapshot = await this.persistenceAdapter.load('job_queue_checkpoint');
        }
        if (!snapshot) return { restored: 0, requeued: 0 };

        let restored = 0;
        let requeued = 0;

        // Restore pending jobs
        if (snapshot.queue && Array.isArray(snapshot.queue)) {
            for (const job of snapshot.queue) {
                if (job.status === JOB_STATUS.RUNNING) {
                    // Job was running when server crashed — re-queue it
                    job.status = JOB_STATUS.PENDING;
                    job.attempts = (job.attempts || 0); // Keep attempt count
                    requeued++;
                }
                this.queue.push(job);
                restored++;
            }
        }

        // Restore dead letter queue
        if (snapshot.deadLetter && Array.isArray(snapshot.deadLetter)) {
            this.deadLetter = snapshot.deadLetter;
        }

        // Restore metrics
        if (snapshot.metrics) {
            this.metrics = { ...this.metrics, ...snapshot.metrics };
        }

        return { restored, requeued };
    }

    // ── Handler Registration ──

    /**
     * Register a handler for a job type
     * @param {string} jobType - Job type identifier
     * @param {Function} handler - async (job) => result
     */
    registerHandler(jobType, handler) {
        if (typeof handler !== 'function') {
            throw new Error(`Handler for '${jobType}' must be a function`);
        }
        this.handlers.set(jobType, handler);
        return this;
    }

    /**
     * Check if a handler exists for a job type
     * @param {string} jobType
     * @returns {boolean}
     */
    hasHandler(jobType) {
        return this.handlers.has(jobType);
    }

    // ── Job Lifecycle ──

    /**
     * Enqueue a new job
     * @param {Object} job
     * @param {string} job.type - Job type (must have registered handler)
     * @param {Object} [job.payload] - Job data
     * @param {number} [job.priority] - JOB_PRIORITY value (default: NORMAL)
     * @param {string} [job.orgId] - Organization context
     * @param {string} [job.scheduledFor] - ISO timestamp for deferred execution
     * @param {string} [job.dependsOn] - Job ID that must complete first
     * @returns {Object} Created job
     */
    enqueue(job) {
        if (!job || !job.type) {
            throw new Error('Job requires a type');
        }

        if (this.queue.length >= this.config.maxQueueSize) {
            throw new Error(`Queue is full (${this.config.maxQueueSize} max). Cannot enqueue new jobs.`);
        }

        const newJob = {
            id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
            type: job.type,
            payload: job.payload || {},
            priority: job.priority !== undefined ? job.priority : JOB_PRIORITY.NORMAL,
            orgId: job.orgId || null,
            status: job.scheduledFor ? JOB_STATUS.SCHEDULED : JOB_STATUS.PENDING,
            scheduledFor: job.scheduledFor || null,
            dependsOn: job.dependsOn || null,
            attempts: 0,
            maxRetries: job.maxRetries ?? this.config.retry.maxRetries,
            createdAt: new Date().toISOString(),
            startedAt: null,
            completedAt: null,
            result: null,
            error: null,
            duration: null
        };

        // Insert in priority order (lower number = higher priority)
        const insertIdx = this.queue.findIndex(q => q.priority > newJob.priority);
        if (insertIdx === -1) {
            this.queue.push(newJob);
        } else {
            this.queue.splice(insertIdx, 0, newJob);
        }

        this.metrics.totalEnqueued++;

        // Persist to database asynchronously (non-blocking)
        this.persistence.saveJob(newJob).catch(err => {
            console.log('[JobQueue] Failed to persist job, continuing in-memory', { jobId: newJob.id, error: err.message });
        });

        console.log('[JobQueue] Job enqueued', {
            jobId: newJob.id,
            jobType: newJob.type,
            priority: newJob.priority,
            orgId: newJob.orgId,
            queueSize: this.queue.length,
            workerId: this.workerId
        });

        return { ...newJob };
    }

    /**
     * Process the next eligible job from the queue
     * @returns {Object|null} The job being processed, or null if none eligible
     */
    async processNext() {
        if (this.running.size >= this.config.maxRunningJobs) {
            return null; // At capacity
        }

        const job = this._findNextEligible();
        if (!job) return null;

        return this._executeJob(job);
    }

    /**
     * Process all eligible jobs (up to maxRunningJobs)
     * @returns {Object} { started: number, alreadyRunning: number }
     */
    async processAll() {
        let started = 0;
        while (this.running.size < this.config.maxRunningJobs) {
            const job = this._findNextEligible();
            if (!job) break;
            this._executeJob(job);
            started++;
        }
        return { started, alreadyRunning: this.running.size - started };
    }

    /**
     * Cancel a pending job
     * @param {string} jobId
     * @returns {boolean}
     */
    cancel(jobId) {
        const idx = this.queue.findIndex(j => j.id === jobId);
        if (idx !== -1) {
            const job = this.queue.splice(idx, 1)[0];
            job.status = JOB_STATUS.CANCELLED;
            job.completedAt = new Date().toISOString();
            this.completed.push(job);
            this.metrics.totalCancelled++;
            this._trimCompleted();
            return true;
        }
        return false;
    }

    /**
     * Get a job by ID (checks all queues)
     * @param {string} jobId
     * @returns {Object|null}
     */
    getJob(jobId) {
        const pending = this.queue.find(j => j.id === jobId);
        if (pending) return { ...pending };

        const running = this.running.get(jobId);
        if (running) return { ...running };

        const completed = this.completed.find(j => j.id === jobId);
        if (completed) return { ...completed };

        const dead = this.deadLetter.find(j => j.id === jobId);
        if (dead) return { ...dead };

        return null;
    }

    // ── Internal Execution ──

    _findNextEligible() {
        const now = new Date().toISOString();

        for (let i = 0; i < this.queue.length; i++) {
            const job = this.queue[i];

            // Skip scheduled jobs that aren't ready
            if (job.scheduledFor && job.scheduledFor > now) continue;

            // Skip jobs with unmet dependencies
            if (job.dependsOn) {
                const dep = this.completed.find(c => c.id === job.dependsOn && c.status === JOB_STATUS.COMPLETED);
                if (!dep) continue;
            }

            // Check concurrency limit for this type
            const typeCount = this.runningByType[job.type] || 0;
            const typeLimit = this.config.concurrency[job.type] || this.config.concurrency.default;
            if (typeCount >= typeLimit) continue;

            // Check per-tenant concurrency limit (per-org job isolation)
            if (job.orgId) {
                const tenantCount = this.tenantConcurrency.get(job.orgId) || 0;
                const tenantLimit = this.config.tenantConcurrency?.default || 5;
                if (tenantCount >= tenantLimit) continue;
            }

            // Eligible — remove from queue
            this.queue.splice(i, 1);
            return job;
        }

        return null;
    }

    async _executeJob(job) {
        job.status = JOB_STATUS.RUNNING;
        job.startedAt = new Date().toISOString();
        job.workerId = this.workerId;
        job.attempts++;
        this.running.set(job.id, job);
        this.runningByType[job.type] = (this.runningByType[job.type] || 0) + 1;

        // Track per-tenant concurrency (for job isolation)
        if (job.orgId) {
            this.tenantConcurrency.set(
                job.orgId,
                (this.tenantConcurrency.get(job.orgId) || 0) + 1
            );
        }

        const handler = this.handlers.get(job.type);
        if (!handler) {
            return this._failJob(job, `No handler registered for job type: ${job.type}`);
        }

        const timeout = this.config.timeouts[job.type] || this.config.timeouts.default;

        // Update persistence that job is running
        this.persistence.updateJobStatus(job.id, JOB_STATUS.RUNNING, {
            startedAt: job.startedAt,
            workerId: this.workerId,
            attempts: job.attempts
        }).catch(err => {
            console.log('[JobQueue] Failed to update job to running state', { jobId: job.id, error: err.message });
        });

        try {
            const result = await Promise.race([
                handler(job),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`Job timed out after ${timeout}ms`)), timeout)
                )
            ]);

            return this._completeJob(job, result);
        } catch (err) {
            return this._handleJobError(job, err);
        }
    }

    _completeJob(job, result) {
        job.status = JOB_STATUS.COMPLETED;
        job.completedAt = new Date().toISOString();
        job.result = result;
        job.duration = new Date(job.completedAt) - new Date(job.startedAt);

        // Track processing time for metrics
        if (job.duration >= 0) {
            this.metrics.processingTimes.push(job.duration);
            // Keep only last 100 processing times
            if (this.metrics.processingTimes.length > 100) {
                this.metrics.processingTimes.shift();
            }
        }

        this.running.delete(job.id);
        this.runningByType[job.type] = Math.max(0, (this.runningByType[job.type] || 1) - 1);

        // Decrement per-tenant concurrency
        if (job.orgId) {
            const tenantCount = Math.max(0, (this.tenantConcurrency.get(job.orgId) || 1) - 1);
            if (tenantCount === 0) {
                this.tenantConcurrency.delete(job.orgId);
            } else {
                this.tenantConcurrency.set(job.orgId, tenantCount);
            }
        }

        this.completed.push(job);
        this.metrics.totalCompleted++;
        this._trimCompleted();

        // Persist completion status
        this.persistence.updateJobStatus(job.id, JOB_STATUS.COMPLETED, {
            completedAt: job.completedAt,
            duration: job.duration,
            result: result
        }).catch(err => {
            console.log('[JobQueue] Failed to persist job completion', { jobId: job.id, error: err.message });
        });

        console.log('[JobQueue] Job completed', {
            jobId: job.id,
            jobType: job.type,
            duration: job.duration,
            workerId: this.workerId
        });

        return { ...job };
    }

    _failJob(job, errorMessage) {
        job.status = JOB_STATUS.FAILED;
        job.completedAt = new Date().toISOString();
        job.error = errorMessage;
        job.duration = new Date(job.completedAt) - new Date(job.startedAt);

        this.running.delete(job.id);
        this.runningByType[job.type] = Math.max(0, (this.runningByType[job.type] || 1) - 1);

        // Decrement per-tenant concurrency
        if (job.orgId) {
            const tenantCount = Math.max(0, (this.tenantConcurrency.get(job.orgId) || 1) - 1);
            if (tenantCount === 0) {
                this.tenantConcurrency.delete(job.orgId);
            } else {
                this.tenantConcurrency.set(job.orgId, tenantCount);
            }
        }

        this.metrics.totalFailed++;
        this._moveToDeadLetter(job);

        return { ...job };
    }

    _handleJobError(job, error) {
        const errorMsg = error.message || String(error);

        // Classify error using intelligent error classification
        const classification = classifyJobError(error);

        // Legacy fallback: check retryableErrors config patterns
        const legacyRetryable = this.config.retry.retryableErrors.some(e =>
            errorMsg.includes(e)
        );
        const isRetryable = classification.retryable || legacyRetryable;

        // Store classification on job for observability
        job.errorClass = classification.errorClass;

        if (isRetryable && job.attempts < job.maxRetries) {
            // Retry
            job.status = JOB_STATUS.RETRYING;
            job.error = errorMsg;
            const backoffIdx = Math.min(job.attempts - 1, this.config.retry.backoffMs.length - 1);
            const delay = this.config.retry.backoffMs[backoffIdx];

            job.scheduledFor = new Date(Date.now() + delay).toISOString();
            this.running.delete(job.id);
            this.runningByType[job.type] = Math.max(0, (this.runningByType[job.type] || 1) - 1);

            // Re-enqueue with same priority
            this.queue.unshift(job);
            this.metrics.totalRetries++;

            logger.info('Job scheduled for retry', {
                jobId: job.id,
                jobType: job.type,
                attempt: job.attempts,
                maxRetries: job.maxRetries,
                retryDelayMs: delay,
                errorClass: classification.errorClass
            });

            return { ...job, retryIn: delay };
        }

        logger.error('Job failed permanently', {
            jobId: job.id,
            jobType: job.type,
            attempt: job.attempts,
            maxRetries: job.maxRetries,
            errorClass: classification.errorClass,
            errorMessage: errorMsg.substring(0, 100)
        });

        return this._failJob(job, errorMsg);
    }

    _moveToDeadLetter(job) {
        job.status = JOB_STATUS.DEAD_LETTER;
        job.deadLetteredAt = new Date().toISOString();
        this.deadLetter.push(job);
        this.metrics.totalDeadLettered++;

        // Persist to database asynchronously
        this.persistence.updateJobStatus(job.id, JOB_STATUS.DEAD_LETTER, {
            deadLetteredAt: job.deadLetteredAt,
            error: job.error,
            attempts: job.attempts
        }).catch(err => {
            console.log('[JobQueue] Failed to persist dead letter job', { jobId: job.id, error: err.message });
        });

        console.log('[JobQueue] Job moved to dead letter', {
            jobId: job.id,
            jobType: job.type,
            attempts: job.attempts,
            maxRetries: job.maxRetries
        });

        if (this.deadLetter.length > this.config.deadLetter.maxSize) {
            this.deadLetter = this.deadLetter.slice(-this.config.deadLetter.maxSize / 2);
        }
    }

    _trimCompleted() {
        if (this.completed.length > this.maxCompletedSize) {
            this.completed = this.completed.slice(-this.maxCompletedSize / 2);
        }
    }

    // ── Scheduled Jobs (Cron-like) ──

    /**
     * Schedule a recurring job with cron pattern
     * Supports patterns like: every 5 minutes, hourly, daily, weekly
     * @param {string} cronPattern - Cron pattern (minute hour day month dayOfWeek)
     * @param {string} jobType - Job type to enqueue
     * @param {Object} [payload] - Payload for the job
     * @param {number} [priority] - Job priority
     * @param {string} [orgId] - Organization ID for multi-tenant isolation
     * @returns {string} Schedule ID
     */
    schedule(cronPattern, jobType, payload = {}, priority = JOB_PRIORITY.NORMAL, orgId = null) {
        const scheduleId = `sched_${crypto.randomBytes(6).toString('hex')}`;

        this.scheduledJobs.set(scheduleId, {
            cronPattern,
            jobType,
            payload,
            priority,
            orgId,
            lastRun: null,
            createdAt: new Date().toISOString()
        });

        console.log('[JobQueue] Schedule registered', { scheduleId, cronPattern, jobType, orgId });
        return scheduleId;
    }

    /**
     * Check if any scheduled jobs should trigger and enqueue them
     * @private
     */
    _checkScheduledJobs() {
        const now = new Date();

        for (const [scheduleId, schedule] of this.scheduledJobs.entries()) {
            if (this._shouldRunSchedule(schedule, now)) {
                try {
                    this.enqueue({
                        type: schedule.jobType,
                        payload: schedule.payload,
                        priority: schedule.priority,
                        scheduledId: scheduleId
                    });

                    schedule.lastRun = now.toISOString();
                    console.log('[JobQueue] Scheduled job triggered', { scheduleId, jobType: schedule.jobType });
                } catch (err) {
                    console.log('[JobQueue] Failed to enqueue scheduled job', { scheduleId, error: err.message });
                }
            }
        }
    }

    /**
     * Determine if a schedule should run based on cron pattern and current time
     * @private
     */
    _shouldRunSchedule(schedule, now) {
        if (!schedule.lastRun) {
            // Always run on first check after registration (if pattern matches)
            return this._cronMatches(schedule.cronPattern, now);
        }

        const lastRun = new Date(schedule.lastRun);

        // Only run once per minute (compare by minute boundaries)
        if (now.getTime() - lastRun.getTime() < 60000) {
            return false;
        }

        return this._cronMatches(schedule.cronPattern, now);
    }

    /**
     * Check if a time matches a cron pattern
     * Simplified: supports interval patterns, specific values, and wildcards
     * @private
     */
    _cronMatches(pattern, date) {
        const parts = pattern.split(' ');
        if (parts.length !== 5) return false;

        const [minPart, hourPart, dayPart, monthPart, dowPart] = parts;
        const minute = date.getUTCMinutes();
        const hour = date.getUTCHours();
        const day = date.getUTCDate();
        const month = date.getUTCMonth() + 1;
        const dow = date.getUTCDay();

        const matchesPart = (part, value) => {
            if (part === '*') return true;
            if (part.startsWith('*/')) {
                const interval = parseInt(part.slice(2));
                return value % interval === 0;
            }
            return parseInt(part) === value;
        };

        return matchesPart(minPart, minute) &&
               matchesPart(hourPart, hour) &&
               matchesPart(dayPart, day) &&
               matchesPart(monthPart, month) &&
               matchesPart(dowPart, dow);
    }

    // ── Dead Letter Queue API ──

    /**
     * Get dead letter queue with advanced filtering and pagination
     * @param {Object} [options] - Query options
     * @param {number} [options.limit=50] - Limit
     * @param {number} [options.offset=0] - Offset
     * @param {string} [options.jobType] - Filter by job type
     * @param {string} [options.orgId] - Filter by organization ID
     * @returns {Promise<Object>} { jobs: [], total: number, filtered: number }
     */
    async getDLQJobs(options = {}) {
        const { limit = 50, offset = 0, jobType = null, orgId = null } = options;

        // Try persistence first
        let persistenceJobs = await this.persistence.loadDeadLetterJobs(1000, 0);
        let jobs = persistenceJobs.length > 0 ? persistenceJobs : [...this.deadLetter];

        // Apply filters
        jobs = jobs.filter(job => {
            if (jobType && job.type !== jobType) return false;
            if (orgId && job.orgId !== orgId) return false;
            return true;
        });

        const filtered = jobs.length;
        const paginated = jobs.slice(offset, offset + limit);

        return {
            jobs: paginated,
            total: this.deadLetter.length,
            filtered,
            offset,
            limit
        };
    }

    /**
     * Get dead letter queue with pagination
     * @param {Object} [options] - Query options
     * @param {number} [options.limit=50] - Limit
     * @param {number} [options.offset=0] - Offset
     * @returns {Promise<Object>} { jobs: [], total: number }
     */
    async getDeadLetterQueue(options = {}) {
        const { limit = 50, offset = 0 } = options;

        // Try persistence first
        const persistenceJobs = await this.persistence.loadDeadLetterJobs(limit, offset);
        if (persistenceJobs.length > 0) {
            return {
                jobs: persistenceJobs,
                total: persistenceJobs.length,
                source: 'persistence'
            };
        }

        // Fall back to in-memory
        const jobs = this.deadLetter.slice(offset, offset + limit);
        return {
            jobs,
            total: this.deadLetter.length,
            source: 'memory'
        };
    }

    /**
     * Retry a dead letter job (move back to pending)
     * @param {string} jobId - Job ID
     * @returns {Promise<Object|null>} Re-enqueued job or null
     */
    async retryDeadLetterJob(jobId) {
        const idx = this.deadLetter.findIndex(j => j.id === jobId);
        if (idx === -1) return null;

        const job = this.deadLetter.splice(idx, 1)[0];
        job.status = JOB_STATUS.PENDING;
        job.attempts = 0;
        job.error = null;
        job.result = null;
        job.startedAt = null;
        job.completedAt = null;
        job.deadLetteredAt = null;

        this.queue.push(job);

        await this.persistence.updateJobStatus(jobId, JOB_STATUS.PENDING, {
            attempts: 0,
            error: null,
            result: null
        });

        console.log('[JobQueue] Dead letter job retried', { jobId });
        return { ...job };
    }

    /**
     * Retry a DLQ job by ID (alias for retryDeadLetterJob)
     * @param {string} jobId - Job ID
     * @returns {Promise<Object|null>} Re-enqueued job or null
     */
    async retryDLQJob(jobId) {
        return this.retryDeadLetterJob(jobId);
    }

    /**
     * Purge dead letter jobs with advanced filtering
     * @param {Object} [options={}] - Filter options
     * @param {number} [options.olderThanDays] - Only purge jobs older than this many days
     * @param {string} [options.jobType] - Only purge jobs of this type
     * @param {string} [options.orgId] - Only purge jobs from this organization
     * @returns {Promise<number>} Number of jobs purged
     */
    async purgeDLQ(options = {}) {
        const { olderThanDays = null, jobType = null, orgId = null } = options;

        const before = this.deadLetter.length;
        const now = Date.now();

        this.deadLetter = this.deadLetter.filter(j => {
            // Filter by age if specified
            if (olderThanDays !== null) {
                const jobTime = j.deadLetteredAt || j.completedAt || j.createdAt;
                const jobAgeMs = now - new Date(jobTime).getTime();
                const cutoffMs = olderThanDays * 24 * 60 * 60 * 1000;
                if (jobAgeMs <= cutoffMs) {
                    return true; // Keep jobs within retention period
                }
            }

            // Filter by type if specified
            if (jobType && j.type !== jobType) {
                return true; // Keep jobs not matching filter
            }

            // Filter by org if specified
            if (orgId && j.orgId !== orgId) {
                return true; // Keep jobs not matching filter
            }

            // Job matches purge criteria — remove it
            return false;
        });

        const purged = before - this.deadLetter.length;
        console.log('[JobQueue] Dead letter queue purged', {
            purged,
            olderThanDays,
            jobType,
            orgId
        });

        return purged;
    }

    /**
     * Purge dead letter jobs older than a given age (legacy method)
     * @param {number} olderThanDays - Age in days
     * @returns {Promise<number>} Number of jobs purged
     */
    async purgeDeadLetterQueue(olderThanDays) {
        return this.purgeDLQ({ olderThanDays });
    }

    /**
     * Get Dead Letter Queue metrics and statistics
     * @returns {Object} { count, oldest, newest, byType: {}, byTenant: {} }
     */
    getDLQMetrics() {
        const metrics = {
            count: this.deadLetter.length,
            oldest: null,
            newest: null,
            byType: {},
            byTenant: {},
            byErrorClass: {}
        };

        if (this.deadLetter.length === 0) {
            return metrics;
        }

        // Find oldest and newest
        const deadLetterTimes = this.deadLetter.map(j => ({
            job: j,
            time: new Date(j.deadLetteredAt || j.completedAt || j.createdAt).getTime()
        }));

        deadLetterTimes.sort((a, b) => a.time - b.time);
        metrics.oldest = {
            jobId: deadLetterTimes[0].job.id,
            jobType: deadLetterTimes[0].job.type,
            time: deadLetterTimes[0].job.deadLetteredAt || deadLetterTimes[0].job.completedAt
        };
        metrics.newest = {
            jobId: deadLetterTimes[deadLetterTimes.length - 1].job.id,
            jobType: deadLetterTimes[deadLetterTimes.length - 1].job.type,
            time: deadLetterTimes[deadLetterTimes.length - 1].job.deadLetteredAt
        };

        // Count by type
        for (const job of this.deadLetter) {
            metrics.byType[job.type] = (metrics.byType[job.type] || 0) + 1;
        }

        // Count by tenant
        for (const job of this.deadLetter) {
            const orgId = job.orgId || 'no-tenant';
            metrics.byTenant[orgId] = (metrics.byTenant[orgId] || 0) + 1;
        }

        // Count by error class
        for (const job of this.deadLetter) {
            const errorClass = job.errorClass || 'unknown';
            metrics.byErrorClass[errorClass] = (metrics.byErrorClass[errorClass] || 0) + 1;
        }

        return metrics;
    }

    // ── Query Methods ──

    /**
     * Get detailed job queue metrics for observability
     * @returns {Promise<Object>}
     */
    async getMetrics() {
        // Update throughput per minute
        const now = Date.now();
        const timeSinceLastUpdate = now - this.metrics.lastMetricsUpdate;
        if (timeSinceLastUpdate > 0) {
            const minutesPassed = timeSinceLastUpdate / (1000 * 60);
            const completedInPeriod = this.completed.filter(j => {
                const jobTime = new Date(j.completedAt).getTime();
                return jobTime > this.metrics.lastMetricsUpdate;
            }).length;
            this.metrics.throughputPerMinute = completedInPeriod / minutesPassed;
        }

        // Calculate average processing time
        if (this.metrics.processingTimes.length > 0) {
            const sum = this.metrics.processingTimes.reduce((a, b) => a + b, 0);
            this.metrics.avgProcessingTimeMs = sum / this.metrics.processingTimes.length;
        }

        const persistenceStats = await this.persistence.getJobStats();

        return {
            pending: this.queue.length,
            running: this.running.size,
            completed: this.completed.length,
            failed: this.deadLetter.length,
            deadLetter: this.deadLetter.length,
            avgProcessingTimeMs: this.metrics.avgProcessingTimeMs,
            throughputPerMinute: this.metrics.throughputPerMinute,
            totalEnqueued: this.metrics.totalEnqueued,
            totalCompleted: this.metrics.totalCompleted,
            totalFailed: this.metrics.totalFailed,
            totalRetries: this.metrics.totalRetries,
            totalDeadLettered: this.metrics.totalDeadLettered,
            totalCancelled: this.metrics.totalCancelled,
            workerId: this.workerId,
            workerRunning: this.workerRunning,
            scheduledJobsCount: this.scheduledJobs.size,
            persistenceStats
        };
    }

    /**
     * Get queue health and metrics
     * @returns {Object}
     */
    getHealth() {
        return {
            healthy: true,
            queueSize: this.queue.length,
            runningJobs: this.running.size,
            completedJobs: this.completed.length,
            deadLetterSize: this.deadLetter.length,
            runningByType: { ...this.runningByType },
            metrics: { ...this.metrics },
            registeredHandlers: [...this.handlers.keys()],
            workerId: this.workerId,
            workerRunning: this.workerRunning,
            scheduledJobsCount: this.scheduledJobs.size
        };
    }

    /**
     * Get jobs by status
     * @param {string} status - JOB_STATUS value
     * @param {number} [limit=50]
     * @returns {Object[]}
     */
    getJobsByStatus(status, limit = 50) {
        switch (status) {
            case JOB_STATUS.PENDING:
            case JOB_STATUS.SCHEDULED:
                return this.queue.filter(j => j.status === status).slice(0, limit);
            case JOB_STATUS.RUNNING:
                return [...this.running.values()].slice(0, limit);
            case JOB_STATUS.COMPLETED:
                return this.completed.filter(j => j.status === JOB_STATUS.COMPLETED).slice(-limit);
            case JOB_STATUS.FAILED:
            case JOB_STATUS.DEAD_LETTER:
                return this.deadLetter.filter(j => j.status === status).slice(0, limit);
            case JOB_STATUS.CANCELLED:
                return this.completed.filter(j => j.status === JOB_STATUS.CANCELLED).slice(0, limit);
            default:
                return [];
        }
    }

    /**
     * Get jobs by type for an organization
     * @param {string} orgId
     * @param {string} [type]
     * @returns {Object[]}
     */
    getJobsByOrg(orgId, type) {
        const all = [
            ...this.queue,
            ...[...this.running.values()],
            ...this.completed.slice(-100),
            ...this.deadLetter.slice(-50)
        ];

        return all.filter(j => {
            if (j.orgId !== orgId) return false;
            if (type && j.type !== type) return false;
            return true;
        });
    }

    /**
     * Retry a dead-lettered job
     * @param {string} jobId
     * @returns {Object|null} The re-enqueued job, or null if not found
     */
    retryDeadLetter(jobId) {
        const idx = this.deadLetter.findIndex(j => j.id === jobId);
        if (idx === -1) return null;

        const job = this.deadLetter.splice(idx, 1)[0];
        job.status = JOB_STATUS.PENDING;
        job.attempts = 0;
        job.error = null;
        job.result = null;
        job.startedAt = null;
        job.completedAt = null;

        this.queue.push(job);
        return { ...job };
    }

    /**
     * Purge completed jobs older than a given date
     * @param {string} beforeISO - ISO timestamp
     * @returns {number} Number of jobs purged
     */
    purgeCompleted(beforeISO) {
        const before = this.completed.length;
        this.completed = this.completed.filter(j => j.completedAt > beforeISO);
        return before - this.completed.length;
    }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a JobQueue with standard Finault job handlers registered
 * @param {Object} [handlers] - Map of jobType → handler function
 * @param {Object} [config] - Override default configuration
 * @returns {JobQueue}
 */
export function createJobQueue(handlers = {}, config = {}) {
    const queue = new JobQueue(config);

    for (const [type, handler] of Object.entries(handlers)) {
        queue.registerHandler(type, handler);
    }

    return queue;
}

// Export DistributedLockManager for use in tests and as a public API
export { DistributedLockManager };

export default {
    JobQueue,
    JobQueuePersistence,
    DistributedLockManager,
    createJobQueue,
    JOB_STATUS,
    JOB_PRIORITY,
    JOB_CONFIG,
    SCHEDULED_JOBS
};
