/**
 * Shared AG Charts infrastructure.
 *
 * Provides lazy-loading of the AG Charts library so the ~2 MB bundle
 * is only fetched when a page actually needs charting.
 */

const AG_CHARTS_SCRIPT_SRC = new URL('./ag-charts.js', import.meta.url).toString();

/**
 * Lazy-loads the AG Charts library only when first needed.
 * Shared promise prevents double-loading across re-navigations.
 *
 * @returns {Promise<void>}
 */
function ensureAgChartsLoaded() {
  if (window.agCharts) return Promise.resolve();
  if (window.__ftAgChartsLoadingPromise) return window.__ftAgChartsLoadingPromise;

  window.__ftAgChartsLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = AG_CHARTS_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load AG Charts library.'));
    document.head.appendChild(script);
  });

  return window.__ftAgChartsLoadingPromise;
}

export { AG_CHARTS_SCRIPT_SRC, ensureAgChartsLoaded };
