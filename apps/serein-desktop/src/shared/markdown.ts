import type { SaveFileExt } from "../app/types";

export type OutlineItem = { level: 1 | 2 | 3 | 4 | 5 | 6; text: string };
export type MarkdownHeading = OutlineItem & { start: number; end: number };
export type MarkdownHeadingTarget = OutlineItem & { occurrence: number; fallbackIndex: number };
export type MarkdownFenceInfo = {
  char: "`" | "~";
  length: number;
  prefixLength: number;
  markerLength: number;
  info: string;
};

export function markdownContainerPrefixLength(text: string) {
  let cursor = 0;
  let moved = true;

  while (moved) {
    moved = false;
    const slice = text.slice(cursor);
    const blockquote = slice.match(/^( {0,3}>\s?)/);
    if (blockquote) {
      cursor += blockquote[1].length;
      moved = true;
      continue;
    }

    const list = slice.match(/^( {0,3}(?:[-*+]|\d+[.)])\s+)/);
    if (list) {
      cursor += list[1].length;
      moved = true;
    }
  }

  return cursor;
}

export function openingMarkdownFence(text: string): MarkdownFenceInfo | null {
  const containerPrefix = markdownContainerPrefixLength(text);
  const source = text.slice(containerPrefix);
  const match = source.match(/^([ \t]*)(`{3,}|~{3,})(.*)$/);
  if (!match) return null;
  const marker = match[2];
  const char = marker[0] as "`" | "~";
  const info = match[3] ?? "";
  if (char === "`" && info.includes("`")) return null;
  return {
    char,
    length: marker.length,
    prefixLength: containerPrefix + match[1].length,
    markerLength: marker.length,
    info,
  };
}

export function closingMarkdownFence(text: string, opener: MarkdownFenceInfo) {
  const containerPrefix = markdownContainerPrefixLength(text);
  const source = text.slice(containerPrefix);
  const match = source.match(new RegExp(`^[ \\t]*(${opener.char}{${opener.length},})[ \\t]*$`));
  return Boolean(match);
}

export type MarkdownProperty = {
  key: string;
  value: string;
  type: "text" | "list" | "checkbox" | "number" | "date";
};

export type YamlFrontmatterParts = {
  frontmatter: string;
  content: string;
  body: string;
  properties: MarkdownProperty[];
};

export function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function stripAtxClosing(text: string) {
  return text.replace(/\s+#{1,}\s*$/, "").trim();
}

export function markdownSetextHeadingLevel(
  textLine: string,
  markerLine: string,
): 1 | 2 | null {
  const marker = markerLine.match(/^ {0,3}(=+|-+)[ \t]*$/);
  if (!marker || !textLine.trim()) return null;
  if (marker[1] === "-") return null;
  if (markdownContainerPrefixLength(textLine) > 0) return null;
  if (/^ {0,3}#{1,6}(?:[ \t]+|$)/.test(textLine)) return null;
  if (/^(?: {4}|\t)/.test(textLine)) return null;
  return marker[1].startsWith("=") ? 1 : 2;
}

function markdownSourceLines(markdown: string, start: number) {
  let offset = start;
  return markdown.slice(start).split("\n").map((text) => {
    const line = { text, start: offset, end: offset + text.length };
    offset = line.end + 1;
    return line;
  });
}

function matchingMarkdownFenceClose(
  lines: ReturnType<typeof markdownSourceLines>,
  startIndex: number,
  opener: MarkdownFenceInfo,
) {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (closingMarkdownFence(lines[index].text, opener)) return index;
  }
  return -1;
}

export function extractMarkdownHeadings(markdown: string): MarkdownHeading[] {
  const bodyStart = yamlFrontmatterBodyStart(markdown);
  const lines = markdownSourceLines(markdown, bodyStart);
  let previousLine: { text: string; start: number; end: number } | null = null;
  const headings: MarkdownHeading[] = [];

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const opener = openingMarkdownFence(line.text);
    if (opener) {
      const closeIndex = matchingMarkdownFenceClose(lines, index, opener);
      previousLine = null;
      index = closeIndex >= 0 ? closeIndex + 1 : index + 1;
      continue;
    }

    const atxMatch = line.text.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*$/);
    if (atxMatch) {
      const text = stripAtxClosing(atxMatch[2]);
      if (text) {
        headings.push({
          level: atxMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6,
          text,
          start: line.start,
          end: line.end,
        });
      }
      previousLine = null;
      index += 1;
      continue;
    }

    const setextLevel = previousLine
      ? markdownSetextHeadingLevel(previousLine.text, line.text)
      : null;
    if (setextLevel && previousLine) {
      headings.push({
        level: setextLevel,
        text: previousLine.text.trim(),
        start: previousLine.start,
        end: line.end,
      });
      previousLine = null;
      index += 1;
      continue;
    }

    previousLine = line.text.trim() ? line : null;
    index += 1;
  }

  return headings;
}

export function markdownHeadingTargetAt(
  headings: MarkdownHeading[],
  index: number,
): MarkdownHeadingTarget | null {
  const heading = headings[index];
  if (!heading) return null;
  return {
    level: heading.level,
    text: heading.text,
    occurrence: headings.slice(0, index).filter((item) => (
      item.level === heading.level && item.text === heading.text
    )).length,
    fallbackIndex: index,
  };
}

export function resolveMarkdownHeading(
  markdown: string,
  target: MarkdownHeadingTarget,
) {
  const headings = extractMarkdownHeadings(markdown);
  return headings.filter((item) => (
    item.level === target.level && item.text === target.text
  ))[target.occurrence] ?? headings[target.fallbackIndex] ?? null;
}

function yamlFrontmatterBodyStart(markdown: string) {
  const lines = markdown.split("\n");
  const leadingBlankLineCount = countLeadingBlankLines(lines);
  const openingFence = frontmatterFenceMarker(lines[leadingBlankLineCount]?.replace(/^\uFEFF/, "") ?? "");
  if (!openingFence) return 0;

  for (let index = leadingBlankLineCount + 1; index < lines.length; index += 1) {
    const closingFence = frontmatterFenceMarker(lines[index]);
    if (!closingFence) continue;

    const content = lines.slice(leadingBlankLineCount + 1, index).join("\n");
    const properties = parseYamlProperties(content);
    if ((leadingBlankLineCount > 0 || openingFence !== "---" || closingFence !== "---") && properties.length === 0) continue;

    let bodyStart = 0;
    for (let lineIndex = 0; lineIndex <= index; lineIndex += 1) {
      bodyStart += lines[lineIndex].length + (lineIndex < lines.length - 1 ? 1 : 0);
    }
    return bodyStart;
  }

  return 0;
}

export function extractOutline(markdown: string) {
  return extractMarkdownHeadings(markdown).map(({ level, text }) => ({ level, text }));
}

function normalizeHeadingMatch(value: string) {
  return value
    .replace(/^#+\s*/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function headingSlug(value: string) {
  return normalizeHeadingMatch(value)
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-");
}

function headingMatchTexts(value: string) {
  const clean = value.trim();
  const beforeAlias = clean.split("|", 1)[0]?.trim();
  return [clean, beforeAlias ?? ""]
    .filter((item, index, items) => item && items.indexOf(item) === index);
}

export function findHeadingIndex(markdown: string, heading: string) {
  const wantedTexts = headingMatchTexts(heading);
  const wanted = wantedTexts.map(normalizeHeadingMatch);
  const wantedSlugs = wantedTexts.map(headingSlug);
  return extractOutline(markdown).findIndex((item) => (
    headingMatchTexts(item.text).some((text) => wanted.includes(normalizeHeadingMatch(text)))
    || headingMatchTexts(item.text).some((text) => wantedSlugs.includes(headingSlug(text)))
  ));
}

type MarkdownFenceState = {
  marker: "`" | "~";
  length: number;
};

function markdownFenceAtLineStart(line: string) {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/);
  if (!match) return null;

  const fence = match[1];
  return {
    marker: fence[0] as "`" | "~",
    length: fence.length,
    rest: line.slice(match[0].length),
  };
}

function mapMarkdownOutsideFences(markdown: string, mapLine: (line: string) => string) {
  let activeFence: MarkdownFenceState | null = null;

  return markdown.split(/(\r?\n)/).map((part) => {
    if (part === "\n" || part === "\r\n") return part;
    const fence = markdownFenceAtLineStart(part);

    if (activeFence) {
      if (
        fence
        && fence.marker === activeFence.marker
        && fence.length >= activeFence.length
        && fence.rest.trim().length === 0
      ) {
        activeFence = null;
      }
      return part;
    }

    if (fence) {
      activeFence = { marker: fence.marker, length: fence.length };
      return part;
    }

    return mapLine(part);
  }).join("");
}

export function normalizeWikiLinkEscapes(markdown: string) {
  return mapMarkdownOutsideFences(markdown, (part) => (
    part.replace(/(!?)((?:\\?\[){2})([^\]\n]+?)((?:\\?\]){2})/g, (match, embedded: string, opener: string, target: string, closer: string) => {
      if (!opener.includes("\\") && !closer.includes("\\")) return match;
      return `${embedded}[[${target}]]`;
    })
  ));
}

