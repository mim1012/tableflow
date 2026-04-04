<!-- Generated: 2026-04-04 | Updated: 2026-04-04 -->

# TableFlow (-qr)

## Purpose
B2B SaaS platform for restaurant QR ordering and POS management. Customers scan QR codes to order from their table; owners manage orders via admin dashboard with real-time updates. Three user interfaces: customer QR menu, owner/staff admin dashboard, waiting kiosk. Includes a marketing landing page.

## Key Files

| File | Description |
|------|-------------|
| `CLAUDE.md` | Project instructions for Claude Code — read first |
| `package.json` | Dependencies and npm scripts |
| `next.config.ts` | Next.js 15 configuration |
| `tsconfig.json` | TypeScript configuration |
| `vitest.config.ts` | Unit test configuration (Vitest) |
| `playwright.config.ts` | E2E test configuration (Playwright) |
| `biome.json` | Code formatter/linter configuration |
| `vercel.json` | Vercel deployment configuration |
| `sentry.edge.config.ts` | Sentry error tracking (edge runtime) |
| `sentry.server.config.ts` | Sentry error tracking (server runtime) |
| `instrumentation.ts` | Next.js instrumentation hook |
| `src/middleware.ts` | Auth middleware (redirects to /login if unauthenticated) |
| `.env.example` | Environment variable template |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/` | Application source code (see `src/AGENTS.md`) |
| `docs/` | Documentation — PRD, schema, decisions (see `docs/AGENTS.md`) |
| `e2e/` | Playwright E2E test suites (see `e2e/AGENTS.md`) |
| `supabase/` | Backend — Edge Functions and DB migrations (see `supabase/AGENTS.md`) |
| `.claude/` | Project-local Claude Code config — agents, skills, hive (see `.claude/AGENTS.md`) |
| `.github/` | CI/CD workflows and secrets documentation |
| `guidelines/` | Project coding standards |

## For AI Agents

### Working In This Directory
- Read `CLAUDE.md` before making any changes — it defines the full architecture and conventions.
- Run `npm run build` to verify no TypeScript errors after changes.
- Use `npm run dev` to start dev server at `localhost:3000` (Next.js 15).
- Path alias `@` maps to `./src` — always use this for imports.

### Testing Requirements
```bash
npm run test:unit          # Vitest unit tests
npx playwright test        # Full E2E suite
```

### Common Patterns
- 3-layer data architecture: `src/lib/api/` (DB calls) -> `src/hooks/` (React hooks) -> components
- Immutable data updates (spread operators, never mutate)
- CSS tokens from `src/styles/theme.css` — never hardcode colors or spacing
- Supabase RLS enforces multi-tenant isolation by `store_id`

## Dependencies

### External
- Next.js 15 — React framework (App Router)
- Supabase — PostgreSQL + Auth + Realtime + Edge Functions
- Tailwind CSS v4 — via `@tailwindcss/vite` plugin
- shadcn/ui — 48 UI primitives in `src/app/components/ui/` (READ-ONLY, do not modify)
- Biome — formatter and linter
- Vitest — unit testing
- Playwright — E2E testing
- Sentry — error tracking

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
