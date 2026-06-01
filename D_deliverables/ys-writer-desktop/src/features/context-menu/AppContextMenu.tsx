import type { CSSProperties } from "react";
import {
  Bold,
  Clipboard,
  Code2,
  Copy,
  FileText,
  FolderOpen,
  Image,
  Italic,
  Link2,
  List,
  ListOrdered,
  PanelRight,
  Quote,
  RotateCcw,
  Save,
  Scissors,
  Search,
  Settings,
  Table2,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import { cx } from "../../shared/ui";

export type ContextMenuIcon =
  | "bold"
  | "code"
  | "copy"
  | "cut"
  | "file"
  | "folder"
  | "image"
  | "italic"
  | "link"
  | "list"
  | "orderedList"
  | "panel"
  | "paste"
  | "quote"
  | "redo"
  | "save"
  | "search"
  | "settings"
  | "table"
  | "text"
  | "trash"
  | "undo";

export type AppContextMenuItem = {
  id: string;
  label: string;
  shortcut?: string;
  icon?: ContextMenuIcon;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
  onSelect: () => void;
};

type AppContextMenuProps = {
  x: number;
  y: number;
  items: AppContextMenuItem[];
  variant?: "default" | "editor";
  submenuLabels?: {
    paragraph: string;
    insert: string;
  };
  onClose: () => void;
};

const iconMap = {
  bold: Bold,
  code: Code2,
  copy: Copy,
  cut: Scissors,
  file: FileText,
  folder: FolderOpen,
  image: Image,
  italic: Italic,
  link: Link2,
  list: List,
  orderedList: ListOrdered,
  panel: PanelRight,
  paste: Clipboard,
  quote: Quote,
  redo: RotateCcw,
  save: Save,
  search: Search,
  settings: Settings,
  table: Table2,
  text: Type,
  trash: Trash2,
  undo: Undo2,
} satisfies Record<ContextMenuIcon, typeof Bold>;

const editorQuickActionIds = new Set(["edit.cut", "edit.copy", "edit.paste"]);
const editorFormatActionIds = new Set([
  "format.bold",
  "format.italic",
  "format.inlineCode",
  "format.link",
  "paragraph.blockquote",
  "paragraph.bulletList",
  "paragraph.orderedList",
  "paragraph.table",
  "format.image",
]);

function MenuButton({ item, compact, onClose }: {
  item: AppContextMenuItem;
  compact?: boolean;
  onClose: () => void;
}) {
  const Icon = item.icon ? iconMap[item.icon] : null;
  return (
    <button
      key={item.id}
      type="button"
      role="menuitem"
      title={compact ? item.label : undefined}
      className={cx(item.separatorBefore && "separated", item.danger && "danger", compact && "compact")}
      disabled={item.disabled}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={() => {
        if (item.disabled) return;
        item.onSelect();
        onClose();
      }}
    >
      <span className="context-menu-icon">{Icon ? <Icon size={14} /> : null}</span>
      {!compact ? <span>{item.label}</span> : null}
      {!compact && item.shortcut ? <kbd>{item.shortcut}</kbd> : null}
    </button>
  );
}

export function AppContextMenu({ x, y, items, variant = "default", submenuLabels, onClose }: AppContextMenuProps) {
  const quickItems = variant === "editor" ? items.filter((item) => editorQuickActionIds.has(item.id)) : [];
  const formatItems = variant === "editor" ? items.filter((item) => editorFormatActionIds.has(item.id)) : [];
  const listItems = variant === "editor"
    ? items.filter((item) => !editorQuickActionIds.has(item.id) && !editorFormatActionIds.has(item.id))
    : items;

  return (
    <div className="context-menu-layer" onMouseDown={onClose} onContextMenu={(event) => event.preventDefault()}>
      <div
        className={cx("app-context-menu", variant === "editor" && "editor-context-menu")}
        role="menu"
        style={{ "--context-x": `${x}px`, "--context-y": `${y}px` } as CSSProperties}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        {quickItems.length ? (
          <div className="context-menu-quick-row">
            {quickItems.map((item) => <MenuButton key={item.id} item={item} compact onClose={onClose} />)}
        </div>
        ) : null}

        {listItems.map((item) => <MenuButton key={item.id} item={item} onClose={onClose} />)}

        {formatItems.length ? (
          <div className="context-menu-tool-grid">
            {formatItems.map((item) => <MenuButton key={item.id} item={item} compact onClose={onClose} />)}
          </div>
        ) : null}

        {variant === "editor" ? (
          <div className="context-menu-submenus">
            <div className="context-menu-submenu-row"><span>{submenuLabels?.paragraph ?? "Paragraph"}</span><span>&gt;</span></div>
            <div className="context-menu-submenu-row"><span>{submenuLabels?.insert ?? "Insert"}</span><span>&gt;</span></div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
