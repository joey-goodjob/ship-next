# LyricEdits Theme Extraction

Target: https://lyricedits.ai/

Scope: color system only. The user asked to clone the site's palette into this project, including light and dark modes, while keeping code low-coupling and avoiding scattered hardcoded colors.

## Evidence

- Desktop light screenshot: `docs/design-references/lyricedits.ai/desktop-full.png`
- Mobile light screenshot: `docs/design-references/lyricedits.ai/mobile-full.png`
- Desktop dark screenshot: `docs/design-references/lyricedits.ai/desktop-dark-full.png`
- Light computed styles: `docs/research/lyricedits.ai/theme-extraction-desktop.json`
- Mobile computed styles: `docs/research/lyricedits.ai/theme-extraction-mobile.json`
- Dark computed styles: `docs/research/lyricedits.ai/theme-extraction-dark.json`

## Extracted Palette

Light mode signals:

- Page and panels: white / near-white
- Soft section background: `rgb(244, 244, 245)`
- Strong text: `rgb(15, 23, 42)` and `rgb(2, 6, 23)`
- Muted text: `rgb(100, 116, 139)` and `rgb(71, 85, 105)`
- Borders: `rgb(226, 232, 240)` and `rgb(229, 231, 235)`
- Primary accent: `rgb(251, 191, 36)`

Dark mode signals after clicking "Toggle dark mode":

- Page background: `rgb(9, 9, 11)`
- Panel background: `rgb(24, 24, 27)`
- Soft panel background: `rgb(39, 39, 42)`
- Strong text: `rgb(255, 255, 255)`
- Muted text: `rgb(161, 161, 170)` and `rgb(212, 212, 216)`
- Borders: `rgb(63, 63, 70)`
- Primary accent remains `rgb(251, 191, 36)`

## Implementation Contract

Colors are centralized in `src/app/globals.css` as `--brand-*` variables and exposed to Tailwind as semantic classes:

- `bg-brand-page`
- `bg-brand-panel`
- `bg-brand-panel-strong`
- `bg-brand-soft`
- `text-brand-ink`
- `text-brand-muted`
- `text-brand-subtle`
- `border-brand-line`
- `bg-brand-accent`
- `hover:bg-brand-accent-hover`
- `bg-brand-accent-soft`
- `text-brand-accent`
- `text-brand-accent-ink`

Decorative gradients and theme-colored shadows are also centralized as CSS variables and utilities:

- `bg-brand-preview-gradient`
- `bg-brand-tile-gradient`
- `bg-brand-stage-gradient`
- `bg-brand-cta-gradient`
- `bg-brand-hero-dots-left`
- `bg-brand-hero-dots-right`
- `--brand-elevation-shadow`
- `--brand-accent-shadow`

Rule for future edits: product and marketing surfaces should use these semantic classes instead of writing raw hex colors, `teal-*`, `cyan-*`, `bg-white`, or `text-slate-*` directly.
