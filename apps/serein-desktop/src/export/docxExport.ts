import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  ImportedXmlComponent,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  SimpleField,
  Tab,
  TabStopType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type ParagraphChild,
} from "docx";
import {
  compileMathSpans,
  extractLatexMathMacroDefinitions,
  scanMarkdownMath,
  type CompiledMarkdownMathSpan,
  type MathSemanticNode,
} from "../shared/math.js";
import { isMarkdownTableDelimiterCell } from "../shared/markdown.js";
import {
  normalizeImageSource,
  type ExportImageMap,
} from "./markdownExport.js";
import {
  normalizeLatexDocumentForExport,
  parseLatexExportStructure,
} from "./latexDocument.js";

export type DocxExportOptions = {
  title: string;
  imageMap?: ExportImageMap;
};

type DocxBlock = Paragraph | Table;

type EquationReference = {
  bookmark: string;
  tag: string;
};

type EquationRow = {
  formulaCells: MathSemanticNode[];
  label: string | null;
  tag: string | null;
  tagDisplay: string | null;
  manualTag: boolean;
};

type EquationBlock = {
  alignments: Array<"left" | "center" | "right">;
  parentLabel: string | null;
  rows: EquationRow[];
};

type EquationCatalog = {
  blocks: Map<number, EquationBlock>;
  references: Map<string, EquationReference>;
};

type NumberingConfig = {
  reference: string;
  levels: Array<{
    level: number;
    format: typeof LevelFormat.BULLET | typeof LevelFormat.DECIMAL;
    text: string;
    alignment: typeof AlignmentType.LEFT;
    style: { paragraph: { indent: { left: number; hanging: number } } };
  }>;
};

type ExportBuildState = {
  equationCatalog: EquationCatalog;
  imageMap: ExportImageMap;
  numbering: NumberingConfig[];
  orderedListIndex: number;
  seenSubequationBases: Set<string>;
  nextBookmarkId: number;
};

const pageWidth = 11906;
const pageHeight = 16838;
const pageMargin = 1440;
const contentWidth = pageWidth - (pageMargin * 2);
const equationCenterTab = Math.round(contentWidth / 2);
const mathNamespace = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const bodyFont = {
  ascii: "Times New Roman",
  hAnsi: "Times New Roman",
  eastAsia: "SimSun",
  cs: "Times New Roman",
  hint: "eastAsia",
};
const headingFont = {
  ascii: "Times New Roman",
  hAnsi: "Times New Roman",
  eastAsia: "SimHei",
  cs: "Times New Roman",
  hint: "eastAsia",
};
const transparentPng = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
  0, 0, 0, 13, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 240, 31,
  0, 5, 0, 1, 255, 137, 153, 61, 29, 0, 0, 0, 0, 73, 69, 78, 68,
  174, 66, 96, 130,
]);

function importedElement(
  name: string,
  attributes?: Record<string, string>,
  children: Array<ImportedXmlComponent | string> = [],
) {
  const component = new ImportedXmlComponent(name, attributes);
  children.forEach((child) => component.push(child));
  return component;
}

function asParagraphChild(component: ImportedXmlComponent) {
  return component as unknown as ParagraphChild;
}

function semanticText(node: MathSemanticNode): string {
  if (node.text !== undefined) return node.text;
  return node.children.map(semanticText).join("");
}

function syntheticNode(
  kind: string,
  children: MathSemanticNode[],
  attributes: Record<string, string> = {},
): MathSemanticNode {
  return { kind, children, attributes };
}

function mathStyleProperties(variant: string | undefined) {
  if (!variant) return null;
  let script: string | null = null;
  let style: string | null = null;

  switch (variant) {
    case "normal": style = "p"; break;
    case "italic": style = "i"; break;
    case "bold": style = "b"; break;
    case "bold-italic": style = "bi"; break;
    case "sans-serif": script = "sans-serif"; style = "p"; break;
    case "bold-sans-serif": script = "sans-serif"; style = "b"; break;
    case "sans-serif-italic": script = "sans-serif"; style = "i"; break;
    case "sans-serif-bold-italic": script = "sans-serif"; style = "bi"; break;
    case "double-struck": script = "double-struck"; style = "p"; break;
    case "fraktur": script = "fraktur"; style = "p"; break;
    case "bold-fraktur": script = "fraktur"; style = "b"; break;
    case "script": script = "script"; style = "p"; break;
    case "bold-script": script = "script"; style = "b"; break;
    case "monospace": script = "monospace"; style = "p"; break;
    default: return null;
  }

  const children: ImportedXmlComponent[] = [];
  if (script) children.push(importedElement("m:scr", { "m:val": script }));
  if (style) children.push(importedElement("m:sty", { "m:val": style }));
  return importedElement("m:rPr", undefined, children);
}

function mathRun(text: string, variant?: string) {
  if (!text) return [];
  const children: Array<ImportedXmlComponent | string> = [];
  const properties = mathStyleProperties(variant);
  if (properties) children.push(properties);
  children.push(importedElement("m:t", { "xml:space": "preserve" }, [text]));
  return [importedElement("m:r", undefined, children)];
}

const naryOperators = new Set(["∑", "∏", "∐", "∫", "∬", "∭", "∮", "∯", "∰", "⋂", "⋃"]);
const openingFences = new Set(["(", "[", "{", "|", "‖", "⌈", "⌊", "⟨"]);
const closingFences = new Set([")", "]", "}", "|", "‖", "⌉", "⌋", "⟩", ""]);
const unambiguousOpeningFences = new Set(["(", "[", "{", "⌈", "⌊", "⟨"]);
const unambiguousClosingFences = new Set([")", "]", "}", "⌉", "⌋", "⟩"]);
const naryExpressionBreakOperators = new Set([
  "+", "-", "−", "=", "≠", "<", ">", "≤", "≥", "≈", "≃", "∼", "≡",
  "⇒", "⇔", "→", "←", ",", ";",
]);

