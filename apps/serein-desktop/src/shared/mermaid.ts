import {
  closingMarkdownFence,
  openingMarkdownFence,
} from "./markdown.js";

export type MermaidPalette = {
  background: string;
  surface: string;
  surfaceSoft: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  accentCool: string;
  fontFamily: string;
};

export type MermaidSourceBlock = {
  index: number;
  from: number;
  to: number;
  contentFrom: number;
  contentTo: number;
  source: string;
};

export type RenderedMermaidBlock = MermaidSourceBlock & {
  svg: string | null;
  imageDataUrl: string | null;
  error: string | null;
};

type MarkdownLine = {
  text: string;
  from: number;
  to: number;
};

let mermaidRenderId = 0;
let mermaidRenderQueue: Promise<void> = Promise.resolve();

const mermaidSvgBoundsPadding = 8;
const mermaidOversizedViewBoxRatio = 1.35;
const mermaidOversizedViewBoxAreaRatio = 1.75;

function markdownLines(markdown: string): MarkdownLine[] {
  let offset = 0;
  return markdown.split("\n").map((text) => {
    const line = { text, from: offset, to: offset + text.length };
    offset = line.to + 1;
    return line;
  });
}

function mermaidLanguage(info: string) {
  return info.trim().split(/\s+/, 1)[0]?.toLocaleLowerCase() === "mermaid";
}

function normalizedFenceContent(lines: MarkdownLine[], openerPrefix: string) {
  if (!openerPrefix) return lines.map((line) => line.text).join("\n");
  return lines.map((line) => (
    line.text.startsWith(openerPrefix)
      ? line.text.slice(openerPrefix.length)
      : line.text
  )).join("\n");
}

export function scanMarkdownMermaidBlocks(markdown: string): MermaidSourceBlock[] {
  const lines = markdownLines(markdown);
  const blocks: MermaidSourceBlock[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const opener = openingMarkdownFence(line.text);
    if (!opener) continue;

    let closeIndex = -1;
    for (let candidate = index + 1; candidate < lines.length; candidate += 1) {
      if (closingMarkdownFence(lines[candidate].text, opener)) {
        closeIndex = candidate;
        break;
      }
    }
    if (closeIndex < 0) continue;

    if (mermaidLanguage(opener.info)) {
      const contentLines = lines.slice(index + 1, closeIndex);
      const openerPrefix = line.text.slice(0, opener.prefixLength);
      blocks.push({
        index: blocks.length,
        from: line.from,
        to: lines[closeIndex].to,
        contentFrom: contentLines[0]?.from ?? line.to,
        contentTo: contentLines.length
          ? contentLines[contentLines.length - 1].to
          : line.to,
        source: normalizedFenceContent(contentLines, openerPrefix),
      });
    }

    index = closeIndex;
  }

  return blocks;
}

function cssVariable(styles: CSSStyleDeclaration, name: string, fallback: string) {
  return styles.getPropertyValue(name).trim() || fallback;
}

export function mermaidPaletteFromElement(element: Element | null): MermaidPalette {
  const styles = element ? window.getComputedStyle(element) : window.getComputedStyle(document.documentElement);
  return {
    background: cssVariable(styles, "--paper", "#ffffff"),
    surface: cssVariable(styles, "--paper", "#ffffff"),
    surfaceSoft: cssVariable(styles, "--paper-soft", "#f5f5f5"),
    text: cssVariable(styles, "--ink", "#1f2933"),
    muted: cssVariable(styles, "--muted", "#66737d"),
    border: cssVariable(styles, "--line", "#cbd5dc"),
    accent: cssVariable(styles, "--accent", "#d76550"),
    accentCool: cssVariable(styles, "--accent-cool", "#347f88"),
    fontFamily: cssVariable(styles, "--font-ui", "Segoe UI, sans-serif"),
  };
}

function readableMermaidError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/^Error:\s*/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 600) || "Mermaid syntax error.";
}

function queueMermaidRender<T>(action: () => Promise<T>) {
  const result = mermaidRenderQueue.then(action, action);
  mermaidRenderQueue = result.then(() => undefined, () => undefined);
  return result;
}

function finitePositive(value: number) {
  return Number.isFinite(value) && value > 0;
}

function svgNumber(value: number) {
  return Number(value.toFixed(3)).toString();
}

