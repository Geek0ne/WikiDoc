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

## 部署指南

> 本章覆盖从零部署到可交付使用的全过程。**首次部署请务必走完「验收清单」**，涉及认证、检索、导入、通知四条核心链路的实际连通性，这些是仅靠 `build` 通过无法证明的。

### 1. 部署前准备

| 检查项 | 要求 | 检查命令 |
| --- | --- | --- |
| Docker 引擎 | 20.10 及以上 | `docker --version` |
| Compose 插件 | v2 及以上 | `docker compose version` |
| 磁盘空间 | 建议 ≥ 5GB 可用 | `df -h` |
| 端口占用 | 8080 未被占用（可改） | `ss -tlnp \| grep 8080` |
| 数据目录权限 | `./data` 可被 uid 1000 写入 | 见下方说明 |

容器以非 root 用户 `node`（uid 1000）运行。**首次部署先手工创建数据目录并赋权**，避免 Compose 自动以 root 创建后容器无写权限：

```bash
mkdir -p ./data
chown -R 1000:1000 ./data
```

若环境不支持 `chown`（如部分 Windows 共享目录），改用 Docker 命名卷挂载，参见最后一节「数据目录权限报错」。

### 2. 标准部署（Docker Compose）

```bash
git clone <本仓库地址> wikidoc && cd wikidoc
mkdir -p ./data && sudo chown -R 1000:1000 ./data
docker compose up -d --build
```

首次构建需拉取依赖并编译前后端，耗时数分钟。完成后：

```bash
docker compose ps              # 等待 STATUS 变为 Up (healthy)
docker compose logs -f --tail=100   # 查看启动日志
```

健康检查每 30 秒探测一次 `/api/health`，`healthy` 表示服务已真正可用（而非仅容器启动）。随后浏览器访问 `http://<主机IP>:8080`。

### 3. 生产环境必做的三项配置

以下三项不配置服务也能跑，但会在生产环境出问题，建议部署时就显式设定：

```yaml
# docker-compose.yml → services.wikidoc.environment
environment:
  WIKIDOC_JWT_SECRET: "<openssl rand -hex 32 的输出>"
  WIKIDOC_JWT_REFRESH_SECRET: "<再生成一个不同的值>"
  WIKIDOC_PUBLIC_URL: "http://wiki.corp.local"   # 反代后填对外地址
```

- **JWT 两个密钥不设置时，容器每次重启都会重新随机生成，导致所有人登录态失效**。生成方式：`openssl rand -hex 32`
- **反代或域名访问时必须设置 `WIKIDOC_PUBLIC_URL`**，否则 SSO 回调地址与通知消息中的链接会指向默认的 `http://localhost:3000`
- 密钥建议写入 `.env` 文件并在 compose 的 service 下增加 `env_file: - .env`（注意：Compose 不会自动把 `.env` 注入容器，必须显式声明 `env_file`）；或直接填写在 `environment` 中。仓库已提供 [`.env.example`](./.env.example)，复制为 `.env` 后按注释填写即可

### 4. 反向代理与 HTTPS

内网 HTTP 场景可直连容器端口，无需反代。如需域名访问或终止 HTTPS：

```bash
cp deploy/nginx.example.conf /etc/nginx/conf.d/wikidoc.conf
# 按实际修改 server_name 与 proxy_pass
nginx -t && nginx -s reload
```

反代终止 TLS（对外 HTTPS）时，必须同时设置：

```yaml
WIKIDOC_COOKIE_SECURE: "true"        # 启用 Cookie Secure + HSTS
WIKIDOC_PUBLIC_URL: "https://wiki.corp.local"
```

服务端已开启 `trust proxy`，Nginx 透传 `X-Forwarded-*` 后应用可获取真实客户端 IP。上传体积注意两层限制：应用层单文件 50MB，反代侧示例已放宽到 100m，不要小于应用层限制。

