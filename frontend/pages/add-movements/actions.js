/**
 * Add Movements page-level actions.
 *
 * Encapsulates the three main user flows:
 * - commitDrafts:        validate + bulk-create + refresh
 * - requestDiscard:      inline confirmation + clear
 * - handleAccountChange: currency warning + grid refresh
 */
import { bankAccounts, movements } from '../../services/api.js';
import { normalizeCurrency, createSentinelRow, isAddRow } from './constants.js';
import { getSelectedAccount } from './utils.js';
import { validateAllDrafts } from './validation.js';
import { commitSentinelRow, syncRowsFromGrid, applyRowTypeAttributes } from './grid.js';
import { saveDraftsImmediate, clearDrafts } from './drafts.js';
import { FeedbackBanner } from '../../components/dumb/feedbackBanner/feedbackBanner.js';
import {
  updateHeaderButtons,
  renderBalanceCards,
  renderAccountToolbar,
} from './render.js';

/* ── Commit Flow ──────────────────────────────────────────────────────────── */

/**
 * Sends all valid draft movements in one atomic bulk request.
 *
 * @param {object} state              - Page state
 * @param {object} domRefs            - DOM element references
 * @param {Function} refreshSummaryState - Summary refresh callback
 */
async function commitDrafts(state, domRefs, refreshSummaryState) {
  if (!state.gridApi) return;

  state.gridApi.stopEditing();
  commitSentinelRow(state);
  syncRowsFromGrid(state);

  const selectedAccount = getSelectedAccount(state);
  if (!selectedAccount) return FeedbackBanner.render(domRefs.feedbackEl, 'Please select a bank account first.');
  if (state.rows.length === 0) return FeedbackBanner.render(domRefs.feedbackEl, 'Add at least one draft movement before committing.');

  const { errors, payloads } = validateAllDrafts(state.rows, state, selectedAccount.id);
  if (errors.length > 0) return FeedbackBanner.render(domRefs.feedbackEl, errors.slice(0, 4).join('<br/>'));

  state.isCommitting = true;
  updateHeaderButtons(state, domRefs.commitBtn, domRefs.discardBtn);
  FeedbackBanner.clear(domRefs.feedbackEl);

  try {
    await movements.createBulk({ movements: payloads });
    const refreshed = await bankAccounts.getOne(selectedAccount.id);
    state.accounts = state.accounts.map(account => (Number(account.id) === Number(refreshed.id) ? refreshed : account));

    state.gridApi.setGridOption('rowData', [createSentinelRow(state.draftType)]);
    state.rows = [];
    clearDrafts();
    renderAccountToolbar(domRefs.toolbarEl, state, domRefs);
    renderBalanceCards(domRefs.balancesEl, state);
    FeedbackBanner.render(domRefs.feedbackEl, `Committed ${payloads.length} movement${payloads.length === 1 ? '' : 's'} successfully.`, 'success');
  } catch (error) {
    FeedbackBanner.render(domRefs.feedbackEl, error?.message || 'Failed to commit movements.');
  } finally {
    state.isCommitting = false;
    updateHeaderButtons(state, domRefs.commitBtn, domRefs.discardBtn);
  }
}

/* ── Discard Confirmation ─────────────────────────────────────────────────── */

/**
 * Shows an inline confirmation before discarding all drafts.
 *
 * @param {object} state              - Page state
 * @param {object} domRefs            - DOM element references
 * @param {Function} refreshSummaryState - Summary refresh callback
 */
function requestDiscard(state, domRefs, refreshSummaryState) {
  if (state.rows.length === 0) return;

  const count = state.rows.length;
  FeedbackBanner.renderWithActions(
    domRefs.feedbackEl,
    `Discard ${count} draft movement${count === 1 ? '' : 's'}? This cannot be undone.`,
    [
      {
        label: 'Yes, Discard',
        className: 'ft-feedback-banner__btn--danger',
        onClick: () => {
          state.gridApi.stopEditing();
          state.gridApi.setGridOption('rowData', [createSentinelRow(state.draftType)]);
          state.rows = [];
          clearDrafts();
          refreshSummaryState(state, domRefs);
          FeedbackBanner.clear(domRefs.feedbackEl);
        },
      },
      {
        label: 'Cancel',
        onClick: () => FeedbackBanner.clear(domRefs.feedbackEl),
      },
    ]
  );
}

/* ── Account Switch + Currency Warning ────────────────────────────────────── */

/**
 * Handles account selection change with currency warning when applicable.
 *
 * @param {number} newAccountId        - Newly selected account ID
 * @param {object} state               - Page state
 * @param {object} domRefs             - DOM references
 */
function handleAccountChange(newAccountId, state, domRefs) {
  const oldAccount = getSelectedAccount(state);
  const oldCurrency = normalizeCurrency(oldAccount?.currency);

  state.selectedAccountId = newAccountId;

  const newAccount = getSelectedAccount(state);
  const newCurrency = normalizeCurrency(newAccount?.currency);

  renderAccountToolbar(domRefs.toolbarEl, state, domRefs);
  renderBalanceCards(domRefs.balancesEl, state);
  updateHeaderButtons(state, domRefs.commitBtn, domRefs.discardBtn);

  if (state.gridApi) {
    state.gridApi.refreshCells({ force: true });
    requestAnimationFrame(() => applyRowTypeAttributes(state.gridApi));
  }

  if (state.rows.length > 0 && oldCurrency && newCurrency && oldCurrency !== newCurrency) {
    FeedbackBanner.render(
      domRefs.feedbackEl,
      `Currency changed from ${oldCurrency} to ${newCurrency}. Draft amounts now display in ${newCurrency}.`,
      'warning'
    );
    setTimeout(() => {
      const currentFeedback = domRefs.feedbackEl?.querySelector('.ft-feedback-banner--warning');
      if (currentFeedback) FeedbackBanner.clear(domRefs.feedbackEl);
    }, 5000);
  } else {
    FeedbackBanner.clear(domRefs.feedbackEl);
  }

  saveDraftsImmediate(state);
}

export { commitDrafts, requestDiscard, handleAccountChange };
