import { request } from './client';

/** 站点设置（读为脱敏值，PUT 遇掩码自动跳过） */
export async function getSettings(): Promise<{ settings: Record<string, string> }> {
  return request<{ settings: Record<string, string> }>('/api/settings');
}

export async function updateSettings(patch: Record<string, string>): Promise<{ settings: Record<string, string> }> {
  return request<{ settings: Record<string, string> }>('/api/settings', {
    method: 'PUT',
    body: patch,
  });
}

export async function testSmtp(input: Record<string, string>): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/api/settings/test/smtp', { method: 'POST', body: input });
}

export async function testLdap(): Promise<{ ok: boolean; sample?: number }> {
  return request<{ ok: boolean; sample?: number }>('/api/settings/test/ldap', { method: 'POST' });
}
