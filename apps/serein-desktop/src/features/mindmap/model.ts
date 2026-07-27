export type MindmapStructureNodeKind = "root" | "heading" | "list";
export type MindmapContentNodeKind = "paragraph" | "quote" | "code" | "table" | "image";
export type MindmapNodeKind = MindmapStructureNodeKind | MindmapContentNodeKind;

export type MindmapBodySummary = {
  paragraphs: number;
  images: number;
  tables: number;
  codeBlocks: number;
  tasks: number;
};

export type MindmapRootSource =
  | { kind: "frontmatter"; contentFrom: number; contentTo: number }
  | { kind: "heading"; contentFrom: number; contentTo: number; lineFrom: number; lineTo: number }
  | { kind: "filename"; insertAt: number };

export type MarkdownMindmapNode = {
  id: string;
  kind: MindmapNodeKind;
  text: string;
  parentId: string | null;
  children: MarkdownMindmapNode[];
  lineFrom: number;
  lineTo: number;
  contentFrom: number;
  contentTo: number;
  bodyFrom: number;
  bodyTo: number;
  subtreeTo: number;
  bodyMarkdown: string;
  bodySummary: MindmapBodySummary;
  headingLevel?: number;
  listKind?: "bullet" | "ordered";
  listMarker?: string;
  listIndent?: number;
  taskChecked?: boolean | null;
  rootSource?: MindmapRootSource;
  sourceMarkdown?: string;
};

export type MarkdownMindmap = {
  markdown: string;
  root: MarkdownMindmapNode;
  nodes: MarkdownMindmapNode[];
  nodeById: Map<string, MarkdownMindmapNode>;
};

export type MindmapTextChange = {
  from: number;
  to: number;
  insert: string;
};

export type MindmapMutation = {
  changes: MindmapTextChange[];
  userEvent:
    | "mindmap.rename"
    | "mindmap.insert"
    | "mindmap.move"
    | "mindmap.delete"
    | "mindmap.body"
    | "mindmap.task";
};

export type MindmapMutationResult =
  | { ok: true; mutation: MindmapMutation }
  | { ok: false; reason: "root" | "invalid-target" | "heading-into-list" | "heading-depth" | "no-sibling" | "stale" };

type SourceLine = {
  index: number;
  from: number;
  to: number;
  end: number;
  text: string;
};

type StructureToken = {
  kind: "heading" | "list";
  line: SourceLine;
  text: string;
  contentFrom: number;
  contentTo: number;
  headingLevel?: number;
  listKind?: "bullet" | "ordered";
  listMarker?: string;
  listIndent?: number;
  taskChecked?: boolean | null;
};

type DraftNode = Omit<MarkdownMindmapNode, "children" | "bodyMarkdown" | "bodySummary" | "subtreeTo"> & {
  children: DraftNode[];
  segmentTo: number;
};

function sourceLines(markdown: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let from = 0;
  let index = 0;
  while (from <= markdown.length) {
    const newline = markdown.indexOf("\n", from);
    const end = newline < 0 ? markdown.length : newline + 1;
    const rawTo = newline < 0 ? markdown.length : newline;
    const to = rawTo > from && markdown[rawTo - 1] === "\r" ? rawTo - 1 : rawTo;
    lines.push({ index, from, to, end, text: markdown.slice(from, to) });
    index += 1;
    if (newline < 0) break;
    from = end;
  }
  return lines;
}

function indentationColumns(value: string) {
  return [...value].reduce((columns, character) => columns + (character === "\t" ? 4 : 1), 0);
}

function frontmatterBoundary(lines: SourceLine[]) {
  if (lines[0]?.text.trim() !== "---") return { start: -1, end: -1, bodyFrom: 0 };
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].text.trim() !== "---") continue;
    return { start: 0, end: index, bodyFrom: lines[index].end };
  }
  return { start: -1, end: -1, bodyFrom: 0 };
}

