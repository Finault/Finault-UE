# Margin Alerts - Implementation Examples

Complete working examples for testing and integration.

## Setup: Sample Test Data

Before running examples, create test data:

```sql
-- Create test organization
INSERT INTO organizations (id, name, plan_tier, created_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  'Test Company Inc',
  'enterprise',
  NOW()
) ON CONFLICT DO NOTHING;

-- Create test users
INSERT INTO memberships (user_id, organization_id, role, created_at)
VALUES (
  '660e8400-e29b-41d4-a716-446655440001'::uuid,
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  'admin',
  NOW()
) ON CONFLICT DO NOTHING;

-- Create revenue entries for February 2026
INSERT INTO revenue_entries (org_id, period, cost_center, revenue_amount, currency)
VALUES
  -- Profitable customer
  ('550e8400-e29b-41d4-a716-446655440000'::uuid, '2026-02-01', 'customer:acme-corp', 20000.00, 'USD'),

  -- Borderline customer (right at threshold)
  ('550e8400-e29b-41d4-a716-446655440000'::uuid, '2026-02-01', 'customer:beta-inc', 10000.00, 'USD'),

  -- Unprofitable customer
  ('550e8400-e29b-41d4-a716-446655440000'::uuid, '2026-02-01', 'customer:gamma-labs', 8000.00, 'USD'),

  -- Large customer
  ('550e8400-e29b-41d4-a716-446655440000'::uuid, '2026-02-01', 'customer:delta-corp', 50000.00, 'USD')
ON CONFLICT DO NOTHING;

-- Create usage entries (costs) for February 2026
INSERT INTO usage_logs (org_id, cost_center, cost, provider, model, period, created_at)
VALUES
  -- Acme: $12k cost / $20k revenue = 60% (OK)
  ('550e8400-e29b-41d4-a716-446655440000'::uuid, 'customer:acme-corp', 12000.00, 'openai', 'gpt-4', '2026-02-01', NOW()),

  -- Beta: $8k cost / $10k revenue = 80% (AT THRESHOLD - BREACH)
  ('550e8400-e29b-41d4-a716-446655440000'::uuid, 'customer:beta-inc', 8000.00, 'openai', 'gpt-4', '2026-02-01', NOW()),

  -- Gamma: $10k cost / $8k revenue = 125% (NEGATIVE MARGIN)
  ('550e8400-e29b-41d4-a716-446655440000'::uuid, 'customer:gamma-labs', 10000.00, 'openai', 'gpt-4', '2026-02-01', NOW()),

  -- Delta: $25k cost / $50k revenue = 50% (OK)
  ('550e8400-e29b-41d4-a716-446655440000'::uuid, 'customer:delta-corp', 25000.00, 'openai', 'gpt-4', '2026-02-01', NOW())
ON CONFLICT DO NOTHING;
```

## Example 1: Get Default Configuration

### Request
```bash
curl -X GET 'https://your-gateway.example.com/v1/alerts/margin/config' \
  -H 'Authorization: Bearer eyJhbGc...' \
  -H 'Content-Type: application/json'
```

### Response (200 OK)
```json
{
  "orgId": "550e8400-e29b-41d4-a716-446655440000",
  "config": {
    "org_id": "550e8400-e29b-41d4-a716-446655440000",
    "margin_breach_threshold": 80.00,
    "negative_margin_enabled": true,
    "margin_breach_enabled": true,
    "notification_email": null,
    "created_at": "2026-02-26T10:00:00Z",
    "updated_at": "2026-02-26T10:00:00Z"
  }
}
```

## Example 2: Update Configuration

### Request
```bash
curl -X PUT 'https://your-gateway.example.com/v1/alerts/margin/config' \
  -H 'Authorization: Bearer eyJhbGc...' \
  -H 'Content-Type: application/json' \
  -d '{
    "margin_breach_threshold": 75.00,
    "negative_margin_enabled": true,
    "margin_breach_enabled": true,
    "notification_email": "finance-alerts@company.com"
  }'
```

