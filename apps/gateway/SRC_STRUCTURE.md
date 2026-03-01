# Finault Gateway - Modularized Source Structure

## Overview

This document describes the new modularized source structure for the Finault Gateway. The gateway has been refactored from a monolithic `gateway-wired.js` (17,975 lines) into a clean, maintainable module architecture.

**Key Benefits:**
- **Maintainability**: Each module has a single responsibility
- **Testability**: Modules can be tested in isolation
- **Scalability**: Easy to add new handlers and features
- **Readability**: Clear separation of concerns
- **Build Process**: Automatic bundling via esbuild

## Directory Structure

```
apps/gateway/
├── src/                           # Source code (gets bundled)
│   ├── index.js                   # Main entry point & fetch handler
│   ├── config.js                  # Configuration & constants
│   ├── auth.js                    # Authentication (JWT, API keys)
│   ├── router.js                  # Route dispatch
│   ├── proxy.js                   # LLM provider proxying
│   ├── utils.js                   # Shared utilities
│   ├── security.js                # Security utilities (CORS, PII, etc)
│   └── handlers/                  # Request handlers for features
│       ├── dashboard.js           # Analytics & dashboard endpoints
│       ├── budget.js              # Budget management endpoints
│       ├── closepack.js           # Close Pack generation
│       ├── erp.js                 # ERP integration endpoints
│       ├── keys.js                # API key management
│       ├── savings.js             # Cost optimization & savings
│       ├── anomaly.js             # Anomaly detection endpoints
│       └── magic.js               # Magic onboarding endpoints
│
├── scripts/                       # Build & deployment scripts
│   ├── build.js                   # esbuild bundler script
│   └── test-and-deploy.sh         # CI/CD pipeline script
│
├── gateway-wired.js               # ⚠️ AUTO-GENERATED - Do not edit!
├── wrangler.toml                  # Cloudflare Worker config
├── package.json                   # Dependencies
└── SRC_STRUCTURE.md              # This file
```

## Module Reference

### Core Modules

#### `src/index.js` - Main Entry Point
The primary fetch handler for Cloudflare Workers. Orchestrates:
- Request authentication
- Route dispatch
- Response formatting
- Security headers

**Key Exports:**
- `handleFetch(request, env, ctx)` - Main fetch handler
- `initializeGateway(env)` - Initialize on first request
- `addSecurityHeaders(response, origin)` - Add security headers

**Usage:**
```javascript
export default {
  async fetch(request, env, ctx) {
    return handleFetch(request, env, ctx);
  }
};
```

#### `src/config.js` - Configuration & Constants
Centralized configuration management. Contains:
- Version info
- LLM pricing models (OpenAI, Anthropic, Google, Azure, Bedrock)
- Error codes & definitions
- Feature flags
- Provider configuration

**Key Exports:**
- `VERSION` - Current gateway version
- `MODEL_PRICING` - LLM provider pricing
- `ERROR_CODES` - Standard error definitions
- `getConfig(env)` - Get full config object

**LLM Pricing Example:**
```javascript
const cost = calculateCost(
  'openai',
  'gpt-4',
  inputTokens,
  outputTokens
); // Returns USD cost
```

#### `src/auth.js` - Authentication
Handles all authentication flows:
- JWT token validation
- API key authentication (fk_* format)
- Service role verification
- Public endpoint detection

**Key Exports:**
- `authenticateRequest(request, jwtSecret, env)` - Main auth handler
- `isPublicEndpoint(path)` - Check if endpoint is public
- `getOrgIdFromAuth(request)` - Extract org ID from JWT
- `verifyJWT(token, secret)` - JWT verification
- `authenticateWithAPIKey(apiKey, env)` - API key validation

**Authentication Example:**
```javascript
try {
  await authenticateRequest(request, env.JWT_SECRET, env);
  const orgId = getOrgIdFromAuth(request); // JWT payload now in request._user
} catch (error) {
  return errorResponse('AUTH_INVALID', error.message);
}
```

#### `src/router.js` - Route Dispatcher
Central routing logic that maps URL patterns to handlers.

**Key Exports:**
- `routeRequest(path, method, request, env, ctx, handlers)` - Main router
- `routeTable` - Array of route definitions
- `findRoute(path, method)` - Find matching route
- `matchRoute(path, pattern)` - Match path against pattern

