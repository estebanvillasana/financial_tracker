/**
 * Duplicate Draft Modal
 *
 * Provides two duplication flows for draft rows:
 * - simple: choose how many identical copies to create
 * - dynamic: choose count plus which fields vary across the copies
 */
import { todayIso } from './constants.js';

let _overlay = null;
let _keydownHandler = null;

const DUPLICATE_FIELDS = [
  { key: 'date', label: 'Date', kind: 'date' },
  { key: 'amount', label: 'Amount', kind: 'number' },
  { key: 'movement', label: 'Movement', kind: 'text' },
  { key: 'description', label: 'Description', kind: 'text' },
  { key: 'category_id', label: 'Category', kind: 'category' },
  { key: 'sub_category_id', label: 'Sub-category', kind: 'sub-category' },
  { key: 'repetitive_movement_id', label: 'Repetitive', kind: 'repetitive' },
];

function _esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _normalizeBaseRow(row) {
  return {
    movement: String(row?.movement || ''),
    description: String(row?.description || ''),
    type: row?.type || 'Expense',
    date: row?.date || todayIso(),
    amount: row?.amount ?? null,
    category_id: row?.category_id ?? null,
    sub_category_id: row?.sub_category_id ?? null,
    repetitive_movement_id: row?.repetitive_movement_id ?? null,
  };
}

function _createCopySeed(baseRow) {
  return {
    movement: baseRow.movement,
    description: baseRow.description,
    type: baseRow.type,
    date: baseRow.date,
    amount: baseRow.amount,
    category_id: baseRow.category_id,
    sub_category_id: baseRow.sub_category_id,
    repetitive_movement_id: baseRow.repetitive_movement_id,
  };
}

function _syncCopies(modalState) {
  const targetCount = Math.max(1, Number(modalState.count) || 1);
  while (modalState.copies.length < targetCount) {
    modalState.copies.push(_createCopySeed(modalState.baseRow));
  }
  if (modalState.copies.length > targetCount) {
    modalState.copies = modalState.copies.slice(0, targetCount);
  }
}

function _getCategoryOptions(state, draftType) {
  return (state.categories || []).filter(item => item.type === draftType);
}

function _getSubCategoryOptions(state, draftType, categoryId) {
  const normalizedCategoryId = categoryId == null || categoryId === '' ? null : Number(categoryId);
  return (state.subCategories || []).filter(item => (
    item.type === draftType &&
    normalizedCategoryId !== null &&
    Number(item.category_id) === normalizedCategoryId
  ));
}

function _getRepetitiveOptions(state, draftType) {
  return (state.repetitiveMovements || []).filter(item => item.type === draftType);
}

function _renderSourceSummary(baseRow) {
  const amountLabel = baseRow.amount == null || baseRow.amount === ''
    ? 'No amount'
    : String(baseRow.amount);
  return `
    <div class="ft-duplicate-draft-modal__summary">
      <div>
        <span class="ft-duplicate-draft-modal__summary-label">Source row</span>
        <strong class="ft-duplicate-draft-modal__summary-title">${_esc(baseRow.movement || 'Unnamed movement')}</strong>
      </div>
      <div class="ft-duplicate-draft-modal__summary-meta">
        <span>${_esc(baseRow.type)}</span>
        <span>${_esc(baseRow.date || todayIso())}</span>
        <span>${_esc(amountLabel)}</span>
      </div>
    </div>
  `;
}

function _renderFieldSelectors(modalState) {
  return `
    <div class="ft-duplicate-draft-modal__field-picks">
      ${DUPLICATE_FIELDS.map(field => `
        <label class="ft-duplicate-draft-modal__field-pick">
          <input
            type="checkbox"
            data-action="toggle-field"
            data-field-key="${field.key}"
            ${modalState.selectedFields.includes(field.key) ? 'checked' : ''}
          />
          <span>${_esc(field.label)}</span>
        </label>
      `).join('')}
    </div>
  `;
}

