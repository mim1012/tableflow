<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-04 | Updated: 2026-04-04 -->

# src/styles/

## Purpose
Global CSS — design tokens (CSS custom properties), resets, Tailwind directives, and font imports. All color and spacing values for the application are defined here as CSS variables.

## Key Files

| File | Description |
|------|-------------|
| `theme.css` | CSS custom property tokens — all colors, spacing, shadows, radii. SINGLE SOURCE OF TRUTH. |
| `globals.css` | Global resets and base styles |
| `tailwind.css` | Tailwind CSS v4 directives (`@import "tailwindcss"`) |
| `fonts.css` | Font-face declarations and font variable definitions |
| `index.css` | Entry point that imports all other style files |

## For AI Agents

### Working In This Directory
- NEVER hardcode color values (hex, rgb) or spacing values (px, rem) in component files.
- ALWAYS use CSS variables from `theme.css`: `var(--color-primary)`, `var(--spacing-md)`, etc.
- Primary accent color is orange: `text-orange-500` / `#f97316` / `var(--color-primary)`.
- Dark mode is supported via CSS custom property overrides — check `theme.css` for dark variants.
- Tailwind v4 is configured via the `@tailwindcss/vite` plugin — no `tailwind.config.js` file.

### Common Patterns
- Add new tokens to `theme.css` before using in components.
- Font tokens are referenced in `globals.css` — use `font-family: var(--font-sans)`.

<!-- MANUAL: -->
