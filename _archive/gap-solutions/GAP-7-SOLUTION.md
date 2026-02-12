# GAP #7: No Rate Limit Persistence — SOLUTION

**Status:** IMPLEMENTED
**Date:** February 7, 2026
**Severity:** HIGH

---

## Problem Statement

Rate limit counters were stored in a JavaScript `Map` (in-memory only). This meant:

1. **Worker restarts** (deploys, crashes, scaling) reset all counters — attackers get unlimited requests during restart windows
2. **Multi-instance deployment** — each Cloudflare edge instance has independent counters, no shared state, attackers can spread requests across instances
3. **No audit trail** — no persistent record of who was rate limited (SOC 2 gap)
4. **Only IP-based limiting** — no tiered limits for authenticated organizations (proxy, heavy, default tiers all got the same 100/min limit)
5. **Unused infrastructure** — `infrastructure.js` had a Supabase-backed rate limiter that was never wired into the gateway

## Solution Architecture

**Approach:** KV-backed fixed-window rate limiting using existing `KV_CACHE` namespace. No new infrastructure, no Durable Objects (would require plan upgrade), no new KV namespaces.

**Why KV over Durable Objects:** KV is already provisioned (CACHE/KV_CACHE binding), globally distributed with ~10ms latency, has built-in TTL expiration, and needs no wrangler.toml changes. Durable Objects would provide stronger consistency but require a paid plan config change. KV's eventual consistency (~60s propagation) is acceptable for rate limiting — being slightly permissive under race conditions is better than blocking legitimate requests.

### Components Built

#### 1. `KVRateLimiter` — Persistent Rate Limiter Module (`modules/kv-rate-limiter.js`)

Fixed-window counter pattern with KV persistence:

- **Key format:** `rate:{prefix}:{identifier}:{window_id}` where `window_id = Math.floor(Date.now() / windowMs)`
- **TTL:** Window duration + 120 seconds buffer — automatic cleanup, no cron needed
- **In-memory fast-path:** Same-isolate repeat requests check local cache first (<1ms), KV on miss (~10ms)
- **Graceful degradation:** If KV read/write fails, request is allowed (fail-open for availability)

#### 2. Two-Phase Rate Limiting in Gateway

**Phase 1 — Pre-Auth (IP-based):**
- Runs before authentication for ALL non-public requests
- 100 requests/min per IP address
- Stops unauthenticated DDoS before hitting auth middleware

**Phase 2 — Post-Auth (Org-based, Tiered):**
- Runs after authentication, uses `org_id` from JWT
- Tier selection based on endpoint path:
  - **proxy** (500/min): `/v1/chat/completions`, `/anthropic/*`, `/azure/*`, `/vertex/*`, `/bedrock/*`
  - **heavy** (10/min): `/v1/parse`, `/v1/reconcile`, `/v1/close-pack/generate`
  - **authenticated** (1000/min): all other authenticated endpoints

#### 3. Rate Limit Observability Endpoint

`GET /v1/observability/rate-limits` — Shows active rate limit counters from KV. Requires authentication.

### Rate Limit Tiers

| Tier | Limit | Window | Key | Use Case |
|------|-------|--------|-----|----------|
| `default` | 100/min | 60s | IP address | Unauthenticated requests |
| `authenticated` | 1000/min | 60s | org_id | Standard authenticated |
| `proxy` | 500/min | 60s | org_id | LLM proxy endpoints |
| `heavy` | 10/min | 60s | org_id | Parse, reconcile, close-pack |

### Response Headers

All responses include standard rate limit headers:

```
X-RateLimit-Limit: 500
X-RateLimit-Remaining: 498
X-RateLimit-Reset: 1738968120
X-RateLimit-Tier: proxy
```

429 responses include `Retry-After` with seconds until window resets.

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/gateway/modules/kv-rate-limiter.js` | **NEW** — ~240 lines. `KVRateLimiter` class with `checkAndRecord()`, `checkRequest()`, `getTier()`, `getStats()`. Static `getHeaders()`. Exports `RATE_TIERS`, `HEAVY_ENDPOINTS`, `PROXY_ENDPOINTS`. |
| `apps/gateway/gateway-wired.js` | Added import (~line 108). Replaced in-memory rate limit check with KV-backed pre-auth IP limiting (~line 586-611). Added post-auth tiered org-based rate limiting (~line 644-666). Added `/v1/observability/rate-limits` endpoint (~line 786-798). Updated health endpoint listing. |

## Files Unchanged (Backward Compatible)

| File | Why |
|------|-----|
| `modules/rate-limiter.js` | Preserved — still imported (unused functions remain available) |
| `wrangler.toml` | No new bindings needed — uses existing KV_CACHE |
| Supabase | No new tables or migrations needed |

---

## Testing Commands

### Verify Rate Limit Headers in Response
```bash
TOKEN=$(curl -s -X POST 'https://bejoptgsrhmklmllkobu.supabase.co/auth/v1/token?grant_type=password' \
  -H 'apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlam9wdGdzcmhta2xtbGxrb2J1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzMTIyMzUsImV4cCI6MjA4NDg4ODIzNX0.JGBeXweyIg2I4bMv6Dk_gd6veeodL5V_3TSYJeAK6kU' \
  -H 'Content-Type: application/json' \
  -d '{"email":"bernard.cotter@finault.co","password":"Finault2026!"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Hit an authenticated endpoint — should return rate limit headers
curl -si -H "Authorization: Bearer $TOKEN" https://api.finault.ai/v1/usage | head -20
```

### Check Rate Limit Stats
```bash
curl -s -H "Authorization: Bearer $TOKEN" https://api.finault.ai/v1/observability/rate-limits | python3 -m json.tool
```

### Verify Persistence Across Deploys
```bash
# Hit the API several times to build up counters
for i in {1..5}; do curl -s https://api.finault.ai/health > /dev/null; done

# Check rate limit stats (should show active_keys > 0)
curl -s -H "Authorization: Bearer $TOKEN" https://api.finault.ai/v1/observability/rate-limits | python3 -m json.tool

# Deploy (simulates worker restart)
cd apps/gateway && npx wrangler deploy --name finault-gateway

# Check stats again — counters should persist!
curl -s -H "Authorization: Bearer $TOKEN" https://api.finault.ai/v1/observability/rate-limits | python3 -m json.tool
```

---

## Deployment

```bash
cd apps/gateway
npx wrangler deploy --name finault-gateway
```

No new secrets, KV namespaces, or migrations required. Uses existing KV_CACHE binding.
