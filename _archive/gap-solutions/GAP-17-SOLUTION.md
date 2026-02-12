# GAP #17: Demo Endpoint is Hardcoded — SOLUTION

**Status:** IMPLEMENTED
**Date:** February 7, 2026
**Severity:** LOW

---

## Problem Statement

`GET /v1/demo` returned a hardcoded JSON blob with fake organization data ($47,823.45 spend, 1.2M requests, specific model breakdowns) regardless of whether real data existed. No indicator that data was sample/fake. No `X-Finault-Demo` header.

## Solution

Gateway-only fix. The endpoint now:

1. **Tries real data first** — queries the `usage` table, aggregates by model and cost center, returns live data with `"demo": false, "source": "live"`
2. **Falls back to labeled sample data** — when no real data available, returns the sample payload with:
   - `"demo": true, "source": "sample"`
   - `"notice": "This is sample data for demonstration purposes..."`
   - `"period": "Sample Period"` (not a real month)
   - `X-Finault-Demo: true` response header
3. **Removed fake anomalies and optimizations** from the sample fallback (those belong in their dedicated endpoints)

No frontend changes needed — no dashboard page references `/v1/demo`.

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/gateway/gateway-wired.js` | Rewrote `getDemoData()` — live data first, labeled sample fallback with `X-Finault-Demo` header |

## Deployment

```bash
cd /Users/bcottc22/Downloads/Finault-Enterprise-Hardening/finault-monorepo/apps/gateway
npx wrangler deploy --name finault-gateway
```
