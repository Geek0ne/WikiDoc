# WikiDoc 架构设计说明书

版本：v1.0 ｜ 作者：高见远（首席架构师）｜ 状态：待评审
运行环境：企业内网离线（构建期可联网装包，运行时零外网依赖）

---

## 0. 硬约束（违反即退回重做）

1. 本文件及全项目文档禁止出现 emoji 字符。
2. 禁止紫到粉的渐变配色方案。
3. 前端禁止硬编码颜色值，唯一例外 `#fff` 与 `#000`；所有颜色必须来自 `client/src/styles/tokens.css` 中的 CSS 变量。
4. 图标库锁定唯一一套：**lucide-react**。禁止混用其它图标库、禁止内联 emoji 图标、禁止图标字体 CDN。
5. 运行时禁止任何外网请求：无 Google Fonts、无 jsDelivr/unpkg/CDN、无外部 SaaS 回调。字体文件随构建产物本地托管。

---

## 1. 技术选型对比矩阵（版本已锁定）

### 1.1 运行时与语言

| 候选 | 结论 | 理由 |
|---|---|---|
| Node.js 22.22.2 + TypeScript 5.7.3 (CommonJS) | **选用** | 与前端同语言，LDAP/OIDC/文档解析生态最全；总监裁决：**服务端保持 CommonJS**，不因可选功能（OIDC）承担全局 ESM 改造风险；npm 10.9.7 与现有环境一致 |
| Python 3.12 + FastAPI | 不选 | 团队栈为 JS/TS，两套语言增加运维与部署体积；mammoth/SheetJS 无同源等价物 |
| Go 1.23 + Gin | 不选 | 开发效率低于 TS，复杂文档解析与前端同构能力弱 |

### 1.2 后端框架

| 候选 | 结论 | 理由 |
|---|---|---|
| Express 4.21.2 | **选用** | 生态最成熟，`@types/express@4.17.21` 类型稳定；总监裁决：从 5.x 降回 4.21.2，规避 path-to-regexp v8 通配符语法变更带来的并行开发风险。代价：async 路由错误需自行包装 `asyncHandler` |
| Express 5.2.x | 不选 | path-to-regexp v8 路径语法变更（`*splat` 取代 `*`），与团队既有写法冲突，MVP 阶段收益为负 |
| NestJS 11 | 不选 | 装饰器 DI + 模块化对 MVP 是过度设计，学习成本与代码量翻倍 |
| Fastify 5 | 不选 | 性能优势在本场景（内网百人级）不生效，生态插件少于 Express |

### 1.3 数据库

| 候选 | 结论 | 理由 |
|---|---|---|
| SQLite 3.49.2（better-sqlite3 11.10.0 内置）+ 手写 SQL 迁移 | **选用** | 零服务进程、单文件备份、内网离线天然满足；内置 FTS5 已覆盖搜索需求；实测 `sqlite_version()=3.49.2`（≥3.34，trigram 亦可用，但见 §1.4 未采用） |
| PostgreSQL 16 + Prisma | 不选 | 需额外容器与运维；Prisma 引擎二进制需联网下载且体积大，与"内网离线"目标冲突 |
| MySQL 8 + Drizzle | 不选 | 同上，且 MySQL 中文全文检索需 ngram 插件，配置复杂 |

### 1.4 全文检索

| 候选 | 结论 | 理由 |
|---|---|---|
| FTS5 + 应用层 bigram 预分词 + unicode61 | **选用** | 见 §6 实测结论：2 字中文词可命中 |
| FTS5 + `tokenize='trigram'` | 不选 | 实测：查询「大运」「索引」命中 0，2 字中文词是中文最高频查询单元，该盲区致命 |
| Meilisearch 1.x | 不选 | 需独立服务进程与内存，违反单容器一键部署目标 |
| PostgreSQL 全文检索 | 不选 | 依赖已排除的数据库 |

### 1.5 认证与目录服务

| 候选 | 结论 | 理由 |
|---|---|---|
| ldapts 7.0.0 | **选用** | 纯 TypeScript、无原生依赖、Windows 可装；API 为 Promise 风格；已安装版本为准 |
| ldapjs 3.0.7 | 不选 | API 为回调风格、类型声明薄弱、维护停滞 |
| passport-ldapauth | 不选 | 与自研 JWT 体系耦合笨重 |
| openid-client 5.7.1（OIDC 通用） | **选用** | 协议级通用，不绑定任何一家 IdP。总监裁决：锁 5.7.1（**CJS 兼容**）而非 6.x，6.x 为 ESM-only，会让可选功能反向绑架服务端模块格式 |
| 单一厂商 SDK（如只做企业微信登录） | 不选 | 把 SSO 绑死成一家，违反可扩展性要求 |

### 1.6 前端

| 候选 | 结论 | 理由 |
|---|---|---|
| React 18.3.1 + Vite 7.1.11 + 原生 CSS 变量 | **选用** | 多主题切换靠 `:root[data-theme="x"]` 覆盖 CSS 变量，无需 Tailwind 的 dark class 与构建插件；减少一层配置复杂度 |
| React 19.3.0 | 不选（暂缓） | 部分三方库对 19 的兼容仍在跟进，MVP 不引入此不确定项 |
| Tailwind CSS 4 | 不选 | 主题切换需额外 dark mode 策略与内容扫描配置；与"锁定设计令牌"相比收益为负 |
| Next.js 15 | 不选 | 本项目是单端口内网应用，SSR/SEO 无收益，反而增加部署复杂度 |

### 1.7 文档导入

