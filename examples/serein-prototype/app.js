const STORAGE_KEY = "serein-prototype-documents-v1";

const sampleMarkdown = `# Serein 产品笔记

Serein 的第一目标是把写作区做干净：默认就是一张可编辑的文档纸面，Markdown 源码和分屏预览只作为辅助模式。

## 已覆盖的核心写作体验

- 即时预览与源码编辑
- 大纲跳转、文件列表、字数统计
- 专注模式、打字机模式、主题切换
- Markdown / HTML / PDF 导出
- 表格、任务列表、引用、代码块、图片、链接

## 示例表格

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| 编辑器 | 可用 | 支持常用 Markdown |
| 导出 | 可用 | MD、HTML、打印为 PDF |
| 本地文档 | 可用 | 保存在浏览器 localStorage |

## 代码块

\`\`\`js
function write() {
  return "less chrome, more writing";
}
\`\`\`

> 产品方向：保留沉浸式写作优点，并形成 Serein 自己的视觉和交互语言。
`;

const state = {
  docs: [],
  activeId: "",
  dirty: false,
  search: "",
  typewriter: false,
  history: {
    undo: [],
    redo: [],
    last: "",
    applying: false,
  },
};

const app = document.querySelector(".app");
const liveEditor = document.querySelector("#liveEditor");
const editor = document.querySelector("#editor");
const preview = document.querySelector("#preview");
const fileList = document.querySelector("#fileList");
const outline = document.querySelector("#outline");
const titleInput = document.querySelector("#docTitle");
const saveState = document.querySelector("#saveState");
const stats = document.querySelector("#stats");
const searchInput = document.querySelector("#searchInput");
const searchState = document.querySelector("#searchState");
const fileInput = document.querySelector("#fileInput");
const themeSelect = document.querySelector("#themeSelect");

function uid() {
  return `doc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      state.docs = parsed.docs || [];
      state.activeId = parsed.activeId || "";
    } catch {
      state.docs = [];
    }
  }

  if (!state.docs.length) {
    const id = uid();
    state.docs = [{
      id,
      title: "Serein 产品笔记",
      body: sampleMarkdown,
      updatedAt: Date.now(),
    }];
    state.activeId = id;
    persist();
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    docs: state.docs,
    activeId: state.activeId,
  }));
}

function activeDoc() {
  return state.docs.find((doc) => doc.id === state.activeId) || state.docs[0];
}

function setDirty(isDirty) {
  state.dirty = isDirty;
  saveState.textContent = isDirty ? "未保存" : "已保存";
}

function setHistoryBase(markdown) {
  state.history.undo = [];
  state.history.redo = [];
  state.history.last = markdown;
}

function recordHistory(markdown) {
  if (state.history.applying || markdown === state.history.last) return;
  if (state.history.last !== undefined) {
    state.history.undo.push(state.history.last);
  }
  if (state.history.undo.length > 160) {
    state.history.undo.shift();
  }
  state.history.redo = [];
  state.history.last = markdown;
}

function renderFiles() {
  fileList.innerHTML = "";
  state.docs
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .forEach((doc) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `file-item${doc.id === state.activeId ? " active" : ""}`;
      button.innerHTML = `<strong>${escapeHtml(doc.title || "未命名")}</strong><span>${new Date(doc.updatedAt).toLocaleString()}</span>`;
      button.addEventListener("click", () => selectDoc(doc.id));
      fileList.appendChild(button);
    });
}

function selectDoc(id) {
  saveCurrent();
  state.activeId = id;
  persist();
  hydrateActiveDoc();
}

function hydrateActiveDoc() {
  const doc = activeDoc();
  titleInput.value = doc.title;
  editor.value = doc.body;
  renderAll();
  renderLiveEditor(doc.body);
  setHistoryBase(doc.body);
  setDirty(false);
}

function saveCurrent() {
  const doc = activeDoc();
  if (!doc) return;
  syncLiveToSource();
  doc.title = titleInput.value.trim() || firstHeading(editor.value) || "未命名";
  doc.body = editor.value;
  doc.updatedAt = Date.now();
  persist();
  renderFiles();
  setDirty(false);
}

function createDoc() {
  saveCurrent();
  const id = uid();
  state.docs.unshift({
    id,
    title: "未命名文档",
    body: "# 未命名文档\n\n开始写作。",
    updatedAt: Date.now(),
  });
  state.activeId = id;
  persist();
  hydrateActiveDoc();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function slugify(value, index) {
  return encodeURIComponent(value.trim().toLowerCase().replace(/\s+/g, "-")) || `section-${index}`;
}

function firstHeading(markdown) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "";
}

function markdownFromLive() {
  const blocks = [];
  liveEditor.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) blocks.push(text);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName.toLowerCase();
    const text = node.textContent.replace(/\u00a0/g, " ").trimEnd();
    if (!text && tag !== "br") return;

    if (/^h[1-6]$/.test(tag)) {
      blocks.push(`${"#".repeat(Number(tag.slice(1)))} ${text.trim()}`);
      return;
    }

    if (tag === "blockquote") {
      blocks.push(text.split("\n").map((line) => `> ${line}`).join("\n"));
      return;
    }

    if (tag === "pre") {
      blocks.push(`\`\`\`\n${text}\n\`\`\``);
      return;
    }

    if (tag === "ul" || tag === "ol") {
      blocks.push(listToMarkdown(node));
      return;
    }

    blocks.push(text.trim());
  });
  return blocks.join("\n\n");
}

