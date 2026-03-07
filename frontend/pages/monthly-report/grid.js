/**
 * Monthly Report — AG Grid configurations.
 *
 * Two grids:
 *  1. Accountant Summary — taxable repetitive movements grouped by item
 *  2. Invoice Tracker    — all movements linked to taxable rep. movements with invoice checkbox
 */

import { createStandardGrid } from '../../utils/gridHelper.js';
import {
  dateCellRenderer,
  moneyCentsCellRenderer,
  accountCellRenderer,
  typeBadgeRenderer,
  convertedAmountRenderer,
  styledCategoryCellRenderer,
  styledSubCategoryCellRenderer,
} from '../../utils/gridRenderers.js';
import { normalizeCurrency, formatMoneyFromCents } from '../../utils/formatters.js';
import { updateInvoiceFlag } from './actions.js';

/* ═══════════════════════════════════════════════════════════════
   1. ACCOUNTANT SUMMARY GRID
   ═══════════════════════════════════════════════════════════════ */

/**
 * Builds row data for the accountant summary grid.
 *
 * Groups movements by repetitive_movement_id and sums values converted
 * to the main currency so the accountant sees comparable amounts.
 *
 * @param {Array} monthMovements       — all movements for the month
 * @param {Array} taxableRepMovements  — repetitive movements with tax_report=1
 * @param {object} rates               — FX rates
 * @param {string} mainCurrency        — app main currency
 * @returns {Array} rows for AG Grid
 */
export function buildAccountantRows(monthMovements, taxableRepMovements, rates, mainCurrency) {
  const mc = normalizeCurrency(mainCurrency);
  const tgtRate = rates[mc] ?? 1;
  const taxableIds = new Set(taxableRepMovements.map(r => r.id));

  // Group movements by repetitive_movement_id
  const grouped = {};
  for (const mov of monthMovements) {
    const repId = mov.repetitive_movement_id;
    if (!repId || !taxableIds.has(repId)) continue;

    if (!grouped[repId]) {
      grouped[repId] = {
        repetitive_movement_id: repId,
        repetitive_movement: mov.repetitive_movement || 'Unknown',
        type: mov.type,
        category: mov.category || '',
        total_cents: 0,
        movement_count: 0,
      };
    }

    // Convert to main currency for accountant-comparable totals
    const src = normalizeCurrency(mov.currency);
    const srcRate = rates[src] ?? 1;
    const rawCents = Math.abs(Number(mov.value ?? 0));
    const converted = (src === mc) ? rawCents : Math.round(rawCents * tgtRate / srcRate);

    grouped[repId].total_cents += converted;
    grouped[repId].movement_count += 1;
  }

  // Enrich with repetitive movement metadata
  const rows = [];
  for (const rep of taxableRepMovements) {
    const entry = grouped[rep.id];
    if (!entry) continue;
    rows.push({
      ...entry,
      description: rep.description || '',
      type: rep.type,
    });
  }

  rows.sort((a, b) => b.total_cents - a.total_cents);
  return rows;
}

/**
 * Mounts the accountant summary AG Grid.
 *
 * @param {HTMLElement} hostEl
 * @param {Array}  rows — from buildAccountantRows
 * @param {string} mainCurrency
 * @returns {Promise<object>} gridApi
 */
export async function mountAccountantGrid(hostEl, rows, mainCurrency) {
  const mc = normalizeCurrency(mainCurrency);

  const columnDefs = [
    {
      headerName: 'Taxable Item',
      field: 'repetitive_movement',
      flex: 2,
      minWidth: 180,
      cellRenderer: params => {
        const name = params.value || '';
        return `<span class="ft-grid-rep-name">${name}</span>`;
      },
    },
    {
      headerName: 'Type',
      field: 'type',
      cellRenderer: typeBadgeRenderer,
      width: 85,
    },
    {
      headerName: 'Category',
      field: 'category',
      cellRenderer: styledCategoryCellRenderer,
      flex: 1,
      minWidth: 100,
    },
    {
      headerName: 'Movements',
      field: 'movement_count',
      width: 110,
      headerClass: 'ft-ag-header-right',
      cellStyle: { textAlign: 'right' },
    },
    {
      headerName: `Total (${mc})`,
      field: 'total_cents',
      width: 160,
      headerClass: 'ft-ag-header-right',
      cellStyle: { textAlign: 'right' },
      cellRenderer: params => {
        const cents = params.value;
        if (cents == null) return '';
        return `<span class="ft-grid-amount">${formatMoneyFromCents(cents, mc)}</span>`;
      },
    },
    {
      headerName: 'Description',
      field: 'description',
      flex: 1,
      minWidth: 120,
    },
  ];

  return createStandardGrid(hostEl, {
    columnDefs,
    rowData: rows,
    domLayout: 'autoHeight',
    suppressCellFocus: true,
    overlayNoRowsTemplate:
      '<span class="ft-small ft-text-muted">No taxable movements this month</span>',
  });
}

