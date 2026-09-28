import { db, getMany, now } from '../db';
import { AppError } from '../utils/errors';
import type { ChannelConfig, ChannelType, NotificationChannel } from './notify.service';
import { parseChannelConfig } from './notify.service';

/**
 * 通知渠道与订阅的管理面：渠道增删改、订阅整体替换、发送日志查询。
 * 实际投递走 notify.service，这里只管数据。
 */

const CHANNEL_TYPES: ChannelType[] = ['wecom', 'feishu', 'email'];

/** 事件类型枚举，前端订阅表与投递入口共用，避免字符串漂移 */
export const NOTIFY_EVENTS = [
  'document.created',
  'document.updated',
  'document.published',
  'document.deleted',
  'space.created',
  'permission.updated',
  'import.finished',
  'user.created',
] as const;

export interface ChannelInput {
  name: string;
  type: ChannelType;
  config: ChannelConfig;
  enabled?: boolean;
}

export interface ChannelView {
  id: number;
  name: string;
  type: ChannelType;
  config: ChannelConfig;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

function toView(row: NotificationChannel): ChannelView {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    config: parseChannelConfig(row),
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertType(type: string): ChannelType {
  if (!CHANNEL_TYPES.includes(type as ChannelType)) {
    throw AppError.badRequest('渠道类型必须是 wecom / feishu / email 之一');
  }
  return type as ChannelType;
}

function assertChannelExists(id: number): NotificationChannel {
  const row = db.prepare('SELECT * FROM notification_channels WHERE id = ?').get(id) as
    | NotificationChannel
    | undefined;
  if (!row) throw AppError.notFound('通知渠道不存在');
  return row;
}

export function listChannels(): ChannelView[] {
  return getMany<NotificationChannel>('SELECT * FROM notification_channels ORDER BY id').map(toView);
}

export function createChannel(input: ChannelInput): ChannelView {
  const type = assertType(input.type);
  const name = (input.name || '').trim();
  if (!name) throw AppError.badRequest('渠道名称不能为空');

  const info = db
    .prepare(
      `INSERT INTO notification_channels (name, type, config, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(name, type, JSON.stringify(input.config || {}), input.enabled === false ? 0 : 1, now(), now());

  return toView(assertChannelExists(Number(info.lastInsertRowid)));
}

export function updateChannel(
  id: number,
  patch: Partial<ChannelInput>
): ChannelView {
  const current = assertChannelExists(id);
  const name = patch.name !== undefined ? (patch.name || '').trim() : current.name;
  if (!name) throw AppError.badRequest('渠道名称不能为空');
  const type = patch.type !== undefined ? assertType(patch.type) : current.type;
  const config =
    patch.config !== undefined ? JSON.stringify(patch.config) : current.config;
  const enabled =
    patch.enabled === undefined ? current.enabled : patch.enabled ? 1 : 0;

  db.prepare(
    `UPDATE notification_channels SET name = ?, type = ?, config = ?, enabled = ?, updated_at = ?
     WHERE id = ?`
  ).run(name, type, config, enabled, now(), id);

  return toView(assertChannelExists(id));
}

export function deleteChannel(id: number): void {
  assertChannelExists(id);
  db.prepare('DELETE FROM notification_channels WHERE id = ?').run(id);
}

export interface SubscriptionInput {
  channelId: number;
  eventType: string;
  enabled?: boolean;
}

export function listSubscriptions(userId: number): SubscriptionInput[] {
  return getMany<{ channel_id: number; event_type: string; enabled: number }>(
    'SELECT channel_id, event_type, enabled FROM notification_subscriptions WHERE user_id = ? ORDER BY id',
    [userId]
  ).map((r) => ({ channelId: r.channel_id, eventType: r.event_type, enabled: r.enabled === 1 }));
}

/** 整体替换某个用户的订阅，避免残留幽灵订阅 */
export function replaceSubscriptions(userId: number, items: SubscriptionInput[]): SubscriptionInput[] {
  for (const item of items) {
    assertChannelExists(item.channelId);
    if (!NOTIFY_EVENTS.includes(item.eventType as (typeof NOTIFY_EVENTS)[number])) {
      throw AppError.badRequest(`事件类型不合法：${item.eventType}`);
    }
  }

  db.transaction(() => {
    db.prepare('DELETE FROM notification_subscriptions WHERE user_id = ?').run(userId);
    const insert = db.prepare(
      `INSERT INTO notification_subscriptions (user_id, channel_id, event_type, enabled, created_at)
       VALUES (?, ?, ?, ?, ?)`
    );
    for (const item of items) {
      insert.run(userId, item.channelId, item.eventType, item.enabled === false ? 0 : 1, now());
    }
  })();

  return listSubscriptions(userId);
}

export interface LogQuery {
  page: number;
  limit: number;
  offset: number;
  status?: 'success' | 'failed';
  eventType?: string;
  channelId?: number;
}

export interface LogView {
  id: number;
  channelId: number | null;
  channelName: string | null;
  eventType: string;
  target: string | null;
  subject: string | null;
  status: string;
  error: string | null;
  sentAt: string;
}

export function listLogs(q: LogQuery): { items: LogView[]; total: number } {
  const where: string[] = [];
  const params: unknown[] = [];

  if (q.status) {
    where.push('l.status = ?');
    params.push(q.status);
  }
  if (q.eventType) {
    where.push('l.event_type = ?');
    params.push(q.eventType);
  }
  if (q.channelId !== undefined) {
    where.push('l.channel_id = ?');
    params.push(q.channelId);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (
    db
      .prepare(`SELECT COUNT(*) AS c FROM notification_logs l ${clause}`)
      .get(...(params as never[])) as { c: number }
  ).c;

  const rows = getMany<{
    id: number;
    channel_id: number | null;
    channel_name: string | null;
    event_type: string;
    target: string | null;
    subject: string | null;
    status: string;
    error: string | null;
    sent_at: string;
  }>(
    `SELECT l.id, l.channel_id, c.name AS channel_name, l.event_type, l.target, l.subject,
            l.status, l.error, l.sent_at
     FROM notification_logs l
     LEFT JOIN notification_channels c ON c.id = l.channel_id
     ${clause}
     ORDER BY l.id DESC LIMIT ? OFFSET ?`,
    [...params, q.limit, q.offset]
  );

  return {
    total,
    items: rows.map((r) => ({
      id: r.id,
      channelId: r.channel_id,
      channelName: r.channel_name,
      eventType: r.event_type,
      target: r.target,
      subject: r.subject,
      status: r.status,
      error: r.error,
      sentAt: r.sent_at,
    })),
  };
}
