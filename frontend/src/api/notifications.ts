import { request } from './client';
import type { NotificationChannel, NotificationSubscription } from '../types/api';

export async function listEvents(): Promise<{ items: string[] }> {
  return request<{ items: string[] }>('/api/notifications/events');
}

export async function listChannels(): Promise<{ items: NotificationChannel[] }> {
  return request<{ items: NotificationChannel[] }>('/api/notifications/channels');
}

export async function createChannel(input: {
  name: string;
  type: 'wecom' | 'feishu' | 'email';
  config: { webhook?: string; recipients?: string[] };
  enabled?: boolean;
}): Promise<{ channel: NotificationChannel }> {
  return request<{ channel: NotificationChannel }>('/api/notifications/channels', {
    method: 'POST',
    body: input,
  });
}

export async function updateChannel(
  id: number,
  input: { name?: string; config?: { webhook?: string; recipients?: string[] }; enabled?: boolean }
): Promise<{ channel: NotificationChannel }> {
  return request<{ channel: NotificationChannel }>(`/api/notifications/channels/${id}`, {
    method: 'PUT',
    body: input,
  });
}

export async function deleteChannel(id: number): Promise<null> {
  return request<null>(`/api/notifications/channels/${id}`, { method: 'DELETE' });
}

export async function testChannel(id: number): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/notifications/channels/${id}/test`, { method: 'POST' });
}

export async function listSubscriptions(): Promise<{ items: NotificationSubscription[] }> {
  return request<{ items: NotificationSubscription[] }>('/api/notifications/subscriptions');
}

export async function replaceSubscriptions(
  items: { channelId: number; eventType: string; enabled?: boolean }[]
): Promise<{ items: NotificationSubscription[] }> {
  return request<{ items: NotificationSubscription[] }>('/api/notifications/subscriptions', {
    method: 'PUT',
    body: { items },
  });
}
