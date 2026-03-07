/**
 * Dashboard breakdowns widget.
 *
 * Renders three side-by-side Breakdown cards:
 *
 *  1. Spending by Category — this month's expenses grouped by category name
 *  2. Balance by Account   — savings accounts ranked by converted balance
 *  3. Monthly Flow         — income vs expenses as a two-item comparison
 *
 * All three use the reusable Breakdown dumb component so the
 * rendering logic is centralised. This module is responsible for:
 *   - Transforming raw API data into the { items, total } shape
 *   - Performing synchronous FX conversion using the pre-fetched rates object
 *   - Delegating all DOM rendering to Breakdown
 */

import { Breakdown } from '../../components/dumb/breakdown/breakdown.js';
import { normalizeCurrency, formatMoneyFromCents } from '../../utils/formatters.js';

/**
 * Renders all three breakdown cards.
 *
 * @param {object} containers
 * @param {HTMLElement} containers.categories  — #dashboard-breakdown-categories
 * @param {HTMLElement} containers.accounts    — #dashboard-breakdown-accounts
 * @param {HTMLElement} containers.flow        — #dashboard-breakdown-flow
 * @param {HTMLElement} containers.period      — #dashboard-breakdown-period (label)
 * @param {HTMLElement} containers.flowPeriod  — #dashboard-breakdown-flow-period (label)
 * @param {object}      data
 * @param {Array}       data.monthMovements — current month's movements
 * @param {Array}       data.accounts       — active bank accounts
 * @param {object}      data.rates          — FX rates { MXN: 17.5, USD: 1, ... }
 * @param {string}      data.mainCurrency   — user's main currency code
 */
export function renderBreakdowns(containers, { monthMovements, accounts, rates, mainCurrency }) {
  const monthLabel = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });

  if (containers.period)     containers.period.textContent = monthLabel;
  if (containers.flowPeriod) containers.flowPeriod.textContent = monthLabel;

  _renderBreakdown(containers.categories, { monthMovements, mainCurrency });
  _renderAccountBreakdown(containers.accounts, { accounts, rates, mainCurrency });
  _renderFlowBreakdown(containers.flow, { monthMovements, mainCurrency });
}

// ── Private renderers ───────────────────────────────────────────────────────

/**
 * Spending by Category — groups expense movements by category name.
 */
function _renderBreakdown(container, { monthMovements, mainCurrency }) {
  if (!container) return;

  const expenses = monthMovements.filter(m => m.type !== 'Income');

  const grouped = {};
  for (const mov of expenses) {
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
    emptyIcon: 'donut_small',
    emptyMessage: 'No expenses this month.',
  });
}

/**
 * Balance by Account — shows savings accounts (positive balance) ranked by
 * converted balance. Uses a synchronous FX approximation with the rates object.
 * Debt accounts are excluded since they would invert the bar proportions.
 */
function _renderAccountBreakdown(container, { accounts, rates, mainCurrency }) {
  if (!container) return;

  const tgt = normalizeCurrency(mainCurrency);
  const tgtRate = rates[tgt] ?? 1;

  // Convert each account balance to main currency synchronously
  const items = [];
  for (const acct of accounts) {
    const rawCents = Number(acct.total_balance ?? 0);
    if (rawCents <= 0) continue; // skip debts and zero-balance accounts

    const src = normalizeCurrency(acct.currency);
    let convertedCents;

    if (src === tgt || !rates[src]) {
      convertedCents = rawCents;
    } else {
      convertedCents = Math.round(rawCents * tgtRate / rates[src]);
    }

    items.push({
      name: acct.account,
      value: convertedCents,
      // Keep the original currency for per-item display
      _src: src,
      _rawCents: rawCents,
    });
  }

  const totalCents = items.reduce((s, i) => s + i.value, 0);

  _mount(container, {
    items,
    total: {
      label: `Total Savings (${tgt})`,
      value: formatMoneyFromCents(totalCents, mainCurrency),
    },
  }, {
    // Display each account's balance in its own currency for accuracy
    formatValue: (convertedCents, item) => {
      if (item?._src && item._src !== tgt) {
        return formatMoneyFromCents(item._rawCents, item._src);
      }
      return formatMoneyFromCents(convertedCents, tgt);
    },
    emptyIcon: 'account_balance_wallet',
    emptyMessage: 'No savings accounts found.',
  });
}

/**
 * Monthly Flow — income vs expenses as a two-item bar comparison.
 * The bar proportions show income relative to expenses.
 */
function _renderFlowBreakdown(container, { monthMovements, mainCurrency }) {
  if (!container) return;

  let incomeCents = 0;
  let expenseCents = 0;

  for (const mov of monthMovements) {
    const abs = Math.abs(Number(mov.value ?? 0));
    if (mov.type === 'Income') incomeCents += abs;
    else expenseCents += abs;
  }

  const netCents = incomeCents - expenseCents;
  const netLabel = netCents >= 0 ? 'Surplus' : 'Deficit';

  _mount(container, {
    items: [
      { name: 'Income', value: incomeCents },
      { name: 'Expenses', value: expenseCents },
    ],
    total: {
      label: netLabel,
      value: formatMoneyFromCents(Math.abs(netCents), mainCurrency),
    },
  }, {
    formatValue: c => formatMoneyFromCents(c, mainCurrency),
    // Income = green, Expenses = red
    barColors: ['var(--ft-color-success)', 'var(--ft-color-danger)'],
    emptyIcon: 'swap_vert',
    emptyMessage: 'No movements this month.',
  });
}

// ── Shared mount helper ─────────────────────────────────────────────────────

/**
 * Mounts a Breakdown element into a container.
 *
 * Breakdown now calls formatValue(value, item) passing the full item
 * object as a second argument. Callers that only need the value can ignore it;
 * callers like _renderAccountBreakdown use it for per-item currency display.
 */
function _mount(container, data, options) {
  if (!container) return;
  container.innerHTML = '';
  container.appendChild(Breakdown.createElement(data, options));
}
