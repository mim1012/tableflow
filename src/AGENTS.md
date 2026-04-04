<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-04 | Updated: 2026-04-04 -->

# src/

## Purpose
All application source code for TableFlow. Organized into the Next.js App Router structure (`app/`), shared hooks, API layer, types, styles, providers, and test infrastructure.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `app/` | Next.js App Router — pages, layouts, server actions, components (see `app/AGENTS.md`) |
| `hooks/` | React hooks wrapping API layer + Supabase Realtime subscriptions (see `hooks/AGENTS.md`) |
| `lib/` | Data layer — Supabase client, API functions, utilities, env validation (see `lib/AGENTS.md`) |
| `types/` | TypeScript type definitions — database schema types, auth types (see `types/AGENTS.md`) |
| `styles/` | CSS custom properties, global resets, Tailwind directives (see `styles/AGENTS.md`) |
| `providers/` | React context providers — Auth, Toast (see `providers/AGENTS.md`) |
| `test/` | Vitest setup and shared mock utilities (see `test/AGENTS.md`) |

## Key Files

| File | Description |
|------|-------------|
| `middleware.ts` | Next.js middleware — checks auth session, redirects unauthenticated users to /login |

## For AI Agents

### Working In This Directory
- Never import from `app/components/ui/` with modification intent — those are read-only shadcn primitives.
- Use the `@/` path alias for all imports (maps to `src/`).
- Data access pattern: components -> hooks -> `lib/api/` -> Supabase. Never call `supabase` directly in components.
- All Supabase Realtime subscriptions must call `supabase.removeChannel()` on cleanup.

### Testing Requirements
- Unit tests co-located with source or in `src/**/*.test.ts(x)`.
- Run: `npm run test:unit` (Vitest, jsdom environment).
- E2E tests live in `e2e/` (project root), not here.

### Common Patterns
- Immutable state updates — always spread into new objects.
- CSS variables from `styles/theme.css` — no hardcoded colors/spacing.
- `store_id` scoping in all DB queries for multi-tenant isolation.

## Dependencies

### External
- React 18, Next.js 15 (App Router)
- @supabase/ssr, @supabase/supabase-js
- Tailwind CSS v4, shadcn/ui
- Sonner (toast notifications)
- Zod (validation)
- Lucide React (icons)

<!-- MANUAL: -->
