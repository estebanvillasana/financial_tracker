/**
 * Add Movements AG Grid behavior module.
 *
 * Handles:
 * - column definitions with financial-style formatting,
 * - sentinel row commit logic (auto-promote on focus leave),
 * - custom DatePicker cell editor integration,
 * - row type visual indicator via data attribute,
 * - bulk paste insertion from clipboard,
 * - error cell highlighting for validation feedback.
 */
import {
  TYPE_VALUES,
  SENTINEL_ID,
  createDraftRow,
  createSentinelRow,
  isAddRow,
  hasUserData,
} from './constants.js';
import { parseNumberOrNull } from '../../utils/validators.js';
import {
  categoryLabelById,
  subCategoryLabelById,
  getCategoriesByType,
  getSubCategoriesForRow,
  parsePastedCellValue,
  parseDateToIso,
} from './utils.js';
import { DatePicker } from '../../components/dumb/datePicker/datePicker.js';
import { formatMoney } from '../../utils/formatters.js';
import { dateCellRenderer } from '../../utils/gridRenderers.js';
import { attachFillHandle } from './fillHandle.js';

const ERROR_CELL_CLASS = 'ft-add-cell--error';

function isEditingPopupTarget(target) {
  return target instanceof Element && Boolean(target.closest('.ag-popup, .ag-popup-editor'));
}

function isPopupEditorOpen() {
  return Boolean(document.querySelector('.ag-popup-editor'));
}

function isInlineEditorTarget(target) {
  if (!(target instanceof Element)) return false;
  if (target.closest('.ag-popup, .ag-popup-editor')) return false;
  return Boolean(target.closest('input, textarea, [contenteditable="true"], .ag-cell-inline-editing'));
}

/* ── Sentinel Row Logic ───────────────────────────────────────────────────── */

function commitSentinelRow(state) {
  if (!state.gridApi) return;
  const sentinelNode = state.gridApi.getRowNode(SENTINEL_ID);
  if (!sentinelNode) return;

  const sentinelData = sentinelNode.data || {};
  if (!hasUserData(sentinelData)) return;

  const { _id, _isAddRow, ...fields } = sentinelData;
  const committedRow = createDraftRow(state.draftType);
  Object.assign(committedRow, fields, {
    type: fields.type || state.draftType,
  });

  state.gridApi.applyTransaction({
    remove: [{ _id: SENTINEL_ID }],
    add: [committedRow, createSentinelRow(state.draftType)],
  });
}

function syncRowsFromGrid(state) {
  if (!state.gridApi) return;
  const rows = [];
  state.gridApi.forEachNode(node => {
    if (node?.data && !isAddRow(node.data)) rows.push(node.data);
  });
  state.rows = rows;
}

/* ── Error Cell Highlighting ──────────────────────────────────────────────── */

/**
 * Highlights specific cells with an error class for a given row.
 */
function highlightErrorCells(gridApi, rowId, fieldNames) {
  if (!gridApi || !fieldNames?.length) return;
  const rowNode = gridApi.getRowNode(rowId);
  if (!rowNode) return;

  const rowEl = document.querySelector(`[row-id="${rowNode.id}"]`);
  if (!rowEl) return;

  fieldNames.forEach(field => {
    const cellEl = rowEl.querySelector(`[col-id="${field}"]`);
    if (cellEl) cellEl.classList.add(ERROR_CELL_CLASS);
  });
}

/**
 * Clears all error highlights from the grid.
 */
function clearErrorHighlights(gridApi) {
  if (!gridApi) return;
  const gridEl = document.querySelector('.ft-add-movements-grid');
  if (!gridEl) return;
  gridEl.querySelectorAll(`.${ERROR_CELL_CLASS}`).forEach(el => el.classList.remove(ERROR_CELL_CLASS));
}

/* ── Cell Renderers ───────────────────────────────────────────────────────── */

