/**
 * Shared currency and money formatting utilities.
 *
 * These helpers are used across multiple pages (dashboard, add-movements, etc.)
 * and intentionally kept side-effect free.
 */

/** Normalizes currency codes to uppercase ISO notation. */
function normalizeCurrency(code) {
  return String(code || '').trim().toUpperCase();
}

/** Formats a value in cents using Intl.NumberFormat for the given currency. */
function formatMoneyFromCents(cents, currencyCode) {
  const amount = (Number(cents) || 0) / 100;
  const normalized = normalizeCurrency(currencyCode);

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: normalized || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${normalized || ''}`.trim();
  }
}

export { normalizeCurrency, formatMoneyFromCents };
