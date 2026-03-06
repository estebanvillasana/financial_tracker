/**
 * Shared validation and parsing utilities.
 * Side-effect free — safe to import from any module.
 */

/** Validates YYYY-MM-DD dates expected by backend API. */
function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  return !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

/** Parses numeric inputs while preserving empty/null values. */
function parseNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export { isValidIsoDate, parseNumberOrNull };