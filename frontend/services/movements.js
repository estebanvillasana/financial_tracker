import { request } from './http.js';

const movements = {
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
  createBulk(payload) {
    return request('/movements/bulk', { method: 'POST', body: payload });
  },
};

export { movements };
