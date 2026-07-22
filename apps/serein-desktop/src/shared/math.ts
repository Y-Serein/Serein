import { mathjax } from "@mathjax/src/mjs/mathjax.js";
import "@mathjax/mathjax-newcm-font/mjs/svg/dynamic/calligraphic.js";
import "@mathjax/mathjax-newcm-font/mjs/svg/dynamic/double-struck.js";
import "@mathjax/mathjax-newcm-font/mjs/svg/dynamic/fraktur.js";
import "@mathjax/mathjax-newcm-font/mjs/svg/dynamic/sans-serif.js";
import { TeX } from "@mathjax/src/mjs/input/tex.js";
import { SVG } from "@mathjax/src/mjs/output/svg.js";
import { liteAdaptor } from "@mathjax/src/mjs/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "@mathjax/src/mjs/handlers/html.js";
import { AmsTags } from "@mathjax/src/mjs/input/tex/ams/AmsConfiguration.js";
import { BoldsymbolMethods } from "@mathjax/src/mjs/input/tex/boldsymbol/BoldsymbolConfiguration.js";
import { Configuration } from "@mathjax/src/mjs/input/tex/Configuration.js";
import { ConfigurationType, HandlerType } from "@mathjax/src/mjs/input/tex/HandlerTypes.js";
import { Label, TagsFactory } from "@mathjax/src/mjs/input/tex/Tags.js";
import TexError from "@mathjax/src/mjs/input/tex/TexError.js";
import type { MmlNode } from "@mathjax/src/mjs/core/MmlTree/MmlNode.js";
import type TexParser from "@mathjax/src/mjs/input/tex/TexParser.js";
import { CommandMap } from "@mathjax/src/mjs/input/tex/TokenMap.js";

mathjax.asyncLoad = () => undefined;
mathjax.asyncIsSynchronous = true;

export type MarkdownMathKind = "inline" | "block";

export type MarkdownMathSpan = {
  from: number;
  to: number;
  contentFrom: number;
  content: string;
  kind: MarkdownMathKind;
  environment?: string;
};

export type RenderedMarkdownMathSpan = MarkdownMathSpan & {
  html: string;
};

export type MathSemanticNode = {
  kind: string;
  text?: string;
  attributes: Record<string, string>;
  children: MathSemanticNode[];
};

export type CompiledMarkdownMathSpan = MarkdownMathSpan & {
  tree: MathSemanticNode | null;
};

export type MathCompilationOptions = {
  macroDefinitions?: string;
};

type MarkdownSourceLine = {
  from: number;
  to: number;
  text: string;
};

type SubequationState = {
  base: number;
  index: number;
};

const outerMathEnvironments = new Set([
  "equation",
  "equation*",
  "align",
  "align*",
  "alignat",
  "alignat*",
  "flalign",
  "flalign*",
  "multline",
  "multline*",
  "gather",
  "gather*",
  "subequations",
]);

function alphabeticSuffix(index: number) {
  let value = index;
  let suffix = "";
  while (value > 0) {
    value -= 1;
    suffix = String.fromCharCode(97 + (value % 26)) + suffix;
    value = Math.floor(value / 26);
  }
  return suffix || "a";
}

class SereinTags extends AmsTags {
  private sereinSubequations: SubequationState | null = null;

  beginSubequations(label: string) {
    if (this.sereinSubequations) {
      throw new TexError("NestedSubequations", "Nested subequations environments are not supported");
    }

    const base = this.counter + 1;
    this.counter = base;
    this.sereinSubequations = { base, index: 0 };

    if (!label || this.refUpdate) return;
    if (
      (this.allLabels[label] || this.labels[label])
      && !this.configuration.options.ignoreDuplicateLabels
    ) {
      throw new TexError("MultipleLabel", "Label '%1' multiply defined", label);
    }
    this.labels[label] = new Label(String(base), this.formatId(label));
  }

  endSubequations() {
    if (!this.sereinSubequations) {
      throw new TexError("MissingSubequations", "Missing subequations environment start");
    }
    this.sereinSubequations = null;
  }

