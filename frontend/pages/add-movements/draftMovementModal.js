/**
 * Draft Movement Modal
 *
 * Full-form modal for adding new draft rows or editing existing ones.
 * Appears as a bottom sheet on mobile and a centered dialog on desktop.
 *
 * Usage:
 *   openDraftModal({ mode: 'add', state }, { onSave });
 *   openDraftModal({ mode: 'edit', row, state }, { onSave, onDelete });
 */
import { DatePicker } from '../../components/dumb/datePicker/datePicker.js';
import { todayIso, TYPE_VALUES } from './constants.js';

let _overlay = null;
let _pickerCleanup = null;
let _keydownHandler = null;

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function _esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _categoryOptions(state, draft) {
  const cats = (state.categories || []).filter(c => c.type === draft.type);
  return [
    '<option value="">Select category\u2026</option>',
    ...cats.map(c =>
      `<option value="${c.id}"${Number(draft.category_id) === Number(c.id) ? ' selected' : ''}>${_esc(c.category)}</option>`
    ),
  ].join('');
}

function _subCategoryOptions(state, draft) {
  const catId = draft.category_id ? Number(draft.category_id) : null;
  const subs = (state.subCategories || []).filter(
    sc => sc.type === draft.type && catId !== null && Number(sc.category_id) === catId
  );
  return [
    '<option value="">Select sub-category\u2026</option>',
    ...subs.map(sc =>
      `<option value="${sc.id}"${Number(draft.sub_category_id) === Number(sc.id) ? ' selected' : ''}>${_esc(sc.sub_category)}</option>`
    ),
  ].join('');
}

function _repetitiveOptions(state, draft) {
  const items = (state.repetitiveMovements || []).filter(rm => rm.type === draft.type);
  return [
    '<option value="">No repetitive movement</option>',
    ...items.map(rm =>
      `<option value="${rm.id}"${Number(draft.repetitive_movement_id) === Number(rm.id) ? ' selected' : ''}>${_esc(rm.movement)}</option>`
    ),
  ].join('');
}

/* ── Render ───────────────────────────────────────────────────────────────── */

