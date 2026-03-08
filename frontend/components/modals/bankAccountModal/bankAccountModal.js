/**
 * bankAccountModal.js
 *
 * Dumb modal component for viewing and editing a single bank account.
 * "Dumb" means it owns no data-fetching logic beyond what's needed to
 * render itself (FX rate conversion). All persistence decisions (save,
 * soft-delete) are delegated to the caller via option callbacks.
 *
 * Pattern: Revealing Module (IIFE) — private state + helpers are
 * enclosed, only the public API object is exported.
 *
 * Public API:
 *   BankAccountModal.open(accountData, options)  → Promise<HTMLElement|null>
 *   BankAccountModal.openById(accountId, options) → Promise<HTMLElement|null>
 *   BankAccountModal.buildHTML(account, options)  → string  (HTML string, useful for testing)
 *   BankAccountModal.close()                      → void
 *
 * Option callbacks (all optional):
 *   options.onSave(id, payload, account)       — called on form submit
 *   options.onSoftDelete(id, account)          — called on delete button click
 *   options.onClose(account)                   — called when modal is dismissed
 *   options.defaultCurrency                    — ISO 4217 code (e.g. 'USD')
 *   options.convertedTotalCents                — pre-computed conversion (skips FX fetch)
 *
 * Custom events dispatched on the modal root element (bubble up to document):
 *   'bank-account-modal:save'        — detail: { id, payload, account }
 *   'bank-account-modal:soft-delete' — detail: { id, account }
 */

import { finalAppConfig } from '../../../defaults.js';
import { bankAccounts, fxRates } from '../../../services/api.js';
import { normalizeCurrency as _normalizeCurrency, formatMoneyFromCents as _formatMoney } from '../../../utils/formatters.js';

