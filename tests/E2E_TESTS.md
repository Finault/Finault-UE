# Finault End-to-End Test Suite

A comprehensive end-to-end test suite for Finault's gateway API that covers all critical user journeys.

## Overview

The test suite (`e2e-test-suite.js`) is a pure Node.js implementation with no external dependencies. It tests the live gateway API against realistic user journeys that, if broken, would indicate the product is non-functional.

**Test Count:** 45+ individual tests across 12 journey suites
**Lines of Code:** 938 (e2e-test-suite.js)
**Duration:** Typically 10-30 seconds depending on API latency and rate limiting

## Quick Start

### Basic Usage

```bash
# Run all tests
node tests/e2e-test-suite.js

# Or use the wrapper script
./tests/run-e2e.sh

# With verbose output
node tests/e2e-test-suite.js --verbose

# Run specific journey
node tests/e2e-test-suite.js --filter=health
```

### Environment Variables

```bash
# Override API base URL (default: https://api.finault.ai)
export FINAULT_API_URL=https://api.staging.finault.ai

# Set test API key (default: fk_test_default)
export FINAULT_TEST_KEY=fk_test_your_key

# Run tests
node tests/e2e-test-suite.js --verbose
```

## Test Journeys

### Journey 1: Health & Discovery (5 tests)
Tests basic API health, versioning, and documentation availability.
- GET /v1/health returns 200
- Health response has status/version fields
- GET /v1/pricing returns model data
- GET /v1/docs handles documentation requests

### Journey 2: Anonymous Magic Onboarding (2 tests)
Tests document parsing without authentication.
- POST /v1/magic/parse accepts invoice data
- GET /v1/magic/status returns processing status

### Journey 3: Authentication Flow (3 tests)
Tests API key authentication security.
- Unauthenticated requests return 401
- Invalid keys return 401
- Valid test keys return appropriate response

### Journey 4: Gateway Proxy (Test Mode) (4 tests)
Tests the core chat completion proxy functionality.
- Chat completions endpoint accepts requests
- Responses include X-Finault-Request-Id header
- Responses include X-Finault-Cost-Dollars header
- Streaming mode works correctly

### Journey 5: Dashboard Data (3 tests)
Tests dashboard metrics and analytics endpoints.
- GET /v1/dashboard/overview returns dashboard data
- GET /v1/dashboard/drill-down handles dimension filters
- GET /v1/dashboard/insights returns insights

### Journey 6: Budget Lifecycle (4 tests)
Tests budget creation, querying, validation, and deletion.
- POST /v1/budgets creates budget
- GET /v1/budgets lists budgets
- POST /v1/budgets/{id}/check validates budget
- DELETE /v1/budgets/{id} removes budget

### Journey 7: API Key Lifecycle (3 tests)
Tests API key management (create, list, revoke).
- POST /v1/keys creates API key
- GET /v1/keys lists keys
- DELETE /v1/keys/{id} revokes key

### Journey 8: Close Pack Generation (2 tests)
Tests financial close pack generation.
- POST /v1/closepack/generate accepts period parameter
- Response includes required close pack fields

### Journey 9: Anomaly Detection (3 tests)
Tests anomaly detection and acknowledgment.
- GET /v1/anomalies returns anomaly list
- GET /v1/anomalies with filters handles query params
- POST /v1/anomalies/{id}/acknowledge endpoint exists

### Journey 10: Rate Limiting (2 tests)
Tests rate limiting behavior and headers.
- Rapid requests trigger 429 rate limit responses
- Rate limit responses include Retry-After header

### Journey 11: Security Headers (4 tests)
Tests security headers and PII protection.
- Response includes Content-Type header
- X-Content-Type-Options header present
- CORS headers properly configured
- PII not leaked in error responses

### Journey 12: Concurrent Resilience (3 tests)
Tests system behavior under concurrent load.
- 20 concurrent health checks complete successfully
- Response times remain reasonable under load
- 5 concurrent chat requests handled properly

