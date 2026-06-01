import {
  Command,
  FileText,
  FolderTree,
  GitBranch,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Search,
  Settings,
} from "lucide-react";
import { IconButton, cx } from "../../shared/ui";

type WorkspaceRibbonProps = {
  sidebarVisible: boolean;
  rightPanelVisible: boolean;
  vaultMode: boolean;
  graphOpen: boolean;
  newNoteLabel: string;
  onToggleSidebar: () => void;
  onToggleRightPanel: () => void;
  onCreateNote: () => void;
  onOpenVault: () => void;
  onOpenQuickOpen: () => void;
  onOpenCommandPalette: () => void;
  onOpenSettings: () => void;
  onOpenGraphPanel: () => void;
  onOpenSearchPanel: () => void;
};

export function WorkspaceRibbon({
  sidebarVisible,
  rightPanelVisible,
  vaultMode,
  graphOpen,
  newNoteLabel,
  onToggleSidebar,
  onToggleRightPanel,
  onCreateNote,
  onOpenVault,
  onOpenQuickOpen,
  onOpenCommandPalette,
  onOpenSettings,
  onOpenGraphPanel,
  onOpenSearchPanel,
}: WorkspaceRibbonProps) {
  return (
    <nav className="workspace-ribbon" aria-label="Workspace ribbon">
      <div className="ribbon-group">
        <IconButton
          className={cx("ribbon-button", sidebarVisible && "active")}
          icon={sidebarVisible ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          label={sidebarVisible ? "Hide left sidebar" : "Show left sidebar"}
          onClick={onToggleSidebar}
        />
        <IconButton
          className={cx("ribbon-button", vaultMode && "active")}
          icon={<FolderTree size={18} />}
          label="Open Vault"
          onClick={onOpenVault}
        />
        <IconButton
          className="ribbon-button"
          icon={<FileText size={18} />}
          label="Quick switcher"
          onClick={onOpenQuickOpen}
        />
        <IconButton
          className="ribbon-button"
          icon={<Search size={18} />}
          label="Search"
          onClick={onOpenSearchPanel}
        />
        <IconButton
          className={cx("ribbon-button", graphOpen && "active")}
          icon={<GitBranch size={18} />}
          label={graphOpen ? "Close graph" : "Graph"}
          onClick={onOpenGraphPanel}
        />
        <IconButton
          className={cx("ribbon-button", rightPanelVisible && "active")}
          icon={rightPanelVisible ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
          label={rightPanelVisible ? "Hide knowledge panel" : "Show knowledge panel"}
          onClick={onToggleRightPanel}
        />
      </div>

      <div className="ribbon-group bottom">
        <IconButton
          className="ribbon-button new-note-fab"
          icon={<Plus size={18} />}
          label={newNoteLabel}
          onClick={onCreateNote}
        />
        <IconButton
          className="ribbon-button"
          icon={<Command size={18} />}
          label="Command palette"
          onClick={onOpenCommandPalette}
        />
        <IconButton
          className="ribbon-button"
          icon={<Settings size={18} />}
          label="Settings"
          onClick={onOpenSettings}
        />
      </div>
    </nav>
  );
}
