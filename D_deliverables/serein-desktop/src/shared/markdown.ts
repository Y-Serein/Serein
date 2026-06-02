import type { SaveFileExt } from "../app/types";

export type OutlineItem = { level: 1 | 2 | 3 | 4 | 5 | 6; text: string };

export function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function stripAtxClosing(text: string) {
  return text.replace(/\s+#{1,}\s*$/, "").trim();
}

function extractMarkdownHeadings(markdown: string) {
  let offset = 0;
  let previousLine: { text: string; start: number; end: number } | null = null;
  let inFence = false;
  const headings: Array<{ level: 1 | 2 | 3 | 4 | 5 | 6; text: string; start: number; end: number }> = [];

  for (const line of markdown.split("\n")) {
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

export function extractFirstLineTitle(markdown: string) {
  const firstLine = markdown.split(/\r?\n/, 1)[0] ?? "";
  const match = firstLine.match(/^#(?!#)\s+(.+?)\s*$/);
  return match?.[1].trim() || null;
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
