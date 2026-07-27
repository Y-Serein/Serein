import type { MarkdownMindmapNode } from "./model";

export type MindmapLayoutMode = "right" | "balanced";

export type MindmapLayoutNode = {
  node: MarkdownMindmapNode;
  x: number;
  y: number;
  width: number;
  height: number;
  side: "root" | "left" | "right";
};

export type MindmapLayoutEdge = {
  id: string;
  from: MindmapLayoutNode;
  to: MindmapLayoutNode;
};

export type MindmapLayout = {
  nodes: MindmapLayoutNode[];
  nodeById: Map<string, MindmapLayoutNode>;
  edges: MindmapLayoutEdge[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };
};

const NODE_GAP_Y = 12;
const LEVEL_GAP_X = 58;
const COMPACT_NODE_WIDTH = 264;
const CONTENT_NODE_WIDTH = 360;
const ROOT_BRANCH_GAP_X = 58;

function visualCharacterCount(value: string) {
  return [...value].reduce((count, character) => count + (/[^\u0000-\u00ff]/.test(character) ? 1.7 : 1), 0);
}

function wrappedLineCount(value: string, columns: number) {
  return value.split(/\r?\n/).reduce((total, line) => (
    total + Math.max(1, Math.ceil(visualCharacterCount(line) / columns))
  ), 0);
}

function nodeSize(node: MarkdownMindmapNode, includeBodyContent: boolean) {
  const characters = visualCharacterCount(node.text);
  if (node.kind === "root") {
    return { width: Math.max(156, Math.min(284, 92 + characters * 8.2)), height: 48 };
  }
  if (node.kind === "heading") {
    return { width: Math.max(112, Math.min(COMPACT_NODE_WIDTH, 54 + characters * 7.2)), height: 38 };
  }
  if (node.kind === "list") {
    return { width: Math.max(104, Math.min(COMPACT_NODE_WIDTH, 48 + characters * 7)), height: 34 };
  }

  const source = node.sourceMarkdown ?? node.text;
  if (node.kind === "code") {
    const lines = Math.max(1, source.split(/\r?\n/).length - 2);
    return {
      width: includeBodyContent ? CONTENT_NODE_WIDTH : 320,
      height: Math.max(72, Math.min(includeBodyContent ? 230 : 180, 48 + lines * 17)),
    };
  }
  if (node.kind === "table") {
    const rows = source.split(/\r?\n/).filter((line) => line.trim()).length;
    return {
      width: includeBodyContent ? CONTENT_NODE_WIDTH : 330,
      height: Math.max(78, Math.min(includeBodyContent ? 238 : 190, 28 + rows * 29)),
    };
  }
  if (node.kind === "image") {
    return { width: includeBodyContent ? 276 : 238, height: includeBodyContent ? 190 : 154 };
  }

  const columns = node.kind === "quote" ? 34 : 38;
  const lines = wrappedLineCount(node.text, columns);
  return {
    width: Math.max(146, Math.min(node.kind === "quote" ? 310 : 286, 72 + Math.min(characters, columns) * 6.5)),
    height: Math.max(38, Math.min(154, 20 + lines * 19)),
  };
}

function visibleChildren(node: MarkdownMindmapNode, collapsed: ReadonlySet<string>) {
  return collapsed.has(node.id) ? [] : node.children;
}

function subtreeWeight(node: MarkdownMindmapNode, collapsed: ReadonlySet<string>): number {
  const children = visibleChildren(node, collapsed);
  if (!children.length) return 1;
  return children.reduce((total, child) => total + subtreeWeight(child, collapsed), 0);
}

function assignBalancedSides(root: MarkdownMindmapNode, collapsed: ReadonlySet<string>) {
  const sides = new Map<string, "left" | "right">();
  let leftWeight = 0;
  let rightWeight = 0;
  for (const child of visibleChildren(root, collapsed)) {
    const weight = subtreeWeight(child, collapsed);
    const side = rightWeight <= leftWeight ? "right" : "left";
    sides.set(child.id, side);
    if (side === "right") rightWeight += weight;
    else leftWeight += weight;
  }
  return sides;
}

type LayoutContext = {
  collapsed: ReadonlySet<string>;
  includeBodyContent: boolean;
  levelWidth: number;
  rootOffset: number;
  nodes: MindmapLayoutNode[];
  cursorY: number;
  side: "left" | "right";
};

function layoutBranch(node: MarkdownMindmapNode, depth: number, context: LayoutContext): MindmapLayoutNode {
  const size = nodeSize(node, context.includeBodyContent);
  const children = visibleChildren(node, context.collapsed);
  const childLayouts = children.map((child) => layoutBranch(child, depth + 1, context));
  let centerY: number;
  if (childLayouts.length) {
    centerY = (childLayouts[0].y + childLayouts[0].height / 2
      + childLayouts[childLayouts.length - 1].y + childLayouts[childLayouts.length - 1].height / 2) / 2;
  } else {
    centerY = context.cursorY + size.height / 2;
    context.cursorY += size.height + NODE_GAP_Y;
  }
  const x = context.side === "right"
    ? context.rootOffset + (depth - 1) * (context.levelWidth + LEVEL_GAP_X)
    : -context.rootOffset - (depth - 1) * (context.levelWidth + LEVEL_GAP_X) - size.width;
  const layoutNode: MindmapLayoutNode = {
    node,
    x,
    y: centerY - size.height / 2,
    width: size.width,
    height: size.height,
    side: context.side,
  };
  context.nodes.push(layoutNode);
  return layoutNode;
}

