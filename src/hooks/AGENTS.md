<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-04 | Updated: 2026-04-04 -->

# src/hooks/

## Purpose
React hooks that wrap the API layer and manage Supabase Realtime subscriptions. Components access all data exclusively through these hooks — never calling `supabase` or API functions directly.

## Key Files

| File | Description |
|------|-------------|
| `useOrders.ts` | Fetch orders by store + subscribe to INSERT/UPDATE via Realtime |
| `useMenu.ts` | Fetch customer-facing menu items (public, no auth required) |
| `useMenuAdmin.ts` | Admin menu CRUD — create, update, delete items and categories |
| `useWaitingQueue.ts` | Fetch waiting queue + Realtime subscription for live updates |
| `useMyWaiting.ts` | Customer's own waiting entry status |
| `useOrderStatus.ts` | Subscribe to a specific order's status changes |
| `useRealtimeTables.ts` | Realtime subscription for table occupancy/status updates |
| `useOrderNotification.ts` | Browser push notifications for new orders (admin) |
| `useNotificationPermission.ts` | Manage browser notification permission state |
| `useOrderNotification.test.ts` | Unit tests for notification hook |

## For AI Agents

### Working In This Directory
- All hooks must follow the Realtime cleanup pattern:
  ```ts
  useEffect(() => {
    const channel = supabase.channel(...)
      .on('postgres_changes', ..., handler)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [storeId])
  ```
- Never call `supabase` client directly in components — always go through a hook.
- Hooks with Realtime should guard against `setState` calls after unmount.

### Testing Requirements
- Unit tests in co-located `*.test.ts` files.
- Mock supabase client via `src/test/mocks/supabase.ts`.
- Run: `npm run test:unit`

### Common Patterns
- Hooks return `{ data, loading, error }` shape.
- Optimistic updates: update local state first, then sync with DB.
- Error state should be surfaced to the component — never swallowed silently.

## Dependencies

### Internal
- `src/lib/api/` — underlying async DB functions
- `src/lib/supabase/client.ts` — browser Supabase client
- `src/types/database.ts` — typed return values

<!-- MANUAL: -->
