import { createNode, clearChildren } from "../../core/dom.js";
import { createAccountSummaryCard } from "../../components/accountSummaryCard.js";

function createFilter({ label, dataFilter }) {
  const wrapper = createNode("label", "ft-accounts-widget__filter");
  const labelNode = createNode("span", "ft-accounts-widget__filter-label", label);
  const select = createNode("select", "ft-accounts-widget__filter-select");
  select.dataset.filter = dataFilter;

  wrapper.appendChild(labelNode);
  wrapper.appendChild(select);

  return { wrapper, select };
}

export function createWidgetView(container, { showFilters = true, showPagination = true } = {}) {
  const root = createNode("div", "ft-accounts-widget");

  let holderSelect = null;
  let currencySelect = null;
  let typeSelect = null;

  if (showFilters) {
    const toolbar = createNode("div", "ft-accounts-widget__toolbar");
    const holderFilter = createFilter({ label: "Holder", dataFilter: "holder" });
    const currencyFilter = createFilter({ label: "Currency", dataFilter: "currency" });
    const typeFilter = createFilter({ label: "Type", dataFilter: "type" });
    const divider1 = createNode("span", "ft-accounts-widget__filter-divider");
    const divider2 = createNode("span", "ft-accounts-widget__filter-divider");

    toolbar.appendChild(holderFilter.wrapper);
    toolbar.appendChild(divider1);
    toolbar.appendChild(currencyFilter.wrapper);
    toolbar.appendChild(divider2);
    toolbar.appendChild(typeFilter.wrapper);
    root.appendChild(toolbar);

    holderSelect = holderFilter.select;
    currencySelect = currencyFilter.select;
    typeSelect = typeFilter.select;
  }

  const list = createNode("section", "ft-accounts-widget__list");
  root.appendChild(list);

  let prevButton = null;
  let pageInfo = null;
  let nextButton = null;
  let pagination = null;

  if (showPagination) {
    pagination = createNode("nav", "ft-accounts-widget__pagination");
    prevButton = createNode("button", "ft-accounts-widget__page-btn", "Previous");
    prevButton.type = "button";
    pageInfo = createNode("span", "ft-accounts-widget__page-info");
    nextButton = createNode("button", "ft-accounts-widget__page-btn", "Next");
    nextButton.type = "button";

    pagination.appendChild(prevButton);
    pagination.appendChild(pageInfo);
    pagination.appendChild(nextButton);
    root.appendChild(pagination);
  }

  clearChildren(container);
  container.appendChild(root);

  return {
    root,
    list,
    pagination,
    prevButton,
    pageInfo,
    nextButton,
    holderSelect,
    currencySelect,
    typeSelect,
  };
}

export function renderCards({ container, accounts, onDetails }) {
  clearChildren(container);

  const accountsData = Array.isArray(accounts) ? accounts : [];

  if (accountsData.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "ft-text-muted";
    emptyState.textContent = "No accounts found.";
    container.appendChild(emptyState);
    return;
  }

  accountsData.forEach((account) => {
    const card = createAccountSummaryCard(account);

    if (typeof onDetails === "function") {
      card.addEventListener("account:details", (event) => {
        onDetails(event.detail);
      });
    }

    container.appendChild(card);
  });
}

export function renderWidget({ elements, accounts, state, totalPages, onDetails, showPagination }) {
  renderCards({ container: elements.list, accounts, onDetails });

  if (showPagination && elements.pagination) {
    elements.pageInfo.textContent = `Page ${state.page} of ${totalPages}`;
    elements.prevButton.disabled = state.page === 1;
    elements.nextButton.disabled = state.page === totalPages;
    elements.pagination.hidden = totalPages <= 1;
  }

  if (window.lucide?.createIcons) {
    window.lucide.createIcons();
  }
}
