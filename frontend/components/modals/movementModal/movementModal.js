/**
 * movementModal.js
 *
 * Modal dialog for viewing / editing a single movement.
 * Follows the same Revealing Module (IIFE) pattern as BankAccountModal.
 *
 * Public API:
 *   MovementModal.open(movement, config, options)  → Promise<HTMLElement|null>
 *   MovementModal.buildHTML(movement, config)       → string
 *   MovementModal.close()                           → void
 *
 * config: { accounts, categories, subCategories }
 *
 * Option callbacks (all optional):
 *   options.onSave(id, payload, movement)
 *   options.onSoftDelete(id, movement)
 *   options.onClose(movement)
 *
 * Custom events dispatched on the modal root:
 *   'movement-modal:save'        — detail: { id, payload, movement }
 *   'movement-modal:soft-delete' — detail: { id, movement }
 */
import { DatePicker } from '../../dumb/datePicker/datePicker.js';
import {
  normalizeCurrency,
  formatDateDisplay,
} from '../../../utils/formatters.js';
import { isValidIsoDate } from '../../../utils/validators.js';
import {
  escapeHtml as _esc,
  stripNumeric as _strip,
  toCents as _toCents,
  rawAmount as _rawAmount,
  formatAmountDisplay as _formatDisplay,
  findAccount as _findAccount,
  buildAccountOptions,
  buildCategoryOptions as _categoryOpts,
  buildSubCategoryOptions as _subCategoryOpts,
} from '../../../utils/formHelpers.js';