function unwrapSingleChild(node: MathSemanticNode): MathSemanticNode {
  let current = node;
  while (
    ["math", "mrow", "mstyle", "semantics", "TeXAtom"].includes(current.kind)
    && current.children.length === 1
  ) {
    current = current.children[0];
  }
  return current;
}

function naryCharacter(node: MathSemanticNode | undefined) {
  if (!node) return null;
  const unwrapped = unwrapSingleChild(node);
  const character = semanticText(unwrapped);
  return naryOperators.has(character) ? character : null;
}

function naryParts(node: MathSemanticNode) {
  if (node.kind === "mo") {
    const character = semanticText(node);
    return naryOperators.has(character)
      ? { character, subScript: undefined, superScript: undefined, limitLocation: "subSup" as const }
      : null;
  }
  if (!["msub", "msup", "msubsup", "munder", "mover", "munderover"].includes(node.kind)) return null;
  const character = naryCharacter(node.children[0]);
  if (!character) return null;
  const underOver = node.kind === "munder" || node.kind === "mover" || node.kind === "munderover";
  return {
    character,
    subScript: node.kind === "msub" || node.kind === "msubsup" || node.kind === "munder" || node.kind === "munderover"
      ? node.children[1]
      : undefined,
    superScript: node.kind === "msup" || node.kind === "mover"
      ? node.children[1]
      : node.kind === "msubsup" || node.kind === "munderover"
        ? node.children[2]
        : undefined,
    limitLocation: underOver ? "undOvr" as const : "subSup" as const,
  };
}

function naryExpressionEnd(children: MathSemanticNode[], start: number) {
  let fenceDepth = 0;
  for (let index = start; index < children.length; index += 1) {
    const node = children[index];
    const operator = node.kind === "mo" ? semanticText(node) : "";
    if (index > start && fenceDepth === 0 && naryExpressionBreakOperators.has(operator)) return index;
    if (unambiguousOpeningFences.has(operator)) fenceDepth += 1;
    if (unambiguousClosingFences.has(operator)) fenceDepth = Math.max(0, fenceDepth - 1);
  }
  return children.length;
}

function ommlRowNodes(children: MathSemanticNode[], inheritedVariant?: string) {
  const components: ImportedXmlComponent[] = [];
  let index = 0;
  while (index < children.length) {
    const node = children[index];
    const parts = naryParts(node);
    if (parts && index + 1 < children.length) {
      const expressionEnd = naryExpressionEnd(children, index + 1);
      if (expressionEnd > index + 1) {
        components.push(ommlNary(
          parts.character,
          syntheticNode("mrow", children.slice(index + 1, expressionEnd)),
          parts.subScript,
          parts.superScript,
          parts.limitLocation,
          node.attributes.mathvariant || inheritedVariant,
        ));
        index = expressionEnd;
        continue;
      }
    }
    components.push(...ommlNodes(node, inheritedVariant));
    index += 1;
  }
  return components;
}

function ommlArgument(name: string, node: MathSemanticNode | undefined, inheritedVariant?: string) {
  return importedElement(name, undefined, node ? ommlNodes(node, inheritedVariant) : []);
}

function ommlNary(
  character: string,
  expression: MathSemanticNode | undefined,
  subScript: MathSemanticNode | undefined,
  superScript: MathSemanticNode | undefined,
  limitLocation: "subSup" | "undOvr",
  inheritedVariant?: string,
) {
  return importedElement("m:nary", undefined, [
    importedElement("m:naryPr", undefined, [
      importedElement("m:chr", { "m:val": character }),
      importedElement("m:limLoc", { "m:val": limitLocation }),
      importedElement("m:grow", { "m:val": "1" }),
      importedElement("m:subHide", { "m:val": subScript ? "0" : "1" }),
      importedElement("m:supHide", { "m:val": superScript ? "0" : "1" }),
    ]),
    ommlArgument("m:sub", subScript, inheritedVariant),
    ommlArgument("m:sup", superScript, inheritedVariant),
    ommlArgument("m:e", expression, inheritedVariant),
  ]);
}

function fencedRow(node: MathSemanticNode) {
  if (node.children.length < 2) return null;
  const first = node.children[0];
  const last = node.children[node.children.length - 1];
  if (first.kind !== "mo" || last.kind !== "mo") return null;
  const opening = semanticText(first);
  const closing = semanticText(last);
  const opens = openingFences.has(opening)
    || first.attributes.fence === "true"
    || first.attributes["data-mjx-texclass"] === "OPEN";
  const closes = closingFences.has(closing)
    || last.attributes.fence === "true"
    || last.attributes["data-mjx-texclass"] === "CLOSE";
  if (!opens || !closes) return null;
  return { opening, closing, children: node.children.slice(1, -1) };
}

