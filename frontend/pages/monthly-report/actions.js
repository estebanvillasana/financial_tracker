/**
 * Monthly Report — Data-fetching helpers.
 *
 * Centralises all API calls used by the monthly report page.
 * Provides date range computation and parallel data fetching.
 */

import { movements, repetitiveMovements, fxRates, categories, subCategories } from '../../services/api.js';

/**
 * Returns the ISO date boundaries (YYYY-MM-DD) for a given year/month.
 *
 * @param {number} year  — full year (e.g. 2026)
 * @param {number} month — 0-indexed month (0 = Jan, 11 = Dec)
 * @returns {{ dateFrom: string, dateTo: string }}
 */
export function getMonthRange(year, month) {
  const lastDay = new Date(year, month + 1, 0);
  const pad = n => String(n).padStart(2, '0');
  return {
    dateFrom: `${year}-${pad(month + 1)}-01`,
    dateTo:   `${year}-${pad(month + 1)}-${pad(lastDay.getDate())}`,
  };
}

/**
 * Returns the year and 0-indexed month for the previous calendar month.
 * @returns {{ year: number, month: number }}
 */
export function getPreviousMonth() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/**
 * Returns a human-readable label for a given year/month.
 * @param {number} year
 * @param {number} month — 0-indexed
 * @returns {string} e.g. "February 2026"
 */
export function getMonthLabel(year, month) {
  const d = new Date(year, month, 1);
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Fetches all data the monthly report needs in parallel.
 *
 * @param {number} year  — report year
 * @param {number} month — report month (0-indexed)
 * @returns {Promise<object>}
 */
export async function fetchReportData(year, month) {
  const { dateFrom, dateTo } = getMonthRange(year, month);

  const [
    monthMovements,
    taxableRepMovements,
    allRepMovements,
    fxData,
    cats,
    subs,
  ] = await Promise.all([
    movements.getAll({ active: 1, date_from: dateFrom, date_to: dateTo, limit: 500 }).catch(() => []),
    repetitiveMovements.getAll({ active: 1, tax_report: 1, limit: 500 }).catch(() => []),
    repetitiveMovements.getAll({ limit: 500 }).catch(() => []),
    fxRates.getAllRatesLatest().catch(() => null),
    categories.getAll({ active: 1 }).catch(() => []),
    subCategories.getAll({ active: 1 }).catch(() => []),
  ]);

  return {
    monthMovements:     Array.isArray(monthMovements) ? monthMovements : [],
    taxableRepMovements: Array.isArray(taxableRepMovements) ? taxableRepMovements : [],
    allRepMovements:    Array.isArray(allRepMovements) ? allRepMovements : [],
    rates:              fxData?.rates ?? {},
    categories:         Array.isArray(cats) ? cats : [],
    subCategories:      Array.isArray(subs) ? subs : [],
  };
}

/**
 * Updates the invoice flag on a movement.
 * Sends the full movement payload required by the PUT endpoint.
 *
 * @param {object} movementData — full movement row data
 * @param {number} invoiceValue — 0 or 1
 * @returns {Promise}
 */
export async function updateInvoiceFlag(movementData, invoiceValue) {
  return movements.update(movementData.id, {
    movement:               movementData.movement,
    description:            movementData.description ?? null,
    account_id:             movementData.account_id,
    value:                  movementData.value,
    type:                   movementData.type,
    date:                   movementData.date,
    category_id:            movementData.category_id ?? null,
    sub_category_id:        movementData.sub_category_id ?? null,
    repetitive_movement_id: movementData.repetitive_movement_id ?? null,
    movement_code:          movementData.movement_code ?? null,
    invoice:                invoiceValue,
  });
}
