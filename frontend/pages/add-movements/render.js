/**
 * Add Movements presentation helpers.
 *
 * Renders DOM fragments for:
 * - Unified toolbar (account selector + type toggle + action buttons)
 * - Balance summary cards
 * - Button state management
 */
import { InfoCard } from '../../components/dumb/infoCard/infoCard.js';
import { DatePicker } from '../../components/dumb/datePicker/datePicker.js';
import { normalizeCurrency, formatMoneyFromCents, toSignedCents } from '../../utils/formatters.js';
import { getSelectedAccount } from './utils.js';

/* ── Button State Management ──────────────────────────────────────────────── */

function updateHeaderButtons(state, commitBtn, discardBtn) {
  const hasRows = state.rows.length > 0;
  const hasAccount = Number.isFinite(Number(state.selectedAccountId));
  if (discardBtn) discardBtn.disabled = !hasRows;
  if (commitBtn) commitBtn.disabled = !hasRows || !hasAccount || state.isCommitting;
}

/* ── Balance Cards ────────────────────────────────────────────────────────── */

function renderBalanceCards(target, state) {
  if (!target) return;
  target.innerHTML = '';

  const account = getSelectedAccount(state);
  if (!account) return;

  const currentBalance = Number(account.total_balance ?? 0);
  const expectedBalance = currentBalance + state.rows.reduce((sum, row) => sum + toSignedCents(row), 0);
  const delta = expectedBalance - currentBalance;
  const currency = normalizeCurrency(account.currency);
  const actualBalance = _getActualBalanceCents(state, account.id);
  const difference = actualBalance === null ? null : actualBalance - expectedBalance;

  target.appendChild(
    InfoCard.createElement(
      {
        icon: 'account_balance',
        label: 'Current Balance',
        value: formatMoneyFromCents(currentBalance, currency),
        subValue: `${account.account} · ${account.owner}`,
        note: `Currency ${currency}`,
      },
      { variant: 'default' }
    )
  );

  target.appendChild(
    InfoCard.createElement(
      {
        icon: 'rule',
        label: 'Expected After Commit',
        value: formatMoneyFromCents(expectedBalance, currency),
        subValue: `${state.rows.length} draft movement${state.rows.length === 1 ? '' : 's'}`,
        note: `Net draft impact ${delta >= 0 ? '+' : ''}${formatMoneyFromCents(delta, currency)}`,
      },
      { variant: expectedBalance >= currentBalance ? 'success' : 'danger' }
    )
  );

  target.appendChild(_createReconciliationCard(currency, actualBalance, difference));
}

function syncBalanceCalculator(target, state, options = {}) {
  if (!target) return;

  const account = getSelectedAccount(state);
  if (!account) return;

  const currentBalance = Number(account.total_balance ?? 0);
  const expectedBalance = currentBalance + state.rows.reduce((sum, row) => sum + toSignedCents(row), 0);
  const currency = normalizeCurrency(account.currency);
  const actualBalance = _getActualBalanceCents(state, account.id);
  const difference = actualBalance === null ? null : actualBalance - expectedBalance;

  const inputEl = target.querySelector('[data-actual-balance-input]');
  if (inputEl && options.updateInput !== false) {
    inputEl.value = actualBalance === null ? '' : _formatEditableAmount(actualBalance);
  }

  const reconcileCard = target.querySelector('[data-balance-reconcile-card]');
  const diffValueEl = target.querySelector('[data-balance-difference-value]');
  const diffSubValueEl = target.querySelector('[data-balance-difference-sub-value]');
  const diffNoteEl = target.querySelector('[data-balance-difference-note]');

  if (reconcileCard) reconcileCard.dataset.variant = _getDifferenceVariant(difference);
  if (diffValueEl) {
    diffValueEl.textContent = difference === null
      ? '—'
      : `${difference > 0 ? '+' : ''}${formatMoneyFromCents(difference, currency)}`;
  }
  if (diffSubValueEl) {
    diffSubValueEl.textContent = difference === null
      ? 'Actual balance not entered'
      : 'Actual balance minus expected after commit';
  }
  if (diffNoteEl) {
    diffNoteEl.textContent = difference === null
      ? 'Enter the balance from your bank app to compare.'
      : difference === 0
        ? 'Matches your bank app.'
        : 'Non-zero means you still have money to reconcile.';
  }
}

