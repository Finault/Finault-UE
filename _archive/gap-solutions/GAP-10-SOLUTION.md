# GAP #10: Budgets Page Cannot Create or Edit Budgets — SOLUTION

**Status:** IMPLEMENTED
**Date:** February 7, 2026
**Severity:** MEDIUM

---

## Problem Statement

The `/budgets` dashboard page was read-only. The Create Budget button had no `onClick` handler. No edit or delete functionality existed. When the API returned zero budgets, the page silently fell back to 6 hardcoded `DEMO_BUDGETS`. Users could not create, edit, or delete budgets despite the backend (`GET /v1/budgets`, `POST /v1/budgets`) being partially implemented.

## Solution

Full CRUD implementation across gateway, API client, and frontend.

### Changes Made

#### 1. `apps/gateway/gateway-wired.js` — Added PUT and DELETE Handlers

Two new handler functions and two new route entries:

- **`PUT /v1/budgets?id={id}`** → `updateBudget()` — Patches budget via Supabase REST API with `Prefer: return=representation`. Strips immutable fields (`id`, `organization_id`, `created_at`). Auto-sets `updated_at`.
- **`DELETE /v1/budgets?id={id}`** → `deleteBudget()` — Removes budget record from Supabase. Returns `{ success: true, deleted_id }`.

Both validate the required `id` query parameter and return proper error responses on failure.

#### 2. `dashboard/src/lib/api.ts` — Added Update and Delete Methods

Two new exported functions:

- `updateBudget(id, data)` — `PUT /v1/budgets?id={id}` — Updates budget fields
- `deleteBudget(id)` — `DELETE /v1/budgets?id={id}` — Removes budget

Added to the `api` export object for consistent access.

#### 3. `dashboard/src/app/budgets/page.tsx` — Full Rewrite

Removed all hardcoded `DEMO_BUDGETS`. Now fully functional (~724 lines):

- **Data fetching:** `useCallback` + `useEffect` calls `getBudgets()` on mount. Displays loading spinner. Shows empty state when no budgets exist.
- **Create button:** Opens modal with form fields: name (required), amount (required), period (daily/weekly/monthly/quarterly/yearly), cost center, alert threshold (%), budget type (soft/hard), description. Calls `createBudget()`. Shows success banner.
- **Edit button:** Pencil icon on each budget card. Opens same modal pre-populated with existing values. Calls `updateBudget()`. Refreshes list on success.
- **Delete button:** Trash icon on each budget card. Opens confirmation dialog with budget name. Calls `deleteBudget()`. Refreshes list on success.
- **Error handling:** Dismissible error banner for API failures.
- **Empty state:** Shows "No budgets yet" with CTA button when no budgets exist.
- **Loading state:** Animated spinner during API calls.
- **Success feedback:** 3-second auto-dismissing green banner after create/edit/delete.
- **Budget type badge:** "Hard Limit" badge shown on hard-type budgets.
- **Flexible field mapping:** `mapApiBudget()` handles both camelCase and snake_case API responses.

### Form Fields

| Field | Type | Required | Default |
|-------|------|----------|---------|
| Name | text | Yes | — |
| Amount ($) | number | Yes | — |
| Period | select | No | monthly |
| Cost Center | text | No | default |
| Alert Threshold (%) | number | No | 80 |
| Budget Type | select | No | soft |
| Description | textarea | No | — |

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/gateway/gateway-wired.js` | Added `PUT` and `DELETE` method handlers in `/v1/budgets` route. Added `updateBudget()` and `deleteBudget()` functions (~45 lines). |
| `dashboard/src/lib/api.ts` | Added `updateBudget()`, `deleteBudget()` functions. Added to `api` export. |
| `dashboard/src/app/budgets/page.tsx` | Full rewrite (~724 lines). Removed hardcoded demo data. Added real API integration, create/edit modal, delete confirmation, loading/error/empty states. |

## Files Unchanged

| File | Why |
|------|-----|
| `wrangler.toml` | No new bindings needed |
| Supabase | `budgets` table already exists with proper schema and RLS |
| `dashboard/src/types/index.ts` | `Budget` type already defined |

---

## Deployment

**Gateway** (for PUT/DELETE endpoints):
```bash
cd apps/gateway
npx wrangler deploy --name finault-gateway
```

**Dashboard** (for frontend rewrite):
```bash
cd dashboard
npm run build
# Deploy to hosting provider
```
