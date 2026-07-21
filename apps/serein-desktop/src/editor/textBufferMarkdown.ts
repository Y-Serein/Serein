import {
  closingMarkdownFence as closingFence,
  markdownContainerPrefixLength,
  markdownSetextHeadingLevel,
  isMarkdownTableDelimiterCell,
  openingMarkdownFence as openingFence,
  splitYamlFrontmatter,
  type MarkdownFenceInfo as FenceInfo,
} from "../shared/markdown.js";

export type TextBufferLineKind =
  | "paragraph"
  | "heading"
  | "blockquote"
  | "list"
  | "codeFence"
  | "code";

export type TextBufferRange = {
  from: number;
  to: number;
};

export type TextBufferLine = {
  number: number;
  from: number;
  to: number;
  text: string;
  kind: TextBufferLineKind;
  headingLevel?: number;
  listKind?: "bullet" | "ordered";
  listMarker?: string;
  codeBlockId?: number;
  fenceStatus?: "closed" | "pending";
  hiddenInRich?: boolean;
  richQuoteDepth?: number;
  richListDepth?: number;
  richListKind?: "bullet" | "ordered";
  richListMarker?: string;
  richListContinuation?: boolean;
  richQuoteStart?: boolean;
  richQuoteEnd?: boolean;
  syntaxRanges: TextBufferRange[];
  richHiddenRanges: TextBufferRange[];
};

export type TextBufferMarkdownAnalysis = {
  lines: TextBufferLine[];
  codeBlocks: TextBufferCodeBlock[];
};

export type TextBufferMarkdownAnalysisOptions = {
  pendingFenceLines?: ReadonlySet<number>;
};

export type TextBufferSyntaxTree = {
  cursor: () => TextBufferSyntaxCursor;
};

type TextBufferSyntaxCursor = {
  name: string;
  from: number;
  to: number;
  firstChild: () => boolean;
  nextSibling: () => boolean;
  parent: () => boolean;
};

type TextBufferSyntaxNode = {
  name: string;
  from: number;
  to: number;
  children: TextBufferSyntaxNode[];
};

export type TextBufferCodeBlock = {
  id: number;
  from: number;
  to: number;
  openerFrom: number;
  openerTo: number;
  openerMarkerFrom: number;
  openerMarkerTo: number;
  languageFrom: number;
  languageTo: number;
  closerFrom: number;
  closerTo: number;
  contentFrom: number;
  contentTo: number;
  firstContentLine: number;
  lastContentLine: number;
  language: string;
  fenceChar: "`" | "~";
  fenceLength: number;
  containerPrefix: string;
  containerIndentLevel: number;
  containerQuoteDepth: number;
};

export type TextBufferTableAlignment = "left" | "center" | "right" | "default";

export type TextBufferTableBlock = {
  from: number;
  to: number;
  rows: string[][];
  alignments: TextBufferTableAlignment[];
};

export type TextBufferTableData = Pick<TextBufferTableBlock, "rows" | "alignments">;

export type TextBufferInlineLink = {
  kind: "markdown" | "autolink";
  image: boolean;
  from: number;
  to: number;
  labelFrom: number;
  labelTo: number;
  urlFrom: number;
  urlTo: number;
  href: string;
};

function markdownLines(markdown: string) {
  const parts = markdown.split("\n");
  let offset = 0;
  return parts.map((text, index) => {
    const line = {
      number: index + 1,
      from: offset,
      to: offset + text.length,
      text,
    };
    offset += text.length + 1;
    return line;
  });
}

export function stripTextBufferContainerPrefix(text: string) {
  return text.slice(markdownContainerPrefixLength(text));
}

function matchingFenceClose(lines: ReturnType<typeof markdownLines>, startIndex: number, opener: FenceInfo) {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (closingFence(lines[index].text, opener)) return index;
  }
  return -1;
}

function codeBlockContainerPresentation(prefix: string) {
  const leadingWhitespace = prefix.match(/^[ \t]*/)?.[0] ?? "";
  const leadingColumns = [...leadingWhitespace].reduce((total, char) => total + (char === "\t" ? 2 : 1), 0);
  const explicitListDepth = [...prefix.matchAll(/(?:^|\s)(?:[-*+]|\d+[.)])\s+/g)].length;
  return {
    indentLevel: Math.min(6, Math.max(explicitListDepth, Math.ceil(leadingColumns / 2))),
    quoteDepth: Math.min(4, [...prefix.matchAll(/>/g)].length),
  };
}

function addSyntaxRange(line: TextBufferLine, from: number, to: number) {
  if (to <= from) return;
  line.syntaxRanges.push({ from, to });
}

function addRichHiddenRange(line: TextBufferLine, from: number, to: number) {
  if (to <= from) return;
  line.richHiddenRanges.push({ from, to });
}

type TextBufferContainerPrefix = {
  length: number;
  quoteDepth: number;
  listDepth: number;
  listKind?: "bullet" | "ordered";
  listMarker?: string;
};

function textBufferContainerPrefix(text: string): TextBufferContainerPrefix {
  let cursor = 0;
  let quoteDepth = 0;
  let listDepth = 0;
  let listKind: "bullet" | "ordered" | undefined;
  let listMarker: string | undefined;

  while (cursor < text.length) {
    const source = text.slice(cursor);
    const blockquote = source.match(/^( {0,3}>\s?)/);
    if (blockquote) {
      quoteDepth += 1;
      cursor += blockquote[1].length;
      continue;
    }

    const list = source.match(/^([ \t]*)([-*+]|\d+[.)])\s+/);
    if (list) {
      const indentation = list[1].replace(/\t/g, "  ").length;
      listDepth = Math.max(listDepth + 1, Math.floor(indentation / 2) + 1);
      listKind = /^\d/.test(list[2]) ? "ordered" : "bullet";
      listMarker = list[2];
      cursor += list[0].length;
      continue;
    }

    break;
  }

  return { length: cursor, quoteDepth, listDepth, listKind, listMarker };
}

function replaceRichContainerPrefix(line: TextBufferLine, prefixLength: number) {
  if (prefixLength <= 0) return;
  const prefixTo = line.from + Math.min(prefixLength, line.text.length);
  line.syntaxRanges = line.syntaxRanges.filter((range) => (
    range.to <= line.from || range.from >= prefixTo
  ));
  line.richHiddenRanges = line.richHiddenRanges.filter((range) => (
    range.to <= line.from || range.from >= prefixTo
  ));
  addSyntaxRange(line, line.from, prefixTo);
  addRichHiddenRange(line, line.from, prefixTo);
}

