import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { X } from "lucide-react";
import { getCurrentWindow, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  VAULT_DIRECTORY_LIMIT,
  defaultSettings,
} from "./app/defaults";
import { appText } from "./app/i18n";
import type { AppLanguage } from "./app/i18n";
import { useAppStore } from "./app/store/appStore";
import type { AppDialogResult } from "./app/store/appStore";
import type {
  CommandDefinition,
  DocumentViewMode,
  EditorMode,
  AppSettings,
  SaveFileExt,
  ThemeStyle,
  UIDensity,
  VaultIndexFileResponse,
  VaultTreeEntry,
  VaultWorkspaceState,
  WindowState,
  CloseButtonBehavior,
} from "./app/types";
import {
  defaultShortcutRegistry,
  findShortcutConflicts,
  getShortcutForCommand,
  normalizeShortcutText,
  shortcutFromEvent,
  writeShortcuts,
} from "./command/shortcuts";
import { resolveGlobalAppShortcuts, webviewShortcutAction } from "./command/globalShortcuts";
import type { EditorCommandAction, Note } from "./domain/model";
import { createDemoVault, readDemoMarkdownFile } from "./dev/demoVault";
import { directoryFromResponse, preserveLoadedDirectoryChildren, updateVaultNode } from "./explorer/tree";
import { AppContextMenu } from "./features/context-menu/AppContextMenu";
import type { AppContextMenuItem, ContextMenuIcon } from "./features/context-menu/AppContextMenu";
import { AppDialogHost } from "./features/dialogs/AppDialogHost";
import { EditorWorkspace } from "./features/editor-workspace/EditorWorkspace";
import { markdownToDocxBytes } from "./export/docxExport";
import { collectLocalImageSources, htmlDocument, utf8Bytes } from "./export/markdownExport";
import { markdownToPdfBytes } from "./export/pdfExport";
import { KnowledgeRail } from "./features/knowledge-rail/KnowledgeRail";
import { CommandPalette } from "./features/palette/CommandPalette";
import { SettingsDialog, resetEditorLayoutDefaults } from "./features/settings/SettingsDialog";
import { WorkspaceCenter } from "./features/shell/WorkspaceCenter";
import { WorkspaceGraphLeaf } from "./features/shell/WorkspaceGraphLeaf";
import { WorkspaceRibbon } from "./features/shell/WorkspaceRibbon";
import { WorkspaceEditorStatusBar } from "./features/shell/WorkspaceStatusBar";
import { VaultSidebar } from "./features/vault-sidebar/VaultSidebar";
import { WindowChrome } from "./features/window-chrome/WindowChrome";
import { readDesktopClipboardText, writeDesktopClipboardText } from "./services/clipboard";
import {
  configureGlobalQuickNoteShortcut,
  configureGlobalRevealShortcut,
  createVaultEntry,
  deleteVaultEntry,
  hideMainWindowToTray,
  importEditorAsset,
  importEditorAssetFromPath,
  initVault,
  openQuickNoteWindow,
  openExternalTarget,
  readInitialOpenFile,
  readLocalAssetDataUrl,
  readMarkdownFile,
  readVaultIndexFiles,
  readVaultDirectory,
  renameVaultEntry,
  revealWindow,
  searchVaultTagFiles,
  writeExportFile,
  writeMarkdownFile,
  writeVaultWorkspaceState,
} from "./services/files";
import type { QuickNoteInitialSurface } from "./services/files";
import {
  clampEditorLeftGap,
  clampEditorTabSize,
  clampRightPanelWidth,
  clampSidebarWidth,
  clampUiScale,
  normalizeDefaultNewNoteName,
  normalizeEditorFontFamily,
  normalizeImageAttachmentFolder,
  writeSettings,
} from "./services/settings";
import {
  countDocumentText,
  ensureSaveExtension,
  ensureVaultFileName,
  extractFirstLineTitle,
  extractMarkdownHeadings,
  findHeadingIndex,
  getHeadingOffsets,
  isSameOrChildPath,
  joinVaultPath,
  markdownHeadingTargetAt,
  normalizeWikiLinkEscapes,
  normalizeFilePath,
  parentVaultDir,
  pathExtension,
  pathFileName,
  stripExtension,
  vaultFileNameCandidate,
} from "./shared/markdown";
import {
  mermaidPaletteFromElement,
  renderMarkdownMermaidBlocks,
} from "./shared/mermaid";
import {
  buildVaultIndex,
  createDraftIndexedFile,
  createGlobalGraph,
  createLocalGraph,
  findIndexedFile,
  getBacklinks,
  getIncomingUnlinkedMentions,
  listVaultTags,
  planVaultLinkRewrite,
  resolveVaultLinkTarget,
  rewriteVaultLinksInMarkdown,
  searchVaultIndex,
  suggestedVaultLinkPath,
  upsertVaultIndexFile,
} from "./vault/index";
import type { VaultIndex, VaultIndexedFile, VaultLink, VaultSearchResult, VaultUnlinkedMention } from "./vault";
import { buildVaultIndexAsync } from "./vault/buildIndexAsync";
import {
  applyLineEnding,
  createDraftNote,
  createEmptyNote,
  createFileNote,
  detectLineEnding,
  isEmptyDraft,
  isEmptyPlaceholder,
  mergeWorkspaceState,
  nextWorkspaceState,
  normalizeEditorLineEndings,
  pushRecentFile,
} from "./vault/workspace";
import "./styles.css";

const DIRECTORY_INDEX_FILE_NAMES = ["index.md", "index.markdown", "index.txt", "readme.md", "readme.markdown", "readme.txt"];
const WINDOW_ACTION_TIMEOUT_MS = 1500;
const WINDOW_STATE_SAVE_DELAY_MS = 400;
const MIN_EDITOR_FONT_SIZE = 14;
const MAX_EDITOR_FONT_SIZE = 24;
const MIN_CENTER_GRAPH_WIDTH = 320;
const MAX_CENTER_GRAPH_WIDTH = 760;
const QUICK_NOTE_SURFACE_STORAGE_KEY = "serein.quickNote.surface.v1";
const QUICK_NOTE_MIN_WIDTH = 280;
const QUICK_NOTE_MIN_HEIGHT = 240;
const QUICK_NOTE_MAX_WIDTH = 1200;
const QUICK_NOTE_MAX_HEIGHT = 1200;
const QUICK_NOTE_MAX_POSITION = 100000;
type PaletteMode = "quickOpen" | "command";
type ContextMenuState = {
  x: number;
  y: number;
  target: "editor" | "workspace" | "file" | "directory" | "document";
  entry?: VaultTreeEntry;
  filePath?: string;
};
type SourceLocationTarget = {
  line: number;
  text: string | null;
};
type NativeEditCommand = "cut" | "copy" | "paste" | "undo" | "redo" | "selectAll";
const SEARCH_SEED_MAX_LENGTH = 160;

function isEditorTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    && Boolean(target.closest(".serein-text-buffer-editor, .cm-editor"));
}

function elementFromNode(node: Node | null) {
  return node instanceof Element ? node : node?.parentElement ?? null;
}

function isFormTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function isSidebarSearchInputTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    && Boolean(target.closest(".sidebar-search-box input"));
}

function normalizeSearchSeedText(text: string | null | undefined) {
  const normalized = (text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  return normalized.length > SEARCH_SEED_MAX_LENGTH
    ? normalized.slice(0, SEARCH_SEED_MAX_LENGTH).trimEnd()
    : normalized;
}

function selectionIsInsideElement(selection: Selection | null, element: HTMLElement | null) {
  if (!selection || !element || selection.rangeCount === 0 || selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  const startElement = elementFromNode(range.startContainer);
  const endElement = elementFromNode(range.endContainer);
  return Boolean(startElement && endElement && element.contains(startElement) && element.contains(endElement));
}

function clearWindowSelection() {
  window.getSelection()?.removeAllRanges();
}

function clearWindowSelectionSoon() {
  clearWindowSelection();
  window.requestAnimationFrame(() => {
    clearWindowSelection();
    window.requestAnimationFrame(clearWindowSelection);
  });
  window.setTimeout(clearWindowSelection, 80);
}

function isEditorTextControlTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    && Boolean(target.closest(".serein-text-buffer-editor, .cm-editor"));
}

function nativeTextControlFromTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return null;
  const control = target.closest("input, textarea");
  if (control instanceof HTMLTextAreaElement) return control;
  if (!(control instanceof HTMLInputElement)) return null;
  const textInputTypes = new Set(["", "email", "number", "password", "search", "tel", "text", "url"]);
  return textInputTypes.has(control.type) ? control : null;
}

function canUseNativeTextControl(control: HTMLInputElement | HTMLTextAreaElement | null): control is HTMLInputElement | HTMLTextAreaElement {
  return Boolean(control && document.contains(control) && !control.disabled && !control.readOnly);
}

function nativeEditCommandFromCommandId(commandId: string): NativeEditCommand | null {
  if (commandId === "edit.cut") return "cut";
  if (commandId === "edit.copy") return "copy";
  if (commandId === "edit.paste") return "paste";
  if (commandId === "edit.undo") return "undo";
  if (commandId === "edit.redo") return "redo";
  if (commandId === "edit.selectAll") return "selectAll";
  return null;
}

function isStandardNativeTextShortcut(key: string, command: NativeEditCommand) {
  if (command === "cut") return key === "Ctrl+X" || key === "Meta+X";
  if (command === "copy") return key === "Ctrl+C" || key === "Meta+C";
  if (command === "paste") return key === "Ctrl+V" || key === "Meta+V";
  if (command === "undo") return key === "Ctrl+Z" || key === "Meta+Z";
  if (command === "redo") return key === "Ctrl+Y" || key === "Ctrl+Shift+Z" || key === "Meta+Shift+Z";
  if (command === "selectAll") return key === "Ctrl+A" || key === "Meta+A";
  return false;
}

function textControlSelection(control: HTMLInputElement | HTMLTextAreaElement) {
  const start = control.selectionStart ?? control.value.length;
  const end = control.selectionEnd ?? start;
  return { start, end };
}

function replaceTextControlSelection(control: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const { start, end } = textControlSelection(control);
  try {
    control.setRangeText(text, start, end, "end");
  } catch {
    control.value = `${control.value.slice(0, start)}${text}${control.value.slice(end)}`;
    const cursor = start + text.length;
    try {
      control.setSelectionRange(cursor, cursor);
    } catch {
      // Some input types do not expose selection ranges.
    }
  }
  control.dispatchEvent(new Event("input", { bubbles: true }));
}

function runNativeTextEditCommand(control: HTMLInputElement | HTMLTextAreaElement, command: NativeEditCommand) {
  control.focus();

  if (command === "selectAll") {
    try {
      control.select();
    } catch {
      // Native control does not expose selectable text.
    }
    return true;
  }

  if (command === "copy" || command === "cut") {
    const { start, end } = textControlSelection(control);
    if (start === end) return true;
    writeDesktopClipboardText(control.value.slice(start, end));
    if (command === "cut") replaceTextControlSelection(control, "");
    return true;
  }

  if (command === "paste") {
    readDesktopClipboardText().then((text) => {
      if (text) replaceTextControlSelection(control, text);
    });
    return true;
  }

  if (command === "undo" || command === "redo") {
    document.execCommand(command);
    return true;
  }

  return false;
}

function isRecordingShortcutTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    && Boolean(target.closest(".shortcut-recorder[data-recording='true']"));
}

function isWindowDragBlockedTarget(target: EventTarget | null) {
  return target instanceof Element
    && Boolean(target.closest("button, input, textarea, select, [role='menu'], .menu-popover, .window-controls"));
}

function isTauriRuntime() {
  return Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

function isWindowsTauriRuntime() {
  if (!isTauriRuntime()) return false;
  const navigatorWithUserAgentData = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = navigatorWithUserAgentData.userAgentData?.platform ?? navigator.platform ?? "";
  return /win/i.test(platform) || /windows/i.test(navigator.userAgent);
}

function readQuickNoteInitialSurface(): QuickNoteInitialSurface | null {
  try {
    const raw = window.localStorage.getItem(QUICK_NOTE_SURFACE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<QuickNoteInitialSurface>;
    const hasPosition = parsed.x !== undefined || parsed.y !== undefined;
    const validPosition = !hasPosition
      || (
        typeof parsed.x === "number"
        && typeof parsed.y === "number"
        && Number.isFinite(parsed.x)
        && Number.isFinite(parsed.y)
        && Math.abs(parsed.x) <= QUICK_NOTE_MAX_POSITION
        && Math.abs(parsed.y) <= QUICK_NOTE_MAX_POSITION
      );
    if (
      typeof parsed.width !== "number"
      || typeof parsed.height !== "number"
      || !Number.isFinite(parsed.width)
      || !Number.isFinite(parsed.height)
      || parsed.width < QUICK_NOTE_MIN_WIDTH
      || parsed.height < QUICK_NOTE_MIN_HEIGHT
      || parsed.width > QUICK_NOTE_MAX_WIDTH
      || parsed.height > QUICK_NOTE_MAX_HEIGHT
      || !validPosition
    ) {
      return null;
    }

    return {
      width: parsed.width,
      height: parsed.height,
      ...(typeof parsed.x === "number" && typeof parsed.y === "number" ? { x: parsed.x, y: parsed.y } : {}),
    };
  } catch {
    return null;
  }
}

function windowStatesEqual(left: WindowState | null, right: WindowState | null) {
  if (!left || !right) return left === right;
  return left.x === right.x
    && left.y === right.y
    && left.width === right.width
    && left.height === right.height
    && left.maximized === right.maximized;
}

function windowActionWithTimeout<T>(action: Promise<T>, label: string) {
  let timeout = 0;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = window.setTimeout(() => reject(new Error(`${label} timed out`)), WINDOW_ACTION_TIMEOUT_MS);
  });

  return Promise.race([
    action.finally(() => window.clearTimeout(timeout)),
    timeoutPromise,
  ]);
}

function titleFromMarkdown(markdown: string, fallback: string) {
  return extractFirstLineTitle(markdown) ?? fallback;
}

function clampEditorFontSize(value: number) {
  return Math.min(MAX_EDITOR_FONT_SIZE, Math.max(MIN_EDITOR_FONT_SIZE, value));
}

function clampCenterGraphWidth(value: number) {
  return Math.min(MAX_CENTER_GRAPH_WIDTH, Math.max(MIN_CENTER_GRAPH_WIDTH, value));
}

function normalizeMarkdownDirtyText(markdown: string) {
  return markdown.replace(/\r\n?/g, "\n").replace(/\n$/, "");
}

function markdownEqualForDirty(left: string, right: string) {
  return left === right || normalizeMarkdownDirtyText(left) === normalizeMarkdownDirtyText(right);
}

function noteDirtyForMarkdown(note: Note, markdown: string) {
  const savedMarkdown = note.savedMarkdown ?? "";
  if (markdownEqualForDirty(markdown, savedMarkdown)) return false;
  return true;
}

function noteWithMarkdown(note: Note, markdown: string): Note {
  const dirty = noteDirtyForMarkdown(note, markdown);

  return {
    ...note,
    title: titleFromMarkdown(markdown, note.title),
    markdown,
    updatedAt: dirty ? new Date().toISOString() : note.updatedAt,
    dirty,
  };
}

function contextMenuPosition(event: { clientX: number; clientY: number }) {
  return {
    x: Math.min(event.clientX, Math.max(12, window.innerWidth - 272)),
    y: Math.min(event.clientY, Math.max(12, window.innerHeight - 360)),
  };
}

function shellContextMenuTarget(target: EventTarget | null): ContextMenuState["target"] | null {
  const element = target instanceof Element ? target : null;
  if (!element) return null;
  if (element.closest(".app-context-menu, .app-dialog-shell")) return null;
  if (element.closest(".app-chrome, .workspace-ribbon, .left-rail, .right-rail, .workspace-statusbar, .workspace-tabbar, .sidebar-resizer, .right-panel-resizer, .center-graph-resizer")) return null;
  if (element.closest(".editor-surface, .serein-text-buffer-editor, .cm-editor")) return "editor";
  if (element.closest(".workspace-leaf.markdown-leaf, .workspace-center")) return "workspace";
  return null;
}

