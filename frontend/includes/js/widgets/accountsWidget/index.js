// index.js — Public entry point for the accounts widget.
//
// mountAccountsWidget() is the only export. It:
//   1. Builds the DOM skeleton via view.js (createWidgetView).
//   2. Populates filter dropdowns with unique values extracted from the
//      accounts array (filters.js → getUniqueValues, filterBar.fill).
//   3. Attaches event listeners for filter changes and pagination clicks.
//   4. Calls render() which applies filters (filters.js → applyFilters),
//      slices the result for the current page, then hands the slice to
//      view.js (renderWidget) to update the DOM.
//
// Options:
//   container      HTMLElement — where the widget is mounted.
//   accounts       Array      — full account list (typically from the API).
//   pageSize       number     — cards per page (default 6).
//   showFilters    boolean    — include the filter bar (default true).
//   showPagination boolean    — include prev/next controls (default true).
//   onDetails      Function   — called with { accountId, account } on card click.

import { applyFilters, getUniqueValues } from "./filters.js";
import { createAccountsWidgetState } from "./state.js";
import { createWidgetView, renderWidget } from "./view.js";

export function mountAccountsWidget({
  container,
  accounts = [],
  pageSize = 6,
  showFilters = true,
  showPagination = true,
  onDetails,
}) {
  if (!(container instanceof HTMLElement)) {
    throw new Error("mountAccountsWidget requires a valid container element.");
  }

  const state = createAccountsWidgetState({ pageSize });
  const elements = createWidgetView(container, { showFilters, showPagination });

  if (showFilters) {
    elements.filterBar.fill("holder", getUniqueValues(accounts, "holderName"), "All holders");
    elements.filterBar.fill("currency", getUniqueValues(accounts, "currency"), "All currencies");
    elements.filterBar.fill("type", getUniqueValues(accounts, "typeLabel"), "All types");
  }

  function render() {
    const filteredAccounts = showFilters ? applyFilters(accounts, state) : accounts;
    const totalPages = Math.max(1, Math.ceil(filteredAccounts.length / pageSize));
    state.page = Math.min(state.page, totalPages);

    const visibleAccounts = showPagination
      ? filteredAccounts.slice((state.page - 1) * pageSize, state.page * pageSize)
      : filteredAccounts;

    renderWidget({
      elements,
      accounts: visibleAccounts,
      state,
      totalPages,
      onDetails,
      showPagination,
    });
  }

  if (showFilters) {
    elements.filterBar.onChange((values) => {
      state.holder = values.holder;
      state.currency = values.currency;
      state.type = values.type;
      state.page = 1;
      render();
    });
  }

  if (showPagination) {
    elements.prevButton.addEventListener("click", () => {
      if (state.page > 1) {
        state.page -= 1;
        render();
      }
    });

    elements.nextButton.addEventListener("click", () => {
      const filteredAccounts = showFilters ? applyFilters(accounts, state) : accounts;
      const totalPages = Math.max(1, Math.ceil(filteredAccounts.length / pageSize));

      if (state.page < totalPages) {
        state.page += 1;
        render();
      }
    });
  }

  render();
}
