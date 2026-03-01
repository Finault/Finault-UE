# Unit Economics API Specification

## Endpoints

### 1. Generate Unit Economics Summary

**Endpoint**: `POST /v1/close-pack/economics`

**Authentication**: Required (Bearer token)

**Request**:
```json
{
  "period": "2026-01"
}
```

**Request Parameters**:
- `period` (string, required): Month in YYYY-MM format

**Response (Success)**:
```json
{
  "status": "success",
  "period": "2026-01",
  "hash": "a3f8c2d1e9b74a6f2c8d5e1b3a7f9c4d2e6b8a1f5c3d7e9a4b6f8c2d1e3a5b7f",
  "data": {
    "period": "2026-01",
    "period_display": "January 2026",
    "timestamp": "2026-02-01T12:34:56.789Z",

    "total_ai_spend": 47283.19,
    "total_ai_revenue": 52840.00,
    "overall_margin_dollars": 5556.81,
    "overall_margin_percent": 11,

    "benchmark": {
      "tier": "Growth Stage",
      "description": "Reinvesting in growth (20-40% target for mature SaaS)",
      "comparison": "Your 11% margin is in Growth Stage territory..."
    },

    "top_cost_centers": [
      {
        "cost_center": "customer:acme-corp",
        "spend": 12840.00,
        "revenue": 15000.00,
        "margin": 2160.00,
        "margin_pct": 14,
        "requests": 150000
      }
    ],

    "model_mix": [
      {
        "model": "gpt-4o",
        "spend": 28412.00,
        "percent_of_total": 60,
        "avg_cost_per_request": 0.0154,
        "request_count": 1847392
      }
    ],

    "period_summary": {
      "units_spend": 47283.19,
      "units_revenue": 52840.00,
      "units_margin": 5556.81,
      "change_vs_previous": null
    },

    "recommendations": [
      "Model mix optimization: gpt-4o accounts for $28,412 (60% of spend)...",
      "Cost center 'unassigned' is unprofitable with -$1,681 loss...",
      "At 11% margin, explore revenue expansion opportunities..."
    ],

    "has_revenue_data": true,
    "data_quality": {
      "usage_logs_count": 47283,
      "revenue_entries_count": 12,
      "cost_centers_count": 5
    }
  }
}
```

**Response (No Data)**:
```json
{
  "status": "no_data",
  "message": "No usage data available for this period",
  "period": "2026-01",
  "data": null
}
```

**Response (Error)**:
```json
{
  "status": "error",
  "message": "Database query failed: connection timeout",
  "period": "2026-01",
  "data": null
}
```

**HTTP Status Codes**:
- `200 OK` - Data retrieved successfully (any status in response)
- `400 Bad Request` - Invalid period format
- `401 Unauthorized` - Missing or invalid authentication
- `500 Internal Server Error` - Database or server error

**Notes**:
- Response always includes period even on error/no-data
- Hash is only included when status is "success"
- Progressive disclosure: missing revenue data doesn't cause error, just omits revenue fields

---

### 2. Get Unit Economics for Period

**Endpoint**: `GET /v1/close-pack/economics/{period}`

**Authentication**: Required (Bearer token)

**URL Parameters**:
- `period` (string): Month in YYYY-MM format (e.g., "2026-01")

**Query Parameters** (all optional):
- `include_historical` (boolean): Include previous month's data for comparison
- `group_by` (string): "customer" | "feature" | "product" - override cost center grouping
- `cache` (boolean): Use cached result if available (default: true)

**Response**: Same as POST endpoint

**Example**:
```bash
GET /v1/close-pack/economics/2026-01?include_historical=true
```

**HTTP Status Codes**:
- `200 OK` - Period data retrieved
- `400 Bad Request` - Invalid period format
- `401 Unauthorized` - Missing or invalid authentication
- `404 Not Found` - Period data not found (for future/invalid dates)
- `500 Internal Server Error` - Database error

---

### 3. Verify Economics Hash

**Endpoint**: `POST /v1/close-pack/economics/verify`

**Authentication**: Required (Bearer token)

**Request**:
```json
{
  "period": "2026-01",
  "hash": "a3f8c2d1e9b74a6f2c8d5e1b3a7f9c4d2e6b8a1f5c3d7e9a4b6f8c2d1e3a5b7f"
}
```

**Response (Valid)**:
```json
{
  "status": "success",
  "verified": true,
  "message": "Economics data hash verified"
}
```

**Response (Invalid)**:
```json
{
  "status": "success",
  "verified": false,
  "message": "Hash mismatch - data may have been modified"
}
```

**Response (Error)**:
```json
{
  "status": "error",
  "message": "Cannot verify: economics data not found for period"
}
```

**HTTP Status Codes**:
- `200 OK` - Verification completed (check 'verified' field)
- `400 Bad Request` - Missing required fields
- `401 Unauthorized` - Missing or invalid authentication
- `404 Not Found` - Economics data for period not found
- `500 Internal Server Error` - Server error

---

## Data Types & Validation

### Period Format
- Format: `YYYY-MM`
- Example: `2026-01`, `2025-12`
- Validation: Must match `/^\d{4}-\d{2}$/`
- Must be a valid month (01-12)
- Cannot be future dates beyond current month

### Currency Values
- All monetary values are in USD (default)
- Format: Decimal with 2 decimal places (e.g., 47283.19)
- Zero or positive numbers only
- Range: 0 to 99,999,999.99

### Margin Percentage
- Range: -100 to 100+
- Format: Integer (e.g., 11, -20, 85)
- Calculation: `(margin / revenue) * 100` where revenue > 0
- If revenue = 0: -100 if cost > 0, else 0

