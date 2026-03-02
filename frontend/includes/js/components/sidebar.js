import { createNode, clearChildren } from "../core/dom.js";

const DEFAULT_ITEMS = [
  { label: "Overview", icon: "layout-dashboard", href: "/overview" },
  { label: "Transactions", icon: "receipt", href: "/transactions" },
  { label: "Internal Transfers", icon: "repeat", href: "/transfers" },
  { label: "Accounts", icon: "landmark", href: "/accounts" },
  { label: "Reports", icon: "bar-chart-3", href: "/reports" },
];

function resolveActivePath(activePath) {
  if (activePath) {
    return activePath;
  }

  if (window.location.hash) {
    return window.location.hash.replace("#", "/");
  }

  return window.location.pathname;
}

export function createSidebar({ items = DEFAULT_ITEMS, activePath } = {}) {
  const resolvedActivePath = resolveActivePath(activePath);
  const sidebar = createNode("aside", "ft-sidebar");

  const brand = createNode("div", "ft-sidebar__brand");
  const title = createNode("p", "ft-sidebar__title", "Financial Tracker");
  const subtitle = createNode("p", "ft-sidebar__subtitle", "Personal banking");
  brand.appendChild(title);
  brand.appendChild(subtitle);

  const nav = createNode("nav", "ft-sidebar__nav");

  items.forEach((item) => {
    const link = createNode("a", "ft-sidebar__item");
    link.href = item.href;

    if (resolvedActivePath && item.href && resolvedActivePath.startsWith(item.href)) {
      link.classList.add("ft-sidebar__item--active");
    }

    const icon = createNode("i", "ft-icon ft-icon--md");
    icon.dataset.lucide = item.icon;

    const label = createNode("span", "ft-sidebar__item-label", item.label);
    link.appendChild(icon);
    link.appendChild(label);

    nav.appendChild(link);
  });

  sidebar.appendChild(brand);
  sidebar.appendChild(nav);

  return sidebar;
}

export function renderSidebar({ container, items, activePath } = {}) {
  if (!(container instanceof HTMLElement)) {
    throw new Error("renderSidebar requires a valid container element.");
  }

  clearChildren(container);
  container.appendChild(createSidebar({ items, activePath }));
}
