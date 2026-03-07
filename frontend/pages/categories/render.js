/**
 * render.js — Category card rendering for the Categories page.
 *
 * Renders a grid of category cards, each with an expandable subcategory
 * list and action buttons. Follows the existing card-grid patterns
 * (accountSummaryCard, breakdown cards).
 */

import { escapeHtml } from '../../utils/formHelpers.js';

/* ── Constants ────────────────────────────────────────── */

const INTEGER_FMT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function _fmtCount(v) {
  const n = Number(v);
  return Number.isFinite(n) ? INTEGER_FMT.format(Math.max(0, Math.trunc(n))) : '0';
}

/* ── Public API ───────────────────────────────────────── */

/**
 * Renders the full category card grid into `container`.
 *
 * @param {HTMLElement}   container
 * @param {object[]}      categories   - Category records from the API.
 * @param {object[]}      subCategories - Subcategory records.
 * @param {object}        callbacks    - { onEdit, onNewSub, onToggle }
 */
export function renderCategoryCards(container, categories, subCategories, callbacks) {
  if (!container) return;

  if (!categories.length) {
    container.innerHTML = `
      <div class="ft-categories-grid">
        <div class="ft-empty" style="grid-column: 1 / -1;">
          <span class="ft-empty__icon material-symbols-outlined" aria-hidden="true">sell</span>
          <p class="ft-small">No categories found</p>
        </div>
      </div>`;
    return;
  }

  const subsMap = _buildSubsMap(subCategories);

  const cards = categories.map(cat => _buildCategoryCard(cat, subsMap[cat.id] || [])).join('');
  container.innerHTML = `<div class="ft-categories-grid">${cards}</div>`;

  _hydrateCards(container, categories, subsMap, callbacks);
}

/* ── Private: build subcategories lookup ──────────────── */

function _buildSubsMap(subCategories) {
  const map = {};
  for (const sub of subCategories) {
    const catId = Number(sub.category_id);
    if (!map[catId]) map[catId] = [];
    map[catId].push(sub);
  }
  return map;
}

/* ── Private: card HTML ───────────────────────────────── */

function _buildCategoryCard(cat, subs) {
  const isInactive = Number(cat.active) === 0;
  const typeCls = cat.type === 'Income' ? 'income' : 'expense';
  const statusCls = isInactive ? ' ft-category-card--inactive' : '';
  const activeSubs = subs.filter(s => Number(s.active) === 1);
  const inactiveSubs = subs.filter(s => Number(s.active) === 0);

  const subsHtml = subs.length
    ? subs.map(s => _buildSubRow(s)).join('')
    : '<div class="ft-category-card__sub-empty ft-small ft-text-muted">No subcategories</div>';

  return `
    <div class="ft-category-card ft-card${statusCls}" data-category-id="${cat.id}">
      <div class="ft-category-card__header">
        <div class="ft-category-card__title-row">
          <h3 class="ft-category-card__name">${escapeHtml(cat.category)}</h3>
          <div class="ft-category-card__badges">
            <span class="ft-category-card__type ft-category-card__type--${typeCls}">${escapeHtml(cat.type)}</span>
            ${isInactive ? '<span class="ft-category-card__status ft-category-card__status--inactive">Inactive</span>' : ''}
          </div>
        </div>
        <div class="ft-category-card__meta">
          <span class="ft-small ft-text-muted">
            <span class="material-symbols-outlined ft-category-card__meta-icon" aria-hidden="true">receipt_long</span>
            ${_fmtCount(cat.movements_count)} movements
          </span>
          <span class="ft-small ft-text-muted">
            <span class="material-symbols-outlined ft-category-card__meta-icon" aria-hidden="true">account_tree</span>
            ${_fmtCount(cat.subcategories_count)} subcategories
          </span>
        </div>
      </div>

      <div class="ft-category-card__subs-section">
        <button class="ft-category-card__toggle-btn" data-action="toggle-subs" aria-expanded="false">
          <span class="material-symbols-outlined ft-category-card__toggle-icon" aria-hidden="true">expand_more</span>
          <span class="ft-small">Subcategories</span>
          <span class="ft-category-card__subs-count ft-small ft-text-muted">${activeSubs.length} active${inactiveSubs.length ? `, ${inactiveSubs.length} inactive` : ''}</span>
        </button>
        <div class="ft-category-card__subs-list" hidden>
          ${subsHtml}
        </div>
      </div>

      <div class="ft-category-card__actions">
        <button class="ft-btn ft-btn--ghost ft-btn--sm" data-action="edit-category">
          <span class="material-symbols-outlined" aria-hidden="true">edit</span>
          Edit
        </button>
        <button class="ft-btn ft-btn--ghost ft-btn--sm" data-action="add-sub">
          <span class="material-symbols-outlined" aria-hidden="true">add</span>
          Add Sub
        </button>
      </div>
    </div>`;
}

function _buildSubRow(sub) {
  const isInactive = Number(sub.active) === 0;
  const inactiveCls = isInactive ? ' ft-category-card__sub-row--inactive' : '';

  return `
    <div class="ft-category-card__sub-row${inactiveCls}" data-sub-id="${sub.id}">
      <div class="ft-category-card__sub-info">
        <span class="ft-category-card__sub-name">${escapeHtml(sub.sub_category)}</span>
        <span class="ft-small ft-text-muted">${_fmtCount(sub.movements_count)} mov.</span>
        ${isInactive ? '<span class="ft-category-card__sub-status">Inactive</span>' : ''}
      </div>
      <div class="ft-category-card__sub-actions">
        <button class="ft-category-card__sub-btn" data-action="edit-sub" data-sub-id="${sub.id}" title="Edit subcategory">
          <span class="material-symbols-outlined" aria-hidden="true">edit</span>
        </button>
      </div>
    </div>`;
}

/* ── Private: hydrate event listeners ─────────────────── */

function _hydrateCards(container, categories, subsMap, callbacks) {
  container.addEventListener('click', e => {
    const card = e.target.closest('[data-category-id]');
    if (!card) return;
    const catId = Number(card.dataset.categoryId);
    const cat = categories.find(c => c.id === catId);

    /* Toggle subcategories list */
    const toggleBtn = e.target.closest('[data-action="toggle-subs"]');
    if (toggleBtn) {
      const list = card.querySelector('.ft-category-card__subs-list');
      const expanded = list.hidden;
      list.hidden = !expanded;
      toggleBtn.setAttribute('aria-expanded', String(expanded));
      toggleBtn.querySelector('.ft-category-card__toggle-icon')
        .textContent = expanded ? 'expand_less' : 'expand_more';
      return;
    }

    /* Edit category */
    if (e.target.closest('[data-action="edit-category"]')) {
      callbacks.onEdit?.(cat, subsMap[catId] || []);
      return;
    }

    /* Add subcategory */
    if (e.target.closest('[data-action="add-sub"]')) {
      callbacks.onNewSub?.(cat);
      return;
    }

    /* Edit subcategory */
    const editSubBtn = e.target.closest('[data-action="edit-sub"]');
    if (editSubBtn) {
      const subId = Number(editSubBtn.dataset.subId);
      const allSubs = subsMap[catId] || [];
      const sub = allSubs.find(s => s.id === subId);
      if (sub) callbacks.onEditSub?.(sub, cat);
    }
  });
}
