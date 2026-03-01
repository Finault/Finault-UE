/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * OpenTelemetry Distributed Tracing Infrastructure
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Lightweight tracing module compatible with Cloudflare Workers (no Node.js-only APIs).
 * Supports:
 * - W3C Trace Context propagation (traceparent header)
 * - Span hierarchy (parent-child relationships)
 * - Batch export to OTLP HTTP endpoint
 * - Configurable sampling rate
 * - Zero-dependency implementation
 * - Graceful no-op when disabled
 *
 * Usage:
 *   const tracer = new Tracer('my-service', { enabled: true, sampleRate: 1.0 });
 *   const span = tracer.startSpan('http.request', { method: 'GET', path: '/api/users' });
 *   try {
 *     // ... do work ...
 *     span.end();
 *   } catch (error) {
 *     span.setStatus('ERROR', error.message);
 *     span.end();
 *   }
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

/**
 * Span class - Represents a unit of work within a trace
 */
export class Span {
  constructor(tracer, name, traceId, spanId, parentSpanId, attributes = {}) {
    this.tracer = tracer;
    this.name = name;
    this.traceId = traceId;
    this.spanId = spanId;
    this.parentSpanId = parentSpanId;
    this.startTime = Date.now();
    this.endTime = null;
    this.attributes = { ...attributes };
    this.status = { code: 'UNSET', message: '' };
    this.events = [];
    this.isRecording = true;
  }

  /**
   * Set a string, number, or boolean attribute on the span
   */
  setAttribute(key, value) {
    if (!this.isRecording) return;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      this.attributes[key] = value;
    }
  }

  /**
   * Set the span status (OK or ERROR)
   */
  setStatus(code, message = '') {
    if (!this.isRecording) return;
    if (['OK', 'ERROR', 'UNSET'].includes(code)) {
      this.status = { code, message };
    }
  }

  /**
   * Add an event to the span (e.g., 'supabase.query', 'erp.post')
   */
  addEvent(name, attributes = {}) {
    if (!this.isRecording) return;
    this.events.push({
      name,
      timestamp: Date.now(),
      attributes: { ...attributes }
    });
  }

  /**
   * End the span and queue it for export
   */
  end() {
    if (!this.isRecording) return;
    this.isRecording = false;
    this.endTime = Date.now();
    this.tracer._enqueueSpan(this);
  }

  /**
   * Get W3C traceparent header value for propagation
   */
  getTraceparent() {
    const traceFlags = this.tracer.sampled ? '01' : '00';
    return `00-${this.traceId}-${this.spanId}-${traceFlags}`;
  }

  /**
   * Get duration in milliseconds
   */
  getDuration() {
    if (!this.endTime) return null;
    return this.endTime - this.startTime;
  }

  /**
   * Export to OTLP format
   */
  toOTLPSpan() {
    return {
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId || undefined,
      name: this.name,
      kind: 1, // INTERNAL
      startTime: this.startTime * 1000000, // Convert to nanoseconds
      endTime: this.endTime ? this.endTime * 1000000 : undefined,
      status: {
        code: this.status.code === 'ERROR' ? 2 : (this.status.code === 'OK' ? 1 : 0),
        message: this.status.message
      },
      attributes: this.attributes,
      events: this.events.map(e => ({
        name: e.name,
        time: e.timestamp * 1000000,
        attributes: e.attributes
      })),
      droppedAttributesCount: 0,
      droppedEventsCount: 0,
      droppedLinksCount: 0
    };
  }
}

/**
 * Tracer class - Creates and manages spans
 */
export class Tracer {
  constructor(serviceName, options = {}) {
    this.serviceName = serviceName;
    this.enabled = options.enabled !== false;
    this.sampleRate = options.sampleRate ?? (options.environment === 'production' ? 0.1 : 1.0);
    this.endpoint = options.endpoint || globalThis.OTEL_EXPORTER_OTLP_ENDPOINT || null;
    this.sampled = Math.random() < this.sampleRate;
    this.activeSpans = [];
    this.spanBuffer = [];
    this.exporter = null;

    // Initialize exporter if enabled and endpoint is configured
    if (this.enabled && this.endpoint) {
      this.exporter = new SpanExporter(this.endpoint, {
        serviceName: this.serviceName,
        batchSize: options.batchSize || 100,
        flushIntervalMs: options.flushIntervalMs || 5000
      });
    }
  }

  /**
   * Parse W3C traceparent header
   * Format: 00-{traceId}-{spanId}-{traceFlags}
   */
  static parseTraceparent(header) {
    if (!header || typeof header !== 'string') return null;

    const parts = header.split('-');
    if (parts.length !== 4) return null;

    const [version, traceId, spanId, traceFlags] = parts;
    if (version !== '00' || traceId.length !== 32 || spanId.length !== 16) return null;

    return {
      traceId,
      spanId,
      sampled: (parseInt(traceFlags, 16) & 0x01) === 1
    };
  }

