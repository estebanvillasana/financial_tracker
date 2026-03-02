# JS UI Structure

Use small, composable ES modules for dynamic UI generation.

## Folder layout

- `core/`: generic helpers (`dom`, `formatters`)
- `components/`: single UI block factories (return DOM nodes)
- `renderers/`: render lists/sections using components
- `services/`: API calls
- `app.js`: page entrypoint wiring

## Pattern

1. `service` gets data from backend.
2. `renderer` loops over records and mounts component instances.
3. `component` returns one reusable DOM node.
4. Events bubble from component to renderer/page (`account:details`, etc.).

## Accounts example

In your HTML/template, add:

```html
<section class="ft-page-accounts">
  <div data-component="accounts-list"></div>
</section>
<script type="module" src="/includes/js/app.js"></script>
```

This keeps card generation fully dynamic and reusable for any future entity list.
