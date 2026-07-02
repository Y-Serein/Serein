import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { Clipboard, Copy, Pin, PinOff, Save, Scissors, Type, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import {
  getCurrentWindow,
  monitorFromPoint,
  PhysicalPosition,
  PhysicalSize,
  primaryMonitor,
} from "@tauri-apps/api/window";
import { save } from "@tauri-apps/plugin-dialog";

const SETTINGS_STORAGE_KEY = "serein.settings.v1";
const LEGACY_SETTINGS_STORAGE_KEY = "ys-writer.settings.v1";
const QUICK_NOTE_SURFACE_STORAGE_KEY = "serein.quickNote.surface.v1";
const QUICK_NOTE_MIN_WIDTH = 280;
const QUICK_NOTE_MIN_HEIGHT = 240;
const QUICK_NOTE_MAX_WIDTH = 1200;
const QUICK_NOTE_MAX_HEIGHT = 1200;
const QUICK_NOTE_DEFAULT_WIDTH = 340;
const QUICK_NOTE_DEFAULT_HEIGHT = 360;
const QUICK_NOTE_FILE_STEM_MAX_LENGTH = 72;
const QUICK_NOTE_MAX_POSITION = 100000;
const QUICK_NOTE_CASCADE_BASE_SLOTS = 5;
const QUICK_NOTE_CASCADE_LAYERS = 3;
const QUICK_NOTE_CASCADE_SLOTS = QUICK_NOTE_CASCADE_BASE_SLOTS * QUICK_NOTE_CASCADE_LAYERS;
const QUICK_NOTE_CASCADE_X_STEP = 24;
const QUICK_NOTE_CASCADE_Y_STEP = 22;
const QUICK_NOTE_CASCADE_LAYER_X_STEP = 12;
const QUICK_NOTE_CASCADE_LAYER_Y_STEP = 8;
const QUICK_NOTE_DEFAULT_TOP_MARGIN = 28;
const QUICK_NOTE_DEFAULT_LEFT_MARGIN = 34;
const QUICK_NOTE_SURFACE_PERSIST_READY_DELAY_MS = 240;
const MIN_UI_SCALE = 85;
const MAX_UI_SCALE = 130;

type QuickNoteStatus = "draft" | "saving" | "saved" | "error";
type QuickNoteLanguage = "zh-CN" | "en-US";
type QuickNoteTheme = "daily" | "eye" | "ink" | "mint" | "v5" | "v6";
type SaveFileExt = "md" | "txt";
type QuickNoteTimestamp = ReturnType<typeof quickNoteTimestamp>;
type QuickNoteTextCommand = "cut" | "copy" | "paste" | "selectAll";
type QuickNoteTextControl = HTMLInputElement | HTMLTextAreaElement;
type QuickNoteSettings = {
  theme: QuickNoteTheme;
  language: QuickNoteLanguage;
  uiScale: number;
  quickNoteSaveExt: SaveFileExt;
};
type QuickNoteContextMenuItem = {
  id: string;
  label: string;
  icon: "cut" | "copy" | "paste" | "text" | "save";
  disabled?: boolean;
  separatorBefore?: boolean;
  onSelect: () => void;
};
type QuickNoteSurfaceState = {
  width: number;
  height: number;
  x?: number;
  y?: number;
};
type QuickNoteContextMenuState = {
  x: number;
  y: number;
};

const defaultQuickNoteSettings: QuickNoteSettings = {
  theme: "mint",
  language: "zh-CN",
  uiScale: 100,
  quickNoteSaveExt: "md",
};

const quickNoteText = {
  "zh-CN": {
    commandLabels: {
      cut: "剪切",
      copy: "复制",
      paste: "粘贴",
      selectAll: "全选",
    },
    status: {
      quickNoteSaved: (path: string) => `快捷便签已保存：${path}`,
      quickNoteEmpty: "快捷便签为空，未保存。",
      quickNoteSaveFailed: "快捷便签保存失败。",
      quickNotePinFailed: "快捷便签固定失败",
    },
    quickNote: {
      title: "快捷便签",
      standaloneHint: "保存时选择位置。",
      placeholder: "写下这一条...",
      titlePlaceholder: "标题（可选）",
      unsavedChanges: "有未保存修改。",
      save: "保存",
      saving: "保存中",
      pin: "固定",
      unpin: "取消固定",
      pinned: "已固定到屏幕。",
      unpinned: "已取消固定。",
      close: "关闭",
      closeConfirmTitle: "当前有编辑内容",
      closeConfirmMessage: "是否直接关闭？关闭后不会自动保存这条便签。",
      closeConfirmCancel: "取消",
      closeConfirmDiscard: "直接关闭",
    },
  },
  "en-US": {
    commandLabels: {
      cut: "Cut",
      copy: "Copy",
      paste: "Paste",
      selectAll: "Select all",
    },
    status: {
      quickNoteSaved: (path: string) => `Quick note saved: ${path}`,
      quickNoteEmpty: "Quick note is empty; nothing was saved.",
      quickNoteSaveFailed: "Failed to save quick note.",
      quickNotePinFailed: "Failed to pin quick note",
    },
    quickNote: {
      title: "Quick note",
      standaloneHint: "Choose where to save when you save.",
      placeholder: "Write this down...",
      titlePlaceholder: "Title (optional)",
      unsavedChanges: "Unsaved changes.",
      save: "Save",
      saving: "Saving",
      pin: "Pin",
      unpin: "Unpin",
      pinned: "Pinned to screen.",
      unpinned: "Unpinned.",
      close: "Close",
      closeConfirmTitle: "Current note has edits",
      closeConfirmMessage: "Close directly? This quick note will not be saved automatically.",
      closeConfirmCancel: "Cancel",
      closeConfirmDiscard: "Close",
    },
  },
} satisfies Record<QuickNoteLanguage, {
  commandLabels: Record<"cut" | "copy" | "paste" | "selectAll", string>;
  status: {
    quickNoteSaved: (path: string) => string;
    quickNoteEmpty: string;
    quickNoteSaveFailed: string;
    quickNotePinFailed: string;
  };
  quickNote: Record<
    | "title"
    | "standaloneHint"
    | "placeholder"
    | "titlePlaceholder"
    | "unsavedChanges"
    | "save"
    | "saving"
    | "pin"
    | "unpin"
    | "pinned"
    | "unpinned"
    | "close"
    | "closeConfirmTitle"
    | "closeConfirmMessage"
    | "closeConfirmCancel"
    | "closeConfirmDiscard",
    string
  >;
}>;

function isTauriRuntime() {
  return Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

function isQuickNoteLanguage(value: unknown): value is QuickNoteLanguage {
  return value === "zh-CN" || value === "en-US";
}

function isQuickNoteTheme(value: unknown): value is QuickNoteTheme {
  return value === "daily"
    || value === "eye"
    || value === "ink"
    || value === "mint"
    || value === "v5"
    || value === "v6";
}

function clampQuickNoteUiScale(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, value))
    : defaultQuickNoteSettings.uiScale;
}

