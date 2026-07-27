import {
  extractLatexMathMacroDefinitions,
  renderMarkdownMath,
  type RenderedMarkdownMathSpan,
} from "../shared/math.js";
import { isMarkdownTableDelimiterCell } from "../shared/markdown.js";
import type { RenderedMermaidBlock } from "../shared/mermaid.js";
import {
  extractLatexDocumentBody,
  normalizeLatexDocumentForExport,
  parseLatexExportStructure,
} from "./latexDocument.js";

export { extractLatexDocumentBody, normalizeLatexDocumentForExport } from "./latexDocument.js";

export type ExportImageMap = Record<string, string>;

export type HtmlExportOptions = {
  title: string;
  imageMap?: ExportImageMap;
  mermaidBlocks?: RenderedMermaidBlock[];
};

type MarkdownRenderContext = {
  mermaidBlocks: RenderedMermaidBlock[];
  mermaidIndex: number;
};

const blockStarters = [
  /^\s{0,3}#{1,6}\s+/,
  /^\s{0,3}(```|~~~)/,
  /^\s{0,3}>\s?/,
  /^\s{0,3}([-+*])\s+(\[[ xX]\]\s+)?/,
  /^\s{0,3}\d+[.)]\s+/,
  /^\s{0,3}\[\^[^\]]+\]:/,
  /^\s{0,3}\$\$/,
  /^\s{0,3}\\\[/,
  /^\u0000SEREIN_LATEX_(?:TITLE|AUTHOR|DATE)\u0000/,
  /^\u0000SEREIN_MATH_BLOCK_\d+\u0000$/,
];

export function htmlDocument(markdown: string, options: HtmlExportOptions) {
  const body = renderMarkdownBody(markdown, options.imageMap ?? {}, options.mermaidBlocks ?? []);
  const title = escapeHtml(options.title || "Serein Export");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>${exportCss()}</style>
</head>
<body>
  <main class="document">${body}</main>
</body>
</html>`;
}

export function renderMarkdownBody(
  markdown: string,
  imageMap: ExportImageMap = {},
  mermaidBlocks: RenderedMermaidBlock[] = [],
) {
  const macroDefinitions = extractLatexMathMacroDefinitions(markdown);
  const normalizedMarkdown = normalizeLatexDocumentForExport(markdown);
  const protectedMath = protectMarkdownMath(normalizedMarkdown, macroDefinitions);
  return renderProtectedMarkdownBody(protectedMath.markdown, imageMap, protectedMath.spans, {
    mermaidBlocks,
    mermaidIndex: 0,
  });
}

function renderProtectedMarkdownBody(
  normalizedMarkdown: string,
  imageMap: ExportImageMap,
  mathSpans: RenderedMarkdownMathSpan[],
  context: MarkdownRenderContext,
) {
  const lines = normalizedMarkdown.split("\n");
  const html: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s{0,3}(```+|~~~+)\s*([^\s`]*)?.*$/);
    if (fence) {
      const marker = fence[1];
      const language = fence[2] ?? "";
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").startsWith(marker)) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) index += 1;
      if (language.trim().toLocaleLowerCase() === "mermaid") {
        const rendered = context.mermaidBlocks[context.mermaidIndex];
        context.mermaidIndex += 1;
        if (rendered?.svg) {
          html.push(`<figure class="mermaid-diagram" aria-label="Mermaid diagram">${rendered.svg}</figure>`);
        } else {
          const error = rendered?.error
            ? `<strong>Mermaid diagram could not be rendered</strong><pre>${escapeHtml(rendered.error)}</pre>`
            : "";
          html.push(`<figure class="mermaid-diagram mermaid-error">${error}<pre class="code-block"><code data-language="mermaid">${escapeHtml(code.join("\n"))}</code></pre></figure>`);
        }
        continue;
      }
      html.push(`<pre class="code-block"><code data-language="${escapeAttr(language)}">${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    const blockMathIndex = parseMathToken(line, "block");
    if (blockMathIndex !== null) {
      const blockMath = mathSpans[blockMathIndex];
      html.push(`<div class="math-block">${blockMath?.html ?? ""}</div>`);
      index += 1;
      continue;
    }

    const latexStructure = parseLatexExportStructure(line);
    if (latexStructure) {
      const content = renderInline(latexStructure.content, imageMap, mathSpans);
      if (latexStructure.kind === "title") {
        html.push(`<h1 class="document-title">${content}</h1>`);
      } else {
        html.push(`<p class="document-${latexStructure.kind}">${content}</p>`);
      }
      index += 1;
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2], imageMap, mathSpans)}</h${level}>`);
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const rows: string[][] = [splitTableRow(lines[index] ?? "")];
      const aligns = splitTableRow(lines[index + 1] ?? "").map(parseTableAlign);
      index += 2;
      while (index < lines.length && isTableRow(lines[index] ?? "")) {
        rows.push(splitTableRow(lines[index] ?? ""));
        index += 1;
      }
      html.push(renderTable(rows, aligns, imageMap, mathSpans));
      continue;
    }

    const footnote = line.match(/^\s{0,3}\[\^([^\]]+)]:\s*(.*)$/);
    if (footnote) {
      html.push(`<aside class="footnote" id="fn-${escapeAttr(footnote[1])}"><sup>${escapeHtml(footnote[1])}</sup> ${renderInline(footnote[2], imageMap, mathSpans)}</aside>`);
      index += 1;
      continue;
    }

    if (/^\s{0,3}>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s{0,3}>\s?/.test(lines[index] ?? "")) {
        quote.push((lines[index] ?? "").replace(/^\s{0,3}>\s?/, ""));
        index += 1;
      }
      html.push(`<blockquote>${renderProtectedMarkdownBody(quote.join("\n"), imageMap, mathSpans, context)}</blockquote>`);
      continue;
    }

    if (/^\s{0,3}([-+*])\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s{0,3}([-+*])\s+/.test(lines[index] ?? "")) {
        const item = (lines[index] ?? "").replace(/^\s{0,3}[-+*]\s+/, "");
        const task = item.match(/^\[([ xX])]\s+(.*)$/);
        if (task) {
          const checked = task[1].toLowerCase() === "x";
          items.push(`<li class="task-list-item"><input type="checkbox" disabled="disabled"${checked ? " checked=\"checked\"" : ""} /> ${renderInline(task[2], imageMap, mathSpans)}</li>`);
        } else {
          items.push(`<li>${renderInline(item, imageMap, mathSpans)}</li>`);
        }
        index += 1;
      }
      html.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\s{0,3}\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s{0,3}\d+[.)]\s+/.test(lines[index] ?? "")) {
        items.push(`<li>${renderInline((lines[index] ?? "").replace(/^\s{0,3}\d+[.)]\s+/, ""), imageMap, mathSpans)}</li>`);
        index += 1;
      }
      html.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index]?.trim()) {
      if (paragraph.length && blockStarters.some((pattern) => pattern.test(lines[index] ?? ""))) break;
      if (paragraph.length && isTableStart(lines, index)) break;
      paragraph.push(lines[index] ?? "");
      index += 1;
    }
    html.push(`<p>${renderInline(paragraph.join(" "), imageMap, mathSpans)}</p>`);
  }

  return html.join("\n");
}

