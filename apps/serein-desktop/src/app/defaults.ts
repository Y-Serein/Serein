import type { AppSettings, EditorMode, SettingsSection, VaultWorkspaceState } from "./types";

export const SETTINGS_STORAGE_KEY = "serein.settings.v1";
export const SHORTCUTS_STORAGE_KEY = "serein.shortcuts.v1";
const LEGACY_STORAGE_PREFIX = ["ys", "writer"].join("-");
export const LEGACY_SETTINGS_STORAGE_KEY = `${LEGACY_STORAGE_PREFIX}.settings.v1`;
export const LEGACY_SHORTCUTS_STORAGE_KEY = `${LEGACY_STORAGE_PREFIX}.shortcuts.v1`;

export const MIN_SIDEBAR_WIDTH = 180;
export const MAX_SIDEBAR_WIDTH = 360;
export const MIN_RIGHT_PANEL_WIDTH = 240;
export const MAX_RIGHT_PANEL_WIDTH = 520;
export const MIN_EDITOR_LEFT_GAP = 16;
export const MAX_EDITOR_LEFT_GAP = 140;
export const MIN_EDITOR_TAB_SIZE = 1;
export const MAX_EDITOR_TAB_SIZE = 8;
export const MIN_UI_SCALE = 85;
export const MAX_UI_SCALE = 130;
export const VAULT_DIRECTORY_LIMIT = 300;

export const defaultEditorMode: EditorMode = "rich";

export function clampEditorTabSize(value: number) {
  if (!Number.isFinite(value)) return 4;
  return Math.min(MAX_EDITOR_TAB_SIZE, Math.max(MIN_EDITOR_TAB_SIZE, Math.round(value)));
}

export const defaultSettings: AppSettings = {
  editorModePreferenceVersion: 4,
  theme: "mint",
  language: "zh-CN",
  uiDensity: "comfortable",
  sidebarWidth: 240,
  sidebarVisible: true,
  rightPanelVisible: true,
  rightPanelWidth: 300,
  vaultRoot: null,
  lastOpenedFile: null,
  selectedVaultDir: "",
  vaultRecoveryBlocked: false,
  defaultEditorMode,
  restoreWorkspace: true,
  restoreWindowState: true,
  windowState: null,
  editorLatinFont: "Segoe UI",
  editorCjkFont: "Microsoft YaHei",
  editorFontSize: 16,
  editorLineHeight: 1.6,
  editorTabSize: 4,
  editorLeftGap: 42,
  uiScale: 100,
  zoomWithWheel: true,
  showEditorStatusOverlay: true,
  tagFeaturesEnabled: true,
  showFrontmatterTagRow: true,
  defaultSaveExt: "md",
  quickNoteSaveExt: "md",
  quickNoteShowInTaskbar: true,
  closeButtonBehavior: "ask",
  defaultNewNoteName: "Untitled",
  imageAttachmentFolder: "./image_ys",
  imagePathStyle: "relative",
  showImageSourceOnFocus: true,
  normalizeWindowsImagePaths: true,
};

export const settingsSections: Array<{ id: SettingsSection; label: string }> = [
  { id: "general", label: "General" },
  { id: "files", label: "Files" },
  { id: "editor", label: "Editor" },
  { id: "image", label: "Image" },
  { id: "markdown", label: "Markdown" },
  { id: "appearance", label: "Appearance" },
  { id: "shortcuts", label: "Shortcuts" },
];

export function defaultVaultWorkspaceState(layout = defaultSettings): VaultWorkspaceState {
  return {
    version: 1,
    recentFiles: [],
    lastOpenedFile: null,
    selectedDir: "",
    expandedDirs: [""],
    layout: {
      sidebarWidth: layout.sidebarWidth,
      sidebarVisible: layout.sidebarVisible,
      rightPanelVisible: layout.rightPanelVisible,
      rightPanelWidth: layout.rightPanelWidth,
      editorLeftGap: layout.editorLeftGap,
      uiScale: layout.uiScale,
    },
    centerGraph: {
      open: false,
      activeView: "markdown",
      selectedTag: "",
      isolatedOnly: false,
      showUnresolved: false,
    },
  };
}
