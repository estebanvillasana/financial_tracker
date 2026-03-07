/**
 * Dashboard stats cards widget.
 *
 * Renders two groups of InfoCard components:
 *
 * Primary (net worth snapshot — account-level, always current):
 *  1. Balance   — sum of all non-savings accounts (any sign)
 *  2. Available — sum of non-savings accounts with a positive balance
 *  3. Savings   — sum of all savings-type accounts
 *  4. Debts     — sum of all accounts with a negative balance
 *
 * Secondary (previous month's activity — shown below the breakdown report):
 *  5. Income    — total income for the previous calendar month
 *  6. Expenses  — total expenses for the previous calendar month
 *  7. Net Flow  — income minus expenses for the previous month
 *
 * All monetary values are formatted in the user's configured main currency.
 * FX conversion is performed for multi-currency portfolios.
 */

import { InfoCard } from '../../components/dumb/infoCard/infoCard.js';
import { AccountSummaryCard } from '../../components/dumb/accountSummaryCard/accountSummaryCard.js';
import { normalizeCurrency, formatMoneyFromCents } from '../../utils/formatters.js';

/**
 * Renders loading skeletons into both stats containers.
 *
 * @param {HTMLElement} primaryContainer   — the #dashboard-stats-primary element
 * @param {HTMLElement} secondaryContainer — the #dashboard-stats-secondary element
 */
export function renderLoadingStats(primaryContainer, secondaryContainer) {
  _fillSkeletons(primaryContainer,   4, { hasSubValue: true, hasNote: true });
  _fillSkeletons(secondaryContainer, 3, { hasSubValue: true, hasNote: true });
}

/**
 * Computes and renders all stat cards across two containers.
 *
 * @param {HTMLElement} primaryContainer   — the #dashboard-stats-primary element
 * @param {HTMLElement} secondaryContainer — the #dashboard-stats-secondary element
 * @param {object}      params
 * @param {Array}       params.accounts            — active bank accounts
 * @param {Array}       params.monthMovements      — movements for the current month (unused, kept for compat)
 * @param {Array}       params.prevMonthMovements  — movements for the previous month
 * @param {string}      params.mainCurrency        — user's main currency (normalised)
 */
