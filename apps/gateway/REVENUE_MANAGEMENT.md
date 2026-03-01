# Revenue Management API - Implementation Guide

## Overview

This document describes the revenue management API endpoints added to the Finault gateway. These endpoints enable tracking of revenue/pricing data and calculating unit economics (cost-to-serve joined with revenue to determine profitability).

## Database Schema

### `revenue_entries` Table

Location: `/sql/revenue_entries.sql`

**Purpose**: Store revenue/pricing data for unit economics calculations

**Columns**:
- `id` (UUID) - Primary key
- `org_id` (UUID) - Organization ID (references organizations table)
- `period` (DATE) - Revenue period (YYYY-MM-DD format)
- `cost_center` (TEXT) - Optional cost center identifier (e.g., "customer:acme", "feature:billing")
- `revenue_amount` (DECIMAL(12,2)) - Revenue amount (never negative)
- `currency` (TEXT) - ISO 4217 currency code (default: USD)
- `notes` (TEXT) - Optional notes about the revenue entry
- `created_at` (TIMESTAMPTZ) - Record creation timestamp
- `updated_at` (TIMESTAMPTZ) - Record update timestamp (auto-managed)

**Constraints**:
- `UNIQUE(org_id, period, cost_center)` - One revenue entry per organization/period/cost_center combination
- Foreign key on `org_id` references `organizations(id)` with cascading delete

**Indexes**:
- `idx_revenue_entries_org_period` - Fast lookup by organization and period (primary query pattern)
- `idx_revenue_entries_cost_center` - For cost_center filtering in unit economics
- `idx_revenue_entries_created_at` - For time-range queries

**RLS Policies**:
- Users can only see/modify revenue entries for their organization
- Only admins and owners can modify entries

**Helper View**:
- `revenue_summary` - Monthly aggregation by organization and cost center

## API Endpoints

### 1. Create/Upsert Revenue Entry

```
POST /v1/revenue
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "period": "2025-02-26",
  "cost_center": "customer:acme-corp",
  "revenue_amount": 10000.00,
  "currency": "USD",
  "notes": "Monthly SaaS subscription"
}
```

**Required Fields**:
- `period` - YYYY-MM-DD format
- `revenue_amount` - Non-negative decimal

**Optional Fields**:
- `cost_center` - String identifier
- `currency` - 3-letter ISO code (defaults to USD)
- `notes` - Free-form text

**Response** (201 Created or 200 OK if upserted):
```json
{
  "success": true,
  "operation": "created",
  "revenue": {
    "id": "uuid",
    "org_id": "uuid",
    "period": "2025-02-26",
    "cost_center": "customer:acme-corp",
    "revenue_amount": 10000.00,
    "currency": "USD",
    "notes": "Monthly SaaS subscription",
    "created_at": "2025-02-26T12:34:56Z",
    "updated_at": "2025-02-26T12:34:56Z"
  }
}
```

**Behavior**:
- If a revenue entry already exists for org_id/period/cost_center, it is updated instead of creating a duplicate
- Upsert pattern prevents database constraint violations
- The `created_at` timestamp is preserved on upsert

**Error Cases**:
- 400: Missing required fields or invalid format
- 500: Database error

---

### 2. List Revenue Entries

```
GET /v1/revenue?period=2025-02&cost_center=customer:acme&limit=100&offset=0
Authorization: Bearer <token>
```

**Query Parameters**:
- `period` - Optional: YYYY-MM (month range) or YYYY-MM-DD (exact date)
- `cost_center` - Optional: Filter to specific cost center
- `limit` - Optional: Pagination limit (default 100, max 1000)
- `offset` - Optional: Pagination offset (default 0)

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "org_id": "uuid",
      "period": "2025-02-15",
      "cost_center": "customer:acme-corp",
      "revenue_amount": 10000.00,
      "currency": "USD",
      "created_at": "2025-02-26T12:34:56Z",
      "updated_at": "2025-02-26T12:34:56Z"
    }
  ],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "total": 150,
    "hasMore": true
  }
}
```

**Period Filtering Logic**:
- If `period=2025-02` (month): Returns all entries from 2025-02-01 to 2025-02-28
- If `period=2025-02-15` (exact date): Returns only that specific date

**Ordering**: Results sorted by period descending, then cost_center ascending

---

### 3. Update Revenue Entry

```
PUT /v1/revenue/:id
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body** (any or all fields):
```json
{
  "revenue_amount": 12000.00,
  "currency": "EUR",
  "notes": "Updated subscription amount"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "revenue": {
    "id": "uuid",
    "revenue_amount": 12000.00,
    "currency": "EUR",
    "notes": "Updated subscription amount",
    "updated_at": "2025-02-26T13:00:00Z"
  }
}
```

