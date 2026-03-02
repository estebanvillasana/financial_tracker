# Design Kit CSS

This set of CSS files mirrors the design tokens, components, and icon usage from kit.pen. It is now organized as a project-ready stylesheet architecture with one entrypoint and feature-based modules.

## Import order

```css
@import url("/static/css/styles.css");
```

The entrypoint imports files in this order:

```txt
css/
├── styles.css
├── base/
│   ├── tokens.css
│   └── typography.css
├── utilities/
│   └── icons.css
└── components/
  ├── buttons.css
  ├── cards.css
  ├── tags.css
  └── account-summary-card/
    ├── index.css
    ├── base.css
    └── variants.css
```

## Tokens

All core tokens live in tokens.css:

- Colors: accent, success, danger, warning, surface, border
- Typography: font family, base size
- Sizes: spacing, icon size
- Radii: widget, wrapper, card

Use the .ft-theme class on a wrapper to apply base font and background.

## Typography

- .ft-h1, .ft-h2, .ft-h3
- .ft-text, .ft-text-muted
- .ft-label, .ft-small

## Buttons

- .ft-btn + .ft-btn--primary
- .ft-btn + .ft-btn--secondary
- .ft-btn + .ft-btn--outline
- .ft-btn + .ft-btn--ghost
- .ft-btn + .ft-btn--danger

## Form controls

- .ft-input (base container)
- .ft-select
- .ft-amount + .ft-amount__prefix
- .ft-date-range
- .ft-filter-bar (compact dropdown group)

Example:

```html
<div class="ft-input ft-select">
  <span class="ft-input__text">Select category...</span>
  <span class="ft-icon ft-icon--md ft-icon--muted">chevron-down</span>
</div>
```

## Cards and panels

- .ft-panel (section panels)
- .ft-card (account summary)
- .ft-card--summary (main summary card)
- .ft-card__title, .ft-card__value, .ft-card__trend

## Stat cards

- .ft-stat (base)
- .ft-stat--tall
- .ft-stat__title, .ft-stat__value, .ft-stat__trend
- .ft-stat__progress + .ft-stat__progress-fill
- .ft-stat__badge (period badge)
- .ft-stat__legend (legend chips)

## Tags and labels

- .ft-tag
- .ft-tag--income / --expense / --neutral
- .ft-tag--sub + sub variants
- .ft-label + label variants

## Table

- .ft-table
- .ft-table__header, .ft-table__row, .ft-table__footer

## Icons (Lucide)

The kit uses Lucide icons. Use either Lucide SVGs or the icon font in your app.

If you use Lucide SVGs, apply .ft-icon and size/color utilities on the svg element.

Example:

```html
<i data-lucide="credit-card" class="ft-icon ft-icon--lg ft-icon--warning"></i>
```

Icon groups from the kit:

Bank account types
- landmark (checking)
- piggy-bank (savings)
- trending-up (investment)
- credit-card
- banknote (cash)
- wallet
- building-2 (business)

Income categories
- briefcase
- gift
- coins
- store
- star
- plus-circle

Expense categories
- shopping-cart
- utensils
- coffee
- car
- home
- heart-pulse
- graduation-cap
- plane
- music
- smartphone
- zap
- dumbbell
- tv-2

UI and actions
- plus
- search
- filter
- edit-2
- trash-2
- download
- upload
- bell
- settings
- eye
- chevron-down
- refresh-cw
- arrow-right
- sliders-horizontal
- calendar
- calendar-range
