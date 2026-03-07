/**
 * datePicker.js
 *
 * Dumb component for date selection via a compact calendar grid.
 * Designed for the app's dark theme. Works standalone or as an
 * AG Grid popup cell editor.
 *
 * Pattern: Revealing Module (IIFE).
 *
 * Public API:
 *   DatePicker.buildHTML(data, options)         → string
 *   DatePicker.createElement(data, options)     → HTMLElement  (wired with events)
 *   DatePicker.buildLoadingHTML()               → string
 *   DatePicker.createLoadingElement()           → HTMLElement
 *   DatePicker.createCellEditor()               → AG Grid cell editor class
 *   DatePicker.createPickerField(placeholder, initialValue, onChange)
 *                                               → HTMLElement  (button-trigger + popup field)
 *
 * ── data shape ──────────────────────────────────────────────────────────────
 * {
 *   value:  string   — selected date as ISO 'YYYY-MM-DD'            [optional]
 *                       defaults to today when falsy
 * }
 *
 * ── options shape ───────────────────────────────────────────────────────────
 * {
 *   onChange: function(isoDate: string)
 *            Called when the user selects a date. Receives ISO string.
 * }
 *
 * ── AG Grid cell editor ─────────────────────────────────────────────────────
 * The editor returned by createCellEditor() is a class that AG Grid
 * instantiates. It uses createElement internally and implements the
 * required AG Grid editor interface (init, getGui, getValue, isPopup,
 * afterGuiAttached).
 */

import { formatDateDisplay } from '../../../utils/formatters.js';

