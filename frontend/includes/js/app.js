import { renderAccountsList } from "./renderers/accountsList.js";
import { fetchAccounts } from "./services/accountsService.js";

async function mountAccountsPage() {
  // This is the production entrypoint (real API), not fake demo data.
  const container = document.querySelector("[data-component='accounts-list']");

  if (!container) {
    return;
  }

  try {
    // 1) Get data from backend.
    const accounts = await fetchAccounts();

    // 2) Render UI from data.
    renderAccountsList({
      container,
      accounts,
      onDetails: ({ accountId }) => {
        // 3) Page-level behavior for a card action.
        window.location.href = `/accounts/${accountId}`;
      },
    });
  } catch (error) {
    // Simple fallback state if API fails.
    container.textContent = "Unable to load accounts right now.";
    console.error(error);
  }
}

// Start when module loads.
mountAccountsPage();
