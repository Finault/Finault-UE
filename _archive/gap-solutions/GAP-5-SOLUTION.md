# GAP #5: Database Error Observability — SOLUTION

**Status:** IMPLEMENTED
**Date:** February 7, 2026
**Severity:** HIGH

---

## Problem Statement

The Finault gateway had 50+ database operations with minimal error handling — just `if (error) return jsonResponse({error}, 500)`. No timing, no structured logging, no health checks, no metrics, no circuit breaker. The `ErrorTracker` module existed but was not integrated into database operations. The `/health` endpoint returned static JSON with zero dependency checks. Operations had no way to know if the database was degraded until customers complained.

## Solution Architecture

**Committee Standard:** Slootman (consistent latency observability), Collison (predictable API behavior under failure), Plaid (bulletproof reliability), Jobs (elegant simplicity).

### Components Built

#### 1. ObservableDB Module (`modules/db-observability.js`)
Observable wrapper around Supabase operations providing:
- **`query(table, operation, queryFn, context)`** — Wraps any Supabase call with automatic timing, structured JSON logging, error tracking via ErrorTracker, and KV metrics
- **Circuit breaker (Hystrix-style)** — Module-level state shared across requests in same isolate:
  - CLOSED → OPEN after 5 consecutive failures
  - OPEN → blocks all DB calls for 30 seconds (returns instant 503)
  - HALF_OPEN → allows 1 test request, transitions based on result
- **KV metrics** — Per-minute error counts, latency averages, operations counts (1-hour TTL)
- **Health check** — `getHealthStatus()` pings Supabase with lightweight query, returns latency + circuit state
- **Health snapshots** — `createHealthSnapshot()` writes persistent 5-minute snapshots to `db_health_snapshots` table
- **Request ID correlation** — `setRequestId()` propagates across all queries in a request

#### 2. Database Migration (`011_db_observability.sql`)
- `db_health_snapshots` table with BIGSERIAL PK, timestamp, healthy boolean, latency_ms, error counts, circuit state, JSONB error details
- Indexed on timestamp (DESC) for efficient dashboard queries
- Filtered index on unhealthy periods
- RLS enabled with service role access
- 30-day retention with auto-cleanup via cron

#### 3. Enhanced ErrorTracker (`modules/error-tracker.js`)
- **`getRecentErrors(limit)`** — Reads `error:*` keys from KV with batch parallel fetching, sorted by timestamp
- **`getErrorSummary()`** — Aggregates errors by level and type, counts last-hour vs. 24-hour

#### 4. Gateway Integration (`gateway-wired.js`)
- ObservableDB initialized per-request after auth, with requestId correlation
- Metrics flushed in `finally` block via `ctx.waitUntil(db.flushMetrics())`

### New API Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /health/database` | Public | Database connectivity check for load balancers. Returns healthy/unhealthy, latency_ms, circuit_state. HTTP 200 or 503. |
| `GET /v1/observability/metrics` | Required | Aggregated metrics (error rate, avg/max latency, ops count, errors by table) for last N minutes |
| `GET /v1/observability/errors` | Required | Recent errors from KV with summary (by level, by type, last hour count) |
| `GET /v1/observability/health-history` | Required | Historical health snapshots from database (last N hours) |

### Enhanced Existing Endpoints

| Endpoint | Change |
|----------|--------|
| `GET /health` | Now includes `database` field with healthy, latency_ms, circuit_state. Status shows "degraded" if DB unhealthy. |
| `GET /v1/usage` | Wrapped with ObservableDB. Returns `_meta.query_ms` timing. |
| `GET /v1/verify/{hash}` | Wrapped with ObservableDB. Returns `_meta.query_ms`. Errors tracked via ErrorTracker. |
| `GET /v1/verify/stats` | Uses ObservableDB client. Failures tracked with structured context. |
| `GET /v1/verify/{hash}/refresh` | Uses ObservableDB client. Failures tracked. |
| Cron handler | Organizations query wrapped. Health snapshot created every 5 min. Old snapshots cleaned daily. |

