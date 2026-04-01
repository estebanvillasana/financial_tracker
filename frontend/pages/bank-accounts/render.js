/**
 * render.js — Account card rendering for the Bank Accounts page.
 *
 * Renders a grid of account cards, each showing key info at a glance.
 * Follows the existing card-grid pattern (categories page).
 */

import { escapeHtml } from '../../utils/formHelpers.js';
import { getMainCurrency } from '../../appSettings.js';
import {
  formatMoneyFromCents,
  getCurrencySymbol,
  normalizeCurrency,
} from '../../utils/formatters.js';
import { fxRates } from '../../services/api.js';

/* ── Constants ────────────────────────────────────────── */

const TYPE_ICON = {
  'Bank Account':   'account_balance',
  'Credit Card':    'credit_card',
  Savings:          'savings',
  'Crypto Wallet':  'currency_bitcoin',
  'Money Bag':      'account_balance_wallet',
};

const INTEGER_FMT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function _fmtCount(v) {
  const n = Number(v);
  return Number.isFinite(n) ? INTEGER_FMT.format(Math.max(0, Math.trunc(n))) : '0';
}

/* ── FX Conversion ────────────────────────────────────── */

async function _getConvertedCents(account, defaultCurrency) {
  const accountCurrency = normalizeCurrency(account?.currency || defaultCurrency);
  const targetCurrency = normalizeCurrency(defaultCurrency);
  const totalBalanceCents = Number(account?.total_balance ?? 0);

  if (!accountCurrency || !targetCurrency || accountCurrency === targetCurrency) return null;

  const directPair = `${accountCurrency}${targetCurrency}`;
  const reversePair = `${targetCurrency}${accountCurrency}`;
  let rate = null;

  try {
    const direct = await fxRates.getLatestByPair(directPair);
    const directRate = Number(direct?.rate);
    if (Number.isFinite(directRate)) rate = directRate;
  } catch { /* ignore */ }

  if (!Number.isFinite(rate)) {
    try {
      const reverse = await fxRates.getLatestByPair(reversePair);
      const inverseRate = Number(reverse?.inverse_rate);
      const reverseRate = Number(reverse?.rate);
      if (Number.isFinite(inverseRate)) {
        rate = inverseRate;
      } else if (Number.isFinite(reverseRate) && reverseRate !== 0) {
        rate = 1 / reverseRate;
      }
    } catch {
      return null;
    }
  }

  if (!Number.isFinite(rate)) return null;
  return Math.round((Number.isFinite(totalBalanceCents) ? totalBalanceCents : 0) * rate);
}

/* ── Public API ───────────────────────────────────────── */

/**
 * Renders the full account card grid into `container`.
 *
 * @param {HTMLElement}  container
 * @param {object[]}     accounts   - Account records from the API.
 * @param {object}       callbacks  - { onClick }
 */
export function renderAccountCards(container, accounts, callbacks) {
  if (!container) return;

  if (!accounts.length) {
    container.innerHTML = `
      <div class="ft-bank-accounts-grid">
        <div class="ft-empty" style="grid-column: 1 / -1;">
          <span class="ft-empty__icon material-symbols-outlined" aria-hidden="true">account_balance</span>
          <p class="ft-small">No accounts found</p>
        </div>
      </div>`;
    return;
  }

  const defaultCurrency = normalizeCurrency(getMainCurrency());
  const cards = accounts.map(acc => _buildAccountCard(acc, defaultCurrency)).join('');
  container.innerHTML = `<div class="ft-bank-accounts-grid">${cards}</div>`;

  // Async: fill in converted balances
  _fillConvertedBalances(container, accounts, defaultCurrency);

  _hydrateCards(container, accounts, callbacks);
}

/**
 * Renders summary stat cards into the stats container.
 *
 * @param {HTMLElement} container
 * @param {object[]}    accounts  - All loaded accounts (before filtering).
 */
