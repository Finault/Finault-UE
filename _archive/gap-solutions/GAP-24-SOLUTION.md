# GAP #24: AUDIT_TRAIL Table Never Written — SOLUTION

**Status:** IMPLEMENTED
**Date:** February 7, 2026
**Severity:** MEDIUM (compliance)

---

## Problem Statement

The `audit_trail` table existed in the schema with:
- `organization_id`, `user_id`, `api_key_id` (actor tracking)
- `action` enum (create, update, delete, export, access)
- `resource_type`, `resource_id` (what was affected)
- `changes`, `previous_values`, `new_values` JSONB (before/after state)
- `ip_address`, `user_agent`, `request_id` (request context)
- 6 indexes for compliance queries
- DB triggers for auto-populating from table mutations

However, the `AuditLogger` module (`modules/audit-logging.js`, 698 lines) that is called throughout the gateway (~30+ call sites) stored all audit events **in memory only** (`this.logs.push(event)`). Despite receiving `supabaseUrl`/`supabaseKey` in its config, it never used them. All audit data was lost on every worker restart.

Additionally:
- `getLogs()` method didn't exist — the `/v1/audit/log` endpoint called a non-existent method
- `export()` method didn't exist — the `/v1/audit/export` endpoint also failed
- The compliance-critical audit trail was effectively an empty table

## Solution

### 1. `AuditLogger.log()` — Added Supabase Persistence

After storing in memory and computing the tamper-evident hash chain, the `log()` method now persists to `audit_trail` via Supabase REST:

- Maps `eventType` to allowed `audit_action` enum (create/update/delete/export/access) via a comprehensive mapping table
- Maps actor, target, context, and changes from the rich event format to the table's flat columns
- Stores the hash chain sequence and severity in `metadata` JSONB
- Skips persistence when `organization_id` is null (NOT NULL constraint)
- Non-fatal: persistence failures are logged but don't block the request

### 2. New `getLogs(env)` Method

Queries persisted audit trail from Supabase (200 most recent, ordered by `created_at DESC`). Falls back to in-memory logs when Supabase is unavailable. This fixes the previously broken `/v1/audit/log` endpoint.

### 3. New `export(startDate, endDate, env)` Method

Queries up to 5,000 audit records with optional date range filtering. Falls back to in-memory `query()` with same filters. This fixes the previously broken `/v1/audit/export` endpoint.

---

## Files Modified

| File | Changes |
|------|---------|
| `modules/audit-logging.js` | Added `persistToSupabase()` in `log()`, action type mapping, new `getLogs()` and `export()` methods |

## Audit Event Flow (After Fix)

```
Gateway request → auditLogger.log('event_type', data)
  ├─ In-memory: this.logs.push(event)     ← fast, tamper-evident chain
  ├─ Supabase: INSERT INTO audit_trail    ← persistent, queryable
  └─ Emit: this.emit('audit', event)      ← extensible
```

## Compliance Impact

- **SOX**: 7-year audit retention now persisted (was in-memory only)
- **SOC 2**: All mutations tracked with before/after state
- **EU AI Act**: AI-related events (model recommendations, agent actions) now durably logged
- All ~30+ `auditLogger.log()` call sites across the gateway now automatically persist

## Deployment

```bash
cd /Users/bcottc22/Downloads/Finault-Enterprise-Hardening/finault-monorepo/apps/gateway
npx wrangler deploy --name finault-gateway
```