function quoteCssFontFamily(fontFamily: string) {
  return `"${fontFamily.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function normalizeVaultRelativePath(path: string) {
  return path
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .replace(/\/+$/, "");
}

function vaultDirectoryChain(relativeDir: string) {
  const normalized = normalizeVaultRelativePath(relativeDir);
  if (!normalized) return [];
  const parts = normalized.split("/").filter(Boolean);
  return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
}

function stripLinkTargetMeta(target: string) {
  return target.split("#", 1)[0].split("?", 1)[0].trim();
}

function headingFromLinkTarget(target: string) {
  const hashIndex = target.indexOf("#");
  if (hashIndex < 0) return null;
  const fragment = target.slice(hashIndex + 1).split("?", 1)[0].trim();
  if (!fragment) return null;
  try {
    return decodeURIComponent(fragment).trim();
  } catch {
    return fragment;
  }
}

function sourceLineBounds(markdown: string, lineNumber: number) {
  if (!Number.isFinite(lineNumber) || lineNumber < 1) return null;

  let start = 0;
  for (let line = 1; line < lineNumber; line += 1) {
    const nextBreak = markdown.indexOf("\n", start);
    if (nextBreak < 0) return null;
    start = nextBreak + 1;
  }

  const nextBreak = markdown.indexOf("\n", start);
  const rawEnd = nextBreak < 0 ? markdown.length : nextBreak;
  const end = rawEnd > start && markdown[rawEnd - 1] === "\r" ? rawEnd - 1 : rawEnd;
  return {
    start,
    end,
    text: markdown.slice(start, end),
  };
}

function markdownSourceDisplayText(value: string) {
  return value
    .replace(/!\[\[([^\]]+)]]/g, (_, raw: string) => raw.split("|", 2)[1] ?? raw.split("#", 1)[0])
    .replace(/\[\[([^\]]+)]]/g, (_, raw: string) => raw.split("|", 2)[1] ?? raw.split("#", 1)[0])
    .replace(/!\[([^\]]*)]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~>#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceSelectionCandidates(lineText: string, targetText: string | null) {
  const candidates: string[] = [];
  const addCandidate = (candidate: string) => {
    const trimmed = candidate.trim();
    if (trimmed.length < 2 || candidates.includes(trimmed)) return;
    candidates.push(trimmed);
  };

  addCandidate(targetText ?? "");
  addCandidate(markdownSourceDisplayText(targetText ?? ""));
  addCandidate(markdownSourceDisplayText(lineText));
  addCandidate(lineText);

  return candidates;
}

function normalizeMarkdownHrefTarget(href: string) {
  const trimmed = href.trim().replace(/^<|>$/g, "");
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

function isExternalHrefTarget(target: string) {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#");
}

function isBrowserHrefTarget(target: string) {
  return /^(https?:|mailto:)/i.test(target);
}

function isFileHrefTarget(target: string) {
  return /^file:/i.test(target);
}

function isMarkdownLikePath(path: string) {
  const extension = pathExtension(path);
  return extension === "md" || extension === "markdown" || extension === "txt";
}

function filePathDirectory(path: string) {
  const normalized = normalizeFilePath(path);
  const index = normalized.lastIndexOf("/");
  return index > -1 ? normalized.slice(0, index) : "";
}

function containingFolderPath(path: string) {
  const directory = filePathDirectory(path);
  if (/^[A-Za-z]:$/.test(directory)) return `${directory}/`;
  if (!directory && normalizeFilePath(path).startsWith("/")) return "/";
  return directory;
}

function joinAbsolutePath(directory: string, target: string) {
  if (/^[A-Za-z]:[\\/]/.test(target) || target.startsWith("/")) return normalizeFilePath(target);
  if (target.startsWith("file://")) {
    try {
      return normalizeFilePath(decodeURIComponent(new URL(target).pathname));
    } catch {
      return normalizeFilePath(target.replace(/^file:\/\//i, ""));
    }
  }

  const parts = [...normalizeFilePath(directory).split("/"), ...normalizeFilePath(target).split("/")]
    .filter(Boolean);
  const output: string[] = [];

  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      output.pop();
      continue;
    }
    output.push(part);
  }

  const prefix = directory.startsWith("/") ? "/" : "";
  return `${prefix}${output.join("/")}`;
}

function joinRelativeVaultPath(directory: string, target: string) {
  const parts = [...normalizeVaultRelativePath(directory).split("/"), ...normalizeVaultRelativePath(target).split("/")]
    .filter(Boolean);
  const output: string[] = [];

  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      output.pop();
      continue;
    }
    output.push(part);
  }

  return output.join("/");
}

function isAbsoluteLocalPath(path: string) {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("/") || isFileHrefTarget(path);
}

function localPathFromHrefTarget(target: string) {
  if (!isFileHrefTarget(target)) return normalizeFilePath(target);

  try {
    const url = new URL(target);
    const pathname = decodeURIComponent(url.pathname);
    return normalizeFilePath(pathname.replace(/^\/([A-Za-z]:\/)/, "$1"));
  } catch {
    return normalizeFilePath(target.replace(/^file:\/\//i, ""));
  }
}

function relativePathFromRoot(root: string, path: string) {
  const normalizedRoot = normalizeFilePath(root);
  const normalizedPath = normalizeFilePath(path);
  if (normalizedPath === normalizedRoot) return "";
  if (!normalizedPath.startsWith(`${normalizedRoot}/`)) return null;
  return normalizedPath.slice(normalizedRoot.length + 1);
}

function vaultIndexOverrideKey(root: string, path: string) {
  return `${normalizeFilePath(root)}\n${normalizeFilePath(path)}`;
}

function applyVaultIndexOverrides(
  index: VaultIndex | null,
  root: string,
  overrides: Iterable<VaultIndexFileResponse>,
) {
  let nextIndex = index;
  for (const file of overrides) {
    if (relativePathFromRoot(root, file.path) === null) continue;
    nextIndex = upsertVaultIndexFile(nextIndex, root, file);
  }
  return nextIndex;
}

function deleteVaultIndexOverrides(
  overrides: Map<string, VaultIndexFileResponse>,
  root: string,
  path: string,
) {
  for (const [key, file] of overrides) {
    if (relativePathFromRoot(root, file.path) !== null && isSameOrChildPath(file.path, path)) {
      overrides.delete(key);
    }
  }
}

type ExportFormat = "html" | "pdf" | "docx";

function ensureExportExtension(path: string, format: ExportFormat) {
  const extension = pathExtension(path);
  if (format === "html" && (extension === "html" || extension === "htm")) return path;
  if (format === "pdf" && extension === "pdf") return path;
  if (format === "docx" && extension === "docx") return path;
  return `${path}.${format}`;
}

function readableError(error: unknown) {
  if (error instanceof Error) return error.message;
  const message = String(error);
  return message.length > 180 ? `${message.slice(0, 177)}...` : message;
}

const imageFileFilters = [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] }];

export default function App() {
  const store = useAppStore();
  const {
    notes,
    setNotes,
    activeNoteId,
    setActiveNoteId,
    savedAt,
    setSavedAt,
    saveError,
    setSaveError,
    saveStatus,
    setSaveStatus,
    editorMode,
    setEditorMode,
    language,
    setLanguage,
    theme,
    setTheme,
    uiDensity,
    setUiDensity,
    sidebarWidth,
    setSidebarWidth,
    sidebarVisible,
    setSidebarVisible,
    rightPanelVisible,
    setRightPanelVisible,
    rightPanelWidth,
    setRightPanelWidth,
    vaultRoot,
    setVaultRoot,
    vaultTree,
    setVaultTree,
    vaultError,
    setVaultError,
    vaultIndex,
    setVaultIndex,
    vaultIndexStatus,
    setVaultIndexStatus,
    vaultIndexError,
    setVaultIndexError,
    leftPanelTab,
    setLeftPanelTab,
    knowledgePanelTab,
    setKnowledgePanelTab,
    knowledgePanelFloating,
    setKnowledgePanelFloating,
    floatingPanelPosition,
    setFloatingPanelPosition,
    selectedVaultDir,
    setSelectedVaultDir,
    lastOpenedFile,
    setLastOpenedFile,
    vaultRecoveryBlocked,
    setVaultRecoveryBlocked,
    expandedDirs,
    setExpandedDirs,
    vaultWorkspace,
    setVaultWorkspace,
    defaultEditorModeSetting,
    setDefaultEditorModeSetting,
    restoreWorkspace,
    setRestoreWorkspace,
    restoreWindowState,
    setRestoreWindowState,
    windowState,
    setWindowState,
    editorLatinFont,
    setEditorLatinFont,
    editorCjkFont,
    setEditorCjkFont,
    editorFontSize,
    setEditorFontSize,
    editorLineHeight,
    setEditorLineHeight,
    editorTabSize,
    setEditorTabSize,
    editorLeftGap,
    setEditorLeftGap,
    uiScale,
    setUiScale,
    zoomWithWheel,
    setZoomWithWheel,
    showEditorStatusOverlay,
    setShowEditorStatusOverlay,
    tagFeaturesEnabled,
    setTagFeaturesEnabled,
    showFrontmatterTagRow,
    setShowFrontmatterTagRow,
    editorCommand,
    setEditorCommand,
    defaultSaveExt,
    setDefaultSaveExt,
    quickNoteSaveExt,
    setQuickNoteSaveExt,
    quickNoteShowInTaskbar,
    setQuickNoteShowInTaskbar,
    closeButtonBehavior,
    setCloseButtonBehavior,
    defaultNewNoteName,
    setDefaultNewNoteName,
    imageAttachmentFolder,
    setImageAttachmentFolder,
    imagePathStyle,
    setImagePathStyle,
    showImageSourceOnFocus,
    setShowImageSourceOnFocus,
    normalizeWindowsImagePaths,
    setNormalizeWindowsImagePaths,
    settingsOpen,
    setSettingsOpen,
    settingsSection,
    setSettingsSection,
    appDialog,
    setAppDialog,
    appDialogInput,
    setAppDialogInput,
    openMenuId,
    setOpenMenuId,
    shortcuts,
    setShortcuts,
    shortcutEdits,
    setShortcutEdits,
  } = store;
  const menuBarRef = useRef<HTMLElement | null>(null);
  const appDialogInputRef = useRef<HTMLInputElement | null>(null);
  const appDialogResolverRef = useRef<((value: AppDialogResult) => void) | null>(null);
  const editorSurfaceRef = useRef<HTMLElement | null>(null);
  const lastFocusedNativeTextControlRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const saveBeforeContinueRef = useRef<(() => Promise<boolean>) | null>(null);
  const saveActiveNoteRef = useRef<((options?: { trustDirtyFlag?: boolean }) => Promise<boolean>) | null>(null);
  const backgroundSaveTimerRef = useRef<number | null>(null);
  const backgroundSaveQueuedRef = useRef(false);
  const backgroundSaveRunningRef = useRef<Promise<boolean> | null>(null);
  const restoredVaultRef = useRef(false);
  const restoredStandaloneFileRef = useRef(false);
  const checkedInitialOpenFileRef = useRef(false);
  const loadedDemoVaultRef = useRef(false);
  const pendingHeadingRef = useRef<string | null>(null);
  const sidebarRevealKeyRef = useRef<string | null>(null);
  const editorCommandIdRef = useRef(0);
  const vaultIndexRefreshIdRef = useRef(0);
  const scheduledVaultIndexRefreshRef = useRef<{ idleId: number | null; timeoutId: number | null } | null>(null);
  const vaultIndexFileOverridesRef = useRef<Map<string, VaultIndexFileResponse>>(new Map());
  const vaultTagSearchCacheRef = useRef<Map<string, VaultSearchResult[]>>(new Map());
  const vaultTagSearchPendingRef = useRef<Map<string, Promise<VaultSearchResult[]>>>(new Map());
  const persistedSettingsJsonRef = useRef<string | null>(null);
  const latestSettingsToPersistRef = useRef<AppSettings | null>(null);
  const windowStateSaveTimeoutRef = useRef<number | null>(null);
  const windowStateRef = useRef<WindowState | null>(windowState);
  const restoreWindowStateRef = useRef(restoreWindowState);
  const windowActionPendingRef = useRef(false);
  const appInitiatedWindowCloseRef = useRef(false);
  const externalConflictKeyRef = useRef<string | null>(null);
  const imagePreviewCacheRef = useRef<Map<string, string>>(new Map());
  const imagePreviewSignatureRef = useRef<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pendingSourceLocation, setPendingSourceLocation] = useState<SourceLocationTarget | null>(null);
  const [imagePreviewMap, setImagePreviewMap] = useState<Record<string, string>>({});
  const [activeUnlinkedMentions, setActiveUnlinkedMentions] = useState<VaultUnlinkedMention[]>([]);
  const [paletteMode, setPaletteMode] = useState<PaletteMode | null>(null);
  const [vaultQuickstartOpen, setVaultQuickstartOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [windowActionPending, setWindowActionPending] = useState<"minimize" | "maximize" | "close" | null>(null);
  const [documentViewMode, setDocumentViewModeState] = useState<DocumentViewMode>(editorMode);
  const [centerView, setCenterView] = useState<"markdown" | "graph">("markdown");
  const [centerGraphOpen, setCenterGraphOpen] = useState(false);
  const [centerGraphTag, setCenterGraphTag] = useState("");
  const [centerGraphIsolatedOnly, setCenterGraphIsolatedOnly] = useState(false);
  const [centerGraphShowUnresolved, setCenterGraphShowUnresolved] = useState(false);
  const [centerGraphWidth, setCenterGraphWidth] = useState(430);
  const [demoVaultMode, setDemoVaultMode] = useState(false);
  const [initialOpenFileChecked, setInitialOpenFileChecked] = useState(false);
  const [sidebarSearchFocusSignal, setSidebarSearchFocusSignal] = useState(0);
  const [sidebarSearchSeed, setSidebarSearchSeed] = useState("");
  const [sidebarSearchNavigation, setSidebarSearchNavigation] = useState<{ signal: number; direction: 1 | -1 }>({
    signal: 0,
    direction: 1,
  });
  const appShellRef = useRef<HTMLDivElement | null>(null);

  const activeNote = notes.find((note) => note.id === activeNoteId) ?? notes[0];
  const activeNoteRef = useRef<Note>(activeNote);
  activeNoteRef.current = activeNote;
  const deferredActiveMarkdown = useDeferredValue(activeNote.markdown);
  const outlineMarkdown = activeNote.markdown;
  const t = appText[language];
  const hasActiveDocument = !isEmptyPlaceholder(activeNote);
  const outline = useMemo(() => extractMarkdownHeadings(outlineMarkdown), [outlineMarkdown]);
  const persistedActiveIndexedFile = useMemo(() => findIndexedFile(vaultIndex, activeNote.filePath), [activeNote.filePath, vaultIndex]);
  const activeIndexedFile = useMemo(() => (
    createDraftIndexedFile(vaultIndex, activeNote.filePath, deferredActiveMarkdown) ?? persistedActiveIndexedFile
  ), [activeNote.filePath, deferredActiveMarkdown, persistedActiveIndexedFile, vaultIndex]);
  const activeIndexedFileForTagFeatures = useMemo(() => {
    if (tagFeaturesEnabled || !activeIndexedFile) return activeIndexedFile;
    return { ...activeIndexedFile, tags: [] };
  }, [activeIndexedFile, tagFeaturesEnabled]);
  const activeBacklinks = useMemo(() => getBacklinks(vaultIndex, activeNote.filePath), [activeNote.filePath, vaultIndex]);
  const activeOutgoingLinks = activeIndexedFile?.outgoingLinks ?? [];
  const activeResolvedLinks = activeOutgoingLinks.filter((link) => link.targetPath);
  const activeUnresolvedLinks = activeOutgoingLinks.filter((link) => !link.targetPath);
  const localGraph = useMemo(() => createLocalGraph(vaultIndex, activeNote.filePath, activeIndexedFile), [activeIndexedFile, activeNote.filePath, vaultIndex]);
  const vaultTags = useMemo(() => (
    tagFeaturesEnabled ? listVaultTags(vaultIndex, activeIndexedFile) : []
  ), [activeIndexedFile, tagFeaturesEnabled, vaultIndex]);
  const wikiLinkSuggestions = useMemo(() => {
    if (!vaultIndex) return [];
    const baseNameCounts = new Map<string, number>();
    for (const file of vaultIndex.files) {
      const baseName = stripExtension(pathFileName(file.relativePath)).toLocaleLowerCase();
      baseNameCounts.set(baseName, (baseNameCounts.get(baseName) ?? 0) + 1);
    }

    return vaultIndex.files.map((file) => {
      const baseName = stripExtension(pathFileName(file.relativePath));
      const target = (baseNameCounts.get(baseName.toLocaleLowerCase()) ?? 0) > 1
        ? stripExtension(file.relativePath)
        : baseName;
      return {
        target,
        label: file.title || baseName,
        description: file.relativePath,
      };
    });
  }, [vaultIndex]);
  const centerGraph = useMemo(() => {
    if (!centerGraphOpen) return createGlobalGraph(null);
    return createGlobalGraph(vaultIndex, {
      tag: tagFeaturesEnabled ? centerGraphTag || null : null,
      isolatedOnly: centerGraphIsolatedOnly,
      showUnresolved: centerGraphShowUnresolved,
      maxNodes: 180,
    });
  }, [centerGraphIsolatedOnly, centerGraphOpen, centerGraphShowUnresolved, centerGraphTag, tagFeaturesEnabled, vaultIndex]);
  const shortcutConflicts = useMemo(() => findShortcutConflicts(shortcuts), [shortcuts]);
  const globalAppShortcuts = useMemo(() => resolveGlobalAppShortcuts(shortcuts), [shortcuts]);
  const globalRevealShortcut = globalAppShortcuts.revealWindow;
  const globalQuickNoteShortcut = globalAppShortcuts.openQuickNote;
  const vaultMode = Boolean(vaultRoot);
  const textStats = useMemo(() => countDocumentText(deferredActiveMarkdown), [deferredActiveMarkdown]);
  const lineCount = useMemo(() => deferredActiveMarkdown.split(/\r?\n/).length, [deferredActiveMarkdown]);

  useEffect(() => {
    const handleFocusIn = (event: FocusEvent) => {
      const control = nativeTextControlFromTarget(event.target);
      if (control && !isEditorTextControlTarget(control)) {
        lastFocusedNativeTextControlRef.current = control;
        return;
      }
      if (isEditorTextControlTarget(event.target)) {
        lastFocusedNativeTextControlRef.current = null;
      }
    };

    window.addEventListener("focusin", handleFocusIn);
    return () => window.removeEventListener("focusin", handleFocusIn);
  }, []);

  useEffect(() => {
    if (tagFeaturesEnabled) return;
    if (centerGraphTag) setCenterGraphTag("");
    if (knowledgePanelTab === "tags") setKnowledgePanelTab("backlinks");
    vaultTagSearchCacheRef.current.clear();
    vaultTagSearchPendingRef.current.clear();
  }, [centerGraphTag, knowledgePanelTab, setKnowledgePanelTab, tagFeaturesEnabled]);

  useEffect(() => {
    if (!vaultIndex || !activeNote.filePath || !activeIndexedFile) {
      setActiveUnlinkedMentions((current) => (current.length ? [] : current));
      return undefined;
    }

    let disposed = false;
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const run = () => {
      if (disposed) return;
      const mentions = getIncomingUnlinkedMentions(vaultIndex, activeNote.filePath, activeIndexedFile);
      if (!disposed) setActiveUnlinkedMentions(mentions);
    };

    if (idleWindow.requestIdleCallback) {
      const idleId = idleWindow.requestIdleCallback(run, { timeout: 3000 });
      return () => {
        disposed = true;
        idleWindow.cancelIdleCallback?.(idleId);
      };
    }

    const timeoutId = window.setTimeout(run, 1200);
    return () => {
      disposed = true;
      window.clearTimeout(timeoutId);
    };
  }, [activeIndexedFile, activeNote.filePath, vaultIndex]);

  const persistVaultPatch = useCallback((patch: Partial<VaultWorkspaceState>) => {
    setVaultWorkspace((current) => nextWorkspaceState(current, patch));
  }, []);

  const closeAppDialog = useCallback((result: AppDialogResult) => {
    const resolve = appDialogResolverRef.current;
    appDialogResolverRef.current = null;
    setAppDialog(null);
    setAppDialogInput("");
    resolve?.(result);
  }, []);

  const setGlobalEditorMode = useCallback((mode: EditorMode) => {
    setEditorMode(mode);
    setDefaultEditorModeSetting(mode);
    setDocumentViewModeState(mode);
  }, [setDefaultEditorModeSetting, setEditorMode]);

  const setDocumentViewMode = useCallback((mode: DocumentViewMode) => {
    if (mode === "mindmap") {
      setDocumentViewModeState(mode);
      return;
    }
    setGlobalEditorMode(mode);
  }, [setGlobalEditorMode]);

  const showInputDialog = useCallback((title: string, defaultValue = "", message?: string) => (
    new Promise<string | null>((resolve) => {
      appDialogResolverRef.current = (value) => resolve(typeof value === "string" ? value : null);
      setAppDialogInput(defaultValue);
      setAppDialog({
        id: Date.now(),
        kind: "input",
        title,
        message,
        confirmLabel: t.dialog.ok,
        cancelLabel: t.dialog.cancel,
      });
    })
  ), [t.dialog.cancel, t.dialog.ok]);

  const showConfirmDialog = useCallback((title: string, message: string, danger = false, confirmLabel?: string) => (
    new Promise<boolean>((resolve) => {
      appDialogResolverRef.current = (value) => resolve(value === true);
      setAppDialog({
        id: Date.now(),
        kind: "confirm",
        title,
        message,
        confirmLabel: confirmLabel ?? (danger ? t.dialog.deleteConfirm : t.dialog.confirm),
        cancelLabel: t.dialog.cancel,
        danger,
      });
    })
  ), [t.dialog.cancel, t.dialog.confirm, t.dialog.deleteConfirm]);

  const showMessageDialog = useCallback((title: string, message?: string) => (
    new Promise<void>((resolve) => {
      appDialogResolverRef.current = () => resolve();
      setAppDialog({
        id: Date.now(),
        kind: "alert",
        title,
        message,
        confirmLabel: t.dialog.close,
      });
    })
  ), [t.dialog.close]);

  const showChoiceDialog = useCallback((
    title: string,
    choices: Array<{ value: string; label: string; description?: string }>,
    message?: string,
  ) => (
    new Promise<string | null>((resolve) => {
      appDialogResolverRef.current = (value) => resolve(typeof value === "string" ? value : null);
      setAppDialog({
        id: Date.now(),
        kind: "choice",
        title,
        message,
        confirmLabel: t.dialog.ok,
        cancelLabel: t.dialog.cancel,
        choices,
      });
    })
  ), [t.dialog.cancel, t.dialog.ok]);

  const showCloseBehaviorDialog = useCallback(() => (
    new Promise<{ choice: Exclude<CloseButtonBehavior, "ask">; remember: boolean } | null>((resolve) => {
      appDialogResolverRef.current = (value) => {
        if (
          value
          && typeof value === "object"
          && "choice" in value
          && (value.choice === "tray" || value.choice === "exit")
        ) {
          resolve({ choice: value.choice, remember: Boolean(value.remember) });
          return;
        }
        resolve(null);
      };
      setAppDialog({
        id: Date.now(),
        kind: "choice",
        title: t.prompts.closeBehaviorTitle,
        message: t.prompts.closeBehaviorMessage,
        confirmLabel: t.dialog.ok,
        cancelLabel: t.dialog.cancel,
        rememberLabel: t.prompts.closeBehaviorRemember,
        choices: [
          {
            value: "tray",
            label: t.prompts.closeBehaviorTray,
            description: t.prompts.closeBehaviorTrayDescription,
          },
          {
            value: "exit",
            label: t.prompts.closeBehaviorExit,
            description: t.prompts.closeBehaviorExitDescription,
          },
        ],
      });
    })
  ), [
    t.dialog.cancel,
    t.dialog.ok,
    t.prompts.closeBehaviorExit,
    t.prompts.closeBehaviorExitDescription,
    t.prompts.closeBehaviorMessage,
    t.prompts.closeBehaviorRemember,
    t.prompts.closeBehaviorTitle,
    t.prompts.closeBehaviorTray,
    t.prompts.closeBehaviorTrayDescription,
  ]);

  const confirmDiscardUnsavedChanges = useCallback(async () => {
    if (!notes.some((note) => note.dirty)) return true;
    const choice = await showChoiceDialog(t.prompts.unsavedChangesTitle, [
      {
        value: "save",
        label: t.prompts.saveAndContinueAction,
        description: t.prompts.saveAndContinueHint,
      },
      {
        value: "discard",
        label: t.prompts.discardChangesAction,
        description: t.prompts.discardChangesHint,
      },
    ], t.prompts.unsavedChangesMessage);

    if (choice === "discard") return true;
    if (choice !== "save") return false;

    return saveBeforeContinueRef.current ? saveBeforeContinueRef.current() : false;
  }, [
    notes,
    showChoiceDialog,
    t.prompts.discardChangesAction,
    t.prompts.discardChangesHint,
    t.prompts.saveAndContinueAction,
    t.prompts.saveAndContinueHint,
    t.prompts.unsavedChangesMessage,
    t.prompts.unsavedChangesTitle,
  ]);

  useEffect(() => {
    windowStateRef.current = windowState;
  }, [windowState]);

  useEffect(() => {
    restoreWindowStateRef.current = restoreWindowState;
  }, [restoreWindowState]);

  const captureWindowState = useCallback(async (options: { persistImmediately?: boolean } = {}) => {
    if (!isTauriRuntime() || !restoreWindowStateRef.current) return null;

    try {
      const currentWindow = getCurrentWindow();
      const [position, size, maximized] = await Promise.all([
        currentWindow.outerPosition(),
        currentWindow.outerSize(),
        currentWindow.isMaximized(),
      ]);
      const nextWindowState: WindowState = {
        x: Math.round(position.x),
        y: Math.round(position.y),
        width: Math.round(size.width),
        height: Math.round(size.height),
        maximized,
      };

      if (!windowStatesEqual(windowStateRef.current, nextWindowState)) {
        windowStateRef.current = nextWindowState;
        setWindowState(nextWindowState);
      }

      if (options.persistImmediately && latestSettingsToPersistRef.current) {
        writeSettings({
          ...latestSettingsToPersistRef.current,
          restoreWindowState: restoreWindowStateRef.current,
          windowState: nextWindowState,
        });
      }

      return nextWindowState;
    } catch (error) {
      console.warn("Failed to capture window state", error);
      return null;
    }
  }, [setWindowState]);

  const scheduleWindowStateCapture = useCallback(() => {
    if (!isTauriRuntime() || !restoreWindowStateRef.current) return;
    if (windowStateSaveTimeoutRef.current !== null) {
      window.clearTimeout(windowStateSaveTimeoutRef.current);
    }

    windowStateSaveTimeoutRef.current = window.setTimeout(() => {
      windowStateSaveTimeoutRef.current = null;
      void captureWindowState();
    }, WINDOW_STATE_SAVE_DELAY_MS);
  }, [captureWindowState]);

  const flushWindowStateCapture = useCallback(async () => {
    if (windowStateSaveTimeoutRef.current !== null) {
      window.clearTimeout(windowStateSaveTimeoutRef.current);
      windowStateSaveTimeoutRef.current = null;
    }
    if (!restoreWindowStateRef.current) {
      if (latestSettingsToPersistRef.current) {
        writeSettings({
          ...latestSettingsToPersistRef.current,
          restoreWindowState: false,
        });
      }
      return;
    }

    const capturedWindowState = await captureWindowState({ persistImmediately: true });
    if (!capturedWindowState && latestSettingsToPersistRef.current) {
      writeSettings(latestSettingsToPersistRef.current);
    }
  }, [captureWindowState]);

  useEffect(() => {
    if (!isTauriRuntime()) return undefined;

    const currentWindow = getCurrentWindow();
    let disposed = false;
    const savedWindowState = windowStateRef.current;
    const shouldRestoreWindowState = restoreWindowStateRef.current && savedWindowState;

    void (async () => {
      try {
        if (shouldRestoreWindowState) {
          await currentWindow.unmaximize().catch(() => undefined);
          await currentWindow.setSize(new PhysicalSize(savedWindowState.width, savedWindowState.height));
          await currentWindow.setPosition(new PhysicalPosition(savedWindowState.x, savedWindowState.y));
          if (savedWindowState.maximized) await currentWindow.maximize();
        } else {
          await currentWindow.center();
        }

        if (!disposed) scheduleWindowStateCapture();
      } catch (error) {
        console.warn("Failed to apply window state", error);
      } finally {
        try {
          await currentWindow.show();
        } catch (showError) {
          console.warn("Failed to show main window", showError);
        }
      }
    })();

    return () => {
      disposed = true;
    };
  }, [scheduleWindowStateCapture]);

  useEffect(() => {
    if (!isTauriRuntime()) return undefined;

    let disposed = false;
    let unlistenMoved: (() => void) | null = null;
    let unlistenResized: (() => void) | null = null;
    const currentWindow = getCurrentWindow();

    currentWindow.onMoved(scheduleWindowStateCapture)
      .then((unlisten) => {
        if (disposed) {
          unlisten();
          return;
        }
        unlistenMoved = unlisten;
      })
      .catch((error) => {
        console.warn("Window move listener is only available inside Tauri", error);
      });

    currentWindow.onResized(scheduleWindowStateCapture)
      .then((unlisten) => {
        if (disposed) {
          unlisten();
          return;
        }
        unlistenResized = unlisten;
      })
      .catch((error) => {
        console.warn("Window resize listener is only available inside Tauri", error);
      });

    return () => {
      disposed = true;
      unlistenMoved?.();
      unlistenResized?.();
      if (windowStateSaveTimeoutRef.current !== null) {
        window.clearTimeout(windowStateSaveTimeoutRef.current);
        windowStateSaveTimeoutRef.current = null;
      }
    };
  }, [scheduleWindowStateCapture]);

  const destroyCurrentWindow = useCallback(async () => {
    const currentWindow = getCurrentWindow();
    appInitiatedWindowCloseRef.current = true;
    try {
      await flushWindowStateCapture();
      await windowActionWithTimeout(currentWindow.close(), "window close");
    } catch (closeError) {
      console.warn("Window close failed; falling back to destroy", closeError);
      try {
        await flushWindowStateCapture();
        await windowActionWithTimeout(currentWindow.destroy(), "window destroy");
      } finally {
        window.setTimeout(() => {
          appInitiatedWindowCloseRef.current = false;
        }, 500);
      }
    }
  }, [flushWindowStateCapture]);

  const requestCloseWindow = useCallback(async () => {
    if (windowActionPendingRef.current) return;
    windowActionPendingRef.current = true;
    setWindowActionPending("close");
    setOpenMenuId(null);
    setSettingsOpen(false);
    let attemptedBehavior: CloseButtonBehavior = closeButtonBehavior;

    try {
      let behavior = closeButtonBehavior;
      if (behavior === "ask") {
        const selected = await showCloseBehaviorDialog();
        if (!selected) return;
        behavior = selected.choice;
        attemptedBehavior = selected.choice;
        if (selected.remember) setCloseButtonBehavior(selected.choice);
      }

      if (behavior === "tray") {
        attemptedBehavior = "tray";
        await flushWindowStateCapture();
        await windowActionWithTimeout(hideMainWindowToTray(), "window hide to tray");
        return;
      }

      attemptedBehavior = "exit";
      if (!await confirmDiscardUnsavedChanges()) return;
      await destroyCurrentWindow();
    } catch (error) {
      console.warn("Failed to close window", error);
      setToastMessage(attemptedBehavior === "tray" ? t.status.trayMinimizeFailed : t.status.closeFailed);
    } finally {
      windowActionPendingRef.current = false;
      setWindowActionPending(null);
    }
  }, [
    closeButtonBehavior,
    confirmDiscardUnsavedChanges,
    destroyCurrentWindow,
    flushWindowStateCapture,
    setCloseButtonBehavior,
    setOpenMenuId,
    setSettingsOpen,
    showCloseBehaviorDialog,
    t.status.closeFailed,
    t.status.trayMinimizeFailed,
  ]);

  const requestExitWindow = useCallback(async () => {
    if (windowActionPendingRef.current) return;
    windowActionPendingRef.current = true;
    setWindowActionPending("close");
    setOpenMenuId(null);
    setSettingsOpen(false);

    try {
      if (!await confirmDiscardUnsavedChanges()) return;
      await destroyCurrentWindow();
    } catch (error) {
      console.warn("Failed to exit window", error);
      setToastMessage(t.status.closeFailed);
    } finally {
      windowActionPendingRef.current = false;
      setWindowActionPending(null);
    }
  }, [
    confirmDiscardUnsavedChanges,
    destroyCurrentWindow,
    setOpenMenuId,
    setSettingsOpen,
    t.status.closeFailed,
  ]);

  const handleWindowAction = useCallback((action: "minimize" | "maximize" | "close") => {
    const run = async () => {
      if (windowActionPendingRef.current) return;
      if (action === "close") {
        await requestCloseWindow();
        return;
      }

      windowActionPendingRef.current = true;
      setWindowActionPending(action);

      try {
        const currentWindow = getCurrentWindow();
        if (action === "minimize") await windowActionWithTimeout(currentWindow.minimize(), "window minimize");
        if (action === "maximize") {
          await windowActionWithTimeout(currentWindow.toggleMaximize(), "window toggle maximize");
          window.setTimeout(() => window.dispatchEvent(new Event("resize")), 80);
        }
      } catch (error) {
        console.warn("Window action is only available inside Tauri", error);
      } finally {
        windowActionPendingRef.current = false;
        setWindowActionPending(null);
      }
    };

    void run();
  }, [requestCloseWindow]);

  useEffect(() => {
    if (!isTauriRuntime()) return undefined;

    let disposed = false;
    let unlisten: (() => void) | null = null;

    listen("serein-tray-exit-requested", () => {
      if (!disposed) void requestExitWindow();
    }).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten();
        return;
      }
      unlisten = nextUnlisten;
    }).catch((error) => {
      console.warn("Tray exit listener is only available inside Tauri", error);
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [requestExitWindow]);

  const handleChromeDragMouseDown = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (event.button !== 0 || event.detail > 1) return;
    if (isWindowDragBlockedTarget(event.target)) return;
    if (event.target instanceof Element && event.target.closest("[data-tauri-drag-region]")) return;

    try {
      void getCurrentWindow().startDragging();
    } catch (error) {
      console.warn("Window dragging is only available inside Tauri", error);
    }
  }, []);

  const handleChromeDoubleClick = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (isWindowDragBlockedTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    handleWindowAction("maximize");
  }, [handleWindowAction]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    try {
      getCurrentWindow().onCloseRequested((event) => {
        if (appInitiatedWindowCloseRef.current) return;
        event.preventDefault();
        void requestCloseWindow();
      }).then((nextUnlisten) => {
        if (disposed) {
          nextUnlisten();
          return;
        }
        unlisten = nextUnlisten;
      }).catch((error) => {
        console.warn("Window close request listener is only available inside Tauri", error);
      });
    } catch (error) {
      console.warn("Window close request listener is only available inside Tauri", error);
    }

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [requestCloseWindow]);

  const handleMarkdownChange = useCallback((markdown: string) => {
    const normalizedMarkdown = normalizeWikiLinkEscapes(markdown);
    setNotes((currentNotes) => currentNotes.map((note) => {
      if (note.id !== activeNoteId) return note;
      if (note.markdown === normalizedMarkdown) return note;
      return noteWithMarkdown(note, normalizedMarkdown);
    }));
  }, [activeNoteId, setNotes]);

  const loadVaultDirectory = useCallback(async (relativePath = "", root = vaultRoot) => {
    if (!root) {
      setVaultTree(null);
      return null;
    }

    setVaultTree((current) => {
      if (!current && relativePath === "") {
        return {
          name: pathFileName(root),
          path: root,
          relativePath: "",
          kind: "directory",
          fileExt: null,
          children: [],
          loaded: false,
          loading: true,
          hasMore: false,
          truncated: false,
          loadError: null,
        };
      }

      return current
        ? updateVaultNode(current, relativePath, (entry) => ({ ...entry, loading: true, loadError: null }))
        : current;
    });

    try {
      const directory = await readVaultDirectory(root, relativePath, VAULT_DIRECTORY_LIMIT);
      const nextDirectory = directoryFromResponse(directory);
      setVaultTree((current) => {
        if (!current) return nextDirectory;
        if (relativePath === "") return preserveLoadedDirectoryChildren(nextDirectory, current);
        return updateVaultNode(current, relativePath, (entry) => preserveLoadedDirectoryChildren(nextDirectory, entry));
      });
      setVaultError(null);
      setVaultRecoveryBlocked(false);
      return directory;
    } catch (error) {
      console.error("Failed to read vault directory", error);
      const message = relativePath ? t.errors.readDirectoryFailed : t.errors.vaultLoadFailed;
      setVaultError(message);
      if (relativePath === "") setVaultRecoveryBlocked(true);
      setVaultTree((current) => (
        current
          ? updateVaultNode(current, relativePath, (entry) => ({ ...entry, loading: false, loadError: message }))
          : current
      ));
      return null;
    }
  }, [t.errors.readDirectoryFailed, t.errors.vaultLoadFailed, vaultRoot]);

  const refreshVaultIndex = useCallback(async (root = vaultRoot) => {
    if (!root) {
      setVaultIndex(null);
      setVaultIndexStatus("idle");
      setVaultIndexError(null);
      vaultTagSearchCacheRef.current.clear();
      vaultTagSearchPendingRef.current.clear();
      return;
    }

    const refreshId = vaultIndexRefreshIdRef.current + 1;
    vaultIndexRefreshIdRef.current = refreshId;
    setVaultIndexStatus("indexing");
    setVaultIndexError(null);

    try {
      const response = await readVaultIndexFiles(root);
      if (vaultIndexRefreshIdRef.current !== refreshId) return;
      const nextIndex = applyVaultIndexOverrides(
        await buildVaultIndexAsync(root, response),
        root,
        vaultIndexFileOverridesRef.current.values(),
      );
      if (vaultIndexRefreshIdRef.current !== refreshId) return;
      setVaultIndex(nextIndex);
      setVaultIndexStatus("ready");
    } catch (error) {
      if (vaultIndexRefreshIdRef.current !== refreshId) return;
      console.error("Failed to index vault", error);
      setVaultIndex(null);
      setVaultIndexStatus("error");
      setVaultIndexError(t.errors.vaultIndexFailed);
    }
  }, [t.errors.vaultIndexFailed, vaultRoot]);

  const cancelScheduledVaultIndexRefresh = useCallback(() => {
    const idleWindow = window as Window & {
      cancelIdleCallback?: (handle: number) => void;
    };
    const scheduled = scheduledVaultIndexRefreshRef.current;
    if (scheduled?.idleId !== null && scheduled?.idleId !== undefined) {
      idleWindow.cancelIdleCallback?.(scheduled.idleId);
    }
    if (scheduled?.timeoutId !== null && scheduled?.timeoutId !== undefined) {
      window.clearTimeout(scheduled.timeoutId);
    }
    scheduledVaultIndexRefreshRef.current = null;
  }, []);

  const scheduleVaultIndexRefresh = useCallback((root: string) => {
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
    };

    cancelScheduledVaultIndexRefresh();

    const run = () => {
      scheduledVaultIndexRefreshRef.current = null;
      void refreshVaultIndex(root);
    };

    if (idleWindow.requestIdleCallback) {
      const idleId = idleWindow.requestIdleCallback(run, { timeout: 2500 });
      scheduledVaultIndexRefreshRef.current = { idleId, timeoutId: null };
      return;
    }

    const timeoutId = window.setTimeout(run, 1200);
    scheduledVaultIndexRefreshRef.current = { idleId: null, timeoutId };
  }, [cancelScheduledVaultIndexRefresh, refreshVaultIndex]);

  const ensureVaultIndexForSearch = useCallback((options: { force?: boolean } = {}) => {
    if (!vaultRoot || vaultIndexStatus === "indexing") return;
    if (!options.force && vaultIndexStatus === "ready" && vaultIndex) return;
    cancelScheduledVaultIndexRefresh();
    void refreshVaultIndex(vaultRoot);
  }, [cancelScheduledVaultIndexRefresh, refreshVaultIndex, vaultIndex, vaultIndexStatus, vaultRoot]);

  const applyOpenedFile = useCallback((file: Awaited<ReturnType<typeof readMarkdownFile>>, options: { standalone?: boolean } = {}) => {
    const nextNote = createFileNote(file);
    const useVaultContext = Boolean(vaultRoot) && !options.standalone;

    clearWindowSelectionSoon();

    setNotes((currentNotes) => {
      if (useVaultContext || options.standalone) return [nextNote];

      if (activeNote && isEmptyDraft(activeNote)) {
        return currentNotes.map((note) => (note.id === activeNote.id ? nextNote : note));
      }

      return [nextNote, ...currentNotes.filter((note) => note.filePath !== nextNote.filePath)];
    });
    setActiveNoteId(nextNote.id);
    setLastOpenedFile(null);
    if (useVaultContext && vaultRoot) {
      const relativePath = nextNote.filePath ? relativePathFromRoot(vaultRoot, nextNote.filePath) : null;
      if (relativePath !== null) {
        const indexFile = {
          path: file.path,
          relativePath,
          fileName: file.fileName,
          fileExt: file.fileExt,
          content: file.content,
        };
        if (vaultIndexStatus !== "ready") {
          setVaultIndex(upsertVaultIndexFile(null, vaultRoot, indexFile));
        }
      }

      persistVaultPatch({
        lastOpenedFile: null,
        recentFiles: pushRecentFile(vaultWorkspace.recentFiles, nextNote.filePath ?? null),
      });
    }
    setSaveError(null);
    setSaveStatus("saved");
  }, [activeNote, persistVaultPatch, setVaultIndex, vaultIndexStatus, vaultRoot, vaultWorkspace.recentFiles]);

  const openMarkdownFile = useCallback(async (path: string, options: {
    skipUnsavedCheck?: boolean;
    standalone?: boolean;
    targetHeading?: string | null;
    targetLine?: number | null;
    targetText?: string | null;
  } = {}) => {
    const currentPath = activeNote.filePath ? normalizeFilePath(activeNote.filePath) : null;
    if (!options.skipUnsavedCheck && normalizeFilePath(path) !== currentPath && !await confirmDiscardUnsavedChanges()) return;
    const file = demoVaultMode ? readDemoMarkdownFile(path) : await readMarkdownFile(path);
    applyOpenedFile(file, { standalone: options.standalone });
    pendingHeadingRef.current = options.targetHeading?.trim() || null;
    setPendingSourceLocation(options.targetLine
      ? { line: options.targetLine, text: options.targetText?.trim() || null }
      : null);
  }, [activeNote.filePath, applyOpenedFile, confirmDiscardUnsavedChanges, demoVaultMode, setPendingSourceLocation]);

  const handleOpenFile = useCallback(async () => {
    try {
      if (!await confirmDiscardUnsavedChanges()) return;
      const selected = await open({
        multiple: false,
        filters: [{ name: "Markdown/Text", extensions: ["md", "markdown", "txt"] }],
      });

      if (!selected || Array.isArray(selected)) return;
      await openMarkdownFile(selected, { skipUnsavedCheck: true });
    } catch (error) {
      console.error("Failed to open file", error);
      setSaveError(t.errors.openFileFailed);
      setSaveStatus("error");
    }
  }, [confirmDiscardUnsavedChanges, openMarkdownFile, t.errors.openFileFailed]);

  const activateVault = useCallback(async (root: string) => {
    const initialized = await initVault(root);
    const workspace = nextWorkspaceState(mergeWorkspaceState(initialized.workspace, {
      sidebarWidth,
      sidebarVisible,
      rightPanelVisible,
      rightPanelWidth,
      editorLeftGap,
      uiScale,
    }), { lastOpenedFile: null });

    vaultIndexFileOverridesRef.current.clear();
    vaultTagSearchCacheRef.current.clear();
    vaultTagSearchPendingRef.current.clear();
    cancelScheduledVaultIndexRefresh();
    vaultIndexRefreshIdRef.current += 1;
    setVaultIndex(null);
    setVaultIndexStatus("idle");
    setVaultIndexError(null);
    setVaultRoot(initialized.root);
    setVaultWorkspace(workspace);
    setSelectedVaultDir(workspace.selectedDir);
    setLastOpenedFile(null);
    setSidebarWidth(clampSidebarWidth(workspace.layout.sidebarWidth));
    setSidebarVisible(workspace.layout.sidebarVisible);
    setRightPanelVisible(workspace.layout.rightPanelVisible);
    setRightPanelWidth(clampRightPanelWidth(workspace.layout.rightPanelWidth));
    setEditorLeftGap(clampEditorLeftGap(workspace.layout.editorLeftGap));
    setUiScale(clampUiScale(workspace.layout.uiScale));
    setVaultRecoveryBlocked(false);
    setDemoVaultMode(false);
    setCenterGraphOpen(workspace.centerGraph.open);
    setCenterView(workspace.centerGraph.open ? workspace.centerGraph.activeView : "markdown");
    setCenterGraphTag(workspace.centerGraph.selectedTag);
    setCenterGraphIsolatedOnly(workspace.centerGraph.isolatedOnly);
    setCenterGraphShowUnresolved(workspace.centerGraph.showUnresolved);
    setExpandedDirs(new Set([""]));
    const emptyNote = createEmptyNote();
    setNotes([emptyNote]);
    setActiveNoteId(emptyNote.id);
    void loadVaultDirectory("", initialized.root);
  }, [
    cancelScheduledVaultIndexRefresh,
    editorLeftGap,
    loadVaultDirectory,
    rightPanelVisible,
    rightPanelWidth,
    sidebarVisible,
    sidebarWidth,
    setVaultIndex,
    setVaultIndexError,
    setVaultIndexStatus,
    uiScale,
  ]);

  const handleOpenVault = useCallback(async () => {
    try {
      if (!await confirmDiscardUnsavedChanges()) return;
      const selected = await open({ directory: true, multiple: false });
      if (!selected || Array.isArray(selected)) return;
      await activateVault(selected);
    } catch (error) {
      console.error("Failed to open vault", error);
      setVaultError(t.errors.openVaultFailed);
    }
  }, [activateVault, confirmDiscardUnsavedChanges, t.errors.openVaultFailed]);

  useEffect(() => {
    if (!import.meta.env.DEV || loadedDemoVaultRef.current) return;
    if (new URLSearchParams(window.location.search).get("demoVault") !== "serein") return;
    loadedDemoVaultRef.current = true;

    const demo = createDemoVault();
    const nextNote = createFileNote(demo.activeFile);
    restoredVaultRef.current = true;
    restoredStandaloneFileRef.current = true;

    vaultIndexFileOverridesRef.current.clear();
    vaultTagSearchCacheRef.current.clear();
    vaultTagSearchPendingRef.current.clear();
    setVaultRoot(demo.root);
    setDemoVaultMode(true);
    setVaultTree(demo.tree);
    setVaultIndex(buildVaultIndex(demo.root, demo.indexResponse));
    setVaultIndexStatus("ready");
    setVaultIndexError(null);
    setVaultError(null);
    setSelectedVaultDir("");
    setExpandedDirs(new Set(demo.expandedDirs));
    setLastOpenedFile(null);
    setNotes([nextNote]);
    setActiveNoteId(nextNote.id);
    setSaveStatus("saved");
    setSaveError(null);
    setSidebarVisible(true);
    setRightPanelVisible(true);
    setKnowledgePanelTab("outgoing");
    setCenterGraphOpen(true);
    setCenterView("graph");
  }, [
    setActiveNoteId,
    setExpandedDirs,
    setKnowledgePanelTab,
    setLastOpenedFile,
    setNotes,
    setRightPanelVisible,
    setSaveError,
    setSaveStatus,
    setSelectedVaultDir,
    setSidebarVisible,
    setVaultError,
    setVaultIndex,
    setVaultIndexError,
    setVaultIndexStatus,
    setVaultRoot,
    setVaultTree,
  ]);

  const saveNoteToPath = useCallback(async (note: Note, path: string) => {
    const normalizedPath = ensureSaveExtension(path, defaultSaveExt);
    const markdownToSave = note.dirty ? note.markdown : (note.savedMarkdown ?? note.markdown);
    const contentToWrite = applyLineEnding(markdownToSave, note.lineEnding ?? "lf");
    const isExistingFileSave = note.filePath
      ? normalizeFilePath(normalizedPath) === normalizeFilePath(note.filePath)
      : false;
    const file = await writeMarkdownFile(
      normalizedPath,
      contentToWrite,
      isExistingFileSave ? note.fileModifiedAtMs : null,
      isExistingFileSave ? note.fileSize : null,
    );
    const nextNote: Note = {
      ...note,
      title: stripExtension(file.fileName) || extractFirstLineTitle(markdownToSave) || note.title,
      markdown: markdownToSave,
      filePath: file.path,
      fileName: file.fileName,
      fileExt: file.fileExt,
      fileModifiedAtMs: file.modifiedAtMs,
      fileSize: file.size,
      lineEnding: note.lineEnding ?? detectLineEnding(file.content),
      savedMarkdown: markdownToSave,
      updatedAt: new Date().toISOString(),
      dirty: false,
    };

    startTransition(() => {
      setNotes((currentNotes) => currentNotes.map((item) => {
        if (item.id !== note.id) return item;
        if (markdownEqualForDirty(item.markdown, markdownToSave)) return nextNote;

        const currentWithSavedMetadata: Note = {
          ...item,
          filePath: file.path,
          fileName: file.fileName,
          fileExt: file.fileExt,
          fileModifiedAtMs: file.modifiedAtMs,
          fileSize: file.size,
          lineEnding: item.lineEnding ?? note.lineEnding ?? "lf",
          savedMarkdown: markdownToSave,
        };

        return {
          ...currentWithSavedMetadata,
          title: titleFromMarkdown(item.markdown, currentWithSavedMetadata.title),
          dirty: noteDirtyForMarkdown(currentWithSavedMetadata, item.markdown),
        };
      }));
    });
    setLastOpenedFile(null);
    persistVaultPatch({
      lastOpenedFile: null,
      recentFiles: pushRecentFile(vaultWorkspace.recentFiles, nextNote.filePath ?? null),
    });
    if (vaultRoot) {
      const previousVaultRelativePath = note.filePath ? relativePathFromRoot(vaultRoot, note.filePath) : null;
      const savedVaultRelativePath = relativePathFromRoot(vaultRoot, file.path);
      if (savedVaultRelativePath !== null) {
        const indexFile = {
          path: file.path,
          relativePath: savedVaultRelativePath,
          fileName: file.fileName,
          fileExt: file.fileExt,
          content: markdownToSave,
        };
        vaultIndexFileOverridesRef.current.set(vaultIndexOverrideKey(vaultRoot, file.path), indexFile);
        vaultTagSearchCacheRef.current.clear();
        vaultTagSearchPendingRef.current.clear();
        if (vaultIndexStatus !== "ready") {
          setVaultIndex((currentIndex) => upsertVaultIndexFile(currentIndex, vaultRoot, indexFile));
        }
        if (!isExistingFileSave) {
          const directoriesToRefresh = new Set([parentVaultDir(savedVaultRelativePath)]);
          if (
            previousVaultRelativePath !== null
            && normalizeFilePath(previousVaultRelativePath) !== normalizeFilePath(savedVaultRelativePath)
          ) {
            directoriesToRefresh.add(parentVaultDir(previousVaultRelativePath));
          }
          for (const directory of directoriesToRefresh) {
            await loadVaultDirectory(directory);
          }
        }
        scheduleVaultIndexRefresh(vaultRoot);
      }
    }
    const savedSnapshotStillCurrent = activeNoteRef.current?.id === note.id
      && markdownEqualForDirty(activeNoteRef.current.markdown, markdownToSave);
    setSavedAt(new Date());
    setSaveError(null);
    setSaveStatus(savedSnapshotStillCurrent ? "saved" : "idle");
  }, [defaultSaveExt, loadVaultDirectory, persistVaultPatch, scheduleVaultIndexRefresh, setVaultIndex, vaultIndexStatus, vaultRoot, vaultWorkspace.recentFiles]);

  const syncActiveNoteFromDisk = useCallback(async () => {
    if (demoVaultMode || !activeNote?.filePath) return;

    try {
      const file = await readMarkdownFile(activeNote.filePath);
      const normalizedDiskContent = normalizeEditorLineEndings(file.content);
      const diskChanged = file.modifiedAtMs !== activeNote.fileModifiedAtMs
        || file.size !== activeNote.fileSize
        || normalizedDiskContent !== (activeNote.savedMarkdown ?? activeNote.markdown);
      if (!diskChanged) return;

      const conflictKey = `${file.path}:${file.modifiedAtMs ?? "unknown"}:${file.size}`;
      if (noteDirtyForMarkdown(activeNote, activeNote.markdown)) {
        if (externalConflictKeyRef.current !== conflictKey) {
          externalConflictKeyRef.current = conflictKey;
          setSaveError(t.status.externalFileConflict);
          setSaveStatus("error");
          setToastMessage(t.status.externalFileConflict);
        }
        return;
      }

      const nextNote: Note = {
        ...activeNote,
        title: stripExtension(file.fileName) || extractFirstLineTitle(normalizedDiskContent) || activeNote.title,
        markdown: normalizedDiskContent,
        fileName: file.fileName,
        fileExt: file.fileExt,
        fileModifiedAtMs: file.modifiedAtMs,
        fileSize: file.size,
        lineEnding: detectLineEnding(file.content),
        savedMarkdown: normalizedDiskContent,
        updatedAt: new Date().toISOString(),
        dirty: false,
      };

      setNotes((currentNotes) => currentNotes.map((note) => (
        note.id === activeNote.id && normalizeFilePath(note.filePath ?? "") === normalizeFilePath(file.path)
          ? nextNote
          : note
      )));

      externalConflictKeyRef.current = null;
      setSaveError(null);
      setSaveStatus("idle");
      setToastMessage(t.status.externalFileReloaded);
      if (vaultRoot) {
        vaultTagSearchCacheRef.current.clear();
        vaultTagSearchPendingRef.current.clear();
        await loadVaultDirectory(selectedVaultDir);
        await refreshVaultIndex(vaultRoot);
      }
    } catch (error) {
      console.warn("Failed to check active file on disk", error);
    }
  }, [
    activeNote,
    demoVaultMode,
    loadVaultDirectory,
    refreshVaultIndex,
    selectedVaultDir,
    setSaveError,
    setSaveStatus,
    t.status.externalFileConflict,
    t.status.externalFileReloaded,
    vaultRoot,
  ]);

  const handleSaveAs = useCallback(async () => {
    if (!activeNote) return false;

    try {
      const fallbackName = `${activeNote.fileName ? stripExtension(activeNote.fileName) : activeNote.title || "Untitled"}.${defaultSaveExt}`;
      const selected = await save({
        defaultPath: fallbackName,
        filters: [{ name: "Markdown/Text", extensions: ["md", "markdown", "txt"] }],
      });

      if (!selected) return false;
      await saveNoteToPath(activeNote, selected);
      return true;
    } catch (error) {
      console.error("Failed to save file as", error);
      setSaveError(t.errors.saveAsFailed);
      setSaveStatus("error");
      return false;
    }
  }, [activeNote, defaultSaveExt, saveNoteToPath, t.errors.saveAsFailed]);

  const handleSave = useCallback(async (options: { trustDirtyFlag?: boolean } = {}) => {
    if (!activeNote) return false;

    try {
      if (activeNote.filePath) {
        const dirty = options.trustDirtyFlag
          ? Boolean(activeNote.dirty)
          : noteDirtyForMarkdown(activeNote, activeNote.markdown);
        if (!dirty) {
          setSavedAt(new Date());
          setSaveError(null);
          setSaveStatus("saved");
          return true;
        }
        await saveNoteToPath(activeNote, activeNote.filePath);
        return true;
      } else {
        return await handleSaveAs();
      }
    } catch (error) {
      console.error("Failed to save file", error);
      setSaveError(t.errors.saveFailed);
      setSaveStatus("error");
      return false;
    }
  }, [activeNote, handleSaveAs, saveNoteToPath, setSaveError, setSaveStatus, t.errors.saveFailed]);

  useEffect(() => {
    saveActiveNoteRef.current = handleSave;
    return () => {
      if (saveActiveNoteRef.current === handleSave) {
        saveActiveNoteRef.current = null;
      }
    };
  }, [handleSave]);

  const scheduleBackgroundSave = useCallback(() => {
    backgroundSaveQueuedRef.current = true;
    if (backgroundSaveTimerRef.current !== null || backgroundSaveRunningRef.current) return;

    const run = () => {
      backgroundSaveTimerRef.current = null;
      if (!backgroundSaveQueuedRef.current) return;

      backgroundSaveQueuedRef.current = false;
      const saveActiveNote = saveActiveNoteRef.current;
      if (!saveActiveNote) return;

      const savePromise = saveActiveNote({ trustDirtyFlag: true });
      backgroundSaveRunningRef.current = savePromise;

      void savePromise.finally(() => {
        if (backgroundSaveRunningRef.current === savePromise) {
          backgroundSaveRunningRef.current = null;
        }
        if (backgroundSaveQueuedRef.current && activeNoteRef.current?.dirty) {
          backgroundSaveTimerRef.current = window.setTimeout(run, 0);
        } else if (!activeNoteRef.current?.dirty) {
          backgroundSaveQueuedRef.current = false;
        }
      });
    };

    backgroundSaveTimerRef.current = window.setTimeout(run, 0);
  }, []);

  const saveBeforeContinue = useCallback(async () => {
    const pendingBackgroundSave = backgroundSaveRunningRef.current;
    if (pendingBackgroundSave) {
      await pendingBackgroundSave;
    }
    if (backgroundSaveTimerRef.current !== null) {
      window.clearTimeout(backgroundSaveTimerRef.current);
      backgroundSaveTimerRef.current = null;
    }
    backgroundSaveQueuedRef.current = false;

    const saveActiveNote = saveActiveNoteRef.current;
    return saveActiveNote ? saveActiveNote({ trustDirtyFlag: false }) : false;
  }, []);

  useEffect(() => () => {
    if (backgroundSaveTimerRef.current !== null) {
      window.clearTimeout(backgroundSaveTimerRef.current);
      backgroundSaveTimerRef.current = null;
    }
    backgroundSaveQueuedRef.current = false;
  }, []);

  useEffect(() => {
    saveBeforeContinueRef.current = saveBeforeContinue;
    return () => {
      if (saveBeforeContinueRef.current === saveBeforeContinue) {
        saveBeforeContinueRef.current = null;
      }
    };
  }, [saveBeforeContinue]);

  const importImagesForEditor = useCallback(async (files: File[]) => {
    try {
      if (!activeNote.filePath) {
        throw new Error(t.errors.saveBeforeImageImport);
      }
      const currentFilePath = activeNote.filePath;

      const imageFiles = files.filter((file) => file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name));
      if (!imageFiles.length) return [];

      const imported = [];
      for (const file of imageFiles) {
        const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
        const asset = await importEditorAsset(vaultRoot, currentFilePath, file.name || "image.png", bytes, imageAttachmentFolder);
        imported.push({
          src: imagePathStyle === "absolute" ? asset.path : asset.relativeMarkdownPath,
          alt: stripExtension(asset.fileName || file.name || "image"),
        });
      }

      if (vaultRoot) {
        const relativeFilePath = relativePathFromRoot(vaultRoot, currentFilePath);
        const currentDir = relativeFilePath ? parentVaultDir(relativeFilePath) : selectedVaultDir;
        await loadVaultDirectory(currentDir);
        scheduleVaultIndexRefresh(vaultRoot);
      }

      return imported;
    } catch (error) {
      console.error("Failed to import image", error);
      setSaveError(t.errors.imageImportFailed);
      setSaveStatus("error");
      setToastMessage(`${t.errors.imageImportFailed}: ${readableError(error)}`);
      throw error;
    }
  }, [
    activeNote.filePath,
    loadVaultDirectory,
    scheduleVaultIndexRefresh,
    setSaveError,
    setSaveStatus,
    t.errors.saveBeforeImageImport,
    t.errors.imageImportFailed,
    vaultRoot,
    selectedVaultDir,
    imageAttachmentFolder,
    imagePathStyle,
  ]);

  const importImagePathForEditor = useCallback(async (sourcePath: string) => {
    try {
      if (!activeNote.filePath) {
        throw new Error(t.errors.saveBeforeImageImport);
      }
      const currentFilePath = activeNote.filePath;

      const asset = await importEditorAssetFromPath(vaultRoot, currentFilePath, sourcePath, imageAttachmentFolder);
      if (vaultRoot) {
        const relativeFilePath = relativePathFromRoot(vaultRoot, currentFilePath);
        const currentDir = relativeFilePath ? parentVaultDir(relativeFilePath) : selectedVaultDir;
        await loadVaultDirectory(currentDir);
        scheduleVaultIndexRefresh(vaultRoot);
      }
      return {
        src: imagePathStyle === "absolute" ? asset.path : asset.relativeMarkdownPath,
        alt: stripExtension(asset.fileName || pathFileName(sourcePath) || "image"),
      };
    } catch (error) {
      console.error("Failed to import selected image", error);
      setSaveError(t.errors.imageImportFailed);
      setSaveStatus("error");
      setToastMessage(`${t.errors.imageImportFailed}: ${readableError(error)}`);
      throw error;
    }
  }, [
    activeNote.filePath,
    loadVaultDirectory,
    scheduleVaultIndexRefresh,
    selectedVaultDir,
    setSaveError,
    setSaveStatus,
    t.errors.imageImportFailed,
    t.errors.saveBeforeImageImport,
    vaultRoot,
    imageAttachmentFolder,
    imagePathStyle,
  ]);

  const buildExportImageMap = useCallback(async () => {
    const sources = collectLocalImageSources(deferredActiveMarkdown);
    if (!sources.length) return {};
    if (!activeNote.filePath) {
      throw new Error(t.errors.saveBeforeExportImages);
    }

    const entries = await Promise.all(sources.map(async (source) => {
      try {
        const asset = await readLocalAssetDataUrl(vaultRoot, activeNote.filePath!, source);
        return [source, asset.dataUrl] as const;
      } catch (error) {
        throw new Error(`${t.errors.exportImageMissing}: ${source} (${readableError(error)})`);
      }
    }));
    return Object.fromEntries(entries);
  }, [activeNote.filePath, activeNote.markdown, t.errors.exportImageMissing, t.errors.saveBeforeExportImages, vaultRoot]);

  const handleExport = useCallback(async () => {
    if (!activeNote) return;

    try {
      const selectedFormat = await showChoiceDialog(t.prompts.exportFormat, [
        { value: "html", label: t.prompts.exportHtml, description: t.prompts.exportHtmlHint },
        { value: "pdf", label: t.prompts.exportPdf, description: t.prompts.exportPdfHint },
        { value: "docx", label: t.prompts.exportDocx, description: t.prompts.exportDocxHint },
      ], t.prompts.exportFormatHint);
      if (!selectedFormat) return;

      const format: ExportFormat | null = selectedFormat === "pdf"
        ? "pdf"
        : selectedFormat === "html"
          ? "html"
          : selectedFormat === "docx"
            ? "docx"
            : null;
      if (!format) {
        setToastMessage(t.errors.exportFormatUnsupported);
        return;
      }

      const fallbackBase = activeNote.fileName ? stripExtension(activeNote.fileName) : activeNote.title || "Serein Export";
      const selected = await save({
        defaultPath: `${fallbackBase}.${format}`,
        filters: format === "html"
          ? [{ name: "HTML", extensions: ["html"] }]
          : format === "pdf"
            ? [{ name: "PDF", extensions: ["pdf"] }]
            : [{ name: "Word", extensions: ["docx"] }],
      });
      if (!selected) return;

      const imageMap = await buildExportImageMap();
      const mermaidBlocks = format === "docx"
        ? []
        : await renderMarkdownMermaidBlocks(
          activeNote.markdown,
          mermaidPaletteFromElement(appShellRef.current),
        );
      const title = extractFirstLineTitle(activeNote.markdown) ?? (stripExtension(activeNote.fileName ?? "") || activeNote.title);
      const bytes = format === "html"
        ? utf8Bytes(htmlDocument(activeNote.markdown, { title, imageMap, mermaidBlocks }))
        : format === "pdf"
          ? await markdownToPdfBytes(activeNote.markdown, { title, imageMap, mermaidBlocks })
          : await markdownToDocxBytes(activeNote.markdown, { title, imageMap });
      await writeExportFile(ensureExportExtension(selected, format), format, bytes);
      setSaveError(null);
      setToastMessage(t.status.exported(format.toUpperCase()));
    } catch (error) {
      console.error("Failed to export file", error);
      setSaveError(t.errors.exportFailed);
      setSaveStatus("error");
      setToastMessage(`${t.errors.exportFailed}: ${readableError(error)}`);
    }
  }, [activeNote, buildExportImageMap, showChoiceDialog, t, setSaveError, setSaveStatus]);

  const createVaultNoteFromDefaultName = useCallback(async () => {
    if (!vaultRoot) return;

    const baseName = normalizeDefaultNewNoteName(defaultNewNoteName);

    for (let index = 0; index < 100; index += 1) {
      const fileName = vaultFileNameCandidate(baseName, defaultSaveExt, index);
      const relativePath = joinVaultPath(selectedVaultDir, fileName);

      try {
        const path = await createVaultEntry(vaultRoot, relativePath, "file");
        const title = stripExtension(fileName).trim() || t.sidebar.markdownNote;
        const file = await writeMarkdownFile(path, `# ${title}\n\n`);
        await loadVaultDirectory(selectedVaultDir);
        await refreshVaultIndex(vaultRoot);
        applyOpenedFile(file);
        return;
      } catch (error) {
        if (String(error).includes("already exists")) continue;
        throw error;
      }
    }

    throw new Error(t.errors.tooManyDefaultNames);
  }, [
    defaultNewNoteName,
    defaultSaveExt,
    applyOpenedFile,
    loadVaultDirectory,
    refreshVaultIndex,
    selectedVaultDir,
    t.errors.tooManyDefaultNames,
    t.sidebar.markdownNote,
    vaultRoot,
  ]);

  const handleCreateNote = useCallback(async () => {
    if (vaultRoot) {
      if (!await confirmDiscardUnsavedChanges()) return;
      createVaultNoteFromDefaultName()
        .catch((error) => {
          console.error("Failed to create vault file", error);
          setVaultError(t.errors.createFileFailed);
        });
      return;
    }

    const note = createDraftNote(defaultNewNoteName, defaultSaveExt);
    setNotes((currentNotes) => [note, ...currentNotes]);
    setActiveNoteId(note.id);
  }, [confirmDiscardUnsavedChanges, createVaultNoteFromDefaultName, defaultNewNoteName, defaultSaveExt, t.errors.createFileFailed, vaultRoot]);

  const handleCreateVaultFolder = useCallback(async () => {
    if (!vaultRoot) return;

    const input = await showInputDialog(t.prompts.newFolderName, t.prompts.defaultNewFolderName);
    if (!input) return;

    const relativePath = joinVaultPath(selectedVaultDir, input);
    createVaultEntry(vaultRoot, relativePath, "directory")
      .then(async () => {
        await loadVaultDirectory(selectedVaultDir);
        await refreshVaultIndex(vaultRoot);
      })
      .catch((error) => {
        console.error("Failed to create vault folder", error);
        setVaultError(t.errors.createFolderFailed);
      });
  }, [
    loadVaultDirectory,
    refreshVaultIndex,
    selectedVaultDir,
    showInputDialog,
    t.errors.createFolderFailed,
    t.prompts.defaultNewFolderName,
    t.prompts.newFolderName,
    vaultRoot,
  ]);

  const handleRenameVaultEntry = useCallback(async (entry: VaultTreeEntry) => {
    if (!vaultRoot || !entry.relativePath) return;

    const nextName = await showInputDialog(t.prompts.rename, entry.name);
    if (!nextName || nextName === entry.name) return;

    const oldEntryPath = normalizeFilePath(entry.path);
    const renamedDirtyNote = notes.find((note) => (
      note.dirty
      && note.filePath
      && normalizeFilePath(note.filePath) === oldEntryPath
    ));
    if (renamedDirtyNote) {
      await showMessageDialog(t.prompts.unsavedChangesTitle, t.errors.saveBeforeRename);
      return;
    }

    const nextRelativePath = joinVaultPath(parentVaultDir(entry.relativePath), nextName.trim());
    const indexBeforeRename = vaultIndex;
    const linkRewritePlan = entry.kind === "file" && indexBeforeRename
      ? planVaultLinkRewrite(indexBeforeRename, entry.path, nextRelativePath)
      : null;
    let shouldUpdateLinks = false;

    if (linkRewritePlan?.replacementCount) {
      const previewFiles = linkRewritePlan.sources
        .slice(0, 3)
        .map((source) => source.sourceRelativePath)
        .join(", ");
      const filesPreview = linkRewritePlan.sources.length > 3 ? `${previewFiles}, ...` : previewFiles;
      const choice = await showChoiceDialog(t.prompts.updateLinksTitle, [
        { value: "update", label: t.prompts.updateLinksAction, description: t.prompts.updateLinksHint },
        { value: "renameOnly", label: t.prompts.renameOnlyAction, description: t.prompts.renameOnlyHint },
      ], t.prompts.updateLinksMessage(linkRewritePlan.replacementCount, linkRewritePlan.sources.length, filesPreview));
      if (!choice) return;
      shouldUpdateLinks = choice === "update";

      if (shouldUpdateLinks) {
        const affectedPaths = new Set(linkRewritePlan.sources.map((source) => normalizeFilePath(source.sourcePath)));
        const dirtyAffectedNote = notes.find((note) => (
          note.dirty
          && note.filePath
          && affectedPaths.has(normalizeFilePath(note.filePath))
        ));
        if (dirtyAffectedNote) {
          await showMessageDialog(t.prompts.unsavedChangesTitle, t.errors.saveBeforeLinkUpdate);
          return;
        }
      }
    }

    let nextPath: string;
    try {
      nextPath = await renameVaultEntry(vaultRoot, entry.relativePath, nextName);
    } catch (error) {
      console.error("Failed to rename vault entry", error);
      setVaultError(t.errors.renameFailed);
      return;
    }

    let updatedLinkCount = 0;
    let linkUpdateError: unknown = null;
    const updatedFiles: Awaited<ReturnType<typeof readMarkdownFile>>[] = [];

    if (shouldUpdateLinks && linkRewritePlan && indexBeforeRename) {
      try {
        for (const source of linkRewritePlan.sources) {
          const renamedSource = normalizeFilePath(source.sourcePath) === oldEntryPath;
          const sourcePath = renamedSource ? nextPath : source.sourcePath;
          const sourceRelativePath = renamedSource ? linkRewritePlan.newRelativePath : source.sourceRelativePath;
          const file = await readMarkdownFile(sourcePath);
          const rewrite = rewriteVaultLinksInMarkdown(
            indexBeforeRename,
            sourceRelativePath,
            file.content,
            linkRewritePlan.oldPath,
            linkRewritePlan.newRelativePath,
          );
          if (!rewrite.replacements.length || rewrite.content === file.content) continue;

          const updatedFile = await writeMarkdownFile(sourcePath, rewrite.content, file.modifiedAtMs, file.size);
          updatedFiles.push(updatedFile);
          updatedLinkCount += rewrite.replacements.length;
        }
      } catch (error) {
        console.error("Failed to update renamed note links", error);
        linkUpdateError = error;
      }
    }

    if (updatedFiles.length) {
      const updatedFilesByPath = new Map(updatedFiles.map((file) => [normalizeFilePath(file.path), file]));
      setNotes((currentNotes) => currentNotes.map((note) => {
        if (!note.filePath || note.dirty) return note;
        const updatedFile = updatedFilesByPath.get(normalizeFilePath(note.filePath));
        if (!updatedFile) return note;
        const nextNote = createFileNote(updatedFile);
        return {
          ...nextNote,
          id: note.id,
          createdAt: note.createdAt,
        };
      }));
    }

    try {
      deleteVaultIndexOverrides(vaultIndexFileOverridesRef.current, vaultRoot, entry.path);
      vaultTagSearchCacheRef.current.clear();
      vaultTagSearchPendingRef.current.clear();
      await loadVaultDirectory(parentVaultDir(entry.relativePath));
      await refreshVaultIndex(vaultRoot);
      if (activeNote.filePath && normalizeFilePath(activeNote.filePath) === oldEntryPath) {
        await openMarkdownFile(nextPath, { skipUnsavedCheck: true });
      }
    } catch (error) {
      console.error("Failed to refresh renamed vault entry", error);
      setVaultError(t.errors.renameFailed);
      return;
    }

    if (linkUpdateError) {
      setVaultError(t.errors.linkUpdateFailed);
      setToastMessage(`${t.errors.linkUpdateFailed}: ${readableError(linkUpdateError)}`);
      return;
    }

    setVaultError(null);
    if (updatedLinkCount > 0) {
      setToastMessage(t.status.linksUpdated(updatedLinkCount));
    }
  }, [
    activeNote.filePath,
    loadVaultDirectory,
    notes,
    openMarkdownFile,
    refreshVaultIndex,
    setNotes,
    showChoiceDialog,
    showInputDialog,
    showMessageDialog,
    t.errors.linkUpdateFailed,
    t.errors.renameFailed,
    t.errors.saveBeforeLinkUpdate,
    t.errors.saveBeforeRename,
    t.prompts.rename,
    t.prompts.renameOnlyAction,
    t.prompts.renameOnlyHint,
    t.prompts.unsavedChangesTitle,
    t.prompts.updateLinksAction,
    t.prompts.updateLinksHint,
    t.prompts.updateLinksMessage,
    t.prompts.updateLinksTitle,
    t.status.linksUpdated,
    vaultIndex,
    vaultRoot,
  ]);

  const handleDeleteVaultEntry = useCallback(async (entry: VaultTreeEntry) => {
    if (!vaultRoot || !entry.relativePath) return;
    const confirmed = await showConfirmDialog(t.prompts.deleteAction, t.prompts.deleteEntry(entry.name), true);
    if (!confirmed) return;

    deleteVaultEntry(vaultRoot, entry.relativePath)
      .then(async () => {
        deleteVaultIndexOverrides(vaultIndexFileOverridesRef.current, vaultRoot, entry.path);
        vaultTagSearchCacheRef.current.clear();
        vaultTagSearchPendingRef.current.clear();
        await loadVaultDirectory(parentVaultDir(entry.relativePath));
        await refreshVaultIndex(vaultRoot);
        if (isSameOrChildPath(activeNote.filePath, entry.path)) {
          const emptyNote = createEmptyNote();
          setNotes([emptyNote]);
          setActiveNoteId(emptyNote.id);
          setLastOpenedFile(null);
          persistVaultPatch({ lastOpenedFile: null });
        }
      })
      .catch((error) => {
        console.error("Failed to delete vault entry", error);
        setVaultError(t.errors.deleteFailed);
      });
  }, [activeNote.filePath, loadVaultDirectory, persistVaultPatch, refreshVaultIndex, showConfirmDialog, t.errors.deleteFailed, t.prompts, vaultRoot]);

  const runEditorCommand = useCallback((action: EditorCommandAction, payload?: string, alt?: string) => {
    if (!activeNote) return;

    editorCommandIdRef.current += 1;
    setEditorCommand({ id: editorCommandIdRef.current, action, payload, alt });
  }, [activeNote, setEditorCommand]);

  const nativeTextControlForEditCommand = useCallback(() => {
    const activeControl = nativeTextControlFromTarget(document.activeElement);
    if (canUseNativeTextControl(activeControl) && !isEditorTextControlTarget(activeControl)) return activeControl;
    if (openMenuId || contextMenu) {
      const lastControl = lastFocusedNativeTextControlRef.current;
      if (canUseNativeTextControl(lastControl)) return lastControl;
    }
    return null;
  }, [contextMenu, openMenuId]);

  const runEditCommand = useCallback((command: "cut" | "copy" | "paste" | "undo" | "redo") => {
    const nativeControl = nativeTextControlForEditCommand();
    if (nativeControl && runNativeTextEditCommand(nativeControl, command)) return;

    runEditorCommand(command);
  }, [nativeTextControlForEditCommand, runEditorCommand]);

  const runLinkCommand = useCallback(async () => {
    const href = await showInputDialog(t.prompts.linkUrl, "https://");
    if (!href) return;
    runEditorCommand("link", href);
  }, [runEditorCommand, showInputDialog, t.prompts.linkUrl]);

  const runImageCommand = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: imageFileFilters,
      });
      const sourcePath = Array.isArray(selected) ? selected[0] : selected;
      if (!sourcePath) return;

      const image = await importImagePathForEditor(sourcePath);
      runEditorCommand("image", image.src, image.alt);
    } catch (error) {
      console.error("Failed to insert image", error);
    }
  }, [importImagePathForEditor, runEditorCommand]);

  const selectedTextForSearch = useCallback(() => {
    const activeControl = nativeTextControlFromTarget(document.activeElement);
    if (activeControl) {
      const { start, end } = textControlSelection(activeControl);
      if (start !== end) return normalizeSearchSeedText(activeControl.value.slice(start, end));
    }

    const selection = window.getSelection();
    if (selectionIsInsideElement(selection, editorSurfaceRef.current)) {
      return normalizeSearchSeedText(selection?.toString());
    }

    return "";
  }, []);

  const openSidebarSearch = useCallback((seedText = "") => {
    setSidebarSearchSeed(normalizeSearchSeedText(seedText));
    setSidebarVisible(true);
    setLeftPanelTab("search");
    setSidebarSearchFocusSignal((signal) => signal + 1);
  }, [setLeftPanelTab, setSidebarVisible]);

  const openQuickOpen = useCallback(() => {
    setPaletteMode("quickOpen");
  }, []);

  const openQuickNote = useCallback(() => {
    if (!isTauriRuntime()) {
      setToastMessage(t.status.quickNoteDesktopOnly);
      return;
    }

    openQuickNoteWindow(quickNoteShowInTaskbar, readQuickNoteInitialSurface())
      .catch((error) => {
        console.warn("Failed to open quick note window", error);
        setToastMessage(`${t.status.quickNoteOpenFailed}: ${readableError(error)}`);
      });
  }, [quickNoteShowInTaskbar, t.status.quickNoteDesktopOnly, t.status.quickNoteOpenFailed]);

  const requestVaultIndexForSearch = useCallback(() => {
    ensureVaultIndexForSearch({ force: true });
  }, [ensureVaultIndexForSearch]);

  const searchVaultTagsForQuery = useCallback(async (query: string): Promise<VaultSearchResult[]> => {
    if (!tagFeaturesEnabled || !vaultRoot) return [];
    const cleanQuery = query.trim();
    const cleanTagQuery = cleanQuery.startsWith("@") ? cleanQuery.slice(1).trim() : "";
    if (cleanTagQuery.length < 2) return [];

    const cacheKey = `${normalizeFilePath(vaultRoot)}\n${cleanTagQuery.toLocaleLowerCase()}`;
    const cached = vaultTagSearchCacheRef.current.get(cacheKey);
    if (cached) return cached;

    const pending = vaultTagSearchPendingRef.current.get(cacheKey);
    if (pending) return pending;

    const searchPromise = (async () => {
      const response = await searchVaultTagFiles(vaultRoot, cleanTagQuery, 60);
      const tagIndex = await buildVaultIndexAsync(vaultRoot, response);
      const results = searchVaultIndex(tagIndex, `@${cleanTagQuery}`, { limit: 60 });
      vaultTagSearchCacheRef.current.set(cacheKey, results);
      return results;
    })();

    vaultTagSearchPendingRef.current.set(cacheKey, searchPromise);
    try {
      return await searchPromise;
    } finally {
      if (vaultTagSearchPendingRef.current.get(cacheKey) === searchPromise) {
        vaultTagSearchPendingRef.current.delete(cacheKey);
      }
    }
  }, [tagFeaturesEnabled, vaultRoot]);

  const handleFind = useCallback(() => {
    openSidebarSearch(selectedTextForSearch());
  }, [openSidebarSearch, selectedTextForSearch]);

  const handleFindNavigation = useCallback((direction: 1 | -1) => {
    if (!sidebarVisible || leftPanelTab !== "search") {
      handleFind();
      return;
    }

    setSidebarSearchNavigation((current) => ({ signal: current.signal + 1, direction }));
  }, [handleFind, leftPanelTab, sidebarVisible]);

  const focusActiveEditor = useCallback(() => {
    const editor = editorSurfaceRef.current?.querySelector<HTMLElement>(".cm-content");
    if (editor) {
      editor.focus();
      return;
    }

    editorSurfaceRef.current?.focus();
  }, []);

  const handleSelectAll = useCallback(() => {
    const control = nativeTextControlForEditCommand();
    if (canUseNativeTextControl(control)) {
      runNativeTextEditCommand(control, "selectAll");
      return;
    }
    runEditorCommand("selectAllSmart");
  }, [nativeTextControlForEditCommand, runEditorCommand]);

  const commands = useMemo<Record<string, CommandDefinition>>(() => ({
    "file.new": { id: "file.new", label: t.commandLabels["file.new"], enabled: true, run: handleCreateNote },
    "file.newFolder": { id: "file.newFolder", label: t.commandLabels["file.newFolder"], enabled: Boolean(vaultRoot), run: handleCreateVaultFolder },
    "file.open": { id: "file.open", label: t.commandLabels["file.open"], enabled: true, run: handleOpenFile },
    "file.openVault": { id: "file.openVault", label: t.commandLabels["file.openVault"], enabled: true, run: handleOpenVault },
    "file.save": { id: "file.save", label: t.commandLabels["file.save"], enabled: hasActiveDocument, run: scheduleBackgroundSave },
    "file.saveAs": { id: "file.saveAs", label: t.commandLabels["file.saveAs"], enabled: hasActiveDocument, run: () => { void handleSaveAs(); } },
    "file.export": { id: "file.export", label: t.commandLabels["file.export"], enabled: hasActiveDocument, run: handleExport },
    "app.openQuickOpen": {
      id: "app.openQuickOpen",
      label: t.commandLabels["app.openQuickOpen"],
      enabled: Boolean(vaultRoot),
      run: openQuickOpen,
    },
    "app.openQuickNote": {
      id: "app.openQuickNote",
      label: t.commandLabels["app.openQuickNote"],
      enabled: true,
      run: openQuickNote,
    },
    "app.openCommandPalette": {
      id: "app.openCommandPalette",
      label: t.commandLabels["app.openCommandPalette"],
      enabled: true,
      run: () => setPaletteMode("command"),
    },
    "app.openSettings": {
      id: "app.openSettings",
      label: t.commandLabels["app.openSettings"],
      enabled: true,
      run: () => {
        setSettingsSection("general");
        setSettingsOpen(true);
      },
    },
    "app.revealWindow": {
      id: "app.revealWindow",
      label: t.commandLabels["app.revealWindow"],
      enabled: true,
      run: () => {
        revealWindow().catch((error) => {
          console.warn("Failed to reveal window", error);
        });
      },
    },
    "app.openShortcuts": {
      id: "app.openShortcuts",
      label: t.commandLabels["app.openShortcuts"],
      enabled: true,
      run: () => {
        setSettingsSection("shortcuts");
        setSettingsOpen(true);
      },
    },
    "app.openVaultQuickstart": {
      id: "app.openVaultQuickstart",
      label: t.commandLabels["app.openVaultQuickstart"],
      enabled: true,
      run: () => setVaultQuickstartOpen(true),
    },
    "app.about": { id: "app.about", label: t.commandLabels["app.about"], enabled: true, run: () => showMessageDialog(t.commandLabels["app.about"], t.prompts.about) },
    "edit.cut": { id: "edit.cut", label: t.commandLabels["edit.cut"], enabled: true, run: () => runEditCommand("cut") },
    "edit.copy": { id: "edit.copy", label: t.commandLabels["edit.copy"], enabled: true, run: () => runEditCommand("copy") },
    "edit.paste": { id: "edit.paste", label: t.commandLabels["edit.paste"], enabled: true, run: () => runEditCommand("paste") },
    "edit.undo": { id: "edit.undo", label: t.commandLabels["edit.undo"], enabled: true, run: () => runEditCommand("undo") },
    "edit.redo": { id: "edit.redo", label: t.commandLabels["edit.redo"], enabled: true, run: () => runEditCommand("redo") },
    "edit.selectAll": { id: "edit.selectAll", label: t.commandLabels["edit.selectAll"], enabled: true, run: handleSelectAll },
    "edit.find": { id: "edit.find", label: t.commandLabels["edit.find"], enabled: true, run: handleFind },
    "paragraph.text": { id: "paragraph.text", label: t.commandLabels["paragraph.text"], enabled: hasActiveDocument, run: () => runEditorCommand("paragraph") },
    "paragraph.heading1": { id: "paragraph.heading1", label: t.commandLabels["paragraph.heading1"], enabled: hasActiveDocument, run: () => runEditorCommand("heading1") },
    "paragraph.heading2": { id: "paragraph.heading2", label: t.commandLabels["paragraph.heading2"], enabled: hasActiveDocument, run: () => runEditorCommand("heading2") },
    "paragraph.heading3": { id: "paragraph.heading3", label: t.commandLabels["paragraph.heading3"], enabled: hasActiveDocument, run: () => runEditorCommand("heading3") },
    "paragraph.blockquote": { id: "paragraph.blockquote", label: t.commandLabels["paragraph.blockquote"], enabled: hasActiveDocument, run: () => runEditorCommand("blockquote") },
    "paragraph.bulletList": { id: "paragraph.bulletList", label: t.commandLabels["paragraph.bulletList"], enabled: hasActiveDocument, run: () => runEditorCommand("bulletList") },
    "paragraph.orderedList": { id: "paragraph.orderedList", label: t.commandLabels["paragraph.orderedList"], enabled: hasActiveDocument, run: () => runEditorCommand("orderedList") },
    "paragraph.codeBlock": { id: "paragraph.codeBlock", label: t.commandLabels["paragraph.codeBlock"], enabled: hasActiveDocument, run: () => runEditorCommand("codeBlock") },
    "paragraph.table": { id: "paragraph.table", label: t.commandLabels["paragraph.table"], enabled: hasActiveDocument, run: () => runEditorCommand("table") },
    "format.bold": { id: "format.bold", label: t.commandLabels["format.bold"], enabled: hasActiveDocument, run: () => runEditorCommand("bold") },
    "format.italic": { id: "format.italic", label: t.commandLabels["format.italic"], enabled: hasActiveDocument, run: () => runEditorCommand("italic") },
    "format.inlineCode": { id: "format.inlineCode", label: t.commandLabels["format.inlineCode"], enabled: hasActiveDocument, run: () => runEditorCommand("inlineCode") },
    "format.strike": { id: "format.strike", label: t.commandLabels["format.strike"], enabled: hasActiveDocument, run: () => runEditorCommand("strike") },
    "format.link": { id: "format.link", label: t.commandLabels["format.link"], enabled: hasActiveDocument, run: runLinkCommand },
    "format.image": { id: "format.image", label: t.commandLabels["format.image"], enabled: hasActiveDocument, run: runImageCommand },
    "view.setPlainEdit": { id: "view.setPlainEdit", label: t.commandLabels["view.setPlainEdit"], enabled: documentViewMode !== "plain", run: () => setDocumentViewMode("plain") },
    "view.setRichEdit": { id: "view.setRichEdit", label: t.commandLabels["view.setRichEdit"], enabled: documentViewMode !== "rich", run: () => setDocumentViewMode("rich") },
    "view.toggleSidebar": { id: "view.toggleSidebar", label: t.commandLabels["view.toggleSidebar"], enabled: true, run: () => setSidebarVisible((visible) => !visible) },
    "view.toggleRightPanel": { id: "view.toggleRightPanel", label: t.commandLabels["view.toggleRightPanel"], enabled: true, run: () => setRightPanelVisible((visible) => !visible) },
    "theme.mint": { id: "theme.mint", label: t.commandLabels["theme.mint"], enabled: theme !== "mint", run: () => setTheme("mint") },
    "theme.moss": { id: "theme.moss", label: t.commandLabels["theme.moss"], enabled: theme !== "moss", run: () => setTheme("moss") },
    "theme.eye": { id: "theme.eye", label: t.commandLabels["theme.eye"], enabled: theme !== "eye", run: () => setTheme("eye") },
    "theme.v5": { id: "theme.v5", label: t.commandLabels["theme.v5"], enabled: theme !== "v5", run: () => setTheme("v5") },
    "theme.ink": { id: "theme.ink", label: t.commandLabels["theme.ink"], enabled: theme !== "ink", run: () => setTheme("ink") },
    "theme.daily": { id: "theme.daily", label: t.commandLabels["theme.daily"], enabled: theme !== "daily", run: () => setTheme("daily") },
  }), [
    activeNote,
    documentViewMode,
    editorMode,
    hasActiveDocument,
    handleCreateVaultFolder,
    handleCreateNote,
    handleFind,
    handleExport,
    handleOpenFile,
    handleOpenVault,
    handleSaveAs,
    openQuickOpen,
    openQuickNote,
    runEditorCommand,
    runEditCommand,
    handleSelectAll,
    runImageCommand,
    runLinkCommand,
    setDocumentViewMode,
    scheduleBackgroundSave,
    showMessageDialog,
    t,
    theme,
    vaultIndex,
    vaultRoot,
  ]);

  useEffect(() => {
    if (!vaultQuickstartOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setVaultQuickstartOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [vaultQuickstartOpen]);

  const dispatchCommand = useCallback(async (commandId: string) => {
    const command = commands[commandId];
    if (!command?.enabled) return;
    await command.run();
    setOpenMenuId(null);
  }, [commands]);

  const commandMenuItem = useCallback((
    commandId: string,
    icon: ContextMenuIcon,
    options: Partial<Pick<AppContextMenuItem, "separatorBefore" | "danger">> = {},
  ): AppContextMenuItem => {
    const command = commands[commandId];
    return {
      id: commandId,
      label: command?.label ?? commandId,
      shortcut: getShortcutForCommand(shortcuts, commandId),
      icon,
      disabled: !command?.enabled,
      onSelect: () => {
        void dispatchCommand(commandId);
      },
      ...options,
    };
  }, [commands, dispatchCommand, shortcuts]);

  const openShellContextMenu = useCallback((event: { clientX: number; clientY: number; target: EventTarget | null }) => {
    setOpenMenuId(null);
    const target = shellContextMenuTarget(event.target);
    if (!target) {
      setContextMenu(null);
      return;
    }

    setContextMenu({
      ...contextMenuPosition(event),
      target,
    });
  }, [setOpenMenuId]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleShellContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (event.defaultPrevented) return;
    event.preventDefault();
    openShellContextMenu(event);
  }, [openShellContextMenu]);

  const handleVaultEntryContextMenu = useCallback((entry: VaultTreeEntry, event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setOpenMenuId(null);
    setContextMenu({
      ...contextMenuPosition(event),
      target: entry.kind === "directory" ? "directory" : "file",
      entry,
    });
  }, [setOpenMenuId]);

  const handleActiveFileContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (!activeNote.filePath) return;
    event.preventDefault();
    event.stopPropagation();
    setOpenMenuId(null);
    setContextMenu({
      ...contextMenuPosition(event),
      target: "document",
      filePath: activeNote.filePath,
    });
  }, [activeNote.filePath, setOpenMenuId]);

  useEffect(() => {
    if (checkedInitialOpenFileRef.current) return;
    checkedInitialOpenFileRef.current = true;

    const tauriWindow = window as Window & { __TAURI_INTERNALS__?: unknown };
    if (!tauriWindow.__TAURI_INTERNALS__) {
      setInitialOpenFileChecked(true);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const initialFile = await readInitialOpenFile();
        if (cancelled || !initialFile) return;

        restoredVaultRef.current = true;
        restoredStandaloneFileRef.current = true;
        vaultIndexRefreshIdRef.current += 1;
        vaultIndexFileOverridesRef.current.clear();
        vaultTagSearchCacheRef.current.clear();
        vaultTagSearchPendingRef.current.clear();
        setVaultRoot(null);
        setVaultTree(null);
        setVaultError(null);
        setVaultIndex(null);
        setVaultIndexStatus("idle");
        setVaultIndexError(null);
        setVaultRecoveryBlocked(false);
        setSelectedVaultDir("");
        setExpandedDirs(new Set([""]));
        setDemoVaultMode(false);
        setCenterGraphOpen(false);
        setCenterView("markdown");

        await openMarkdownFile(initialFile, { skipUnsavedCheck: true, standalone: true });
      } catch (error) {
        console.error("Failed to open startup file", error);
        if (!cancelled) {
          setSaveError(t.errors.openFileFailed);
          setSaveStatus("error");
        }
      } finally {
        if (!cancelled) setInitialOpenFileChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    openMarkdownFile,
    setExpandedDirs,
    setSaveError,
    setSaveStatus,
    setSelectedVaultDir,
    setVaultError,
    setVaultIndex,
    setVaultIndexError,
    setVaultIndexStatus,
    setVaultRecoveryBlocked,
    setVaultRoot,
    setVaultTree,
    t.errors.openFileFailed,
  ]);


  useEffect(() => {
    if (!initialOpenFileChecked || restoredVaultRef.current || !vaultRoot) return;
    restoredVaultRef.current = true;

    if (vaultRecoveryBlocked) {
      setVaultError(t.errors.recoveryPaused);
      setVaultTree({
        name: pathFileName(vaultRoot),
        path: vaultRoot,
        relativePath: "",
        kind: "directory",
        fileExt: null,
        children: [],
        loaded: false,
        loading: false,
        hasMore: false,
        truncated: false,
        loadError: t.errors.recoveryPausedLabel,
      });
      return;
    }

    activateVault(vaultRoot).catch((error) => {
      console.error("Failed to restore vault", error);
      setVaultError(t.errors.restoreVaultFailed);
      setVaultRecoveryBlocked(true);
    });
  }, [activateVault, initialOpenFileChecked, t.errors.recoveryPaused, t.errors.recoveryPausedLabel, t.errors.restoreVaultFailed, vaultRecoveryBlocked, vaultRoot]);

  const settingsToPersist = useMemo<AppSettings>(() => ({
      editorModePreferenceVersion: defaultSettings.editorModePreferenceVersion,
      theme,
      language,
      uiDensity,
      sidebarWidth,
      sidebarVisible,
      rightPanelVisible,
      rightPanelWidth,
      vaultRoot,
      lastOpenedFile: null,
      selectedVaultDir,
      vaultRecoveryBlocked,
      defaultEditorMode: defaultEditorModeSetting,
      restoreWorkspace,
      restoreWindowState,
      windowState,
      editorLatinFont: normalizeEditorFontFamily(editorLatinFont, defaultSettings.editorLatinFont),
      editorCjkFont: normalizeEditorFontFamily(editorCjkFont, defaultSettings.editorCjkFont),
      editorFontSize,
      editorLineHeight,
      editorTabSize,
      editorLeftGap,
      uiScale,
      zoomWithWheel,
      showEditorStatusOverlay,
      tagFeaturesEnabled,
      showFrontmatterTagRow,
      defaultSaveExt,
      quickNoteSaveExt,
      quickNoteShowInTaskbar,
      closeButtonBehavior,
      defaultNewNoteName: normalizeDefaultNewNoteName(defaultNewNoteName),
      imageAttachmentFolder: normalizeImageAttachmentFolder(imageAttachmentFolder),
      imagePathStyle,
      showImageSourceOnFocus,
      normalizeWindowsImagePaths,
  }), [
    defaultEditorModeSetting,
    defaultNewNoteName,
    defaultSaveExt,
    quickNoteSaveExt,
    quickNoteShowInTaskbar,
    closeButtonBehavior,
    editorCjkFont,
    editorFontSize,
    editorLatinFont,
    editorLeftGap,
    editorLineHeight,
    editorTabSize,
    imageAttachmentFolder,
    imagePathStyle,
    language,
    normalizeWindowsImagePaths,
    restoreWorkspace,
    restoreWindowState,
    rightPanelWidth,
    rightPanelVisible,
    selectedVaultDir,
    tagFeaturesEnabled,
    showFrontmatterTagRow,
    showImageSourceOnFocus,
    showEditorStatusOverlay,
    sidebarVisible,
    sidebarWidth,
    theme,
    uiDensity,
    uiScale,
    vaultRecoveryBlocked,
    vaultRoot,
    windowState,
    zoomWithWheel,
  ]);

  latestSettingsToPersistRef.current = settingsToPersist;

  useEffect(() => {
    const serialized = JSON.stringify(settingsToPersist);
    if (serialized === persistedSettingsJsonRef.current) return undefined;

    const timeout = window.setTimeout(() => {
      writeSettings(settingsToPersist);
      persistedSettingsJsonRef.current = serialized;
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [settingsToPersist]);

  useEffect(() => {
    writeShortcuts(shortcuts);
  }, [shortcuts]);

  useEffect(() => {
    const tauriWindow = window as Window & { __TAURI_INTERNALS__?: unknown };
    if (!tauriWindow.__TAURI_INTERNALS__) return undefined;

    let disposed = false;
    configureGlobalRevealShortcut(globalRevealShortcut).catch((error) => {
      if (!disposed) {
        console.warn("Failed to configure global reveal shortcut", error);
        setToastMessage(t.status.globalShortcutFailed);
      }
    });

    return () => {
      disposed = true;
    };
  }, [globalRevealShortcut, t.status.globalShortcutFailed]);

  useEffect(() => {
    const tauriWindow = window as Window & { __TAURI_INTERNALS__?: unknown };
    if (!tauriWindow.__TAURI_INTERNALS__) return undefined;

    let disposed = false;
    const initialSurface = readQuickNoteInitialSurface();
    configureGlobalQuickNoteShortcut(
      globalQuickNoteShortcut,
      quickNoteShowInTaskbar,
      initialSurface,
    ).catch((error) => {
      if (!disposed) {
        console.warn("Failed to configure global quick note shortcut", error);
        setToastMessage(t.status.globalShortcutFailed);
      }
    });
    return () => {
      disposed = true;
    };
  }, [globalQuickNoteShortcut, quickNoteShowInTaskbar, t.status.globalShortcutFailed]);

  useEffect(() => {
    if (!toastMessage) return undefined;
    const timeout = window.setTimeout(() => setToastMessage(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  useEffect(() => {
    if (demoVaultMode || !activeNote.filePath) return undefined;

    let checking = false;
    let disposed = false;
    const check = () => {
      if (checking || disposed) return;
      checking = true;
      syncActiveNoteFromDisk()
        .catch((error) => console.warn("Failed to sync active file", error))
        .finally(() => {
          checking = false;
        });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") check();
    };

    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const interval = window.setInterval(check, 5000);

    return () => {
      disposed = true;
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(interval);
    };
  }, [activeNote.filePath, demoVaultMode, syncActiveNoteFromDisk]);

  useEffect(() => {
    if (demoVaultMode || !vaultRoot || !vaultTree?.loaded) return undefined;

    const activeRelativePath = activeNote.filePath ? relativePathFromRoot(vaultRoot, activeNote.filePath) : null;
    const directoryToReveal = activeRelativePath !== null
      ? parentVaultDir(activeRelativePath)
      : selectedVaultDir;
    const directories = vaultDirectoryChain(directoryToReveal);
    const revealKey = `${normalizeFilePath(vaultRoot)}|${directoryToReveal}`;
    if (sidebarRevealKeyRef.current === revealKey) return undefined;

    sidebarRevealKeyRef.current = revealKey;
    if (!directories.length) return undefined;

    let disposed = false;
    setExpandedDirs((current) => {
      const next = new Set(current);
      next.add("");
      for (const directory of directories) next.add(directory);
      return next;
    });

    void (async () => {
      for (const directory of directories) {
        if (disposed) return;
        await loadVaultDirectory(directory, vaultRoot);
      }
    })();

    return () => {
      disposed = true;
    };
  }, [activeNote.filePath, demoVaultMode, loadVaultDirectory, selectedVaultDir, vaultRoot, vaultTree?.loaded]);

  useEffect(() => {
    let active = true;
    const sources = collectLocalImageSources(deferredActiveMarkdown);
    if (!activeNote.filePath || !sources.length) {
      if (imagePreviewSignatureRef.current === null) return undefined;
      imagePreviewSignatureRef.current = null;
      setImagePreviewMap({});
      return undefined;
    }

    const cacheBase = `${vaultRoot ?? ""}|${activeNote.filePath}`;
    const previewSignature = `${cacheBase}|${sources.join("\u0000")}`;
    const cachedEntries = sources
      .map((source) => [source, imagePreviewCacheRef.current.get(`${cacheBase}|${source}`)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1]));
    const cachedMap = Object.fromEntries(cachedEntries);
    const missingSources = sources.filter((source) => !imagePreviewCacheRef.current.has(`${cacheBase}|${source}`));

    if (!missingSources.length) {
      if (imagePreviewSignatureRef.current === previewSignature) return undefined;
      imagePreviewSignatureRef.current = previewSignature;
      setImagePreviewMap(cachedMap);
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      void (async () => {
        const entries: Array<readonly [string, string] | null> = [];
        for (const source of missingSources) {
          if (!active) return;
          try {
            const asset = await readLocalAssetDataUrl(vaultRoot, activeNote.filePath!, source);
            imagePreviewCacheRef.current.set(`${cacheBase}|${source}`, asset.dataUrl);
            entries.push([source, asset.dataUrl] as const);
          } catch {
            entries.push(null);
          }
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        }
        if (!active) return;
        imagePreviewSignatureRef.current = previewSignature;
        setImagePreviewMap({
          ...cachedMap,
          ...Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry))),
        });
      })();
    }, 900);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [activeNote.filePath, deferredActiveMarkdown, vaultRoot]);

  useEffect(() => {
    if (!appDialog || appDialog.kind !== "input") return undefined;
    const frame = window.requestAnimationFrame(() => {
      appDialogInputRef.current?.focus();
      appDialogInputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [appDialog]);

  useEffect(() => {
    persistVaultPatch({
      selectedDir: selectedVaultDir,
      expandedDirs: Array.from(expandedDirs),
      lastOpenedFile: null,
      layout: {
        sidebarWidth,
        sidebarVisible,
        rightPanelVisible,
        rightPanelWidth,
        editorLeftGap,
        uiScale,
      },
      centerGraph: {
        open: centerGraphOpen,
        activeView: centerGraphOpen ? centerView : "markdown",
        selectedTag: centerGraphTag,
        isolatedOnly: centerGraphIsolatedOnly,
        showUnresolved: centerGraphShowUnresolved,
      },
    });
  }, [
    centerGraphIsolatedOnly,
    centerGraphOpen,
    centerGraphShowUnresolved,
    centerGraphTag,
    centerView,
    editorLeftGap,
    expandedDirs,
    persistVaultPatch,
    rightPanelWidth,
    rightPanelVisible,
    selectedVaultDir,
    sidebarVisible,
    sidebarWidth,
    uiScale,
  ]);

  useEffect(() => {
    if (!vaultRoot || demoVaultMode) return undefined;

    const timeout = window.setTimeout(() => {
      writeVaultWorkspaceState(vaultRoot, vaultWorkspace)
        .catch((error) => {
          console.error("Failed to write vault workspace state", error);
          setVaultError(t.errors.workspaceSaveFailed);
        });
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [demoVaultMode, t.errors.workspaceSaveFailed, vaultRoot, vaultWorkspace]);

  useEffect(() => {
    if (!zoomWithWheel) return undefined;

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(".editor-surface, .serein-text-buffer-editor, .cm-editor")) return;
      event.preventDefault();
      setEditorFontSize(clampEditorFontSize(editorFontSize + (event.deltaY < 0 ? 1 : -1)));
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, [editorFontSize, setEditorFontSize, zoomWithWheel]);

  useEffect(() => {
    if (saveStatus === "idle") return undefined;

    const timeout = window.setTimeout(() => setSaveStatus("idle"), 1200);
    return () => window.clearTimeout(timeout);
  }, [saveStatus]);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (!openMenuId) return;
      if (menuBarRef.current?.contains(event.target as Node)) return;
      setOpenMenuId(null);
    };

    window.addEventListener("mousedown", handleMouseDown);
    return () => window.removeEventListener("mousedown", handleMouseDown);
  }, [openMenuId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isRecordingShortcutTarget(event.target)) return;

      if (event.key === "Escape") {
        if (contextMenu) {
          closeContextMenu();
          return;
        }
        if (appDialog) {
          closeAppDialog(null);
          return;
        }
        setOpenMenuId(null);
        setSettingsOpen(false);
        return;
      }

      const key = shortcutFromEvent(event);
      if (!key) return;

      const formTarget = isFormTarget(event.target);
      const editorTextControlTarget = isEditorTextControlTarget(event.target);
      const shortcut = shortcuts.find((item) => item.enabled && item.currentKeys.includes(key));
      const isDefaultFindKey = key === "Ctrl+F" || key === "Meta+F";
      const isFindCommand = shortcut?.commandId === "edit.find" || (isDefaultFindKey && !shortcut);
      const webviewAction = webviewShortcutAction(key);

      if (appDialog) {
        if (isFindCommand || webviewAction) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }

      if ((key === "Ctrl+A" || key === "Meta+A") && isEditorTarget(event.target)) return;

      if (isFindCommand) {
        event.preventDefault();
        event.stopPropagation();
        if (!(formTarget && !editorTextControlTarget)) {
          dispatchCommand("edit.find");
        }
        return;
      }

      if (!shortcut && (webviewAction === "find-next" || webviewAction === "find-previous")) {
        event.preventDefault();
        event.stopPropagation();
        if (!(formTarget && !editorTextControlTarget) || isSidebarSearchInputTarget(event.target)) {
          handleFindNavigation(webviewAction === "find-next" ? 1 : -1);
        }
        return;
      }

      if (!shortcut && webviewAction === "block") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (!shortcut) return;

      if (formTarget && !editorTextControlTarget) {
        const nativeEditCommand = nativeEditCommandFromCommandId(shortcut.commandId);
        if (nativeEditCommand) {
          if (isStandardNativeTextShortcut(key, nativeEditCommand)) return;
          const control = nativeTextControlFromTarget(event.target);
          if (canUseNativeTextControl(control) && runNativeTextEditCommand(control, nativeEditCommand)) {
            event.preventDefault();
            event.stopPropagation();
          }
          return;
        }
      }

      if (
        isEditorTarget(event.target)
        && (
          shortcut.commandId === "edit.cut"
          || shortcut.commandId === "edit.copy"
          || shortcut.commandId === "edit.paste"
          || shortcut.commandId === "edit.undo"
          || shortcut.commandId === "edit.redo"
        )
      ) {
        return;
      }

      if (
        formTarget
        && !editorTextControlTarget
        && shortcut.commandId !== "file.save"
        && shortcut.commandId !== "file.saveAs"
        && shortcut.commandId !== "file.export"
        && shortcut.commandId !== "file.open"
        && shortcut.commandId !== "file.openVault"
        && shortcut.commandId !== "file.new"
        && shortcut.commandId !== "app.openSettings"
        && shortcut.commandId !== "app.openQuickOpen"
        && shortcut.commandId !== "app.openQuickNote"
        && shortcut.commandId !== "app.openCommandPalette"
      ) {
        return;
      }

      const command = commands[shortcut.commandId];
      if (!command?.enabled) return;

      if (shortcut.commandId === "app.openQuickNote" && isWindowsTauriRuntime()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      event.preventDefault();
      dispatchCommand(shortcut.commandId);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [appDialog, closeAppDialog, closeContextMenu, commands, contextMenu, dispatchCommand, handleFindNavigation, shortcuts]);

  const handleOutlineClick = useCallback((index: number) => {
    const requested = markdownHeadingTargetAt(outline, index);
    if (!requested) return;
    runEditorCommand("revealHeading", JSON.stringify(requested));
  }, [outline, runEditorCommand]);

  const scrollToHeading = useCallback((heading: string) => {
    const index = findHeadingIndex(activeNote.markdown, heading);
    if (index < 0) return false;

    const sourceTarget = getHeadingOffsets(activeNote.markdown)[index];
    if (!sourceTarget) return false;
    runEditorCommand("revealSourceRange", String(sourceTarget.start), String(sourceTarget.end));
    return true;
  }, [activeNote.markdown, runEditorCommand]);

  const scrollToSourceLocation = useCallback((target: SourceLocationTarget) => {
    const line = sourceLineBounds(activeNote.markdown, target.line);
    if (!line) return false;

    const selectionCandidates = sourceSelectionCandidates(line.text, target.text);
    const lowerLine = line.text.toLocaleLowerCase();
    const selection = selectionCandidates
      .map((candidate) => ({ candidate, index: lowerLine.indexOf(candidate.toLocaleLowerCase()) }))
      .find((candidate) => candidate.index >= 0);
    const selectionStart = selection ? line.start + selection.index : line.start;
    const selectionEnd = selection ? selectionStart + selection.candidate.length : line.end;

    runEditorCommand("revealSourceRange", String(selectionStart), String(selectionEnd));
    return true;
  }, [activeNote.markdown, runEditorCommand]);

  useEffect(() => {
    const heading = pendingHeadingRef.current;
    if (!heading) return undefined;

    let disposed = false;
    let attempts = 0;
    let timeout = 0;

    const tryScroll = () => {
      if (disposed) return;
      if (scrollToHeading(heading)) {
        pendingHeadingRef.current = null;
        return;
      }

      attempts += 1;
      if (attempts >= 12) {
        pendingHeadingRef.current = null;
        setToastMessage(t.status.linkOpenFailed);
        return;
      }

      timeout = window.setTimeout(tryScroll, 100);
    };

    timeout = window.setTimeout(tryScroll, 40);
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
    };
  }, [activeNote.id, activeNote.markdown, scrollToHeading, t.status.linkOpenFailed]);

  useEffect(() => {
    const target = pendingSourceLocation;
    if (!target) return undefined;

    let disposed = false;
    let attempts = 0;
    let timeout = 0;

    const tryScroll = () => {
      if (disposed) return;
      if (scrollToSourceLocation(target)) {
        setPendingSourceLocation(null);
        return;
      }

      attempts += 1;
      if (attempts >= 150) {
        setPendingSourceLocation(null);
        setToastMessage(t.status.linkOpenFailed);
        return;
      }

      timeout = window.setTimeout(tryScroll, 100);
    };

    timeout = window.setTimeout(tryScroll, 40);
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
    };
  }, [activeNote.id, activeNote.markdown, pendingSourceLocation, scrollToSourceLocation, t.status.linkOpenFailed]);

  const handleSourceLocationClick = useCallback((path: string, line: number, text?: string | null) => {
    const file = vaultIndex?.filesByPath.get(normalizeFilePath(path));
    if (!file) return;
    openMarkdownFile(file.path, { targetLine: line, targetText: text }).catch((error) => {
      console.error("Failed to open source location", error);
      setVaultError(t.errors.openGraphNodeFailed);
    });
  }, [openMarkdownFile, t.errors.openGraphNodeFailed, vaultIndex]);

  const handleGraphNodeClick = useCallback((path: string) => {
    const file = vaultIndex?.filesByPath.get(normalizeFilePath(path));
    if (!file) return;
    openMarkdownFile(file.path).catch((error) => {
      console.error("Failed to open graph node", error);
      setVaultError(t.errors.openGraphNodeFailed);
    });
  }, [openMarkdownFile, t.errors.openGraphNodeFailed, vaultIndex]);

  const handleOpenAmbiguousLink = useCallback(async (link: VaultLink) => {
    if (!vaultIndex || link.targetCandidates.length <= 1) return;
    const choices = link.targetCandidates
      .map((path) => vaultIndex.filesByPath.get(normalizeFilePath(path)))
      .filter((file): file is VaultIndexedFile => Boolean(file))
      .map((file) => ({
        value: file.path,
        label: file.title,
        description: file.relativePath,
      }));
    const selected = await showChoiceDialog(link.rawTarget, choices, link.unresolvedReason ?? undefined);
    if (!selected) return;
    openMarkdownFile(selected, { targetHeading: link.targetHeading }).catch((error) => {
      console.error("Failed to open ambiguous link target", error);
      setVaultError(t.errors.openGraphNodeFailed);
    });
  }, [openMarkdownFile, showChoiceDialog, t.errors.openGraphNodeFailed, vaultIndex]);

  const handleCreateUnresolvedLink = useCallback(async (link: VaultLink) => {
    if (!vaultRoot) return;
    const relativePath = suggestedVaultLinkPath(link);
    if (!relativePath) return;

    try {
      const createdPath = await createVaultEntry(vaultRoot, relativePath, "file");
      const title = stripExtension(pathFileName(relativePath)).trim() || "Untitled";
      const file = await writeMarkdownFile(createdPath, `# ${title}\n\n`);
      await loadVaultDirectory(parentVaultDir(relativePath));
      await refreshVaultIndex(vaultRoot);
      applyOpenedFile(file);
    } catch (error) {
      console.error("Failed to create unresolved link target", error);
      setVaultError(t.errors.createFileFailed);
      setToastMessage(`${t.errors.createFileFailed}: ${readableError(error)}`);
    }
  }, [
    applyOpenedFile,
    loadVaultDirectory,
    refreshVaultIndex,
    t.errors.createFileFailed,
    vaultRoot,
  ]);

  const handleCreateWikiLinkTarget = useCallback(async (targetInput: string) => {
    if (!vaultRoot) return null;
    const cleanTarget = stripLinkTargetMeta(targetInput)
      .split("|", 1)[0]
      .trim()
      .replace(/^\/+/, "");
    if (!cleanTarget) return null;

    const sourceFile = findIndexedFile(vaultIndex, activeNote.filePath);
    const sourceDir = sourceFile ? parentVaultDir(sourceFile.relativePath) : selectedVaultDir;
    const relativeBase = cleanTarget.includes("/")
      ? normalizeVaultRelativePath(cleanTarget)
      : joinVaultPath(sourceDir, cleanTarget);
    const relativePath = ensureVaultFileName(relativeBase, defaultSaveExt);
    const returnTarget = cleanTarget.includes("/")
      ? stripExtension(normalizeVaultRelativePath(cleanTarget))
      : stripExtension(pathFileName(cleanTarget));

    try {
      const createdPath = await createVaultEntry(vaultRoot, relativePath, "file");
      const title = stripExtension(pathFileName(relativePath)).trim() || "Untitled";
      await writeMarkdownFile(createdPath, `# ${title}\n\n`);
      await loadVaultDirectory(parentVaultDir(relativePath));
      await refreshVaultIndex(vaultRoot);
      return returnTarget;
    } catch (error) {
      if (String(error).toLowerCase().includes("already exists")) return returnTarget;
      console.error("Failed to create wiki link target", error);
      setVaultError(t.errors.createFileFailed);
      setToastMessage(`${t.errors.createFileFailed}: ${readableError(error)}`);
      return null;
    }
  }, [
    activeNote.filePath,
    defaultSaveExt,
    loadVaultDirectory,
    refreshVaultIndex,
    selectedVaultDir,
    t.errors.createFileFailed,
    vaultIndex,
    vaultRoot,
  ]);

  const showLinkOpenFailedToast = useCallback(() => {
    setToastMessage(t.status.linkOpenFailed);
  }, [t.status.linkOpenFailed]);

  const handleEditorLinkOpen = useCallback((href: string) => {
    const target = normalizeMarkdownHrefTarget(href);
    if (!target) return false;

    if (target.toLowerCase().startsWith("serein-wiki:")) {
      const wikiTarget = target.slice("serein-wiki:".length).trim();
      if (!wikiTarget || !vaultIndex || !activeNote.filePath) {
        showLinkOpenFailedToast();
        return true;
      }

      const resolvedLink = resolveVaultLinkTarget(vaultIndex, activeNote.filePath, "wiki", wikiTarget);
      if (resolvedLink.targetPath) {
        openMarkdownFile(resolvedLink.targetPath, { targetHeading: resolvedLink.targetHeading ?? headingFromLinkTarget(wikiTarget) }).catch((error) => {
          console.error("Failed to open wiki editor link", error);
          showLinkOpenFailedToast();
        });
        return true;
      }
      if (resolvedLink.targetCandidates.length > 1) {
        handleOpenAmbiguousLink(resolvedLink).catch((error) => {
          console.error("Failed to choose wiki editor link target", error);
          showLinkOpenFailedToast();
        });
        return true;
      }

      showLinkOpenFailedToast();
      return true;
    }

    const targetHeading = headingFromLinkTarget(target);

    if (target.startsWith("#")) {
      if (!targetHeading || !scrollToHeading(targetHeading)) {
        showLinkOpenFailedToast();
      }
      return true;
    }

    const targetPath = stripLinkTargetMeta(target);
    if (!targetPath) {
      showLinkOpenFailedToast();
      return true;
    }

    if ((isBrowserHrefTarget(target) || isExternalHrefTarget(target)) && !isFileHrefTarget(target)) {
      openExternalTarget(target).catch((error) => {
        console.error("Failed to open external editor link", error);
        showLinkOpenFailedToast();
      });
      return true;
    }

    if (!activeNote.filePath) {
      showLinkOpenFailedToast();
      return true;
    }

    const cleanLocalTarget = localPathFromHrefTarget(targetPath);
    if (vaultIndex && !isAbsoluteLocalPath(cleanLocalTarget)) {
      const resolvedLink = resolveVaultLinkTarget(vaultIndex, activeNote.filePath, "markdown", target);
      if (resolvedLink.targetPath) {
        openMarkdownFile(resolvedLink.targetPath, { targetHeading: resolvedLink.targetHeading ?? targetHeading }).catch((error) => {
          console.error("Failed to open resolved editor link", error);
          showLinkOpenFailedToast();
        });
        return true;
      }
      if (resolvedLink.targetCandidates.length > 1) {
        handleOpenAmbiguousLink(resolvedLink).catch((error) => {
          console.error("Failed to choose editor link target", error);
          showLinkOpenFailedToast();
        });
        return true;
      }
    }

    const sourceDir = filePathDirectory(activeNote.filePath);
    const absoluteTarget = isAbsoluteLocalPath(cleanLocalTarget)
      ? localPathFromHrefTarget(cleanLocalTarget)
      : joinAbsolutePath(sourceDir, cleanLocalTarget);

    let indexedTarget = null as ReturnType<typeof findIndexedFile> | null;
    if (vaultIndex) {
      const sourceFile = vaultIndex.filesByPath.get(normalizeFilePath(activeNote.filePath));
      const sourceVaultDir = sourceFile ? parentVaultDir(sourceFile.relativePath) : "";
      const absoluteVaultRelative = vaultRoot ? relativePathFromRoot(vaultRoot, absoluteTarget) : null;
      const relativeTarget = absoluteVaultRelative
        ?? (isAbsoluteLocalPath(cleanLocalTarget) ? null : joinRelativeVaultPath(sourceVaultDir, cleanLocalTarget));
      if (!relativeTarget) {
        indexedTarget = null;
      } else {
        const normalizedTarget = normalizeVaultRelativePath(relativeTarget).toLowerCase();

        const directFile = vaultIndex.filesByRelativePath.get(normalizedTarget)
          ?? vaultIndex.files.find((file) => stripExtension(normalizeVaultRelativePath(file.relativePath)).toLowerCase() === stripExtension(normalizedTarget));

        const directoryFile = DIRECTORY_INDEX_FILE_NAMES
          .map((fileName) => normalizeVaultRelativePath(normalizedTarget ? `${normalizedTarget}/${fileName}` : fileName).toLowerCase())
          .map((candidate) => vaultIndex.filesByRelativePath.get(candidate))
          .find(Boolean);

        indexedTarget = directFile ?? directoryFile ?? null;
      }
    }

    if (indexedTarget) {
      openMarkdownFile(indexedTarget.path, { targetHeading }).catch((error) => {
        console.error("Failed to open indexed editor link", error);
        showLinkOpenFailedToast();
      });
      return true;
    }

    if (isMarkdownLikePath(absoluteTarget)) {
      openMarkdownFile(absoluteTarget, { targetHeading }).catch((error) => {
        console.error("Failed to open local markdown editor link", error);
        showLinkOpenFailedToast();
      });
      return true;
    }

    openExternalTarget(absoluteTarget).catch((error) => {
      console.error("Failed to open local editor link", error);
      showLinkOpenFailedToast();
    });
    return true;
  }, [activeNote.filePath, handleOpenAmbiguousLink, openMarkdownFile, scrollToHeading, showLinkOpenFailedToast, vaultIndex, vaultRoot]);

  const handleFloatingPanelPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if (event.target instanceof HTMLElement && event.target.closest("button")) return;

    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startPosition = floatingPanelPosition;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "move";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const maxX = Math.max(window.innerWidth - 320, 12);
      const maxY = Math.max(window.innerHeight - 220, 72);
      setFloatingPanelPosition({
        x: Math.min(Math.max(startPosition.x + moveEvent.clientX - startX, 12), maxX),
        y: Math.min(Math.max(startPosition.y + moveEvent.clientY - startY, 72), maxY),
      });
    };

    const handlePointerUp = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }, [floatingPanelPosition]);

  const handleSidebarPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setSidebarWidth(clampSidebarWidth(startWidth + moveEvent.clientX - startX));
    };

    const handlePointerUp = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }, [sidebarWidth]);

  const handleRightPanelPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = rightPanelWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setRightPanelWidth(clampRightPanelWidth(startWidth - (moveEvent.clientX - startX)));
    };

    const handlePointerUp = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }, [rightPanelWidth]);

  const handleCenterGraphPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = centerGraphWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setCenterGraphWidth(clampCenterGraphWidth(startWidth - (moveEvent.clientX - startX)));
    };

    const handlePointerUp = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }, [centerGraphWidth]);

  const handleShortcutRecord = useCallback((shortcutId: string, value: string) => {
    const normalized = normalizeShortcutText(value);
    const nextKeys = normalized ? [normalized] : [];
    setShortcuts((current) => current.map((shortcut) => (
      shortcut.id === shortcutId ? { ...shortcut, currentKeys: nextKeys } : shortcut
    )));
    setShortcutEdits((current) => ({ ...current, [shortcutId]: nextKeys.join(", ") }));
  }, []);

  const handleShortcutRestore = useCallback((shortcutId: string) => {
    setShortcuts((current) => current.map((shortcut) => (
      shortcut.id === shortcutId ? { ...shortcut, currentKeys: shortcut.defaultKeys, enabled: true } : shortcut
    )));
    setShortcutEdits((current) => {
      const shortcut = defaultShortcutRegistry.find((item) => item.id === shortcutId);
      return shortcut ? { ...current, [shortcutId]: shortcut.defaultKeys.join(", ") } : current;
    });
  }, []);

  const handleShortcutRestoreAll = useCallback(() => {
    setShortcuts(defaultShortcutRegistry);
    setShortcutEdits(Object.fromEntries(defaultShortcutRegistry.map((shortcut) => [shortcut.id, shortcut.defaultKeys.join(", ")])));
  }, []);

  const updateShortcutEnabled = useCallback((shortcutId: string, enabled: boolean) => {
    setShortcuts((current) => current.map((shortcut) => (
      shortcut.id === shortcutId ? { ...shortcut, enabled } : shortcut
    )));
  }, []);

  const clearVaultState = useCallback(async (options: { skipUnsavedCheck?: boolean } = {}) => {
    if (!options.skipUnsavedCheck && !await confirmDiscardUnsavedChanges()) return;
    clearWindowSelectionSoon();
    setVaultRoot(null);
    setVaultTree(null);
    setVaultError(null);
    setVaultIndex(null);
    setVaultIndexStatus("idle");
    setVaultIndexError(null);
    setVaultRecoveryBlocked(false);
    setSelectedVaultDir("");
    setLastOpenedFile(null);
    setExpandedDirs(new Set([""]));
    vaultIndexFileOverridesRef.current.clear();
    vaultTagSearchCacheRef.current.clear();
    vaultTagSearchPendingRef.current.clear();
    const emptyNote = createEmptyNote();
    setNotes([emptyNote]);
    setActiveNoteId(emptyNote.id);
    restoredVaultRef.current = false;
  }, [confirmDiscardUnsavedChanges]);

  const handleVaultDirectoryClick = useCallback((entry: VaultTreeEntry) => {
    if (entry.relativePath === "") return;

    const isExpanded = expandedDirs.has(entry.relativePath) && (entry.loaded || entry.loading || entry.children.length > 0);
    if (isExpanded) {
      if (isSameOrChildPath(selectedVaultDir, entry.relativePath)) {
        setSelectedVaultDir(parentVaultDir(entry.relativePath));
      }
      setExpandedDirs((current) => {
        const next = new Set(current);
        for (const path of current) {
          if (isSameOrChildPath(path, entry.relativePath)) next.delete(path);
        }
        next.add("");
        return next;
      });
      return;
    }

    setSelectedVaultDir(entry.relativePath);
    setExpandedDirs((current) => new Set(current).add(entry.relativePath));
    if (!entry.loaded && !entry.loading) {
      loadVaultDirectory(entry.relativePath);
    }
  }, [expandedDirs, loadVaultDirectory, selectedVaultDir, setSelectedVaultDir]);

  const contextMenuItems = useMemo<AppContextMenuItem[]>(() => {
    if (!contextMenu) return [];

    if (contextMenu.target === "file" || contextMenu.target === "directory") {
      const entry = contextMenu.entry;
      if (!entry) return [];

      const isDirectory = entry.kind === "directory";
      return [
        {
          id: "entry.open",
          label: isDirectory ? t.sidebar.open : t.commandLabels["file.open"],
          icon: isDirectory ? "folder" : "file",
          onSelect: () => {
            if (isDirectory) {
              handleVaultDirectoryClick(entry);
              return;
            }

            openMarkdownFile(entry.path).catch((error) => {
              console.error("Failed to open vault file", error);
              setVaultError(t.errors.openVaultFileFailed);
            });
          },
        },
        !isDirectory ? {
          id: "entry.openContainingFolder",
          label: t.sidebar.openContainingFolder,
          icon: "folder",
          disabled: demoVaultMode,
          onSelect: () => {
            openExternalTarget(containingFolderPath(entry.path)).catch((error) => {
              console.error("Failed to open containing folder", error);
              setToastMessage(t.status.openFolderFailed);
            });
          },
        } : null,
        commandMenuItem("file.new", "file", { separatorBefore: true }),
        commandMenuItem("file.newFolder", "folder"),
        {
          id: "entry.rename",
          label: t.prompts.renameAction,
          icon: "text",
          separatorBefore: true,
          disabled: !entry.relativePath,
          onSelect: () => handleRenameVaultEntry(entry),
        },
        {
          id: "entry.delete",
          label: t.prompts.deleteAction,
          icon: "trash",
          danger: true,
          disabled: !entry.relativePath,
          onSelect: () => handleDeleteVaultEntry(entry),
        },
      ].filter(Boolean) as AppContextMenuItem[];
    }

    if (contextMenu.target === "document") {
      const filePath = contextMenu.filePath;
      return [
        {
          id: "document.openContainingFolder",
          label: t.sidebar.openContainingFolder,
          icon: "folder",
          disabled: !filePath || demoVaultMode,
          onSelect: () => {
            if (!filePath) return;
            openExternalTarget(containingFolderPath(filePath)).catch((error) => {
              console.error("Failed to open containing folder", error);
              setToastMessage(t.status.openFolderFailed);
            });
          },
        },
        commandMenuItem("file.save", "save", { separatorBefore: true }),
      ];
    }

    if (contextMenu.target === "editor") {
      const redoItem = commandMenuItem("edit.redo", "redo");

      return [
        commandMenuItem("edit.undo", "undo"),
        { ...redoItem, shortcut: redoItem.shortcut?.split(" / ")[0] },
        commandMenuItem("edit.cut", "cut", { separatorBefore: true }),
        commandMenuItem("edit.copy", "copy"),
        commandMenuItem("edit.paste", "paste"),
        commandMenuItem("format.bold", "bold", { separatorBefore: true }),
        commandMenuItem("format.italic", "italic"),
        commandMenuItem("format.inlineCode", "code"),
        commandMenuItem("format.link", "link"),
        commandMenuItem("paragraph.bulletList", "list", { separatorBefore: true }),
        commandMenuItem("paragraph.orderedList", "orderedList"),
        commandMenuItem("paragraph.blockquote", "quote"),
        commandMenuItem("paragraph.table", "table"),
        commandMenuItem("format.image", "image"),
      ];
    }

    return [
      commandMenuItem("file.new", "file"),
      commandMenuItem("file.open", "folder"),
      commandMenuItem("file.save", "save"),
      commandMenuItem("app.openQuickOpen", "search", { separatorBefore: true }),
      commandMenuItem("app.openQuickNote", "text"),
      commandMenuItem("view.toggleSidebar", "panel"),
      commandMenuItem("view.toggleRightPanel", "panel"),
      commandMenuItem("app.openSettings", "settings", { separatorBefore: true }),
    ];
  }, [
    commandMenuItem,
    contextMenu,
    demoVaultMode,
    handleDeleteVaultEntry,
    handleRenameVaultEntry,
    handleVaultDirectoryClick,
    openMarkdownFile,
    setVaultError,
    t.commandLabels,
    t.errors.openVaultFileFailed,
    t.prompts.deleteAction,
    t.prompts.renameAction,
    t.sidebar.openContainingFolder,
    t.sidebar.open,
    t.status.openFolderFailed,
  ]);

  const handleCloseWorkspaceLeaf = useCallback(async () => {
    if (!await confirmDiscardUnsavedChanges()) return;
    clearWindowSelectionSoon();
    const nextNote = createEmptyNote();
    setNotes([nextNote]);
    setActiveNoteId(nextNote.id);
    setLastOpenedFile(null);
    persistVaultPatch({ lastOpenedFile: null });
    setSaveError(null);
    setSaveStatus("idle");
  }, [confirmDiscardUnsavedChanges, persistVaultPatch, setActiveNoteId, setLastOpenedFile, setNotes, setSaveError, setSaveStatus]);

  return (
    <div
      ref={appShellRef}
      className="desktop-shell"
      data-theme={theme}
      data-density={uiDensity}
      data-sidebar={sidebarVisible ? "visible" : "hidden"}
      data-right-panel={rightPanelVisible && !knowledgePanelFloating ? "visible" : "hidden"}
      onContextMenu={handleShellContextMenu}
      style={{
        "--sidebar-width": `${sidebarWidth}px`,
        "--right-panel-width": `${rightPanelWidth}px`,
        "--ui-scale": String(uiScale / 100),
        "--editor-font-latin": quoteCssFontFamily(normalizeEditorFontFamily(editorLatinFont, defaultSettings.editorLatinFont)),
        "--editor-font-cjk": quoteCssFontFamily(normalizeEditorFontFamily(editorCjkFont, defaultSettings.editorCjkFont)),
        "--editor-font-size": `${editorFontSize}px`,
        "--editor-line-height": String(editorLineHeight),
        "--editor-left-gap": `${editorLeftGap}px`,
      } as CSSProperties}
    >
      <WindowChrome
        t={t}
        menuBarRef={menuBarRef}
        openMenuId={openMenuId}
        commands={commands}
        shortcuts={shortcuts}
        saveStatus={saveStatus}
        saveError={saveError}
        savedAt={savedAt}
        hasActiveDocument={hasActiveDocument}
        documentViewMode={documentViewMode}
        windowActionPending={windowActionPending}
        onChromeMouseDown={handleChromeDragMouseDown}
        onChromeDoubleClick={handleChromeDoubleClick}
        onWindowAction={handleWindowAction}
        onOpenMenu={setOpenMenuId}
        onDispatchCommand={dispatchCommand}
        onDocumentViewModeChange={setDocumentViewMode}
      />

      <WorkspaceRibbon
        sidebarVisible={sidebarVisible}
        rightPanelVisible={rightPanelVisible}
        vaultMode={vaultMode}
        graphOpen={centerGraphOpen}
        labels={t.ribbon}
        onToggleSidebar={() => setSidebarVisible((visible) => !visible)}
        onToggleRightPanel={() => {
          setKnowledgePanelFloating(false);
          setRightPanelVisible((visible) => !visible);
        }}
        onCreateNote={() => dispatchCommand("file.new")}
        onOpenVault={() => dispatchCommand("file.openVault")}
        onOpenQuickOpen={openQuickOpen}
        onOpenCommandPalette={() => setPaletteMode("command")}
        onOpenSettings={() => {
          setSettingsSection("general");
          setSettingsOpen(true);
        }}
        onOpenGraphPanel={() => {
          setCenterGraphOpen((open) => {
            const nextOpen = !open;
            setCenterView(nextOpen ? "graph" : "markdown");
            return nextOpen;
          });
        }}
        onOpenSearchPanel={openSidebarSearch}
      />

      {sidebarVisible ? (
        <VaultSidebar
          t={t}
          tab={leftPanelTab}
          vaultMode={vaultMode}
          vaultRoot={vaultRoot}
          vaultTree={vaultTree}
          vaultIndex={vaultIndex}
          vaultIndexStatus={vaultIndexStatus}
          activeIndexedFile={activeIndexedFile}
          vaultError={vaultError}
          vaultRecoveryBlocked={vaultRecoveryBlocked}
          tagFeaturesEnabled={tagFeaturesEnabled}
          expandedDirs={expandedDirs}
          selectedVaultDir={selectedVaultDir}
          activeFilePath={activeNote.filePath ?? null}
          activeNote={activeNote}
          notes={notes}
          outline={outline}
          searchFocusSignal={sidebarSearchFocusSignal}
          searchFocusQuery={sidebarSearchSeed}
          searchNavigationSignal={sidebarSearchNavigation.signal}
          searchNavigationDirection={sidebarSearchNavigation.direction}
          onTabChange={setLeftPanelTab}
          onDispatchCommand={dispatchCommand}
          onOpenMarkdownFile={(path, options) => {
            openMarkdownFile(path, options).catch((error) => {
              console.error("Failed to open vault file", error);
              setVaultError(t.errors.openVaultFileFailed);
            });
          }}
          onOpenCurrentSourceLocation={(line, text) => {
            setPendingSourceLocation({ line, text: text?.trim() || null });
          }}
          onVaultError={setVaultError}
          onRequestVaultIndex={requestVaultIndexForSearch}
          onSearchVaultTags={searchVaultTagsForQuery}
          onVaultDirectoryClick={handleVaultDirectoryClick}
          onRenameVaultEntry={handleRenameVaultEntry}
          onDeleteVaultEntry={handleDeleteVaultEntry}
          onEntryContextMenu={handleVaultEntryContextMenu}
          onClearVaultState={clearVaultState}
          onOutlineClick={handleOutlineClick}
          onSelectNote={setActiveNoteId}
          onReturnToEditor={focusActiveEditor}
        />
      ) : null}

      {sidebarVisible ? (
        <div
          className="sidebar-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label={t.sidebar.resizeSidebar}
          onPointerDown={handleSidebarPointerDown}
        />
      ) : null}

      <WorkspaceCenter
        title={activeNote.title}
        filePath={activeNote.filePath ?? null}
        dirty={Boolean(activeNote.dirty)}
        graphOpen={centerGraphOpen}
        graphWidth={centerGraphWidth}
        activeView={centerGraphOpen ? centerView : "markdown"}
        graphTitle={t.knowledge.graph}
        editorStatus={(
          showEditorStatusOverlay ? (
            <WorkspaceEditorStatusBar
              editorMode={documentViewMode}
              modeLabel={t.modeNames[documentViewMode]}
            />
          ) : null
        )}
        graphChildren={(
          <WorkspaceGraphLeaf
            t={t}
            vaultMode={vaultMode}
            graph={centerGraph}
            activeFilePath={activeNote.filePath ?? null}
            tags={vaultTags}
            tagFeaturesEnabled={tagFeaturesEnabled}
            selectedTag={centerGraphTag}
            isolatedOnly={centerGraphIsolatedOnly}
            showUnresolved={centerGraphShowUnresolved}
            onTagChange={setCenterGraphTag}
            onIsolatedOnlyChange={setCenterGraphIsolatedOnly}
            onShowUnresolvedChange={setCenterGraphShowUnresolved}
            onGraphNodeClick={handleGraphNodeClick}
          />
        )}
        onViewChange={(view) => {
          if (view === "graph") setCenterGraphOpen(true);
          setCenterView(view);
        }}
        onClose={handleCloseWorkspaceLeaf}
        onCloseGraph={() => {
          setCenterGraphOpen(false);
          setCenterView("markdown");
        }}
        onGraphResizePointerDown={handleCenterGraphPointerDown}
        onFileContextMenu={handleActiveFileContextMenu}
      >
        <EditorWorkspace
          t={t}
          activeNote={activeNote}
          hasActiveDocument={hasActiveDocument}
          editorMode={editorMode}
          theme={theme}
          command={editorCommand}
          editorSurfaceRef={editorSurfaceRef}
          viewMode={documentViewMode}
          onViewModeChange={setDocumentViewMode}
          onMarkdownChange={handleMarkdownChange}
          onOpenLink={handleEditorLinkOpen}
          wikiLinkSuggestions={wikiLinkSuggestions}
          onCreateWikiLink={handleCreateWikiLinkTarget}
          onImportImages={importImagesForEditor}
          imagePreviewMap={imagePreviewMap}
          editorTabSize={editorTabSize}
          showImageSourceOnFocus={showImageSourceOnFocus}
          normalizeWindowsImagePaths={normalizeWindowsImagePaths}
          showFrontmatterTagRow={showFrontmatterTagRow}
        />
      </WorkspaceCenter>

      {rightPanelVisible && !knowledgePanelFloating ? (
        <div
          className="right-panel-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label={t.aria.resizeKnowledgePanel}
          onPointerDown={handleRightPanelPointerDown}
        />
      ) : null}

      {rightPanelVisible && !knowledgePanelFloating ? (
        <KnowledgeRail
          t={t}
          mode="docked"
          tab={knowledgePanelTab}
          vaultMode={vaultMode}
          vaultIndex={vaultIndex}
          vaultIndexStatus={vaultIndexStatus}
          vaultIndexError={vaultIndexError}
          activeNote={activeNote}
          activeIndexedFile={activeIndexedFileForTagFeatures}
          activeBacklinks={activeBacklinks}
          activeOutgoingLinks={activeOutgoingLinks}
          activeResolvedLinks={activeResolvedLinks}
          activeUnresolvedLinks={activeUnresolvedLinks}
          activeUnlinkedMentions={activeUnlinkedMentions}
          localGraph={localGraph}
          lineCount={lineCount}
          textStats={textStats}
          tagFeaturesEnabled={tagFeaturesEnabled}
          onTabChange={setKnowledgePanelTab}
          onToggleFloating={() => setKnowledgePanelFloating((floating) => !floating)}
          onFloatingPointerDown={handleFloatingPanelPointerDown}
          onGraphNodeClick={handleGraphNodeClick}
          onSourceLocationClick={handleSourceLocationClick}
          onCreateUnresolvedLink={handleCreateUnresolvedLink}
          onOpenAmbiguousLink={handleOpenAmbiguousLink}
        />
      ) : null}

      {rightPanelVisible && knowledgePanelFloating ? (
        <KnowledgeRail
          t={t}
          mode="floating"
          tab={knowledgePanelTab}
          vaultMode={vaultMode}
          vaultIndex={vaultIndex}
          vaultIndexStatus={vaultIndexStatus}
          vaultIndexError={vaultIndexError}
          activeNote={activeNote}
          activeIndexedFile={activeIndexedFileForTagFeatures}
          activeBacklinks={activeBacklinks}
          activeOutgoingLinks={activeOutgoingLinks}
          activeResolvedLinks={activeResolvedLinks}
          activeUnresolvedLinks={activeUnresolvedLinks}
          activeUnlinkedMentions={activeUnlinkedMentions}
          localGraph={localGraph}
          lineCount={lineCount}
          textStats={textStats}
          floatingPanelPosition={floatingPanelPosition}
          tagFeaturesEnabled={tagFeaturesEnabled}
          onTabChange={setKnowledgePanelTab}
          onToggleFloating={() => setKnowledgePanelFloating((floating) => !floating)}
          onFloatingPointerDown={handleFloatingPanelPointerDown}
          onGraphNodeClick={handleGraphNodeClick}
          onSourceLocationClick={handleSourceLocationClick}
          onCreateUnresolvedLink={handleCreateUnresolvedLink}
          onOpenAmbiguousLink={handleOpenAmbiguousLink}
        />
      ) : null}

      <CommandPalette
        open={paletteMode !== null}
        mode={paletteMode ?? "quickOpen"}
        title={paletteMode === "command" ? t.palette.commandPalette : t.palette.quickOpen}
        placeholder={paletteMode === "command" ? t.palette.commandPlaceholder : t.palette.quickOpenPlaceholder}
        emptyText={t.palette.noResults}
        indexingText={t.knowledge.indexing}
        vaultIndex={vaultIndex}
        vaultIndexStatus={vaultIndexStatus}
        activeIndexedFile={activeIndexedFile}
        commands={commands}
        onClose={() => setPaletteMode(null)}
        tagFeaturesEnabled={tagFeaturesEnabled}
        onRequestVaultIndex={requestVaultIndexForSearch}
        onSearchVaultTags={searchVaultTagsForQuery}
        onOpenFile={(path) => {
          setPaletteMode(null);
          openMarkdownFile(path).catch((error) => {
            console.error("Failed to open quick-open file", error);
            setVaultError(t.errors.openVaultFileFailed);
          });
        }}
        onRunCommand={(commandId) => {
          setPaletteMode(null);
          dispatchCommand(commandId);
        }}
      />

      <AppDialogHost
        dialog={appDialog}
        input={appDialogInput}
        inputRef={appDialogInputRef}
        onInputChange={setAppDialogInput}
        onClose={closeAppDialog}
      />

      <SettingsDialog
        open={settingsOpen}
        t={t}
        language={language}
        section={settingsSection}
        defaultEditorModeSetting={defaultEditorModeSetting}
        restoreWorkspace={restoreWorkspace}
        restoreWindowState={restoreWindowState}
        sidebarVisible={sidebarVisible}
        rightPanelVisible={rightPanelVisible}
        editorLatinFont={editorLatinFont}
        editorCjkFont={editorCjkFont}
        editorFontSize={editorFontSize}
        editorLineHeight={editorLineHeight}
        editorTabSize={editorTabSize}
        uiScale={uiScale}
        zoomWithWheel={zoomWithWheel}
        showEditorStatusOverlay={showEditorStatusOverlay}
        tagFeaturesEnabled={tagFeaturesEnabled}
        showFrontmatterTagRow={showFrontmatterTagRow}
        editorLeftGap={editorLeftGap}
        sidebarWidth={sidebarWidth}
        rightPanelWidth={rightPanelWidth}
        shortcuts={shortcuts}
        shortcutEdits={shortcutEdits}
        shortcutConflicts={shortcutConflicts}
        theme={theme}
        uiDensity={uiDensity}
        defaultSaveExt={defaultSaveExt}
        quickNoteSaveExt={quickNoteSaveExt}
        quickNoteShowInTaskbar={quickNoteShowInTaskbar}
        closeButtonBehavior={closeButtonBehavior}
        defaultNewNoteName={defaultNewNoteName}
        imageAttachmentFolder={imageAttachmentFolder}
        imagePathStyle={imagePathStyle}
        showImageSourceOnFocus={showImageSourceOnFocus}
        normalizeWindowsImagePaths={normalizeWindowsImagePaths}
        vaultRoot={vaultRoot}
        lastOpenedFile={lastOpenedFile}
        onClose={() => setSettingsOpen(false)}
        onSectionChange={setSettingsSection}
        onLanguageChange={setLanguage}
        onDefaultEditorModeChange={setGlobalEditorMode}
        onRestoreWorkspaceChange={setRestoreWorkspace}
        onRestoreWindowStateChange={setRestoreWindowState}
        onSidebarVisibleChange={setSidebarVisible}
        onRightPanelVisibleChange={setRightPanelVisible}
        onEditorLatinFontChange={setEditorLatinFont}
        onEditorCjkFontChange={setEditorCjkFont}
        onEditorFontSizeChange={setEditorFontSize}
        onEditorLineHeightChange={setEditorLineHeight}
        onEditorTabSizeChange={(value) => setEditorTabSize(clampEditorTabSize(value))}
        onUiScaleChange={(value) => setUiScale(clampUiScale(value))}
        onZoomWithWheelChange={setZoomWithWheel}
        onShowEditorStatusOverlayChange={setShowEditorStatusOverlay}
        onTagFeaturesEnabledChange={setTagFeaturesEnabled}
        onShowFrontmatterTagRowChange={setShowFrontmatterTagRow}
        onEditorLeftGapChange={(value) => setEditorLeftGap(clampEditorLeftGap(value))}
        onSidebarWidthChange={(value) => setSidebarWidth(clampSidebarWidth(value))}
        onRightPanelWidthChange={(value) => setRightPanelWidth(clampRightPanelWidth(value))}
        onResetEditorLayout={() => {
          const defaults = resetEditorLayoutDefaults();
          setEditorLatinFont(defaults.editorLatinFont);
          setEditorCjkFont(defaults.editorCjkFont);
          setEditorFontSize(defaults.editorFontSize);
          setEditorLineHeight(defaults.editorLineHeight);
          setEditorTabSize(defaults.editorTabSize);
          setEditorLeftGap(defaults.editorLeftGap);
          setUiScale(defaults.uiScale);
          setSidebarWidth(defaults.sidebarWidth);
          setRightPanelWidth(defaults.rightPanelWidth);
        }}
        onShortcutRecord={handleShortcutRecord}
        onShortcutRestore={handleShortcutRestore}
        onShortcutRestoreAll={handleShortcutRestoreAll}
        onShortcutEnabledChange={updateShortcutEnabled}
        onThemeCommand={dispatchCommand}
        onUiDensityChange={setUiDensity}
        onDefaultSaveExtChange={setDefaultSaveExt}
        onQuickNoteSaveExtChange={setQuickNoteSaveExt}
        onQuickNoteShowInTaskbarChange={setQuickNoteShowInTaskbar}
        onCloseButtonBehaviorChange={setCloseButtonBehavior}
        onDefaultNewNoteNameChange={setDefaultNewNoteName}
        onDefaultNewNoteNameBlur={() => setDefaultNewNoteName((current) => normalizeDefaultNewNoteName(current))}
        onImageAttachmentFolderChange={setImageAttachmentFolder}
        onImageAttachmentFolderBlur={() => setImageAttachmentFolder((current) => normalizeImageAttachmentFolder(current))}
        onImagePathStyleChange={setImagePathStyle}
        onShowImageSourceOnFocusChange={setShowImageSourceOnFocus}
        onNormalizeWindowsImagePathsChange={setNormalizeWindowsImagePaths}
        onClearVaultState={clearVaultState}
      />

      {vaultQuickstartOpen ? (
        <div
          className="quickstart-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setVaultQuickstartOpen(false);
          }}
        >
          <section
            className="quickstart-panel"
            role="dialog"
            aria-modal="true"
            aria-label={t.commandLabels["app.openVaultQuickstart"]}
          >
            <header>
              <div>
                <strong>{t.commandLabels["app.openVaultQuickstart"]}</strong>
                <span>{language === "zh-CN" ? "完整功能学习页，包含可编辑练习区" : "Complete feature guide with an editable practice area"}</span>
              </div>
              <button
                type="button"
                className="quickstart-close"
                aria-label={t.dialog.close}
                onClick={() => setVaultQuickstartOpen(false)}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </header>
            <iframe title={t.commandLabels["app.openVaultQuickstart"]} src="vault-quickstart.html" />
          </section>
        </div>
      ) : null}

      {toastMessage ? (
        <div className="app-toast" role="status" aria-live="polite">
          {toastMessage}
        </div>
      ) : null}

      {contextMenu ? (
        <AppContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          variant={contextMenu.target === "editor" ? "editor" : "default"}
          submenuLabels={{ paragraph: t.menuGroups.paragraph, insert: language === "zh-CN" ? "插入" : "Insert" }}
          onClose={closeContextMenu}
        />
      ) : null}
    </div>
  );
}
