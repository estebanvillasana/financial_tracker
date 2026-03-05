import { request } from './http.js';

const bankAccounts = {
  getAll(params) {
    return request('/bank-accounts', { query: params });
  },
  getOne(id) {
    return request(`/bank-accounts/${id}`);
  },
  create(payload) {
    return request('/bank-accounts', { method: 'POST', body: payload });
  },
  update(id, payload) {
    return request(`/bank-accounts/${id}`, { method: 'PUT', body: payload });
  },
  delete(id) {
    return request(`/bank-accounts/${id}`, { method: 'DELETE' });
  },
  softDelete(id) {
    return request(`/bank-accounts/${id}/soft-delete`, { method: 'PATCH' });
  },
};

export { bankAccounts };
