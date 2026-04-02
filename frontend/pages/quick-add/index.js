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

import { bankAccounts, categories, subCategories, repetitiveMovements, movements } from '../../services/api.js';
import { FeedbackBanner } from '../../components/dumb/feedbackBanner/feedbackBanner.js';
import { DatePicker } from '../../components/dumb/datePicker/datePicker.js';
import { normalizeCurrency } from '../../utils/formatters.js';
import { escapeHtml } from '../../utils/formHelpers.js';
import { createFlow } from './flow.js';
import {
  renderAccountToolbar,
  renderAccountPanel,
  syncAccountPanel,
  parseActualBalanceInput,
  formatActualBalanceInput,
  getActualBalanceInputValue,
  renderTally,
  renderFlow,
  renderHistory,
  renderHints,
  MONTH_NAMES,
} from './render.js';
import { saveMovement } from './actions.js';

/* ── Phases: 'idle' | 'input' | 'review' | 'success' | 'saving' ── */

async function initQuickAddPage(root = document) {
  const toolbarEl = root.querySelector('#widget-quick-add-toolbar');
  const accountPanelEl = root.querySelector('#widget-quick-add-account-panel');
  const tallyEl = root.querySelector('#widget-quick-add-tally');
  const flowEl = root.querySelector('#widget-quick-add-flow');
  const feedbackEl = root.querySelector('#widget-quick-add-feedback');
  const historyEl = root.querySelector('#widget-quick-add-history');
  const hintsEl = root.querySelector('#widget-quick-add-hints');

  if (!toolbarEl || !flowEl) return;

  /* ── Load data ── */
  toolbarEl.innerHTML = '<span class="ft-small ft-text-muted">Loading accounts…</span>';

  let accountList = [];
  let categoryList = [];
  let subCategoryList = [];
  let repMovList = [];
  let recentMovements = [];

  try {
    [accountList, categoryList, subCategoryList, repMovList, recentMovements] = await Promise.all([
      bankAccounts.getAll({ active: 1 }),
      categories.getAll({ active: 1 }),
      subCategories.getAll({ active: 1 }),
      repetitiveMovements.getAll({ active: 1 }),
      movements.getAll({ active: 1, limit: 500 }),
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

  /* ── Build category usage maps from recent movements ── */
  const categoryUsage = {};
  const subCategoryUsage = {};
  for (const m of (Array.isArray(recentMovements) ? recentMovements : [])) {
    if (m.category_id) {
      const k = `${m.type}_${m.category_id}`;
      categoryUsage[k] = (categoryUsage[k] || 0) + 1;
    }
    if (m.sub_category_id) {
      const k = String(m.sub_category_id);
      subCategoryUsage[k] = (subCategoryUsage[k] || 0) + 1;
    }
  }

  /* ── State ── */
  const state = {
    accounts: accountList,
    categories: categoryList,
    subCategories: subCategoryList,
    repetitiveMovements: repMovList,
    categoryUsage,
    subCategoryUsage,
    actualBalances: {},
    selectedAccountId: Number(accountList[0].id),
    accountLocked: false,
    isMobileInteraction: _isMobileInteraction(),
  };

  const sessionStats = {
    count: 0,
    totalCents: 0,
    currency: normalizeCurrency(accountList[0]?.currency),
  };

  const history = [];
  const flow = createFlow();
  let phase = 'idle';
  let mobileDatePickerCleanup = null;

  /* ── Render helpers ── */
  function refresh() {
    if (typeof mobileDatePickerCleanup === 'function') {
      mobileDatePickerCleanup();
      mobileDatePickerCleanup = null;
    }

    renderAccountToolbar(toolbarEl, state);
    renderAccountPanel(accountPanelEl, state);
    renderTally(tallyEl, sessionStats);
    renderFlow(flowEl, flow, state, phase);
    _mountMobileDatePicker();
    renderHistory(historyEl, history, sessionStats.currency);
    renderHints(hintsEl, state, phase);
  }

  function _isMobileInteraction() {
    return window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;
  }

  function _syncInteractionMode() {
    const nextMode = _isMobileInteraction();
    if (state.isMobileInteraction === nextMode) return;
    state.isMobileInteraction = nextMode;
    _closeSmartDatePopup();
    refresh();
  }

  function _resetForNextEntry() {
    flow.reset();
    phase = 'input';
    FeedbackBanner.clear(feedbackEl);
    refresh();
  }

  function _finishSession() {
    flow.reset();
    phase = 'idle';
    state.accountLocked = false;
    FeedbackBanner.clear(feedbackEl);
    _closeSmartDatePopup();
    refresh();
  }

  function _goBackOneStep() {
    const didGoBack = flow.back();
    if (!didGoBack) return;
    phase = 'input';
    FeedbackBanner.clear(feedbackEl);
    _closeSmartDatePopup();
    refresh();
  }

  async function _saveCurrentReview() {
    if (phase !== 'review') return;

    phase = 'saving';
    refresh();

    const values = flow.getValues();
    const result = await saveMovement(flow, state, feedbackEl);
    if (result) {
      const amount = values.amount || 0;
      const cents = Math.round(Math.abs(amount) * 100);
      sessionStats.count++;
      sessionStats.totalCents += cents;
      history.push({ movement: values.movement, date: values.date, type: values.type, amount });
      phase = 'success';
      _refreshAccountData();
    } else {
      phase = 'review';
    }

    refresh();
  }

  function _mountMobileDatePicker() {
    const host = flowEl.querySelector('[data-qa-date-picker-host]');
    if (!host) return;

    const initialValue = host.dataset.value || new Date().toISOString().slice(0, 10);
    const pickerField = DatePicker.createPickerField('Select date', initialValue, isoDate => {
      host.dataset.value = isoDate;
    });

    host.replaceChildren(pickerField);
    mobileDatePickerCleanup = pickerField._cleanup ?? null;
  }

  function _getActiveStepValue(step) {
    if (!step) return '';

    if (step.inputType === 'smart-date') {
      const mobileDatePickerHost = flowEl.querySelector('[data-qa-date-picker-host]');
      if (mobileDatePickerHost instanceof HTMLElement) {
        return mobileDatePickerHost.dataset.value || '';
      }

      const smartDate = _getSmartDateEl();
      return smartDate ? _smartDateIso(smartDate) : '';
    }

    if (step.inputType === 'type-toggle') {
      return flowEl.querySelector('.ft-qa-type-toggle__btn--active')?.dataset.value || 'Expense';
    }

    if (step.inputType === 'filtered-select') {
      const highlighted = flowEl.querySelector('.ft-qa-select-option--highlighted:not(.ft-qa-select-option--empty)');
      return highlighted?.dataset.id || '';
    }

    return flowEl.querySelector('.ft-qa-prompt__input')?.value || '';
  }

  function _handleStepAction(action) {
    if (action === 'back') {
      _goBackOneStep();
      return;
    }

    if (action === 'next') {
      _advanceStep(_getActiveStepValue(flow.currentStep()));
    }
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

  accountPanelEl.addEventListener('focusin', e => {
    if (!e.target.matches('[data-qa-actual-balance-input]')) return;
    e.target.value = getActualBalanceInputValue(state).replace(/,/g, '');
    e.target.select();
  });

  accountPanelEl.addEventListener('input', e => {
    if (!e.target.matches('[data-qa-actual-balance-input]')) return;

    const accountId = String(state.selectedAccountId ?? '');
    const cents = parseActualBalanceInput(e.target.value);

    if (!state.actualBalances) state.actualBalances = {};

    if (cents === null) {
      delete state.actualBalances[accountId];
    } else {
      state.actualBalances[accountId] = cents;
    }

    syncAccountPanel(accountPanelEl, state, { updateInput: false });
  });

  accountPanelEl.addEventListener('focusout', e => {
    if (!e.target.matches('[data-qa-actual-balance-input]')) return;

    const cents = parseActualBalanceInput(e.target.value);
    if (!state.actualBalances) state.actualBalances = {};

    if (cents === null) {
      delete state.actualBalances[String(state.selectedAccountId ?? '')];
    } else {
      state.actualBalances[String(state.selectedAccountId ?? '')] = cents;
    }

    e.target.value = formatActualBalanceInput(cents);
    syncAccountPanel(accountPanelEl, state, { updateInput: false });
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

  function _getSmartDatePopupEl() {
    return flowEl.querySelector('.ft-qa-smart-date-popup');
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

  function _clearSmartDatePending(el) {
    delete el.dataset.pendingSegment;
    delete el.dataset.pendingValue;
  }

  function _renderSmartDate(el) {
    const { year, month, day, segment } = _smartDateValues(el);
    const pendingSegment = Number.parseInt(el.dataset.pendingSegment ?? '', 10);
    const pendingValue = el.dataset.pendingValue || '';
    const segs = el.querySelectorAll('.ft-qa-smart-date__seg');

    segs[0].textContent = String(day).padStart(2, '0');
    segs[1].textContent = MONTH_NAMES[month - 1];
    segs[2].textContent = String(year);

    if (pendingValue && pendingSegment >= 0 && pendingSegment < segs.length) {
      segs[pendingSegment].textContent = pendingValue;
    }

    segs.forEach((s, i) => s.classList.toggle('ft-qa-smart-date__seg--active', i === segment));
  }

  function _updateSmartDate(el, year, month, day, segment) {
    month = ((month - 1 + 12) % 12) + 1; // clamp 1–12
    day = _clampDay(year, month, day);
    el.dataset.year = year;
    el.dataset.month = month;
    el.dataset.day = day;
    el.dataset.segment = segment;
    _clearSmartDatePending(el);
    _renderSmartDate(el);
  }

  function _smartDateIso(el) {
    const { year, month, day } = _smartDateValues(el);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function _parseIsoDate(iso) {
    const [year, month, day] = String(iso || '').split('-').map(Number);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return null;
    }
    return { year, month, day };
  }

  function _positionSmartDatePopup(dateEl, popupEl) {
    if (!dateEl || !popupEl) return;

    const rect = dateEl.getBoundingClientRect();
    const popupWidth = 280;
    const popupHeight = 340;
    const margin = 8;

    let left = rect.left;
    if (left + popupWidth > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - popupWidth - margin);
    }

    const spaceBelow = window.innerHeight - rect.bottom;
    let top;
    if (spaceBelow >= popupHeight || spaceBelow >= rect.top) {
      top = Math.min(rect.bottom + 6, window.innerHeight - popupHeight - margin);
    } else {
      top = Math.max(margin, rect.top - popupHeight - 6);
    }

    popupEl.style.left = `${Math.round(left)}px`;
    popupEl.style.top = `${Math.round(top)}px`;
  }

  function _closeSmartDatePopup() {
    const popup = _getSmartDatePopupEl();
    if (!popup) return;
    popup.remove();
  }

  function _openSmartDatePopup(dateEl) {
    if (!dateEl) return;

    _closeSmartDatePopup();

    const popup = document.createElement('div');
    popup.className = 'ft-date-popup__calendar ft-qa-smart-date-popup';
    popup.hidden = false;

    const picker = DatePicker.createElement(
      { value: _smartDateIso(dateEl) },
      {
        onChange: iso => {
          const parsed = _parseIsoDate(iso);
          if (!parsed) return;
          _updateSmartDate(dateEl, parsed.year, parsed.month, parsed.day, _smartDateValues(dateEl).segment);
          _closeSmartDatePopup();
          dateEl.focus();
        },
      },
    );

    popup.appendChild(picker);
    flowEl.appendChild(popup);
    _positionSmartDatePopup(dateEl, popup);
  }

  const smartDateTyping = {
    segment: null,
    buffer: '',
    timer: null,
  };

  function _resetSmartDateTyping(dateEl) {
    smartDateTyping.segment = null;
    smartDateTyping.buffer = '';
    if (smartDateTyping.timer) {
      clearTimeout(smartDateTyping.timer);
      smartDateTyping.timer = null;
    }
    if (dateEl) {
      _clearSmartDatePending(dateEl);
      _renderSmartDate(dateEl);
    }
  }

  function _scheduleSmartDateTypingReset(dateEl) {
    if (smartDateTyping.timer) clearTimeout(smartDateTyping.timer);
    smartDateTyping.timer = setTimeout(() => _resetSmartDateTyping(dateEl), 1400);
  }

  function _setSmartDatePending(dateEl, segment, value) {
    if (!value) {
      _clearSmartDatePending(dateEl);
    } else {
      dateEl.dataset.pendingSegment = String(segment);
      dateEl.dataset.pendingValue = value;
    }
    _renderSmartDate(dateEl);
  }

  function _applySmartDateTypedKey(dateEl, key) {
    const { year, month, day, segment } = _smartDateValues(dateEl);
    const isNewSequence = smartDateTyping.segment !== segment;

    if (segment === 0) {
      if (!/^\d$/.test(key)) return false;

      const nextBuffer = `${isNewSequence ? '' : smartDateTyping.buffer}${key}`.slice(0, 2);
      const maxDay = _daysInMonth(year, month);

      smartDateTyping.segment = segment;
      smartDateTyping.buffer = nextBuffer;

      if (nextBuffer.length === 2) {
        const parsed = Number.parseInt(nextBuffer, 10);
        if (parsed >= 1 && parsed <= maxDay) {
          _updateSmartDate(dateEl, year, month, parsed, segment);
          _resetSmartDateTyping(dateEl);
          return true;
        }
      }

      const parsed = Number.parseInt(nextBuffer, 10);
      if (nextBuffer !== '0' && Number.isFinite(parsed) && parsed >= 1 && parsed <= maxDay && (parsed * 10 > maxDay || nextBuffer.length === 2)) {
        _updateSmartDate(dateEl, year, month, parsed, segment);
        _resetSmartDateTyping(dateEl);
        return true;
      }

      _setSmartDatePending(dateEl, segment, nextBuffer);
      _scheduleSmartDateTypingReset(dateEl);
      return true;
    }

    if (segment === 1) {
      if (!/^[a-zA-Z]$/.test(key)) return false;

      const nextBuffer = `${isNewSequence ? '' : smartDateTyping.buffer}${key.toLowerCase()}`.slice(0, 9);
      const matches = MONTH_NAMES
        .map((name, index) => ({ name, monthNumber: index + 1 }))
        .filter(item => item.name.toLowerCase().startsWith(nextBuffer));

      if (matches.length === 0) return false;

      smartDateTyping.segment = segment;
      smartDateTyping.buffer = nextBuffer;

      if (matches.length === 1) {
        _updateSmartDate(dateEl, year, matches[0].monthNumber, day, segment);
        _setSmartDatePending(dateEl, segment, matches[0].name);
      } else {
        _setSmartDatePending(dateEl, segment, nextBuffer.charAt(0).toUpperCase() + nextBuffer.slice(1));
      }

      _scheduleSmartDateTypingReset(dateEl);
      return true;
    }

    if (segment === 2) {
      if (!/^\d$/.test(key)) return false;

      const nextBuffer = `${isNewSequence ? '' : smartDateTyping.buffer}${key}`.slice(0, 4);
      smartDateTyping.segment = segment;
      smartDateTyping.buffer = nextBuffer;

      if (nextBuffer.length === 4) {
        _updateSmartDate(dateEl, Number.parseInt(nextBuffer, 10), month, day, segment);
        _resetSmartDateTyping(dateEl);
        return true;
      }

      _setSmartDatePending(dateEl, segment, nextBuffer);
      _scheduleSmartDateTypingReset(dateEl);
      return true;
    }

    return false;
  }

  /* ── Global keyboard handler ── */
  const keyHandler = async (e) => {
    // Only handle if we're within the quick-add page
    if (!root.querySelector('.ft-quick-add-page')) {
      document.removeEventListener('keydown', keyHandler);
      return;
    }

    if (phase === 'idle') return;

    /* ── Ctrl+B: go back to the previous step ── */
    if (e.ctrlKey && e.key === 'b') {
      e.preventDefault();
      if (phase === 'input' || phase === 'review') {
        _goBackOneStep();
      }
      return;
    }

    /* ── Success phase ── */
    if (phase === 'success') {
      if (e.key === 'Enter') {
        e.preventDefault();
        _resetForNextEntry();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        _finishSession();
      }
      return;
    }

    /* ── Review phase ── */
    if (phase === 'review') {
      if (e.key === 'Enter') {
        e.preventDefault();
        await _saveCurrentReview();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        _resetForNextEntry();
      }
      return;
    }

    /* ── Input phase ── */
    if (phase !== 'input') return;

    const step = flow.currentStep();
    if (!step) return;

    /* Smart date: segment-based arrow key navigation */
    if (step.inputType === 'smart-date') {
      const mobileDatePickerHost = flowEl.querySelector('[data-qa-date-picker-host]');
      if (mobileDatePickerHost instanceof HTMLElement) {
        if (e.key === 'Enter') {
          e.preventDefault();
          _advanceStep(mobileDatePickerHost.dataset.value || '');
        }
        return;
      }

      const popupEl = _getSmartDatePopupEl();
      if (popupEl && popupEl.contains(e.target)) {
        if (e.key === 'Escape') {
          e.preventDefault();
          _closeSmartDatePopup();
          _getSmartDateEl()?.focus();
        }
        return;
      }

      const dateEl = _getSmartDateEl();
      if (!dateEl) return;
      const { year, month, day, segment } = _smartDateValues(dateEl);

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        _resetSmartDateTyping(dateEl);
        _updateSmartDate(dateEl, year, month, day, Math.max(0, segment - 1));
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        _resetSmartDateTyping(dateEl);
        _updateSmartDate(dateEl, year, month, day, Math.min(2, segment + 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        _resetSmartDateTyping(dateEl);
        if (segment === 0) _updateSmartDate(dateEl, year, month, Math.min(_daysInMonth(year, month), day + 1), segment);
        else if (segment === 1) _updateSmartDate(dateEl, year, month + 1, day, segment);
        else _updateSmartDate(dateEl, year + 1, month, day, segment);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        _resetSmartDateTyping(dateEl);
        if (segment === 0) _updateSmartDate(dateEl, year, month, Math.max(1, day - 1), segment);
        else if (segment === 1) _updateSmartDate(dateEl, year, month - 1, day, segment);
        else _updateSmartDate(dateEl, year - 1, month, day, segment);
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        if (!smartDateTyping.buffer || smartDateTyping.segment !== segment) {
          _resetSmartDateTyping(dateEl);
          return;
        }

        smartDateTyping.buffer = smartDateTyping.buffer.slice(0, -1);
        if (!smartDateTyping.buffer) {
          _resetSmartDateTyping(dateEl);
          return;
        }

        if (segment === 1) {
          const matches = MONTH_NAMES
            .map((name, index) => ({ name, monthNumber: index + 1 }))
            .filter(item => item.name.toLowerCase().startsWith(smartDateTyping.buffer));
          if (matches.length === 1) {
            _updateSmartDate(dateEl, year, matches[0].monthNumber, day, segment);
            _setSmartDatePending(dateEl, segment, matches[0].name);
          } else {
            _setSmartDatePending(dateEl, segment, smartDateTyping.buffer.charAt(0).toUpperCase() + smartDateTyping.buffer.slice(1));
          }
        } else {
          _setSmartDatePending(dateEl, segment, smartDateTyping.buffer);
        }

        _scheduleSmartDateTypingReset(dateEl);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        _resetSmartDateTyping(dateEl);
        _advanceStep(_smartDateIso(dateEl));
        return;
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey && _applySmartDateTypedKey(dateEl, e.key)) {
        e.preventDefault();
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
  flowEl.addEventListener('click', async e => {
    const action = e.target.closest('[data-qa-action]')?.dataset.qaAction;
    if (action) {
      if (action === 'save' && phase === 'review') {
        await _saveCurrentReview();
        return;
      }
      if (action === 'edit' && phase === 'review') {
        _goBackOneStep();
        return;
      }
      if (action === 'add-another' && phase === 'success') {
        _resetForNextEntry();
        return;
      }
      if (action === 'finish' && phase === 'success') {
        _finishSession();
        return;
      }
      if (phase === 'input') {
        _handleStepAction(action);
      }
      return;
    }

    const smartDate = e.target.closest('.ft-qa-smart-date');
    if (smartDate && phase === 'input') {
      const step = flow.currentStep();
      if (step?.inputType === 'smart-date' && !state.isMobileInteraction) {
        const seg = e.target.closest('.ft-qa-smart-date__seg');
        if (seg) {
          const segIndex = Number.parseInt(seg.dataset.seg || '0', 10);
          const { year, month, day } = _smartDateValues(smartDate);
          _updateSmartDate(smartDate, year, month, day, Number.isFinite(segIndex) ? segIndex : 0);
        }
        _openSmartDatePopup(smartDate);
        return;
      }
    }

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

    /* Filtered select options */
    const option = e.target.closest('.ft-qa-select-option:not(.ft-qa-select-option--empty)');
    if (option && phase === 'input') {
      _advanceStep(option.dataset.id || '');
    }
  });

  const outsideClickHandler = e => {
    if (!root.querySelector('.ft-quick-add-page')) {
      document.removeEventListener('click', outsideClickHandler);
      return;
    }

    const popup = _getSmartDatePopupEl();
    if (!popup) return;

    const smartDate = _getSmartDateEl();
    if (popup.contains(e.target) || smartDate?.contains(e.target)) return;
    _closeSmartDatePopup();
  };

  const routeCleanupHandler = () => {
    setTimeout(() => {
      if (window.location.hash === '#quick-add' && root.querySelector('.ft-quick-add-page')) return;
      if (typeof mobileDatePickerCleanup === 'function') {
        mobileDatePickerCleanup();
        mobileDatePickerCleanup = null;
      }
      document.removeEventListener('keydown', keyHandler);
      document.removeEventListener('click', outsideClickHandler);
      window.removeEventListener('resize', _syncInteractionMode);
      window.removeEventListener('hashchange', routeCleanupHandler);
    }, 0);
  };

  document.addEventListener('keydown', keyHandler);
  document.addEventListener('click', outsideClickHandler);
  window.addEventListener('resize', _syncInteractionMode);
  window.addEventListener('hashchange', routeCleanupHandler);

  /* ── Initial render ── */
  refresh();
}

export { initQuickAddPage };
