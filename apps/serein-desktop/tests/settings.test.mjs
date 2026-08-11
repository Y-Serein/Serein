import test from "node:test";
import assert from "node:assert/strict";
import {
  clampEditorTabSize,
  defaultSettings,
  MAX_EDITOR_TAB_SIZE,
  MIN_EDITOR_TAB_SIZE,
} from "../.test-dist/app/defaults.js";

test("defaults Tab indentation to four spaces", () => {
  assert.equal(defaultSettings.editorTabSize, 4);
  assert.equal(clampEditorTabSize(Number.NaN), 4);
});

test("clamps persisted Tab indentation to the supported integer range", () => {
  assert.equal(clampEditorTabSize(0), MIN_EDITOR_TAB_SIZE);
  assert.equal(clampEditorTabSize(3.6), 4);
  assert.equal(clampEditorTabSize(99), MAX_EDITOR_TAB_SIZE);
});
