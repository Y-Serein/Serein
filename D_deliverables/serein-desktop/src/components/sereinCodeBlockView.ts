import type { LanguageDescription, LanguageSupport } from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { EditorView as CodeMirrorView, keymap } from "@codemirror/view";
import type { ViewUpdate } from "@codemirror/view";
import { redo, undo } from "@milkdown/kit/prose/history";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView, NodeView } from "@milkdown/kit/prose/view";
import { codeBlockSchema } from "@milkdown/kit/preset/commonmark";
import { $view } from "@milkdown/kit/utils";
import { codeBlockConfig } from "./codeBlockConfig";
import type { CodeBlockConfig } from "./codeBlockConfig";
import { writeDesktopClipboardText } from "../services/clipboard";

type GetPos = () => number | undefined;

class LanguageLoader {
  private readonly map: Record<string, LanguageDescription> = {};

  constructor(private readonly languages: LanguageDescription[]) {
    languages.forEach((language) => {
      this.map[language.name.toLowerCase()] = language;
      language.alias.forEach((alias) => {
        this.map[alias.toLowerCase()] = language;
      });
    });
  }

  getAll() {
    return this.languages.map((language) => ({
      name: language.name,
      alias: language.alias,
    }));
  }

  load(languageName: string): Promise<LanguageSupport | undefined> {
    const language = this.map[languageName.trim().toLowerCase()];
    if (!language) return Promise.resolve(undefined);
    if (language.support) return Promise.resolve(language.support);
    return language.load();
  }
}

function computeChange(oldValue: string, newValue: string) {
  if (oldValue === newValue) return null;

  let start = 0;
  let oldEnd = oldValue.length;
  let newEnd = newValue.length;

  while (start < oldEnd && oldValue.charCodeAt(start) === newValue.charCodeAt(start)) start += 1;
  while (
    oldEnd > start
    && newEnd > start
    && oldValue.charCodeAt(oldEnd - 1) === newValue.charCodeAt(newEnd - 1)
  ) {
    oldEnd -= 1;
    newEnd -= 1;
  }

  return { from: start, to: oldEnd, text: newValue.slice(start, newEnd) };
}

function clipboardWriteText(text: string) {
  writeDesktopClipboardText(text);
}

class SereinCodeMirrorBlock implements NodeView {
  dom: HTMLElement;

  private node: ProseMirrorNode;
  private readonly cm: CodeMirrorView;
  private readonly host: HTMLDivElement;
  private readonly tools: HTMLDivElement;
  private readonly languageButton: HTMLButtonElement;
  private readonly languagePicker: HTMLDivElement;
  private readonly languageList: HTMLUListElement;
  private readonly languageConf = new Compartment();
  private readonly readOnlyConf = new Compartment();
  private updatingFromProseMirror = false;
  private dispatchingToProseMirror = false;
  private languageName = "";
  private languageRequestId = 0;

