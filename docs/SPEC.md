# Spec - WikiDoc 企业知识库 v1.0.0

> 生成日期：2026-09-29
> 基于：PRD v1.0 + ARCHITECTURE v1.0 + UIUX v1.0（三文档已确认）
> 状态：已锁定。开发期任何超出本 Spec 的需求，走变更流程，不得直接实现。

---

## 1. 产品定义

- **一句话描述**：面向企业内部、可内网私有化部署的文档 Wiki 知识库，用 AD 域组做权限、用中文分词做检索。
- **目标用户**：企业内部全体员工的文档阅读与协作；部门知识负责人维护内容；IT 管理员负责部署、AD 对接与权限治理。
- **核心问题**：现有开源 wiki 要么中文搜不准（Outline 默认英文分词器），要么 AD 组权限要手工映射（Confluence），要么国内 IM 通知是二等公民。

## 2. MVP 范围（锁定）

| 优先级 | 功能 | 验收标准摘要 |
|--------|------|-------------|
| P0 | LDAP/AD 域账号登录 + 组同步 | 服务账号 bind → 搜 DN → 用户 DN 二次 bind 成功即登录；memberOf 同步为内部组 |
| P0 | 本地账号登录 + JWT 刷新 | bcrypt 校验；access 15min / refresh 30 天 httpOnly cookie；刷新可轮换 |
| P0 | SSO 单点登录（OIDC，可开关） | 配置 Issuer/ClientID/Secret 后登录页出现 SSO 入口，回调换 token 并本地建档 |
| P0 | 空间 + 文档树 CRUD | 层级树、slug 唯一、排序、软删除到回收站、面包屑 |
| P0 | Markdown 编辑器 | 源码模式编辑；工具栏；分屏预览；自动保存；斜杠菜单插入区块 |
| P0 | 代码高亮 + 自动目录 | 围栏代码块按语言高亮；正文 h1-h3 自动生成右侧大纲并跟随滚动 |
| P0 | 图片与附件 | 上传/插入/下载/删除；下载走权限校验流式返回 |
| P0 | 内容分栏区块 | `:::columns` 容器，支持 2/3 栏与比例 |
| P0 | 多维表格区块 | 字段类型 8 种；行增删改；排序；筛选；冻结首列 |
| P0 | 在线画板区块 | 矩形/椭圆/线段/箭头/文本/自由笔迹；导出 SVG 存入文档 |
| P0 | 全站检索 | 覆盖标题/正文/代码块；中文 bigram 分词；bm25 排序；权限过滤；结果高亮 |
| P0 | 精细化权限 | 文档级 ACL；主体为用户/组/所有人；权限 1读 2写 3管理；继承开关 |
| P0 | Word 导入 | .docx → Markdown，保留标题/列表/表格/图片/基本样式 |
| P0 | Excel 导入 | .xlsx → 多维表格或 Markdown 表格 |
| P0 | 通知 | 企业微信 / 飞书 / 邮件 SMTP 三通道；渠道可配置可测试；文档变更触发 |
| P0 | 多主题 + 明暗切换 | 3 套主题 × 明暗 = 6 组；切换即时生效并持久化 |
| P0 | 中英双语 | 全界面词条双语；切换即时生效并持久化 |
| P0 | 版本历史 | 每次保存产生版本；可查看差异；可回滚 |
| P0 | 容器化部署 | Dockerfile 多阶段 + docker-compose + 一键脚本；单端口对外 |
| P0 | README | 项目介绍/场景/技术栈/功能清单/部署步骤/FAQ |

## 3. 明确不做（Out-of-Scope）

| 不做的功能 | 原因 | 何时考虑 |
|------------|------|----------|
| 实时协同编辑（OT/CRDT） | 需独立后端服务与冲突合并，MVP ROI 极低 | 有明确多人同时编辑诉求时 |
| 评论与 @ 提醒 | 依赖实时通道，通知系统成熟后再接 | v1.1 |
| 向量检索 / AI 问答 | 需模型推理，违背内网离线前提 | 有本地模型部署条件时 |
| 多视图（看板/画廊/日历） | 多维表格的完整形态，属独立产品范畴 | v2.0 |
| 关联字段 / Rollup / 公式字段 | 同上 | v2.0 |
| 多实例集群 | SQLite 单写者模型，非目标规模 | 用户量过万时 |
| PDF 导出 | 需无头浏览器，体积与复杂度不匹配 MVP | v1.2 |
| 字段级权限 | 粒度超出企业 wiki 实际需求 | 有合规审计需求时 |
| SAML 2.0 | OIDC 已覆盖主流 IdP，SAML 复杂度高 | 客户明确要求时 |

