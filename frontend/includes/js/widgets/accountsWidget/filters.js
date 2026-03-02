export function getUniqueValues(items, key) {
  return [...new Set(items.map((item) => item[key]).filter(Boolean))].sort();
}

export function fillSelect(select, values, label) {
  if (!select) {
    return;
  }

  select.innerHTML = "";
  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = `All ${label}`;
  select.appendChild(defaultOption);

  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

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
