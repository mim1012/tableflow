<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-04 | Updated: 2026-04-04 -->

# .claude/

## Purpose
Project-local Claude Code configuration. Defines specialized AI agents for this codebase, custom skills for common workflows, the Hive orchestration config, and pre-commit hooks.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `agents/` | Specialized agent definitions for TableFlow domains (see `agents/AGENTS.md`) |
| `skills/` | Custom slash-command skills for project workflows (see `skills/AGENTS.md`) |

## Key Files

| File | Description |
|------|-------------|
| `hive-config.json` | Hive orchestration settings — file ownership map, lead agent assignments, build/test/lint commands |
| `hooks/biome-check.mjs` | PostToolUse hook — runs Biome formatter check after file edits |
| `settings.local.json` | Local Claude Code settings overrides (gitignored) |

## For AI Agents

### Working In This Directory
- `hive-config.json` defines which agent owns which files — consult before creating teams.
- Hooks run automatically — if Biome check fails after an edit, fix the formatting.
- Agent definitions in `agents/` extend the global agent catalog with TableFlow-specific context.

<!-- MANUAL: -->
