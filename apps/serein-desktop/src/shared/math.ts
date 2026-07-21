import katex from "katex";

export type MarkdownMathKind = "inline" | "block";

export type MarkdownMathSpan = {
  from: number;
  to: number;
  content: string;
  kind: MarkdownMathKind;
};

type MarkdownSourceLine = {
  from: number;
  to: number;
  text: string;
};

function sourceLines(markdown: string) {
  const lines: MarkdownSourceLine[] = [];
  let from = 0;

  while (from <= markdown.length) {
    const newline = markdown.indexOf("\n", from);
    const rawTo = newline < 0 ? markdown.length : newline;
    const to = rawTo > from && markdown[rawTo - 1] === "\r" ? rawTo - 1 : rawTo;
    lines.push({ from, to, text: markdown.slice(from, to) });
    if (newline < 0) break;
    from = newline + 1;
  }

  return lines;
}

function isEscaped(text: string, index: number) {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function inlineCodeRanges(text: string) {
  const ranges: Array<{ from: number; to: number }> = [];
  let index = 0;

  while (index < text.length) {
    if (text[index] !== "`") {
      index += 1;
      continue;
    }

    const openerFrom = index;
    while (text[index] === "`") index += 1;
    const markerLength = index - openerFrom;
    let cursor = index;
    let closingTo = -1;

    while (cursor < text.length) {
      const candidateFrom = text.indexOf("`", cursor);
      if (candidateFrom < 0) break;
      let candidateTo = candidateFrom;
      while (text[candidateTo] === "`") candidateTo += 1;
      if (candidateTo - candidateFrom === markerLength) {
        closingTo = candidateTo;
        break;
      }
      cursor = candidateTo;
    }

    if (closingTo >= 0) {
      ranges.push({ from: openerFrom, to: closingTo });
      index = closingTo;
    }
  }

  return ranges;
}

function rangeOverlaps(
  ranges: Array<{ from: number; to: number }>,
  from: number,
  to: number,
) {
  return ranges.some((range) => range.from < to && range.to > from);
}

function canOpenInlineDollar(text: string, index: number) {
  const next = text[index + 1];
  return Boolean(next) && next !== "$" && !/\s/.test(next);
}

function canCloseInlineDollar(text: string, index: number) {
  const previous = text[index - 1];
  const next = text[index + 1];
  return Boolean(previous)
    && previous !== "$"
    && !/\s/.test(previous)
    && !/\d/.test(next ?? "");
}

function scanInlineMath(text: string, lineFrom: number): MarkdownMathSpan[] {
  const spans: MarkdownMathSpan[] = [];
  const codeRanges = inlineCodeRanges(text);
  let index = 0;

  while (index < text.length) {
    if (
      text[index] !== "$"
      || isEscaped(text, index)
      || text[index - 1] === "$"
      || text[index + 1] === "$"
      || !canOpenInlineDollar(text, index)
    ) {
      index += 1;
      continue;
    }

    let close = index + 1;
    while (close < text.length) {
      if (
        text[close] === "$"
        && !isEscaped(text, close)
        && text[close - 1] !== "$"
        && text[close + 1] !== "$"
        && canCloseInlineDollar(text, close)
      ) {
        const rawContent = text.slice(index + 1, close);
        const content = rawContent.trim();
        const from = lineFrom + index;
        const to = lineFrom + close + 1;
        if (content && !rangeOverlaps(codeRanges, index, close + 1)) {
          spans.push({ from, to, content, kind: "inline" });
        }
        index = close + 1;
        break;
      }
      close += 1;
    }

    if (close >= text.length) index += 1;
  }

  return spans;
}

export function scanMarkdownMath(markdown: string): MarkdownMathSpan[] {
  const lines = sourceLines(markdown);
  const spans: MarkdownMathSpan[] = [];
  let fence: { marker: string; length: number } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;

    const fenceMatch = line.text.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!fence) {
        fence = { marker: marker[0], length: marker.length };
      } else if (marker[0] === fence.marker && marker.length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (fence) continue;

    if (/^\s{0,3}\$\$\s*$/.test(line.text)) {
      let closingIndex = -1;
      for (let candidateIndex = index + 1; candidateIndex < lines.length; candidateIndex += 1) {
        if (/^\s{0,3}\$\$\s*$/.test(lines[candidateIndex].text)) {
          closingIndex = candidateIndex;
          break;
        }
      }
      if (closingIndex > index) {
        const content = lines.slice(index + 1, closingIndex).map((candidate) => candidate.text).join("\n");
        if (content.trim()) {
          spans.push({
            from: line.from,
            to: lines[closingIndex].to,
            content,
            kind: "block",
          });
        }
        index = closingIndex;
        continue;
      }
    }

    const singleLineBlock = line.text.match(/^\s{0,3}\$\$(.+?)\$\$\s*$/);
    if (singleLineBlock?.[1]?.trim()) {
      spans.push({
        from: line.from,
        to: line.to,
        content: singleLineBlock[1].trim(),
        kind: "block",
      });
      continue;
    }

    spans.push(...scanInlineMath(line.text, line.from));
  }

  return spans;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderMathToHtml(content: string, displayMode: boolean) {
  const source = content.trim();
  if (!source) return "";

  try {
    return katex.renderToString(source, {
      displayMode,
      output: "htmlAndMathml",
      throwOnError: true,
      strict: "ignore",
      trust: false,
      maxExpand: 1000,
    });
  } catch {
    return `<span class="serein-math-error" title="Invalid LaTeX">${escapeHtml(source)}</span>`;
  }
}
