import { useEffect, useMemo, useRef, useState } from "react";
import { defaultKeymap, history, historyKeymap, indentWithTab, redo, undo } from "@codemirror/commands";
import { markdown as markdownSupport, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { languages as codeBlockLanguageData } from "@codemirror/language-data";
import { tags } from "@lezer/highlight";
import {
  Annotation,
  Compartment,
  EditorSelection,
  EditorState,
  Facet,
  Prec,
  StateField,
  Transaction,
  type Extension,
  type Range,
  type TransactionSpec,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import type { EditorMode } from "../app/types";
import type { AppLanguage, appText } from "../app/i18n";
import type { EditorCommandSignal, Note } from "../domain/model";
import {
  analyzeTextBufferMarkdown,
  deleteTextBufferTableColumn,
  deleteTextBufferTableRow,
  insertTextBufferTableColumn,
  insertTextBufferTableRow,
  isTextBufferCodeBlockBlank,
  isTextBufferCodeBlockEmpty,
  isTextBufferCodeBlockPhysicalLastLine,
  moveTextBufferTableColumn,
  moveTextBufferTableRow,
  normalizeTextBufferCodeBlockSelectionText,
  normalizeTextBufferTable,
  scanTextBufferInlineLinks,
  scanTextBufferTables,
  serializeTextBufferTable,
  setTextBufferTableAlignment,
  shouldExitTextBufferCodeBlockOnEnter,
  stripTextBufferContainerPrefix,
  textBufferTableCompletionFromPipeRow,
  textBufferCodeBlockLineState,
  textBufferCodeBlockContentRange,
  textBufferCodeBlockReplacementText,
  textBufferSafeCutRanges,
  textBufferSmartSelectAllRange,
  textBufferVisibleClipboardRanges,
  type TextBufferCodeBlock,
  type TextBufferInlineLink,
  type TextBufferTableBlock,
  type TextBufferTableData,
} from "../editor/textBufferMarkdown";
import { textBufferPasteTransaction } from "../editor/textBufferTransactions";
import {
  composeMarkdownWithFrontmatter,
  createYamlFrontmatter,
  openingMarkdownFence,
  resolveMarkdownHeading,
  setYamlPropertyValue,
  splitYamlFrontmatter,
  splitYamlPropertyValue,
  yamlListValueFromInput,
  type MarkdownHeadingTarget,
} from "../shared/markdown";
import {
  hasDesktopClipboardRuntime,
  readDesktopClipboardText,
  writeDesktopClipboardText,
} from "../services/clipboard";
import type { WikiLinkSuggestion } from "./editorTypes";
import {
  extractLatexMathMacroDefinitions,
  renderMathSpans,
  scanMarkdownMath,
  type MarkdownMathSpan,
} from "../shared/math";

type TextBundle = (typeof appText)[AppLanguage];

type MarkdownTextBufferEditorProps = {
  t: TextBundle;
  activeNote: Note;
  editorMode: EditorMode;
  command: EditorCommandSignal | null;
  onCommandResult?: (result: { command: EditorCommandSignal; handled: boolean }) => void;
  onChange: (markdown: string) => void;
  onOpenLink: (href: string) => boolean;
  wikiLinkSuggestions: WikiLinkSuggestion[];
  onCreateWikiLink: (target: string) => Promise<string | null>;
  onImportImages: (files: File[]) => Promise<Array<{ src: string; alt: string }>>;
  imagePreviewMap: Record<string, string>;
  showImageSourceOnFocus: boolean;
  normalizeWindowsImagePaths: boolean;
  showFrontmatterTagRow: boolean;
};

const externalMarkdownUpdate = Annotation.define<boolean>();
const richFenceMutation = Annotation.define<boolean>();
const confirmTypedFence = Annotation.define<number>();

type TextBufferDecorationOptions = {
  mode: EditorMode;
  imagePreviewMap: Record<string, string>;
  showImageSourceOnFocus: boolean;
  showFrontmatterTagRow: boolean;
};

const defaultTextBufferDecorationOptions: TextBufferDecorationOptions = {
  mode: "rich",
  imagePreviewMap: {},
  showImageSourceOnFocus: false,
  showFrontmatterTagRow: false,
};

const textBufferDecorationOptions = Facet.define<
  TextBufferDecorationOptions,
  TextBufferDecorationOptions
>({
  combine: (values) => values.length
    ? values[values.length - 1]
    : defaultTextBufferDecorationOptions,
});

const typedPendingFenceLines = StateField.define<readonly number[]>({
  create: () => [],
  update(value, transaction) {
    const normalized = new Set<number>();
    value.forEach((position) => {
      const mapped = transaction.changes.mapPos(position, -1);
      const line = transaction.state.doc.lineAt(Math.max(0, Math.min(mapped, transaction.state.doc.length)));
      if (openingMarkdownFence(line.text)) normalized.add(line.from);
    });

    const confirmed = transaction.annotation(confirmTypedFence);
    if (confirmed !== undefined) {
      normalized.delete(transaction.changes.mapPos(confirmed, -1));
    }

    let insertedFenceMarker = false;
    transaction.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
      if (/^[`~]+$/.test(inserted.toString())) insertedFenceMarker = true;
    });
    if (
      transaction.docChanged
      && insertedFenceMarker
      && transaction.state.facet(textBufferDecorationOptions).mode === "rich"
      && !transaction.annotation(externalMarkdownUpdate)
      && !transaction.annotation(richFenceMutation)
    ) {
      const head = transaction.state.selection.main.head;
      const line = transaction.state.doc.lineAt(head);
      if (openingMarkdownFence(line.text)) normalized.add(line.from);
    }

    return [...normalized].sort((left, right) => left - right);
  },
});

function analyzeTextBufferState(state: EditorState) {
  const pendingFenceLines = new Set(state.field(typedPendingFenceLines, false) ?? []);
  return analyzeTextBufferMarkdown(state.doc.toString(), undefined, {
    pendingFenceLines,
  });
}

type WikiLinkSource = {
  from: number;
  to: number;
  target: string;
  label: string;
};

const preferredCodeLanguages = [
  "bash",
  "javascript",
  "typescript",
  "python",
  "json",
  "markdown",
  "rust",
  "css",
  "html",
  "yaml",
  "toml",
];

const codeLanguageCandidateNames = [
  ...preferredCodeLanguages,
  ...codeBlockLanguageData.flatMap((language) => [language.name, ...(language.alias ?? [])]),
];
const seenCodeLanguageCandidates = new Set<string>();
const codeLanguageCandidates = codeLanguageCandidateNames.filter((language) => {
  const key = language.toLocaleLowerCase();
  if (seenCodeLanguageCandidates.has(key)) return false;
  seenCodeLanguageCandidates.add(key);
  return true;
}).sort((left, right) => {
  const leftPreferred = preferredCodeLanguages.indexOf(left.toLocaleLowerCase());
  const rightPreferred = preferredCodeLanguages.indexOf(right.toLocaleLowerCase());
  if (leftPreferred >= 0 || rightPreferred >= 0) {
    if (leftPreferred < 0) return 1;
    if (rightPreferred < 0) return -1;
    return leftPreferred - rightPreferred;
  }
  return left.localeCompare(right, undefined, { sensitivity: "base" });
});

function matchingCodeLanguageCandidates(value: string) {
  const query = value.trim().toLocaleLowerCase();
  if (!query) return codeLanguageCandidates.slice(0, 48);
  return codeLanguageCandidates
    .filter((language) => language.toLocaleLowerCase().includes(query))
    .slice(0, 48);
}

const textBufferCodeHighlightStyle = HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword, tags.modifier, tags.atom], color: "color-mix(in srgb, var(--accent-cool) 82%, #2456a8)" },
  { tag: [tags.string, tags.special(tags.string)], color: "color-mix(in srgb, #2f8f68 86%, var(--ink))" },
  { tag: [tags.number, tags.bool], color: "color-mix(in srgb, #8b5fbd 82%, var(--ink))" },
  { tag: [tags.comment, tags.meta], color: "color-mix(in srgb, var(--muted) 84%, transparent)", fontStyle: "italic" },
  { tag: [tags.variableName, tags.propertyName], color: "color-mix(in srgb, #9b5f2e 78%, var(--ink))" },
  { tag: [tags.typeName, tags.className, tags.namespace, tags.macroName], color: "color-mix(in srgb, #287f9f 80%, var(--ink))" },
  { tag: [tags.punctuation, tags.operator], color: "color-mix(in srgb, var(--muted) 72%, var(--ink))" },
  { tag: tags.invalid, color: "var(--accent)", textDecoration: "underline wavy" },
]);

type TyporaDecorationState = {
  decorations: DecorationSet;
  atomicRanges: DecorationSet;
};

type TyporaDocumentAnalysis = ReturnType<typeof analyzeTyporaDocument>;
type TyporaDocumentDecorationFieldState = TyporaDecorationState & {
  document: TyporaDocumentAnalysis;
  options: TextBufferDecorationOptions;
};

type TyporaActiveDecorationFieldState = TyporaDecorationState & {
  options: TextBufferDecorationOptions;
};

class SortedDecorationBuilder {
  private readonly ranges: Range<Decoration>[] = [];
  private readonly atomic: Range<Decoration>[] = [];

  add(from: number, to: number, decoration: Decoration) {
    this.ranges.push(decoration.range(from, to));
  }

  addAtomic(from: number, to: number, decoration: Decoration) {
    const range = decoration.range(from, to);
    this.ranges.push(range);
    this.atomic.push(range);
  }

  finish(): TyporaDecorationState {
    return {
      decorations: Decoration.set(this.ranges, true),
      atomicRanges: Decoration.set(this.atomic, true),
    };
  }
}

function markdownImageText(src: string, alt: string) {
  const cleanAlt = alt.replace(/[\]\n\r]/g, " ").trim() || "image";
  const cleanSrc = /[\s\\()]/.test(src) ? `<${src}>` : src;
  return `![${cleanAlt}](${cleanSrc})`;
}

function addMark(
  builder: SortedDecorationBuilder,
  from: number,
  to: number,
  className: string,
) {
  if (to <= from) return;
  builder.add(from, to, Decoration.mark({ class: className }));
}

function addSyntaxOrHide(
  builder: SortedDecorationBuilder,
  from: number,
  to: number,
  mode: EditorMode,
) {
  if (to <= from) return;
  if (mode === "rich") {
    builder.addAtomic(from, to, Decoration.replace({}));
    return;
  }
  addMark(builder, from, to, "serein-buffer-md-syntax");
}

function selectionTouchesRange(state: EditorState, from: number, to: number) {
  return state.selection.ranges.some((range) => {
    if (range.empty) return range.from >= from && range.from <= to;
    return range.from < to && range.to > from;
  });
}

function normalizeMarkdownImageSource(source: string) {
  const value = source.trim();
  if (value.startsWith("<")) {
    const end = value.indexOf(">");
    return (end >= 0 ? value.slice(1, end) : value.slice(1)).trim();
  }
  return value.split(/\s+(?=["'])/)[0]?.trim() ?? "";
}

function localImagePreview(imagePreviewMap: Record<string, string>, source: string) {
  const withoutDot = source.replace(/^\.\//, "");
  return imagePreviewMap[source]
    ?? imagePreviewMap[withoutDot]
    ?? imagePreviewMap[`./${withoutDot}`];
}

function wikiLinkParts(raw: string) {
  const [targetPart, aliasPart] = raw.split("|", 2);
  const target = targetPart.trim();
  const label = aliasPart?.trim() || target.split("#", 1)[0].trim() || target;
  return { target, label };
}

function scanWikiLinks(text: string, lineFrom = 0): WikiLinkSource[] {
  const links: WikiLinkSource[] = [];
  const regex = /!?\[\[([^\]\n]+)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const { target, label } = wikiLinkParts(match[1]);
    if (!target) continue;
    links.push({
      from: lineFrom + match.index,
      to: lineFrom + match.index + match[0].length,
      target,
      label,
    });
  }
  return links;
}

function wikiLinkHref(target: string) {
  return `serein-wiki:${encodeURIComponent(target)}`;
}

function rangeInside(ranges: Array<{ from: number; to: number }>, from: number, to: number) {
  return ranges.some((range) => from >= range.from && to <= range.to);
}

function addDelimitedInlineMarks(
  builder: SortedDecorationBuilder,
  state: EditorState,
  lineFrom: number,
  text: string,
  regex: RegExp,
  delimiterLength: number,
  className: string,
  options: TextBufferDecorationOptions,
) {
  regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const from = lineFrom + match.index;
    const to = from + match[0].length;
    const contentFrom = from + delimiterLength;
    const contentTo = to - delimiterLength;
    const active = selectionTouchesRange(state, from, to);
    if (options.mode === "rich" && !active) {
      addSyntaxOrHide(builder, from, contentFrom, "rich");
      addMark(builder, contentFrom, contentTo, className);
      addSyntaxOrHide(builder, contentTo, to, "rich");
    } else {
      addMark(builder, from, contentFrom, "serein-buffer-md-syntax");
      addMark(builder, contentFrom, contentTo, className);
      addMark(builder, contentTo, to, "serein-buffer-md-syntax");
    }
    if (match[0].length === 0) regex.lastIndex += 1;
  }
}

function stopEditorEvent(event: Event) {
  event.stopPropagation();
}

function codeBlockContainerStyle(block: TextBufferCodeBlock) {
  return {
    indent: Math.min(144, block.containerIndentLevel * 24),
    quoted: block.containerQuoteDepth > 0,
  };
}

function applyCodeBlockContainerStyle(element: HTMLElement, block: TextBufferCodeBlock) {
  const container = codeBlockContainerStyle(block);
  element.style.setProperty("--serein-code-container-indent", `${container.indent}px`);
  if (container.quoted) element.dataset.codeQuoted = "true";
}

function codeBlockLineAttributes(block: TextBufferCodeBlock) {
  const container = codeBlockContainerStyle(block);
  return {
    style: `--serein-code-container-indent: ${container.indent}px`,
    ...(container.quoted ? { "data-code-quoted": "true" } : {}),
  };
}

function textBufferScrollerForElement(element: HTMLElement) {
  let node: HTMLElement | null = element.parentElement;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null;
}

function textBufferSelectionVisible(view: EditorView, scroller: HTMLElement | null) {
  if (!scroller) return true;
  try {
    const coords = view.coordsAtPos(view.state.selection.main.head);
    if (!coords) return true;
    const viewport = scroller === document.scrollingElement
      ? { top: 0, bottom: window.innerHeight }
      : scroller.getBoundingClientRect();
    return coords.bottom >= viewport.top + 2 && coords.top <= viewport.bottom - 2;
  } catch {
    return true;
  }
}

function centerTextBufferSelection(view: EditorView, scroller: HTMLElement | null) {
  if (!scroller) return;
  try {
    const coords = view.coordsAtPos(view.state.selection.main.head);
    if (!coords) return;
    const viewport = scroller === document.scrollingElement
      ? { top: 0, height: window.innerHeight }
      : scroller.getBoundingClientRect();
    const cursorCenter = (coords.top + coords.bottom) / 2;
    const viewportCenter = viewport.top + viewport.height / 2;
    scroller.scrollTop += cursorCenter - viewportCenter;
  } catch {
    // History can briefly point at a remapped position while decorations settle.
  }
}

const textBufferHistoryScrollJobs = new WeakMap<EditorView, { frames: number[]; timers: number[] }>();
const pendingTextBufferCodeBlockTopLines = new WeakMap<EditorView, {
  from: number;
  replacement: string;
  originalPrefix: string;
  restoreSelection: number;
}>();
const emptySemanticSelectAllStages = new WeakMap<EditorView, { state: EditorState; position: number }>();

function clearTextBufferHistoryScrollJob(view: EditorView) {
  const job = textBufferHistoryScrollJobs.get(view);
  if (!job) return;
  job.frames.forEach((frame) => window.cancelAnimationFrame(frame));
  job.timers.forEach((timer) => window.clearTimeout(timer));
  textBufferHistoryScrollJobs.delete(view);
}

function runTextBufferHistoryWithEditorScroll(view: EditorView, runHistory: () => boolean) {
  const scroller = textBufferScrollerForElement(view.dom);
  const scrollTopBefore = scroller?.scrollTop ?? 0;

  const stabilizeSelectionScroll = () => {
    if (!scroller) return;
    scroller.scrollTop = scrollTopBefore;
    if (textBufferSelectionVisible(view, scroller)) return;
    centerTextBufferSelection(view, scroller);
  };

  clearTextBufferHistoryScrollJob(view);
  const handled = runHistory();
  if (!handled) return false;

  stabilizeSelectionScroll();

  const frames: number[] = [];
  const timers: number[] = [];
  const scheduleFrame = (callback: () => void) => {
    const frame = window.requestAnimationFrame(callback);
    frames.push(frame);
  };
  const scheduleTimer = (delay: number) => {
    const timer = window.setTimeout(stabilizeSelectionScroll, delay);
    timers.push(timer);
  };

  scheduleFrame(() => {
    stabilizeSelectionScroll();
    scheduleFrame(stabilizeSelectionScroll);
  });
  scheduleTimer(50);
  scheduleTimer(120);
  textBufferHistoryScrollJobs.set(view, { frames, timers });
  return true;
}

function undoTextBuffer(view: EditorView) {
  return runTextBufferHistoryWithEditorScroll(view, () => undo(view));
}

function redoTextBuffer(view: EditorView) {
  return runTextBufferHistoryWithEditorScroll(view, () => redo(view));
}

function updateCodeBlockLanguage(view: EditorView, block: TextBufferCodeBlock, language: string) {
  const currentBlock = currentCodeBlockByOpener(view, block.openerFrom);
  if (!currentBlock) return null;
  const cleanLanguage = language.trim();
  if (cleanLanguage === currentBlock.language.trim()) return currentBlock;
  view.dispatch({
    changes: {
      from: currentBlock.languageFrom,
      to: currentBlock.languageTo,
      insert: cleanLanguage,
    },
    annotations: richFenceMutation.of(true),
    userEvent: "input.type",
  });
  return currentCodeBlockByOpener(view, currentBlock.openerFrom);
}

function exitCodeBlockAfter(view: EditorView, block: TextBufferCodeBlock) {
  const closeLine = view.state.doc.lineAt(Math.min(block.closerFrom, view.state.doc.length));
  if (closeLine.to < view.state.doc.length) {
    view.dispatch({ selection: { anchor: Math.min(closeLine.to + 1, view.state.doc.length) } });
    view.focus();
    return true;
  }

  view.dispatch({
    changes: { from: view.state.doc.length, insert: "\n" },
    selection: { anchor: view.state.doc.length + 1 },
    annotations: richFenceMutation.of(true),
  });
  view.focus();
  return true;
}

function textBufferContainerContinuationPrefix(prefix: string) {
  let cursor = 0;
  let continuation = "";
  let hasListMarker = false;

  while (cursor < prefix.length) {
    const source = prefix.slice(cursor);
    const blockquote = source.match(/^( {0,3}>\s?)/);
    if (blockquote) {
      continuation += blockquote[1];
      cursor += blockquote[1].length;
      continue;
    }

    const list = source.match(/^( {0,3}(?:[-*+]|\d+[.)])\s+)/);
    if (list) {
      continuation += " ".repeat(list[1].length);
      cursor += list[1].length;
      hasListMarker = true;
      continue;
    }

    continuation += source;
    break;
  }

  return hasListMarker ? continuation : prefix;
}

function insertTextBufferCodeBlockTopLine(view: EditorView, block: TextBufferCodeBlock) {
  const originalPrefix = block.containerPrefix;
  const continuationPrefix = textBufferContainerContinuationPrefix(originalPrefix);
  const replacement = `${originalPrefix}\n${continuationPrefix}`;
  const restoreSelection = block.openerFrom > 0
    ? block.openerFrom - 1
    : block.contentFrom + originalPrefix.length;

  view.dispatch({
    changes: {
      from: block.openerFrom,
      to: block.openerMarkerFrom,
      insert: replacement,
    },
    selection: { anchor: block.openerFrom + originalPrefix.length },
    annotations: richFenceMutation.of(true),
    userEvent: "input.type",
  });
  pendingTextBufferCodeBlockTopLines.set(view, {
    from: block.openerFrom,
    replacement,
    originalPrefix,
    restoreSelection,
  });
  view.focus();
  return true;
}

function removePendingTextBufferCodeBlockTopLine(view: EditorView) {
  const pending = pendingTextBufferCodeBlockTopLines.get(view);
  if (!pending) return false;

  const selection = view.state.selection.main;
  const blankLineEnd = pending.from + pending.originalPrefix.length;
  const replacementTo = pending.from + pending.replacement.length;
  if (
    !selection.empty
    || selection.head < pending.from
    || selection.head > blankLineEnd
    || view.state.sliceDoc(pending.from, replacementTo) !== pending.replacement
  ) {
    pendingTextBufferCodeBlockTopLines.delete(view);
    return false;
  }

  view.dispatch({
    changes: {
      from: pending.from,
      to: replacementTo,
      insert: pending.originalPrefix,
    },
    selection: {
      anchor: Math.max(0, Math.min(pending.restoreSelection, view.state.doc.length - pending.replacement.length + pending.originalPrefix.length)),
    },
    annotations: richFenceMutation.of(true),
    userEvent: "delete.backward",
  });
  pendingTextBufferCodeBlockTopLines.delete(view);
  view.focus();
  return true;
}

function codeBlockContextAtPosition(state: EditorState, pos: number) {
  const analysis = analyzeTextBufferState(state);
  const line = analysis.lines.find((item) => pos >= item.from && pos <= item.to);
  const block = analysis.codeBlocks.find((candidate) => pos >= candidate.from && pos <= candidate.to);
  if (!line || !block) return null;
  return block ? { analysis, block, line } : null;
}

function currentCodeBlockByOpener(view: EditorView, openerFrom: number) {
  const analysis = analyzeTextBufferState(view.state);
  return analysis.codeBlocks.find((block) => block.openerFrom === openerFrom) ?? null;
}

function codeBlockForSelection(
  state: EditorState,
  range: { from: number; to: number },
  analysis = analyzeTextBufferState(state),
) {
  return analysis.codeBlocks.find((block) => (
    !isTextBufferCodeBlockEmpty(block)
    && range.from >= block.contentFrom
    && range.to <= block.contentTo
  )) ?? null;
}

function mapInsertedPosition(
  position: number,
  fromB: number,
  toB: number,
  originalText: string,
  replacementText: string,
  block: TextBufferCodeBlock,
) {
  if (position <= fromB) return position;
  if (position >= toB) return position + replacementText.length - originalText.length;
  const insertedOffset = position - fromB;
  return fromB + textBufferCodeBlockReplacementText(originalText.slice(0, insertedOffset), block).length;
}

function mapNestedCodeBlockTransaction(
  transaction: Transaction,
  analysis: ReturnType<typeof analyzeTextBufferMarkdown>,
): TransactionSpec | null {
  if (transaction.effects.length) return null;

  const changes: Array<{
    fromA: number;
    toA: number;
    fromB: number;
    toB: number;
    text: string;
  }> = [];
  transaction.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
    changes.push({ fromA, toA, fromB, toB, text: inserted.toString() });
  }, true);
  if (changes.length !== 1) return null;

  const change = changes[0];
  const block = analysis.codeBlocks.find((candidate) => (
    candidate.containerPrefix
    && !isTextBufferCodeBlockEmpty(candidate)
    && change.fromA >= candidate.contentFrom
    && change.toA <= candidate.contentTo
  ));
  if (!block) return null;

  const replacementText = textBufferCodeBlockReplacementText(change.text, block);
  if (replacementText === change.text) return null;

  const selection = EditorSelection.create(
    transaction.newSelection.ranges.map((range) => EditorSelection.range(
      mapInsertedPosition(range.anchor, change.fromB, change.toB, change.text, replacementText, block),
      mapInsertedPosition(range.head, change.fromB, change.toB, change.text, replacementText, block),
    )),
    transaction.newSelection.mainIndex,
  );
  const annotations = [];
  const userEvent = transaction.annotation(Transaction.userEvent);
  const addToHistory = transaction.annotation(Transaction.addToHistory);
  if (userEvent) annotations.push(Transaction.userEvent.of(userEvent));
  if (addToHistory !== undefined) annotations.push(Transaction.addToHistory.of(addToHistory));

  return {
    changes: {
      from: change.fromA,
      to: change.toA,
      insert: replacementText,
    },
    selection,
    annotations,
    scrollIntoView: transaction.scrollIntoView,
    filter: false,
  };
}

function focusLanguageControl(view: EditorView, block: TextBufferCodeBlock) {
  const input = view.dom.querySelector<HTMLInputElement>(`.serein-buffer-code-language[data-code-block-id="${block.id}"]`);
  if (!input) return false;
  input.focus({ preventScroll: true });
  input.select();
  return true;
}

function materializeEmptyCodeBlock(view: EditorView, block: TextBufferCodeBlock, initialText = "") {
  if (!isTextBufferCodeBlockEmpty(block)) return false;
  const content = textBufferCodeBlockReplacementText(initialText, block);
  const insert = `${block.containerPrefix}${content}\n`;
  view.dispatch({
    changes: { from: block.closerFrom, insert },
    selection: { anchor: block.closerFrom + block.containerPrefix.length + content.length },
    annotations: richFenceMutation.of(true),
    userEvent: "input.type",
  });
  view.focus();
  return true;
}

function emptyCodeBlockInputHandler() {
  return EditorView.inputHandler.of((view, from, to, text) => {
    if (from !== to) return false;
    const context = codeBlockContextAtPosition(view.state, from);
    if (!context || !isTextBufferCodeBlockEmpty(context.block)) return false;
    return materializeEmptyCodeBlock(view, context.block, text);
  });
}

function closingFenceLengthInCodeContent(text: string, fenceChar: "`" | "~", minLength: number) {
  const source = stripTextBufferContainerPrefix(text);
  const escaped = fenceChar === "`" ? "`" : "~";
  const match = source.match(new RegExp(`^ {0,3}(${escaped}{${minLength},})[ \\t]*$`));
  return match ? match[1].length : 0;
}

function markerEndInLine(lineText: string, fenceChar: "`" | "~", fenceLength: number) {
  const index = lineText.indexOf(fenceChar.repeat(fenceLength));
  return index < 0 ? -1 : index + fenceLength;
}

function extendActiveCodeFenceForLiteralFence(
  transaction: Transaction,
  analysis: ReturnType<typeof analyzeTextBufferMarkdown>,
): TransactionSpec | null {
  const head = transaction.startState.selection.main.head;
  const activeLine = analysis.lines.find((line) => head >= line.from && head <= line.to);
  if (!activeLine || activeLine.kind !== "code" || activeLine.codeBlockId === undefined) return null;

  const block = analysis.codeBlocks.find((item) => item.id === activeLine.codeBlockId);
  if (!block) return null;

  const nextDoc = transaction.newDoc;
  const openerLine = nextDoc.lineAt(transaction.changes.mapPos(block.openerFrom, -1));
  const closerLine = nextDoc.lineAt(transaction.changes.mapPos(block.closerFrom, 1));
  if (closerLine.number <= openerLine.number + 1) return null;

  let requiredFenceLength = block.fenceLength;
  for (let lineNumber = openerLine.number + 1; lineNumber < closerLine.number; lineNumber += 1) {
    const candidateLength = closingFenceLengthInCodeContent(nextDoc.line(lineNumber).text, block.fenceChar, block.fenceLength);
    if (candidateLength >= requiredFenceLength) requiredFenceLength = candidateLength + 1;
  }

  if (requiredFenceLength <= block.fenceLength) return null;

  const startCloseLine = transaction.startState.doc.lineAt(block.closerFrom);
  const closeMarkerEnd = markerEndInLine(startCloseLine.text, block.fenceChar, block.fenceLength);
  if (closeMarkerEnd < 0) return null;

  const extraFence = block.fenceChar.repeat(requiredFenceLength - block.fenceLength);
  return {
    changes: [
      { from: transaction.changes.mapPos(block.openerMarkerTo, 1), insert: extraFence },
      { from: transaction.changes.mapPos(startCloseLine.from + closeMarkerEnd, 1), insert: extraFence },
    ],
    sequential: true,
    annotations: richFenceMutation.of(true),
  };
}

function changeTouchesLine(from: number, to: number, lineFrom: number, lineTo: number) {
  if (from === to) return from >= lineFrom && from <= lineTo;
  return from <= lineTo && to >= lineFrom;
}

function protectRichCodeFenceLines() {
  return EditorState.transactionFilter.of((transaction) => {
    if (!transaction.docChanged) return transaction;
    if (
      transaction.annotation(externalMarkdownUpdate)
      || transaction.annotation(richFenceMutation)
      || transaction.isUserEvent("undo")
      || transaction.isUserEvent("redo")
    ) return transaction;

    const selectedWholeDocument = transaction.startState.selection.ranges.some((range) => (
      range.from === 0 && range.to === transaction.startState.doc.length
    ));
    if (selectedWholeDocument) return transaction;

    const analysis = analyzeTextBufferState(transaction.startState);
    const nestedCodeSpec = mapNestedCodeBlockTransaction(transaction, analysis);
    const effectiveTransaction = nestedCodeSpec
      ? transaction.startState.update(nestedCodeSpec)
      : transaction;
    const extendFenceSpec = extendActiveCodeFenceForLiteralFence(effectiveTransaction, analysis);
    let invalidFenceChange = false;
    transaction.changes.iterChangedRanges((fromA, toA) => {
      if (invalidFenceChange) return;
      const touchedBlocks = analysis.codeBlocks.filter((block) => (
        changeTouchesLine(fromA, toA, block.openerFrom, block.openerTo)
        || changeTouchesLine(fromA, toA, block.closerFrom, block.closerTo)
      ));
      invalidFenceChange = touchedBlocks.some((block) => fromA > block.from || toA < block.to);
    });

    if (invalidFenceChange) return [];
    const mainSpec = nestedCodeSpec ?? transaction as unknown as TransactionSpec;
    return extendFenceSpec
      ? [mainSpec, extendFenceSpec]
      : mainSpec;
  });
}

class CodeLanguageWidget extends WidgetType {
  constructor(private readonly block: TextBufferCodeBlock) {
    super();
  }

  eq(other: CodeLanguageWidget) {
    return other.block.language === this.block.language
      && other.block.from === this.block.from
      && other.block.to === this.block.to;
  }

  toDOM(view: EditorView) {
    const wrapper = document.createElement("div");
    wrapper.className = "serein-buffer-code-tools";
    applyCodeBlockContainerStyle(wrapper, this.block);

    const input = document.createElement("input");
    const picker = document.createElement("div");
    const pickerId = `serein-code-languages-${this.block.id}`;
    input.className = "serein-buffer-code-language";
    input.dataset.codeBlockId = String(this.block.id);
    input.value = this.block.language;
    input.setAttribute("aria-label", "Code block language");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", pickerId);
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("role", "combobox");
    input.placeholder = "plain";

    picker.id = pickerId;
    picker.className = "serein-buffer-code-language-options";
    picker.hidden = true;
    picker.setAttribute("role", "listbox");

    let committedLanguage = this.block.language.trim();
    const commitLanguage = () => {
      const nextLanguage = input.value.trim();
      if (nextLanguage !== committedLanguage) {
        const updatedBlock = updateCodeBlockLanguage(view, this.block, input.value);
        if (updatedBlock) committedLanguage = updatedBlock.language.trim();
      }
      return currentCodeBlockByOpener(view, this.block.openerFrom) ?? this.block;
    };

    const closePicker = () => {
      picker.hidden = true;
      input.setAttribute("aria-expanded", "false");
    };

    const chooseLanguage = (language: string) => {
      input.value = language;
      commitLanguage();
      closePicker();
      view.focus();
    };

    const languageOptions = () => [...picker.querySelectorAll<HTMLButtonElement>("button")];
    const focusLanguageOption = (index: number) => {
      const options = languageOptions();
      if (!options.length) return false;
      options[Math.max(0, Math.min(index, options.length - 1))]?.focus();
      return true;
    };

    const renderPicker = () => {
      picker.replaceChildren();
      matchingCodeLanguageCandidates(input.value).forEach((language) => {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "serein-buffer-code-language-option";
        option.textContent = language;
        option.setAttribute("role", "option");
        option.addEventListener("mousedown", stopEditorEvent);
        option.addEventListener("click", (event) => {
          event.stopPropagation();
          chooseLanguage(language);
        });
        option.addEventListener("keydown", (event) => {
          event.stopPropagation();
          const options = languageOptions();
          const currentIndex = options.indexOf(option);
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (event.key === "ArrowUp" && currentIndex <= 0) {
              closePicker();
              input.focus();
              return;
            }
            if (event.key === "ArrowDown" && currentIndex >= options.length - 1) {
              closePicker();
              input.focus();
              return;
            }
            focusLanguageOption(currentIndex + (event.key === "ArrowDown" ? 1 : -1));
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            chooseLanguage(language);
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            closePicker();
            input.focus();
          }
        });
        picker.append(option);
      });
    };

    const openPicker = () => {
      renderPicker();
      picker.hidden = false;
      input.setAttribute("aria-expanded", "true");
    };

    input.addEventListener("mousedown", stopEditorEvent);
    input.addEventListener("click", (event) => {
      event.stopPropagation();
      openPicker();
    });
    input.addEventListener("input", () => {
      if (!picker.hidden) renderPicker();
    });
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        commitLanguage();
        closePicker();
        view.focus();
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        commitLanguage();
        closePicker();
        view.focus();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!picker.hidden && focusLanguageOption(0)) return;
        const currentBlock = commitLanguage();
        exitCodeBlockAfter(view, currentBlock);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closePicker();
        view.focus();
      }
    });
    input.addEventListener("blur", () => {
      window.setTimeout(() => {
        if (wrapper.contains(document.activeElement)) return;
        commitLanguage();
        closePicker();
      }, 0);
    });

    wrapper.append(input, picker);
    return wrapper;
  }

  ignoreEvent() {
    return true;
  }
}

class EmptyCodeBlockWidget extends WidgetType {
  constructor(private readonly block: TextBufferCodeBlock) {
    super();
  }

  eq(other: EmptyCodeBlockWidget) {
    return other.block.openerFrom === this.block.openerFrom
      && other.block.language === this.block.language
      && other.block.containerPrefix === this.block.containerPrefix;
  }

  toDOM(view: EditorView) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "serein-buffer-empty-code";
    button.dataset.codeBlockId = String(this.block.id);
    button.setAttribute("aria-label", "Edit empty code block");
    applyCodeBlockContainerStyle(button, this.block);

    const placeholder = document.createElement("span");
    placeholder.className = "serein-buffer-empty-code-placeholder";
    placeholder.textContent = " ";
    const language = document.createElement("span");
    language.className = "serein-buffer-empty-code-language";
    language.textContent = this.block.language || "plain";
    button.append(placeholder, language);

    button.addEventListener("mousedown", stopEditorEvent);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      materializeEmptyCodeBlock(view, this.block);
    });
    return button;
  }

  ignoreEvent() {
    return true;
  }
}

