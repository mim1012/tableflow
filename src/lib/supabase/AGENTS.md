<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-04 | Updated: 2026-04-04 -->

# src/lib/supabase/

## Purpose
Supabase client initialization. Provides separate factory functions for browser (client-side) and server (SSR/server actions) contexts — required by `@supabase/ssr` for cookie-based auth in Next.js.

## Key Files

| File | Description |
|------|-------------|
| `client.ts` | `createBrowserClient()` — browser-safe Supabase client using `createClientComponentClient` |
| `server.ts` | `createServerClient()` — server-side client using `createServerComponentClient` with cookie access |
| `supabase.ts` | Legacy singleton client (may coexist during migration) — prefer `client.ts`/`server.ts` |

## For AI Agents

### Working In This Directory
- Use `client.ts` in: React hooks, client components (`'use client'`).
- Use `server.ts` in: Server Actions (`'use server'`), server components, `middleware.ts`.
- NEVER use the browser client in server context — it won't have access to the auth cookie.
- NEVER use the server client in browser context — it requires Next.js cookie APIs.
- `env.ts` (parent directory) validates env vars; these files assume vars are present.

### Common Patterns
```ts
// Client component / hook
import { createBrowserClient } from '@/lib/supabase/client'
const supabase = createBrowserClient()

// Server action / server component
import { createServerClient } from '@/lib/supabase/server'
const supabase = createServerClient()
```

## Dependencies

### External
- `@supabase/ssr` — SSR-aware Supabase client
- `next/headers` — cookie access (server client only)

<!-- MANUAL: -->
