# ADR-004: 前端样式采用原生 CSS 变量设计系统，不引入 Tailwind

## Status

Accepted — 2026-09-28

## Background

需求包含多套主题、明暗切换与中英双语持久化；团队 P0 规则要求禁止硬编码颜色（唯一例外 `#fff` 与 `#000`）。

## Decision

- 设计令牌集中在 `client/src/styles/tokens.css`：`--color-bg`、`--color-surface`、`--color-text`、`--color-muted`、`--color-accent`、`--color-border`、`--color-success`、`--color-warning`、`--color-danger`、`--radius-*`、`--space-*`、`--font-*`。
- 主题与明暗拆成 `theme`（graphite / inkgreen / slate）与 `mode`（light / dark / auto）两个维度，
  运行时拼成 `data-theme="<theme>-<mode>"`，共 3 × 3 组合，其中 `mode=auto` 由前端解析为 light 或 dark。详见 ADR-008。
- 组件只允许引用变量，禁止任何颜色字面量。
- 不引入 Tailwind、CSS-in-JS 或 UI 组件库；自建 `components/ui/` 基础组件层（Button、Input、Select、Modal、Table、Toast、Tabs）。

## Consequences

正面：
- 主题切换是纯变量替换，无需构建插件或 dark class 策略，运行时可动态增减主题。
- 天然满足"禁硬编码颜色"规则，审计只需扫 `tokens.css` 一处。
- 构建配置复杂度低，无额外 PostCSS/内容扫描链路。

负面：
- 失去 utility class 的开发速度红利，需要自建并维护基础组件层。
- 响应式与间距需自行约定，团队需遵守令牌命名规范（由 Code Review 与 lint 规则保障）。

## Related ADRs

ADR-003
