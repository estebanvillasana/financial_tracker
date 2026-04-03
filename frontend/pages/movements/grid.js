/**
 * Movements grid — AG Grid with cell-range selection, converted amount column,
 * balance column, and external code filter support.
 */
import { buildGridOptions } from '../../utils/gridHelper.js';
import { buildMovementColumnDefs, getConvertedCents } from '../../utils/movementColumns.js';
import { formatMoneyFromCents, normalizeCurrency } from '../../utils/formatters.js';

function createConvertedSumStatusPanel(rates, targetCurrency) {
  const targetCur = normalizeCurrency(targetCurrency);

  return class ConvertedSumStatusPanel {
    init(params) {
      this.params = params;
      this.eGui = document.createElement('div');
      this.eGui.className = 'ag-status-name-value ag-status-panel';
      this.eGui.innerHTML =
        '<span data-ref="eLabel">Converted Sum</span> :&nbsp;<span class="ag-status-name-value-value" data-ref="eValue">—</span>';
      this.eValue = this.eGui.querySelector('[data-ref="eValue"]');

      this.onModelUpdated = () => {
        let total = 0;
        let hasAny = false;

        this.params.api.forEachNodeAfterFilter(node => {
          const row = node.data;
          if (!row) return;

          const converted = getConvertedCents(row.value, row.currency, rates, targetCur);
          if (converted == null) return;

          hasAny = true;
          total += row.type === 'Expense' ? -converted : converted;
        });

        this.eValue.textContent = hasAny
          ? formatMoneyFromCents(total, targetCur)
          : '—';
      };

      this.params.api.addEventListener('modelUpdated', this.onModelUpdated);
      this.onModelUpdated();
    }

    getGui() {
      return this.eGui;
    }

    destroy() {
      this.params?.api?.removeEventListener('modelUpdated', this.onModelUpdated);
    }
  };
}

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
 * @param {Function}    opts.onDuplicate     — called with one or more row objects to duplicate
 * @param {Function}    opts.onShowGroup     — called with movement_code string
 */
export function mountGrid(hostEl, state, { rates, targetCurrency, onEdit, onDelete, onRestore, onDuplicate, onBulkRestore, onShowGroup }) {
  const ConvertedSumStatusPanel = createConvertedSumStatusPanel(rates, targetCurrency);

  const gridOptions = buildGridOptions({
    components: {
      convertedSumStatusPanel: ConvertedSumStatusPanel,
    },
    columnDefs: buildMovementColumnDefs(rates, targetCurrency),
    rowData: state.movements,
    getRowId: p => String(p.data.id),
    cellSelection: true,
    suppressCellFocus: false,
    rowSelection: {
      mode: 'multiRow',
      checkboxes: true,
      headerCheckbox: true,
      selectAll: 'filtered',
      enableClickSelection: false,
    },
    selectionColumnDef: {
      pinned: 'left',
      width: 52,
      minWidth: 52,
      maxWidth: 52,
      resizable: false,
      sortable: false,
      suppressHeaderMenuButton: true,
      suppressMovable: true,
    },
    pagination: true,
    paginationPageSize: 50,
    paginationPageSizeSelector: [25, 50, 100],
    statusBar: {
      statusPanels: [
        {
          statusPanel: 'agTotalAndFilteredRowCountComponent',
          align: 'left',
        },
        {
          statusPanel: 'convertedSumStatusPanel',
          align: 'right',
        },
      ],
    },
    isExternalFilterPresent: () => (
      !!state.codeFilter ||
      state.noRepetitiveFilter ||
      state.hasRepetitiveFilter ||
      !!state.moneyTransfersFilter
    ),
    doesExternalFilterPass: node => {
      const code = String(node.data?.movement_code ?? '').toUpperCase();
      const isMoneyTransfer = code.startsWith('MT');

      if (state.codeFilter && node.data.movement_code !== state.codeFilter) return false;
      if (state.noRepetitiveFilter && node.data.repetitive_movement_id != null) return false;
      if (state.hasRepetitiveFilter && node.data.repetitive_movement_id == null) return false;
      if (state.moneyTransfersFilter === 'exclude' && isMoneyTransfer) return false;
      if (state.moneyTransfersFilter === 'only' && !isMoneyTransfer) return false;
      return true;
    },
    getRowClass: params => params.data?.active === 0 ? 'ft-row-inactive' : '',
    overlayNoRowsTemplate:
      '<span class="ft-small ft-text-muted">No movements found</span>',
    getContextMenuItems: params => {
      const row = params.node?.data;
      if (!row) return [];

      const selected = getContextSelectedRows(params);
      const hasMultiSelection = selected.length > 1;

      const items = [];

      // Bulk actions when multiple rows are selected
      if (hasMultiSelection) {
        items.push({
          name: `Duplicate ${selected.length} selected`,
          icon: '<span class="material-symbols-outlined" style="font-size:14px;line-height:1;vertical-align:middle">content_copy</span>',
          action: () => onDuplicate?.(selected),
        });

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
        name: 'Duplicate to Drafts',
        icon: '<span class="material-symbols-outlined" style="font-size:14px;line-height:1;vertical-align:middle">content_copy</span>',
        action: () => onDuplicate?.([row]),
      });

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
      if (typeof params.api.deselectAll === 'function') params.api.deselectAll();
      params.api.clearFocusedCell();
    },
  });

  state.gridApi = agGrid.createGrid(hostEl, gridOptions);
}

function getContextSelectedRows(params) {
  const row = params.node?.data;
  if (!row) return [];

  const selectedRows = typeof params.api?.getSelectedRows === 'function'
    ? params.api.getSelectedRows()
    : [];

  if (!selectedRows.length) return [row];

  const clickedRowId = String(row.id);
  const clickedRowIsSelected = selectedRows.some(item => String(item?.id) === clickedRowId);

  return clickedRowIsSelected ? selectedRows : [row];
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