class ImagePreviewWidget extends WidgetType {
  constructor(
    private readonly source: string,
    private readonly alt: string,
    private readonly preview: string | null,
    private readonly showSource: boolean,
  ) {
    super();
  }

  eq(other: ImagePreviewWidget) {
    return other.source === this.source
      && other.alt === this.alt
      && other.preview === this.preview
      && other.showSource === this.showSource;
  }

  toDOM() {
    const figure = document.createElement("figure");
    figure.className = "serein-buffer-image-preview";
    figure.dataset.sereinImageMarkdown = markdownImageText(this.source, this.alt);

    if (this.showSource) {
      const source = document.createElement("figcaption");
      source.textContent = markdownImageText(this.source, this.alt);
      figure.append(source);
    }

    if (this.preview) {
      const image = document.createElement("img");
      image.src = this.preview;
      image.alt = this.alt;
      figure.append(image);
    } else {
      const missing = document.createElement("div");
      missing.className = "serein-buffer-image-missing";
      missing.textContent = this.alt || this.source;
      figure.append(missing);
    }

    return figure;
  }
}

class WikiLinkWidget extends WidgetType {
  constructor(
    private readonly target: string,
    private readonly label: string,
  ) {
    super();
  }

  eq(other: WikiLinkWidget) {
    return other.target === this.target && other.label === this.label;
  }

