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
  command,
  editorSurfaceRef,
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
          />
        )}
      </section>
    </main>
  );
}
