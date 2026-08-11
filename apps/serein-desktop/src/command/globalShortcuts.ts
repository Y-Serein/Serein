import type { ShortcutEntry } from "./shortcuts";

export type WebviewShortcutAction = "find-next" | "find-previous" | "block";

const WEBVIEW_FIND_NEXT_KEYS = new Set(["Ctrl+G", "F3"]);
const WEBVIEW_FIND_PREVIOUS_KEYS = new Set(["Ctrl+Shift+G", "Shift+F3"]);
const WEBVIEW_BLOCKED_KEYS = new Set([
  "Ctrl+F",
  "Ctrl+N",
  "Ctrl+O",
  "Ctrl+P",
  "Ctrl+R",
  "Ctrl+Shift+R",
  "Ctrl+S",
  "Ctrl+Shift+S",
  "Ctrl+W",
  "Ctrl+Shift+W",
  "Ctrl++",
  "Ctrl+Shift++",
  "Ctrl+-",
  "Ctrl+0",
  "Alt+ArrowLeft",
  "Alt+ArrowRight",
  "F5",
  "F12",
  "Ctrl+Shift+C",
  "Ctrl+Shift+I",
  "Ctrl+Shift+J",
]);

export function webviewShortcutAction(key: string): WebviewShortcutAction | null {
  if (WEBVIEW_FIND_NEXT_KEYS.has(key)) return "find-next";
  if (WEBVIEW_FIND_PREVIOUS_KEYS.has(key)) return "find-previous";
  if (WEBVIEW_BLOCKED_KEYS.has(key)) return "block";
  return null;
}

function firstEnabledShortcutForCommand(shortcuts: ShortcutEntry[], commandId: string) {
  const shortcut = shortcuts.find((item) => item.commandId === commandId && item.enabled && item.currentKeys.length);
  return shortcut?.currentKeys[0] ?? null;
}

export function resolveGlobalAppShortcuts(shortcuts: ShortcutEntry[]) {
  const openQuickNote = firstEnabledShortcutForCommand(shortcuts, "app.openQuickNote");
  const revealWindow = firstEnabledShortcutForCommand(shortcuts, "app.revealWindow");

  return {
    openQuickNote,
    revealWindow: revealWindow && revealWindow === openQuickNote ? null : revealWindow,
  };
}
