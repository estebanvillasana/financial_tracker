/**
 * Movements page bootstrap.
 *
 * Orchestrates: filter bar, edit form, grid, data loading, and event wiring.
 * Follows the same pattern as the transfers page.
 */
import { bankAccounts, categories, subCategories } from '../../services/api.js';
import { ensureAgGridLoaded, getGridTheme } from '../../lib/agGridLoader.js';
import { FeedbackBanner } from '../../components/dumb/feedbackBanner/feedbackBanner.js';
import { FilterBar } from '../../components/dumb/filterBar/filterBar.js';
import { MovementForm } from '../../components/dumb/movementForm/movementForm.js';
import { mountGrid, refreshGridData, applyExternalFilter } from './grid.js';
import { fetchMovements, updateMovement, softDeleteMovement } from './actions.js';

/* ── Constants ────────────────────────────────────────────── */

const DEFAULT_LIMIT = 500;

/* ── Page Init ────────────────────────────────────────────── */

async function initMovementsPage(root = document) {
  const filterSection  = root.querySelector('#widget-movements-filter');
  const feedbackEl     = root.querySelector('#widget-movements-feedback');
  const codeBannerEl   = root.querySelector('#widget-movements-code-banner');
  const formSection    = root.querySelector('#widget-movements-form');
  const gridWrapper    = root.querySelector('#widget-movements-grid');

  if (!gridWrapper) return;

  const state = {
    accounts: [],
    cats: [],
    subs: [],
    movements: [],
    gridApi: null,
    editingId: null,
    codeFilter: null,
  };

  /* ── Load AG Grid library ─────────────────────────────────── */

  try {
    await ensureAgGridLoaded();
  } catch (e) {
    return FeedbackBanner.render(feedbackEl, e?.message || 'Failed to load grid library.');
  }

  /* ── Load reference data + movements in parallel ──────────── */

  try {
    const [accs, catList, subList, movs] = await Promise.all([
      bankAccounts.getAll({ active: 1 }),
      categories.getAll({ active: 1 }),
      subCategories.getAll({ active: 1 }),
      fetchMovements({ limit: DEFAULT_LIMIT }),
    ]);
    state.accounts  = Array.isArray(accs)    ? accs    : [];
    state.cats      = Array.isArray(catList)  ? catList  : [];
    state.subs      = Array.isArray(subList)  ? subList  : [];
    state.movements = Array.isArray(movs)     ? movs     : [];
  } catch (e) {
    return FeedbackBanner.render(feedbackEl, e?.message || 'Failed to load data.');
  }

  /* ── Render Filter Bar ────────────────────────────────────── */

  const filterConfig = _buildFilterConfig(state);
  const filterRoot = FilterBar.render(filterSection, filterConfig, {
    onFilterChange: () => reloadGrid(),
    onAction: (actionId) => {
      if (actionId === 'reset') {
        FilterBar.setValues(filterRoot, { account: '', type: '', dateFrom: '', dateTo: '' });
        reloadGrid();
      }
    },
  });

  /* ── Render Edit Form (hidden initially) ──────────────────── */

  const formConfig = { accounts: state.accounts, categories: state.cats, subCategories: state.subs };
  formSection.innerHTML = MovementForm.buildHTML(formConfig);
  const formEl = formSection.querySelector('#mf-root');

  MovementForm.hydrate(formEl, formConfig, {
    onSubmit: handleSubmit,
    onCancel: handleCancel,
  });

  /* ── Mount Grid ───────────────────────────────────────────── */

  gridWrapper.innerHTML = '<div class="ft-movements-grid ft-ag-grid" id="movements-grid-host"></div>';
  const gridHost = gridWrapper.querySelector('#movements-grid-host');

  mountGrid(gridHost, state, {
    getGridTheme,
    onEdit: handleEdit,
    onDelete: handleDelete,
    onFilterCode: handleFilterCode,
  });

  /* ── Helpers ─────────────────────────────────────────────── */

  async function reloadGrid() {
    try {
      const filters = _getServerFilters(filterRoot);
      const fresh = await fetchMovements(filters);
      refreshGridData(state, Array.isArray(fresh) ? fresh : []);
    } catch (e) {
      FeedbackBanner.render(feedbackEl, e?.message || 'Failed to reload movements.');
    }
  }

  /* ── Edit Flow ──────────────────────────────────────────── */

  function handleEdit(movement) {
    state.editingId = movement.id;
    formEl.classList.add('ft-movement-form--visible');
    MovementForm.populate(formEl, movement, formConfig);
    formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleCancel() {
    state.editingId = null;
    formEl.classList.remove('ft-movement-form--visible');
    MovementForm.reset(formEl);
    FeedbackBanner.clear(feedbackEl);
  }

  async function handleSubmit() {
    FeedbackBanner.clear(feedbackEl);
    const values = MovementForm.getValues(formEl);
    const { valid, errors, payload } = MovementForm.validate(values);

    if (!valid) {
      return FeedbackBanner.render(feedbackEl, errors.join(' '));
    }

    try {
      await updateMovement(state.editingId, payload);
      FeedbackBanner.render(feedbackEl, 'Movement updated.', 'success');
      state.editingId = null;
      formEl.classList.remove('ft-movement-form--visible');
      MovementForm.reset(formEl);
      await reloadGrid();
      setTimeout(() => FeedbackBanner.clear(feedbackEl), 3000);
    } catch (e) {
      FeedbackBanner.render(feedbackEl, e?.message || 'Update failed.');
    }
  }

  /* ── Delete Flow ────────────────────────────────────────── */

  function handleDelete(movement) {
    FeedbackBanner.renderWithActions(
      feedbackEl,
      `Soft-delete <b>${movement.movement}</b> on ${movement.date}?`,
      [
        {
          label: 'Delete',
          className: 'ft-feedback-banner__btn--danger',
          onClick: async () => {
            try {
              await softDeleteMovement(movement.id);
              FeedbackBanner.render(feedbackEl, 'Movement deleted.', 'success');
              await reloadGrid();
              setTimeout(() => FeedbackBanner.clear(feedbackEl), 3000);
            } catch (e) {
              FeedbackBanner.render(feedbackEl, e?.message || 'Delete failed.');
            }
          },
        },
        { label: 'Cancel', onClick: () => FeedbackBanner.clear(feedbackEl) },
      ],
    );
  }

  /* ── Code Group Filter ──────────────────────────────────── */

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
      ?.addEventListener('click', () => handleDeleteGroup(code));
  }

  function handleDeleteGroup(code) {
    const matching = state.movements.filter(m => m.movement_code === code && m.active === 1);
    FeedbackBanner.renderWithActions(
      feedbackEl,
      `Soft-delete <b>${matching.length}</b> movement${matching.length !== 1 ? 's' : ''} with code <span style="font-family:monospace">${code}</span>?`,
      [
        {
          label: 'Delete All',
          className: 'ft-feedback-banner__btn--danger',
          onClick: async () => {
            try {
              await Promise.all(matching.map(m => softDeleteMovement(m.id)));
              FeedbackBanner.render(feedbackEl, `${matching.length} movements deleted.`, 'success');
              clearCodeFilter();
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
}

/* ── Private Helpers ──────────────────────────────────────── */

function _buildFilterConfig(state) {
  const accountOpts = [
    { value: '', label: 'All accounts' },
    ...state.accounts.map(a => ({ value: String(a.id), label: a.account })),
  ];

  return {
    variant: 'bare',
    hideLabels: true,
    fields: [
      { id: 'account',  type: 'select', options: accountOpts },
      { id: 'type',     type: 'select', options: [
        { value: '', label: 'All types' },
        { value: 'Income', label: 'Income' },
        { value: 'Expense', label: 'Expense' },
      ]},
      { id: 'dateFrom', type: 'date', placeholder: 'From' },
      { id: 'dateTo',   type: 'date', placeholder: 'To' },
    ],
    actions: [
      { id: 'reset', label: 'Reset', icon: 'restart_alt' },
    ],
  };
}

function _getServerFilters(filterRoot) {
  const vals = FilterBar.getValues(filterRoot);
  const params = { limit: DEFAULT_LIMIT };
  if (vals.account)  params.account_id = Number(vals.account);
  if (vals.type)     params.type = vals.type;
  if (vals.dateFrom) params.date_from = vals.dateFrom;
  if (vals.dateTo)   params.date_to = vals.dateTo;
  return params;
}

export { initMovementsPage };
