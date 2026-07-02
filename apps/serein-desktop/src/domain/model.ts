export type ID = string;

export type Note = {
  id: ID;
  title: string;
  markdown: string;
  tagIds: ID[];
  createdAt: string;
  updatedAt: string;
  filePath?: string;
  fileName?: string;
  fileExt?: string;
  fileModifiedAtMs?: number | null;
  fileSize?: number;
  lineEnding?: "lf" | "crlf";
  savedMarkdown?: string;
  richSavedMarkdown?: string;
  dirty?: boolean;
};

export type Card = Note;

export type EditorCommandAction =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "blockquote"
  | "bulletList"
  | "orderedList"
  | "codeBlock"
  | "table"
  | "image"
  | "bold"
  | "italic"
  | "inlineCode"
  | "strike"
  | "link"
  | "cut"
  | "copy"
  | "paste"
  | "undo"
  | "redo"
  | "selectAllSmart";

export type EditorCommandSignal = {
  id: number;
  action: EditorCommandAction;
  payload?: string;
  alt?: string;
};

export type Whiteboard = {
  id: ID;
  title: string;
  itemIds: ID[];
  createdAt: string;
  updatedAt: string;
};

export type WhiteboardItem = {
  id: ID;
  whiteboardId: ID;
  cardId: ID;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
};

export type Tag = {
  id: ID;
  name: string;
  color: string;
  cardIds: ID[];
};

export type Link = {
  id: ID;
  fromCardId: ID;
  toCardId: ID;
  kind: "manual" | "mention";
  createdAt: string;
};

export type WorkspaceSnapshot = {
  cards: Note[];
  whiteboards: Whiteboard[];
  whiteboardItems: WhiteboardItem[];
  tags: Tag[];
  links: Link[];
};
