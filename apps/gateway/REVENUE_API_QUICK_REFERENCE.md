# Revenue Management API - Quick Reference

## Endpoints at a Glance

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/v1/revenue` | Create or upsert revenue entry |
| GET | `/v1/revenue` | List revenue entries with filtering |
| PUT | `/v1/revenue/:id` | Update revenue entry |
| DELETE | `/v1/revenue/:id` | Delete revenue entry |
| GET | `/v1/analytics/unit-economics` | Get unit economics (cost + revenue = margin) |

## Authentication

All endpoints require JWT bearer token:
```
Authorization: Bearer <jwt_token>
```

## POST /v1/revenue - Create/Upsert

```json
{
  "period": "2025-02-26",
  "cost_center": "customer:acme-corp",
  "revenue_amount": 10000.00,
  "currency": "USD",
  "notes": "Monthly subscription"
}
```

**Response (201 Created)**:
```json
{
  "success": true,
  "operation": "created",
  "revenue": { ... }
}
```

**Notes**:
- If entry exists for period + cost_center, it's updated instead
- `currency` defaults to USD
- All fields except period/revenue_amount are optional
- Returns 409 → 200 for upserts (not errors)

---

## GET /v1/revenue - List

```
/v1/revenue?period=2025-02&cost_center=customer:acme&limit=100&offset=0
```

**Query Parameters**:
- `period` - YYYY-MM (month range) or YYYY-MM-DD (exact) - optional
- `cost_center` - Filter by cost center - optional
- `limit` - Max results (default 100, max 1000)
- `offset` - Pagination offset (default 0)

**Response (200 OK)**:
```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "total": 150,
    "hasMore": true
  }
}
```

---

## PUT /v1/revenue/:id - Update

```json
{
  "revenue_amount": 12000.00,
  "currency": "EUR",
  "notes": "Updated amount"
}
```

**Immutable fields** (cannot change):
- `id`, `org_id`, `period`, `cost_center`, `created_at`

**Response (200 OK)**:
```json
{
  "success": true,
  "revenue": { ... }
}
```

---

## DELETE /v1/revenue/:id - Delete

```
DELETE /v1/revenue/{id}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "deleted": true,
  "id": "uuid"
}
```

---

## GET /v1/analytics/unit-economics - Analysis

```
/v1/analytics/unit-economics?period=2025-02&group_by=customer&cost_center=customer:acme&limit=50
```

**Required Parameters**:
- `period` - YYYY-MM (required)
- `group_by` - customer | feature | product (required)

**Optional Parameters**:
- `cost_center` - Filter to specific cost center
- `limit` - Max results (default 50, max 500)

**Response (200 OK)**:
```json
{
  "success": true,
  "period": "2025-02",
  "group_by": "customer",
  "total_items": 5,
  "summary": {
    "total_revenue": 100000.00,
    "total_cost": 75000.00,
    "total_margin": 25000.00,
    "total_requests": 500000,
    "avg_margin_pct": 25
  },
  "data": [
    {
      "cost_center": "customer:startup-xyz",
      "revenue": 5000.00,
      "total_cost": 6200.00,
      "margin": -1200.00,
      "margin_pct": -24,
      "request_count": 15000,
      "avg_cost_per_request": 0.4133,
      "days_active": 28,
      "status": "unprofitable"
    }
  ]
}
```

**Result Sorting**: Ascending by margin (unprofitable first)

**Status Values**:
- `unprofitable` - margin < 0 (losing money)
- `low_margin` - margin >= 0 but < 20%
- `healthy` - margin >= 20%

---

## Error Responses

**400 Bad Request** - Validation error:
```json
{
  "error": "period must be in YYYY-MM-DD format"
}
```

**400 Bad Request** - Missing org context:
```json
{
  "error": "Organization context required"
}
```

**404 Not Found** - Resource doesn't exist:
```json
{
  "error": "Revenue entry not found"
}
```

**500 Internal Server Error** - Database error:
```json
{
  "error": "Failed to create revenue: database connection timeout"
}
```

---

## Cost Center Naming

Use hierarchical naming convention:

```
customer:<name>      # Per-customer profitability
feature:<name>       # Per-feature profitability
product:<name>       # Per-product tier profitability
unassigned          # Default if no cost_center provided
```

Examples:
- `customer:acme-corp`
- `customer:startup-xyz`
- `feature:billing`
- `feature:api`
- `product:enterprise`
- `product:starter`

---

## Common Workflows

### Track Monthly Revenue

```bash
# January revenue for customer X
curl -X POST https://api.finault.ai/v1/revenue \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "period": "2025-01-31",
    "cost_center": "customer:acme-corp",
    "revenue_amount": 10000
  }'

