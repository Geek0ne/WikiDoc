/**
 * 全库 DDL。按数组顺序执行，幂等（全部使用 IF NOT EXISTS）。
 * 迁移由 db/index.ts 的 runMigrations 统一调度，业务模块不得自行建表。
 */

export interface Migration {
  name: string;
  sql: string;
}

export const migrations: Migration[] = [
  {
    name: '001_schema_migrations',
    sql: `CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );`,
  },
  {
    name: '002_users',
    sql: `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      email TEXT,
      avatar_url TEXT,
      password_hash TEXT,
      source TEXT NOT NULL DEFAULT 'local' CHECK (source IN ('local','ldap','oidc')),
      external_id TEXT,
      is_admin INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_users_external ON users(external_id);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`,
  },
  {
    name: '003_groups',
    sql: `CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      external_dn TEXT,
      source TEXT NOT NULL DEFAULT 'local' CHECK (source IN ('local','ldap')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS group_members (
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (group_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);`,
  },
  {
    name: '004_spaces',
    sql: `CREATE TABLE IF NOT EXISTS spaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      owner_id INTEGER NOT NULL REFERENCES users(id),
      visibility TEXT NOT NULL DEFAULT 'space' CHECK (visibility IN ('inherit','public','space','private')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );`,
  },
  {
    name: '005_documents',
    sql: `CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
      parent_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      content_md TEXT NOT NULL DEFAULT '',
      content_html TEXT,
      content_text TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
      visibility TEXT NOT NULL DEFAULT 'inherit' CHECK (visibility IN ('inherit','public','space','private')),
      path TEXT NOT NULL DEFAULT '/',
      sort_order INTEGER NOT NULL DEFAULT 0,
      author_id INTEGER NOT NULL REFERENCES users(id),
      updated_by INTEGER REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_slug ON documents(space_id, parent_id, slug);
    CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(path);
    CREATE INDEX IF NOT EXISTS idx_documents_space ON documents(space_id, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_documents_parent ON documents(parent_id);`,
  },
  {
    name: '006_document_versions',
    sql: `CREATE TABLE IF NOT EXISTS document_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      title TEXT NOT NULL,
      content_md TEXT NOT NULL,
      author_id INTEGER NOT NULL REFERENCES users(id),
      change_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_versions_doc ON document_versions(document_id, version);`,
  },
  {
    name: '007_attachments',
    sql: `CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
      uploader_id INTEGER NOT NULL REFERENCES users(id),
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      storage_key TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_attachments_document ON attachments(document_id);`,
  },
  {
    name: '008_drawings',
    sql: `CREATE TABLE IF NOT EXISTS drawings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '未命名画板',
      svg TEXT NOT NULL DEFAULT '',
      width INTEGER NOT NULL DEFAULT 800,
      height INTEGER NOT NULL DEFAULT 450,
      author_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_drawings_document ON drawings(document_id);`,
  },
  {
    name: '009_data_tables',
    sql: `CREATE TABLE IF NOT EXISTS data_tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT '未命名表格',
      columns TEXT NOT NULL DEFAULT '[]',
      author_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS data_table_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER NOT NULL REFERENCES data_tables(id) ON DELETE CASCADE,
      cells TEXT NOT NULL DEFAULT '{}',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_data_table_rows_table ON data_table_rows(table_id, sort_order);`,
  },
  {
    name: '010_acl_entries',
    sql: `CREATE TABLE IF NOT EXISTS acl_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      object_type TEXT NOT NULL CHECK (object_type IN ('space','document')),
      object_id INTEGER NOT NULL,
      subject_type TEXT NOT NULL CHECK (subject_type IN ('user','group','everyone')),
      subject_id INTEGER,
      permission INTEGER NOT NULL CHECK (permission IN (1,2,3)),
      inherit INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_acl_unique ON acl_entries(object_type, object_id, subject_type, subject_id);
    CREATE INDEX IF NOT EXISTS idx_acl_object ON acl_entries(object_type, object_id);
    CREATE INDEX IF NOT EXISTS idx_acl_subject ON acl_entries(subject_type, subject_id);`,
  },
  {
    name: '011_doc_acl_flat',
    sql: `CREATE TABLE IF NOT EXISTS doc_acl_flat (
      doc_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permission INTEGER NOT NULL,
      source TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (doc_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_acl_flat_user ON doc_acl_flat(user_id, permission);`,
  },
  {
    name: '012_doc_search',
    sql: `CREATE VIRTUAL TABLE IF NOT EXISTS doc_search USING fts5(
      title, body, code, doc_id UNINDEXED, tokenize='unicode61'
    );`,
  },
  {
    name: '013_refresh_tokens',
    sql: `CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      user_agent TEXT,
      ip TEXT,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);`,
  },
  {
    name: '014_notifications',
    sql: `CREATE TABLE IF NOT EXISTS notification_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('wecom','feishu','email')),
      config TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS notification_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      channel_id INTEGER NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS notification_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER REFERENCES notification_channels(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      target TEXT,
      subject TEXT,
      status TEXT NOT NULL CHECK (status IN ('success','failed')),
      error TEXT,
      sent_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notify_logs_time ON notification_logs(sent_at);`,
  },
  {
    name: '015_audit_logs',
    sql: `CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      username_snapshot TEXT,
      action TEXT NOT NULL,
      object_type TEXT,
      object_id INTEGER,
      detail TEXT,
      ip TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);`,
  },
  {
    name: '016_site_settings',
    sql: `CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );`,
  },
  {
    name: '017_import_jobs',
    sql: `CREATE TABLE IF NOT EXISTS import_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_no TEXT NOT NULL UNIQUE,
      source_type TEXT NOT NULL CHECK (source_type IN ('docx','xlsx','markdown')),
      filename TEXT NOT NULL,
      target_space_id INTEGER REFERENCES spaces(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','success','failed')),
      total INTEGER NOT NULL DEFAULT 0,
      processed INTEGER NOT NULL DEFAULT 0,
      result TEXT,
      error TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_import_jobs_user ON import_jobs(created_by, created_at);`,
  },
  {
    name: '018_favorites',
    sql: `CREATE TABLE IF NOT EXISTS favorites (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, document_id)
    );
    CREATE TABLE IF NOT EXISTS recent_views (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      viewed_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, document_id)
    );
    CREATE INDEX IF NOT EXISTS idx_recent_user ON recent_views(user_id, viewed_at);`,
  },
];
