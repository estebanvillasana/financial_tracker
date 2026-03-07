/**
 * breakdown.js
 *
 * Dumb component for displaying a ranked list of items with
 * proportional bars and amounts. Designed for dashboards and reports
 * to visualise any kind of distribution: spending by category, balance
 * by account, income vs expenses, or any other breakdown metric.
 *
 * Pattern: Revealing Module (IIFE) — same as the rest of the dumb components.
 *
 * Public API:
 *   CategoryBreakdown.buildHTML(data, options)         → string
 *   CategoryBreakdown.createElement(data, options)     → HTMLElement
 *   CategoryBreakdown.buildLoadingHTML(options)        → string
 *   CategoryBreakdown.createLoadingElement(options)    → HTMLElement
 *
 * ── data shape ──────────────────────────────────────────────────────────────
 * {
 *   items: Array<{                                         [required]
 *     name:  string  — category display name
 *     value: number  — numeric value (e.g. cents, count)
 *   }>
 *   total: {                                               [optional]
 *     label: string  — footer label (e.g. 'Total Expenses')
 *     value: string  — pre-formatted total (e.g. '$1,234.56 USD')
 *   }
 * }
 *
 * ── options shape ───────────────────────────────────────────────────────────
 * {
 *   maxItems:       number   — max categories before "Others" collapse (default: 7)
 *   formatValue:    function(value) → string  — formats item values for display
 *                                               (default: String(value))
 *   barColors:      Array<string>  — CSS colors for bar fills, cycled per item
 *                                    (default: built-in 8-color palette)
 *   othersLabel:    string   — label template for collapsed items
 *                              Use {count} placeholder (default: 'Others ({count})')
 *   emptyIcon:      string   — Material icon when no items (default: 'donut_small')
 *   emptyMessage:   string   — message when no items (default: 'No data available.')
 *   animate:        boolean  — animate bar fills on mount (default: true)
 * }
 */