  toDOM() {
    const anchor = document.createElement("a");
    anchor.className = "serein-buffer-wiki-link";
    anchor.href = wikiLinkHref(this.target);
    anchor.dataset.href = wikiLinkHref(this.target);
    anchor.textContent = this.label;
    anchor.title = this.target;
    return anchor;
  }
}

class MathWidget extends WidgetType {
  constructor(
    private readonly content: string,
    private readonly html: string,
    private readonly kind: MarkdownMathSpan["kind"],
    private readonly from: number,
    private readonly to: number,
    private readonly contentFrom: number,
  ) {
    super();
  }

  eq(other: MathWidget) {
    return other.content === this.content
      && other.html === this.html
      && other.kind === this.kind
      && other.from === this.from
      && other.to === this.to
      && other.contentFrom === this.contentFrom;
  }

  toDOM(view: EditorView) {
    const element = document.createElement(this.kind === "block" ? "div" : "span");
    element.className = this.kind === "block"
      ? "serein-buffer-math-block"
      : "serein-buffer-math-inline";
    element.setAttribute("role", "math");
    element.dataset.mathSource = this.content;
    element.title = "Click to edit formula";
    element.innerHTML = this.html;
    element.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      const anchor = Math.min(this.contentFrom, view.state.doc.length);
      view.dispatch({ selection: { anchor }, scrollIntoView: true });
      view.focus();
    });
    return element;
  }

  ignoreEvent() {
    return true;
  }
}

type PendingTableFocus = {
  tableFrom: number;
  row: number;
  column: number;
  scrollLeft: number;
};

const pendingTableFocus = new WeakMap<EditorView, PendingTableFocus>();
const tableWidgetHeightCache = new Map<string, number>();

function tableWidgetCacheKey(table: TextBufferTableBlock) {
  return `${table.rows.length}:${Math.max(table.alignments.length, ...table.rows.map((row) => row.length))}`;
}

function createTableAlignmentIcon(alignment: "left" | "center" | "right") {
  const icon = document.createElement("span");
  icon.className = `serein-buffer-table-align-icon is-${alignment}`;
  icon.setAttribute("aria-hidden", "true");
  const widths = alignment === "left"
    ? [14, 9, 12]
    : alignment === "center"
      ? [10, 16, 12]
      : [12, 9, 14];
  widths.forEach((width) => {
    const line = document.createElement("span");
    line.className = "serein-buffer-table-align-icon-line";
    line.style.width = `${width}px`;
    icon.append(line);
  });
  return icon;
}

function createTableGridIcon() {
  const icon = document.createElement("span");
  icon.className = "serein-buffer-table-grid-icon";
  icon.setAttribute("aria-hidden", "true");
  for (let index = 0; index < 9; index += 1) {
    icon.append(document.createElement("span"));
  }
  return icon;
}

class PipeTableWidget extends WidgetType {
  constructor(private readonly table: TextBufferTableBlock) {
    super();
  }

