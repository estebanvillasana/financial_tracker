/**
 * accountsSummary.js
 *
 * Smart component: fetches all active bank accounts and renders them as a
 * filterable, paginated grid of accountSummaryCard widgets.
 *
 * "Smart" means this component owns the full lifecycle: data-fetching,
 * client-side state, and interaction wiring. The dumb components it uses
 * (AccountSummaryCard, FilterBar, Pagination) are pure renderers — they
 * receive data and return HTML/elements.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *   import { AccountsSummary } from './components/smart/accountsSummary/accountsSummary.js';
 *
 *   await AccountsSummary.render('#my-container', {
 *     pageSize:        5,
 *     defaultCurrency: 'USD',
 *     title:           'Active Accounts',
 *   });
 *
 * ── options ─────────────────────────────────────────────────────────────────
 *   pageSize:        number  — cards per page (default: 5)
 *   columns:         1 | 2   — grid column count (default: 2)
 *   defaultCurrency: string  — ISO 4217 code used as target for FX conversion labels
 *                              (falls back to finalAppConfig.currency)
 *   title:           string  — widget header label (default: 'Active Accounts')
 *
 * ── Filters (client-side, derived from fetched data) ────────────────────────
 *   Currency — unique currency codes present in the accounts
 *   Type     — unique account types present in the accounts
 *   Owner    — unique owners present in the accounts
 *   All three are <select> dropdowns. Selecting the empty "All …" option
 *   clears that filter. Multiple filters are ANDed together.
 *
 * ── Data flow ────────────────────────────────────────────────────────────────
 *   1. Fetch all active accounts once on mount (bankAccounts.getAll({ active: 1 }))
 *   2. Store full list → apply client-side filters → paginate → render
 *   3. On filter change: reset to page 1, re-filter, re-render
 *   4. On page change: update page, re-render cards + pagination
 *
 * ── State isolation ──────────────────────────────────────────────────────────
 *   Each render() call creates its own closure with independent state
 *   (accounts, filters, page, render token). Multiple widget instances on the
 *   same page do not share state.
 *
 * ── Render token ─────────────────────────────────────────────────────────────
 *   The FX conversion fetch inside each card is async. If the user rapidly
 *   changes pages or filters, multiple async renders may be in flight at once.
 *   The render token is a monotonically increasing integer; each updateView()
 *   increments it, and async operations check it before committing their result
 *   to the DOM. Stale renders are silently discarded.
 */

import { finalAppConfig } from '../../../defaults.js';
import { bankAccounts }   from '../../../services/api.js';
import { AccountSummaryCard } from '../../dumb/accountSummaryCard/accountSummaryCard.js';
import { FilterBar }          from '../../dumb/filterBar/filterBar.js';
import { Pagination }         from '../../dumb/pagination/pagination.js';

