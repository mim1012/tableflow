<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-04 | Updated: 2026-04-04 -->

# src/app/components/ui/

## Purpose
shadcn/ui component library — 48 pre-built, accessible UI primitives. These files are READ-ONLY. They are treated as an external dependency installed into the project. Never modify any file in this directory.

## READ-ONLY — DO NOT MODIFY

These components are owned by the shadcn/ui project. Any modifications will be overwritten on the next `shadcn` update and will break the component upgrade path.

If a component needs customization, wrap it in a new component in `src/app/components/` and extend from there.

## Available Components

| Category | Files |
|----------|-------|
| Inputs | `input.tsx`, `checkbox.tsx`, `radio-group.tsx`, `toggle.tsx`, `toggle-group.tsx`, `switch.tsx`, `textarea.tsx` |
| Dropdowns | `select.tsx`, `command.tsx`, `dropdown-menu.tsx`, `context-menu.tsx`, `menubar.tsx` |
| Dialogs | `dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx`, `drawer.tsx` |
| Navigation | `navigation-menu.tsx`, `breadcrumb.tsx`, `pagination.tsx`, `sidebar.tsx` |
| Data Display | `table.tsx`, `chart.tsx`, `carousel.tsx`, `accordion.tsx`, `collapsible.tsx`, `badge.tsx` |
| Layout | `card.tsx`, `separator.tsx`, `resizable.tsx`, `scroll-area.tsx`, `aspect-ratio.tsx` |
| Feedback | `alert.tsx`, `progress.tsx`, `skeleton.tsx`, `sonner.tsx` |
| Forms | `form.tsx`, `label.tsx` |
| Overlays | `popover.tsx`, `hover-card.tsx`, `tooltip.tsx` |
| Misc | `avatar.tsx`, `calendar.tsx`, `input-otp.tsx`, `use-mobile.ts`, `utils.ts` |

## For AI Agents

### Working In This Directory
- **STOP. Do not edit any file here.**
- To use a component: `import { Button } from '@/app/components/ui/button'`
- To extend: create a wrapper in `src/app/components/` that composes these primitives.
- `utils.ts` here exports `cn()` (clsx + tailwind-merge) — import it for conditional classNames.

<!-- MANUAL: -->
