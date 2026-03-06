/**
 * Add Movements page bootstrap.
 *
 * This module orchestrates page-level concerns:
 * - data loading (accounts / categories / sub-categories),
 * - AG Grid initialization with lazy-loaded library,
 * - draft validation + bulk commit flow,
 * - draft persistence via sessionStorage,
 * - currency change warnings on account switch,
 * - discard confirmation flow,
 * - top-level UI event wiring.
 */
import { bankAccounts, categories, movements, subCategories } from '../../services/api.js';
import {
  AG_GRID_SCRIPT_SRC,
  TYPE_VALUES,
  SENTINEL_ID,
  createSentinelRow,
  isAddRow,
  normalizeCurrency,
} from './constants.js';
import { isValidIsoDate, parseNumberOrNull, getSelectedAccount } from './utils.js';
import {
  renderFeedback,
  renderFeedbackWithActions,
  updateHeaderButtons,
  updateTableActionButtons,
  renderBalanceCards,
  renderAccountToolbar,
} from './render.js';
import { commitSentinelRow, syncRowsFromGrid, mountGrid, applyRowTypeAttributes } from './grid.js';
import { saveDrafts, saveDraftsImmediate, restoreDrafts, clearDrafts } from './drafts.js';

/* ── AG Grid Lazy Loading ─────────────────────────────────────────────────── */

/**
 * Lazy-loads the AG Grid library only when the page is entered.
 * Shared promise prevents double-loading across re-navigations.
 *
 * @returns {Promise<void>}
 */
function ensureAgGridLoaded() {
  if (window.agGrid) return Promise.resolve();
  if (window.__ftAgGridLoadingPromise) return window.__ftAgGridLoadingPromise;

  window.__ftAgGridLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = AG_GRID_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load AG Grid library.'));
    document.head.appendChild(script);
  });

  return window.__ftAgGridLoadingPromise;
}

/**
 * Builds the AG Grid theme consistent with the app's dark look.
 *
 * @returns {object} AG Grid theme object
 */
function getGridTheme() {
  return window.agGrid.themeQuartz.withPart(window.agGrid.colorSchemeDarkBlue).withParams({
    spacing: 4,
    headerFontWeight: 600,
  });
}

/* ── State Refresh ────────────────────────────────────────────────────────── */

/**
 * Recomputes all UI regions that depend on current draft rows.
 * Also persists drafts to sessionStorage (debounced).
 *
 * @param {object} state    - Page state
 * @param {object} domRefs  - DOM element references
 */
function refreshSummaryState(state, domRefs) {
  syncRowsFromGrid(state);
  renderAccountToolbar(domRefs.toolbarEl, state, domRefs);
  renderBalanceCards(domRefs.balancesEl, state);
  updateHeaderButtons(state, domRefs.commitBtn, domRefs.discardBtn);
  updateTableActionButtons(state, domRefs.removeSelectedBtn);
  saveDrafts(state);
}

/* ── Draft Validation ─────────────────────────────────────────────────────── */

/**
 * Validates one draft row and transforms it into the backend payload shape.
 *
 * @param {object} row        - Draft row data from the grid
 * @param {object} state      - Page state (categories, subCategories)
 * @param {number} accountId  - Target account ID
 * @param {number} rowIndex   - 1-based row number for error messages
 * @returns {{ errors: string[], payload: object|null }}
 */
function normalizeDraftRow(row, state, accountId, rowIndex) {
  const movement = String(row?.movement || '').trim();
  const amount = Number(row?.amount);
  const type = String(row?.type || '');
  const date = String(row?.date || '');
  const description = String(row?.description || '').trim();
  const categoryId = parseNumberOrNull(row?.category_id);
  const subCategoryId = parseNumberOrNull(row?.sub_category_id);

  const errors = [];
  if (!movement) errors.push(`Row ${rowIndex}: movement is required.`);
  if (!TYPE_VALUES.includes(type)) errors.push(`Row ${rowIndex}: type must be Income or Expense.`);
  if (!isValidIsoDate(date)) errors.push(`Row ${rowIndex}: date must be YYYY-MM-DD.`);
  if (!Number.isFinite(amount) || amount <= 0) errors.push(`Row ${rowIndex}: amount must be greater than 0.`);

  const category = state.categories.find(item => Number(item.id) === Number(categoryId));
  if (categoryId !== null && !category) errors.push(`Row ${rowIndex}: category is invalid.`);
  if (category && category.type !== type) errors.push(`Row ${rowIndex}: category type must match movement type.`);

  const subCategory = state.subCategories.find(item => Number(item.id) === Number(subCategoryId));
  if (subCategoryId !== null && !subCategory) errors.push(`Row ${rowIndex}: sub-category is invalid.`);
  if (subCategory && categoryId !== null && Number(subCategory.category_id) !== Number(categoryId)) {
    errors.push(`Row ${rowIndex}: sub-category does not belong to selected category.`);
  }
  if (subCategory && subCategory.type !== type) {
    errors.push(`Row ${rowIndex}: sub-category type must match movement type.`);
  }

  if (errors.length > 0) return { errors, payload: null };

  const absCents = Math.round(Math.abs(amount) * 100);
  const value = type === 'Income' ? absCents : -absCents;

  return {
    errors: [],
    payload: {
      movement,
      description: description || null,
      account_id: Number(accountId),
      value,
      type,
      date,
      category_id: categoryId,
      sub_category_id: subCategoryId,
      repetitive_movement_id: null,
      invoice: 0,
      active: 1,
    },
  };
}

