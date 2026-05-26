import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { defaultHighlightStyle, LanguageDescription, syntaxHighlighting } from "@codemirror/language";
import { languages as codeMirrorLanguages } from "@codemirror/language-data";
import { EditorView as CodeMirrorView } from "@codemirror/view";
import { commandsCtx, defaultValueCtx, Editor, editorViewCtx, rootCtx } from "@milkdown/kit/core";
import { codeBlockComponent, codeBlockConfig } from "@milkdown/kit/component/code-block";
import { imageInlineComponent } from "@milkdown/kit/component/image-inline";
import { tableBlock } from "@milkdown/kit/component/table-block";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { history } from "@milkdown/kit/plugin/history";
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
import { gfm, insertTableCommand, toggleStrikethroughCommand } from "@milkdown/kit/preset/gfm";
import { lift, selectAll } from "@milkdown/kit/prose/commands";
import { liftListItem, splitListItem } from "@milkdown/kit/prose/schema-list";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { Command } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose, $shortcut } from "@milkdown/kit/utils";
import { Milkdown, MilkdownProvider, useEditor, useInstance } from "@milkdown/react";
import type { EditorCommandSignal } from "../domain/model";

type MilkdownEditorProps = {
  markdown: string;
  onChange: (markdown: string) => void;
  command: EditorCommandSignal | null;
  onOpenLink: (href: string) => boolean;
  wikiLinkSuggestions: WikiLinkSuggestion[];
  onCreateWikiLink: (target: string) => Promise<string | null>;
  onImportImages: (files: File[]) => Promise<Array<{ src: string; alt: string }>>;
  imagePreviewMap: Record<string, string>;
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

type WikiSuggestState = {
  from: number;
  to: number;
  query: string;
  x: number;
  y: number;
  selectedIndex: number;
};

const codeBlockLanguages = codeMirrorLanguages.map((language) => {
  if (language.name !== "Shell") return language;
  return LanguageDescription.of({
    name: "bash",
    alias: ["bash", "sh", "zsh", "shell"],
    extensions: ["sh", "ksh", "bash"],
    load: () => language.load(),
  });
});

function refreshLocalImagePreviews(root: HTMLElement, imagePreviewMap: Record<string, string>) {
  root.querySelectorAll<HTMLImageElement>("img[src]").forEach((image) => {
    const original = image.dataset.sereinSrc ?? image.getAttribute("src") ?? "";
    if (!image.dataset.sereinSrc) image.dataset.sereinSrc = original;
    const preview = imagePreviewMap[original.trim().replace(/^<|>$/g, "")];
    if (preview && image.getAttribute("src") !== preview) image.setAttribute("src", preview);
  });
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

const smartSelectAllShortcut = $shortcut(() => ({
  "Mod-a": selectCurrentCodeBlock,
}));

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

function exitCodeBlockAfter(view: EditorView, codeBlockDom: HTMLElement) {
  const pos = findCodeBlockPos(view, codeBlockDom);
  if (pos === null) return false;

  const node = view.state.doc.nodeAt(pos);
  const paragraph = view.state.schema.nodes.paragraph;
  if (!node || node.type.name !== "code_block" || !paragraph) return false;

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

function activeCodeMirrorLine(codeBlockDom: HTMLElement) {
  const cm = CodeMirrorView.findFromDOM(codeBlockDom);
  if (cm) {
    const line = cm.state.doc.lineAt(cm.state.selection.main.head);
    return {
      isLastLine: line.number === cm.state.doc.lines,
      isBlank: line.text.trim() === "",
    };
  }

  const activeLine = document.getSelection()?.anchorNode instanceof Node
    ? document.getSelection()?.anchorNode?.parentElement?.closest<HTMLElement>(".cm-line")
    : null;
  const lines = [...codeBlockDom.querySelectorAll<HTMLElement>(".cm-line")];

  return {
    isLastLine: Boolean(activeLine && lines[lines.length - 1] === activeLine),
    isBlank: (activeLine?.textContent ?? "").trim() === "",
  };
}

function currentLanguageText(button: HTMLButtonElement) {
  return button.getAttribute("data-language-draft") ?? button.textContent?.trim() ?? "";
}

function beginLanguageEdit(button: HTMLButtonElement, initialValue?: string) {
  const value = initialValue ?? button.textContent?.trim() ?? "";
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

function commitLanguageDraft(view: EditorView, codeBlockDom: HTMLElement, button: HTMLButtonElement) {
  updateCodeBlockLanguage(view, codeBlockDom, currentLanguageText(button));
  finishLanguageEdit(button);
  closeLanguagePicker(button);
  CodeMirrorView.findFromDOM(codeBlockDom)?.focus();
}

function convertTypedMarkdownLink(view: EditorView) {
  const { state } = view;
  const { selection } = state;
  if (!selection.empty) return false;

  const $from = selection.$from;
  if ($from.parent.type.name !== "paragraph") return false;

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, "\n", "\n");
  const match = textBefore.match(/\[([^\]\n]+)\]\(([^)\n]+)\)$/);
  if (!match) return false;

  const [, label, rawHref] = match;
  const href = rawHref.trim();
  if (!label || !href) return false;

  const link = state.schema.marks.link;
  if (!link) return false;

  const from = selection.from - match[0].length;
  const to = selection.from;
  let tr = state.tr.insertText(label, from, to);
  tr = tr.addMark(from, from + label.length, link.create({ href, title: null }));
  tr = tr.setSelection(TextSelection.create(tr.doc, from + label.length));
  view.dispatch(tr.scrollIntoView());
  return true;
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
  if ($from.parent.type.name !== "paragraph") return null;

  const parentText = $from.parent.textBetween(0, $from.parent.content.size, "\n", "\n");
  const pattern = /\[([^\]\n]+)\]\(([^)\n]+)\)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(parentText)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if ($from.parentOffset < start || $from.parentOffset > end) continue;
    return {
      from: $from.start() + start,
      to: $from.start() + end,
    };
  }

  return null;
}

