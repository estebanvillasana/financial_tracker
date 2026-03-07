/**
 * Internal Transfers page bootstrap.
 *
 * Orchestrates: data loading, form + grid mount, event wiring.
 */
import { bankAccounts } from '../../services/api.js';
import { ensureAgGridLoaded } from '../../lib/agGridLoader.js';
import { FeedbackBanner } from '../../components/dumb/feedbackBanner/feedbackBanner.js';
import { TransferForm } from '../../components/dumb/transferForm/transferForm.js';
import { TransferModal } from '../../components/modals/transferModal/transferModal.js';
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
    TransferModal.open(transfer, accounts, {
      onSave: async (movementCode, payload) => {
        await updateTransfer(movementCode, payload);
        TransferModal.close();
        FeedbackBanner.render(feedbackEl, 'Transfer updated.', 'success');
        await reloadGrid();
        setTimeout(() => FeedbackBanner.clear(feedbackEl), 3000);
      },
      onClose: () => FeedbackBanner.clear(feedbackEl),
    });
  }

  function handleDelete(rowOrRows) {
    const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
    const codes = rows.map(r => r?.movement_code).filter(Boolean);
    if (!codes.length) {
      FeedbackBanner.render(feedbackEl, 'No transfers selected.');
      return;
    }
    FeedbackBanner.renderWithActions(
      feedbackEl,
      `Delete <b>${codes.length}</b> transfer${codes.length !== 1 ? 's' : ''}?`,
      [
        {
          label: 'Delete',
          className: 'ft-feedback-banner__btn--danger',
          onClick: async () => {
            try {
              await Promise.all(codes.map(code => softDeleteTransfer(code)));
              FeedbackBanner.render(feedbackEl, `${codes.length} transfer(s) deleted.`, 'success');
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
      await createTransfer(payload);
      FeedbackBanner.render(feedbackEl, 'Transfer created.', 'success');
      TransferForm.reset(formEl);
      TransferForm.updateCurrencyLabels(formEl, accounts);
      await reloadGrid();
      setTimeout(() => FeedbackBanner.clear(feedbackEl), 3000);
    } catch (e) {
      FeedbackBanner.render(feedbackEl, e?.message || 'Operation failed.');
    }
  }

  function handleCancel() {
    TransferForm.reset(formEl);
    TransferForm.updateCurrencyLabels(formEl, accounts);
    FeedbackBanner.clear(feedbackEl);
  }
}

export { initTransfersPage };
