/**
 * Shared form-component helpers.
 *
 * Extracted from movementForm.js, movementModal.js, and transferForm.js
 * to eliminate private-helper duplication across form components.
 *
 * All exports are pure functions / constants — no side-effects.
 */

import { formatMoney, normalizeCurrency } from './formatters.js';
import {
  getCategoriesByType,
  getSubCategoriesByTypeAndCategory,
} from './lookups.js';

// ── Number formatting ─────────────────────────────────────────────────────────

/**
 * Intl formatter for plain decimal display (no currency symbol).
 * Example: 1234.5 → "1,234.50"
 */
export const PLAIN_FMT = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Strips all characters except digits, dots, and minus signs.
 * Used to sanitise user-typed amounts before parsing.
 * @param {*} v
 * @returns {string}
 */
export function stripNumeric(v) {
  return String(v).replace(/[^0-9.\-]/g, '');
}

/**
 * Converts a displayed amount string to a positive integer in cents.
 * Returns null for values that are invalid, zero, or negative.
 * @param {string} v
 * @returns {number|null}
 */
export function toCents(v) {
  const n = parseFloat(stripNumeric(v));
  return (!isNaN(n) && n > 0) ? Math.round(n * 100) : null;
}

/**
 * Strips currency formatting back to a plain decimal string for editing.
 * Example: "$1,234.50 MXN" → "1234.50"
 * @param {string} value
 * @returns {string}
 */
export function rawAmount(value) {
  const n = parseFloat(stripNumeric(value));
  if (isNaN(n)) return '';
  return n.toFixed(2);
}

/**
 * Formats a raw amount string for display.
 * Applies currency symbol + thousand-separators when a currency code is
 * provided; falls back to plain number formatting otherwise.
 * @param {string} value
 * @param {string} [currency]
 * @returns {string}
 */
export function formatAmountDisplay(value, currency) {
  const n = parseFloat(stripNumeric(value));
  if (isNaN(n) || n <= 0) return value;
  return currency ? formatMoney(n, currency) : PLAIN_FMT.format(n);
}

// ── HTML helpers ──────────────────────────────────────────────────────────────

/**
 * Escapes HTML special characters for safe insertion into element content
 * and quoted attributes.
 * @param {*} v
 * @returns {string}
 */
export function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Account helpers ───────────────────────────────────────────────────────────

/**
 * Finds an account object by ID.
 * @param {object[]} accounts
 * @param {number|string} id
 * @returns {object|undefined}
 */
export function findAccount(accounts, id) {
  return accounts.find(a => a.id === Number(id));
}

/**
 * Builds <option> HTML for an account <select>.
 *
 * @param {object[]}       accounts
 * @param {number|string}  [selectedId]   - Pre-selected account ID.
 * @param {boolean}        [blank=true]   - Whether to include a blank "Select account" option.
 * @returns {string}
 */
export function buildAccountOptions(accounts, selectedId, blank = true) {
  const blankOpt = blank ? '<option value="">Select account</option>' : '';
  return (
    blankOpt +
    accounts
      .map(a => {
        const sel =
          selectedId !== undefined && a.id === Number(selectedId) ? ' selected' : '';
        return `<option value="${a.id}"${sel}>${escapeHtml(a.account)} (${normalizeCurrency(a.currency)})</option>`;
      })
      .join('')
  );
}

// ── Category helpers ──────────────────────────────────────────────────────────

/**
 * Builds <option> HTML for a category <select>.
 * Always prepends a blank "—" option.
 *
 * @param {object[]}      categories
 * @param {string}        [type]       - 'Income' | 'Expense' filter.
 * @param {number|string} [selectedId] - Pre-selected category ID.
 * @returns {string}
 */
export function buildCategoryOptions(categories, type, selectedId) {
  const filtered = type ? getCategoriesByType(categories, type) : categories;
  return (
    '<option value="">—</option>' +
    filtered
      .map(c => {
        const sel =
          selectedId !== undefined && c.id === Number(selectedId) ? ' selected' : '';
        return `<option value="${c.id}"${sel}>${escapeHtml(c.category)}</option>`;
      })
      .join('')
  );
}

/**
 * Builds <option> HTML for a sub-category <select>.
 * Returns only the blank option when no categoryId is provided.
 * Always prepends a blank "—" option.
 *
 * @param {object[]}      subCategories
 * @param {string}        [type]        - 'Income' | 'Expense' filter.
 * @param {number|string} [categoryId]  - Parent category ID filter.
 * @param {number|string} [selectedId]  - Pre-selected sub-category ID.
 * @returns {string}
 */
export function buildSubCategoryOptions(subCategories, type, categoryId, selectedId) {
  const filtered = categoryId
    ? getSubCategoriesByTypeAndCategory(subCategories, type, categoryId)
    : [];
  return (
    '<option value="">—</option>' +
    filtered
      .map(s => {
        const sel =
          selectedId !== undefined && s.id === Number(selectedId) ? ' selected' : '';
        return `<option value="${s.id}"${sel}>${escapeHtml(s.sub_category)}</option>`;
      })
      .join('')
  );
}