### Response (200 OK)
```json
{
  "orgId": "550e8400-e29b-41d4-a716-446655440000",
  "config": {
    "org_id": "550e8400-e29b-41d4-a716-446655440000",
    "margin_breach_threshold": 75.00,
    "negative_margin_enabled": true,
    "margin_breach_enabled": true,
    "notification_email": "finance-alerts@company.com",
    "created_at": "2026-02-26T10:00:00Z",
    "updated_at": "2026-02-26T10:30:00Z"
  }
}
```

## Example 3: Run Margin Analysis & Generate Alerts

### Request
```bash
curl -X POST 'https://your-gateway.example.com/v1/alerts/margin' \
  -H 'Authorization: Bearer eyJhbGc...' \
  -H 'Content-Type: application/json' \
  -d '{
    "period": "2026-02"
  }'
```

### Response (201 Created)
```json
{
  "orgId": "550e8400-e29b-41d4-a716-446655440000",
  "period": "2026-02",
  "alerts_generated": 2,
  "alerts": [
    {
      "id": "9a1b2c3d-4e5f-6g7h-8i9j-0k1l2m3n4o5p",
      "org_id": "550e8400-e29b-41d4-a716-446655440000",
      "type": "negative_margin",
      "severity": "critical",
      "cost_center": "customer:gamma-labs",
      "message": "You're losing money on customer:gamma-labs. AI cost: $10000.00. Revenue: $8000.00. Monthly loss: $2000.00.",
      "details": {
        "cost": 10000.00,
        "revenue": 8000.00,
        "margin": -2000.00,
        "margin_pct": -25.0,
        "period": "2026-02"
      },
      "acknowledged": false,
      "created_at": "2026-02-26T10:35:00Z"
    },
    {
      "id": "a2b3c4d5-e6f7-8g9h-0i1j-2k3l4m5n6o7p",
      "org_id": "550e8400-e29b-41d4-a716-446655440000",
      "type": "margin_breach",
      "severity": "warning",
      "cost_center": "customer:beta-inc",
      "message": "Customer customer:beta-inc's AI cost-to-serve is now 80.0% of their revenue, above your 75.0% threshold.",
      "details": {
        "cost": 8000.00,
        "revenue": 10000.00,
        "margin": 2000.00,
        "margin_pct": 20.0,
        "threshold": 75.0,
        "period": "2026-02"
      },
      "acknowledged": false,
      "created_at": "2026-02-26T10:35:00Z"
    }
  ],
  "summary": {
    "critical": 1,
    "warning": 1
  }
}
```

**Notes:**
- Customer acme-corp (60% cost-to-serve) - No alert
- Customer beta-inc (80% cost-to-serve) - Margin breach alert (above 75% threshold)
- Customer gamma-labs (125% cost-to-serve) - Negative margin alert (critical)
- Customer delta-corp (50% cost-to-serve) - No alert

## Example 4: List All Unacknowledged Alerts

### Request
```bash
curl -X GET 'https://your-gateway.example.com/v1/alerts/margin?acknowledged=false&limit=50' \
  -H 'Authorization: Bearer eyJhbGc...'
```

### Response (200 OK)
```json
{
  "orgId": "550e8400-e29b-41d4-a716-446655440000",
  "alerts": [
    {
      "id": "9a1b2c3d-4e5f-6g7h-8i9j-0k1l2m3n4o5p",
      "org_id": "550e8400-e29b-41d4-a716-446655440000",
      "type": "negative_margin",
      "severity": "critical",
      "cost_center": "customer:gamma-labs",
      "message": "You're losing money on customer:gamma-labs. AI cost: $10000.00. Revenue: $8000.00. Monthly loss: $2000.00.",
      "details": {
        "cost": 10000.00,
        "revenue": 8000.00,
        "margin": -2000.00,
        "margin_pct": -25.0,
        "period": "2026-02"
      },
      "acknowledged": false,
      "created_at": "2026-02-26T10:35:00Z"
    },
    {
      "id": "a2b3c4d5-e6f7-8g9h-0i1j-2k3l4m5n6o7p",
      "org_id": "550e8400-e29b-41d4-a716-446655440000",
      "type": "margin_breach",
      "severity": "warning",
      "cost_center": "customer:beta-inc",
      "message": "Customer customer:beta-inc's AI cost-to-serve is now 80.0% of their revenue, above your 75.0% threshold.",
      "details": {
        "cost": 8000.00,
        "revenue": 10000.00,
        "margin": 2000.00,
        "margin_pct": 20.0,
        "threshold": 75.0,
        "period": "2026-02"
      },
      "acknowledged": false,
      "created_at": "2026-02-26T10:35:00Z"
    }
  ],
  "total": 2,
  "limit": 50,
  "offset": 0,
  "filters": {
    "period": null,
    "severity": null,
    "acknowledged": false
  }
}
```

