/**
 * Repetitive Movements page bootstrap.
 *
 * Orchestrates: data loading, summary info cards, tab switching,
 * AG Grid with context-menu actions (edit, delete, restore, toggle
 * subscription, use as template), and the create/edit modal.
 */

import { FeedbackBanner } from '../../components/dumb/feedbackBanner/feedbackBanner.js';
import { InfoCard } from '../../components/dumb/infoCard/infoCard.js';
import { TypeToggle } from '../../components/dumb/typeToggle/typeToggle.js';
import { RepetitiveMovementModal } from '../../components/modals/repetitiveMovementModal/repetitiveMovementModal.js';
import { ensureAgGridLoaded } from '../../lib/agGridLoader.js';
import { normalizeCurrency, formatMoney } from '../../utils/formatters.js';
import { finalAppConfig } from '../../defaults.js';
import { mountGrid, refreshGridData, applyExternalFilter } from './grid.js';
import {
  fetchRepetitiveMovements,
  fetchLatestRates,
  fetchMovementsForSubscription,
  createRepetitiveMovement,
  updateRepetitiveMovement,
  softDeleteRepetitiveMovement,
  restoreRepetitiveMovement,
} from './actions.js';

/* ── Page Init ────────────────────────────────────────── */

async function initRepetitiveMovementsPage(root = document) {
  const feedbackEl        = root.querySelector('#widget-repetitive-feedback');
  const statsEl           = root.querySelector('#widget-repetitive-stats');
  const gridWrapper       = root.querySelector('#widget-repetitive-grid');
  const toolbarEl         = root.querySelector('#widget-repetitive-toolbar');
  const tabsEl            = root.querySelector('#repetitive-tabs');
  const newBtn            = root.querySelector('#btn-new-repetitive');
  let typeToggle          = toolbarEl?.querySelector('#repetitive-type-toggle');
  const showDeletedToggle = toolbarEl?.querySelector('#repetitive-show-deleted');

  if (!gridWrapper) return;

  const mainCurrency = normalizeCurrency(finalAppConfig.currency);

  const state = {
    repetitiveMovements: [],
    rates: {},
    activeTab: 'all',
    typeFilter: '',
    showDeleted: false,
    gridApi: null,
    avgCosts: new Map(),
    mainCurrency,
  };

  /* ── Load AG Grid + data in parallel ────────────────── */

  try {
    await ensureAgGridLoaded();
  } catch (e) {
    return FeedbackBanner.render(feedbackEl, e?.message || 'Failed to load grid library.');
  }

  try {
    const [items, rates] = await Promise.all([
      fetchRepetitiveMovements({ limit: 500 }),
      fetchLatestRates(),
    ]);
    state.repetitiveMovements = Array.isArray(items) ? items : [];
    state.rates = rates || {};
  } catch (e) {
    return FeedbackBanner.render(feedbackEl, e?.message || 'Failed to load data.');
  }

  /* ── Render summary info cards ──────────────────────── */

  await _renderStats();
  state.repetitiveMovements = _buildGridRows(state.repetitiveMovements);

  /* ── Mount Grid ─────────────────────────────────────── */

  gridWrapper.innerHTML = '<div class="ft-repetitive-grid ft-ag-grid" id="repetitive-grid-host"></div>';
  const gridHost = gridWrapper.querySelector('#repetitive-grid-host');

  mountGrid(gridHost, state, {
    onEdit: handleEdit,
    onDelete: handleDelete,
    onRestore: handleRestore,
    onToggleSubscription: handleToggleSubscription,
    onUseAsTemplate: handleUseAsTemplate,
  });

  /* ── Tab Events ─────────────────────────────────────── */

  tabsEl?.addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]');
    if (!tab) return;

    state.activeTab = tab.dataset.tab;
    tabsEl.querySelectorAll('[data-tab]').forEach(t => {
      const isActive = t === tab;
      t.classList.toggle('ft-rep-tabs__tab--active', isActive);
      t.setAttribute('aria-selected', String(isActive));
    });

    // Hide type toggle on subscriptions tab (always Expense)
    if (typeToggle) {
      typeToggle.style.display = state.activeTab === 'subscriptions' ? 'none' : '';
    }

    if (state.gridApi) {
      state.gridApi.setColumnsVisible(['avg_amount_cents'], state.activeTab === 'subscriptions');
    }

    applyExternalFilter(state);
  });

  /* ── Toolbar Events ─────────────────────────────────── */

  if (typeToggle) {
    const typeToggleEl = TypeToggle.createElement({
      activeType: state.typeFilter,
      id: 'repetitive-type-toggle',
      onChange: nextType => {
        state.typeFilter = nextType;
        applyExternalFilter(state);
      },
    });
    typeToggle.replaceWith(typeToggleEl);
    typeToggle = typeToggleEl;
  }

  showDeletedToggle?.addEventListener('change', () => {
    state.showDeleted = showDeletedToggle.checked;
    applyExternalFilter(state);
  });

  /* ── New Button ─────────────────────────────────────── */

  newBtn?.addEventListener('click', () => {
    RepetitiveMovementModal.openNew({
      onSave: async payload => {
        await createRepetitiveMovement(payload);
        FeedbackBanner.render(feedbackEl, 'Repetitive movement created.', 'success');
        await reloadAll();
        setTimeout(() => FeedbackBanner.clear(feedbackEl), 3000);
      },
    });
  });

  /* ── Helpers ────────────────────────────────────────── */

  async function reloadAll() {
    try {
      const [items, rates] = await Promise.all([
        fetchRepetitiveMovements({ limit: 500 }),
        fetchLatestRates(),
      ]);
      state.repetitiveMovements = Array.isArray(items) ? items : [];
      state.rates = rates || {};
    } catch (e) {
      FeedbackBanner.render(feedbackEl, e?.message || 'Failed to reload data.');
    }
    await _renderStats();
    refreshGridData(state, _buildGridRows(state.repetitiveMovements));
  }

  /* ── Render Stats ───────────────────────────────────── */

  async function _renderStats() {
    if (!statsEl) return;

    const activeItems = state.repetitiveMovements.filter(rm => Number(rm.active) === 1);
    const subs = activeItems.filter(rm => rm.active_subscription !== null && rm.active_subscription !== undefined);
    const subsAll = state.repetitiveMovements
      .filter(rm => rm.active_subscription !== null && rm.active_subscription !== undefined);
    const activeSubs = subs.filter(rm => Number(rm.active_subscription) === 1);
    const taxable = activeItems.filter(rm => Number(rm.tax_report) === 1);

    // Compute total monthly subscription cost
    let totalMonthlyCents = 0;
    let avgCosts = new Map();
    try {
      avgCosts = await _computeSubAvgCosts(subsAll, state.rates, mainCurrency);
      activeSubs.forEach(sub => {
        const cents = avgCosts.get(sub.id);
        if (Number.isFinite(cents)) totalMonthlyCents += cents;
      });
    } catch (e) {
      console.error('Failed to compute subscription averages:', e);
    }
    state.avgCosts = avgCosts;

    const monthlyCostDisplay = totalMonthlyCents > 0
      ? formatMoney(totalMonthlyCents / 100, mainCurrency)
      : formatMoney(0, mainCurrency);

    statsEl.innerHTML = '';

    statsEl.appendChild(InfoCard.createElement({
      icon: 'subscriptions',
      label: 'Active Subscriptions',
      value: `${activeSubs.length}`,
      subValue: `~${monthlyCostDisplay} /mo`,
      note: `${subs.length - activeSubs.length} cancelled`,
    }, { variant: 'accent' }));

    statsEl.appendChild(InfoCard.createElement({
      icon: 'receipt_long',
      label: 'Taxable Items',
      value: `${taxable.length}`,
      subValue: `${taxable.filter(rm => rm.type === 'Income').length} income · ${taxable.filter(rm => rm.type === 'Expense').length} expense`,
      note: 'For tax declaration',
    }, { variant: 'warning' }));

    statsEl.appendChild(InfoCard.createElement({
      icon: 'event_repeat',
      label: 'Total Movements',
      value: `${activeItems.length}`,
      subValue: `${activeItems.filter(rm => rm.type === 'Income').length} income · ${activeItems.filter(rm => rm.type === 'Expense').length} expense`,
      note: 'Active repetitive items',
    }, { variant: 'default' }));
  }

  /* ── Edit ────────────────────────────────────────────── */

  function handleEdit(item) {
    RepetitiveMovementModal.openEdit(item, {
      onSave: async (id, payload) => {
        await updateRepetitiveMovement(id, payload);
        FeedbackBanner.render(feedbackEl, 'Repetitive movement updated.', 'success');
        await reloadAll();
        setTimeout(() => FeedbackBanner.clear(feedbackEl), 3000);
      },
      onSoftDelete: async id => {
        await softDeleteRepetitiveMovement(id);
        FeedbackBanner.render(feedbackEl, 'Repetitive movement deleted.', 'success');
        await reloadAll();
        setTimeout(() => FeedbackBanner.clear(feedbackEl), 3000);
      },
      onRestore: async id => {
        await restoreRepetitiveMovement(id);
        FeedbackBanner.render(feedbackEl, 'Repetitive movement restored.', 'success');
        await reloadAll();
        setTimeout(() => FeedbackBanner.clear(feedbackEl), 3000);
      },
    });
  }

  /* ── Delete ──────────────────────────────────────────── */

  function handleDelete(item) {
    FeedbackBanner.renderWithActions(
      feedbackEl,
      `Soft-delete <b>${item.movement}</b>?`,
      [
        {
          label: 'Delete',
          className: 'ft-feedback-banner__btn--danger',
          onClick: async () => {
            try {
              await softDeleteRepetitiveMovement(item.id);
              FeedbackBanner.render(feedbackEl, 'Repetitive movement deleted.', 'success');
              await reloadAll();
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

  /* ── Restore ─────────────────────────────────────────── */

  function handleRestore(item) {
    FeedbackBanner.renderWithActions(
      feedbackEl,
      `Restore <b>${item.movement}</b>?`,
      [
        {
          label: 'Restore',
          className: 'ft-feedback-banner__btn--success',
          onClick: async () => {
            try {
              await restoreRepetitiveMovement(item.id);
              FeedbackBanner.render(feedbackEl, 'Repetitive movement restored.', 'success');
              await reloadAll();
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

  /* ── Toggle Subscription ────────────────────────────── */

  async function handleToggleSubscription(sub) {
    const wasActive = Number(sub.active_subscription) === 1;

    FeedbackBanner.renderWithActions(
      feedbackEl,
      `${wasActive ? 'Cancel' : 'Reactivate'} subscription <b>${sub.movement}</b>?`,
      [
        {
          label: wasActive ? 'Cancel Subscription' : 'Reactivate',
          className: wasActive ? 'ft-feedback-banner__btn--danger' : 'ft-feedback-banner__btn--success',
          onClick: async () => {
            try {
              await updateRepetitiveMovement(sub.id, {
                movement: sub.movement,
                description: sub.description,
                type: sub.type,
                tax_report: sub.tax_report,
                active_subscription: wasActive ? 0 : 1,
              });
              FeedbackBanner.render(feedbackEl, `Subscription ${wasActive ? 'cancelled' : 'reactivated'}.`, 'success');
              await reloadAll();
              setTimeout(() => FeedbackBanner.clear(feedbackEl), 3000);
            } catch (e) {
              FeedbackBanner.render(feedbackEl, e?.message || 'Toggle failed.');
            }
          },
        },
        { label: 'Nevermind', onClick: () => FeedbackBanner.clear(feedbackEl) },
      ],
    );
  }

  /* ── Use as Template ────────────────────────────────── */

  function handleUseAsTemplate(item) {
    const template = {
      movement: item.movement,
      description: item.description || '',
      type: item.type,
      repetitive_movement_id: item.id,
    };

    sessionStorage.setItem('ft-movement-template', JSON.stringify(template));
    window.location.hash = 'add-movements';
  }

  /* ── Subscription Avg Cost ──────────────────────────── */

  async function _computeSubAvgCosts(subscriptions, rates, targetCurrency) {
    const avgMap = new Map();
    const target = normalizeCurrency(targetCurrency);

    const fetches = subscriptions.map(async sub => {
      try {
        const movs = await fetchMovementsForSubscription(sub.id);
        if (!Array.isArray(movs) || !movs.length) {
          avgMap.set(sub.id, 0);
          return;
        }

        let totalCents = 0;
        let count = 0;

        for (const m of movs) {
          const currency = normalizeCurrency(m.currency);
          const valueCents = Math.abs(Number(m.value) || 0);

          if (currency === target) {
            totalCents += valueCents;
          } else {
            totalCents += _convertCents(valueCents, currency, target, rates);
          }
          count++;
        }

        avgMap.set(sub.id, count > 0 ? Math.round(totalCents / count) : 0);
      } catch (e) {
        console.error('Failed to compute subscription average:', sub.id, e);
        avgMap.set(sub.id, 0);
      }
    });

    await Promise.all(fetches);
    return avgMap;
  }

  function _convertCents(cents, from, to, rates) {
    if (from === to) return cents;

    const directPair = `${from}${to}`;
    const direct = rates[directPair];
    if (direct) {
      const rate = Number(direct.rate ?? direct);
      if (Number.isFinite(rate) && rate > 0) return Math.round(cents * rate);
    }

    const reversePair = `${to}${from}`;
    const reverse = rates[reversePair];
    if (reverse) {
      const inverseRate = Number(reverse.inverse_rate ?? (1 / Number(reverse.rate ?? reverse)));
      if (Number.isFinite(inverseRate) && inverseRate > 0) return Math.round(cents * inverseRate);
    }

    if (from !== 'USD' && to !== 'USD') {
      const toUsd = _convertCents(cents, from, 'USD', rates);
      if (toUsd > 0) return _convertCents(toUsd, 'USD', to, rates);
    }

    return cents;
  }

  function _buildGridRows(items) {
    return items.map(row => {
      const isSub = row.active_subscription !== null && row.active_subscription !== undefined;
      let _row_sort_order;
      if (isSub && Number(row.active_subscription) === 1) _row_sort_order = 0;
      else if (isSub) _row_sort_order = 1;
      else _row_sort_order = 2;

      const avgCents = isSub ? (state.avgCosts?.get(row.id) ?? null) : null;
      return {
        ...row,
        _row_sort_order,
        avg_amount_cents: Number.isFinite(avgCents) ? avgCents : null,
      };
    });
  }
}

export { initRepetitiveMovementsPage };