function buildCategoryRenderer(state, kind) {
  return params => {
    const label = kind === 'category'
      ? categoryLabelById(state, params.value)
      : subCategoryLabelById(state, params.value);

    if (!label) {
      return '<span class="ft-add-cell-placeholder">Select\u2026</span>';
    }

    const type = params.data?.type || 'Expense';
    const colorClass = type === 'Income' ? 'ft-grid-cat--income' : 'ft-grid-cat--expense';
    const kindClass = kind === 'sub-category' ? ' ft-grid-cat--sub' : '';
    return `<span class="ft-grid-cat ${colorClass}${kindClass}"><span class="ft-grid-cat__bar"></span>${label}</span>`;
  };
}

function buildRepetitiveRenderer(state) {
  return params => {
    if (isAddRow(params.data)) return '';
    const id = params.value;
    if (!id) return '<span class="ft-add-cell-placeholder">None</span>';
    const match = state.repetitiveMovements?.find(rm => Number(rm.id) === Number(id));
    return match ? match.movement : '';
  };
}

/* ── Row Type Attribute ───────────────────────────────────────────────────── */

function applyRowTypeAttributes(api) {
  api.forEachNode(node => {
    if (!node.data) return;
    const rowEl = document.querySelector(`[row-id="${node.id}"]`);
    if (rowEl) {
      if (isAddRow(node.data)) {
        rowEl.removeAttribute('data-row-type');
      } else {
        rowEl.setAttribute('data-row-type', node.data.type || 'Expense');
      }
    }
  });
}

/* ── Grid Options Builder ─────────────────────────────────────────────────── */

