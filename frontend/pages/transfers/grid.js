/**
 * Transfers grid — AG Grid column definitions and mount.
 * Uses shared cell renderers from utils/gridRenderers.js.
 */
import {
  dateCellRenderer,
  moneyCentsCellRenderer,
  accountCellRenderer,
} from '../../utils/gridRenderers.js';
import { buildGridOptions } from '../../utils/gridHelper.js';

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
      headerName: 'From',
      field: 'send_account_name',
      flex: 1,
      minWidth: 150,
      cellRenderer: accountCellRenderer('send_account_name', 'send_currency'),
    },
    {
      headerName: 'Sent',
      field: 'sent_value',
      width: 140,
      headerClass: 'ft-ag-header-right',
      cellRenderer: moneyCentsCellRenderer('sent_value', 'send_currency'),
      cellStyle: { textAlign: 'right' },
    },
    {
      headerName: '',
      width: 36,
      maxWidth: 36,
      sortable: false,
      filter: false,
      resizable: false,
      cellRenderer: () => '<span class="ft-transfer-arrow material-symbols-outlined">east</span>',
      cellClass: 'ft-transfer-arrow-cell',
    },
    {
      headerName: 'To',
      field: 'receive_account_name',
      flex: 1,
      minWidth: 150,
      cellRenderer: accountCellRenderer('receive_account_name', 'receive_currency'),
    },
    {
      headerName: 'Received',
      field: 'received_value',
      width: 140,
      headerClass: 'ft-ag-header-right',
      cellRenderer: moneyCentsCellRenderer('received_value', 'receive_currency'),
      cellStyle: { textAlign: 'right' },
    },
    {
      headerName: 'Description',
      field: 'description',
      flex: 1,
      minWidth: 100,
      cellStyle: { color: 'var(--ft-color-text-muted)' },
    },
  ];
}

/* ── Mount ────────────────────────────────────────────────── */

export function mountGrid(hostEl, state, { onEdit, onDelete }) {
  const gridOptions = buildGridOptions({
    columnDefs: buildColumnDefs(),
    rowData: state.transfers,
    getRowId: p => p.data.movement_code,
    cellSelection: true,
    suppressCellFocus: false,
    overlayNoRowsTemplate:
      '<span class="ft-small ft-text-muted">No transfers found</span>',
    getContextMenuItems: params => {
      const row = params.node?.data;
      if (!row) return [];

      const selected = getRangeSelectedRows(params.api);
      const hasMultiSelection = selected.length > 1;
      const items = [];

      if (hasMultiSelection) {
        items.push({
          name: `Delete ${selected.length} selected`,
          icon: '<span class="material-symbols-outlined" style="font-size:14px;line-height:1;vertical-align:middle">delete</span>',
          action: () => onDelete?.(selected),
        });
        items.push('separator');
      }

      items.push({
        name: 'Edit',
        icon: '<span class="material-symbols-outlined" style="font-size:14px;line-height:1;vertical-align:middle">edit</span>',
        action: () => onEdit?.(row),
      });
      items.push({
        name: 'Delete',
        icon: '<span class="material-symbols-outlined" style="font-size:14px;line-height:1;vertical-align:middle">delete</span>',
        action: () => onDelete?.(row),
      });

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

export function refreshGridData(state, transfers) {
  state.transfers = transfers;
  state.gridApi?.setGridOption('rowData', transfers);
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
