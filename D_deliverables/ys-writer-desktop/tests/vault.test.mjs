import test from "node:test";
import assert from "node:assert/strict";
import {
  buildVaultIndex,
  createGlobalGraph,
  createLocalGraph,
  getBacklinks,
  getIncomingUnlinkedMentions,
  getOutgoingUnlinkedMentions,
  listVaultTags,
  planVaultLinkRewrite,
  rewriteVaultLinksInMarkdown,
  resolveVaultLinkTarget,
  searchVaultIndex,
} from "../.test-dist/vault/index.js";
import { normalizeWikiLinkEscapes } from "../.test-dist/shared/markdown.js";
import { findHeadingIndex } from "../.test-dist/shared/markdown.js";
import {
  directoryFromResponse,
  preserveLoadedDirectoryChildren,
} from "../.test-dist/explorer/tree.js";
import {
  applyLineEnding,
  createFileNote,
  mergeWorkspaceState,
  normalizeEditorLineEndings,
} from "../.test-dist/vault/workspace.js";

const root = "/vault";

function treeEntry(relativePath, kind = "file", children = []) {
  const name = relativePath ? relativePath.split("/").pop() : "vault";
  return {
    name,
    path: relativePath ? `${root}/${relativePath}` : root,
    relativePath,
    kind,
    fileExt: kind === "file" ? name.split(".").pop() : null,
    children,
    loaded: kind === "file" || children.length > 0,
    loading: false,
    hasMore: false,
    truncated: false,
    loadError: null,
  };
}

function file(relativePath, content) {
  const fileName = relativePath.split("/").pop();
  const fileExt = fileName.split(".").pop();
  return {
    path: `${root}/${relativePath}`,
    relativePath,
    fileName,
    fileExt,
    content,
  };
}

test("normalizes CRLF files for editor state while preserving save line endings", () => {
  const response = {
    path: `${root}/Project_00_Serein.txt`,
    fileName: "Project_00_Serein.txt",
    fileExt: "txt",
    content: "```bash\r\ncodex\r\n```\r\n",
    modifiedAtMs: 1,
    size: 22,
  };

  const note = createFileNote(response);
  assert.equal(note.lineEnding, "crlf");
  assert.equal(note.markdown, "```bash\ncodex\n```\n");
  assert.equal(note.savedMarkdown, note.markdown);
  assert.equal(applyLineEnding(note.markdown, note.lineEnding), response.content);
  assert.equal(normalizeEditorLineEndings(response.content), note.markdown);
});

test("preserves loaded lazy directory children when refreshing a parent directory", () => {
  const previous = treeEntry("", "directory", [
    treeEntry("docs", "directory", [
      treeEntry("docs/kept.md"),
    ]),
  ]);
  const refreshed = directoryFromResponse({
    name: "vault",
    path: root,
    relativePath: "",
    hasMore: false,
    truncated: false,
    error: null,
    children: [
      treeEntry("docs", "directory"),
      treeEntry("new.md"),
    ],
  });

  const merged = preserveLoadedDirectoryChildren(refreshed, previous);
  const docs = merged.children.find((entry) => entry.relativePath === "docs");
  assert.ok(docs);
  assert.equal(docs.loaded, true);
  assert.equal(docs.children[0].relativePath, "docs/kept.md");
  assert.ok(merged.children.some((entry) => entry.relativePath === "new.md"));
});

test("resolves wiki links, embeds, headings, markdown links, and directory indexes", () => {
  const index = buildVaultIndex(root, {
    truncated: false,
    skippedFiles: 0,
    files: [
      file("daily/today.md", "# Today\n\n[[Project|Main project]]\n[[Project#Plan]]\n![[folder/index]]\n[Folder](../folder/)\n[This heading](#Today)\n#work"),
      file("Project.md", "# Project\n\n## Plan\n"),
      file("folder/index.md", "# Folder Index\n"),
    ],
  });

  const today = index.filesByRelativePath.get("daily/today.md");
  assert.ok(today);
  assert.equal(today.tags[0], "work");
  assert.equal(today.outgoingLinks[0].label, "Main project");
  assert.equal(today.outgoingLinks[0].targetPath, `${root}/Project.md`);
  assert.equal(today.outgoingLinks[1].targetHeading, "Plan");
  assert.equal(today.outgoingLinks[2].embedded, true);
  assert.equal(today.outgoingLinks[2].targetPath, `${root}/folder/index.md`);
  assert.equal(today.outgoingLinks[3].targetPath, `${root}/folder/index.md`);
  assert.equal(today.outgoingLinks[4].targetPath, `${root}/daily/today.md`);
  assert.equal(today.outgoingLinks[4].targetHeading, "Today");
});

