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
  return Array.from(text.matchAll(/`[^`\n]+`/g), (match) => ({
    from: match.index ?? 0,
    to: (match.index ?? 0) + match[0].length,
  }));
}

function rangeOverlaps(
  ranges: Array<{ from: number; to: number }>,
  from: number,
  to: number,
) {
  return ranges.some((range) => range.from < to && range.to > from);
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
      throwOnError: false,
      strict: "ignore",
      trust: false,
      maxExpand: 1000,
    });
  } catch {
    return `<span class="serein-math-error" title="Invalid LaTeX">${escapeHtml(source)}</span>`;
  }
}
