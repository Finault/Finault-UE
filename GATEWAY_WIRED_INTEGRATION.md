# gateway-wired.js Integration - Unit Economics

This file shows the exact code locations and snippets to add to `gateway-wired.js` to integrate the unit economics handler.

## File: `/apps/gateway/gateway-wired.js`

### Step 1: Add Import Statement

**Location**: Line ~84 (after other module imports)

**Current code**:
```javascript
const ClosePackGenerator = require('../modules/closepack-generator.js');
const { PolicyEngine, AllocationRule } = require('../modules/policy-engine.js');
```

**Add after**:
```javascript
// Unit Economics Handler for Close Pack
const {
  generateUnitEconomicsSummary,
  hashEconomicsData,
  verifyEconomicsHash
} = require('./src/handlers/close-pack-economics.js');
```

**Full context** (lines 84-88):
```javascript
const ClosePackGenerator = require('../modules/closepack-generator.js');
const { PolicyEngine, AllocationRule } = require('../modules/policy-engine.js');
const {
  generateUnitEconomicsSummary,
  hashEconomicsData,
  verifyEconomicsHash
} = require('./src/handlers/close-pack-economics.js');
const { SavingsIntelligence, TokenEfficiencyAnalyzer, ModelSelector, MODEL_PRICING: SAVINGS_PRICING } = require('../modules/savings-intelligence.js');
```

---

### Step 2: Add Route Handlers

**Location**: Line ~1835 (after existing close pack routes)

**Current code** (lines 1828-1835):
```javascript
      if (path.match(/^\/v1\/close-pack\/[a-zA-Z0-9-]+\/(pdf|excel|json|csv)$/)) {
        return await getClosePackFormat(request, env, path);
      }

      if (path.match(/^\/v1\/close-pack\/[a-zA-Z0-9-]+$/)) {
        return await getClosePack(request, env, path);
      }

      // ═══════════════════════════════════════════════════════════════
      // RECONCILIATION
```

**Insert between routes and RECONCILIATION comment**:
```javascript
      // ═══════════════════════════════════════════════════════════════
      // CLOSE PACK - Unit Economics Summary
      // ═══════════════════════════════════════════════════════════════

      if (path === '/v1/close-pack/economics' && request.method === 'POST') {
        return await handleClosePackEconomicsGenerate(request, env, requestId);
      }

      if (path.match(/^\/v1\/close-pack\/economics\/\d{4}-\d{2}$/) && request.method === 'GET') {
        const period = path.split('/').pop();
        return await handleClosePackEconomicsRetrieve(request, env, period);
      }

      if (path === '/v1/close-pack/economics/verify' && request.method === 'POST') {
        return await handleClosePackEconomicsVerify(request, env);
      }

      // ═══════════════════════════════════════════════════════════════
      // RECONCILIATION - Real invoice-to-usage matching
      // ═══════════════════════════════════════════════════════════════
```

---

### Step 3: Add Handler Functions

**Location**: Anywhere after the route definitions (suggested: line ~7900, before the final exports)

Add these three handler functions:

