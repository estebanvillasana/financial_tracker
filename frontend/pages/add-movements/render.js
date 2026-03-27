/**
 * Add Movements presentation helpers.
 *
 * Renders DOM fragments for:
 * - Unified toolbar (account selector + type toggle + action buttons)
 * - Balance summary cards
 * - Button state management
 */
import { InfoCard } from '../../components/dumb/infoCard/infoCard.js';
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
        <label class="ft-add-movements-toolbar__label" for="add-movements-account-select">Account</label>
        <select id="add-movements-account-select" class="ft-add-movements-toolbar__select">
          ${optionsHtml}
        </select>
        <div class="ft-add-type-toggle" id="add-movements-type-toggle">
          <button class="ft-add-type-toggle__btn ft-add-type-toggle__btn--expense${state.draftType === 'Expense' ? ' ft-add-type-toggle__btn--active' : ''}" data-type="Expense">Expense</button>
          <button class="ft-add-type-toggle__btn ft-add-type-toggle__btn--income${state.draftType === 'Income' ? ' ft-add-type-toggle__btn--active' : ''}" data-type="Income">Income</button>
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

export {
  updateHeaderButtons,
  renderBalanceCards,
  renderAccountToolbar,
  syncBalanceCalculator,
  parseActualBalanceInput,
  formatActualBalanceInput,
  getActualBalanceInputValue,
};