export function renderStats(container, accounts) {
  if (!container) return;

  const active = accounts.filter(a => Number(a.active) === 1);
  const inactive = accounts.filter(a => Number(a.active) === 0);
  const defaultCurrency = normalizeCurrency(getMainCurrency());

  // Group by type
  const byType = {};
  for (const acc of active) {
    const type = acc.type || 'Other';
    byType[type] = (byType[type] || 0) + 1;
  }

  const totalMovements = active.reduce((sum, a) => sum + Number(a.net_movements || 0), 0);

  container.innerHTML = `
    <div class="ft-card ft-stat-card">
      <span class="ft-label">Active Accounts</span>
      <span class="ft-h2 ft-stat-card__value">${active.length}</span>
    </div>
    <div class="ft-card ft-stat-card">
      <span class="ft-label">Inactive</span>
      <span class="ft-h2 ft-stat-card__value${inactive.length > 0 ? ' ft-stat-card__value--danger' : ''}">${inactive.length}</span>
    </div>
    <div class="ft-card ft-stat-card">
      <span class="ft-label">Total Movements</span>
      <span class="ft-h2 ft-stat-card__value">${_fmtCount(totalMovements)}</span>
    </div>
    <div class="ft-card ft-stat-card">
      <span class="ft-label">Account Types</span>
      <span class="ft-h2 ft-stat-card__value">${Object.keys(byType).length}</span>
    </div>`;
}

/* ── Private: card HTML ───────────────────────────────── */

function _buildAccountCard(acc, defaultCurrency) {
  const isInactive = Number(acc.active) === 0;
  const inactiveCls = isInactive ? ' ft-ba-card--inactive' : '';
  const type = String(acc.type || 'Bank Account');
  const icon = TYPE_ICON[type] || TYPE_ICON['Bank Account'];
  const currencyCode = normalizeCurrency(acc.currency || defaultCurrency);
  const currencyTag = `${getCurrencySymbol(currencyCode)} ${currencyCode}`.trim();
  const totalBalance = acc.total_balance ?? 0;
  const balanceMain = formatMoneyFromCents(totalBalance, currencyCode, { showCode: false });
  const isNegative = Number(totalBalance) < 0;
  const description = escapeHtml(acc.description || '');
  const owner = escapeHtml(acc.owner || '');
  const name = escapeHtml(acc.account || '');

  return `
    <div class="ft-ba-card ft-card${inactiveCls}" data-account-id="${acc.id}">
      <div class="ft-ba-card__header">
        <div class="ft-ba-card__icon-wrap">
          <span class="ft-ba-card__icon material-symbols-outlined" aria-hidden="true">${icon}</span>
        </div>
        <div class="ft-ba-card__title-area">
          <h3 class="ft-ba-card__name">${name}</h3>
          <div class="ft-ba-card__badges">
            <span class="ft-ba-card__type-tag">${escapeHtml(type)}</span>
            <span class="ft-ba-card__currency-tag">${escapeHtml(currencyTag)}</span>
            ${isInactive ? '<span class="ft-ba-card__status--inactive">Inactive</span>' : ''}
          </div>
        </div>
      </div>

      <div class="ft-ba-card__body">
        ${description ? `<p class="ft-ba-card__description">${description}</p>` : ''}
        <div class="ft-ba-card__meta">
          <span class="ft-small ft-text-muted">
            <span class="material-symbols-outlined ft-ba-card__meta-icon" aria-hidden="true">person</span>
            ${owner}
          </span>
          <span class="ft-small ft-text-muted">
            <span class="material-symbols-outlined ft-ba-card__meta-icon" aria-hidden="true">receipt_long</span>
            ${_fmtCount(acc.net_movements)} movements
          </span>
        </div>
      </div>

      <div class="ft-ba-card__footer">
        <span class="ft-ba-card__balance-main${isNegative ? ' ft-ba-card__balance-main--negative' : ''}">${balanceMain}</span>
        <span class="ft-ba-card__balance-converted" data-converted-for="${acc.id}">&nbsp;</span>
      </div>
    </div>`;
}

/* ── Private: async converted balances ────────────────── */

async function _fillConvertedBalances(container, accounts, defaultCurrency) {
  for (const acc of accounts) {
    const convertedCents = await _getConvertedCents(acc, defaultCurrency);
    const el = container.querySelector(`[data-converted-for="${acc.id}"]`);
    if (!el) continue;

    if (convertedCents !== null) {
      el.textContent = `\u2248 ${formatMoneyFromCents(convertedCents, defaultCurrency)}`;
    }
  }
}

/* ── Private: hydrate event listeners ─────────────────── */

function _hydrateCards(container, accounts, callbacks) {
  container.addEventListener('click', e => {
    const card = e.target.closest('[data-account-id]');
    if (!card) return;
    const accId = Number(card.dataset.accountId);
    const acc = accounts.find(a => a.id === accId);
    if (acc) callbacks.onClick?.(acc);
  });
}
