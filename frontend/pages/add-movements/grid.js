/**
 * Add Movements AG Grid behavior module.
 *
 * Handles:
 * - column definitions and interactive editors,
 * - sentinel row commit behavior,
 * - bulk paste insertion logic.
 */
import {
  TYPE_VALUES,
  SENTINEL_ID,
  createDraftRow,
  createSentinelRow,
  isAddRow,
  hasUserData,
} from './constants.js';
import {
  parseNumberOrNull,
  categoryLabelById,
  subCategoryLabelById,
  getCategoriesByType,
  getSubCategoriesForRow,
  parsePastedCellValue,
} from './utils.js';

/** Commits the sentinel row into a normal row when it has user data. */
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

/** Syncs state.rows from AG Grid excluding sentinel row. */
function syncRowsFromGrid(state) {
  if (!state.gridApi) return;
  const rows = [];
  state.gridApi.forEachNode(node => {
    if (node?.data && !isAddRow(node.data)) rows.push(node.data);
  });
  state.rows = rows;
}

/** Builds pill-like renderer used by category/sub-category dropdown columns. */
function buildDropdownRenderer(state, kind) {
  return params => {
    if (isAddRow(params.data)) {
      return '<div class="ft-add-dropdown-display"><span class="ft-add-pill ft-add-pill--placeholder">Select…</span><span class="ag-icon ag-icon-small-down ft-add-dropdown-icon" aria-hidden="true"></span></div>';
    }

    const label = kind === 'category'
      ? categoryLabelById(state, params.value)
      : subCategoryLabelById(state, params.value);

    if (!label) {
      return '<div class="ft-add-dropdown-display"><span class="ft-add-pill ft-add-pill--placeholder">Select…</span><span class="ag-icon ag-icon-small-down ft-add-dropdown-icon" aria-hidden="true"></span></div>';
    }

    const typeClass = params.data?.type === 'Income'
      ? 'ft-add-pill--income'
      : 'ft-add-pill--expense';
    const hierarchyClass = kind === 'sub-category' ? 'ft-add-pill--sub' : '';
    return `<div class="ft-add-dropdown-display"><span class="ft-add-pill ${typeClass} ${hierarchyClass}">${label}</span><span class="ag-icon ag-icon-small-down ft-add-dropdown-icon" aria-hidden="true"></span></div>`;
  };
}

