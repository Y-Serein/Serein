# Serein Markdown / Vault 规则整理

最后更新：2026-06-11

本文记录 Serein 当前实现里“标题、标签、frontmatter、搜索前缀、链接”的判定规则。

注意：这里区分两类规则：

- Markdown / CommonMark 标准或传统语法。
- Serein 当前代码里的实际实现。两者并不完全等价。

## 1. 标准来源

### Setext 标题是谁的规则

`标题` 下一行 `---` 识别为二级标题、下一行 `===` 识别为一级标题，这是 Markdown 的 setext-style heading 规则。

来源：

- 原始 Markdown 语法文档：John Gruber 的 Daring Fireball Markdown Syntax Documentation。它说明 Markdown 支持 Setext 和 ATX 两种 header 风格，Setext 用 `=` 表示一级标题，用 `-` 表示二级标题。
  https://daringfireball.net/projects/markdown/syntax#header
- CommonMark 规范：CommonMark 0.31.2 第 4.3 节 `Setext headings`。它更严格地定义了 setext heading：文本行后跟 setext underline；`=` 是 level 1，`-` 是 level 2。
  https://spec.commonmark.org/0.31.2/#setext-headings

结论：这不是 Serein 自创规则，是 Markdown 传统语法，并由 CommonMark 明确定义。

## 2. Serein 当前标题判定

当前大纲提取实现位置：

- `apps/serein-desktop/src/shared/markdown.ts`
- 关键函数：`extractMarkdownHeadings`、`extractOutline`、`getHeadingOffsets`、`findHeadingIndex`

### ATX 标题

| 写法 | 当前判定 |
|---|---|
| `# 标题` | 一级标题 |
| `## 标题` | 二级标题 |
| `###### 标题` | 六级标题 |
| `####### 标题` | 不是标题，最多 6 个 `#` |
| `#标题` | 不是标题，`#` 后必须有空格 |
| `  # 标题` | 是标题，允许 0-3 个前导空格 |
| `    # 标题` | 不是标题，4 个空格更接近代码块 |
| `### 标题 ###` | 是标题，尾部 closing `#` 会被去掉 |
| 代码块里的 `# 标题` | 不是大纲标题 |
| frontmatter 里的 `#` 或 `status` | 不是大纲标题 |

### Setext 标题

| 写法 | 当前判定 |
|---|---|
| `标题` 下一行 `===` | 一级标题 |
| `标题` 下一行 `---` | 二级标题 |
| 下划线前 0-3 个空格 | 仍可识别 |
| 下划线前 4 个空格 | 不识别 |
| 代码块内的 setext 写法 | 不识别 |

注意：Serein 当前 setext 实现是简化版，只把“上一条非空行”当标题文本，不完整实现 CommonMark 的多行 setext 标题。

### 大纲修复点

之前的 bug 是：

```markdown
---
tags: [work]
status: active
---
# First
```

`status: active` 下一行 `---` 曾被误判为 setext 二级标题，导致大纲多出一项，点击第一个真实标题时跳到第二个。

当前已修正：大纲提取前会跳过合法 YAML frontmatter。

## 3. 文档标题判定

Vault 索引里的文档标题不是完整大纲规则。

当前实现：

- 先解析并跳过 YAML frontmatter。
- 只看正文第一行。
- 只有正文第一行是 `# 标题` 时，才用它作为文档标题。
- 否则用文件名去掉扩展名。

示例：

```markdown
---
tags: [work]
status: active
---
# My Note
```

文档标题是 `My Note`。

如果正文第一行不是一级 ATX 标题：

```markdown
---
tags: [work]
status: active
---
普通第一行
```

文档标题使用文件名。

## 4. Frontmatter 判定

当前实现位置：

- `apps/serein-desktop/src/shared/markdown.ts`
- 关键函数：`splitYamlFrontmatter`、`parseYamlProperties`

当前支持：

| 写法 | 当前判定 |
|---|---|
| 文件开头 `--- ... ---` | frontmatter |
| 文件开头 `*** ... ***` | frontmatter |
| 文件开头 `___ ... ___` | frontmatter |
| 文件开头前有空行 | 允许 |
| UTF-8 BOM | 会处理 |
| `key: value` | 属性 |
| `key:` 下一行 `- value` | 列表属性 |
| `tags: [a, b]` | 列表属性 |
| key 中包含字母、数字、`_`、`-` | 支持 |

当前不是完整 YAML 解析器，不要假设复杂 YAML 都能正确解析。

## 5. Vault 标签判定

当前实现位置：

- `apps/serein-desktop/src/vault/index.ts`
- 关键函数：`activeFrontmatterTags`

Vault 标签只来自 frontmatter 的 `tags` 字段，并且要求 `status: active`。

必须同时满足：

