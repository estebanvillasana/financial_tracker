// filterBar.js — Dumb reusable filter bar component

const FilterBar = (() => {
  function _escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function _toArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function _buildSelectOptions(options = [], selectedValue = '') {
    return _toArray(options).map(option => {
      const optionValue = _escapeHtml(option?.value ?? '');
      const optionLabel = _escapeHtml(option?.label ?? option?.value ?? '');
      const isSelected = String(option?.value ?? '') === String(selectedValue) ? ' selected' : '';
      return `<option value="${optionValue}"${isSelected}>${optionLabel}</option>`;
    }).join('');
  }

  function _buildField(field = {}, options = {}) {
    const id = _escapeHtml(field.id ?? '');
    const label = _escapeHtml(field.label ?? field.id ?? '');
    const type = String(field.type || 'text').toLowerCase();
    const placeholder = _escapeHtml(field.placeholder ?? '');
    const value = _escapeHtml(field.value ?? '');
    const extraClass = field.className ? ` ${_escapeHtml(field.className)}` : '';
    const labelHTML = options.hideLabels
      ? ''
      : `<span class="ft-filter-bar__label">${label}</span>`;

    if (type === 'select') {
      return `
        <label class="ft-filter-bar__field ft-filter-bar__field--select${extraClass}">
          ${labelHTML}
          <select class="ft-filter-bar__control" data-filter-id="${id}" aria-label="${label}">
            ${_buildSelectOptions(field.options, field.value)}
          </select>
        </label>`;
    }

    const inputType = ['date', 'month', 'number', 'search'].includes(type) ? type : 'text';
    return `
      <label class="ft-filter-bar__field ft-filter-bar__field--${inputType}${extraClass}">
        ${labelHTML}
        <input
          class="ft-filter-bar__control"
          type="${inputType}"
          value="${value}"
          placeholder="${placeholder}"
          data-filter-id="${id}"
          aria-label="${label}"
        />
      </label>`;
  }

  function _buildAction(action = {}) {
    const id = _escapeHtml(action.id ?? '');
    const icon = action.icon ? `<span class="material-symbols-outlined" aria-hidden="true">${_escapeHtml(action.icon)}</span>` : '';
    const label = _escapeHtml(action.label ?? action.id ?? 'Action');
    const variant = action.variant === 'primary' ? 'ft-btn--primary' : 'ft-btn--ghost';
    return `
      <button type="button" class="ft-btn ${variant}" data-filter-action="${id}">
        ${icon}${label}
      </button>`;
  }

  // config.variant    — 'default' (boxed, default) | 'bare' (no container box)
  // config.hideLabels — true: omit the label text above each control (optional)
  function buildHTML(config = {}) {
    const fields = _toArray(config.fields);
    const actions = _toArray(config.actions);
    const isBare = String(config.variant || '') === 'bare';
    const fieldOptions = { hideLabels: config.hideLabels === true };

    const rootClass = isBare ? 'ft-filter-bar ft-filter-bar--bare' : 'ft-filter-bar';
    const fieldsHTML = fields.map(f => _buildField(f, fieldOptions)).join('');
    const actionsHTML = actions.map(_buildAction).join('');

    return `
      <section class="${rootClass}" aria-label="Filters">
        <div class="ft-filter-bar__fields">${fieldsHTML}</div>
        <div class="ft-filter-bar__actions">${actionsHTML}</div>
      </section>`;
  }

  function createElement(config = {}) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildHTML(config).trim();
    return wrapper.firstElementChild;
  }

  function getValues(rootElement) {
    const root = rootElement?.querySelector ? rootElement : null;
    const values = {};
    if (!root) return values;

    root.querySelectorAll('[data-filter-id]').forEach(control => {
      const key = control.dataset.filterId;
      if (!key) return;
      values[key] = control.value;
    });

    return values;
  }

  function setValues(rootElement, values = {}) {
    const root = rootElement?.querySelector ? rootElement : null;
    if (!root || !values || typeof values !== 'object') return;

    Object.entries(values).forEach(([key, value]) => {
      const control = root.querySelector(`[data-filter-id="${CSS.escape(key)}"]`);
      if (!control) return;
      control.value = value ?? '';
    });
  }

  function hydrate(rootElement, handlers = {}) {
    const root = rootElement?.querySelector ? rootElement : null;
    if (!root) return;

    const onFilterChange = typeof handlers.onFilterChange === 'function' ? handlers.onFilterChange : null;
    const onAction = typeof handlers.onAction === 'function' ? handlers.onAction : null;

    root.addEventListener('change', event => {
      const control = event.target.closest('[data-filter-id]');
      if (!control) return;
      onFilterChange?.(getValues(root), { id: control.dataset.filterId, value: control.value, event });
    });

    root.addEventListener('click', event => {
      const button = event.target.closest('[data-filter-action]');
      if (!button) return;
      onAction?.(button.dataset.filterAction, getValues(root), event);
    });
  }

  function render(target, config = {}, handlers = {}) {
    const container = typeof target === 'string' ? document.querySelector(target) : target;
    if (!container) return null;

    container.innerHTML = buildHTML(config);
    const root = container.querySelector('.ft-filter-bar');
    hydrate(root, handlers);
    return root;
  }

  return { buildHTML, createElement, getValues, setValues, hydrate, render };
})();

export { FilterBar };
