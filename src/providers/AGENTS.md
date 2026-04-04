<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-04 | Updated: 2026-04-04 -->

# src/providers/

## Purpose
React context providers that wrap the application tree and expose shared state. Currently provides authentication context and toast notifications.

## Key Files

| File | Description |
|------|-------------|
| `AuthProvider.tsx` | Auth context — wraps app with Supabase session listener; exposes `useAuthContext()` hook returning `StoreUser` |
| `ToastProvider.tsx` | Toast notification provider using Sonner; configures position, duration, and theme |

## For AI Agents

### Working In This Directory
- `useAuthContext()` returns `StoreUser | null` — always handle the null case in components.
- `StoreUser` shape: `{ id, email, role, storeId, storeName }` — defined in `src/types/auth.ts`.
- `AuthProvider` listens to `supabase.auth.onAuthStateChange()` — session changes propagate automatically.
- Both providers are mounted in `src/app/layout.tsx` (root layout).

### Common Patterns
- Access auth: `const { user } = useAuthContext()` — never access `supabase.auth` directly in components.
- Role check: `user.role === 'owner'` (values: `'owner'`, `'manager'`, `'staff'`).

## Dependencies

### Internal
- `src/lib/supabase/client.ts` — browser Supabase client
- `src/types/auth.ts` — StoreUser type

### External
- `sonner` — toast UI library

<!-- MANUAL: -->
