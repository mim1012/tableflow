<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-04 | Updated: 2026-04-04 -->

# src/lib/api/

## Purpose
Pure async functions that interact with Supabase. One file per domain. No React, no hooks, no side effects. These are the single source of DB access logic — hooks and server actions call these, not raw `supabase` queries.

## Key Files

| File | Description |
|------|-------------|
| `order.ts` | Create order (`order_atomic` RPC), fetch orders by store |
| `order.test.ts` | Unit tests for order API |
| `menu.ts` | Fetch public menu by store slug (no auth) |
| `menu.test.ts` | Unit tests for menu API |
| `menuAdmin.ts` | Admin CRUD — create/update/delete menu items, categories, options |
| `menuAdmin.test.ts` | Unit tests for menu admin API |
| `admin.ts` | Order management, table CRUD, revenue/analytics queries, customer list |
| `staffAdmin.ts` | Staff account management — calls `create-staff` Edge Function |
| `waiting.ts` | Waiting queue — insert customer, fetch queue, update status |
| `waiting.test.ts` | Unit tests for waiting API |
| `customers.ts` | Customer profiles, points balance, loyalty history |
| `subscription.ts` | Store subscription status — `checkStoreActive()`, renewal dates |
| `subscription.test.ts` | Unit tests for subscription checks |
| `superadmin.ts` | SuperAdmin read queries — store list, account list |
| `alimtalk.ts` | KakaoTalk/SMS notification dispatch |

## For AI Agents

### Working In This Directory
- Functions are pure: `async function foo(params): Promise<Result>` — no state, no hooks.
- Always type return values against `src/types/database.ts`.
- Use the appropriate client: browser queries use `createBrowserClient()`, server queries use `createServerClient()`.
- `order_atomic` is a Supabase RPC call — never replicate its logic in JS; trust the DB function.
- Test files use the mock from `src/test/mocks/supabase.ts`.

### Common Patterns
```ts
export async function getOrdersByStore(storeId: string): Promise<Order[]> {
  const supabase = createBrowserClient()
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data
}
```

## Dependencies

### Internal
- `src/lib/supabase/client.ts` — browser client
- `src/lib/supabase/server.ts` — server client
- `src/types/database.ts` — typed DB schema

<!-- MANUAL: -->
