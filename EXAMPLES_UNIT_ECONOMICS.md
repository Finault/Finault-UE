# Unit Economics Implementation Examples

## Complete Integration Example

This section shows a complete working example of integrating unit economics into Finault's close pack flow.

### Adding Routes to gateway-wired.js

**Location**: Around line 1835, after existing close pack routes

```javascript
// ═══════════════════════════════════════════════════════════════════════════════
// CLOSE PACK - Unit Economics Summary
// ═══════════════════════════════════════════════════════════════════════════════

// Generate economics for close pack
if (path === '/v1/close-pack/economics') {
  return await handleClosePackEconomics(request, env, requestId);
}

// Retrieve economics for specific period
if (path.match(/^\/v1\/close-pack\/economics\/\d{4}-\d{2}$/)) {
  const period = path.split('/').pop();
  return await handleGetEconomicsForPeriod(request, env, period);
}

// Verify economics hash (for tamper-proof validation)
if (path === '/v1/close-pack/economics/verify') {
  return await handleVerifyEconomicsHash(request, env);
}
```

### Handler Implementation

**Location**: Add as new functions in gateway-wired.js or as exports from close-pack-economics.js

```javascript
/**
 * Generate unit economics for a period
 * POST /v1/close-pack/economics
 *
 * Request: { "period": "2026-01" }
 * Response: Economics data + cryptographic hash
 */
const handleClosePackEconomics = async (request, env, requestId) => {
  try {
    const orgId = getOrgIdFromAuth(request);

    // Validate request body
    if (request.method !== 'POST') {
      return errorResponse('METHOD_NOT_ALLOWED', 'POST required', 405);
    }

    const body = await request.json();
    const { period } = body;

    // Validate period format
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

    if (periodDate > now) {
      return errorResponse(
        'INVALID_REQUEST',
        'Cannot generate economics for future periods',
        400
      );
    }

    // Generate economics data
    console.log(`[CLOSE_PACK_ECONOMICS] Generating for org=${orgId}, period=${period}`);

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

    // Audit log
    await auditLogger.log('close_pack_economics_generated', {
      orgId,
      period,
      requestId,
      status: economicsData.status,
      has_revenue_data: economicsData.data?.has_revenue_data || false,
      margin_pct: economicsData.data?.overall_margin_percent || null
    });

    // Cache the result (1 hour TTL)
    const cacheKey = `economics:${orgId}:${period}`;
    const cacheData = {
      ...economicsData,
      hash: economicsHash,
      generated_at: new Date().toISOString()
    };

    // Could use Redis or KV storage here
    // await cache.set(cacheKey, JSON.stringify(cacheData), { ttl: 3600 });

    return jsonResponse({
      status: 'success',
      ...economicsData,
      hash: economicsHash,
      cached: false
    });

  } catch (error) {
    console.error(`[CLOSE_PACK_ECONOMICS] Generation error:`, error);

    // Log error for monitoring
    await auditLogger.log('close_pack_economics_error', {
      orgId: getOrgIdFromAuth(request),
      error: error.message,
      requestId
    });

    return errorResponse(
      'INTERNAL_ERROR',
      `Failed to generate economics: ${error.message}`,
      500
    );
  }
};

/**
 * Get unit economics for specific period
 * GET /v1/close-pack/economics/2026-01
 */
const handleGetEconomicsForPeriod = async (request, env, period) => {
  try {
    const orgId = getOrgIdFromAuth(request);

    // Validate period
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return errorResponse('INVALID_REQUEST', 'Invalid period format', 400);
    }

    // Try cache first
    // const cached = await cache.get(`economics:${orgId}:${period}`);
    // if (cached) {
    //   return jsonResponse(JSON.parse(cached), 200, { 'X-Cache': 'HIT' });
    // }

    // Generate fresh data
    const economicsData = await generateUnitEconomicsSummary(
      orgId,
      period,
      env.SUPABASE_URL,
      env.SUPABASE_KEY
    );

    const economicsHash = economicsData.status === 'success'
      ? hashEconomicsData(economicsData)
      : null;

    return jsonResponse({
      ...economicsData,
      hash: economicsHash
    });

  } catch (error) {
    console.error(`[CLOSE_PACK_ECONOMICS] Retrieve error:`, error);
    return errorResponse('INTERNAL_ERROR', error.message, 500);
  }
};

/**
 * Verify economics hash for tamper-proof validation
 * POST /v1/close-pack/economics/verify
 *
 * Request:
 * {
 *   "period": "2026-01",
 *   "hash": "a3f8c2d1e9b74a6f..."
 * }
 */
const handleVerifyEconomicsHash = async (request, env) => {
  try {
    const orgId = getOrgIdFromAuth(request);

    const body = await request.json();
    const { period, hash } = body;

    if (!period || !hash) {
      return errorResponse('INVALID_REQUEST', 'period and hash required', 400);
    }

    // Retrieve current economics for period
    const economicsData = await generateUnitEconomicsSummary(
      orgId,
      period,
      env.SUPABASE_URL,
      env.SUPABASE_KEY
    );

    if (economicsData.status !== 'success') {
      return errorResponse(
        'NOT_FOUND',
        'Economics data not found for period',
        404
      );
    }

    // Verify hash
    const verified = verifyEconomicsHash(economicsData, hash);

    // Audit log
    await auditLogger.log('close_pack_economics_verified', {
      orgId,
      period,
      verified,
      provided_hash: hash.substring(0, 16) + '...'
    });

    return jsonResponse({
      status: 'success',
      period,
      verified,
      message: verified
        ? 'Economics data hash verified'
        : 'Hash mismatch - data may have been modified'
    });

  } catch (error) {
    console.error(`[CLOSE_PACK_ECONOMICS] Verification error:`, error);
    return errorResponse('INTERNAL_ERROR', error.message, 500);
  }
};
```