## Example 5: List Critical Alerts Only

### Request
```bash
curl -X GET 'https://your-gateway.example.com/v1/alerts/margin?severity=critical&limit=10' \
  -H 'Authorization: Bearer eyJhbGc...'
```

### Response (200 OK)
```json
{
  "orgId": "550e8400-e29b-41d4-a716-446655440000",
  "alerts": [
    {
      "id": "9a1b2c3d-4e5f-6g7h-8i9j-0k1l2m3n4o5p",
      "org_id": "550e8400-e29b-41d4-a716-446655440000",
      "type": "negative_margin",
      "severity": "critical",
      "cost_center": "customer:gamma-labs",
      "message": "You're losing money on customer:gamma-labs. AI cost: $10000.00. Revenue: $8000.00. Monthly loss: $2000.00.",
      "details": {
        "cost": 10000.00,
        "revenue": 8000.00,
        "margin": -2000.00,
        "margin_pct": -25.0,
        "period": "2026-02"
      },
      "acknowledged": false,
      "created_at": "2026-02-26T10:35:00Z"
    }
  ],
  "total": 1,
  "limit": 10,
  "offset": 0,
  "filters": {
    "period": null,
    "severity": "critical",
    "acknowledged": null
  }
}
```

## Example 6: Get Alert Details

### Request
```bash
curl -X GET 'https://your-gateway.example.com/v1/alerts/margin/9a1b2c3d-4e5f-6g7h-8i9j-0k1l2m3n4o5p' \
  -H 'Authorization: Bearer eyJhbGc...'
```

### Response (200 OK)
```json
{
  "orgId": "550e8400-e29b-41d4-a716-446655440000",
  "alert": {
    "id": "9a1b2c3d-4e5f-6g7h-8i9j-0k1l2m3n4o5p",
    "org_id": "550e8400-e29b-41d4-a716-446655440000",
    "type": "negative_margin",
    "severity": "critical",
    "cost_center": "customer:gamma-labs",
    "message": "You're losing money on customer:gamma-labs. AI cost: $10000.00. Revenue: $8000.00. Monthly loss: $2000.00.",
    "details": {
      "cost": 10000.00,
      "revenue": 8000.00,
      "margin": -2000.00,
      "margin_pct": -25.0,
      "period": "2026-02"
    },
    "acknowledged": false,
    "acknowledged_at": null,
    "acknowledged_by": null,
    "created_at": "2026-02-26T10:35:00Z"
  }
}
```

## Example 7: Acknowledge Critical Alert

### Request
```bash
curl -X PUT 'https://your-gateway.example.com/v1/alerts/margin/9a1b2c3d-4e5f-6g7h-8i9j-0k1l2m3n4o5p/acknowledge' \
  -H 'Authorization: Bearer eyJhbGc...' \
  -H 'Content-Type: application/json' \
  -d '{
    "note": "Contacted customer Gamma Labs - price increase approved, effective March 1st"
  }'
```

### Response (200 OK)
```json
{
  "orgId": "550e8400-e29b-41d4-a716-446655440000",
  "alertId": "9a1b2c3d-4e5f-6g7h-8i9j-0k1l2m3n4o5p",
  "status": "acknowledged",
  "acknowledgedAt": "2026-02-26T10:45:00Z",
  "note": "Contacted customer Gamma Labs - price increase approved, effective March 1st"
}
```

## Example 8: List Acknowledged Alerts

