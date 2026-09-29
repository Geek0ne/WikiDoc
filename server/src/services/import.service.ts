import mammoth from 'mammoth';
import TurndownService from 'turndown';
import ExcelJS from 'exceljs';
import { db, getOne, getMany, now } from '../db';
import { AppError } from '../utils/errors';
import { shortId } from '../utils/crypto';
import { hasPermission } from './permission.service';
import { recordAudit, AuditAction } from './audit.service';
import { createDocument } from './document.service';
import { attachBufferToDocument } from './attachment.service';
import { bulkFillTable, type DataTableColumn } from './datatable.service';
import { indexDocument } from '../search/indexer';
import type { User } from '../types';

/**
 * 导入服务：.md 直接入库；.docx 经 mammoth(HTML) + turndown(Markdown)，
 * 内嵌图片落为附件后改写引用；.xlsx 每个工作表转为一张多维表格挂到新文档。
 *
 * 导入为异步任务：创建 import_jobs 记录后 setImmediate 处理，
 * 前端凭 job_no 轮询状态（内网单机，不做队列中间件）。
 */

export interface ImportJobRow {
  id: number;
  job_no: string;
  source_type: 'docx' | 'xlsx' | 'markdown';
  filename: string;
  target_space_id: number | null;
  status: 'pending' | 'running' | 'success' | 'failed';
  total: number;
  processed: number;
  result: string | null;
  error: string | null;
  created_by: number;
  created_at: string;
  finished_at: string | null;
}

export interface ImportOptions {
  target_space_id: number;
  parent_id?: number | null;
  status?: 'draft' | 'published';
}

const IMG_PLACEHOLDER = /WIKIDOC_IMG_(\d+)/g;

function turndownWithTables(): TurndownService {
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
  td.addRule('wikidocTable', {
    filter: ['table'],
    replacement: (_content, node) => {
      interface DomNode {
        querySelectorAll: (sel: string) => DomNode[];
        textContent: string | null;
      }
      const el = node as unknown as DomNode;
      const trs = el.querySelectorAll('tr');
      const rows: string[][] = [];
      for (const tr of trs) {
        const cells = tr.querySelectorAll('th,td').map(
          (c) => (c.textContent || '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim() || ' '
        );
        if (cells.length) rows.push(cells);
      }
      if (!rows.length) return '';
      const width = Math.max(...rows.map((r) => r.length));
      const norm = rows.map((r) => {
        const copy = [...r];
        while (copy.length < width) copy.push(' ');
        return copy.slice(0, width);
      });
      const lines = [
        `| ${norm[0].join(' | ')} |`,
        `| ${Array.from({ length: width }, () => '---').join(' | ')} |`,
        ...norm.slice(1).map((r) => `| ${r.join(' | ')} |`),
      ];
      return `\n\n${lines.join('\n')}\n\n`;
    },
  });
  return td;
}

function extToSourceType(filename: string): ImportJobRow['source_type'] | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.xlsx')) return 'xlsx';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown';
  return null;
}

function titleFromFilename(filename: string): string {
  return filename.replace(/\.(docx|xlsx|md|markdown)$/i, '').trim() || '导入文档';
}

function titleFromHtml(html: string, fallback: string): string {
  const m = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (!m) return fallback;
  return (m[1].replace(/<[^>]+>/g, '').trim() || fallback).slice(0, 120);
}

export function createImportJob(
  actor: User,
  groupIds: number[],
  file: { originalname: string; size: number; buffer: Buffer },
  options: ImportOptions
): ImportJobRow {
  const sourceType = extToSourceType(file.originalname);
  if (!sourceType) throw AppError.badRequest('导入仅支持 .docx / .xlsx / .md 文件');
  if (!hasSpaceWrite(actor, groupIds, options.target_space_id)) {
    throw AppError.forbidden('没有目标空间的写入权限');
  }

  const jobNo = `IMP-${Date.now().toString(36)}-${shortId()}`;
  const info = db
    .prepare(
      `INSERT INTO import_jobs (job_no, source_type, filename, target_space_id, status, created_by, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`
    )
    .run(jobNo, sourceType, file.originalname, options.target_space_id, actor.id, now());
  const jobId = Number(info.lastInsertRowid);

  // 异步处理，错误只落任务记录不炸请求
  setImmediate(() => {
    void processImport(jobId, actor, file, options).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      db.prepare(
        "UPDATE import_jobs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?"
      ).run(message, now(), jobId);
    });
  });

  recordAudit({
    userId: actor.id,
    username: actor.username,
    action: AuditAction.IMPORT,
    detail: `提交导入任务 ${jobNo}（${file.originalname}）`,
  });
  return getJobByNo(jobNo)!;
}

