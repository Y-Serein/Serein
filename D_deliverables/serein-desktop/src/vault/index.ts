import type { VaultIndexFileResponse, VaultIndexResponse } from "../app/types";
import { extractFirstLineTitle, normalizeFilePath, parentVaultDir, pathFileName, stripExtension } from "../shared/markdown.js";

export type VaultHeading = {
  level: number;
  text: string;
  slug: string;
};

export type VaultLink = {
  kind: "wiki" | "markdown";
  label: string;
  rawTarget: string;
  embedded: boolean;
  targetPath: string | null;
  targetHeading: string | null;
  unresolvedReason: string | null;
  targetCandidates: string[];
  suggestedPath: string | null;
  sourceLine: number;
  sourceSnippet: string;
};

export type VaultBacklink = {
  kind: "wiki" | "markdown";
  label: string;
  rawTarget: string;
  embedded: boolean;
  sourcePath: string;
  sourceTitle: string;
  sourceRelativePath: string;
  sourceLine: number;
  sourceSnippet: string;
  targetHeading: string | null;
};

export type VaultUnlinkedMention = {
  targetPath: string;
  targetTitle: string;
  targetRelativePath: string;
  sourcePath: string;
  sourceTitle: string;
  sourceRelativePath: string;
  matchedText: string;
  line: number;
  snippet: string;
};

export type VaultIndexedFile = {
  path: string;
  relativePath: string;
  fileName: string;
  fileExt: string;
  title: string;
  content: string;
  properties: VaultProperty[];
  aliases: string[];
  headings: VaultHeading[];
  tags: string[];
  outgoingLinks: VaultLink[];
};

export type VaultProperty = {
  key: string;
  value: string;
  type: "text" | "list" | "checkbox" | "number" | "date";
};

export type VaultGraphNode = {
  path: string;
  title: string;
  relativePath: string;
  role: "current" | "neighbor" | "global" | "unresolved";
  x: number;
  y: number;
};

export type VaultGraphEdge = {
  id: string;
  sourcePath: string;
  targetPath: string;
};

export type VaultIndex = {
  root: string;
  files: VaultIndexedFile[];
  filesByPath: Map<string, VaultIndexedFile>;
  filesByRelativePath: Map<string, VaultIndexedFile>;
  backlinksByPath: Map<string, VaultBacklink[]>;
  truncated: boolean;
  skippedFiles: number;
};

export type LocalGraph = {
  nodes: VaultGraphNode[];
  edges: VaultGraphEdge[];
};

export type GlobalGraphOptions = {
  tag?: string | null;
  isolatedOnly?: boolean;
  showUnresolved?: boolean;
  maxNodes?: number;
};

export type GlobalGraph = LocalGraph & {
  totalNodes: number;
  visibleNodes: number;
  truncated: boolean;
  omittedNodes: number;
  unresolvedNodes: number;
};

export type VaultTagSummary = {
  tag: string;
  count: number;
};

export type VaultSearchResult = {
  path: string;
  relativePath: string;
  title: string;
  matchType: "title" | "path" | "tag" | "content";
  snippet: string;
};

type VaultSearchMode = VaultSearchResult["matchType"] | "all";

export type VaultLinkRewriteReplacement = {
  kind: "wiki" | "markdown";
  oldTarget: string;
  newTarget: string;
  line: number;
  snippet: string;
};

export type VaultLinkRewriteSource = {
  sourcePath: string;
  sourceRelativePath: string;
  sourceTitle: string;
  replacements: VaultLinkRewriteReplacement[];
};

export type VaultLinkRewritePlan = {
  oldPath: string;
  oldRelativePath: string;
  newRelativePath: string;
  sources: VaultLinkRewriteSource[];
  replacementCount: number;
};

type RawVaultLink = {
  kind: "wiki" | "markdown";
  label: string;
  rawTarget: string;
  targetText: string;
  targetStart: number;
  targetEnd: number;
  linkStart: number;
  linkEnd: number;
  wikiAliasSuffix: string;
  embedded: boolean;
  sourceRelativePath: string;
  sourceLine: number;
  sourceSnippet: string;
};

type ParsedVaultFile = Omit<VaultIndexedFile, "outgoingLinks"> & {
  rawLinks: RawVaultLink[];
};

type LinkTargetFile = Pick<VaultIndexedFile, "path" | "relativePath" | "aliases">;
type CandidateMap = Map<string, LinkTargetFile[]>;
type LinkResolution = {
  file: LinkTargetFile | null;
  candidates: LinkTargetFile[];
  ambiguous: boolean;
};

const INDEX_FILE_NAMES = ["index.md", "index.markdown", "index.txt", "readme.md", "readme.markdown", "readme.txt"];
const GRAPH_NODE_LIMIT = 120;
const SEARCH_RESULT_LIMIT = 80;

