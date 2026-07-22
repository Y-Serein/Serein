import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  extractOutline,
  normalizeRichMarkdownEscapes,
  normalizeWikiLinkEscapes,
} from "../.test-dist/shared/markdown.js";
import {
  extractLatexMathMacroDefinitions,
  renderMarkdownMath,
  renderMathToHtml,
  scanMarkdownMath,
} from "../.test-dist/shared/math.js";
import {
  normalizeLatexDocumentForExport,
  renderMarkdownBody,
} from "../.test-dist/export/markdownExport.js";

function readFixture(name) {
  return fs.readFileSync(new URL(`../../../tests/fixtures/rich-edit/${name}`, import.meta.url), "utf8");
}

function readLatexFixture(name) {
  return fs.readFileSync(new URL(`./fixtures/latex/${name}`, import.meta.url), "utf8");
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

test("scans standard LaTeX inline and block delimiters without entering code", () => {
  const markdown = [
    "Inline \\(x^2 + y^2 = z^2\\).",
    "`\\(not math\\)`.",
    "```",
    "\\[also not math\\]",
    "```",
    "\\[",
    "\\frac{1}{2}",
    "\\]",
  ].join("\n");

  assert.deepEqual(scanMarkdownMath(markdown).map(({ content, kind }) => ({ content, kind })), [
    { content: "x^2 + y^2 = z^2", kind: "inline" },
    { content: "\\frac{1}{2}", kind: "block" },
  ]);
  assert.deepEqual(scanMarkdownMath("\\[\n\n\\]"), []);
});

test("keeps dollar-delimited math as a compatibility syntax", () => {
  const markdown = "Legacy $x + 1$ and $$y + 2$$ remain readable.";
  assert.deepEqual(scanMarkdownMath(markdown).map(({ content, kind }) => ({ content, kind })), [
    { content: "x + 1", kind: "inline" },
  ]);
  assert.deepEqual(scanMarkdownMath("$$y + 2$$").map(({ content, kind }) => ({ content, kind })), [
    { content: "y + 2", kind: "block" },
  ]);
});

test("supports standard LaTeX block delimiters attached to multiline content", () => {
  const markdown = [
    "\\[\\begin{aligned}",
    "a &= b + c",
    "d &= e + f",
    "\\end{aligned}\\]",
  ].join("\n");

  assert.deepEqual(scanMarkdownMath(markdown).map(({ content, kind }) => ({ content, kind })), [
    {
      content: "\\begin{aligned}\na &= b + c\nd &= e + f\n\\end{aligned}",
      kind: "block",
    },
  ]);
  assert.deepEqual(scanMarkdownMath("Literal \\\\(not math\\\\) stays text."), []);
});

test("keeps currency, whitespace delimiters, and code spans out of inline math", () => {
  const markdown = [
    "Price $5 and $10 stays currency.",
    "Whitespace $ x $ stays text.",
    "Escaped \\$value stays text.",
    "`$single code$` and ``$double code$`` stay code.",
    "Valid $x + 1$ remains math.",
  ].join("\n");

  assert.deepEqual(scanMarkdownMath(markdown).map(({ content, kind }) => ({ content, kind })), [
    { content: "x + 1", kind: "inline" },
  ]);
});

test("renders self-contained MathJax SVG in HTML export", () => {
  const html = renderMarkdownBody("Euler: \\(e^{i\\pi}+1=0\\)\n\n\\[\\frac{1}{2}\\]");
  assert.match(html, /class="MathJax"/);
  assert.match(html, /jax="SVG"/);
  assert.match(html, /<svg/);
  assert.match(html, /display="true"/);
  assert.match(renderMathToHtml("\\sqrt{x}", false), /class="MathJax"/);
  assert.doesNotMatch(html, /class="katex"/);
});

test("keeps sans-serif math rendering stable across consecutive documents", () => {
  const first = renderMarkdownMath("\\[\\boldsymbol{J}^{\\mathsf{T}}\\boldsymbol{r}\\]");
  const second = renderMarkdownMath("\\[\\boldsymbol{H}=\\boldsymbol{J}^{\\mathsf{T}}\\boldsymbol{J}\\]");

  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.match(first[0].html, /class="MathJax"/);
  assert.match(second[0].html, /class="MathJax"/);
  assert.doesNotMatch(first[0].html, /serein-math-error/);
  assert.doesNotMatch(second[0].html, /serein-math-error/);
});

test("supports the bm package command used by generated scientific LaTeX", () => {
  const inline = renderMathToHtml("\\bm P_0", false);
  const equation = renderMarkdownMath([
    "\\begin{equation}",
    "\\bm L(t)=(1-t)\\bm P_0+t\\bm P_1.",
    "\\end{equation}",
  ].join("\n"));

  assert.match(inline, /class="MathJax"/);
  assert.doesNotMatch(inline, /serein-math-error/);
  assert.equal(equation.length, 1);
  assert.match(equation[0].html, /class="MathJax"/);
  assert.doesNotMatch(equation[0].html, /serein-math-error/);
});

test("renders calligraphic trust-root symbols without invalid SVG dimensions", () => {
  const rendered = renderMarkdownMath([
    "考虑信任根 $\\mathcal{CA}$、策略点 $\\mathcal{PDP}$、",
    "执行点 $\\mathcal{PEP}$ 和审计节点 $\\mathcal A$。",
  ].join("\n"));

  assert.equal(rendered.length, 4);
  for (const span of rendered) {
    assert.match(span.html, /class="MathJax"/);
    assert.doesNotMatch(span.html, /serein-math-error|NaN/);
  }
});

test("extracts preamble newcommands and applies them across later formulas", () => {
  const source = [
    "\\documentclass{article}",
    "\\newcommand{\\Hash}[1]{\\mathsf{H}\\left(#1\\right)}",
    "\\newcommand{\\concat}{\\mathbin{\\|}}",
    "\\begin{document}",
    "Inline $\\Hash{x}$.",
    "\\begin{equation}",
    "y=\\Hash{x\\concat z}",
    "\\end{equation}",
    "\\end{document}",
  ].join("\n");

  const definitions = extractLatexMathMacroDefinitions(source);
  assert.match(definitions, /\\newcommand\{\\Hash}/);
  assert.match(definitions, /\\newcommand\{\\concat}/);
  const rendered = renderMarkdownMath(source);
  assert.equal(rendered.length, 2);
  assert.ok(rendered.every((span) => !/serein-math-error|NaN/.test(span.html)));
});

test("keeps block equation source lines separate from surrounding Setext syntax", () => {
  const markdown = [
    "\\begin{equation}",
    "\\sigma_i^{att}",
    "=",
    "\\Sign_{sk_i}(m_i)",
    "\\end{equation}",
  ].join("\n");
  const [span] = scanMarkdownMath(markdown);
  assert.equal(span?.kind, "block");
  const lines = markdown.split("\n");
  let offset = 0;
  for (const line of lines) {
    const from = offset;
    const to = from + line.length;
    assert.ok(span && from >= span.from && to <= span.to);
    offset = to + 1;
  }
});

test("renders complete nonlinear, Bezier, and structural LaTeX fixtures without math errors", () => {
  const fixtures = [
    ["nonlinear-least-squares.tex", 8],
    ["bezier-curves.tex", 9],
    ["scientific-structures.tex", 7],
  ];

  for (const [fixtureName, minimumMathCount] of fixtures) {
    const normalized = normalizeLatexDocumentForExport(readLatexFixture(fixtureName));
    const rendered = renderMarkdownMath(normalized);
    assert.ok(rendered.length >= minimumMathCount, `${fixtureName} math count`);
    assert.ok(
      rendered.every((span) => !span.html.includes("serein-math-error")),
      `${fixtureName} contains invalid rendered math`,
    );
  }
});

test("scans the supported outer SCI equation environments", () => {
  const environments = [
    { name: "equation", opener: "\\begin{equation}", body: "a = b" },
    { name: "equation*", opener: "\\begin{equation*}", body: "a = b" },
    { name: "align", opener: "\\begin{align}", body: "a &= b \\\\ c &= d" },
    { name: "align*", opener: "\\begin{align*}", body: "a &= b \\\\ c &= d" },
    { name: "alignat", opener: "\\begin{alignat}{2}", body: "a &= b & c &= d" },
    { name: "alignat*", opener: "\\begin{alignat*}{2}", body: "a &= b & c &= d" },
    { name: "flalign", opener: "\\begin{flalign}", body: "a &= b &&" },
    { name: "flalign*", opener: "\\begin{flalign*}", body: "a &= b &&" },
    { name: "multline", opener: "\\begin{multline}", body: "a + b \\\\ + c" },
    { name: "multline*", opener: "\\begin{multline*}", body: "a + b \\\\ + c" },
    { name: "gather", opener: "\\begin{gather}", body: "a = b \\\\ c = d" },
    { name: "gather*", opener: "\\begin{gather*}", body: "a = b \\\\ c = d" },
    {
      name: "subequations",
      opener: "\\begin{subequations}",
      body: "\\begin{align}\na &= b \\\\ c &= d\n\\end{align}",
    },
  ];
  const markdown = environments
    .map(({ name, opener, body }) => `${opener}\n${body}\n\\end{${name}}`)
    .join("\n\n");

  const spans = scanMarkdownMath(markdown);
  assert.deepEqual(spans.map((span) => span.environment), environments.map(({ name }) => name));
  assert.ok(spans.every((span) => span.kind === "block"));
  const rendered = renderMarkdownMath(markdown);
  assert.equal(rendered.length, environments.length);
  assert.ok(rendered.every((span) => /class="MathJax"/.test(span.html)));
  assert.ok(rendered.every((span) => !/serein-math-error/.test(span.html)));
});

test("renders common AMS inner environments and matrix families", () => {
  const markdown = [
    "\\[",
    "\\begin{aligned}",
    "a &= b + c, \\\\",
    "d &= e + f.",
    "\\end{aligned}",
    "\\]",
    "",
    "\\begin{equation}",
    "\\begin{split}",
    "F(x) &= a + b \\\\",
    "&= c + d.",
    "\\end{split}",
    "\\end{equation}",
    "",
    "\\[",
    "f(x)=\\begin{cases}x^2, & x \\geq 0, \\\\ -x, & x < 0.\\end{cases}",
    "\\]",
    "",
    "\\[",
    "\\boldsymbol{\\theta}\\in\\mathbb{R}^n,\\quad\\mathfrak{g},\\quad",
    "\\begin{matrix}a&b\\\\c&d\\end{matrix}\\quad",
    "\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}\\quad",
    "\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}\\quad",
    "\\begin{vmatrix}a&b\\\\c&d\\end{vmatrix}\\quad",
    "\\begin{Vmatrix}a&b\\\\c&d\\end{Vmatrix}\\quad",
    "\\begin{Bmatrix}a&b\\\\c&d\\end{Bmatrix}",
    "\\]",
  ].join("\n");

  const rendered = renderMarkdownMath(markdown);
  assert.equal(rendered.length, 4);
  assert.ok(rendered.every((span) => /class="MathJax"/.test(span.html)));
  assert.ok(rendered.every((span) => !/serein-math-error/.test(span.html)));
});

test("keeps equation numbering and forward/backward references continuous", () => {
  const html = renderMarkdownBody([
    "Forward \\eqref{eq:second}.",
    "",
    "\\begin{equation}",
    "a=1\\label{eq:first}",
    "\\end{equation}",
    "",
    "Backward \\eqref{eq:first}.",
    "",
    "\\begin{align}",
    "c &= d \\notag \\\\",
    "e &= f\\label{eq:second}",
    "\\end{align}",
  ].join("\n"));

  assert.doesNotMatch(html, /serein-math-error/);
  assert.match(html, /id="mjx-eqn:eq:first"/);
  assert.match(html, /id="mjx-eqn:eq:second"/);
  assert.match(html, /href="#mjx-eqn%3Aeq%3Asecond"/);
  assert.match(html, /href="#mjx-eqn%3Aeq%3Afirst"/);
  assert.match(html, /data-latex="\\text\{1\}"/);
  assert.match(html, /data-latex="\\text\{2\}"/);
});

test("supports subequations parent and child references before continuing numbering", () => {
  const html = renderMarkdownBody([
    "\\begin{subequations}",
    "\\label{eq:system}",
    "\\begin{align}",
    "a &= b\\label{eq:a} \\\\",
    "c &= d\\label{eq:b}",
    "\\end{align}",
    "\\end{subequations}",
    "",
    "Refs \\eqref{eq:system}, \\eqref{eq:a}, and \\eqref{eq:b}.",
    "",
    "\\begin{equation}",
    "e=f\\label{eq:next}",
    "\\end{equation}",
  ].join("\n"));

  assert.doesNotMatch(html, /serein-math-error/);
  assert.match(html, /id="mjx-eqn:eq:system"/);
  assert.match(html, /id="mjx-eqn:eq:a"/);
  assert.match(html, /id="mjx-eqn:eq:b"/);
  assert.match(html, /id="mjx-eqn:eq:next"/);
  assert.match(html, /href="#mjx-eqn%3Aeq%3Asystem"/);
  assert.match(html, /data-latex="\\text\{1a\}"/);
  assert.match(html, /data-latex="\\text\{1b\}"/);
  assert.match(html, /data-latex="\\text\{2\}"/);
});

test("supports manual tags and rejects deprecated eqnarray", () => {
  const tagged = renderMarkdownBody([
    "\\begin{equation}",
    "E=mc^2",
    "\\tag{A.1}",
    "\\end{equation}",
  ].join("\n"));
  assert.match(tagged, /data-latex="\\text\{A\.1\}"/);
  assert.doesNotMatch(tagged, /serein-math-error/);

  const deprecated = renderMathToHtml("\\begin{eqnarray}a&=&b\\end{eqnarray}", true);
  assert.match(deprecated, /class="serein-math-error"/);
  assert.doesNotMatch(deprecated, /class="MathJax"/);
});

test("falls back to visible escaped source for invalid LaTeX", () => {
  const html = renderMathToHtml("\\frac{", false);
  assert.match(html, /class="serein-math-error"/);
  assert.match(html, /\\frac\{/);
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