function matrixAlignments(node: MathSemanticNode, columnCount: number) {
  const values = (node.attributes.columnalign ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((value) => value === "left" || value === "right" ? value : "center");
  return Array.from({ length: columnCount }, (_, index) => values[index] ?? "center");
}

function ommlMatrix(node: MathSemanticNode, inheritedVariant?: string) {
  const rows = node.children.filter((child) => child.kind === "mtr" || child.kind === "mlabeledtr");
  const cells = rows.map((row) => {
    const rowCells = row.children.filter((child) => child.kind === "mtd");
    return row.kind === "mlabeledtr" ? rowCells.slice(1) : rowCells;
  });
  const columnCount = Math.max(1, ...cells.map((row) => row.length));
  const alignments = matrixAlignments(node, columnCount);
  const columnProperties = alignments.map((alignment) => importedElement("m:mc", undefined, [
    importedElement("m:mcPr", undefined, [
      importedElement("m:count", { "m:val": "1" }),
      importedElement("m:mcJc", { "m:val": alignment }),
    ]),
  ]));

  return importedElement("m:m", undefined, [
    importedElement("m:mPr", undefined, [
      importedElement("m:baseJc", { "m:val": "center" }),
      importedElement("m:plcHide", { "m:val": "1" }),
      importedElement("m:mcs", undefined, columnProperties),
    ]),
    ...cells.map((row) => importedElement("m:mr", undefined, Array.from(
      { length: columnCount },
      (_, columnIndex) => ommlArgument("m:e", row[columnIndex], inheritedVariant),
    ))),
  ]);
}

function ommlAccent(
  base: MathSemanticNode | undefined,
  accent: MathSemanticNode | undefined,
  position: "top" | "bottom",
  inheritedVariant?: string,
) {
  const character = accent ? semanticText(accent) : "";
  if (["¯", "‾", "_"].includes(character)) {
    return importedElement("m:bar", undefined, [
      importedElement("m:barPr", undefined, [importedElement("m:pos", { "m:val": position })]),
      ommlArgument("m:e", base, inheritedVariant),
    ]);
  }
  if (["⏞", "⏟", "︷", "︸"].includes(character)) {
    return importedElement("m:groupChr", undefined, [
      importedElement("m:groupChrPr", undefined, [
        importedElement("m:chr", { "m:val": character }),
        importedElement("m:pos", { "m:val": position }),
        importedElement("m:vertJc", { "m:val": position === "top" ? "bot" : "top" }),
      ]),
      ommlArgument("m:e", base, inheritedVariant),
    ]);
  }
  return importedElement("m:acc", undefined, [
    importedElement("m:accPr", undefined, [importedElement("m:chr", { "m:val": character })]),
    ommlArgument("m:e", base, inheritedVariant),
  ]);
}

function ommlNodes(node: MathSemanticNode, inheritedVariant?: string): ImportedXmlComponent[] {
  const variant = node.attributes.mathvariant || inheritedVariant;
  switch (node.kind) {
    case "math":
    case "mstyle":
    case "semantics":
    case "TeXAtom":
    case "mpadded":
    case "maction":
      return ommlRowNodes(node.children, variant);
    case "mrow": {
      const fenced = fencedRow(node);
      if (fenced) {
        return [importedElement("m:d", undefined, [
          importedElement("m:dPr", undefined, [
            importedElement("m:begChr", { "m:val": fenced.opening }),
            importedElement("m:endChr", { "m:val": fenced.closing }),
          ]),
          importedElement("m:e", undefined, ommlRowNodes(fenced.children, variant)),
        ])];
      }
      return ommlRowNodes(node.children, variant);
    }
    case "mi":
      return mathRun(node.text ?? "", variant);
    case "mn":
    case "mo":
    case "mtext": {
      const text = node.text ?? "";
      if (node.kind === "mo" && naryOperators.has(text)) {
        return [ommlNary(text, undefined, undefined, undefined, "subSup", variant)];
      }
      return mathRun(text, node.kind === "mtext" ? "normal" : variant);
    }
    case "mspace":
      return mathRun(" ", "normal");
    case "mfrac":
      return [importedElement("m:f", undefined, [
        importedElement("m:fPr", undefined, [
          importedElement("m:type", { "m:val": node.attributes.linethickness === "0" ? "noBar" : "bar" }),
        ]),
        ommlArgument("m:num", node.children[0], variant),
        ommlArgument("m:den", node.children[1], variant),
      ])];
    case "msqrt":
      return [importedElement("m:rad", undefined, [
        importedElement("m:radPr", undefined, [importedElement("m:degHide", { "m:val": "1" })]),
        importedElement("m:deg"),
        ommlArgument("m:e", syntheticNode("mrow", node.children), variant),
      ])];
    case "mroot":
      return [importedElement("m:rad", undefined, [
        importedElement("m:radPr", undefined, [importedElement("m:degHide", { "m:val": "0" })]),
        ommlArgument("m:deg", node.children[1], variant),
        ommlArgument("m:e", node.children[0], variant),
      ])];
    case "msub": {
      const nary = naryCharacter(node.children[0]);
      if (nary) return [ommlNary(nary, undefined, node.children[1], undefined, "subSup", variant)];
      return [importedElement("m:sSub", undefined, [
        ommlArgument("m:e", node.children[0], variant),
        ommlArgument("m:sub", node.children[1], variant),
      ])];
    }
    case "msup": {
      const nary = naryCharacter(node.children[0]);
      if (nary) return [ommlNary(nary, undefined, undefined, node.children[1], "subSup", variant)];
      return [importedElement("m:sSup", undefined, [
        ommlArgument("m:e", node.children[0], variant),
        ommlArgument("m:sup", node.children[1], variant),
      ])];
    }
    case "msubsup": {
      const nary = naryCharacter(node.children[0]);
      if (nary) return [ommlNary(nary, undefined, node.children[1], node.children[2], "subSup", variant)];
      return [importedElement("m:sSubSup", undefined, [
        ommlArgument("m:e", node.children[0], variant),
        ommlArgument("m:sub", node.children[1], variant),
        ommlArgument("m:sup", node.children[2], variant),
      ])];
    }
    case "munder": {
      const nary = naryCharacter(node.children[0]);
      if (nary) return [ommlNary(nary, undefined, node.children[1], undefined, "undOvr", variant)];
      if (node.attributes.accentunder === "true") {
        return [ommlAccent(node.children[0], node.children[1], "bottom", variant)];
      }
      return [importedElement("m:limLow", undefined, [
        ommlArgument("m:e", node.children[0], variant),
        ommlArgument("m:lim", node.children[1], variant),
      ])];
    }
    case "mover": {
      const nary = naryCharacter(node.children[0]);
      if (nary) return [ommlNary(nary, undefined, undefined, node.children[1], "undOvr", variant)];
      if (node.attributes.accent === "true") {
        return [ommlAccent(node.children[0], node.children[1], "top", variant)];
      }
      return [importedElement("m:limUpp", undefined, [
        ommlArgument("m:e", node.children[0], variant),
        ommlArgument("m:lim", node.children[1], variant),
      ])];
    }
    case "munderover": {
      const nary = naryCharacter(node.children[0]);
      if (nary) return [ommlNary(nary, undefined, node.children[1], node.children[2], "undOvr", variant)];
      const lower = importedElement("m:limLow", undefined, [
        ommlArgument("m:e", node.children[0], variant),
        ommlArgument("m:lim", node.children[1], variant),
      ]);
      return [importedElement("m:limUpp", undefined, [
        importedElement("m:e", undefined, [lower]),
        ommlArgument("m:lim", node.children[2], variant),
      ])];
    }
    case "mfenced":
      return [importedElement("m:d", undefined, [
        importedElement("m:dPr", undefined, [
          importedElement("m:begChr", { "m:val": node.attributes.open ?? "(" }),
          importedElement("m:endChr", { "m:val": node.attributes.close ?? ")" }),
          ...(node.attributes.separators
            ? [importedElement("m:sepChr", { "m:val": node.attributes.separators })]
            : []),
        ]),
        importedElement("m:e", undefined, ommlRowNodes(node.children, variant)),
      ])];
    case "mtable":
      return [ommlMatrix(node, variant)];
    case "mtd":
      return ommlRowNodes(node.children, variant);
    case "menclose":
      if ((node.attributes.notation ?? "").split(/\s+/).includes("box")) {
        return [importedElement("m:borderBox", undefined, [
          importedElement("m:borderBoxPr"),
          ommlArgument("m:e", syntheticNode("mrow", node.children), variant),
        ])];
      }
      return node.children.flatMap((child) => ommlNodes(child, variant));
    case "mphantom":
      return [importedElement("m:phant", undefined, [
        importedElement("m:phantPr"),
        ommlArgument("m:e", syntheticNode("mrow", node.children), variant),
      ])];
    case "merror":
      return mathRun(semanticText(node), "normal");
    default:
      return node.text !== undefined
        ? mathRun(node.text, variant)
        : ommlRowNodes(node.children, variant);
  }
}

function containsSemanticKind(node: MathSemanticNode, kind: string): boolean {
  return node.kind === kind || node.children.some((child) => containsSemanticKind(child, kind));
}

function createInlineMath(tree: MathSemanticNode) {
  return asParagraphChild(importedElement("m:oMath", undefined, ommlNodes(tree)));
}

function createDisplayMath(tree: MathSemanticNode) {
  const math = importedElement("m:oMath", undefined, ommlNodes(tree));
  return asParagraphChild(importedElement("m:oMathPara", undefined, [
    importedElement("m:oMathParaPr", undefined, [importedElement("m:jc", { "m:val": "center" })]),
    math,
  ]));
}

function sourceLabels(source: string) {
  const labels = new Set<string>();
  const pattern = /\\label\s*\{([^{}]+)}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) labels.add(match[1].trim());
  return labels;
}

