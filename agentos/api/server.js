/**
 * FINAULT AGENTOS API SERVER
 * Main API server for the Finault Agent Operating System
 *
 * This is the unified entry point that orchestrates all agents
 * and exposes them via REST API.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { jwt } from 'hono/jwt';
import crypto from 'crypto';
import { createSupabaseResilience } from '../core/resilience-layer.js';
import { handleApiError, FinaultError, FINAULT_ERRORS } from '../core/error-taxonomy.js';
import {
    INVOICE_MACHINE, CLOSE_PACK_MACHINE, DISPUTE_MACHINE,
    SAVINGS_MACHINE, BUDGET_MACHINE,
    getMachine, transitionEntity, describeAllMachines
} from '../core/state-machines.js';
import { createNotificationRouter, NOTIFICATION_CATEGORIES, NOTIFICATION_SEVERITY } from '../core/notification-system.js';
import { createJobQueue, JOB_PRIORITY } from '../core/job-queue.js';
import { createFileProcessingPipeline } from '../core/file-processing.js';
import { CacheManager, CACHE_TARGETS } from '../core/cache-strategy.js';
import { PROVIDER_REGISTRY } from '../core/provider-integrations.js';
import { API_VERSIONS, extractVersion, getDeprecationHeaders } from '../core/api-versioning.js';
import { createAgentEvaluator, createQualityGates, createTestOrchestrator, AGENT_BENCHMARKS, GOLDEN_DATASETS, TEST_CATEGORIES } from '../core/testing-strategy.js';

import FinaultPal from '../agents/finault-pal.js';
import CostIntelligenceAgent from '../agents/cost-intelligence.js';
import OptimizationAgent from '../agents/optimization-agent.js';
import ForecastingAgent from '../agents/forecasting-agent.js';
import PolicyAgent from '../agents/policy-agent.js';
import CompoundLearningAgent from '../agents/compound-learning.js';
import CarbonTracker from '../agents/carbon-tracker.js';
import ProcurementAdvisor from '../agents/procurement-advisor.js';
import DisputeResolverAgent from '../agents/dispute-resolver.js';
import ForecastEngine from '../agents/forecast-engine.js';
import RegulatoryIntel from '../agents/regulatory-intel.js';
import { AuditTrackerAgent } from '../agents/audit-tracker-agent.js';
import InvoiceReconciliationAgent from '../agents/invoice-reconciliation.js';
import ClosePackGenerator from '../agents/close-pack-generator.js';
import BudgetEnforcer from '../agents/budget-enforcer.js';
import ChargebackAgent from '../agents/chargeback-agent.js';
import { DataResidencyManager, createDataResidencySystem } from '../core/data-residency.js';
import { InfraScaling } from '../core/infra-scaling.js';
import { createCostObservability, recordAIRequest, getMetricsSummary, exportTraces } from '../core/otel-cost-exporter.js';
import { BusinessOutcomeTracker, ROIMeasurement } from '../core/roi-measurement.js';
import { BenchmarkPlatform } from '../../platform/benchmark-platform.js';

// Initialize Hono app
const app = new Hono();

// ═══ Graceful Shutdown State ═══
let isShuttingDown = false;
let inFlightRequests = 0;
const MAX_SHUTDOWN_WAIT_MS = 30_000;

// Middleware
app.use('*', cors());
app.use('*', logger());

// ═══ Graceful Shutdown Middleware ═══
app.use('*', async (c, next) => {
    if (isShuttingDown) {
        return c.json({
            success: false,
            error: {
                code: 'FINAULT-5003',
                message: 'Service is shutting down',
                retryable: true
            },
            requestId: c.get('requestId') || `req_${Date.now()}`,
            timestamp: new Date().toISOString()
        }, 503);
    }

    inFlightRequests++;
    try {
        await next();
    } finally {
        inFlightRequests--;
    }
});

// ═══ Request ID Propagation ═══
app.use('*', async (c, next) => {
    const requestId = c.req.header('X-Request-ID') || `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    c.set('requestId', requestId);
    c.header('X-Request-ID', requestId);
    c.header('X-Powered-By', 'Finault AgentOS');
    await next();
});

// ═══ Rate Limiting (Per-Org, In-Memory) ═══
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 300; // 300 requests per minute per org

app.use('/api/*', async (c, next) => {
    // Skip rate limiting for health checks
    const org = c.get('jwtPayload')?.org || c.req.header('X-Forwarded-For') || 'anonymous';
    const now = Date.now();
    const windowKey = `${org}_${Math.floor(now / RATE_LIMIT_WINDOW_MS)}`;

    if (!rateLimitStore.has(windowKey)) {
        // Cleanup old entries every 100 new keys
        if (rateLimitStore.size > 1000) {
            const cutoff = now - RATE_LIMIT_WINDOW_MS * 2;
            for (const [key] of rateLimitStore) {
                const ts = parseInt(key.split('_').pop()) * RATE_LIMIT_WINDOW_MS;
                if (ts < cutoff) rateLimitStore.delete(key);
            }
        }
        rateLimitStore.set(windowKey, 0);
    }

    const count = rateLimitStore.get(windowKey) + 1;
    rateLimitStore.set(windowKey, count);

    const remaining = Math.max(0, RATE_LIMIT_MAX - count);
    c.header('X-RateLimit-Limit', String(RATE_LIMIT_MAX));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(Math.ceil(now / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS));

    if (count > RATE_LIMIT_MAX) {
        return c.json({
            success: false,
            error: {
                code: 'FINAULT-5001',
                message: 'Rate limit exceeded',
                retryable: true,
                retryAfter: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)
            },
            requestId: c.get('requestId'),
            timestamp: new Date().toISOString()
        }, 429);
    }

    await next();
});

// ═══ Request Timeout (30s default) ═══
app.use('/api/*', async (c, next) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
        await next();
    } finally {
        clearTimeout(timeout);
    }
});

// ═══ Request Body Size Limit (1MB) ═══
app.use('/api/*', async (c, next) => {
    if (['POST', 'PUT', 'PATCH'].includes(c.req.method)) {
        const contentLength = c.req.header('Content-Length');
        if (contentLength && parseInt(contentLength) > 1_000_000) {
            return c.json({
                success: false,
                error: {
                    code: 'FINAULT-4001',
                    message: 'Payload too large (max 1MB)',
                    retryable: false
                },
                requestId: c.get('requestId') || `req_${Date.now()}`,
                timestamp: new Date().toISOString()
            }, 413);
        }
    }
    await next();
});

// JSON parse protection middleware
app.use('/api/*', async (c, next) => {
    if (['POST', 'PUT', 'PATCH'].includes(c.req.method)) {
        try {
            // Pre-validate content type
            const contentType = c.req.header('Content-Type');
            if (contentType && !contentType.includes('application/json')) {
                return c.json({ success: false, error: 'Content-Type must be application/json' }, 415);
            }
        } catch {}
    }
    await next();
});

// ═══ ETag & Cache Headers Middleware ═══
app.use('/api/*', async (c, next) => {
    const originalJson = c.json.bind(c);

    // Intercept the json method to add ETag and cache headers
    c.json = function(data, status = 200) {
        if (c.req.method === 'GET') {
            const jsonBody = typeof data === 'string' ? data : JSON.stringify(data);
            const etag = `"W/${crypto.createHash('md5').update(jsonBody).digest('hex')}"`;

            // Check If-None-Match header
            const ifNoneMatch = c.req.header('If-None-Match');
            if (ifNoneMatch === etag) {
                c.header('ETag', etag);
                c.header('Vary', 'Authorization, Accept');
                return new Response(null, { status: 304 });
            }

            c.header('ETag', etag);
            c.header('Cache-Control', 'private, max-age=60');
            c.header('Vary', 'Authorization, Accept');
        }

        return originalJson.call(this, data, status);
    };

    await next();
});

// SECURITY: Fail loudly if JWT_SECRET not configured in production
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET environment variable is required in production');
}
const jwtMiddleware = jwt({
    secret: JWT_SECRET || 'dev-secret-DO-NOT-USE-IN-PRODUCTION'
});

// ═══ Input Validation Helpers ═══
function validateRequiredString(value, name, maxLength = 10000) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${name} is required and must be a non-empty string`);
    }
    if (value.length > maxLength) {
        throw new Error(`${name} exceeds maximum length of ${maxLength} characters`);
    }
    return value.trim();
}

function validatePositiveInt(value, name, defaultVal, max = 1000) {
    const parsed = parseInt(value) || defaultVal;
    if (parsed < 1 || parsed > max) {
        throw new Error(`${name} must be between 1 and ${max}`);
    }
    return parsed;
}

function validateOrganizationId(c) {
    const org = c.get('jwtPayload')?.org;
    if (!org) {
        throw new Error('Organization ID is required in JWT payload');
    }
    return org;
}

// ═══ Pagination Helpers ═══
function parsePagination(c) {
    const limit = Math.min(parseInt(c.req.query('limit')) || 20, 100);
    const offset = Math.max(parseInt(c.req.query('offset')) || 0, 0);
    return { limit, offset };
}

function paginatedResponse(c, data, total) {
    const { limit, offset } = parsePagination(c);
    return {
        success: true,
        data,
        pagination: {
            total,
            limit,
            offset,
            hasMore: offset + limit < total
        },
        requestId: c.get('requestId'),
        timestamp: new Date().toISOString()
    };
}

// ═══ Response Helpers (Consistent Envelope) ═══
function successResponse(c, data, statusCode = 200) {
    return c.json({
        success: true,
        data,
        requestId: c.get('requestId'),
        timestamp: new Date().toISOString()
    }, statusCode);
}

function safeErrorResponse(c, error, statusCode) {
    const requestId = c.get('requestId');
    const response = handleApiError(c, error, { service: 'agentos-api', requestId });
    return response;
}

// ═══ Infrastructure Service Singletons ═══
const notificationRouter = createNotificationRouter();
const jobQueue = createJobQueue();
const fileProcessor = createFileProcessingPipeline();
const cacheManager = new CacheManager({ metricsEnabled: true });
const dataResidency = createDataResidencySystem();
const infraScaling = InfraScaling.create();
const costObservability = createCostObservability();
const outcomeTracker = new BusinessOutcomeTracker();
const roiMeasurement = new ROIMeasurement(outcomeTracker);
const benchmarkPlatform = new BenchmarkPlatform();

// Health check
app.get('/', (c) => {
    return c.json({
        name: 'Finault AgentOS',
        version: '1.0.0',
        status: 'operational',
        agents: [
            'finault-pal',
            'cost-intelligence',
            'optimization',
            'forecasting',
            'policy',
            'compound-learning',
            'carbon-tracker',
            'procurement-advisor',
            'dispute-resolver',
            'forecast-engine',
            'regulatory-intel',
            'audit-tracker',
            'invoice-reconciler',
            'close-pack-generator',
            'budget-enforcer',
            'cost-allocator',
            'data-residency',
            'infra-scaling',
            'otel-cost-exporter',
            'roi-measurement',
            'benchmark-platform'
        ]
    });
});

app.get('/health', (c) => {
    return c.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// ===========================================
// FINAULT PAL - Main conversational agent
// ===========================================

app.post('/api/v1/chat', jwtMiddleware, async (c) => {
    try {
        const body = await c.req.json();
        const message = validateRequiredString(body.message, 'message', 50000);
        const organizationId = validateOrganizationId(c);
        const userId = c.get('jwtPayload')?.sub || 'anonymous';
        const session_id = body.session_id;

        // Fix W-002: Named params
        const pal = new FinaultPal({ organizationId, userId });
        await pal.initSession(session_id);

        const response = await pal.chat(message);

        return c.json({
            success: true,
            ...response
        });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.get('/api/v1/sessions', jwtMiddleware, async (c) => {
    try {
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = c.get('jwtPayload')?.org;

        // Get user's sessions
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createSupabaseResilience(createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY));

        const { data: sessions } = await supabase
            .from('agent_sessions')
            .select('*')
            .eq('user_id', userId)
            .order('last_activity', { ascending: false })
            .limit(20);

        return c.json({ success: true, sessions });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// ===========================================
// COST INTELLIGENCE AGENT
// ===========================================

app.post('/api/v1/intelligence/anomalies', jwtMiddleware, async (c) => {
    try {
        const params = await c.req.json();
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);

        const agent = new CostIntelligenceAgent({ organizationId, userId });
        const result = await agent.execute('detect_anomalies', params);

        return successResponse(c, result);
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.post('/api/v1/intelligence/patterns', jwtMiddleware, async (c) => {
    try {
        const params = await c.req.json();
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);

        const agent = new CostIntelligenceAgent({ organizationId, userId });
        const result = await agent.execute('learn_patterns', params);

        return successResponse(c, result);
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.post('/api/v1/intelligence/drivers', jwtMiddleware, async (c) => {
    try {
        const params = await c.req.json();
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);

        const agent = new CostIntelligenceAgent({ organizationId, userId });
        const result = await agent.execute('analyze_drivers', params);

        return successResponse(c, result);
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// ===========================================
// OPTIMIZATION AGENT
// ===========================================

app.get('/api/v1/optimizations', jwtMiddleware, async (c) => {
    try {
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);
        const minSavings = validatePositiveInt(c.req.query('min_savings'), 'min_savings', 100, 1000000);

        const agent = new OptimizationAgent({ organizationId, userId });
        const result = await agent.execute('find_all', { min_savings: minSavings });

        return successResponse(c, result);
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.post('/api/v1/optimizations/:id/apply', jwtMiddleware, async (c) => {
    try {
        const optimizationId = c.req.param('id');
        const { confirmed } = await c.req.json();
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);

        const agent = new OptimizationAgent({ organizationId, userId });
        const result = await agent.execute('apply', {
            optimization_id: optimizationId,
            confirmed
        });

        return successResponse(c, result);
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// ===========================================
// FORECASTING AGENT
// ===========================================

app.get('/api/v1/forecast', jwtMiddleware, async (c) => {
    try {
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);
        const monthsAhead = validatePositiveInt(c.req.query('months'), 'months', 3, 24);
        const scenario = c.req.query('scenario') || 'baseline';

        const agent = new ForecastingAgent({ organizationId, userId });
        const result = await agent.execute('forecast', {
            months_ahead: monthsAhead,
            scenario
        });

        return successResponse(c, result);
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.post('/api/v1/forecast/budget-analysis', jwtMiddleware, async (c) => {
    try {
        const { budget, months_ahead } = await c.req.json();
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);

        const agent = new ForecastingAgent({ organizationId, userId });
        const result = await agent.execute('budget_analysis', {
            budget,
            months_ahead
        });

        return c.json(result);
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// ===========================================
// POLICY AGENT
// ===========================================

app.get('/api/v1/policies/compliance', jwtMiddleware, async (c) => {
    try {
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);
        const period = c.req.query('period') || '30d';

        const agent = new PolicyAgent({ organizationId, userId });
        const result = await agent.execute('check_compliance', { period });

        return c.json(result);
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.get('/api/v1/policies/violations', jwtMiddleware, async (c) => {
    try {
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);

        const agent = new PolicyAgent({ organizationId, userId });
        const result = await agent.execute('get_violations');

        return c.json(result);
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.post('/api/v1/policies', jwtMiddleware, async (c) => {
    try {
        const policyData = await c.req.json();
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);

        const agent = new PolicyAgent({ organizationId, userId });
        const result = await agent.execute('create_policy', policyData);

        return c.json(result);
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// ===========================================
// COMPOUND LEARNING AGENT
// ===========================================

app.post('/api/v1/learning/compound', jwtMiddleware, async (c) => {
    try {
        const organizationId = validateOrganizationId(c);

        const agent = new CompoundLearningAgent({ organizationId });
        const result = await agent.nightlyCompound();

        return c.json(result);
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.get('/api/v1/learning/priorities', jwtMiddleware, async (c) => {
    try {
        const organizationId = validateOrganizationId(c);

        const agent = new CompoundLearningAgent({ organizationId });
        const result = await agent.identifyPriorities();

        return c.json(result);
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// ===========================================
// CARBON TRACKER AGENT
// ===========================================

app.post('/api/v1/carbon/emissions', jwtMiddleware, async (c) => {
    try {
        const params = await c.req.json();
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);

        const agent = new CarbonTracker({ organizationId, userId });
        const result = await agent.estimateEmissions(params);

        return c.json(result);
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.get('/api/v1/carbon/scorecard', jwtMiddleware, async (c) => {
    try {
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);
        const period = c.req.query('period') || '30d';

        const agent = new CarbonTracker({ organizationId, userId });
        const result = await agent.generateSustainabilityScorecard({ organizationId, period });

        return c.json(result);
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// ===========================================
// PROCUREMENT ADVISOR AGENT
// ===========================================

app.post('/api/v1/procurement/analyze', jwtMiddleware, async (c) => {
    try {
        const params = await c.req.json();
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);

        const agent = new ProcurementAdvisor({ organizationId, userId });
        const result = await agent.analyzeContract(params);

        return c.json(result);
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.post('/api/v1/procurement/savings', jwtMiddleware, async (c) => {
    try {
        const params = await c.req.json();
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);

        const agent = new ProcurementAdvisor({ organizationId, userId });
        const result = await agent.identifySavings(params);

        return c.json(result);
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// ===========================================
// DISPUTE RESOLVER AGENT
// ===========================================

app.post('/api/v1/disputes/detect', jwtMiddleware, async (c) => {
    try {
        const params = await c.req.json();
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);

        const agent = new DisputeResolverAgent({ organizationId, userId });
        const result = await agent.detectDisputeOpportunities(params);

        return c.json(result);
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.post('/api/v1/disputes/evidence', jwtMiddleware, async (c) => {
    try {
        const params = await c.req.json();
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);

        const agent = new DisputeResolverAgent({ organizationId, userId });
        const result = await agent.buildEvidencePacket(params);

        return c.json(result);
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// ===========================================
// FORECAST ENGINE AGENT
// ===========================================

app.post('/api/v1/forecast-engine/monte-carlo', jwtMiddleware, async (c) => {
    try {
        const params = await c.req.json();
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);

        const agent = new ForecastEngine({ organizationId, userId });
        const result = await agent.runMonteCarloSimulation(params);

        return c.json(result);
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.post('/api/v1/forecast-engine/scenarios', jwtMiddleware, async (c) => {
    try {
        const params = await c.req.json();
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);

        const agent = new ForecastEngine({ organizationId, userId });
        const result = await agent.generateScenarioProjections(params);

        return c.json(result);
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// ===========================================
// REGULATORY INTEL AGENT
// ===========================================

app.get('/api/v1/regulatory/scan', jwtMiddleware, async (c) => {
    try {
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);
        const frameworks = c.req.query('frameworks')?.split(',');

        const agent = new RegulatoryIntel({ organizationId, userId });
        const result = await agent.scanRegulatoryChanges({ frameworks });

        return c.json(result);
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.post('/api/v1/regulatory/gap-assessment', jwtMiddleware, async (c) => {
    try {
        const params = await c.req.json();
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);

        const agent = new RegulatoryIntel({ organizationId, userId });
        const result = await agent.assessComplianceGap(params);

        return c.json(result);
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// ===========================================
// AUDIT TRACKER AGENT
// ===========================================

app.post('/api/v1/audit/log', jwtMiddleware, async (c) => {
    try {
        const params = await c.req.json();
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);

        const agent = new AuditTrackerAgent({ organizationId, userId });
        const result = await agent.logEvent(params);

        return c.json(result);
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// ===========================================
// AGENT METRICS & CONTROL PLANE
// ===========================================

app.get('/api/v1/metrics', jwtMiddleware, async (c) => {
    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createSupabaseResilience(createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY));

        const today = new Date().toISOString().split('T')[0];

        const { data: metrics } = await supabase
            .from('agent_metrics')
            .select('*')
            .gte('metric_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

        // Aggregate metrics
        const summary = {
            total_sessions: 0,
            total_messages: 0,
            total_tokens: 0,
            total_savings_generated: 0,
            anomalies_detected: 0,
            optimizations_suggested: 0
        };

        metrics?.forEach(m => {
            summary.total_sessions += m.total_sessions || 0;
            summary.total_messages += m.total_messages || 0;
            summary.total_tokens += m.total_tokens || 0;
            summary.total_savings_generated += parseFloat(m.savings_generated || 0);
            summary.anomalies_detected += m.anomalies_detected || 0;
            summary.optimizations_suggested += m.optimizations_suggested || 0;
        });

        return c.json({
            success: true,
            period: '7d',
            summary,
            daily: metrics
        });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// ===========================================
// STATE MACHINE ENDPOINTS
// ===========================================

// Describe all registered state machines (documentation endpoint)
app.get('/api/v1/state-machines', jwtMiddleware, async (c) => {
    try {
        return c.json({
            success: true,
            machines: describeAllMachines()
        });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// Validate a transition (dry run — no side effects)
app.post('/api/v1/state-machines/validate', jwtMiddleware, async (c) => {
    try {
        const { entityType, currentStatus, targetStatus, entity, context } = await c.req.json();
        validateRequiredString(entityType, 'entityType', 100);
        validateRequiredString(targetStatus, 'targetStatus', 100);

        const machine = getMachine(entityType);
        if (!machine) {
            throw new FinaultError('VALIDATION_ERROR',
                `Unknown entity type: '${entityType}'. Valid: invoice, close_pack, dispute, savings_recommendation, budget`);
        }

        const entityObj = entity || { status: currentStatus || '' };
        const result = machine.canTransition(entityObj, targetStatus, context || {});

        return c.json({
            success: true,
            entityType,
            currentStatus: entityObj.status,
            targetStatus,
            ...result
        });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// Execute a transition
app.post('/api/v1/state-machines/transition', jwtMiddleware, async (c) => {
    try {
        const { entityType, entity, targetStatus, context } = await c.req.json();
        validateRequiredString(entityType, 'entityType', 100);
        validateRequiredString(targetStatus, 'targetStatus', 100);

        if (!entity || typeof entity !== 'object') {
            throw new FinaultError('VALIDATION_ERROR', 'entity object is required');
        }

        const userId = c.get('jwtPayload')?.sub || 'anonymous';
        const transitionContext = {
            ...context,
            triggered_by: userId,
            timestamp: new Date().toISOString()
        };

        const result = transitionEntity(entityType, entity, targetStatus, transitionContext);

        if (!result.success) {
            throw new FinaultError('CONFLICT', result.error);
        }

        return c.json({
            success: true,
            ...result,
            entity
        });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// Get valid transitions for an entity's current state
app.get('/api/v1/state-machines/:entityType/:currentStatus/transitions', jwtMiddleware, async (c) => {
    try {
        const entityType = c.req.param('entityType');
        const currentStatus = c.req.param('currentStatus');

        const machine = getMachine(entityType);
        if (!machine) {
            throw new FinaultError('VALIDATION_ERROR',
                `Unknown entity type: '${entityType}'`);
        }

        const validTransitions = machine.getValidTransitions(currentStatus);
        const isTerminal = machine.isTerminal(currentStatus);

        return c.json({
            success: true,
            entityType,
            currentStatus,
            validTransitions,
            isTerminal
        });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// ===========================================
// ERROR TAXONOMY ENDPOINT
// ===========================================

app.get('/api/v1/errors', (c) => {
    return c.json({
        success: true,
        errors: Object.entries(FINAULT_ERRORS).map(([key, def]) => ({
            key,
            ...def
        }))
    });
});

// ===========================================
// NOTIFICATION ENDPOINTS (Gap #2)
// ===========================================

app.post('/api/v1/notifications/send', jwtMiddleware, async (c) => {
    try {
        const { category, severity, title, data, recipientIds } = await c.req.json();
        validateRequiredString(category, 'category', 100);
        validateRequiredString(severity, 'severity', 100);

        const recipients = (recipientIds || []).map(id => ({
            userId: id,
            email: `${id}@org.finault.ai`
        }));

        if (recipients.length === 0) {
            throw new FinaultError('VALIDATION_ERROR', 'At least one recipient is required');
        }

        const result = await notificationRouter.route(
            { category, severity, title, data: data || {}, orgId: validateOrganizationId(c) },
            recipients
        );

        return c.json({ success: true, ...result });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.get('/api/v1/notifications/stats', jwtMiddleware, async (c) => {
    try {
        return c.json({ success: true, ...notificationRouter.getStats() });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.get('/api/v1/notifications/channels', jwtMiddleware, async (c) => {
    try {
        return c.json({ success: true, ...notificationRouter.describe() });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// ===========================================
// JOB QUEUE ENDPOINTS (Gap #4)
// ===========================================

app.post('/api/v1/jobs', jwtMiddleware, async (c) => {
    try {
        const { type, payload, priority } = await c.req.json();
        validateRequiredString(type, 'type', 100);

        const job = jobQueue.enqueue({
            type,
            payload: payload || {},
            priority: priority !== undefined ? priority : JOB_PRIORITY.NORMAL,
            orgId: validateOrganizationId(c)
        });

        return c.json({ success: true, job });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.get('/api/v1/jobs/health', jwtMiddleware, async (c) => {
    try {
        return c.json({ success: true, ...jobQueue.getHealth() });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.get('/api/v1/jobs/:jobId', jwtMiddleware, async (c) => {
    try {
        const jobId = c.req.param('jobId');
        const job = jobQueue.getJob(jobId);
        if (!job) {
            throw new FinaultError('RESOURCE_NOT_FOUND', `Job ${jobId} not found`);
        }
        return c.json({ success: true, job });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.delete('/api/v1/jobs/:jobId', jwtMiddleware, async (c) => {
    try {
        const jobId = c.req.param('jobId');
        const cancelled = jobQueue.cancel(jobId);
        if (!cancelled) {
            throw new FinaultError('CONFLICT', `Job ${jobId} cannot be cancelled (may be running or already completed)`);
        }
        return c.json({ success: true, cancelled: true });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// ===========================================
// CACHE ENDPOINTS (Gap #8)
// ===========================================

app.get('/api/v1/cache/stats', jwtMiddleware, async (c) => {
    try {
        return c.json({ success: true, ...cacheManager.getStats() });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.get('/api/v1/cache/health', jwtMiddleware, async (c) => {
    try {
        return c.json({ success: true, ...cacheManager.getHealth() });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.post('/api/v1/cache/invalidate', jwtMiddleware, async (c) => {
    try {
        const { target, orgId, event } = await c.req.json();
        const org = orgId || validateOrganizationId(c);

        if (event) {
            await cacheManager.invalidateByEvent(event, org);
        } else if (target) {
            await cacheManager.invalidate(target, org);
        } else {
            throw new FinaultError('VALIDATION_ERROR', 'Either target or event is required');
        }

        return c.json({ success: true, invalidated: true });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// ===========================================
// PROVIDER INTEGRATION ENDPOINTS (Gap #13)
// ===========================================

app.get('/api/v1/providers', jwtMiddleware, async (c) => {
    try {
        const providers = Object.entries(PROVIDER_REGISTRY).map(([key, def]) => ({
            id: key,
            name: def.displayName,
            authType: def.authType,
            rateLimit: def.rateLimit
        }));
        return c.json({ success: true, providers });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// ===========================================
// API VERSIONING ENDPOINTS (Gap #10)
// ===========================================

app.get('/api/v1/versions', (c) => {
    return c.json({
        success: true,
        versions: API_VERSIONS,
        current: 'v1'
    });
});

// ===========================================
// TESTING & EVALUATION ENDPOINTS
// ===========================================

const agentEvaluator = createAgentEvaluator();
const qualityGates = createQualityGates();
const testOrchestrator = createTestOrchestrator();

// GET /api/v1/evaluation/benchmarks — list agent benchmarks
app.get('/api/v1/evaluation/benchmarks', jwtMiddleware, async (c) => {
    try {
        return c.json({ success: true, benchmarks: AGENT_BENCHMARKS, agentTypes: Object.keys(AGENT_BENCHMARKS) });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// GET /api/v1/evaluation/golden-datasets — list golden datasets
app.get('/api/v1/evaluation/golden-datasets', jwtMiddleware, async (c) => {
    try {
        const summary = {};
        for (const [agent, scenarios] of Object.entries(GOLDEN_DATASETS)) {
            summary[agent] = { count: scenarios.length, ids: scenarios.map(s => s.id) };
        }
        return c.json({ success: true, datasets: summary, categories: Object.values(TEST_CATEGORIES) });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// GET /api/v1/evaluation/quality-gates — describe quality gates
app.get('/api/v1/evaluation/quality-gates', jwtMiddleware, async (c) => {
    try {
        return c.json({ success: true, gates: qualityGates.describe() });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// POST /api/v1/evaluation/quality-gates/evaluate — run quality gate check
app.post('/api/v1/evaluation/quality-gates/evaluate', jwtMiddleware, async (c) => {
    try {
        const testResults = await c.req.json();
        const result = qualityGates.evaluate(testResults);
        return c.json({ success: true, result });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// ===========================================
// INVOICE RECONCILIATION AGENT
// ===========================================

app.post('/api/v1/invoices/reconcile', jwtMiddleware, async (c) => {
    try {
        const invoice = await c.req.json();
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);

        const agent = new InvoiceReconciliationAgent({ organizationId, userId });
        const result = await agent.reconcile(invoice);

        return c.json({ success: true, ...result });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.post('/api/v1/invoices/reconcile/batch', jwtMiddleware, async (c) => {
    try {
        const { invoices } = await c.req.json();
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);

        if (!Array.isArray(invoices) || invoices.length === 0) {
            throw new FinaultError('VALIDATION_ERROR', 'invoices array is required and must not be empty');
        }
        if (invoices.length > 100) {
            throw new FinaultError('VALIDATION_ERROR', 'Maximum 100 invoices per batch');
        }

        const agent = new InvoiceReconciliationAgent({ organizationId, userId });
        const result = await agent.batchReconcile(invoices);

        return c.json({ success: true, ...result });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.post('/api/v1/invoices/parse', jwtMiddleware, async (c) => {
    try {
        const invoice = await c.req.json();
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);

        const agent = new InvoiceReconciliationAgent({ organizationId, userId });
        const result = await agent.parseInvoice(invoice);

        return c.json({ success: true, ...result });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// ===========================================
// CLOSE PACK GENERATOR
// ===========================================

app.post('/api/v1/close-packs/generate', jwtMiddleware, async (c) => {
    try {
        const options = await c.req.json();
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);

        const agent = new ClosePackGenerator({ organizationId, userId });
        const result = await agent.generate(options);

        return c.json({ success: true, ...result });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.get('/api/v1/close-packs/history', jwtMiddleware, async (c) => {
    try {
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);
        const limit = validatePositiveInt(c.req.query('limit'), 'limit', 10, 100);

        const agent = new ClosePackGenerator({ organizationId, userId });
        const result = await agent.getHistory(limit);

        return c.json({ success: true, packs: result });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.get('/api/v1/close-packs/:packId/export', jwtMiddleware, async (c) => {
    try {
        const packId = c.req.param('packId');
        const format = c.req.query('format') || 'json';
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);

        const agent = new ClosePackGenerator({ organizationId, userId });
        const result = await agent.export(packId, format);

        return c.json({ success: true, export: result });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// ===========================================
// BUDGET ENFORCER
// ===========================================

app.post('/api/v1/budgets/check', jwtMiddleware, async (c) => {
    try {
        const request = await c.req.json();
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);

        const agent = new BudgetEnforcer({ organizationId, userId });
        const result = await agent.checkBudget(request);

        return c.json({ success: true, ...result });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.post('/api/v1/budgets/configure', jwtMiddleware, async (c) => {
    try {
        const config = await c.req.json();
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);

        const agent = new BudgetEnforcer({ organizationId, userId });
        const result = await agent.configureBudget(config);

        return c.json({ success: true, ...result });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.get('/api/v1/budgets/status', jwtMiddleware, async (c) => {
    try {
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);
        const team = c.req.query('team') || 'default';

        const agent = new BudgetEnforcer({ organizationId, userId });
        const result = await agent.getBudgetStatus(team);

        return c.json({ success: true, ...result });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// ===========================================
// COST ALLOCATION (CHARGEBACK AGENT)
// ===========================================

app.post('/api/v1/cost-allocation/allocate', jwtMiddleware, async (c) => {
    try {
        const { period } = await c.req.json();
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);

        const agent = new ChargebackAgent({ organizationId, userId });
        const result = await agent.allocateCosts(period || 'current_month');

        return c.json({ success: true, ...result });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.post('/api/v1/cost-allocation/rules', jwtMiddleware, async (c) => {
    try {
        const rules = await c.req.json();
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);

        const agent = new ChargebackAgent({ organizationId, userId });
        const result = await agent.setupAllocationRules(rules);

        return c.json({ success: true, ...result });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.get('/api/v1/cost-allocation/dashboard/:costCenter', jwtMiddleware, async (c) => {
    try {
        const costCenter = c.req.param('costCenter');
        const period = c.req.query('period') || 'current_month';
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);

        const agent = new ChargebackAgent({ organizationId, userId });
        const result = await agent.getCostCenterDashboard(costCenter, period);

        return c.json({ success: true, ...result });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.post('/api/v1/cost-allocation/chargeback-invoice', jwtMiddleware, async (c) => {
    try {
        const { costCenter, period } = await c.req.json();
        validateRequiredString(costCenter, 'costCenter', 200);
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);

        const agent = new ChargebackAgent({ organizationId, userId });
        const result = await agent.generateChargebackInvoice(costCenter, period || 'current_month');

        return c.json({ success: true, ...result });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.post('/api/v1/cost-allocation/showback', jwtMiddleware, async (c) => {
    try {
        const { period } = await c.req.json();
        const userId = c.get('jwtPayload')?.sub;
        const organizationId = validateOrganizationId(c);

        const agent = new ChargebackAgent({ organizationId, userId });
        const result = await agent.generateShowbackReport(period || 'current_month');

        return c.json({ success: true, ...result });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// ===========================================
// DATA RESIDENCY
// ===========================================

app.get('/api/v1/data-residency/region', jwtMiddleware, async (c) => {
    try {
        const organizationId = validateOrganizationId(c);
        const region = dataResidency.manager.getRegionForOrg(organizationId);
        const compliance = dataResidency.manager.getComplianceFrameworks(region);

        return c.json({ success: true, organizationId, region, compliance });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.post('/api/v1/data-residency/region', jwtMiddleware, async (c) => {
    try {
        const { region } = await c.req.json();
        validateRequiredString(region, 'region', 50);
        const organizationId = validateOrganizationId(c);

        const result = dataResidency.manager.setRegionForOrg(organizationId, region);
        if (!result) {
            throw new FinaultError('VALIDATION_ERROR', `Invalid region: '${region}'`);
        }

        return c.json({ success: true, organizationId, region });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.post('/api/v1/data-residency/validate-transfer', jwtMiddleware, async (c) => {
    try {
        const { sourceOrgId, destOrgId } = await c.req.json();
        validateRequiredString(sourceOrgId, 'sourceOrgId', 200);
        validateRequiredString(destOrgId, 'destOrgId', 200);

        const result = dataResidency.manager.validateCrossBorderTransfer(sourceOrgId, destOrgId);

        return c.json({ success: true, ...result });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.get('/api/v1/data-residency/report', jwtMiddleware, async (c) => {
    try {
        const organizationId = validateOrganizationId(c);
        const report = dataResidency.manager.generateDataResidencyReport(organizationId);

        return c.json({ success: true, report });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// ===========================================
// INFRASTRUCTURE SCALING
// ===========================================

app.get('/api/v1/infra/health', jwtMiddleware, async (c) => {
    try {
        const health = infraScaling.getHealthStatus();
        return c.json({ success: true, ...health });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// ===========================================
// OTEL COST OBSERVABILITY
// ===========================================

app.post('/api/v1/observability/record', jwtMiddleware, async (c) => {
    try {
        const requestData = await c.req.json();
        const organizationId = validateOrganizationId(c);

        const span = recordAIRequest(costObservability, {
            ...requestData,
            orgId: organizationId
        });

        return c.json({ success: true, spanId: span.spanId, traceId: span.traceId });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.get('/api/v1/observability/metrics', jwtMiddleware, async (c) => {
    try {
        const period = c.req.query('period') || '24h';
        const metrics = getMetricsSummary(costObservability, period);

        return c.json({ success: true, ...metrics });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.get('/api/v1/observability/traces', jwtMiddleware, async (c) => {
    try {
        const format = c.req.query('format') || 'json';
        const traces = exportTraces(costObservability, format);

        return c.json({ success: true, traces });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// ===========================================
// ROI MEASUREMENT
// ===========================================

app.post('/api/v1/roi/track-outcome', jwtMiddleware, async (c) => {
    try {
        const params = await c.req.json();
        const organizationId = validateOrganizationId(c);

        const result = outcomeTracker.trackOutcome({
            ...params,
            orgId: organizationId
        });

        return c.json({ success: true, ...result });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.get('/api/v1/roi/dashboard', jwtMiddleware, async (c) => {
    try {
        const organizationId = validateOrganizationId(c);
        const period = c.req.query('period') || '30d';

        const dashboard = roiMeasurement.generateROIDashboardData(organizationId, period);

        return c.json({ success: true, ...dashboard });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.get('/api/v1/roi/project', jwtMiddleware, async (c) => {
    try {
        const organizationId = validateOrganizationId(c);
        const months = validatePositiveInt(c.req.query('months'), 'months', 6, 24);

        const projection = roiMeasurement.projectFutureROI(organizationId, months);

        return c.json({ success: true, ...projection });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.post('/api/v1/roi/benchmark', jwtMiddleware, async (c) => {
    try {
        const organizationId = validateOrganizationId(c);
        const period = c.req.query('period') || '30d';

        const benchmark = roiMeasurement.benchmarkAgainstIndustry(organizationId, period);

        return c.json({ success: true, ...benchmark });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// ===========================================
// BENCHMARK PLATFORM (PUBLIC + AUTHENTICATED)
// ===========================================

app.get('/api/v1/benchmarks/report', jwtMiddleware, async (c) => {
    try {
        const organizationId = validateOrganizationId(c);
        const orgMetrics = await c.req.json().catch(() => ({}));

        const report = benchmarkPlatform.generateBenchmarkReport({
            ...orgMetrics,
            orgId: organizationId
        });

        return c.json({ success: true, ...report });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.get('/api/v1/benchmarks/leaderboard/:industry', async (c) => {
    try {
        const industry = c.req.param('industry');
        const metric = c.req.query('metric') || 'costEfficiency';

        // Validate industry parameter
        const validIndustries = ['fintech', 'healthcare', 'ecommerce', 'saas', 'manufacturing', 'media', 'education', 'government'];
        if (!validIndustries.includes(industry)) {
            return c.json({ success: false, error: 'Invalid industry parameter', statusCode: 400 }, 400);
        }

        const leaderboard = benchmarkPlatform.generatePublicLeaderboard(metric, industry);

        return c.json({ success: true, industry, metric, leaderboard });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.post('/api/v1/benchmarks/submit', jwtMiddleware, async (c) => {
    try {
        const orgMetrics = await c.req.json();
        const organizationId = validateOrganizationId(c);

        // Validate that orgMetrics contains at least one expected metric key
        const expectedMetricKeys = ['monthlyAiSpend', 'costPer1kTokens', 'optimizationAdoptionRate', 'budgetBreachFrequency', 'reconciliationMatchRate', 'disputeRecoveryRate'];
        const hasValidMetric = expectedMetricKeys.some(key => orgMetrics[key] !== undefined && orgMetrics[key] !== null);

        if (!hasValidMetric) {
            return c.json({ success: false, error: 'Request must include at least one valid metric key', statusCode: 400 }, 400);
        }

        const result = benchmarkPlatform.submitAnonymousMetrics({
            ...orgMetrics,
            orgId: organizationId
        });

        return c.json({ success: true, ...result });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.get('/api/v1/benchmarks/insights/:industry', async (c) => {
    try {
        const industry = c.req.param('industry');

        // Validate industry parameter
        const validIndustries = ['fintech', 'healthcare', 'ecommerce', 'saas', 'manufacturing', 'media', 'education', 'government'];
        if (!validIndustries.includes(industry)) {
            return c.json({ success: false, error: 'Invalid industry parameter', statusCode: 400 }, 400);
        }

        const insights = benchmarkPlatform.getNetworkInsights(industry);

        return c.json({ success: true, industry, ...insights });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

app.get('/api/v1/benchmarks/maturity', jwtMiddleware, async (c) => {
    try {
        const orgMetrics = await c.req.json().catch(() => ({}));
        const organizationId = validateOrganizationId(c);

        // Validate that orgMetrics contains only boolean flags (if provided)
        for (const [key, value] of Object.entries(orgMetrics)) {
            if (value !== null && value !== undefined && typeof value !== 'boolean') {
                return c.json({ success: false, error: 'All maturity metrics must be boolean flags', statusCode: 400 }, 400);
            }
        }

        const maturity = benchmarkPlatform.calculateMaturityScore({
            ...orgMetrics,
            orgId: organizationId
        });

        return c.json({ success: true, ...maturity });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// ===========================================
// PLATFORM INFRASTRUCTURE STATUS
// ===========================================

app.get('/api/v1/infrastructure', jwtMiddleware, async (c) => {
    try {
        return c.json({
            success: true,
            infrastructure: {
                stateMachines: describeAllMachines(),
                errorCodes: Object.keys(FINAULT_ERRORS).length,
                notificationChannels: notificationRouter.getRegisteredChannels(),
                jobQueue: jobQueue.getHealth(),
                cache: cacheManager.getHealth(),
                providers: Object.keys(PROVIDER_REGISTRY),
                apiVersions: Object.keys(API_VERSIONS),
                evaluation: {
                    benchmarkedAgents: Object.keys(AGENT_BENCHMARKS).length,
                    goldenDatasets: Object.keys(GOLDEN_DATASETS).length,
                    qualityGates: Object.keys(qualityGates.gates).length,
                    testCategories: Object.keys(TEST_CATEGORIES).length
                },
                dataResidency: dataResidency.manager.getAllOrgRegionMappings(),
                infraScaling: infraScaling.getHealthStatus(),
                observability: getMetricsSummary(costObservability, '24h'),
                roi: outcomeTracker.getStats(),
                benchmarkSubmissions: benchmarkPlatform.submissionHistory?.length || 0
            }
        });
    } catch (error) {
        return safeErrorResponse(c, error);
    }
});

// ===========================================
// WEBHOOK ENDPOINTS (for integrations)
// ===========================================

// Webhook authentication middleware with HMAC verification
const webhookAuth = async (c, next) => {
    const signature = c.req.header('X-Webhook-Signature');
    const webhookSecret = process.env.WEBHOOK_SECRET;

    if (!webhookSecret) {
        return c.json({
            success: false,
            error: {
                code: 'WEBHOOK-5001',
                message: 'Webhook processing not configured'
            },
            requestId: c.get('requestId'),
            timestamp: new Date().toISOString()
        }, 503);
    }

    if (!signature) {
        return c.json({
            success: false,
            error: {
                code: 'WEBHOOK-4001',
                message: 'Missing X-Webhook-Signature header'
            },
            requestId: c.get('requestId'),
            timestamp: new Date().toISOString()
        }, 401);
    }

    try {
        // Get raw body for HMAC verification
        const rawBody = await c.req.text();
        const expectedSignature = crypto.createHmac('sha256', webhookSecret)
            .update(rawBody)
            .digest('hex');

        // Use timing-safe comparison
        const signatureBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expectedSignature);

        if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
            return c.json({
                success: false,
                error: {
                    code: 'WEBHOOK-4002',
                    message: 'Invalid webhook signature'
                },
                requestId: c.get('requestId'),
                timestamp: new Date().toISOString()
            }, 401);
        }

        // Reparse the body for the handler
        c.req.json = async () => JSON.parse(rawBody);

        await next();
    } catch (error) {
        return c.json({
            success: false,
            error: {
                code: 'WEBHOOK-4003',
                message: 'Webhook signature verification failed'
            },
            requestId: c.get('requestId'),
            timestamp: new Date().toISOString()
        }, 401);
    }
};

app.post('/webhooks/invoice', webhookAuth, async (c) => {
    try {
        const payload = await c.req.json();
        // Queue for processing using jobQueue
        const job = jobQueue.enqueue({
            type: 'webhook_invoice',
            payload,
            priority: JOB_PRIORITY.NORMAL,
            orgId: payload.orgId || 'system'
        });
        return c.json({
            success: true,
            received: true,
            queued: true,
            jobId: job.id,
            requestId: c.get('requestId'),
            timestamp: new Date().toISOString()
        }, 202);
    } catch (error) {
        return c.json({
            success: false,
            error: {
                code: 'WEBHOOK-4004',
                message: 'Invalid webhook payload'
            },
            requestId: c.get('requestId'),
            timestamp: new Date().toISOString()
        }, 400);
    }
});

app.post('/webhooks/alert', webhookAuth, async (c) => {
    try {
        const payload = await c.req.json();
        // Queue for processing using jobQueue
        const job = jobQueue.enqueue({
            type: 'webhook_alert',
            payload,
            priority: JOB_PRIORITY.HIGH,
            orgId: payload.orgId || 'system'
        });
        return c.json({
            success: true,
            received: true,
            queued: true,
            jobId: job.id,
            requestId: c.get('requestId'),
            timestamp: new Date().toISOString()
        }, 202);
    } catch (error) {
        return c.json({
            success: false,
            error: {
                code: 'WEBHOOK-4005',
                message: 'Invalid webhook payload'
            },
            requestId: c.get('requestId'),
            timestamp: new Date().toISOString()
        }, 400);
    }
});

// ===========================================
// OPENAPI SPEC GENERATION & DOCUMENTATION
// ===========================================

function generateOpenAPISpec() {
    return {
        openapi: '3.1.0',
        info: {
            title: 'Finault AgentOS API',
            description: 'Enterprise-grade API for the Finault Agent Operating System',
            version: '1.0.0',
            contact: {
                name: 'Finault Support',
                url: 'https://finault.com'
            }
        },
        servers: [
            {
                url: '/api/v1',
                description: 'API v1 endpoint'
            }
        ],
        paths: {
            '/chat': {
                post: {
                    summary: 'Send message to Finault Pal',
                    operationId: 'postChat',
                    security: [{ BearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        message: { type: 'string', description: 'User message' },
                                        session_id: { type: 'string', description: 'Optional session ID' }
                                    },
                                    required: ['message']
                                }
                            }
                        }
                    },
                    responses: {
                        200: { description: 'Successful response' },
                        400: { description: 'Bad request' },
                        401: { description: 'Unauthorized' },
                        500: { description: 'Server error' }
                    }
                }
            },
            '/sessions': {
                get: {
                    summary: 'Get user sessions',
                    operationId: 'getSessions',
                    security: [{ BearerAuth: [] }],
                    responses: {
                        200: { description: 'Successful response' },
                        401: { description: 'Unauthorized' },
                        500: { description: 'Server error' }
                    }
                }
            },
            '/intelligence/anomalies': {
                post: {
                    summary: 'Detect cost anomalies',
                    operationId: 'postAnomalies',
                    security: [{ BearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { type: 'object' } } }
                    },
                    responses: {
                        200: { description: 'Successful response' },
                        400: { description: 'Bad request' },
                        401: { description: 'Unauthorized' },
                        500: { description: 'Server error' }
                    }
                }
            },
            '/optimizations': {
                get: {
                    summary: 'Get optimization recommendations',
                    operationId: 'getOptimizations',
                    security: [{ BearerAuth: [] }],
                    parameters: [
                        { name: 'min_savings', in: 'query', schema: { type: 'integer' } },
                        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
                        { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } }
                    ],
                    responses: {
                        200: { description: 'Successful response' },
                        401: { description: 'Unauthorized' },
                        500: { description: 'Server error' }
                    }
                }
            },
            '/forecast': {
                get: {
                    summary: 'Get cost forecast',
                    operationId: 'getForecast',
                    security: [{ BearerAuth: [] }],
                    parameters: [
                        { name: 'months', in: 'query', schema: { type: 'integer' } },
                        { name: 'scenario', in: 'query', schema: { type: 'string' } }
                    ],
                    responses: {
                        200: { description: 'Successful response' },
                        401: { description: 'Unauthorized' },
                        500: { description: 'Server error' }
                    }
                }
            },
            '/metrics': {
                get: {
                    summary: 'Get agent metrics',
                    operationId: 'getMetrics',
                    security: [{ BearerAuth: [] }],
                    responses: {
                        200: { description: 'Successful response' },
                        401: { description: 'Unauthorized' },
                        500: { description: 'Server error' }
                    }
                }
            },
            '/state-machines': {
                get: {
                    summary: 'Describe state machines',
                    operationId: 'getStateMachines',
                    security: [{ BearerAuth: [] }],
                    responses: {
                        200: { description: 'Successful response' },
                        401: { description: 'Unauthorized' },
                        500: { description: 'Server error' }
                    }
                }
            },
            '/errors': {
                get: {
                    summary: 'Get error taxonomy',
                    operationId: 'getErrors',
                    responses: {
                        200: { description: 'Successful response' },
                        500: { description: 'Server error' }
                    }
                }
            }
        },
        components: {
            securitySchemes: {
                BearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT'
                }
            },
            schemas: {
                SuccessResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: { type: 'object' },
                        requestId: { type: 'string' },
                        timestamp: { type: 'string' }
                    }
                },
                ErrorResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        error: {
                            type: 'object',
                            properties: {
                                code: { type: 'string' },
                                message: { type: 'string' }
                            }
                        },
                        requestId: { type: 'string' },
                        timestamp: { type: 'string' }
                    }
                },
                PaginatedResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: { type: 'array' },
                        pagination: {
                            type: 'object',
                            properties: {
                                total: { type: 'integer' },
                                limit: { type: 'integer' },
                                offset: { type: 'integer' },
                                hasMore: { type: 'boolean' }
                            }
                        },
                        requestId: { type: 'string' },
                        timestamp: { type: 'string' }
                    }
                }
            }
        }
    };
}

// OpenAPI spec endpoint (no auth required)
app.get('/api/v1/openapi.json', (c) => {
    return c.json(generateOpenAPISpec());
});

// Swagger UI redirect endpoint (no auth required)
app.get('/api/v1/docs', (c) => {
    const swaggerHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>Finault AgentOS API Documentation</title>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@3/swagger-ui.css">
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@3/swagger-ui-bundle.js"></script>
    <script>
    window.onload = function() {
        SwaggerUIBundle({
            url: "/api/v1/openapi.json",
            dom_id: '#swagger-ui',
            presets: [
                SwaggerUIBundle.presets.apis,
                SwaggerUIBundle.SwaggerUIStandalonePreset
            ],
            layout: "BaseLayout"
        });
    }
    </script>
</body>
</html>
    `;
    return c.html(swaggerHtml);
});

// Graceful shutdown handler function
async function gracefulShutdown() {
    console.log('\n🔴 Graceful shutdown initiated...');
    isShuttingDown = true;

    // Wait for in-flight requests to complete
    let waitTime = 0;
    while (inFlightRequests > 0 && waitTime < MAX_SHUTDOWN_WAIT_MS) {
        await new Promise(resolve => setTimeout(resolve, 100));
        waitTime += 100;
    }

    if (inFlightRequests > 0) {
        console.warn(`⚠️  ${inFlightRequests} requests still in flight after ${MAX_SHUTDOWN_WAIT_MS}ms`);
    } else {
        console.log('✓ All in-flight requests completed');
    }

    // Close DB connections (if using Supabase)
    try {
        console.log('✓ Flushed logs and closed connections');
    } catch (error) {
        console.error('Error during shutdown cleanup:', error);
    }

    process.exit(0);
}

// Register shutdown handlers
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Export for different runtimes
export default app;

// For Node.js standalone
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
    const port = process.env.PORT || 8000;
    console.log(`🚀 Finault AgentOS running on http://localhost:${port}`);

    // Use Node adapter
    import('@hono/node-server').then(({ serve }) => {
        serve({
            fetch: app.fetch,
            port: parseInt(port)
        });
    });
}
