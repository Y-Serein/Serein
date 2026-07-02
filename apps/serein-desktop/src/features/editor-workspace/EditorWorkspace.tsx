import { lazy, Suspense, type RefObject } from "react";
import type { EditorCommandSignal, Note } from "../../domain/model";
import type { EditorMode } from "../../app/types";
import type { AppLanguage, appText } from "../../app/i18n";
import type { WikiLinkSuggestion } from "../../components/MilkdownEditor";

const MilkdownEditor = lazy(() => import("../../components/MilkdownEditor").then((module) => ({
  default: module.MilkdownEditor,
})));

type TextBundle = (typeof appText)[AppLanguage];

type EditorWorkspaceProps = {
  t: TextBundle;
  activeNote: Note;
  hasActiveDocument: boolean;
  editorMode: EditorMode;
  richCommand: EditorCommandSignal | null;
  editorSurfaceRef: RefObject<HTMLElement>;
  plainEditorRef: RefObject<HTMLTextAreaElement>;
  onMarkdownChange: (markdown: string) => void;
  onRichMarkdownBaseline: (markdown: string) => void;
  onOpenLink: (href: string) => boolean;
  wikiLinkSuggestions: WikiLinkSuggestion[];
  onCreateWikiLink: (target: string) => Promise<string | null>;
  onImportImages: (files: File[]) => Promise<Array<{ src: string; alt: string }>>;
  onPlainImageFiles: (files: File[]) => Promise<boolean>;
  imagePreviewMap: Record<string, string>;
  showImageSourceOnFocus: boolean;
  normalizeWindowsImagePaths: boolean;
  showFrontmatterTagRow: boolean;
};

export function EditorWorkspace({
  t,
  activeNote,
  hasActiveDocument,
  editorMode,
  richCommand,
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
        ) : editorMode === "plain" ? (
          <textarea
            ref={plainEditorRef}
            className="markdown-editor"
            value={activeNote.markdown}
            onChange={(event) => onMarkdownChange(event.target.value)}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData.files);
              if (!files.length) return;
              event.preventDefault();
              void onPlainImageFiles(files);
            }}
            onDrop={(event) => {
              const files = Array.from(event.dataTransfer.files);
              if (!files.length) return;
              event.preventDefault();
              void onPlainImageFiles(files);
            }}
            onDragOver={(event) => {
              if (Array.from(event.dataTransfer.types).includes("Files")) event.preventDefault();
            }}
            spellCheck
          />
        ) : (
          <Suspense fallback={<div className="editor-loading">{t.aria.loadingRichEditor}</div>}>
            <MilkdownEditor
              key={activeNote.id}
              markdown={activeNote.markdown}
              onChange={onMarkdownChange}
              onRichMarkdownBaseline={onRichMarkdownBaseline}
              command={richCommand}
              onOpenLink={onOpenLink}
              wikiLinkSuggestions={wikiLinkSuggestions}
              onCreateWikiLink={onCreateWikiLink}
              onImportImages={onImportImages}
              imagePreviewMap={imagePreviewMap}
              showImageSourceOnFocus={showImageSourceOnFocus}
              normalizeWindowsImagePaths={normalizeWindowsImagePaths}
              showFrontmatterTagRow={showFrontmatterTagRow}
              frontmatterLabels={t.editor.frontmatter}
            />
          </Suspense>
        )}
      </section>
    </main>
  );
}
