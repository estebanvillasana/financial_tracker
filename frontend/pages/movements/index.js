/**
 * Movements page bootstrap.
 *
 * Orchestrates: toolbar, grid with checkbox selection, movement modal,
 * code-group banner, FX rates for currency conversion, and bulk actions.
 */
import { bankAccounts, categories, subCategories, fxRates } from '../../services/api.js';
import { ensureAgGridLoaded, getGridTheme } from '../../lib/agGridLoader.js';
import { FeedbackBanner } from '../../components/dumb/feedbackBanner/feedbackBanner.js';
import { MovementModal } from '../../components/modals/movementModal/movementModal.js';
import { normalizeCurrency } from '../../utils/formatters.js';
import { finalAppConfig } from '../../defaults.js';
import { mountGrid, refreshGridData, applyExternalFilter } from './grid.js';
import { fetchMovements, updateMovement, softDeleteMovement } from './actions.js';

/* ── Constants ────────────────────────────────────────────── */

const DEFAULT_LIMIT = 500;

/* ── Page Init ────────────────────────────────────────────── */

async function initMovementsPage(root = document) {
  const toolbarEl     = root.querySelector('#widget-movements-toolbar');
  const feedbackEl    = root.querySelector('#widget-movements-feedback');
  const codeBannerEl  = root.querySelector('#widget-movements-code-banner');
  const gridWrapper   = root.querySelector('#widget-movements-grid');

  if (!gridWrapper) return;

  /* DOM handles for toolbar controls */
  const accountSelect = toolbarEl?.querySelector('#movements-account-select');
  const typeToggle    = toolbarEl?.querySelector('#movements-type-toggle');
  const dateFrom      = toolbarEl?.querySelector('#movements-date-from');
  const dateTo        = toolbarEl?.querySelector('#movements-date-to');
  const btnEdit       = toolbarEl?.querySelector('#btn-edit-movement');
  const btnGroup      = toolbarEl?.querySelector('#btn-show-group');
  const btnDelete     = toolbarEl?.querySelector('#btn-soft-delete');

  const state = {
    accounts: [],
    cats: [],
    subs: [],
    movements: [],
    gridApi: null,
    codeFilter: null,
    selectedRows: [],
    rates: {},
    typeFilter: '',
  };

  /* ── Load AG Grid ─────────────────────────────────────────── */

  try {
    await ensureAgGridLoaded();
  } catch (e) {
    return FeedbackBanner.render(feedbackEl, e?.message || 'Failed to load grid library.');
  }

  /* ── Load data in parallel ────────────────────────────────── */

  try {
    const [accs, catList, subList, movs, fxData] = await Promise.all([
      bankAccounts.getAll({ active: 1 }),
      categories.getAll({ active: 1 }),
      subCategories.getAll({ active: 1 }),
      fetchMovements({ limit: DEFAULT_LIMIT }),
      fxRates.getAllRatesLatest(),
    ]);
    state.accounts  = Array.isArray(accs)    ? accs    : [];
    state.cats      = Array.isArray(catList)  ? catList  : [];
    state.subs      = Array.isArray(subList)  ? subList  : [];
    state.movements = Array.isArray(movs)     ? movs     : [];
    state.rates     = fxData?.rates || {};
  } catch (e) {
    return FeedbackBanner.render(feedbackEl, e?.message || 'Failed to load data.');
  }

  /* ── Populate account select ──────────────────────────────── */

  if (accountSelect) {
    accountSelect.innerHTML =
      '<option value="">All accounts</option>' +
      state.accounts.map(a =>
        `<option value="${a.id}">${a.account} (${normalizeCurrency(a.currency)})</option>`
      ).join('');
  }

  /* ── Mount Grid ───────────────────────────────────────────── */

  gridWrapper.innerHTML = '<div class="ft-movements-grid ft-ag-grid" id="movements-grid-host"></div>';
  const gridHost = gridWrapper.querySelector('#movements-grid-host');

  mountGrid(gridHost, state, {
    getGridTheme,
    rates: state.rates,
    targetCurrency: normalizeCurrency(finalAppConfig.currency),
    onSelectionChanged: handleSelectionChange,
  });

  /* ── Toolbar Events ───────────────────────────────────────── */

  accountSelect?.addEventListener('change', reloadGrid);
  dateFrom?.addEventListener('change', reloadGrid);
  dateTo?.addEventListener('change', reloadGrid);

  typeToggle?.addEventListener('click', e => {
    const btn = e.target.closest('[data-type]');
    if (!btn) return;
    state.typeFilter = btn.dataset.type;
    typeToggle.querySelectorAll('[data-type]').forEach(b =>
      b.classList.toggle('ft-movements-type-toggle__btn--active', b === btn),
    );
    reloadGrid();
  });

  btnEdit?.addEventListener('click', () => {
    if (state.selectedRows.length === 1) handleEdit(state.selectedRows[0]);
  });

  btnGroup?.addEventListener('click', () => {
    if (state.selectedRows.length === 1 && state.selectedRows[0].movement_code) {
      handleFilterCode(state.selectedRows[0].movement_code);
    }
  });

  btnDelete?.addEventListener('click', () => {
    if (state.selectedRows.length > 0) handleBulkDelete(state.selectedRows);
  });

  /* ── Selection ────────────────────────────────────────────── */

  function handleSelectionChange(rows) {
    state.selectedRows = rows;
    const count = rows.length;
    if (btnEdit) btnEdit.disabled = count !== 1;
    if (btnGroup) btnGroup.disabled = count !== 1 || !rows[0]?.movement_code;
    if (btnDelete) btnDelete.disabled = count === 0;
  }

  /* ── Reload ───────────────────────────────────────────────── */

  async function reloadGrid() {
    try {
      const params = { limit: DEFAULT_LIMIT };
      if (accountSelect?.value) params.account_id = Number(accountSelect.value);
      if (state.typeFilter) params.type = state.typeFilter;
      if (dateFrom?.value) params.date_from = dateFrom.value;
      if (dateTo?.value) params.date_to = dateTo.value;
      const fresh = await fetchMovements(params);
      refreshGridData(state, Array.isArray(fresh) ? fresh : []);
    } catch (e) {
      FeedbackBanner.render(feedbackEl, e?.message || 'Failed to reload movements.');
    }
  }

  /* ── Edit via Modal ───────────────────────────────────────── */

  function handleEdit(movement) {
    MovementModal.open(movement, {
      accounts: state.accounts,
      categories: state.cats,
      subCategories: state.subs,
    }, {
      onSave: async (id, payload) => {
        await updateMovement(id, payload);
        MovementModal.close();
        FeedbackBanner.render(feedbackEl, 'Movement updated.', 'success');
        await reloadGrid();
        setTimeout(() => FeedbackBanner.clear(feedbackEl), 3000);
      },
      onSoftDelete: async (id) => {
        await softDeleteMovement(id);
        MovementModal.close();
        FeedbackBanner.render(feedbackEl, 'Movement deleted.', 'success');
        await reloadGrid();
        setTimeout(() => FeedbackBanner.clear(feedbackEl), 3000);
      },
    });
  }

  /* ── Bulk Delete ──────────────────────────────────────────── */

  function handleBulkDelete(rows) {
    const active = rows.filter(r => r.active === 1);
    if (!active.length) {
      FeedbackBanner.render(feedbackEl, 'No active movements selected.');
      return;
    }
    FeedbackBanner.renderWithActions(
      feedbackEl,
      `Soft-delete <b>${active.length}</b> movement${active.length !== 1 ? 's' : ''}?`,
      [
        {
          label: 'Delete',
          className: 'ft-feedback-banner__btn--danger',
          onClick: async () => {
            try {
              await Promise.all(active.map(m => softDeleteMovement(m.id)));
              FeedbackBanner.render(feedbackEl, `${active.length} movement(s) deleted.`, 'success');
              await reloadGrid();
              setTimeout(() => FeedbackBanner.clear(feedbackEl), 3000);
            } catch (e) {
              FeedbackBanner.render(feedbackEl, e?.message || 'Bulk delete failed.');
            }
          },
        },
        { label: 'Cancel', onClick: () => FeedbackBanner.clear(feedbackEl) },
      ],
    );
  }

  /* ── Code-Group Filter ────────────────────────────────────── */

  function handleFilterCode(code) {
    state.codeFilter = code;
    applyExternalFilter(state);
    _renderCodeBanner(code);
  }

  function clearCodeFilter() {
    state.codeFilter = null;
    applyExternalFilter(state);
    codeBannerEl.innerHTML = '';
  }

  function _renderCodeBanner(code) {
    const matching = state.movements.filter(m => m.movement_code === code);
    codeBannerEl.innerHTML = `
      <div class="ft-movements-code-banner">
        <span class="ft-movements-code-banner__text">
          Showing <b>${matching.length}</b> movement${matching.length !== 1 ? 's' : ''} with code
          <span class="ft-movements-code-banner__code">${code}</span>
        </span>
        <button class="ft-btn ft-btn--ghost ft-btn--sm" data-banner-action="clear">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
          Clear Filter
        </button>
        <button class="ft-btn ft-btn--ghost ft-btn--sm ft-feedback-banner__btn--danger" data-banner-action="delete-all">
          <span class="material-symbols-outlined" aria-hidden="true">delete</span>
          Soft-Delete All
        </button>
      </div>`;

    codeBannerEl.querySelector('[data-banner-action="clear"]')
      ?.addEventListener('click', clearCodeFilter);

    codeBannerEl.querySelector('[data-banner-action="delete-all"]')
      ?.addEventListener('click', () => {
        const active = state.movements.filter(m => m.movement_code === code && m.active === 1);
        handleBulkDelete(active);
      });
  }
}

export { initMovementsPage };
