import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { EditorState, Transaction } from "@codemirror/state";
import {
  textBufferPasteTransaction,
  textBufferPasteUserEvent,
} from "../.test-dist/editor/textBufferTransactions.js";

test("keeps a 5000-line paste on one direct CodeMirror transaction", () => {
  const markdown = Array.from({ length: 5000 }, (_, index) => (
    `Fictional paragraph ${index} with [link](./note-${index}.md), **bold**, and inline \`code-${index}\`.`
  )).join("\n");
  const state = EditorState.create({ doc: "" });

  const startedAt = performance.now();
  const transaction = state.update(textBufferPasteTransaction(state, markdown));
  const duration = performance.now() - startedAt;

  assert.equal(transaction.newDoc.toString(), markdown);
  assert.equal(transaction.annotation(Transaction.userEvent), textBufferPasteUserEvent);
  assert.ok(duration < 2000, `5000-line direct paste transaction took ${duration.toFixed(0)}ms`);
});
