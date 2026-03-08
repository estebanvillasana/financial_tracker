// app.js — Hash-based SPA router

import { SideBarMenu } from './components/dumb/sideBarMenu/sideBarMenu.js';
import { finalAppConfig } from './defaults.js';
import { request, fetchCurrentUserName } from './services/http.js';

const ROUTES = {
  dashboard:        'pages/dashboard/dashboard.html',
  movements:        'pages/movements/movements.html',
  'add-movements':  'pages/add-movements/add-movements.html',
  'quick-add':      'pages/quick-add/quick-add.html',
  transfers:        'pages/transfers/transfers.html',
  categories:       'pages/categories/categories.html',
  'bank-accounts':  'pages/bank-accounts/bank-accounts.html',
  repetitive:       'pages/repetitive-movements/repetitive-movements.html',
  'monthly-report': 'pages/monthly-report/monthly-report.html',
};

const DEFAULT_ROUTE = 'dashboard';
let pageLoadToken = 0;
const PAGE_INITIALIZERS = {
  dashboard: async () => (await import('./pages/dashboard/index.js')).initDashboardPage,
  'add-movements': async () => (await import('./pages/add-movements/index.js')).initAddMovementsPage,
  'quick-add': async () => (await import('./pages/quick-add/index.js')).initQuickAddPage,
  movements: async () => (await import('./pages/movements/index.js')).initMovementsPage,
  transfers: async () => (await import('./pages/transfers/index.js')).initTransfersPage,
  categories: async () => (await import('./pages/categories/index.js')).initCategoriesPage,
  'bank-accounts': async () => (await import('./pages/bank-accounts/index.js')).initBankAccountsPage,
  repetitive: async () => (await import('./pages/repetitive-movements/index.js')).initRepetitiveMovementsPage,
  'monthly-report': async () => (await import('./pages/monthly-report/index.js')).initMonthlyReportPage,
};

function getPage() {
  return window.location.hash.replace('#', '').trim() || DEFAULT_ROUTE;
}

async function loadPage(page) {
  const path = ROUTES[page] ?? ROUTES[DEFAULT_ROUTE];
  const content = document.getElementById('app-content');
  const currentToken = ++pageLoadToken;
  let pageLoaded = false;

  content.classList.remove('ft-content--visible');

  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    content.innerHTML = await res.text();
    pageLoaded = true;
  } catch {
    content.innerHTML = `
      <div class="ft-page">
        <div class="ft-page__error">
          <span class="ft-page__error-icon material-symbols-outlined" aria-hidden="true">error</span>
          <p class="ft-text-muted ft-small">Failed to load this page.</p>
        </div>
      </div>`;
  }

  const getInitializer = PAGE_INITIALIZERS[page];
  if (pageLoaded && currentToken === pageLoadToken && typeof getInitializer === 'function') {
    try {
      const initPage = await getInitializer();
      if (currentToken === pageLoadToken) {
        await initPage(content);
      }
    } catch (error) {
      console.error(`Failed to initialize page "${page}":`, error);
    }
  }

  requestAnimationFrame(() => content.classList.add('ft-content--visible'));
  SideBarMenu.setActivePage(page);
}

window.addEventListener('hashchange', () => loadPage(getPage()));

// Module with top-level-await dependency (defaults.js) may evaluate after
// DOMContentLoaded has already fired, so check readyState instead.
async function bootstrap() {
  const [userName, configData] = await Promise.all([
    fetchCurrentUserName(),
    request('/app-config').catch(() => null),
  ]);

  const currentCurrency = configData?.currency || finalAppConfig.currency;

  // Keep finalAppConfig in sync so all pages that import it get the right currency.
  finalAppConfig.currency = currentCurrency;

  SideBarMenu.init({
    currentCurrency,
    userName,
    onCurrencyChange: async (code) => {
      await request('/app-config', { method: 'PATCH', body: { currency: code } });
      window.location.reload();
    },
  });

  if (!window.location.hash) {
    window.location.hash = DEFAULT_ROUTE;
  } else {
    loadPage(getPage());
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
