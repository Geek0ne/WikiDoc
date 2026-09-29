# ADR-003: 图标库锁定 lucide-react

## Status

Accepted — 2026-09-28

## Background

团队 P0 规则：禁止使用 emoji 作为功能图标，且必须锁定唯一一套 SVG 图标库，全项目禁止混用。

## Decision

全项目（含管理后台、编辑器工具栏、空状态、错误页）仅使用 `lucide-react@0.469.0`（本机实际安装版本，以此为准），
采用具名按需导入（`import { Search } from 'lucide-react'`），随构建产物本地打包。

禁止项：其它图标库、图标字体、CDN 引用、emoji 充当图标、内联 SVG 散落在业务组件中。

## Consequences

正面：
- 纯 SVG 组件，零网络请求，满足内网离线要求。
- tree-shaking 友好，风格（线宽、圆角、视觉重量）统一。

负面：
- 领域特定图标（如"多维表格""画板""分栏"）可能缺失，需自绘 SVG，统一放在 `client/src/components/icons/` 并沿用 lucide 的 24x24 / stroke 1.5 规范。
- 版本升级需要一次性回归（图标重命名会引发编译错误，属可控失败）。

## Related ADRs

ADR-004
