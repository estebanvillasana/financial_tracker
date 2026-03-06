/**
 * feedbackBanner.js
 *
 * Dumb component for displaying transient feedback messages
 * (error, success, warning) with optional inline action buttons.
 *
 * Used across pages for validation errors, success confirmations,
 * and warning banners with confirm/cancel actions.
 *
 * Pattern: Revealing Module (IIFE) — same as InfoCard, FilterBar.
 *
 * Public API:
 *   FeedbackBanner.render(container, message, tone)
 *   FeedbackBanner.renderWithActions(container, message, actions)
 *   FeedbackBanner.clear(container)
 */

const FeedbackBanner = (() => {

  /**
   * Renders a transient feedback banner.
   *
   * @param {HTMLElement}                      container - Container element
   * @param {string}                           message   - HTML message (empty clears)
   * @param {'error'|'success'|'warning'}      [tone='error']
   */
  function render(container, message, tone = 'error') {
    if (!container) return;
    if (!message) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = `<div class="ft-feedback-banner ft-feedback-banner--${tone}">${message}</div>`;
  }

  /**
   * Renders a warning feedback with inline action buttons.
   *
   * @param {HTMLElement} container - Container element
   * @param {string}      message   - Warning text
   * @param {Array<{label: string, className?: string, onClick: Function}>} actions
   */
  function renderWithActions(container, message, actions = []) {
    if (!container) return;

    const actionsHtml = actions
      .map((a, i) => {
        const cls = a.className ? ` ${a.className}` : '';
        return `<button class="ft-feedback-banner__btn${cls}" data-action-index="${i}">${a.label}</button>`;
      })
      .join('');

    container.innerHTML = `
      <div class="ft-feedback-banner ft-feedback-banner--warning">
        ${message}
        <span class="ft-feedback-banner__actions">${actionsHtml}</span>
      </div>`;

    container.addEventListener('click', function _handler(event) {
      const btn = event.target.closest('[data-action-index]');
      if (!btn) return;
      const index = Number(btn.dataset.actionIndex);
      if (actions[index]?.onClick) actions[index].onClick();
      container.removeEventListener('click', _handler);
    }, { once: false });
  }

  /**
   * Clears any feedback banner from the container.
   *
   * @param {HTMLElement} container
   */
  function clear(container) {
    if (container) container.innerHTML = '';
  }

  return { render, renderWithActions, clear };
})();

export { FeedbackBanner };
