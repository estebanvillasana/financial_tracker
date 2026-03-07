/**
 * Monthly Report — Rendering helpers.
 *
 * Renders summary stats (InfoCard) and AG Charts donut visualisations
 * for category breakdowns (expenses + income) and income vs expenses.
 *
 * All monetary totals are converted to the app's main currency using the
 * latest FX rates before being summed, so multi-currency movements are
 * correctly reflected in the overview figures.
 */

import { InfoCard } from '../../components/dumb/infoCard/infoCard.js';
import { normalizeCurrency, formatMoneyFromCents } from '../../utils/formatters.js';

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

/** Returns true for internal money transfers (movement_code starts with "MT"). */
function isTransfer(mov) {
  return typeof mov.movement_code === 'string' && mov.movement_code.startsWith('MT');
}

/**
 * Converts a raw cent value from a movement's currency to the main currency.
 */
function toMainCurrency(rawCents, srcCurrency, mainCurrency, rates) {
  const src = normalizeCurrency(srcCurrency);
  if (src === mainCurrency) return rawCents;
  const srcRate = rates[src] ?? 1;
  const tgtRate = rates[mainCurrency] ?? 1;
  return Math.round(rawCents * tgtRate / srcRate);
}

/* ═══════════════════════════════════════════════════════════════
   CHART CONSTANTS & THEME
   ═══════════════════════════════════════════════════════════════ */

const MAX_CHART_SLICES = 7;

const CHART_PALETTE = [
  '#2196f3', '#7c4dff', '#ff9800', '#26a69a',
  '#ef5350', '#8d6e63', '#78909c', '#66bb6a',
  '#42a5f5', '#b388ff', '#ffb74d', '#80cbc4',
];

function getChartTheme(fills = CHART_PALETTE) {
  return {
    baseTheme: 'ag-default-dark',
    palette: { fills, strokes: fills },
    overrides: {
      common: {
        background: { fill: 'transparent' },
      },
    },
  };
}

/**
 * Aggregates category data beyond `maxSlices` into an "Others" bucket
 * so the donut chart stays readable.
 */
function aggregateSlices(data, maxSlices = MAX_CHART_SLICES) {
  const sorted = [...data].sort((a, b) => b.amount - a.amount);
  if (sorted.length <= maxSlices) return sorted;
  const top = sorted.slice(0, maxSlices);
  const rest = sorted.slice(maxSlices);
  const othersAmount = rest.reduce((s, d) => s + d.amount, 0);
  top.push({ category: `Others (${rest.length})`, amount: othersAmount });
  return top;
}

/** Renders the empty-state placeholder inside a chart container. */
function renderChartEmpty(container, icon, message) {
  container.innerHTML = `
    <div class="ft-empty">
      <span class="ft-empty__icon material-symbols-outlined" aria-hidden="true">${icon}</span>
      <p class="ft-small ft-text-muted">${message}</p>
    </div>`;
}

/**
 * Creates a donut chart inside `container`.
 *
 * @returns {object|null} AG Charts instance (for later .destroy()) or null if empty.
 */
function createDonutChart(container, data, { totalLabel, totalValue, emptyIcon, emptyMessage, fills }) {
  if (!data || data.length === 0) {
    renderChartEmpty(container, emptyIcon || 'donut_small', emptyMessage || 'No data.');
    return null;
  }

  const chartData = aggregateSlices(data);
  const mc = totalValue; // pre-formatted string

  /* global agCharts */
  return agCharts.AgCharts.create({
    container,
    data: chartData,
    theme: getChartTheme(fills),
    series: [{
      type: 'donut',
      angleKey: 'amount',
      calloutLabelKey: 'category',
      innerRadiusRatio: 0.6,
      innerLabels: [
        { text: mc, fontSize: 15, fontWeight: 'bold', color: '#e0e0e0' },
        { text: totalLabel, fontSize: 10, color: '#999' },
      ],
    }],
  });
}

/* ═══════════════════════════════════════════════════════════════
   1. STATS CARDS
   ═══════════════════════════════════════════════════════════════ */

/**
 * Renders the overview stats cards row.
 *
 * @param {HTMLElement} container — #widget-stats-row
 * @param {object} data
 */
