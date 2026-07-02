import type { LanguageDescription } from "@codemirror/language";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView, NodeView, ViewMutationRecord } from "@milkdown/kit/prose/view";
import { codeBlockSchema } from "@milkdown/kit/preset/commonmark";
import { $view } from "@milkdown/kit/utils";
import { codeBlockConfig } from "./codeBlockConfig";
import type { CodeBlockConfig } from "./codeBlockConfig";
import { writeDesktopClipboardText } from "../services/clipboard";

type GetPos = () => number | undefined;

class CodeBlockLanguageOptions {
  constructor(private readonly languages: LanguageDescription[]) {}

  getAll() {
    return this.languages.map((language) => ({
      name: language.name,
      alias: language.alias,
    }));
  }
}

function clipboardWriteText(text: string) {
  writeDesktopClipboardText(text);
}

class SereinCodeBlock implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;

  private node: ProseMirrorNode;
  private readonly host: HTMLPreElement;
  private readonly tools: HTMLDivElement;
  private readonly languageButton: HTMLButtonElement;
  private readonly languagePicker: HTMLDivElement;
  private readonly languageList: HTMLUListElement;
  private languageName = "";

  constructor(
    node: ProseMirrorNode,
    private readonly view: EditorView,
    private readonly getPos: GetPos,
    private readonly languages: CodeBlockLanguageOptions,
    private readonly config: CodeBlockConfig,
  ) {
    this.node = node;

    this.host = document.createElement("pre");
    this.host.className = "serein-code-host";

    this.contentDOM = document.createElement("code");
    this.contentDOM.className = "serein-code-content";
    this.host.appendChild(this.contentDOM);

    this.tools = document.createElement("div");
    this.tools.className = "tools";

    this.languageButton = document.createElement("button");
    this.languageButton.type = "button";
    this.languageButton.className = "language-button";
    this.languageButton.dataset.expanded = "false";
    this.languageButton.addEventListener("click", this.toggleLanguagePicker);

    this.languagePicker = document.createElement("div");
    this.languagePicker.className = "language-picker";

    const languageListWrapper = document.createElement("div");
    languageListWrapper.className = "language-list-wrapper";
    this.languageList = document.createElement("ul");
    this.languageList.className = "language-list";
    this.languageList.setAttribute("role", "listbox");
    languageListWrapper.appendChild(this.languageList);
    this.languagePicker.appendChild(languageListWrapper);

    this.tools.appendChild(this.languageButton);
    this.tools.appendChild(this.languagePicker);

    const toolsButtonGroup = document.createElement("div");
    toolsButtonGroup.className = "tools-button-group";
    this.tools.appendChild(toolsButtonGroup);
    if (this.config.copyText || this.config.copyIcon) {
      const copyButton = document.createElement("button");
      copyButton.type = "button";
      copyButton.className = "copy-button";
      if (this.config.copyIcon) {
        copyButton.innerHTML = this.config.copyIcon;
        copyButton.setAttribute("aria-label", this.config.copyText || "Copy");
      } else {
        copyButton.textContent = this.config.copyText || "Copy";
      }
      copyButton.addEventListener("click", this.copyCodeBlockText);
      toolsButtonGroup.appendChild(copyButton);
    }

    this.dom = document.createElement("div");
    this.dom.className = "milkdown-code-block";
    this.dom.appendChild(this.tools);
    this.dom.appendChild(this.host);

    this.updateLanguage();
  }

  private copyCodeBlockText = () => {
    const text = this.node.textContent;
    clipboardWriteText(text);
    this.config.onCopy?.(text);
  };

  private toggleLanguagePicker = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!this.view.editable) return;

    const expanded = this.languageButton.dataset.expanded === "true";
    if (expanded) {
      this.closeLanguagePicker();
      this.focusCodeContent();
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
    const languages = this.languages.getAll();
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
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(language === selected));
      item.textContent = this.config.renderLanguage(language.name, language === selected);
      item.addEventListener("click", () => {
        this.setLanguage(language.name);
        this.closeLanguagePicker();
        this.focusCodeContent();
      });
      this.languageList.appendChild(item);
    });
  }

  private setLanguage(language: string) {
    const pos = this.getPos();
    if (typeof pos !== "number") return;
    this.clearLanguageDraft();
    this.view.dispatch(this.view.state.tr.setNodeAttribute(pos, "language", language.trim()));
  }

  private clearLanguageDraft() {
    this.languageButton.removeAttribute("data-language-draft");
    this.languageButton.removeAttribute("data-language-fresh");
  }

  private updateLanguage() {
    const languageName = String(this.node.attrs.language ?? "");
    if (languageName !== this.languageName) this.clearLanguageDraft();
    this.languageButton.dataset.languageValue = languageName;
    this.languageButton.textContent = languageName || "Text";
    this.languageName = languageName;
  }

  private focusCodeContent() {
    const pos = this.getPos();
    if (typeof pos !== "number") {
      this.view.focus();
      return;
    }

    this.view.focus();
    const selection = this.view.state.selection;
    const from = pos + 1;
    const to = pos + this.node.nodeSize - 1;
    if (selection.from >= from && selection.to <= to) return;

    this.view.dispatch(this.view.state.tr.setSelection(TextSelection.near(this.view.state.doc.resolve(from))));
  }

  update(node: ProseMirrorNode) {
    if (node.type !== this.node.type) return false;

    this.node = node;
    this.updateLanguage();
    return true;
  }

  selectNode() {
    this.dom.classList.add("selected");
  }

  deselectNode() {
    this.dom.classList.remove("selected");
  }

  stopEvent(event: Event) {
    return event.target instanceof Node && this.tools.contains(event.target);
  }

  ignoreMutation(mutation: ViewMutationRecord) {
    return !this.contentDOM.contains(mutation.target);
  }

  destroy() {
    this.languageButton.removeEventListener("click", this.toggleLanguagePicker);
  }
}

export const sereinCodeBlockView = $view(codeBlockSchema.node, (ctx) => {
  const config = ctx.get(codeBlockConfig.key);
  const languages = new CodeBlockLanguageOptions(config.languages);
  return (node, view, getPos) => new SereinCodeBlock(node, view, getPos as GetPos, languages, config);
});