function parseActualBalanceInput(value) {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/,/g, '')
    .replace(/[^0-9.\-]/g, '');

  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') return null;

  const amount = Number.parseFloat(cleaned);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function formatActualBalanceInput(cents) {
  return cents === null ? '' : _formatEditableAmount(cents);
}

function getActualBalanceInputValue(state) {
  const account = getSelectedAccount(state);
  if (!account) return '';
  return formatActualBalanceInput(_getActualBalanceCents(state, account.id));
}

function _createReconciliationCard(currency, actualBalance, difference) {
  const card = document.createElement('article');
  card.className = 'ft-info-card ft-add-movements-balance-input-card';
  card.dataset.variant = _getDifferenceVariant(difference);
  card.dataset.balanceReconcileCard = '';
  card.innerHTML = `
    <header class="ft-info-card__header">
      <div class="ft-info-card__icon-wrap" aria-hidden="true">
        <span class="ft-info-card__icon material-symbols-outlined">edit_square</span>
      </div>
      <span class="ft-info-card__label">Reconcile</span>
    </header>
    <div class="ft-info-card__body">
      <label class="ft-add-movements-balance-input" for="add-movements-actual-balance-input">
        <input
          class="ft-add-movements-balance-input__field"
          id="add-movements-actual-balance-input"
          data-actual-balance-input
          type="text"
          inputmode="decimal"
          placeholder="0.00"
          aria-label="Actual balance"
          value="${actualBalance === null ? '' : _formatEditableAmount(actualBalance)}"
        >
        <span class="ft-add-movements-balance-input__currency">${currency}</span>
      </label>
      <p class="ft-info-card__sub-value">Type the balance you currently see in your bank app.</p>
      <div class="ft-add-movements-balance-result">
        <span class="ft-add-movements-balance-result__label">Difference</span>
        <span class="ft-add-movements-balance-result__value" data-balance-difference-value>${difference === null
          ? '—'
          : `${difference > 0 ? '+' : ''}${formatMoneyFromCents(difference, currency)}`}</span>
      </div>
      <p class="ft-info-card__sub-value" data-balance-difference-sub-value>${difference === null
        ? 'Actual balance not entered'
        : 'Actual balance minus expected after commit'}</p>
    </div>
    <footer class="ft-info-card__footer">
      <span class="ft-info-card__note" data-balance-difference-note>${difference === null
        ? 'Enter the balance from your bank app to compare.'
        : difference === 0
          ? 'Matches your bank app.'
          : 'Non-zero means you still have money to reconcile.'}</span>
    </footer>
  `;
  return card;
}

function _getDifferenceVariant(difference) {
  if (difference === null) return 'default';
  return difference === 0 ? 'success' : 'warning';
}

