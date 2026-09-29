# ADR-008: 主题与明暗拆成 theme + mode 两个字段，不用复合枚举

## Status

Accepted — 2026-09-28（采纳设计侧 mvp-dev-expert-team-designer 提出的两点论证）

## Background

设计侧交付的 tokens.css 实现 3 套配色 × 明暗两套 = 6 个组合值：`graphite-light/dark`、
`inkgreen-light/dark`、`slate-light/dark`。架构初版把 6 个组合值直接做成单个枚举字段 `users.theme`。
设计侧指出该建模方式有两个隐患，架构复核后认为成立，故拆分。

## Decision

- `users.theme`：`graphite` / `inkgreen` / `slate`（配色），默认 `graphite`
- `users.mode`：`light` / `dark` / `auto`（明暗），默认 `light`
- 运行时由前端拼成 `data-theme="<theme>-<mode>"`；`mode=auto` 先用 `matchMedia('(prefers-color-scheme: dark)')`
  解析为 `light` 或 `dark` 再拼接。
- **硬约束**：`auto` 必须原样持久化，禁止存解析后的值。存解析值等于把用户偏好固化，
  用户更换系统主题后不会再跟随变化。
- 未登录用户用 `localStorage` 的两个 key：`wikidoc.theme`、`wikidoc.mode`。
- `site_settings` 侧对应 `defaultTheme` 与 `defaultMode` 两个键。
- SQLite 侧**不加 CHECK 约束**，枚举由应用层 zod 校验。SQLite 无法 ALTER CHECK 约束，
  加约束会让"新增一套主题"退化成重建表的迁移。

## Consequences

正面：
- "跟随系统"可被表达。复合枚举里没有 `auto` 的位置——若强行加进去，它与其他值不同质（一个是偏好、五个是具体值），语义混乱。
- 新增第 4 套配色只需扩展 `theme` 枚举，不触碰 `mode`；且因为不加 CHECK 约束，实际只是改一处 zod schema，无需数据库迁移。
- 与设计侧 tokens.css 的 `[data-theme="X-light|dark"]` 选择器结构和 localStorage 双 key 设计天然对齐，前端不需要做转换层。

负面：
- 两个字段而非一个，存在"主题与模式组合无效"的理论可能（例如 `theme=slate` + `mode=auto` 是有效的，
  但未来若某套配色只有单模式就会出问题）。缓解：由 zod 分别校验，组合有效性由 tokens.css 的实际存在性保证——
  前端在拼接后若发现该 `data-theme` 无对应样式，回退到 `graphite-light`。
- 需多维护一个 matchMedia 监听器（约 15 行），`auto` 模式下系统主题切换时要实时响应。

## Related ADRs

ADR-004