const BankAccountModal = (() => {

  // ─── Formatters ──────────────────────────────────────────────────────────────

  /** Formats integer counts without decimal places (e.g. "1,234"). */
  const INTEGER_FORMAT = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  });

  // ─── Constants ───────────────────────────────────────────────────────────────

  /** Allowed values for the account type <select>. */
  const TYPE_OPTIONS = ['Bank Account', 'Credit Card', 'Savings', 'Crypto Wallet', 'Money Bag'];

  /**
   * Reference to the currently mounted modal root element, or null when no
   * modal is open. Used to enforce a single-modal-at-a-time constraint and
   * to support programmatic close (e.g. Escape key).
   * @type {HTMLElement|null}
   */
  let activeModal = null;

  // ─── Private helpers: sanitization & formatting ──────────────────────────────

  /**
   * Escapes a value for safe interpolation into HTML attribute values or
   * text content. Handles null/undefined by converting to an empty string.
   *
   * @param {*} value
   * @returns {string}
   */
  function _escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Formats a non-negative integer count with thousands separators.
   * Returns '0' for non-finite or negative inputs.
   *
   * @param {*} value
   * @returns {string}
   */
  function _formatCount(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '0';
    return INTEGER_FORMAT.format(Math.max(0, Math.trunc(numeric)));
  }

  // ─── Private helpers: HTML snippets ──────────────────────────────────────────

  /**
   * Builds the <option> elements for the account type <select>, marking the
   * currently selected type. Falls back gracefully if selectedType is falsy.
   *
   * @param {string} selectedType  Current account type value (e.g. 'Savings').
   * @returns {string}             HTML string of <option> elements.
   */
  function _buildTypeOptions(selectedType) {
    return TYPE_OPTIONS.map(type => {
      const selected = String(selectedType || '') === type ? ' selected' : '';
      return `<option value="${_escapeHtml(type)}"${selected}>${_escapeHtml(type)}</option>`;
    }).join('');
  }

  // ─── Private helpers: FX conversion ──────────────────────────────────────────

  /**
   * Fetches the latest FX rate and converts the account's total balance from
   * the account's currency to the app's default currency.
   *
   * Lookup strategy (to maximise coverage across different rate table layouts):
   *  1. Try the direct pair  (e.g. EURUSD) → use `rate` directly.
   *  2. Fall back to the reverse pair (e.g. USDEUR):
   *       a. Use `inverse_rate` if the API returns it pre-computed.
   *       b. Otherwise compute 1 / rate manually.
   *
   * Returns null when:
   *  - The account currency and target currency are the same (no conversion needed).
   *  - Either currency code is missing.
   *  - No usable rate can be found from either pair.
   *
   * @param {object} account          Bank account record from the API.
   * @param {string} defaultCurrency  App-level default currency (ISO 4217).
   * @returns {Promise<number|null>}  Converted balance in cents, or null.
   */
  async function _getLatestConvertedTotalCents(account, defaultCurrency) {
    const accountCurrency = _normalizeCurrency(account?.currency || defaultCurrency);
    const targetCurrency = _normalizeCurrency(defaultCurrency);
    const totalBalanceCents = Number(account?.total_balance ?? 0);

    // Skip conversion when currencies are identical or either is missing.
    if (!accountCurrency || !targetCurrency || accountCurrency === targetCurrency) return null;

    const directPair = `${accountCurrency}${targetCurrency}`;
    const reversePair = `${targetCurrency}${accountCurrency}`;
    let rate = null;

    // Step 1: Try the direct pair.
    try {
      const direct = await fxRates.getLatestByPair(directPair);
      const directRate = Number(direct?.rate);
      if (Number.isFinite(directRate)) rate = directRate;
    } catch {
      // Ignore direct pair failure and try reverse pair.
    }

    // Step 2: Fall back to the reverse pair if the direct lookup failed.
    if (!Number.isFinite(rate)) {
      try {
        const reverse = await fxRates.getLatestByPair(reversePair);
        const inverseRate = Number(reverse?.inverse_rate);
        const reverseRate = Number(reverse?.rate);
        if (Number.isFinite(inverseRate)) {
          // Prefer the pre-computed inverse rate when available.
          rate = inverseRate;
        } else if (Number.isFinite(reverseRate) && reverseRate !== 0) {
          // Derive the inverse manually to avoid division by zero.
          rate = 1 / reverseRate;
        }
      } catch {
        return null;
      }
    }

    if (!Number.isFinite(rate)) return null;

    // Apply the rate and round to the nearest cent.
    return Math.round((Number.isFinite(totalBalanceCents) ? totalBalanceCents : 0) * rate);
  }

  // ─── HTML template ───────────────────────────────────────────────────────────

  /**
   * Builds the complete modal HTML string for a bank account.
   *
   * The function is intentionally side-effect-free (pure except for reading
   * `finalAppConfig`) so it can be unit-tested independently of the DOM.
   *
   * The converted total column is only rendered when:
   *   - `options.convertedTotalCents` is a non-null value, AND
   *   - The account currency differs from the default currency.
   *
   * @param {object} account                     Bank account record.
   * @param {object} [options={}]
   * @param {string} [options.defaultCurrency]   ISO 4217 code for the app currency.
   * @param {number} [options.convertedTotalCents] Pre-converted balance in cents.
   * @returns {string}  Full modal HTML (backdrop + dialog).
   */
  function buildHTML(account, options = {}) {
    const defaultCurrency = _normalizeCurrency(options.defaultCurrency || finalAppConfig.currency);
    const accountCurrency = _normalizeCurrency(account?.currency || defaultCurrency);
    const convertedTotal = options.convertedTotalCents;

    // Only show the converted total column when the account is in a foreign currency.
    const showConverted =
      convertedTotal !== undefined &&
      convertedTotal !== null &&
      accountCurrency &&
      accountCurrency !== defaultCurrency;
    const convertedLabel = showConverted
      ? `≈ ${_formatMoney(convertedTotal, defaultCurrency)}`
      : '—';

    // `active` and `updated` are stored as integers (1/0) in the database.
    const isActive  = Number(account?.active  ?? 0) === 1;
    const isUpdated = Number(account?.updated ?? 0) === 1;
    const accountId = _escapeHtml(account?.id ?? '');
    const totalBalanceLabel = _formatMoney(account?.total_balance, accountCurrency);
    const netMovementsLabel = _formatCount(account?.net_movements);

    return `
      <div class="ft-modal-backdrop ft-bank-account-modal-backdrop" data-modal-close>
        <section class="ft-bank-account-modal" role="dialog" aria-modal="true" aria-label="Bank account details">
          <header class="ft-bank-account-modal__header">
            <div class="ft-bank-account-modal__header-main">
              <div class="ft-bank-account-modal__title-wrap">
                <h2 class="ft-h3 ft-bank-account-modal__title">${_escapeHtml(account?.account || 'Bank Account')}</h2>
                <span class="ft-bank-account-modal__chip">ID ${accountId}</span>
                <span class="ft-bank-account-modal__status${isActive ? '' : ' ft-bank-account-modal__status--inactive'}">
                  ${isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <button type="button" class="ft-bank-account-modal__close-btn" data-modal-close aria-label="Close modal">
                <span class="material-symbols-outlined" aria-hidden="true">close</span>
              </button>
            </div>
            <div class="ft-bank-account-modal__meta">
              <div class="ft-bank-account-modal__meta-item">
                <span>Total Balance</span>
                <strong>${totalBalanceLabel}</strong>
              </div>
              <div class="ft-bank-account-modal__meta-item">
                <span>Movements</span>
                <strong>${netMovementsLabel}</strong>
              </div>
              <div class="ft-bank-account-modal__meta-item">
                <span>Total (${_escapeHtml(defaultCurrency)})</span>
                <strong>${convertedLabel}</strong>
              </div>
            </div>
          </header>

          <div class="ft-bank-account-modal__body">
            <form class="ft-bank-account-modal__form" id="ft-bank-account-form" data-bank-account-form>
              <div class="ft-bank-account-modal__form-grid">
                <label class="ft-bank-account-modal__field">
                  <span>Name</span>
                  <input type="text" name="account" value="${_escapeHtml(account?.account || '')}" required />
                </label>
                <label class="ft-bank-account-modal__field">
                  <span>Owner</span>
                  <input type="text" name="owner" value="${_escapeHtml(account?.owner || '')}" required />
                </label>
                <label class="ft-bank-account-modal__field">
                  <span>Type</span>
                  <select name="type">${_buildTypeOptions(account?.type)}</select>
                </label>
                <label class="ft-bank-account-modal__field">
                  <span>Currency</span>
                  <input type="text" name="currency" value="${_escapeHtml(accountCurrency)}" maxlength="3" required />
                </label>
                <label class="ft-bank-account-modal__field ft-bank-account-modal__field--wide">
                  <span>Description</span>
                  <textarea name="description" rows="3">${_escapeHtml(account?.description || '')}</textarea>
                </label>
                <label class="ft-bank-account-modal__field">
                  <span>Initial Balance (cents)</span>
                  <input type="number" name="initial_balance" value="${_escapeHtml(account?.initial_balance ?? 0)}" />
                </label>
                <label class="ft-bank-account-modal__field ft-bank-account-modal__field--checkbox">
                  <input type="checkbox" name="updated" value="1"${isUpdated ? ' checked' : ''}>
                  <span>Marked as updated</span>
                </label>
              </div>
            </form>
          </div>

          <footer class="ft-bank-account-modal__footer">
            <div class="ft-bank-account-modal__danger-zone">
              <button
                type="button"
                class="ft-bank-account-modal__trash-btn"
                data-soft-delete-request
                aria-label="Mark as Inactive"
                title="Mark as Inactive"
              >
                <span class="material-symbols-outlined" aria-hidden="true">delete</span>
              </button>
              <div class="ft-bank-account-modal__confirm" data-soft-delete-confirm hidden>
                <span class="ft-bank-account-modal__confirm-label">Mark as inactive?</span>
                <button type="button" class="ft-btn ft-btn--ghost" data-soft-delete-cancel>Cancel</button>
                <button type="button" class="ft-btn ft-bank-account-modal__confirm-btn" data-soft-delete>Confirm</button>
              </div>
            </div>
            <div class="ft-bank-account-modal__message" data-bank-account-message aria-live="polite"></div>
            <div class="ft-bank-account-modal__actions">
              <button type="button" class="ft-btn ft-btn--ghost" data-modal-close>Close</button>
              <button type="submit" class="ft-btn ft-btn--primary" form="ft-bank-account-form" data-save-account>Save</button>
            </div>
          </footer>
        </section>
      </div>`;
  }

  // ─── Private helpers: DOM / form ─────────────────────────────────────────────

  /**
   * Reads and normalises the current form field values from within the modal.
   * Currency is normalised to uppercase; all string fields are trimmed.
   *
   * @param {HTMLElement} modalRoot  The mounted modal backdrop element.
   * @returns {{ account: string, description: string, type: string,
   *             currency: string, owner: string, initial_balance: number }}
   */
  function _collectFormData(modalRoot) {
    const form = modalRoot.querySelector('[data-bank-account-form]');
    const data = new FormData(form);
    return {
      account: String(data.get('account') || '').trim(),
      description: String(data.get('description') || '').trim(),
      type: String(data.get('type') || '').trim(),
      currency: _normalizeCurrency(data.get('currency')),
      owner: String(data.get('owner') || '').trim(),
      initial_balance: Number(data.get('initial_balance') || 0),
      // Checkbox: FormData only includes it when checked; null = unchecked = 0.
      updated: data.get('updated') !== null ? 1 : 0,
    };
  }

  /**
   * Updates the status message bar at the bottom of the modal.
   * Applies the error modifier class when kind is 'error', removes it otherwise.
   *
   * @param {HTMLElement} modalRoot  The mounted modal backdrop element.
   * @param {string}      message    Text to display (empty string clears the bar).
   * @param {'info'|'error'} [kind='info']
   */
  function _setMessage(modalRoot, message, kind = 'info') {
    const messageNode = modalRoot.querySelector('[data-bank-account-message]');
    if (!messageNode) return;
    messageNode.textContent = message || '';
    messageNode.classList.toggle('ft-bank-account-modal__message--error', kind === 'error');
  }

  /**
   * Removes the active modal from the DOM, clears the module-level reference,
   * and restores body scrolling that was locked when the modal opened.
   */
  function _closeModal() {
    if (!activeModal) return;
    activeModal.remove();
    activeModal = null;
    document.body.style.removeProperty('overflow');
  }

  // ─── Private helpers: event wiring ───────────────────────────────────────────

  /**
   * Attaches all event listeners to a newly mounted modal.
   *
   * Uses a single delegated click handler on the modal root to handle three
   * distinct interaction surfaces:
   *  - Clicking the backdrop itself  ([data-modal-close] on the root element)
   *  - Clicking a close button       ([data-modal-close] on a descendant)
   *  - Clicking the soft-delete btn  ([data-soft-delete])
   *
   * A separate submit handler on the modal root intercepts form submission.
   *
   * In all save/delete cases a CustomEvent is always dispatched (so external
   * listeners on the document can react even when no callback was provided),
   * and then the corresponding option callback is awaited if present.
   *
   * The Escape key listener uses `{ once: true }` to prevent stacking across
   * multiple open/close cycles.
   *
   * @param {HTMLElement} modalRoot  The mounted modal backdrop element.
   * @param {object}      account    The account data the modal was opened with.
   * @param {object}      [options]  Caller-provided callbacks (onSave, onSoftDelete, onClose).
   */
  function _wireEvents(modalRoot, account, options = {}) {
    const onSave = typeof options.onSave === 'function' ? options.onSave : null;
    const onSoftDelete = typeof options.onSoftDelete === 'function' ? options.onSoftDelete : null;
    const onClose = typeof options.onClose === 'function' ? options.onClose : null;

    modalRoot.addEventListener('click', async event => {
      const closeTarget = event.target.closest('[data-modal-close]');

      // Close when clicking directly on the backdrop (the root element itself).
      if (closeTarget && event.target === modalRoot) {
        onClose?.(account);
        _closeModal();
        return;
      }

      // Close when clicking any descendant element marked with [data-modal-close]
      // (e.g. the X button or the "Close" footer button).
      if (closeTarget && closeTarget !== modalRoot) {
        onClose?.(account);
        _closeModal();
        return;
      }

      // Trash icon: show the inline confirmation panel.
      const softDeleteRequestBtn = event.target.closest('[data-soft-delete-request]');
      if (softDeleteRequestBtn) {
        const confirmEl = modalRoot.querySelector('[data-soft-delete-confirm]');
        if (confirmEl) confirmEl.hidden = false;
        return;
      }

      // Cancel button inside the confirmation panel: hide it again.
      const softDeleteCancelBtn = event.target.closest('[data-soft-delete-cancel]');
      if (softDeleteCancelBtn) {
        const confirmEl = modalRoot.querySelector('[data-soft-delete-confirm]');
        if (confirmEl) confirmEl.hidden = true;
        return;
      }

      // Confirm button: perform the actual soft delete.
      const softDeleteBtn = event.target.closest('[data-soft-delete]');
      if (!softDeleteBtn) return;

      // Always dispatch the custom event so external listeners are notified.
      const detail = { id: account.id, account };
      modalRoot.dispatchEvent(new CustomEvent('bank-account-modal:soft-delete', { bubbles: true, detail }));

      if (!onSoftDelete) return;

      try {
        _setMessage(modalRoot, 'Marking account as inactive...');
        await onSoftDelete(account.id, account);
        _setMessage(modalRoot, 'Account marked as inactive.');
      } catch (error) {
        _setMessage(modalRoot, error?.message || 'Failed to mark account as inactive.', 'error');
      }
    });

    modalRoot.addEventListener('submit', async event => {
      if (!event.target.closest('[data-bank-account-form]')) return;
      event.preventDefault();

      const payload = _collectFormData(modalRoot);

      // Always dispatch the custom event so external listeners are notified.
      const detail = { id: account.id, payload, account };
      modalRoot.dispatchEvent(new CustomEvent('bank-account-modal:save', { bubbles: true, detail }));

      if (!onSave) return;

      try {
        _setMessage(modalRoot, 'Saving account...');
        await onSave(account.id, payload, account);
        _setMessage(modalRoot, 'Changes saved.');
      } catch (error) {
        _setMessage(modalRoot, error?.message || 'Failed to save account.', 'error');
      }
    });

    // Close on Escape key. `once: true` prevents multiple listeners from
    // accumulating if the modal is opened and closed repeatedly.
    document.addEventListener(
      'keydown',
      event => {
        if (event.key !== 'Escape' || !activeModal) return;
        onClose?.(account);
        _closeModal();
      },
      { once: true }
    );
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Opens the bank account modal for the given account data.
   *
   * Fetches the latest FX conversion rate if the account currency differs from
   * the default, then renders the modal HTML, mounts it to `document.body`,
   * locks body scrolling, and wires all events.
   *
   * Any previously open modal is closed before the new one is mounted (only
   * one modal can be active at a time).
   *
   * @param {object} [accountData]            Bank account record (or empty object for a new account form).
   * @param {object} [options={}]             See module-level JSDoc for supported options.
   * @returns {Promise<HTMLElement|null>}     The mounted modal root element, or null if mount failed.
   */
  async function open(accountData, options = {}) {
    const account = accountData || {};
    const defaultCurrency = _normalizeCurrency(options.defaultCurrency || finalAppConfig.currency);

    // Fetch FX conversion before rendering so the header shows up-to-date totals.
    const convertedTotalCents = await _getLatestConvertedTotalCents(account, defaultCurrency);

    // Close any existing modal to enforce the single-modal constraint.
    _closeModal();

    // Parse the HTML string via an off-screen wrapper to get a real DOM node
    // without using innerHTML directly on document.body.
    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildHTML(account, {
      ...options,
      defaultCurrency,
      convertedTotalCents,
    }).trim();

    const modalRoot = wrapper.firstElementChild;
    if (!modalRoot) return null;

    document.body.appendChild(modalRoot);
    document.body.style.overflow = 'hidden'; // Prevent background scrolling.
    activeModal = modalRoot;
    _wireEvents(modalRoot, account, options);

    return modalRoot;
  }

  /**
   * Convenience wrapper: fetches the account by ID from the API, then opens
   * the modal with the returned data.
   *
   * @param {number|string} accountId  The account's primary key.
   * @param {object} [options={}]      Same options as `open`.
   * @returns {Promise<HTMLElement|null>}
   */
  async function openById(accountId, options = {}) {
    const account = await bankAccounts.getOne(accountId);
    return open(account, options);
  }

  /**
   * Programmatically closes the active modal (if any).
   * Equivalent to the user clicking the close button or pressing Escape.
   * Does NOT invoke the onClose callback — for programmatic cleanup only.
   */
  function close() {
    _closeModal();
  }

  // ─── Create mode ─────────────────────────────────────────────────────────────

  /**
   * Builds a simplified modal HTML for creating a new bank account.
   * Omits stats header, ID chip, and delete button since they don't apply.
   *
   * @param {object} [options={}]
   * @returns {string}
   */
  function buildNewHTML(options = {}) {
    const defaultCurrency = _normalizeCurrency(options.defaultCurrency || finalAppConfig.currency);

    return `
      <div class="ft-modal-backdrop ft-bank-account-modal-backdrop" data-modal-close>
        <section class="ft-bank-account-modal" role="dialog" aria-modal="true" aria-label="Create bank account">
          <header class="ft-bank-account-modal__header">
            <div class="ft-bank-account-modal__header-main">
              <div class="ft-bank-account-modal__title-wrap">
                <h2 class="ft-h3 ft-bank-account-modal__title">New Account</h2>
              </div>
              <button type="button" class="ft-bank-account-modal__close-btn" data-modal-close aria-label="Close modal">
                <span class="material-symbols-outlined" aria-hidden="true">close</span>
              </button>
            </div>
          </header>

          <div class="ft-bank-account-modal__body">
            <form class="ft-bank-account-modal__form" id="ft-bank-account-form" data-bank-account-form>
              <div class="ft-bank-account-modal__form-grid">
                <label class="ft-bank-account-modal__field">
                  <span>Name</span>
                  <input type="text" name="account" value="" required />
                </label>
                <label class="ft-bank-account-modal__field">
                  <span>Owner</span>
                  <input type="text" name="owner" value="" required />
                </label>
                <label class="ft-bank-account-modal__field">
                  <span>Type</span>
                  <select name="type">${_buildTypeOptions('Bank Account')}</select>
                </label>
                <label class="ft-bank-account-modal__field">
                  <span>Currency</span>
                  <input type="text" name="currency" value="${_escapeHtml(defaultCurrency)}" maxlength="3" required />
                </label>
                <label class="ft-bank-account-modal__field ft-bank-account-modal__field--wide">
                  <span>Description</span>
                  <textarea name="description" rows="3"></textarea>
                </label>
                <label class="ft-bank-account-modal__field">
                  <span>Initial Balance (cents)</span>
                  <input type="number" name="initial_balance" value="0" />
                </label>
              </div>
            </form>
          </div>

          <footer class="ft-bank-account-modal__footer">
            <div></div>
            <div class="ft-bank-account-modal__message" data-bank-account-message aria-live="polite"></div>
            <div class="ft-bank-account-modal__actions">
              <button type="button" class="ft-btn ft-btn--ghost" data-modal-close>Cancel</button>
              <button type="submit" class="ft-btn ft-btn--primary" form="ft-bank-account-form" data-save-account>Create</button>
            </div>
          </footer>
        </section>
      </div>`;
  }

  /**
   * Opens the bank account modal in "create" mode with an empty form.
   *
   * @param {object} [options={}]
   * @param {Function} [options.onSave]   — called with (payload) on submit
   * @param {Function} [options.onClose]  — called when modal is dismissed
   * @returns {Promise<HTMLElement|null>}
   */
  async function openNew(options = {}) {
    _closeModal();

    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildNewHTML(options).trim();

    const modalRoot = wrapper.firstElementChild;
    if (!modalRoot) return null;

    document.body.appendChild(modalRoot);
    document.body.style.overflow = 'hidden';
    activeModal = modalRoot;

    const onSave = typeof options.onSave === 'function' ? options.onSave : null;
    const onClose = typeof options.onClose === 'function' ? options.onClose : null;

    // Close handlers
    modalRoot.addEventListener('click', event => {
      const closeTarget = event.target.closest('[data-modal-close]');
      if (closeTarget && event.target === modalRoot) { onClose?.(); _closeModal(); return; }
      if (closeTarget && closeTarget !== modalRoot) { onClose?.(); _closeModal(); return; }
    });

    // Submit handler
    modalRoot.addEventListener('submit', async event => {
      if (!event.target.closest('[data-bank-account-form]')) return;
      event.preventDefault();

      const payload = _collectFormData(modalRoot);

      if (!onSave) return;

      try {
        _setMessage(modalRoot, 'Creating account...');
        await onSave(payload);
        _setMessage(modalRoot, 'Account created.');
        setTimeout(() => _closeModal(), 600);
      } catch (error) {
        _setMessage(modalRoot, error?.message || 'Failed to create account.', 'error');
      }
    });

    // Escape key
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !activeModal) return;
      onClose?.();
      _closeModal();
    }, { once: true });

    return modalRoot;
  }

  return { buildHTML, buildNewHTML, open, openNew, openById, close };
})();

export { BankAccountModal };