export function collectLocalImageSources(markdown: string) {
  const sources = new Set<string>();
  const imagePattern = /!\[[^\]\n]*]\(([^)\n]+)\)/g;
  let match: RegExpExecArray | null;
  const normalizedMarkdown = normalizeLatexDocumentForExport(markdown);
  while ((match = imagePattern.exec(normalizedMarkdown)) !== null) {
    const source = normalizeImageSource(match[1]);
    if (!isRemoteOrDataSource(source)) sources.add(source);
  }
  return Array.from(sources);
}

export function normalizeImageSource(source: string) {
  const value = source.trim();
  if (value.startsWith("<")) {
    const end = value.indexOf(">");
    return (end >= 0 ? value.slice(1, end) : value.slice(1)).trim();
  }

  return value.split(/\s+(?=["'])/)[0]?.trim() ?? "";
}

export function utf8Bytes(text: string) {
  return Array.from(new TextEncoder().encode(text));
}

function renderInline(
  text: string,
  imageMap: ExportImageMap,
  mathSpans: RenderedMarkdownMathSpan[],
) {
  const rendered: string[] = [];
  const inlineTokens: Array<{ from: number; to: number; priority: number; html: string }> = [];
  const pattern = /!\[([^\]\n]*)]\(([^)\n]+)\)|\[([^\]\n]+)]\(([^)\n]+)\)|`([^`\n]+)`|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|~~([^~\n]+)~~|\[\^([^\]\n]+)]/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    let html = "";
    if (match[1] !== undefined && match[2] !== undefined) {
      const source = normalizeImageSource(match[2]);
      const mapped = imageMap[source] ?? source;
      html = `<img src="${escapeAttr(mapped)}" alt="${escapeAttr(match[1])}" />`;
    } else if (match[3] !== undefined && match[4] !== undefined) {
      html = `<a href="${escapeAttr(match[4])}">${escapeHtml(match[3])}</a>`;
    } else if (match[5] !== undefined) {
      html = `<code>${escapeHtml(match[5])}</code>`;
    } else if (match[6] !== undefined) {
      html = `<strong>${escapeHtml(match[6])}</strong>`;
    } else if (match[7] !== undefined) {
      html = `<em>${escapeHtml(match[7])}</em>`;
    } else if (match[8] !== undefined) {
      html = `<del>${escapeHtml(match[8])}</del>`;
    } else if (match[9] !== undefined) {
      const id = escapeAttr(match[9]);
      html = `<sup><a href="#fn-${id}">${escapeHtml(match[9])}</a></sup>`;
    }
    inlineTokens.push({
      from: match.index,
      to: pattern.lastIndex,
      priority: 0,
      html,
    });
  }

  const mathPattern = /\u0000SEREIN_MATH_INLINE_(\d+)\u0000/g;
  while ((match = mathPattern.exec(text)) !== null) {
    const span = mathSpans[Number(match[1])];
    inlineTokens.push({
      from: match.index,
      to: mathPattern.lastIndex,
      priority: 1,
      html: `<span class="math-inline">${span?.html ?? ""}</span>`,
    });
  }

  inlineTokens.sort((left, right) => (
    left.from - right.from
    || left.priority - right.priority
    || right.to - left.to
  ));

  let lastIndex = 0;
  inlineTokens.forEach((token) => {
    if (token.from < lastIndex) return;
    rendered.push(escapeHtml(text.slice(lastIndex, token.from)), token.html);
    lastIndex = token.to;
  });
  rendered.push(escapeHtml(text.slice(lastIndex)));
  return rendered.join("");
}

function isRemoteOrDataSource(source: string) {
  return /^(https?:|data:|mailto:|#)/i.test(source);
}

function isTableStart(lines: string[], index: number) {
  const delimiter = lines[index + 1] ?? "";
  const cells = delimiter
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|");
  return isTableRow(lines[index] ?? "")
    && cells.length >= 2
    && cells.every(isMarkdownTableDelimiterCell);
}

function isTableRow(line: string) {
  return line.includes("|") && !/^\s{0,3}(```|~~~)/.test(line);
}

function splitTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseTableAlign(cell: string) {
  const value = cell.trim();
  if (value.startsWith(":") && value.endsWith(":")) return "center";
  if (value.endsWith(":")) return "right";
  return "left";
}

function renderTable(
  rows: string[][],
  aligns: string[],
  imageMap: ExportImageMap,
  mathSpans: RenderedMarkdownMathSpan[],
) {
  const header = rows[0] ?? [];
  const body = rows.slice(1);
  const head = header
    .map((cell, index) => `<th style="text-align:${aligns[index] ?? "left"}">${renderInline(cell, imageMap, mathSpans)}</th>`)
    .join("");
  const bodyRows = body
    .map((row) => `<tr>${row.map((cell, index) => `<td style="text-align:${aligns[index] ?? "left"}">${renderInline(cell, imageMap, mathSpans)}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${bodyRows}</tbody></table>`;
}

function mathToken(index: number, kind: "inline" | "block") {
  return `\u0000SEREIN_MATH_${kind.toUpperCase()}_${index}\u0000`;
}

function parseMathToken(value: string, kind: "inline" | "block") {
  const match = value.trim().match(new RegExp(`^\\u0000SEREIN_MATH_${kind.toUpperCase()}_(\\d+)\\u0000$`));
  return match ? Number(match[1]) : null;
}

function protectMarkdownMath(markdown: string, macroDefinitions = "") {
  const spans = renderMarkdownMath(markdown, { macroDefinitions });
  let protectedMarkdown = markdown;
  for (let index = spans.length - 1; index >= 0; index -= 1) {
    const span = spans[index];
    if (!span) continue;
    protectedMarkdown = `${protectedMarkdown.slice(0, span.from)}${mathToken(index, span.kind)}${protectedMarkdown.slice(span.to)}`;
  }
  return { markdown: protectedMarkdown, spans };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: string) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function exportCss() {
  return `
body {
  margin: 0;
  background: #f7f4ed;
  color: #27241f;
  font: 16px/1.72 ui-serif, "Noto Serif CJK SC", "Songti SC", Georgia, serif;
}
.document {
  max-width: 820px;
  margin: 0 auto;
  padding: 56px 64px 80px;
  background: #fffdf7;
}
h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.5em 0 .65em; }
h1 { font-size: 38px; }
h2 { border-bottom: 1px solid #ded8ca; padding-bottom: 8px; font-size: 28px; }
.document-title { margin: .4em 0 .5em; text-align: center; font-size: 42px; }
.document-author, .document-date { margin: .25em 0; text-align: center; color: #5f5a50; }
.document-date { margin-bottom: 2em; }
p { margin: .8em 0; }
a { color: #2f6f8f; }
code { border-radius: 4px; background: #f0ece2; padding: .12em .35em; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
.code-block { overflow: auto; border-radius: 6px; background: #f0ece2; padding: 14px 16px; }
blockquote { border-left: 4px solid #9b6b43; margin: 1em 0; background: #f5efe5; padding: 8px 16px; }
table { width: 100%; border-collapse: collapse; margin: 1.2em 0; }
th, td { border: 1px solid #d8d0c0; padding: 7px 9px; vertical-align: top; }
th { background: #f0ece2; font-weight: 700; }
img { max-width: 100%; height: auto; border-radius: 4px; }
.mermaid-diagram { display: grid; place-items: center; max-width: 100%; overflow: auto; margin: 1.2em 0; border: 1px solid #d8d0c0; border-radius: 6px; background: #fbfaf7; padding: 16px; }
.mermaid-diagram svg { display: block; max-width: 100%; height: auto; margin: 0 auto; }
.mermaid-error { display: block; border-color: #c98b83; color: #9a3f35; }
.mermaid-error > pre { margin: .7em 0 0; white-space: pre-wrap; }
.task-list-item { list-style: none; margin-left: -1.25em; }
.task-list-item input { margin-right: .5em; }
.math-inline { display: inline-block; max-width: 100%; vertical-align: middle; }
.math-block { overflow: auto; border-radius: 6px; background: #f7f4ed; padding: 12px 16px; text-align: center; white-space: pre-wrap; }
mjx-container[jax="SVG"] { direction: ltr; white-space: nowrap; }
mjx-container[jax="SVG"] > svg { min-width: 1px; min-height: 1px; overflow: visible; }
mjx-container[jax="SVG"] > svg a { fill: #2f6f8f; stroke: #2f6f8f; }
mjx-container[display] { display: block; justify-content: center; margin: .7em 0; padding: .3em 2px; text-align: center; }
mjx-container[display][width="full"] { display: flex; }
.math-inline > mjx-container { display: inline-block; margin: 0; padding: 0; }
.math-block > mjx-container { margin: 0; }
.footnote { margin-top: .7em; border-top: 1px solid #ded8ca; color: #5f5a50; font-size: 13px; }
@media print {
  body { background: white; }
  .document { max-width: none; padding: 0; background: white; }
}
`;
}
