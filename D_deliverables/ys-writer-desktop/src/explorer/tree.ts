import type { VaultDirectoryResponse, VaultTreeEntry } from "../app/types";

export function toLazyVaultEntry(entry: VaultTreeEntry): VaultTreeEntry {
  return {
    ...entry,
    children: [],
    loaded: entry.kind === "file",
    loading: false,
    hasMore: false,
    truncated: false,
    loadError: null,
  };
}

export function directoryFromResponse(response: VaultDirectoryResponse): VaultTreeEntry {
  return {
    name: response.name,
    path: response.path,
    relativePath: response.relativePath,
    kind: "directory",
    fileExt: null,
    children: response.children.map(toLazyVaultEntry),
    loaded: true,
    loading: false,
    hasMore: response.hasMore,
    truncated: response.truncated,
    loadError: response.error,
  };
}

export function preserveLoadedDirectoryChildren(next: VaultTreeEntry, previous: VaultTreeEntry | null): VaultTreeEntry {
  if (next.kind !== "directory" || !previous || previous.kind !== "directory") return next;

  const previousChildren = new Map(previous.children.map((child) => [child.relativePath, child]));
  return {
    ...next,
    children: next.children.map((child) => {
      if (child.kind !== "directory") return child;

      const previousChild = previousChildren.get(child.relativePath);
      if (!previousChild || previousChild.kind !== "directory") return child;
      if (!previousChild.loaded && !previousChild.children.length) return child;

      return {
        ...child,
        loaded: previousChild.loaded,
        loading: false,
        hasMore: previousChild.hasMore,
        truncated: previousChild.truncated,
        loadError: previousChild.loadError,
        children: previousChild.children,
      };
    }),
  };
}

export function updateVaultNode(
  node: VaultTreeEntry,
  relativePath: string,
  updater: (entry: VaultTreeEntry) => VaultTreeEntry,
): VaultTreeEntry {
  if (node.relativePath === relativePath) return updater(node);

  return {
    ...node,
    children: node.children.map((child) => (
      child.kind === "directory" ? updateVaultNode(child, relativePath, updater) : child
    )),
  };
}
