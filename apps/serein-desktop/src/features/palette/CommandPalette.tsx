import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Command, FileText, Search } from "lucide-react";
import type { VaultIndexStatus } from "../../app/store/appStore";
import type { CommandDefinition } from "../../app/types";
import type { VaultIndex, VaultIndexedFile, VaultSearchResult } from "../../vault";
import { searchVaultIndexAsync } from "../../vault";
import { Button, cx } from "../../shared/ui";

type PaletteMode = "quickOpen" | "command";

type CommandPaletteProps = {
  open: boolean;
  mode: PaletteMode;
  title: string;
  placeholder: string;
  emptyText: string;
  indexingText: string;
  vaultIndex: VaultIndex | null;
  vaultIndexStatus: VaultIndexStatus;
  activeIndexedFile?: VaultIndexedFile | null;
  commands: Record<string, CommandDefinition>;
  onClose: () => void;
  tagFeaturesEnabled: boolean;
  onRequestVaultIndex: () => void;
  onSearchVaultTags: (query: string) => Promise<VaultSearchResult[]>;
  onOpenFile: (path: string) => void;
  onRunCommand: (commandId: string) => void;
};

function protectTextInputShortcut(event: ReactKeyboardEvent<HTMLInputElement>) {
  if (!(event.ctrlKey || event.metaKey)) return false;
  const key = event.key.toLowerCase();
  if (["a", "c", "x", "v", "z", "y"].includes(key)) {
    event.stopPropagation();
    return false;
  }
  if (key === "f") {
    event.preventDefault();
    event.stopPropagation();
    return true;
  }
  return false;
}

