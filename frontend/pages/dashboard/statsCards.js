/**
 * Dashboard stats cards widget.
 *
 * Renders five InfoCard components summarising the user's financial position:
 *
 *  1. Total Balance   — sum of all accounts, converted to main currency
 *  2. Monthly Income  — total income for the current calendar month
 *  3. Monthly Expenses— total expenses for the current calendar month
 *  4. Net Cash Flow   — income minus expenses this month
 *  5. Active Accounts — count of active bank accounts
 *
 * All monetary values are formatted in the user's configured main currency.
 * FX conversion is performed for multi-currency portfolios.
 */

import { InfoCard } from '../../components/dumb/infoCard/infoCard.js';
import { AccountSummaryCard } from '../../components/dumb/accountSummaryCard/accountSummaryCard.js';
import { normalizeCurrency, formatMoneyFromCents } from '../../utils/formatters.js';

/** Number of skeleton cards to show while loading. */
const CARD_COUNT = 5;

/**
 * Renders loading skeletons into the stats container.
 *
 * @param {HTMLElement} container — the #dashboard-stats element
 */
export function renderLoadingStats(container) {
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < CARD_COUNT; i++) {
    container.appendChild(
      InfoCard.createLoadingElement({ hasSubValue: true, hasNote: true })
    );
  }
}

/**
 * Computes and renders all five stat cards.
 *
 * @param {HTMLElement} container    — the #dashboard-stats element
 * @param {object}      params
 * @param {Array}       params.accounts       — active bank accounts
 * @param {Array}       params.monthMovements — movements for the current month
 * @param {string}      params.mainCurrency   — user's main currency (normalised)
 */
export async function renderStatsCards(container, { accounts, monthMovements, mainCurrency }) {
  if (!container) return;

  // ── 1. Convert all account balances to main currency ─────────────────────
  const convertedCents = await Promise.all(
    accounts.map(acct => _getConvertedCents(acct, mainCurrency))
  );

  const totalBalanceCents = convertedCents.reduce((sum, v) => sum + v, 0);
  const totalSavingsCents = convertedCents.reduce((sum, v) => (v > 0 ? sum + v : sum), 0);
  const totalDebtsCents = convertedCents.reduce((sum, v) => (v < 0 ? sum + v : sum), 0);

  // ── 2. Compute monthly income / expenses from movement data ──────────────
  let monthIncomeCents = 0;
  let monthExpenseCents = 0;

  for (const mov of monthMovements) {
    const amountCents = Math.abs(Number(mov.value ?? 0));
    if (mov.type === 'Income') {
      monthIncomeCents += amountCents;
    } else {
      monthExpenseCents += amountCents;
    }
  }

  const netFlowCents = monthIncomeCents - monthExpenseCents;

  // ── 3. Build card data array ─────────────────────────────────────────────
  const monthLabel = new Date().toLocaleString('en-US', { month: 'long' });

  const cards = [
    {
      data: {
        icon: 'account_balance',
        label: 'Total Balance',
        value: formatMoneyFromCents(totalBalanceCents, mainCurrency),
        subValue: `In ${mainCurrency}`,
        note: totalDebtsCents < 0
          ? `${formatMoneyFromCents(totalSavingsCents, mainCurrency, { showCode: false })} savings · ${formatMoneyFromCents(totalDebtsCents, mainCurrency, { showCode: false })} debts`
          : `Across ${accounts.length} account${accounts.length === 1 ? '' : 's'}`,
      },
      options: { variant: 'accent' },
    },
    {
      data: {
        icon: 'trending_up',
        label: 'Monthly Income',
        value: formatMoneyFromCents(monthIncomeCents, mainCurrency),
        subValue: monthLabel,
        note: `${monthMovements.filter(m => m.type === 'Income').length} transactions`,
      },
      options: { variant: 'success' },
    },
    {
      data: {
        icon: 'trending_down',
        label: 'Monthly Expenses',
        value: formatMoneyFromCents(monthExpenseCents, mainCurrency),
        subValue: monthLabel,
        note: `${monthMovements.filter(m => m.type !== 'Income').length} transactions`,
      },
      options: { variant: 'danger' },
    },
    {
      data: {
        icon: netFlowCents >= 0 ? 'savings' : 'warning',
        label: 'Net Cash Flow',
        value: formatMoneyFromCents(netFlowCents, mainCurrency),
        subValue: monthLabel,
        trend: {
          value: netFlowCents >= 0 ? 'Positive' : 'Negative',
          direction: netFlowCents >= 0 ? 'up' : 'down',
        },
      },
      options: { variant: netFlowCents >= 0 ? 'success' : 'danger' },
    },
  ];

  // ── 4. Render ────────────────────────────────────────────────────────────
  container.innerHTML = '';
  for (const card of cards) {
    container.appendChild(InfoCard.createElement(card.data, card.options));
  }
}

// ── Private helpers ─────────────────────────────────────────────────────────

/**
 * Converts a single account's balance to the main currency.
 * Returns the value in cents. Falls back to the raw balance on FX error.
 */
async function _getConvertedCents(account, mainCurrency) {
  const acctCurrency = normalizeCurrency(account?.currency);
  const rawCents = Number(account?.total_balance ?? 0);

  if (!acctCurrency || acctCurrency === mainCurrency) {
    return Number.isFinite(rawCents) ? rawCents : 0;
  }

  const converted = await AccountSummaryCard.getLatestConvertedTotalCents(account, {
    defaultCurrency: mainCurrency,
  });

  return Number.isFinite(converted) ? converted : 0;
}

/**
 * Returns a short summary of currencies present across accounts.
 * E.g. "USD, EUR, MXN" or "USD only".
 */
function _summariseCurrencies(accounts) {
  const unique = [...new Set(accounts.map(a => normalizeCurrency(a.currency)).filter(Boolean))];
  if (unique.length === 0) return '';
  if (unique.length === 1) return `${unique[0]} only`;
  return unique.join(', ');
}
