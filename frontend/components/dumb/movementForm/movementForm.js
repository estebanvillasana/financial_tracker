/**
 * movementForm.js
 *
 * Reusable dumb component for creating/editing individual movements.
 * Pattern: Revealing Module (IIFE) — same as TransferForm, FilterBar.
 *
 * Public API:
 *   MovementForm.buildHTML(config)               → HTML string
 *   MovementForm.hydrate(root, config, handlers) → void
 *   MovementForm.getValues(root)                 → object
 *   MovementForm.populate(root, movement, config)→ void  (fill for editing)
 *   MovementForm.reset(root)                     → void  (back to defaults)
 *   MovementForm.validate(values)                → { valid, errors, payload }
 *   MovementForm.refreshOptions(root, config)    → void  (update selects)
 *
 * config shape:
 *   { accounts, categories, subCategories }
 *
 * handlers (all optional):
 *   handlers.onSubmit()   — fired on Create / Update click
 *   handlers.onCancel()   — fired on Cancel click
 */
import {
  normalizeCurrency,
  formatMoney,
} from '../../../utils/formatters.js';
import { isValidIsoDate, parseNumberOrNull } from '../../../utils/validators.js';
import {
  getCategoriesByType,
  getSubCategoriesByTypeAndCategory,
} from '../../../utils/lookups.js';

