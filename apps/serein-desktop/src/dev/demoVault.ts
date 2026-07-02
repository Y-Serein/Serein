import type { MarkdownFileResponse, VaultIndexFileResponse, VaultIndexResponse, VaultTreeEntry } from "../app/types";

const root = "/demo/Serein Workspace";

const files: VaultIndexFileResponse[] = [
  note("Ideas/Writing is telepathy.md", [
    "---",
    "aliases: [Telepathy]",
    "---",
    "# Writing is telepathy",
    "",
    "Ideas can travel through time and space without being uttered out loud. The process of telepathy requires two places:",
    "",
    "Jump to the [quote](#Quote), or compare the [launch note](../Projects/Serein%20launch.md#Serein%20launch).",
    "",
    "- A **sending place**, a transmission place where the writer sends ideas, such as a desk",
    "- A **receiving place**, where the reader receives the ideas, such as a couch, a comfortable chair, in bed",
    "",
    "## Quote",
    "",
    "> Look, here's a table covered with red cloth. On it is a cage the size of a small fish aquarium. In the cage is a white rabbit with a pink nose.",
    "",
    "This idea connects to [[Evergreen notes]], [[Creativity is combinatorial]], and [[First principles]]. Project notes mention Telepathy without linking it.",
    "",
    "Related tags: #ideas #writing #evergreen",
  ].join("\n")),
  note("Ideas/Evergreen notes.md", [
    "---",
    "aliases: [Evergreen]",
    "tags: [ideas, notes]",
    "---",
    "# Evergreen notes",
    "",
    "Evergreen notes are small, durable pieces of knowledge that can be linked from many contexts.",
    "",
    "They often start in [[Daily/2026-05-21.md]] and mature through [[Writing is telepathy]].",
  ].join("\n")),
  note("Ideas/Creativity is combinatorial.md", [
    "# Creativity is combinatorial",
    "",
    "Most new ideas are remixes. This note links to [[Writing is telepathy]] and [[Projects/Serein launch.md]].",
    "",
    "#ideas #creative",
  ].join("\n")),
  note("Ideas/First principles.md", [
    "---",
    "tags: [thinking]",
    "---",
    "# First principles",
    "",
    "A compact reminder to strip away inherited assumptions before designing systems.",
    "",
    "See [[Writing is telepathy#Quote]] and [[Calmness is a superpower]].",
  ].join("\n")),
  note("Daily/2026-05-21.md", [
    "# 2026-05-21",
    "",
    "- Refine [[Writing is telepathy]]",
    "- Review [[Projects/Serein launch]]",
    "- Capture an unlinked mention of Evergreen for the outgoing panel",
    "",
    "#daily #journal",
  ].join("\n")),
  note("Projects/Serein launch.md", [
    "---",
    "aliases: [Launch plan]",
    "tags: [project, writing]",
    "priority: 2",
    "---",
    "# Serein launch",
    "",
    "The launch needs a calm workspace, reliable local files, and a graph that makes sense at a glance.",
    "",
    "References: [[Writing is telepathy]], [[Meta/Product principles]], [[Missing future note]].",
  ].join("\n")),
  note("Projects/Research inbox.md", [
    "# Research inbox",
    "",
    "- Telepathy",
    "- Evergreen",
    "- [[References/Design references]]",
    "- [[Travel/Japan Trip Planning]]",
  ].join("\n")),
  note("Meta/Product principles.md", [
    "# Product principles",
    "",
    "1. Data safety first",
    "2. Fast startup",
    "3. Quiet visual hierarchy",
    "4. Focused writing, linked knowledge workspace",
    "",
    "This supports [[Projects/Serein launch]].",
  ].join("\n")),
  note("References/Design references.md", [
    "# Design references",
    "",
    "A quiet, dark workspace should avoid heavy cards and excessive borders.",
    "",
    "Compare [[Writing is telepathy]] with [[Meta/Product principles]].",
  ].join("\n")),
  note("Travel/Japan Trip Planning.md", [
    "---",
    "tags: [travel, project]",
    "---",
    "# Japan Trip Planning",
    "",
    "- [ ] Schedule flights",
    "- [ ] Ask for recommendations",
    "- [x] Kyoto",
    "- [ ] Itinerary",
    "",
    "This trip is intentionally unrelated to [[Writing is telepathy]] but helps test mixed Vault content.",
  ].join("\n")),
  note("Daily/2026-05-20.md", "# 2026-05-20\n\nLinked to [[Daily/2026-05-21.md]] and [[Evergreen notes]].\n"),
  note("References/Reading list.md", "# Reading list\n\n- [[First principles]]\n- [[Creativity is combinatorial]]\n"),
  note("Ideas/Calmness is a superpower.md", "# Calmness is a superpower\n\nCalm interfaces make repeated work easier.\n\n#ideas\n"),
];

export function createDemoVault() {
  const activeFile = files[0];

  return {
    root,
    tree: buildTree(files),
    indexResponse: {
      files,
      truncated: false,
      skippedFiles: 0,
    } satisfies VaultIndexResponse,
    activeFile: toMarkdownFile(activeFile),
    expandedDirs: ["", "Ideas", "Projects", "Daily", "References", "Meta", "Travel"],
  };
}

export function readDemoMarkdownFile(path: string): MarkdownFileResponse {
  const normalizedPath = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const file = files.find((item) => item.path.replace(/\\/g, "/").replace(/\/+$/, "") === normalizedPath);
  if (!file) {
    throw new Error(`Demo vault file not found: ${path}`);
  }
  return toMarkdownFile(file);
}

function note(relativePath: string, content: string): VaultIndexFileResponse {
  const fileName = relativePath.split("/").pop() ?? relativePath;
  const fileExt = fileName.split(".").pop() ?? "md";
  return {
    path: `${root}/${relativePath}`,
    relativePath,
    fileName,
    fileExt,
    content,
  };
}

function toMarkdownFile(file: VaultIndexFileResponse): MarkdownFileResponse {
  return {
    path: file.path,
    fileName: file.fileName,
    fileExt: file.fileExt,
    content: file.content,
    modifiedAtMs: Date.now(),
    size: file.content.length,
  };
}

function buildTree(indexFiles: VaultIndexFileResponse[]): VaultTreeEntry {
  const rootEntry: VaultTreeEntry = {
    name: "Serein Workspace",
    path: root,
    relativePath: "",
    kind: "directory",
    fileExt: null,
    children: [],
    loaded: true,
  };
  const directories = new Map<string, VaultTreeEntry>([["", rootEntry]]);

  for (const file of indexFiles) {
    const parts = file.relativePath.split("/");
    let parent = rootEntry;
    let relativeDir = "";

    for (const directoryName of parts.slice(0, -1)) {
      relativeDir = relativeDir ? `${relativeDir}/${directoryName}` : directoryName;
      let directory = directories.get(relativeDir);
      if (!directory) {
        directory = {
          name: directoryName,
          path: `${root}/${relativeDir}`,
          relativePath: relativeDir,
          kind: "directory",
          fileExt: null,
          children: [],
          loaded: true,
        };
        directories.set(relativeDir, directory);
        parent.children.push(directory);
      }
      parent = directory;
    }

    parent.children.push({
      name: file.fileName,
      path: file.path,
      relativePath: file.relativePath,
      kind: "file",
      fileExt: file.fileExt,
      children: [],
    });
  }

  sortTree(rootEntry);
  return rootEntry;
}

function sortTree(entry: VaultTreeEntry) {
  entry.children.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
  for (const child of entry.children) {
    sortTree(child);
  }
}