function annotateRichContainerLines(lines: TextBufferLine[]) {
  let previous: TextBufferLine | null = null;

  lines.forEach((line) => {
    if (line.kind === "code" || line.kind === "codeFence" || !line.text.trim()) {
      previous = null;
      return;
    }

    const prefix = textBufferContainerPrefix(line.text);
    const hasExplicitQuote = line.kind === "blockquote";
    const hasExplicitList = line.kind === "list"
      || (line.kind === "blockquote" && prefix.listDepth > 0);
    const isHeading = line.kind === "heading";

    if (hasExplicitQuote || hasExplicitList) {
      const inheritedList = prefix.listDepth === 0
        && prefix.quoteDepth > 0
        && previous?.richQuoteDepth === prefix.quoteDepth
        && Boolean(previous.richListDepth);
      line.richQuoteDepth = prefix.quoteDepth || (line.kind === "blockquote" ? 1 : 0);
      line.richListDepth = prefix.listDepth || (line.kind === "list" ? 1 : 0)
        || (inheritedList ? previous?.richListDepth : 0);
      line.richListKind = prefix.listKind ?? line.listKind ?? (inheritedList ? previous?.richListKind : undefined);
      line.richListMarker = prefix.listMarker ?? line.listMarker;
      line.richListContinuation = inheritedList;
      if (prefix.length > 0) {
        replaceRichContainerPrefix(line, prefix.length);
      }
      previous = line;
      return;
    }

    if (!isHeading && previous?.richQuoteDepth) {
      line.richQuoteDepth = previous.richQuoteDepth;
      line.richListDepth = previous.richListDepth;
      line.richListKind = previous.richListKind;
      line.richListContinuation = Boolean(previous.richListDepth);
      previous = line;
      return;
    }

    if (!isHeading && previous?.richListDepth) {
      line.richListDepth = previous.richListDepth;
      line.richListKind = previous.richListKind;
      line.richListContinuation = true;
      previous = line;
      return;
    }

    previous = null;
  });

  lines.forEach((line, index) => {
    if (!line.richQuoteDepth) return;
    const previousLine = lines[index - 1];
    const nextLine = lines[index + 1];
    line.richQuoteStart = !previousLine || previousLine.richQuoteDepth !== line.richQuoteDepth;
    line.richQuoteEnd = !nextLine || nextLine.richQuoteDepth !== line.richQuoteDepth;
  });
}

function syntaxNodeFromCursor(cursor: TextBufferSyntaxCursor): TextBufferSyntaxNode {
  const node: TextBufferSyntaxNode = {
    name: cursor.name,
    from: cursor.from,
    to: cursor.to,
    children: [],
  };

  if (cursor.firstChild()) {
    do {
      node.children.push(syntaxNodeFromCursor(cursor));
    } while (cursor.nextSibling());
    cursor.parent();
  }

  return node;
}

function lineIndexAtOffset(lines: TextBufferLine[], offset: number) {
  let low = 0;
  let high = lines.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const line = lines[mid];
    if (offset < line.from) {
      high = mid - 1;
    } else if (offset > line.to) {
      low = mid + 1;
    } else {
      return mid;
    }
  }

  return -1;
}

function lineAtOffset(lines: TextBufferLine[], offset: number) {
  const index = lineIndexAtOffset(lines, offset);
  return index >= 0 ? lines[index] : null;
}

function rangeWithFollowingInlineSpace(line: TextBufferLine, markerTo: number) {
  let to = Math.min(markerTo, line.to);
  while (to < line.to && /[ \t]/.test(line.text[to - line.from])) to += 1;
  return to;
}