function listItemText(item) {
  const parts = [];
  item.childNodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE && ["ul", "ol"].includes(node.tagName.toLowerCase())) return;
    parts.push(node.textContent || "");
  });
  return parts.join("").replace(/\u00a0/g, " ").trim();
}

function listToMarkdown(list, depth = 0) {
  const ordered = list.tagName.toLowerCase() === "ol";
  const lines = [];
  Array.from(list.children)
    .filter((child) => child.tagName && child.tagName.toLowerCase() === "li")
    .forEach((item, index) => {
      const prefix = ordered ? `${index + 1}.` : "-";
      lines.push(`${"  ".repeat(depth)}${prefix} ${listItemText(item)}`);
      Array.from(item.children)
        .filter((child) => ["ul", "ol"].includes(child.tagName.toLowerCase()))
        .forEach((nested) => {
          lines.push(listToMarkdown(nested, depth + 1));
        });
    });
  return lines.join("\n");
}

function syncLiveToSource() {
  if (app.dataset.mode === "live") {
    editor.value = markdownFromLive();
  }
}

function syncDocumentFromEditor(options = {}) {
  const { record = true } = options;
  const doc = activeDoc();
  if (!doc) return;
  doc.body = editor.value;
  doc.title = titleInput.value.trim() || firstHeading(editor.value) || doc.title;
  doc.updatedAt = Date.now();
  if (record) recordHistory(editor.value);
  renderAll();
  setDirty(true);
  renderFiles();
}

function focusRestoredContent() {
  if (app.dataset.mode === "live") {
    const target = liveEditor.lastElementChild?.classList.contains("trailing-block")
      ? liveEditor.lastElementChild.previousElementSibling || liveEditor.lastElementChild
      : liveEditor.lastElementChild;
    liveEditor.focus();
    if (target) placeCaretAtEnd(target);
    return;
  }

  if (app.dataset.mode === "source" || app.dataset.mode === "split") {
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
  }
}

function restoreMarkdown(markdown) {
  state.history.applying = true;
  editor.value = markdown;
  if (app.dataset.mode === "live") {
    renderLiveEditor(markdown);
  }
  syncDocumentFromEditor({ record: false });
  state.history.last = markdown;
  state.history.applying = false;
  focusRestoredContent();
}

function undoEdit() {
  if (!state.history.undo.length) return false;
  state.history.redo.push(editor.value);
  const previous = state.history.undo.pop();
  restoreMarkdown(previous);
  return true;
}

