import { normalizeImageSource } from "./markdownExport.js";

export type PdfExportOptions = {
  title: string;
  imageMap?: Record<string, string>;
};

type PdfTextBlock = {
  kind: "text";
  text: string;
  size: number;
  indent: number;
  gapBefore: number;
};

type PdfImageBlock = {
  kind: "image";
  image: PdfImage;
  alt: string;
  indent: number;
  gapBefore: number;
};

type PdfBlock = PdfTextBlock | PdfImageBlock;

type PdfImage = {
  source: string;
  objectName: string;
  objectId: number;
  width: number;
  height: number;
  bytes: Uint8Array;
};

const pageWidth = 595;
const pageHeight = 842;
const marginX = 54;
const marginTop = 58;
const marginBottom = 58;
const latinFontObjectId = 3;
const cjkFontObjectId = 4;
const imageObjectBaseId = 7;

export async function markdownToPdfBytes(markdown: string, options: PdfExportOptions) {
  const images = await preparePdfImages(options.imageMap ?? {});
  const blocks = markdownToPdfBlocks(markdown, options, images.bySource);
  const pages = paginateBlocks(blocks);
  return buildPdf(pages, images.items);
}

function markdownToPdfBlocks(markdown: string, options: PdfExportOptions, imagesBySource: Map<string, PdfImage>) {
  const sourceLines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: PdfBlock[] = [];
  let inFence = false;
  let fenceMarker = "";
  let inFrontmatter = sourceLines[0]?.trim() === "---";

  for (let index = 0; index < sourceLines.length; index += 1) {
    const rawLine = sourceLines[index] ?? "";
    const trimmed = rawLine.trim();

    if (inFrontmatter) {
      if (index > 0 && trimmed === "---") inFrontmatter = false;
      continue;
    }

    const fence = rawLine.match(/^\s{0,3}(```+|~~~+)/);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fence[1];
        pushGap(blocks, 6);
      } else if (rawLine.trim().startsWith(fenceMarker)) {
        inFence = false;
        fenceMarker = "";
        pushGap(blocks, 6);
      }
      continue;
    }

    if (inFence) {
      pushWrapped(blocks, rawLine || " ", 10, 16, 0);
      continue;
    }

    if (!trimmed) {
      pushGap(blocks, 8);
      continue;
    }

    const image = parseStandaloneImage(trimmed, imagesBySource);
    if (image) {
      blocks.push({ kind: "image", image: image.image, alt: image.alt, indent: 0, gapBefore: 8 });
      continue;
    }

    const heading = rawLine.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const level = heading[1].length;
      const size = [0, 21, 17, 14, 12.5, 11.5, 11][level] ?? 11;
      pushWrapped(blocks, cleanInlineText(heading[2]), size, 0, 10);
      continue;
    }

    if (/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(rawLine)) {
      continue;
    }

    const unordered = rawLine.match(/^\s{0,3}[-+*]\s+(.+)$/);
    if (unordered) {
      const task = unordered[1].match(/^\[([ xX])]\s+(.+)$/);
      const prefix = task ? (task[1].toLowerCase() === "x" ? "[x] " : "[ ] ") : "- ";
      pushWrapped(blocks, `${prefix}${cleanInlineText(task ? task[2] : unordered[1])}`, 11, 14, 2);
      continue;
    }

    const ordered = rawLine.match(/^\s{0,3}(\d+[.)])\s+(.+)$/);
    if (ordered) {
      pushWrapped(blocks, `${ordered[1]} ${cleanInlineText(ordered[2])}`, 11, 14, 2);
      continue;
    }

    const quote = rawLine.match(/^\s{0,3}>\s?(.*)$/);
    if (quote) {
      pushWrapped(blocks, `| ${cleanInlineText(quote[1])}`, 11, 14, 4);
      continue;
    }

    if (rawLine.includes("|")) {
      const cells = rawLine
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cleanInlineText(cell.trim()));
      pushWrapped(blocks, cells.join("  |  "), 10.5, 0, 2);
      continue;
    }

    pushWrapped(blocks, cleanInlineText(rawLine), 11, 0, 0);
  }

  if (!blocks.some((block) => block.kind === "image" || block.text.trim())) {
    pushWrapped(blocks, options.title || "Serein Export", 18, 0, 0);
  }

  return blocks;
}

function parseStandaloneImage(text: string, imagesBySource: Map<string, PdfImage>) {
  const match = text.match(/^!\[([^\]\n]*)]\(([^)\n]+)\)$/);
  if (!match) return null;

  const source = normalizeImageSource(match[2]);
  const image = imagesBySource.get(source);
  if (!image) return null;
  return { image, alt: match[1].trim() || source };
}

function cleanInlineText(value: string) {
  return value
    .replace(/!\[([^\]\n]*)]\(([^)\n]+)\)/g, (_match, alt: string, target: string) => {
      const source = normalizeImageSource(target);
      return `[Image: ${alt.trim() || source}]`;
    })
    .replace(/\[([^\]\n]+)]\(([^)\n]+)\)/g, "$1 ($2)")
    .replace(/\[\[([^\]\n|#]+)(?:#[^\]\n|]+)?(?:\|([^\]\n]+))?]]/g, (_match, target: string, alias?: string) => alias || target)
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/~~([^~\n]+)~~/g, "$1")
    .replace(/\$\$?([^$\n]+)\$\$?/g, "$1")
    .replace(/\[\^([^\]\n]+)]/g, "[$1]")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pushGap(blocks: PdfBlock[], gap: number) {
  if (!blocks.length) return;
  const last = blocks[blocks.length - 1];
  blocks[blocks.length - 1] = {
    ...last,
    gapBefore: Math.max(last.gapBefore, gap),
  };
}

function pushWrapped(blocks: PdfBlock[], text: string, size: number, indent: number, gapBefore: number) {
  const availableUnits = Math.max(8, (pageWidth - marginX * 2 - indent) / size);
  const wrapped = wrapText(text || " ", availableUnits);
  for (let index = 0; index < wrapped.length; index += 1) {
    blocks.push({
      kind: "text",
      text: wrapped[index],
      size,
      indent,
      gapBefore: index === 0 ? gapBefore : 0,
    });
  }
}

function wrapText(text: string, maxUnits: number) {
  const words = text.split(/(\s+)/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = `${current}${word}`;
    if (current && textUnits(candidate) > maxUnits) {
      lines.push(current.trimEnd());
      current = word.trimStart();
      continue;
    }

    if (!current && textUnits(word) > maxUnits) {
      const chunks = breakLongText(word, maxUnits);
      lines.push(...chunks.slice(0, -1));
      current = chunks[chunks.length - 1] ?? "";
      continue;
    }

    current = candidate;
  }

  if (current.trim()) lines.push(current.trimEnd());
  return lines.length ? lines : [""];
}

function breakLongText(text: string, maxUnits: number) {
  const chunks: string[] = [];
  let current = "";
  for (const char of text) {
    if (current && textUnits(`${current}${char}`) > maxUnits) {
      chunks.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function textUnits(text: string) {
  let units = 0;
  for (const char of text) {
    if (/\s/.test(char)) {
      units += 0.35;
    } else if (/[\x00-\x7F]/.test(char)) {
      units += 0.5;
    } else {
      units += 0.9;
    }
  }
  return units;
}

function paginateBlocks(blocks: PdfBlock[]) {
  const pages: PdfBlock[][] = [[]];
  let y = pageHeight - marginTop;

  for (const block of blocks) {
    const height = blockHeight(block);
    const nextY = y - block.gapBefore - height;
    if (nextY < marginBottom && pages[pages.length - 1].length) {
      pages.push([]);
      y = pageHeight - marginTop;
    }

    pages[pages.length - 1].push(block);
    y -= block.gapBefore + height;
  }

  return pages;
}

function blockHeight(block: PdfBlock) {
  if (block.kind === "text") return block.size * 1.38;
  return imageDisplaySize(block).height + 10;
}

function imageDisplaySize(block: PdfImageBlock) {
  const maxWidth = pageWidth - marginX * 2 - block.indent;
  const maxHeight = 260;
  const scale = Math.min(maxWidth / block.image.width, maxHeight / block.image.height, 1);
  return {
    width: Math.max(1, block.image.width * scale),
    height: Math.max(1, block.image.height * scale),
  };
}

async function preparePdfImages(imageMap: Record<string, string>) {
  const items: PdfImage[] = [];
  const bySource = new Map<string, PdfImage>();

  if (typeof document === "undefined") {
    return { items, bySource };
  }

  for (const [source, dataUrl] of Object.entries(imageMap)) {
    try {
      const image = await dataUrlToPdfImage(source, dataUrl, imageObjectBaseId + items.length, `Im${items.length}`);
      items.push(image);
      bySource.set(source, image);
    } catch (error) {
      console.warn("Failed to prepare PDF image", source, error);
    }
  }

  return { items, bySource };
}

async function dataUrlToPdfImage(source: string, dataUrl: string, objectId: number, objectName: string): Promise<PdfImage> {
  const image = await loadImage(dataUrl);
  const maxSourceEdge = 1600;
  const scale = Math.min(1, maxSourceEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable for image export.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return {
    source,
    objectName,
    objectId,
    width: canvas.width,
    height: canvas.height,
    bytes: decodeDataUrl(canvas.toDataURL("image/jpeg", 0.9)),
  };
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load PDF image."));
    image.src = source;
  });
}

function decodeDataUrl(dataUrl: string) {
  const base64 = dataUrl.split(",", 2)[1] ?? "";
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function buildPdf(pages: PdfBlock[][], images: PdfImage[]) {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let offset = 0;

  const push = (chunk: string | Uint8Array) => {
    const bytes = typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
    chunks.push(bytes);
    offset += bytes.length;
  };

  const startObject = (id: number) => {
    offsets[id] = offset;
    push(`${id} 0 obj\n`);
  };

  const pageObjectBaseId = imageObjectBaseId + images.length;

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  startObject(1);
  push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  startObject(2);
  const pageIds = pages.map((_, index) => pageObjectBaseId + index * 2);
  push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>\nendobj\n`);
  writeFontObjects(startObject, push);
  writeImageObjects(images, startObject, push);

  pages.forEach((pageBlocks, index) => {
    const pageId = pageObjectBaseId + index * 2;
    const contentId = pageId + 1;
    const content = pageContent(pageBlocks);

    startObject(pageId);
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${latinFontObjectId} 0 R /F2 ${cjkFontObjectId} 0 R >> ${imageResourceDictionary(images)} >> /Contents ${contentId} 0 R >>\nendobj\n`);
    startObject(contentId);
    push(`<< /Length ${new TextEncoder().encode(content).length} >>\nstream\n${content}endstream\nendobj\n`);
  });

  const xrefOffset = offset;
  push(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (let id = 1; id < offsets.length; id += 1) {
    push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const output = new Uint8Array(offset);
  let cursor = 0;
  for (const chunk of chunks) {
    output.set(chunk, cursor);
    cursor += chunk.length;
  }
  return Array.from(output);
}

function writeFontObjects(startObject: (id: number) => void, push: (chunk: string) => void) {
  startObject(latinFontObjectId);
  push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n");
  startObject(cjkFontObjectId);
  push("<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [5 0 R] >>\nendobj\n");
  startObject(5);
  push("<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 5 >> /FontDescriptor 6 0 R >>\nendobj\n");
  startObject(6);
  push("<< /Type /FontDescriptor /FontName /STSong-Light /Flags 6 /FontBBox [-260 -174 1043 826] /ItalicAngle 0 /Ascent 826 /Descent -174 /CapHeight 662 /StemV 78 >>\nendobj\n");
}

function writeImageObjects(images: PdfImage[], startObject: (id: number) => void, push: (chunk: string | Uint8Array) => void) {
  for (const image of images) {
    startObject(image.objectId);
    push(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`);
    push(image.bytes);
    push("\nendstream\nendobj\n");
  }
}

function imageResourceDictionary(images: PdfImage[]) {
  if (!images.length) return "";
  return `/XObject << ${images.map((image) => `/${image.objectName} ${image.objectId} 0 R`).join(" ")} >>`;
}

function pageContent(blocks: PdfBlock[]) {
  const commands: string[] = [];
  let y = pageHeight - marginTop;

  for (const block of blocks) {
    y -= block.gapBefore;
    if (block.kind === "image") {
      const size = imageDisplaySize(block);
      const x = marginX + block.indent;
      y -= size.height;
      commands.push(`q\n${size.width.toFixed(2)} 0 0 ${size.height.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm\n/${block.image.objectName} Do\nQ\n`);
      if (block.alt) {
        commands.push(`BT /F1 8 Tf 1 0 0 1 ${x.toFixed(2)} ${(y - 11).toFixed(2)} Tm (${pdfString(block.alt)}) Tj ET\n`);
        y -= 18;
      } else {
        y -= 10;
      }
      continue;
    }

    const x = marginX + block.indent;
    if (hasNonAscii(block.text)) {
      commands.push(`BT /F2 ${block.size.toFixed(2)} Tf 88 Tz 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm <${utf16Hex(block.text)}> Tj ET\n`);
    } else {
      commands.push(`BT /F1 ${block.size.toFixed(2)} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfString(block.text)}) Tj ET\n`);
    }
    y -= block.size * 1.38;
  }

  return commands.join("");
}

function hasNonAscii(text: string) {
  return /[^\x00-\x7F]/.test(text);
}

function pdfString(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function utf16Hex(text: string) {
  const bytes: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    bytes.push((code >> 8) & 0xff, code & 0xff);
  }
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}