  eq(other: PipeTableWidget) {
    return other.table.from === this.table.from
      && other.table.to === this.table.to
      && JSON.stringify(other.table.rows) === JSON.stringify(this.table.rows)
      && JSON.stringify(other.table.alignments) === JSON.stringify(this.table.alignments);
  }

  get estimatedHeight() {
    return tableWidgetHeightCache.get(tableWidgetCacheKey(this.table)) ?? -1;
  }

  toDOM(view: EditorView) {
    const wrapper = document.createElement("div");
    wrapper.className = "serein-buffer-table-block";
    wrapper.addEventListener("mousedown", stopEditorEvent);
    wrapper.addEventListener("click", stopEditorEvent);

    const toolbar = document.createElement("div");
    toolbar.className = "serein-buffer-table-toolbar";
    const toolbarStart = document.createElement("div");
    toolbarStart.className = "serein-buffer-table-toolbar-start";
    const rowColumnTools = document.createElement("div");
    rowColumnTools.className = "serein-buffer-table-toolbar-group";
    const alignmentTools = document.createElement("div");
    alignmentTools.className = "serein-buffer-table-toolbar-group serein-buffer-table-alignment-tools";
    const toolbarEnd = document.createElement("div");
    toolbarEnd.className = "serein-buffer-table-toolbar-end";
    toolbarStart.append(rowColumnTools, alignmentTools);
    toolbar.append(toolbarStart, toolbarEnd);

    const tableElement = document.createElement("table");
    const tableData = normalizeTextBufferTable(this.table);
    const [header, ...bodyRows] = tableData.rows;
    let activeCell = {
      row: tableData.rows.length > 1 ? 1 : 0,
      column: 0,
    };
    let suppressBlurCommit = false;

    const focusCell = (row: number, column: number) => {
      const input = wrapper.querySelector<HTMLInputElement>(`input[data-row="${row}"][data-column="${column}"]`);
      if (!input) return false;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      return true;
    };

    const rememberFocus = (row: number, column: number) => {
      pendingTableFocus.set(view, {
        tableFrom: this.table.from,
        row,
        column,
        scrollLeft: wrapper.scrollLeft,
      });
    };

    const replaceTable = (nextTable: TextBufferTableData, focus?: { row: number; column: number }) => {
      const normalized = normalizeTextBufferTable(nextTable);
      const nextMarkdown = serializeTextBufferTable(normalized);
      if (nextMarkdown === view.state.sliceDoc(this.table.from, this.table.to)) {
        if (focus) focusCell(focus.row, focus.column);
        return;
      }
      suppressBlurCommit = true;
      if (focus) rememberFocus(focus.row, focus.column);
      view.dispatch({
        changes: {
          from: this.table.from,
          to: this.table.to,
          insert: nextMarkdown,
        },
        annotations: Transaction.userEvent.of("input.table"),
      });
    };

    const tableWithCellValue = (row: number, column: number, value: string) => {
      const nextTable = normalizeTextBufferTable(tableData);
      nextTable.rows[row][column] = value;
      return nextTable;
    };

    const tableWithActiveCellValue = () => {
      const input = wrapper.querySelector<HTMLInputElement>(
        `input[data-row="${activeCell.row}"][data-column="${activeCell.column}"]`,
      );
      return input
        ? tableWithCellValue(activeCell.row, activeCell.column, input.value)
        : normalizeTextBufferTable(tableData);
    };

    const resizeTable = (requestedRows: number, requestedColumns: number) => {
      const rowCount = Math.max(2, Math.min(99, Math.round(requestedRows)));
      const columnCount = Math.max(2, Math.min(99, Math.round(requestedColumns)));
      let nextTable = tableWithActiveCellValue();

      while (nextTable.rows.length < rowCount) {
        nextTable = insertTextBufferTableRow(nextTable, nextTable.rows.length - 1);
      }
      while (nextTable.rows.length > rowCount) {
        nextTable = deleteTextBufferTableRow(nextTable, nextTable.rows.length - 1);
      }
      while (nextTable.alignments.length < columnCount) {
        nextTable = insertTextBufferTableColumn(nextTable, nextTable.alignments.length - 1);
      }
      while (nextTable.alignments.length > columnCount) {
        nextTable = deleteTextBufferTableColumn(nextTable, nextTable.alignments.length - 1);
      }

      replaceTable(nextTable, {
        row: Math.min(activeCell.row, nextTable.rows.length - 1),
        column: Math.min(activeCell.column, nextTable.alignments.length - 1),
      });
    };

    const exitTableAfter = (nextTable: TextBufferTableData) => {
      const nextMarkdown = serializeTextBufferTable(nextTable);
      const suffix = view.state.sliceDoc(this.table.to, Math.min(view.state.doc.length, this.table.to + 2));
      const hasBlankLine = suffix.startsWith("\n\n");
      const hasSingleNewline = !hasBlankLine && suffix.startsWith("\n");
      const to = this.table.to + (hasSingleNewline ? 1 : 0);
      const insert = hasBlankLine ? nextMarkdown : `${nextMarkdown}\n\n`;
      suppressBlurCommit = true;
      view.dispatch({
        changes: { from: this.table.from, to, insert },
        selection: { anchor: this.table.from + nextMarkdown.length + 1 },
        annotations: Transaction.userEvent.of("input.table.exit"),
      });
      view.focus();
    };

    const exitTableBefore = (nextTable: TextBufferTableData) => {
      const nextMarkdown = serializeTextBufferTable(nextTable);
      const prefix = view.state.sliceDoc(Math.max(0, this.table.from - 2), this.table.from);
      let insert = nextMarkdown;
      let anchor = Math.max(0, this.table.from - 1);
      if (this.table.from === 0) {
        insert = `\n\n${nextMarkdown}`;
        anchor = 0;
      } else if (!prefix.endsWith("\n\n")) {
        const hasSingleNewline = prefix.endsWith("\n");
        insert = `${hasSingleNewline ? "\n" : "\n\n"}${nextMarkdown}`;
        anchor = this.table.from + (hasSingleNewline ? 0 : 1);
      }
      suppressBlurCommit = true;
      view.dispatch({
        changes: { from: this.table.from, to: this.table.to, insert },
        selection: { anchor },
        annotations: Transaction.userEvent.of("input.table.exit"),
      });
      view.focus();
    };

    const deleteTable = () => {
      const suffix = view.state.sliceDoc(this.table.to, Math.min(view.state.doc.length, this.table.to + 2));
      const to = this.table.to + (suffix.startsWith("\n\n") ? 2 : suffix.startsWith("\n") ? 1 : 0);
      suppressBlurCommit = true;
      view.dispatch({
        changes: { from: this.table.from, to, insert: "" },
        selection: { anchor: this.table.from },
        annotations: Transaction.userEvent.of("input.table.delete"),
      });
      view.focus();
    };

    const addToolbarButton = (
      parent: HTMLElement,
      content: string | Node,
      title: string,
      action: () => void,
      className = "",
    ) => {
      const button = document.createElement("button");
      button.type = "button";
      if (typeof content === "string") button.textContent = content;
      else button.append(content);
      if (className) button.className = className;
      button.title = title;
      button.setAttribute("aria-label", title);
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        action();
      });
      parent.append(button);
      return button;
    };

    const addMenuButton = (menu: HTMLElement, label: string, title: string, action: () => void) => {
      const button = addToolbarButton(menu, label, title, () => {
        action();
        moreDetails.removeAttribute("open");
      }, "serein-buffer-table-menu-item");
      return button;
    };

    const gridDetails = document.createElement("details");
    gridDetails.className = "serein-buffer-table-grid-picker";
    const gridSummary = document.createElement("summary");
    gridSummary.append(createTableGridIcon());
    gridSummary.title = "Select table rows and columns";
    gridSummary.setAttribute("aria-label", "Select table rows and columns");
    gridSummary.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    gridSummary.addEventListener("click", (event) => event.stopPropagation());

    const gridMenu = document.createElement("div");
    gridMenu.className = "serein-buffer-table-grid-menu";
    const gridCells = document.createElement("div");
    gridCells.className = "serein-buffer-table-grid-cells";
    const gridSizeLabel = document.createElement("div");
    gridSizeLabel.className = "serein-buffer-table-grid-size";
    const gridFields = document.createElement("div");
    gridFields.className = "serein-buffer-table-grid-fields";
    const gridRowsInput = document.createElement("input");
    gridRowsInput.type = "number";
    gridRowsInput.min = "2";
    gridRowsInput.max = "99";
    gridRowsInput.setAttribute("aria-label", "Table rows");
    const gridColumnsInput = document.createElement("input");
    gridColumnsInput.type = "number";
    gridColumnsInput.min = "2";
    gridColumnsInput.max = "99";
    gridColumnsInput.setAttribute("aria-label", "Table columns");
    const gridApplyButton = document.createElement("button");
    gridApplyButton.type = "button";
    gridApplyButton.className = "serein-buffer-table-grid-apply";
    gridApplyButton.textContent = "✓";
    gridApplyButton.title = "Apply table size";
    gridApplyButton.setAttribute("aria-label", "Apply table size");
    gridFields.append(
      Object.assign(document.createElement("span"), { textContent: "行" }),
      gridRowsInput,
      Object.assign(document.createElement("span"), { textContent: "列" }),
      gridColumnsInput,
      gridApplyButton,
    );

    let gridRows = tableData.rows.length;
    let gridColumns = tableData.alignments.length;
    const updateGridPreview = (rows: number, columns: number, syncInputs = true) => {
      gridRows = Math.max(2, Math.min(99, Math.round(rows)));
      gridColumns = Math.max(2, Math.min(99, Math.round(columns)));
      if (syncInputs) {
        gridRowsInput.value = String(gridRows);
        gridColumnsInput.value = String(gridColumns);
      }
      gridSizeLabel.textContent = `${gridRows} × ${gridColumns}`;
      gridCells.querySelectorAll<HTMLButtonElement>("button").forEach((cell) => {
        const row = Number(cell.dataset.row);
        const column = Number(cell.dataset.column);
        cell.dataset.selected = row <= gridRows && column <= gridColumns ? "true" : "false";
      });
    };
    const applyGridSize = () => {
      resizeTable(gridRows, gridColumns);
      gridDetails.removeAttribute("open");
    };

    for (let row = 2; row <= 9; row += 1) {
      for (let column = 2; column <= 11; column += 1) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "serein-buffer-table-grid-cell";
        cell.dataset.row = String(row);
        cell.dataset.column = String(column);
        cell.setAttribute("aria-label", `${row} rows by ${column} columns`);
        cell.addEventListener("mousedown", (event) => {
          event.preventDefault();
          event.stopPropagation();
        });
        cell.addEventListener("mouseenter", () => updateGridPreview(Number(cell.dataset.row), Number(cell.dataset.column)));
        cell.addEventListener("focus", () => updateGridPreview(Number(cell.dataset.row), Number(cell.dataset.column)));
        cell.addEventListener("click", (event) => {
          event.stopPropagation();
          applyGridSize();
        });
        gridCells.append(cell);
      }
    }
    updateGridPreview(gridRows, gridColumns);
    gridRowsInput.addEventListener("input", () => updateGridPreview(Number(gridRowsInput.value) || 2, Number(gridColumnsInput.value) || 2, false));
    gridColumnsInput.addEventListener("input", () => updateGridPreview(Number(gridRowsInput.value) || 2, Number(gridColumnsInput.value) || 2, false));
    gridRowsInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      applyGridSize();
    });
    gridColumnsInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      applyGridSize();
    });
    gridApplyButton.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    gridApplyButton.addEventListener("click", (event) => {
      event.stopPropagation();
      applyGridSize();
    });
    gridDetails.addEventListener("mouseleave", () => updateGridPreview(tableData.rows.length, tableData.alignments.length));
    gridMenu.append(gridCells, gridSizeLabel, gridFields);
    gridDetails.append(gridSummary, gridMenu);
    rowColumnTools.append(gridDetails);

    const alignmentButtons = new Map<"left" | "center" | "right", HTMLButtonElement>();
    const updateAlignmentToolbar = () => {
      const current = tableData.alignments[activeCell.column] ?? "default";
      const effective = current === "default" ? "left" : current;
      alignmentButtons.forEach((button, alignment) => {
        button.dataset.active = alignment === effective ? "true" : "false";
        button.setAttribute("aria-pressed", alignment === effective ? "true" : "false");
      });
    };
    (["left", "center", "right"] as const).forEach((alignment) => {
      const button = addToolbarButton(
        alignmentTools,
        createTableAlignmentIcon(alignment),
        `Set current column alignment to ${alignment}`,
        () => {
          const nextTable = setTextBufferTableAlignment(
            tableWithActiveCellValue(),
            activeCell.column,
            alignment,
          );
          replaceTable(nextTable, { row: activeCell.row, column: activeCell.column });
        },
        "serein-buffer-table-align-tool",
      );
      alignmentButtons.set(alignment, button);
    });
    updateAlignmentToolbar();

    const moreDetails = document.createElement("details");
    moreDetails.className = "serein-buffer-table-more";
    const moreSummary = document.createElement("summary");
    moreSummary.textContent = "⋯";
    moreSummary.title = "More table operations";
    moreSummary.setAttribute("aria-label", "More table operations");
    moreSummary.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    moreSummary.addEventListener("click", (event) => event.stopPropagation());
    const moreMenu = document.createElement("div");
    moreMenu.className = "serein-buffer-table-menu";
    moreDetails.append(moreSummary, moreMenu);
    toolbarEnd.append(moreDetails);

    addMenuButton(moreMenu, "上方插入行", "Insert row above the active row", () => {
      const nextTable = insertTextBufferTableRow(tableWithActiveCellValue(), activeCell.row - 1);
      replaceTable(nextTable, { row: activeCell.row, column: activeCell.column });
    });
    addMenuButton(moreMenu, "下方插入行", "Insert row below the active row", () => {
      const nextTable = insertTextBufferTableRow(tableWithActiveCellValue(), activeCell.row);
      replaceTable(nextTable, { row: activeCell.row + 1, column: activeCell.column });
    });
    addMenuButton(moreMenu, "左侧插入列", "Insert column to the left of the active column", () => {
      const nextTable = insertTextBufferTableColumn(tableWithActiveCellValue(), activeCell.column - 1);
      replaceTable(nextTable, { row: activeCell.row, column: activeCell.column });
    });
    addMenuButton(moreMenu, "右侧插入列", "Insert column to the right of the active column", () => {
      const nextTable = insertTextBufferTableColumn(tableWithActiveCellValue(), activeCell.column);
      replaceTable(nextTable, { row: activeCell.row, column: activeCell.column + 1 });
    });
    addMenuButton(moreMenu, "上移该行", "Move the active row up", () => {
      const nextTable = moveTextBufferTableRow(tableWithActiveCellValue(), activeCell.row, -1);
      replaceTable(nextTable, { row: Math.max(1, activeCell.row - 1), column: activeCell.column });
    });
    addMenuButton(moreMenu, "下移该行", "Move the active row down", () => {
      const nextTable = moveTextBufferTableRow(tableWithActiveCellValue(), activeCell.row, 1);
      replaceTable(nextTable, { row: Math.min(nextTable.rows.length - 1, activeCell.row + 1), column: activeCell.column });
    });
    addMenuButton(moreMenu, "左移该列", "Move the active column left", () => {
      const nextTable = moveTextBufferTableColumn(tableWithActiveCellValue(), activeCell.column, -1);
      replaceTable(nextTable, { row: activeCell.row, column: Math.max(0, activeCell.column - 1) });
    });
    addMenuButton(moreMenu, "右移该列", "Move the active column right", () => {
      const nextTable = moveTextBufferTableColumn(tableWithActiveCellValue(), activeCell.column, 1);
      replaceTable(nextTable, { row: activeCell.row, column: Math.min(nextTable.alignments.length - 1, activeCell.column + 1) });
    });
    addMenuButton(moreMenu, "删除该行", "Delete the active row", () => {
      const nextTable = deleteTextBufferTableRow(tableWithActiveCellValue(), activeCell.row);
      replaceTable(nextTable, { row: Math.min(activeCell.row, nextTable.rows.length - 1), column: activeCell.column });
    });
    addMenuButton(moreMenu, "删除该列", "Delete the active column", () => {
      const nextTable = deleteTextBufferTableColumn(tableWithActiveCellValue(), activeCell.column);
      replaceTable(nextTable, { row: activeCell.row, column: Math.min(activeCell.column, nextTable.alignments.length - 1) });
    });
    addMenuButton(moreMenu, "复制表格", "Copy table Markdown", () => {
      void writeDesktopClipboardText(serializeTextBufferTable(tableWithActiveCellValue()));
    });
    addMenuButton(moreMenu, "格式化表格源码", "Format table Markdown source", () => {
      replaceTable(tableWithActiveCellValue(), { row: activeCell.row, column: activeCell.column });
    });

    addToolbarButton(toolbarEnd, "×", "Delete table", deleteTable, "serein-buffer-table-delete");

    const createCellInput = (rowIndex: number, cellIndex: number, value: string) => {
      const input = document.createElement("input");
      input.value = value;
      input.dataset.row = String(rowIndex);
      input.dataset.column = String(cellIndex);
      const alignment = tableData.alignments[cellIndex] ?? "default";
      input.style.textAlign = alignment === "center" ? "center" : alignment === "right" ? "right" : "left";
      input.setAttribute("aria-label", `Table row ${rowIndex + 1}, column ${cellIndex + 1}`);
      let committedValue = value;

      const commitCell = (focus?: { row: number; column: number }) => {
        if (input.value === committedValue) return false;
        committedValue = input.value;
        replaceTable(tableWithCellValue(rowIndex, cellIndex, input.value), focus);
        return true;
      };

      const moveFocus = (row: number, column: number) => {
        if (commitCell({ row, column })) return;
        focusCell(row, column);
      };

      input.addEventListener("focus", () => {
        activeCell = { row: rowIndex, column: cellIndex };
        updateAlignmentToolbar();
      });
      input.addEventListener("mousedown", stopEditorEvent);
      input.addEventListener("click", stopEditorEvent);
      input.addEventListener("keydown", (event) => {
        event.stopPropagation();

        if (event.key === "Tab") {
          event.preventDefault();
          const currentIndex = rowIndex * tableData.alignments.length + cellIndex;
          const nextIndex = currentIndex + (event.shiftKey ? -1 : 1);
          if (nextIndex < 0) {
            exitTableBefore(tableWithCellValue(rowIndex, cellIndex, input.value));
            return;
          }
          if (nextIndex >= tableData.rows.length * tableData.alignments.length) {
            const nextTable = insertTextBufferTableRow(tableWithCellValue(rowIndex, cellIndex, input.value), rowIndex);
            replaceTable(nextTable, { row: nextTable.rows.length - 1, column: 0 });
            return;
          }
          moveFocus(
            Math.floor(nextIndex / tableData.alignments.length),
            nextIndex % tableData.alignments.length,
          );
          return;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          if (rowIndex >= tableData.rows.length - 1) {
            const nextTable = insertTextBufferTableRow(tableWithCellValue(rowIndex, cellIndex, input.value), rowIndex);
            replaceTable(nextTable, { row: nextTable.rows.length - 1, column: cellIndex });
          } else {
            moveFocus(rowIndex + 1, cellIndex);
          }
          return;
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          if (rowIndex >= tableData.rows.length - 1) {
            exitTableAfter(tableWithCellValue(rowIndex, cellIndex, input.value));
          } else {
            moveFocus(rowIndex + 1, cellIndex);
          }
          return;
        }

        if (event.key === "ArrowUp" && rowIndex > 0) {
          event.preventDefault();
          moveFocus(rowIndex - 1, cellIndex);
          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          exitTableAfter(tableWithCellValue(rowIndex, cellIndex, input.value));
        }
      });
      input.addEventListener("blur", () => {
        if (!suppressBlurCommit) commitCell();
      });
      return input;
    };

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    header.forEach((cell, cellIndex) => {
      const th = document.createElement("th");
      const alignment = tableData.alignments[cellIndex] ?? "default";
      th.style.textAlign = alignment === "center" ? "center" : alignment === "right" ? "right" : "left";
      th.append(createCellInput(0, cellIndex, cell));
      headerRow.append(th);
    });
    thead.append(headerRow);
    tableElement.append(thead);

    const tbody = document.createElement("tbody");
    bodyRows.forEach((row, bodyIndex) => {
      const rowElement = document.createElement("tr");
      header.forEach((_, cellIndex) => {
        const td = document.createElement("td");
        const alignment = tableData.alignments[cellIndex] ?? "default";
        td.style.textAlign = alignment === "center" ? "center" : alignment === "right" ? "right" : "left";
        td.append(createCellInput(bodyIndex + 1, cellIndex, row[cellIndex] ?? ""));
        rowElement.append(td);
      });
      tbody.append(rowElement);
    });
    tableElement.append(tbody);
    wrapper.append(toolbar, tableElement);

    const pending = pendingTableFocus.get(view);
    if (pending?.tableFrom === this.table.from) {
      pendingTableFocus.delete(view);
      window.requestAnimationFrame(() => {
        wrapper.scrollLeft = pending.scrollLeft;
        focusCell(pending.row, pending.column);
      });
    }

    return wrapper;
  }

  destroy(dom: HTMLElement) {
    tableWidgetHeightCache.set(tableWidgetCacheKey(this.table), dom.getBoundingClientRect().height);
  }

  ignoreEvent() {
    return true;
  }
}