## 4. 技术架构（锁定 — 已实测版本）

| 层 | 技术 | 版本 | 锁定原因 |
|----|------|------|----------|
| 运行时 | Node.js | 22.22.2 | 本机与容器基线 |
| 后端 | Express（**必须 4.x**） | 4.21.2 | 降回 4.x，避开 Express 5 的 path-to-regexp v8 通配符语法变化 |
| 模块格式 | CommonJS | - | 否决 ESM 改造；openid-client 锁 5.7.1（CJS 兼容） |
| 数据库 | SQLite（better-sqlite3） | 11.10.0 | 实测预编译二进制安装成功，内置 SQLite 3.49.2 + FTS5 |
| 全文检索 | FTS5 + 应用层 bigram | - | 见 §11 已知坑 |
| ORM | 无，手写 SQL + 迁移脚本 | - | 避免 ORM 引擎二进制下载，保证内网离线可跑 |
| 校验 | zod | 3.25.76 | 请求体校验 |
| 认证 | jsonwebtoken + bcryptjs | 9.0.3 / 2.4.3 | JWT cost=12 |
| LDAP | ldapts | 7.4.0 | AD 二次 bind 必需 |
| SSO | openid-client | 5.7.1 | CJS 兼容版本 |
| 导入 | mammoth + turndown + exceljs | 1.13.0 / 7.2.4 / 4.4.0 | exceljs 替代 xlsx@0.18.5（含 CVE），纯 npm 源可离线装 |
| 清洗 | sanitize-html | 2.17.7 | 导入内容与渲染链路白名单 |
| 上传 | multer | 2.4.0 | 附件与导入文件 |
| 邮件 | nodemailer | 7.0.13 | SMTP |
| 前端 | React + TypeScript + Vite | 18.3.1 / 5.9.3 / 7.3.6 | React 18 稳定，Vite 7 需 Node 20.19+（已满足） |
| 编辑器 | CodeMirror 6 | 6.x | Markdown 源码为唯一真源，可搜索/可 diff/可对齐导入 |
| 渲染 | markdown-it + highlight.js + dompurify | 14.3.2 / 11.12.0 / 3.4.16 | 前端渲染管线 |
| 图标 | **lucide-react（唯一一套）** | 0.469.0 | 统一 stroke 2，尺寸 16/20/24 |
| 样式 | 原生 CSS 变量 + `data-theme` | - | 无 Tailwind；主题切换退化为变量替换 |
| 状态/路由 | React Context + react-router-dom | 6.30.6 | 不引入重型状态库 |

**运行时零外网硬约束**：禁止 Google Fonts、CDN、外部 SaaS。字体走系统字体栈，图标随产物打包，i18n 词条随产物打包。

## 5. API 端点清单（锁定）

统一前缀 `/api`。统一响应 `{ code, data, message }`，`code=0` 为成功。分页 `{ items, total, page, limit, hasMore }`。
认证标记：`P` = 需登录，`A` = 需管理员。

**auth**：`POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me`(P) · `POST /auth/password`(P) · `GET /auth/providers` · `GET /auth/oidc/authorize` · `GET /auth/oidc/callback` · `GET /auth/ldap/health`(A)

**users**(A)：`GET /users` · `POST /users` · `GET /users/:id` · `PATCH /users/:id` · `DELETE /users/:id` · `PATCH /users/:id/status`

**groups**(A)：`GET /groups` · `POST /groups` · `GET /groups/:id` · `PATCH /groups/:id` · `DELETE /groups/:id` · `GET /groups/:id/members` · `POST /groups/:id/members` · `DELETE /groups/:id/members/:userId` · `POST /groups/sync`(AD 全量同步)

**spaces**：`GET /spaces`(P) · `POST /spaces`(P) · `GET /spaces/:id`(P) · `PATCH /spaces/:id`(P) · `DELETE /spaces/:id`(P) · `GET /spaces/:id/tree`(P)

