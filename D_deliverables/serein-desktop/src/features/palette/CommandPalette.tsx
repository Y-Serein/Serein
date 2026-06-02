import { useEffect, useMemo, useRef, useState } from "react";
import { Command, FileText, Search } from "lucide-react";
import type { CommandDefinition } from "../../app/types";
import type { VaultIndex } from "../../vault";
import { searchVaultIndex } from "../../vault";
import { Button, cx } from "../../shared/ui";

type PaletteMode = "quickOpen" | "command";

type CommandPaletteProps = {
  open: boolean;
  mode: PaletteMode;
  title: string;
  placeholder: string;
  emptyText: string;
  vaultIndex: VaultIndex | null;
  commands: Record<string, CommandDefinition>;
  onClose: () => void;
  onOpenFile: (path: string) => void;
  onRunCommand: (commandId: string) => void;
};

export function CommandPalette({
  open,
  mode,
  title,
  placeholder,
  emptyText,
  vaultIndex,
  commands,
  onClose,
  onOpenFile,
  onRunCommand,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, mode]);

  const fileResults = useMemo(() => {
    if (mode !== "quickOpen") return [];
    const searched = searchVaultIndex(vaultIndex, query, { limit: 60 });
    if (query.trim()) return searched;
    return vaultIndex?.files.slice(0, 60).map((file) => ({
      path: file.path,
      relativePath: file.relativePath,
      title: file.title,
      matchType: "path" as const,
      snippet: file.relativePath,
    })) ?? [];
  }, [mode, query, vaultIndex]);

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
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
              if (event.key === "Enter") {
                event.preventDefault();
                if (mode === "quickOpen" && fileResults[0]) {
                  onOpenFile(fileResults[0].path);
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
            fileResults.length ? fileResults.map((file, index) => (
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
            )) : <p className="palette-empty">{emptyText}</p>
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