function decodeYamlTitle(value: string) {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const quote = trimmed[0];
    if ((quote === "\"" || quote === "'") && trimmed[trimmed.length - 1] === quote) {
      if (quote === "\"") {
        try {
          return JSON.parse(trimmed) as string;
        } catch {
          return trimmed.slice(1, -1);
        }
      }
      return trimmed.slice(1, -1).replace(/''/g, "'");
    }
  }
  return trimmed;
}

function frontmatterTitle(lines: SourceLine[], boundary: ReturnType<typeof frontmatterBoundary>) {
  if (boundary.start < 0) return null;
  for (let index = boundary.start + 1; index < boundary.end; index += 1) {
    const match = lines[index].text.match(/^(\s*title\s*:\s*)(.*)$/i);
    if (!match) continue;
    return {
      text: decodeYamlTitle(match[2]),
      source: {
        kind: "frontmatter" as const,
        contentFrom: lines[index].from + match[1].length,
        contentTo: lines[index].to,
      },
    };
  }
  return null;
}

function tokenizeMarkdown(markdown: string, lines: SourceLine[], boundary: ReturnType<typeof frontmatterBoundary>) {
  const tokens: StructureToken[] = [];
  let fence: { marker: "`" | "~"; length: number } | null = null;

  for (const line of lines) {
    if (boundary.start >= 0 && line.index >= boundary.start && line.index <= boundary.end) continue;

    if (fence) {
      const close = line.text.match(/^ {0,3}([`~]+)\s*$/);
      if (close && close[1][0] === fence.marker && close[1].length >= fence.length) fence = null;
      continue;
    }

    const opener = line.text.match(/^ {0,3}([`~]{3,})(.*)$/);
    if (opener) {
      fence = { marker: opener[1][0] as "`" | "~", length: opener[1].length };
      continue;
    }

    const heading = line.text.match(/^( {0,3})(#{1,6})[ \t]+(.+?)\s*#*\s*$/);
    if (heading) {
      const contentOffset = heading[1].length + heading[2].length + line.text.slice(heading[1].length + heading[2].length).match(/^[ \t]+/)![0].length;
      const trailing = heading[3];
      tokens.push({
        kind: "heading",
        line,
        text: trailing,
        contentFrom: line.from + contentOffset,
        contentTo: line.from + contentOffset + trailing.length,
        headingLevel: heading[2].length,
      });
      continue;
    }

    const list = line.text.match(/^([ \t]*)([-+*]|\d+[.)])[ \t]+(?:\[([ xX])\][ \t]+)?(.+?)\s*$/);
    if (!list) continue;
    const prefixLength = list[1].length + list[2].length
      + line.text.slice(list[1].length + list[2].length).match(/^[ \t]+/)![0].length;
    const taskPrefix = list[3] === undefined ? 0 : line.text.slice(prefixLength).match(/^\[[ xX]\][ \t]+/)![0].length;
    const contentFrom = line.from + prefixLength + taskPrefix;
    tokens.push({
      kind: "list",
      line,
      text: list[4],
      contentFrom,
      contentTo: contentFrom + list[4].length,
      listKind: /^\d/.test(list[2]) ? "ordered" : "bullet",
      listMarker: list[2],
      listIndent: indentationColumns(list[1]),
      taskChecked: list[3] === undefined ? null : list[3].toLowerCase() === "x",
    });
  }

  return tokens;
}

function summarizeBody(markdown: string): MindmapBodySummary {
  const trimmed = markdown.trim();
  if (!trimmed) return { paragraphs: 0, images: 0, tables: 0, codeBlocks: 0, tasks: 0 };
  const lines = trimmed.split(/\r?\n/);
  const images = (markdown.match(/!\[[^\]]*\]\([^\n)]+\)/g) ?? []).length;
  const codeBlocks = (markdown.match(/^ {0,3}(?:`{3,}|~{3,})/gm) ?? []).length / 2;
  const tasks = (markdown.match(/^\s*[-+*]\s+\[[ xX]\]\s+/gm) ?? []).length;
  let tableRows = 0;
  let paragraphGroups = 0;
  let inParagraph = false;
  for (const line of lines) {
    const text = line.trim();
    if (!text) {
      inParagraph = false;
      continue;
    }
    if (/^\|.*\|$/.test(text)) tableRows += 1;
    if (/^(?:`{3,}|~{3,}|\|.*\||>|[-+*]\s+|\d+[.)]\s+)/.test(text)) {
      inParagraph = false;
      continue;
    }
    if (!inParagraph) paragraphGroups += 1;
    inParagraph = true;
  }
  return {
    paragraphs: paragraphGroups,
    images,
    tables: tableRows >= 2 ? 1 : 0,
    codeBlocks: Math.ceil(codeBlocks),
    tasks,
  };
}

