# ADR-002: 全文检索使用 FTS5 + 应用层 bigram 预分词，不使用 trigram

## Status

Accepted — 2026-09-28

## Background

全站搜索需要覆盖标题、正文与代码块，且中文是主要语种。SQLite 无内建中文分词器。
验证环境：better-sqlite3 11.10.0，内置 SQLite 3.49.2（FTS5 与 trigram 均可用）。

## Decision

- 虚表：`CREATE VIRTUAL TABLE doc_search USING fts5(title, body, code, doc_id UNINDEXED, tokenize='unicode61')`
- 分词：自研唯一实现 `server/src/search/segment.ts`。连续 CJK 段切为重叠 bigram（`数据库原理` → `数据 据库 库原 原理`）；单字 CJK 原样保留；ASCII 词与数字整词保留并转小写；代码块内容进 `code` 列。
- 写端与查询端必须使用同一个 `segment.ts`，不允许出现第二份分词实现。
- 查询串构造：先 AND 拼接全部 token；结果数为 0 时自动降级为 OR；每个 token 用双引号包裹并转义内部 `"`，剥离 FTS5 语法符号。
- 长度 < 2 字符的查询不走 FTS，改走 `LIKE '%q%'` 并强制 `LIMIT 50`。
- 摘要不使用 FTS5 `snippet()`（其输出含分词插入的空格，实测 `容器 器编 编排`），由应用层在原始 `content_text` 上定位并生成高亮摘要。
- 排序：`bm25(doc_search, 10.0, 4.0, 1.0)` + 轻量时间衰减。

## Consequences

正面：
- 2 字中文词可命中。实测 trigram 下「大运」「索引」命中 0、「撞大运」命中 1；bigram + unicode61 下「原理」「数据」「索引」「数据库」「IndexOptimization」「indexoptimization」全部命中。
- 无外部分词词典依赖，完全离线可控。

负面：
- 索引体积约为原文 2 至 3 倍，写入速度低于 unicode61 原文直写。
- 分词逻辑一旦写端与查询端不一致，会出现"静默搜不到"，必须有单测与 CI 守卫。
- 单字查询退化为 LIKE 全表扫描，仅在极短查询下发生，已用 LIMIT 兜底。

## Related ADRs

ADR-001
