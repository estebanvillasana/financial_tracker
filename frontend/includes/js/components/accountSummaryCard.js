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

function formatMaskedAccount(account) {
  if (account.maskedAccount) {
    return account.maskedAccount;
  }

  if (account.last4) {
    return `**** ${account.last4}`;
  }

  return "**** ----";
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
    "ft-account-card__tag",
    account.typeLabel || `${accountType} account`,
  );

  nameRow.appendChild(name);
  nameRow.appendChild(typeTag);

  const description = createNode(
    "p",
    "ft-account-card__description",
    account.description || "No description",
  );

  const metaRow = createNode("div", "ft-account-card__meta-row");
  const metaMain = createNode(
    "span",
    "ft-account-card__meta-main",
    `${account.currency || "USD"} · ${formatMaskedAccount(account)}`,
  );
  const updatedText = createNode(
    "span",
    "ft-account-card__meta-sub",
    account.updatedLabel || `Updated ${formatShortDate(account.updatedAt || Date.now())}`,
  );

  metaRow.appendChild(metaMain);
  metaRow.appendChild(updatedText);

  const holderInline = createNode("span", "ft-account-card__holder-inline");
  const holderIcon = createNode("i", "ft-icon ft-icon--sm");
  holderIcon.dataset.lucide = "user";
  holderInline.appendChild(holderIcon);
  holderInline.appendChild(
    createNode(
      "span",
      "ft-account-card__holder-text",
      account.holderName || "Unavailable",
    ),
  );
  metaRow.appendChild(holderInline);

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
    account.secondaryBalance == null
      ? ""
      : formatCurrency(account.secondaryBalance, account.secondaryCurrency || account.currency || "USD"),
  );

  if (!balanceSub.textContent && account.availableBalance != null) {
    balanceSub.textContent = formatCurrency(account.availableBalance, account.currency || "USD");
  }

  balance.appendChild(balanceMain);
  if (balanceSub.textContent) {
    balance.appendChild(balanceSub);
  }

  top.appendChild(iconBox);
  top.appendChild(meta);
  top.appendChild(balance);

  card.addEventListener("click", () => {
    card.dispatchEvent(
      new CustomEvent("account:details", {
        bubbles: true,
        detail: { accountId: account.id, account },
      }),
    );
  });

  card.appendChild(top);

  // Renderer will append this returned node into the page container.
  return card;
}
