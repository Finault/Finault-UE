# GAP #21: INVOICE_LINE_ITEMS Table Never Queried — SOLUTION

**Status:** IMPLEMENTED
**Date:** February 7, 2026
**Severity:** LOW

---

## Problem Statement

The `invoice_line_items` table was defined in the schema with 5 indexes, RLS policies, and is heavily JOINed by 12+ SQL functions (allocation, reconciliation, close pack generation). However, the application code never INSERTed into or SELECTed from it. Instead, parsed line items were stored as a JSON blob inside the `invoices.parsed_data` column.

This meant all SQL functions that JOIN `invoice_line_items` returned empty results, breaking allocation, reconciliation aggregation, and close pack generation at the database level.

## Solution

### 1. Shared `insertInvoiceLineItems()` Helper

New function that maps parsed line items to the table schema:
- Maps flexibly from multiple field naming conventions (`service`/`serviceName`/`model`/`description` → `service_name`)
- Handles `quantity`, `unit_price`, `total_price` with fallbacks
- Preserves raw item as `raw_data` JSONB
- Bulk-inserts all rows in a single Supabase call
- Non-fatal: returns 0 on failure, logs error, never blocks invoice creation

### 2. `createInvoice()` — Now Persists Line Items

After storing the invoice record, calls `insertInvoiceLineItems()` if `parsed.lineItems` has entries. Returns `lineItemsStored` count in the response.

### 3. `handleBulkInvoiceUpload()` — Same Treatment

Each invoice in a bulk upload now also persists its line items. Per-invoice results include `lineItemsStored` count.

### 4. New `GET /v1/invoices/:id/line-items` Endpoint

Queries line items for a specific invoice from the table:
- Supports `limit` (max 1000, default 200), `offset`, `order_by` parameters
- Returns paginated results with total count via `Prefer: count=exact`
- Route: `/v1/invoices/{uuid}/line-items`

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/gateway/gateway-wired.js` | Added `insertInvoiceLineItems()` helper, wired into `createInvoice()` and `handleBulkInvoiceUpload()`, added `getInvoiceLineItems()` handler + route |

## Impact

SQL functions that JOIN `invoice_line_items` will now find data when invoices are created through the API, enabling:
- Per-line-item allocation by the PolicyEngine
- Granular reconciliation matching
- Detailed close pack generation
- Tag-based cost attribution via GIN index on `tags`

## Deployment

```bash
cd /Users/bcottc22/Downloads/Finault-Enterprise-Hardening/finault-monorepo/apps/gateway
npx wrangler deploy --name finault-gateway
```
