import { request } from './http.js';

const categories = {
  getAll(params) {
    return request('/categories', { query: params });
  },
  getOne(id) {
    return request(`/categories/${id}`);
  },
  create(payload) {
    return request('/categories', { method: 'POST', body: payload });
  },
  update(id, payload) {
    return request(`/categories/${id}`, { method: 'PUT', body: payload });
  },
  delete(id) {
    return request(`/categories/${id}`, { method: 'DELETE' });
  },
  softDelete(id) {
    return request(`/categories/${id}/soft-delete`, { method: 'PATCH' });
  },
};

export { categories };
