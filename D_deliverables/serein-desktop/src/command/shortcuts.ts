import {
  LEGACY_SHORTCUTS_STORAGE_KEY,
  SHORTCUTS_STORAGE_KEY,
} from "../app/defaults";

export type ShortcutCategory = "File" | "Edit" | "View" | "Theme" | "App";

export type ShortcutEntry = {
  id: string;
  label: string;
  category: ShortcutCategory;
  defaultKeys: string[];
  currentKeys: string[];
  commandId: string;
  editable: boolean;
  enabled: boolean;
};

export type PersistedShortcut = {
  id: string;
  currentKeys: string[];
  enabled: boolean;
};

export type MenuItem = {
  label: string;
  commandId?: string;
  disabled?: boolean;
};

export type MenuGroup = {
  id: string;
  label: string;
  items: MenuItem[];
};

const QUICK_NOTE_SHORTCUT_ID = "app.openQuickNote";
const LEGACY_QUICK_NOTE_DEFAULT_KEY = "Alt+Q";
const QUICK_NOTE_DEFAULT_KEY = "Alt+W";

let lastShortcutsJson: string | null = null;

export const defaultShortcutRegistry: ShortcutEntry[] = [
  { id: "file.new", label: "New note", category: "File", defaultKeys: ["Ctrl+N"], currentKeys: ["Ctrl+N"], commandId: "file.new", editable: true, enabled: true },
  { id: "file.open", label: "Open file", category: "File", defaultKeys: ["Ctrl+O"], currentKeys: ["Ctrl+O"], commandId: "file.open", editable: true, enabled: true },
  { id: "file.openVault", label: "Open vault", category: "File", defaultKeys: ["Ctrl+Shift+O"], currentKeys: ["Ctrl+Shift+O"], commandId: "file.openVault", editable: true, enabled: true },
  { id: "file.save", label: "Save file", category: "File", defaultKeys: ["Ctrl+S"], currentKeys: ["Ctrl+S"], commandId: "file.save", editable: true, enabled: true },
  { id: "file.saveAs", label: "Save as", category: "File", defaultKeys: ["Ctrl+Shift+S"], currentKeys: ["Ctrl+Shift+S"], commandId: "file.saveAs", editable: true, enabled: true },
  { id: "file.export", label: "Export", category: "File", defaultKeys: ["Ctrl+Shift+E"], currentKeys: ["Ctrl+Shift+E"], commandId: "file.export", editable: true, enabled: true },
  { id: "app.openQuickOpen", label: "Quick open", category: "App", defaultKeys: ["Ctrl+P"], currentKeys: ["Ctrl+P"], commandId: "app.openQuickOpen", editable: true, enabled: true },
  { id: QUICK_NOTE_SHORTCUT_ID, label: "Quick note", category: "App", defaultKeys: [QUICK_NOTE_DEFAULT_KEY], currentKeys: [QUICK_NOTE_DEFAULT_KEY], commandId: "app.openQuickNote", editable: true, enabled: true },
  { id: "app.openCommandPalette", label: "Command palette", category: "App", defaultKeys: ["Ctrl+Shift+P"], currentKeys: ["Ctrl+Shift+P"], commandId: "app.openCommandPalette", editable: true, enabled: true },
  { id: "app.openSettings", label: "Open settings", category: "App", defaultKeys: ["Ctrl+,"], currentKeys: ["Ctrl+,"], commandId: "app.openSettings", editable: true, enabled: true },
  { id: "app.revealWindow", label: "Show Serein", category: "App", defaultKeys: ["Alt+S"], currentKeys: ["Alt+S"], commandId: "app.revealWindow", editable: true, enabled: true },
  { id: "edit.cut", label: "Cut", category: "Edit", defaultKeys: ["Ctrl+X"], currentKeys: ["Ctrl+X"], commandId: "edit.cut", editable: true, enabled: true },
  { id: "edit.copy", label: "Copy", category: "Edit", defaultKeys: ["Ctrl+C"], currentKeys: ["Ctrl+C"], commandId: "edit.copy", editable: true, enabled: true },
  { id: "edit.paste", label: "Paste", category: "Edit", defaultKeys: ["Ctrl+V"], currentKeys: ["Ctrl+V"], commandId: "edit.paste", editable: true, enabled: true },
  { id: "edit.selectAll", label: "Select all", category: "Edit", defaultKeys: ["Ctrl+A"], currentKeys: ["Ctrl+A"], commandId: "edit.selectAll", editable: true, enabled: true },
  { id: "edit.find", label: "Search", category: "Edit", defaultKeys: ["Ctrl+F"], currentKeys: ["Ctrl+F"], commandId: "edit.find", editable: true, enabled: true },
  { id: "edit.undo", label: "Undo", category: "Edit", defaultKeys: ["Ctrl+Z"], currentKeys: ["Ctrl+Z"], commandId: "edit.undo", editable: true, enabled: true },
  { id: "edit.redo", label: "Redo", category: "Edit", defaultKeys: ["Ctrl+Y", "Ctrl+Shift+Z"], currentKeys: ["Ctrl+Y", "Ctrl+Shift+Z"], commandId: "edit.redo", editable: true, enabled: true },
  { id: "view.plain", label: "Plain Edit", category: "View", defaultKeys: ["Ctrl+Alt+P"], currentKeys: ["Ctrl+Alt+P"], commandId: "view.setPlainEdit", editable: true, enabled: true },
  { id: "view.rich", label: "Rich Edit", category: "View", defaultKeys: ["Ctrl+Alt+R"], currentKeys: ["Ctrl+Alt+R"], commandId: "view.setRichEdit", editable: true, enabled: true },
];

