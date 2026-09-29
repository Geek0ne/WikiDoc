import type { NextFunction, Request, Response } from 'express';
import { AppError, toAppError } from '../utils/errors';
import { isSensitiveKey } from '../utils/crypto';

/**
 * 统一错误处理。业务抛 AppError 走预期分支，其余异常兜底 500 且不外泄堆栈。
 * 同时在这里做一次 SQLITE_BUSY 的友好翻译，避免用户看到数据库术语。
 */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const appErr = toAppError(err);

  if (!(err instanceof AppError)) {
    // eslint-disable-next-line no-console
    console.error('[unhandled]', err);
  }

  let message = appErr.message;
  if (/SQLITE_BUSY/.test(message)) message = '数据库忙，请稍后重试';
  if (/SQLITE_CONSTRAINT/.test(message) && /UNIQUE/.test(message)) message = '该记录已存在，请勿重复提交';

  if (res.headersSent) return;
  res.status(appErr.status || 500).json({
    code: appErr.code || 500,
    data: null,
    message,
  });
}

/** 404 兜底，API 与页面分别给不同形态 */
export function notFoundHandler(req: Request, res: Response): void {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ code: 404, data: null, message: `接口不存在: ${req.method} ${req.path}` });
    return;
  }
  res.status(404).json({ code: 404, data: null, message: '页面不存在' });
}

export { isSensitiveKey };
