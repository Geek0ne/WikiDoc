import { db, getOne, getMany, tx, now } from '../db';
import { AppError } from '../utils/errors';
import { hasPermission } from './permission.service';
import { recordAudit } from './audit.service';
import type { User } from '../types';

/**
 * 多维表格。列结构存 data_tables.columns（JSON），行数据存
 * data_table_rows.cells（JSON，键为列 key）。服务端不做列类型强校验，
 * 类型语义（文本/数字/日期/单选）由前端渲染层负责。
 */

export interface DataTableColumn {
  key: string;
  title: string;
  type: 'text' | 'number' | 'date' | 'select' | 'user';
  options?: string[];
  width?: number;
}

export interface DataTableRow {
  id: number;
  cells: Record<string, unknown>;
  sort_order: number;
}

export interface DataTableView {
  id: number;
  document_id: number | null;
  name: string;
  columns: DataTableColumn[];
  author_id: number;
  created_at: string;
  updated_at: string;
}

function parseColumns(raw: string): DataTableColumn[] {
  try {
    const arr = JSON.parse(raw) as DataTableColumn[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function parseCells(raw: string): Record<string, unknown> {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function loadTable(id: number): { table: DataTableView } | null {
  const row = getOne<{ id: number; document_id: number | null; name: string; columns: string; author_id: number; created_at: string; updated_at: string }>(
    'SELECT * FROM data_tables WHERE id = ?',
    [id]
  );
  if (!row) return null;
  return {
    table: {
      id: row.id,
      document_id: row.document_id,
      name: row.name,
      columns: parseColumns(row.columns),
      author_id: row.author_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
  };
}

function assertTableReadable(actor: User, groupIds: number[], documentId: number | null): void {
  if (actor.is_admin === 1 || documentId === null) return;
  if (!hasPermission(actor.id, documentId, 1, groupIds)) throw AppError.forbidden();
}

function assertTableWritable(
  actor: User,
  groupIds: number[],
  documentId: number | null,
  authorId: number
): void {
  if (actor.is_admin === 1) return;
  if (documentId !== null) {
    if (!hasPermission(actor.id, documentId, 2, groupIds)) {
      throw AppError.forbidden('没有编辑该文档表格的权限');
    }
    return;
  }
  if (authorId !== actor.id) throw AppError.forbidden('仅作者可以修改该表格');
}

export function createDataTable(
  actor: User,
  groupIds: number[],
  input: { document_id?: number | null; name?: string; columns?: DataTableColumn[] }
): DataTableView {
  const documentId = input.document_id ?? null;
  if (documentId !== null) {
    assertTableWritable(actor, groupIds, documentId, actor.id);
    const doc = getOne<{ id: number }>('SELECT id FROM documents WHERE id = ? AND deleted_at IS NULL', [documentId]);
    if (!doc) throw AppError.notFound('目标文档不存在或已删除');
  }
  const columns = Array.isArray(input.columns) && input.columns.length
    ? input.columns
    : ([
        { key: 'c1', title: '名称', type: 'text' },
        { key: 'c2', title: '备注', type: 'text' },
      ] as DataTableColumn[]);

  const info = db
    .prepare(
      `INSERT INTO data_tables (document_id, name, columns, author_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(documentId, input.name?.trim() || '未命名表格', JSON.stringify(columns), actor.id, now(), now());
  return loadTable(Number(info.lastInsertRowid))!.table;
}

export function getDataTable(actor: User, groupIds: number[], id: number): DataTableView {
  const loaded = loadTable(id);
  if (!loaded) throw AppError.notFound('表格不存在');
  assertTableReadable(actor, groupIds, loaded.table.document_id);
  return loaded.table;
}

export function listDataTables(actor: User, groupIds: number[], documentId: number): DataTableView[] {
  assertTableReadable(actor, groupIds, documentId);
  const rows = getMany<{ id: number; document_id: number | null; name: string; columns: string; author_id: number; created_at: string; updated_at: string }>(
    'SELECT * FROM data_tables WHERE document_id = ? ORDER BY id',
    [documentId]
  );
  return rows.map((row) => ({
    id: row.id,
    document_id: row.document_id,
    name: row.name,
    columns: parseColumns(row.columns),
    author_id: row.author_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export function updateDataTable(
  actor: User,
  groupIds: number[],
  id: number,
  input: { name?: string; columns?: DataTableColumn[] }
): DataTableView {
  const loaded = loadTable(id);
  if (!loaded) throw AppError.notFound('表格不存在');
  const t = loaded.table;
  assertTableWritable(actor, groupIds, t.document_id, t.author_id);
  db.prepare('UPDATE data_tables SET name = ?, columns = ?, updated_at = ? WHERE id = ?').run(
    input.name !== undefined ? input.name.trim() || t.name : t.name,
    input.columns !== undefined ? JSON.stringify(input.columns) : JSON.stringify(t.columns),
    now(),
    id
  );
  return loadTable(id)!.table;
}

export function deleteDataTable(actor: User, groupIds: number[], id: number): void {
  const loaded = loadTable(id);
  if (!loaded) throw AppError.notFound('表格不存在');
  assertTableWritable(actor, groupIds, loaded.table.document_id, loaded.table.author_id);
  db.prepare('DELETE FROM data_tables WHERE id = ?').run(id);
  recordAudit({
    userId: actor.id,
    username: actor.username,
    objectType: 'datatable',
    objectId: id,
    action: 'datatable.delete',
    detail: `删除表格「${loaded.table.name}」`,
  });
}

export function listRows(actor: User, groupIds: number[], tableId: number): DataTableRow[] {
  const loaded = loadTable(tableId);
  if (!loaded) throw AppError.notFound('表格不存在');
  assertTableReadable(actor, groupIds, loaded.table.document_id);
  return getMany<{ id: number; cells: string; sort_order: number }>(
    'SELECT id, cells, sort_order FROM data_table_rows WHERE table_id = ? ORDER BY sort_order, id',
    [tableId]
  ).map((r) => ({ id: r.id, cells: parseCells(r.cells), sort_order: r.sort_order }));
}

export function addRow(
  actor: User,
  groupIds: number[],
  tableId: number,
  cells: Record<string, unknown>,
  afterId?: number
): DataTableRow {
  const loaded = loadTable(tableId);
  if (!loaded) throw AppError.notFound('表格不存在');
  assertTableWritable(actor, groupIds, loaded.table.document_id, loaded.table.author_id);

  let sortOrder: number;
  if (afterId !== undefined && Number.isFinite(afterId)) {
    const prev = getOne<{ sort_order: number }>(
      'SELECT sort_order FROM data_table_rows WHERE id = ? AND table_id = ?',
      [afterId, tableId]
    );
    if (prev) {
      // 在 after 与下一行之间插入：借用小数再整体重排
      const next = getOne<{ sort_order: number }>(
        'SELECT MIN(sort_order) AS sort_order FROM data_table_rows WHERE table_id = ? AND sort_order > ?',
        [tableId, prev.sort_order]
      );
      sortOrder = next && next.sort_order !== null ? (prev.sort_order + next.sort_order) / 2 : prev.sort_order + 1;
    } else {
      sortOrder = Date.now();
    }
  } else {
    const max = getOne<{ m: number | null }>(
      'SELECT MAX(sort_order) AS m FROM data_table_rows WHERE table_id = ?',
      [tableId]
    );
    sortOrder = (max?.m ?? 0) + 1;
  }

  const info = db
    .prepare('INSERT INTO data_table_rows (table_id, cells, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(tableId, JSON.stringify(cells ?? {}), sortOrder, now(), now());
  return { id: Number(info.lastInsertRowid), cells: cells ?? {}, sort_order: sortOrder };
}

export function updateRow(
  actor: User,
  groupIds: number[],
  tableId: number,
  rowId: number,
  cells: Record<string, unknown>
): DataTableRow {
  const loaded = loadTable(tableId);
  if (!loaded) throw AppError.notFound('表格不存在');
  assertTableWritable(actor, groupIds, loaded.table.document_id, loaded.table.author_id);
  const row = getOne<{ cells: string }>('SELECT cells FROM data_table_rows WHERE id = ? AND table_id = ?', [rowId, tableId]);
  if (!row) throw AppError.notFound('行不存在');
  const merged = { ...parseCells(row.cells), ...(cells ?? {}) };
  db.prepare('UPDATE data_table_rows SET cells = ?, updated_at = ? WHERE id = ?').run(
    JSON.stringify(merged),
    now(),
    rowId
  );
  return { id: rowId, cells: merged, sort_order: getOne<{ sort_order: number }>('SELECT sort_order FROM data_table_rows WHERE id = ?', [rowId])!.sort_order };
}

export function deleteRow(actor: User, groupIds: number[], tableId: number, rowId: number): void {
  const loaded = loadTable(tableId);
  if (!loaded) throw AppError.notFound('表格不存在');
  assertTableWritable(actor, groupIds, loaded.table.document_id, loaded.table.author_id);
  tx(() => {
    db.prepare('DELETE FROM data_table_rows WHERE id = ? AND table_id = ?').run(rowId, tableId);
  });
}

/** 导入链路：整表写入（先清空后批量插入） */
export function bulkFillTable(tableId: number, columns: DataTableColumn[], rows: Record<string, unknown>[]): void {
  tx(() => {
    db.prepare('UPDATE data_tables SET columns = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(columns),
      now(),
      tableId
    );
    db.prepare('DELETE FROM data_table_rows WHERE table_id = ?').run(tableId);
    const ins = db.prepare(
      'INSERT INTO data_table_rows (table_id, cells, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    );
    rows.forEach((cells, i) => ins.run(tableId, JSON.stringify(cells), i + 1, now(), now()));
  });
}