### Integrating into Close Pack Certificate

**Location**: In the certificate generation section (around line 2700)

```javascript
/**
 * Enhanced Close Pack Certificate with unit economics
 */
const generateCloseCertificate = async (orgId, period, env) => {
  try {
    // Generate cost hash (existing)
    const costHash = await generateCostHash(orgId, period, env);

    // Generate economics data (NEW)
    const economicsResult = await generateUnitEconomicsSummary(
      orgId,
      period,
      env.SUPABASE_URL,
      env.SUPABASE_KEY
    );

    // Generate economics hash if revenue data exists
    const economicsHash = economicsResult.status === 'success'
      ? hashEconomicsData(economicsResult)
      : null;

    // Build certificate
    const certificate = {
      version: '1.0',
      sealed_at: new Date().toISOString(),
      organization_id: orgId,
      period: period,

      // Tamper-proof hashes
      cost_data_hash: costHash,
      revenue_data_hash: economicsHash, // NEW

      // Artifact manifest
      artifacts: [
        {
          file: '01-AI-Spend-Audit-Report.pdf',
          type: 'audit_report',
          sha256: costHash
        },
        {
          file: '02-Journal-Entry.csv',
          type: 'journal_entry',
          sha256: await hashJournalEntry(orgId, period)
        },
        {
          file: '03-Close-Certificate.pdf',
          type: 'close_certificate',
          sha256: 'computed_after_generation'
        },
        ...(economicsHash ? [{
          file: '04-Unit-Economics-Summary.html',
          type: 'unit_economics',
          sha256: economicsHash
        }] : []),
        {
          file: '05-Manifest.json',
          type: 'manifest',
          sha256: 'computed_after_generation'
        }
      ],

      // Summary metrics
      summary: {
        total_ai_spend: costHash.metadata.total_spend,
        total_ai_revenue: economicsHash ? economicsResult.data.total_ai_revenue : null,
        overall_margin: economicsHash ? economicsResult.data.overall_margin_dollars : null,
        overall_margin_pct: economicsHash ? economicsResult.data.overall_margin_percent : null
      }
    };

    // Sign certificate
    const certDigest = crypto
      .createHash('sha256')
      .update(JSON.stringify(certificate))
      .digest('hex');

    return {
      certificate,
      digest: certDigest,
      has_revenue_data: !!economicsHash
    };

  } catch (error) {
    console.error('[CERTIFICATE] Generation error:', error);
    throw error;
  }
};
```