export function buildVaultIndex(root: string, response: VaultIndexResponse): VaultIndex {
  const rootPath = normalizeFilePath(root);
  const parsedFiles = response.files.map((file) => parseVaultFile(file));
  const filesByRelativePath = new Map<string, ParsedVaultFile>();
  const filesByPath = new Map<string, ParsedVaultFile>();
  const candidates: CandidateMap = new Map();

  for (const file of parsedFiles) {
    filesByPath.set(normalizeFilePath(file.path), file);
    filesByRelativePath.set(normalizeVaultPath(file.relativePath).toLowerCase(), file);
    addCandidate(candidates, file.relativePath, file);
    addCandidate(candidates, stripExtension(file.relativePath), file);
    addCandidate(candidates, stripExtension(pathFileName(file.relativePath)), file);
    for (const alias of file.aliases) {
      addCandidate(candidates, alias, file);
    }
  }

  const indexedFiles = parsedFiles.map((file) => ({
    ...file,
    outgoingLinks: file.rawLinks.map((link) => linkFromResolution(link, resolveLinkTarget(link, candidates))),
  }));

  const indexedFilesByPath = new Map(indexedFiles.map((file) => [normalizeFilePath(file.path), file]));
  const indexedFilesByRelativePath = new Map(indexedFiles.map((file) => [normalizeVaultPath(file.relativePath).toLowerCase(), file]));
  const backlinksByPath = new Map<string, VaultBacklink[]>();

  for (const file of indexedFiles) {
    backlinksByPath.set(normalizeFilePath(file.path), []);
  }

  for (const source of indexedFiles) {
    for (const link of source.outgoingLinks) {
      if (!link.targetPath) continue;
      const backlink: VaultBacklink = {
        kind: link.kind,
        label: link.label,
        rawTarget: link.rawTarget,
        embedded: link.embedded,
        sourcePath: source.path,
        sourceTitle: source.title,
        sourceRelativePath: source.relativePath,
        sourceLine: link.sourceLine,
        sourceSnippet: link.sourceSnippet,
        targetHeading: link.targetHeading,
      };
      const targetPath = normalizeFilePath(link.targetPath);
      backlinksByPath.set(targetPath, [...(backlinksByPath.get(targetPath) ?? []), backlink]);
    }
  }

  return {
    root: rootPath,
    files: indexedFiles,
    filesByPath: indexedFilesByPath,
    filesByRelativePath: indexedFilesByRelativePath,
    backlinksByPath,
    truncated: response.truncated,
    skippedFiles: response.skippedFiles,
  };
}

export function findIndexedFile(index: VaultIndex | null, path: string | null | undefined) {
  if (!index || !path) return null;
  return index.filesByPath.get(normalizeFilePath(path)) ?? null;
}

export function getBacklinks(index: VaultIndex | null, path: string | null | undefined) {
  if (!index || !path) return [];
  return index.backlinksByPath.get(normalizeFilePath(path)) ?? [];
}

export function getOutgoingUnlinkedMentions(
  index: VaultIndex | null,
  path: string | null | undefined,
  draftFile?: VaultIndexedFile | null,
): VaultUnlinkedMention[] {
  const currentFile = draftFile ?? findIndexedFile(index, path);
  if (!index || !currentFile) return [];
  return findUnlinkedMentions(index.files, currentFile);
}

export function getIncomingUnlinkedMentions(
  index: VaultIndex | null,
  path: string | null | undefined,
  draftFile?: VaultIndexedFile | null,
): VaultUnlinkedMention[] {
  const currentFile = draftFile ?? findIndexedFile(index, path);
  if (!index || !currentFile) return [];
  return findIncomingUnlinkedMentions(index.files, currentFile);
}

export function createDraftIndexedFile(index: VaultIndex | null, path: string | null | undefined, markdown: string) {
  const existing = findIndexedFile(index, path);
  if (!index || !existing) return null;

  const parsed = parseVaultFile({
    path: existing.path,
    relativePath: existing.relativePath,
    fileName: existing.fileName,
    fileExt: existing.fileExt,
    content: markdown,
  });
  const candidates = createCandidateMap(index.files);
  const { rawLinks, ...file } = parsed;

  return {
    ...file,
    outgoingLinks: rawLinks.map((link) => linkFromResolution(link, resolveLinkTarget(link, candidates))),
  };
}

export function createLocalGraph(index: VaultIndex | null, path: string | null | undefined, draftFile?: VaultIndexedFile | null): LocalGraph {
  const currentFile = draftFile ?? findIndexedFile(index, path);
  if (!index || !currentFile) return { nodes: [], edges: [] };

  const currentPath = normalizeFilePath(currentFile.path);
  const nodePaths = new Set<string>([currentPath]);

  for (const link of currentFile.outgoingLinks) {
    if (link.targetPath) nodePaths.add(normalizeFilePath(link.targetPath));
  }

  for (const backlink of getBacklinks(index, currentPath)) {
    nodePaths.add(normalizeFilePath(backlink.sourcePath));
  }

  const neighborPaths = [...nodePaths].filter((nodePath) => nodePath !== currentPath);
  const nodes: VaultGraphNode[] = [
    graphNode(currentFile, "current", 50, 50),
    ...neighborPaths.map((nodePath, indexOffset) => {
      const file = index.filesByPath.get(nodePath);
      const angle = (Math.PI * 2 * indexOffset) / Math.max(neighborPaths.length, 1) - Math.PI / 2;
      const radius = neighborPaths.length <= 2 ? 30 : 34;
      return graphNode(
        file,
        "neighbor",
        50 + Math.cos(angle) * radius,
        50 + Math.sin(angle) * radius,
        nodePath,
      );
    }),
  ];

  const edges: VaultGraphEdge[] = [];
  const edgeIds = new Set<string>();
  for (const source of index.files) {
    const sourcePath = normalizeFilePath(source.path);
    if (!nodePaths.has(sourcePath)) continue;

    const sourceLinks = sourcePath === currentPath ? currentFile.outgoingLinks : source.outgoingLinks;
    for (const link of sourceLinks) {
      if (!link.targetPath) continue;
      const targetPath = normalizeFilePath(link.targetPath);
      if (!nodePaths.has(targetPath)) continue;

      const id = `${sourcePath}->${targetPath}`;
      if (edgeIds.has(id)) continue;
      edgeIds.add(id);
      edges.push({ id, sourcePath, targetPath });
    }
  }

  return { nodes, edges };
}

