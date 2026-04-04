<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-04 | Updated: 2026-04-04 -->

# src/app/actions/

## Purpose
Next.js Server Actions — server-side async functions called directly from client components. Use `'use server'` directive. Handles mutations that require server privileges or should not expose logic to the browser.

## Key Files

| File | Description |
|------|-------------|
| `admin.ts` | Admin server actions — order management, table operations, analytics queries |
| `order.ts` | Order creation server action — calls `order_atomic` RPC with server-side validation |
| `staff.ts` | Staff management — create/update/delete staff accounts via Edge Function |
| `superadmin.ts` | SuperAdmin actions — store lifecycle, account management, billing periods |
| `waiting.ts` | Waiting queue actions — insert waiting customer, update queue status |

## For AI Agents

### Working In This Directory
- Every file must start with `'use server'` directive.
- Use the server-side Supabase client from `src/lib/supabase/server.ts` — NOT the browser client.
- Never import or use `SUPABASE_SERVICE_ROLE_KEY` in actions exposed to regular users.
- Server actions are the boundary between client and server — validate all inputs with Zod.
- Return shape: `{ success: boolean, data?: T, error?: string }`.

### Common Patterns
```ts
'use server'
import { createServerClient } from '@/lib/supabase/server'

export async function myAction(input: InputType) {
  const supabase = createServerClient()
  const { data, error } = await supabase.from('...').insert(...)
  if (error) return { success: false, error: error.message }
  return { success: true, data }
}
```

## Dependencies

### Internal
- `src/lib/supabase/server.ts` — server-side Supabase client
- `src/lib/api/` — shared API functions (some actions delegate here)
- `src/types/database.ts` — typed return values

<!-- MANUAL: -->
