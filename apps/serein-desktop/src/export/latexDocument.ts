export type LatexExportStructureKind = "title" | "author" | "date";

export type LatexExportStructure = {
  kind: LatexExportStructureKind;
  content: string;
};

type LatexDocumentParts = {
  preamble: string;
  body: string;
  documentClass: string;
};

const latexDocumentStart = /^\s*\\begin\s*\{\s*document\s*}\s*(?:%.*)?$/;
const latexDocumentEnd = /^\s*\\end\s*\{\s*document\s*}\s*(?:%.*)?$/;
const latexStructurePrefixes: Record<LatexExportStructureKind, string> = {
  title: "\u0000SEREIN_LATEX_TITLE\u0000",
  author: "\u0000SEREIN_LATEX_AUTHOR\u0000",
  date: "\u0000SEREIN_LATEX_DATE\u0000",
};

function isEscaped(value: string, index: number) {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function stripLatexComment(line: string) {
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === "%" && !isEscaped(line, index)) {
      return line.slice(0, index).trimEnd();
    }
  }
  return line;
}

function splitLatexDocument(markdown: string): LatexDocumentParts | null {
  const normalizedMarkdown = markdown.replace(/\r\n?/g, "\n");
  const lines = normalizedMarkdown.split("\n");
  let documentStart = -1;
  let fenceMarker = "";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const fence = line.match(/^\s{0,3}(```+|~~~+)/);
    if (fence) {
      if (!fenceMarker) {
        fenceMarker = fence[1];
      } else if (line.trim().startsWith(fenceMarker)) {
        fenceMarker = "";
      }
      continue;
    }
    if (fenceMarker) continue;

    if (documentStart < 0) {
      if (latexDocumentStart.test(line)) documentStart = index;
      continue;
    }
    if (!latexDocumentEnd.test(line)) continue;

    const preamble = lines.slice(0, documentStart).join("\n");
    const body = lines.slice(documentStart + 1, index).join("\n");
    const activePreamble = preamble
      .split("\n")
      .map(stripLatexComment)
      .join("\n");
    const classMatch = activePreamble.match(
      /\\documentclass(?:\s*\[[^\]\n]*])?\s*\{\s*([^{}\s]+)\s*}/,
    );
    return {
      preamble: activePreamble,
      body,
      documentClass: classMatch?.[1]?.toLowerCase() ?? "",
    };
  }

  return null;
}

function bracedArgument(value: string, openingIndex: number) {
  if (value[openingIndex] !== "{") return null;
  let depth = 0;
  for (let index = openingIndex; index < value.length; index += 1) {
    const character = value[index];
    if ((character === "{" || character === "}") && isEscaped(value, index)) continue;
    if (character === "{") {
      depth += 1;
      continue;
    }
    if (character !== "}") continue;
    depth -= 1;
    if (depth === 0) {
      return { content: value.slice(openingIndex + 1, index), end: index };
    }
  }
  return null;
}

function commandArgument(source: string, command: string) {
  const pattern = new RegExp(`\\\\${command}\\s*\\{`, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    if (isEscaped(source, match.index)) continue;
    const openingIndex = match.index + match[0].lastIndexOf("{");
    const argument = bracedArgument(source, openingIndex);
    if (argument) return argument.content;
  }
  return "";
}

function normalizeStructureContent(content: string) {
  return content
    .replace(/\\\\(?:\[[^\]\n]*])?/g, " ")
    .replace(/\\and\b/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

function headingLevel(command: string, documentClass: string) {
  const hasChapters = /(?:book|report|memoir|ctexbook|ctexrep)$/.test(documentClass);
  const articleLevels: Record<string, number> = {
    part: 1,
    chapter: 1,
    section: 1,
    subsection: 2,
    subsubsection: 3,
    paragraph: 4,
    subparagraph: 5,
  };
  const chapterLevels: Record<string, number> = {
    part: 1,
    chapter: 1,
    section: 2,
    subsection: 3,
    subsubsection: 4,
    paragraph: 5,
    subparagraph: 6,
  };
  return (hasChapters ? chapterLevels : articleLevels)[command] ?? 1;
}

function structureLine(kind: LatexExportStructureKind, content: string) {
  return `${latexStructurePrefixes[kind]}${content}`;
}

function normalizeLatexBody(parts: LatexDocumentParts) {
  const metadata = {
    title: normalizeStructureContent(commandArgument(parts.preamble, "title")),
    author: normalizeStructureContent(commandArgument(parts.preamble, "author")),
    date: normalizeStructureContent(commandArgument(parts.preamble, "date")),
  };
  const lines = parts.body.split("\n");
  const normalized: string[] = [];
  let fenceMarker = "";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const fence = line.match(/^\s{0,3}(```+|~~~+)/);
    if (fence) {
      if (!fenceMarker) {
        fenceMarker = fence[1];
      } else if (line.trim().startsWith(fenceMarker)) {
        fenceMarker = "";
      }
      normalized.push(line);
      continue;
    }
    if (fenceMarker) {
      normalized.push(line);
      continue;
    }

    const uncommented = stripLatexComment(line);
    if (/^\s*\\maketitle\s*$/.test(uncommented)) {
      if (metadata.title) normalized.push(structureLine("title", metadata.title));
      if (metadata.author) normalized.push(structureLine("author", metadata.author));
      if (metadata.date) normalized.push(structureLine("date", metadata.date));
      normalized.push("");
      continue;
    }
    if (/^\s*\\(?:appendix|frontmatter|mainmatter|backmatter)\s*$/.test(uncommented)) {
      continue;
    }

    const remainingBody = lines.slice(index).join("\n");
    const sectionMatch = remainingBody.match(
      /^\s*\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*(?:\[[^\]\n]*])?\s*\{/,
    );
    if (sectionMatch) {
      const openingIndex = sectionMatch[0].lastIndexOf("{");
      const argument = bracedArgument(remainingBody, openingIndex);
      if (argument) {
        const content = normalizeStructureContent(argument.content);
        const level = headingLevel(sectionMatch[1], parts.documentClass);
        if (content) normalized.push(`${"#".repeat(level)} ${content}`);

        const consumed = remainingBody.slice(0, argument.end + 1);
        const consumedLineCount = (consumed.match(/\n/g) ?? []).length;
        const suffix = stripLatexComment(
          remainingBody.slice(argument.end + 1).split("\n")[0] ?? "",
        )
          .replace(/^(?:\s*\\label\s*\{[^{}]+})+\s*/, "")
          .trim();
        if (suffix) normalized.push(suffix);
        index += consumedLineCount;
        continue;
      }
    }

    normalized.push(uncommented.replace(/^\s*\\noindent\s*/, "").replace(/~/g, " "));
  }

  return normalized.join("\n");
}

export function extractLatexDocumentBody(markdown: string) {
  const normalizedMarkdown = markdown.replace(/\r\n?/g, "\n");
  return splitLatexDocument(normalizedMarkdown)?.body ?? normalizedMarkdown;
}

export function normalizeLatexDocumentForExport(markdown: string) {
  const normalizedMarkdown = markdown.replace(/\r\n?/g, "\n");
  const parts = splitLatexDocument(normalizedMarkdown);
  return parts ? normalizeLatexBody(parts) : normalizedMarkdown;
}

export function parseLatexExportStructure(line: string): LatexExportStructure | null {
  for (const kind of Object.keys(latexStructurePrefixes) as LatexExportStructureKind[]) {
    const prefix = latexStructurePrefixes[kind];
    if (line.startsWith(prefix)) {
      return { kind, content: line.slice(prefix.length) };
    }
  }
  return null;
}
