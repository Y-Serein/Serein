import { defaultVaultWorkspaceState } from "../app/defaults.js";
import type { MarkdownFileResponse, SaveFileExt, VaultWorkspaceState } from "../app/types";
import type { Note } from "../domain/model";
import { ensureVaultFileName, extractFirstLineTitle, stripExtension } from "../shared/markdown.js";

export function normalizeEditorLineEndings(markdown: string) {
  return markdown.replace(/\r\n?/g, "\n");
}

export function detectLineEnding(markdown: string): Note["lineEnding"] {
  return markdown.includes("\r\n") ? "crlf" : "lf";
}

export function applyLineEnding(markdown: string, lineEnding: Note["lineEnding"]) {
  const normalized = normalizeEditorLineEndings(markdown);
  return lineEnding === "crlf" ? normalized.replace(/\n/g, "\r\n") : normalized;
}

export function createEmptyNote(): Note {
  const now = new Date().toISOString();
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `empty-${Date.now()}`;

  return {
    id,
    title: "Serein",
    markdown: "",
    tagIds: [],
    createdAt: now,
    updatedAt: now,
    lineEnding: "lf",
    savedMarkdown: "",
    dirty: false,
  };
}

export function createDraftNote(defaultName = "未命名笔记", defaultExt: SaveFileExt = "md"): Note {
  const now = new Date().toISOString();
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `note-${Date.now()}`;
  const fileName = ensureVaultFileName(defaultName, defaultExt);
  const title = stripExtension(fileName).trim() || "未命名笔记";

  return {
    id,
    title,
    markdown: `# ${title}\n\n`,
    tagIds: [],
    createdAt: now,
    updatedAt: now,
    lineEnding: "lf",
    savedMarkdown: "",
    dirty: true,
  };
}

export function createFileNote(file: MarkdownFileResponse): Note {
  const now = new Date().toISOString();
  const lineEnding = detectLineEnding(file.content);
  const content = normalizeEditorLineEndings(file.content);
  const titleFromHeading = extractFirstLineTitle(content);
  const titleFromFile = stripExtension(file.fileName).trim();
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `note-${Date.now()}`;

  return {
    id,
    title: titleFromFile || titleFromHeading || "未命名笔记",
    markdown: content,
    tagIds: [],
    createdAt: now,
    updatedAt: now,
    filePath: file.path,
    fileName: file.fileName,
    fileExt: file.fileExt,
    fileModifiedAtMs: file.modifiedAtMs,
    fileSize: file.size,
    lineEnding,
    savedMarkdown: content,
    dirty: false,
  };
}

export function isEmptyDraft(note: Note) {
  return !note.filePath
    && (note.markdown.trim() === "" || /^# .+\n\n?$/.test(note.markdown));
}

export function isEmptyPlaceholder(note: Note | null | undefined) {
  return Boolean(note && !note.filePath && !note.dirty && note.markdown.trim() === "");
}

export function mergeWorkspaceState(
  workspace: VaultWorkspaceState | null | undefined,
  fallbackLayout = defaultVaultWorkspaceState().layout,
): VaultWorkspaceState {
  const defaults = defaultVaultWorkspaceState();
  if (!workspace || workspace.version !== 1) {
    return {
      ...defaults,
      layout: fallbackLayout,
    };
  }

  return {
    version: 1,
    recentFiles: Array.isArray(workspace.recentFiles) ? workspace.recentFiles.filter((item) => typeof item === "string") : [],
    lastOpenedFile: typeof workspace.lastOpenedFile === "string" && workspace.lastOpenedFile ? workspace.lastOpenedFile : null,
    selectedDir: typeof workspace.selectedDir === "string" ? workspace.selectedDir : "",
    expandedDirs: Array.isArray(workspace.expandedDirs) && workspace.expandedDirs.length
      ? workspace.expandedDirs.filter((item) => typeof item === "string")
      : [""],
    layout: {
      ...fallbackLayout,
      ...workspace.layout,
      rightPanelWidth: workspace.layout.rightPanelWidth ?? fallbackLayout.rightPanelWidth,
    },
    centerGraph: {
      ...defaults.centerGraph,
      ...workspace.centerGraph,
      activeView: workspace.centerGraph?.activeView === "graph" ? "graph" : "markdown",
      selectedTag: typeof workspace.centerGraph?.selectedTag === "string" ? workspace.centerGraph.selectedTag : "",
    },
  };
}

export function nextWorkspaceState(
  current: VaultWorkspaceState,
  patch: Partial<VaultWorkspaceState>,
): VaultWorkspaceState {
  return {
    ...current,
    ...patch,
    version: 1,
    layout: {
      ...current.layout,
      ...(patch.layout ?? {}),
    },
    centerGraph: {
      ...current.centerGraph,
      ...(patch.centerGraph ?? {}),
    },
  };
}

export function pushRecentFile(recentFiles: string[], filePath: string | null) {
  if (!filePath) return recentFiles;
  return [filePath, ...recentFiles.filter((item) => item !== filePath)].slice(0, 12);
}
