/**
 * Add Movements presentation helpers.
 *
 * Renders DOM fragments for:
 * - Unified toolbar (account selector + type toggle + action buttons)
 * - Balance summary cards
 * - Feedback banners (error, success, warning, confirmation)
 * - Button state management
 */
import { InfoCard } from '../../components/dumb/infoCard/infoCard.js';
import { normalizeCurrency } from './constants.js';
import { formatMoneyFromCents, getSelectedAccount, toSignedCents } from './utils.js';

/* ── Feedback Rendering ───────────────────────────────────────────────────── */

/**
 * Renders transient error/success/warning feedback above the grid.
 *
 * @param {HTMLElement}  feedbackEl  - Container element for feedback
 * @param {string}       message     - HTML message content (empty string clears)
 * @param {'error'|'success'|'warning'} [tone='error'] - Visual tone
 */
function renderFeedback(feedbackEl, message, tone = 'error') {
  if (!feedbackEl) return;
  if (!message) {
    feedbackEl.innerHTML = '';
    return;
  }
  feedbackEl.innerHTML = `<div class="ft-add-movements-feedback ft-add-movements-feedback--${tone}">${message}</div>`;
}

/**
 * Renders a warning feedback with inline action buttons.
 *
 * @param {HTMLElement}  feedbackEl  - Container element
 * @param {string}       message     - Warning text
 * @param {Array<{label: string, className?: string, onClick: Function}>} actions
 */
function renderFeedbackWithActions(feedbackEl, message, actions = []) {
  if (!feedbackEl) return;

  const actionsHtml = actions
    .map((a, i) => {
      const cls = a.className ? ` ${a.className}` : '';
      return `<button class="ft-add-movements-feedback__btn${cls}" data-action-index="${i}">${a.label}</button>`;
    })
    .join('');

  feedbackEl.innerHTML = `
    <div class="ft-add-movements-feedback ft-add-movements-feedback--warning">
      ${message}
      <span class="ft-add-movements-feedback__actions">${actionsHtml}</span>
    </div>`;

  /* Wire button clicks via delegation */
  feedbackEl.addEventListener('click', function _handler(event) {
    const btn = event.target.closest('[data-action-index]');
    if (!btn) return;
    const index = Number(btn.dataset.actionIndex);
    if (actions[index]?.onClick) actions[index].onClick();
    feedbackEl.removeEventListener('click', _handler);
  }, { once: false });
}

/* ── Button State Management ──────────────────────────────────────────────── */

/**
 * Enables/disables page-level commit/discard actions.
 *
 * @param {object}       state       - Page state
 * @param {HTMLElement}  commitBtn   - Commit button
 * @param {HTMLElement}  discardBtn  - Discard button
 */
function updateHeaderButtons(state, commitBtn, discardBtn) {
  const hasRows = state.rows.length > 0;
  const hasAccount = Number.isFinite(Number(state.selectedAccountId));
  if (discardBtn) discardBtn.disabled = !hasRows;
  if (commitBtn) commitBtn.disabled = !hasRows || !hasAccount || state.isCommitting;
}

/**
 * Enables/disables row-action buttons tied to current selection.
 *
 * @param {object}       state             - Page state
 * @param {HTMLElement}  removeSelectedBtn  - Remove selected button
 */
function updateTableActionButtons(state, removeSelectedBtn) {
  if (!removeSelectedBtn) return;
  const selectedCount = state.gridApi ? state.gridApi.getSelectedRows().length : 0;
  removeSelectedBtn.disabled = selectedCount === 0;
}

/* ── Balance Cards ────────────────────────────────────────────────────────── */

/**
 * Renders current and projected balance cards for the selected account.
 *
 * @param {HTMLElement}  target  - Container for the balance cards
 * @param {object}       state   - Page state with accounts, rows, selectedAccountId
 */
function renderBalanceCards(target, state) {
  if (!target) return;
  target.innerHTML = '';

  const account = getSelectedAccount(state);
  if (!account) return;

  const currentBalance = Number(account.total_balance ?? 0);
  const expectedBalance = currentBalance + state.rows.reduce((sum, row) => sum + toSignedCents(row), 0);
  const delta = expectedBalance - currentBalance;
  const currency = normalizeCurrency(account.currency);

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
}

/* ── Unified Toolbar ──────────────────────────────────────────────────────── */

/**
 * Renders the unified toolbar containing:
 * - Account selector (stable — only created once, not re-rendered on state changes)
 * - Type toggle (Expense / Income)
 * - Action buttons (Remove, Discard, Commit)
 *
 * On subsequent calls (when the <select> already exists), only the select's
 * value is synchronized — the element is NOT recreated. This prevents focus
 * loss and unnecessary DOM churn.
 *
 * @param {HTMLElement}  toolbarEl  - Toolbar container
 * @param {object}       state      - Page state
 * @param {object}       domRefs    - DOM references for action buttons
 */
function renderAccountToolbar(toolbarEl, state, domRefs) {
  const existingSelect = toolbarEl.querySelector('#add-movements-account-select');

  /* ── First render: build the full toolbar structure ── */
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
        <button class="ft-btn ft-btn--ghost" id="btn-remove-selected-drafts" disabled>
          <span class="material-symbols-outlined" aria-hidden="true">delete</span>
          Remove
        </button>
        <button class="ft-btn ft-btn--ghost" id="btn-discard-movements" disabled>Discard</button>
        <button class="ft-btn ft-btn--primary" id="btn-commit-movements" disabled>
          <span class="material-symbols-outlined" aria-hidden="true">check</span>
          Commit
        </button>
      </div>
    `;

    /* Update domRefs to point at the newly created buttons */
    domRefs.commitBtn = toolbarEl.querySelector('#btn-commit-movements');
    domRefs.discardBtn = toolbarEl.querySelector('#btn-discard-movements');
    domRefs.removeSelectedBtn = toolbarEl.querySelector('#btn-remove-selected-drafts');
    return;
  }

  /* ── Subsequent renders: only sync the select value ── */
  if (existingSelect.value !== String(state.selectedAccountId)) {
    existingSelect.value = String(state.selectedAccountId);
  }
}

export {
  renderFeedback,
  renderFeedbackWithActions,
  updateHeaderButtons,
  updateTableActionButtons,
  renderBalanceCards,
  renderAccountToolbar,
};
