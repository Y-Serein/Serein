---
name: product-control-design
description: Use this skill when starting, auditing, redesigning, or stabilizing any frontend/backend/product project. It applies the Serein-derived engineering-control-loop method, pragmatic UX taste, architecture boundaries, release gates, and validation discipline across new projects.
---

# Product Control Design

Use this skill when the user wants a new project to learn from the Serein/Typora project’s design style and engineering process.

## Core Belief

A good project is not a pile of features. It is a system where the core path is stable, the user understands the state, the architecture protects data and change boundaries, and every important claim can be verified.

## Start With The Control Loop

For substantial work, frame the task as:

1. 目标：the user/system outcome that matters.
2. 状态：facts from files, tests, logs, screenshots, user feedback, or running software.
3. 误差：the difference between target and current state.
4. 控制动作：the smallest change or test that reduces the main error.
5. 反馈：what the command, UI, log, or user showed.
6. 修正：adjust based on feedback, not preference.
7. 验证：run the smallest relevant check.
8. 沉淀：write handoff/memory when a milestone or repeated lesson appears.

Keep the loop concrete. Do not write process theater.

## Priority Order

Use this order unless the project has a stronger explicit constraint:

1. Data safety and reversibility.
2. Core user path.
3. Perceived responsiveness.
4. Feature completeness.
5. Visual polish and consistency.
6. Architecture elegance.

Challenge any plan that optimizes lower-priority items while higher-priority items are unstable.

## Aesthetic Direction

Prefer:

- calm utility over decorative drama
- fewer, clearer entry points
- stable layouts with predictable hit areas
- restrained hover/focus/loading states
- real data over fake impressive visuals
- dense but readable information for operational tools
- progressive disclosure for advanced actions

Avoid:

- marketing-style screens for tools
- duplicated search/settings/action entry points
- debug information exposed as product UI
- wait cursors or disabled states that make short actions feel frozen
- decorative charts or graphs that do not represent real state

## Architecture Boundaries

Separate:

- domain model: rules, entities, relationships, pure transformations
- IO boundary: filesystem, database, network, OS APIs
- application orchestration: user commands, loading/error/dirty state, retries
- UI presentation: layout, controls, visual state, input events
- validation: tests, smoke checks, manual release checklists

Rules:

- Keep one source of truth for important state.
- Concentrate side effects at boundaries.
- Make destructive operations explicit and confirmable.
- Use lazy loading, pagination, or incremental updates for large data.
- Do not add abstractions unless they reduce real complexity or risk.
- Do not hide business rules inside controllers, page components, or ad hoc scripts.

## Frontend Checklist

- The first screen should be the product experience, not a brochure.
- Controls should map to familiar UI patterns.
- Text, paths, labels, and errors must fit in their containers.
- Popovers should be near their trigger and not clipped by layout.
- Icon clicks must work even when the event target is an SVG node.
- Keyboard and mouse paths should both be considered for high-frequency actions.
- Layout should not jump on hover, click, loading, or state changes.
- Complex UI must be verified with real interaction, not only static inspection.

## Backend Checklist

- Validate external input.
- Return explicit errors.
- Make write operations atomic where possible.
- Treat partial failure as a first-class case.
- Make long tasks observable or cancellable.
- Keep public contracts stable or provide migrations.
- Optimize from measured bottlenecks, not guesses.

## Release Gates

Internal beta can tolerate rough edges, but not uncontrolled data loss, main-path crashes, or ambiguous write/export/delete behavior.

Public release additionally needs:

- versioning
- install/upgrade/uninstall story
- known issues
- logging or feedback path
- backup/migration/rollback story
- representative performance tests
- real-platform smoke matrix

## Validation Discipline

Match validation to risk:

- pure logic: unit tests
- typed contracts: type/static checks
- bundling: production build
- OS/native features: real shell/app test
- UX: screenshot and manual high-frequency path checks
- data safety: copied real-like datasets and rollback tests
- release: clean machine install and uninstall

Never use a lower-level check as proof of a higher-level experience.

## Prompt Template

```text
你是这个新项目的项目审核者、产品设计者和工程控制论式接手者。请先阅读项目说明、AGENTS.md/README/构建脚本/测试脚本/关键代码，不要急着改代码。

请学习 Serein 项目的设计方法：
- 目标先行，主矛盾优先。
- 数据安全和主路径体验优先于功能堆叠。
- UI 简洁克制，不做重复入口，不用装饰掩盖流程问题。
- 架构分清领域模型、IO 边界、应用编排、UI 表现和验证层。
- 每次修改按“目标→状态→误差→控制动作→反馈→修正→验证→沉淀”闭环推进。

请先输出：
1. 当前项目目标和发布阶段判断。
2. 审美/体验方向。
3. 主流程和高风险流程。
4. 架构边界和可能失控点。
5. 最小验证方案。

如果需要改代码，只做最小可回滚改动；完成后说明验证结果、风险和下一步。
```