function manualTags(source: string) {
  const tags = new Set<string>();
  const pattern = /\\tag\*?\s*\{([^{}]+)}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) tags.add(match[1].trim());
  return tags;
}

function subequationsParentLabel(span: CompiledMarkdownMathSpan) {
  if (span.environment !== "subequations") return null;
  const match = span.content.match(/^\\begin\s*\{subequations}([\s\S]*)\\end\s*\{subequations}$/);
  if (!match) return null;
  return match[1].match(/^\s*\\label\s*\{([^{}]+)}/)?.[1]?.trim() ?? null;
}

function bookmarkName(label: string) {
  let hash = 2166136261;
  for (let index = 0; index < label.length; index += 1) {
    hash ^= label.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const safe = label.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 20) || "equation";
  return `SereinEq_${safe}_${(hash >>> 0).toString(16)}`.slice(0, 40);
}

function bookmarkChildren(
  name: string,
  children: ParagraphChild[],
  state: ExportBuildState,
): ParagraphChild[] {
  const id = String(state.nextBookmarkId++);
  return [
    asParagraphChild(importedElement("w:bookmarkStart", { "w:id": id, "w:name": name })),
    ...children,
    asParagraphChild(importedElement("w:bookmarkEnd", { "w:id": id })),
  ];
}

function normalizeTagDisplay(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
    return { tag: trimmed.slice(1, -1), display: trimmed };
  }
  return { tag: trimmed, display: trimmed };
}

function topMathTable(tree: MathSemanticNode | null) {
  if (!tree) return null;
  const unwrapped = unwrapSingleChild(tree);
  return unwrapped.kind === "mtable" ? unwrapped : null;
}

