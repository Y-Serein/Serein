import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { Clock3, FileText, Folder, FolderOpen, RotateCcw, Search, Trash2, Edit3 } from "lucide-react";
import type { LeftPanelTab, VaultIndexStatus } from "../../app/store/appStore";
import type { AppLanguage, appText } from "../../app/i18n";
import type { VaultTreeEntry } from "../../app/types";
import type { Note } from "../../domain/model";
import { normalizeFilePath } from "../../shared/markdown";
import type { OutlineItem } from "../../shared/markdown";
import type { VaultIndex, VaultIndexedFile, VaultSearchResult } from "../../vault";
import { searchVaultIndexAsync } from "../../vault";
import { Button, IconButton, SegmentedTabs, cx } from "../../shared/ui";

type TextBundle = (typeof appText)[AppLanguage];

type VaultSidebarProps = {
  t: TextBundle;
  tab: LeftPanelTab;
  vaultMode: boolean;
  vaultRoot: string | null;
  vaultTree: VaultTreeEntry | null;
  vaultIndex: VaultIndex | null;
  vaultIndexStatus: VaultIndexStatus;
  activeIndexedFile: VaultIndexedFile | null | undefined;
  vaultError: string | null;
  vaultRecoveryBlocked: boolean;
  tagFeaturesEnabled: boolean;
  expandedDirs: Set<string>;
  selectedVaultDir: string;
  activeFilePath: string | null;
  activeNote: Note;
  notes: Note[];
  outline: OutlineItem[];
  searchFocusSignal: number;
  searchFocusQuery: string;
  searchNavigationSignal: number;
  searchNavigationDirection: 1 | -1;
  onTabChange: (tab: LeftPanelTab) => void;
  onDispatchCommand: (commandId: string) => void;
  onOpenMarkdownFile: (path: string, options?: { targetLine?: number | null; targetText?: string | null }) => void;
  onOpenCurrentSourceLocation: (line: number, text?: string | null) => void;
  onVaultError: (message: string | null) => void;
  onRequestVaultIndex: () => void;
  onSearchVaultTags: (query: string) => Promise<VaultSearchResult[]>;
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

type SidebarSearchResult = Omit<VaultSearchResult, "path"> & {
  path: string | null;
  line?: number;
  matchedText?: string;
  resultKey: string;
};

function searchPrefixFromQuery(query: string) {
  const prefix = query.trim()[0] ?? "";
  return ["@", "/", "#", ":", "："].includes(prefix) ? prefix : "";
}

function localSearchSnippet(line: string, matchIndex: number, matchLength: number) {
  const start = Math.max(0, matchIndex - 48);
  const end = Math.min(line.length, matchIndex + matchLength + 72);
  const snippet = line.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "..." : ""}${snippet}${end < line.length ? "..." : ""}`;
}

function searchCurrentDocument(note: Note, query: string, limit = 80): SidebarSearchResult[] {
  const cleanQuery = normalizeSearchHistoryItem(query);
  if (!cleanQuery) return [];

  const lowerQuery = cleanQuery.toLocaleLowerCase();
  const lines = note.markdown.split(/\r?\n/);
  const title = note.title || note.fileName || "Current document";
  const relativePath = note.fileName ?? title;
  const results: SidebarSearchResult[] = [];

  for (let index = 0; index < lines.length && results.length < limit; index += 1) {
    const line = lines[index];
    const matchIndex = line.toLocaleLowerCase().indexOf(lowerQuery);
    if (matchIndex < 0) continue;

    results.push({
      path: note.filePath ?? null,
      relativePath,
      title,
      matchType: "content",
      snippet: localSearchSnippet(line, matchIndex, cleanQuery.length),
      line: index + 1,
      matchedText: line.slice(matchIndex, matchIndex + cleanQuery.length),
      resultKey: `current:${note.id}:${index + 1}:${matchIndex}`,
    });
  }

  return results;
}

function sidebarSearchResultFromVault(result: VaultSearchResult): SidebarSearchResult {
  return {
    ...result,
    resultKey: `${result.path}:${result.line ?? 0}:${result.matchedText ?? result.snippet}`,
  };
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
  vaultIndexStatus,
  activeIndexedFile,
  vaultError,
  vaultRecoveryBlocked,
  tagFeaturesEnabled,
  expandedDirs,
  selectedVaultDir,
  activeFilePath,
  activeNote,
  notes,
  outline,
  searchFocusSignal,
  searchFocusQuery,
  searchNavigationSignal,
  searchNavigationDirection,
  onTabChange,
  onDispatchCommand,
  onOpenMarkdownFile,
  onOpenCurrentSourceLocation,
  onVaultError,
  onRequestVaultIndex,
  onSearchVaultTags,
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
  const handledSearchNavigationSignalRef = useRef(0);
  const requestedSearchIndexKeyRef = useRef("");
  const tagSearchRequestIdRef = useRef(0);
  const [searchResults, setSearchResults] = useState<VaultSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [tagSearchResults, setTagSearchResults] = useState<VaultSearchResult[]>([]);
  const [tagSearchLoading, setTagSearchLoading] = useState(false);
  const normalizedSearchQuery = searchQuery.trim();
  const searchPrefix = searchPrefixFromQuery(normalizedSearchQuery);
  const isLocalDocumentSearch = searchPrefix === "";
  const isGlobalVaultSearch = searchPrefix !== "";
  const tagSearchDisabled = searchPrefix === "@" && !tagFeaturesEnabled;
  const effectiveSearchQuery = searchPrefix ? normalizedSearchQuery.slice(1).trim() : normalizedSearchQuery;
  const vaultSearchQuery = searchPrefix === "：" ? `:${effectiveSearchQuery}` : searchQuery;
  const hasSidebarSearchIntent = effectiveSearchQuery.length > 0;
  const currentDocumentResults = useMemo(() => (
    isLocalDocumentSearch && hasSidebarSearchIntent
      ? searchCurrentDocument(activeNote, effectiveSearchQuery)
      : []
  ), [activeNote, effectiveSearchQuery, hasSidebarSearchIntent, isLocalDocumentSearch]);
  const vaultSearchResults = useMemo(() => (
    (searchResults.length ? searchResults : tagSearchResults).map(sidebarSearchResultFromVault)
  ), [searchResults, tagSearchResults]);
  const effectiveSearchResults = isLocalDocumentSearch ? currentDocumentResults : vaultSearchResults;
  const searchScopeLabels = useMemo(() => ({
    title: t.knowledge.searchTitle,
    path: t.knowledge.searchPath,
    tag: t.knowledge.searchTag,
    content: t.knowledge.searchContent,
  }), [t.knowledge.searchContent, t.knowledge.searchPath, t.knowledge.searchTag, t.knowledge.searchTitle]);
  const searchScopes = useMemo(() => [
    ...(tagFeaturesEnabled ? [{ prefix: "@", label: "@", title: t.knowledge.searchTag }] : []),
    { prefix: "/", label: "/", title: t.knowledge.searchPath },
    { prefix: "#", label: "#", title: t.knowledge.searchTitle },
    { prefix: ":", label: ":", title: t.knowledge.searchVault },
  ], [tagFeaturesEnabled, t.knowledge.searchPath, t.knowledge.searchTag, t.knowledge.searchTitle, t.knowledge.searchVault]);
  const activeSearchPrefix = useMemo(() => {
    return searchPrefix === "：" ? ":" : searchPrefix;
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
      const currentPrefix = searchPrefixFromQuery(trimmed);
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
    setSelectedSearchResultIndex(effectiveSearchResults.length ? 0 : -1);
  }, [effectiveSearchResults.length, searchQuery]);

  useEffect(() => {
    if (!isGlobalVaultSearch || searchPrefix === "@" || tagSearchDisabled || tab !== "search" || !vaultIndex || !hasSidebarSearchIntent) {
      setSearchResults([]);
      setSearchLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;
    setSearchLoading(true);
    const timeoutId = window.setTimeout(() => {
      searchVaultIndexAsync(vaultIndex, vaultSearchQuery, {
        limit: 60,
        draftFile: activeIndexedFile,
        includeTags: tagFeaturesEnabled,
        signal: controller.signal,
      })
        .then((results) => {
          if (cancelled) return;
          setSearchResults(results);
        })
        .catch((error) => {
          if (cancelled || controller.signal.aborted) return;
          console.warn("Vault search failed", error);
          setSearchResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearchLoading(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [
    activeIndexedFile,
    hasSidebarSearchIntent,
    isGlobalVaultSearch,
    searchPrefix,
    vaultSearchQuery,
    tab,
    tagFeaturesEnabled,
    tagSearchDisabled,
    vaultIndex,
  ]);

  useEffect(() => {
    if (tab !== "search" || !vaultMode || !isGlobalVaultSearch || !hasSidebarSearchIntent) {
      requestedSearchIndexKeyRef.current = "";
      return;
    }
    if (searchPrefix === "@") return;
    if (vaultIndexStatus === "indexing") return;

    const requestKey = `${vaultRoot ?? ""}\n${vaultSearchQuery.trim()}`;
    if (requestedSearchIndexKeyRef.current === requestKey) return;
    if (vaultIndexStatus === "ready" && vaultIndex) return;

    requestedSearchIndexKeyRef.current = requestKey;
    onRequestVaultIndex();
  }, [
    hasSidebarSearchIntent,
    isGlobalVaultSearch,
    onRequestVaultIndex,
    searchPrefix,
    tab,
    vaultIndex,
    vaultIndexStatus,
    vaultMode,
    vaultRoot,
    vaultSearchQuery,
  ]);

  useEffect(() => {
    const tagQuery = searchPrefix === "@" ? normalizedSearchQuery : "";
    const cleanTagQuery = tagQuery.startsWith("@") ? tagQuery.slice(1).trim() : "";
    if (!tagFeaturesEnabled || tab !== "search" || !vaultMode || !tagQuery || !hasSidebarSearchIntent || cleanTagQuery.length < 2) {
      tagSearchRequestIdRef.current += 1;
      setTagSearchResults([]);
      setTagSearchLoading(false);
      return;
    }
    if (searchResults.length > 0) {
      setTagSearchResults([]);
      setTagSearchLoading(false);
      return;
    }

    const requestId = tagSearchRequestIdRef.current + 1;
    tagSearchRequestIdRef.current = requestId;
    setTagSearchLoading(true);
    const timeoutId = window.setTimeout(() => {
      if (tagSearchRequestIdRef.current !== requestId) return;
      onSearchVaultTags(tagQuery)
        .then((results) => {
          if (tagSearchRequestIdRef.current !== requestId) return;
          setTagSearchResults(results);
        })
        .catch((error) => {
          if (tagSearchRequestIdRef.current !== requestId) return;
          console.warn("Vault tag search failed", error);
          setTagSearchResults([]);
        })
        .finally(() => {
          if (tagSearchRequestIdRef.current === requestId) setTagSearchLoading(false);
        });
    }, 280);

    return () => window.clearTimeout(timeoutId);
  }, [
    hasSidebarSearchIntent,
    normalizedSearchQuery,
    onSearchVaultTags,
    searchPrefix,
    searchResults.length,
    tab,
    tagFeaturesEnabled,
    vaultMode,
  ]);

  useEffect(() => {
    if (tab !== "search" || selectedSearchResultIndex < 0) return;
    selectedSearchResultRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedSearchResultIndex, tab]);

  const openSearchResult = useCallback((result: SidebarSearchResult) => {
    rememberSearchQuery(searchQuery);
    const targetText = result.matchedText ?? result.snippet;
    if (!result.path || (activeFilePath && normalizeFilePath(result.path) === normalizeFilePath(activeFilePath))) {
      if (result.line) onOpenCurrentSourceLocation(result.line, targetText);
      return;
    }

    onOpenMarkdownFile(result.path, {
      targetLine: result.line ?? null,
      targetText,
    });
  }, [activeFilePath, onOpenCurrentSourceLocation, onOpenMarkdownFile, rememberSearchQuery, searchQuery]);

  const openSelectedSearchResult = useCallback((index: number) => {
    const result = effectiveSearchResults[index];
    if (!result) return;
    openSearchResult(result);
  }, [effectiveSearchResults, openSearchResult]);

  useEffect(() => {
    if (searchNavigationSignal <= handledSearchNavigationSignalRef.current) return;
    handledSearchNavigationSignalRef.current = searchNavigationSignal;
    if (tab !== "search") return;
    if (!effectiveSearchResults.length) {
      searchInputRef.current?.focus();
      return;
    }

    const base = selectedSearchResultIndex < 0
      ? (searchNavigationDirection > 0 ? -1 : 0)
      : selectedSearchResultIndex;
    const nextIndex = (base + searchNavigationDirection + effectiveSearchResults.length) % effectiveSearchResults.length;
    setSelectedSearchResultIndex(nextIndex);
    openSelectedSearchResult(nextIndex);
  }, [
    effectiveSearchResults.length,
    openSelectedSearchResult,
    searchNavigationDirection,
    searchNavigationSignal,
    selectedSearchResultIndex,
    tab,
  ]);

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
                onMouseDown={(event) => event.preventDefault()}
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
                  if ((event.key === "ArrowDown" || event.key === "ArrowUp") && effectiveSearchResults.length) {
                    event.preventDefault();
                    const direction = event.key === "ArrowDown" ? 1 : -1;
                    setSelectedSearchResultIndex((current) => {
                      const base = current < 0 ? 0 : current;
                      return (base + direction + effectiveSearchResults.length) % effectiveSearchResults.length;
                    });
                    return;
                  }
                  if (event.key === "Enter" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
                    const query = normalizeSearchHistoryItem(searchQuery);
                    if (!query) return;
                    event.preventDefault();
                    if (effectiveSearchResults.length) {
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
              {effectiveSearchResults.length ? effectiveSearchResults.map((result, index) => (
                <button
                  key={result.resultKey}
                  ref={index === selectedSearchResultIndex ? selectedSearchResultRef : null}
                  type="button"
                  className={cx("link-item search-result-item", index === selectedSearchResultIndex && "selected")}
                  aria-current={index === selectedSearchResultIndex ? "true" : undefined}
                  onClick={() => {
                    setSelectedSearchResultIndex(index);
                    openSearchResult(result);
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
              )) : hasSidebarSearchIntent && isGlobalVaultSearch && vaultMode && (vaultIndexStatus === "indexing" || searchLoading || tagSearchLoading) ? (
                <p className="muted">{t.knowledge.indexing}</p>
              ) : !hasSidebarSearchIntent ? (
                null
              ) : (
                <p className="muted">{isGlobalVaultSearch && !vaultMode ? t.knowledge.openVaultForGraph : t.knowledge.noSearchResults}</p>
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
