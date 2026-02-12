# GAP #16: Agent Endpoints Return Hardcoded Data — SOLUTION

**Status:** IMPLEMENTED
**Date:** February 7, 2026
**Severity:** MEDIUM

---

## Problem Statement

All five agent endpoints returned hardcoded or fake data:

- `GET /v1/agents` — static list with no capabilities metadata
- `POST /v1/agents/chat` — generic template response (`"I understand you're asking about..."`) with hardcoded `demo-user`/`demo-org`
- `POST /v1/agents/forecast` — hardcoded growth rates (5%/10%/15%) regardless of actual data trends
- `POST /v1/agents/optimize` — always returned 3 hardcoded optimizations with `$2,450/month` savings
- `POST /v1/agents/compliance` — completely static (5 policies, 4 compliant, 1 violation)

Frontend (`agents/page.tsx`) fetched from wrong URL (`agents.finault.ai` instead of `api.finault.ai`), showed "9 AI Agents" when 13 returned, displayed incorrect API endpoint paths, and crashed on missing `capabilities` array.

## Solution

### Gateway Changes (`apps/gateway/gateway-wired.js`)

**`GET /v1/agents`** — Added capabilities arrays to all 13 agents (3 capabilities each: e.g., `natural_language_queries`, `spend_lookups`, `report_generation`). Count now computed dynamically.

**`POST /v1/agents/chat`** — Fetches real usage summary from Supabase (total spend, provider list, top models). Provides context-aware responses based on message content (spend queries, provider questions, forecast requests). Returns actual data context in response. Shows empty-state message when no usage data available.

**`POST /v1/agents/forecast`** — Calculates actual growth rate by comparing recent vs older spending halves. Scenario modifiers adjust observed rate (+5% aggressive, -3% conservative, 0% baseline). Confidence now based on data volume and time horizon. Returns empty forecast with message when no data. Includes `data_points` and `current_avg_daily_spend` in response.

**`POST /v1/agents/optimize`** — When `savingsIntelligence` returns nothing, performs real data analysis: finds most expensive models and suggests optimization, detects single-provider concentration risk, estimates caching savings from total spend. All recommendations computed from actual usage data with data-driven savings estimates. Returns empty list with message when no data.

**`POST /v1/agents/compliance`** — Queries real `budgets` table (checks spent vs amount vs alert_threshold) and `allocation_rules` table (checks active vs inactive). Computes actual violations (spend >= 100% of budget), warnings (spend >= threshold), and compliant count. Overall status derived from findings. Returns `no_data` status when no budgets/rules configured.

### Frontend Changes (`dashboard/src/app/agents/page.tsx`)

- Switched from `fetch('https://agents.finault.ai/...')` to `getAgents()` from `@/lib/api`
- Health check now uses `api.finault.ai/health`
- Fixed "9 AI Agents" → dynamic text
- Made `capabilities` optional in Agent interface — renders conditionally
- Fixed capabilities count stat to handle undefined
- Added `savings` category with icon (TrendingUp) and color
- Fixed API endpoint reference to show correct routes (`/v1/agents/chat`, `/v1/agents/forecast`, etc.)

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/gateway/gateway-wired.js` | Rewrote all 5 agent handlers with real data queries |
| `dashboard/src/app/agents/page.tsx` | Fixed API URL, capabilities handling, endpoint reference |

## Deployment

```bash
cd /Users/bcottc22/Downloads/Finault-Enterprise-Hardening/finault-monorepo/apps/gateway
npx wrangler deploy --name finault-gateway

cd /Users/bcottc22/Downloads/Finault-Enterprise-Hardening/finault-monorepo/dashboard
npm run build
```