**Route Definition Example:**
```javascript
const routeTable = [
  {
    pattern: '/v1/budgets/:id',
    methods: ['GET', 'PUT', 'DELETE'],
    handler: 'handleBudgetById'
  }
];
```

#### `src/proxy.js` - LLM Provider Proxying
Routes requests to multiple LLM providers with intelligent routing and failover.

**Supported Providers:**
- OpenAI (GPT-4, GPT-3.5-turbo)
- Anthropic (Claude)
- Google (Gemini)
- Azure OpenAI
- AWS Bedrock

**Key Exports:**
- `proxyOpenAI(payload, apiKey, options)` - OpenAI proxy
- `proxyAnthropic(payload, apiKey, options)` - Anthropic proxy
- `intelligentRoute(request, env)` - Route based on model/preference
- `proxyWithFailover(payload, primary, fallbacks, env)` - Failover logic
- `circuitBreakers` - Circuit breaker instances per provider

**Intelligent Routing Example:**
```javascript
const provider = intelligentRoute(request, env);
// Routes gpt-4 → openai, claude → anthropic, etc.
```

#### `src/utils.js` - Shared Utilities
Common functions used across handlers:
- Response formatting
- Safe fetch with retries
- JSON parsing
- Cost calculation
- Parameter sanitization

**Key Exports:**
- `jsonResponse(data, status, headers)` - Format JSON response
- `errorResponse(errorCode, message, details)` - Format error response
- `safeFetch(url, options, retryConfig)` - Fetch with retry logic
- `calculateCost(provider, model, inputTokens, outputTokens)` - Calculate cost
- `sanitizeQueryParam(param, options)` - Sanitize query parameters

**Usage Example:**
```javascript
const response = jsonResponse({ data: {...} }, 200);
const error = errorResponse('INVALID_REQUEST', 'Missing field');
const cost = calculateCost('openai', 'gpt-4', 1000, 250); // Returns USD
```

#### `src/security.js` - Security Utilities
Security-focused utilities:
- CORS header management
- PII redaction
- Security event logging
- Circuit breaker pattern
- Security headers

**Key Exports:**
- `getCORSHeaders(origin, options)` - Get CORS headers
- `handleCORS(request)` - Handle CORS preflight
- `redactPII(data, patterns)` - Redact PII from strings
- `redactPIIFromObject(obj, piiFields)` - Redact PII from objects
- `logSecurityEvent(type, details, severity)` - Log security events
- `CircuitBreaker` - Circuit breaker class
- `getSecurityHeaders()` - Get security headers

**PII Redaction Example:**
```javascript
const redacted = redactPII(logMessage); // Hides emails, API keys, SSNs, etc
const redactedObj = redactPIIFromObject(request.body, ['password', 'token']);
```

### Handler Modules

Each handler module exports functions for specific endpoints. Pattern:

```javascript
// src/handlers/feature.js
export const handleFeatureAction = async (request, env, ctx) => {
  const orgId = getOrgIdFromAuth(request);
  // ... handler logic
  return jsonResponse(response);
};
```

#### `src/handlers/dashboard.js` - Analytics & Dashboard
Analytics endpoints for spend visualization and insights.

**Exported Handlers:**
- `handleDashboard()` - Dashboard overview
- `handleDrillDown()` - Spend breakdown by dimension
- `handleBenchmarks()` - Industry benchmarking
- `handleInsights()` - Generated insights
- `handleWhatIf()` - Scenario analysis
- `handleMoneyMachine()` - Automated optimization
- `handleGoals()` - Goal tracking
- `handleAlerts()` - Alert management

**Endpoints:**
```
GET  /v1/analytics/dashboard        Dashboard overview
GET  /v1/analytics/drill-down        Drill-down analysis
GET  /v1/analytics/benchmarks        Benchmark comparison
GET  /v1/analytics/insights          AI-generated insights
POST /v1/analytics/what-if           Scenario analysis
```

#### `src/handlers/budget.js` - Budget Management
Budget CRUD and control.

**Exported Handlers:**
- `handleBudgetList()` - List/create budgets
- `handleBudgetById()` - Get/update/delete budget
- `handleBudgetCheck()` - Check if request within budget
- `handleBudgetForecast()` - Forecast spend
- `handleBudgetAllocation()` - Budget allocation rules

**Endpoints:**
```
GET/POST  /v1/budgets              List/create budgets
GET/PUT   /v1/budgets/:id          Get/update budget
DELETE    /v1/budgets/:id          Delete budget
POST      /v1/budgets/:id/check    Check budget limit
GET       /v1/budgets/:id/forecast Forecast spend
```