function emptyBodySummary(): MindmapBodySummary {
  return { paragraphs: 0, images: 0, tables: 0, codeBlocks: 0, tasks: 0 };
}

function isTableDivider(value: string) {
  const cells = value.trim().replace(/^\||\|$/g, "").split("|");
  return cells.length > 0 && cells.every((cell) => /^\s*:?-{3,}:?\s*$/.test(cell));
}

function plainBlockText(kind: MindmapContentNodeKind, source: string) {
  if (kind === "code") {
    const lines = source.split(/\r?\n/);
    const body = lines.slice(1, /^\s*([`~]{3,})\s*$/.test(lines[lines.length - 1] ?? "") ? -1 : undefined).join("\n").trim();
    return body || lines[0].replace(/^\s*[`~]{3,}/, "").trim() || "Code";
  }
  if (kind === "quote") return source.replace(/^\s*>\s?/gm, "").trim();
  if (kind === "image") {
    const alt = source.match(/!\[([^\]]*)\]/)?.[1]?.trim();
    return alt || "Image";
  }
  return source
    .replace(/^\s*\|?|\|?\s*$/gm, "")
    .replace(/[*_~`]/g, "")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

function bodyBlockNodes(
  markdown: string,
  parentId: string,
  bodyFrom: number,
  bodyTo: number,
): MarkdownMindmapNode[] {
  if (bodyTo <= bodyFrom) return [];
  const lines = sourceLines(markdown).filter((line) => line.from >= bodyFrom && line.from < bodyTo);
  const nodes: MarkdownMindmapNode[] = [];
  const tableStartsAt = (index: number) => {
    const header = lines[index]?.text.trim();
    const divider = lines[index + 1]?.text.trim();
    return Boolean(header?.includes("|") && divider?.includes("|") && isTableDivider(divider));
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.text.trim()) {
      index += 1;
      continue;
    }

    let kind: MindmapContentNodeKind = "paragraph";
    let lastIndex = index;
    const opener = line.text.match(/^ {0,3}([`~]{3,})(.*)$/);
    if (opener) {
      kind = "code";
      const marker = opener[1][0];
      const markerLength = opener[1].length;
      while (lastIndex + 1 < lines.length) {
        lastIndex += 1;
        const close = lines[lastIndex].text.match(/^ {0,3}([`~]+)\s*$/);
        if (close && close[1][0] === marker && close[1].length >= markerLength) break;
      }
    } else if (tableStartsAt(index)) {
      kind = "table";
      lastIndex = index + 1;
      while (lastIndex + 1 < lines.length && lines[lastIndex + 1].text.trim().includes("|")) lastIndex += 1;
    } else if (/^\s*>/.test(line.text)) {
      kind = "quote";
      while (lastIndex + 1 < lines.length && /^\s*>/.test(lines[lastIndex + 1].text)) lastIndex += 1;
    } else if (/^\s*!\[[^\]]*\]\([^\n)]+\)\s*$/.test(line.text)) {
      kind = "image";
    } else {
      while (lastIndex + 1 < lines.length) {
        const next = lines[lastIndex + 1];
        if (!next.text.trim()
          || /^ {0,3}[`~]{3,}/.test(next.text)
          || /^\s*>/.test(next.text)
          || /^\s*!\[[^\]]*\]\([^\n)]+\)\s*$/.test(next.text)
          || tableStartsAt(lastIndex + 1)) break;
        lastIndex += 1;
      }
    }

    const blockFrom = line.from;
    const blockTo = Math.min(bodyTo, lines[lastIndex].to);
    const sourceMarkdown = markdown.slice(blockFrom, blockTo);
    const text = plainBlockText(kind, sourceMarkdown) || kind;
    nodes.push({
      id: `content:${kind}:${blockFrom}`,
      kind,
      text,
      parentId,
      children: [],
      lineFrom: blockFrom,
      lineTo: blockTo,
      contentFrom: blockFrom,
      contentTo: blockTo,
      bodyFrom: blockTo,
      bodyTo: blockTo,
      subtreeTo: blockTo,
      bodyMarkdown: "",
      bodySummary: emptyBodySummary(),
      sourceMarkdown,
    });
    index = lastIndex + 1;
  }
  return nodes;
}

