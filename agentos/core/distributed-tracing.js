/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * OPENTELEMETRY DISTRIBUTED TRACING WITH W3C TRACE CONTEXT PROPAGATION
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * OpenTelemetry-native distributed tracing module with W3C Trace Context
 * (traceparent/tracestate) propagation for AgentOS platform.
 *
 * FEATURES:
 * - TraceContext: W3C Trace Context standard implementation
 * - Span: Lifecycle management with attributes, events, links
 * - Tracer: Span creation, management, and active span tracking
 * - TracingMiddleware: Hono-compatible HTTP tracing integration
 * - SpanPropagator: Cross-boundary span creation (subrequests, agents, jobs, DB, APIs)
 * - TraceExporter: Multiple export formats (OTLP, Zipkin, console)
 * - TraceSampler: Sampling strategies (AlwaysOn, AlwaysOff, RatioBased, ParentBased)
 *
 * STANDARDS:
 * - W3C Trace Context: https://www.w3.org/TR/trace-context/
 * - OpenTelemetry: https://opentelemetry.io/
 * - OTLP Protocol: https://opentelemetry.io/docs/specs/otel/protocol/
 */

import { createFetchResilience } from './resilience-layer.js';

/**
 * Global trace configuration
 * Controls sampling, export behavior, and span limits
 */
