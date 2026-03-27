/**
 * Dashboard page bootstrap.
 *
 * Widget layout (top -> bottom):
 *  Row 1 - Stats:              3 primary InfoCards (balance, savings, debts)
 *                              3 secondary InfoCards (income, expenses, net flow)
 *  Row 2 - Accounts Summary:   paginated account cards smart component
 *  Row 3 - Last Month's Report: 3 breakdown cards (category spend, biggest expenses, account balances)
 *  Row 4 - Recent Movements:   full-width AG Grid matching the Movements page columns
 */

import { finalAppConfig } from '../../defaults.js';
import { normalizeCurrency } from '../../utils/formatters.js';
import { AccountsSummary }   from '../../components/smart/accountsSummary/accountsSummary.js';
import { CurrencySummary }   from '../../components/smart/currencySummary/currencySummary.js';
import { InfoCard } from '../../components/dumb/infoCard/infoCard.js';

import { fetchDashboardData } from './actions.js';
import { renderLoadingStats, renderStatsCards } from './statsCards.js';
import { mountRecentMovements } from './recentMovements.js';
import { renderBreakdowns } from './breakdowns.js';

const SEL = {
  statsPrimary:              '#dashboard-stats-primary',
  statsSecondary:            '#dashboard-stats-secondary',
  statsSecondaryPeriod:      '#dashboard-stats-secondary-period',
  accountsSummary:           '#widget-accounts-summary',
  currencySummary:           '#widget-currency-summary',
  breakdownCategories:       '#dashboard-breakdown-categories',
  breakdownExpenses:         '#dashboard-breakdown-expenses',
  breakdownAccounts:         '#dashboard-breakdown-accounts',
  breakdownPeriod:           '#dashboard-breakdown-period',
  movements:                 '#dashboard-movements',
};

async function initDashboardPage(root = document) {
  const els = {};
  for (const [key, selector] of Object.entries(SEL)) {
    els[key] = root.querySelector(selector);
  }

  const mainCurrency = normalizeCurrency(finalAppConfig.currency);

  renderLoadingStats(els.statsPrimary, els.statsSecondary);

  let data;
  try {
    data = await fetchDashboardData();
  } catch {
    _renderFatalError(els.statsPrimary);
    return;
  }

  const { accounts, monthMovements, prevMonthMovements, recentMovements, rates } = data;

  // Compute once and stamp both period labels (breakdowns + secondary stats)
  const prevMonthLabel = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  })();
  if (els.breakdownPeriod)      els.breakdownPeriod.textContent      = prevMonthLabel;
  if (els.statsSecondaryPeriod) els.statsSecondaryPeriod.textContent = prevMonthLabel;

  // Row 1: stats cards (synchronous, uses pre-fetched rates)
  try {
    renderStatsCards(els.statsPrimary, els.statsSecondary, {
      accounts,
      prevMonthMovements,
      mainCurrency,
      rates,
      prevMonthLabel,
    });
  } catch {
    _renderFatalError(els.statsPrimary);
  }

  // Row 2: accounts summary (self-contained, kicks off its own fetch)
  const summaryPromise = AccountsSummary.render(els.accountsSummary, {
    pageSize: 12,
    columns: 3,
    defaultCurrency: mainCurrency,
    title: 'Accounts Summary',
  });

  // Row 3: currency summary (synchronous, uses pre-fetched accounts + rates)
  CurrencySummary.render(els.currencySummary, { accounts, rates, mainCurrency });

  // Row 4: breakdowns (synchronous, runs immediately with pre-fetched data)
  renderBreakdowns(
    {
      categories: els.breakdownCategories,
      expenses:   els.breakdownExpenses,
      accounts:   els.breakdownAccounts,
    },
    { prevMonthMovements, accounts, rates, mainCurrency }
  );

  // Row 4: recent movements grid (async, lazy-loads AG Grid)
  const gridPromise = mountRecentMovements(
    els.movements,
    recentMovements,
    rates,
    mainCurrency
  );

  await Promise.all([summaryPromise, gridPromise]);
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