```javascript
// ═══════════════════════════════════════════════════════════════════════════════
// CLOSE PACK ECONOMICS HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate Unit Economics Summary for a period
 * POST /v1/close-pack/economics
 *
 * @param {Request} request - Contains period in body: {"period":"2026-01"}
 * @param {Object} env - Cloudflare Worker environment
 * @param {string} requestId - Request tracking ID
 * @returns {Response} JSON with economics data and hash
 */
const handleClosePackEconomicsGenerate = async (request, env, requestId) => {
  try {
    const orgId = getOrgIdFromAuth(request);

    // Parse and validate request
    const body = await request.json();
    const { period } = body;

    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return errorResponse(
        'INVALID_REQUEST',
        'Period required in YYYY-MM format (e.g., 2026-01)',
        400
      );
    }

    // Validate not future date
    const [year, month] = period.split('-');
    const periodDate = new Date(parseInt(year), parseInt(month) - 1, 1);
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    if (periodDate > currentMonthStart) {
      return errorResponse(
        'INVALID_REQUEST',
        'Cannot generate economics for future periods',
        400
      );
    }

    console.log(`[CLOSE_PACK_ECONOMICS] Generating for org=${orgId}, period=${period}`);

    // Generate economics data
    const economicsData = await generateUnitEconomicsSummary(
      orgId,
      period,
      env.SUPABASE_URL,
      env.SUPABASE_KEY
    );

    // Compute hash for tamper-proof seal
    const economicsHash = economicsData.status === 'success'
      ? hashEconomicsData(economicsData)
      : null;

    // Audit logging
    await auditLogger.log('close_pack_economics_generated', {
      orgId,
      period,
      requestId,
      status: economicsData.status,
      has_revenue_data: economicsData.data?.has_revenue_data || false,
      margin_pct: economicsData.data?.overall_margin_percent || null
    });

    // Return response
    if (economicsData.status === 'success') {
      return jsonResponse({
        status: 'success',
        period,
        hash: economicsHash,
        data: economicsData.data
      }, 200);
    } else if (economicsData.status === 'no_data') {
      return jsonResponse({
        status: 'no_data',
        message: economicsData.message,
        period,
        data: null
      }, 200);
    } else {
      return jsonResponse({
        status: 'error',
        message: economicsData.message,
        period,
        data: null
      }, 500);
    }

  } catch (error) {
    console.error('[CLOSE_PACK_ECONOMICS] Generate error:', error.message);

    try {
      await auditLogger.log('close_pack_economics_error', {
        orgId: getOrgIdFromAuth(request),
        error: error.message,
        requestId,
        type: 'generation_failed'
      });
    } catch (auditError) {
      console.warn('[AUDIT] Failed to log economics error:', auditError.message);
    }

    return errorResponse(
      'INTERNAL_ERROR',
      `Failed to generate economics: ${error.message}`,
      500
    );
  }
};

/**
 * Retrieve Unit Economics Summary for specific period
 * GET /v1/close-pack/economics/2026-01
 *
 * @param {Request} request
 * @param {Object} env - Cloudflare Worker environment
 * @param {string} period - Period in YYYY-MM format
 * @returns {Response} JSON with economics data and hash
 */
const handleClosePackEconomicsRetrieve = async (request, env, period) => {
  try {
    const orgId = getOrgIdFromAuth(request);

    // Validate period format
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return errorResponse('INVALID_REQUEST', 'Invalid period format', 400);
    }

    console.log(`[CLOSE_PACK_ECONOMICS] Retrieving for org=${orgId}, period=${period}`);

    // Generate/retrieve economics data
    const economicsData = await generateUnitEconomicsSummary(
      orgId,
      period,
      env.SUPABASE_URL,
      env.SUPABASE_KEY
    );

    // Compute hash
    const economicsHash = economicsData.status === 'success'
      ? hashEconomicsData(economicsData)
      : null;

    // Audit logging
    await auditLogger.log('close_pack_economics_retrieved', {
      orgId,
      period,
      status: economicsData.status
    });

    // Return response
    if (economicsData.status === 'success') {
      return jsonResponse({
        status: 'success',
        period,
        hash: economicsHash,
        data: economicsData.data
      }, 200);
    } else if (economicsData.status === 'no_data') {
      return jsonResponse({
        status: 'no_data',
        message: economicsData.message,
        period,
        data: null
      }, 200);
    } else {
      return jsonResponse({
        status: 'error',
        message: economicsData.message,
        period,
        data: null
      }, 500);
    }

  } catch (error) {
    console.error('[CLOSE_PACK_ECONOMICS] Retrieve error:', error.message);
    return errorResponse(
      'INTERNAL_ERROR',
      `Failed to retrieve economics: ${error.message}`,
      500
    );
  }
};

/**
 * Verify Unit Economics Hash (tamper-proof validation)
 * POST /v1/close-pack/economics/verify
 *
 * @param {Request} request - Contains {"period":"2026-01","hash":"..."}
 * @param {Object} env - Cloudflare Worker environment
 * @returns {Response} JSON with verification result
 */
const handleClosePackEconomicsVerify = async (request, env) => {
  try {
    const orgId = getOrgIdFromAuth(request);

    // Parse and validate request
    const body = await request.json();
    const { period, hash } = body;

    if (!period || !hash) {
      return errorResponse(
        'INVALID_REQUEST',
        'period and hash required in request body',
        400
      );
    }

    if (!/^\d{4}-\d{2}$/.test(period)) {
      return errorResponse('INVALID_REQUEST', 'Invalid period format', 400);
    }

    console.log(`[CLOSE_PACK_ECONOMICS] Verifying hash for org=${orgId}, period=${period}`);

    // Retrieve current economics for period
    const economicsData = await generateUnitEconomicsSummary(
      orgId,
      period,
      env.SUPABASE_URL,
      env.SUPABASE_KEY
    );

    // Check if data exists
    if (economicsData.status !== 'success') {
      return errorResponse(
        'NOT_FOUND',
        'Economics data not found for period',
        404
      );
    }

    // Verify hash matches
    const verified = verifyEconomicsHash(economicsData, hash);

    // Audit logging
    await auditLogger.log('close_pack_economics_verified', {
      orgId,
      period,
      verified,
      provided_hash: hash.substring(0, 16) + '...',
      result: verified ? 'match' : 'mismatch'
    });

    // Return verification result
    return jsonResponse({
      status: 'success',
      period,
      verified,
      message: verified
        ? 'Economics data hash verified - data integrity confirmed'
        : 'Hash mismatch - economics data may have been modified'
    }, 200);

  } catch (error) {
    console.error('[CLOSE_PACK_ECONOMICS] Verification error:', error.message);
    return errorResponse(
      'INTERNAL_ERROR',
      `Failed to verify economics hash: ${error.message}`,
      500
    );
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
```

