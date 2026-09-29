import type { Response } from 'express';
import type { ApiResponse, Paged } from '../types';

/**
 * 统一响应包装。全站一致：{ code, data, message }
 * code = 0 表示成功，其余沿用 HTTP 状态码。
 */

export function ok<T>(res: Response, data: T | null = null, message = 'success'): Response {
  const body: ApiResponse<T> = { code: 0, data, message };
  return res.json(body);
}

export function created<T>(res: Response, data: T, message = '创建成功'): Response {
  return res.status(201).json({ code: 0, data, message } as ApiResponse<T>);
}

export function fail(res: Response, status: number, message: string, details?: unknown): Response {
  return res.status(status).json({ code: status, data: null, message, ...(details ? { details } : {}) });
}

export function paged<T>(res: Response, result: Paged<T>, message = 'success'): Response {
  return res.json({ code: 0, data: result, message } as ApiResponse<Paged<T>>);
}

/** 把 (items, total, page, limit) 组装成分页结构 */
export function buildPaged<T>(items: T[], total: number, page: number, limit: number): Paged<T> {
  return {
    items,
    total,
    page,
    limit,
    hasMore: page * limit < total,
  };
}

/** 解析并收敛分页参数，避免恶意传入超大 limit */
export function parsePaging(query: Record<string, unknown>, defaultLimit = 20, maxLimit = 100) {
  const page = Math.max(1, Number(query.page) || 1);
  const rawLimit = Number(query.limit) || defaultLimit;
  const limit = Math.min(Math.max(1, rawLimit), maxLimit);
  return { page, limit, offset: (page - 1) * limit };
}