const AccountsSummary = (() => {

  const DEFAULT_PAGE_SIZE = 5;

  // ─── Private helpers: data ────────────────────────────────────────────────────

  function _normalizeCurrency(code) {
    return String(code || '').trim().toUpperCase();
  }

  /**
   * Returns a sorted, deduplicated array from the input, ignoring empty values.
   * @param {string[]} arr
   * @returns {string[]}
   */
  function _unique(arr) {
    return [...new Set(arr.filter(v => v !== null && v !== undefined && String(v).trim() !== ''))].sort();
  }

  /**
   * Derives unique filter option arrays directly from the loaded account list.
   * Options update automatically after each fetch, reflecting the actual data.
   *
   * @param {object[]} accounts
   * @returns {{ currencies: string[], types: string[], owners: string[] }}
   */
  function _deriveFilterOptions(accounts) {
    return {
      currencies: _unique(accounts.map(a => _normalizeCurrency(a.currency))),
      types:      _unique(accounts.map(a => String(a.type  || '').trim())),
      owners:     _unique(accounts.map(a => String(a.owner || '').trim())),
    };
  }

  /**
   * Builds the FilterBar config from account-derived options and current filter state.
   * The first option of each select is always an "All …" entry with an empty string value.
   *
   * @param {object[]} accounts        Full account list (used to derive options).
   * @param {object}   currentFilters  Current { currency, type, owner } values.
   * @returns {object}                 FilterBar config object.
   */
  function _buildFilterConfig(accounts, currentFilters) {
    const { currencies, types, owners } = _deriveFilterOptions(accounts);
    return {
      fields: [
        {
          id:      'currency',
          label:   'Currency',
          type:    'select',
          value:   currentFilters.currency || '',
          options: [
            { value: '', label: 'All currencies' },
            ...currencies.map(c => ({ value: c, label: c })),
          ],
        },
        {
          id:      'type',
          label:   'Type',
          type:    'select',
          value:   currentFilters.type || '',
          options: [
            { value: '', label: 'All types' },
            ...types.map(t => ({ value: t, label: t })),
          ],
        },
        {
          id:      'owner',
          label:   'Owner',
          type:    'select',
          value:   currentFilters.owner || '',
          options: [
            { value: '', label: 'All owners' },
            ...owners.map(o => ({ value: o, label: o })),
          ],
        },
      ],
    };
  }

  /**
   * Applies filter values against the full account list.
   * An empty/falsy filter value = no constraint on that field.
   * Multiple active filters are ANDed: an account must pass all of them.
   *
   * @param {object[]} accounts
   * @param {{ currency: string, type: string, owner: string }} filters
   * @returns {object[]}
   */
  function _filterAccounts(accounts, filters) {
    return accounts.filter(account => {
      if (filters.currency &&
          _normalizeCurrency(account.currency) !== _normalizeCurrency(filters.currency)) {
        return false;
      }
      if (filters.type &&
          String(account.type  || '').trim() !== String(filters.type  || '').trim()) {
        return false;
      }
      if (filters.owner &&
          String(account.owner || '').trim() !== String(filters.owner || '').trim()) {
        return false;
      }
      return true;
    });
  }

  // ─── Private helpers: HTML builders ──────────────────────────────────────────

  /**
   * Returns the CSS class string for the accounts grid based on the columns option.
   * @param {number} columns  1 or 2.
   * @returns {string}
   */
  function _gridClass(columns) {
    return columns === 1
      ? 'ft-accounts-grid ft-accounts-grid--cols-1'
      : 'ft-accounts-grid';
  }

  function _escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Builds the initial loading skeleton shown while the API fetch is in flight.
   * Mirrors the widget's structural regions (header, toolbar, grid, pagination)
   * so the page layout is stable and there is no blank flash.
   *
   * @param {number} pageSize  Number of skeleton card placeholders to render.
   * @param {number} columns   Grid column count (1 or 2).
   * @returns {string}
   */
  function _buildLoadingHTML(pageSize, columns) {
    const cardSkeletons = Array.from({ length: pageSize }, () =>
      `<div class="ft-accounts-summary__card-skeleton" aria-hidden="true"></div>`
    ).join('');

    return `
      <div class="ft-accounts-summary" aria-busy="true" aria-label="Loading accounts">
        <header class="ft-accounts-summary__header">
          <div class="ft-accounts-summary__skeleton ft-accounts-summary__skeleton--title"></div>
          <div class="ft-accounts-summary__skeleton ft-accounts-summary__skeleton--count"></div>
        </header>
        <div class="ft-accounts-summary__skeleton ft-accounts-summary__skeleton--toolbar"></div>
        <div class="${_gridClass(columns)}">${cardSkeletons}</div>
        <div class="ft-accounts-summary__skeleton ft-accounts-summary__skeleton--pagination"></div>
      </div>`;
  }

  /**
   * Builds the permanent widget shell HTML.
   * Each interactive region is an empty placeholder identified by a data-* attribute;
   * their contents are managed entirely by the render lifecycle.
   *
   * @param {string} title    Widget header label.
   * @param {number} columns  Grid column count (1 or 2).
   * @returns {string}
   */
  function _buildWidgetHTML(title, columns) {
    return `
      <div class="ft-accounts-summary">
        <header class="ft-accounts-summary__header">
          <h3 class="ft-accounts-summary__title">${_escapeHtml(title || 'Active Accounts')}</h3>
          <span class="ft-accounts-summary__count" data-accounts-summary-count aria-live="polite"></span>
        </header>
        <div data-accounts-summary-toolbar></div>
        <div class="${_gridClass(columns)}" data-accounts-summary-grid></div>
        <div data-accounts-summary-pagination></div>
      </div>`;
  }

  /**
   * Builds the empty state for the card grid.
   *
   * @param {boolean} isFiltered  True when accounts exist but none match the active filters.
   *                              Shows a different message than the no-accounts-at-all case.
   * @returns {string}
   */
  function _buildEmptyStateHTML(isFiltered) {
    const msg = isFiltered
      ? 'No accounts match the selected filters.'
      : 'No active accounts found.';
    return `
      <div class="ft-empty">
        <span class="ft-empty__icon material-symbols-outlined" aria-hidden="true">account_balance</span>
        <span>${_escapeHtml(msg)}</span>
      </div>`;
  }

  /**
   * Builds the error state for the full container when the API fetch fails.
   *
   * @param {string} message  Error message from the caught exception.
   * @returns {string}
   */
  function _buildErrorHTML(message) {
    return `
      <div class="ft-page__error">
        <span class="ft-page__error-icon material-symbols-outlined" aria-hidden="true">error_outline</span>
        <span>${_escapeHtml(message || 'Failed to load accounts.')}</span>
      </div>`;
  }

  // ─── Private helpers: DOM updates ────────────────────────────────────────────

  /**
   * Updates the account count chip in the widget header.
   * Shows "N accounts" when no filter is active, "N of M" when filtered.
   *
   * @param {HTMLElement} countEl
   * @param {number}      filteredCount
   * @param {number}      totalCount
   */
  function _updateCount(countEl, filteredCount, totalCount) {
    if (!countEl) return;
    if (filteredCount === totalCount) {
      countEl.textContent = `${totalCount} account${totalCount !== 1 ? 's' : ''}`;
    } else {
      countEl.textContent = `${filteredCount} of ${totalCount}`;
    }
  }

  /**
   * Re-renders the Pagination controls into the pagination container.
   * Empties the container when there is only one page or no items — no pagination
   * needed for a single page.
   *
   * @param {HTMLElement} paginationEl
   * @param {number}      totalItems
   * @param {number}      page
   * @param {number}      pageSize
   */
  function _renderPagination(paginationEl, totalItems, page, pageSize) {
    if (!paginationEl) return;
    const totalPages = Math.ceil(totalItems / pageSize);
    if (totalItems === 0 || totalPages <= 1) {
      paginationEl.innerHTML = '';
      return;
    }
    paginationEl.innerHTML = Pagination.buildHTML({
      totalItems,
      page,
      pageSize,
      maxVisiblePages: 5,
    });
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Mounts the accounts summary widget into the target element.
   *
   * Full lifecycle:
   *  1. Mounts a loading skeleton so there is no blank flash during the fetch.
   *  2. Fetches all active accounts (bankAccounts.getAll({ active: 1 })).
   *  3. On API failure: shows an error state and returns null.
   *  4. Replaces skeleton with the permanent widget shell.
   *  5. Renders the FilterBar with options derived from the fetched account data.
   *  6. Wires pagination via event delegation on a persistent container, so
   *     pagination HTML can be re-rendered on each page change without losing listeners.
   *  7. Renders the first page of cards (each card fetches its own FX conversion).
   *
   * @param {string|HTMLElement} target
   * @param {object}             [options={}]
   * @param {number}             [options.pageSize=5]
   * @param {1|2}                [options.columns=2]      Grid column count.
   * @param {string}             [options.defaultCurrency]
   * @param {string}             [options.title='Active Accounts']
   * @returns {Promise<HTMLElement|null>}
   */
  async function render(target, options = {}) {
    const container = typeof target === 'string' ? document.querySelector(target) : target;
    if (!container) return null;

    const pageSize        = Math.max(1, Number(options.pageSize) || DEFAULT_PAGE_SIZE);
    const columns         = Math.max(1, Math.min(2, Number(options.columns) || 2));
    const defaultCurrency = String(options.defaultCurrency || finalAppConfig.currency || '');

    // ── Per-instance closure state ────────────────────────────────────────────────
    let allAccounts      = [];
    let filteredAccounts = [];
    let currentPage      = 1;
    let currentFilters   = { currency: '', type: '', owner: '' };

    // Render token: incremented on every updateView(). Async card renders check this
    // before committing to the DOM so a slow FX fetch won't overwrite a newer render.
    let renderToken = 0;

    // ── 1. Loading skeleton ───────────────────────────────────────────────────────
    container.innerHTML = _buildLoadingHTML(pageSize, columns);

    // ── 2. Fetch active accounts ──────────────────────────────────────────────────
    try {
      const result = await bankAccounts.getAll({ active: 1 });
      allAccounts = Array.isArray(result) ? result : [];
    } catch (err) {
      container.innerHTML = _buildErrorHTML(err?.message);
      return null;
    }

    filteredAccounts = [...allAccounts];

    // ── 3. Mount widget shell ─────────────────────────────────────────────────────
    container.innerHTML = _buildWidgetHTML(options.title, columns);
    const root         = container.querySelector('.ft-accounts-summary');
    const toolbarEl    = root.querySelector('[data-accounts-summary-toolbar]');
    const gridEl       = root.querySelector('[data-accounts-summary-grid]');
    const paginationEl = root.querySelector('[data-accounts-summary-pagination]');
    const countEl      = root.querySelector('[data-accounts-summary-count]');

    // ── Card page renderer (async, token-protected) ───────────────────────────────
    /**
     * Renders the current page of account cards into the grid.
     * Shows skeleton placeholders immediately, then replaces them with real cards
     * after all FX conversions resolve in parallel.
     */
    async function _renderCurrentPageCards() {
      const token        = ++renderToken;
      const startIndex   = (currentPage - 1) * pageSize;
      const pageAccounts = filteredAccounts.slice(startIndex, startIndex + pageSize);

      // Immediately clear the grid and show skeleton cards as placeholders.
      gridEl.innerHTML = '';

      if (pageAccounts.length === 0) {
        const hasActiveFilter = !!(
          currentFilters.currency || currentFilters.type || currentFilters.owner
        );
        gridEl.innerHTML = _buildEmptyStateHTML(hasActiveFilter);
        return;
      }

      for (let i = 0; i < pageAccounts.length; i++) {
        const skeleton = document.createElement('div');
        skeleton.className = 'ft-accounts-summary__card-skeleton';
        skeleton.setAttribute('aria-hidden', 'true');
        gridEl.appendChild(skeleton);
      }

      // Fetch FX conversions for all cards on this page concurrently.
      // createElementWithLatestConversion handles the currencies.json load,
      // the FX API call, and HTML building internally.
      const elements = await Promise.all(
        pageAccounts.map(account =>
          AccountSummaryCard.createElementWithLatestConversion(account, { defaultCurrency })
        )
      );

      // A newer render was triggered while waiting — discard this result.
      if (token !== renderToken) return;

      gridEl.innerHTML = '';
      elements.forEach(el => { if (el) gridEl.appendChild(el); });
    }

    // ── Full view update ──────────────────────────────────────────────────────────
    /**
     * Re-renders all dynamic regions based on current state.
     * Called on initial mount and on every filter/page change.
     */
    async function updateView() {
      // Clamp page if filtering reduced the total page count below currentPage.
      const totalPages = Math.max(1, Math.ceil(filteredAccounts.length / pageSize));
      if (currentPage > totalPages) currentPage = totalPages;

      _updateCount(countEl, filteredAccounts.length, allAccounts.length);
      await _renderCurrentPageCards();
      _renderPagination(paginationEl, filteredAccounts.length, currentPage, pageSize);
    }

    // ── 4. FilterBar ──────────────────────────────────────────────────────────────
    // Rendered once from data-derived options. Stays mounted; only the card grid
    // and pagination change when filters are applied.
    FilterBar.render(
      toolbarEl,
      { ..._buildFilterConfig(allAccounts, currentFilters), variant: 'bare', hideLabels: false },
      {
        onFilterChange: values => {
          currentFilters   = values;
          currentPage      = 1; // Reset to first page on any filter change.
          filteredAccounts = _filterAccounts(allAccounts, currentFilters);
          updateView();
        },
      }
    );

    // ── 5. Pagination (event delegation on persistent container) ──────────────────
    // We delegate clicks on the outer `paginationEl` wrapper (not the inner
    // .ft-pagination element) so the listener survives the innerHTML replacement
    // that _renderPagination performs on every page change.
    paginationEl.addEventListener('click', event => {
      const totalPages = Math.max(1, Math.ceil(filteredAccounts.length / pageSize));

      // Click on a numbered page button.
      const pageBtn = event.target.closest('[data-page-index]');
      if (pageBtn) {
        const next = Number(pageBtn.dataset.pageIndex);
        if (Number.isFinite(next) && next !== currentPage) {
          currentPage = Math.min(Math.max(next, 1), totalPages);
          updateView();
        }
        return;
      }

      // Click on the prev/next arrow buttons.
      const actionBtn = event.target.closest('[data-page-action]');
      if (!actionBtn) return;

      if (actionBtn.dataset.pageAction === 'prev' && currentPage > 1) {
        currentPage--;
        updateView();
      } else if (actionBtn.dataset.pageAction === 'next' && currentPage < totalPages) {
        currentPage++;
        updateView();
      }
    });

    // ── 6. Initial render ─────────────────────────────────────────────────────────
    await updateView();

    return root;
  }

  return { render };
})();

export { AccountsSummary };
