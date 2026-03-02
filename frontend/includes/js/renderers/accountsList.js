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
  const pageSize = 6;
  let currentPage = 1;
  const totalPages = Math.max(1, Math.ceil(accountsData.length / pageSize));

  if (accountsData.length === 0) {
    // Friendly empty state when there is no data.
    const emptyState = document.createElement("p");
    emptyState.className = "ft-text-muted";
    emptyState.textContent = "No accounts found.";
    container.appendChild(emptyState);
    return;
  }

  const controls = document.createElement("nav");
  controls.className = "ft-page-accounts__pagination";

  const prevButton = document.createElement("button");
  prevButton.type = "button";
  prevButton.className = "ft-page-accounts__page-btn";
  prevButton.textContent = "Previous";

  const pageInfo = document.createElement("span");
  pageInfo.className = "ft-page-accounts__page-info";

  const nextButton = document.createElement("button");
  nextButton.type = "button";
  nextButton.className = "ft-page-accounts__page-btn";
  nextButton.textContent = "Next";

  controls.appendChild(prevButton);
  controls.appendChild(pageInfo);
  controls.appendChild(nextButton);

  function renderPage() {
    clearChildren(container);

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const visibleAccounts = accountsData.slice(startIndex, endIndex);

    visibleAccounts.forEach((account) => {
      const card = createAccountSummaryCard(account);

      if (typeof onDetails === "function") {
        card.addEventListener("account:details", (event) => {
          onDetails(event.detail);
        });
      }

      container.appendChild(card);
    });

    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    prevButton.disabled = currentPage === 1;
    nextButton.disabled = currentPage === totalPages;

    if (totalPages > 1) {
      container.appendChild(controls);
    }

    if (window.lucide?.createIcons) {
      window.lucide.createIcons();
    }
  }

  prevButton.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage -= 1;
      renderPage();
    }
  });

  nextButton.addEventListener("click", () => {
    if (currentPage < totalPages) {
      currentPage += 1;
      renderPage();
    }
  });

  renderPage();
}
