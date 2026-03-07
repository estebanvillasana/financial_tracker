/**
 * Movements grid — AG Grid with cell-range selection, converted amount column,
 * balance column, and external code filter support.
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
 * @param {Function}    opts.onRestore       — called with a single row object to restore
 * @param {Function}    opts.onShowGroup     — called with movement_code string
 */
export function mountGrid(hostEl, state, { rates, targetCurrency, onEdit, onDelete, onRestore, onBulkRestore, onShowGroup }) {
  const gridOptions = buildGridOptions({
    columnDefs: buildMovementColumnDefs(rates, targetCurrency),
    rowData: state.movements,
    getRowId: p => String(p.data.id),
    cellSelection: true,
    suppressCellFocus: false,
    pagination: true,
    paginationPageSize: 50,
    paginationPageSizeSelector: [25, 50, 100],
    isExternalFilterPresent: () => !!state.codeFilter || state.noRepetitiveFilter || state.hasRepetitiveFilter,
    doesExternalFilterPass: node => {
      if (state.codeFilter && node.data.movement_code !== state.codeFilter) return false;
      if (state.noRepetitiveFilter && node.data.repetitive_movement_id != null) return false;
      if (state.hasRepetitiveFilter && node.data.repetitive_movement_id == null) return false;
      return true;
    },
    getRowClass: params => params.data?.active === 0 ? 'ft-row-inactive' : '',
    overlayNoRowsTemplate:
      '<span class="ft-small ft-text-muted">No movements found</span>',
    getContextMenuItems: params => {
      const row = params.node?.data;
      if (!row) return [];

      const selected = getRangeSelectedRows(params.api);
      const hasMultiSelection = selected.length > 1;

      const items = [];

      // Bulk actions when multiple rows are selected
      if (hasMultiSelection) {
        const activeSelected = selected.filter(r => r.active === 1);
        const inactiveSelected = selected.filter(r => r.active === 0);

        if (activeSelected.length > 0) {
          items.push({
            name: `Delete ${activeSelected.length} selected`,
            icon: '<span class="material-symbols-outlined" style="font-size:14px;line-height:1;vertical-align:middle">delete</span>',
            action: () => onDelete?.(activeSelected),
          });
        }
        if (inactiveSelected.length > 0) {
          items.push({
            name: `Restore ${inactiveSelected.length} selected`,
            icon: '<span class="material-symbols-outlined" style="font-size:14px;line-height:1;vertical-align:middle">restore</span>',
            action: () => onBulkRestore?.(inactiveSelected),
          });
        }
        items.push('separator');
      }

      // Single-row actions
      items.push({
        name: 'Edit',
        icon: '<span class="material-symbols-outlined" style="font-size:14px;line-height:1;vertical-align:middle">edit</span>',
        action: () => onEdit?.(row),
      });

      if (row.active === 0) {
        items.push({
          name: 'Restore',
          icon: '<span class="material-symbols-outlined" style="font-size:14px;line-height:1;vertical-align:middle">restore</span>',
          action: () => onRestore?.(row),
        });
      } else {
        items.push({
          name: 'Delete',
          icon: '<span class="material-symbols-outlined" style="font-size:14px;line-height:1;vertical-align:middle">delete</span>',
          action: () => onDelete?.(row),
        });
      }

      if (row.movement_code) {
        items.push('separator', {
          name: 'Show Group',
          icon: '<span class="material-symbols-outlined" style="font-size:14px;line-height:1;vertical-align:middle">link</span>',
          action: () => onShowGroup?.(row.movement_code),
        });
      }

      return items;
    },
    onCellKeyDown: params => {
      if (params.event.key !== 'Escape') return;
      if (typeof params.api.clearCellSelection === 'function') params.api.clearCellSelection();
      else if (typeof params.api.clearRangeSelection === 'function') params.api.clearRangeSelection();
      params.api.clearFocusedCell();
    },
  });

  state.gridApi = agGrid.createGrid(hostEl, gridOptions);
}

function getRangeSelectedRows(api) {
  if (!api || typeof api.getCellRanges !== 'function') return [];
  const ranges = api.getCellRanges() || [];
  if (!ranges.length) return [];

  const selected = new Map();
  ranges.forEach(range => {
    const start = range.startRow?.rowIndex;
    const end = range.endRow?.rowIndex;
    if (start == null || end == null) return;
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    for (let i = lo; i <= hi; i += 1) {
      const node = api.getDisplayedRowAtIndex(i);
      if (node?.data) selected.set(node.id ?? String(i), node.data);
    }
  });

  return Array.from(selected.values());
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