function trailingStructuralBoundary(tokens: StructureToken[], token: StructureToken, markdownLength: number) {
  const index = tokens.indexOf(token);
  return index >= 0 && index + 1 < tokens.length ? tokens[index + 1].line.from : markdownLength;
}

function finalizeNode(markdown: string, draft: DraftNode): MarkdownMindmapNode {
  const children = [
    ...bodyBlockNodes(markdown, draft.id, draft.bodyFrom, draft.bodyTo),
    ...draft.children.map((child) => finalizeNode(markdown, child)),
  ].sort((left, right) => left.lineFrom - right.lineFrom);
  const subtreeTo = children.length ? children[children.length - 1].subtreeTo : draft.segmentTo;
  const bodyMarkdown = markdown.slice(draft.bodyFrom, draft.bodyTo);
  return {
    ...draft,
    children,
    subtreeTo: Math.max(draft.segmentTo, subtreeTo),
    bodyMarkdown,
    bodySummary: summarizeBody(bodyMarkdown),
  };
}

export function isMindmapStructureNode(node: MarkdownMindmapNode): node is MarkdownMindmapNode & { kind: MindmapStructureNodeKind } {
  return node.kind === "root" || node.kind === "heading" || node.kind === "list";
}

export function parseMarkdownMindmap(markdown: string, fallbackTitle = "Untitled"): MarkdownMindmap {
  const lines = sourceLines(markdown);
  const boundary = frontmatterBoundary(lines);
  const tokens = tokenizeMarkdown(markdown, lines, boundary);
  const yamlTitle = frontmatterTitle(lines, boundary);
  const firstH1 = yamlTitle ? null : tokens.find((token) => token.kind === "heading" && token.headingLevel === 1) ?? null;
  const rootSource: MindmapRootSource = yamlTitle?.source ?? (firstH1
    ? {
      kind: "heading",
      contentFrom: firstH1.contentFrom,
      contentTo: firstH1.contentTo,
      lineFrom: firstH1.line.from,
      lineTo: firstH1.line.to,
    }
    : { kind: "filename", insertAt: boundary.bodyFrom });
  const rootText = yamlTitle?.text || firstH1?.text || fallbackTitle || "Untitled";
  const rootBodyFrom = rootSource.kind === "heading"
    ? lines.find((line) => line.from === rootSource.lineFrom)?.end ?? rootSource.lineTo
    : boundary.bodyFrom;
  const rootBodyTo = tokens.find((token) => token !== firstH1 && token.line.from >= rootBodyFrom)?.line.from
    ?? markdown.length;

  const rootDraft: DraftNode = {
    id: "root",
    kind: "root",
    text: rootText,
    parentId: null,
    children: [],
    lineFrom: rootSource.kind === "heading" ? rootSource.lineFrom : 0,
    lineTo: rootSource.kind === "heading" ? rootSource.lineTo : boundary.bodyFrom,
    contentFrom: rootSource.kind === "filename" ? rootSource.insertAt : rootSource.contentFrom,
    contentTo: rootSource.kind === "filename" ? rootSource.insertAt : rootSource.contentTo,
    bodyFrom: rootBodyFrom,
    bodyTo: rootBodyTo,
    segmentTo: markdown.length,
    rootSource,
  };

  const headingStack: DraftNode[] = [];
  const listStack: DraftNode[] = [];
  const drafts: DraftNode[] = [];

  for (const token of tokens) {
    if (token === firstH1) {
      headingStack.length = 0;
      listStack.length = 0;
      continue;
    }

    let parent: DraftNode = rootDraft;
    if (token.kind === "heading") {
      listStack.length = 0;
      while (headingStack.length && (headingStack[headingStack.length - 1].headingLevel ?? 0) >= (token.headingLevel ?? 1)) {
        headingStack.pop();
      }
      parent = headingStack[headingStack.length - 1] ?? rootDraft;
    } else {
      const indent = token.listIndent ?? 0;
      while (listStack.length && (listStack[listStack.length - 1].listIndent ?? 0) >= indent) listStack.pop();
      parent = listStack[listStack.length - 1] ?? headingStack[headingStack.length - 1] ?? rootDraft;
    }

    const segmentTo = trailingStructuralBoundary(tokens, token, markdown.length);
    const draft: DraftNode = {
      id: `${token.kind}:${token.line.from}`,
      kind: token.kind,
      text: token.text,
      parentId: parent.id,
      children: [],
      lineFrom: token.line.from,
      lineTo: token.line.to,
      contentFrom: token.contentFrom,
      contentTo: token.contentTo,
      bodyFrom: token.line.end,
      bodyTo: segmentTo,
      segmentTo,
      headingLevel: token.headingLevel,
      listKind: token.listKind,
      listMarker: token.listMarker,
      listIndent: token.listIndent,
      taskChecked: token.taskChecked,
    };
    parent.children.push(draft);
    drafts.push(draft);
    if (token.kind === "heading") headingStack.push(draft);
    else listStack.push(draft);
  }

  const root = finalizeNode(markdown, rootDraft);
  const nodes: MarkdownMindmapNode[] = [];
  const nodeById = new Map<string, MarkdownMindmapNode>();
  const visit = (node: MarkdownMindmapNode) => {
    nodes.push(node);
    nodeById.set(node.id, node);
    node.children.forEach(visit);
  };
  visit(root);
  return { markdown, root, nodes, nodeById };
}

