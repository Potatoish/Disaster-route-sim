// Keyboard focus for modal dialogs ([aria-modal="true"]) on every page: Tab
// and Shift+Tab cycle inside the open dialog instead of wandering onto the
// page dimmed behind it. A dialog's own script moves focus in when it opens
// and back to where it was when it closes (modalFocus.enter / .restore).
// Load before tutorial.js, home.js and script.js.
(function initModalFocus() {
  const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'summary',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  // A closed dialog is [hidden] or display:none; a fading one may still be
  // in the DOM, so visibility counts too.
  const isShown = (el) => !el.closest('[hidden]')
    && el.getClientRects().length > 0
    && getComputedStyle(el).visibility !== 'hidden';

  const focusables = (dialog) => Array.from(dialog.querySelectorAll(FOCUSABLE))
    .filter((el) => el.tabIndex >= 0 && isShown(el));

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || event.defaultPrevented) return;
    const open = Array.from(document.querySelectorAll('[aria-modal="true"]')).filter(isShown);
    if (!open.length) return;

    const active = document.activeElement;
    const dialog = open.find((el) => el.contains(active)) || open[open.length - 1];
    const items = focusables(dialog);
    if (!items.length) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (!dialog.contains(active)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  });

  const returnFocus = new WeakMap();

  // Remembers what had focus, then focuses `target` (default: the dialog's
  // first control) once the dialog has rendered.
  function enter(dialog, target) {
    if (!dialog) return;
    if (!dialog.contains(document.activeElement)) returnFocus.set(dialog, document.activeElement);
    requestAnimationFrame(() => (target || focusables(dialog)[0])?.focus({ preventScroll: true }));
  }

  function restore(dialog) {
    const el = dialog && returnFocus.get(dialog);
    if (!el) return;
    returnFocus.delete(dialog);
    if (document.contains(el)) el.focus({ preventScroll: true });
  }

  window.modalFocus = { enter, restore };
})();
