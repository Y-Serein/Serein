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
  labels: {
    aria: string;
    hideLeftSidebar: string;
    showLeftSidebar: string;
    openVault: string;
    quickOpen: string;
    search: string;
    graph: string;
    closeGraph: string;
    hideKnowledgePanel: string;
    showKnowledgePanel: string;
    newNote: string;
    commandPalette: string;
    settings: string;
  };
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
  labels,
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
    <nav className="workspace-ribbon" aria-label={labels.aria}>
      <div className="ribbon-group">
        <IconButton
          className={cx("ribbon-button", sidebarVisible && "active")}
          icon={sidebarVisible ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          label={sidebarVisible ? labels.hideLeftSidebar : labels.showLeftSidebar}
          onClick={onToggleSidebar}
        />
        <IconButton
          className={cx("ribbon-button", vaultMode && "active")}
          icon={<FolderTree size={18} />}
          label={labels.openVault}
          onClick={onOpenVault}
        />
        <IconButton
          className="ribbon-button"
          icon={<FileText size={18} />}
          label={labels.quickOpen}
          onClick={onOpenQuickOpen}
        />
        <IconButton
          className="ribbon-button"
          icon={<Search size={18} />}
          label={labels.search}
          onClick={() => onOpenSearchPanel()}
        />
        <IconButton
          className={cx("ribbon-button", graphOpen && "active")}
          icon={<GitBranch size={18} />}
          label={graphOpen ? labels.closeGraph : labels.graph}
          onClick={onOpenGraphPanel}
        />
        <IconButton
          className={cx("ribbon-button", rightPanelVisible && "active")}
          icon={rightPanelVisible ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
          label={rightPanelVisible ? labels.hideKnowledgePanel : labels.showKnowledgePanel}
          onClick={onToggleRightPanel}
        />
      </div>

      <div className="ribbon-group bottom">
        <IconButton
          className="ribbon-button new-note-fab"
          icon={<Plus size={18} />}
          label={labels.newNote}
          onClick={onCreateNote}
        />
        <IconButton
          className="ribbon-button"
          icon={<Command size={18} />}
          label={labels.commandPalette}
          onClick={onOpenCommandPalette}
        />
        <IconButton
          className="ribbon-button"
          icon={<Settings size={18} />}
          label={labels.settings}
          onClick={onOpenSettings}
        />
      </div>
    </nav>
  );
}
