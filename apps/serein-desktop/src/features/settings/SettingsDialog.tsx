import { useEffect, useState } from "react";
import {
  MAX_EDITOR_LEFT_GAP,
  MAX_RIGHT_PANEL_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MAX_UI_SCALE,
  MIN_EDITOR_LEFT_GAP,
  MIN_RIGHT_PANEL_WIDTH,
  MIN_SIDEBAR_WIDTH,
  MIN_UI_SCALE,
  defaultSettings,
  settingsSections,
} from "../../app/defaults";
import {
  appLanguages,
  editorCjkFontOptions,
  editorFontSizeOptions,
  editorLatinFontOptions,
} from "../../app/i18n";
import type { AppLanguage, appText } from "../../app/i18n";
import type { CloseButtonBehavior, EditorMode, ImagePathStyle, SaveFileExt, SettingsSection, ThemeStyle, UIDensity } from "../../app/types";
import { shortcutFromEvent, type ShortcutEntry } from "../../command/shortcuts";
import { normalizeDefaultNewNoteName } from "../../services/settings";
import { Button } from "../../shared/ui";

type TextBundle = (typeof appText)[AppLanguage];

const SETTINGS_PANEL_EXIT_MS = 210;

type SettingsDialogProps = {
  open: boolean;
  t: TextBundle;
  language: AppLanguage;
  section: SettingsSection;
  defaultEditorModeSetting: EditorMode;
  restoreWorkspace: boolean;
  restoreWindowState: boolean;
  sidebarVisible: boolean;
  rightPanelVisible: boolean;
  editorLatinFont: string;
  editorCjkFont: string;
  editorFontSize: number;
  editorLineHeight: number;
  uiScale: number;
  zoomWithWheel: boolean;
  showEditorStatusOverlay: boolean;
  textBufferEditorEnabled: boolean;
  tagFeaturesEnabled: boolean;
  showFrontmatterTagRow: boolean;
  editorLeftGap: number;
  sidebarWidth: number;
  rightPanelWidth: number;
  shortcuts: ShortcutEntry[];
  shortcutEdits: Record<string, string>;
  shortcutConflicts: Map<string, ShortcutEntry[]>;
  theme: ThemeStyle;
  uiDensity: UIDensity;
  defaultSaveExt: SaveFileExt;
  quickNoteSaveExt: SaveFileExt;
  quickNoteShowInTaskbar: boolean;
  closeButtonBehavior: CloseButtonBehavior;
  defaultNewNoteName: string;
  imageAttachmentFolder: string;
  imagePathStyle: ImagePathStyle;
  showImageSourceOnFocus: boolean;
  normalizeWindowsImagePaths: boolean;
  vaultRoot: string | null;
  lastOpenedFile: string | null;
  onClose: () => void;
  onSectionChange: (section: SettingsSection) => void;
  onLanguageChange: (language: AppLanguage) => void;
  onDefaultEditorModeChange: (mode: EditorMode) => void;
  onRestoreWorkspaceChange: (value: boolean) => void;
  onRestoreWindowStateChange: (value: boolean) => void;
  onSidebarVisibleChange: (value: boolean) => void;
  onRightPanelVisibleChange: (value: boolean) => void;
  onEditorLatinFontChange: (value: string) => void;
  onEditorCjkFontChange: (value: string) => void;
  onEditorFontSizeChange: (value: number) => void;
  onEditorLineHeightChange: (value: number) => void;
  onUiScaleChange: (value: number) => void;
  onZoomWithWheelChange: (value: boolean) => void;
  onShowEditorStatusOverlayChange: (value: boolean) => void;
  onTextBufferEditorEnabledChange: (value: boolean) => void;
  onTagFeaturesEnabledChange: (value: boolean) => void;
  onShowFrontmatterTagRowChange: (value: boolean) => void;
  onEditorLeftGapChange: (value: number) => void;
  onSidebarWidthChange: (value: number) => void;
  onRightPanelWidthChange: (value: number) => void;
  onResetEditorLayout: () => void;
  onShortcutRecord: (shortcutId: string, value: string) => void;
  onShortcutRestore: (shortcutId: string) => void;
  onShortcutRestoreAll: () => void;
  onShortcutEnabledChange: (shortcutId: string, enabled: boolean) => void;
  onThemeCommand: (commandId: string) => void;
  onUiDensityChange: (density: UIDensity) => void;
  onDefaultSaveExtChange: (value: SaveFileExt) => void;
  onQuickNoteSaveExtChange: (value: SaveFileExt) => void;
  onQuickNoteShowInTaskbarChange: (value: boolean) => void;
  onCloseButtonBehaviorChange: (value: CloseButtonBehavior) => void;
  onDefaultNewNoteNameChange: (value: string) => void;
  onDefaultNewNoteNameBlur: () => void;
  onImageAttachmentFolderChange: (value: string) => void;
  onImageAttachmentFolderBlur: () => void;
  onImagePathStyleChange: (value: ImagePathStyle) => void;
  onShowImageSourceOnFocusChange: (value: boolean) => void;
  onNormalizeWindowsImagePathsChange: (value: boolean) => void;
  onClearVaultState: () => void;
};