  constructor(
    node: ProseMirrorNode,
    private readonly view: EditorView,
    private readonly getPos: GetPos,
    private readonly loader: LanguageLoader,
    private readonly config: CodeBlockConfig,
  ) {
    this.node = node;
    this.host = document.createElement("div");
    this.host.className = "codemirror-host";

    this.cm = new CodeMirrorView({
      doc: this.node.textContent,
      root: this.view.root,
      extensions: [
        this.readOnlyConf.of(EditorState.readOnly.of(!this.view.editable)),
        CodeMirrorView.lineWrapping,
        keymap.of(this.codeMirrorKeymap()),
        CodeMirrorView.domEventHandlers({
          copy: (event) => this.handleClipboardEvent(event, "copy"),
          cut: (event) => this.handleClipboardEvent(event, "cut"),
        }),
        this.languageConf.of([]),
        EditorState.changeFilter.of(() => this.view.editable),
        ...(this.config.extensions as Extension[]),
        CodeMirrorView.updateListener.of(this.forwardUpdate),
      ],
    });
    this.host.appendChild(this.cm.dom);

    this.tools = document.createElement("div");
    this.tools.className = "tools";

    this.languageButton = document.createElement("button");
    this.languageButton.type = "button";
    this.languageButton.className = "language-button";
    this.languageButton.dataset.expanded = "false";
    this.languageButton.addEventListener("click", this.toggleLanguagePicker);

    this.languagePicker = document.createElement("div");
    this.languagePicker.className = "language-picker";

    const listWrapper = document.createElement("div");
    listWrapper.className = "list-wrapper";
    this.languageList = document.createElement("ul");
    this.languageList.className = "language-list";
    this.languageList.setAttribute("role", "listbox");
    listWrapper.appendChild(this.languageList);
    this.languagePicker.appendChild(listWrapper);

    this.tools.appendChild(this.languageButton);
    this.tools.appendChild(this.languagePicker);

    const toolsButtonGroup = document.createElement("div");
    toolsButtonGroup.className = "tools-button-group";
    this.tools.appendChild(toolsButtonGroup);
    if (this.config.copyText || this.config.copyIcon) {
      const copyButton = document.createElement("button");
      copyButton.type = "button";
      copyButton.className = "copy-button";
      copyButton.textContent = this.config.copyText || "Copy";
      copyButton.addEventListener("click", () => {
        const text = this.cm.state.doc.toString();
        clipboardWriteText(text);
        this.config.onCopy?.(text);
      });
      toolsButtonGroup.appendChild(copyButton);
    }

    this.dom = document.createElement("div");
    this.dom.className = "milkdown-code-block";
    this.dom.appendChild(this.tools);
    this.dom.appendChild(this.host);

    this.updateLanguage();
  }

  private forwardUpdate = (update: ViewUpdate) => {
    if (this.updatingFromProseMirror || !update.docChanged) return;

    const pos = this.getPos();
    if (typeof pos !== "number") return;

    let offset = pos + 1;
    const tr = this.view.state.tr;
    const { main } = update.state.selection;
    const selectionFrom = offset + main.from;
    const selectionTo = offset + main.to;

    update.changes.iterChanges((fromA, toA, fromB, toB, text) => {
      const insert = text.toString();
      if (insert.length) {
        tr.replaceWith(offset + fromA, offset + toA, this.view.state.schema.text(insert));
      } else {
        tr.delete(offset + fromA, offset + toA);
      }
      offset += toB - fromB - (toA - fromA);
    });
    tr.setSelection(TextSelection.create(tr.doc, selectionFrom, selectionTo));

    this.dispatchingToProseMirror = true;
    this.view.dispatch(tr);
    this.dispatchingToProseMirror = false;
  };

  private codeMirrorKeymap() {
    return [
      {
        key: "Mod-c",
        run: () => this.runClipboardCommand("copy"),
      },
      {
        key: "Mod-x",
        run: () => this.runClipboardCommand("cut"),
      },
      {
        key: "Mod-a",
        run: () => {
          this.cm.dispatch({ selection: { anchor: 0, head: this.cm.state.doc.length } });
          return true;
        },
      },
      {
        key: "Tab",
        run: () => this.handleTab(false),
      },
      {
        key: "Shift-Tab",
        run: () => this.handleTab(true),
      },
      {
        key: "Mod-z",
        run: () => this.runHistoryCommand("undo"),
      },
      {
        key: "Shift-Mod-z",
        run: () => this.runHistoryCommand("redo"),
      },
      {
        key: "Mod-y",
        run: () => this.runHistoryCommand("redo"),
      },
      {
        key: "Backspace",
        run: () => this.turnEmptyCodeBlockIntoParagraph(),
      },
    ];
  }

  private codeMirrorSelectionFromProseMirror(node: ProseMirrorNode = this.node) {
    const pos = this.getPos();
    if (typeof pos !== "number") return null;

    const base = pos + 1;
    const docLength = node.textContent.length;
    const selection = this.view.state.selection;
    const selectionStart = Math.min(selection.anchor, selection.head);
    const selectionEnd = Math.max(selection.anchor, selection.head);
    if (selectionStart < base || selectionEnd > base + docLength) return null;

    const clampOffset = (value: number) => Math.min(Math.max(value - base, 0), docLength);
    return {
      anchor: clampOffset(selection.anchor),
      head: clampOffset(selection.head),
    };
  }

  private syncCodeMirrorSelectionFromProseMirror(scrollIntoView = false) {
    const selection = this.codeMirrorSelectionFromProseMirror();
    if (!selection) return false;

    this.cm.focus();
    this.cm.dispatch({ selection, scrollIntoView });
    return true;
  }

