import { FeedbackBanner } from '../../components/dumb/feedbackBanner/feedbackBanner.js';
import { applyAppSettings } from '../../appSettings.js';
import { finalAppConfig } from '../../defaults.js';
import { fetchSettings, saveSettings, downloadDatabaseSnapshot, exportDatabaseWorkbook } from './actions.js';

const TAB_IDS = ['preferences', 'database', 'connection'];
let activeModal = null;
let activeKeyHandler = null;
let lastFocusedElement = null;

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;

  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDateTime(value) {
  if (!value) return 'Not available yet';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

async function loadCurrencies() {
  try {
    const response = await fetch(new URL('../../utils/currencies.json', import.meta.url));
    const data = await response.json();
    return data.filter(currency => currency.active);
  } catch {
    return [
      { code: 'usd', codePlusSymbol: '$ USD' },
      { code: 'eur', codePlusSymbol: 'EUR' },
      { code: 'mxn', codePlusSymbol: 'MXN' },
      { code: 'rub', codePlusSymbol: 'RUB' },
    ];
  }
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildModalHTML() {
  return `
    <div class="ft-modal-backdrop ft-settings-modal-backdrop" data-settings-close>
      <section class="ft-settings-modal" role="dialog" aria-modal="true" aria-labelledby="ft-settings-modal-title">
        <header class="ft-settings-modal__header">
          <div class="ft-settings-modal__header-copy">
            <p class="ft-settings-modal__eyebrow">Workspace settings</p>
            <h2 class="ft-h3 ft-settings-modal__title" id="ft-settings-modal-title">Settings</h2>
            <p class="ft-small ft-text-muted">Preferences, database details, and connection info in one place.</p>
          </div>
          <div class="ft-settings-modal__header-actions">
            <button class="ft-btn ft-btn--ghost" id="settings-refresh-btn" type="button">
              <span class="material-symbols-outlined" aria-hidden="true">refresh</span>
              Refresh
            </button>
            <button class="ft-settings-modal__close-btn" type="button" data-settings-close aria-label="Close settings">
              <span class="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
          </div>
        </header>

        <div class="ft-settings-modal__feedback" id="settings-feedback"></div>

        <div class="ft-settings-modal__tabs" role="tablist" aria-label="Settings sections">
          <button class="ft-settings-modal__tab" id="settings-tab-preferences" type="button" role="tab" aria-selected="true" aria-controls="settings-panel-preferences" data-settings-tab="preferences">Preferences</button>
          <button class="ft-settings-modal__tab" id="settings-tab-database" type="button" role="tab" aria-selected="false" aria-controls="settings-panel-database" data-settings-tab="database" tabindex="-1">Database</button>
          <button class="ft-settings-modal__tab" id="settings-tab-connection" type="button" role="tab" aria-selected="false" aria-controls="settings-panel-connection" data-settings-tab="connection" tabindex="-1">Connection</button>
        </div>

        <div class="ft-settings-modal__body">
          <section class="ft-settings-modal__panel" id="settings-panel-preferences" role="tabpanel" aria-labelledby="settings-tab-preferences">
            <article class="ft-card ft-settings__panel">
              <div class="ft-settings__panel-header">
                <div>
                  <h3 class="ft-h3">Preferences</h3>
                  <p class="ft-small ft-text-muted">Stored in the active database and applied across the app.</p>
                </div>
              </div>

              <form class="ft-settings__form" id="settings-preferences-form">
                <label class="ft-settings__field" for="settings-currency">
                  <span class="ft-label">Main Currency</span>
                  <select class="ft-settings__control" id="settings-currency" name="currency"></select>
                  <span class="ft-small ft-text-muted">Used by dashboards, reports, and converted totals.</span>
                </label>

                <div class="ft-settings__actions">
                  <button class="ft-btn ft-btn--primary" id="settings-save-btn" type="submit">
                    <span class="material-symbols-outlined" aria-hidden="true">save</span>
                    Save Preferences
                  </button>
                </div>
              </form>
            </article>
          </section>

          <section class="ft-settings-modal__panel" id="settings-panel-database" role="tabpanel" aria-labelledby="settings-tab-database" hidden>
            <article class="ft-card ft-settings__panel">
              <div class="ft-settings__panel-header">
                <div>
                  <h3 class="ft-h3">Database</h3>
                  <p class="ft-small ft-text-muted">Inspect the active SQLite file and download a consistent snapshot.</p>
                </div>
              </div>

              <dl class="ft-settings__meta" id="settings-database-meta">
                <div class="ft-settings__meta-row">
                  <dt class="ft-small ft-text-muted">File</dt>
                  <dd class="ft-label" id="settings-db-filename">-</dd>
                </div>
                <div class="ft-settings__meta-row">
                  <dt class="ft-small ft-text-muted">Location</dt>
                  <dd id="settings-db-path">-</dd>
                </div>
                <div class="ft-settings__meta-row">
                  <dt class="ft-small ft-text-muted">Size</dt>
                  <dd id="settings-db-size">-</dd>
                </div>
                <div class="ft-settings__meta-row">
                  <dt class="ft-small ft-text-muted">Updated</dt>
                  <dd id="settings-db-modified">-</dd>
                </div>
                <div class="ft-settings__meta-row">
                  <dt class="ft-small ft-text-muted">Last Auto Backup</dt>
                  <dd id="settings-db-backup">-</dd>
                </div>
                <div class="ft-settings__meta-row">
                  <dt class="ft-small ft-text-muted">Backup Folder</dt>
                  <dd id="settings-db-backup-dir">-</dd>
                </div>
              </dl>

              <div class="ft-settings__actions">
                <button class="ft-btn ft-btn--primary" id="settings-download-db-btn" type="button">
                  <span class="material-symbols-outlined" aria-hidden="true">download</span>
                  Download Current .db
                </button>
                <button class="ft-btn ft-btn--ghost" id="settings-export-excel-btn" type="button">
                  <span class="material-symbols-outlined" aria-hidden="true">table_view</span>
                  Export All Tables (.xlsx)
                </button>
              </div>
            </article>
          </section>

          <section class="ft-settings-modal__panel" id="settings-panel-connection" role="tabpanel" aria-labelledby="settings-tab-connection" hidden>
            <article class="ft-card ft-settings__panel">
              <div class="ft-settings__panel-header">
                <div>
                  <h3 class="ft-h3">Connection</h3>
                  <p class="ft-small ft-text-muted">These values come from the frontend boot configuration.</p>
                </div>
              </div>

              <dl class="ft-settings__meta">
                <div class="ft-settings__meta-row">
                  <dt class="ft-small ft-text-muted">Backend URL</dt>
                  <dd id="settings-api-base">-</dd>
                </div>
                <div class="ft-settings__meta-row">
                  <dt class="ft-small ft-text-muted">Mode</dt>
                  <dd id="settings-api-mode">-</dd>
                </div>
              </dl>

              <p class="ft-small ft-text-muted ft-settings-modal__note">
                Runtime connection values are intentionally read-only here. Browser settings should not rewrite the frontend boot config.
              </p>
            </article>
          </section>
        </div>

        <footer class="ft-settings-modal__footer">
          <p class="ft-small ft-text-muted">Open from the profile icon in the sidebar.</p>
          <div class="ft-settings-modal__footer-actions">
            <button class="ft-btn ft-btn--ghost" type="button" data-settings-close>Close</button>
          </div>
        </footer>
      </section>
    </div>`;
}

function closeSettingsModal() {
  if (activeKeyHandler) {
    document.removeEventListener('keydown', activeKeyHandler);
    activeKeyHandler = null;
  }

  if (activeModal) {
    activeModal.remove();
    activeModal = null;
  }

  document.body.style.removeProperty('overflow');
  lastFocusedElement?.focus?.();
  lastFocusedElement = null;
}

function switchTab(modalRoot, tabId, { focus = false } = {}) {
  const tabs = modalRoot.querySelectorAll('[data-settings-tab]');
  const panels = modalRoot.querySelectorAll('.ft-settings-modal__panel');

  tabs.forEach(tab => {
    const selected = tab.dataset.settingsTab === tabId;
    tab.classList.toggle('ft-settings-modal__tab--active', selected);
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) {
      tab.focus();
    }
  });

  panels.forEach(panel => {
    panel.hidden = panel.id !== `settings-panel-${tabId}`;
  });
}

function bindTabEvents(modalRoot) {
  const tabs = Array.from(modalRoot.querySelectorAll('[data-settings-tab]'));

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => switchTab(modalRoot, tab.dataset.settingsTab, { focus: false }));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();

      let nextIndex = index;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = tabs.length - 1;

      switchTab(modalRoot, tabs[nextIndex].dataset.settingsTab, { focus: true });
    });
  });
}

