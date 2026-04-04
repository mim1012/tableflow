<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-04 | Updated: 2026-04-04 -->

# src/test/

## Purpose
Vitest test infrastructure — global setup configuration and shared mock utilities used across all unit tests.

## Key Files

| File | Description |
|------|-------------|
| `setup.ts` | Vitest global setup — configures jsdom environment, imports `@testing-library/jest-dom` matchers |
| `mocks/supabase.ts` | Mock Supabase client — provides `vi.mock()` factory for `src/lib/supabase/client.ts` |

## For AI Agents

### Working In This Directory
- Import the mock in test files with:
  ```ts
  vi.mock('@/lib/supabase/client', () => import('@/test/mocks/supabase'))
  ```
- `setup.ts` runs before every test file — do NOT add test logic here, only global configuration.
- When adding new Supabase methods to queries, extend `mocks/supabase.ts` to cover them.

### Testing Requirements
- Configuration is in `vitest.config.ts` (project root).
- Test environment: jsdom (browser-like DOM).
- `@testing-library/react` for component tests; `@testing-library/jest-dom` for DOM matchers.

<!-- MANUAL: -->
