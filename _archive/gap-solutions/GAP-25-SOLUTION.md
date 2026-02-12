# GAP #25: USAGE Table is Dead — SOLUTION

**Status:** IMPLEMENTED
**Date:** February 7, 2026
**Severity:** CRITICAL (data pipeline broken)

---

## Problem Statement

The `usage` table is the central data store for the entire Finault platform — it's queried by 20+ endpoints across the gateway for spend dashboards, reconciliation, anomaly detection, forecasting, cost center attribution, close pack generation, model recommendations, and more.

However, the table was **always empty**. The root cause:

### 1. Write-Side Table Mismatch

`trackUsage()` and `trackUsageFast()` create records with `log_type: 'usage'`, which flow through `DurableLoggerV2.writeToSupabase()` → `getTableForLogType('usage')`. That function mapped:

```
'usage' → 'usage_logs'   ← DOES NOT EXIST in any schema
```

Both `DurableLoggerV2` (active) and `DurableLoggerV1` (legacy) had this phantom mapping. The `usage_logs` table was never created in any migration. Every write silently failed.

### 2. Schema Column Mismatch

Even after fixing the table name, `writeToSupabase()` enriched every record with extra fields (`log_type`, `wal_id`, `data_hash`, `persisted_at`, `audit_metadata`) that don't exist as columns in the `usage` table. Supabase/PostgREST rejects unknown columns, so writes would still fail.

### 3. AgentOS Also Affected

The `agentos/worker.js` independently queried `from('usage_logs')` at 6 locations for anomaly detection, cost analysis, forecasting, and optimization — also pointing at the phantom table.

### Impact Before Fix

Every feature that depends on usage data returned empty results:
- Dashboard spend charts: empty
- Reconciliation: no usage to match against invoices
- Close pack generation: missing usage data
- Model recommendations: no data to analyze
- Forecasting: no historical data
- Anomaly detection: nothing to detect
- Cost center attribution: no spend to attribute
- Goal tracking (live spend): always $0

---

## Solution

### 1. Fixed `getTableForLogType()` — Both DurableLoggerV2 and V1

Changed the mapping from `'usage' → 'usage_logs'` to `'usage' → 'usage'`:

```js
// Before:
'usage': 'usage_logs',    // phantom table — writes silently fail
// After:
'usage': 'usage',         // real table — writes persist
```

### 2. Schema-Aware `writeToSupabase()` for Usage Table

Added a usage-specific write path that whitelists only the columns defined in the `usage` table schema:

- `request_id`, `provider`, `model` — request identity
- `input_tokens`, `output_tokens` — token tracking
- `cost_cents` — cost tracking
- `cost_center`, `project`, `environment`, `user_id`, `organization_id` — attribution
- `latency_ms`, `status` — performance
- `metadata` (JSONB) — extensible metadata
- `created_at` — timestamp

Extra DurableLogger fields (`wal_id`, `data_hash`, `persisted_at`, `write_method`) are packed into the `metadata` JSONB column, preserving audit trail without violating the schema.

### 3. Fixed AgentOS Queries

Changed all 6 `from('usage_logs')` references in `agentos/worker.js` to `from('usage')`.

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/gateway/modules/durable-logger-v2.js` | Fixed `getTableForLogType('usage')` → `'usage'`. Added schema-aware write path in `writeToSupabase()` that whitelists usage columns and packs extras into `metadata` JSONB. |
| `apps/gateway/modules/durable-logger.js` | Fixed `getTableForLogType('usage')` → `'usage'` (V1 legacy consistency). |
| `agentos/worker.js` | Changed 6 × `from('usage_logs')` → `from('usage')`. |

## Write Flow (After Fix)

```
API request (proxy) → trackUsageFast(record with log_type: 'usage')
  ├─ KV WAL: store full record (~10ms, blocking)
  ├─ Return 'accepted' to client immediately
  └─ Background: writeToSupabase()
       ├─ getTableForLogType('usage') → 'usage'  ← FIXED
       ├─ Whitelist schema columns, pack extras into metadata JSONB
       └─ INSERT INTO usage (...) → SUCCESS
```

## Read/Write Alignment

| Operation | Table | Status |
|-----------|-------|--------|
| `trackUsage()` / `trackUsageFast()` write | `usage` | ✅ Fixed (was `usage_logs`) |
| WAL cron processor retry | `usage` | ✅ Fixed (same `writeToSupabase()`) |
| 20+ gateway read endpoints | `usage` | ✅ Already correct |
| AgentOS reads | `usage` | ✅ Fixed (was `usage_logs`) |

## Deployment

```bash
cd /Users/bcottc22/Downloads/Finault-Enterprise-Hardening/finault-monorepo/apps/gateway
npx wrangler deploy --name finault-gateway
```
