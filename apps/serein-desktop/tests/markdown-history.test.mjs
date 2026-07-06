import test from "node:test";
import assert from "node:assert/strict";
import {
  recordMarkdownHistoryEntry,
  takeMarkdownHistorySnapshot,
} from "../.test-dist/editor/markdownHistory.js";

test("records undo and redo snapshots per note", () => {
  const store = new Map();

  recordMarkdownHistoryEntry(store, "note-a", "one", "two");
  recordMarkdownHistoryEntry(store, "note-a", "two", "three");

  assert.equal(takeMarkdownHistorySnapshot(store, "note-a", "three", "undo"), "two");
  assert.equal(takeMarkdownHistorySnapshot(store, "note-a", "two", "undo"), "one");
  assert.equal(takeMarkdownHistorySnapshot(store, "note-a", "one", "redo"), "two");
  assert.equal(takeMarkdownHistorySnapshot(store, "note-a", "two", "redo"), "three");
  assert.equal(takeMarkdownHistorySnapshot(store, "note-a", "three", "redo"), null);
});

test("skips duplicate entries and preserves empty markdown snapshots", () => {
  const store = new Map();

  recordMarkdownHistoryEntry(store, "note-a", "same", "same");
  assert.equal(takeMarkdownHistorySnapshot(store, "note-a", "same", "undo"), null);

  recordMarkdownHistoryEntry(store, "note-a", "", "draft");
  recordMarkdownHistoryEntry(store, "note-a", "", "draft");

  assert.equal(takeMarkdownHistorySnapshot(store, "note-a", "draft", "undo"), "");
  assert.equal(takeMarkdownHistorySnapshot(store, "note-a", "", "undo"), null);
});