export const menuGroups: MenuGroup[] = [
  {
    id: "file",
    label: "文件",
    items: [
      { label: "新建笔记", commandId: "file.new" },
      { label: "新建文件夹", commandId: "file.newFolder" },
      { label: "打开文件", commandId: "file.open" },
      { label: "打开 Vault", commandId: "file.openVault" },
      { label: "快速打开", commandId: "app.openQuickOpen" },
      { label: "快捷便签", commandId: "app.openQuickNote" },
      { label: "保存", commandId: "file.save" },
      { label: "另存为", commandId: "file.saveAs" },
      { label: "导出", commandId: "file.export" },
      { label: "偏好设置", commandId: "app.openSettings" },
    ],
  },
  {
    id: "edit",
    label: "编辑",
    items: [
      { label: "撤销", commandId: "edit.undo" },
      { label: "重做", commandId: "edit.redo" },
      { label: "剪切", commandId: "edit.cut" },
      { label: "复制", commandId: "edit.copy" },
      { label: "粘贴", commandId: "edit.paste" },
      { label: "全选", commandId: "edit.selectAll" },
      { label: "搜索", commandId: "edit.find" },
    ],
  },
  {
    id: "paragraph",
    label: "段落",
    items: [
      { label: "正文", commandId: "paragraph.text" },
      { label: "标题1", commandId: "paragraph.heading1" },
      { label: "标题2", commandId: "paragraph.heading2" },
      { label: "标题3", commandId: "paragraph.heading3" },
      { label: "引用", commandId: "paragraph.blockquote" },
      { label: "无序列表", commandId: "paragraph.bulletList" },
      { label: "有序列表", commandId: "paragraph.orderedList" },
      { label: "代码块", commandId: "paragraph.codeBlock" },
      { label: "表格", commandId: "paragraph.table" },
    ],
  },
  {
    id: "format",
    label: "格式",
    items: [
      { label: "加粗", commandId: "format.bold" },
      { label: "斜体", commandId: "format.italic" },
      { label: "行内代码", commandId: "format.inlineCode" },
      { label: "删除线", commandId: "format.strike" },
      { label: "链接", commandId: "format.link" },
      { label: "图片", commandId: "format.image" },
    ],
  },
  {
    id: "view",
    label: "视图",
    items: [
      { label: "Plain Edit", commandId: "view.setPlainEdit" },
      { label: "Rich Edit", commandId: "view.setRichEdit" },
      { label: "显示/隐藏左栏", commandId: "view.toggleSidebar" },
      { label: "知识面板", commandId: "view.toggleRightPanel" },
      { label: "命令面板", commandId: "app.openCommandPalette" },
    ],
  },
  {
    id: "theme",
    label: "主题",
    items: [
      { label: "青霜", commandId: "theme.mint" },
      { label: "护眼", commandId: "theme.eye" },
      { label: "纸页", commandId: "theme.v5" },
      { label: "雾蓝", commandId: "theme.ink" },
      { label: "深夜", commandId: "theme.daily" },
    ],
  },
  {
    id: "help",
    label: "帮助",
    items: [
      { label: "使用手册", commandId: "app.openVaultQuickstart" },
      { label: "快捷键", commandId: "app.openShortcuts" },
      { label: "关于", commandId: "app.about" },
    ],
  },
];