### Request
```bash
curl -X GET 'https://your-gateway.example.com/v1/alerts/margin?acknowledged=true' \
  -H 'Authorization: Bearer eyJhbGc...'
```

### Response (200 OK)
```json
{
  "orgId": "550e8400-e29b-41d4-a716-446655440000",
  "alerts": [
    {
      "id": "9a1b2c3d-4e5f-6g7h-8i9j-0k1l2m3n4o5p",
      "org_id": "550e8400-e29b-41d4-a716-446655440000",
      "type": "negative_margin",
      "severity": "critical",
      "cost_center": "customer:gamma-labs",
      "message": "You're losing money on customer:gamma-labs. AI cost: $10000.00. Revenue: $8000.00. Monthly loss: $2000.00.",
      "details": {
        "cost": 10000.00,
        "revenue": 8000.00,
        "margin": -2000.00,
        "margin_pct": -25.0,
        "period": "2026-02"
      },
      "acknowledged": true,
      "acknowledged_at": "2026-02-26T10:45:00Z",
      "acknowledged_by": "550e8400-e29b-41d4-a716-446655440000",
      "created_at": "2026-02-26T10:35:00Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0,
  "filters": {
    "period": null,
    "severity": null,
    "acknowledged": true
  }
}
```

## Example 9: Filter by Period

### Request
```bash
curl -X GET 'https://your-gateway.example.com/v1/alerts/margin?period=2026-02' \
  -H 'Authorization: Bearer eyJhbGc...'
```

### Response (200 OK)
```json
{
  "orgId": "550e8400-e29b-41d4-a716-446655440000",
  "alerts": [
    {
      "id": "9a1b2c3d-4e5f-6g7h-8i9j-0k1l2m3n4o5p",
      "type": "negative_margin",
      "severity": "critical",
      "cost_center": "customer:gamma-labs",
      "details": {
        "period": "2026-02"
      },
      "created_at": "2026-02-26T10:35:00Z"
    },
    {
      "id": "a2b3c4d5-e6f7-8g9h-0i1j-2k3l4m5n6o7p",
      "type": "margin_breach",
      "severity": "warning",
      "cost_center": "customer:beta-inc",
      "details": {
        "period": "2026-02"
      },
      "created_at": "2026-02-26T10:35:00Z"
    }
  ],
  "total": 2,
  "limit": 50,
  "offset": 0,
  "filters": {
    "period": "2026-02",
    "severity": null,
    "acknowledged": null
  }
}
```

## Example 10: Pagination

### Request (Get page 2)
```bash
curl -X GET 'https://your-gateway.example.com/v1/alerts/margin?limit=1&offset=1' \
  -H 'Authorization: Bearer eyJhbGc...'
```

### Response (200 OK)
```json
{
  "orgId": "550e8400-e29b-41d4-a716-446655440000",
  "alerts": [
    {
      "id": "a2b3c4d5-e6f7-8g9h-0i1j-2k3l4m5n6o7p",
      "org_id": "550e8400-e29b-41d4-a716-446655440000",
      "type": "margin_breach",
      "severity": "warning",
      "cost_center": "customer:beta-inc",
      "message": "Customer customer:beta-inc's AI cost-to-serve is now 80.0% of their revenue, above your 75.0% threshold.",
      "details": {
        "cost": 8000.00,
        "revenue": 10000.00,
        "margin": 2000.00,
        "margin_pct": 20.0,
        "threshold": 75.0,
        "period": "2026-02"
      },
      "acknowledged": false,
      "created_at": "2026-02-26T10:35:00Z"
    }
  ],
  "total": 2,
  "limit": 1,
  "offset": 1,
  "filters": {
    "period": null,
    "severity": null,
    "acknowledged": null
  }
}
```

## Error Examples

### Example E1: Invalid Period Format

### Request
```bash
curl -X POST 'https://your-gateway.example.com/v1/alerts/margin' \
  -H 'Authorization: Bearer eyJhbGc...' \
  -d '{"period": "February-2026"}'
```

### Response (400 Bad Request)
```json
{
  "error": "INVALID_REQUEST",
  "message": "Period must be in YYYY-MM format",
  "timestamp": "2026-02-26T10:50:00Z"
}
```

