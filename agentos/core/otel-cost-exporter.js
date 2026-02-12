/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * OPENTELEMETRY COST OBSERVABILITY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * OpenTelemetry-native cost observability module for AI request tracking and cost
 * attribution. Bridges AI cost data to OpenTelemetry format following GenAI semantic
 * conventions.
 *
 * FEATURES:
 * - CostSpan: OTEL-compatible span objects for each AI request
 * - CostMetricsCollector: Aggregates cost metrics in OTEL meter format
 * - GenAISemanticConventions: Attribute names following OTEL GenAI conventions
 * - CostTraceExporter: Formats traces for export (JSON-serializable)
 * - recordAIRequest(): Convenience function for complete AI request recording
 * - getMetricsSummary(): Returns aggregated metrics for dashboards
 * - exportTraces(): Exports traces in OTEL-compatible JSON format
 */

/**
 * OpenTelemetry GenAI semantic convention attribute names
 * Following: https://opentelemetry.io/docs/specs/semconv/gen-ai/
 */
export const GenAISemanticConventions = {
    // System attributes
    GEN_AI_SYSTEM: 'gen_ai.system',

    // Request attributes
    GEN_AI_REQUEST_MODEL: 'gen_ai.request.model',
    GEN_AI_REQUEST_TEMPERATURE: 'gen_ai.request.temperature',
    GEN_AI_REQUEST_TOP_P: 'gen_ai.request.top_p',
    GEN_AI_REQUEST_MAX_TOKENS: 'gen_ai.request.max_tokens',

    // Usage attributes (tokens)
    GEN_AI_USAGE_INPUT_TOKENS: 'gen_ai.usage.input_tokens',
    GEN_AI_USAGE_OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',

    // Cost attributes (custom extensions)
    GEN_AI_COST_TOTAL: 'gen_ai.cost.total',
    GEN_AI_COST_INPUT_TOKENS: 'gen_ai.cost.input_tokens',
    GEN_AI_COST_OUTPUT_TOKENS: 'gen_ai.cost.output_tokens',
    GEN_AI_COST_UNIT: 'gen_ai.cost.unit',

    // Provider attributes
    GEN_AI_PROVIDER: 'gen_ai.provider',

    // Request-scoped attributes
    GEN_AI_REQUEST_ID: 'gen_ai.request.id',
    GEN_AI_TEAM_ID: 'gen_ai.team.id',
    GEN_AI_ORG_ID: 'gen_ai.org.id',

    // Latency
    GEN_AI_REQUEST_DURATION_MS: 'gen_ai.request.duration_ms'
};

/**
 * CostSpan: Creates OTEL-compatible span objects for each AI request
 *
 * A span represents a single AI request with all associated metadata for cost
 * tracking and observability.
 */
export class CostSpan {
    constructor(config = {}) {
        this.spanId = config.spanId || this.generateSpanId();
        this.traceId = config.traceId || this.generateTraceId();
        this.parentSpanId = config.parentSpanId || null;
        this.name = config.name || 'ai.request';
        this.startTime = config.startTime || Date.now();
        this.endTime = null;
        this.duration = null;

        // AI request attributes
        this.attributes = {
            [GenAISemanticConventions.GEN_AI_SYSTEM]: config.system || 'anthropic',
            [GenAISemanticConventions.GEN_AI_REQUEST_MODEL]: config.model || '',
            [GenAISemanticConventions.GEN_AI_PROVIDER]: config.provider || 'anthropic',
            [GenAISemanticConventions.GEN_AI_REQUEST_ID]: config.requestId || this.generateRequestId(),
            [GenAISemanticConventions.GEN_AI_TEAM_ID]: config.teamId || null,
            [GenAISemanticConventions.GEN_AI_ORG_ID]: config.orgId || null,
            [GenAISemanticConventions.GEN_AI_REQUEST_TEMPERATURE]: config.temperature || null,
            [GenAISemanticConventions.GEN_AI_REQUEST_TOP_P]: config.topP || null,
            [GenAISemanticConventions.GEN_AI_REQUEST_MAX_TOKENS]: config.maxTokens || null,
        };

        // Token usage
        this.tokens = {
            input: config.inputTokens || 0,
            output: config.outputTokens || 0
        };

        // Cost tracking
        this.cost = {
            total: config.totalCost || 0,
            inputCost: config.inputCost || 0,
            outputCost: config.outputCost || 0,
            unit: config.costUnit || 'USD'
        };

        // Status
        this.status = {
            code: config.statusCode || 'UNSET',
            description: config.statusDescription || ''
        };

        // Events (errors, warnings, info)
        this.events = [];
    }

