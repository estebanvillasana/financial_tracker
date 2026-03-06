/**
 * Shared AG Grid infrastructure.
 *
 * Provides lazy-loading of the AG Grid library and a consistent theme
 * builder so every page using AG Grid looks and behaves the same.
 */

const AG_GRID_SCRIPT_SRC = new URL('./ag-grids.js', import.meta.url).toString();

/* ── Lazy Loading ─────────────────────────────────────────────────────────── */

/**
 * Lazy-loads the AG Grid library only when first needed.
 * Shared promise prevents double-loading across re-navigations.
 *
 * @returns {Promise<void>}
 */
function ensureAgGridLoaded() {
  if (window.agGrid) return Promise.resolve();
  if (window.__ftAgGridLoadingPromise) return window.__ftAgGridLoadingPromise;

  window.__ftAgGridLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = AG_GRID_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load AG Grid library.'));
    document.head.appendChild(script);
  });

  return window.__ftAgGridLoadingPromise;
}

/* ── Theme ────────────────────────────────────────────────────────────────── */

/**
 * Builds the AG Grid theme consistent with the app's dark look.
 * Uses Quartz base with the dark-blue color scheme.
 *
 * @returns {object} AG Grid theme object
 */
function getGridTheme() {
  return window.agGrid.themeQuartz.withPart(window.agGrid.colorSchemeDarkBlue).withParams({
    spacing: 4,
    headerFontWeight: 600,
  });
}

export { AG_GRID_SCRIPT_SRC, ensureAgGridLoaded, getGridTheme };