  private editorScroller() {
    let node: HTMLElement | null = this.dom.parentElement;
    while (node && node !== document.body) {
      const style = window.getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node;
      node = node.parentElement;
    }
    return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null;
  }

  private selectionVisibleInEditor(scroller: HTMLElement | null) {
    if (!scroller) return true;
    try {
      const coords = this.cm.coordsAtPos(this.cm.state.selection.main.head);
      if (!coords) return true;
      const viewport = scroller === document.scrollingElement
        ? { top: 0, bottom: window.innerHeight }
        : scroller.getBoundingClientRect();
      return coords.bottom >= viewport.top + 2 && coords.top <= viewport.bottom - 2;
    } catch {
      return true;
    }
  }

  private codeMirrorPositionSnapshot() {
    const { anchor, head } = this.cm.state.selection.main;
    const doc = this.cm.state.doc;
    const anchorLine = doc.lineAt(anchor);
    const headLine = doc.lineAt(head);
    return {
      anchor,
      head,
      anchorLine: anchorLine.number,
      anchorColumn: anchor - anchorLine.from,
      headLine: headLine.number,
      headColumn: head - headLine.from,
    };
  }

  private positionFromLineColumn(lineNumber: number, column: number) {
    const doc = this.cm.state.doc;
    const line = doc.line(Math.min(Math.max(lineNumber, 1), doc.lines));
    return Math.min(line.from + column, line.to);
  }

  private selectionFromHistoryFallback(snapshot: ReturnType<SereinCodeMirrorBlock["codeMirrorPositionSnapshot"]>) {
    const fromProseMirror = this.codeMirrorSelectionFromProseMirror();
    const historySelectionLooksLikeStart = Boolean(
      fromProseMirror
        && fromProseMirror.anchor === 0
        && fromProseMirror.head === 0
        && (snapshot.anchor > 0 || snapshot.head > 0)
        && this.cm.state.doc.length > 0,
    );
    if (fromProseMirror && !historySelectionLooksLikeStart) return fromProseMirror;

    return {
      anchor: this.positionFromLineColumn(snapshot.anchorLine, snapshot.anchorColumn),
      head: this.positionFromLineColumn(snapshot.headLine, snapshot.headColumn),
    };
  }

  private setCodeBlockSelection(selection: { anchor: number; head: number }) {
    const docLength = this.cm.state.doc.length;
    const anchor = Math.min(Math.max(selection.anchor, 0), docLength);
    const head = Math.min(Math.max(selection.head, 0), docLength);
    this.cm.focus();
    this.cm.dispatch({ selection: { anchor, head } });

    const pos = this.getPos();
    if (typeof pos !== "number") return;
    const base = pos + 1;
    const tr = this.view.state.tr.setSelection(TextSelection.create(this.view.state.doc, base + anchor, base + head));
    this.view.dispatch(tr);
  }

  private centerCodeMirrorSelectionInEditor() {
    const head = this.cm.state.selection.main.head;
    this.cm.dispatch({ effects: CodeMirrorView.scrollIntoView(head, { y: "center" }) });
    window.requestAnimationFrame(() => {
      const scroller = this.editorScroller();
      if (!scroller) return;
      const coords = this.cm.coordsAtPos(this.cm.state.selection.main.head);
      if (!coords) return;
      const viewport = scroller === document.scrollingElement
        ? { top: 0, height: window.innerHeight }
        : scroller.getBoundingClientRect();
      const cursorCenter = (coords.top + coords.bottom) / 2;
      const viewportCenter = viewport.top + viewport.height / 2;
      scroller.scrollTop += cursorCenter - viewportCenter;
    });
  }

