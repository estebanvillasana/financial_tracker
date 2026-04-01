// accountSummaryCard.js — Dumb account summary card component

import { getMainCurrency } from '../../../appSettings.js';
import { fxRates } from '../../../services/fxRates.js';
import {
  formatMoneyFromCents,
  getCurrencySymbol as _getCurrencySymbol,
  normalizeCurrency as _normalizeCurrency,
} from '../../../utils/formatters.js';

const AccountSummaryCard = (() => {
  const TYPE_ICON = {
    'Bank Account': 'account_balance',
    'Credit Card': 'credit_card',
    Savings: 'savings',
    'Crypto Wallet': 'currency_bitcoin',
    'Money Bag': 'account_balance_wallet',
  };

  function _escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildHTML(account, options = {}) {
    if (!account) return '';

    const defaultCurrency = _normalizeCurrency(options.defaultCurrency || getMainCurrency());
    const currencyCode = _normalizeCurrency(account.currency || defaultCurrency);
    const type = String(account.type || 'Bank Account');
    const icon = TYPE_ICON[type] || TYPE_ICON['Bank Account'];
    const currencyTag = `${_getCurrencySymbol(currencyCode)} ${currencyCode}`.trim();
    const description = _escapeHtml(account.description || '');
    const owner = _escapeHtml(account.owner || '');
    const name = _escapeHtml(account.account || '');
    const totalBalance = account.total_balance ?? 0;
    const balanceMain = formatMoneyFromCents(totalBalance, currencyCode, { showCode: false });
    const isNegative = Number(totalBalance) < 0;
    const isUpdated = account.updated === 1 || account.updated === true;

    const convertedTotal = options.convertedTotalCents;
    const convertedCurrency = _normalizeCurrency(options.convertedCurrency || defaultCurrency);
    const showConverted =
      convertedTotal !== undefined &&
      convertedTotal !== null &&
      currencyCode !== defaultCurrency;

    const convertedLine = showConverted
      ? `&asymp; ${formatMoneyFromCents(convertedTotal, convertedCurrency)}`
      : '';

    return `
      <article class="ft-account-card" data-type="${_escapeHtml(type)}" data-account-id="${_escapeHtml(account.id ?? '')}" data-updated="${isUpdated ? '1' : '0'}">
        <div class="ft-account-card__icon-wrap">
          <span class="ft-account-card__icon material-symbols-outlined" aria-hidden="true">${icon}</span>
        </div>
        <div class="ft-account-card__info">
          <span class="ft-account-card__name">${name}</span>
          <div class="ft-account-card__meta">
            <span class="ft-account-card__type-tag">
              <span class="ft-account-card__type-dot"></span>
              ${_escapeHtml(type)}
            </span>
            <div class="ft-account-card__owner">
              <span class="ft-account-card__owner-icon material-symbols-outlined" aria-hidden="true">person</span>
              <span class="ft-account-card__owner-name">${owner}</span>
            </div>
          </div>
          <p class="ft-account-card__description">${description}</p>
        </div>
        <div class="ft-account-card__balance">
          <span class="ft-account-card__currency-tag">${_escapeHtml(currencyTag)}</span>
          <span class="ft-account-card__balance-main${isNegative ? ' ft-account-card__balance-main--negative' : ''}">${balanceMain}</span>
          <span class="ft-account-card__balance-converted">${convertedLine || '&nbsp;'}</span>
        </div>
      </article>`;
  }

  function createElement(account, options = {}) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildHTML(account, options).trim();
    return wrapper.firstElementChild;
  }

  async function getLatestConvertedTotalCents(account, options = {}) {
    if (!account) return null;

    const defaultCurrency = _normalizeCurrency(options.defaultCurrency || getMainCurrency());
    const accountCurrency = _normalizeCurrency(account.currency || defaultCurrency);
    const totalBalanceCents = Number(account.total_balance ?? 0);

    if (!defaultCurrency || !accountCurrency || accountCurrency === defaultCurrency) {
      return null;
    }

    const directPair = `${accountCurrency}${defaultCurrency}`;
    const reversePair = `${defaultCurrency}${accountCurrency}`;
    let rate = null;

    try {
      const direct = await fxRates.getLatestByPair(directPair);
      const directRate = Number(direct?.rate);
      if (Number.isFinite(directRate)) {
        rate = directRate;
      }
    } catch {
      // Ignore direct pair failures and fallback to reverse pair.
    }

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

  async function buildHTMLWithLatestConversion(account, options = {}) {
    const defaultCurrency = _normalizeCurrency(options.defaultCurrency || getMainCurrency());
    const convertedTotalCents = await getLatestConvertedTotalCents(account, { defaultCurrency });

    return buildHTML(account, {
      ...options,
      defaultCurrency,
      convertedTotalCents,
      convertedCurrency: defaultCurrency,
    });
  }

  async function createElementWithLatestConversion(account, options = {}) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = (await buildHTMLWithLatestConversion(account, options)).trim();
    return wrapper.firstElementChild;
  }

  return {
    buildHTML,
    createElement,
    getLatestConvertedTotalCents,
    buildHTMLWithLatestConversion,
    createElementWithLatestConversion,
  };
})();

export { AccountSummaryCard };