## Output Format

```
╔══════════════════════════════════════════════════════╗
║  FINAULT END-TO-END TEST SUITE                       ║
║  Target: https://api.finault.ai                      ║
║  Date: 2026-02-26                                    ║
╚══════════════════════════════════════════════════════╝

Journey 1: Health & Discovery
  ✓ GET /v1/health returns 200 (124ms)
  ✓ Health response has status field (45ms)
  ✓ GET /v1/pricing returns model data (89ms)
  ✗ GET /v1/docs returns documentation (404 - FAIL)

...

═══════════════════════════════════════════════════════
RESULTS: 45/48 passed | 3 failed | 0 skipped
Duration: 12.4s
═══════════════════════════════════════════════════════
```

## Exit Codes

- `0` - All tests passed
- `1` - One or more tests failed

## Features

### Smart Graceful Failures
Tests that depend on API keys or prior API calls gracefully skip if prerequisites are not met, with clear skip messages.

### No External Dependencies
Uses only Node.js built-ins:
- `assert` for test assertions
- `fetch` for HTTP requests (Node.js 18+)

### Flexible Filtering
Run specific journey suites with `--filter=pattern` to focus testing.

### Verbose Mode
`--verbose` flag shows detailed request/response information and full error messages.

### Concurrent Testing
Journey 12 tests system behavior under concurrent load with 20+ simultaneous requests.

### Timeout Protection
All requests have 30-second timeouts to prevent hanging.

## CI/CD Integration

Use `run-e2e.sh` for CI/CD pipelines:

```bash
#!/bin/bash
# In your CI pipeline
./tests/run-e2e.sh --verbose

# Exits with code 1 on failure, 0 on success
if [ $? -ne 0 ]; then
  echo "E2E tests failed"
  exit 1
fi
```

### GitHub Actions Example

```yaml
- name: Run E2E Tests
  env:
    FINAULT_API_URL: ${{ secrets.FINAULT_API_URL }}
    FINAULT_TEST_KEY: ${{ secrets.FINAULT_TEST_KEY }}
  run: |
    cd finault-monorepo
    ./tests/run-e2e.sh --verbose
```

## Troubleshooting

### Tests hang
Check that the API is responding. Use `curl -I https://api.finault.ai/v1/health`

### Many tests fail with 401
Verify your test API key is set correctly:
```bash
export FINAULT_TEST_KEY=fk_test_your_actual_key
node tests/e2e-test-suite.js --verbose
```

### Rate limiting causes failures
This is expected behavior in Journey 10. Run tests during off-peak hours or use `--filter=health` to test only core functionality.

### Network timeout errors
Increase timeout or run from an environment with better connectivity:
```bash
# Tests have 30s timeout by default, which can be modified in the script
```

## Adding New Journeys

To add a new journey, follow this pattern:

```javascript
async function journeyX_NameOfJourney() {
  await runJourney('Journey X: Name of Journey', [
    () => runTest('Test description', async () => {
      const res = await fetchAPI('GET', '/v1/endpoint', {
        key: TEST_KEY,
      });
      assert_status(res, 200, 'Should return 200');
    }),
    // More tests...
  ]);
}
```

Then add the journey call in the `main()` function.

## Implementation Notes

- Tests use `fetch` API (Node.js 18+ required)
- Response times are measured for each request
- PII redaction is verified in error messages
- Concurrent tests fire real simultaneous requests
- Rate limiting is tested but not required to succeed
- Tests are resilient to transient API failures

## Files

- **e2e-test-suite.js** - Main test suite (938 lines)
- **run-e2e.sh** - CI/CD wrapper script (66 lines)
- **E2E_TESTS.md** - This documentation

## Requirements

- Node.js 18.0.0 or higher (for native fetch support)
- Network connectivity to `https://api.finault.ai` (or configured API URL)
- Valid test API key for authenticated tests

## License

Part of Finault Enterprise Hardening project.
