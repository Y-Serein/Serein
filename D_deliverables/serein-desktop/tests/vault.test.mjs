import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildVaultIndex,
  createDraftIndexedFile,
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
  upsertVaultIndexFile,
} from "../.test-dist/vault/index.js";
import {
  composeMarkdownWithFrontmatter,
  createYamlFrontmatter,
  extractOutline,
  getHeadingOffsets,
  normalizeRichMarkdownEscapes,
  normalizeWikiLinkEscapes,
  parseYamlFrontmatterProperties,
  setYamlPropertyValue,
  splitYamlFrontmatter,
  yamlListValueFromInput,
  yamlPropertyValues,
} from "../.test-dist/shared/markdown.js";
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
  assert.deepEqual(today.tags, []);
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

test("builds searchable active frontmatter tags and limited global graph with unresolved links", () => {
  const files = [
    file("a.md", "---\ntags: [work]\nstatus: active\n---\n# Alpha\n\n[[b]]\n[[missing]]\n#ignored"),
    file("b.md", "---\ntags: [work]\nstatus: active\n---\n# Beta\n\nbody text\n#ignored"),
    file("c.md", "---\ntags: [misc]\nstatus: active\n---\n# Gamma\n\nother #ignored"),
    file("inactive.md", "---\ntags: [work]\nstatus: inactive\n---\n# Inactive"),
    file("missing-status.md", "---\ntags: [work]\n---\n# Missing Status"),
    ...Array.from({ length: 24 }, (_, index) => file(`extra-${index}.md`, `---\ntags: [work]\nstatus: active\n---\n# Extra ${index}`)),
  ];
  const index = buildVaultIndex(root, { truncated: false, skippedFiles: 0, files });

  assert.deepEqual(listVaultTags(index), [
    { tag: "work", count: 26 },
    { tag: "misc", count: 1 },
  ]);
  assert.equal(searchVaultIndex(index, "body")[0].relativePath, "b.md");
  assert.equal(searchVaultIndex(index, "#beta")[0].relativePath, "b.md");
  assert.equal(searchVaultIndex(index, "/extra-2")[0].relativePath, "extra-2.md");
  assert.equal(searchVaultIndex(index, "@misc")[0].relativePath, "c.md");
  const bodyResult = searchVaultIndex(index, ":body")[0];
  assert.equal(bodyResult.relativePath, "b.md");
  assert.equal(bodyResult.line, 7);
  assert.equal(bodyResult.matchedText, "body");
  const bodyWithoutTagFrontmatterResult = searchVaultIndex(index, ":body", { includeTags: false })[0];
  assert.equal(bodyWithoutTagFrontmatterResult.line, 7);
  assert.equal(bodyWithoutTagFrontmatterResult.matchedText, "body");
  assert.equal(searchVaultIndex(index, "#body").length, 0);
  assert.equal(searchVaultIndex(index, "@").length, 0);
  assert.equal(searchVaultIndex(index, "/").length, 0);
  assert.equal(searchVaultIndex(index, "#").length, 0);
  assert.equal(searchVaultIndex(index, ":").length, 0);

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
        "status: active",
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
  assert.deepEqual(meta.tags, ["active", "project"]);
  assert.equal(meta.properties.find((item) => item.key === "draft")?.type, "checkbox");
  assert.equal(meta.properties.find((item) => item.key === "rating")?.type, "number");
  assert.equal(meta.properties.find((item) => item.key === "date")?.type, "date");

  const home = index.filesByRelativePath.get("home.md");
  assert.equal(home.outgoingLinks[0].targetPath, `${root}/meta.md`);
});

test("uses shared heading parser for vault index headings", () => {
  const index = buildVaultIndex(root, {
    truncated: false,
    skippedFiles: 0,
    files: [
      file("headings.md", [
        "---",
        "tags: [work]",
        "status: active",
        "---",
        "# First",
        "",
        "```",
        "## Ignored",
        "```",
        "",
        "Setext Title",
        "---",
        "",
        "### Third ###",
      ].join("\n")),
    ],
  });

  const headings = index.filesByRelativePath.get("headings.md")?.headings;
  assert.deepEqual(headings, [
    { level: 1, text: "First", slug: "first" },
    { level: 2, text: "Setext Title", slug: "setext-title" },
    { level: 3, text: "Third", slug: "third" },
  ]);
});

