import { create } from "zustand";
import { readShortcuts } from "../../command/shortcuts";
import type { ShortcutEntry } from "../../command/shortcuts";
import type { EditorCommandSignal, Note } from "../../domain/model";
import { readSettings } from "../../settings/storage";
import type {
  AppSettings,
  EditorMode,
  SaveFileExt,
  SaveStatus,
  SettingsSection,
  ThemeStyle,
  UIDensity,
  VaultTreeEntry,
  VaultWorkspaceState,
  WindowState,
} from "../types";
import { createEmptyNote, mergeWorkspaceState } from "../../vault/workspace";
import type { VaultIndex } from "../../vault";

type Updater<T> = T | ((current: T) => T);

export type LeftPanelTab = "files" | "search" | "outline";
export type KnowledgePanelTab = "backlinks" | "outgoing" | "properties" | "graph" | "tags";
export type VaultIndexStatus = "idle" | "indexing" | "ready" | "error";

export type AppDialog = {
  id: number;
  kind: "input" | "confirm" | "alert" | "choice";
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  choices?: Array<{ value: string; label: string; description?: string }>;
  rememberLabel?: string;
};

export type AppDialogChoiceResult = {
  choice: string;
  remember: boolean;
};

export type AppDialogResult = string | boolean | AppDialogChoiceResult | null;

type AppStoreState = {
  initialSettings: AppSettings;
  initialShortcuts: ShortcutEntry[];

  notes: Note[];
  activeNoteId: string;
  savedAt: Date | null;
  saveError: string | null;
  saveStatus: SaveStatus;
  editorMode: EditorMode;
  editorCommand: EditorCommandSignal | null;

  language: AppSettings["language"];
  theme: ThemeStyle;
  uiDensity: UIDensity;
  sidebarWidth: number;
  sidebarVisible: boolean;
  rightPanelVisible: boolean;
  rightPanelWidth: number;
  leftPanelTab: LeftPanelTab;
  knowledgePanelTab: KnowledgePanelTab;
  knowledgePanelFloating: boolean;
  floatingPanelPosition: { x: number; y: number };

  vaultRoot: string | null;
  vaultTree: VaultTreeEntry | null;
  vaultError: string | null;
  vaultIndex: VaultIndex | null;
  vaultIndexStatus: VaultIndexStatus;
  vaultIndexError: string | null;
  selectedVaultDir: string;
  lastOpenedFile: string | null;
  vaultRecoveryBlocked: boolean;
  expandedDirs: Set<string>;
  vaultWorkspace: VaultWorkspaceState;

  defaultEditorModeSetting: EditorMode;
  restoreWorkspace: boolean;
  restoreWindowState: boolean;
  windowState: WindowState | null;
  editorLatinFont: string;
  editorCjkFont: string;
  editorFontSize: number;
  editorLineHeight: number;
  editorLeftGap: number;
  uiScale: number;
  zoomWithWheel: boolean;
  showEditorStatusOverlay: boolean;
  tagFeaturesEnabled: boolean;
  showFrontmatterTagRow: boolean;
  defaultSaveExt: SaveFileExt;
  quickNoteSaveExt: SaveFileExt;
  quickNoteShowInTaskbar: boolean;
  closeButtonBehavior: AppSettings["closeButtonBehavior"];
  defaultNewNoteName: string;
  imageAttachmentFolder: string;
  imagePathStyle: AppSettings["imagePathStyle"];
  showImageSourceOnFocus: boolean;
  normalizeWindowsImagePaths: boolean;

  settingsOpen: boolean;
  settingsSection: SettingsSection;
  appDialog: AppDialog | null;
  appDialogInput: string;
  openMenuId: string | null;
  shortcuts: ShortcutEntry[];
  shortcutEdits: Record<string, string>;
};