---

### Step 4: Update Certificate Generation (Optional but Recommended)

**Location**: In the close certificate generation section (around line 2700-2750)

**Find the section generating certificate data**, and update the artifacts array:

**Before** (without unit economics):
```javascript
const artifacts = [
  {
    file: "01-AI-Spend-Audit-Report.pdf",
    type: "audit_report",
    sha256: costHash
  },
  {
    file: "02-Journal-Entry.csv",
    type: "journal_entry",
    sha256: journalHash
  },
  // ... other artifacts
];
```

**After** (with unit economics):
```javascript
// Generate unit economics if revenue data exists
let economicsHash = null;
try {
  const economicsResult = await generateUnitEconomicsSummary(
    orgId,
    period,
    env.SUPABASE_URL,
    env.SUPABASE_KEY
  );
  if (economicsResult.status === 'success') {
    economicsHash = hashEconomicsData(economicsResult);
  }
} catch (e) {
  console.warn('[CERTIFICATE] Could not generate economics hash:', e.message);
  // Continue without economics hash
}

const artifacts = [
  {
    file: "01-AI-Spend-Audit-Report.pdf",
    type: "audit_report",
    sha256: costHash
  },
  {
    file: "02-Journal-Entry.csv",
    type: "journal_entry",
    sha256: journalHash
  },
  // Add unit economics artifact if revenue data exists
  ...(economicsHash ? [{
    file: "04-Unit-Economics-Summary.html",
    type: "unit_economics",
    sha256: economicsHash
  }] : []),
  // ... other artifacts
];

// In the certificate object, add:
const certificate = {
  // ... existing fields
  cost_data_hash: costHash,
  revenue_data_hash: economicsHash, // NEW
  // ... rest of certificate
};
```

---

## Verification Steps

After adding the code, verify:

1. **Import compiles**: No syntax errors in import statement
2. **Routes register**: All three routes accessible
3. **Handlers execute**: Console logs appear when routes called
4. **Responses valid**: JSON responses with proper structure
5. **Audit logs**: Events logged to audit trail
6. **Error handling**: Invalid requests return proper error codes

## Testing

```bash
# Test 1: Generate economics
curl -X POST http://localhost:8787/v1/close-pack/economics \
  -H "Authorization: Bearer test_token" \
  -H "Content-Type: application/json" \
  -d '{"period":"2026-01"}'

# Test 2: Retrieve economics
curl -X GET http://localhost:8787/v1/close-pack/economics/2026-01 \
  -H "Authorization: Bearer test_token"

# Test 3: Verify hash
curl -X POST http://localhost:8787/v1/close-pack/economics/verify \
  -H "Authorization: Bearer test_token" \
  -H "Content-Type: application/json" \
  -d '{"period":"2026-01","hash":"a3f8c2d1..."}'
```

## Complete Integration Checklist

- [ ] Import statement added to line ~84
- [ ] Route handlers added to line ~1835
- [ ] Handler functions added (suggested line ~7900)
- [ ] Certificate generation updated (optional but recommended)
- [ ] All imports compile without errors
- [ ] Routes tested with curl/Postman
- [ ] Responses match expected format
- [ ] Audit logs appearing in audit trail
- [ ] Frontend can call new endpoints
- [ ] Error cases handled gracefully
- [ ] Database tables verified (usage_logs, revenue_entries)
- [ ] Environment variables set (SUPABASE_URL, SUPABASE_KEY)

## Troubleshooting Integration Issues

**"Cannot find module close-pack-economics.js"**
- Verify file created at correct path: `/apps/gateway/src/handlers/close-pack-economics.js`
- Check import path matches actual file location

**"orgId is undefined"**
- Ensure `getOrgIdFromAuth(request)` is called correctly
- Verify authentication token is valid

**"Database query failed"**
- Check SUPABASE_URL and SUPABASE_KEY environment variables
- Verify tables exist: usage_logs, revenue_entries
- Check org_id exists in both tables

**Routes not matching**
- Verify regex patterns in path matching
- Check HTTP method (POST vs GET)
- Ensure no conflicting routes match first

## Support

For questions on integration:
1. See `/INTEGRATION_GUIDE_UNIT_ECONOMICS.md` for detailed guide
2. See `/API_SPEC_UNIT_ECONOMICS.md` for API details
3. See `/EXAMPLES_UNIT_ECONOMICS.md` for working code examples
