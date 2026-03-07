/**
 * Dashboard data-fetching helpers.
 *
 * Centralises all API calls used by the dashboard page so the orchestrator
 * (index.js) stays focused on wiring, and each widget module receives
 * pre-fetched data rather than calling APIs itself.
 */

import { bankAccounts, movements, fxRates } from '../../services/api.js';

/**
 * Returns the ISO date boundaries (YYYY-MM-DD) for the current calendar month.
 *
 * @returns {{ dateFrom: string, dateTo: string }}
 */
export function getCurrentMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  const lastDay = new Date(year, month + 1, 0); // day 0 of next month = last day of current

  const pad = n => String(n).padStart(2, '0');
  return {
    dateFrom: `${year}-${pad(month + 1)}-01`,
    dateTo: `${year}-${pad(month + 1)}-${pad(lastDay.getDate())}`,
  };
}

/**
 * Fetches all data the dashboard needs in parallel.
 *
 * Returns a flat object whose keys map directly to widget inputs.
 * Any individual fetch failure is caught and returns a safe fallback,
 * so the dashboard can render partial data instead of failing entirely.
 *
 * @returns {Promise<{
 *   accounts:        Array,
 *   monthMovements:  Array,
 *   recentMovements: Array,
 *   rates:           object,  — FX rates keyed by ISO code, base USD
 * }>}
 */
export async function fetchDashboardData() {
  const { dateFrom, dateTo } = getCurrentMonthRange();

  const [accts, monthMov, recentMov, fxData] = await Promise.all([
    bankAccounts.getAll({ active: 1 }).catch(() => []),
    movements.getAll({ active: 1, date_from: dateFrom, date_to: dateTo }).catch(() => []),
    movements.getAll({ active: 1, limit: 15 }).catch(() => []),
    fxRates.getAllRatesLatest().catch(() => null),
  ]);

  return {
    accounts: Array.isArray(accts) ? accts : [],
    monthMovements: Array.isArray(monthMov) ? monthMov : [],
    recentMovements: Array.isArray(recentMov) ? recentMov : [],
    rates: fxData?.rates ?? {},
  };
}
