/**
 * OpenTelemetry & W3C Trace Context Bridge Module
 *
 * Finault Enterprise Platform - Trace Context & Observability Integration
 *
 * Implements:
 * - W3C Trace Context (traceparent & tracestate) parsing and generation
 * - OpenTelemetry Logs Data Model export formatting
 * - OpenTelemetry Protocol (OTLP) batch formatting
 * - CloudEvents 1.0 envelope wrapping for audit events
 *
 * Compatible with Cloudflare Workers and CommonJS environments.
 * All functions are pure and side-effect free.
 *
 * @module otel-bridge
 */

const OTEL_VERSION = '1.0.0';

/**
 * Generates a random 32-character hexadecimal trace ID (16 bytes).
 * Compatible with W3C Trace Context specification.
 *
 * @returns {string} 32-char hex string representing 128-bit trace ID
 * @example
 * const traceId = generateTraceId();
 * // => "4bf92f3577b34da6a3ce929d0e0e4736"
 */
function generateTraceId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generates a random 16-character hexadecimal span ID (8 bytes).
 * Compatible with W3C Trace Context specification.
 *
 * @returns {string} 16-char hex string representing 64-bit span ID
 * @example
 * const spanId = generateSpanId();
 * // => "00f067aa0ba902b7"
 */
function generateSpanId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Parses a W3C traceparent header into its components.
 *
 * Format: `{version}-{traceId}-{parentSpanId}-{traceFlags}`
 * Example: `00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`
 *
 * @param {string} header - The traceparent header value
 * @returns {?Object} Parsed traceparent object with structure:
 *   - {string} version - Version identifier (typically "00")
 *   - {string} traceId - 32-char hex trace ID
 *   - {string} parentSpanId - 16-char hex span ID of parent
 *   - {string} traceFlags - 2-char hex trace flags (trace bit)
 *   - {boolean} valid - Whether the header was valid
 * @returns {null} If header format is invalid
 *
 * @example
 * const ctx = parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
 * // => { version: '00', traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
 * //      parentSpanId: '00f067aa0ba902b7', traceFlags: '01', valid: true }
 */
function parseTraceparent(header) {
  if (!header || typeof header !== 'string') {
    return null;
  }

  const parts = header.trim().split('-');
  if (parts.length !== 4) {
    return null;
  }

  const [version, traceId, parentSpanId, traceFlags] = parts;

  // Validate format
  if (
    version.length !== 2 ||
    traceId.length !== 32 ||
    parentSpanId.length !== 16 ||
    traceFlags.length !== 2
  ) {
    return null;
  }

  // Validate hex characters
  const hexRegex = /^[0-9a-f]+$/i;
  if (!hexRegex.test(traceId) || !hexRegex.test(parentSpanId) || !hexRegex.test(traceFlags)) {
    return null;
  }

  // Validate trace ID is not all zeros
  if (traceId === '00000000000000000000000000000000') {
    return null;
  }

  // Validate parent span ID is not all zeros
  if (parentSpanId === '0000000000000000') {
    return null;
  }

  return {
    version,
    traceId,
    parentSpanId,
    traceFlags,
    valid: true,
  };
}

/**
 * Creates a W3C traceparent header string.
 *
 * Format: `00-{traceId}-{spanId}-{sampled ? '01' : '00'}`
 *
 * @param {string} traceId - 32-char hex trace ID
 * @param {string} spanId - 16-char hex span ID
 * @param {boolean} sampled - Whether this trace should be sampled (trace flags)
 * @returns {string} Properly formatted traceparent header value
 *
 * @example
 * const header = createTraceparent(
 *   '4bf92f3577b34da6a3ce929d0e0e4736',
 *   '00f067aa0ba902b7',
 *   true
 * );
 * // => "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
 */
function createTraceparent(traceId, spanId, sampled) {
  const traceFlags = sampled ? '01' : '00';
  return `00-${traceId}-${spanId}-${traceFlags}`;
}

