// view.js — DOM construction and rendering for the accounts widget.
//
// Responsibilities:
//   createWidgetView  — Builds the full widget skeleton (filter bar, card list,
//                       pagination) and mounts it into the host container.
//                       Returns refs to every interactive element so index.js
//                       can wire events without touching the DOM directly.
//   renderCards       — Clears the list section and stamps one account card
//                       per account in the given slice. Handles the empty state.
//   renderWidget      — Called on every render pass: updates the card list and
//                       syncs pagination controls to the current state.
//
// This file owns the DOM; it never touches filtering logic or state mutations.

import { createNode, clearChildren } from "../../core/dom.js";
import { createAccountSummaryCard } from "../../components/accountSummaryCard.js";
import { createFilterBar } from "../../components/filterBar.js";

// Builds and mounts the widget skeleton. Returns element refs for index.js.
// `showFilters` and `showPagination` let callers opt out of either section
// (e.g. a compact dashboard panel that just shows 3 cards).
export function createWidgetView(container, { showFilters = true, showPagination = true } = {}) {
  const root = createNode("div", "ft-accounts-widget");

  let filterBar = null;

  if (showFilters) {
    filterBar = createFilterBar([
      { label: "Holder", key: "holder" },
      { label: "Currency", key: "currency" },
      { label: "Type", key: "type" },
    ]);
    root.appendChild(filterBar.element);
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
    filterBar,
  };
}

// Renders a flat list of account cards into `container`.
// Only receives the already-filtered, already-paginated slice — no data logic here.
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

// Full render pass: updates the card list then syncs pagination UI to state.
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