function equationBlockForSpan(span: CompiledMarkdownMathSpan): EquationBlock | null {
  const table = topMathTable(span.tree);
  if (!table || !table.children.some((row) => row.kind === "mlabeledtr")) return null;
  const labels = sourceLabels(span.content);
  const tags = manualTags(span.content);
  const rows: EquationRow[] = table.children
    .filter((row) => row.kind === "mtr" || row.kind === "mlabeledtr")
    .map((row) => {
      const cells = row.children.filter((child) => child.kind === "mtd");
      const labelCell = row.kind === "mlabeledtr" ? cells[0] : null;
      const formulaCells = row.kind === "mlabeledtr" ? cells.slice(1) : cells;
      const rawDisplay = labelCell ? semanticText(labelCell) : "";
      const normalized = rawDisplay ? normalizeTagDisplay(rawDisplay) : null;
      const rawId = labelCell?.attributes.id?.replace(/^mjx-eqn:/, "") ?? "";
      const decodedId = rawId ? decodeURIComponent(rawId) : "";
      const label = decodedId && labels.has(decodedId) ? decodedId : null;
      return {
        formulaCells: formulaCells.map((cell) => syntheticNode("mrow", cell.children)),
        label,
        tag: normalized?.tag ?? null,
        tagDisplay: normalized?.display ?? null,
        manualTag: normalized ? tags.has(normalized.tag) : false,
      };
    });
  const alignments = matrixAlignments(table, Math.max(1, ...rows.map((row) => row.formulaCells.length)));
  return { alignments, parentLabel: subequationsParentLabel(span), rows };
}

function buildEquationCatalog(spans: CompiledMarkdownMathSpan[]): EquationCatalog {
  const blocks = new Map<number, EquationBlock>();
  const references = new Map<string, EquationReference>();

  spans.forEach((span, index) => {
    const block = equationBlockForSpan(span);
    if (!block) return;
    blocks.set(index, block);
    for (const row of block.rows) {
      if (row.label && row.tag) {
        references.set(row.label, { bookmark: bookmarkName(row.label), tag: row.tag });
      }
    }
    if (block.parentLabel) {
      const firstSubequation = block.rows.find((row) => /^\d+[a-z]+$/i.test(row.tag ?? ""));
      const base = firstSubequation?.tag?.match(/^(\d+)/)?.[1];
      if (base) {
        references.set(block.parentLabel, {
          bookmark: bookmarkName(block.parentLabel),
          tag: base,
        });
      }
    }
  });

  return { blocks, references };
}

function protectMath(markdown: string, spans: CompiledMarkdownMathSpan[]) {
  let protectedMarkdown = markdown;
  for (let index = spans.length - 1; index >= 0; index -= 1) {
    const span = spans[index];
    protectedMarkdown = `${protectedMarkdown.slice(0, span.from)}\u0000SEREIN_DOCX_MATH_${index}\u0000${protectedMarkdown.slice(span.to)}`;
  }
  return protectedMarkdown;
}

function mathTokenIndex(value: string) {
  const match = value.match(/^\u0000SEREIN_DOCX_MATH_(\d+)\u0000$/);
  return match ? Number(match[1]) : null;
}

function referenceChildren(span: CompiledMarkdownMathSpan, catalog: EquationCatalog): ParagraphChild[] | null {
  const match = span.content.match(/^\\(eqref|ref)\s*\{([^{}]+)}/);
  if (!match) return null;
  const reference = catalog.references.get(match[2].trim());
  if (!reference) return [new TextRun(span.content)];
  const field = new SimpleField(`REF ${reference.bookmark} \\h`, reference.tag);
  return match[1] === "eqref"
    ? [new TextRun("("), field, new TextRun(")")]
    : [field];
}

function mathChildren(span: CompiledMarkdownMathSpan, catalog: EquationCatalog) {
  const reference = referenceChildren(span, catalog);
  if (reference) return reference;
  if (!span.tree || containsSemanticKind(span.tree, "merror")) {
    return [new TextRun({ text: span.content, font: "Courier New" })];
  }
  return [createInlineMath(span.tree)];
}

