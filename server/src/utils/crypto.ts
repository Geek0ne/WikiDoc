import crypto from 'node:crypto';
import { config } from '../config';

/**
 * 敏感配置项加解密。LDAP 绑定密码、OIDC client secret、SMTP 密码、
 * Webhook 密钥落库前一律加密，避免数据库文件泄露即等于凭证泄露。
 * 使用 AES-256-GCM，密文格式：iv(12) : tag(16) : ciphertext(hex)。
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function deriveKey(): Buffer {
  return crypto.createHash('sha256').update(config.masterKey).digest();
}

export function encryptSetting(plain: string): string {
  if (!plain) return '';
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGORITHM, deriveKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptSetting(payload: string): string {
  if (!payload) return '';
  const parts = payload.split(':');
  if (parts.length !== 3) return '';
  try {
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const enc = Buffer.from(parts[2], 'hex');
    if (iv.length !== IV_LEN || tag.length !== TAG_LEN) return '';
    const decipher = crypto.createDecipheriv(ALGORITHM, deriveKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

/** 判断某个键是否属于敏感配置，settings 模块据此决定加解密 */
export function isSensitiveKey(key: string): boolean {
  return /^(ldap\.bindPassword|oidc\.clientSecret|smtp\.pass|notification\..*secret|webhook\.secret)$/.test(key);
}

/** 附件落盘名：随机、无扩展名，杜绝路径穿越与猜测 */
export function randomStorageKey(): string {
  return crypto.randomBytes(24).toString('hex');
}

/** refresh token 只存哈希，库泄露也无法直接换取会话 */
export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** 短 id，用于导入任务号等对外展示场景 */
export function shortId(): string {
  return crypto.randomBytes(6).toString('hex');
}
