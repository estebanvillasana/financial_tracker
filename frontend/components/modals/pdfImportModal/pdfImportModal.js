/**
 * pdfImportModal.js
 *
 * Modal for importing movements from a PDF bank statement.
 *
 * Flow:
 *   Step 1 — Upload: drag-and-drop zone + file picker. Sends PDF to
 *            POST /pdf/parse-tables, shows loading spinner.
 *   Step 2 — Map & Import: table selector with preview labels, header-row
 *            picker, AG Grid preview with multi-row checkbox selection,
 *            column-mapping dropdowns, type assignment, and "Import" button.
 *
 * Follows the BulkAddModal / CategoryModal revealing-module pattern.
 *
 * Public API:
 *   PdfImportModal.open(config, onImport)  → void
 *   PdfImportModal.close()                 → void
 */

import { parsePdf } from '../../../services/pdfParser.js';
import { escapeHtml } from '../../../utils/formHelpers.js';
import { parseDateToIso } from '../../../pages/add-movements/utils.js';
import { getGridTheme } from '../../../lib/agGridLoader.js';

const GRID_FIELDS = [
  { key: 'skip',        label: 'Skip' },
  { key: 'movement',    label: 'Movement' },
  { key: 'description', label: 'Description' },
  { key: 'date',        label: 'Date' },
  { key: 'amount',      label: 'Amount' },
];

const HEADER_HINTS = {
  movement:    ['movement', 'concept', 'description', 'detail', 'transaction', 'narration', 'particulars', 'reference', 'memo', 'concepto', 'descripcion', 'descripción', 'detalle', 'referencia'],
  description: ['note', 'notes', 'remark', 'remarks', 'additional', 'info', 'información', 'observaciones', 'notas'],
  date:        ['date', 'fecha', 'value date', 'posting date', 'trans date', 'transaction date', 'book date', 'fecha valor', 'fecha operacion', 'fecha operación'],
  amount:      ['amount', 'sum', 'value', 'total', 'debit', 'credit', 'monto', 'importe', 'cargo', 'abono', 'deposit', 'withdrawal', 'debe', 'haber'],
};

