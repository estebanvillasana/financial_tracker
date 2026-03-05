// pagination.js — Dumb reusable pagination component

const Pagination = (() => {
  function _toNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function _clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function _normalize(options = {}) {
    const totalItems = Math.max(0, _toNumber(options.totalItems, 0));
    const pageSize = Math.max(1, _toNumber(options.pageSize, 10));
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const page = _clamp(Math.floor(_toNumber(options.page, 1)), 1, totalPages);
    const maxVisiblePages = Math.max(3, _toNumber(options.maxVisiblePages, 5));
    return { totalItems, pageSize, totalPages, page, maxVisiblePages };
  }

  function _buildPageRange(page, totalPages, maxVisiblePages) {
    if (totalPages <= maxVisiblePages) {
      return Array.from({ length: totalPages }, (_, idx) => idx + 1);
    }

    const pages = [1];
    const middleSlots = maxVisiblePages - 2;
    let start = Math.max(2, page - Math.floor(middleSlots / 2));
    let end = Math.min(totalPages - 1, start + middleSlots - 1);

    if (end >= totalPages - 1) {
      start = Math.max(2, totalPages - middleSlots);
      end = totalPages - 1;
    }

    if (start > 2) pages.push('...');
    for (let current = start; current <= end; current += 1) pages.push(current);
    if (end < totalPages - 1) pages.push('...');
    pages.push(totalPages);

    return pages;
  }

  function _buildPageButton(pageNumber, currentPage) {
    const isActive = pageNumber === currentPage;
    return `
      <button
        type="button"
        class="ft-pagination__btn${isActive ? ' ft-pagination__btn--active' : ''}"
        data-page-index="${pageNumber}"
        aria-label="Go to page ${pageNumber}"
        aria-current="${isActive ? 'page' : 'false'}"
      >
        ${pageNumber}
      </button>`;
  }

  function buildHTML(options = {}) {
    const state = _normalize(options);
    const pageRange = _buildPageRange(state.page, state.totalPages, state.maxVisiblePages);
    const startItem = state.totalItems === 0 ? 0 : (state.page - 1) * state.pageSize + 1;
    const endItem = Math.min(state.totalItems, state.page * state.pageSize);

    const pageButtons = pageRange.map(item => {
      if (item === '...') {
        return '<span class="ft-pagination__ellipsis" aria-hidden="true">...</span>';
      }
      return _buildPageButton(item, state.page);
    }).join('');

    return `
      <section class="ft-pagination" aria-label="Pagination">
        <div class="ft-pagination__summary ft-small ft-text-muted">
          Showing ${startItem}-${endItem} of ${state.totalItems}
        </div>
        <div class="ft-pagination__controls">
          <button
            type="button"
            class="ft-pagination__btn"
            data-page-action="prev"
            aria-label="Previous page"
            ${state.page <= 1 ? 'disabled' : ''}
          >
            <span class="material-symbols-outlined" aria-hidden="true">chevron_left</span>
          </button>
          ${pageButtons}
          <button
            type="button"
            class="ft-pagination__btn"
            data-page-action="next"
            aria-label="Next page"
            ${state.page >= state.totalPages ? 'disabled' : ''}
          >
            <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
          </button>
        </div>
      </section>`;
  }

  function createElement(options = {}) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildHTML(options).trim();
    return wrapper.firstElementChild;
  }

  function hydrate(rootElement, options = {}, handlers = {}) {
    const root = rootElement?.querySelector ? rootElement : null;
    if (!root) return;

    const state = _normalize(options);
    const onPageChange = typeof handlers.onPageChange === 'function' ? handlers.onPageChange : null;

    root.addEventListener('click', event => {
      const pageButton = event.target.closest('[data-page-index]');
      if (pageButton) {
        const nextPage = _clamp(_toNumber(pageButton.dataset.pageIndex, state.page), 1, state.totalPages);
        if (nextPage !== state.page) onPageChange?.(nextPage, state, event);
        return;
      }

      const actionButton = event.target.closest('[data-page-action]');
      if (!actionButton) return;

      const action = actionButton.dataset.pageAction;
      const candidate = action === 'prev' ? state.page - 1 : state.page + 1;
      const nextPage = _clamp(candidate, 1, state.totalPages);
      if (nextPage !== state.page) onPageChange?.(nextPage, state, event);
    });
  }

  function render(target, options = {}, handlers = {}) {
    const container = typeof target === 'string' ? document.querySelector(target) : target;
    if (!container) return null;

    container.innerHTML = buildHTML(options);
    const root = container.querySelector('.ft-pagination');
    hydrate(root, options, handlers);
    return root;
  }

  return { buildHTML, createElement, hydrate, render };
})();

export { Pagination };