test("reports same-name ambiguity instead of silently choosing a file", () => {
  const index = buildVaultIndex(root, {
    truncated: false,
    skippedFiles: 0,
    files: [
      file("home.md", "[[note]]"),
      file("a/note.md", "# A"),
      file("b/note.md", "# B"),
    ],
  });
  const home = index.filesByRelativePath.get("home.md");
  assert.equal(home.outgoingLinks[0].targetPath, null);
  assert.equal(home.outgoingLinks[0].targetCandidates.length, 2);
  assert.match(home.outgoingLinks[0].unresolvedReason, /Multiple/);

  const resolved = resolveVaultLinkTarget(index, `${root}/home.md`, "wiki", "note");
  assert.equal(resolved.targetCandidates.length, 2);
});

test("builds searchable tags and limited global graph with unresolved links", () => {
  const files = [
    file("a.md", "# Alpha\n\n[[b]]\n[[missing]]\n#work"),
    file("b.md", "# Beta\n\nbody text\n#work"),
    file("c.md", "# Gamma\n\nother #misc"),
    ...Array.from({ length: 24 }, (_, index) => file(`extra-${index}.md`, `# Extra ${index}\n\n#work`)),
  ];
  const index = buildVaultIndex(root, { truncated: false, skippedFiles: 0, files });

  assert.deepEqual(listVaultTags(index), [
    { tag: "work", count: 26 },
    { tag: "misc", count: 1 },
  ]);
  assert.equal(searchVaultIndex(index, "body")[0].relativePath, "b.md");

  const graph = createGlobalGraph(index, { tag: "work", showUnresolved: true, maxNodes: 20 });
  assert.equal(graph.visibleNodes, 20);
  assert.equal(graph.truncated, true);
  assert.equal(graph.edges.length, 1);
});

test("extracts YAML properties, aliases, and frontmatter tags", () => {
  const index = buildVaultIndex(root, {
    truncated: false,
    skippedFiles: 0,
    files: [
      file("meta.md", [
        "---",
        "aliases:",
        "  - Alpha",
        "  - Beta",
        "tags: [project, active]",
        "draft: false",
        "rating: 4",
        "date: 2026-05-21",
        "---",
        "# Meta",
        "",
        "Body #inline",
      ].join("\n")),
      file("home.md", "[[Alpha]]"),
    ],
  });

  const meta = index.filesByRelativePath.get("meta.md");
  assert.ok(meta);
  assert.deepEqual(meta.aliases, ["Alpha", "Beta"]);
  assert.deepEqual(meta.tags, ["active", "inline", "project"]);
  assert.equal(meta.properties.find((item) => item.key === "draft")?.type, "checkbox");
  assert.equal(meta.properties.find((item) => item.key === "rating")?.type, "number");
  assert.equal(meta.properties.find((item) => item.key === "date")?.type, "date");

  const home = index.filesByRelativePath.get("home.md");
  assert.equal(home.outgoingLinks[0].targetPath, `${root}/meta.md`);
});

test("finds unlinked mentions from file names and aliases outside existing links", () => {
  const index = buildVaultIndex(root, {
    truncated: false,
    skippedFiles: 0,
    files: [
      file("daily.md", "Project is mentioned here.\n[[Project]] is already linked.\nAlpha appears by alias."),
      file("Project.md", "# Project\n"),
      file("meta.md", "---\naliases: [Alpha]\n---\n# Meta\n"),
    ],
  });
  const daily = index.filesByRelativePath.get("daily.md");
  const mentions = getOutgoingUnlinkedMentions(index, `${root}/daily.md`, daily);

  assert.equal(mentions.length, 2);
  assert.equal(mentions[0].targetPath, `${root}/Project.md`);
  assert.equal(mentions[0].matchedText, "Project");
  assert.equal(mentions[1].targetPath, `${root}/meta.md`);
  assert.equal(mentions[1].matchedText, "Alpha");
});

