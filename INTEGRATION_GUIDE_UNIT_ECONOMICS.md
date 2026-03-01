# Unit Economics Integration Guide

## Overview

This guide explains how to integrate the new Unit Economics Summary into Finault's close pack system. The unit economics module provides CFO-ready margin analysis by combining cost data (usage_logs) with revenue data (revenue_entries).

## Files Added/Modified

### New Files
- **`/apps/gateway/src/handlers/close-pack-economics.js`** - Unit economics generator and data analysis engine

### Modified Files
- **`/static/close-pack.html`** - Added Unit Economics tab and rendering logic
- **`/apps/gateway/gateway-wired.js`** - (TO BE UPDATED) Route integration needed

## Architecture

### Data Flow
```
usage_logs (cost data)  ─────┐
                              ├──> Unit Economics Generator
revenue_entries (revenue)  ──┘
                              │
                              ├──> Margin calculations
                              ├──> Model mix analysis
                              ├──> Cost center profitability
                              └──> Recommendations
```

### Module Export Structure

```javascript
// Primary function for generating unit economics
export const generateUnitEconomicsSummary(
  orgId,              // Organization UUID
  period,             // YYYY-MM format
  supabaseUrl,        // Supabase API URL
  supabaseKey         // Supabase service role key
) → Promise<{
  status: 'success' | 'error' | 'no_data',
  period: string,
  data: UnitEconomicsData | null
}

// Generate cryptographic hash for tamper-proof seal
export const hashEconomicsData(economicsData) → string | null

// Verify economics data against provided hash
export const verifyEconomicsHash(economicsData, providedHash) → boolean
```

## Return Data Structure

### Success Response
```json
{
  "status": "success",
  "period": "2026-01",
  "data": {
    "period": "2026-01",
    "period_display": "January 2026",
    "timestamp": "2026-02-01T00:04:12.000Z",

    // Summary metrics
    "total_ai_spend": 47283.19,
    "total_ai_revenue": 52840.00,
    "overall_margin_dollars": 5556.81,
    "overall_margin_percent": 11,

    // Bessemer benchmark classification
    "benchmark": {
      "tier": "Growth Stage",
      "description": "Reinvesting in growth (20-40% target for mature SaaS)",
      "comparison": "Your 11% margin is in Growth Stage territory. Reinvesting in growth..."
    },

    // Top 5 cost centers (by revenue or spend)
    "top_cost_centers": [
      {
        "cost_center": "customer:acme-corp",
        "spend": 12840.00,
        "revenue": 15000.00,
        "margin": 2160.00,
        "margin_pct": 14,
        "requests": 150000
      },
      // ... up to 5 entries
    ],

    // Model mix analysis
    "model_mix": [
      {
        "model": "gpt-4o",
        "spend": 28412.00,
        "percent_of_total": 60,
        "avg_cost_per_request": 0.0154,
        "request_count": 1847392
      },
      // ... up to 10 entries
    ],

    // Period-over-period (requires historical data)
    "period_summary": {
      "units_spend": 47283.19,
      "units_revenue": 52840.00,
      "units_margin": 5556.81,
      "change_vs_previous": null
    },

    // Optimization recommendations (1-3 items)
    "recommendations": [
      "Model mix optimization: gpt-4o accounts for $28,412 (60% of spend)...",
      "Cost center 'unassigned' is unprofitable with -$1,681 loss...",
      "At 11% margin, explore revenue expansion opportunities..."
    ],

    // Data quality indicators
    "has_revenue_data": true,
    "data_quality": {
      "usage_logs_count": 47283,
      "revenue_entries_count": 12,
      "cost_centers_count": 5
    }
  }
}
```

### Error Response
```json
{
  "status": "error",
  "message": "Database connection failed",
  "period": "2026-01",
  "data": null
}
```

### No Data Response (Progressive Disclosure)
```json
{
  "status": "no_data",
  "message": "No usage data available for this period",
  "period": "2026-01",
  "data": null
}
```

## Integration Steps

### Step 1: Import the Module

In `gateway-wired.js`, add to imports (around line 84):

```javascript
const {
  generateUnitEconomicsSummary,
  hashEconomicsData,
  verifyEconomicsHash
} = require('./src/handlers/close-pack-economics.js');
```

### Step 2: Add Route Handler

After the existing close pack routes (around line 1835), add:

```javascript
// Unit Economics Summary - new endpoint
if (path === '/v1/close-pack/economics') {
  return await handleClosePackEconomics(request, env, requestId);
}

// Economics data for a specific period
if (path.match(/^\/v1\/close-pack\/economics\/\d{4}-\d{2}$/)) {
  const period = path.split('/').pop();
  return await handleGetEconomicsForPeriod(request, env, period);
}
```

### Step 3: Implement Route Handlers

Add the following handler functions in `gateway-wired.js` or as separate exports from the module:

```javascript
/**
 * Generate unit economics for current close pack
 * POST /v1/close-pack/economics
 *
 * Request body:
 * {
 *   "period": "2026-01"  // Required: YYYY-MM
 * }
 */
const handleClosePackEconomics = async (request, env, requestId) => {
  try {
    const orgId = getOrgIdFromAuth(request);
    const body = await request.json();
    const { period } = body;

    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return errorResponse('INVALID_REQUEST', 'Period required in YYYY-MM format');
    }

    // Generate economics data
    const economicsData = await generateUnitEconomicsSummary(
      orgId,
      period,
      env.SUPABASE_URL,
      env.SUPABASE_KEY
    );

    // If revenue data exists, compute hash for certificate
    const economicsHash = economicsData.status === 'success'
      ? hashEconomicsData(economicsData)
      : null;

    // Log to audit trail
    await auditLogger.log('unit_economics_generated', {
      orgId,
      period,
      has_revenue_data: economicsData.data?.has_revenue_data || false,
      status: economicsData.status
    });

    return jsonResponse({
      ...economicsData,
      hash: economicsHash
    });
  } catch (error) {
    console.error('[CLOSE_PACK_ECONOMICS] Route error:', error.message);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};

/**
 * Retrieve unit economics for a specific period
 * GET /v1/close-pack/economics/2026-01
 */
const handleGetEconomicsForPeriod = async (request, env, period) => {
  try {
    const orgId = getOrgIdFromAuth(request);

    // Use cache or query fresh data
    const economicsData = await generateUnitEconomicsSummary(
      orgId,
      period,
      env.SUPABASE_URL,
      env.SUPABASE_KEY
    );

    return jsonResponse(economicsData);
  } catch (error) {
    console.error('[CLOSE_PACK_ECONOMICS] Retrieve error:', error.message);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
};
```