function redoEdit() {
  if (!state.history.redo.length) return false;
  state.history.undo.push(editor.value);
  const next = state.history.redo.pop();
  restoreMarkdown(next);
  return true;
}

function isEditorTarget(target) {
  return target === editor || target === liveEditor || liveEditor.contains(target);
}

function renderLiveEditor(markdown) {
  const parsed = renderMarkdown(markdown);
  liveEditor.innerHTML = parsed.html || "<p><br></p>";
  ensureTrailingEditableBlock();
}

function currentBlock() {
  const selection = window.getSelection();
  if (!selection || !selection.anchorNode || !liveEditor.contains(selection.anchorNode)) return null;
  let node = selection.anchorNode.nodeType === Node.TEXT_NODE
    ? selection.anchorNode.parentElement
    : selection.anchorNode;
  while (node && node.parentElement !== liveEditor) {
    node = node.parentElement;
  }
  return node && node.parentElement === liveEditor ? node : null;
}

function currentElement() {
  const selection = window.getSelection();
  if (!selection || !selection.anchorNode || !liveEditor.contains(selection.anchorNode)) return null;
  return selection.anchorNode.nodeType === Node.TEXT_NODE
    ? selection.anchorNode.parentElement
    : selection.anchorNode;
}

function currentListItem() {
  const element = currentElement();
  if (!element) return null;
  return element.closest("li");
}