| 候选 | 结论 | 理由 |
|---|---|---|
| mammoth 1.11.0（docx → HTML）+ turndown 7.2.0（HTML → Markdown） | **选用** | 纯 JS、无原生依赖；mammoth 出 HTML、turndown 转 Markdown，两步链路可控可调 |
| **exceljs 4.4.0** | **选用** | 总监裁决：直接采用降级方案。npm 可达、维护中、无 CVE。理由：内网构建机很可能访问不到 cdn.sheetjs.com，不为可选路径引入构建期外部依赖 |
| xlsx（SheetJS）0.20.3 | **不选** | npm 公共源停在 0.18.5，含 CVE-2023-30533（原型污染）与 CVE-2024-22363（ReDoS）；修复版只在 cdn.sheetjs.com，构建环境不可达 |
| LibreOffice headless | 不选 | 镜像体积增加 500MB+，与轻量部署目标冲突 |

### 1.8 在线画板

| 候选 | 结论 | 理由 |
|---|---|---|
| **自研 SVG 画板**（矩形/椭圆/线段/箭头/文本/自由笔迹） | **选用** | 总监裁决：产物零字体依赖、无 CDN 资源、体积可控制在数十 KB、不反向约束 React 版本；导出为内联 SVG 直接嵌入文档 |
| @excalidraw/excalidraw 0.18.1 | 不选 | 体积 2MB+，且默认从 CDN 拉取字体（违反离线 P0），需额外自托管字体步骤 |
| fabric.js / Konva | 不选 | 面向画布位图操作，与"导出干净 SVG 嵌入文档"的目标不匹配，且体积大于自研方案 |

### 1.9 通知

| 候选 | 结论 | 理由 |
|---|---|---|
| 自研 webhook 适配层（企业微信/飞书）+ nodemailer 7.0.11（SMTP） | **选用** | 均为 HTTP POST / SMTP 标准协议，无 SDK 依赖，内网代理可达即可 |
| 官方 SDK（wecom-sdk 等） | 不选 | 机器人场景只需签名 + POST JSON，SDK 属多余依赖 |

### 1.10 前端状态管理与国际化

| 候选 | 结论 | 理由 |
|---|---|---|
| React Context + 自研 fetch 封装 | **选用** | 已定实现：不引入 zustand / react-query。MVP 数据面以页面级请求为主，Context 足够承载主题、语言、当前用户三份全局状态 |
| Zustand 5 + TanStack Query 5 | 不选 | 已装依赖中不存在，且当前实现不需要缓存失效与请求编排能力 |
| i18next 23 + react-i18next 15 | 不选（可选后续） | 已定实现为自研轻量 i18n（词条 JSON + Context + localStorage）。若后续引入，需锁 `i18next@23.16.8` + `react-i18next@15.7.4` |

---

## 2. 锁定依赖清单（唯一真源，禁止漂移）

以 `server/package.json` 与 `client/package.json` 实际安装版本为准，禁止 caret 漂移（统一改为精确版本号提交锁文件）。

服务端（**CommonJS**，不设 `"type": "module"`）：
`express@4.21.2` `better-sqlite3@11.10.0`（内置 SQLite **3.49.2**）`zod@3.24.1`
`jsonwebtoken@9.0.2` `bcryptjs@2.4.3` `ldapts@7.0.0` `openid-client@5.7.1`
`mammoth@1.11.0` `turndown@7.2.0` `exceljs@4.4.0` `nodemailer@7.0.11`
`multer@2.0.2` `helmet@8.0.0` `cookie-parser@1.4.7` `cors@2.8.5` `compression@1.7.5`
`sanitize-html@2.13.1` `dayjs`（按需）
开发依赖：`typescript@5.7.3` `tsx@4.19.2` `vitest@3.0.5` `@types/express@4.17.21` `@types/node@22.10.5`

客户端：`react@18.3.1` `react-dom@18.3.1` `react-router-dom@6.28.1` `vite@7.1.11`
`@vitejs/plugin-react@4.3.4` `typescript@5.7.3` **`lucide-react@0.469.0`（唯一图标库）**
`markdown-it@14.1.0` `dompurify@3.2.4` `highlight.js@11.11.0`

图标库锁定说明：`lucide-react@0.469.0` 以 tree-shaking 方式按需打包进产物，不发起任何网络请求；
全项目（含管理后台、编辑器工具栏、空状态）只允许从 `lucide-react` 导入图标，图标名沿用 lucide 官方命名。

渲染管线说明（与选型对应）：服务端 `mammoth` 出 HTML → `turndown` 转 Markdown → `sanitize-html` 消毒后落库；
前端展示用 `markdown-it` 渲染 + `highlight.js` 做代码高亮 + `DOMPurify` 消毒。
不再使用 react-markdown / remark-rehype 链路，也不再引入 CodeMirror（编辑器为 textarea + 自研工具栏）。

---

## 3. 系统分层架构

```
浏览器 (React SPA, 单页, 本地字体/CSS 变量主题)
   |  HTTP/HTTPS  :8080  (唯一端口)
   v
[Express 4.21.2 接入层]  middleware: helmet / cors(同源) / rate-limit / cookie / json / compression
   |-- /api/v1/*  ──────────────────────────────┐
   |-- /uploads/* 附件（鉴权后流式返回）
   |-- /*        SPA fallback + 前端构建产物静态托管
                                                v
                                 [routes]  参数校验(zod) -> 调 service -> 统一响应封装
                                    v
                                 [services] 业务规则：权限解析、版本、导入、通知、搜索编排
                                    v
                                 [repositories] 只写 SQL，返回行对象，不做业务判断
                                    v
                        [SQLite 3.49.2]  WAL 模式
                        ├─ 业务表（users/groups/spaces/documents/...）
                        ├─ doc_search (FTS5 虚表)
                        └─ doc_acl_flat (权限物化表)
                                    ^
                        [integrations] ldap / oidc / notifiers(wecom|feishu|smtp) / importers
```