function decodeBase64(value: string) {
  const binary = globalThis.atob(value.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function imageDimensions(type: string, bytes: Uint8Array, sourceText = "") {
  if (type === "png" && bytes.length >= 24) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (type === "gif" && bytes.length >= 10) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  if (type === "jpg") {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (marker >= 0xc0 && marker <= 0xc3 && offset + 8 < bytes.length) {
        return {
          height: (bytes[offset + 5] << 8) | bytes[offset + 6],
          width: (bytes[offset + 7] << 8) | bytes[offset + 8],
        };
      }
      if (length < 2) break;
      offset += length + 2;
    }
  }
  if (type === "svg") {
    const viewBox = sourceText.match(/viewBox=["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)["']/i);
    if (viewBox) return { width: Number(viewBox[1]), height: Number(viewBox[2]) };
    const width = sourceText.match(/\bwidth=["']([\d.]+)/i)?.[1];
    const height = sourceText.match(/\bheight=["']([\d.]+)/i)?.[1];
    if (width && height) return { width: Number(width), height: Number(height) };
  }
  return { width: 640, height: 360 };
}

function fittedImageSize(width: number, height: number) {
  const safeWidth = Math.max(1, width || 640);
  const safeHeight = Math.max(1, height || 360);
  const scale = Math.min(1, 520 / safeWidth, 360 / safeHeight);
  return { width: Math.round(safeWidth * scale), height: Math.round(safeHeight * scale) };
}

function imageRun(source: string, alt: string, imageMap: ExportImageMap) {
  const dataUrl = imageMap[source];
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:image\/(png|jpe?g|gif|bmp|svg\+xml);(base64)?,([\s\S]*)$/i);
  if (!match) return null;
  const rawType = match[1].toLowerCase();
  const type = rawType === "jpeg" ? "jpg" : rawType === "svg+xml" ? "svg" : rawType;
  const decodedText = match[2]
    ? ""
    : decodeURIComponent(match[3]);
  const bytes = match[2]
    ? decodeBase64(match[3])
    : new TextEncoder().encode(decodedText);
  const dimensions = fittedImageSize(...Object.values(imageDimensions(type, bytes, decodedText)) as [number, number]);
  const altText = { title: alt || source, description: alt || source, name: alt || source };

  if (type === "svg") {
    return new ImageRun({
      type: "svg",
      data: bytes,
      transformation: dimensions,
      altText,
      fallback: { type: "png", data: transparentPng },
    });
  }
  if (type === "png" || type === "jpg" || type === "gif" || type === "bmp") {
    return new ImageRun({ type, data: bytes, transformation: dimensions, altText });
  }
  return null;
}

function plainRun(text: string, options: { bold?: boolean; italics?: boolean; strike?: boolean; code?: boolean } = {}) {
  return new TextRun({
    text,
    bold: options.bold,
    italics: options.italics,
    strike: options.strike,
    font: options.code ? "Courier New" : undefined,
    shading: options.code ? { type: ShadingType.CLEAR, fill: "F2F2F2" } : undefined,
  });
}

function inlineChildren(
  text: string,
  spans: CompiledMarkdownMathSpan[],
  state: ExportBuildState,
  forceBold = false,
): ParagraphChild[] {
  const children: ParagraphChild[] = [];
  const pattern = /\u0000SEREIN_DOCX_MATH_(\d+)\u0000|!\[([^\]\n]*)]\(([^)\n]+)\)|\[([^\]\n]+)]\(([^)\n]+)\)|`([^`\n]+)`|\*\*([^*\n]+)\*\*|~~([^~\n]+)~~|\*([^*\n]+)\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) children.push(plainRun(text.slice(lastIndex, match.index), { bold: forceBold }));
    if (match[1] !== undefined) {
      const span = spans[Number(match[1])];
      if (span) children.push(...mathChildren(span, state.equationCatalog));
    } else if (match[2] !== undefined && match[3] !== undefined) {
      const source = normalizeImageSource(match[3]);
      const image = imageRun(source, match[2].trim(), state.imageMap);
      children.push(image ?? plainRun(`[Image: ${match[2].trim() || source}]`, { bold: forceBold }));
    } else if (match[4] !== undefined && match[5] !== undefined) {
      children.push(new ExternalHyperlink({
        link: match[5].trim(),
        children: [new TextRun({ text: match[4], style: "Hyperlink", bold: forceBold })],
      }));
    } else if (match[6] !== undefined) {
      children.push(plainRun(match[6], { bold: forceBold, code: true }));
    } else if (match[7] !== undefined) {
      children.push(plainRun(match[7], { bold: true }));
    } else if (match[8] !== undefined) {
      children.push(plainRun(match[8], { bold: forceBold, strike: true }));
    } else if (match[9] !== undefined) {
      children.push(plainRun(match[9], { bold: forceBold, italics: true }));
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) children.push(plainRun(text.slice(lastIndex), { bold: forceBold }));
  return children.length ? children : [plainRun("")];
}

function splitTableRow(line: string) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function isTableRow(line: string) {
  return line.includes("|") && !/^\s{0,3}(```|~~~)/.test(line);
}

function isTableStart(lines: string[], index: number) {
  const cells = splitTableRow(lines[index + 1] ?? "");
  return isTableRow(lines[index] ?? "") && cells.length >= 2 && cells.every(isMarkdownTableDelimiterCell);
}

function tableAlignment(cell: string) {
  if (cell.startsWith(":") && cell.endsWith(":")) return AlignmentType.CENTER;
  if (cell.endsWith(":")) return AlignmentType.RIGHT;
  return AlignmentType.LEFT;
}

function markdownTable(
  rows: string[][],
  delimiters: string[],
  spans: CompiledMarkdownMathSpan[],
  state: ExportBuildState,
) {
  const columnCount = Math.max(delimiters.length, ...rows.map((row) => row.length));
  const baseWidth = Math.floor(contentWidth / columnCount);
  const widths = Array.from({ length: columnCount }, (_, index) => (
    index === columnCount - 1 ? contentWidth - (baseWidth * (columnCount - 1)) : baseWidth
  ));
  const border = { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" };
  const borders = { top: border, bottom: border, left: border, right: border };
  return new Table({
    width: { size: contentWidth, type: WidthType.DXA },
    columnWidths: widths,
    rows: rows.map((row, rowIndex) => new TableRow({
      tableHeader: rowIndex === 0,
      children: widths.map((width, columnIndex) => new TableCell({
        width: { size: width, type: WidthType.DXA },
        borders,
        shading: rowIndex === 0 ? { type: ShadingType.CLEAR, fill: "EDEDED" } : undefined,
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
          alignment: tableAlignment(delimiters[columnIndex] ?? ""),
          children: inlineChildren(row[columnIndex] ?? "", spans, state, rowIndex === 0),
        })],
      })),
    })),
  });
}

