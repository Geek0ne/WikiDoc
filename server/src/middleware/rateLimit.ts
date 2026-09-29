import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../types';
import { AppError } from '../utils/errors';

/**
 * 进程内滑动窗口限流。单机部署足够；多实例场景应换 Redis，当前架构未涉及。
 * 用法：router.post('/auth/login', rateLimit({ windowMs: 15*60*1000, max: 10 }), handler)
 */

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** 键的生成方式，默认按 IP */
  keyOf?: (req: AuthRequest) => string;
}

export function rateLimit(opts: RateLimitOptions) {
  const { windowMs, max } = opts;
  const keyOf = opts.keyOf || ((req: AuthRequest) => req.ip || 'unknown');

  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    const key = keyOf(req);
    const now = Date.now();
    const bucket = buckets.get(key) || { hits: [] };
    bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

    if (bucket.hits.length >= max) {
      const retryAfter = Math.ceil((windowMs - (now - bucket.hits[0])) / 1000);
      return next(new AppError(`操作过于频繁，请 ${retryAfter} 秒后再试`, 429));
    }

    bucket.hits.push(now);
    buckets.set(key, bucket);
    next();
  };
}

/** 按用户限流，未登录时退化为按 IP */
export function rateLimitByUser(opts: Omit<RateLimitOptions, 'keyOf'>) {
  return rateLimit({ ...opts, keyOf: (req) => (req.user ? `u:${req.user.id}` : `ip:${req.ip}`) });
}

/** 定期清理过期桶，防止长时间运行内存缓涨 */
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.hits.every((t) => now - t > 60 * 60 * 1000)) buckets.delete(key);
  }
}, 10 * 60 * 1000).unref();