function addVisibleMarkdownLink(
  builder: SortedDecorationBuilder,
  link: TextBufferInlineLink,
) {
  addMark(builder, link.from, link.labelFrom, "serein-buffer-md-syntax");
  addMark(builder, link.labelFrom, link.labelTo, link.image ? "serein-buffer-image-label" : "serein-buffer-link-label");
  addMark(builder, link.labelTo, link.urlFrom, "serein-buffer-md-syntax");
  addMark(builder, link.urlFrom, link.urlTo, "serein-buffer-link-url");
  addMark(builder, link.urlTo, link.to, "serein-buffer-md-syntax");
}

function addCollapsedMarkdownLink(
  builder: SortedDecorationBuilder,
  link: TextBufferInlineLink,
) {
  if (link.kind === "autolink") {
    addSyntaxOrHide(builder, link.from, link.labelFrom, "rich");
    addMark(builder, link.labelFrom, link.labelTo, "serein-buffer-link-label");
    addSyntaxOrHide(builder, link.labelTo, link.to, "rich");
    return;
  }

  addSyntaxOrHide(builder, link.from, link.labelFrom, "rich");
  addMark(builder, link.labelFrom, link.labelTo, link.image ? "serein-buffer-image-label" : "serein-buffer-link-label");
  addSyntaxOrHide(builder, link.labelTo, link.to, "rich");
}

function addMarkdownLinkMarks(
  builder: SortedDecorationBuilder,
  state: EditorState,
  links: TextBufferInlineLink[],
  options: TextBufferDecorationOptions,
) {
  links.forEach((link) => {
    const active = selectionTouchesRange(state, link.from, link.to);
    if (options.mode === "rich" && !active) {
      addCollapsedMarkdownLink(builder, link);
      return;
    }
    addVisibleMarkdownLink(builder, link);
  });
}

function addWikiLinkMarks(
  builder: SortedDecorationBuilder,
  state: EditorState,
  lineFrom: number,
  text: string,
  options: TextBufferDecorationOptions,
) {
  scanWikiLinks(text, lineFrom).forEach((link) => {
    const active = selectionTouchesRange(state, link.from, link.to);
    if (options.mode === "rich" && !active) {
      builder.addAtomic(link.from, link.to, Decoration.replace({
        widget: new WikiLinkWidget(link.target, link.label),
      }));
      return;
    }
    addMark(builder, link.from, link.to, "serein-buffer-wiki-editing");
  });
}

function analyzeTyporaDocument(state: EditorState, options: TextBufferDecorationOptions) {
  const markdown = state.doc.toString();
  const analysis = analyzeTextBufferState(state);
  const frontmatter = options.mode === "rich" && options.showFrontmatterTagRow
    ? splitYamlFrontmatter(markdown)
    : null;
  const frontmatterEnd = frontmatter ? markdown.length - frontmatter.body.length : 0;
  const tableBlocks = options.mode === "rich" ? scanTextBufferTables(markdown, analysis) : [];
  const tableStarts = new Map(tableBlocks.map((table) => [table.from, table]));
  const tableRanges = tableBlocks.map((table) => ({ from: table.from, to: table.to }));
  const mathSpans = renderMathSpans(scanMarkdownMath(markdown), {
    macroDefinitions: extractLatexMathMacroDefinitions(markdown),
  }).filter((span) => (
    !tableRanges.some((range) => range.from < span.to && range.to > span.from)
  ));
  return {
    markdown,
    analysis,
    frontmatterEnd,
    tableStarts,
    tableRanges,
    mathSpans,
  };
}