test("reports backlinks and incoming unlinked mentions with source context", () => {
  const index = buildVaultIndex(root, {
    truncated: false,
    skippedFiles: 0,
    files: [
      file("Project.md", "# Project\n"),
      file("daily.md", [
        "# Daily",
        "",
        "Today links to [[Project]] in context.",
        "Project is also mentioned without a link.",
      ].join("\n")),
      file("already-linked.md", "This [[Project]] linked mention should not be counted again."),
    ],
  });

  const backlinks = getBacklinks(index, `${root}/Project.md`);
  assert.equal(backlinks.length, 2);
  const dailyBacklink = backlinks.find((backlink) => backlink.sourceRelativePath === "daily.md");
  assert.ok(dailyBacklink);
  assert.equal(dailyBacklink.sourceLine, 3);
  assert.match(dailyBacklink.sourceSnippet, /\[\[Project]]/);

  const localGraph = createLocalGraph(index, `${root}/Project.md`);
  assert.ok(localGraph.nodes.some((node) => node.path === `${root}/daily.md`));
  assert.ok(localGraph.edges.some((edge) => edge.sourcePath === `${root}/daily.md` && edge.targetPath === `${root}/Project.md`));

  const mentions = getIncomingUnlinkedMentions(index, `${root}/Project.md`);
  assert.equal(mentions.length, 1);
  assert.equal(mentions[0].sourceRelativePath, "daily.md");
  assert.equal(mentions[0].line, 4);
  assert.match(mentions[0].snippet, /mentioned without a link/);
});

test("plans and rewrites links when a note is renamed", () => {
  const index = buildVaultIndex(root, {
    truncated: false,
    skippedFiles: 0,
    files: [
      file("notes/home.md", [
        "[[Old Note]]",
        "[[notes/Old Note#Plan|plan alias]]",
        "\\[\\[Old Note]]",
        "\\[\\[Old Note#Plan|escaped alias]]",
        "[local](./Old Note.md#Plan)",
        "[parent](../notes/Old Note.md)",
        "[alias stays](Alias)",
      ].join("\n")),
      file("notes/Old Note.md", "---\naliases: [Alias]\n---\n# Old Note\n\n## Plan"),
    ],
  });

  const plan = planVaultLinkRewrite(index, `${root}/notes/Old Note.md`, "notes/New Note.md");
  assert.equal(plan.replacementCount, 6);
  assert.equal(plan.sources[0].sourceRelativePath, "notes/home.md");

  const rewritten = rewriteVaultLinksInMarkdown(
    index,
    "notes/home.md",
    index.filesByRelativePath.get("notes/home.md").content,
    `${root}/notes/Old Note.md`,
    "notes/New Note.md",
  );

  assert.equal((rewritten.content.match(/\[\[New Note]]/g) ?? []).length, 2);
  assert.match(rewritten.content, /\[\[notes\/New Note#Plan\|plan alias]]/);
  assert.match(rewritten.content, /\[\[New Note#Plan\|escaped alias]]/);
  assert.match(rewritten.content, /\[local]\(\.\/New Note\.md#Plan\)/);
  assert.match(rewritten.content, /\[parent]\(New Note\.md\)/);
  assert.match(rewritten.content, /\[alias stays]\(Alias\)/);
});

test("normalizes escaped wiki links emitted by rich edit serialization", () => {
  assert.equal(normalizeWikiLinkEscapes("\\[\\[A]]"), "[[A]]");
  assert.equal(normalizeWikiLinkEscapes("\\[\\[A#标题|显示文字\\]\\]"), "[[A#标题|显示文字]]");
  assert.equal(normalizeWikiLinkEscapes("[[A]]"), "[[A]]");
  assert.equal(normalizeWikiLinkEscapes("```\n\\[\\[A]]\n```"), "```\n\\[\\[A]]\n```");
});

test("matches Obsidian-style heading aliases when jumping to a heading", () => {
  const markdown = [
    "# start",
    "",
    "# test|显示文字",
    "",
    "body",
  ].join("\n");

  assert.equal(findHeadingIndex(markdown, "test"), 1);
  assert.equal(findHeadingIndex(markdown, "test|显示文字"), 1);
});

test("merges older workspace state with graph defaults", () => {
  const workspace = mergeWorkspaceState({
    version: 1,
    recentFiles: ["/vault/a.md"],
    lastOpenedFile: "/vault/a.md",
    selectedDir: "notes",
    expandedDirs: ["", "notes"],
    layout: {
      sidebarWidth: 260,
      sidebarVisible: true,
      rightPanelVisible: true,
      editorLeftGap: 36,
      uiScale: 100,
    },
  });

  assert.equal(workspace.layout.rightPanelWidth, 300);
  assert.equal(workspace.centerGraph.open, false);
  assert.equal(workspace.centerGraph.activeView, "markdown");
});
