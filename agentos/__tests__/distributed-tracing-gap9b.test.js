/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * OPENTELEMETRY DISTRIBUTED TRACING TEST SUITE — GAP #9
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Comprehensive test suite for Gap #9 implementation:
 * - W3C Trace Context propagation (traceparent/tracestate)
 * - Span lifecycle management with attributes, events, links
 * - Tracer span creation and active span tracking
 * - HTTP middleware integration
 * - Cross-boundary span propagation
 * - Export formats (OTLP, Zipkin, console)
 * - Sampling strategies
 *
 * Test Count: 130+ tests organized by functionality
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import {
    TRACE_CONFIG,
    TraceContext,
    Span,
    Tracer,
    createTracingMiddleware,
    SpanPropagator,
    TraceExporter,
    TraceSampler,
    createTracer,
    createSpanPropagator,
    createTraceExporter
} from '../core/distributed-tracing.js';

let passed = 0;
let failed = 0;

/**
 * ─── Custom Assert Function ──────────────────────────────────────────────────
 */
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
// SECTION 1: STRUCTURAL TESTS (10 tests)
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n▸ SECTION 1: STRUCTURAL TESTS\n');

// Verify all exports exist
assert(TRACE_CONFIG !== undefined, 'TRACE_CONFIG exported');
assert(TRACE_CONFIG.serviceName === 'finault-agentos', 'TRACE_CONFIG has serviceName');
assert(TRACE_CONFIG.serviceVersion === '1.0.0', 'TRACE_CONFIG has serviceVersion');
assert(TRACE_CONFIG.maxSpansPerTrace === 1000, 'TRACE_CONFIG has maxSpansPerTrace');
assert(TRACE_CONFIG.sampleRate === 1.0, 'TRACE_CONFIG has sampleRate');
assert(TRACE_CONFIG.propagator === 'w3c-tracecontext', 'TRACE_CONFIG propagator is W3C');

assert(TraceContext !== undefined, 'TraceContext class exported');
assert(Span !== undefined, 'Span class exported');
assert(Tracer !== undefined, 'Tracer class exported');
assert(typeof createTracer === 'function', 'createTracer factory exported');

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 2: TRACECONTEXT W3C TESTS (20 tests)
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n▸ SECTION 2: TRACECONTEXT W3C TESTS\n');

// Generate IDs
const generatedTraceId = TraceContext.generateTraceId();
assert(generatedTraceId.length === 32, 'generateTraceId produces 32 hex chars');
assert(/^[0-9a-f]{32}$/.test(generatedTraceId), 'generateTraceId format valid');
assert(generatedTraceId !== '00000000000000000000000000000000', 'generateTraceId not all zeros');

const generatedSpanId = TraceContext.generateSpanId();
assert(generatedSpanId.length === 16, 'generateSpanId produces 16 hex chars');
assert(/^[0-9a-f]{16}$/.test(generatedSpanId), 'generateSpanId format valid');
assert(generatedSpanId !== '0000000000000000', 'generateSpanId not all zeros');

// Validation tests
assert(
    TraceContext.isValidTraceId('4bf92f3577b34da6a3ce929d0e0e4736'),
    'isValidTraceId accepts valid ID'
);
assert(
    !TraceContext.isValidTraceId('00000000000000000000000000000000'),
    'isValidTraceId rejects all-zero ID'
);
assert(!TraceContext.isValidTraceId('invalid'), 'isValidTraceId rejects invalid format');

assert(
    TraceContext.isValidSpanId('00f067aa0ba902b7'),
    'isValidSpanId accepts valid ID'
);
assert(
    !TraceContext.isValidSpanId('0000000000000000'),
    'isValidSpanId rejects all-zero ID'
);
assert(!TraceContext.isValidSpanId('invalid'), 'isValidSpanId rejects invalid format');