**Immutable Fields** (cannot be changed):
- `id`
- `org_id` - Prevents cross-org manipulation
- `period` - Prevents date tampering
- `cost_center` - Prevents cost center reassignment
- `created_at` - Preserves original creation time

**The `updated_at` timestamp is automatically set to the current time**

**Error Cases**:
- 400: Invalid field values
- 404: Revenue entry not found for your organization
- 500: Database error

---

### 4. Delete Revenue Entry

```
DELETE /v1/revenue/:id
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "deleted": true,
  "id": "uuid"
}
```

**Error Cases**:
- 404: Revenue entry not found for your organization
- 500: Database error

---

### 5. Unit Economics Analysis

```
GET /v1/analytics/unit-economics?period=2025-02&group_by=customer&limit=50
Authorization: Bearer <token>
```

**Required Query Parameters**:
- `period` - YYYY-MM format (required)
- `group_by` - One of: `customer`, `feature`, `product` (required)

**Optional Query Parameters**:
- `cost_center` - Filter results to specific cost center
- `limit` - Pagination limit (default 50, max 500)

**Response** (200 OK):
```json
{
  "success": true,
  "period": "2025-02",
  "group_by": "customer",
  "total_items": 3,
  "summary": {
    "total_revenue": 45000.00,
    "total_cost": 38000.00,
    "total_margin": 7000.00,
    "total_requests": 125000,
    "avg_margin_pct": 18
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
    },
    {
      "cost_center": "customer:acme-corp",
      "revenue": 20000.00,
      "total_cost": 15800.00,
      "margin": 4200.00,
      "margin_pct": 21,
      "request_count": 60000,
      "avg_cost_per_request": 0.2633,
      "days_active": 28,
      "status": "healthy"
    },
    {
      "cost_center": "customer:enterprise-inc",
      "revenue": 20000.00,
      "total_cost": 16000.00,
      "margin": 4000.00,
      "margin_pct": 20,
      "request_count": 50000,
      "avg_cost_per_request": 0.3200,
      "days_active": 25,
      "status": "healthy"
    }
  ]
}
```

**What This Endpoint Does**:

1. **Queries `revenue_entries`** for the specified period and organization
2. **Queries `usage_logs`** for the same period to get cost-to-serve data
3. **Joins and aggregates** by cost_center
4. **Calculates metrics**:
   - `margin` = revenue - total_cost
   - `margin_pct` = (margin / revenue) * 100
   - `avg_cost_per_request` = total_cost / request_count
   - `status` = categorized profitability (unprofitable/low_margin/healthy)
5. **Sorts by margin ascending** (unprofitable first — highlights problem areas)
6. **Returns summary statistics** across all items

**Key Insights**:

- **Negative margins** indicate loss-making customer segments
- **Low margins** (0-20%) indicate thin profitability
- **Status "unprofitable"** should trigger immediate investigation
- **Average cost per request** helps identify scaling issues
- **Days active** shows engagement level

**Typical Use Cases**:
- Identify which customers are unprofitable
- Find features with high cost-to-serve
- Understand pricing adequacy
- Guide go-to-market strategy

**Error Cases**:
- 400: Missing required parameters or invalid format
- 500: Database query error

---

## Authentication & Authorization

All revenue endpoints require JWT authentication:

```
Authorization: Bearer <jwt_token>
```

**Authorization Rules**:
- Users can only access revenue entries for their organization
- Only admins and owners can create/update/delete entries
- Organization ID is extracted from JWT claims (`orgId` field)

**JWT Claims Expected**:
```json
{
  "orgId": "uuid",
  "userId": "uuid",
  "role": "admin|owner|viewer",
  "email": "user@org.com"
}
```