export function normalizeMermaidSvgElementBounds(
  svgElement: SVGSVGElement,
  padding = mermaidSvgBoundsPadding,
) {
  try {
    const bounds = svgElement.getBBox();
    if (
      !finitePositive(bounds.width)
      || !finitePositive(bounds.height)
      || !Number.isFinite(bounds.x)
      || !Number.isFinite(bounds.y)
    ) return false;

    const viewBox = svgElement.viewBox.baseVal;
    if (!finitePositive(viewBox.width) || !finitePositive(viewBox.height)) return false;

    const normalizedPadding = Math.max(0, padding);
    const contentWidth = bounds.width + normalizedPadding * 2;
    const contentHeight = bounds.height + normalizedPadding * 2;
    const widthRatio = viewBox.width / contentWidth;
    const heightRatio = viewBox.height / contentHeight;
    const areaRatio = widthRatio * heightRatio;
    const oversized = (
      widthRatio > mermaidOversizedViewBoxRatio
      || heightRatio > mermaidOversizedViewBoxRatio
    ) && areaRatio > mermaidOversizedViewBoxAreaRatio;
    if (!oversized) return false;

    svgElement.setAttribute("viewBox", [
      bounds.x - normalizedPadding,
      bounds.y - normalizedPadding,
      contentWidth,
      contentHeight,
    ].map(svgNumber).join(" "));
    svgElement.style.maxWidth = `${svgNumber(contentWidth)}px`;
    return true;
  } catch {
    return false;
  }
}

function normalizeMermaidSvgString(svg: string) {
  if (typeof document === "undefined" || !document.body) return svg;

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    width: "max-content",
    height: "max-content",
    overflow: "visible",
    opacity: "0",
    pointerEvents: "none",
  });
  host.innerHTML = svg;
  document.body.append(host);

  try {
    const svgElement = host.querySelector<SVGSVGElement>("svg");
    if (!svgElement || !normalizeMermaidSvgElementBounds(svgElement)) return svg;
    return svgElement.outerHTML;
  } finally {
    host.remove();
  }
}

export async function renderMermaidSvg(source: string, palette: MermaidPalette) {
  return queueMermaidRender(async () => {
    const mermaid = (await import("mermaid")).default;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      layout: "dagre",
      theme: "base",
      htmlLabels: true,
      flowchart: {
        useMaxWidth: true,
        nodeSpacing: 24,
        rankSpacing: 28,
        padding: 8,
        diagramPadding: 2,
      },
      fontFamily: palette.fontFamily,
      themeVariables: {
        background: palette.background,
        primaryColor: palette.surfaceSoft,
        primaryTextColor: palette.text,
        primaryBorderColor: palette.border,
        secondaryColor: palette.surface,
        secondaryTextColor: palette.text,
        secondaryBorderColor: palette.border,
        tertiaryColor: palette.surfaceSoft,
        tertiaryTextColor: palette.text,
        tertiaryBorderColor: palette.border,
        lineColor: palette.muted,
        textColor: palette.text,
        mainBkg: palette.surfaceSoft,
        nodeBorder: palette.border,
        clusterBkg: palette.surface,
        clusterBorder: palette.border,
        titleColor: palette.text,
        edgeLabelBackground: palette.background,
        actorBkg: palette.surfaceSoft,
        actorBorder: palette.border,
        actorTextColor: palette.text,
        actorLineColor: palette.muted,
        signalColor: palette.text,
        signalTextColor: palette.text,
        labelBoxBkgColor: palette.surface,
        labelBoxBorderColor: palette.border,
        labelTextColor: palette.text,
        loopTextColor: palette.text,
        noteBkgColor: palette.surfaceSoft,
        noteBorderColor: palette.accent,
        noteTextColor: palette.text,
        activationBkgColor: palette.surfaceSoft,
        activationBorderColor: palette.accentCool,
        sequenceNumberColor: palette.background,
      },
    });

    const id = `serein-mermaid-${Date.now().toString(36)}-${mermaidRenderId += 1}`;
    try {
      const { svg } = await mermaid.render(id, source);
      return normalizeMermaidSvgString(svg);
    } catch (error) {
      throw new Error(readableMermaidError(error));
    }
  });
}

export function mermaidSvgDataUrl(svg: string) {
  const bytes = new TextEncoder().encode(svg);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return `data:image/svg+xml;base64,${window.btoa(binary)}`;
}

export async function renderMarkdownMermaidBlocks(
  markdown: string,
  palette: MermaidPalette,
): Promise<RenderedMermaidBlock[]> {
  const rendered: RenderedMermaidBlock[] = [];
  for (const block of scanMarkdownMermaidBlocks(markdown)) {
    try {
      const svg = await renderMermaidSvg(block.source, palette);
      rendered.push({
        ...block,
        svg,
        imageDataUrl: mermaidSvgDataUrl(svg),
        error: null,
      });
    } catch (error) {
      rendered.push({
        ...block,
        svg: null,
        imageDataUrl: null,
        error: readableMermaidError(error),
      });
    }
  }
  return rendered;
}
