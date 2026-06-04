# Launch Tenant Boundaries 2026-06-04

Category: decision
Tags: launch, multitenancy, supabase, vercel, rls

## Summary
On 2026-06-04, TableFlow deployed controlled multi-store pilot hardening for tenant boundaries.

## Deployment
- Commit: `876ecc15020af95e69e86a7772820ffc675aa783`
- Commit title: `Harden launch tenant boundaries`
- GitHub Actions run: `26935943343`
- Supabase migration: `20260604053000_enforce_active_store_memberships.sql`
- Edge Functions redeployed: `create-staff`, `staff-admin`, `send-alimtalk`
- Vercel deployment: `dpl_HPMRPzWBJTbN5r6pBwVYDsdBpmNQ`
- Production smoke: `https://tabledotflow.com/login` returned HTTP 200

## Tenant Contract
- Superadmin is the only cross-store operator for this pilot.
- Non-superadmin users are single-store principals.
- Non-superadmin access is unavailable when an account has zero or more than one active store membership.
- `/admin` and `/admin/kds` use server-resolved store context; ordinary users cannot select store context through `?storeId=`.
- Inactive or expired stores cannot be launched into `/admin`, even by superadmin.

## Guarded Boundaries
- RLS helper functions now filter ordinary `my_store_ids()` and `my_store_role()` by active store lifecycle.
- Server actions guard active store before order and waiting ID-only mutations.
- Edge Functions guard active stores and active members before staff and waiting notification operations.

## Verification
- Targeted unit tests: `23/23` passed for `order.test.ts` and `waiting.test.ts`.
- Local production build passed.
- Independent review: code-reviewer `APPROVE`, architect `CLEAR`.
- GitHub Actions deploy passed.
- Vercel production deployment is `READY`.

## Follow-Up
- Add explicit store-selection UX before supporting multi-store ordinary operators.
- Run authenticated production smoke for active owner, inactive store, and superadmin active/inactive launch paths.
- Stabilize full Vitest suite execution; default fork run hit worker startup timeouts after `120` tests passed.
