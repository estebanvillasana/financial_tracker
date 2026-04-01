/**
 * currencySummary.js
 *
 * Smart component: aggregates active bank accounts by currency and renders
 * per-currency stats (balance, available, savings, debts) as a tabbed panel.
 *
 * Receives pre-fetched accounts and FX rates from the dashboard so no
 * additional API calls are made here — all rendering is synchronous.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *   import { CurrencySummary } from './components/smart/currencySummary/currencySummary.js';
 *
 *   CurrencySummary.render('#my-container', { accounts, rates, mainCurrency });
 *
 * ── options ──────────────────────────────────────────────────────────────────
 *   accounts:     object[]  — active bank accounts (from fetchDashboardData)
 *   rates:        object    — FX rates map { USD: 1, MXN: 17.5, ... } (base USD)
 *   mainCurrency: string    — user's main currency code (e.g. 'USD')
 *
 * ── Tab behaviour ─────────────────────────────────────────────────────────────
 *   One tab is shown per currency whose aggregated values are not all zero.
 *   Currencies whose balances, savings, available funds, and debts all resolve
 *   to 0 are hidden from the widget.
 *   Currencies with no accounts at all are not shown.
 *   Clicking a tab synchronously swaps the 4 stat cards below it.
 *   The default active tab is the main currency if present; otherwise the first.
 *
 * ── Card layout ───────────────────────────────────────────────────────────────
 *   Each tab renders 4 InfoCards:
 *     Balance   — sum of non-savings accounts (any sign)
 *     Available — sum of non-savings accounts with a positive balance
 *     Savings   — sum of Savings-type accounts
 *     Debts     — absolute sum of accounts with a negative balance
 *   All values are in the tab's native currency.
 *   The subValue line shows the converted equivalent in the main currency
 *   (omitted when the tab currency equals the main currency).
 */

import { getMainCurrency } from '../../../appSettings.js';
import { InfoCard } from '../../dumb/infoCard/infoCard.js';
import { normalizeCurrency, formatMoneyFromCents } from '../../../utils/formatters.js';