export function createGlobalGraph(index: VaultIndex | null, options: GlobalGraphOptions = {}): GlobalGraph {
  if (!index) {
    return { nodes: [], edges: [], totalNodes: 0, visibleNodes: 0, truncated: false, omittedNodes: 0, unresolvedNodes: 0 };
  }

  const maxNodes = Math.max(20, Math.min(options.maxNodes ?? GRAPH_NODE_LIMIT, 300));
  const degreeByPath = new Map<string, number>();
  const resolvedEdges: VaultGraphEdge[] = [];
  const edgeIds = new Set<string>();

  for (const file of index.files) {
    const sourcePath = normalizeFilePath(file.path);
    degreeByPath.set(sourcePath, degreeByPath.get(sourcePath) ?? 0);

    for (const link of file.outgoingLinks) {
      if (!link.targetPath) continue;
      const targetPath = normalizeFilePath(link.targetPath);
      const id = `${sourcePath}->${targetPath}`;
      if (!edgeIds.has(id)) {
        edgeIds.add(id);
        resolvedEdges.push({ id, sourcePath, targetPath });
      }
      degreeByPath.set(sourcePath, (degreeByPath.get(sourcePath) ?? 0) + 1);
      degreeByPath.set(targetPath, (degreeByPath.get(targetPath) ?? 0) + 1);
    }
  }

  let files = index.files;
  if (options.tag) {
    files = files.filter((file) => file.tags.includes(options.tag!));
  }
  if (options.isolatedOnly) {
    files = files.filter((file) => (degreeByPath.get(normalizeFilePath(file.path)) ?? 0) === 0);
  }

  const totalNodes = files.length;
  const sortedFiles = [...files].sort((left, right) => {
    const rightDegree = degreeByPath.get(normalizeFilePath(right.path)) ?? 0;
    const leftDegree = degreeByPath.get(normalizeFilePath(left.path)) ?? 0;
    return rightDegree - leftDegree || left.relativePath.localeCompare(right.relativePath);
  });
  const visibleFiles = sortedFiles.slice(0, maxNodes);
  const visiblePathSet = new Set(visibleFiles.map((file) => normalizeFilePath(file.path)));
  const unresolvedItems = options.showUnresolved
    ? visibleFiles.flatMap((file) => file.outgoingLinks
      .filter((link) => !link.targetPath)
      .map((link) => ({ source: file, link })))
    : [];
  const unresolvedSlots = Math.max(0, maxNodes - visibleFiles.length);
  const visibleUnresolved = unresolvedItems.slice(0, unresolvedSlots);

  const fileNodes = visibleFiles.map((file, indexOffset) => positionedGraphNode(
    file,
    "global",
    indexOffset,
    Math.max(visibleFiles.length + visibleUnresolved.length, 1),
  ));
  const unresolvedNodes = visibleUnresolved.map((item, indexOffset) => positionedGraphNode(
    undefined,
    "unresolved",
    visibleFiles.length + indexOffset,
    Math.max(visibleFiles.length + visibleUnresolved.length, 1),
    unresolvedNodePath(item.source.path, item.link.rawTarget),
    item.link.rawTarget,
  ));
  const nodes = [...fileNodes, ...unresolvedNodes];
  const graphEdges = resolvedEdges.filter((edge) => (
    visiblePathSet.has(normalizeFilePath(edge.sourcePath))
    && visiblePathSet.has(normalizeFilePath(edge.targetPath))
  ));

  for (const item of visibleUnresolved) {
    graphEdges.push({
      id: `${normalizeFilePath(item.source.path)}->${unresolvedNodePath(item.source.path, item.link.rawTarget)}`,
      sourcePath: normalizeFilePath(item.source.path),
      targetPath: unresolvedNodePath(item.source.path, item.link.rawTarget),
    });
  }

  const omittedNodes = Math.max(0, totalNodes + unresolvedItems.length - nodes.length);
  return {
    nodes,
    edges: graphEdges,
    totalNodes: totalNodes + unresolvedItems.length,
    visibleNodes: nodes.length,
    truncated: omittedNodes > 0,
    omittedNodes,
    unresolvedNodes: unresolvedItems.length,
  };
}

export function listVaultTags(index: VaultIndex | null): VaultTagSummary[] {
  if (!index) return [];
  const counts = new Map<string, number>();
  for (const file of index.files) {
    for (const tag of file.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag));
}

export function searchVaultIndex(
  index: VaultIndex | null,
  query: string,
  options: { tag?: string | null; limit?: number } = {},
): VaultSearchResult[] {
  if (!index) return [];
  const search = parseVaultSearchQuery(query);
  const cleanQuery = search.query.toLowerCase();
  const tag = options.tag?.trim();
  const limit = Math.max(1, Math.min(options.limit ?? SEARCH_RESULT_LIMIT, 200));

  if (!cleanQuery && !tag) return [];

  const results: VaultSearchResult[] = [];
  for (const file of index.files) {
    if (tag && !file.tags.includes(tag)) continue;
    const title = file.title.toLowerCase();
    const relativePath = file.relativePath.toLowerCase();
    const tags = file.tags.map((item) => item.toLowerCase());
    const content = file.content.toLowerCase();
    const matchType: VaultSearchResult["matchType"] | null = cleanQuery
      ? matchesSearchMode(search.mode, "title") && title.includes(cleanQuery)
        ? "title"
        : matchesSearchMode(search.mode, "path") && relativePath.includes(cleanQuery)
          ? "path"
          : matchesSearchMode(search.mode, "tag") && tags.some((item) => item.includes(cleanQuery))
            ? "tag"
            : matchesSearchMode(search.mode, "content") && content.includes(cleanQuery)
              ? "content"
              : null
      : "tag";

    if (!matchType) continue;
    results.push({
      path: file.path,
      relativePath: file.relativePath,
      title: file.title,
      matchType,
      snippet: createSearchSnippet(file, cleanQuery, matchType),
    });
    if (results.length >= limit) break;
  }

  return results;
}

function parseVaultSearchQuery(query: string): { mode: VaultSearchMode; query: string } {
  const trimmed = query.trim();
  const prefix = trimmed[0];
  if (!prefix) return { mode: "all", query: trimmed };

  if (prefix === "@") return { mode: "title", query: trimmed.slice(1).trim() };
  if (prefix === "/") return { mode: "path", query: trimmed.slice(1).trim() };
  if (prefix === "#") return { mode: "tag", query: trimmed.slice(1).trim() };
  if (prefix === ":") return { mode: "content", query: trimmed.slice(1).trim() };
  return { mode: "all", query: trimmed };
}

function matchesSearchMode(mode: VaultSearchMode, target: VaultSearchResult["matchType"]) {
  return mode === "all" || mode === target;
}

