import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Download,
  FileImage,
  FileText,
  Focus,
  GitBranch,
  Minus,
  Pencil,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { AppLanguage, appText } from "../../app/i18n";
import type { DocumentViewMode } from "../../app/types";
import type { MarkdownTextBufferEditorApi } from "../../components/MarkdownTextBufferEditor";
import type { Note } from "../../domain/model";
import { renderMarkdownBody } from "../../export/markdownExport";
import { cx } from "../../shared/ui";
import { layoutMarkdownMindmap, mindmapEdgePath, type MindmapLayoutMode } from "./layout";
import {
  addMindmapChild,
  addMindmapSibling,
  deleteMindmapBranch,
  indentMindmapNode,
  isMindmapStructureNode,
  moveMindmapNodeAsChild,
  moveMindmapNodeDown,
  moveMindmapNodeUp,
  outdentMindmapNode,
  parseMarkdownMindmap,
  renameMindmapNode,
  toggleMindmapTask,
  updateMindmapNodeContent,
  type MarkdownMindmapNode,
  type MindmapMutationResult,
} from "./model";

type TextBundle = (typeof appText)[AppLanguage];

type MarkdownMindmapViewProps = {
  t: TextBundle;
  activeNote: Note;
  editorApi: MarkdownTextBufferEditorApi | null;
  imagePreviewMap: Record<string, string>;
  onViewModeChange: (mode: DocumentViewMode) => void;
};

type CanvasView = { x: number; y: number; zoom: number };

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const EDITABLE_ENTRY_ZOOM = 0.72;
const LAYOUT_STORAGE_KEY = "serein.mindmap.layout";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function storedLayoutMode(): MindmapLayoutMode {
  try {
    return window.localStorage.getItem(LAYOUT_STORAGE_KEY) === "balanced" ? "balanced" : "right";
  } catch {
    return "right";
  }
}

function bodySummaryText(node: MarkdownMindmapNode, labels: TextBundle["editor"]["mindmap"]) {
  const summary = node.bodySummary;
  const parts: string[] = [];
  if (summary.paragraphs) parts.push(labels.paragraphCount(summary.paragraphs));
  if (summary.images) parts.push(labels.imageCount(summary.images));
  if (summary.tables) parts.push(labels.tableCount(summary.tables));
  if (summary.codeBlocks) parts.push(labels.codeCount(summary.codeBlocks));
  if (summary.tasks) parts.push(labels.taskCount(summary.tasks));
  return parts.join(" · ");
}

