<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-04 | Updated: 2026-04-04 -->

# src/app/admin/

## Purpose
Admin dashboard route (`/admin`) for store owners and staff. Provides real-time order management, menu editing, table management, analytics, and KDS (Kitchen Display System). Protected by `ProtectedRoute`.

## Key Files

| File | Description |
|------|-------------|
| `page.tsx` | Admin dashboard page — thin server component, mounts `AdminDashboardClient` |
| `layout.tsx` | Admin layout — persistent sidebar/navigation wrapper |
| `AdminDashboardClient.tsx` | Main client component — manages active panel state, routes to panel components |
| `kds/page.tsx` | KDS page — Kitchen Display System fullscreen route (`/admin/kds`) |
| `kds/KDSFullscreenClient.tsx` | KDS client component — real-time order queue for kitchen display |

## For AI Agents

### Working In This Directory
- `AdminDashboardClient.tsx` is large — be surgical with edits, understand the panel routing before modifying.
- Panel components live in `src/app/components/admin/` — not here.
- KDS is a separate route so kitchen screens can run fullscreen independently.
- Auth is handled by `ProtectedRoute` in the layout — no need to re-check auth in page components.

### Common Patterns
- Active panel state: `activePanel` prop passed down to `AdminDashboardClient`.
- Role-based UI: check `user.role` from `useAuthContext()` to show/hide owner-only features.
- Realtime: order and table updates flow through hooks in `src/hooks/`.

## Dependencies

### Internal
- `src/app/components/admin/` — all panel and modal components
- `src/hooks/useOrders.ts`, `useRealtimeTables.ts` — live data
- `src/providers/AuthProvider.tsx` — role-based access

<!-- MANUAL: -->
