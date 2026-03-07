import { request } from './http.js';

/**
 * Service for managing individual movements (transactions)
 */
const movements = {
  /**
   * Returns movements with extensive filters and pagination
   * @param {Object} params - { active, account_id, category_id, sub_category_id, type, date_from, date_to, limit, offset }
   */
  getAll(params) {
    return request('/movements', { query: params });
  },

  getOne(id) {
    return request(`/movements/${id}`);
  },

  create(payload) {
    return request('/movements', { method: 'POST', body: payload });
  },

  update(id, payload) {
    return request(`/movements/${id}`, { method: 'PUT', body: payload });
  },

  delete(id) {
    return request(`/movements/${id}`, { method: 'DELETE' });
  },

  softDelete(id) {
    return request(`/movements/${id}/soft-delete`, { method: 'PATCH' });
  },

  restore(id) {
    return request(`/movements/${id}/restore`, { method: 'PATCH' });
  },

  /**
   * Atomic batch create for multiple movements
   */
  createBulk(payload) {
    return request('/movements/bulk', { method: 'POST', body: payload });
  },
};

export { movements };
