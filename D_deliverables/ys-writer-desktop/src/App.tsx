import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  VAULT_DIRECTORY_LIMIT,
  defaultSettings,
} from "./app/defaults";
import { APP_NAME } from "./app/metadata";
import { appText } from "./app/i18n";
import type { AppLanguage } from "./app/i18n";
import { useAppStore } from "./app/store/appStore";
import type { AppDialogResult } from "./app/store/appStore";
import type {
  CommandDefinition,
  EditorMode,
  SaveFileExt,
  ThemeStyle,
  UIDensity,
  VaultDirectoryResponse,
  VaultTreeEntry,
  VaultWorkspaceState,
} from "./app/types";
import {
  defaultShortcutRegistry,
  findShortcutConflicts,
  normalizeShortcutList,
  shortcutFromEvent,
  writeShortcuts,
} from "./command/shortcuts";
import type { EditorCommandAction, Note } from "./domain/model";
import { createDemoVault, readDemoMarkdownFile } from "./dev/demoVault";
import { applyPlainEditorCommand } from "./editor/plainCommands";
import { directoryFromResponse, updateVaultNode } from "./explorer/tree";
import { AppDialogHost } from "./features/dialogs/AppDialogHost";
import { EditorWorkspace } from "./features/editor-workspace/EditorWorkspace";
import { collectLocalImageSources, htmlDocument, utf8Bytes } from "./export/markdownExport";
import { markdownToPdfBytes } from "./export/pdfExport";
import { KnowledgeRail } from "./features/knowledge-rail/KnowledgeRail";
import { CommandPalette } from "./features/palette/CommandPalette";
import { SettingsDialog, resetEditorLayoutDefaults } from "./features/settings/SettingsDialog";
import { WorkspaceCenter } from "./features/shell/WorkspaceCenter";
import { WorkspaceGraphLeaf } from "./features/shell/WorkspaceGraphLeaf";
import { WorkspaceRibbon } from "./features/shell/WorkspaceRibbon";
import { WorkspaceStatusBar } from "./features/shell/WorkspaceStatusBar";
import { VaultSidebar } from "./features/vault-sidebar/VaultSidebar";
import { WindowChrome } from "./features/window-chrome/WindowChrome";
import {
  createVaultEntry,
  deleteVaultEntry,
  importEditorAsset,
  importEditorAssetFromPath,
  initVault,
  openExternalTarget,
  readLocalAssetDataUrl,
  readMarkdownFile,
  readVaultIndexFiles,
  readVaultDirectory,
  renameVaultEntry,
  writeExportFile,
  writeMarkdownFile,
  writeVaultWorkspaceState,
} from "./services/files";
import {
  clampEditorLeftGap,
  clampRightPanelWidth,
  clampSidebarWidth,
  clampUiScale,
  normalizeDefaultNewNoteName,
  normalizeEditorFontFamily,
  writeSettings,
} from "./services/settings";
import {
  countDocumentText,
  ensureSaveExtension,
  ensureVaultFileName,
  extractFirstLineTitle,
  extractOutline,
  findHeadingIndex,
  getHeadingOffsets,
  isSameOrChildPath,
  joinVaultPath,
  normalizeWikiLinkEscapes,
  normalizeFilePath,
  parentVaultDir,
  pathExtension,
  pathFileName,
  stripExtension,
  vaultFileNameCandidate,
} from "./shared/markdown";
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
  suggestedVaultLinkPath,
} from "./vault/index";
import type { VaultIndexedFile, VaultLink } from "./vault";
import {
  createDraftNote,
  createEmptyNote,
  createFileNote,
  isEmptyDraft,
  isEmptyPlaceholder,
  mergeWorkspaceState,
  nextWorkspaceState,
  pushRecentFile,
} from "./vault/workspace";
import "./styles.css";

const DIRECTORY_INDEX_FILE_NAMES = ["index.md", "index.markdown", "index.txt", "readme.md", "readme.markdown", "readme.txt"];
const WINDOW_ACTION_TIMEOUT_MS = 1500;
type PaletteMode = "quickOpen" | "command";
type SourceLocationTarget = {
  line: number;
  text: string | null;
};

function isEditorTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    && Boolean(target.closest(".markdown-editor, .ProseMirror, .milkdown"));
}

