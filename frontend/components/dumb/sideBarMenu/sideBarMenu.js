// sideBarMenu.js — Dumb sidebar navigation component

const SideBarMenu = (() => {
  const MOBILE_BREAKPOINT = 900;
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
  let _globalHandlersBound = false;

  function _escapeAttr(value) {
    return String(value ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function _isMobileViewport() {
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
  }

  function _getLabelForPage(page) {
    return NAV_ITEMS.find(item => item.page === page)?.label || 'Navigation';
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
      <div class="ft-nav-shell" id="ft-nav-shell">
        <div class="ft-nav-mobile-bar" id="ft-nav-mobile-bar">
          <button
            class="ft-nav-mobile-bar__toggle"
            id="ft-nav-mobile-toggle"
            type="button"
            aria-controls="ft-nav"
            aria-expanded="false"
            aria-label="Open navigation"
          >
            <span class="material-symbols-outlined" aria-hidden="true">menu</span>
          </button>
          <div class="ft-nav-mobile-bar__titles">
            <span class="ft-nav-mobile-bar__brand">Financial Tracker</span>
            <span class="ft-nav-mobile-bar__page" id="ft-nav-mobile-current-page">Dashboard</span>
          </div>
        </div>

        <div class="ft-nav-backdrop" id="ft-nav-backdrop" hidden></div>

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
              type="button"
              aria-label="Toggle sidebar"
            >
              <span class="ft-nav__collapse-icon material-symbols-outlined" aria-hidden="true">keyboard_double_arrow_left</span>
            </button>
          </div>
        </nav>

        <div class="ft-nav-mobile-spacer" aria-hidden="true"></div>
      </div>`;
  }

  function _getShell() {
    return document.getElementById('ft-nav-shell');
  }

  function _setMobilePageLabel(page) {
    const labelEl = document.getElementById('ft-nav-mobile-current-page');
    if (labelEl) {
      labelEl.textContent = _getLabelForPage(page);
    }
  }

  function _setMobileDrawerOpen(isOpen) {
    const shell = _getShell();
    const backdrop = document.getElementById('ft-nav-backdrop');
    const toggle = document.getElementById('ft-nav-mobile-toggle');
    if (!shell) return;

    shell.classList.toggle('ft-nav-shell--mobile-open', isOpen);
    document.body.classList.toggle('ft-nav-mobile-open', isOpen);

    if (backdrop) backdrop.hidden = !isOpen;
    if (toggle) toggle.setAttribute('aria-expanded', String(isOpen));
  }

  function _closeMobileDrawer() {
    _setMobileDrawerOpen(false);
  }

  function _toggleMobileDrawer() {
    if (!_isMobileViewport()) return;
    const shell = _getShell();
    _setMobileDrawerOpen(!shell?.classList.contains('ft-nav-shell--mobile-open'));
  }

  function _restoreDesktopCollapse() {
    const nav = document.getElementById('ft-nav');
    if (!nav) return;

    const shouldCollapse = !_isMobileViewport() && localStorage.getItem('ft-nav-collapsed') === 'true';
    nav.classList.toggle('ft-nav--collapsed', shouldCollapse);
  }

  function _syncViewportMode() {
    const shell = _getShell();
    const nav = document.getElementById('ft-nav');
    if (!shell || !nav) return;

    const isMobile = _isMobileViewport();
    shell.classList.toggle('ft-nav-shell--mobile', isMobile);

    if (isMobile) {
      nav.classList.remove('ft-nav--collapsed');
      _setMobileDrawerOpen(false);
    } else {
      _restoreDesktopCollapse();
    }
  }

  function _bindGlobalHandlers() {
    if (_globalHandlersBound) return;
    _globalHandlersBound = true;

    window.addEventListener('resize', _syncViewportMode);
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        _closeMobileDrawer();
      }
    });
  }

  function _bindLocalHandlers(onCurrencyChange) {
    document.getElementById('ft-nav-collapse-btn')?.addEventListener('click', _toggleCollapse);
    document.getElementById('ft-nav-mobile-toggle')?.addEventListener('click', _toggleMobileDrawer);
    document.getElementById('ft-nav-backdrop')?.addEventListener('click', _closeMobileDrawer);

    document.querySelectorAll('.ft-nav__link').forEach(link => {
      link.addEventListener('click', () => {
        if (_isMobileViewport()) {
          _closeMobileDrawer();
        }
      });
    });

    const select = document.getElementById('ft-nav-currency-select');
    if (select && typeof onCurrencyChange === 'function') {
      select.addEventListener('change', () => onCurrencyChange(select.value));
    }
  }

  function _toggleCollapse() {
    if (_isMobileViewport()) {
      _toggleMobileDrawer();
      return;
    }

    const nav = document.getElementById('ft-nav');
    const collapsed = nav.classList.toggle('ft-nav--collapsed');
    localStorage.setItem('ft-nav-collapsed', String(collapsed));
  }

  function _restoreState() {
    _restoreDesktopCollapse();
    _syncViewportMode();
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

    _bindLocalHandlers(onCurrencyChange);
    _bindGlobalHandlers();
    _restoreState();
    _setMobilePageLabel(window.location.hash.replace('#', '').trim() || 'dashboard');
  }

  function setActivePage(page) {
    document.querySelectorAll('.ft-nav__link').forEach(link => {
      link.classList.toggle('ft-nav__link--active', link.dataset.page === page);
    });

    _setMobilePageLabel(page);

    if (_isMobileViewport()) {
      _closeMobileDrawer();
    }
  }

  return { init, setActivePage };
})();

export { SideBarMenu };