function _render(overlay, draft, state, isEdit) {
  const title = isEdit ? 'Edit draft' : 'New draft movement';
  const saveLabel = isEdit ? 'Save changes' : 'Add to drafts';

  overlay.innerHTML = `
    <div class="ft-draft-modal" role="dialog" aria-modal="true" aria-labelledby="ft-draft-modal-title">
      <div class="ft-draft-modal__header">
        <div class="ft-draft-modal__header-left">
          <div class="ft-draft-modal__type-toggle">
            ${TYPE_VALUES.map(t => `
              <button type="button"
                class="ft-draft-modal__type-btn ft-draft-modal__type-btn--${t.toLowerCase()}${draft.type === t ? ' ft-draft-modal__type-btn--active' : ''}"
                data-type-toggle="${t}">${t}</button>
            `).join('')}
          </div>
          <h2 id="ft-draft-modal-title" class="ft-draft-modal__title">${_esc(title)}</h2>
        </div>
        <button type="button" class="ft-draft-modal__close" data-action="cancel" aria-label="Close">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      <div class="ft-draft-modal__body">
        <div class="ft-draft-modal__field ft-draft-modal__field--full">
          <label class="ft-add-movements-toolbar__label" for="ft-draft-modal-movement">Movement *</label>
          <input id="ft-draft-modal-movement" class="ft-draft-modal__control" type="text"
            value="${_esc(draft.movement)}" data-field="movement"
            placeholder="Groceries, Salary, Rent\u2026" autocomplete="off" />
        </div>

        <div class="ft-draft-modal__row">
          <div class="ft-draft-modal__field">
            <label class="ft-add-movements-toolbar__label" for="ft-draft-modal-amount">Amount *</label>
            <input id="ft-draft-modal-amount" class="ft-draft-modal__control" type="number"
              inputmode="decimal" min="0" step="0.01"
              value="${_esc(draft.amount ?? '')}" data-field="amount" placeholder="0.00" />
          </div>
          <div class="ft-draft-modal__field">
            <label class="ft-add-movements-toolbar__label">Date</label>
            <div data-date-picker-insert></div>
          </div>
        </div>

        <div class="ft-draft-modal__row">
          <div class="ft-draft-modal__field">
            <label class="ft-add-movements-toolbar__label" for="ft-draft-modal-category">Category *</label>
            <select id="ft-draft-modal-category" class="ft-draft-modal__control" data-field="category_id">
              ${_categoryOptions(state, draft)}
            </select>
          </div>
          <div class="ft-draft-modal__field">
            <label class="ft-add-movements-toolbar__label" for="ft-draft-modal-subcategory">Sub-category</label>
            <select id="ft-draft-modal-subcategory" class="ft-draft-modal__control" data-field="sub_category_id">
              ${_subCategoryOptions(state, draft)}
            </select>
          </div>
        </div>

        <div class="ft-draft-modal__field ft-draft-modal__field--full">
          <label class="ft-add-movements-toolbar__label" for="ft-draft-modal-description">Description</label>
          <textarea id="ft-draft-modal-description" class="ft-draft-modal__control ft-draft-modal__control--textarea"
            data-field="description" placeholder="Optional details">${_esc(draft.description || '')}</textarea>
        </div>

        <div class="ft-draft-modal__field ft-draft-modal__field--full">
          <label class="ft-add-movements-toolbar__label" for="ft-draft-modal-repetitive">Repetitive Movement</label>
          <select id="ft-draft-modal-repetitive" class="ft-draft-modal__control" data-field="repetitive_movement_id">
            ${_repetitiveOptions(state, draft)}
          </select>
        </div>
      </div>

      <div class="ft-draft-modal__footer">
        ${isEdit ? '<button type="button" class="ft-btn ft-btn--ghost ft-draft-modal__delete-btn" data-action="delete">Delete draft</button>' : ''}
        <div class="ft-draft-modal__footer-right">
          <button type="button" class="ft-btn ft-btn--ghost" data-action="cancel">Cancel</button>
          <button type="button" class="ft-btn ft-btn--primary" data-action="save">${_esc(saveLabel)}</button>
        </div>
      </div>
    </div>
  `;

  /* Mount date picker */
  const dateInsert = overlay.querySelector('[data-date-picker-insert]');
  if (dateInsert) {
    const pickerField = DatePicker.createPickerField('Select date', draft.date || '', isoDate => {
      draft.date = isoDate;
    });
    dateInsert.replaceWith(pickerField);
    _pickerCleanup = pickerField._cleanup;
  }
}

/* ── Public API ───────────────────────────────────────────────────────────── */

/**
 * Opens the modal.
 *
 * @param {{ mode: 'add'|'edit', row?: object, state: object }} options
 * @param {{ onSave: Function, onDelete?: Function }} callbacks
 */
