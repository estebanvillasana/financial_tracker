import { repetitiveMovements, movements, fxRates } from '../../services/api.js';

/* ── Fetch ────────────────────────────────────────────── */

export async function fetchRepetitiveMovements(params = {}) {
  return repetitiveMovements.getAll(params);
}

export async function fetchMovementsForSubscription(repetitiveMovementId) {
  return movements.getAll({
    repetitive_movement_id: repetitiveMovementId,
    active: 1,
    limit: 50,
  });
}

export async function fetchLatestRates() {
  const data = await fxRates.getAllRatesLatest();
  return data?.rates || {};
}

/* ── Mutations ────────────────────────────────────────── */

export async function createRepetitiveMovement(payload) {
  return repetitiveMovements.create(payload);
}

export async function updateRepetitiveMovement(id, payload) {
  return repetitiveMovements.update(id, payload);
}

export async function softDeleteRepetitiveMovement(id) {
  return repetitiveMovements.softDelete(id);
}

export async function restoreRepetitiveMovement(id) {
  return repetitiveMovements.restore(id);
}