**documents**：`GET /documents`(P) · `POST /documents`(P) · `GET /documents/:id`(P) · `PATCH /documents/:id`(P) · `DELETE /documents/:id`(P) · `POST /documents/:id/move`(P) · `POST /documents/:id/publish`(P) · `GET /documents/:id/breadcrumb`(P) · `GET /documents/:id/children`(P)

**versions**：`GET /documents/:id/versions`(P) · `GET /documents/:id/versions/:vid`(P) · `POST /documents/:id/versions/:vid/restore`(P)

**attachments**：`POST /attachments`(P) · `GET /attachments/:id`(P，权限校验后流式) · `DELETE /attachments/:id`(P) · `GET /documents/:id/attachments`(P)

**search**：`GET /search`(P，`q`/`spaceId`/`type`/`page`/`limit`) · `GET /search/suggest`(P) · `POST /search/reindex`(A)

**permissions**：`GET /permissions?object_type=&object_id=`(P) · `PUT /permissions`(P，整体替换) · `POST /permissions/check`(P) · `GET /permissions/effective`(P)

**drawings**：`POST /drawings`(P) · `GET /drawings/:id`(P) · `PATCH /drawings/:id`(P)

**data-tables**：`POST /data-tables`(P) · `GET /data-tables/:id`(P) · `PATCH /data-tables/:id`(P) · `POST /data-tables/:id/rows`(P) · `PATCH /data-tables/:id/rows/:rid`(P) · `DELETE /data-tables/:id/rows/:rid`(P)

**import**：`POST /import/docx`(P) · `POST /import/xlsx`(P) · `GET /import/jobs`(P) · `GET /import/jobs/:id`(P)

**notifications**：`GET /notifications/channels`(A) · `POST /notifications/channels`(A) · `PATCH /notifications/channels/:id`(A) · `DELETE /notifications/channels/:id`(A) · `POST /notifications/channels/:id/test`(A) · `GET /notifications/subscriptions`(P) · `PUT /notifications/subscriptions`(P) · `GET /notifications/logs`(A) · `POST /notifications/dispatch`(P)

**settings**：`GET /settings`(A) · `PUT /settings`(A) · `GET /settings/public` · `POST /settings/test-ldap`(A) · `POST /settings/test-smtp`(A) · `POST /settings/test-webhook`(A)

**admin**：`GET /admin/health` · `GET /admin/stats`(A) · `GET /admin/audit-logs`(A) · `POST /admin/backup`(A) · `POST /admin/acl/rebuild`(A)

## 6. 数据库表清单（锁定，21 张）

`users` · `groups` · `group_members` · `spaces` · `documents` · `document_versions` · `attachments` · `drawings` · `data_tables` · `data_table_rows` · `acl_entries` · `doc_acl_flat` · `doc_search`(FTS5 虚表) · `refresh_tokens` · `notification_channels` · `notification_subscriptions` · `notification_logs` · `audit_logs` · `site_settings` · `import_jobs` · `schema_migrations`

关键约束：
- `documents`：物化 `path`（形如 `/1/12/34/`）用于权限继承与子树重算；`UNIQUE(space_id, parent_id, slug)`；`content_md` / `content_html`(渲染缓存) / `content_text`(去标记纯文本)；`visibility` ∈ inherit/public/space/private；`deleted_at` 软删除
- `acl_entries`：`UNIQUE(object_type, object_id, subject_type, subject_id)`；`permission` 1读/2写/3管理；`inherit` 布尔
- `doc_acl_flat`：`PRIMARY KEY(doc_id, user_id)`，`permission` + `source`(direct/group/space/public)。读取侧一次索引探测完成权限过滤，**禁止**查询时递归遍历树
- `doc_search`：`fts5(title, body, code, doc_id UNINDEXED, tokenize='unicode61')`
- `site_settings`：敏感键（ldap.bindPassword / oidc.clientSecret / smtp.pass / webhook secret）AES-256-GCM 加密，主密钥 `WIKIDOC_MASTER_KEY` 缺失时服务拒绝启动
- 启动 PRAGMA：`journal_mode=WAL` · `foreign_keys=ON` · `busy_timeout=5000`

## 7. 页面清单（锁定）

