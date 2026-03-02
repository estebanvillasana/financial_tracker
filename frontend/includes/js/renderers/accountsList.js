import { clearChildren } from "../core/dom.js";
import { createAccountSummaryCard } from "../components/accountSummaryCard.js";

export function renderAccountsList({ container, accounts, onDetails }) {
  // Defensive validation: renderer needs a real DOM target.
  if (!(container instanceof HTMLElement)) {
    throw new Error("renderAccountsList requires a valid container element.");
  }

  // Always render from a clean state.
  clearChildren(container);
  container.classList.add("ft-page-accounts__list");

  // Accept only arrays so renderer does not crash with null/undefined data.
  const accountsData = Array.isArray(accounts) ? accounts : [];

  if (accountsData.length === 0) {
    // Friendly empty state when there is no data.
    const emptyState = document.createElement("p");
    emptyState.className = "ft-text-muted";
    emptyState.textContent = "No accounts found.";
    container.appendChild(emptyState);
    return;
  }

  // Create one card per account and append to container.
  accountsData.forEach((account) => {
    const card = createAccountSummaryCard(account);

    if (typeof onDetails === "function") {
      // Listen to card-level custom event and forward detail to page callback.
      card.addEventListener("account:details", (event) => {
        onDetails(event.detail);
      });
    }

    container.appendChild(card);
  });
}
