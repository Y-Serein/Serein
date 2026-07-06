import { useEffect, useRef, useState } from "react";
import type { FocusEvent as ReactFocusEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { LanguageDescription } from "@codemirror/language";
import type { LanguageSupport } from "@codemirror/language";
import { languages as codeBlockLanguageData } from "@codemirror/language-data";
import { classHighlighter, highlightTree } from "@lezer/highlight";
import { commandsCtx, defaultValueCtx, Editor, editorViewCtx, rootCtx, serializerCtx } from "@milkdown/kit/core";
import { imageInlineComponent } from "@milkdown/kit/component/image-inline";
import { tableBlock, tableBlockConfig } from "@milkdown/kit/component/table-block";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { history, redoCommand, undoCommand } from "@milkdown/kit/plugin/history";
import { upload, uploadConfig } from "@milkdown/kit/plugin/upload";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import {
  createCodeBlockCommand,
  insertImageCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  toggleStrongCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from "@milkdown/kit/preset/commonmark";
import {
  commands as gfmCommands,
  inputRules as gfmInputRules,
  insertTableCommand,
  keymap as gfmKeymap,
  pasteRules as gfmPasteRules,
  plugins as gfmPlugins,
  remarkGFMPlugin,
  schema as gfmSchema,
  strikethroughSchema,
  toggleStrikethroughCommand,
} from "@milkdown/kit/preset/gfm";
import { markRule } from "@milkdown/kit/prose";
import { lift, setBlockType } from "@milkdown/kit/prose/commands";
import { liftListItem, sinkListItem, splitListItem } from "@milkdown/kit/prose/schema-list";
import { AllSelection, Plugin, PluginKey, Selection, TextSelection } from "@milkdown/kit/prose/state";
import type { Command } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $inputRule, $prose, $shortcut, replaceAll } from "@milkdown/kit/utils";
import { Milkdown, MilkdownProvider, useEditor, useInstance } from "@milkdown/react";
import type { EditorCommandResult, EditorCommandSignal } from "../domain/model";
import type { YamlFrontmatterParts } from "../shared/markdown";
import {
  composeMarkdownWithFrontmatter,
  createYamlFrontmatter,
  normalizeRichMarkdownEscapes,
  setYamlPropertyValue,
  splitYamlFrontmatter,
  splitYamlPropertyValue,
  yamlListValueFromInput,
} from "../shared/markdown";
import { codeBlockConfig } from "./codeBlockConfig";
import { readDesktopClipboardText, writeDesktopClipboardText } from "../services/clipboard";
import { sereinCodeBlockView } from "./sereinCodeBlockView";

type MilkdownEditorProps = {
  markdown: string;
  onChange: (markdown: string) => void;
  onRichMarkdownBaseline: (markdown: string) => void;
  command: EditorCommandSignal | null;
  onCommandResult: (result: EditorCommandResult) => void;
  onOpenLink: (href: string) => boolean;
  wikiLinkSuggestions: WikiLinkSuggestion[];
  onCreateWikiLink: (target: string) => Promise<string | null>;
  onImportImages: (files: File[]) => Promise<Array<{ src: string; alt: string }>>;
  imagePreviewMap: Record<string, string>;
  showImageSourceOnFocus: boolean;
  normalizeWindowsImagePaths: boolean;
  showFrontmatterTagRow: boolean;
  frontmatterLabels: {
    properties: string;
    edit: string;
    empty: string;
    tags: string;
    aliases: string;
    status: string;
    active: string;
    inactive: string;
  };
};

export type WikiLinkSuggestion = {
  target: string;
  label: string;
  description: string;
};

type LinkRange = {
  from: number;
  to: number;
  href: string;
  attrs: Record<string, unknown>;
};

type ExpandedLinkRange = {
  from: number;
  to: number;
};

type PendingCodeBlockTopLine = {
  from: number;
};

type WikiSuggestState = {
  from: number;
  to: number;
  query: string;
  x: number;
  y: number;
  selectedIndex: number;
};

type MarkdownLinkSource = {
  start: number;
  end: number;
  label: string;
  href: string;
};

const codeBlockLanguages = codeBlockLanguageData.map((language) => {
  if (language.name !== "Shell") return language;
  return LanguageDescription.of({
    name: "bash",
    alias: ["bash", "sh", "zsh", "shell"],
    extensions: ["sh", "ksh", "bash"],
    load: () => language.load(),
  });
});

const codeBlockLanguageByName = new Map<string, LanguageDescription>();
codeBlockLanguages.forEach((language) => {
  codeBlockLanguageByName.set(language.name.toLocaleLowerCase(), language);
  language.alias.forEach((alias) => {
    codeBlockLanguageByName.set(alias.toLocaleLowerCase(), language);
  });
});

const loadedCodeBlockLanguages = new Map<string, LanguageSupport | null>();
const loadingCodeBlockLanguages = new Map<string, Promise<LanguageSupport | null>>();

function codeBlockLanguageDescription(languageName: string) {
  return codeBlockLanguageByName.get(languageName.trim().toLocaleLowerCase()) ?? null;
}

function codeBlockLanguageKey(languageName: string) {
  return codeBlockLanguageDescription(languageName)?.name.toLocaleLowerCase() ?? "";
}

function loadedCodeBlockLanguageSupport(languageName: string) {
  const key = codeBlockLanguageKey(languageName);
  if (!key) return null;
  return loadedCodeBlockLanguages.get(key);
}

function requestCodeBlockLanguage(languageName: string, onLoaded: () => void) {
  const language = codeBlockLanguageDescription(languageName);
  if (!language) return;

  const key = language.name.toLocaleLowerCase();
  if (loadedCodeBlockLanguages.has(key) || loadingCodeBlockLanguages.has(key)) return;

  const promise = (language.support ? Promise.resolve(language.support) : language.load())
    .then((support) => support ?? null)
    .catch((error: unknown) => {
      console.warn("Failed to load code block language", error);
      return null;
    });

  loadingCodeBlockLanguages.set(key, promise);
  promise.then((support) => {
    loadingCodeBlockLanguages.delete(key);
    loadedCodeBlockLanguages.set(key, support);
    onLoaded();
  });
}

function collectCodeBlockLanguages(state: { doc: { descendants: (callback: (node: { type: { name: string }; attrs: Record<string, unknown> }) => boolean | void) => void } }) {
  const languages = new Set<string>();
  state.doc.descendants((node) => {
    if (node.type.name !== "code_block") return true;
    const languageName = String(node.attrs.language ?? "").trim();
    if (languageName) languages.add(languageName);
    return false;
  });
  return languages;
}

const tableButtonIcons = {
  add_row: '<svg viewBox="0 0 16 16"><path d="M3 3.5h10M3 8h10M3 12.5h10M8 5.5v5M5.5 8h5"/></svg>',
  add_col: '<svg viewBox="0 0 16 16"><path d="M3.5 3v10M8 3v10M12.5 3v10M5.5 8h5M8 5.5v5"/></svg>',
  delete_row: '<svg viewBox="0 0 16 16"><path d="M3 5h10M5.5 3.5l5 5M10.5 3.5l-5 5M3 11h10"/></svg>',
  delete_col: '<svg viewBox="0 0 16 16"><path d="M5 3v10M3.5 5.5l5 5M8.5 5.5l-5 5M11 3v10"/></svg>',
  align_col_left: '<svg viewBox="0 0 16 16"><path d="M3 4h10M3 8h7M3 12h9"/></svg>',
  align_col_center: '<svg viewBox="0 0 16 16"><path d="M3 4h10M4.5 8h7M3.5 12h9"/></svg>',
  align_col_right: '<svg viewBox="0 0 16 16"><path d="M3 4h10M6 8h7M4 12h9"/></svg>',
  col_drag_handle: '<svg viewBox="0 0 16 16"><path d="M5 4h6M5 8h6M5 12h6"/></svg>',
  row_drag_handle: '<svg viewBox="0 0 16 16"><path d="M4 5h8M4 8h8M4 11h8"/></svg>',
};

function renderTableButtonIcon(renderType: keyof typeof tableButtonIcons) {
  return tableButtonIcons[renderType];
}

function markdownImageText(src: string, alt: string) {
  const cleanAlt = alt.replace(/[\]\n\r]/g, " ").trim() || "image";
  const cleanSrc = /[\s\\()]/.test(src) ? `<${src}>` : src;
  return `![${cleanAlt}](${cleanSrc})`;
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

function spaceEntitiesToSpaces(value: string) {
  const matches = value.match(/&#x20;|&#32;/g);
  return matches ? " ".repeat(matches.length) : "";
}

function normalizeRichSerializedSpaces(markdown: string) {
  return markdown
    .replace(/(^|\n)(#{1,6}\s+)((?:&#x20;|&#32;)+)/g, (_, prefix: string, marker: string, spaces: string) => (
      `${prefix}${marker}${spaceEntitiesToSpaces(spaces)}`
    ))
    .replace(/(^|\n)((?:[-*+]|\d+[.)])\s+)((?:&#x20;|&#32;)+)/g, (_, prefix: string, marker: string, spaces: string) => (
      `${prefix}${marker}${spaceEntitiesToSpaces(spaces)}`
    ))
    .replace(/(^|\n)> ((?:&#x20;|&#32;)+)/g, (_, prefix: string, spaces: string) => (
      `${prefix}> ${spaceEntitiesToSpaces(spaces)}`
    ))
    .replace(/(^|\n)((?:&#x20;|&#32;)+)/g, (_, prefix: string, spaces: string) => (
      `${prefix}${spaceEntitiesToSpaces(spaces)}`
    ));
}

function normalizeWindowsImageMarkdown(markdown: string) {
  return markdown.replace(/!\[([^\]\n]*)]\(((?:[A-Za-z]:\\|\\\\)[^)\n]*)\)/g, (_, alt: string, source: string) => (
    markdownImageText(source.trim(), alt)
  ));
}

function displayFrontmatterValue(property: YamlFrontmatterParts["properties"][number]) {
  if (property.type === "list" || property.key.toLowerCase() === "tags" || property.key.toLowerCase() === "aliases") {
    return splitYamlPropertyValue(property.value).join(", ");
  }

  return property.value;
}

function frontmatterPropertyValue(frontmatter: YamlFrontmatterParts | null, key: string) {
  return frontmatter?.properties.find((property) => property.key.toLowerCase() === key.toLowerCase())?.value ?? "";
}

function normalizeRichFrontmatterBody(body: string) {
  return body.replace(/^\n+/, "");
}

function editorDocumentFromMarkdown(markdown: string, normalizeWindowsImagePaths: boolean) {
  const normalizedMarkdown = normalizeWindowsImagePaths ? normalizeWindowsImageMarkdown(markdown) : markdown;
  const frontmatter = splitYamlFrontmatter(normalizedMarkdown);
  const bodyMarkdown = frontmatter ? normalizeRichFrontmatterBody(frontmatter.body) : normalizedMarkdown;
  return {
    frontmatter,
    bodyMarkdown,
    fullMarkdown: frontmatter ? composeMarkdownWithFrontmatter(frontmatter.frontmatter, bodyMarkdown) : bodyMarkdown,
  };
}

type RichSelectionSnapshot = {
  anchor: number;
  head: number;
};

function richSelectionSnapshot(view: EditorView): RichSelectionSnapshot {
  return {
    anchor: view.state.selection.anchor,
    head: view.state.selection.head,
  };
}

function restoreRichSelectionSnapshot(view: EditorView, snapshot: RichSelectionSnapshot) {
  const maxPos = view.state.doc.content.size;
  const clampPosition = (position: number) => Math.max(0, Math.min(maxPos, position));
  const anchor = clampPosition(snapshot.anchor);
  const head = clampPosition(snapshot.head);

  let nextSelection: Selection | null = null;
  try {
    nextSelection = anchor === head
      ? TextSelection.near(view.state.doc.resolve(anchor), 1)
      : TextSelection.create(view.state.doc, anchor, head);
  } catch {
    try {
      nextSelection = Selection.near(view.state.doc.resolve(anchor), anchor <= head ? 1 : -1);
    } catch {
      nextSelection = Selection.atStart(view.state.doc);
    }
  }

  if (!view.state.selection.eq(nextSelection)) {
    view.dispatch(view.state.tr.setSelection(nextSelection));
  }
}

function selectionStartsAtDocumentTop(view: EditorView) {
  const beforeSelection = view.state.doc.textBetween(0, view.state.selection.from, "\n", "\n");
  return beforeSelection.trim().length === 0;
}

function selectionIsInFirstTextBlock(view: EditorView) {
  const { $from } = view.state.selection;
  const topLevelIndex = $from.index(0);
  for (let index = 0; index < topLevelIndex; index += 1) {
    const node = view.state.doc.child(index);
    if (node.textContent.trim()) return false;
    if (node.type.name !== "paragraph") return false;
  }
  return true;
}

function mergeMarkdownBodies(first: string, second: string) {
  const left = first.replace(/^\n+/, "");
  const right = second.replace(/^\n+/, "");
  if (!left) return right;
  if (!right) return left;
  return `${left.replace(/\n*$/, "\n\n")}${right}`;
}

function selectedRichText(view: EditorView) {
  const { from, to, empty } = view.state.selection;
  if (empty) return "";
  return view.state.doc.textBetween(from, to, "\n\n", "\n");
}

function copyRichSelection(view: EditorView) {
  const text = selectedRichText(view);
  if (!text) return false;
  writeDesktopClipboardText(text);
  view.focus();
  return true;
}

function cutRichSelection(view: EditorView) {
  if (!copyRichSelection(view)) return false;
  view.dispatch(view.state.tr.deleteSelection().scrollIntoView());
  view.focus();
  return true;
}

function pasteRichText(view: EditorView) {
  view.focus();
  readDesktopClipboardText().then((text) => {
    if (!text) {
      view.focus();
      return;
    }
    const { from, to } = view.state.selection;
    view.dispatch(view.state.tr.insertText(text, from, to).scrollIntoView());
    view.focus();
  });
}

function clearNativeSelection(view?: EditorView) {
  const rootSelection = (view?.root as unknown as { getSelection?: typeof window.getSelection } | undefined)?.getSelection?.();
  (rootSelection ?? window.getSelection())?.removeAllRanges();
}

function codeBlockDomAtSelection(view: EditorView) {
  const { $from } = view.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name !== "code_block") continue;
    const dom = view.nodeDOM($from.before(depth));
    return dom instanceof HTMLElement ? dom.closest<HTMLElement>(".milkdown-code-block") : null;
  }
  return null;
}

