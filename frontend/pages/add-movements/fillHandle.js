/**
 * Custom cell fill-handle for AG Grid (Community edition).
 *
 * Renders a small draggable square at the bottom-right corner of the
 * focused data cell. Dragging vertically copies the source cell's
 * value into every covered row (same column), like Excel.
 */
import { isAddRow } from './constants.js';
import { applyRowTypeAttributes } from './grid.js';

const HANDLE_CLASS = 'ft-fill-handle';
const TARGET_CLASS = 'ft-fill-target';
const DRAGGING_CLASS = 'ft-fill-dragging';

/**
 * Attaches a fill handle to the grid host element.
 *
 * @param {HTMLElement} gridHost  The AG Grid container (.ft-add-movements-grid).
 * @param {object}      state     Shared page state (must expose gridApi).
 * @param {object}      domRefs   DOM references used by refresh callbacks.
 * @param {object}      handlers  Callback bundle (refreshSummaryState, renderFeedback …).
 * @returns {{ reposition(): void, destroy(): void }}
 */
export function attachFillHandle(gridHost, state, domRefs, handlers) {
  const handle = document.createElement('div');
  handle.className = HANDLE_CLASS;
  handle.style.display = 'none';
  gridHost.appendChild(handle);

  let dragging = false;
  let srcRowIndex = null;
  let srcColId = null;
  let srcValue = null;
  let lastTargetRow = null;

  /* ── helpers ─────────────────────────────────────────────── */

  function api() { return state.gridApi; }

  function cellAt(rowIdx, colId) {
    const node = api().getDisplayedRowAtIndex(rowIdx);
    if (!node) return null;
    return gridHost.querySelector(
      `.ag-row[row-id="${CSS.escape(node.id)}"] .ag-cell[col-id="${CSS.escape(colId)}"]`,
    );
  }

  function rowIndexAtY(clientY) {
    for (const row of gridHost.querySelectorAll('.ag-row')) {
      const r = row.getBoundingClientRect();
      if (clientY >= r.top && clientY < r.bottom) {
        const id = row.getAttribute('row-id');
        let idx = null;
        api().forEachNode(n => { if (n.id === id) idx = n.rowIndex; });
        return idx;
      }
    }
    return null;
  }

  function clearTargets() {
    gridHost.querySelectorAll(`.${TARGET_CLASS}`).forEach(el => el.classList.remove(TARGET_CLASS));
  }

  function paintRange(from, to, colId) {
    clearTargets();
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    for (let i = lo; i <= hi; i++) {
      if (i === srcRowIndex) continue;
      const node = api().getDisplayedRowAtIndex(i);
      if (node && isAddRow(node.data)) continue;
      const el = cellAt(i, colId);
      if (el) el.classList.add(TARGET_CLASS);
    }
  }

  /* ── position handle on focused cell ─────────────────────── */

  function reposition() {
    const g = api();
    if (!g) { handle.style.display = 'none'; return; }

    const focused = g.getFocusedCell?.();
    if (!focused) { handle.style.display = 'none'; return; }

    const node = g.getDisplayedRowAtIndex(focused.rowIndex);
    if (!node || isAddRow(node.data)) { handle.style.display = 'none'; return; }

    const el = cellAt(focused.rowIndex, focused.column.getColId());
    if (!el) { handle.style.display = 'none'; return; }

    const gRect = gridHost.getBoundingClientRect();
    const cRect = el.getBoundingClientRect();

    /* Clip: hide when the cell is scrolled out of the visible grid area */
    const viewport = gridHost.querySelector('.ag-body-viewport');
    if (viewport) {
      const vRect = viewport.getBoundingClientRect();
      if (cRect.bottom < vRect.top || cRect.top > vRect.bottom) {
        handle.style.display = 'none';
        return;
      }
    }

    handle.style.display = '';
    handle.style.left = `${cRect.right - gRect.left - 5}px`;
    handle.style.top = `${cRect.bottom - gRect.top - 5}px`;
  }

  /* ── drag lifecycle ──────────────────────────────────────── */

  function onDown(e) {
    e.preventDefault();
    e.stopPropagation();

    const focused = api().getFocusedCell();
    if (!focused) return;

    const node = api().getDisplayedRowAtIndex(focused.rowIndex);
    if (!node || isAddRow(node.data)) return;

    srcRowIndex = focused.rowIndex;
    srcColId = focused.column.getColId();
    srcValue = node.data[srcColId];
    lastTargetRow = srcRowIndex;
    dragging = true;

    gridHost.classList.add(DRAGGING_CLASS);
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mouseup', onUp, true);
  }

  function onMove(e) {
    if (!dragging) return;
    const ri = rowIndexAtY(e.clientY);
    if (ri === null || ri === lastTargetRow) return;

    const node = api().getDisplayedRowAtIndex(ri);
    if (node && isAddRow(node.data)) return;

    lastTargetRow = ri;
    paintRange(srcRowIndex, lastTargetRow, srcColId);
  }

  function onUp() {
    if (!dragging) return;
    dragging = false;
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('mouseup', onUp, true);
    gridHost.classList.remove(DRAGGING_CLASS);

    if (lastTargetRow !== null && lastTargetRow !== srcRowIndex) {
      const lo = Math.min(srcRowIndex, lastTargetRow);
      const hi = Math.max(srcRowIndex, lastTargetRow);
      const updated = [];

      for (let i = lo; i <= hi; i++) {
        if (i === srcRowIndex) continue;
        const node = api().getDisplayedRowAtIndex(i);
        if (node && !isAddRow(node.data)) {
          node.data[srcColId] = srcValue;
          updated.push(node.data);
        }
      }

      if (updated.length) {
        api().applyTransaction({ update: updated });
        api().refreshCells({ force: true });
        handlers.refreshSummaryState(state, domRefs);
        handlers.renderFeedback(domRefs.feedbackEl, '');
        requestAnimationFrame(() => applyRowTypeAttributes(api()));
      }
    }

    clearTargets();
    lastTargetRow = null;
  }

  /* ── wire events ─────────────────────────────────────────── */

  handle.addEventListener('mousedown', onDown);

  /* Re-position when the grid body scrolls (virtual rows shift). */
  const viewport = gridHost.querySelector('.ag-body-viewport');
  if (viewport) {
    viewport.addEventListener('scroll', () => { if (!dragging) reposition(); });
  }

  return {
    reposition,
    destroy() {
      handle.remove();
      clearTargets();
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseup', onUp, true);
    },
  };
}