const CurrencySummary = (() => {

  function _escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Converts cents from one currency to another using the pre-fetched rates map.
   * Returns the raw input unchanged when source equals target or rates are missing.
   *
   * @param {number} cents
   * @param {string} srcCurrency
   * @param {string} mainCurrency
   * @param {object} rates        — { USD: 1, MXN: 17.5, ... }
   * @returns {number}
   */
  function _convertCents(cents, srcCurrency, mainCurrency, rates) {
    const src = normalizeCurrency(srcCurrency);
    const tgt = normalizeCurrency(mainCurrency);
    if (!src || src === tgt) return cents;
    const srcRate = rates[src];
    const tgtRate = rates[tgt] ?? 1;
    if (!srcRate) return cents;
    return Math.round(cents * tgtRate / srcRate);
  }

  /**
   * Groups accounts by currency and computes per-currency balance totals.
   * Returns one entry per currency whose aggregated values are not all zero.
   *
   * @param {object[]} accounts
   * @returns {object[]}  Sorted: main-currency first, rest alphabetically.
   */
  function _aggregateByCurrency(accounts, mainCurrency) {
    const map = new Map();

    for (const acct of accounts) {
      const curr = normalizeCurrency(acct.currency);
      if (!curr) continue;

      const cents     = Number(acct.total_balance ?? 0);
      const isSavings = acct.type === 'Savings';

      if (!map.has(curr)) {
        map.set(curr, {
          currency:      curr,
          total:         0,   // all accounts any sign (incl. savings)
          available:     0,   // non-savings accounts with positive balance
          savings:       0,
          debts:         0,
          // per-card account counts
          totalCount:      0,
          availableCount:  0,
          savingsCount:    0,
          debtCount:       0,
        });
      }

      const e = map.get(curr);

      if (isSavings) {
        e.savings += cents;
        e.savingsCount++;
      }

      if (cents > 0) {
        e.total += cents;
        e.totalCount++;
        if (!isSavings) {
          e.available += cents;
          e.availableCount++;
        }
      }

      if (cents < 0) {
        e.debts += cents;
        e.debtCount++;
      }
    }

    const entries = [...map.values()].filter(entry =>
      entry.total !== 0
      || entry.available !== 0
      || entry.savings !== 0
      || entry.debts !== 0
    );

    // Sort: main currency tab first, then alphabetically.
    entries.sort((a, b) => {
      if (a.currency === mainCurrency) return -1;
      if (b.currency === mainCurrency) return  1;
      return a.currency.localeCompare(b.currency);
    });

    return entries;
  }

  // ── HTML builders ─────────────────────────────────────────────────────────

  function _buildLoadingHTML() {
    return `
      <div class="ft-currency-summary" aria-busy="true" aria-label="Loading currency summary">
        <header class="ft-currency-summary__header">
          <div class="ft-currency-summary__skeleton ft-currency-summary__skeleton--title"></div>
          <div class="ft-currency-summary__skeleton ft-currency-summary__skeleton--count"></div>
        </header>
        <div class="ft-currency-summary__skeleton ft-currency-summary__skeleton--tabs"></div>
        <div class="ft-currency-summary__skeleton ft-currency-summary__skeleton--cards"></div>
      </div>`;
  }

  function _buildWidgetHTML() {
    return `
      <div class="ft-currency-summary">
        <header class="ft-currency-summary__header">
          <h3 class="ft-currency-summary__title">Currency Summary</h3>
          <span class="ft-currency-summary__count" data-currency-summary-count aria-live="polite"></span>
        </header>
        <div class="ft-currency-summary__tabs" data-currency-summary-tabs role="tablist" aria-label="Select currency"></div>
        <div class="ft-stats-row ft-currency-summary__cards" data-currency-summary-cards aria-live="polite"></div>
      </div>`;
  }

  function _buildEmptyHTML(hasAccounts) {
    return `
      <div class="ft-empty">
        <span class="ft-empty__icon material-symbols-outlined" aria-hidden="true">currency_exchange</span>
        <span>${hasAccounts ? 'No non-zero currency balances to summarize yet.' : 'No accounts found.'}</span>
      </div>`;
  }

  // ── DOM updaters ──────────────────────────────────────────────────────────

  /**
   * Re-renders the tab buttons.
   */
  function _renderTabs(tabsEl, entries, activeCurrency) {
    tabsEl.innerHTML = entries.map(e => {
      const active = e.currency === activeCurrency;
      return `<button
        class="ft-currency-summary__tab${active ? ' ft-currency-summary__tab--active' : ''}"
        data-currency-tab="${_escapeHtml(e.currency)}"
        role="tab"
        aria-selected="${active}"
        type="button"
      >${_escapeHtml(e.currency)}</button>`;
    }).join('');
  }

  /**
   * Re-renders the 4 stat InfoCards for the given currency entry.
   */
  function _renderCards(cardsEl, entry, mainCurrency, rates) {
    cardsEl.innerHTML = '';

    const curr       = entry.currency;
    const isSameCurr = curr === mainCurrency;

    /** Formatted native amount. */
    function _fmt(cents) {
      return formatMoneyFromCents(cents, curr);
    }

    /** Converted subValue line — shows the main-currency equivalent. */
    function _sub(cents) {
      if (isSameCurr) return `In ${curr}`;
      const converted = _convertCents(cents, curr, mainCurrency, rates);
      return `\u2248 ${formatMoneyFromCents(converted, mainCurrency)}`;
    }

    const { totalCount, availableCount, savingsCount, debtCount } = entry;

    const cards = [
      {
        data: {
          icon:     'account_balance',
          label:    'Total',
          value:    _fmt(entry.total),
          subValue: _sub(entry.total),
          note:     `${totalCount} account${totalCount !== 1 ? 's' : ''} with positive balance`,
        },
        options: { variant: entry.total < 0 ? 'danger' : 'accent' },
      },
      {
        data: {
          icon:     'payments',
          label:    'Available',
          value:    _fmt(entry.available),
          subValue: _sub(entry.available),
          note:     `${availableCount} account${availableCount !== 1 ? 's' : ''} with positive balance`,
        },
        options: { variant: 'success' },
      },
      {
        data: {
          icon:     'savings',
          label:    'Savings',
          value:    _fmt(entry.savings),
          subValue: _sub(entry.savings),
          note:     `${savingsCount} savings account${savingsCount !== 1 ? 's' : ''}`,
        },
        options: { variant: 'success' },
      },
      {
        data: {
          icon:     entry.debts < 0 ? 'credit_score' : 'check_circle',
          label:    'Debts',
          value:    _fmt(Math.abs(entry.debts)),
          subValue: _sub(Math.abs(entry.debts)),
          note:     entry.debts < 0
            ? `${debtCount} account${debtCount !== 1 ? 's' : ''} in the negative`
            : 'No outstanding debts',
        },
        options: { variant: entry.debts < 0 ? 'danger' : 'default' },
      },
    ];

    for (const card of cards) {
      cardsEl.appendChild(InfoCard.createElement(card.data, card.options));
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Mounts the currency summary widget into the target element.
   *
   * @param {string|HTMLElement} target
   * @param {object}             params
   * @param {object[]}           [params.accounts=[]]       — active bank accounts
   * @param {object}             [params.rates={}]          — FX rates map (base USD)
   * @param {string}             [params.mainCurrency]      — user's main currency code
   * @returns {HTMLElement|null}
   */
  function render(target, { accounts = [], rates = {}, mainCurrency } = {}) {
    const container = typeof target === 'string' ? document.querySelector(target) : target;
    if (!container) return null;

    const tgt = normalizeCurrency(mainCurrency || getMainCurrency());

    // ── 1. Aggregate ──────────────────────────────────────────────────────────
    const entries = _aggregateByCurrency(accounts, tgt);

    if (entries.length === 0) {
      container.innerHTML = _buildEmptyHTML(accounts.length > 0);
      return null;
    }

    // ── 2. Mount shell ────────────────────────────────────────────────────────
    container.innerHTML = _buildWidgetHTML();
    const root    = container.querySelector('.ft-currency-summary');
    const tabsEl  = root.querySelector('[data-currency-summary-tabs]');
    const cardsEl = root.querySelector('[data-currency-summary-cards]');
    const countEl = root.querySelector('[data-currency-summary-count]');

    countEl.textContent = `${entries.length} currenc${entries.length !== 1 ? 'ies' : 'y'}`;

    // ── 3. Active tab (default: main currency if present, else first) ─────────
    let activeCurrency = entries.find(e => e.currency === tgt)?.currency
      ?? entries[0].currency;

    // ── 4. Show-tab helper ────────────────────────────────────────────────────
    function _showTab(currency) {
      activeCurrency = currency;
      _renderTabs(tabsEl, entries, activeCurrency);
      const entry = entries.find(e => e.currency === activeCurrency);
      if (entry) _renderCards(cardsEl, entry, tgt, rates);
    }

    // ── 5. Tab delegation ─────────────────────────────────────────────────────
    tabsEl.addEventListener('click', event => {
      const btn = event.target.closest('[data-currency-tab]');
      if (!btn) return;
      const currency = btn.dataset.currencyTab;
      if (currency && currency !== activeCurrency) _showTab(currency);
    });

    // ── 6. Initial render ─────────────────────────────────────────────────────
    _showTab(activeCurrency);

    return root;
  }

  return { render };
})();

export { CurrencySummary };
