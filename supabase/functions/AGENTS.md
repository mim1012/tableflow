<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-04 | Updated: 2026-04-04 -->

# supabase/functions/

## Purpose
Supabase Edge Functions (Deno runtime). These are the server-side API endpoints for operations requiring service role privileges: superadmin management, store/staff creation, and notifications. Called from the frontend via `supabase.functions.invoke()`.

## Key Files / Subdirectories

| Directory | Description |
|-----------|-------------|
| `_shared/cors.ts` | Shared CORS headers helper — import in every function |
| `check-superadmin/` | Verify caller has superadmin role; returns 403 if not |
| `create-staff/` | Create staff account with temporary password; sends credentials |
| `create-store-with-owner/` | Atomic creation of store + owner account in one transaction |
| `superadmin/` | Full CRUD for stores, members, and billing periods (superadmin only) |
| `send-alimtalk/` | Send KakaoTalk/SMS notifications via third-party API |

## For AI Agents

### Working In This Directory
- Each function has its own `deno.json` for imports — use Deno URL imports, NOT npm packages.
- Always import CORS headers: `import { corsHeaders } from '../_shared/cors.ts'`
- All functions must handle `OPTIONS` preflight requests:
  ```ts
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  ```
- Use `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` for privileged DB operations.
- Validate the JWT from the request before performing any privileged action.

### Testing Requirements
- Local testing: `supabase functions serve <function-name>`
- Integration test via `curl` or Playwright `getServiceRoleHeaders()` helper.
- No automated unit tests for Edge Functions currently.

### Common Patterns
- Auth guard pattern: call `check-superadmin` function or verify JWT claims before proceeding.
- Return consistent JSON: `{ success: true, data: ... }` or `{ success: false, error: '...' }`.
- Always set `Content-Type: application/json` in responses.

## Dependencies

### External
- Deno runtime (not Node.js)
- `@supabase/supabase-js` via Deno CDN import

<!-- MANUAL: -->
