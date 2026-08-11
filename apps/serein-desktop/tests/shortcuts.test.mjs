import test from "node:test";
import assert from "node:assert/strict";
import { resolveGlobalAppShortcuts, webviewShortcutAction } from "../.test-dist/command/globalShortcuts.js";

function shortcut(commandId, currentKeys, enabled = true) {
  return {
    id: commandId,
    label: commandId,
    category: "App",
    defaultKeys: currentKeys,
    currentKeys,
    commandId,
    editable: true,
    enabled,
  };
}

test("resolves default global app shortcuts without conflicts", () => {
  assert.deepEqual(resolveGlobalAppShortcuts([
    shortcut("app.openQuickNote", ["Alt+W"]),
    shortcut("app.revealWindow", ["Alt+S"]),
  ]), {
    openQuickNote: "Alt+W",
    revealWindow: "Alt+S",
  });
});

test("lets quick note own a global shortcut that conflicts with reveal", () => {
  assert.deepEqual(resolveGlobalAppShortcuts([
    shortcut("app.openQuickNote", ["Alt+W"]),
    shortcut("app.revealWindow", ["Alt+W"]),
  ]), {
    openQuickNote: "Alt+W",
    revealWindow: null,
  });
});

test("keeps reveal shortcut when quick note is disabled", () => {
  assert.deepEqual(resolveGlobalAppShortcuts([
    shortcut("app.openQuickNote", [], false),
    shortcut("app.revealWindow", ["Alt+W"]),
  ]), {
    openQuickNote: null,
    revealWindow: "Alt+W",
  });
});

test("maps WebView find navigation to Serein search navigation", () => {
  assert.equal(webviewShortcutAction("Ctrl+G"), "find-next");
  assert.equal(webviewShortcutAction("F3"), "find-next");
  assert.equal(webviewShortcutAction("Ctrl+Shift+G"), "find-previous");
  assert.equal(webviewShortcutAction("Shift+F3"), "find-previous");
});

test("blocks high-risk WebView accelerators without swallowing ordinary editor keys", () => {
  for (const key of ["Ctrl+F", "Ctrl+R", "Ctrl+Shift+R", "F5", "Ctrl++", "Ctrl+Shift++", "Ctrl+-", "Ctrl+0", "Alt+ArrowLeft", "Alt+ArrowRight", "F12", "Ctrl+Shift+I"]) {
    assert.equal(webviewShortcutAction(key), "block", key);
  }
  for (const key of ["Ctrl+B", "Ctrl+I", "Ctrl+K", "Ctrl+L", "Ctrl+U"]) {
    assert.equal(webviewShortcutAction(key), null, key);
  }
});
