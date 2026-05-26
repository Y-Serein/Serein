import type { MouseEvent as ReactMouseEvent, RefObject } from "react";
import { Maximize2, Minus, PanelLeft, PanelRight, Search, X } from "lucide-react";
import type { CommandDefinition, EditorMode, SaveStatus } from "../../app/types";
import { getShortcutForCommand, menuGroups } from "../../command/shortcuts";
import type { ShortcutEntry } from "../../command/shortcuts";
import { formatTime } from "../../shared/markdown";
import { Button, IconButton, cx } from "../../shared/ui";
import type { AppLanguage, appText } from "../../app/i18n";

type TextBundle = (typeof appText)[AppLanguage];

type WindowChromeProps = {
  t: TextBundle;
  windowTitle: string;
  menuBarRef: RefObject<HTMLElement>;
  openMenuId: string | null;
  commands: Record<string, CommandDefinition>;
  shortcuts: ShortcutEntry[];
  saveStatus: SaveStatus;
  saveError: string | null;
  savedAt: Date | null;
  hasActiveDocument: boolean;
  editorMode: EditorMode;
  modeCommandId: string;
  windowActionPending: "minimize" | "maximize" | "close" | null;
  onChromeMouseDown: (event: ReactMouseEvent<HTMLElement>) => void;
  onChromeDoubleClick: (event: ReactMouseEvent<HTMLElement>) => void;
  onWindowAction: (action: "minimize" | "maximize" | "close") => void;
  onOpenMenu: (value: string | null | ((current: string | null) => string | null)) => void;
  onDispatchCommand: (commandId: string) => void;
};

export function WindowChrome({
  t,
  windowTitle,
  menuBarRef,
  openMenuId,
  commands,
  shortcuts,
  saveStatus,
  saveError,
  savedAt,
  hasActiveDocument,
  editorMode,
  modeCommandId,
  windowActionPending,
  onChromeMouseDown,
  onChromeDoubleClick,
  onWindowAction,
  onOpenMenu,
  onDispatchCommand,
}: WindowChromeProps) {
  return (
    <div className="app-chrome">
      <header
        className="window-titlebar"
        aria-label={t.aria.titlebar}
        onMouseDown={onChromeMouseDown}
        onDoubleClick={onChromeDoubleClick}
      >
        <strong className="window-title" title={windowTitle} data-tauri-drag-region>{windowTitle}</strong>
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
      >
        <div className="command-bar-left">
          <Search size={15} aria-hidden="true" />
          <nav className="main-menu" aria-label={t.aria.mainMenu}>
            {menuGroups.map((group) => (
              <div key={group.id} className="menu-root">
                <button
                  type="button"
                  aria-expanded={openMenuId === group.id}
                  className={cx("menu-root-button", openMenuId === group.id && "open")}
                  onMouseDown={(event) => event.stopPropagation()}
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
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={() => {
                            if (item.commandId) onDispatchCommand(item.commandId);
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
          <span>{hasActiveDocument ? (saveStatus === "saved" ? t.status.saved : saveError ?? (savedAt ? `${t.status.saved} ${formatTime(savedAt)}` : t.status.memoryDraft)) : t.status.noDocument}</span>
          <Button variant="ghost" icon={editorMode === "plain" ? <PanelLeft size={15} /> : <PanelRight size={15} />} onClick={() => onDispatchCommand(modeCommandId)}>
            {editorMode === "plain" ? t.modeNames.rich : t.modeNames.plain}
          </Button>
        </div>
      </header>
    </div>
  );
}
