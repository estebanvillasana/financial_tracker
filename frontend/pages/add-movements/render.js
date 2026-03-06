/**
 * Add Movements presentation helpers.
 * These functions render DOM fragments and top-level metric widgets.
 */
import { InfoCard } from '../../components/dumb/infoCard/infoCard.js';
import { normalizeCurrency } from './constants.js';
import { formatMoneyFromCents, getSelectedAccount, toSignedCents } from './utils.js';

/** Renders transient error/success feedback above the grid. */
function renderFeedback(feedbackEl, message, tone = 'error') {
  if (!feedbackEl) return;
  if (!message) {
    feedbackEl.innerHTML = '';
    return;
  }
  feedbackEl.innerHTML = `<div class="ft-add-movements-feedback ft-add-movements-feedback--${tone}">${message}</div>`;
}

/** Enables/disables page-level commit/discard actions. */
function updateHeaderButtons(state, commitBtn, discardBtn) {
  const hasRows = state.rows.length > 0;
  const hasAccount = Number.isFinite(Number(state.selectedAccountId));
  if (discardBtn) discardBtn.disabled = !hasRows;
  if (commitBtn) commitBtn.disabled = !hasRows || !hasAccount || state.isCommitting;
}

/** Enables/disables row-action buttons tied to current selection. */
function updateTableActionButtons(state, removeSelectedBtn) {
  if (!removeSelectedBtn) return;
  const selectedCount = state.gridApi ? state.gridApi.getSelectedRows().length : 0;
  removeSelectedBtn.disabled = selectedCount === 0;
}

/** Renders current and projected balances for selected account. */
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

/** Renders account selector + summary chips and wires account change. */
function renderAccountToolbar(toolbarEl, state, domRefs) {
  const optionsHtml = state.accounts
    .map(account => {
      const selected = Number(account.id) === Number(state.selectedAccountId) ? 'selected' : '';
      const currency = normalizeCurrency(account.currency);
      return `<option value="${account.id}" ${selected}>${account.account} · ${account.owner} · ${currency}</option>`;
    })
    .join('');

  const selectedAccount = getSelectedAccount(state);
  const accountCurrency = normalizeCurrency(selectedAccount?.currency);

  toolbarEl.innerHTML = `
    <div class="ft-add-movements-toolbar__left">
      <label class="ft-add-movements-toolbar__label" for="add-movements-account-select">Bank account</label>
      <select id="add-movements-account-select" class="ft-add-movements-toolbar__select">
        ${optionsHtml}
      </select>
    </div>
    <div class="ft-add-movements-toolbar__meta">
      <span class="ft-add-movements-toolbar__chip">Currency: ${accountCurrency || '—'}</span>
      <span class="ft-add-movements-toolbar__chip">Drafts: ${state.rows.length}</span>
    </div>
  `;

  const select = toolbarEl.querySelector('#add-movements-account-select');
  if (select) {
    select.addEventListener('change', event => {
      state.selectedAccountId = Number(event.target.value);
      renderAccountToolbar(toolbarEl, state, domRefs);
      renderBalanceCards(domRefs.balancesEl, state);
      updateHeaderButtons(state, domRefs.commitBtn, domRefs.discardBtn);
      renderFeedback(domRefs.feedbackEl, '');
    });
  }
}

export {
  renderFeedback,
  updateHeaderButtons,
  updateTableActionButtons,
  renderBalanceCards,
  renderAccountToolbar,
};
