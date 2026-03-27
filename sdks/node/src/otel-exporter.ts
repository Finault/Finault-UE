/**
 * Finault OpenTelemetry Exporter (Node.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * OTel span exporter that emits spans with Finault cost, margin, and seal attributes
 * Compatible with @opentelemetry/api standard
 */

import {
  SpanExporter,
  ReadableSpan,
  ExportResult
} from '@opentelemetry/sdk-trace-node';

/**
 * Finault OpenTelemetry Exporter
 */
export class FinaultOtelExporter implements SpanExporter {
  private orgId: string;
  private apiKey: string;
  private endpoint: string;
  private batchSize: number;
  private flushInterval: number;
  private buffer: ReadableSpan[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(options: {
    orgId: string;
    apiKey: string;
    endpoint?: string;
    batchSize?: number;
    flushInterval?: number;
  }) {
    this.orgId = options.orgId;
    this.apiKey = options.apiKey;
    this.endpoint = options.endpoint || 'https://gateway.finault.ai/api/telemetry';
    this.batchSize = options.batchSize || 100;
    this.flushInterval = options.flushInterval || 5000; // 5 seconds
  }

  /**
   * Export spans
   */
  async export(
    spans: ReadableSpan[]
  ): Promise<ExportResult> {
    try {
      this.buffer.push(...spans);

      // Auto-flush if buffer exceeds batch size
      if (this.buffer.length >= this.batchSize) {
        await this.flush();
      } else {
        // Schedule flush if not already scheduled
        if (!this.flushTimer) {
          this.flushTimer = setTimeout(() => this.flush(), this.flushInterval);
        }
      }

      return ExportResult.SUCCESS;
    } catch (err) {
      console.error('Failed to export spans:', err);
      return ExportResult.FAILED_NOT_RETRYABLE;
    }
  }

  /**
   * Shutdown exporter
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    await this.flush();
  }

  /**
   * Force flush
   */
  async forceFlush(timeoutMs?: number): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  /**
   * Flush buffered spans
   */
  private async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const spansToExport = this.buffer.splice(0, this.batchSize);

    try {
      const telemetryEvents = spansToExport.map(span =>
        this.spanToTelemetryEvent(span)
      );

      await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Finault-Org-ID': this.orgId,
          'X-Finault-API-Key': this.apiKey
        },
        body: JSON.stringify({
          events: telemetryEvents,
          timestamp: new Date().toISOString()
        })
      });

      console.log(`Exported ${telemetryEvents.length} telemetry events`);
    } catch (err) {
      console.error('Failed to flush spans:', err);
      // Re-add spans to buffer for retry
      this.buffer.unshift(...spansToExport);
    }

    // Schedule next flush if buffer still has items
    if (this.buffer.length > 0) {
      this.flushTimer = setTimeout(() => this.flush(), this.flushInterval);
    }
  }

  /**
   * Convert span to Finault telemetry event
   */
  private spanToTelemetryEvent(span: ReadableSpan) {
    const attributes = span.attributes || {};

    return {
      trace_id: span.spanContext().traceId,
      span_id: span.spanContext().spanId,
      parent_span_id: span.parentSpanId,
      name: span.name,
      start_time: span.startTime[0] * 1000 + span.startTime[1] / 1e6, // Convert to ms
      end_time: span.endTime[0] * 1000 + span.endTime[1] / 1e6,
      duration_ms: (span.endTime[0] - span.startTime[0]) * 1000 +
                   (span.endTime[1] - span.startTime[1]) / 1e6,

      // Finault-specific attributes
      finault: {
        cost_usd: attributes['finault.cost'] as number,
        margin_usd: attributes['finault.margin'] as number,
        margin_percent: attributes['finault.margin_percent'] as number,
        seal_id: attributes['finault.seal_id'] as string,
        seal_url: attributes['finault.seal_url'] as string,
        model: attributes['finault.model'] as string,
        provider: attributes['finault.provider'] as string,
        tokens_in: attributes['finault.tokens_in'] as number,
        tokens_out: attributes['finault.tokens_out'] as number,
        cache_hit: attributes['finault.cache_hit'] as boolean,
        cost_method: attributes['finault.cost_method'] as string
      },

      // Standard attributes
      attributes: {
        'http.method': attributes['http.method'],
        'http.url': attributes['http.url'],
        'http.status_code': attributes['http.status_code'],
        'http.host': attributes['http.host'],
        'http.scheme': attributes['http.scheme'],
        'component': attributes['component']
      },

      // Status
      status: {
        code: span.status?.code,
        message: span.status?.message
      },

      // Events (exceptions, etc)
      events: span.events.map(event => ({
        name: event.name,
        timestamp: event.time[0] * 1000 + event.time[1] / 1e6,
        attributes: event.attributes
      }))
    };
  }
}

/**
 * Initialize Finault OTel exporter
 */
export function initFinaultOtel(options: {
  orgId: string;
  apiKey: string;
  endpoint?: string;
  autoInstrument?: boolean;
}): FinaultOtelExporter {
  const exporter = new FinaultOtelExporter({
    orgId: options.orgId,
    apiKey: options.apiKey,
    endpoint: options.endpoint
  });

  return exporter;
}

export default FinaultOtelExporter;
