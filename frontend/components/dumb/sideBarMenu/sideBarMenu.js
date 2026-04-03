// sideBarMenu.js — Dumb sidebar navigation component

import { fetchCustomLinks } from '../../../services/customLinks.js';

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
  let _notesMap = {}; // id -> { label, content }

  function _escapeAttr(value) {
    return String(value ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function _escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function _isMobileViewport() {
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
  }

  function _getLabelForPage(page) {
    return NAV_ITEMS.find(item => item.page === page)?.label || 'Navigation';
  }

  // ── Custom Links ───────────────────────────────────────

  function _buildNoteMap(data) {
    _notesMap = {};
    if (!data) return;
    const all = [...(data.ungrouped || [])];
    (data.groups || []).forEach(g => all.push(...(g.items || [])));
    all.forEach(item => {
      if (item.type === 'note') {
        _notesMap[item.id] = { label: item.label || '', content: item.content || '' };
      }
    });
  }

  function _buildItemHtml(item) {
    const icon = _escapeHtml(item.icon || 'link');
    const label = _escapeHtml(item.label || '');
    const safeAttrLabel = _escapeAttr(item.label || '');

    if (item.type === 'note') {
      return `
        <li class="ft-nav__links-item" data-tooltip="${safeAttrLabel}">
          <button class="ft-nav__links-btn ft-nav__links-btn--note" type="button"
                  data-ql-note-id="${_escapeAttr(item.id)}" aria-label="${safeAttrLabel}">
            <span class="material-symbols-outlined ft-nav__links-item-icon" aria-hidden="true">${icon}</span>
            <span class="ft-nav__links-item-label">${label}</span>
          </button>
        </li>`;
    }

    const url = _escapeAttr(item.url || '#');
    return `
      <li class="ft-nav__links-item" data-tooltip="${safeAttrLabel}">
        <a class="ft-nav__links-btn ft-nav__links-btn--link" href="${url}"
           target="_blank" rel="noopener noreferrer" aria-label="${safeAttrLabel}">
          <span class="material-symbols-outlined ft-nav__links-item-icon" aria-hidden="true">${icon}</span>
          <span class="ft-nav__links-item-label">${label}</span>
        </a>
      </li>`;
  }

  function _buildCustomLinksHTML(data) {
    if (!data) return '';
    const { groups = [], ungrouped = [] } = data;
    if (!groups.length && !ungrouped.length) return '';

    const groupsHtml = groups.map(group => {
      const id = _escapeAttr(group.id || '');
      const label = _escapeHtml(group.label || 'Group');
      const safeAttrLabel = _escapeAttr(group.label || 'Group');
      const itemsHtml = (group.items || []).map(_buildItemHtml).join('');
      return `
        <div class="ft-nav__links-group" data-ql-group-id="${id}">
          <button class="ft-nav__links-group-btn" type="button"
                  data-tooltip="${safeAttrLabel}" aria-expanded="true">
            <span class="material-symbols-outlined ft-nav__links-group-icon" aria-hidden="true">folder</span>
            <span class="ft-nav__links-group-label">${label}</span>
            <span class="material-symbols-outlined ft-nav__links-group-chevron" aria-hidden="true">expand_more</span>
          </button>
          <ul class="ft-nav__links-list" role="list">${itemsHtml}</ul>
        </div>`;
    }).join('');

    const ungroupedHtml = ungrouped.length
      ? `<ul class="ft-nav__links-list ft-nav__links-list--root" role="list">
           ${ungrouped.map(_buildItemHtml).join('')}
         </ul>`
      : '';

    return `
      <div class="ft-nav__links-header" data-tooltip="Quick Links">
        <span class="material-symbols-outlined ft-nav__links-header-icon" aria-hidden="true">bookmarks</span>
        <span class="ft-nav__links-header-label">Quick Links</span>
      </div>
      ${groupsHtml}
      ${ungroupedHtml}`;
  }

  function _renderCustomLinks(data) {
    const el = document.getElementById('ft-nav-links');
    if (!el) return;

    const html = _buildCustomLinksHTML(data);
    if (!html) {
      el.hidden = true;
      return;
    }

    el.innerHTML = html;
    el.hidden = false;
    _bindCustomLinksHandlers();
  }

  function _bindCustomLinksHandlers() {
    // Group toggle — only in expanded mode
    document.querySelectorAll('.ft-nav__links-group-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (document.getElementById('ft-nav')?.classList.contains('ft-nav--collapsed')) return;
        const group = btn.closest('.ft-nav__links-group');
        if (!group) return;
        const isExpanded = btn.getAttribute('aria-expanded') !== 'false';
        btn.setAttribute('aria-expanded', String(!isExpanded));
        group.dataset.collapsed = String(isExpanded);
      });
    });

    // Note popups
    document.querySelectorAll('.ft-nav__links-btn--note').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = btn.dataset.qlNoteId;
        if (_isMobileViewport()) {
          _closeMobileDrawer();
        }
        _showNotePopup(id, btn);
      });
    });
  }

  // ── Note Popup ─────────────────────────────────────────

  function _showNotePopup(id, anchorEl) {
    const note = _notesMap[id];
    if (!note) return;

    _closeNotePopup();

    const popup = document.createElement('div');
    popup.className = 'ft-nav-note-popup';
    popup.id = 'ft-nav-note-popup';
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-modal', 'false');
    popup.setAttribute('aria-label', note.label || 'Note');

    const contentHtml = _escapeHtml(note.content).replace(/\n/g, '<br>');
    popup.innerHTML = `
      <div class="ft-nav-note-popup__header">
        <span class="ft-nav-note-popup__title">${_escapeHtml(note.label)}</span>
        <button class="ft-nav-note-popup__close" type="button" aria-label="Close note">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>
      <p class="ft-nav-note-popup__content">${contentHtml}</p>`;

    document.body.appendChild(popup);

    // Position: to the right of the nav on desktop, centered on mobile
    if (_isMobileViewport()) {
      popup.classList.add('ft-nav-note-popup--mobile');
    } else {
      const navEl = document.getElementById('ft-nav');
      const navRect = navEl ? navEl.getBoundingClientRect() : { right: 56 };
      const anchorRect = anchorEl.getBoundingClientRect();
      const top = Math.min(anchorRect.top, window.innerHeight - 200);
      popup.style.top = `${Math.max(8, top)}px`;
      popup.style.left = `${navRect.right + 8}px`;
    }

    popup.querySelector('.ft-nav-note-popup__close').addEventListener('click', _closeNotePopup);

    // Close on outside click (deferred so this click doesn't immediately close it)
    setTimeout(() => {
      document.addEventListener('click', _onOutsideNoteClick);
      document.addEventListener('keydown', _onNoteKeydown);
    }, 0);
  }

  function _closeNotePopup() {
    const existing = document.getElementById('ft-nav-note-popup');
    if (existing) existing.remove();
    document.removeEventListener('click', _onOutsideNoteClick);
    document.removeEventListener('keydown', _onNoteKeydown);
  }

  function _onOutsideNoteClick(event) {
    const popup = document.getElementById('ft-nav-note-popup');
    if (popup && !popup.contains(event.target)) {
      _closeNotePopup();
    }
  }

  function _onNoteKeydown(event) {
    if (event.key === 'Escape') _closeNotePopup();
  }

  // ── HTML Builder ───────────────────────────────────────

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
      ? `<button
           class="ft-nav__user"
           id="ft-nav-user-btn"
           type="button"
           data-tooltip="${safeUserName}"
           aria-label="Open settings for ${safeUserName}"
           aria-haspopup="dialog"
         >
           <span class="ft-nav__user-icon material-symbols-outlined" aria-hidden="true">account_circle</span>
           <span class="ft-nav__user-name">${safeUserName}</span>
         </button>`
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

          <div class="ft-nav__links" id="ft-nav-links" hidden></div>

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
        _closeNotePopup();
      }
    });
  }

  function _bindLocalHandlers(onCurrencyChange, onOpenSettings) {
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

    const userButton = document.getElementById('ft-nav-user-btn');
    if (userButton && typeof onOpenSettings === 'function') {
      userButton.addEventListener('click', () => {
        if (_isMobileViewport()) {
          _closeMobileDrawer();
        }
        onOpenSettings();
      });
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
   * @param {Function} [opts.onOpenSettings] — () => void
   */
  async function init({ currentCurrency = 'usd', userName = null, onCurrencyChange, onOpenSettings } = {}) {
    const container = document.getElementById('app-nav');
    if (!container) return;

    const currencies = await _currenciesPromise;
    container.innerHTML = _buildHTML(currencies, currentCurrency, userName);

    _bindLocalHandlers(onCurrencyChange, onOpenSettings);
    _bindGlobalHandlers();
    _restoreState();
    _setMobilePageLabel(window.location.hash.replace('#', '').trim() || 'dashboard');

    // Load and render custom links (non-blocking — failure is silent)
    fetchCustomLinks()
      .then(data => {
        _buildNoteMap(data);
        _renderCustomLinks(data);
      })
      .catch(() => {/* custom links are optional */});
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

  /**
   * Re-render the quick links section with new data.
   * Called by the settings modal after saving.
   */
  function updateCustomLinks(data) {
    _buildNoteMap(data);
    _renderCustomLinks(data);
  }

  return { init, setActivePage, updateCustomLinks };
})();

export { SideBarMenu };