function hasSpaceWrite(actor: User, groupIds: number[], spaceId: number): boolean {
  // 延迟引入避免与 permission.service 形成导入环
  const { resolveSpacePermission } = require('./permission.service') as {
    resolveSpacePermission: (u: number, g: number[], s: number) => number | null;
  };
  const p = resolveSpacePermission(actor.id, groupIds, spaceId);
  return p !== null && p >= 2;
}

async function processImport(
  jobId: number,
  actor: User,
  file: { originalname: string; size: number; buffer: Buffer },
  options: ImportOptions
): Promise<void> {
  db.prepare("UPDATE import_jobs SET status = 'running' WHERE id = ?").run(jobId);
  const job = getOne<{ source_type: ImportJobRow['source_type']; filename: string }>(
    'SELECT source_type, filename FROM import_jobs WHERE id = ?',
    [jobId]
  );
  if (!job) throw new Error('任务记录丢失');

  let result: Record<string, unknown>;
  if (job.source_type === 'markdown') {
    result = await importMarkdown(actor, file, options);
    db.prepare('UPDATE import_jobs SET total = 1, processed = 1 WHERE id = ?').run(jobId);
  } else if (job.source_type === 'docx') {
    result = await importDocx(actor, file, options, jobId);
  } else {
    result = await importXlsx(actor, file, options, jobId);
  }

  db.prepare(
    "UPDATE import_jobs SET status = 'success', result = ?, finished_at = ? WHERE id = ?"
  ).run(JSON.stringify(result), now(), jobId);
}

async function importMarkdown(
  actor: User,
  file: { originalname: string; buffer: Buffer },
  options: ImportOptions
): Promise<Record<string, unknown>> {
  const md = file.buffer.toString('utf8');
  const heading = /^#\s+(.+)$/m.exec(md);
  const doc = createDocument(actor, [], {
    space_id: options.target_space_id,
    parent_id: options.parent_id ?? null,
    title: heading ? heading[1].trim().slice(0, 120) : titleFromFilename(file.originalname),
    content_md: md,
    status: options.status ?? 'published',
  });
  return { document_id: doc.id, warnings: [] };
}

async function importDocx(
  actor: User,
  file: { originalname: string; buffer: Buffer },
  options: ImportOptions,
  jobId: number
): Promise<Record<string, unknown>> {
  const warnings: string[] = [];
  const images: { buffer: Buffer; contentType: string }[] = [];

  const converted = await mammoth.convertToHtml(
    { buffer: file.buffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const buf = await image.readAsBuffer();
        const idx = images.push({ buffer: buf, contentType: image.contentType || 'image/png' }) - 1;
        return { src: `WIKIDOC_IMG_${idx}` };
      }),
    }
  );
  for (const m of converted.messages.slice(0, 20)) {
    if (m.type === 'warning') warnings.push(m.message);
  }

  const markdown = turndownWithTables().turndown(converted.value);
  const title = titleFromHtml(converted.value, titleFromFilename(file.originalname));
  const doc = createDocument(actor, [], {
    space_id: options.target_space_id,
    parent_id: options.parent_id ?? null,
    title,
    content_md: markdown,
    status: options.status ?? 'published',
  });

  // 图片落为附件并改写引用
  let imageCount = 0;
  let md = markdown;
  for (let i = 0; i < images.length; i += 1) {
    const att = attachBufferToDocument(
      actor.id,
      doc.id,
      `image-${i + 1}.${(images[i].contentType.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '')}`,
      images[i].contentType,
      images[i].buffer
    );
    const url = `/api/attachments/${att.id}/raw`;
    md = md.replace(new RegExp(`WIKIDOC_IMG_${i}`, 'g'), url);
    imageCount += 1;
    db.prepare('UPDATE import_jobs SET processed = ? WHERE id = ?').run(imageCount, jobId);
  }
  if (imageCount > 0) {
    db.prepare('UPDATE documents SET content_md = ?, updated_at = ? WHERE id = ?').run(md, now(), doc.id);
    indexDocument(doc.id, doc.title, md);
  }

  db.prepare('UPDATE import_jobs SET total = ? WHERE id = ?').run(images.length, jobId);
  return { document_id: doc.id, images: imageCount, warnings };
}

