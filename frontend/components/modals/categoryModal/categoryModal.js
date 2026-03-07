/**
 * categoryModal.js
 *
 * Modal component for creating and editing categories, with inline
 * subcategory management. Follows the BankAccountModal / MovementModal
 * revealing-module pattern.
 *
 * Public API:
 *   CategoryModal.openNew(callbacks)                 → void
 *   CategoryModal.openEdit(category, subs, callbacks)→ void
 *   CategoryModal.openSubNew(category, callbacks)    → void
 *   CategoryModal.openSubEdit(sub, category, callbacks) → void
 *   CategoryModal.close()                            → void
 */

import { escapeHtml } from '../../../utils/formHelpers.js';

const CategoryModal = (() => {

  let activeModal = null;

  const INTEGER_FMT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  function _fmtCount(v) {
    const n = Number(v);
    return Number.isFinite(n) ? INTEGER_FMT.format(Math.max(0, Math.trunc(n))) : '0';
  }

  /* ── Close ──────────────────────────────────────────── */

  function close() {
    if (activeModal) {
      activeModal.remove();
      activeModal = null;
    }
  }

  function _mountBackdrop(html) {
    close();
    const backdrop = document.createElement('div');
    backdrop.className = 'ft-modal-backdrop';
    backdrop.innerHTML = html;
    document.body.appendChild(backdrop);
    activeModal = backdrop;

    backdrop.addEventListener('mousedown', e => {
      if (e.target === backdrop) close();
    });
    document.addEventListener('keydown', _handleEsc);
    return backdrop;
  }

  function _handleEsc(e) {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', _handleEsc);
    }
  }

  /* ── Open: New Category ─────────────────────────────── */

  function openNew(callbacks = {}) {
    const html = `
      <div class="ft-category-modal">
        <div class="ft-category-modal__header">
          <div class="ft-category-modal__header-main">
            <h2 class="ft-h3 ft-category-modal__title">New Category</h2>
            <button class="ft-category-modal__close-btn" data-action="close" aria-label="Close">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>
        <div class="ft-category-modal__body">
          <form class="ft-category-modal__form" id="category-modal-form">
            <div class="ft-category-modal__form-grid">
              <div class="ft-category-modal__field">
                <span>Category Name</span>
                <input type="text" name="category" placeholder="e.g. Groceries" required autocomplete="off" />
              </div>
              <div class="ft-category-modal__field">
                <span>Type</span>
                <select name="type" required>
                  <option value="">— Select —</option>
                  <option value="Income">Income</option>
                  <option value="Expense">Expense</option>
                </select>
              </div>
            </div>
          </form>
        </div>
        <div class="ft-category-modal__footer">
          <span class="ft-category-modal__message"></span>
          <div class="ft-category-modal__actions">
            <button class="ft-btn ft-btn--ghost" data-action="close">Cancel</button>
            <button class="ft-btn ft-btn--primary" data-action="save">
              <span class="material-symbols-outlined" aria-hidden="true">check</span>
              Create
            </button>
          </div>
        </div>
      </div>`;

    const backdrop = _mountBackdrop(html);
    const modal = backdrop.querySelector('.ft-category-modal');
    const form = modal.querySelector('#category-modal-form');
    const msgEl = modal.querySelector('.ft-category-modal__message');

    modal.querySelector('input[name="category"]')?.focus();

    backdrop.addEventListener('click', async e => {
      const action = e.target.closest('[data-action]')?.dataset?.action;
      if (action === 'close') return close();

      if (action === 'save') {
        const name = form.category.value.trim();
        const type = form.type.value;
        if (!name) return _showMsg(msgEl, 'Name is required.', true);
        if (!type) return _showMsg(msgEl, 'Type is required.', true);

        _showMsg(msgEl, 'Creating…');
        _disableActions(modal, true);
        try {
          await callbacks.onSave?.({ category: name, type });
          close();
        } catch (err) {
          _showMsg(msgEl, err?.message || 'Failed to create category.', true);
          _disableActions(modal, false);
        }
      }
    });
  }

  /* ── Open: Edit Category ────────────────────────────── */

  function openEdit(cat, subs = [], callbacks = {}) {
    const isInactive = Number(cat.active) === 0;
    const hasMovements = Number(cat.movements_count) > 0;
    const typeCls = cat.type === 'Income' ? 'income' : 'expense';

    const subsHtml = subs.length
      ? subs.map(s => _buildModalSubRow(s)).join('')
      : '<div class="ft-category-modal__sub-empty ft-small ft-text-muted">No subcategories yet</div>';

    const html = `
      <div class="ft-category-modal">
        <div class="ft-category-modal__header">
          <div class="ft-category-modal__header-main">
            <div class="ft-category-modal__title-wrap">
              <h2 class="ft-h3 ft-category-modal__title">${escapeHtml(cat.category)}</h2>
              <span class="ft-category-modal__chip ft-category-modal__chip--${typeCls}">${escapeHtml(cat.type)}</span>
              ${isInactive ? '<span class="ft-category-modal__status ft-category-modal__status--inactive">Inactive</span>' : '<span class="ft-category-modal__status">Active</span>'}
            </div>
            <button class="ft-category-modal__close-btn" data-action="close" aria-label="Close">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <div class="ft-category-modal__meta">
            <div class="ft-category-modal__meta-item">
              <span>Movements</span>
              <strong>${_fmtCount(cat.movements_count)}</strong>
            </div>
            <div class="ft-category-modal__meta-item">
              <span>Subcategories</span>
              <strong>${_fmtCount(cat.subcategories_count)}</strong>
            </div>
            <div class="ft-category-modal__meta-item">
              <span>ID</span>
              <strong>${cat.id}</strong>
            </div>
          </div>
        </div>

        <div class="ft-category-modal__body">
          <form class="ft-category-modal__form" id="category-modal-form">
            <div class="ft-category-modal__form-grid">
              <div class="ft-category-modal__field">
                <span>Category Name</span>
                <input type="text" name="category" value="${escapeHtml(cat.category)}" required autocomplete="off" />
              </div>
              <div class="ft-category-modal__field">
                <span>Type</span>
                <select name="type" required ${hasMovements ? 'disabled title="Cannot change type when category has movements"' : ''}>
                  <option value="Income" ${cat.type === 'Income' ? 'selected' : ''}>Income</option>
                  <option value="Expense" ${cat.type === 'Expense' ? 'selected' : ''}>Expense</option>
                </select>
              </div>
              <div class="ft-category-modal__field ft-category-modal__field--checkbox">
                <input type="checkbox" name="active" id="cat-modal-active" ${Number(cat.active) === 1 ? 'checked' : ''} />
                <span>Active</span>
              </div>
            </div>
          </form>

          ${hasMovements ? '<p class="ft-category-modal__hint ft-small ft-text-muted">Type cannot be changed because this category has existing movements.</p>' : ''}

          <!-- Subcategories section -->
          <div class="ft-category-modal__subs-section">
            <div class="ft-category-modal__subs-header">
              <h3 class="ft-label">Subcategories</h3>
              <button class="ft-btn ft-btn--ghost ft-btn--sm" data-action="add-sub">
                <span class="material-symbols-outlined" aria-hidden="true">add</span>
                Add
              </button>
            </div>
            <div class="ft-category-modal__subs-list" id="cat-modal-subs-list">
              ${subsHtml}
            </div>
          </div>
        </div>

        <div class="ft-category-modal__footer">
          <div class="ft-category-modal__danger-zone">
            <button class="ft-category-modal__trash-btn" data-action="soft-delete" title="Soft-delete category">
              <span class="material-symbols-outlined" aria-hidden="true">${isInactive ? 'restore' : 'delete'}</span>
            </button>
            <div class="ft-category-modal__confirm" hidden>
              <span class="ft-category-modal__confirm-label">${isInactive ? 'Restore?' : 'Delete?'}</span>
              <button class="ft-btn ft-btn--sm ft-category-modal__confirm-btn" data-action="confirm-toggle">
                ${isInactive ? 'Restore' : 'Delete'}
              </button>
              <button class="ft-btn ft-btn--ghost ft-btn--sm" data-action="cancel-delete">Cancel</button>
            </div>
          </div>
          <div class="ft-category-modal__right-footer">
            <span class="ft-category-modal__message"></span>
            <div class="ft-category-modal__actions">
              <button class="ft-btn ft-btn--primary" data-action="save">
                <span class="material-symbols-outlined" aria-hidden="true">check</span>
                Save
              </button>
            </div>
          </div>
        </div>
      </div>`;

    const backdrop = _mountBackdrop(html);
    const modal = backdrop.querySelector('.ft-category-modal');
    const form = modal.querySelector('#category-modal-form');
    const msgEl = modal.querySelector('.ft-category-modal__message');
    const confirmEl = modal.querySelector('.ft-category-modal__confirm');

    backdrop.addEventListener('click', async e => {
      const action = e.target.closest('[data-action]')?.dataset?.action;
      if (!action) return;

      if (action === 'close') return close();

      if (action === 'save') {
        const name = form.category.value.trim();
        const type = hasMovements ? cat.type : form.type.value;
        const active = form.active.checked ? 1 : 0;
        if (!name) return _showMsg(msgEl, 'Name is required.', true);

        _showMsg(msgEl, 'Saving…');
        _disableActions(modal, true);
        try {
          await callbacks.onSave?.(cat.id, { category: name, type, active });
          close();
        } catch (err) {
          _showMsg(msgEl, err?.message || 'Failed to save.', true);
          _disableActions(modal, false);
        }
      }

      if (action === 'soft-delete') {
        confirmEl.hidden = false;
      }
      if (action === 'cancel-delete') {
        confirmEl.hidden = true;
      }
      if (action === 'confirm-toggle') {
        _showMsg(msgEl, isInactive ? 'Restoring…' : 'Deleting…');
        _disableActions(modal, true);
        try {
          if (isInactive) {
            await callbacks.onSave?.(cat.id, { category: cat.category, type: cat.type, active: 1 });
          } else {
            await callbacks.onSoftDelete?.(cat.id);
          }
          close();
        } catch (err) {
          _showMsg(msgEl, err?.message || 'Operation failed.', true);
          _disableActions(modal, false);
          confirmEl.hidden = true;
        }
      }

      if (action === 'add-sub') {
        callbacks.onAddSub?.(cat);
      }

      if (action === 'edit-sub') {
        const subId = Number(e.target.closest('[data-sub-id]')?.dataset.subId);
        const sub = subs.find(s => s.id === subId);
        if (sub) callbacks.onEditSub?.(sub, cat);
      }

      if (action === 'soft-delete-sub') {
        const subId = Number(e.target.closest('[data-sub-id]')?.dataset.subId);
        const sub = subs.find(s => s.id === subId);
        if (sub) callbacks.onSoftDeleteSub?.(sub, cat);
      }
    });
  }

  /* ── Open: New Subcategory ──────────────────────────── */

  function openSubNew(category, callbacks = {}) {
    const html = `
      <div class="ft-category-modal ft-category-modal--narrow">
        <div class="ft-category-modal__header">
          <div class="ft-category-modal__header-main">
            <div class="ft-category-modal__title-wrap">
              <h2 class="ft-h3 ft-category-modal__title">New Subcategory</h2>
              <span class="ft-category-modal__chip">${escapeHtml(category.category)}</span>
            </div>
            <button class="ft-category-modal__close-btn" data-action="close" aria-label="Close">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>
        <div class="ft-category-modal__body">
          <form class="ft-category-modal__form" id="sub-category-modal-form">
            <div class="ft-category-modal__form-grid ft-category-modal__form-grid--single">
              <div class="ft-category-modal__field">
                <span>Subcategory Name</span>
                <input type="text" name="sub_category" placeholder="e.g. Supermarket" required autocomplete="off" />
              </div>
            </div>
          </form>
        </div>
        <div class="ft-category-modal__footer">
          <span class="ft-category-modal__message"></span>
          <div class="ft-category-modal__actions">
            <button class="ft-btn ft-btn--ghost" data-action="close">Cancel</button>
            <button class="ft-btn ft-btn--primary" data-action="save">
              <span class="material-symbols-outlined" aria-hidden="true">check</span>
              Create
            </button>
          </div>
        </div>
      </div>`;

    const backdrop = _mountBackdrop(html);
    const modal = backdrop.querySelector('.ft-category-modal');
    const form = modal.querySelector('#sub-category-modal-form');
    const msgEl = modal.querySelector('.ft-category-modal__message');

    modal.querySelector('input[name="sub_category"]')?.focus();

    backdrop.addEventListener('click', async e => {
      const action = e.target.closest('[data-action]')?.dataset?.action;
      if (action === 'close') return close();

      if (action === 'save') {
        const name = form.sub_category.value.trim();
        if (!name) return _showMsg(msgEl, 'Name is required.', true);

        _showMsg(msgEl, 'Creating…');
        _disableActions(modal, true);
        try {
          await callbacks.onSave?.({ sub_category: name, category_id: category.id });
          close();
        } catch (err) {
          _showMsg(msgEl, err?.message || 'Failed to create subcategory.', true);
          _disableActions(modal, false);
        }
      }
    });
  }

  /* ── Open: Edit Subcategory ─────────────────────────── */

  function openSubEdit(sub, category, callbacks = {}) {
    const isInactive = Number(sub.active) === 0;
    const hasMovements = Number(sub.movements_count) > 0;

    const html = `
      <div class="ft-category-modal ft-category-modal--narrow">
        <div class="ft-category-modal__header">
          <div class="ft-category-modal__header-main">
            <div class="ft-category-modal__title-wrap">
              <h2 class="ft-h3 ft-category-modal__title">${escapeHtml(sub.sub_category)}</h2>
              <span class="ft-category-modal__chip">${escapeHtml(category.category)}</span>
              ${isInactive ? '<span class="ft-category-modal__status ft-category-modal__status--inactive">Inactive</span>' : '<span class="ft-category-modal__status">Active</span>'}
            </div>
            <button class="ft-category-modal__close-btn" data-action="close" aria-label="Close">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <div class="ft-category-modal__meta">
            <div class="ft-category-modal__meta-item">
              <span>Movements</span>
              <strong>${_fmtCount(sub.movements_count)}</strong>
            </div>
            <div class="ft-category-modal__meta-item">
              <span>Parent Category</span>
              <strong>${escapeHtml(category.category)}</strong>
            </div>
            <div class="ft-category-modal__meta-item">
              <span>ID</span>
              <strong>${sub.id}</strong>
            </div>
          </div>
        </div>
        <div class="ft-category-modal__body">
          <form class="ft-category-modal__form" id="sub-category-modal-form">
            <div class="ft-category-modal__form-grid ft-category-modal__form-grid--single">
              <div class="ft-category-modal__field">
                <span>Subcategory Name</span>
                <input type="text" name="sub_category" value="${escapeHtml(sub.sub_category)}" required autocomplete="off" />
              </div>
              <div class="ft-category-modal__field ft-category-modal__field--checkbox">
                <input type="checkbox" name="active" id="sub-modal-active" ${Number(sub.active) === 1 ? 'checked' : ''} />
                <span>Active</span>
              </div>
            </div>
          </form>
          ${hasMovements ? '<p class="ft-category-modal__hint ft-small ft-text-muted">Parent category cannot be changed because this subcategory has existing movements.</p>' : ''}
        </div>
        <div class="ft-category-modal__footer">
          <div class="ft-category-modal__danger-zone">
            <button class="ft-category-modal__trash-btn" data-action="soft-delete-trigger" title="${isInactive ? 'Restore' : 'Soft-delete'} subcategory">
              <span class="material-symbols-outlined" aria-hidden="true">${isInactive ? 'restore' : 'delete'}</span>
            </button>
            <div class="ft-category-modal__confirm" hidden>
              <span class="ft-category-modal__confirm-label">${isInactive ? 'Restore?' : 'Delete?'}</span>
              <button class="ft-btn ft-btn--sm ft-category-modal__confirm-btn" data-action="confirm-toggle-sub">
                ${isInactive ? 'Restore' : 'Delete'}
              </button>
              <button class="ft-btn ft-btn--ghost ft-btn--sm" data-action="cancel-delete">Cancel</button>
            </div>
          </div>
          <div class="ft-category-modal__right-footer">
            <span class="ft-category-modal__message"></span>
            <div class="ft-category-modal__actions">
              <button class="ft-btn ft-btn--primary" data-action="save">
                <span class="material-symbols-outlined" aria-hidden="true">check</span>
                Save
              </button>
            </div>
          </div>
        </div>
      </div>`;

    const backdrop = _mountBackdrop(html);
    const modal = backdrop.querySelector('.ft-category-modal');
    const form = modal.querySelector('#sub-category-modal-form');
    const msgEl = modal.querySelector('.ft-category-modal__message');
    const confirmEl = modal.querySelector('.ft-category-modal__confirm');

    backdrop.addEventListener('click', async e => {
      const action = e.target.closest('[data-action]')?.dataset?.action;
      if (!action) return;

      if (action === 'close') return close();

      if (action === 'save') {
        const name = form.sub_category.value.trim();
        const active = form.active.checked ? 1 : 0;
        if (!name) return _showMsg(msgEl, 'Name is required.', true);

        _showMsg(msgEl, 'Saving…');
        _disableActions(modal, true);
        try {
          await callbacks.onSave?.(sub.id, { sub_category: name, category_id: category.id, active });
          close();
        } catch (err) {
          _showMsg(msgEl, err?.message || 'Failed to save.', true);
          _disableActions(modal, false);
        }
      }

      if (action === 'soft-delete-trigger') {
        confirmEl.hidden = false;
      }
      if (action === 'cancel-delete') {
        confirmEl.hidden = true;
      }
      if (action === 'confirm-toggle-sub') {
        _showMsg(msgEl, isInactive ? 'Restoring…' : 'Deleting…');
        _disableActions(modal, true);
        try {
          if (isInactive) {
            await callbacks.onSave?.(sub.id, { sub_category: sub.sub_category, category_id: category.id, active: 1 });
          } else {
            await callbacks.onSoftDelete?.(sub.id);
          }
          close();
        } catch (err) {
          _showMsg(msgEl, err?.message || 'Operation failed.', true);
          _disableActions(modal, false);
          confirmEl.hidden = true;
        }
      }
    });
  }

  /* ── Private: modal sub-row ─────────────────────────── */

  function _buildModalSubRow(sub) {
    const isInactive = Number(sub.active) === 0;
    const inactiveCls = isInactive ? ' ft-category-modal__sub-row--inactive' : '';

    return `
      <div class="ft-category-modal__sub-row${inactiveCls}" data-sub-id="${sub.id}">
        <div class="ft-category-modal__sub-info">
          <span class="ft-category-modal__sub-name">${escapeHtml(sub.sub_category)}</span>
          <span class="ft-small ft-text-muted">${_fmtCount(sub.movements_count)} mov.</span>
          ${isInactive ? '<span class="ft-category-modal__sub-badge--inactive">Inactive</span>' : ''}
        </div>
        <div class="ft-category-modal__sub-actions">
          <button class="ft-category-modal__sub-btn" data-action="edit-sub" data-sub-id="${sub.id}" title="Edit">
            <span class="material-symbols-outlined" aria-hidden="true">edit</span>
          </button>
          <button class="ft-category-modal__sub-btn ft-category-modal__sub-btn--danger" data-action="soft-delete-sub" data-sub-id="${sub.id}" title="${isInactive ? 'Restore' : 'Delete'}">
            <span class="material-symbols-outlined" aria-hidden="true">${isInactive ? 'restore' : 'delete'}</span>
          </button>
        </div>
      </div>`;
  }

  /* ── Private: helpers ───────────────────────────────── */

  function _showMsg(el, text, isError = false) {
    if (!el) return;
    el.textContent = text;
    el.className = 'ft-category-modal__message' + (isError ? ' ft-category-modal__message--error' : '');
  }

  function _disableActions(modal, disabled) {
    modal.querySelectorAll('.ft-btn').forEach(btn => btn.disabled = disabled);
  }

  /* ── Public API ─────────────────────────────────────── */

  return { openNew, openEdit, openSubNew, openSubEdit, close };
})();

export { CategoryModal };
