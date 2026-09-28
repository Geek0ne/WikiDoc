import { db, getMany, now } from '../db';
import { decryptSetting, encryptSetting, isSensitiveKey } from '../utils/crypto';

/**
 * 站点配置读写。LDAP / OIDC / SMTP / 站点外观 / 登录方式等运行期可改的配置
 * 全部落在 site_settings 表，管理员在设置页改完即时生效，不需要重启进程。
 *
 * 敏感键（LDAP 绑定密码、OIDC 密钥、SMTP 密码、webhook 密钥）落库前用
 * AES-256-GCM 加密，读出时解密；对外接口只返回掩码，见 maskSensitive。
 */

/** 前端填写掩码时表示"不修改"，写入阶段跳过该键 */
export const SECRET_MASK = '***';

export interface LdapConfig {
  enabled: boolean;
  url: string;
  /** 用户搜索根，同时作为组搜索根的缺省值 */
  baseDn: string;
  bindDn: string;
  bindPassword: string;
  userFilter: string;
  groupFilter: string;
  allowLocalFallback: boolean;
  timeoutMs: number;
}

export interface OidcConfig {
  enabled: boolean;
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export interface PublicSettings {
  siteName: string;
  defaultLocale: string;
  availableLocales: string[];
  themes: string[];
  loginProviders: { local: boolean; ldap: boolean; oidc: boolean; oidcName: string };
}

const THEMES = [
  'graphite-light',
  'graphite-dark',
  'inkgreen-light',
  'inkgreen-dark',
  'slate-light',
  'slate-dark',
];

const LOCALES = ['zh-CN', 'en-US'];

const DEFAULTS: Record<string, string> = {
  'site.name': 'WikiDoc',
  'site.description': '企业知识库',
  'site.locale': 'zh-CN',
  'site.theme': 'graphite-light',
  'site.allowRegistration': 'false',
  'auth.localEnabled': 'true',
  'auth.allowLocalFallback': 'true',
  'ldap.enabled': 'false',
  'ldap.url': 'ldap://127.0.0.1:389',
  'ldap.baseDn': '',
  'ldap.bindDn': '',
  'ldap.bindPassword': '',
  'ldap.userFilter': '(sAMAccountName={{username}})',
  'ldap.groupFilter': '(objectClass=group)',
  'ldap.timeoutMs': '8000',
  'oidc.enabled': 'false',
  'oidc.issuer': '',
  'oidc.clientId': '',
  'oidc.clientSecret': '',
  'oidc.redirectUri': '',
  'oidc.scope': 'openid profile email',
  'oidc.name': 'SSO',
  'smtp.host': '',
  'smtp.port': '465',
  'smtp.secure': 'true',
  'smtp.user': '',
  'smtp.pass': '',
  'smtp.from': '',
};

function decode(key: string, stored: string | undefined): string {
  const raw = stored ?? DEFAULTS[key] ?? '';
  // 早期版本或手工写入可能留下明文，解密失败时退回原文而不是空串
  if (!isSensitiveKey(key)) return raw;
  const plain = decryptSetting(raw);
  return plain || (looksEncrypted(raw) ? '' : raw);
}

function looksEncrypted(value: string): boolean {
  return /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]*$/.test(value);
}

function asBool(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1';
}

function asInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
}

/** 单个配置键，缺失时返回内置默认值 */
export function getSetting(key: string): string {
  const rows = getMany<{ value: string }>('SELECT value FROM site_settings WHERE key = ?', [key]);
  return decode(key, rows[0]?.value);
}

/** 批量取配置。不传 keys 时返回默认值与库中值的并集 */
export function getSettings(keys?: string[]): Record<string, string> {
  const stored = new Map(
    getMany<{ key: string; value: string }>('SELECT key, value FROM site_settings').map((r) => [
      r.key,
      r.value,
    ])
  );

  const out: Record<string, string> = {};
  if (keys && keys.length > 0) {
    for (const key of keys) out[key] = decode(key, stored.get(key));
    return out;
  }
  for (const key of new Set([...Object.keys(DEFAULTS), ...stored.keys()])) {
    out[key] = decode(key, stored.get(key));
  }
  return out;
}