function equationNumberChildren(row: EquationRow, block: EquationBlock, state: ExportBuildState) {
  if (!row.tag || !row.tagDisplay) return [];
  const displayHasParentheses = row.tagDisplay.startsWith("(") && row.tagDisplay.endsWith(")");
  const subequation = row.tag.match(/^(\d+)([a-z]+)$/i);
  let core: ParagraphChild[];
  let isFirstSubequation = false;

  if (!row.manualTag && /^\d+$/.test(row.tag)) {
    core = [new SimpleField("SEQ Equation \\* ARABIC", row.tag)];
  } else if (!row.manualTag && subequation) {
    const [, base, suffix] = subequation;
    isFirstSubequation = !state.seenSubequationBases.has(base);
    state.seenSubequationBases.add(base);
    let baseChild: ParagraphChild = new SimpleField(
      isFirstSubequation ? "SEQ Equation \\* ARABIC" : "SEQ Equation \\c \\* ARABIC",
      base,
    );
    if (isFirstSubequation && block.parentLabel) {
      const parentReference = state.equationCatalog.references.get(block.parentLabel);
      if (parentReference) {
        core = [
          ...bookmarkChildren(parentReference.bookmark, [baseChild], state),
          new TextRun(suffix),
        ];
      } else {
        core = [baseChild, new TextRun(suffix)];
      }
    } else {
      core = [baseChild, new TextRun(suffix)];
    }
  } else {
    core = [new TextRun(row.tag)];
  }

  if (row.label) {
    const reference = state.equationCatalog.references.get(row.label);
    if (reference) core = bookmarkChildren(reference.bookmark, core, state);
  }

  return displayHasParentheses
    ? [new TextRun("("), ...core, new TextRun(")")]
    : core;
}

function equationParagraphs(block: EquationBlock, state: ExportBuildState) {
  return block.rows.map((row) => {
    const numberChildren = equationNumberChildren(row, block, state);
    const formulaTree = syntheticNode(
      "mrow",
      row.formulaCells.flatMap((cell) => cell.children),
    );
    return new Paragraph({
      tabStops: [
        { type: TabStopType.CENTER, position: equationCenterTab },
        { type: TabStopType.RIGHT, position: contentWidth },
      ],
      spacing: { before: 80, after: 80 },
      children: [
        new TextRun({ children: [new Tab()] }),
        createInlineMath(formulaTree),
        ...(numberChildren.length
          ? [new TextRun({ children: [new Tab()] }), ...numberChildren]
          : []),
      ],
    });
  });
}

function blockMath(
  index: number,
  span: CompiledMarkdownMathSpan,
  state: ExportBuildState,
): DocxBlock[] {
  const equationBlock = state.equationCatalog.blocks.get(index);
  if (equationBlock) return equationParagraphs(equationBlock, state);
  if (!span.tree || containsSemanticKind(span.tree, "merror")) {
    return [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: span.content, font: "Courier New" })],
    })];
  }
  return [new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 120 },
    children: [createDisplayMath(span.tree)],
  })];
}