/* ── Commit Flow ──────────────────────────────────────────────────────────── */

/**
 * Sends all valid draft movements in one atomic bulk request.
 *
 * @param {object} state    - Page state
 * @param {object} domRefs  - DOM element references
 */
async function commitDrafts(state, domRefs) {
  if (!state.gridApi) return;

  state.gridApi.stopEditing();
  commitSentinelRow(state);
  syncRowsFromGrid(state);

  const selectedAccount = getSelectedAccount(state);
  if (!selectedAccount) return renderFeedback(domRefs.feedbackEl, 'Please select a bank account first.');
  if (state.rows.length === 0) return renderFeedback(domRefs.feedbackEl, 'Add at least one draft movement before committing.');

  const payloadRows = [];
  const errors = [];

  state.rows.forEach((row, index) => {
    if (isAddRow(row)) return;
    const { errors: rowErrors, payload } = normalizeDraftRow(row, state, selectedAccount.id, index + 1);
    if (rowErrors.length > 0) return errors.push(...rowErrors);
    payloadRows.push(payload);
  });

  if (errors.length > 0) return renderFeedback(domRefs.feedbackEl, errors.slice(0, 4).join('<br/>'));

  state.isCommitting = true;
  updateHeaderButtons(state, domRefs.commitBtn, domRefs.discardBtn);
  renderFeedback(domRefs.feedbackEl, '');

  try {
    await movements.createBulk({ movements: payloadRows });
    const refreshed = await bankAccounts.getOne(selectedAccount.id);
    state.accounts = state.accounts.map(account => (Number(account.id) === Number(refreshed.id) ? refreshed : account));

    state.gridApi.setGridOption('rowData', [createSentinelRow(state.draftType)]);
    state.rows = [];
    clearDrafts();
    renderAccountToolbar(domRefs.toolbarEl, state, domRefs);
    renderBalanceCards(domRefs.balancesEl, state);
    renderFeedback(domRefs.feedbackEl, `Committed ${payloadRows.length} movement${payloadRows.length === 1 ? '' : 's'} successfully.`, 'success');
  } catch (error) {
    renderFeedback(domRefs.feedbackEl, error?.message || 'Failed to commit movements.');
  } finally {
    state.isCommitting = false;
    updateHeaderButtons(state, domRefs.commitBtn, domRefs.discardBtn);
  }
}

/* ── Discard Confirmation ─────────────────────────────────────────────────── */

/**
 * Shows an inline confirmation before discarding all drafts.
 *
 * @param {object} state    - Page state
 * @param {object} domRefs  - DOM element references
 */
function requestDiscard(state, domRefs) {
  if (state.rows.length === 0) return;

  const count = state.rows.length;
  renderFeedbackWithActions(
    domRefs.feedbackEl,
    `Discard ${count} draft movement${count === 1 ? '' : 's'}? This cannot be undone.`,
    [
      {
        label: 'Yes, Discard',
        className: 'ft-add-movements-feedback__btn--danger',
        onClick: () => {
          state.gridApi.stopEditing();
          state.gridApi.setGridOption('rowData', [createSentinelRow(state.draftType)]);
          state.rows = [];
          clearDrafts();
          refreshSummaryState(state, domRefs);
          renderFeedback(domRefs.feedbackEl, '');
        },
      },
      {
        label: 'Cancel',
        onClick: () => renderFeedback(domRefs.feedbackEl, ''),
      },
    ]
  );
}

/* ── Account Switch + Currency Warning ────────────────────────────────────── */

/**
 * Handles account selection change.
 * If the new account uses a different currency and there are drafts,
 * shows a transient warning. Always refreshes the grid to update
 * currency formatting.
 *
 * @param {number} newAccountId - Newly selected account ID
 * @param {object} state        - Page state
 * @param {object} domRefs      - DOM references
 */
