/**
 * Add Movements page-specific utilities.
 *
 * General-purpose helpers (validation, formatting, lookups) live in
 * shared utils/ modules. This file re-exports what the page needs and
 * adds page-specific helpers like clipboard paste parsing.
 */
import {
  categoryLabelById as _categoryLabelById,
  subCategoryLabelById as _subCategoryLabelById,
  getCategoriesByType as _getCategoriesByType,
  getSubCategoriesByTypeAndCategory,
} from '../../utils/lookups.js';

/** State-aware wrappers that match existing call-sites (pass state, extract the list). */
function categoryLabelById(state, id) {
  return _categoryLabelById(state.categories, id);
}

function subCategoryLabelById(state, id) {
  return _subCategoryLabelById(state.subCategories, id);
}

function getCategoriesByType(state, type) {
  return _getCategoriesByType(state.categories, type);
}

function getSubCategoriesForRow(state, row) {
  return getSubCategoriesByTypeAndCategory(state.subCategories, row?.type, row?.category_id);
}

/** Finds the currently selected account in state. */
function getSelectedAccount(state) {
  return state.accounts.find(account => Number(account.id) === Number(state.selectedAccountId)) || null;
}

/* ── Date Parsing ─────────────────────────────────────────────────────────── */

const MONTH_MAP = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function expandTwoDigitYear(y) {
  return y < 100 ? (y < 50 ? 2000 + y : 1900 + y) : y;
}

function toIsoOrNull(year, month0, day) {
  const d = new Date(Date.UTC(expandTwoDigitYear(year), month0, day));
  if (d.getUTCMonth() !== month0 || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Parses common date strings into ISO YYYY-MM-DD.
 * Accepts: YYYY-MM-DD, DD-Mon-YY(YY), Mon DD YYYY, DD/MM/YY(YY).
 * Returns null when the input cannot be recognised.
 */
function parseDateToIso(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return toIsoOrNull(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  }

  let m = s.match(/^(\d{1,2})[\s/\-]([A-Za-z]{3,9})\.?[\s/\-,]*(\d{2,4})$/);
  if (m) {
    const mon = MONTH_MAP[m[2].slice(0, 3).toLowerCase()];
    if (mon !== undefined) return toIsoOrNull(Number(m[3]), mon, Number(m[1]));
  }

  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s*(\d{2,4})$/);
  if (m) {
    const mon = MONTH_MAP[m[1].slice(0, 3).toLowerCase()];
    if (mon !== undefined) return toIsoOrNull(Number(m[3]), mon, Number(m[2]));
  }

  m = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
  if (m) {
    return toIsoOrNull(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  }

  return null;
}

/** Parses clipboard values into typed grid values per column. */
function parsePastedCellValue(state, columnId, rawValue, rowType, categoryId) {
  const value = String(rawValue ?? '').trim();
  if (!value) return null;

  if (columnId === 'date') {
    return parseDateToIso(value) ?? value;
  }

  if (columnId === 'amount') {
    const num = Number(value.replace(/,/g, ''));
    return Number.isFinite(num) ? num : null;
  }

  if (columnId === 'category_id') {
    const num = Number(value);
    if (Number.isFinite(num) && state.categories.some(item => Number(item.id) === num && item.type === rowType)) {
      return num;
    }
    const byName = state.categories.find(item => item.type === rowType && item.category.toLowerCase() === value.toLowerCase());
    return byName ? Number(byName.id) : null;
  }

  if (columnId === 'sub_category_id') {
    const num = Number(value);
    if (Number.isFinite(num) && state.subCategories.some(item => Number(item.id) === num && item.type === rowType)) {
      return num;
    }
    const byName = state.subCategories.find(item => {
      if (item.type !== rowType) return false;
      if (Number.isFinite(Number(categoryId)) && Number(item.category_id) !== Number(categoryId)) return false;
      return String(item.sub_category || '').toLowerCase() === value.toLowerCase();
    });
    return byName ? Number(byName.id) : null;
  }

  return value;
}

export {
  getSelectedAccount,
  categoryLabelById,
  subCategoryLabelById,
  getCategoriesByType,
  getSubCategoriesForRow,
  parsePastedCellValue,
  parseDateToIso,
};