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
  getSelectedAccount,
  categoryLabelById,
  subCategoryLabelById,
  getCategoriesByType,
  getSubCategoriesForRow,
  parsePastedCellValue,
};