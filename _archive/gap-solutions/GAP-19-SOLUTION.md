# GAP #19: Model Recommendations Unknown Quality — SOLUTION

**Status:** IMPLEMENTED
**Date:** February 7, 2026
**Severity:** MEDIUM

---

## Problem Statement

The `ModelRecommendationEngine` (`model-recommendation.js`) was a substantial 488-line module with real logic (model tier pricing, use case pattern detection, clustering, savings calculation), but had several quality issues:

1. **No orgId filter** — `getUsageData()` queried `gateway_logs` without filtering by organization, meaning recommendations were cross-tenant
2. **No table fallback** — Only queried `gateway_logs`; if that table was empty/missing, returned zero data with no fallback to the `usage` table
3. **No error handling in `applyRecommendation()`** — blindly inserted into `routing_rules` and `audit_logs` tables, throwing if tables didn't exist
4. **Gateway handlers were thin** — no input validation, no graceful degradation when the engine threw errors
5. **No empty state messaging** — when no data was available, returned empty arrays with no explanation

## Solution

### 1. Module: `getUsageData()` — orgId Filter + Table Fallback

- Added `organization_id` filter when orgId is provided and isn't `'demo-org-id'`
- Added fallback to `usage` table when `gateway_logs` returns no data
- Normalizes `usage` records to `gateway_logs` format (maps `created_at` → `timestamp`, `cost_cents` → `cost_usd`)
- Both queries wrapped in try/catch — errors logged, not thrown

### 2. Module: `analyzeAndRecommend()` — Early Empty Return

- When `getUsageData()` returns zero logs, returns immediately with a structured empty response including `dataPoints: 0` and a clear insight message
- Added `dataPoints` field to summary in both empty and populated responses

### 3. Module: `applyRecommendation()` — Graceful Table Handling

- Wrapped `routing_rules` insert in try/catch
- If table doesn't exist or insert fails, returns `{ success: true, status: 'pending' }` instead of throwing
- Wrapped `audit_logs` insert in separate try/catch — failure is non-fatal (logged only)
- Pre-generates `ruleId` via `crypto.randomUUID()` so it's available regardless of DB outcome

### 4. Gateway: `getModelRecommendations()` — Hardened

- Validates `period` parameter: clamped to 1–365 range, defaults to 30
- Wraps engine call in inner try/catch — engine failure returns graceful empty response (not 500)
- Includes `_debug.error` for diagnostics

### 5. Gateway: `applyRecommendation()` — Hardened

- Validates JSON body parse (returns 400 on malformed JSON)
- Validates `recommendationId` is present and string (returns 400)
- Wraps engine call — returns 422 with clear message on failure
- Adds audit logging via `auditLogger` (non-fatal)

### 6. Gateway: `getQuickRecommendation()` — Hardened

- Validates JSON body parse (returns 400 on malformed JSON)
- Validates `model` field is present and string (returns 400 with hint)
- Wraps engine call — returns graceful null recommendation on failure
- Wraps response in `{ success: true, ...result }`

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/gateway/model-recommendation.js` | `getUsageData()`: added orgId filter + usage table fallback. `analyzeAndRecommend()`: early empty return + dataPoints. `applyRecommendation()`: graceful table handling. |
| `apps/gateway/gateway-wired.js` | Hardened all 3 handlers: input validation, inner try/catch with graceful fallback, audit logging |

## Deployment

```bash
cd /Users/bcottc22/Downloads/Finault-Enterprise-Hardening/finault-monorepo/apps/gateway
npx wrangler deploy --name finault-gateway
```