依赖方向单向向下：`routes -> services -> repositories -> db`。
禁止 repository 反向调用 service，禁止在 route 里直接写 SQL。

### 3.1 目录结构

```
server/src/
  app.ts server.ts                入口，只做装配
  config/                         env 解析与校验（zod）
  db/                             connection.ts / migrate.ts / migrations/NNN_*.sql
  repositories/                   按资源分包：user.repo.ts / document.repo.ts ...
  services/                       auth / permission / document / version / search / import / notify / audit
  routes/v1/                      auth.routes.ts / document.routes.ts ...
  middleware/                     authn.ts authz.ts error.ts rateLimit.ts audit.ts
  integrations/                   ldap/ oidc/ notifiers/ importers/
  search/                         segment.ts indexer.ts query.ts
  shared/                         errors.ts types.ts logger.ts http.ts
client/src/
  main.tsx App.tsx                入口，只做装配
  pages/ features/ components/    页面 / 业务域 / 通用无业务组件
  styles/tokens.css               唯一颜色定义处
  i18n/ lib/ types/
deploy/                           Dockerfile docker-compose.yml start.sh start.bat
docs/                             ARCHITECTURE.md decisions/ api-spec/openapi.yaml
```

代码组织硬规则：单文件 ≤ 300 行；单一职责；入口文件只装配不做业务；按资源分包而非按技术分层堆文件。

---

## 4. 数据库表清单

统一约定：主键 `id TEXT`（UUID v4，nanoid 生成）；时间字段 `*_at TEXT`（ISO-8601 UTC 字符串）；
软删除用 `deleted_at TEXT NULL`；所有外键显式声明；迁移脚本位于 `server/src/db/migrations/`。
应用启动执行 `PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;`

| 表 | 核心字段（类型） | 索引 / 外键 |
|---|---|---|
| `users` | id, username(TEXT UNIQUE), display_name, email, auth_source(local/ldap/oidc), external_id, password_hash(NULL 允许), status(active/disabled), is_super_admin(INT), locale, **theme(graphite/inkgreen/slate)**, **mode(light/dark/auto)**, last_login_at, created_at, updated_at, deleted_at | UNIQUE(username), UNIQUE(source,external_id), idx(email) |
| `groups` | id, name, source(local/ldap/oidc), external_dn, description, parent_id(NULL), created_at, updated_at | UNIQUE(source,external_dn), idx(parent_id) → groups.id |
| `group_members` | group_id, user_id, created_at | PK(group_id,user_id)；FK → groups.id / users.id；idx(user_id) |
| `spaces` | id, key(UNIQUE), name, description, icon, visibility(public/space/private), owner_id, default_permission(INT), sort_order, created_at, updated_at, deleted_at | UNIQUE(key), idx(owner_id) → users.id |
| `documents` | id, space_id, parent_id(NULL), slug, title, content_md(TEXT), content_html(TEXT 渲染缓存), content_text(TEXT 去标记纯文本), status(draft/published/archived), visibility(inherit/public/space/private), owner_id, current_version_id, sort_order, path(TEXT 物化路径 "/1/12/34/"), created_at, updated_at, deleted_at | UNIQUE(space_id,parent_id,slug), idx(space_id,parent_id,sort_order), idx(path), idx(updated_at)；FK → spaces.id / documents.id |
| `document_versions` | id, document_id, version_no(INT), title, content_md, author_id, change_note, created_at | UNIQUE(document_id,version_no), idx(document_id,created_at)；FK → documents.id / users.id |
| `attachments` | id, document_id(NULL), uploader_id, filename, storage_key(UNIQUE), mime, size_bytes(INT), checksum, kind(image/file/drawing/import), created_at, deleted_at | UNIQUE(storage_key), idx(document_id), idx(uploader_id) |
| `drawings` | id, document_id, name, payload_json(TEXT), app_state_json, preview_attachment_id(NULL), created_by, created_at, updated_at, deleted_at | idx(document_id)；FK → documents.id / attachments.id |
| `data_tables` | id, document_id, name, schema_json(TEXT 列定义：类型/选项/公式), created_by, created_at, updated_at | idx(document_id) |
| `data_table_rows` | id, table_id, data_json(TEXT), sort_order(INT), created_at, updated_at | idx(table_id,sort_order)；FK → data_tables.id ON DELETE CASCADE |
| `acl_entries` | id, object_type(space/document), object_id, subject_type(user/group/everyone), subject_id(NULL for everyone), permission(1读/2写/3管理), inherit(INT), created_by, created_at | UNIQUE(object_type,object_id,subject_type,subject_id), idx(object_type,object_id), idx(subject_type,subject_id) |
| `doc_acl_flat` | doc_id, user_id, permission(INT), source(direct/group/space/public) | PK(doc_id,user_id), idx(user_id,permission)；由 §5 物化任务维护 |
| `doc_search` | FTS5 虚表：`CREATE VIRTUAL TABLE doc_search USING fts5(title, body, code, doc_id UNINDEXED, tokenize='unicode61')` | 内容为 bigram 预分词文本；rowid 与写入顺序绑定，通过 doc_id 回查 |
| `refresh_tokens` | id, user_id, token_hash, expires_at, revoked_at(NULL), ip, user_agent, created_at | idx(user_id), idx(token_hash) |
| `notification_channels` | id, name, type(wecom/feishu/smtp), config_json(TEXT 加密存储 webhook/secret/smtp), enabled(INT), created_at, updated_at | idx(type,enabled) |
| `notification_subscriptions` | id, user_id, target_type(space/document), target_id, event_type, channel_type(inbox/email/wecom/feishu), created_at | idx(target_type,target_id,event_type), idx(user_id) |
| `notification_logs` | id, channel_id(NULL), event_type, payload_json, status(pending/sent/failed), error, retries(INT), created_at, sent_at | idx(status,created_at), idx(event_type) |
| `audit_logs` | id, actor_id(NULL 系统), action, object_type, object_id, detail_json, ip, user_agent, created_at | idx(actor_id,created_at), idx(object_type,object_id) |
| `site_settings` | key(PK), value_json(TEXT), updated_by, updated_at | 敏感键（ldap.bindPassword/oidc.clientSecret/smtp.pass/channels secret）以 AES-256-GCM 加密后存储 |
| `import_jobs` | id, type(docx/xlsx), source_filename, target_space_id, created_by, status(pending/running/done/failed), result_json, created_at, finished_at | idx(created_by,created_at) |
| `schema_migrations` | version(INT PK), name, applied_at | 迁移幂等依据 |