### Step 4: Update Close Certificate Generation

When generating the close pack certificate, include the economics hash:

```javascript
// In the certificate generation section (around line 2700):

const certificateData = {
  // ... existing fields

  // Include both cost and revenue data hashes
  cost_data_hash: costHash,        // Existing
  revenue_data_hash: economicsHash, // NEW - from economics

  // Update manifest to reference economics
  artifacts: [
    // ... existing artifacts
    {
      file: "04-Unit-Economics-Summary.html",
      type: "unit_economics",
      sha256: economicsHash
    }
  ]
};
```

### Step 5: Frontend Integration

The HTML file already has the Unit Economics tab. The tab will automatically:
- Hide if no revenue data exists (progressive disclosure)
- Display economics data when the backend API provides it
- Render tables, charts, and recommendations

To populate with real data, when loading a close pack in the UI:

```javascript
// After fetching the close pack data
fetch(`/v1/close-pack/economics/${period}`)
  .then(r => r.json())
  .then(data => {
    // Render unit economics in the tab
    renderUnitEconomics(data);
  })
  .catch(() => {
    // No revenue data - tab stays hidden
  });
```

## Usage Examples

### CLI Usage

```bash
# Generate unit economics for January 2026
curl -X POST https://api.finault.ai/v1/close-pack/economics \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"period":"2026-01"}'

# Retrieve economics for a specific period
curl -X GET https://api.finault.ai/v1/close-pack/economics/2026-01 \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### SDK Usage

```javascript
import { generateUnitEconomicsSummary } from './handlers/close-pack-economics.js';

const economics = await generateUnitEconomicsSummary(
  'org_123abc',
  '2026-01',
  'https://xyz.supabase.co',
  'sb_key_xyz'
);

if (economics.status === 'success') {
  console.log(`Margin: ${economics.data.overall_margin_percent}%`);
  console.log(`Top cost center: ${economics.data.top_cost_centers[0].cost_center}`);
}
```

## Database Schema Requirements

The integration expects these tables in Supabase:

### `usage_logs` table
```sql
CREATE TABLE usage_logs (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL,
  cost_center VARCHAR(255),
  model VARCHAR(100),
  cost DECIMAL(12, 4),
  request_count INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_usage_logs_org_period
  ON usage_logs(org_id, created_at);
```

### `revenue_entries` table
```sql
CREATE TABLE revenue_entries (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL,
  period DATE NOT NULL,
  cost_center VARCHAR(255),
  revenue_amount DECIMAL(12, 2),
  currency VARCHAR(3) DEFAULT 'USD',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_revenue_entries_org_period
  ON revenue_entries(org_id, period);
```

## Progressive Disclosure Strategy

The Unit Economics Summary gracefully handles missing data:

1. **No Usage Data** → Section omitted entirely
2. **No Revenue Data** → Cost analysis shown, revenue fields show $0, margin calculations indicate "Revenue data not available"
3. **Complete Data** → Full unit economics with margins, recommendations, and benchmarks

This ensures the close pack remains useful regardless of data completeness.

## Performance Considerations

- **Query Optimization**: The handler uses parallel queries for usage_logs and revenue_entries
- **Aggregation**: All calculations done in-memory for responsiveness
- **Caching**: Consider caching economics data for 1 hour per period (immutable after month close)
- **Hash Generation**: SHA-256 computation ~1ms for typical dataset

Typical response time: 200-500ms for organizations with <100k records.

## Troubleshooting

### "No usage data available"
- Check that usage_logs table has records for the requested period
- Verify org_id matches current authenticated organization

### Revenue data not appearing
- Ensure revenue_entries table has records for the period
- Verify cost_center field matches between usage_logs and revenue_entries

### Hash mismatch in certificate
- Ensure economics data hasn't been modified since hash was generated
- Use `verifyEconomicsHash()` to validate before certificate signing

### Negative margins
- Check pricing vs. cost ratio in revenue_entries
- Look for unassigned costs that need allocation
- Review model mix for expensive models used inefficiently

## Compliance & Audit Trail

- All economics generation is logged with audit trail
- Hash values included in tamper-proof close certificate
- Revenue data hash enables verification of data integrity
- Unit economics included in MANIFEST.json with SHA-256 digest

## Future Enhancements

1. **Period-over-Period Trends**: Add historical comparison (requires T-1 data)
2. **Predictive Analytics**: Forecast margins based on model mix trends
3. **Anomaly Detection**: Flag unusual cost-to-revenue ratios
4. **Benchmarking**: Compare against industry metrics by vertical
5. **Drill-Down**: Enable detailed views of individual cost centers
6. **Export**: Add unit economics to PDF close pack export

## Questions & Support

- For schema questions: Check Supabase database setup
- For integration issues: Verify environment variables (SUPABASE_URL, SUPABASE_KEY)
- For calculation discrepancies: Review the aggregation logic in close-pack-economics.js
