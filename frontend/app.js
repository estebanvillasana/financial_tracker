// app.js — Hash-based SPA router

import { SideBarMenu } from './components/dumb/sideBarMenu/sideBarMenu.js';

const ROUTES = {
  dashboard:        'pages/dashboard.html',
  movements:        'pages/movements.html',
  'add-movements':  'pages/add-movements/add-movements.html',
  transfers:        'pages/transfers/transfers.html',
  categories:       'pages/categories.html',
  repetitive:       'pages/repetitive-movements.html',
};

const DEFAULT_ROUTE = 'dashboard';
let pageLoadToken = 0;
const PAGE_INITIALIZERS = {
  dashboard: async () => (await import('./pages/dashboard.js')).initDashboardPage,
  'add-movements': async () => (await import('./pages/add-movements/index.js')).initAddMovementsPage,
  transfers: async () => (await import('./pages/transfers/index.js')).initTransfersPage,
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

window.addEventListener('DOMContentLoaded', () => {
  SideBarMenu.init();

  if (!window.location.hash) {
    // Setting hash triggers hashchange which calls loadPage
    window.location.hash = DEFAULT_ROUTE;
  } else {
    loadPage(getPage());
  }
});