---

## 5. 权限模型

### 5.1 概念

- 主体（subject）：`user:{id}`、`group:{id}`、`everyone`（所有已登录用户）。
- 客体（object）：`space` 与 `document`。
- 权限等级：`1=read`、`2=write`、`3=manage`，高等级隐含低等级。
- `documents.visibility`：`inherit`（继承父文档/空间）、`public`、`space`、`private`。
- `acl_entries.inherit=1` 表示该条目沿文档树向下继承给所有子孙文档。

### 5.2 解析顺序（取最高权限，短路）

1. 文档私有条目（`object_type='document' AND object_id=当前文档`）
2. 祖先文档链上 `inherit=1` 的条目（按 `documents.path` 前缀匹配，从近到远）
3. 所属空间的条目（`object_type='space'`）
4. `documents.visibility` 为 `public` → 任何登录用户 read；`space` → 空间成员 read；`private` → 仅显式授权
5. 超级管理员（`users.is_super_admin=1`）恒等于 manage

### 5.3 高效过滤策略（关键）

不在搜索/列表查询里做递归权限计算。写入侧维护物化表 `doc_acl_flat(doc_id, user_id, permission)`：
当任一 `acl_entries`、`group_members`、`documents.parent_id`、`documents.visibility` 变更时，
发布一个 `acl:dirty` 事件，由后台任务（同一进程内、事务外、串行）重算受影响子树的扁平权限。

读取侧统一走一次索引连接：

```sql
SELECT d.id, d.title, d.space_id, d.updated_at, bm25(doc_search, 10.0, 4.0, 1.0) AS score
FROM doc_search
JOIN doc_acl_flat a ON a.doc_id = doc_search.doc_id AND a.user_id = @uid AND a.permission >= 1
JOIN documents d ON d.id = doc_search.doc_id AND d.deleted_at IS NULL
WHERE doc_search MATCH @fts_query
ORDER BY score
LIMIT @limit OFFSET @offset;
```

`doc_acl_flat` 主键 `(doc_id,user_id)` 覆盖索引，权限过滤退化为一次索引探测，
避免 `EXISTS` 子查询 + 递归树遍历导致搜索在万级文档下退化。

---

## 6. 搜索方案（已实测）

### 6.1 实测结论

| 验证项 | 结果 |
|---|---|
| better-sqlite3 11.10.0 内置 SQLite 版本 | **3.49.2**（≥3.34，trigram 可用但未采用） |
| `FTS5` 可用性 | OK |
| `tokenize='trigram'` 可用性 | OK，但查询「大运」→ **0 命中**，「索引」→ **0 命中**，「撞大运」→ 1 命中 |
| bigram 预分词 + `unicode61` | 「原理」「数据」「索引」「数据库」「IndexOptimization」「indexoptimization」**全部命中** |
| `MATCH` 传入裸 `"` | 抛 `unterminated string`，**必须转义** |
| FTS5 `snippet()` | 返回内容含分词插入的空格（"容器 器编 编排"），**不能用于展示** |

### 6.2 最终方案

- 分词器：`tokenize='unicode61'`（默认），不接受 trigram。
- 索引侧：写入前经 `search/segment.ts` 处理。规则：连续 CJK 段切为重叠 bigram（`数据库原理` → `数据 据库 库原 原理`）；
  单字 CJK 原样保留；ASCII 词与数字整词保留并转小写；代码块内容单独进 `code` 列（按整词 + 标识符切分）。
- 查询侧：用**同一个** `segment.ts` 处理用户输入，保证写入与查询分词一致（硬约束：两端不允许出现第二份分词实现）。
- 查询串构造：先按 AND 拼接全部 token；若结果数为 0，自动降级为 OR 拼接重试（兼顾精确率与召回率）。
  所有 token 用双引号包裹并对内部 `"` 做转义，杜绝 FTS5 语法注入。
- 长度 < 2 字符（如单字、单字母）→ 不走 FTS，改走 `documents.title LIKE '%q%' OR content_text LIKE '%q%'`，并强制 `LIMIT 50`。
- 摘要：不使用 FTS5 的 `snippet()`，由应用层在原始 `content_text` 上定位关键词位置并截取上下文生成高亮摘要。
- 排序：`bm25(doc_search, 10.0, 4.0, 1.0)`（title 权重 10、body 4、code 1），叠加文档更新时间的轻微时间衰减。
- 重建索引：`POST /api/v1/search/reindex` 全量重建；文档保存/删除时增量 upsert/delete。

---

## 7. API 端点清单（`/api/v1` 前缀）