function _renderInputCell(state, modalState, copy, copyIndex, fieldKey) {
  const field = DUPLICATE_FIELDS.find(item => item.key === fieldKey);
  if (!field) return '';

  if (field.kind === 'date') {
    return `
      <input
        class="ft-duplicate-draft-modal__control"
        type="date"
        data-action="copy-field"
        data-copy-index="${copyIndex}"
        data-field-key="${fieldKey}"
        value="${_esc(copy.date || '')}"
      />
    `;
  }

  if (field.kind === 'number') {
    return `
      <input
        class="ft-duplicate-draft-modal__control"
        type="number"
        inputmode="decimal"
        min="0"
        step="0.01"
        data-action="copy-field"
        data-copy-index="${copyIndex}"
        data-field-key="${fieldKey}"
        value="${_esc(copy.amount ?? '')}"
        placeholder="0.00"
      />
    `;
  }

  if (field.kind === 'category') {
    const options = _getCategoryOptions(state, modalState.baseRow.type);
    return `
      <select
        class="ft-duplicate-draft-modal__control"
        data-action="copy-field"
        data-copy-index="${copyIndex}"
        data-field-key="${fieldKey}"
      >
        <option value="">Keep empty</option>
        ${options.map(option => `
          <option value="${option.id}"${Number(copy.category_id) === Number(option.id) ? ' selected' : ''}>
            ${_esc(option.category)}
          </option>
        `).join('')}
      </select>
    `;
  }

  if (field.kind === 'sub-category') {
    const categoryId = copy.category_id ?? modalState.baseRow.category_id;
    const options = _getSubCategoryOptions(state, modalState.baseRow.type, categoryId);
    return `
      <select
        class="ft-duplicate-draft-modal__control"
        data-action="copy-field"
        data-copy-index="${copyIndex}"
        data-field-key="${fieldKey}"
      >
        <option value="">Keep empty</option>
        ${options.map(option => `
          <option value="${option.id}"${Number(copy.sub_category_id) === Number(option.id) ? ' selected' : ''}>
            ${_esc(option.sub_category)}
          </option>
        `).join('')}
      </select>
    `;
  }

  if (field.kind === 'repetitive') {
    const options = _getRepetitiveOptions(state, modalState.baseRow.type);
    return `
      <select
        class="ft-duplicate-draft-modal__control"
        data-action="copy-field"
        data-copy-index="${copyIndex}"
        data-field-key="${fieldKey}"
      >
        <option value="">No repetitive movement</option>
        ${options.map(option => `
          <option value="${option.id}"${Number(copy.repetitive_movement_id) === Number(option.id) ? ' selected' : ''}>
            ${_esc(option.movement)}
          </option>
        `).join('')}
      </select>
    `;
  }

  return `
    <input
      class="ft-duplicate-draft-modal__control"
      type="text"
      data-action="copy-field"
      data-copy-index="${copyIndex}"
      data-field-key="${fieldKey}"
      value="${_esc(copy[fieldKey] || '')}"
    />
  `;
}

