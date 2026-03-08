/**
 * Shared AG Grid cell renderer factories.
 *
 * Provides reusable cell renderers for common column types:
 * dates, money amounts, account badges, type badges, category
 * labels, movement-code badges, and action buttons.
 *
 * CSS classes (ft-grid-*) are defined in styles/ag-grid-overrides.css.
 */
import { formatDateDisplay, formatMoneyFromCents, normalizeCurrency } from './formatters.js';

/** Renders an ISO date as "06 Mar. 2026". */
export function dateCellRenderer(params) {
  const formatted = formatDateDisplay(params.value ?? '');
  return formatted ? `<span class="ft-grid-date">${formatted}</span>` : '';
}

/**
 * Factory: renders a cents value with currency formatting.
 * @param {string} valueField    — row data field holding cents (integer)
 * @param {string} currencyField — row data field holding ISO currency code
 */
export function moneyCentsCellRenderer(valueField, currencyField) {
  return params => {
    const cents = params.data?.[valueField];
    const cur = params.data?.[currencyField] ?? '';
    if (cents == null) return '';
    return `<span class="ft-grid-amount">${formatMoneyFromCents(cents, cur)}</span>`;
  };
}

/**
 * Factory: renders account name with uppercase currency badge.
 * @param {string} nameField     — row data field for account name
 * @param {string} currencyField — row data field for ISO currency code
 */
export function accountCellRenderer(nameField, currencyField) {
  return params => {
    const name = params.data?.[nameField] ?? '';
    const cur = normalizeCurrency(params.data?.[currencyField] ?? '');
    if (!name) return '';
    return `<span class="ft-grid-account">${name}<span class="ft-grid-account__currency">${cur}</span></span>`;
  };
}

/** Renders "Income" / "Expense" as a colour-coded badge. */
export function typeBadgeRenderer(params) {
  const type = params.value;
  if (!type) return '';
  const mod = type === 'Income' ? 'income' : 'expense';
  return `<span class="ft-grid-type ft-grid-type--${mod}">${type}</span>`;
}

/**
 * Renders category (+ optional sub-category) in one cell.
 * Shows "Category › Sub" when both are present.
 */
export function categoryCellRenderer(params) {
  const cat = params.data?.category ?? '';
  const sub = params.data?.sub_category ?? '';
  if (!cat) return '';
  if (!sub) return `<span class="ft-grid-category">${cat}</span>`;
  return `<span class="ft-grid-category">${cat}<span class="ft-grid-category__sep">›</span><span class="ft-grid-category__sub">${sub}</span></span>`;
}

/**
 * Renders a category name with a type-coloured vertical bar indicator.
 * Works with resolved text data (field: 'category') + the row's 'type' field.
 * CSS: .ft-grid-cat in ag-grid-overrides.css.
 */
export function styledCategoryCellRenderer(params) {
  const cat = params.data?.category ?? '';
  if (!cat) return '';
  const type = params.data?.type || 'Expense';
  const mod = type === 'Income' ? 'ft-grid-cat--income' : 'ft-grid-cat--expense';
  return `<span class="ft-grid-cat ${mod}"><span class="ft-grid-cat__bar"></span>${cat}</span>`;
}

/**
 * Renders a sub-category name with a dimmed type-coloured bar indicator.
 * Works with resolved text data (field: 'sub_category') + the row's 'type' field.
 */
export function styledSubCategoryCellRenderer(params) {
  const sub = params.data?.sub_category ?? '';
  if (!sub) return '';
  const type = params.data?.type || 'Expense';
  const mod = type === 'Income' ? 'ft-grid-cat--income' : 'ft-grid-cat--expense';
  return `<span class="ft-grid-cat ${mod} ft-grid-cat--sub"><span class="ft-grid-cat__bar"></span>${sub}</span>`;
}

/**
 * Renders a movement_code as a clickable badge.
 * Emits data-action="filter-code" for event delegation.
 */
export function movementCodeRenderer(params) {
  const code = params.value;
  if (!code) return '';
  return `<button class="ft-grid-code" data-action="filter-code" title="Show related movements">${code}</button>`;
}

/**
 * Factory: renders a value converted to a target currency using FX rates.
 * The rates object keys are uppercase ISO currency codes, values are per-USD.
 *
 * @param {string} valueField    — row field for cents value
 * @param {string} currencyField — row field for the row's currency code
 * @param {object} rates         — { MXN: 17.5, GEL: 2.72, … } (base = USD → rate 1)
 * @param {string} targetCurrency — target currency code (e.g. 'USD')
 */
export function convertedAmountRenderer(valueField, currencyField, rates, targetCurrency) {
  const tgt = normalizeCurrency(targetCurrency);
  const tgtRate = rates[tgt] ?? 1;

  return params => {
    const cents = params.data?.[valueField];
    const src = normalizeCurrency(params.data?.[currencyField] ?? '');
    if (cents == null || !src) return '';

    if (src === tgt) {
      return `<span class="ft-grid-amount ft-grid-amount--converted">${formatMoneyFromCents(cents, tgt)}</span>`;
    }

    const srcRate = rates[src];
    if (!srcRate) return '<span class="ft-grid-amount ft-grid-amount--converted">—</span>';

    const converted = Math.round(cents * tgtRate / srcRate);
    return `<span class="ft-grid-amount ft-grid-amount--converted">${formatMoneyFromCents(converted, tgt)}</span>`;
  };
}

/**
 * Renders the cumulative account balance at the movement's date.
 * Shows '—' for inactive (soft-deleted) rows.
 *
 * @param {string} currencyField — row data field holding ISO currency code
 */
export function balanceCellRenderer(currencyField) {
  return params => {
    if (!params.data) return '';
    const balance = params.data.balance_at_date;
    const cur = params.data[currencyField] ?? '';
    if (balance == null) return '<span class="ft-grid-amount ft-grid-amount--balance-na">—</span>';
    return `<span class="ft-grid-amount ft-grid-amount--balance">${formatMoneyFromCents(balance, cur)}</span>`;
  };
}

/**
 * Factory: renders a row of icon action buttons (edit, delete, etc.).
 * Each button emits a `data-action` attribute for event delegation.
 *
 * @param {Array<{id: string, icon: string, title?: string, variant?: 'danger'}>} actions
 */
export function actionsCellRenderer(actions) {
  return params => {
    if (!params.data) return '';
    const btns = actions.map(a => {
      const cls = a.variant === 'danger' ? ' ft-grid-actions__btn--danger' : '';
      return `<button class="ft-grid-actions__btn${cls}" data-action="${a.id}" title="${a.title || a.id}">
        <span class="material-symbols-outlined">${a.icon}</span>
      </button>`;
    }).join('');
    return `<span class="ft-grid-actions">${btns}</span>`;
  };
}