export function normalizeShortcutText(value: string) {
  const parts = value.split("+").map((part) => part.trim()).filter(Boolean);
  const modifiers: string[] = [];
  let key = "";

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === "ctrl" || lower === "control") {
      if (!modifiers.includes("Ctrl")) modifiers.push("Ctrl");
    } else if (lower === "shift") {
      if (!modifiers.includes("Shift")) modifiers.push("Shift");
    } else if (lower === "alt" || lower === "option") {
      if (!modifiers.includes("Alt")) modifiers.push("Alt");
    } else if (lower === "meta" || lower === "cmd" || lower === "command") {
      if (!modifiers.includes("Meta")) modifiers.push("Meta");
    } else if (lower === "escape" || lower === "esc") {
      key = "Esc";
    } else if (lower === "space") {
      key = "Space";
    } else if (part.length === 1) {
      key = part.toUpperCase();
    } else {
      key = part.slice(0, 1).toUpperCase() + part.slice(1);
    }
  }

  if (!key) return "";
  return [...modifiers, key].join("+");
}

export function normalizeShortcutList(value: string) {
  const normalized = value
    .split(/,\s*/)
    .map((item) => normalizeShortcutText(item))
    .filter(Boolean);

  return Array.from(new Set(normalized));
}

export function readShortcuts(): ShortcutEntry[] {
  if (typeof window === "undefined") return defaultShortcutRegistry;

  try {
    const raw = window.localStorage.getItem(SHORTCUTS_STORAGE_KEY)
      ?? window.localStorage.getItem(LEGACY_SHORTCUTS_STORAGE_KEY);
    if (!raw) return defaultShortcutRegistry;

    const persisted = JSON.parse(raw) as PersistedShortcut[];
    if (!Array.isArray(persisted)) return defaultShortcutRegistry;

    return defaultShortcutRegistry.map((shortcut) => {
      const saved = persisted.find((item) => {
        const legacy = item as PersistedShortcut & { commandId?: string };
        return legacy.id === shortcut.id || legacy.commandId === shortcut.commandId;
      });
      if (!saved) return shortcut;

      const currentKeys = Array.isArray(saved.currentKeys)
        ? saved.currentKeys.map((key) => normalizeShortcutText(key)).filter(Boolean)
        : shortcut.currentKeys;
      const shouldMigrateQuickNoteDefault = shortcut.id === QUICK_NOTE_SHORTCUT_ID
        && currentKeys.length === 1
        && currentKeys[0] === LEGACY_QUICK_NOTE_DEFAULT_KEY;

      return {
        ...shortcut,
        currentKeys: shouldMigrateQuickNoteDefault ? shortcut.currentKeys : currentKeys,
        enabled: typeof saved.enabled === "boolean" ? saved.enabled : shortcut.enabled,
      };
    });
  } catch (error) {
    console.warn("Failed to read shortcuts", error);
    return defaultShortcutRegistry;
  }
}

export function writeShortcuts(shortcuts: ShortcutEntry[]) {
  const payload: PersistedShortcut[] = shortcuts.map(({ id, currentKeys, enabled }) => ({
    id,
    currentKeys,
    enabled,
  }));
  const serialized = JSON.stringify(payload);
  if (serialized === lastShortcutsJson) return;
  window.localStorage.setItem(SHORTCUTS_STORAGE_KEY, serialized);
  lastShortcutsJson = serialized;
}

export function shortcutFromEvent(event: KeyboardEvent) {
  if (event.key === "Control" || event.key === "Shift" || event.key === "Alt" || event.key === "Meta") {
    return "";
  }

  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.shiftKey) parts.push("Shift");
  if (event.altKey) parts.push("Alt");
  if (event.metaKey) parts.push("Meta");

  let key = event.key;
  if (key === " ") key = "Space";
  if (key === "Escape") key = "Esc";
  if (key.length === 1) key = key.toUpperCase();

  parts.push(key);
  return parts.join("+");
}

export function getShortcutForCommand(shortcuts: ShortcutEntry[], commandId?: string) {
  if (!commandId) return "";
  const shortcut = shortcuts.find((item) => item.commandId === commandId && item.enabled && item.currentKeys.length);
  return shortcut?.currentKeys.join(" / ") ?? "";
}

export function findShortcutConflicts(shortcuts: ShortcutEntry[]) {
  const keyOwners = new Map<string, ShortcutEntry[]>();

  for (const shortcut of shortcuts) {
    if (!shortcut.enabled) continue;

    for (const key of shortcut.currentKeys) {
      const owners = keyOwners.get(key) ?? [];
      owners.push(shortcut);
      keyOwners.set(key, owners);
    }
  }

  return new Map(
    Array.from(keyOwners.entries())
      .filter(([, owners]) => new Set(owners.map((owner) => owner.commandId)).size > 1),
  );
}