    /**
     * End the span and calculate duration
     */
    end(config = {}) {
        this.endTime = config.endTime || Date.now();
        this.duration = this.endTime - this.startTime;
        this.attributes[GenAISemanticConventions.GEN_AI_REQUEST_DURATION_MS] = this.duration;

        if (config.outputTokens !== undefined) {
            this.tokens.output = config.outputTokens;
        }
        if (config.totalCost !== undefined) {
            this.cost.total = config.totalCost;
        }
        if (config.statusCode !== undefined) {
            this.status.code = config.statusCode;
        }
        if (config.statusDescription !== undefined) {
            this.status.description = config.statusDescription;
        }

        return this;
    }

    /**
     * Add an event to the span
     */
    addEvent(name, config = {}) {
        this.events.push({
            name,
            timestamp: config.timestamp || Date.now(),
            attributes: config.attributes || {}
        });
        return this;
    }

    /**
     * Record token usage
     */
    recordTokenUsage(inputTokens, outputTokens) {
        this.tokens.input = inputTokens;
        this.tokens.output = outputTokens;
        this.attributes[GenAISemanticConventions.GEN_AI_USAGE_INPUT_TOKENS] = inputTokens;
        this.attributes[GenAISemanticConventions.GEN_AI_USAGE_OUTPUT_TOKENS] = outputTokens;
        return this;
    }

    /**
     * Record cost information
     */
    recordCost(totalCost, inputCost = 0, outputCost = 0, unit = 'USD') {
        this.cost.total = totalCost;
        this.cost.inputCost = inputCost;
        this.cost.outputCost = outputCost;
        this.cost.unit = unit;
        this.attributes[GenAISemanticConventions.GEN_AI_COST_TOTAL] = totalCost;
        this.attributes[GenAISemanticConventions.GEN_AI_COST_INPUT_TOKENS] = inputCost;
        this.attributes[GenAISemanticConventions.GEN_AI_COST_OUTPUT_TOKENS] = outputCost;
        this.attributes[GenAISemanticConventions.GEN_AI_COST_UNIT] = unit;
        return this;
    }

    /**
     * Convert span to OTEL-compatible JSON
     */
    toJSON() {
        return {
            spanId: this.spanId,
            traceId: this.traceId,
            parentSpanId: this.parentSpanId,
            name: this.name,
            startTime: this.startTime,
            endTime: this.endTime,
            duration: this.duration,
            attributes: this.attributes,
            tokens: this.tokens,
            cost: this.cost,
            status: this.status,
            events: this.events
        };
    }

    /**
     * Generate unique span ID
     */
    generateSpanId() {
        return Math.random().toString(36).substring(2, 18);
    }

    /**
     * Generate unique trace ID
     */
    generateTraceId() {
        return Math.random().toString(36).substring(2, 34);
    }

    /**
     * Generate unique request ID
     */
    generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    }
}

/**
 * CostMetricsCollector: Aggregates cost metrics in OTEL meter format
 *
 * Collects and aggregates cost metrics following OpenTelemetry semantic conventions.
 */
export class CostMetricsCollector {
    constructor(config = {}) {
        this.config = config;

        // Metrics storage
        this.metrics = {
            'ai.cost.total': { type: 'counter', value: 0, attributes: {} },
            'ai.tokens.consumed': { type: 'counter', value: 0, attributes: {} },
            'ai.request.duration': { type: 'histogram', values: [], attributes: {} },
            'ai.cost.per_token': { type: 'gauge', value: 0, attributes: {} },
            'ai.request.count': { type: 'counter', value: 0, attributes: {} }
        };

        // Dimension aggregators (for breaking down by provider/model/team)
        this.dimensionalMetrics = {};

        // Current request scratch
        this.currentRequest = null;
    }

