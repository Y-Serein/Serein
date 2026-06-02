import { GitBranch } from "lucide-react";
import type { AppLanguage, appText } from "../../app/i18n";
import type { GlobalGraph, VaultTagSummary } from "../../vault";
import { InteractiveGraphCanvas } from "./InteractiveGraphCanvas";

type TextBundle = (typeof appText)[AppLanguage];

type WorkspaceGraphLeafProps = {
  t: TextBundle;
  vaultMode: boolean;
  graph: GlobalGraph;
  activeFilePath: string | null;
  tags: VaultTagSummary[];
  selectedTag: string;
  isolatedOnly: boolean;
  showUnresolved: boolean;
  onTagChange: (value: string) => void;
  onIsolatedOnlyChange: (value: boolean) => void;
  onShowUnresolvedChange: (value: boolean) => void;
  onGraphNodeClick: (path: string) => void;
};

export function WorkspaceGraphLeaf({
  t,
  vaultMode,
  graph,
  activeFilePath,
  tags,
  selectedTag,
  isolatedOnly,
  showUnresolved,
  onTagChange,
  onIsolatedOnlyChange,
  onShowUnresolvedChange,
  onGraphNodeClick,
}: WorkspaceGraphLeafProps) {
  return (
    <section className="workspace-graph-leaf" aria-label={t.knowledge.globalGraphAria}>
      <header className="workspace-graph-toolbar">
        <div>
          <strong>{t.knowledge.graph}</strong>
          <span>{t.knowledge.globalGraphSummary(graph.visibleNodes, graph.edges.length)}</span>
        </div>
        <select value={selectedTag} onChange={(event) => onTagChange(event.target.value)} aria-label={t.knowledge.filterByTag}>
          <option value="">{t.knowledge.allTags}</option>
          {tags.map((item) => <option key={item.tag} value={item.tag}>#{item.tag} ({item.count})</option>)}
        </select>
        <label>
          <input type="checkbox" checked={isolatedOnly} onChange={(event) => onIsolatedOnlyChange(event.target.checked)} />
          {t.knowledge.isolatedOnly}
        </label>
        <label>
          <input type="checkbox" checked={showUnresolved} onChange={(event) => onShowUnresolvedChange(event.target.checked)} />
          {t.knowledge.showUnresolved}
        </label>
      </header>

      {graph.nodes.length ? (
        <InteractiveGraphCanvas
          graph={graph}
          activeFilePath={activeFilePath}
          ariaLabel={t.knowledge.globalGraphAria}
          onNodeClick={onGraphNodeClick}
          footer={(
            <>
              <span><GitBranch size={14} aria-hidden="true" />{graph.totalNodes} {t.knowledge.file}</span>
              {graph.truncated ? <span>{t.knowledge.graphTruncated(graph.omittedNodes)}</span> : null}
            </>
          )}
        />
      ) : (
        <p className="workspace-graph-empty">
          {vaultMode ? t.knowledge.currentFileNotIndexed : t.knowledge.openVaultForGraph}
        </p>
      )}
    </section>
  );
}
