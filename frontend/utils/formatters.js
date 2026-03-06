/**
 * Shared currency and money formatting utilities.
 *
 * These helpers are used across multiple pages (dashboard, add-movements, etc.)
 * and intentionally kept side-effect free.
 */

const NUMBER_FORMAT = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

let currenciesData = [];

try {
  const response = await fetch(new URL('./currencies.json', import.meta.url));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const data = await response.json();
  currenciesData = Array.isArray(data) ? data : [];
} catch (error) {
  console.error('Failed to load currencies.json:', error);
}

/** Normalizes currency codes to uppercase ISO notation. */
function normalizeCurrency(code) {
  return String(code || '').trim().toUpperCase();
}

/** Returns the currencies.json definition for a given code when available. */
function getCurrencyDefinition(currencyCode) {
  const normalized = normalizeCurrency(currencyCode);
  if (!normalized) return null;

  return currenciesData.find(currency => {
    const candidate = normalizeCurrency(currency?.uppercaseCode || currency?.code);
    return candidate === normalized;
  }) || null;
}

/** Returns the preferred symbol for a currency, falling back to Intl when needed. */
function getCurrencySymbol(currencyCode) {
  const normalized = normalizeCurrency(currencyCode);
  if (!normalized) return '';

  const currency = getCurrencyDefinition(normalized);
  if (currency?.symbol) return String(currency.symbol);

  try {
    const parts = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: normalized,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);

    return parts.find(part => part.type === 'currency')?.value || normalized;
  } catch {
    return normalized;
  }
}

/** Returns a short label such as "$ MXN" for badges and tags. */
function getCurrencyLabel(currencyCode) {
  const normalized = normalizeCurrency(currencyCode);
  if (!normalized) return '';

  const currency = getCurrencyDefinition(normalized);
  if (currency?.codePlusSymbol) return String(currency.codePlusSymbol);

  const symbol = getCurrencySymbol(normalized);
  return symbol === normalized ? normalized : `${symbol} ${normalized}`.trim();
}

/**
 * Formats a decimal amount using the app's preferred money display.
 * Example: 13316.01 + MXN -> "$13,316.01 MXN"
 */
function formatMoney(amount, currencyCode, options = {}) {
  const numericAmount = Number(amount);
  const normalized = normalizeCurrency(currencyCode) || 'USD';
  const safeAmount = Number.isFinite(numericAmount) ? numericAmount : 0;
  const sign = safeAmount < 0 ? '-' : '';
  const absAmount = Math.abs(safeAmount);
  const symbol = getCurrencySymbol(normalized) || normalized;
  const spacer = symbol.length > 1 ? ' ' : '';
  const showCode = options.showCode !== false;
  const codeSuffix = showCode && symbol !== normalized ? ` ${normalized}` : '';

  return `${sign}${symbol}${spacer}${NUMBER_FORMAT.format(absAmount)}${codeSuffix}`;
}

/** Formats a value in cents using the app's preferred money display. */
function formatMoneyFromCents(cents, currencyCode, options = {}) {
  return formatMoney((Number(cents) || 0) / 100, currencyCode, options);
}

/** Converts a draft row's amount + type into signed cents impact. */
function toSignedCents(row) {
  const amount = Number(row?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const absCents = Math.round(Math.abs(amount) * 100);
  return row?.type === 'Income' ? absCents : -absCents;
}

export {
  normalizeCurrency,
  getCurrencyDefinition,
  getCurrencySymbol,
  getCurrencyLabel,
  formatMoney,
  formatMoneyFromCents,
  toSignedCents,
};