    /**
     * Record a complete AI request with all metrics
     */
    recordRequest(requestData) {
        const {
            model = '',
            provider = 'anthropic',
            teamId = null,
            orgId = null,
            inputTokens = 0,
            outputTokens = 0,
            totalCost = 0,
            duration = 0
        } = requestData;

        // Create dimensional key
        const dimensionKey = `${provider}:${model}:${teamId || 'default'}`;

        if (!this.dimensionalMetrics[dimensionKey]) {
            this.dimensionalMetrics[dimensionKey] = {
                cost: 0,
                inputTokens: 0,
                outputTokens: 0,
                requestCount: 0,
                durations: [],
                dimensions: { provider, model, teamId, orgId }
            };
        }

        // Aggregate metrics
        this.metrics['ai.cost.total'].value += totalCost;
        this.metrics['ai.tokens.consumed'].value += (inputTokens + outputTokens);
        this.metrics['ai.request.duration'].values.push(duration);
        this.metrics['ai.request.count'].value += 1;

        // Dimensional aggregation
        const dim = this.dimensionalMetrics[dimensionKey];
        dim.cost += totalCost;
        dim.inputTokens += inputTokens;
        dim.outputTokens += outputTokens;
        dim.requestCount += 1;
        dim.durations.push(duration);

        // Update per-token cost gauge
        const totalTokens = inputTokens + outputTokens;
        if (totalTokens > 0) {
            this.metrics['ai.cost.per_token'].value = totalCost / totalTokens;
        }

        return this;
    }

    /**
     * Get metrics for a specific dimension (provider/model/team)
     */
    getMetricsByDimension(provider, model, teamId = 'default') {
        const key = `${provider}:${model}:${teamId}`;
        return this.dimensionalMetrics[key] || null;
    }

    /**
     * Get all metric values
     */
    getMetrics() {
        return { ...this.metrics };
    }

    /**
     * Get dimensional breakdown
     */
    getDimensionalMetrics() {
        return { ...this.dimensionalMetrics };
    }

    /**
     * Calculate percentile for request durations
     */
    getPercentileDuration(percentile) {
        const values = this.metrics['ai.request.duration'].values;
        if (values.length === 0) return 0;

        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }

    /**
     * Reset metrics
     */
    reset() {
        for (const key in this.metrics) {
            if (this.metrics[key].type === 'counter') {
                this.metrics[key].value = 0;
            } else if (this.metrics[key].type === 'histogram') {
                this.metrics[key].values = [];
            } else if (this.metrics[key].type === 'gauge') {
                this.metrics[key].value = 0;
            }
        }
        this.dimensionalMetrics = {};
        return this;
    }

    /**
     * Convert metrics to JSON
     */
    toJSON() {
        return {
            metrics: this.metrics,
            dimensionalMetrics: this.dimensionalMetrics,
            timestamp: Date.now()
        };
    }
}

/**
 * CostTraceExporter: Formats traces for export
 *
 * Converts collected spans into OTEL-compatible exportable format.
 */
export class CostTraceExporter {
    constructor(config = {}) {
        this.config = config;
        this.spans = [];
        this.exportTimestamp = null;
    }

    /**
     * Add a span to export buffer
     */
    addSpan(span) {
        this.spans.push(span);
        return this;
    }

    /**
     * Clear buffered spans
     */
    clearSpans() {
        this.spans = [];
        return this;
    }

    /**
     * Export spans in OTEL JSON format
     */
    exportJSON() {
        this.exportTimestamp = Date.now();

        return {
            resourceSpans: [{
                resource: {
                    attributes: {
                        'service.name': this.config.serviceName || 'finault-agentos',
                        'service.version': this.config.serviceVersion || '1.0.0',
                        'telemetry.sdk.name': 'otel-cost-exporter',
                        'telemetry.sdk.version': '1.0.0'
                    }
                },
                scopeSpans: [{
                    scope: {
                        name: 'finault.cost-observability',
                        version: '1.0.0'
                    },
                    spans: this.spans.map(s => s.toJSON())
                }]
            }],
            exportTimestamp: this.exportTimestamp
        };
    }

    /**
     * Export spans in NDJSON format (newline-delimited JSON)
     */
    exportNDJSON() {
        return this.spans
            .map(s => JSON.stringify(s.toJSON()))
            .join('\n');
    }