function selectRichCodeBlockDom(target: EventTarget | null) {
  const selection = window.getSelection();
  if (!selection) return false;
  const anchorElement = selection.anchorNode instanceof HTMLElement
    ? selection.anchorNode
    : selection.anchorNode?.parentElement;
  const eventElement = target instanceof HTMLElement ? target : null;
  const codeBlock = eventElement?.closest<HTMLElement>(".milkdown-code-block .cm-content, .milkdown-code-block, .milkdown pre code, .milkdown pre")
    ?? anchorElement?.closest<HTMLElement>(".milkdown-code-block .cm-content, .milkdown-code-block, .milkdown pre code, .milkdown pre");

  if (!codeBlock) return false;

  const range = document.createRange();
  range.selectNodeContents(codeBlock);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function isFormTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function isWindowDragBlockedTarget(target: EventTarget | null) {
  return target instanceof Element
    && Boolean(target.closest("button, input, textarea, select, [role='menu'], .menu-popover, .window-controls"));
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

function normalizeSourceMatchText(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
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

function sourceMatchCandidates(lineText: string, targetText: string | null) {
  return [
    targetText ?? "",
    lineText,
    markdownSourceDisplayText(targetText ?? ""),
    markdownSourceDisplayText(lineText),
  ]
    .map(normalizeSourceMatchText)
    .filter((candidate, index, candidates) => candidate.length >= 2 && candidates.indexOf(candidate) === index)
    .sort((left, right) => right.length - left.length);
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

function ensureExportExtension(path: string, format: "html" | "pdf") {
  const extension = pathExtension(path);
  if (format === "html" && (extension === "html" || extension === "htm")) return path;
  if (format === "pdf" && extension === "pdf") return path;
  return `${path}.${format}`;
}

function markdownImageText(src: string, alt: string) {
  const cleanAlt = alt.replace(/[\]\n\r]/g, " ").trim();
  const cleanSrc = src.includes(" ") ? `<${src}>` : src;
  return `![${cleanAlt}](${cleanSrc})`;
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
    editorLatinFont,
    setEditorLatinFont,
    editorCjkFont,
    setEditorCjkFont,
    editorFontSize,
    setEditorFontSize,
    editorLineHeight,
    setEditorLineHeight,
    editorLeftGap,
    setEditorLeftGap,
    uiScale,
    setUiScale,
    zoomWithWheel,
    setZoomWithWheel,
    richCommand,
    setRichCommand,
    defaultSaveExt,
    setDefaultSaveExt,
    defaultNewNoteName,
    setDefaultNewNoteName,
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
  const plainEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const restoredVaultRef = useRef(false);
  const restoredStandaloneFileRef = useRef(false);
  const loadedDemoVaultRef = useRef(false);
  const pendingHeadingRef = useRef<string | null>(null);
  const richCommandIdRef = useRef(0);
  const vaultIndexRefreshIdRef = useRef(0);
  const windowActionPendingRef = useRef(false);
  const appInitiatedWindowCloseRef = useRef(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pendingSourceLocation, setPendingSourceLocation] = useState<SourceLocationTarget | null>(null);
  const [imagePreviewMap, setImagePreviewMap] = useState<Record<string, string>>({});
  const [paletteMode, setPaletteMode] = useState<PaletteMode | null>(null);
  const [windowActionPending, setWindowActionPending] = useState<"minimize" | "maximize" | "close" | null>(null);
  const [centerView, setCenterView] = useState<"markdown" | "graph">("markdown");
  const [centerGraphOpen, setCenterGraphOpen] = useState(false);
  const [centerGraphTag, setCenterGraphTag] = useState("");
  const [centerGraphIsolatedOnly, setCenterGraphIsolatedOnly] = useState(false);
  const [centerGraphShowUnresolved, setCenterGraphShowUnresolved] = useState(false);
  const [demoVaultMode, setDemoVaultMode] = useState(false);

  const activeNote = notes.find((note) => note.id === activeNoteId) ?? notes[0];
  const t = appText[language];
  const hasActiveDocument = !isEmptyPlaceholder(activeNote);
  const outline = useMemo(() => extractOutline(activeNote.markdown), [activeNote.markdown]);
  const persistedActiveIndexedFile = useMemo(() => findIndexedFile(vaultIndex, activeNote.filePath), [activeNote.filePath, vaultIndex]);
  const activeIndexedFile = useMemo(() => (
    createDraftIndexedFile(vaultIndex, activeNote.filePath, activeNote.markdown) ?? persistedActiveIndexedFile
  ), [activeNote.filePath, activeNote.markdown, persistedActiveIndexedFile, vaultIndex]);
  const activeBacklinks = useMemo(() => getBacklinks(vaultIndex, activeNote.filePath), [activeNote.filePath, vaultIndex]);
  const activeOutgoingLinks = activeIndexedFile?.outgoingLinks ?? [];
  const activeResolvedLinks = activeOutgoingLinks.filter((link) => link.targetPath);
  const activeUnresolvedLinks = activeOutgoingLinks.filter((link) => !link.targetPath);
  const activeUnlinkedMentions = useMemo(
    () => getIncomingUnlinkedMentions(vaultIndex, activeNote.filePath, activeIndexedFile),
    [activeIndexedFile, activeNote.filePath, vaultIndex],
  );
  const localGraph = useMemo(() => createLocalGraph(vaultIndex, activeNote.filePath, activeIndexedFile), [activeIndexedFile, activeNote.filePath, vaultIndex]);
  const vaultTags = useMemo(() => listVaultTags(vaultIndex), [vaultIndex]);
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
  const centerGraph = useMemo(() => createGlobalGraph(vaultIndex, {
    tag: centerGraphTag || null,
    isolatedOnly: centerGraphIsolatedOnly,
    showUnresolved: centerGraphShowUnresolved,
    maxNodes: 180,
  }), [centerGraphIsolatedOnly, centerGraphShowUnresolved, centerGraphTag, vaultIndex]);
  const shortcutConflicts = useMemo(() => findShortcutConflicts(shortcuts), [shortcuts]);
  const vaultMode = Boolean(vaultRoot);
  const windowTitle = hasActiveDocument
    ? `${activeNote.dirty ? "● " : ""}${activeNote.fileName ?? activeNote.title} — ${APP_NAME}`
    : APP_NAME;
  const textStats = useMemo(() => countDocumentText(activeNote.markdown), [activeNote.markdown]);
  const lineCount = useMemo(() => activeNote.markdown.split(/\r?\n/).length, [activeNote.markdown]);

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

  const confirmDiscardUnsavedChanges = useCallback(async () => {
    if (!notes.some((note) => note.dirty)) return true;
    return showConfirmDialog(t.prompts.unsavedChangesTitle, t.prompts.unsavedChangesMessage, true, t.dialog.confirm);
  }, [notes, showConfirmDialog, t.dialog.confirm, t.prompts.unsavedChangesMessage, t.prompts.unsavedChangesTitle]);

  const destroyCurrentWindow = useCallback(async () => {
    const currentWindow = getCurrentWindow();
    appInitiatedWindowCloseRef.current = true;
    try {
      await windowActionWithTimeout(currentWindow.close(), "window close");
    } catch (closeError) {
      console.warn("Window close failed; falling back to destroy", closeError);
      try {
        await windowActionWithTimeout(currentWindow.destroy(), "window destroy");
      } finally {
        window.setTimeout(() => {
          appInitiatedWindowCloseRef.current = false;
        }, 500);
      }
    }
  }, []);

  const requestCloseWindow = useCallback(async () => {
    if (windowActionPendingRef.current) return;
    windowActionPendingRef.current = true;
    setWindowActionPending("close");
    setOpenMenuId(null);
    setSettingsOpen(false);

    try {
      if (!await confirmDiscardUnsavedChanges()) return;
      await destroyCurrentWindow();
    } catch (error) {
      console.warn("Failed to close window", error);
      setToastMessage(t.status.closeFailed);
    } finally {
      windowActionPendingRef.current = false;
      setWindowActionPending(null);
    }
  }, [confirmDiscardUnsavedChanges, destroyCurrentWindow, setOpenMenuId, setSettingsOpen, t.status.closeFailed]);

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

  const handleChromeDragMouseDown = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (event.button !== 0 || event.detail > 1) return;
    if (isWindowDragBlockedTarget(event.target)) return;

    try {
      void getCurrentWindow().startDragging();
    } catch (error) {
      console.warn("Window dragging is only available inside Tauri", error);
    }
  }, []);

  const handleChromeDoubleClick = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (isWindowDragBlockedTarget(event.target)) return;
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
      return {
        ...note,
        title: titleFromMarkdown(normalizedMarkdown, note.title),
        markdown: normalizedMarkdown,
        updatedAt: new Date().toISOString(),
        dirty: true,
      };
    }));
  }, [activeNoteId]);

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
        if (!current || relativePath === "") return nextDirectory;
        return updateVaultNode(current, relativePath, () => nextDirectory);
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
      return;
    }

    const refreshId = vaultIndexRefreshIdRef.current + 1;
    vaultIndexRefreshIdRef.current = refreshId;
    setVaultIndexStatus("indexing");
    setVaultIndexError(null);

    try {
      const response = await readVaultIndexFiles(root);
      if (vaultIndexRefreshIdRef.current !== refreshId) return;
      setVaultIndex(buildVaultIndex(root, response));
      setVaultIndexStatus("ready");
    } catch (error) {
      if (vaultIndexRefreshIdRef.current !== refreshId) return;
      console.error("Failed to index vault", error);
      setVaultIndex(null);
      setVaultIndexStatus("error");
      setVaultIndexError(t.errors.vaultIndexFailed);
    }
  }, [t.errors.vaultIndexFailed, vaultRoot]);

  const prefetchInitialDirectories = useCallback(async (root: string, rootDirectory: VaultDirectoryResponse) => {
    let loadedCount = 0;
    const rootDirs = rootDirectory.children.filter((entry) => entry.kind === "directory");

    for (const directory of rootDirs) {
      if (loadedCount >= 3) return;

      setExpandedDirs((current) => new Set(current).add(directory.relativePath));
      const response = await loadVaultDirectory(directory.relativePath, root);
      loadedCount += 1;

      const firstChildDir = response?.children.find((entry) => entry.kind === "directory");
      if (!firstChildDir || loadedCount >= 3) continue;

      setExpandedDirs((current) => new Set(current).add(firstChildDir.relativePath));
      await loadVaultDirectory(firstChildDir.relativePath, root);
      loadedCount += 1;
    }
  }, [loadVaultDirectory]);

  const applyOpenedFile = useCallback((file: Awaited<ReturnType<typeof readMarkdownFile>>) => {
    const nextNote = createFileNote(file);

    setNotes((currentNotes) => {
      if (vaultRoot) return [nextNote];

      if (activeNote && isEmptyDraft(activeNote)) {
        return currentNotes.map((note) => (note.id === activeNote.id ? nextNote : note));
      }

      return [nextNote, ...currentNotes.filter((note) => note.filePath !== nextNote.filePath)];
    });
    setActiveNoteId(nextNote.id);
    setLastOpenedFile(nextNote.filePath ?? null);
    persistVaultPatch({
      lastOpenedFile: nextNote.filePath ?? null,
      recentFiles: pushRecentFile(vaultWorkspace.recentFiles, nextNote.filePath ?? null),
    });
    setSaveError(null);
    setSaveStatus("saved");
  }, [activeNote, persistVaultPatch, vaultRoot, vaultWorkspace.recentFiles]);

  const openMarkdownFile = useCallback(async (path: string, options: {
    skipUnsavedCheck?: boolean;
    targetHeading?: string | null;
    targetLine?: number | null;
    targetText?: string | null;
  } = {}) => {
    const currentPath = activeNote.filePath ? normalizeFilePath(activeNote.filePath) : null;
    if (!options.skipUnsavedCheck && normalizeFilePath(path) !== currentPath && !await confirmDiscardUnsavedChanges()) return;
    const file = demoVaultMode ? readDemoMarkdownFile(path) : await readMarkdownFile(path);
    applyOpenedFile(file);
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
    const workspace = mergeWorkspaceState(initialized.workspace, {
      sidebarWidth,
      sidebarVisible,
      rightPanelVisible,
      rightPanelWidth,
      editorLeftGap,
      uiScale,
    });

    setVaultRoot(initialized.root);
    setVaultWorkspace(workspace);
    setSelectedVaultDir(workspace.selectedDir);
    setLastOpenedFile(workspace.lastOpenedFile);
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
    setExpandedDirs(new Set(workspace.expandedDirs.length ? workspace.expandedDirs : [""]));
    const emptyNote = createEmptyNote();
    setNotes([emptyNote]);
    setActiveNoteId(emptyNote.id);

    const rootDirectory = await loadVaultDirectory("", initialized.root);
    void refreshVaultIndex(initialized.root);
    if (rootDirectory) void prefetchInitialDirectories(initialized.root, rootDirectory);
    if (workspace.lastOpenedFile) {
      openMarkdownFile(workspace.lastOpenedFile).catch((error) => {
        console.error("Failed to restore last opened file", error);
        setVaultError(t.errors.restoreLastFileFailed);
      });
    }
  }, [
    editorLeftGap,
    loadVaultDirectory,
    openMarkdownFile,
    prefetchInitialDirectories,
    refreshVaultIndex,
    rightPanelVisible,
    rightPanelWidth,
    sidebarVisible,
    sidebarWidth,
    t.errors.restoreLastFileFailed,
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
    if (new URLSearchParams(window.location.search).get("demoVault") !== "obsidian") return;
    loadedDemoVaultRef.current = true;

    const demo = createDemoVault();
    const nextNote = createFileNote(demo.activeFile);
    restoredVaultRef.current = true;
    restoredStandaloneFileRef.current = true;

    setVaultRoot(demo.root);
    setDemoVaultMode(true);
    setVaultTree(demo.tree);
    setVaultIndex(buildVaultIndex(demo.root, demo.indexResponse));
    setVaultIndexStatus("ready");
    setVaultIndexError(null);
    setVaultError(null);
    setSelectedVaultDir("");
    setExpandedDirs(new Set(demo.expandedDirs));
    setLastOpenedFile(nextNote.filePath ?? null);
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
    const isExistingFileSave = note.filePath
      ? normalizeFilePath(normalizedPath) === normalizeFilePath(note.filePath)
      : false;
    const file = await writeMarkdownFile(
      normalizedPath,
      note.markdown,
      isExistingFileSave ? note.fileModifiedAtMs : null,
      isExistingFileSave ? note.fileSize : null,
    );
    const nextNote: Note = {
      ...note,
      title: stripExtension(file.fileName) || extractFirstLineTitle(note.markdown) || note.title,
      filePath: file.path,
      fileName: file.fileName,
      fileExt: file.fileExt,
      fileModifiedAtMs: file.modifiedAtMs,
      fileSize: file.size,
      updatedAt: new Date().toISOString(),
      dirty: false,
    };

    setNotes((currentNotes) => currentNotes.map((item) => (item.id === note.id ? nextNote : item)));
    setLastOpenedFile(nextNote.filePath ?? null);
    persistVaultPatch({
      lastOpenedFile: nextNote.filePath ?? null,
      recentFiles: pushRecentFile(vaultWorkspace.recentFiles, nextNote.filePath ?? null),
    });
    if (vaultRoot) {
      await loadVaultDirectory(selectedVaultDir);
      await refreshVaultIndex(vaultRoot);
    }
    setSavedAt(new Date());
    setSaveError(null);
    setSaveStatus("saved");
  }, [defaultSaveExt, loadVaultDirectory, persistVaultPatch, refreshVaultIndex, selectedVaultDir, vaultRoot, vaultWorkspace.recentFiles]);

  const handleSaveAs = useCallback(async () => {
    if (!activeNote) return;

    try {
      const fallbackName = `${activeNote.fileName ? stripExtension(activeNote.fileName) : activeNote.title || "Untitled"}.${defaultSaveExt}`;
      const selected = await save({
        defaultPath: fallbackName,
        filters: [{ name: "Markdown/Text", extensions: ["md", "markdown", "txt"] }],
      });

      if (!selected) return;
      await saveNoteToPath(activeNote, selected);
    } catch (error) {
      console.error("Failed to save file as", error);
      setSaveError(t.errors.saveAsFailed);
      setSaveStatus("error");
    }
  }, [activeNote, defaultSaveExt, saveNoteToPath, t.errors.saveAsFailed]);

  const handleSave = useCallback(async () => {
    if (!activeNote) return;

    try {
      if (activeNote.filePath) {
        await saveNoteToPath(activeNote, activeNote.filePath);
      } else {
        await handleSaveAs();
      }
    } catch (error) {
      console.error("Failed to save file", error);
      setSaveError(t.errors.saveFailed);
      setSaveStatus("error");
    }
  }, [activeNote, handleSaveAs, saveNoteToPath, t.errors.saveFailed]);

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
        const asset = await importEditorAsset(vaultRoot, currentFilePath, file.name || "image.png", bytes);
        imported.push({
          src: asset.relativeMarkdownPath,
          alt: stripExtension(asset.fileName || file.name || "image"),
        });
      }

      if (vaultRoot) {
        const relativeFilePath = relativePathFromRoot(vaultRoot, currentFilePath);
        const currentDir = relativeFilePath ? parentVaultDir(relativeFilePath) : selectedVaultDir;
        await loadVaultDirectory(currentDir);
        void refreshVaultIndex(vaultRoot);
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
    refreshVaultIndex,
    setSaveError,
    setSaveStatus,
    t.errors.saveBeforeImageImport,
    t.errors.imageImportFailed,
    vaultRoot,
    selectedVaultDir,
  ]);

  const importImagePathForEditor = useCallback(async (sourcePath: string) => {
    try {
      if (!activeNote.filePath) {
        throw new Error(t.errors.saveBeforeImageImport);
      }
      const currentFilePath = activeNote.filePath;

      const asset = await importEditorAssetFromPath(vaultRoot, currentFilePath, sourcePath);
      if (vaultRoot) {
        const relativeFilePath = relativePathFromRoot(vaultRoot, currentFilePath);
        const currentDir = relativeFilePath ? parentVaultDir(relativeFilePath) : selectedVaultDir;
        await loadVaultDirectory(currentDir);
        void refreshVaultIndex(vaultRoot);
      }
      return {
        src: asset.relativeMarkdownPath,
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
    refreshVaultIndex,
    selectedVaultDir,
    setSaveError,
    setSaveStatus,
    t.errors.imageImportFailed,
    t.errors.saveBeforeImageImport,
    vaultRoot,
  ]);

  const handlePlainEditorImageFiles = useCallback(async (files: File[]) => {
    if (!activeNote) return false;
    try {
      const images = await importImagesForEditor(files);
      if (!images.length) return false;

      const textarea = plainEditorRef.current;
      const selectionStart = textarea?.selectionStart ?? activeNote.markdown.length;
      const selectionEnd = textarea?.selectionEnd ?? selectionStart;
      const insertion = images.map((image) => markdownImageText(image.src, image.alt)).join("\n\n");
      const prefix = selectionStart > 0 && !activeNote.markdown.slice(0, selectionStart).endsWith("\n") ? "\n" : "";
      const suffix = activeNote.markdown.slice(selectionEnd).startsWith("\n") ? "" : "\n";
      const nextMarkdown = `${activeNote.markdown.slice(0, selectionStart)}${prefix}${insertion}${suffix}${activeNote.markdown.slice(selectionEnd)}`;
      const nextCursor = selectionStart + prefix.length + insertion.length;

      setNotes((currentNotes) => currentNotes.map((note) => (
        note.id === activeNote.id
          ? { ...note, markdown: nextMarkdown, title: titleFromMarkdown(nextMarkdown, note.title), updatedAt: new Date().toISOString(), dirty: true }
          : note
      )));
      window.requestAnimationFrame(() => {
        textarea?.focus();
        textarea?.setSelectionRange(nextCursor, nextCursor);
      });
      return true;
    } catch (error) {
      console.error("Failed to import image", error);
      return false;
    }
  }, [activeNote, importImagesForEditor, setNotes]);

  const buildExportImageMap = useCallback(async () => {
    const sources = collectLocalImageSources(activeNote.markdown);
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
      ], t.prompts.exportFormatHint);
      if (!selectedFormat) return;

      const format = selectedFormat === "pdf" ? "pdf" : selectedFormat === "html" ? "html" : null;
      if (!format) {
        setToastMessage(t.errors.exportFormatUnsupported);
        return;
      }

      const fallbackBase = activeNote.fileName ? stripExtension(activeNote.fileName) : activeNote.title || "Serein Export";
      const selected = await save({
        defaultPath: `${fallbackBase}.${format}`,
        filters: format === "html"
          ? [{ name: "HTML", extensions: ["html"] }]
          : [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!selected) return;

      const imageMap = await buildExportImageMap();
      const title = extractFirstLineTitle(activeNote.markdown) ?? (stripExtension(activeNote.fileName ?? "") || activeNote.title);
      const bytes = format === "html"
        ? utf8Bytes(htmlDocument(activeNote.markdown, { title, imageMap }))
        : await markdownToPdfBytes(activeNote.markdown, { title, imageMap });
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

  const focusEditor = useCallback(() => {
    if (editorMode === "plain") {
      plainEditorRef.current?.focus();
      return;
    }

    const proseMirror = editorSurfaceRef.current?.querySelector<HTMLElement>(".ProseMirror");
    proseMirror?.focus();
  }, [editorMode]);

  const runEditorCommand = useCallback((action: EditorCommandAction, payload?: string, alt?: string) => {
    if (!activeNote) return;

    if (editorMode === "plain") {
      const textarea = plainEditorRef.current;
      if (!textarea) return;

      const result = applyPlainEditorCommand(
        activeNote.markdown,
        textarea.selectionStart,
        textarea.selectionEnd,
        action,
        payload,
        alt,
      );

      setNotes((currentNotes) => currentNotes.map((note) => {
        if (note.id !== activeNote.id) return note;
        return {
          ...note,
          title: titleFromMarkdown(result.markdown, note.title),
          markdown: result.markdown,
          updatedAt: new Date().toISOString(),
          dirty: true,
        };
      }));

      window.requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
      });
      return;
    }

    richCommandIdRef.current += 1;
    setRichCommand({ id: richCommandIdRef.current, action, payload, alt });
  }, [activeNote, editorMode]);

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

  const handleFind = useCallback(async () => {
    if (!activeNote) return;
    const query = await showInputDialog(t.prompts.find, "");
    if (!query) return;

    if (editorMode === "plain") {
      const textarea = plainEditorRef.current;
      if (!textarea) return;

      const startFrom = textarea.selectionEnd;
      const index = activeNote.markdown.indexOf(query, startFrom);
      const wrappedIndex = index === -1 ? activeNote.markdown.indexOf(query) : index;
      if (wrappedIndex === -1) {
        await showMessageDialog(t.prompts.noMatches);
        return;
      }

      textarea.focus();
      textarea.setSelectionRange(wrappedIndex, wrappedIndex + query.length);
      return;
    }

    focusEditor();
    const found = (window as Window & { find?: (...args: unknown[]) => boolean }).find?.(
      query,
      false,
      false,
      true,
      false,
      false,
      false,
    ) ?? false;
    if (!found) await showMessageDialog(t.prompts.noMatches);
  }, [activeNote, editorMode, focusEditor, showInputDialog, showMessageDialog, t.prompts.find, t.prompts.noMatches]);

  const commands = useMemo<Record<string, CommandDefinition>>(() => ({
    "file.new": { id: "file.new", label: t.commandLabels["file.new"], enabled: true, run: handleCreateNote },
    "file.newFolder": { id: "file.newFolder", label: t.commandLabels["file.newFolder"], enabled: Boolean(vaultRoot), run: handleCreateVaultFolder },
    "file.open": { id: "file.open", label: t.commandLabels["file.open"], enabled: true, run: handleOpenFile },
    "file.openVault": { id: "file.openVault", label: t.commandLabels["file.openVault"], enabled: true, run: handleOpenVault },
    "file.save": { id: "file.save", label: t.commandLabels["file.save"], enabled: hasActiveDocument, run: handleSave },
    "file.saveAs": { id: "file.saveAs", label: t.commandLabels["file.saveAs"], enabled: hasActiveDocument, run: handleSaveAs },
    "file.export": { id: "file.export", label: t.commandLabels["file.export"], enabled: hasActiveDocument, run: handleExport },
    "app.openQuickOpen": {
      id: "app.openQuickOpen",
      label: t.commandLabels["app.openQuickOpen"],
      enabled: Boolean(vaultIndex?.files.length),
      run: () => setPaletteMode("quickOpen"),
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
    "app.openShortcuts": {
      id: "app.openShortcuts",
      label: t.commandLabels["app.openShortcuts"],
      enabled: true,
      run: () => {
        setSettingsSection("shortcuts");
        setSettingsOpen(true);
      },
    },
    "app.about": { id: "app.about", label: t.commandLabels["app.about"], enabled: true, run: () => showMessageDialog(t.commandLabels["app.about"], t.prompts.about) },
    "edit.cut": { id: "edit.cut", label: t.commandLabels["edit.cut"], enabled: true, run: () => { focusEditor(); document.execCommand("cut"); } },
    "edit.copy": { id: "edit.copy", label: t.commandLabels["edit.copy"], enabled: true, run: () => { focusEditor(); document.execCommand("copy"); } },
    "edit.paste": { id: "edit.paste", label: t.commandLabels["edit.paste"], enabled: true, run: () => { focusEditor(); document.execCommand("paste"); } },
    "edit.undo": { id: "edit.undo", label: t.commandLabels["edit.undo"], enabled: true, run: () => { focusEditor(); document.execCommand("undo"); } },
    "edit.redo": { id: "edit.redo", label: t.commandLabels["edit.redo"], enabled: true, run: () => { focusEditor(); document.execCommand("redo"); } },
    "edit.selectAll": { id: "edit.selectAll", label: t.commandLabels["edit.selectAll"], enabled: true, run: () => runEditorCommand("selectAllSmart") },
    "edit.find": { id: "edit.find", label: t.commandLabels["edit.find"], enabled: hasActiveDocument, run: handleFind },
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
    "view.setPlainEdit": { id: "view.setPlainEdit", label: t.commandLabels["view.setPlainEdit"], enabled: editorMode !== "plain", run: () => setEditorMode("plain") },
    "view.setRichEdit": { id: "view.setRichEdit", label: t.commandLabels["view.setRichEdit"], enabled: editorMode !== "rich", run: () => setEditorMode("rich") },
    "view.toggleSidebar": { id: "view.toggleSidebar", label: t.commandLabels["view.toggleSidebar"], enabled: true, run: () => setSidebarVisible((visible) => !visible) },
    "view.toggleRightPanel": { id: "view.toggleRightPanel", label: t.commandLabels["view.toggleRightPanel"], enabled: true, run: () => setRightPanelVisible((visible) => !visible) },
    "theme.daily": { id: "theme.daily", label: t.commandLabels["theme.daily"], enabled: theme !== "daily", run: () => setTheme("daily") },
    "theme.eye": { id: "theme.eye", label: t.commandLabels["theme.eye"], enabled: theme !== "eye", run: () => setTheme("eye") },
    "theme.mint": { id: "theme.mint", label: t.commandLabels["theme.mint"], enabled: theme !== "mint", run: () => setTheme("mint") },
    "theme.ink": { id: "theme.ink", label: t.commandLabels["theme.ink"], enabled: theme !== "ink", run: () => setTheme("ink") },
  }), [
    activeNote,
    editorMode,
    focusEditor,
    hasActiveDocument,
    handleCreateVaultFolder,
    handleCreateNote,
    handleFind,
    handleExport,
    handleOpenFile,
    handleOpenVault,
    handleSave,
    handleSaveAs,
    runEditorCommand,
    runImageCommand,
    runLinkCommand,
    showMessageDialog,
    t,
    theme,
    vaultIndex,
  ]);

  const dispatchCommand = useCallback(async (commandId: string) => {
    const command = commands[commandId];
    if (!command?.enabled) return;
    await command.run();
    setOpenMenuId(null);
  }, [commands]);

  useEffect(() => {
    if (restoredVaultRef.current || !vaultRoot) return;
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
  }, [activateVault, t.errors.recoveryPaused, t.errors.recoveryPausedLabel, t.errors.restoreVaultFailed, vaultRecoveryBlocked, vaultRoot]);

  useEffect(() => {
    if (restoredStandaloneFileRef.current || vaultRoot || !restoreWorkspace || !lastOpenedFile) return;
    restoredStandaloneFileRef.current = true;

    openMarkdownFile(lastOpenedFile, { skipUnsavedCheck: true }).catch((error) => {
      console.error("Failed to restore last opened file", error);
      setSaveError(t.errors.restoreLastFileFailed);
      setSaveStatus("error");
    });
  }, [lastOpenedFile, openMarkdownFile, restoreWorkspace, t.errors.restoreLastFileFailed, vaultRoot]);

  useEffect(() => {
    writeSettings({
      theme,
      language,
      uiDensity,
      sidebarWidth,
      sidebarVisible,
      rightPanelVisible,
      rightPanelWidth,
      vaultRoot,
      lastOpenedFile,
      selectedVaultDir,
      vaultRecoveryBlocked,
      defaultEditorMode: defaultEditorModeSetting,
      restoreWorkspace,
      editorLatinFont: normalizeEditorFontFamily(editorLatinFont, defaultSettings.editorLatinFont),
      editorCjkFont: normalizeEditorFontFamily(editorCjkFont, defaultSettings.editorCjkFont),
      editorFontSize,
      editorLineHeight,
      editorLeftGap,
      uiScale,
      zoomWithWheel,
      defaultSaveExt,
      defaultNewNoteName: normalizeDefaultNewNoteName(defaultNewNoteName),
    });
  }, [
    defaultEditorModeSetting,
    defaultNewNoteName,
    defaultSaveExt,
    editorCjkFont,
    editorFontSize,
    editorLatinFont,
    editorLeftGap,
    editorLineHeight,
    language,
    lastOpenedFile,
    restoreWorkspace,
    rightPanelWidth,
    rightPanelVisible,
    selectedVaultDir,
    sidebarVisible,
    sidebarWidth,
    theme,
    uiDensity,
    uiScale,
    vaultRecoveryBlocked,
    vaultRoot,
    zoomWithWheel,
  ]);

  useEffect(() => {
    writeShortcuts(shortcuts);
  }, [shortcuts]);

  useEffect(() => {
    if (!toastMessage) return undefined;
    const timeout = window.setTimeout(() => setToastMessage(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  useEffect(() => {
    let active = true;
    const sources = collectLocalImageSources(activeNote.markdown);
    if (!activeNote.filePath || !sources.length) {
      setImagePreviewMap({});
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      Promise.all(sources.map(async (source) => {
        try {
          const asset = await readLocalAssetDataUrl(vaultRoot, activeNote.filePath!, source);
          return [source, asset.dataUrl] as const;
        } catch {
          return null;
        }
      })).then((entries) => {
        if (!active) return;
        setImagePreviewMap(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry))));
      });
    }, 150);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [activeNote.filePath, activeNote.markdown, vaultRoot]);

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
      lastOpenedFile,
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
    lastOpenedFile,
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
      event.preventDefault();
      setUiScale((current) => clampUiScale(current + (event.deltaY < 0 ? 5 : -5)));
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, [zoomWithWheel]);

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
      if (event.key === "Escape") {
        if (appDialog) {
          closeAppDialog(null);
          return;
        }
        setOpenMenuId(null);
        setSettingsOpen(false);
        return;
      }

      if (appDialog) return;

      const key = shortcutFromEvent(event);
      if (!key) return;

      if ((key === "Ctrl+A" || key === "Meta+A") && selectRichCodeBlockDom(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const shortcut = shortcuts.find((item) => item.enabled && item.currentKeys.includes(key));
      if (!shortcut) return;

      if (isEditorTarget(event.target) && (shortcut.commandId === "edit.undo" || shortcut.commandId === "edit.redo")) {
        return;
      }

      if (
        isFormTarget(event.target)
        && shortcut.commandId !== "file.save"
        && shortcut.commandId !== "file.saveAs"
        && shortcut.commandId !== "file.export"
        && shortcut.commandId !== "file.open"
        && shortcut.commandId !== "file.openVault"
        && shortcut.commandId !== "file.new"
        && shortcut.commandId !== "edit.selectAll"
        && shortcut.commandId !== "app.openSettings"
        && shortcut.commandId !== "app.openQuickOpen"
        && shortcut.commandId !== "app.openCommandPalette"
      ) {
        return;
      }

      const command = commands[shortcut.commandId];
      if (!command?.enabled) return;

      event.preventDefault();
      dispatchCommand(shortcut.commandId);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [appDialog, closeAppDialog, commands, dispatchCommand, shortcuts]);

  const handleOutlineClick = useCallback((index: number) => {
    if (editorMode === "plain") {
      const target = getHeadingOffsets(activeNote.markdown)[index];
      if (!target) return;

      plainEditorRef.current?.focus();
      plainEditorRef.current?.setSelectionRange(target.start, target.end);
      return;
    }

    const headings = editorSurfaceRef.current?.querySelectorAll(".milkdown h1, .milkdown h2, .milkdown h3, .milkdown h4, .milkdown h5, .milkdown h6");
    const heading = headings?.item(index);
    heading?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeNote.markdown, editorMode]);

  const scrollToHeading = useCallback((heading: string) => {
    const index = findHeadingIndex(activeNote.markdown, heading);
    if (index < 0) return false;

    if (editorMode === "plain") {
      const target = getHeadingOffsets(activeNote.markdown)[index];
      if (!target) return false;
      plainEditorRef.current?.focus();
      plainEditorRef.current?.setSelectionRange(target.start, target.end);
      return true;
    }

    const headings = editorSurfaceRef.current?.querySelectorAll(".milkdown h1, .milkdown h2, .milkdown h3, .milkdown h4, .milkdown h5, .milkdown h6");
    const target = headings?.item(index);
    if (!target) return false;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
  }, [activeNote.markdown, editorMode]);

  const scrollToSourceLocation = useCallback((target: SourceLocationTarget) => {
    const line = sourceLineBounds(activeNote.markdown, target.line);
    if (!line) return false;

    if (editorMode === "plain") {
      const textarea = plainEditorRef.current;
      if (!textarea) return false;

      const lineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight) || 22;
      textarea.focus();
      textarea.setSelectionRange(line.start, line.end);
      textarea.scrollTop = Math.max(0, (target.line - 4) * lineHeight);
      return true;
    }

    const surface = editorSurfaceRef.current;
    const proseMirror = surface?.querySelector<HTMLElement>(".ProseMirror");
    if (!surface || !proseMirror) return false;

    const candidates = sourceMatchCandidates(line.text, target.text);
    const highlightId = `${Date.now()}-${target.line}`;
    const findMatchedBlock = () => {
      const blocks = [...surface.querySelectorAll<HTMLElement>([
        ".milkdown .ProseMirror p",
        ".milkdown .ProseMirror li",
        ".milkdown .ProseMirror h1",
        ".milkdown .ProseMirror h2",
        ".milkdown .ProseMirror h3",
        ".milkdown .ProseMirror h4",
        ".milkdown .ProseMirror h5",
        ".milkdown .ProseMirror h6",
        ".milkdown .ProseMirror blockquote",
        ".milkdown .ProseMirror pre",
        ".milkdown .ProseMirror table",
      ].join(", "))].filter((node) => (node.textContent ?? "").trim());

      return blocks.find((block) => {
        const blockText = normalizeSourceMatchText(block.textContent ?? "");
        return candidates.some((candidate) => blockText.includes(candidate) || candidate.includes(blockText));
      }) ?? null;
    };
    const markMatchedBlock = (scroll: boolean) => {
      const matched = findMatchedBlock();
      if (!matched) return false;

      surface.querySelectorAll<HTMLElement>(".source-location-target").forEach((node) => {
        if (node.dataset.sourceLocationTarget !== highlightId) {
          node.classList.remove("source-location-target");
          delete node.dataset.sourceLocationTarget;
        }
      });
      matched.classList.add("source-location-target");
      matched.dataset.sourceLocationTarget = highlightId;
      if (scroll) matched.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => {
        if (matched.dataset.sourceLocationTarget !== highlightId) return;
        matched.classList.remove("source-location-target");
        delete matched.dataset.sourceLocationTarget;
      }, 4000);
      return true;
    };

    if (!markMatchedBlock(true)) return false;
    [120, 360, 800].forEach((delay) => {
      window.setTimeout(() => {
        markMatchedBlock(false);
      }, delay);
    });
    proseMirror.focus();
    return true;
  }, [activeNote.markdown, editorMode]);

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

  const handleShortcutInputBlur = useCallback((shortcutId: string) => {
    const nextKeys = normalizeShortcutList(shortcutEdits[shortcutId] ?? "");
    setShortcuts((current) => current.map((shortcut) => (
      shortcut.id === shortcutId ? { ...shortcut, currentKeys: nextKeys } : shortcut
    )));
    setShortcutEdits((current) => ({ ...current, [shortcutId]: nextKeys.join(", ") }));
  }, [shortcutEdits]);

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
    const emptyNote = createEmptyNote();
    setNotes([emptyNote]);
    setActiveNoteId(emptyNote.id);
    restoredVaultRef.current = false;
  }, [confirmDiscardUnsavedChanges]);

  const handleVaultDirectoryClick = useCallback((entry: VaultTreeEntry) => {
    setSelectedVaultDir(entry.relativePath);
    if (entry.relativePath === "") return;

    const isExpanded = expandedDirs.has(entry.relativePath);
    if (isExpanded) {
      setExpandedDirs((current) => {
        const next = new Set(current);
        next.delete(entry.relativePath);
        return next;
      });
      return;
    }

    setExpandedDirs((current) => new Set(current).add(entry.relativePath));
    if (!entry.loaded && !entry.loading) {
      loadVaultDirectory(entry.relativePath);
    }
  }, [expandedDirs, loadVaultDirectory]);

  const handleCloseWorkspaceLeaf = useCallback(async () => {
    if (!await confirmDiscardUnsavedChanges()) return;
    const nextNote = createEmptyNote();
    setNotes([nextNote]);
    setActiveNoteId(nextNote.id);
    setLastOpenedFile(null);
    persistVaultPatch({ lastOpenedFile: null });
    setSaveError(null);
    setSaveStatus("idle");
  }, [confirmDiscardUnsavedChanges, persistVaultPatch, setActiveNoteId, setLastOpenedFile, setNotes, setSaveError, setSaveStatus]);

  const modeCommandId = editorMode === "plain" ? "view.setRichEdit" : "view.setPlainEdit";

  return (
    <div
      className="desktop-shell"
      data-theme={theme}
      data-density={uiDensity}
      data-sidebar={sidebarVisible ? "visible" : "hidden"}
      data-right-panel={rightPanelVisible && !knowledgePanelFloating ? "visible" : "hidden"}
      style={{
        "--sidebar-width": `${sidebarWidth}px`,
        "--right-panel-width": `${rightPanelWidth}px`,
        "--ui-scale": String(uiScale / 100),
        "--editor-font-latin": quoteCssFontFamily(normalizeEditorFontFamily(editorLatinFont, defaultSettings.editorLatinFont)),
        "--editor-font-cjk": quoteCssFontFamily(normalizeEditorFontFamily(editorCjkFont, defaultSettings.editorCjkFont)),
        "--editor-font-size": `${editorFontSize * (uiScale / 100)}px`,
        "--editor-line-height": String(editorLineHeight),
        "--editor-left-gap": `${editorLeftGap}px`,
      } as CSSProperties}
    >
      <WindowChrome
        t={t}
        windowTitle={windowTitle}
        menuBarRef={menuBarRef}
        openMenuId={openMenuId}
        commands={commands}
        shortcuts={shortcuts}
        saveStatus={saveStatus}
        saveError={saveError}
        savedAt={savedAt}
        hasActiveDocument={hasActiveDocument}
        editorMode={editorMode}
        modeCommandId={modeCommandId}
        windowActionPending={windowActionPending}
        onChromeMouseDown={handleChromeDragMouseDown}
        onChromeDoubleClick={handleChromeDoubleClick}
        onWindowAction={handleWindowAction}
        onOpenMenu={setOpenMenuId}
        onDispatchCommand={dispatchCommand}
      />

      <WorkspaceRibbon
        sidebarVisible={sidebarVisible}
        rightPanelVisible={rightPanelVisible}
        vaultMode={vaultMode}
        graphOpen={centerGraphOpen}
        onToggleSidebar={() => setSidebarVisible((visible) => !visible)}
        onToggleRightPanel={() => {
          setKnowledgePanelFloating(false);
          setRightPanelVisible((visible) => !visible);
        }}
        onOpenVault={() => dispatchCommand("file.openVault")}
        onOpenQuickOpen={() => setPaletteMode("quickOpen")}
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
        onOpenSearchPanel={() => {
          setSidebarVisible(true);
          setLeftPanelTab("search");
        }}
      />

      {sidebarVisible ? (
        <VaultSidebar
          t={t}
          tab={leftPanelTab}
          vaultMode={vaultMode}
          vaultRoot={vaultRoot}
          vaultTree={vaultTree}
          vaultIndex={vaultIndex}
          vaultError={vaultError}
          vaultRecoveryBlocked={vaultRecoveryBlocked}
          expandedDirs={expandedDirs}
          selectedVaultDir={selectedVaultDir}
          activeFilePath={activeNote.filePath ?? null}
          activeNote={activeNote}
          notes={notes}
          outline={outline}
          onTabChange={setLeftPanelTab}
          onDispatchCommand={dispatchCommand}
          onOpenMarkdownFile={(path) => {
            openMarkdownFile(path).catch((error) => {
              console.error("Failed to open vault file", error);
              setVaultError(t.errors.openVaultFileFailed);
            });
          }}
          onVaultError={setVaultError}
          onVaultDirectoryClick={handleVaultDirectoryClick}
          onRenameVaultEntry={handleRenameVaultEntry}
          onDeleteVaultEntry={handleDeleteVaultEntry}
          onClearVaultState={clearVaultState}
          onOutlineClick={handleOutlineClick}
          onSelectNote={setActiveNoteId}
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
        activeView={centerGraphOpen ? centerView : "markdown"}
        graphTitle={t.knowledge.graph}
        graphChildren={(
          <WorkspaceGraphLeaf
            t={t}
            vaultMode={vaultMode}
            graph={centerGraph}
            tags={vaultTags}
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
      >
        <EditorWorkspace
          t={t}
          activeNote={activeNote}
          hasActiveDocument={hasActiveDocument}
          editorMode={editorMode}
          richCommand={richCommand}
          editorSurfaceRef={editorSurfaceRef}
          plainEditorRef={plainEditorRef}
          onMarkdownChange={handleMarkdownChange}
          onOpenLink={handleEditorLinkOpen}
          wikiLinkSuggestions={wikiLinkSuggestions}
          onCreateWikiLink={handleCreateWikiLinkTarget}
          onImportImages={importImagesForEditor}
          onPlainImageFiles={handlePlainEditorImageFiles}
          imagePreviewMap={imagePreviewMap}
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
          activeIndexedFile={activeIndexedFile}
          activeBacklinks={activeBacklinks}
          activeOutgoingLinks={activeOutgoingLinks}
          activeResolvedLinks={activeResolvedLinks}
          activeUnresolvedLinks={activeUnresolvedLinks}
          activeUnlinkedMentions={activeUnlinkedMentions}
          localGraph={localGraph}
          lineCount={lineCount}
          textStats={textStats}
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
          activeIndexedFile={activeIndexedFile}
          activeBacklinks={activeBacklinks}
          activeOutgoingLinks={activeOutgoingLinks}
          activeResolvedLinks={activeResolvedLinks}
          activeUnresolvedLinks={activeUnresolvedLinks}
          activeUnlinkedMentions={activeUnlinkedMentions}
          localGraph={localGraph}
          lineCount={lineCount}
          textStats={textStats}
          floatingPanelPosition={floatingPanelPosition}
          onTabChange={setKnowledgePanelTab}
          onToggleFloating={() => setKnowledgePanelFloating((floating) => !floating)}
          onFloatingPointerDown={handleFloatingPanelPointerDown}
          onGraphNodeClick={handleGraphNodeClick}
          onSourceLocationClick={handleSourceLocationClick}
          onCreateUnresolvedLink={handleCreateUnresolvedLink}
          onOpenAmbiguousLink={handleOpenAmbiguousLink}
        />
      ) : null}

      <WorkspaceStatusBar
        filePath={activeNote.filePath ?? null}
        dirty={Boolean(activeNote.dirty)}
        editorMode={editorMode}
        vaultRoot={vaultRoot}
        vaultIndexStatus={vaultIndexStatus}
        vaultFileCount={vaultIndex?.files.length ?? 0}
        lineCount={lineCount}
        words={textStats.words}
        characters={textStats.characters}
        resolvedLinks={activeResolvedLinks.length}
        unresolvedLinks={activeUnresolvedLinks.length}
      />

      <CommandPalette
        open={paletteMode !== null}
        mode={paletteMode ?? "quickOpen"}
        title={paletteMode === "command" ? t.palette.commandPalette : t.palette.quickOpen}
        placeholder={paletteMode === "command" ? t.palette.commandPlaceholder : t.palette.quickOpenPlaceholder}
        emptyText={t.palette.noResults}
        vaultIndex={vaultIndex}
        commands={commands}
        onClose={() => setPaletteMode(null)}
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
        sidebarVisible={sidebarVisible}
        rightPanelVisible={rightPanelVisible}
        editorLatinFont={editorLatinFont}
        editorCjkFont={editorCjkFont}
        editorFontSize={editorFontSize}
        editorLineHeight={editorLineHeight}
        uiScale={uiScale}
        zoomWithWheel={zoomWithWheel}
        editorLeftGap={editorLeftGap}
        sidebarWidth={sidebarWidth}
        rightPanelWidth={rightPanelWidth}
        shortcuts={shortcuts}
        shortcutEdits={shortcutEdits}
        shortcutConflicts={shortcutConflicts}
        theme={theme}
        uiDensity={uiDensity}
        defaultSaveExt={defaultSaveExt}
        defaultNewNoteName={defaultNewNoteName}
        vaultRoot={vaultRoot}
        lastOpenedFile={lastOpenedFile}
        onClose={() => setSettingsOpen(false)}
        onSectionChange={setSettingsSection}
        onLanguageChange={setLanguage}
        onDefaultEditorModeChange={setDefaultEditorModeSetting}
        onRestoreWorkspaceChange={setRestoreWorkspace}
        onSidebarVisibleChange={setSidebarVisible}
        onRightPanelVisibleChange={setRightPanelVisible}
        onEditorLatinFontChange={setEditorLatinFont}
        onEditorCjkFontChange={setEditorCjkFont}
        onEditorFontSizeChange={setEditorFontSize}
        onEditorLineHeightChange={setEditorLineHeight}
        onUiScaleChange={(value) => setUiScale(clampUiScale(value))}
        onZoomWithWheelChange={setZoomWithWheel}
        onEditorLeftGapChange={(value) => setEditorLeftGap(clampEditorLeftGap(value))}
        onSidebarWidthChange={(value) => setSidebarWidth(clampSidebarWidth(value))}
        onRightPanelWidthChange={(value) => setRightPanelWidth(clampRightPanelWidth(value))}
        onResetEditorLayout={() => {
          const defaults = resetEditorLayoutDefaults();
          setEditorLatinFont(defaults.editorLatinFont);
          setEditorCjkFont(defaults.editorCjkFont);
          setEditorFontSize(defaults.editorFontSize);
          setEditorLineHeight(defaults.editorLineHeight);
          setEditorLeftGap(defaults.editorLeftGap);
          setUiScale(defaults.uiScale);
          setSidebarWidth(defaults.sidebarWidth);
          setRightPanelWidth(defaults.rightPanelWidth);
        }}
        onShortcutEditChange={(shortcutId, value) => setShortcutEdits((current) => ({ ...current, [shortcutId]: value }))}
        onShortcutInputBlur={handleShortcutInputBlur}
        onShortcutRestore={handleShortcutRestore}
        onShortcutRestoreAll={handleShortcutRestoreAll}
        onShortcutEnabledChange={updateShortcutEnabled}
        onThemeCommand={dispatchCommand}
        onUiDensityChange={setUiDensity}
        onDefaultSaveExtChange={setDefaultSaveExt}
        onDefaultNewNoteNameChange={setDefaultNewNoteName}
        onDefaultNewNoteNameBlur={() => setDefaultNewNoteName((current) => normalizeDefaultNewNoteName(current))}
        onClearVaultState={clearVaultState}
      />

      {toastMessage ? (
        <div className="app-toast" role="status" aria-live="polite">
          {toastMessage}
        </div>
      ) : null}
    </div>
  );
}
