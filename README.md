# WikiDoc

面向企业内网的自托管知识库系统：以 Markdown 为核心的文档协作平台，单容器部署，数据完全留在内网。

**版本** 1.0.0 | **许可证** MIT | **部署形态** 单容器 · 单端口 | **存储** SQLite(FTS5 全文检索)

---

## 特性

- **中英文全文检索**：基于 SQLite FTS5，应用层 bigram（相邻两字）预分词，中文双字词直接命中，单字查询自动兜底匹配
- **Markdown 编辑器**：CodeMirror 6 内核，自动目录、代码高亮、图片与附件上传、在线绘图板、多维表格区块、分栏排版；保存自动生成版本，可随时回滚
- **细粒度文档权限**：空间级与文档级两级授权，可授予用户、用户组或所有人，子文档默认继承上级设置
- **企业身份集成**：AD 域 / LDAP 登录与用户组同步，OIDC 单点登录（SSO），可在设置页切换或并存
- **文档导入**：Word（.docx）一键转 Markdown，Excel（.xlsx）导入为多维表格
- **消息通知**：企业微信群机器人、飞书自定义机器人、SMTP 邮件三种渠道，均在设置页配置
- **界面**：多主题、明暗模式切换、中英双语
- **部署**：单容器、单端口、SQLite 零外部依赖，`docker compose up` 即用

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 18、Vite 7、TypeScript 5、CodeMirror 6、markdown-it、highlight.js、DOMPurify、lucide-react |
| 后端 | Node.js 22、Express 4、better-sqlite3（SQLite + FTS5）、zod、helmet |
| 企业集成 | ldapts（AD/LDAP）、openid-client（OIDC）、mammoth（Word 导入）、ExcelJS（Excel 导入）、nodemailer（SMTP 邮件） |
| 部署 | Docker 多阶段构建、docker compose、Nginx 反向代理（可选） |

## 快速开始

前置要求：Docker 20.10+ 与 Docker Compose v2。

```bash
git clone <本仓库> wikidoc && cd wikidoc
docker compose up -d --build
```

启动完成后访问 `http://<主机IP>:8080`。

默认数据卷为项目目录下的 `./data`（SQLite 数据库、附件、备份、加密主密钥均在此）。如需修改对外端口，编辑 `docker-compose.yml` 中 `ports` 左侧数字即可。

**首次登录**

系统在首次启动（用户表为空）时自动初始化管理员账号：

- 账号：`admin`
- 密码：`WIKIDOC_ADMIN_PASSWORD` 环境变量的值，默认 `Admin@12345`（见下方"初始化管理员"小节）

同时自动创建 `INTRO` 入门空间与欢迎文档。**请登录后立即修改默认密码。**

### 初始化管理员

初始管理员仅在生产库 `users` 表为空时创建（服务端启动入口 `server/src/index.ts`）。需要指定初始密码时，在 `docker-compose.yml` 中设置：

```yaml
environment:
  WIKIDOC_ADMIN_PASSWORD: "Your-Strong-Password"
```

该变量只在首次初始化时生效；已有用户数据时修改它不会有任何影响。

## 环境变量

| 名称 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 服务端监听端口（容器内）。`docker-compose.yml` 已固定为 3000，改对外端口请调整 `ports` 映射 |
| `WIKIDOC_DATA_DIR` | 容器内 `/data` | 数据目录（SQLite 库、附件、备份、主密钥）。镜像已固定为 `/data`，对应宿主机 `./data` |
| `WIKIDOC_MASTER_KEY` | 无（必需） | 敏感配置加密主密钥，用于加密存储 LDAP 绑定密码、OIDC 密钥、SMTP 密码。compose 中留空由启动脚本自动生成并保存到 `/data/.master_key`；缺失时服务拒绝启动 |
| `WIKIDOC_ADMIN_PASSWORD` | `Admin@12345` | 首次初始化的管理员密码，仅 `users` 表为空时生效 |
| `WIKIDOC_JWT_SECRET` | 每次启动随机生成 | 访问令牌签名密钥。不设置则容器每次重启后全员登录态失效 |
| `WIKIDOC_JWT_REFRESH_SECRET` | 每次启动随机生成 | 刷新令牌签名密钥，同上 |
| `WIKIDOC_PUBLIC_URL` | `http://localhost:3000` | 对外访问地址，用于 SSO 回调与通知消息中的链接拼接。反向代理环境务必设置 |
| `WIKIDOC_COOKIE_SECURE` | `false` | 设为 `true` 时 Cookie 仅经 HTTPS 传输，并启用 HSTS。仅反向代理终止 TLS 后使用 |
| `NODE_ENV` | `production` | 运行环境标识 |