export function resolveVaultLinkTarget(
  index: VaultIndex | null,
  sourcePath: string | null | undefined,
  kind: RawVaultLink["kind"],
  rawTarget: string,
): VaultLink {
  const sourceFile = findIndexedFile(index, sourcePath);
  const link: RawVaultLink = {
    kind,
    label: rawTarget,
    rawTarget,
    targetText: rawTarget,
    targetStart: 0,
    targetEnd: 0,
    linkStart: 0,
    linkEnd: 0,
    wikiAliasSuffix: "",
    embedded: false,
    sourceRelativePath: sourceFile?.relativePath ?? "",
    sourceLine: 1,
    sourceSnippet: rawTarget,
  };
  const resolution = index ? resolveLinkTarget(link, createCandidateMap(index.files)) : { file: null, candidates: [], ambiguous: false };
  return linkFromResolution(link, resolution);
}

export function suggestedVaultLinkPath(link: Pick<VaultLink, "suggestedPath">) {
  return link.suggestedPath;
}

export function planVaultLinkRewrite(
  index: VaultIndex | null,
  oldPath: string,
  newRelativePath: string,
): VaultLinkRewritePlan {
  const oldFile = findIndexedFile(index, oldPath);
  if (!index || !oldFile) {
    return {
      oldPath: normalizeFilePath(oldPath),
      oldRelativePath: "",
      newRelativePath: normalizeVaultPath(newRelativePath),
      sources: [],
      replacementCount: 0,
    };
  }

  const normalizedNewRelativePath = normalizeVaultPath(newRelativePath);
  if (normalizeVaultPath(oldFile.relativePath).toLowerCase() === normalizedNewRelativePath.toLowerCase()) {
    return {
      oldPath: normalizeFilePath(oldPath),
      oldRelativePath: oldFile.relativePath,
      newRelativePath: normalizedNewRelativePath,
      sources: [],
      replacementCount: 0,
    };
  }

  const sources: VaultLinkRewriteSource[] = [];

  for (const file of index.files) {
    const rewrite = rewriteVaultLinksInMarkdown(index, file.relativePath, file.content, oldPath, normalizedNewRelativePath);
    if (!rewrite.replacements.length) continue;
    sources.push({
      sourcePath: file.path,
      sourceRelativePath: file.relativePath,
      sourceTitle: file.title,
      replacements: rewrite.replacements,
    });
  }

  return {
    oldPath: normalizeFilePath(oldPath),
    oldRelativePath: oldFile.relativePath,
    newRelativePath: normalizedNewRelativePath,
    sources,
    replacementCount: sources.reduce((total, source) => total + source.replacements.length, 0),
  };
}

export function rewriteVaultLinksInMarkdown(
  index: VaultIndex | null,
  sourceRelativePath: string,
  markdown: string,
  oldPath: string,
  newRelativePath: string,
): { content: string; replacements: VaultLinkRewriteReplacement[] } {
  const oldFile = findIndexedFile(index, oldPath);
  if (!index || !oldFile) return { content: markdown, replacements: [] };

  const candidates = createCandidateMap(index.files);
  const normalizedOldPath = normalizeFilePath(oldPath);
  const rawLinks = extractRawLinks(markdown, normalizeVaultPath(sourceRelativePath));
  const edits: Array<VaultLinkRewriteReplacement & { start: number; end: number; replacementText: string }> = [];

  for (const link of rawLinks) {
    const resolution = resolveLinkTarget(link, candidates);
    if (!resolution.file || normalizeFilePath(resolution.file.path) !== normalizedOldPath) continue;
    if (!isDirectFileReference(link, oldFile)) continue;

    const newTarget = replacementTargetForLink(link, normalizeVaultPath(newRelativePath));
    if (!newTarget || newTarget === link.targetText.trim()) continue;
    const replacementText = link.kind === "wiki"
      ? `${link.embedded ? "!" : ""}[[${newTarget}${link.wikiAliasSuffix}]]`
      : newTarget;

    edits.push({
      kind: link.kind,
      oldTarget: link.targetText.trim(),
      newTarget,
      line: link.sourceLine,
      snippet: link.sourceSnippet,
      start: link.kind === "wiki" ? link.linkStart : link.targetStart,
      end: link.kind === "wiki" ? link.linkEnd : link.targetEnd,
      replacementText,
    });
  }

  if (!edits.length) return { content: markdown, replacements: [] };

  const content = [...edits]
    .sort((left, right) => right.start - left.start)
    .reduce((nextContent, edit) => (
      `${nextContent.slice(0, edit.start)}${edit.replacementText}${nextContent.slice(edit.end)}`
    ), markdown);

  return {
    content,
    replacements: edits.map(({ start: _start, end: _end, replacementText: _replacementText, ...edit }) => edit),
  };
}

function createCandidateMap(files: LinkTargetFile[]) {
  const candidates: CandidateMap = new Map();

  for (const file of files) {
    addCandidate(candidates, file.relativePath, file);
    addCandidate(candidates, stripExtension(file.relativePath), file);
    addCandidate(candidates, stripExtension(pathFileName(file.relativePath)), file);
    if ("aliases" in file && Array.isArray(file.aliases)) {
      for (const alias of file.aliases) {
        addCandidate(candidates, alias, file);
      }
    }
  }

  return candidates;
}