function buildGridOptions(state, domRefs, handlers) {
  const DateCellEditor = DatePicker.createCellEditor();

  return {
    theme: handlers.getGridTheme(),
    rowData: [createSentinelRow(state.draftType)],
    cellSelection: true,
    suppressClickEdit: false,
    processDataFromClipboard: params => {
      const rows = Array.isArray(params?.data) ? [...params.data] : [];

      // Excel often includes a trailing blank row in clipboard payloads.
      // If not removed, AG Grid can clear the next row during paste.
      while (rows.length > 0) {
        const lastRow = rows[rows.length - 1];
        const isBlankRow = Array.isArray(lastRow)
          ? lastRow.every(cell => String(cell ?? '').trim() === '')
          : true;
        if (!isBlankRow) break;
        rows.pop();
      }

      return rows;
    },
    getRowId: params => params.data._id,
    getRowClass: params => (isAddRow(params.data) ? 'ag-row-add-phantom' : undefined),
    defaultColDef: {
      editable: params => !isAddRow(params.data),
      resizable: true,
      sortable: false,
      filter: false,
      flex: 1,
      minWidth: 120,
    },
    columnDefs: [
      /* ── Movement name ── */
      {
        field: 'movement',
        headerName: 'Movement',
        minWidth: 170,
        editable: true,
        cellRenderer: params => {
          if (isAddRow(params.data)) {
            return '<span class="ft-add-movement-cell ft-add-movement-cell--placeholder"><span>New movement\u2026</span></span>';
          }
          const text = String(params.value || '');
          return `<span class="ft-add-movement-cell"><span>${text}</span></span>`;
        },
      },

      /* ── Description ── */
      {
        field: 'description',
        headerName: 'Description',
        minWidth: 180,
        editable: true,
        cellEditor: 'agLargeTextCellEditor',
        cellEditorPopup: true,
      },

      /* ── Date ── */
      {
        field: 'date',
        headerName: 'Date',
        minWidth: 110,
        maxWidth: 140,
        flex: 0.6,
        editable: true,
        cellEditor: DateCellEditor,
        cellEditorPopup: true,
        cellRenderer: dateCellRenderer,
        valueParser: params => parseDateToIso(params.newValue) ?? params.newValue,
      },

      /* ── Amount ── */
      {
        field: 'amount',
        headerName: 'Amount',
        minWidth: 110,
        maxWidth: 160,
        flex: 0.7,
        editable: true,
        headerClass: 'ft-ag-header-right',
        cellStyle: { textAlign: 'right' },
        valueParser: params => {
          const raw = String(params.newValue ?? '').replace(/[^0-9.\-]/g, '');
          return parseNumberOrNull(raw);
        },
        valueFormatter: params => {
          const value = Number(params.value);
          if (!Number.isFinite(value)) return '';
          const acct = state.accounts.find(a => Number(a.id) === Number(state.selectedAccountId));
          return formatMoney(value, acct?.currency || 'USD');
        },
        cellRenderer: params => {
          if (isAddRow(params.data)) return '';
          const formatted = params.valueFormatted || '';
          return formatted ? `<span class="ft-add-amount-cell">${formatted}</span>` : '';
        },
      },

      /* ── Category ── */
      {
        field: 'category_id',
        headerName: 'Category',
        minWidth: 150,
        editable: true,
        singleClickEdit: true,
        valueFormatter: params => categoryLabelById(state, params.value),
        valueParser: params => parseNumberOrNull(params.newValue),
        cellRenderer: buildCategoryRenderer(state, 'category'),
        cellEditor: 'agRichSelectCellEditor',
        cellEditorParams: params => ({
          values: getCategoriesByType(state, params.data?.type).map(item => Number(item.id)),
          formatValue: value => categoryLabelById(state, value),
          searchType: 'matchAny',
          allowTyping: true,
          filterList: true,
          highlightMatch: true,
        }),
      },

      /* ── Sub-category ── */
      {
        field: 'sub_category_id',
        headerName: 'Sub-category',
        minWidth: 160,
        editable: true,
        singleClickEdit: true,
        valueFormatter: params => subCategoryLabelById(state, params.value),
        valueParser: params => parseNumberOrNull(params.newValue),
        cellRenderer: buildCategoryRenderer(state, 'sub-category'),
        cellEditor: 'agRichSelectCellEditor',
        cellEditorParams: params => ({
          values: getSubCategoriesForRow(state, params.data).map(item => Number(item.id)),
          formatValue: value => subCategoryLabelById(state, value),
          searchType: 'matchAny',
          allowTyping: true,
          filterList: true,
          highlightMatch: true,
        }),
      },

      /* ── Repetitive Movement ── */
      {
        field: 'repetitive_movement_id',
        headerName: 'Repetitive',
        minWidth: 140,
        editable: true,
        singleClickEdit: true,
        valueFormatter: params => {
          if (!params.value) return '';
          const match = state.repetitiveMovements?.find(rm => Number(rm.id) === Number(params.value));
          return match ? match.movement : '';
        },
        valueParser: params => parseNumberOrNull(params.newValue),
        cellRenderer: buildRepetitiveRenderer(state),
        cellEditor: 'agRichSelectCellEditor',
        cellEditorParams: params => ({
          values: [
            null,
            ...(state.repetitiveMovements || [])
              .filter(rm => rm.type === (params.data?.type || state.draftType))
              .map(rm => Number(rm.id)),
          ],
          formatValue: value => {
            if (!value) return '\u2014 None';
            const match = state.repetitiveMovements?.find(rm => Number(rm.id) === Number(value));
            return match ? match.movement : '';
          },
          searchType: 'matchAny',
          allowTyping: true,
          filterList: true,
          highlightMatch: true,
        }),
      },

      /* ── Actions (delete row) ── */
      {
        field: '__actions',
        headerName: '',
        width: 48,
        minWidth: 48,
        maxWidth: 48,
        flex: 0,
        pinned: 'right',
        resizable: false,
        editable: false,
        sortable: false,
        suppressHeaderMenuButton: true,
        suppressMovable: true,
        cellRenderer: params => {
          if (isAddRow(params.data)) return '';
          return '<button type="button" class="ft-add-actions-btn" data-action="edit" aria-label="Edit row" title="Edit row">'
            + '<span class="material-symbols-outlined" aria-hidden="true">edit</span>'
            + '</button>';
        },
      },
    ],

    /* ── Right-Click Context Menu ── */

    getContextMenuItems: params => {
      if (!params.node?.data || isAddRow(params.node.data)) return [];
      const currentType = params.node.data.type || 'Expense';
      const targetType = currentType === 'Expense' ? 'Income' : 'Expense';
      return [
        {
          name: `Change to ${targetType}`,
          icon: '<span class="material-symbols-outlined" style="font-size:14px;line-height:1;vertical-align:middle">swap_vert</span>',
          action: () => {
            const updatedData = {
              ...params.node.data,
              type: targetType,
              category_id: null,
              sub_category_id: null,
              repetitive_movement_id: null,
            };
            params.api.applyTransaction({ update: [updatedData] });
            handlers.refreshSummaryState(state, domRefs);
            handlers.renderFeedback(domRefs.feedbackEl, '');
            requestAnimationFrame(() => applyRowTypeAttributes(params.api));
          },
        },
        {
          name: 'Remove row',
          icon: '<span class="material-symbols-outlined" style="font-size:14px;line-height:1;vertical-align:middle">delete</span>',
          action: () => {
            params.api.applyTransaction({ remove: [params.node.data] });
            handlers.refreshSummaryState(state, domRefs);
            handlers.renderFeedback(domRefs.feedbackEl, '');
            requestAnimationFrame(() => applyRowTypeAttributes(params.api));
          },
        },
      ];
    },

    /* ── Grid Event Handlers ── */

    onCellValueChanged: params => {
      /* Clear error highlight when user edits a cell */
      const cellEl = document.querySelector(`[row-id="${params.node.id}"] [col-id="${params.column.getColId()}"]`);
      if (cellEl) cellEl.classList.remove(ERROR_CELL_CLASS);

      if (isAddRow(params.data) && hasUserData(params.data)) {
        const isOverlay = params.colDef.cellEditorPopup ||
          params.colDef.cellEditor === 'agRichSelectCellEditor';
        if (isOverlay) {
          const colId = params.column.getColId();
          requestAnimationFrame(() => {
            commitSentinelRow(state);
            handlers.refreshSummaryState(state, domRefs);
            applyRowTypeAttributes(params.api);
            const count = params.api.getDisplayedRowCount();
            if (count >= 2) params.api.setFocusedCell(count - 2, colId);
          });
          return;
        }
      }

      if (params.colDef.field === 'category_id') {
        const subCategory = state.subCategories.find(item => Number(item.id) === Number(params.data?.sub_category_id));
        if (subCategory && Number(subCategory.category_id) !== Number(params.data?.category_id)) {
          params.data.sub_category_id = null;
          params.api.refreshCells({ force: true, rowNodes: [params.node] });
        }
      }

      handlers.refreshSummaryState(state, domRefs);
      handlers.renderFeedback(domRefs.feedbackEl, '');
      requestAnimationFrame(() => applyRowTypeAttributes(params.api));
    },

    onCellClicked: params => {
      /* Sentinel row on mobile → open add modal instead of inline editing */
      if (isAddRow(params.data) && window.matchMedia('(max-width: 900px)').matches) {
        params.api.stopEditing(true);
        handlers.openDraftModal?.({ mode: 'add' });
        return;
      }

      if (['category_id', 'sub_category_id', 'repetitive_movement_id'].includes(params.colDef.field)) {
        params.api.startEditingCell({ rowIndex: params.rowIndex, colKey: params.column.getColId() });
      }

      /* Edit button → open edit modal */
      if (params.colDef.field === '__actions' && !isAddRow(params.data) && params.event?.target?.closest('[data-action="edit"]')) {
        handlers.openDraftModal?.({ mode: 'edit', row: params.data });
      }
    },

    onCellFocused: params => {
      const node = params.rowIndex != null ? params.api.getDisplayedRowAtIndex(params.rowIndex) : null;
      const isNowSentinel = isAddRow(node?.data);
      if (state.lastFocusWasSentinel && !isNowSentinel && !isPopupEditorOpen()) {
        commitSentinelRow(state);
        handlers.refreshSummaryState(state, domRefs);
      }
      state.lastFocusWasSentinel = isNowSentinel;
    },

    onCellKeyDown: params => {
      if (params.event.key === 'Escape') {
        if (typeof params.api.clearCellSelection === 'function') params.api.clearCellSelection();
        else if (typeof params.api.clearRangeSelection === 'function') params.api.clearRangeSelection();
        params.api.clearFocusedCell();
        return;
      }
      if (!isAddRow(params.data) || params.event.key !== 'Enter') return;
      if (isPopupEditorOpen()) return;

      const editingCells = typeof params.api.getEditingCells === 'function'
        ? params.api.getEditingCells()
        : [];

      const isInlineEditing = isInlineEditorTarget(params.event.target) ||
        (Array.isArray(editingCells) && editingCells.length > 0);

      if (!isInlineEditing) {
        return;
      }

      params.api.stopEditing();
      commitSentinelRow(state);
      handlers.refreshSummaryState(state, domRefs);
      requestAnimationFrame(() => applyRowTypeAttributes(params.api));
    },

    onFirstDataRendered: params => applyRowTypeAttributes(params.api),
    onRowDataUpdated: params => applyRowTypeAttributes(params.api),
  };
}

