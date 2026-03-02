import { renderAccountsList } from "../renderers/accountsList.js";
import { renderSidebar } from "../components/sidebar.js";

const MAIN_CURRENCY = "USD";

const currencyRatesToUsd = {
  USD: 1,
  EUR: 1.18,
  GBP: 1.28,
  JPY: 0.0067,
  CAD: 0.74,
};

function convertToMainCurrency(amount, currency, mainCurrency) {
  if (!currency || currency === mainCurrency) {
    return amount;
  }

  const rateToUsd = currencyRatesToUsd[currency] || 1;
  const mainRateToUsd = currencyRatesToUsd[mainCurrency] || 1;
  const amountInUsd = amount * rateToUsd;

  return amountInUsd / mainRateToUsd;
}

// Base sample records used to generate a longer demo list.
const accountTemplates = [
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
    holderName: "Jamie Lee",
    balance: 10850.0,
    currency: "EUR",
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
  {
    id: 4,
    name: "Global Travel",
    type: "checking",
    typeLabel: "Checking",
    description: "Multi-currency spend",
    maskedAccount: "**** 5521",
    updatedLabel: "Updated 10m ago",
    holderName: "Jamie Lee",
    balance: 1840.55,
    currency: "GBP",
    updatedAt: "2026-03-02",
  },
  {
    id: 5,
    name: "Long-Term Growth",
    type: "investment",
    typeLabel: "Investment",
    description: "Index fund allocation",
    maskedAccount: "**** 2290",
    updatedLabel: "Updated 3d ago",
    holderName: "Alex Doe",
    balance: 452000,
    currency: "USD",
    updatedAt: "2026-02-26",
  },
  {
    id: 6,
    name: "Cash Reserve",
    type: "cash",
    typeLabel: "Cash",
    description: "Petty cash reserve",
    maskedAccount: "**** 6401",
    updatedLabel: "Updated 2d ago",
    holderName: "Jamie Lee",
    balance: 95000,
    currency: "JPY",
    updatedAt: "2026-02-27",
  },
  {
    id: 7,
    name: "Side Business",
    type: "checking",
    typeLabel: "Checking",
    description: "Client payments",
    maskedAccount: "**** 8812",
    updatedLabel: "Updated 5h ago",
    holderName: "Alex Doe",
    balance: 7320.35,
    currency: "CAD",
    updatedAt: "2026-03-01",
  },
];

// Fake records that simulate what your backend would return from /api/accounts.
// Later, you can replace this with real API data and keep the same renderer.
const fakeAccounts = Array.from({ length: 15 }, (_, index) => {
  const template = accountTemplates[index % accountTemplates.length];
  const id = index + 1;
  const balance = Number((template.balance + index * 137.42).toFixed(2));
  const mainBalance = Number(
    convertToMainCurrency(balance, template.currency, MAIN_CURRENCY).toFixed(2),
  );

  return {
    ...template,
    id,
    name: `${template.name} ${String(id).padStart(2, "0")}`,
    maskedAccount: `**** ${String(3200 + id).padStart(4, "0")}`,
    updatedLabel: `Updated ${((index % 6) + 1) * 15}m ago`,
    balance,
    mainCurrency: MAIN_CURRENCY,
    mainBalance,
    availableBalance:
      template.availableBalance == null
        ? template.availableBalance
        : Number((template.availableBalance - index * 45.5).toFixed(2)),
  };
});

function mountDemo() {
  // Render sidebar menu so it is shared across pages.
  const sidebarMount = document.querySelector("[data-component='sidebar']");

  if (sidebarMount) {
    const activePath = sidebarMount.dataset.activePath || undefined;
    renderSidebar({ container: sidebarMount, activePath });
  }

  // 1) Find the place in HTML where cards should be inserted.
  const container = document.querySelector("[data-component='accounts-list']");
  const filters = document.querySelector("[data-component='accounts-filters']");

  if (!container) {
    // If the target container does not exist, exit safely.
    return;
  }

  const holderSelect = filters?.querySelector("[data-filter='holder']") || null;
  const currencySelect = filters?.querySelector("[data-filter='currency']") || null;
  const typeSelect = filters?.querySelector("[data-filter='type']") || null;

  function getUniqueValues(items, key) {
    return [...new Set(items.map((item) => item[key]).filter(Boolean))].sort();
  }

  function fillSelect(select, values, label) {
    if (!select) {
      return;
    }

    select.innerHTML = "";
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = `All ${label}`;
    select.appendChild(defaultOption);

    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  }

  fillSelect(holderSelect, getUniqueValues(fakeAccounts, "holderName"), "holders");
  fillSelect(currencySelect, getUniqueValues(fakeAccounts, "currency"), "currencies");
  fillSelect(typeSelect, getUniqueValues(fakeAccounts, "typeLabel"), "types");

  function applyFilters() {
    const holderValue = holderSelect?.value || "";
    const currencyValue = currencySelect?.value || "";
    const typeValue = typeSelect?.value || "";

    const filteredAccounts = fakeAccounts.filter((account) => {
      if (holderValue && account.holderName !== holderValue) {
        return false;
      }

      if (currencyValue && account.currency !== currencyValue) {
        return false;
      }

      if (typeValue && account.typeLabel !== typeValue) {
        return false;
      }

      return true;
    });

    renderAccountsList({
      container,
      accounts: filteredAccounts,
      onDetails: ({ accountId, account }) => {
        alert(`Open details for #${accountId} (${account.name})`);
      },
    });
  }

  [holderSelect, currencySelect, typeSelect].forEach((select) => {
    if (select) {
      select.addEventListener("change", applyFilters);
    }
  });

  // 2) Render one account card per account object.
  // The renderer handles looping and calls your component factory for each item.
  applyFilters();

  // 4) Ask Lucide to replace <i data-lucide="..."></i> with SVG icons.
  if (window.lucide?.createIcons) {
    window.lucide.createIcons();
  }
}

// Start the demo.
mountDemo();
