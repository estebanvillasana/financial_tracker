import { renderAccountsList } from "../renderers/accountsList.js";

// Fake records that simulate what your backend would return from /api/accounts.
// Later, you can replace this with real API data and keep the same renderer.
const fakeAccounts = [
  {
    id: 1,
    name: "Main Checking",
    type: "checking",
    typeLabel: "Checking",
    description: "Daily spending account",
    institution: "Bank of Tomorrow",
    holderName: "Alex Doe",
    balance: 3240.15,
    availableBalance: 3120.15,
    currency: "USD",
    updatedAt: "2026-03-02",
  },
  {
    id: 2,
    name: "Rainy Day Savings",
    type: "savings",
    typeLabel: "Savings",
    description: "Emergency fund",
    institution: "Bank of Tomorrow",
    holderName: "Alex Doe",
    balance: 10850.0,
    availableBalance: 10850.0,
    currency: "USD",
    updatedAt: "2026-03-01",
  },
  {
    id: 3,
    name: "Credit Card",
    type: "credit",
    typeLabel: "Credit",
    description: "Monthly expenses",
    institution: "Blue Credit",
    holderName: "Alex Doe",
    balance: -620.44,
    availableBalance: 2379.56,
    currency: "USD",
    updatedAt: "2026-02-28",
  },
];

function mountDemo() {
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