function parseVaultFile(file: VaultIndexFileResponse): ParsedVaultFile {
  const title = extractFirstLineTitle(file.content) ?? stripExtension(file.fileName);
  const properties = extractFrontmatterProperties(file.content);
  const aliases = propertyValues(properties, "aliases");
  const propertyTags = propertyValues(properties, "tags").map((tag) => tag.replace(/^#/, ""));

  return {
    path: file.path,
    relativePath: normalizeVaultPath(file.relativePath),
    fileName: file.fileName,
    fileExt: file.fileExt,
    content: file.content,
    title,
    properties,
    aliases,
    headings: extractHeadings(file.content),
    tags: uniqueSorted([...extractTags(file.content), ...propertyTags]),
    rawLinks: extractRawLinks(file.content, normalizeVaultPath(file.relativePath)),
  };
}

function extractHeadings(markdown: string): VaultHeading[] {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => {
      const text = match[2].trim();
      return {
        level: match[1].length,
        text,
        slug: slugHeading(text),
      };
    });
}

function extractTags(markdown: string): string[] {
  const tags = new Set<string>();
  const linkedRanges = extractLinkedRanges(markdown);
  const tagPattern = /(^|[\s([{])#([A-Za-z0-9_/-]+)/g;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(markdown)) !== null) {
    const tagStart = match.index + match[1].length;
    const tagEnd = tagStart + match[2].length + 1;
    if (rangeIntersects(linkedRanges, tagStart, tagEnd)) continue;
    tags.add(match[2]);
  }

  return [...tags].sort((left, right) => left.localeCompare(right));
}

function extractFrontmatterProperties(markdown: string): VaultProperty[] {
  const normalized = markdown.replace(/\r\n?/g, "\n");
  if (!normalized.startsWith("---\n")) return [];
  const end = normalized.indexOf("\n---", 4);
  if (end < 0) return [];

  const lines = normalized.slice(4, end).split("\n");
  const properties: VaultProperty[] = [];
  let currentKey = "";
  let currentItems: string[] = [];

  const flushList = () => {
    if (!currentKey) return;
    properties.push({
      key: currentKey,
      value: currentItems.join(", "),
      type: "list",
    });
    currentKey = "";
    currentItems = [];
  };

  for (const line of lines) {
    const listItem = line.match(/^\s+-\s+(.+)$/);
    if (listItem && currentKey) {
      currentItems.push(cleanYamlValue(listItem[1]));
      continue;
    }

    flushList();
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;

    const key = match[1].trim();
    const rawValue = match[2].trim();
    if (!rawValue) {
      currentKey = key;
      currentItems = [];
      continue;
    }

    properties.push({
      key,
      value: cleanYamlValue(rawValue),
      type: yamlPropertyType(rawValue),
    });
  }

  flushList();
  return properties;
}

function propertyValues(properties: VaultProperty[], key: string) {
  const property = properties.find((item) => item.key.toLowerCase() === key.toLowerCase());
  if (!property) return [];
  const value = property.value.trim();
  if (!value) return [];
  return value
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((item) => cleanYamlValue(item))
    .filter(Boolean);
}

function cleanYamlValue(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function yamlPropertyType(value: string): VaultProperty["type"] {
  const clean = cleanYamlValue(value);
  if (/^\[.*]$/.test(value.trim())) return "list";
  if (/^(true|false)$/i.test(clean)) return "checkbox";
  if (/^-?\d+(\.\d+)?$/.test(clean)) return "number";
  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) return "date";
  return "text";
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function extractRawLinks(markdown: string, sourceRelativePath: string): RawVaultLink[] {
  const links: RawVaultLink[] = [];
  const wikiPattern = /(!?)((?:\\?\[){2})([^\]\n]+?)((?:\\?\]){2})/g;
  const markdownPattern = /!?\[([^\]]*)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;

  while ((match = wikiPattern.exec(markdown)) !== null) {
    const raw = match[3].trim();
    if (!raw) continue;
    const embedded = match[1] === "!";
    const insideStart = match.index + match[1].length + match[2].length;
    const exactInside = match[3];
    const pipeIndex = exactInside.indexOf("|");
    const exactTarget = pipeIndex >= 0 ? exactInside.slice(0, pipeIndex) : exactInside;
    const wikiAliasSuffix = pipeIndex >= 0 ? exactInside.slice(pipeIndex) : "";
    const targetLeadingSpaces = exactTarget.match(/^\s*/)?.[0].length ?? 0;
    const targetTrailingSpaces = exactTarget.match(/\s*$/)?.[0].length ?? 0;
    const targetStart = insideStart + targetLeadingSpaces;
    const targetEnd = insideStart + exactTarget.length - targetTrailingSpaces;
    const [target, alias] = exactInside.split("|", 2).map((part) => part.trim());
    const source = sourceLocation(markdown, match.index, match[0].length);
    links.push({
      kind: "wiki",
      label: alias || targetHeading(target) || stripWikiTarget(target),
      rawTarget: target,
      targetText: exactTarget.trim(),
      targetStart,
      targetEnd,
      linkStart: match.index,
      linkEnd: match.index + match[0].length,
      wikiAliasSuffix,
      embedded,
      sourceRelativePath,
      ...source,
    });
  }

  while ((match = markdownPattern.exec(markdown)) !== null) {
    const embedded = markdown[match.index] === "!";
    const fullMatch = match[0];
    const targetOffset = fullMatch.indexOf("](") + 2;
    const targetStart = match.index + targetOffset;
    const targetEnd = targetStart + match[2].length;
    const rawTarget = normalizeMarkdownTarget(match[2]);
    if (!rawTarget || isExternalTarget(rawTarget)) {
      continue;
    }

    links.push({
      kind: "markdown",
      label: match[1].trim() || pathFileName(stripTargetMeta(rawTarget)) || rawTarget,
      rawTarget,
      targetText: match[2].trim(),
      targetStart,
      targetEnd,
      linkStart: match.index,
      linkEnd: match.index + match[0].length,
      wikiAliasSuffix: "",
      embedded,
      sourceRelativePath,
      ...sourceLocation(markdown, match.index, match[0].length),
    });
  }

  return links;
}

function sourceLocation(markdown: string, offset: number, length: number) {
  const before = markdown.slice(0, offset);
  const line = before.split(/\r?\n/).length;
  const lineStart = Math.max(before.lastIndexOf("\n") + 1, 0);
  const lineEndIndex = markdown.indexOf("\n", offset);
  const lineEnd = lineEndIndex >= 0 ? lineEndIndex : markdown.length;
  const snippet = createMentionSnippet(markdown.slice(lineStart, lineEnd), offset - lineStart, length);
  return { sourceLine: line, sourceSnippet: snippet };
}

function resolveLinkTarget(link: RawVaultLink, candidates: CandidateMap): LinkResolution {
  const keys = link.kind === "markdown" ? markdownTargetKeys(link) : wikiTargetKeys(link);
  for (const key of keys) {
    const matches = candidates.get(normalizeVaultPath(key).toLowerCase()) ?? [];
    if (!matches.length) continue;
    return {
      file: matches.length === 1 ? matches[0] : null,
      candidates: matches,
      ambiguous: matches.length > 1,
    };
  }

  return { file: null, candidates: [], ambiguous: false };
}

function markdownTargetKeys(link: RawVaultLink) {
  const targetPath = stripTargetMeta(link.rawTarget);
  if (!targetPath && link.rawTarget.trim().startsWith("#")) {
    return [link.sourceRelativePath];
  }
  const sourceDir = parentVaultDir(link.sourceRelativePath);
  const relativeTarget = joinRelativePath(sourceDir, targetPath);
  return [
    relativeTarget,
    stripExtension(relativeTarget),
    ...directoryIndexKeys(relativeTarget),
  ];
}

function wikiTargetKeys(link: RawVaultLink) {
  const target = normalizeVaultPath(stripWikiTarget(link.rawTarget));
  if (!target && link.rawTarget.trim().startsWith("#")) {
    return [link.sourceRelativePath];
  }
  return [
    target,
    stripExtension(target),
    ...directoryIndexKeys(target),
  ];
}

function linkFromResolution(link: RawVaultLink, resolution: LinkResolution): VaultLink {
  return {
    kind: link.kind,
    label: link.label,
    rawTarget: link.rawTarget,
    embedded: link.embedded,
    targetPath: resolution.file?.path ?? null,
    targetHeading: targetHeading(link.rawTarget),
    unresolvedReason: unresolvedReason(link, resolution),
    targetCandidates: resolution.candidates.map((candidate) => candidate.path),
    suggestedPath: resolution.file ? null : suggestedCreationPath(link),
    sourceLine: link.sourceLine,
    sourceSnippet: link.sourceSnippet,
  };
}

function unresolvedReason(link: RawVaultLink, resolution: LinkResolution) {
  if (resolution.file) return null;
  if (resolution.ambiguous) return "Multiple matching vault files found.";
  if (link.kind === "markdown") {
    const targetPath = stripTargetMeta(link.rawTarget);
    if (isDirectoryTarget(targetPath)) {
      return "Directory link; add index.md or README.md in that folder to show it in Graph.";
    }
  }
  return "No matching vault file found.";
}

function addCandidate(candidates: CandidateMap, key: string, file: LinkTargetFile) {
  const normalized = normalizeVaultPath(key).toLowerCase();
  if (!normalized) return;
  const matches = candidates.get(normalized) ?? [];
  if (matches.some((candidate) => normalizeFilePath(candidate.path) === normalizeFilePath(file.path))) return;
  candidates.set(normalized, [...matches, file]);
}

function graphNode(
  file: VaultIndexedFile | undefined,
  role: VaultGraphNode["role"],
  x: number,
  y: number,
  fallbackPath?: string,
  fallbackTitle?: string,
): VaultGraphNode {
  const path = normalizeFilePath(file?.path ?? fallbackPath ?? "");
  return {
    path,
    title: truncateGraphTitle(file?.title ?? fallbackTitle ?? stripExtension(pathFileName(path))),
    relativePath: file?.relativePath ?? path,
    role,
    x,
    y,
  };
}

function positionedGraphNode(
  file: VaultIndexedFile | undefined,
  role: VaultGraphNode["role"],
  indexOffset: number,
  total: number,
  fallbackPath?: string,
  fallbackTitle?: string,
) {
  const normalizedIndex = total <= 1 ? 0 : indexOffset / Math.max(total - 1, 1);
  const angle = indexOffset * 2.399963229728653 - Math.PI / 2;
  const radius = total <= 3 ? 12 + indexOffset * 11 : 9 + Math.sqrt(normalizedIndex) * 35;
  return graphNode(
    file,
    role,
    clampGraphPosition(50 + Math.cos(angle) * radius),
    clampGraphPosition(50 + Math.sin(angle) * radius),
    fallbackPath,
    fallbackTitle,
  );
}

function clampGraphPosition(value: number) {
  return Math.max(8, Math.min(92, value));
}

function unresolvedNodePath(sourcePath: string, rawTarget: string) {
  return `unresolved:${normalizeFilePath(sourcePath)}:${rawTarget}`;
}

function truncateGraphTitle(title: string) {
  const trimmed = title.trim() || "Untitled";
  return trimmed.length > 18 ? `${trimmed.slice(0, 17)}...` : trimmed;
}

function normalizeMarkdownTarget(target: string) {
  const trimmed = target.trim().replace(/^<|>$/g, "");
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

function isExternalTarget(target: string) {
  return /^[a-z][a-z0-9+.-]*:/i.test(target);
}

function stripTargetMeta(target: string) {
  return target.split("#", 1)[0].split("?", 1)[0].trim();
}

function stripWikiTarget(target: string) {
  return stripTargetMeta(target).replace(/^\/+/, "").trim();
}

function targetHeading(target: string) {
  const heading = target.split("#", 2)[1]?.split("|", 1)[0]?.trim();
  return heading || null;
}

function normalizeVaultPath(path: string) {
  return path
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .replace(/\/+$/, "");
}

function isDirectoryTarget(target: string) {
  const normalized = normalizeVaultPath(target);
  return !normalized || target.endsWith("/") || target === "." || target === "./";
}

function directoryIndexKeys(relativeTarget: string) {
  const directory = normalizeVaultPath(relativeTarget);
  if (!directory && relativeTarget !== "." && relativeTarget !== "./") return [];
  return INDEX_FILE_NAMES.map((fileName) => normalizeVaultPath(directory ? `${directory}/${fileName}` : fileName));
}

function suggestedCreationPath(link: RawVaultLink) {
  const sourceDir = parentVaultDir(link.sourceRelativePath);
  const rawTarget = stripTargetMeta(link.kind === "wiki" ? stripWikiTarget(link.rawTarget) : link.rawTarget);
  const relativeTarget = link.kind === "markdown"
    ? joinRelativePath(sourceDir, rawTarget)
    : joinRelativePath(rawTarget.includes("/") ? "" : sourceDir, rawTarget);
  const normalized = normalizeVaultPath(relativeTarget);

  if (!normalized || isDirectoryTarget(rawTarget)) {
    return normalizeVaultPath(`${normalized}/index.md`);
  }
  return /\.(md|markdown|txt)$/i.test(normalized) ? normalized : `${normalized}.md`;
}

function isDirectFileReference(link: RawVaultLink, targetFile: LinkTargetFile) {
  const oldRelativePath = normalizeVaultPath(targetFile.relativePath);
  const oldRelativePathLower = oldRelativePath.toLowerCase();
  const oldRelativeNoExtLower = stripExtension(oldRelativePath).toLowerCase();
  const oldFileName = pathFileName(oldRelativePath);
  const oldFileNameLower = oldFileName.toLowerCase();
  const oldFileNameNoExtLower = stripExtension(oldFileName).toLowerCase();
  const rawPath = stripTargetMeta(link.kind === "wiki" ? stripWikiTarget(link.rawTarget) : link.rawTarget);
  const normalizedRawPath = normalizeVaultPath(rawPath);

  if (!normalizedRawPath) return false;

  if (link.kind === "wiki") {
    const wikiKeys = [
      normalizedRawPath,
      stripExtension(normalizedRawPath),
      ...directoryIndexKeys(normalizedRawPath),
    ].map((item) => normalizeVaultPath(item).toLowerCase());

    return wikiKeys.some((key) => (
      key === oldRelativePathLower
      || key === oldRelativeNoExtLower
      || key === oldFileNameLower
      || key === oldFileNameNoExtLower
    ));
  }

  const sourceDir = parentVaultDir(link.sourceRelativePath);
  const relativeTarget = joinRelativePath(sourceDir, rawPath);
  const markdownKeys = [
    relativeTarget,
    stripExtension(relativeTarget),
    ...directoryIndexKeys(relativeTarget),
  ].map((item) => normalizeVaultPath(item).toLowerCase());

  return markdownKeys.some((key) => key === oldRelativePathLower || key === oldRelativeNoExtLower);
}

function replacementTargetForLink(link: RawVaultLink, newRelativePath: string) {
  if (link.kind === "wiki") {
    const target = splitTargetMeta(link.rawTarget);
    const hadExtension = /\.(md|markdown|txt)$/i.test(target.path);
    const usedVaultPath = normalizeVaultPath(target.path).includes("/") || target.path.trim().startsWith("/");
    const usedRootPrefix = target.path.trim().startsWith("/");
    let replacement = usedVaultPath ? normalizeVaultPath(newRelativePath) : pathFileName(newRelativePath);
    if (!hadExtension) replacement = stripExtension(replacement);
    return `${usedRootPrefix ? "/" : ""}${replacement}${target.meta}`;
  }

  const exactTarget = link.targetText.trim();
  const angleWrapped = exactTarget.startsWith("<") && exactTarget.endsWith(">");
  const targetText = angleWrapped ? exactTarget.slice(1, -1) : exactTarget;
  const target = splitTargetMeta(targetText);
  let replacement = relativePathFromVaultDir(parentVaultDir(link.sourceRelativePath), newRelativePath);
  if (target.path.startsWith("./") && !replacement.startsWith(".") && !replacement.startsWith("/")) {
    replacement = `./${replacement}`;
  }

  const nextTarget = `${replacement}${target.meta}`;
  return angleWrapped ? `<${nextTarget}>` : nextTarget;
}

function splitTargetMeta(target: string) {
  const trimmed = target.trim().replace(/^<|>$/g, "");
  const hashIndex = trimmed.indexOf("#");
  const queryIndex = trimmed.indexOf("?");
  const metaIndex = [hashIndex, queryIndex]
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];

  if (metaIndex === undefined) {
    return { path: trimmed, meta: "" };
  }

  return {
    path: trimmed.slice(0, metaIndex),
    meta: trimmed.slice(metaIndex),
  };
}

function relativePathFromVaultDir(sourceDir: string, targetRelativePath: string) {
  const sourceParts = normalizeVaultPath(sourceDir).split("/").filter(Boolean);
  const targetParts = normalizeVaultPath(targetRelativePath).split("/").filter(Boolean);
  let shared = 0;

  while (shared < sourceParts.length && shared < targetParts.length && sourceParts[shared] === targetParts[shared]) {
    shared += 1;
  }

  const upParts = sourceParts.slice(shared).map(() => "..");
  const downParts = targetParts.slice(shared);
  return [...upParts, ...downParts].join("/") || pathFileName(targetRelativePath);
}

function joinRelativePath(directory: string, target: string) {
  const parts = [...normalizeVaultPath(directory).split("/"), ...normalizeVaultPath(target).split("/")]
    .filter(Boolean);
  const output: string[] = [];

  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      output.pop();
      continue;
    }
    output.push(part);
  }

  return output.join("/");
}

function slugHeading(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .replace(/\s+/g, "-");
}

function createSearchSnippet(file: VaultIndexedFile, query: string, matchType: VaultSearchResult["matchType"]) {
  if (!query) return file.tags.length ? file.tags.map((tag) => `#${tag}`).join(", ") : file.relativePath;
  if (matchType === "title") return file.title;
  if (matchType === "path") return file.relativePath;
  if (matchType === "tag") return file.tags.map((tag) => `#${tag}`).join(", ");

  const lowerContent = file.content.toLowerCase();
  const index = lowerContent.indexOf(query);
  if (index < 0) return file.relativePath;
  const start = Math.max(0, index - 56);
  const end = Math.min(file.content.length, index + query.length + 72);
  const snippet = file.content.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "..." : ""}${snippet}${end < file.content.length ? "..." : ""}`;
}

function findUnlinkedMentions(files: VaultIndexedFile[], currentFile: VaultIndexedFile): VaultUnlinkedMention[] {
  const currentPath = normalizeFilePath(currentFile.path);
  const linkedRanges = extractLinkedRanges(currentFile.content);
  const candidates = mentionCandidates(files, currentPath);
  const mentions: VaultUnlinkedMention[] = [];
  const seen = new Set<string>();
  const lines = currentFile.content.split(/\r?\n/);
  let offset = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const lowerLine = line.toLowerCase();

    for (const candidate of candidates) {
      let searchFrom = 0;
      while (searchFrom < line.length) {
        const found = lowerLine.indexOf(candidate.textLower, searchFrom);
        if (found < 0) break;
        const absoluteStart = offset + found;
        const absoluteEnd = absoluteStart + candidate.text.length;
        searchFrom = found + Math.max(candidate.text.length, 1);

        if (!hasMentionBoundary(line, found, found + candidate.text.length)) continue;
        if (rangeIntersects(linkedRanges, absoluteStart, absoluteEnd)) continue;

        const key = `${candidate.file.path}:${lineIndex + 1}:${found}:${candidate.textLower}`;
        if (seen.has(key)) continue;
        seen.add(key);
        mentions.push({
          targetPath: candidate.file.path,
          targetTitle: candidate.file.title,
          targetRelativePath: candidate.file.relativePath,
          sourcePath: currentFile.path,
          sourceTitle: currentFile.title,
          sourceRelativePath: currentFile.relativePath,
          matchedText: line.slice(found, found + candidate.text.length),
          line: lineIndex + 1,
          snippet: createMentionSnippet(line, found, candidate.text.length),
        });
        if (mentions.length >= 40) return mentions;
      }
    }

    offset += line.length + 1;
  }

  return mentions;
}

function findIncomingUnlinkedMentions(files: VaultIndexedFile[], targetFile: VaultIndexedFile): VaultUnlinkedMention[] {
  const targetPath = normalizeFilePath(targetFile.path);
  const candidates = mentionTextsForFile(targetFile);
  const mentions: VaultUnlinkedMention[] = [];
  const seen = new Set<string>();

  if (!candidates.length) return mentions;

  for (const sourceFile of files) {
    if (normalizeFilePath(sourceFile.path) === targetPath) continue;

    const linkedRanges = extractLinkedRanges(sourceFile.content);
    const lines = sourceFile.content.split(/\r?\n/);
    let offset = 0;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      const lowerLine = line.toLowerCase();

      for (const candidate of candidates) {
        let searchFrom = 0;
        while (searchFrom < line.length) {
          const found = lowerLine.indexOf(candidate.textLower, searchFrom);
          if (found < 0) break;

          const absoluteStart = offset + found;
          const absoluteEnd = absoluteStart + candidate.text.length;
          searchFrom = found + Math.max(candidate.text.length, 1);

          if (!hasMentionBoundary(line, found, found + candidate.text.length)) continue;
          if (rangeIntersects(linkedRanges, absoluteStart, absoluteEnd)) continue;

          const key = `${sourceFile.path}:${lineIndex + 1}:${found}:${candidate.textLower}`;
          if (seen.has(key)) continue;
          seen.add(key);
          mentions.push({
            targetPath: targetFile.path,
            targetTitle: targetFile.title,
            targetRelativePath: targetFile.relativePath,
            sourcePath: sourceFile.path,
            sourceTitle: sourceFile.title,
            sourceRelativePath: sourceFile.relativePath,
            matchedText: line.slice(found, found + candidate.text.length),
            line: lineIndex + 1,
            snippet: createMentionSnippet(line, found, candidate.text.length),
          });
          if (mentions.length >= 40) return mentions;
        }
      }

      offset += line.length + 1;
    }
  }

  return mentions.sort((left, right) => left.sourceRelativePath.localeCompare(right.sourceRelativePath) || left.line - right.line);
}

function mentionCandidates(files: VaultIndexedFile[], currentPath: string) {
  const candidates: { text: string; textLower: string; file: VaultIndexedFile }[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    if (normalizeFilePath(file.path) === currentPath) continue;
    const names = [
      stripExtension(file.fileName),
      ...file.aliases,
    ];
    for (const name of names) {
      const text = name.trim();
      if (text.length < 2) continue;
      const key = `${normalizeFilePath(file.path)}:${text.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ text, textLower: text.toLowerCase(), file });
    }
  }

  return candidates.sort((left, right) => right.text.length - left.text.length || left.text.localeCompare(right.text));
}