function placeCaretAtEnd(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function placeCaretAtStart(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function ensureTrailingEditableBlock() {
  const last = liveEditor.lastElementChild;
  const lastIsEmptyParagraph = last
    && last.tagName.toLowerCase() === "p"
    && !last.textContent.trim();
  if (lastIsEmptyParagraph) return;

  const paragraph = document.createElement("p");
  paragraph.className = "trailing-block";
  paragraph.appendChild(document.createElement("br"));
  liveEditor.appendChild(paragraph);
}

function insertParagraphAfter(block) {
  const paragraph = document.createElement("p");
  paragraph.appendChild(document.createElement("br"));
  block.after(paragraph);
  placeCaretAtStart(paragraph);
}

function insertTextAtCaret(text) {
  try {
    if (document.execCommand && document.execCommand("insertText", false, text)) return;
  } catch {
    // Fall through to Range insertion.
  }

  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function indentListItem(item) {
  const previous = item.previousElementSibling;
  if (!previous) return;

  const parent = item.parentElement;
  let nested = Array.from(previous.children).find((child) => child.tagName.toLowerCase() === parent.tagName.toLowerCase());
  if (!nested) {
    nested = document.createElement(parent.tagName.toLowerCase());
    previous.appendChild(nested);
  }
  nested.appendChild(item);
  placeCaretAtEnd(item);
}

function outdentListItem(item) {
  const parent = item.parentElement;
  const grandItem = parent.closest("li");
  if (!grandItem) return;

  grandItem.after(item);
  if (!parent.children.length) parent.remove();
  placeCaretAtEnd(item);
}

function syncLiveDocument() {
  editor.value = markdownFromLive();
  syncDocumentFromEditor();
}

function applyLiveMarkdownShortcut() {
  const block = currentBlock();
  if (!block) return;
  const text = block.textContent.replace(/\u00a0/g, " ");
  const heading = text.match(/^(#{1,6})\s+(.+)$/);
  if (heading) {
    const next = document.createElement(`h${heading[1].length}`);
    next.textContent = heading[2];
    block.replaceWith(next);
    placeCaretAtEnd(next);
    return;
  }

  const quote = text.match(/^>\s+(.+)$/);
  if (quote) {
    const next = document.createElement("blockquote");
    const paragraph = document.createElement("p");
    paragraph.textContent = quote[1];
    next.appendChild(paragraph);
    block.replaceWith(next);
    placeCaretAtEnd(paragraph);
    return;
  }

  const unordered = text.match(/^[-*+]\s*(.*)$/);
  if (unordered && text.length >= 2 && /\s/.test(text[1])) {
    const list = document.createElement("ul");
    const item = document.createElement("li");
    if (unordered[1]) {
      item.textContent = unordered[1];
    } else {
      item.appendChild(document.createElement("br"));
    }
    list.appendChild(item);
    block.replaceWith(list);
    placeCaretAtEnd(item);
    return;
  }

  const ordered = text.match(/^1\.\s*(.*)$/);
  if (ordered && text.length >= 3 && /\s/.test(text[2])) {
    const list = document.createElement("ol");
    const item = document.createElement("li");
    if (ordered[1]) {
      item.textContent = ordered[1];
    } else {
      item.appendChild(document.createElement("br"));
    }
    list.appendChild(item);
    block.replaceWith(list);
    placeCaretAtEnd(item);
  }
}

function handleLiveKeydown(event) {
  if (event.key === "Tab") {
    event.preventDefault();
    const item = currentListItem();
    if (item) {
      if (event.shiftKey) {
        outdentListItem(item);
      } else {
        indentListItem(item);
      }
      syncLiveDocument();
      return;
    }
    insertTextAtCaret("  ");
    syncLiveDocument();
    return;
  }

  if (event.key !== "Enter" || event.shiftKey) return;

  const block = currentBlock();
  if (!block || block !== liveEditor.lastElementChild) return;

  event.preventDefault();
  insertParagraphAfter(block);
  syncLiveDocument();
}

function inlineMarkdown(text) {
  let html = escapeHtml(text);
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" />');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\$\$?([^$]+)\$\$?/g, '<span class="math">$1</span>');
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/_([^_]+)_/g, "<em>$1</em>");
  html = html.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  if (state.search) {
    const escaped = state.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html.replace(new RegExp(`(${escaped})`, "gi"), "<mark>$1</mark>");
  }
  return html;
}

function parseTable(lines, start) {
  const header = lines[start];
  const divider = lines[start + 1] || "";
  if (!header.includes("|") || !/^\s*\|?[\s:-]+\|[\s|:-]*$/.test(divider)) return null;

  const rows = [];
  let index = start;
  while (index < lines.length && lines[index].includes("|")) {
    rows.push(lines[index]);
    index += 1;
  }

  const cells = (line) => line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => inlineMarkdown(cell.trim()));

  const head = cells(rows[0]).map((cell) => `<th>${cell}</th>`).join("");
  const body = rows.slice(2).map((row) => `<tr>${cells(row).map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("");

  return {
    html: `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`,
    next: index,
  };
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const headings = [];
  const html = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      const language = escapeHtml(line.replace(/^```/, "").trim());
      const code = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      html.push(`<pre><code data-language="${language}">${escapeHtml(code.join("\n"))}</code></pre>`);
      i += 1;
      continue;
    }

    const table = parseTable(lines, i);
    if (table) {
      html.push(table.html);
      i = table.next;
      continue;
    }

    if (/^(#{1,6})\s*$/.test(line)) {
      html.push(`<p>${inlineMarkdown(line)}</p>`);
      i += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = slugify(text, headings.length);
      headings.push({ level, text, id });
      html.push(`<h${level} id="${id}">${inlineMarkdown(text)}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      html.push("<hr />");
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      html.push(`<blockquote>${quote.map((item) => `<p>${inlineMarkdown(item)}</p>`).join("")}</blockquote>`);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line) || /^\s*[-*+]\s+\[[ xX]\]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && (/^\s*[-*+]\s+/.test(lines[i]) || /^\s*[-*+]\s+\[[ xX]\]\s+/.test(lines[i]))) {
        const task = lines[i].match(/^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/);
        if (task) {
          const checked = task[1].toLowerCase() === "x" ? " checked" : "";
          items.push(`<li><input type="checkbox" disabled${checked}> ${inlineMarkdown(task[2])}</li>`);
        } else {
          items.push(`<li>${inlineMarkdown(lines[i].replace(/^\s*[-*+]\s+/, ""))}</li>`);
        }
        i += 1;
      }
      html.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${inlineMarkdown(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>`);
        i += 1;
      }
      html.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6})\s+/.test(lines[i]) && !/^```/.test(lines[i])) {
      paragraph.push(lines[i]);
      i += 1;
    }
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
  }

  return { html: html.join("\n"), headings };
}

function renderOutline(headings) {
  outline.innerHTML = headings.length
    ? headings.map((item) => `<a class="level-${item.level}" href="#${item.id}">${escapeHtml(item.text)}</a>`).join("")
    : '<span class="empty">没有标题</span>';
}

function renderStats(markdown) {
  const text = markdown.replace(/[#>*_`~\-[\]()+.!|]/g, " ").trim();
  const cn = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const words = (text.match(/[A-Za-z0-9]+/g) || []).length + cn;
  const lines = markdown.split("\n").length;
  const minutes = Math.max(1, Math.ceil(words / 350));
  stats.textContent = `${words} 字 · ${lines} 行 · ${minutes} 分钟`;
}

