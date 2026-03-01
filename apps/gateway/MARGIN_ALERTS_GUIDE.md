# Margin Alerts Implementation Guide

## Overview

The Margin Alerts module extends Finault's anomaly detection system with two new alert types for monitoring customer profitability:

1. **Margin Breach** - When cost-to-serve exceeds a configured percentage of revenue (default 80%)
2. **Negative Margin** - When AI costs exceed total revenue (margin < 0)

This enables finance teams to identify unprofitable customers and adjust pricing or reduce costs before losses accumulate.

## Architecture

### Components

```
src/handlers/margin-alerts.js
├── handleMarginAlertsList()      - List alerts with filtering
├── handleMarginAlertDetail()     - Get single alert details
├── handleMarginAlertAck()        - Mark alert as acknowledged
├── handleMarginAlertConfig()     - Get/update config
├── handleMarginAlertsCheck()     - Trigger alert generation
├── checkMarginAlerts()           - Core detection logic
├── getMarginAlertConfig()        - Fetch org config with defaults
└── processMarginAlerts()         - Store & notify

sql/margin_alerts.sql
├── margin_alerts               - Main alert table
├── margin_alert_config         - Configuration per org
└── Helper views               - Summaries & risk profiles
```

### Database Schema

#### `margin_alerts` Table
```sql
- id: UUID (PK)
- org_id: UUID (FK to organizations)
- type: TEXT (margin_breach | negative_margin)
- severity: TEXT (warning | critical)
- cost_center: TEXT (customer identifier)
- message: TEXT (human-readable alert)
- details: JSONB (metrics: cost, revenue, margin, period, etc.)
- acknowledged: BOOLEAN
- acknowledged_at: TIMESTAMPTZ
- acknowledged_by: UUID
- created_at: TIMESTAMPTZ
```

#### `margin_alert_config` Table
```sql
- org_id: UUID (PK, FK to organizations)
- margin_breach_threshold: DECIMAL(5,2) (default 80.00)
- negative_margin_enabled: BOOLEAN (default true)
- margin_breach_enabled: BOOLEAN (default true)
- notification_email: TEXT (optional)
- created_at: TIMESTAMPTZ
- updated_at: TIMESTAMPTZ
```

## API Endpoints

### 1. List Margin Alerts
```
GET /v1/alerts/margin?period=2026-02&severity=critical&acknowledged=false&limit=50&offset=0
```

**Query Parameters:**
- `period` (optional): Filter by month (YYYY-MM format)
- `severity` (optional): Filter by severity (warning | critical)
- `acknowledged` (optional): Filter by acknowledgment status (true | false)
- `limit` (optional): Results per page (default 50)
- `offset` (optional): Pagination offset (default 0)

**Response:**
```json
{
  "orgId": "uuid",
  "alerts": [
    {
      "id": "uuid",
      "org_id": "uuid",
      "type": "negative_margin",
      "severity": "critical",
      "cost_center": "customer:acme-corp",
      "message": "You're losing money on customer:acme-corp. AI cost: $8200.00. Revenue: $5200.00. Monthly loss: $3000.00.",
      "details": {
        "cost": 8200.00,
        "revenue": 5200.00,
        "margin": -3000.00,
        "margin_pct": -57.7,
        "period": "2026-02"
      },
      "acknowledged": false,
      "created_at": "2026-02-26T10:30:00Z"
    }
  ],
  "total": 5,
  "limit": 50,
  "offset": 0
}
```

### 2. Get Alert Details
```
GET /v1/alerts/margin/:id
```

**Response:**
```json
{
  "orgId": "uuid",
  "alert": {
    "id": "uuid",
    "type": "margin_breach",
    "severity": "warning",
    "cost_center": "customer:beta-inc",
    "message": "Customer customer:beta-inc's AI cost-to-serve is now 85.3% of their revenue, above your 80.0% threshold.",
    "details": {
      "cost": 4250.00,
      "revenue": 5000.00,
      "margin": 750.00,
      "margin_pct": 15.0,
      "threshold": 80.0,
      "period": "2026-02"
    },
    "acknowledged": false,
    "created_at": "2026-02-26T09:15:00Z"
  }
}
```

### 3. Acknowledge Alert
```
PUT /v1/alerts/margin/:id/acknowledge
Content-Type: application/json

{
  "note": "Discussed with sales team - price increase planned"
}
```

**Response:**
```json
{
  "orgId": "uuid",
  "alertId": "uuid",
  "status": "acknowledged",
  "acknowledgedAt": "2026-02-26T11:00:00Z",
  "note": "Discussed with sales team - price increase planned"
}
```

### 4. Get Configuration
```
GET /v1/alerts/margin/config
```