/**
 * Parses a W3C tracestate header into key-value pairs.
 *
 * Format: `vendor1=value1,vendor2=value2`
 * Vendors are separated by commas; key-value pairs use equals sign.
 *
 * @param {string} header - The tracestate header value
 * @returns {Object} Object mapping vendor names to their values
 *
 * @example
 * const state = parseTracestate('finault=req_abc123,other=val');
 * // => { finault: 'req_abc123', other: 'val' }
 */
function parseTracestate(header) {
  const entries = {};

  if (!header || typeof header !== 'string') {
    return entries;
  }

  const pairs = header.split(',');
  for (const pair of pairs) {
    const [key, ...valueParts] = pair.trim().split('=');
    if (key && valueParts.length > 0) {
      entries[key] = valueParts.join('=');
    }
  }

  return entries;
}

/**
 * Creates a W3C tracestate header from key-value entries.
 *
 * @param {Array} entries - Array of { key, value } objects or array of [key, value] tuples
 * @returns {string} Formatted tracestate header value
 *
 * @example
 * const header = createTracestate([
 *   { key: 'finault', value: 'req_abc123' },
 *   { key: 'other', value: 'val' }
 * ]);
 * // => "finault=req_abc123,other=val"
 */
function createTracestate(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return '';
  }

  return entries
    .map(entry => {
      if (Array.isArray(entry)) {
        return `${entry[0]}=${entry[1]}`;
      }
      return `${entry.key}=${entry.value}`;
    })
    .join(',');
}

/**
 * TraceContext Class
 *
 * Manages W3C Trace Context propagation for a single request-response cycle.
 * Extracts trace context from inbound headers and generates new span IDs
 * for downstream propagation.
 *
 * @class TraceContext
 */
class TraceContext {
  /**
   * Creates a new TraceContext from inbound request headers.
   *
   * If valid traceparent header is present, extracts trace ID and parent span ID.
   * Otherwise, generates new trace ID. Always generates a new span ID for this hop.
   *
   * @param {Object} inboundHeaders - Request headers object (case-insensitive)
   * @param {string} [inboundHeaders.traceparent] - W3C traceparent header
   * @param {string} [inboundHeaders.tracestate] - W3C tracestate header
   *
   * @example
   * const ctx = new TraceContext({
   *   traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
   *   tracestate: 'finault=req_123'
   * });
   */
  constructor(inboundHeaders = {}) {
    const headers = this._normalizeHeaders(inboundHeaders);

    const traceparent = headers.traceparent ? parseTraceparent(headers.traceparent) : null;

    if (traceparent && traceparent.valid) {
      this.traceId = traceparent.traceId;
      this.parentSpanId = traceparent.parentSpanId;
      this.sampled = traceparent.traceFlags === '01';
    } else {
      this.traceId = generateTraceId();
      this.parentSpanId = null;
      this.sampled = true; // Default to sampled
    }

    this.spanId = generateSpanId();
    this.tracestate = headers.tracestate ? parseTracestate(headers.tracestate) : {};
  }

  /**
   * Normalizes header keys to lowercase for case-insensitive access.
   *
   * @private
   * @param {Object} headers - Original headers object
   * @returns {Object} Headers with lowercase keys
   */
  _normalizeHeaders(headers) {
    const normalized = {};
    for (const key in headers) {
      if (Object.prototype.hasOwnProperty.call(headers, key)) {
        normalized[key.toLowerCase()] = headers[key];
      }
    }
    return normalized;
  }

  /**
   * Gets headers to propagate to upstream provider requests.
   *
   * Returns traceparent with current span ID and tracestate updated with
   * Finault-specific metadata (request ID).
   *
   * @param {string} [requestId] - Optional request ID to include in tracestate
   * @returns {Object} Headers object with traceparent and tracestate
   *
   * @example
   * const headers = ctx.getOutboundHeaders('req_abc123');
   * // => {
   * //   traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-<new-span-id>-01',
   * //   tracestate: 'finault=req_abc123'
   * // }
   */
  getOutboundHeaders(requestId) {
    const headers = {
      traceparent: createTraceparent(this.traceId, this.spanId, this.sampled),
    };

    const tracestate = { ...this.tracestate };
    if (requestId) {
      tracestate.finault = `req_${requestId}`;
    }

    const tracestateHeader = createTracestate(
      Object.entries(tracestate).map(([key, value]) => ({ key, value }))
    );

    if (tracestateHeader) {
      headers.tracestate = tracestateHeader;
    }

    return headers;
  }

