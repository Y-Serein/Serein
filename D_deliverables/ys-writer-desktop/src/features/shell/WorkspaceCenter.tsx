import type { ReactNode } from "react";
import { FileText, GitBranch, X } from "lucide-react";
import { pathFileName } from "../../shared/markdown";
import { IconButton, cx } from "../../shared/ui";

type WorkspaceCenterProps = {
  title: string;
  filePath: string | null;
  dirty: boolean;
  children: ReactNode;
  graphOpen: boolean;
  activeView: "markdown" | "graph";
  graphTitle: string;
  graphChildren: ReactNode;
  onViewChange: (view: "markdown" | "graph") => void;
  onClose: () => void;
  onCloseGraph: () => void;
};

export function WorkspaceCenter({
  title,
  filePath,
  dirty,
  children,
  graphOpen,
  activeView,
  graphTitle,
  graphChildren,
  onViewChange,
  onClose,
  onCloseGraph,
}: WorkspaceCenterProps) {
  if (graphOpen) {
    return (
      <section className="workspace-center split" aria-label="Workspace editor">
        <div className="workspace-pane markdown-pane">
          <header className="workspace-tabbar">
            <div
              className={cx("workspace-tab", activeView === "markdown" && "active")}
              title={filePath ?? title}
              onClick={() => onViewChange("markdown")}
            >
              <FileText size={14} aria-hidden="true" />
              <span>{filePath ? pathFileName(filePath) : title}</span>
              {dirty ? <i aria-label="Unsaved changes" /> : null}
              <IconButton
                icon={<X size={13} />}
                label="Close tab"
                onClick={(event) => {
                  event.stopPropagation();
                  onClose();
                }}
              />
            </div>
          </header>
          <div className="workspace-leaf markdown-leaf">{children}</div>
        </div>
        <div className="workspace-pane graph-pane">
          <header className="workspace-tabbar">
            <div
              className={cx("workspace-tab", activeView === "graph" && "active")}
              title={graphTitle}
              onClick={() => onViewChange("graph")}
            >
              <GitBranch size={14} aria-hidden="true" />
              <span>{graphTitle}</span>
              <IconButton
                icon={<X size={13} />}
                label="Close graph"
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseGraph();
                }}
              />
            </div>
          </header>
          <div className="workspace-leaf graph-leaf">{graphChildren}</div>
        </div>
      </section>
    );
  }

  return (
    <section className="workspace-center" aria-label="Workspace editor">
      <header className="workspace-tabbar">
        <div
          className={cx("workspace-tab", activeView === "markdown" && "active")}
          title={filePath ?? title}
          onClick={() => onViewChange("markdown")}
        >
          <FileText size={14} aria-hidden="true" />
          <span>{filePath ? pathFileName(filePath) : title}</span>
          {dirty ? <i aria-label="Unsaved changes" /> : null}
          <IconButton
            icon={<X size={13} />}
            label="Close tab"
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
          />
        </div>
      </header>
      <div className="workspace-leaf markdown-leaf">{children}</div>
    </section>
  );
}