function refreshLocalImagePreviews(root: HTMLElement, imagePreviewMap: Record<string, string>) {
  root.querySelectorAll<HTMLImageElement>("img[src]").forEach((image) => {
    if (image.classList.contains("ProseMirror-separator")) return;
    const original = image.dataset.sereinSrc ?? image.getAttribute("src") ?? "";
    if (!image.dataset.sereinSrc) image.dataset.sereinSrc = original;
    const source = normalizeMarkdownImageSource(original);
    const preview = localImagePreview(imagePreviewMap, source);
    if (preview && image.getAttribute("src") !== preview) image.setAttribute("src", preview);
    const host = image.closest<HTMLElement>(".milkdown-image-inline") ?? image.parentElement;
    if (host) {
      host.classList.add("serein-image-source-host");
      host.dataset.sereinImageMarkdown = markdownImageText(source, image.getAttribute("alt") ?? "image");
    }
  });
}

function clearActiveImageSource(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>(".serein-image-source-active").forEach((node) => {
    node.classList.remove("serein-image-source-active");
    delete node.dataset.sereinImageMarkdown;
  });
  root.querySelectorAll<HTMLImageElement>("img[data-serein-image-active='true']").forEach((image) => {
    delete image.dataset.sereinImageActive;
  });
}

function setActiveImageSource(root: HTMLElement, image: HTMLImageElement | null, enabled: boolean) {
  clearActiveImageSource(root);
  if (!enabled || !image) return;

  const source = normalizeMarkdownImageSource(image.dataset.sereinSrc ?? image.getAttribute("src") ?? "");
  if (!source) return;

  const host = image.closest<HTMLElement>(".milkdown-image-inline") ?? image.closest<HTMLElement>("p, figure, div") ?? image.parentElement;
  if (!host || !root.contains(host)) return;

  image.dataset.sereinImageActive = "true";
  host.classList.add("serein-image-source-active");
  host.dataset.sereinImageMarkdown = markdownImageText(source, image.getAttribute("alt") ?? "image");
}

const handleNestedEnter: Command = (state, dispatch) => {
  const { selection } = state;
  if (!selection.empty) return false;

  const { $from } = selection;
  const currentNode = $from.parent;
  const parentNode = $from.depth > 0 ? $from.node($from.depth - 1) : null;
  const isEmptyParagraph = currentNode.type.name === "paragraph" && currentNode.content.size === 0;

  if (!isEmptyParagraph) return false;

  for (let depth = $from.depth - 1; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === "blockquote") {
      const range = $from.blockRange($from, (node) => node.type.name === "blockquote");
      if (!range) return lift(state, dispatch);

      if (dispatch) {
        try {
          dispatch(state.tr.lift(range, depth - 1).scrollIntoView());
        } catch (error) {
          console.warn("Failed to lift blockquote paragraph", error);
          return lift(state, dispatch);
        }
      }
      return true;
    }
  }

  const listItemType = state.schema.nodes.list_item;
  if (!listItemType) return false;
  if (parentNode?.type !== listItemType) return false;

  const listItemNode = parentNode;
  const isOnlyEmptyParagraph = listItemNode.childCount === 1
    && listItemNode.child(0).type.name === "paragraph"
    && listItemNode.child(0).content.size === 0;

  if (isOnlyEmptyParagraph) return liftListItem(listItemType)(state, dispatch);
  return splitListItem(listItemType)(state, dispatch);
};

const nestedEnterShortcut = $shortcut(() => ({
  Enter: handleNestedEnter,
}));

const selectCurrentCodeBlock: Command = (state, dispatch) => {
  const { $from } = state.selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name !== "code_block") continue;

    const from = $from.start(depth);
    const to = $from.end(depth);
    if (dispatch) {
      dispatch(state.tr.setSelection(TextSelection.create(state.doc, from, to)).scrollIntoView());
    }
    return true;
  }

  return false;
};

const richTabIndent = "  ";

const selectionInsideListItem = (state: Parameters<Command>[0]) => {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === "list_item") return true;
  }
  return false;
};

const indentRichTextLine = (outdent: boolean): Command => (state, dispatch) => {
  const { $from } = state.selection;
  const parent = $from.parent;
  if (!parent.isTextblock || parent.type.name === "code_block") return false;

  const textBeforeCursor = parent.textBetween(0, $from.parentOffset, "\n", "\n");
  const lineBreakIndex = textBeforeCursor.lastIndexOf("\n");
  const lineStartOffset = lineBreakIndex >= 0 ? lineBreakIndex + 1 : 0;
  const lineStart = $from.start() + lineStartOffset;

  if (outdent) {
    const lineEnd = $from.end();
    const prefix = state.doc.textBetween(lineStart, Math.min(lineStart + richTabIndent.length, lineEnd), "\n", "\n");
    const removeLength = prefix.startsWith("\t")
      ? 1
      : prefix.startsWith(richTabIndent)
        ? richTabIndent.length
        : prefix.startsWith(" ")
          ? 1
          : 0;

    if (!removeLength) return true;
    if (dispatch) dispatch(state.tr.delete(lineStart, lineStart + removeLength).scrollIntoView());
    return true;
  }

  if (dispatch) dispatch(state.tr.insertText(richTabIndent, lineStart).scrollIntoView());
  return true;
};

const handleRichTab = (outdent: boolean): Command => (state, dispatch, view) => {
  const listItemType = state.schema.nodes.list_item;
  if (listItemType && selectionInsideListItem(state)) {
    const command = outdent ? liftListItem(listItemType) : sinkListItem(listItemType);
    if (command(state, dispatch, view)) return true;
    return true;
  }

  return indentRichTextLine(outdent)(state, dispatch, view);
};

function turnHeadingIntoParagraphAtStart(view: EditorView) {
  const { state } = view;
  const { selection } = state;
  if (!selection.empty) return false;

  const { $from } = selection;
  if ($from.parent.type.name !== "heading" || $from.parentOffset !== 0) return false;

  const paragraphType = state.schema.nodes.paragraph;
  if (!paragraphType) return false;

  return setBlockType(paragraphType)(state, view.dispatch, view);
}

function pastedTextStartsWithMarkdownList(text: string) {
  const firstLine = text.replace(/\r\n?/g, "\n").split("\n").find((line) => line.trim().length > 0) ?? "";
  return /^\s{0,3}(?:[-+*]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/.test(firstLine);
}

function pasteTextIntoEmptyHeading(view: EditorView, text: string) {
  if (!text || !pastedTextStartsWithMarkdownList(text)) return false;

  const { state } = view;
  const { selection } = state;
  if (!selection.empty) return false;

  const { $from } = selection;
  if ($from.parent.type.name !== "heading" || $from.parent.content.size !== 0) return false;

  view.dispatch(state.tr.insertText(text, selection.from, selection.to).scrollIntoView());
  view.focus();
  return true;
}

const richTabShortcut = $shortcut(() => ({
  Tab: { key: "Tab", priority: 200, onRun: () => handleRichTab(false) },
  "Shift-Tab": { key: "Shift-Tab", priority: 200, onRun: () => handleRichTab(true) },
}));

const selectCurrentDocument: Command = (state, dispatch) => {
  if (dispatch) {
    dispatch(state.tr.setSelection(new AllSelection(state.doc)));
  }
  return true;
};

const selectRichScope: Command = (state, dispatch, view) => {
  if (selectCurrentCodeBlock(state, dispatch, view)) {
    clearNativeSelection(view);
    view?.focus();
    return true;
  }

  if (selectCurrentDocument(state, dispatch, view)) {
    clearNativeSelection(view);
    view?.focus();
    return true;
  }

  return false;
};

const smartSelectAllShortcut = $shortcut(() => ({
  "Mod-a": selectRichScope,
}));

const doubleTildeStrikethroughInputRule = $inputRule((ctx) => (
  markRule(/(?<![\w:/])~~(.+?)~~(?!\w|\/)/, strikethroughSchema.type(ctx))
));

const sereinGfm = [
  gfmSchema,
  gfmInputRules,
  gfmPasteRules,
  doubleTildeStrikethroughInputRule,
  gfmKeymap,
  gfmCommands,
  gfmPlugins,
].flat();

function splitPipeTableRow(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;

  const cells: string[] = [];
  let current = "";
  let escaped = false;
  for (let index = 1; index < trimmed.length - 1; index += 1) {
    const char = trimmed[index];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());

  if (cells.length < 2 || cells.every((cell) => cell.length === 0)) return null;
  return cells;
}

const convertTypedPipeTable = (view: EditorView) => {
  const { state } = view;
  const { selection, schema } = state;
  if (!selection.empty) return false;

  const { $from } = selection;
  const parent = $from.parent;
  if (parent.type.name !== "paragraph") return false;
  if ($from.parentOffset !== parent.content.size) return false;

  const cells = splitPipeTableRow(parent.textContent);
  if (!cells) return false;

  const tableType = schema.nodes.table;
  const headerRowType = schema.nodes.table_header_row;
  const headerType = schema.nodes.table_header;
  const rowType = schema.nodes.table_row;
  const cellType = schema.nodes.table_cell;
  const paragraphType = schema.nodes.paragraph;
  if (!tableType || !headerRowType || !headerType || !rowType || !cellType || !paragraphType) return false;

  const paragraphNode = (text = "") => paragraphType.create(null, text ? schema.text(text) : undefined);
  const headerCells = cells.map((text) => headerType.create({ alignment: "left" }, paragraphNode(text)));
  const bodyCells = cells.map(() => cellType.create({ alignment: "left" }, paragraphNode()));
  const headerRow = headerRowType.create(null, headerCells);
  const bodyRow = rowType.create(null, bodyCells);
  const table = tableType.create(null, [headerRow, bodyRow]);

  const from = $from.before($from.depth);
  const to = $from.after($from.depth);
  const tr = state.tr.replaceWith(from, to, table);
  const bodyFirstCellTextPos = from + 1 + headerRow.nodeSize + 1 + 1;
  const nextSelection = Selection.findFrom(tr.doc.resolve(bodyFirstCellTextPos), 1, true);
  if (nextSelection) tr.setSelection(nextSelection);
  view.dispatch(tr.scrollIntoView());
  return true;
};

const moveWithinMarkdownLink = (direction: -1 | 1 | "start" | "end"): Command => (_state, dispatch, view) => {
  if (!view || !view.state.selection.empty) return false;

  const range = markdownLinkTextRangeAtCursor(view);
  if (!range) return false;

  const cursorPos = view.state.selection.from;
  let nextPos: number;
  if (direction === "start") {
    nextPos = range.from;
  } else if (direction === "end") {
    nextPos = range.to;
  } else {
    if (direction < 0 && cursorPos <= range.from) return false;
    if (direction > 0 && cursorPos >= range.to) return false;
    nextPos = cursorPos + direction;
  }

  if (dispatch) {
    dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, nextPos)).scrollIntoView());
  }
  return true;
};

const markdownLinkNavigationShortcut = $shortcut(() => ({
  ArrowLeft: { key: "ArrowLeft", priority: 100, onRun: () => moveWithinMarkdownLink(-1) },
  ArrowRight: { key: "ArrowRight", priority: 100, onRun: () => moveWithinMarkdownLink(1) },
  Home: { key: "Home", priority: 100, onRun: () => moveWithinMarkdownLink("start") },
  End: { key: "End", priority: 100, onRun: () => moveWithinMarkdownLink("end") },
}));

function wikiLinkParts(raw: string) {
  const [targetPart, aliasPart] = raw.split("|", 2);
  const target = targetPart.trim();
  const label = aliasPart?.trim() || target.split("#", 1)[0].trim() || target;
  return { target, label };
}

function wikiLinkHref(target: string) {
  return `serein-wiki:${encodeURIComponent(target)}`;
}

function isWikiLinkHref(href: string | null) {
  return Boolean(href?.toLowerCase().startsWith("serein-wiki:"));
}

function wikiTriggerAtCursor(view: EditorView) {
  const { selection } = view.state;
  if (!selection.empty) return null;
  const $from = selection.$from;
  if ($from.parent.type.name !== "paragraph") return null;

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, "\n", "\n");
  const start = textBefore.lastIndexOf("[[");
  if (start < 0) return null;
  const query = textBefore.slice(start + 2);
  if (query.includes("]]") || /[\[\]\n]/.test(query)) return null;
  if (query.length > 80) return null;

  return {
    from: $from.start() + start,
    to: selection.from,
    query,
  };
}

