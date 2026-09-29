# ADR-001: 使用 SQLite（better-sqlite3）作为唯一数据存储

## Status

Accepted — 2026-09-28

## Background

WikiDoc 部署在企业内网，运行时不允许依赖任何外部服务（无独立数据库容器、无外网）。同时需要"一键部署 + 单文件备份"的运维形态。核心功能全文检索也必须在同一存储层内解决。

## Decision

采用 better-sqlite3 11.10.0（内置 SQLite 3.49.2，已实测 `sqlite_version()=3.49.2`，FTS5 与 trigram 均可用），
手写 SQL + 版本化迁移脚本（不引入 ORM）。

- 迁移脚本：`server/src/db/migrations/NNN_*.sql`，`schema_migrations` 表保证幂等。
- 连接启动参数：`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;`

## Consequences

正面：
- 零外部服务，天然满足离线与一键部署；备份即 `VACUUM INTO` 单文件。
- FTS5 开箱可用，检索与业务数据同库，权限过滤可与检索在同一条 SQL 内完成。
- 无 ORM 引擎二进制下载问题（Prisma 在离线环境不可行）。

负面：
- 单写者模型，写并发受限，需 WAL + busy_timeout + 长事务拆批缓解。
- 不支持水平扩展；未来需要多实例时必须迁移到 PostgreSQL，表结构与 SQL 需重写。
- 手写 SQL 要求 repository 层严格收口，禁止在 route 层拼 SQL。

## Related ADRs

ADR-002（检索方案依赖 SQLite FTS5）
