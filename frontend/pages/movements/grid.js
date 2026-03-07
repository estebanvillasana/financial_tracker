/**
 * Movements grid — AG Grid column definitions, mount, and data refresh.
 * Uses shared cell renderers from utils/gridRenderers.js.
 */
import {
  dateCellRenderer,
  moneyCentsCellRenderer,
  accountCellRenderer,
  typeBadgeRenderer,
  categoryCellRenderer,
  movementCodeRenderer,
  actionsCellRenderer,
} from '../../utils/gridRenderers.js';

/* ── Action Button Definitions ────────────────────────────── */

const MOVEMENT_ACTIONS = [
  { id: 'edit', icon: 'edit', title: 'Edit' },
  { id: 'delete', icon: 'delete', title: 'Soft-delete', variant: 'danger' },
];

/* ── Column Definitions ───────────────────────────────────── */

function buildColumnDefs() {
  return [
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
      width: 90,
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
      headerName: 'Category',
      field: 'category',
      flex: 1,
      minWidth: 120,
      cellRenderer: categoryCellRenderer,
    },
    {
      headerName: 'Code',
      field: 'movement_code',
      width: 165,
      cellRenderer: movementCodeRenderer,
    },
    {
      headerName: '',
      width: 76,
      maxWidth: 76,
      sortable: false,
      filter: false,
      resizable: false,
      cellRenderer: actionsCellRenderer(MOVEMENT_ACTIONS),
    },
  ];
}

/* ── Mount ────────────────────────────────────────────────── */

/**
 * Creates the AG Grid instance inside `hostEl`.
 *
 * @param {HTMLElement} hostEl  — grid container
 * @param {object}      state   — shared page state (mutated: .gridApi, .movements)
 * @param {object}      opts
 * @param {Function}    opts.getGridTheme
 * @param {Function}    opts.onEdit          — called with row data
 * @param {Function}    opts.onDelete        — called with row data
 * @param {Function}    opts.onFilterCode    — called with movement_code string
 */
export function mountGrid(hostEl, state, { getGridTheme, onEdit, onDelete, onFilterCode }) {
  const gridOptions = {
    theme: getGridTheme(),
    columnDefs: buildColumnDefs(),
    rowData: state.movements,
    getRowId: p => String(p.data.id),
    domLayout: 'normal',
    suppressCellFocus: true,
    animateRows: true,
    pagination: true,
    paginationPageSize: 50,
    paginationPageSizeSelector: [25, 50, 100],
    defaultColDef: {
      sortable: true,
      resizable: true,
    },
    /* External filter for movement_code grouping */
    isExternalFilterPresent: () => !!state.codeFilter,
    doesExternalFilterPass: node => node.data.movement_code === state.codeFilter,
    getRowClass: params => params.data?.active === 0 ? 'ft-row-inactive' : '',
    overlayNoRowsTemplate:
      '<span class="ft-small ft-text-muted">No movements found</span>',
    onCellClicked: params => {
      const btn = params.event?.target?.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'edit') onEdit(params.data);
      if (action === 'delete') onDelete(params.data);
      if (action === 'filter-code') onFilterCode(params.data.movement_code);
    },
  };

  state.gridApi = agGrid.createGrid(hostEl, gridOptions);
}

/** Replace grid data in-place. */
export function refreshGridData(state, movements) {
  state.movements = movements;
  state.gridApi?.setGridOption('rowData', movements);
}

/** Trigger external filter re-evaluation (after codeFilter changes). */
export function applyExternalFilter(state) {
  state.gridApi?.onFilterChanged();
}
