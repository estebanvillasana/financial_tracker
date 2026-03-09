/**
 * Quick Add — Sequential field flow engine.
 *
 * Manages the ordered sequence of input steps for keyboard-first movement entry.
 * Each step has: key, label, type, required, default, validate().
 * The engine tracks the current step index and collected values.
 */

import { isValidIsoDate } from '../../utils/validators.js';
import { getCategoriesByType, getSubCategoriesByTypeAndCategory } from '../../utils/lookups.js';

const FIELD_STEPS = [
  {
    key: 'movement',
    label: 'Movement',
    inputType: 'text',
    placeholder: 'e.g. Groceries, Salary…',
    required: true,
    validate: v => (v.trim() ? null : 'Movement name is required.'),
  },
  {
    key: 'date',
    label: 'Date',
    inputType: 'smart-date',
    required: true,
    defaultFn: () => new Date().toISOString().slice(0, 10),
    validate: v => (isValidIsoDate(v) ? null : 'Must be a valid date (YYYY-MM-DD).'),
  },
  {
    key: 'type',
    label: 'Type',
    inputType: 'type-toggle',
    required: true,
    defaultFn: () => 'Expense',
    validate: v => (['Expense', 'Income'].includes(v) ? null : 'Must be Expense or Income.'),
  },
  {
    key: 'amount',
    label: 'Amount',
    inputType: 'number',
    placeholder: '0.00',
    required: true,
    validate: v => {
      const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
      return (!isNaN(n) && n > 0) ? null : 'Amount must be a positive number.';
    },
  },
  {
    key: 'category_id',
    label: 'Category',
    inputType: 'filtered-select',
    required: false,
    optionsFn: (state, values) => {
      const type = values.type || 'Expense';
      const cats = getCategoriesByType(state.categories, type);
      return cats
        .map(c => ({ id: c.id, label: c.category, _u: state.categoryUsage?.[`${type}_${c.id}`] || 0 }))
        .sort((a, b) => b._u - a._u || a.label.localeCompare(b.label))
        .map(({ id, label }) => ({ id, label }));
    },
    validate: () => null,
  },
  {
    key: 'sub_category_id',
    label: 'Sub-category',
    inputType: 'filtered-select',
    required: false,
    optionsFn: (state, values) => {
      if (!values.category_id) return [];
      const subs = getSubCategoriesByTypeAndCategory(
        state.subCategories,
        values.type || 'Expense',
        values.category_id,
      );
      return subs
        .map(s => ({ id: s.id, label: s.sub_category, _u: state.subCategoryUsage?.[String(s.id)] || 0 }))
        .sort((a, b) => b._u - a._u || a.label.localeCompare(b.label))
        .map(({ id, label }) => ({ id, label }));
    },
    shouldSkip: (_state, values) => !values.category_id,
    validate: () => null,
  },
  {
    key: 'description',
    label: 'Description',
    inputType: 'text',
    placeholder: 'Optional notes (Enter to skip)',
    required: false,
    validate: () => null,
  },
  {
    key: 'repetitive_movement_id',
    label: 'Repetitive',
    inputType: 'filtered-select',
    required: false,
    optionsFn: (state, values) => {
      const rms = (state.repetitiveMovements || []).filter(
        rm => !values.type || rm.type === values.type,
      );
      return [
        { id: '', label: '\u2014 None \u2014' },
        ...rms.map(rm => ({ id: rm.id, label: rm.movement })),
      ];
    },
    validate: () => null,
  },
];

/**
 * Creates a new flow instance.
 * @returns {object} Flow API
 */
function createFlow() {
  let stepIndex = 0;
  const values = {};
  const visitedSteps = []; // history stack for back()

  function currentStep() {
    return FIELD_STEPS[stepIndex] || null;
  }

  function currentIndex() {
    return stepIndex;
  }

  function allSteps() {
    return FIELD_STEPS;
  }

  function getValues() {
    return { ...values };
  }

  function isComplete() {
    return stepIndex >= FIELD_STEPS.length;
  }

  /**
   * Sets the value for the current step, validates, and advances.
   * @param {*} value
   * @param {object} state - page state (for optionsFn)
   * @returns {{ ok: boolean, error: string|null }}
   */
  function advance(value, state) {
    const step = currentStep();
    if (!step) return { ok: false, error: 'Flow is complete.' };

    const strVal = value === undefined || value === null ? '' : String(value).trim();

    if (step.required && !strVal) {
      return { ok: false, error: `${step.label} is required.` };
    }

    const error = step.validate(strVal);
    if (error) return { ok: false, error };

    // Save snapshot for back() before mutating state
    visitedSteps.push({ stepIndex, values: { ...values } });

    // Store typed value
    if (step.inputType === 'filtered-select') {
      values[step.key] = strVal ? Number(strVal) : null;
    } else if (step.inputType === 'number') {
      values[step.key] = parseFloat(strVal.replace(/[^0-9.\-]/g, ''));
    } else {
      values[step.key] = strVal || (step.required ? '' : null);
    }

    stepIndex++;
    _skipAutoSteps(state);
    return { ok: true, error: null };
  }

  /**
   * Skip steps that should be auto-skipped (e.g. sub-category when no category).
   */
  function _skipAutoSteps(state) {
    while (stepIndex < FIELD_STEPS.length) {
      const step = FIELD_STEPS[stepIndex];
      if (step.shouldSkip && step.shouldSkip(state, values)) {
        values[step.key] = null;
        stepIndex++;
      } else {
        break;
      }
    }
  }

  function back() {
    if (visitedSteps.length === 0) return false;
    const prev = visitedSteps.pop();
    stepIndex = prev.stepIndex;
    Object.keys(values).forEach(k => delete values[k]);
    Object.assign(values, prev.values);
    return true;
  }

  function reset() {
    stepIndex = 0;
    visitedSteps.length = 0;
    Object.keys(values).forEach(k => delete values[k]);
  }

  /**
   * Build the API payload from collected values.
   * @param {number} accountId
   * @returns {object}
   */
  function buildPayload(accountId) {
    const amount = Math.round(Math.abs(values.amount || 0) * 100);
    return {
      movement: values.movement || '',
      description: values.description || null,
      account_id: Number(accountId),
      value: amount,
      type: values.type || 'Expense',
      date: values.date || new Date().toISOString().slice(0, 10),
      category_id: values.category_id || null,
      sub_category_id: values.sub_category_id || null,
      repetitive_movement_id: values.repetitive_movement_id || null,
      invoice: 0,
      active: 1,
    };
  }

  return { currentStep, currentIndex, allSteps, getValues, isComplete, advance, back, reset, buildPayload };
}

export { FIELD_STEPS, createFlow };