| 页面 | 路由 | 核心区块 |
|------|------|----------|
| 登录 | `/login` | 左右分栏；账号密码 / SSO 按钮；主题与语言切换 |
| 工作台 | `/` | 最近访问、我的空间、快捷新建 |
| 空间 | `/space/:key` | 左侧空间树、文档列表、右侧空间概览 |
| 文档阅读 | `/doc/:id` | 三栏：空间树 / 正文 / 大纲；附件、版本入口 |
| 编辑器 | `/doc/:id/edit` | CodeMirror 编辑 + 分屏预览 + 区块插入（分栏/表格/画板） |
| 搜索结果 | `/search` | 筛选侧栏（空间/类型/时间）、结果列表、高亮摘要、分页 |
| 导入中心 | `/import` | 步骤条、拖拽上传、任务列表与进度 |
| 设置-外观 | `/settings/appearance` | 主题 3 选 1、明暗/跟随系统、密度、正文字号 |
| 设置-成员与组 | `/settings/members`、`/settings/groups` | 用户 CRUD、组 CRUD、组成员、AD 同步 |
| 设置-权限 | `/settings/permissions` | ACL 表格、继承开关、主体选择器 |
| 设置-LDAP | `/settings/ldap` | 服务器/端口/Base DN/绑定 DN/密码/过滤器 + 连接测试 |
| 设置-SSO | `/settings/sso` | OIDC 启用、Issuer/ClientID/Secret/回调地址 |
| 设置-通知 | `/settings/notifications` | 三渠道配置 + 测试发送 + 订阅设置 |
| 设置-审计 | `/settings/audit` | 审计日志表格 |
| 回收站 | `/trash` | 软删除文档恢复/彻底删除 |

## 8. 设计 Token（锁定）

- 来源：`client/src/styles/tokens.css`（678 行，唯一颜色出处）
- 主题：`graphite` 石墨蓝（默认）/ `inkgreen` 墨绿 / `slate` 石板灰，各含 light 与 dark → `data-theme="graphite-dark"` 形式
- 字体：系统字体栈，禁止 Web Font；`--font-sans` / `--font-serif` / `--font-mono`
- 图标：**lucide-react 唯一**，strokeWidth 2，尺寸仅 16/20/24
- 布局：侧栏 260（折叠 56）· 大纲 240 · 顶栏 52 · 正文最大宽 880
- 断点：1536 / 1280 / 1024 / 768 / 375

## 9. 验收标准（EARS 格式，锁定）

| 编号 | 功能 | 验收标准 | 优先级 |
|------|------|----------|--------|
| AC-01 | 检索 | While 用户输入中文关键词，系统**必须**返回标题/正文/代码命中结果并按 bm25 排序 | P0 |
| AC-02 | 检索 | If 用户对某文档无读权限，系统**必须**从结果中排除该文档 | P0 |
| AC-03 | 检索 | When 关键词长度不足 2 字符，系统**必须**退化为 LIKE 匹配而不报错 | P0 |
| AC-04 | 登录 | If 提供合法 AD 域账号密码，系统**必须**完成二次 bind 并签发 JWT | P0 |
| AC-05 | 登录 | If LDAP 服务不可达，系统**必须**在 8 秒内超时并记录审计，且已签发 token 不受影响 | P0 |
| AC-06 | 权限 | While 文档 visibility=inherit，系统**必须**沿 path 前缀继承最近祖先的 ACL | P0 |
| AC-07 | 权限 | If 同一主体在多级得到不同权限，系统**必须**取最高权限 | P0 |
| AC-08 | 附件 | When 用户请求下载无权文档的附件，系统**必须**返回 403 | P0 |
| AC-09 | 导入 | When 上传 .docx，系统**必须**输出保留标题层级/列表/表格/图片的 Markdown | P0 |
| AC-10 | 导入 | When 上传 .xlsx，系统**必须**输出多维表格或 Markdown 表格 | P0 |
| AC-11 | 通知 | When 文档发生变更，系统**必须**向已配置且启用的渠道投递通知 | P0 |
| AC-12 | 主题 | When 用户切换主题或明暗，系统**必须**立即生效并在刷新后保持 | P0 |
| AC-13 | 语言 | When 用户切换中英，系统**必须**立即生效并在刷新后保持 | P0 |
| AC-14 | 版本 | When 文档保存，系统**必须**生成版本记录且可回滚到任意历史版本 | P0 |
| AC-15 | 离线 | While 断网状态，系统**必须**正常加载、切换主题语言、渲染代码高亮（零外网请求） | P0 |
| AC-16 | 画板 | When 用户在画板绘制并保存，系统**必须**将 SVG 持久化并在阅读页渲染 | P0 |
| AC-17 | 多维表格 | When 用户新增行或修改单元格，系统**必须**持久化并支持排序筛选 | P0 |