function translateNodes(nodes: MindmapLayoutNode[], deltaY: number) {
  nodes.forEach((node) => {
    node.y += deltaY;
  });
}

export function layoutMarkdownMindmap(
  root: MarkdownMindmapNode,
  mode: MindmapLayoutMode,
  collapsed: ReadonlySet<string>,
  includeBodyContent = true,
): MindmapLayout {
  const rootSize = nodeSize(root, includeBodyContent);
  const levelWidth = includeBodyContent ? CONTENT_NODE_WIDTH : COMPACT_NODE_WIDTH;
  const rootOffset = rootSize.width / 2 + ROOT_BRANCH_GAP_X;
  const positioned: MindmapLayoutNode[] = [];
  const children = visibleChildren(root, collapsed);

  if (mode === "right") {
    const context: LayoutContext = {
      collapsed,
      includeBodyContent,
      levelWidth,
      rootOffset,
      nodes: positioned,
      cursorY: 0,
      side: "right",
    };
    const directChildren = children.map((child) => layoutBranch(child, 1, context));
    const center = directChildren.length
      ? (directChildren[0].y + directChildren[0].height / 2
        + directChildren[directChildren.length - 1].y + directChildren[directChildren.length - 1].height / 2) / 2
      : rootSize.height / 2;
    translateNodes(positioned, -center);
  } else {
    const sideByChild = assignBalancedSides(root, collapsed);
    const leftNodes: MindmapLayoutNode[] = [];
    const rightNodes: MindmapLayoutNode[] = [];
    const leftContext: LayoutContext = {
      collapsed,
      includeBodyContent,
      levelWidth,
      rootOffset,
      nodes: leftNodes,
      cursorY: 0,
      side: "left",
    };
    const rightContext: LayoutContext = {
      collapsed,
      includeBodyContent,
      levelWidth,
      rootOffset,
      nodes: rightNodes,
      cursorY: 0,
      side: "right",
    };
    children.forEach((child) => {
      const side = sideByChild.get(child.id) ?? "right";
      layoutBranch(child, 1, side === "right" ? rightContext : leftContext);
    });
    const centerSide = (nodes: MindmapLayoutNode[]) => {
      if (!nodes.length) return;
      const minY = Math.min(...nodes.map((node) => node.y));
      const maxY = Math.max(...nodes.map((node) => node.y + node.height));
      translateNodes(nodes, -(minY + maxY) / 2);
    };
    centerSide(leftNodes);
    centerSide(rightNodes);
    positioned.push(...leftNodes, ...rightNodes);
  }

  const rootLayout: MindmapLayoutNode = {
    node: root,
    x: -rootSize.width / 2,
    y: -rootSize.height / 2,
    width: rootSize.width,
    height: rootSize.height,
    side: "root",
  };
  positioned.push(rootLayout);

  const nodeById = new Map(positioned.map((node) => [node.node.id, node]));
  const edges: MindmapLayoutEdge[] = [];
  positioned.forEach((layoutNode) => {
    if (!layoutNode.node.parentId) return;
    const parent = nodeById.get(layoutNode.node.parentId);
    if (!parent) return;
    edges.push({ id: `${parent.node.id}->${layoutNode.node.id}`, from: parent, to: layoutNode });
  });

  const minX = Math.min(...positioned.map((node) => node.x));
  const minY = Math.min(...positioned.map((node) => node.y));
  const maxX = Math.max(...positioned.map((node) => node.x + node.width));
  const maxY = Math.max(...positioned.map((node) => node.y + node.height));
  return {
    nodes: positioned,
    nodeById,
    edges,
    bounds: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY },
  };
}

export function mindmapEdgePath(edge: MindmapLayoutEdge) {
  const leftward = edge.to.side === "left";
  const fromX = leftward ? edge.from.x : edge.from.x + edge.from.width;
  const toX = leftward ? edge.to.x + edge.to.width : edge.to.x;
  const fromY = edge.from.y + edge.from.height / 2;
  const toY = edge.to.y + edge.to.height / 2;
  const bend = Math.max(48, Math.abs(toX - fromX) * 0.48);
  const controlFrom = leftward ? fromX - bend : fromX + bend;
  const controlTo = leftward ? toX + bend : toX - bend;
  return `M ${fromX} ${fromY} C ${controlFrom} ${fromY}, ${controlTo} ${toY}, ${toX} ${toY}`;
}