function isBlockStarter(lines: string[], index: number) {
  const line = lines[index] ?? "";
  return mathTokenIndex(line.trim()) !== null
    || parseLatexExportStructure(line) !== null
    || /^\s{0,3}#{1,6}\s+/.test(line)
    || /^\s{0,3}(```|~~~)/.test(line)
    || /^\s{0,3}>\s?/.test(line)
    || /^\s{0,3}[-+*]\s+/.test(line)
    || /^\s{0,3}\d+[.)]\s+/.test(line)
    || /^\s{0,3}\[\^[^\]]+]:/.test(line)
    || isTableStart(lines, index);
}

function markdownBlocks(
  markdown: string,
  spans: CompiledMarkdownMathSpan[],
  state: ExportBuildState,
) {
  const lines = protectMath(markdown, spans).split("\n");
  const blocks: DocxBlock[] = [];
  let index = 0;
  let inFrontmatter = lines[0]?.trim() === "---";

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (inFrontmatter) {
      if (index > 0 && trimmed === "---") inFrontmatter = false;
      index += 1;
      continue;
    }
    if (!trimmed) {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s{0,3}(```+|~~~+)\s*([^\s`]*)?.*$/);
    if (fence) {
      const marker = fence[1];
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").trim().startsWith(marker)) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(...(code.length ? code : [""]).map((codeLine) => new Paragraph({
        spacing: { before: 0, after: 0 },
        shading: { type: ShadingType.CLEAR, fill: "F5F5F5" },
        children: [new TextRun({ text: codeLine || " ", font: "Courier New", size: 20 })],
      })));
      continue;
    }

    const blockMathIndex = mathTokenIndex(trimmed);
    if (blockMathIndex !== null && spans[blockMathIndex]?.kind === "block") {
      blocks.push(...blockMath(blockMathIndex, spans[blockMathIndex], state));
      index += 1;
      continue;
    }

    const latexStructure = parseLatexExportStructure(line);
    if (latexStructure) {
      if (latexStructure.kind === "title") {
        blocks.push(new Paragraph({
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 180 },
          children: inlineChildren(latexStructure.content, spans, state),
        }));
      } else {
        blocks.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: latexStructure.kind === "date" ? 240 : 60 },
          children: inlineChildren(latexStructure.content, spans, state),
        }));
      }
      index += 1;
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const levels = [
        HeadingLevel.HEADING_1,
        HeadingLevel.HEADING_2,
        HeadingLevel.HEADING_3,
        HeadingLevel.HEADING_4,
        HeadingLevel.HEADING_5,
        HeadingLevel.HEADING_6,
      ];
      blocks.push(new Paragraph({
        heading: levels[heading[1].length - 1],
        children: inlineChildren(heading[2], spans, state),
      }));
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const rows = [splitTableRow(lines[index])];
      const delimiters = splitTableRow(lines[index + 1]);
      index += 2;
      while (index < lines.length && isTableRow(lines[index])) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      blocks.push(markdownTable(rows, delimiters, spans, state));
      continue;
    }

    if (/^\s{0,3}>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s{0,3}>\s?/.test(lines[index] ?? "")) {
        quote.push((lines[index] ?? "").replace(/^\s{0,3}>\s?/, ""));
        index += 1;
      }
      blocks.push(new Paragraph({
        indent: { left: 480 },
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: "A6A6A6", space: 8 } },
        children: inlineChildren(quote.join(" "), spans, state),
      }));
      continue;
    }

    if (/^\s{0,3}[-+*]\s+/.test(line)) {
      while (index < lines.length && /^\s{0,3}[-+*]\s+/.test(lines[index] ?? "")) {
        const item = (lines[index] ?? "").replace(/^\s{0,3}[-+*]\s+/, "");
        const task = item.match(/^\[([ xX])]\s+(.*)$/);
        blocks.push(new Paragraph({
          numbering: { reference: "serein-bullets", level: 0 },
          children: inlineChildren(task ? `[${task[1].toLowerCase() === "x" ? "x" : " "}] ${task[2]}` : item, spans, state),
        }));
        index += 1;
      }
      continue;
    }

    if (/^\s{0,3}\d+[.)]\s+/.test(line)) {
      const reference = `serein-numbered-${state.orderedListIndex++}`;
      state.numbering.push({
        reference,
        levels: [{
          level: 0,
          format: LevelFormat.DECIMAL,
          text: "%1.",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      });
      while (index < lines.length && /^\s{0,3}\d+[.)]\s+/.test(lines[index] ?? "")) {
        const item = (lines[index] ?? "").replace(/^\s{0,3}\d+[.)]\s+/, "");
        blocks.push(new Paragraph({
          numbering: { reference, level: 0 },
          children: inlineChildren(item, spans, state),
        }));
        index += 1;
      }
      continue;
    }

    const footnote = line.match(/^\s{0,3}\[\^([^\]]+)]:\s*(.*)$/);
    if (footnote) {
      blocks.push(new Paragraph({
        spacing: { before: 120, after: 60 },
        children: [new TextRun({ text: `[${footnote[1]}] `, bold: true }), ...inlineChildren(footnote[2], spans, state)],
      }));
      index += 1;
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && (lines[index] ?? "").trim()) {
      if (paragraph.length && isBlockStarter(lines, index)) break;
      paragraph.push(lines[index] ?? "");
      index += 1;
    }
    blocks.push(new Paragraph({
      spacing: { after: 120, line: 300 },
      children: inlineChildren(paragraph.join(" "), spans, state),
    }));
  }

  return blocks;
}

export async function markdownToDocxBytes(markdown: string, options: DocxExportOptions) {
  const macroDefinitions = extractLatexMathMacroDefinitions(markdown);
  const normalizedMarkdown = normalizeLatexDocumentForExport(markdown);
  const spans = compileMathSpans(scanMarkdownMath(normalizedMarkdown), { macroDefinitions });
  const equationCatalog = buildEquationCatalog(spans);
  const state: ExportBuildState = {
    equationCatalog,
    imageMap: options.imageMap ?? {},
    numbering: [{
      reference: "serein-bullets",
      levels: [{
        level: 0,
        format: LevelFormat.BULLET,
        text: "•",
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    }],
    orderedListIndex: 0,
    seenSubequationBases: new Set<string>(),
    nextBookmarkId: 1,
  };
  const children = markdownBlocks(normalizedMarkdown, spans, state);
  if (!children.length) {
    children.push(new Paragraph({ children: [new TextRun(options.title || "Serein Export")] }));
  }

  const document = new Document({
    title: options.title,
    creator: "Serein",
    description: "Exported from Serein as editable Word content with native OMML equations.",
    features: { updateFields: true },
    styles: {
      default: {
        document: { run: { font: bodyFont, size: 24 } },
        title: {
          run: { font: headingFont, size: 44, bold: true },
          paragraph: { spacing: { before: 120, after: 180 } },
        },
        heading1: {
          run: { font: headingFont, size: 32, bold: true },
          paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 0 },
        },
        heading2: {
          run: { font: headingFont, size: 28, bold: true },
          paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 1 },
        },
        heading3: {
          run: { font: headingFont, size: 24, bold: true },
          paragraph: { spacing: { before: 160, after: 100 }, outlineLevel: 2 },
        },
      },
    },
    numbering: { config: state.numbering },
    sections: [{
      properties: {
        page: {
          size: { width: pageWidth, height: pageHeight },
          margin: { top: pageMargin, right: pageMargin, bottom: pageMargin, left: pageMargin },
        },
      },
      children,
    }],
  });
  document.Settings.addChildElement(importedElement("m:mathPr", undefined, [
    importedElement("m:mathFont", { "m:val": "Cambria Math" }),
    importedElement("m:brkBin", { "m:val": "before" }),
    importedElement("m:brkBinSub", { "m:val": "--" }),
    importedElement("m:smallFrac", { "m:val": "0" }),
    importedElement("m:dispDef"),
    importedElement("m:defJc", { "m:val": "centerGroup" }),
    importedElement("m:intLim", { "m:val": "subSup" }),
    importedElement("m:naryLim", { "m:val": "undOvr" }),
  ]));
  const arrayBuffer = await Packer.toArrayBuffer(document);
  return Array.from(new Uint8Array(arrayBuffer));
}

export const docxMathNamespace = mathNamespace;