### 5. 内网离线部署

镜像构建需要联网拉取 npm 依赖。隔离内网环境请在**有网机器**构建后导入：

```bash
# 有网机器
docker build -t wikidoc:1.0.0 .
docker save wikidoc:1.0.0 -o wikidoc-image.tar

# 内网目标机
docker load -i wikidoc-image.tar
# 将 compose 中的 build: . 改为 image: wikidoc:1.0.0，再
docker compose up -d
```

### 6. 裸机部署（无 Docker 环境）

需要 Node.js 22。务必注意：**服务端按 `../frontend/dist` 相对路径定位前端产物，工作目录必须是 `server/`**，否则首页 404 且接口正常，极易误判。

```bash
cd /opt/wikidoc/frontend && npm ci && npm run build
cd /opt/wikidoc/server && npm ci && npm run build
mkdir -p /var/lib/wikidoc && chown -R wikidoc:wikidoc /var/lib/wikidoc
```

`/etc/systemd/system/wikidoc.service`：

```ini
[Unit]
Description=WikiDoc Knowledge Base
After=network.target

[Service]
Type=simple
User=wikidoc
WorkingDirectory=/opt/wikidoc/server
EnvironmentFile=/etc/wikidoc/wikidoc.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`/etc/wikidoc/wikidoc.env`：

```ini
NODE_ENV=production
PORT=3000
WIKIDOC_DATA_DIR=/var/lib/wikidoc
WIKIDOC_JWT_SECRET=<openssl rand -hex 32>
WIKIDOC_JWT_REFRESH_SECRET=<openssl rand -hex 32>
WIKIDOC_PUBLIC_URL=http://wiki.corp.local
```

```bash
systemctl daemon-reload && systemctl enable --now wikidoc
systemctl status wikidoc
```

### 7. 升级与回滚

升级前**先做一次在线备份**（设置页 → 备份与统计 → 立即备份，或调用备份 API）：

```bash
git pull
docker compose up -d --build        # 重新构建并替换容器
docker compose ps                   # 确认 healthy
```

数据位于 `./data` 卷内，不影响业务数据。回滚：

```bash
docker compose down
git checkout <上一个可用版本>
docker compose up -d --build
```

若升级过程中数据结构已变更且需要回退到旧版本，则用升级前的备份文件按下一节的恢复步骤还原数据库。

### 8. 备份、恢复与迁移

**在线备份**（不停服，推荐日常使用）：设置页「备份与统计 → 立即备份」，或

```bash
curl -X POST http://127.0.0.1:8080/api/admin/backup -H "Authorization: Bearer <管理员令牌>"
```

产物落在 `/data/backups/wikidoc-<时间戳>.db`。

**恢复（当前版本为手工操作，尚无一键恢复接口）**：

```bash
docker compose stop                                  # 必须先停服
cp ./data/wikidoc.db ./data/wikidoc.db.bak-$(date +%F)
cp ./data/backups/wikidoc-<时间戳>.db ./data/wikidoc.db
rm -f ./data/wikidoc.db-wal ./data/wikidoc.db-shm    # 关键：清除旧 WAL，否则与新库冲突
docker compose start
curl http://127.0.0.1:8080/api/health                # 确认 {"code":0,"data":{"status":"ok"}}
```

备份文件仅含数据库本身。若使用了在线备份 API，恢复后 `/data/uploads/` 中的附件需另行保留（建议整卷备份覆盖）。

**整卷迁移**（换机器时推荐）：打包整个 `./data` 目录，**必须包含 `.master_key`**。缺少该文件时服务仍可启动，但此前加密保存的 LDAP 绑定密码、OIDC Secret、SMTP 密码将无法解密，需要到设置页重新填写。

### 9. 首次部署验收清单

不要只看容器 healthy，以下 15 项逐条通过后再交付用户使用：

| # | 验收项 | 操作方式 | 通过标准 |
| --- | --- | --- | --- |
| 1 | 容器健康 | `docker compose ps` | STATUS = `Up (healthy)` |
| 2 | 健康接口 | `curl http://host:8080/api/health` | 返回 `{"code":0,"data":{"status":"ok"}}` |
| 3 | 首页可达 | 浏览器打开 `http://host:8080` | 正常显示登录页，无空白 |
| 4 | 管理员登录 | `admin` + 初始密码 | 登录成功进入首页 |
| 5 | 修改默认密码 | 用户菜单 → 修改密码 → 退出重登 | 新密码可登录，旧密码失效 |
| 6 | 空间与文档 | 新建空间 → 新建文档 → 编辑器保存 | 详情页显示正文，版本列表出现记录 |
| 7 | 中文检索 | 搜索正文中的双字词（如"域控""防火墙"） | 命中目标文档；单字也能兜底出结果 |
| 8 | 版本回滚 | 历史版本 → 回滚 | 正文回到所选版本内容 |
| 9 | Word 导入 | 上传一份真实 `.docx`（含图片） | 转为 Markdown，图片可正常显示 |
| 10 | Excel 导入 | 上传一份 `.xlsx` | 转为多维表格，行列数据一致 |
| 11 | 回收站 | 删除文档 → 回收站 → 恢复 | 文档回到原位置 |
| 12 | 权限隔离 | 建普通用户 → 仅授予某空间只读 | 该用户看不到未授权空间、无法编辑 |
| 13 | 在线备份 | 设置页 → 立即备份 | 生成 `wikidoc-<时间戳>.db` |
| 14 | 通知到达 | 配置企微/飞书/SMTP 任一 → 测试发送 | 对应群或邮箱**实际收到**消息 |
| 15 | 域账号登录 | 填 LDAP 配置 → 测试连接 → 域账号登录 | 连通成功且域用户自动建号 |

