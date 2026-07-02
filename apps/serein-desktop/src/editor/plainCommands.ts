import type { EditorCommandAction } from "../domain/model";

export type PlainEditResult = {
  markdown: string;
  selectionStart: number;
  selectionEnd: number;
};

function lineBounds(markdown: string, start: number, end: number) {
  const lineStart = markdown.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const nextBreak = markdown.indexOf("\n", end);
  const lineEnd = nextBreak === -1 ? markdown.length : nextBreak;
  return { lineStart, lineEnd };
}

function transformSelectedLines(
  markdown: string,
  start: number,
  end: number,
  transform: (line: string, index: number) => string,
): PlainEditResult {
  const { lineStart, lineEnd } = lineBounds(markdown, start, end);
  const selected = markdown.slice(lineStart, lineEnd);
  const lines = selected.split("\n");
  const nextSelected = lines.map(transform).join("\n");

  return {
    markdown: `${markdown.slice(0, lineStart)}${nextSelected}${markdown.slice(lineEnd)}`,
    selectionStart: lineStart,
    selectionEnd: lineStart + nextSelected.length,
  };
}

function findFenceContentRange(markdown: string, position: number) {
  const lines = markdown.split("\n");
  let offset = 0;
  let opening: { start: number; end: number } | null = null;

  for (const line of lines) {
    const lineStart = offset;
    const lineEnd = lineStart + line.length;
    const isFence = /^\s*```/.test(line);

    if (isFence) {
      if (!opening) {
        opening = { start: lineStart, end: lineEnd };
      } else {
        const contentStart = Math.min(opening.end + 1, markdown.length);
        const contentEnd = lineStart > 0 && markdown[lineStart - 1] === "\n" ? lineStart - 1 : lineStart;
        if (position >= opening.start && position <= lineEnd) {
          return { start: contentStart, end: contentEnd };
        }
        opening = { start: lineStart, end: lineEnd };
      }
    }

    offset = lineEnd + 1;
  }

  if (!opening || position <= opening.end) return null;
  return {
    start: Math.min(opening.end + 1, markdown.length),
    end: markdown.length,
  };
}

function wrapPlainSelection(
  markdown: string,
  start: number,
  end: number,
  before: string,
  after = before,
  placeholder = "text",
): PlainEditResult {
  const selected = markdown.slice(start, end) || placeholder;
  const nextText = `${before}${selected}${after}`;

  return {
    markdown: `${markdown.slice(0, start)}${nextText}${markdown.slice(end)}`,
    selectionStart: start + before.length,
    selectionEnd: start + before.length + selected.length,
  };
}

export function applyPlainEditorCommand(
  markdown: string,
  start: number,
  end: number,
  action: EditorCommandAction,
  payload?: string,
  alt?: string,
): PlainEditResult {
  if (action === "selectAllSmart") {
    const codeRange = findFenceContentRange(markdown, start);
    return codeRange
      ? { markdown, selectionStart: codeRange.start, selectionEnd: codeRange.end }
      : { markdown, selectionStart: 0, selectionEnd: markdown.length };
  }

  if (action === "bold") return wrapPlainSelection(markdown, start, end, "**");
  if (action === "italic") return wrapPlainSelection(markdown, start, end, "*");
  if (action === "inlineCode") return wrapPlainSelection(markdown, start, end, "`");
  if (action === "strike") return wrapPlainSelection(markdown, start, end, "~~");
  if (action === "link") {
    const selected = markdown.slice(start, end) || "link";
    const url = payload || "https://";
    const nextText = `[${selected}](${url})`;
    return {
      markdown: `${markdown.slice(0, start)}${nextText}${markdown.slice(end)}`,
      selectionStart: start + 1,
      selectionEnd: start + 1 + selected.length,
    };
  }

  if (action === "codeBlock") {
    const selected = markdown.slice(start, end) || "code";
    const nextText = `\`\`\`bash\n${selected}\n\`\`\``;
    return {
      markdown: `${markdown.slice(0, start)}${nextText}${markdown.slice(end)}`,
      selectionStart: start + 8,
      selectionEnd: start + 8 + selected.length,
    };
  }

  if (action === "table") {
    const nextText = "| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |";
    return {
      markdown: `${markdown.slice(0, start)}${nextText}${markdown.slice(end)}`,
      selectionStart: start,
      selectionEnd: start + nextText.length,
    };
  }

  if (action === "image") {
    const src = payload || "assets/image.png";
    const imageAlt = alt?.replace(/[\]\n\r]/g, " ").trim() || "image";
    const cleanSrc = src.includes(" ") ? `<${src}>` : src;
    const nextText = `![${imageAlt}](${cleanSrc})`;
    return {
      markdown: `${markdown.slice(0, start)}${nextText}${markdown.slice(end)}`,
      selectionStart: start + 2,
      selectionEnd: start + 2 + imageAlt.length,
    };
  }

  const headingLevel = action === "heading1" ? 1 : action === "heading2" ? 2 : action === "heading3" ? 3 : 0;
  if (headingLevel) {
    const prefix = `${"#".repeat(headingLevel)} `;
    return transformSelectedLines(markdown, start, end, (line) => (
      line.trim() ? `${prefix}${line.replace(/^\s{0,3}#{1,6}\s+/, "")}` : line
    ));
  }

  if (action === "paragraph") {
    return transformSelectedLines(markdown, start, end, (line) => (
      line
        .replace(/^\s{0,3}#{1,6}\s+/, "")
        .replace(/^\s{0,3}>\s?/, "")
        .replace(/^\s{0,3}(?:[-*+]\s+|\d+\.\s+)/, "")
    ));
  }

  if (action === "blockquote") {
    return transformSelectedLines(markdown, start, end, (line) => (
      line.trim() && !/^\s{0,3}>\s?/.test(line) ? `> ${line}` : line.replace(/^\s{0,3}>\s?/, "")
    ));
  }

  if (action === "bulletList") {
    return transformSelectedLines(markdown, start, end, (line) => (
      line.trim() ? `- ${line.replace(/^\s{0,3}(?:[-*+]\s+|\d+\.\s+)/, "")}` : line
    ));
  }

  if (action === "orderedList") {
    return transformSelectedLines(markdown, start, end, (line, index) => (
      line.trim() ? `${index + 1}. ${line.replace(/^\s{0,3}(?:[-*+]\s+|\d+\.\s+)/, "")}` : line
    ));
  }

  return { markdown, selectionStart: start, selectionEnd: end };
}
