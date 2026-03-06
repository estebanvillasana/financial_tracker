/**
 * Internal Transfers page bootstrap.
 *
 * Orchestrates: data loading, form + grid mount, event wiring.
 */
import { bankAccounts } from '../../services/api.js';
import { ensureAgGridLoaded, getGridTheme } from '../../lib/agGridLoader.js';
import { FeedbackBanner } from '../../components/dumb/feedbackBanner/feedbackBanner.js';
import { TransferForm } from '../../components/dumb/transferForm/transferForm.js';
import { mountGrid, refreshGridData } from './grid.js';
import { createTransfer, updateTransfer, softDeleteTransfer, fetchTransfers } from './actions.js';

async function initTransfersPage(root = document) {
  const formSection = root.querySelector('#widget-transfers-form');
  const feedbackEl  = root.querySelector('#widget-transfers-feedback');
  const gridWrapper = root.querySelector('#widget-transfers-grid');

  if (!formSection || !gridWrapper) return;

  const state = {
    accounts: [],
    transfers: [],
    gridApi: null,
    editingCode: null,
  };

  /* ── Load AG Grid + data ─────────────────────────────────── */

  try {
    await ensureAgGridLoaded();
  } catch (e) {
    return FeedbackBanner.render(feedbackEl, e?.message || 'Failed to load grid library.');
  }

  let accounts, transfers;
  try {
    [accounts, transfers] = await Promise.all([
      bankAccounts.getAll({ active: 1 }),
      fetchTransfers(),
    ]);
    accounts = Array.isArray(accounts) ? accounts : [];
    transfers = Array.isArray(transfers) ? transfers : [];
  } catch (e) {
    return FeedbackBanner.render(feedbackEl, e?.message || 'Failed to load data.');
  }

  if (accounts.length < 2) {
    formSection.innerHTML = '';
    gridWrapper.innerHTML = `
      <div class="ft-empty">
        <span class="ft-empty__icon material-symbols-outlined" aria-hidden="true">account_balance</span>
        <p class="ft-small">You need at least 2 active accounts to make transfers.</p>
      </div>`;
    return;
  }

  state.accounts = accounts;
  state.transfers = transfers;

  /* ── Render + Hydrate Form ───────────────────────────────── */

  formSection.innerHTML = TransferForm.buildHTML(accounts);
  const formEl = formSection.querySelector('#tf-root');

  TransferForm.hydrate(formEl, accounts, {
    onSubmit: handleSubmit,
    onCancel: handleCancel,
  });

  /* ── Mount Grid ──────────────────────────────────────────── */

  gridWrapper.innerHTML = '<div class="ft-transfers-grid ft-ag-grid" id="transfers-grid-host"></div>';
  const gridHost = gridWrapper.querySelector('#transfers-grid-host');

  mountGrid(gridHost, state, {
    getGridTheme,
    onEdit: handleEdit,
    onDelete: handleDelete,
  });

  /* ── Helpers ─────────────────────────────────────────────── */

  async function reloadGrid() {
    try {
      const fresh = await fetchTransfers();
      refreshGridData(state, Array.isArray(fresh) ? fresh : []);
    } catch (e) {
      FeedbackBanner.render(feedbackEl, e?.message || 'Failed to reload transfers.');
    }
  }

  function handleEdit(transfer) {
    state.editingCode = transfer.movement_code;
    TransferForm.populate(formEl, transfer);
    TransferForm.updateCurrencyLabels(formEl, accounts);
    formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleDelete(transfer) {
    FeedbackBanner.renderWithActions(
      feedbackEl,
      `Delete transfer <b>${transfer.send_account_name}</b> \u2192 <b>${transfer.receive_account_name}</b> on ${transfer.date}?`,
      [
        {
          label: 'Delete',
          className: 'ft-feedback-banner__btn--danger',
          onClick: async () => {
            try {
              await softDeleteTransfer(transfer.movement_code);
              FeedbackBanner.render(feedbackEl, 'Transfer deleted.', 'success');
              await reloadGrid();
              setTimeout(() => FeedbackBanner.clear(feedbackEl), 3000);
            } catch (e) {
              FeedbackBanner.render(feedbackEl, e?.message || 'Delete failed.');
            }
          },
        },
        { label: 'Cancel', onClick: () => FeedbackBanner.clear(feedbackEl) },
      ],
    );
  }

  async function handleSubmit() {
    FeedbackBanner.clear(feedbackEl);
    const values = TransferForm.getValues(formEl);
    const { valid, errors, payload } = TransferForm.validate(values);

    if (!valid) {
      return FeedbackBanner.render(feedbackEl, errors.join(' '));
    }

    try {
      if (state.editingCode) {
        await updateTransfer(state.editingCode, payload);
        FeedbackBanner.render(feedbackEl, 'Transfer updated.', 'success');
      } else {
        await createTransfer(payload);
        FeedbackBanner.render(feedbackEl, 'Transfer created.', 'success');
      }
      state.editingCode = null;
      TransferForm.reset(formEl);
      TransferForm.updateCurrencyLabels(formEl, accounts);
      await reloadGrid();
      setTimeout(() => FeedbackBanner.clear(feedbackEl), 3000);
    } catch (e) {
      FeedbackBanner.render(feedbackEl, e?.message || 'Operation failed.');
    }
  }

  function handleCancel() {
    state.editingCode = null;
    TransferForm.reset(formEl);
    TransferForm.updateCurrencyLabels(formEl, accounts);
    FeedbackBanner.clear(feedbackEl);
  }
}

export { initTransfersPage };