第 9、10 项建议用**真实业务文档**验证而非构造的简单文件；第 14、15 项依赖外部系统，是部署中最容易遗漏的部分。

### 10. 常见故障排查

```bash
docker compose logs -f wikidoc          # 实时日志
docker compose logs --tail=200 wikidoc  # 最近 200 行
docker inspect wikidoc --format '{{.State.Health.Status}}'
```

| 症状 | 排查方向 |
| --- | --- |
| 容器反复重启 | 日志中出现主密钥错误 → 检查 `WIKIDOC_MASTER_KEY` 或 `/data/.master_key` |
| 一直 `(health: starting)` 超 1 分钟 | `/api/health` 未响应 → 看日志是否为端口占用或编译失败 |
| 能访问 IP:8080 但登录 401 | 多为 Cookie 被代理吞掉 → 检查反代是否透传 `Host` 与 `X-Forwarded-*` |
| 首页白屏但接口正常 | 前端产物未被托管 → 检查 `/app/frontend/dist` 是否存在，裸机部署检查工作目录是否为 `server/` |
| 上传失败 | 应用层 50MB 与反代 `client_max_body_size` 两层限制 |
| 中文搜不到预期内容 | 确认文档已保存（索引随写入更新），双字词走 FTS、单字走 LIKE 兜底 |
| 数据目录权限报错 | `chown -R 1000:1000 ./data` |

### 11. 数据目录权限报错（特殊环境）

不支持修改宿主机目录属主时（Windows 共享目录、部分 NAS），改用命名卷：

```yaml
services:
  wikidoc:
    volumes:
      - wikidoc-data:/data
volumes:
  wikidoc-data:
```

数据实际位置用 `docker volume inspect wikidoc_wikidoc-data` 查看，备份时直接对该卷目录操作。

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

管理员登录后调用内置备份接口，它使用 SQLite 在线备份机制生成一致性快照，无需停服（命令行用法与**完整恢复/迁移步骤**见「部署指南 → 备份、恢复与迁移」）：

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
cd frontend
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