### Structured Logging Format

All database operations now emit structured JSON logs:

```json
{
  "level": "error|warn|critical",
  "type": "query_error|slow_query|connection_error|circuit_breaker_blocked",
  "table": "anchors",
  "operation": "select",
  "duration_ms": 234,
  "error_message": "...",
  "error_code": "PGRST116",
  "request_id": "uuid",
  "endpoint": "/v1/verify",
  "circuit_state": "CLOSED",
  "timestamp": "2026-02-07T..."
}
```

Searchable in Cloudflare dashboard via `[DB_QUERY]` prefix.

### KV Metrics Schema

| Key Pattern | Value | TTL |
|-------------|-------|-----|
| `db:ops:{minute}` | Operation count | 1 hour |
| `db:errors:{minute}` | Error count | 1 hour |
| `db:latency:{minute}` | `{sum, count, max}` JSON | 1 hour |
| `db:errors_by_table:{minute}` | `{table: count}` JSON | 1 hour |
| `db:circuit_state` | `{state, failures, ...}` JSON | 5 min |
| `db:last_success` | ISO timestamp | 24 hours |
| `db:last_error` | `{timestamp, table, operation, error_code}` JSON | 24 hours |

---

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `apps/gateway/modules/db-observability.js` | ~420 | ObservableDB class, circuit breaker, KV metrics, health checks |
| `database/migrations/011_db_observability.sql` | ~40 | Health snapshots table with indexes and RLS |

## Files Modified

| File | Changes |
|------|---------|
| `apps/gateway/modules/error-tracker.js` | Added `getRecentErrors()` and `getErrorSummary()` methods |
| `apps/gateway/gateway-wired.js` | Added ObservableDB import + init, `/health/database` endpoint, 3 observability endpoints, wrapped 5 critical DB operations, enhanced `/health` with DB status, cron health snapshots, metrics flush in finally block |

---

## Testing Commands

### Health Check
```bash
# Database health (public, for load balancers)
curl https://api.finault.ai/health/database | python3 -m json.tool

# Enhanced main health (now includes database status)
curl https://api.finault.ai/health | python3 -m json.tool
```

### Observability Metrics (authenticated)
```bash
TOKEN=$(curl -s -X POST 'https://bejoptgsrhmklmllkobu.supabase.co/auth/v1/token?grant_type=password' \
  -H 'apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlam9wdGdzcmhta2xtbGxrb2J1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzMTIyMzUsImV4cCI6MjA4NDg4ODIzNX0.JGBeXweyIg2I4bMv6Dk_gd6veeodL5V_3TSYJeAK6kU' \
  -H 'Content-Type: application/json' \
  -d '{"email":"bernard.cotter@finault.co","password":"Finault2026!"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Metrics (last 60 minutes)
curl -H "Authorization: Bearer $TOKEN" https://api.finault.ai/v1/observability/metrics | python3 -m json.tool

# Recent errors
curl -H "Authorization: Bearer $TOKEN" https://api.finault.ai/v1/observability/errors | python3 -m json.tool

# Health history (last 24 hours)
curl -H "Authorization: Bearer $TOKEN" https://api.finault.ai/v1/observability/health-history | python3 -m json.tool
```

### Verify Structured Logging
```bash
cd apps/gateway && npx wrangler tail --name finault-gateway
# Then hit endpoints and look for [DB_QUERY] structured JSON entries
```

---

## Deployment

```bash
# 1. Apply migration to Supabase (via SQL editor or CLI)
# Copy contents of database/migrations/011_db_observability.sql

# 2. Deploy gateway
cd apps/gateway
npx wrangler deploy --name finault-gateway

# 3. Verify
curl https://api.finault.ai/health/database
```

No new secrets required. Uses existing KV_CACHE namespace for metrics storage.
