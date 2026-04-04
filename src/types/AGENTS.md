<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-04 | Updated: 2026-04-04 -->

# src/types/

## Purpose
TypeScript type definitions for the entire application. Manually maintained (not auto-generated). The `database.ts` file mirrors the Supabase DB schema and must be kept in sync with `docs/SCHEMA.md` and `supabase/migrations/`.

## Key Files

| File | Description |
|------|-------------|
| `database.ts` | Supabase DB types — `Row`, `Insert`, `Update` per table + `Database` interface |
| `auth.ts` | Auth types — `StoreUser` (id, email, role, storeId, storeName), `UserRole` enum |
| `css.d.ts` | CSS module type declarations |

## For AI Agents

### Working In This Directory
- `database.ts` is manually managed — update it whenever `supabase/migrations/` adds or modifies columns.
- Structure follows Supabase conventions:
  ```ts
  type Tables = {
    table_name: {
      Row: { ... }    // SELECT result
      Insert: { ... } // INSERT payload (optional fields)
      Update: { ... } // UPDATE payload (all optional)
    }
  }
  ```
- `StoreUser` in `auth.ts` is the type returned by `useAuthContext()` — update if auth context changes.

### Common Patterns
- Import types as: `import type { Tables } from '@/types/database'`
- Row type shorthand: `type Order = Database['public']['Tables']['orders']['Row']`

## Dependencies

### Internal
- `supabase/migrations/` — schema changes require updating this file
- `docs/SCHEMA.md` — canonical schema reference

<!-- MANUAL: -->