test("splits and composes YAML frontmatter for rich editor rendering", () => {
  const markdown = [
    "---",
    "",
    "tags: [project, writing]",
    "",
    "aliases:",
    "  - Atlas",
    "  - Project Atlas",
    "",
    "status: active",
    "",
    "---",
    "",
    "# Atlas",
    "",
    "Body",
  ].join("\r\n");

  const parts = splitYamlFrontmatter(markdown);
  assert.ok(parts);
  assert.equal(parts.body, "\n# Atlas\n\nBody");
  assert.equal(parts.content.includes("tags: [project, writing]"), true);
  assert.deepEqual(yamlPropertyValues(parts.properties, "tags"), ["project", "writing"]);
  assert.deepEqual(yamlPropertyValues(parts.properties, "aliases"), ["Atlas", "Project Atlas"]);

  const editedFrontmatter = createYamlFrontmatter("tags: [project, release]\nstatus: active");
  assert.equal(composeMarkdownWithFrontmatter(editedFrontmatter, parts.body.replace(/^\n/, "")), [
    "---",
    "tags: [project, release]",
    "status: active",
    "---",
    "# Atlas",
    "",
    "Body",
  ].join("\n"));
});

test("updates YAML property content from structured controls", () => {
  const content = [
    "",
    "tags: [project, writing]",
    "",
    "aliases:",
    "  - Atlas",
    "  - Project Atlas",
    "",
    "status: active",
  ].join("\n");

  assert.equal(yamlListValueFromInput("release public"), "[release, public]");
  assert.equal(yamlListValueFromInput("Atlas, Project Atlas"), "[Atlas, Project Atlas]");

  const updatedTags = setYamlPropertyValue(content, "tags", yamlListValueFromInput("release, public"));
  assert.equal(updatedTags.includes("tags: [release, public]"), true);
  assert.equal(updatedTags.includes("aliases:"), true);

  const updatedAliases = setYamlPropertyValue(updatedTags, "aliases", yamlListValueFromInput("Atlas, Manual"));
  assert.equal(updatedAliases.includes("aliases: [Atlas, Manual]"), true);
  assert.equal(updatedAliases.includes("  - Project Atlas"), false);

  const updatedStatus = setYamlPropertyValue(updatedAliases, "status", "inactive");
  assert.equal(updatedStatus.includes("status: inactive"), true);
});

test("promotes Milkdown thematic-break frontmatter when it contains YAML properties", () => {
  const markdown = [
    "",
    "***",
    "",
    "tags: [project, writing]",
    "",
    "aliases: [Atlas, Project Atlas]",
    "",
    "status: active",
    "",
    "***",
    "",
    "vibe-bridge",
  ].join("\n");

  const parts = splitYamlFrontmatter(markdown);
  assert.ok(parts);
  assert.equal(parts.frontmatter.startsWith("---\n"), true);
  assert.equal(parts.frontmatter.includes("***"), false);
  assert.equal(parts.body, "\nvibe-bridge");
  assert.deepEqual(yamlPropertyValues(parts.properties, "tags"), ["project", "writing"]);
});