---

## Data Model & Integration

### Revenue Entries ↔ Usage Logs Join

The unit economics endpoint joins two tables:

**`revenue_entries`** (what we charge)
```
org_id | period | cost_center | revenue_amount
-------|--------|-------------|----------------
abc123 | 2025-02-26 | customer:acme | 10000.00
```

**`usage_logs`** (what we spend)
```
org_id | cost_center | created_at | total_cost | request_count
-------|-------------|-----------|-----------|---------------
abc123 | customer:acme | 2025-02-26 | 8000.00 | 40000
```

**Resulting Unit Economics**:
```
cost_center: "customer:acme"
revenue: 10000
total_cost: 8000
margin: 2000
margin_pct: 20
avg_cost_per_request: 0.20
```

### Cost Center Naming Convention

Cost centers follow a hierarchical naming pattern:

```
customer:<name>        - Revenue/costs per customer
feature:<name>         - Revenue/costs per feature
product:<name>         - Revenue/costs per product
```

Examples:
- `customer:acme-corp` - Tracks costs for Acme Corp customer
- `feature:billing` - Tracks costs for billing feature
- `product:enterprise` - Tracks costs for enterprise product tier

This allows flexible grouping of unit economics by different dimensions.

---

## Implementation Details

### Route Handlers

**Location**: `/sessions/gifted-busy-shannon/mnt/Finault-Enterprise-Hardening/finault-monorepo/apps/gateway/gateway-wired.js`

**Routing Logic** (lines 2137-2160):
```javascript
// Revenue CRUD endpoints
if (path === '/v1/revenue') {
  if (request.method === 'GET') return await listRevenue(request, env);
  if (request.method === 'POST') return await createRevenue(request, env);
  return methodNotAllowed();
}

// Revenue by ID
if (path.match(/^\/v1\/revenue\/[a-f0-9-]{36}$/)) {
  const revenueId = path.split('/').pop();
  if (request.method === 'PUT') return await updateRevenue(request, env, revenueId);
  if (request.method === 'DELETE') return await deleteRevenue(request, env, revenueId);
  return methodNotAllowed();
}

// Unit economics analysis
if (path === '/v1/analytics/unit-economics') {
  if (request.method === 'GET') return await handleUnitEconomics(request, env);
  return methodNotAllowed();
}
```

**Handler Functions** (lines 18035-18400+):
- `createRevenue()` - POST logic with upsert support
- `listRevenue()` - GET with filtering and pagination
- `updateRevenue()` - PUT with immutable field protection
- `deleteRevenue()` - DELETE with org isolation
- `handleUnitEconomics()` - JOIN + aggregation + calculations

### Error Handling

All handlers follow consistent error patterns:

```javascript
try {
  // Validate org_id from JWT
  const orgId = request._user?.orgId || request.orgId;
  if (!orgId) return jsonResponse({ error: 'Organization context required' }, 400);

  // Validate request format
  const validation = await validateRevenueEntry(body);
  if (!validation.valid) {
    return jsonResponse({ error: validation.error }, 400);
  }

  // Database operation
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/revenue_entries`, {
    method: 'POST',
    headers: getSupabaseHeaders(env),
    body: JSON.stringify(record)
  });

  if (!response.ok) {
    const error = await response.text();
    return jsonResponse({ error: `Failed: ${error}` }, 500);
  }

  // Success response
  const created = await response.json();
  return jsonResponse({ success: true, revenue: created[0] }, 201);
} catch (error) {
  console.error('[REVENUE] Error:', error);
  return jsonResponse({ error: error.message }, 500);
}
```

### Input Validation

**Revenue Amount**:
- Must be a number
- Must be non-negative
- Validated as: `typeof body.revenue_amount === 'number' && body.revenue_amount >= 0`

**Period**:
- Must match YYYY-MM-DD format
- Validated as: `/^\d{4}-\d{2}-\d{2}$/.test(period)`

**Currency**:
- Must match ISO 4217 (3-letter code)
- Validated as: `/^[A-Z]{3}$/.test(currency)`

**Cost Center**:
- Optional string
- No format restrictions (user-defined)

### Database Parameterization

All database queries use Supabase REST API with proper URL encoding:

```javascript
// Safe parameter encoding
const costCenterFilter = body.cost_center
  ? `&cost_center=eq.${encodeURIComponent(body.cost_center)}`
  : '&cost_center=is.null';

