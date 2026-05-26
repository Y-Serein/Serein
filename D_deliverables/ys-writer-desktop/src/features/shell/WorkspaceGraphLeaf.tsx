import { GitBranch } from "lucide-react";
import type { AppLanguage, appText } from "../../app/i18n";
import type { GlobalGraph, VaultTagSummary } from "../../vault";
import { normalizeFilePath } from "../../shared/markdown";

type TextBundle = (typeof appText)[AppLanguage];

type WorkspaceGraphLeafProps = {
  t: TextBundle;
  vaultMode: boolean;
  graph: GlobalGraph;
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
  tags,
  selectedTag,
  isolatedOnly,
  showUnresolved,
  onTagChange,
  onIsolatedOnlyChange,
  onShowUnresolvedChange,
  onGraphNodeClick,
}: WorkspaceGraphLeafProps) {
  const nodeMap = new Map(graph.nodes.map((node) => [normalizeFilePath(node.path), node]));
  const graphBounds = graph.nodes.reduce(
    (bounds, node) => ({
      minX: Math.min(bounds.minX, node.x),
      minY: Math.min(bounds.minY, node.y),
      maxX: Math.max(bounds.maxX, node.x),
      maxY: Math.max(bounds.maxY, node.y),
    }),
    { minX: 50, minY: 50, maxX: 50, maxY: 50 },
  );
  const viewPadding = 18;
  const viewMinX = graphBounds.minX - viewPadding;
  const viewMinY = graphBounds.minY - viewPadding;
  const viewMaxX = graphBounds.maxX + viewPadding;
  const viewMaxY = graphBounds.maxY + viewPadding;
  const viewBox = `${viewMinX} ${viewMinY} ${Math.max(42, viewMaxX - viewMinX)} ${Math.max(42, viewMaxY - viewMinY)}`;

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
        <div className="workspace-graph-stage">
          <svg viewBox={viewBox} role="img" aria-label={t.knowledge.globalGraphAria}>
            {graph.edges.map((edge) => {
              const source = nodeMap.get(normalizeFilePath(edge.sourcePath));
              const target = nodeMap.get(normalizeFilePath(edge.targetPath));
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
            {graph.nodes.map((node) => (
              <g
                key={node.path}
                className={`graph-node ${node.role}`}
                transform={`translate(${node.x} ${node.y})`}
                onClick={() => {
                  if (node.role !== "unresolved") onGraphNodeClick(node.path);
                }}
              >
                <circle r={node.role === "unresolved" ? 2.7 : 3.4} />
                <text y={node.role === "unresolved" ? -4.7 : -5.2}>{node.title}</text>
              </g>
            ))}
          </svg>
          <footer>
            <span><GitBranch size={14} aria-hidden="true" />{graph.totalNodes} {t.knowledge.file}</span>
            {graph.truncated ? <span>{t.knowledge.graphTruncated(graph.omittedNodes)}</span> : null}
          </footer>
        </div>
      ) : (
        <p className="workspace-graph-empty">
          {vaultMode ? t.knowledge.currentFileNotIndexed : t.knowledge.openVaultForGraph}
        </p>
      )}
    </section>
  );
}
