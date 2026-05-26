import { Circle, FileText, GitBranch, Link2, PencilLine, Search } from "lucide-react";
import type { EditorMode } from "../../app/types";
import type { VaultIndexStatus } from "../../app/store/appStore";
import { pathFileName } from "../../shared/markdown";
import { cx } from "../../shared/ui";

type WorkspaceStatusBarProps = {
  filePath: string | null;
  dirty: boolean;
  editorMode: EditorMode;
  vaultRoot: string | null;
  vaultIndexStatus: VaultIndexStatus;
  vaultFileCount: number;
  lineCount: number;
  words: number;
  characters: number;
  resolvedLinks: number;
  unresolvedLinks: number;
};

export function WorkspaceStatusBar({
  filePath,
  dirty,
  editorMode,
  vaultRoot,
  vaultIndexStatus,
  vaultFileCount,
  lineCount,
  words,
  characters,
  resolvedLinks,
  unresolvedLinks,
}: WorkspaceStatusBarProps) {
  const indexLabel = vaultIndexStatus === "ready"
    ? `${vaultFileCount} indexed`
    : vaultIndexStatus === "indexing"
      ? "Indexing"
      : vaultIndexStatus === "error"
        ? "Index error"
        : "No index";

  return (
    <footer className="workspace-statusbar" aria-label="Workspace status">
      <div className="statusbar-section primary" title={filePath ?? ""}>
        <FileText size={13} aria-hidden="true" />
        <span>{filePath ? pathFileName(filePath) : "Untitled"}</span>
        {dirty ? <span className="status-dot">Unsaved</span> : null}
      </div>
      <div className="statusbar-section">
        <PencilLine size={13} aria-hidden="true" />
        <span>{editorMode === "rich" ? "Rich Edit" : "Plain Edit"}</span>
      </div>
      <div className="statusbar-section">
        <span>{lineCount} lines</span>
        <span>{words} words</span>
        <span>{characters} chars</span>
      </div>
      <div className="statusbar-section">
        <Link2 size={13} aria-hidden="true" />
        <span>{resolvedLinks}/{resolvedLinks + unresolvedLinks} links</span>
      </div>
      <div className={cx("statusbar-section", vaultIndexStatus === "error" && "error", vaultIndexStatus === "indexing" && "active")}>
        {vaultIndexStatus === "indexing" ? <Search size={13} aria-hidden="true" /> : <GitBranch size={13} aria-hidden="true" />}
        <span>{indexLabel}</span>
      </div>
      <div className="statusbar-section vault" title={vaultRoot ?? ""}>
        <Circle size={9} aria-hidden="true" />
        <span>{vaultRoot ? pathFileName(vaultRoot) : "No Vault"}</span>
      </div>
    </footer>
  );
}
