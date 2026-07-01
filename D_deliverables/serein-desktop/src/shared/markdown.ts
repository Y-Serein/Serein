import type { SaveFileExt } from "../app/types";

export type OutlineItem = { level: 1 | 2 | 3 | 4 | 5 | 6; text: string };
export type MarkdownHeading = OutlineItem & { start: number; end: number };

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

export function extractMarkdownHeadings(markdown: string): MarkdownHeading[] {
  let offset = yamlFrontmatterBodyStart(markdown);
  let previousLine: { text: string; start: number; end: number } | null = null;
  let inFence = false;
  const headings: MarkdownHeading[] = [];

  for (const line of markdown.slice(offset).split("\n")) {
    const lineStart = offset;
    const lineEnd = offset + line.length;
    const fenceMatch = line.match(/^\s{0,3}(```+|~~~+)/);

    if (fenceMatch) {
      inFence = !inFence;
      previousLine = null;
      offset = lineEnd + 1;
      continue;
    }

    if (!inFence) {
      const atxMatch = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*$/);
      if (atxMatch) {
        const text = stripAtxClosing(atxMatch[2]);
        if (text) {
          headings.push({
            level: atxMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6,
            text,
            start: lineStart,
            end: lineEnd,
          });
        }
        previousLine = null;
        offset = lineEnd + 1;
        continue;
      }

      const setextMatch = line.match(/^\s{0,3}(=+|-+)\s*$/);
      if (setextMatch && previousLine?.text.trim()) {
        headings.push({
          level: setextMatch[1].startsWith("=") ? 1 : 2,
          text: previousLine.text.trim(),
          start: previousLine.start,
          end: lineEnd,
        });
        previousLine = null;
        offset = lineEnd + 1;
        continue;
      }
    }

    previousLine = line.trim() ? { text: line, start: lineStart, end: lineEnd } : null;
    offset = lineEnd + 1;
  }

  return headings;
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

export function normalizeWikiLinkEscapes(markdown: string) {
  let inFence = false;
  return markdown.split(/(\r?\n)/).map((part) => {
    if (part === "\n" || part === "\r\n") return part;
    if (/^\s{0,3}(```+|~~~+)/.test(part)) {
      inFence = !inFence;
      return part;
    }
    if (inFence) return part;

    return part.replace(/(!?)((?:\\?\[){2})([^\]\n]+?)((?:\\?\]){2})/g, (match, embedded: string, opener: string, target: string, closer: string) => {
      if (!opener.includes("\\") && !closer.includes("\\")) return match;
      return `${embedded}[[${target}]]`;
    });
  }).join("");
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
  let inFence = false;
  return wikiNormalized.split(/(\r?\n)/).map((part) => {
    if (part === "\n" || part === "\r\n") return part;
    if (/^\s{0,3}(```+|~~~+)/.test(part)) {
      inFence = !inFence;
      return part;
    }
    return inFence ? part : normalizeEscapedMarkdownLinks(part);
  }).join("");
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