1. 有合法 frontmatter。
2. 有 `tags` 字段。
3. 有 `status: active`。
4. `status` 比较大小写不敏感。

示例：

```markdown
---
tags: [work, #remark]
status: active
---
# Note
```

得到标签：

```text
work
remark
```

规则细节：

| 写法 | 当前结果 |
|---|---|
| `tags: [work, project]` | 两个标签：`work`、`project` |
| `tags: [#work]` | 标签是 `work`，会去掉开头 `#` |
| `tags: [remark 备注]` | 一个标签：`remark 备注` |
| `tags: work` | 一个标签：`work` |
| `tags:` 下一行 `- work` | 支持 |
| `status: active` | 标签生效 |
| `status: inactive` | 标签不生效 |
| 没有 `status` | 标签不生效 |
| 正文 `#work` | 不进入 Vault 标签列表 |

## 6. 搜索前缀判定

当前实现位置：

- `apps/serein-desktop/src/vault/index.ts`
- 关键函数：`parseVaultSearchQuery`、`searchVaultIndex`

| 输入 | 当前含义 |
|---|---|
| `@work` | 搜标签 |
| `#title` | 搜标题，不是搜标签 |
| `/path` | 搜路径 |
| `:text` | 搜正文内容 |
| `text` | 标题、路径、标签、正文都搜 |

重要结论：

- `#xxx` 在搜索框里是“按标题搜索”。
- `@xxx` 才是“按标签搜索”。
- `#work` 作为正文内容，不会自动成为 Vault 标签。

### 未打开文件的 `@tag` 搜索

当前实现位置：

- 前端入口：`apps/serein-desktop/src/App.tsx`
- Rust targeted search：`apps/serein-desktop/src-tauri/src/vault.rs`

规则：

- 只对 `@xx` 这类标签查询走 targeted search。
- 标签查询至少 2 个字符才触发。
- Rust 会读取候选文件开头 frontmatter。
- 只有 `status: active` 且 `tags` 中包含查询词的文件才返回。
- 返回后再由前端构建临时 Vault index。

## 7. 链接判定

当前实现位置：

- `apps/serein-desktop/src/vault/index.ts`
- 关键函数：`extractRawLinks`、`resolveVaultLinkTarget`

| 写法 | 当前判定 |
|---|---|
| `[[Note]]` | wiki 链接 |
| `[[Note#Heading]]` | wiki 链接到标题 |
| `[[Note|Alias]]` | wiki 链接带显示文本 |
| `![[image.png]]` | embed 链接 |
| `[text](./note.md)` | Markdown 本地链接 |
| `[text](#Heading)` | 当前文件标题链接 |
| `[text](https://example.com)` | 外部链接，不进 Vault link index |

目录链接会按项目规则尝试解析到目录下的 index/README 类文件。

## 8. Heading parser 统一状态

### 大纲标题 vs Vault 索引标题

当前大纲和 Vault 索引已经统一使用 `shared/markdown.ts` 的 `extractMarkdownHeadings`。

统一后的行为：

- 跳过 frontmatter。
- 跳过代码块。
- 支持 ATX 标题。
- 支持 setext 标题。

Vault 索引仍会在 `vault/index.ts` 中为 heading 额外生成 slug，但 heading 的 level/text 来源与大纲一致。

这意味着：

- 左侧大纲和知识面板里的 heading 数据使用同一套标题识别规则。
- frontmatter 里的 `status/tags` 不会进入大纲，也不会进入 Vault heading index。
- 代码块里的 `# 标题` 不会进入大纲，也不会进入 Vault heading index。
- setext 标题会同时进入大纲和 Vault heading index。

历史问题：

- 旧版大纲和 Vault 索引各有一套 heading parser。
- 旧版 Vault 索引只识别行首 `# 标题`，不支持 setext，也没有显式跳过代码块。
- 现在这部分已统一。

### 标准 CommonMark vs Serein 当前实现

Serein 当前规则不是完整 CommonMark：

- setext 标题是简化实现。
- frontmatter 是项目自定义扩展，不属于 CommonMark 核心语法。
- Vault 标签是 Serein 自己定义的 `status: active` + `tags` 规则，不是 Markdown 标准。

## 9. 建议产品规则

为了减少用户误解，建议后续保持以下产品语义：

1. `# 标题`：只表示 Markdown 标题。
2. `#xxx` 搜索：只表示标题搜索。
3. `@xxx` 搜索：只表示标签搜索。
4. 正式 Vault 标签只来自 frontmatter `tags`。
5. 正文 `#tag` 暂时只当普通正文，除非未来明确要支持 Obsidian 风格 inline tags。
6. 如果未来支持正文 inline tags，必须先设计清楚它和标题搜索 `#xxx` 的关系，否则会继续混淆。
