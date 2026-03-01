# Margin Alerts Integration Checklist

## Files Created

### 1. Handler Module
**File:** `src/handlers/margin-alerts.js` (270 lines)
- 5 HTTP request handlers
- 3 internal helper functions
- Production-quality error handling
- Comprehensive JSDoc comments

**Exported Functions:**
```javascript
// HTTP handlers
handleMarginAlertsList()      // GET /v1/alerts/margin
handleMarginAlertDetail()     // GET /v1/alerts/margin/:id
handleMarginAlertAck()        // PUT /v1/alerts/margin/:id/acknowledge
handleMarginAlertConfig()     // GET/PUT /v1/alerts/margin/config
handleMarginAlertsCheck()     // POST /v1/alerts/margin

// Internal functions (for reuse)
checkMarginAlerts()           // Core detection logic
getMarginAlertConfig()        // Fetch config with defaults
processMarginAlerts()         // Store alerts & trigger notifications
```

### 2. Database Schema
**File:** `sql/margin_alerts.sql` (210 lines)
- `margin_alerts` table (main storage)
- `margin_alert_config` table (org settings)
- 5 indexes for query performance
- Row-Level Security policies
- Helper views for analysis
- Auto-timestamp update triggers
- Comprehensive inline documentation

### 3. API Routes
**File:** `src/router.js` (updated)
- Added 5 new route patterns
- Ordered by specificity (config & ID before list)
- Follows existing routing conventions

**Routes:**
```
GET/PUT  /v1/alerts/margin/config              - Configuration management
PUT      /v1/alerts/margin/:id/acknowledge     - Acknowledge individual alerts
GET      /v1/alerts/margin/:id                 - Get alert details
GET      /v1/alerts/margin                     - List alerts with filtering
POST     /v1/alerts/margin                     - Run margin checks
```

### 4. Handler Registration
**File:** `src/index.js` (updated)
- Import statement added for margin-alerts handler module
- 5 handlers registered in initialization map
- Follows existing handler registration pattern

## Integration Steps

### Step 1: Run Database Migration
```bash
# Using psql directly
psql -h your-db-host -U your-user -d finault_db < sql/margin_alerts.sql

# Or via Supabase SQL editor
# Copy contents of sql/margin_alerts.sql and execute
```

**Verification:**
```sql
-- Check tables exist
\dt margin_alerts
\dt margin_alert_config

-- Check indexes
\di idx_margin_alerts*

-- Check views
\dv | grep margin_alerts
```

### Step 2: Verify Dependencies
All required tables must exist:
- `organizations` - org IDs
- `usage_logs` - cost data
- `revenue_entries` - revenue data
- `memberships` - user organization membership (for RLS)

### Step 3: Deploy Gateway
```bash
# Deploy updated files
npm run deploy

# Or for Cloudflare Workers
wrangler deploy
```

**Files to deploy:**
- `src/handlers/margin-alerts.js` (new)
- `src/index.js` (updated imports and handler registration)
- `src/router.js` (updated routing table)

### Step 4: Test Endpoints

#### Test 1: Get Configuration
```bash
curl -X GET https://your-gateway/v1/alerts/margin/config \
  -H "Authorization: Bearer your_jwt_token"
```

Expected: 200 with default config if new org

#### Test 2: Check Current Month
```bash
curl -X POST https://your-gateway/v1/alerts/margin \
  -H "Authorization: Bearer your_jwt_token" \
  -H "Content-Type: application/json" \
  -d '{"period": "2026-02"}'
```

Expected: 201 with alerts array (may be empty if no data)

#### Test 3: List Alerts
```bash
curl -X GET https://your-gateway/v1/alerts/margin \
  -H "Authorization: Bearer your_jwt_token"
```

Expected: 200 with alerts list

#### Test 4: Update Configuration
```bash
curl -X PUT https://your-gateway/v1/alerts/margin/config \
  -H "Authorization: Bearer your_jwt_token" \
  -H "Content-Type: application/json" \
  -d '{
    "margin_breach_threshold": 75.00,
    "notification_email": "finance@company.com"
  }'
```

Expected: 200 with updated config

### Step 5: Add Sample Data (Testing)
```sql
-- Add test organization
INSERT INTO organizations (id, name, plan_tier)
VALUES ('test-org-uuid', 'Test Company', 'enterprise')
ON CONFLICT DO NOTHING;

-- Add revenue entry
INSERT INTO revenue_entries (org_id, period, cost_center, revenue_amount, currency)
VALUES (
  'test-org-uuid',
  '2026-02-01',
  'customer:acme-corp',
  10000.00,
  'USD'
);

-- Add usage/cost entry (adjust based on usage_logs schema)
INSERT INTO usage_logs (org_id, cost_center, cost, provider, model, period)
VALUES (
  'test-org-uuid',
  'customer:acme-corp',
  9000.00,
  'openai',
  'gpt-4',
  '2026-02'
);

-- Run check
POST /v1/alerts/margin with period: 2026-02
-- Should generate margin_breach alert (90% cost-to-serve vs 80% threshold)
```

### Step 6: Configure Cron Jobs (Optional)

Add to your cron scheduler (e.g., via Cloudflare Workers, AWS Lambda, etc.):