function readQuickNoteSettings(): QuickNoteSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
      ?? window.localStorage.getItem(LEGACY_SETTINGS_STORAGE_KEY);
    if (!raw) return defaultQuickNoteSettings;
    const parsed = JSON.parse(raw) as Partial<QuickNoteSettings>;
    return {
      theme: isQuickNoteTheme(parsed.theme) ? parsed.theme : defaultQuickNoteSettings.theme,
      language: isQuickNoteLanguage(parsed.language)
        ? parsed.language
        : defaultQuickNoteSettings.language,
      uiScale: clampQuickNoteUiScale(parsed.uiScale),
      quickNoteSaveExt: parsed.quickNoteSaveExt === "txt" ? "txt" : "md",
    };
  } catch {
    return defaultQuickNoteSettings;
  }
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function quickNoteTimestamp(date = new Date()) {
  const year = date.getFullYear();
  const month = padDatePart(date.getMonth() + 1);
  const day = padDatePart(date.getDate());
  const hours = padDatePart(date.getHours());
  const minutes = padDatePart(date.getMinutes());
  const seconds = padDatePart(date.getSeconds());
  return {
    title: `${year}-${month}-${day} ${hours}:${minutes}`,
    file: `${year}-${month}-${day} ${hours}-${minutes}-${seconds}`,
  };
}

function quickNoteMarkdown(title: string, content: string, timestamp = quickNoteTimestamp()) {
  const cleanTitle = title.trim() || `Quick Note ${timestamp.title}`;
  const cleanContent = content.trim();
  return cleanContent ? `# ${cleanTitle}\n\n${cleanContent}\n` : `# ${cleanTitle}\n`;
}

function readableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 160 ? `${message.slice(0, 157)}...` : message;
}

function cleanQuickNoteFileStem(title: string, timestamp: QuickNoteTimestamp) {
  const cleaned = (title.trim() || `Quick Note ${timestamp.title}`)
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || `Quick Note ${timestamp.file}`).slice(0, QUICK_NOTE_FILE_STEM_MAX_LENGTH).trim();
}

function ensureQuickNoteSaveExtension(path: string, defaultExt: SaveFileExt) {
  if (/\.(md|markdown|txt)$/i.test(path)) return path;
  return `${path}.${defaultExt}`;
}

function quickNoteContextMenuPosition(event: { clientX: number; clientY: number }) {
  return {
    x: Math.min(event.clientX, Math.max(12, window.innerWidth - 228)),
    y: Math.min(event.clientY, Math.max(12, window.innerHeight - 252)),
  };
}

function readQuickNoteCascadeIndex() {
  const value = new URLSearchParams(window.location.search).get("cascade");
  const parsed = value ? Number.parseInt(value, 10) : 0;
  return Number.isInteger(parsed) && parsed >= 0 ? parsed % QUICK_NOTE_CASCADE_SLOTS : 0;
}

function clampQuickNotePositionValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

async function cascadeQuickNotePosition(value: QuickNoteSurfaceState, cascadeIndex: number) {
  if (!hasQuickNotePosition(value)) return null;
  const baseSlot = cascadeIndex % QUICK_NOTE_CASCADE_BASE_SLOTS;
  const layer = Math.floor(cascadeIndex / QUICK_NOTE_CASCADE_BASE_SLOTS);
  let x = value.x + baseSlot * QUICK_NOTE_CASCADE_X_STEP + layer * QUICK_NOTE_CASCADE_LAYER_X_STEP;
  let y = value.y + baseSlot * QUICK_NOTE_CASCADE_Y_STEP + layer * QUICK_NOTE_CASCADE_LAYER_Y_STEP;

  try {
    const monitor = await monitorFromPoint(x, y) ?? await primaryMonitor();
    if (monitor) {
      const margin = 8;
      const workArea = monitor.workArea;
      const minX = workArea.position.x + margin;
      const minY = workArea.position.y + margin;
      const maxX = workArea.position.x + workArea.size.width - value.width - margin;
      const maxY = workArea.position.y + workArea.size.height - value.height - margin;
      x = clampQuickNotePositionValue(x, minX, maxX);
      y = clampQuickNotePositionValue(y, minY, maxY);
    }
  } catch {
    // Best-effort clamp; keep the existing cascade if monitor APIs are unavailable.
  }

  return new PhysicalPosition(Math.round(x), Math.round(y));
}

async function defaultQuickNoteSurfaceState(width: number, height: number): Promise<QuickNoteSurfaceState> {
  try {
    const monitor = await primaryMonitor();
    if (monitor) {
      const workArea = monitor.workArea;
      return {
        width,
        height,
        x: workArea.position.x + QUICK_NOTE_DEFAULT_LEFT_MARGIN,
        y: workArea.position.y + QUICK_NOTE_DEFAULT_TOP_MARGIN,
      };
    }
  } catch {
    // Fall through to OS placement if monitor information is unavailable.
  }

  return { width, height };
}

function quickNoteTextControlFromTarget(target: EventTarget | null): QuickNoteTextControl | null {
  if (!(target instanceof HTMLElement)) return null;
  const control = target.closest("input, textarea");
  if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) return control;
  return null;
}

function textControlSelection(control: QuickNoteTextControl) {
  const start = control.selectionStart ?? control.value.length;
  const end = control.selectionEnd ?? start;
  return { start, end };
}

function isReasonableSurfaceSize(value: unknown): value is QuickNoteSurfaceState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<QuickNoteSurfaceState>;
  const hasPosition = candidate.x !== undefined || candidate.y !== undefined;
  const validPosition = !hasPosition
    || (
      typeof candidate.x === "number"
      && typeof candidate.y === "number"
      && Number.isFinite(candidate.x)
      && Number.isFinite(candidate.y)
      && Math.abs(candidate.x) <= QUICK_NOTE_MAX_POSITION
      && Math.abs(candidate.y) <= QUICK_NOTE_MAX_POSITION
    );
  return typeof candidate.width === "number"
    && typeof candidate.height === "number"
    && Number.isFinite(candidate.width)
    && Number.isFinite(candidate.height)
    && candidate.width >= QUICK_NOTE_MIN_WIDTH
    && candidate.height >= QUICK_NOTE_MIN_HEIGHT
    && candidate.width <= QUICK_NOTE_MAX_WIDTH
    && candidate.height <= QUICK_NOTE_MAX_HEIGHT
    && validPosition;
}