test("parses active draft frontmatter tags for current-file tag search", () => {
  const index = buildVaultIndex(root, {
    truncated: false,
    skippedFiles: 0,
    files: [
      file("home.md", "# Home"),
    ],
  });

  const draft = createDraftIndexedFile(index, `${root}/draft.md`, "---\ntags: [project, writing]\nstatus: active\n---\n# Draft");
  assert.ok(draft);
  assert.equal(draft.relativePath, "draft.md");
  assert.deepEqual(draft.tags, ["project", "writing"]);
  assert.deepEqual(yamlPropertyValues(parseYamlFrontmatterProperties(draft.content), "tags"), ["project", "writing"]);
  assert.equal(searchVaultIndex(index, "@project", { draftFile: draft })[0].relativePath, "draft.md");

  const inactiveDraft = createDraftIndexedFile(index, `${root}/inactive-draft.md`, "---\ntags: [project]\nstatus: inactive\n---\n# Draft");
  assert.ok(inactiveDraft);
  assert.equal(searchVaultIndex(index, "@project", { draftFile: inactiveDraft }).length, 0);
});

test("requires active status for frontmatter tags", () => {
  const index = buildVaultIndex(root, {
    truncated: false,
    skippedFiles: 0,
    files: [
      file("active.md", "---\ntags: [remark]\nstatus: active\n---\n# Active"),
      file("inactive.md", "---\ntags: [remark]\nstatus: inactive\n---\n# Inactive"),
      file("missing-status.md", "---\ntags: [remark]\n---\n# Missing Status"),
      file("body.md", "# Body\n\n#remark"),
    ],
  });

  assert.deepEqual(listVaultTags(index), [{ tag: "remark", count: 1 }]);
  assert.deepEqual(searchVaultIndex(index, "@remark").map((item) => item.relativePath), ["active.md"]);
});

test("can disable tag matches in vault search", () => {
  const index = buildVaultIndex(root, {
    truncated: false,
    skippedFiles: 0,
    files: [
      file("active.md", "---\ntags: [remark]\nstatus: active\n---\n# Active"),
    ],
  });

  assert.deepEqual(searchVaultIndex(index, "remark", { includeTags: false }), []);
  assert.deepEqual(searchVaultIndex(index, "@remark", { includeTags: false }), []);
});

test("upserts saved active frontmatter tags into the vault index", () => {
  let index = buildVaultIndex(root, {
    truncated: false,
    skippedFiles: 0,
    files: [
      file("home.md", "# Home"),
    ],
  });

  index = upsertVaultIndexFile(index, root, file("C_context/test/new.md", [
    "---",
    "tags: [remark 备注]",
    "aliases: [remark]",
    "status: active",
    "---",
    "",
    "# new",
  ].join("\n")));

  assert.deepEqual(searchVaultIndex(index, "@remark").map((item) => item.relativePath), ["C_context/test/new.md"]);

  index = upsertVaultIndexFile(index, root, file("C_context/test/new.md", [
    "---",
    "tags: [remark 备注]",
    "aliases: [remark]",
    "status: inactive",
    "---",
    "",
    "# new",
  ].join("\n")));

  assert.deepEqual(searchVaultIndex(index, "@remark"), []);
});

test("keeps opened active frontmatter tags searchable after switching active files", () => {
  let index = buildVaultIndex(root, {
    truncated: false,
    skippedFiles: 0,
    files: [
      file("home.md", "# Home"),
    ],
  });

  index = upsertVaultIndexFile(index, root, file("C_context/test/new.md", [
    "---",
    "tags: [remark 备注]",
    "aliases: [remark]",
    "status: active",
    "---",
    "",
    "# new",
  ].join("\n")));

  index = upsertVaultIndexFile(index, root, file("home.md", "# Home\n\nCurrent note"));

  const otherDraft = createDraftIndexedFile(index, `${root}/home.md`, "# Home\n\nCurrent note");
  assert.ok(otherDraft);
  assert.deepEqual(
    searchVaultIndex(index, "@remark", { draftFile: otherDraft }).map((item) => item.relativePath),
    ["C_context/test/new.md"],
  );
});

test("indexes the real unopened C_context active remark fixture", () => {
  const content = fs.readFileSync("../../C_context/test/new.md", "utf8");
  const index = buildVaultIndex(root, {
    truncated: false,
    skippedFiles: 0,
    files: [
      file("home.md", "# Home"),
      file("C_context/test/new.md", content),
    ],
  });

  assert.deepEqual(searchVaultIndex(index, "@remark").map((item) => item.relativePath), ["C_context/test/new.md"]);
});

