/**
 * Movements page bootstrap.
 *
 * Orchestrates: toolbar, grid with checkbox selection, movement modal,
 * code-group banner, FX rates for currency conversion, and bulk actions.
 */
import { bankAccounts, categories, subCategories, fxRates } from '../../services/api.js';
import { ensureAgGridLoaded } from '../../lib/agGridLoader.js';
import { FeedbackBanner } from '../../components/dumb/feedbackBanner/feedbackBanner.js';
import { MovementModal } from '../../components/modals/movementModal/movementModal.js';
import { DatePicker } from '../../components/dumb/datePicker/datePicker.js';
import { normalizeCurrency } from '../../utils/formatters.js';
import { finalAppConfig } from '../../defaults.js';
import { mountGrid, refreshGridData, applyExternalFilter } from './grid.js';
import { fetchMovements, updateMovement, softDeleteMovement } from './actions.js';

/* ── Constants ────────────────────────────────────────────── */

const DEFAULT_LIMIT = 500;

/* ── DatePicker popup trigger helper ──────────────────────── */

/**
 * Builds a self-contained date-picker trigger element:
 * a styled button that shows the selected date (or a placeholder),
 * with a floating calendar popup from the shared DatePicker component.
 *
 * @param {string}   placeholder  — label shown when no date is selected
 * @param {string}   initialValue — initial ISO date (or '')
 * @param {Function} onChange     — called with the new ISO date (or '') on change/clear
 * @returns {HTMLElement}
 */
function _makeDatePickerField(placeholder, initialValue, onChange) {
  let currentValue = initialValue || '';

  const wrapper = document.createElement('div');
  wrapper.className = 'ft-date-popup';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'ft-date-popup__trigger';

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'ft-date-popup__clear';
  clearBtn.setAttribute('aria-label', `Clear ${placeholder} date`);
  clearBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';
  clearBtn.hidden = true;

  const popup = document.createElement('div');
  popup.className = 'ft-date-popup__calendar';
  popup.hidden = true;

  function _fmt(iso) {
    if (!iso) return null;
    const [y, m, d] = iso.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${d} ${months[parseInt(m, 10) - 1]} ${y}`;
  }

  function _refresh() {
    const label = _fmt(currentValue);
    if (label) {
      trigger.textContent = label;
      trigger.classList.remove('ft-date-popup__trigger--placeholder');
      clearBtn.hidden = false;
    } else {
      trigger.textContent = placeholder;
      trigger.classList.add('ft-date-popup__trigger--placeholder');
      clearBtn.hidden = true;
    }
  }

  _refresh();

  const picker = DatePicker.createElement(
    { value: currentValue },
    {
      onChange: isoDate => {
        currentValue = isoDate;
        _refresh();
        popup.hidden = true;
        onChange?.(currentValue);
      },
    }
  );
  popup.appendChild(picker);

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    /* Close any other open date popups first */
    document.querySelectorAll('.ft-date-popup__calendar:not([hidden])').forEach(p => {
      if (p !== popup) p.hidden = true;
    });
    popup.hidden = !popup.hidden;
  });

  clearBtn.addEventListener('click', e => {
    e.stopPropagation();
    currentValue = '';
    _refresh();
    popup.hidden = true;
    onChange?.('');
  });

  /* Close when clicking outside */
  document.addEventListener('click', e => {
    if (!wrapper.contains(e.target)) popup.hidden = true;
  });

  wrapper.appendChild(trigger);
  wrapper.appendChild(clearBtn);
  wrapper.appendChild(popup);
  return wrapper;
}

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
  const datePickers   = toolbarEl?.querySelector('#movements-date-pickers');

  const state = {
    accounts: [],
    cats: [],
    subs: [],
    movements: [],
    gridApi: null,
    codeFilter: null,
    rates: {},
    typeFilter: '',
    dateFrom: '',
    dateTo: '',
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

  /* ── Mount date pickers ───────────────────────────────────── */

  if (datePickers) {
    datePickers.appendChild(_makeDatePickerField('From', '', v => { state.dateFrom = v; reloadGrid(); }));
    const sep = document.createElement('span');
    sep.className = 'ft-movements-toolbar__date-sep';
    sep.textContent = '–';
    datePickers.appendChild(sep);
    datePickers.appendChild(_makeDatePickerField('To', '', v => { state.dateTo = v; reloadGrid(); }));
  }

  /* ── Mount Grid ───────────────────────────────────────────── */

  gridWrapper.innerHTML = '<div class="ft-movements-grid ft-ag-grid" id="movements-grid-host"></div>';
  const gridHost = gridWrapper.querySelector('#movements-grid-host');

  mountGrid(gridHost, state, {
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
      if (state.dateFrom) params.date_from = state.dateFrom;
      if (state.dateTo) params.date_to = state.dateTo;
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