/**
 * 合并写入。敏感键自动加密；值为掩码 SECRET_MASK 的敏感键跳过，
 * 避免前端回传脱敏值把真实密钥覆盖成星号。
 */
export function setSettings(patch: Record<string, string>): void {
  const update = db.prepare(
    `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  );

  db.transaction(() => {
    for (const [key, rawValue] of Object.entries(patch)) {
      if (!key || typeof rawValue !== 'string') continue;
      if (isSensitiveKey(key) && rawValue === SECRET_MASK) continue;
      const stored = isSensitiveKey(key) ? encryptSetting(rawValue) : rawValue;
      update.run(key, stored, now());
    }
  })();
}

/** 把敏感值替换成掩码，供管理端接口返回 */
export function maskSensitive(settings: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings)) {
    out[key] = isSensitiveKey(key) ? (value ? SECRET_MASK : '') : value;
  }
  return out;
}

export function getLdapConfig(): LdapConfig {
  const s = getSettings([
    'ldap.enabled',
    'ldap.url',
    'ldap.baseDn',
    'ldap.bindDn',
    'ldap.bindPassword',
    'ldap.userFilter',
    'ldap.groupFilter',
    'ldap.timeoutMs',
    'auth.allowLocalFallback',
  ]);
  return {
    enabled: asBool(s['ldap.enabled']),
    url: s['ldap.url'],
    baseDn: s['ldap.baseDn'],
    bindDn: s['ldap.bindDn'],
    bindPassword: s['ldap.bindPassword'],
    userFilter: s['ldap.userFilter'] || DEFAULTS['ldap.userFilter'],
    groupFilter: s['ldap.groupFilter'] || DEFAULTS['ldap.groupFilter'],
    allowLocalFallback: asBool(s['auth.allowLocalFallback'], true),
    timeoutMs: asInt(s['ldap.timeoutMs'], 8000),
  };
}

export function getOidcConfig(): OidcConfig {
  const s = getSettings([
    'oidc.enabled',
    'oidc.issuer',
    'oidc.clientId',
    'oidc.clientSecret',
    'oidc.redirectUri',
    'oidc.scope',
  ]);
  return {
    enabled: asBool(s['oidc.enabled']),
    issuer: s['oidc.issuer'],
    clientId: s['oidc.clientId'],
    clientSecret: s['oidc.clientSecret'],
    redirectUri: s['oidc.redirectUri'],
    scope: s['oidc.scope'] || DEFAULTS['oidc.scope'],
  };
}

export function getSmtpConfig(): SmtpConfig {
  const s = getSettings([
    'smtp.host',
    'smtp.port',
    'smtp.secure',
    'smtp.user',
    'smtp.pass',
    'smtp.from',
  ]);
  return {
    host: s['smtp.host'],
    port: asInt(s['smtp.port'], 465),
    secure: asBool(s['smtp.secure'], true),
    user: s['smtp.user'],
    pass: s['smtp.pass'],
    from: s['smtp.from'] || s['smtp.user'],
  };
}

/** 免登录可见的站点信息，登录页在渲染前就要拿到主题与登录方式 */
export function getPublicSettings(): PublicSettings {
  const s = getSettings([
    'site.name',
    'site.locale',
    'auth.localEnabled',
    'ldap.enabled',
    'oidc.enabled',
    'oidc.name',
  ]);
  return {
    siteName: s['site.name'] || DEFAULTS['site.name'],
    defaultLocale: s['site.locale'] || DEFAULTS['site.locale'],
    availableLocales: LOCALES,
    themes: THEMES,
    loginProviders: {
      local: asBool(s['auth.localEnabled'], true),
      ldap: asBool(s['ldap.enabled']),
      oidc: asBool(s['oidc.enabled']),
      oidcName: s['oidc.name'] || DEFAULTS['oidc.name'],
    },
  };
}