test("parses indented YAML frontmatter fields and indexes draft tags", () => {
  const markdown = [
    "---",
    "",
    "    tags: [project, writing]",
    "",
    "    aliases: [Atlas, Project Atlas]",
    "",
    "    status: active",
    "",
    "---",
    "",
    "vibe-bridge",
  ].join("\n");
  const parts = splitYamlFrontmatter(markdown);
  assert.ok(parts);
  assert.deepEqual(yamlPropertyValues(parts.properties, "tags"), ["project", "writing"]);
  assert.deepEqual(yamlPropertyValues(parts.properties, "aliases"), ["Atlas", "Project Atlas"]);
  assert.equal(parts.properties.find((property) => property.key === "status")?.value, "active");

  const index = buildVaultIndex(root, {
    truncated: false,
    skippedFiles: 0,
    files: [
      file("home.md", "# Home"),
    ],
  });
  const draft = createDraftIndexedFile(index, `${root}/draft.md`, markdown);
  assert.ok(draft);
  assert.deepEqual(draft.tags, ["project", "writing"]);
  assert.equal(searchVaultIndex(index, "@project", { draftFile: draft })[0].relativePath, "draft.md");
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

test("normalizes escaped markdown links emitted by rich edit serialization", () => {
  assert.equal(
    normalizeRichMarkdownEscapes("### \\[NUT(7)]\\(https\\://networkupstools.org/docs/man/nut.html)"),
    "### [NUT(7)](https://networkupstools.org/docs/man/nut.html)",
  );
  assert.equal(
    normalizeRichMarkdownEscapes("### \\[Improv Wi-Fi: Open standard for setting up Wi-Fi via Bluetooth LE and Serial]\\(\\[https\\://www\\.improv-wifi.com/]\\(https\\://www\\.improv-wifi.com/))"),
    "### [Improv Wi-Fi: Open standard for setting up Wi-Fi via Bluetooth LE and Serial](https://www.improv-wifi.com/)",
  );
  assert.equal(
    normalizeRichMarkdownEscapes("```\n\\[NUT(7)]\\(https\\://networkupstools.org/docs/man/nut.html)\n```"),
    "```\n\\[NUT(7)]\\(https\\://networkupstools.org/docs/man/nut.html)\n```",
  );
  assert.equal(
    normalizeRichMarkdownEscapes("## 3. [eez\\_studio示例（RT-Thread） - SiFli SDK编程指南 文档](https://docs.sifli.com/projects/sdk/latest/sf32lb55x/example/multimedia/lvgl/lvgl_tools_example/eez_studio/README.html)"),
    "## 3. [eez_studio示例（RT-Thread） - SiFli SDK编程指南 文档](https://docs.sifli.com/projects/sdk/latest/sf32lb55x/example/multimedia/lvgl/lvgl_tools_example/eez_studio/README.html)",
  );
  assert.equal(
    normalizeRichMarkdownEscapes("* \\<https\\://www.cnblogs.com/tianwuyvlianshui/p/18698331\\>"),
    "* <https://www.cnblogs.com/tianwuyvlianshui/p/18698331>",
  );
});

test("matches wiki-style heading aliases when jumping to a heading", () => {
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

test("ignores YAML frontmatter when extracting outline headings", () => {
  const markdown = [
    "---",
    "tags: [work]",
    "status: active",
    "---",
    "# First",
    "",
    "## Second",
  ].join("\n");

  assert.deepEqual(extractOutline(markdown), [
    { level: 1, text: "First" },
    { level: 2, text: "Second" },
  ]);
  assert.equal(findHeadingIndex(markdown, "First"), 0);
  assert.equal(findHeadingIndex(markdown, "Second"), 1);

  const offsets = getHeadingOffsets(markdown);
  assert.equal(markdown.slice(offsets[0].start, offsets[0].end), "# First");
  assert.equal(markdown.slice(offsets[1].start, offsets[1].end), "## Second");
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
