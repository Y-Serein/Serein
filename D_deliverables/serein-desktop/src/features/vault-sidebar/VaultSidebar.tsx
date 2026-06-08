import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { Clock3, FileText, Folder, FolderOpen, RotateCcw, Search, Trash2, Edit3 } from "lucide-react";
import type { LeftPanelTab } from "../../app/store/appStore";
import type { AppLanguage, appText } from "../../app/i18n";
import type { VaultTreeEntry } from "../../app/types";
import type { Note } from "../../domain/model";
import type { OutlineItem } from "../../shared/markdown";
import type { VaultIndex, VaultIndexedFile } from "../../vault";
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
  activeIndexedFile: VaultIndexedFile | null | undefined;
  vaultError: string | null;
  vaultRecoveryBlocked: boolean;
  expandedDirs: Set<string>;
  selectedVaultDir: string;
  activeFilePath: string | null;
  activeNote: Note;
  notes: Note[];
  outline: OutlineItem[];
  searchFocusSignal: number;
  searchFocusQuery: string;
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
  onReturnToEditor: () => void;
};

const SEARCH_HISTORY_STORAGE_KEY = "serein.sidebar.searchHistory.v1";
const MAX_SEARCH_HISTORY_ITEMS = 20;

function normalizeSearchHistoryItem(query: string) {
  return query.replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function readSearchHistory() {
  try {
    const raw = window.localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map(normalizeSearchHistoryItem)
      .filter(Boolean)
      .slice(0, MAX_SEARCH_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

function writeSearchHistory(items: string[]) {
  try {
    window.localStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Search history is a convenience feature; storage failures should not block search.
  }
}

function protectTextInputShortcut(event: ReactKeyboardEvent<HTMLInputElement>) {
  if (!(event.ctrlKey || event.metaKey)) return false;
  const key = event.key.toLowerCase();
  if (["a", "c", "x", "v", "z", "y"].includes(key)) {
    event.stopPropagation();
    return true;
  }
  if (key === "f") {
    event.preventDefault();
    event.stopPropagation();
    return true;
  }
  return false;
}

function highlightedSearchText(text: string, query: string): ReactNode {
  const needle = normalizeSearchHistoryItem(query);
  if (!needle) return text;

  const lowerText = text.toLocaleLowerCase();
  const lowerNeedle = needle.toLocaleLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let matchIndex = lowerText.indexOf(lowerNeedle, cursor);
  let key = 0;

  while (matchIndex >= 0 && parts.length < 25) {
    if (matchIndex > cursor) parts.push(text.slice(cursor, matchIndex));
    const end = matchIndex + needle.length;
    parts.push(<mark key={`hit-${key}`} className="search-match">{text.slice(matchIndex, end)}</mark>);
    cursor = end;
    key += 1;
    matchIndex = lowerText.indexOf(lowerNeedle, cursor);
  }

  if (!parts.length) return text;
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

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
  activeIndexedFile,
  vaultError,
  vaultRecoveryBlocked,
  expandedDirs,
  selectedVaultDir,
  activeFilePath,
  activeNote,
  notes,
  outline,
  searchFocusSignal,
  searchFocusQuery,
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
  onReturnToEditor,
}: VaultSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHistory, setSearchHistory] = useState<string[]>(() => readSearchHistory());
  const [searchHistoryDeleteMode, setSearchHistoryDeleteMode] = useState(false);
  const [selectedSearchResultIndex, setSelectedSearchResultIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const selectedSearchResultRef = useRef<HTMLButtonElement | null>(null);
  const searchResults = useMemo(
    () => searchVaultIndex(vaultIndex, searchQuery, { limit: 60, draftFile: activeIndexedFile }),
    [activeIndexedFile, searchQuery, vaultIndex],
  );
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
    { prefix: "@", label: "@", title: t.knowledge.searchTag },
    { prefix: "/", label: "/", title: t.knowledge.searchPath },
    { prefix: "#", label: "#", title: t.knowledge.searchTitle },
    { prefix: ":", label: ":", title: t.knowledge.searchContent },
  ], [t.knowledge.searchAll, t.knowledge.searchContent, t.knowledge.searchPath, t.knowledge.searchPlaceholder, t.knowledge.searchTag, t.knowledge.searchTitle]);
  const activeSearchPrefix = useMemo(() => {
    return searchPrefix;
  }, [searchPrefix]);
  const highlightedQuery = effectiveSearchQuery;
  const rememberSearchQuery = useCallback((query: string) => {
    const normalized = normalizeSearchHistoryItem(query);
    if (!normalized) return;
    setSearchHistory((current) => {
      const next = [normalized, ...current.filter((item) => item.toLocaleLowerCase() !== normalized.toLocaleLowerCase())]
        .slice(0, MAX_SEARCH_HISTORY_ITEMS);
      writeSearchHistory(next);
      return next;
    });
  }, []);
  const deleteSearchHistoryItem = useCallback((query: string) => {
    setSearchHistory((current) => {
      const next = current.filter((item) => item !== query);
      writeSearchHistory(next);
      return next;
    });
  }, []);
  const clearSearchHistory = useCallback(() => {
    setSearchHistory([]);
    setSearchHistoryDeleteMode(false);
    writeSearchHistory([]);
  }, []);
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
    const focusQuery = normalizeSearchHistoryItem(searchFocusQuery);
    if (focusQuery) {
      setSearchQuery(focusQuery);
      rememberSearchQuery(focusQuery);
    }

    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [rememberSearchQuery, searchFocusQuery, searchFocusSignal, tab]);

  useEffect(() => {
    setSelectedSearchResultIndex(searchResults.length ? 0 : -1);
  }, [searchQuery, searchResults.length]);

  useEffect(() => {
    if (tab !== "search" || selectedSearchResultIndex < 0) return;
    selectedSearchResultRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedSearchResultIndex, tab]);

  const openSelectedSearchResult = useCallback((index: number) => {
    const result = searchResults[index];
    if (!result) return;
    rememberSearchQuery(searchQuery);
    onOpenMarkdownFile(result.path);
  }, [onOpenMarkdownFile, rememberSearchQuery, searchQuery, searchResults]);

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
                onKeyDown={(event) => {
                  if (protectTextInputShortcut(event)) return;
                  if ((event.key === "ArrowDown" || event.key === "ArrowUp") && searchResults.length) {
                    event.preventDefault();
                    const direction = event.key === "ArrowDown" ? 1 : -1;
                    setSelectedSearchResultIndex((current) => {
                      const base = current < 0 ? 0 : current;
                      return (base + direction + searchResults.length) % searchResults.length;
                    });
                    return;
                  }
                  if (event.key === "Enter" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
                    const query = normalizeSearchHistoryItem(searchQuery);
                    if (!query) return;
                    event.preventDefault();
                    if (searchResults.length) {
                      openSelectedSearchResult(selectedSearchResultIndex >= 0 ? selectedSearchResultIndex : 0);
                    } else {
                      rememberSearchQuery(query);
                    }
                    return;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    if (searchHistoryDeleteMode) {
                      setSearchHistoryDeleteMode(false);
                      return;
                    }
                    if (searchQuery) {
                      setSearchQuery("");
                      return;
                    }
                    onReturnToEditor();
                  }
                }}
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
            {!hasSidebarSearchIntent && searchHistory.length ? (
              <section className="sidebar-search-history" aria-label={t.knowledge.searchHistory}>
                <header>
                  <span>{t.knowledge.searchHistory}</span>
                  <div>
                    <button
                      type="button"
                      className={cx(searchHistoryDeleteMode && "active")}
                      onClick={() => setSearchHistoryDeleteMode((enabled) => !enabled)}
                    >
                      {searchHistoryDeleteMode ? t.knowledge.searchHistoryDone : t.knowledge.searchHistoryDelete}
                    </button>
                    {searchHistoryDeleteMode ? (
                      <button type="button" onClick={clearSearchHistory}>{t.knowledge.clearSearchHistory}</button>
                    ) : null}
                  </div>
                </header>
                <div className="sidebar-search-history-list">
                  {searchHistory.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={cx("search-history-item", searchHistoryDeleteMode && "delete-mode")}
                      onClick={() => {
                        if (searchHistoryDeleteMode) {
                          deleteSearchHistoryItem(item);
                          return;
                        }
                        setSearchQuery(item);
                        rememberSearchQuery(item);
                      }}
                      title={item}
                    >
                      {searchHistoryDeleteMode ? <Trash2 size={13} aria-hidden="true" /> : <Clock3 size={13} aria-hidden="true" />}
                      <span>{item}</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
            <div className="link-list sidebar-search-results">
              {searchResults.length ? searchResults.map((result, index) => (
                <button
                  key={result.path}
                  ref={index === selectedSearchResultIndex ? selectedSearchResultRef : null}
                  type="button"
                  className={cx("link-item search-result-item", index === selectedSearchResultIndex && "selected")}
                  aria-current={index === selectedSearchResultIndex ? "true" : undefined}
                  onClick={() => {
                    setSelectedSearchResultIndex(index);
                    rememberSearchQuery(searchQuery);
                    onOpenMarkdownFile(result.path);
                  }}
                >
                  <Search size={14} aria-hidden="true" />
                  <strong>
                    <span>{highlightedSearchText(result.title, highlightedQuery)}</span>
                    <em className={`search-result-type ${result.matchType}`}>{searchScopeLabels[result.matchType]}</em>
                  </strong>
                  <span>{highlightedSearchText(result.relativePath, highlightedQuery)}</span>
                  <small>{highlightedSearchText(result.snippet, highlightedQuery)}</small>
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