function mutation(changes: MindmapTextChange[], userEvent: MindmapMutation["userEvent"]): MindmapMutationResult {
  return { ok: true, mutation: { changes: [...changes].sort((left, right) => left.from - right.from), userEvent } };
}

function normalizeNodeText(value: string) {
  return value.replace(/\s*\r?\n\s*/g, " ").trim() || "Untitled";
}

function yamlString(value: string) {
  return JSON.stringify(normalizeNodeText(value));
}

function insertionText(markdown: string, at: number, line: string) {
  const before = at > 0 ? markdown[at - 1] : "";
  const after = at < markdown.length ? markdown[at] : "";
  return `${before && before !== "\n" ? "\n" : ""}${line}\n${after && after !== "\n" ? "\n" : ""}`;
}

export function renameMindmapNode(map: MarkdownMindmap, nodeId: string, value: string): MindmapMutationResult {
  const node = map.nodeById.get(nodeId);
  if (!node) return { ok: false, reason: "stale" };
  if (!isMindmapStructureNode(node)) return { ok: false, reason: "invalid-target" };
  const text = normalizeNodeText(value);
  if (node.kind !== "root") {
    return mutation([{ from: node.contentFrom, to: node.contentTo, insert: text }], "mindmap.rename");
  }
  const source = node.rootSource;
  if (!source) return { ok: false, reason: "root" };
  if (source.kind === "frontmatter") {
    return mutation([{ from: source.contentFrom, to: source.contentTo, insert: yamlString(text) }], "mindmap.rename");
  }
  if (source.kind === "heading") {
    return mutation([{ from: source.contentFrom, to: source.contentTo, insert: text }], "mindmap.rename");
  }
  return mutation([{ from: source.insertAt, to: source.insertAt, insert: insertionText(map.markdown, source.insertAt, `# ${text}`) }], "mindmap.rename");
}

