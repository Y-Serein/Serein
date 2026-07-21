import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  extractOutline,
  normalizeRichMarkdownEscapes,
  normalizeWikiLinkEscapes,
} from "../.test-dist/shared/markdown.js";
import { renderMathToHtml, scanMarkdownMath } from "../.test-dist/shared/math.js";
import { renderMarkdownBody } from "../.test-dist/export/markdownExport.js";

function readFixture(name) {
  return fs.readFileSync(new URL(`../../../tests/fixtures/rich-edit/${name}`, import.meta.url), "utf8");
}

test("keeps complex rich-edit fixtures stable through markdown normalizers", () => {
  for (const fixtureName of ["00_raw.txt", "nested_list_quote_code.md"]) {
    const markdown = readFixture(fixtureName);
    const richNormalized = normalizeRichMarkdownEscapes(markdown);
    const wikiNormalized = normalizeWikiLinkEscapes(markdown);

    assert.match(richNormalized, /Acquire::http::Proxy "http:\/\/127\.0\.0\.1:7897";/);
    assert.match(richNormalized, /Acquire::https::Proxy "http:\/\/127\.0\.0\.1:7897";/);
    assert.match(wikiNormalized, /Acquire::http::Proxy "http:\/\/127\.0\.0\.1:7897";/);
    assert.match(wikiNormalized, /Acquire::https::Proxy "http:\/\/127\.0\.0\.1:7897";/);
  }
});

test("does not treat headings inside fenced code fixtures as document outline", () => {
  const markdown = readFixture("nested_list_quote_code.md");
  assert.deepEqual(extractOutline(markdown), []);
});

test("exports complex code fixtures without dropping EOF heredoc lines", () => {
  const html = renderMarkdownBody(readFixture("00_raw.txt"));
  assert.match(html, /EOF/);
  assert.match(html, /127\.0\.0\.1:7897/);
});

test("scans inline and block math without entering code", () => {
  const markdown = [
    "Inline $x^2 + y^2 = z^2$.",
    "`$not math$`.",
    "```",
    "$also not math$",
    "```",
    "$$",
    "\\frac{1}{2}",
    "$$",
  ].join("\n");

  assert.deepEqual(scanMarkdownMath(markdown).map(({ content, kind }) => ({ content, kind })), [
    { content: "x^2 + y^2 = z^2", kind: "inline" },
    { content: "\\frac{1}{2}", kind: "block" },
  ]);
  assert.deepEqual(scanMarkdownMath("$$\n\n$$"), []);
});

test("renders KaTeX math in HTML export", () => {
  const html = renderMarkdownBody("Euler: $e^{i\\pi}+1=0$\n\n$$\\frac{1}{2}$$");
  assert.match(html, /class="katex"/);
  assert.match(html, /katex-display/);
  assert.match(renderMathToHtml("\\sqrt{x}", false), /class="katex"/);
});

test("exports pipe tables with short delimiter cells", () => {
  const html = renderMarkdownBody([
    "| 模块 | 概念 | 总分 |",
    "| --- | -: | -- |",
    "| 线性代数 |  | /20 |",
  ].join("\n"));
  assert.match(html, /<table>/);
  assert.match(html, /<td[^>]*>\/20<\/td>/);
});