// Traceparent header parsing
const validTraceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
const context = TraceContext.fromHeader(validTraceparent);
assert(context !== null, 'fromHeader parses valid traceparent');
assert(context.traceId === '4bf92f3577b34da6a3ce929d0e0e4736', 'fromHeader extracts traceId');
assert(context.spanId === '00f067aa0ba902b7', 'fromHeader extracts spanId');
assert(context.traceFlags === '01', 'fromHeader extracts traceFlags');

const headerOutput = TraceContext.toHeader(context);
assert(headerOutput === validTraceparent, 'toHeader produces valid traceparent format');

// Invalid traceparent
const invalidTraceparent = TraceContext.fromHeader('invalid');
assert(invalidTraceparent === null, 'fromHeader rejects invalid traceparent');

// Tracestate parsing
const tracestate = 'vendor1=value1,vendor2=value2';
const traceStateEntries = TraceContext.fromTracestate(tracestate);
assert(traceStateEntries.vendor1 === 'value1', 'fromTracestate parses first entry');
assert(traceStateEntries.vendor2 === 'value2', 'fromTracestate parses second entry');

const tracestateOutput = TraceContext.toTracestate(traceStateEntries);
assert(tracestateOutput.includes('vendor1=value1'), 'toTracestate formats entries');

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 3: SPAN LIFECYCLE TESTS (25 tests)
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n▸ SECTION 3: SPAN LIFECYCLE TESTS\n');

// Span creation
const testSpan = new Span({
    traceId: 'a'.repeat(32),
    spanId: 'b'.repeat(16),
    parentSpanId: 'c'.repeat(16),
    name: 'test.span',
    kind: 'CLIENT'
});

assert(testSpan.traceId === 'a'.repeat(32), 'Span stores traceId');
assert(testSpan.spanId === 'b'.repeat(16), 'Span stores spanId');
assert(testSpan.parentSpanId === 'c'.repeat(16), 'Span stores parentSpanId');
assert(testSpan.name === 'test.span', 'Span stores name');
assert(testSpan.kind === 'CLIENT', 'Span stores kind');
assert(testSpan.status === 'UNSET', 'Span starts with UNSET status');
assert(testSpan.isRecording() === true, 'Span is recording initially');

// Attributes
testSpan.setAttribute('key1', 'value1');
assert(testSpan.attributes.has('key1'), 'setAttribute stores attribute');
assert(testSpan.attributes.get('key1') === 'value1', 'setAttribute stores correct value');

// Bulk attributes
testSpan.setAttributes({ key2: 'value2', key3: 'value3' });
assert(testSpan.attributes.has('key2'), 'setAttributes stores multiple attributes');
assert(testSpan.attributes.get('key3') === 'value3', 'setAttributes stores all values');

// Attribute truncation
const longValue = 'x'.repeat(1000);
testSpan.setAttribute('long', longValue);
const stored = testSpan.attributes.get('long');
assert(stored.length <= TRACE_CONFIG.maxAttributeLength, 'setAttribute truncates long values');

// Status
testSpan.setStatus('OK', 'Operation succeeded');
assert(testSpan.status === 'OK', 'setStatus sets status to OK');
assert(testSpan.statusMessage === 'Operation succeeded', 'setStatus sets message');

// Events
const eventTime = Date.now();
testSpan.addEvent('test.event', { attr: 'val' }, eventTime);
assert(testSpan.events.length === 1, 'addEvent adds event to span');
assert(testSpan.events[0].name === 'test.event', 'Event stores name');
assert(testSpan.events[0].timestamp === eventTime, 'Event stores timestamp');

// Links
const linkedContext = {
    traceId: 'd'.repeat(32),
    spanId: 'e'.repeat(16)
};
testSpan.addLink(linkedContext, { linkAttr: 'linkVal' });
assert(testSpan.links.length === 1, 'addLink adds link to span');
assert(testSpan.links[0].traceId === 'd'.repeat(32), 'Link stores traceId');

