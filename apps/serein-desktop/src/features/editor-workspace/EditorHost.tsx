import { lazy, Suspense, type RefObject } from "react";
import type { EditorCommandResult, EditorCommandSignal, Note } from "../../domain/model";
import type { EditorMode } from "../../app/types";
import type { AppLanguage, appText } from "../../app/i18n";
import type { WikiLinkSuggestion } from "../../components/MilkdownEditor";

const MilkdownEditor = lazy(() => import("../../components/MilkdownEditor").then((module) => ({
  default: module.MilkdownEditor,
})));

const MarkdownTextBufferEditor = lazy(() => import("../../components/MarkdownTextBufferEditor").then((module) => ({
  default: module.MarkdownTextBufferEditor,
})));

type TextBundle = (typeof appText)[AppLanguage];

export type EditorHostProps = {
  t: TextBundle;
  activeNote: Note;
  editorMode: EditorMode;
  useTextBufferEditor: boolean;
  richCommand: EditorCommandSignal | null;
  onRichCommandResult: (result: EditorCommandResult) => void;
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

function PlainMarkdownSurface({
  activeNote,
  plainEditorRef,
  onMarkdownChange,
  onPlainImageFiles,
}: Pick<EditorHostProps, "activeNote" | "plainEditorRef" | "onMarkdownChange" | "onPlainImageFiles">) {
  return (
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
  );
}

function RichMarkdownSurface({
  t,
  activeNote,
  richCommand,
  onRichCommandResult,
  onMarkdownChange,
  onRichMarkdownBaseline,
  onOpenLink,
  wikiLinkSuggestions,
  onCreateWikiLink,
  onImportImages,
  imagePreviewMap,
  showImageSourceOnFocus,
  normalizeWindowsImagePaths,
  showFrontmatterTagRow,
}: Omit<EditorHostProps, "editorMode" | "plainEditorRef" | "onPlainImageFiles">) {
  return (
    <Suspense fallback={<div className="editor-loading">{t.aria.loadingRichEditor}</div>}>
      <MilkdownEditor
        key={activeNote.id}
        markdown={activeNote.markdown}
        onChange={onMarkdownChange}
        onRichMarkdownBaseline={onRichMarkdownBaseline}
        command={richCommand}
        onCommandResult={onRichCommandResult}
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
  );
}

export function EditorHost(props: EditorHostProps) {
  if (props.useTextBufferEditor) {
    return (
      <Suspense fallback={<div className="editor-loading">{props.t.aria.loadingRichEditor}</div>}>
        <MarkdownTextBufferEditor
          t={props.t}
          activeNote={props.activeNote}
          editorMode={props.editorMode}
          command={props.richCommand}
          onCommandResult={props.onRichCommandResult}
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

  if (props.editorMode === "plain") {
    return (
      <PlainMarkdownSurface
        activeNote={props.activeNote}
        plainEditorRef={props.plainEditorRef}
        onMarkdownChange={props.onMarkdownChange}
        onPlainImageFiles={props.onPlainImageFiles}
      />
    );
  }

  return <RichMarkdownSurface {...props} />;
}
