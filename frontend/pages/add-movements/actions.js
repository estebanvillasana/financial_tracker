/**
 * Add Movements page-level actions.
 *
 * Encapsulates the three main user flows:
 * - commitDrafts:        validate + partial bulk-create + refresh
 * - requestDiscard:      inline confirmation + clear
 * - handleAccountChange: currency warning + grid refresh
 */
import { bankAccounts, movements } from '../../services/api.js';
import { normalizeCurrency, createSentinelRow, isAddRow } from './constants.js';
import { getSelectedAccount } from './utils.js';
import { validateAllDrafts } from './validation.js';
import { commitSentinelRow, syncRowsFromGrid, applyRowTypeAttributes, clearErrorHighlights, highlightErrorCells } from './grid.js';
import { saveDraftsImmediate, clearDrafts } from './drafts.js';
import { FeedbackBanner } from '../../components/dumb/feedbackBanner/feedbackBanner.js';
import {
  updateHeaderButtons,
  renderBalanceCards,
  renderAccountToolbar,
} from './render.js';

/* ── Commit Flow ── */

/**
 * Validates all drafts, commits valid ones, keeps invalid ones in the grid
 * with highlighted error cells.
 */
async function commitDrafts(state, domRefs, refreshSummaryState) {
  if (!state.gridApi) return;

  state.gridApi.stopEditing();
  commitSentinelRow(state);
  syncRowsFromGrid(state);

  const selectedAccount = getSelectedAccount(state);
  if (!selectedAccount) return FeedbackBanner.render(domRefs.feedbackEl, 'Please select a bank account first.');
  if (state.rows.length === 0) return FeedbackBanner.render(domRefs.feedbackEl, 'Add at least one draft movement before committing.');

  clearErrorHighlights(state.gridApi);

  const { valid, invalid } = validateAllDrafts(state.rows, state, selectedAccount.id);

  if (valid.length === 0 && invalid.length > 0) {
    _showInvalidFeedback(invalid, domRefs.feedbackEl);
    _applyErrorHighlights(state.gridApi, invalid);
    return;
  }

  state.isCommitting = true;
  updateHeaderButtons(state, domRefs.commitBtn, domRefs.discardBtn);
  FeedbackBanner.clear(domRefs.feedbackEl);

  try {
    const payloads = valid.map(v => v.payload);
    await movements.createBulk({ movements: payloads });

    const refreshed = await bankAccounts.getOne(selectedAccount.id);
    state.accounts = state.accounts.map(account => (Number(account.id) === Number(refreshed.id) ? refreshed : account));

    /* Remove committed rows from the grid */
    state.gridApi.applyTransaction({ remove: valid.map(v => ({ _id: v.row._id })) });

    if (invalid.length > 0) {
      _showPartialFeedback(payloads.length, invalid, domRefs.feedbackEl);
      _applyErrorHighlights(state.gridApi, invalid);
    } else {
      state.gridApi.setGridOption('rowData', [createSentinelRow(state.draftType)]);
      clearDrafts();
      FeedbackBanner.render(
        domRefs.feedbackEl,
        Committed  movement successfully.,
        'success'
      );
    }

    syncRowsFromGrid(state);
    renderAccountToolbar(domRefs.toolbarEl, state, domRefs);
    renderBalanceCards(domRefs.balancesEl, state);

  } catch (error) {
    FeedbackBanner.render(domRefs.feedbackEl, error?.message || 'Failed to commit movements.');
  } finally {
    state.isCommitting = false;
    updateHeaderButtons(state, domRefs.commitBtn, domRefs.discardBtn);
    requestAnimationFrame(() => applyRowTypeAttributes(state.gridApi));
  }
}

function _showPartialFeedback(committedCount, invalid, feedbackEl) {
  const errorSummary = invalid
    .slice(0, 4)
    .map(({ row, errors }) => {
      const name = row.movement || 'Unnamed';
      return <b></b>: ;
    })
    .join('<br/>');
  const extra = invalid.length > 4 ? <br/>…and  more row(s). : '';
  FeedbackBanner.render(
    feedbackEl,
    Committed  movement.  +
    ${invalid.length} row still need correction:<br/>,
    'warning'
  );
}

function _showInvalidFeedback(invalid, feedbackEl) {
  const errorSummary = invalid
    .slice(0, 4)
    .map(({ row, errors }) => {
      const name = row.movement || 'Unnamed';
      return <b></b>: ;
    })
    .join('<br/>');
  const extra = invalid.length > 4 ? <br/>…and  more row(s). : '';
  FeedbackBanner.render(feedbackEl, ${errorSummary});
}

function _applyErrorHighlights(gridApi, invalid) {
  invalid.forEach(({ row, errorFields }) => {
    highlightErrorCells(gridApi, row._id, errorFields);
  });
}

/* ── Discard Confirmation ── */

function requestDiscard(state, domRefs, refreshSummaryState) {
  if (state.rows.length === 0) return;

  const count = state.rows.length;
  FeedbackBanner.renderWithActions(
    domRefs.feedbackEl,
    Discard  draft movement? This cannot be undone.,
    [
      {
        label: 'Yes, Discard',
        className: 'ft-feedback-banner__btn--danger',
        onClick: () => {
          state.gridApi.stopEditing();
          clearErrorHighlights(state.gridApi);
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

/* ── Account Switch + Currency Warning ── */

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
      Currency changed from  to . Draft amounts now display in .,
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