function isEscaped(text: string, index: number) {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function findClosingBracket(text: string, openIndex: number) {
  let depth = 0;
  for (let index = openIndex + 1; index < text.length; index += 1) {
    if (isEscaped(text, index)) continue;
    if (text[index] === "[") {
      depth += 1;
      continue;
    }
    if (text[index] !== "]") continue;
    if (depth === 0) return index;
    depth -= 1;
  }
  return -1;
}

function findClosingParen(text: string, openIndex: number) {
  let depth = 0;
  for (let index = openIndex + 1; index < text.length; index += 1) {
    if (isEscaped(text, index)) continue;
    if (text[index] === "(") {
      depth += 1;
      continue;
    }
    if (text[index] !== ")") continue;
    if (depth === 0) return index;
    depth -= 1;
  }
  return -1;
}

function overlaps(ranges: Array<{ from: number; to: number }>, from: number, to: number) {
  return ranges.some((range) => from < range.to && to > range.from);
}

export function scanTextBufferInlineLinks(text: string, lineFrom = 0): TextBufferInlineLink[] {
  const links: TextBufferInlineLink[] = [];
  const occupiedRanges: Array<{ from: number; to: number }> = [];

  for (let index = 0; index < text.length; index += 1) {
    const image = text[index] === "!" && text[index + 1] === "[";
    const bracketIndex = image ? index + 1 : index;
    if (text[bracketIndex] !== "[" || isEscaped(text, bracketIndex)) continue;

    const closeBracket = findClosingBracket(text, bracketIndex);
    if (closeBracket < 0 || text[closeBracket + 1] !== "(") continue;

    const closeParen = findClosingParen(text, closeBracket + 1);
    if (closeParen < 0) continue;

    const urlStart = closeBracket + 2;
    const urlEnd = closeParen;
    const href = text.slice(urlStart, urlEnd).trim();
    if (!href) continue;

    const from = lineFrom + index;
    const to = lineFrom + closeParen + 1;
    links.push({
      kind: "markdown",
      image,
      from,
      to,
      labelFrom: lineFrom + bracketIndex + 1,
      labelTo: lineFrom + closeBracket,
      urlFrom: lineFrom + urlStart,
      urlTo: lineFrom + urlEnd,
      href,
    });
    occupiedRanges.push({ from, to });
    index = closeParen;
  }

  const autolinkRegex = /<((?:https?|mailto):[^<>\s]+)>/gi;
  let match: RegExpExecArray | null;
  while ((match = autolinkRegex.exec(text))) {
    const from = lineFrom + match.index;
    const to = from + match[0].length;
    if (overlaps(occupiedRanges, from, to)) continue;
    links.push({
      kind: "autolink",
      image: false,
      from,
      to,
      labelFrom: from + 1,
      labelTo: to - 1,
      urlFrom: from + 1,
      urlTo: to - 1,
      href: match[1],
    });
  }

  return links.sort((left, right) => left.from - right.from);
}

function directChild(node: TextBufferSyntaxNode, name: string) {
  return node.children.find((child) => child.name === name);
}

function directChildren(node: TextBufferSyntaxNode, name: string) {
  return node.children.filter((child) => child.name === name);
}

function linkFromSyntaxNode(markdown: string, node: TextBufferSyntaxNode): TextBufferInlineLink | null {
  if (node.name === "Autolink") {
    const url = directChild(node, "URL");
    if (!url) return null;
    return {
      kind: "autolink",
      image: false,
      from: node.from,
      to: node.to,
      labelFrom: url.from,
      labelTo: url.to,
      urlFrom: url.from,
      urlTo: url.to,
      href: markdown.slice(url.from, url.to).trim(),
    };
  }

  if (node.name !== "Link" && node.name !== "Image") return null;
  const url = directChild(node, "URL");
  const marks = directChildren(node, "LinkMark");
  if (!url || marks.length < 4) return null;

  return {
    kind: "markdown",
    image: node.name === "Image",
    from: node.from,
    to: node.to,
    labelFrom: marks[0].to,
    labelTo: marks[1].from,
    urlFrom: url.from,
    urlTo: url.to,
    href: markdown.slice(url.from, url.to).trim(),
  };
}

export function scanTextBufferInlineLinksFromSyntaxTree(
  markdown: string,
  syntaxTree: TextBufferSyntaxTree,
): TextBufferInlineLink[] {
  const root = syntaxNodeFromCursor(syntaxTree.cursor());
  const links: TextBufferInlineLink[] = [];

  const visit = (node: TextBufferSyntaxNode) => {
    const link = linkFromSyntaxNode(markdown, node);
    if (link) {
      links.push(link);
      return;
    }
    node.children.forEach(visit);
  };

  visit(root);
  return links.sort((left, right) => left.from - right.from);
}

function splitTextBufferPipeTableRow(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;

  const cells: string[] = [];
  let current = "";
  let escaped = false;
  for (let index = 1; index < trimmed.length - 1; index += 1) {
    const char = trimmed[index];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells.length >= 2 ? cells : null;
}

function parseTextBufferTableAlignment(cell: string): TextBufferTableAlignment | null {
  const value = cell.trim();
  if (!isMarkdownTableDelimiterCell(value)) return null;
  if (value.startsWith(":") && value.endsWith(":")) return "center";
  if (value.endsWith(":")) return "right";
  if (value.startsWith(":")) return "left";
  return "default";
}

function tableCellsFromSyntaxNode(markdown: string, node: TextBufferSyntaxNode) {
  const cells = directChildren(node, "TableCell").map((cell) => (
    markdown.slice(cell.from, cell.to).replace(/\\\|/g, "|").trim()
  ));
  return cells.length >= 2 ? cells : null;
}

function tableFromSyntaxNode(markdown: string, node: TextBufferSyntaxNode): TextBufferTableBlock | null {
  if (node.name !== "Table") return null;

  const header = node.children.find((child) => child.name === "TableHeader");
  const separator = node.children.find((child) => child.name === "TableDelimiter" && child.from > (header?.to ?? node.from));
  const headerCells = header ? tableCellsFromSyntaxNode(markdown, header) : null;
  const separatorCells = separator ? splitTextBufferPipeTableRow(markdown.slice(separator.from, separator.to)) : null;
  if (!headerCells || !separatorCells) return null;

  const rows = [headerCells];
  node.children
    .filter((child) => child.name === "TableRow")
    .forEach((row) => {
      const cells = tableCellsFromSyntaxNode(markdown, row);
      if (cells) rows.push(cells);
    });

  return {
    from: node.from,
    to: node.to,
    rows,
    alignments: separatorCells.map((cell) => parseTextBufferTableAlignment(cell) ?? "default"),
  };
}

export function scanTextBufferTablesFromSyntaxTree(
  markdown: string,
  syntaxTree: TextBufferSyntaxTree,
): TextBufferTableBlock[] {
  const root = syntaxNodeFromCursor(syntaxTree.cursor());
  const tables: TextBufferTableBlock[] = [];

  const visit = (node: TextBufferSyntaxNode) => {
    const table = tableFromSyntaxNode(markdown, node);
    if (table) {
      tables.push(table);
      return;
    }
    node.children.forEach(visit);
  };

  visit(root);
  return tables.sort((left, right) => left.from - right.from);
}

export function scanTextBufferTables(
  markdown: string,
  analysis: TextBufferMarkdownAnalysis,
): TextBufferTableBlock[] {
  const sourceLines = markdownLines(markdown);
  const analyzedByNumber = new Map(analysis.lines.map((line) => [line.number, line]));
  const tables: TextBufferTableBlock[] = [];

  for (let index = 0; index < sourceLines.length - 1; index += 1) {
    const headerLine = sourceLines[index];
    const delimiterLine = sourceLines[index + 1];
    const headerAnalysis = analyzedByNumber.get(headerLine.number);
    const delimiterAnalysis = analyzedByNumber.get(delimiterLine.number);
    if (
      headerAnalysis?.kind === "code"
      || headerAnalysis?.kind === "codeFence"
      || delimiterAnalysis?.kind === "code"
      || delimiterAnalysis?.kind === "codeFence"
    ) continue;

    const header = splitTextBufferPipeTableRow(headerLine.text);
    const delimiter = splitTextBufferPipeTableRow(delimiterLine.text);
    if (!header || !delimiter) continue;
    const alignments = delimiter.map(parseTextBufferTableAlignment);
    if (alignments.some((alignment) => alignment === null)) continue;

    const rows = [header];
    let lastLine = delimiterLine;
    let bodyIndex = index + 2;
    while (bodyIndex < sourceLines.length) {
      const bodyLine = sourceLines[bodyIndex];
      const bodyAnalysis = analyzedByNumber.get(bodyLine.number);
      if (bodyAnalysis?.kind === "code" || bodyAnalysis?.kind === "codeFence") break;
      const row = splitTextBufferPipeTableRow(bodyLine.text);
      if (!row) break;
      rows.push(row);
      lastLine = bodyLine;
      bodyIndex += 1;
    }

    tables.push({
      from: headerLine.from,
      to: lastLine.to,
      rows,
      alignments: alignments.map((alignment) => alignment ?? "default"),
    });
    index = bodyIndex - 1;
  }

  return tables;
}

export function textBufferTableColumnCount(table: TextBufferTableData) {
  return Math.max(
    2,
    table.alignments.length,
    ...table.rows.map((row) => row.length),
  );
}

export function normalizeTextBufferTable(table: TextBufferTableData): TextBufferTableData {
  const columnCount = textBufferTableColumnCount(table);
  const sourceRows = table.rows.length ? table.rows : [[]];
  return {
    rows: sourceRows.map((row) => Array.from(
      { length: columnCount },
      (_, index) => row[index] ?? "",
    )),
    alignments: Array.from(
      { length: columnCount },
      (_, index) => table.alignments[index] ?? "default",
    ),
  };
}

export function serializeTextBufferTable(table: TextBufferTableData) {
  const normalized = normalizeTextBufferTable(table);
  const escapedRows = normalized.rows.map((row) => row.map((cell) => cell.replace(/\|/g, "\\|")));
  const header = escapedRows[0];
  const separator = normalized.alignments.map((alignment) => {
    if (alignment === "center") return ":---:";
    if (alignment === "right") return "---:";
    if (alignment === "left") return ":---";
    return "---";
  });
  return [header, separator, ...escapedRows.slice(1)]
    .map((row) => `| ${row.join(" | ")} |`)
    .join("\n");
}

export function textBufferTableCompletionFromPipeRow(text: string) {
  const header = splitTextBufferPipeTableRow(text);
  if (!header || header.length < 2) return null;
  if (!header.some((cell) => cell.trim()) || header.every(isMarkdownTableDelimiterCell)) return null;

  return serializeTextBufferTable({
    rows: [header, Array.from({ length: header.length }, () => "")],
    alignments: Array.from({ length: header.length }, () => "default"),
  });
}

export function insertTextBufferTableRow(table: TextBufferTableData, afterRow: number) {
  const normalized = normalizeTextBufferTable(table);
  const insertionIndex = Math.max(1, Math.min(afterRow + 1, normalized.rows.length));
  const rows = normalized.rows.map((row) => [...row]);
  rows.splice(insertionIndex, 0, Array.from({ length: normalized.alignments.length }, () => ""));
  return { rows, alignments: [...normalized.alignments] } satisfies TextBufferTableData;
}

export function deleteTextBufferTableRow(table: TextBufferTableData, rowIndex: number) {
  const normalized = normalizeTextBufferTable(table);
  if (rowIndex <= 0 || rowIndex >= normalized.rows.length || normalized.rows.length <= 2) return normalized;
  return {
    rows: normalized.rows.filter((_, index) => index !== rowIndex),
    alignments: [...normalized.alignments],
  } satisfies TextBufferTableData;
}

export function moveTextBufferTableRow(table: TextBufferTableData, rowIndex: number, delta: -1 | 1) {
  const normalized = normalizeTextBufferTable(table);
  const targetIndex = rowIndex + delta;
  if (rowIndex <= 0 || rowIndex >= normalized.rows.length || targetIndex <= 0 || targetIndex >= normalized.rows.length) {
    return normalized;
  }
  const rows = normalized.rows.map((row) => [...row]);
  [rows[rowIndex], rows[targetIndex]] = [rows[targetIndex], rows[rowIndex]];
  return { rows, alignments: [...normalized.alignments] } satisfies TextBufferTableData;
}

export function insertTextBufferTableColumn(table: TextBufferTableData, afterColumn: number) {
  const normalized = normalizeTextBufferTable(table);
  const insertionIndex = Math.max(0, Math.min(afterColumn + 1, normalized.alignments.length));
  const rows = normalized.rows.map((row) => {
    const nextRow = [...row];
    nextRow.splice(insertionIndex, 0, "");
    return nextRow;
  });
  const alignments = [...normalized.alignments];
  alignments.splice(insertionIndex, 0, "default");
  return { rows, alignments } satisfies TextBufferTableData;
}

export function deleteTextBufferTableColumn(table: TextBufferTableData, columnIndex: number) {
  const normalized = normalizeTextBufferTable(table);
  if (columnIndex < 0 || columnIndex >= normalized.alignments.length || normalized.alignments.length <= 2) return normalized;
  return {
    rows: normalized.rows.map((row) => row.filter((_, index) => index !== columnIndex)),
    alignments: normalized.alignments.filter((_, index) => index !== columnIndex),
  } satisfies TextBufferTableData;
}

export function moveTextBufferTableColumn(table: TextBufferTableData, columnIndex: number, delta: -1 | 1) {
  const normalized = normalizeTextBufferTable(table);
  const targetIndex = columnIndex + delta;
  if (
    columnIndex < 0
    || columnIndex >= normalized.alignments.length
    || targetIndex < 0
    || targetIndex >= normalized.alignments.length
  ) return normalized;

  const rows = normalized.rows.map((row) => {
    const nextRow = [...row];
    [nextRow[columnIndex], nextRow[targetIndex]] = [nextRow[targetIndex], nextRow[columnIndex]];
    return nextRow;
  });
  const alignments = [...normalized.alignments];
  [alignments[columnIndex], alignments[targetIndex]] = [alignments[targetIndex], alignments[columnIndex]];
  return { rows, alignments } satisfies TextBufferTableData;
}

export function setTextBufferTableAlignment(
  table: TextBufferTableData,
  columnIndex: number,
  alignment: TextBufferTableAlignment,
) {
  const normalized = normalizeTextBufferTable(table);
  if (columnIndex < 0 || columnIndex >= normalized.alignments.length) return normalized;
  const alignments = [...normalized.alignments];
  alignments[columnIndex] = alignment;
  return { rows: normalized.rows.map((row) => [...row]), alignments } satisfies TextBufferTableData;
}

export function nextTextBufferTableAlignment(alignment: TextBufferTableAlignment): TextBufferTableAlignment {
  if (alignment === "default") return "left";
  if (alignment === "left") return "center";
  if (alignment === "center") return "right";
  return "default";
}

function analyzeNonCodeLine(line: TextBufferLine) {
  const heading = line.text.match(/^(#{1,6})\s+/);
  if (heading) {
    line.kind = "heading";
    line.headingLevel = heading[1].length;
    addSyntaxRange(line, line.from, line.from + heading[0].length);
    addRichHiddenRange(line, line.from, line.from + heading[0].length);
    return;
  }

  const blockquote = line.text.match(/^(\s*>\s?)/);
  if (blockquote) {
    line.kind = "blockquote";
    addSyntaxRange(line, line.from, line.from + blockquote[1].length);
    addRichHiddenRange(line, line.from, line.from + blockquote[1].length);
    return;
  }

  const list = line.text.match(/^(\s*)((?:[-*+])|(?:\d+[.)]))(\s+)/);
  if (list) {
    line.kind = "list";
    line.listKind = /^\d/.test(list[2]) ? "ordered" : "bullet";
    line.listMarker = list[2];
    const markerFrom = line.from + list[1].length;
    const markerTo = line.from + list[0].length;
    addSyntaxRange(line, markerFrom, markerTo);
    addRichHiddenRange(line, markerFrom, markerTo);
  }
}

function applyRegexBlockAnalysis(
  lines: TextBufferLine[],
  codeBlocks: TextBufferCodeBlock[],
  contentStart: number,
  options: TextBufferMarkdownAnalysisOptions,
) {
  let index = 0;
  while (index < lines.length && lines[index].from < contentStart) index += 1;
  while (index < lines.length) {
    const opener = openingFence(lines[index].text);
    if (opener) {
      if (options.pendingFenceLines?.has(lines[index].from)) {
        markPendingFenceLine(lines[index]);
        index += 1;
        continue;
      }
      const closeIndex = matchingFenceClose(lines, index, opener);
      if (closeIndex >= 0) {
        const openLine = lines[index];
        const hiddenPrefixText = openLine.text.slice(0, opener.prefixLength);
        openLine.kind = "codeFence";
        openLine.codeBlockId = codeBlocks.length;
        openLine.fenceStatus = "closed";
        addSyntaxRange(openLine, openLine.from, openLine.to);
        addRichHiddenRange(openLine, openLine.from, openLine.to);

        for (let codeIndex = index + 1; codeIndex < closeIndex; codeIndex += 1) {
          lines[codeIndex].kind = "code";
          lines[codeIndex].codeBlockId = codeBlocks.length;
          const hiddenPrefixLength = hiddenCodeLinePrefixLength(lines[codeIndex].text, hiddenPrefixText);
          if (hiddenPrefixLength > 0) {
            addSyntaxRange(lines[codeIndex], lines[codeIndex].from, lines[codeIndex].from + hiddenPrefixLength);
            addRichHiddenRange(lines[codeIndex], lines[codeIndex].from, lines[codeIndex].from + hiddenPrefixLength);
          }
        }

        const closeLine = lines[closeIndex];
        closeLine.kind = "codeFence";
        closeLine.codeBlockId = codeBlocks.length;
        closeLine.fenceStatus = "closed";
        addSyntaxRange(closeLine, closeLine.from, closeLine.to);
        addRichHiddenRange(closeLine, closeLine.from, closeLine.to);
        const languageFrom = openLine.from + opener.prefixLength + opener.markerLength;
        const languageTo = openLine.to;
        const containerPresentation = codeBlockContainerPresentation(hiddenPrefixText);
        codeBlocks.push({
          id: codeBlocks.length,
          from: openLine.from,
          to: closeLine.to,
          openerFrom: openLine.from,
          openerTo: openLine.to,
          openerMarkerFrom: openLine.from + opener.prefixLength,
          openerMarkerTo: openLine.from + opener.prefixLength + opener.markerLength,
          languageFrom,
          languageTo,
          closerFrom: closeLine.from,
          closerTo: closeLine.to,
          contentFrom: lines[index + 1]?.from ?? openLine.to,
          contentTo: closeLine.from,
          firstContentLine: lines[index + 1]?.number ?? openLine.number,
          lastContentLine: lines[closeIndex - 1]?.number ?? openLine.number,
          language: openLine.text.slice(languageFrom - openLine.from, languageTo - openLine.from).trim(),
          fenceChar: opener.char,
          fenceLength: opener.length,
          containerPrefix: hiddenPrefixText,
          containerIndentLevel: containerPresentation.indentLevel,
          containerQuoteDepth: containerPresentation.quoteDepth,
        });
        index = closeIndex + 1;
        continue;
      }

      const pendingLine = lines[index];
      markPendingFenceLine(pendingLine);
      index += 1;
      continue;
    }

    const setextLevel = markdownSetextHeadingLevel(
      lines[index].text,
      lines[index + 1]?.text ?? "",
    );
    if (setextLevel) {
      lines[index].kind = "heading";
      lines[index].headingLevel = setextLevel;
      lines[index + 1].hiddenInRich = true;
      addSyntaxRange(lines[index + 1], lines[index + 1].from, lines[index + 1].to);
      addRichHiddenRange(lines[index + 1], lines[index + 1].from, lines[index + 1].to);
      index += 2;
      continue;
    }

    analyzeNonCodeLine(lines[index]);
    index += 1;
  }
}

function markPendingFenceLine(line: TextBufferLine) {
  line.kind = "codeFence";
  line.fenceStatus = "pending";
  addSyntaxRange(line, line.from, line.to);
}

function applyHeadingNode(lines: TextBufferLine[], node: TextBufferSyntaxNode) {
  const atxMatch = node.name.match(/^ATXHeading([1-6])$/);
  const setextMatch = node.name.match(/^SetextHeading([12])$/);
  if (!atxMatch && !setextMatch) return;

  const headerMark = node.children.find((child) => child.name === "HeaderMark");
  const line = lineAtOffset(lines, node.from);
  if (!line || !headerMark) return;

  if (setextMatch) {
    const markerLine = lineAtOffset(lines, headerMark.from);
    if (!markerLine) return;
    const setextLevel = markdownSetextHeadingLevel(line.text, markerLine.text);
    if (!setextLevel) return;
    line.kind = "heading";
    line.headingLevel = setextLevel;
    markerLine.hiddenInRich = true;
    addSyntaxRange(markerLine, markerLine.from, markerLine.to);
    addRichHiddenRange(markerLine, markerLine.from, markerLine.to);
    return;
  }

  if (!atxMatch) return;
  line.kind = "heading";
  line.headingLevel = Number(atxMatch[1]);
  const markerTo = rangeWithFollowingInlineSpace(line, headerMark.to);
  addSyntaxRange(line, headerMark.from, markerTo);
  addRichHiddenRange(line, headerMark.from, markerTo);
}

function applyQuoteMarkNode(lines: TextBufferLine[], node: TextBufferSyntaxNode) {
  if (node.name !== "QuoteMark") return;
  const line = lineAtOffset(lines, node.from);
  if (!line) return;

  if (line.kind === "paragraph") line.kind = "blockquote";
  const markerTo = rangeWithFollowingInlineSpace(line, node.to);
  addSyntaxRange(line, node.from, markerTo);
  addRichHiddenRange(line, node.from, markerTo);
}

function applyListMarkNode(lines: TextBufferLine[], markdown: string, node: TextBufferSyntaxNode) {
  if (node.name !== "ListMark") return;
  const line = lineAtOffset(lines, node.from);
  if (!line) return;

  const marker = markdown.slice(node.from, node.to);
  if (line.kind === "paragraph") {
    line.kind = "list";
    line.listKind = /^\d/.test(marker) ? "ordered" : "bullet";
    line.listMarker = marker;
    const markerTo = rangeWithFollowingInlineSpace(line, node.to);
    addSyntaxRange(line, node.from, markerTo);
    addRichHiddenRange(line, node.from, markerTo);
  }
}

function fenceMarkerAtOffset(markdown: string, offset: number) {
  const match = markdown.slice(offset).match(/^(`{3,}|~{3,})/);
  if (!match) return null;
  return {
    from: offset,
    to: offset + match[1].length,
    char: match[1][0] as "`" | "~",
    length: match[1].length,
  };
}

function closingFenceMarkerInLine(line: TextBufferLine, fenceChar: "`" | "~", minLength: number) {
  const match = line.text.match(new RegExp(`(${fenceChar}{${minLength},})[ \\t]*$`));
  if (!match || match.index === undefined) return null;
  return {
    from: line.from + match.index,
    to: line.from + match.index + match[1].length,
  };
}

function hiddenCodeLinePrefixLength(text: string, openerPrefix: string) {
  if (!openerPrefix) return 0;

  let cursor = Math.min(markdownContainerPrefixLength(text), openerPrefix.length);
  while (cursor < text.length && cursor < openerPrefix.length && /[ \\t]/.test(text[cursor])) {
    cursor += 1;
  }
  return cursor;
}

function applyClosedFencedCodeBlock(
  lines: TextBufferLine[],
  markdown: string,
  codeBlocks: TextBufferCodeBlock[],
  openerMarkerFrom: number,
  openerMarkerTo: number,
  closerMarkerFrom: number,
  closerMarkerTo: number,
) {
  const openLineIndex = lineIndexAtOffset(lines, openerMarkerFrom);
  const closeLineIndex = lineIndexAtOffset(lines, closerMarkerFrom);
  if (openLineIndex < 0 || closeLineIndex <= openLineIndex) return false;

  const openLine = lines[openLineIndex];
  const closeLine = lines[closeLineIndex];
  const openerMarker = markdown.slice(openerMarkerFrom, openerMarkerTo);
  const closerMarker = markdown.slice(closerMarkerFrom, closerMarkerTo);
  const fenceChar = openerMarker[0] === "~" ? "~" : "`";
  if (
    openerMarker.length < 3
    || closerMarker[0] !== fenceChar
    || closerMarker.length < openerMarker.length
  ) return false;

  const prefixText = markdown.slice(openLine.from, openerMarkerFrom);
  const containerPrefixLength = markdownContainerPrefixLength(prefixText);
  if (prefixText.slice(containerPrefixLength).trim()) return false;
  const closerPrefixText = markdown.slice(closeLine.from, closerMarkerFrom);
  const closerContainerPrefixLength = markdownContainerPrefixLength(closerPrefixText);
  if (closerPrefixText.slice(closerContainerPrefixLength).trim()) return false;
  if (markdown.slice(closerMarkerTo, closeLine.to).trim()) return false;

  const languageFrom = openerMarkerTo;
  const languageTo = openLine.to;
  const language = markdown.slice(languageFrom, languageTo).trim();
  if (fenceChar === "`" && language.includes("`")) return false;

  const blockId = codeBlocks.length;
  const containerPresentation = codeBlockContainerPresentation(prefixText);
  openLine.kind = "codeFence";
  openLine.codeBlockId = blockId;
  openLine.fenceStatus = "closed";
  addSyntaxRange(openLine, openLine.from, openLine.to);
  addRichHiddenRange(openLine, openLine.from, openLine.to);

  for (let lineIndex = openLineIndex + 1; lineIndex < closeLineIndex; lineIndex += 1) {
    const line = lines[lineIndex];
    line.kind = "code";
    line.codeBlockId = blockId;
    const prefixLength = hiddenCodeLinePrefixLength(line.text, prefixText);
    if (prefixLength > 0) {
      addSyntaxRange(line, line.from, line.from + prefixLength);
      addRichHiddenRange(line, line.from, line.from + prefixLength);
    }
  }

  closeLine.kind = "codeFence";
  closeLine.codeBlockId = blockId;
  closeLine.fenceStatus = "closed";
  addSyntaxRange(closeLine, closeLine.from, closeLine.to);
  addRichHiddenRange(closeLine, closeLine.from, closeLine.to);

  codeBlocks.push({
    id: blockId,
    from: openLine.from,
    to: closeLine.to,
    openerFrom: openLine.from,
    openerTo: openLine.to,
    openerMarkerFrom,
    openerMarkerTo,
    languageFrom,
    languageTo,
    closerFrom: closeLine.from,
    closerTo: closeLine.to,
    contentFrom: lines[openLineIndex + 1]?.from ?? openLine.to,
    contentTo: closeLine.from,
    firstContentLine: lines[openLineIndex + 1]?.number ?? openLine.number,
    lastContentLine: lines[closeLineIndex - 1]?.number ?? openLine.number,
    language,
    fenceChar,
    fenceLength: openerMarker.length,
    containerPrefix: prefixText,
    containerIndentLevel: containerPresentation.indentLevel,
    containerQuoteDepth: containerPresentation.quoteDepth,
  });
  return true;
}

function applyFencedCodeNode(
  lines: TextBufferLine[],
  markdown: string,
  codeBlocks: TextBufferCodeBlock[],
  node: TextBufferSyntaxNode,
) {
  if (node.name === "InlineCode") {
    const codeMarks = node.children.filter((child) => child.name === "CodeMark");
    const openerMark = codeMarks[0];
    const closerMark = codeMarks[codeMarks.length - 1];
    if (!openerMark || !closerMark || codeMarks.length < 2) return false;
    const openerLine = lineAtOffset(lines, openerMark.from);
    const closerLine = lineAtOffset(lines, closerMark.from);
    if (!openerLine || !closerLine || openerLine.number === closerLine.number) return false;
    return applyClosedFencedCodeBlock(
      lines,
      markdown,
      codeBlocks,
      openerMark.from,
      openerMark.to,
      closerMark.from,
      closerMark.to,
    );
  }

  if (node.name === "FencedCode") {
    const codeMarks = node.children.filter((child) => child.name === "CodeMark");
    const openerMark = codeMarks[0];
    if (!openerMark) return node.name === "FencedCode";

    if (codeMarks.length < 2) {
      if (node.name === "FencedCode") {
        const openLine = lineAtOffset(lines, openerMark.from);
        if (openLine) markPendingFenceLine(openLine);
        return true;
      }
      return false;
    }

    const closerMark = codeMarks[codeMarks.length - 1];
    return applyClosedFencedCodeBlock(
      lines,
      markdown,
      codeBlocks,
      openerMark.from,
      openerMark.to,
      closerMark.from,
      closerMark.to,
    );
  }

  if (node.name !== "CodeBlock") return false;

  const opener = fenceMarkerAtOffset(markdown, node.from);
  if (!opener) return false;
  const closeLineIndex = lineIndexAtOffset(lines, Math.max(node.from, node.to - 1));
  if (closeLineIndex < 0) return false;
  const closer = closingFenceMarkerInLine(lines[closeLineIndex], opener.char, opener.length);
  if (!closer) return false;

  return applyClosedFencedCodeBlock(
    lines,
    markdown,
    codeBlocks,
    opener.from,
    opener.to,
    closer.from,
    closer.to,
  );
}

function markParagraphLines(lines: TextBufferLine[], paragraphLines: Set<number>, node: TextBufferSyntaxNode) {
  if (node.name !== "Paragraph") return;
  const fromIndex = lineIndexAtOffset(lines, node.from);
  const toIndex = lineIndexAtOffset(lines, Math.max(node.from, node.to - 1));
  if (fromIndex < 0 || toIndex < 0) return;
  for (let index = fromIndex; index <= toIndex; index += 1) {
    paragraphLines.add(lines[index].number);
  }
}

function applySyntaxTreeBlockAnalysis(
  lines: TextBufferLine[],
  markdown: string,
  codeBlocks: TextBufferCodeBlock[],
  syntaxTree: TextBufferSyntaxTree,
  contentStart: number,
  options: TextBufferMarkdownAnalysisOptions,
) {
  const root = syntaxNodeFromCursor(syntaxTree.cursor());
  const paragraphLines = new Set<number>();

  const visit = (node: TextBufferSyntaxNode) => {
    if (node.to <= contentStart) return;
    if (node.from >= contentStart) {
      markParagraphLines(lines, paragraphLines, node);
      applyHeadingNode(lines, node);
      applyQuoteMarkNode(lines, node);
      applyListMarkNode(lines, markdown, node);
      const nodeLine = lineAtOffset(lines, node.from);
      if (
        node.name === "FencedCode"
        && nodeLine
        && options.pendingFenceLines?.has(nodeLine.from)
      ) {
        markPendingFenceLine(nodeLine);
        return;
      }
      if (applyFencedCodeNode(lines, markdown, codeBlocks, node)) return;
    }
    node.children.forEach(visit);
  };

  visit(root);

  lines.forEach((line) => {
    if (line.from < contentStart) return;
    if (line.kind !== "paragraph" || paragraphLines.has(line.number)) return;
    analyzeNonCodeLine(line);
  });
}

export function analyzeTextBufferMarkdown(
  markdown: string,
  syntaxTree?: TextBufferSyntaxTree,
  options: TextBufferMarkdownAnalysisOptions = {},
): TextBufferMarkdownAnalysis {
  const frontmatter = splitYamlFrontmatter(markdown);
  const contentStart = frontmatter ? markdown.length - frontmatter.body.length : 0;
  const sourceLines = markdownLines(markdown);
  const lines: TextBufferLine[] = sourceLines.map((line) => ({
    ...line,
    kind: "paragraph",
    syntaxRanges: [],
    richHiddenRanges: [],
  }));
  const codeBlocks: TextBufferCodeBlock[] = [];

  if (syntaxTree) {
    applySyntaxTreeBlockAnalysis(lines, markdown, codeBlocks, syntaxTree, contentStart, options);
  } else {
    applyRegexBlockAnalysis(lines, codeBlocks, contentStart, options);
  }

  annotateRichContainerLines(lines);

  return { lines, codeBlocks };
}

function textBufferLineAtSelectionHead(
  analysis: TextBufferMarkdownAnalysis,
  head: number,
) {
  let selected = analysis.lines[0];
  for (const line of analysis.lines) {
    if (line.from > head) break;
    selected = line;
  }
  return selected;
}

function textBufferSelectableLine(
  analysis: TextBufferMarkdownAnalysis,
  line: TextBufferLine | undefined,
) {
  if (!line?.hiddenInRich) return line;
  const previous = analysis.lines[line.number - 2];
  return previous?.kind === "heading" ? previous : line;
}

function textBufferLineContentRange(line: TextBufferLine) {
  const structuralPrefix = line.richHiddenRanges.find((range) => (
    range.from >= line.from
    && range.to <= line.to
    && line.text.slice(0, range.from - line.from).trim() === ""
  ));
  return {
    from: structuralPrefix?.to ?? line.from,
    to: line.to,
  };
}

export function textBufferSmartSelectAllRange(
  markdown: string,
  analysis: TextBufferMarkdownAnalysis,
  selection: { from: number; to: number; head: number },
) {
  const block = analysis.codeBlocks.find((candidate) => (
    selection.head >= candidate.from && selection.head <= candidate.to
  ));
  if (block) {
    const contentRange = textBufferCodeBlockContentRange(markdown, analysis, block);
    if (contentRange.from === contentRange.to) return contentRange;
    if (selection.from !== contentRange.from || selection.to !== contentRange.to) return contentRange;
    return { from: 0, to: markdown.length };
  }

  const line = textBufferSelectableLine(
    analysis,
    textBufferLineAtSelectionHead(analysis, selection.head),
  );
  if (line) {
    const lineRange = textBufferLineContentRange(line);
    if (lineRange.from === lineRange.to) return lineRange;
    if (selection.from !== lineRange.from || selection.to !== lineRange.to) return lineRange;
  }

  return { from: 0, to: markdown.length };
}

export function textBufferCodeBlockContentRange(
  markdown: string,
  analysis: TextBufferMarkdownAnalysis,
  block: TextBufferCodeBlock,
) {
  if (block.firstContentLine > block.lastContentLine) {
    return { from: block.contentFrom, to: block.contentFrom };
  }

  const firstContentLine = analysis.lines.find((line) => line.number === block.firstContentLine);
  const firstPrefixLength = firstContentLine
    ? hiddenCodeLinePrefixLength(firstContentLine.text, block.containerPrefix)
    : 0;
  const from = Math.min(block.contentTo, block.contentFrom + firstPrefixLength);
  const to = block.contentTo > from && markdown[block.contentTo - 1] === "\n"
    ? block.contentTo - 1
    : block.contentTo;
  return { from, to: Math.max(from, to) };
}

export function normalizeTextBufferCodeBlockSelectionText(text: string, block: TextBufferCodeBlock) {
  if (!block.containerPrefix || !text.includes("\n")) return text;
  return text.split("\n").map((line, index) => (
    index === 0 ? line : line.slice(hiddenCodeLinePrefixLength(line, block.containerPrefix))
  )).join("\n");
}

function lineRangeWithBreak(markdown: string, from: number, to: number) {
  return {
    from,
    to: to < markdown.length && markdown[to] === "\n" ? to + 1 : to,
  };
}

function subtractTextBufferRange(
  ranges: Array<{ from: number; to: number }>,
  excluded: { from: number; to: number },
) {
  return ranges.flatMap((range) => {
    if (excluded.to <= range.from || excluded.from >= range.to) return [range];
    const remaining: Array<{ from: number; to: number }> = [];
    if (range.from < excluded.from) remaining.push({ from: range.from, to: excluded.from });
    if (excluded.to < range.to) remaining.push({ from: excluded.to, to: range.to });
    return remaining;
  });
}

export function textBufferVisibleClipboardRanges(
  markdown: string,
  analysis: TextBufferMarkdownAnalysis,
  selection: { from: number; to: number },
) {
  let ranges = selection.to > selection.from ? [{ from: selection.from, to: selection.to }] : [];

  analysis.codeBlocks.forEach((block) => {
    if (selection.from <= block.from && selection.to >= block.to) return;
    ranges = subtractTextBufferRange(
      ranges,
      lineRangeWithBreak(markdown, block.openerFrom, block.openerTo),
    );
    ranges = subtractTextBufferRange(
      ranges,
      lineRangeWithBreak(markdown, block.closerFrom, block.closerTo),
    );
  });

  return ranges.filter((range) => range.to > range.from);
}

export function textBufferSafeCutRanges(
  markdown: string,
  analysis: TextBufferMarkdownAnalysis,
  ranges: Array<{ from: number; to: number }>,
) {
  return ranges.map((range) => {
    const block = analysis.codeBlocks.find((candidate) => (
      range.from >= candidate.contentFrom
      && range.from <= candidate.contentTo
      && range.to === candidate.closerFrom
      && range.to > range.from
      && markdown[range.to - 1] === "\n"
    ));
    return block ? { from: range.from, to: range.to - 1 } : range;
  }).filter((range) => range.to > range.from);
}

export function textBufferCodeBlockReplacementText(text: string, block: TextBufferCodeBlock) {
  if (!block.containerPrefix || !text.includes("\n")) return text;
  return text.replace(/\n/g, `\n${block.containerPrefix}`);
}

export function isTextBufferCodeBlockEmpty(block: TextBufferCodeBlock) {
  return block.firstContentLine > block.lastContentLine;
}

export function isTextBufferCodeBlockBlank(markdown: string, block: TextBufferCodeBlock) {
  if (isTextBufferCodeBlockEmpty(block)) return true;
  const content = markdown.slice(block.contentFrom, block.contentTo);
  return normalizeTextBufferCodeBlockSelectionText(content, block).trim().length === 0;
}

export function isTextBufferCodeBlockPhysicalLastLine(block: TextBufferCodeBlock, lineNumber: number) {
  return !isTextBufferCodeBlockEmpty(block) && lineNumber === block.lastContentLine;
}

export function textBufferCodeBlockLineState(
  analysis: TextBufferMarkdownAnalysis,
  block: TextBufferCodeBlock,
  lineNumber: number,
) {
  const line = analysis.lines.find((candidate) => candidate.number === lineNumber);
  if (
    !line
    || isTextBufferCodeBlockEmpty(block)
    || lineNumber < block.firstContentLine
    || lineNumber > block.lastContentLine
  ) {
    return {
      isFirstLine: false,
      isLastLine: false,
      isBlank: false,
      blankLinesBefore: 0,
      hasNonBlankBefore: false,
    };
  }

  const previousLines = analysis.lines.filter((candidate) => (
    candidate.number >= block.firstContentLine
    && candidate.number < lineNumber
  ));
  let blankLinesBefore = 0;
  for (let index = previousLines.length - 1; index >= 0; index -= 1) {
    if (stripTextBufferContainerPrefix(previousLines[index].text).trim()) break;
    blankLinesBefore += 1;
  }

  return {
    isFirstLine: lineNumber === block.firstContentLine,
    isLastLine: lineNumber === block.lastContentLine,
    isBlank: stripTextBufferContainerPrefix(line.text).trim() === "",
    blankLinesBefore,
    hasNonBlankBefore: previousLines.some((candidate) => (
      Boolean(stripTextBufferContainerPrefix(candidate.text).trim())
    )),
  };
}

export function shouldExitTextBufferCodeBlockOnEnter(
  analysis: TextBufferMarkdownAnalysis,
  block: TextBufferCodeBlock,
  lineNumber: number,
) {
  const line = textBufferCodeBlockLineState(analysis, block, lineNumber);
  return line.isLastLine
    && line.isBlank
    && line.hasNonBlankBefore
    && line.blankLinesBefore >= 2;
}
