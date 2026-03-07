/**
 * Quick Add — Rendering helpers.
 *
 * Renders the sequential prompt UI, review card, success state,
 * session tally, and history list.
 */

import { escapeHtml } from '../../utils/formHelpers.js';
import { normalizeCurrency, formatMoneyFromCents, formatMoney } from '../../utils/formatters.js';
import { categoryLabelById, subCategoryLabelById } from '../../utils/lookups.js';

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

  if (phase === 'review') {
    _renderReview(flowEl, flow, state);
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
      html += _renderActiveStep(step, state, values);
    }
    // Future steps are hidden
  }

  flowEl.innerHTML = html;

  // Focus the active input
  requestAnimationFrame(() => {
    const input = flowEl.querySelector('.ft-qa-prompt__input, .ft-qa-type-toggle__btn--active, .ft-qa-invoice-toggle__btn--active');
    if (input) input.focus();
  });
}

function _renderActiveStep(step, state, values) {
  const defaultVal = step.defaultFn ? step.defaultFn() : '';

  if (step.inputType === 'type-toggle') {
    const current = defaultVal || 'Expense';
    return `
      <div class="ft-qa-prompt" data-step="${step.key}">
        <span class="ft-qa-prompt__label">${step.label}</span>
        <span class="ft-qa-prompt__chevron material-symbols-outlined">chevron_right</span>
        <div class="ft-qa-type-toggle" id="qa-type-toggle">
          <button class="ft-qa-type-toggle__btn ft-qa-type-toggle__btn--expense${current === 'Expense' ? ' ft-qa-type-toggle__btn--active' : ''}" data-value="Expense" tabindex="0">
            <kbd>E</kbd> Expense
          </button>
          <button class="ft-qa-type-toggle__btn ft-qa-type-toggle__btn--income${current === 'Income' ? ' ft-qa-type-toggle__btn--active' : ''}" data-value="Income" tabindex="0">
            <kbd>I</kbd> Income
          </button>
        </div>
      </div>`;
  }

  if (step.inputType === 'yn-toggle') {
    return `
      <div class="ft-qa-prompt" data-step="${step.key}">
        <span class="ft-qa-prompt__label">${step.label}</span>
        <span class="ft-qa-prompt__chevron material-symbols-outlined">chevron_right</span>
        <div class="ft-qa-invoice-toggle" id="qa-invoice-toggle">
          <button class="ft-qa-invoice-toggle__btn ft-qa-invoice-toggle__btn--active" data-value="0" tabindex="0">
            <kbd>N</kbd> No
          </button>
          <button class="ft-qa-invoice-toggle__btn" data-value="1" tabindex="0">
            <kbd>Y</kbd> Yes
          </button>
        </div>
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
          <input class="ft-qa-prompt__input" type="text" placeholder="Type to filter… (Enter to skip)" autocomplete="off" data-select-input="true" />
          <div class="ft-qa-select-dropdown" id="qa-select-dropdown">${optionsHtml}</div>
        </div>
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
        ${step.inputType === 'number' ? 'inputmode="decimal"' : ''}
        autocomplete="off"
      />
    </div>`;
}

/* ── Review Card ──────────────────────────────────────────── */

function _renderReview(flowEl, flow, state) {
  const values = flow.getValues();
  const account = state.accounts.find(a => Number(a.id) === Number(state.selectedAccountId));
  const currency = normalizeCurrency(account?.currency);

  const catLabel = values.category_id
    ? categoryLabelById(state.categories, values.category_id)
    : '—';
  const subLabel = values.sub_category_id
    ? subCategoryLabelById(state.subCategories, values.sub_category_id)
    : '—';

  flowEl.innerHTML = `
    <div class="ft-qa-review">
      <h3 class="ft-qa-review__title">Review & Save</h3>
      <div class="ft-qa-review__grid">
        <span class="ft-qa-review__label">Movement</span>
        <span class="ft-qa-review__value">${escapeHtml(values.movement)}</span>
        <span class="ft-qa-review__label">Date</span>
        <span class="ft-qa-review__value">${escapeHtml(values.date)}</span>
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
        <span class="ft-qa-review__label">Invoice</span>
        <span class="ft-qa-review__value">${values.invoice ? 'Yes' : 'No'}</span>
      </div>
      <p class="ft-qa-review__hint">Press <kbd>Enter</kbd> to save · <kbd>Esc</kbd> to start over</p>
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
      <span class="ft-qa-success__hint">Press <kbd>Enter</kbd> to add another · <kbd>Esc</kbd> to finish</span>
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
      <span class="ft-qa-history-item__date">${escapeHtml(item.date)}</span>
      <span class="ft-qa-history-item__amount">${formatMoney(item.amount, currency)}</span>
    </div>`).join('');

  historyEl.innerHTML = `
    <h3 class="ft-small ft-text-muted" style="margin:0 0 4px; text-transform:uppercase; letter-spacing:0.4px; font-weight:600">Recent</h3>
    <div class="ft-qa-history-list">${items}</div>`;
}

/* ── Helpers ──────────────────────────────────────────────── */

function _formatDisplayValue(step, value, state) {
  if (value === null || value === undefined) return '(skipped)';
  if (step.key === 'category_id') return categoryLabelById(state.categories, value) || '—';
  if (step.key === 'sub_category_id') return subCategoryLabelById(state.subCategories, value) || '—';
  if (step.key === 'invoice') return value ? 'Yes' : 'No';
  return String(value);
}

export { renderAccountToolbar, renderTally, renderFlow, renderHistory };
