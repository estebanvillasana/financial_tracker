/**
 * repetitiveMovementModal.js
 *
 * Modal for creating and editing repetitive movements.
 * Follows the BankAccountModal / CategoryModal revealing-module pattern.
 *
 * Public API:
 *   RepetitiveMovementModal.openNew(callbacks)           → void
 *   RepetitiveMovementModal.openEdit(item, callbacks)    → void
 *   RepetitiveMovementModal.close()                      → void
 */

import { escapeHtml } from '../../../utils/formHelpers.js';

const RepetitiveMovementModal = (() => {

  let activeModal = null;

  const INTEGER_FMT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

  /* ── Close ──────────────────────────────────────────── */

  function close() {
    if (activeModal) {
      activeModal.remove();
      activeModal = null;
    }
    document.removeEventListener('keydown', _handleEsc);
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
    if (e.key === 'Escape') close();
  }

  /* ── Open: New ──────────────────────────────────────── */

  function openNew(callbacks = {}) {
    const html = `
      <div class="ft-rm-modal">
        <div class="ft-rm-modal__header">
          <div class="ft-rm-modal__header-main">
            <h2 class="ft-h3 ft-rm-modal__title">New Repetitive Movement</h2>
            <button class="ft-rm-modal__close-btn" data-action="close" aria-label="Close">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>
        <div class="ft-rm-modal__body">
          <form class="ft-rm-modal__form" id="rm-modal-form">
            <div class="ft-rm-modal__form-grid">
              <div class="ft-rm-modal__field ft-rm-modal__field--wide">
                <span>Movement Name</span>
                <input type="text" name="movement" placeholder="e.g. Netflix, Salary" required autocomplete="off" />
              </div>
              <div class="ft-rm-modal__field">
                <span>Type</span>
                <select name="type" required id="rm-type-select">
                  <option value="">— Select —</option>
                  <option value="Income">Income</option>
                  <option value="Expense">Expense</option>
                </select>
              </div>
              <div class="ft-rm-modal__field ft-rm-modal__field--checkbox">
                <input type="checkbox" name="tax_report" />
                <span>Taxable (tax report)</span>
              </div>
              <div class="ft-rm-modal__field ft-rm-modal__field--wide">
                <span>Description</span>
                <textarea name="description" rows="2" placeholder="Optional description"></textarea>
              </div>
              <div class="ft-rm-modal__field ft-rm-modal__field--checkbox" id="rm-subscription-field" style="display:none;">
                <input type="checkbox" name="is_subscription" />
                <span>This is a subscription</span>
              </div>
            </div>
          </form>
        </div>
        <div class="ft-rm-modal__footer">
          <span class="ft-rm-modal__message"></span>
          <div class="ft-rm-modal__actions">
            <button class="ft-btn ft-btn--ghost" data-action="close">Cancel</button>
            <button class="ft-btn ft-btn--primary" data-action="save">
              <span class="material-symbols-outlined" aria-hidden="true">check</span>
              Create
            </button>
          </div>
        </div>
      </div>`;

    const backdrop = _mountBackdrop(html);
    const modal = backdrop.querySelector('.ft-rm-modal');
    const form = modal.querySelector('#rm-modal-form');
    const msgEl = modal.querySelector('.ft-rm-modal__message');
    const subField = modal.querySelector('#rm-subscription-field');
    const typeSelect = modal.querySelector('#rm-type-select');

    modal.querySelector('input[name="movement"]')?.focus();

    // Show subscription checkbox only for Expense type
    typeSelect.addEventListener('change', () => {
      subField.style.display = typeSelect.value === 'Expense' ? '' : 'none';
      if (typeSelect.value !== 'Expense') {
        form.is_subscription.checked = false;
      }
    });

    backdrop.addEventListener('click', async e => {
      const action = e.target.closest('[data-action]')?.dataset?.action;
      if (action === 'close') return close();

      if (action === 'save') {
        const name = form.movement.value.trim();
        const type = form.type.value;
        if (!name) return _showMsg(msgEl, 'Name is required.', true);
        if (!type) return _showMsg(msgEl, 'Type is required.', true);

        const payload = {
          movement: name,
          description: form.description.value.trim() || null,
          type,
          tax_report: form.tax_report.checked ? 1 : 0,
          active_subscription: type === 'Expense' && form.is_subscription.checked ? 1 : null,
        };

        _showMsg(msgEl, 'Creating…');
        _disableActions(modal, true);
        try {
          await callbacks.onSave?.(payload);
          close();
        } catch (err) {
          _showMsg(msgEl, err?.message || 'Failed to create.', true);
          _disableActions(modal, false);
        }
      }
    });
  }

  /* ── Open: Edit ─────────────────────────────────────── */

  function openEdit(item, callbacks = {}) {
    const isInactive = Number(item.active) === 0;
    const hasMovements = Number(item.movements_count) > 0;
    const isSub = item.active_subscription !== null && item.active_subscription !== undefined;
    const typeCls = item.type === 'Income' ? 'income' : 'expense';
    const showSubField = item.type === 'Expense';

    const html = `
      <div class="ft-rm-modal">
        <div class="ft-rm-modal__header">
          <div class="ft-rm-modal__header-main">
            <div class="ft-rm-modal__title-wrap">
              <h2 class="ft-h3 ft-rm-modal__title">${escapeHtml(item.movement)}</h2>
              <span class="ft-rm-modal__chip ft-rm-modal__chip--${typeCls}">${escapeHtml(item.type)}</span>
              ${Number(item.tax_report) === 1 ? '<span class="ft-rm-modal__chip ft-rm-modal__chip--tax">Taxable</span>' : ''}
              ${isSub ? `<span class="ft-rm-modal__chip ft-rm-modal__chip--sub">${Number(item.active_subscription) === 1 ? 'Subscription' : 'Cancelled Sub'}</span>` : ''}
              ${isInactive ? '<span class="ft-rm-modal__status ft-rm-modal__status--inactive">Inactive</span>' : '<span class="ft-rm-modal__status">Active</span>'}
            </div>
            <button class="ft-rm-modal__close-btn" data-action="close" aria-label="Close">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <div class="ft-rm-modal__meta">
            <div class="ft-rm-modal__meta-item">
              <span>Movements</span>
              <strong>${INTEGER_FMT.format(Number(item.movements_count) || 0)}</strong>
            </div>
            <div class="ft-rm-modal__meta-item">
              <span>Tax Report</span>
              <strong>${Number(item.tax_report) === 1 ? 'Yes' : 'No'}</strong>
            </div>
            <div class="ft-rm-modal__meta-item">
              <span>ID</span>
              <strong>${item.id}</strong>
            </div>
          </div>
        </div>

        <div class="ft-rm-modal__body">
          <form class="ft-rm-modal__form" id="rm-modal-form">
            <div class="ft-rm-modal__form-grid">
              <div class="ft-rm-modal__field ft-rm-modal__field--wide">
                <span>Movement Name</span>
                <input type="text" name="movement" value="${escapeHtml(item.movement)}" required autocomplete="off" />
              </div>
              <div class="ft-rm-modal__field">
                <span>Type</span>
                <select name="type" required id="rm-type-select" ${hasMovements ? 'disabled title="Cannot change type when movements exist"' : ''}>
                  <option value="Income" ${item.type === 'Income' ? 'selected' : ''}>Income</option>
                  <option value="Expense" ${item.type === 'Expense' ? 'selected' : ''}>Expense</option>
                </select>
              </div>
              <div class="ft-rm-modal__field ft-rm-modal__field--checkbox">
                <input type="checkbox" name="tax_report" ${Number(item.tax_report) === 1 ? 'checked' : ''} />
                <span>Taxable (tax report)</span>
              </div>
              <div class="ft-rm-modal__field ft-rm-modal__field--wide">
                <span>Description</span>
                <textarea name="description" rows="2">${escapeHtml(item.description || '')}</textarea>
              </div>
              <div class="ft-rm-modal__field ft-rm-modal__field--checkbox" id="rm-subscription-field" style="${showSubField ? '' : 'display:none;'}">
                <input type="checkbox" name="is_subscription" ${isSub ? 'checked' : ''} />
                <span>This is a subscription</span>
              </div>
              <div class="ft-rm-modal__field ft-rm-modal__field--checkbox" id="rm-sub-active-field" style="${isSub && showSubField ? '' : 'display:none;'}">
                <input type="checkbox" name="sub_active" ${Number(item.active_subscription) === 1 ? 'checked' : ''} />
                <span>Subscription is active</span>
              </div>
            </div>
          </form>
          ${hasMovements ? '<p class="ft-rm-modal__hint ft-small ft-text-muted">Type cannot be changed because this item has existing movements.</p>' : ''}
        </div>

        <div class="ft-rm-modal__footer">
          <div class="ft-rm-modal__danger-zone">
            <button class="ft-rm-modal__trash-btn" data-action="soft-delete-trigger" title="${isInactive ? 'Restore' : 'Soft-delete'}">
              <span class="material-symbols-outlined" aria-hidden="true">${isInactive ? 'restore' : 'delete'}</span>
            </button>
            <div class="ft-rm-modal__confirm" hidden>
              <span class="ft-rm-modal__confirm-label">${isInactive ? 'Restore?' : 'Delete?'}</span>
              <button class="ft-btn ft-btn--sm ft-rm-modal__confirm-btn" data-action="confirm-toggle">${isInactive ? 'Restore' : 'Delete'}</button>
              <button class="ft-btn ft-btn--ghost ft-btn--sm" data-action="cancel-delete">Cancel</button>
            </div>
          </div>
          <div class="ft-rm-modal__right-footer">
            <span class="ft-rm-modal__message"></span>
            <div class="ft-rm-modal__actions">
              <button class="ft-btn ft-btn--primary" data-action="save">
                <span class="material-symbols-outlined" aria-hidden="true">check</span>
                Save
              </button>
            </div>
          </div>
        </div>
      </div>`;

    const backdrop = _mountBackdrop(html);
    const modal = backdrop.querySelector('.ft-rm-modal');
    const form = modal.querySelector('#rm-modal-form');
    const msgEl = modal.querySelector('.ft-rm-modal__message');
    const confirmEl = modal.querySelector('.ft-rm-modal__confirm');
    const subField = modal.querySelector('#rm-subscription-field');
    const subActiveField = modal.querySelector('#rm-sub-active-field');
    const typeSelect = modal.querySelector('#rm-type-select');

    // Show/hide subscription fields based on type
    typeSelect.addEventListener('change', () => {
      const isExpense = typeSelect.value === 'Expense';
      subField.style.display = isExpense ? '' : 'none';
      subActiveField.style.display = isExpense && form.is_subscription.checked ? '' : 'none';
      if (!isExpense) {
        form.is_subscription.checked = false;
        form.sub_active.checked = false;
      }
    });

    form.is_subscription?.addEventListener('change', () => {
      subActiveField.style.display = form.is_subscription.checked ? '' : 'none';
      if (!form.is_subscription.checked) form.sub_active.checked = false;
    });

    backdrop.addEventListener('click', async e => {
      const action = e.target.closest('[data-action]')?.dataset?.action;
      if (!action) return;

      if (action === 'close') return close();

      if (action === 'save') {
        const name = form.movement.value.trim();
        const type = hasMovements ? item.type : form.type.value;
        if (!name) return _showMsg(msgEl, 'Name is required.', true);

        const isSub = type === 'Expense' && form.is_subscription.checked;
        const payload = {
          movement: name,
          description: form.description.value.trim() || null,
          type,
          tax_report: form.tax_report.checked ? 1 : 0,
          active_subscription: isSub ? (form.sub_active.checked ? 1 : 0) : null,
        };

        _showMsg(msgEl, 'Saving…');
        _disableActions(modal, true);
        try {
          await callbacks.onSave?.(item.id, payload);
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
      if (action === 'confirm-toggle') {
        _showMsg(msgEl, isInactive ? 'Restoring…' : 'Deleting…');
        _disableActions(modal, true);
        try {
          if (isInactive) {
            await callbacks.onRestore?.(item.id);
          } else {
            await callbacks.onSoftDelete?.(item.id);
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

  /* ── Private helpers ────────────────────────────────── */

  function _showMsg(el, text, isError = false) {
    if (!el) return;
    el.textContent = text;
    el.className = 'ft-rm-modal__message' + (isError ? ' ft-rm-modal__message--error' : '');
  }

  function _disableActions(modal, disabled) {
    modal.querySelectorAll('.ft-btn').forEach(btn => btn.disabled = disabled);
  }

  return { openNew, openEdit, close };
})();

export { RepetitiveMovementModal };
