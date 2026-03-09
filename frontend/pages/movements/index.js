/**
 * Movements page bootstrap.
 *
 * Orchestrates: toolbar, grid with checkbox selection, movement modal,
 * code-group banner, FX rates for currency conversion, and bulk actions.
 */
import { bankAccounts, categories, subCategories, fxRates, repetitiveMovements } from '../../services/api.js';
import { ensureAgGridLoaded } from '../../lib/agGridLoader.js';
import { FeedbackBanner } from '../../components/dumb/feedbackBanner/feedbackBanner.js';
import { FilterBar } from '../../components/dumb/filterBar/filterBar.js';
import { MovementModal } from '../../components/modals/movementModal/movementModal.js';
import { DatePicker } from '../../components/dumb/datePicker/datePicker.js';
import { normalizeCurrency } from '../../utils/formatters.js';
import { finalAppConfig } from '../../defaults.js';
import { mountGrid, refreshGridData, applyExternalFilter } from './grid.js';
import { fetchMovements, updateMovement, softDeleteMovement, restoreMovement } from './actions.js';

/* ── Constants ────────────────────────────────────────────── */

const DEFAULT_LIMIT = 500;

/**
 * Tracks cleanup functions for document-level listeners from date-picker
 * fields created in the last initMovementsPage call. Aborted on the next
 * init to prevent accumulation across SPA navigations.
 */
let _pickerCleanup = null;

/* ── Page Init ────────────────────────────────────────────── */

