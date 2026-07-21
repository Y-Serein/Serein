import { lazy, Suspense } from "react";
import type { EditorCommandSignal, Note } from "../../domain/model";
import type { EditorMode } from "../../app/types";
import type { AppLanguage, appText } from "../../app/i18n";
import type { WikiLinkSuggestion } from "../../components/editorTypes";

const MarkdownTextBufferEditor = lazy(() => import("../../components/MarkdownTextBufferEditor").then((module) => ({
  default: module.MarkdownTextBufferEditor,
})));

type TextBundle = (typeof appText)[AppLanguage];

export type EditorHostProps = {
  t: TextBundle;
  activeNote: Note;
  editorMode: EditorMode;
  command: EditorCommandSignal | null;
  onMarkdownChange: (markdown: string) => void;
  onOpenLink: (href: string) => boolean;
  wikiLinkSuggestions: WikiLinkSuggestion[];
  onCreateWikiLink: (target: string) => Promise<string | null>;
  onImportImages: (files: File[]) => Promise<Array<{ src: string; alt: string }>>;
  imagePreviewMap: Record<string, string>;
  showImageSourceOnFocus: boolean;
  normalizeWindowsImagePaths: boolean;
  showFrontmatterTagRow: boolean;
};

export function EditorHost(props: EditorHostProps) {
  return (
    <Suspense fallback={<div className="editor-loading">{props.t.aria.loadingRichEditor}</div>}>
      <MarkdownTextBufferEditor
        t={props.t}
        activeNote={props.activeNote}
        editorMode={props.editorMode}
        command={props.command}
        onChange={props.onMarkdownChange}
        onOpenLink={props.onOpenLink}
        wikiLinkSuggestions={props.wikiLinkSuggestions}
        onCreateWikiLink={props.onCreateWikiLink}
        onImportImages={props.onImportImages}
        imagePreviewMap={props.imagePreviewMap}
        showImageSourceOnFocus={props.showImageSourceOnFocus}
        normalizeWindowsImagePaths={props.normalizeWindowsImagePaths}
        showFrontmatterTagRow={props.showFrontmatterTagRow}
      />
    </Suspense>
  );
}
