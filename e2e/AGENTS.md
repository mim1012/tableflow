<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-04 | Updated: 2026-04-04 -->

# e2e/

## Purpose
Playwright end-to-end test suites covering all critical user flows across three interfaces: customer QR ordering, admin dashboard (owner/staff/manager), and superadmin management. Tests run against a live dev server with a real Supabase backend.

## Key Files

| File | Description |
|------|-------------|
| `e2e-helpers.ts` | Shared utilities: `login()`, `loginAndWaitForAdmin()`, `requireEnv()`, `getServiceRoleHeaders()` |
| `order-flow.spec.ts` | Core user flow — superadmin creates store, owner sets up menu, customer orders |
| `superadmin.spec.ts` | SuperAdmin dashboard — store/account/billing management |
| `login.spec.ts` | Authentication flows — login, logout, password change |
| `staff.spec.ts` | Staff management (SC-011, SC-013, SC-020) |
| `menu.spec.ts` | Menu CRUD — categories, items, options |
| `order-detail.spec.ts` | Customer cart and order submission flow |
| `waiting.spec.ts` | Waiting queue kiosk (SC-026, SC-027) |
| `admin-gaps.spec.ts` | P0/P1 admin feature gap coverage |
| `order-gaps.spec.ts` | Order feature gap coverage |
| `security-gaps.spec.ts` | Security-related gap tests |
| `edge-cases.spec.ts` | Edge case scenarios (SC-030 to SC-038) |
| `edge-case-extended.spec.ts` | Extended edge case coverage |
| `table-add-qr.spec.ts` | Table creation and QR code generation |
| `debug-login.spec.ts` | Auth debug flow diagnostics |
| `debug-add-table.spec.ts` | Table operation debug diagnostics |

## For AI Agents

### Working In This Directory
- Always import helpers from `./e2e-helpers` — do not duplicate login logic.
- Required env vars: `TEST_SUPERADMIN_EMAIL`, `TEST_SUPERADMIN_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`.
- Use `requireEnv()` to fail fast when env vars are missing.
- Tests use `page.waitForSelector()` / `page.waitForURL()` — avoid fixed sleeps.
- Timeout: 90 seconds per test. Retry: 1. On failure: screenshots + video + trace saved automatically.

### Testing Requirements
```bash
npx playwright test                            # all suites
npx playwright test e2e/order-flow.spec.ts     # single suite
npx playwright test --grep "SC-011"            # by scenario ID
npx playwright show-report test-reports/html   # view report
```

### Common Patterns
- Test IDs follow `SC-XXX` convention matching `docs/testplan.md`.
- Admin login: `loginAndWaitForAdmin(page, email, password)`.
- Direct DB operations: use `getServiceRoleHeaders()` with Supabase REST API.
- Mobile viewport tests: use `{ viewport: { width: 390, height: 844 } }`.

## Dependencies

### Internal
- `src/` — tests exercise the live application, not unit-tested code directly
- `docs/testplan.md` — scenario IDs and priority classification

### External
- Playwright 1.x
- `@playwright/test` — test runner
- Dev server auto-started on `localhost:3000` (configured in `playwright.config.ts`)

<!-- MANUAL: -->
