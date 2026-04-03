// customLinksTab.js — Quick Links settings panel

import { fetchCustomLinks, saveCustomLinks } from '../../services/customLinks.js';
import { FeedbackBanner } from '../../components/dumb/feedbackBanner/feedbackBanner.js';

const SUGGESTED_ICONS = [
  'link', 'open_in_new', 'language', 'account_balance', 'savings',
  'credit_card', 'payments', 'receipt_long', 'table_view', 'description',
  'note', 'sticky_note_2', 'push_pin', 'star', 'bookmark',
  'folder', 'home', 'work', 'cloud', 'school',
];

let _data = { groups: [], ungrouped: [] };
let _editState = null;

function _genId() {
  return Math.random().toString(36).slice(2, 10);
}

function _escapeHtml(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Data helpers ───────────────────────────────────────────────

function _findItem(itemId) {
  const u = _data.ungrouped.find(i => i.id === itemId);
  if (u) return { item: u, groupId: null };
  for (const g of _data.groups) {
    const item = g.items.find(i => i.id === itemId);
    if (item) return { item, groupId: g.id };
  }
  return null;
}

function _removeItem(itemId, groupId) {
  if (groupId) {
    const g = _data.groups.find(g => g.id === groupId);
    if (g) g.items = g.items.filter(i => i.id !== itemId);
  } else {
    _data.ungrouped = _data.ungrouped.filter(i => i.id !== itemId);
  }
}

function _removeGroup(groupId) {
  _data.groups = _data.groups.filter(g => g.id !== groupId);
}

// ── List HTML builders ─────────────────────────────────────────

function _buildItemRowHtml(item, groupId) {
  const gId = groupId || '';
  const typeLabel = item.type === 'note' ? 'note' : 'link';
  return `
    <div class="ft-ql-row" data-item-id="${item.id}" data-group-id="${gId}">
      <span class="material-symbols-outlined ft-ql-row__icon">${_escapeHtml(item.icon || 'link')}</span>
      <span class="ft-ql-row__label">${_escapeHtml(item.label || '(unnamed)')}</span>
      <span class="ft-ql-row__badge ft-ql-row__badge--${typeLabel}">${typeLabel}</span>
      <div class="ft-ql-row__actions">
        <button class="ft-ql-action-btn" type="button" title="Edit"
                data-ql-action="edit-item" data-item-id="${item.id}" data-group-id="${gId}">
          <span class="material-symbols-outlined">edit</span>
        </button>
        <button class="ft-ql-action-btn ft-ql-action-btn--danger" type="button" title="Delete"
                data-ql-action="delete-item" data-item-id="${item.id}" data-group-id="${gId}">
          <span class="material-symbols-outlined">delete</span>
        </button>
      </div>
    </div>`;
}

function _buildGroupHtml(group) {
  const itemsHtml = (group.items || []).map(item => _buildItemRowHtml(item, group.id)).join('');
  const emptyHint = !group.items?.length
    ? `<p class="ft-ql-group-empty ft-small ft-text-muted">No items yet.</p>`
    : '';
  return `
    <div class="ft-ql-group" data-group-id="${group.id}">
      <div class="ft-ql-group-header">
        <span class="material-symbols-outlined ft-ql-group-header__icon">folder</span>
        <span class="ft-ql-group-header__label">${_escapeHtml(group.label || '(unnamed group)')}</span>
        <div class="ft-ql-row__actions">
          <button class="ft-ql-action-btn" type="button" title="Add item to group"
                  data-ql-action="add-item-to-group" data-group-id="${group.id}">
            <span class="material-symbols-outlined">add</span>
          </button>
          <button class="ft-ql-action-btn" type="button" title="Edit group"
                  data-ql-action="edit-group" data-group-id="${group.id}">
            <span class="material-symbols-outlined">edit</span>
          </button>
          <button class="ft-ql-action-btn ft-ql-action-btn--danger" type="button" title="Delete group"
                  data-ql-action="delete-group" data-group-id="${group.id}">
            <span class="material-symbols-outlined">delete</span>
          </button>
        </div>
      </div>
      <div class="ft-ql-group-items">
        ${itemsHtml}
        ${emptyHint}
      </div>
    </div>`;
}

function _buildListHtml() {
  const { groups = [], ungrouped = [] } = _data;
  if (!groups.length && !ungrouped.length) {
    return `<p class="ft-ql-empty ft-small ft-text-muted">
      No quick links yet. Use the buttons above to add a group or standalone item.
    </p>`;
  }
  let html = groups.map(_buildGroupHtml).join('');
  if (ungrouped.length) {
    html += `
      <div class="ft-ql-ungrouped">
        <div class="ft-ql-ungrouped-label ft-small ft-text-muted">Ungrouped</div>
        ${ungrouped.map(item => _buildItemRowHtml(item, null)).join('')}
      </div>`;
  }
  return html;
}

// ── View switching ─────────────────────────────────────────────

function _showListView(contentEl) {
  _editState = null;
  contentEl.querySelector('#ql-list-view').style.display = '';
  contentEl.querySelector('#ql-form-view').style.display = 'none';
}

function _showFormView(contentEl, state) {
  _editState = state;
  const listView = contentEl.querySelector('#ql-list-view');
  const formView = contentEl.querySelector('#ql-form-view');
  const titleEl = formView.querySelector('#ql-form-title');
  const itemFields = formView.querySelector('#ql-item-only-fields');
  const labelInput = formView.querySelector('#ql-field-label');
  const iconInput = formView.querySelector('#ql-field-icon');
  const iconPreview = formView.querySelector('#ql-icon-preview');
  const urlField = formView.querySelector('#ql-url-field');
  const contentField = formView.querySelector('#ql-content-field');
  const urlInput = formView.querySelector('#ql-field-url');
  const contentInput = formView.querySelector('#ql-field-content');
  const typeLink = formView.querySelector('input[name="ql-item-type"][value="link"]');
  const typeNote = formView.querySelector('input[name="ql-item-type"][value="note"]');

  // Reset fields
  labelInput.value = '';
  if (iconInput) iconInput.value = 'link';
  if (iconPreview) iconPreview.textContent = 'link';
  if (urlInput) urlInput.value = '';
  if (contentInput) contentInput.value = '';
  if (typeLink) typeLink.checked = true;

  const isGroupMode = state.mode === 'add-group' || state.mode === 'edit-group';

  if (titleEl) {
    const titles = { 'add-item': 'Add Item', 'edit-item': 'Edit Item', 'add-group': 'Add Group', 'edit-group': 'Edit Group' };
    titleEl.textContent = titles[state.mode] || 'Edit';
  }

  // Show/hide item-only fields
  if (itemFields) itemFields.style.display = isGroupMode ? 'none' : '';

  if (!isGroupMode) {
    // Default: show URL field, hide content field
    if (urlField) urlField.style.display = '';
    if (contentField) contentField.style.display = 'none';
  }

  // Populate for edit modes
  if (state.mode === 'edit-group') {
    const g = _data.groups.find(g => g.id === state.groupId);
    if (g) labelInput.value = g.label || '';
  } else if (state.mode === 'edit-item') {
    const found = _findItem(state.itemId);
    if (found) {
      const { item } = found;
      labelInput.value = item.label || '';
      if (iconInput) iconInput.value = item.icon || 'link';
      if (iconPreview) iconPreview.textContent = item.icon || 'link';
      if (item.type === 'note') {
        if (typeNote) typeNote.checked = true;
        if (urlField) urlField.style.display = 'none';
        if (contentField) contentField.style.display = '';
        if (contentInput) contentInput.value = item.content || '';
      } else {
        if (urlInput) urlInput.value = item.url || '';
      }
    }
  }

  listView.style.display = 'none';
  formView.style.display = '';
  labelInput.focus();
}

// ── Form HTML ──────────────────────────────────────────────────

function _buildFormViewHtml() {
  const suggestionsHtml = SUGGESTED_ICONS.map(icon => `
    <button class="ft-ql-icon-chip" type="button" data-ql-icon="${icon}" title="${icon}">
      <span class="material-symbols-outlined">${icon}</span>
    </button>`).join('');

  return `
    <div class="ft-ql-form-header">
      <button class="ft-ql-back-btn" id="ql-back-btn" type="button">
        <span class="material-symbols-outlined">arrow_back</span>
        <span>Back</span>
      </button>
      <span class="ft-ql-form-title" id="ql-form-title">Add Item</span>
    </div>

    <div class="ft-ql-form-fields">
      <label class="ft-ql-field">
        <span class="ft-label">Label</span>
        <input class="ft-settings__control" type="text" id="ql-field-label"
               placeholder="My Bank Account" autocomplete="off">
      </label>

      <div id="ql-item-only-fields">
        <label class="ft-ql-field">
          <span class="ft-label">Icon</span>
          <div class="ft-ql-icon-row">
            <input class="ft-settings__control ft-ql-icon-input" type="text" id="ql-field-icon"
                   placeholder="e.g. account_balance" autocomplete="off">
            <span class="material-symbols-outlined ft-ql-icon-preview" id="ql-icon-preview" aria-hidden="true">link</span>
          </div>
          <div class="ft-ql-icon-chips">${suggestionsHtml}</div>
        </label>

        <div class="ft-ql-field">
          <span class="ft-label">Type</span>
          <div class="ft-ql-type-pills">
            <label class="ft-ql-type-pill">
              <input type="radio" name="ql-item-type" value="link" checked> Link
            </label>
            <label class="ft-ql-type-pill">
              <input type="radio" name="ql-item-type" value="note"> Note
            </label>
          </div>
        </div>

        <label class="ft-ql-field" id="ql-url-field">
          <span class="ft-label">URL</span>
          <input class="ft-settings__control" type="text" id="ql-field-url"
                 placeholder="https://..." autocomplete="off">
        </label>

        <label class="ft-ql-field" id="ql-content-field" style="display:none">
          <span class="ft-label">Note</span>
          <textarea class="ft-settings__control ft-ql-textarea" id="ql-field-content"
                    rows="5" placeholder="Payment reminder, account info..."></textarea>
        </label>
      </div>
    </div>

    <div class="ft-ql-form-actions">
      <button class="ft-btn ft-btn--primary" id="ql-save-btn" type="button">Save</button>
      <button class="ft-btn ft-btn--ghost" id="ql-back-btn-2" type="button">Cancel</button>
    </div>`;
}

// ── Scaffold HTML ──────────────────────────────────────────────

function _buildScaffoldHtml() {
  return `
    <div id="ql-list-view">
      <div class="ft-ql-toolbar">
        <button class="ft-btn ft-btn--ghost" id="ql-add-group-btn" type="button">
          <span class="material-symbols-outlined">create_new_folder</span>
          New Group
        </button>
        <button class="ft-btn ft-btn--ghost" id="ql-add-item-btn" type="button">
          <span class="material-symbols-outlined">add_link</span>
          New Item
        </button>
      </div>
      <div class="ft-ql-list" id="ql-list"></div>
    </div>

    <div id="ql-form-view" style="display:none">
      ${_buildFormViewHtml()}
    </div>`;
}

// ── Persistence ────────────────────────────────────────────────

async function _persist(listEl, contentEl, feedbackEl, onSaved) {
  try {
    const saved = await saveCustomLinks(_data);
    _data = saved;
    listEl.innerHTML = _buildListHtml();
    if (typeof onSaved === 'function') onSaved(_data);
  } catch (error) {
    FeedbackBanner.render(feedbackEl, error?.message || 'Failed to save quick links.');
  }
}

// ── Event binding ──────────────────────────────────────────────

function _bindFormView(contentEl, listEl, feedbackEl, onSaved) {
  const formView = contentEl.querySelector('#ql-form-view');
  const iconInput = formView.querySelector('#ql-field-icon');
  const iconPreview = formView.querySelector('#ql-icon-preview');

  // Back / cancel
  const goBack = () => _showListView(contentEl);
  formView.querySelector('#ql-back-btn')?.addEventListener('click', goBack);
  formView.querySelector('#ql-back-btn-2')?.addEventListener('click', goBack);

  // Live icon preview
  iconInput?.addEventListener('input', () => {
    if (iconPreview) iconPreview.textContent = iconInput.value.trim() || 'link';
  });

  // Icon chip suggestions
  formView.querySelector('.ft-ql-icon-chips')?.addEventListener('click', e => {
    const chip = e.target.closest('[data-ql-icon]');
    if (!chip) return;
    const icon = chip.dataset.qlIcon;
    if (iconInput) iconInput.value = icon;
    if (iconPreview) iconPreview.textContent = icon;
    // Visual selection feedback
    formView.querySelectorAll('.ft-ql-icon-chip').forEach(c => c.classList.remove('ft-ql-icon-chip--selected'));
    chip.classList.add('ft-ql-icon-chip--selected');
  });

  // Type toggle — use explicit style, not hidden attribute
  formView.querySelectorAll('input[name="ql-item-type"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const urlField = formView.querySelector('#ql-url-field');
      const contentField = formView.querySelector('#ql-content-field');
      const isNote = formView.querySelector('input[name="ql-item-type"]:checked')?.value === 'note';
      if (urlField) urlField.style.display = isNote ? 'none' : '';
      if (contentField) contentField.style.display = isNote ? '' : 'none';
    });
  });

  // Save
  formView.querySelector('#ql-save-btn')?.addEventListener('click', async () => {
    if (!_editState) return;

    const label = formView.querySelector('#ql-field-label')?.value.trim() || '';
    if (!label) {
      formView.querySelector('#ql-field-label')?.focus();
      return;
    }

    const icon = formView.querySelector('#ql-field-icon')?.value.trim() || 'link';
    const type = formView.querySelector('input[name="ql-item-type"]:checked')?.value || 'link';
    const url = formView.querySelector('#ql-field-url')?.value.trim() || '';
    const content = formView.querySelector('#ql-field-content')?.value || '';
    const { mode, itemId, groupId } = _editState;

    if (mode === 'add-group') {
      _data.groups.push({ id: _genId(), label, items: [] });

    } else if (mode === 'edit-group') {
      const g = _data.groups.find(g => g.id === groupId);
      if (g) g.label = label;

    } else if (mode === 'add-item') {
      const newItem = { id: _genId(), label, icon, type,
        ...(type === 'link' ? { url } : { content }) };
      if (groupId) {
        const g = _data.groups.find(g => g.id === groupId);
        if (g) g.items.push(newItem);
      } else {
        _data.ungrouped.push(newItem);
      }

    } else if (mode === 'edit-item') {
      const found = _findItem(itemId);
      if (found) {
        const { item } = found;
        item.label = label;
        item.icon = icon;
        item.type = type;
        if (type === 'link') { item.url = url; delete item.content; }
        else { item.content = content; delete item.url; }
      }
    }

    _showListView(contentEl);
    await _persist(listEl, contentEl, feedbackEl, onSaved);
  });
}

