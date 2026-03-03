import { createNode } from "../core/dom.js";
import { formatCurrency } from "../core/formatters.js";

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Resolves a display string from a raw value.
 * Accepts a pre-formatted string, or a number that will be formatted as currency.
 *
 * @param {string | number} value
 * @param {string} [currency]
 * @param {string} [locale]
 * @returns {string}
 */
function resolveValue(value, currency, locale) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return formatCurrency(value, currency ?? "USD", locale ?? "en-US");
  return "-";
}

/**
 * Builds a trend <span> element with optional Lucide icon.
 *
 * @param {{ text: string, trend?: "positive" | "negative" | "neutral", icon?: string }} opts
 * @returns {HTMLElement}
 */
function buildTrend({ text, trend, icon } = {}) {
  const classes = ["ft-card__trend"];
  if (trend === "positive") classes.push("ft-card__trend--positive");
  else if (trend === "negative") classes.push("ft-card__trend--negative");

  const el = createNode("span", classes.join(" "));

  if (icon) {
    const icn = createNode("i");
    icn.dataset.lucide = icon;
    el.appendChild(icn);
  }

  el.appendChild(document.createTextNode((icon ? " " : "") + text));
  return el;
}

// ── Info Card ─────────────────────────────────────────────────────────

/**
 * Creates a simple summary info card with a title, main value, and an optional complement.
 *
 * @example
 * createInfoCard({
 *   title: "Total Balance",
 *   value: 48230,
 *   currency: "USD",
 *   complement: { text: "+3.2% this month", trend: "positive", icon: "trending-up" },
 * });
 *
 * @param {{
 *   title: string,
 *   value: string | number,
 *   currency?: string,
 *   locale?: string,
 *   complement?: {
 *     text: string,
 *     trend?: "positive" | "negative" | "neutral",
 *     icon?: string,
 *   },
 * }} options
 * @returns {HTMLElement}
 */
export function createInfoCard({ title, value, currency, locale, complement } = {}) {
  const card = createNode("div", "ft-card ft-card--summary");

  card.appendChild(createNode("p", "ft-card__title", title ?? ""));
  card.appendChild(createNode("p", "ft-card__value", resolveValue(value, currency, locale)));

  if (complement) {
    card.appendChild(buildTrend(complement));
  }

  return card;
}

// ── Highlighted Card ──────────────────────────────────────────────────

/**
 * Creates a highlighted info card with a decorative header, detail rows, and a tinted footer.
 *
 * @param {{
 *   title: string,
 *   value: string | number,
 *   currency?: string,
 *   locale?: string,
 *   icon?: string,
 *   accent?: "blue" | "green" | "red",
 *   complement?: {
 *     text: string,
 *     trend?: "positive" | "negative" | "neutral",
 *     icon?: string,
 *   },
 *   rows?: Array<{
 *     label: string,
 *     value: string | number,
 *     currency?: string,
 *     locale?: string,
 *     trend?: "positive" | "negative" | "neutral",
 *   }>,
 *   footer?: {
 *     label: string,
 *     value: string | number,
 *     currency?: string,
 *     locale?: string,
 *     trend?: "positive" | "negative" | "neutral",
 *     icon?: string,
 *   },
 * }} options
 * @returns {HTMLElement}
 */
export function createHighlightCard({
  title,
  value,
  currency,
  locale,
  icon,
  accent,
  complement,
  rows,
  footer,
} = {}) {
  const cardClasses = ["ft-card", "ft-card--highlight"];
  if (accent === "green") cardClasses.push("ft-card--highlight-green");
  else if (accent === "red") cardClasses.push("ft-card--highlight-red");

  const card = createNode("div", cardClasses.join(" "));

  // ── Header ──
  const header = createNode("div", "ft-card__header");

  const headerTop = createNode("div", "ft-card__header-top");

  const headerMeta = createNode("div", "ft-card__header-meta");
  headerMeta.appendChild(createNode("p", "ft-card__title", title ?? ""));
  headerMeta.appendChild(createNode("p", "ft-card__value", resolveValue(value, currency, locale)));
  headerTop.appendChild(headerMeta);

  if (icon) {
    const iconBox = createNode("div", "ft-card__header-icon");
    const icn = createNode("i");
    icn.dataset.lucide = icon;
    iconBox.appendChild(icn);
    headerTop.appendChild(iconBox);
  }

  header.appendChild(headerTop);
  if (complement) header.appendChild(buildTrend(complement));
  card.appendChild(header);

  // ── Rows ──
  if (rows?.length > 0) {
    const rowsEl = createNode("div", "ft-card__rows");

    rows.forEach(({ label, value: rowVal, currency: rowCur, locale: rowLoc, trend }) => {
      const row = createNode("div", "ft-card__row");

      const rowLeft = createNode("div", "ft-card__row-left");
      const dotClasses = ["ft-card__row-dot"];
      if (trend === "positive") dotClasses.push("ft-card__row-dot--positive");
      else if (trend === "negative") dotClasses.push("ft-card__row-dot--negative");
      else dotClasses.push("ft-card__row-dot--neutral");
      rowLeft.appendChild(createNode("span", dotClasses.join(" ")));
      rowLeft.appendChild(createNode("span", "ft-card__row-label", label ?? ""));
      row.appendChild(rowLeft);

      const valueClasses = ["ft-card__row-value"];
      if (trend === "positive") valueClasses.push("ft-card__row-value--positive");
      else if (trend === "negative") valueClasses.push("ft-card__row-value--negative");
      row.appendChild(createNode("span", valueClasses.join(" "), resolveValue(rowVal, rowCur, rowLoc)));

      rowsEl.appendChild(row);
    });

    card.appendChild(rowsEl);
  }

  // ── Footer ──
  if (footer) {
    card.appendChild(createNode("div", "ft-card__divider"));

    const footerEl = createNode("div", "ft-card__footer");
    footerEl.appendChild(createNode("span", "ft-card__footer-label", footer.label ?? ""));
    footerEl.appendChild(
      buildTrend({
        text: resolveValue(footer.value, footer.currency, footer.locale),
        trend: footer.trend,
        icon: footer.icon,
      }),
    );
    card.appendChild(footerEl);
  }

  return card;
}
