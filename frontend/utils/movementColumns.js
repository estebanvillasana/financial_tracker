/**
 * Shared column definitions for the standard movements table.
 *
 * Used by both the Movements page grid (pages/movements/grid.js) and the
 * Dashboard's recent movements widget (pages/dashboard/recentMovements.js)
 * to avoid duplicate column definition code.
 */

import {
  dateCellRenderer,
  moneyCentsCellRenderer,
  accountCellRenderer,
  typeBadgeRenderer,
  styledCategoryCellRenderer,
  styledSubCategoryCellRenderer,
  balanceCellRenderer,
} from './gridRenderers.js';
import { formatMoneyFromCents, normalizeCurrency } from './formatters.js';

/**
 * Converts a cents value from its source currency into target currency cents.
 * Returns null when conversion is not possible (missing/invalid FX rate).
 */
export function getConvertedCents(cents, sourceCurrency, rates, targetCurrency) {
  const amount = Number(cents);
  if (!Number.isFinite(amount)) return null;

  const src = normalizeCurrency(sourceCurrency || '');
  const tgt = normalizeCurrency(targetCurrency || '');
  if (!src || !tgt) return null;
  if (src === tgt) return Math.round(amount);

  const srcRate = Number(rates?.[src]);
  const tgtRate = Number(rates?.[tgt] ?? 1);
  if (!Number.isFinite(srcRate) || srcRate <= 0 || !Number.isFinite(tgtRate) || tgtRate <= 0) {
    return null;
  }

  return Math.round(amount * tgtRate / srcRate);
}

/**
 * Builds the standard 9-column movements table column definitions.
 *
 * Columns: Date | Movement | Account | Type | Amount | Converted | Balance | Category | Sub-category
 *
 * @param {object} rates          - FX rates keyed by uppercase ISO code (base USD).
 * @param {string} targetCurrency - App's main currency code (e.g. 'USD').
 * @returns {Array} AG Grid columnDefs
 */
export function buildMovementColumnDefs(rates, targetCurrency) {
  const targetCur = normalizeCurrency(targetCurrency);

  return [
    {
      headerName: 'Date',
      field: 'date',
      cellRenderer: params => {
        if (params.node.footer) {
          return '<span class="ft-grid-total-label">Grand Total</span>';
        }
        return dateCellRenderer(params);
      },
      width: 115,
      sort: 'desc',
    },
    {
      headerName: 'Movement',
      field: 'movement',
      flex: 2,
      minWidth: 140,
    },
    {
      headerName: 'Account',
      field: 'account',
      cellRenderer: accountCellRenderer('account', 'currency'),
      flex: 1,
      minWidth: 120,
    },
    {
      headerName: 'Type',
      field: 'type',
      cellRenderer: typeBadgeRenderer,
      width: 85,
    },
    {
      headerName: 'Amount',
      field: 'value',
      cellRenderer: moneyCentsCellRenderer('value', 'currency'),
      width: 145,
      headerClass: 'ft-ag-header-right',
      cellStyle: { textAlign: 'right' },
    },
    {
      headerName: 'Converted',
      field: 'converted_cents',
      colId: 'converted',
      // Return signed cents so aggFunc:'sum' computes the correct net balance.
      // Expenses are negative, income is positive.
      valueGetter: params => {
        const cents = getConvertedCents(
          params.data?.value,
          params.data?.currency,
          rates,
          targetCur,
        );
        if (cents == null) return null;
        return params.data?.type === 'Expense' ? -cents : cents;
      },
      cellRenderer: params => {
        const val = params.value;
        if (params.node.footer) {
          // Grand total row — show signed net balance (income − expenses).
          if (val == null) return '<span class="ft-grid-amount ft-grid-amount--converted">—</span>';
          return `<span class="ft-grid-amount ft-grid-amount--converted">${formatMoneyFromCents(val, targetCur)}</span>`;
        }
        // Regular row — show absolute value; the Type badge conveys direction.
        if (val == null) return '<span class="ft-grid-amount ft-grid-amount--converted">—</span>';
        return `<span class="ft-grid-amount ft-grid-amount--converted">${formatMoneyFromCents(Math.abs(val), targetCur)}</span>`;
      },
      aggFunc: 'sum',
      allowedAggFuncs: ['sum', 'avg', 'min', 'max'],
      width: 145,
      headerClass: 'ft-ag-header-right',
      cellStyle: { textAlign: 'right' },
    },
    {
      headerName: 'Balance',
      field: 'balance_at_date',
      cellRenderer: balanceCellRenderer('currency'),
      width: 155,
      headerClass: 'ft-ag-header-right',
      cellStyle: { textAlign: 'right' },
      sortable: false,
    },
    {
      headerName: 'Category',
      field: 'category',
      cellRenderer: styledCategoryCellRenderer,
      flex: 1,
      minWidth: 100,
    },
    {
      headerName: 'Sub-category',
      field: 'sub_category',
      cellRenderer: styledSubCategoryCellRenderer,
      flex: 1,
      minWidth: 100,
    },
    {
      headerName: 'Repetitive Movement',
      field: 'repetitive_movement',
      flex: 1,
      minWidth: 120,
      valueFormatter: p => p.node?.footer ? '' : (p.value ?? '—'),
      cellStyle: p => (!p.node?.footer && !p.value) ? { color: 'var(--ft-color-text-muted)' } : {},
    },
  ];
}
