<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-04 | Updated: 2026-04-04 -->

# .claude/agents/

## Purpose
Project-local specialized agent definitions that extend the global Claude Code agent catalog with TableFlow-specific context, file ownership rules, and domain expertise.

## Key Files

| File | Description |
|------|-------------|
| `e2e-lead.md` | E2E testing lead — owns `e2e/*.spec.ts`, coordinates Playwright test writing |
| `frontend-lead.md` | Frontend lead — owns `src/app/` components and pages |
| `security-lead.md` | Security audit lead — reviews RLS policies, auth flows, input validation |
| `supabase-lead.md` | Supabase/backend lead — owns migrations, Edge Functions, schema changes |

## For AI Agents

### Working In This Directory
- These agent definitions are loaded by the Hive orchestration system.
- Each definition includes: purpose, file ownership, acceptance criteria, and report format.
- Consult `hive-config.json` (parent directory) to see how these agents are assigned.

<!-- MANUAL: -->
