/**
 * Recent Movements grid widget for the dashboard.
 *
 * Renders the same column layout as the full Movements page but in
 * a read-only, non-paginated form showing the most recent entries.
 *
 * Columns (matching movements/grid.js):
 *   Date | Movement | Account | Type | Amount | Converted | Category | Sub-category
 *
 * The "Converted" column uses the FX rates fetched in actions.js so it
 * stays consistent with how the Movements page displays converted amounts.
 *
 * No checkbox selection, no toolbar, no pagination — dashboard is summary-only.
 */

import { createStandardGrid, ensureAgGridLoaded } from '../../utils/gridHelper.js';
import {
  dateCellRenderer,
  moneyCentsCellRenderer,
  accountCellRenderer,
  typeBadgeRenderer,
  convertedAmountRenderer,
  styledCategoryCellRenderer,
  styledSubCategoryCellRenderer,
} from '../../utils/gridRenderers.js';

/**
 * Builds column definitions that mirror the Movements page grid.
 *
 * @param {object} rates          — FX rates keyed by uppercase ISO code (base USD)
 * @param {string} targetCurrency — main currency code (e.g. 'USD')
 * @returns {Array}               AG Grid columnDefs
 */
function buildColumnDefs(rates, targetCurrency) {
  return [
    {
      headerName: 'Date',
      field: 'date',
      cellRenderer: dateCellRenderer,
      width: 115,
      sort: 'desc',
    },
    {
      headerName: 'Movement',
      field: 'movement',
      flex: 2,
      minWidth: 140,
    },
    {
      headerName: 'Account',
      field: 'account',
      cellRenderer: accountCellRenderer('account', 'currency'),
      flex: 1,
      minWidth: 120,
    },
    {
      headerName: 'Type',
      field: 'type',
      cellRenderer: typeBadgeRenderer,
      width: 85,
    },
    {
      headerName: 'Amount',
      field: 'value',
      cellRenderer: moneyCentsCellRenderer('value', 'currency'),
      width: 145,
      headerClass: 'ft-ag-header-right',
      cellStyle: { textAlign: 'right' },
    },
    {
      headerName: 'Converted',
      field: 'value',
      colId: 'converted',
      cellRenderer: convertedAmountRenderer('value', 'currency', rates, targetCurrency),
      width: 145,
      headerClass: 'ft-ag-header-right',
      cellStyle: { textAlign: 'right' },
    },
    {
      headerName: 'Category',
      field: 'category',
      cellRenderer: styledCategoryCellRenderer,
      flex: 1,
      minWidth: 100,
    },
    {
      headerName: 'Sub-category',
      field: 'sub_category',
      cellRenderer: styledSubCategoryCellRenderer,
      flex: 1,
      minWidth: 100,
    },
  ];
}

/**
 * Mounts the recent movements AG Grid into the dashboard.
 *
 * @param {HTMLElement} wrapper         — the #dashboard-movements container
 * @param {Array}       data            — pre-fetched recent movements (latest N)
 * @param {object}      rates           — FX rates from fetchDashboardData
 * @param {string}      targetCurrency  — user's main currency code
 * @returns {Promise<object|null>}      AG Grid API or null on failure/empty
 */
export async function mountRecentMovements(wrapper, data, rates, targetCurrency) {
  if (!wrapper) return null;

  try {
    await ensureAgGridLoaded();
  } catch {
    wrapper.innerHTML = `
      <div class="ft-empty">
        <span class="ft-empty__icon material-symbols-outlined" aria-hidden="true">grid_off</span>
        <p class="ft-small ft-text-muted">Failed to load grid library.</p>
      </div>`;
    return null;
  }

  if (!data || data.length === 0) {
    wrapper.innerHTML = `
      <div class="ft-empty">
        <span class="ft-empty__icon material-symbols-outlined" aria-hidden="true">receipt_long</span>
        <p class="ft-small ft-text-muted">No movements found.</p>
      </div>`;
    return null;
  }

  wrapper.innerHTML = '<div class="ft-dashboard__movements-grid ft-ag-grid" id="dashboard-movements-host"></div>';
  const hostEl = wrapper.querySelector('#dashboard-movements-host');

  return createStandardGrid(hostEl, {
    columnDefs: buildColumnDefs(rates, targetCurrency),
    rowData: data,
    defaultColDef: {
      suppressMovable: true,
    },
    overlayNoRowsTemplate: '<span class="ft-small ft-text-muted">No movements yet</span>',
  });
}
