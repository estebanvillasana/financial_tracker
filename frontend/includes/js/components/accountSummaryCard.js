import { createNode } from "../core/dom.js";
import { formatCurrency, formatShortDate } from "../core/formatters.js";

// Maps business type -> icon name used by Lucide.
const ACCOUNT_TYPE_ICON = {
  checking: "landmark",
  savings: "piggy-bank",
  investment: "trending-up",
  credit: "credit-card",
  cash: "banknote",
};

// Keeps type values consistent so CSS modifiers (ft-account-card--*) always work.
function normalizeType(accountType) {
  if (!accountType) {
    return "checking";
  }

  return String(accountType).toLowerCase();
}

export function createAccountSummaryCard(account) {
  // Root card element. Returns one complete DOM node per account.
  const card = createNode("article", "ft-card ft-account-card");

  const accountType = normalizeType(account.type);
  card.classList.add(`ft-account-card--${accountType}`);
  // Helpful for debugging and future event handling.
  card.dataset.accountId = String(account.id);

  // ----- Top section (icon + account metadata + balances) -----
  const top = createNode("div", "ft-account-card__top");
  const iconBox = createNode("div", "ft-account-card__icon");
  const icon = createNode("i", "ft-icon ft-icon--md");
  icon.dataset.lucide = ACCOUNT_TYPE_ICON[accountType] || ACCOUNT_TYPE_ICON.checking;
  iconBox.appendChild(icon);

  const meta = createNode("div", "ft-account-card__meta");
  const nameRow = createNode("div", "ft-account-card__name-row");
  const name = createNode("h3", "ft-account-card__name", account.name || "Unnamed account");
  const typeTag = createNode(
    "span",
    "ft-label ft-account-card__type-label ft-label--neutral",
    account.typeLabel || accountType,
  );

  nameRow.appendChild(name);
  nameRow.appendChild(typeTag);

  const description = createNode(
    "p",
    "ft-account-card__description",
    account.description || "No description",
  );

  const metaRow = createNode("div", "ft-account-card__meta-row");
  const updatedText = createNode(
    "span",
    "ft-account-card__meta-main",
    `Updated ${formatShortDate(account.updatedAt || Date.now())}`,
  );
  const institutionText = createNode(
    "span",
    "ft-account-card__meta-sub",
    account.institution || "-",
  );

  metaRow.appendChild(updatedText);
  metaRow.appendChild(institutionText);

  meta.appendChild(nameRow);
  meta.appendChild(description);
  meta.appendChild(metaRow);

  const balance = createNode("div", "ft-account-card__balance");
  const balanceMain = createNode(
    "div",
    "ft-account-card__balance-main",
    formatCurrency(account.balance, account.currency || "USD"),
  );
  const balanceSub = createNode(
    "div",
    "ft-account-card__balance-sub",
    account.availableBalance == null
      ? ""
      : `Available ${formatCurrency(account.availableBalance, account.currency || "USD")}`,
  );

  balance.appendChild(balanceMain);
  if (balanceSub.textContent) {
    balance.appendChild(balanceSub);
  }

  top.appendChild(iconBox);
  top.appendChild(meta);
  top.appendChild(balance);

  // ----- Bottom section (action + holder info) -----
  const bottom = createNode("div", "ft-account-card__bottom");
  const detailsButton = createNode("button", "ft-account-card__details", "View details");
  detailsButton.type = "button";
  detailsButton.addEventListener("click", () => {
    // Emit a custom event so parent layers decide what happens on click.
    // This keeps the component reusable and free of routing logic.
    card.dispatchEvent(
      new CustomEvent("account:details", {
        bubbles: true,
        detail: { accountId: account.id, account },
      }),
    );
  });

  const holder = createNode("div", "ft-account-card__holder");
  const holderName = createNode(
    "span",
    "ft-account-card__holder-text",
    account.holderName || "Account holder unavailable",
  );

  holder.appendChild(holderName);
  bottom.appendChild(detailsButton);
  bottom.appendChild(holder);

  card.appendChild(top);
  card.appendChild(bottom);

  // Renderer will append this returned node into the page container.
  return card;
}
