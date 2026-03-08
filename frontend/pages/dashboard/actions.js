/**
 * Dashboard data-fetching helpers.
 *
 * Centralises all API calls used by the dashboard page so the orchestrator
 * (index.js) stays focused on wiring, and each widget module receives
 * pre-fetched data rather than calling APIs itself.
 */

import { bankAccounts, movements, fxRates } from '../../services/api.js';

const DASHBOARD_MOVEMENTS_PAGE_SIZE = 500;
const DASHBOARD_MOVEMENTS_MAX_PAGES = 20;

async function fetchAllMovementsForRange({ active = 1, dateFrom, dateTo }) {
  const all = [];

  for (let page = 0; page < DASHBOARD_MOVEMENTS_MAX_PAGES; page++) {
    const offset = page * DASHBOARD_MOVEMENTS_PAGE_SIZE;
    const chunk = await movements.getAll({
      active,
      date_from: dateFrom,
      date_to: dateTo,
      limit: DASHBOARD_MOVEMENTS_PAGE_SIZE,
      offset,
    });

    if (!Array.isArray(chunk) || chunk.length === 0) break;

    all.push(...chunk);

    if (chunk.length < DASHBOARD_MOVEMENTS_PAGE_SIZE) break;
  }

  return all;
}

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
 * Returns the ISO date boundaries (YYYY-MM-DD) for the previous calendar month.
 *
 * @returns {{ dateFrom: string, dateTo: string }}
 */
export function getPreviousMonthRange() {
  const now = new Date();
  const firstOfPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year = firstOfPrev.getFullYear();
  const month = firstOfPrev.getMonth(); // 0-indexed

  const lastDay = new Date(year, month + 1, 0);

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
 *   accounts:            Array,
 *   monthMovements:      Array,   — current month (for monthly stats cards)
 *   prevMonthMovements:  Array,   — previous month (for breakdown reports)
 *   recentMovements:     Array,
 *   rates:               object,  — FX rates keyed by ISO code, base USD
 * }>}
 */
export async function fetchDashboardData() {
  const { dateFrom, dateTo } = getCurrentMonthRange();
  const { dateFrom: prevFrom, dateTo: prevTo } = getPreviousMonthRange();

  const [accts, monthMov, prevMov, recentMov, fxData] = await Promise.all([
    bankAccounts.getAll({ active: 1 }).catch(() => []),
    fetchAllMovementsForRange({ active: 1, dateFrom, dateTo }).catch(() => []),
    fetchAllMovementsForRange({ active: 1, dateFrom: prevFrom, dateTo: prevTo }).catch(() => []),
    movements.getAll({ active: 1, limit: 15 }).catch(() => []),
    fxRates.getAllRatesLatest().catch(() => null),
  ]);

  return {
    accounts:           Array.isArray(accts)    ? accts    : [],
    monthMovements:     Array.isArray(monthMov) ? monthMov : [],
    prevMonthMovements: Array.isArray(prevMov)  ? prevMov  : [],
    recentMovements:    Array.isArray(recentMov) ? recentMov : [],
    rates:              fxData?.rates ?? {},
  };
}
