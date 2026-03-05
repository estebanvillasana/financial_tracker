import { request } from './http.js';

const subCategories = {
  getAll(params) {
    return request('/sub-categories', { query: params });
  },
  getOne(id) {
    return request(`/sub-categories/${id}`);
  },
  create(payload) {
    return request('/sub-categories', { method: 'POST', body: payload });
  },
  update(id, payload) {
    return request(`/sub-categories/${id}`, { method: 'PUT', body: payload });
  },
  delete(id) {
    return request(`/sub-categories/${id}`, { method: 'DELETE' });
  },
  softDelete(id) {
    return request(`/sub-categories/${id}/soft-delete`, { method: 'PATCH' });
  },
};

export { subCategories };