function handleAccountChange(newAccountId, state, domRefs) {
  const oldAccount = getSelectedAccount(state);
  const oldCurrency = normalizeCurrency(oldAccount?.currency);

  state.selectedAccountId = newAccountId;

  const newAccount = getSelectedAccount(state);
  const newCurrency = normalizeCurrency(newAccount?.currency);

  /* Refresh toolbar, balance cards, and button states */
  renderAccountToolbar(domRefs.toolbarEl, state, domRefs);
  renderBalanceCards(domRefs.balancesEl, state);
  updateHeaderButtons(state, domRefs.commitBtn, domRefs.discardBtn);

  /* Force grid to re-render all cells (so amount column shows new currency) */
  if (state.gridApi) {
    state.gridApi.refreshCells({ force: true });
    requestAnimationFrame(() => applyRowTypeAttributes(state.gridApi));
  }

  /* Show currency change warning if there are drafts and the currency changed */
  if (state.rows.length > 0 && oldCurrency && newCurrency && oldCurrency !== newCurrency) {
    renderFeedback(
      domRefs.feedbackEl,
      `Currency changed from ${oldCurrency} to ${newCurrency}. Draft amounts now display in ${newCurrency}.`,
      'warning'
    );
    /* Auto-dismiss the warning after 5 seconds */
    setTimeout(() => {
      const currentFeedback = domRefs.feedbackEl?.querySelector('.ft-add-movements-feedback--warning');
      if (currentFeedback) renderFeedback(domRefs.feedbackEl, '');
    }, 5000);
  } else {
    renderFeedback(domRefs.feedbackEl, '');
  }

  /* Save updated account in drafts persistence */
  saveDraftsImmediate(state);
}

/* ── Page Initialization ──────────────────────────────────────────────────── */

/**
 * Initializes the Add Movements page.
 * Called by the router after HTML is injected into the main content area.
 *
 * @param {Document|HTMLElement} [root=document] - Root element for DOM queries
 */