function _formatEditableAmount(cents) {
  return ((Number(cents) || 0) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function _getActualBalanceCents(state, accountId) {
  const key = String(accountId ?? '');
  const value = state.actualBalances?.[key];
  return Number.isFinite(value) ? value : null;
}

/* ── Unified Toolbar ──────────────────────────────────────────────────────── */

function renderAccountToolbar(toolbarEl, state, domRefs) {
  const existingSelect = toolbarEl.querySelector('#add-movements-account-select');

  if (!existingSelect) {
    const optionsHtml = state.accounts
      .map(account => {
        const selected = Number(account.id) === Number(state.selectedAccountId) ? 'selected' : '';
        const currency = normalizeCurrency(account.currency);
        return `<option value="${account.id}" ${selected}>${account.account} · ${account.owner} · ${currency}</option>`;
      })
      .join('');

    toolbarEl.innerHTML = `
      <div class="ft-add-movements-toolbar__left">
        <div class="ft-add-movements-toolbar__field ft-add-movements-toolbar__field--account">
          <label class="ft-add-movements-toolbar__label" for="add-movements-account-select">Account</label>
          <select id="add-movements-account-select" class="ft-add-movements-toolbar__select">
            ${optionsHtml}
          </select>
        </div>
        <div class="ft-add-movements-toolbar__field ft-add-movements-toolbar__field--type">
          <span class="ft-add-movements-toolbar__label">Type</span>
          <div class="ft-add-type-toggle" id="add-movements-type-toggle">
            <button class="ft-add-type-toggle__btn ft-add-type-toggle__btn--expense${state.draftType === 'Expense' ? ' ft-add-type-toggle__btn--active' : ''}" data-type="Expense">Expense</button>
            <button class="ft-add-type-toggle__btn ft-add-type-toggle__btn--income${state.draftType === 'Income' ? ' ft-add-type-toggle__btn--active' : ''}" data-type="Income">Income</button>
          </div>
        </div>
      </div>
      <div class="ft-add-movements-toolbar__actions">
        <button class="ft-btn ft-btn--ghost" id="btn-pdf-import-movements">
          <span class="material-symbols-outlined" aria-hidden="true">picture_as_pdf</span>
          Import PDF
        </button>
        <button class="ft-btn ft-btn--ghost" id="btn-bulk-add-movements">
          <span class="material-symbols-outlined" aria-hidden="true">playlist_add</span>
          Bulk Add
        </button>
        <button class="ft-btn ft-btn--ghost" id="btn-discard-movements" disabled>Discard</button>
        <button class="ft-btn ft-btn--primary" id="btn-commit-movements" disabled>
          <span class="material-symbols-outlined" aria-hidden="true">check</span>
          Commit
        </button>
      </div>
    `;

    domRefs.commitBtn = toolbarEl.querySelector('#btn-commit-movements');
    domRefs.discardBtn = toolbarEl.querySelector('#btn-discard-movements');
    return;
  }

  if (existingSelect.value !== String(state.selectedAccountId)) {
    existingSelect.value = String(state.selectedAccountId);
  }
}

function renderMobileComposer(target, state) {
  if (!target) return;

  if (typeof target._mobileDatePickerCleanup === 'function') {
    target._mobileDatePickerCleanup();
    target._mobileDatePickerCleanup = null;
  }

  const draft = state.mobileDraft || {};
  const account = getSelectedAccount(state);
  const accountLabel = account
    ? `${account.account} · ${account.owner} · ${normalizeCurrency(account.currency)}`
    : 'No account selected';
  const categories = state.categories.filter(category => category.type === state.draftType);
  const subCategories = state.subCategories.filter(subCategory => {
    if (subCategory.type !== state.draftType) return false;
    if (!Number.isFinite(Number(draft.category_id))) return true;
    return Number(subCategory.category_id) === Number(draft.category_id);
  });
  const repetitiveItems = (state.repetitiveMovements || []).filter(item => item.type === state.draftType);

  const categoryOptions = [
    '<option value="">Select category</option>',
    ...categories.map(category => `<option value="${category.id}"${Number(draft.category_id) === Number(category.id) ? ' selected' : ''}>${category.category}</option>`),
  ].join('');

  const subCategoryOptions = [
    '<option value="">Select sub-category</option>',
    ...subCategories.map(subCategory => `<option value="${subCategory.id}"${Number(draft.sub_category_id) === Number(subCategory.id) ? ' selected' : ''}>${subCategory.sub_category}</option>`),
  ].join('');

  const repetitiveOptions = [
    '<option value="">No repetitive movement</option>',
    ...repetitiveItems.map(item => `<option value="${item.id}"${Number(draft.repetitive_movement_id) === Number(item.id) ? ' selected' : ''}>${item.movement}</option>`),
  ].join('');

  target.innerHTML = `
    <div class="ft-add-movements-mobile-card">
      <div class="ft-add-movements-mobile-card__header">
        <div class="ft-add-movements-mobile-card__eyebrow">
          <span class="ft-add-movements-mobile-card__badge">${state.draftType}</span>
          <span class="ft-add-movements-mobile-card__account">${_escapeHtml(accountLabel)}</span>
        </div>
        <h2 class="ft-add-movements-mobile-card__title">Add movement</h2>
        <p class="ft-small ft-text-muted ft-add-movements-mobile-card__subtitle">Fill this form, tap add, then review the draft list below before committing.</p>
      </div>
      <div class="ft-add-movements-mobile-form">
        <div class="ft-add-movements-mobile-form__field ft-add-movements-mobile-form__field--full">
          <label class="ft-add-movements-toolbar__label" for="add-movements-mobile-movement">Movement</label>
          <input id="add-movements-mobile-movement" class="ft-add-movements-mobile-form__control" type="text" value="${_escapeAttr(draft.movement || '')}" data-mobile-draft-field="movement" placeholder="Groceries, Salary, Rent..." />
        </div>
        <div class="ft-add-movements-mobile-form__row">
          <div class="ft-add-movements-mobile-form__field">
            <label class="ft-add-movements-toolbar__label" for="add-movements-mobile-amount">Amount</label>
            <input id="add-movements-mobile-amount" class="ft-add-movements-mobile-form__control" type="number" inputmode="decimal" min="0" step="0.01" value="${_escapeAttr(draft.amount ?? '')}" data-mobile-draft-field="amount" placeholder="0.00" />
          </div>
          <div class="ft-add-movements-mobile-form__field">
            <label class="ft-add-movements-toolbar__label">Date</label>
            <div data-mobile-date-picker-insert></div>
          </div>
        </div>
        <div class="ft-add-movements-mobile-form__row">
          <div class="ft-add-movements-mobile-form__field">
            <label class="ft-add-movements-toolbar__label" for="add-movements-mobile-category">Category</label>
            <select id="add-movements-mobile-category" class="ft-add-movements-mobile-form__control" data-mobile-draft-field="category_id">${categoryOptions}</select>
          </div>
          <div class="ft-add-movements-mobile-form__field">
            <label class="ft-add-movements-toolbar__label" for="add-movements-mobile-subcategory">Sub-category</label>
            <select id="add-movements-mobile-subcategory" class="ft-add-movements-mobile-form__control" data-mobile-draft-field="sub_category_id">${subCategoryOptions}</select>
          </div>
        </div>
        <div class="ft-add-movements-mobile-form__field ft-add-movements-mobile-form__field--full">
          <label class="ft-add-movements-toolbar__label" for="add-movements-mobile-description">Description</label>
          <textarea id="add-movements-mobile-description" class="ft-add-movements-mobile-form__control ft-add-movements-mobile-form__control--textarea" data-mobile-draft-field="description" placeholder="Optional details">${draft.description || ''}</textarea>
        </div>
        <div class="ft-add-movements-mobile-form__field ft-add-movements-mobile-form__field--full">
          <label class="ft-add-movements-toolbar__label" for="add-movements-mobile-repetitive">Repetitive Movement</label>
          <select id="add-movements-mobile-repetitive" class="ft-add-movements-mobile-form__control" data-mobile-draft-field="repetitive_movement_id">${repetitiveOptions}</select>
        </div>
        <div class="ft-add-movements-mobile-form__actions">
          <button type="button" class="ft-btn ft-btn--ghost" data-mobile-draft-action="clear">Clear</button>
          <button type="button" class="ft-btn ft-btn--primary" data-mobile-draft-action="add">Add ${state.draftType.toLowerCase()} draft</button>
        </div>
        <p class="ft-add-movements-mobile-form__hint">Your drafts appear in the list below. Use Commit when you are done.</p>
      </div>
    </div>
  `;

  const dateInsert = target.querySelector('[data-mobile-date-picker-insert]');
  if (dateInsert) {
    const pickerField = DatePicker.createPickerField(
      'Select date',
      draft.date || '',
      isoDate => { state.mobileDraft.date = isoDate; }
    );
    dateInsert.replaceWith(pickerField);
    target._mobileDatePickerCleanup = pickerField._cleanup;
  }
}

function _escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function _escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export {
  updateHeaderButtons,
  renderBalanceCards,
  renderAccountToolbar,
  renderMobileComposer,
  syncBalanceCalculator,
  parseActualBalanceInput,
  formatActualBalanceInput,
  getActualBalanceInputValue,
};