/* ── Grid Mount ───────────────────────────────────────────────────────────── */

function mountGrid(gridHost, state, domRefs, handlers) {
  const gridOptions = buildGridOptions(state, domRefs, handlers);
  state.gridApi = window.agGrid.createGrid(gridHost, gridOptions);

  /* ── Custom fill handle (drag to copy cell value) ──────── */
  const fillHandle = attachFillHandle(gridHost, state, domRefs, handlers);
  state.gridApi.addEventListener('cellFocused', () => {
    requestAnimationFrame(() => fillHandle.reposition());
  });
  state.gridApi.addEventListener('cellEditingStopped', () => {
    requestAnimationFrame(() => fillHandle.reposition());
  });

  gridHost.addEventListener('focusout', event => {
    if (state.lastFocusWasSentinel && (isEditingPopupTarget(event.relatedTarget) || isPopupEditorOpen())) {
      return;
    }

    if (state.lastFocusWasSentinel && !gridHost.contains(event.relatedTarget)) {
      commitSentinelRow(state);
      state.lastFocusWasSentinel = false;
      handlers.refreshSummaryState(state, domRefs);
      requestAnimationFrame(() => applyRowTypeAttributes(state.gridApi));
    }
  });

  gridHost.addEventListener('paste', event => {
    const focusedCell = state.gridApi.getFocusedCell();
    if (!focusedCell) return;

    const focusedNode = state.gridApi.getDisplayedRowAtIndex(focusedCell.rowIndex);
    if (!isAddRow(focusedNode?.data)) return;

    const raw = event.clipboardData?.getData('text/plain');
    if (!raw) return;

    const lines = raw.trim().split('\n').map(line => line.split('\t'));
    if (lines.length === 0) return;

    const editableColumns = state.gridApi
      .getAllDisplayedColumns()
      .map(col => col.getColId())
      .filter(colId => !['__actions'].includes(colId));

    const startColIndex = editableColumns.indexOf(focusedCell.column.getColId());
    if (startColIndex < 0) return;

    const rowsToAdd = lines
      .map(cells => {
        const row = createDraftRow(state.draftType);
        cells.forEach((cellValue, index) => {
          const colId = editableColumns[startColIndex + index];
          if (!colId) return;
          row[colId] = parsePastedCellValue(state, colId, cellValue, row.type, row.category_id);
        });
        return row;
      })
      .filter(hasUserData);

    if (rowsToAdd.length === 0) return;

    state.gridApi.applyTransaction({
      remove: [{ _id: SENTINEL_ID }],
      add: [...rowsToAdd, createSentinelRow(state.draftType)],
    });

    state.lastFocusWasSentinel = false;
    handlers.refreshSummaryState(state, domRefs);
    handlers.renderFeedback(domRefs.feedbackEl, '');
    requestAnimationFrame(() => applyRowTypeAttributes(state.gridApi));
    event.preventDefault();
  });


}

export {
  commitSentinelRow,
  syncRowsFromGrid,
  mountGrid,
  applyRowTypeAttributes,
  highlightErrorCells,
  clearErrorHighlights,
};