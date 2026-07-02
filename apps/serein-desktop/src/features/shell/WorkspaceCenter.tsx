import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { FileText, GitBranch, X } from "lucide-react";
import { pathFileName } from "../../shared/markdown";
import { IconButton, cx } from "../../shared/ui";

type WorkspaceCenterProps = {
  title: string;
  filePath: string | null;
  dirty: boolean;
  children: ReactNode;
  graphOpen: boolean;
  graphWidth: number;
  activeView: "markdown" | "graph";
  graphTitle: string;
  graphChildren: ReactNode;
  editorStatus: ReactNode;
  onViewChange: (view: "markdown" | "graph") => void;
  onClose: () => void;
  onCloseGraph: () => void;
  onGraphResizePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onFileContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void;
};

export function WorkspaceCenter({
  title,
  filePath,
  dirty,
  children,
  graphOpen,
  graphWidth,
  activeView,
  graphTitle,
  graphChildren,
  editorStatus,
  onViewChange,
  onClose,
  onCloseGraph,
  onGraphResizePointerDown,
  onFileContextMenu,
}: WorkspaceCenterProps) {
  if (graphOpen) {
    return (
      <section
        className="workspace-center split"
        aria-label="Workspace editor"
        style={{ "--center-graph-width": `${graphWidth}px` } as CSSProperties}
      >
        <div className="workspace-pane markdown-pane">
          <header className="workspace-tabbar">
            <div
              className={cx("workspace-tab", activeView === "markdown" && "active")}
              title={filePath ?? title}
              onClick={() => onViewChange("markdown")}
              onContextMenu={onFileContextMenu}
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
          <div className="workspace-leaf markdown-leaf">
            {children}
            {editorStatus}
          </div>
        </div>
        <div
          className="center-graph-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize graph view"
          onPointerDown={onGraphResizePointerDown}
        />
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
          onContextMenu={onFileContextMenu}
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
      <div className="workspace-leaf markdown-leaf">
        {children}
        {editorStatus}
      </div>
    </section>
  );
}
