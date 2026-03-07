/**
 * Categories page bootstrap.
 *
 * Orchestrates: data loading, card rendering, toolbar filters,
 * category/subcategory modals, and CRUD operations.
 */

import { FeedbackBanner } from '../../components/dumb/feedbackBanner/feedbackBanner.js';
import { CategoryModal } from '../../components/modals/categoryModal/categoryModal.js';
import { renderCategoryCards } from './render.js';
import {
  fetchCategories,
  fetchSubCategories,
  createCategory,
  editorUpdateCategory,
  softDeleteCategory,
  createSubCategory,
  editorUpdateSubCategory,
  softDeleteSubCategory,
} from './actions.js';

/* ── Page Init ────────────────────────────────────────── */

async function initCategoriesPage(root = document) {
  const feedbackEl = root.querySelector('#widget-categories-feedback');
  const gridSection = root.querySelector('#widget-categories-grid');
  const toolbarEl = root.querySelector('#widget-categories-toolbar');
  const newBtn = root.querySelector('#btn-new-category');
  const typeToggle = toolbarEl?.querySelector('#categories-type-toggle');
  const showDeletedToggle = toolbarEl?.querySelector('#categories-show-deleted');

  if (!gridSection) return;

  const state = {
    categories: [],
    subCategories: [],
    typeFilter: '',
    showDeleted: false,
  };

  /* ── Load data ──────────────────────────────────────── */

  try {
    const [cats, subs] = await Promise.all([
      fetchCategories(),
      fetchSubCategories(),
    ]);
    state.categories = Array.isArray(cats) ? cats : [];
    state.subCategories = Array.isArray(subs) ? subs : [];
  } catch (e) {
    return FeedbackBanner.render(feedbackEl, e?.message || 'Failed to load categories.');
  }

  renderFiltered();

  /* ── Toolbar: Type toggle ───────────────────────────── */

  typeToggle?.addEventListener('click', e => {
    const btn = e.target.closest('[data-type]');
    if (!btn) return;
    state.typeFilter = btn.dataset.type;
    typeToggle.querySelectorAll('[data-type]').forEach(b =>
      b.classList.toggle('ft-type-toggle__btn--active', b === btn),
    );
    renderFiltered();
  });

  /* ── Toolbar: Show Deleted ──────────────────────────── */

  showDeletedToggle?.addEventListener('change', () => {
    state.showDeleted = showDeletedToggle.checked;
    renderFiltered();
  });

  /* ── New Category Button ────────────────────────────── */

  newBtn?.addEventListener('click', () => {
    CategoryModal.openNew({
      onSave: async payload => {
        await createCategory(payload);
        FeedbackBanner.render(feedbackEl, 'Category created.', 'success');
        await reloadAll();
        setTimeout(() => FeedbackBanner.clear(feedbackEl), 3000);
      },
    });
  });

  /* ── Helpers ────────────────────────────────────────── */

  function getFiltered() {
    let cats = state.categories;
    let subs = state.subCategories;

    if (state.typeFilter) {
      cats = cats.filter(c => c.type === state.typeFilter);
    }
    if (!state.showDeleted) {
      cats = cats.filter(c => Number(c.active) === 1);
      subs = subs.filter(s => Number(s.active) === 1);
    }

    return { cats, subs };
  }

  function renderFiltered() {
    const { cats, subs } = getFiltered();
    renderCategoryCards(gridSection, cats, subs, {
      onEdit: handleEditCategory,
      onNewSub: handleNewSub,
      onEditSub: handleEditSub,
    });
  }

  async function reloadAll() {
    try {
      const [cats, subs] = await Promise.all([
        fetchCategories(),
        fetchSubCategories(),
      ]);
      state.categories = Array.isArray(cats) ? cats : [];
      state.subCategories = Array.isArray(subs) ? subs : [];
    } catch (e) {
      FeedbackBanner.render(feedbackEl, e?.message || 'Failed to reload data.');
    }
    renderFiltered();
  }

  /* ── Category CRUD handlers ─────────────────────────── */

  function handleEditCategory(cat, subs) {
    CategoryModal.openEdit(cat, subs, {
      onSave: async (id, payload) => {
        await editorUpdateCategory(id, payload);
        FeedbackBanner.render(feedbackEl, 'Category updated.', 'success');
        await reloadAll();
        setTimeout(() => FeedbackBanner.clear(feedbackEl), 3000);
      },
      onSoftDelete: async id => {
        await softDeleteCategory(id);
        FeedbackBanner.render(feedbackEl, 'Category deleted.', 'success');
        await reloadAll();
        setTimeout(() => FeedbackBanner.clear(feedbackEl), 3000);
      },
      onAddSub: cat => handleNewSub(cat),
      onEditSub: (sub, cat) => handleEditSub(sub, cat),
      onSoftDeleteSub: async (sub, cat) => {
        try {
          if (Number(sub.active) === 0) {
            await editorUpdateSubCategory(sub.id, { sub_category: sub.sub_category, category_id: cat.id, active: 1 });
            FeedbackBanner.render(feedbackEl, 'Subcategory restored.', 'success');
          } else {
            await softDeleteSubCategory(sub.id);
            FeedbackBanner.render(feedbackEl, 'Subcategory deleted.', 'success');
          }
          await reloadAll();
          setTimeout(() => FeedbackBanner.clear(feedbackEl), 3000);
        } catch (e) {
          FeedbackBanner.render(feedbackEl, e?.message || 'Operation failed.');
        }
      },
    });
  }

  /* ── Subcategory CRUD handlers ──────────────────────── */

  function handleNewSub(cat) {
    CategoryModal.openSubNew(cat, {
      onSave: async payload => {
        await createSubCategory(payload);
        FeedbackBanner.render(feedbackEl, 'Subcategory created.', 'success');
        await reloadAll();
        setTimeout(() => FeedbackBanner.clear(feedbackEl), 3000);
      },
    });
  }

  function handleEditSub(sub, cat) {
    CategoryModal.openSubEdit(sub, cat, {
      onSave: async (id, payload) => {
        await editorUpdateSubCategory(id, payload);
        FeedbackBanner.render(feedbackEl, 'Subcategory updated.', 'success');
        await reloadAll();
        setTimeout(() => FeedbackBanner.clear(feedbackEl), 3000);
      },
      onSoftDelete: async id => {
        await softDeleteSubCategory(id);
        FeedbackBanner.render(feedbackEl, 'Subcategory deleted.', 'success');
        await reloadAll();
        setTimeout(() => FeedbackBanner.clear(feedbackEl), 3000);
      },
    });
  }
}

export { initCategoriesPage };
