export type MarkdownHistoryDirection = "undo" | "redo";

export type MarkdownHistoryState = {
  undo: string[];
  redo: string[];
};

export type MarkdownHistoryStore = Map<string, MarkdownHistoryState>;

const MARKDOWN_HISTORY_LIMIT = 120;

function pushMarkdownHistoryEntry(stack: string[], markdown: string) {
  if (stack[stack.length - 1] === markdown) return;
  stack.push(markdown);
  if (stack.length > MARKDOWN_HISTORY_LIMIT) stack.splice(0, stack.length - MARKDOWN_HISTORY_LIMIT);
}

export function recordMarkdownHistoryEntry(
  historyStore: MarkdownHistoryStore,
  noteId: string,
  beforeMarkdown: string,
  afterMarkdown: string,
) {
  if (beforeMarkdown === afterMarkdown) return;

  let history = historyStore.get(noteId);
  if (!history) {
    history = { undo: [], redo: [] };
    historyStore.set(noteId, history);
  }

  pushMarkdownHistoryEntry(history.undo, beforeMarkdown);
  history.redo = [];
}

export function takeMarkdownHistorySnapshot(
  historyStore: MarkdownHistoryStore,
  noteId: string,
  currentMarkdown: string,
  direction: MarkdownHistoryDirection,
) {
  const history = historyStore.get(noteId);
  const source = direction === "undo" ? history?.undo : history?.redo;
  if (!history || !source?.length) return null;

  let nextMarkdown: string | undefined;
  while (source.length) {
    const candidate = source.pop();
    if (candidate !== undefined && candidate !== currentMarkdown) {
      nextMarkdown = candidate;
      break;
    }
  }
  if (nextMarkdown === undefined) return null;

  const target = direction === "undo" ? history.redo : history.undo;
  pushMarkdownHistoryEntry(target, currentMarkdown);
  return nextMarkdown;
}
