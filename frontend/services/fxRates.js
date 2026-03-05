import { request } from './http.js';

const fxRates = {
  getRate({ currencyPair, date, amount }) {
    return request('/fx-rates', {
      query: {
        'currency-pair': currencyPair,
        date,
        amount,
      },
    });
  },
  getLatestDate() {
    return request('/fx-rates/latest');
  },
  getCurrencies(date) {
    return request('/fx-rates/currencies', { query: { date } });
  },
  getCurrenciesByDate(targetDate) {
    return request(`/fx-rates/${targetDate}`);
  },
  getAllRatesLatest() {
    return request('/fx-rates/all/latest');
  },
  getAllRatesByDate(targetDate) {
    return request(`/fx-rates/all/${targetDate}`);
  },
};

export { fxRates };