  autoTag() {
    if (!this.sereinSubequations) {
      super.autoTag();
      return;
    }
    if (this.currentTag.tag == null) {
      this.sereinSubequations.index += 1;
      this.tag(
        `${this.sereinSubequations.base}${alphabeticSuffix(this.sereinSubequations.index)}`,
        false,
      );
    }
  }
}

TagsFactory.add("serein-ams", SereinTags);

const sereinSubequationMethods = {
  Begin(parser: TexParser, name: unknown) {
    (parser.tags as SereinTags).beginSubequations(parser.GetArgument(String(name)));
  },
  End(parser: TexParser) {
    (parser.tags as SereinTags).endSubequations();
  },
};

new CommandMap("serein-subequation-macros", {
  sereinBeginSubequations: sereinSubequationMethods.Begin,
  sereinEndSubequations: sereinSubequationMethods.End,
});

Configuration.create("serein-subequations", {
  [ConfigurationType.HANDLER]: {
    [HandlerType.MACRO]: ["serein-subequation-macros"],
  },
});

new CommandMap("serein-compatibility-macros", {
  bm: BoldsymbolMethods.Boldsymbol,
});

Configuration.create("serein-compatibility", {
  [ConfigurationType.HANDLER]: {
    [HandlerType.MACRO]: ["serein-compatibility-macros"],
  },
});

const mathAdaptor = liteAdaptor();
RegisterHTMLHandler(mathAdaptor);

const mathSvgOutput = new SVG({
  fontCache: "none",
  useXlink: false,
  linebreaks: { inline: false, width: "100%" },
});

const renderedMathCache = new Map<string, string[]>();
const renderedMathCacheLimit = 6;
const sereinTexPackages = [
  "base",
  "ams",
  "newcommand",
  "boldsymbol",
  "serein-subequations",
  "serein-compatibility",
];

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

function stripLatexComments(value: string) {
  return value
    .split("\n")
    .map((line) => {
      for (let index = 0; index < line.length; index += 1) {
        if (line[index] === "%" && !isEscaped(line, index)) return line.slice(0, index);
      }
      return line;
    })
    .join("\n");
}

function latexPreamble(markdown: string) {
  const normalized = markdown.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
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
    if (/^\s*\\begin\s*\{\s*document\s*}\s*(?:%.*)?$/.test(line)) {
      return stripLatexComments(lines.slice(0, index).join("\n"));
    }
  }

  return "";
}

function balancedGroup(
  value: string,
  openingIndex: number,
  opener: "{" | "[",
  closer: "}" | "]",
) {
  if (value[openingIndex] !== opener) return null;
  let depth = 0;
  for (let index = openingIndex; index < value.length; index += 1) {
    if (isEscaped(value, index)) continue;
    if (value[index] === opener) {
      depth += 1;
      continue;
    }
    if (value[index] !== closer) continue;
    depth -= 1;
    if (depth === 0) return { end: index + 1 };
  }
  return null;
}

function skipWhitespace(value: string, from: number) {
  let cursor = from;
  while (/\s/.test(value[cursor] ?? "")) cursor += 1;
  return cursor;
}

function latexControlSequenceEnd(value: string, from: number) {
  if (value[from] !== "\\") return -1;
  let cursor = from + 1;
  if (/[A-Za-z@]/.test(value[cursor] ?? "")) {
    while (/[A-Za-z@]/.test(value[cursor] ?? "")) cursor += 1;
    return cursor;
  }
  return cursor < value.length ? cursor + 1 : -1;
}

