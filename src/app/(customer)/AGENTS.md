<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-04 | Updated: 2026-04-04 -->

# src/app/(customer)/

## Purpose
Customer-facing routes — no authentication required. Contains the QR order menu (the main customer touchpoint) and the waiting queue kiosk. Route group is organizational; `(customer)` does not appear in URLs.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `m/[storeSlug]/[tableId]/` | QR order menu — customer browses menu, adds to cart, submits order |
| `waiting/[storeSlug]/` | Waiting queue kiosk — customers register for a table wait slot |

## Key Files

| File | Description |
|------|-------------|
| `m/[storeSlug]/[tableId]/page.tsx` | QR menu page — resolves store by slug, table by ID |
| `m/[storeSlug]/[tableId]/CustomerMenuClient.tsx` | Client component — cart state, menu browsing, order submission |
| `waiting/[storeSlug]/page.tsx` | Waiting page — resolves store by slug |
| `waiting/[storeSlug]/WaitingClient.tsx` | Client component — form to register for queue, displays queue number |

## For AI Agents

### Working In This Directory
- These routes are PUBLIC — no auth. Validate `storeSlug` and `tableId` from URL params carefully.
- `CustomerMenuClient.tsx` holds cart state locally (no server sync until order submission).
- Order submission calls `src/lib/api/order.ts` -> `order_atomic` RPC (atomic, server-side price calc).
- `WaitingClient.tsx` polls or subscribes to queue position updates via `useMyWaiting`.
- Handle store-not-found and table-not-found gracefully with user-friendly error UI.

### Common Patterns
- Store data fetched server-side in `page.tsx`; interactive state managed client-side in `*Client.tsx`.
- Cart: array of `{ menuItemId, quantity, options, note }` in `useState`.
- Mobile-first design — these pages are viewed on customer phones.

## Dependencies

### Internal
- `src/lib/api/menu.ts` — public menu fetch by store slug
- `src/lib/api/order.ts` — order creation
- `src/lib/api/waiting.ts` — waiting queue insert
- `src/hooks/useMyWaiting.ts` — customer's queue status

<!-- MANUAL: -->
