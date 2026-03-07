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
 * Renders a movement_code as a clickable badge.
 * Emits data-action="filter-code" for event delegation.
 */
export function movementCodeRenderer(params) {
  const code = params.value;
  if (!code) return '';
  return `<button class="ft-grid-code" data-action="filter-code" title="Show related movements">${code}</button>`;
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
