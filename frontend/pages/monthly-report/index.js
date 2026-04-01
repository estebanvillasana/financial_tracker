/**
 * Monthly Report page bootstrap.
 *
 * Widget layout:
 *  - Header with month picker (defaults to previous month)
 *  - Overview stats cards (income, expenses, net flow, count)
 *  - Breakdowns — AG Charts donut charts (expenses by cat, income by cat, inc vs exp)
 *  - Top Movements — Top 10 Expenses + Top 10 Incomes grids
 *  - Accountant summary table (taxable rep. movements with totals)
 *  - Invoice tracker grid (movements linked to taxable items + invoice checkbox)
 */

import { getMainCurrency } from '../../appSettings.js';
import { FeedbackBanner } from '../../components/dumb/feedbackBanner/feedbackBanner.js';
import { FilterBar } from '../../components/dumb/filterBar/filterBar.js';
import { ensureAgGridLoaded } from '../../lib/agGridLoader.js';
import { ensureAgChartsLoaded } from '../../lib/agChartsLoader.js';

import {
  getPreviousMonth,
  getMonthLabel,
  fetchReportData,
} from './actions.js';

import {
  renderStatsCards,
  renderLoadingStats,
  renderExpenseCategoryChart,
  renderIncomeCategoryChart,
  renderIncomeVsExpenseChart,
} from './render.js';

import {
  buildAccountantRows,
  mountAccountantGrid,
  mountTopMovementsGrid,
  filterTaxableMovements,
  mountInvoiceGrid,
} from './grid.js';

/**
 * Initialises the Monthly Report page.
 *
 * @param {HTMLElement|Document} root — page root
 */
