import {
  LEGACY_SETTINGS_STORAGE_KEY,
  MAX_EDITOR_LEFT_GAP,
  MAX_RIGHT_PANEL_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MAX_UI_SCALE,
  MIN_EDITOR_LEFT_GAP,
  MIN_RIGHT_PANEL_WIDTH,
  MIN_SIDEBAR_WIDTH,
  MIN_UI_SCALE,
  SETTINGS_STORAGE_KEY,
  defaultSettings,
} from "../app/defaults";
import { isAppLanguage } from "../app/i18n";
import type { AppSettings, EditorMode, ImagePathStyle, ThemeStyle, UIDensity, WindowState } from "../app/types";

const DEFAULT_NOTE_NAME_MAX_LENGTH = 80;
const EDITOR_FONT_MAX_LENGTH = 80;
const IMAGE_ATTACHMENT_FOLDER_MAX_LENGTH = 120;
const MIN_WINDOW_WIDTH = 320;
const MIN_WINDOW_HEIGHT = 240;
const MAX_WINDOW_WIDTH = 10000;
const MAX_WINDOW_HEIGHT = 10000;
const MAX_WINDOW_POSITION = 100000;
let lastSettingsJson: string | null = null;

function isThemeStyle(value: unknown): value is ThemeStyle {
  return value === "daily"
    || value === "eye"
    || value === "ink"
    || value === "mint"
    || value === "v5"
    || value === "v6";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function clampSidebarWidth(width: number) {
  if (!Number.isFinite(width)) return defaultSettings.sidebarWidth;
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
}

export function clampRightPanelWidth(width: number) {
  if (!Number.isFinite(width)) return defaultSettings.rightPanelWidth;
  return Math.min(MAX_RIGHT_PANEL_WIDTH, Math.max(MIN_RIGHT_PANEL_WIDTH, width));
}

export function clampEditorLeftGap(value: number) {
  if (!Number.isFinite(value)) return defaultSettings.editorLeftGap;
  return Math.min(MAX_EDITOR_LEFT_GAP, Math.max(MIN_EDITOR_LEFT_GAP, value));
}

export function clampUiScale(value: number) {
  if (!Number.isFinite(value)) return defaultSettings.uiScale;
  return Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, value));
}

export function normalizeDefaultNewNoteName(value: unknown) {
  if (typeof value !== "string") return defaultSettings.defaultNewNoteName;
  const cleaned = value
    .replace(/[\\/]/g, " ")
    .replace(/^\.+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, DEFAULT_NOTE_NAME_MAX_LENGTH) : defaultSettings.defaultNewNoteName;
}

