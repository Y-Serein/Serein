export type WorkspaceLeafKind = "markdown" | "canvas" | "graph" | "search";

export type WorkspaceLeafBase = {
  id: string;
  title: string;
  active: boolean;
};

export type MarkdownWorkspaceLeaf = WorkspaceLeafBase & {
  type: "markdown";
  filePath: string | null;
};

export type CanvasWorkspaceLeaf = WorkspaceLeafBase & {
  type: "canvas";
  filePath: string | null;
};

export type GraphWorkspaceLeaf = WorkspaceLeafBase & {
  type: "graph";
  scope: "global" | "local";
  sourcePath: string | null;
};

export type SearchWorkspaceLeaf = WorkspaceLeafBase & {
  type: "search";
  query: string;
};

export type WorkspaceLeaf =
  | MarkdownWorkspaceLeaf
  | CanvasWorkspaceLeaf
  | GraphWorkspaceLeaf
  | SearchWorkspaceLeaf;

export type WorkspaceTabGroup = {
  id: string;
  activeLeafId: string | null;
  leaves: WorkspaceLeaf[];
};

export type RibbonActionId =
  | "file-explorer"
  | "search"
  | "graph"
  | "canvas"
  | "quick-switcher"
  | "command-palette"
  | "settings";

export type LeftSidebarTabId =
  | "file-explorer"
  | "search"
  | "bookmarks"
  | "tags";

export type RightSidebarTabId =
  | "backlinks"
  | "outgoing-links"
  | "outline"
  | "properties"
  | "local-graph";

export type SidebarSide = "left" | "right";

export type SidebarTabGroup<TTab extends string> = {
  activeTabId: TTab;
  tabs: TTab[];
  visible: boolean;
  width: number;
};

export type SereinWorkspaceState = {
  version: 1;
  ribbonVisible: boolean;
  leftSidebar: SidebarTabGroup<LeftSidebarTabId>;
  rightSidebar: SidebarTabGroup<RightSidebarTabId>;
  center: {
    activeGroupId: string | null;
    groups: WorkspaceTabGroup[];
  };
  statusBarVisible: boolean;
};

export const defaultLeftSidebarTabs: LeftSidebarTabId[] = [
  "file-explorer",
  "search",
  "bookmarks",
  "tags",
];

export const defaultRightSidebarTabs: RightSidebarTabId[] = [
  "backlinks",
  "outgoing-links",
  "outline",
  "properties",
  "local-graph",
];

export function createDefaultSereinWorkspace(): SereinWorkspaceState {
  return {
    version: 1,
    ribbonVisible: true,
    leftSidebar: {
      activeTabId: "file-explorer",
      tabs: defaultLeftSidebarTabs,
      visible: true,
      width: 280,
    },
    rightSidebar: {
      activeTabId: "backlinks",
      tabs: defaultRightSidebarTabs,
      visible: true,
      width: 320,
    },
    center: {
      activeGroupId: "main",
      groups: [
        {
          id: "main",
          activeLeafId: null,
          leaves: [],
        },
      ],
    },
    statusBarVisible: true,
  };
}
