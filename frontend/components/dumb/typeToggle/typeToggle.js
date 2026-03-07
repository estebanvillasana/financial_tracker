/**
 * typeToggle.js
 *
 * Dumb component for the Income / Expense / All type toggle.
 *
 * Pattern: Revealing Module (IIFE).
 *
 * Public API:
 *   TypeToggle.buildHTML(options)     → string
 *   TypeToggle.createElement(options) → HTMLElement
 *   TypeToggle.setActive(element, type)
 *
 * ── options shape ───────────────────────────────────────────────────────────
 * {
 *   activeType: '' | 'Income' | 'Expense'   (defaults to '')
 *   id:         string                     (optional root id)
 *   className:  string                     (optional extra class on root)
 *   onChange:   function(type)             (optional)
 * }
 */

const TypeToggle = (() => {
  const TYPES = [
    { type: '', label: 'All', mod: 'all' },
    { type: 'Expense', label: 'Expense', mod: 'expense' },
    { type: 'Income', label: 'Income', mod: 'income' },
  ];

  function _escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function _buildButtons(activeType) {
    const active = String(activeType ?? '');
    return TYPES.map(item => {
      const isActive = item.type === active;
      const activeCls = isActive ? ' ft-type-toggle__btn--active' : '';
      return `
        <button class="ft-type-toggle__btn ft-type-toggle__btn--${item.mod}${activeCls}" data-type="${_escapeHtml(item.type)}" type="button">
          ${item.label}
        </button>`;
    }).join('');
  }

  function buildHTML(options = {}) {
    const classes = ['ft-type-toggle', options.className].filter(Boolean).join(' ');
    const idAttr = options.id ? ` id="${_escapeHtml(options.id)}"` : '';
    return `<div class="${classes}"${idAttr}>${_buildButtons(options.activeType)}</div>`;
  }

  function _setActive(root, type) {
    const target = String(type ?? '');
    root.querySelectorAll('[data-type]').forEach(btn => {
      btn.classList.toggle('ft-type-toggle__btn--active', String(btn.dataset.type ?? '') === target);
    });
  }

  function createElement(options = {}) {
    const root = document.createElement('div');
    root.className = ['ft-type-toggle', options.className].filter(Boolean).join(' ');
    if (options.id) root.id = options.id;
    root.innerHTML = _buildButtons(options.activeType);

    root.addEventListener('click', event => {
      const btn = event.target.closest('[data-type]');
      if (!btn || !root.contains(btn)) return;
      const nextType = btn.dataset.type ?? '';
      _setActive(root, nextType);
      if (typeof options.onChange === 'function') options.onChange(nextType);
    });

    _setActive(root, options.activeType);
    return root;
  }

  return { buildHTML, createElement, setActive: _setActive };
})();

export { TypeToggle };