/** Creates full AG Grid options for the Add Movements screen. */
function buildGridOptions(state, domRefs, handlers) {
  return {
    theme: handlers.getGridTheme(),
    rowData: [createSentinelRow(state.draftType)],
    cellSelection: true,
    rowSelection: 'multiple',
    suppressClickEdit: false,
    suppressRowClickSelection: true,
    getRowId: params => params.data._id,
    isRowSelectable: params => !isAddRow(params.data),
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
      {
        colId: '__select',
        headerName: '',
        width: 46,
        minWidth: 46,
        maxWidth: 46,
        editable: false,
        sortable: false,
        filter: false,
        resizable: false,
        checkboxSelection: params => !isAddRow(params.data),
        headerCheckboxSelection: true,
      },
      {
        field: 'movement',
        headerName: 'Movement',
        minWidth: 170,
        editable: true,
        cellRenderer: params => {
          if (isAddRow(params.data)) {
            return '<span class="ft-add-movement-cell ft-add-movement-cell--placeholder"><span class="ft-add-movement-type-dot ft-add-movement-type-dot--placeholder"></span><span>Add new movement...</span></span>';
          }
          const typeClass = params.data?.type === 'Income'
            ? 'ft-add-movement-type-dot--income'
            : 'ft-add-movement-type-dot--expense';
          const text = String(params.value || '');
          return `<span class="ft-add-movement-cell"><span class="ft-add-movement-type-dot ${typeClass}"></span><span>${text}</span></span>`;
        },
      },
      {
        field: 'description',
        headerName: 'Description',
        minWidth: 180,
        editable: true,
        cellEditor: 'agLargeTextCellEditor',
        cellEditorPopup: true,
      },
      {
        field: 'date',
        headerName: 'Date',
        minWidth: 120,
        editable: true,
      },
      {
        field: 'amount',
        headerName: 'Amount',
        minWidth: 120,
        editable: true,
        valueParser: params => parseNumberOrNull(params.newValue),
        valueFormatter: params => {
          const value = Number(params.value);
          return Number.isFinite(value) ? value.toFixed(2) : '';
        },
      },
      {
        field: 'category_id',
        headerName: 'Category',
        minWidth: 150,
        editable: params => !isAddRow(params.data),
        singleClickEdit: true,
        valueFormatter: params => categoryLabelById(state, params.value),
        valueParser: params => parseNumberOrNull(params.newValue),
        cellRenderer: buildDropdownRenderer(state, 'category'),
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
      {
        field: 'sub_category_id',
        headerName: 'Sub-category',
        minWidth: 160,
        editable: params => !isAddRow(params.data),
        singleClickEdit: true,
        valueFormatter: params => subCategoryLabelById(state, params.value),
        valueParser: params => parseNumberOrNull(params.newValue),
        cellRenderer: buildDropdownRenderer(state, 'sub-category'),
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
    ],
    onCellValueChanged: params => {
      if (params.colDef.field === 'category_id') {
        const subCategory = state.subCategories.find(item => Number(item.id) === Number(params.data?.sub_category_id));
        if (subCategory && Number(subCategory.category_id) !== Number(params.data?.category_id)) {
          params.data.sub_category_id = null;
          params.api.refreshCells({ force: true, rowNodes: [params.node] });
        }
      }
      handlers.refreshSummaryState(state, domRefs);
      handlers.renderFeedback(domRefs.feedbackEl, '');
    },
    onCellClicked: params => {
      if (['category_id', 'sub_category_id'].includes(params.colDef.field) && !isAddRow(params.data)) {
        params.api.startEditingCell({ rowIndex: params.rowIndex, colKey: params.column.getColId() });
      }
    },
    onSelectionChanged: () => handlers.updateTableActionButtons(state, domRefs.removeSelectedBtn),
    onCellFocused: params => {
      const node = params.rowIndex != null ? params.api.getDisplayedRowAtIndex(params.rowIndex) : null;
      const isNowSentinel = isAddRow(node?.data);
      if (state.lastFocusWasSentinel && !isNowSentinel) {
        commitSentinelRow(state);
        handlers.refreshSummaryState(state, domRefs);
      }
      state.lastFocusWasSentinel = isNowSentinel;
    },
    onCellKeyDown: params => {
      if (params.event.key === 'Escape') {
        params.api.deselectAll();
        if (typeof params.api.clearCellSelection === 'function') params.api.clearCellSelection();
        else if (typeof params.api.clearRangeSelection === 'function') params.api.clearRangeSelection();
        params.api.clearFocusedCell();
        handlers.updateTableActionButtons(state, domRefs.removeSelectedBtn);
        return;
      }
      if (!isAddRow(params.data) || params.event.key !== 'Enter') return;
      params.api.stopEditing();
      commitSentinelRow(state);
      handlers.refreshSummaryState(state, domRefs);
    },
  };
}

/** Mounts AG Grid and hooks page-level focus/paste interactions. */
function mountGrid(gridHost, state, domRefs, handlers) {
  const gridOptions = buildGridOptions(state, domRefs, handlers);
  state.gridApi = window.agGrid.createGrid(gridHost, gridOptions);

  gridHost.addEventListener('focusout', event => {
    if (state.lastFocusWasSentinel && !gridHost.contains(event.relatedTarget)) {
      commitSentinelRow(state);
      state.lastFocusWasSentinel = false;
      handlers.refreshSummaryState(state, domRefs);
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
      .filter(colId => !['__select', '__actions'].includes(colId));

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
    event.preventDefault();
  });

  // Global escape handler to clear selection even when focus is not on a cell.
  gridHost.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    state.gridApi.deselectAll();
    if (typeof state.gridApi.clearCellSelection === 'function') state.gridApi.clearCellSelection();
    else if (typeof state.gridApi.clearRangeSelection === 'function') state.gridApi.clearRangeSelection();
    state.gridApi.clearFocusedCell();
    handlers.updateTableActionButtons(state, domRefs.removeSelectedBtn);
  });
}

export {
  commitSentinelRow,
  syncRowsFromGrid,
  mountGrid,
};