function buildTyporaDocumentDecorations(
  state: EditorState,
  options: TextBufferDecorationOptions,
  document = analyzeTyporaDocument(state, options),
): TyporaDocumentDecorationFieldState {
  const builder = new SortedDecorationBuilder();
  const {
    analysis,
    frontmatterEnd,
    mathSpans,
    tableStarts,
    tableRanges,
  } = document;
  const codeBlocksById = new Map(analysis.codeBlocks.map((block) => [block.id, block]));
  const codeBlocksByOpener = new Map(analysis.codeBlocks.map((block) => [block.openerFrom, block]));
  const blockMathRanges = mathSpans.filter((span) => span.kind === "block");
  let blockMathRangeIndex = 0;

  if (options.mode === "rich") {
    tableStarts.forEach((table) => {
      builder.addAtomic(table.from, table.to, Decoration.replace({
        widget: new PipeTableWidget(table),
        block: true,
      }));
    });
  }

  analysis.lines.forEach((line) => {
    if (frontmatterEnd > 0 && line.from < frontmatterEnd) return;

    const tableRange = tableRanges.find((item) => line.from >= item.from && line.to <= item.to);
    if (options.mode === "rich" && tableRange) return;

    while (
      blockMathRanges[blockMathRangeIndex]
      && line.from > (blockMathRanges[blockMathRangeIndex]?.to ?? line.from)
    ) {
      blockMathRangeIndex += 1;
    }
    const blockMathRange = blockMathRanges[blockMathRangeIndex];
    const lineInsideBlockMath = blockMathRange
      && line.from >= blockMathRange.from
      && line.to <= blockMathRange.to;
    if (lineInsideBlockMath) return;

    if (options.mode === "rich" && line.hiddenInRich) {
      builder.add(line.from, line.from, Decoration.line({
        class: "serein-buffer-hidden-line",
      }));
    }

    if (line.kind === "codeFence") {
      const pendingFence = line.fenceStatus === "pending";
      builder.add(line.from, line.from, Decoration.line({
        class: options.mode === "rich" && !pendingFence
          ? "serein-buffer-code-fence-line serein-buffer-hidden-line"
          : pendingFence
            ? "serein-buffer-pending-fence-line"
            : "serein-buffer-code-fence-line",
      }));
      const emptyBlock = codeBlocksByOpener.get(line.from);
      if (options.mode === "rich" && emptyBlock && isTextBufferCodeBlockEmpty(emptyBlock)) {
        builder.add(emptyBlock.closerFrom, emptyBlock.closerFrom, Decoration.widget({
          widget: new EmptyCodeBlockWidget(emptyBlock),
          side: -1,
          block: true,
        }));
      }
    } else if (line.kind === "code") {
      const codeBlock = line.codeBlockId !== undefined ? codeBlocksById.get(line.codeBlockId) : null;
      const codeLineClasses = ["serein-buffer-code-line"];
      if (codeBlock?.firstContentLine === line.number) codeLineClasses.push("serein-buffer-code-first");
      if (codeBlock?.lastContentLine === line.number) codeLineClasses.push("serein-buffer-code-last");
      builder.add(line.from, line.from, Decoration.line({
        class: codeLineClasses.join(" "),
        attributes: codeBlock ? codeBlockLineAttributes(codeBlock) : undefined,
      }));
    } else if (line.kind === "heading") {
      builder.add(line.from, line.from, Decoration.line({ class: `serein-buffer-heading-line serein-buffer-h${line.headingLevel ?? 1}` }));
    }

    if (line.richQuoteDepth || line.richListDepth) {
      const classes = ["serein-buffer-structure-line"];
      if (line.richQuoteDepth) {
        classes.push("serein-buffer-quote-line");
        if (line.richQuoteStart) classes.push("serein-buffer-quote-start");
        if (line.richQuoteEnd) classes.push("serein-buffer-quote-end");
      }
      if (line.richListDepth) classes.push("serein-buffer-list-line");
      if (line.richListContinuation) classes.push("serein-buffer-list-continuation");

      builder.add(line.from, line.from, Decoration.line({
        class: classes.join(" "),
        attributes: {
          "data-list-kind": line.richListDepth
            ? line.richListKind ?? line.listKind ?? "bullet"
            : "",
          "data-list-marker": line.richListDepth
            ? line.richListContinuation
              ? ""
              : line.richListKind === "bullet" || line.listKind === "bullet"
                ? "•"
                : line.richListMarker ?? line.listMarker ?? "1."
            : "",
          "data-quote-depth": String(line.richQuoteDepth ?? 0),
          "data-list-depth": String(line.richListDepth ?? 0),
          style: [
            `--serein-quote-depth: ${line.richQuoteDepth ?? 0}`,
            `--serein-quote-indent: ${Math.max(0, (line.richQuoteDepth ?? 0) - 1) * 22}px`,
            `--serein-list-depth: ${line.richListDepth ?? 0}`,
            `--serein-list-indent: ${Math.max(0, (line.richListDepth ?? 0) - 1) * 24}px`,
          ].join("; "),
        },
      }));
    }

    line.richHiddenRanges.forEach((range) => addSyntaxOrHide(builder, range.from, range.to, options.mode));

    if (options.mode !== "rich") {
      line.syntaxRanges
        .filter((range) => !line.richHiddenRanges.some((hidden) => hidden.from === range.from && hidden.to === range.to))
        .forEach((range) => addMark(builder, range.from, range.to, "serein-buffer-md-syntax"));
    }
  });

  return { ...builder.finish(), document, options };
}

const typoraDocumentDecorations = StateField.define<TyporaDocumentDecorationFieldState>({
  create(state) {
    const options = state.facet(textBufferDecorationOptions);
    return buildTyporaDocumentDecorations(state, options);
  },
  update(value, transaction) {
    const options = transaction.state.facet(textBufferDecorationOptions);
    const optionsChanged = options !== value.options;
    if (!transaction.docChanged && !optionsChanged) return value;
    return buildTyporaDocumentDecorations(transaction.state, options);
  },
  provide: (field) => [
    EditorView.decorations.from(field, (value) => value.decorations),
    EditorView.atomicRanges.of((view) => view.state.field(field).atomicRanges),
  ],
});

function buildTyporaActiveDecorations(state: EditorState): TyporaActiveDecorationFieldState {
  const builder = new SortedDecorationBuilder();
  const options = state.facet(textBufferDecorationOptions);
  const document = state.field(typoraDocumentDecorations).document;
  const { analysis, frontmatterEnd, mathSpans } = document;

  const sourceFrontmatter = splitYamlFrontmatter(document.markdown);
  const sourceFrontmatterEnd = sourceFrontmatter
    ? document.markdown.length - sourceFrontmatter.body.length
    : 0;

  mathSpans.forEach((span) => {
    if (span.from < sourceFrontmatterEnd) return;
    if (options.mode === "rich" && !selectionTouchesRange(state, span.from, span.to)) {
      builder.addAtomic(span.from, span.to, Decoration.replace({
        widget: new MathWidget(span.content, span.html, span.kind, span.from, span.to, span.contentFrom),
        block: span.kind === "block",
      }));
    } else {
      addMark(builder, span.from, span.to, "serein-buffer-math-source");
    }
  });

  if (frontmatterEnd > 0) {
    const frontmatterActive = selectionTouchesRange(state, 0, frontmatterEnd);
    analysis.lines.forEach((line) => {
      if (line.from >= frontmatterEnd) return;
      builder.add(line.from, line.from, Decoration.line({
        class: frontmatterActive
          ? "serein-buffer-frontmatter-source-line"
          : "serein-buffer-frontmatter-source-line serein-buffer-hidden-line",
      }));
      if (!frontmatterActive) return;
      line.richHiddenRanges.forEach((range) => addSyntaxOrHide(builder, range.from, range.to, options.mode));
      if (options.mode !== "rich") {
        line.syntaxRanges
          .filter((range) => !line.richHiddenRanges.some((hidden) => hidden.from === range.from && hidden.to === range.to))
          .forEach((range) => addMark(builder, range.from, range.to, "serein-buffer-md-syntax"));
      }
    });
  }

  if (options.mode === "rich") {
    const activeHead = state.selection.main.head;
    const activeLine = analysis.lines[state.doc.lineAt(activeHead).number - 1];
    const activeBlock = analysis.codeBlocks.find((block) => (
      activeHead >= block.from && activeHead <= block.to
    )) ?? (activeLine?.codeBlockId !== undefined
      ? analysis.codeBlocks.find((block) => block.id === activeLine.codeBlockId)
      : undefined);

    if (activeBlock) {
      for (let lineNumber = activeBlock.firstContentLine; lineNumber <= activeBlock.lastContentLine; lineNumber += 1) {
        const line = analysis.lines[lineNumber - 1];
        if (!line) continue;
        builder.add(line.from, line.from, Decoration.line({ class: "serein-buffer-code-active" }));
      }
      const lastLine = analysis.lines[activeBlock.lastContentLine - 1];
      if (lastLine) {
        builder.add(lastLine.to, lastLine.to, Decoration.widget({
          widget: new CodeLanguageWidget(activeBlock),
          side: 1,
          block: true,
        }));
      }
    }
  }

  return { ...builder.finish(), options };
}

const typoraActiveDecorations = StateField.define<TyporaActiveDecorationFieldState>({
  create: buildTyporaActiveDecorations,
  update(value, transaction) {
    const options = transaction.state.facet(textBufferDecorationOptions);
    const optionsChanged = options !== value.options;
    if (!transaction.docChanged && !transaction.selection && !optionsChanged) return value;
    return buildTyporaActiveDecorations(transaction.state);
  },
  provide: (field) => [
    EditorView.decorations.from(field, (value) => value.decorations),
    EditorView.atomicRanges.of((view) => view.state.field(field).atomicRanges),
  ],
});

