<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-04 | Updated: 2026-04-04 -->

# docs/

## Purpose
Project documentation including the product requirements document, database schema specification, architectural decisions, testing strategy, and test coverage artifacts.

## Key Files

| File | Description |
|------|-------------|
| `PRD.md` | Product Requirements Document — features, user stories, scope |
| `SCHEMA.md` | Database schema documentation (human-readable, authoritative reference) |
| `schema.sql` | Raw SQL schema — CREATE TABLE statements, indexes, constraints |
| `DECISIONS.md` | Architectural Decision Records (ADR) — why key choices were made |
| `CHECKLIST.md` | Implementation checklist tracking feature completion |
| `TESTING.md` | Testing strategy — unit vs E2E breakdown, coverage targets |
| `testplan.md` | 38-scenario test plan with P0/P1/P2 priority classification |
| `E2E-COVERAGE-MATRIX.md` | Mapping of E2E test suites to requirement scenarios |
| `E2E-COVERAGE-GAPS.md` | Identified gaps in E2E coverage |
| `E2E-PRECISION-AUDIT.md` | Audit verifying test assertions match actual behavior |
| `E2E-TEST-REPORT.md` | Latest E2E test execution report |
| `EDGE-CASES.md` | Edge case specifications for ordering, queue, auth flows |
| `TEST-RESULTS.md` | Snapshot of latest test results |
| `USECASE-DIAGRAM.md` | User flow diagrams for all three interfaces |
| `WORKTREE_PLAN.md` | Multi-worktree coordination plan for parallel development |

## For AI Agents

### Working In This Directory
- `SCHEMA.md` is the canonical reference for DB schema — sync `src/types/database.ts` to match.
- `schema.sql` is the raw SQL — use it when writing migrations.
- `DECISIONS.md` must be updated when making architectural changes.
- Do NOT auto-generate test reports here — they are manually curated.

### Common Patterns
- When adding a new feature: update `PRD.md` (scope), `SCHEMA.md` (if DB changes), `DECISIONS.md` (if architectural).
- When writing migrations: cross-reference `schema.sql` and `SCHEMA.md`.

<!-- MANUAL: -->
