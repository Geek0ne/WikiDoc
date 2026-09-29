import { config, ensureDirs, ensureSecrets } from './config';
import { db } from './db';
import { createApp } from './app';
import bcrypt from 'bcryptjs';
import { now } from './db';

/**
 * 服务启动入口。只做三件事：准备运行环境、确保初始数据、监听端口。
 */

ensureSecrets();
ensureDirs();

function ensureInitialData(): void {
  const userCount = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
  if (userCount > 0) return;

  const password = process.env.WIKIDOC_ADMIN_PASSWORD || 'Admin@12345';
  const hash = bcrypt.hashSync(password, 12);
  const ts = now();

  db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO users (username, display_name, email, password_hash, source, is_admin, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'local', 1, ?, ?)`
      )
      .run('admin', '系统管理员', 'admin@wikidoc.local', hash, ts, ts);

    const spaceInfo = db
      .prepare(
        `INSERT INTO spaces (key, name, description, owner_id, visibility, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'space', ?, ?)`
      )
      .run('INTRO', '入门指南', '快速了解 WikiDoc 的写法与规范', info.lastInsertRowid, ts, ts);

    db.prepare(
      `INSERT INTO documents (space_id, parent_id, title, slug, content_md, content_html, content_text,
        status, visibility, path, sort_order, author_id, version, created_at, updated_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, 'published', 'space', ?, 0, ?, 1, ?, ?)`
    ).run(
      spaceInfo.lastInsertRowid,
      '欢迎使用 WikiDoc',
      'welcome',
      welcomeDoc,
      null,
      null,
      `/${spaceInfo.lastInsertRowid}/`,
      info.lastInsertRowid,
      ts,
      ts
    );
  })();

  // eslint-disable-next-line no-console
  console.log(`已初始化管理员账号：admin / ${password}（请登录后立即修改）`);
}

const welcomeDoc = `# 欢迎使用 WikiDoc

WikiDoc 是面向企业内部的知识库系统，支持 AD 域账号登录、精细化权限与中文全文检索。

## 三分钟上手

1. 在左侧空间树中选择一个空间，点击「新建文档」
2. 用 Markdown 书写内容，支持代码高亮、表格、图片与附件
3. 保存后自动建立版本，可在「版本历史」中回滚

## 编辑器能力

- 代码高亮：使用围栏代码块并指定语言，例如 \\\`\\\`\\\`ts
- 自动目录：正文中的二级与三级标题会自动生成右侧大纲
- 分栏：使用 :::columns 容器
- 多维表格与在线画板：在工具栏插入对应区块

## 权限

文档权限可授予用户、用户组或所有人，未单独设置的文档继承上级设置。
`;

const app = createApp();
ensureInitialData();

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`WikiDoc 服务已启动: http://localhost:${config.port}`);
  // eslint-disable-next-line no-console
  console.log(`数据目录: ${config.dataDir}`);
});