// No string interpolation in query values
const updateUrl = `${env.SUPABASE_URL}/rest/v1/revenue_entries?org_id=eq.${orgId}&period=eq.${body.period}${costCenterFilter}`;
```

---

## Testing

### Example Requests

**1. Create revenue entry**:
```bash
curl -X POST https://api.finault.ai/v1/revenue \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{
    "period": "2025-02-26",
    "cost_center": "customer:acme-corp",
    "revenue_amount": 10000,
    "currency": "USD",
    "notes": "Monthly subscription"
  }'
```

**2. List revenue entries for February**:
```bash
curl https://api.finault.ai/v1/revenue?period=2025-02 \
  -H "Authorization: Bearer eyJ..."
```

**3. Update revenue entry**:
```bash
curl -X PUT https://api.finault.ai/v1/revenue/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{
    "revenue_amount": 12000
  }'
```

**4. Get unit economics for February**:
```bash
curl 'https://api.finault.ai/v1/analytics/unit-economics?period=2025-02&group_by=customer' \
  -H "Authorization: Bearer eyJ..."
```

---

## Deployment Checklist

- [ ] Create `revenue_entries` table using `/sql/revenue_entries.sql`
- [ ] Verify RLS policies are enabled
- [ ] Create indexes for performance
- [ ] Add revenue handler module (`/src/handlers/revenue.js`) - optional modularization
- [ ] Add routes to gateway-wired.js (already done)
- [ ] Test with sample data
- [ ] Monitor for query performance
- [ ] Set up monitoring on unit economics queries (can be CPU-intensive)

---

## Performance Considerations

### Indexes
The schema includes three indexes optimized for common query patterns:
- `idx_revenue_entries_org_period` - Fastest for org + period filters
- `idx_revenue_entries_cost_center` - Supports cost center grouping
- `idx_revenue_entries_created_at` - Time-based range queries

### Unit Economics Query Performance
This endpoint performs:
1. Revenue query (indexed by org_id + period)
2. Usage logs query (should also be indexed)
3. In-memory aggregation and calculations

**Optimization Tips**:
- Ensure usage_logs table has indexes on (org_id, created_at)
- Consider caching unit economics results (they're historical data)
- Limit monthly lookbacks to prevent large result sets

### Pagination
All list endpoints support pagination to prevent memory exhaustion:
- Default limit: 100
- Maximum limit: 1000
- Use `offset` parameter for subsequent pages

---

## Future Enhancements

1. **Bulk Import**: POST /v1/revenue/bulk - Import multiple entries in one call
2. **Forecast**: POST /v1/analytics/forecast - Predict future revenue/margins
3. **Alerts**: POST /v1/alerts - Trigger when margin drops below threshold
4. **Variance Analysis**: Compare actual vs. forecasted revenue
5. **Cost Attribution**: Improve cost center mapping from usage logs
6. **Currency Conversion**: Support multi-currency unit economics
7. **Time Series**: Return unit economics over multiple periods for trend analysis

---

## Troubleshooting

### Common Issues

**"Organization context required"**
- Verify JWT token is valid
- Check that `orgId` claim is present in token
- Ensure Authorization header format: `Bearer <token>`

**409 Conflict on POST**
- This is expected behavior for upsert operations
- The endpoint automatically updates existing entries
- Check response.operation field (will be "upserted")

**Empty results in unit-economics**
- Verify revenue entries exist for the requested period
- Check that usage_logs have data for the same period
- Ensure cost_center values match between tables

**Slow unit economics queries**
- Monitor the time-range of the query
- Consider archiving old data
- Add caching layer for historical periods

---

## References

- SQL Schema: `/sql/revenue_entries.sql`
- Gateway Routes: `/gateway-wired.js` (lines 2137-2160)
- Handler Functions: `/gateway-wired.js` (lines 18035+)
- Supabase REST API: https://supabase.com/docs/reference/api/rest
