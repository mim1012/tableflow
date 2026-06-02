# TableFlow Launch Readiness Check — 2026-06-01

**Current verdict:** CONDITIONAL GO for controlled pilot / NO-GO for broad public SaaS launch

## Verified green
- GitHub Actions deploy run `26760871825` succeeded for commit `8831a1bde7e112f7e20d121d982bcf3bda37509b`
- `npm run build` passed
- `npx vitest run src/lib/api/staffCall.test.ts` passed (4/4)
- `PLAYWRIGHT_BASE_URL=https://tabledotflow.com npx playwright test e2e/login.spec.ts --project=desktop` passed with a newly provisioned superadmin account
- `PLAYWRIGHT_BASE_URL=https://tabledotflow.com npx playwright test e2e/staff-call-race-prod-safe.spec.ts --project=desktop` passed
- `PLAYWRIGHT_BASE_URL=https://tabledotflow.com npx playwright test e2e/staff-call-prod-safe.spec.ts --project=desktop` passed after provisioning a fresh owner/store test fixture
- `PLAYWRIGHT_BASE_URL=https://tabledotflow.com npx playwright test e2e/waiting.spec.ts --project=desktop` passed (`9/9`)
- `PLAYWRIGHT_BASE_URL=https://tabledotflow.com npx playwright test e2e/order-flow.spec.ts e2e/security-gaps.spec.ts --project=desktop` passed after replacing brittle `networkidle` / placeholder assumptions with current UI readiness checks
- `PLAYWRIGHT_BASE_URL=https://tabledotflow.com npx playwright test e2e/waiting.spec.ts e2e/order-flow.spec.ts e2e/security-gaps.spec.ts e2e/staff-call-race-prod-safe.spec.ts e2e/staff-call-prod-safe.spec.ts --project=desktop` passed as a launch-critical bundle (`45 passed`, `4 skipped`, `0 failed`)
- `npm run test:unit -- src/app/actions/waiting.test.ts src/app/components/admin/panels/WaitingPanel.test.tsx` passed (`18/18`)
- Waiting creation now survives transient alimtalk send failures, `WAITING_CREATED` duplicate log collisions are deduped/idempotent, and failed waiting notifications are visible in admin with manual retry

## Remaining red / unresolved
- Broad public SaaS launch is still blocked on non-E2E operational items rather than the previously broken launch-critical suites
- External Solapi/Kakao delivery outages, disabled templates, or partner-side messaging incidents are still outside app-level control
- Failed waiting notifications currently support **manual retry + admin visibility**, not an automatic background retry worker
- `order-flow.spec.ts` still contains 4 skipped legacy notification-permission cases (`NT-002`~`NT-005`)

## What changed during this pass
- Replaced stale superadmin create-store assumptions (manual slug / placeholder selectors) with helper-based store creation and runtime slug lookup
- Replaced brittle `networkidle` waits with explicit admin-shell / customer-readiness checks aligned to the deployed UI
- Hardened waiting E2E staff-call setup so prod-safe reruns do not depend on a just-logged-in owner token path
- Made waiting registration resilient to transient alimtalk failures without dropping the waiting itself
- Added admin-side failed waiting notification monitoring and manual retry action
- Added unit coverage for retryability rules and the waiting panel failed-notification block

## Launch-critical areas now covered
### Waiting
- public waiting registration
- refresh/session recovery
- cancel
- re-register with same phone and new queue number
- admin waiting transitions
- failed waiting notification visibility + manual retry path

### Ordering
- public order placement
- admin realtime receipt
- status transitions
- offline/reconnect behavior

### Security / tenancy
- RLS / cross-tenant access denial
- staff vs owner vs superadmin role boundaries
- service-role-only setup and restricted mutation checks

## Operational interpretation
- The previous blocker (**launch-critical E2E drift against the current superadmin UI**) is resolved
- The product now has fresh deployed-environment evidence for waiting / order / security / staff-call critical flows
- The remaining risk is no longer selector drift or missing deployment plumbing; it is mainly operational messaging reliability outside the app and the absence of automatic background retry for failed waiting notifications

## Minimum go-live gates from here
1. Decide whether manual retry is sufficient for pilot launch or whether an automatic retry worker is required before broader rollout
2. Verify at least one real alimtalk send path end-to-end with the approved test recipient only (`01075358897`)
3. Close or consciously defer the 4 skipped legacy notification-permission E2E cases
4. Update operator runbooks so staff know to check the new failed-notification block in the waiting panel

## Practical recommendation
- **Controlled pilot / limited production use:** GO
- **Broad public SaaS launch:** hold until automatic retry policy vs manual-ops policy is explicitly decided and a real approved-recipient alimtalk send is re-verified
