<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-04 | Updated: 2026-04-04 -->

# src/app/superadmin/

## Purpose
SuperAdmin panel (`/superadmin`) for the platform operator (development company). Manages all stores, owner accounts, staff accounts, and billing periods. Protected by `SuperAdminRoute` which verifies superadmin role via Edge Function.

## Key Files

| File | Description |
|------|-------------|
| `page.tsx` | SuperAdmin page — server component, mounts the superadmin dashboard client |
| `layout.tsx` | SuperAdmin layout — separate nav from admin dashboard |

## For AI Agents

### Working In This Directory
- Superadmin actions call Edge Functions (`supabase/functions/superadmin/`) — they require the service role.
- `SuperAdminRoute` checks role by calling `check-superadmin` Edge Function — do not bypass.
- All mutations go through `src/app/actions/superadmin.ts` server actions.
- This UI is for internal ops only — do not surface store-level data that shouldn't be visible.

### Common Patterns
- Store list is fetched via `src/lib/api/superadmin.ts`.
- Mutations: create store + owner atomically via `create-store-with-owner` Edge Function.
- Billing: update `billing_status` and `billing_end_date` fields on `stores` table.

## Dependencies

### Internal
- `src/app/actions/superadmin.ts` — server actions
- `src/lib/api/superadmin.ts` — read queries
- `supabase/functions/superadmin/` — privileged mutations

<!-- MANUAL: -->
