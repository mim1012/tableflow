# TableFlow Launch Readiness Check — 2026-06-04

**Current verdict:** GO for controlled multi-store pilot / HOLD for broad franchised SaaS until explicit multi-store user selection is designed.

## Deployment Evidence
- Commit: `876ecc15020af95e69e86a7772820ffc675aa783` (`Harden launch tenant boundaries`)
- GitHub Actions deploy run: `26935943343`
- GitHub Actions result: success
  - `build`: success
  - `supabase db push --include-all`: success
  - Edge Functions deploy: success
- Vercel production deployment: `dpl_HPMRPzWBJTbN5r6pBwVYDsdBpmNQ`
- Vercel state: `READY`
- Production domain smoke: `https://tabledotflow.com/login` returned HTTP 200

## What Changed
- Added active-store lifecycle enforcement to authenticated tenant scope through migration `20260604053000_enforce_active_store_memberships.sql`.
- Added server-side store context resolution for `/admin` and `/admin/kds`; ordinary admins no longer decide tenant context from client `?storeId=`.
- Superadmin can inspect stores, but inactive or expired stores cannot be launched into `/admin`.
- ID-only admin mutations now resolve `store_id` and guard active-store state before mutation:
  - order status changes
  - order deletion
  - order pax changes
  - waiting call
  - waiting completion
  - waiting notification retry
- Edge Functions now reject inactive stores and inactive members for staff and waiting-notification operations:
  - `create-staff`
  - `staff-admin`
  - `send-alimtalk`

## Tenant Contract For Pilot
- Superadmin remains the explicit cross-store operator.
- Non-superadmin accounts are treated as single-store principals.
- If a non-superadmin account has zero or more than one active store membership, admin access is unavailable.
- Adding a true multi-store owner/franchise operator requires a product-level store-selection flow before broad rollout.

## Verification
- `npm run test:unit -- src/app/actions/order.test.ts src/app/actions/waiting.test.ts` passed (`23/23`).
- `npm run build` passed locally.
- Independent code-reviewer re-review: `APPROVE`.
- Independent architecture re-review: `CLEAR`.
- GitHub Actions production deploy passed.
- Vercel production deployment is `READY`.
- Production `/login` smoke returned HTTP 200.

## Known Gaps
- Full `npm run test:unit` under default Vitest forks reported worker startup timeouts after `120` tests passed; no assertion failure was observed, but the full suite was not a clean green run.
- A single-worker full Vitest retry did not complete in a useful time window.
- No authenticated production smoke was run for ordinary admin, inactive-store admin, or superadmin store launch paths in this pass.
- GitHub Actions emitted Node.js 20 deprecation annotations; jobs still succeeded.

## Operational Follow-Up
1. Run an authenticated production smoke with:
   - one ordinary active-store owner
   - one inactive or expired store
   - one superadmin opening active and inactive stores
2. Add an explicit multi-store selector before allowing ordinary users to hold multiple active memberships.
3. Decide whether the full Vitest suite should be configured with a stable worker pool for CI.
4. Keep `docs/launch-readiness-2026-06-01.md` as the prior E2E launch-critical evidence baseline; this note covers the 2026-06-04 tenant-boundary deployment.
