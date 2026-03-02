// filters.js — Pure data helpers for the accounts widget.
//
// Responsibilities:
//   - Extract the unique sorted values from a list of account objects so the
//     filter bar dropdowns can be populated (getUniqueValues).
//   - Apply the current filter state to the full accounts array and return
//     only the matching subset (applyFilters).
//
// No DOM, no state mutations — only plain data transforms.
// The UI for the filter bar lives in components/filterBar.js.
// The state object that is matched against lives in state.js.

export function getUniqueValues(items, key) {
  return [...new Set(items.map((item) => item[key]).filter(Boolean))].sort();
}

// Returns a filtered copy of `items` based on the active filter values in
// `state`. Each filter is opt-in: an empty string means "no filter applied".
export function applyFilters(items, state) {
  return items.filter((account) => {
    if (state.holder && account.holderName !== state.holder) {
      return false;
    }

    if (state.currency && account.currency !== state.currency) {
      return false;
    }

    if (state.type && account.typeLabel !== state.type) {
      return false;
    }

    return true;
  });
}