export function updateMindmapNodeBody(map: MarkdownMindmap, nodeId: string, body: string): MindmapMutationResult {
  const node = map.nodeById.get(nodeId);
  if (!node) return { ok: false, reason: "stale" };
  if (!isMindmapStructureNode(node)) return { ok: false, reason: "invalid-target" };
  return mutation([{ from: node.bodyFrom, to: node.bodyTo, insert: body }], "mindmap.body");
}

export function updateMindmapNodeContent(map: MarkdownMindmap, nodeId: string, source: string): MindmapMutationResult {
  const node = map.nodeById.get(nodeId);
  if (!node) return { ok: false, reason: "stale" };
  if (isMindmapStructureNode(node)) return { ok: false, reason: "invalid-target" };
  return mutation([{ from: node.contentFrom, to: node.contentTo, insert: source }], "mindmap.body");
}

export function toggleMindmapTask(map: MarkdownMindmap, nodeId: string): MindmapMutationResult {
  const node = map.nodeById.get(nodeId);
  if (!node || node.kind !== "list" || node.taskChecked === null || node.taskChecked === undefined) {
    return { ok: false, reason: "invalid-target" };
  }
  const prefix = map.markdown.slice(node.lineFrom, node.contentFrom);
  const task = prefix.match(/\[([ xX])\]/);
  if (!task || task.index === undefined) return { ok: false, reason: "stale" };
  const from = node.lineFrom + task.index + 1;
  return mutation([{ from, to: from + 1, insert: node.taskChecked ? " " : "x" }], "mindmap.task");
}

export function addMindmapChild(map: MarkdownMindmap, nodeId: string, label = "New node"): MindmapMutationResult {
  const node = map.nodeById.get(nodeId);
  if (!node) return { ok: false, reason: "stale" };
  if (!isMindmapStructureNode(node)) return { ok: false, reason: "invalid-target" };
  let line: string;
  if (node.kind === "list") {
    line = `${" ".repeat((node.listIndent ?? 0) + 2)}- ${normalizeNodeText(label)}`;
  } else {
    const level = node.kind === "root"
      ? (node.rootSource?.kind === "heading" ? 2 : 1)
      : (node.headingLevel ?? 1) + 1;
    line = level <= 6 ? `${"#".repeat(level)} ${normalizeNodeText(label)}` : `- ${normalizeNodeText(label)}`;
  }
  return mutation([{ from: node.subtreeTo, to: node.subtreeTo, insert: insertionText(map.markdown, node.subtreeTo, line) }], "mindmap.insert");
}

export function addMindmapSibling(map: MarkdownMindmap, nodeId: string, label = "New node"): MindmapMutationResult {
  const node = map.nodeById.get(nodeId);
  if (!node) return { ok: false, reason: "stale" };
  if (!isMindmapStructureNode(node)) return { ok: false, reason: "invalid-target" };
  if (node.kind === "root") return { ok: false, reason: "root" };
  const line = node.kind === "heading"
    ? `${"#".repeat(node.headingLevel ?? 1)} ${normalizeNodeText(label)}`
    : `${" ".repeat(node.listIndent ?? 0)}${node.listKind === "ordered" ? "1." : "-"} ${normalizeNodeText(label)}`;
  return mutation([{ from: node.subtreeTo, to: node.subtreeTo, insert: insertionText(map.markdown, node.subtreeTo, line) }], "mindmap.insert");
}

