<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-04 | Updated: 2026-04-04 -->

# src/lib/

## Purpose
The data and utility layer. Contains the Supabase client factory, all async API functions (pure DB calls), shared utilities, and environment variable validation.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `api/` | Pure async functions that call Supabase — one file per domain (see `api/AGENTS.md`) |
| `supabase/` | Supabase client initialization — browser and server variants (see `supabase/AGENTS.md`) |
| `utils/` | Shared utility functions — order status helpers, subscription checks (see `utils/AGENTS.md`) |

## Key Files

| File | Description |
|------|-------------|
| `env.ts` | Environment variable validation — throws at startup if `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are missing |

## For AI Agents

### Working In This Directory
- `api/` functions are pure async — no React, no hooks, no side effects beyond the DB call.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to browser code — only use in server-side code or Edge Functions.
- `env.ts` fails fast at startup — always add new required env vars here.

### Common Patterns
- API functions take explicit params (not config objects) for testability.
- All DB calls are typed against `src/types/database.ts`.
- Error handling: let errors propagate to hooks; hooks decide whether to swallow or surface.

## Dependencies

### Internal
- `src/types/database.ts` — Database interface for typed Supabase queries
- `src/lib/supabase/` — Supabase client instances

### External
- `@supabase/supabase-js`, `@supabase/ssr`

<!-- MANUAL: -->
