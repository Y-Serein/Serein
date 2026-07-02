import type { ShortcutEntry } from "./shortcuts";

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