type AppStoreActions = {
  setNotes: (value: Updater<Note[]>) => void;
  setActiveNoteId: (value: string) => void;
  setSavedAt: (value: Date | null) => void;
  setSaveError: (value: string | null) => void;
  setSaveStatus: (value: SaveStatus) => void;
  setEditorMode: (value: EditorMode) => void;
  setEditorCommand: (value: EditorCommandSignal | null) => void;
  setLanguage: (value: AppSettings["language"]) => void;
  setTheme: (value: ThemeStyle) => void;
  setUiDensity: (value: UIDensity) => void;
  setSidebarWidth: (value: Updater<number>) => void;
  setSidebarVisible: (value: Updater<boolean>) => void;
  setRightPanelVisible: (value: Updater<boolean>) => void;
  setRightPanelWidth: (value: Updater<number>) => void;
  setLeftPanelTab: (value: LeftPanelTab) => void;
  setKnowledgePanelTab: (value: KnowledgePanelTab) => void;
  setKnowledgePanelFloating: (value: Updater<boolean>) => void;
  setFloatingPanelPosition: (value: Updater<{ x: number; y: number }>) => void;
  setVaultRoot: (value: string | null) => void;
  setVaultTree: (value: Updater<VaultTreeEntry | null>) => void;
  setVaultError: (value: string | null) => void;
  setVaultIndex: (value: Updater<VaultIndex | null>) => void;
  setVaultIndexStatus: (value: VaultIndexStatus) => void;
  setVaultIndexError: (value: string | null) => void;
  setSelectedVaultDir: (value: string) => void;
  setLastOpenedFile: (value: string | null) => void;
  setVaultRecoveryBlocked: (value: boolean) => void;
  setExpandedDirs: (value: Updater<Set<string>>) => void;
  setVaultWorkspace: (value: Updater<VaultWorkspaceState>) => void;
  setDefaultEditorModeSetting: (value: EditorMode) => void;
  setRestoreWorkspace: (value: boolean) => void;
  setRestoreWindowState: (value: boolean) => void;
  setWindowState: (value: WindowState | null) => void;
  setEditorLatinFont: (value: string) => void;
  setEditorCjkFont: (value: string) => void;
  setEditorFontSize: (value: number) => void;
  setEditorLineHeight: (value: number) => void;
  setEditorLeftGap: (value: number) => void;
  setUiScale: (value: Updater<number>) => void;
  setZoomWithWheel: (value: boolean) => void;
  setShowEditorStatusOverlay: (value: boolean) => void;
  setTagFeaturesEnabled: (value: boolean) => void;
  setShowFrontmatterTagRow: (value: boolean) => void;
  setDefaultSaveExt: (value: SaveFileExt) => void;
  setQuickNoteSaveExt: (value: SaveFileExt) => void;
  setQuickNoteShowInTaskbar: (value: boolean) => void;
  setCloseButtonBehavior: (value: AppSettings["closeButtonBehavior"]) => void;
  setDefaultNewNoteName: (value: Updater<string>) => void;
  setImageAttachmentFolder: (value: Updater<string>) => void;
  setImagePathStyle: (value: AppSettings["imagePathStyle"]) => void;
  setShowImageSourceOnFocus: (value: boolean) => void;
  setNormalizeWindowsImagePaths: (value: boolean) => void;
  setSettingsOpen: (value: boolean) => void;
  setSettingsSection: (value: SettingsSection) => void;
  setAppDialog: (value: AppDialog | null) => void;
  setAppDialogInput: (value: string) => void;
  setOpenMenuId: (value: Updater<string | null>) => void;
  setShortcuts: (value: Updater<ShortcutEntry[]>) => void;
  setShortcutEdits: (value: Updater<Record<string, string>>) => void;
};

function resolveUpdater<T>(current: T, value: Updater<T>) {
  return typeof value === "function" ? (value as (current: T) => T)(current) : value;
}

const initialSettings = readSettings();
const initialShortcuts = readShortcuts();
const initialNote = createEmptyNote();

