import { request } from './http.js';

/**
 * Service for internal money transfers (paired movements)
 */
const moneyTransfers = {
  /**
   * Returns internal transfers with date or account filters
   */
  getAll(params) {
    return request('/money-transfers', { query: params });
  },

  /**
   * Returns a transfer by movement_code
   */
  getOne(movementCode) {
    return request(`/money-transfers/${movementCode}`);
  },

  /**
   * Creates an internal transfer (Expense from sender + Income to receiver)
   */
  create(payload) {
    return request('/money-transfers', { method: 'POST', body: payload });
  },

  /**
   * Updates both movements of a transfer synchronously
   */
  update(movementCode, payload) {
    return request(`/money-transfers/${movementCode}`, { method: 'PUT', body: payload });
  },

  /**
   * Hard deletes both rows of a transfer
   */
  delete(movementCode) {
    return request(`/money-transfers/${movementCode}`, { method: 'DELETE' });
  },

  /**
   * Soft deletes both rows of a transfer (active=0)
   */
  softDelete(movementCode) {
    return request(`/money-transfers/${movementCode}/soft-delete`, { method: 'PATCH' });
  },
};

export { moneyTransfers };