function latexMacroDefinitionEnd(value: string, from: number) {
  const command = value.slice(from).match(/^\\(?:newcommand|renewcommand|providecommand)\*?/);
  if (!command) return -1;
  let cursor = skipWhitespace(value, from + command[0].length);

  if (value[cursor] === "{") {
    const name = balancedGroup(value, cursor, "{", "}");
    if (!name) return -1;
    const controlSequence = value.slice(cursor + 1, name.end - 1).trim();
    if (latexControlSequenceEnd(controlSequence, 0) !== controlSequence.length) return -1;
    cursor = name.end;
  } else {
    const nameEnd = latexControlSequenceEnd(value, cursor);
    if (nameEnd < 0) return -1;
    cursor = nameEnd;
  }

  cursor = skipWhitespace(value, cursor);
  if (value[cursor] === "[") {
    const argumentCount = balancedGroup(value, cursor, "[", "]");
    if (!argumentCount) return -1;
    cursor = skipWhitespace(value, argumentCount.end);
    if (value[cursor] === "[") {
      const defaultArgument = balancedGroup(value, cursor, "[", "]");
      if (!defaultArgument) return -1;
      cursor = skipWhitespace(value, defaultArgument.end);
    }
  }

  const replacement = balancedGroup(value, cursor, "{", "}");
  return replacement?.end ?? -1;
}