export const TRACE_CONFIG = {
    serviceName: 'finault-agentos',
    serviceVersion: '1.0.0',
    maxSpansPerTrace: 1000,
    maxAttributeLength: 256,
    sampleRate: 1.0, // 100% in dev, 10% in prod
    exportBatchSize: 100,
    exportIntervalMs: 5000,
    propagator: 'w3c-tracecontext', // W3C Trace Context standard
    idGenerator: 'random', // random 128-bit trace IDs
};

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * TRACECONTEXT: W3C Trace Context Implementation
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Implements W3C Trace Context standard (https://www.w3.org/TR/trace-context/)
 * for propagation of trace information across service boundaries.
 *
 * Format: 00-{traceId}-{spanId}-{flags}
 * Example: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
 */
export class TraceContext {
    constructor(traceId, spanId, traceFlags = '01') {
        this.traceId = traceId;
        this.spanId = spanId;
        this.traceFlags = traceFlags;
    }

    /**
     * Generate new TraceContext with random IDs
     */
    static generate() {
        return new TraceContext(
            TraceContext.generateTraceId(),
            TraceContext.generateSpanId(),
            '01'
        );
    }

    /**
     * Parse traceparent header: 00-{traceId}-{spanId}-{flags}
     */
    static fromHeader(traceparent) {
        if (!traceparent) return null;

        const parts = traceparent.split('-');
        if (parts.length !== 4 || parts[0] !== '00') {
            return null;
        }

        const [version, traceId, spanId, flags] = parts;

        if (!TraceContext.isValidTraceId(traceId) || !TraceContext.isValidSpanId(spanId)) {
            return null;
        }

        return new TraceContext(traceId, spanId, flags);
    }

    /**
     * Format as traceparent header: 00-{traceId}-{spanId}-{flags}
     */
    static toHeader(context) {
        if (!context) return null;
        return `00-${context.traceId}-${context.spanId}-${context.traceFlags}`;
    }

    /**
     * Parse tracestate header: key1=value1,key2=value2,...
     */
    static fromTracestate(tracestate) {
        if (!tracestate) return {};

        const entries = {};
        tracestate.split(',').forEach(pair => {
            const [key, value] = pair.split('=');
            if (key && value) {
                entries[key.trim()] = value.trim();
            }
        });
        return entries;
    }

    /**
     * Format tracestate header from entries object
     */
    static toTracestate(entries) {
        if (!entries || Object.keys(entries).length === 0) return null;

        return Object.entries(entries)
            .map(([key, value]) => `${key}=${value}`)
            .join(',');
    }

    /**
     * Generate random 128-bit trace ID (32 hex chars)
     */
    static generateTraceId() {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        return Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    /**
     * Generate random 64-bit span ID (16 hex chars)
     */
    static generateSpanId() {
        const bytes = new Uint8Array(8);
        crypto.getRandomValues(bytes);
        return Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    /**
     * Validate trace ID format (32 hex chars, not all zeros)
     */
    static isValidTraceId(traceId) {
        if (!traceId || traceId.length !== 32) return false;
        if (!/^[0-9a-f]{32}$/.test(traceId)) return false;
        if (traceId === '00000000000000000000000000000000') return false;
        return true;
    }

    /**
     * Validate span ID format (16 hex chars, not all zeros)
     */
    static isValidSpanId(spanId) {
        if (!spanId || spanId.length !== 16) return false;
        if (!/^[0-9a-f]{16}$/.test(spanId)) return false;
        if (spanId === '0000000000000000') return false;
        return true;
    }
}

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * SPAN: Individual trace operation
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Represents a single operation within a trace with lifecycle management,
 * attributes, events, and status tracking.
 */
export class Span {
    constructor(config = {}) {
        this._recording = true; // Initialize recording state first
        this.traceId = config.traceId;
        this.spanId = config.spanId;
        this.parentSpanId = config.parentSpanId || null;
        this.name = config.name;
        this.kind = config.kind || 'INTERNAL'; // SERVER, CLIENT, INTERNAL, PRODUCER, CONSUMER
        this.startTime = config.startTime || Date.now();
        this.endTime = null;
        this.duration = null;
        this.status = 'UNSET'; // UNSET, OK, ERROR
        this.statusMessage = '';

        // Attributes (key-value pairs)
        this.attributes = new Map();
        if (config.attributes && typeof config.attributes === 'object') {
            Object.entries(config.attributes).forEach(([key, value]) => {
                this.setAttribute(key, value);
            });
        }

        // Events (timestamped log entries)
        this.events = [];

        // Links to other spans
        this.links = [];
    }

    /**
     * Set span status
     */
    setStatus(code, message = '') {
        if (this._recording) {
            this.status = code; // 'OK', 'ERROR', 'UNSET'
            this.statusMessage = message;
        }
        return this;
    }

    /**
     * Set single attribute (truncated to maxAttributeLength)
     */
    setAttribute(key, value) {
        if (!this._recording) return this;

        let stringValue = String(value);
        if (stringValue.length > TRACE_CONFIG.maxAttributeLength) {
            stringValue = stringValue.substring(0, TRACE_CONFIG.maxAttributeLength);
        }

        this.attributes.set(key, stringValue);
        return this;
    }

    /**
     * Set multiple attributes at once
     */
    setAttributes(attrs) {
        if (!this._recording || !attrs) return this;

        Object.entries(attrs).forEach(([key, value]) => {
            this.setAttribute(key, value);
        });
        return this;
    }

    /**
     * Add event with optional timestamp and attributes
     */
    addEvent(name, attributes = {}, timestamp = Date.now()) {
        if (!this._recording) return this;

        this.events.push({
            name,
            timestamp,
            attributes: attributes || {}
        });
        return this;
    }

    /**
     * Add link to another span
     */
    addLink(context, attributes = {}) {
        if (!this._recording) return this;

        this.links.push({
            traceId: context.traceId,
            spanId: context.spanId,
            attributes: attributes || {}
        });
        return this;
    }

    /**
     * End span and calculate duration
     */
    end(endTime = Date.now()) {
        if (!this._recording) return this;

        this.endTime = endTime;
        this.duration = this.endTime - this.startTime;
        this._recording = false;
        return this;
    }

    /**
     * Check if span is still recording
     */
    isRecording() {
        return this._recording;
    }

    /**
     * Get attributes as plain object
     */
    getAttributes() {
        const attrs = {};
        this.attributes.forEach((value, key) => {
            attrs[key] = value;
        });
        return attrs;
    }

    /**
     * Serialize span to JSON
     */
    toJSON() {
        return {
            traceId: this.traceId,
            spanId: this.spanId,
            parentSpanId: this.parentSpanId,
            name: this.name,
            kind: this.kind,
            status: this.status,
            statusMessage: this.statusMessage,
            startTime: this.startTime,
            endTime: this.endTime,
            duration: this.duration,
            attributes: this.getAttributes(),
            events: this.events,
            links: this.links
        };
    }

    /**
     * Format as OTLP-compatible span
     */
    toOTLP() {
        const otlpSpan = {
            traceId: Buffer.from(this.traceId, 'hex').toString('base64'),
            spanId: Buffer.from(this.spanId, 'hex').toString('base64'),
            parentSpanId: this.parentSpanId
                ? Buffer.from(this.parentSpanId, 'hex').toString('base64')
                : undefined,
            name: this.name,
            kind: this.kindToOTLPKind(),
            startTimeUnixNano: String(this.startTime * 1000000),
            endTimeUnixNano: this.endTime ? String(this.endTime * 1000000) : undefined,
            attributes: this.attributesToOTLPFormat(),
            events: this.eventsToOTLPFormat(),
            links: this.linksToOTLPFormat(),
            status: {
                code: this.statusToOTLPCode(),
                message: this.statusMessage
            }
        };

        return otlpSpan;
    }

    /**
     * Convert span kind to OTLP kind value
     */
    kindToOTLPKind() {
        const kindMap = {
            'SERVER': 1,
            'CLIENT': 2,
            'INTERNAL': 3,
            'PRODUCER': 4,
            'CONSUMER': 5
        };
        return kindMap[this.kind] || 0;
    }

    /**
     * Convert status to OTLP status code
     */
    statusToOTLPCode() {
        const codeMap = {
            'UNSET': 0,
            'OK': 1,
            'ERROR': 2
        };
        return codeMap[this.status] || 0;
    }

    /**
     * Convert attributes to OTLP format
     */
    attributesToOTLPFormat() {
        const attrs = [];
        this.attributes.forEach((value, key) => {
            attrs.push({
                key,
                value: {
                    stringValue: value
                }
            });
        });
        return attrs;
    }

    /**
     * Convert events to OTLP format
     */
    eventsToOTLPFormat() {
        return this.events.map(event => ({
            timeUnixNano: String(event.timestamp * 1000000),
            name: event.name,
            attributes: Object.entries(event.attributes).map(([key, value]) => ({
                key,
                value: { stringValue: String(value) }
            }))
        }));
    }

    /**
     * Convert links to OTLP format
     */
    linksToOTLPFormat() {
        return this.links.map(link => ({
            traceId: Buffer.from(link.traceId, 'hex').toString('base64'),
            spanId: Buffer.from(link.spanId, 'hex').toString('base64'),
            attributes: Object.entries(link.attributes).map(([key, value]) => ({
                key,
                value: { stringValue: String(value) }
            }))
        }));
    }
}

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * TRACER: Span creation and management
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Central trace management: creates spans, tracks active spans, exports to buffer.
 */
export class Tracer {
    constructor(config = TRACE_CONFIG) {
        this.config = config;
        this.activeSpans = new Map(); // spanId → Span
        this.traces = new Map(); // traceId → Span[]
        this.exportBuffer = [];
        this.completedSpans = 0;
    }

    /**
     * Start new span with optional parent span
     */
    startSpan(name, options = {}) {
        const parentSpan = options.parentSpan;
        const traceId = options.traceId || parentSpan?.traceId || TraceContext.generateTraceId();
        const spanId = TraceContext.generateSpanId();
        const parentSpanId = parentSpan?.spanId || null;

        const span = new Span({
            traceId,
            spanId,
            parentSpanId,
            name,
            kind: options.kind || 'INTERNAL',
            attributes: options.attributes,
            startTime: options.startTime || Date.now()
        });

        this.activeSpans.set(spanId, span);

        // Track spans per trace
        if (!this.traces.has(traceId)) {
            this.traces.set(traceId, []);
        }
        this.traces.get(traceId).push(span);

        // Enforce max spans per trace
        const traceSpans = this.traces.get(traceId);
        if (traceSpans.length > this.config.maxSpansPerTrace) {
            traceSpans.shift(); // Remove oldest span
        }

        return span;
    }

    /**
     * Start span, execute function with it, auto-end
     */
    async startActiveSpan(name, options = {}, fn) {
        const span = this.startSpan(name, options);

        try {
            const result = await fn(span);
            span.setStatus('OK');
            return result;
        } catch (error) {
            span.addEvent('exception', {
                'exception.type': error.constructor.name,
                'exception.message': error.message,
                'exception.stacktrace': error.stack || ''
            });
            span.setStatus('ERROR', error.message);
            throw error;
        } finally {
            this.endSpan(span);
        }
    }

    /**
     * Get most recent active span for a trace
     */
    getActiveSpan(traceId) {
        const traceSpans = this.traces.get(traceId);
        if (!traceSpans) return null;

        for (let i = traceSpans.length - 1; i >= 0; i--) {
            const span = traceSpans[i];
            if (span.isRecording()) {
                return span;
            }
        }
        return null;
    }

    /**
     * End span and move to export buffer
     */
    endSpan(span) {
        if (!span.isRecording()) return;

        span.end();
        this.activeSpans.delete(span.spanId);
        this.exportBuffer.push(span);
        this.completedSpans++;

        // Auto-flush if buffer is full
        if (this.exportBuffer.length >= this.config.exportBatchSize) {
            this.flush();
        }

        return span;
    }

    /**
     * Get span by ID
     */
    getSpan(spanId) {
        return this.activeSpans.get(spanId);
    }

    /**
     * Get all spans for a trace
     */
    getTrace(traceId) {
        return this.traces.get(traceId) || [];
    }

    /**
     * Inject TraceContext into outgoing request headers
     */
    injectContext(headers, span) {
        if (!span) return headers;

        const context = new TraceContext(span.traceId, span.spanId, '01');
        headers['traceparent'] = TraceContext.toHeader(context);

        return headers;
    }

    /**
     * Extract TraceContext from incoming request headers
     */
    extractContext(headers) {
        if (!headers) return null;

        const traceparent = headers['traceparent'] || headers['Traceparent'];
        const tracestate = headers['tracestate'] || headers['Tracestate'];

        const context = TraceContext.fromHeader(traceparent);
        if (!context) return null;

        context.tracestate = TraceContext.fromTracestate(tracestate);
        return context;
    }

    /**
     * Flush export buffer and return count
     */
    flush() {
        const count = this.exportBuffer.length;
        this.exportBuffer = [];
        return count;
    }

    /**
     * Get tracer metrics
     */
    getMetrics() {
        return {
            activeSpans: this.activeSpans.size,
            completedSpans: this.completedSpans,
            traces: this.traces.size,
            exportBufferSize: this.exportBuffer.length
        };
    }
}

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * TRACINGMIDDLEWARE: Hono HTTP integration
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Creates SERVER span for each HTTP request with automatic propagation.
 */
export function createTracingMiddleware(tracer) {
    return async (c, next) => {
        // Extract incoming trace context from headers
        const headers = {};
        const traceparent = c.req.header('traceparent');
        const tracestate = c.req.header('tracestate');
        if (traceparent) headers['traceparent'] = traceparent;
        if (tracestate) headers['tracestate'] = tracestate;

        const incomingContext = tracer.extractContext(headers);

        let traceId, parentSpanId;
        if (incomingContext && TraceContext.isValidTraceId(incomingContext.traceId)) {
            traceId = incomingContext.traceId;
            parentSpanId = incomingContext.spanId;
        } else {
            traceId = TraceContext.generateTraceId();
            parentSpanId = null;
        }

        // Create SERVER span
        const path = typeof c.req.path === 'function' ? c.req.path() : c.req.path;
        const span = tracer.startSpan(path, {
            kind: 'SERVER',
            traceId,
            parentSpanId: parentSpanId ? { spanId: parentSpanId } : undefined,
            attributes: {
                'http.method': c.req.method,
                'http.url': c.req.url,
                'http.route': path,
                'http.request_id': c.req.header('x-request-id') || ''
            }
        });

        // Store in context
        c.set('span', span);
        c.set('traceId', traceId);

        try {
            await next();

            // Set response attributes
            span.setAttribute('http.status_code', c.res.status);

            // Set status based on HTTP code
            if (c.res.status >= 400) {
                span.setStatus('ERROR', `HTTP ${c.res.status}`);
            } else {
                span.setStatus('OK');
            }
        } catch (error) {
            span.addEvent('exception', {
                'exception.type': error.constructor.name,
                'exception.message': error.message
            });
            span.setStatus('ERROR', error.message);
            span.setAttribute('http.status_code', 500);
            throw error;
        } finally {
            // End span and add response headers
            tracer.endSpan(span);

            c.header('X-Trace-Id', span.traceId);
            c.header('X-Span-Id', span.spanId);
        }
    };
}

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * SPANPROPAGATOR: Cross-boundary span creation
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Creates child spans for subrequests, agents, jobs, DB operations, external APIs.
 */
export class SpanPropagator {
    constructor(tracer) {
        this.tracer = tracer;
    }

    /**
     * Create CLIENT span for HTTP subrequest
     */
    propagateToSubrequest(parentSpan, headers = {}) {
        const span = this.tracer.startSpan('http.request', {
            parentSpan,
            kind: 'CLIENT',
            attributes: {
                'http.url': headers['url'] || '',
                'http.method': headers['method'] || 'GET'
            }
        });

        this.tracer.injectContext(headers, span);
        return span;
    }

    /**
     * Create INTERNAL span for agent execution
     */
    propagateToAgent(parentSpan, agentName) {
        const span = this.tracer.startSpan(`agent.${agentName}`, {
            parentSpan,
            kind: 'INTERNAL',
            attributes: {
                'agent.name': agentName
            }
        });

        return span;
    }

    /**
     * Create PRODUCER span for async job dispatch
     */
    propagateToJob(parentSpan, jobId) {
        const span = this.tracer.startSpan('job.dispatch', {
            parentSpan,
            kind: 'PRODUCER',
            attributes: {
                'job.id': jobId
            }
        });

        return span;
    }

    /**
     * Create CLIENT span for database operation
     */
    propagateToDatabase(parentSpan, operation, table) {
        const span = this.tracer.startSpan(`db.${operation}`, {
            parentSpan,
            kind: 'CLIENT',
            attributes: {
                'db.operation': operation,
                'db.table': table,
                'db.system': 'sql'
            }
        });

        return span;
    }

    /**
     * Create CLIENT span for external API call
     */
    propagateToExternalAPI(parentSpan, provider, endpoint) {
        const span = this.tracer.startSpan(`api.${provider}`, {
            parentSpan,
            kind: 'CLIENT',
            attributes: {
                'api.provider': provider,
                'api.endpoint': endpoint
            }
        });

        return span;
    }
}

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * TRACEEXPORTER: Export formats
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Exports spans in multiple formats: OTLP, Zipkin, console.
 */

// Create resilient fetch wrapper for OTEL trace exports
const resilientTraceFetch = createFetchResilience('otel-trace-export');

export class TraceExporter {
    /**
     * Export as OTLP JSON format
     */
    static exportOTLP(spans, config = TRACE_CONFIG) {
        const resourceSpans = [];

        // Group spans by trace
        const spansByTrace = new Map();
        spans.forEach(span => {
            if (!spansByTrace.has(span.traceId)) {
                spansByTrace.set(span.traceId, []);
            }
            spansByTrace.get(span.traceId).push(span);
        });

        spansByTrace.forEach((traceSpans, traceId) => {
            const scopeSpans = [{
                scope: {
                    name: config.serviceName,
                    version: config.serviceVersion
                },
                spans: traceSpans.map(span => span.toOTLP())
            }];

            resourceSpans.push({
                resource: {
                    attributes: [
                        {
                            key: 'service.name',
                            value: { stringValue: config.serviceName }
                        },
                        {
                            key: 'service.version',
                            value: { stringValue: config.serviceVersion }
                        }
                    ]
                },
                scopeSpans
            });
        });

        return {
            resourceSpans
        };
    }

    /**
     * Export as Zipkin JSON format
     */
    static exportZipkin(spans) {
        return spans.map(span => ({
            traceId: span.traceId,
            id: span.spanId,
            parentId: span.parentSpanId,
            name: span.name,
            timestamp: span.startTime * 1000, // microseconds
            duration: span.duration * 1000, // microseconds
            kind: span.kind,
            localEndpoint: {
                serviceName: TRACE_CONFIG.serviceName,
                ipv4: '127.0.0.1'
            },
            tags: span.getAttributes(),
            annotations: span.events.map(event => ({
                timestamp: event.timestamp * 1000,
                value: event.name
            }))
        }));
    }

    /**
     * Export as human-readable console tree
     */
    static exportConsole(spans) {
        const spansByTrace = new Map();
        spans.forEach(span => {
            if (!spansByTrace.has(span.traceId)) {
                spansByTrace.set(span.traceId, []);
            }
            spansByTrace.get(span.traceId).push(span);
        });

        let output = '';
        spansByTrace.forEach((traceSpans, traceId) => {
            output += `\n╭─ TRACE ${traceId}\n`;

            const spanMap = new Map(traceSpans.map(s => [s.spanId, s]));
            const roots = traceSpans.filter(s => !s.parentSpanId);

            const renderSpan = (span, indent = 0) => {
                const prefix = indent === 0 ? '├─ ' : '│  '.repeat(indent) + '├─ ';
                const status = span.status === 'OK' ? '✓' : span.status === 'ERROR' ? '✗' : '◯';
                const duration = span.duration ? ` (${span.duration}ms)` : '';

                output += `${prefix}${status} ${span.name}${duration}\n`;

                // Find children
                traceSpans
                    .filter(s => s.parentSpanId === span.spanId)
                    .forEach(child => renderSpan(child, indent + 1));
            };

            roots.forEach(root => renderSpan(root));
            output += '╰─\n';
        });

        return output;
    }

    /**
     * Send spans to OTEL collector endpoint (structural)
     */
    static async exportToCollector(spans, endpoint, config = TRACE_CONFIG) {
        const otlpData = TraceExporter.exportOTLP(spans, config);

        try {
            const response = await resilientTraceFetch(`${endpoint}/v1/traces`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(otlpData)
            });

            return {
                success: response.ok,
                status: response.status,
                exportedSpans: spans.length
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                exportedSpans: 0
            };
        }
    }
}

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * TRACESAMPLER: Sampling decisions
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Determines which traces/spans should be sampled.
 */
export class TraceSampler {
    /**
     * Make sampling decision
     */
    static shouldSample(traceId, spanName, attributes) {
        return {
            decision: 'RECORD_AND_SAMPLE',
            probability: 1.0
        };
    }

    /**
     * AlwaysOn sampler
     */
    static AlwaysOn() {
        return class {
            static shouldSample() {
                return { decision: 'RECORD_AND_SAMPLE', probability: 1.0 };
            }
        };
    }

    /**
     * AlwaysOff sampler
     */
    static AlwaysOff() {
        return class {
            static shouldSample() {
                return { decision: 'DROP', probability: 0.0 };
            }
        };
    }

    /**
     * RatioBased sampler
     */
    static RatioBased(rate) {
        return class {
            static shouldSample(traceId) {
                const sample = TraceSampler.getRatioSample(traceId, rate);
                return {
                    decision: sample ? 'RECORD_AND_SAMPLE' : 'DROP',
                    probability: rate
                };
            }
        };
    }

    /**
     * ParentBased sampler
     */
    static ParentBased(parentDecision) {
        return class {
            static shouldSample() {
                return {
                    decision: parentDecision ? 'RECORD_AND_SAMPLE' : 'DROP',
                    probability: parentDecision ? 1.0 : 0.0
                };
            }
        };
    }

    /**
     * Deterministic ratio-based sampling
     */
    static getRatioSample(traceId, rate) {
        // Hash traceId to get consistent decision
        let hash = 0;
        for (let i = 0; i < traceId.length; i++) {
            const char = traceId.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }

        // Map hash to 0-1 range
        const normalized = Math.abs(hash) % 10000 / 10000;
        return normalized < rate;
    }
}

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * FACTORY FUNCTIONS
 * ═════════════════════════════════════════════════════════════════════════════
 */

/**
 * Create and return configured tracer instance
 */
export function createTracer(config = TRACE_CONFIG) {
    return new Tracer(config);
}

/**
 * Create and return span propagator
 */
export function createSpanPropagator(tracer) {
    return new SpanPropagator(tracer);
}

/**
 * Create and return trace exporter
 */
export function createTraceExporter() {
    return TraceExporter;
}
