import { request } from './http.js';

/**
 * Service for Foreign Exchange (FX) rates
 */
const fxRates = {
  /**
   * Returns conversion for a currency pair on a given date (or latest)
   * @param {Object} params - { currencyPair: 'MXNEUR', date: 'YYYY-MM-DD'|'latest', amount: 1.0 }
   */
  getRate({ currencyPair, date, amount }) {
    return request('/fx-rates', {
      query: {
        'currency-pair': currencyPair,
        date,
        amount,
      },
    });
  },

  /**
   * Returns the most recent date available in the database
   */
  getLatestDate() {
    return request('/fx-rates/latest');
  },

  /**
   * Returns all available currency codes for a specific date
   */
  getCurrencies(date) {
    return request('/fx-rates/currencies', { query: { date } });
  },

  /**
   * Shortcut to get currencies by specific path date
   */
  getCurrenciesByDate(targetDate) {
    return request(`/fx-rates/${targetDate}`);
  },

  /**
   * Returns all rates vs base for the latest date
   */
  getAllRatesLatest() {
    return request('/fx-rates/all/latest');
  },

  /**
   * Returns all rates for a specific date
   */
  getAllRatesByDate(targetDate) {
    return request(`/fx-rates/all/${targetDate}`);
  },
};

export { fxRates };
