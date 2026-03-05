import { request } from './http.js';

/**
 * Service for managing reusable/repetitive movement definitions
 */
const repetitiveMovements = {
  /**
   * Returns repetitive movements with metadata (counts, tax status)
   */
  getAll(params) {
    return request('/repetitive-movements', { query: params });
  },

  getOne(id) {
    return request(`/repetitive-movements/${id}`);
  },

  create(payload) {
    return request('/repetitive-movements', { method: 'POST', body: payload });
  },

  update(id, payload) {
    return request(`/repetitive-movements/${id}`, { method: 'PUT', body: payload });
  },

  delete(id) {
    return request(`/repetitive-movements/${id}`, { method: 'DELETE' });
  },

  softDelete(id) {
    return request(`/repetitive-movements/${id}/soft-delete`, { method: 'PATCH' });
  },
};

export { repetitiveMovements };
