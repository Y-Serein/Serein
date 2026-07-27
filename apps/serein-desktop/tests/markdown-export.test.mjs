import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  collectLocalImageSources,
  extractLatexDocumentBody,
  htmlDocument,
  normalizeLatexDocumentForExport,
  renderMarkdownBody,
} from "../.test-dist/export/markdownExport.js";
import {
  markdownToPdfBytes,
} from "../.test-dist/export/pdfExport.js";
import {
  scanMarkdownMermaidBlocks,
} from "../.test-dist/shared/mermaid.js";
import {
  ensureSaveExtension,
  joinVaultPath,
  parentVaultDir,
} from "../.test-dist/shared/markdown.js";

function readLatexFixture(name) {
  return fs.readFileSync(new URL(`./fixtures/latex/${name}`, import.meta.url), "utf8");
}

test("renders tables, tasks, footnotes, images, and math without dropping source meaning", () => {
  const markdown = [
    "# Title",
    "",
    "- [x] done",
    "- [ ] todo",
    "",
    "| A | B |",
    "| :--- | ---: |",
    "| \\(x\\) | ![Plot](assets/plot.png) |",
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

test("uses the shared math boundaries when exporting inline content", () => {
  const body = renderMarkdownBody([
    "Price $5 and $10 stays currency.",
    "Inline code `\\(not math\\)` stays code.",
    "Valid \\(x + 1\\) renders.",
    "Invalid \\(\\frac{\\) stays visible.",
  ].join("\n\n"));

  assert.match(body, /Price \$5 and \$10 stays currency\./);
  assert.match(body, /<code>\\\(not math\\\)<\/code>/);
  assert.equal((body.match(/class="math-inline"/g) ?? []).length, 2);
  assert.match(body, /class="serein-math-error"/);
});

test("does not render unmatched or empty block math delimiters", () => {
  const unmatched = renderMarkdownBody("Before\n\n\\[\nnot closed");
  assert.doesNotMatch(unmatched, /class="math-block"/);
  assert.match(unmatched, /\\\[/);
  assert.match(unmatched, /not closed/);

  const empty = renderMarkdownBody("\\[\n\n\\]");
  assert.doesNotMatch(empty, /class="math-block"/);
  assert.match(empty, /\\\[/);
  assert.match(empty, /\\\]/);
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

test("finds Mermaid fences without treating ordinary code blocks as diagrams", () => {
  const markdown = [
    "```mermaid",
    "flowchart LR",
    "  A --> B",
    "```",
    "",
    "````ts",
    "```mermaid",
    "not a diagram block",
    "```",
    "````",
    "",
    "~~~MERMAID",
    "mindmap",
    "  root((Serein))",
    "~~~",
  ].join("\n");

  const blocks = scanMarkdownMermaidBlocks(markdown);
  assert.equal(blocks.length, 2);
  assert.match(blocks[0].source, /flowchart LR/);
  assert.match(blocks[1].source, /mindmap/);
});

test("embeds rendered Mermaid SVG in HTML and preserves source on render errors", () => {
  const markdown = "```mermaid\nflowchart LR\n  A --> B\n```";
  const [block] = scanMarkdownMermaidBlocks(markdown);
  const rendered = renderMarkdownBody(markdown, {}, [{
    ...block,
    svg: "<svg data-test=\"mermaid\"></svg>",
    imageDataUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    error: null,
  }]);
  assert.match(rendered, /class="mermaid-diagram"/);
  assert.match(rendered, /data-test="mermaid"/);
  assert.doesNotMatch(rendered, /flowchart LR/);

  const failed = renderMarkdownBody(markdown, {}, [{
    ...block,
    svg: null,
    imageDataUrl: null,
    error: "Parse error on line 2",
  }]);
  assert.match(failed, /Mermaid diagram could not be rendered/);
  assert.match(failed, /Parse error on line 2/);
  assert.match(failed, /flowchart LR/);
});

test("exports only the body of a complete LaTeX document wrapper", () => {
  const markdown = [
    "\\documentclass{article}",
    "\\usepackage{amsmath}",
    "\\begin{document}",
    "# 一级标题",
    "",
    "正文与 \\(x+1\\)。",
    "\\end{document}",
  ].join("\n");

  assert.equal(extractLatexDocumentBody(markdown), "# 一级标题\n\n正文与 \\(x+1\\)。");
  const body = renderMarkdownBody(markdown);
  assert.match(body, /<h1>一级标题<\/h1>/);
  assert.match(body, /class="math-inline"/);
  assert.doesNotMatch(body, /documentclass|usepackage|begin\{document}|end\{document}/);

  const incomplete = "\\documentclass{article}\n\\begin{document}\n正文";
  assert.equal(extractLatexDocumentBody(incomplete), incomplete);
});

test("maps LaTeX title and article section commands to export-native structure", () => {
  const source = readLatexFixture("bezier-curves.tex");
  const normalized = normalizeLatexDocumentForExport(source);
  const body = renderMarkdownBody(source);

  assert.match(normalized, /SEREIN_LATEX_TITLE/);
  assert.match(normalized, /^# 线性插值$/m);
  assert.match(normalized, /^## 端点与导数$/m);
  assert.match(normalized, /^# \$n\$ 次贝塞尔曲线$/m);
  assert.match(body, /class="document-title">贝塞尔曲线公式推演<\/h1>/);
  assert.match(body, /<h1>线性插值<\/h1>/);
  assert.match(body, /<h2>端点与导数<\/h2>/);
  assert.doesNotMatch(body, /\\maketitle|\\section|\\subsection|documentclass|usepackage/);
  assert.doesNotMatch(body, /serein-math-error/);
});

test("keeps preamble math macros available after removing the LaTeX document shell", () => {
  const source = [
    "\\documentclass{article}",
    "\\newcommand{\\Verify}[2]{\\operatorname{Verify}_{#1}(#2)}",
    "\\begin{document}",
    "Verification: $\\Verify{pk}{m}$.",
    "\\end{document}",
  ].join("\n");
  const body = renderMarkdownBody(source);

  assert.match(body, /class="MathJax"/);
  assert.doesNotMatch(body, /serein-math-error|newcommand|documentclass|begin\{document}/);
});

test("uses report chapter hierarchy and removes LaTeX comments and noindent", () => {
  const source = readLatexFixture("scientific-structures.tex");
  const normalized = normalizeLatexDocumentForExport(source);
  const body = renderMarkdownBody(source);

  assert.match(normalized, /^# 基础结构$/m);
  assert.match(normalized, /^## 分段函数与矩阵$/m);
  assert.match(normalized, /^### 长公式与集中公式$/m);
  assert.match(normalized, /^#### 无编号公式$/m);
  assert.doesNotMatch(normalized, /该注释不能出现在导出正文|\\noindent/);
  assert.match(body, /<h1>基础结构<\/h1>/);
  assert.match(body, /<h2>分段函数与矩阵<\/h2>/);
  assert.match(body, /<h3>长公式与集中公式<\/h3>/);
});

test("supports starred, optional, nested, and multiline LaTeX section titles", () => {
  const source = [
    "\\documentclass{article}",
    "\\title{多行\\\\标题}",
    "\\begin{document}",
    "\\maketitle",
    "\\section*{无编号章节}",
    "\\subsection[短标题]{包含 {嵌套内容} 的",
    "多行标题}",
    "正文。",
    "\\end{document}",
  ].join("\n");
  const normalized = normalizeLatexDocumentForExport(source);
  const body = renderMarkdownBody(source);

  assert.match(normalized, /SEREIN_LATEX_TITLE.*多行 标题/);
  assert.match(normalized, /^# 无编号章节$/m);
  assert.match(normalized, /^## 包含 \{嵌套内容} 的 多行标题$/m);
  assert.match(body, /class="document-title">多行 标题<\/h1>/);
  assert.match(body, /<h1>无编号章节<\/h1>/);
  assert.match(body, /<h2>包含 \{嵌套内容} 的 多行标题<\/h2>/);
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

test("keeps currency while removing valid formula delimiters in PDF text", async () => {
  const bytes = await markdownToPdfBytes("Price $5 and $10.\n\nMath \\(x+1\\).", { title: "Math" });
  const pdfText = String.fromCharCode(...bytes);
  assert.match(pdfText, /Price \$5 and \$10\./);
  assert.match(pdfText, /Math x\+1\./);
});

test("does not leak full LaTeX document commands into PDF export", async () => {
  const bytes = await markdownToPdfBytes(readLatexFixture("bezier-curves.tex"), { title: "Bezier" });
  const pdfText = String.fromCharCode(...bytes);
  assert.equal(pdfText.slice(0, 8), "%PDF-1.4");
  assert.doesNotMatch(pdfText, /\\documentclass|\\usepackage|\\begin\{document}|\\end\{document}/);
  assert.doesNotMatch(pdfText, /\\maketitle|\\section|\\subsection/);
});

test("keeps vault path helpers stable", () => {
  assert.equal(ensureSaveExtension("/tmp/note", "md"), "/tmp/note.md");
  assert.equal(ensureSaveExtension("/tmp/note.markdown", "md"), "/tmp/note.markdown");
  assert.equal(joinVaultPath("folder", "note.md"), "folder/note.md");
  assert.equal(parentVaultDir("folder/sub/note.md"), "folder/sub");
});