export async function renderStatsCards(primaryContainer, secondaryContainer, { accounts, prevMonthMovements, mainCurrency }) {

  // ── 1. Convert all account balances to main currency ─────────────────────
  const convertedCents = await Promise.all(
    accounts.map(acct => _getConvertedCents(acct, mainCurrency))
  );

  let balanceCents    = 0; // sum of non-savings accounts (any sign)
  let availableCents  = 0; // sum of non-savings accounts with positive balance
  let savingsCents    = 0; // sum of savings-type accounts
  let debtsCents      = 0; // sum of accounts with negative balance
  let nonSavingsCount = 0;
  let availableCount  = 0;
  let savingsCount    = 0;
  let debtCount       = 0;

  for (let i = 0; i < accounts.length; i++) {
    const cents     = convertedCents[i];
    const isSavings = accounts[i].type === 'Savings';

    if (isSavings) {
      savingsCents += cents;
      savingsCount++;
    } else {
      balanceCents += cents;
      nonSavingsCount++;
      if (cents > 0) {
        availableCents += cents;
        availableCount++;
      }
    }

    if (cents < 0) {
      debtsCents += cents;
      debtCount++;
    }
  }

  // ── 2. Compute previous month income / expenses ───────────────────────────
  let prevIncomeCents  = 0;
  let prevExpenseCents = 0;

  for (const mov of prevMonthMovements) {
    const abs = Math.abs(Number(mov.value ?? 0));
    if (mov.type === 'Income') prevIncomeCents  += abs;
    else                       prevExpenseCents += abs;
  }

  const netFlowCents  = prevIncomeCents - prevExpenseCents;
  const prevMonthLabel = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  })();

  // ── 3. Primary cards (net worth snapshot) ────────────────────────────────
  const primaryCards = [
    {
      data: {
        icon:     'account_balance',
        label:    'Balance',
        value:    formatMoneyFromCents(balanceCents, mainCurrency),
        subValue: `In ${mainCurrency}`,
        note:     `${nonSavingsCount} account${nonSavingsCount !== 1 ? 's' : ''} · excl. savings`,
      },
      options: { variant: balanceCents < 0 ? 'danger' : 'accent' },
    },
    {
      data: {
        icon:     'payments',
        label:    'Available',
        value:    formatMoneyFromCents(availableCents, mainCurrency),
        subValue: `In ${mainCurrency}`,
        note:     `${availableCount} account${availableCount !== 1 ? 's' : ''} with positive balance`,
      },
      options: { variant: 'success' },
    },
    {
      data: {
        icon:     'savings',
        label:    'Savings',
        value:    formatMoneyFromCents(savingsCents, mainCurrency),
        subValue: `In ${mainCurrency}`,
        note:     `${savingsCount} savings account${savingsCount !== 1 ? 's' : ''}`,
      },
      options: { variant: 'success' },
    },
    {
      data: {
        icon:     debtsCents < 0 ? 'credit_score' : 'check_circle',
        label:    'Debts',
        value:    formatMoneyFromCents(Math.abs(debtsCents), mainCurrency),
        subValue: `In ${mainCurrency}`,
        note:     debtsCents < 0
          ? `${debtCount} account${debtCount !== 1 ? 's' : ''} in the negative`
          : 'No outstanding debts',
      },
      options: { variant: debtsCents < 0 ? 'danger' : 'default' },
    },
  ];

  // ── 4. Secondary cards (previous month activity) ──────────────────────────
  const secondaryCards = [
    {
      data: {
        icon:     'trending_up',
        label:    'Income',
        value:    formatMoneyFromCents(prevIncomeCents, mainCurrency),
        subValue: prevMonthLabel,
        note:     `${prevMonthMovements.filter(m => m.type === 'Income').length} transactions`,
      },
      options: { variant: 'success' },
    },
    {
      data: {
        icon:     'trending_down',
        label:    'Expenses',
        value:    formatMoneyFromCents(prevExpenseCents, mainCurrency),
        subValue: prevMonthLabel,
        note:     `${prevMonthMovements.filter(m => m.type !== 'Income').length} transactions`,
      },
      options: { variant: 'danger' },
    },
    {
      data: {
        icon:     netFlowCents >= 0 ? 'savings' : 'warning',
        label:    'Net Flow',
        value:    formatMoneyFromCents(netFlowCents, mainCurrency),
        subValue: prevMonthLabel,
        trend: {
          value:     netFlowCents >= 0 ? 'Surplus' : 'Deficit',
          direction: netFlowCents >= 0 ? 'up' : 'down',
        },
      },
      options: { variant: netFlowCents >= 0 ? 'success' : 'danger' },
    },
  ];

  // ── 5. Render ─────────────────────────────────────────────────────────────
  _fillCards(primaryContainer,   primaryCards);
  _fillCards(secondaryContainer, secondaryCards);
}

// ── Private helpers ─────────────────────────────────────────────────────────

function _fillCards(container, cards) {
  if (!container) return;
  container.innerHTML = '';
  for (const card of cards) {
    container.appendChild(InfoCard.createElement(card.data, card.options));
  }
}

function _fillSkeletons(container, count, skeletonOptions = {}) {
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    container.appendChild(InfoCard.createLoadingElement(skeletonOptions));
  }
}

/**
 * Converts a single account's balance to the main currency.
 * Returns the value in cents. Falls back to the raw balance on FX error.
 */
async function _getConvertedCents(account, mainCurrency) {
  const acctCurrency = normalizeCurrency(account?.currency);
  const rawCents     = Number(account?.total_balance ?? 0);

  if (!acctCurrency || acctCurrency === mainCurrency) {
    return Number.isFinite(rawCents) ? rawCents : 0;
  }

  const converted = await AccountSummaryCard.getLatestConvertedTotalCents(account, {
    defaultCurrency: mainCurrency,
  });

  return Number.isFinite(converted) ? converted : 0;
}
