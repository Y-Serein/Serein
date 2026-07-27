import { lazy, Suspense, useState, type RefObject } from "react";
import type { AppLanguage, appText } from "../../app/i18n";
import type { DocumentViewMode } from "../../app/types";
import type { MarkdownTextBufferEditorApi } from "../../components/MarkdownTextBufferEditor";
import { EditorHost, type EditorHostProps } from "./EditorHost";

const MarkdownMindmapView = lazy(() => import("../mindmap/MarkdownMindmapView").then((module) => ({
  default: module.MarkdownMindmapView,
})));

type TextBundle = (typeof appText)[AppLanguage];

type EditorWorkspaceProps = Omit<EditorHostProps, "onApiChange"> & {
  t: TextBundle;
  hasActiveDocument: boolean;
  editorSurfaceRef: RefObject<HTMLElement>;
  viewMode: DocumentViewMode;
  onViewModeChange: (mode: DocumentViewMode) => void;
};

export function EditorWorkspace({
  t,
  activeNote,
  hasActiveDocument,
  editorMode,
  theme,
  command,
  editorSurfaceRef,
  viewMode,
  onViewModeChange,
  onMarkdownChange,
  onOpenLink,
  wikiLinkSuggestions,
  onCreateWikiLink,
  onImportImages,
  imagePreviewMap,
  showImageSourceOnFocus,
  normalizeWindowsImagePaths,
  showFrontmatterTagRow,
}: EditorWorkspaceProps) {
  const [editorApi, setEditorApi] = useState<MarkdownTextBufferEditorApi | null>(null);

  return (
    <main className={viewMode === "mindmap" ? "editor-column mindmap-active" : "editor-column"}>
      <section ref={editorSurfaceRef} className="editor-surface editor-buffer-surface" aria-label={t.aria.markdownEditor}>
        {!hasActiveDocument ? (
          <div className="editor-empty-state">{t.editor.emptyHint}</div>
        ) : (
          <EditorHost
            t={t}
            activeNote={activeNote}
            editorMode={editorMode}
            theme={theme}
            command={command}
            onMarkdownChange={onMarkdownChange}
            onOpenLink={onOpenLink}
            wikiLinkSuggestions={wikiLinkSuggestions}
            onCreateWikiLink={onCreateWikiLink}
            onImportImages={onImportImages}
            imagePreviewMap={imagePreviewMap}
            showImageSourceOnFocus={showImageSourceOnFocus}
            normalizeWindowsImagePaths={normalizeWindowsImagePaths}
            showFrontmatterTagRow={showFrontmatterTagRow}
            onApiChange={setEditorApi}
          />
        )}
      </section>
      {hasActiveDocument && viewMode === "mindmap" ? (
        <Suspense fallback={<div className="editor-loading">{t.aria.loadingRichEditor}</div>}>
          <MarkdownMindmapView
            t={t}
            activeNote={activeNote}
            editorApi={editorApi}
            imagePreviewMap={imagePreviewMap}
            onViewModeChange={onViewModeChange}
          />
        </Suspense>
      ) : null}
    </main>
  );
}