export function CommandPalette({
  open,
  mode,
  title,
  placeholder,
  emptyText,
  indexingText,
  vaultIndex,
  vaultIndexStatus,
  activeIndexedFile,
  commands,
  onClose,
  tagFeaturesEnabled,
  onRequestVaultIndex,
  onSearchVaultTags,
  onOpenFile,
  onRunCommand,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestedFileSearchIndexKeyRef = useRef("");
  const tagSearchRequestIdRef = useRef(0);
  const [fileResults, setFileResults] = useState<VaultSearchResult[]>([]);
  const [fileSearchLoading, setFileSearchLoading] = useState(false);
  const [tagFileResults, setTagFileResults] = useState<VaultSearchResult[]>([]);
  const [tagSearchLoading, setTagSearchLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, mode]);

  const defaultFileResults = useMemo(() => {
    if (mode !== "quickOpen") return [];
    return vaultIndex?.files.slice(0, 60).map((file) => ({
      path: file.path,
      relativePath: file.relativePath,
      title: file.title,
      matchType: "path" as const,
      snippet: file.relativePath,
    })) ?? [];
  }, [mode, vaultIndex]);
  const cleanQuickOpenQuery = query.trim();
  const effectiveFileResults = cleanQuickOpenQuery
    ? fileResults.length ? fileResults : tagFileResults
    : defaultFileResults;

  useEffect(() => {
    if (
      !open
      || mode !== "quickOpen"
      || !cleanQuickOpenQuery
      || !vaultIndex
      || (!tagFeaturesEnabled && cleanQuickOpenQuery.startsWith("@"))
    ) {
      setFileResults([]);
      setFileSearchLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;
    setFileSearchLoading(true);
    const timeoutId = window.setTimeout(() => {
      searchVaultIndexAsync(vaultIndex, query, {
        limit: 60,
        draftFile: activeIndexedFile,
        includeTags: tagFeaturesEnabled,
        signal: controller.signal,
      })
        .then((results) => {
          if (cancelled) return;
          setFileResults(results);
        })
        .catch((error) => {
          if (cancelled || controller.signal.aborted) return;
          console.warn("Vault quick-open search failed", error);
          setFileResults([]);
        })
        .finally(() => {
          if (!cancelled) setFileSearchLoading(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [
    activeIndexedFile,
    cleanQuickOpenQuery,
    mode,
    open,
    query,
    tagFeaturesEnabled,
    vaultIndex,
  ]);

  useEffect(() => {
    const cleanQuery = query.trim();
    if (!open || mode !== "quickOpen" || !cleanQuery) {
      requestedFileSearchIndexKeyRef.current = "";
      return;
    }
    if (cleanQuery.startsWith("@")) return;
    if (vaultIndexStatus === "indexing") return;

    const requestKey = `${vaultIndex?.root ?? ""}\n${cleanQuery}`;
    if (requestedFileSearchIndexKeyRef.current === requestKey) return;
    if (vaultIndexStatus === "ready" && vaultIndex) return;

    requestedFileSearchIndexKeyRef.current = requestKey;
    onRequestVaultIndex();
  }, [
    mode,
    onRequestVaultIndex,
    open,
    query,
    vaultIndex,
    vaultIndexStatus,
  ]);

  useEffect(() => {
    const cleanQuery = query.trim();
    if (!tagFeaturesEnabled || !open || mode !== "quickOpen" || !cleanQuery.startsWith("@") || cleanQuery.slice(1).trim().length < 2) {
      tagSearchRequestIdRef.current += 1;
      setTagFileResults([]);
      setTagSearchLoading(false);
      return;
    }
    if (fileResults.length > 0) {
      setTagFileResults([]);
      setTagSearchLoading(false);
      return;
    }

    const requestId = tagSearchRequestIdRef.current + 1;
    tagSearchRequestIdRef.current = requestId;
    setTagSearchLoading(true);
    const timeoutId = window.setTimeout(() => {
      if (tagSearchRequestIdRef.current !== requestId) return;
      onSearchVaultTags(cleanQuery)
        .then((results) => {
          if (tagSearchRequestIdRef.current !== requestId) return;
          setTagFileResults(results);
        })
        .catch((error) => {
          if (tagSearchRequestIdRef.current !== requestId) return;
          console.warn("Vault quick-open tag search failed", error);
          setTagFileResults([]);
        })
        .finally(() => {
          if (tagSearchRequestIdRef.current === requestId) setTagSearchLoading(false);
        });
    }, 280);

    return () => window.clearTimeout(timeoutId);
  }, [
    fileResults.length,
    mode,
    onSearchVaultTags,
    open,
    query,
    tagFeaturesEnabled,
  ]);

  const commandResults = useMemo(() => {
    if (mode !== "command") return [];
    const cleanQuery = query.trim().toLowerCase();
    return Object.values(commands)
      .filter((command) => command.enabled)
      .filter((command) => (
        !cleanQuery
        || command.label.toLowerCase().includes(cleanQuery)
        || command.id.toLowerCase().includes(cleanQuery)
      ))
      .sort((left, right) => left.label.localeCompare(right.label))
      .slice(0, 80);
  }, [commands, mode, query]);

  if (!open) return null;

  return (
    <div className="palette-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          {mode === "quickOpen" ? <FileText size={17} /> : <Command size={17} />}
          <strong>{title}</strong>
          <Button variant="ghost" onClick={onClose}>Esc</Button>
        </header>
        <div className="palette-search">
          <Search size={15} />
          <input
            ref={inputRef}
            value={query}
            placeholder={placeholder}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (protectTextInputShortcut(event)) return;
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
              if (event.key === "Enter") {
                event.preventDefault();
                if (mode === "quickOpen" && effectiveFileResults[0]) {
                  onOpenFile(effectiveFileResults[0].path);
                }
                if (mode === "command" && commandResults[0]) {
                  onRunCommand(commandResults[0].id);
                }
              }
            }}
          />
        </div>
        <div className="palette-results">
          {mode === "quickOpen" ? (
            effectiveFileResults.length ? effectiveFileResults.map((file, index) => (
              <button
                key={file.path}
                type="button"
                className={cx("palette-item", index === 0 && "primary")}
                onClick={() => onOpenFile(file.path)}
              >
                <FileText size={15} />
                <span>
                  <strong>{file.title}</strong>
                  <small>{file.relativePath}</small>
                </span>
              </button>
            )) : <p className="palette-empty">{vaultIndexStatus === "indexing" || fileSearchLoading || tagSearchLoading ? indexingText : emptyText}</p>
          ) : (
            commandResults.length ? commandResults.map((command, index) => (
              <button
                key={command.id}
                type="button"
                className={cx("palette-item", index === 0 && "primary")}
                onClick={() => onRunCommand(command.id)}
              >
                <Command size={15} />
                <span>
                  <strong>{command.label}</strong>
                  <small>{command.id}</small>
                </span>
              </button>
            )) : <p className="palette-empty">{emptyText}</p>
          )}
        </div>
      </section>
    </div>
  );
}