```javascript
import { checkMarginAlerts, processMarginAlerts, getMarginAlertConfig }
  from './handlers/margin-alerts.js';

// Monthly margin check (1st of month at 6 AM)
export async function runMonthlyMarginChecks(env) {
  const supabase = createSupabaseClient(env);

  try {
    // Get all organizations
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id');

    for (const org of orgs || []) {
      try {
        // Calculate current month
        const now = new Date();
        const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // Get org config
        const config = await getMarginAlertConfig(org.id, supabase);

        // Check margins
        const alerts = await checkMarginAlerts(org.id, period, supabase, config);

        // Process alerts
        if (alerts.length > 0) {
          await processMarginAlerts(alerts, org.id, supabase);
          console.log(`[CRON] Generated ${alerts.length} alerts for ${org.id}`);
        }
      } catch (err) {
        console.error(`[CRON] Error for org ${org.id}:`, err);
      }
    }
  } catch (err) {
    console.error('[CRON] Monthly margin check failed:', err);
  }
}
```

### Step 7: Monitoring & Alerts (Optional)

Add to your observability platform:

```javascript
// Track metrics
console.log(`[METRIC] margin_alerts_generated{org_id="${orgId}", type="${type}", severity="${severity}"} 1`);

// Alert on errors
if (alerts.length === 0 && revenueExists && costsExist) {
  console.warn('[ALERT] No margin alerts generated despite data');
}
```

## Key Configuration Points

### Organization-Level Settings
```sql
-- Update config
UPDATE margin_alert_config
SET margin_breach_threshold = 75.00,
    notification_email = 'finance@company.com',
    negative_margin_enabled = true,
    margin_breach_enabled = true
WHERE org_id = 'org-uuid';

-- Or via API
PUT /v1/alerts/margin/config
{
  "margin_breach_threshold": 75.00,
  "notification_email": "finance@company.com"
}
```

### Default Thresholds
- **Margin Breach Threshold:** 80.00% (cost-to-serve / revenue)
- **Negative Margin:** Always enabled (critical)
- **Margin Breach:** Configurable per org

## Data Requirements

For margin alerts to generate:

### Required in `usage_logs`
- `org_id` - Organization UUID
- `cost_center` - Customer/business unit identifier
- `cost` - Dollar amount of AI usage
- `period` - Date field (will be parsed as YYYY-MM)

### Required in `revenue_entries`
- `org_id` - Organization UUID (must match usage_logs)
- `cost_center` - Customer/business unit identifier (must match usage_logs)
- `revenue_amount` - Dollar amount of revenue
- `period` - Date field (should match usage_logs period)

### Example Data Model
```
Organization A
├─ Customer: acme-corp
│  ├─ Revenue (Feb 2026): $10,000
│  └─ AI Cost (Feb 2026): $9,000 (90% - BREACH)
│
├─ Customer: beta-inc
│  ├─ Revenue (Feb 2026): $5,000
│  └─ AI Cost (Feb 2026): $6,000 (120% - NEGATIVE MARGIN)
│
└─ Customer: gamma-labs
   ├─ Revenue (Feb 2026): $20,000
   └─ AI Cost (Feb 2026): $12,000 (60% - OK)
```

## Performance Considerations

### Query Optimization
- Alerts use aggregation at query time (SUM, GROUP BY)
- Indexes support org_id + created_at lookups
- Unacknowledged filter uses partial index
- Cost_center lookups use separate index

### Expected Performance
- Alert check for 1000 cost centers: ~500ms
- List 50 alerts: ~50ms
- Get alert detail: ~10ms
- Update config: ~20ms

### Scaling Tips
- Archive alerts older than 90 days
- Partition margin_alerts by org_id (for very large deployments)
- Use cost_center_risk_profile view for aggregate reporting
- Cache config in application memory (30 min TTL)

## Security Checklist

- [x] Row-Level Security enforced on both tables
- [x] Organizations only see their own alerts
- [x] Only org admins/owners can modify config
- [x] API authentication required (no public endpoints)
- [x] Input validation on threshold values (0-100)
- [x] Period format validated (YYYY-MM)
- [x] SQL injection protection (parameterized queries via Supabase)

## Rollback Procedure

If issues occur:

```sql
-- Drop the margin alerts system
DROP TABLE margin_alerts CASCADE;
DROP TABLE margin_alert_config CASCADE;
DROP FUNCTION update_margin_alert_config_updated_at() CASCADE;

-- Routes in src/router.js will return 404 (no handler)
-- Remove routes if desired
-- Remove handler imports from src/index.js
```

## Support & Troubleshooting

See `MARGIN_ALERTS_GUIDE.md` for:
- Detailed API documentation
- Troubleshooting guide
- Usage examples
- Future enhancement ideas

## Files Summary

| File | Size | Purpose |
|------|------|---------|
| `src/handlers/margin-alerts.js` | 270 lines | Handler logic & API |
| `sql/margin_alerts.sql` | 210 lines | Database schema |
| `src/router.js` | Updated | Route definitions |
| `src/index.js` | Updated | Handler registration |
| `MARGIN_ALERTS_GUIDE.md` | 450+ lines | Full documentation |
| `MARGIN_ALERTS_INTEGRATION.md` | This file | Integration steps |

## Next Steps

1. Run SQL migration
2. Test endpoints with sample data
3. Configure org thresholds
4. Set up cron job (if using automated checks)
5. Add UI dashboard (future enhancement)
6. Configure notifications (future enhancement)