  /**
   * Generate a random trace ID (32 hex characters)
   */
  static generateTraceId() {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Generate a random span ID (16 hex characters)
   */
  static generateSpanId() {
    const array = new Uint8Array(8);
    crypto.getRandomValues(array);
    return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Start a new root span from traceparent header or create new trace
   */
  startSpan(name, attributes = {}, traceparent = null) {
    if (!this.enabled) {
      return new NoOpSpan();
    }

    let traceId, parentSpanId, sampled;

    if (traceparent) {
      const parsed = Tracer.parseTraceparent(traceparent);
      if (parsed) {
        traceId = parsed.traceId;
        parentSpanId = parsed.spanId;
        sampled = parsed.sampled && this.sampled;
      } else {
        traceId = Tracer.generateTraceId();
        parentSpanId = null;
        sampled = this.sampled;
      }
    } else {
      traceId = Tracer.generateTraceId();
      parentSpanId = null;
      sampled = this.sampled;
    }

    const spanId = Tracer.generateSpanId();
    const span = new Span(this, name, traceId, spanId, parentSpanId, attributes);
    span.sampled = sampled;
    this.sampled = sampled;

    // Store in active spans for tracing context
    this.activeSpans.push(span);

    // Add service name attribute
    span.setAttribute('service.name', this.serviceName);

    return span;
  }

  /**
   * Start a child span from current context
   */
  startChildSpan(name, attributes = {}, parentSpan = null) {
    if (!this.enabled) {
      return new NoOpSpan();
    }

    const parent = parentSpan || this.activeSpans[this.activeSpans.length - 1];
    if (!parent) {
      return this.startSpan(name, attributes);
    }

    const spanId = Tracer.generateSpanId();
    const span = new Span(
      this,
      name,
      parent.traceId,
      spanId,
      parent.spanId,
      attributes
    );
    span.sampled = parent.sampled;

    this.activeSpans.push(span);
    span.setAttribute('service.name', this.serviceName);

    return span;
  }

  /**
   * Queue a span for batch export
   */
  _enqueueSpan(span) {
    if (!this.enabled || !this.exporter || !span.sampled) return;

    this.spanBuffer.push(span);

    // Auto-flush if buffer reaches batch size
    if (this.spanBuffer.length >= this.exporter.batchSize) {
      this.exporter.export(this.spanBuffer);
      this.spanBuffer = [];
    }
  }

  /**
   * Flush any pending spans to the exporter
   */
  async flush() {
    if (!this.enabled || !this.exporter || this.spanBuffer.length === 0) return;

    await this.exporter.export(this.spanBuffer);
    this.spanBuffer = [];
  }

  /**
   * Shutdown the tracer and flush all pending spans
   */
  async shutdown() {
    if (!this.exporter) return;
    await this.flush();
  }
}

/**
 * No-op span for when tracing is disabled
 */
class NoOpSpan {
  setAttribute() {}
  setStatus() {}
  addEvent() {}
  end() {}
  getTraceparent() {
    return '';
  }
  getDuration() {
    return null;
  }
}

/**
 * SpanExporter - Batches spans and exports to OTLP endpoint
 */
export class SpanExporter {
  constructor(endpoint, options = {}) {
    this.endpoint = endpoint;
    this.serviceName = options.serviceName || 'unknown';
    this.batchSize = options.batchSize || 100;
    this.flushIntervalMs = options.flushIntervalMs || 5000;
    this.pendingExports = [];
    this.flushTimer = null;

    // Start periodic flush timer
    if (typeof globalThis !== 'undefined' && globalThis.setInterval) {
      this.flushTimer = setInterval(() => {
        this._periodicallyFlush();
      }, this.flushIntervalMs);
    }
  }

  /**
   * Export a batch of spans to the OTLP endpoint
   */
  async export(spans) {
    if (!spans || spans.length === 0) return;

    const resourceSpans = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              {
                key: 'service.name',
                value: { stringValue: this.serviceName }
              },
              {
                key: 'service.version',
                value: { stringValue: '2.0.0' }
              }
            ]
          },
          scopeSpans: [
            {
              scope: {
                name: 'finault-tracer',
                version: '1.0.0'
              },
              spans: spans.map(s => this._convertToOTLPSpan(s))
            }
          ]
        }
      ]
    };

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(resourceSpans)
      });

      if (!response.ok) {
        console.warn(`[Telemetry] OTLP export failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.warn(`[Telemetry] OTLP export error: ${error.message}`);
    }
  }

  /**
   * Periodic flush of pending spans (no-op if interval is not available)
   */
  _periodicallyFlush() {
    // This would be called by the interval timer
    // Implementation depends on batching logic in Tracer
  }

  /**
   * Convert Span to OTLP format
   */
  _convertToOTLPSpan(span) {
    const attributes = [];
    const now = Date.now();

    // Add span attributes
    if (span.attributes) {
      for (const [key, value] of Object.entries(span.attributes)) {
        const attr = { key };
        if (typeof value === 'string') {
          attr.value = { stringValue: value };
        } else if (typeof value === 'number') {
          if (Number.isInteger(value)) {
            attr.value = { intValue: value };
          } else {
            attr.value = { doubleValue: value };
          }
        } else if (typeof value === 'boolean') {
          attr.value = { boolValue: value };
        }
        attributes.push(attr);
      }
    }

    return {
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId || '',
      name: span.name,
      kind: 1, // INTERNAL
      startTimeUnixNano: (span.startTime * 1000000).toString(),
      endTimeUnixNano: (span.endTime ? span.endTime * 1000000 : now * 1000000).toString(),
      attributes: attributes,
      status: {
        code: span.status.code === 'ERROR' ? 2 : (span.status.code === 'OK' ? 1 : 0),
        message: span.status.message
      },
      events: span.events.map(e => ({
        timeUnixNano: (e.timestamp * 1000000).toString(),
        name: e.name,
        attributes: Object.entries(e.attributes).map(([key, value]) => {
          const attr = { key };
          if (typeof value === 'string') {
            attr.value = { stringValue: value };
          } else if (typeof value === 'number') {
            if (Number.isInteger(value)) {
              attr.value = { intValue: value };
            } else {
              attr.value = { doubleValue: value };
            }
          } else if (typeof value === 'boolean') {
            attr.value = { boolValue: value };
          }
          return attr;
        })
      })),
      droppedAttributesCount: 0,
      droppedEventsCount: 0,
      droppedLinksCount: 0
    };
  }

  /**
   * Shutdown the exporter
   */
  shutdown() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
  }
}