function convertMarkdownLinkRange(view: EditorView, range: ExpandedLinkRange | null) {
  if (!range) return false;

  const cursorPos = view.state.selection.empty ? view.state.selection.from : null;
  const text = view.state.doc.textBetween(range.from, range.to, "\n", "\n");
  const match = text.match(/^\[([^\]\n]+)\]\(([^)\n]+)\)$/);
  if (!match) return false;

  const [, label, rawHref] = match;
  const href = rawHref.trim();
  if (!label || !href) return false;

  const link = view.state.schema.marks.link;
  if (!link) return false;

  let tr = view.state.tr.insertText(label, range.from, range.to);
  tr = tr.addMark(range.from, range.from + label.length, link.create({ href, title: null }));
  if (cursorPos !== null) {
    const removedLength = text.length - label.length;
    let nextPos = range.from + label.length;

    if (cursorPos <= range.from) {
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
  const markdown = `[${label}](${range.href})`;
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

function runEditorCommand(editor: Editor, command: EditorCommandSignal) {
  editor.action((ctx) => {
    const commands = ctx.get(commandsCtx);
    const view = ctx.get(editorViewCtx);
    view.focus();

    switch (command.action) {
      case "paragraph":
        commands.call(turnIntoTextCommand.key);
        break;
      case "heading1":
        commands.call(wrapInHeadingCommand.key, 1);
        break;
      case "heading2":
        commands.call(wrapInHeadingCommand.key, 2);
        break;
      case "heading3":
        commands.call(wrapInHeadingCommand.key, 3);
        break;
      case "blockquote":
        commands.call(wrapInBlockquoteCommand.key);
        break;
      case "bulletList":
        commands.call(wrapInBulletListCommand.key);
        break;
      case "orderedList":
        commands.call(wrapInOrderedListCommand.key);
        break;
      case "codeBlock":
        commands.call(createCodeBlockCommand.key);
        break;
      case "table":
        commands.call(insertTableCommand.key, { row: 3, col: 3 });
        break;
      case "image":
        if (command.payload) {
          commands.call(insertImageCommand.key, { src: command.payload, alt: command.alt ?? "" });
        }
        break;
      case "bold":
        commands.call(toggleStrongCommand.key);
        break;
      case "italic":
        commands.call(toggleEmphasisCommand.key);
        break;
      case "inlineCode":
        commands.call(toggleInlineCodeCommand.key);
        break;
      case "strike":
        commands.call(toggleStrikethroughCommand.key);
        break;
      case "link":
        if (command.payload) {
          commands.call(toggleLinkCommand.key, { href: command.payload });
        }
        break;
      case "selectAllSmart":
        commands.inline(selectCurrentCodeBlock) || commands.inline(selectAll);
        break;
      default:
        break;
    }
  });
}

function EditorSurface({ markdown, onChange, command, onOpenLink, wikiLinkSuggestions, onCreateWikiLink, onImportImages, imagePreviewMap }: MilkdownEditorProps) {
  const initialMarkdownRef = useRef(markdown);
  const onChangeRef = useRef(onChange);
  const onOpenLinkRef = useRef(onOpenLink);
  const wikiLinkSuggestionsRef = useRef(wikiLinkSuggestions);
  const onCreateWikiLinkRef = useRef(onCreateWikiLink);
  const onImportImagesRef = useRef(onImportImages);
  const imagePreviewMapRef = useRef(imagePreviewMap);
  const editorViewRef = useRef<EditorView | null>(null);
  const wikiSuggestRef = useRef<WikiSuggestState | null>(null);
  const [wikiSuggest, setWikiSuggest] = useState<WikiSuggestState | null>(null);
  const [loading, getEditor] = useInstance();

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

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
    runEditorCommand(editor, command);
  }, [command, getEditor, loading]);

  useEffect(() => {
    if (loading) return undefined;
    const editor = getEditor();
    if (!editor) return undefined;

    return editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      editorViewRef.current = view;
      refreshLocalImagePreviews(view.dom, imagePreviewMapRef.current);
      const maybeConvertBeforeCursorMove = (event: KeyboardEvent) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Tab"].includes(event.key)) return false;
        return convertTypedMarkdownLink(view);
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
          const currentRawRange = markdownLinkTextRangeAtCursor(view);
          if (currentRawRange) {
            expandedLinkRange = currentRawRange;
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
      const handleKeyDown = (event: KeyboardEvent) => {
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

        const target = event.target instanceof HTMLElement ? event.target : null;
        const codeBlock = target?.closest<HTMLElement>(".milkdown-code-block") ?? null;
        const languageButton = target?.closest<HTMLButtonElement>(".language-button") ?? null;
        const isPlainArrowDown = event.key === "ArrowDown" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;

        if (codeBlock && languageButton) {
          if (!languageButton.hasAttribute("data-language-draft")) beginLanguageEdit(languageButton);

          if (isPlainArrowDown) {
            event.preventDefault();
            event.stopPropagation();
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
            const cm = CodeMirrorView.findFromDOM(codeBlock);
            cm?.focus();
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

        const languageSearchInput = target?.closest<HTMLInputElement>(".search-input") ?? null;
        if (codeBlock && languageSearchInput) {
          const button = codeBlock.querySelector<HTMLButtonElement>(".language-button");
          if (!button) return;

          if (isPlainArrowDown) {
            event.preventDefault();
            event.stopPropagation();
            focusLanguagePickerItem(codeBlock, 1);
            return;
          }

          if (event.key === "Enter" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
            event.preventDefault();
            event.stopPropagation();
            commitLanguageDraft(view, codeBlock, button);
            return;
          }
        }

        const languagePickerItem = target?.closest<HTMLElement>(".language-list-item[data-language]") ?? null;
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
            CodeMirrorView.findFromDOM(codeBlock)?.focus();
            return;
          }
        }

        if (event.key === "Enter" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && convertTypedMarkdownLink(view)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        if (codeBlock && isPlainArrowDown && target?.closest(".cm-editor")) {
          const { isLastLine } = activeCodeMirrorLine(codeBlock);
          if (!isLastLine) return;

          const languageButton = codeBlock.querySelector<HTMLButtonElement>(".language-button");
          if (!languageButton) return;

          event.preventDefault();
          event.stopPropagation();
          beginLanguageEdit(languageButton);
          languageButton.focus();
          return;
        }

        if (codeBlock && event.key === "Enter" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && target?.closest(".cm-editor")) {
          const { isLastLine, isBlank } = activeCodeMirrorLine(codeBlock);
          if (!isLastLine || !isBlank) return;

          event.preventDefault();
          event.stopPropagation();
          exitCodeBlockAfter(view, codeBlock);
          return;
        }

        const isSelectAll = (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "a";
        if (isSelectAll) {
          const handled = selectCurrentCodeBlock(view.state, view.dispatch, view);
          if (!handled) return;
          event.preventDefault();
          event.stopPropagation();
        }
      };
      const handleKeyUp = (event: KeyboardEvent) => {
        if (!event.ctrlKey && !event.metaKey && !event.altKey) {
          scheduleWikiSuggestUpdate();
        }

        if (event.key === ")") {
          if (convertTypedMarkdownLink(view)) {
            suppressNextLinkExpand = true;
            refreshLocalImagePreviews(view.dom, imagePreviewMapRef.current);
            return;
          }
        }

        if (expandedLinkRange && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
          expandedLinkRange = markdownLinkTextRangeAtCursor(view) ?? expandedLinkRange;
          return;
        }

        if (selectionInsideExpandedLink()) {
          expandedLinkRange = markdownLinkTextRangeAtCursor(view) ?? expandedLinkRange;
          return;
        }

        scheduleLinkExpandRefresh();
      };
      const handleInput = () => {
        scheduleWikiSuggestUpdate();
      };
      const handlePointerDown = (event: PointerEvent) => {
        const target = event.target instanceof HTMLElement ? event.target : null;
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

        if (!selectionInsideExpandedLink()) convertTypedMarkdownLink(view);
      };
      const handleDocumentPointerDown = (event: PointerEvent) => {
        if (event.target instanceof HTMLElement && event.target.closest(".wiki-suggest-popover")) return;
        if (view.dom.contains(event.target as Node)) return;
        closeWikiSuggest();
        if (!convertExpandedLink()) convertTypedMarkdownLink(view);
      };
      const handleFocusOut = () => {
        window.setTimeout(() => {
          if (!document.activeElement?.closest(".wiki-suggest-popover")) closeWikiSuggest();
        }, 0);
        if (!convertExpandedLink()) convertTypedMarkdownLink(view);
        refreshLocalImagePreviews(view.dom, imagePreviewMapRef.current);
      };
      const handleClick = (event: MouseEvent) => {
        const target = event.target instanceof HTMLElement ? event.target : null;
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
        scheduleLinkExpandRefresh();
      };

      view.dom.addEventListener("keydown", handleKeyDown, { capture: true });
      view.dom.addEventListener("keyup", handleKeyUp, { capture: true });
      view.dom.addEventListener("input", handleInput, { capture: true });
      view.dom.addEventListener("pointerdown", handlePointerDown, { capture: true });
      view.dom.addEventListener("pointerup", scheduleLinkExpandRefresh, { capture: true });
      view.dom.addEventListener("focusout", handleFocusOut, { capture: true });
      view.dom.addEventListener("click", handleClick, { capture: true });
      document.addEventListener("selectionchange", scheduleLinkExpandRefresh);
      document.addEventListener("pointerdown", handleDocumentPointerDown, { capture: true });
      return () => {
        window.cancelAnimationFrame(linkExpandFrame);
        window.cancelAnimationFrame(wikiSuggestFrame);
        view.dom.removeEventListener("keydown", handleKeyDown, { capture: true });
        view.dom.removeEventListener("keyup", handleKeyUp, { capture: true });
        view.dom.removeEventListener("input", handleInput, { capture: true });
        view.dom.removeEventListener("pointerdown", handlePointerDown, { capture: true });
        view.dom.removeEventListener("pointerup", scheduleLinkExpandRefresh, { capture: true });
        view.dom.removeEventListener("focusout", handleFocusOut, { capture: true });
        view.dom.removeEventListener("click", handleClick, { capture: true });
        document.removeEventListener("selectionchange", scheduleLinkExpandRefresh);
        document.removeEventListener("pointerdown", handleDocumentPointerDown, { capture: true });
        if (editorViewRef.current === view) editorViewRef.current = null;
      };
    });
  }, [getEditor, loading]);

  useEditor((root) => {
    return Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, initialMarkdownRef.current);
        ctx.update(codeBlockConfig.key, (defaultConfig) => ({
          ...defaultConfig,
          extensions: [
            syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
            CodeMirrorView.lineWrapping,
          ],
          languages: codeBlockLanguages,
          expandIcon: "",
          searchIcon: "",
          clearSearchIcon: "",
          searchPlaceholder: "",
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
        ctx.get(listenerCtx).markdownUpdated((_, nextMarkdown) => {
          onChangeRef.current(nextMarkdown);
          if (editorViewRef.current) {
            window.requestAnimationFrame(() => refreshLocalImagePreviews(editorViewRef.current!.dom, imagePreviewMapRef.current));
          }
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(codeBlockComponent)
      .use(imageInlineComponent)
      .use(tableBlock)
      .use(upload)
      .use(history)
      .use(nestedEnterShortcut)
      .use(smartSelectAllShortcut)
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

  return (
    <>
      <Milkdown />
      {wikiSuggestPopover ? createPortal(wikiSuggestPopover, document.body) : null}
    </>
  );
}

export function MilkdownEditor({ markdown, onChange, command, onOpenLink, wikiLinkSuggestions, onCreateWikiLink, onImportImages, imagePreviewMap }: MilkdownEditorProps) {
  return (
    <MilkdownProvider>
      <EditorSurface
        markdown={markdown}
        onChange={onChange}
        command={command}
        onOpenLink={onOpenLink}
        wikiLinkSuggestions={wikiLinkSuggestions}
        onCreateWikiLink={onCreateWikiLink}
        onImportImages={onImportImages}
        imagePreviewMap={imagePreviewMap}
      />
    </MilkdownProvider>
  );
}