**Response:**
```json
{
  "orgId": "uuid",
  "config": {
    "org_id": "uuid",
    "margin_breach_threshold": 80.00,
    "negative_margin_enabled": true,
    "margin_breach_enabled": true,
    "notification_email": "finance@company.com",
    "created_at": "2026-01-01T00:00:00Z",
    "updated_at": "2026-02-20T14:30:00Z"
  }
}
```

### 5. Update Configuration
```
PUT /v1/alerts/margin/config
Content-Type: application/json

{
  "margin_breach_threshold": 75.00,
  "negative_margin_enabled": true,
  "margin_breach_enabled": true,
  "notification_email": "alerts@company.com"
}
```

**Response:**
```json
{
  "orgId": "uuid",
  "config": {
    "org_id": "uuid",
    "margin_breach_threshold": 75.00,
    "negative_margin_enabled": true,
    "margin_breach_enabled": true,
    "notification_email": "alerts@company.com",
    "updated_at": "2026-02-26T11:05:00Z"
  }
}
```

### 6. Check Margins & Generate Alerts
```
POST /v1/alerts/margin
Content-Type: application/json

{
  "period": "2026-02"
}
```

**Response:**
```json
{
  "orgId": "uuid",
  "period": "2026-02",
  "alerts_generated": 3,
  "alerts": [
    {
      "id": "uuid",
      "type": "negative_margin",
      "severity": "critical",
      "cost_center": "customer:acme-corp",
      "message": "You're losing money on customer:acme-corp. AI cost: $8200.00. Revenue: $5200.00. Monthly loss: $3000.00.",
      "details": {
        "cost": 8200.00,
        "revenue": 5200.00,
        "margin": -3000.00,
        "margin_pct": -57.7,
        "period": "2026-02"
      },
      "created_at": "2026-02-26T10:30:00Z"
    }
  ],
  "summary": {
    "critical": 1,
    "warning": 2
  }
}
```

## Data Flow

### Alert Generation Process

```
1. POST /v1/alerts/margin (trigger check)
   ↓
2. getMarginAlertConfig()
   ├─ Query margin_alert_config table
   └─ Use defaults if not configured
   ↓
3. getAggregatedCosts()
   ├─ Query usage_logs by cost_center
   └─ SUM(cost) grouped by cost_center for period
   ↓
4. getRevenueByCenter()
   ├─ Query revenue_entries by cost_center
   └─ SUM(revenue) grouped by cost_center for period
   ↓
5. checkMarginAlerts()
   ├─ For each cost_center:
   │  ├─ Calculate margin = revenue - cost
   │  ├─ Calculate margin % = (margin / revenue) * 100
   │  ├─ Calculate cost-to-serve % = (cost / revenue) * 100
   │  ├─ Check: margin < 0 → negative_margin alert
   │  └─ Check: cost-to-serve > threshold → margin_breach alert
   ↓
6. processMarginAlerts()
   ├─ INSERT alerts into margin_alerts table
   └─ Trigger notifications (email, Slack, webhooks)
```

### Integration with Revenue Data

The margin alerts system requires revenue data in the `revenue_entries` table:

```sql
INSERT INTO revenue_entries (org_id, period, cost_center, revenue_amount)
VALUES (
  'org-uuid',
  '2026-02-01',
  'customer:acme-corp',
  15000.00
);
```

Alerts match on:
- `org_id` - Your organization
- `cost_center` - Customer/business unit identifier
- `period` - Year-month extracted from the date

## Cron Integration

To run margin checks automatically, add to your cron scheduler:

```javascript
// In your cron handler or scheduled job processor
import { checkMarginAlerts, processMarginAlerts } from './handlers/margin-alerts.js';

async function runMonthlyMarginChecks() {
  const orgs = await supabase.from('organizations').select('id');

  for (const org of orgs.data) {
    try {
      // Default to current month
      const now = new Date();
      const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const config = await getMarginAlertConfig(org.id, supabase);
      const alerts = await checkMarginAlerts(org.id, period, supabase, config);

      if (alerts.length > 0) {
        await processMarginAlerts(alerts, org.id, supabase);
        console.log(`[MARGIN-ALERTS] Generated ${alerts.length} alerts for org ${org.id}`);
      }
    } catch (error) {
      console.error(`[MARGIN-ALERTS] Error checking org ${org.id}:`, error);
    }
  }
}

// Run on 1st of month at 6 AM
schedule('0 6 1 * *', runMonthlyMarginChecks);
```

## Alert Severity Levels

### Critical
- **Negative Margin**: Organization is losing money on a customer
- Action: Immediate pricing adjustment, cost reduction, or customer termination
- Notification: Always sent