统一响应：`{ "code": 0, "data": <T>, "message": "" }`；分页：`{ items, total, page, limit, hasMore }`。
认证列：`P`=需登录，`A`=需管理员/空间管理权限。

**机器可读契约以 `docs/api-spec/openapi.yaml`（OpenAPI 3.0）为准**：共 14 个模块、66 个路径、93 个操作、54 个 schema，
已通过引用完整性校验（无断链 $ref）。前端据此生成 TS 类型与 Mock，后端据此实现；本节的文字清单与之冲突时以 YAML 为准。

### auth
| Method | Path | 功能 | 认证 | 请求体 → 响应体 |
|---|---|---|---|---|
| POST | /auth/login | 本地/LDAP 账号登录 | - | `{username,password}` → `{accessToken,refreshToken,user}` |
| POST | /auth/refresh | 刷新令牌 | - | `{refreshToken}` → `{accessToken,refreshToken}` |
| POST | /auth/logout | 注销并撤销 refresh | P | `{}` → `{ok:true}` |
| GET | /auth/me | 当前用户与权限摘要 | P | - → `{user,permissions,settings}` |
| POST | /auth/password | 修改本地密码 | P | `{oldPassword,newPassword}` → `{ok:true}` |
| GET | /auth/providers | 已启用的登录方式 | - | - → `{local,ldap,oidc:[{name,authorizeUrl}]}` |
| GET | /auth/oidc/authorize | 发起 OIDC 授权跳转 | - | - → 302 |
| GET | /auth/oidc/callback | OIDC 回调（含 state/nonce 校验） | - | - → 302 前端并种 cookie |
| GET | /auth/ldap/health | 测试 LDAP 连通性 | A | - → `{ok,latencyMs,error}` |

### users
`GET /users`（P，分页+q）、`GET /users/:id`（P）、`POST /users`（A）、`PATCH /users/:id`（A）、
`DELETE /users/:id`（A，软删除）、`POST /users/:id/reset-password`（A）、`GET /users/:id/groups`（P）。
用户 DTO：`{id,username,displayName,email,authSource,status,isSuperAdmin,locale,theme,lastLoginAt,createdAt}`。

### groups
`GET /groups`（P，树形）、`GET /groups/:id`（P）、`POST /groups`（A）、`PATCH /groups/:id`（A）、
`DELETE /groups/:id`（A）、`GET /groups/:id/members`（P，分页）、
`POST /groups/:id/members`（A，`{userIds:string[]}`）、`DELETE /groups/:id/members/:userId`（A）、
`POST /groups/sync`（A，触发 AD 组同步，见 §8）。

### spaces
`GET /spaces`（P，按可见性过滤）、`POST /spaces`（A）、`GET /spaces/:id`（P）、`PATCH /spaces/:id`（A）、
`DELETE /spaces/:id`（A，软删除并级联）、`GET /spaces/:id/tree`（P，返回文档树）。
空间 DTO：`{id,key,name,description,icon,visibility,ownerId,defaultPermission,docCount,createdAt}`。

### documents
`GET /documents`（P，`?spaceId=&parentId=&status=&page=&limit=`）、`POST /documents`（P）、
`GET /documents/:id`（P，含 ACL 校验）、`PATCH /documents/:id`（P，写权限）、`DELETE /documents/:id`（P，管理权限，软删除）、
`POST /documents/:id/move`（P，`{parentId,sortOrder}`）、`POST /documents/:id/publish`（P）、
`GET /documents/:id/breadcrumb`（P）、`GET /documents/:id/render`（P，返回服务端渲染 + 消毒后的 HTML）。
创建/更新入参：`{spaceId,parentId,title,contentMd,visibility,changeNote}`；保存即写 `document_versions` 并增量更新 FTS。

### versions
`GET /documents/:id/versions`（P，分页）、`GET /versions/:id`（P）、
`POST /versions/:id/restore`（P，写权限，恢复即生成新版本）、`GET /versions/:id/diff?against=:n`（P，返回行级 diff）。

### attachments
`POST /attachments`（P，multipart，`{file,documentId?}`，白名单见 §9）、
`GET /attachments/:id`（P，元数据）、`GET /attachments/:id/content`（P，**带权限校验的流式下载**）、
`DELETE /attachments/:id`（P，上传者或管理权限）、`GET /documents/:id/attachments`（P）。

### search
`GET /search`（P，`?q=&spaceId=&type=&page=&limit=` → `{items:[{documentId,title,excerpt,highlights,spaceId,score,updatedAt}],total,page,limit,hasMore}`）、
`POST /search/reindex`（A，`{full?:boolean}` → `{indexed,elapsedMs}`）、`GET /search/suggest`（P，`?q=` 标题前缀补全）。

### permissions
`GET /documents/:id/permissions`（P，管理权限）、`PUT /documents/:id/permissions`（P，管理权限，整体替换 `{entries:[{subjectType,subjectId,permission,inherit}]}`）、
`GET /spaces/:id/permissions`（A）、`PUT /spaces/:id/permissions`（A）、
`GET /permissions/effective?documentId=&userId=`（A，调试用，返回解析链路）。

### drawings / data_tables（编辑器扩展块）
`POST /documents/:id/drawings`、`GET|PATCH|DELETE /drawings/:id`；
`POST /documents/:id/data-tables`、`GET|PATCH|DELETE /data-tables/:id`、
`POST /data-tables/:id/rows`（批量）、`PATCH /data-tables/:id/rows/:rowId`、`DELETE /data-tables/:id/rows/:rowId`。

### import
`POST /import/docx`（P，multipart `{file,targetSpaceId,parentId?}` → `{jobId,documentIds[]}`）、
`POST /import/xlsx`（P，同上，每工作表转一篇或一张多维表格）、`GET /import/jobs`（P）、
`GET /import/jobs/:id`（P，含 `result_json` 与失败原因）。