async function hydrateSettingsModal(modalRoot) {
  const feedbackEl = modalRoot.querySelector('#settings-feedback');
  const currencySelect = modalRoot.querySelector('#settings-currency');
  const preferencesForm = modalRoot.querySelector('#settings-preferences-form');
  const refreshBtn = modalRoot.querySelector('#settings-refresh-btn');
  const downloadBtn = modalRoot.querySelector('#settings-download-db-btn');
  const exportExcelBtn = modalRoot.querySelector('#settings-export-excel-btn');
  const saveBtn = modalRoot.querySelector('#settings-save-btn');

  const state = {
    settings: null,
    currencies: await loadCurrencies(),
  };

  modalRoot.querySelector('#settings-api-base').textContent = finalAppConfig.apiBaseUrl;
  modalRoot.querySelector('#settings-api-mode').textContent = finalAppConfig.apiKey ? 'Multi-user / API key' : 'Local dev / no API key';

  currencySelect.innerHTML = state.currencies.map(currency => (
    `<option value="${currency.code}">${currency.codePlusSymbol}</option>`
  )).join('');

  function renderSettings() {
    const config = state.settings;
    if (!config) return;

    currencySelect.value = config.currency || 'usd';

    modalRoot.querySelector('#settings-db-filename').textContent = config.database?.filename || '-';
    modalRoot.querySelector('#settings-db-path').textContent = config.database?.path || '-';
    modalRoot.querySelector('#settings-db-size').textContent = formatBytes(config.database?.size_bytes);
    modalRoot.querySelector('#settings-db-modified').textContent = formatDateTime(config.database?.last_modified);
    modalRoot.querySelector('#settings-db-backup').textContent = formatDateTime(config.database?.last_backup);
    modalRoot.querySelector('#settings-db-backup-dir').textContent = config.database?.backup_directory || '-';
  }

  async function reloadSettings() {
    try {
      const data = await fetchSettings();
      state.settings = data;
      renderSettings();
    } catch (error) {
      FeedbackBanner.render(feedbackEl, error?.message || 'Failed to load settings.');
    }
  }

  preferencesForm?.addEventListener('submit', async event => {
    event.preventDefault();
    saveBtn.disabled = true;

    try {
      const updated = await saveSettings({ currency: currencySelect.value });
      state.settings = updated;
      applyAppSettings(updated);
      renderSettings();
      const sidebarCurrencySelect = document.getElementById('ft-nav-currency-select');
      if (sidebarCurrencySelect) {
        sidebarCurrencySelect.value = updated.currency;
      }
      FeedbackBanner.render(
        feedbackEl,
        'Settings saved. Reload the app if you want every open view to refresh immediately.',
        'success',
      );
    } catch (error) {
      FeedbackBanner.render(feedbackEl, error?.message || 'Failed to save settings.');
    } finally {
      saveBtn.disabled = false;
    }
  });

  refreshBtn?.addEventListener('click', async () => {
    FeedbackBanner.clear(feedbackEl);
    await reloadSettings();
  });

  downloadBtn?.addEventListener('click', async () => {
    downloadBtn.disabled = true;

    try {
      const { blob, filename } = await downloadDatabaseSnapshot();
      triggerBlobDownload(blob, filename);
      FeedbackBanner.render(feedbackEl, 'Database snapshot downloaded.', 'success');
    } catch (error) {
      FeedbackBanner.render(feedbackEl, error?.message || 'Failed to download database.');
    } finally {
      downloadBtn.disabled = false;
    }
  });

  exportExcelBtn?.addEventListener('click', async () => {
    exportExcelBtn.disabled = true;

    try {
      const { blob, filename } = await exportDatabaseWorkbook();
      triggerBlobDownload(blob, filename);
      FeedbackBanner.render(feedbackEl, 'Excel workbook exported.', 'success');
    } catch (error) {
      FeedbackBanner.render(feedbackEl, error?.message || 'Failed to export Excel workbook.');
    } finally {
      exportExcelBtn.disabled = false;
    }
  });

  await reloadSettings();
}

