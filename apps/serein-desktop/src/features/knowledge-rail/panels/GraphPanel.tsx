import { Circle, GitBranch } from "lucide-react";
import type { GlobalGraph, LocalGraph, VaultTagSummary } from "../../../vault";
import type { KnowledgeTextBundle } from "../types";
import type { VaultIndexStatus } from "../../../app/store/appStore";
import { InteractiveGraphCanvas } from "../../shell/InteractiveGraphCanvas";

type GraphPanelProps = {
  t: KnowledgeTextBundle;
  vaultMode: boolean;
  vaultIndexStatus: VaultIndexStatus;
  currentPath: string | null;
  graphTag: string;
  graphIsolatedOnly: boolean;
  graphShowUnresolved: boolean;
  tagFeaturesEnabled: boolean;
  tags: VaultTagSummary[];
  globalGraph: GlobalGraph;
  localGraph: LocalGraph;
  onGraphTagChange: (value: string) => void;
  onGraphIsolatedOnlyChange: (value: boolean) => void;
  onGraphShowUnresolvedChange: (value: boolean) => void;
  onGraphNodeClick: (path: string) => void;
};

export function GraphPanel({
  t,
  vaultMode,
  vaultIndexStatus,
  currentPath,
  graphTag,
  graphIsolatedOnly,
  graphShowUnresolved,
  tagFeaturesEnabled,
  tags,
  globalGraph,
  localGraph,
  onGraphTagChange,
  onGraphIsolatedOnlyChange,
  onGraphShowUnresolvedChange,
  onGraphNodeClick,
}: GraphPanelProps) {
  return (
    <div className="knowledge-section graph-workbench" role="tabpanel">
      <div className="graph-toolbar">
        {tagFeaturesEnabled ? (
          <select value={graphTag} onChange={(event) => onGraphTagChange(event.target.value)} aria-label={t.knowledge.filterByTag}>
            <option value="">{t.knowledge.allTags}</option>
            {tags.map((item) => <option key={item.tag} value={item.tag}>#{item.tag} ({item.count})</option>)}
          </select>
        ) : null}
        <label>
          <input type="checkbox" checked={graphIsolatedOnly} onChange={(event) => onGraphIsolatedOnlyChange(event.target.checked)} />
          {t.knowledge.isolatedOnly}
        </label>
        <label>
          <input type="checkbox" checked={graphShowUnresolved} onChange={(event) => onGraphShowUnresolvedChange(event.target.checked)} />
          {t.knowledge.showUnresolved}
        </label>
      </div>
      {globalGraph.nodes.length ? (
        <>
          <InteractiveGraphCanvas
            graph={globalGraph}
            activeFilePath={currentPath}
            ariaLabel={t.knowledge.globalGraphAria}
            className="compact"
            onNodeClick={onGraphNodeClick}
            footer={(
              <>
                <span><GitBranch size={14} aria-hidden="true" />{t.knowledge.globalGraphSummary(globalGraph.visibleNodes, globalGraph.edges.length)}</span>
                {globalGraph.truncated ? <span>{t.knowledge.graphTruncated(globalGraph.omittedNodes)}</span> : null}
              </>
            )}
          />
          {localGraph.nodes.length ? (
            <details className="local-graph-details">
              <summary>{t.knowledge.localGraph}</summary>
              <div className="mini-relation-list">
                {localGraph.nodes
                  .filter((node) => node.path !== currentPath)
                  .slice(0, 10)
                  .map((node) => (
                    <button key={node.path} type="button" onClick={() => onGraphNodeClick(node.path)}>
                      <Circle size={10} />
                      {node.title}
                    </button>
                  ))}
              </div>
            </details>
          ) : null}
        </>
      ) : (
        <p className="muted">
          {!vaultMode
            ? t.knowledge.openVaultForGraph
            : vaultIndexStatus === "indexing"
              ? t.knowledge.indexing
              : t.knowledge.currentFileNotIndexed}
        </p>
      )}
    </div>
  );
}