  private runHistoryCommand(action: "undo" | "redo") {
    const command = action === "undo" ? undo : redo;
    const scroller = this.editorScroller();
    const scrollTopBefore = scroller?.scrollTop ?? 0;
    const wasSelectionVisible = this.selectionVisibleInEditor(scroller);
    const selectionSnapshot = this.codeMirrorPositionSnapshot();
    const handled = command(this.view.state, this.view.dispatch);
    if (!handled) return false;

    const selection = this.selectionFromHistoryFallback(selectionSnapshot);
    this.setCodeBlockSelection(selection);
    if (wasSelectionVisible && scroller) {
      scroller.scrollTop = scrollTopBefore;
    } else {
      this.centerCodeMirrorSelectionInEditor();
    }
    window.requestAnimationFrame(() => {
      this.setCodeBlockSelection(selection);
      if (wasSelectionVisible && scroller) {
        scroller.scrollTop = scrollTopBefore;
      } else {
        this.centerCodeMirrorSelectionInEditor();
      }
    });
    return true;
  }

  private handleTab(outdent: boolean) {
    if (!this.view.editable) return true;

    if (!outdent) {
      if (this.shouldInsertIndentAtCursor()) {
        this.cm.dispatch(this.cm.state.replaceSelection("  "));
        return true;
      }

      const changes = this.selectedCodeLines()
        .map((line) => ({ from: line.from, insert: "  " }));
      if (changes.length) this.cm.dispatch({ changes });
      return true;
    }

    const changes = this.selectedCodeLines()
      .map((line) => {
        const prefix = this.cm.state.sliceDoc(line.from, Math.min(line.from + 2, line.to));
        const removeLength = prefix.startsWith("\t")
          ? 1
          : prefix.startsWith("  ")
            ? 2
            : prefix.startsWith(" ")
              ? 1
              : 0;

        return removeLength ? { from: line.from, to: line.from + removeLength } : null;
      })
      .filter((change): change is { from: number; to: number } => Boolean(change));

    if (changes.length) this.cm.dispatch({ changes });
    return true;
  }

  private shouldInsertIndentAtCursor() {
    const range = this.cm.state.selection.main;
    if (!range.empty || this.cm.state.selection.ranges.length > 1) return false;

    const line = this.cm.state.doc.lineAt(range.from);
    return range.from >= line.to;
  }

  private selectedCodeLines() {
    const lineNumbers = new Set<number>();
    const doc = this.cm.state.doc;

    for (const range of this.cm.state.selection.ranges) {
      const fromLine = doc.lineAt(range.from);
      const toPosition = range.empty ? range.to : Math.max(range.from, range.to - 1);
      const toLine = doc.lineAt(toPosition);
      for (let number = fromLine.number; number <= toLine.number; number += 1) {
        lineNumbers.add(number);
      }
    }

    return [...lineNumbers].sort((left, right) => left - right).map((number) => doc.line(number));
  }

  private selectedText() {
    return this.cm.state.selection.ranges
      .filter((range) => !range.empty)
      .map((range) => this.cm.state.sliceDoc(range.from, range.to))
      .join("\n");
  }

  private runClipboardCommand(command: "copy" | "cut") {
    const text = this.selectedText();
    if (!text) return false;

    clipboardWriteText(text);
    if (command === "cut") {
      if (!this.view.editable) return true;
      const transaction = this.cm.state.replaceSelection("");
      this.cm.dispatch({
        ...transaction,
        userEvent: "delete.cut",
      });
    }
    return true;
  }

  private handleClipboardEvent(event: ClipboardEvent, command: "copy" | "cut") {
    const text = this.selectedText();
    if (!text) return false;

    event.preventDefault();
    event.clipboardData?.setData("text/plain", text);
    if (!event.clipboardData) clipboardWriteText(text);
    if (command === "cut" && this.view.editable) {
      const transaction = this.cm.state.replaceSelection("");
      this.cm.dispatch({
        ...transaction,
        userEvent: "delete.cut",
      });
    }
    return true;
  }

  private turnEmptyCodeBlockIntoParagraph() {
    const range = this.cm.state.selection.main;
    if (!range.empty || range.anchor > 0) return false;
    if (this.cm.state.doc.lines >= 2 || this.cm.state.doc.length > 0) return false;

    const pos = this.getPos();
    const paragraph = this.view.state.schema.nodes.paragraph;
    if (typeof pos !== "number" || !paragraph) return false;

    const tr = this.view.state.tr.replaceWith(pos, pos + this.node.nodeSize, paragraph.create());
    tr.setSelection(TextSelection.near(tr.doc.resolve(pos)));
    this.view.dispatch(tr.scrollIntoView());
    this.view.focus();
    return true;
  }

