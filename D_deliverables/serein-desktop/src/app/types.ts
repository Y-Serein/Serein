import type { Note } from "../domain/model";
import type { AppLanguage } from "./i18n";

export type SaveStatus = "idle" | "saved" | "error";
export type EditorMode = "plain" | "rich";
export type ThemeStyle = "daily" | "eye" | "ink" | "mint" | "v5" | "v6";
export type UIDensity = "comfortable" | "compact";
export type SaveFileExt = "md" | "txt";
export type ImagePathStyle = "relative" | "absolute";
export type CloseButtonBehavior = "ask" | "tray" | "exit";
export type SettingsSection = "general" | "files" | "editor" | "image" | "markdown" | "appearance" | "shortcuts";
export type WindowState = {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
};

export type AppSettings = {
  editorModePreferenceVersion: 4;
  theme: ThemeStyle;
  language: AppLanguage;
  uiDensity: UIDensity;
  sidebarWidth: number;
  sidebarVisible: boolean;
  rightPanelVisible: boolean;
  rightPanelWidth: number;
  vaultRoot: string | null;
  lastOpenedFile: string | null;
  selectedVaultDir: string;
  vaultRecoveryBlocked: boolean;
  defaultEditorMode: EditorMode;
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
  closeButtonBehavior: CloseButtonBehavior;
  defaultNewNoteName: string;
  imageAttachmentFolder: string;
  imagePathStyle: ImagePathStyle;
  showImageSourceOnFocus: boolean;
  normalizeWindowsImagePaths: boolean;
};

export type CommandDefinition = {
  id: string;
  label: string;
  enabled: boolean;
  run: () => void | Promise<void>;
};

export type MarkdownFileResponse = {
  path: string;
  fileName: string;
  fileExt: string;
  content: string;
  modifiedAtMs: number | null;
  size: number;
};

export type ImportedAssetResponse = {
  path: string;
  relativeMarkdownPath: string;
  fileName: string;
};

export type LocalAssetDataResponse = {
  dataUrl: string;
  mime: string;
};

export type VaultTreeEntry = {
  name: string;
  path: string;
  relativePath: string;
  kind: "directory" | "file";
  fileExt: string | null;
  children: VaultTreeEntry[];
  loaded?: boolean;
  loading?: boolean;
  hasMore?: boolean;
  truncated?: boolean;
  loadError?: string | null;
};

export type VaultDirectoryResponse = {
  name: string;
  path: string;
  relativePath: string;
  children: VaultTreeEntry[];
  hasMore: boolean;
  truncated: boolean;
  error: string | null;
};

export type VaultIndexFileResponse = {
  path: string;
  relativePath: string;
  fileName: string;
  fileExt: string;
  content: string;
};

export type VaultIndexResponse = {
  files: VaultIndexFileResponse[];
  truncated: boolean;
  skippedFiles: number;
  indexedBytes?: number;
};

export type VaultLayoutState = {
  sidebarWidth: number;
  sidebarVisible: boolean;
  rightPanelVisible: boolean;
  rightPanelWidth: number;
  editorLeftGap: number;
  uiScale: number;
};

export type VaultCenterGraphState = {
  open: boolean;
  activeView: "markdown" | "graph";
  selectedTag: string;
  isolatedOnly: boolean;
  showUnresolved: boolean;
};

export type VaultWorkspaceState = {
  version: 1;
  recentFiles: string[];
  lastOpenedFile: string | null;
  selectedDir: string;
  expandedDirs: string[];
  layout: VaultLayoutState;
  centerGraph: VaultCenterGraphState;
};

export type VaultConfig = {
  version: 1;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type VaultInitResponse = {
  root: string;
  config: VaultConfig;
  workspace: VaultWorkspaceState;
};

export type ActiveNote = Note;
