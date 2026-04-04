<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-04 | Updated: 2026-04-04 -->

# src/app/

## Purpose
Next.js 15 App Router root. Contains all route segments (pages, layouts), shared UI components, and server actions. Route groups organize pages by authentication requirement and user type.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `(auth)/` | Auth-required routes — password change (see `(auth)/AGENTS.md`) |
| `(public)/` | Public routes — login, privacy, terms |
| `(customer)/` | Customer-facing routes — QR menu, waiting kiosk (see `(customer)/AGENTS.md`) |
| `admin/` | Admin dashboard — orders, menu, tables, analytics, KDS (see `admin/AGENTS.md`) |
| `superadmin/` | SuperAdmin panel — store and account management (see `superadmin/AGENTS.md`) |
| `components/` | Shared React components — admin panels, UI primitives (see `components/AGENTS.md`) |
| `actions/` | Next.js Server Actions — server-side mutations (see `actions/AGENTS.md`) |

## Key Files

| File | Description |
|------|-------------|
| `layout.tsx` | Root layout — HTML shell, font loading, providers |
| `page.tsx` | Marketing landing page (`/`) |
| `global-error.tsx` | Global error boundary with Sentry reporting |

## For AI Agents

### Working In This Directory
- Route groups `(auth)`, `(public)`, `(customer)` are organizational — they do NOT appear in URLs.
- Protected routes use `ProtectedRoute` component (redirects to `/login` if no session).
- SuperAdmin routes use `SuperAdminRoute` component (checks superadmin role).
- Server Actions in `actions/` handle mutations; never expose service role keys to client.

### Common Patterns
- Page files are thin — logic lives in `*Client.tsx` client components or hooks.
- Server components fetch initial data; client components handle interactivity.
- Error boundaries: `global-error.tsx` at root; individual pages handle their own errors.

### Route Map
| Path | File | Auth |
|------|------|------|
| `/` | `page.tsx` | None |
| `/login` | `(public)/login/page.tsx` | None |
| `/m/[storeSlug]/[tableId]` | `(customer)/m/[storeSlug]/[tableId]/page.tsx` | None |
| `/waiting/[storeSlug]` | `(customer)/waiting/[storeSlug]/page.tsx` | None |
| `/change-password` | `(auth)/change-password/page.tsx` | ProtectedRoute |
| `/admin` | `admin/page.tsx` | ProtectedRoute |
| `/admin/kds` | `admin/kds/page.tsx` | ProtectedRoute |
| `/superadmin` | `superadmin/page.tsx` | SuperAdminRoute |

<!-- MANUAL: -->
