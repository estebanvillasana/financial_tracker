// accountSummaryCard.js — Dumb account summary card component

import { finalAppConfig } from '../../../defaults.js';
import { fxRates } from '../../../services/fxRates.js';

let currenciesData = [];
const currenciesDataReady = fetch(new URL('../../../utils/currencies.json', import.meta.url))
	.then(response => {
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}
		return response.json();
	})
	.then(data => {
		currenciesData = Array.isArray(data) ? data : [];
	})
	.catch(err => {
		console.error('Failed to load currencies.json:', err);
	});

const AccountSummaryCard = (() => {
	const TYPE_ICON = {
		'Bank Account': 'account_balance',
		'Credit Card': 'credit_card',
		Savings: 'savings',
		'Crypto Wallet': 'currency_bitcoin',
		'Money Bag': 'account_balance_wallet',
	};

	const NUMBER_FORMAT = new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});

	function _escapeHtml(value) {
		return String(value ?? '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function _getCurrencySymbol(currencyCode) {
		const code = String(currencyCode || '').toUpperCase();

		if (!code) return '';

		const currency = currenciesData.find(c => c.uppercaseCode === code);
		if (currency && currency.symbol) {
			return currency.symbol;
		}

		try {
			const parts = new Intl.NumberFormat('en', {
				style: 'currency',
				currency: code,
				currencyDisplay: 'narrowSymbol',
			}).formatToParts(0);

			return parts.find(part => part.type === 'currency')?.value || code;
		} catch {
			return code;
		}
	}

	function _normalizeCurrency(currencyCode) {
		return String(currencyCode || '').trim().toUpperCase();
	}

	function _formatMoney(cents, currencyCode) {
		const numericCents = Number(cents) || 0;
		const amount = numericCents / 100;
		const sign = amount < 0 ? '-' : '';
		const absAmount = Math.abs(amount);
		const symbol = _getCurrencySymbol(currencyCode);
		const spacer = symbol.length > 1 ? ' ' : '';
		return `${sign}${symbol}${spacer}${NUMBER_FORMAT.format(absAmount)}`;
	}

	function buildHTML(account, options = {}) {
		if (!account) return '';

		const defaultCurrency = _normalizeCurrency(options.defaultCurrency || finalAppConfig.currency);
		const currencyCode = _normalizeCurrency(account.currency || defaultCurrency);
		const type = String(account.type || 'Bank Account');
		const icon = TYPE_ICON[type] || TYPE_ICON['Bank Account'];
		const currencyTag = `${_getCurrencySymbol(currencyCode)} ${currencyCode}`.trim();
		const description = _escapeHtml(account.description || '');
		const owner = _escapeHtml(account.owner || '');
		const name = _escapeHtml(account.account || '');
		const totalBalance = account.total_balance ?? 0;
		const balanceMain = _formatMoney(totalBalance, currencyCode);
		const isNegative = Number(totalBalance) < 0;
		const isUpdated = account.updated === 1 || account.updated === true;

		const convertedTotal = options.convertedTotalCents;
		const convertedCurrency = _normalizeCurrency(options.convertedCurrency || defaultCurrency);
		const showConverted =
			convertedTotal !== undefined &&
			convertedTotal !== null &&
			currencyCode !== defaultCurrency;

		const convertedLine = showConverted
			? `&asymp; ${_formatMoney(convertedTotal, convertedCurrency)} ${convertedCurrency}`
			: '';

		return `
			<article class="ft-account-card" data-type="${_escapeHtml(type)}" data-account-id="${_escapeHtml(account.id ?? '')}">
				<div class="ft-account-card__checkbox-wrap" aria-hidden="true">
					<input type="checkbox" class="ft-account-card__checkbox" tabindex="-1"${isUpdated ? ' checked' : ''}>
				</div>
				<div class="ft-account-card__icon-wrap">
					<span class="ft-account-card__icon material-symbols-outlined" aria-hidden="true">${icon}</span>
				</div>
				<div class="ft-account-card__info">
					<div class="ft-account-card__header">
						<span class="ft-account-card__name">${name}</span>
						<span class="ft-account-card__type-tag">
							<span class="ft-account-card__type-dot"></span>
							${_escapeHtml(type)}
						</span>
					</div>
					<p class="ft-account-card__description">${description}</p>
					<div class="ft-account-card__owner">
						<span class="ft-account-card__owner-icon material-symbols-outlined" aria-hidden="true">person</span>
						<span class="ft-account-card__owner-name">${owner}</span>
					</div>
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

		const defaultCurrency = _normalizeCurrency(options.defaultCurrency || finalAppConfig.currency);
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
		await currenciesDataReady;

		const defaultCurrency = _normalizeCurrency(options.defaultCurrency || finalAppConfig.currency);
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
