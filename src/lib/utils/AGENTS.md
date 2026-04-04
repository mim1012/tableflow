<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-04 | Updated: 2026-04-04 -->

# src/lib/utils/

## Purpose
Shared utility functions used across the codebase. Pure functions — no side effects, no React dependencies. Covers order status transitions, subscription validation, and general helpers.

## Key Files

| File | Description |
|------|-------------|
| `orderStatus.ts` | Order status enum, valid transition map, `isValidTransition(from, to)` guard |
| `orderStatus.test.ts` | Unit tests for status transition logic |
| `subscription.ts` | `isSubscriptionActive(store)` — checks billing status and expiry date |
| `subscription.test.ts` | Unit tests for subscription checks |

## For AI Agents

### Working In This Directory
- Functions are pure — no DB calls, no imports from `lib/api/` or hooks.
- Order status transitions are enforced here AND in the DB (migration has trigger) — keep in sync.
- Order status values: `'pending'`, `'accepted'`, `'preparing'`, `'ready'`, `'completed'`, `'cancelled'`.

### Common Patterns
```ts
// Status transition guard
if (!isValidTransition(order.status, newStatus)) {
  throw new Error(`Cannot transition ${order.status} -> ${newStatus}`)
}
```

## Dependencies

### Internal
- `src/types/database.ts` — Order and Store types

<!-- MANUAL: -->