function wikiSuggestPosition(view: EditorView, pos: number) {
  let rect: Pick<DOMRect, "left" | "right" | "top" | "bottom"> | null = null;

  try {
    const domPosition = view.domAtPos(pos);
    const range = document.createRange();
    const maxOffset = domPosition.node.nodeType === Node.TEXT_NODE
      ? (domPosition.node.textContent ?? "").length
      : domPosition.node.childNodes.length;
    range.setStart(domPosition.node, Math.min(domPosition.offset, maxOffset));
    range.collapse(true);
    rect = range.getBoundingClientRect();
    if (rect.left === 0 && rect.top === 0 && range.getClientRects().length) {
      rect = range.getClientRects()[0];
    }
    range.detach();
  } catch {
    rect = null;
  }

  if (!rect || (rect.left === 0 && rect.top === 0)) {
    try {
      rect = view.coordsAtPos(pos);
    } catch {
      const selection = window.getSelection();
      if (selection?.rangeCount) rect = selection.getRangeAt(0).getBoundingClientRect();
    }
  }

  if (!rect) rect = view.dom.getBoundingClientRect();

  const width = Math.min(320, window.innerWidth - 32);
  const x = Math.min(Math.max(rect.left, 12), Math.max(12, window.innerWidth - width - 12));
  const below = rect.bottom + 8;
  const y = below > window.innerHeight - 280
    ? Math.max(12, rect.top - 268)
    : Math.max(12, below);

  return { x, y };
}

function filterWikiSuggestions(suggestions: WikiLinkSuggestion[], query: string) {
  const cleanQuery = query.trim().toLocaleLowerCase();
  const filtered = !cleanQuery
    ? suggestions
    : suggestions.filter((item) => (
      item.target.toLocaleLowerCase().includes(cleanQuery)
      || item.label.toLocaleLowerCase().includes(cleanQuery)
      || item.description.toLocaleLowerCase().includes(cleanQuery)
    ));
  return filtered.slice(0, 8);
}

function insertWikiTarget(view: EditorView, trigger: Pick<WikiSuggestState, "from" | "to">, target: string) {
  const cleanTarget = target.trim();
  if (!cleanTarget) return false;
  const text = `[[${cleanTarget}]]`;
  let tr = view.state.tr.insertText(text, trigger.from, trigger.to);
  tr = tr.setSelection(TextSelection.create(tr.doc, trigger.from + text.length));
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

const wikiLinkDecorations = $prose(() => new Plugin({
  key: new PluginKey("SEREIN_WIKI_LINKS"),
  props: {
    decorations: (state) => {
      const decorations: Decoration[] = [];
      const { from: selectionFrom, to: selectionTo } = state.selection;
      const wikiPattern = /!?\[\[([^\]\n]+)\]\]/g;

      state.doc.descendants((node, pos, parent) => {
        if (!node.isText) return true;
        if (parent?.type.name === "code_block") return false;
        if (node.marks.some((mark) => mark.type.name === "code_inline" || mark.type.name === "link")) return false;

        const text = node.text ?? "";
        let match: RegExpExecArray | null;
        while ((match = wikiPattern.exec(text)) !== null) {
          const { target, label } = wikiLinkParts(match[1]);
          if (!target) continue;

          const from = pos + match.index;
          const to = from + match[0].length;
          const selectionInside = selectionFrom >= from && selectionTo <= to;
          if (selectionInside) {
            decorations.push(Decoration.inline(from, to, { class: "serein-wiki-link-editing" }));
            continue;
          }

          decorations.push(Decoration.inline(from, to, { class: "serein-wiki-link-source-hidden" }));
          decorations.push(Decoration.widget(from, () => {
            const anchor = document.createElement("a");
            anchor.className = "serein-wiki-link";
            anchor.href = wikiLinkHref(target);
            anchor.dataset.wikiTarget = target;
            anchor.textContent = label;
            anchor.title = target;
            return anchor;
          }, {
            side: -1,
          }));
        }

        return true;
      });

      return DecorationSet.create(state.doc, decorations);
    },
  },
}));

const codeBlockHighlightPluginKey = new PluginKey("SEREIN_CODE_BLOCK_HIGHLIGHT");

function codeBlockHighlightDecorations(state: Parameters<NonNullable<Plugin["props"]["decorations"]>>[0]) {
  const decorations: Decoration[] = [];

  state.doc.descendants((node, pos) => {
    if (node.type.name !== "code_block") return true;

    const languageName = String(node.attrs.language ?? "");
    const support = loadedCodeBlockLanguageSupport(languageName);
    if (!support) return false;

    const code = node.textContent;
    if (!code) return false;

    try {
      const tree = support.language.parser.parse(code);
      highlightTree(tree, classHighlighter, (from, to, classes) => {
        if (from >= to) return;
        decorations.push(Decoration.inline(pos + 1 + from, pos + 1 + to, {
          class: `serein-code-token ${classes}`,
        }));
      });
    } catch (error) {
      console.warn("Failed to highlight code block", error);
    }

    return false;
  });

  return DecorationSet.create(state.doc, decorations);
}

const codeBlockSyntaxHighlight = $prose(() => new Plugin({
  key: codeBlockHighlightPluginKey,
  state: {
    init: () => 0,
    apply: (tr, value: number) => (tr.getMeta(codeBlockHighlightPluginKey) ? value + 1 : value),
  },
  props: {
    decorations: codeBlockHighlightDecorations,
  },
  view: (view) => {
    let destroyed = false;
    const requestLanguages = () => {
      collectCodeBlockLanguages(view.state).forEach((languageName) => {
        requestCodeBlockLanguage(languageName, () => {
          if (destroyed) return;
          view.dispatch(view.state.tr.setMeta(codeBlockHighlightPluginKey, true));
        });
      });
    };

    requestLanguages();
    return {
      update: (nextView, previousState) => {
        if (nextView.state.doc !== previousState.doc) requestLanguages();
      },
      destroy: () => {
        destroyed = true;
      },
    };
  },
}));

function findCodeBlockPos(view: EditorView, codeBlockDom: HTMLElement) {
  let found: number | null = null;
  view.state.doc.descendants((node, pos) => {
    if (found !== null || node.type.name !== "code_block") return false;
    const dom = view.nodeDOM(pos);
    if (dom instanceof HTMLElement && (dom === codeBlockDom || dom.contains(codeBlockDom))) {
      found = pos;
      return false;
    }
    return true;
  });
  return found;
}

function refreshActiveCodeBlock(view: EditorView, fallbackTarget?: EventTarget | null) {
  const targetCodeBlock = fallbackTarget instanceof Element
    ? fallbackTarget.closest<HTMLElement>(".milkdown-code-block")
    : null;
  const activeCodeBlock = codeBlockDomAtSelection(view) ?? targetCodeBlock;

  view.dom.querySelectorAll<HTMLElement>(".milkdown-code-block.serein-code-block-active").forEach((node) => {
    if (node !== activeCodeBlock) node.classList.remove("serein-code-block-active");
  });
  activeCodeBlock?.classList.add("serein-code-block-active");
}

function clearActiveCodeBlock(view: EditorView) {
  view.dom.querySelectorAll<HTMLElement>(".milkdown-code-block.serein-code-block-active").forEach((node) => {
    node.classList.remove("serein-code-block-active");
  });
}

function findTablePos(view: EditorView, tableBlockDom: HTMLElement) {
  let found: number | null = null;
  view.state.doc.descendants((node, pos) => {
    if (found !== null || node.type.name !== "table") return false;
    const dom = view.nodeDOM(pos);
    if (dom instanceof HTMLElement && (dom === tableBlockDom || dom.contains(tableBlockDom) || tableBlockDom.contains(dom))) {
      found = pos;
      return false;
    }
    return true;
  });
  return found;
}

const codeBlockExitParentNames = new Set(["blockquote", "list_item", "bullet_list", "ordered_list"]);

function selectionInsideRange(selection: Selection, from: number, to: number) {
  return selection.from >= from && selection.to <= to;
}

function canInsertParagraphAt(view: EditorView, position: number) {
  const paragraph = view.state.schema.nodes.paragraph;
  if (!paragraph) return false;

  try {
    const $position = view.state.doc.resolve(position);
    return $position.parent.canReplaceWith($position.index(), $position.index(), paragraph);
  } catch {
    return false;
  }
}

function codeBlockExitPosition(view: EditorView, directAfter: number) {
  const { doc } = view.state;
  let exitAfter = directAfter;

  while (exitAfter < doc.content.size) {
    const $after = doc.resolve(exitAfter);
    let liftedAfter = exitAfter;

    for (let depth = $after.depth; depth > 0; depth -= 1) {
      const parent = $after.node(depth);
      if (!codeBlockExitParentNames.has(parent.type.name)) continue;
      if ($after.index(depth) !== parent.childCount) continue;

      liftedAfter = $after.after(depth);
      break;
    }

    if (liftedAfter === exitAfter) break;
    exitAfter = liftedAfter;
  }

  return exitAfter;
}

function exitCodeBlockAfter(view: EditorView, codeBlockDom: HTMLElement) {
  const pos = findCodeBlockPos(view, codeBlockDom);
  if (pos === null) return false;

  const node = view.state.doc.nodeAt(pos);
  const paragraph = view.state.schema.nodes.paragraph;
  if (!node || node.type.name !== "code_block" || !paragraph) return false;

  const codeFrom = pos;
  const codeTo = pos + node.nodeSize;
  const after = codeBlockExitPosition(view, codeTo);
  let tr = view.state.tr;
  const insertExitParagraph = (position: number) => {
    if (!canInsertParagraphAt(view, position)) return false;
    tr = tr.insert(position, paragraph.create());
    tr = tr.setSelection(TextSelection.create(tr.doc, position + 1));
    return true;
  };

  if (after >= view.state.doc.content.size) {
    if (!insertExitParagraph(after)) return false;
  } else {
    const nextSelection = Selection.findFrom(tr.doc.resolve(after), 1, true);
    if (nextSelection && !selectionInsideRange(nextSelection, codeFrom, codeTo)) {
      tr = tr.setSelection(nextSelection);
    } else {
      if (!insertExitParagraph(after)) return false;
    }
  }

  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

function exitTableAfter(view: EditorView, tableBlockDom: HTMLElement) {
  const pos = findTablePos(view, tableBlockDom);
  if (pos === null) return false;

  const node = view.state.doc.nodeAt(pos);
  const paragraph = view.state.schema.nodes.paragraph;
  if (!node || node.type.name !== "table" || !paragraph) return false;

  const after = pos + node.nodeSize;
  let tr = view.state.tr;

  if (after >= view.state.doc.content.size) {
    tr = tr.insert(after, paragraph.create());
    tr = tr.setSelection(TextSelection.create(tr.doc, after + 1));
  } else {
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(after), 1));
  }

  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

function updateCodeBlockLanguage(view: EditorView, codeBlockDom: HTMLElement, language: string) {
  const pos = findCodeBlockPos(view, codeBlockDom);
  if (pos === null) return false;

  const node = view.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "code_block") return false;

  view.dispatch(view.state.tr.setNodeAttribute(pos, "language", language.trim()).scrollIntoView());
  return true;
}

function activeCodeBlockLine(view: EditorView, codeBlockDom: HTMLElement) {
  const pos = findCodeBlockPos(view, codeBlockDom);
  const selection = view.state.selection;
  const node = pos === null ? null : view.state.doc.nodeAt(pos);
  if (pos === null || !node || node.type.name !== "code_block") {
    return { isFirstLine: false, isLastLine: false, isBlank: false, blankLinesBefore: 0, hasNonBlankBefore: false };
  }

  const text = node.textContent;
  const offset = Math.min(Math.max(selection.head - (pos + 1), 0), text.length);
  const lineNumber = text.slice(0, offset).split("\n").length;
  const lines = text.split("\n");
  const lineText = lines[lineNumber - 1] ?? "";
  const nextLineBreak = text.indexOf("\n", offset);
  const lineEnd = nextLineBreak === -1 ? text.length : nextLineBreak;
  const isLogicalLastLine = text.slice(lineEnd).replace(/\n/g, "").length === 0;
  const previousLines = lines.slice(0, lineNumber - 1);
  let blankLinesBefore = 0;
  for (let index = previousLines.length - 1; index >= 0; index -= 1) {
    if (previousLines[index]?.trim()) break;
    blankLinesBefore += 1;
  }

  return {
    isFirstLine: lineNumber === 1,
    isLastLine: lineNumber === lines.length || isLogicalLastLine,
    isBlank: lineText.trim() === "",
    blankLinesBefore,
    hasNonBlankBefore: previousLines.some((line) => Boolean(line.trim())),
  };
}

function emptyTextBlockBeforeCodeBlock(view: EditorView, codeBlockPos: number) {
  const { state } = view;
  const paragraph = state.schema.nodes.paragraph;
  const $pos = state.doc.resolve(codeBlockPos);
  const parent = $pos.parent;
  const index = $pos.index();
  const previous = index > 0 ? parent.child(index - 1) : null;

  if (
    previous?.isTextblock
    && previous.type.name !== "code_block"
    && parent.canReplaceWith(index, index, previous.type)
  ) {
    const node = previous.type.createAndFill(previous.attrs);
    if (node) return node;
  }

  if (paragraph && parent.canReplaceWith(index, index, paragraph)) {
    return paragraph.create();
  }

  return null;
}

function insertCodeBlockTopLine(view: EditorView, codeBlockDom: HTMLElement): PendingCodeBlockTopLine | null {
  const pos = findCodeBlockPos(view, codeBlockDom);
  if (pos === null) return null;

  const node = view.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "code_block") return null;

  const insertedNode = emptyTextBlockBeforeCodeBlock(view, pos);
  if (!insertedNode) return null;

  let tr = view.state.tr.insert(pos, insertedNode);
  tr = tr.setSelection(TextSelection.create(tr.doc, pos + 1)).scrollIntoView();
  view.dispatch(tr);
  view.focus();
  return { from: pos };
}

