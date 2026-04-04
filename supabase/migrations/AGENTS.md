<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-04 | Updated: 2026-04-04 -->

# supabase/migrations/

## Purpose
Chronological SQL migration files applied to the Supabase PostgreSQL database. Contains the full history of schema creation, RLS policies, triggers, indexes, security hardening, and feature additions across ~59 migrations.

## Migration Groups

| Range | Description |
|-------|-------------|
| `20260315000001-000003` | Core schema — stores, members, tables, menu, orders, waitings |
| `20260315000004-000007` | `order_atomic` RPC, subscription fields, member policy fixes |
| `20260316000001-000007` | Security hardening — price validation, anon RLS, queue security, Realtime |
| `20260317000001-000008` | Waiting queue RLS — anon insert policies, member policy stabilization |
| `20260321000001-20260324000009` | Role-based RLS, order status transitions, option price enforcement, rate limiting |
| `20260329000001-20260401000001` | Queue number reset, customers table, points system, storage, PAX field |

## For AI Agents

### Working In This Directory
- NEVER edit existing migration files — they are immutable history.
- New migrations: create a new file with the NEXT timestamp (e.g., `20260405000001_description.sql`).
- File naming: `YYYYMMDDHHMMSS_snake_case_description.sql`.
- Always include rollback comments in complex migrations.
- After writing a migration, update `docs/SCHEMA.md` and `src/types/database.ts`.

### Common Patterns
- Enable RLS on every new table: `ALTER TABLE x ENABLE ROW LEVEL SECURITY;`
- Policies follow the pattern: `store_id = (SELECT store_id FROM store_members WHERE user_id = auth.uid())`
- Atomic operations use `CREATE OR REPLACE FUNCTION ... LANGUAGE plpgsql SECURITY DEFINER`
- Rate limiting: trigger function checking insert count in time window
- All foreign keys reference `stores(id)` for multi-tenant isolation

### Key Functions in DB
| Function | Purpose |
|----------|---------|
| `order_atomic` | Validate and create order atomically (price, stock, options) |
| `add_table_atomic` | Create table with duplicate name check |
| `get_next_queue_number` | Thread-safe queue number with daily reset |

<!-- MANUAL: -->
