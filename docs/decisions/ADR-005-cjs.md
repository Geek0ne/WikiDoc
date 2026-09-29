# ADR-005: 服务端保持 CommonJS，openid-client 锁定 5.7.1

## Status

Accepted — 2026-09-28（项目总监裁决，覆盖架构师原 ESM 提案）

## Background

SSO 需要通用 OIDC 支持。`openid-client` 从 v6 起为 ESM-only，在 CommonJS 项目中无法通过 `require` 加载。
架构师原方案是整体改造服务端为 ESM 以使用 6.x。总监否决该改造。

## Decision

- 服务端保持 **CommonJS**：不设 `"type": "module"`，`tsconfig` 使用 `module: commonjs`。
- OIDC 客户端锁定 **openid-client 5.7.1**（CJS 与 ESM 双格式，已安装）。
- Express 同步锁 **4.21.2**（`@types/express@4.17.21`），避免 Express 5 的 path-to-regexp v8 路径语法变更影响并行开发。
- Express 4 不自动冒泡 async 异常，所有 async 路由必须包 `asyncHandler()`，由 `middleware/error.ts` 统一兜底。

## Consequences

正面：
- 消除全局 ESM 改造风险（第三方 CJS 依赖互操作、`__dirname` 换算、模块解析差异）。
- SSO 是可选功能，不让它反向决定服务端模块格式，符合"可选功能不承担架构绑架"。
- 团队既有 CommonJS 写法可直接沿用，并行开发冲突最小。

负面：
- 停留在 openid-client 5.x 分支；未来若需要 6.x 新特性，需整体转 ESM（届时应新开 ADR 评估）。
- 丧失与未来 ESM-only 依赖的直接兼容能力，新增依赖需先确认模块格式。
- async 错误需显式包装，漏包会吞掉异常（用 lint 规则 + 代码评审守卫）。

## Related ADRs

ADR-001