### Frontend Usage

**In React component**:

```jsx
import React, { useState, useEffect } from 'react';

const UnitEconomicsSection = ({ period }) => {
  const [economics, setEconomics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchEconomics();
  }, [period]);

  const fetchEconomics = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/v1/close-pack/economics/${period}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('finault_token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch economics');
      }

      const data = await response.json();

      // Handle progressive disclosure
      if (data.status === 'no_data') {
        setEconomics(null); // Don't show the section
        return;
      }

      if (data.status !== 'success') {
        throw new Error(data.message);
      }

      setEconomics(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Progressive disclosure - only show if revenue data exists
  if (!economics) {
    return null;
  }

  if (loading) {
    return <div className="loading">Loading unit economics...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  const { data } = economics;

  return (
    <div className="unit-economics-section">
      <h2>Unit Economics Summary</h2>
      <p>{data.period_display}</p>

      {/* Key metrics */}
      <div className="metrics-grid">
        <MetricCard
          label="Total AI Spend"
          value={`$${data.total_ai_spend.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
        />
        <MetricCard
          label="Total AI Revenue"
          value={`$${data.total_ai_revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
        />
        <MetricCard
          label="Overall Margin"
          value={`$${data.overall_margin_dollars.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          highlight={data.overall_margin_dollars > 0 ? 'positive' : 'negative'}
        />
        <MetricCard
          label="Margin %"
          value={`${data.overall_margin_percent}%`}
          highlight={data.overall_margin_percent > 0 ? 'positive' : 'negative'}
        />
      </div>

      {/* Benchmark */}
      <div className="benchmark">
        <h3>{data.benchmark.tier}</h3>
        <p>{data.benchmark.comparison}</p>
      </div>

      {/* Cost centers table */}
      <div className="cost-centers">
        <h3>Top Cost Centers</h3>
        <table>
          <thead>
            <tr>
              <th>Cost Center</th>
              <th>Spend</th>
              <th>Revenue</th>
              <th>Margin</th>
              <th>Margin %</th>
            </tr>
          </thead>
          <tbody>
            {data.top_cost_centers.map(cc => (
              <tr key={cc.cost_center}>
                <td>{cc.cost_center}</td>
                <td>${cc.spend.toFixed(2)}</td>
                <td>${cc.revenue.toFixed(2)}</td>
                <td className={cc.margin < 0 ? 'negative' : 'positive'}>
                  ${cc.margin.toFixed(2)}
                </td>
                <td className={cc.margin_pct < 0 ? 'negative' : 'positive'}>
                  {cc.margin_pct}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Model mix */}
      <div className="model-mix">
        <h3>Model Mix Analysis</h3>
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th>Spend</th>
              <th>% of Total</th>
              <th>Avg Cost/Request</th>
              <th>Requests</th>
            </tr>
          </thead>
          <tbody>
            {data.model_mix.map(m => (
              <tr key={m.model}>
                <td>{m.model}</td>
                <td>${m.spend.toFixed(2)}</td>
                <td>{m.percent_of_total}%</td>
                <td>${m.avg_cost_per_request.toFixed(6)}</td>
                <td>{m.request_count.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recommendations */}
      <div className="recommendations">
        <h3>Optimization Recommendations</h3>
        <ol>
          {data.recommendations.map((rec, i) => (
            <li key={i}>{rec}</li>
          ))}
        </ol>
      </div>

      {/* Data quality indicator */}
      <div className="data-quality">
        <p>
          Data quality: {data.data_quality.usage_logs_count} usage logs,
          {' '}{data.data_quality.revenue_entries_count} revenue entries,
          {' '}{data.data_quality.cost_centers_count} cost centers
        </p>
      </div>
    </div>
  );
};

const MetricCard = ({ label, value, highlight }) => (
  <div className={`metric-card ${highlight || ''}`}>
    <div className="label">{label}</div>
    <div className="value">{value}</div>
  </div>
);

export default UnitEconomicsSection;
```

### Command-Line Testing

```bash
#!/bin/bash
# test-unit-economics.sh

API_URL="http://localhost:8787"
TOKEN="your_api_token_here"
ORG_ID="org_123abc"

echo "=== Unit Economics Tests ==="

# Test 1: Generate economics for January 2026
echo -e "\n1. Generate economics for 2026-01:"
curl -X POST "$API_URL/v1/close-pack/economics" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"period":"2026-01"}' | jq .

# Test 2: Retrieve economics for specific period
echo -e "\n2. Retrieve economics for 2026-01:"
curl -X GET "$API_URL/v1/close-pack/economics/2026-01" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Test 3: Verify hash
echo -e "\n3. Verify economics hash:"
HASH=$(curl -s -X GET "$API_URL/v1/close-pack/economics/2026-01" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.hash')

curl -X POST "$API_URL/v1/close-pack/economics/verify" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"period\":\"2026-01\",\"hash\":\"$HASH\"}" | jq .

# Test 4: Check error handling (invalid period)
echo -e "\n4. Test error handling (invalid period):"
curl -X POST "$API_URL/v1/close-pack/economics" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"period":"2026-13"}' | jq .

# Test 5: Check no-data scenario
echo -e "\n5. Test no-data scenario (historical period):"
curl -X GET "$API_URL/v1/close-pack/economics/2020-01" \
  -H "Authorization: Bearer $TOKEN" | jq .

echo -e "\n=== Tests Complete ==="
```

### Database Setup SQL

```sql
-- Ensure tables exist with proper indexing

CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  cost_center VARCHAR(255),
  model VARCHAR(100),
  cost DECIMAL(12, 4) NOT NULL DEFAULT 0,
  request_count INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_org_period
  ON usage_logs(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_logs_org_cost_center
  ON usage_logs(org_id, cost_center);

CREATE INDEX IF NOT EXISTS idx_usage_logs_org_model
  ON usage_logs(org_id, model);

CREATE TABLE IF NOT EXISTS revenue_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  period DATE NOT NULL,
  cost_center VARCHAR(255),
  revenue_amount DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revenue_entries_org_period
  ON revenue_entries(org_id, period DESC);

CREATE INDEX IF NOT EXISTS idx_revenue_entries_org_cost_center
  ON revenue_entries(org_id, cost_center);

-- Sample data for testing
INSERT INTO usage_logs (org_id, cost_center, model, cost, request_count, created_at)
VALUES
  ('org_123abc', 'customer:acme-corp', 'gpt-4o', 28412.00, 1847392, NOW() - INTERVAL '30 days'),
  ('org_123abc', 'customer:acme-corp', 'gpt-4o-mini', 3200.00, 1000000, NOW() - INTERVAL '30 days'),
  ('org_123abc', 'customer:techcorp', 'gpt-4o', 9104.00, 592000, NOW() - INTERVAL '30 days');

INSERT INTO revenue_entries (org_id, period, cost_center, revenue_amount)
VALUES
  ('org_123abc', NOW()::DATE - INTERVAL '30 days', 'customer:acme-corp', 15000.00),
  ('org_123abc', NOW()::DATE - INTERVAL '30 days', 'customer:techcorp', 13500.00);
```

## Performance Optimization Tips

1. **Use read replicas** for analytics queries
2. **Cache results** for 1 hour per period (immutable after month close)
3. **Parallel queries** - fetch usage_logs and revenue_entries simultaneously
4. **Index optimization** - ensure org_id and period/created_at are indexed
5. **Batch operations** - aggregate calculations at DB level when possible

## Troubleshooting Checklist

- [ ] Supabase tables exist and have correct schema
- [ ] SUPABASE_URL and SUPABASE_KEY environment variables set
- [ ] Auth tokens valid and org_id matches
- [ ] Period format is YYYY-MM
- [ ] Usage logs have created_at timestamps within period
- [ ] Revenue entries have matching cost_center values
- [ ] No negative costs or revenues
- [ ] Cost centers are properly formatted (no special characters besides :)