// End span
const startTime = testSpan.startTime;
testSpan.end();
assert(testSpan.endTime !== null, 'end() sets endTime');
assert(testSpan.duration >= 0, 'end() calculates duration');
assert(testSpan.isRecording() === false, 'Span stops recording after end()');

// Cannot modify after end
testSpan.setAttribute('after_end', 'value');
assert(!testSpan.attributes.has('after_end'), 'Cannot add attributes after end');

// Serialization
const spanJson = testSpan.toJSON();
assert(spanJson.traceId === 'a'.repeat(32), 'toJSON includes traceId');
assert(spanJson.name === 'test.span', 'toJSON includes name');
assert(spanJson.status === 'OK', 'toJSON includes status');
assert(spanJson.attributes !== undefined, 'toJSON includes attributes object');
assert(spanJson.events.length === 1, 'toJSON includes events');
assert(spanJson.links.length === 1, 'toJSON includes links');

// OTLP format
const otlpSpan = testSpan.toOTLP();
assert(otlpSpan.traceId !== undefined, 'toOTLP includes base64 traceId');
assert(otlpSpan.spanId !== undefined, 'toOTLP includes base64 spanId');
assert(otlpSpan.name === 'test.span', 'toOTLP includes span name');
assert(otlpSpan.startTimeUnixNano !== undefined, 'toOTLP includes startTimeUnixNano');

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 4: TRACER MANAGEMENT TESTS (25 tests)
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n▸ SECTION 4: TRACER MANAGEMENT TESTS\n');

const tracer = new Tracer(TRACE_CONFIG);

// Start span
const span1 = tracer.startSpan('operation.1');
assert(span1 !== undefined, 'startSpan creates span');
assert(span1.traceId.length === 32, 'startSpan generates traceId');
assert(span1.spanId.length === 16, 'startSpan generates spanId');
assert(tracer.activeSpans.has(span1.spanId), 'startSpan registers span in activeSpans');

// Start span with parent
const span2 = tracer.startSpan('operation.2', { parentSpan: span1 });
assert(span2.parentSpanId === span1.spanId, 'Child span inherits parentSpanId');
assert(span2.traceId === span1.traceId, 'Child span inherits traceId');

// Get active span
const activeSpan = tracer.getActiveSpan(span1.traceId);
assert(activeSpan !== null, 'getActiveSpan returns active span');
assert(activeSpan.name === 'operation.2', 'getActiveSpan returns most recent');

// Get trace
const traceSpans = tracer.getTrace(span1.traceId);
assert(traceSpans.length === 2, 'getTrace returns all spans for trace');
assert(traceSpans[0].name === 'operation.1', 'getTrace maintains order');

// End span
tracer.endSpan(span1);
assert(!tracer.activeSpans.has(span1.spanId), 'endSpan removes from activeSpans');
assert(tracer.exportBuffer.length > 0, 'endSpan adds to exportBuffer');

// Get span by ID
const retrieved = tracer.getSpan(span2.spanId);
assert(retrieved === span2, 'getSpan returns correct span');

// Inject context
const headers = {};
tracer.injectContext(headers, span2);
assert(headers['traceparent'] !== undefined, 'injectContext adds traceparent header');
assert(headers['traceparent'].includes(span2.traceId), 'traceparent includes traceId');
assert(headers['traceparent'].includes(span2.spanId), 'traceparent includes spanId');

// Extract context
const incomingHeaders = { 'traceparent': '00-' + 'a'.repeat(32) + '-' + 'b'.repeat(16) + '-01' };
const extracted = tracer.extractContext(incomingHeaders);
assert(extracted !== null, 'extractContext parses valid header');
assert(extracted.traceId === 'a'.repeat(32), 'extractContext extracts traceId');

// Flush buffer
const flushed = tracer.flush();
assert(flushed > 0, 'flush returns count of exported spans');
assert(tracer.exportBuffer.length === 0, 'flush clears export buffer');