export function deleteMindmapBranch(map: MarkdownMindmap, nodeId: string): MindmapMutationResult {
  const node = map.nodeById.get(nodeId);
  if (!node) return { ok: false, reason: "stale" };
  if (node.kind === "root") return { ok: false, reason: "root" };
  return mutation([{ from: node.lineFrom, to: node.subtreeTo, insert: "" }], "mindmap.delete");
}

function adjustHeadingLevels(source: string, delta: number) {
  let inFence: { marker: string; length: number } | null = null;
  return source.split("\n").map((line) => {
    if (inFence) {
      const close = line.match(/^ {0,3}([`~]+)\s*$/);
      if (close && close[1][0] === inFence.marker && close[1].length >= inFence.length) inFence = null;
      return line;
    }
    const opener = line.match(/^ {0,3}([`~]{3,})/);
    if (opener) {
      inFence = { marker: opener[1][0], length: opener[1].length };
      return line;
    }
    return line.replace(/^( {0,3})(#{1,6})([ \t]+)/, (_match, indent: string, marks: string, spacing: string) => (
      `${indent}${"#".repeat(marks.length + delta)}${spacing}`
    ));
  }).join("\n");
}

function adjustListIndent(source: string, delta: number) {
  return source.split("\n").map((line) => {
    if (!line.trim()) return line;
    const leading = line.match(/^[ \t]*/)?.[0] ?? "";
    if (delta >= 0) return `${" ".repeat(delta)}${line}`;
    let remove = Math.min(leading.replace(/\t/g, "    ").length, -delta);
    let cursor = 0;
    while (cursor < leading.length && remove > 0) {
      remove -= leading[cursor] === "\t" ? 4 : 1;
      cursor += 1;
    }
    return line.slice(cursor);
  }).join("\n");
}

function movedSliceChanges(map: MarkdownMindmap, node: MarkdownMindmapNode, targetAt: number, source: string): MindmapMutationResult {
  if (targetAt >= node.lineFrom && targetAt < node.subtreeTo) return { ok: false, reason: "invalid-target" };
  let insert = source;
  if (targetAt > 0 && map.markdown[targetAt - 1] !== "\n" && !insert.startsWith("\n")) insert = `\n${insert}`;
  if (targetAt < map.markdown.length && map.markdown[targetAt] !== "\n" && !insert.endsWith("\n")) insert = `${insert}\n`;
  return mutation([
    { from: node.lineFrom, to: node.subtreeTo, insert: "" },
    { from: targetAt, to: targetAt, insert },
  ], "mindmap.move");
}

export function moveMindmapNodeAsChild(map: MarkdownMindmap, nodeId: string, targetId: string): MindmapMutationResult {
  const node = map.nodeById.get(nodeId);
  const target = map.nodeById.get(targetId);
  if (!node || !target) return { ok: false, reason: "stale" };
  if (!isMindmapStructureNode(node) || !isMindmapStructureNode(target)) return { ok: false, reason: "invalid-target" };
  if (node.kind === "root" || node.id === target.id) return { ok: false, reason: "invalid-target" };
  if (target.lineFrom >= node.lineFrom && target.lineFrom < node.subtreeTo) return { ok: false, reason: "invalid-target" };
  if (node.kind === "heading" && target.kind === "list") return { ok: false, reason: "heading-into-list" };

  let source = map.markdown.slice(node.lineFrom, node.subtreeTo);
  if (node.kind === "heading") {
    const desiredLevel = target.kind === "root"
      ? (target.rootSource?.kind === "heading" ? 2 : 1)
      : (target.headingLevel ?? 1) + 1;
    const delta = desiredLevel - (node.headingLevel ?? 1);
    const headingLevels = [...source.matchAll(/^ {0,3}(#{1,6})[ \t]+/gm)].map((match) => match[1].length + delta);
    if (headingLevels.some((level) => level < 1 || level > 6)) return { ok: false, reason: "heading-depth" };
    source = adjustHeadingLevels(source, delta);
  } else {
    const desiredIndent = target.kind === "list" ? (target.listIndent ?? 0) + 2 : 0;
    source = adjustListIndent(source, desiredIndent - (node.listIndent ?? 0));
  }
  return movedSliceChanges(map, node, target.subtreeTo, source);
}

function siblingContext(map: MarkdownMindmap, node: MarkdownMindmapNode) {
  const parent = node.parentId ? map.nodeById.get(node.parentId) : null;
  const siblings = (parent?.children ?? []).filter(isMindmapStructureNode);
  return { parent, siblings, index: siblings.findIndex((sibling) => sibling.id === node.id) };
}

export function moveMindmapNodeUp(map: MarkdownMindmap, nodeId: string): MindmapMutationResult {
  const node = map.nodeById.get(nodeId);
  if (!node || node.kind === "root") return { ok: false, reason: "root" };
  if (!isMindmapStructureNode(node)) return { ok: false, reason: "invalid-target" };
  const { siblings, index } = siblingContext(map, node);
  if (index <= 0) return { ok: false, reason: "no-sibling" };
  return movedSliceChanges(map, node, siblings[index - 1].lineFrom, map.markdown.slice(node.lineFrom, node.subtreeTo));
}

export function moveMindmapNodeDown(map: MarkdownMindmap, nodeId: string): MindmapMutationResult {
  const node = map.nodeById.get(nodeId);
  if (!node || node.kind === "root") return { ok: false, reason: "root" };
  if (!isMindmapStructureNode(node)) return { ok: false, reason: "invalid-target" };
  const { siblings, index } = siblingContext(map, node);
  if (index < 0 || index >= siblings.length - 1) return { ok: false, reason: "no-sibling" };
  return movedSliceChanges(map, node, siblings[index + 1].subtreeTo, map.markdown.slice(node.lineFrom, node.subtreeTo));
}

export function indentMindmapNode(map: MarkdownMindmap, nodeId: string): MindmapMutationResult {
  const node = map.nodeById.get(nodeId);
  if (!node || node.kind === "root") return { ok: false, reason: "root" };
  if (!isMindmapStructureNode(node)) return { ok: false, reason: "invalid-target" };
  const { siblings, index } = siblingContext(map, node);
  if (index <= 0) return { ok: false, reason: "no-sibling" };
  return moveMindmapNodeAsChild(map, node.id, siblings[index - 1].id);
}

export function outdentMindmapNode(map: MarkdownMindmap, nodeId: string): MindmapMutationResult {
  const node = map.nodeById.get(nodeId);
  if (!node || node.kind === "root" || !node.parentId) return { ok: false, reason: "root" };
  if (!isMindmapStructureNode(node)) return { ok: false, reason: "invalid-target" };
  const parent = map.nodeById.get(node.parentId);
  if (!parent || parent.kind === "root" || !parent.parentId) return { ok: false, reason: "no-sibling" };
  const grandparent = map.nodeById.get(parent.parentId);
  if (!grandparent) return { ok: false, reason: "stale" };
  if (node.kind === "heading" && grandparent.kind === "list") return { ok: false, reason: "heading-into-list" };

  let source = map.markdown.slice(node.lineFrom, node.subtreeTo);
  if (node.kind === "heading") {
    const desiredLevel = grandparent.kind === "root"
      ? (grandparent.rootSource?.kind === "heading" ? 2 : 1)
      : (grandparent.headingLevel ?? 1) + 1;
    const delta = desiredLevel - (node.headingLevel ?? 1);
    const headingLevels = [...source.matchAll(/^ {0,3}(#{1,6})[ \t]+/gm)].map((match) => match[1].length + delta);
    if (headingLevels.some((level) => level < 1 || level > 6)) return { ok: false, reason: "heading-depth" };
    source = adjustHeadingLevels(source, delta);
  } else {
    const desiredIndent = grandparent.kind === "list" ? (grandparent.listIndent ?? 0) + 2 : 0;
    source = adjustListIndent(source, desiredIndent - (node.listIndent ?? 0));
  }
  return movedSliceChanges(map, node, parent.subtreeTo, source);
}
