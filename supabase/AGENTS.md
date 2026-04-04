<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-04 | Updated: 2026-04-04 -->

# supabase/

## Purpose
Supabase backend configuration including Edge Functions (Deno runtime) and database migrations. This is the authoritative backend for TableFlow — all server-side logic, RLS policies, security functions, and database schema changes live here.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `functions/` | Edge Functions (Deno) — auth guards, store creation, staff management, notifications (see `functions/AGENTS.md`) |
| `migrations/` | Chronological SQL migration files — schema, RLS policies, triggers, indexes (see `migrations/AGENTS.md`) |

## Key Files

| File | Description |
|------|-------------|
| `seed.sql` | Development seed data — test stores, menus, tables |
| `.temp/` | CLI metadata — postgres version, project ref (auto-generated, do not edit) |

## For AI Agents

### Working In This Directory
- Never run migrations directly — apply via `supabase db push` or Supabase Dashboard.
- Migration filenames follow `YYYYMMDDHHMMSS_description.sql` format — always use next sequential timestamp.
- Cross-reference `docs/schema.sql` and `docs/SCHEMA.md` when writing migrations.
- Edge Functions run on Deno — use `deno.json` for imports, not `package.json`.
- After schema changes, update `src/types/database.ts` manually (types are not auto-generated).

### Testing Requirements
- No automated tests for migrations — verify manually via Supabase Dashboard.
- Edge Functions: test via `supabase functions serve` locally or deploy to staging.

### Common Patterns
- All tables have RLS enabled with `store_id` row-level isolation.
- Atomic operations use PostgreSQL functions (e.g., `order_atomic`, `add_table_atomic`).
- Rate limiting implemented via triggers on insert-heavy tables.
- CORS headers handled by `functions/_shared/cors.ts`.

## Dependencies

### External
- Supabase CLI
- PostgreSQL 15+
- Deno (for Edge Functions)

<!-- MANUAL: -->
