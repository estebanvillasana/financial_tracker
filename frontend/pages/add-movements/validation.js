/**
 * Add Movements draft validation.
 *
 * Validates individual draft rows and transforms them into
 * the backend payload shape expected by POST /movements/bulk.
 */
import { TYPE_VALUES, isAddRow } from './constants.js';
import { isValidIsoDate, parseNumberOrNull } from './utils.js';

/**
 * Validates one draft row and transforms it into the backend payload shape.
 * Always returns positive cents — the backend handles sign for expenses.
 *
 * @param {object} row        - Draft row data from the grid
 * @param {object} state      - Page state (categories, subCategories)
 * @param {number} accountId  - Target account ID
 * @returns {{ errors: string[], errorFields: string[], payload: object|null }}
 */
function normalizeDraftRow(row, state, accountId) {
  const movement = String(row?.movement || '').trim();
  const amount = Number(row?.amount);
  const type = String(row?.type || '');
  const date = String(row?.date || '');
  const description = String(row?.description || '').trim();
  const categoryId = parseNumberOrNull(row?.category_id);
  const subCategoryId = parseNumberOrNull(row?.sub_category_id);

  const errors = [];
  const errorFields = [];

  if (!movement) { errors.push('Movement is required.'); errorFields.push('movement'); }
  if (!TYPE_VALUES.includes(type)) { errors.push('Type must be Income or Expense.'); errorFields.push('type'); }
  if (!isValidIsoDate(date)) { errors.push('Date must be YYYY-MM-DD.'); errorFields.push('date'); }
  if (!Number.isFinite(amount) || amount <= 0) { errors.push('Amount must be greater than 0.'); errorFields.push('amount'); }

  const category = state.categories.find(item => Number(item.id) === Number(categoryId));
  if (categoryId !== null && !category) { errors.push('Category is invalid.'); errorFields.push('category_id'); }
  if (category && category.type !== type) { errors.push('Category type must match movement type.'); errorFields.push('category_id'); }

  const subCategory = state.subCategories.find(item => Number(item.id) === Number(subCategoryId));
  if (subCategoryId !== null && !subCategory) { errors.push('Sub-category is invalid.'); errorFields.push('sub_category_id'); }
  if (subCategory && categoryId !== null && Number(subCategory.category_id) !== Number(categoryId)) {
    errors.push('Sub-category does not belong to selected category.'); errorFields.push('sub_category_id');
  }
  if (subCategory && subCategory.type !== type) {
    errors.push('Sub-category type must match movement type.'); errorFields.push('sub_category_id');
  }

  if (errors.length > 0) return { errors, errorFields, payload: null };

  const value = Math.round(Math.abs(amount) * 100);

  return {
    errors: [],
    errorFields: [],
    payload: {
      movement,
      description: description || null,
      account_id: Number(accountId),
      value,
      type,
      date,
      category_id: categoryId,
      sub_category_id: subCategoryId,
      repetitive_movement_id: parseNumberOrNull(row?.repetitive_movement_id),
      invoice: 0,
      active: 1,
    },
  };
}

/**
 * Validates all draft rows and returns per-row results for partial commit.
 *
 * @param {object[]} rows      - Draft rows (sentinel excluded)
 * @param {object}   state     - Page state
 * @param {number}   accountId - Target account ID
 * @returns {{ valid: { row: object, payload: object }[], invalid: { row: object, errors: string[], errorFields: string[] }[] }}
 */
function validateAllDrafts(rows, state, accountId) {
  const valid = [];
  const invalid = [];

  rows.forEach(row => {
    if (isAddRow(row)) return;
    const { errors, errorFields, payload } = normalizeDraftRow(row, state, accountId);
    if (errors.length > 0) invalid.push({ row, errors, errorFields });
    else valid.push({ row, payload });
  });

  return { valid, invalid };
}

export { normalizeDraftRow, validateAllDrafts };