  /**
   * Gets headers to propagate to client responses.
   *
   * Returns traceparent and X-Request-Id header for backward compatibility.
   *
   * @param {string} requestId - Request ID for X-Request-Id header
   * @returns {Object} Headers object with traceparent and X-Request-Id
   *
   * @example
   * const headers = ctx.getResponseHeaders('req_abc123');
   * // => {
   * //   traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-<span-id>-01',
   * //   'X-Request-Id': 'req_abc123'
   * // }
   */
  getResponseHeaders(requestId) {
    const headers = {
      traceparent: createTraceparent(this.traceId, this.spanId, this.sampled),
      'X-Request-Id': requestId,
    };

    const tracestate = createTracestate(
      Object.entries(this.tracestate).map(([key, value]) => ({ key, value }))
    );

    if (tracestate) {
      headers.tracestate = tracestate;
    }

    return headers;
  }

  /**
   * Converts trace context to usage metadata object for storage.
   *
   * @param {string} requestId - Request ID for context
   * @returns {Object} Metadata object with trace context information
   *
   * @example
   * const metadata = ctx.toUsageMetadata('req_abc123');
   * // => {
   * //   trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
   * //   span_id: '<new-span-id>',
   * //   parent_span_id: '00f067aa0ba902b7'
   * // }
   */
  toUsageMetadata(requestId) {
    const metadata = {
      trace_id: this.traceId,
      span_id: this.spanId,
    };

    if (this.parentSpanId) {
      metadata.parent_span_id = this.parentSpanId;
    }

    return metadata;
  }
}

/**
 * Converts a Finault usage record to OpenTelemetry Logs Data Model format.
 *
 * Maps Finault usage data to OTLP log record structure with standardized
 * attributes and resource information.
 *
 * @param {Object} usageRecord - Finault usage record object
 * @param {string} usageRecord.request_id - Unique request identifier
 * @param {string} usageRecord.trace_id - W3C trace ID (optional)
 * @param {string} usageRecord.span_id - OpenTelemetry span ID (optional)
 * @param {string} usageRecord.provider - AI provider name (e.g., 'openai')
 * @param {string} usageRecord.model - Model identifier
 * @param {number} [usageRecord.input_tokens] - Input token count
 * @param {number} [usageRecord.output_tokens] - Output token count
 * @param {number} [usageRecord.cost_cents] - Cost in cents
 * @param {string} [usageRecord.cost_center] - Cost center code
 * @param {string} [usageRecord.endpoint] - API endpoint path
 * @param {number} [usageRecord.status_code] - HTTP status code
 * @param {number} [usageRecord.latency_ms] - Request latency in milliseconds
 * @param {string} [usageRecord.timestamp] - ISO 8601 timestamp
 * @param {Object} [usageRecord.metadata] - Additional metadata
 *
 * @returns {Object} OTLP log record object with structure:
 *   - {string} Timestamp - Unix nanosecond timestamp
 *   - {string} TraceId - 16-byte trace ID (base64 encoded)
 *   - {string} SpanId - 8-byte span ID (base64 encoded)
 *   - {number} SeverityNumber - 9 (INFO level in OTLP)
 *   - {string} SeverityText - "INFO"
 *   - {string} Body - Human-readable log message
 *   - {Object} Attributes - Key-value pairs of log attributes
 *   - {Object} Resource - Resource identifying the service
 *
 * @example
 * const record = {
 *   request_id: 'req_123',
 *   trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
 *   span_id: '00f067aa0ba902b7',
 *   provider: 'openai',
 *   model: 'gpt-4',
 *   input_tokens: 150,
 *   output_tokens: 300,
 *   cost_cents: 45,
 *   latency_ms: 1200
 * };
 * const log = toOTLPLog(record);
 */