### notifications
`GET /notifications/channels`（A）、`POST /notifications/channels`（A）、`PATCH|DELETE /notifications/channels/:id`（A）、
`POST /notifications/channels/:id/test`（A，`{recipient}` → `{ok,error}`）、
`GET /notifications/subscriptions`（P）、`POST /notifications/subscriptions`（P）、`DELETE /notifications/subscriptions/:id`（P）、
`GET /notifications/logs`（A，分页+状态过滤）、`POST /notifications/dispatch`（A，手动触发一次事件投递）。

### settings
`GET /settings`（A，完整配置，密钥字段脱敏为 `***`）、`PUT /settings`（A，按 key 合并写入）、
`GET /settings/public`（**无需登录**，返回 `{siteName,defaultLocale,availableLocales,themes,loginProviders}`）、
`POST /settings/test-ldap`（A）、`POST /settings/test-smtp`（A）。

### admin
`GET /admin/health`（A，`{status,dbFile,sqliteVersion,uptimeMs,indexedDocs}`）、
`GET /admin/audit-logs`（A，分页+筛选）、`POST /admin/backup`（A，触发 `VACUUM INTO` 生成备份文件）、
`POST /admin/acl/rebuild`（A，强制重算 `doc_acl_flat`）。

---

## 8. LDAP/AD 对接

| 项 | 配置（`site_settings` 键） | 说明 |
|---|---|---|
| URL | `ldap.url` | `ldap://dc.example.com:389` 或 `ldaps://...:636` |
| Bind DN | `ldap.bindDn` | 只读服务账号，如 `CN=wikidoc,OU=Service,DC=example,DC=com` |
| Bind 密码 | `ldap.bindPassword` | AES-256-GCM 加密存储 |
| 用户 Base DN | `ldap.userBaseDn` | `OU=Employees,DC=example,DC=com` |
| 用户过滤 | `ldap.userFilter` | 默认 `(sAMAccountName={{username}})`；支持 `{{username}}` 占位 |
| 组 Base DN | `ldap.groupBaseDn` | `OU=Groups,DC=example,DC=com` |
| 组过滤 | `ldap.groupFilter` | 默认 `(objectClass=group)` |
| 超时 | `ldap.timeoutMs` | 默认 8000，含连接与搜索 |

属性映射（可配置）：`sAMAccountName → users.username`、`displayName → users.display_name`、
`mail → users.email`、`objectGUID → users.external_id`（以 base64 存储，GUID 比 DN 稳定）、
`memberOf → groups.external_dn`。

登录流程：
1. 用服务账号 bind；
2. 按 `userFilter` 搜索用户，取 DN；
3. 用「用户 DN + 用户输入的密码」再 bind 一次（AD 不支持密码哈希比对，必须做二次 bind）；
4. 成功则 upsert 本地 `users`（`auth_source='ldap'`），同步 `display_name/email`；
5. 读取 `memberOf`，upsert `groups` 与 `group_members`；
6. 签发 JWT。**本地不保存域密码**。

组同步策略：登录时增量同步该用户的组；管理员可触发 `POST /groups/sync` 全量同步（分页搜索 + 批量 upsert，1000 条/批）。
同步采用"标记-清理"：先写 `synced_at`，最后删除本轮未被标记且 `source='ldap'` 的成员关系，避免幽灵权限。

连接失败降级：
- LDAP 不可达或超时 → 记录 `audit_logs`，登录接口返回 `503 LDAP_UNAVAILABLE`；
- 若 `site_settings.auth.allowLocalFallback=true`，登录页展示本地账号入口，已存在的本地账号可正常登录；
- 已有 LDAP 用户的 JWT 在有效期内不受影响（JWT 自包含，不依赖 LDAP）；
- 连续失败 3 次后前端隐藏 LDAP 表单并提示联系管理员，避免用户反复等待超时。

---

## 9. 安全性设计

| 面 | 措施 |
|---|---|
| 密码哈希 | `bcryptjs`，cost=12；本地账号强制 ≥10 位且含两类字符；LDAP/OIDC 账号 `password_hash` 为 NULL 且不可用于本地登录 |
| JWT | access token 15 分钟，HS256，载荷仅含 `sub/username/isSuperAdmin/ver`；refresh token 30 天，**仅存 httpOnly + Secure + SameSite=Lax cookie**，服务端只存其 SHA-256，支持按用户全量撤销与轮换 |
| XSS | 服务端落库前用 `sanitize-html@2.13.1` 白名单消毒（禁 `script/iframe/on*` 属性、禁 `javascript:` 与 `data:` 协议）；客户端 `markdown-it` 渲染后同样过 `DOMPurify`；附件下载强制 `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff` |
| 上传白名单 | 扩展名白名单 `png/jpg/jpeg/gif/webp/svg(需消毒)/pdf/docx/xlsx/pptx/zip/txt/md/csv/json`；校验 MIME 与魔数、单文件 ≤50MB、总量按空间配额；**禁止 `.exe/.bat/.js/.html` 等可执行类型** |
| 路径穿越 | 附件落盘名一律为 `storage_key`（nanoid + 无扩展名），元数据只在 DB；读取时只用 `storage_key` 拼接，禁止使用用户提供的文件名；对外接口只暴露 attachment id |
| 速率限制 | 自研内存令牌桶中间件（`middleware/rateLimit.ts`，单实例部署足够）：登录 10 次/15 分钟/IP；写接口 120 次/分钟/用户；搜索 60 次/分钟/用户；导入 5 次/小时/用户。注意单实例假设，多实例需换 Redis 计数 |
| 注入 | 全部 SQL 走 `better-sqlite3` 预编译绑定参数，禁止字符串拼接；FTS5 MATCH 串转义（见 §6） |
| 传输与头 | 建议前置企业反向代理终止 HTTPS；`helmet` 默认头 + 严格 CSP（仅 `self`，禁 `unsafe-inline` 除样式哈希） |
| 审计 | 登录、权限变更、删除、导出、设置变更写入 `audit_logs`，不可通过 API 删除 |
| 密钥 | `site_settings` 中的密钥 AES-256-GCM 加密，密钥由环境变量 `WIKIDOC_MASTER_KEY` 提供，缺失时服务拒绝启动 |

