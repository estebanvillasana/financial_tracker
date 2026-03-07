/**
 * Shared AG Grid configuration helper.
 *
 * Centralises common grid setup (theme, default column options,
 * DOM layout, overlays) so page-specific grids only need to
 * provide their unique configuration.
 *
 * CSS integration: every host element should carry the
 * `.ft-ag-grid` class for shared visual overrides.
 */
import { ensureAgGridLoaded, getGridTheme } from '../lib/agGridLoader.js';

/**
 * Returns the base options shared by every read-only grid.
 *
 * @param {object} [overrides] — page-specific grid options that
 *   are shallow-merged on top (except `defaultColDef` which is
 *   deep-merged so callers only need to add/change individual keys).
 * @returns {object} merged AG Grid options
 */
export function buildGridOptions(overrides = {}) {
  const defaults = {
    theme: getGridTheme(),
    domLayout: 'normal',
    animateRows: true,
    suppressCellFocus: true,
    defaultColDef: {
      sortable: true,
      resizable: true,
    },
    overlayNoRowsTemplate:
      '<span class="ft-small ft-text-muted">No data available</span>',
  };

  const mergedDefaultColDef = {
    ...defaults.defaultColDef,
    ...(overrides.defaultColDef || {}),
  };

  return {
    ...defaults,
    ...overrides,
    defaultColDef: mergedDefaultColDef,
  };
}

/**
 * Loads the AG Grid library and mounts a grid with shared defaults.
 *
 * @param {HTMLElement} hostEl   — grid host element (should have .ft-ag-grid)
 * @param {object}      options  — page-specific grid options
 * @returns {Promise<object>}    AG Grid API instance
 */
export async function createStandardGrid(hostEl, options = {}) {
  await ensureAgGridLoaded();
  /* global agGrid */
  return agGrid.createGrid(hostEl, buildGridOptions(options));
}

// Re-export loader utilities for convenience
export { ensureAgGridLoaded, getGridTheme };
