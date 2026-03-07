/**
 * Movements grid — AG Grid with checkbox selection, converted amount column,
 * and external code-filter support. No inline actions (handled by toolbar).
 */
import { buildGridOptions } from '../../utils/gridHelper.js';
import { buildMovementColumnDefs } from '../../utils/movementColumns.js';

/* ── Mount ────────────────────────────────────────────────── */

/**
 * Creates the AG Grid instance inside `hostEl`.
 *
 * @param {HTMLElement} hostEl — grid container
 * @param {object}      state  — shared page state (mutated: .gridApi)
 * @param {object}      opts
 * @param {object}      opts.rates           — FX rates
 * @param {string}      opts.targetCurrency  — main currency
 * @param {Function}    opts.onEdit          — called with a single row object to edit
 * @param {Function}    opts.onDelete        — called with a single row object to delete
 * @param {Function}    opts.onShowGroup     — called with movement_code string
 */
export function mountGrid(hostEl, state, { rates, targetCurrency, onEdit, onDelete, onShowGroup }) {
  const gridOptions = buildGridOptions({
    columnDefs: buildMovementColumnDefs(rates, targetCurrency),
    rowData: state.movements,
    getRowId: p => String(p.data.id),
    suppressCellFocus: true,
    pagination: true,
    paginationPageSize: 50,
    paginationPageSizeSelector: [25, 50, 100],
    isExternalFilterPresent: () => !!state.codeFilter,
    doesExternalFilterPass: node => node.data.movement_code === state.codeFilter,
    getRowClass: params => params.data?.active === 0 ? 'ft-row-inactive' : '',
    overlayNoRowsTemplate:
      '<span class="ft-small ft-text-muted">No movements found</span>',
    getContextMenuItems: params => {
      const row = params.node?.data;
      if (!row) return [];

      const items = [
        {
          name: 'Edit',
          icon: '<span class="material-symbols-outlined" style="font-size:14px;line-height:1;vertical-align:middle">edit</span>',
          action: () => onEdit?.(row),
        },
        {
          name: row.active === 0 ? 'Delete (already inactive)' : 'Delete',
          disabled: row.active === 0,
          icon: '<span class="material-symbols-outlined" style="font-size:14px;line-height:1;vertical-align:middle">delete</span>',
          action: () => onDelete?.(row),
        },
      ];

      if (row.movement_code) {
        items.push('separator', {
          name: 'Show Group',
          icon: '<span class="material-symbols-outlined" style="font-size:14px;line-height:1;vertical-align:middle">link</span>',
          action: () => onShowGroup?.(row.movement_code),
        });
      }

      return items;
    },
  });

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