const Breakdown = (() => {

  // ─── Constants ───────────────────────────────────────────────────────────────

  const DEFAULT_MAX_ITEMS = 7;

  /** Default bar colors — cycled per item rank. */
  const DEFAULT_COLORS = [
    'var(--ft-color-accent)',    // blue
    '#7c4dff',                  // purple
    'var(--ft-color-warning)',   // orange
    '#26a69a',                  // teal
    'var(--ft-color-danger)',    // red
    '#8d6e63',                  // brown
    '#78909c',                  // blue-grey
    'var(--ft-color-success)',   // green
  ];

  const OTHERS_COLOR = 'var(--ft-color-text-muted-30)';

  const SKELETON_ROWS = 5;

  // ─── Private helpers ─────────────────────────────────────────────────────────

  /** Escapes HTML-unsafe characters. */
  function _esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Splits sorted items into { top, others } based on maxItems.
   * "Others" is a synthetic item aggregating the remaining entries.
   */
  function _splitItems(items, maxItems, othersTemplate) {
    const sorted = [...items].sort((a, b) => b.value - a.value);
    const top = sorted.slice(0, maxItems);
    const rest = sorted.slice(maxItems);

    let others = null;
    if (rest.length > 0) {
      others = {
        name: othersTemplate.replace('{count}', String(rest.length)),
        value: rest.reduce((sum, item) => sum + item.value, 0),
        isOthers: true,
      };
    }

    return { top, others };
  }

  // ─── Row HTML builders ─────────────────────────────────────────────────────

  /**
   * Builds HTML for a single category row with proportional bar.
   *
   * The bar fill width is set via data-width and animated after paint
   * when options.animate is true (see createElement).
   */
  function _buildRow(item, widthPct, color, formatValue, isOthers = false) {
    const modClass = isOthers ? ' ft-cat-item--others' : '';
    // Pass full item as second arg so callers can use per-item metadata (e.g. currency).
    // Callers that only need the value can safely ignore the extra argument.
    const formattedValue = formatValue(item.value, item);
    const barColor = isOthers ? OTHERS_COLOR : color;

    return `
      <div class="ft-cat-item${modClass}">
        <div class="ft-cat-item__header">
          <span class="ft-cat-item__name" title="${_esc(item.name)}">${_esc(item.name)}</span>
          <span class="ft-cat-item__amount">${_esc(formattedValue)}</span>
        </div>
        <div class="ft-cat-item__bar-track">
          <div class="ft-cat-item__bar-fill" data-width="${widthPct}%" style="background:${barColor}"></div>
        </div>
      </div>`;
  }

  // ─── HTML template ─────────────────────────────────────────────────────────

  /**
   * Builds the complete category breakdown HTML string.
   *
   * Items are sorted descending by value. The top N items get proportional
   * bars relative to the largest value. Remaining items collapse into an
   * "Others" row. An optional total footer anchors to the bottom.
   *
   * @param {object} data          See module-level JSDoc.
   * @param {object} [options={}]  See module-level JSDoc.
   * @returns {string}
   */
  function buildHTML(data, options = {}) {
    const items = Array.isArray(data?.items) ? data.items.filter(i => i.value > 0) : [];
    const maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS;
    const formatValue = options.formatValue ?? (v => String(v));
    const colors = options.barColors ?? DEFAULT_COLORS;
    const othersLabel = options.othersLabel ?? 'Others ({count})';
    const emptyIcon = options.emptyIcon ?? 'donut_small';
    const emptyMessage = options.emptyMessage ?? 'No data available.';

    // ── Empty state ──
    if (items.length === 0) {
      return `
        <div class="ft-cat-breakdown ft-cat-breakdown--empty">
          <div class="ft-empty">
            <span class="ft-empty__icon material-symbols-outlined" aria-hidden="true">${_esc(emptyIcon)}</span>
            <p class="ft-small ft-text-muted">${_esc(emptyMessage)}</p>
          </div>
        </div>`;
    }

    const { top, others } = _splitItems(items, maxItems, othersLabel);
    const maxValue = top[0]?.value || 1;

    let rowsHTML = '';
    for (let i = 0; i < top.length; i++) {
      const pct = Math.round((top[i].value / maxValue) * 100);
      const color = colors[i % colors.length];
      rowsHTML += _buildRow(top[i], pct, color, formatValue);
    }

    if (others) {
      const pct = Math.round((others.value / maxValue) * 100);
      rowsHTML += _buildRow(others, pct, OTHERS_COLOR, formatValue, true);
    }

    // ── Total footer ──
    const totalHTML = data?.total
      ? `<div class="ft-cat-total">
           <span class="ft-cat-total__label">${_esc(data.total.label)}</span>
           <span class="ft-cat-total__value">${_esc(data.total.value)}</span>
         </div>`
      : '';

    return `
      <div class="ft-cat-breakdown">
        ${rowsHTML}
        ${totalHTML}
      </div>`;
  }

  /**
   * Creates a live DOM element and optionally animates bar fills.
   *
   * @param {object} data          See module-level JSDoc.
   * @param {object} [options={}]  See module-level JSDoc.
   * @returns {HTMLElement}
   */
  function createElement(data, options = {}) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildHTML(data, options).trim();
    const el = wrapper.firstElementChild;

    const shouldAnimate = options.animate !== false;
    if (shouldAnimate && el) {
      // Defer bar width assignment to trigger CSS transition
      requestAnimationFrame(() => {
        el.querySelectorAll('.ft-cat-item__bar-fill').forEach(bar => {
          bar.style.width = bar.dataset.width;
        });
      });
    } else if (el) {
      // No animation — set widths immediately
      el.querySelectorAll('.ft-cat-item__bar-fill').forEach(bar => {
        bar.style.width = bar.dataset.width;
      });
    }

    return el;
  }

  // ─── Loading skeleton ──────────────────────────────────────────────────────

  /**
   * Builds a loading skeleton HTML with pulsing bar placeholders.
   *
   * @param {object} [options={}]
   * @param {number} [options.rows=5] — number of skeleton rows
   * @returns {string}
   */
  function buildLoadingHTML(options = {}) {
    const rows = options.rows ?? SKELETON_ROWS;
    let html = '';
    for (let i = 0; i < rows; i++) {
      const width = 90 - i * 12; // decreasing widths for visual variety
      html += `
        <div class="ft-cat-item">
          <div class="ft-cat-item__header">
            <div class="ft-cat-breakdown__skeleton ft-cat-breakdown__skeleton--name"></div>
            <div class="ft-cat-breakdown__skeleton ft-cat-breakdown__skeleton--amount"></div>
          </div>
          <div class="ft-cat-item__bar-track">
            <div class="ft-cat-item__bar-fill ft-cat-breakdown__skeleton--bar" style="width:${width}%"></div>
          </div>
        </div>`;
    }

    return `<div class="ft-cat-breakdown ft-cat-breakdown--loading" aria-hidden="true">${html}</div>`;
  }

  /**
   * Creates a live loading skeleton DOM element.
   *
   * @param {object} [options={}]  Same as buildLoadingHTML.
   * @returns {HTMLElement}
   */
  function createLoadingElement(options = {}) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildLoadingHTML(options).trim();
    return wrapper.firstElementChild;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  return { buildHTML, createElement, buildLoadingHTML, createLoadingElement };
})();

export { Breakdown };
