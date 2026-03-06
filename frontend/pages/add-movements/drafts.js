/**
 * Add Movements draft persistence via sessionStorage.
 *
 * Saves draft rows so they survive page reloads / accidental navigation.
 * Data is keyed per-session (not per-account) since drafts are transient
 * work-in-progress that should be cleared after commit.
 *
 * Storage shape:
 * {
 *   accountId:  number,       — selected account at time of save
 *   draftType:  string,       — 'Expense' | 'Income'
 *   rows:       DraftRow[],   — draft rows (excluding sentinel)
 *   savedAt:    number        — Date.now() timestamp for staleness checks
 * }
 */

const STORAGE_KEY = 'ft_add_movements_drafts';

/** Max age before drafts are considered stale (24 hours). */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/* ── Debounce helper ──────────────────────────────────────────────────────── */

let _saveTimer = null;
const DEBOUNCE_MS = 500;

/**
 * Persists current draft state to sessionStorage (debounced).
 *
 * Call this from `refreshSummaryState` so every grid change triggers a save
 * without hammering storage on rapid edits.
 *
 * @param {object} state - Page state containing rows, selectedAccountId, draftType
 */
function saveDrafts(state) {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _writeDrafts(state);
  }, DEBOUNCE_MS);
}

/**
 * Immediately persists drafts (no debounce).
 * Use before commit/discard to ensure storage is up-to-date.
 *
 * @param {object} state
 */
function saveDraftsImmediate(state) {
  clearTimeout(_saveTimer);
  _writeDrafts(state);
}

/**
 * Restores saved drafts from sessionStorage.
 *
 * Returns null if no saved data exists, if it's stale (>24h), or if the
 * shape is invalid. The caller decides how to merge restored data into the grid.
 *
 * @returns {{ accountId: number, draftType: string, rows: object[] } | null}
 */
function restoreDrafts() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.rows) || data.rows.length === 0) return null;

    /* Discard stale drafts (e.g. left over from yesterday). */
    if (typeof data.savedAt === 'number' && Date.now() - data.savedAt > MAX_AGE_MS) {
      clearDrafts();
      return null;
    }

    return {
      accountId: Number(data.accountId) || null,
      draftType: data.draftType || 'Expense',
      rows: data.rows,
    };
  } catch {
    clearDrafts();
    return null;
  }
}

/**
 * Removes saved drafts from sessionStorage.
 * Call after a successful commit or explicit discard.
 */
function clearDrafts() {
  clearTimeout(_saveTimer);
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* storage unavailable — safe to ignore */ }
}

/* ── Internal ─────────────────────────────────────────────────────────────── */

/** Writes current state to sessionStorage (synchronous). */
function _writeDrafts(state) {
  if (!state.rows || state.rows.length === 0) {
    clearDrafts();
    return;
  }

  try {
    const payload = {
      accountId: state.selectedAccountId,
      draftType: state.draftType,
      rows: state.rows,
      savedAt: Date.now(),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch { /* quota exceeded or storage unavailable — non-critical */ }
}

export { saveDrafts, saveDraftsImmediate, restoreDrafts, clearDrafts };