async function importXlsx(
  actor: User,
  file: { originalname: string; buffer: Buffer },
  options: ImportOptions,
  jobId: number
): Promise<Record<string, unknown>> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file.buffer as unknown as ArrayBuffer);

  // 先建一篇说明文档作为挂载点
  const doc = createDocument(actor, [], {
    space_id: options.target_space_id,
    parent_id: options.parent_id ?? null,
    title: titleFromFilename(file.originalname),
    content_md: `# ${titleFromFilename(file.originalname)}\n\n> 由 Excel 导入，共 ${workbook.worksheets.length} 个工作表。\n`,
    status: options.status ?? 'published',
  });

  const sheetNames: string[] = [];
  const warnings: string[] = [];
  let rowIndex = 0;

  for (const sheet of workbook.worksheets) {
    if (sheet.rowCount === 0) {
      warnings.push(`工作表「${sheet.name}」为空，已跳过`);
      continue;
    }
    const headerRow = sheet.getRow(1);
    const columns: DataTableColumn[] = [];
    headerRow.eachCell((cell, colNumber) => {
      const title = String(cell.value ?? '').trim() || `列${colNumber}`;
      columns.push({ key: `c${colNumber}`, title, type: 'text' });
    });
    if (!columns.length) {
      warnings.push(`工作表「${sheet.name}」无表头，已跳过`);
      continue;
    }

    const rows: Record<string, unknown>[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const cells: Record<string, unknown> = {};
      let hasValue = false;
      columns.forEach((col, i) => {
        const cell = row.getCell(i + 1);
        const value = cell.value;
        let out: unknown = null;
        if (value !== null && value !== undefined && typeof value !== 'object') out = value;
        else if (value && typeof value === 'object' && 'richText' in (value as object)) {
          out = (value as { richText: { text: string }[] }).richText.map((t) => t.text).join('');
        } else if (value && typeof value === 'object' && 'result' in (value as object)) {
          out = (value as { result: unknown }).result;
        } else if (value instanceof Date) {
          out = value.toISOString().slice(0, 10);
        }
        cells[col.key] = out;
        if (out !== null && out !== '') hasValue = true;
      });
      if (hasValue) rows.push(cells);
      rowIndex += 1;
      if (rowIndex % 50 === 0) {
        db.prepare('UPDATE import_jobs SET processed = ? WHERE id = ?').run(rowIndex, jobId);
      }
    });

    const created = db
      .prepare(
        'INSERT INTO data_tables (document_id, name, columns, author_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(doc.id, sheet.name, JSON.stringify(columns), actor.id, now(), now());
    bulkFillTable(Number(created.lastInsertRowid), columns, rows);
    sheetNames.push(sheet.name);
  }

  db.prepare('UPDATE import_jobs SET total = ? WHERE id = ?').run(Math.max(rowIndex, 1), jobId);
  return { document_id: doc.id, sheets: sheetNames, warnings };
}

// ---------------------------------------------------------------------------
// 任务查询
// ---------------------------------------------------------------------------

function getJobByNo(jobNo: string): ImportJobRow | null {
  return getOne<ImportJobRow>('SELECT * FROM import_jobs WHERE job_no = ?', [jobNo]);
}

export function getImportJob(actor: User, jobNo: string): ImportJobRow {
  const job = getJobByNo(jobNo);
  if (!job) throw AppError.notFound('导入任务不存在');
  if (job.created_by !== actor.id && !actor.is_admin) throw AppError.forbidden();
  return job;
}

export function listImportJobs(actor: User, limit = 20): ImportJobRow[] {
  const where = actor.is_admin === 1 ? '' : 'WHERE created_by = ?';
  const params = actor.is_admin === 1 ? [] : [actor.id];
  return getMany<ImportJobRow>(
    `SELECT * FROM import_jobs ${where} ORDER BY id DESC LIMIT ?`,
    [...params, limit]
  );
}