function mutationReason(result: Extract<MindmapMutationResult, { ok: false }>, labels: TextBundle["editor"]["mindmap"]) {
  switch (result.reason) {
    case "heading-into-list": return labels.headingIntoListBlocked;
    case "heading-depth": return labels.headingDepthBlocked;
    case "no-sibling": return labels.noSibling;
    case "root": return labels.rootActionBlocked;
    case "stale": return labels.staleDocument;
    default: return labels.invalidMove;
  }
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function svgTextLines(value: string, maxCharacters = 34, maxLines = 5) {
  const result: string[] = [];
  for (const sourceLine of value.split(/\r?\n/)) {
    const characters = [...sourceLine];
    if (!characters.length) continue;
    for (let offset = 0; offset < characters.length; offset += maxCharacters) {
      result.push(characters.slice(offset, offset + maxCharacters).join(""));
      if (result.length >= maxLines) break;
    }
    if (result.length >= maxLines) break;
  }
  if (!result.length) result.push(value);
  if (result.length === maxLines && [...value].length > result.join("").length) {
    result[result.length - 1] = `${result[result.length - 1].slice(0, -1)}…`;
  }
  return result;
}

function exportedSvg(layout: ReturnType<typeof layoutMarkdownMindmap>) {
  const padding = 64;
  const viewX = layout.bounds.minX - padding;
  const viewY = layout.bounds.minY - padding;
  const width = Math.ceil(layout.bounds.width + padding * 2);
  const height = Math.ceil(layout.bounds.height + padding * 2);
  const edges = layout.edges.map((edge) => (
    `<path d="${mindmapEdgePath(edge)}" fill="none" stroke="#89a59c" stroke-width="2" stroke-linecap="round"/>`
  )).join("");
  const nodes = layout.nodes.map((item) => {
    const root = item.node.kind === "root";
    const content = !isMindmapStructureNode(item.node);
    const textLines = svgTextLines(item.node.text, content ? 38 : 30, content ? 7 : 3);
    const lineHeight = content ? 15 : 17;
    const textY = item.y + Math.max(17, (item.height - (textLines.length - 1) * lineHeight) / 2 + 5);
    const text = textLines.map((line, index) => (
      `<tspan x="${item.x + 13}" y="${textY + index * lineHeight}">${escapeXml(line)}</tspan>`
    )).join("");
    const fill = root ? "#163e35" : item.node.kind === "code" ? "#edf3f0" : "#fffef9";
    const stroke = root ? "#163e35" : content ? "#c8d6d1" : "#a8beb6";
    return [
      "<g>",
      `<rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" rx="${root ? 14 : content ? 6 : 9}" fill="${fill}" stroke="${stroke}" stroke-width="${root ? 2 : 1.2}"/>`,
      `<text font-family="${item.node.kind === "code" ? "ui-monospace, monospace" : "Segoe UI, sans-serif"}" font-size="${root ? 15 : content ? 11 : 13}" font-weight="${root ? 700 : content ? 500 : 650}" fill="${root ? "#ffffff" : "#243a34"}">${text}</text>`,
      "</g>",
    ].join("");
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewX} ${viewY} ${width} ${height}"><rect x="${viewX}" y="${viewY}" width="${width}" height="${height}" fill="#f4f7f4"/>${edges}${nodes}</svg>`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function exportBaseName(note: Note) {
  return (note.fileName ?? note.title ?? "mindmap").replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "-") || "mindmap";
}

function editSource(node: MarkdownMindmapNode) {
  return isMindmapStructureNode(node) ? node.text : node.sourceMarkdown ?? "";
}

export function MarkdownMindmapView({
  t,
  activeNote,
  editorApi,
  imagePreviewMap,
  onViewModeChange,
}: MarkdownMindmapViewProps) {
  const labels = t.editor.mindmap;
  const stageRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const fitSignatureRef = useRef("");
  const [layoutMode, setLayoutMode] = useState<MindmapLayoutMode>(storedLayoutMode);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState("root");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [canvasView, setCanvasView] = useState<CanvasView>({ x: 0, y: 0, zoom: 1 });

  const map = useMemo(
    () => parseMarkdownMindmap(activeNote.markdown, activeNote.fileName ?? activeNote.title),
    [activeNote.fileName, activeNote.markdown, activeNote.title],
  );
  const layout = useMemo(
    () => layoutMarkdownMindmap(map.root, layoutMode, collapsed),
    [collapsed, layoutMode, map.root],
  );
  const selectedNode = map.nodeById.get(selectedId) ?? map.root;
  const selectedIsStructure = isMindmapStructureNode(selectedNode);
  const contentHtmlById = useMemo(
    () => new Map(map.nodes.flatMap((node) => (
      !isMindmapStructureNode(node) && node.sourceMarkdown
        ? [[node.id, renderMarkdownBody(node.sourceMarkdown, imagePreviewMap)] as const]
        : []
    ))),
    [imagePreviewMap, map.nodes],
  );

  useEffect(() => {
    if (!map.nodeById.has(selectedId)) setSelectedId("root");
    if (editingId && !map.nodeById.has(editingId)) setEditingId(null);
  }, [editingId, map.nodeById, selectedId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, layoutMode);
    } catch {
      // The view preference is optional; private webviews may reject localStorage.
    }
  }, [layoutMode]);

  const fitCanvas = useCallback((minimumZoom = MIN_ZOOM) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const availableWidth = Math.max(260, rect.width - 88);
    const availableHeight = Math.max(220, rect.height - 88);
    const fitZoom = Math.min(
      availableWidth / Math.max(1, layout.bounds.width),
      availableHeight / Math.max(1, layout.bounds.height),
    );
    const zoom = clamp(fitZoom, minimumZoom, 1.35);
    if (fitZoom < minimumZoom) {
      setCanvasView({
        x: layoutMode === "right" ? Math.min(150, rect.width * 0.18) : rect.width / 2,
        y: rect.height / 2,
        zoom,
      });
      return;
    }
    const centerX = (layout.bounds.minX + layout.bounds.maxX) / 2;
    const centerY = (layout.bounds.minY + layout.bounds.maxY) / 2;
    setCanvasView({
      x: rect.width / 2 - centerX * zoom,
      y: rect.height / 2 - centerY * zoom,
      zoom,
    });
  }, [layout.bounds, layoutMode]);

  useEffect(() => {
    const signature = `${activeNote.id}:${layoutMode}`;
    if (fitSignatureRef.current === signature) return;
    fitSignatureRef.current = signature;
    const frame = window.requestAnimationFrame(() => fitCanvas(EDITABLE_ENTRY_ZOOM));
    return () => window.cancelAnimationFrame(frame);
  }, [activeNote.id, fitCanvas, layoutMode]);

  const applyMutation = useCallback((result: MindmapMutationResult) => {
    if (!result.ok) {
      setMessage(mutationReason(result, labels));
      return false;
    }
    if (!editorApi) {
      setMessage(labels.editorNotReady);
      return false;
    }
    const snapshot = editorApi.getSnapshot();
    if (snapshot.noteId !== activeNote.id || snapshot.markdown !== map.markdown) {
      setMessage(labels.staleDocument);
      return false;
    }
    const applied = editorApi.applyChanges({
      noteId: activeNote.id,
      baseMarkdown: map.markdown,
      changes: result.mutation.changes,
      userEvent: result.mutation.userEvent,
    });
    setMessage(applied ? null : labels.staleDocument);
    return applied;
  }, [activeNote.id, editorApi, labels, map.markdown]);

  const beginInlineEdit = useCallback((node: MarkdownMindmapNode) => {
    setSelectedId(node.id);
    setEditDraft(editSource(node));
    setEditingId(node.id);
  }, []);

  const cancelInlineEdit = useCallback((node: MarkdownMindmapNode) => {
    setEditDraft(editSource(node));
    setEditingId(null);
  }, []);

  const commitInlineEdit = useCallback((node: MarkdownMindmapNode) => {
    const original = editSource(node);
    if (editDraft === original) {
      setEditingId(null);
      return;
    }
    const result = isMindmapStructureNode(node)
      ? renameMindmapNode(map, node.id, editDraft)
      : updateMindmapNodeContent(map, node.id, editDraft);
    if (applyMutation(result)) setEditingId(null);
  }, [applyMutation, editDraft, map]);

  const confirmDelete = useCallback((node: MarkdownMindmapNode) => {
    if (node.kind === "root") return;
    const summary = bodySummaryText(node, labels);
    const branchCount = node.children.length;
    const detail = [branchCount ? labels.childBranchCount(branchCount) : "", summary].filter(Boolean).join("，");
    if (!window.confirm(labels.deleteConfirm(node.text, detail))) return;
    applyMutation(deleteMindmapBranch(map, node.id));
  }, [applyMutation, labels, map]);

  const zoomAroundCenter = useCallback((factor: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    setCanvasView((current) => {
      const zoom = clamp(current.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      const worldX = (centerX - current.x) / current.zoom;
      const worldY = (centerY - current.y) / current.zoom;
      return { x: centerX - worldX * zoom, y: centerY - worldY * zoom, zoom };
    });
  }, []);

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      setCanvasView((current) => {
        const zoom = clamp(current.zoom * (event.deltaY > 0 ? 0.9 : 1.1), MIN_ZOOM, MAX_ZOOM);
        const worldX = (pointerX - current.x) / current.zoom;
        const worldY = (pointerY - current.y) / current.zoom;
        return { x: pointerX - worldX * zoom, y: pointerY - worldY * zoom, zoom };
      });
      return;
    }
    setCanvasView((current) => ({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY }));
  };

  const handleStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button, input, textarea, select, .mindmap-node")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: canvasView.x,
      originY: canvasView.y,
    };
  };

  const handleStagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    setCanvasView((current) => ({
      ...current,
      x: pan.originX + event.clientX - pan.startX,
      y: pan.originY + event.clientY - pan.startY,
    }));
  };

  const endStagePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId === event.pointerId) panRef.current = null;
  };

  const handleCanvasKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("input, textarea, select")) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) editorApi?.redo();
      else editorApi?.undo();
      return;
    }
    if (event.key === "Enter" && !selectedIsStructure) {
      event.preventDefault();
      beginInlineEdit(selectedNode);
    } else if (event.key === "Tab" && selectedIsStructure) {
      event.preventDefault();
      applyMutation(addMindmapChild(map, selectedNode.id, labels.newNode));
    } else if (event.key === "Enter" && selectedIsStructure) {
      event.preventDefault();
      applyMutation(selectedNode.kind === "root"
        ? addMindmapChild(map, selectedNode.id, labels.newNode)
        : addMindmapSibling(map, selectedNode.id, labels.newNode));
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      confirmDelete(selectedNode);
    }
  };

  const runExport = async (format: "svg" | "png" | "pdf") => {
    const exportLayout = layoutMarkdownMindmap(map.root, layoutMode, collapsed, false);
    const svg = exportedSvg(exportLayout);
    const baseName = exportBaseName(activeNote);
    if (format === "svg") {
      downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `${baseName}-mindmap.svg`);
      return;
    }
    if (format === "pdf") {
      const frame = document.createElement("iframe");
      frame.className = "mindmap-print-frame";
      frame.srcdoc = `<!doctype html><html><head><title>${escapeXml(baseName)}</title><style>@page{size:landscape;margin:8mm}html,body{margin:0}svg{display:block;width:100%;height:auto}</style></head><body>${svg}</body></html>`;
      document.body.append(frame);
      frame.addEventListener("load", () => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        window.setTimeout(() => frame.remove(), 1500);
      }, { once: true });
      return;
    }
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, image.naturalWidth * scale);
      canvas.height = Math.max(1, image.naturalHeight * scale);
      const context = canvas.getContext("2d");
      if (!context) return;
      context.scale(scale, scale);
      context.drawImage(image, 0, 0);
      canvas.toBlob((png) => {
        if (png) downloadBlob(png, `${baseName}-mindmap.png`);
        URL.revokeObjectURL(url);
      }, "image/png");
    };
    image.onerror = () => URL.revokeObjectURL(url);
    image.src = url;
  };

  const structuralActionDisabled = !selectedIsStructure;
  const rootActionDisabled = structuralActionDisabled || selectedNode.kind === "root";

  return (
    <section className="mindmap-workbench" aria-label={labels.aria}>
      <header className="mindmap-toolbar">
        <div className="mindmap-toolbar-group mindmap-layout-switch" role="group" aria-label={labels.layout}>
          <button type="button" className={cx(layoutMode === "right" && "active")} onClick={() => setLayoutMode("right")}>
            <ArrowRight size={14} aria-hidden="true" />{labels.rightLayout}
          </button>
          <button type="button" className={cx(layoutMode === "balanced" && "active")} onClick={() => setLayoutMode("balanced")}>
            <GitBranch size={14} aria-hidden="true" />{labels.balancedLayout}
          </button>
        </div>
        <div className="mindmap-toolbar-group mindmap-node-toolbar" role="group" aria-label={labels.nodeActions}>
          <span className="mindmap-selection-label" title={selectedNode.text}>{selectedNode.text}</span>
          <button type="button" title={labels.editNode} aria-label={labels.editNode} onClick={() => beginInlineEdit(selectedNode)}><Pencil size={14} /></button>
          <button
            type="button"
            title={labels.openInEditor}
            aria-label={labels.openInEditor}
            onClick={() => {
              onViewModeChange("rich");
              window.setTimeout(() => editorApi?.revealRange(selectedNode.lineFrom, selectedNode.lineTo), 0);
            }}
          ><FileText size={14} /></button>
          <button type="button" disabled={structuralActionDisabled} title={labels.addChild} aria-label={labels.addChild} onClick={() => applyMutation(addMindmapChild(map, selectedNode.id, labels.newNode))}><Plus size={14} /></button>
          <button type="button" disabled={rootActionDisabled} title={labels.addSibling} aria-label={labels.addSibling} onClick={() => applyMutation(addMindmapSibling(map, selectedNode.id, labels.newNode))}><Minus size={14} /></button>
          <button type="button" disabled={rootActionDisabled} title={labels.moveUp} aria-label={labels.moveUp} onClick={() => applyMutation(moveMindmapNodeUp(map, selectedNode.id))}><ArrowUp size={14} /></button>
          <button type="button" disabled={rootActionDisabled} title={labels.moveDown} aria-label={labels.moveDown} onClick={() => applyMutation(moveMindmapNodeDown(map, selectedNode.id))}><ArrowDown size={14} /></button>
          <button type="button" disabled={rootActionDisabled} title={labels.indent} aria-label={labels.indent} onClick={() => applyMutation(indentMindmapNode(map, selectedNode.id))}><ArrowRight size={14} /></button>
          <button type="button" disabled={rootActionDisabled} title={labels.outdent} aria-label={labels.outdent} onClick={() => applyMutation(outdentMindmapNode(map, selectedNode.id))}><ArrowLeft size={14} /></button>
          <button type="button" disabled={selectedNode.kind === "root"} className="mindmap-toolbar-danger" title={labels.deleteBranch} aria-label={labels.deleteBranch} onClick={() => confirmDelete(selectedNode)}><Trash2 size={14} /></button>
        </div>
        <div className="mindmap-toolbar-group" role="group" aria-label={labels.history}>
          <button type="button" title={labels.undo} onClick={() => editorApi?.undo()}><Undo2 size={14} /></button>
          <button type="button" title={labels.redo} onClick={() => editorApi?.redo()}><Redo2 size={14} /></button>
        </div>
        <div className="mindmap-toolbar-group" role="group" aria-label={labels.zoom}>
          <button type="button" title={labels.zoomOut} onClick={() => zoomAroundCenter(0.88)}><ZoomOut size={14} /></button>
          <span>{Math.round(canvasView.zoom * 100)}%</span>
          <button type="button" title={labels.zoomIn} onClick={() => zoomAroundCenter(1.14)}><ZoomIn size={14} /></button>
          <button type="button" title={labels.fit} onClick={() => fitCanvas()}><Focus size={14} /></button>
        </div>
        <div className="mindmap-toolbar-group mindmap-export-group" role="group" aria-label={labels.export}>
          <Download size={14} aria-hidden="true" />
          <button type="button" onClick={() => void runExport("svg")}>SVG</button>
          <button type="button" onClick={() => void runExport("png")}><FileImage size={13} />PNG</button>
          <button type="button" onClick={() => void runExport("pdf")}><FileText size={13} />PDF</button>
        </div>
      </header>

      <div className="mindmap-main">
        <div
          ref={stageRef}
          className={cx("mindmap-stage", panRef.current && "panning")}
          tabIndex={0}
          onKeyDown={handleCanvasKeyDown}
          onWheel={handleWheel}
          onPointerDown={handleStagePointerDown}
          onPointerMove={handleStagePointerMove}
          onPointerUp={endStagePan}
          onPointerCancel={endStagePan}
        >
          <div
            className="mindmap-world"
            style={{ transform: `translate3d(${canvasView.x}px, ${canvasView.y}px, 0) scale(${canvasView.zoom})` }}
          >
            <svg className="mindmap-edges" aria-hidden="true">
              {layout.edges.map((edge) => <path key={edge.id} d={mindmapEdgePath(edge)} />)}
            </svg>
          </div>
          {layout.nodes.map((item) => {
            const node = item.node;
            const selected = node.id === selectedNode.id;
            const editing = editingId === node.id;
            const structure = isMindmapStructureNode(node);
            const contentHtml = contentHtmlById.get(node.id) ?? "";
            const hasChildren = node.children.length > 0;
            return (
              <article
                key={node.id}
                className={cx(
                  "mindmap-node",
                  `mindmap-node-${node.kind}`,
                  !structure && "mindmap-node-content",
                  selected && "selected",
                  editing && "editing",
                  dropTargetId === node.id && draggedId !== node.id && "drop-target",
                )}
                style={{
                  "--mindmap-node-zoom": canvasView.zoom,
                  left: canvasView.x + item.x * canvasView.zoom,
                  top: canvasView.y + item.y * canvasView.zoom,
                  width: item.width * canvasView.zoom,
                  height: item.height * canvasView.zoom,
                } as CSSProperties}
                draggable={!editing && structure && node.kind !== "root"}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedId(node.id);
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  beginInlineEdit(node);
                }}
                onDragStart={(event) => {
                  if (!structure || node.kind === "root") {
                    event.preventDefault();
                    return;
                  }
                  setDraggedId(node.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", node.id);
                }}
                onDragEnd={() => {
                  setDraggedId(null);
                  setDropTargetId(null);
                }}
                onDragOver={(event) => {
                  if (!structure || !draggedId || draggedId === node.id) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropTargetId(node.id);
                }}
                onDragLeave={() => {
                  if (dropTargetId === node.id) setDropTargetId(null);
                }}
                onDrop={(event) => {
                  if (!structure) return;
                  event.preventDefault();
                  const sourceId = draggedId || event.dataTransfer.getData("text/plain");
                  setDraggedId(null);
                  setDropTargetId(null);
                  if (sourceId && sourceId !== node.id) applyMutation(moveMindmapNodeAsChild(map, sourceId, node.id));
                }}
              >
                {structure ? (
                  <>
                    {node.taskChecked !== null && node.taskChecked !== undefined ? (
                      <button
                        type="button"
                        className={cx("mindmap-task-toggle", node.taskChecked && "checked")}
                        aria-label={node.taskChecked ? labels.markIncomplete : labels.markComplete}
                        onClick={(event) => {
                          event.stopPropagation();
                          applyMutation(toggleMindmapTask(map, node.id));
                        }}
                      >
                        {node.taskChecked ? "✓" : ""}
                      </button>
                    ) : null}
                    <div className="mindmap-node-copy">
                      {editing ? (
                        <input
                          autoFocus
                          value={editDraft}
                          aria-label={labels.nodeTitle}
                          onChange={(event) => setEditDraft(event.currentTarget.value)}
                          onBlur={() => commitInlineEdit(node)}
                          onKeyDown={(event) => {
                            event.stopPropagation();
                            if (event.key === "Enter") event.currentTarget.blur();
                            if (event.key === "Escape") cancelInlineEdit(node);
                          }}
                        />
                      ) : <strong>{node.text}</strong>}
                    </div>
                    {hasChildren ? (
                      <button
                        type="button"
                        className="mindmap-collapse-toggle"
                        title={collapsed.has(node.id) ? labels.expand : labels.collapse}
                        onClick={(event) => {
                          event.stopPropagation();
                          setCollapsed((current) => {
                            const next = new Set(current);
                            if (next.has(node.id)) next.delete(node.id);
                            else next.add(node.id);
                            return next;
                          });
                        }}
                      >
                        {collapsed.has(node.id) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                        <span>{node.children.length}</span>
                      </button>
                    ) : null}
                  </>
                ) : editing ? (
                  <textarea
                    className="mindmap-inline-editor"
                    autoFocus
                    value={editDraft}
                    aria-label={labels.bodyMarkdown}
                    spellCheck={node.kind !== "code" && node.kind !== "table"}
                    onChange={(event) => setEditDraft(event.currentTarget.value)}
                    onBlur={() => commitInlineEdit(node)}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") cancelInlineEdit(node);
                    }}
                  />
                ) : (
                  <div
                    className="mindmap-node-body"
                    title={labels.directEditHint}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("a")) event.preventDefault();
                    }}
                    dangerouslySetInnerHTML={{ __html: contentHtml }}
                  />
                )}
              </article>
            );
          })}
        </div>
      </div>
      {message ? <p className="mindmap-message" role="status">{message}</p> : null}
    </section>
  );
}
