/**
 * API 客户端。
 *
 * 鉴权模型（与服务端 auth.middleware 对齐）：
 *  - access token 随登录/刷新响应体返回，前端保存在内存 + localStorage，
 *    每个请求通过 Authorization: Bearer 携带；
 *  - refresh token 存 httpOnly cookie（path=/api/auth），credentials: 'include'；
 *  - 图片等 <img> 场景无法携带请求头，登录后把 access token 同步写入
 *    同名 access_token cookie，服务端 readAccessToken 会兜底读取；
 *  - 收到 401 时用单飞（single-flight）Promise 调一次 /api/auth/refresh，
 *    成功后重放原请求；刷新失败清空本地态并跳转登录页，绝不循环重试。
 */

const TOKEN_KEY = 'wikidoc.token';

export class ApiError extends Error {
  status: number;
  code: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = status;
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    // 写入非 httpOnly cookie 供 <img>/下载等原生请求使用，生命周期与 token 一致
    document.cookie = `access_token=${token}; path=/; SameSite=Lax`;
  } catch {
    /* 忽略存储异常（隐私模式等） */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 忽略 */
  }
  document.cookie = 'access_token=; path=/; Max-Age=0';
}

/** 会话失效后的外跳处理，由 store 注册，避免 client 反向依赖 store 造成循环 */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

/** 单飞刷新：并发多个 401 只触发一次 refresh 请求 */
let refreshInFlight: Promise<boolean> | null = null;

async function singleFlightRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        });
        if (!res.ok) return false;
        const body = (await res.json()) as { code: number; data: { accessToken: string } | null };
        if (body.code !== 0 || !body.data?.accessToken) return false;
        setToken(body.data.accessToken);
        return true;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** JSON 请求体；与 formData 互斥 */
  body?: unknown;
  /** multipart 表单（上传场景），不设置 Content-Type 交给浏览器带边界 */
  formData?: FormData;
  /** 401 时不尝试刷新重放（用于登录、刷新本身等裸接口） */
  skipRefresh?: boolean;
  signal?: AbortSignal;
}

/** 解包 { code, data, message } 统一响应；code!==0 抛 ApiError */
async function parseResponse<T>(res: Response): Promise<T> {
  let payload: { code: number; data: T | null; message?: string };
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    throw new ApiError(res.status, `响应解析失败（HTTP ${res.status}）`);
  }
  if (payload.code !== 0) {
    throw new ApiError(res.status, payload.message || `请求失败（${payload.code}）`);
  }
  return payload.data as T;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, formData, skipRefresh, signal } = options;

  const doFetch = (): Promise<Response> => {
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    let requestBody: BodyInit | undefined;
    if (formData) {
      requestBody = formData;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      requestBody = JSON.stringify(body);
    }
    return fetch(path, {
      method,
      headers,
      body: requestBody,
      credentials: 'include',
      signal,
    });
  };

  let res = await doFetch();

  // 401 → 尝试刷新一次并重放；刷新失败走登出回调，不循环
  if (res.status === 401 && !skipRefresh) {
    const refreshed = await singleFlightRefresh();
    if (refreshed) {
      res = await doFetch();
    } else {
      clearToken();
      onUnauthorized?.();
      throw new ApiError(401, '登录状态已失效，请重新登录');
    }
  }

  return parseResponse<T>(res);
}

/** 下载二进制（附件）：凭 cookie/Bearer 拉取 blob */
export async function requestBlob(path: string): Promise<Blob> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { headers, credentials: 'include' });
  if (!res.ok) throw new ApiError(res.status, '下载失败');
  return res.blob();
}
