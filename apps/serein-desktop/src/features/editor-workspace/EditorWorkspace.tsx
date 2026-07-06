import type { RefObject } from "react";
import type { AppLanguage, appText } from "../../app/i18n";
import { EditorHost, type EditorHostProps } from "./EditorHost";

type TextBundle = (typeof appText)[AppLanguage];

type EditorWorkspaceProps = EditorHostProps & {
  t: TextBundle;
  hasActiveDocument: boolean;
  editorSurfaceRef: RefObject<HTMLElement>;
};

export function EditorWorkspace({
  t,
  activeNote,
  hasActiveDocument,
  editorMode,
  richCommand,
  onRichCommandResult,
  editorSurfaceRef,
  plainEditorRef,
  onMarkdownChange,
  onRichMarkdownBaseline,
  onOpenLink,
  wikiLinkSuggestions,
  onCreateWikiLink,
  onImportImages,
  onPlainImageFiles,
  imagePreviewMap,
  showImageSourceOnFocus,
  normalizeWindowsImagePaths,
  showFrontmatterTagRow,
}: EditorWorkspaceProps) {
  return (
    <main className="editor-column">
      <section ref={editorSurfaceRef} className="editor-surface" aria-label={t.aria.markdownEditor}>
        {!hasActiveDocument ? (
          <div className="editor-empty-state">{t.editor.emptyHint}</div>
        ) : (
          <EditorHost
            t={t}
            activeNote={activeNote}
            editorMode={editorMode}
            richCommand={richCommand}
            onRichCommandResult={onRichCommandResult}
            plainEditorRef={plainEditorRef}
            onMarkdownChange={onMarkdownChange}
            onRichMarkdownBaseline={onRichMarkdownBaseline}
            onOpenLink={onOpenLink}
            wikiLinkSuggestions={wikiLinkSuggestions}
            onCreateWikiLink={onCreateWikiLink}
            onImportImages={onImportImages}
            onPlainImageFiles={onPlainImageFiles}
            imagePreviewMap={imagePreviewMap}
            showImageSourceOnFocus={showImageSourceOnFocus}
            normalizeWindowsImagePaths={normalizeWindowsImagePaths}
            showFrontmatterTagRow={showFrontmatterTagRow}
          />
        )}
      </section>
    </main>
  );
}
