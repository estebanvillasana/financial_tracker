/**
 * transferModal.js
 *
 * Modal dialog for editing a single transfer.
 * Uses the shared TransferForm component.
 *
 * Public API:
 *   TransferModal.open(transfer, accounts, options) → HTMLElement|null
 *   TransferModal.close()                           → void
 *
 * options:
 *   onSave(movementCode, payload, transfer)
 *   onClose(transfer)
 */
import { TransferForm } from '../../dumb/transferForm/transferForm.js';

const TransferModal = (() => {
  let activeModal = null;

  function buildHTML(accounts) {
    return `
      <div class="ft-modal-backdrop ft-transfer-modal-backdrop" data-modal-close>
        <section class="ft-transfer-modal" role="dialog" aria-modal="true" aria-label="Transfer details">
          <header class="ft-transfer-modal__header">
            <div>
              <h2 class="ft-h3 ft-transfer-modal__title">Edit Transfer</h2>
              <p class="ft-small ft-text-muted">Update the transfer details</p>
            </div>
            <button type="button" class="ft-transfer-modal__close-btn" data-modal-close aria-label="Close modal">
              <span class="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
          </header>
          <div class="ft-transfer-modal__body">
            ${TransferForm.buildHTML(accounts)}
          </div>
          <div class="ft-transfer-modal__message" data-transfer-message aria-live="polite"></div>
        </section>
      </div>`;
  }

  function _setMessage(modalRoot, message, kind = 'info') {
    const el = modalRoot.querySelector('[data-transfer-message]');
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('ft-transfer-modal__message--error', kind === 'error');
  }

  function _closeModal() {
    if (!activeModal) return;
    activeModal.remove();
    activeModal = null;
    document.body.style.removeProperty('overflow');
  }

  function _wireEvents(modalRoot, transfer, accounts, options = {}) {
    const onSave = typeof options.onSave === 'function' ? options.onSave : null;
    const onClose = typeof options.onClose === 'function' ? options.onClose : null;

    const formRoot = modalRoot.querySelector('#tf-root');
    if (!formRoot) return;

    TransferForm.hydrate(formRoot, accounts, {
      onSubmit: async () => {
        const values = TransferForm.getValues(formRoot);
        const { valid, errors, payload } = TransferForm.validate(values);
        if (!valid) {
          _setMessage(modalRoot, errors.join(' '), 'error');
          return;
        }
        if (!onSave) return;
        try {
          _setMessage(modalRoot, 'Saving…');
          await onSave(transfer.movement_code, payload, transfer);
          _setMessage(modalRoot, '');
        } catch (err) {
          _setMessage(modalRoot, err?.message || 'Save failed.', 'error');
        }
      },
      onCancel: () => {
        onClose?.(transfer);
        _closeModal();
      },
    });

    TransferForm.populate(formRoot, transfer);
    TransferForm.updateCurrencyLabels(formRoot, accounts);

    modalRoot.addEventListener('click', event => {
      const closeTarget = event.target.closest('[data-modal-close]');
      if (!closeTarget) return;
      if (event.target === modalRoot || closeTarget !== modalRoot) {
        onClose?.(transfer);
        _closeModal();
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !activeModal) return;
      onClose?.(transfer);
      _closeModal();
    }, { once: true });
  }

  function open(transfer, accounts = [], options = {}) {
    _closeModal();

    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildHTML(accounts).trim();
    const modalRoot = wrapper.firstElementChild;
    if (!modalRoot) return null;

    document.body.appendChild(modalRoot);
    document.body.style.overflow = 'hidden';
    activeModal = modalRoot;

    _wireEvents(modalRoot, transfer, accounts, options);
    return modalRoot;
  }

  function close() { _closeModal(); }

  return { open, close };
})();

export { TransferModal };