async function openSettingsModal({ initialTab = 'preferences' } = {}) {
  closeSettingsModal();

  const wrapper = document.createElement('div');
  wrapper.innerHTML = buildModalHTML().trim();
  const modalRoot = wrapper.firstElementChild;
  if (!modalRoot) return null;

  lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.body.appendChild(modalRoot);
  document.body.style.overflow = 'hidden';
  activeModal = modalRoot;

  modalRoot.addEventListener('click', event => {
    const closeTarget = event.target.closest('[data-settings-close]');
    if (!closeTarget) return;
    if (event.target === modalRoot || closeTarget !== modalRoot) {
      closeSettingsModal();
    }
  });

  activeKeyHandler = event => {
    if (event.key === 'Escape' && activeModal) {
      closeSettingsModal();
    }
  };
  document.addEventListener('keydown', activeKeyHandler);

  bindTabEvents(modalRoot);
  switchTab(modalRoot, TAB_IDS.includes(initialTab) ? initialTab : 'preferences');
  await hydrateSettingsModal(modalRoot);
  modalRoot.querySelector('[data-settings-tab][aria-selected="true"]')?.focus();

  return modalRoot;
}

async function initSettingsPage() {
  return openSettingsModal();
}

export { initSettingsPage, openSettingsModal, closeSettingsModal };
