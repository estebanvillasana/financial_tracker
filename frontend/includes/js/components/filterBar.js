// filterBar.js — Reusable filter bar UI component.
//
// Builds a row of labelled <select> dropdowns from a descriptor array.
// Designed to be data-agnostic: the caller decides which keys exist and
// populates each one via fill().
//
// Public API returned by createFilterBar():
//   element              — the root <div class="ft-filter-bar"> to append to the DOM.
//   fill(key, values, allLabel) — populates a dropdown by key with an "All" default
//                                 option plus one option per value.
//   getValues()          — returns { [key]: selectedValue } for all dropdowns.
//   onChange(callback)   — fires callback(getValues()) whenever any select changes.
//
// Styling: css/components/filter-bar.css

import { createNode } from "../core/dom.js";

/**
 * @param {Array<{ label: string, key: string }>} filters
 * @returns {{ element: HTMLElement, fill: Function, getValues: Function, onChange: Function }}
 */
export function createFilterBar(filters = []) {
  const bar = createNode("div", "ft-filter-bar");
  const selects = {};

  filters.forEach(({ label, key }, index) => {
    if (index > 0) {
      bar.appendChild(createNode("span", "ft-filter-bar__divider"));
    }

    const item = createNode("label", "ft-filter-bar__item");
    const labelNode = createNode("span", "ft-filter-bar__item-label", label);
    const select = createNode("select", "ft-filter-bar__item-select");
    select.dataset.filter = key;

    item.appendChild(labelNode);
    item.appendChild(select);
    bar.appendChild(item);

    selects[key] = select;
  });

  function fill(key, values = [], allLabel = "All") {
    const select = selects[key];

    if (!select) {
      return;
    }

    select.innerHTML = "";

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = `${allLabel}`;
    select.appendChild(defaultOption);

    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  }

  function getValues() {
    const result = {};

    Object.entries(selects).forEach(([key, select]) => {
      result[key] = select.value;
    });

    return result;
  }

  function onChange(callback) {
    Object.values(selects).forEach((select) => {
      select.addEventListener("change", () => callback(getValues()));
    });
  }

  return { element: bar, fill, getValues, onChange };
}