const DatePicker = (() => {

  // ─── Constants ───────────────────────────────────────────────────────────────

  /** Short weekday labels (Monday-first). */
  const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  /** Month names for the navigation header. */
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  // ─── Pure helpers ──────────────────────────────────────────────────────────

  /** Returns today's date as YYYY-MM-DD string. */
  function _todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  /** Parses an ISO date string into { year, month (0-based), day }. */
  function _parseIso(isoDate) {
    const fallback = _todayIso();
    const raw = String(isoDate || fallback);
    const [y, m, d] = raw.split('-').map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
      const t = new Date();
      return { year: t.getFullYear(), month: t.getMonth(), day: t.getDate() };
    }
    return { year: y, month: m - 1, day: d };
  }

  /** Formats { year, month, day } into YYYY-MM-DD. */
  function _toIso(year, month, day) {
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  }

  /**
   * Builds a 6-row × 7-column grid of day objects for a given month.
   * Each day: { year, month (0-based), day, isOutside, isToday, iso }.
   */
  function _buildCalendarDays(year, month) {
    const today = _todayIso();
    const firstDay = new Date(year, month, 1);
    /* Monday-based offset: 0=Mon, 6=Sun */
    const startOffset = (firstDay.getDay() + 6) % 7;
    const days = [];

    /* Previous month fill */
    const prevDate = new Date(year, month, 0); // last day of prev month
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = prevDate.getDate() - i;
      const m = prevDate.getMonth();
      const y = prevDate.getFullYear();
      const iso = _toIso(y, m, d);
      days.push({ year: y, month: m, day: d, isOutside: true, isToday: iso === today, iso });
    }

    /* Current month */
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = _toIso(year, month, d);
      days.push({ year, month, day: d, isOutside: false, isToday: iso === today, iso });
    }

    /* Next month fill (up to 42 cells = 6 rows) */
    let nextDay = 1;
    while (days.length < 42) {
      const m = month + 1 > 11 ? 0 : month + 1;
      const y = month + 1 > 11 ? year + 1 : year;
      const iso = _toIso(y, m, nextDay);
      days.push({ year: y, month: m, day: nextDay, isOutside: true, isToday: iso === today, iso });
      nextDay++;
    }

    return days;
  }

  // ─── HTML builders ─────────────────────────────────────────────────────────

  /**
   * Builds the full date picker HTML for a given view month/year and selected date.
   *
   * @param {number} viewYear    - Currently displayed year
   * @param {number} viewMonth   - Currently displayed month (0-based)
   * @param {string} selectedIso - Currently selected date (YYYY-MM-DD)
   * @returns {string}
   */
  function _buildCalendarHTML(viewYear, viewMonth, selectedIso) {
    const days = _buildCalendarDays(viewYear, viewMonth);

    const weekdayHeaders = WEEKDAYS
      .map(d => `<span class="ft-date-picker__weekday">${d}</span>`)
      .join('');

    const dayCells = days
      .map(d => {
        const attrs = [];
        if (d.isOutside) attrs.push('data-outside');
        if (d.isToday) attrs.push('data-today');
        if (d.iso === selectedIso) attrs.push('data-selected');
        return `<button class="ft-date-picker__day" data-date="${d.iso}" ${attrs.join(' ')} type="button">${d.day}</button>`;
      })
      .join('');

    return `
      <div class="ft-date-picker__nav">
        <button class="ft-date-picker__nav-btn" data-dir="prev" type="button" aria-label="Previous month">
          <span class="material-symbols-outlined" aria-hidden="true">chevron_left</span>
        </button>
        <div class="ft-date-picker__nav-title">
          <span class="ft-date-picker__month-label">${MONTHS[viewMonth]}</span>
          <span class="ft-date-picker__year-label">${viewYear}</span>
        </div>
        <button class="ft-date-picker__nav-btn" data-dir="next" type="button" aria-label="Next month">
          <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
        </button>
      </div>
      <div class="ft-date-picker__grid">
        ${weekdayHeaders}
        ${dayCells}
      </div>
      <div class="ft-date-picker__footer">
        <button class="ft-date-picker__today-btn" type="button">Today</button>
      </div>`;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Builds a static HTML string for the date picker.
   *
   * @param {object} [data={}]      - { value: 'YYYY-MM-DD' }
   * @param {object} [options={}]   - { onChange }
   * @returns {string}
   */
  function buildHTML(data = {}, options = {}) {
    const { year, month } = _parseIso(data?.value);
    const selectedIso = data?.value || '';
    return `<div class="ft-date-picker">${_buildCalendarHTML(year, month, selectedIso)}</div>`;
  }

  /**
   * Creates a live DOM element with calendar navigation and date selection wired.
   *
   * @param {object} [data={}]      - { value: 'YYYY-MM-DD' }
   * @param {object} [options={}]   - { onChange: fn(isoString) }
   * @returns {HTMLElement}
   */
  function createElement(data = {}, options = {}) {
    const { year, month } = _parseIso(data?.value);
    let viewYear = year;
    let viewMonth = month;
    let selectedIso = data?.value || '';

    const root = document.createElement('div');
    root.className = 'ft-date-picker';
    root.innerHTML = _buildCalendarHTML(viewYear, viewMonth, selectedIso);

    /** Re-renders the calendar body while preserving the root element. */
    function _refresh() {
      root.innerHTML = _buildCalendarHTML(viewYear, viewMonth, selectedIso);
    }

    /* ── Event delegation ── */
    root.addEventListener('click', event => {
      const navBtn = event.target.closest('.ft-date-picker__nav-btn');
      if (navBtn) {
        event.stopPropagation();
        const dir = navBtn.dataset.dir;
        if (dir === 'prev') {
          viewMonth -= 1;
          if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
        } else {
          viewMonth += 1;
          if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
        }
        _refresh();
        return;
      }

      const dayBtn = event.target.closest('.ft-date-picker__day');
      if (dayBtn && dayBtn.dataset.date) {
        event.stopPropagation();
        selectedIso = dayBtn.dataset.date;
        /* Navigate to the selected month if it's an outside day */
        const parsed = _parseIso(selectedIso);
        viewYear = parsed.year;
        viewMonth = parsed.month;
        _refresh();
        if (typeof options.onChange === 'function') options.onChange(selectedIso);
        return;
      }

      const todayBtn = event.target.closest('.ft-date-picker__today-btn');
      if (todayBtn) {
        event.stopPropagation();
        selectedIso = _todayIso();
        const parsed = _parseIso(selectedIso);
        viewYear = parsed.year;
        viewMonth = parsed.month;
        _refresh();
        if (typeof options.onChange === 'function') options.onChange(selectedIso);
      }
    });

    /* Keyboard nav: arrow keys move between days, Enter/Space selects */
    root.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();

      const focused = root.querySelector('.ft-date-picker__day:focus');
      if (!focused) {
        const first = root.querySelector('.ft-date-picker__day[data-selected]') ||
                      root.querySelector('.ft-date-picker__day[data-today]') ||
                      root.querySelector('.ft-date-picker__day');
        first?.focus();
        return;
      }

      const allDays = Array.from(root.querySelectorAll('.ft-date-picker__day'));
      const idx = allDays.indexOf(focused);
      let next = idx;

      if (event.key === 'ArrowLeft') next = idx - 1;
      if (event.key === 'ArrowRight') next = idx + 1;
      if (event.key === 'ArrowUp') next = idx - 7;
      if (event.key === 'ArrowDown') next = idx + 7;

      if (next >= 0 && next < allDays.length) {
        allDays[next].focus();
      }
    });

    return root;
  }

  /**
   * Builds a loading skeleton HTML string.
   * @returns {string}
   */
  function buildLoadingHTML() {
    return '<div class="ft-date-picker" aria-hidden="true" style="opacity:0.5;pointer-events:none;min-height:280px;"></div>';
  }

  /**
   * Creates a loading skeleton DOM element.
   * @returns {HTMLElement}
   */
  function createLoadingElement() {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildLoadingHTML().trim();
    return wrapper.firstElementChild;
  }

  /**
   * Returns an AG Grid-compatible cell editor class.
   *
   * Usage in column definition:
   * ```js
   * {
   *   cellEditor: DatePicker.createCellEditor(),
   *   cellEditorPopup: true,
   * }
   * ```
   *
   * The editor implements AG Grid's ICellEditor interface:
   * - init(params)         — creates the picker element
   * - getGui()             — returns the root DOM node
   * - getValue()           — returns the selected ISO date string
   * - isPopup()            — returns true (rendered as overlay)
   * - afterGuiAttached()   — focuses the selected day for keyboard nav
   */
  function createCellEditor() {
    return class DatePickerCellEditor {
      init(params) {
        this._value = params.value || _todayIso();
        this._params = params;

        this._el = createElement(
          { value: this._value },
          {
            onChange: (isoDate) => {
              this._value = isoDate;
              /* Close the editor after selection */
              setTimeout(() => params.api.stopEditing(), 0);
            },
          }
        );
      }

      getGui() {
        return this._el;
      }

      getValue() {
        return this._value;
      }

      isPopup() {
        return true;
      }

      afterGuiAttached() {
        /* Focus the selected day (or today) for immediate keyboard nav */
        const target = this._el.querySelector('.ft-date-picker__day[data-selected]') ||
                       this._el.querySelector('.ft-date-picker__day[data-today]');
        target?.focus();
      }
    };
  }

  /**
   * Creates a self-contained date-picker trigger field:
   * a styled button showing the selected date (or a placeholder),
   * with a floating calendar popup and a clear button.
   *
   * The returned element has a `_cleanup()` method that removes the
   * document-level click listener — call it when the field is torn down
   * (e.g. on page navigation) to prevent memory leaks.
   *
   * CSS classes used: ft-date-popup, ft-date-popup__trigger,
   *   ft-date-popup__trigger--placeholder, ft-date-popup__clear,
   *   ft-date-popup__calendar.
   *
   * @param {string}   placeholder  — label shown when no date is selected
   * @param {string}   initialValue — initial ISO date ('YYYY-MM-DD') or ''
   * @param {Function} onChange     — called with ISO date string (or '') on change
   * @returns {HTMLElement & { _cleanup: Function }}
   */
  function createPickerField(placeholder, initialValue, onChange) {
    let currentValue = initialValue || '';

    const wrapper = document.createElement('div');
    wrapper.className = 'ft-date-popup';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'ft-date-popup__trigger';

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'ft-date-popup__clear';
    clearBtn.setAttribute('aria-label', `Clear ${placeholder} date`);
    clearBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';
    clearBtn.hidden = true;

    const popup = document.createElement('div');
    popup.className = 'ft-date-popup__calendar';
    popup.hidden = true;

    function _refresh() {
      const label = currentValue ? formatDateDisplay(currentValue) : placeholder;
      trigger.innerHTML = `<span class="material-symbols-outlined ft-date-popup__icon">calendar_month</span><span>${label}</span>`;
      if (currentValue) {
        trigger.classList.remove('ft-date-popup__trigger--placeholder');
        clearBtn.hidden = false;
      } else {
        trigger.classList.add('ft-date-popup__trigger--placeholder');
        clearBtn.hidden = true;
      }
    }

    _refresh();

    const picker = createElement(
      { value: currentValue },
      {
        onChange: isoDate => {
          currentValue = isoDate;
          _refresh();
          popup.hidden = true;
          onChange?.(currentValue);
        },
      }
    );
    popup.appendChild(picker);

    /* Positions the popup relative to the trigger using fixed coords,
       so it escapes overflow:hidden/auto scroll containers (e.g. modals). */
    function _positionPopup() {
      const rect = trigger.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      popup.style.left = `${rect.left}px`;
      if (spaceBelow >= 320 || spaceBelow >= rect.top) {
        popup.style.top    = `${rect.bottom + 4}px`;
        popup.style.bottom = 'auto';
      } else {
        popup.style.top    = 'auto';
        popup.style.bottom = `${window.innerHeight - rect.top + 4}px`;
      }
    }

    trigger.addEventListener('click', e => {
      e.stopPropagation();
      /* Close any other open date popups first */
      document.querySelectorAll('.ft-date-popup__calendar:not([hidden])').forEach(p => {
        if (p !== popup) p.hidden = true;
      });
      popup.hidden = !popup.hidden;
      if (!popup.hidden) _positionPopup();
    });

    clearBtn.addEventListener('click', e => {
      e.stopPropagation();
      currentValue = '';
      _refresh();
      popup.hidden = true;
      onChange?.('');
    });

    /* Close when clicking outside — use AbortController so the caller can clean up. */
    const ac = new AbortController();
    document.addEventListener('click', e => {
      if (!wrapper.contains(e.target)) popup.hidden = true;
    }, { signal: ac.signal });

    wrapper.appendChild(trigger);
    wrapper.appendChild(clearBtn);
    wrapper.appendChild(popup);

    /** Removes the document-level outside-click listener. Call on teardown. */
    wrapper._cleanup = () => ac.abort();

    return wrapper;
  }

  // ─── Reveal ────────────────────────────────────────────────────────────────

  return { buildHTML, createElement, buildLoadingHTML, createLoadingElement, createCellEditor, createPickerField };
})();

export { DatePicker };