async function initMovementsPage(root = document) {
  /* Abort document listeners from any previous page load. */
  _pickerCleanup?.();
  _pickerCleanup = null;

  const toolbarEl     = root.querySelector('#widget-movements-toolbar');
  const feedbackEl    = root.querySelector('#widget-movements-feedback');
  const filterBarEl   = root.querySelector('#movements-filter-bar');
  const codeBannerEl  = root.querySelector('#widget-movements-code-banner');
  const gridWrapper   = root.querySelector('#widget-movements-grid');

  if (!gridWrapper) return;

  /* DOM handles for toolbar controls */
  const accountSelect = toolbarEl?.querySelector('#movements-account-select');
  const typeToggle    = toolbarEl?.querySelector('#movements-type-toggle');
  const datePickers   = toolbarEl?.querySelector('#movements-date-pickers');

  const state = {
    accounts: [],
    cats: [],
    subs: [],
    reps: [],
    movements: [],
    gridApi: null,
    codeFilter: null,
    showDeleted: false,
    rates: {},
    typeFilter: '',
    dateFrom: '',
    dateTo: '',
    nameFilter: '',
    categoryFilter: '',
    subCategoryFilter: '',
    noRepetitiveFilter: false,
    hasRepetitiveFilter: false,
    moneyTransfersFilter: '',
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
      fetchMovements({ limit: DEFAULT_LIMIT, active: 1 }),
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

  /* Load repetitive movements independently — a failure here only means the
     selector in the edit modal stays empty; it must not break the whole page. */
  const repList = await repetitiveMovements.getAll({ active: 1 }).catch(err => {
    console.error('[movements] Failed to load repetitive movements:', err);
    return [];
  });
  state.reps = Array.isArray(repList) ? repList : [];

  /* ── Populate account select ──────────────────────────────── */

  if (accountSelect) {
    accountSelect.innerHTML =
      '<option value="">All accounts</option>' +
      state.accounts.map(a =>
        `<option value="${a.id}">${a.account} (${normalizeCurrency(a.currency)})</option>`
      ).join('');
  }

  /* ── Mount date pickers ───────────────────────────────────── */

  if (datePickers) {
    const fromField = DatePicker.createPickerField('From', '', v => { state.dateFrom = v; reloadGrid(); });
    const sep = document.createElement('span');
    sep.className = 'ft-movements-toolbar__date-sep';
    sep.textContent = '–';
    const toField = DatePicker.createPickerField('To', '', v => { state.dateTo = v; reloadGrid(); });

    datePickers.appendChild(fromField);
    datePickers.appendChild(sep);
    datePickers.appendChild(toField);

    /* Store cleanup so the next navigation can remove document listeners. */
    _pickerCleanup = () => {
      fromField._cleanup?.();
      toField._cleanup?.();
    };
  }

  /* ── Mount Grid ───────────────────────────────────────────── */

  gridWrapper.innerHTML = '<div class="ft-movements-grid ft-ag-grid" id="movements-grid-host"></div>';
  const gridHost = gridWrapper.querySelector('#movements-grid-host');

  mountGrid(gridHost, state, {
    rates: state.rates,
    targetCurrency: normalizeCurrency(finalAppConfig.currency),
    onEdit: handleEdit,
    onDelete: rowOrRows => handleBulkDelete(Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows]),
    onRestore: handleRestore,
    onBulkRestore: handleBulkRestore,
    onShowGroup: handleFilterCode,
  });

  /* ── Filter Bar (search, category, sub-category, export) ──── */

  let _filterBarRoot = null;

  function _buildFilterBarConfig() {
    const catOptions = [
      { value: '', label: 'All categories' },
      ...state.cats.map(c => ({ value: String(c.id), label: c.category })),
    ];
    const filteredSubs = state.categoryFilter
      ? state.subs.filter(s => String(s.category_id) === String(state.categoryFilter))
      : [];
    const subCatOptions = [
      { value: '', label: state.categoryFilter ? 'All sub-categories' : '—' },
      ...filteredSubs.map(s => ({ value: String(s.id), label: s.sub_category })),
    ];
    return {
      fields: [
        {
          id: 'name',
          label: 'Search',
          type: 'search',
          placeholder: 'Search by name…',
          value: state.nameFilter,
          className: 'ft-filter-bar__field--search',
        },
        {
          id: 'category',
          label: 'Category',
          type: 'select',
          options: catOptions,
          value: state.categoryFilter,
        },
        {
          id: 'subCategory',
          label: 'Sub-category',
          type: 'select',
          options: subCatOptions,
          value: state.subCategoryFilter,
        },
        {
          id: 'repetitive',
          label: 'Repetitive',
          type: 'select',
          options: [
            { value: '',     label: 'All movements' },
            { value: 'none', label: 'No repetitive movement' },
            { value: 'has',  label: 'Has repetitive movement' },
          ],
          value: state.noRepetitiveFilter ? 'none' : state.hasRepetitiveFilter ? 'has' : '',
        },
        {
          id: 'moneyTransfers',
          label: 'Money transfers',
          type: 'select',
          options: [
            { value: '',          label: 'Include transfers' },
            { value: 'exclude',   label: 'Exclude transfers' },
            { value: 'only',      label: 'Only transfers' },
          ],
          value: state.moneyTransfersFilter,
        },
      ],
      actions: [
        { id: 'download', label: 'Export CSV', icon: 'download', variant: 'ghost' },
      ],
    };
  }

  function _updateSubCategorySelect(selectedCategoryId) {
    if (!_filterBarRoot) return;
    const subCatSelect = _filterBarRoot.querySelector('[data-filter-id="subCategory"]');
    if (!subCatSelect) return;
    const filteredSubs = selectedCategoryId
      ? state.subs.filter(s => String(s.category_id) === String(selectedCategoryId))
      : [];
    subCatSelect.innerHTML = filteredSubs.length > 0
      ? '<option value="">All sub-categories</option>' +
        filteredSubs.map(s => `<option value="${s.id}">${s.sub_category}</option>`).join('')
      : '<option value="">—</option>';
    subCatSelect.disabled = filteredSubs.length === 0;
  }

  async function _handleFilterBarChange(values, changedId) {
    if (changedId === 'name') {
      state.nameFilter = values.name;
      state.gridApi?.setGridOption('quickFilterText', values.name);
      return;
    }
    if (changedId === 'category') {
      state.categoryFilter = values.category;
      state.subCategoryFilter = '';
      _updateSubCategorySelect(values.category);
      await reloadGrid();
      return;
    }
    if (changedId === 'subCategory') {
      state.subCategoryFilter = values.subCategory;
      await reloadGrid();
    }
    if (changedId === 'repetitive') {
      state.noRepetitiveFilter  = values.repetitive === 'none';
      state.hasRepetitiveFilter = values.repetitive === 'has';
      applyExternalFilter(state);
      return;
    }
    if (changedId === 'moneyTransfers') {
      state.moneyTransfersFilter = values.moneyTransfers;
      applyExternalFilter(state);
    }
  }

  function _exportCsv() {
    if (!state.gridApi) return;

    const columns = [
      { header: 'Date',         get: r => r.date ?? '' },
      { header: 'Movement',     get: r => r.movement ?? '' },
      { header: 'Description',  get: r => r.description ?? '' },
      { header: 'Account',      get: r => r.account ?? '' },
      { header: 'Type',         get: r => r.type ?? '' },
      { header: 'Amount',       get: r => r.value != null ? (Number(r.value) / 100).toFixed(2) : '' },
      { header: 'Currency',     get: r => r.currency ?? '' },
      { header: 'Balance',      get: r => r.balance_at_date != null ? (Number(r.balance_at_date) / 100).toFixed(2) : '' },
      { header: 'Category',             get: r => r.category ?? '' },
      { header: 'Sub-category',         get: r => r.sub_category ?? '' },
      { header: 'Repetitive Movement',  get: r => r.repetitive_movement ?? '' },
    ];

    const escape = v => {
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const rows = [];
    state.gridApi.forEachNodeAfterFilterAndSort(node => {
      if (node.data) rows.push(node.data);
    });

    const header = columns.map(c => escape(c.header)).join(',');
    const body = rows.map(r => columns.map(c => escape(c.get(r))).join(',')).join('\n');
    const csv = `${header}\n${body}`;

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `movements-${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (filterBarEl) {
    _filterBarRoot = FilterBar.render(filterBarEl, _buildFilterBarConfig(), {
      onFilterChange: (values, { id }) => _handleFilterBarChange(values, id),
      onAction: actionId => { if (actionId === 'download') _exportCsv(); },
    });

    /* Real-time search as the user types (FilterBar only fires on `change`). */
    _filterBarRoot?.querySelector('[data-filter-id="name"]')
      ?.addEventListener('input', e => {
        state.nameFilter = e.target.value;
        state.gridApi?.setGridOption('quickFilterText', e.target.value);
      });

    /* Disable sub-category select until a category is chosen. */
    _updateSubCategorySelect('');
  }

  /* ── Toolbar Events ───────────────────────────────────────── */

  accountSelect?.addEventListener('change', reloadGrid);

  typeToggle?.addEventListener('click', e => {
    const btn = e.target.closest('[data-type]');
    if (!btn) return;
    state.typeFilter = btn.dataset.type;
    typeToggle.querySelectorAll('[data-type]').forEach(b =>
      b.classList.toggle('ft-type-toggle__btn--active', b === btn),
    );
    reloadGrid();
  });

  /* ── Show Deleted Toggle ──────────────────────────────────── */

  const showDeletedToggle = toolbarEl?.querySelector('#movements-show-deleted');
  showDeletedToggle?.addEventListener('change', () => {
    state.showDeleted = showDeletedToggle.checked;
    reloadGrid();
  });

  /* ── Reload ───────────────────────────────────────────────── */

  async function reloadGrid() {
    try {
      const params = { limit: DEFAULT_LIMIT };
      if (accountSelect?.value) params.account_id = Number(accountSelect.value);
      if (state.typeFilter) params.type = state.typeFilter;
      if (state.dateFrom) params.date_from = state.dateFrom;
      if (state.dateTo) params.date_to = state.dateTo;
      if (state.categoryFilter) params.category_id = Number(state.categoryFilter);
      if (state.subCategoryFilter) params.sub_category_id = Number(state.subCategoryFilter);

      let fresh = [];
      if (state.showDeleted) {
        const [activeRows, inactiveRows] = await Promise.all([
          fetchMovements({ ...params, active: 1 }),
          fetchMovements({ ...params, active: 0 }),
        ]);
        const merged = []
          .concat(Array.isArray(activeRows) ? activeRows : [])
          .concat(Array.isArray(inactiveRows) ? inactiveRows : []);
        const seen = new Set();
        fresh = merged.filter(row => {
          const id = row?.id;
          if (id == null || seen.has(id)) return false;
          seen.add(id);
          return true;
        }).sort((a, b) => {
          if (a.date === b.date) return (Number(b.id) || 0) - (Number(a.id) || 0);
          return a.date < b.date ? 1 : -1;
        });
      } else {
        const activeOnly = await fetchMovements({ ...params, active: 1 });
        fresh = Array.isArray(activeOnly) ? activeOnly : [];
      }

      refreshGridData(state, fresh);
      if (state.nameFilter) state.gridApi?.setGridOption('quickFilterText', state.nameFilter);
      applyExternalFilter(state);
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
      repetitiveMovements: state.reps,
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

  /* ── Restore ───────────────────────────────────────────────── */

  function handleRestore(row) {
    FeedbackBanner.renderWithActions(
      feedbackEl,
      `Restore movement <b>${row.movement}</b>?`,
      [
        {
          label: 'Restore',
          className: 'ft-feedback-banner__btn--success',
          onClick: async () => {
            try {
              await restoreMovement(row.id);
              FeedbackBanner.render(feedbackEl, 'Movement restored.', 'success');
              await reloadGrid();
              setTimeout(() => FeedbackBanner.clear(feedbackEl), 3000);
            } catch (e) {
              FeedbackBanner.render(feedbackEl, e?.message || 'Restore failed.');
            }
          },
        },
        { label: 'Cancel', onClick: () => FeedbackBanner.clear(feedbackEl) },
      ],
    );
  }

  function handleBulkRestore(rows) {
    if (!rows.length) {
      FeedbackBanner.render(feedbackEl, 'No inactive movements selected.');
      return;
    }
    FeedbackBanner.renderWithActions(
      feedbackEl,
      `Restore <b>${rows.length}</b> movement${rows.length !== 1 ? 's' : ''}?`,
      [
        {
          label: 'Restore',
          className: 'ft-feedback-banner__btn--success',
          onClick: async () => {
            try {
              await Promise.all(rows.map(m => restoreMovement(m.id)));
              FeedbackBanner.render(feedbackEl, `${rows.length} movement(s) restored.`, 'success');
              await reloadGrid();
              setTimeout(() => FeedbackBanner.clear(feedbackEl), 3000);
            } catch (e) {
              FeedbackBanner.render(feedbackEl, e?.message || 'Bulk restore failed.');
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
