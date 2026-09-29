import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config, ensureMasterKey } from '../config';
import { migrations } from './schema';

/**
 * 数据库单例。全站唯一连接入口，业务模块 import { db } 即可。
 * better-sqlite3 为同步 API，SQLite 本身串行写，无需连接池。
 */

ensureMasterKey();
fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL');

/** 执行未落库的迁移，已执行的按 name 跳过 */
export function runMigrations(): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`);

  const applied = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map((r) => (r as { name: string }).name)
  );

  const insert = db.prepare('INSERT INTO schema_migrations (name) VALUES (?)');
  for (const m of migrations) {
    if (applied.has(m.name)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      insert.run(m.name);
    })();
  }
}

runMigrations();

/** 事务包装，回调内任一步抛错整体回滚 */
export function tx<T>(fn: () => T): T {
  return db.transaction(fn)();
}

/** 查询单条，未命中返回 null */
export function getOne<T>(sql: string, params: unknown[] = []): T | null {
  const row = db.prepare(sql).get(...(params as never[])) as T | undefined;
  return row ?? null;
}

/** 查询多条 */
export function getMany<T>(sql: string, params: unknown[] = []): T[] {
  return db.prepare(sql).all(...(params as never[])) as T[];
}

/** 当前时间戳，与 SQLite 的 datetime('now') 格式一致（UTC） */
export function now(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}
