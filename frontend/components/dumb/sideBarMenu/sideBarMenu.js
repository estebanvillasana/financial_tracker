// sideBarMenu.js — Dumb sidebar navigation component

const SideBarMenu = (() => {
  const NAV_ITEMS = [
    { page: 'dashboard',     icon: 'home',          label: 'Dashboard'     },
    { page: 'movements',     icon: 'receipt_long',  label: 'Movements'     },
    { page: 'add-movements', icon: 'post_add',      label: 'Add Movements' },
    { page: 'transfers',     icon: 'sync_alt',      label: 'Transfers'     },
    { page: 'categories',    icon: 'sell',          label: 'Categories'    },
    { page: 'repetitive',    icon: 'event_repeat',  label: 'Repetitive'    },
  ];

  function _buildHTML() {
    const items = NAV_ITEMS.map(({ page, icon, label }) => `
      <li class="ft-nav__item" data-tooltip="${label}">
        <a class="ft-nav__link" href="#${page}" data-page="${page}">
          <span class="ft-nav__link-icon material-symbols-outlined" aria-hidden="true">${icon}</span>
          <span class="ft-nav__link-label">${label}</span>
        </a>
      </li>`).join('');

    return `
      <nav class="ft-nav" id="ft-nav" aria-label="Main navigation">
        <div class="ft-nav__brand">
          <span class="ft-nav__brand-icon material-symbols-outlined" aria-hidden="true">account_balance</span>
          <span class="ft-nav__brand-name">Financial Tracker</span>
        </div>

        <ul class="ft-nav__menu" role="list">
          ${items}
        </ul>

        <div class="ft-nav__footer">
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

  function init() {
    const container = document.getElementById('app-nav');
    if (!container) return;
    container.innerHTML = _buildHTML();
    document.getElementById('ft-nav-collapse-btn')?.addEventListener('click', _toggleCollapse);
    _restoreState();
  }

  function setActivePage(page) {
    document.querySelectorAll('.ft-nav__link').forEach(link => {
      link.classList.toggle('ft-nav__link--active', link.dataset.page === page);
    });
  }

  return { init, setActivePage };
})();
