/**
 * Monthly Report page bootstrap.
 *
 * Widget layout:
 *  - Header with month picker (defaults to previous month)
 *  - Overview stats cards (income, expenses, net flow, count)
 *  - Spending breakdowns (by category, subcategory, income vs expenses)
 *  - Accountant summary table (taxable rep. movements with totals)
 *  - Invoice tracker grid (movements linked to taxable items + invoice checkbox)
 */

import { finalAppConfig } from '../../defaults.js';
import { FeedbackBanner } from '../../components/dumb/feedbackBanner/feedbackBanner.js';
import { ensureAgGridLoaded } from '../../lib/agGridLoader.js';

import {
  getPreviousMonth,
  getMonthLabel,
  fetchReportData,
} from './actions.js';

import {
  renderStatsCards,
  renderLoadingStats,
  renderCategoryBreakdown,
  renderSubCategoryBreakdown,
  renderIncomeVsExpenses,
} from './render.js';

import {
  buildAccountantRows,
  mountAccountantGrid,
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
  const catContent       = root.querySelector('#breakdown-categories-content');
  const subCatContent    = root.querySelector('#breakdown-subcategories-content');
  const incExpContent    = root.querySelector('#breakdown-income-expense-content');
  const accountantHost   = root.querySelector('#widget-accountant-grid');
  const invoiceHost      = root.querySelector('#widget-invoice-grid');
  const exportCsvBtn     = root.querySelector('#btn-export-accountant-csv');

  if (!statsRow || !accountantHost || !invoiceHost) return;

  // ── Load AG Grid ─────────────────────────────────────────────────────
  try {
    await ensureAgGridLoaded();
  } catch (e) {
    return FeedbackBanner.render(feedbackEl, e?.message || 'Failed to load grid library.');
  }

  // ── State ────────────────────────────────────────────────────────────
  const mainCurrency = (finalAppConfig.currency || 'usd').toUpperCase();
  const prev = getPreviousMonth();
  const state = {
    year: prev.year,
    month: prev.month,
    accountantGridApi: null,
    invoiceGridApi: null,
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
    if (state.accountantGridApi) {
      state.accountantGridApi.destroy();
      state.accountantGridApi = null;
    }
    if (state.invoiceGridApi) {
      state.invoiceGridApi.destroy();
      state.invoiceGridApi = null;
    }
    accountantHost.innerHTML = '';
    invoiceHost.innerHTML = '';

    let data;
    try {
      data = await fetchReportData(state.year, state.month);
    } catch (e) {
      return FeedbackBanner.render(feedbackEl, e?.message || 'Failed to load report data.');
    }

    const renderData = {
      monthMovements: data.monthMovements,
      mainCurrency,
      rates: data.rates,
    };

    // Update subtitle
    const label = getMonthLabel(state.year, state.month);
    subtitleEl.textContent = `Report for ${label} — ${data.monthMovements.length} movements`;

    // ── Stats cards ─────────────────────────────────────────────────
    renderStatsCards(statsRow, renderData);

    // ── Breakdowns ──────────────────────────────────────────────────
    renderCategoryBreakdown(catContent, renderData);
    renderSubCategoryBreakdown(subCatContent, renderData);
    renderIncomeVsExpenses(incExpContent, renderData);

    // ── Accountant summary grid ─────────────────────────────────────
    const accountantRows = buildAccountantRows(
      data.monthMovements,
      data.taxableRepMovements,
      data.rates,
      mainCurrency,
    );

    state.accountantGridApi = await mountAccountantGrid(
      accountantHost,
      accountantRows,
      mainCurrency,
    );

    // ── Invoice tracker grid ────────────────────────────────────────
    const taxableMovements = filterTaxableMovements(
      data.monthMovements,
      data.taxableRepMovements,
    );

    state.invoiceGridApi = await mountInvoiceGrid(
      invoiceHost,
      taxableMovements,
      data.rates,
      mainCurrency,
    );
  }

  // Initial load
  await loadReport();
}

export { initMonthlyReportPage };
