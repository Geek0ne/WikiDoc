import nodemailer from 'nodemailer';
import type { SmtpConfig } from '../services/settings.service';

/**
 * 三通道投递实现：企业微信群机器人、飞书自定义机器人、SMTP 邮件。
 * 三者都是标准协议，无需 SDK。每个函数只做一件事：把通知内容发出去，
 * 失败时抛带可读原因的 Error，由上层 notify.service 统一记录日志。
 *
 * 所有外部调用都带超时（默认 8 秒），内网代理不可达时快速失败，
 * 不让请求线程挂住。
 */

export interface NotifyPayload {
  title: string;
  summary: string;
  url?: string;
  actorName: string;
}

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_CONTENT = 3500;

function clip(text: string, max: number): string {
  const value = (text || '').trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** 统一处理 webhook 响应：HTTP 200 不代表成功，机器人会在 body 里带错误码 */
async function postJson(url: string, body: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new Error(`请求失败：${describe(err)}`);
  }

  const raw = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(`服务端返回 ${res.status}：${clip(raw, 200)}`);
  }

  let parsed: { errcode?: number; code?: number; StatusCode?: number; msg?: string; errmsg?: string } = {};
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    // 部分网关返回纯文本 ok，视为成功
    return;
  }

  const bizCode = parsed.errcode ?? parsed.code ?? parsed.StatusCode ?? 0;
  if (bizCode !== 0) {
    throw new Error(`接口返回错误 ${bizCode}：${parsed.errmsg || parsed.msg || raw.slice(0, 200)}`);
  }
}

function describe(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') return '连接超时';
    const cause = (err as { cause?: { code?: string } }).cause;
    if (cause?.code) return `${err.message}（${cause.code}）`;
    return err.message;
  }
  return String(err);
}

export async function sendWecom(webhook: string, payload: NotifyPayload): Promise<void> {
  if (!webhook) throw new Error('企业微信 webhook 地址为空');
  const lines = [
    `**${clip(payload.title, 120)}**`,
    clip(payload.summary, MAX_CONTENT),
    payload.url ? `[打开文档](${payload.url})` : '',
    `> 操作人：${payload.actorName || '系统'}`,
  ].filter(Boolean);

  await postJson(webhook, {
    msgtype: 'markdown',
    markdown: { content: lines.join('\n') },
  });
}

export async function sendFeishu(webhook: string, payload: NotifyPayload): Promise<void> {
  if (!webhook) throw new Error('飞书 webhook 地址为空');
  const elements: unknown[] = [
    { tag: 'div', text: { tag: 'lark_md', content: clip(payload.summary, MAX_CONTENT) } },
  ];
  if (payload.url) {
    elements.push({
      tag: 'action',
      actions: [
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '打开文档' },
          url: payload.url,
          type: 'primary',
        },
      ],
    });
  }
  elements.push({
    tag: 'note',
    elements: [{ tag: 'plain_text', content: `操作人：${payload.actorName || '系统'}` }],
  });

  await postJson(webhook, {
    msg_type: 'interactive',
    card: {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: 'plain_text', content: clip(payload.title, 120) },
        template: 'blue',
      },
      elements,
    },
  });
}

export async function sendEmail(
  smtp: SmtpConfig,
  recipients: string[],
  payload: NotifyPayload
): Promise<void> {
  if (!smtp.host) throw new Error('SMTP 服务器未配置');
  if (recipients.length === 0) throw new Error('收件人为空');

  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    connectionTimeout: DEFAULT_TIMEOUT_MS,
    greetingTimeout: DEFAULT_TIMEOUT_MS,
    socketTimeout: DEFAULT_TIMEOUT_MS,
  });

  const link = payload.url ? `<p><a href="${payload.url}">打开文档</a></p>` : '';
  try {
    await transport.sendMail({
      from: smtp.from || smtp.user || 'wikidoc@localhost',
      to: recipients.join(', '),
      subject: clip(payload.title, 120),
      text: `${payload.summary}\n${payload.url || ''}\n操作人：${payload.actorName || '系统'}`,
      html: `<div><h3>${escapeHtml(payload.title)}</h3><p>${escapeHtml(
        payload.summary
      )}</p>${link}<p style="color:#888">操作人：${escapeHtml(payload.actorName || '系统')}</p></div>`,
    });
  } catch (err) {
    throw new Error(`邮件发送失败：${describe(err)}`);
  } finally {
    transport.close();
  }
}

export async function verifySmtp(smtp: SmtpConfig): Promise<void> {
  if (!smtp.host) throw new Error('SMTP 服务器未配置');
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    connectionTimeout: DEFAULT_TIMEOUT_MS,
    greetingTimeout: DEFAULT_TIMEOUT_MS,
    socketTimeout: DEFAULT_TIMEOUT_MS,
  });
  try {
    await transport.verify();
  } catch (err) {
    throw new Error(`SMTP 连接失败：${describe(err)}`);
  } finally {
    transport.close();
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
