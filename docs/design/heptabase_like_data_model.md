# Heptabase 式数据模型草案

本轮只设计模型边界，不实现完整白板能力。

## Card

最小知识单元，承载 Markdown 内容。

```ts
type Card = {
  id: string;
  title: string;
  markdown: string;
  tagIds: string[];
  createdAt: string;
  updatedAt: string;
};
```

## Whiteboard

组织 Card 的空间容器。后续用于承载二维布局、分组、连线。

```ts
type Whiteboard = {
  id: string;
  title: string;
  itemIds: string[];
  createdAt: string;
  updatedAt: string;
};
```

## WhiteboardItem

Card 在 Whiteboard 中的呈现实例。同一个 Card 可出现在多个 Whiteboard。

```ts
type WhiteboardItem = {
  id: string;
  whiteboardId: string;
  cardId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
};
```

## Tag

跨 Card 的主题组织方式。

```ts
type Tag = {
  id: string;
  name: string;
  color: string;
  cardIds: string[];
};
```

## Link / Backlink

Card 之间的显式或隐式关系。Backlink 可以由 Link 反向查询得到，不需要重复存储。

```ts
type Link = {
  id: string;
  fromCardId: string;
  toCardId: string;
  kind: "manual" | "mention";
  createdAt: string;
};
```

## 后续存储建议

- Demo: React state
- 单机正式版: SQLite 或文件夹内 JSON + Markdown
- 导入导出: Markdown 文件夹优先，JSON project backup 次之
- 反链索引: 从 Card markdown 和 Link 表增量构建