  private toggleLanguagePicker = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!this.view.editable) return;

    const expanded = this.languageButton.dataset.expanded === "true";
    if (expanded) {
      this.closeLanguagePicker();
      return;
    }

    this.languageButton.dataset.expanded = "true";
    this.renderLanguageList();
  };

  private closeLanguagePicker() {
    this.languageButton.dataset.expanded = "false";
    this.languageList.replaceChildren();
  }

  private renderLanguageList() {
    const currentLanguage = String(this.node.attrs.language ?? "");
    const languages = this.loader.getAll();
    const selected = languages.find((language) => language.name.toLowerCase() === currentLanguage.toLowerCase());
    const items = selected ? [selected, ...languages.filter((language) => language !== selected)] : languages;

    this.languageList.replaceChildren();
    if (!items.length) {
      const emptyItem = document.createElement("li");
      emptyItem.className = "language-list-item no-result";
      emptyItem.textContent = this.config.noResultText;
      this.languageList.appendChild(emptyItem);
      return;
    }

    items.forEach((language) => {
      const item = document.createElement("li");
      item.className = "language-list-item";
      item.tabIndex = 0;
      item.dataset.language = language.name;
      item.setAttribute("role", "listitem");
      item.setAttribute("aria-selected", String(language === selected));
      item.textContent = this.config.renderLanguage(language.name, language === selected);
      item.addEventListener("click", () => {
        this.setLanguage(language.name);
        this.closeLanguagePicker();
        this.cm.focus();
      });
      this.languageList.appendChild(item);
    });
  }

  private setLanguage(language: string) {
    const pos = this.getPos();
    if (typeof pos !== "number") return;
    this.view.dispatch(this.view.state.tr.setNodeAttribute(pos, "language", language));
  }

  private updateLanguage() {
    const languageName = String(this.node.attrs.language ?? "");
    this.languageButton.textContent = languageName || "Text";
    if (languageName === this.languageName) return;

    this.languageName = languageName;
    const requestId = ++this.languageRequestId;
    this.loader.load(languageName)
      .then((language) => {
        if (requestId !== this.languageRequestId) return;
        this.cm.dispatch({
          effects: this.languageConf.reconfigure(language ?? []),
        });
      })
      .catch((error: unknown) => {
        if (requestId !== this.languageRequestId) return;
        console.warn("Failed to load code block language", error);
        this.cm.dispatch({
          effects: this.languageConf.reconfigure([]),
        });
      });
  }

  update(node: ProseMirrorNode) {
    if (node.type !== this.node.type) return false;

    this.node = node;
    this.updateLanguage();

    if (this.view.editable === this.cm.state.readOnly) {
      this.cm.dispatch({
        effects: this.readOnlyConf.reconfigure(EditorState.readOnly.of(!this.view.editable)),
      });
    }

    const change = computeChange(this.cm.state.doc.toString(), node.textContent);
    if (change) {
      const selection = this.codeMirrorSelectionFromProseMirror(node);
      this.updatingFromProseMirror = true;
      this.cm.dispatch({
        changes: { from: change.from, to: change.to, insert: change.text },
        ...(selection ? { selection } : {}),
        scrollIntoView: Boolean(selection),
      });
      this.updatingFromProseMirror = false;
    }

    return true;
  }

  setSelection(anchor: number, head: number) {
    if (!this.cm.dom.isConnected || this.dispatchingToProseMirror || this.cm.hasFocus) return;
    this.cm.focus();
    this.cm.dispatch({ selection: { anchor, head } });
  }

  selectNode() {
    this.dom.classList.add("selected");
    if (!this.cm.hasFocus) this.cm.focus();
  }

  deselectNode() {
    this.dom.classList.remove("selected");
  }

  stopEvent() {
    return true;
  }

  ignoreMutation() {
    return true;
  }

  destroy() {
    this.languageButton.removeEventListener("click", this.toggleLanguagePicker);
    this.cm.destroy();
  }
}

export const sereinCodeBlockView = $view(codeBlockSchema.node, (ctx) => {
  const config = ctx.get(codeBlockConfig.key);
  const languageLoader = new LanguageLoader(config.languages);
  return (node, view, getPos) => new SereinCodeMirrorBlock(node, view, getPos as GetPos, languageLoader, config);
});