function buildTyporaInlineDecorations(view: EditorView) {
  const builder = new SortedDecorationBuilder();
  const state = view.state;
  const options = state.facet(textBufferDecorationOptions);
  const document = state.field(typoraDocumentDecorations).document;
  const visibleLineNumbers = new Set<number>();

  view.visibleRanges.forEach((range) => {
    const fromLine = state.doc.lineAt(range.from).number;
    const toLine = state.doc.lineAt(Math.min(range.to, state.doc.length)).number;
    for (let lineNumber = fromLine; lineNumber <= toLine; lineNumber += 1) {
      visibleLineNumbers.add(lineNumber);
    }
  });

  visibleLineNumbers.forEach((lineNumber) => {
    const line = document.analysis.lines[lineNumber - 1];
    if (!line || line.kind === "code" || line.kind === "codeFence") return;
    if (document.frontmatterEnd > 0 && line.from < document.frontmatterEnd) return;
    if (document.tableRanges.some((range) => line.from >= range.from && line.to <= range.to)) return;

    const lineLinks = scanTextBufferInlineLinks(line.text, line.from);
    const standaloneImage = lineLinks.find((link) => (
      link.image
      && lineLinks.length === 1
      && line.text.trim() === state.sliceDoc(link.from, link.to).trim()
    ));
    if (
      options.mode === "rich"
      && standaloneImage
      && !selectionTouchesRange(state, standaloneImage.from, standaloneImage.to)
    ) {
      const source = normalizeMarkdownImageSource(standaloneImage.href);
      const preview = localImagePreview(options.imagePreviewMap, source) ?? null;
      const alt = state.sliceDoc(standaloneImage.labelFrom, standaloneImage.labelTo);
      builder.add(line.from, line.from, Decoration.widget({
        widget: new ImagePreviewWidget(source, alt, preview, options.showImageSourceOnFocus),
        side: -1,
      }));
      addSyntaxOrHide(builder, standaloneImage.from, standaloneImage.to, "rich");
      return;
    }

    addMarkdownLinkMarks(builder, state, lineLinks, options);
    addWikiLinkMarks(builder, state, line.from, line.text, options);
    addDelimitedInlineMarks(builder, state, line.from, line.text, /`[^`\n]+`/g, 1, "serein-buffer-inline-code", options);
    addDelimitedInlineMarks(builder, state, line.from, line.text, /\*\*[^*\n]+\*\*/g, 2, "serein-buffer-strong", options);
    addDelimitedInlineMarks(builder, state, line.from, line.text, /~~[^~\n]+~~/g, 2, "serein-buffer-strike", options);
  });

  return builder.finish();
}

const typoraInlineDecorations = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  atomicRanges: DecorationSet;

  constructor(view: EditorView) {
    const decorations = buildTyporaInlineDecorations(view);
    this.decorations = decorations.decorations;
    this.atomicRanges = decorations.atomicRanges;
  }

  update(update: ViewUpdate) {
    const optionsChanged = update.startState.facet(textBufferDecorationOptions)
      !== update.state.facet(textBufferDecorationOptions);
    if (!update.docChanged && !update.viewportChanged && !update.selectionSet && !optionsChanged) return;
    const decorations = buildTyporaInlineDecorations(update.view);
    this.decorations = decorations.decorations;
    this.atomicRanges = decorations.atomicRanges;
  }
}, {
  decorations: (value) => value.decorations,
  provide: (plugin) => EditorView.atomicRanges.of((view) => (
    view.plugin(plugin)?.atomicRanges ?? Decoration.none
  )),
});

function textBufferClipboardSelection(view: EditorView) {
  const analysis = analyzeTextBufferState(view.state);
  const markdown = view.state.doc.toString();
  const ranges: Array<{ from: number; to: number }> = [];
  const text = view.state.selection.ranges
    .map((range) => {
      const visibleRanges = textBufferVisibleClipboardRanges(markdown, analysis, range);
      ranges.push(...visibleRanges);
      return visibleRanges.map((visibleRange) => {
        const selected = view.state.sliceDoc(visibleRange.from, visibleRange.to);
        const block = codeBlockForSelection(view.state, visibleRange, analysis);
        return block ? normalizeTextBufferCodeBlockSelectionText(selected, block) : selected;
      }).join("");
    })
    .join("\n");
  return { text, ranges };
}

type TextBufferCutSnapshot = ReturnType<typeof textBufferClipboardSelection> & {
  markdown: string;
  selection: EditorSelection;
};

const textBufferCutInFlight = new WeakSet<EditorView>();

function captureTextBufferCut(view: EditorView) {
  const clipboardSelection = textBufferClipboardSelection(view);
  if (!clipboardSelection.text) return null;
  return {
    ...clipboardSelection,
    markdown: view.state.doc.toString(),
    selection: view.state.selection,
  } satisfies TextBufferCutSnapshot;
}

function deleteTextBufferClipboardSelection(
  view: EditorView,
  ranges: Array<{ from: number; to: number }>,
) {
  const analysis = analyzeTextBufferState(view.state);
  const safeRanges = textBufferSafeCutRanges(view.state.doc.toString(), analysis, ranges);
  if (!safeRanges.length) return false;
  view.dispatch({
    changes: safeRanges.map((range) => ({ ...range, insert: "" })),
    selection: { anchor: safeRanges[0].from },
    annotations: richFenceMutation.of(true),
    userEvent: "delete.cut",
  });
  view.focus();
  return true;
}

async function commitTextBufferCut(
  view: EditorView,
  snapshot: TextBufferCutSnapshot,
  allowWithoutDesktopClipboard = false,
) {
  if (textBufferCutInFlight.has(view)) return false;
  textBufferCutInFlight.add(view);

  try {
    if (hasDesktopClipboardRuntime()) {
      if (!await writeDesktopClipboardText(snapshot.text)) return false;
    } else if (!allowWithoutDesktopClipboard) {
      return false;
    }

    if (
      view.state.doc.toString() !== snapshot.markdown
      || !view.state.selection.eq(snapshot.selection)
      || textBufferClipboardSelection(view).text !== snapshot.text
    ) return false;

    return deleteTextBufferClipboardSelection(view, snapshot.ranges);
  } finally {
    textBufferCutInFlight.delete(view);
  }
}

let textBufferPerformanceMeasureId = 0;

function measureTextBufferOperation<T>(name: string, operation: () => T): T {
  const id = textBufferPerformanceMeasureId;
  textBufferPerformanceMeasureId += 1;
  const startMark = `${name}:start:${id}`;
  const endMark = `${name}:end:${id}`;
  performance.mark(startMark);
  try {
    return operation();
  } finally {
    performance.mark(endMark);
    performance.measure(name, startMark, endMark);
    performance.clearMarks(startMark);
    performance.clearMarks(endMark);
  }
}

function replaceSelection(view: EditorView, text: string, userEvent?: string) {
  const replacement = view.state.replaceSelection(text);
  view.dispatch(userEvent
    ? { ...replacement, annotations: Transaction.userEvent.of(userEvent) }
    : replacement);
  view.focus();
}

function wrapSelection(view: EditorView, prefix: string, suffix: string, placeholder: string) {
  const state = view.state;
  view.dispatch(state.changeByRange((range) => {
    const selection = state.sliceDoc(range.from, range.to);
    const body = selection || placeholder;
    const insert = `${prefix}${body}${suffix}`;
    const anchor = range.from + prefix.length;
    const head = anchor + body.length;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.range(anchor, head),
    };
  }));
  view.focus();
}

function selectedLineNumbers(state: EditorState) {
  const lines = new Set<number>();
  state.selection.ranges.forEach((range) => {
    const fromLine = state.doc.lineAt(range.from).number;
    const toLine = state.doc.lineAt(Math.max(range.from, range.to - (range.empty ? 0 : 1))).number;
    for (let line = fromLine; line <= toLine; line += 1) lines.add(line);
  });
  return [...lines].sort((a, b) => a - b);
}

function withoutMarkdownBlockPrefix(text: string) {
  return text
    .replace(/^\s{0,3}#{1,6}\s+/, "")
    .replace(/^\s*>\s?/, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "");
}

function replaceSelectedLines(view: EditorView, transform: (text: string, index: number) => string) {
  const state = view.state;
  const changes = selectedLineNumbers(state).map((lineNumber, index) => {
    const line = state.doc.line(lineNumber);
    return {
      from: line.from,
      to: line.to,
      insert: transform(line.text, index),
    };
  });
  if (!changes.length) return false;
  view.dispatch({ changes });
  view.focus();
  return true;
}

function markdownLinkAt(state: EditorState, pos: number) {
  const line = state.doc.lineAt(pos);
  const analysis = analyzeTextBufferState(state);
  const analyzedLine = analysis.lines[line.number - 1];
  if (analyzedLine?.kind === "code" || analyzedLine?.kind === "codeFence") return null;
  const links = scanTextBufferInlineLinks(line.text, line.from);
  for (const link of links) {
    if (pos < link.from || pos > link.to) continue;
    return {
      from: link.from,
      to: link.to,
      href: link.href,
    };
  }
  return null;
}

function handleTextBufferArrowDown(view: EditorView) {
  if (!view.state.selection.main.empty) return false;
  const pos = view.state.selection.main.head;
  const context = codeBlockContextAtPosition(view.state, pos);
  if (!context) return false;
  if (isTextBufferCodeBlockEmpty(context.block)) {
    if (!materializeEmptyCodeBlock(view, context.block)) return false;
    window.requestAnimationFrame(() => {
      const currentBlock = currentCodeBlockByOpener(view, context.block.openerFrom);
      if (currentBlock) focusLanguageControl(view, currentBlock);
    });
    return true;
  }
  if (!isTextBufferCodeBlockPhysicalLastLine(context.block, context.line.number)) return false;
  return focusLanguageControl(view, context.block);
}

function handleTextBufferArrowUp(view: EditorView) {
  if (!view.dom.classList.contains("serein-buffer-rich")) return false;
  if (!view.state.selection.main.empty) return false;
  if (removePendingTextBufferCodeBlockTopLine(view)) return true;

  const pos = view.state.selection.main.head;
  const context = codeBlockContextAtPosition(view.state, pos);
  if (!context || isTextBufferCodeBlockEmpty(context.block)) return false;
  const line = textBufferCodeBlockLineState(context.analysis, context.block, context.line.number);
  if (!line.isFirstLine) return false;
  return insertTextBufferCodeBlockTopLine(view, context.block);
}

function lineTextWithoutStructureMarker(text: string) {
  return stripTextBufferContainerPrefix(text);
}

function handleTextBufferEnter(view: EditorView) {
  if (!view.state.selection.main.empty) return false;
  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  const pendingFenceLines = view.state.field(typedPendingFenceLines, false) ?? [];
  const pendingOpener = pendingFenceLines.includes(line.from)
    ? openingMarkdownFence(line.text)
    : null;
  if (
    view.dom.classList.contains("serein-buffer-rich")
    && pendingOpener
    && pos === line.to
  ) {
    const prefix = line.text.slice(0, pendingOpener.prefixLength);
    const closer = `${prefix}${pendingOpener.char.repeat(pendingOpener.length)}`;
    view.dispatch({
      changes: {
        from: line.to,
        insert: `\n${prefix}\n${closer}`,
      },
      selection: { anchor: line.to + 1 + prefix.length },
      annotations: [
        richFenceMutation.of(true),
        confirmTypedFence.of(line.from),
      ],
      userEvent: "input.type",
    });
    return true;
  }
  const context = codeBlockContextAtPosition(view.state, pos);
  if (
    context
    && context.line.kind === "codeFence"
    && pos >= context.block.closerFrom
  ) {
    return exitCodeBlockAfter(view, context.block);
  }
  if (context && isTextBufferCodeBlockEmpty(context.block)) {
    return materializeEmptyCodeBlock(view, context.block);
  }
  if (
    context
    && shouldExitTextBufferCodeBlockOnEnter(context.analysis, context.block, context.line.number)
  ) {
    return exitCodeBlockAfter(view, context.block);
  }

  if (
    view.dom.classList.contains("serein-buffer-rich")
    && !context
    && pos === line.to
  ) {
    const markdown = view.state.doc.toString();
    const frontmatter = splitYamlFrontmatter(markdown);
    const frontmatterEnd = frontmatter ? markdown.length - frontmatter.body.length : 0;
    const tableMarkdown = line.from >= frontmatterEnd
      ? textBufferTableCompletionFromPipeRow(line.text)
      : null;
    if (tableMarkdown) {
      pendingTableFocus.set(view, {
        tableFrom: line.from,
        row: 1,
        column: 0,
        scrollLeft: 0,
      });
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: tableMarkdown },
        selection: { anchor: line.from + tableMarkdown.length },
        annotations: Transaction.userEvent.of("input.table.create"),
      });
      return true;
    }
  }

  const analysis = context?.analysis ?? analyzeTextBufferState(view.state);
  const analyzedLine = analysis.lines.find((item) => item.number === line.number);
  if (!analyzedLine || (analyzedLine.kind !== "list" && analyzedLine.kind !== "blockquote")) return false;
  if (lineTextWithoutStructureMarker(line.text).trim()) return false;

  view.dispatch({
    changes: { from: line.from, to: line.to, insert: "" },
    selection: { anchor: line.from },
  });
  return true;
}

function handleTextBufferBackspace(view: EditorView) {
  if (!view.dom.classList.contains("serein-buffer-rich")) return false;
  if (!view.state.selection.main.empty) return false;

  const pos = view.state.selection.main.head;
  const context = codeBlockContextAtPosition(view.state, pos);
  if (!context || !isTextBufferCodeBlockBlank(view.state.doc.toString(), context.block)) return false;
  if (pos < context.block.contentFrom || pos > context.block.contentTo) return false;

  const replacement = context.block.containerPrefix;
  view.dispatch({
    changes: {
      from: context.block.from,
      to: context.block.to,
      insert: replacement,
    },
    selection: { anchor: context.block.from + replacement.length },
    annotations: richFenceMutation.of(true),
    userEvent: "delete.backward",
  });
  return true;
}

function selectAllTextBuffer(view: EditorView) {
  const markdown = view.state.doc.toString();
  const selection = view.state.selection.main;
  const analysis = analyzeTextBufferState(view.state);
  const range = textBufferSmartSelectAllRange(
    markdown,
    analysis,
    { from: selection.from, to: selection.to, head: selection.head },
  );

  if (range.from === range.to) {
    const previousStage = emptySemanticSelectAllStages.get(view);
    if (previousStage?.state === view.state && previousStage.position === range.from) {
      emptySemanticSelectAllStages.delete(view);
      view.dispatch({ selection: EditorSelection.range(0, view.state.doc.length) });
      return true;
    }

    view.dispatch({ selection: EditorSelection.range(range.from, range.to) });
    emptySemanticSelectAllStages.set(view, { state: view.state, position: range.from });
    return true;
  }

  emptySemanticSelectAllStages.delete(view);
  view.dispatch({ selection: EditorSelection.range(range.from, range.to) });
  return true;
}

function selectionClampedToDocument(selection: EditorSelection, documentLength: number) {
  const clamp = (position: number) => Math.max(0, Math.min(position, documentLength));
  return EditorSelection.create(
    selection.ranges.map((range) => EditorSelection.range(clamp(range.anchor), clamp(range.head))),
    selection.mainIndex,
  );
}

function extensionsForMode(options: TextBufferDecorationOptions) {
  return [
    textBufferDecorationOptions.of(options),
    ...(options.mode === "plain" ? [lineNumbers(), highlightActiveLineGutter(), highlightActiveLine()] : []),
    ...(options.mode === "rich" ? [protectRichCodeFenceLines(), emptyCodeBlockInputHandler()] : []),
    syntaxHighlighting(textBufferCodeHighlightStyle),
    EditorView.editorAttributes.of({
      class: options.mode === "rich" ? "serein-buffer-rich" : "serein-buffer-plain",
    }),
  ];
}

function markdownHeadingTargetFromPayload(payload: string | undefined): MarkdownHeadingTarget | null {
  if (!payload) return null;
  try {
    const value = JSON.parse(payload) as Partial<MarkdownHeadingTarget>;
    if (
      !Number.isInteger(value.level)
      || Number(value.level) < 1
      || Number(value.level) > 6
      || typeof value.text !== "string"
      || !Number.isInteger(value.occurrence)
      || Number(value.occurrence) < 0
      || !Number.isInteger(value.fallbackIndex)
      || Number(value.fallbackIndex) < 0
    ) return null;
    return value as MarkdownHeadingTarget;
  } catch {
    return null;
  }
}

const textBufferRevealMeasureKey = {};

function revealTextBufferRange(view: EditorView, from: number, to: number) {
  const scrollSurface = view.dom.closest<HTMLElement>(".editor-surface");
  view.focus();
  view.dispatch({ selection: EditorSelection.range(from, to) });
  if (!scrollSurface) return;
  view.requestMeasure({
    key: textBufferRevealMeasureKey,
    read(measuredView) {
      const surfaceRect = scrollSurface.getBoundingClientRect();
      const targetBlock = measuredView.lineBlockAt(from);
      const targetTop = measuredView.documentTop + targetBlock.top;
      return Math.max(0, scrollSurface.scrollTop + targetTop - surfaceRect.top - 56);
    },
    write(scrollTop) {
      scrollSurface.scrollTop = scrollTop;
    },
  });
}

async function runTextBufferCommand(view: EditorView, command: EditorCommandSignal) {
  switch (command.action) {
    case "undo":
      return undoTextBuffer(view);
    case "redo":
      return redoTextBuffer(view);
    case "copy": {
      const { text } = textBufferClipboardSelection(view);
      if (!text) return false;
      return writeDesktopClipboardText(text);
    }
    case "cut": {
      const snapshot = captureTextBufferCut(view);
      if (!snapshot) return false;
      return commitTextBufferCut(view, snapshot);
    }
    case "paste": {
      const text = await readDesktopClipboardText();
      if (!text) return false;
      replaceSelection(view, text);
      return true;
    }
    case "selectAllSmart":
      selectAllTextBuffer(view);
      view.focus();
      return true;
    case "revealHeading": {
      const requested = markdownHeadingTargetFromPayload(command.payload);
      if (!requested) return false;
      const target = resolveMarkdownHeading(view.state.doc.toString(), requested);
      if (!target) return false;
      revealTextBufferRange(view, target.start, target.end);
      return true;
    }
    case "revealSourceRange": {
      const rawFrom = Number(command.payload);
      const rawTo = Number(command.alt);
      if (!Number.isFinite(rawFrom)) return false;
      const from = Math.max(0, Math.min(Math.trunc(rawFrom), view.state.doc.length));
      const to = Number.isFinite(rawTo)
        ? Math.max(from, Math.min(Math.trunc(rawTo), view.state.doc.length))
        : from;
      revealTextBufferRange(view, from, to);
      return true;
    }
    case "bold":
      wrapSelection(view, "**", "**", "bold");
      return true;
    case "italic":
      wrapSelection(view, "*", "*", "italic");
      return true;
    case "inlineCode":
      wrapSelection(view, "`", "`", "code");
      return true;
    case "strike":
      wrapSelection(view, "~~", "~~", "strike");
      return true;
    case "link":
      wrapSelection(view, "[", `](${command.payload ?? ""})`, "link");
      return true;
    case "image":
      replaceSelection(view, `![${command.alt ?? "image"}](${command.payload ?? ""})`);
      return true;
    case "heading1":
    case "heading2":
    case "heading3": {
      const level = command.action === "heading1" ? 1 : command.action === "heading2" ? 2 : 3;
      return replaceSelectedLines(view, (text) => `${"#".repeat(level)} ${withoutMarkdownBlockPrefix(text) || "Heading"}`);
    }
    case "paragraph":
      return replaceSelectedLines(view, (text) => withoutMarkdownBlockPrefix(text));
    case "blockquote":
      return replaceSelectedLines(view, (text) => `> ${text.replace(/^\s*>\s?/, "")}`);
    case "bulletList":
      return replaceSelectedLines(view, (text) => `- ${withoutMarkdownBlockPrefix(text)}`);
    case "orderedList":
      return replaceSelectedLines(view, (text, index) => `${index + 1}. ${withoutMarkdownBlockPrefix(text)}`);
    case "codeBlock": {
      const selection = textBufferClipboardSelection(view).text;
      replaceSelection(view, selection ? `\`\`\`\n${selection}\n\`\`\`` : "```\n\n```");
      return true;
    }
    case "table":
      replaceSelection(view, "| Column | Value |\n| --- | --- |\n|  |  |");
      return true;
    default:
      return false;
  }
}

