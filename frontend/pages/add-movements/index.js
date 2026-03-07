/**
 * Add Movements page bootstrap.
 *
 * This module orchestrates page-level concerns:
 * - data loading (accounts / categories / sub-categories),
 * - AG Grid initialization with lazy-loaded library,
 * - draft persistence via sessionStorage,
 * - top-level UI event wiring.
 *
 * Business logic (validation, commit, discard, account switch) lives in
 * dedicated sibling modules to keep this orchestrator lean.
 */
import { bankAccounts, categories, subCategories, repetitiveMovements } from '../../services/api.js';
import {
  TYPE_VALUES,
  SENTINEL_ID,
  createDraftRow,
  createSentinelRow,
  isAddRow,
} from './constants.js';
import { ensureAgGridLoaded, getGridTheme } from '../../lib/agGridLoader.js';
import { FeedbackBanner } from '../../components/dumb/feedbackBanner/feedbackBanner.js';
import {
  updateHeaderButtons,
  renderBalanceCards,
  renderAccountToolbar,
} from './render.js';
import { commitSentinelRow, syncRowsFromGrid, mountGrid, applyRowTypeAttributes } from './grid.js';import { saveDrafts, restoreDrafts } from './drafts.js';
import { commitDrafts, requestDiscard, handleAccountChange, handleBulkAdd } from './actions.js';

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
  saveDrafts(state);
}

/* ── Event Wiring ─────────────────────────────────────────────────────────── */

/**
 * Wires all toolbar event listeners (account change, type toggle, actions).
 *
 * @param {object}      state      - Page state
 * @param {object}      domRefs    - DOM element references
 * @param {HTMLElement}  toolbarEl  - Toolbar container
 */