export function extractLatexMathMacroDefinitions(markdown: string) {
  const preamble = latexPreamble(markdown);
  if (!preamble) return "";
  const definitions: string[] = [];
  const commandPattern = /\\(?:newcommand|renewcommand|providecommand)\*?/g;
  let match: RegExpExecArray | null;

  while ((match = commandPattern.exec(preamble)) !== null) {
    if (isEscaped(preamble, match.index)) continue;
    const end = latexMacroDefinitionEnd(preamble, match.index);
    if (end < 0) continue;
    definitions.push(preamble.slice(match.index, end));
    commandPattern.lastIndex = end;
  }

  return definitions.join("\n");
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

function findUnescapedDelimiter(
  text: string,
  delimiter: string,
  from: number,
  excludedRanges: Array<{ from: number; to: number }> = [],
) {
  let cursor = from;
  while (cursor < text.length) {
    const index = text.indexOf(delimiter, cursor);
    if (index < 0) return -1;
    if (!isEscaped(text, index) && !rangeOverlaps(excludedRanges, index, index + delimiter.length)) {
      return index;
    }
    cursor = index + delimiter.length;
  }
  return -1;
}

function findLineEndingDelimiter(text: string, delimiter: string) {
  let cursor = 0;
  while (cursor < text.length) {
    const index = findUnescapedDelimiter(text, delimiter, cursor);
    if (index < 0) return -1;
    if (!text.slice(index + delimiter.length).trim()) return index;
    cursor = index + delimiter.length;
  }
  return -1;
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

function scanDollarInlineMath(text: string, lineFrom: number): MarkdownMathSpan[] {
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
          spans.push({ from, to, contentFrom: from + 1, content, kind: "inline" });
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

function scanLatexInlineMath(text: string, lineFrom: number): MarkdownMathSpan[] {
  const spans: MarkdownMathSpan[] = [];
  const codeRanges = inlineCodeRanges(text);
  let cursor = 0;

  while (cursor < text.length) {
    const opener = findUnescapedDelimiter(text, "\\(", cursor, codeRanges);
    if (opener < 0) break;
    const closer = findUnescapedDelimiter(text, "\\)", opener + 2, codeRanges);
    if (closer < 0) {
      cursor = opener + 2;
      continue;
    }

    const content = text.slice(opener + 2, closer).trim();
    if (content) {
      spans.push({
        from: lineFrom + opener,
        to: lineFrom + closer + 2,
        contentFrom: lineFrom + opener + 2,
        content,
        kind: "inline",
      });
    }
    cursor = closer + 2;
  }

  return spans;
}

function scanLatexReferences(
  text: string,
  lineFrom: number,
  excludedRanges: Array<{ from: number; to: number }>,
) {
  const spans: MarkdownMathSpan[] = [];
  const codeRanges = inlineCodeRanges(text);
  const pattern = /\\(?:eqref|ref)\s*\{[^{}\n]+}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const from = match.index;
    const to = pattern.lastIndex;
    if (
      isEscaped(text, from)
      || rangeOverlaps(codeRanges, from, to)
      || rangeOverlaps(excludedRanges, from, to)
    ) {
      continue;
    }
    spans.push({
      from: lineFrom + from,
      to: lineFrom + to,
      contentFrom: lineFrom + from,
      content: match[0],
      kind: "inline" as const,
    });
  }
  return spans;
}

function scanInlineMath(text: string, lineFrom: number) {
  const standardSpans = scanLatexInlineMath(text, lineFrom);
  const compatibilitySpans = scanDollarInlineMath(text, lineFrom)
    .filter((span) => !rangeOverlaps(standardSpans, span.from, span.to));
  const mathSpans = [...standardSpans, ...compatibilitySpans];
  const referenceSpans = scanLatexReferences(text, lineFrom, mathSpans);
  return [...mathSpans, ...referenceSpans].sort((left, right) => left.from - right.from);
}

function scanLatexBlockMath(lines: MarkdownSourceLine[], index: number) {
  const line = lines[index];
  if (!line) return null;
  const opener = line.text.match(/^(\s{0,3})\\\[(.*)$/);
  if (!opener) return null;

  const leading = opener[1] ?? "";
  const firstContent = opener[2] ?? "";
  const sameLineCloser = findLineEndingDelimiter(firstContent, "\\]");
  if (sameLineCloser >= 0) {
    const content = firstContent.slice(0, sameLineCloser).trim();
    if (!content) return null;
    return {
      closingIndex: index,
      span: {
        from: line.from,
        to: line.to,
        contentFrom: line.from + leading.length + 2,
        content,
        kind: "block" as const,
      },
    };
  }

  const contentLines = [firstContent];
  for (let candidateIndex = index + 1; candidateIndex < lines.length; candidateIndex += 1) {
    const candidate = lines[candidateIndex];
    if (!candidate) continue;
    const closer = findLineEndingDelimiter(candidate.text, "\\]");
    if (closer < 0) {
      contentLines.push(candidate.text);
      continue;
    }

    contentLines.push(candidate.text.slice(0, closer));
    const content = contentLines.join("\n").trim();
    if (!content) return null;
    return {
      closingIndex: candidateIndex,
      span: {
        from: line.from,
        to: candidate.to,
        contentFrom: line.from + leading.length + 2,
        content,
        kind: "block" as const,
      },
    };
  }

  return null;
}

function scanLatexEnvironmentBlock(
  markdown: string,
  lines: MarkdownSourceLine[],
  index: number,
) {
  const line = lines[index];
  if (!line) return null;
  const opener = line.text.match(/^(\s{0,3})\\begin\s*\{([^}]+)}/);
  const environment = opener?.[2] ?? "";
  if (!opener || !outerMathEnvironments.has(environment)) return null;

  const tokenPattern = new RegExp(`\\\\(begin|end)\\s*\\{${environment.replace(/\*/g, "\\*")}}`, "g");
  let depth = 0;
  for (let candidateIndex = index; candidateIndex < lines.length; candidateIndex += 1) {
    const candidate = lines[candidateIndex];
    if (!candidate) continue;
    tokenPattern.lastIndex = 0;
    let token: RegExpExecArray | null;
    while ((token = tokenPattern.exec(candidate.text)) !== null) {
      if (isEscaped(candidate.text, token.index)) continue;
      if (token[1] === "begin") {
        depth += 1;
        continue;
      }
      depth -= 1;
      if (depth !== 0) continue;

      const suffix = candidate.text.slice(tokenPattern.lastIndex);
      if (suffix.trim() && !/^\s*%/.test(suffix)) return null;
      const contentFrom = line.from + (opener[1]?.length ?? 0);
      const contentTo = candidate.from + tokenPattern.lastIndex;
      return {
        closingIndex: candidateIndex,
        span: {
          from: line.from,
          to: candidate.to,
          contentFrom,
          content: markdown.slice(contentFrom, contentTo),
          kind: "block" as const,
          environment,
        },
      };
    }
  }
  return null;
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

    const environmentBlock = scanLatexEnvironmentBlock(markdown, lines, index);
    if (environmentBlock) {
      spans.push(environmentBlock.span);
      index = environmentBlock.closingIndex;
      continue;
    }

    const latexBlock = scanLatexBlockMath(lines, index);
    if (latexBlock) {
      spans.push(latexBlock.span);
      index = latexBlock.closingIndex;
      continue;
    }

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
            contentFrom: line.from + line.text.indexOf("$$") + 2,
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
        contentFrom: line.from + line.text.indexOf("$$") + 2,
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

function invalidMathHtml(source: string) {
  return `<span class="serein-math-error" title="Invalid LaTeX">${escapeHtml(source)}</span>`;
}

function subequationsParts(source: string) {
  const match = source.match(/^\\begin\s*\{subequations}([\s\S]*)\\end\s*\{subequations}$/);
  if (!match) return null;
  let body = match[1] ?? "";
  const labelMatch = body.match(/^\s*\\label\s*\{([^{}]+)}/);
  const label = labelMatch?.[1] ?? "";
  if (labelMatch) body = body.slice(labelMatch[0].length);
  return { body, label };
}

function preprocessSubequations(source: string) {
  const parts = subequationsParts(source);
  if (!parts) return source;
  return `\\sereinBeginSubequations{${parts.label}}${parts.body}\\sereinEndSubequations`;
}

function addSubequationsParentAnchor(html: string, span: MarkdownMathSpan) {
  if (span.environment !== "subequations") return html;
  const label = subequationsParts(span.content)?.label;
  if (!label) return html;
  const id = `mjx-eqn:${label}`;
  if (html.includes(`id="${escapeHtml(id)}"`)) return html;
  return html.replace("<mjx-container ", `<mjx-container id="${escapeHtml(id)}" `);
}

function mathSourceForRender(span: MarkdownMathSpan) {
  if (span.environment === "subequations") {
    return `\\[${preprocessSubequations(span.content)}\\]`;
  }
  if (span.environment) return span.content;
  return span.kind === "block"
    ? `\\[${span.content}\\]`
    : `\\(${span.content}\\)`;
}

const semanticMathAttributes = [
  "accent",
  "accentunder",
  "class",
  "columnalign",
  "columnspacing",
  "data-latex",
  "data-mjx-texclass",
  "display",
  "fence",
  "href",
  "id",
  "largeop",
  "linethickness",
  "mathvariant",
  "movablelimits",
  "notation",
  "open",
  "close",
  "rowspacing",
  "separators",
  "stretchy",
  "symmetric",
] as const;

function semanticMathNode(node: MmlNode): MathSemanticNode {
  const attributes: Record<string, string> = {};
  if (node.attributes) {
    for (const name of semanticMathAttributes) {
      const value = node.attributes.get(name);
      if (value !== undefined && value !== null && value !== "") {
        attributes[name] = String(value);
      }
    }
  }

  const kind = node.isInferred ? "mrow" : node.kind;
  const text = node.isToken
    ? node.childNodes.map((child) => {
      const textNode = child as MmlNode & { getText?: () => string };
      return typeof textNode.getText === "function" ? textNode.getText() : "";
    }).join("")
    : undefined;

  return {
    kind,
    ...(text !== undefined ? { text } : {}),
    attributes,
    children: node.childNodes.map(semanticMathNode),
  };
}

function mathSetupPlaceholder(macroDefinitions: string) {
  const definitions = macroDefinitions.trim();
  return definitions
    ? `<serein-math-setup style="display:none">\\(${escapeHtml(definitions)}\\)</serein-math-setup>`
    : "";
}

export function compileMathSpans(
  spans: MarkdownMathSpan[],
  options: MathCompilationOptions = {},
): CompiledMarkdownMathSpan[] {
  if (!spans.length) return [];

  const setup = options.macroDefinitions?.trim() ?? "";
  const placeholders = mathSetupPlaceholder(setup) + spans.map((span, index) => {
    const source = /\\begin\s*\{eqnarray\*?}/.test(span.content)
      ? "\\(\\text{Unsupported eqnarray}\\)"
      : mathSourceForRender(span);
    return `<serein-math-source data-index="${index}">${escapeHtml(source)}</serein-math-source>`;
  }).join("");

  const input = new TeX({
    packages: sereinTexPackages,
    tags: "serein-ams",
    maxBuffer: 32 * 1024,
    formatError: (_jax: unknown, error: Error) => {
      throw error;
    },
  });
  const document = mathjax.document(`<html><body>${placeholders}</body></html>`, {
    InputJax: input,
    OutputJax: mathSvgOutput,
  });
  document.render();

  const items = Array.from(document.math);
  const itemOffset = setup ? 1 : 0;
  return spans.map((span, index) => ({
    ...span,
    tree: /\\begin\s*\{eqnarray\*?}/.test(span.content)
      ? null
      : items[index + itemOffset]?.root
        ? semanticMathNode(items[index + itemOffset].root)
        : null,
  }));
}

function mathRenderSignature(spans: MarkdownMathSpan[], macroDefinitions: string) {
  return JSON.stringify([
    macroDefinitions,
    spans.map((span) => [span.kind, span.environment ?? "", span.content]),
  ]);
}

function cacheRenderedMath(signature: string, html: string[]) {
  renderedMathCache.delete(signature);
  renderedMathCache.set(signature, html);
  while (renderedMathCache.size > renderedMathCacheLimit) {
    const oldest = renderedMathCache.keys().next().value;
    if (typeof oldest !== "string") break;
    renderedMathCache.delete(oldest);
  }
}

export function renderMathSpans(
  spans: MarkdownMathSpan[],
  options: MathCompilationOptions = {},
): RenderedMarkdownMathSpan[] {
  if (!spans.length) return [];
  const setup = options.macroDefinitions?.trim() ?? "";
  const signature = mathRenderSignature(spans, setup);
  const cached = renderedMathCache.get(signature);
  if (cached) {
    return spans.map((span, index) => ({ ...span, html: cached[index] ?? invalidMathHtml(span.content) }));
  }

  const placeholders = mathSetupPlaceholder(setup) + spans.map((span, index) => {
    const source = /\\begin\s*\{eqnarray\*?}/.test(span.content)
      ? escapeHtml(span.content)
      : escapeHtml(mathSourceForRender(span));
    return `<serein-math-source data-index="${index}">${source}</serein-math-source>`;
  }).join("");

  const input = new TeX({
    packages: sereinTexPackages,
    tags: "serein-ams",
    maxBuffer: 32 * 1024,
    formatError: (_jax: unknown, error: Error) => {
      throw error;
    },
  });
  const document = mathjax.document(`<html><body>${placeholders}</body></html>`, {
    InputJax: input,
    OutputJax: mathSvgOutput,
  });
  document.render();

  const nodes = mathAdaptor.tags(mathAdaptor.body(document.document), "serein-math-source");
  const rendered = spans.map((span, index) => {
    const node = nodes.find((candidate) => mathAdaptor.getAttribute(candidate, "data-index") === String(index));
    const html = node ? mathAdaptor.innerHTML(node) : "";
    if (
      !html.includes("<mjx-container")
      || html.includes("data-mjx-error")
      || /\\begin\s*\{eqnarray\*?}/.test(span.content)
    ) {
      return invalidMathHtml(span.content);
    }
    return addSubequationsParentAnchor(html, span);
  });

  cacheRenderedMath(signature, rendered);
  return spans.map((span, index) => ({ ...span, html: rendered[index] ?? invalidMathHtml(span.content) }));
}

export function renderMarkdownMath(
  markdown: string,
  options: MathCompilationOptions = {},
) {
  const macroDefinitions = options.macroDefinitions
    ?? extractLatexMathMacroDefinitions(markdown);
  return renderMathSpans(scanMarkdownMath(markdown), { macroDefinitions });
}

export function renderMathToHtml(content: string, displayMode: boolean) {
  const source = content.trim();
  if (!source) return "";
  return renderMathSpans([{
    from: 0,
    to: source.length,
    contentFrom: 0,
    content: source,
    kind: displayMode ? "block" : "inline",
  }])[0]?.html ?? invalidMathHtml(source);
}
