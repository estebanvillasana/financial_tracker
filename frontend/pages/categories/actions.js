import { categories, subCategories } from '../../services/api.js';

/* ── Fetch ────────────────────────────────────────────── */

export async function fetchCategories(params = {}) {
  return categories.getAll(params);
}

export async function fetchSubCategories(params = {}) {
  return subCategories.getAll(params);
}

/* ── Category mutations ───────────────────────────────── */

export async function createCategory(payload) {
  return categories.create(payload);
}

export async function editorUpdateCategory(id, payload) {
  return categories.editorUpdate
    ? categories.editorUpdate(id, payload)
    : (await import('../../services/http.js')).request(`/categories/${id}/update`, { method: 'POST', body: payload });
}

export async function softDeleteCategory(id) {
  return categories.softDelete(id);
}

/* ── Subcategory mutations ────────────────────────────── */

export async function createSubCategory(payload) {
  return subCategories.create(payload);
}

export async function editorUpdateSubCategory(id, payload) {
  return subCategories.editorUpdate
    ? subCategories.editorUpdate(id, payload)
    : (await import('../../services/http.js')).request(`/sub-categories/${id}/update`, { method: 'POST', body: payload });
}

export async function softDeleteSubCategory(id) {
  return subCategories.softDelete(id);
}