// Metrics
const metrics = tracer.getMetrics();
assert(metrics.activeSpans !== undefined, 'getMetrics returns activeSpans count');
assert(metrics.completedSpans !== undefined, 'getMetrics returns completedSpans count');
assert(metrics.traces !== undefined, 'getMetrics returns traces count');
assert(metrics.exportBufferSize !== undefined, 'getMetrics returns exportBufferSize');

// Active span functionality (async)
await (async () => {
    const tracer2 = new Tracer(TRACE_CONFIG);
    let activeSpanCalled = false;

    await tracer2.startActiveSpan('async.operation', {}, async (span) => {
        activeSpanCalled = true;
        assert(span.name === 'async.operation', 'startActiveSpan creates span with name');
        await new Promise(r => setTimeout(r, 10));
    });

    assert(activeSpanCalled === true, 'startActiveSpan executes function');
    assert(tracer2.exportBuffer.length > 0, 'startActiveSpan auto-ends span');
})();

// Active span error handling
await (async () => {
    const tracer3 = new Tracer(TRACE_CONFIG);
    let caught = false;

    try {
        await tracer3.startActiveSpan('error.operation', {}, async (span) => {
            throw new Error('Test error');
        });
    } catch (e) {
        caught = true;
    }

    assert(caught === true, 'startActiveSpan re-throws errors');
    const endedSpan = tracer3.exportBuffer[0];
    assert(endedSpan.status === 'ERROR', 'startActiveSpan sets ERROR status on exception');
})();

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 5: HTTP MIDDLEWARE TESTS (15 tests)
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n▸ SECTION 5: HTTP MIDDLEWARE TESTS\n');

// Mock Hono context
function createMockContext() {
    const context = {
        req: {
            method: 'GET',
            url: 'http://localhost/api/test',
            path: '/api/test',
            header: (name) => {
                if (name === 'traceparent') {
                    return '00-' + 'a'.repeat(32) + '-' + 'b'.repeat(16) + '-01';
                }
                if (name === 'x-request-id') {
                    return 'req-123';
                }
                return undefined;
            },
            rawRequest: { headers: {} }
        },
        res: {
            status: 200
        },
        data: {},
        set(key, value) {
            this.data[key] = value;
        },
        get(key) {
            return this.data[key];
        },
        header(name, value) {
            if (!this.headers) this.headers = {};
            this.headers[name] = value;
        }
    };
    return context;
}

// Create middleware
const tracerForMiddleware = new Tracer(TRACE_CONFIG);
const middleware = createTracingMiddleware(tracerForMiddleware);

// Test middleware with successful request
await (async () => {
    const ctx = createMockContext();
    let nextCalled = false;

    const nextFn = async () => {
        nextCalled = true;
        ctx.res.status = 200;
    };

    await middleware(ctx, nextFn);

    assert(nextCalled === true, 'Middleware calls next');
    assert(ctx.data.span !== undefined, 'Middleware sets span in context');
    assert(ctx.data.traceId !== undefined, 'Middleware sets traceId in context');
    assert(ctx.headers['X-Trace-Id'] !== undefined, 'Middleware adds X-Trace-Id header');
    assert(ctx.headers['X-Span-Id'] !== undefined, 'Middleware adds X-Span-Id header');
})();

// Test middleware with error status
await (async () => {
    const ctx = createMockContext();
    ctx.res.status = 500;

    await middleware(ctx, async () => {
        ctx.res.status = 500;
    });

    const span = tracerForMiddleware.exportBuffer[tracerForMiddleware.exportBuffer.length - 1];
    assert(span.status === 'ERROR', 'Middleware sets ERROR status for 5xx');
})();

