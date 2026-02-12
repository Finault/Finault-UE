# GAP #12: Anomalies Acknowledge is Mocked — SOLUTION

**Status:** IMPLEMENTED
**Date:** February 7, 2026
**Severity:** MEDIUM

---

## Problem Statement

The Acknowledge button on the `/anomalies` page used a `setTimeout(300)` simulation to fake the API call — updating local React state only, with no database persistence. On page refresh, all acknowledgments were lost. The page also fell back to 8 hardcoded `DEMO_ANOMALIES` when the API returned empty or failed.

## Solution

Three-layer fix: new gateway endpoint, new API client method, and frontend wired to real API.

### Changes Made

#### 1. `apps/gateway/gateway-wired.js` — New Acknowledge Endpoint + Enhanced GET

**New route:** `POST /v1/anomalies/acknowledge`
- Accepts `{ anomaly_id, acknowledged_by }` in request body
- Updates the anomaly record in Supabase via PATCH: sets `acknowledged: true`, `acknowledged_by`, `acknowledged_at`
- Returns `{ success, anomaly_id, acknowledged_by, acknowledged_at }`

**Enhanced `getAnomalies()`:**
- Now tries in-memory anomaly detector first (existing behavior)
- Falls back to Supabase `anomalies` table query if in-memory is empty
- Returns empty array if both are empty (no demo data)

#### 2. `dashboard/src/lib/api.ts` — New Method

Added `acknowledgeAnomaly(anomalyId, acknowledgedBy?)`:
- `POST /v1/anomalies/acknowledge`
- Returns `{ success, anomaly_id, acknowledged_by, acknowledged_at }`
- Added to `api` export object

#### 3. `dashboard/src/app/anomalies/page.tsx` — Fixed Acknowledge + Removed Demo Data

**Removed:**
- All 8 hardcoded `DEMO_ANOMALIES`
- `setTimeout(300)` mock in `handleAcknowledge`
- Demo data fallbacks in `loadAnomalies` catch/else blocks

**Fixed:**
- `handleAcknowledge` now calls `acknowledgeAnomaly(anomalyId)` — persists to database
- `loadAnomalies` calls `getAnomalies()` directly, sets empty array on failure
- Import changed from `api` object to direct function imports (`getAnomalies`, `acknowledgeAnomaly`)
- Error handling added to acknowledge flow

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/gateway/gateway-wired.js` | Added `/v1/anomalies/acknowledge` route + handler. Enhanced `getAnomalies()` with Supabase fallback. |
| `dashboard/src/lib/api.ts` | Added `acknowledgeAnomaly()` function and export. |
| `dashboard/src/app/anomalies/page.tsx` | Removed 8 demo anomalies. Replaced `setTimeout(300)` mock with real `acknowledgeAnomaly()` API call. Removed demo data fallbacks. |

---

## Deployment

**Gateway** (new acknowledge endpoint):
```bash
cd /Users/bcottc22/Downloads/Finault-Enterprise-Hardening/finault-monorepo/apps/gateway
npx wrangler deploy --name finault-gateway
```

**Dashboard** (fixed acknowledge + no demo data):
```bash
cd /Users/bcottc22/Downloads/Finault-Enterprise-Hardening/finault-monorepo/dashboard
npm run build
```

## Testing

```bash
# Test acknowledge endpoint
curl -X POST https://api.finault.ai/v1/anomalies/acknowledge \
  -H "Content-Type: application/json" \
  -d '{"anomaly_id": "test-123", "acknowledged_by": "admin@finault.ai"}' | python3 -m json.tool
```
