/**
 * Add Movements page-level actions.
 *
 * Encapsulates the three main user flows:
 * - commitDrafts:        validate + partial bulk-create + refresh
 * - requestDiscard:      inline confirmation + clear
 * - handleAccountChange: currency warning + grid refresh
 */
import { bankAccounts, movements } from '../../services/api.js';
import { createDraftRow, createSentinelRow, isAddRow } from './constants.js';
import { normalizeCurrency } from '../../utils/formatters.js';
import { getSelectedAccount } from './utils.js';
import { validateAllDrafts } from './validation.js';
import { commitSentinelRow, syncRowsFromGrid, applyRowTypeAttributes, clearErrorHighlights, highlightErrorCells } from './grid.js';
import { saveDraftsImmediate, clearDrafts } from './drafts.js';
import { FeedbackBanner } from '../../components/dumb/feedbackBanner/feedbackBanner.js';
import { BulkAddModal } from '../../components/modals/bulkAddModal/bulkAddModal.js';
import { PdfImportModal } from '../../components/modals/pdfImportModal/pdfImportModal.js';
import { openDuplicateDraftModal } from './duplicateDraftModal.js';
import {
  updateHeaderButtons,
  renderBalanceCards,
  renderMobileDraftList,
  renderAccountToolbar,
} from './render.js';

/* ── Commit Flow ──────────────────────────────────────────────────────────── */

/**
 * Validates all drafts, commits valid ones, keeps invalid ones in the grid
 * with highlighted error cells.
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
        `Committed ${payloads.length} movement${payloads.length === 1 ? '' : 's'} successfully.`,
        'success'
      );
    }

    syncRowsFromGrid(state);
    renderAccountToolbar(domRefs.toolbarEl, state, domRefs);
    renderBalanceCards(domRefs.balancesEl, state);
    renderMobileDraftList(domRefs.mobileDraftsEl, state);

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
      return `<b>${name}</b>: ${errors[0]}`;
    })
    .join('<br/>');
  const extra = invalid.length > 4 ? `<br/>\u2026and ${invalid.length - 4} more row(s).` : '';
  FeedbackBanner.render(
    feedbackEl,
    `Committed ${committedCount} movement${committedCount === 1 ? '' : 's'}. ` +
    `${invalid.length} row${invalid.length === 1 ? '' : 's'} still need${invalid.length === 1 ? 's' : ''} correction:<br/>${errorSummary}${extra}`,
    'warning'
  );
}

function _showInvalidFeedback(invalid, feedbackEl) {
  const errorSummary = invalid
    .slice(0, 4)
    .map(({ row, errors }) => {
      const name = row.movement || 'Unnamed';
      return `<b>${name}</b>: ${errors[0]}`;
    })
    .join('<br/>');
  const extra = invalid.length > 4 ? `<br/>\u2026and ${invalid.length - 4} more row(s).` : '';
  FeedbackBanner.render(feedbackEl, `${errorSummary}${extra}`);
}

function _applyErrorHighlights(gridApi, invalid) {
  invalid.forEach(({ row, errorFields }) => {
    highlightErrorCells(gridApi, row._id, errorFields);
  });
}

/* ── Discard Confirmation ─────────────────────────────────────────────────── */

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

/* ── Account Switch + Currency Warning ────────────────────────────────────── */