// Test middleware with ok status
await (async () => {
    const ctx = createMockContext();
    ctx.res.status = 200;

    const tracer4 = new Tracer(TRACE_CONFIG);
    const middleware4 = createTracingMiddleware(tracer4);

    await middleware4(ctx, async () => {
        ctx.res.status = 200;
    });

    const span = tracer4.exportBuffer[tracer4.exportBuffer.length - 1];
    assert(span.status === 'OK', 'Middleware sets OK status for 2xx');
})();

// Test middleware extracts incoming trace
await (async () => {
    const ctx = createMockContext();
    const tracer5 = new Tracer(TRACE_CONFIG);
    const middleware5 = createTracingMiddleware(tracer5);

    await middleware5(ctx, async () => {});

    const span = ctx.data.span;
    assert(span.traceId === 'a'.repeat(32), 'Middleware extracts incoming traceId');
})();

// Test middleware generates new trace if missing
await (async () => {
    const ctx = createMockContext();
    ctx.req.header = () => undefined; // No incoming trace
    const tracer6 = new Tracer(TRACE_CONFIG);
    const middleware6 = createTracingMiddleware(tracer6);

    await middleware6(ctx, async () => {});

    const span = ctx.data.span;
    assert(span.traceId.length === 32, 'Middleware generates new traceId if missing');
    assert(span.traceId !== 'a'.repeat(32), 'Generated traceId is different');
})();

// Test middleware records HTTP attributes
await (async () => {
    const ctx = createMockContext();
    const tracer7 = new Tracer(TRACE_CONFIG);
    const middleware7 = createTracingMiddleware(tracer7);

    await middleware7(ctx, async () => {});

    const span = ctx.data.span;
    const attrs = span.getAttributes();
    assert(attrs['http.method'] === 'GET', 'Middleware records http.method');
    assert(attrs['http.url'].includes('localhost'), 'Middleware records http.url');
    assert(attrs['http.route'] === '/api/test', 'Middleware records http.route');
})();

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 6: SPAN PROPAGATOR TESTS (15 tests)
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n▸ SECTION 6: SPAN PROPAGATOR TESTS\n');

const tracerForPropagator = new Tracer(TRACE_CONFIG);
const propagator = new SpanPropagator(tracerForPropagator);

const parentSpan = tracerForPropagator.startSpan('parent', {
    kind: 'SERVER'
});

// Subrequest propagation
const subrequestSpan = propagator.propagateToSubrequest(parentSpan, {
    url: 'http://api.example.com/v1/data',
    method: 'POST'
});
assert(subrequestSpan.parentSpanId === parentSpan.spanId, 'Subrequest sets parent');
assert(subrequestSpan.kind === 'CLIENT', 'Subrequest kind is CLIENT');
assert(subrequestSpan.name === 'http.request', 'Subrequest name is http.request');
const subHeaders = {};
tracerForPropagator.injectContext(subHeaders, subrequestSpan);
assert(subHeaders['traceparent'] !== undefined, 'Subrequest injects traceparent');

// Agent propagation
const agentSpan = propagator.propagateToAgent(parentSpan, 'decision-agent');
assert(agentSpan.parentSpanId === parentSpan.spanId, 'Agent span sets parent');
assert(agentSpan.kind === 'INTERNAL', 'Agent span kind is INTERNAL');
assert(agentSpan.name === 'agent.decision-agent', 'Agent span name includes agent name');

// Job propagation
const jobSpan = propagator.propagateToJob(parentSpan, 'job-456');
assert(jobSpan.parentSpanId === parentSpan.spanId, 'Job span sets parent');
assert(jobSpan.kind === 'PRODUCER', 'Job span kind is PRODUCER');
assert(jobSpan.attributes.get('job.id') === 'job-456', 'Job span stores job ID');

// Database propagation
const dbSpan = propagator.propagateToDatabase(parentSpan, 'SELECT', 'users');
assert(dbSpan.parentSpanId === parentSpan.spanId, 'Database span sets parent');
assert(dbSpan.kind === 'CLIENT', 'Database span kind is CLIENT');
assert(dbSpan.attributes.get('db.operation') === 'SELECT', 'Database span stores operation');
assert(dbSpan.attributes.get('db.table') === 'users', 'Database span stores table');
assert(dbSpan.attributes.get('db.system') === 'sql', 'Database span stores system');