export function renderStatsCards(container, { monthMovements, mainCurrency, rates = {} }) {
  if (!container) return;
  container.innerHTML = '';

  const mc = normalizeCurrency(mainCurrency);

  let totalIncome = 0;
  let totalExpenses = 0;
  let movementCount = 0;
  let categorySet = new Set();

  for (const mov of monthMovements) {
    if (isTransfer(mov)) continue;
    const rawCents = Math.abs(Number(mov.value ?? 0));
    const converted = toMainCurrency(rawCents, mov.currency, mc, rates);
    if (mov.type === 'Income') {
      totalIncome += converted;
    } else {
      totalExpenses += converted;
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

/* ═══════════════════════════════════════════════════════════════
   2. DONUT CHARTS — BREAKDOWNS
   ═══════════════════════════════════════════════════════════════ */

/**
 * Renders a donut chart showing expenses grouped by category.
 *
 * @returns {object|null} chart instance
 */
export function renderExpenseCategoryChart(container, { monthMovements, mainCurrency, rates = {} }) {
  if (!container) return null;
  const mc = normalizeCurrency(mainCurrency);

  const grouped = {};
  for (const mov of monthMovements) {
    if (mov.type === 'Income' || isTransfer(mov)) continue;
    const key = mov.category || 'Uncategorized';
    const rawCents = Math.abs(Number(mov.value ?? 0));
    grouped[key] = (grouped[key] ?? 0) + toMainCurrency(rawCents, mov.currency, mc, rates);
  }

  const data = Object.entries(grouped)
    .map(([category, cents]) => ({ category, amount: cents / 100 }));
  const totalCents = Object.values(grouped).reduce((s, v) => s + v, 0);

  return createDonutChart(container, data, {
    totalLabel: 'Total Expenses',
    totalValue: formatMoneyFromCents(totalCents, mc),
    emptyIcon: 'donut_small',
    emptyMessage: 'No expenses this month.',
  });
}

/**
 * Renders a donut chart showing income grouped by category.
 *
 * @returns {object|null} chart instance
 */
export function renderIncomeCategoryChart(container, { monthMovements, mainCurrency, rates = {} }) {
  if (!container) return null;
  const mc = normalizeCurrency(mainCurrency);

  const grouped = {};
  for (const mov of monthMovements) {
    if (mov.type !== 'Income' || isTransfer(mov)) continue;
    const key = mov.category || 'Uncategorized';
    const rawCents = Math.abs(Number(mov.value ?? 0));
    grouped[key] = (grouped[key] ?? 0) + toMainCurrency(rawCents, mov.currency, mc, rates);
  }

  const data = Object.entries(grouped)
    .map(([category, cents]) => ({ category, amount: cents / 100 }));
  const totalCents = Object.values(grouped).reduce((s, v) => s + v, 0);

  return createDonutChart(container, data, {
    totalLabel: 'Total Income',
    totalValue: formatMoneyFromCents(totalCents, mc),
    emptyIcon: 'trending_up',
    emptyMessage: 'No income this month.',
  });
}

/**
 * Renders a donut chart comparing total income vs total expenses.
 * Uses green for income and red for expenses with net flow in the center.
 *
 * @returns {object|null} chart instance
 */
export function renderIncomeVsExpenseChart(container, { monthMovements, mainCurrency, rates = {} }) {
  if (!container) return null;
  const mc = normalizeCurrency(mainCurrency);

  let income = 0;
  let expenses = 0;

  for (const mov of monthMovements) {
    if (isTransfer(mov)) continue;
    const rawCents = Math.abs(Number(mov.value ?? 0));
    const converted = toMainCurrency(rawCents, mov.currency, mc, rates);
    if (mov.type === 'Income') income += converted;
    else expenses += converted;
  }

  if (income === 0 && expenses === 0) {
    renderChartEmpty(container, 'balance', 'No movements this month.');
    return null;
  }

  const netCents = income - expenses;
  const netColor = netCents >= 0 ? '#66bb6a' : '#ef5350';

  return createDonutChart(container, [
    { category: 'Income', amount: income / 100 },
    { category: 'Expenses', amount: expenses / 100 },
  ], {
    totalLabel: 'Net Flow',
    totalValue: formatMoneyFromCents(Math.abs(netCents), mc),
    emptyIcon: 'balance',
    emptyMessage: 'No movements this month.',
    fills: ['#66bb6a', '#ef5350'],
  });
}
