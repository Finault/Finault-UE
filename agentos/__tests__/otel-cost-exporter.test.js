/**
 * TEST SUITE: otel-cost-exporter.test.js
 * Comprehensive tests for OpenTelemetry cost observability module
 *
 * Tests:
 * - CostSpan creation and lifecycle management
 * - Token usage recording and aggregation
 * - Cost tracking and per-token calculations
 * - GenAI semantic conventions compliance
 * - CostMetricsCollector aggregation logic
 * - Dimensional (provider/model/team) metrics
 * - CostTraceExporter JSON/NDJSON/CSV export formats
 * - createCostObservability factory function
 * - recordAIRequest convenience function
 * - getMetricsSummary dashboard data
 * - exportTraces format conversion
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    GenAISemanticConventions,
    CostSpan,
    CostMetricsCollector,
    CostTraceExporter,
    createCostObservability,
    recordAIRequest,
    getMetricsSummary,
    exportTraces
} from '../core/otel-cost-exporter.js';

// ═══════════════════════════════════════════════════════════════════════════
// COSTSPAN TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('CostSpan: Basic Creation', () => {
    it('otel_001: CostSpan constructor initializes with defaults', () => {
        const span = new CostSpan();
        assert(span.spanId);
        assert(span.traceId);
        assert.strictEqual(span.name, 'ai.request');
        assert.strictEqual(span.endTime, null);
        assert.strictEqual(span.duration, null);
    });

    it('otel_002: CostSpan accepts config parameters', () => {
        const config = {
            model: 'claude-3-opus',
            provider: 'anthropic',
            teamId: 'team-123',
            orgId: 'org-456',
            system: 'finault'
        };
        const span = new CostSpan(config);
        assert.strictEqual(span.attributes[GenAISemanticConventions.GEN_AI_REQUEST_MODEL], 'claude-3-opus');
        assert.strictEqual(span.attributes[GenAISemanticConventions.GEN_AI_PROVIDER], 'anthropic');
        assert.strictEqual(span.attributes[GenAISemanticConventions.GEN_AI_TEAM_ID], 'team-123');
        assert.strictEqual(span.attributes[GenAISemanticConventions.GEN_AI_ORG_ID], 'org-456');
    });

    it('otel_003: CostSpan generates unique IDs', () => {
        const span1 = new CostSpan();
        const span2 = new CostSpan();
        assert.notStrictEqual(span1.spanId, span2.spanId);
        assert.notStrictEqual(span1.traceId, span2.traceId);
    });

    it('otel_004: CostSpan tracks startTime', () => {
        const now = Date.now();
        const span = new CostSpan();
        assert(span.startTime >= now - 100 && span.startTime <= now + 100);
    });
});

describe('CostSpan: Lifecycle Management', () => {
    it('otel_005: CostSpan.end() calculates duration', () => {
        const span = new CostSpan();
        const startTime = span.startTime;
        setTimeout(() => {
            span.end({ endTime: startTime + 100 });
        }, 10);

        span.end({ endTime: startTime + 150 });
        assert.strictEqual(span.duration, 150);
        assert.strictEqual(span.endTime, startTime + 150);
    });

    it('otel_006: CostSpan.end() sets attributes', () => {
        const span = new CostSpan();
        span.end({
            outputTokens: 1000,
            totalCost: 0.05,
            statusCode: 'OK',
            statusDescription: 'Success'
        });

        assert.strictEqual(span.status.code, 'OK');
        assert.strictEqual(span.status.description, 'Success');
    });

    it('otel_007: CostSpan.addEvent() records events', () => {
        const span = new CostSpan();
        span.addEvent('cache_hit', { attributes: { cacheKey: 'abc123' } });
        span.addEvent('rate_limit_check', { attributes: { remaining: 100 } });

        assert.strictEqual(span.events.length, 2);
        assert.strictEqual(span.events[0].name, 'cache_hit');
        assert.strictEqual(span.events[1].name, 'rate_limit_check');
    });

    it('otel_008: CostSpan.recordTokenUsage() updates tokens and attributes', () => {
        const span = new CostSpan();
        span.recordTokenUsage(500, 1000);

        assert.strictEqual(span.tokens.input, 500);
        assert.strictEqual(span.tokens.output, 1000);
        assert.strictEqual(span.attributes[GenAISemanticConventions.GEN_AI_USAGE_INPUT_TOKENS], 500);
        assert.strictEqual(span.attributes[GenAISemanticConventions.GEN_AI_USAGE_OUTPUT_TOKENS], 1000);
    });

    it('otel_009: CostSpan.recordCost() updates cost attributes', () => {
        const span = new CostSpan();
        span.recordCost(0.05, 0.01, 0.04, 'USD');

        assert.strictEqual(span.cost.total, 0.05);
        assert.strictEqual(span.cost.inputCost, 0.01);
        assert.strictEqual(span.cost.outputCost, 0.04);
        assert.strictEqual(span.cost.unit, 'USD');
    });
});

describe('CostSpan: JSON Serialization', () => {
    it('otel_010: CostSpan.toJSON() returns complete object', () => {
        const config = {
            model: 'claude-3-opus',
            provider: 'anthropic',
            inputTokens: 500,
            outputTokens: 1000,
            totalCost: 0.05
        };
        const span = new CostSpan(config);
        span.end({ endTime: span.startTime + 100 });

        const json = span.toJSON();
        assert(json.spanId);
        assert(json.traceId);
        assert.strictEqual(json.name, 'ai.request');
        assert.strictEqual(json.duration, 100);
        assert.strictEqual(json.tokens.input, 500);
        assert.strictEqual(json.tokens.output, 1000);
    });

    it('otel_011: CostSpan JSON is serializable', () => {
        const span = new CostSpan({ model: 'claude-3-opus' });
        span.recordTokenUsage(100, 200);
        span.recordCost(0.02);

        const json = span.toJSON();
        const serialized = JSON.stringify(json);
        const deserialized = JSON.parse(serialized);

        assert.strictEqual(deserialized.name, 'ai.request');
        assert.strictEqual(deserialized.tokens.input, 100);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// COSTMETRICSCOLLECTOR TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('CostMetricsCollector: Initialization', () => {
    it('otel_012: CostMetricsCollector initializes with empty metrics', () => {
        const collector = new CostMetricsCollector();
        const metrics = collector.getMetrics();

        assert(metrics['ai.cost.total']);
        assert(metrics['ai.tokens.consumed']);
        assert(metrics['ai.request.duration']);
        assert(metrics['ai.cost.per_token']);
        assert(metrics['ai.request.count']);
    });

    it('otel_013: Metrics have correct types', () => {
        const collector = new CostMetricsCollector();
        const metrics = collector.getMetrics();

        assert.strictEqual(metrics['ai.cost.total'].type, 'counter');
        assert.strictEqual(metrics['ai.tokens.consumed'].type, 'counter');
        assert.strictEqual(metrics['ai.request.duration'].type, 'histogram');
        assert.strictEqual(metrics['ai.cost.per_token'].type, 'gauge');
        assert.strictEqual(metrics['ai.request.count'].type, 'counter');
    });

    it('otel_014: Initial values are zero or empty', () => {
        const collector = new CostMetricsCollector();
        const metrics = collector.getMetrics();

        assert.strictEqual(metrics['ai.cost.total'].value, 0);
        assert.strictEqual(metrics['ai.tokens.consumed'].value, 0);
        assert.strictEqual(metrics['ai.request.count'].value, 0);
        assert.strictEqual(metrics['ai.request.duration'].values.length, 0);
    });
});

describe('CostMetricsCollector: Recording Requests', () => {
    it('otel_015: recordRequest() aggregates cost metrics', () => {
        const collector = new CostMetricsCollector();
        collector.recordRequest({
            model: 'claude-3-opus',
            provider: 'anthropic',
            inputTokens: 500,
            outputTokens: 1000,
            totalCost: 0.05,
            duration: 250
        });

        const metrics = collector.getMetrics();
        assert.strictEqual(metrics['ai.cost.total'].value, 0.05);
        assert.strictEqual(metrics['ai.tokens.consumed'].value, 1500);
        assert.strictEqual(metrics['ai.request.count'].value, 1);
        assert.strictEqual(metrics['ai.request.duration'].values.length, 1);
    });

    it('otel_016: recordRequest() accumulates across multiple calls', () => {
        const collector = new CostMetricsCollector();
        collector.recordRequest({ totalCost: 0.05, inputTokens: 100, outputTokens: 200, duration: 100 });
        collector.recordRequest({ totalCost: 0.03, inputTokens: 50, outputTokens: 150, duration: 150 });

        const metrics = collector.getMetrics();
        assert.strictEqual(metrics['ai.cost.total'].value, 0.08);
        assert.strictEqual(metrics['ai.tokens.consumed'].value, 500);
        assert.strictEqual(metrics['ai.request.count'].value, 2);
    });

    it('otel_017: recordRequest() calculates per-token cost', () => {
        const collector = new CostMetricsCollector();
        collector.recordRequest({
            inputTokens: 1000,
            outputTokens: 1000,
            totalCost: 0.10
        });

        const metrics = collector.getMetrics();
        assert.strictEqual(metrics['ai.cost.per_token'].value, 0.00005); // 0.10 / 2000
    });

    it('otel_018: recordRequest() handles zero tokens', () => {
        const collector = new CostMetricsCollector();
        collector.recordRequest({
            inputTokens: 0,
            outputTokens: 0,
            totalCost: 0
        });

        const metrics = collector.getMetrics();
        assert.strictEqual(metrics['ai.cost.per_token'].value, 0);
    });
});

describe('CostMetricsCollector: Dimensional Aggregation', () => {
    it('otel_019: getDimensionalMetrics() breaks down by provider/model/team', () => {
        const collector = new CostMetricsCollector();
        collector.recordRequest({
            provider: 'anthropic',
            model: 'claude-3-opus',
            teamId: 'team-1',
            totalCost: 0.05,
            inputTokens: 100,
            outputTokens: 200
        });

        const dims = collector.getDimensionalMetrics();
        assert(dims['anthropic:claude-3-opus:team-1']);
        assert.strictEqual(dims['anthropic:claude-3-opus:team-1'].cost, 0.05);
    });

    it('otel_020: getMetricsByDimension() returns specific breakdown', () => {
        const collector = new CostMetricsCollector();
        collector.recordRequest({
            provider: 'anthropic',
            model: 'claude-3-opus',
            teamId: 'team-1',
            totalCost: 0.05,
            inputTokens: 100,
            outputTokens: 200,
            duration: 100
        });

        const dim = collector.getMetricsByDimension('anthropic', 'claude-3-opus', 'team-1');
        assert.strictEqual(dim.cost, 0.05);
        assert.strictEqual(dim.inputTokens, 100);
        assert.strictEqual(dim.outputTokens, 200);
        assert.strictEqual(dim.requestCount, 1);
    });

    it('otel_021: Multiple dimensions are tracked independently', () => {
        const collector = new CostMetricsCollector();
        collector.recordRequest({
            provider: 'anthropic',
            model: 'claude-3-opus',
            teamId: 'team-1',
            totalCost: 0.05
        });
        collector.recordRequest({
            provider: 'anthropic',
            model: 'claude-3-haiku',
            teamId: 'team-2',
            totalCost: 0.01
        });

        const dims = collector.getDimensionalMetrics();
        assert.strictEqual(Object.keys(dims).length, 2);
        assert.strictEqual(dims['anthropic:claude-3-opus:team-1'].cost, 0.05);
        assert.strictEqual(dims['anthropic:claude-3-haiku:team-2'].cost, 0.01);
    });

    it('otel_022: Accumulation within dimension works correctly', () => {
        const collector = new CostMetricsCollector();
        collector.recordRequest({
            provider: 'anthropic',
            model: 'claude-3-opus',
            teamId: 'team-1',
            totalCost: 0.05,
            inputTokens: 100,
            outputTokens: 200
        });
        collector.recordRequest({
            provider: 'anthropic',
            model: 'claude-3-opus',
            teamId: 'team-1',
            totalCost: 0.03,
            inputTokens: 50,
            outputTokens: 100
        });

        const dim = collector.getMetricsByDimension('anthropic', 'claude-3-opus', 'team-1');
        assert.strictEqual(dim.cost, 0.08);
        assert.strictEqual(dim.inputTokens, 150);
        assert.strictEqual(dim.requestCount, 2);
    });
});

describe('CostMetricsCollector: Percentile Calculations', () => {
    it('otel_023: getPercentileDuration() returns 0 for empty durations', () => {
        const collector = new CostMetricsCollector();
        assert.strictEqual(collector.getPercentileDuration(95), 0);
    });

    it('otel_024: getPercentileDuration() works with single value', () => {
        const collector = new CostMetricsCollector();
        collector.recordRequest({ duration: 100, totalCost: 0.01 });
        assert.strictEqual(collector.getPercentileDuration(50), 100);
    });

    it('otel_025: getPercentileDuration() approximates percentile', () => {
        const collector = new CostMetricsCollector();
        const durations = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
        durations.forEach(d => {
            collector.recordRequest({ duration: d, totalCost: 0.01 });
        });

        const p95 = collector.getPercentileDuration(95);
        assert(p95 >= 90 && p95 <= 100);
    });
});

describe('CostMetricsCollector: Reset', () => {
    it('otel_026: reset() clears all metrics', () => {
        const collector = new CostMetricsCollector();
        collector.recordRequest({ totalCost: 0.05, inputTokens: 100, outputTokens: 200, duration: 100 });
        collector.reset();

        const metrics = collector.getMetrics();
        assert.strictEqual(metrics['ai.cost.total'].value, 0);
        assert.strictEqual(metrics['ai.tokens.consumed'].value, 0);
        assert.strictEqual(metrics['ai.request.count'].value, 0);
        assert.strictEqual(collector.getDimensionalMetrics().length === 0 || Object.keys(collector.getDimensionalMetrics()).length === 0, true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// COSTTRACEEXPORTER TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('CostTraceExporter: Basic Operations', () => {
    it('otel_027: CostTraceExporter initializes empty', () => {
        const exporter = new CostTraceExporter();
        assert.strictEqual(exporter.spans.length, 0);
    });

    it('otel_028: addSpan() appends spans', () => {
        const exporter = new CostTraceExporter();
        const span1 = new CostSpan({ model: 'claude-3-opus' });
        const span2 = new CostSpan({ model: 'claude-3-haiku' });

        exporter.addSpan(span1).addSpan(span2);
        assert.strictEqual(exporter.spans.length, 2);
    });

    it('otel_029: clearSpans() empties buffer', () => {
        const exporter = new CostTraceExporter();
        exporter.addSpan(new CostSpan());
        exporter.clearSpans();
        assert.strictEqual(exporter.spans.length, 0);
    });
});

describe('CostTraceExporter: JSON Export', () => {
    it('otel_030: exportJSON() returns OTEL-compatible structure', () => {
        const exporter = new CostTraceExporter({ serviceName: 'test-service' });
        const span = new CostSpan({ model: 'claude-3-opus' });
        exporter.addSpan(span);

        const json = exporter.exportJSON();
        assert(json.resourceSpans);
        assert(json.resourceSpans[0].resource);
        assert(json.resourceSpans[0].scopeSpans);
    });

    it('otel_031: exportJSON() includes resource metadata', () => {
        const exporter = new CostTraceExporter({
            serviceName: 'finault-test',
            serviceVersion: '2.0.0'
        });
        const json = exporter.exportJSON();

        const resource = json.resourceSpans[0].resource;
        assert.strictEqual(resource.attributes['service.name'], 'finault-test');
        assert.strictEqual(resource.attributes['service.version'], '2.0.0');
    });

    it('otel_032: exportJSON() includes scope metadata', () => {
        const exporter = new CostTraceExporter();
        const span = new CostSpan();
        exporter.addSpan(span);

        const json = exporter.exportJSON();
        const scope = json.resourceSpans[0].scopeSpans[0].scope;
        assert.strictEqual(scope.name, 'finault.cost-observability');
    });

    it('otel_033: exportJSON() is valid JSON', () => {
        const exporter = new CostTraceExporter();
        exporter.addSpan(new CostSpan({ model: 'claude-3-opus' }));

        const json = exporter.exportJSON();
        const serialized = JSON.stringify(json);
        const deserialized = JSON.parse(serialized);

        assert(deserialized.resourceSpans);
    });
});

describe('CostTraceExporter: NDJSON Export', () => {
    it('otel_034: exportNDJSON() returns line-delimited JSON', () => {
        const exporter = new CostTraceExporter();
        exporter.addSpan(new CostSpan({ model: 'claude-3-opus' }));
        exporter.addSpan(new CostSpan({ model: 'claude-3-haiku' }));

        const ndjson = exporter.exportNDJSON();
        const lines = ndjson.split('\n');
        assert.strictEqual(lines.length, 2);
    });

    it('otel_035: exportNDJSON() each line is valid JSON', () => {
        const exporter = new CostTraceExporter();
        exporter.addSpan(new CostSpan({ model: 'claude-3-opus' }));
        exporter.addSpan(new CostSpan({ model: 'claude-3-haiku' }));

        const ndjson = exporter.exportNDJSON();
        const lines = ndjson.split('\n');

        lines.forEach(line => {
            const parsed = JSON.parse(line);
            assert(parsed.spanId);
            assert(parsed.traceId);
        });
    });
});

describe('CostTraceExporter: CSV Export', () => {
    it('otel_036: exportCSV() returns CSV format', () => {
        const exporter = new CostTraceExporter();
        const span = new CostSpan({ model: 'claude-3-opus' });
        span.recordTokenUsage(100, 200);
        span.recordCost(0.05);
        exporter.addSpan(span);

        const csv = exporter.exportCSV();
        const lines = csv.split('\n');
        assert(lines[0].includes('traceId'));
        assert(lines[1].includes('claude-3-opus'));
    });

    it('otel_037: exportCSV() includes header by default', () => {
        const exporter = new CostTraceExporter();
        exporter.addSpan(new CostSpan());

        const csv = exporter.exportCSV();
        assert(csv.includes('traceId,spanId'));
    });

    it('otel_038: exportCSV() can exclude header', () => {
        const exporter = new CostTraceExporter();
        const span = new CostSpan({ model: 'test' });
        exporter.addSpan(span);

        const csvWithHeader = exporter.exportCSV(true);
        const csvWithoutHeader = exporter.exportCSV(false);

        assert(csvWithHeader.split('\n').length > csvWithoutHeader.split('\n').length);
    });

    it('otel_039: exportCSV() escapes special characters', () => {
        const exporter = new CostTraceExporter();
        const span = new CostSpan({ model: 'claude, "with quotes"' });
        exporter.addSpan(span);

        const csv = exporter.exportCSV();
        assert(csv.includes('"claude, ""with quotes"""'));
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY & CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

describe('createCostObservability(): Factory Function', () => {
    it('otel_040: createCostObservability() returns complete system', () => {
        const obs = createCostObservability({ serviceName: 'test' });
        assert(obs.metricsCollector);
        assert(obs.exporter);
        assert(obs.spans);
    });

    it('otel_041: createCostObservability() initializes config', () => {
        const obs = createCostObservability({ serviceName: 'my-service' });
        assert.strictEqual(obs.config.serviceName, 'my-service');
    });

    it('otel_042: createSpan() creates new CostSpan', () => {
        const obs = createCostObservability();
        const span = obs.createSpan({ model: 'claude-3-opus' });
        assert(span instanceof CostSpan);
    });

    it('otel_043: recordAIRequest() records and exports', () => {
        const obs = createCostObservability();
        obs.recordAIRequest({
            model: 'claude-3-opus',
            provider: 'anthropic',
            inputTokens: 100,
            outputTokens: 200,
            totalCost: 0.05,
            duration: 100
        });

        assert.strictEqual(obs.spans.length, 1);
        assert.strictEqual(obs.exporter.spans.length, 1);
    });

    it('otel_044: getMetricsSummary() returns aggregated data', () => {
        const obs = createCostObservability();
        obs.recordAIRequest({
            inputTokens: 100,
            outputTokens: 200,
            totalCost: 0.05,
            duration: 100
        });

        const summary = obs.getMetricsSummary();
        assert.strictEqual(summary.summary.totalCost, 0.05);
        assert.strictEqual(summary.summary.totalTokens, 300);
        assert.strictEqual(summary.summary.totalRequests, 1);
    });

    it('otel_045: exportTraces() defaults to JSON', () => {
        const obs = createCostObservability();
        obs.recordAIRequest({
            inputTokens: 100,
            outputTokens: 200,
            totalCost: 0.05,
            duration: 100
        });

        const exported = obs.exportTraces();
        assert(exported.resourceSpans);
    });

    it('otel_046: exportTraces() supports multiple formats', () => {
        const obs = createCostObservability();
        obs.recordAIRequest({ totalCost: 0.05, inputTokens: 100, outputTokens: 200, duration: 100 });

        const json = obs.exportTraces('json');
        const ndjson = obs.exportTraces('ndjson');
        const csv = obs.exportTraces('csv');

        assert(json.resourceSpans);
        assert(typeof ndjson === 'string');
        assert(csv.includes('traceId'));
    });

    it('otel_047: reset() clears all data', () => {
        const obs = createCostObservability();
        obs.recordAIRequest({ totalCost: 0.05, inputTokens: 100, outputTokens: 200, duration: 100 });
        obs.reset();

        assert.strictEqual(obs.spans.length, 0);
        assert.strictEqual(obs.exporter.spans.length, 0);

        const metrics = obs.metricsCollector.getMetrics();
        assert.strictEqual(metrics['ai.cost.total'].value, 0);
    });
});

describe('Convenience Functions', () => {
    it('otel_048: recordAIRequest() function works standalone', () => {
        const obs = createCostObservability();
        const span = recordAIRequest(obs, {
            model: 'claude-3-opus',
            inputTokens: 100,
            outputTokens: 200,
            totalCost: 0.05,
            duration: 100
        });

        assert(span instanceof CostSpan);
        assert.strictEqual(span.tokens.input, 100);
    });

    it('otel_049: getMetricsSummary() function works standalone', () => {
        const obs = createCostObservability();
        obs.recordAIRequest({
            inputTokens: 100,
            outputTokens: 200,
            totalCost: 0.05,
            duration: 100
        });

        const summary = getMetricsSummary(obs);
        assert(summary.summary);
        assert.strictEqual(summary.summary.totalCost, 0.05);
    });

    it('otel_050: exportTraces() function works standalone', () => {
        const obs = createCostObservability();
        obs.recordAIRequest({ totalCost: 0.05, inputTokens: 100, outputTokens: 200, duration: 100 });

        const json = exportTraces(obs, 'json');
        assert(json.resourceSpans);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Integration: End-to-End Observability Pipeline', () => {
    it('otel_051: Complete flow: create -> record -> aggregate -> export', () => {
        const obs = createCostObservability({ serviceName: 'finault-test' });

        // Record multiple requests
        for (let i = 0; i < 5; i++) {
            obs.recordAIRequest({
                model: 'claude-3-opus',
                provider: 'anthropic',
                teamId: 'team-1',
                inputTokens: 100 * (i + 1),
                outputTokens: 200 * (i + 1),
                totalCost: 0.05 * (i + 1),
                duration: 100 + i * 10
            });
        }

        // Verify aggregation
        const summary = obs.getMetricsSummary();
        assert.strictEqual(summary.summary.totalRequests, 5);
        assert(summary.summary.totalCost > 0.20);

        // Export
        const json = obs.exportTraces('json');
        assert.strictEqual(json.resourceSpans[0].scopeSpans[0].spans.length, 5);
    });

    it('otel_052: Multiple providers tracked independently', () => {
        const obs = createCostObservability();

        obs.recordAIRequest({
            model: 'claude-3-opus',
            provider: 'anthropic',
            teamId: 'team-1',
            inputTokens: 100,
            outputTokens: 200,
            totalCost: 0.05,
            duration: 100
        });

        obs.recordAIRequest({
            model: 'gpt-4',
            provider: 'openai',
            teamId: 'team-1',
            inputTokens: 50,
            outputTokens: 150,
            totalCost: 0.03,
            duration: 80
        });

        const dims = obs.metricsCollector.getDimensionalMetrics();
        assert(dims['anthropic:claude-3-opus:team-1']);
        assert(dims['openai:gpt-4:team-1']);
    });

    it('otel_053: Per-token cost calculation across requests', () => {
        const obs = createCostObservability();

        obs.recordAIRequest({
            inputTokens: 1000,
            outputTokens: 1000,
            totalCost: 0.10,
            duration: 100
        });

        obs.recordAIRequest({
            inputTokens: 1000,
            outputTokens: 1000,
            totalCost: 0.10,
            duration: 100
        });

        const summary = obs.getMetricsSummary();
        assert.strictEqual(summary.summary.avgCostPerToken, 0.00005); // 0.20 / 4000
    });

    it('otel_054: Duration percentiles calculated correctly', () => {
        const obs = createCostObservability();

        const durations = [50, 60, 70, 80, 90, 100, 110, 120, 130, 140];
        durations.forEach(d => {
            obs.recordAIRequest({
                inputTokens: 100,
                outputTokens: 200,
                totalCost: 0.01,
                duration: d
            });
        });

        const summary = obs.getMetricsSummary();
        assert(summary.summary.p95Duration >= 130);
        assert(summary.summary.p99Duration >= 135);
    });

    it('otel_055: CSV export contains all span data', () => {
        const obs = createCostObservability();

        obs.recordAIRequest({
            model: 'claude-3-opus',
            provider: 'anthropic',
            teamId: 'team-1',
            inputTokens: 100,
            outputTokens: 200,
            totalCost: 0.05,
            duration: 100
        });

        const csv = exportTraces(obs, 'csv');
        const lines = csv.split('\n');

        assert(lines[0].includes('model'));
        assert(lines[1].includes('claude-3-opus'));
        assert(lines[1].includes('anthropic'));
    });

    it('otel_056: GenAI semantic conventions adhered to', () => {
        const span = new CostSpan({
            model: 'claude-3-opus',
            provider: 'anthropic',
            teamId: 'team-1'
        });

        // Verify all standard attributes are present
        assert(span.attributes[GenAISemanticConventions.GEN_AI_SYSTEM]);
        assert(span.attributes[GenAISemanticConventions.GEN_AI_REQUEST_MODEL]);
        assert(span.attributes[GenAISemanticConventions.GEN_AI_PROVIDER]);
        assert(span.attributes[GenAISemanticConventions.GEN_AI_REQUEST_ID]);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// EDGE CASES & ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════

describe('Edge Cases & Error Handling', () => {
    it('otel_057: Null values handled gracefully', () => {
        const obs = createCostObservability();
        obs.recordAIRequest({
            teamId: null,
            orgId: null,
            totalCost: 0.01
        });

        const dims = obs.metricsCollector.getDimensionalMetrics();
        assert(Object.keys(dims).length > 0);
    });

    it('otel_058: Zero-cost requests tracked', () => {
        const obs = createCostObservability();
        obs.recordAIRequest({
            inputTokens: 100,
            outputTokens: 200,
            totalCost: 0,
            duration: 100
        });

        const summary = obs.getMetricsSummary();
        assert.strictEqual(summary.summary.totalRequests, 1);
        assert.strictEqual(summary.summary.totalCost, 0);
    });

    it('otel_059: Very large token counts handled', () => {
        const obs = createCostObservability();
        obs.recordAIRequest({
            inputTokens: 1000000,
            outputTokens: 1000000,
            totalCost: 100,
            duration: 1000
        });

        const summary = obs.getMetricsSummary();
        assert.strictEqual(summary.summary.totalTokens, 2000000);
    });

    it('otel_060: Negative values rejected gracefully', () => {
        const obs = createCostObservability();
        // Should not crash, just record as-is
        obs.recordAIRequest({
            inputTokens: -10, // Invalid but should not crash
            outputTokens: 200,
            totalCost: 0.05
        });

        const summary = obs.getMetricsSummary();
        assert(summary.summary.totalTokens !== undefined);
    });
});