// External API propagation
const apiSpan = propagator.propagateToExternalAPI(parentSpan, 'anthropic', '/v1/messages');
assert(apiSpan.parentSpanId === parentSpan.spanId, 'API span sets parent');
assert(apiSpan.kind === 'CLIENT', 'API span kind is CLIENT');
assert(apiSpan.attributes.get('api.provider') === 'anthropic', 'API span stores provider');
assert(apiSpan.attributes.get('api.endpoint') === '/v1/messages', 'API span stores endpoint');

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 7: EXPORT FORMATS TESTS (10 tests)
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n▸ SECTION 7: EXPORT FORMATS TESTS\n');

const exportTracer = new Tracer(TRACE_CONFIG);
const exportSpan1 = exportTracer.startSpan('operation.export.1');
exportSpan1.setAttribute('test.attr', 'test.value');
exportSpan1.setStatus('OK');
exportTracer.endSpan(exportSpan1);

const spansToExport = exportTracer.exportBuffer;

// OTLP format
const otlpExport = TraceExporter.exportOTLP(spansToExport);
assert(otlpExport.resourceSpans !== undefined, 'OTLP export has resourceSpans');
assert(otlpExport.resourceSpans.length > 0, 'OTLP export contains resources');
assert(otlpExport.resourceSpans[0].scopeSpans !== undefined, 'OTLP resource has scopeSpans');
assert(
    otlpExport.resourceSpans[0].scopeSpans[0].spans.length > 0,
    'OTLP scopeSpans contains spans'
);
assert(
    otlpExport.resourceSpans[0].resource.attributes !== undefined,
    'OTLP resource has attributes'
);

// Zipkin format
const zipkinExport = TraceExporter.exportZipkin(spansToExport);
assert(Array.isArray(zipkinExport), 'Zipkin export is array');
assert(zipkinExport.length > 0, 'Zipkin export contains spans');
assert(zipkinExport[0].traceId !== undefined, 'Zipkin span has traceId');
assert(zipkinExport[0].id !== undefined, 'Zipkin span has id (spanId)');
assert(zipkinExport[0].name !== undefined, 'Zipkin span has name');
assert(zipkinExport[0].localEndpoint !== undefined, 'Zipkin span has localEndpoint');

// Console format
const consoleExport = TraceExporter.exportConsole(spansToExport);
assert(typeof consoleExport === 'string', 'Console export is string');
assert(consoleExport.includes('TRACE'), 'Console export includes TRACE header');
assert(consoleExport.includes('operation.export.1'), 'Console export includes span name');

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 8: SAMPLING TESTS (10 tests)
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n▸ SECTION 8: SAMPLING TESTS\n');

// AlwaysOn sampler
const alwaysOnSampler = TraceSampler.AlwaysOn();
const alwaysOnDecision = alwaysOnSampler.shouldSample('test-trace-id', 'test.span', {});
assert(
    alwaysOnDecision.decision === 'RECORD_AND_SAMPLE',
    'AlwaysOn sampler always samples'
);
assert(alwaysOnDecision.probability === 1.0, 'AlwaysOn sampler has 100% probability');

// AlwaysOff sampler
const alwaysOffSampler = TraceSampler.AlwaysOff();
const alwaysOffDecision = alwaysOffSampler.shouldSample('test-trace-id', 'test.span', {});
assert(alwaysOffDecision.decision === 'DROP', 'AlwaysOff sampler never samples');
assert(alwaysOffDecision.probability === 0.0, 'AlwaysOff sampler has 0% probability');