function mentionTextsForFile(file: VaultIndexedFile) {
  const names = [
    stripExtension(file.fileName),
    file.title,
    ...file.aliases,
  ];
  const seen = new Set<string>();
  const candidates: { text: string; textLower: string }[] = [];

  for (const name of names) {
    const text = name.trim();
    if (text.length < 2) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ text, textLower: key });
  }

  return candidates.sort((left, right) => right.text.length - left.text.length || left.text.localeCompare(right.text));
}

function extractLinkedRanges(markdown: string) {
  const ranges: { start: number; end: number }[] = [];
  const patterns = [
    /!?\[\[[^\]]+\]\]/g,
    /!?\[[^\]]*]\([^)]+\)/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(markdown)) !== null) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
  }

  return ranges.sort((left, right) => left.start - right.start);
}

function rangeIntersects(ranges: { start: number; end: number }[], start: number, end: number) {
  return ranges.some((range) => start < range.end && end > range.start);
}

function hasMentionBoundary(line: string, start: number, end: number) {
  return isMentionBoundary(line[start - 1]) && isMentionBoundary(line[end]);
}

function isMentionBoundary(char: string | undefined) {
  return !char || !/[\p{Letter}\p{Number}_-]/u.test(char);
}

function createMentionSnippet(line: string, start: number, length: number) {
  const snippetStart = Math.max(0, start - 48);
  const snippetEnd = Math.min(line.length, start + length + 64);
  const snippet = line.slice(snippetStart, snippetEnd).replace(/\s+/g, " ").trim();
  return `${snippetStart > 0 ? "..." : ""}${snippet}${snippetEnd < line.length ? "..." : ""}`;
}