---

## 10. 前端设计系统、主题与国际化

- 设计令牌的**唯一真源是 `client/src/styles/tokens.css`**（由设计侧维护，共 6 套主题 × 约 110 个令牌）。
  组件只允许引用变量，**禁止出现任何颜色字面量**（`#fff`/`#000` 除外）。本文档不重复罗列令牌名，避免两处漂移。
- 关键语义别名（写代码时按下表取用，实际定义在 tokens.css）：
  | 本文口径 | tokens.css 实际令牌 |
  |---|---|
  | 主文本 | `--color-text-primary` |
  | 次要/弱化文本（原口径 `--color-muted`） | `--color-text-secondary`（**不是 tertiary**，tertiary 是时间戳/行号类元信息，对比度仅 4.6:1，不可当正文弱化色） |
  | 禁用态文本 | `--color-text-disabled`（唯一允许低于 4.5:1 的文本令牌） |
  | 正文链接 | `--color-text-link` / `-link-hover` / `-link-visited`（不要用 brand 直出） |
  | 深色底反色文字 | `--color-text-inverse` |
  | 品牌/强调色（原口径 `--color-accent`） | `--color-brand` 及 `--color-brand-50..900` |
  | 页面底 | `--color-bg-base` / `--color-bg-subtle` / `--color-bg-sunken` |
  | 表面层级（页面/卡片/浮层/下拉四层） | `--color-surface` / `--color-surface-raised` / `--color-surface-overlay` / `--color-surface-hover\|active` |
  | 画板画布 | `--color-canvas-bg` / `-grid` / `-stroke` / `-stroke-selected` / `-fill-default` / `-fill-1..6` / `-arrow-fill` / `-text` / `-selection` / `-guide` / `-handle` |
- 主题与明暗**拆成两个字段存储**（采纳设计侧意见，见 `ADR-008`）：
  - `users.theme`：`graphite` / `inkgreen` / `slate`（配色）
  - `users.mode`：`light` / `dark` / `auto`（明暗，`auto` 跟随系统 `prefers-color-scheme`）
  - 运行时由前端拼成 `data-theme="<theme>-<mode>"`，`auto` 先解析为 `light` 或 `dark` 再拼接。
  - **硬约束**：`auto` 必须原样持久化，禁止存解析后的值，否则用户更换系统主题后不会跟随变化。
  - 未登录用户存 `localStorage` 的 `wikidoc.theme` 与 `wikidoc.mode` 两个 key。
  - 首帧前由 `index.html` 内联脚本写入 `data-theme`，避免白闪。
  - 采用拆分而非复合枚举的原因：复合枚举表达不了"跟随系统"；且新增主题只需扩展 `theme` 枚举，不触碰 `mode`。
- 语言：自研轻量 i18n（`client/src/i18n`，词条 JSON + Context + `localStorage`），内置 `zh-CN` / `en-US`，
  词条随构建产物打包；选择存 `users.locale`，优先级 用户设置 > 浏览器 > 默认 `zh-CN`。
- 字体：使用系统字体栈（`system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif` 等），
  **不引入任何网络字体**；代码区用系统等宽字体栈。
- 图标：仅 `lucide-react@0.469.0`，通过具名导入。
- 画板：自研 SVG 画板（`client/src/features/editor/board`），支持矩形、椭圆、线段、箭头、文本、自由笔迹六种图元，
  数据结构为纯 JSON（`drawings.payload_json`），导出为内联 `<svg>` 嵌入文档。**无字体、无 CDN、无第三方画布库**。

---

## 11. 部署

- 单端口 `8080`：Express 同时托管 `/api/v1` 与 `client/dist` 静态产物（SPA fallback 到 `index.html`）。
- 多阶段 Dockerfile：`node:22-bookworm-slim` 构建前端与编译 TS → 运行阶段仅含 `node:22-bookworm-slim` +
  `dist` 产物 + `node_modules --omit=dev`（`better-sqlite3` 需在运行阶段保留预编译二进制，故使用同基线镜像）。
- `docker-compose.yml`：`wikidoc` 服务 + 两个命名卷（`wikidoc-data:/app/data`、`wikidoc-uploads:/app/data/uploads`）。
- 一键脚本：`deploy/start.sh`（Linux）与 `deploy/start.bat`（Windows），逻辑：检查 Docker →
  `docker compose up -d --build` → 轮询 `/api/v1/admin/health` → 打印访问地址与初始管理员账号。
- 备份：`POST /admin/backup` 使用 `VACUUM INTO '<timestamp>.db'`（在线热备，一致性由 SQLite 保证）。

---

## 12. ADR（MADR 格式，完整版见 `docs/decisions/`）

全部为 Accepted（2026-09-28）。完整 MADR 正文见 `docs/decisions/`，此处为索引。

