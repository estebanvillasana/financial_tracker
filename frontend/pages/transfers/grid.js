/**
 * Transfers grid — AG Grid column definitions and mount.
 * Uses shared cell renderers from utils/gridRenderers.js.
 */
import {
  dateCellRenderer,
  moneyCentsCellRenderer,
  accountCellRenderer,
  actionsCellRenderer,
} from '../../utils/gridRenderers.js';
import { buildGridOptions } from '../../utils/gridHelper.js';

const TRANSFER_ACTIONS = [
  { id: 'edit', icon: 'edit', title: 'Edit' },
  { id: 'delete', icon: 'delete', title: 'Delete', variant: 'danger' },
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
    {
      headerName: '',
      width: 76,
      maxWidth: 76,
      sortable: false,
      filter: false,
      resizable: false,
      cellRenderer: actionsCellRenderer(TRANSFER_ACTIONS),
    },
  ];
}

/* ── Mount ────────────────────────────────────────────────── */

export function mountGrid(hostEl, state, { onEdit, onDelete }) {
  const gridOptions = buildGridOptions({
    columnDefs: buildColumnDefs(),
    rowData: state.transfers,
    getRowId: p => p.data.movement_code,
    overlayNoRowsTemplate:
      '<span class="ft-small ft-text-muted">No transfers found</span>',
    onCellClicked: params => {
      const btn = params.event?.target?.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'edit') onEdit(params.data);
      if (action === 'delete') onDelete(params.data);
    },
  });

  state.gridApi = agGrid.createGrid(hostEl, gridOptions);
}

export function refreshGridData(state, transfers) {
  state.transfers = transfers;
  state.gridApi?.setGridOption('rowData', transfers);
}
