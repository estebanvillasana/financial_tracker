/**
 * Dashboard page bootstrap.
 *
 * Widget layout (top -> bottom):
 *  Row 1 - Stats Cards:       5 InfoCards (balance, income, expenses, flow, accounts)
 *  Row 2 - Accounts Summary:  paginated account cards smart component
 *  Row 3 - Breakdowns:        3 side-by-side bars (category spend, account balances, monthly flow)
 *  Row 4 - Recent Movements:  full-width AG Grid matching the Movements page columns
 */

import { finalAppConfig } from '../../defaults.js';
import { normalizeCurrency } from '../../utils/formatters.js';
import { AccountsSummary } from '../../components/smart/accountsSummary/accountsSummary.js';
import { InfoCard } from '../../components/dumb/infoCard/infoCard.js';

import { fetchDashboardData } from './actions.js';
import { renderLoadingStats, renderStatsCards } from './statsCards.js';
import { mountRecentMovements } from './recentMovements.js';
import { renderBreakdowns } from './breakdowns.js';

const SEL = {
  stats:               '#dashboard-stats',
  accountsSummary:     '#widget-accounts-summary',
  breakdownCategories: '#dashboard-breakdown-categories',
  breakdownAccounts:   '#dashboard-breakdown-accounts',
  breakdownFlow:       '#dashboard-breakdown-flow',
  breakdownPeriod:     '#dashboard-breakdown-period',
  breakdownFlowPeriod: '#dashboard-breakdown-flow-period',
  movements:           '#dashboard-movements',
};

async function initDashboardPage(root = document) {
  const els = {};
  for (const [key, selector] of Object.entries(SEL)) {
    els[key] = root.querySelector(selector);
  }

  const mainCurrency = normalizeCurrency(finalAppConfig.currency);

  renderLoadingStats(els.stats);

  let data;
  try {
    data = await fetchDashboardData();
  } catch {
    _renderFatalError(els.stats);
    return;
  }

  const { accounts, monthMovements, recentMovements, rates } = data;

  // Row 1: stats cards (async FX conversion)
  const statsPromise = renderStatsCards(els.stats, {
    accounts,
    monthMovements,
    mainCurrency,
  }).catch(() => _renderFatalError(els.stats));

  // Row 2: accounts summary (self-contained, kicks off its own fetch)
  const summaryPromise = AccountsSummary.render(els.accountsSummary, {
    pageSize: 6,
    columns: 3,
    defaultCurrency: mainCurrency,
    title: 'Accounts Summary',
  });

  // Row 3: breakdowns (synchronous, runs immediately with pre-fetched data)
  renderBreakdowns(
    {
      categories:  els.breakdownCategories,
      accounts:    els.breakdownAccounts,
      flow:        els.breakdownFlow,
      period:      els.breakdownPeriod,
      flowPeriod:  els.breakdownFlowPeriod,
    },
    { monthMovements, accounts, rates, mainCurrency }
  );

  // Row 4: recent movements grid (async, lazy-loads AG Grid)
  const gridPromise = mountRecentMovements(
    els.movements,
    recentMovements,
    rates,
    mainCurrency
  );

  await Promise.all([statsPromise, summaryPromise, gridPromise]);
}

function _renderFatalError(container) {
  if (!container) return;
  container.innerHTML = '';
  container.appendChild(
    InfoCard.createElement(
      {
        icon: 'error',
        label: 'Dashboard unavailable',
        value: '\u2014',
        subValue: 'Could not load data.',
        note: 'Check the API connection and try again.',
      },
      { variant: 'danger' }
    )
  );
}

export { initDashboardPage };