LDAP / OIDC / 通知渠道等运行期配置存于数据库 `site_settings` 表，管理员在 Web 设置页修改后即时生效，无需环境变量。

## 配置指南

以下集成均在 Web 界面配置：登录管理员账号 → 管理后台 → 系统设置。

### AD 域 / LDAP

典型 Active Directory 环境的示例值：

| 配置项 | 示例值 |
| --- | --- |
| LDAP 地址 | `ldap://dc01.corp.local:389`（LDAPS 用 `ldaps://dc01.corp.local:636`） |
| Base DN | `DC=corp,DC=local` |
| 绑定账号（服务账号 DN） | `CN=svc-wikidoc,OU=ServiceAccounts,DC=corp,DC=local` |
| 绑定密码 | 服务账号密码（保存时以主密钥加密落库） |
| 用户过滤器 | `(sAMAccountName={login})` |
| 组同步 | 基于用户 `memberOf` 属性同步用户组，用于按组授权 |

配置保存后可先做连通性测试，再开放域账号登录。域用户首次登录时自动建号。

### OIDC 单点登录

| 配置项 | 示例值 |
| --- | --- |
| Issuer | `https://sso.corp.local/realms/internal` |
| Client ID | `wikidoc` |
| Client Secret | 在 IdP 侧生成（加密落库） |
| Scope | `openid profile email` |

回调地址为 `<WIKIDOC_PUBLIC_URL>/api/auth/<回调路径>`，请在 IdP 侧登记；未设置 `WIKIDOC_PUBLIC_URL` 时服务端按 `http://localhost:3000` 拼接，反代环境必须显式配置。

### 通知渠道

| 渠道 | 关键配置 |
| --- | --- |
| 企业微信 | 群机器人 Webhook 地址（群设置 → 添加机器人获得） |
| 飞书 | 自定义机器人 Webhook 地址（可另配签名校验密钥） |
| SMTP | 服务器地址、端口（25/465/587）、加密方式（无/SSL/TLS）、账号、密码、发件人地址 |

## 数据与备份

### /data 目录内容

| 路径 | 说明 |
| --- | --- |
| `wikidoc.db` | SQLite 主数据库（全部业务数据） |
| `wikidoc.db-wal` / `wikidoc.db-shm` | WAL 模式运行时文件，属正常现象，勿手工删除 |
| `uploads/` | 图片与附件 |
| `backups/` | 在线备份产物 |
| `.master_key` | 敏感配置加密主密钥（如由启动脚本自动生成），务必随备份妥善保管 |

### 在线备份（推荐）

管理员登录后调用内置备份接口，它使用 SQLite 在线备份机制生成一致性快照，无需停服：

```bash
curl -X POST http://127.0.0.1:8080/api/admin/backup -H "Authorization: Bearer <管理员令牌>"
```

备份文件写入 `/data/backups/wikidoc-<时间戳>.db`，随后可用 `GET /api/admin/backups` 查看列表。

### 直接备份卷

若用脚本整卷备份（拷贝 `./data`），注意 SQLite 运行在 WAL 模式：仅拷贝 `wikidoc.db` 单文件可能丢失 WAL 中尚未合并的数据。建议二选一：

1. 优先使用上面的备份 API 生成一致性快照后再拷贝；
2. 直接备份卷时，先停服（或重启容器触发 checkpoint）再整体拷贝 `./data` 目录。

## 常见问题

### 中文搜索为什么能命中"域控"这类词？

写入文档时，服务端把正文按相邻两字切成 bigram token 流存入 FTS5 索引（unicode61 分词器）；查询时对搜索词做同样的 bigram 切分后构造 MATCH。因此"域控"会被切成 token `域控` 直接命中，两字以上的词组按多 token AND 组合。单个汉字无法构成 bigram，走 `LIKE` 兜底匹配。之所以不用 FTS5 自带 trigram，是因为它要求查询词至少 3 个字符，而中文最高频的双字词（如"域控""会议"）会完全搜不到。

### 忘记 / 丢失 WIKIDOC_MASTER_KEY 怎么办？