#### `src/handlers/closepack.js` - Close Pack Generation
CFO-ready financial close reports.

**Exported Handlers:**
- `handleClosePackGenerate()` - Generate report
- `handleClosePackEmail()` - Email report
- `handleClosePackValidate()` - Validate data
- `handleClosePackDownload()` - Download in various formats
- `handleClosePackList()` - List history

**Endpoints:**
```
POST /v1/closepack/generate    Generate Close Pack
POST /v1/closepack/email       Email Close Pack
POST /v1/closepack/validate    Validate Close Pack
GET  /v1/closepack/download    Download Close Pack
```

#### `src/handlers/erp.js` - ERP Integrations
ERP system connectivity and data sync.

**Exported Handlers:**
- `handleERPConnect()` - Connect to ERP system
- `handleERPPush()` - Push data to ERP
- `handleERPVariance()` - Variance analysis
- `handleERPReconcile()` - Reconciliation
- `handleERPStatus()` - Sync status

**Endpoints:**
```
POST /v1/erp/connect        Connect to ERP
POST /v1/erp/push           Push data to ERP
GET  /v1/erp/variance       Variance analysis
POST /v1/erp/reconcile      Reconciliation
```

#### `src/handlers/keys.js` - API Key Management
API key lifecycle (CRUD, rotation, usage tracking).

**Exported Handlers:**
- `handleAPIKeysList()` - List/create keys
- `handleAPIKeyById()` - Get/revoke key
- `handleAPIKeyRotate()` - Rotate key
- `handleAPIKeyUsage()` - Usage metrics

**Endpoints:**
```
GET/POST /v1/keys           List/create API keys
GET      /v1/keys/:id       Get key details
DELETE   /v1/keys/:id       Revoke key
POST     /v1/keys/:id/rotate Rotate key
```

#### `src/handlers/savings.js` - Cost Optimization
Savings analysis and recommendations.

**Exported Handlers:**
- `handleSavingsAnalyze()` - Analyze spend for opportunities
- `handleSavingsRecommend()` - Get recommendations
- `handleSavingsImplement()` - Apply recommendation
- `handleSavingsROI()` - Calculate ROI of past optimizations
- `handleModelRecommendation()` - Model recommendation

**Endpoints:**
```
POST /v1/savings/analyze      Find savings opportunities
GET  /v1/savings/recommend    Get recommendations
POST /v1/savings/implement    Apply recommendation
GET  /v1/savings/roi          Calculate ROI
```

#### `src/handlers/anomaly.js` - Anomaly Detection
Statistical anomaly detection for spend and error rates.

**Exported Handlers:**
- `handleAnomalyDetect()` - Run detection
- `handleAnomaliesList()` - List anomalies
- `handleAnomalyAck()` - Acknowledge anomaly
- `handleAnomalyConfig()` - Configure detection
- `handleAnomalyDetail()` - Get anomaly details

**Endpoints:**
```
POST /v1/anomalies/detect      Run detection
GET  /v1/anomalies             List anomalies
POST /v1/anomalies/:id/ack     Acknowledge
GET  /v1/anomalies/:id         Get details
```

#### `src/handlers/magic.js` - Magic Onboarding
Upload-before-signup onboarding.

**Exported Handlers:**
- `handleMagicOnboarding()` - Accept file upload
- `handleMagicParse()` - Parse uploaded file
- `handleMagicComplete()` - Complete onboarding
- `handleMagicStatus()` - Check status
- `handleMagicList()` - List onboarding sessions

**Endpoints:**
```
POST /v1/magic/onboard    Upload file
POST /v1/magic/parse      Parse file
POST /v1/magic/complete   Create organization
GET  /v1/magic/status     Check status
```

## Build Process

### Bundling

The build process uses **esbuild** to bundle all source files into a single `gateway-wired.js`:

```bash
# Build the gateway
npm run build

# Or manually:
node apps/gateway/scripts/build.js
```

**What happens:**
1. esbuild reads `src/index.js`
2. Follows all imports recursively
3. Bundles into single ES2022 module
4. Minifies for production
5. Outputs to `gateway-wired.js`

**Build output:**
```
=══════════════════════════════════════════════════════════════════
Build Summary
=══════════════════════════════════════════════════════════════════

Output file:       apps/gateway/gateway-wired.js
Bundle size:       ~450 KB
Gzipped size:      ~135 KB (estimated)
Source modules:    13
Build time:        14:23:45

✓ Build completed successfully!
```

### CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/gateway-ci.yml`) automates:

1. **Lint** - Syntax validation
2. **Test** - Run test suite
3. **Build** - Bundle with esbuild
4. **Security** - Check for secrets, audit dependencies
5. **Deploy** - Deploy to Cloudflare Workers (main branch only)
6. **Performance** - Check bundle size limits

**Manual CI/CD:**
```bash
# Run local CI/CD pipeline
./apps/gateway/scripts/test-and-deploy.sh

# Build and deploy
./apps/gateway/scripts/test-and-deploy.sh --deploy
```

## Adding New Features

### Adding a New Handler

1. **Create handler file** in `src/handlers/`:
```javascript
// src/handlers/reporting.js
import { jsonResponse, errorResponse } from '../utils.js';
import { getOrgIdFromAuth } from '../auth.js';

export const handleReportGenerate = async (request, env, ctx) => {
  const orgId = getOrgIdFromAuth(request);
  // ... logic
  return jsonResponse({ reportId: '...', status: 'generated' });
};
```

2. **Add routes** in `src/router.js`:
```javascript
const routeTable = [
  {
    pattern: '/v1/reports/generate',
    methods: ['POST'],
    handler: 'handleReportGenerate'
  }
];
```

3. **Register handler** in `src/index.js`:
```javascript
import * as reportHandlers from './handlers/reporting.js';

handlers = {
  // ...
  handleReportGenerate: reportHandlers.handleReportGenerate
};
```

4. **Build and test**:
```bash
npm run build
npm run test
```

### Adding New Configuration

Add to `src/config.js`:
```javascript
const getConfig = (env = {}) => ({
  // ...
  features: {
    newFeature: env.NEW_FEATURE_ENABLED === 'true'
  }
});
```

## Architecture Patterns

### Error Handling
Always return error responses via `errorResponse()`:
```javascript
if (!required_field) {
  return errorResponse('INVALID_REQUEST', 'Missing required field');
}
```

### Authentication
Protected endpoints should extract orgId:
```javascript
const orgId = getOrgIdFromAuth(request);
```

### Logging
Use simple console logs (Cloudflare Workers handles aggregation):
```javascript
console.log(`[HANDLER] Processing request for org: ${orgId}`);
```

### Safe Operations
Use utility functions for common operations:
```javascript
const response = await safeFetch(url, options, { maxRetries: 3 });
const cost = calculateCost(provider, model, inputTokens, outputTokens);
```

## Deployment

### Cloudflare Workers

```bash
cd apps/gateway

# Deploy to staging
npx wrangler deploy --env staging

# Deploy to production
npx wrangler deploy --env production
```

### Environment Variables

Set via `wrangler secret put`:
```bash
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_KEY
wrangler secret put OPENAI_API_KEY
wrangler secret put JWT_SECRET
```

Or via GitHub Actions secrets for CI/CD.

## Testing

Handler modules are designed to be testable:

```javascript
// test/handlers/budget.test.js
import { handleBudgetList } from '../../src/handlers/budget.js';

describe('Budget Handlers', () => {
  it('should list budgets', async () => {
    const request = new Request('https://api.finault.ai/v1/budgets');
    const response = await handleBudgetList(request, env, ctx);
    expect(response.status).toBe(200);
  });
});
```

## Performance Considerations

- **Bundle Size**: Keep under 500 KB (target ~400 KB)
- **Execution Time**: Cloudflare Workers have 30-second limit
- **Memory**: Limited to ~128 MB during execution
- **KV Access**: ~50ms latency, batch requests when possible
- **Database**: Use connection pooling, keep queries simple

## Troubleshooting

### Build fails
```bash
# Clear cache and rebuild
rm -rf node_modules
npm install
npm run build
```

### Tests fail
```bash
# Check Node version (needs 20+)
node --version

# Run specific test
node tests/gateway-test-suite.js
```

### Deployment fails
```bash
# Check Cloudflare credentials
wrangler whoami

# Verify wrangler.toml config
cat apps/gateway/wrangler.toml
```

## Related Documentation

- **Wrangler Docs**: https://developers.cloudflare.com/workers/wrangler/
- **esbuild Docs**: https://esbuild.github.io/
- **Cloudflare Workers**: https://developers.cloudflare.com/workers/
