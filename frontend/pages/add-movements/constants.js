/**
 * Add Movements constants and row factories.
 *
 * Keeps all row-shape primitives and sentinel metadata in one place so
 * grid behavior remains consistent across modules.
 */

const TYPE_VALUES = ['Expense', 'Income'];
const SENTINEL_ID = '__ft_add_movement_sentinel';
const SENTINEL_FLAG = '_isAddRow';

let rowSeed = 0;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Creates a normal editable draft row. */
function createDraftRow(type = 'Expense') {
  rowSeed += 1;
  return {
    _id: `draft_${Date.now()}_${rowSeed}`,
    movement: '',
    description: '',
    type,
    date: todayIso(),
    amount: null,
    category_id: null,
    sub_category_id: null,
  };
}

/** Creates the special "add new row" sentinel shown at the bottom. */
function createSentinelRow(type = 'Expense') {
  return {
    _id: SENTINEL_ID,
    [SENTINEL_FLAG]: true,
    movement: '',
    description: '',
    type,
    date: todayIso(),
    amount: null,
    category_id: null,
    sub_category_id: null,
  };
}

/** Sentinel discriminator helper. */
function isAddRow(data) {
  return data && data[SENTINEL_FLAG] === true;
}

/** Returns true when the row contains user-entered values. */
function hasUserData(row) {
  if (!row) return false;
  const today = todayIso();
  return Object.entries(row).some(([key, value]) => {
    if (key === '_id' || key === SENTINEL_FLAG) return false;
    if (key === 'type') return false;
    if (key === 'date') return String(value || '').trim() !== '' && String(value) !== today;
    return value !== null && value !== undefined && String(value).trim() !== '';
  });
}

/** Re-export from shared formatters for backward compatibility within this module. */
import { normalizeCurrency } from '../../utils/formatters.js';

export {
  TYPE_VALUES,
  SENTINEL_ID,
  SENTINEL_FLAG,
  todayIso,
  createDraftRow,
  createSentinelRow,
  isAddRow,
  hasUserData,
  normalizeCurrency,
};
