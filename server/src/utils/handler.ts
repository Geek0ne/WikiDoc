import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AuthRequest } from '../types';

/**
 * 路由处理器包装：统一 AuthRequest 类型转换 + async 异常捕获。
 * Express 4 不会自动捕获 Promise rejection，所有 async handler 必须经 h() 包装。
 */

type AuthedHandler = (req: AuthRequest, res: Response, next: NextFunction) => unknown;

export function h(fn: AuthedHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const out = fn(req as AuthRequest, res, next);
      if (out instanceof Promise) out.catch(next);
    } catch (err) {
      next(err);
    }
  };
}