### Warning
- **Margin Breach**: Cost-to-serve exceeds configured threshold (default 80%)
- Action: Review pricing, optimize costs, consider price adjustment
- Notification: On demand or via config

## Key Features

### 1. Configurable Thresholds
- Default margin breach threshold: 80% (customizable per org)
- Margin breach alerts can be disabled entirely
- Negative margin alerts can be disabled entirely

### 2. Cost Center Isolation
- Alerts are per cost_center (customer/business unit)
- Each cost center independently analyzed
- Clear identification of problem areas

### 3. Acknowledgment Workflow
- Alerts can be marked as acknowledged
- Tracks who acknowledged and when
- Optional notes for context
- Filters for unacknowledged alerts

### 4. Rich Alert Details
- Stored as JSONB for extensibility
- Contains all calculated metrics
- Period information for historical tracking
- Enable future analytics and trending

### 5. Row-Level Security
- Organizations can only view their own alerts
- Admins/owners can modify configuration
- Authenticated access only

## Usage Examples

### Example 1: Check Current Month's Margins
```bash
curl -X POST https://gateway.finault.io/v1/alerts/margin \
  -H "Authorization: Bearer your_token" \
  -H "Content-Type: application/json" \
  -d '{"period": "2026-02"}'
```

### Example 2: View Unacknowledged Critical Alerts
```bash
curl https://gateway.finault.io/v1/alerts/margin?acknowledged=false&severity=critical \
  -H "Authorization: Bearer your_token"
```

### Example 3: Acknowledge an Alert
```bash
curl -X PUT https://gateway.finault.io/v1/alerts/margin/alert-id-uuid/acknowledge \
  -H "Authorization: Bearer your_token" \
  -H "Content-Type: application/json" \
  -d '{"note": "Price increased to 15% above COGS"}'
```

### Example 4: Update Threshold
```bash
curl -X PUT https://gateway.finault.io/v1/alerts/margin/config \
  -H "Authorization: Bearer your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "margin_breach_threshold": 75.00,
    "notification_email": "cfo@company.com"
  }'
```

## Implementation Checklist

- [x] Handler module created (`src/handlers/margin-alerts.js`)
- [x] Database schema created (`sql/margin_alerts.sql`)
- [x] API routes added to router
- [x] Handler imports in `src/index.js`
- [x] Handler registration in initialization
- [ ] Run migration: `psql finault < sql/margin_alerts.sql`
- [ ] Configure org thresholds via API
- [ ] Set up cron job for automated checks
- [ ] Configure email notifications (future enhancement)
- [ ] Add Slack webhook integration (future enhancement)
- [ ] Add dashboard UI for alerts (future enhancement)

## Production Considerations

### Performance
- Indexes on common query patterns (org, created_at, acknowledged)
- JSONB details stored efficiently
- Aggregations done at query time, not stored

### Scalability
- Partitioning by org_id recommended for large deployments
- Archive old alerts after 90 days (configurable)
- Pagination supports high-volume alert environments

### Security
- Row-level security enforced at database layer
- Organization isolation guaranteed
- Rate limiting applies to alert checks
- Audit logging of all modifications

### Extensibility
- JSONB details field allows future metric additions
- Helper views for common analyses
- Configuration stored per-org for flexibility
- Alert types easily extensible (add new types to CHECK constraint)

## Future Enhancements

1. **Email Notifications** - Integrate with SendGrid/AWS SES
2. **Slack Integration** - Send alerts to team channels
3. **Webhook Support** - Custom integrations for customers
4. **Alert Rules Engine** - Custom alert conditions per org
5. **Trending Analysis** - Show margin trend over time
6. **Remediation Workflows** - Auto-suggest actions per alert type
7. **Dashboard Widgets** - Visual alert summaries in UI
8. **API Forecasting** - Predict margin issues before they occur

## Troubleshooting

### No Alerts Generated
1. Check that revenue_entries exist for the period
2. Verify cost_center values match between usage_logs and revenue_entries
3. Confirm org configuration is set (`margin_breach_enabled` and `negative_margin_enabled`)
4. Check org_id matches in both tables

### Alerts Not Stored
1. Verify margin_alert_config table exists (run SQL migration)
2. Check organization has valid org_id in organizations table
3. Ensure Supabase service role has INSERT permission on margin_alerts

### Threshold Not Working
1. Verify threshold is between 0-100
2. Check config was actually updated (GET /v1/alerts/margin/config)
3. Ensure alert type is enabled in config
4. Run manual check to regenerate alerts

## Contact & Support

For implementation questions:
- Review MARGIN_ALERTS_GUIDE.md (this file)
- Check handler source code comments
- Review SQL schema for detailed column documentation