const PdfImportModal = (() => {

  let activeModal = null;
  let _parsedData = null;      // { filename, page_count, tables }
  let _selectedTableIdx = 0;
  let _headerRowIdx = 0;        // which raw_row is the header (0-based)
  let _lastRowIdx = 0;          // last raw_row included in preview/import (0-based)
  let _columnMap = [];           // field key per column index
  let _typeMode = 'expense';    // 'expense' | 'income' | 'detect'
  let _previewGridApi = null;   // AG Grid instance for the preview

  /* ── Close ──────────────────────────────────────────────── */

  function close() {
    _destroyPreviewGrid();
    if (activeModal) {
      activeModal.remove();
      activeModal = null;
    }
    _parsedData = null;
    _selectedTableIdx = 0;
    _headerRowIdx = 0;
    _lastRowIdx = 0;
    _columnMap = [];
    _typeMode = 'expense';
    document.removeEventListener('keydown', _handleEsc);
  }

  function _destroyPreviewGrid() {
    if (_previewGridApi) {
      _previewGridApi.destroy();
      _previewGridApi = null;
    }
  }

  function _handleEsc(e) {
    if (e.key === 'Escape') close();
  }

  /* ── Normalize table: ensure raw_rows exists ─────────────── */

  function _ensureRawRows(table) {
    if (table.raw_rows) return;
    // Backward compat: convert old { headers, rows } format → raw_rows
    const headers = table.headers || [];
    const rows = table.rows || [];
    table.raw_rows = [headers, ...rows];
  }

  function _syncRowBounds(table) {
    _ensureRawRows(table);

    const maxRowIdx = Math.max((table.raw_rows?.length || 1) - 1, 0);
    const maxHeaderRowIdx = Math.max(maxRowIdx - 1, 0);

    _headerRowIdx = Math.max(0, Math.min(_headerRowIdx, maxHeaderRowIdx));
    _lastRowIdx = Math.max(_headerRowIdx + 1, Math.min(_lastRowIdx || maxRowIdx, maxRowIdx));

    return {
      maxRowIdx,
      maxHeaderRowIdx,
      minLastRowIdx: Math.min(maxRowIdx, _headerRowIdx + 1),
    };
  }

  /* ── Derived data from raw_rows + headerRowIdx ──────────── */

  function _getHeaders(table) {
    _syncRowBounds(table);
    const row = table.raw_rows[_headerRowIdx];
    if (!row) return table.raw_rows[0]?.map((_, i) => `Column ${i + 1}`) || [];
    return row.map((cell, i) => (cell && cell.trim()) ? cell.trim() : `Column ${i + 1}`);
  }

  function _getDataRows(table) {
    _syncRowBounds(table);
    return table.raw_rows.slice(_headerRowIdx + 1, _lastRowIdx + 1);
  }

  /* ── Auto-detect column mappings ────────────────────────── */

  function _autoDetectMappings(headers) {
    const mappings = headers.map(() => 'skip');
    const usedFields = new Set();

    headers.forEach((header, idx) => {
      const h = header.toLowerCase().trim();
      for (const [field, hints] of Object.entries(HEADER_HINTS)) {
        if (usedFields.has(field)) continue;
        if (hints.some(hint => h.includes(hint))) {
          mappings[idx] = field;
          usedFields.add(field);
          break;
        }
      }
    });

    return mappings;
  }

  /* ── Parse amount string ────────────────────────────────── */

  function _parseAmount(raw) {
    if (!raw) return null;
    const cleaned = String(raw).replace(/[^0-9.\-,]/g, '').replace(/,/g, '');
    const num = parseFloat(cleaned);
    return Number.isFinite(num) ? num : null;
  }

  function _appendMappedValue(currentValue, nextValue) {
    const normalizedNext = String(nextValue ?? '').trim();
    if (!normalizedNext) return currentValue;
    if (!currentValue) return normalizedNext;
    return `${currentValue} · ${normalizedNext}`;
  }

  /* ── Table label for selector ───────────────────────────── */

  function _buildTableLabel(table, idx) {
    _ensureRawRows(table);
    const firstRow = table.raw_rows[0] || [];
    const snippet = firstRow
      .filter(c => c && c.trim())
      .slice(0, 3)
      .map(c => c.trim().substring(0, 20))
      .join(' \u00b7 ');
    const totalRows = table.raw_rows.length;
    return `Table ${idx + 1} \u2014 p.${table.page} \u2014 ${totalRows} rows \u2014 ${snippet || 'empty'}`;
  }

  /* ── Build Upload Step HTML ─────────────────────────────── */

  function _buildUploadHtml() {
    return `
      <div class="ft-pdf-import-modal" role="dialog" aria-modal="true" aria-label="Import PDF">
        <div class="ft-pdf-import-modal__header">
          <div class="ft-pdf-import-modal__header-main">
            <h2 class="ft-h3 ft-pdf-import-modal__title">Import from PDF</h2>
            <button class="ft-pdf-import-modal__close-btn" data-action="close" aria-label="Close">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <p class="ft-small ft-text-muted">Upload a bank statement PDF to extract and import movements.</p>
        </div>

        <div class="ft-pdf-import-modal__body">
          <div class="ft-pdf-import-modal__upload-zone" id="pdf-upload-zone">
            <span class="material-symbols-outlined ft-pdf-import-modal__upload-icon">upload_file</span>
            <p class="ft-pdf-import-modal__upload-text">
              Drag & drop a PDF here, or
              <label class="ft-pdf-import-modal__upload-link">
                browse
                <input type="file" accept=".pdf,application/pdf" id="pdf-file-input" hidden />
              </label>
            </p>
            <p class="ft-small ft-text-muted">PDF files only \u00b7 Max 10 MB</p>
          </div>
        </div>

        <div class="ft-pdf-import-modal__footer">
          <span class="ft-pdf-import-modal__message"></span>
          <div class="ft-pdf-import-modal__actions">
            <button class="ft-btn ft-btn--ghost" data-action="close">Cancel</button>
          </div>
        </div>
      </div>`;
  }

  /* ── Build Mapping Step HTML ────────────────────────────── */

  function _buildMappingHtml(table, filename) {
    const { maxRowIdx, maxHeaderRowIdx, minLastRowIdx } = _syncRowBounds(table);
    const headers = _getHeaders(table);
    const dataRows = _getDataRows(table);

    const tableCountInfo = _parsedData.tables.length > 1
      ? `<div class="ft-pdf-import-modal__table-selector">
          <label class="ft-small ft-text-muted">Table</label>
          <select id="pdf-table-select" class="ft-pdf-import-modal__ctrl-select">
            ${_parsedData.tables.map((t, i) =>
              `<option value="${i}"${i === _selectedTableIdx ? ' selected' : ''}>${escapeHtml(_buildTableLabel(t, i))}</option>`
            ).join('')}
          </select>
        </div>`
      : '';

    return `
      <div class="ft-pdf-import-modal ft-pdf-import-modal--wide" role="dialog" aria-modal="true" aria-label="Import PDF">
        <div class="ft-pdf-import-modal__header">
          <div class="ft-pdf-import-modal__header-main">
            <h2 class="ft-h3 ft-pdf-import-modal__title">Import from PDF</h2>
            <button class="ft-pdf-import-modal__close-btn" data-action="close" aria-label="Close">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <p class="ft-small ft-text-muted">
            <span class="material-symbols-outlined ft-pdf-import-modal__file-icon">description</span>
            ${escapeHtml(filename)} \u00b7 ${dataRows.length} data rows
          </p>
        </div>

        <div class="ft-pdf-import-modal__body">
          ${tableCountInfo}

          <div class="ft-pdf-import-modal__config-row">
            <div class="ft-pdf-import-modal__config-field">
              <span class="ft-small ft-text-muted ft-pdf-import-modal__config-label">Header Row</span>
              <div class="ft-pdf-import-modal__header-row-ctrl">
                <input type="number" id="pdf-header-row" class="ft-pdf-import-modal__ctrl-input"
                       value="${_headerRowIdx + 1}" min="1" max="${maxHeaderRowIdx + 1}" step="1" />
                <span class="ft-small ft-text-muted">of ${table.raw_rows.length} raw rows</span>
              </div>
            </div>
            <div class="ft-pdf-import-modal__config-field">
              <span class="ft-small ft-text-muted ft-pdf-import-modal__config-label">Last Row</span>
              <div class="ft-pdf-import-modal__header-row-ctrl">
                <input type="number" id="pdf-last-row" class="ft-pdf-import-modal__ctrl-input"
                       value="${_lastRowIdx + 1}" min="${minLastRowIdx + 1}" max="${maxRowIdx + 1}" step="1" />
                <span class="ft-small ft-text-muted">show through row ${_lastRowIdx + 1}</span>
              </div>
            </div>
            <div class="ft-pdf-import-modal__config-field">
              <span class="ft-small ft-text-muted ft-pdf-import-modal__config-label">Type Assignment</span>
              <div class="ft-pdf-import-modal__type-radios">
                <label class="ft-pdf-import-modal__radio">
                  <input type="radio" name="pdf-type-mode" value="expense" ${_typeMode === 'expense' ? 'checked' : ''} />
                  <span>All Expense</span>
                </label>
                <label class="ft-pdf-import-modal__radio">
                  <input type="radio" name="pdf-type-mode" value="income" ${_typeMode === 'income' ? 'checked' : ''} />
                  <span>All Income</span>
                </label>
                <label class="ft-pdf-import-modal__radio">
                  <input type="radio" name="pdf-type-mode" value="detect" ${_typeMode === 'detect' ? 'checked' : ''} />
                  <span>Detect from sign</span>
                </label>
              </div>
            </div>
          </div>

          <div class="ft-pdf-import-modal__grid-wrap ft-ag-grid" id="pdf-preview-grid-host"></div>

          <div class="ft-pdf-import-modal__preview" id="pdf-import-preview"></div>
        </div>

        <div class="ft-pdf-import-modal__footer">
          <span class="ft-pdf-import-modal__message"></span>
          <div class="ft-pdf-import-modal__actions">
            <button class="ft-btn ft-btn--ghost" data-action="back">
              <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
              Back
            </button>
            <button class="ft-btn ft-btn--primary" data-action="import">
              <span class="material-symbols-outlined" aria-hidden="true">download</span>
              Import
            </button>
          </div>
        </div>
      </div>`;
  }

  /* ── AG Grid Preview ────────────────────────────────────── */

  function _buildHeaderSelectOptions(selectedField) {
    return GRID_FIELDS
      .map(field => `<option value="${field.key}"${field.key === selectedField ? ' selected' : ''}>${escapeHtml(field.label)}</option>`)
      .join('');
  }

  function _createMappingHeaderComponent() {
    function MappingHeader() {}

    MappingHeader.prototype.init = function init(params) {
      this.params = params;
      this.gui = document.createElement('div');
      this.gui.className = 'ft-pdf-import-modal__grid-header';
      this.gui.innerHTML = `
        <select class="ft-pdf-import-modal__map-select" data-col="${params.colIdx}">
          ${_buildHeaderSelectOptions(params.getSelectedField())}
        </select>
        <span class="ft-pdf-import-modal__map-header" title="${escapeHtml(params.displayName)}">
          ${escapeHtml(params.displayName)}
        </span>
      `;

      this.selectEl = this.gui.querySelector('.ft-pdf-import-modal__map-select');
      this.selectEl?.addEventListener('change', () => {
        params.onMappingChange(params.colIdx, this.selectEl.value);
      });
    };

    MappingHeader.prototype.getGui = function getGui() {
      return this.gui;
    };

    MappingHeader.prototype.refresh = function refresh(params) {
      this.params = params;
      if (this.selectEl) this.selectEl.value = params.getSelectedField();
      return true;
    };

    return MappingHeader;
  }

  function _mountPreviewGrid(container, headers, dataRows) {
    _destroyPreviewGrid();

    const MappingHeader = _createMappingHeaderComponent();

    const columnDefs = [
      {
        field: '_rawRowNumber',
        headerName: '#',
        pinned: 'left',
        width: 72,
        minWidth: 72,
        maxWidth: 72,
        resizable: false,
        sortable: false,
        suppressMovable: true,
        cellClass: 'ft-pdf-import-modal__row-number-cell',
      },
      ...headers.map((h, idx) => ({
        field: `col_${idx}`,
        headerName: h,
        minWidth: 140,
        flex: 1,
        resizable: true,
        sortable: false,
        headerComponent: MappingHeader,
        headerComponentParams: {
          colIdx: idx,
          getSelectedField: () => _columnMap[idx] || 'skip',
          onMappingChange: (colIdx, value) => {
            _columnMap[colIdx] = value;
            _updatePreviewCount();
          },
        },
      })),
    ];

    const rowData = dataRows.map((row, rIdx) => {
      const obj = {
        _rowIdx: rIdx,
        _rawRowNumber: _headerRowIdx + 2 + rIdx,
      };
      row.forEach((cell, cIdx) => { obj[`col_${cIdx}`] = cell; });
      return obj;
    });

    const gridOptions = {
      theme: getGridTheme(),
      columnDefs,
      rowData,
      rowSelection: {
        mode: 'multiRow',
        checkboxes: true,
        headerCheckbox: true,
        enableClickSelection: false,
      },
      headerHeight: 68,
      defaultColDef: {
        resizable: true,
        sortable: false,
        filter: false,
      },
      getRowId: params => String(params.data._rowIdx),
      onSelectionChanged: () => _updatePreviewCount(),
      onFirstDataRendered: params => {
        params.api.selectAll();
        _updatePreviewCount();
      },
    };

    _previewGridApi = window.agGrid.createGrid(container, gridOptions);
  }

  /* ── Preview Count ──────────────────────────────────────── */

  function _updatePreviewCount() {
    if (!activeModal) return;
    const el = activeModal.querySelector('#pdf-import-preview');
    if (!el) return;

    const hasMapping = _columnMap.some(m => m !== 'skip');
    if (!hasMapping) {
      el.textContent = 'Map at least one column to import movements.';
      el.className = 'ft-pdf-import-modal__preview ft-pdf-import-modal__preview--warning';
      return;
    }

    const table = _parsedData?.tables?.[_selectedTableIdx];
    if (table) _syncRowBounds(table);
    const count = _previewGridApi ? _previewGridApi.getSelectedRows().length : 0;
    const visibleCount = _previewGridApi ? _previewGridApi.getDisplayedRowCount() : 0;
    const rawStart = _headerRowIdx + 2;
    const rawEnd = _lastRowIdx + 1;
    el.textContent = `Will import ${count} movement${count === 1 ? '' : 's'} from visible raw rows ${rawStart}-${rawEnd} (${visibleCount} shown)`;
    el.className = count > 0
      ? 'ft-pdf-import-modal__preview ft-pdf-import-modal__preview--ready'
      : 'ft-pdf-import-modal__preview ft-pdf-import-modal__preview--warning';
  }

  /* ── Open ────────────────────────────────────────────────── */

  function open(config, onImport) {
    close();

    _typeMode = (config.type || 'Expense').toLowerCase();

    const backdrop = document.createElement('div');
    backdrop.className = 'ft-modal-backdrop';
    backdrop.innerHTML = _buildUploadHtml();
    document.body.appendChild(backdrop);
    activeModal = backdrop;

    backdrop.addEventListener('mousedown', e => {
      if (e.target === backdrop) close();
    });
    document.addEventListener('keydown', _handleEsc);

    _wireUploadEvents(backdrop, config, onImport);
  }

  /* ── Upload Events ──────────────────────────────────────── */

  function _wireUploadEvents(backdrop, config, onImport) {
    const modal = backdrop.querySelector('.ft-pdf-import-modal');
    const zone = modal.querySelector('#pdf-upload-zone');
    const fileInput = modal.querySelector('#pdf-file-input');

    modal.addEventListener('click', e => {
      if (e.target.closest('[data-action="close"]')) close();
    });

    const handleFile = async (file) => {
      if (!file) return;
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        _setMessage(modal, 'Please select a PDF file.', true);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        _setMessage(modal, 'File exceeds 10 MB limit.', true);
        return;
      }

      _showLoading(zone);

      try {
        _parsedData = await parsePdf(file);
      } catch (err) {
        _hideLoading(zone);
        _setMessage(modal, err.message || 'Failed to parse PDF.', true);
        return;
      }

      _selectedTableIdx = 0;
      _headerRowIdx = 0;
      const table = _parsedData.tables[0];
      _syncRowBounds(table);
      _lastRowIdx = table.raw_rows.length - 1;
      _columnMap = _autoDetectMappings(_getHeaders(table));

      _showMappingStep(backdrop, config, onImport);
    };

    fileInput?.addEventListener('change', () => {
      handleFile(fileInput.files?.[0]);
    });

    zone?.addEventListener('dragover', e => {
      e.preventDefault();
      zone.classList.add('ft-pdf-import-modal__upload-zone--dragover');
    });
    zone?.addEventListener('dragleave', () => {
      zone.classList.remove('ft-pdf-import-modal__upload-zone--dragover');
    });
    zone?.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('ft-pdf-import-modal__upload-zone--dragover');
      handleFile(e.dataTransfer?.files?.[0]);
    });
  }

  /* ── Mapping Step ───────────────────────────────────────── */

  function _showMappingStep(backdrop, config, onImport) {
    _destroyPreviewGrid();

    const table = _parsedData.tables[_selectedTableIdx];
    backdrop.innerHTML = _buildMappingHtml(table, _parsedData.filename);

    const modal = backdrop.querySelector('.ft-pdf-import-modal');
    const gridHost = modal.querySelector('#pdf-preview-grid-host');
    const headers = _getHeaders(table);
    const dataRows = _getDataRows(table);

    _mountPreviewGrid(gridHost, headers, dataRows);
    _updatePreviewCount();
    _wireMappingEvents(modal, backdrop, config, onImport);
  }

  function _wireMappingEvents(modal, backdrop, config, onImport) {
    modal.addEventListener('click', e => {
      const action = e.target.closest('[data-action]')?.dataset?.action;
      if (action === 'close') close();
      if (action === 'back') {
        _destroyPreviewGrid();
        _parsedData = null;
        _columnMap = [];
        _headerRowIdx = 0;
        _lastRowIdx = 0;
        backdrop.innerHTML = _buildUploadHtml();
        _wireUploadEvents(backdrop, config, onImport);
      }
      if (action === 'import') _handleImport(modal, config, onImport);
    });

    /* Column mapping changes */
    modal.addEventListener('change', e => {
      if (e.target.name === 'pdf-type-mode') {
        _typeMode = e.target.value;
      }

      if (e.target.id === 'pdf-table-select') {
        _selectedTableIdx = Number(e.target.value);
        _headerRowIdx = 0;
        const table = _parsedData.tables[_selectedTableIdx];
        _syncRowBounds(table);
        _lastRowIdx = table.raw_rows.length - 1;
        _columnMap = _autoDetectMappings(_getHeaders(table));
        _showMappingStep(backdrop, config, onImport);
      }
    });

    /* Header row spinner */
    const headerInput = modal.querySelector('#pdf-header-row');
    headerInput?.addEventListener('change', () => {
      const table = _parsedData.tables[_selectedTableIdx];
      _syncRowBounds(table);
      const maxVal = Math.max(1, table.raw_rows.length - 1);
      let val = parseInt(headerInput.value, 10);
      if (isNaN(val) || val < 1) val = 1;
      if (val > maxVal) val = maxVal;
      _headerRowIdx = val - 1;
      _syncRowBounds(table);
      _columnMap = _autoDetectMappings(_getHeaders(table));
      _showMappingStep(backdrop, config, onImport);
    });

    const lastRowInput = modal.querySelector('#pdf-last-row');
    lastRowInput?.addEventListener('change', () => {
      const table = _parsedData.tables[_selectedTableIdx];
      const { minLastRowIdx, maxRowIdx } = _syncRowBounds(table);
      let val = parseInt(lastRowInput.value, 10);
      if (isNaN(val) || val < (minLastRowIdx + 1)) val = minLastRowIdx + 1;
      if (val > (maxRowIdx + 1)) val = maxRowIdx + 1;
      _lastRowIdx = val - 1;
      _showMappingStep(backdrop, config, onImport);
    });
  }

  /* ── Import Handler ─────────────────────────────────────── */

  function _handleImport(modal, config, onImport) {
    _setMessage(modal, '');

    const hasMapping = _columnMap.some(m => m !== 'skip');
    if (!hasMapping) {
      _setMessage(modal, 'Map at least one column to a field.', true);
      return;
    }

    const selectedRows = _previewGridApi ? _previewGridApi.getSelectedRows() : [];
    if (selectedRows.length === 0) {
      _setMessage(modal, 'Select at least one row to import.', true);
      return;
    }

    const rows = [];
    for (const gridRow of selectedRows) {
      const mapped = {};
      _columnMap.forEach((field, colIdx) => {
        if (field === 'skip') return;
        const val = gridRow[`col_${colIdx}`];
        if (val === undefined || val === null) return;
        if (field === 'description' || field === 'movement') {
          mapped[field] = _appendMappedValue(mapped[field], val);
          return;
        }
        if (mapped[field]) return;
        mapped[field] = val;
      });

      const rawAmount = _parseAmount(mapped.amount);
      const movementValue = String(mapped.movement || '').trim();
      const descriptionValue = String(mapped.description || '').trim();
      let type;
      if (_typeMode === 'detect' && rawAmount !== null) {
        type = rawAmount < 0 ? 'Expense' : 'Income';
      } else {
        type = _typeMode === 'income' ? 'Income' : 'Expense';
      }

      const dateValue = mapped.date ? (parseDateToIso(mapped.date) || mapped.date) : null;
      const hasImportableContent = Boolean(movementValue || descriptionValue || dateValue || rawAmount !== null);
      if (!hasImportableContent) continue;

      rows.push({
        movement: movementValue,
        description: descriptionValue,
        date: dateValue,
        amount: rawAmount !== null ? Math.abs(rawAmount) : null,
        type,
        category_id: null,
        sub_category_id: null,
        repetitive_movement_id: null,
      });
    }

    if (rows.length === 0) {
      _setMessage(modal, 'No valid movements found in selected rows. Check your column mapping.', true);
      return;
    }

    if (typeof onImport === 'function') onImport(rows);
    close();
  }

  /* ── Helpers ─────────────────────────────────────────────── */

  function _setMessage(modal, text, isError = false) {
    const el = modal.querySelector('.ft-pdf-import-modal__message');
    if (!el) return;
    el.textContent = text;
    el.className = isError
      ? 'ft-pdf-import-modal__message ft-pdf-import-modal__message--error'
      : 'ft-pdf-import-modal__message';
  }

  function _showLoading(zone) {
    zone.innerHTML = `
      <span class="material-symbols-outlined ft-pdf-import-modal__upload-icon ft-pdf-import-modal__upload-icon--spin">progress_activity</span>
      <p class="ft-small ft-text-muted">Parsing PDF\u2026</p>`;
    zone.classList.add('ft-pdf-import-modal__upload-zone--loading');
  }

  function _hideLoading(zone) {
    zone.classList.remove('ft-pdf-import-modal__upload-zone--loading');
    zone.innerHTML = `
      <span class="material-symbols-outlined ft-pdf-import-modal__upload-icon">upload_file</span>
      <p class="ft-pdf-import-modal__upload-text">
        Drag & drop a PDF here, or
        <label class="ft-pdf-import-modal__upload-link">
          browse
          <input type="file" accept=".pdf,application/pdf" id="pdf-file-input" hidden />
        </label>
      </p>
      <p class="ft-small ft-text-muted">PDF files only \u00b7 Max 10 MB</p>`;
  }

  return { open, close };

})();

export { PdfImportModal };