function removePendingCodeBlockTopLine(view: EditorView, pending: PendingCodeBlockTopLine) {
  const { state } = view;
  const node = state.doc.nodeAt(pending.from);
  if (!node || !node.isTextblock || node.textContent.length > 0) return false;

  const { selection } = state;
  if (!selection.empty || selection.from <= pending.from || selection.from >= pending.from + node.nodeSize) return false;

  const $pos = state.doc.resolve(pending.from);
  const parent = $pos.parent;
  const index = $pos.index();
  const next = index + 1 < parent.childCount ? parent.child(index + 1) : null;
  if (next?.type.name !== "code_block") return false;

  let tr = state.tr.delete(pending.from, pending.from + node.nodeSize);
  const selectionPos = Math.max(0, Math.min(pending.from, tr.doc.content.size));
  const resolved = tr.doc.resolve(selectionPos);
  const nextSelection = Selection.findFrom(resolved, -1, true) ?? Selection.findFrom(resolved, 1, true);
  if (nextSelection) tr = tr.setSelection(nextSelection);
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

function isImeKeyboardEvent(event: KeyboardEvent) {
  return event.isComposing || event.key === "Process" || event.keyCode === 229;
}

function shouldExitCodeBlockOnEnter(view: EditorView, codeBlockDom: HTMLElement) {
  const line = activeCodeBlockLine(view, codeBlockDom);
  return line.isLastLine && line.isBlank && line.hasNonBlankBefore && line.blankLinesBefore >= 2;
}

function turnEmptyCodeBlockIntoParagraph(view: EditorView, codeBlockDom: HTMLElement) {
  const pos = findCodeBlockPos(view, codeBlockDom);
  const node = pos === null ? null : view.state.doc.nodeAt(pos);
  const paragraph = view.state.schema.nodes.paragraph;
  if (pos === null || !node || node.type.name !== "code_block" || !paragraph) return false;
  if (node.textContent.length > 0) return false;

  const selection = view.state.selection;
  if (!selection.empty || selection.from !== pos + 1) return false;

  const tr = view.state.tr.replaceWith(pos, pos + node.nodeSize, paragraph.create());
  tr.setSelection(TextSelection.near(tr.doc.resolve(pos)));
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

function activeTableCell(target: HTMLElement | null) {
  const directCell = target?.closest<HTMLTableCellElement>("td, th") ?? null;
  if (directCell) return directCell;

  const selection = window.getSelection();
  const anchorElement = selection?.anchorNode instanceof HTMLElement
    ? selection.anchorNode
    : selection?.anchorNode?.parentElement ?? null;
  return anchorElement?.closest<HTMLTableCellElement>("td, th") ?? null;
}

function isLastTableRowCell(cell: HTMLTableCellElement) {
  const row = cell.closest("tr");
  const table = cell.closest("table");
  if (!row || !table) return false;
  const rows = [...table.querySelectorAll("tr")];
  return rows[rows.length - 1] === row;
}

function isTrailingParagraphAfterTable(view: EditorView) {
  const { selection } = view.state;
  if (!selection.empty) return false;

  const { $from } = selection;
  if ($from.parent.type.name !== "paragraph") return false;
  if ($from.depth < 1) return false;

  const parentDepth = $from.depth - 1;
  const parent = $from.node(parentDepth);
  const index = $from.index(parentDepth);
  if (index <= 0) return false;

  const previous = parent.child(index - 1);
  const next = index + 1 < parent.childCount ? parent.child(index + 1) : null;
  return previous.type.name === "table" && !next;
}

function currentLanguageText(button: HTMLButtonElement) {
  return button.getAttribute("data-language-draft")
    ?? button.getAttribute("data-language-value")
    ?? button.textContent?.trim()
    ?? "";
}

function beginLanguageEdit(button: HTMLButtonElement, initialValue?: string) {
  const value = initialValue ?? button.getAttribute("data-language-value") ?? button.textContent?.trim() ?? "";
  button.setAttribute("data-language-draft", value);
  button.setAttribute("data-language-fresh", "true");
}

function setLanguageDraft(button: HTMLButtonElement, value: string, fresh = false) {
  button.setAttribute("data-language-draft", value);
  button.setAttribute("data-language-fresh", fresh ? "true" : "false");
}

function finishLanguageEdit(button: HTMLButtonElement) {
  button.removeAttribute("data-language-draft");
  button.removeAttribute("data-language-fresh");
}

function isLanguagePickerOpen(button: HTMLButtonElement) {
  return button.getAttribute("data-expanded") === "true";
}

function closeLanguagePicker(button: HTMLButtonElement) {
  if (isLanguagePickerOpen(button)) button.click();
}

function languagePickerItems(codeBlockDom: HTMLElement) {
  return [...codeBlockDom.querySelectorAll<HTMLElement>(".language-list-item[data-language]")]
    .filter((item) => !item.classList.contains("no-result"));
}

function focusLanguagePickerItem(codeBlockDom: HTMLElement, direction: 1 | -1) {
  const items = languagePickerItems(codeBlockDom);
  if (!items.length) return false;

  const activeElement = document.activeElement;
  const currentIndex = activeElement instanceof HTMLElement ? items.indexOf(activeElement) : -1;
  const nextIndex = currentIndex === -1
    ? (direction > 0 ? 0 : items.length - 1)
    : Math.min(Math.max(currentIndex + direction, 0), items.length - 1);

  items[nextIndex]?.focus();
  return true;
}

function selectionInsideCodeBlock(view: EditorView, codeBlockDom: HTMLElement) {
  const pos = findCodeBlockPos(view, codeBlockDom);
  const node = pos === null ? null : view.state.doc.nodeAt(pos);
  if (pos === null || !node || node.type.name !== "code_block") return false;

  const from = pos + 1;
  const to = pos + node.nodeSize - 1;
  return view.state.selection.from >= from && view.state.selection.to <= to;
}

function focusCodeBlockContent(view: EditorView, codeBlockDom: HTMLElement) {
  const pos = findCodeBlockPos(view, codeBlockDom);
  const node = pos === null ? null : view.state.doc.nodeAt(pos);
  if (pos === null || !node || node.type.name !== "code_block") {
    view.focus();
    return false;
  }

  view.focus();
  if (selectionInsideCodeBlock(view, codeBlockDom)) return true;

  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 1)).scrollIntoView());
  return true;
}

function commitLanguageDraft(view: EditorView, codeBlockDom: HTMLElement, button: HTMLButtonElement) {
  updateCodeBlockLanguage(view, codeBlockDom, currentLanguageText(button));
  finishLanguageEdit(button);
  closeLanguagePicker(button);
  focusCodeBlockContent(view, codeBlockDom);
}

function focusCodeBlockFromLanguageControl(view: EditorView, codeBlockDom: HTMLElement, button: HTMLButtonElement) {
  updateCodeBlockLanguage(view, codeBlockDom, currentLanguageText(button));
  finishLanguageEdit(button);
  closeLanguagePicker(button);

  return focusCodeBlockContent(view, codeBlockDom);
}

function lineStartOffsets(text: string, from: number, to: number) {
  const first = text.lastIndexOf("\n", Math.max(from - 1, 0)) + 1;
  const effectiveTo = to > from && text[to - 1] === "\n" ? to - 1 : to;
  const last = text.lastIndexOf("\n", Math.max(effectiveTo - 1, 0)) + 1;
  const starts: number[] = [];

  for (let offset = first; offset <= last;) {
    starts.push(offset);
    const next = text.indexOf("\n", offset);
    if (next === -1) break;
    offset = next + 1;
  }

  return starts;
}

function handleCodeBlockTab(view: EditorView, codeBlockDom: HTMLElement, outdent: boolean) {
  const pos = findCodeBlockPos(view, codeBlockDom);
  const node = pos === null ? null : view.state.doc.nodeAt(pos);
  if (pos === null || !node || node.type.name !== "code_block") return false;

  const base = pos + 1;
  const text = node.textContent;
  const selection = view.state.selection;
  const fromOffset = Math.min(Math.max(selection.from - base, 0), text.length);
  const toOffset = Math.min(Math.max(selection.to - base, 0), text.length);
  const edits: Array<{ position: number; remove: number; insert: string }> = [];

  if (!outdent && selection.empty) {
    edits.push({ position: fromOffset, remove: 0, insert: "  " });
  } else {
    const starts = lineStartOffsets(text, fromOffset, toOffset);
    if (!outdent) {
      starts.forEach((position) => edits.push({ position, remove: 0, insert: "  " }));
    } else {
      starts.forEach((position) => {
        const prefix = text.slice(position, position + 2);
        const remove = prefix.startsWith("\t")
          ? 1
          : prefix.startsWith("  ")
            ? 2
            : prefix.startsWith(" ")
              ? 1
              : 0;
        if (remove) edits.push({ position, remove, insert: "" });
      });
    }
  }

  if (!edits.length) return true;

  let nextFrom = fromOffset;
  let nextTo = toOffset;
  edits
    .slice()
    .sort((left, right) => left.position - right.position)
    .forEach((edit) => {
      const delta = edit.insert.length - edit.remove;
      if (edit.position < fromOffset) nextFrom += delta;
      if (edit.position < toOffset || edit.position === toOffset) nextTo += delta;
      if (selection.empty && edit.position === fromOffset) {
        nextFrom = fromOffset + edit.insert.length;
        nextTo = nextFrom;
      }
    });

  let tr = view.state.tr;
  edits
    .slice()
    .sort((left, right) => right.position - left.position)
    .forEach((edit) => {
      tr = edit.insert
        ? tr.insertText(edit.insert, base + edit.position, base + edit.position + edit.remove)
        : tr.delete(base + edit.position, base + edit.position + edit.remove);
    });

  tr = tr.setSelection(TextSelection.create(tr.doc, base + Math.max(nextFrom, 0), base + Math.max(nextTo, 0)));
  view.dispatch(tr.scrollIntoView());
  return true;
}

function isEscapedAt(text: string, index: number) {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function unescapeMarkdownPunctuation(text: string) {
  return text.replace(/\\([!-\/:-@[-`{-~])/g, "$1");
}

function unescapeMarkdownLabel(text: string) {
  return text.replace(/\\([!-\/:-@[-`{-~])/g, (match, char: string) => (
    char === "[" || char === "]" || char === "(" || char === ")" || char === "\\"
      ? match
      : char
  ));
}

function escapeMarkdownLinkLabel(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/]/g, "\\]");
}

function escapeMarkdownAutolinkHref(href: string) {
  return href.replace(/[<>]/g, "");
}

function isAutolinkHref(href: string) {
  return /^[a-z][a-z\d+.-]*:[^\s<>]*$/i.test(href);
}

function findLinkLabelEnd(text: string, openBracket: number) {
  for (let index = openBracket + 1; index < text.length; index += 1) {
    if (text[index] === "]" && !isEscapedAt(text, index)) return index;
  }
  return -1;
}

function findLinkDestinationEnd(text: string, openParen: number) {
  let depth = 1;
  for (let index = openParen + 1; index < text.length; index += 1) {
    if (isEscapedAt(text, index)) continue;
    const char = text[index];
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char !== ")") continue;
    depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function markdownLinkSources(text: string) {
  const sources: MarkdownLinkSource[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "[" || isEscapedAt(text, index) || text[index - 1] === "!") continue;

    const labelEnd = findLinkLabelEnd(text, index);
    if (labelEnd < 0 || text[labelEnd + 1] !== "(") continue;

    const destinationEnd = findLinkDestinationEnd(text, labelEnd + 1);
    if (destinationEnd < 0) continue;

    sources.push({
      start: index,
      end: destinationEnd + 1,
      label: text.slice(index + 1, labelEnd),
      href: text.slice(labelEnd + 2, destinationEnd).trim(),
    });
    index = destinationEnd;
  }
  return sources;
}

function nestedMarkdownHref(rawHref: string) {
  const trimmed = unescapeMarkdownPunctuation(rawHref).trim();
  const sources = markdownLinkSources(trimmed);
  if (sources.length !== 1 || sources[0].start !== 0 || sources[0].end !== trimmed.length) return trimmed;
  return unescapeMarkdownPunctuation(sources[0].href).trim();
}

function markdownLinkSourceBeforeCursor(textBefore: string) {
  const sources = markdownLinkSources(textBefore);
  for (let index = sources.length - 1; index >= 0; index -= 1) {
    if (sources[index].end === textBefore.length) return sources[index];
  }
  return null;
}

function markdownLinkSourceAtOffset(text: string, offset: number) {
  return markdownLinkSources(text).find((source) => offset >= source.start && offset <= source.end) ?? null;
}

function markdownAutolinkSourceAtOffset(text: string, offset: number) {
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "<" || isEscapedAt(text, index)) continue;

    for (let end = index + 1; end < text.length; end += 1) {
      if (text[end] === "\n") break;
      if (text[end] !== ">" || isEscapedAt(text, end)) continue;

      const href = text.slice(index + 1, end).trim();
      if (isAutolinkHref(href) && offset >= index && offset <= end + 1) {
        return { start: index, end: end + 1 };
      }
      index = end;
      break;
    }
  }
  return null;
}

function convertTypedMarkdownLink(view: EditorView) {
  const { state } = view;
  const { selection } = state;
  if (!selection.empty) return false;

  const $from = selection.$from;
  if (!$from.parent.inlineContent || $from.parent.type.name === "code_block") return false;

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, "\n", "\n");
  const source = markdownLinkSourceBeforeCursor(textBefore);
  if (!source) return false;

  const label = unescapeMarkdownLabel(source.label);
  const href = nestedMarkdownHref(source.href);
  if (!label || !href) return false;

  const link = state.schema.marks.link;
  if (!link) return false;

  const from = selection.from - (source.end - source.start);
  const to = selection.from;
  let tr = state.tr.insertText(label, from, to);
  tr = tr.addMark(from, from + label.length, link.create({ href, title: null }));
  tr = tr.setSelection(TextSelection.create(tr.doc, from + label.length));
  view.dispatch(tr.scrollIntoView());
  return true;
}