const MovementModal = (() => {

  let activeModal = null;
  let _activePickerCleanup = null;

  /* ── Private helpers ────────────────────────────────────── */

  function _repOpts(reps, selectedId, typeFilter = null) {
    const opts = ['<option value="">\u2014 None \u2014</option>'];
    const list = typeFilter ? reps.filter(r => r.type === typeFilter) : reps;
    for (const r of list) {
      const sel = r.id === selectedId ? ' selected' : '';
      opts.push(`<option value="${r.id}"${sel}>${_esc(r.movement)}</option>`);
    }
    return opts.join('');
  }

  /**
   * Builds account options without the blank placeholder option.
   * The modal always pre-selects the current account.
   */
  function _accountOpts(accounts, selectedId) {
    return buildAccountOptions(accounts, selectedId, /* blank= */ false);
  }

  /* ── Build HTML ─────────────────────────────────────────── */

  function buildHTML(movement, config = {}) {
    const { accounts = [], categories = [], subCategories = [], repetitiveMovements = [] } = config;
    const m = movement || {};
    const acc = _findAccount(accounts, m.account_id);
    const amountDisplay = _formatDisplay(String((m.value || 0) / 100), acc?.currency);
    const isActive = m.active !== 0;

    return `
      <div class="ft-modal-backdrop ft-movement-modal-backdrop" data-modal-close>
        <section class="ft-movement-modal" role="dialog" aria-modal="true" aria-label="Movement details">
          <header class="ft-movement-modal__header">
            <div class="ft-movement-modal__header-main">
              <div class="ft-movement-modal__title-wrap">
                <h2 class="ft-h3 ft-movement-modal__title">${_esc(m.movement || 'Movement')}</h2>
                <span class="ft-movement-modal__chip">ID ${_esc(m.id)}</span>
                ${m.movement_code ? `<span class="ft-movement-modal__chip ft-movement-modal__chip--code">${_esc(m.movement_code)}</span>` : ''}
                <span class="ft-movement-modal__status${isActive ? '' : ' ft-movement-modal__status--inactive'}">
                  ${isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <button type="button" class="ft-movement-modal__close-btn" data-modal-close aria-label="Close modal">
                <span class="material-symbols-outlined" aria-hidden="true">close</span>
              </button>
            </div>
          </header>

          <div class="ft-movement-modal__body">
            <form class="ft-movement-modal__form" id="ft-movement-form" data-movement-form>
              <div class="ft-movement-modal__form-grid">
                <label class="ft-movement-modal__field">
                  <span>Movement Name</span>
                  <input type="text" name="movement" value="${_esc(m.movement)}" required />
                </label>
                <label class="ft-movement-modal__field">
                  <span>Account</span>
                  <select name="account_id" required>${_accountOpts(accounts, m.account_id)}</select>
                </label>
                <label class="ft-movement-modal__field">
                  <span>Type</span>
                  <select name="type" required>
                    <option value="Expense"${m.type === 'Expense' ? ' selected' : ''}>Expense</option>
                    <option value="Income"${m.type === 'Income' ? ' selected' : ''}>Income</option>
                  </select>
                </label>
                <label class="ft-movement-modal__field">
                  <span id="mm-amount-label">Amount${acc ? ` (${normalizeCurrency(acc.currency)})` : ''}</span>
                  <input type="text" name="amount" inputmode="decimal"
                         value="${_esc(amountDisplay)}"
                         class="ft-movement-modal__amount-input" required />
                </label>
                <label class="ft-movement-modal__field">
                  <span>Category</span>
                  <select name="category_id">${_categoryOpts(categories, m.type, m.category_id)}</select>
                </label>
                <label class="ft-movement-modal__field">
                  <span>Sub-category</span>
                  <select name="sub_category_id">${_subCategoryOpts(subCategories, m.type, m.category_id, m.sub_category_id)}</select>
                </label>
                <div class="ft-movement-modal__field">
                  <span>Date</span>
                  <div class="ft-movement-modal__date-host" id="mm-date-host"></div>
                  <input type="hidden" name="date" value="${_esc(m.date)}" id="mm-date-hidden" />
                </div>
                <label class="ft-movement-modal__field">
                  <span>Repetitive Movement</span>
                  <select name="repetitive_movement_id">${_repOpts(repetitiveMovements, m.repetitive_movement_id, m.type)}</select>
                </label>
                <label class="ft-movement-modal__field ft-movement-modal__field--checkbox">
                  <input type="checkbox" name="invoice" value="1"${m.invoice === 1 ? ' checked' : ''}>
                  <span>Has Invoice</span>
                </label>
                <label class="ft-movement-modal__field ft-movement-modal__field--wide">
                  <span>Description</span>
                  <textarea name="description" rows="2">${_esc(m.description || '')}</textarea>
                </label>
              </div>
            </form>
          </div>

          <footer class="ft-movement-modal__footer">
            <div class="ft-movement-modal__danger-zone">
              <button type="button" class="ft-movement-modal__trash-btn" data-soft-delete-request
                      aria-label="Soft-delete" title="Soft-delete">
                <span class="material-symbols-outlined" aria-hidden="true">delete</span>
              </button>
              <div class="ft-movement-modal__confirm" data-soft-delete-confirm hidden>
                <span class="ft-movement-modal__confirm-label">Soft-delete this movement?</span>
                <button type="button" class="ft-btn ft-btn--ghost" data-soft-delete-cancel>Cancel</button>
                <button type="button" class="ft-btn ft-movement-modal__confirm-btn" data-soft-delete>Confirm</button>
              </div>
            </div>
            <div class="ft-movement-modal__message" data-movement-message aria-live="polite"></div>
            <div class="ft-movement-modal__actions">
              <button type="button" class="ft-btn ft-btn--ghost" data-modal-close>Close</button>
              <button type="submit" class="ft-btn ft-btn--primary" form="ft-movement-form" data-save-movement>Save</button>
            </div>
          </footer>
        </section>
      </div>`;
  }

  /* ── Mount DatePicker ───────────────────────────────────── */

  function _mountDatePicker(modalRoot) {
    const host = modalRoot.querySelector('#mm-date-host');
    const hidden = modalRoot.querySelector('#mm-date-hidden');
    if (!host || !hidden) return null;

    const pickerField = DatePicker.createPickerField(
      'Date',
      hidden.value || new Date().toISOString().slice(0, 10),
      isoDate => { hidden.value = isoDate; },
    );
    host.appendChild(pickerField);
    return pickerField._cleanup ?? null;
  }

  /* ── Cascading selects + amount formatting ──────────────── */

  function _wireDynamicFields(modalRoot, config) {
    const { accounts = [], categories = [], subCategories = [], repetitiveMovements = [] } = config;
    const form = modalRoot.querySelector('[data-movement-form]');
    if (!form) return;

    const typeSelect = form.querySelector('[name="type"]');
    const catSelect = form.querySelector('[name="category_id"]');
    const subSelect = form.querySelector('[name="sub_category_id"]');
    const repSelect = form.querySelector('[name="repetitive_movement_id"]');
    const accSelect = form.querySelector('[name="account_id"]');
    const amtInput = form.querySelector('[name="amount"]');
    const amtLabel = modalRoot.querySelector('#mm-amount-label');

    /* Type → re-populate categories, clear subcategory, filter repetitive movements */
    typeSelect?.addEventListener('change', () => {
      catSelect.innerHTML = _categoryOpts(categories, typeSelect.value, '');
      subSelect.innerHTML = '<option value="">\u2014</option>';
      if (repSelect) repSelect.innerHTML = _repOpts(repetitiveMovements, null, typeSelect.value);
    });

    /* Category → re-populate subcategories */
    catSelect?.addEventListener('change', () => {
      subSelect.innerHTML = _subCategoryOpts(
        subCategories, typeSelect.value, catSelect.value, '',
      );
    });

    /* Account → re-format amount label + value */
    accSelect?.addEventListener('change', () => {
      const acc = _findAccount(accounts, Number(accSelect.value));
      if (amtLabel) {
        amtLabel.textContent = acc ? `Amount (${normalizeCurrency(acc.currency)})` : 'Amount';
      }
      if (amtInput?.value) {
        amtInput.value = _formatDisplay(_rawAmount(amtInput.value), acc?.currency);
      }
    });

    /* Amount blur → format with currency */
    amtInput?.addEventListener('blur', () => {
      const acc = _findAccount(accounts, Number(accSelect?.value));
      amtInput.value = _formatDisplay(amtInput.value, acc?.currency);
    });

    /* Amount focus → strip to raw decimal */
    amtInput?.addEventListener('focus', () => {
      const raw = _rawAmount(amtInput.value);
      if (raw) amtInput.value = raw;
      amtInput.select();
    });
  }

  /* ── Collect form data ──────────────────────────────────── */

  function _collectFormData(modalRoot) {
    const form = modalRoot.querySelector('[data-movement-form]');
    const data = new FormData(form);
    const amountStr = data.get('amount') || '';
    const cents = _toCents(amountStr);

    return {
      movement: String(data.get('movement') || '').trim(),
      description: String(data.get('description') || '').trim() || null,
      account_id: Number(data.get('account_id')) || 0,
      value: cents,
      type: String(data.get('type') || ''),
      date: String(data.get('date') || ''),
      category_id: Number(data.get('category_id')) || null,
      sub_category_id: Number(data.get('sub_category_id')) || null,
      repetitive_movement_id: Number(data.get('repetitive_movement_id')) || null,
      invoice: data.get('invoice') !== null ? 1 : 0,
    };
  }

  function _validate(payload) {
    const errors = [];
    if (!payload.movement) errors.push('Movement name is required.');
    if (!payload.account_id) errors.push('Account is required.');
    if (!payload.type) errors.push('Type is required.');
    if (!isValidIsoDate(payload.date)) errors.push('Valid date is required.');
    if (!payload.value) errors.push('Amount must be a positive number.');
    return errors;
  }

  /* ── Status message ─────────────────────────────────────── */

  function _setMessage(modalRoot, message, kind = 'info') {
    const el = modalRoot.querySelector('[data-movement-message]');
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('ft-movement-modal__message--error', kind === 'error');
  }

  /* ── Close ──────────────────────────────────────────────── */

  function _closeModal() {
    _activePickerCleanup?.();
    _activePickerCleanup = null;
    if (!activeModal) return;
    activeModal.remove();
    activeModal = null;
    document.body.style.removeProperty('overflow');
  }

  /* ── Wire events ────────────────────────────────────────── */

  function _wireEvents(modalRoot, movement, config, options = {}) {
    const onSave = typeof options.onSave === 'function' ? options.onSave : null;
    const onSoftDelete = typeof options.onSoftDelete === 'function' ? options.onSoftDelete : null;
    const onClose = typeof options.onClose === 'function' ? options.onClose : null;

    /* Click delegation: close, soft-delete request/cancel/confirm */
    modalRoot.addEventListener('click', async event => {
      const closeTarget = event.target.closest('[data-modal-close]');

      if (closeTarget && event.target === modalRoot) {
        onClose?.(movement); _closeModal(); return;
      }
      if (closeTarget && closeTarget !== modalRoot) {
        onClose?.(movement); _closeModal(); return;
      }

      if (event.target.closest('[data-soft-delete-request]')) {
        const confirmEl = modalRoot.querySelector('[data-soft-delete-confirm]');
        if (confirmEl) confirmEl.hidden = false;
        return;
      }
      if (event.target.closest('[data-soft-delete-cancel]')) {
        const confirmEl = modalRoot.querySelector('[data-soft-delete-confirm]');
        if (confirmEl) confirmEl.hidden = true;
        return;
      }

      if (!event.target.closest('[data-soft-delete]')) return;

      const detail = { id: movement.id, movement };
      modalRoot.dispatchEvent(new CustomEvent('movement-modal:soft-delete', { bubbles: true, detail }));

      if (!onSoftDelete) return;
      try {
        _setMessage(modalRoot, 'Deleting movement…');
        await onSoftDelete(movement.id, movement);
        _setMessage(modalRoot, 'Movement deleted.');
      } catch (err) {
        _setMessage(modalRoot, err?.message || 'Delete failed.', 'error');
      }
    });

    /* Form submission */
    modalRoot.addEventListener('submit', async event => {
      if (!event.target.closest('[data-movement-form]')) return;
      event.preventDefault();

      const payload = _collectFormData(modalRoot);
      const errors = _validate(payload);
      if (errors.length) {
        _setMessage(modalRoot, errors.join(' '), 'error');
        return;
      }

      const detail = { id: movement.id, payload, movement };
      modalRoot.dispatchEvent(new CustomEvent('movement-modal:save', { bubbles: true, detail }));

      if (!onSave) return;
      try {
        _setMessage(modalRoot, 'Saving…');
        await onSave(movement.id, payload, movement);
        _setMessage(modalRoot, 'Changes saved.');
      } catch (err) {
        _setMessage(modalRoot, err?.message || 'Save failed.', 'error');
      }
    });

    /* Escape key */
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !activeModal) return;
      onClose?.(movement); _closeModal();
    }, { once: true });
  }

  /* ── Public API ─────────────────────────────────────────── */

  async function open(movement, config = {}, options = {}) {
    _closeModal();

    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildHTML(movement, config).trim();
    const modalRoot = wrapper.firstElementChild;
    if (!modalRoot) return null;

    document.body.appendChild(modalRoot);
    document.body.style.overflow = 'hidden';
    activeModal = modalRoot;

    _activePickerCleanup = _mountDatePicker(modalRoot);
    _wireDynamicFields(modalRoot, config);
    _wireEvents(modalRoot, movement, config, options);

    return modalRoot;
  }

  function close() { _closeModal(); }

  return { buildHTML, open, close };
})();

export { MovementModal };