function unescapeRichMarkdownPunctuation(value: string) {
  return value.replace(/\\([!-\/:-@[-`{-~])/g, "$1");
}

function unescapeRichMarkdownLabel(value: string) {
  return value.replace(/\\([!-\/:-@[-`{-~])/g, (match, char: string) => (
    char === "[" || char === "]" || char === "(" || char === ")" || char === "\\"
      ? match
      : char
  ));
}

function isEscapedAt(value: string, index: number) {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function markdownLinkDestinationEnd(value: string, openParen: number) {
  let depth = 1;
  for (let index = openParen + 1; index < value.length; index += 1) {
    if (value[index] === "\\" && value[index + 1] === "(") {
      depth += 1;
      index += 1;
      continue;
    }
    if (value[index] === "\\" && value[index + 1] === ")") {
      depth -= 1;
      if (depth === 0) return index + 2;
      index += 1;
      continue;
    }
    if (isEscapedAt(value, index)) continue;
    if (value[index] === "(") {
      depth += 1;
      continue;
    }
    if (value[index] !== ")") continue;
    depth -= 1;
    if (depth === 0) return index + 1;
  }
  return -1;
}

function normalMarkdownLinkAt(value: string, start: number) {
  if (value[start] !== "[" || isEscapedAt(value, start) || value[start - 1] === "!") return null;

  let labelEnd = -1;
  for (let index = start + 1; index < value.length; index += 1) {
    if (value[index] === "]" && !isEscapedAt(value, index)) {
      labelEnd = index;
      break;
    }
  }
  if (labelEnd < 0 || value[labelEnd + 1] !== "(") return null;

  const end = markdownLinkDestinationEnd(value, labelEnd + 1);
  if (end < 0) return null;

  const label = unescapeRichMarkdownLabel(value.slice(start + 1, labelEnd));
  const rawHref = unescapeRichMarkdownPunctuation(value.slice(labelEnd + 2, end - 1)).trim();
  if (!label || !rawHref) return null;

  const nested = rawHref.match(/^\[([^\]\n]+)]\((.+)\)$/);
  const href = nested ? nested[2].trim() : rawHref;
  return {
    end,
    text: `[${label}](${href})`,
  };
}

function escapedMarkdownLinkAt(value: string, start: number) {
  if (value[start] !== "\\" || value[start + 1] !== "[") return null;

  const labelStart = start + 2;
  let labelEnd = -1;
  let afterLabel = -1;
  for (let index = labelStart; index < value.length; index += 1) {
    if (value[index] === "\\" && value[index + 1] === "]") {
      labelEnd = index;
      afterLabel = index + 2;
      break;
    }
    if (value[index] === "]" && !isEscapedAt(value, index)) {
      labelEnd = index;
      afterLabel = index + 1;
      break;
    }
  }
  if (labelEnd < 0) return null;

  const openParen = value[afterLabel] === "\\" && value[afterLabel + 1] === "("
    ? afterLabel + 1
    : value[afterLabel] === "("
      ? afterLabel
      : -1;
  if (openParen < 0) return null;

  const end = markdownLinkDestinationEnd(value, openParen);
  if (end < 0) return null;

  const label = unescapeRichMarkdownLabel(value.slice(labelStart, labelEnd));
  const rawHref = unescapeRichMarkdownPunctuation(value.slice(openParen + 1, end - 1)).trim();
  if (!label || !rawHref) return null;

  const nested = rawHref.match(/^\[([^\]\n]+)]\((.+)\)$/);
  const href = nested ? nested[2].trim() : rawHref;
  return {
    end,
    text: `[${label}](${href})`,
  };
}

function escapedAutolinkAt(value: string, start: number) {
  const escapedOpen = value[start] === "\\" && value[start + 1] === "<";
  const plainOpen = value[start] === "<" && !isEscapedAt(value, start);
  if (!escapedOpen && !plainOpen) return null;

  const bodyStart = start + (escapedOpen ? 2 : 1);
  for (let index = bodyStart; index < value.length; index += 1) {
    if (value[index] === "\n") return null;
    const escapedClose = value[index] === "\\" && value[index + 1] === ">";
    const plainClose = value[index] === ">" && !isEscapedAt(value, index);
    if (!escapedClose && !plainClose) continue;

    const bodyEnd = escapedClose ? index : index;
    const href = unescapeRichMarkdownPunctuation(value.slice(bodyStart, bodyEnd)).trim();
    if (!/^[a-z][a-z\d+.-]*:[^\s<>]+$/i.test(href)) return null;

    return {
      end: index + (escapedClose ? 2 : 1),
      text: `<${href}>`,
    };
  }
  return null;
}

function normalizeEscapedMarkdownLinks(line: string) {
  let normalized = "";
  for (let index = 0; index < line.length;) {
    const link = escapedMarkdownLinkAt(line, index)
      ?? normalMarkdownLinkAt(line, index)
      ?? escapedAutolinkAt(line, index);
    if (link) {
      normalized += link.text;
      index = link.end;
      continue;
    }
    normalized += line[index];
    index += 1;
  }
  return normalized;
}

export function normalizeRichMarkdownEscapes(markdown: string) {
  const wikiNormalized = normalizeWikiLinkEscapes(markdown);
  return mapMarkdownOutsideFences(wikiNormalized, normalizeEscapedMarkdownLinks);
}

export function extractFirstLineTitle(markdown: string) {
  const firstLine = markdown.split(/\r?\n/, 1)[0] ?? "";
  const match = firstLine.match(/^#(?!#)\s+(.+?)\s*$/);
  return match?.[1].trim() || null;
}

export function splitYamlFrontmatter(markdown: string): YamlFrontmatterParts | null {
  const normalized = markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const leadingBlankLineCount = countLeadingBlankLines(lines);
  const openingFence = frontmatterFenceMarker(lines[leadingBlankLineCount] ?? "");
  if (!openingFence) return null;

  for (let index = leadingBlankLineCount + 1; index < lines.length; index += 1) {
    const closingFence = frontmatterFenceMarker(lines[index]);
    if (!closingFence) continue;

    const content = lines.slice(leadingBlankLineCount + 1, index).join("\n");
    const properties = parseYamlProperties(content);
    if ((leadingBlankLineCount > 0 || openingFence !== "---" || closingFence !== "---") && properties.length === 0) continue;

    const sourceFrontmatterWithoutTrailingNewline = lines.slice(0, index + 1).join("\n");
    const frontmatterEnd = sourceFrontmatterWithoutTrailingNewline.length + (index < lines.length - 1 ? 1 : 0);
    const frontmatter = content.trim() ? createYamlFrontmatter(content) : "---\n---\n";
    return {
      frontmatter: index < lines.length - 1 ? frontmatter : frontmatter.replace(/\n$/, ""),
      content,
      body: normalized.slice(frontmatterEnd),
      properties,
    };
  }

  return null;
}

export function composeMarkdownWithFrontmatter(frontmatter: string | null | undefined, body: string) {
  if (!frontmatter) return body;
  if (!body) return frontmatter.replace(/\r\n?/g, "\n").replace(/\n?$/, "");

  const normalizedFrontmatter = frontmatter.replace(/\r\n?/g, "\n");
  return normalizedFrontmatter.endsWith("\n")
    ? `${normalizedFrontmatter}${body}`
    : `${normalizedFrontmatter}\n${body}`;
}

export function createYamlFrontmatter(content: string) {
  const cleanContent = content.replace(/\r\n?/g, "\n").replace(/^\n+|\n+$/g, "");
  return cleanContent ? `---\n${cleanContent}\n---\n` : "";
}

export function parseYamlFrontmatterProperties(markdown: string) {
  return splitYamlFrontmatter(markdown)?.properties ?? [];
}

export function yamlPropertyValues(properties: MarkdownProperty[], key: string) {
  const property = properties.find((item) => item.key.toLowerCase() === key.toLowerCase());
  if (!property) return [];
  return splitYamlPropertyValue(property.value);
}

export function splitYamlPropertyValue(value: string) {
  const cleanValue = value.trim().replace(/^\[|\]$/g, "");
  if (!cleanValue) return [];
  return cleanValue
    .split(",")
    .map((item) => cleanYamlValue(item))
    .filter(Boolean);
}

export function yamlListValue(items: string[]) {
  const cleanItems = items
    .map((item) => item.trim().replace(/^#/, ""))
    .filter(Boolean);
  return cleanItems.length ? `[${cleanItems.join(", ")}]` : "";
}

export function yamlListValueFromInput(value: string) {
  const normalized = value.trim();
  if (!normalized) return "";
  const hasExplicitSeparator = /[,，\n]/.test(normalized);
  return yamlListValue(hasExplicitSeparator ? normalized.split(/[,，\n]+/) : normalized.split(/\s+/));
}

export function setYamlPropertyValue(content: string, key: string, value: string) {
  const normalized = content.replace(/\r\n?/g, "\n").replace(/^\n+|\n+$/g, "");
  const lines = normalized ? normalized.split("\n") : [];
  const keyPattern = new RegExp(`^${escapeRegExp(key)}\\s*:`);
  const nextLines: string[] = [];
  let replaced = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!keyPattern.test(line.trimStart())) {
      nextLines.push(line);
      continue;
    }

    replaced = true;
    if (value.trim()) nextLines.push(`${key}: ${value.trim()}`);

    while (index + 1 < lines.length && isYamlPropertyContinuation(lines[index + 1])) {
      index += 1;
    }
  }

  if (!replaced && value.trim()) nextLines.push(`${key}: ${value.trim()}`);
  return nextLines.filter((line, index, items) => line.trim() || (items[index - 1]?.trim() && items[index + 1]?.trim())).join("\n");
}

function isYamlPropertyContinuation(line: string) {
  return /^\s+-\s+/.test(line) || (line.trim() === "");
}

function parseYamlProperties(content: string): MarkdownProperty[] {
  const lines = content.split("\n");
  const properties: MarkdownProperty[] = [];
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
    if (!line.trim()) {
      if (currentKey) continue;
      continue;
    }

    const listItem = line.match(/^\s+-\s+(.+)$/);
    if (listItem && currentKey) {
      currentItems.push(cleanYamlValue(listItem[1]));
      continue;
    }

    flushList();
    const match = line.match(/^\s*([A-Za-z0-9_-]+):\s*(.*)$/);
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

function frontmatterFenceMarker(line: string) {
  const trimmed = line.trim();
  return trimmed === "---" || trimmed === "***" || trimmed === "___" ? trimmed : null;
}

function countLeadingBlankLines(lines: string[]) {
  let count = 0;
  while (count < lines.length && lines[count].trim() === "") count += 1;
  return count;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanYamlValue(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function yamlPropertyType(value: string): MarkdownProperty["type"] {
  const clean = cleanYamlValue(value);
  if (/^\[.*]$/.test(value.trim())) return "list";
  if (/^(true|false)$/i.test(clean)) return "checkbox";
  if (/^-?\d+(\.\d+)?$/.test(clean)) return "number";
  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) return "date";
  return "text";
}

export function getHeadingOffsets(markdown: string) {
  return extractMarkdownHeadings(markdown).map(({ start, end }) => ({ start, end }));
}

export function countDocumentText(markdown: string) {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/[#>*_[\]()`~!-]/g, " ");
  const compactCharacters = text.match(/[\p{L}\p{N}]/gu)?.length ?? 0;

  const Segmenter = (Intl as typeof Intl & {
    Segmenter?: new (
      locale?: string | string[],
      options?: { granularity: "word" },
    ) => {
      segment: (input: string) => Iterable<{ isWordLike?: boolean }>;
    };
  }).Segmenter;
  if (Segmenter) {
    const segmenter = new Segmenter(undefined, { granularity: "word" });
    const words = Array.from(segmenter.segment(text))
      .filter((segment) => segment.isWordLike)
      .length;
    return { characters: compactCharacters, words };
  }

  const words = text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
  return { characters: compactCharacters, words };
}

export function stripExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "");
}

export function pathFileName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? "Untitled.md";
}

export function pathExtension(path: string) {
  const match = pathFileName(path).match(/\.([^.]+)$/);
  return match?.[1]?.toLowerCase() ?? "";
}

export function ensureSaveExtension(path: string, defaultExt: SaveFileExt) {
  const extension = pathExtension(path);
  if (extension === "md" || extension === "markdown" || extension === "txt") return path;
  return `${path}.${defaultExt}`;
}

export function ensureVaultFileName(name: string, defaultExt: SaveFileExt) {
  const cleanName = name.trim();
  const extension = pathExtension(cleanName);
  if (extension === "md" || extension === "markdown" || extension === "txt") return cleanName;
  return `${cleanName}.${defaultExt}`;
}

export function vaultFileNameCandidate(name: string, defaultExt: SaveFileExt, index: number) {
  const fileName = ensureVaultFileName(name, defaultExt);
  if (index <= 0) return fileName;

  const extensionMatch = fileName.match(/(\.[^.]+)$/);
  if (!extensionMatch) return `${fileName} ${index + 1}`;

  const extension = extensionMatch[1];
  const baseName = fileName.slice(0, -extension.length);
  return `${baseName} ${index + 1}${extension}`;
}

export function joinVaultPath(directory: string, name: string) {
  const cleanName = name.trim();
  return directory ? `${directory}/${cleanName}` : cleanName;
}

export function normalizeFilePath(path: string) {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function isSameOrChildPath(path: string | undefined, parentPath: string) {
  if (!path) return false;

  const normalizedPath = normalizeFilePath(path);
  const normalizedParent = normalizeFilePath(parentPath);
  return normalizedPath === normalizedParent || normalizedPath.startsWith(`${normalizedParent}/`);
}

export function parentVaultDir(relativePath: string) {
  const normalized = relativePath.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index > -1 ? normalized.slice(0, index) : "";
}
