/**
 * infoCard.js
 *
 * Dumb component for displaying a single aggregated metric or info stat.
 * Designed for dashboard stat rows — e.g. "Total Balance", "Savings Total",
 * "Active Accounts", "Credit Card Debt", etc.
 *
 * Unlike accountSummaryCard (which represents a specific account record),
 * this component is purely display-focused and receives pre-formatted strings.
 * No data-fetching, FX conversion, or number formatting is performed here —
 * all of that is the caller's responsibility.
 *
 * Pattern: Revealing Module (IIFE) — same as the rest of the dumb components.
 *
 * Public API:
 *   InfoCard.buildHTML(data, options)         → string       (pure HTML string)
 *   InfoCard.createElement(data, options)     → HTMLElement  (live DOM node)
 *   InfoCard.buildLoadingHTML(options)        → string       (skeleton HTML)
 *   InfoCard.createLoadingElement(options)    → HTMLElement  (live skeleton node)
 *
 * ── data shape ──────────────────────────────────────────────────────────────
 * {
 *   label:    string   — card title (e.g. 'Total Balance')              [required]
 *   value:    string   — primary display value, pre-formatted            [required]
 *                        (e.g. '$12,345.67', '4 accounts', '+3.2%')
 *   subValue: string   — secondary line below the main value             [optional]
 *                        (e.g. '≈ $12,345 USD', 'across all currencies')
 *   icon:     string   — Material Symbols Outlined name                  [optional]
 *                        (e.g. 'account_balance', 'savings', 'payments')
 *   trend: {           — optional trend/change badge                     [optional]
 *     value:     string  — formatted change value (e.g. '+$200' or '+2.3%')
 *     direction: 'up' | 'down' | 'neutral'
 *     label:     string  — contextual note (e.g. 'vs last month')        [optional]
 *   }
 *   note:     string   — small footnote at the bottom of the card        [optional]
 *                        (e.g. 'Across 3 accounts', 'Active only')
 * }
 *
 * ── options shape ────────────────────────────────────────────────────────────
 * {
 *   variant: 'default' | 'accent' | 'success' | 'danger' | 'warning'
 *            Controls icon tint and value color.
 *            'success' and 'danger' also colorise the primary value.
 *   onClick: function(data)
 *            If provided, the card becomes interactive (pointer cursor,
 *            keyboard-activatable). Receives the data object as argument.
 *            Note: onClick wiring is done in createElement — buildHTML
 *            only adds the markup hooks (data-clickable, role, tabindex).
 * }
 *
 * ── Loading skeleton options ─────────────────────────────────────────────────
 * {
 *   hasSubValue: boolean  — reserve space for a sub-value line
 *   hasTrend:    boolean  — reserve space for a trend badge
 *   hasNote:     boolean  — reserve space for a note footer
 * }
 *
 * ── Custom events ────────────────────────────────────────────────────────────
 * None. Interaction is handled via the options.onClick callback only.
 */

