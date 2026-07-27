import test from "node:test";
import assert from "node:assert/strict";
import {
  addMindmapChild,
  deleteMindmapBranch,
  moveMindmapNodeAsChild,
  outdentMindmapNode,
  parseMarkdownMindmap,
  renameMindmapNode,
  updateMindmapNodeBody,
  updateMindmapNodeContent,
} from "../.test-dist/features/mindmap/model.js";
import { layoutMarkdownMindmap } from "../.test-dist/features/mindmap/layout.js";

function applyMutation(markdown, result) {
  assert.equal(result.ok, true);
  return [...result.mutation.changes]
    .sort((left, right) => right.from - left.from)
    .reduce((value, change) => value.slice(0, change.from) + change.insert + value.slice(change.to), markdown);
}

test("derives a single tree from frontmatter title, headings, and nested lists", () => {
  const markdown = [
    "---",
    "title: Roadmap",
    "---",
    "",
    "Preface.",
    "",
    "# Product",
    "Product body.",
    "",
    "## Editor",
    "- [x] Rich edit",
    "  - Source edit",
    "",
    "# Delivery",
  ].join("\n");

  const map = parseMarkdownMindmap(markdown, "Fallback");
  assert.equal(map.root.text, "Roadmap");
  assert.deepEqual(map.root.children.map((node) => node.kind), ["paragraph", "heading", "heading"]);
  assert.equal(map.root.children[0].text, "Preface.");
  const product = map.nodes.find((node) => node.text === "Product");
  const editor = map.nodes.find((node) => node.text === "Editor");
  const richEdit = map.nodes.find((node) => node.text === "Rich edit");
  assert.ok(product && editor && richEdit);
  assert.equal(editor.parentId, product.id);
  assert.equal(richEdit.parentId, editor.id);
  assert.equal(richEdit.taskChecked, true);
  assert.equal(richEdit.children.find((node) => node.kind === "list")?.text, "Source edit");
  assert.match(map.root.bodyMarkdown, /Preface/);
  assert.match(product.bodyMarkdown, /Product body/);
});

