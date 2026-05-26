import { useMemo, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { Pin, PinOff } from "lucide-react";
import type { KnowledgePanelTab, VaultIndexStatus } from "../../app/store/appStore";
import type { AppLanguage, appText } from "../../app/i18n";
import type { Note } from "../../domain/model";
import type { VaultBacklink, VaultIndex, VaultIndexedFile, VaultLink, VaultUnlinkedMention } from "../../vault";
import type { LocalGraph } from "../../vault";
import { createGlobalGraph, listVaultTags } from "../../vault";
import { normalizeFilePath } from "../../shared/markdown";
import { Button, SegmentedTabs, cx } from "../../shared/ui";
import { BacklinksPanel } from "./panels/BacklinksPanel";
import { GraphPanel } from "./panels/GraphPanel";
import { OutgoingLinksPanel } from "./panels/OutgoingLinksPanel";
import { PropertiesPanel } from "./panels/PropertiesPanel";
import { TagsPanel } from "./panels/TagsPanel";

type TextBundle = (typeof appText)[AppLanguage];

type KnowledgeRailProps = {
  t: TextBundle;
  mode: "docked" | "floating";
  tab: KnowledgePanelTab;
  vaultMode: boolean;
  vaultIndex: VaultIndex | null;
  vaultIndexStatus: VaultIndexStatus;
  vaultIndexError: string | null;
  activeNote: Note;
  activeIndexedFile: VaultIndexedFile | null | undefined;
  activeBacklinks: VaultBacklink[];
  activeOutgoingLinks: VaultLink[];
  activeResolvedLinks: VaultLink[];
  activeUnresolvedLinks: VaultLink[];
  activeUnlinkedMentions: VaultUnlinkedMention[];
  localGraph: LocalGraph;
  lineCount: number;
  textStats: { words: number; characters: number };
  floatingPanelPosition?: { x: number; y: number };
  onTabChange: (tab: KnowledgePanelTab) => void;
  onToggleFloating: () => void;
  onFloatingPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onGraphNodeClick: (path: string) => void;
  onSourceLocationClick: (path: string, line: number, text?: string | null) => void;
  onCreateUnresolvedLink: (link: VaultLink) => void;
  onOpenAmbiguousLink: (link: VaultLink) => void;
};

export function KnowledgeRail({
  t,
  mode,
  tab,
  vaultMode,
  vaultIndex,
  vaultIndexStatus,
  vaultIndexError,
  activeNote,
  activeIndexedFile,
  activeBacklinks,
  activeOutgoingLinks,
  activeResolvedLinks,
  activeUnresolvedLinks,
  activeUnlinkedMentions,
  localGraph,
  lineCount,
  textStats,
  floatingPanelPosition,
  onTabChange,
  onToggleFloating,
  onFloatingPointerDown,
  onGraphNodeClick,
  onSourceLocationClick,
  onCreateUnresolvedLink,
  onOpenAmbiguousLink,
}: KnowledgeRailProps) {
  const [graphTag, setGraphTag] = useState("");
  const [graphIsolatedOnly, setGraphIsolatedOnly] = useState(false);
  const [graphShowUnresolved, setGraphShowUnresolved] = useState(true);
  const tags = useMemo(() => listVaultTags(vaultIndex), [vaultIndex]);
  const globalGraph = useMemo(() => createGlobalGraph(vaultIndex, {
    tag: graphTag || null,
    isolatedOnly: graphIsolatedOnly,
    showUnresolved: graphShowUnresolved,
  }), [graphIsolatedOnly, graphShowUnresolved, graphTag, vaultIndex]);
  const indexMessages = [
    vaultIndexStatus === "indexing" ? t.knowledge.indexing : null,
    vaultIndexStatus === "error" ? vaultIndexError : null,
    vaultIndex?.truncated ? t.knowledge.indexPartial : null,
    vaultIndex?.skippedFiles ? t.knowledge.skippedFiles(vaultIndex.skippedFiles) : null,
  ].filter((message): message is string => Boolean(message));
  const currentPath = activeNote.filePath ? normalizeFilePath(activeNote.filePath) : null;
  const backlinkCount = activeBacklinks.length;
  const outgoingCount = activeResolvedLinks.length;
  const panel = (
    <section className={cx("knowledge-panel", mode)}>
      {mode === "floating" ? (
        <div
          className="floating-panel-titlebar"
          onPointerDown={onFloatingPointerDown}
          onDoubleClick={onToggleFloating}
        >
          <strong>{t.knowledge.title}</strong>
          <Button variant="ghost" icon={<Pin size={14} />} onClick={onToggleFloating}>{t.knowledge.dock}</Button>
        </div>
      ) : null}

      <SegmentedTabs
        className="knowledge-tabs"
        label={t.knowledge.tabsAria}
        value={tab}
        items={[
          { id: "backlinks", label: t.knowledge.backlinks },
          { id: "outgoing", label: t.knowledge.outgoing },
          { id: "properties", label: t.knowledge.properties },
          { id: "graph", label: t.knowledge.graph },
          { id: "tags", label: t.knowledge.tags },
        ]}
        onChange={onTabChange}
      />
      <Button
        className="panel-mode-button"
        variant="ghost"
        icon={mode === "floating" ? <Pin size={14} /> : <PinOff size={14} />}
        onClick={onToggleFloating}
      >
        {mode === "floating" ? t.knowledge.dock : t.knowledge.float}
      </Button>

      <div className="knowledge-summary" aria-label={t.knowledge.relationshipSummary(backlinkCount, outgoingCount)}>
        <span>{backlinkCount}</span>
        <small>{t.knowledge.backlinks}</small>
        <span>{outgoingCount}</span>
        <small>{t.knowledge.outgoing}</small>
      </div>

      {vaultMode && indexMessages.length ? (
        <div className="index-status">
          {indexMessages.map((message) => <span key={message}>{message}</span>)}
        </div>
      ) : null}

      {tab === "backlinks" ? (
        <BacklinksPanel
          t={t}
          vaultMode={vaultMode}
          activeBacklinks={activeBacklinks}
          activeUnlinkedMentions={activeUnlinkedMentions}
          onSourceLocationClick={onSourceLocationClick}
        />
      ) : null}

      {tab === "outgoing" ? (
        <OutgoingLinksPanel
          t={t}
          vaultMode={vaultMode}
          activeResolvedLinks={activeResolvedLinks}
          activeUnresolvedLinks={activeUnresolvedLinks}
          onGraphNodeClick={onGraphNodeClick}
          onCreateUnresolvedLink={onCreateUnresolvedLink}
          onOpenAmbiguousLink={onOpenAmbiguousLink}
        />
      ) : null}

      {tab === "properties" ? (
        <PropertiesPanel
          t={t}
          activeIndexedFile={activeIndexedFile}
        />
      ) : null}

      {tab === "graph" ? (
        <GraphPanel
          t={t}
          vaultMode={vaultMode}
          vaultIndexStatus={vaultIndexStatus}
          currentPath={currentPath}
          graphTag={graphTag}
          graphIsolatedOnly={graphIsolatedOnly}
          graphShowUnresolved={graphShowUnresolved}
          tags={tags}
          globalGraph={globalGraph}
          localGraph={localGraph}
          onGraphTagChange={setGraphTag}
          onGraphIsolatedOnlyChange={setGraphIsolatedOnly}
          onGraphShowUnresolvedChange={setGraphShowUnresolved}
          onGraphNodeClick={onGraphNodeClick}
        />
      ) : null}

      {tab === "tags" ? (
        <TagsPanel
          t={t}
          tags={tags}
          selectedTag={graphTag}
          onSelectTag={(nextTag) => {
            setGraphTag(nextTag);
            onTabChange("graph");
          }}
        />
      ) : null}

      <footer className="note-metadata">
        <strong title={activeNote.filePath ?? ""}>{activeNote.fileName ?? t.knowledge.unsavedNote}</strong>
        <span>{activeNote.fileExt ? `.${activeNote.fileExt}` : "Markdown"}</span>
        <span>{lineCount} {t.knowledge.lines}</span>
        <span>{textStats.words} {t.knowledge.words}</span>
        <span>{textStats.characters} {t.knowledge.characters}</span>
        <span>{activeResolvedLinks.length}/{activeOutgoingLinks.length} {t.knowledge.links}</span>
        <span>{activeIndexedFile?.tags.length ? activeIndexedFile.tags.map((tag) => `#${tag}`).join(", ") : t.knowledge.none}</span>
        {currentPath ? null : <span>{t.knowledge.currentFileNotIndexed}</span>}
      </footer>
    </section>
  );

  if (mode === "floating") {
    return (
      <aside
        className="floating-knowledge-panel"
        aria-label={t.aria.floatingKnowledgePanel}
        style={{
          "--floating-panel-x": `${floatingPanelPosition?.x ?? 920}px`,
          "--floating-panel-y": `${floatingPanelPosition?.y ?? 112}px`,
        } as CSSProperties}
      >
        {panel}
      </aside>
    );
  }

  return <aside className="right-rail" aria-label={t.aria.knowledgePanels}>{panel}</aside>;
}