export const useAppStore = create<AppStoreState & AppStoreActions>((set) => ({
  initialSettings,
  initialShortcuts,
  notes: [initialNote],
  activeNoteId: initialNote.id,
  savedAt: null,
  saveError: null,
  saveStatus: "idle",
  editorMode: initialSettings.defaultEditorMode,
  editorCommand: null,
  language: initialSettings.language,
  theme: initialSettings.theme,
  uiDensity: initialSettings.uiDensity,
  sidebarWidth: initialSettings.sidebarWidth,
  sidebarVisible: initialSettings.sidebarVisible,
  rightPanelVisible: initialSettings.rightPanelVisible,
  rightPanelWidth: initialSettings.rightPanelWidth,
  leftPanelTab: "files",
  knowledgePanelTab: "backlinks",
  knowledgePanelFloating: false,
  floatingPanelPosition: { x: 920, y: 112 },
  vaultRoot: initialSettings.restoreWorkspace ? initialSettings.vaultRoot : null,
  vaultTree: null,
  vaultError: null,
  vaultIndex: null,
  vaultIndexStatus: "idle",
  vaultIndexError: null,
  selectedVaultDir: initialSettings.selectedVaultDir,
  lastOpenedFile: null,
  vaultRecoveryBlocked: initialSettings.vaultRecoveryBlocked,
  expandedDirs: new Set([""]),
  vaultWorkspace: mergeWorkspaceState(null, {
    sidebarWidth: initialSettings.sidebarWidth,
    sidebarVisible: initialSettings.sidebarVisible,
    rightPanelVisible: initialSettings.rightPanelVisible,
    rightPanelWidth: initialSettings.rightPanelWidth,
    editorLeftGap: initialSettings.editorLeftGap,
    uiScale: initialSettings.uiScale,
  }),
  defaultEditorModeSetting: initialSettings.defaultEditorMode,
  restoreWorkspace: initialSettings.restoreWorkspace,
  restoreWindowState: initialSettings.restoreWindowState,
  windowState: initialSettings.windowState,
  editorLatinFont: initialSettings.editorLatinFont,
  editorCjkFont: initialSettings.editorCjkFont,
  editorFontSize: initialSettings.editorFontSize,
  editorLineHeight: initialSettings.editorLineHeight,
  editorLeftGap: initialSettings.editorLeftGap,
  uiScale: initialSettings.uiScale,
  zoomWithWheel: initialSettings.zoomWithWheel,
  showEditorStatusOverlay: initialSettings.showEditorStatusOverlay,
  tagFeaturesEnabled: initialSettings.tagFeaturesEnabled,
  showFrontmatterTagRow: initialSettings.showFrontmatterTagRow,
  defaultSaveExt: initialSettings.defaultSaveExt,
  quickNoteSaveExt: initialSettings.quickNoteSaveExt,
  quickNoteShowInTaskbar: initialSettings.quickNoteShowInTaskbar,
  closeButtonBehavior: initialSettings.closeButtonBehavior,
  defaultNewNoteName: initialSettings.defaultNewNoteName,
  imageAttachmentFolder: initialSettings.imageAttachmentFolder,
  imagePathStyle: initialSettings.imagePathStyle,
  showImageSourceOnFocus: initialSettings.showImageSourceOnFocus,
  normalizeWindowsImagePaths: initialSettings.normalizeWindowsImagePaths,
  settingsOpen: false,
  settingsSection: "general",
  appDialog: null,
  appDialogInput: "",
  openMenuId: null,
  shortcuts: initialShortcuts,
  shortcutEdits: Object.fromEntries(initialShortcuts.map((shortcut) => [shortcut.id, shortcut.currentKeys.join(", ")])),

  setNotes: (value) => set((state) => ({ notes: resolveUpdater(state.notes, value) })),
  setActiveNoteId: (value) => set({ activeNoteId: value }),
  setSavedAt: (value) => set({ savedAt: value }),
  setSaveError: (value) => set({ saveError: value }),
  setSaveStatus: (value) => set({ saveStatus: value }),
  setEditorMode: (value) => set({ editorMode: value }),
  setEditorCommand: (value) => set({ editorCommand: value }),
  setLanguage: (value) => set({ language: value }),
  setTheme: (value) => set({ theme: value }),
  setUiDensity: (value) => set({ uiDensity: value }),
  setSidebarWidth: (value) => set((state) => ({ sidebarWidth: resolveUpdater(state.sidebarWidth, value) })),
  setSidebarVisible: (value) => set((state) => ({ sidebarVisible: resolveUpdater(state.sidebarVisible, value) })),
  setRightPanelVisible: (value) => set((state) => ({ rightPanelVisible: resolveUpdater(state.rightPanelVisible, value) })),
  setRightPanelWidth: (value) => set((state) => ({ rightPanelWidth: resolveUpdater(state.rightPanelWidth, value) })),
  setLeftPanelTab: (value) => set({ leftPanelTab: value }),
  setKnowledgePanelTab: (value) => set({ knowledgePanelTab: value }),
  setKnowledgePanelFloating: (value) => set((state) => ({ knowledgePanelFloating: resolveUpdater(state.knowledgePanelFloating, value) })),
  setFloatingPanelPosition: (value) => set((state) => ({ floatingPanelPosition: resolveUpdater(state.floatingPanelPosition, value) })),
  setVaultRoot: (value) => set({ vaultRoot: value }),
  setVaultTree: (value) => set((state) => ({ vaultTree: resolveUpdater(state.vaultTree, value) })),
  setVaultError: (value) => set({ vaultError: value }),
  setVaultIndex: (value) => set((state) => ({ vaultIndex: resolveUpdater(state.vaultIndex, value) })),
  setVaultIndexStatus: (value) => set({ vaultIndexStatus: value }),
  setVaultIndexError: (value) => set({ vaultIndexError: value }),
  setSelectedVaultDir: (value) => set({ selectedVaultDir: value }),
  setLastOpenedFile: (value) => set({ lastOpenedFile: value }),
  setVaultRecoveryBlocked: (value) => set({ vaultRecoveryBlocked: value }),
  setExpandedDirs: (value) => set((state) => ({ expandedDirs: resolveUpdater(state.expandedDirs, value) })),
  setVaultWorkspace: (value) => set((state) => ({ vaultWorkspace: resolveUpdater(state.vaultWorkspace, value) })),
  setDefaultEditorModeSetting: (value) => set({ defaultEditorModeSetting: value }),
  setRestoreWorkspace: (value) => set({ restoreWorkspace: value }),
  setRestoreWindowState: (value) => set({ restoreWindowState: value }),
  setWindowState: (value) => set({ windowState: value }),
  setEditorLatinFont: (value) => set({ editorLatinFont: value }),
  setEditorCjkFont: (value) => set({ editorCjkFont: value }),
  setEditorFontSize: (value) => set({ editorFontSize: value }),
  setEditorLineHeight: (value) => set({ editorLineHeight: value }),
  setEditorLeftGap: (value) => set({ editorLeftGap: value }),
  setUiScale: (value) => set((state) => ({ uiScale: resolveUpdater(state.uiScale, value) })),
  setZoomWithWheel: (value) => set({ zoomWithWheel: value }),
  setShowEditorStatusOverlay: (value) => set({ showEditorStatusOverlay: value }),
  setTagFeaturesEnabled: (value) => set({ tagFeaturesEnabled: value }),
  setShowFrontmatterTagRow: (value) => set({ showFrontmatterTagRow: value }),
  setDefaultSaveExt: (value) => set({ defaultSaveExt: value }),
  setQuickNoteSaveExt: (value) => set({ quickNoteSaveExt: value }),
  setQuickNoteShowInTaskbar: (value) => set({ quickNoteShowInTaskbar: value }),
  setCloseButtonBehavior: (value) => set({ closeButtonBehavior: value }),
  setDefaultNewNoteName: (value) => set((state) => ({ defaultNewNoteName: resolveUpdater(state.defaultNewNoteName, value) })),
  setImageAttachmentFolder: (value) => set((state) => ({ imageAttachmentFolder: resolveUpdater(state.imageAttachmentFolder, value) })),
  setImagePathStyle: (value: AppSettings["imagePathStyle"]) => set({ imagePathStyle: value }),
  setShowImageSourceOnFocus: (value: boolean) => set({ showImageSourceOnFocus: value }),
  setNormalizeWindowsImagePaths: (value: boolean) => set({ normalizeWindowsImagePaths: value }),
  setSettingsOpen: (value) => set({ settingsOpen: value }),
  setSettingsSection: (value) => set({ settingsSection: value }),
  setAppDialog: (value) => set({ appDialog: value }),
  setAppDialogInput: (value) => set({ appDialogInput: value }),
  setOpenMenuId: (value) => set((state) => ({ openMenuId: resolveUpdater(state.openMenuId, value) })),
  setShortcuts: (value) => set((state) => ({ shortcuts: resolveUpdater(state.shortcuts, value) })),
  setShortcutEdits: (value) => set((state) => ({ shortcutEdits: resolveUpdater(state.shortcutEdits, value) })),
}));
