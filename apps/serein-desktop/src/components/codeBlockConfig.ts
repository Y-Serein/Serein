import type { LanguageDescription } from "@codemirror/language";
import { $ctx } from "@milkdown/kit/utils";

export type CodeBlockConfig = {
  languages: LanguageDescription[];
  noResultText: string;
  copyText: string;
  copyIcon: string;
  onCopy?: (text: string) => void;
  renderLanguage: (language: string, selected: boolean) => string;
};

export const codeBlockConfig = $ctx<CodeBlockConfig, "codeBlockConfigCtx">({
  languages: [],
  noResultText: "No result",
  copyText: "",
  copyIcon: "",
  onCopy: () => undefined,
  renderLanguage: (language) => language,
}, "codeBlockConfigCtx");
