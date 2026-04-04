<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-04 | Updated: 2026-04-04 -->

# src/app/components/

## Purpose
Shared React components used across the application. Split into two distinct categories: `admin/` (domain-specific admin panels and modals) and `ui/` (read-only shadcn/ui primitives).

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `admin/` | Admin dashboard panels, modals, and feature components (see `admin/AGENTS.md`) |
| `ui/` | shadcn/ui primitives — READ-ONLY, do not modify (see `ui/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- `ui/` components are FROZEN — never edit them. Treat as an external library.
- `admin/` components are the active development area for admin features.
- New components that are not admin-specific (e.g., shared loading states) go here at this level.

## Key Files

| File | Description |
|------|-------------|
| `ProtectedRoute.tsx` | Auth guard wrapper — redirects to `/login` if no active session |

<!-- MANUAL: -->
