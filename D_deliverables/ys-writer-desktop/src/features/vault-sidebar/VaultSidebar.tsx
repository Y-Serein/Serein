import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { FileText, Folder, FolderOpen, RotateCcw, Search, Trash2, Edit3 } from "lucide-react";
import type { LeftPanelTab } from "../../app/store/appStore";
import type { AppLanguage, appText } from "../../app/i18n";
import type { VaultTreeEntry } from "../../app/types";
import type { Note } from "../../domain/model";
import type { OutlineItem } from "../../shared/markdown";
import type { VaultIndex } from "../../vault";
import { searchVaultIndex } from "../../vault";
import { Button, IconButton, SegmentedTabs, cx } from "../../shared/ui";

type TextBundle = (typeof appText)[AppLanguage];

type VaultSidebarProps = {
  t: TextBundle;
  tab: LeftPanelTab;
  vaultMode: boolean;
  vaultRoot: string | null;
  vaultTree: VaultTreeEntry | null;
  vaultIndex: VaultIndex | null;
  vaultError: string | null;
  vaultRecoveryBlocked: boolean;
  expandedDirs: Set<string>;
  selectedVaultDir: string;
  activeFilePath: string | null;
  activeNote: Note;
  notes: Note[];
  outline: OutlineItem[];
  searchFocusSignal: number;
  onTabChange: (tab: LeftPanelTab) => void;
  onDispatchCommand: (commandId: string) => void;
  onOpenMarkdownFile: (path: string) => void;
  onVaultError: (message: string | null) => void;
  onVaultDirectoryClick: (entry: VaultTreeEntry) => void;
  onRenameVaultEntry: (entry: VaultTreeEntry) => void;
  onDeleteVaultEntry: (entry: VaultTreeEntry) => void;
  onEntryContextMenu: (entry: VaultTreeEntry, event: ReactMouseEvent<HTMLElement>) => void;
  onClearVaultState: () => void;
  onOutlineClick: (index: number) => void;
  onSelectNote: (noteId: string) => void;
};