function convertTypedMarkdownImage(view: EditorView) {
  const { state } = view;
  const { selection } = state;
  if (!selection.empty) return false;

  const $from = selection.$from;
  if ($from.parent.type.name !== "paragraph") return false;

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, "\n", "\n");
  const match = textBefore.match(/!\[([^\]\n]*)]\(([^)\n]+)\)$/);
  if (!match) return false;

  const [, rawAlt, rawSource] = match;
  const source = normalizeMarkdownImageSource(rawSource);
  if (!source) return false;

  const imageType = state.schema.nodes.image;
  if (!imageType) return false;

  const image = imageType.createAndFill({
    src: source,
    alt: rawAlt.trim() || "image",
    title: "",
  });
  if (!image) return false;

  const from = selection.from - match[0].length;
  let tr = state.tr.replaceWith(from, selection.from, image);
  tr = tr.setSelection(Selection.near(tr.doc.resolve(Math.min(tr.doc.content.size, from + image.nodeSize)), 1));
  view.dispatch(tr.scrollIntoView());
  return true;
}

function convertTypedMarkdownStrong(view: EditorView) {
  const { state } = view;
  const { selection } = state;
  if (!selection.empty) return false;

  const $from = selection.$from;
  if (!$from.parent.inlineContent || $from.parent.type.name === "code_block") return false;

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, "\n", "\n");
  const match = textBefore.match(/(^|[^*\\])\*\*([^\s*](?:[^\n]*?[^\s*])?)\*\*$/);
  if (!match) return false;

  const [, prefix, label] = match;
  if (!label.trim()) return false;

  const strong = state.schema.marks.strong;
  if (!strong) return false;

  const markdownLength = match[0].length - prefix.length;
  const from = selection.from - markdownLength;
  const to = selection.from;
  let tr = state.tr.insertText(label, from, to);
  tr = tr.addMark(from, from + label.length, strong.create());
  tr = tr.setSelection(TextSelection.create(tr.doc, from + label.length));
  view.dispatch(tr.scrollIntoView());
  return true;
}

function convertTypedMarkdownEmphasis(view: EditorView) {
  const { state } = view;
  const { selection } = state;
  if (!selection.empty) return false;

  const $from = selection.$from;
  if (!$from.parent.inlineContent || $from.parent.type.name === "code_block") return false;

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, "\n", "\n");
  const match = textBefore.match(/(^|[^*\\])\*([^\s*](?:[^\n]*?[^\s*])?)\*$/);
  if (!match) return false;

  const [, prefix, label] = match;
  if (!label.trim()) return false;

  const emphasis = state.schema.marks.emphasis;
  if (!emphasis) return false;

  const markdownLength = match[0].length - prefix.length;
  const from = selection.from - markdownLength;
  const to = selection.from;
  let tr = state.tr.insertText(label, from, to);
  tr = tr.addMark(from, from + label.length, emphasis.create());
  tr = tr.setSelection(TextSelection.create(tr.doc, from + label.length));
  view.dispatch(tr.scrollIntoView());
  return true;
}

function convertTypedMarkdownInline(view: EditorView) {
  return convertTypedMarkdownImage(view)
    || convertTypedMarkdownLink(view)
    || convertTypedMarkdownStrong(view)
    || convertTypedMarkdownEmphasis(view);
}

function sameLinkAttrs(left: Record<string, unknown>, right: Record<string, unknown>) {
  return String(left.href ?? "") === String(right.href ?? "")
    && String(left.title ?? "") === String(right.title ?? "");
}

function activeLinkRange(view: EditorView): LinkRange | null {
  const { state } = view;
  const { selection } = state;
  if (!selection.empty) return null;

  const linkType = state.schema.marks.link;
  if (!linkType) return null;

  const { from: cursorPos } = selection;
  const $pos = state.doc.resolve(cursorPos);
  const parent = $pos.parent;
  if (!parent.inlineContent) return null;

  const parentStart = $pos.start();
  let activeRange: { from: number; to: number; attrs: Record<string, unknown> } | null = null;
  let currentRange: { from: number; to: number; attrs: Record<string, unknown> } | null = null;

  parent.forEach((node, offset) => {
    const mark = linkType.isInSet(node.marks);
    const nodeFrom = parentStart + offset;
    const nodeTo = nodeFrom + node.nodeSize;

    if (!mark) {
      currentRange = null;
      return;
    }

    const attrs = mark.attrs as Record<string, unknown>;
    if (currentRange && sameLinkAttrs(currentRange.attrs, attrs) && currentRange.to === nodeFrom) {
      currentRange.to = nodeTo;
    } else {
      currentRange = { from: nodeFrom, to: nodeTo, attrs };
    }

    if (cursorPos >= currentRange.from && cursorPos <= currentRange.to) {
      activeRange = { ...currentRange };
    }
  });

  const range = activeRange as { from: number; to: number; attrs: Record<string, unknown> } | null;
  if (!range) return null;

  return {
    from: range.from,
    to: range.to,
    href: String(range.attrs.href ?? ""),
    attrs: range.attrs,
  };
}

function markdownLinkTextRangeAtCursor(view: EditorView): ExpandedLinkRange | null {
  const { state } = view;
  const { selection } = state;
  if (!selection.empty) return null;

  const $from = selection.$from;
  if (!$from.parent.inlineContent || $from.parent.type.name === "code_block") return null;

  const parentText = $from.parent.textBetween(0, $from.parent.content.size, "\n", "\n");
  const source = markdownLinkSourceAtOffset(parentText, $from.parentOffset)
    ?? markdownAutolinkSourceAtOffset(parentText, $from.parentOffset);
  if (!source) return null;

  return {
    from: $from.start() + source.start,
    to: $from.start() + source.end,
  };
}

function convertMarkdownLinkRange(view: EditorView, range: ExpandedLinkRange | null) {
  if (!range) return false;

  const cursorPos = view.state.selection.empty ? view.state.selection.from : null;
  const text = view.state.doc.textBetween(range.from, range.to, "\n", "\n");
  const sources = markdownLinkSources(text);
  const source = sources.length === 1 && sources[0].start === 0 && sources[0].end === text.length ? sources[0] : null;
  const autolinkMatch = source ? null : text.match(/^<([a-z][a-z\d+.-]*:[^\s<>]+)>$/i);
  if (!source && !autolinkMatch) return false;

  const label = source ? unescapeMarkdownLabel(source.label) : autolinkMatch![1];
  const href = source ? nestedMarkdownHref(source.href) : autolinkMatch![1];
  if (!label || !href) return false;

  const link = view.state.schema.marks.link;
  if (!link) return false;

  let tr = view.state.tr.insertText(label, range.from, range.to);
  tr = tr.addMark(range.from, range.from + label.length, link.create({ href, title: null }));
  if (cursorPos !== null) {
    const removedLength = text.length - label.length;
    let nextPos = range.from + label.length;

    if (!source) {
      nextPos = range.from + Math.max(0, Math.min(label.length, cursorPos - range.from - 1));
    } else if (cursorPos <= range.from) {
      nextPos = cursorPos;
    } else if (cursorPos >= range.to) {
      nextPos = cursorPos - removedLength;
    } else if (cursorPos <= range.from + 1) {
      nextPos = range.from;
    } else if (cursorPos <= range.from + 1 + label.length) {
      nextPos = range.from + Math.max(0, Math.min(label.length, cursorPos - range.from - 1));
    }

    tr = tr.setSelection(TextSelection.create(tr.doc, Math.max(0, Math.min(tr.doc.content.size, nextPos))));
  }
  view.dispatch(tr.scrollIntoView());
  return true;
}

function expandActiveLinkToMarkdown(view: EditorView, expandedRange: ExpandedLinkRange | null) {
  const { selection } = view.state;
  if (!selection.empty) return null;
  if (expandedRange && selection.from >= expandedRange.from && selection.from <= expandedRange.to) {
    return expandedRange;
  }

  const range = activeLinkRange(view);
  if (!range) return null;

  const label = view.state.doc.textBetween(range.from, range.to, "\n", "\n");
  if (!label || !range.href) return null;

  const labelOffset = Math.max(0, Math.min(selection.from - range.from, label.length));
  const markdown = label === range.href && isAutolinkHref(range.href)
    ? `<${escapeMarkdownAutolinkHref(range.href)}>`
    : `[${escapeMarkdownLinkLabel(label)}](${range.href})`;
  const textNode = view.state.schema.text(markdown);
  const linkType = view.state.schema.marks.link;
  let tr = view.state.tr.replaceWith(range.from, range.to, textNode);
  tr = tr.setSelection(TextSelection.create(tr.doc, range.from + 1 + labelOffset));
  view.dispatch(tr.scrollIntoView());

  if (linkType) {
    const removeMarkTr = view.state.tr
      .removeMark(range.from, range.from + markdown.length)
      .setSelection(TextSelection.create(view.state.doc, range.from + 1 + labelOffset));
    view.dispatch(removeMarkTr);
  }

  return {
    from: range.from,
    to: range.from + markdown.length,
  };
}

function runEditorCommand(editor: Editor, command: EditorCommandSignal, onResult: (result: EditorCommandResult) => void) {
  editor.action((ctx) => {
    const commands = ctx.get(commandsCtx);
    const view = ctx.get(editorViewCtx);
    let handled = false;
    view.focus();

    switch (command.action) {
      case "paragraph":
        handled = commands.call(turnIntoTextCommand.key);
        break;
      case "heading1":
        handled = commands.call(wrapInHeadingCommand.key, 1);
        break;
      case "heading2":
        handled = commands.call(wrapInHeadingCommand.key, 2);
        break;
      case "heading3":
        handled = commands.call(wrapInHeadingCommand.key, 3);
        break;
      case "blockquote":
        handled = commands.call(wrapInBlockquoteCommand.key);
        break;
      case "bulletList":
        handled = commands.call(wrapInBulletListCommand.key);
        break;
      case "orderedList":
        handled = commands.call(wrapInOrderedListCommand.key);
        break;
      case "codeBlock":
        handled = commands.call(createCodeBlockCommand.key);
        break;
      case "table":
        handled = commands.call(insertTableCommand.key, { row: 3, col: 3 });
        break;
      case "image":
        if (command.payload) {
          handled = commands.call(insertImageCommand.key, { src: command.payload, alt: command.alt ?? "" });
        }
        break;
      case "bold":
        handled = commands.call(toggleStrongCommand.key);
        break;
      case "italic":
        handled = commands.call(toggleEmphasisCommand.key);
        break;
      case "inlineCode":
        handled = commands.call(toggleInlineCodeCommand.key);
        break;
      case "strike":
        handled = commands.call(toggleStrikethroughCommand.key);
        break;
      case "link":
        if (command.payload) {
          handled = commands.call(toggleLinkCommand.key, { href: command.payload });
        }
        break;
      case "cut":
        handled = cutRichSelection(view);
        break;
      case "copy":
        handled = copyRichSelection(view);
        break;
      case "paste":
        pasteRichText(view);
        handled = true;
        break;
      case "undo":
        handled = commands.call(undoCommand.key);
        break;
      case "redo":
        handled = commands.call(redoCommand.key);
        break;
      case "selectAllSmart":
        handled = commands.inline(selectRichScope);
        break;
      default:
        break;
    }

    onResult({ command, handled });
  });
}

