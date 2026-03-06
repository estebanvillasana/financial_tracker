import { finalAppConfig } from '../defaults.js';
import { bankAccounts } from '../services/api.js';
import { InfoCard } from '../components/dumb/infoCard/infoCard.js';
import { AccountSummaryCard } from '../components/dumb/accountSummaryCard/accountSummaryCard.js';
import { AccountsSummary } from '../components/smart/accountsSummary/accountsSummary.js';

const DASHBOARD_INFO_CARDS_SELECTOR = '#dashboard-info-cards';
const ACCOUNTS_SUMMARY_SELECTOR = '#widget-accounts-summary';

function normalizeCurrency(code) {
  return String(code || '').trim().toUpperCase();
}

function formatMoneyFromCents(cents, currencyCode) {
  const amount = (Number(cents) || 0) / 100;
  const normalized = normalizeCurrency(currencyCode);

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: normalized || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${normalized || ''}`.trim();
  }
}

function buildCardsData(accounts, convertedTotalsCents, mainCurrency) {
  const totalBalanceCents = convertedTotalsCents.reduce((sum, value) => sum + value, 0);
  const totalSavingsCents = convertedTotalsCents.reduce((sum, value) => (value > 0 ? sum + value : sum), 0);
  const totalDebtsCents = convertedTotalsCents.reduce((sum, value) => (value < 0 ? sum + value : sum), 0);
  const accountCount = accounts.length;
  const accountLabel = `${accountCount} account${accountCount === 1 ? '' : 's'}`;

  return [
    {
      data: {
        icon: 'payments',
        label: 'Total Balance',
        value: formatMoneyFromCents(totalBalanceCents, mainCurrency),
        subValue: `In ${mainCurrency}`,
        note: `Across ${accountLabel}`,
      },
      options: { variant: 'accent' },
    },
    {
      data: {
        icon: 'savings',
        label: 'Total Savings',
        value: formatMoneyFromCents(totalSavingsCents, mainCurrency),
        subValue: `In ${mainCurrency}`,
        note: 'Sum of positive balances',
      },
      options: { variant: 'success' },
    },
    {
      data: {
        icon: 'credit_card',
        label: 'Total Debts',
        value: formatMoneyFromCents(totalDebtsCents, mainCurrency),
        subValue: `In ${mainCurrency}`,
        note: 'Sum of negative balances',
      },
      options: { variant: 'danger' },
    },
  ];
}

async function getConvertedCents(account, mainCurrency) {
  const accountCurrency = normalizeCurrency(account?.currency);
  const totalBalanceCents = Number(account?.total_balance ?? 0);

  if (!accountCurrency || accountCurrency === mainCurrency) {
    return Number.isFinite(totalBalanceCents) ? totalBalanceCents : 0;
  }

  const convertedCents = await AccountSummaryCard.getLatestConvertedTotalCents(account, {
    defaultCurrency: mainCurrency,
  });

  return Number.isFinite(convertedCents) ? convertedCents : 0;
}

function renderLoadingCards(target) {
  if (!target) return;
  target.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    target.appendChild(
      InfoCard.createLoadingElement({
        hasSubValue: true,
        hasNote: true,
      })
    );
  }
}

function renderInfoCards(target, cardsData) {
  if (!target) return;
  target.innerHTML = '';
  cardsData.forEach(card => {
    target.appendChild(InfoCard.createElement(card.data, card.options));
  });
}

async function initDashboardPage(root = document) {
  const cardsContainer = root.querySelector(DASHBOARD_INFO_CARDS_SELECTOR);
  const accountsSummaryContainer = root.querySelector(ACCOUNTS_SUMMARY_SELECTOR);
  if (!cardsContainer || !accountsSummaryContainer) return;

  const mainCurrency = normalizeCurrency(finalAppConfig.currency);

  renderLoadingCards(cardsContainer);

  try {
    const accounts = await bankAccounts.getAll({ active: 1 });
    const activeAccounts = Array.isArray(accounts) ? accounts : [];
    const convertedTotalsCents = await Promise.all(
      activeAccounts.map(account => getConvertedCents(account, mainCurrency))
    );

    renderInfoCards(cardsContainer, buildCardsData(activeAccounts, convertedTotalsCents, mainCurrency));
  } catch {
    cardsContainer.innerHTML = '';
    cardsContainer.appendChild(
      InfoCard.createElement(
        {
          icon: 'error',
          label: 'Dashboard metrics unavailable',
          value: '—',
          subValue: 'Could not load account balances.',
          note: 'Please check the API connection and try again.',
        },
        { variant: 'danger' }
      )
    );
  }

  await AccountsSummary.render(accountsSummaryContainer, {
    pageSize: 6,
    columns: 3,
    defaultCurrency: mainCurrency,
    title: 'Accounts Summary',
  });
}

export { initDashboardPage };
