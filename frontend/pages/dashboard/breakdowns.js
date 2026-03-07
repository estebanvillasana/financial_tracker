/**
 * Dashboard breakdowns widget.
 *
 * Renders three side-by-side Breakdown cards using the previous month's data:
 *
 *  1. Spending by Category — previous month's expenses grouped by category
 *  2. Biggest Expenses     — previous month's top individual expense transactions
 *  3. Account Balances     — non-savings accounts ranked by absolute balance,
 *                            green bars for positive, red bars for negative
 *
 * All three use the reusable Breakdown dumb component. This module transforms
 * raw API data into the { items, total } shape and delegates DOM rendering.
 */

import { Breakdown } from '../../components/dumb/breakdown/breakdown.js';
import { normalizeCurrency, formatMoneyFromCents } from '../../utils/formatters.js';

/**
 * Renders all three breakdown cards.
 *
 * @param {object} containers
 * @param {HTMLElement} containers.categories — #dashboard-breakdown-categories
 * @param {HTMLElement} containers.expenses   — #dashboard-breakdown-expenses
 * @param {HTMLElement} containers.accounts   — #dashboard-breakdown-accounts
 * @param {object}      data
 * @param {Array}       data.prevMonthMovements — previous month's movements
 * @param {Array}       data.accounts           — active bank accounts
 * @param {object}      data.rates              — FX rates { MXN: 17.5, USD: 1, ... }
 * @param {string}      data.mainCurrency       — user's main currency code
 */
export function renderBreakdowns(containers, { prevMonthMovements, accounts, rates, mainCurrency }) {
  _renderCategoryBreakdown(containers.categories, { prevMonthMovements, mainCurrency });
  _renderBiggestExpenses(containers.expenses, { prevMonthMovements, mainCurrency });
  _renderAccountBreakdown(containers.accounts, { accounts, rates, mainCurrency });
}

// ── Private renderers ───────────────────────────────────────────────────────

/**
 * Spending by Category — groups the previous month's expenses by category.
 */
function _renderCategoryBreakdown(container, { prevMonthMovements, mainCurrency }) {
  if (!container) return;

  const grouped = {};
  for (const mov of prevMonthMovements) {
    if (mov.type === 'Income') continue;
    const key = mov.category || 'Uncategorized';
    grouped[key] = (grouped[key] ?? 0) + Math.abs(Number(mov.value ?? 0));
  }

  const items = Object.entries(grouped).map(([name, value]) => ({ name, value }));
  const totalCents = items.reduce((s, i) => s + i.value, 0);

  _mount(container, {
    items,
    total: {
      label: 'Total Expenses',
      value: formatMoneyFromCents(totalCents, mainCurrency),
    },
  }, {
    formatValue: c => formatMoneyFromCents(c, mainCurrency),
    emptyIcon:    'donut_small',
    emptyMessage: 'No expenses last month.',
  });
}

/**
 * Biggest Expenses — the previous month's top individual expense transactions
 * sorted by amount descending, all bars shown in danger (red) tones.
 */
function _renderBiggestExpenses(container, { prevMonthMovements, mainCurrency }) {
  if (!container) return;

  const items = prevMonthMovements
    .filter(m => m.type !== 'Income')
    .map(m => ({
      name:  m.movement || m.description || 'Unknown',
      value: Math.abs(Number(m.value ?? 0)),
    }))
    .filter(i => i.value > 0);

  const totalCents = items.reduce((s, i) => s + i.value, 0);

  _mount(container, {
    items,
    total: {
      label: 'Total Expenses',
      value: formatMoneyFromCents(totalCents, mainCurrency),
    },
  }, {
    maxItems:     7,
    formatValue:  c => formatMoneyFromCents(c, mainCurrency),
    barColors:    ['var(--ft-color-danger)'],
    emptyIcon:    'receipt_long',
    emptyMessage: 'No expenses last month.',
  });
}

/**
 * Account Balances — all non-savings accounts ranked by absolute balance.
 * Positive balances get a green bar, negative balances a red bar.
 * Uses the synchronous FX approximation with the pre-fetched rates object.
 */
function _renderAccountBreakdown(container, { accounts, rates, mainCurrency }) {
  if (!container) return;

  const tgt     = normalizeCurrency(mainCurrency);
  const tgtRate = rates[tgt] ?? 1;

  const nonSavings = accounts.filter(a => a.type !== 'Savings');

  const items = [];
  for (const acct of nonSavings) {
    const rawCents = Number(acct.total_balance ?? 0);
    const src      = normalizeCurrency(acct.currency);

    let convertedCents;
    if (src === tgt || !rates[src]) {
      convertedCents = rawCents;
    } else {
      convertedCents = Math.round(rawCents * tgtRate / rates[src]);
    }

    items.push({
      name:       acct.account,
      value:      Math.abs(convertedCents),    // positive value drives bar width
      _realCents: convertedCents,              // signed, used in formatValue + total
      _color:     convertedCents >= 0
        ? 'var(--ft-color-success)'
        : 'var(--ft-color-danger)',
      _src:       src,
      _rawCents:  rawCents,
    });
  }

  const netCents = items.reduce((s, i) => s + i._realCents, 0);

  _mount(container, {
    items,
    total: {
      label: `Net Balance (${tgt})`,
      value: formatMoneyFromCents(netCents, mainCurrency),
    },
  }, {
    formatValue: (_absValue, item) => {
      // Show native currency for foreign accounts, main currency otherwise
      if (item?._src && item._src !== tgt) {
        return formatMoneyFromCents(item._rawCents, item._src);
      }
      return formatMoneyFromCents(item?._realCents ?? 0, tgt);
    },
    emptyIcon:    'account_balance_wallet',
    emptyMessage: 'No non-savings accounts found.',
  });
}

// ── Shared mount helper ─────────────────────────────────────────────────────

function _mount(container, data, options) {
  if (!container) return;
  container.innerHTML = '';
  container.appendChild(Breakdown.createElement(data, options));
}