function toOTLPLog(usageRecord) {
  const timestamp = usageRecord.timestamp
    ? new Date(usageRecord.timestamp).getTime() * 1_000_000 // Convert to nanoseconds
    : Date.now() * 1_000_000;

  const attributes = {
    'finault.request_id': usageRecord.request_id,
    'gen_ai.provider': usageRecord.provider,
    'gen_ai.model': usageRecord.model,
  };

  // Add optional numeric attributes
  if (usageRecord.input_tokens !== undefined) {
    attributes['gen_ai.usage.input_tokens'] = usageRecord.input_tokens;
  }
  if (usageRecord.output_tokens !== undefined) {
    attributes['gen_ai.usage.output_tokens'] = usageRecord.output_tokens;
  }
  if (usageRecord.cost_cents !== undefined) {
    attributes['finault.cost_cents'] = usageRecord.cost_cents;
  }

  // Add optional string attributes
  if (usageRecord.cost_center) {
    attributes['finault.cost_center'] = usageRecord.cost_center;
  }
  if (usageRecord.endpoint) {
    attributes['http.url'] = usageRecord.endpoint;
  }
  if (usageRecord.status_code !== undefined) {
    attributes['http.status_code'] = usageRecord.status_code;
  }
  if (usageRecord.latency_ms !== undefined) {
    attributes['http.duration_ms'] = usageRecord.latency_ms;
  }

  // Add metadata as custom attributes
  if (usageRecord.metadata && typeof usageRecord.metadata === 'object') {
    for (const [key, value] of Object.entries(usageRecord.metadata)) {
      attributes[`finault.metadata.${key}`] = value;
    }
  }

  return {
    Timestamp: timestamp.toString(),
    TraceId: usageRecord.trace_id ? hexToBase64(usageRecord.trace_id) : '',
    SpanId: usageRecord.span_id ? hexToBase64(usageRecord.span_id) : '',
    SeverityNumber: 9, // INFO level
    SeverityText: 'INFO',
    Body: `API call to ${usageRecord.provider}/${usageRecord.model}`,
    Attributes: attributes,
    Resource: {
      'service.name': 'finault-gateway',
      'service.version': OTEL_VERSION,
    },
  };
}

/**
 * Converts array of Finault usage records to OTLP batch export format.
 *
 * Wraps records in the standardized OpenTelemetry Protocol (OTLP) JSON export
 * structure for batch transmission to observability backends.
 *
 * @param {Array<Object>} records - Array of usage record objects
 * @returns {Object} OTLP JSON batch structure:
 *   - {Array} resourceLogs - Array of resource log groups
 *     - {Object} resource - Resource attributes (service.name, service.version)
 *     - {Array} scopeLogs - Array of instrumentation scope log records
 *       - {Object} scope - Instrumentation scope (name, version)
 *       - {Array} logRecords - Array of individual log records
 *
 * @example
 * const records = [
 *   { request_id: 'req_1', provider: 'openai', ... },
 *   { request_id: 'req_2', provider: 'anthropic', ... }
 * ];
 * const batch = toOTLPBatch(records);
 * // Ready to POST to OpenTelemetry collector
 */
function toOTLPBatch(records) {
  const logRecords = records.map(record => toOTLPLog(record));

  return {
    resourceLogs: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'finault-gateway' } },
            { key: 'service.version', value: { stringValue: OTEL_VERSION } },
          ],
        },
        scopeLogs: [
          {
            scope: {
              name: 'finault-otel-bridge',
              version: OTEL_VERSION,
            },
            logRecords,
          },
        ],
      },
    ],
  };
}

