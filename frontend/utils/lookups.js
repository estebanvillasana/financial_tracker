/**
 * Shared lookup helpers for categories, sub-categories, and related entities.
 * Side-effect free — reusable across any page that works with category data.
 */

/** Resolves category label by ID. */
function categoryLabelById(categories, id) {
  const match = categories.find(item => Number(item.id) === Number(id));
  return match ? match.category : '';
}

/** Resolves sub-category label by ID. */
function subCategoryLabelById(subCategories, id) {
  const match = subCategories.find(item => Number(item.id) === Number(id));
  return match ? match.sub_category : '';
}

/** Returns categories matching the target movement type. */
function getCategoriesByType(categories, type) {
  return categories.filter(item => item.type === type);
}

/** Returns sub-categories compatible with a given type and optional category. */
function getSubCategoriesByTypeAndCategory(subCategories, type, categoryId) {
  return subCategories.filter(item => {
    if (item.type !== type) return false;
    if (!Number.isFinite(Number(categoryId))) return true;
    return Number(item.category_id) === Number(categoryId);
  });
}

export {
  categoryLabelById,
  subCategoryLabelById,
  getCategoriesByType,
  getSubCategoriesByTypeAndCategory,
};