function EditorSurface({
  markdown,
  onChange,
  onRichMarkdownBaseline,
  command,
  onCommandResult,
  onOpenLink,
  wikiLinkSuggestions,
  onCreateWikiLink,
  onImportImages,
  imagePreviewMap,
  showImageSourceOnFocus,
  normalizeWindowsImagePaths,
  showFrontmatterTagRow,
  frontmatterLabels,
}: MilkdownEditorProps) {
  const initialDocumentRef = useRef(editorDocumentFromMarkdown(markdown, normalizeWindowsImagePaths));
  const initialMarkdownRef = useRef(initialDocumentRef.current.bodyMarkdown);
  const frontmatterRef = useRef(initialDocumentRef.current.frontmatter?.frontmatter ?? "");
  const latestBodyMarkdownRef = useRef(initialMarkdownRef.current);
  const lastKnownMarkdownRef = useRef(initialDocumentRef.current.fullMarkdown);
  const onChangeRef = useRef(onChange);
  const onRichMarkdownBaselineRef = useRef(onRichMarkdownBaseline);
  const onCommandResultRef = useRef(onCommandResult);
  const onOpenLinkRef = useRef(onOpenLink);
  const wikiLinkSuggestionsRef = useRef(wikiLinkSuggestions);
  const onCreateWikiLinkRef = useRef(onCreateWikiLink);
  const onImportImagesRef = useRef(onImportImages);
  const imagePreviewMapRef = useRef(imagePreviewMap);
  const showImageSourceOnFocusRef = useRef(showImageSourceOnFocus);
  const editorViewRef = useRef<EditorView | null>(null);
  const wikiSuggestRef = useRef<WikiSuggestState | null>(null);
  const [frontmatter, setFrontmatter] = useState<YamlFrontmatterParts | null>(initialDocumentRef.current.frontmatter);
  const [frontmatterContent, setFrontmatterContent] = useState(initialDocumentRef.current.frontmatter?.content ?? "");
  const [frontmatterKeyboardReveal, setFrontmatterKeyboardReveal] = useState(false);
  const [wikiSuggest, setWikiSuggest] = useState<WikiSuggestState | null>(null);
  const frontmatterPanelRef = useRef<HTMLDivElement | null>(null);
  const frontmatterTagsInputRef = useRef<HTMLInputElement | null>(null);
  const frontmatterAliasesInputRef = useRef<HTMLInputElement | null>(null);
  const showFrontmatterTagRowRef = useRef(showFrontmatterTagRow);
  const [loading, getEditor] = useInstance();

  const emitMarkdownChange = (nextMarkdown: string) => {
    const normalizedMarkdown = normalizeRichMarkdownEscapes(normalizeRichSerializedSpaces(nextMarkdown));
    lastKnownMarkdownRef.current = normalizedMarkdown;
    onChangeRef.current(normalizedMarkdown);
  };

  const updateFrontmatterContent = (content: string) => {
    const nextFrontmatter = createYamlFrontmatter(content);
    const nextParts = nextFrontmatter ? splitYamlFrontmatter(nextFrontmatter) : null;
    frontmatterRef.current = nextFrontmatter;
    setFrontmatterContent(content);
    setFrontmatter(nextParts);
    emitMarkdownChange(composeMarkdownWithFrontmatter(nextFrontmatter, latestBodyMarkdownRef.current));
  };

  const updateFrontmatterProperty = (key: string, value: string) => {
    updateFrontmatterContent(setYamlPropertyValue(frontmatterContent, key, value));
  };

  const removeFrontmatter = () => {
    frontmatterRef.current = "";
    setFrontmatterContent("");
    setFrontmatter(null);
    setFrontmatterKeyboardReveal(false);
    emitMarkdownChange(latestBodyMarkdownRef.current);
    editorViewRef.current?.focus();
  };

  const focusFrontmatterEnd = () => {
    setFrontmatterKeyboardReveal(true);
    window.requestAnimationFrame(() => {
      const target = frontmatterAliasesInputRef.current ?? frontmatterTagsInputRef.current;
      if (!target) return;
      target.focus();
      const end = target.value.length;
      target.setSelectionRange(end, end);
    });
  };

  const focusEditorStart = () => {
    const view = editorViewRef.current;
    if (!view) return;
    setFrontmatterKeyboardReveal(false);
    view.focus();
    view.dispatch(view.state.tr.setSelection(Selection.atStart(view.state.doc)).scrollIntoView());
  };

  const handleFrontmatterBlur = (event: ReactFocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setFrontmatterKeyboardReveal(false);
  };

  const handleFrontmatterPointerLeave = () => {
    if (frontmatterKeyboardReveal) return;
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && frontmatterPanelRef.current?.contains(activeElement)) {
      activeElement.blur();
    }
  };

  const handleFrontmatterKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const editableTarget = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target : null;
    const isPlainArrowDown = event.key === "ArrowDown" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;

    if (isPlainArrowDown) {
      event.preventDefault();
      event.stopPropagation();
      focusEditorStart();
      return;
    }

    if (!event.altKey && !event.ctrlKey && !event.metaKey && editableTarget && ["Backspace", "Delete"].includes(event.key)) {
      const tags = splitYamlPropertyValue(frontmatterPropertyValue(frontmatter, "tags"));
      const aliases = splitYamlPropertyValue(frontmatterPropertyValue(frontmatter, "aliases"));
      const customProperties = frontmatter?.properties.filter((property) => (
        !["tags", "aliases", "status"].includes(property.key.toLowerCase())
        && displayFrontmatterValue(property).trim()
      )) ?? [];
      const canRemoveFrontmatter = tags.length === 0 && aliases.length === 0 && customProperties.length === 0;
      const atInputStart = editableTarget.selectionStart === 0 && editableTarget.selectionEnd === 0;
      if (canRemoveFrontmatter && editableTarget.value.trim().length === 0 && (event.key === "Delete" || atInputStart)) {
        event.preventDefault();
        event.stopPropagation();
        removeFrontmatter();
        return;
      }
    }

    if (event.key === "Escape" && frontmatterPanelRef.current?.contains(target)) {
      event.preventDefault();
      event.stopPropagation();
      setFrontmatterKeyboardReveal(false);
      editorViewRef.current?.focus();
      return;
    }

    if (!(event.ctrlKey || event.metaKey)) return;
    if (!["a", "c", "x", "v", "z", "y", "f"].includes(event.key.toLowerCase())) return;
    if (event.key.toLowerCase() === "f") event.preventDefault();
    if (event.key.toLowerCase() === "a" && !editableTarget) event.preventDefault();
    event.stopPropagation();
  };

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onRichMarkdownBaselineRef.current = onRichMarkdownBaseline;
  }, [onRichMarkdownBaseline]);

  useEffect(() => {
    onCommandResultRef.current = onCommandResult;
  }, [onCommandResult]);

  useEffect(() => {
    onOpenLinkRef.current = onOpenLink;
  }, [onOpenLink]);

  useEffect(() => {
    wikiLinkSuggestionsRef.current = wikiLinkSuggestions;
  }, [wikiLinkSuggestions]);

  useEffect(() => {
    onCreateWikiLinkRef.current = onCreateWikiLink;
  }, [onCreateWikiLink]);

  useEffect(() => {
    onImportImagesRef.current = onImportImages;
  }, [onImportImages]);

  useEffect(() => {
    imagePreviewMapRef.current = imagePreviewMap;
    if (editorViewRef.current) refreshLocalImagePreviews(editorViewRef.current.dom, imagePreviewMap);
  }, [imagePreviewMap]);

  useEffect(() => {
    showImageSourceOnFocusRef.current = showImageSourceOnFocus;
    if (!showImageSourceOnFocus && editorViewRef.current) clearActiveImageSource(editorViewRef.current.dom);
  }, [showImageSourceOnFocus]);

  useEffect(() => {
    showFrontmatterTagRowRef.current = showFrontmatterTagRow;
  }, [showFrontmatterTagRow]);

  const closeWikiSuggest = () => {
    wikiSuggestRef.current = null;
    setWikiSuggest(null);
  };

  const selectWikiTarget = async (target: string) => {
    const view = editorViewRef.current;
    const trigger = wikiSuggestRef.current;
    if (!view || !trigger) return;
    if (insertWikiTarget(view, trigger, target)) closeWikiSuggest();
  };

  const createWikiTarget = async () => {
    const view = editorViewRef.current;
    const trigger = wikiSuggestRef.current;
    if (!view || !trigger) return;
    const createdTarget = await onCreateWikiLinkRef.current(trigger.query.trim());
    if (!createdTarget) return;
    if (insertWikiTarget(view, trigger, createdTarget)) closeWikiSuggest();
  };

  useEffect(() => {
    if (loading || !command) return;
    const editor = getEditor();
    if (!editor) return;
    runEditorCommand(editor, command, onCommandResultRef.current);
  }, [command, getEditor, loading]);

  useEffect(() => {
    if (loading) return;
    const nextDocument = editorDocumentFromMarkdown(markdown, normalizeWindowsImagePaths);
    if (nextDocument.fullMarkdown === lastKnownMarkdownRef.current) return;

    const editor = getEditor();
    if (!editor) return;

    lastKnownMarkdownRef.current = nextDocument.fullMarkdown;
    frontmatterRef.current = nextDocument.frontmatter?.frontmatter ?? "";
    latestBodyMarkdownRef.current = nextDocument.bodyMarkdown;
    setFrontmatter(nextDocument.frontmatter);
    setFrontmatterContent(nextDocument.frontmatter?.content ?? "");
    setFrontmatterKeyboardReveal(false);

    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const previousSelection = richSelectionSnapshot(view);
      replaceAll(nextDocument.bodyMarkdown)(ctx);
      restoreRichSelectionSnapshot(view, previousSelection);
      onRichMarkdownBaselineRef.current(nextDocument.fullMarkdown);
      window.requestAnimationFrame(() => refreshLocalImagePreviews(view.dom, imagePreviewMapRef.current));
    });
  }, [getEditor, loading, markdown, normalizeWindowsImagePaths]);

  useEffect(() => {
    if (loading) return undefined;
    const editor = getEditor();
    if (!editor) return undefined;

    return editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const commands = ctx.get(commandsCtx);
      editorViewRef.current = view;
      clearNativeSelection(view);
      refreshLocalImagePreviews(view.dom, imagePreviewMapRef.current);
      const baselineBody = ctx.get(serializerCtx)(view.state.doc);
      const normalizedBaselineBody = frontmatterRef.current ? normalizeRichFrontmatterBody(baselineBody) : baselineBody;
      latestBodyMarkdownRef.current = normalizedBaselineBody;
      onRichMarkdownBaselineRef.current(composeMarkdownWithFrontmatter(frontmatterRef.current, normalizedBaselineBody));
      if (baselineBody !== normalizedBaselineBody) {
        window.requestAnimationFrame(() => replaceAll(normalizedBaselineBody)(ctx));
      }
      const maybeConvertBeforeCursorMove = (event: KeyboardEvent) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Tab"].includes(event.key)) return false;
        return convertTypedMarkdownInline(view);
      };
      const updateWikiSuggest = (selectedIndex = wikiSuggestRef.current?.selectedIndex ?? 0) => {
        const trigger = wikiTriggerAtCursor(view);
        if (!trigger) {
          closeWikiSuggest();
          return null;
        }
        const coords = wikiSuggestPosition(view, trigger.to);
        const options = filterWikiSuggestions(wikiLinkSuggestionsRef.current, trigger.query);
        const clampedIndex = Math.max(0, Math.min(selectedIndex, Math.max(options.length, 1) - 1));
        const nextState = {
          ...trigger,
          x: coords.x,
          y: coords.y,
          selectedIndex: clampedIndex,
        };
        wikiSuggestRef.current = nextState;
        setWikiSuggest(nextState);
        return nextState;
      };
      let wikiSuggestFrame = 0;
      const scheduleWikiSuggestUpdate = () => {
        window.cancelAnimationFrame(wikiSuggestFrame);
        wikiSuggestFrame = window.requestAnimationFrame(() => updateWikiSuggest());
      };
      const chooseWikiSuggest = async () => {
        const current = wikiSuggestRef.current;
        if (!current) return false;
        const options = filterWikiSuggestions(wikiLinkSuggestionsRef.current, current.query);
        const selected = options[current.selectedIndex];
        if (selected) {
          insertWikiTarget(view, current, selected.target);
          closeWikiSuggest();
          return true;
        }
        const createdTarget = await onCreateWikiLinkRef.current(current.query.trim());
        if (!createdTarget) return false;
        insertWikiTarget(view, current, createdTarget);
        closeWikiSuggest();
        return true;
      };
      let linkExpandFrame = 0;
      let expandedLinkRange: ExpandedLinkRange | null = null;
      let pendingCodeBlockTopLine: PendingCodeBlockTopLine | null = null;
      let suppressNextLinkExpand = false;
      let suppressPointerLinkExpand = false;
      const moveInsideExpandedLink = (pos: number) => {
        if (!expandedLinkRange) return false;
        const nextPos = Math.max(expandedLinkRange.from, Math.min(expandedLinkRange.to, pos));
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, nextPos)).scrollIntoView());
        expandedLinkRange = markdownLinkTextRangeAtCursor(view) ?? expandedLinkRange;
        return true;
      };
      const selectionInsideExpandedLink = () => (
        Boolean(expandedLinkRange)
        && view.state.selection.empty
        && view.state.selection.from >= expandedLinkRange!.from
        && view.state.selection.from <= expandedLinkRange!.to
      );
      const selectionIntersectsExpandedLink = () => (
        Boolean(expandedLinkRange)
        && view.state.selection.from <= expandedLinkRange!.to
        && view.state.selection.to >= expandedLinkRange!.from
      );
      const convertExpandedLink = () => {
        if (!expandedLinkRange) return false;
        const handled = convertMarkdownLinkRange(view, expandedLinkRange);
        expandedLinkRange = null;
        if (handled) suppressNextLinkExpand = true;
        return handled;
      };
      const refreshExpandedLink = () => {
        if (suppressPointerLinkExpand) return;
        if (suppressNextLinkExpand) {
          suppressNextLinkExpand = false;
          return;
        }

        if (expandedLinkRange) {
          if (selectionIntersectsExpandedLink()) {
            const currentRawRange = view.state.selection.empty ? markdownLinkTextRangeAtCursor(view) : null;
            if (currentRawRange) {
              expandedLinkRange = currentRawRange;
            }
            return;
          }
          convertExpandedLink();
          return;
        }

        const next = expandActiveLinkToMarkdown(view, expandedLinkRange);
        if (next) expandedLinkRange = next;
      };
      const scheduleLinkExpandRefresh = () => {
        window.cancelAnimationFrame(linkExpandFrame);
        linkExpandFrame = window.requestAnimationFrame(refreshExpandedLink);
      };
      let activeTableFrame = 0;
      const setActiveTableBlock = (tableBlock: HTMLElement | null) => {
        view.dom.querySelectorAll<HTMLElement>(".milkdown-table-block.serein-table-active").forEach((node) => {
          if (node !== tableBlock) node.classList.remove("serein-table-active");
        });
        if (tableBlock) {
          tableBlock.classList.add("serein-table-active");
        }
      };
      const setActiveTableFromTarget = (target: EventTarget | null) => {
        const element = target instanceof Element ? target : null;
        setActiveTableBlock(element?.closest<HTMLElement>(".milkdown-table-block") ?? null);
      };
      const refreshActiveTableFromSelection = () => {
        const { selection } = view.state;
        try {
          const domPosition = view.domAtPos(selection.from);
          const node = domPosition.node;
          const element = node instanceof HTMLElement ? node : node.parentElement;
          setActiveTableBlock(element?.closest<HTMLElement>(".milkdown-table-block") ?? null);
        } catch {
          setActiveTableBlock(null);
        }
      };
      const scheduleActiveTableRefresh = () => {
        window.cancelAnimationFrame(activeTableFrame);
        activeTableFrame = window.requestAnimationFrame(refreshActiveTableFromSelection);
      };
      let activeImageFrame = 0;
      const setActiveImageFromTarget = (target: EventTarget | null) => {
        const element = target instanceof Element ? target : null;
        const image = element?.closest<HTMLImageElement>("img.image-inline, img:not(.ProseMirror-separator)")
          ?? element?.querySelector<HTMLImageElement>("img.image-inline, img:not(.ProseMirror-separator)")
          ?? null;
        setActiveImageSource(view.dom, image, showImageSourceOnFocusRef.current);
      };
      const refreshActiveImageFromSelection = () => {
        if (!showImageSourceOnFocusRef.current) {
          clearActiveImageSource(view.dom);
          return;
        }

        const { selection } = view.state;
        try {
          const domPosition = view.domAtPos(selection.from);
          const node = domPosition.node;
          const element = node instanceof HTMLElement ? node : node.parentElement;
          const image = element?.closest<HTMLImageElement>("img.image-inline, img:not(.ProseMirror-separator)")
            ?? element?.querySelector<HTMLImageElement>("img.image-inline, img:not(.ProseMirror-separator)")
            ?? null;
          if (image) setActiveImageSource(view.dom, image, true);
        } catch {
          // Pointer handling clears image focus when the user moves away; selection
          // changes around atom images can be noisy, so don't clear active image UI here.
        }
      };
      const scheduleActiveImageRefresh = () => {
        window.cancelAnimationFrame(activeImageFrame);
        activeImageFrame = window.requestAnimationFrame(refreshActiveImageFromSelection);
      };
      let activeCodeBlockFrame = 0;
      const scheduleActiveCodeBlockRefresh = (fallbackTarget?: EventTarget | null) => {
        window.cancelAnimationFrame(activeCodeBlockFrame);
        activeCodeBlockFrame = window.requestAnimationFrame(() => refreshActiveCodeBlock(view, fallbackTarget));
      };
      const eventBelongsToEditor = (target: HTMLElement | null) => {
        if (target && view.dom.contains(target)) return true;

        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement && view.dom.contains(activeElement)) return true;

        if (
          target
          && target.closest("button, input, textarea, select, [contenteditable='true'], [role='menu'], .menu-popover, .app-dialog, .window-controls")
        ) {
          return false;
        }

        const selection = document.getSelection();
        const anchor = selection?.anchorNode;
        return Boolean(anchor && view.dom.contains(anchor));
      };
      const handleKeyDown = (event: KeyboardEvent) => {
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (!eventBelongsToEditor(target)) return;

        const targetCodeBlock = target?.closest<HTMLElement>(".milkdown-code-block") ?? null;
        const selectionCodeBlock = codeBlockDomAtSelection(view);
        const codeBlock = targetCodeBlock ?? selectionCodeBlock;
        const languageButton = target?.closest<HTMLButtonElement>(".language-button") ?? null;
        const languagePickerItem = target?.closest<HTMLElement>(".language-list-item[data-language]") ?? null;
        const isCodeBlockControlTarget = Boolean(languageButton || languagePickerItem || target?.closest(".language-picker"));
        const isCodeBlockContentTarget = Boolean(selectionCodeBlock && !isCodeBlockControlTarget);
        const isPlainArrowDown = event.key === "ArrowDown" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
        const isPlainArrowUp = event.key === "ArrowUp" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
        const isPlainTab = event.key === "Tab" && !event.altKey && !event.ctrlKey && !event.metaKey;
        if (codeBlock) scheduleActiveCodeBlockRefresh(event.target);

        if (isPlainArrowUp && pendingCodeBlockTopLine) {
          const removed = removePendingCodeBlockTopLine(view, pendingCodeBlockTopLine);
          pendingCodeBlockTopLine = null;
          if (removed) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            return;
          }
        }

        if (wikiSuggestRef.current && !event.ctrlKey && !event.metaKey && !event.altKey) {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            event.stopPropagation();
            const options = filterWikiSuggestions(wikiLinkSuggestionsRef.current, wikiSuggestRef.current.query);
            const count = Math.max(options.length, 1);
            const direction = event.key === "ArrowDown" ? 1 : -1;
            updateWikiSuggest((wikiSuggestRef.current.selectedIndex + direction + count) % count);
            return;
          }
          if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            event.stopPropagation();
            void chooseWikiSuggest();
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            closeWikiSuggest();
            return;
          }
        }

        if (
          isPlainArrowUp
          && !isCodeBlockContentTarget
          && frontmatterRef.current
          && showFrontmatterTagRowRef.current
          && selectionIsInFirstTextBlock(view)
        ) {
          event.preventDefault();
          event.stopPropagation();
          focusFrontmatterEnd();
          return;
        }

        if (
          event.key === "Backspace"
          && !event.altKey
          && !event.ctrlKey
          && !event.metaKey
          && !event.shiftKey
          && turnHeadingIntoParagraphAtStart(view)
        ) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          view.focus();
          return;
        }

        if (isCodeBlockContentTarget && codeBlock) {
          if (isImeKeyboardEvent(event)) return;

          if (isPlainTab) {
            event.preventDefault();
            event.stopPropagation();
            handleCodeBlockTab(view, codeBlock, event.shiftKey);
            return;
          }

          if (event.key === "Backspace" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
            if (!turnEmptyCodeBlockIntoParagraph(view, codeBlock)) return;
            event.preventDefault();
            event.stopPropagation();
            return;
          }

          if (isPlainArrowDown) {
            const { isLastLine } = activeCodeBlockLine(view, codeBlock);
            if (!isLastLine) return;

            const languageControl = codeBlock.querySelector<HTMLButtonElement>(".language-button");
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            if (!languageControl) {
              exitCodeBlockAfter(view, codeBlock);
              return;
            }

            beginLanguageEdit(languageControl);
            languageControl.focus({ preventScroll: true });
            if (document.activeElement !== languageControl) {
              exitCodeBlockAfter(view, codeBlock);
            }
            return;
          }

          if (isPlainArrowUp) {
            const { isFirstLine } = activeCodeBlockLine(view, codeBlock);
            if (!isFirstLine) return;

            const inserted = insertCodeBlockTopLine(view, codeBlock);
            if (!inserted) return;

            pendingCodeBlockTopLine = inserted;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            return;
          }

          if (event.key === "Enter" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
            if (!shouldExitCodeBlockOnEnter(view, codeBlock)) return;

            event.preventDefault();
            event.stopPropagation();
            exitCodeBlockAfter(view, codeBlock);
            return;
          }

          return;
        }

        if (isPlainTab && !codeBlock && !target?.closest(".milkdown-table-block")) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          handleRichTab(event.shiftKey)(view.state, view.dispatch, view);
          view.focus();
          return;
        }

        if (!selectionInsideExpandedLink()) maybeConvertBeforeCursorMove(event);

        if (
          expandedLinkRange
          && selectionInsideExpandedLink()
          && !event.altKey
          && !event.ctrlKey
          && !event.metaKey
          && !event.shiftKey
        ) {
          const cursorPos = view.state.selection.from;
          const stopExpandedLinkNavigation = () => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
          };

          if (event.key === "Home") {
            stopExpandedLinkNavigation();
            moveInsideExpandedLink(expandedLinkRange.from);
            return;
          }

          if (event.key === "End") {
            stopExpandedLinkNavigation();
            moveInsideExpandedLink(expandedLinkRange.to);
            return;
          }

          if (event.key === "ArrowLeft" && cursorPos > expandedLinkRange.from) {
            stopExpandedLinkNavigation();
            moveInsideExpandedLink(cursorPos - 1);
            return;
          }

          if (event.key === "ArrowRight" && cursorPos < expandedLinkRange.to) {
            stopExpandedLinkNavigation();
            moveInsideExpandedLink(cursorPos + 1);
            return;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            convertExpandedLink();
            view.focus();
            return;
          }

          if (event.key === "Enter") {
            convertExpandedLink();
          }
        }

        if (codeBlock && languageButton) {
          if (!languageButton.hasAttribute("data-language-draft")) beginLanguageEdit(languageButton);

          if (isPlainArrowUp) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            focusCodeBlockFromLanguageControl(view, codeBlock, languageButton);
            return;
          }

          if (isPlainArrowDown) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            if (isLanguagePickerOpen(languageButton) && focusLanguagePickerItem(codeBlock, 1)) return;

            updateCodeBlockLanguage(view, codeBlock, currentLanguageText(languageButton));
            finishLanguageEdit(languageButton);
            closeLanguagePicker(languageButton);
            exitCodeBlockAfter(view, codeBlock);
            return;
          }

          if (event.key === "Enter" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
            event.preventDefault();
            event.stopPropagation();
            commitLanguageDraft(view, codeBlock, languageButton);
            return;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            finishLanguageEdit(languageButton);
            closeLanguagePicker(languageButton);
            focusCodeBlockContent(view, codeBlock);
            return;
          }

          if (event.key === "Backspace" && !event.altKey && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            event.stopPropagation();
            setLanguageDraft(languageButton, currentLanguageText(languageButton).slice(0, -1));
            return;
          }

          if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            event.stopPropagation();
            const fresh = languageButton.getAttribute("data-language-fresh") === "true";
            const nextLanguage = fresh ? event.key : `${currentLanguageText(languageButton)}${event.key}`;
            setLanguageDraft(languageButton, nextLanguage);
            return;
          }
        }

        if (codeBlock && languagePickerItem) {
          if (isPlainArrowDown) {
            event.preventDefault();
            event.stopPropagation();
            focusLanguagePickerItem(codeBlock, 1);
            return;
          }

          if (event.key === "ArrowUp" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
            event.preventDefault();
            event.stopPropagation();
            focusLanguagePickerItem(codeBlock, -1);
            return;
          }

          if (event.key === "Enter" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
            event.preventDefault();
            event.stopPropagation();
            languagePickerItem.click();
            focusCodeBlockContent(view, codeBlock);
            return;
          }
        }

        if (isPlainArrowDown) {
          const cell = activeTableCell(target);
          const tableBlock = target?.closest<HTMLElement>(".milkdown-table-block")
            ?? cell?.closest<HTMLElement>(".milkdown-table-block")
            ?? null;
          if (tableBlock && cell && isLastTableRowCell(cell)) {
            event.preventDefault();
            event.stopPropagation();
            if (exitTableAfter(view, tableBlock)) return;
          }
          if (isTrailingParagraphAfterTable(view)) {
            event.preventDefault();
            event.stopPropagation();
            view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, view.state.selection.from)).scrollIntoView());
            return;
          }
        }

        if (event.key === "Enter" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
          if (convertTypedPipeTable(view) || convertTypedMarkdownInline(view)) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
        }

        const isSelectAll = (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "a";
        if (isSelectAll) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          selectRichScope(view.state, view.dispatch, view);
          return;
        }
      };
      const handleKeyUp = (event: KeyboardEvent) => {
        const target = event.target instanceof HTMLElement ? event.target : null;
        scheduleActiveCodeBlockRefresh(event.target);
        if (codeBlockDomAtSelection(view) || target?.closest(".milkdown-code-block")) return;

        scheduleActiveTableRefresh();
        scheduleActiveImageRefresh();

        if (!event.ctrlKey && !event.metaKey && !event.altKey) {
          scheduleWikiSuggestUpdate();
        }

        if (event.key === ")") {
          if (convertTypedMarkdownInline(view)) {
            suppressNextLinkExpand = true;
            refreshLocalImagePreviews(view.dom, imagePreviewMapRef.current);
            return;
          }
        }

        if (expandedLinkRange && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
          expandedLinkRange = markdownLinkTextRangeAtCursor(view) ?? expandedLinkRange;
          return;
        }

        if (selectionIntersectsExpandedLink()) {
          expandedLinkRange = markdownLinkTextRangeAtCursor(view) ?? expandedLinkRange;
          return;
        }

        scheduleLinkExpandRefresh();
      };
      const handleInput = (event: Event) => {
        const target = event.target instanceof HTMLElement ? event.target : null;
        scheduleActiveCodeBlockRefresh(event.target);
        if (codeBlockDomAtSelection(view) || target?.closest(".milkdown-code-block")) return;

        scheduleActiveTableRefresh();
        scheduleActiveImageRefresh();
        scheduleWikiSuggestUpdate();
        if (!selectionInsideExpandedLink() && convertTypedMarkdownInline(view)) {
          refreshLocalImagePreviews(view.dom, imagePreviewMapRef.current);
        }
      };
      const handlePaste = (event: ClipboardEvent) => {
        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (pasteTextIntoEmptyHeading(view, text)) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          return;
        }

        const pastedFrontmatter = splitYamlFrontmatter(text);
        if (!pastedFrontmatter) return;
        if (!selectionStartsAtDocumentTop(view)) return;

        event.preventDefault();
        event.stopPropagation();
        const currentBodyMarkdown = ctx.get(serializerCtx)(view.state.doc);
        const nextBodyMarkdown = mergeMarkdownBodies(pastedFrontmatter.body, currentBodyMarkdown);
        frontmatterRef.current = pastedFrontmatter.frontmatter;
        latestBodyMarkdownRef.current = nextBodyMarkdown;
        setFrontmatter(pastedFrontmatter);
        setFrontmatterContent(pastedFrontmatter.content);
        emitMarkdownChange(composeMarkdownWithFrontmatter(pastedFrontmatter.frontmatter, nextBodyMarkdown));
        replaceAll(nextBodyMarkdown)(ctx);
        window.requestAnimationFrame(() => refreshLocalImagePreviews(view.dom, imagePreviewMapRef.current));
      };
      const handlePointerDown = (event: PointerEvent) => {
        const target = event.target instanceof Element ? event.target : null;
        setActiveTableFromTarget(target);
        setActiveImageFromTarget(target);
        if (target?.closest(".milkdown-code-block")) {
          scheduleActiveCodeBlockRefresh(event.target);
          closeWikiSuggest();
          return;
        }
        if (target?.closest(".wiki-suggest-popover")) return;

        const anchor = target?.closest<HTMLAnchorElement>("a[href]");
        const href = anchor?.getAttribute("href") ?? null;
        suppressPointerLinkExpand = Boolean(((event.ctrlKey || event.metaKey) || isWikiLinkHref(href)) && anchor);

        if (anchor && isWikiLinkHref(href)) {
          event.preventDefault();
          event.stopPropagation();
          if (event.button === 0 && href && onOpenLinkRef.current(href)) {
            suppressPointerLinkExpand = false;
          }
          return;
        }

        if (anchor && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          event.stopPropagation();
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
          if (pos !== undefined) {
            view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)).scrollIntoView());
          }
          const next = expandActiveLinkToMarkdown(view, expandedLinkRange);
          if (next) expandedLinkRange = next;
          view.focus();
          return;
        }

        if (!selectionInsideExpandedLink()) convertTypedMarkdownInline(view);
      };
      const handleDocumentPointerDown = (event: PointerEvent) => {
        if (event.target instanceof HTMLElement && event.target.closest(".wiki-suggest-popover")) return;
        if (view.dom.contains(event.target as Node)) return;
        setActiveTableBlock(null);
        clearActiveCodeBlock(view);
        clearActiveImageSource(view.dom);
        closeWikiSuggest();
        if (!convertExpandedLink()) convertTypedMarkdownInline(view);
      };
      const handleFocusOut = (event: FocusEvent) => {
        const target = event.target instanceof HTMLElement ? event.target : null;
        scheduleActiveCodeBlockRefresh(event.relatedTarget);
        if (target?.closest(".milkdown-code-block")) return;

        window.setTimeout(() => {
          if (!document.activeElement?.closest(".wiki-suggest-popover")) closeWikiSuggest();
        }, 0);
        if (!convertExpandedLink()) convertTypedMarkdownInline(view);
        refreshLocalImagePreviews(view.dom, imagePreviewMapRef.current);
      };
      const handleClick = (event: MouseEvent) => {
        const target = event.target instanceof Element ? event.target : null;
        setActiveTableFromTarget(target);
        setActiveImageFromTarget(target);
        scheduleActiveCodeBlockRefresh(event.target);
        const languageButton = target?.closest<HTMLButtonElement>(".language-button");
        if (languageButton) {
          finishLanguageEdit(languageButton);
          return;
        }

        const anchor = target?.closest<HTMLAnchorElement>("a[href]");
        if (!anchor) return;

        const href = anchor.getAttribute("href");
        if (!href) return;

        if (isWikiLinkHref(href) || event.ctrlKey || event.metaKey) {
          if (onOpenLinkRef.current(href)) {
            suppressPointerLinkExpand = false;
            event.preventDefault();
            event.stopPropagation();
          }
          return;
        }

        event.preventDefault();
        event.stopPropagation();
      };
      const handleSelectionChange = () => {
        scheduleActiveCodeBlockRefresh();
        if (codeBlockDomAtSelection(view) || document.activeElement?.closest(".milkdown-code-block")) return;

        scheduleLinkExpandRefresh();
        scheduleActiveTableRefresh();
        scheduleActiveImageRefresh();
      };

      window.addEventListener("keydown", handleKeyDown, { capture: true });
      view.dom.addEventListener("keyup", handleKeyUp, { capture: true });
      view.dom.addEventListener("input", handleInput, { capture: true });
      view.dom.addEventListener("paste", handlePaste, { capture: true });
      view.dom.addEventListener("pointerdown", handlePointerDown, { capture: true });
      view.dom.addEventListener("focusout", handleFocusOut, { capture: true });
      view.dom.addEventListener("click", handleClick, { capture: true });
      document.addEventListener("selectionchange", handleSelectionChange);
      document.addEventListener("pointerdown", handleDocumentPointerDown, { capture: true });
      return () => {
        window.cancelAnimationFrame(linkExpandFrame);
        window.cancelAnimationFrame(activeTableFrame);
        window.cancelAnimationFrame(activeImageFrame);
        window.cancelAnimationFrame(activeCodeBlockFrame);
        window.cancelAnimationFrame(wikiSuggestFrame);
        window.removeEventListener("keydown", handleKeyDown, { capture: true });
        view.dom.removeEventListener("keyup", handleKeyUp, { capture: true });
        view.dom.removeEventListener("input", handleInput, { capture: true });
        view.dom.removeEventListener("paste", handlePaste, { capture: true });
        view.dom.removeEventListener("pointerdown", handlePointerDown, { capture: true });
        view.dom.removeEventListener("focusout", handleFocusOut, { capture: true });
        view.dom.removeEventListener("click", handleClick, { capture: true });
        document.removeEventListener("selectionchange", handleSelectionChange);
        document.removeEventListener("pointerdown", handleDocumentPointerDown, { capture: true });
        setActiveTableBlock(null);
        clearActiveCodeBlock(view);
        clearActiveImageSource(view.dom);
        clearNativeSelection(view);
        if (editorViewRef.current === view) editorViewRef.current = null;
      };
    });
  }, [getEditor, loading]);

  useEditor((root) => {
    return Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, initialMarkdownRef.current);
        ctx.set(remarkGFMPlugin.options.key, { singleTilde: false });
        ctx.update(codeBlockConfig.key, (defaultConfig) => ({
          ...defaultConfig,
          languages: codeBlockLanguages,
          noResultText: "No result",
          copyText: "",
          copyIcon: "",
        }));
        ctx.update(uploadConfig.key, (defaultConfig) => ({
          ...defaultConfig,
          enableHtmlFileUploader: true,
          uploader: async (files, schema) => {
            const imageFiles = Array.from(files ?? []).filter((file) => (
              file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name)
            ));
            if (!imageFiles.length) return [];

            const imported = await onImportImagesRef.current(imageFiles);
            const imageType = schema.nodes.image;
            if (!imageType) return [];
            return imported
              .map((image) => imageType.createAndFill({ src: image.src, alt: image.alt, title: "" }))
              .filter((node): node is NonNullable<typeof node> => Boolean(node));
          },
        }));
        ctx.update(tableBlockConfig.key, (defaultConfig) => ({
          ...defaultConfig,
          renderButton: renderTableButtonIcon,
        }));
        ctx.get(listenerCtx).markdownUpdated((ctx, nextMarkdown) => {
          const promotedFrontmatter = splitYamlFrontmatter(nextMarkdown);
          if (promotedFrontmatter) {
            const promotedBody = normalizeRichFrontmatterBody(promotedFrontmatter.body);
            frontmatterRef.current = promotedFrontmatter.frontmatter;
            latestBodyMarkdownRef.current = promotedBody;
            setFrontmatter(promotedFrontmatter);
            setFrontmatterContent(promotedFrontmatter.content);
            emitMarkdownChange(composeMarkdownWithFrontmatter(promotedFrontmatter.frontmatter, promotedBody));
            window.requestAnimationFrame(() => replaceAll(promotedBody)(ctx));
          } else {
            const nextBodyMarkdown = frontmatterRef.current ? normalizeRichFrontmatterBody(nextMarkdown) : nextMarkdown;
            latestBodyMarkdownRef.current = nextBodyMarkdown;
            emitMarkdownChange(composeMarkdownWithFrontmatter(frontmatterRef.current, nextBodyMarkdown));
            if (nextMarkdown !== nextBodyMarkdown) {
              window.requestAnimationFrame(() => replaceAll(nextBodyMarkdown)(ctx));
            }
          }
          if (editorViewRef.current) {
            window.requestAnimationFrame(() => refreshLocalImagePreviews(editorViewRef.current!.dom, imagePreviewMapRef.current));
          }
        });
      })
      .use(commonmark)
      .use(sereinGfm)
      .use([codeBlockConfig, sereinCodeBlockView, codeBlockSyntaxHighlight])
      .use(imageInlineComponent)
      .use(tableBlock)
      .use(upload)
      .use(history)
      .use(nestedEnterShortcut)
      .use(smartSelectAllShortcut)
      .use(richTabShortcut)
      .use(markdownLinkNavigationShortcut)
      .use(wikiLinkDecorations)
      .use(listener);
  }, []);

  const wikiOptions = wikiSuggest ? filterWikiSuggestions(wikiLinkSuggestions, wikiSuggest.query) : [];

  const wikiSuggestPopover = wikiSuggest ? (
    <div
      className="wiki-suggest-popover"
      style={{
        left: wikiSuggest.x,
        top: wikiSuggest.y,
      }}
      role="listbox"
      tabIndex={-1}
      onMouseDown={(event) => event.preventDefault()}
    >
      {wikiOptions.length ? wikiOptions.map((item, index) => (
        <button
          key={item.target}
          type="button"
          className={index === wikiSuggest.selectedIndex ? "active" : undefined}
          role="option"
          aria-selected={index === wikiSuggest.selectedIndex}
          onMouseEnter={() => {
            const nextState = { ...wikiSuggest, selectedIndex: index };
            wikiSuggestRef.current = nextState;
            setWikiSuggest(nextState);
          }}
          onClick={() => {
            void selectWikiTarget(item.target);
          }}
        >
          <span>{item.label}</span>
          <small>{item.description}</small>
        </button>
      )) : (
        <button
          type="button"
          className="active"
          role="option"
          aria-selected="true"
          disabled={!wikiSuggest.query.trim()}
          onClick={() => {
            void createWikiTarget();
          }}
        >
          <span>Create {wikiSuggest.query.trim() || "note"}</span>
          <small>New note in this vault</small>
        </button>
      )}
    </div>
  ) : null;

  const tagValues = splitYamlPropertyValue(frontmatterPropertyValue(frontmatter, "tags"));
  const aliasValues = splitYamlPropertyValue(frontmatterPropertyValue(frontmatter, "aliases"));
  const statusValue = frontmatterPropertyValue(frontmatter, "status").trim();
  const statusActive = statusValue.toLowerCase() === "active" || statusValue.toLowerCase() === "true";
  const showFrontmatterPanel = Boolean(frontmatter && showFrontmatterTagRow);
  const tagInputValue = tagValues.join(" ");
  const aliasInputValue = aliasValues.join(", ");
  const editorClassName = frontmatter
    ? `serein-rich-editor has-frontmatter${showFrontmatterPanel ? " show-frontmatter-row" : ""}`
    : "serein-rich-editor";

  return (
    <div className={editorClassName}>
      {showFrontmatterPanel ? (
        <div
          ref={frontmatterPanelRef}
          className="serein-frontmatter-panel"
          data-keyboard-reveal={frontmatterKeyboardReveal ? "true" : "false"}
          onBlur={handleFrontmatterBlur}
          onKeyDown={handleFrontmatterKeyDown}
          onPointerLeave={handleFrontmatterPointerLeave}
          aria-label={frontmatterLabels.properties}
        >
          <div className="serein-frontmatter-strip">
            <input
              ref={frontmatterTagsInputRef}
              className="serein-frontmatter-inline-input serein-frontmatter-tags-input"
              value={tagInputValue}
              aria-label={frontmatterLabels.tags}
              title={tagInputValue}
              spellCheck={false}
              onChange={(event) => updateFrontmatterProperty("tags", yamlListValueFromInput(event.target.value))}
            />
            <button
              type="button"
              className="serein-frontmatter-token"
              data-active={statusActive ? "true" : "false"}
              aria-label={frontmatterLabels.status}
              aria-pressed={statusActive}
              title={statusActive ? frontmatterLabels.active : frontmatterLabels.inactive}
              onClick={(event) => {
                event.stopPropagation();
                updateFrontmatterProperty("status", statusActive ? "inactive" : "active");
              }}
            >
              <span className="serein-frontmatter-token-edge">--</span>
              <span className="serein-frontmatter-token-core">- tags -</span>
              <span className="serein-frontmatter-token-edge">--</span>
            </button>
            <div className="serein-frontmatter-alias-cell">
              <input
                ref={frontmatterAliasesInputRef}
                className="serein-frontmatter-inline-input serein-frontmatter-aliases-input"
                value={aliasInputValue}
                aria-label={frontmatterLabels.aliases}
                title={aliasInputValue}
                spellCheck={false}
                onChange={(event) => updateFrontmatterProperty("aliases", yamlListValueFromInput(event.target.value))}
              />
            </div>
          </div>
        </div>
      ) : null}
      <Milkdown />
      {wikiSuggestPopover ? createPortal(wikiSuggestPopover, document.body) : null}
    </div>
  );
}

export function MilkdownEditor({
  markdown,
  onChange,
  onRichMarkdownBaseline,
  command,
  onCommandResult,
  onOpenLink,
  wikiLinkSuggestions,
  onCreateWikiLink,
  onImportImages,
  imagePreviewMap,
  showImageSourceOnFocus,
  normalizeWindowsImagePaths,
  showFrontmatterTagRow,
  frontmatterLabels,
}: MilkdownEditorProps) {
  return (
    <MilkdownProvider>
      <EditorSurface
        markdown={markdown}
        onChange={onChange}
        onRichMarkdownBaseline={onRichMarkdownBaseline}
        command={command}
        onCommandResult={onCommandResult}
        onOpenLink={onOpenLink}
        wikiLinkSuggestions={wikiLinkSuggestions}
        onCreateWikiLink={onCreateWikiLink}
        onImportImages={onImportImages}
        imagePreviewMap={imagePreviewMap}
        showImageSourceOnFocus={showImageSourceOnFocus}
        normalizeWindowsImagePaths={normalizeWindowsImagePaths}
        showFrontmatterTagRow={showFrontmatterTagRow}
        frontmatterLabels={frontmatterLabels}
      />
    </MilkdownProvider>
  );
}
