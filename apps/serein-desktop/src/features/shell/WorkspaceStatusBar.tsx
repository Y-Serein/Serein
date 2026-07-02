import { PencilLine } from "lucide-react";
import type { EditorMode } from "../../app/types";

type WorkspaceEditorStatusBarProps = {
  editorMode: EditorMode;
  modeLabel: string;
};

export function WorkspaceEditorStatusBar({
  editorMode,
  modeLabel,
}: WorkspaceEditorStatusBarProps) {
  return (
    <div className="workspace-editor-status" data-mode={editorMode} aria-label="Editor status">
      <div className="statusbar-section mode" title={modeLabel}>
        <PencilLine size={13} aria-hidden="true" />
        <span>{modeLabel}</span>
      </div>
    </div>
  );
}
