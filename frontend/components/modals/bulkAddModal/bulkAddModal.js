/**
 * bulkAddModal.js
 *
 * Modal for generating multiple draft rows at once in the Add Movements page.
 * The user fills common fields (name, description, type, category, sub-category,
 * amount) once, then specifies varying dates (one per line or via a range).
 * On "Generate", N draft rows are created and returned to the caller.
 *
 * Follows the CategoryModal / MovementModal revealing-module pattern.
 *
 * Public API:
 *   BulkAddModal.open(config, onGenerate)  → void
 *   BulkAddModal.close()                   → void
 */

import { escapeHtml, buildCategoryOptions, buildSubCategoryOptions } from '../../../utils/formHelpers.js';
import { isValidIsoDate } from '../../../utils/validators.js';
import { DatePicker } from '../../dumb/datePicker/datePicker.js';

const BulkAddModal = (() => {

  let activeModal = null;
  let _rangeFrom  = '';
  let _rangeTo    = '';
  let _fromCleanup = null;
  let _toCleanup   = null;

  /* ── Close ──────────────────────────────────────────────── */

  function close() {
    if (activeModal) {
      activeModal.remove();
      activeModal = null;
    }
    _fromCleanup?.();
    _toCleanup?.();
    _rangeFrom  = '';
    _rangeTo    = '';
    _fromCleanup = null;
    _toCleanup   = null;
    document.removeEventListener('keydown', _handleEsc);
  }

  function _handleEsc(e) {
    if (e.key === 'Escape') close();
  }

  /* ── Helpers ─────────────────────────────────────────────── */

  function _buildRepetitiveOptions(repetitiveMovements, type) {
    const filtered = repetitiveMovements.filter(r => r.type === type);
    return '<option value="">—</option>' +
      filtered.map(r => `<option value="${r.id}">${escapeHtml(r.movement)}</option>`).join('');
  }

  function _parseDatesText(text) {
    return text
      .split(/\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0);
  }

  function _generateDateRange(from, to) {
    const dates = [];
    const start = new Date(from + 'T00:00:00');
    const end = new Date(to + 'T00:00:00');
    if (isNaN(start) || isNaN(end) || start > end) return dates;
    const current = new Date(start);
    while (current <= end) {
      dates.push(current.toISOString().slice(0, 10));
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }

  function _updatePreview(modal) {
    const textarea = modal.querySelector('[name="dates"]');
    const previewEl = modal.querySelector('#bulk-add-preview');
    if (!textarea || !previewEl) return;

    const lines = _parseDatesText(textarea.value);
    const validCount = lines.filter(l => isValidIsoDate(l)).length;
    const invalidCount = lines.length - validCount;

    if (lines.length === 0) {
      previewEl.textContent = 'Enter dates below to generate movements';
      previewEl.className = 'ft-bulk-add-modal__preview';
      return;
    }

    let text = `Will generate ${validCount} movement${validCount === 1 ? '' : 's'}`;
    if (invalidCount > 0) text += ` · ${invalidCount} invalid date${invalidCount === 1 ? '' : 's'}`;
    previewEl.textContent = text;
    previewEl.className = invalidCount > 0
      ? 'ft-bulk-add-modal__preview ft-bulk-add-modal__preview--warning'
      : 'ft-bulk-add-modal__preview ft-bulk-add-modal__preview--ready';
  }

  /* ── Open ────────────────────────────────────────────────── */

  /**
   * Opens the bulk-add modal.
   *
   * @param {object} config
   * @param {string}   config.type                - Current draft type ('Expense' | 'Income')
   * @param {object[]} config.categories           - Active categories
   * @param {object[]} config.subCategories        - Active sub-categories
   * @param {object[]} config.repetitiveMovements  - Active repetitive movements
   * @param {Function} onGenerate - Callback receiving an array of draft row data objects
   */
  function open(config, onGenerate) {
    close();

    const { type, categories, subCategories, repetitiveMovements } = config;

    const categoryOptions = buildCategoryOptions(categories, type);
    const repOptions = _buildRepetitiveOptions(repetitiveMovements, type);

    const html = `
      <div class="ft-bulk-add-modal" role="dialog" aria-modal="true" aria-label="Bulk Add Movements">
        <div class="ft-bulk-add-modal__header">
          <div class="ft-bulk-add-modal__header-main">
            <h2 class="ft-h3 ft-bulk-add-modal__title">Bulk Add Movements</h2>
            <button class="ft-bulk-add-modal__close-btn" data-action="close" aria-label="Close">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <p class="ft-small ft-text-muted">Fill the common fields once, then list the dates — one per line.</p>
        </div>

        <div class="ft-bulk-add-modal__body">
          <!-- Common Fields -->
          <div class="ft-bulk-add-modal__section">
            <h3 class="ft-small ft-text-muted ft-bulk-add-modal__section-label">Common Fields</h3>
            <div class="ft-bulk-add-modal__form-grid">
              <div class="ft-bulk-add-modal__field">
                <span>Movement Name</span>
                <input type="text" name="movement" placeholder="e.g. Monthly rent" autocomplete="off" />
              </div>
              <div class="ft-bulk-add-modal__field">
                <span>Amount</span>
                <input type="text" name="amount" placeholder="0.00" inputmode="decimal" autocomplete="off" />
              </div>
              <div class="ft-bulk-add-modal__field">
                <span>Category</span>
                <select name="category_id">${categoryOptions}</select>
              </div>
              <div class="ft-bulk-add-modal__field">
                <span>Sub-category</span>
                <select name="sub_category_id"><option value="">—</option></select>
              </div>
              <div class="ft-bulk-add-modal__field ft-bulk-add-modal__field--wide">
                <span>Description</span>
                <input type="text" name="description" placeholder="Optional notes" autocomplete="off" />
              </div>
              <div class="ft-bulk-add-modal__field">
                <span>Repetitive Movement</span>
                <select name="repetitive_movement_id">${repOptions}</select>
              </div>
            </div>
          </div>

          <!-- Dates Section -->
          <div class="ft-bulk-add-modal__section">
            <h3 class="ft-small ft-text-muted ft-bulk-add-modal__section-label">Dates</h3>

            <!-- Quick date range generator -->
            <div class="ft-bulk-add-modal__range-row">
              <div class="ft-bulk-add-modal__field ft-bulk-add-modal__field--compact">
                <span>From</span>
                <div id="bulk-range-from-wrap"></div>
              </div>
              <div class="ft-bulk-add-modal__field ft-bulk-add-modal__field--compact">
                <span>To</span>
                <div id="bulk-range-to-wrap"></div>
              </div>
              <button class="ft-btn ft-btn--ghost ft-bulk-add-modal__range-btn" data-action="fill-range">
                <span class="material-symbols-outlined" aria-hidden="true">date_range</span>
                Fill Range
              </button>
            </div>

            <div class="ft-bulk-add-modal__field ft-bulk-add-modal__field--wide">
              <span>One date per line (YYYY-MM-DD)</span>
              <textarea name="dates" rows="8" placeholder="2026-03-01&#10;2026-03-02&#10;2026-03-03&#10;..."></textarea>
            </div>

            <div id="bulk-add-preview" class="ft-bulk-add-modal__preview">
              Enter dates below to generate movements
            </div>
          </div>
        </div>

        <div class="ft-bulk-add-modal__footer">
          <span class="ft-bulk-add-modal__message"></span>
          <div class="ft-bulk-add-modal__actions">
            <button class="ft-btn ft-btn--ghost" data-action="close">Cancel</button>
            <button class="ft-btn ft-btn--primary" data-action="generate">
              <span class="material-symbols-outlined" aria-hidden="true">playlist_add</span>
              Generate Rows
            </button>
          </div>
        </div>
      </div>`;

    const backdrop = document.createElement('div');
    backdrop.className = 'ft-modal-backdrop';
    backdrop.innerHTML = html;
    document.body.appendChild(backdrop);
    activeModal = backdrop;

    backdrop.addEventListener('mousedown', e => {
      if (e.target === backdrop) close();
    });
    document.addEventListener('keydown', _handleEsc);

    const modal = backdrop.querySelector('.ft-bulk-add-modal');

    /* Wire events */
    _wireEvents(modal, config, onGenerate);

    /* Focus first input */
    requestAnimationFrame(() => modal.querySelector('[name="movement"]')?.focus());
  }

  /* ── Event Wiring ───────────────────────────────────────── */

  function _wireEvents(modal, config, onGenerate) {
    const { type, categories, subCategories } = config;

    /* Mount date range pickers */
    const fromWrap = modal.querySelector('#bulk-range-from-wrap');
    const toWrap   = modal.querySelector('#bulk-range-to-wrap');

    if (fromWrap) {
      const fromPicker = DatePicker.createPickerField('From', '', v => { _rangeFrom = v; });
      _fromCleanup = fromPicker._cleanup;
      fromWrap.appendChild(fromPicker);
    }
    if (toWrap) {
      const toPicker = DatePicker.createPickerField('To', '', v => { _rangeTo = v; });
      _toCleanup = toPicker._cleanup;
      toWrap.appendChild(toPicker);
    }

    /* Close / Generate via delegation */
    modal.addEventListener('click', e => {
      const action = e.target.closest('[data-action]')?.dataset?.action;
      if (action === 'close') close();
      if (action === 'generate') _handleGenerate(modal, type, onGenerate);
      if (action === 'fill-range') _handleFillRange(modal);
    });

    /* Category → Sub-category cascade */
    const catSelect = modal.querySelector('[name="category_id"]');
    const subSelect = modal.querySelector('[name="sub_category_id"]');
    catSelect?.addEventListener('change', () => {
      const catId = catSelect.value;
      subSelect.innerHTML = buildSubCategoryOptions(subCategories, type, catId);
    });

    /* Live preview as dates are typed */
    const textarea = modal.querySelector('[name="dates"]');
    textarea?.addEventListener('input', () => _updatePreview(modal));
  }

  /* ── Fill Range ─────────────────────────────────────────── */

  function _handleFillRange(modal) {
    const from = _rangeFrom;
    const to   = _rangeTo;

    if (!from || !to) {
      _setMessage(modal, 'Select both From and To dates.', true);
      return;
    }

    const dates = _generateDateRange(from, to);
    if (dates.length === 0) {
      _setMessage(modal, 'Invalid range — "From" must be before or equal to "To".', true);
      return;
    }

    const textarea = modal.querySelector('[name="dates"]');
    const existing = textarea.value.trim();
    textarea.value = existing ? existing + '\n' + dates.join('\n') : dates.join('\n');
    _updatePreview(modal);
    _setMessage(modal, `Added ${dates.length} date${dates.length === 1 ? '' : 's'} to the list.`);
  }

  /* ── Generate ───────────────────────────────────────────── */

  function _handleGenerate(modal, type, onGenerate) {
    _setMessage(modal, '');

    const movement = modal.querySelector('[name="movement"]')?.value.trim() || '';
    const description = modal.querySelector('[name="description"]')?.value.trim() || '';
    const amountRaw = modal.querySelector('[name="amount"]')?.value.trim() || '';
    const categoryId = modal.querySelector('[name="category_id"]')?.value || null;
    const subCategoryId = modal.querySelector('[name="sub_category_id"]')?.value || null;
    const repetitiveId = modal.querySelector('[name="repetitive_movement_id"]')?.value || null;
    const datesText = modal.querySelector('[name="dates"]')?.value || '';

    /* Validate common fields */
    const errors = [];
    if (!movement) errors.push('Movement name is required.');

    const amount = parseFloat(amountRaw.replace(/[^0-9.\-]/g, ''));
    if (!amountRaw || isNaN(amount) || amount <= 0) errors.push('Amount must be a positive number.');

    const dateLines = _parseDatesText(datesText);
    if (dateLines.length === 0) errors.push('Enter at least one date.');

    const validDates = [];
    const invalidDates = [];
    dateLines.forEach(line => {
      if (isValidIsoDate(line)) validDates.push(line);
      else invalidDates.push(line);
    });

    if (validDates.length === 0 && dateLines.length > 0) {
      errors.push('No valid dates found. Use YYYY-MM-DD format.');
    }

    if (errors.length > 0) {
      _setMessage(modal, errors.join(' '), true);
      return;
    }

    if (invalidDates.length > 0) {
      _setMessage(modal, `Skipping ${invalidDates.length} invalid date${invalidDates.length === 1 ? '' : 's'}: ${invalidDates.slice(0, 3).join(', ')}${invalidDates.length > 3 ? '…' : ''}`);
    }

    /* Build row data objects (not full draft rows — caller creates those) */
    const rows = validDates.map(date => ({
      movement,
      description,
      type,
      date,
      amount,
      category_id: categoryId ? Number(categoryId) : null,
      sub_category_id: subCategoryId ? Number(subCategoryId) : null,
      repetitive_movement_id: repetitiveId ? Number(repetitiveId) : null,
    }));

    if (typeof onGenerate === 'function') onGenerate(rows);
    close();
  }

  /* ── Message ────────────────────────────────────────────── */

  function _setMessage(modal, text, isError = false) {
    const el = modal.querySelector('.ft-bulk-add-modal__message');
    if (!el) return;
    el.textContent = text;
    el.className = isError
      ? 'ft-bulk-add-modal__message ft-bulk-add-modal__message--error'
      : 'ft-bulk-add-modal__message';
  }

  return { open, close };

})();

export { BulkAddModal };