# February (upsert if exists)
curl -X POST https://api.finault.ai/v1/revenue \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "period": "2025-02-28",
    "cost_center": "customer:acme-corp",
    "revenue_amount": 12000
  }'
```

### Find Unprofitable Customers

```bash
# Get all customers losing money
curl 'https://api.finault.ai/v1/analytics/unit-economics?period=2025-02&group_by=customer' \
  -H "Authorization: Bearer $TOKEN" | \
  jq '.data[] | select(.status == "unprofitable")'
```

### Analyze Feature Profitability

```bash
# Which features are most profitable?
curl 'https://api.finault.ai/v1/analytics/unit-economics?period=2025-02&group_by=feature&limit=100' \
  -H "Authorization: Bearer $TOKEN" | \
  jq '.data | sort_by(.margin_pct) | reverse'
```

### Update Revenue After Negotiation

```bash
# Customer upgraded mid-month
curl -X PUT https://api.finault.ai/v1/revenue/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "revenue_amount": 15000,
    "notes": "Upgraded to premium plan"
  }'
```

### Track Multiple Revenue Streams

```bash
# Per-feature revenue tracking
curl -X POST https://api.finault.ai/v1/revenue \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "period": "2025-02-26",
    "cost_center": "feature:api",
    "revenue_amount": 5000,
    "notes": "API usage charges"
  }'

curl -X POST https://api.finault.ai/v1/revenue \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "period": "2025-02-26",
    "cost_center": "feature:billing",
    "revenue_amount": 3000,
    "notes": "Premium billing addon"
  }'
```

---

## Performance Tips

1. **Pagination**: Use limit/offset for large result sets
   ```
   /v1/revenue?limit=100&offset=0
   /v1/revenue?limit=100&offset=100
   ```

2. **Period Filtering**: Filter by month when possible (YYYY-MM)
   ```
   /v1/revenue?period=2025-02      # Fast - month range
   /v1/revenue?period=2025-02-15   # Slower - exact match
   ```

3. **Unit Economics**: Cache results for past months
   ```
   # First time (might be slow)
   GET /v1/analytics/unit-economics?period=2025-01

   # Second time (should be cached by API client)
   GET /v1/analytics/unit-economics?period=2025-01
   ```

4. **Bulk Operations**: Multiple POST requests are fine
   ```
   for month in 202501 202502 202503; do
     POST /v1/revenue with period=$month
   done
   ```

---

## Debugging

**Check token claims**:
```bash
# Decode JWT to verify orgId claim
jq -R 'split(".") | .[1] | @base64d | fromjson' <<< "$TOKEN"
```

**Test unit economics query**:
```bash
# Verify revenue data exists
curl 'https://api.finault.ai/v1/revenue?period=2025-02' \
  -H "Authorization: Bearer $TOKEN" | jq '.data | length'

# Check for matching usage logs in backend logs
```

**Validate period format**:
```bash
# Must be YYYY-MM or YYYY-MM-DD
echo "2025-02-26" | grep -E '^\d{4}-\d{2}-\d{2}$' && echo "Valid"
echo "2025-02" | grep -E '^\d{4}-\d{2}$' && echo "Valid"
```

---

## Files

- **SQL Schema**: `/sql/revenue_entries.sql`
- **API Docs**: `/REVENUE_MANAGEMENT.md` (detailed)
- **Routes**: `/gateway-wired.js` lines 2137-2160
- **Handlers**: `/gateway-wired.js` lines 18035+
- **Module** (optional): `/src/handlers/revenue.js`

---

## Related Resources

- [Finault Gateway Overview](./gateway-wired.js)
- [Supabase REST API Docs](https://supabase.com/docs/reference/api/rest)
- [Full Revenue Management Docs](./REVENUE_MANAGEMENT.md)