function open({ mode = 'add', row = null, state }, { onSave, onDelete } = {}) {
  close();

  const isEdit = mode === 'edit';
  const draft = isEdit && row
    ? {
        movement: row.movement ?? '',
        description: row.description ?? '',
        type: row.type ?? state.draftType,
        date: row.date ?? todayIso(),
        amount: row.amount ?? null,
        category_id: row.category_id ?? null,
        sub_category_id: row.sub_category_id ?? null,
        repetitive_movement_id: row.repetitive_movement_id ?? null,
      }
    : {
        movement: '',
        description: '',
        type: state.draftType,
        date: todayIso(),
        amount: null,
        category_id: null,
        sub_category_id: null,
        repetitive_movement_id: null,
      };

  _overlay = document.createElement('div');
  _overlay.className = 'ft-draft-modal-overlay';
  document.body.appendChild(_overlay);
  document.body.classList.add('ft-modal-open');

  _render(_overlay, draft, state, isEdit);

  /* ── Event delegation — all listeners on the overlay ── */

  _overlay.addEventListener('input', event => {
    const field = event.target.dataset.field;
    if (!field || ['category_id', 'sub_category_id', 'repetitive_movement_id'].includes(field)) return;
    draft[field] = event.target.value;
    if (field === 'movement') event.target.classList.remove('ft-draft-modal__control--error');
  });

  _overlay.addEventListener('change', event => {
    const field = event.target.dataset.field;
    if (!field) return;

    if (field === 'category_id') {
      draft.category_id = event.target.value ? Number(event.target.value) : null;
      draft.sub_category_id = null;
      const subSel = _overlay.querySelector('[data-field="sub_category_id"]');
      if (subSel) subSel.innerHTML = _subCategoryOptions(state, draft);
      return;
    }
    if (field === 'sub_category_id' || field === 'repetitive_movement_id') {
      draft[field] = event.target.value ? Number(event.target.value) : null;
      return;
    }
    draft[field] = event.target.value;
  });

  _overlay.addEventListener('click', event => {
    /* Backdrop dismiss */
    if (event.target === _overlay) { close(); return; }

    /* Type toggle */
    const typeBtn = event.target.closest('[data-type-toggle]');
    if (typeBtn) {
      const newType = typeBtn.dataset.typeToggle;
      if (!TYPE_VALUES.includes(newType) || draft.type === newType) return;
      draft.type = newType;
      draft.category_id = null;
      draft.sub_category_id = null;
      draft.repetitive_movement_id = null;
      _overlay.querySelectorAll('[data-type-toggle]').forEach(btn => {
        btn.classList.toggle('ft-draft-modal__type-btn--active', btn.dataset.typeToggle === newType);
      });
      const catSel = _overlay.querySelector('[data-field="category_id"]');
      if (catSel) catSel.innerHTML = _categoryOptions(state, draft);
      const subSel = _overlay.querySelector('[data-field="sub_category_id"]');
      if (subSel) subSel.innerHTML = _subCategoryOptions(state, draft);
      const repSel = _overlay.querySelector('[data-field="repetitive_movement_id"]');
      if (repSel) repSel.innerHTML = _repetitiveOptions(state, draft);
      return;
    }

    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    if (action === 'cancel') { close(); return; }

    if (action === 'delete') {
      close();
      onDelete?.();
      return;
    }

    if (action === 'save') {
      const movement = String(draft.movement || '').trim();
      if (!movement) {
        const input = _overlay.querySelector('[data-field="movement"]');
        input?.classList.add('ft-draft-modal__control--error');
        input?.focus();
        return;
      }
      const saved = {
        movement,
        description: String(draft.description || '').trim() || null,
        type: draft.type,
        date: draft.date || todayIso(),
        amount: draft.amount === '' || draft.amount == null ? null : Number(draft.amount),
        category_id: draft.category_id ? Number(draft.category_id) : null,
        sub_category_id: draft.sub_category_id ? Number(draft.sub_category_id) : null,
        repetitive_movement_id: draft.repetitive_movement_id ? Number(draft.repetitive_movement_id) : null,
      };
      close();
      onSave?.(saved);
    }
  });

  /* Animate in */
  requestAnimationFrame(() => _overlay?.classList.add('ft-draft-modal-overlay--open'));

  /* Escape key */
  _keydownHandler = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', _keydownHandler);

  /* Initial focus */
  requestAnimationFrame(() => _overlay?.querySelector('#ft-draft-modal-movement')?.focus());
}

function close() {
  if (_pickerCleanup) { _pickerCleanup(); _pickerCleanup = null; }
  if (_keydownHandler) { document.removeEventListener('keydown', _keydownHandler); _keydownHandler = null; }
  if (_overlay) { _overlay.remove(); _overlay = null; }
  document.body.classList.remove('ft-modal-open');
}

export { open as openDraftModal, close as closeDraftModal };
