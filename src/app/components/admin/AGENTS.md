<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-04 | Updated: 2026-04-04 -->

# src/app/components/admin/

## Purpose
All React components for the admin dashboard. Split into panels (full-section views shown in the dashboard) and modals (dialogs for create/edit operations). Also contains type definitions and shared admin utilities.

## Key Files — Panels

| File | Description |
|------|-------------|
| `DashboardSummary.tsx` | KPI cards — today's revenue, order count, customer ratings |
| `MenuPanel.tsx` | Menu management — browse categories and items, trigger edit/delete |
| `CategoryManagePanel.tsx` | Category CRUD — add, rename, reorder, delete menu categories |
| `TablesPanel.tsx` | Table management — add/remove tables, generate and display QR codes |
| `CustomersPanel.tsx` | Customer list — search, view order history, manage points |
| `KDSPanel.tsx` | Kitchen Display System panel — order queue for kitchen staff |
| `WaitingPanel.tsx` | Waiting queue view — manage walk-in queue, call next party |
| `AnalyticsPanel.tsx` | Sales analytics — revenue charts, peak hours, top items |
| `EventPanel.tsx` | Order event log — chronological list of all order status changes |
| `SettingsPanel.tsx` | Store settings — store info, password change, subscription status |
| `QRPanel.tsx` | QR code generator — print-ready QR codes per table |

## Key Files — Modals

| File | Description |
|------|-------------|
| `AddOrderModal.tsx` | Manual order entry — staff creates order on behalf of customer |
| `MenuEditModal.tsx` | Menu item CRUD modal — name, price, options, image, availability |
| `CustomerEditModal.tsx` | Customer detail editor — name, phone, points adjustment |
| `TableDetailModal.tsx` | Table info modal — current occupancy, order history |
| `PointPolicyModal.tsx` | Loyalty point policy settings |

## Key Files — Other

| File | Description |
|------|-------------|
| `StaffManagement.tsx` | Staff account list — invite staff, set roles, deactivate |
| `NotificationDeniedBanner.tsx` | Banner prompting owner to enable browser notifications |
| `types.ts` | TypeScript types shared across admin components |

## For AI Agents

### Working In This Directory
- Panel components receive data via props from `AdminDashboardClient.tsx` — they do not fetch independently.
- Modals use the `Dialog` primitive from `../ui/dialog.tsx` — never create custom modal markup.
- Role-based rendering: check `user.role` before showing owner-only actions (delete, billing).
- `types.ts` is the source of truth for panel prop types — update it when adding new props.
- KDS components (`KDSPanel.tsx`) have Realtime subscriptions — follow the cleanup pattern.

### Testing Requirements
- Component tests use `@testing-library/react` with the Supabase mock.
- Run: `npm run test:unit`

### Common Patterns
- Panel layout: full-width section inside the dashboard scroll area.
- Data mutations: call server actions from `src/app/actions/admin.ts`, then refresh via hook.
- Optimistic UI: update local state immediately, revert on error with toast notification.

## Dependencies

### Internal
- `src/app/components/ui/` — shadcn/ui primitives (Dialog, Button, Table, etc.)
- `src/hooks/` — data hooks (useOrders, useMenu, etc.)
- `src/providers/AuthProvider.tsx` — role checks
- `src/app/actions/admin.ts` — mutations

### External
- `lucide-react` — icons
- `recharts` — charts in AnalyticsPanel

<!-- MANUAL: -->
