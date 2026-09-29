import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import type { NextFunction, RequestHandler } from 'express';
import type { AuthRequest } from '../types';
import { config } from '../config';
import { AppError } from './errors';

/**
 * 上传统一入口。白名单 + 大小上限 + 随机落盘名三件事只在这里做一次，
 * 附件与导入两条链路共用，避免各处各写一套导致绕过校验。
 */

/** 扩展名白名单，禁止 exe/bat/js/html 等可执行类型 */
const EXT_MIME: Record<string, string[]> = {
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.gif': ['image/gif'],
  '.webp': ['image/webp'],
  '.svg': ['image/svg+xml'],
  '.pdf': ['application/pdf'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  '.zip': ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
  '.txt': ['text/plain'],
  '.md': ['text/markdown', 'text/plain'],
  '.csv': ['text/csv', 'text/plain'],
  '.json': ['application/json', 'text/plain'],
};

/** 二进制容器类格式，客户端常报 octet-stream，单独放行 */
const OCTET_OK = new Set(['.zip', '.docx', '.xlsx', '.pptx', '.pdf']);

export const ALLOWED_EXTENSIONS = Object.keys(EXT_MIME);

export function extOf(filename: string): string {
  return path.extname(filename || '').toLowerCase();
}

export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
}

/** 校验扩展名与 MIME，返回可读错误而不是抛堆栈 */
export function assertAllowedFile(file: UploadedFileLike): void {
  const ext = extOf(file.originalname);
  if (!EXT_MIME[ext]) {
    throw AppError.badRequest(`不支持的文件类型：${ext || '未知'}，允许 ${ALLOWED_EXTENSIONS.join(' ')}`);
  }
  if (file.size <= 0) {
    throw AppError.badRequest('文件内容为空');
  }
  if (file.size > config.uploadMaxBytes) {
    throw AppError.badRequest(`文件超过 ${Math.floor(config.uploadMaxBytes / 1024 / 1024)}MB 上限`);
  }
  const allowed = EXT_MIME[ext];
  const mime = (file.mimetype || '').split(';')[0].trim().toLowerCase();
  if (mime && !allowed.includes(mime) && !(mime === 'application/octet-stream' && OCTET_OK.has(ext))) {
    throw AppError.badRequest(`文件类型与扩展名不匹配：${ext} 不接受 ${mime}`);
  }
}

const storage = multer.memoryStorage();

/** 单文件上传，50MB 上限，内存暂存后由 service 决定落盘方式 */
export const uploadSingle = multer({
  storage,
  limits: { fileSize: config.uploadMaxBytes, files: 1, fields: 10 },
}).single('file');

/** 导入专用：只接受 docx / xlsx，且同样受 50MB 限制 */
export const uploadImport = multer({
  storage,
  limits: { fileSize: config.uploadMaxBytes, files: 1, fields: 10 },
  fileFilter: (_req, file, cb) => {
    const ext = extOf(file.originalname);
    if (ext !== '.docx' && ext !== '.xlsx' && ext !== '.md') {
      cb(AppError.badRequest('导入仅支持 .docx / .xlsx / .md 文件'));
      return;
    }
    cb(null, true);
  },
}).single('file');

/** 把 multer 的底层错误翻译成人话，避免前端看到 LIMIT_FILE_SIZE */
function translate(err: unknown): AppError {
  const code = (err as { code?: string }).code;
  if (code === 'LIMIT_FILE_SIZE') {
    return AppError.badRequest(`文件超过 ${Math.floor(config.uploadMaxBytes / 1024 / 1024)}MB 上限`);
  }
  if (err instanceof AppError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return AppError.badRequest(`文件上传失败：${message}`);
}

export function withUploadError(mw: RequestHandler): RequestHandler {
  return (req, res, next: NextFunction) => {
    mw(req, res, (err?: unknown) => {
      if (err) {
        next(translate(err));
        return;
      }
      next();
    });
  };
}

/** 落盘：目录不存在时创建，文件名由调用方给出（应来自 randomStorageKey） */
export function writeStorageFile(storageKey: string, buffer: Buffer): string {
  fs.mkdirSync(config.uploadDir, { recursive: true });
  const target = path.join(config.uploadDir, storageKey);
  fs.writeFileSync(target, buffer);
  return target;
}

export function storagePathOf(storageKey: string): string {
  return path.join(config.uploadDir, storageKey);
}

export function removeStorageFile(storageKey: string): void {
  try {
    fs.unlinkSync(storagePathOf(storageKey));
  } catch {
    // 文件已不存在时无需处理，元数据仍然要清理
  }
}

/** 从请求里取已上传文件，缺失时给统一错误 */
export function requireUploadedFile(req: AuthRequest): Express.Multer.File {
  const file = req.file as Express.Multer.File | undefined;
  if (!file) throw AppError.badRequest('缺少上传文件，字段名应为 file');
  return file;
}
