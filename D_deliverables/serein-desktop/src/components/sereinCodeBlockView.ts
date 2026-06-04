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
import { codeBlockConfig } from "@milkdown/kit/component/code-block";
import type { CodeBlockConfig } from "@milkdown/kit/component/code-block";
import { $view } from "@milkdown/kit/utils";

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
  if (!text || !navigator.clipboard?.writeText) return;
  navigator.clipboard.writeText(text).catch(() => undefined);
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
        key: "Mod-z",
        run: () => undo(this.view.state, this.view.dispatch),
      },
      {
        key: "Shift-Mod-z",
        run: () => redo(this.view.state, this.view.dispatch),
      },
      {
        key: "Mod-y",
        run: () => redo(this.view.state, this.view.dispatch),
      },
      {
        key: "Backspace",
        run: () => this.turnEmptyCodeBlockIntoParagraph(),
      },
    ];
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
      this.updatingFromProseMirror = true;
      this.cm.dispatch({
        changes: { from: change.from, to: change.to, insert: change.text },
        scrollIntoView: true,
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
