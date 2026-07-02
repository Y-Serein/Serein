import test from "node:test";
import assert from "node:assert/strict";
import { resolveGlobalAppShortcuts } from "../.test-dist/command/globalShortcuts.js";

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