function VaultEntry({
  entry,
  depth,
  t,
  expandedDirs,
  selectedVaultDir,
  activeFilePath,
  onOpenMarkdownFile,
  onVaultError,
  onVaultDirectoryClick,
  onRenameVaultEntry,
  onDeleteVaultEntry,
  onEntryContextMenu,
}: {
  entry: VaultTreeEntry;
  depth: number;
  t: TextBundle;
  expandedDirs: Set<string>;
  selectedVaultDir: string;
  activeFilePath: string | null;
  onOpenMarkdownFile: (path: string) => void;
  onVaultError: (message: string | null) => void;
  onVaultDirectoryClick: (entry: VaultTreeEntry) => void;
  onRenameVaultEntry: (entry: VaultTreeEntry) => void;
  onDeleteVaultEntry: (entry: VaultTreeEntry) => void;
  onEntryContextMenu: (entry: VaultTreeEntry, event: ReactMouseEvent<HTMLElement>) => void;
}) {
  const isDirectory = entry.kind === "directory";
  const expanded = entry.relativePath === ""
    || (expandedDirs.has(entry.relativePath) && (entry.loaded || entry.loading || entry.children.length > 0));
  const showDirectorySelection = !activeFilePath;

  return (
    <div className="workspace-entry">
      <div
        className={cx(
          "workspace-row",
          entry.kind,
          entry.path === activeFilePath && "active",
          isDirectory && showDirectorySelection && entry.relativePath === selectedVaultDir && "selected",
        )}
        style={{ "--tree-depth": depth } as CSSProperties}
        onContextMenu={(event) => onEntryContextMenu(entry, event)}
      >
        <button
          type="button"
          className="workspace-name"
          onClick={() => {
            if (isDirectory) {
              onVaultDirectoryClick(entry);
              return;
            }

            try {
              onOpenMarkdownFile(entry.path);
            } catch (error) {
              console.error("Failed to open vault file", error);
              onVaultError(t.errors.openVaultFileFailed);
            }
          }}
        >
          <span className="workspace-disclosure" aria-hidden="true">
            {isDirectory ? (entry.loading ? "..." : (expanded ? <FolderOpen size={14} /> : <Folder size={14} />)) : <FileText size={14} />}
          </span>
          <span className="workspace-label" title={entry.name}>{entry.name}</span>
        </button>
        {entry.relativePath ? (
          <div className="workspace-actions">
            <IconButton icon={<Edit3 size={13} />} label={t.prompts.renameAction} onClick={() => onRenameVaultEntry(entry)} />
            <IconButton icon={<Trash2 size={13} />} label={t.prompts.deleteAction} onClick={() => onDeleteVaultEntry(entry)} />
          </div>
        ) : null}
      </div>
      {entry.loadError ? (
        <p className="workspace-entry-note" style={{ "--tree-depth": depth } as CSSProperties}>{entry.loadError}</p>
      ) : null}
      {entry.truncated ? (
        <p className="workspace-entry-note" style={{ "--tree-depth": depth } as CSSProperties}>{t.sidebar.resultLimitReached}</p>
      ) : null}
      {isDirectory && expanded && entry.children.length ? (
        <div className="workspace-children">
          {entry.children.map((child) => (
            <VaultEntry
              key={child.path}
              entry={child}
              depth={depth + 1}
              t={t}
              expandedDirs={expandedDirs}
              selectedVaultDir={selectedVaultDir}
              activeFilePath={activeFilePath}
              onOpenMarkdownFile={onOpenMarkdownFile}
              onVaultError={onVaultError}
              onVaultDirectoryClick={onVaultDirectoryClick}
              onRenameVaultEntry={onRenameVaultEntry}
              onDeleteVaultEntry={onDeleteVaultEntry}
              onEntryContextMenu={onEntryContextMenu}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function VaultSidebar({
  t,
  tab,
  vaultMode,
  vaultRoot,
  vaultTree,
  vaultIndex,
  vaultError,
  vaultRecoveryBlocked,
  expandedDirs,
  selectedVaultDir,
  activeFilePath,
  activeNote,
  notes,
  outline,
  searchFocusSignal,
  onTabChange,
  onDispatchCommand,
  onOpenMarkdownFile,
  onVaultError,
  onVaultDirectoryClick,
  onRenameVaultEntry,
  onDeleteVaultEntry,
  onEntryContextMenu,
  onClearVaultState,
  onOutlineClick,
  onSelectNote,
}: VaultSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchResults = useMemo(() => searchVaultIndex(vaultIndex, searchQuery, { limit: 60 }), [searchQuery, vaultIndex]);
  const normalizedSearchQuery = searchQuery.trim();
  const searchPrefix = ["@", "/", "#", ":"].includes(normalizedSearchQuery[0]) ? normalizedSearchQuery[0] : "";
  const effectiveSearchQuery = searchPrefix ? normalizedSearchQuery.slice(1).trim() : normalizedSearchQuery;
  const hasSidebarSearchIntent = effectiveSearchQuery.length > 0;
  const searchScopeLabels = useMemo(() => ({
    title: t.knowledge.searchTitle,
    path: t.knowledge.searchPath,
    tag: t.knowledge.searchTag,
    content: t.knowledge.searchContent,
  }), [t.knowledge.searchContent, t.knowledge.searchPath, t.knowledge.searchTag, t.knowledge.searchTitle]);
  const searchScopes = useMemo(() => [
    { prefix: "", label: t.knowledge.searchAll, title: t.knowledge.searchPlaceholder },
    { prefix: "@", label: "@", title: t.knowledge.searchTitle },
    { prefix: "/", label: "/", title: t.knowledge.searchPath },
    { prefix: "#", label: "#", title: t.knowledge.searchTag },
    { prefix: ":", label: ":", title: t.knowledge.searchContent },
  ], [t.knowledge.searchAll, t.knowledge.searchContent, t.knowledge.searchPath, t.knowledge.searchPlaceholder, t.knowledge.searchTag, t.knowledge.searchTitle]);
  const activeSearchPrefix = useMemo(() => {
    return searchPrefix;
  }, [searchPrefix]);
  const setSearchScope = (prefix: string) => {
    setSearchQuery((current) => {
      const trimmed = current.trimStart();
      const currentPrefix = ["@", "/", "#", ":"].includes(trimmed[0]) ? trimmed[0] : "";
      const cleanQuery = currentPrefix ? trimmed.slice(1).trimStart() : current;
      return prefix ? `${prefix}${cleanQuery}` : cleanQuery;
    });
  };
  const sidebarTabs = useMemo(() => [
    { id: "files" as const, label: t.sidebar.files },
    ...(tab === "search" ? [{ id: "search" as const, label: t.sidebar.search }] : []),
    { id: "outline" as const, label: t.sidebar.outline },
  ], [t.sidebar.files, t.sidebar.outline, t.sidebar.search, tab]);

  useEffect(() => {
    if (tab !== "search") return undefined;

    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [searchFocusSignal, tab]);

  return (
    <aside className="left-rail">
      <div className="left-rail-scroll">
        <SegmentedTabs
          className="sidebar-tabs"
          label={t.aria.sidebarSections}
          value={tab}
          items={sidebarTabs}
          onChange={onTabChange}
        />

        {tab === "files" && vaultMode ? (
          <>
            <div className="workspace-root" title={vaultRoot ?? ""}>
              <span>{vaultTree?.name ?? t.sidebar.vault}</span>
              <Button variant="ghost" onClick={() => onDispatchCommand("file.openVault")}>{t.sidebar.open}</Button>
            </div>
            {vaultError ? <p className="workspace-error">{vaultError}</p> : null}
            <nav className="workspace-tree" aria-label={t.sidebar.vaultFiles}>
              {vaultTree ? (
                <VaultEntry
                  entry={vaultTree}
                  depth={0}
                  t={t}
                  expandedDirs={expandedDirs}
                  selectedVaultDir={selectedVaultDir}
                  activeFilePath={activeFilePath}
                  onOpenMarkdownFile={onOpenMarkdownFile}
                  onVaultError={onVaultError}
                  onVaultDirectoryClick={onVaultDirectoryClick}
                  onRenameVaultEntry={onRenameVaultEntry}
                  onDeleteVaultEntry={onDeleteVaultEntry}
                  onEntryContextMenu={onEntryContextMenu}
                />
              ) : (
                <p className="muted">{t.sidebar.loadingVault}</p>
              )}
              {vaultRecoveryBlocked ? (
                <Button variant="ghost" className="workspace-clear" icon={<RotateCcw size={14} />} onClick={onClearVaultState}>
                  {t.sidebar.clearVaultState}
                </Button>
              ) : null}
            </nav>
          </>
        ) : null}

        {tab === "files" && !vaultMode ? (
          <div className="placeholder-list">
            <Button variant="primary" icon={<FolderOpen size={15} />} onClick={() => onDispatchCommand("file.openVault")}>{t.sidebar.openLocalFolder}</Button>
            <Button icon={<FileText size={15} />} onClick={() => onDispatchCommand("file.open")}>{t.sidebar.openStandaloneMarkdown}</Button>
          </div>
        ) : null}

        {tab === "outline" ? (
          <div className="outline-list sidebar-outline" role="tabpanel">
            {outline.length ? outline.map((item, index) => (
              <button
                key={`${item.text}-${index}`}
                type="button"
                className={`outline-item level-${item.level}`}
                onClick={() => onOutlineClick(index)}
              >
                {item.text}
              </button>
            )) : <p className="muted">{t.sidebar.noHeadings}</p>}
          </div>
        ) : null}

        {tab === "search" ? (
          <div className="sidebar-plugin-panel" role="tabpanel">
            <label className="sidebar-search-box">
              <Search size={14} aria-hidden="true" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t.knowledge.searchPlaceholder}
              />
            </label>
            <div className="sidebar-search-scopes" aria-label={t.knowledge.searchPlaceholder}>
              {searchScopes.map((scope) => (
                <button
                  key={scope.prefix || "all"}
                  type="button"
                  className={cx(activeSearchPrefix === scope.prefix && "selected")}
                  aria-label={scope.title}
                  data-tooltip={scope.title}
                  onClick={() => setSearchScope(scope.prefix)}
                >
                  {scope.label}
                </button>
              ))}
            </div>
            <div className="link-list sidebar-search-results">
              {searchResults.length ? searchResults.map((result) => (
                <button
                  key={result.path}
                  type="button"
                  className="link-item search-result-item"
                  onClick={() => onOpenMarkdownFile(result.path)}
                >
                  <Search size={14} aria-hidden="true" />
                  <strong>
                    <span>{result.title}</span>
                    <em className={`search-result-type ${result.matchType}`}>{searchScopeLabels[result.matchType]}</em>
                  </strong>
                  <span>{result.relativePath}</span>
                  <small>{result.snippet}</small>
                </button>
              )) : !hasSidebarSearchIntent ? (
                !vaultMode ? <p className="muted">{t.knowledge.openVaultForGraph}</p> : null
              ) : (
                <p className="muted">{vaultMode ? t.knowledge.noSearchResults : t.knowledge.openVaultForGraph}</p>
              )}
            </div>
          </div>
        ) : null}

        {tab === "files" && !vaultMode ? (
          <>
            <div className="panel-heading compact">
              <span>{t.sidebar.openNotes}</span>
            </div>
            <nav className="card-list" aria-label={t.sidebar.openNotes}>
              {notes.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  className={note.id === activeNote.id ? "card-item active" : "card-item"}
                  onClick={() => onSelectNote(note.id)}
                >
                  <strong>{note.title}</strong>
                  <span>{note.filePath ?? note.markdown.split("\n").find((line) => line.trim() && !line.startsWith("#")) ?? t.sidebar.markdownNote}</span>
                </button>
              ))}
            </nav>
          </>
        ) : null}
      </div>

    </aside>
  );
}
