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
  convertedAmountRenderer,
  styledCategoryCellRenderer,
  styledSubCategoryCellRenderer,
  balanceCellRenderer,
} from './gridRenderers.js';

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
  return [
    {
      headerName: 'Date',
      field: 'date',
      cellRenderer: dateCellRenderer,
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
      field: 'value',
      colId: 'converted',
      cellRenderer: convertedAmountRenderer('value', 'currency', rates, targetCurrency),
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
  ];
}
