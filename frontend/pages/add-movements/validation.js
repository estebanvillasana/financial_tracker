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
 *
 * @param {object} row        - Draft row data from the grid
 * @param {object} state      - Page state (categories, subCategories)
 * @param {number} accountId  - Target account ID
 * @param {number} rowIndex   - 1-based row number for error messages
 * @returns {{ errors: string[], payload: object|null }}
 */
function normalizeDraftRow(row, state, accountId, rowIndex) {
  const movement = String(row?.movement || '').trim();
  const amount = Number(row?.amount);
  const type = String(row?.type || '');
  const date = String(row?.date || '');
  const description = String(row?.description || '').trim();
  const categoryId = parseNumberOrNull(row?.category_id);
  const subCategoryId = parseNumberOrNull(row?.sub_category_id);

  const errors = [];
  if (!movement) errors.push(`Row ${rowIndex}: movement is required.`);
  if (!TYPE_VALUES.includes(type)) errors.push(`Row ${rowIndex}: type must be Income or Expense.`);
  if (!isValidIsoDate(date)) errors.push(`Row ${rowIndex}: date must be YYYY-MM-DD.`);
  if (!Number.isFinite(amount) || amount <= 0) errors.push(`Row ${rowIndex}: amount must be greater than 0.`);

  const category = state.categories.find(item => Number(item.id) === Number(categoryId));
  if (categoryId !== null && !category) errors.push(`Row ${rowIndex}: category is invalid.`);
  if (category && category.type !== type) errors.push(`Row ${rowIndex}: category type must match movement type.`);

  const subCategory = state.subCategories.find(item => Number(item.id) === Number(subCategoryId));
  if (subCategoryId !== null && !subCategory) errors.push(`Row ${rowIndex}: sub-category is invalid.`);
  if (subCategory && categoryId !== null && Number(subCategory.category_id) !== Number(categoryId)) {
    errors.push(`Row ${rowIndex}: sub-category does not belong to selected category.`);
  }
  if (subCategory && subCategory.type !== type) {
    errors.push(`Row ${rowIndex}: sub-category type must match movement type.`);
  }

  if (errors.length > 0) return { errors, payload: null };

  const absCents = Math.round(Math.abs(amount) * 100);
  const value = type === 'Income' ? absCents : -absCents;

  return {
    errors: [],
    payload: {
      movement,
      description: description || null,
      account_id: Number(accountId),
      value,
      type,
      date,
      category_id: categoryId,
      sub_category_id: subCategoryId,
      repetitive_movement_id: null,
      invoice: 0,
      active: 1,
    },
  };
}

/**
 * Validates all draft rows and returns payloads + collected errors.
 *
 * @param {object[]} rows      - Draft rows (sentinel excluded)
 * @param {object}   state     - Page state
 * @param {number}   accountId - Target account ID
 * @returns {{ errors: string[], payloads: object[] }}
 */
function validateAllDrafts(rows, state, accountId) {
  const payloads = [];
  const errors = [];

  rows.forEach((row, index) => {
    if (isAddRow(row)) return;
    const { errors: rowErrors, payload } = normalizeDraftRow(row, state, accountId, index + 1);
    if (rowErrors.length > 0) errors.push(...rowErrors);
    else payloads.push(payload);
  });

  return { errors, payloads };
}

export { normalizeDraftRow, validateAllDrafts };
