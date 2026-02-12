# GAP #9: API Keys Page Non-Functional — SOLUTION

**Status:** IMPLEMENTED
**Date:** February 7, 2026
**Severity:** HIGH

---

## Problem Statement

The `/keys` dashboard page displayed 5 hardcoded `demoApiKeys`. The Create button had no `onClick` handler. The Revoke button had no `onClick` handler. No API calls were made to the backend. Users had zero ability to manage real API keys despite the backend (`/v1/keys`) being fully implemented.

## Solution

Wired the frontend to the existing backend API. The backend was already complete (GET/POST/DELETE at `/v1/keys` with SHA-256 hashing, JWT auth, and scope checking). The fix was entirely frontend.

### Changes Made

#### 1. `dashboard/src/lib/api.ts` — Added API Key Methods

Three new exported functions and two new TypeScript interfaces:

- `listApiKeys()` — `GET /v1/keys` — Returns list of keys with masked prefixes
- `createApiKey(name, options)` — `POST /v1/keys` — Creates key, returns secret once
- `revokeApiKey(keyId)` — `DELETE /v1/keys?id={id}` — Marks key as revoked

Added to the `api` export object for consistent access pattern.

#### 2. `dashboard/src/app/keys/page.tsx` — Full Rewrite

Removed all hardcoded `demoApiKeys`. Now fully functional:

- **Data fetching:** `useEffect` calls `listApiKeys()` on mount, displays loading spinner
- **Create button:** Opens modal with name/environment/description form. Calls `createApiKey()`. Shows secret once with copy button and security warning.
- **Revoke button:** Opens confirmation modal. Calls `revokeApiKey()`. Refreshes list on success.
- **Copy button:** Still works (unchanged behavior)
- **Error handling:** Error banner with dismiss button for API failures
- **Empty state:** Shows "No API keys yet" with CTA when no keys exist
- **Loading state:** Animated spinner during API calls

### Security Features (Backend — Already Existed)

- Keys stored as SHA-256 hashes (never stored in plaintext)
- Secret shown once at creation, never retrievable again
- JWT authentication required for all key operations
- `keys:admin` scope required for create/revoke
- Organization-scoped (keys belong to JWT org_id)

---

## Files Modified

| File | Changes |
|------|---------|
| `dashboard/src/lib/api.ts` | Added `ApiKeyInfo`, `CreateApiKeyResult` interfaces. Added `listApiKeys()`, `createApiKey()`, `revokeApiKey()` functions. Added to `api` export. |
| `dashboard/src/app/keys/page.tsx` | Full rewrite (~705 lines). Removed hardcoded demo data. Added real API integration, create modal, revoke confirmation, loading/error/empty states. |

## Files Unchanged

| File | Why |
|------|-----|
| `gateway-wired.js` | Backend already implemented (`listApiKeys`, `createApiKey`, `revokeApiKey` functions + routes) |
| `wrangler.toml` | No new bindings needed |
| Supabase | `api_keys` table already exists |

---

## Deployment

The Next.js dashboard needs to be rebuilt and deployed to pick up these changes:

```bash
cd dashboard
npm run build
# Deploy to your hosting provider (Vercel, Cloudflare Pages, etc.)
```

No gateway changes — backend was already complete.
