import path from 'node:path';
import fs from 'node:fs';

/**
 * 站点运行配置。优先读环境变量，缺失项给内网可用的默认值。
 * 注意：LDAP / SMTP / 通知 / SSO 等运行期可改的配置存于 site_settings 表，
 * 不在这里硬编码，管理员在设置页修改后即时生效。
 */

function resolveDataDir(): string {
  const fromEnv = process.env.WIKIDOC_DATA_DIR;
  if (fromEnv) return path.resolve(fromEnv);
  const inDocker = fs.existsSync('/.dockerenv');
  return inDocker ? '/data' : path.resolve(process.cwd(), 'data');
}

const DATA_DIR = resolveDataDir();
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

/** 敏感配置加密主密钥，缺失时服务必须拒绝启动（见 ensureMasterKey） */
const MASTER_KEY = process.env.WIKIDOC_MASTER_KEY || '';

function randomSecret(): string {
  return require('node:crypto').randomBytes(32).toString('hex');
}

export const config = {
  env: process.env.NODE_ENV || 'production',
  port: Number(process.env.PORT || 3000),
  dataDir: DATA_DIR,
  uploadDir: UPLOAD_DIR,
  dbPath: path.join(DATA_DIR, 'wikidoc.db'),
  /** 前端构建产物目录，存在时由后端静态托管，实现单端口部署 */
  clientDist: path.resolve(process.cwd(), '../frontend/dist'),
  jwtSecret: process.env.WIKIDOC_JWT_SECRET || '',
  jwtRefreshSecret: process.env.WIKIDOC_JWT_REFRESH_SECRET || '',
  accessTokenTtl: '15m',
  refreshTokenTtlDays: 30,
  masterKey: MASTER_KEY,
  /** 反向代理后的对外地址，用于 SSO 回调与通知链接拼接 */
  publicUrl: process.env.WIKIDOC_PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`,
  cookieSecure: (process.env.WIKIDOC_COOKIE_SECURE || 'false') === 'true',
  uploadMaxBytes: 50 * 1024 * 1024,
};

export function ensureSecrets(): void {
  if (!config.jwtSecret) config.jwtSecret = randomSecret();
  if (!config.jwtRefreshSecret) config.jwtRefreshSecret = randomSecret();
}

export function ensureMasterKey(): void {
  if (!config.masterKey) {
    throw new Error(
      '缺少 WIKIDOC_MASTER_KEY 环境变量。它是敏感配置（LDAP 绑定密码、OIDC 密钥、SMTP 密码）的加密主密钥，' +
        '请设置后重启，例如：WIKIDOC_MASTER_KEY=$(openssl rand -hex 32)'
    );
  }
}

export function ensureDirs(): void {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.uploadDir, { recursive: true });
}
