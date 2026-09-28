import { db, getMany, now } from '../db';
import { sendEmail, sendFeishu, sendWecom, type NotifyPayload } from '../integrations/notifiers';
import { getSmtpConfig } from './settings.service';

/**
 * 通知投递编排。文档变更等事件进来后，向所有已启用的渠道并发投递：
 * 单通道失败不影响其他通道，每条发送都写 notification_logs 便于排查。
 *
 * 渠道本身的定义（webhook 地址、收件人）在 notification_channels 表，
 * 由 channel.service 维护；SMTP 服务器参数来自 site_settings。
 */

export type ChannelType = 'wecom' | 'feishu' | 'email';

export interface NotificationChannel {
  id: number;
  name: string;
  type: ChannelType;
  config: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface ChannelConfig {
  webhook?: string;
  recipients?: string[];
}

export interface DeliveryResult {
  channelId: number | null;
  channelName: string;
  type: ChannelType;
  ok: boolean;
  error?: string;
}

export function parseChannelConfig(row: NotificationChannel): ChannelConfig {
  try {
    const parsed = JSON.parse(row.config || '{}') as ChannelConfig;
    return {
      webhook: typeof parsed.webhook === 'string' ? parsed.webhook : '',
      recipients: Array.isArray(parsed.recipients)
        ? parsed.recipients.filter((r): r is string => typeof r === 'string' && r.includes('@'))
        : [],
    };
  } catch {
    return {};
  }
}

function writeLog(
  channelId: number | null,
  eventType: string,
  target: string,
  subject: string,
  status: 'success' | 'failed',
  error?: string
): void {
  try {
    db.prepare(
      `INSERT INTO notification_logs (channel_id, event_type, target, subject, status, error, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(channelId, eventType, target, subject, status, error ?? null, now());
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[notify] 日志写入失败', err);
  }
}

/** 投递到单个渠道。任何异常都收敛成 ok:false + 可读原因，不向外抛 */
export async function deliver(
  channel: NotificationChannel,
  eventType: string,
  payload: NotifyPayload
): Promise<DeliveryResult> {
  const cfg = parseChannelConfig(channel);
  const base: DeliveryResult = {
    channelId: channel.id,
    channelName: channel.name,
    type: channel.type,
    ok: false,
  };

  try {
    if (channel.type === 'wecom') {
      await sendWecom(cfg.webhook || '', payload);
      writeLog(channel.id, eventType, 'wecom', payload.title, 'success');
      return { ...base, ok: true };
    }
    if (channel.type === 'feishu') {
      await sendFeishu(cfg.webhook || '', payload);
      writeLog(channel.id, eventType, 'feishu', payload.title, 'success');
      return { ...base, ok: true };
    }

    const smtp = getSmtpConfig();
    await sendEmail(smtp, cfg.recipients || [], payload);
    writeLog(channel.id, eventType, (cfg.recipients || []).join(', '), payload.title, 'success');
    return { ...base, ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeLog(channel.id, eventType, channel.type, payload.title, 'failed', message);
    return { ...base, ok: false, error: message };
  }
}

/**
 * 事件广播。调用方不需要 await 结果，失败只体现在 notification_logs 里。
 * 没有启用渠道时直接返回，不做任何外部请求。
 */
export async function dispatch(eventType: string, payload: NotifyPayload): Promise<void> {
  const channels = getMany<NotificationChannel>(
    'SELECT * FROM notification_channels WHERE enabled = 1 ORDER BY id'
  );
  if (channels.length === 0) return;

  const results = await Promise.allSettled(
    channels.map((channel) => deliver(channel, eventType, payload))
  );

  const failed = results.filter(
    (r): r is PromiseRejectedResult => r.status === 'rejected'
  );
  if (failed.length > 0) {
    // eslint-disable-next-line no-console
    console.error('[notify] 投递异常', failed.map((f) => String(f.reason)).join(' | '));
  }
}

/** 管理端"测试发送"：只发给指定渠道，同步返回成功与失败原因 */
export async function sendTest(
  channelId: number,
  eventType = 'notification.test'
): Promise<DeliveryResult> {
  const channel = db
    .prepare('SELECT * FROM notification_channels WHERE id = ?')
    .get(channelId) as NotificationChannel | undefined;

  if (!channel) {
    writeLog(channelId, eventType, '-', '', 'failed', '渠道不存在');
    return { channelId, channelName: '', type: 'wecom', ok: false, error: '渠道不存在' };
  }

  return deliver(channel, eventType, {
    title: `WikiDoc 通知测试：${channel.name}`,
    summary: '这是一条由管理员在设置页触发的测试通知，收到即表示渠道配置正确。',
    actorName: '系统',
  });
}