该密钥只用于加密设置页中的密钥类配置（LDAP 绑定密码、OIDC Client Secret、SMTP 密码），文档正文与用户数据不依赖它。若删除 `/data/.master_key`，下次启动会生成新密钥，服务可正常运行，但**此前用旧密钥加密的配置将无法解密**，需要到设置页重新填写这些密钥类配置。请将 `.master_key` 纳入备份范围。

### 如何修改访问端口？

改 `docker-compose.yml` 中 `ports` 左侧宿主机端口即可，例如 `"9090:3000"`，然后 `docker compose up -d` 重建。容器内端口无需改动。

### 反向代理后 Cookie / HTTPS 注意什么？

内网 HTTP 反代保持默认 `WIKIDOC_COOKIE_SECURE=false` 即可正常登录。若反代终止 TLS 对外提供 HTTPS，需设置 `WIKIDOC_COOKIE_SECURE=true`（服务端将同时启用 HSTS 与 Cookie Secure）。同时应设置 `WIKIDOC_PUBLIC_URL` 为对外地址，否则 SSO 回调与通知链接会指向 `http://localhost:3000`。服务端已开启 `trust proxy`，反代透传 `X-Forwarded-*` 头即可获取真实来源（示例见 `deploy/nginx.example.conf`）。

### 忘记管理员密码怎么办？

按顺序尝试：

1. 站内还有其他管理员账号：由其在用户管理中重置；
2. 已配置 LDAP/OIDC：用域账号 / SSO 登录后再处理本地账号；
3. 均不可行时，用镜像内自带依赖直接更新库（在宿主机执行，两条命令）：

```bash
# 生成新密码的 bcrypt 哈希（示例新密码 NewPass@123）
docker exec -w /app/server wikidoc node -e "console.log(require('bcryptjs').hashSync('NewPass@123',12))"
# 用上一步输出的哈希替换 <HASH> 执行更新
docker exec -w /app/server wikidoc node -e "require('better-sqlite3')('/data/wikidoc.db').prepare(\"UPDATE users SET password_hash=?, updated_at=datetime('now') WHERE username='admin'\").run('<HASH>')"
```

4. 全新系统且数据无需保留：清空 `./data` 后重新 `docker compose up -d`，按初始密码重新初始化。

### 容器启动报 /data 无写权限？

容器以非 root 用户 `node`（uid 1000）运行。宿主机 `./data` 目录属主非 uid 1000 时会写入失败，执行：

```bash
chown -R 1000:1000 ./data
```

### 上传文件大小限制？

应用层限制单文件 50MB；使用 Nginx 反代时其 `client_max_body_size` 已在示例中放宽为 100m，请勿小于应用限制。

## 开发指南

本地开发需要 Node.js 22。

**服务端**（Express，监听 3000）：

```bash
cd server
npm install
export WIKIDOC_MASTER_KEY=$(openssl rand -hex 32)   # Git Bash / Linux;Windows PowerShell: $env:WIKIDOC_MASTER_KEY=(openssl rand -hex 32)
npm run dev      # tsx watch,热重载,数据落在 server/data/
```

**前端**（Vite，监听 5173，`/api` 自动代理到 `http://localhost:3000`）：

```bash
cd client
npm install
npm run dev
```

生产构建验证：服务端 `npm run build`（tsc 编译到 `dist/`），前端 `npm run build`（tsc 类型检查 + vite 打包到 `dist/`，由服务端静态托管）。

### 目录结构

```
WikiDoc/
├── frontend/                 # 前端(React 18 + Vite),产物 dist/ 由服务端托管
│   ├── src/
│   └── vite.config.ts      # 开发端口 5173,/api 代理到 3000
├── server/                 # 服务端(Express + better-sqlite3)
│   ├── src/
│   │   ├── config/         # 运行配置与环境变量解析
│   │   ├── db/             # SQLite 连接、WAL 与迁移调度
│   │   ├── routes/         # REST 路由(目录自动装配到 /api)
│   │   ├── search/         # FTS5 索引维护与 bigram 分词
│   │   └── index.ts        # 启动入口(含管理员与欢迎文档初始化)
│   └── tsconfig.json
├── deploy/
│   └── nginx.example.conf  # 内网反向代理示例
├── docs/                   # 产品与架构文档
├── data/                   # 运行时数据卷(自动生成,不入库)
├── Dockerfile              # 多阶段构建
├── docker-compose.yml      # 单容器编排
└── docker-entrypoint.sh    # 容器启动脚本(主密钥引导)
```

## 许可证

[MIT](./LICENSE) © 2026 Geek0ne
