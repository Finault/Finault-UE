# GAP #23: GOALS Table Defined But Never Used — SOLUTION

**Status:** IMPLEMENTED
**Date:** February 7, 2026
**Severity:** LOW

---

## Problem Statement

A well-designed `goals` table existed in the schema with:
- `title`, `description`, `goal_type` (cost_reduction, savings_target, efficiency, anomaly_detection)
- `target_value`, `current_value`, computed `progress_percentage`
- `deadline`, `start_date`, `priority`, `owner_id`
- 8 indexes, constraints, and status tracking

However, the `GoalTracker` class in `space-apple-dashboard.js` queried a **non-existent** `cost_goals` table with different field names (`org_id` vs `organization_id`, `target_amount` vs `target_value`, `target_date` vs `deadline`). Every API call to the goals endpoint would fail silently.

Additionally, only GET/POST routes existed — no way to update progress or complete/abandon goals.

## Solution

### 1. Rewired `GoalTracker` to Real `goals` Table

**`getGoalProgress()`**:
- Queries `goals` table with `organization_id` (was `cost_goals` with `org_id`)
- Supports `status` filter (default: 'active', or 'all' for everything)
- Supports `goal_type` filter
- Orders by `priority` (ascending)
- For cost_reduction/savings_target goals with `current_value = 0`, attempts live computation from `usage` table
- Returns enriched objects with: `title`, `goal_type`, `category`, `unit`, `priority`, `owner_id`, `overdue` flag, `days_remaining`

**`createGoal()`**:
- Maps to real schema: `organization_id`, `title`, `target_value`, `deadline`, `goal_type`, `category`, `unit`, `priority`, `owner_id`, `metadata`
- Accepts both old field names (`target_amount`/`target_date`) and new ones for backward compatibility
- Input validation for required fields

### 2. New `updateGoal()` Method + PUT Route

- Accepts whitelisted fields: title, description, target_value, current_value, deadline, status, priority, category, owner_id, metadata
- Auto-sets `completed_at` when status changes to 'completed'
- Scoped to `organization_id` for multi-tenant isolation

### 3. New `deleteGoal()` Method + DELETE Route

- Soft delete: sets `status = 'abandoned'` (respects schema constraints)
- Scoped to `organization_id`

### 4. Gateway Handler Updates

- `getGoals()`: Now passes `status` and `goal_type` query params
- `createGoal()`: Returns `goal.title` in message, 400 on validation errors
- `updateGoal()`: Validates `id` in body
- `deleteGoal()`: Takes `?id=` query param

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/gateway/space-apple-dashboard.js` | Rewired `GoalTracker`: `getGoalProgress()` uses `goals` table, added filters, live spend computation. `createGoal()` maps to real schema. Added `updateGoal()` and `deleteGoal()`. |
| `apps/gateway/gateway-wired.js` | Added PUT/DELETE routes for `/v1/dashboard/goals`. Updated `getGoals` to pass filters. Added `updateGoal()` and `deleteGoal()` handlers. |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/dashboard/goals?status=active&goal_type=cost_reduction` | List goals with filters |
| POST | `/v1/dashboard/goals` | Create a new goal |
| PUT | `/v1/dashboard/goals` | Update goal (pass `id` in body) |
| DELETE | `/v1/dashboard/goals?id=<uuid>` | Soft-delete (abandon) a goal |

## Deployment

```bash
cd /Users/bcottc22/Downloads/Finault-Enterprise-Hardening/finault-monorepo/apps/gateway
npx wrangler deploy --name finault-gateway
```
