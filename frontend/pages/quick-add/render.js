/**
 * Quick Add — Rendering helpers.
 *
 * Renders the sequential prompt UI, review card, success state,
 * session tally, and history list.
 */

import { escapeHtml } from '../../utils/formHelpers.js';
import { normalizeCurrency, formatMoneyFromCents, formatMoney } from '../../utils/formatters.js';
import { categoryLabelById, subCategoryLabelById } from '../../utils/lookups.js';
import { InfoCard } from '../../components/dumb/infoCard/infoCard.js';

/* ── Months lookup ────────────────────────────────────────── */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function _formatSmartDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MONTH_NAMES[m - 1]} ${y}`;
}

/* ── Account Toolbar ──────────────────────────────────────── */

function renderAccountToolbar(toolbarEl, state) {
  if (!state.accounts.length) {
    toolbarEl.innerHTML = '<span class="ft-small ft-text-muted">No active bank accounts available.</span>';
    return;
  }

  if (state.accountLocked) {
    const account = state.accounts.find(a => Number(a.id) === Number(state.selectedAccountId));
    const currency = normalizeCurrency(account?.currency);
    toolbarEl.innerHTML = `
      <div class="ft-quick-add-toolbar__left">
        <span class="ft-quick-add-toolbar__label">Account</span>
        <span class="ft-quick-add-toolbar__locked">
          <span class="material-symbols-outlined" aria-hidden="true">lock</span>
          ${escapeHtml(account?.account)} · ${escapeHtml(account?.owner)} · ${currency}
        </span>
        <button class="ft-quick-add-toolbar__change-btn" id="qa-change-account">Change</button>
      </div>`;
    return;
  }

  const optionsHtml = state.accounts
    .map(a => {
      const selected = Number(a.id) === Number(state.selectedAccountId) ? 'selected' : '';
      const currency = normalizeCurrency(a.currency);
      return `<option value="${a.id}" ${selected}>${escapeHtml(a.account)} · ${escapeHtml(a.owner)} · ${currency}</option>`;
    })
    .join('');

  toolbarEl.innerHTML = `
    <div class="ft-quick-add-toolbar__left">
      <span class="ft-quick-add-toolbar__label">Account</span>
      <select id="qa-account-select" class="ft-quick-add-toolbar__select">${optionsHtml}</select>
      <button class="ft-btn ft-btn--primary ft-btn--sm" id="qa-lock-account">
        <span class="material-symbols-outlined" aria-hidden="true">bolt</span>
        Start Adding
      </button>
    </div>`;
}

/* ── Account Info Panel (balance cards) ───────────────────── */

function renderAccountPanel(panelEl, state) {
  if (!panelEl) return;
  panelEl.innerHTML = '';

  if (!state.accountLocked) return;

  const account = state.accounts.find(a => Number(a.id) === Number(state.selectedAccountId));
  if (!account) return;

  const balance = Number(account.total_balance ?? 0);
  const currency = normalizeCurrency(account.currency);
  const actualBalance = _getActualBalanceCents(state, account.id);
  const difference = actualBalance === null ? null : actualBalance - balance;

  panelEl.appendChild(
    InfoCard.createElement(
      {
        icon: 'account_balance',
        label: 'Current Balance',
        value: formatMoneyFromCents(balance, currency),
        subValue: `${account.account} · ${account.owner}`,
        note: `Currency ${currency}`,
      },
      { variant: 'default' },
    ),
  );

  panelEl.appendChild(_createReconcileCard(currency, actualBalance, difference));
}

function syncAccountPanel(panelEl, state, options = {}) {
  if (!panelEl) return;

  const account = state.accounts.find(a => Number(a.id) === Number(state.selectedAccountId));
  if (!account) return;

  const balance = Number(account.total_balance ?? 0);
  const currency = normalizeCurrency(account.currency);
  const actualBalance = _getActualBalanceCents(state, account.id);
  const difference = actualBalance === null ? null : actualBalance - balance;

  const inputEl = panelEl.querySelector('[data-qa-actual-balance-input]');
  if (inputEl && options.updateInput !== false) {
    inputEl.value = actualBalance === null ? '' : _formatEditableAmount(actualBalance);
  }

  const reconcileCard = panelEl.querySelector('[data-qa-reconcile-card]');
  const diffValueEl = panelEl.querySelector('[data-qa-difference-value]');
  const diffSubValueEl = panelEl.querySelector('[data-qa-difference-sub-value]');
  const diffNoteEl = panelEl.querySelector('[data-qa-difference-note]');
  const currencyEl = panelEl.querySelector('[data-qa-actual-balance-currency]');

  if (reconcileCard) reconcileCard.dataset.variant = _getDifferenceVariant(difference);
  if (currencyEl) currencyEl.textContent = currency;
  if (diffValueEl) {
    diffValueEl.textContent = difference === null
      ? '—'
      : `${difference > 0 ? '+' : ''}${formatMoneyFromCents(difference, currency)}`;
  }
  if (diffSubValueEl) {
    diffSubValueEl.textContent = difference === null
      ? 'Actual balance not entered'
      : 'Actual balance minus current balance';
  }
  if (diffNoteEl) {
    diffNoteEl.textContent = difference === null
      ? 'Enter the balance from your bank app to compare.'
      : difference === 0
        ? 'Matches your bank app.'
        : 'Non-zero means there are movements still missing or mismatched.';
  }
}

function parseActualBalanceInput(value) {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/,/g, '')
    .replace(/[^0-9.\-]/g, '');

  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') return null;

  const amount = Number.parseFloat(cleaned);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function formatActualBalanceInput(cents) {
  return cents === null ? '' : _formatEditableAmount(cents);
}

function getActualBalanceInputValue(state) {
  const account = state.accounts.find(a => Number(a.id) === Number(state.selectedAccountId));
  if (!account) return '';
  return formatActualBalanceInput(_getActualBalanceCents(state, account.id));
}

/* ── Session Tally ────────────────────────────────────────── */

function renderTally(tallyEl, sessionStats) {
  if (!tallyEl) return;
  if (sessionStats.count === 0) {
    tallyEl.innerHTML = '';
    return;
  }

  const currency = sessionStats.currency || 'USD';
  tallyEl.innerHTML = `
    <span class="ft-quick-add-tally__stat ft-quick-add-tally__stat--highlight">
      <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
      ${sessionStats.count} movement${sessionStats.count === 1 ? '' : 's'} added
    </span>
    <span class="ft-quick-add-tally__stat">
      Total: ${formatMoneyFromCents(sessionStats.totalCents, currency)}
    </span>`;
}

/* ── Flow Prompts ─────────────────────────────────────────── */

function renderFlow(flowEl, flow, state, phase) {
  if (!flowEl) return;

  if (phase === 'idle') {
    flowEl.innerHTML = `
      <div class="ft-empty">
        <span class="ft-empty__icon material-symbols-outlined" aria-hidden="true">bolt</span>
        <p class="ft-small">Select an account and press "Start Adding" to begin</p>
      </div>`;
    return;
  }

  if (phase === 'review' || phase === 'saving') {
    _renderReview(flowEl, flow, state, { isSaving: phase === 'saving' });
    return;
  }

  if (phase === 'success') {
    _renderSuccess(flowEl, flow, state);
    return;
  }

  // phase === 'input'
  const steps = flow.allSteps();
  const currentIdx = flow.currentIndex();
  const values = flow.getValues();
  let html = '';

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    if (i < currentIdx) {
      // Completed step
      const display = _formatDisplayValue(step, values[step.key], state);
      html += `
        <div class="ft-qa-prompt ft-qa-prompt--done">
          <span class="ft-qa-prompt__label">${step.label}</span>
          <span class="ft-qa-prompt__chevron material-symbols-outlined">check</span>
          <span class="ft-qa-prompt__value">${escapeHtml(display)}</span>
        </div>`;
    } else if (i === currentIdx) {
      // Active step
      html += _renderActiveStep(step, state, values, {
        canGoBack: currentIdx > 0,
      });
    }
    // Future steps are hidden
  }

  flowEl.innerHTML = html;

  // Focus the active input
  requestAnimationFrame(() => {
    const activePrompt = flowEl.querySelector('.ft-qa-prompt[data-step]');
    if (state.isMobileInteraction) {
      activePrompt?.scrollIntoView({ block: 'nearest' });
    }

    const smartDate = flowEl.querySelector('.ft-qa-smart-date');
    if (smartDate && !state.isMobileInteraction) {
      smartDate.focus();
      return;
    }

    if (state.isMobileInteraction && flowEl.querySelector('[data-qa-date-picker-host]')) {
      return;
    }

    const input = flowEl.querySelector('.ft-qa-prompt__input, .ft-qa-type-toggle__btn--active, .ft-qa-invoice-toggle__btn--active');
    if (!input) return;

    input.focus();
  });
}

function _renderActiveStep(step, state, values, options = {}) {
  const defaultVal = step.defaultFn ? step.defaultFn() : '';
  const isMobile = Boolean(state.isMobileInteraction);
  const actionBar = isMobile
    ? _renderMobileStepActions({
      canGoBack: options.canGoBack,
      canSkip: !step.required,
    })
    : '';

  if (step.inputType === 'type-toggle') {
    const current = defaultVal || 'Expense';
    const expenseLabel = isMobile ? 'Expense' : '<kbd>E</kbd> Expense';
    const incomeLabel = isMobile ? 'Income' : '<kbd>I</kbd> Income';
    return `
      <div class="ft-qa-prompt" data-step="${step.key}">
        <span class="ft-qa-prompt__label">${step.label}</span>
        <span class="ft-qa-prompt__chevron material-symbols-outlined">chevron_right</span>
        <div class="ft-qa-type-toggle" id="qa-type-toggle">
          <button type="button" class="ft-qa-type-toggle__btn ft-qa-type-toggle__btn--expense${current === 'Expense' ? ' ft-qa-type-toggle__btn--active' : ''}" data-value="Expense" tabindex="0">
            ${expenseLabel}
          </button>
          <button type="button" class="ft-qa-type-toggle__btn ft-qa-type-toggle__btn--income${current === 'Income' ? ' ft-qa-type-toggle__btn--active' : ''}" data-value="Income" tabindex="0">
            ${incomeLabel}
          </button>
        </div>
        ${isMobile ? '<span class="ft-qa-mobile-hint ft-small ft-text-muted">Tap a type to continue.</span>' : ''}
      </div>`;
  }

  if (step.inputType === 'filtered-select') {
    const options = step.optionsFn ? step.optionsFn(state, values) : [];
    const optionsHtml = options.length === 0
      ? '<div class="ft-qa-select-option ft-qa-select-option--empty">No options available</div>'
      : options.map((o, i) =>
        `<div class="ft-qa-select-option${i === 0 ? ' ft-qa-select-option--highlighted' : ''}" data-id="${o.id}">${escapeHtml(o.label)}</div>`
      ).join('');

    return `
      <div class="ft-qa-prompt" data-step="${step.key}">
        <span class="ft-qa-prompt__label">${step.label}</span>
        <span class="ft-qa-prompt__chevron material-symbols-outlined">chevron_right</span>
        <div class="ft-qa-select-wrap">
          <input class="ft-qa-prompt__input" type="text" placeholder="Type to filter…${step.required ? '' : ' (blank skips)'}" autocomplete="off" data-select-input="true" enterkeyhint="next" />
          <div class="ft-qa-select-dropdown" id="qa-select-dropdown">${optionsHtml}</div>
        </div>
        ${actionBar}
      </div>`;
  }

  if (step.inputType === 'smart-date' && isMobile) {
    const iso = defaultVal || new Date().toISOString().slice(0, 10);
    return `
      <div class="ft-qa-prompt" data-step="${step.key}">
        <span class="ft-qa-prompt__label">${step.label}</span>
        <span class="ft-qa-prompt__chevron material-symbols-outlined">chevron_right</span>
        <div class="ft-qa-date-picker-host" data-qa-date-picker-host data-value="${escapeHtml(iso)}"></div>
        <span class="ft-qa-mobile-hint ft-small ft-text-muted">Use your phone’s date picker, then continue.</span>
        ${actionBar}
      </div>`;
  }

  /* Smart date input: segmented DD MONTH YYYY with arrow key navigation */
  if (step.inputType === 'smart-date') {
    const iso = defaultVal || new Date().toISOString().slice(0, 10);
    const [y, m, d] = iso.split('-').map(Number);
    return `
      <div class="ft-qa-prompt" data-step="${step.key}">
        <span class="ft-qa-prompt__label">${step.label}</span>
        <span class="ft-qa-prompt__chevron material-symbols-outlined">chevron_right</span>
        <div class="ft-qa-smart-date" tabindex="0" data-year="${y}" data-month="${m}" data-day="${d}" data-segment="0">
          <span class="ft-qa-smart-date__seg ft-qa-smart-date__seg--active" data-seg="0">${String(d).padStart(2, '0')}</span>
          <span class="ft-qa-smart-date__sep"> </span>
          <span class="ft-qa-smart-date__seg" data-seg="1">${MONTH_NAMES[m - 1]}</span>
          <span class="ft-qa-smart-date__sep"> </span>
          <span class="ft-qa-smart-date__seg" data-seg="2">${y}</span>
        </div>
        <span class="ft-qa-smart-date-hint ft-small ft-text-muted">
          click to open calendar · <kbd>←</kbd><kbd>→</kbd> segment · <kbd>↑</kbd><kbd>↓</kbd> change · type <kbd>04</kbd> or <kbd>February</kbd> · <kbd>Enter</kbd> confirm
        </span>
      </div>`;
  }

  /* Amount input with currency label */
  if (step.inputType === 'number') {
    const account = state.accounts.find(a => Number(a.id) === Number(state.selectedAccountId));
    const currency = normalizeCurrency(account?.currency);
    return `
      <div class="ft-qa-prompt" data-step="${step.key}">
        <span class="ft-qa-prompt__label">${step.label}</span>
        <span class="ft-qa-prompt__chevron material-symbols-outlined">chevron_right</span>
        <div class="ft-qa-amount-wrap">
          <input
            class="ft-qa-prompt__input ft-qa-prompt__input--amount"
            type="${isMobile ? 'number' : 'text'}"
            value=""
            placeholder="0.00"
            inputmode="decimal"
            step="0.01"
            autocomplete="off"
            enterkeyhint="next"
          />
          <span class="ft-qa-amount-currency">${escapeHtml(currency)}</span>
        </div>
        ${actionBar}
      </div>`;
  }

  return `
    <div class="ft-qa-prompt" data-step="${step.key}">
      <span class="ft-qa-prompt__label">${step.label}</span>
      <span class="ft-qa-prompt__chevron material-symbols-outlined">chevron_right</span>
      <input
        class="ft-qa-prompt__input"
        type="text"
        value="${escapeHtml(defaultVal)}"
        placeholder="${escapeHtml(step.placeholder || '')}"
        autocomplete="off"
        enterkeyhint="next"
      />
      ${actionBar}
    </div>`;
}

/* ── Review Card ──────────────────────────────────────────── */

function _renderReview(flowEl, flow, state, options = {}) {
  const values = flow.getValues();
  const account = state.accounts.find(a => Number(a.id) === Number(state.selectedAccountId));
  const currency = normalizeCurrency(account?.currency);
  const isSaving = Boolean(options.isSaving);

  const catLabel = values.category_id
    ? categoryLabelById(state.categories, values.category_id)
    : '—';
  const subLabel = values.sub_category_id
    ? subCategoryLabelById(state.subCategories, values.sub_category_id)
    : '—';
  const repLabel = values.repetitive_movement_id
    ? (state.repetitiveMovements || []).find(rm => Number(rm.id) === Number(values.repetitive_movement_id))?.movement || '—'
    : '—';

  flowEl.innerHTML = `
    <div class="ft-qa-review">
      <h3 class="ft-qa-review__title">Review & Save</h3>
      <div class="ft-qa-review__grid">
        <span class="ft-qa-review__label">Movement</span>
        <span class="ft-qa-review__value">${escapeHtml(values.movement)}</span>
        <span class="ft-qa-review__label">Date</span>
        <span class="ft-qa-review__value">${_formatSmartDate(values.date)}</span>
        <span class="ft-qa-review__label">Type</span>
        <span class="ft-qa-review__value">${escapeHtml(values.type)}</span>
        <span class="ft-qa-review__label">Amount</span>
        <span class="ft-qa-review__value">${formatMoney(values.amount, currency)}</span>
        <span class="ft-qa-review__label">Category</span>
        <span class="ft-qa-review__value">${escapeHtml(catLabel)}</span>
        <span class="ft-qa-review__label">Sub-category</span>
        <span class="ft-qa-review__value">${escapeHtml(subLabel)}</span>
        <span class="ft-qa-review__label">Description</span>
        <span class="ft-qa-review__value">${escapeHtml(values.description || '—')}</span>
        <span class="ft-qa-review__label">Repetitive</span>
        <span class="ft-qa-review__value">${escapeHtml(repLabel)}</span>
      </div>
      ${state.isMobileInteraction
        ? `<div class="ft-qa-actions ft-qa-actions--review">
            <button type="button" class="ft-btn ft-btn--ghost" data-qa-action="edit"${isSaving ? ' disabled' : ''}>Back</button>
            <button type="button" class="ft-btn ft-btn--primary" data-qa-action="save"${isSaving ? ' disabled' : ''}>${isSaving ? 'Saving...' : 'Save movement'}</button>
          </div>`
        : `<p class="ft-qa-review__hint">${isSaving ? 'Saving movement…' : 'Press <kbd>Enter</kbd> to save · <kbd>Esc</kbd> to start over'}</p>`}
    </div>`;
}

/* ── Success Card ─────────────────────────────────────────── */

function _renderSuccess(flowEl, flow, state) {
  const values = flow.getValues();
  const account = state.accounts.find(a => Number(a.id) === Number(state.selectedAccountId));
  const currency = normalizeCurrency(account?.currency);

  flowEl.innerHTML = `
    <div class="ft-qa-success">
      <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
      <span class="ft-qa-success__text">
        <b>${escapeHtml(values.movement)}</b> — ${formatMoney(values.amount, currency)} (${escapeHtml(values.type)})
      </span>
      ${state.isMobileInteraction
        ? `<div class="ft-qa-actions ft-qa-actions--success">
            <button type="button" class="ft-btn ft-btn--ghost" data-qa-action="finish">Finish</button>
            <button type="button" class="ft-btn ft-btn--primary" data-qa-action="add-another">Add another</button>
          </div>`
        : '<span class="ft-qa-success__hint">Press <kbd>Enter</kbd> to add another · <kbd>Esc</kbd> to finish</span>'}
    </div>`;
}

/* ── History List ─────────────────────────────────────────── */

function renderHistory(historyEl, history, currency) {
  if (!historyEl) return;
  if (history.length === 0) {
    historyEl.innerHTML = '';
    return;
  }

  const items = history.slice().reverse().map(item => `
    <div class="ft-qa-history-item">
      <span class="ft-qa-history-item__type ft-qa-history-item__type--${item.type.toLowerCase()}">${item.type}</span>
      <span class="ft-qa-history-item__name">${escapeHtml(item.movement)}</span>
      <span class="ft-qa-history-item__date">${_formatSmartDate(item.date)}</span>
      <span class="ft-qa-history-item__amount">${formatMoney(item.amount, currency)}</span>
    </div>`).join('');

  historyEl.innerHTML = `
    <h3 class="ft-small ft-text-muted" style="margin:0 0 4px; text-transform:uppercase; letter-spacing:0.4px; font-weight:600">Recent</h3>
    <div class="ft-qa-history-list">${items}</div>`;
}

/* ── Helpers ──────────────────────────────────────────────── */

function _formatDisplayValue(step, value, state) {
  if (value === null || value === undefined) return '(skipped)';
  if (step.key === 'date') return _formatSmartDate(value);
  if (step.key === 'category_id') return categoryLabelById(state.categories, value) || '—';
  if (step.key === 'sub_category_id') return subCategoryLabelById(state.subCategories, value) || '—';
  if (step.key === 'repetitive_movement_id') {
    if (!value) return '(skipped)';
    return (state.repetitiveMovements || []).find(rm => Number(rm.id) === Number(value))?.movement || '—';
  }
  if (step.key === 'amount') {
    const account = state.accounts.find(a => Number(a.id) === Number(state.selectedAccountId));
    const currency = normalizeCurrency(account?.currency);
    return formatMoney(Number(value), currency);
  }
  return String(value);
}

function renderHints(hintsEl, state, phase) {
  if (!hintsEl) return;

  if (state.isMobileInteraction) {
    if (!state.accountLocked) {
      hintsEl.textContent = 'Pick an account, then use the on-screen buttons to move through each step.';
      return;
    }

    if (phase === 'review') {
      hintsEl.textContent = 'Review the movement, then use Back or Save movement.';
      return;
    }

    if (phase === 'saving') {
      hintsEl.textContent = 'Saving movement...';
      return;
    }

    if (phase === 'success') {
      hintsEl.textContent = 'Use Add another to keep going, or Finish to unlock the account.';
      return;
    }

    hintsEl.textContent = 'Use Back to revisit the previous step. Optional fields can be skipped.';
    return;
  }

  hintsEl.innerHTML = `
    <kbd>Enter</kbd> confirm / next · <kbd>Esc</kbd> skip optional / cancel ·
    <kbd>E</kbd>/<kbd>I</kbd> expense/income · <kbd>↑</kbd><kbd>↓</kbd> navigate options ·
    <kbd>Ctrl</kbd>+<kbd>B</kbd> go back`;
}

function _renderMobileStepActions({ canGoBack, canSkip }) {
  return `
    <div class="ft-qa-actions">
      ${canGoBack ? '<button type="button" class="ft-btn ft-btn--ghost" data-qa-action="back">Back</button>' : ''}
      <button type="button" class="ft-btn ft-btn--primary" data-qa-action="next">${canSkip ? 'Continue' : 'Next'}</button>
    </div>`;
}

function _createReconcileCard(currency, actualBalance, difference) {
  const card = document.createElement('article');
  card.className = 'ft-info-card ft-quick-add-reconcile-card';
  card.dataset.variant = _getDifferenceVariant(difference);
  card.dataset.qaReconcileCard = '';
  card.innerHTML = `
    <header class="ft-info-card__header">
      <div class="ft-info-card__icon-wrap" aria-hidden="true">
        <span class="ft-info-card__icon material-symbols-outlined">edit_square</span>
      </div>
      <span class="ft-info-card__label">Reconcile</span>
    </header>
    <div class="ft-info-card__body">
      <label class="ft-quick-add-reconcile-input" for="qa-actual-balance-input">
        <input
          class="ft-quick-add-reconcile-input__field"
          id="qa-actual-balance-input"
          data-qa-actual-balance-input
          type="text"
          inputmode="decimal"
          placeholder="0.00"
          aria-label="Actual balance"
          value="${actualBalance === null ? '' : _formatEditableAmount(actualBalance)}"
        >
        <span class="ft-quick-add-reconcile-input__currency" data-qa-actual-balance-currency>${currency}</span>
      </label>
      <div class="ft-quick-add-reconcile-result">
        <span class="ft-quick-add-reconcile-result__label">Difference</span>
        <span class="ft-quick-add-reconcile-result__value" data-qa-difference-value>${difference === null
          ? '—'
          : `${difference > 0 ? '+' : ''}${formatMoneyFromCents(difference, currency)}`}</span>
      </div>
      <p class="ft-info-card__sub-value" data-qa-difference-sub-value>${difference === null
        ? 'Actual balance not entered'
        : 'Actual balance minus current balance'}</p>
    </div>
    <footer class="ft-info-card__footer">
      <span class="ft-info-card__note" data-qa-difference-note>${difference === null
        ? 'Enter the balance from your bank app to compare.'
        : difference === 0
          ? 'Matches your bank app.'
          : 'Non-zero means there are movements still missing or mismatched.'}</span>
    </footer>
  `;
  return card;
}

function _getDifferenceVariant(difference) {
  if (difference === null) return 'default';
  return difference === 0 ? 'success' : 'warning';
}

function _formatEditableAmount(cents) {
  return ((Number(cents) || 0) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function _getActualBalanceCents(state, accountId) {
  const key = String(accountId ?? '');
  const value = state.actualBalances?.[key];
  return Number.isFinite(value) ? value : null;
}

export {
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
};