function _bindListView(contentEl, listEl, feedbackEl, onSaved) {
  // Toolbar
  contentEl.querySelector('#ql-add-group-btn')?.addEventListener('click', () => {
    _showFormView(contentEl, { mode: 'add-group', itemId: null, groupId: null });
  });
  contentEl.querySelector('#ql-add-item-btn')?.addEventListener('click', () => {
    _showFormView(contentEl, { mode: 'add-item', itemId: null, groupId: null });
  });

  // List delegation
  listEl.addEventListener('click', async e => {
    const btn = e.target.closest('[data-ql-action]');
    if (!btn) return;

    const action = btn.dataset.qlAction;
    const itemId = btn.dataset.itemId;
    const groupId = btn.dataset.groupId || null;

    if (action === 'edit-item') {
      _showFormView(contentEl, { mode: 'edit-item', itemId, groupId });
      return;
    }
    if (action === 'edit-group') {
      _showFormView(contentEl, { mode: 'edit-group', itemId: null, groupId });
      return;
    }
    if (action === 'add-item-to-group') {
      _showFormView(contentEl, { mode: 'add-item', itemId: null, groupId });
      return;
    }
    if (action === 'delete-item') { _removeItem(itemId, groupId); }
    else if (action === 'delete-group') { _removeGroup(groupId); }
    else return;

    await _persist(listEl, contentEl, feedbackEl, onSaved);
  });
}

// ── Public init ────────────────────────────────────────────────

async function initCustomLinksTab(modalRoot, feedbackEl, onSaved) {
  _data = { groups: [], ungrouped: [] };
  _editState = null;

  const contentEl = modalRoot.querySelector('#ql-content');
  if (!contentEl) return;

  contentEl.innerHTML = _buildScaffoldHtml();
  const listEl = contentEl.querySelector('#ql-list');

  try {
    _data = await fetchCustomLinks();
  } catch {
    _data = { groups: [], ungrouped: [] };
  }

  listEl.innerHTML = _buildListHtml();

  _bindFormView(contentEl, listEl, feedbackEl, onSaved);
  _bindListView(contentEl, listEl, feedbackEl, onSaved);
}

export { initCustomLinksTab };
