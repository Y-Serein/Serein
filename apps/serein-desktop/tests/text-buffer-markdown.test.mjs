import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { markdown as markdownSupport, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import {
  analyzeTextBufferMarkdown,
  deleteTextBufferTableColumn,
  deleteTextBufferTableRow,
  insertTextBufferTableColumn,
  insertTextBufferTableRow,
  isTextBufferCodeBlockBlank,
  isTextBufferCodeBlockEmpty,
  isTextBufferCodeBlockPhysicalLastLine,
  moveTextBufferTableColumn,
  moveTextBufferTableRow,
  nextTextBufferTableAlignment,
  normalizeTextBufferCodeBlockSelectionText,
  normalizeTextBufferTable,
  scanTextBufferInlineLinks,
  scanTextBufferInlineLinksFromSyntaxTree,
  scanTextBufferTables,
  scanTextBufferTablesFromSyntaxTree,
  serializeTextBufferTable,
  setTextBufferTableAlignment,
  shouldExitTextBufferCodeBlockOnEnter,
  stripTextBufferContainerPrefix,
  textBufferCodeBlockContentRange,
  textBufferCodeBlockReplacementText,
  textBufferSafeCutRanges,
  textBufferSmartSelectAllRange,
  textBufferVisibleClipboardRanges,
} from "../.test-dist/editor/textBufferMarkdown.js";

function analyze(markdown, options) {
  const state = EditorState.create({
    doc: markdown,
    extensions: [markdownSupport({ base: markdownLanguage })],
  });
  return analyzeTextBufferMarkdown(markdown, syntaxTree(state), options);
}

function kinds(markdown) {
  return analyze(markdown).lines.map((line) => line.kind);
}

function syntaxLinks(markdown) {
  const state = EditorState.create({
    doc: markdown,
    extensions: [markdownSupport({ base: markdownLanguage })],
  });
  return scanTextBufferInlineLinksFromSyntaxTree(markdown, syntaxTree(state));
}

function syntaxTables(markdown) {
  const state = EditorState.create({
    doc: markdown,
    extensions: [markdownSupport({ base: markdownLanguage })],
  });
  return scanTextBufferTablesFromSyntaxTree(markdown, syntaxTree(state));
}

test("does not let an unclosed typed fence consume the rest of the document", () => {
  const markdown = [
    "# Title",
    "```bash",
    "echo still ordinary while typing",
    "## Still a heading",
  ].join("\n");

  const analysis = analyze(markdown);
  assert.deepEqual(analysis.lines.map((line) => ({
    kind: line.kind,
    fenceStatus: line.fenceStatus,
    headingLevel: line.headingLevel,
  })), [
    { kind: "heading", fenceStatus: undefined, headingLevel: 1 },
    { kind: "codeFence", fenceStatus: "pending", headingLevel: undefined },
    { kind: "paragraph", fenceStatus: undefined, headingLevel: undefined },
    { kind: "heading", fenceStatus: undefined, headingLevel: 2 },
  ]);
  assert.deepEqual(analysis.lines[1].richHiddenRanges, []);
});

test("does not classify empty inline backticks as a fenced code block", () => {
  const analysis = analyze("``");
  assert.equal(analysis.codeBlocks.length, 0);
  assert.equal(analysis.lines[0].kind, "paragraph");
});

test("distinguishes an editable blank code line from code content", () => {
  const markdown = "```bash\n\n```";
  const block = analyze(markdown).codeBlocks[0];
  assert.ok(block);
  assert.equal(isTextBufferCodeBlockEmpty(block), false);
  assert.equal(isTextBufferCodeBlockBlank(markdown, block), true);

  const contentMarkdown = "```bash\necho fictional\n```";
  const contentBlock = analyze(contentMarkdown).codeBlocks[0];
  assert.equal(isTextBufferCodeBlockBlank(contentMarkdown, contentBlock), false);
});

test("keeps a newly typed fence pending instead of pairing with a later code block closer", () => {
  const markdown = [
    "```",
    "# Fictional heading",
    "fictional body",
    "",
    "```bash",
    "printf test",
    "```",
  ].join("\n");
  const analysis = analyzeTextBufferMarkdown(markdown, undefined, { pendingFenceLines: new Set([0]) });

  assert.equal(analysis.codeBlocks.length, 1);
  assert.equal(analysis.lines[0].fenceStatus, "pending");
  assert.equal(analysis.lines[0].richHiddenRanges.length, 0);
  assert.equal(analysis.lines[1].kind, "heading");
  assert.equal(analysis.lines[4].fenceStatus, "closed");
});

test("matches fenced code blocks by marker character and marker length", () => {
  const markdown = [
    "````markdown",
    "```bash",
    "echo nested sample",
    "```",
    "````",
    "# After",
  ].join("\n");

  assert.deepEqual(kinds(markdown), [
    "codeFence",
    "code",
    "code",
    "code",
    "codeFence",
    "heading",
  ]);
});

test("does not close a longer fence with a shorter fence", () => {
  const markdown = [
    "````bash",
    "inside",
    "```",
    "# still code",
    "````",
    "# After",
  ].join("\n");

  assert.deepEqual(kinds(markdown), [
    "codeFence",
    "code",
    "code",
    "code",
    "codeFence",
    "heading",
  ]);
});

test("marks rich-preview syntax ranges for headings and complete fences", () => {
  const markdown = [
    "# Title",
    "",
    "```bash",
    "echo ok",
    "```",
  ].join("\n");
  const { lines } = analyze(markdown);

  assert.deepEqual(lines[0].richHiddenRanges, [{ from: 0, to: 2 }]);
  assert.equal(lines[2].kind, "codeFence");
  assert.deepEqual(lines[2].richHiddenRanges, [{ from: 9, to: 16 }]);
  assert.equal(lines[3].kind, "code");
  assert.deepEqual(lines[4].richHiddenRanges, [{ from: 25, to: 28 }]);
});

test("keeps source markers as hideable ranges for rich preview", () => {
  const markdown = [
    "# Title",
    "## Usage",
    "### Details",
    "```bash",
    "echo ok",
    "```",
  ].join("\n");
  const { lines } = analyze(markdown);

  assert.deepEqual(lines.map((line) => line.kind), [
    "heading",
    "heading",
    "heading",
    "codeFence",
    "code",
    "codeFence",
  ]);
  assert.deepEqual(lines[0].richHiddenRanges, [{ from: 0, to: 2 }]);
  assert.deepEqual(lines[1].richHiddenRanges, [{ from: 8, to: 11 }]);
  assert.deepEqual(lines[2].richHiddenRanges, [{ from: 17, to: 21 }]);
  assert.deepEqual(lines[3].richHiddenRanges, [{ from: 29, to: 36 }]);
  assert.deepEqual(lines[5].richHiddenRanges, [{ from: 45, to: 48 }]);
});

test("handles README-style nested fenced examples without leaking into following headings", () => {
  const markdown = readFileSync(new URL("./fixtures/text-buffer-markdown/readme-fences.md", import.meta.url), "utf8").trimEnd();
  const { lines } = analyze(markdown);
  const afterNested = lines.find((line) => line.text === "## After nested example");
  const usage = lines.find((line) => line.text === "## Usage");
  const innerFence = lines.find((line) => line.text === "```bash");

  assert.equal(afterNested?.kind, "heading");
  assert.equal(afterNested?.headingLevel, 2);
  assert.equal(usage?.kind, "heading");
  assert.equal(usage?.headingLevel, 2);
  assert.equal(innerFence?.kind, "code");
});

test("marks list and blockquote source prefixes as hideable in rich preview", () => {
  const markdown = [
    "> quoted",
    "- bullet",
    "",
    "12. ordered",
  ].join("\n");
  const { lines } = analyze(markdown);

  assert.equal(lines[0].kind, "blockquote");
  assert.deepEqual(lines[0].richHiddenRanges, [{ from: 0, to: 2 }]);
  assert.equal(lines[1].kind, "list");
  assert.equal(lines[1].listKind, "bullet");
  assert.equal(lines[1].listMarker, "-");
  assert.deepEqual(lines[1].richHiddenRanges, [{ from: 9, to: 11 }]);
  assert.equal(lines[3].kind, "list");
  assert.equal(lines[3].listKind, "ordered");
  assert.equal(lines[3].listMarker, "12.");
  assert.deepEqual(lines[3].richHiddenRanges, [{ from: 19, to: 23 }]);
});

test("preserves each unordered list marker identity", () => {
  const markdown = [
    "- dash item",
    "",
    "* star item",
    "",
    "+ plus item",
  ].join("\n");
  const { lines } = analyze(markdown);
  const listLines = lines.filter((line) => line.kind === "list");

  assert.deepEqual(listLines.map((line) => line.listMarker), ["-", "*", "+"]);
});

test("builds continuous rich presentation metadata for quote and list continuations", () => {
  const markdown = [
    "> first quote",
    "> second quote",
    "lazy quote continuation",
    "",
    "- first item",
    "  lazy list continuation",
    "  - nested item",
  ].join("\n");
  const { lines } = analyze(markdown);

  assert.deepEqual(lines.slice(0, 3).map((line) => ({
    quoteDepth: line.richQuoteDepth,
    quoteStart: line.richQuoteStart,
    quoteEnd: line.richQuoteEnd,
  })), [
    { quoteDepth: 1, quoteStart: true, quoteEnd: false },
    { quoteDepth: 1, quoteStart: false, quoteEnd: false },
    { quoteDepth: 1, quoteStart: false, quoteEnd: true },
  ]);
  assert.equal(lines[4].richListDepth, 1);
  assert.equal(lines[4].richListContinuation, false);
  assert.equal(lines[5].richListDepth, 1);
  assert.equal(lines[5].richListContinuation, true);
  assert.equal(lines[6].richListDepth, 2);
  assert.equal(lines[6].richListContinuation, false);

  const quoteListLines = analyze(["> - quoted item", ">   quoted continuation"].join("\n")).lines;
  assert.equal(quoteListLines[0].richListDepth, 1);
  assert.equal(quoteListLines[1].richListDepth, 1);
  assert.equal(quoteListLines[1].richListContinuation, true);
});

test("lets the markdown syntax tree own lazy list continuation semantics", () => {
  const markdown = [
    "- bullet",
    "12. ordered-looking continuation",
  ].join("\n");
  const { lines } = analyze(markdown);

  assert.equal(lines[0].kind, "list");
  assert.equal(lines[1].kind, "paragraph");
  assert.deepEqual(lines[1].richHiddenRanges, []);
});

test("scans markdown links with parentheses and escaped labels", () => {
  const links = scanTextBufferInlineLinks("[NUT\\(7\\)](https://example.com/a(b)c) and <https://www.improv-wifi.com>", 10);

  assert.equal(links.length, 2);
  assert.equal(links[0].kind, "markdown");
  assert.equal(links[0].href, "https://example.com/a(b)c");
  assert.equal(links[0].labelFrom, 11);
  assert.equal(links[0].labelTo, 19);
  assert.equal(links[1].kind, "autolink");
  assert.equal(links[1].href, "https://www.improv-wifi.com");
});

test("scans inline links from the CodeMirror markdown syntax tree", () => {
  const markdown = [
    "[NUT\\(7\\)](https://example.com/a(b)c)",
    "![Alt text](<./image space.png> \"title\")",
    "<mailto:a@example.com>",
    "[ref][id]",
    "",
    "[id]: https://reference.example.com",
  ].join("\n");
  const links = syntaxLinks(markdown);

  assert.equal(links.length, 3);
  assert.equal(links[0].kind, "markdown");
  assert.equal(links[0].image, false);
  assert.equal(markdown.slice(links[0].labelFrom, links[0].labelTo), "NUT\\(7\\)");
  assert.equal(links[0].href, "https://example.com/a(b)c");
  assert.equal(links[1].image, true);
  assert.equal(markdown.slice(links[1].labelFrom, links[1].labelTo), "Alt text");
  assert.equal(links[1].href, "<./image space.png>");
  assert.equal(links[2].kind, "autolink");
  assert.equal(links[2].href, "mailto:a@example.com");
  assert.equal(links.some((link) => link.href === "https://reference.example.com"), false);
});

test("scans pipe tables from the CodeMirror markdown syntax tree", () => {
  const markdown = [
    "| A | B |",
    "| :--- | ---: |",
    "| 1 | 2 |",
    "| escaped \\| pipe | x |",
    "",
    "not table",
  ].join("\n");
  const tables = syntaxTables(markdown);

  assert.equal(tables.length, 1);
  assert.equal(tables[0].from, 0);
  assert.equal(tables[0].to, markdown.indexOf("\n\nnot table"));
  assert.deepEqual(tables[0].alignments, ["left", "right"]);
  assert.deepEqual(tables[0].rows, [
    ["A", "B"],
    ["1", "2"],
    ["escaped | pipe", "x"],
  ]);
});

test("tracks fenced code block coordinates and language", () => {
  const markdown = [
    "```bash",
    "echo ok",
    "```",
  ].join("\n");
  const { lines, codeBlocks } = analyze(markdown);

  assert.equal(codeBlocks.length, 1);
  assert.equal(codeBlocks[0].language, "bash");
  assert.equal(codeBlocks[0].languageFrom, 3);
  assert.equal(codeBlocks[0].languageTo, 7);
  assert.equal(codeBlocks[0].firstContentLine, 2);
  assert.equal(codeBlocks[0].lastContentLine, 2);
  assert.equal(lines[1].codeBlockId, 0);
});

test("selects code content first and the whole document on the second select-all", () => {
  const markdown = [
    "before",
    "```bash",
    "echo alpha",
    "echo beta",
    "```",
    "after",
  ].join("\n");
  const analysis = analyze(markdown);
  const block = analysis.codeBlocks[0];

  const codeRange = textBufferSmartSelectAllRange(markdown, analysis, {
    from: block.contentFrom,
    to: block.contentFrom,
    head: block.contentFrom,
  });
  assert.equal(markdown.slice(codeRange.from, codeRange.to), "echo alpha\necho beta");

  const documentRange = textBufferSmartSelectAllRange(markdown, analysis, {
    ...codeRange,
    head: codeRange.to,
  });
  assert.deepEqual(documentRange, { from: 0, to: markdown.length });
});

test("selects the current Markdown semantic line before the whole document", () => {
  const markdown = [
    "# Heading",
    "",
    "paragraph text",
    "",
    "- list item",
    "",
    "> quoted text",
    "",
    "Setext heading",
    "--------------",
  ].join("\n");
  const analysis = analyze(markdown);

  const cases = [
    { needle: "Heading", selected: "Heading" },
    { needle: "paragraph", selected: "paragraph text" },
    { needle: "list item", selected: "list item" },
    { needle: "quoted text", selected: "quoted text" },
    { needle: "Setext heading", selected: "Setext heading" },
  ];

  for (const item of cases) {
    const head = markdown.indexOf(item.needle);
    const scoped = textBufferSmartSelectAllRange(markdown, analysis, {
      from: head,
      to: head,
      head,
    });
    assert.equal(markdown.slice(scoped.from, scoped.to), item.selected);
    assert.deepEqual(
      textBufferSmartSelectAllRange(markdown, analysis, { ...scoped, head: scoped.to }),
      { from: 0, to: markdown.length },
    );
  }
});

test("keeps Markdown structure when replacing the first semantic selection", () => {
  const cases = [
    {
      markdown: "# Heading\n\nbody",
      needle: "Heading",
      replacement: "Renamed",
      expected: "# Renamed\n\nbody",
      expectedKind: "heading",
    },
    {
      markdown: "* list item\n\nafter",
      needle: "list item",
      replacement: "renamed",
      expected: "* renamed\n\nafter",
      expectedKind: "list",
      expectedMarker: "*",
    },
    {
      markdown: "> quoted text\n\nafter",
      needle: "quoted text",
      replacement: "renamed",
      expected: "> renamed\n\nafter",
      expectedKind: "blockquote",
    },
    {
      markdown: "Setext heading\n==============\n\nbody",
      needle: "Setext heading",
      replacement: "Renamed",
      expected: "Renamed\n==============\n\nbody",
      expectedKind: "heading",
    },
  ];

  for (const item of cases) {
    const analysis = analyze(item.markdown);
    const head = item.markdown.indexOf(item.needle);
    const range = textBufferSmartSelectAllRange(item.markdown, analysis, {
      from: head,
      to: head,
      head,
    });
    const nextMarkdown = `${item.markdown.slice(0, range.from)}${item.replacement}${item.markdown.slice(range.to)}`;

    assert.equal(nextMarkdown, item.expected);
    const replacedLine = analyze(nextMarkdown).lines.find((line) => line.text.includes(item.replacement));
    assert.equal(replacedLine?.kind, item.expectedKind);
    if (item.expectedMarker) assert.equal(replacedLine?.listMarker, item.expectedMarker);
  }
});

test("keeps the first select-all scoped to an empty semantic line", () => {
  const markdown = "before\n\nafter";
  const analysis = analyze(markdown);
  const emptyLine = analysis.lines[1];
  assert.deepEqual(
    textBufferSmartSelectAllRange(markdown, analysis, {
      from: emptyLine.from,
      to: emptyLine.from,
      head: emptyLine.from,
    }),
    { from: emptyLine.from, to: emptyLine.from },
  );
});

test("keeps the first select-all scoped to an empty code block", () => {
  const markdown = [
    "before",
    "```bash",
    "",
    "```",
    "after",
  ].join("\n");
  const analysis = analyze(markdown);
  const block = analysis.codeBlocks[0];
  const codeRange = textBufferSmartSelectAllRange(markdown, analysis, {
    from: block.contentFrom,
    to: block.contentFrom,
    head: block.contentFrom,
  });

  assert.deepEqual(codeRange, { from: block.contentFrom, to: block.contentFrom });
});

test("does not skip a trailing blank code line when navigating down", () => {
  const markdown = [
    "```bash",
    "EOF",
    "",
    "```",
  ].join("\n");
  const analysis = analyze(markdown);
  const block = analysis.codeBlocks[0];
  const eofLine = analysis.lines.find((line) => line.text === "EOF");
  const blankLine = analysis.lines.find((line) => line.number === block.lastContentLine);

  assert.equal(isTextBufferCodeBlockPhysicalLastLine(block, eofLine.number), false);
  assert.equal(isTextBufferCodeBlockPhysicalLastLine(block, blankLine.number), true);
});

test("recognizes blockquote-contained fenced code blocks", () => {
  const markdown = [
    "> ```bash",
    "> echo ok",
    "> ```",
    "after",
  ].join("\n");
  const { lines, codeBlocks } = analyze(markdown);

  assert.equal(codeBlocks.length, 1);
  assert.equal(codeBlocks[0].language, "bash");
  assert.deepEqual(lines.map((line) => line.kind), [
    "codeFence",
    "code",
    "codeFence",
    "paragraph",
  ]);
});

test("keeps deeply indented blockquote fences as fenced code for existing documents", () => {
  const markdown = [
    ">     ```bash",
    ">     echo ok",
    ">     ```",
    "after",
  ].join("\n");
  const { lines, codeBlocks } = analyze(markdown);

  assert.equal(codeBlocks.length, 1);
  assert.equal(codeBlocks[0].language, "bash");
  assert.deepEqual(lines.map((line) => line.kind), [
    "codeFence",
    "code",
    "codeFence",
    "paragraph",
  ]);
  assert.equal(markdown.slice(lines[1].richHiddenRanges[0].from, lines[1].richHiddenRanges[0].to), ">     ");
});

test("keeps deeply indented list fences as fenced code for existing documents", () => {
  const markdown = [
    "- Flow",
    "      ```bash",
    "      echo ok",
    "      ```",
    "after",
  ].join("\n");
  const { lines, codeBlocks } = analyze(markdown);

  assert.equal(codeBlocks.length, 1);
  assert.equal(codeBlocks[0].language, "bash");
  assert.deepEqual(lines.map((line) => line.kind), [
    "list",
    "codeFence",
    "code",
    "codeFence",
    "paragraph",
  ]);
  assert.equal(markdown.slice(lines[2].richHiddenRanges[0].from, lines[2].richHiddenRanges[0].to), "      ");
});

test("does not reinterpret a multiline inline-code closer with preceding text as a fence", () => {
  const markdown = [
    "- Flow",
    "      ```bash",
    "      echo ok",
    "      trailing ```",
  ].join("\n");
  const { codeBlocks } = analyze(markdown);

  assert.equal(codeBlocks.length, 0);
});

test("does not reinterpret a multiline inline-code closer with trailing text as a fence", () => {
  const markdown = [
    "- Flow",
    "      ```bash",
    "      echo ok",
    "      ``` trailing",
  ].join("\n");
  const { codeBlocks } = analyze(markdown);

  assert.equal(codeBlocks.length, 0);
});

test("recognizes list-contained fenced code blocks at document end", () => {
  const markdown = [
    "- item",
    "  ```bash",
    "  echo ok",
    "  ```",
  ].join("\n");
  const { lines, codeBlocks } = analyze(markdown);

  assert.equal(codeBlocks.length, 1);
  assert.equal(codeBlocks[0].language, "bash");
  assert.equal(codeBlocks[0].lastContentLine, 3);
  assert.deepEqual(lines.map((line) => line.kind), [
    "list",
    "codeFence",
    "code",
    "codeFence",
  ]);
  assert.deepEqual(lines[2].richHiddenRanges, [{ from: 17, to: 19 }]);
});

test("recognizes nested quote/list fenced code without swallowing following text", () => {
  const markdown = [
    "> - item",
    ">   ```bash",
    ">   echo ok",
    ">   ```",
    "> after quote",
    "",
    "## After",
  ].join("\n");
  const { lines, codeBlocks } = analyze(markdown);

  assert.equal(codeBlocks.length, 1);
  assert.equal(codeBlocks[0].language, "bash");
  assert.deepEqual(lines.map((line) => line.kind), [
    "blockquote",
    "codeFence",
    "code",
    "codeFence",
    "blockquote",
    "paragraph",
    "heading",
  ]);
  assert.deepEqual(lines[2].richHiddenRanges, [{ from: 21, to: 25 }]);
  assert.equal(lines.at(-1)?.headingLevel, 2);
});

test("keeps pending nested fences local to the opener line", () => {
  const markdown = [
    "> - ```bash",
    "> - not code while user is still typing",
    "## After",
  ].join("\n");
  const { lines, codeBlocks } = analyze(markdown);

  assert.equal(codeBlocks.length, 0);
  assert.deepEqual(lines.map((line) => line.kind), [
    "codeFence",
    "blockquote",
    "heading",
  ]);
  assert.equal(lines[0].fenceStatus, "pending");
  assert.equal(lines[2].headingLevel, 2);
});

test("strips nested markdown container prefixes for empty-line exits", () => {
  assert.equal(stripTextBufferContainerPrefix("> "), "");
  assert.equal(stripTextBufferContainerPrefix("> - "), "");
  assert.equal(stripTextBufferContainerPrefix("> 1. "), "");
  assert.equal(stripTextBufferContainerPrefix("  - > "), "");
  assert.equal(stripTextBufferContainerPrefix(">   ```bash"), "  ```bash");
  assert.equal(stripTextBufferContainerPrefix(">   ").trim(), "");
  assert.equal(stripTextBufferContainerPrefix("> - still here"), "still here");
});

test("recognizes the real NanoUPS list quote fenced-code structure", () => {
  const markdown = [
    "## 4. ESPHome",
    "",
    "* 流程",
    "",
    "  > ```bash",
    "  > # 下载cd mosquitto-Powershell",
    "  >",
    "  > cd \"C:\\Program Files\\mosquitto\"",
    "  > .\\mosquitto.exe -v",
    "  >",
    "  > listener 1883",
    "  > allow_anonymous true",
    "  > ```",
    "",
    "* ble",
  ].join("\n");
  const { lines, codeBlocks } = analyze(markdown);

  assert.equal(codeBlocks.length, 1);
  assert.equal(codeBlocks[0].language, "bash");
  assert.equal(codeBlocks[0].containerPrefix, "  > ");
  assert.equal(codeBlocks[0].containerIndentLevel, 1);
  assert.equal(codeBlocks[0].containerQuoteDepth, 1);
  assert.equal(lines.find((line) => line.text.includes("listener 1883"))?.kind, "code");
  assert.equal(lines.find((line) => line.text === "* ble")?.kind, "list");

  const deterministic = analyzeTextBufferMarkdown(markdown);
  assert.equal(deterministic.codeBlocks.length, 1);
  assert.equal(deterministic.codeBlocks[0].containerPrefix, "  > ");
  const quotedBlankLines = deterministic.lines.filter((line) => line.text === "  >");
  assert.ok(quotedBlankLines.length > 0);
  assert.ok(quotedBlankLines.every((line) => line.richHiddenRanges.some((range) => (
    range.from === line.from && range.to === line.to
  ))));
});

test("keeps nested code containers valid when replacing the smart-select range", () => {
  const markdown = [
    "* Flow",
    "",
    "  > ```bash",
    "  > echo one",
    "  > echo two",
    "  > ```",
    "after",
  ].join("\n");
  const analysis = analyze(markdown);
  const block = analysis.codeBlocks[0];
  const range = textBufferCodeBlockContentRange(markdown, analysis, block);

  assert.equal(
    normalizeTextBufferCodeBlockSelectionText(markdown.slice(range.from, range.to), block),
    "echo one\necho two",
  );

  const replacement = textBufferCodeBlockReplacementText("alpha\nbeta", block);
  const nextMarkdown = `${markdown.slice(0, range.from)}${replacement}${markdown.slice(range.to)}`;
  const nextAnalysis = analyze(nextMarkdown);
  assert.equal(nextAnalysis.codeBlocks.length, 1);
  assert.equal(nextAnalysis.lines.find((line) => line.text === "  > alpha")?.kind, "code");
  assert.equal(nextAnalysis.lines.find((line) => line.text === "  > beta")?.kind, "code");
  assert.equal(nextAnalysis.lines.at(-1)?.text, "after");
});

test("removes unmatched hidden fences from partial Rich clipboard selections", () => {
  const markdown = [
    "before",
    "```plain",
    "alpha",
    "beta",
    "```",
    "",
    "after",
  ].join("\n");
  const analysis = analyze(markdown);
  const selection = {
    from: markdown.indexOf("beta"),
    to: markdown.indexOf("after") + 3,
  };
  const ranges = textBufferVisibleClipboardRanges(markdown, analysis, selection);
  assert.equal(
    ranges.map((range) => markdown.slice(range.from, range.to)).join(""),
    "beta\n\naft",
  );
  assert.equal(ranges.length, 2);
});

test("keeps matched fences when the complete code block is selected", () => {
  const markdown = [
    "before",
    "```plain",
    "alpha",
    "beta",
    "```",
    "after",
  ].join("\n");
  const analysis = analyze(markdown);
  const block = analysis.codeBlocks[0];
  const ranges = textBufferVisibleClipboardRanges(markdown, analysis, {
    from: block.from,
    to: block.to,
  });
  assert.deepEqual(ranges, [{ from: block.from, to: block.to }]);
  assert.equal(markdown.slice(ranges[0].from, ranges[0].to), "```plain\nalpha\nbeta\n```");
});

test("keeps one structural newline when cutting through the hidden closing fence", () => {
  const markdown = [
    "```plain",
    "alpha",
    "beta",
    "```",
    "",
    "after",
  ].join("\n");
  const analysis = analyze(markdown);
  const selection = {
    from: markdown.indexOf("beta"),
    to: markdown.indexOf("after"),
  };
  const visibleRanges = textBufferVisibleClipboardRanges(markdown, analysis, selection);
  const cutRanges = textBufferSafeCutRanges(markdown, analysis, visibleRanges);
  assert.equal(visibleRanges[0].to, analysis.codeBlocks[0].closerFrom);
  assert.equal(cutRanges[0].to, analysis.codeBlocks[0].closerFrom - 1);
  const nextMarkdown = cutRanges.reduceRight((value, range) => (
    `${value.slice(0, range.from)}${value.slice(range.to)}`
  ), markdown);
  assert.match(nextMarkdown, /alpha\n\n```/);
});

test("distinguishes a truly empty adjacent-fence block from a blank content line", () => {
  const adjacent = analyze("```bash\n```");
  const adjacentBlock = adjacent.codeBlocks[0];
  assert.equal(isTextBufferCodeBlockEmpty(adjacentBlock), true);
  assert.deepEqual(
    textBufferCodeBlockContentRange("```bash\n```", adjacent, adjacentBlock),
    { from: adjacentBlock.closerFrom, to: adjacentBlock.closerFrom },
  );

  const blank = analyze("```bash\n\n```");
  assert.equal(isTextBufferCodeBlockEmpty(blank.codeBlocks[0]), false);
});

test("uses the physical last content line for ArrowDown", () => {
  const markdown = [
    "```bash",
    "EOF",
    "",
    "",
    "```",
  ].join("\n");
  const analysis = analyze(markdown);
  const block = analysis.codeBlocks[0];

  assert.equal(isTextBufferCodeBlockPhysicalLastLine(block, 2), false);
  assert.equal(isTextBufferCodeBlockPhysicalLastLine(block, 3), false);
  assert.equal(isTextBufferCodeBlockPhysicalLastLine(block, 4), true);
});

test("restores the established multi-blank-line Enter exit rule", () => {
  const markdown = [
    "```bash",
    "EOF",
    "",
    "",
    "",
    "```",
  ].join("\n");
  const analysis = analyze(markdown);
  const block = analysis.codeBlocks[0];

  assert.equal(shouldExitTextBufferCodeBlockOnEnter(analysis, block, 3), false);
  assert.equal(shouldExitTextBufferCodeBlockOnEnter(analysis, block, 4), false);
  assert.equal(shouldExitTextBufferCodeBlockOnEnter(analysis, block, 5), true);
});

test("marks Setext headings consistently with the outline parser", () => {
  const analysis = analyze("Title\n=====\n\nBody");
  assert.equal(analysis.lines[0].kind, "heading");
  assert.equal(analysis.lines[0].headingLevel, 1);
  assert.equal(analysis.lines[1].hiddenInRich, true);
  const deterministic = analyzeTextBufferMarkdown("Title\n=====\n\nBody");
  assert.equal(deterministic.lines[0].kind, "heading");
  assert.equal(deterministic.lines[1].hiddenInRich, true);
});

test("does not promote list text or a lone dash to a Setext heading", () => {
  for (const markdown of ["- Fictional audio\n-", "Plain text\n-"]) {
    for (const analysis of [analyze(markdown), analyzeTextBufferMarkdown(markdown)]) {
      assert.equal(analysis.lines.some((line) => line.kind === "heading"), false);
    }
  }

  for (const analysis of [analyze("Plain text\n---"), analyzeTextBufferMarkdown("Plain text\n---")]) {
    assert.equal(analysis.lines[0].kind, "heading");
    assert.equal(analysis.lines[0].headingLevel, 2);
  }
});

test("does not reinterpret YAML frontmatter closing fences as Setext headings", () => {
  const markdown = readFileSync(
    new URL("../../../tests/fixtures/rich-edit/Project_03_vibe-keyboard.txt", import.meta.url),
    "utf8",
  ).replace(/\r\n?/g, "\n");

  for (const analysis of [analyze(markdown), analyzeTextBufferMarkdown(markdown)]) {
    const status = analysis.lines.find((line) => line.text === "status: active");
    const closingFence = analysis.lines[4];
    assert.equal(status?.kind, "paragraph");
    assert.equal(status?.headingLevel, undefined);
    assert.equal(closingFence.text, "---");
    assert.equal(closingFence.hiddenInRich, undefined);
  }
});

test("scans links and pipe tables across the full deterministic document", () => {
  const prefix = Array.from({ length: 200 }, (_, index) => (
    `paragraph ${index} [link](./note-${index}.md)`
  )).join("\n\n");
  const markdown = [
    prefix,
    "",
    "| A | B |",
    "| --- | ---: |",
    "| 1 | 2 |",
  ].join("\n");
  const analysis = analyzeTextBufferMarkdown(markdown);

  assert.equal(scanTextBufferInlineLinks(markdown).length, 200);
  const tables = scanTextBufferTables(markdown, analysis);
  assert.equal(tables.length, 1);
  assert.deepEqual(tables[0].rows, [["A", "B"], ["1", "2"]]);
  assert.deepEqual(tables[0].alignments, ["default", "right"]);
});

test("edits pipe table structure without creating a second source of truth", () => {
  const initial = normalizeTextBufferTable({
    rows: [["Name", "Value"], ["alpha", "1"], ["beta", "2"]],
    alignments: ["left", "right"],
  });

  const insertedRow = insertTextBufferTableRow(initial, 1);
  assert.deepEqual(insertedRow.rows, [
    ["Name", "Value"],
    ["alpha", "1"],
    ["", ""],
    ["beta", "2"],
  ]);
  assert.deepEqual(deleteTextBufferTableRow(insertedRow, 2).rows, initial.rows);
  assert.deepEqual(moveTextBufferTableRow(initial, 2, -1).rows.slice(1), [["beta", "2"], ["alpha", "1"]]);

  const insertedColumn = insertTextBufferTableColumn(initial, 0);
  assert.deepEqual(insertedColumn.rows[0], ["Name", "", "Value"]);
  assert.deepEqual(insertedColumn.alignments, ["left", "default", "right"]);
  assert.deepEqual(deleteTextBufferTableColumn(insertedColumn, 1), initial);
  assert.deepEqual(moveTextBufferTableColumn(initial, 1, -1).rows[0], ["Value", "Name"]);
  assert.deepEqual(moveTextBufferTableColumn(initial, 1, -1).alignments, ["right", "left"]);
});

test("cycles and serializes pipe table alignment while preserving escaped pipes", () => {
  assert.equal(nextTextBufferTableAlignment("default"), "left");
  assert.equal(nextTextBufferTableAlignment("left"), "center");
  assert.equal(nextTextBufferTableAlignment("center"), "right");
  assert.equal(nextTextBufferTableAlignment("right"), "default");

  const aligned = setTextBufferTableAlignment({
    rows: [["A|B", "C"], ["1", "2"]],
    alignments: ["default", "default"],
  }, 1, "center");
  assert.equal(serializeTextBufferTable(aligned), [
    "| A\\|B | C |",
    "| --- | :---: |",
    "| 1 | 2 |",
  ].join("\n"));
});