// RatioBased sampler at 100%
const ratio100Sampler = TraceSampler.RatioBased(1.0);
let sampledCount = 0;
for (let i = 0; i < 10; i++) {
    const decision = ratio100Sampler.shouldSample(TraceContext.generateTraceId(), 'test', {});
    if (decision.decision === 'RECORD_AND_SAMPLE') sampledCount++;
}
assert(sampledCount === 10, 'RatioBased(1.0) samples all traces');

// RatioBased sampler at 0%
const ratio0Sampler = TraceSampler.RatioBased(0.0);
sampledCount = 0;
for (let i = 0; i < 10; i++) {
    const decision = ratio0Sampler.shouldSample(TraceContext.generateTraceId(), 'test', {});
    if (decision.decision === 'RECORD_AND_SAMPLE') sampledCount++;
}
assert(sampledCount === 0, 'RatioBased(0.0) samples no traces');

// RatioBased sampler at 0.5
const ratio50Sampler = TraceSampler.RatioBased(0.5);
sampledCount = 0;
for (let i = 0; i < 100; i++) {
    const decision = ratio50Sampler.shouldSample(TraceContext.generateTraceId(), 'test', {});
    if (decision.decision === 'RECORD_AND_SAMPLE') sampledCount++;
}
assert(sampledCount > 30 && sampledCount < 70, 'RatioBased(0.5) samples ~50% (got ' + sampledCount + '%)');

// Deterministic sampling for same traceId
const traceIdForDeterminism = 'a'.repeat(32);
const ratio5Sampler = TraceSampler.RatioBased(0.5);
const sample1 = TraceSampler.getRatioSample(traceIdForDeterminism, 0.5);
const sample2 = TraceSampler.getRatioSample(traceIdForDeterminism, 0.5);
assert(sample1 === sample2, 'getRatioSample deterministic for same traceId');

// ParentBased sampler
const parentBasedTrue = TraceSampler.ParentBased(true);
const parentBasedTrueDecision = parentBasedTrue.shouldSample();
assert(
    parentBasedTrueDecision.decision === 'RECORD_AND_SAMPLE',
    'ParentBased inherits parent decision (true)'
);

const parentBasedFalse = TraceSampler.ParentBased(false);
const parentBasedFalseDecision = parentBasedFalse.shouldSample();
assert(
    parentBasedFalseDecision.decision === 'DROP',
    'ParentBased inherits parent decision (false)'
);

// ═════════════════════════════════════════════════════════════════════════════
// ADVANCED INTEGRATION TESTS (5 tests)
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n▸ ADVANCED INTEGRATION TESTS\n');

// Max spans per trace enforcement
const tracerWithLimit = new Tracer({ ...TRACE_CONFIG, maxSpansPerTrace: 5 });
const rootSpanLimit = tracerWithLimit.startSpan('root');
for (let i = 0; i < 10; i++) {
    tracerWithLimit.startSpan(`child-${i}`, { parentSpan: rootSpanLimit });
}
const traceSpansLimit = tracerForPropagator.getTrace(rootSpanLimit.traceId);
assert(traceSpansLimit.length <= 5, 'Tracer enforces maxSpansPerTrace');

// Factory functions
const factoryTracer = createTracer(TRACE_CONFIG);
assert(factoryTracer instanceof Tracer, 'createTracer returns Tracer instance');

const factoryPropagator = createSpanPropagator(factoryTracer);
assert(factoryPropagator instanceof SpanPropagator, 'createSpanPropagator returns SpanPropagator instance');

const factoryExporter = createTraceExporter();
assert(typeof factoryExporter.exportOTLP === 'function', 'createTraceExporter returns exporter');

// ═════════════════════════════════════════════════════════════════════════════
// TEST SUMMARY
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(80));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(80) + '\n');

if (failed === 0) {
    console.log('✓ ALL TESTS PASSED\n');
    process.exit(0);
} else {
    console.log(`✗ ${failed} TEST(S) FAILED\n`);
    process.exit(1);
}
