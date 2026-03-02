# CSS Architecture

This folder is organized in layers and imported through `styles.css`.

## Layers

- `base/`: tokens, reset, typography
- `utilities/`: cross-cutting utility classes (icons, helpers)
- `components/`: reusable UI blocks from the design kit
- `pages/`: page-level layout/composition styles only

## Rules

1. Import only `includes/css/styles.css` in HTML.
2. Keep one file per component by default (for example `components/account-summary-card.css`).
3. Split one component into multiple files only when it becomes large (around 250+ lines) or has truly separate concerns.
4. Keep `pages/*.css` focused on layout and composition; do not duplicate component internals there.
5. Use only existing design tokens from `base/tokens.css`.

## Current entrypoint order

1. `base/tokens.css`
2. `base/reset.css`
3. `base/typography.css`
4. `utilities/icons.css`
5. `components/*.css`
6. `pages/*.css`