async function initMonthlyReportPage(root = document) {
  // ── DOM refs ──────────────────────────────────────────────────────────
  const subtitleEl       = root.querySelector('#report-subtitle');
  const monthPicker      = root.querySelector('#report-month-picker');
  const feedbackEl       = root.querySelector('#widget-report-feedback');
  const statsRow         = root.querySelector('#widget-stats-row');
  const chartExpenseCat  = root.querySelector('#chart-expense-categories');
  const chartIncomeCat   = root.querySelector('#chart-income-categories');
  const chartIncVsExp    = root.querySelector('#chart-income-vs-expense');
  const topExpensesHost  = root.querySelector('#widget-top-expenses-grid');
  const topIncomesHost   = root.querySelector('#widget-top-incomes-grid');
  const ownerFilterEl    = root.querySelector('#widget-owner-filter');
  const accountantHost   = root.querySelector('#widget-accountant-grid');
  const invoiceHost      = root.querySelector('#widget-invoice-grid');
  const exportCsvBtn     = root.querySelector('#btn-export-accountant-csv');

  if (!statsRow || !accountantHost || !invoiceHost) return;

  // ── Load AG Grid + AG Charts in parallel ─────────────────────────────
  try {
    await Promise.all([
      ensureAgGridLoaded(),
      ensureAgChartsLoaded(),
    ]);
  } catch (e) {
    return FeedbackBanner.render(feedbackEl, e?.message || 'Failed to load grid/chart libraries.');
  }

  // ── State ────────────────────────────────────────────────────────────
  const mainCurrency = getMainCurrency().toUpperCase();
  const prev = getPreviousMonth();
  const state = {
    year: prev.year,
    month: prev.month,
    ownerFilter: '',       // '' = all owners
    // Grid APIs
    accountantGridApi: null,
    invoiceGridApi: null,
    topExpensesGridApi: null,
    topIncomesGridApi: null,
    // Chart instances
    chartExpenseCat: null,
    chartIncomeCat: null,
    chartIncVsExp: null,
  };

  // ── CSV export ────────────────────────────────────────────────────────
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => {
      if (!state.accountantGridApi) return;
      const label = getMonthLabel(state.year, state.month).replace(/\s+/g, '-');
      state.accountantGridApi.exportDataAsCsv({
        fileName: `accountant-summary-${label}.csv`,
        processCellCallback: (params) => {
          if (params.column.getColId() === 'total_cents') {
            return (Number(params.value) / 100).toFixed(2);
          }
          return params.value;
        },
      });
    });
  }

  // ── Month picker setup ───────────────────────────────────────────────
  const pad = n => String(n).padStart(2, '0');
  monthPicker.value = `${state.year}-${pad(state.month + 1)}`;
  monthPicker.addEventListener('change', () => {
    const [y, m] = monthPicker.value.split('-').map(Number);
    if (!y || !m) return;
    state.year = y;
    state.month = m - 1; // convert to 0-indexed
    loadReport();
  });

  // ── Load & render report ─────────────────────────────────────────────
  async function loadReport() {
    // Show loading state
    subtitleEl.textContent = `Loading ${getMonthLabel(state.year, state.month)}…`;
    renderLoadingStats(statsRow);

    // Destroy existing grids
    for (const key of ['accountantGridApi', 'invoiceGridApi', 'topExpensesGridApi', 'topIncomesGridApi']) {
      if (state[key]) { state[key].destroy(); state[key] = null; }
    }
    accountantHost.innerHTML = '';
    invoiceHost.innerHTML = '';
    topExpensesHost.innerHTML = '';
    topIncomesHost.innerHTML = '';

    // Destroy existing charts
    for (const key of ['chartExpenseCat', 'chartIncomeCat', 'chartIncVsExp']) {
      if (state[key]) {
        try { state[key].destroy(); } catch (_) { /* safe fallback */ }
        state[key] = null;
      }
    }
    chartExpenseCat.innerHTML = '';
    chartIncomeCat.innerHTML = '';
    chartIncVsExp.innerHTML = '';

    let data;
    try {
      data = await fetchReportData(state.year, state.month);
    } catch (e) {
      return FeedbackBanner.render(feedbackEl, e?.message || 'Failed to load report data.');
    }

    // ── Owner filter setup ──────────────────────────────────────────
    const owners = [...new Set(
      data.monthMovements.map(m => m.owner).filter(Boolean)
    )].sort();

    state.ownerFilter = '';  // reset on month change
    _renderOwnerFilter(owners, data);

    // Update subtitle
    const label = getMonthLabel(state.year, state.month);
    subtitleEl.textContent = `Report for ${label} — ${data.monthMovements.length} movements`;

    // ── Stats + charts (always use full month data) ─────────────────
    const renderData = {
      monthMovements: data.monthMovements,
      mainCurrency,
      rates: data.rates,
    };

    renderStatsCards(statsRow, renderData);
    state.chartExpenseCat = renderExpenseCategoryChart(chartExpenseCat, renderData);
    state.chartIncomeCat  = renderIncomeCategoryChart(chartIncomeCat, renderData);
    state.chartIncVsExp   = renderIncomeVsExpenseChart(chartIncVsExp, renderData);

    // ── Top Movements grids (full data, not owner-filtered) ─────────
    state.topExpensesGridApi = await mountTopMovementsGrid(
      topExpensesHost, data.monthMovements, 'Expense', data.rates, mainCurrency,
    );
    state.topIncomesGridApi = await mountTopMovementsGrid(
      topIncomesHost, data.monthMovements, 'Income', data.rates, mainCurrency,
    );

    // ── Accountant + Invoice grids (owner-filtered) ─────────────────
    await _mountTaxGrids(data);

    // Store data for re-use when filter changes
    state._data = data;
  }

  /** Renders (or re-renders) the owner FilterBar. */
  function _renderOwnerFilter(owners, data) {
    if (!ownerFilterEl) return;

    const options = [
      { value: '', label: 'All owners' },
      ...owners.map(o => ({ value: o, label: o })),
    ];

    FilterBar.render(ownerFilterEl, {
      variant: 'bare',
      hideLabels: true,
      fields: [{
        id: 'owner',
        label: 'Account owner',
        type: 'select',
        value: state.ownerFilter,
        options,
      }],
    }, {
      onFilterChange: async (values) => {
        state.ownerFilter = values.owner;
        await _mountTaxGrids(state._data);
      },
    });
  }

  /** Builds and mounts the accountant + invoice grids, applying the owner filter. */
  async function _mountTaxGrids(data) {
    // Destroy previous instances
    if (state.accountantGridApi) { state.accountantGridApi.destroy(); state.accountantGridApi = null; }
    if (state.invoiceGridApi)    { state.invoiceGridApi.destroy();    state.invoiceGridApi    = null; }
    accountantHost.innerHTML = '';
    invoiceHost.innerHTML    = '';

    const filtered = state.ownerFilter
      ? data.monthMovements.filter(m => m.owner === state.ownerFilter)
      : data.monthMovements;

    const accountantRows = buildAccountantRows(
      filtered, data.taxableRepMovements, data.rates, mainCurrency,
    );
    state.accountantGridApi = await mountAccountantGrid(accountantHost, accountantRows, mainCurrency);

    const taxableMovements = filterTaxableMovements(filtered, data.taxableRepMovements);
    state.invoiceGridApi = await mountInvoiceGrid(invoiceHost, taxableMovements, data.rates, mainCurrency);
  }

  // Initial load
  await loadReport();
}

export { initMonthlyReportPage };