function renderAll() {
  const parsed = renderMarkdown(editor.value);
  preview.innerHTML = parsed.html;
  renderOutline(parsed.headings);
  renderStats(editor.value);
  renderSearchState();
}

function renderSearchState() {
  if (!state.search) {
    searchState.textContent = "";
    return;
  }
  const count = (editor.value.match(new RegExp(state.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) || []).length;
  searchState.textContent = `${count} 个匹配`;
}

function surroundSelection(before, after = before, fallback = "文本") {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const selected = editor.value.slice(start, end) || fallback;
  editor.setRangeText(`${before}${selected}${after}`, start, end, "select");
  editor.focus();
  onEdit();
}

function insertBlock(value) {
  const start = editor.selectionStart;
  const prefix = start > 0 && editor.value[start - 1] !== "\n" ? "\n" : "";
  editor.setRangeText(`${prefix}${value}`, start, editor.selectionEnd, "end");
  editor.focus();
  onEdit();
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function exportHtml() {
  const doc = activeDoc();
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(doc.title)}</title>
<style>body{max-width:820px;margin:48px auto;padding:0 24px;font:18px/1.75 Georgia,serif;color:#25231f}pre{background:#24221f;color:#f2ece0;padding:18px;overflow:auto}code{font-family:Consolas,monospace}table{border-collapse:collapse;width:100%}td,th{border:1px solid #d9d1c2;padding:8px 10px}blockquote{border-left:4px solid #a63d2f;padding-left:16px;color:#666}</style>
</head>
<body>${preview.innerHTML}</body>
</html>`;
  downloadFile(`${doc.title || "document"}.html`, html, "text/html;charset=utf-8");
}

function executeCommand(command) {
  if (app.dataset.mode === "live" && !["live", "source", "split", "preview", "new", "open", "save", "download", "html", "print"].includes(command)) {
    syncLiveToSource();
  }

  const doc = activeDoc();
  switch (command) {
    case "new":
      createDoc();
      break;
    case "open":
      fileInput.click();
      break;
    case "save":
      saveCurrent();
      break;
    case "bold":
      surroundSelection("**", "**");
      if (app.dataset.mode === "live") renderLiveEditor(editor.value);
      break;
    case "italic":
      surroundSelection("*", "*");
      if (app.dataset.mode === "live") renderLiveEditor(editor.value);
      break;
    case "heading":
      insertBlock("# 标题\n\n");
      if (app.dataset.mode === "live") renderLiveEditor(editor.value);
      break;
    case "quote":
      insertBlock("> 引用内容\n\n");
      if (app.dataset.mode === "live") renderLiveEditor(editor.value);
      break;
    case "code":
      insertBlock("```js\nconsole.log('hello');\n```\n\n");
      if (app.dataset.mode === "live") renderLiveEditor(editor.value);
      break;
    case "table":
      insertBlock("| 列 A | 列 B |\n| --- | --- |\n| 内容 | 内容 |\n\n");
      if (app.dataset.mode === "live") renderLiveEditor(editor.value);
      break;
    case "link":
      surroundSelection("[", "](https://example.com)", "链接文本");
      if (app.dataset.mode === "live") renderLiveEditor(editor.value);
      break;
    case "download":
      saveCurrent();
      downloadFile(`${doc.title || "document"}.md`, editor.value, "text/markdown;charset=utf-8");
      break;
    case "html":
      saveCurrent();
      exportHtml();
      break;
    case "print":
      saveCurrent();
      window.print();
      break;
    case "live":
    case "source":
    case "split":
    case "preview":
      if (app.dataset.mode === "live" && command !== "live") syncLiveToSource();
      if (command === "live") renderLiveEditor(editor.value);
      app.dataset.mode = command;
      break;
    default:
      break;
  }
}

function onEdit() {
  syncDocumentFromEditor();

  if (state.typewriter) {
    const lineHeight = Number.parseFloat(getComputedStyle(editor).lineHeight) || 28;
    const beforeCursor = editor.value.slice(0, editor.selectionStart);
    const currentLine = beforeCursor.split("\n").length;
    editor.scrollTop = Math.max(0, currentLine * lineHeight - editor.clientHeight * 0.46);
  }
}

function handleSourceKeydown(event) {
  if (event.key !== "Tab") return;
  event.preventDefault();
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  editor.setRangeText("  ", start, end, "end");
  onEdit();
}

function onLiveEdit() {
  applyLiveMarkdownShortcut();
  syncLiveDocument();
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-command]");
  if (!button) return;
  executeCommand(button.dataset.command);
});

editor.addEventListener("input", onEdit);
editor.addEventListener("keydown", handleSourceKeydown);
liveEditor.addEventListener("input", onLiveEdit);
liveEditor.addEventListener("keydown", handleLiveKeydown);
titleInput.addEventListener("input", () => {
  const doc = activeDoc();
  doc.title = titleInput.value.trim() || "未命名文档";
  doc.updatedAt = Date.now();
  renderFiles();
  setDirty(true);
});

searchInput.addEventListener("input", () => {
  state.search = searchInput.value.trim();
  renderAll();
});

themeSelect.addEventListener("change", () => {
  app.dataset.theme = themeSelect.value;
});

document.querySelector("#focusToggle").addEventListener("click", () => {
  app.classList.toggle("focus");
});

document.querySelector("#typewriterToggle").addEventListener("click", () => {
  state.typewriter = !state.typewriter;
  app.classList.toggle("typewriter", state.typewriter);
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;
  const body = await file.text();
  saveCurrent();
  const id = uid();
  state.docs.unshift({
    id,
    title: file.name.replace(/\.(md|markdown|txt)$/i, ""),
    body,
    updatedAt: Date.now(),
  });
  state.activeId = id;
  persist();
  hydrateActiveDoc();
  fileInput.value = "";
});

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  const mod = event.metaKey || event.ctrlKey;
  if (!mod) return;
  const inEditor = isEditorTarget(event.target);

  if (key === "s") {
    event.preventDefault();
    saveCurrent();
  }
  if (key === "o") {
    event.preventDefault();
    fileInput.click();
  }
  if (inEditor && key === "z") {
    event.preventDefault();
    if (event.shiftKey) {
      redoEdit();
    } else {
      undoEdit();
    }
  }
  if (inEditor && key === "y") {
    event.preventDefault();
    redoEdit();
  }
  if (key === "b") {
    if (!inEditor) return;
    event.preventDefault();
    surroundSelection("**", "**");
    if (app.dataset.mode === "live") renderLiveEditor(editor.value);
  }
  if (key === "i") {
    if (!inEditor) return;
    event.preventDefault();
    surroundSelection("*", "*");
    if (app.dataset.mode === "live") renderLiveEditor(editor.value);
  }
});

window.addEventListener("beforeunload", () => {
  saveCurrent();
});

loadState();
hydrateActiveDoc();
renderFiles();