function handleAccountChange(newAccountId, state, domRefs) {
  const oldAccount = getSelectedAccount(state);
  const oldCurrency = normalizeCurrency(oldAccount?.currency);

  state.selectedAccountId = newAccountId;

  const newAccount = getSelectedAccount(state);
  const newCurrency = normalizeCurrency(newAccount?.currency);

  renderAccountToolbar(domRefs.toolbarEl, state, domRefs);
  renderBalanceCards(domRefs.balancesEl, state);
  renderMobileDraftList(domRefs.mobileDraftsEl, state);
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

/* ── Bulk Add ─────────────────────────────────────────────────────────────── */

/**
 * Opens the Bulk Add modal and inserts generated rows into the grid.
 *
 * @param {object}   state              - Page state
 * @param {object}   domRefs            - DOM element references
 * @param {Function} refreshSummaryState - Summary refresh callback
 */
function handleBulkAdd(state, domRefs, refreshSummaryState) {
  BulkAddModal.open(
    {
      type: state.draftType,
      categories: state.categories,
      subCategories: state.subCategories,
      repetitiveMovements: state.repetitiveMovements,
    },
    (rowDataList) => {
      if (!state.gridApi || rowDataList.length === 0) return;

      const newRows = rowDataList.map(data => {
        const row = createDraftRow(data.type || state.draftType);
        row.movement = data.movement || '';
        row.description = data.description || '';
        row.date = data.date || row.date;
        row.amount = data.amount || null;
        row.category_id = data.category_id || null;
        row.sub_category_id = data.sub_category_id || null;
        row.repetitive_movement_id = data.repetitive_movement_id || null;
        return row;
      });

      state.gridApi.applyTransaction({
        add: newRows,
        addIndex: state.rows.length,
      });

      syncRowsFromGrid(state);
      refreshSummaryState(state, domRefs);
      requestAnimationFrame(() => applyRowTypeAttributes(state.gridApi));

      FeedbackBanner.render(
        domRefs.feedbackEl,
        `Added ${newRows.length} draft movement${newRows.length === 1 ? '' : 's'} from bulk add.`,
        'success',
      );
      setTimeout(() => {
        const current = domRefs.feedbackEl?.querySelector('.ft-feedback-banner--success');
        if (current) FeedbackBanner.clear(domRefs.feedbackEl);
      }, 5000);
    },
  );
}

/* ── Draft Duplication ────────────────────────────────────────────────────── */

function _insertDraftRows(state, domRefs, refreshSummaryState, sourceRowId, rowIndex, rows) {
  if (!state.gridApi || !Array.isArray(rows) || rows.length === 0) return;

  const sourceIndex = Number.isInteger(rowIndex)
    ? rowIndex
    : state.rows.findIndex(item => item._id === sourceRowId);

  const addIndex = sourceIndex >= 0 ? sourceIndex + 1 : state.rows.length;

  const newRows = rows.map(data => {
    const row = createDraftRow(data.type || state.draftType);
    row.movement = data.movement || '';
    row.description = data.description || '';
    row.type = data.type || state.draftType;
    row.date = data.date || row.date;
    row.amount = data.amount ?? null;
    row.category_id = data.category_id ?? null;
    row.sub_category_id = data.sub_category_id ?? null;
    row.repetitive_movement_id = data.repetitive_movement_id ?? null;
    return row;
  });

  state.gridApi.applyTransaction({
    add: newRows,
    addIndex,
  });

  syncRowsFromGrid(state);
  refreshSummaryState(state, domRefs);
  requestAnimationFrame(() => applyRowTypeAttributes(state.gridApi));
}

function handleDuplicateRow({ mode = 'simple', row, rowIndex }, state, domRefs, refreshSummaryState) {
  if (!row || isAddRow(row)) return;

  openDuplicateDraftModal(
    { mode, row, state },
    {
      onDuplicate: duplicatedRows => {
        if (!duplicatedRows?.length) return;

        _insertDraftRows(state, domRefs, refreshSummaryState, row._id, rowIndex, duplicatedRows);

        const copyCount = duplicatedRows.length;
        const isDynamic = mode === 'dynamic';
        FeedbackBanner.render(
          domRefs.feedbackEl,
          isDynamic
            ? `Added ${copyCount} customized duplicate${copyCount === 1 ? '' : 's'} to the draft grid.`
            : `Added ${copyCount} duplicate${copyCount === 1 ? '' : 's'} to the draft grid.`,
          'success',
        );
        setTimeout(() => {
          const current = domRefs.feedbackEl?.querySelector('.ft-feedback-banner--success');
          if (current) FeedbackBanner.clear(domRefs.feedbackEl);
        }, 4000);
      },
    },
  );
}

/* ── PDF Import ────────────────────────────────────────────────────────────── */

/**
 * Opens the PDF Import modal and inserts extracted rows into the grid.
 *
 * @param {object}   state              - Page state
 * @param {object}   domRefs            - DOM element references
 * @param {Function} refreshSummaryState - Summary refresh callback
 */
function handlePdfImport(state, domRefs, refreshSummaryState) {
  PdfImportModal.open(
    { type: state.draftType },
    (rowDataList) => {
      if (!state.gridApi || rowDataList.length === 0) return;

      const newRows = rowDataList.map(data => {
        const row = createDraftRow(data.type || state.draftType);
        row.movement = data.movement || '';
        row.description = data.description || '';
        row.date = data.date || row.date;
        row.amount = data.amount || null;
        row.type = data.type || state.draftType;
        row.category_id = data.category_id || null;
        row.sub_category_id = data.sub_category_id || null;
        row.repetitive_movement_id = data.repetitive_movement_id || null;
        return row;
      });

      state.gridApi.applyTransaction({
        add: newRows,
        addIndex: state.rows.length,
      });

      syncRowsFromGrid(state);
      refreshSummaryState(state, domRefs);
      requestAnimationFrame(() => applyRowTypeAttributes(state.gridApi));

      FeedbackBanner.render(
        domRefs.feedbackEl,
        `Imported ${newRows.length} movement${newRows.length === 1 ? '' : 's'} from PDF.`,
        'success',
      );
      setTimeout(() => {
        const current = domRefs.feedbackEl?.querySelector('.ft-feedback-banner--success');
        if (current) FeedbackBanner.clear(domRefs.feedbackEl);
      }, 5000);
    },
  );
}

export { commitDrafts, requestDiscard, handleAccountChange, handleBulkAdd, handleDuplicateRow, handlePdfImport };
