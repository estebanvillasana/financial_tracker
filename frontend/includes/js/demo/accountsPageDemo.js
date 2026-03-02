import { renderAccountsList } from "../renderers/accountsList.js";
import { renderSidebar } from "../components/sidebar.js";

// Fake records that simulate what your backend would return from /api/accounts.
// Later, you can replace this with real API data and keep the same renderer.
const fakeAccounts = [
  {
    id: 1,
    name: "Main Checking",
    type: "checking",
    typeLabel: "Checking",
    description: "Daily spending account",
    maskedAccount: "**** 3489",
    updatedLabel: "Updated 2h ago",
    holderName: "Alex Doe",
    balance: 3240.15,
    secondaryBalance: 2982.41,
    secondaryCurrency: "EUR",
    currency: "USD",
    updatedAt: "2026-03-02",
  },
  {
    id: 2,
    name: "Rainy Day Savings",
    type: "savings",
    typeLabel: "Savings",
    description: "Emergency fund",
    maskedAccount: "**** 9044",
    updatedLabel: "Updated 45m ago",
    holderName: "Alex Doe",
    balance: 10850.0,
    secondaryBalance: 10850.0,
    secondaryCurrency: "USD",
    currency: "USD",
    updatedAt: "2026-03-01",
  },
  {
    id: 3,
    name: "Credit Card",
    type: "credit",
    typeLabel: "Credit",
    description: "Monthly expenses",
    maskedAccount: "**** 7812",
    updatedLabel: "Updated 1d ago",
    holderName: "Alex Doe",
    balance: -620.44,
    availableBalance: 2379.56,
    currency: "USD",
    updatedAt: "2026-02-28",
  },
];

function mountDemo() {
  // Render sidebar menu so it is shared across pages.
  const sidebarMount = document.querySelector("[data-component='sidebar']");

  if (sidebarMount) {
    const activePath = sidebarMount.dataset.activePath || undefined;
    renderSidebar({ container: sidebarMount, activePath });
  }

  // 1) Find the place in HTML where cards should be inserted.
  const container = document.querySelector("[data-component='accounts-list']");

  if (!container) {
    // If the target container does not exist, exit safely.
    return;
  }

  // 2) Render one account card per account object.
  // The renderer handles looping and calls your component factory for each item.
  renderAccountsList({
    container,
    accounts: fakeAccounts,
    onDetails: ({ accountId, account }) => {
      // 3) This callback receives events emitted by each card button.
      // In a real app, you might navigate to /accounts/:id.
      alert(`Open details for #${accountId} (${account.name})`);
    },
  });

  // 4) Ask Lucide to replace <i data-lucide="..."></i> with SVG icons.
  if (window.lucide?.createIcons) {
    window.lucide.createIcons();
  }
}

// Start the demo.
mountDemo();
