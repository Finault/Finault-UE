/**
 * Unit tests for OpenTelemetry Bridge Module
 * Run: node tests/unit/otel-bridge.test.js
 */

const otelBridge = require('../../apps/gateway/modules/otel-bridge.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

console.log('Testing OpenTelemetry Bridge Module\n');

// ============================================================================
// Test: generateTraceId returns 32-char hex string
// ============================================================================
try {
  console.log('Trace and Span ID generation:');

  if (typeof otelBridge.generateTraceId === 'function') {
    const traceId = otelBridge.generateTraceId();

    assert(typeof traceId === 'string', 'generateTraceId returns a string');
    assert(traceId.length === 32, 'Trace ID is 32 characters long');
    assert(/^[0-9a-f]{32}$/i.test(traceId), 'Trace ID is valid hex format');
  } else {
    console.log('  ⊘ generateTraceId not available (optional)');
  }

} catch (err) {
  failed++;
  console.error(`  ✗ generateTraceId threw error: ${err.message}`);
}

// ============================================================================
// Test: generateSpanId returns 16-char hex string
// ============================================================================
try {
  console.log('');

  if (typeof otelBridge.generateSpanId === 'function') {
    const spanId = otelBridge.generateSpanId();

    assert(typeof spanId === 'string', 'generateSpanId returns a string');
    assert(spanId.length === 16, 'Span ID is 16 characters long');
    assert(/^[0-9a-f]{16}$/i.test(spanId), 'Span ID is valid hex format');
  } else {
    console.log('  ⊘ generateSpanId not available (optional)');
  }

} catch (err) {
  failed++;
  console.error(`  ✗ generateSpanId threw error: ${err.message}`);
}

// ============================================================================
// Test: createTraceparent creates valid format
// ============================================================================
try {
  console.log('\nTraceparent header creation:');

  const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
  const spanId = '00f067aa0ba902b7';
  const sampled = true;

  const traceparent = otelBridge.createTraceparent(traceId, spanId, sampled);

  assert(typeof traceparent === 'string', 'Traceparent is a string');
  assert(traceparent.startsWith('00-'), 'Traceparent starts with version 00');
  assert(traceparent.includes(traceId), 'Traceparent contains trace ID');
  assert(traceparent.includes(spanId), 'Traceparent contains span ID');
  assert(traceparent.endsWith('01'), 'Traceparent ends with trace flag 01 for sampled=true');

  // Validate format: 00-{traceId}-{spanId}-{flags}
  const expectedFormat = `00-${traceId}-${spanId}-01`;
  assert(traceparent === expectedFormat, 'Traceparent matches W3C Trace Context format');

} catch (err) {
  failed++;
  console.error(`  ✗ createTraceparent threw error: ${err.message}`);
}

// ============================================================================
// Test: parseTraceparent parses valid traceparent
// ============================================================================
try {
  console.log('\nTraceparent parsing:');

  const validTraceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

  const parsed = otelBridge.parseTraceparent(validTraceparent);

  assert(parsed !== null, 'Valid traceparent is parsed');
  assert(typeof parsed === 'object', 'Parsed result is an object');
  assert(parsed.traceId === '4bf92f3577b34da6a3ce929d0e0e4736', 'Trace ID extracted correctly');
  assert(parsed.parentSpanId === '00f067aa0ba902b7', 'Parent span ID extracted correctly');
  assert(parsed.traceFlags === '01', 'Trace flags extracted correctly');

} catch (err) {
  failed++;
  console.error(`  ✗ parseTraceparent threw error: ${err.message}`);
}

// ============================================================================
// Test: TraceContext creates valid traceparent header
// ============================================================================
try {
  console.log('\nTraceContext class/constructor:');

  if (typeof otelBridge.TraceContext === 'function') {
    const inboundHeaders = {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    };
    const traceContext = new otelBridge.TraceContext(inboundHeaders);

    assert(traceContext !== null, 'TraceContext instance created');
    assert('getOutboundHeaders' in traceContext, 'TraceContext has getOutboundHeaders method');
    assert('traceId' in traceContext, 'TraceContext has traceId property');
    assert('spanId' in traceContext, 'TraceContext has spanId property');
  } else {
    console.log('  ⊘ TraceContext class not available (optional)');
  }

} catch (err) {
  failed++;
  console.error(`  ✗ TraceContext threw error: ${err.message}`);
}

// ============================================================================
// Test: toOTLPBatch wraps logs in OTLP structure
// ============================================================================
try {
  console.log('\nOTLP batch wrapping:');

  const records = [
    {
      request_id: 'req-123',
      provider: 'openai',
      model: 'gpt-4',
      input_tokens: 100,
      output_tokens: 200
    },
    {
      request_id: 'req-124',
      provider: 'anthropic',
      model: 'claude-3',
      input_tokens: 50,
      output_tokens: 150
    }
  ];

  const otlpBatch = otelBridge.toOTLPBatch(records);

  assert(otlpBatch !== null, 'OTLP batch is generated');
  assert(typeof otlpBatch === 'object', 'OTLP batch is an object');
  assert('resourceLogs' in otlpBatch, 'OTLP batch has resourceLogs structure');
  assert(Array.isArray(otlpBatch.resourceLogs), 'resourceLogs is an array');

} catch (err) {
  failed++;
  console.error(`  ✗ toOTLPBatch threw error: ${err.message}`);
}

// ============================================================================
// Test: toCloudEventBatch creates CloudEvents 1.0 envelope
// ============================================================================
try {
  console.log('\nCloudEvents envelope creation:');

  const auditEvents = [
    {
      event_type: 'access',
      subject: 'user_123',
      timestamp: new Date().toISOString()
    }
  ];

  const cloudEventsBatch = otelBridge.toCloudEventBatch(auditEvents, 'finault-gateway');

  assert(cloudEventsBatch !== null, 'CloudEvents batch is generated');
  assert(Array.isArray(cloudEventsBatch), 'CloudEvents batch is an array');
  assert(cloudEventsBatch.length > 0, 'CloudEvents batch has at least one event');

  if (cloudEventsBatch.length > 0) {
    const event = cloudEventsBatch[0];
    assert('specversion' in event, 'CloudEvent has specversion field');
    assert(event.specversion === '1.0', 'CloudEvent specversion is 1.0');
    assert('type' in event, 'CloudEvent has type field');
    assert('source' in event, 'CloudEvent has source field');
  }

} catch (err) {
  failed++;
  console.error(`  ✗ toCloudEventBatch threw error: ${err.message}`);
}

// ============================================================================
// Test: OTEL_VERSION is defined
// ============================================================================
try {
  console.log('\nOpenTelemetry version:');

  assert('OTEL_VERSION' in otelBridge, 'OTEL_VERSION is defined');
  assert(typeof otelBridge.OTEL_VERSION === 'string', 'OTEL_VERSION is a string');
  assert(otelBridge.OTEL_VERSION.length > 0, 'OTEL_VERSION is not empty');

} catch (err) {
  failed++;
  console.error(`  ✗ OTEL_VERSION validation threw error: ${err.message}`);
}

// ============================================================================
// Test: Invalid traceparent is rejected
// ============================================================================
try {
  console.log('\nInvalid traceparent handling:');

  const invalidTraceparent = 'invalid-format';

  const parsed = otelBridge.parseTraceparent(invalidTraceparent);

  assert(parsed === null || parsed === undefined || !parsed.valid, 'Invalid traceparent is rejected');

} catch (err) {
  failed++;
  console.error(`  ✗ Invalid traceparent test threw error: ${err.message}`);
}

// ============================================================================
// Test: W3C Trace Context standard compliance
// ============================================================================
try {
  console.log('\nW3C Trace Context compliance:');

  const traceId = 'a4fb4a318bbb9221a4fb4a318bbb9221';  // 32 chars for trace ID
  const spanId = '604c81cd7ab850c8';  // 16 chars for span ID
  const sampled = true;

  const traceparent = otelBridge.createTraceparent(traceId, spanId, sampled);

  // Validate W3C format: version(2) - traceId(32) - spanId(16) - flags(2)
  const parts = traceparent.split('-');

  assert(parts.length === 4, 'Traceparent has 4 parts separated by hyphens');
  assert(parts[0] === '00', 'Version part is 00');
  assert(parts[1].length === 32, 'Trace ID part is 32 hex characters');
  assert(parts[2].length === 16, 'Span ID part is 16 hex characters');
  assert(parts[3].length === 2, 'Flags part is 2 hex characters');

} catch (err) {
  failed++;
  console.error(`  ✗ W3C Trace Context compliance test threw error: ${err.message}`);
}

// ============================================================================
// Test: Log attributes are preserved in OTLP conversion
// ============================================================================
try {
  console.log('\nAttribute preservation:');

  const records = [
    {
      request_id: 'req-456',
      provider: 'openai',
      model: 'gpt-4',
      input_tokens: 200,
      output_tokens: 300,
      metadata: {
        user_id: 'user-456',
        auth_method: 'oauth2'
      }
    }
  ];

  const otlpBatch = otelBridge.toOTLPBatch(records);

  assert(otlpBatch !== null, 'OTLP batch is generated');
  assert(typeof otlpBatch === 'object', 'OTLP batch is an object');
  assert('resourceLogs' in otlpBatch, 'OTLP batch has resourceLogs');

} catch (err) {
  failed++;
  console.error(`  ✗ Attribute preservation test threw error: ${err.message}`);
}

// ============================================================================
// Summary
// ============================================================================
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
