# GAP #22: ERP_POST_ATTEMPTS Table Unused — SOLUTION

**Status:** IMPLEMENTED
**Date:** February 7, 2026
**Severity:** LOW

---

## Problem Statement

The gap analysis stated `erp_post_attempts` was "defined but unused" with only `erp_post_receipts` referenced. Investigation revealed both tables ARE actively written to during ERP posting (`handleERPPost`):

- `erp_post_attempts`: INSERT for idempotency tracking, status management, and retry logic
- `erp_post_receipts`: INSERT for financial receipt records with variance tracking

However, while `erp_post_receipts` had a `GET /v1/erp/receipts` query endpoint, `erp_post_attempts` had **no query endpoint** — it was write-only from the API perspective. This meant:

1. No way to view posting attempt history via API
2. No way to see retry counts, failed attempts, or in-progress posts
3. No unified view of attempts + receipts together
4. Health endpoint listed only 3 of 8 ERP endpoints

## Solution

### 1. New `GET /v1/erp/attempts` Endpoint

Queries `erp_post_attempts` with filters:
- `close_id` — filter by close pack ID
- `status` — filter by status (POSTED, SANDBOX_POSTED, DRY_RUN, STARTED)
- `erp` — filter by ERP system (quickbooks, netsuite, xero, etc.)
- `limit` — pagination (max 1000, default 50)

Returns attempts with a summary breakdown by status.

### 2. Enhanced `GET /v1/erp/receipts` — Optional Attempt Enrichment

Added `?include_attempt=true` query parameter. When set, each receipt is enriched with its parent attempt data via `_attempt` field. This provides a unified view without requiring a separate JOIN endpoint:

```
GET /v1/erp/receipts?include_attempt=true
→ { receipts: [{ receipt_id: ..., _attempt: { status: "POSTED", retry_count: 0, ... } }] }
```

Enrichment is non-fatal — if attempt lookup fails, receipts are still returned.

### 3. Health Endpoint Updated

ERP endpoint listing expanded from 3 to all 8 active endpoints.

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/gateway/gateway-wired.js` | Added `handleGetERPAttempts()` handler, route at `/v1/erp/attempts`, enhanced `handleGetERPReceipts()` with `include_attempt` enrichment, updated health endpoint ERP listing |

## ERP API Endpoints (Complete)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/erp/connect` | Connect ERP system |
| POST | `/v1/erp/push` | Push data to ERP |
| GET | `/v1/erp/accounts` | List ERP accounts |
| POST | `/v1/erp/post` | Post journal entry |
| GET | `/v1/erp/receipts` | Query posting receipts |
| GET | `/v1/erp/attempts` | **NEW** — Query posting attempts |
| GET/POST | `/v1/erp/policies` | Manage posting policies |
| GET/POST | `/v1/erp/variance` | Variance tracking |

## Deployment

```bash
cd /Users/bcottc22/Downloads/Finault-Enterprise-Hardening/finault-monorepo/apps/gateway
npx wrangler deploy --name finault-gateway
```
