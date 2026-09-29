# ADR-006: 在线画板自研 SVG 实现，不引入 Excalidraw

## Status

Accepted — 2026-09-28（项目总监裁决，覆盖架构师原 Excalidraw 提案）

## Background

文档编辑器需要在正文内嵌在线画板。架构师原方案用 `@excalidraw/excalidraw@0.18.1`。
该包体积 2MB+，且默认从 CDN 拉取字体，需要额外自托管步骤才能满足"零外网依赖"这条 P0。

## Decision

自研 SVG 画板，位于 `client/src/features/editor/board`。

- 支持图元：矩形、椭圆、线段、箭头、文本、自由笔迹（六种），后续可增量加菱形与连接线。
- 数据结构：纯 JSON 图元数组，存 `drawings.payload_json`；视图状态（缩放、平移、选中）存 `app_state_json`。
- 渲染：直接操作 SVG DOM，不使用 canvas 位图，保证导出结果是可缩放、可搜索、可消毒的矢量。
- 导出：内联 `<svg>` 嵌入文档 Markdown 的 `:::drawing` 容器中，同时生成 PNG 预览附件存 `preview_attachment_id`。
- 不做：图层面板、多人协同绘制、手绘风格抖动算法、模板库。

## Consequences

正面：
- 零字体依赖、零 CDN 资源，天然满足离线 P0；不再需要自托管字体这一额外步骤。
- 体积控制在数十 KB 量级，且不反向约束 React 版本（Excalidraw peer 曾限制 React 大版本选型）。
- 图元 JSON 是自研格式，可被 `sanitize-html` 精确消毒，XSS 面可控。

负面：
- 需自行实现选择、拖拽、缩放、撤销重做栈、箭头吸附等交互，工作量高于接库。
- 功能深度不及成熟库（无手绘风格、无模板、无协同）。
- SVG 图元可携带 `on*` 事件属性，是潜在 XSS 载体，必须在落库与渲染两端消毒（已列入风险表）。

## Related ADRs

ADR-004