    /**
     * Export spans in CSV format (simplified)
     */
    exportCSV(includeHeader = true) {
        const headers = [
            'traceId',
            'spanId',
            'name',
            'duration_ms',
            'model',
            'provider',
            'team_id',
            'input_tokens',
            'output_tokens',
            'total_cost',
            'cost_unit',
            'status_code'
        ];

        let csv = '';
        if (includeHeader) {
            csv = headers.join(',') + '\n';
        }

        csv += this.spans.map(span => {
            const attrs = span.attributes;
            return [
                span.traceId,
                span.spanId,
                span.name,
                span.duration || 0,
                attrs[GenAISemanticConventions.GEN_AI_REQUEST_MODEL] || '',
                attrs[GenAISemanticConventions.GEN_AI_PROVIDER] || '',
                attrs[GenAISemanticConventions.GEN_AI_TEAM_ID] || '',
                span.tokens.input,
                span.tokens.output,
                span.cost.total,
                span.cost.unit,
                span.status.code
            ].map(v => {
                // Escape CSV values
                if (typeof v === 'string' && (v.includes(',') || v.includes('"'))) {
                    return `"${v.replace(/"/g, '""')}"`;
                }
                return v;
            }).join(',');
        }).join('\n');

        return csv;
    }
}

/**
 * Create cost observability pipeline
 *
 * Initializes CostSpan, CostMetricsCollector, and CostTraceExporter
 */
export function createCostObservability(config = {}) {
    return {
        config: {
            serviceName: config.serviceName || 'finault-agentos',
            serviceVersion: config.serviceVersion || '1.0.0',
            ...config
        },
        metricsCollector: new CostMetricsCollector(config),
        exporter: new CostTraceExporter(config),
        spans: [],

        /**
         * Create a new cost span
         */
        createSpan(spanConfig) {
            return new CostSpan(spanConfig);
        },

        /**
         * Record a complete AI request
         */
        recordAIRequest(requestData) {
            const span = new CostSpan(requestData);
            if (requestData.duration) {
                span.end({
                    outputTokens: requestData.outputTokens,
                    totalCost: requestData.totalCost,
                    statusCode: requestData.statusCode || 'OK'
                });
            }

            this.spans.push(span);
            this.metricsCollector.recordRequest(requestData);
            this.exporter.addSpan(span);

            return span;
        },

        /**
         * Get metrics summary
         */
        getMetricsSummary(period = null) {
            const metrics = this.metricsCollector.getMetrics();
            const dims = this.metricsCollector.getDimensionalMetrics();

            return {
                timestamp: Date.now(),
                period,
                summary: {
                    totalCost: metrics['ai.cost.total'].value,
                    totalTokens: metrics['ai.tokens.consumed'].value,
                    totalRequests: metrics['ai.request.count'].value,
                    avgCostPerToken: metrics['ai.cost.per_token'].value,
                    avgDuration: this.calculateAverageDuration(metrics['ai.request.duration'].values),
                    p95Duration: this.metricsCollector.getPercentileDuration(95),
                    p99Duration: this.metricsCollector.getPercentileDuration(99)
                },
                byDimension: dims
            };
        },

        /**
         * Export traces
         */
        exportTraces(format = 'json') {
            switch (format.toLowerCase()) {
                case 'json':
                    return this.exporter.exportJSON();
                case 'ndjson':
                    return this.exporter.exportNDJSON();
                case 'csv':
                    return this.exporter.exportCSV(true);
                default:
                    return this.exporter.exportJSON();
            }
        },

        /**
         * Calculate average duration
         */
        calculateAverageDuration(values) {
            if (!values || values.length === 0) return 0;
            const sum = values.reduce((a, b) => a + b, 0);
            return sum / values.length;
        },

        /**
         * Reset all metrics
         */
        reset() {
            this.metricsCollector.reset();
            this.exporter.clearSpans();
            this.spans = [];
            return this;
        }
    };
}

/**
 * Convenience function to record a complete AI request with all metrics
 *
 * @param {Object} observability - Observability instance from createCostObservability()
 * @param {Object} requestData - Complete request data
 * @returns {CostSpan} The recorded span
 */
export function recordAIRequest(observability, requestData) {
    return observability.recordAIRequest(requestData);
}

/**
 * Get metrics summary for dashboard display
 *
 * @param {Object} observability - Observability instance
 * @param {string} period - Time period for summary (optional)
 * @returns {Object} Aggregated metrics summary
 */
export function getMetricsSummary(observability, period = null) {
    return observability.getMetricsSummary(period);
}

/**
 * Export traces in specified format
 *
 * @param {Object} observability - Observability instance
 * @param {string} format - Export format ('json', 'ndjson', 'csv')
 * @returns {Object|string} Exported traces
 */
export function exportTraces(observability, format = 'json') {
    return observability.exportTraces(format);
}

export default {
    GenAISemanticConventions,
    CostSpan,
    CostMetricsCollector,
    CostTraceExporter,
    createCostObservability,
    recordAIRequest,
    getMetricsSummary,
    exportTraces
};
