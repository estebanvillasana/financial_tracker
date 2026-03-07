/**
 * Monthly Report — Rendering helpers.
 *
 * Renders summary stats (InfoCard), category/subcategory breakdowns
 * (Breakdown component), and income vs expense comparison.
 *
 * Calculation approach matches the Dashboard (statsCards.js, breakdowns.js):
 * sums raw movement values (cents) without FX conversion. This keeps the
 * report totals consistent with the dashboard overview.
 */

import { InfoCard } from '../../components/dumb/infoCard/infoCard.js';
import { Breakdown } from '../../components/dumb/breakdown/breakdown.js';
import { normalizeCurrency, formatMoneyFromCents } from '../../utils/formatters.js';

/** Returns true for internal money transfers (movement_code starts with "MT"). */
function isTransfer(mov) {
  return typeof mov.movement_code === 'string' && mov.movement_code.startsWith('MT');
}

/**
 * Renders the overview stats cards row.
 *
 * Internal transfers (MT* codes) are excluded so only real income/expenses
 * are reflected in the totals.
 *
 * @param {HTMLElement} container — #widget-stats-row
 * @param {object} data
 * @param {Array}  data.monthMovements
 * @param {string} data.mainCurrency
 */
export function renderStatsCards(container, { monthMovements, mainCurrency }) {
  if (!container) return;
  container.innerHTML = '';

  const mc = normalizeCurrency(mainCurrency);

  let totalIncome = 0;
  let totalExpenses = 0;
  let movementCount = 0;
  let categorySet = new Set();

  for (const mov of monthMovements) {
    if (isTransfer(mov)) continue;
    const abs = Math.abs(Number(mov.value ?? 0));
    if (mov.type === 'Income') {
      totalIncome += abs;
    } else {
      totalExpenses += abs;
    }
    movementCount++;
    if (mov.category) categorySet.add(mov.category);
  }

  const netFlow = totalIncome - totalExpenses;
  const netDirection = netFlow > 0 ? 'up' : netFlow < 0 ? 'down' : 'neutral';

  const cards = [
    {
      label: 'Total Income',
      value: formatMoneyFromCents(totalIncome, mc),
      icon: 'trending_up',
      note: `${movementCount} movements`,
    },
    {
      label: 'Total Expenses',
      value: formatMoneyFromCents(totalExpenses, mc),
      icon: 'trending_down',
      note: `${categorySet.size} categories used`,
    },
    {
      label: 'Net Flow',
      value: formatMoneyFromCents(Math.abs(netFlow), mc),
      icon: 'account_balance',
      trend: {
        value: netFlow >= 0 ? '+' + formatMoneyFromCents(netFlow, mc) : formatMoneyFromCents(netFlow, mc),
        direction: netDirection,
      },
    },
    {
      label: 'Movements',
      value: String(movementCount),
      icon: 'receipt_long',
      note: `${categorySet.size} categories`,
    },
  ];

  const variants = ['success', 'danger', netDirection === 'up' ? 'success' : 'danger', 'default'];

  cards.forEach((data, i) => {
    container.appendChild(InfoCard.createElement(data, { variant: variants[i] }));
  });
}

/**
 * Renders loading skeletons for stats cards.
 * @param {HTMLElement} container
 */
export function renderLoadingStats(container) {
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    container.appendChild(InfoCard.createLoadingElement({ hasNote: true }));
  }
}

/**
 * Renders the category breakdown card.
 *
 * @param {HTMLElement} container — #breakdown-categories-content
 * @param {object} data
 */
export function renderCategoryBreakdown(container, { monthMovements, mainCurrency }) {
  if (!container) return;

  const mc = normalizeCurrency(mainCurrency);
  const grouped = {};

  for (const mov of monthMovements) {
    if (mov.type === 'Income' || isTransfer(mov)) continue;
    const key = mov.category || 'Uncategorized';
    grouped[key] = (grouped[key] ?? 0) + Math.abs(Number(mov.value ?? 0));
  }

  const items = Object.entries(grouped).map(([name, value]) => ({ name, value }));
  const totalCents = items.reduce((s, i) => s + i.value, 0);

  container.innerHTML = '';
  container.appendChild(Breakdown.createElement({
    items,
    total: {
      label: 'Total Expenses',
      value: formatMoneyFromCents(totalCents, mc),
    },
  }, {
    formatValue: c => formatMoneyFromCents(c, mc),
    emptyIcon: 'donut_small',
    emptyMessage: 'No expenses this month.',
  }));
}

/**
 * Renders the subcategory breakdown card.
 *
 * @param {HTMLElement} container — #breakdown-subcategories-content
 * @param {object} data
 */
export function renderSubCategoryBreakdown(container, { monthMovements, mainCurrency }) {
  if (!container) return;

  const mc = normalizeCurrency(mainCurrency);
  const grouped = {};

  for (const mov of monthMovements) {
    if (mov.type === 'Income' || isTransfer(mov)) continue;
    const key = mov.sub_category || mov.category || 'Uncategorized';
    grouped[key] = (grouped[key] ?? 0) + Math.abs(Number(mov.value ?? 0));
  }

  const items = Object.entries(grouped).map(([name, value]) => ({ name, value }));
  const totalCents = items.reduce((s, i) => s + i.value, 0);

  container.innerHTML = '';
  container.appendChild(Breakdown.createElement({
    items,
    total: {
      label: 'Total Expenses',
      value: formatMoneyFromCents(totalCents, mc),
    },
  }, {
    formatValue: c => formatMoneyFromCents(c, mc),
    emptyIcon: 'label',
    emptyMessage: 'No expenses this month.',
  }));
}

/**
 * Renders the income vs expenses comparison breakdown.
 *
 * @param {HTMLElement} container — #breakdown-income-expense-content
 * @param {object} data
 */
export function renderIncomeVsExpenses(container, { monthMovements, mainCurrency }) {
  if (!container) return;

  const mc = normalizeCurrency(mainCurrency);
  let income = 0;
  let expenses = 0;

  for (const mov of monthMovements) {
    if (isTransfer(mov)) continue;
    const abs = Math.abs(Number(mov.value ?? 0));
    if (mov.type === 'Income') {
      income += abs;
    } else {
      expenses += abs;
    }
  }

  const items = [
    { name: 'Income', value: income, _color: 'var(--ft-color-success)' },
    { name: 'Expenses', value: expenses, _color: 'var(--ft-color-danger)' },
  ];

  const netCents = income - expenses;

  container.innerHTML = '';
  container.appendChild(Breakdown.createElement({
    items,
    total: {
      label: 'Net Flow',
      value: formatMoneyFromCents(netCents, mc),
    },
  }, {
    formatValue: c => formatMoneyFromCents(c, mc),
    emptyIcon: 'balance',
    emptyMessage: 'No movements this month.',
  }));
}
