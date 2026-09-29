/** 业务错误与统一错误码。业务层只抛 AppError，由 error 中间件转成响应。 */

export const ErrorCode = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export class AppError extends Error {
  public readonly status: number;
  public readonly code: number;
  public readonly details?: unknown;

  constructor(message: string, status: number = 400, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = status;
    this.details = details;
  }

  static badRequest(msg = '请求参数不合法', details?: unknown) {
    return new AppError(msg, ErrorCode.BAD_REQUEST, details);
  }
  static unauthorized(msg = '未登录或登录已失效') {
    return new AppError(msg, ErrorCode.UNAUTHORIZED);
  }
  static forbidden(msg = '没有访问该资源的权限') {
    return new AppError(msg, ErrorCode.FORBIDDEN);
  }
  static notFound(msg = '资源不存在') {
    return new AppError(msg, ErrorCode.NOT_FOUND);
  }
  static conflict(msg = '资源冲突', details?: unknown) {
    return new AppError(msg, ErrorCode.CONFLICT, details);
  }
  static tooMany(msg = '操作过于频繁，请稍后再试') {
    return new AppError(msg, ErrorCode.RATE_LIMITED);
  }
  static unavailable(msg = '依赖服务不可用') {
    return new AppError(msg, ErrorCode.SERVICE_UNAVAILABLE);
  }
}

/** 把未知异常兜底成 AppError，避免内部信息外泄 */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new AppError(message || '服务器内部错误', ErrorCode.INTERNAL);
}