## 10. 边界与约束

- 不支持 IE；目标浏览器为 Chrome/Edge/Firefox/国产双核浏览器最新两版
- 单文件 ≤ 300 行；入口只装配；依赖方向 route → service → repository → db 单向；route 层禁止直接写 SQL
- 所有 SQL 走预编译绑定参数
- 上传：扩展名白名单 + MIME 校验 + 50MB 上限；存储名用随机 key 无扩展名，杜绝路径穿越
- 速率限制：登录 10/15min/IP、写 120/min/用户、搜索 60/min/用户、导入 5/h/用户
- 颜色只能来自 tokens.css 变量（唯一例外 `#fff` / `#000`）
- 禁止 emoji 作功能图标；禁止紫粉渐变；禁止弹跳缓动

## 11. 已知坑（实测，优先级最高）

| 坑 | 根因 | 修法 |
|----|------|------|
| FTS5 `trigram` 搜不到中文双字词 | trigram 要求查询词 ≥3 字符，**静默返回 0 命中不报错** | 改用应用层 bigram 预分词 + `unicode61`（已实测：域控/登录/交换机/ldap/createClient 全命中） |
| FTS5 `snippet()` 摘要带分词空格 | 返回"容器 器编 编排"这类文本 | **禁止**用 snippet()，摘要自行从原文按命中位置截取 |
| FTS5 MATCH 裸 `"` 抛 `unterminated string` | 未转义 | MATCH 串必须转义双引号后使用 |
| 分词写端与查询端不一致 → 静默搜不到 | 两处实现漂移 | 写端与查询端**必须共用** `server/src/search/segment.ts` 唯一实现 |
| xlsx@0.18.5 含 CVE-2023-30533 / CVE-2024-22363 | SheetJS 官方已撤出 npm 公共源 | 用 exceljs 4.4.0 |
| openid-client 6.x 为 ESM-only | CJS 项目 require 直接失败 | 锁 5.7.1 |

## 12. 端到端验证步骤

```bash
# 1. 安装与构建
cd server && npm install && npm run build
cd ../client && npm install && npm run build

# 2. 启动（单端口，前端产物由后端托管）
cd server && WIKIDOC_MASTER_KEY=dev-master-key npm start
# 断言：GET /api/admin/health 返回 { code: 0 }

# 3. 登录
curl -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Admin@12345"}'
# 断言：返回 code=0 且 Set-Cookie 含 refresh_token

# 4. 中文检索核心流
curl 'localhost:3000/api/search?q=%E5%9F%9F%E6%8E%A7' -H 'Cookie: ...'
# 断言：命中含"域控"的文档，且不含无权文档

# 5. 单字检索（LIKE 兜底）
curl 'localhost:3000/api/search?q=%E7%BD%91' -H 'Cookie: ...'
# 断言：不报错，返回结果或空列表（不得 500）

# 6. 离线验收
# 断网后刷新页面：主题切换 / 中英切换 / 代码高亮 / 画板 均正常
```

## 13. 变更记录

| 日期 | 变更内容 | 原因 | 影响范围 |
|------|----------|------|----------|
| 2026-09-29 | 否决 ESM 改造，openid-client 锁 5.7.1 | SSO 为可选功能，不值得承担全局改造风险 | 后端模块格式 |
| 2026-09-29 | Excel 解析改用 exceljs 4.4.0 | xlsx@0.18.5 含 CVE 且已撤出 npm 源 | 导入模块 |
| 2026-09-29 | 画板改为自研 SVG，否决 Excalidraw | 体积 2MB+ 且反向约束 React 版本 | 编辑器区块 |
| 2026-09-29 | Express 降回 4.21.2 | 避开 path-to-regexp v8 通配符语法变化 | 后端全局 |
| 2026-09-29 | 检索改用 bigram + unicode61 | trigram 对中文双字词静默失效 | 搜索模块 |
| 2026-09-29 | 多维表格纳入 P0，范围收窄 | 用户明示要求；砍掉多视图/关联/公式 | 编辑器区块 |
| 2026-09-29 | 飞书通道从 P1 升 P0 | 用户明示要求三种渠道 | 通知模块 |