function wireEvents(state, domRefs, toolbarEl) {
  const feedbackEl = domRefs.feedbackEl;

  /* ── Account selector change ── */
  toolbarEl.addEventListener('change', event => {
    if (event.target.id === 'add-movements-account-select') {
      handleAccountChange(Number(event.target.value), state, domRefs);
    }
  });

  /* ── Type toggle ── */
  toolbarEl.addEventListener('click', event => {
    const btn = event.target.closest('.ft-add-type-toggle__btn');
    if (!btn || btn.classList.contains('ft-add-type-toggle__btn--active')) return;

    const toggle = toolbarEl.querySelector('#add-movements-type-toggle');
    if (!toggle) return;

    toggle.querySelectorAll('.ft-add-type-toggle__btn').forEach(b => b.classList.remove('ft-add-type-toggle__btn--active'));
    btn.classList.add('ft-add-type-toggle__btn--active');

    const nextType = String(btn.dataset.type || 'Expense');
    state.draftType = TYPE_VALUES.includes(nextType) ? nextType : 'Expense';

    const sentinel = state.gridApi.getRowNode(SENTINEL_ID);
    if (sentinel?.data) {
      sentinel.data.type = state.draftType;
      state.gridApi.refreshCells({ rowNodes: [sentinel], force: true });
    }

    renderAccountToolbar(toolbarEl, state, domRefs);
    FeedbackBanner.clear(feedbackEl);
  });

  /* ── Discard (with confirmation) ── */
  toolbarEl.addEventListener('click', event => {
    if (!event.target.closest('#btn-discard-movements')) return;
    requestDiscard(state, domRefs, refreshSummaryState);
  });

  /* ── Commit ── */
  toolbarEl.addEventListener('click', event => {
    if (!event.target.closest('#btn-commit-movements')) return;
    commitDrafts(state, domRefs, refreshSummaryState);
  });

  /* ── Bulk Add ── */
  toolbarEl.addEventListener('click', event => {
    if (!event.target.closest('#btn-bulk-add-movements')) return;
    handleBulkAdd(state, domRefs, refreshSummaryState);
  });
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

  const domRefs = {
    toolbarEl,
    balancesEl,
    feedbackEl,
    commitBtn: null,
    discardBtn: null,
  };

  toolbarEl.innerHTML = '<span class="ft-small ft-text-muted">Loading accounts\u2026</span>';
  balancesEl.innerHTML = '';
  FeedbackBanner.clear(feedbackEl);

  /* ── Load AG Grid library ── */
  try {
    await ensureAgGridLoaded();
  } catch (error) {
    return FeedbackBanner.render(feedbackEl, error?.message || 'Failed to load AG Grid.');
  }

  /* ── Load data in parallel ── */
  let accounts = [];
  let activeCategories = [];
  let activeSubCategories = [];
  let activeRepetitiveMovements = [];

  try {
    [accounts, activeCategories, activeSubCategories] = await Promise.all([
      bankAccounts.getAll({ active: 1 }),
      categories.getAll({ active: 1 }),
      subCategories.getAll({ active: 1 }),
    ]);
    accounts = Array.isArray(accounts) ? accounts : [];
    activeCategories = Array.isArray(activeCategories) ? activeCategories : [];
    activeSubCategories = Array.isArray(activeSubCategories) ? activeSubCategories : [];
    /* Repetitive movements are optional — load separately so a failure doesn't block the page */
    activeRepetitiveMovements = await repetitiveMovements.getAll({ active: 1 }).catch(() => []);
    activeRepetitiveMovements = Array.isArray(activeRepetitiveMovements) ? activeRepetitiveMovements : [];
  } catch (error) {
    FeedbackBanner.render(feedbackEl, error?.message || 'Failed to load add movement data.');
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
    repetitiveMovements: activeRepetitiveMovements,
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
    const savedAccount = accounts.find(a => Number(a.id) === savedDrafts.accountId);
    if (savedAccount) state.selectedAccountId = savedDrafts.accountId;
    if (TYPE_VALUES.includes(savedDrafts.draftType)) state.draftType = savedDrafts.draftType;
    state.rows = savedDrafts.rows;
  }

  /* ── Render initial toolbar ── */
  renderAccountToolbar(toolbarEl, state, domRefs);
  renderBalanceCards(balancesEl, state);

  /* ── Mount AG Grid ── */
  gridWrapperEl.innerHTML = '<div class="ft-add-movements-grid ft-ag-grid" id="add-movements-grid-host"></div>';
  const gridHost = gridWrapperEl.querySelector('#add-movements-grid-host');

  mountGrid(gridHost, state, domRefs, {
    getGridTheme,
    refreshSummaryState,
    renderFeedback: FeedbackBanner.render,
  });

  /* ── Restore draft rows into grid ── */
  if (savedDrafts && savedDrafts.rows.length > 0) {
    state.gridApi.setGridOption('rowData', [...savedDrafts.rows, createSentinelRow(state.draftType)]);
    syncRowsFromGrid(state);
    requestAnimationFrame(() => {
      if (state.gridApi) applyRowTypeAttributes(state.gridApi);
    });
  }

  updateHeaderButtons(state, domRefs.commitBtn, domRefs.discardBtn);

  /* Show restored message */
  if (savedDrafts && savedDrafts.rows.length > 0) {
    FeedbackBanner.render(feedbackEl, `Restored ${savedDrafts.rows.length} unsaved draft${savedDrafts.rows.length === 1 ? '' : 's'} from your previous session.`, 'success');
    setTimeout(() => {
      const currentFeedback = feedbackEl?.querySelector('.ft-feedback-banner--success');
      if (currentFeedback) FeedbackBanner.clear(feedbackEl);
    }, 4000);
  }

  /* ── Wire all events ── */
  wireEvents(state, domRefs, toolbarEl);

  /* ── Apply template from Repetitive Movements page ── */
  _applyTemplateIfPresent(state, feedbackEl);
}

/**
 * Checks sessionStorage for a movement template (set by the Repetitive
 * Movements page via "Use as Template") and pre-fills the sentinel row.
 */
function _applyTemplateIfPresent(state, feedbackEl) {
  const raw = sessionStorage.getItem('ft-movement-template');
  if (!raw) return;

  sessionStorage.removeItem('ft-movement-template');

  let template;
  try {
    template = JSON.parse(raw);
  } catch { return; }

  if (!template || !template.movement) return;

  // Switch type if template specifies it
  if (TYPE_VALUES.includes(template.type) && template.type !== state.draftType) {
    state.draftType = template.type;
  }

  // Create a draft row pre-filled with template data
  const row = createDraftRow(state.draftType);
  row.movement = template.movement;
  row.description = template.description || '';
  row.repetitive_movement_id = template.repetitive_movement_id || null;

  // Add the pre-filled row before the sentinel
  state.gridApi?.applyTransaction({
    add: [row],
    addIndex: state.rows.length,
  });
  syncRowsFromGrid(state);

  FeedbackBanner.render(
    feedbackEl,
    `Template "<b>${template.movement}</b>" applied — fill in the remaining fields.`,
    'success',
  );
  setTimeout(() => {
    const current = feedbackEl?.querySelector('.ft-feedback-banner--success');
    if (current) FeedbackBanner.clear(feedbackEl);
  }, 5000);
}

export { initAddMovementsPage };