### Cost Center Name
- Format: String, 1-255 characters
- Pattern: alphanumeric, hyphens, underscores, colons (e.g., "customer:acme-corp")
- Can be null/undefined (treated as "unassigned")

### Model Name
- Format: String (e.g., "gpt-4o", "claude-3-opus")
- Can be vendor-qualified or short form
- If unknown: "unknown"

---

## Benchmark Tiers

Unit economics are classified against Bessemer Venture Partners SaaS benchmarks:

| Margin % | Tier | Description |
|----------|------|-------------|
| 80%+ | Rule of 40 AI Star | Exceptional AI company (80%+ margin) |
| 70-80% | Upper Quartile AI | Top-tier AI economics |
| 60-70% | Shooting Star | Exceptional AI companies |
| 50-60% | Strong Performer | Well-optimized operations |
| 40-50% | Mid-Market Standard | Solid unit economics |
| 20-40% | Growth Stage | Reinvesting in growth |
| 0-20% | Break-Even | Breakeven to slightly positive |
| <0% | Unprofitable | Cost optimization needed |

---

## Pagination

For future endpoints returning lists (e.g., all cost centers):

```javascript
{
  "data": [ /* items */ ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 147,
    "hasMore": true
  }
}
```

- Default limit: 50
- Max limit: 500
- Offset-based pagination

---

## Error Handling

### Error Response Format
```json
{
  "status": "error",
  "message": "Human-readable error message",
  "code": "ERROR_CODE",
  "period": "2026-01"
}
```

### Common Error Codes
- `INVALID_REQUEST` - Missing or invalid parameters
- `UNAUTHORIZED` - Missing or invalid auth token
- `NOT_FOUND` - Resource not found
- `DATABASE_ERROR` - Query or connection failure
- `INTERNAL_ERROR` - Server error
- `RATE_LIMIT_EXCEEDED` - Too many requests

---

## Rate Limiting

- **Per Org**: 100 requests per minute
- **Per User**: 1000 requests per day
- **Headers**:
  - `X-RateLimit-Limit: 100`
  - `X-RateLimit-Remaining: 87`
  - `X-RateLimit-Reset: 1643812341` (Unix timestamp)

---

## Caching

By default, economics data is cached per period:

- **Cache TTL**: 1 hour per period
- **Cache Key**: `economics:{orgId}:{period}`
- **Bypass**: Add `?cache=false` to request
- **Note**: After month close, data is considered immutable

Typical response times:
- Cached: 50ms
- Fresh: 200-500ms

---

## Integration with Close Pack Certificate

The unit economics hash is included in the close pack certificate:

```json
{
  "certificate": {
    "period": "2026-01",
    "cost_data_hash": "a3f8c2d1...",
    "revenue_data_hash": "e5f9a3b7...",
    "sealed_at": "2026-02-01T00:04:12.000Z"
  }
}
```

Both hashes must be provided for certificate validation.

---

## Aggregation Examples

### By Cost Center
```sql
SELECT
  cost_center,
  SUM(cost) as total_cost,
  SUM(request_count) as request_count,
  (SELECT SUM(revenue_amount) FROM revenue_entries
   WHERE cost_center = usage_logs.cost_center
   AND period = '2026-01') as revenue
FROM usage_logs
WHERE org_id = 'org_123'
  AND created_at BETWEEN '2026-01-01' AND '2026-02-01'
GROUP BY cost_center
ORDER BY total_cost DESC
```

### By Model
```sql
SELECT
  model,
  SUM(cost) as total_cost,
  SUM(request_count) as request_count,
  AVG(cost) / AVG(request_count) as avg_cost_per_request
FROM usage_logs
WHERE org_id = 'org_123'
  AND created_at BETWEEN '2026-01-01' AND '2026-02-01'
GROUP BY model
ORDER BY total_cost DESC
```

---

## Webhook Events (Future)

When economics data is generated or verified:

```json
{
  "event": "economics.generated",
  "organization_id": "org_123",
  "period": "2026-01",
  "timestamp": "2026-02-01T12:34:56.789Z",
  "data": {
    "total_spend": 47283.19,
    "total_revenue": 52840.00,
    "margin_pct": 11
  }
}
```

---

## Testing

### Valid Test Periods
- `2026-01` - January 2026
- `2025-12` - December 2025
- `2024-06` - June 2024

### Invalid Test Periods
- `2026-13` - Invalid month
- `2026-1` - Missing zero-padding
- `2026` - Missing month
- `2027-01` - Future date

### Test Commands

```bash
# Test with revenue data
curl -X POST http://localhost:8787/v1/close-pack/economics \
  -H "Authorization: Bearer test_token_123" \
  -H "Content-Type: application/json" \
  -d '{"period":"2026-01"}'

# Test without revenue data (graceful degradation)
curl -X POST http://localhost:8787/v1/close-pack/economics \
  -H "Authorization: Bearer test_token_123" \
  -H "Content-Type: application/json" \
  -d '{"period":"2025-01"}'

# Test hash verification
curl -X POST http://localhost:8787/v1/close-pack/economics/verify \
  -H "Authorization: Bearer test_token_123" \
  -H "Content-Type: application/json" \
  -d '{
    "period":"2026-01",
    "hash":"a3f8c2d1e9b74a6f2c8d5e1b3a7f9c4d2e6b8a1f5c3d7e9a4b6f8c2d1e3a5b7f"
  }'
```

---

## Changelog

### v1.0 (2026-02-01)
- Initial release
- POST /v1/close-pack/economics
- GET /v1/close-pack/economics/{period}
- POST /v1/close-pack/economics/verify
- Bessemer benchmark classifications
- Model mix analysis
- Cost center profitability
- Automatic recommendations
- Progressive disclosure for missing revenue data
