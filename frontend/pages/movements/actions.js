/**
 * Movements actions — thin API wrappers.
 * No business logic; just delegates to the movements service.
 */
import { movements } from '../../services/api.js';

/** Fetch movements with optional server-side filters. */
export function fetchMovements(filters = {}) {
  return movements.getAll(filters);
}

/** Update a single movement by ID. */
export function updateMovement(id, payload) {
  return movements.update(id, payload);
}

/** Soft-delete a single movement by ID. */
export function softDeleteMovement(id) {
  return movements.softDelete(id);
}

/** Restore a soft-deleted movement by ID. */
export function restoreMovement(id) {
  return movements.restore(id);
}