### Example E2: Invalid Threshold Value

### Request
```bash
curl -X PUT 'https://your-gateway.example.com/v1/alerts/margin/config' \
  -H 'Authorization: Bearer eyJhbGc...' \
  -d '{"margin_breach_threshold": 150.00}'
```

### Response (400 Bad Request)
```json
{
  "error": "INVALID_REQUEST",
  "message": "margin_breach_threshold must be between 0 and 100",
  "timestamp": "2026-02-26T10:50:00Z"
}
```

### Example E3: Alert Not Found

### Request
```bash
curl -X GET 'https://your-gateway.example.com/v1/alerts/margin/invalid-id-uuid' \
  -H 'Authorization: Bearer eyJhbGc...'
```

### Response (404 Not Found)
```json
{
  "error": "NOT_FOUND",
  "message": "Alert not found",
  "timestamp": "2026-02-26T10:50:00Z"
}
```

### Example E4: Missing Authentication

### Request
```bash
curl -X GET 'https://your-gateway.example.com/v1/alerts/margin'
```

### Response (401 Unauthorized)
```json
{
  "error": "AUTH_INVALID",
  "message": "Missing or invalid authentication credentials",
  "timestamp": "2026-02-26T10:50:00Z"
}
```

## Integration Scenario: Monthly Finance Review

### Workflow
1. First of month: Automatically run checks via cron
2. Finance team reviews alerts
3. Take action (adjust pricing, reduce costs, etc.)
4. Acknowledge alerts with notes
5. Next month: Check for improvement

### Step-by-Step Example

```bash
# 1. Run analysis for current month
curl -X POST 'https://your-gateway.example.com/v1/alerts/margin' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"period": "2026-02"}'

# Returns: 2 alerts generated

# 2. Get all critical alerts
curl -X GET 'https://your-gateway.example.com/v1/alerts/margin?severity=critical' \
  -H "Authorization: Bearer $TOKEN"

# Returns: 1 critical alert (Gamma Labs losing money)

# 3. View alert details
ALERT_ID="9a1b2c3d-4e5f-6g7h-8i9j-0k1l2m3n4o5p"
curl -X GET "https://your-gateway.example.com/v1/alerts/margin/$ALERT_ID" \
  -H "Authorization: Bearer $TOKEN"

# Returns: Full alert with $2k monthly loss

# 4. Update pricing for Gamma Labs
# (Customer relationship management - external system)
# Price increase: 25% premium → $10k revenue becomes $12.5k

# 5. Acknowledge alert with action taken
curl -X PUT "https://your-gateway.example.com/v1/alerts/margin/$ALERT_ID/acknowledge" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "note": "25% price increase implemented, effective 2026-03-01. Expected to achieve 20% margin."
  }'

# Returns: Alert marked acknowledged

# 6. Next month, check if margin improved
# (March alerts will show $12.5k revenue vs $10k cost = 20% margin - RESOLVED)
```

## Performance Testing

Test concurrent alert operations:

```bash
#!/bin/bash

# Test 1: Generate 10 concurrent alert checks
for i in {1..10}; do
  curl -X POST 'https://your-gateway.example.com/v1/alerts/margin' \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"period\": \"2026-02\"}" &
done
wait
echo "Concurrent check test: OK"

# Test 2: List 100 alerts with pagination
for page in {0..10}; do
  curl -X GET "https://your-gateway.example.com/v1/alerts/margin?limit=10&offset=$((page*10))" \
    -H "Authorization: Bearer $TOKEN"
done
echo "Pagination test: OK"

# Test 3: Acknowledge 10 alerts concurrently
for id in $(curl -s -X GET 'https://your-gateway.example.com/v1/alerts/margin' \
  -H "Authorization: Bearer $TOKEN" | jq -r '.alerts[].id' | head -10); do
  curl -X PUT "https://your-gateway.example.com/v1/alerts/margin/$id/acknowledge" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"note": "Bulk acknowledge test"}' &
done
wait
echo "Bulk acknowledge test: OK"
```

Ready to implement!