test("uses the first H1 as an editable root without duplicating it", () => {
  const markdown = "# Root\nRoot body.\n\n## Child\nChild body.";
  const map = parseMarkdownMindmap(markdown, "Fallback");
  assert.equal(map.root.text, "Root");
  assert.deepEqual(map.root.children.map((node) => node.kind), ["paragraph", "heading"]);
  assert.equal(map.root.children.find((node) => node.kind === "heading")?.text, "Child");

  const renamed = applyMutation(markdown, renameMindmapNode(map, "root", "Renamed"));
  assert.match(renamed, /^# Renamed$/m);
  assert.doesNotMatch(renamed, /^# Root$/m);
});

test("creates an H1 root when a filename fallback root is renamed", () => {
  const markdown = "Opening paragraph.\n\n- item";
  const map = parseMarkdownMindmap(markdown, "notes.md");
  const renamed = applyMutation(markdown, renameMindmapNode(map, "root", "Notes"));
  assert.match(renamed, /^# Notes\n\nOpening paragraph/);
});

test("updates only the selected node body and preserves child source", () => {
  const markdown = "# Root\n\n## Parent\nOld body.\n\n### Child\nChild body.";
  const map = parseMarkdownMindmap(markdown, "Fallback");
  const parent = map.nodes.find((node) => node.text === "Parent");
  assert.ok(parent);
  const updated = applyMutation(markdown, updateMindmapNodeBody(map, parent.id, "New body.\n\n"));
  assert.match(updated, /## Parent\nNew body\.\n\n### Child/);
  assert.match(updated, /Child body\./);
});

test("adds a child heading and deletes a complete branch without touching the next sibling", () => {
  const markdown = "# Root\n\n## A\nBody A.\n\n### A1\nBody A1.\n\n## B\nBody B.";
  const map = parseMarkdownMindmap(markdown, "Fallback");
  const a = map.nodes.find((node) => node.text === "A");
  assert.ok(a);

  const withChild = applyMutation(markdown, addMindmapChild(map, a.id, "A2"));
  assert.match(withChild, /### A2/);

  const deleted = applyMutation(markdown, deleteMindmapBranch(map, a.id));
  assert.doesNotMatch(deleted, /## A/);
  assert.doesNotMatch(deleted, /### A1/);
  assert.match(deleted, /## B\nBody B\./);
});

test("moves a heading branch under another heading and adjusts all heading levels", () => {
  const markdown = "# Root\n\n## A\n\n### A1\n\n## B";
  const map = parseMarkdownMindmap(markdown, "Fallback");
  const a = map.nodes.find((node) => node.text === "A");
  const b = map.nodes.find((node) => node.text === "B");
  assert.ok(a && b);

  const moved = applyMutation(markdown, moveMindmapNodeAsChild(map, a.id, b.id));
  assert.match(moved, /## B[\s\S]*### A[\s\S]*#### A1/);
});

test("blocks moving a heading directly into a list item", () => {
  const markdown = "---\ntitle: Root\n---\n\n- item\n\n# Heading";
  const map = parseMarkdownMindmap(markdown, "Fallback");
  const heading = map.nodes.find((node) => node.text === "Heading");
  const item = map.nodes.find((node) => node.text === "item");
  assert.ok(heading && item);
  assert.deepEqual(moveMindmapNodeAsChild(map, heading.id, item.id), { ok: false, reason: "heading-into-list" });
});

test("outdents skipped heading levels to the actual grandparent level", () => {
  const markdown = "# Root\n\n## Parent\n\n#### Child";
  const map = parseMarkdownMindmap(markdown, "Fallback");
  const child = map.nodes.find((node) => node.text === "Child");
  assert.ok(child);
  const outdented = applyMutation(markdown, outdentMindmapNode(map, child.id));
  assert.match(outdented, /## Parent[\s\S]*## Child/);
  assert.doesNotMatch(outdented, /#### Child/);
});

test("derives paragraph, table, and code as ordered child nodes instead of one heading card", () => {
  const markdown = [
    "# Root",
    "",
    "## Product",
    "Product body.",
    "",
    "| Module | State |",
    "| --- | --- |",
    "| Table | Visible |",
    "",
    "```ts",
    "const view = \"mindmap\";",
    "```",
  ].join("\n");
  const map = parseMarkdownMindmap(markdown, "Fallback");
  const product = map.nodes.find((node) => node.text === "Product");
  assert.ok(product);
  assert.deepEqual(product.children.map((node) => node.kind), ["paragraph", "table", "code"]);
  assert.match(product.children[1].sourceMarkdown, /\| Module \| State \|/);
  assert.match(product.children[2].sourceMarkdown, /const view = "mindmap";/);

  const canvasLayout = layoutMarkdownMindmap(map.root, "right", new Set(), true);
  const exportLayout = layoutMarkdownMindmap(map.root, "right", new Set(), false);
  const code = product.children.find((node) => node.kind === "code");
  const table = product.children.find((node) => node.kind === "table");
  assert.ok(code && table);
  const canvasCode = canvasLayout.nodeById.get(code.id);
  const exportCode = exportLayout.nodeById.get(code.id);
  const canvasTable = canvasLayout.nodeById.get(table.id);
  const exportTable = exportLayout.nodeById.get(table.id);
  assert.ok(canvasCode && exportCode && canvasTable && exportTable);
  assert.ok(canvasCode.width > exportCode.width);
  assert.ok(canvasTable.width > exportTable.width);
});

test("updates a code node in place without changing its heading or adjacent table", () => {
  const markdown = [
    "# Root",
    "",
    "## Rules",
    "Explanation with `inline code`.",
    "",
    "| Key | Value |",
    "| --- | --- |",
    "| mode | safe |",
    "",
    "```ts",
    "const mode = \"safe\";",
    "```",
  ].join("\n");
  const map = parseMarkdownMindmap(markdown, "Fallback");
  const rules = map.nodes.find((node) => node.text === "Rules");
  const code = rules?.children.find((node) => node.kind === "code");
  assert.ok(rules && code);

  const updated = applyMutation(markdown, updateMindmapNodeContent(map, code.id, "```ts\nconst mode = \"direct\";\n```"));
  assert.match(updated, /## Rules/);
  assert.match(updated, /\| mode \| safe \|/);
  assert.match(updated, /const mode = "direct";/);
  assert.doesNotMatch(updated, /const mode = "safe";/);
});
