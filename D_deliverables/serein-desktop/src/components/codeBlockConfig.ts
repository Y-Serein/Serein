import type { LanguageDescription } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { $ctx } from "@milkdown/kit/utils";

export type CodeBlockConfig = {
  extensions: Extension[];
  languages: LanguageDescription[];
  expandIcon: string;
  searchIcon: string;
  clearSearchIcon: string;
  searchPlaceholder: string;
  noResultText: string;
  copyText: string;
  copyIcon: string;
  onCopy?: (text: string) => void;
  renderLanguage: (language: string, selected: boolean) => string;
  renderPreview: (
    language: string,
    content: string,
    applyPreview: (value: null | string | HTMLElement) => void,
  ) => void | null | string | HTMLElement;
  previewToggleButton: (previewOnlyMode: boolean) => string;
  previewLabel: string;
  previewOnlyByDefault?: boolean;
  previewLoading: string | HTMLElement;
};

export const codeBlockConfig = $ctx<CodeBlockConfig, "codeBlockConfigCtx">({
  extensions: [],
  languages: [],
  expandIcon: "",
  searchIcon: "",
  clearSearchIcon: "",
  searchPlaceholder: "",
  noResultText: "No result",
  copyText: "",
  copyIcon: "",
  onCopy: () => undefined,
  renderLanguage: (language) => language,
  renderPreview: () => null,
  previewToggleButton: (previewOnlyMode) => (previewOnlyMode ? "Edit" : "Hide"),
  previewLabel: "Preview",
  previewLoading: "Loading...",
}, "codeBlockConfigCtx");
