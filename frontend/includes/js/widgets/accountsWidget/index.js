import { applyFilters, fillSelect, getUniqueValues } from "./filters.js";
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
    fillSelect(
      elements.holderSelect,
      getUniqueValues(accounts, "holderName"),
      "holders",
    );
    fillSelect(
      elements.currencySelect,
      getUniqueValues(accounts, "currency"),
      "currencies",
    );
    fillSelect(elements.typeSelect, getUniqueValues(accounts, "typeLabel"), "types");
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
    function handleFilterChange() {
      state.holder = elements.holderSelect.value;
      state.currency = elements.currencySelect.value;
      state.type = elements.typeSelect.value;
      state.page = 1;
      render();
    }

    [elements.holderSelect, elements.currencySelect, elements.typeSelect].forEach(
      (select) => {
        select.addEventListener("change", handleFilterChange);
      },
    );
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
