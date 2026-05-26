import type { AppSettings, EditorMode, SettingsSection, VaultWorkspaceState } from "./types";

export const SETTINGS_STORAGE_KEY = "serein.settings.v1";
export const LEGACY_SETTINGS_STORAGE_KEY = "ys-writer.settings.v1";
export const SHORTCUTS_STORAGE_KEY = "serein.shortcuts.v1";
export const LEGACY_SHORTCUTS_STORAGE_KEY = "ys-writer.shortcuts.v1";

export const MIN_SIDEBAR_WIDTH = 180;
export const MAX_SIDEBAR_WIDTH = 360;
export const MIN_RIGHT_PANEL_WIDTH = 240;
export const MAX_RIGHT_PANEL_WIDTH = 520;
export const MIN_EDITOR_LEFT_GAP = 16;
export const MAX_EDITOR_LEFT_GAP = 140;
export const MIN_UI_SCALE = 85;
export const MAX_UI_SCALE = 130;
export const VAULT_DIRECTORY_LIMIT = 300;

export const defaultEditorMode: EditorMode = "rich";

export const defaultSettings: AppSettings = {
  theme: "daily",
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
  editorLatinFont: "Avenir Next",
  editorCjkFont: "Noto Sans SC",
  editorFontSize: 16,
  editorLineHeight: 1.68,
  editorLeftGap: 42,
  uiScale: 100,
  zoomWithWheel: true,
  defaultSaveExt: "md",
  defaultNewNoteName: "Untitled",
};

export const settingsSections: Array<{ id: SettingsSection; label: string }> = [
  { id: "general", label: "General" },
  { id: "editor", label: "Editor" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "appearance", label: "Appearance" },
  { id: "files", label: "Files" },
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
