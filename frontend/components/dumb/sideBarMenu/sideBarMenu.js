// sideBarMenu.js — Dumb sidebar navigation component

const SideBarMenu = (() => {
  const NAV_ITEMS = [
    { page: 'dashboard',      icon: 'home',            label: 'Dashboard'     },
    { page: 'movements',      icon: 'receipt_long',    label: 'Movements'     },
    { page: 'add-movements',  icon: 'post_add',        label: 'Add Movements' },
    { page: 'quick-add',      icon: 'bolt',            label: 'Quick Add'     },
    { page: 'transfers',      icon: 'sync_alt',        label: 'Transfers'     },
    { page: 'bank-accounts',  icon: 'account_balance', label: 'Accounts'      },
    { page: 'categories',     icon: 'sell',            label: 'Categories'    },
    { page: 'repetitive',     icon: 'event_repeat',    label: 'Repetitive'    },
    { page: 'monthly-report', icon: 'summarize',       label: 'Monthly Report'},
  ];

  /* Start fetching active currencies immediately so data is ready by init(). */
  const _currenciesPromise = fetch(new URL('../../../utils/currencies.json', import.meta.url))
    .then(r => r.json())
    .then(data => data.filter(c => c.active))
    .catch(() => [
      { code: 'usd', codePlusSymbol: '$ USD' },
      { code: 'eur', codePlusSymbol: '€ EUR' },
      { code: 'mxn', codePlusSymbol: '$ MXN' },
      { code: 'rub', codePlusSymbol: '₽ RUB' },
      { code: 'gel', codePlusSymbol: '₾ GEL' },
    ]);

  function _escapeAttr(value) {
    return String(value ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function _buildHTML(currencies, currentCurrency, userName) {
    const current = (currentCurrency || 'usd').toLowerCase();

    const items = NAV_ITEMS.map(({ page, icon, label }) => `
      <li class="ft-nav__item" data-tooltip="${label}">
        <a class="ft-nav__link" href="#${page}" data-page="${page}">
          <span class="ft-nav__link-icon material-symbols-outlined" aria-hidden="true">${icon}</span>
          <span class="ft-nav__link-label">${label}</span>
        </a>
      </li>`).join('');

    const options = currencies.map(c =>
      `<option value="${c.code}"${c.code === current ? ' selected' : ''}>${c.codePlusSymbol}</option>`
    ).join('');

    const safeUserName = _escapeAttr(userName || '');
    const userTag = userName
      ? `<div class="ft-nav__user" data-tooltip="${safeUserName}" aria-label="Signed in as ${safeUserName}">
           <span class="ft-nav__user-icon material-symbols-outlined" aria-hidden="true">account_circle</span>
           <span class="ft-nav__user-name">${safeUserName}</span>
         </div>`
      : '';

    return `
      <nav class="ft-nav" id="ft-nav" aria-label="Main navigation">
        <div class="ft-nav__brand">
          <span class="ft-nav__brand-icon material-symbols-outlined" aria-hidden="true">account_balance</span>
          <span class="ft-nav__brand-name">Financial Tracker</span>
        </div>

        <ul class="ft-nav__menu" role="list">
          ${items}
          <li class="ft-nav__menu-divider" role="separator"></li>
          <li class="ft-nav__item ft-nav__item--currency" data-tooltip="Main currency">
            <div class="ft-nav__currency">
              <span class="ft-nav__currency-icon material-symbols-outlined" aria-hidden="true">currency_exchange</span>
              <select class="ft-nav__currency-select" id="ft-nav-currency-select" aria-label="Main currency">
                ${options}
              </select>
            </div>
          </li>
        </ul>

        <div class="ft-nav__footer">
          ${userTag}
          <button
            class="ft-nav__collapse-btn"
            id="ft-nav-collapse-btn"
            aria-label="Toggle sidebar"
          >
            <span class="ft-nav__collapse-icon material-symbols-outlined" aria-hidden="true">keyboard_double_arrow_left</span>
          </button>
        </div>
      </nav>`;
  }

  function _toggleCollapse() {
    const nav = document.getElementById('ft-nav');
    const collapsed = nav.classList.toggle('ft-nav--collapsed');
    localStorage.setItem('ft-nav-collapsed', String(collapsed));
  }

  function _restoreState() {
    if (localStorage.getItem('ft-nav-collapsed') === 'true') {
      document.getElementById('ft-nav')?.classList.add('ft-nav--collapsed');
    }
  }

  /**
   * @param {object} opts
   * @param {string}   opts.currentCurrency  — active currency code from finalAppConfig
   * @param {string}   [opts.userName]       — display name shown in the sidebar footer
   * @param {Function} opts.onCurrencyChange — async (code: string) => void
   */
  async function init({ currentCurrency = 'usd', userName = null, onCurrencyChange } = {}) {
    const container = document.getElementById('app-nav');
    if (!container) return;

    const currencies = await _currenciesPromise;
    container.innerHTML = _buildHTML(currencies, currentCurrency, userName);

    document.getElementById('ft-nav-collapse-btn')?.addEventListener('click', _toggleCollapse);
    _restoreState();

    const select = document.getElementById('ft-nav-currency-select');
    if (select && typeof onCurrencyChange === 'function') {
      select.addEventListener('change', () => onCurrencyChange(select.value));
    }
  }

  function setActivePage(page) {
    document.querySelectorAll('.ft-nav__link').forEach(link => {
      link.classList.toggle('ft-nav__link--active', link.dataset.page === page);
    });
  }

  return { init, setActivePage };
})();

export { SideBarMenu };