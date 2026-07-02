import test from "node:test";
import assert from "node:assert/strict";
import {
  collectLocalImageSources,
  htmlDocument,
  renderMarkdownBody,
} from "../.test-dist/export/markdownExport.js";
import {
  markdownToPdfBytes,
} from "../.test-dist/export/pdfExport.js";
import {
  ensureSaveExtension,
  joinVaultPath,
  parentVaultDir,
} from "../.test-dist/shared/markdown.js";

test("renders tables, tasks, footnotes, images, and math without dropping source meaning", () => {
  const markdown = [
    "# Title",
    "",
    "- [x] done",
    "- [ ] todo",
    "",
    "| A | B |",
    "| :--- | ---: |",
    "| $x$ | ![Plot](assets/plot.png) |",
    "",
    "Footnote[^1]",
    "",
    "[^1]: detail",
  ].join("\n");

  const body = renderMarkdownBody(markdown, { "assets/plot.png": "data:image/png;base64,abc" });
  assert.match(body, /<table>/);
  assert.match(body, /type="checkbox" disabled="disabled" checked="checked" \/>/);
  assert.match(body, /class="math-inline"/);
  assert.match(body, /data:image\/png;base64,abc/);
  assert.match(body, /class="footnote"/);
});

test("collects only local markdown image sources", () => {
  const sources = collectLocalImageSources("![a](assets/a.png)\n![b](https://example.com/b.png)\n![c](<../c space.jpg>)\n![d](assets/d.png \"title\")");
  assert.deepEqual(sources, ["assets/a.png", "../c space.jpg", "assets/d.png"]);
});

test("collects Windows absolute markdown image sources", () => {
  const sources = collectLocalImageSources("![a](<C:\\Serein_Y\\Sipeed\\rv_nano\\v8.png>)\n![b](C:\\Temp\\b.png)");
  assert.deepEqual(sources, ["C:\\Serein_Y\\Sipeed\\rv_nano\\v8.png", "C:\\Temp\\b.png"]);
});

test("wraps rendered markdown in a complete html export document", () => {
  const html = htmlDocument("```ts\nconst ok = true\n```", { title: "Doc" });
  assert.match(html, /<!doctype html>/);
  assert.match(html, /<title>Doc<\/title>/);
  assert.match(html, /class="code-block"/);
});

test("exports markdown to PDF bytes without browser canvas rendering", async () => {
  const bytes = await markdownToPdfBytes("# 标题\n\n- [x] done\n\n![Plot](assets/plot.png)", {
    title: "Doc",
    imageMap: { "assets/plot.png": "data:image/png;base64,abc" },
  });
  const header = String.fromCharCode(...bytes.slice(0, 8));
  assert.equal(header, "%PDF-1.4");
  assert.ok(bytes.length > 500);
});

test("keeps vault path helpers stable", () => {
  assert.equal(ensureSaveExtension("/tmp/note", "md"), "/tmp/note.md");
  assert.equal(ensureSaveExtension("/tmp/note.markdown", "md"), "/tmp/note.markdown");
  assert.equal(joinVaultPath("folder", "note.md"), "folder/note.md");
  assert.equal(parentVaultDir("folder/sub/note.md"), "folder/sub");
});