| ADR | 决策 | 关键理由 | 主要代价 |
|---|---|---|---|
| ADR-001 | SQLite（better-sqlite3 11.10.0 / 内置 3.49.2）+ 手写 SQL 迁移，不用 ORM | 零外部服务、单文件备份、FTS5 同库；Prisma 引擎需联网下载，离线不可行 | 单写者模型；不支持水平扩展，扩展需迁 PostgreSQL |
| ADR-002 | FTS5 + 应用层 bigram 预分词（`unicode61`），不用 trigram | trigram 对 2 字中文词命中 0（实测），bigram 全命中 | 索引体积 2 至 3 倍；写端查询端分词必须同一实现 |
| ADR-003 | 图标库锁定 lucide-react 0.469.0 | 纯 SVG 零网络请求、tree-shaking 友好、满足 P0 锁定要求 | 领域图标需自绘，统一放 `components/icons/` |
| ADR-004 | 原生 CSS 变量设计系统，不引入 Tailwind | 主题切换即变量替换，无需构建插件，天然满足禁硬编码颜色 | 失去 utility 速度红利，需自建 `components/ui/` |
| ADR-005 | 服务端保持 CommonJS，openid-client 锁 5.7.1（总监裁决） | SSO 是可选功能，不值得让整个服务承担 ESM 改造风险 | 停留在 openid-client 5.x，未来若要 6.x 需整体转 ESM |
| ADR-006 | 画板自研 SVG 实现，不用 Excalidraw（总监裁决） | 零字体依赖、无 CDN、体积数十 KB、不反向约束 React 版本 | 需自实现图元交互与撤销栈；功能深度不及成熟库 |
| ADR-007 | Excel 导入用 exceljs 4.4.0，不用 SheetJS（总监裁决） | npm 可达、维护中、无 CVE；内网构建机很可能访问不到 cdn.sheetjs.com | 读取性能略低于 SheetJS；部分边缘格式兼容需自测 |
| ADR-008 | 主题与明暗拆成 `theme` + `mode` 两字段，不用 6 值复合枚举 | 复合枚举表达不了"跟随系统"；加主题要动枚举且易触发迁移 | 两字段组合有效性需运行时兜底回退；多一个 matchMedia 监听器 |

---

## 13. 已知技术风险与缓解

| 风险 | 等级 | 缓解措施 |
|---|---|---|
| 中文分词写端与查询端不一致导致静默搜不到 | 高 | 只允许存在 `search/segment.ts` 一份实现；为其编写参数化单元测试（含 1/2/3/多字、中英混排、代码块），纳入 CI |
| 自研画板的 SVG 成为 XSS 载体 | 高 | 画板 payload 落库前剔除 `on*` 事件属性与 `script`/`foreignObject` 节点；渲染时走 `sanitize-html` SVG 配置；禁止在画板文本里渲染 HTML |
| FTS5 MATCH 特殊字符导致运行时异常 | 中 | 统一 `escapeFtsToken()`：双引号包裹 + 内部 `"` 转义；对 `* - + ( ) : ^` 等做符号剥离；单测覆盖 |
| SQLite 单写者在批量导入时锁争用 | 中 | WAL + `busy_timeout=5000`；长事务拆批；导入任务串行化并限流 5 次/小时 |
| LDAP 服务不可达导致全员无法登录 | 中 | 本地账号兜底开关 `auth.allowLocalFallback`；8 秒超时；失败降级提示；保留至少 1 个本地超级管理员 |
| 权限物化表 `doc_acl_flat` 与源数据不一致 | 中 | 权限变更走事务 + `acl:dirty` 事件；提供 `POST /admin/acl/rebuild`；`GET /permissions/effective` 用于比对 |
| 压缩包/超大附件造成磁盘或内存耗尽 | 中 | 单文件 50MB、单空间配额、`zip` 解压需校验条目数与解压后总大小（防 zip bomb） |
| 前端产物体积（highlight.js 全语言） | 低 | highlight.js 只注册 30 种常用语言；画板与编辑器做路由级动态 `import()` |
| 未来需要水平扩展 | 低 | 明确声明 MVP 单实例；扩展时迁移到 PostgreSQL（表结构与 SQL 需重写），记录在 ADR-001 |

---

## 14. 端到端验证（交付验收步骤）

1. `docker compose up -d --build` 后容器内 `curl http://localhost:8080/api/v1/admin/health` 返回 `sqliteVersion=3.49.2`。
2. 断网（拔网线或阻断所有外网 IP）后刷新页面：主题切换、中英切换、代码高亮、画板绘制与导出均正常——证明零外网依赖。
3. 创建空间 → 建文档 → 输入含「数据库索引优化」与一段 Python 代码块的内容 → 保存。
4. 搜索「索引」命中该文档；搜索「大运」（库中存在）命中；搜索单字「库」走 LIKE 兜底仍返回结果；搜索 `"` 不报 500。
5. 把文档设为对某 AD 组只读 → 用非该组成员账号搜索与直连文档 URL，均不可见（权限过滤生效）。
6. 上传 `.docx` 与 `.xlsx`，导入后正文、表格、图片均正确落库并出现在搜索结果中。
7. 配置企业微信机器人 → 发布文档 → 群内收到通知；`notification_logs` 中 `status=sent`。
8. LDAP 服务停掉后，本地超级管理员仍可登录，登录页给出降级提示。
9. 全仓库检索：无 emoji 字符、无紫粉渐变、CSS 中除 `#fff`/`#000` 外无颜色字面量、图标 import 全部来自 `lucide-react`。

---

## 15. 明确不做（Out of Scope）

实时协同编辑（OT/CRDT）；文档评论与@提醒；移动端原生应用；向量检索与 AI 问答；
多实例集群与读写分离；文档 PDF 导出；版本分支与合并；细到字段级的权限。
