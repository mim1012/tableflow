<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-04 | Updated: 2026-04-04 -->

# .claude/skills/

## Purpose
Custom slash-command skills for TableFlow-specific workflows. Each skill is a SKILL.md file that Claude Code loads when the corresponding slash command is invoked.

## Key Files

| File | Description |
|------|-------------|
| `deploy/SKILL.md` | `/deploy` — deploy to Vercel staging or production |
| `e2e/SKILL.md` | `/e2e` — run E2E test suite with reporting |
| `migrate/SKILL.md` | `/migrate` — create and apply a new DB migration |
| `new-api/SKILL.md` | `/new-api` — scaffold a new API function in `src/lib/api/` |
| `verify/SKILL.md` | `/verify` — run full verification (build + tests + lint) |
| `tableflow-patterns.md` | Reference: TableFlow-specific coding patterns and conventions |

## For AI Agents

### Working In This Directory
- Invoke skills via their slash command, not by reading these files directly.
- `tableflow-patterns.md` is a reference document — read it when implementing new features.

<!-- MANUAL: -->
