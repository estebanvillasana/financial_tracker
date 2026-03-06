/**
 * Add Movements page bootstrap.
 *
 * This module orchestrates page-level concerns:
 * - data loading (accounts/categories/sub-categories),
 * - AG Grid initialization,
 * - draft validation + bulk commit flow,
 * - top-level UI event wiring.
 */
import { bankAccounts, categories, movements, subCategories } from '../../services/api.js';
import {
  AG_GRID_SCRIPT_SRC,
  TYPE_VALUES,
  SENTINEL_ID,
  createSentinelRow,
  isAddRow,
} from './constants.js';
import { isValidIsoDate, parseNumberOrNull, getSelectedAccount } from './utils.js';
import {
  renderFeedback,
  updateHeaderButtons,
  updateTableActionButtons,
  renderBalanceCards,
  renderAccountToolbar,
} from './render.js';
import { commitSentinelRow, syncRowsFromGrid, mountGrid } from './grid.js';

/**
 * Lazy-loads AG Grid library only when entering the page.
 * This keeps initial app startup lighter.
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
 * Defines a theme consistent with the app look and feel.
 */
function getGridTheme() {
  return window.agGrid.themeQuartz.withPart(window.agGrid.colorSchemeDarkBlue).withParams({
    spacing: 6,
    headerFontWeight: 600,
  });
}

/**
 * Recomputes all UI regions that depend on current draft rows.
 */
function refreshSummaryState(state, domRefs) {
  syncRowsFromGrid(state);
  renderAccountToolbar(domRefs.toolbarEl, state, domRefs);
  renderBalanceCards(domRefs.balancesEl, state);
  updateHeaderButtons(state, domRefs.commitBtn, domRefs.discardBtn);
  updateTableActionButtons(state, domRefs.removeSelectedBtn);
}

/**
 * Validates one draft row and transforms it into backend payload shape.
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

/**
 * Sends all valid draft movements in one atomic bulk request.
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

/**
 * Initializes the Add Movements page.
 * Called by the router after HTML is injected in the main content area.
 */
async function initAddMovementsPage(root = document) {
  const toolbarEl = root.querySelector('#widget-add-movements-toolbar');
  const balancesEl = root.querySelector('#widget-add-movements-balances');
  const gridWrapperEl = root.querySelector('#widget-add-movements-grid');
  const feedbackEl = root.querySelector('#widget-add-movements-feedback');
  const commitBtn = root.querySelector('#btn-commit-movements');
  const discardBtn = root.querySelector('#btn-discard-movements');
  const addDraftBtn = root.querySelector('#btn-add-draft-row');
  const removeSelectedBtn = root.querySelector('#btn-remove-selected-drafts');
  const draftTypeSelect = root.querySelector('#add-movements-type-filter');

  if (!toolbarEl || !balancesEl || !gridWrapperEl || !commitBtn || !discardBtn || !addDraftBtn || !removeSelectedBtn || !draftTypeSelect) {
    return;
  }

  const domRefs = { toolbarEl, balancesEl, feedbackEl, commitBtn, discardBtn, removeSelectedBtn };
  toolbarEl.innerHTML = '<span class="ft-small ft-text-muted">Loading accounts...</span>';
  balancesEl.innerHTML = '';
  renderFeedback(feedbackEl, '');

  try {
    await ensureAgGridLoaded();
  } catch (error) {
    return renderFeedback(feedbackEl, error?.message || 'Failed to load AG Grid.');
  }

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

  const state = {
    accounts,
    categories: activeCategories,
    subCategories: activeSubCategories,
    selectedAccountId: Number(accounts[0].id),
    draftType: String(draftTypeSelect.value || 'Expense'),
    gridApi: null,
    rows: [],
    isCommitting: false,
    lastFocusWasSentinel: false,
  };

  renderAccountToolbar(toolbarEl, state, domRefs);
  renderBalanceCards(balancesEl, state);

  gridWrapperEl.innerHTML = '<div class="ft-add-movements-grid" id="add-movements-grid-host"></div>';
  const gridHost = gridWrapperEl.querySelector('#add-movements-grid-host');

  mountGrid(gridHost, state, domRefs, {
    getGridTheme,
    refreshSummaryState,
    renderFeedback,
    updateTableActionButtons,
  });
  updateHeaderButtons(state, commitBtn, discardBtn);
  updateTableActionButtons(state, removeSelectedBtn);

  addDraftBtn.addEventListener('click', () => {
    commitSentinelRow(state);
    const sentinel = state.gridApi.getRowNode(SENTINEL_ID);
    if (sentinel) {
      state.gridApi.setFocusedCell(sentinel.rowIndex, 'movement');
      state.gridApi.startEditingCell({ rowIndex: sentinel.rowIndex, colKey: 'movement' });
    }
    refreshSummaryState(state, domRefs);
    renderFeedback(feedbackEl, '');
  });

  draftTypeSelect.addEventListener('change', event => {
    const nextType = String(event.target.value || 'Expense');
    state.draftType = TYPE_VALUES.includes(nextType) ? nextType : 'Expense';
    const sentinel = state.gridApi.getRowNode(SENTINEL_ID);
    if (sentinel?.data) {
      sentinel.data.type = state.draftType;
      state.gridApi.refreshCells({ rowNodes: [sentinel], force: true });
    }
    renderAccountToolbar(toolbarEl, state, domRefs);
    renderFeedback(feedbackEl, '');
  });

  removeSelectedBtn.addEventListener('click', () => {
    const selectedRows = state.gridApi.getSelectedRows().filter(row => !isAddRow(row));
    if (selectedRows.length === 0) return;
    state.gridApi.applyTransaction({ remove: selectedRows });
    refreshSummaryState(state, domRefs);
    renderFeedback(feedbackEl, '');
  });

  discardBtn.addEventListener('click', () => {
    state.gridApi.stopEditing();
    state.gridApi.setGridOption('rowData', [createSentinelRow(state.draftType)]);
    state.rows = [];
    refreshSummaryState(state, domRefs);
    renderFeedback(feedbackEl, '');
  });

  commitBtn.addEventListener('click', () => commitDrafts(state, domRefs));
}

export { initAddMovementsPage };