function _renderCopiesTable(state, modalState) {
  if (modalState.mode !== 'dynamic') return '';

  if (modalState.selectedFields.length === 0) {
    return `
      <div class="ft-duplicate-draft-modal__empty">
        Select one or more fields to customize per copy. Unselected fields stay identical to the source row.
      </div>
    `;
  }

  return `
    <div class="ft-duplicate-draft-modal__table-wrap">
      <table class="ft-duplicate-draft-modal__table">
        <thead>
          <tr>
            <th>Copy</th>
            ${modalState.selectedFields.map(fieldKey => {
              const field = DUPLICATE_FIELDS.find(item => item.key === fieldKey);
              return `<th>${_esc(field?.label || fieldKey)}</th>`;
            }).join('')}
          </tr>
        </thead>
        <tbody>
          ${modalState.copies.map((copy, copyIndex) => `
            <tr>
              <td class="ft-duplicate-draft-modal__copy-label">#${copyIndex + 1}</td>
              ${modalState.selectedFields.map(fieldKey => `
                <td>${_renderInputCell(state, modalState, copy, copyIndex, fieldKey)}</td>
              `).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function _renderBody(overlay, state, modalState) {
  const title = modalState.mode === 'dynamic'
    ? 'Duplicate With Custom Fields'
    : 'Duplicate Draft Row';
  const subtitle = modalState.mode === 'dynamic'
    ? 'Choose how many copies to create, then edit only the fields that should vary.'
    : 'Create identical copies of this draft row.';

  overlay.innerHTML = `
    <div class="ft-duplicate-draft-modal" role="dialog" aria-modal="true" aria-labelledby="ft-duplicate-draft-modal-title">
      <div class="ft-duplicate-draft-modal__header">
        <div>
          <h2 id="ft-duplicate-draft-modal-title" class="ft-duplicate-draft-modal__title">${_esc(title)}</h2>
          <p class="ft-duplicate-draft-modal__subtitle">${_esc(subtitle)}</p>
        </div>
        <button type="button" class="ft-duplicate-draft-modal__close" data-action="close" aria-label="Close">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>

      <div class="ft-duplicate-draft-modal__body">
        ${_renderSourceSummary(modalState.baseRow)}

        <div class="ft-duplicate-draft-modal__section">
          <label class="ft-add-movements-toolbar__label" for="ft-duplicate-draft-count">Number of copies</label>
          <input
            id="ft-duplicate-draft-count"
            class="ft-duplicate-draft-modal__control ft-duplicate-draft-modal__count"
            type="number"
            inputmode="numeric"
            min="1"
            max="100"
            step="1"
            data-action="count"
            value="${_esc(modalState.count)}"
          />
          <p class="ft-duplicate-draft-modal__hint">
            ${modalState.count} duplicate${Number(modalState.count) === 1 ? '' : 's'} will be inserted right after the selected row.
          </p>
        </div>

        ${modalState.mode === 'dynamic' ? `
          <div class="ft-duplicate-draft-modal__section">
            <span class="ft-add-movements-toolbar__label">Fields that vary by copy</span>
            ${_renderFieldSelectors(modalState)}
          </div>

          <div class="ft-duplicate-draft-modal__section">
            <span class="ft-add-movements-toolbar__label">Copy values</span>
            ${_renderCopiesTable(state, modalState)}
          </div>
        ` : ''}
      </div>

      <div class="ft-duplicate-draft-modal__footer">
        <span class="ft-duplicate-draft-modal__message"></span>
        <div class="ft-duplicate-draft-modal__actions">
          <button type="button" class="ft-btn ft-btn--ghost" data-action="close">Cancel</button>
          <button type="button" class="ft-btn ft-btn--primary" data-action="submit">Duplicate</button>
        </div>
      </div>
    </div>
  `;
}

function _setMessage(text, isError = false) {
  const messageEl = _overlay?.querySelector('.ft-duplicate-draft-modal__message');
  if (!messageEl) return;
  messageEl.textContent = text || '';
  messageEl.className = isError
    ? 'ft-duplicate-draft-modal__message ft-duplicate-draft-modal__message--error'
    : 'ft-duplicate-draft-modal__message';
}

function _coerceCopyValue(fieldKey, rawValue) {
  if (fieldKey === 'amount') {
    return rawValue === '' ? null : Number(rawValue);
  }
  if (['category_id', 'sub_category_id', 'repetitive_movement_id'].includes(fieldKey)) {
    return rawValue === '' ? null : Number(rawValue);
  }
  return rawValue;
}

function _buildDuplicates(modalState) {
  return modalState.copies.map(copy => {
    const nextRow = { ...modalState.baseRow };
    modalState.selectedFields.forEach(fieldKey => {
      nextRow[fieldKey] = copy[fieldKey];
    });

    const subCategoryId = nextRow.sub_category_id == null ? null : Number(nextRow.sub_category_id);
    const categoryId = nextRow.category_id == null ? null : Number(nextRow.category_id);
    if (subCategoryId !== null && categoryId !== null) {
      const matchingSub = (modalState.state.subCategories || []).find(item => Number(item.id) === subCategoryId);
      if (!matchingSub || Number(matchingSub.category_id) !== categoryId) {
        nextRow.sub_category_id = null;
      }
    }

    return nextRow;
  });
}

function open({ mode = 'simple', row, state }, { onDuplicate } = {}) {
  close();

  const modalState = {
    mode,
    state,
    baseRow: _normalizeBaseRow(row),
    count: 1,
    selectedFields: [],
    copies: [_createCopySeed(_normalizeBaseRow(row))],
  };

  _overlay = document.createElement('div');
  _overlay.className = 'ft-duplicate-draft-modal-overlay';
  document.body.appendChild(_overlay);
  document.body.classList.add('ft-modal-open');

  const rerender = () => {
    _syncCopies(modalState);
    _renderBody(_overlay, state, modalState);
  };

  rerender();

  _overlay.addEventListener('click', event => {
    if (event.target === _overlay) {
      close();
      return;
    }

    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    if (action === 'close') {
      close();
      return;
    }

    if (action === 'toggle-field') {
      return;
    }

    if (action === 'submit') {
      const count = Number.parseInt(String(modalState.count || ''), 10);
      if (!Number.isInteger(count) || count < 1 || count > 100) {
        _setMessage('Enter a whole number of copies between 1 and 100.', true);
        _overlay.querySelector('[data-action="count"]')?.focus();
        return;
      }

      const duplicates = _buildDuplicates(modalState);
      close();
      onDuplicate?.(duplicates);
    }
  });

  _overlay.addEventListener('change', event => {
    const action = event.target.dataset.action;

    if (action === 'count') {
      modalState.count = Number.parseInt(String(event.target.value || ''), 10) || 1;
      rerender();
      _setMessage('');
      return;
    }

    if (action === 'toggle-field') {
      const fieldKey = String(event.target.dataset.fieldKey || '');
      if (!fieldKey) return;

      if (event.target.checked) {
        if (!modalState.selectedFields.includes(fieldKey)) modalState.selectedFields.push(fieldKey);
      } else {
        modalState.selectedFields = modalState.selectedFields.filter(item => item !== fieldKey);
      }

      rerender();
      _setMessage('');
      return;
    }

    if (action === 'copy-field') {
      const copyIndex = Number.parseInt(String(event.target.dataset.copyIndex || ''), 10);
      const fieldKey = String(event.target.dataset.fieldKey || '');
      if (!Number.isInteger(copyIndex) || !fieldKey || !modalState.copies[copyIndex]) return;

      modalState.copies[copyIndex][fieldKey] = _coerceCopyValue(fieldKey, event.target.value);

      if (fieldKey === 'category_id') {
        const categoryId = modalState.copies[copyIndex].category_id;
        const subCategoryId = modalState.copies[copyIndex].sub_category_id;
        const matchingSub = (state.subCategories || []).find(item => Number(item.id) === Number(subCategoryId));
        if (!matchingSub || Number(matchingSub.category_id) !== Number(categoryId)) {
          modalState.copies[copyIndex].sub_category_id = null;
        }
        rerender();
      }

      _setMessage('');
    }
  });

  _overlay.addEventListener('input', event => {
    if (event.target.dataset.action !== 'count') return;
    modalState.count = Number.parseInt(String(event.target.value || ''), 10) || 1;
    _setMessage('');
  });

  requestAnimationFrame(() => _overlay?.classList.add('ft-duplicate-draft-modal-overlay--open'));

  _keydownHandler = event => {
    if (event.key === 'Escape') close();
  };
  document.addEventListener('keydown', _keydownHandler);

  requestAnimationFrame(() => _overlay?.querySelector('#ft-duplicate-draft-count')?.focus());
}

function close() {
  if (_keydownHandler) {
    document.removeEventListener('keydown', _keydownHandler);
    _keydownHandler = null;
  }
  if (_overlay) {
    _overlay.remove();
    _overlay = null;
  }
  document.body.classList.remove('ft-modal-open');
}

export { open as openDuplicateDraftModal, close as closeDuplicateDraftModal };