export function normalizeEditorFontFamily(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const cleaned = value
    .replace(/["'`;{}]/g, "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, EDITOR_FONT_MAX_LENGTH) : fallback;
}

export function normalizeImageAttachmentFolder(value: unknown) {
  if (typeof value !== "string") return defaultSettings.imageAttachmentFolder;
  const cleaned = value
    .replace(/\\/g, "/")
    .replace(/[\0\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return defaultSettings.imageAttachmentFolder;
  if (/^[A-Za-z]:/.test(cleaned) || cleaned.startsWith("/") || cleaned.includes("..")) {
    return defaultSettings.imageAttachmentFolder;
  }
  return cleaned.slice(0, IMAGE_ATTACHMENT_FOLDER_MAX_LENGTH);
}

function normalizeWindowState(value: unknown): WindowState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<WindowState>;
  const { x, y, width, height } = candidate;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(width) || !isFiniteNumber(height)) {
    return null;
  }
  if (Math.abs(x) > MAX_WINDOW_POSITION || Math.abs(y) > MAX_WINDOW_POSITION) return null;

  const normalizedWidth = Math.round(width);
  const normalizedHeight = Math.round(height);
  if (
    normalizedWidth < MIN_WINDOW_WIDTH
    || normalizedHeight < MIN_WINDOW_HEIGHT
    || normalizedWidth > MAX_WINDOW_WIDTH
    || normalizedHeight > MAX_WINDOW_HEIGHT
  ) {
    return null;
  }

  return {
    x: Math.round(Number(x)),
    y: Math.round(Number(y)),
    width: normalizedWidth,
    height: normalizedHeight,
    maximized: Boolean(candidate.maximized),
  };
}

export function readSettings(): AppSettings {
  if (typeof window === "undefined") return defaultSettings;

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
      ?? window.localStorage.getItem(LEGACY_SETTINGS_STORAGE_KEY);
    if (!raw) return defaultSettings;

    const parsed = JSON.parse(raw) as Partial<AppSettings> & {
      workspaceRoot?: string | null;
      outlineVisible?: boolean;
      selectedWorkspaceDir?: string;
      workspaceRecoveryBlocked?: boolean;
    };
    const hasEditorStatusOverlaySetting = typeof parsed.showEditorStatusOverlay === "boolean";
    const theme: ThemeStyle = isThemeStyle(parsed.theme) ? parsed.theme : defaultSettings.theme;
    const uiDensity: UIDensity = parsed.uiDensity === "compact" ? "compact" : "comfortable";
    const defaultEditorMode: EditorMode = parsed.defaultEditorMode === "plain" || parsed.defaultEditorMode === "rich"
      ? parsed.defaultEditorMode
      : defaultSettings.defaultEditorMode;
    const imagePathStyle: ImagePathStyle = parsed.imagePathStyle === "absolute" ? "absolute" : "relative";
    const editorLatinFont = normalizeEditorFontFamily(parsed.editorLatinFont, defaultSettings.editorLatinFont);
    const editorCjkFont = normalizeEditorFontFamily(parsed.editorCjkFont, defaultSettings.editorCjkFont);
    const editorLineHeight = typeof parsed.editorLineHeight === "number"
      ? parsed.editorLineHeight
      : defaultSettings.editorLineHeight;
    const usesLegacyTypographyDefaults = editorLatinFont === "Avenir Next"
      && editorCjkFont === "Noto Sans SC"
      && editorLineHeight === 1.68;
    const usesTrialTypographyDefaults = (editorLatinFont === "Times New Roman" || editorLatinFont === "Cambria")
      && editorCjkFont === "SimSun"
      && editorLineHeight === 1.6;

    return {
      editorModePreferenceVersion: defaultSettings.editorModePreferenceVersion,
      theme,
      language: isAppLanguage(parsed.language) ? parsed.language : defaultSettings.language,
      uiDensity,
      sidebarWidth: typeof parsed.sidebarWidth === "number" ? clampSidebarWidth(parsed.sidebarWidth) : defaultSettings.sidebarWidth,
      sidebarVisible: typeof parsed.sidebarVisible === "boolean" ? parsed.sidebarVisible : defaultSettings.sidebarVisible,
      rightPanelVisible: typeof parsed.rightPanelVisible === "boolean"
        ? parsed.rightPanelVisible
        : typeof parsed.outlineVisible === "boolean"
          ? parsed.outlineVisible
          : defaultSettings.rightPanelVisible,
      rightPanelWidth: typeof parsed.rightPanelWidth === "number" ? clampRightPanelWidth(parsed.rightPanelWidth) : defaultSettings.rightPanelWidth,
      vaultRoot: typeof parsed.vaultRoot === "string" && parsed.vaultRoot
        ? parsed.vaultRoot
        : typeof parsed.workspaceRoot === "string" && parsed.workspaceRoot
          ? parsed.workspaceRoot
          : null,
      lastOpenedFile: typeof parsed.lastOpenedFile === "string" && parsed.lastOpenedFile ? parsed.lastOpenedFile : null,
      selectedVaultDir: typeof parsed.selectedVaultDir === "string"
        ? parsed.selectedVaultDir
        : typeof parsed.selectedWorkspaceDir === "string"
          ? parsed.selectedWorkspaceDir
          : "",
      vaultRecoveryBlocked: typeof parsed.vaultRecoveryBlocked === "boolean"
        ? parsed.vaultRecoveryBlocked
        : typeof parsed.workspaceRecoveryBlocked === "boolean"
          ? parsed.workspaceRecoveryBlocked
          : defaultSettings.vaultRecoveryBlocked,
      defaultEditorMode,
      restoreWorkspace: typeof parsed.restoreWorkspace === "boolean" ? parsed.restoreWorkspace : defaultSettings.restoreWorkspace,
      restoreWindowState: typeof parsed.restoreWindowState === "boolean" ? parsed.restoreWindowState : defaultSettings.restoreWindowState,
      windowState: normalizeWindowState(parsed.windowState),
      editorLatinFont: usesLegacyTypographyDefaults || usesTrialTypographyDefaults
        ? defaultSettings.editorLatinFont
        : editorLatinFont,
      editorCjkFont: usesLegacyTypographyDefaults || usesTrialTypographyDefaults
        ? defaultSettings.editorCjkFont
        : editorCjkFont,
      editorFontSize: typeof parsed.editorFontSize === "number" ? parsed.editorFontSize : defaultSettings.editorFontSize,
      editorLineHeight: usesLegacyTypographyDefaults || usesTrialTypographyDefaults
        ? defaultSettings.editorLineHeight
        : editorLineHeight,
      editorLeftGap: typeof parsed.editorLeftGap === "number" ? clampEditorLeftGap(parsed.editorLeftGap) : defaultSettings.editorLeftGap,
      uiScale: typeof parsed.uiScale === "number" ? clampUiScale(parsed.uiScale) : defaultSettings.uiScale,
      zoomWithWheel: typeof parsed.zoomWithWheel === "boolean" ? parsed.zoomWithWheel : defaultSettings.zoomWithWheel,
      showEditorStatusOverlay: hasEditorStatusOverlaySetting
        ? Boolean(parsed.showEditorStatusOverlay)
        : defaultSettings.showEditorStatusOverlay,
      tagFeaturesEnabled: typeof parsed.tagFeaturesEnabled === "boolean"
        ? parsed.tagFeaturesEnabled
        : defaultSettings.tagFeaturesEnabled,
      showFrontmatterTagRow: typeof parsed.showFrontmatterTagRow === "boolean"
        ? parsed.showFrontmatterTagRow
        : defaultSettings.showFrontmatterTagRow,
      defaultSaveExt: parsed.defaultSaveExt === "txt" ? "txt" : "md",
      defaultNewNoteName: normalizeDefaultNewNoteName(parsed.defaultNewNoteName),
      imageAttachmentFolder: normalizeImageAttachmentFolder(parsed.imageAttachmentFolder),
      imagePathStyle,
      showImageSourceOnFocus: typeof parsed.showImageSourceOnFocus === "boolean"
        ? parsed.showImageSourceOnFocus
        : defaultSettings.showImageSourceOnFocus,
      normalizeWindowsImagePaths: typeof parsed.normalizeWindowsImagePaths === "boolean"
        ? parsed.normalizeWindowsImagePaths
        : defaultSettings.normalizeWindowsImagePaths,
    };
  } catch (error) {
    console.warn("Failed to read settings", error);
    return defaultSettings;
  }
}

export function writeSettings(settings: AppSettings) {
  const serialized = JSON.stringify(settings);
  if (serialized === lastSettingsJson) return;
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, serialized);
  lastSettingsJson = serialized;
}