/* ═══════════════════════════════════════════════════════════════
   2. INVOICE TRACKER GRID
   ═══════════════════════════════════════════════════════════════ */

/**
 * Filters movements linked to taxable repetitive movements.
 *
 * @param {Array} monthMovements
 * @param {Array} taxableRepMovements
 * @returns {Array} filtered movements
 */
export function filterTaxableMovements(monthMovements, taxableRepMovements) {
  const taxableIds = new Set(taxableRepMovements.map(r => r.id));
  return monthMovements.filter(m => m.repetitive_movement_id && taxableIds.has(m.repetitive_movement_id));
}

/**
 * Mounts the invoice tracker AG Grid.
 *
 * @param {HTMLElement} hostEl
 * @param {Array}  rows — taxable movements
 * @param {object} rates
 * @param {string} mainCurrency
 * @param {object} callbacks — { onInvoiceToggle }
 * @returns {Promise<object>} gridApi
 */
export async function mountInvoiceGrid(hostEl, rows, rates, mainCurrency, callbacks = {}) {
  const columnDefs = [
    {
      headerName: 'Invoice',
      field: 'invoice',
      width: 90,
      cellRenderer: params => {
        const checked = Number(params.value) === 1 ? 'checked' : '';
        return `<span class="ft-grid-invoice-check">
          <input type="checkbox" class="ft-grid-invoice-check__input"
                 ${checked} data-action="toggle-invoice" />
        </span>`;
      },
      sortable: false,
    },
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
      headerName: 'Repetitive Item',
      field: 'repetitive_movement',
      flex: 1,
      minWidth: 130,
      cellRenderer: params => {
        const name = params.value;
        if (!name) return '';
        return `<span class="ft-grid-rep-name">${name}</span>`;
      },
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
      cellRenderer: convertedAmountRenderer('value', 'currency', rates, mainCurrency),
      width: 145,
      headerClass: 'ft-ag-header-right',
      cellStyle: { textAlign: 'right' },
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

  const gridApi = await createStandardGrid(hostEl, {
    columnDefs,
    rowData: rows,
    getRowId: p => String(p.data.id),
    pagination: true,
    paginationPageSize: 50,
    paginationPageSizeSelector: [25, 50, 100],
    overlayNoRowsTemplate:
      '<span class="ft-small ft-text-muted">No taxable movements this month</span>',
  });

  // Wire invoice checkbox toggle via event delegation on the host element
  hostEl.addEventListener('change', async (e) => {
    const checkbox = e.target.closest('[data-action="toggle-invoice"]');
    if (!checkbox) return;

    const rowEl = checkbox.closest('.ag-row');
    if (!rowEl) return;

    const rowIndex = Number(rowEl.getAttribute('row-index'));
    const rowNode = gridApi.getDisplayedRowAtIndex(rowIndex);
    if (!rowNode?.data) return;

    const newValue = checkbox.checked ? 1 : 0;
    const movId = rowNode.data.id;

    try {
      await updateInvoiceFlag(rowNode.data, newValue);
      rowNode.setDataValue('invoice', newValue);
      callbacks.onInvoiceToggle?.(movId, newValue);
    } catch (err) {
      // Revert checkbox on failure
      checkbox.checked = !checkbox.checked;
      console.error('Failed to update invoice flag:', err);
    }
  });

  return gridApi;
}