function hasQuickNotePosition(value: QuickNoteSurfaceState): value is QuickNoteSurfaceState & { x: number; y: number } {
  return typeof value.x === "number" && typeof value.y === "number";
}

function readQuickNoteSurfaceState() {
  try {
    const raw = window.localStorage.getItem(QUICK_NOTE_SURFACE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isReasonableSurfaceSize(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeQuickNoteSurfaceState(size: QuickNoteSurfaceState) {
  if (!isReasonableSurfaceSize(size)) return;
  const nextState: QuickNoteSurfaceState = {
    width: Math.round(size.width),
    height: Math.round(size.height),
  };
  if (hasQuickNotePosition(size)) {
    nextState.x = Math.round(size.x);
    nextState.y = Math.round(size.y);
  }
  window.localStorage.setItem(QUICK_NOTE_SURFACE_STORAGE_KEY, JSON.stringify(nextState));
}

async function persistCurrentWindowSurface() {
  if (!isTauriRuntime()) return;
  const currentWindow = getCurrentWindow();
  const [position, size] = await Promise.all([
    currentWindow.outerPosition(),
    currentWindow.outerSize(),
  ]);
  writeQuickNoteSurfaceState({
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
  });
}

async function readDesktopClipboardText() {
  if (!isTauriRuntime()) return "";
  try {
    return await invoke<string>("desktop_read_clipboard_text");
  } catch {
    return "";
  }
}

function writeDesktopClipboardText(text: string) {
  if (!text || !isTauriRuntime()) return;
  invoke<void>("desktop_write_clipboard_text", { text }).catch(() => undefined);
}

function writeQuickNoteFile(path: string, content: string) {
  return invoke("write_markdown_file", {
    path,
    content,
    expectedModifiedAtMs: null,
    expectedSize: null,
  });
}

const quickNoteContextMenuIcons = {
  cut: Scissors,
  copy: Copy,
  paste: Clipboard,
  text: Type,
  save: Save,
} satisfies Record<QuickNoteContextMenuItem["icon"], typeof Save>;

function QuickNoteContextMenu({ x, y, items, onClose }: {
  x: number;
  y: number;
  items: QuickNoteContextMenuItem[];
  onClose: () => void;
}) {
  return (
    <div className="context-menu-layer" onMouseDown={onClose} onContextMenu={(event) => event.preventDefault()}>
      <div
        className="app-context-menu"
        role="menu"
        style={{ "--context-x": `${x}px`, "--context-y": `${y}px` } as CSSProperties}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        {items.map((item) => {
          const Icon = quickNoteContextMenuIcons[item.icon];
          return (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={`${item.separatorBefore ? "separated" : ""}`.trim()}
              disabled={item.disabled}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                if (item.disabled) return;
                item.onSelect();
                onClose();
              }}
            >
              <span className="context-menu-icon"><Icon size={14} /></span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function QuickNoteWindow() {
  const settings = useMemo(() => readQuickNoteSettings(), []);
  const cascadeIndex = useMemo(() => readQuickNoteCascadeIndex(), []);
  const shouldPersistSurface = cascadeIndex === 0;
  const surfacePersistenceReadyRef = useRef(false);
  const t = quickNoteText[settings.language];
  const titleRef = useRef<HTMLInputElement | null>(null);
  const contentRef = useRef<HTMLTextAreaElement | null>(null);
  const activeTextControlRef = useRef<QuickNoteTextControl | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<QuickNoteStatus>("draft");
  const [message, setMessage] = useState<string>(t.quickNote.standaloneHint);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [savedTimestamp, setSavedTimestamp] = useState<QuickNoteTimestamp | null>(null);
  const [pinned, setPinned] = useState(false);
  const [contextMenu, setContextMenu] = useState<QuickNoteContextMenuState | null>(null);
  const [closePromptOpen, setClosePromptOpen] = useState(false);

  const prepareAndShow = useCallback(async (nextCascadeIndex: number) => {
    if (!isTauriRuntime()) {
      titleRef.current?.focus();
      return;
    }

    const currentWindow = getCurrentWindow();
    const savedSurface = readQuickNoteSurfaceState();
    const surface = savedSurface ?? await defaultQuickNoteSurfaceState(
      QUICK_NOTE_DEFAULT_WIDTH,
      QUICK_NOTE_DEFAULT_HEIGHT,
    );
    await currentWindow.setSize(new PhysicalSize(surface.width, surface.height));
    if (hasQuickNotePosition(surface)) {
      const nextPosition = await cascadeQuickNotePosition(surface, nextCascadeIndex);
      if (nextPosition) {
        await currentWindow.setPosition(nextPosition);
      }
    }
    await currentWindow.setAlwaysOnTop(false);

    const focusQuickNote = (shouldLog = false) => {
      currentWindow.unminimize().catch((error) => {
        if (shouldLog) console.warn("Failed to unminimize quick note window", error);
      });
      currentWindow.setFocus().catch((error) => {
        if (shouldLog) console.warn("Failed to focus quick note window", error);
      });
      titleRef.current?.focus({ preventScroll: true });
    };

    await currentWindow.show();
    focusQuickNote(true);
    window.requestAnimationFrame(() => {
      currentWindow.show().catch(() => undefined);
      focusQuickNote();
    });
    [90, 220, 420].forEach((delay) => {
      window.setTimeout(() => {
        currentWindow.show().catch(() => undefined);
        focusQuickNote();
      }, delay);
    });
    window.setTimeout(() => {
      surfacePersistenceReadyRef.current = true;
    }, QUICK_NOTE_SURFACE_PERSIST_READY_DELAY_MS);
  }, []);

  useEffect(() => {
    document.body.classList.add("quick-note-body");
    return () => document.body.classList.remove("quick-note-body");
  }, []);

  useEffect(() => {
    void prepareAndShow(cascadeIndex).catch((error) => {
      console.warn("Failed to prepare quick note window", error);
    });
  }, [cascadeIndex, prepareAndShow]);

  useEffect(() => {
    if (!isTauriRuntime() || !shouldPersistSurface) return undefined;

    let surfaceTimer = 0;
    let disposed = false;
    let unlistenResize: (() => void) | null = null;
    let unlistenMove: (() => void) | null = null;
    const currentWindow = getCurrentWindow();
    const schedulePersistSurface = () => {
      if (!surfacePersistenceReadyRef.current) return;
      if (surfaceTimer) window.clearTimeout(surfaceTimer);
      surfaceTimer = window.setTimeout(() => {
        void persistCurrentWindowSurface().catch((error) => {
          console.warn("Failed to persist quick note surface", error);
        });
      }, 160);
    };

    currentWindow.onResized(() => {
      schedulePersistSurface();
    }).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten();
        return;
      }
      unlistenResize = nextUnlisten;
    }).catch((error) => {
      console.warn("Failed to listen for quick note resize", error);
    });

    currentWindow.onMoved(() => {
      schedulePersistSurface();
    }).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten();
        return;
      }
      unlistenMove = nextUnlisten;
    }).catch((error) => {
      console.warn("Failed to listen for quick note move", error);
    });

    return () => {
      disposed = true;
      if (surfaceTimer) window.clearTimeout(surfaceTimer);
      unlistenResize?.();
      unlistenMove?.();
      if (surfacePersistenceReadyRef.current) {
        void persistCurrentWindowSurface().catch((error) => {
          console.warn("Failed to persist quick note surface", error);
        });
      }
    };
  }, [shouldPersistSurface]);

  const markDirty = useCallback(() => {
    setStatus("draft");
    setMessage(savedPath ? t.quickNote.unsavedChanges : t.quickNote.standaloneHint);
  }, [savedPath, t.quickNote.standaloneHint, t.quickNote.unsavedChanges]);

  const saveQuickNote = useCallback(async () => {
    const hasDraft = Boolean(title.trim() || content.trim());
    if (!hasDraft) {
      setStatus("error");
      setMessage(t.status.quickNoteEmpty);
      return false;
    }

    setStatus("saving");
    setMessage(t.quickNote.saving);

    try {
      const timestamp = savedTimestamp ?? quickNoteTimestamp();
      const fallbackName = `${cleanQuickNoteFileStem(title, timestamp)}.${settings.quickNoteSaveExt}`;
      const selected = await save({
        defaultPath: savedPath ?? fallbackName,
        filters: [{ name: "Markdown/Text", extensions: ["md", "markdown", "txt"] }],
      });

      if (!selected) {
        setStatus("draft");
        setMessage(savedPath ? t.quickNote.unsavedChanges : t.quickNote.standaloneHint);
        return false;
      }

      const path = ensureQuickNoteSaveExtension(selected, settings.quickNoteSaveExt);
      await writeQuickNoteFile(path, quickNoteMarkdown(title, content, timestamp));
      setSavedPath(path);
      setSavedTimestamp(timestamp);
      setStatus("saved");
      setMessage(t.status.quickNoteSaved(path));
      return true;
    } catch (error) {
      setStatus("error");
      setMessage(`${t.status.quickNoteSaveFailed}: ${readableError(error)}`);
      return false;
    }
  }, [
    content,
    savedPath,
    savedTimestamp,
    settings.quickNoteSaveExt,
    t.quickNote.saving,
    t.quickNote.standaloneHint,
    t.quickNote.unsavedChanges,
    t.status.quickNoteEmpty,
    t.status.quickNoteSaveFailed,
    t.status.quickNoteSaved,
    title,
  ]);

  const replaceTextControlSelection = useCallback((control: QuickNoteTextControl, text: string) => {
    const { start, end } = textControlSelection(control);
    const nextValue = `${control.value.slice(0, start)}${text}${control.value.slice(end)}`;
    const cursor = start + text.length;

    if (control === titleRef.current) {
      setTitle(nextValue);
    } else {
      setContent(nextValue);
    }
    markDirty();

    window.requestAnimationFrame(() => {
      control.focus();
      control.setSelectionRange(cursor, cursor);
    });
  }, [markDirty]);

  const runTextCommand = useCallback((command: QuickNoteTextCommand) => {
    const control = activeTextControlRef.current;
    if (!control || !document.contains(control)) return;
    control.focus();

    if (command === "selectAll") {
      control.select();
      return;
    }

    const { start, end } = textControlSelection(control);
    if (command === "copy" || command === "cut") {
      if (start === end) return;
      writeDesktopClipboardText(control.value.slice(start, end));
      if (command === "cut") replaceTextControlSelection(control, "");
      return;
    }

    readDesktopClipboardText().then((text) => {
      if (text) replaceTextControlSelection(control, text);
    });
  }, [replaceTextControlSelection]);

  const closeWindow = useCallback(async () => {
    if (isTauriRuntime()) {
      const currentWindow = getCurrentWindow();
      await currentWindow.close().catch((error) => {
        console.warn("Failed to close quick note window", error);
      });
    }
  }, []);

  const handleClose = useCallback(async () => {
    if (status === "saving") return;
    if ((title.trim() || content.trim()) && status !== "saved") {
      setContextMenu(null);
      setClosePromptOpen(true);
      return;
    }
    await closeWindow();
  }, [closeWindow, content, status, title]);

  const cancelClosePrompt = useCallback(() => {
    setClosePromptOpen(false);
  }, []);

  const closeWithoutSaving = useCallback(() => {
    setClosePromptOpen(false);
    void closeWindow();
  }, [closeWindow]);

  const togglePinned = useCallback(async () => {
    const nextPinned = !pinned;
    setPinned(nextPinned);
    try {
      if (isTauriRuntime()) {
        await getCurrentWindow().setAlwaysOnTop(nextPinned);
      }
      setMessage(nextPinned ? t.quickNote.pinned : t.quickNote.unpinned);
    } catch (error) {
      setPinned(!nextPinned);
      setStatus("error");
      setMessage(`${t.status.quickNotePinFailed}: ${readableError(error)}`);
    }
  }, [pinned, t.quickNote.pinned, t.quickNote.unpinned, t.status.quickNotePinFailed]);

  const handleDrag = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("button,input,textarea")) return;
    if (!isTauriRuntime()) return;
    getCurrentWindow().startDragging().catch(() => undefined);
  }, []);

  const handleContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    activeTextControlRef.current = quickNoteTextControlFromTarget(event.target);
    setContextMenu(quickNoteContextMenuPosition(event));
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const contextMenuItems = useMemo<QuickNoteContextMenuItem[]>(() => {
    const control = activeTextControlRef.current;
    const hasControl = Boolean(control && document.contains(control));
    const selection = hasControl && control ? textControlSelection(control) : { start: 0, end: 0 };
    const hasSelection = selection.start !== selection.end;

    return [
      {
        id: "edit.cut",
        label: t.commandLabels.cut,
        icon: "cut",
        disabled: !hasControl || !hasSelection || status === "saving",
        onSelect: () => runTextCommand("cut"),
      },
      {
        id: "edit.copy",
        label: t.commandLabels.copy,
        icon: "copy",
        disabled: !hasControl || !hasSelection,
        onSelect: () => runTextCommand("copy"),
      },
      {
        id: "edit.paste",
        label: t.commandLabels.paste,
        icon: "paste",
        disabled: !hasControl || status === "saving",
        onSelect: () => runTextCommand("paste"),
      },
      {
        id: "edit.selectAll",
        label: t.commandLabels.selectAll,
        icon: "text",
        disabled: !hasControl,
        onSelect: () => runTextCommand("selectAll"),
      },
      {
        id: "quickNote.save",
        label: t.quickNote.save,
        icon: "save",
        separatorBefore: true,
        disabled: status === "saving",
        onSelect: () => {
          void saveQuickNote();
        },
      },
    ];
  }, [runTextCommand, saveQuickNote, status, t.commandLabels, t.quickNote.save]);

  return (
    <section
      className="quick-note-window-shell"
      data-theme={settings.theme}
      data-status={status}
      data-pinned={pinned ? "true" : "false"}
      style={{ "--ui-scale": String(settings.uiScale / 100) } as CSSProperties}
      aria-label={t.quickNote.title}
      onContextMenu={handleContextMenu}
    >
      <header className="quick-note-window-titlebar" onMouseDown={handleDrag}>
        <div className="quick-note-window-brand">
          <span className="serein-brand-mark" aria-hidden="true">Sy</span>
          <strong>{t.quickNote.title}</strong>
        </div>
        <div className="quick-note-window-controls">
          <button
            type="button"
            className={pinned ? "active" : ""}
            title={pinned ? t.quickNote.unpin : t.quickNote.pin}
            aria-label={pinned ? t.quickNote.unpin : t.quickNote.pin}
            aria-pressed={pinned}
            disabled={status === "saving"}
            onClick={() => {
              void togglePinned();
            }}
          >
            {pinned ? <PinOff size={14} aria-hidden="true" /> : <Pin size={14} aria-hidden="true" />}
          </button>
          <button
            type="button"
            title={t.quickNote.save}
            aria-label={t.quickNote.save}
            disabled={status === "saving"}
            onClick={() => {
              void saveQuickNote();
            }}
          >
            <Save size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            title={t.quickNote.close}
            aria-label={t.quickNote.close}
            disabled={status === "saving"}
            onClick={() => {
              void handleClose();
            }}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      </header>

      <main className="quick-note-window-editor">
        <input
          ref={titleRef}
          value={title}
          placeholder={t.quickNote.titlePlaceholder}
          onChange={(event) => {
            setTitle(event.target.value);
            markDirty();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "ArrowDown") {
              event.preventDefault();
              contentRef.current?.focus();
            }
          }}
        />
        <textarea
          ref={contentRef}
          value={content}
          placeholder={t.quickNote.placeholder}
          onChange={(event) => {
            setContent(event.target.value);
            markDirty();
          }}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              void saveQuickNote();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              void handleClose();
            }
          }}
        />
      </main>

      <footer className="quick-note-window-status">
        <span>{message}</span>
      </footer>

      {closePromptOpen ? (
        <div
          className="quick-note-close-prompt-layer"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) cancelClosePrompt();
          }}
        >
          <div
            className="quick-note-close-prompt"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-note-close-prompt-title"
            aria-describedby="quick-note-close-prompt-message"
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
          >
            <strong id="quick-note-close-prompt-title">{t.quickNote.closeConfirmTitle}</strong>
            <p id="quick-note-close-prompt-message">{t.quickNote.closeConfirmMessage}</p>
            <div className="quick-note-close-prompt-actions">
              <button type="button" autoFocus onClick={cancelClosePrompt}>
                {t.quickNote.closeConfirmCancel}
              </button>
              <button type="button" className="danger" onClick={closeWithoutSaving}>
                {t.quickNote.closeConfirmDiscard}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {contextMenu ? (
        <QuickNoteContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={closeContextMenu}
        />
      ) : null}
    </section>
  );
}
