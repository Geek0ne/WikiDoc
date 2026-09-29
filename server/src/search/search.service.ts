import { db, getMany } from '../db';
import {
  buildMatchExpression,
  shouldFallbackToLike,
  buildSnippet,
  escapeLike,
  tokenize,
} from './segment';
import { resolveDocPermission } from '../services/permission.service';
import type { User } from '../types';

/**
 * 全文检索。链路：
 *   1. 查询词经 segment.ts bigram 分词构造 FTS5 MATCH（多词 AND）；
 *   2. 单字/无效词退化为 LIKE 兜底；
 *   3. 候选按 bm25（标题加权）排序，上限 500 条；
 *   4. 权限过滤在应用层逐条 resolve，保证 ACL/继承/可见性语义一致；
 *   5. 摘要用 buildSnippet 从 content_text 原文截取（禁用 FTS5 snippet，
 *      原因见 segment.ts 头注释）。
 */

const CANDIDATE_LIMIT = 500;

export interface SearchScope {
  query: string;
  spaceId?: number;
  scope: 'all' | 'title' | 'body' | 'code';
  page: number;
  limit: number;
}

export interface SearchHit {
  id: number;
  space_id: number;
  space_name: string;
  title: string;
  snippet: string;
  status: string;
  updated_at: string;
  score: number;
}

export interface SearchOutcome {
  items: SearchHit[];
  total: number;
  page: number;
  limit: number;
  fallback: boolean;
}

interface CandidateRow {
  doc_id: number;
  score: number;
}

function columnFilterExpr(matchExpr: string, scope: SearchScope['scope']): string {
  if (scope === 'title') return `title : (${matchExpr})`;
  if (scope === 'body') return `body : (${matchExpr})`;
  if (scope === 'code') return `code : (${matchExpr})`;
  return matchExpr;
}

/** 候选集：FTS MATCH 或 LIKE 兜底。只筛"未删除"，权限过滤交给调用方 */
function fetchCandidates(q: SearchScope): { rows: CandidateRow[]; fallback: boolean } {
  const raw = q.query.trim();
  if (q.scope !== 'all') {
    const matchExpr = buildMatchExpression(raw);
    if (matchExpr) {
      const rows = db
        .prepare(
          `SELECT doc_id, bm25(doc_search) AS score FROM doc_search
           WHERE doc_search MATCH ? ORDER BY score LIMIT ?`
        )
        .all(columnFilterExpr(matchExpr, q.scope), CANDIDATE_LIMIT) as CandidateRow[];
      return { rows, fallback: false };
    }
    const like = `%${escapeLike(raw.toLowerCase())}%`;
    const col = q.scope === 'title' ? 'title' : q.scope === 'code' ? 'code' : 'body';
    const rows = db
      .prepare(`SELECT doc_id, -1 AS score FROM doc_search WHERE ${col} LIKE ? LIMIT ?`)
      .all(like, CANDIDATE_LIMIT) as CandidateRow[];
    return { rows, fallback: true };
  }

  if (!shouldFallbackToLike(raw)) {
    const matchExpr = buildMatchExpression(raw)!;
    const rows = db
      .prepare(
        `SELECT doc_id, bm25(doc_search, 10.0, 3.0, 1.0) AS score FROM doc_search
         WHERE doc_search MATCH ? ORDER BY score LIMIT ?`
      )
      .all(matchExpr, CANDIDATE_LIMIT) as CandidateRow[];
    return { rows, fallback: false };
  }

  // LIKE 兜底：单字中文、纯符号等场景
  const like = `%${escapeLike(raw.toLowerCase())}%`;
  const rows = db
    .prepare(
      `SELECT doc_id, -1 AS score FROM doc_search
       WHERE title LIKE ? OR body LIKE ? OR code LIKE ? LIMIT ?`
    )
    .all(like, like, like, CANDIDATE_LIMIT) as CandidateRow[];
  return { rows, fallback: true };
}

/** 摘要：多 token 查询时逐 token 找最早命中位置（buildSnippet 只认完整串） */
function makeSnippet(text: string | null, rawQuery: string): string {
  const body = text || '';
  if (!rawQuery.trim()) return body.slice(0, 80);
  if (body.toLowerCase().includes(rawQuery.trim().toLowerCase())) {
    return buildSnippet(body, rawQuery);
  }
  for (const token of tokenize(rawQuery)) {
    const idx = body.toLowerCase().indexOf(token.toLowerCase());
    if (idx >= 0) {
      const start = Math.max(0, idx - 30);
      return `${start > 0 ? '…' : ''}${body.slice(start, idx + 60).trim()}…`;
    }
  }
  return body.slice(0, 80);
}

export function searchDocuments(
  user: User,
  groupIds: number[],
  q: SearchScope
): SearchOutcome {
  const raw = q.query.trim();
  if (!raw) {
    return { items: [], total: 0, page: q.page, limit: q.limit, fallback: false };
  }

  const { rows, fallback } = fetchCandidates(q);
  const isAdmin = user.is_admin === 1;

  // 候选 → 权限过滤 → 元信息
  const hits: SearchHit[] = [];
  for (const row of rows) {
    if (!isAdmin && (resolveDocPermission(user.id, groupIds, row.doc_id) ?? 0) < 1) continue;
    const doc = getDocMeta(row.doc_id);
    if (!doc) continue;
    if (q.spaceId !== undefined && doc.space_id !== q.spaceId) continue;
    hits.push({
      id: doc.id,
      space_id: doc.space_id,
      space_name: doc.space_name,
      title: doc.title,
      snippet: makeSnippet(doc.content_text, raw),
      status: doc.status,
      updated_at: doc.updated_at,
      score: row.score,
    });
  }

  const total = hits.length;
  const start = (q.page - 1) * q.limit;
  return {
    items: hits.slice(start, start + q.limit),
    total,
    page: q.page,
    limit: q.limit,
    fallback,
  };
}

interface DocMeta {
  id: number;
  space_id: number;
  space_name: string;
  title: string;
  content_text: string | null;
  status: string;
  updated_at: string;
}

function getDocMeta(docId: number): DocMeta | null {
  const row = db
    .prepare(
      `SELECT d.id, d.space_id, s.name AS space_name, d.title, d.content_text, d.status, d.updated_at
       FROM documents d JOIN spaces s ON s.id = d.space_id
       WHERE d.id = ? AND d.deleted_at IS NULL`
    )
    .get(docId) as DocMeta | undefined;
  return row ?? null;
}

/** 全局搜索框的联想：标题前缀/包含匹配，最多 8 条 */
export function suggestTitles(
  user: User,
  groupIds: number[],
  query: string
): { id: number; title: string; space_name: string }[] {
  const raw = query.trim();
  if (!raw) return [];
  const like = `%${escapeLike(raw)}%`;
  const rows = getMany<{ id: number; title: string; space_name: string }>(
    `SELECT d.id, d.title, s.name AS space_name FROM documents d
     JOIN spaces s ON s.id = d.space_id
     WHERE d.deleted_at IS NULL AND d.title LIKE ?
     ORDER BY d.updated_at DESC LIMIT 30`,
    [like]
  );
  const out: { id: number; title: string; space_name: string }[] = [];
  for (const r of rows) {
    if ((resolveDocPermission(user.id, groupIds, r.id) ?? 0) < 1) continue;
    out.push(r);
    if (out.length >= 8) break;
  }
  return out;
}
