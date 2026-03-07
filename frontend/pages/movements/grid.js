/**
 * Movements grid — AG Grid with checkbox selection, converted amount column,
 * and external code-filter support. No inline actions (handled by toolbar).
 */
import {
  dateCellRenderer,
  moneyCentsCellRenderer,
  accountCellRenderer,
  typeBadgeRenderer,
  convertedAmountRenderer,
} from '../../utils/gridRenderers.js';

/* ── Column Definitions ───────────────────────────────────── */

/**
 * @param {object}  rates          — FX rates keyed by currency code
 * @param {string}  targetCurrency — app main currency (e.g. 'USD')
 */
function buildColumnDefs(rates, targetCurrency) {
  return [
    {
      colId: '__select',
      headerName: '',
      width: 46,
      minWidth: 46,
      maxWidth: 46,
      sortable: false,
      filter: false,
      resizable: false,
      checkboxSelection: true,
      headerCheckboxSelection: true,
    },
    {
      headerName: 'Date',
      field: 'date',
      width: 115,
      sort: 'desc',
      cellRenderer: dateCellRenderer,
    },
    {
      headerName: 'Movement',
      field: 'movement',
      flex: 2,
      minWidth: 150,
    },
    {
      headerName: 'Account',
      field: 'account',
      flex: 1,
      minWidth: 120,
      cellRenderer: accountCellRenderer('account', 'currency'),
    },
    {
      headerName: 'Type',
      field: 'type',
      width: 85,
      cellRenderer: typeBadgeRenderer,
    },
    {
      headerName: 'Amount',
      field: 'value',
      width: 150,
      headerClass: 'ft-ag-header-right',
      cellRenderer: moneyCentsCellRenderer('value', 'currency'),
      cellStyle: { textAlign: 'right' },
    },
    {
      headerName: 'Converted',
      field: 'value',
      colId: 'converted',
      width: 150,
      headerClass: 'ft-ag-header-right',
      cellRenderer: convertedAmountRenderer('value', 'currency', rates, targetCurrency),
      cellStyle: { textAlign: 'right' },
    },
    {
      headerName: 'Category',
      field: 'category',
      flex: 1,
      minWidth: 100,
    },
    {
      headerName: 'Sub-category',
      field: 'sub_category',
      flex: 1,
      minWidth: 100,
    },
  ];
}

/* ── Mount ────────────────────────────────────────────────── */

/**
 * Creates the AG Grid instance inside `hostEl`.
 *
 * @param {HTMLElement} hostEl — grid container
 * @param {object}      state  — shared page state (mutated: .gridApi)
 * @param {object}      opts
 * @param {Function}    opts.getGridTheme
 * @param {object}      opts.rates           — FX rates
 * @param {string}      opts.targetCurrency  — main currency
 * @param {Function}    opts.onSelectionChanged — called with selected rows array
 */
export function mountGrid(hostEl, state, { getGridTheme, rates, targetCurrency, onSelectionChanged }) {
  const gridOptions = {
    theme: getGridTheme(),
    columnDefs: buildColumnDefs(rates, targetCurrency),
    rowData: state.movements,
    getRowId: p => String(p.data.id),
    domLayout: 'normal',
    suppressCellFocus: true,
    animateRows: true,
    rowSelection: 'multiple',
    pagination: true,
    paginationPageSize: 50,
    paginationPageSizeSelector: [25, 50, 100],
    defaultColDef: {
      sortable: true,
      resizable: true,
    },
    isExternalFilterPresent: () => !!state.codeFilter,
    doesExternalFilterPass: node => node.data.movement_code === state.codeFilter,
    getRowClass: params => params.data?.active === 0 ? 'ft-row-inactive' : '',
    overlayNoRowsTemplate:
      '<span class="ft-small ft-text-muted">No movements found</span>',
    onSelectionChanged: () => {
      const selected = state.gridApi.getSelectedRows();
      onSelectionChanged?.(selected);
    },
  };

  state.gridApi = agGrid.createGrid(hostEl, gridOptions);
}

/** Replace grid data in-place. */
export function refreshGridData(state, movements) {
  state.movements = movements;
  state.gridApi?.setGridOption('rowData', movements);
}

/** Trigger external filter re-evaluation. */
export function applyExternalFilter(state) {
  state.gridApi?.onFilterChanged();
}
