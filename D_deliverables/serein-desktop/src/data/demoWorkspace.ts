import type { WorkspaceSnapshot } from "../domain/model";

const now = "2026-05-10T00:00:00.000Z";

export const demoWorkspace: WorkspaceSnapshot = {
  cards: [
    {
      id: "card-landing",
      title: "Serein",
      markdown: `# Serein

这是正式桌面版的最小落地工程。

## 本轮目标

- Tauri 2 桌面壳
- React + TypeScript 应用层
- Milkdown 所见即所得 Markdown 编辑器
- 左侧 Card / Document 列表
- 右侧 Outline / Info 占位

> 当前只放 demo 数据，不实现白板、同步、插件和 AI。
`,
      tagIds: ["tag-product"],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "card-model",
      title: "Card Model",
      markdown: `# Card Model

Card 是最小知识单元。后续 Whiteboard 只是组织 Card 的空间视图。

## 后续字段

- backlinks
- aliases
- attachments
- source references
`,
      tagIds: ["tag-architecture"],
      createdAt: now,
      updatedAt: now,
    },
  ],
  whiteboards: [
    {
      id: "board-main",
      title: "Main Whiteboard",
      itemIds: ["item-landing", "item-model"],
      createdAt: now,
      updatedAt: now,
    },
  ],
  whiteboardItems: [
    {
      id: "item-landing",
      whiteboardId: "board-main",
      cardId: "card-landing",
      x: 120,
      y: 120,
      width: 420,
      height: 260,
      zIndex: 1,
    },
    {
      id: "item-model",
      whiteboardId: "board-main",
      cardId: "card-model",
      x: 590,
      y: 160,
      width: 380,
      height: 240,
      zIndex: 2,
    },
  ],
  tags: [
    {
      id: "tag-product",
      name: "Product",
      color: "#a63d2f",
      cardIds: ["card-landing"],
    },
    {
      id: "tag-architecture",
      name: "Architecture",
      color: "#2f6c88",
      cardIds: ["card-model"],
    },
  ],
  links: [
    {
      id: "link-landing-model",
      fromCardId: "card-landing",
      toCardId: "card-model",
      kind: "manual",
      createdAt: now,
    },
  ],
};
