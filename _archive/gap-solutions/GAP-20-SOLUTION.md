# GAP #20: No Rate Limiting on Public Endpoints — SOLUTION

**Status:** IMPLEMENTED
**Date:** February 7, 2026
**Severity:** HIGH (security)

---

## Problem Statement

The KV-backed rate limiter (Gap #7) only applied to authenticated endpoints. The rate limiting check at line 593 was wrapped in `if (!isPublicEndpoint(path))`, which meant all public endpoints had zero rate limiting:

- `/health` — returns system info, polled by load balancers
- `/v1/verify/*` — **hits the database** (anchors table lookup)
- `/v1/logs/*` — log verification endpoints
- `/v1/registry/*` — registry lookups
- `/v1/test/proxy` — test endpoint
- `/public/*`, `/status` — informational

The `/v1/verify` endpoint was particularly dangerous since each request triggers a Supabase query, making it a DDoS vector for database exhaustion.

## Solution

### 1. New Rate Limit Tiers (`modules/kv-rate-limiter.js`)

Added two new IP-based tiers for public endpoints:

| Tier | Limit | Window | Use Case |
|------|-------|--------|----------|
| `public` | 60 req/min | 60s | General public endpoints (`/health`, `/status`) |
| `public_db` | 20 req/min | 60s | DB-hitting public endpoints (`/v1/verify`, `/v1/logs`, `/v1/registry`) |

### 2. Public DB Endpoints List

New constant `PUBLIC_DB_ENDPOINTS` identifies which public paths hit the database:
- `/v1/verify` — anchors table lookup
- `/v1/logs/` — log verification
- `/v1/registry/` — registry queries

### 3. `getPublicTier()` Method

New method on `KVRateLimiter` that classifies a public endpoint path into either `public` or `public_db` tier.

### 4. Gateway Integration

Changed the rate limiting logic from:
```
if (!isPublicEndpoint) → rate limit
```
to:
```
if (isPublicEndpoint) → rate limit with public/public_db tier
else → rate limit with default tier (100/min)
```

Both branches return proper 429 responses with `Retry-After` and `X-RateLimit-*` headers.

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/gateway/modules/kv-rate-limiter.js` | Added `public` (60/min) and `public_db` (20/min) tiers, `PUBLIC_DB_ENDPOINTS` list, `getPublicTier()` method, updated exports |
| `apps/gateway/gateway-wired.js` | Changed rate limit gate from `!isPublicEndpoint` skip to `isPublicEndpoint`/`else` branches with appropriate tier |

## Rate Limit Summary (All Tiers)

| Tier | Limit | Key | Applies To |
|------|-------|-----|-----------|
| `default` | 100/min | IP | Unauthenticated non-public |
| `authenticated` | 1000/min | Org | Authenticated general |
| `proxy` | 500/min | Org | LLM proxy endpoints |
| `heavy` | 10/min | Org | Parse, reconcile, bulk |
| `public` | 60/min | IP | Health, status, public |
| `public_db` | 20/min | IP | Verify, logs, registry |

## Deployment

```bash
cd /Users/bcottc22/Downloads/Finault-Enterprise-Hardening/finault-monorepo/apps/gateway
npx wrangler deploy --name finault-gateway
```
