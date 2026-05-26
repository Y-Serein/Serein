export type ExportImageMap = Record<string, string>;

export type HtmlExportOptions = {
  title: string;
  imageMap?: ExportImageMap;
};

const blockStarters = [
  /^\s{0,3}#{1,6}\s+/,
  /^\s{0,3}(```|~~~)/,
  /^\s{0,3}>\s?/,
  /^\s{0,3}([-+*])\s+(\[[ xX]\]\s+)?/,
  /^\s{0,3}\d+[.)]\s+/,
  /^\s{0,3}\[\^[^\]]+\]:/,
  /^\s{0,3}\$\$\s*$/,
];

export function htmlDocument(markdown: string, options: HtmlExportOptions) {
  const body = renderMarkdownBody(markdown, options.imageMap ?? {});
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

export function renderMarkdownBody(markdown: string, imageMap: ExportImageMap = {}) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
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
      html.push(`<pre class="code-block"><code data-language="${escapeAttr(language)}">${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    if (/^\s{0,3}\$\$\s*$/.test(line)) {
      const math: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s{0,3}\$\$\s*$/.test(lines[index] ?? "")) {
        math.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) index += 1;
      html.push(`<div class="math-block">${escapeHtml(math.join("\n"))}</div>`);
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2], imageMap)}</h${level}>`);
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
      html.push(renderTable(rows, aligns, imageMap));
      continue;
    }

    const footnote = line.match(/^\s{0,3}\[\^([^\]]+)]:\s*(.*)$/);
    if (footnote) {
      html.push(`<aside class="footnote" id="fn-${escapeAttr(footnote[1])}"><sup>${escapeHtml(footnote[1])}</sup> ${renderInline(footnote[2], imageMap)}</aside>`);
      index += 1;
      continue;
    }

    if (/^\s{0,3}>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s{0,3}>\s?/.test(lines[index] ?? "")) {
        quote.push((lines[index] ?? "").replace(/^\s{0,3}>\s?/, ""));
        index += 1;
      }
      html.push(`<blockquote>${renderMarkdownBody(quote.join("\n"), imageMap)}</blockquote>`);
      continue;
    }

    if (/^\s{0,3}([-+*])\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s{0,3}([-+*])\s+/.test(lines[index] ?? "")) {
        const item = (lines[index] ?? "").replace(/^\s{0,3}[-+*]\s+/, "");
        const task = item.match(/^\[([ xX])]\s+(.*)$/);
        if (task) {
          const checked = task[1].toLowerCase() === "x";
          items.push(`<li class="task-list-item"><input type="checkbox" disabled="disabled"${checked ? " checked=\"checked\"" : ""} /> ${renderInline(task[2], imageMap)}</li>`);
        } else {
          items.push(`<li>${renderInline(item, imageMap)}</li>`);
        }
        index += 1;
      }
      html.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\s{0,3}\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s{0,3}\d+[.)]\s+/.test(lines[index] ?? "")) {
        items.push(`<li>${renderInline((lines[index] ?? "").replace(/^\s{0,3}\d+[.)]\s+/, ""), imageMap)}</li>`);
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
    html.push(`<p>${renderInline(paragraph.join(" "), imageMap)}</p>`);
  }

  return html.join("\n");
}

export function collectLocalImageSources(markdown: string) {
  const sources = new Set<string>();
  const imagePattern = /!\[[^\]\n]*]\(([^)\n]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = imagePattern.exec(markdown)) !== null) {
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

function renderInline(text: string, imageMap: ExportImageMap) {
  const tokens: string[] = [];
  const pattern = /!\[([^\]\n]*)]\(([^)\n]+)\)|\[([^\]\n]+)]\(([^)\n]+)\)|`([^`\n]+)`|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|~~([^~\n]+)~~|\$\$?([^$\n]+)\$\$?|\[\^([^\]\n]+)]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    tokens.push(escapeHtml(text.slice(lastIndex, match.index)));
    if (match[1] !== undefined && match[2] !== undefined) {
      const source = normalizeImageSource(match[2]);
      const mapped = imageMap[source] ?? source;
      tokens.push(`<img src="${escapeAttr(mapped)}" alt="${escapeAttr(match[1])}" />`);
    } else if (match[3] !== undefined && match[4] !== undefined) {
      tokens.push(`<a href="${escapeAttr(match[4])}">${escapeHtml(match[3])}</a>`);
    } else if (match[5] !== undefined) {
      tokens.push(`<code>${escapeHtml(match[5])}</code>`);
    } else if (match[6] !== undefined) {
      tokens.push(`<strong>${escapeHtml(match[6])}</strong>`);
    } else if (match[7] !== undefined) {
      tokens.push(`<em>${escapeHtml(match[7])}</em>`);
    } else if (match[8] !== undefined) {
      tokens.push(`<del>${escapeHtml(match[8])}</del>`);
    } else if (match[9] !== undefined) {
      tokens.push(`<span class="math-inline">${escapeHtml(match[9])}</span>`);
    } else if (match[10] !== undefined) {
      const id = escapeAttr(match[10]);
      tokens.push(`<sup><a href="#fn-${id}">${escapeHtml(match[10])}</a></sup>`);
    }
    lastIndex = pattern.lastIndex;
  }

  tokens.push(escapeHtml(text.slice(lastIndex)));
  return tokens.join("");
}

function isRemoteOrDataSource(source: string) {
  return /^(https?:|data:|mailto:|#)/i.test(source);
}

function isTableStart(lines: string[], index: number) {
  return isTableRow(lines[index] ?? "") && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1] ?? "");
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

function renderTable(rows: string[][], aligns: string[], imageMap: ExportImageMap) {
  const header = rows[0] ?? [];
  const body = rows.slice(1);
  const head = header
    .map((cell, index) => `<th style="text-align:${aligns[index] ?? "left"}">${renderInline(cell, imageMap)}</th>`)
    .join("");
  const bodyRows = body
    .map((row) => `<tr>${row.map((cell, index) => `<td style="text-align:${aligns[index] ?? "left"}">${renderInline(cell, imageMap)}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${bodyRows}</tbody></table>`;
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
p { margin: .8em 0; }
a { color: #2f6f8f; }
code { border-radius: 4px; background: #f0ece2; padding: .12em .35em; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
.code-block { overflow: auto; border-radius: 6px; background: #f0ece2; padding: 14px 16px; }
blockquote { border-left: 4px solid #9b6b43; margin: 1em 0; background: #f5efe5; padding: 8px 16px; }
table { width: 100%; border-collapse: collapse; margin: 1.2em 0; }
th, td { border: 1px solid #d8d0c0; padding: 7px 9px; vertical-align: top; }
th { background: #f0ece2; font-weight: 700; }
img { max-width: 100%; height: auto; border-radius: 4px; }
.task-list-item { list-style: none; margin-left: -1.25em; }
.task-list-item input { margin-right: .5em; }
.math-inline, .math-block { font-family: Cambria Math, STIX Two Math, ui-serif, serif; }
.math-block { overflow: auto; border-radius: 6px; background: #f7f4ed; padding: 12px 16px; text-align: center; white-space: pre-wrap; }
.footnote { margin-top: .7em; border-top: 1px solid #ded8ca; color: #5f5a50; font-size: 13px; }
@media print {
  body { background: white; }
  .document { max-width: none; padding: 0; background: white; }
}
`;
}
