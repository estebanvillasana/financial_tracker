/**
 * transferForm.js
 *
 * Dumb component for creating/editing internal money transfers.
 * Pattern: Revealing Module (IIFE) — same as FilterBar, FeedbackBanner.
 *
 * Public API:
 *   TransferForm.buildHTML(accounts)          → HTML string
 *   TransferForm.hydrate(root, accounts, h)   → void  (wire events)
 *   TransferForm.getValues(root)              → object (read form state)
 *   TransferForm.populate(root, transfer)     → void  (fill for editing)
 *   TransferForm.reset(root)                  → void  (back to create mode)
 *   TransferForm.validate(values)             → { valid, errors, payload }
 *   TransferForm.updateCurrencyLabels(root, a) → void
 *   TransferForm.areSameCurrency(root, a)     → boolean
 *
 * Handlers passed to hydrate (all optional):
 *   handlers.onSubmit()   — called on Create / Update button click
 *   handlers.onCancel()   — called on Cancel button click
 */
import { normalizeCurrency } from '../../../utils/formatters.js';
import { isValidIsoDate, parseNumberOrNull } from '../../../utils/validators.js';

const TransferForm = (() => {

  /* ── Private ────────────────────────────────────────────── */

  const AMOUNT_FMT = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  function _esc(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _accountOpts(accounts) {
    return '<option value="">Select account</option>' +
      accounts.map(a =>
        `<option value="${a.id}">${_esc(a.account)} (${normalizeCurrency(a.currency)})</option>`
      ).join('');
  }

  function _strip(v) { return String(v).replace(/[^0-9.\-]/g, ''); }

  function _toCents(v) {
    const n = parseFloat(_strip(v));
    return (!isNaN(n) && n > 0) ? Math.round(n * 100) : null;
  }

  function _findAccount(accounts, id) {
    return accounts.find(a => a.id === Number(id));
  }

  /** Formats a raw number string with thousand-separators + 2 decimals on blur. */
  function _formatDisplay(value) {
    const num = parseFloat(_strip(value));
    if (isNaN(num) || num <= 0) return value;
    return AMOUNT_FMT.format(num);
  }

  /** Strips formatting back to a clean decimal for editing on focus. */
  function _rawAmount(value) {
    const num = parseFloat(_strip(value));
    if (isNaN(num)) return '';
    return num.toFixed(2);
  }

  /* ── Build ──────────────────────────────────────────────── */

  function buildHTML(accounts) {
    const opts = _accountOpts(accounts);
    const today = new Date().toISOString().slice(0, 10);
    return `<div class="ft-card ft-transfer-form" id="tf-root">
  <span class="ft-transfer-form__title" id="tf-title">New Transfer</span>
  <div class="ft-transfer-form__body">
    <div class="ft-transfer-form__row ft-transfer-form__row--transfer">
      <label class="ft-transfer-form__field ft-transfer-form__field--account">
        <span class="ft-transfer-form__label">From</span>
        <select class="ft-transfer-form__control" id="tf-send-account">${opts}</select>
      </label>
      <label class="ft-transfer-form__field ft-transfer-form__field--amount">
        <span class="ft-transfer-form__label" id="tf-sent-label">Sent</span>
        <input class="ft-transfer-form__control ft-transfer-form__control--amount"
               id="tf-sent-amount" type="text" inputmode="decimal" placeholder="0.00">
      </label>
      <span class="ft-transfer-form__arrow material-symbols-outlined" aria-hidden="true">east</span>
      <label class="ft-transfer-form__field ft-transfer-form__field--account">
        <span class="ft-transfer-form__label">To</span>
        <select class="ft-transfer-form__control" id="tf-receive-account">${opts}</select>
      </label>
      <label class="ft-transfer-form__field ft-transfer-form__field--amount">
        <span class="ft-transfer-form__label" id="tf-received-label">Received</span>
        <input class="ft-transfer-form__control ft-transfer-form__control--amount"
               id="tf-received-amount" type="text" inputmode="decimal" placeholder="0.00">
      </label>
    </div>
    <div class="ft-transfer-form__row">
      <label class="ft-transfer-form__field ft-transfer-form__field--date">
        <span class="ft-transfer-form__label">Date</span>
        <input class="ft-transfer-form__control" id="tf-date" type="date" value="${today}">
      </label>
      <label class="ft-transfer-form__field ft-transfer-form__field--desc">
        <span class="ft-transfer-form__label">Description</span>
        <input class="ft-transfer-form__control" id="tf-description" type="text" placeholder="Optional">
      </label>
      <div class="ft-transfer-form__actions" id="tf-actions">
        <button class="ft-btn ft-btn--primary" type="button" id="tf-submit">
          <span class="material-symbols-outlined" aria-hidden="true">add</span>
          Create
        </button>
      </div>
    </div>
  </div>
</div>`;
  }

  /* ── Hydrate ────────────────────────────────────────────── */

  function hydrate(root, accounts, handlers = {}) {
    if (!root) return;

    /* Account change → update labels + auto-sync same-currency */
    root.addEventListener('change', e => {
      if (e.target.id === 'tf-send-account' || e.target.id === 'tf-receive-account') {
        updateCurrencyLabels(root, accounts);
        if (areSameCurrency(root, accounts)) {
          const sentVal = root.querySelector('#tf-sent-amount')?.value;
          if (sentVal) root.querySelector('#tf-received-amount').value = sentVal;
        }
      }
    });

    /* Sent amount input → auto-sync received when same currency */
    root.addEventListener('input', e => {
      if (e.target.id === 'tf-sent-amount' && areSameCurrency(root, accounts)) {
        root.querySelector('#tf-received-amount').value = e.target.value;
      }
    });

    /* Amount blur → format with thousand-separators */
    root.addEventListener('focusout', e => {
      if (e.target.id === 'tf-sent-amount' || e.target.id === 'tf-received-amount') {
        e.target.value = _formatDisplay(e.target.value);
        /* Sync formatted value to received when same currency */
        if (e.target.id === 'tf-sent-amount' && areSameCurrency(root, accounts)) {
          root.querySelector('#tf-received-amount').value = e.target.value;
        }
      }
    });

    /* Amount focus → strip formatting for editing */
    root.addEventListener('focusin', e => {
      if (e.target.id === 'tf-sent-amount' || e.target.id === 'tf-received-amount') {
        const raw = _rawAmount(e.target.value);
        if (raw) e.target.value = raw;
        e.target.select();
      }
    });

    /* Button clicks — delegated so swapped buttons still work */
    root.addEventListener('click', e => {
      if (e.target.closest('#tf-submit')) handlers.onSubmit?.();
      if (e.target.closest('#tf-cancel')) handlers.onCancel?.();
    });
  }

  /* ── Read / Write ───────────────────────────────────────── */

  function getValues(root) {
    if (!root) return {};
    const q = s => root.querySelector(s);
    return {
      sendAccountId:   Number(q('#tf-send-account')?.value) || 0,
      receiveAccountId: Number(q('#tf-receive-account')?.value) || 0,
      sentAmount:      q('#tf-sent-amount')?.value?.trim() ?? '',
      receivedAmount:  q('#tf-received-amount')?.value?.trim() ?? '',
      date:            q('#tf-date')?.value?.trim() ?? '',
      description:     q('#tf-description')?.value?.trim() || null,
    };
  }

  function populate(root, transfer) {
    if (!root) return;
    root.querySelector('#tf-title').textContent = 'Edit Transfer';
    root.querySelector('#tf-send-account').value = transfer.send_account_id;
    root.querySelector('#tf-receive-account').value = transfer.receive_account_id;
    root.querySelector('#tf-sent-amount').value = AMOUNT_FMT.format(transfer.sent_value / 100);
    root.querySelector('#tf-received-amount').value = AMOUNT_FMT.format(transfer.received_value / 100);
    root.querySelector('#tf-date').value = transfer.date;
    root.querySelector('#tf-description').value = transfer.description ?? '';
    root.querySelector('#tf-actions').innerHTML = `
      <button class="ft-btn ft-btn--ghost" type="button" id="tf-cancel">Cancel</button>
      <button class="ft-btn ft-btn--primary" type="button" id="tf-submit">
        <span class="material-symbols-outlined" aria-hidden="true">check</span>
        Update
      </button>`;
  }

  function reset(root) {
    if (!root) return;
    root.querySelector('#tf-title').textContent = 'New Transfer';
    root.querySelector('#tf-send-account').value = '';
    root.querySelector('#tf-receive-account').value = '';
    root.querySelector('#tf-sent-amount').value = '';
    root.querySelector('#tf-received-amount').value = '';
    root.querySelector('#tf-date').value = new Date().toISOString().slice(0, 10);
    root.querySelector('#tf-description').value = '';
    root.querySelector('#tf-sent-label').textContent = 'Sent';
    root.querySelector('#tf-received-label').textContent = 'Received';
    root.querySelector('#tf-actions').innerHTML = `
      <button class="ft-btn ft-btn--primary" type="button" id="tf-submit">
        <span class="material-symbols-outlined" aria-hidden="true">add</span>
        Create
      </button>`;
  }

  /* ── Currency Sync ──────────────────────────────────────── */

  function updateCurrencyLabels(root, accounts) {
    if (!root) return;
    const sendId = Number(root.querySelector('#tf-send-account')?.value) || 0;
    const recvId = Number(root.querySelector('#tf-receive-account')?.value) || 0;
    const sendAcc = _findAccount(accounts, sendId);
    const recvAcc = _findAccount(accounts, recvId);
    root.querySelector('#tf-sent-label').textContent =
      sendAcc ? `Sent (${normalizeCurrency(sendAcc.currency)})` : 'Sent';
    root.querySelector('#tf-received-label').textContent =
      recvAcc ? `Received (${normalizeCurrency(recvAcc.currency)})` : 'Received';
  }

  function areSameCurrency(root, accounts) {
    if (!root) return false;
    const sendId = Number(root.querySelector('#tf-send-account')?.value) || 0;
    const recvId = Number(root.querySelector('#tf-receive-account')?.value) || 0;
    if (!sendId || !recvId) return false;
    const s = _findAccount(accounts, sendId);
    const r = _findAccount(accounts, recvId);
    return s && r && normalizeCurrency(s.currency) === normalizeCurrency(r.currency);
  }

  /* ── Validation ─────────────────────────────────────────── */

  function validate(values) {
    const errors = [];
    if (!values.sendAccountId) errors.push('Select a "From" account.');
    if (!values.receiveAccountId) errors.push('Select a "To" account.');
    if (values.sendAccountId && values.receiveAccountId &&
        values.sendAccountId === values.receiveAccountId)
      errors.push('"From" and "To" accounts must be different.');

    const sentCents = _toCents(values.sentAmount);
    if (sentCents === null) errors.push('Enter a valid sent amount greater than 0.');

    const receivedCents = _toCents(values.receivedAmount);
    if (receivedCents === null) errors.push('Enter a valid received amount greater than 0.');

    if (!isValidIsoDate(values.date)) errors.push('Enter a valid date.');

    return {
      valid: errors.length === 0,
      errors,
      payload: errors.length === 0 ? {
        send_account_id: values.sendAccountId,
        sent_value: sentCents,
        receive_account_id: values.receiveAccountId,
        received_value: receivedCents,
        date: values.date,
        description: values.description,
      } : null,
    };
  }

  return { buildHTML, hydrate, getValues, populate, reset, validate, updateCurrencyLabels, areSameCurrency };
})();

export { TransferForm };
