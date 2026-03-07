/**
 * Quick Add page bootstrap.
 *
 * Orchestrates:
 * - Data loading (accounts, categories, sub-categories)
 * - Account selection + lock
 * - Sequential flow engine
 * - Keyboard event handling for the entire flow
 * - Session tally tracking
 */

import { bankAccounts, categories, subCategories } from '../../services/api.js';
import { FeedbackBanner } from '../../components/dumb/feedbackBanner/feedbackBanner.js';
import { normalizeCurrency } from '../../utils/formatters.js';
import { escapeHtml } from '../../utils/formHelpers.js';
import { createFlow } from './flow.js';
import { renderAccountToolbar, renderAccountPanel, renderTally, renderFlow, renderHistory, MONTH_NAMES } from './render.js';
import { saveMovement } from './actions.js';

/* ── Phases: 'idle' | 'input' | 'review' | 'success' | 'saving' ── */

async function initQuickAddPage(root = document) {
  const toolbarEl = root.querySelector('#widget-quick-add-toolbar');
  const accountPanelEl = root.querySelector('#widget-quick-add-account-panel');
  const tallyEl = root.querySelector('#widget-quick-add-tally');
  const flowEl = root.querySelector('#widget-quick-add-flow');
  const feedbackEl = root.querySelector('#widget-quick-add-feedback');
  const historyEl = root.querySelector('#widget-quick-add-history');

  if (!toolbarEl || !flowEl) return;

  /* ── Load data ── */
  toolbarEl.innerHTML = '<span class="ft-small ft-text-muted">Loading accounts…</span>';

  let accountList = [];
  let categoryList = [];
  let subCategoryList = [];

  try {
    [accountList, categoryList, subCategoryList] = await Promise.all([
      bankAccounts.getAll({ active: 1 }),
      categories.getAll({ active: 1 }),
      subCategories.getAll({ active: 1 }),
    ]);
  } catch (error) {
    FeedbackBanner.render(feedbackEl, error?.message || 'Failed to load data.');
    toolbarEl.innerHTML = '<span class="ft-small ft-text-muted">Could not load accounts.</span>';
    return;
  }

  if (accountList.length === 0) {
    toolbarEl.innerHTML = '<span class="ft-small ft-text-muted">No active bank accounts available.</span>';
    return;
  }

  /* ── State ── */
  const state = {
    accounts: accountList,
    categories: categoryList,
    subCategories: subCategoryList,
    selectedAccountId: Number(accountList[0].id),
    accountLocked: false,
  };

  const sessionStats = {
    count: 0,
    totalCents: 0,
    currency: normalizeCurrency(accountList[0]?.currency),
  };

  const history = [];
  const flow = createFlow();
  let phase = 'idle';

  /* ── Render helpers ── */
  function refresh() {
    renderAccountToolbar(toolbarEl, state);
    renderAccountPanel(accountPanelEl, state);
    renderTally(tallyEl, sessionStats);
    renderFlow(flowEl, flow, state, phase);
    renderHistory(historyEl, history, sessionStats.currency);
  }

  /* ── Wire toolbar events ── */
  toolbarEl.addEventListener('change', e => {
    if (e.target.id === 'qa-account-select') {
      state.selectedAccountId = Number(e.target.value);
      const acct = state.accounts.find(a => Number(a.id) === state.selectedAccountId);
      sessionStats.currency = normalizeCurrency(acct?.currency);
    }
  });

  toolbarEl.addEventListener('click', e => {
    if (e.target.closest('#qa-lock-account')) {
      state.accountLocked = true;
      phase = 'input';
      flow.reset();
      FeedbackBanner.clear(feedbackEl);
      refresh();
      return;
    }
    if (e.target.closest('#qa-change-account')) {
      state.accountLocked = false;
      phase = 'idle';
      flow.reset();
      refresh();
    }
  });

  /* ── Refresh account data (updates balance after save) ── */
  async function _refreshAccountData() {
    try {
      const freshAccounts = await bankAccounts.getAll({ active: 1 });
      state.accounts = freshAccounts;
      renderAccountPanel(accountPanelEl, state);
    } catch (_) { /* silent — balance card just won't update */ }
  }

  /* ── Smart date helpers ── */

  function _getSmartDateEl() {
    return flowEl.querySelector('.ft-qa-smart-date');
  }

  function _smartDateValues(el) {
    return {
      year: parseInt(el.dataset.year, 10),
      month: parseInt(el.dataset.month, 10),
      day: parseInt(el.dataset.day, 10),
      segment: parseInt(el.dataset.segment, 10),
    };
  }

  function _daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function _clampDay(year, month, day) {
    return Math.min(day, _daysInMonth(year, month));
  }

  function _updateSmartDate(el, year, month, day, segment) {
    month = ((month - 1 + 12) % 12) + 1; // clamp 1–12
    day = _clampDay(year, month, day);
    el.dataset.year = year;
    el.dataset.month = month;
    el.dataset.day = day;
    el.dataset.segment = segment;

    const segs = el.querySelectorAll('.ft-qa-smart-date__seg');
    segs[0].textContent = String(day).padStart(2, '0');
    segs[1].textContent = MONTH_NAMES[month - 1];
    segs[2].textContent = String(year);

    segs.forEach((s, i) => s.classList.toggle('ft-qa-smart-date__seg--active', i === segment));
  }

  function _smartDateIso(el) {
    const { year, month, day } = _smartDateValues(el);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  /* ── Global keyboard handler ── */
  const keyHandler = async (e) => {
    // Only handle if we're within the quick-add page
    if (!root.querySelector('.ft-quick-add-page')) {
      document.removeEventListener('keydown', keyHandler);
      return;
    }

    if (phase === 'idle') return;

    /* ── Success phase ── */
    if (phase === 'success') {
      if (e.key === 'Enter') {
        e.preventDefault();
        flow.reset();
        phase = 'input';
        FeedbackBanner.clear(feedbackEl);
        refresh();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        phase = 'idle';
        state.accountLocked = false;
        refresh();
      }
      return;
    }

    /* ── Review phase ── */
    if (phase === 'review') {
      if (e.key === 'Enter') {
        e.preventDefault();
        phase = 'saving';
        const values = flow.getValues();
        const result = await saveMovement(flow, state, feedbackEl);
        if (result) {
          const amount = values.amount || 0;
          const cents = Math.round(Math.abs(amount) * 100);
          sessionStats.count++;
          sessionStats.totalCents += cents;
          history.push({ movement: values.movement, date: values.date, type: values.type, amount });
          phase = 'success';
          // Refresh account data so balance card reflects the new movement
          _refreshAccountData();
        } else {
          phase = 'review';
        }
        refresh();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        flow.reset();
        phase = 'input';
        FeedbackBanner.clear(feedbackEl);
        refresh();
      }
      return;
    }

    /* ── Input phase ── */
    if (phase !== 'input') return;

    const step = flow.currentStep();
    if (!step) return;

    /* Smart date: segment-based arrow key navigation */
    if (step.inputType === 'smart-date') {
      const dateEl = _getSmartDateEl();
      if (!dateEl) return;
      const { year, month, day, segment } = _smartDateValues(dateEl);

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        _updateSmartDate(dateEl, year, month, day, Math.max(0, segment - 1));
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        _updateSmartDate(dateEl, year, month, day, Math.min(2, segment + 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (segment === 0) _updateSmartDate(dateEl, year, month, Math.min(_daysInMonth(year, month), day + 1), segment);
        else if (segment === 1) _updateSmartDate(dateEl, year, month + 1, day, segment);
        else _updateSmartDate(dateEl, year + 1, month, day, segment);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (segment === 0) _updateSmartDate(dateEl, year, month, Math.max(1, day - 1), segment);
        else if (segment === 1) _updateSmartDate(dateEl, year, month - 1, day, segment);
        else _updateSmartDate(dateEl, year - 1, month, day, segment);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        _advanceStep(_smartDateIso(dateEl));
        return;
      }
      return;
    }

    /* Type toggle: E/I keys, arrows, or click */
    if (step.inputType === 'type-toggle') {
      if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        _selectTypeToggle(flowEl, 'Expense');
        _advanceStep('Expense');
        return;
      }
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        _selectTypeToggle(flowEl, 'Income');
        _advanceStep('Income');
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const active = flowEl.querySelector('.ft-qa-type-toggle__btn--active');
        const next = active?.dataset.value === 'Expense' ? 'Income' : 'Expense';
        _selectTypeToggle(flowEl, next);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const active = flowEl.querySelector('.ft-qa-type-toggle__btn--active');
        _advanceStep(active?.dataset.value || 'Expense');
        return;
      }
      return;
    }

    /* Invoice toggle: Y/N keys, arrows */
    if (step.inputType === 'yn-toggle') {
      if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        _selectInvoiceToggle(flowEl, '1');
        _advanceStep('1');
        return;
      }
      if (e.key === 'n' || e.key === 'N' || e.key === 'Enter') {
        e.preventDefault();
        const active = flowEl.querySelector('.ft-qa-invoice-toggle__btn--active');
        _advanceStep(active?.dataset.value || '0');
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const active = flowEl.querySelector('.ft-qa-invoice-toggle__btn--active');
        const next = active?.dataset.value === '0' ? '1' : '0';
        _selectInvoiceToggle(flowEl, next);
        return;
      }
      if (e.key === 'Escape' && !step.required) {
        e.preventDefault();
        _advanceStep('0');
        return;
      }
      return;
    }

    /* Filtered select */
    if (step.inputType === 'filtered-select') {
      const input = flowEl.querySelector('[data-select-input]');
      const dropdown = flowEl.querySelector('#qa-select-dropdown');
      if (!input || !dropdown) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        _moveHighlight(dropdown, e.key === 'ArrowDown' ? 1 : -1);
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        const highlighted = dropdown.querySelector('.ft-qa-select-option--highlighted:not(.ft-qa-select-option--empty)');
        _advanceStep(highlighted?.dataset.id || '');
        return;
      }

      if (e.key === 'Escape' && !step.required) {
        e.preventDefault();
        _advanceStep('');
        return;
      }

      // Filter on next tick (after character is typed)
      requestAnimationFrame(() => _filterSelectOptions(input, dropdown, step, state, flow.getValues()));
      return;
    }

    /* Text / number inputs */
    const input = flowEl.querySelector('.ft-qa-prompt__input');
    if (!input) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      _advanceStep(input.value);
      return;
    }

    if (e.key === 'Escape' && !step.required) {
      e.preventDefault();
      _advanceStep('');
      return;
    }
  };

  function _advanceStep(value) {
    const { ok, error } = flow.advance(value, state);
    if (!ok) {
      FeedbackBanner.render(feedbackEl, error);
      return;
    }
    FeedbackBanner.clear(feedbackEl);

    if (flow.isComplete()) {
      phase = 'review';
    }
    refresh();
  }

  function _selectTypeToggle(container, value) {
    container.querySelectorAll('.ft-qa-type-toggle__btn').forEach(btn => {
      btn.classList.toggle('ft-qa-type-toggle__btn--active', btn.dataset.value === value);
    });
  }

  function _selectInvoiceToggle(container, value) {
    container.querySelectorAll('.ft-qa-invoice-toggle__btn').forEach(btn => {
      btn.classList.toggle('ft-qa-invoice-toggle__btn--active', btn.dataset.value === value);
    });
  }

  function _moveHighlight(dropdown, dir) {
    const options = [...dropdown.querySelectorAll('.ft-qa-select-option:not(.ft-qa-select-option--empty)')];
    if (options.length === 0) return;
    const currentIdx = options.findIndex(o => o.classList.contains('ft-qa-select-option--highlighted'));
    options.forEach(o => o.classList.remove('ft-qa-select-option--highlighted'));
    let nextIdx = currentIdx + dir;
    if (nextIdx < 0) nextIdx = options.length - 1;
    if (nextIdx >= options.length) nextIdx = 0;
    options[nextIdx].classList.add('ft-qa-select-option--highlighted');
    options[nextIdx].scrollIntoView({ block: 'nearest' });
  }

  function _filterSelectOptions(input, dropdown, step, state, values) {
    const query = input.value.toLowerCase().trim();
    const options = step.optionsFn ? step.optionsFn(state, values) : [];
    const filtered = query
      ? options.filter(o => o.label.toLowerCase().includes(query))
      : options;

    if (filtered.length === 0) {
      dropdown.innerHTML = '<div class="ft-qa-select-option ft-qa-select-option--empty">No matches</div>';
      return;
    }

    dropdown.innerHTML = filtered.map((o, i) =>
      `<div class="ft-qa-select-option${i === 0 ? ' ft-qa-select-option--highlighted' : ''}" data-id="${o.id}">${escapeHtml(o.label)}</div>`
    ).join('');
  }

  /* ── Wire click on type/invoice toggle and select options ── */
  flowEl.addEventListener('click', e => {
    /* Type toggle buttons */
    const typeBtn = e.target.closest('.ft-qa-type-toggle__btn');
    if (typeBtn && phase === 'input') {
      const step = flow.currentStep();
      if (step?.inputType === 'type-toggle') {
        _selectTypeToggle(flowEl, typeBtn.dataset.value);
        _advanceStep(typeBtn.dataset.value);
        return;
      }
    }

    /* Invoice toggle buttons */
    const invoiceBtn = e.target.closest('.ft-qa-invoice-toggle__btn');
    if (invoiceBtn && phase === 'input') {
      const step = flow.currentStep();
      if (step?.inputType === 'yn-toggle') {
        _selectInvoiceToggle(flowEl, invoiceBtn.dataset.value);
        _advanceStep(invoiceBtn.dataset.value);
        return;
      }
    }

    /* Filtered select options */
    const option = e.target.closest('.ft-qa-select-option:not(.ft-qa-select-option--empty)');
    if (option && phase === 'input') {
      _advanceStep(option.dataset.id || '');
    }
  });

  document.addEventListener('keydown', keyHandler);

  /* ── Initial render ── */
  refresh();
}

export { initQuickAddPage };
