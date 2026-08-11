type DialogKeyEvent = {
  key: string;
  shiftKey: boolean;
  preventDefault: () => void;
};

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => !element.hidden && element.getClientRects().length > 0);
}

export function focusFirstDialogControl(container: HTMLElement | null) {
  if (!container) return;
  (focusableElements(container)[0] ?? container).focus();
}

export function keepDialogFocusInside(container: HTMLElement | null, event: DialogKeyEvent) {
  if (!container || event.key !== "Tab") return;

  const elements = focusableElements(container);
  if (!elements.length) {
    event.preventDefault();
    container.focus();
    return;
  }

  const activeElement = document.activeElement;
  const firstElement = elements[0];
  const lastElement = elements[elements.length - 1];

  if (event.shiftKey && (activeElement === firstElement || !container.contains(activeElement))) {
    event.preventDefault();
    lastElement.focus();
    return;
  }

  if (!event.shiftKey && (activeElement === lastElement || !container.contains(activeElement))) {
    event.preventDefault();
    firstElement.focus();
  }
}

export function restoreDialogTrigger(trigger: HTMLElement | null) {
  if (!trigger?.isConnected) return;
  window.requestAnimationFrame(() => trigger.focus());
}