const MovementForm = (() => {

  /* ── Private helpers ────────────────────────────────────── */

  const _PLAIN_FMT = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  function _esc(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _strip(v) { return String(v).replace(/[^0-9.\-]/g, ''); }

  function _toCents(v) {
    const n = parseFloat(_strip(v));
    return (!isNaN(n) && n > 0) ? Math.round(n * 100) : null;
  }

  function _findAccount(accounts, id) {
    return accounts.find(a => a.id === Number(id));
  }

  function _formatDisplay(value, currency) {
    const num = parseFloat(_strip(value));
    if (isNaN(num) || num <= 0) return value;
    return currency ? formatMoney(num, currency) : _PLAIN_FMT.format(num);
  }

  function _rawAmount(value) {
    const num = parseFloat(_strip(value));
    if (isNaN(num)) return '';
    return num.toFixed(2);
  }

  function _accountOpts(accounts) {
    return '<option value="">Select account</option>' +
      accounts.map(a =>
        `<option value="${a.id}">${_esc(a.account)} (${normalizeCurrency(a.currency)})</option>`
      ).join('');
  }

  function _categoryOpts(categories, type) {
    const filtered = type ? getCategoriesByType(categories, type) : categories;
    return '<option value="">—</option>' +
      filtered.map(c => `<option value="${c.id}">${_esc(c.category)}</option>`).join('');
  }

  function _subCategoryOpts(subCategories, type, categoryId) {
    const filtered = categoryId
      ? getSubCategoriesByTypeAndCategory(subCategories, type, categoryId)
      : [];
    return '<option value="">—</option>' +
      filtered.map(s => `<option value="${s.id}">${_esc(s.sub_category)}</option>`).join('');
  }

  /* ── Build ──────────────────────────────────────────────── */

  function buildHTML(config = {}) {
    const { accounts = [], categories = [], subCategories = [] } = config;
    const today = new Date().toISOString().slice(0, 10);

    return `<div class="ft-card ft-movement-form" id="mf-root">
  <span class="ft-movement-form__title" id="mf-title">Edit Movement</span>
  <div class="ft-movement-form__body">

    <div class="ft-movement-form__row">
      <label class="ft-movement-form__field ft-movement-form__field--name">
        <span class="ft-movement-form__label">Movement</span>
        <input class="ft-movement-form__control" id="mf-movement" type="text" placeholder="Movement name" />
      </label>
      <label class="ft-movement-form__field ft-movement-form__field--date">
        <span class="ft-movement-form__label">Date</span>
        <input class="ft-movement-form__control" id="mf-date" type="date" value="${today}" />
      </label>
    </div>

    <div class="ft-movement-form__row">
      <label class="ft-movement-form__field ft-movement-form__field--account">
        <span class="ft-movement-form__label">Account</span>
        <select class="ft-movement-form__control" id="mf-account">
          ${_accountOpts(accounts)}
        </select>
      </label>
      <label class="ft-movement-form__field ft-movement-form__field--type">
        <span class="ft-movement-form__label">Type</span>
        <select class="ft-movement-form__control" id="mf-type">
          <option value="Expense">Expense</option>
          <option value="Income">Income</option>
        </select>
      </label>
      <label class="ft-movement-form__field ft-movement-form__field--amount">
        <span class="ft-movement-form__label" id="mf-amount-label">Amount</span>
        <input class="ft-movement-form__control ft-movement-form__control--amount" id="mf-amount"
               type="text" inputmode="decimal" placeholder="0.00" />
      </label>
    </div>

    <div class="ft-movement-form__row">
      <label class="ft-movement-form__field ft-movement-form__field--category">
        <span class="ft-movement-form__label">Category</span>
        <select class="ft-movement-form__control" id="mf-category">
          ${_categoryOpts(categories, 'Expense')}
        </select>
      </label>
      <label class="ft-movement-form__field ft-movement-form__field--subcategory">
        <span class="ft-movement-form__label">Sub-category</span>
        <select class="ft-movement-form__control" id="mf-subcategory">
          <option value="">—</option>
        </select>
      </label>
      <label class="ft-movement-form__field ft-movement-form__field--invoice">
        <span class="ft-movement-form__label">Invoice</span>
        <div class="ft-movement-form__toggle">
          <input type="checkbox" id="mf-invoice" class="ft-movement-form__checkbox" />
          <span class="ft-movement-form__toggle-label" id="mf-invoice-label">No</span>
        </div>
      </label>
    </div>

    <div class="ft-movement-form__row">
      <label class="ft-movement-form__field ft-movement-form__field--desc">
        <span class="ft-movement-form__label">Description</span>
        <textarea class="ft-movement-form__control ft-movement-form__control--textarea"
                  id="mf-description" rows="2" placeholder="Optional notes"></textarea>
      </label>
    </div>

    <div class="ft-movement-form__actions" id="mf-actions">
      <button class="ft-btn ft-btn--primary" type="button" id="mf-submit">
        <span class="material-symbols-outlined" aria-hidden="true">check</span>
        Update
      </button>
    </div>

  </div>
</div>`;
  }

  /* ── Hydrate ────────────────────────────────────────────── */

  function hydrate(root, config = {}, handlers = {}) {
    if (!root) return;
    const { accounts = [], categories = [], subCategories = [] } = config;

    /* Type change → re-populate category options, clear subcategory */
    root.addEventListener('change', e => {
      if (e.target.id === 'mf-type') {
        const type = e.target.value;
        root.querySelector('#mf-category').innerHTML = _categoryOpts(categories, type);
        root.querySelector('#mf-subcategory').innerHTML = '<option value="">—</option>';
      }

      /* Category change → re-populate subcategory options */
      if (e.target.id === 'mf-category') {
        const type = root.querySelector('#mf-type')?.value || '';
        const catId = e.target.value;
        root.querySelector('#mf-subcategory').innerHTML =
          _subCategoryOpts(subCategories, type, catId);
      }

      /* Account change → re-format amount with new currency */
      if (e.target.id === 'mf-account') {
        const acc = _findAccount(accounts, Number(e.target.value));
        _updateAmountLabel(root, acc);
        const amtEl = root.querySelector('#mf-amount');
        if (amtEl?.value) amtEl.value = _formatDisplay(_rawAmount(amtEl.value), acc?.currency);
      }
    });

    /* Invoice checkbox toggle label */
    root.addEventListener('change', e => {
      if (e.target.id === 'mf-invoice') {
        root.querySelector('#mf-invoice-label').textContent = e.target.checked ? 'Yes' : 'No';
      }
    });

    /* Amount blur → currency-aware formatting */
    root.addEventListener('focusout', e => {
      if (e.target.id === 'mf-amount') {
        const acc = _findAccount(accounts, Number(root.querySelector('#mf-account')?.value));
        e.target.value = _formatDisplay(e.target.value, acc?.currency);
      }
    });

    /* Amount focus → strip to raw decimal */
    root.addEventListener('focusin', e => {
      if (e.target.id === 'mf-amount') {
        const raw = _rawAmount(e.target.value);
        if (raw) e.target.value = raw;
        e.target.select();
      }
    });

    /* Button clicks */
    root.addEventListener('click', e => {
      if (e.target.closest('#mf-submit')) handlers.onSubmit?.();
      if (e.target.closest('#mf-cancel')) handlers.onCancel?.();
    });
  }

  function _updateAmountLabel(root, acc) {
    const label = root.querySelector('#mf-amount-label');
    if (!label) return;
    label.textContent = acc ? `Amount (${normalizeCurrency(acc.currency)})` : 'Amount';
  }

  /* ── Read / Write ───────────────────────────────────────── */

  function getValues(root) {
    if (!root) return {};
    const q = s => root.querySelector(s);
    return {
      movement:       q('#mf-movement')?.value?.trim() ?? '',
      description:    q('#mf-description')?.value?.trim() || null,
      accountId:      Number(q('#mf-account')?.value) || 0,
      amount:         q('#mf-amount')?.value?.trim() ?? '',
      type:           q('#mf-type')?.value ?? 'Expense',
      date:           q('#mf-date')?.value?.trim() ?? '',
      categoryId:     Number(q('#mf-category')?.value) || null,
      subCategoryId:  Number(q('#mf-subcategory')?.value) || null,
      invoice:        q('#mf-invoice')?.checked ? 1 : 0,
    };
  }

  function populate(root, movement, config = {}) {
    if (!root || !movement) return;
    const { accounts = [], categories = [], subCategories = [] } = config;

    root.querySelector('#mf-title').textContent = 'Edit Movement';
    root.querySelector('#mf-movement').value = movement.movement ?? '';
    root.querySelector('#mf-date').value = movement.date ?? '';
    root.querySelector('#mf-account').value = movement.account_id ?? '';
    root.querySelector('#mf-type').value = movement.type ?? 'Expense';

    /* Refresh category options for the movement type, then set value */
    root.querySelector('#mf-category').innerHTML =
      _categoryOpts(categories, movement.type);
    root.querySelector('#mf-category').value = movement.category_id ?? '';

    /* Refresh subcategory options for the chosen category, then set value */
    root.querySelector('#mf-subcategory').innerHTML =
      _subCategoryOpts(subCategories, movement.type, movement.category_id);
    root.querySelector('#mf-subcategory').value = movement.sub_category_id ?? '';

    /* Amount — formatted with currency */
    const acc = _findAccount(accounts, movement.account_id);
    root.querySelector('#mf-amount').value =
      _formatDisplay(String(movement.value / 100), acc?.currency);
    _updateAmountLabel(root, acc);

    /* Invoice checkbox */
    root.querySelector('#mf-invoice').checked = movement.invoice === 1;
    root.querySelector('#mf-invoice-label').textContent = movement.invoice === 1 ? 'Yes' : 'No';

    /* Description */
    root.querySelector('#mf-description').value = movement.description ?? '';

    /* Actions: show Cancel + Update */
    root.querySelector('#mf-actions').innerHTML = `
      <button class="ft-btn ft-btn--ghost" type="button" id="mf-cancel">Cancel</button>
      <button class="ft-btn ft-btn--primary" type="button" id="mf-submit">
        <span class="material-symbols-outlined" aria-hidden="true">check</span>
        Update
      </button>`;
  }

  function reset(root) {
    if (!root) return;
    root.querySelector('#mf-title').textContent = 'Edit Movement';
    root.querySelector('#mf-movement').value = '';
    root.querySelector('#mf-date').value = new Date().toISOString().slice(0, 10);
    root.querySelector('#mf-account').value = '';
    root.querySelector('#mf-type').value = 'Expense';
    root.querySelector('#mf-category').value = '';
    root.querySelector('#mf-subcategory').innerHTML = '<option value="">—</option>';
    root.querySelector('#mf-amount').value = '';
    root.querySelector('#mf-amount-label').textContent = 'Amount';
    root.querySelector('#mf-invoice').checked = false;
    root.querySelector('#mf-invoice-label').textContent = 'No';
    root.querySelector('#mf-description').value = '';
    root.querySelector('#mf-actions').innerHTML = `
      <button class="ft-btn ft-btn--primary" type="button" id="mf-submit">
        <span class="material-symbols-outlined" aria-hidden="true">check</span>
        Update
      </button>`;
  }

  /* ── Validate ───────────────────────────────────────────── */

  function validate(values) {
    const errors = [];

    if (!values.movement) errors.push('Movement name is required.');
    if (!values.accountId) errors.push('Account is required.');
    if (!values.type) errors.push('Type is required.');
    if (!isValidIsoDate(values.date)) errors.push('Valid date is required.');

    const cents = _toCents(values.amount);
    if (!cents) errors.push('Amount must be a positive number.');

    if (errors.length) return { valid: false, errors, payload: null };

    return {
      valid: true,
      errors: [],
      payload: {
        movement: values.movement,
        description: values.description || null,
        account_id: values.accountId,
        value: cents,
        type: values.type,
        date: values.date,
        category_id: values.categoryId || null,
        sub_category_id: values.subCategoryId || null,
        invoice: values.invoice,
      },
    };
  }

  /* ── Refresh selects (e.g. after data reload) ───────────── */

  function refreshOptions(root, config = {}) {
    if (!root) return;
    const { accounts = [], categories = [], subCategories = [] } = config;
    const type = root.querySelector('#mf-type')?.value || '';
    const catId = root.querySelector('#mf-category')?.value || '';

    root.querySelector('#mf-account').innerHTML = _accountOpts(accounts);
    root.querySelector('#mf-category').innerHTML = _categoryOpts(categories, type);
    root.querySelector('#mf-subcategory').innerHTML =
      _subCategoryOpts(subCategories, type, catId);
  }

  /* ── Public API ─────────────────────────────────────────── */

  return {
    buildHTML,
    hydrate,
    getValues,
    populate,
    reset,
    validate,
    refreshOptions,
  };
})();

export { MovementForm };