export function SettingsDialog({
  open,
  t,
  language,
  section,
  defaultEditorModeSetting,
  restoreWorkspace,
  restoreWindowState,
  sidebarVisible,
  rightPanelVisible,
  editorLatinFont,
  editorCjkFont,
  editorFontSize,
  editorLineHeight,
  uiScale,
  zoomWithWheel,
  showEditorStatusOverlay,
  textBufferEditorEnabled,
  tagFeaturesEnabled,
  showFrontmatterTagRow,
  editorLeftGap,
  sidebarWidth,
  rightPanelWidth,
  shortcuts,
  shortcutEdits,
  shortcutConflicts,
  theme,
  uiDensity,
  defaultSaveExt,
  quickNoteSaveExt,
  quickNoteShowInTaskbar,
  closeButtonBehavior,
  defaultNewNoteName,
  imageAttachmentFolder,
  imagePathStyle,
  showImageSourceOnFocus,
  normalizeWindowsImagePaths,
  vaultRoot,
  lastOpenedFile,
  onClose,
  onSectionChange,
  onLanguageChange,
  onDefaultEditorModeChange,
  onRestoreWorkspaceChange,
  onRestoreWindowStateChange,
  onSidebarVisibleChange,
  onRightPanelVisibleChange,
  onEditorLatinFontChange,
  onEditorCjkFontChange,
  onEditorFontSizeChange,
  onEditorLineHeightChange,
  onUiScaleChange,
  onZoomWithWheelChange,
  onShowEditorStatusOverlayChange,
  onTextBufferEditorEnabledChange,
  onTagFeaturesEnabledChange,
  onShowFrontmatterTagRowChange,
  onEditorLeftGapChange,
  onSidebarWidthChange,
  onRightPanelWidthChange,
  onResetEditorLayout,
  onShortcutRecord,
  onShortcutRestore,
  onShortcutRestoreAll,
  onShortcutEnabledChange,
  onThemeCommand,
  onUiDensityChange,
  onDefaultSaveExtChange,
  onQuickNoteSaveExtChange,
  onQuickNoteShowInTaskbarChange,
  onCloseButtonBehaviorChange,
  onDefaultNewNoteNameChange,
  onDefaultNewNoteNameBlur,
  onImageAttachmentFolderChange,
  onImageAttachmentFolderBlur,
  onImagePathStyleChange,
  onShowImageSourceOnFocusChange,
  onNormalizeWindowsImagePathsChange,
  onClearVaultState,
}: SettingsDialogProps) {
  const [visible, setVisible] = useState(open);
  const [closing, setClosing] = useState(false);
  const [recordingShortcutId, setRecordingShortcutId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setVisible(true);
      setClosing(false);
      return undefined;
    }

    if (!visible) return undefined;
    setClosing(true);
    const timeout = window.setTimeout(() => setVisible(false), SETTINGS_PANEL_EXIT_MS);
    return () => window.clearTimeout(timeout);
  }, [open, visible]);

  useEffect(() => {
    if (!open) setRecordingShortcutId(null);
  }, [open]);

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => {
      onClose();
      setVisible(false);
    }, SETTINGS_PANEL_EXIT_MS);
  };

  if (!visible) return null;

  return (
    <div className="settings-backdrop" data-state={closing ? "closing" : "open"} role="presentation" onMouseDown={requestClose}>
      <section className="settings-panel" role="dialog" aria-modal="true" aria-label={t.aria.settingsDialog} onMouseDown={(event) => event.stopPropagation()}>
        <div className="settings-header">
          <h2>{t.settings.title}</h2>
          <Button variant="ghost" className="settings-close-button" onClick={requestClose} aria-label={t.settings.close}>×</Button>
        </div>

        <div className="settings-layout">
          <nav className="settings-nav" aria-label={t.settings.navAria}>
            {settingsSections.map((settingsSection) => (
              <button
                key={settingsSection.id}
                type="button"
                className={section === settingsSection.id ? "selected" : ""}
                onClick={() => onSectionChange(settingsSection.id)}
              >
                {t.sectionLabels[settingsSection.id]}
              </button>
            ))}
          </nav>

          <div className="settings-content">
            {section === "general" ? (
              <div className="settings-section">
                <h3>{t.settings.general}</h3>
                <label className="settings-field">
                  <span>{t.settings.language}</span>
                  <select value={language} onChange={(event) => onLanguageChange(event.target.value as AppLanguage)}>
                    {appLanguages.map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <label className="settings-field">
                  <span>{t.settings.defaultEditMode}</span>
                  <select value={defaultEditorModeSetting} onChange={(event) => onDefaultEditorModeChange(event.target.value as EditorMode)}>
                    <option value="plain">{t.modeNames.plain}</option>
                    <option value="rich">{t.modeNames.rich}</option>
                  </select>
                </label>
                <label className="settings-check">
                  <input type="checkbox" checked={restoreWorkspace} onChange={(event) => onRestoreWorkspaceChange(event.target.checked)} />
                  {t.settings.restoreLastVault}
                </label>
                <label className="settings-check">
                  <input type="checkbox" checked={restoreWindowState} onChange={(event) => onRestoreWindowStateChange(event.target.checked)} />
                  {t.settings.restoreWindowState}
                </label>
                <label className="settings-check">
                  <input type="checkbox" checked={sidebarVisible} onChange={(event) => onSidebarVisibleChange(event.target.checked)} />
                  {t.settings.showVaultSidebar}
                </label>
                <label className="settings-check">
                  <input type="checkbox" checked={rightPanelVisible} onChange={(event) => onRightPanelVisibleChange(event.target.checked)} />
                  {t.settings.showKnowledgePanel}
                </label>
              </div>
            ) : null}

            {section === "editor" ? (
              <div className="settings-section">
                <h3>{t.settings.editor}</h3>
                <label className="settings-field">
                  <span>{t.settings.englishFont}</span>
                  <select value={editorLatinFont} onChange={(event) => onEditorLatinFontChange(event.target.value)}>
                    {editorLatinFontOptions.map((font) => (
                      <option key={font} value={font}>{font}</option>
                    ))}
                  </select>
                </label>
                <label className="settings-field">
                  <span>{t.settings.chineseFont}</span>
                  <select value={editorCjkFont} onChange={(event) => onEditorCjkFontChange(event.target.value)}>
                    {editorCjkFontOptions.map((font) => (
                      <option key={font} value={font}>{font}</option>
                    ))}
                  </select>
                </label>
                <label className="settings-field">
                  <span>{t.settings.fontSize}</span>
                  <select value={editorFontSize} onChange={(event) => onEditorFontSizeChange(Number(event.target.value))}>
                    {editorFontSizeOptions.map((item) => (
                      <option key={item.value} value={item.value}>{language === "zh-CN" ? item.zh : item.en}</option>
                    ))}
                  </select>
                </label>
                <label className="settings-field">
                  <span>{t.settings.lineHeight}</span>
                  <input type="number" min={1.4} max={2.2} step={0.05} value={editorLineHeight} onChange={(event) => onEditorLineHeightChange(Number(event.target.value))} />
                </label>
                <label className="settings-field">
                  <span>{t.settings.uiFontScale}</span>
                  <input type="number" min={MIN_UI_SCALE} max={MAX_UI_SCALE} step={5} value={uiScale} onChange={(event) => onUiScaleChange(Number(event.target.value))} />
                </label>
                <label className="settings-check">
                  <input type="checkbox" checked={zoomWithWheel} onChange={(event) => onZoomWithWheelChange(event.target.checked)} />
                  {t.settings.zoomWithWheel}
                </label>
                <label className="settings-check">
                  <input type="checkbox" checked={showEditorStatusOverlay} onChange={(event) => onShowEditorStatusOverlayChange(event.target.checked)} />
                  {t.settings.showEditorStatusOverlay}
                </label>
                <label className="settings-check">
                  <input type="checkbox" checked={textBufferEditorEnabled} onChange={(event) => onTextBufferEditorEnabledChange(event.target.checked)} />
                  {t.settings.textBufferEditorEnabled}
                </label>
                <label className="settings-field">
                  <span>{t.settings.layoutLeftGap}</span>
                  <input type="number" min={MIN_EDITOR_LEFT_GAP} max={MAX_EDITOR_LEFT_GAP} value={editorLeftGap} onChange={(event) => onEditorLeftGapChange(Number(event.target.value))} />
                </label>
                <label className="settings-field">
                  <span>{t.settings.sidebarWidth}</span>
                  <input type="number" min={MIN_SIDEBAR_WIDTH} max={MAX_SIDEBAR_WIDTH} value={sidebarWidth} onChange={(event) => onSidebarWidthChange(Number(event.target.value))} />
                </label>
                <label className="settings-field">
                  <span>{t.settings.rightPanelWidth}</span>
                  <input type="number" min={MIN_RIGHT_PANEL_WIDTH} max={MAX_RIGHT_PANEL_WIDTH} value={rightPanelWidth} onChange={(event) => onRightPanelWidthChange(Number(event.target.value))} />
                </label>
                <Button className="settings-secondary" onClick={onResetEditorLayout}>{t.settings.resetEditorLayout}</Button>
              </div>
            ) : null}

            {section === "image" ? (
              <div className="settings-section">
                <h3>{t.settings.image}</h3>
                <p>{t.settings.imageBehaviorHint}</p>
                <label className="settings-field">
                  <span>{t.settings.imageAttachmentFolder}</span>
                  <input
                    value={imageAttachmentFolder}
                    placeholder="./image_ys"
                    onChange={(event) => onImageAttachmentFolderChange(event.target.value)}
                    onBlur={onImageAttachmentFolderBlur}
                  />
                </label>
                <label className="settings-field">
                  <span>{t.settings.imagePathStyle}</span>
                  <select value={imagePathStyle} onChange={(event) => onImagePathStyleChange(event.target.value as ImagePathStyle)}>
                    <option value="relative">{t.settings.imagePathRelative}</option>
                    <option value="absolute">{t.settings.imagePathAbsolute}</option>
                  </select>
                </label>
                <label className="settings-check">
                  <input type="checkbox" checked={showImageSourceOnFocus} onChange={(event) => onShowImageSourceOnFocusChange(event.target.checked)} />
                  {t.settings.showImageSourceOnFocus}
                </label>
                <label className="settings-check">
                  <input type="checkbox" checked={normalizeWindowsImagePaths} onChange={(event) => onNormalizeWindowsImagePathsChange(event.target.checked)} />
                  {t.settings.normalizeWindowsImagePaths}
                </label>
                <p>{t.settings.imageSafetyHint}</p>
              </div>
            ) : null}

            {section === "markdown" ? (
              <div className="settings-section">
                <h3>{t.settings.markdown}</h3>
                <label className="settings-field">
                  <span>{t.settings.defaultEditMode}</span>
                  <select value={defaultEditorModeSetting} onChange={(event) => onDefaultEditorModeChange(event.target.value as EditorMode)}>
                    <option value="plain">{t.modeNames.plain}</option>
                    <option value="rich">{t.modeNames.rich}</option>
                  </select>
                </label>
                <label className="settings-field">
                  <span>{t.settings.defaultSaveFormat}</span>
                  <select value={defaultSaveExt} onChange={(event) => onDefaultSaveExtChange(event.target.value as SaveFileExt)}>
                    <option value="md">.md</option>
                    <option value="txt">.txt</option>
                  </select>
                </label>
                <label className="settings-check">
                  <input type="checkbox" checked={normalizeWindowsImagePaths} onChange={(event) => onNormalizeWindowsImagePathsChange(event.target.checked)} />
                  {t.settings.normalizeWindowsImagePaths}
                </label>
                <label className="settings-check">
                  <input type="checkbox" checked={tagFeaturesEnabled} onChange={(event) => onTagFeaturesEnabledChange(event.target.checked)} />
                  {t.settings.tagFeaturesEnabled}
                </label>
                <label className="settings-check">
                  <input type="checkbox" checked={showFrontmatterTagRow} onChange={(event) => onShowFrontmatterTagRowChange(event.target.checked)} />
                  {t.settings.showFrontmatterTagRow}
                </label>
              </div>
            ) : null}

            {section === "shortcuts" ? (
              <div className="settings-section">
                <div className="settings-section-title">
                  <h3>{t.settings.shortcuts}</h3>
                  <Button variant="ghost" onClick={onShortcutRestoreAll}>{t.settings.restoreDefaults}</Button>
                </div>
                {shortcutConflicts.size ? (
                  <p className="shortcut-warning">{t.settings.shortcutConflict}: {Array.from(shortcutConflicts.keys()).join(", ")}</p>
                ) : null}
                <div className="shortcut-table">
                  {shortcuts.map((shortcut) => {
                    const rowConflicts = shortcut.currentKeys.some((key) => shortcutConflicts.has(key));
                    const recording = recordingShortcutId === shortcut.id;
                    const currentShortcutText = shortcutEdits[shortcut.id] ?? shortcut.currentKeys.join(", ");
                    const recorderLabel = recording
                      ? t.settings.shortcutRecording
                      : currentShortcutText || t.settings.none;

                    return (
                      <div key={shortcut.id} className={rowConflicts ? "shortcut-row conflict" : "shortcut-row"}>
                        <div className="shortcut-command">
                          <strong>{t.commandLabels[shortcut.commandId as keyof typeof t.commandLabels] ?? shortcut.label}</strong>
                          <span>{t.shortcutCategories[shortcut.category]} · {shortcut.commandId}</span>
                        </div>
                        <button
                          type="button"
                          className="shortcut-recorder"
                          disabled={!shortcut.editable}
                          aria-label={t.aria.shortcutInput(t.commandLabels[shortcut.commandId as keyof typeof t.commandLabels] ?? shortcut.label)}
                          data-empty={!currentShortcutText ? "true" : undefined}
                          data-recording={recording ? "true" : undefined}
                          onClick={() => setRecordingShortcutId(shortcut.id)}
                          onKeyDown={(event) => {
                            event.stopPropagation();
                            if (!recording) return;
                            event.preventDefault();
                            if (event.key === "Escape") {
                              setRecordingShortcutId(null);
                              return;
                            }

                            const hasPrimaryModifier = event.ctrlKey || event.altKey || event.metaKey;
                            const hasAnyModifier = hasPrimaryModifier || event.shiftKey;
                            if (!hasAnyModifier && (event.key === "Backspace" || event.key === "Delete")) {
                              onShortcutRecord(shortcut.id, "");
                              setRecordingShortcutId(null);
                              return;
                            }

                            const nextShortcut = shortcutFromEvent(event.nativeEvent);
                            if (!hasPrimaryModifier || !nextShortcut.includes("+")) return;
                            onShortcutRecord(shortcut.id, nextShortcut);
                            setRecordingShortcutId(null);
                          }}
                          onBlur={() => {
                            if (recordingShortcutId === shortcut.id) setRecordingShortcutId(null);
                          }}
                        >
                          {recorderLabel}
                        </button>
                        <label className="shortcut-enabled">
                          <input type="checkbox" checked={shortcut.enabled} onChange={(event) => onShortcutEnabledChange(shortcut.id, event.target.checked)} />
                          {t.settings.enabled}
                        </label>
                        <Button variant="ghost" onClick={() => onShortcutRestore(shortcut.id)}>{t.settings.default}</Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {section === "appearance" ? (
              <div className="settings-section">
                <h3>{t.settings.appearance}</h3>
                <div className="theme-options">
                  {([
                    ["mint", t.commandLabels["theme.mint"], "theme.mint"],
                    ["eye", t.commandLabels["theme.eye"], "theme.eye"],
                    ["v5", t.commandLabels["theme.v5"], "theme.v5"],
                    ["ink", t.commandLabels["theme.ink"], "theme.ink"],
                    ["daily", t.commandLabels["theme.daily"], "theme.daily"],
                  ] as const).map(([id, label, commandId]) => (
                    <button key={id} type="button" className={theme === id ? "theme-option selected" : "theme-option"} onClick={() => onThemeCommand(commandId)}>
                      <span className={`theme-swatch ${id}`} />
                      <strong>{label}</strong>
                      <span>{t.themeDescriptions[id]}</span>
                    </button>
                  ))}
                </div>
                <label className="settings-field">
                  <span>{t.settings.interfaceDensity}</span>
                  <select value={uiDensity} onChange={(event) => onUiDensityChange(event.target.value as UIDensity)}>
                    <option value="comfortable">{t.settings.comfortable}</option>
                    <option value="compact">{t.settings.compact}</option>
                  </select>
                </label>
              </div>
            ) : null}

            {section === "files" ? (
              <div className="settings-section">
                <h3>{t.settings.files}</h3>
                <label className="settings-field">
                  <span>{t.settings.defaultSaveFormat}</span>
                  <select value={defaultSaveExt} onChange={(event) => onDefaultSaveExtChange(event.target.value as SaveFileExt)}>
                    <option value="md">.md</option>
                    <option value="txt">.txt</option>
                  </select>
                </label>
                <label className="settings-field">
                  <span>{t.settings.quickNoteSaveFormat}</span>
                  <select value={quickNoteSaveExt} onChange={(event) => onQuickNoteSaveExtChange(event.target.value as SaveFileExt)}>
                    <option value="md">.md</option>
                    <option value="txt">.txt</option>
                  </select>
                </label>
                <label className="settings-check">
                  <input type="checkbox" checked={quickNoteShowInTaskbar} onChange={(event) => onQuickNoteShowInTaskbarChange(event.target.checked)} />
                  {t.settings.quickNoteShowInTaskbar}
                </label>
                <label className="settings-field">
                  <span>{t.settings.closeButtonBehavior}</span>
                  <select value={closeButtonBehavior} onChange={(event) => onCloseButtonBehaviorChange(event.target.value as CloseButtonBehavior)}>
                    <option value="ask">{t.settings.closeButtonAsk}</option>
                    <option value="tray">{t.settings.closeButtonTray}</option>
                    <option value="exit">{t.settings.closeButtonExit}</option>
                  </select>
                </label>
                <label className="settings-field">
                  <span>{t.settings.defaultNewNoteName}</span>
                  <input
                    value={defaultNewNoteName}
                    onChange={(event) => onDefaultNewNoteNameChange(event.target.value)}
                    onBlur={() => {
                      onDefaultNewNoteNameChange(normalizeDefaultNewNoteName(defaultNewNoteName));
                      onDefaultNewNoteNameBlur();
                    }}
                  />
                </label>
                <p>{t.settings.vaultMetadata}: <code>Serein app data / vaults</code></p>
                <p>{t.settings.vaultRoot}: <code>{vaultRoot ?? t.settings.none}</code></p>
                <p>{t.settings.lastOpenedFile}: <code>{lastOpenedFile ?? t.settings.none}</code></p>
                <Button variant="danger" className="settings-danger" onClick={onClearVaultState}>{t.settings.clearLastVaultState}</Button>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

export function resetEditorLayoutDefaults() {
  return {
    editorLatinFont: defaultSettings.editorLatinFont,
    editorCjkFont: defaultSettings.editorCjkFont,
    editorFontSize: defaultSettings.editorFontSize,
    editorLineHeight: defaultSettings.editorLineHeight,
    editorLeftGap: defaultSettings.editorLeftGap,
    uiScale: defaultSettings.uiScale,
    sidebarWidth: defaultSettings.sidebarWidth,
    rightPanelWidth: defaultSettings.rightPanelWidth,
  };
}