/**
 * Converts an audit event to CloudEvents 1.0 envelope format.
 *
 * Wraps audit event data in the CloudEvents specification-compliant envelope,
 * providing standardized event metadata and allowing interoperability with
 * event-driven systems.
 *
 * @param {Object} auditEvent - Audit event object to wrap
 * @param {string} auditEvent.event_type - Type of audit event (e.g., 'access', 'modification')
 * @param {string} auditEvent.subject - Subject of the audit action
 * @param {string} [auditEvent.timestamp] - ISO 8601 timestamp (defaults to now)
 * @param {string} source - Source identifier for the CloudEvent (e.g., 'finault-gateway')
 *
 * @returns {Object} CloudEvents 1.0 envelope:
 *   - {string} specversion - CloudEvents spec version ("1.0")
 *   - {string} type - Event type ("ai.finault.{eventType}")
 *   - {string} source - Event source
 *   - {string} id - Unique event ID (UUID v4)
 *   - {string} time - ISO 8601 timestamp
 *   - {string} datacontenttype - Content type ("application/json")
 *   - {Object} data - The audit event object
 *
 * @example
 * const event = toCloudEvent(
 *   {
 *     event_type: 'access',
 *     subject: 'user_123',
 *     details: { resource: 'api_key' }
 *   },
 *   'finault-gateway'
 * );
 * // => {
 * //   specversion: '1.0',
 * //   type: 'ai.finault.access',
 * //   source: 'finault-gateway',
 * //   id: '<uuid>',
 * //   time: '<iso-timestamp>',
 * //   datacontenttype: 'application/json',
 * //   data: { event_type, subject, ... }
 * // }
 */
function toCloudEvent(auditEvent, source) {
  const timestamp = auditEvent.timestamp || new Date().toISOString();
  const eventId = generateUUID();
  const eventType = `ai.finault.${auditEvent.event_type || 'audit'}`;

  return {
    specversion: '1.0',
    type: eventType,
    source,
    id: eventId,
    time: timestamp,
    datacontenttype: 'application/json',
    data: auditEvent,
  };
}

/**
 * Converts array of audit events to CloudEvents 1.0 batch format.
 *
 * Wraps multiple audit events as CloudEvents and returns in a format
 * suitable for batch delivery to event subscribers.
 *
 * @param {Array<Object>} events - Array of audit event objects
 * @param {string} source - Source identifier for all CloudEvents
 *
 * @returns {Array<Object>} Array of CloudEvents 1.0 envelopes
 *
 * @example
 * const events = [
 *   { event_type: 'access', subject: 'user_123' },
 *   { event_type: 'modification', subject: 'config_456' }
 * ];
 * const batch = toCloudEventBatch(events, 'finault-gateway');
 * // Array of CloudEvents ready for delivery
 */
function toCloudEventBatch(events, source) {
  return events.map(event => toCloudEvent(event, source));
}

/**
 * Helper: Converts hexadecimal string to base64 encoding.
 *
 * Used to convert trace IDs and span IDs from hex format (W3C standard)
 * to base64 format (OTLP standard).
 *
 * @private
 * @param {string} hex - Hexadecimal string
 * @returns {string} Base64-encoded equivalent
 */
function hexToBase64(hex) {
  // Convert hex pairs to byte values
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(String.fromCharCode(parseInt(hex.substr(i, 2), 16)));
  }
  // Use btoa for base64 encoding (available in Workers)
  return btoa(bytes.join(''));
}

/**
 * Helper: Generates a UUID v4 string.
 *
 * Used for CloudEvents ID generation.
 *
 * @private
 * @returns {string} UUID v4 format string
 */
function generateUUID() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // Set version to 4
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // Set variant to RFC 4122
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

  return [
    hex.substr(0, 8),
    hex.substr(8, 4),
    hex.substr(12, 4),
    hex.substr(16, 4),
    hex.substr(20, 12),
  ].join('-');
}

/**
 * Creates a span object with OpenTelemetry attributes and structure.
 *
 * Initializes a span with trace context, unique span ID, and system attributes.
 * The span is ready to be populated with events and status information before
 * being exported via exportToOTLP.
 *
 * @param {string} traceId - 32-char hex trace ID
 * @param {string} parentSpanId - 16-char hex parent span ID (optional)
 * @param {string} operationName - Human-readable operation name (e.g., 'fetch_model_response')
 * @param {Object} [attributes={}] - Custom attributes to attach to span
 * @returns {Object} Span object with OpenTelemetry structure
 *
 * @example
 * const span = createSpan(
 *   '4bf92f3577b34da6a3ce929d0e0e4736',
 *   '00f067aa0ba902b7',
 *   'api_call',
 *   { 'db.system': 'postgresql' }
 * );
 */