function imageMarkdown(images: Array<{ src: string; alt: string }>) {
  return images.map((image) => `![${image.alt || "image"}](${image.src})`).join("\n");
}

export function MarkdownTextBufferEditor({
  t,
  activeNote,
  editorMode,
  command,
  onCommandResult,
  onChange,
  onOpenLink,
  wikiLinkSuggestions,
  onCreateWikiLink,
  onImportImages,
  imagePreviewMap,
  showImageSourceOnFocus,
  showFrontmatterTagRow,
}: MarkdownTextBufferEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const modeCompartmentRef = useRef(new Compartment());
  const latestMarkdownRef = useRef(activeNote.markdown);
  const activeNoteIdRef = useRef(activeNote.id);
  const createStateRef = useRef<((markdown: string, options: TextBufferDecorationOptions) => EditorState) | null>(null);
  const lastCommandIdRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  const onOpenLinkRef = useRef(onOpenLink);
  const onImportImagesRef = useRef(onImportImages);
  const onCreateWikiLinkRef = useRef(onCreateWikiLink);
  const [currentMarkdown, setCurrentMarkdown] = useState(activeNote.markdown);

  onChangeRef.current = onChange;
  onOpenLinkRef.current = onOpenLink;
  onImportImagesRef.current = onImportImages;
  onCreateWikiLinkRef.current = onCreateWikiLink;
  const frontmatter = useMemo(() => splitYamlFrontmatter(currentMarkdown), [currentMarkdown]);
  const frontmatterTags = frontmatter ? splitYamlPropertyValue(frontmatter.properties.find((property) => property.key.toLowerCase() === "tags")?.value ?? "").join(", ") : "";
  const frontmatterAliases = frontmatter ? splitYamlPropertyValue(frontmatter.properties.find((property) => property.key.toLowerCase() === "aliases")?.value ?? "").join(", ") : "";
  const frontmatterStatus = frontmatter?.properties.find((property) => property.key.toLowerCase() === "status")?.value.trim() ?? "";
  const showFrontmatterPanel = Boolean(frontmatter && showFrontmatterTagRow && editorMode === "rich");
  const decorationOptions = useMemo<TextBufferDecorationOptions>(() => ({
    mode: editorMode,
    imagePreviewMap,
    showImageSourceOnFocus,
    showFrontmatterTagRow,
  }), [editorMode, imagePreviewMap, showFrontmatterTagRow, showImageSourceOnFocus]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const modeCompartment = modeCompartmentRef.current;
    const updateListener = EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      if (update.transactions.some((transaction) => transaction.annotation(externalMarkdownUpdate))) return;
      const nextMarkdown = update.state.doc.toString();
      latestMarkdownRef.current = nextMarkdown;
      setCurrentMarkdown(nextMarkdown);
      onChangeRef.current(nextMarkdown);
    });

    const domHandlers = EditorView.domEventHandlers({
      copy(event, view) {
        if (view.state.selection.main.empty || !event.clipboardData) return false;
        const { text } = textBufferClipboardSelection(view);
        event.preventDefault();
        event.stopPropagation();
        event.clipboardData.setData("text/plain", text);
        void writeDesktopClipboardText(text);
        return true;
      },
      cut(event, view) {
        if (view.state.selection.main.empty || !event.clipboardData) return false;
        const snapshot = captureTextBufferCut(view);
        if (!snapshot) return false;
        event.preventDefault();
        event.stopPropagation();
        event.clipboardData.setData("text/plain", snapshot.text);
        void commitTextBufferCut(view, snapshot, true).catch(() => undefined);
        return true;
      },
      mousedown(event, view) {
        const target = event.target instanceof HTMLElement ? event.target : null;
        const wikiLink = target?.closest<HTMLElement>(".serein-buffer-wiki-link[data-href]");
        if (wikiLink?.dataset.href) {
          event.preventDefault();
          return onOpenLinkRef.current(wikiLink.dataset.href);
        }

        if (!(event.ctrlKey || event.metaKey)) return false;
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos === null) return false;
        const link = markdownLinkAt(view.state, pos);
        if (!link?.href) return false;
        event.preventDefault();
        return onOpenLinkRef.current(link.href);
      },
      paste(event, view) {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (files.length) {
          event.preventDefault();
          const noteId = activeNoteIdRef.current;
          void onImportImagesRef.current(files).then((images) => {
            if (activeNoteIdRef.current !== noteId) return;
            const markdown = imageMarkdown(images);
            if (markdown) replaceSelection(view, markdown, "input.paste.image");
          });
          return true;
        }

        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (!text) return false;
        event.preventDefault();
        event.stopPropagation();
        measureTextBufferOperation("serein/editor/paste-text", () => {
          view.dispatch(textBufferPasteTransaction(view.state, text));
          view.focus();
        });
        return true;
      },
      dragover(event) {
        if (!Array.from(event.dataTransfer?.types ?? []).includes("Files")) return false;
        event.preventDefault();
        return true;
      },
      drop(event, view) {
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (!files.length) return false;
        event.preventDefault();
        const noteId = activeNoteIdRef.current;
        void onImportImagesRef.current(files).then((images) => {
          if (activeNoteIdRef.current !== noteId) return;
          const markdown = imageMarkdown(images);
          if (markdown) replaceSelection(view, markdown);
        });
        return true;
      },
    });

    createStateRef.current = (markdown: string, options: TextBufferDecorationOptions) => EditorState.create({
      doc: markdown,
      extensions: [
        history(),
        markdownSupport({ base: markdownLanguage, codeLanguages: codeBlockLanguageData }),
        Prec.highest(keymap.of([
          { key: "Enter", run: handleTextBufferEnter },
          { key: "Backspace", run: handleTextBufferBackspace },
        ])),
        keymap.of([
          { key: "Mod-a", run: selectAllTextBuffer },
          { key: "Mod-z", run: undoTextBuffer },
          { key: "Mod-y", run: redoTextBuffer },
          { key: "Mod-Shift-z", run: redoTextBuffer },
          { key: "ArrowUp", run: handleTextBufferArrowUp },
          { key: "ArrowDown", run: handleTextBufferArrowDown },
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        EditorView.lineWrapping,
        updateListener,
        domHandlers,
        typedPendingFenceLines,
        typoraDocumentDecorations,
        typoraActiveDecorations,
        typoraInlineDecorations,
        modeCompartment.of(extensionsForMode(options)),
      ],
    });

    const view = new EditorView({
      parent: host,
      state: createStateRef.current(latestMarkdownRef.current, decorationOptions),
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      if (viewRef.current === view) viewRef.current = null;
      createStateRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: modeCompartmentRef.current.reconfigure(extensionsForMode(decorationOptions) as Extension),
    });
  }, [decorationOptions]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    if (activeNote.id !== activeNoteIdRef.current) {
      const createState = createStateRef.current;
      if (!createState) return;
      activeNoteIdRef.current = activeNote.id;
      latestMarkdownRef.current = activeNote.markdown;
      setCurrentMarkdown(activeNote.markdown);
      measureTextBufferOperation("serein/editor/open-note", () => {
        view.setState(createState(activeNote.markdown, decorationOptions));
      });
      return;
    }

    const currentMarkdown = view.state.doc.toString();
    if (activeNote.markdown === currentMarkdown) return;
    latestMarkdownRef.current = activeNote.markdown;
    setCurrentMarkdown(activeNote.markdown);
    measureTextBufferOperation("serein/editor/sync-markdown", () => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: activeNote.markdown },
        selection: selectionClampedToDocument(view.state.selection, activeNote.markdown.length),
        annotations: [
          externalMarkdownUpdate.of(true),
          Transaction.addToHistory.of(false),
        ],
      });
    });
  }, [activeNote.id, activeNote.markdown, decorationOptions]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !command || lastCommandIdRef.current === command.id) return;
    lastCommandIdRef.current = command.id;
    void runTextBufferCommand(view, command).then((handled) => {
      onCommandResult?.({ command, handled });
    });
  }, [command, onCommandResult]);

  const updateFrontmatterProperty = (key: "tags" | "aliases" | "status", value: string) => {
    const view = viewRef.current;
    if (!view) return;

    const currentMarkdown = view.state.doc.toString();
    const currentFrontmatter = splitYamlFrontmatter(currentMarkdown);
    if (!currentFrontmatter) return;

    const nextValue = key === "status" ? value : yamlListValueFromInput(value);
    const nextContent = setYamlPropertyValue(currentFrontmatter.content, key, nextValue);
    const nextMarkdown = composeMarkdownWithFrontmatter(createYamlFrontmatter(nextContent), currentFrontmatter.body);
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: nextMarkdown },
      selection: selectionClampedToDocument(view.state.selection, nextMarkdown.length),
      annotations: richFenceMutation.of(true),
    });
  };

  return (
    <div className={showFrontmatterPanel ? "serein-text-buffer-shell show-frontmatter-row" : "serein-text-buffer-shell"}>
      {showFrontmatterPanel ? (
        <div className="serein-frontmatter-panel" data-keyboard-reveal="true" aria-label={t.editor.frontmatter.properties}>
          <div className="serein-frontmatter-strip">
            <input
              key={`tags:${frontmatterTags}`}
              className="serein-frontmatter-inline-input serein-frontmatter-tags-input"
              defaultValue={frontmatterTags}
              aria-label={t.editor.frontmatter.tags}
              onBlur={(event) => updateFrontmatterProperty("tags", event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                updateFrontmatterProperty("tags", event.currentTarget.value);
                event.currentTarget.blur();
              }}
            />
            <button
              type="button"
              className="serein-frontmatter-token"
              data-active={frontmatterStatus.toLowerCase() === "active" ? "true" : "false"}
              title={frontmatterStatus.toLowerCase() === "active" ? t.editor.frontmatter.active : t.editor.frontmatter.inactive}
              onClick={() => updateFrontmatterProperty("status", frontmatterStatus.toLowerCase() === "active" ? "inactive" : "active")}
            >
              <span className="serein-frontmatter-token-edge">--</span>
              <span className="serein-frontmatter-token-core">{frontmatterStatus || "status"}</span>
              <span className="serein-frontmatter-token-edge">--</span>
            </button>
            <div className="serein-frontmatter-alias-cell">
              <input
                key={`aliases:${frontmatterAliases}`}
                className="serein-frontmatter-inline-input serein-frontmatter-aliases-input"
                defaultValue={frontmatterAliases}
                aria-label={t.editor.frontmatter.aliases}
                onBlur={(event) => updateFrontmatterProperty("aliases", event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  updateFrontmatterProperty("aliases", event.currentTarget.value);
                  event.currentTarget.blur();
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
      <div
        ref={hostRef}
        className="serein-text-buffer-editor"
        data-mode={editorMode}
        data-note-id={activeNote.id}
      />
    </div>
  );
}
