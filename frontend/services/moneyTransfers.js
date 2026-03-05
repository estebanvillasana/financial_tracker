import { request } from './http.js';

const moneyTransfers = {
  getAll(params) {
    return request('/money-transfers', { query: params });
  },
  getOne(movementCode) {
    return request(`/money-transfers/${movementCode}`);
  },
  create(payload) {
    return request('/money-transfers', { method: 'POST', body: payload });
  },
  update(movementCode, payload) {
    return request(`/money-transfers/${movementCode}`, { method: 'PUT', body: payload });
  },
  delete(movementCode) {
    return request(`/money-transfers/${movementCode}`, { method: 'DELETE' });
  },
  softDelete(movementCode) {
    return request(`/money-transfers/${movementCode}/soft-delete`, { method: 'PATCH' });
  },
};

export { moneyTransfers };
