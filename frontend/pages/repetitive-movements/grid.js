/**
 * grid.js — AG Grid setup for the Repetitive Movements page.
 *
 * Uses the shared buildGridOptions helper and gridRenderers for consistent
 * styling with the rest of the app. Supports tab-based filtering
 * (all / subscriptions / tax) plus toolbar filters (type, show-deleted).
 */

import { buildGridOptions } from '../../utils/gridHelper.js';
import { typeBadgeRenderer, actionsCellRenderer } from '../../utils/gridRenderers.js';
import { escapeHtml } from '../../utils/formHelpers.js';

/* ── Column defs ──────────────────────────────────────── */

function _getColumnDefs(callbacks) {
  return [
    {
      headerName: 'Movement',
      field: 'movement',
      flex: 2,
      minWidth: 180,
      cellRenderer: params => {
        const d = params.data;
        if (!d) return '';
        const desc = d.description
          ? `<span class="ft-grid-sub ft-small ft-text-muted">${escapeHtml(d.description)}</span>`
          : '';
        return `<div class="ft-grid-cell-multi"><span>${escapeHtml(d.movement)}</span>${desc}</div>`;
      },
    },
    {
      headerName: 'Type',
      field: 'type',
      width: 100,
      cellRenderer: typeBadgeRenderer,
    },
    {
      headerName: 'Tax',
      field: 'tax_report',
      width: 100,
      cellRenderer: params => {
        const val = Number(params.value);
        if (val === 1) {
          return '<span class="ft-grid-badge ft-grid-badge--tax"><span class="material-symbols-outlined ft-grid-badge__icon" aria-hidden="true">receipt_long</span>Taxable</span>';
        }
        return '<span class="ft-text-muted">—</span>';
      },
    },
    {
      headerName: 'Subscription',
      field: 'active_subscription',
      width: 130,
      cellRenderer: params => {
        const val = params.value;
        if (val === null || val === undefined) return '<span class="ft-text-muted">—</span>';
        if (Number(val) === 1) {
          return '<span class="ft-grid-badge ft-grid-badge--sub-active"><span class="material-symbols-outlined ft-grid-badge__icon" aria-hidden="true">check_circle</span>Active</span>';
        }
        return '<span class="ft-grid-badge ft-grid-badge--sub-cancelled"><span class="material-symbols-outlined ft-grid-badge__icon" aria-hidden="true">cancel</span>Cancelled</span>';
      },
    },
    {
      headerName: 'Movements',
      field: 'movements_count',
      width: 110,
      type: 'numericColumn',
      valueFormatter: params => {
        const n = Number(params.value);
        return Number.isFinite(n) ? n.toLocaleString('en-US') : '0';
      },
    },
    {
      headerName: 'Status',
      field: 'active',
      width: 90,
      cellRenderer: params => {
        const isActive = Number(params.value) === 1;
        const cls = isActive ? 'active' : 'inactive';
        const label = isActive ? 'Active' : 'Deleted';
        return `<span class="ft-grid-type ft-grid-type--${isActive ? 'income' : ''}" style="${isActive ? '' : 'background:var(--ft-color-surface-alt);color:var(--ft-color-text-muted);'}">${label}</span>`;
      },
    },
  ];
}

/* ── Grid mount ───────────────────────────────────────── */

export function mountGrid(container, state, callbacks) {
  const gridOptions = buildGridOptions({
    columnDefs: _getColumnDefs(callbacks),
    rowData: state.repetitiveMovements,
    getRowId: p => String(p.data.id),
    domLayout: 'autoHeight',
    rowHeight: 44,
    headerHeight: 38,
    animateRows: true,
    suppressCellFocus: true,
    isExternalFilterPresent: () => true,
    doesExternalFilterPass: node => {
      const d = node.data;
      if (!d) return false;

      // Show-deleted filter
      if (!state.showDeleted && Number(d.active) === 0) return false;

      // Tab filter
      if (state.activeTab === 'subscriptions') {
        if (d.active_subscription === null || d.active_subscription === undefined) return false;
      } else if (state.activeTab === 'tax') {
        if (Number(d.tax_report) !== 1) return false;
      }

      // Type filter (toolbar)
      if (state.typeFilter && d.type !== state.typeFilter) return false;

      return true;
    },
    getRowClass: params => {
      if (Number(params.data?.active) === 0) return 'ft-row-inactive';
      return '';
    },
    getContextMenuItems: params => {
      const row = params.node?.data;
      if (!row) return [];

      const items = [];
      const isActive = Number(row.active) === 1;
      const isSub = row.active_subscription !== null && row.active_subscription !== undefined;
      const subActive = Number(row.active_subscription) === 1;

      items.push({
        name: 'Edit',
        icon: '<span class="material-symbols-outlined" style="font-size:14px;line-height:1;vertical-align:middle">edit</span>',
        action: () => callbacks.onEdit?.(row),
      });

      items.push({
        name: 'Use as Template',
        icon: '<span class="material-symbols-outlined" style="font-size:14px;line-height:1;vertical-align:middle">content_copy</span>',
        action: () => callbacks.onUseAsTemplate?.(row),
      });

      if (isSub && isActive) {
        items.push('separator');
        items.push({
          name: subActive ? 'Cancel Subscription' : 'Reactivate Subscription',
          icon: `<span class="material-symbols-outlined" style="font-size:14px;line-height:1;vertical-align:middle">${subActive ? 'cancel' : 'check_circle'}</span>`,
          action: () => callbacks.onToggleSubscription?.(row),
        });
      }

      items.push('separator');

      if (isActive) {
        items.push({
          name: 'Delete',
          icon: '<span class="material-symbols-outlined" style="font-size:14px;line-height:1;vertical-align:middle">delete</span>',
          action: () => callbacks.onDelete?.(row),
        });
      } else {
        items.push({
          name: 'Restore',
          icon: '<span class="material-symbols-outlined" style="font-size:14px;line-height:1;vertical-align:middle">restore</span>',
          action: () => callbacks.onRestore?.(row),
        });
      }

      return items;
    },
    overlayNoRowsTemplate:
      '<span class="ft-small ft-text-muted">No repetitive movements found</span>',
  });

  state.gridApi = agGrid.createGrid(container, gridOptions);
}

export function refreshGridData(state, data) {
  state.repetitiveMovements = data;
  state.gridApi?.setGridOption('rowData', data);
}

export function applyExternalFilter(state) {
  state.gridApi?.onFilterChanged();
}