function createSpan(traceId, parentSpanId, operationName, attributes = {}) {
  const spanId = generateSpanId();
  const startTimeNano = Date.now() * 1_000_000;
  return {
    traceId,
    spanId,
    parentSpanId: parentSpanId || '',
    operationName,
    startTimeUnixNano: startTimeNano.toString(),
    endTimeUnixNano: null, // Set when span ends
    status: { code: 0, message: '' }, // 0=UNSET, 1=OK, 2=ERROR
    attributes: {
      'service.name': 'finault-gateway',
      ...attributes,
    },
    events: [],
    kind: 1, // SPAN_KIND_SERVER=1, CLIENT=2, PRODUCER=3, CONSUMER=4
  };
}

/**
 * Completes a span by setting end time, status code, and duration.
 *
 * Must be called when span processing is complete. Sets the end timestamp,
 * status (OK/ERROR), and calculates duration in milliseconds.
 *
 * @param {Object} span - Span object created by createSpan
 * @param {number} [statusCode=1] - Status code: 0=UNSET, 1=OK, 2=ERROR
 * @param {string} [errorMessage=''] - Error description if status is ERROR
 * @returns {Object} Updated span object with end time and status
 *
 * @example
 * const span = createSpan(traceId, parentSpanId, 'operation');
 * // ... do work ...
 * const completedSpan = endSpan(span, 1); // OK
 */
function endSpan(span, statusCode = 1, errorMessage = '') {
  span.endTimeUnixNano = (Date.now() * 1_000_000).toString();
  span.status = {
    code: statusCode, // 0=UNSET, 1=OK, 2=ERROR
    message: errorMessage
  };
  span.attributes['http.status_code'] = statusCode === 2 ? 500 : 200;
  span.durationMs = (BigInt(span.endTimeUnixNano) - BigInt(span.startTimeUnixNano)) / 1_000_000n;
  return span;
}

/**
 * Converts an array of spans to OpenTelemetry Protocol (OTLP) batch format.
 *
 * Wraps spans in the standardized OTLP JSON structure for transmission to
 * OpenTelemetry collectors. Includes resource attributes and scope metadata.
 *
 * @param {Array<Object>} spans - Array of span objects created by createSpan
 * @returns {Object} OTLP-formatted batch structure ready for export
 *
 * @example
 * const batch = toOTLPSpanBatch([span1, span2]);
 * const result = await exportToOTLP('http://collector:4318', batch);
 */
function toOTLPSpanBatch(spans) {
  return {
    resourceSpans: [{
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: 'finault-gateway' } },
          { key: 'service.version', value: { stringValue: OTEL_VERSION } },
          { key: 'telemetry.sdk.name', value: { stringValue: 'finault-otel-bridge' } },
          { key: 'telemetry.sdk.language', value: { stringValue: 'javascript' } },
        ],
      },
      scopeSpans: [{
        scope: { name: 'finault-otel-bridge', version: OTEL_VERSION },
        spans: spans.map(span => ({
          traceId: span.traceId,
          spanId: span.spanId,
          parentSpanId: span.parentSpanId,
          name: span.operationName,
          kind: span.kind,
          startTimeUnixNano: span.startTimeUnixNano,
          endTimeUnixNano: span.endTimeUnixNano,
          status: span.status,
          attributes: Object.entries(span.attributes).map(([key, value]) => ({
            key,
            value: typeof value === 'number' ? { intValue: value } : { stringValue: String(value) },
          })),
          events: span.events.map(e => ({
            timeUnixNano: e.timeUnixNano,
            name: e.name,
            attributes: Object.entries(e.attributes || {}).map(([k, v]) => ({
              key: k,
              value: { stringValue: String(v) },
            })),
          })),
        })),
      }],
    }],
  };
}

