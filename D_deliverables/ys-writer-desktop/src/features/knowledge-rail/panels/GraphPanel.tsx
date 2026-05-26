import { Circle, GitBranch } from "lucide-react";
import type { GlobalGraph, LocalGraph, VaultTagSummary } from "../../../vault";
import { normalizeFilePath } from "../../../shared/markdown";
import type { KnowledgeTextBundle } from "../types";
import type { VaultIndexStatus } from "../../../app/store/appStore";

type GraphPanelProps = {
  t: KnowledgeTextBundle;
  vaultMode: boolean;
  vaultIndexStatus: VaultIndexStatus;
  currentPath: string | null;
  graphTag: string;
  graphIsolatedOnly: boolean;
  graphShowUnresolved: boolean;
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
  tags,
  globalGraph,
  localGraph,
  onGraphTagChange,
  onGraphIsolatedOnlyChange,
  onGraphShowUnresolvedChange,
  onGraphNodeClick,
}: GraphPanelProps) {
  const globalGraphNodeMap = new Map(globalGraph.nodes.map((node) => [normalizeFilePath(node.path), node]));
  const graphBounds = globalGraph.nodes.reduce(
    (bounds, node) => ({
      minX: Math.min(bounds.minX, node.x),
      minY: Math.min(bounds.minY, node.y),
      maxX: Math.max(bounds.maxX, node.x),
      maxY: Math.max(bounds.maxY, node.y),
    }),
    { minX: 50, minY: 50, maxX: 50, maxY: 50 },
  );
  const viewPadding = 18;
  const graphViewBox = [
    graphBounds.minX - viewPadding,
    graphBounds.minY - viewPadding,
    Math.max(44, graphBounds.maxX - graphBounds.minX + viewPadding * 2),
    Math.max(44, graphBounds.maxY - graphBounds.minY + viewPadding * 2),
  ].join(" ");

  return (
    <div className="knowledge-section graph-workbench" role="tabpanel">
      <div className="graph-toolbar">
        <select value={graphTag} onChange={(event) => onGraphTagChange(event.target.value)} aria-label={t.knowledge.filterByTag}>
          <option value="">{t.knowledge.allTags}</option>
          {tags.map((item) => <option key={item.tag} value={item.tag}>#{item.tag} ({item.count})</option>)}
        </select>
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
          <svg viewBox={graphViewBox} role="img" aria-label={t.knowledge.globalGraphAria}>
            {globalGraph.edges.map((edge) => {
              const source = globalGraphNodeMap.get(normalizeFilePath(edge.sourcePath));
              const target = globalGraphNodeMap.get(normalizeFilePath(edge.targetPath));
              if (!source || !target) return null;
              return (
                <line
                  key={edge.id}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  className="graph-edge"
                />
              );
            })}
            {globalGraph.nodes.map((node) => (
              <g
                key={node.path}
                className={`graph-node ${node.role}`}
                transform={`translate(${node.x} ${node.y})`}
                onClick={() => {
                  if (node.role !== "unresolved") onGraphNodeClick(node.path);
                }}
              >
                <circle r={node.role === "unresolved" ? 2.2 : 2.6} />
                <text y={node.role === "unresolved" ? -5.5 : -6}>{node.title}</text>
              </g>
            ))}
          </svg>
          <p className="graph-note">
            <GitBranch size={14} aria-hidden="true" />
            {t.knowledge.globalGraphSummary(globalGraph.visibleNodes, globalGraph.edges.length)}
          </p>
          {globalGraph.truncated ? (
            <p className="graph-note warning">{t.knowledge.graphTruncated(globalGraph.omittedNodes)}</p>
          ) : null}
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