const InfoCard = (() => {

  // ─── Constants ───────────────────────────────────────────────────────────────

  /**
   * Maps a trend direction to its corresponding Material Symbols icon name.
   * 'neutral' is the fallback for unrecognised direction values.
   */
  const TREND_ICON = {
    up:      'trending_up',
    down:    'trending_down',
    neutral: 'trending_flat',
  };

  // ─── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Escapes a value for safe interpolation into HTML.
   * Handles null/undefined by converting to an empty string.
   *
   * @param {*} value
   * @returns {string}
   */
  function _escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ─── HTML template ───────────────────────────────────────────────────────────

  /**
   * Builds the complete info card HTML string.
   *
   * The card is divided into three regions:
   *
   *  header — icon (optional) + label + trend badge (optional)
   *  body   — primary value + sub-value (optional)
   *  footer — separator line + note text (only rendered when data.note is set)
   *
   * Conditional rendering rules:
   *  - The icon-wrap is omitted entirely when data.icon is falsy.
   *  - The trend badge is omitted entirely when data.trend is falsy.
   *  - The sub-value <p> is omitted when data.subValue is falsy.
   *  - The <footer> is omitted when data.note is falsy.
   *  - When options.onClick is provided, the root <article> gains
   *    `data-clickable`, `role="button"`, and `tabindex="0"` so CSS can
   *    apply pointer/hover styles and keyboard users can activate it.
   *
   * @param {object} data            See module-level JSDoc for full shape.
   * @param {object} [options={}]    See module-level JSDoc for full shape.
   * @returns {string}               Full card HTML string.
   */
  function buildHTML(data, options = {}) {
    const variant    = _escapeHtml(options.variant || 'default');
    const isClickable = typeof options.onClick === 'function';

    const label    = _escapeHtml(data?.label    || '');
    const value    = _escapeHtml(data?.value    || '—');
    const subValue = _escapeHtml(data?.subValue || '');
    const iconName = _escapeHtml(data?.icon     || '');
    const note     = _escapeHtml(data?.note     || '');

    // ── Icon (omitted when no icon name is provided) ──
    const iconHTML = iconName
      ? `<div class="ft-info-card__icon-wrap" aria-hidden="true">
           <span class="ft-info-card__icon material-symbols-outlined">${iconName}</span>
         </div>`
      : '';

    // ── Trend badge (omitted when no trend data is provided) ──
    const trend = data?.trend;
    const trendHTML = trend
      ? (() => {
          const dir       = String(trend.direction || 'neutral');
          const safeDir   = _escapeHtml(dir);
          const trendIcon = TREND_ICON[dir] || TREND_ICON.neutral;
          const trendVal  = _escapeHtml(trend.value || '');
          const trendLbl  = _escapeHtml(trend.label || '');
          // aria-label provides a complete readable description for screen readers.
          const ariaLabel = trendLbl ? `${trendVal} ${trendLbl}` : trendVal;
          return `
            <div class="ft-info-card__trend ft-info-card__trend--${safeDir}" aria-label="${ariaLabel}">
              <span class="ft-info-card__trend-icon material-symbols-outlined" aria-hidden="true">${trendIcon}</span>
              <span class="ft-info-card__trend-value">${trendVal}</span>
              ${trendLbl ? `<span class="ft-info-card__trend-label">${trendLbl}</span>` : ''}
            </div>`;
        })()
      : '';

    // ── Sub-value (omitted when empty) ──
    const subValueHTML = subValue
      ? `<p class="ft-info-card__sub-value">${subValue}</p>`
      : '';

    // ── Footer (omitted when no note is provided) ──
    // The footer uses margin-top: auto in CSS so it always sticks to the
    // bottom of the card when cards in the same grid row have different heights.
    const footerHTML = note
      ? `<footer class="ft-info-card__footer">
           <span class="ft-info-card__note">${note}</span>
         </footer>`
      : '';

    // ── Clickable attributes ──
    // data-clickable is the CSS hook for pointer/hover styles.
    // role="button" overrides the implicit article role for screen readers.
    // tabindex="0" makes the card keyboard-focusable.
    const clickableAttrs = isClickable
      ? 'data-clickable tabindex="0" role="button"'
      : '';

    return `
      <article class="ft-info-card" data-variant="${variant}" ${clickableAttrs}>
        <header class="ft-info-card__header">
          ${iconHTML}
          <span class="ft-info-card__label">${label}</span>
          ${trendHTML}
        </header>
        <div class="ft-info-card__body">
          <p class="ft-info-card__value">${value}</p>
          ${subValueHTML}
        </div>
        ${footerHTML}
      </article>`;
  }

  /**
   * Creates and returns a live DOM element for the card.
   *
   * If `options.onClick` is provided it is wired up here (not in buildHTML,
   * since event handlers cannot be serialised into an HTML string).
   * The handler fires on both mouse click and keyboard activation
   * (Enter or Space) since the card carries role="button".
   *
   * @param {object} data            See module-level JSDoc for full shape.
   * @param {object} [options={}]    See module-level JSDoc for full shape.
   * @returns {HTMLElement}
   */
  function createElement(data, options = {}) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildHTML(data, options).trim();
    const el = wrapper.firstElementChild;

    if (el && typeof options.onClick === 'function') {
      el.addEventListener('click', () => options.onClick(data));

      // Keyboard activation — required when the element has role="button".
      el.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault(); // Prevent page scroll on Space.
          options.onClick(data);
        }
      });
    }

    return el;
  }

  // ─── Loading skeleton ─────────────────────────────────────────────────────────

  /**
   * Builds a loading skeleton HTML string.
   *
   * The skeleton mirrors the visual structure of the real card so the layout
   * does not shift when the real content loads. Shape-hint options control
   * whether optional regions (sub-value, trend, note footer) are reserved.
   *
   * The skeleton element carries `aria-hidden="true"` since it conveys no
   * semantic content — callers should provide a separate accessible loading
   * indicator (e.g. a sr-only spinner) if needed.
   *
   * @param {object}  [options={}]
   * @param {boolean} [options.hasSubValue=false]  Reserve a sub-value line.
   * @param {boolean} [options.hasTrend=false]     Reserve a trend badge.
   * @param {boolean} [options.hasNote=false]      Reserve a note footer.
   * @returns {string}
   */
  function buildLoadingHTML(options = {}) {
    const trendSkeletonHTML = options.hasTrend
      ? `<div class="ft-info-card__skeleton ft-info-card__skeleton--trend"></div>`
      : '';

    const subValueSkeletonHTML = options.hasSubValue
      ? `<div class="ft-info-card__skeleton ft-info-card__skeleton--sub-value"></div>`
      : '';

    const footerSkeletonHTML = options.hasNote
      ? `<footer class="ft-info-card__footer">
           <div class="ft-info-card__skeleton ft-info-card__skeleton--note"></div>
         </footer>`
      : '';

    return `
      <article class="ft-info-card ft-info-card--loading" aria-hidden="true">
        <header class="ft-info-card__header">
          <div class="ft-info-card__skeleton ft-info-card__skeleton--icon"></div>
          <div class="ft-info-card__skeleton ft-info-card__skeleton--label"></div>
          ${trendSkeletonHTML}
        </header>
        <div class="ft-info-card__body">
          <div class="ft-info-card__skeleton ft-info-card__skeleton--value"></div>
          ${subValueSkeletonHTML}
        </div>
        ${footerSkeletonHTML}
      </article>`;
  }

  /**
   * Wraps `buildLoadingHTML` and returns a live DOM element.
   *
   * @param {object} [options={}]  Same shape-hint options as buildLoadingHTML.
   * @returns {HTMLElement}
   */
  function createLoadingElement(options = {}) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildLoadingHTML(options).trim();
    return wrapper.firstElementChild;
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  return { buildHTML, createElement, buildLoadingHTML, createLoadingElement };
})();

export { InfoCard };
