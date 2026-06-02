import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode, WheelEvent as ReactWheelEvent } from "react";
import type { LocalGraph } from "../../vault";
import { normalizeFilePath } from "../../shared/markdown";
import { cx } from "../../shared/ui";

type InteractiveGraphCanvasProps = {
  graph: LocalGraph;
  activeFilePath?: string | null;
  ariaLabel: string;
  className?: string;
  footer?: ReactNode;
  onNodeClick: (path: string) => void;
};

type GraphViewBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function InteractiveGraphCanvas({
  graph,
  activeFilePath,
  ariaLabel,
  className,
  footer,
  onNodeClick,
}: InteractiveGraphCanvasProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const panStateRef = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);
  const [hoveredTitle, setHoveredTitle] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const nodeMap = useMemo(() => new Map(graph.nodes.map((node) => [normalizeFilePath(node.path), node])), [graph.nodes]);
  const activePath = activeFilePath ? normalizeFilePath(activeFilePath) : null;
  const activeNode = activePath ? nodeMap.get(activePath) : null;
  const baseView = useMemo(() => getGraphBaseView(graph), [graph]);
  const [graphView, setGraphView] = useState(baseView);
  const zoomLevel = graphView.width ? baseView.width / graphView.width : 1;
  const showNodeLabels = zoomLevel >= 1.28;
  const focusLabel = showNodeLabels ? truncateGraphTitle(hoveredTitle ?? activeNode?.title ?? "", 18) : "";
  const viewBox = `${graphView.x} ${graphView.y} ${graphView.width} ${graphView.height}`;

  useEffect(() => {
    setGraphView(baseView);
  }, [baseView.x, baseView.y, baseView.width, baseView.height]);

  const svgPointFromEvent = (event: Pick<ReactWheelEvent<SVGSVGElement> | ReactPointerEvent<SVGSVGElement>, "clientX" | "clientY">) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const ratioX = (event.clientX - rect.left) / Math.max(rect.width, 1);
    const ratioY = (event.clientY - rect.top) / Math.max(rect.height, 1);
    return {
      x: graphView.x + ratioX * graphView.width,
      y: graphView.y + ratioY * graphView.height,
      ratioX,
      ratioY,
    };
  };

  const handleGraphWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const point = svgPointFromEvent(event);
    if (!point) return;

    const wheelStep = Math.min(Math.abs(event.deltaY), 900) / 260;
    const factor = event.deltaY < 0 ? Math.pow(0.86, wheelStep) : Math.pow(1.16, wheelStep);
    const nextWidth = clampGraphSpan(graphView.width * factor, baseView.width * 0.18, baseView.width * 3.8);
    const nextHeight = clampGraphSpan(graphView.height * factor, baseView.height * 0.18, baseView.height * 3.8);
    setGraphView({
      x: point.x - point.ratioX * nextWidth,
      y: point.y - point.ratioY * nextHeight,
      width: nextWidth,
      height: nextHeight,
    });
  };

  const handleGraphPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panStateRef.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
    setIsPanning(true);
  };

  const handleGraphPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const panState = panStateRef.current;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!panState || panState.pointerId !== event.pointerId || !rect) return;

    const dx = event.clientX - panState.lastX;
    const dy = event.clientY - panState.lastY;
    panState.lastX = event.clientX;
    panState.lastY = event.clientY;

    setGraphView((current) => ({
      ...current,
      x: current.x - dx * current.width / Math.max(rect.width, 1),
      y: current.y - dy * current.height / Math.max(rect.height, 1),
    }));
  };

  const handleGraphPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (panStateRef.current?.pointerId !== event.pointerId) return;
    panStateRef.current = null;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className={cx("workspace-graph-stage", className, showNodeLabels && "zoomed", isPanning && "panning")}>
      <svg
        ref={svgRef}
        viewBox={viewBox}
        role="img"
        aria-label={ariaLabel}
        onWheel={handleGraphWheel}
        onPointerDown={handleGraphPointerDown}
        onPointerMove={handleGraphPointerMove}
        onPointerUp={handleGraphPointerUp}
        onPointerCancel={handleGraphPointerUp}
        onDoubleClick={(event) => {
          event.preventDefault();
          setGraphView(baseView);
        }}
      >
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
        {graph.nodes.map((node) => {
          const normalizedNodePath = normalizeFilePath(node.path);
          const isCurrent = activePath === normalizedNodePath || node.role === "current";
          return (
            <g
              key={node.path}
              className={`graph-node ${node.role}${isCurrent ? " current" : ""}`}
              transform={`translate(${node.x} ${node.y})`}
              onPointerDown={(event) => event.stopPropagation()}
              onMouseEnter={() => setHoveredTitle(node.title)}
              onMouseLeave={() => setHoveredTitle(null)}
              onClick={() => {
                if (node.role !== "unresolved") onNodeClick(node.path);
              }}
            >
              <circle r={node.role === "unresolved" ? 2.7 : 3.4} />
              {showNodeLabels || isCurrent ? (
                <text y={node.role === "unresolved" ? -4.7 : -5.2}>{truncateGraphTitle(node.title, 11)}</text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {focusLabel ? (
        <div className="graph-focus-label" aria-live="polite">
          <span>{focusLabel}</span>
          <small>{Math.round(zoomLevel * 100)}%</small>
        </div>
      ) : null}
      {footer ? <footer>{footer}</footer> : null}
    </div>
  );
}

function getGraphBaseView(graph: LocalGraph): GraphViewBox {
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
  return {
    x: graphBounds.minX - viewPadding,
    y: graphBounds.minY - viewPadding,
    width: Math.max(42, graphBounds.maxX - graphBounds.minX + viewPadding * 2),
    height: Math.max(42, graphBounds.maxY - graphBounds.minY + viewPadding * 2),
  };
}

function clampGraphSpan(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function truncateGraphTitle(value: string, maxLength: number) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, Math.max(2, maxLength - 1))}...`;
}
