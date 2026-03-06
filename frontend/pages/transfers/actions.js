/**
 * Transfer actions — API calls for create, update, soft-delete, fetch.
 */
import { moneyTransfers } from '../../services/api.js';

export function fetchTransfers(filters) {
  return moneyTransfers.getAll(filters);
}

export function createTransfer(payload) {
  return moneyTransfers.create(payload);
}

export function updateTransfer(movementCode, payload) {
  return moneyTransfers.update(movementCode, payload);
}

export function softDeleteTransfer(movementCode) {
  return moneyTransfers.softDelete(movementCode);
}