/**
 * Exports a batch of spans or logs to an OpenTelemetry Protocol (OTLP) collector.
 *
 * Performs HTTP POST to the specified OTLP collector endpoint. Automatically
 * detects batch type (spans vs logs) and routes to appropriate endpoint.
 * Includes comprehensive error handling.
 *
 * @param {string} endpoint - OTLP collector base URL (e.g., 'http://localhost:4318')
 * @param {Object} batch - OTLP batch object (from toOTLPSpanBatch or toOTLPBatch)
 * @param {Object} [headers={}] - Additional HTTP headers to include in request
 * @returns {Promise<Object>} Export result object with status and metadata:
 *   - {boolean} success - Whether export succeeded
 *   - {number} status - HTTP status code (0 on error)
 *   - {number} exported - Count of spans/logs sent
 *   - {string} endpoint - Full endpoint URL used
 *   - {string} error - Error message (if failed)
 *
 * @example
 * const result = await exportToOTLP(
 *   'http://localhost:4318',
 *   otlpBatch,
 *   { 'Authorization': 'Bearer token' }
 * );
 * if (result.success) {
 *   console.log(`Exported ${result.exported} spans`);
 * }
 */
async function exportToOTLP(endpoint, batch, headers = {}) {
  const isSpans = !!batch.resourceSpans;
  const path = isSpans ? '/v1/traces' : '/v1/logs';
  const url = endpoint.replace(/\/$/, '') + path;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(batch),
    });

    return {
      success: response.ok,
      status: response.status,
      exported: isSpans
        ? (batch.resourceSpans[0]?.scopeSpans[0]?.spans?.length || 0)
        : (batch.resourceLogs[0]?.scopeLogs[0]?.logRecords?.length || 0),
      endpoint: url,
    };
  } catch (error) {
    return {
      success: false,
      status: 0,
      error: error.message,
      endpoint: url,
    };
  }
}

/**
 * Wraps the global fetch function to automatically propagate trace context.
 *
 * Returns an instrumented fetch that adds W3C traceparent headers to all
 * outbound HTTP requests, enabling distributed tracing across service boundaries.
 *
 * @param {Function} originalFetch - The native fetch function to instrument
 * @param {Object} traceContext - TraceContext object with trace propagation info
 * @param {string} traceContext.traceId - Trace ID to propagate
 * @param {boolean} traceContext.sampled - Whether trace is sampled
 * @returns {Function} Instrumented fetch function with same signature as native fetch
 *
 * @example
 * const ctx = new TraceContext(inboundHeaders);
 * const instrumentedFetch = instrumentFetch(fetch, ctx);
 * // Now all fetch calls include traceparent header
 * await instrumentedFetch('https://api.example.com/data');
 */
function instrumentFetch(originalFetch, traceContext) {
  return async function instrumentedFetch(url, options = {}) {
    const childSpanId = generateSpanId();
    const outboundHeaders = {
      traceparent: createTraceparent(traceContext.traceId, childSpanId, traceContext.sampled),
    };

    // Merge trace headers into existing headers
    const mergedHeaders = {
      ...(options.headers || {}),
      ...outboundHeaders,
    };

    const startTime = Date.now();
    try {
      const response = await originalFetch(url, { ...options, headers: mergedHeaders });
      return response;
    } catch (error) {
      throw error;
    }
  };
}

// CommonJS exports
module.exports = {
  // Version
  OTEL_VERSION,

  // Trace ID and Span ID generation
  generateTraceId,
  generateSpanId,

  // W3C Traceparent parsing and creation
  parseTraceparent,
  createTraceparent,

  // W3C Tracestate parsing and creation
  parseTracestate,
  createTracestate,

  // TraceContext class
  TraceContext,

  // OpenTelemetry Logs Data Model conversion
  toOTLPLog,
  toOTLPBatch,

  // CloudEvents 1.0 envelope wrapping
  toCloudEvent,
  toCloudEventBatch,

  // Diamond tier: Span and OTLP export functions
  createSpan,
  endSpan,
  toOTLPSpanBatch,
  exportToOTLP,
  instrumentFetch,
};
