import { bankAccounts } from '../../services/api.js';

/* ── Fetch ────────────────────────────────────────────── */

export async function fetchAccounts(params = {}) {
  return bankAccounts.getAll(params);
}

export async function fetchAccount(id) {
  return bankAccounts.getOne(id);
}

/* ── Mutations ────────────────────────────────────────── */

export async function createAccount(payload) {
  return bankAccounts.create(payload);
}

export async function updateAccount(id, payload) {
  return bankAccounts.update(id, payload);
}

export async function softDeleteAccount(id) {
  return bankAccounts.softDelete(id);
}

export async function restoreAccount(id, currentData) {
  return bankAccounts.update(id, {
    account: currentData.account,
    description: currentData.description || '',
    type: currentData.type,
    owner: currentData.owner,
    currency: currentData.currency,
    initial_balance: currentData.initial_balance,
    updated: currentData.updated ?? 0,
  });
}
