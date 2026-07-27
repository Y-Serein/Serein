import type { MouseEvent as ReactMouseEvent, RefObject } from "react";
import { GitBranch, Maximize2, Minus, PanelLeft, PanelRight, X } from "lucide-react";
import type { CommandDefinition, DocumentViewMode, SaveStatus } from "../../app/types";
import { APP_NAME } from "../../app/metadata";
import { getShortcutForCommand, menuGroups } from "../../command/shortcuts";
import type { ShortcutEntry } from "../../command/shortcuts";
import { formatTime } from "../../shared/markdown";
import { Button, IconButton, cx } from "../../shared/ui";
import type { AppLanguage, appText } from "../../app/i18n";

type TextBundle = (typeof appText)[AppLanguage];

type WindowChromeProps = {
  t: TextBundle;
  menuBarRef: RefObject<HTMLElement>;
  openMenuId: string | null;
  commands: Record<string, CommandDefinition>;
  shortcuts: ShortcutEntry[];
  saveStatus: SaveStatus;
  saveError: string | null;
  savedAt: Date | null;
  hasActiveDocument: boolean;
  documentViewMode: DocumentViewMode;
  windowActionPending: "minimize" | "maximize" | "close" | null;
  onChromeMouseDown: (event: ReactMouseEvent<HTMLElement>) => void;
  onChromeDoubleClick: (event: ReactMouseEvent<HTMLElement>) => void;
  onWindowAction: (action: "minimize" | "maximize" | "close") => void;
  onOpenMenu: (value: string | null | ((current: string | null) => string | null)) => void;
  onDispatchCommand: (commandId: string) => void;
  onDocumentViewModeChange: (mode: DocumentViewMode) => void;
};

export function WindowChrome({
  t,
  menuBarRef,
  openMenuId,
  commands,
  shortcuts,
  saveStatus,
  saveError,
  savedAt,
  hasActiveDocument,
  documentViewMode,
  windowActionPending,
  onChromeMouseDown,
  onChromeDoubleClick,
  onWindowAction,
  onOpenMenu,
  onDispatchCommand,
  onDocumentViewModeChange,
}: WindowChromeProps) {
  const nextDocumentViewMode: DocumentViewMode = documentViewMode === "rich"
    ? "plain"
    : documentViewMode === "plain"
      ? "mindmap"
      : "rich";
  const documentViewIcon = documentViewMode === "rich"
    ? <PanelRight size={15} />
    : documentViewMode === "plain"
      ? <PanelLeft size={15} />
      : <GitBranch size={15} />;
  const statusText = hasActiveDocument
    ? (saveError ?? (saveStatus === "saved" ? t.status.saved : savedAt ? `${t.status.saved} ${formatTime(savedAt)}` : ""))
    : t.status.noDocument;

  return (
    <div className="app-chrome">
      <header
        className="window-titlebar"
        aria-label={t.aria.titlebar}
        onMouseDown={onChromeMouseDown}
        onDoubleClick={onChromeDoubleClick}
      >
        <div className="window-brand" title={APP_NAME} data-tauri-drag-region>
          <span className="serein-brand-mark" aria-hidden="true">Sy</span>
          <strong className="window-title">{APP_NAME}</strong>
        </div>
        <div className="titlebar-drag-region" data-tauri-drag-region />
        <div
          className="window-controls"
          aria-label={t.aria.windowControls}
          onMouseDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <IconButton
            icon={<Minus size={14} />}
            label={t.aria.minimize}
            disabled={windowActionPending === "close"}
            onClick={() => onWindowAction("minimize")}
          />
          <IconButton
            icon={<Maximize2 size={13} />}
            label={t.aria.maximize}
            disabled={windowActionPending === "close"}
            onClick={() => onWindowAction("maximize")}
          />
          <IconButton
            className="close"
            icon={<X size={14} />}
            label={t.aria.closeWindow}
            disabled={windowActionPending !== null}
            onClick={() => onWindowAction("close")}
          />
        </div>
      </header>

      <header
        ref={menuBarRef}
        className="menu-bar command-bar"
        aria-label={t.aria.appMenu}
        onMouseDown={onChromeMouseDown}
        onDoubleClick={onChromeDoubleClick}
        onMouseLeave={() => onOpenMenu(null)}
      >
        <div className="command-bar-left">
          <nav className="main-menu" aria-label={t.aria.mainMenu}>
            {menuGroups.map((group) => (
              <div key={group.id} className="menu-root">
                <button
                  type="button"
                  aria-expanded={openMenuId === group.id}
                  className={cx("menu-root-button", openMenuId === group.id && "open")}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenMenu(group.id);
                  }}
                  onMouseEnter={() => onOpenMenu((current) => (current ? group.id : current))}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    onOpenMenu(group.id);
                  }}
                >
                  {t.menuGroups[group.id as keyof typeof t.menuGroups] ?? group.label}
                </button>
                {openMenuId === group.id ? (
                  <div className="menu-popover" role="menu">
                    {group.items.map((item) => {
                      const command = item.commandId ? commands[item.commandId] : null;
                      const disabled = item.disabled || !command?.enabled;

                      return (
                        <button
                          key={`${group.id}-${item.label}`}
                          type="button"
                          role="menuitem"
                          disabled={disabled}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          onClick={() => {
                            if (item.commandId) {
                              onDispatchCommand(item.commandId);
                              onOpenMenu(null);
                            }
                          }}
                        >
                          <span>{item.commandId ? (t.commandLabels[item.commandId as keyof typeof t.commandLabels] ?? item.label) : item.label}</span>
                          <kbd>{getShortcutForCommand(shortcuts, item.commandId)}</kbd>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ))}
          </nav>
        </div>

        <div className="menu-status">
          {statusText ? <span>{statusText}</span> : null}
          <Button
            className="menu-document-view-button"
            variant="ghost"
            icon={documentViewIcon}
            title={t.modeNames[nextDocumentViewMode]}
            onClick={() => onDocumentViewModeChange(nextDocumentViewMode)}
          >
            {t.modeNames[documentViewMode]}
          </Button>
        </div>
      </header>
    </div>
  );
}
