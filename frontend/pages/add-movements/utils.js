/**
 * Add Movements shared pure utilities.
 * These helpers are intentionally side-effect free to simplify testing/reuse.
 */
import { normalizeCurrency } from './constants.js';

/** Formats cents using the account currency. */
function formatMoneyFromCents(cents, currencyCode) {
  const amount = (Number(cents) || 0) / 100;
  const normalized = normalizeCurrency(currencyCode);

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: normalized || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${normalized || ''}`.trim();
  }
}

/** Validates YYYY-MM-DD dates expected by backend API. */
function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  return !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

/** Parses numeric inputs while preserving empty/null values. */
function parseNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Converts draft amount/type into signed cents impact. */
function toSignedCents(row) {
  const amount = Number(row?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const absCents = Math.round(Math.abs(amount) * 100);
  return row?.type === 'Income' ? absCents : -absCents;
}

/** Finds the currently selected account in state. */
function getSelectedAccount(state) {
  return state.accounts.find(account => Number(account.id) === Number(state.selectedAccountId)) || null;
}

/** Resolves category label by ID for grid display. */
function categoryLabelById(state, id) {
  const match = state.categories.find(item => Number(item.id) === Number(id));
  return match ? match.category : '';
}

/** Resolves sub-category label by ID for grid display. */
function subCategoryLabelById(state, id) {
  const match = state.subCategories.find(item => Number(item.id) === Number(id));
  return match ? match.sub_category : '';
}

/** Returns categories matching the target movement type. */
function getCategoriesByType(state, type) {
  return state.categories.filter(item => item.type === type);
}

/** Returns sub-categories compatible with row type/category. */
function getSubCategoriesForRow(state, row) {
  const type = row?.type;
  const categoryId = Number(row?.category_id);
  return state.subCategories.filter(item => {
    if (item.type !== type) return false;
    if (!Number.isFinite(categoryId)) return true;
    return Number(item.category_id) === categoryId;
  });
}

/** Parses clipboard values into typed grid values per column. */
function parsePastedCellValue(state, columnId, rawValue, rowType, categoryId) {
  const value = String(rawValue ?? '').trim();
  if (!value) return null;

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
  formatMoneyFromCents,
  isValidIsoDate,
  parseNumberOrNull,
  toSignedCents,
  getSelectedAccount,
  categoryLabelById,
  subCategoryLabelById,
  getCategoriesByType,
  getSubCategoriesForRow,
  parsePastedCellValue,
};