async function initAddMovementsPage(root = document) {
  const toolbarEl = root.querySelector('#widget-add-movements-toolbar');
  const balancesEl = root.querySelector('#widget-add-movements-balances');
  const gridWrapperEl = root.querySelector('#widget-add-movements-grid');
  const feedbackEl = root.querySelector('#widget-add-movements-feedback');

  if (!toolbarEl || !balancesEl || !gridWrapperEl) return;

  /* domRefs will be populated by renderAccountToolbar on first render */
  const domRefs = {
    toolbarEl,
    balancesEl,
    feedbackEl,
    commitBtn: null,
    discardBtn: null,
    removeSelectedBtn: null,
  };

  toolbarEl.innerHTML = '<span class="ft-small ft-text-muted">Loading accounts\u2026</span>';
  balancesEl.innerHTML = '';
  renderFeedback(feedbackEl, '');

  /* ── Load AG Grid library ── */
  try {
    await ensureAgGridLoaded();
  } catch (error) {
    return renderFeedback(feedbackEl, error?.message || 'Failed to load AG Grid.');
  }

  /* ── Load data in parallel ── */
  let accounts = [];
  let activeCategories = [];
  let activeSubCategories = [];

  try {
    [accounts, activeCategories, activeSubCategories] = await Promise.all([
      bankAccounts.getAll({ active: 1 }),
      categories.getAll({ active: 1 }),
      subCategories.getAll({ active: 1 }),
    ]);
    accounts = Array.isArray(accounts) ? accounts : [];
    activeCategories = Array.isArray(activeCategories) ? activeCategories : [];
    activeSubCategories = Array.isArray(activeSubCategories) ? activeSubCategories : [];
  } catch (error) {
    renderFeedback(feedbackEl, error?.message || 'Failed to load add movement data.');
    toolbarEl.innerHTML = '<span class="ft-small ft-text-muted">Could not load account selector.</span>';
    return;
  }

  if (accounts.length === 0) {
    toolbarEl.innerHTML = '<span class="ft-small ft-text-muted">No active bank accounts available.</span>';
    gridWrapperEl.innerHTML = `
      <div class="ft-empty">
        <span class="ft-empty__icon material-symbols-outlined" aria-hidden="true">account_balance_wallet</span>
        <p class="ft-small">Create or reactivate a bank account before adding movements.</p>
      </div>`;
    return;
  }

  /* ── Initialize state ── */
  const state = {
    accounts,
    categories: activeCategories,
    subCategories: activeSubCategories,
    selectedAccountId: Number(accounts[0].id),
    draftType: 'Expense',
    gridApi: null,
    rows: [],
    isCommitting: false,
    lastFocusWasSentinel: false,
  };

  /* ── Restore drafts from sessionStorage ── */
  const savedDrafts = restoreDrafts();
  if (savedDrafts) {
    /* Restore account selection if the saved account still exists */
    const savedAccount = accounts.find(a => Number(a.id) === savedDrafts.accountId);
    if (savedAccount) state.selectedAccountId = savedDrafts.accountId;

    if (TYPE_VALUES.includes(savedDrafts.draftType)) state.draftType = savedDrafts.draftType;
    state.rows = savedDrafts.rows;
  }

  /* ── Render initial toolbar (creates buttons in domRefs) ── */
  renderAccountToolbar(toolbarEl, state, domRefs);
  renderBalanceCards(balancesEl, state);

  /* ── Mount AG Grid ── */
  gridWrapperEl.innerHTML = '<div class="ft-add-movements-grid" id="add-movements-grid-host"></div>';
  const gridHost = gridWrapperEl.querySelector('#add-movements-grid-host');

  mountGrid(gridHost, state, domRefs, {
    getGridTheme,
    refreshSummaryState,
    renderFeedback,
    updateTableActionButtons,
  });

  /* ── Restore draft rows into grid if we had saved data ── */
  if (savedDrafts && savedDrafts.rows.length > 0) {
    state.gridApi.setGridOption('rowData', [...savedDrafts.rows, createSentinelRow(state.draftType)]);
    syncRowsFromGrid(state);
    requestAnimationFrame(() => {
      if (state.gridApi) applyRowTypeAttributes(state.gridApi);
    });
  }

  updateHeaderButtons(state, domRefs.commitBtn, domRefs.discardBtn);
  updateTableActionButtons(state, domRefs.removeSelectedBtn);

  /* Show a subtle restored message */
  if (savedDrafts && savedDrafts.rows.length > 0) {
    renderFeedback(feedbackEl, `Restored ${savedDrafts.rows.length} unsaved draft${savedDrafts.rows.length === 1 ? '' : 's'} from your previous session.`, 'success');
    setTimeout(() => {
      const currentFeedback = feedbackEl?.querySelector('.ft-add-movements-feedback--success');
      if (currentFeedback) renderFeedback(feedbackEl, '');
    }, 4000);
  }

  /* ── Wire account selector change ── */
  toolbarEl.addEventListener('change', event => {
    if (event.target.id === 'add-movements-account-select') {
      handleAccountChange(Number(event.target.value), state, domRefs);
    }
  });

  /* ── Wire type toggle ── */
  toolbarEl.addEventListener('click', event => {
    const btn = event.target.closest('.ft-add-type-toggle__btn');
    if (!btn || btn.classList.contains('ft-add-type-toggle__btn--active')) return;

    const toggle = toolbarEl.querySelector('#add-movements-type-toggle');
    if (!toggle) return;

    toggle.querySelectorAll('.ft-add-type-toggle__btn').forEach(b => b.classList.remove('ft-add-type-toggle__btn--active'));
    btn.classList.add('ft-add-type-toggle__btn--active');

    const nextType = String(btn.dataset.type || 'Expense');
    state.draftType = TYPE_VALUES.includes(nextType) ? nextType : 'Expense';

    /* Update sentinel row type */
    const sentinel = state.gridApi.getRowNode(SENTINEL_ID);
    if (sentinel?.data) {
      sentinel.data.type = state.draftType;
      state.gridApi.refreshCells({ rowNodes: [sentinel], force: true });
    }

    renderAccountToolbar(toolbarEl, state, domRefs);
    renderFeedback(feedbackEl, '');
  });

  /* ── Wire remove selected ── */
  toolbarEl.addEventListener('click', event => {
    if (!event.target.closest('#btn-remove-selected-drafts')) return;
    const selectedRows = state.gridApi.getSelectedRows().filter(row => !isAddRow(row));
    if (selectedRows.length === 0) return;
    state.gridApi.applyTransaction({ remove: selectedRows });
    refreshSummaryState(state, domRefs);
    renderFeedback(feedbackEl, '');
    requestAnimationFrame(() => applyRowTypeAttributes(state.gridApi));
  });

  /* ── Wire discard (with confirmation) ── */
  toolbarEl.addEventListener('click', event => {
    if (!event.target.closest('#btn-discard-movements')) return;
    requestDiscard(state, domRefs);
  });

  /* ── Wire commit ── */
  toolbarEl.addEventListener('click', event => {
    if (!event.target.closest('#btn-commit-movements')) return;
    commitDrafts(state, domRefs);
  });
}

export { initAddMovementsPage };
