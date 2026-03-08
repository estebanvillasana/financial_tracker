/**
 * Bank Accounts page bootstrap.
 *
 * Orchestrates: data loading, card rendering, toolbar filters,
 * bank account modals, and CRUD operations.
 */

import { FeedbackBanner } from '../../components/dumb/feedbackBanner/feedbackBanner.js';
import { BankAccountModal } from '../../components/modals/bankAccountModal/bankAccountModal.js';
import { renderAccountCards, renderStats } from './render.js';
import {
  fetchAccounts,
  createAccount,
  updateAccount,
  softDeleteAccount,
} from './actions.js';

/* ── Page Init ────────────────────────────────────────── */

async function initBankAccountsPage(root = document) {
  const feedbackEl   = root.querySelector('#widget-accounts-feedback');
  const gridSection  = root.querySelector('#widget-accounts-grid');
  const toolbarEl    = root.querySelector('#widget-accounts-toolbar');
  const statsEl      = root.querySelector('#widget-accounts-stats');
  const newBtn       = root.querySelector('#btn-new-account');
  const typeToggle   = toolbarEl?.querySelector('#accounts-type-toggle');
  const showDeletedToggle = toolbarEl?.querySelector('#accounts-show-deleted');

  if (!gridSection) return;

  const state = {
    accounts: [],
    typeFilter: '',
    showDeleted: false,
  };

  /* ── Load data ──────────────────────────────────────── */

  try {
    const accs = await fetchAccounts();
    state.accounts = Array.isArray(accs) ? accs : [];
  } catch (e) {
    return FeedbackBanner.render(feedbackEl, e?.message || 'Failed to load accounts.');
  }

  renderStats(statsEl, state.accounts);
  renderFiltered();

  /* ── Toolbar: Type toggle ───────────────────────────── */

  typeToggle?.addEventListener('click', e => {
    const btn = e.target.closest('[data-type]');
    if (!btn) return;
    state.typeFilter = btn.dataset.type;
    typeToggle.querySelectorAll('[data-type]').forEach(b =>
      b.classList.toggle('ft-type-toggle__btn--active', b === btn),
    );
    renderFiltered();
  });

  /* ── Toolbar: Show Deleted ──────────────────────────── */

  showDeletedToggle?.addEventListener('change', () => {
    state.showDeleted = showDeletedToggle.checked;
    renderFiltered();
  });

  /* ── New Account Button ─────────────────────────────── */

  newBtn?.addEventListener('click', () => {
    BankAccountModal.openNew({
      onSave: async payload => {
        await createAccount(payload);
        FeedbackBanner.render(feedbackEl, 'Account created.', 'success');
        await reloadAll();
        setTimeout(() => FeedbackBanner.clear(feedbackEl), 3000);
      },
    });
  });

  /* ── Helpers ────────────────────────────────────────── */

  function getFiltered() {
    let accs = state.accounts;

    if (state.typeFilter) {
      accs = accs.filter(a => a.type === state.typeFilter);
    }
    if (!state.showDeleted) {
      accs = accs.filter(a => Number(a.active) === 1);
    }

    return accs;
  }

  function renderFiltered() {
    const accs = getFiltered();
    renderAccountCards(gridSection, accs, {
      onClick: handleEditAccount,
    });
  }

  async function reloadAll() {
    try {
      const accs = await fetchAccounts();
      state.accounts = Array.isArray(accs) ? accs : [];
    } catch (e) {
      FeedbackBanner.render(feedbackEl, e?.message || 'Failed to reload data.');
    }
    renderStats(statsEl, state.accounts);
    renderFiltered();
  }

  /* ── Account CRUD handlers ──────────────────────────── */

  function handleEditAccount(acc) {
    BankAccountModal.open(acc, {
      onSave: async (id, payload) => {
        await updateAccount(id, payload);
        FeedbackBanner.render(feedbackEl, 'Account updated.', 'success');
        await reloadAll();
        setTimeout(() => FeedbackBanner.clear(feedbackEl), 3000);
      },
      onSoftDelete: async id => {
        await softDeleteAccount(id);
        FeedbackBanner.render(feedbackEl, 'Account marked as inactive.', 'success');
        await reloadAll();
        setTimeout(() => FeedbackBanner.clear(feedbackEl), 3000);
      },
    });
  }
}

export { initBankAccountsPage };
