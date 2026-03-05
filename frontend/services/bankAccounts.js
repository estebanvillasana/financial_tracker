import { request } from './http.js';

/**
 * Service for managing Bank Accounts
 */
const bankAccounts = {
  /**
   * Returns all bank accounts with current balances
   * @param {Object} params - { active: 1|0 }
   */
  getAll(params) {
    return request('/bank-accounts', { query: params });
  },

  /**
   * Returns a single bank account by ID
   */
  getOne(id) {
    return request(`/bank-accounts/${id}`);
  },

  /**
   * Creates a new bank account
   */
  create(payload) {
    return request('/bank-accounts', { method: 'POST', body: payload });
  },

  /**
   * Updates an existing bank account
   */
  update(id, payload) {
    return request(`/bank-accounts/${id}`, { method: 'PUT', body: payload });
  },

  /**
   * Hard deletes a bank account
   */
  delete(id) {
    return request(`/bank-accounts/${id}`, { method: 'DELETE' });
  },

  /**
   * Soft deletes a bank account (active=0)
   */
  softDelete(id) {
    return request(`/bank-accounts/${id}/soft-delete`, { method: 'PATCH' });
  },
};

export { bankAccounts };
